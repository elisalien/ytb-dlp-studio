// RENARD.mp3 - application de bureau Windows.
//
// Petite coque autour de l'app existante : une fenetre sans bordure qui affiche
// index.html dans WebView2 (le moteur Edge integre a Windows) et lance server.ps1
// en arriere-plan, cache. Tout le travail (yt-dlp, ffmpeg) reste dans server.ps1.
//
// La page parle a cette coque par window.chrome.webview.postMessage :
//   drag | dblclick | resize:<code HT> | min | max | close | fg | focus
//   update-check | update-apply | restart-server
// et recoit des messages JSON { type: ... } (maximized, close-request, zoom,
// update, update-status, host).
//
// Compile avec le csc.exe du .NET Framework 4.8 (C# 5 : pas d'interpolation,
// pas de ?.) : voir build.ps1.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("RENARD.mp3")]
[assembly: AssemblyProduct("RENARD.mp3")]
[assembly: AssemblyDescription("RENARD.mp3")]
[assembly: AssemblyCopyright("elisalien")]
[assembly: AssemblyVersion("2.0.0.0")]

namespace Renard
{
    static class Program
    {
        public const string AppName = "RENARD.mp3";
        public const int Port = 8767;
        public const string Repo = "elisalien/ytb-dlp-studio";
        public const string UpdateAsset = "RENARD-update.zip";

