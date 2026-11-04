/* RENARD.mp3 — sons, tous fabriqués en WebAudio (aucun échantillon).
   - volume en 5 crans (40 % par défaut), muet : tout se tait, musique comprise ;
   - réglages gardés dans localStorage ("renard-sound") ;
   - babillage 8 bits des bulles, ding de fin, petits bruitages du renard ;
   - rire bitcrushé et boucle hyperpop de l'alien, calculés hors ligne
     (OfflineAudioContext) puis passés au broyeur de bits en JS.
   Expose window.RenardSound. */
(function () {
    "use strict";

    const STEPS = [0.12, 0.25, 0.4, 0.6, 0.85];
    const KEY = "renard-sound";
    const listeners = new Set();

    let ctx = null, master = null, limiter = null, analyser = null, musicBus = null;
    let muted = false, step = 2;
    let musicBuf = null, musicPromise = null, laughBuf = null, laughPromise = null;
    let musicSrc = null, musicStart = 0;
    const scratch = new Uint8Array(512);

    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        if (typeof saved.muted === "boolean") muted = saved.muted;
        if (Number.isInteger(saved.step) && saved.step >= 0 && saved.step < STEPS.length) step = saved.step;
    } catch (e) { /* stockage indisponible : réglages par défaut */ }

    function persist() {
        try { localStorage.setItem(KEY, JSON.stringify({ muted, step })); } catch (e) { /* tant pis */ }
        for (const fn of listeners) { try { fn({ muted, step }); } catch (e) { /* écouteur fautif */ } }
    }

    function ensure() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
        master = ctx.createGain();
        limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 6;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        master.connect(limiter).connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.5;               // musique plafonnée, même à fond
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        musicBus.connect(analyser).connect(master);
        applyGain(true);
        return ctx;
    }

    function applyGain(now) {
        if (!master) return;
        const target = muted ? 0 : STEPS[step];
        if (now) master.gain.value = target;
        else master.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
    }

    // Débloque l'audio au premier geste (politique d'autoplay des navigateurs).
    function unlock() {
        if (!ensure()) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
    }
    for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, unlock, { capture: true, passive: true });

    const ready = () => !!ensure() && ctx.state === "running" && !muted;
    const midi = n => 440 * Math.pow(2, (n - 69) / 12);

    /* ------------------------------ petits sons ------------------------------ */
    function env(g, t, a, peak, d) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }

    function tone(type, freq, t, a, peak, d, dest, glideTo) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + a + d);
        env(g, t, a, peak, d);
        o.connect(g).connect(dest || master);
        o.start(t);
        o.stop(t + a + d + 0.05);
        return o;
    }

    let noiseBuf = null;
    function noise() {
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        return noiseBuf;
    }

    // Voix des bulles : syllabes carrées douces, ~0,5 s.
    function babble(text) {
        if (!ready()) return;
        const t0 = ctx.currentTime + 0.02;
        const n = Math.max(4, Math.min(7, Math.round(String(text || "").length / 3)));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2400;
        const out = ctx.createGain();
        out.gain.value = 0.5;
        lp.connect(out).connect(master);
        const scale = [0, 2, 4, 7, 9, 12];
        const base = 69 + Math.floor(Math.random() * 3);
        const dur = 0.5 / n;
        for (let i = 0; i < n; i++) {
            const note = base + scale[Math.floor(Math.random() * scale.length)] + (i === n - 1 ? 2 : 0);
            const t = t0 + i * dur;
            const o = tone("square", midi(note), t, 0.008, 0.09, dur * 0.8, lp);
            o.frequency.setValueAtTime(midi(note), t);
            o.frequency.linearRampToValueAtTime(midi(note) * (Math.random() < 0.5 ? 1.06 : 0.95), t + dur * 0.8);
        }
    }

    // Ding doux de fin de téléchargement.
    function ding() {
        if (!ready()) return;
        const t = ctx.currentTime + 0.02;
        tone("sine", midi(88), t, 0.005, 0.22, 0.9);
        tone("triangle", midi(88) * 2, t, 0.005, 0.04, 0.35);
        tone("sine", midi(95), t + 0.12, 0.005, 0.18, 1.1);
    }

    function pop() {
        if (!ready()) return;
        tone("square", 900, ctx.currentTime, 0.004, 0.06, 0.07, null, 1500);
    }

    function boing() {
        if (!ready()) return;
        tone("square", 300, ctx.currentTime, 0.005, 0.06, 0.18, null, 720);
    }

    // Petit bruit de bouffée de fumée.
    function puff() {
        if (!ready()) return;
        const t = ctx.currentTime;
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noise();
        f.type = "bandpass";
        f.frequency.setValueAtTime(1800, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 0.45);
        env(g, t, 0.02, 0.35, 0.45);
        s.connect(f).connect(g).connect(master);
        s.start(t);
        s.stop(t + 0.55);
    }

    // « Atchoum ! » : souffle aspiré puis éclat de bruit.
    function sneeze() {
        if (!ready()) return;
        const t = ctx.currentTime;
        tone("square", 500, t, 0.25, 0.03, 0.05, null, 900);
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noise();
        f.type = "highpass";
        f.frequency.value = 1500;
        env(g, t + 0.32, 0.01, 0.3, 0.22);
        s.connect(f).connect(g).connect(master);
        s.start(t + 0.3);
        s.stop(t + 0.7);
    }

    /* ------------------------------ broyeur de bits ------------------------------ */
    function crush(d, from, to, hold, bits) {
        const q = Math.pow(2, bits - 1);
        let held = 0;
        for (let i = Math.max(0, from); i < Math.min(d.length, to); i++) {
            if ((i - from) % hold === 0) held = Math.round(d[i] * q) / q;
            d[i] = held;
        }
    }

    // Répète une tranche (bégaiement) sur `count` copies.
    function stutter(d, at, len, count) {
        len = Math.max(1, Math.round(len));
        const slice = d.slice(at, at + len);
        for (let k = 1; k < count; k++) {
            const o = at + k * len;
            for (let i = 0; i < len && o + i < d.length; i++) d[o + i] = slice[i] * (1 - k * 0.04);
        }
    }

    function finish(buf, peak) {
        let max = 0;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
        }
        const k = max > 0 ? peak / max : 1;
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < d.length; i++) d[i] *= k;
        }
        return buf;
    }

    function rng(seed) {
        return () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
    }

    function shaper(oc, drive) {
        const ws = oc.createWaveShaper();
        const n = 2048, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = i / (n - 1) * 2 - 1;
            curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
        }
        ws.curve = curve;
        ws.oversample = "2x";
        return ws;
    }

    function noiseFor(oc, seconds) {
        const b = oc.createBuffer(1, Math.ceil(oc.sampleRate * seconds), oc.sampleRate);
        const d = b.getChannelData(0);
        const r = rng(7);
        for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
        return b;
    }

    // Voyelle synthétique : dent de scie aiguë à travers trois formants.
    // Un banc de filtres par voyelle et par sortie, partagé par toutes les syllabes.
    const VOWELS = { a: [900, 1500, 3200], e: [620, 2300, 3300], i: [380, 2900, 3800], o: [600, 1000, 2900], u: [420, 900, 2700] };
    const banks = new WeakMap();
    function vowelBank(oc, dest, vowel) {
        let map = banks.get(dest);
        if (!map) banks.set(dest, map = {});
        if (map[vowel]) return map[vowel];
        const input = oc.createGain();
        VOWELS[vowel].forEach((f, k) => {
            const bp = oc.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = f * 1.35;      // voix « chipmunk » très aiguë
            bp.Q.value = 9;
            const bg = oc.createGain();
            bg.gain.value = [1, 0.6, 0.3][k] * 3;
            input.connect(bp).connect(bg).connect(dest);
        });
        return (map[vowel] = input);
    }

    function voice(oc, dest, t, freq, dur, vowel, peak, glide) {
        const o = oc.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq, t);
        o.frequency.setValueAtTime(freq * 1.02, t + 0.03);   // petit vibrato en marches
        o.frequency.setValueAtTime(freq * 0.99, t + 0.06);
        if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
        else o.frequency.setValueAtTime(freq, t + 0.09);
        const g = oc.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
        g.gain.setValueAtTime(peak, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(vowelBank(oc, dest, vowel));
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    /* ------------------------------ rire de l'alien ------------------------------ */
    function renderLaugh() {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC || !ensure()) return Promise.resolve(null);
        const sr = ctx.sampleRate;
        const oc = new OAC(1, Math.ceil(sr * 1.05), sr);
        const out = oc.createGain();
        out.connect(oc.destination);
        const nb = noiseFor(oc, 1.1);
        const syl = [[0.0, 1250, "e"], [0.12, 1180, "e"], [0.23, 1100, "e"], [0.33, 1020, "i"], [0.43, 960, "e"],
                     [0.53, 880, "e"], [0.66, 820, "e"], [0.8, 1500, "i"]];
        for (const [t, f, v] of syl) {
            const s = oc.createBufferSource(), hp = oc.createBiquadFilter(), g = oc.createGain();
            s.buffer = nb;                           // le « h » soufflé
            hp.type = "highpass";
            hp.frequency.value = 2500;
            g.gain.setValueAtTime(0.25, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            s.connect(hp).connect(g).connect(out);
            s.start(t, Math.random() * 0.5, 0.05);
            voice(oc, out, t + 0.025, f, t > 0.75 ? 0.22 : 0.07, v, 0.5, t > 0.75 ? 1.25 : 0.9);
        }
        return oc.startRendering().then(buf => {
            const d = buf.getChannelData(0);
            crush(d, 0, d.length, 5, 5);
            return finish(buf, 0.8);
        });
    }

    /* ------------------------------ boucle hyperpop ------------------------------
       Morceau original, 160 BPM, 22 s : intro, groove, montée, mini drop à 8 s,
       cassure, montée finale, coupure franche à 22 s. */
    const BPM = 160, BEAT = 60 / BPM, BAR = BEAT * 4, S16 = BEAT / 4, T0 = 0.5, LENGTH = 22;
    const CHORDS = [[54, 58, 61, 65, 68], [51, 54, 58, 61, 65], [47, 51, 54, 58, 63], [49, 53, 56, 61, 64]];
    const ROOTS = [30, 27, 35, 25];
    // Mélodie des voix (pas de seizième, note MIDI, durée en seizièmes, voyelle).
    const CHOPS = [
        [[0, 85, 2, "a"], [3, 82, 1, "i"], [4, 80, 2, "a"], [7, 82, 1, "e"], [8, 85, 1, "i"], [10, 87, 2, "a"], [14, 82, 2, "o"]],
        [[0, 80, 1, "i"], [2, 80, 1, "i"], [4, 82, 2, "a"], [6, 85, 1, "e"], [8, 87, 3, "a"], [12, 85, 1, "i"], [13, 82, 1, "i"], [14, 80, 2, "u"]],
        [[0, 78, 2, "a"], [3, 80, 1, "e"], [4, 82, 2, "i"], [8, 85, 1, "a"], [9, 87, 1, "a"], [10, 90, 3, "i"], [14, 87, 2, "o"]],
        [[0, 89, 1, "i"], [1, 87, 1, "i"], [2, 85, 1, "i"], [4, 82, 3, "a"], [8, 80, 1, "e"], [10, 82, 1, "e"], [12, 85, 4, "a"]]
    ];

    function renderMusic() {
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC || !ensure()) return Promise.resolve(null);
        const sr = ctx.sampleRate;
        const oc = new OAC(2, Math.ceil(sr * LENGTH), sr);
        const r = rng(2024);
        const nb = noiseFor(oc, 2);
        const at = (bar, s16) => T0 + bar * BAR + (s16 || 0) * S16;

        const out = oc.createGain();
        out.gain.value = 0.9;
        out.connect(oc.destination);

        // Bus supersaw : saturé, filtre automatisé, « pompe » sur la grosse caisse.
        const sawBus = oc.createGain(), sawLp = oc.createBiquadFilter(), sawDrive = shaper(oc, 3), pump = oc.createGain();
        sawLp.type = "lowpass";
        sawLp.Q.value = 4;
        sawBus.gain.value = 0.11;
        sawBus.connect(sawDrive).connect(sawLp).connect(pump).connect(out);
        const drumBus = oc.createGain();
        drumBus.gain.value = 0.9;
        drumBus.connect(out);
        const kickDrive = shaper(oc, 9);              // 808 explosé
        const kickBus = oc.createGain();
        kickBus.gain.value = 0.55;
        kickDrive.connect(kickBus).connect(out);
        const vox = oc.createGain();
        vox.gain.value = 0.42;
        const voxDelay = oc.createDelay(1), voxFb = oc.createGain();
        voxDelay.delayTime.value = BEAT * 0.75;
        voxFb.gain.value = 0.25;
        vox.connect(out);
        vox.connect(voxDelay).connect(voxFb).connect(voxDelay);
        voxFb.connect(out);

        // Coupe-bas global de l'intro, ouverture progressive.
        const f = sawLp.frequency;
        f.setValueAtTime(500, 0);
        f.exponentialRampToValueAtTime(2600, at(1));
        f.setValueAtTime(3400, at(1));
        f.setValueAtTime(3400, at(4));
        f.exponentialRampToValueAtTime(9000, at(4, 15));
        f.setValueAtTime(700, at(4, 15));              // trou juste avant le drop
        f.setValueAtTime(7000, at(5));
        f.setValueAtTime(7000, at(9));
        f.exponentialRampToValueAtTime(1200, at(9, 4));
        f.exponentialRampToValueAtTime(2400, at(11));
        f.exponentialRampToValueAtTime(10000, at(14));

        const pg = pump.gain;
        pg.setValueAtTime(1, 0);

        function kick(t, big) {
            const o = oc.createOscillator(), g = oc.createGain();
            o.type = "sine";
            o.frequency.setValueAtTime(190, t);
            o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
            o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(1, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.3, t + 0.2);
            g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.7 : 0.38));
            o.connect(g).connect(kickDrive);
            o.start(t);
            o.stop(t + 0.75);
            // Pompe : les nappes s'écartent à chaque coup.
            pg.setValueAtTime(0.25, t);
            pg.linearRampToValueAtTime(1, t + BEAT * 0.8);
        }

        function bass808(t, note, dur, glideTo) {
            const o = oc.createOscillator(), g = oc.createGain();
            o.type = "sine";
            o.frequency.setValueAtTime(midi(note), t);
            if (glideTo) o.frequency.exponentialRampToValueAtTime(midi(glideTo), t + dur * 0.9);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
            g.gain.setValueAtTime(0.7, t + dur * 0.8);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g).connect(kickDrive);
            o.start(t);
            o.stop(t + dur + 0.02);
        }

        const hatHp = oc.createBiquadFilter();
        hatHp.type = "highpass";
        hatHp.frequency.value = 8000;
        hatHp.connect(drumBus);
        function hat(t, open) {
            const s = oc.createBufferSource(), g = oc.createGain();
            s.buffer = nb;
            const d = open ? 0.12 : 0.03;
            g.gain.setValueAtTime(0.18 + r() * 0.08, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + d);
            s.connect(g).connect(hatHp);
            s.start(t, r() * 1.5, d + 0.01);
        }

        const snBp = oc.createBiquadFilter();
        snBp.type = "bandpass";
        snBp.frequency.value = 1900;
        snBp.Q.value = 0.8;
        snBp.connect(drumBus);
        function snare(t, level) {
            const s = oc.createBufferSource(), g = oc.createGain();
            s.buffer = nb;
            g.gain.setValueAtTime(0.6 * level, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            s.connect(g).connect(snBp);
            s.start(t, r() * 1.5, 0.18);
            const o = oc.createOscillator(), og = oc.createGain();
            o.type = "triangle";
            o.frequency.setValueAtTime(260, t);
            o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
            og.gain.setValueAtTime(0.35 * level, t);
            og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            o.connect(og).connect(drumBus);
            o.start(t);
            o.stop(t + 0.1);
        }

        // Supersaw : 5 dents de scie désaccordées par note, réparties gauche / droite.
        const panL = oc.createStereoPanner(), panR = oc.createStereoPanner(), panC = oc.createGain();
        panL.pan.value = -0.7;
        panR.pan.value = 0.7;
        for (const p of [panL, panR, panC]) p.connect(sawBus);
        const SIDES = [panL, panR, panC, panL, panR];
        function chord(t, dur, notes, shift) {
            for (const n of notes.slice(0, 4)) {
                for (let v = 0; v < 5; v++) {
                    const o = oc.createOscillator(), g = oc.createGain();
                    const det = (v - 2) * 14 + (r() - 0.5) * 6;
                    o.type = "sawtooth";
                    o.frequency.setValueAtTime(midi(n + 12), t);
                    o.detune.setValueAtTime(det, t);
                    if (shift) o.detune.linearRampToValueAtTime(det + shift * 100, t + dur);
                    g.gain.setValueAtTime(0.0001, t);
                    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
                    g.gain.setValueAtTime(0.2, t + dur - 0.03);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                    o.connect(g).connect(SIDES[v]);
                    o.start(t);
                    o.stop(t + dur + 0.01);
                }
            }
        }

        function chops(bar, pattern, transpose, stut) {
            for (const [s, n, len, v] of pattern) {
                const t = at(bar, s);
                const dur = len * S16 * 0.92;
                if (stut && len > 1) {
                    for (let k = 0; k < len * 2; k++) voice(oc, vox, t + k * S16 / 2, midi(n + transpose), S16 * 0.4, v, 0.45);
                } else voice(oc, vox, t, midi(n + transpose), dur, v, 0.5, r() < 0.2 ? 1.12 : 0);
            }
        }

        // Levée (0 - 0,5 s) : petite voix qui monte.
        voice(oc, vox, 0.05, midi(78), 0.4, "a", 0.4, 1.5);

        for (let bar = 0; bar < 14; bar++) {
            const c = bar % 4;
            const t = at(bar);
            const drop = bar >= 5 && bar <= 8;
            const breakdown = bar === 9 || bar === 10;
            const finalBuild = bar >= 11 && bar <= 13;

            // Nappes : en continu, montée de hauteur sur la dernière montée.
            if (bar === 4) {
                chord(t, BAR - S16, CHORDS[c]);
            } else if (bar === 13) {
                chord(t, BAR, CHORDS[c], 12);
            } else if (breakdown) {
                for (let k = 0; k < 4; k++) chord(at(bar, k * 4), BEAT * 0.5, CHORDS[c]);
            } else {
                chord(t, BAR, CHORDS[c]);
            }

            // Batterie.
            if (bar >= 1 && bar !== 4 && !breakdown && !finalBuild) {
                kick(t, drop);
                kick(at(bar, 6), drop);
                if (drop) kick(at(bar, 10), true);
                bass808(t, ROOTS[c], BEAT * 1.4, drop && c === 3 ? ROOTS[c] + 5 : 0);
                bass808(at(bar, 6), ROOTS[c], BEAT * 1.3);
                if (drop) bass808(at(bar, 10), ROOTS[c] + 12, BEAT * 1.4, ROOTS[c]);
                snare(at(bar, 4), 1);
                snare(at(bar, 12), 1);
                for (let s = 0; s < 16; s++) {
                    if (drop && s % 4 === 3) { hat(at(bar, s)); hat(at(bar, s + 0.5)); }
                    else hat(at(bar, s), s % 8 === 6);
                }
            }
            if (breakdown) {
                kick(t, true);
                bass808(t, ROOTS[c], BEAT * 2.5, ROOTS[c] - 7);
                snare(at(bar, 8), 1);
                for (let s = 0; s < 16; s += 2) hat(at(bar, s));
            }
            if (bar === 4) {
                // Montée vers le drop : roulement 8e -> 16e.
                for (let s = 0; s < 8; s += 2) snare(at(bar, s), 0.5 + s * 0.05);
                for (let s = 8; s < 15; s++) snare(at(bar, s), 0.7 + s * 0.02);
            }
            if (finalBuild) {
                kick(t, false);
                bass808(t, ROOTS[c], BEAT * 2);
                const density = bar === 11 ? 2 : bar === 12 ? 1 : 0.5;
                for (let s = 0; s < 16; s += density) snare(at(bar, s), 0.35 + (bar - 11) * 0.2 + s * 0.02);
                for (let s = 0; s < 16; s++) hat(at(bar, s));
            }

            // Voix.
            if (bar === 0) chops(bar, CHOPS[0], 0, false);
            else if (bar === 4) chops(bar, CHOPS[c].slice(0, 4), 0, true);
            else if (drop) chops(bar, CHOPS[c], 12, c === 3);
            else if (breakdown) chops(bar, CHOPS[c], 0, true);
            else if (finalBuild) chops(bar, CHOPS[c], bar - 11, bar === 13);
            else chops(bar, CHOPS[c], 0, false);
        }

        // Montée finale : souffle qui grimpe.
        {
            const s = oc.createBufferSource(), bp = oc.createBiquadFilter(), g = oc.createGain();
            s.buffer = nb;
            s.loop = true;
            bp.type = "bandpass";
            bp.Q.value = 2;
            bp.frequency.setValueAtTime(400, at(11));
            bp.frequency.exponentialRampToValueAtTime(9000, at(14));
            g.gain.setValueAtTime(0.0001, at(11));
            g.gain.exponentialRampToValueAtTime(0.35, at(14));
            s.connect(bp).connect(g).connect(out);
            s.start(at(11));
            s.stop(at(14));
        }
        // Coup final (21,5 - 22 s) puis coupure franche.
        kick(at(14), true);
        bass808(at(14), ROOTS[0] + 12, LENGTH - at(14), ROOTS[0]);
        chord(at(14), LENGTH - at(14) - 0.004, CHORDS[0]);
        voice(oc, vox, at(14), midi(90), LENGTH - at(14) - 0.02, "a", 0.5, 0.75);

        return oc.startRendering().then(buf => {
            const L = buf.getChannelData(0), R = buf.getChannelData(1);
            const i = sec => Math.round(sec * sr);
            const s32 = i(S16 / 2);
            for (const d of [L, R]) {
                // Bégaiements et glitchs.
                stutter(d, i(at(2, 14)), s32, 4);
                stutter(d, i(at(3, 12)), i(S16), 4);
                stutter(d, i(at(4, 12)), s32, 6);
                stutter(d, i(at(7, 8)), s32 / 2, 8);
                stutter(d, i(at(8, 12)), s32, 8);
                stutter(d, i(at(10, 8)), i(S16), 4);
                stutter(d, i(at(12, 12)), s32, 8);
                stutter(d, i(at(13, 8)), s32 / 2, 8);
                stutter(d, i(at(13, 12)), s32 / 4, 16);
                // Broyeur : léger partout, plus fort au drop et sur la cassure.
                crush(d, 0, i(at(5)), 2, 9);
                crush(d, i(at(5)), i(at(9)), 3, 7);
                crush(d, i(at(9)), i(at(11)), 6, 5);
                crush(d, i(at(11)), d.length, 2, 8);
                // Coupure franche à 22 s (4 ms pour éviter le claquement).
                const fade = i(0.004);
                for (let k = 0; k < fade; k++) d[d.length - 1 - k] *= k / fade;
            }
            return finish(buf, 0.85);
        });
    }

    function prepare() {
        if (!ensure()) return;
        if (!musicPromise) musicPromise = renderMusic().then(b => (musicBuf = b)).catch(() => null);
        if (!laughPromise) laughPromise = renderLaugh().then(b => (laughBuf = b)).catch(() => null);
    }

    function playBuffer(buf, dest) {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.connect(dest);
        s.start();
        return s;
    }

    async function laugh() {
        prepare();
        if (!laughPromise) return;
        await laughPromise;
        if (laughBuf && ctx) playBuffer(laughBuf, master);
    }

    // Lance la boucle de l'alien ; renvoie une promesse résolue au démarrage.
    async function music() {
        prepare();
        stopMusic();
        if (!musicPromise) return false;
        await musicPromise;
        if (!musicBuf || !ctx) return false;
        musicSrc = playBuffer(musicBuf, musicBus);
        musicStart = ctx.currentTime;
        const src = musicSrc;
        src.onended = () => { if (musicSrc === src) musicSrc = null; };
        return true;
    }

    function stopMusic() {
        if (musicSrc) { try { musicSrc.stop(); } catch (e) { /* déjà fini */ } }
        musicSrc = null;
    }

    // Niveau de la musique (0..1), pour les ondes du bouton son.
    function level() {
        if (!musicSrc || !analyser) return 0;
        analyser.getByteTimeDomainData(scratch);
        let sum = 0;
        for (let k = 0; k < scratch.length; k++) { const v = (scratch[k] - 128) / 128; sum += v * v; }
        return Math.min(1, Math.sqrt(sum / scratch.length) * 3);
    }

    // Position dans la musique (s), ou -1. Sert à caler la danse sur le tempo.
    const musicTime = () => (musicSrc && ctx ? ctx.currentTime - musicStart : -1);

    window.RenardSound = {
        STEPS: STEPS.length,
        BPM,
        get muted() { return muted; },
        get step() { return step; },
        setMuted(v) { muted = !!v; ensure(); applyGain(false); persist(); },
        toggle() { this.setMuted(!muted); return muted; },
        setStep(i) {
            step = Math.max(0, Math.min(STEPS.length - 1, i | 0));
            if (muted) muted = false;
            ensure();
            applyGain(false);
            persist();
        },
        onChange(fn) { listeners.add(fn); },
        unlock, prepare, babble, ding, pop, boing, puff, sneeze, laugh, music, stopMusic, level, musicTime,
        _buffers: () => ({ music: musicBuf, laugh: laughBuf })
    };
})();
