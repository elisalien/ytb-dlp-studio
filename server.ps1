# yt-dlp Studio - serveur local (http://127.0.0.1:8765/)
# Sert index.html, lance yt-dlp (telechargements) et ffmpeg (conversions locales).
# Ecoute UNIQUEMENT en local. Chaque appel /api exige le jeton injecte dans la page
# (une page web tierce ne peut pas le lire) + un en-tete Host local (anti DNS rebinding).
# Les arguments sont construits ICI a partir d'options en liste blanche :
# le navigateur n'envoie jamais de ligne de commande brute, et aucun shell n'est utilise.
# Fichier en ASCII pur (PowerShell 5.1 lit les .ps1 en ANSI) : les accents des
# messages affiches dans la page passent par U '\u00e9'.
param(
    [int]$Port = 8765,
    [switch]$NoBrowser,
    [switch]$NoUpdate
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try { $Host.UI.RawUI.WindowTitle = 'yt-dlp Studio - serveur (fermer = arreter)' } catch {}

$Root = $PSScriptRoot
$Bin = Join-Path $Root 'bin'
$Ytdlp = Join-Path $Bin 'yt-dlp.exe'
$SettingsPath = Join-Path $Root 'settings.json'
$DefaultDest = Join-Path $Root ('T' + [char]0xE9 + 'l' + [char]0xE9 + 'chargements')
$BaseUrl = "http://127.0.0.1:$Port/"
$Token = [guid]::NewGuid().ToString('N')

function Log([string]$msg) { Write-Host ((Get-Date -Format 'HH:mm:ss') + '  ' + $msg) }
function U([string]$s) { return [regex]::Unescape($s) }

# Ouvre l'interface dans un vrai navigateur (pas l'editeur associe aux .html).
# Firefox d'abord : les cookies YouTube sont lus dans Firefox par defaut.
function Open-Ui {
    if ($NoBrowser) { return }
    $candidates = New-Object 'System.Collections.Generic.List[string]'
    $candidates.AddRange([string[]]@(
        "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe",
        "$env:LocalAppData\Mozilla Firefox\firefox.exe"))
    try {
        $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice').ProgId
        $cmd = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command").'(default)'
        if ($cmd -match '"([^"]+\.exe)"') { $candidates.Add($Matches[1]) }
    } catch {}
    $candidates.AddRange([string[]]@(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"))
    $exe = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    try {
        if ($exe) { Start-Process -FilePath $exe -ArgumentList $BaseUrl } else { Start-Process $BaseUrl }
    } catch {
        Log "Ouvrez $BaseUrl dans votre navigateur."
    }
}

# --- Deja lance ? On rouvre juste l'interface ---
try {
    $r = Invoke-WebRequest -Uri ($BaseUrl + 'api/ping') -UseBasicParsing -TimeoutSec 2
    if ($r.Content -match 'yt-dlp-studio') {
        Log 'yt-dlp Studio tourne deja : ouverture de l''interface.'
        Open-Ui
        exit 0
    }
} catch {}

# ============================================================================
#  C# : file d'attente (processus + lecture de la progression) et selecteur
#  de fichier / dossier Windows moderne. Compile une fois au demarrage (~1 s).
# ============================================================================
$cs = @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace YtdlpStudio
{
    public class Job
    {
        public int Id;
        public string Exe = "", Label = "", Kind = "", Dir = "", CommandLine = "", Output = "";
        public string Status = "queued", Title = "", LastFile = "", LastError = "";
        public double Percent = -1, Speed = -1, Duration;
        public int Eta = -1, ItemIndex, ItemCount, Started, FilesDone;
        public Process Proc;
        public bool CancelRequested;
        public List<string> Log = new List<string>();
    }

    public class JobQueue
    {
        const int LogKeep = 300, LogSent = 40;
        readonly object gate = new object();
        readonly List<Job> jobs = new List<Job>();
        readonly AutoResetEvent signal = new AutoResetEvent(false);
        readonly string workDir, pathEnv;
        int nextId = 1, rev;
        bool paused;

        public JobQueue(string workDir, string pathEnv, bool startPaused)
        {
            this.workDir = workDir; this.pathEnv = pathEnv; this.paused = startPaused;
            Thread t = new Thread(Loop);
            t.IsBackground = true;
            t.Start();
        }

        public bool Paused { get { lock (gate) { return paused; } } }

        // Incrementee a chaque changement : la page ne recoit la liste que si elle a bouge.
        public int Revision { get { lock (gate) { return rev; } } }

        public void Resume() { lock (gate) { paused = false; rev++; } signal.Set(); }

        public static string Quote(string a) { return QuoteCore(a, false); }

        static string QuoteCore(string a, bool force)
        {
            if (!force && a.Length > 0 && a.IndexOfAny(new char[] { ' ', '\t', '"', '\n', '\v' }) < 0) return a;
            StringBuilder sb = new StringBuilder("\"");
            int bs = 0;
            foreach (char c in a)
            {
                if (c == '\\') { bs++; continue; }
                if (c == '"') { sb.Append('\\', bs * 2 + 1); sb.Append('"'); bs = 0; continue; }
                sb.Append('\\', bs); bs = 0; sb.Append(c);
            }
            sb.Append('\\', bs * 2);
            sb.Append('"');
            return sb.ToString();
        }

        public static string JoinArgs(string[] args)
        {
            string[] q = new string[args.Length];
            for (int i = 0; i < args.Length; i++) q[i] = Quote(args[i]);
            return string.Join(" ", q);
        }

        // Version a coller dans cmd : on met aussi entre guillemets < > | & ^ ( ) etc.
        public static string JoinArgsForCmd(string[] args)
        {
            char[] special = " \t\"<>|&^()%!;,=".ToCharArray();
            string[] q = new string[args.Length];
            for (int i = 0; i < args.Length; i++) q[i] = QuoteCore(args[i], args[i].IndexOfAny(special) >= 0);
            return string.Join(" ", q);
        }

        public int Add(string exe, string label, string kind, string dir, string[] args, int itemCount, double duration, string output)
        {
            Job j = new Job();
            j.Exe = exe; j.Label = label; j.Kind = kind; j.Dir = dir; j.ItemCount = itemCount;
            j.Duration = duration; j.Output = output;
            if (kind == "convert") j.Title = Path.GetFileName(output);
            j.CommandLine = JoinArgs(args);
            lock (gate) { j.Id = nextId++; jobs.Add(j); rev++; }
            signal.Set();
            return j.Id;
        }

        public bool Cancel(int id)
        {
            int pid = 0;
            lock (gate)
            {
                Job j = jobs.Find(delegate (Job x) { return x.Id == id; });
                if (j == null) return false;
                rev++;
                if (j.Status == "queued") { j.Status = "canceled"; return true; }
                if (j.Status != "running") return false;
                j.CancelRequested = true;
                if (j.Proc != null) { try { pid = j.Proc.Id; } catch { pid = 0; } }
            }
            if (pid > 0) KillTree(pid);
            return true;
        }

        public void CancelAll()
        {
            List<int> ids = new List<int>();
            lock (gate) { foreach (Job j in jobs) if (IsActive(j)) ids.Add(j.Id); }
            foreach (int id in ids) Cancel(id);
        }

        public void ClearFinished()
        {
            lock (gate) { jobs.RemoveAll(delegate (Job j) { return !IsActive(j); }); rev++; }
        }

        static bool IsActive(Job j) { return j.Status == "queued" || j.Status == "running"; }

        static void Say(string msg) { Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + "  " + msg); }

        static void KillTree(int pid)
        {
            // yt-dlp lance ffmpeg : taskkill /T tue tout l'arbre de processus.
            try
            {
                ProcessStartInfo k = new ProcessStartInfo("taskkill", "/PID " + pid + " /T /F");
                k.UseShellExecute = false; k.CreateNoWindow = true;
                using (Process kp = Process.Start(k)) kp.WaitForExit(8000);
            }
            catch { }
        }

        void Loop()
        {
            while (true)
            {
                Job next = null;
                lock (gate)
                {
                    if (!paused) next = jobs.Find(delegate (Job j) { return j.Status == "queued"; });
                }
                if (next == null) { signal.WaitOne(1000); continue; }
                Run(next);
            }
        }

        void Run(Job j)
        {
            lock (gate)
            {
                if (j.Status != "queued") return;
                j.Status = "running";
                rev++;
            }
            Say("[#" + j.Id + "] demarrage : " + j.Label);

            ProcessStartInfo psi = new ProcessStartInfo(j.Exe, j.CommandLine);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;
            psi.StandardErrorEncoding = Encoding.UTF8;
            psi.WorkingDirectory = workDir;
            psi.EnvironmentVariables["PATH"] = pathEnv;
            psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            psi.EnvironmentVariables["PYTHONUTF8"] = "1";

            Process p = new Process();
            p.StartInfo = psi;
            p.OutputDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) OnLine(j, e.Data); };
            p.ErrorDataReceived += delegate (object s, DataReceivedEventArgs e) { if (e.Data != null) OnLine(j, e.Data); };

            try
            {
                if (!File.Exists(j.Exe)) throw new FileNotFoundException(Path.GetFileName(j.Exe) + " introuvable (lancez install.bat)");
                Directory.CreateDirectory(j.Dir);
                p.Start();
            }
            catch (Exception ex)
            {
                lock (gate) { j.Status = "error"; j.LastError = ex.Message; rev++; }
                Say("[#" + j.Id + "] ERREUR : " + ex.Message);
                p.Dispose();
                return;
            }

            bool killNow;
            lock (gate) { j.Proc = p; killNow = j.CancelRequested; }
            if (killNow) KillTree(p.Id);
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            p.WaitForExit();

            lock (gate)
            {
                j.Proc = null;
                if (j.CancelRequested) j.Status = "canceled";
                else if (p.ExitCode == 0)
                {
                    j.Status = "done"; j.Percent = 100;
                    if (j.Output.Length > 0) { j.FilesDone = 1; j.LastFile = j.Output; }
                }
                else if (j.FilesDone > 0) j.Status = "partial";
                else j.Status = "error";
                // ffmpeg n'ecrit pas "ERROR:" : la derniere ligne du journal explique l'echec.
                if (j.Status != "done" && j.LastError.Length == 0 && j.Log.Count > 0) j.LastError = j.Log[j.Log.Count - 1];
                j.Speed = -1; j.Eta = -1;
                rev++;
            }
            p.Dispose();
            Say("[#" + j.Id + "] " + j.Status + " (" + j.FilesDone + " fichier(s))");
        }

        static double Num(string s)
        {
            double d;
            if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return d;
            return -1;
        }

        void OnLine(Job j, string line)
        {
            lock (gate)
            {
                rev++;
                if (j.Kind == "convert" ? FfmpegProgress(j, line) : YtdlpProgress(j, line)) return;
                if (line.StartsWith("ERROR:")) j.LastError = line;
                j.Log.Add(line);
                if (j.Log.Count > LogKeep) j.Log.RemoveRange(0, j.Log.Count - LogKeep);
            }
        }

        // Lignes machine de yt-dlp (voir $UiArgs dans server.ps1). true = ligne consommee.
        static bool YtdlpProgress(Job j, string line)
        {
            if (line.StartsWith("@@P|"))
            {
                // downloaded|total|estimate|speed|eta
                string[] f = line.Split('|');
                if (f.Length >= 6)
                {
                    double done = Num(f[1]), total = Num(f[2]), est = Num(f[3]);
                    if (total <= 0) total = est;
                    if (done >= 0 && total > 0) j.Percent = Math.Min(100.0, done * 100.0 / total);
                    j.Speed = Num(f[4]);
                    double eta = Num(f[5]);
                    j.Eta = eta >= 0 ? (int)eta : -1;
                }
                return true;
            }
            if (line.StartsWith("@@T|"))
            {
                // playlist_index|n_entries|title
                string[] f = line.Split(new char[] { '|' }, 4);
                if (f.Length == 4)
                {
                    int idx, n;
                    j.Started++;
                    j.ItemIndex = int.TryParse(f[1], out idx) ? idx : j.Started;
                    if (int.TryParse(f[2], out n) && n > 0) j.ItemCount = n;
                    j.Title = f[3];
                    j.Percent = 0;
                }
                return true;
            }
            if (line.StartsWith("@@F|"))
            {
                j.FilesDone++;
                j.LastFile = line.Substring(4);
                return true;
            }
            return false;
        }

        // ffmpeg -progress pipe:1 : lignes "cle=valeur" sans espace.
        static bool FfmpegProgress(Job j, string line)
        {
            int eq = line.IndexOf('=');
            if (eq <= 0 || line.IndexOf(' ') >= 0) return false;
            string key = line.Substring(0, eq), val = line.Substring(eq + 1);
            if ((key == "out_time_us" || key == "out_time_ms") && j.Duration > 0)
            {
                double us = Num(val);
                if (us >= 0) j.Percent = Math.Min(100.0, us / 1e4 / j.Duration);
            }
            else if (key == "speed" && j.Duration > 0 && j.Percent >= 0)
            {
                double x = Num(val.TrimEnd('x'));
                if (x > 0) j.Eta = (int)(j.Duration * (100.0 - j.Percent) / 100.0 / x);
            }
            return true;
        }

        public ArrayList Snapshot()
        {
            ArrayList list = new ArrayList();
            lock (gate)
            {
                foreach (Job j in jobs)
                {
                    Hashtable h = new Hashtable();
                    h["id"] = j.Id; h["label"] = j.Label; h["kind"] = j.Kind; h["dir"] = j.Dir; h["status"] = j.Status;
                    h["percent"] = Math.Round(j.Percent, 1); h["speed"] = Math.Round(j.Speed); h["eta"] = j.Eta;
                    h["title"] = j.Title; h["itemIndex"] = j.ItemIndex; h["itemCount"] = j.ItemCount;
                    h["filesDone"] = j.FilesDone; h["lastFile"] = j.LastFile; h["lastError"] = j.LastError;
                    int from = Math.Max(0, j.Log.Count - LogSent);
                    h["log"] = j.Log.GetRange(from, j.Log.Count - from).ToArray();
                    list.Add(h);
                }
            }
            return list;
        }
    }

    // ------------------------------------------------------------------------
    // Selecteur Windows (IFileOpenDialog) : dossier (FOS_PICKFOLDERS) ou fichier
    // ------------------------------------------------------------------------
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    class FileOpenDialogRCW { }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
        void GetResults(out IShellItemArray ppenum);
        void GetSelectedItems(out IntPtr ppsai);
    }

    [ComImport, Guid("B63EA76D-1F85-456F-A19C-48159EFA858B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItemArray
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppvOut);
        void GetPropertyStore(int flags, ref Guid riid, out IntPtr ppv);
        void GetPropertyDescriptionList(IntPtr keyType, ref Guid riid, out IntPtr ppv);
        void GetAttributes(int attribFlags, uint sfgaoMask, out uint psfgaoAttribs);
        void GetCount(out uint pdwNumItems);
        void GetItemAt(uint dwIndex, out IShellItem ppsi);
        void EnumItems(out IntPtr ppenumShellItems);
    }

    public static class ShellPicker
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        static extern int SHCreateItemFromParsingName([MarshalAs(UnmanagedType.LPWStr)] string pszPath, IntPtr pbc,
            [In] ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

        // Dossier : un seul chemin. Fichiers : selection multiple. Annule : tableau vide.
        public static string[] Pick(string title, string initial, bool folders)
        {
            string[] result = new string[0];
            Exception error = null;
            Thread t = new Thread(delegate ()
            {
                try { result = PickSta(title, initial, folders); } catch (Exception ex) { error = ex; }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join();
            if (error != null) throw error;
            return result;
        }

        static string PathOf(IShellItem item)
        {
            string path;
            item.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
            return path;
        }

        static string[] PickSta(string title, string initial, bool folders)
        {
            // Fenetre proprietaire invisible et "au premier plan" : sans elle, la boite
            // de dialogue s'ouvre souvent DERRIERE le navigateur.
            Form owner = new Form();
            owner.ShowInTaskbar = false;
            owner.FormBorderStyle = FormBorderStyle.None;
            owner.StartPosition = FormStartPosition.Manual;
            owner.Opacity = 0;
            owner.TopMost = true;
            System.Drawing.Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            owner.Bounds = new System.Drawing.Rectangle(wa.Left + wa.Width / 2, wa.Top + wa.Height / 3, 1, 1);
            owner.Show();
            owner.Activate();

            IFileOpenDialog dlg = (IFileOpenDialog)new FileOpenDialogRCW();
            try
            {
                uint opts;
                dlg.GetOptions(out opts);
                // FORCEFILESYSTEM | PATHMUSTEXIST, puis PICKFOLDERS ou FILEMUSTEXIST | ALLOWMULTISELECT
                dlg.SetOptions(opts | 0x40 | 0x800 | (folders ? 0x20u : (0x1000u | 0x200u)));
                dlg.SetTitle(title);
                string start = null;
                try { start = Directory.Exists(initial) ? initial : Path.GetDirectoryName(initial); } catch { }
                if (!string.IsNullOrEmpty(start) && Directory.Exists(start))
                {
                    IShellItem folder;
                    Guid iid = typeof(IShellItem).GUID;
                    if (SHCreateItemFromParsingName(start, IntPtr.Zero, ref iid, out folder) == 0) dlg.SetFolder(folder);
                }
                if (dlg.Show(owner.Handle) != 0) return new string[0]; // annule
                if (folders)
                {
                    IShellItem item;
                    dlg.GetResult(out item);
                    return new string[] { PathOf(item) };
                }
                IShellItemArray items;
                dlg.GetResults(out items);
                uint count;
                items.GetCount(out count);
                string[] paths = new string[count];
                for (uint i = 0; i < count; i++)
                {
                    IShellItem one;
                    items.GetItemAt(i, out one);
                    paths[i] = PathOf(one);
                }
                return paths;
            }
            finally
            {
                Marshal.ReleaseComObject(dlg);
                owner.Close();
                owner.Dispose();
            }
        }
    }
}
'@

if (-not ('YtdlpStudio.JobQueue' -as [type])) {
    Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Windows.Forms, System.Drawing
}

# ============================================================================
#  Options en liste blanche et reglages persistants (settings.json)
# ============================================================================
$Profiles = @('maxcompat', 'best', '2160', '1440', '1080', 'hap', 'hapq', 'mp3', 'frames')
$Browsers = @('firefox', 'chrome', 'edge', 'brave', 'chromium', 'opera', 'vivaldi')

# Conversions locales (onglet Convertir).
#   kind  : video | audio | image       suffix : ajoute au nom du fichier source
#   args  : codec principal             q      : arguments par qualite (haute, equilibree, legere)
#   audio : codec audio des videos      aq     : debit audio par qualite
#   mult  : dimensions multiples de (H.264, H.265, VP9, ProRes : 2 ; HAP : 4)
$Qualities = @('high', 'balanced', 'small')
$AacQ = @('-b:a', '320k'), @('-b:a', '192k'), @('-b:a', '128k')
$Presets = [ordered]@{
    h264     = @{ kind = 'video'; suffix = '-h264.mp4'; mult = 2; audio = @('-c:a', 'aac'); aq = $AacQ
                  args = @('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart')
                  q = @('-preset', 'slow', '-crf', '18'), @('-preset', 'medium', '-crf', '21'), @('-preset', 'medium', '-crf', '26') }
    h265     = @{ kind = 'video'; suffix = '-h265.mp4'; mult = 2; audio = @('-c:a', 'aac'); aq = $AacQ
                  args = @('-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart', '-x265-params', 'log-level=error')
                  q = @('-preset', 'slow', '-crf', '20'), @('-preset', 'medium', '-crf', '24'), @('-preset', 'medium', '-crf', '28') }
    vp9      = @{ kind = 'video'; suffix = '.webm'; mult = 2; audio = @('-c:a', 'libopus'); aq = @('-b:a', '192k'), @('-b:a', '128k'), @('-b:a', '96k')
                  args = @('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-row-mt', '1', '-deadline', 'good')
                  q = @('-crf', '24', '-cpu-used', '1'), @('-crf', '31', '-cpu-used', '2'), @('-crf', '37', '-cpu-used', '4') }
    prores   = @{ kind = 'video'; suffix = '-prores.mov'; mult = 2; audio = @('-c:a', 'pcm_s16le')
                  args = @('-c:v', 'prores_ks', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0')
                  q = @('-profile:v', '3'), @('-profile:v', '2'), @('-profile:v', '1') }
    hap      = @{ kind = 'video'; suffix = '-hap.mov'; mult = 4; audio = @('-c:a', 'pcm_s16le'); args = @('-c:v', 'hap', '-format', 'hap', '-chunks', '4') }
    hapalpha = @{ kind = 'video'; suffix = '-hapa.mov'; mult = 4; audio = @('-c:a', 'pcm_s16le'); args = @('-c:v', 'hap', '-format', 'hap_alpha', '-chunks', '4') }
    hapq     = @{ kind = 'video'; suffix = '-hapq.mov'; mult = 4; audio = @('-c:a', 'pcm_s16le'); args = @('-c:v', 'hap', '-format', 'hap_q', '-chunks', '4') }
    mp3      = @{ kind = 'audio'; suffix = '.mp3'; args = @('-c:a', 'libmp3lame'); q = @('-q:a', '0'), @('-q:a', '2'), @('-q:a', '5') }
    aac      = @{ kind = 'audio'; suffix = '.m4a'; args = @('-c:a', 'aac', '-movflags', '+faststart'); q = @('-b:a', '256k'), @('-b:a', '192k'), @('-b:a', '128k') }
    wav      = @{ kind = 'audio'; suffix = '.wav'; args = @('-c:a', 'pcm_s16le') }
    flac     = @{ kind = 'audio'; suffix = '.flac'; args = @('-c:a', 'flac') }
    gif      = @{ kind = 'image'; suffix = '.gif'; args = @(); colors = @(256, 160, 96) }
    png      = @{ kind = 'image'; suffix = '-frames'; args = @() }
}
$Scales = @('', '3840', '2560', '1920', '1280', '854', '640', '480')
$FrameRates = @('', '60', '50', '30', '25', '24', '15', '12')
$Rotations = @('', 'cw', 'ccw', '180', 'hflip')
$AudioModes = @('keep', 'norm', 'mute')
$Inv = [Globalization.CultureInfo]::InvariantCulture
$Float = [Globalization.NumberStyles]::Float

function New-DefaultSettings {
    return [ordered]@{
        dest          = $DefaultDest
        profile       = 'maxcompat'
        playlist      = $false
        groupBatch    = $true
        cookies       = $true
        browser       = 'firefox'
        ffmpeg        = ''
        convPreset    = 'h264'
        convQuality   = 'balanced'
        convScale     = ''
        convFps       = ''
        convRotate    = ''
        convAudio     = 'keep'
        convOutDir    = ''
        convOverwrite = $false
    }
}

function Read-Settings {
    $s = New-DefaultSettings
    if (Test-Path -LiteralPath $SettingsPath) {
        try {
            $j = [IO.File]::ReadAllText($SettingsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
            foreach ($k in @($s.Keys)) {
                if ($null -ne $j.PSObject.Properties[$k]) { $s[$k] = $j.$k }
            }
        } catch {
            Log 'settings.json illisible : reglages par defaut.'
        }
    }
    return $s
}

function Save-Settings($s) {
    [IO.File]::WriteAllText($SettingsPath, (ConvertTo-Json -InputObject $s), (New-Object Text.UTF8Encoding $false))
}

# Fusionne les options recues du navigateur dans les reglages, avec validation.
function Merge-Options($settings, $body) {
    $s = [ordered]@{}
    foreach ($k in $settings.Keys) { $s[$k] = $settings[$k] }
    if ($null -eq $body) { return $s }
    $p = $body.PSObject.Properties
    foreach ($k in 'dest', 'ffmpeg', 'convOutDir') {
        if ($p[$k]) { $s[$k] = ([string]$body.$k).Trim().Trim('"') }
    }
    foreach ($k in 'playlist', 'groupBatch', 'cookies', 'convOverwrite') {
        if ($p[$k]) { $s[$k] = [bool]$body.$k }
    }
    $allowed = @{
        profile = $Profiles; browser = $Browsers; convPreset = @($Presets.Keys); convQuality = $Qualities
        convScale = $Scales; convFps = $FrameRates; convRotate = $Rotations; convAudio = $AudioModes
    }
    foreach ($k in $allowed.Keys) {
        if ($p[$k] -and ($allowed[$k] -contains [string]$body.$k)) { $s[$k] = [string]$body.$k }
    }
    return $s
}

# Chemin complet Windows : C:\... ou \\serveur\partage\...
function Test-FullPath([string]$path) {
    return ($path -match '^([A-Za-z]:\\|\\\\[^\\]+\\[^\\]+)') -and ($path.IndexOfAny([IO.Path]::GetInvalidPathChars()) -lt 0)
}

function Get-FfmpegExe($s) {
    if (-not $s.ffmpeg) { return (Join-Path $Bin 'ffmpeg.exe') }
    if ([IO.Directory]::Exists($s.ffmpeg)) { return (Join-Path $s.ffmpeg 'ffmpeg.exe') }
    return $s.ffmpeg
}

# L'encodeur HAP n'existe que dans la build "full" de FFmpeg (update.ps1 l'installe).
# Seul un resultat positif est memorise : update.ps1 peut remplacer ffmpeg pendant que le serveur tourne.
$HapSupport = @{}
$NoHapMessage = 'Cette version de FFmpeg ne sait pas encoder en HAP : lancez update.bat (installe la build compl\u00e8te).'
function Test-HapEncoder([string]$ffmpegExe) {
    if ($HapSupport[$ffmpegExe]) { return $true }
    $list = ''
    try { $list = & $ffmpegExe -hide_banner -encoders | Out-String } catch {}
    $HapSupport[$ffmpegExe] = $list -match '\bhap\b'
    return $HapSupport[$ffmpegExe]
}

# ============================================================================
#  Telechargements : construction des commandes yt-dlp
# ============================================================================
function Get-FormatAvoidAv1([string]$cap) {
    # Prefere H.264, puis VP9 - pas AV1 (souvent 403 CDN).
    if ($cap -eq 'best') { return 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec!=av01]+ba/b' }
    return "bv*[vcodec^=avc1][height<=$cap]+ba[acodec^=mp4a]/bv*[vcodec!=av01][height<=$cap]+ba/b[height<=$cap]/b[height<=$cap]"
}

function Get-BaseArgs($s) {
    $a = New-Object 'System.Collections.Generic.List[string]'
    if ($s.ffmpeg) { $a.Add('--ffmpeg-location'); $a.Add($s.ffmpeg) }

    # Anti-403 YouTube (sept. 2026) : client tv + cookies, Deno pour les challenges JS.
    # Voir yt-dlp#17348 / #17456 : default -> visionos/android_vr exigent un PO token.
    $a.AddRange([string[]]@('--js-runtimes', 'deno',
            '--extractor-args', 'youtube:player_client=tv,default,-android_vr,-visionos',
            '--retries', '10', '--fragment-retries', '10', '--retry-sleep', 'fragment:linear=1:8'))
    if ($s.cookies) { $a.Add('--cookies-from-browser'); $a.Add($s.browser) }

    $profileArgs = switch ($s.profile) {
        'mp3' { @('-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0') }
        'hap' { @('-f', (Get-FormatAvoidAv1 'best'), '--recode-video', 'mov', '--postprocessor-args', 'VideoConvertor:-c:v hap -format hap -c:a pcm_s16le') }
        'hapq' { @('-f', (Get-FormatAvoidAv1 'best'), '--recode-video', 'mov', '--postprocessor-args', 'VideoConvertor:-c:v hap -format hap_q -c:a pcm_s16le') }
        'maxcompat' { @('-f', 'bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[ext=mp4][height<=1080]/bv*[height<=1080][vcodec!=av01]+ba/b[height<=1080]/b', '--merge-output-format', 'mp4') }
        # Video <=1080p puis extraction PNG via extract-frames.bat (sur le PATH)
        'frames' { @('-f', (Get-FormatAvoidAv1 '1080'), '--merge-output-format', 'mp4', '--exec', 'extract-frames.bat %(filepath)q') }
        default { @('-f', (Get-FormatAvoidAv1 $s.profile), '--merge-output-format', 'mp4') }
    }
    $a.AddRange([string[]]$profileArgs)
    return , $a
}

# Lignes machine lues par JobQueue.YtdlpProgress (progression, debut d'element, fichier fini).
$UiArgs = @(
    '--newline', '--color', 'never',
    '--progress-template', 'download:@@P|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '--print', 'before_dl:@@T|%(playlist_index|)s|%(n_entries|)s|%(title)s',
    '--print', 'after_move:@@F|%(filepath)s',
    '--no-quiet', '--progress'   # --print active --quiet : on garde le journal et la barre
)

function Test-PlaylistUrl([Uri]$u, [bool]$force) {
    $hostName = $u.Host.ToLowerInvariant()
    $path = $u.AbsolutePath
    $hasList = $u.Query -match '(^\?|&)list=[^&]+'
    if ($hostName -match '(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$') {
        if ($path -match '^/playlist/?$' -and $hasList) { return $true }
        if ($path -match '^/(@[^/]+|channel/[^/]+|c/[^/]+|user/[^/]+)(/(videos|shorts|streams|playlists))?/?$') { return $true }
        # watch?v=...&list=... : la video seule, sauf si "playlist entiere" est coche
        return ($hasList -and $force)
    }
    if ($path -match '/(sets|album|showcase|playlist|playlists)(/|$)') { return $true }
    return $force
}

function ConvertTo-SafeFolderName([string]$name) {
    $n = ($name -replace '[<>:"/\\|?*\x00-\x1F]', ' ') -replace '\s+', ' '
    $n = $n.Trim().TrimEnd('.').Trim()
    if ($n.Length -gt 80) { $n = $n.Substring(0, 80).Trim() }
    return $n
}

# Decoupe les liens en travaux : 1 travail par playlist (dans son propre dossier)
# + 1 travail pour les videos seules (dans un sous-dossier "Lot" s'il y en a plusieurs).
function New-DownloadPlan($s, $body, [bool]$forUi) {
    $plan = @{ jobs = New-Object System.Collections.ArrayList; rejected = New-Object System.Collections.ArrayList; error = $null }

    if (-not $s.dest) { $plan.error = 'Choisissez un dossier de destination.'; return $plan }
    if (-not (Test-FullPath $s.dest)) { $plan.error = U 'Le dossier doit \u00eatre un chemin complet (ex. D:\\Vid\u00e9os).'; return $plan }
    if ($s.ffmpeg -and -not (Test-Path -LiteralPath $s.ffmpeg)) { $plan.error = U 'FFmpeg introuvable au chemin indiqu\u00e9.'; return $plan }
    if ([string]$s.profile -like 'hap*' -and -not (Test-HapEncoder (Get-FfmpegExe $s))) { $plan.error = U $NoHapMessage; return $plan }

    $singles = New-Object System.Collections.ArrayList
    $playlists = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($raw in @($body.urls)) {
        $line = ([string]$raw).Trim()
        if (-not $line) { continue }
        $u = $null
        if (-not [Uri]::TryCreate($line, [UriKind]::Absolute, [ref]$u) -or ($u.Scheme -ne 'http' -and $u.Scheme -ne 'https') -or ($line -match '\s')) {
            [void]$plan.rejected.Add($line); continue
        }
        if ($seen.ContainsKey($line)) { continue }
        $seen[$line] = $true
        if (Test-PlaylistUrl $u $s.playlist) { [void]$playlists.Add($line) } else { [void]$singles.Add($line) }
    }

    $base = Get-BaseArgs $s
    $frames = ($s.profile -eq 'frames')

    foreach ($url in $playlists) {
        $a = New-Object 'System.Collections.Generic.List[string]' (, $base)
        $tmpl = if ($frames) { '%(playlist_title,playlist_id|Playlist)s/%(playlist_index)s - %(title)s/%(title)s.%(ext)s' }
                else { '%(playlist_title,playlist_id|Playlist)s/%(playlist_index)s - %(title)s.%(ext)s' }
        $a.AddRange([string[]]@('--yes-playlist', '-P', $s.dest, '-o', $tmpl))
        if ($forUi) { $a.AddRange([string[]]$UiArgs) }
        $a.Add('--'); $a.Add($url)
        [void]$plan.jobs.Add(@{ kind = 'playlist'; label = $url; dir = $s.dest; count = 0; args = $a.ToArray() })
    }

    if ($singles.Count -gt 0) {
        $dir = $s.dest
        $kind = 'single'
        if ($singles.Count -ge 2 -and $s.groupBatch) {
            $name = ''
            if ($body.PSObject.Properties['batchName']) { $name = ConvertTo-SafeFolderName ([string]$body.batchName) }
            if (-not $name) { $name = 'Lot ' + (Get-Date -Format 'yyyy-MM-dd HH\hmm') }
            $dir = Join-Path $s.dest $name
            $kind = 'batch'
        }
        $a = New-Object 'System.Collections.Generic.List[string]' (, $base)
        $tmpl = if ($frames) { '%(title)s/%(title)s.%(ext)s' } else { '%(title)s.%(ext)s' }
        $a.AddRange([string[]]@('--no-playlist', '-P', $dir, '-o', $tmpl))
        if ($forUi) { $a.AddRange([string[]]$UiArgs) }
        $a.Add('--')
        $a.AddRange([string[]]$singles)
        $label = if ($singles.Count -eq 1) { $singles[0] } else { "$($singles.Count) liens" }
        [void]$plan.jobs.Add(@{ kind = $kind; label = $label; dir = $dir; count = $singles.Count; args = $a.ToArray() })
    }
    return $plan
}

# ============================================================================
#  Conversions : construction des commandes ffmpeg
# ============================================================================
# "90", "1:30", "01:02:03.5" -> secondes. $null si vide, -1 si invalide.
function ConvertTo-Seconds([string]$text) {
    $t = $text.Trim().Replace(',', '.')
    if (-not $t) { return $null }
    if ($t -notmatch '^\d+(:\d{1,2}){0,2}(\.\d+)?$') { return -1 }
    $sec = 0.0
    foreach ($part in $t.Split(':')) { $sec = $sec * 60 + [double]::Parse($part, $Inv) }
    return $sec
}

# "30000/1001" -> 29.97
function ConvertFrom-Rate([string]$rate) {
    $parts = $rate.Split('/')
    $n = 0.0; $d = 0.0
    if ($parts.Count -eq 2 -and [double]::TryParse($parts[0], $Float, $Inv, [ref]$n) -and
        [double]::TryParse($parts[1], $Float, $Inv, [ref]$d) -and $d -gt 0) {
        return [math]::Round($n / $d, 2)
    }
    return 0
}

# Resume d'un fichier via ffprobe : duree, taille, premier flux video et audio.
function Get-MediaInfo([string]$ffmpegExe, [string]$file) {
    $info = @{ path = $file }
    if (-not (Test-FullPath $file) -or -not [IO.File]::Exists($file)) { $info.error = 'Fichier introuvable.'; return $info }
    $info.name = [IO.Path]::GetFileName($file)
    $info.size = (New-Object IO.FileInfo $file).Length
    $probe = Join-Path (Split-Path -Parent $ffmpegExe) 'ffprobe.exe'
    if (-not (Test-Path -LiteralPath $probe)) { return $info }
    try {
        $raw = & $probe -v error -print_format json -show_entries 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,channels' -i $file
        $json = ($raw -join "`n") | ConvertFrom-Json
        $d = 0.0
        if ([double]::TryParse([string]$json.format.duration, $Float, $Inv, [ref]$d)) { $info.duration = $d }
        foreach ($st in @($json.streams)) {
            if ($st.codec_type -eq 'video' -and -not $info.video) {
                $info.video = @{ codec = $st.codec_name; width = $st.width; height = $st.height; fps = (ConvertFrom-Rate $st.avg_frame_rate) }
            } elseif ($st.codec_type -eq 'audio' -and -not $info.audio) {
                $info.audio = @{ codec = $st.codec_name; channels = $st.channels }
            }
        }
        if (-not $info.video -and -not $info.audio) { $info.error = U 'Aucun flux audio ou vid\u00e9o lisible.' }
    } catch {
        $info.error = 'Lecture impossible par ffprobe.'
    }
    return $info
}

# Commande ffmpeg d'un fichier avec les reglages courants.
function New-ConvertPlan($s, [string]$in, $trim, [bool]$forUi) {
    $plan = @{ error = $null; input = $in; output = $null }
    if (-not (Test-FullPath $in) -or -not [IO.File]::Exists($in)) { $plan.error = 'Fichier introuvable.'; return $plan }
    $id = [string]$s.convPreset
    if (-not $Presets.Contains($id)) { $id = 'h264' }
    $p = $Presets[$id]
    $qi = [array]::IndexOf($Qualities, [string]$s.convQuality)
    if ($qi -lt 0) { $qi = 1 }

    $stem = [IO.Path]::GetFileNameWithoutExtension($in)
    $dir = if ($s.convOutDir) { $s.convOutDir } else { [IO.Path]::GetDirectoryName($in) }
    if ($id -eq 'png') {
        # Sequence d'images : un dossier par source.
        $dir = Join-Path $dir ($stem + $p.suffix)
        $plan.output = $dir
        $target = Join-Path $dir 'frame_%05d.png'
        $exists = [IO.Directory]::Exists($dir) -and [IO.Directory]::EnumerateFileSystemEntries($dir).GetEnumerator().MoveNext()
    } else {
        $target = Join-Path $dir ($stem + $p.suffix)
        $plan.output = $target
        $exists = [IO.File]::Exists($target)
    }
    $plan.dir = $dir
    $plan.exe = Get-FfmpegExe $s
    if ($target -eq $in) { $plan.error = U 'La source porte d\u00e9j\u00e0 le nom de sortie : choisissez un autre dossier.'; return $plan }
    if ($exists -and -not $s.convOverwrite) { $plan.error = U 'Le fichier produit existe d\u00e9j\u00e0 : activez \u00ab Remplacer \u00bb.'; return $plan }

    $a = New-Object 'System.Collections.Generic.List[string]'
    $a.AddRange([string[]]@('-hide_banner', '-nostdin'))
    if ($forUi) { $a.AddRange([string[]]@('-v', 'warning', '-nostats', '-progress', 'pipe:1')) }
    $a.Add($(if ($s.convOverwrite) { '-y' } else { '-n' }))
    if ($trim.start) { $a.Add('-ss'); $a.Add($trim.start) }
    if ($trim.end) { $a.Add('-to'); $a.Add($trim.end) }
    $a.Add('-i'); $a.Add($in)

    # Image : rotation, cadence, taille (reduction seulement, dimensions multiples de $m).
    if ($p.kind -ne 'audio') {
        $vf = New-Object 'System.Collections.Generic.List[string]'
        switch ([string]$s.convRotate) {
            'cw' { $vf.Add('transpose=1') }
            'ccw' { $vf.Add('transpose=2') }
            '180' { $vf.Add('hflip,vflip') }
            'hflip' { $vf.Add('hflip') }
        }
        $fps = [string]$s.convFps
        $w = [string]$s.convScale
        if ($id -eq 'gif') {
            if (-not $fps) { $fps = '15' }
            if (-not $w) { $w = '640' }
        }
        if ($fps) { $vf.Add("fps=$fps") }
        $m = if ($p.mult) { [int]$p.mult } else { 1 }
        $flags = if ($id -eq 'gif') { ':flags=lanczos' } else { '' }
        if ($w) { $vf.Add("scale='trunc(min($w,iw)/$m)*$m':-$m$flags") }
        elseif ($m -gt 1) { $vf.Add("scale='trunc(iw/$m)*$m':-$m") }
        if ($id -eq 'gif') {
            $vf.Add("split[a][b];[a]palettegen=max_colors=$($p.colors[$qi]):stats_mode=diff[pal];[b][pal]paletteuse=dither=sierra2_4a")
        }
        if ($vf.Count) { $a.Add('-vf'); $a.Add(($vf -join ',')) }
    }

    $a.AddRange([string[]]$p.args)
    if ($p.q) { $a.AddRange([string[]]$p.q[$qi]) }
    $loudnorm = @('-af', 'loudnorm=I=-14:TP=-1:LRA=11')
    switch ($p.kind) {
        'image' { $a.Add('-an') }
        'audio' {
            $a.Add('-vn')
            if ($s.convAudio -eq 'norm') { $a.AddRange([string[]]$loudnorm) }
        }
        default {
            if ($s.convAudio -eq 'mute') {
                $a.Add('-an')
            } else {
                if ($s.convAudio -eq 'norm') { $a.AddRange([string[]]$loudnorm) }
                $a.AddRange([string[]]$p.audio)
                if ($p.aq) { $a.AddRange([string[]]$p.aq[$qi]) }
            }
        }
    }
    $a.Add($target)
    $plan.args = $a.ToArray()
    return $plan
}

# Plusieurs fichiers, memes reglages. Les erreurs communes (temps, dossier) sont dans .error.
function New-ConvertBatch($s, $body, [bool]$forUi) {
    $batch = @{ error = $null; plans = @(); trim = @{ start = $null; end = $null; startSec = 0.0; endSec = $null } }
    $inputs = @(@($body.inputs) | ForEach-Object { ([string]$_).Trim().Trim('"') } | Where-Object { $_ } | Select-Object -Unique)
    if ($inputs.Count -eq 0) { $batch.error = 'Ajoutez au moins un fichier.'; return $batch }
    if ($inputs.Count -gt 100) { $batch.error = 'Maximum 100 fichiers par conversion.'; return $batch }
    if ($s.ffmpeg -and -not [IO.File]::Exists((Get-FfmpegExe $s))) { $batch.error = U 'FFmpeg introuvable au chemin indiqu\u00e9.'; return $batch }
    if ([string]$s.convPreset -like 'hap*' -and -not (Test-HapEncoder (Get-FfmpegExe $s))) { $batch.error = U $NoHapMessage; return $batch }
    if ($s.convOutDir -and -not (Test-FullPath $s.convOutDir)) {
        $batch.error = U 'Le dossier de sortie doit \u00eatre un chemin complet (ex. D:\\Exports).'; return $batch
    }

    $start = ConvertTo-Seconds ([string]$body.start)
    $end = ConvertTo-Seconds ([string]$body.end)
    if ($start -eq -1 -or $end -eq -1) { $batch.error = U 'Temps invalide : \u00e9crivez 90, 1:30 ou 01:02:03.'; return $batch }
    if ($null -ne $end -and $end -le [double]$start) { $batch.error = U 'La fin doit \u00eatre apr\u00e8s le d\u00e9but.'; return $batch }
    if ($start -gt 0) { $batch.trim.start = ([double]$start).ToString('0.###', $Inv); $batch.trim.startSec = [double]$start }
    if ($null -ne $end) { $batch.trim.end = ([double]$end).ToString('0.###', $Inv); $batch.trim.endSec = [double]$end }

    $batch.plans = @(foreach ($in in $inputs) { New-ConvertPlan $s $in $batch.trim $forUi })
    return $batch
}

# ============================================================================
#  HTTP
# ============================================================================
function Send-Bytes($ctx, [int]$code, [byte[]]$bytes, [string]$type) {
    $res = $ctx.Response
    $res.StatusCode = $code
    $res.ContentType = $type
    $res.Headers['Cache-Control'] = 'no-store'
    $res.Headers['X-Content-Type-Options'] = 'nosniff'
    $res.ContentLength64 = $bytes.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    $res.OutputStream.Close()
}

function Send-Json($ctx, [int]$code, $obj) {
    $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
    Send-Bytes $ctx $code ([Text.Encoding]::UTF8.GetBytes($json)) 'application/json; charset=utf-8'
}

function Read-JsonBody($ctx) {
    $sr = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
    $text = $sr.ReadToEnd()
    $sr.Close()
    if (-not $text.Trim()) { return [pscustomobject]@{} }
    return ($text | ConvertFrom-Json)
}

# $full : premier appel de la page (reglages inclus). La liste des travaux n'est
# serialisee que si elle a change depuis la revision connue de la page.
function Get-State([bool]$full, [int]$knownRev) {
    $rev = $Queue.Revision
    $st = @{ app = 'yt-dlp-studio'; updating = $Queue.Paused; rev = $rev }
    if ($full) { $st.settings = $script:Settings; $st.defaultDest = $DefaultDest }
    if ($full -or $knownRev -ne $rev) { $st.jobs = $Queue.Snapshot() }
    return $st
}

function Invoke-Api($ctx, [string]$path) {
    switch ($path) {
        '/api/state' {
            [int]$known = 0
            if ([int]::TryParse([string]$ctx.Request.QueryString['rev'], [ref]$known)) { Send-Json $ctx 200 (Get-State $false $known) }
            else { Send-Json $ctx 200 (Get-State $true -1) }
        }
        '/api/settings' {
            $script:Settings = Merge-Options $script:Settings (Read-JsonBody $ctx)
            Save-Settings $script:Settings
            Send-Json $ctx 200 @{ ok = $true }
        }
        '/api/preview' {
            $body = Read-JsonBody $ctx
            $plan = New-DownloadPlan (Merge-Options $script:Settings $body) $body $false
            $jobs = @(foreach ($j in $plan.jobs) {
                @{ kind = $j.kind; dir = $j.dir; count = $j.count; command = 'yt-dlp ' + [YtdlpStudio.JobQueue]::JoinArgsForCmd($j.args) }
            })
            Send-Json $ctx 200 @{ error = $plan.error; rejected = @($plan.rejected); jobs = $jobs }
        }
        '/api/download' {
            $body = Read-JsonBody $ctx
            $script:Settings = Merge-Options $script:Settings $body
            $plan = New-DownloadPlan $script:Settings $body $true
            if ($plan.error) { Send-Json $ctx 400 @{ error = $plan.error }; return }
            if ($plan.jobs.Count -eq 0) { Send-Json $ctx 400 @{ error = 'Aucun lien valide (http/https).' }; return }
            Save-Settings $script:Settings
            try { [void][IO.Directory]::CreateDirectory($script:Settings.dest) }
            catch { Send-Json $ctx 400 @{ error = (U 'Impossible de cr\u00e9er le dossier : ') + $_.Exception.Message }; return }
            $ids = @(foreach ($j in $plan.jobs) {
                $Queue.Add($Ytdlp, [string]$j.label, [string]$j.kind, [string]$j.dir, [string[]]$j.args, [int]$j.count, 0, '')
            })
            Log ("File d'attente : +" + $ids.Count + ' travail(aux) -> ' + $script:Settings.dest)
            Send-Json $ctx 200 @{ ids = $ids }
        }
        '/api/convert' {
            # dryRun : apercu (fichiers produits + commande) sans rien lancer ni enregistrer.
            $body = Read-JsonBody $ctx
            $dry = [bool]($body.PSObject.Properties['dryRun'] -and $body.dryRun)
            $s = Merge-Options $script:Settings $body
            $batch = New-ConvertBatch $s $body (-not $dry)
            if ($dry) {
                $firstOk = $batch.plans | Where-Object { -not $_.error } | Select-Object -First 1
                $items = @(foreach ($p in $batch.plans) { @{ input = $p.input; output = $p.output; error = $p.error } })
                $cmd = if ($firstOk) { 'ffmpeg ' + [YtdlpStudio.JobQueue]::JoinArgsForCmd($firstOk.args) } else { '' }
                Send-Json $ctx 200 @{ error = $batch.error; items = $items; command = $cmd }
                return
            }
            if ($batch.error) { Send-Json $ctx 400 @{ error = $batch.error }; return }
            $bad = $batch.plans | Where-Object { $_.error } | Select-Object -First 1
            if ($bad) { Send-Json $ctx 400 @{ error = ($bad.input -replace '^.*[\\/]', '') + ' : ' + $bad.error }; return }
            $script:Settings = $s
            Save-Settings $s
            $trim = $batch.trim
            $ids = @(foreach ($p in $batch.plans) {
                # Duree reelle a encoder (decoupe comprise) : sert au pourcentage.
                $full = [double](Get-MediaInfo $p.exe $p.input).duration
                $end = if ($null -eq $trim.endSec) { $full } elseif ($full -gt 0) { [math]::Min($full, $trim.endSec) } else { $trim.endSec }
                $Queue.Add($p.exe, [IO.Path]::GetFileName($p.input), 'convert', $p.dir, [string[]]$p.args, 1, [math]::Max(0.0, $end - $trim.startSec), $p.output)
            })
            Log ('Conversion : +' + $ids.Count + ' fichier(s)')
            Send-Json $ctx 200 @{ ids = $ids }
        }
        '/api/probe' {
            $exe = Get-FfmpegExe $script:Settings
            $paths = @((Read-JsonBody $ctx).paths) | Where-Object { $_ } | Select-Object -First 100
            $items = @(foreach ($raw in $paths) { Get-MediaInfo $exe (([string]$raw).Trim().Trim('"')) })
            Send-Json $ctx 200 @{ items = $items }
        }
        '/api/pick-folder' {
            $body = Read-JsonBody $ctx
            try {
                $picked = [YtdlpStudio.ShellPicker]::Pick((U 'Choisir un dossier'), [string]$body.start, $true)
                Send-Json $ctx 200 @{ path = $(if ($picked.Length) { $picked[0] } else { $null }) }
            } catch {
                Send-Json $ctx 500 @{ error = (U 'S\u00e9lecteur indisponible : ') + $_.Exception.Message }
            }
        }
        '/api/pick-file' {
            $body = Read-JsonBody $ctx
            try {
                $picked = [YtdlpStudio.ShellPicker]::Pick((U 'Fichiers \u00e0 convertir'), [string]$body.start, $false)
                Send-Json $ctx 200 @{ paths = $picked }
            } catch {
                Send-Json $ctx 500 @{ error = (U 'S\u00e9lecteur indisponible : ') + $_.Exception.Message }
            }
        }
        '/api/open' {
            # Ouvre un dossier (ou selectionne un fichier) dans l'Explorateur.
            $p = ([string](Read-JsonBody $ctx).path).Trim()
            if ($p -and [IO.Directory]::Exists($p)) {
                Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $p + '"')
                Send-Json $ctx 200 @{ ok = $true }
            } elseif ($p -and [IO.File]::Exists($p)) {
                Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,"' + $p + '"')
                Send-Json $ctx 200 @{ ok = $true }
            } else {
                Send-Json $ctx 404 @{ error = "Ce dossier n'existe pas encore." }
            }
        }
        '/api/cancel' {
            Send-Json $ctx 200 @{ ok = $Queue.Cancel([int](Read-JsonBody $ctx).id) }
        }
        '/api/clear' {
            $Queue.ClearFinished()
            Send-Json $ctx 200 @{ ok = $true }
        }
        '/api/quit' {
            $Queue.CancelAll()
            Send-Json $ctx 200 @{ ok = $true }
            $script:Quit = $true
        }
        default { Send-Json $ctx 404 @{ error = 'not found' } }
    }
}

function Invoke-Request($ctx) {
    $req = $ctx.Request
    $path = $req.Url.AbsolutePath

    # Anti DNS rebinding : seul un Host local est accepte.
    if ([string]$req.Headers['Host'] -notmatch ('^(127\.0\.0\.1|localhost):' + $Port + '$')) {
        Send-Json $ctx 403 @{ error = 'forbidden' }; return
    }

    if ($path -eq '/api/ping') { Send-Json $ctx 200 @{ app = 'yt-dlp-studio' }; return }

    if ($req.HttpMethod -eq 'GET' -and ($path -eq '/' -or $path -eq '/index.html')) {
        $html = [IO.File]::ReadAllText((Join-Path $Root 'index.html'), [Text.Encoding]::UTF8)
        Send-Bytes $ctx 200 ([Text.Encoding]::UTF8.GetBytes($html.Replace('__STUDIO_TOKEN__', $Token))) 'text/html; charset=utf-8'
        return
    }
    if ($req.HttpMethod -eq 'GET' -and $path -eq '/favicon.ico') {
        $ico = Join-Path $Root 'assets\yt-dlp-studio.ico'
        if (Test-Path -LiteralPath $ico) { Send-Bytes $ctx 200 ([IO.File]::ReadAllBytes($ico)) 'image/x-icon' }
        else { Send-Json $ctx 404 @{ error = 'not found' } }
        return
    }

    if ($path.StartsWith('/api/')) {
        # Jeton obligatoire : un site tiers ne peut ni le lire ni envoyer d'en-tete
        # personnalise sans pre-requete CORS (a laquelle on ne repond jamais).
        if ([string]$req.Headers['X-Studio-Token'] -cne $Token) {
            Send-Json $ctx 403 @{ error = 'Jeton invalide : rechargez la page.' }; return
        }
        if ($path -ne '/api/state' -and $req.HttpMethod -ne 'POST') {
            Send-Json $ctx 405 @{ error = 'POST attendu' }; return
        }
        Invoke-Api $ctx $path
        return
    }

    Send-Json $ctx 404 @{ error = 'not found' }
}

# ============================================================================
#  Demarrage
# ============================================================================
Write-Host ''
Write-Host '============================================================'
Write-Host '   yt-dlp Studio - serveur local'
Write-Host "   $BaseUrl"
Write-Host '   Laissez cette fenetre ouverte (reduite) pendant les telechargements.'
Write-Host '   La fermer arrete le serveur.'
Write-Host '============================================================'
Write-Host ''

$Settings = Read-Settings
$pathEnv = $Bin + ';' + $Root + ';' + $env:PATH

# Verification des outils (1x / 12h) en arriere-plan : la file reste en pause
# tant que update.ps1 peut remplacer yt-dlp.exe.
$UpdateProc = $null
$updateScript = Join-Path $Root 'update.ps1'
if (-not $NoUpdate -and (Test-Path -LiteralPath $updateScript)) {
    $UpdateProc = Start-Process -FilePath 'powershell.exe' -NoNewWindow -PassThru -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $updateScript + '"'), '-Auto')
}
$Queue = [YtdlpStudio.JobQueue]::new($Root, $pathEnv, ($null -ne $UpdateProc))

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($BaseUrl)
try {
    $Listener.Start()
} catch {
    Log "Impossible d'ecouter sur le port $Port : $($_.Exception.Message)"
    Log 'Un autre programme utilise peut-etre ce port.'
    Read-Host 'Entree pour fermer'
    exit 1
}

Log 'Pret.'
Open-Ui

$Quit = $false
try {
    while ($Listener.IsListening -and -not $Quit) {
        $task = $Listener.GetContextAsync()
        while (-not $task.AsyncWaitHandle.WaitOne(250)) {
            if ($UpdateProc -and $UpdateProc.HasExited) {
                $UpdateProc = $null
                $Queue.Resume()
                Log 'Outils verifies - file d''attente active.'
            }
        }
        $ctx = $task.GetAwaiter().GetResult()
        try {
            Invoke-Request $ctx
        } catch {
            Log ('Erreur requete ' + $ctx.Request.Url.AbsolutePath + ' : ' + $_.Exception.Message)
            try { Send-Json $ctx 500 @{ error = $_.Exception.Message } } catch {}
        }
    }
} finally {
    $Queue.CancelAll()
    $Listener.Stop()
    $Listener.Close()
    Log 'Serveur arrete.'
}