        [STAThread]
        static void Main(string[] args)
        {
            bool created;
            using (Mutex mutex = new Mutex(true, "Local\\RENARD.mp3-instance", out created))
            {
                if (!created && Array.IndexOf(args, "--wait") >= 0)
                {
                    // Relance apres mise a jour : on attend que l'ancienne version se ferme.
                    try { created = mutex.WaitOne(20000); } catch (AbandonedMutexException) { created = true; }
                }
                if (!created)
                {
                    // Deja ouverte : on ramene la fenetre existante.
                    IntPtr h = Native.FindWindow(null, AppName);
                    if (h != IntPtr.Zero)
                    {
                        if (Native.IsIconic(h)) Native.ShowWindow(h, 9); // SW_RESTORE
                        Native.SetForegroundWindow(h);
                    }
                    return;
                }
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }

    // ------------------------------------------------------------------------
    //  Fenetre principale
    // ------------------------------------------------------------------------
    class MainForm : Form
    {
        readonly string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        readonly WebView2 web = new WebView2();
        readonly ServerHost server;
        readonly Updater updater;
        readonly Prefs prefs;
        bool pageReady, allowClose, serverReady;
        string appVersion = "0.0.0";

        public MainForm()
        {
            prefs = new Prefs(Path.Combine(root, "renard.ini"));
            server = new ServerHost(root);
            try { appVersion = File.ReadAllText(Path.Combine(root, "version.txt")).Trim(); } catch { }
            updater = new Updater(root, appVersion);

            Text = Program.AppName;
            BackColor = Color.FromArgb(0x2b, 0x2f, 0x4a);
            StartPosition = FormStartPosition.Manual;
            FormBorderStyle = FormBorderStyle.Sizable;   // bord gere par WM_NCCALCSIZE : on garde l'ombre, les coins arrondis et le snap Windows
            try { Icon = new Icon(Path.Combine(root, "assets\\renard.ico")); } catch { }

            float scale = DeviceDpi / 96f;
            MinimumSize = new Size((int)(720 * scale), (int)(520 * scale));
            RestoreBounds_();

            web.Dock = DockStyle.Fill;
            web.DefaultBackgroundColor = BackColor;
            Controls.Add(web);

            Load += delegate { Start(); };
        }

        void RestoreBounds_()
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            float scale = DeviceDpi / 96f;
            int w = (int)(1100 * scale), h = (int)(740 * scale);
            w = Math.Min(w, wa.Width - 40); h = Math.Min(h, wa.Height - 40);
            Rectangle r = new Rectangle(wa.Left + (wa.Width - w) / 2, wa.Top + (wa.Height - h) / 2, w, h);
            Rectangle saved;
            if (prefs.TryRect("window", out saved))
            {
                foreach (Screen s in Screen.AllScreens)
                {
                    // On ne restaure que si la barre de titre reste visible sur un ecran.
                    Rectangle top = new Rectangle(saved.Left + 40, saved.Top, Math.Max(10, saved.Width - 80), 30);
                    if (s.WorkingArea.IntersectsWith(top)) { r = saved; break; }
                }
            }
            Bounds = r;
            if (prefs.Get("maximized") == "1") WindowState = FormWindowState.Maximized;
        }

        // ----- Bordure invisible : toute la fenetre est zone client -----
        protected override void WndProc(ref Message m)
        {
            const int WM_NCCALCSIZE = 0x83, WM_NCACTIVATE = 0x86;
            if (m.Msg == WM_NCCALCSIZE && m.WParam != IntPtr.Zero)
            {
                if (WindowState == FormWindowState.Maximized)
                {
                    // Maximisee, Windows deborde de l'ecran de l'epaisseur du cadre : on la retire.
                    Native.NCCALCSIZE_PARAMS p = (Native.NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(Native.NCCALCSIZE_PARAMS));
                    int fx = Native.GetSystemMetrics(32) + Native.GetSystemMetrics(92); // SM_CXFRAME + SM_CXPADDEDBORDER
                    int fy = Native.GetSystemMetrics(33) + Native.GetSystemMetrics(92);
                    p.rgrc0.Left += fx; p.rgrc0.Right -= fx; p.rgrc0.Top += fy; p.rgrc0.Bottom -= fy;
                    Marshal.StructureToPtr(p, m.LParam, false);
                }
                m.Result = IntPtr.Zero;
                return;
            }
            if (m.Msg == WM_NCACTIVATE)
            {
                // Empeche Windows de redessiner un cadre classique a l'activation.
                m.Result = new IntPtr(1);
                return;
            }
            base.WndProc(ref m);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            int round = 2; // DWMWCP_ROUND : coins arrondis Windows 11
            try { Native.DwmSetWindowAttribute(Handle, 33, ref round, 4); } catch { }
            // Force le recalcul du cadre (sinon une barre de titre fantome reste au premier affichage).
            Native.SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027); // NOMOVE|NOSIZE|NOZORDER|FRAMECHANGED
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            Post("{\"type\":\"maximized\",\"value\":" + (WindowState == FormWindowState.Maximized ? "true" : "false") + "}");
        }

        // ----- Demarrage : WebView2 + serveur -----
        async void Start()
        {
            try
            {
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, "webview"));
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                MessageBox.Show(this,
                    "Le moteur WebView2 de Microsoft est introuvable.\r\n\r\nInstallez \"Microsoft Edge WebView2 Runtime\" depuis le site de Microsoft, puis relancez RENARD.mp3.\r\n\r\n" + ex.Message,
                    Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                allowClose = true;
                Close();
                return;
            }

            CoreWebView2Settings s = web.CoreWebView2.Settings;
            s.AreBrowserAcceleratorKeysEnabled = false;  // pas de F5, Ctrl+F, Ctrl+P... comme une vraie app
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = true;               // Ctrl + molette, Ctrl +/-, Ctrl 0
            s.AreDevToolsEnabled = Environment.GetEnvironmentVariable("RENARD_DEVTOOLS") == "1";
            s.IsGeneralAutofillEnabled = false;
            s.IsPasswordAutosaveEnabled = false;

            web.CoreWebView2.WebMessageReceived += OnMessage;
            web.CoreWebView2.NewWindowRequested += delegate (object o, CoreWebView2NewWindowRequestedEventArgs a)
            {
                a.Handled = true;
                OpenExternal(a.Uri);
            };
            web.CoreWebView2.NavigationStarting += delegate (object o, CoreWebView2NavigationStartingEventArgs a)
            {
                // Tout lien qui sort de l'app s'ouvre dans le navigateur habituel.
                if (!a.Uri.StartsWith(server.BaseUrl) && !a.Uri.StartsWith("data:") && !a.Uri.StartsWith("about:"))
                {
                    a.Cancel = true;
                    OpenExternal(a.Uri);
                }
            };
            web.CoreWebView2.NavigationCompleted += delegate (object o, CoreWebView2NavigationCompletedEventArgs a)
            {
                pageReady = serverReady && a.IsSuccess;
                if (pageReady)
                {
                    updater.Cleanup();
                    Post("{\"type\":\"host\",\"version\":" + Json(appVersion) + "}");
                    OnResize(EventArgs.Empty);
                }
            };
            web.ZoomFactorChanged += delegate
            {
                double z = Math.Max(0.8, Math.Min(2.0, web.ZoomFactor));
                if (Math.Abs(z - web.ZoomFactor) > 0.001) { web.ZoomFactor = z; return; }
                prefs.Set("zoom", z.ToString("0.00", CultureInfo.InvariantCulture));
                Post("{\"type\":\"zoom\",\"value\":" + z.ToString("0.00", CultureInfo.InvariantCulture) + "}");
            };

            double zoom;
            if (!double.TryParse(prefs.Get("zoom"), NumberStyles.Float, CultureInfo.InvariantCulture, out zoom))
            {
                // Petit ecran (portable 1366x768...) : on part un peu plus petit.
                zoom = Screen.FromControl(this).WorkingArea.Height / (DeviceDpi / 96f) < 820 ? 0.9 : 1.0;
            }
            web.ZoomFactor = Math.Max(0.8, Math.Min(2.0, zoom));

            web.CoreWebView2.NavigateToString(Splash.Html);
            StartServer();
        }

        void StartServer()
        {
            serverReady = false;
            Thread t = new Thread(delegate ()
            {
                string error = server.Start(Downloads());
                BeginInvoke((MethodInvoker)delegate
                {
                    if (error == null)
                    {
                        serverReady = true;
                        web.CoreWebView2.Navigate(server.BaseUrl);
                    }
                    else
                    {
                        web.CoreWebView2.NavigateToString(Splash.Error(error));
                    }
                });
            });
            t.IsBackground = true;
            t.Start();
        }

        static string Downloads()
        {
            string dl = null;
            try
            {
                IntPtr p;
                Guid id = new Guid("374DE290-123F-4565-9164-39C4925E467B"); // FOLDERID_Downloads
                if (Native.SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out p) == 0)
                {
                    dl = Marshal.PtrToStringUni(p);
                    Marshal.FreeCoTaskMem(p);
                }
            }
            catch { }
            if (string.IsNullOrEmpty(dl)) dl = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            return Path.Combine(dl, Program.AppName);
        }

        // ----- Messages de la page -----
        void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg;
            try { msg = e.TryGetWebMessageAsString(); } catch { return; }
            if (msg == null) return;

            if (msg == "drag")
            {
                Native.ReleaseCapture();
                Native.SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); // WM_NCLBUTTONDOWN, HTCAPTION
            }
            else if (msg.StartsWith("resize:"))
            {
                int ht;
                if (WindowState != FormWindowState.Maximized && int.TryParse(msg.Substring(7), out ht) && ht >= 10 && ht <= 17)
                {
                    Native.ReleaseCapture();
                    Native.SendMessage(Handle, 0xA1, new IntPtr(ht), IntPtr.Zero);
                }
            }
            else if (msg == "dblclick" || msg == "max")
            {
                WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
            }
            else if (msg == "min") WindowState = FormWindowState.Minimized;
            else if (msg == "close") { allowClose = true; Close(); }
            else if (msg == "fg") Native.AllowSetForegroundWindow(-1); // le selecteur de fichiers de server.ps1 peut passer devant
            else if (msg == "focus")
            {
                if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                Activate();
                Native.FlashWindow(Handle, true);
            }
            else if (msg == "restart-server")
            {
                server.Stop();
                web.CoreWebView2.NavigateToString(Splash.Html);
                StartServer();
            }
            else if (msg == "update-check") updater.Check(Post);
            else if (msg == "update-apply")
            {
                updater.Apply(Post, delegate
                {
                    server.Stop();
                }, delegate
                {
                    allowClose = true;
                    Close();
                });
            }
        }

        // Thread-safe : peut etre appele depuis un thread de l'updater.
        public void Post(string json)
        {
            if (IsDisposed) return;
            if (InvokeRequired) { try { BeginInvoke((MethodInvoker)delegate { Post(json); }); } catch { } return; }
            if (web.CoreWebView2 != null && pageReady)
            {
                try { web.CoreWebView2.PostWebMessageAsJson(json); } catch { }
            }
        }

        public static string Json(string s)
        {
            return new JavaScriptSerializer().Serialize(s ?? "");
        }

        static void OpenExternal(string uri)
        {
            if (uri != null && (uri.StartsWith("https://") || uri.StartsWith("http://")))
            {
                try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); } catch { }
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!allowClose && pageReady && e.CloseReason == CloseReason.UserClosing)
            {
                // La page decide (confirmation si un telechargement tourne), puis renvoie "close".
                e.Cancel = true;
                Post("{\"type\":\"close-request\"}");
                return;
            }
            if (WindowState == FormWindowState.Normal) prefs.SetRect("window", Bounds);
            else prefs.SetRect("window", RestoreBounds);
            prefs.Set("maximized", WindowState == FormWindowState.Maximized ? "1" : "0");
            prefs.Save();
            base.OnFormClosing(e);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            server.Stop();
            base.OnFormClosed(e);
        }
    }

    // ------------------------------------------------------------------------
    //  server.ps1 cache, lie a l'app par un Job Object : si l'app se ferme
    //  (meme brutalement), PowerShell, yt-dlp et ffmpeg s'arretent avec elle.
    // ------------------------------------------------------------------------
    class ServerHost
    {
        readonly string root;
        IntPtr job = IntPtr.Zero;
        Process proc;
        public readonly string BaseUrl = "http://127.0.0.1:" + Program.Port + "/";

        public ServerHost(string root) { this.root = root; }

        // Renvoie null si le serveur repond, sinon un message d'erreur.
        public string Start(string defaultDest)
        {
            string script = Path.Combine(root, "server.ps1");
            if (!File.Exists(script)) return "server.ps1 est introuvable dans " + root;
            if (Ping()) return null; // deja lance (relance rapide)

            if (job == IntPtr.Zero)
            {
                job = Native.CreateJobObject(IntPtr.Zero, null);
                Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                int len = Marshal.SizeOf(typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr ptr = Marshal.AllocHGlobal(len);
                Marshal.StructureToPtr(info, ptr, false);
                Native.SetInformationJobObject(job, 9, ptr, (uint)len); // JobObjectExtendedLimitInformation
                Marshal.FreeHGlobal(ptr);
            }

            string ps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
            ProcessStartInfo psi = new ProcessStartInfo(ps,
                "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\" -NoBrowser -Port " + Program.Port +
                " -DefaultDest \"" + defaultDest + "\"");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WorkingDirectory = root;
            try
            {
                proc = Process.Start(psi);
                Native.AssignProcessToJobObject(job, proc.Handle);
            }
            catch (Exception ex) { return "Impossible de lancer PowerShell : " + ex.Message; }

            // La compilation C# de server.ps1 prend 1 a 3 s au premier lancement.
            for (int i = 0; i < 120; i++)
            {
                if (proc.HasExited) return "Le serveur s'est arrete au demarrage (port " + Program.Port + " deja pris ?).";
                if (Ping()) return null;
                Thread.Sleep(250);
            }
            return "Le serveur ne repond pas.";
        }

        bool Ping()
        {
            try
            {
                HttpWebRequest r = (HttpWebRequest)WebRequest.Create(BaseUrl + "api/ping");
                r.Timeout = 800;
                r.Proxy = null;
                using (WebResponse resp = r.GetResponse())
                using (StreamReader sr = new StreamReader(resp.GetResponseStream()))
                    return sr.ReadToEnd().Contains("yt-dlp-studio");
            }
            catch { return false; }
        }

        public void Stop()
        {
            if (job != IntPtr.Zero)
            {
                Native.TerminateJobObject(job, 0);
                Native.CloseHandle(job);
                job = IntPtr.Zero;
            }
            if (proc != null)
            {
                try { proc.WaitForExit(3000); } catch { }
                proc = null;
            }
        }
    }

    // ------------------------------------------------------------------------
    //  Mise a jour de l'app depuis les GitHub Releases (tags v2.* et plus).
    //  Le zip "RENARD-update.zip" contient l'app SANS bin\ (les outils se mettent
    //  a jour seuls via update.ps1). Les fichiers remplaces partent dans .backup\
    //  et reviennent si quoi que ce soit echoue.
    // ------------------------------------------------------------------------
    class Updater
    {
        readonly string root, current;
        string zipUrl, latest;
        volatile bool busy;

        public Updater(string root, string current) { this.root = root; this.current = current; }

        static Version Parse(string v)
        {
            v = (v ?? "").Trim().TrimStart('v', 'V');
            int dash = v.IndexOfAny(new char[] { '-', '+' });
            if (dash >= 0) v = v.Substring(0, dash);
            Version r;
            if (!Version.TryParse(v.Contains(".") ? v : v + ".0", out r)) r = new Version(0, 0);
            return r;
        }

        static WebClient Client()
        {
            WebClient c = new WebClient();
            c.Headers[HttpRequestHeader.UserAgent] = "RENARD.mp3-updater";
            c.Encoding = Encoding.UTF8;
            return c;
        }

        public void Check(Action<string> post)
        {
            if (busy) return;
            Thread t = new Thread(delegate ()
            {
                try
                {
                    string json;
                    using (WebClient c = Client())
                    {
                        c.Headers[HttpRequestHeader.Accept] = "application/vnd.github+json";
                        json = c.DownloadString("https://api.github.com/repos/" + Program.Repo + "/releases/latest");
                    }
                    Dictionary<string, object> rel = (Dictionary<string, object>)new JavaScriptSerializer().DeserializeObject(json);
                    string tag = rel.ContainsKey("tag_name") ? (string)rel["tag_name"] : "";
                    Version v = Parse(tag);
                    if (v.Major < 2 || v <= Parse(current)) return;
                    object[] assets = rel.ContainsKey("assets") ? (object[])rel["assets"] : new object[0];
                    foreach (object o in assets)
                    {
                        Dictionary<string, object> a = (Dictionary<string, object>)o;
                        if ((string)a["name"] == Program.UpdateAsset)
                        {
                            zipUrl = (string)a["browser_download_url"];
                            latest = tag.TrimStart('v', 'V');
                            post("{\"type\":\"update\",\"version\":" + MainForm.Json(latest) + "}");
                            return;
                        }
                    }
                }
                catch { /* hors ligne, limite GitHub... : on reessaiera plus tard */ }
            });
            t.IsBackground = true;
            t.Start();
        }

        public void Apply(Action<string> post, Action stopServer, Action restart)
        {
            if (busy || zipUrl == null) return;
            busy = true;
            Control ui = Application.OpenForms.Count > 0 ? Application.OpenForms[0] : null;
            Thread t = new Thread(delegate ()
            {
                string tmp = Path.Combine(Path.GetTempPath(), "renard-update-" + Guid.NewGuid().ToString("N"));
                string backup = Path.Combine(root, ".backup");
                List<string> moved = new List<string>();   // chemins relatifs sauvegardes
                List<string> added = new List<string>();   // nouveaux fichiers (a supprimer en cas d'echec)
                try
                {
                    post("{\"type\":\"update-status\",\"state\":\"download\"}");
                    Directory.CreateDirectory(tmp);
                    string zip = Path.Combine(tmp, "update.zip");
                    using (WebClient c = Client()) c.DownloadFile(zipUrl, zip);
                    string stage = Path.Combine(tmp, "app");
                    ZipFile.ExtractToDirectory(zip, stage);
                    foreach (string need in new string[] { "index.html", "server.ps1", "version.txt", "RENARD.mp3.exe" })
                        if (!File.Exists(Path.Combine(stage, need))) throw new Exception("archive incomplete (" + need + ")");

                    post("{\"type\":\"update-status\",\"state\":\"install\"}");
                    if (ui != null) ui.Invoke((MethodInvoker)delegate { stopServer(); });
                    if (Directory.Exists(backup)) Directory.Delete(backup, true);

                    foreach (string src in Directory.GetFiles(stage, "*", SearchOption.AllDirectories))
                    {
                        string rel = src.Substring(stage.Length + 1);
                        if (rel.StartsWith("bin\\", StringComparison.OrdinalIgnoreCase)) continue;
                        string dst = Path.Combine(root, rel);
                        Directory.CreateDirectory(Path.GetDirectoryName(dst));
                        if (File.Exists(dst))
                        {
                            string bak = Path.Combine(backup, rel);
                            Directory.CreateDirectory(Path.GetDirectoryName(bak));
                            File.Move(dst, bak);   // un .exe/.dll en cours d'utilisation peut etre deplace
                            moved.Add(rel);
                        }
                        else added.Add(rel);
                        File.Copy(src, dst);
                    }

                    // Relance la nouvelle version, qui supprimera .backup une fois la page chargee.
                    Process.Start(new ProcessStartInfo(Path.Combine(root, "RENARD.mp3.exe"), "--wait") { UseShellExecute = false, WorkingDirectory = root });
                    if (ui != null) ui.Invoke((MethodInvoker)delegate { restart(); });
                }
                catch (Exception ex)
                {
                    // Retour a l'etat precedent.
                    foreach (string rel in added) { try { File.Delete(Path.Combine(root, rel)); } catch { } }
                    foreach (string rel in moved)
                    {
                        try
                        {
                            string dst = Path.Combine(root, rel);
                            if (File.Exists(dst)) File.Delete(dst);
                            File.Move(Path.Combine(backup, rel), dst);
                        }
                        catch { }
                    }
                    busy = false;
                    post("{\"type\":\"update-status\",\"state\":\"error\",\"message\":" + MainForm.Json(ex.Message) + "}");
                    if (moved.Count > 0 || added.Count > 0)
                    {
                        // Le serveur a ete arrete : on le relance.
                        if (ui != null) try { ui.BeginInvoke((MethodInvoker)delegate { ((MainForm)ui).Post("{\"type\":\"restart\"}"); }); } catch { }
                    }
                }
                finally
                {
                    try { Directory.Delete(tmp, true); } catch { }
                }
            });
            t.IsBackground = true;
            t.Start();
        }

        // Appele quand la page est chargee : la mise a jour precedente a reussi.
        public void Cleanup()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                Thread.Sleep(3000);
                try
                {
                    string backup = Path.Combine(root, ".backup");
                    if (Directory.Exists(backup)) Directory.Delete(backup, true);
                }
                catch { }
            });
        }
    }

    // ------------------------------------------------------------------------
    //  Petit fichier de preferences : cle=valeur.
    // ------------------------------------------------------------------------
    class Prefs
    {
        readonly string path;
        readonly Dictionary<string, string> map = new Dictionary<string, string>();

        public Prefs(string path)
        {
            this.path = path;
            try
            {
                foreach (string line in File.ReadAllLines(path))
                {
                    int i = line.IndexOf('=');
                    if (i > 0) map[line.Substring(0, i).Trim()] = line.Substring(i + 1).Trim();
                }
            }
            catch { }
        }

        public string Get(string k) { string v; return map.TryGetValue(k, out v) ? v : null; }
        public void Set(string k, string v) { map[k] = v; }

        public bool TryRect(string k, out Rectangle r)
        {
            r = Rectangle.Empty;
            string v = Get(k);
            if (v == null) return false;
            string[] p = v.Split(',');
            int x, y, w, h;
            if (p.Length != 4 || !int.TryParse(p[0], out x) || !int.TryParse(p[1], out y) ||
                !int.TryParse(p[2], out w) || !int.TryParse(p[3], out h) || w < 200 || h < 200) return false;
            r = new Rectangle(x, y, w, h);
            return true;
        }

        public void SetRect(string k, Rectangle r) { Set(k, r.X + "," + r.Y + "," + r.Width + "," + r.Height); }

        public void Save()
        {
            try
            {
                List<string> lines = new List<string>();
                foreach (KeyValuePair<string, string> kv in map) lines.Add(kv.Key + "=" + kv.Value);
                File.WriteAllLines(path, lines.ToArray());
            }
            catch { }
        }
    }

    // ------------------------------------------------------------------------
    //  Ecran d'attente pendant le demarrage du serveur (1 a 3 s).
    // ------------------------------------------------------------------------
    static class Splash
    {
        const string Head = "<!DOCTYPE html><html lang=fr><meta charset=utf-8><style>" +
            "html,body{margin:0;height:100%;background:linear-gradient(#2b2f4a,#5b5a7e 60%,#c99aa6);color:#f6efe6;" +
            "font:600 15px 'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;-webkit-user-select:none;user-select:none}" +
            "p{margin:8px 0}small{opacity:.75;font-weight:400}b{font-size:44px;display:block;animation:z 1.6s ease-in-out infinite}" +
            "@keyframes z{50%{transform:translateY(-6px)}}button{margin-top:14px;padding:8px 18px;border:2px solid #f6efe6;background:none;color:inherit;font:inherit;cursor:pointer}" +
            "</style>";

        public static readonly string Html = Head +
            "<body onmousedown=\"if(event.button===0)chrome.webview.postMessage('drag')\"><div><b>z z z</b><p>le renard se r&eacute;veille&hellip;</p></div></body></html>";

        public static string Error(string msg)
        {
            return Head + "<body><div><b>:(</b><p>Le renard n'arrive pas &agrave; d&eacute;marrer.</p><p><small>" +
                WebUtility.HtmlEncode(msg) + "</small></p>" +
                "<button onclick=\"chrome.webview.postMessage('restart-server')\">R&eacute;essayer</button> " +
                "<button onclick=\"chrome.webview.postMessage('close')\">Fermer</button></div></body></html>";
        }
    }

    // ------------------------------------------------------------------------
    //  Win32
    // ------------------------------------------------------------------------
    static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [StructLayout(LayoutKind.Sequential)]
        public struct NCCALCSIZE_PARAMS { public RECT rgrc0, rgrc1, rgrc2; public IntPtr lppos; }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS { public ulong a, b, c, d, e, f; }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        [DllImport("user32.dll")] public static extern bool ReleaseCapture();
        [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
        [DllImport("user32.dll")] public static extern bool FlashWindow(IntPtr h, bool invert);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int value, int size);
        [DllImport("shell32.dll")] public static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr attr, string name);
        [DllImport("kernel32.dll")] public static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, uint len);
        [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll")] public static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    }
}
