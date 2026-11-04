/* RENARD.mp3 — coque de l'interface.
   - app de bureau (WebView2, window.chrome.webview) : barre de titre maison
     (glisser, double-clic, réduire / agrandir / fermer), bords de 6 px pour
     redimensionner, messages de l'hôte ; en simple navigateur (launch.bat) rien
     de tout ça n'apparaît ;
   - bouton son (pixel art), curseur de volume en 5 crans, Ctrl + M ;
   - thème jour / nuit suivant le ciel, ou fixé dans les réglages ;
   - petite fenêtre de confirmation pixel.
   Expose window.RenardShell. */
(function () {
    "use strict";

    const DESKTOP = !!(window.chrome && window.chrome.webview);
    const $ = id => document.getElementById(id);
    const handlers = {};
    const SVG = "http://www.w3.org/2000/svg";

    function post(msg) {
        if (!DESKTOP) return;
        try { window.chrome.webview.postMessage(msg); } catch (e) { /* hôte indisponible */ }
    }
    function on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); }
    function emit(type, data) { for (const fn of handlers[type] || []) { try { fn(data || { type }); } catch (e) { console.error(e); } } }

    function store(key, value) {
        try {
            if (value === undefined) return localStorage.getItem(key);
            localStorage.setItem(key, value);
        } catch (e) { return null; }
        return null;
    }

    /* ------------------------------ pixel SVG ------------------------------ */
    function svg(w, h, cls) {
        const s = document.createElementNS(SVG, "svg");
        s.setAttribute("viewBox", `0 0 ${w} ${h}`);
        s.setAttribute("aria-hidden", "true");
        if (cls) s.setAttribute("class", cls);
        return s;
    }
    function px(parent, x, y, w, h, fill, cls) {
        const r = document.createElementNS(SVG, "rect");
        r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h);
        r.setAttribute("fill", fill);
        if (cls) r.setAttribute("class", cls);
        parent.append(r);
        return r;
    }
    function group(parent, cls) {
        const g = document.createElementNS(SVG, "g");
        if (cls) g.setAttribute("class", cls);
        parent.append(g);
        return g;
    }
    function bitmap(parent, rows, ox, oy, fill) {
        rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "X") px(parent, ox + x, oy + y, 1, 1, fill); }));
    }

    /* ------------------------------ barre de titre ------------------------------ */
    function windowIcon(kind) {
        const s = svg(12, 12);
        const c = "currentColor";
        if (kind === "min") px(s, 1, 6, 10, 2, c);
        else if (kind === "max") { px(s, 1, 1, 10, 2, c); px(s, 1, 1, 2, 10, c); px(s, 9, 1, 2, 10, c); px(s, 1, 9, 10, 2, c); }
        else if (kind === "restore") {
            px(s, 3, 0, 9, 2, c); px(s, 10, 0, 2, 8, c);
            px(s, 0, 3, 9, 2, c); px(s, 0, 3, 2, 9, c); px(s, 7, 3, 2, 9, c); px(s, 0, 10, 9, 2, c);
        } else {
            for (let i = 0; i < 10; i++) { px(s, 1 + i, 1 + i, 1.4, 1.4, c); px(s, 10 - i, 1 + i, 1.4, 1.4, c); }
        }
        return s;
    }

    let maxBtn = null;
    function buildTitlebar() {
        const bar = $("titlebar");
        if (!bar) return;
        document.documentElement.classList.add("desktop");
        bar.hidden = false;
        const btns = bar.querySelector(".tb-btns");
        const make = (cls, label, kind, fn) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tb-btn " + cls;
            b.title = label;
            b.setAttribute("aria-label", label);
            b.append(windowIcon(kind));
            b.addEventListener("click", fn);
            btns.append(b);
            return b;
        };
        make("min", "Réduire", "min", () => post("min"));
        maxBtn = make("max", "Agrandir", "max", () => post("max"));
        make("close", "Fermer", "close", () => emit("close-request"));

        // Glisser : la fenêtre part avec la souris ; deux appuis rapprochés = agrandir.
        let lastDown = 0;
        bar.addEventListener("mousedown", e => {
            if (e.button !== 0 || e.target.closest("button, .sound, .vol")) return;
            const t = performance.now();
            if (t - lastDown < 420) { lastDown = 0; post("dblclick"); return; }
            lastDown = t;
            post("drag");
        });

        // Bords de redimensionnement (codes HT* de Windows).
        const edges = { w: 10, e: 11, n: 12, nw: 13, ne: 14, s: 15, sw: 16, se: 17 };
        for (const [k, ht] of Object.entries(edges)) {
            const d = document.createElement("div");
            d.className = "edge " + k;
            d.addEventListener("mousedown", e => { if (e.button === 0) { e.preventDefault(); post("resize:" + ht); } });
            document.body.append(d);
        }
    }

    function setMaximized(v) {
        document.documentElement.classList.toggle("maximized", !!v);
        if (maxBtn) {
            maxBtn.replaceChildren(windowIcon(v ? "restore" : "max"));
            maxBtn.title = v ? "Restaurer" : "Agrandir";
            maxBtn.setAttribute("aria-label", maxBtn.title);
        }
    }

    /* ------------------------------ bouton son ------------------------------ */
    let soundBtn = null, waves = [], sayEl = null, sayTimer = 0, volBtns = [], volLabel = null;

    function speakerIcon() {
        const s = svg(20, 14);
        const ink = "#4a3f5c";
        const on = group(s, "on-part"), off = group(s, "off-part");
        // Haut-parleur crème (allumé) : contour + corps + pavillon.
        const speaker = (g, fill) => {
            px(g, 0, 4, 4, 6, ink); px(g, 1, 5, 2, 4, fill);
            px(g, 3, 3, 2, 8, ink); px(g, 5, 1, 2, 12, ink); px(g, 7, 0, 1, 14, ink);
            px(g, 3, 4, 2, 6, fill); px(g, 5, 2, 2, 10, fill);
            px(g, 1, 5, 1, 1, "#ffffff");
        };
        speaker(on, "#fff3dc");
        const w1 = group(on, "wave w1"), w2 = group(on, "wave w2"), w3 = group(on, "wave w3");
        px(w1, 9, 5, 1, 4, "#f4a6c8"); px(w1, 8, 4, 1, 1, "#f4a6c8"); px(w1, 8, 9, 1, 1, "#f4a6c8");
        px(w2, 11, 4, 1, 6, "#cbb8f2"); px(w2, 10, 3, 1, 1, "#cbb8f2"); px(w2, 10, 10, 1, 1, "#cbb8f2");
        px(w3, 13, 3, 1, 8, "#a9dcc0"); px(w3, 12, 2, 1, 1, "#a9dcc0"); px(w3, 12, 11, 1, 1, "#a9dcc0");
        waves = [w1, w2, w3];
        // Coupé : haut-parleur lavande, croix rose, mini renard endormi + zzz.
        speaker(off, "#cfc3ec");
        for (let i = 0; i < 4; i++) { px(off, 9 + i, 3 + i, 1, 1, "#e8799f"); px(off, 12 - i, 3 + i, 1, 1, "#e8799f"); }
        px(off, 14, 11, 5, 2, "#e58c55"); px(off, 17, 10, 2, 2, "#e58c55"); px(off, 17, 9, 1, 1, "#e58c55");
        px(off, 13, 12, 2, 1, "#fbefe2"); px(off, 18, 11, 1, 1, "#2a1e1c"); px(off, 14, 13, 5, 1, "#4a2a26");
        const zz = group(off, "zz");
        bitmap(zz, ["XXX", ".X.", "XXX"], 14, 4, "#8f84b8");
        bitmap(zz, ["XX", "XX"], 18, 1, "#8f84b8");
        return s;
    }

    function buildSound() {
        const S = window.RenardSound;
        if (!S) return;
        const wrap = document.createElement("div");
        wrap.className = "sound";
        soundBtn = document.createElement("button");
        soundBtn.type = "button";
        soundBtn.className = "sound-btn";
        soundBtn.append(speakerIcon());
        soundBtn.addEventListener("click", () => toggleSound());
        const vol = document.createElement("div");
        vol.className = "vol";
        vol.setAttribute("role", "group");
        vol.setAttribute("aria-label", "Volume");
        for (let i = 0; i < S.STEPS; i++) {
            const b = document.createElement("button");
            b.type = "button";
            b.style.height = (6 + i * 4) + "px";
            b.setAttribute("aria-label", `Volume ${i + 1} sur ${S.STEPS}`);
            b.addEventListener("click", () => { S.setStep(i); S.pop(); });
            vol.append(b);
            volBtns.push(b);
        }
        volLabel = document.createElement("span");
        vol.append(volLabel);
        sayEl = document.createElement("div");
        sayEl.className = "say";
        sayEl.hidden = true;
        wrap.append(soundBtn, vol, sayEl);

        const bar = $("titlebar");
        if (DESKTOP && bar) bar.insertBefore(wrap, bar.querySelector(".tb-btns"));
        else (document.querySelector(".top-right") || document.body).append(wrap);

        S.onChange(syncSound);
        syncSound();
        document.addEventListener("keydown", e => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "m" || e.key === "M")) { e.preventDefault(); toggleSound(); }
        });
        // Ondes calées sur la musique de l'alien pendant qu'elle joue.
        const tick = () => {
            requestAnimationFrame(tick);
            const dancing = window.RenardScene && RenardScene.dancing && !S.muted;
            soundBtn.classList.toggle("sync", !!dancing);
            if (dancing) {
                const l = S.level();
                waves.forEach((w, i) => w.setAttribute("opacity", l > [0.08, 0.3, 0.55][i] ? "1" : "0.25"));
            } else if (waves[0].hasAttribute("opacity")) {
                waves.forEach(w => w.removeAttribute("opacity"));
            }
        };
        requestAnimationFrame(tick);
    }

    function syncSound() {
        const S = window.RenardSound;
        soundBtn.classList.toggle("muted", S.muted);
        const label = S.muted ? "Son coupé (Ctrl + M)" : "Son activé (Ctrl + M)";
        soundBtn.title = label;
        soundBtn.setAttribute("aria-label", label);
        soundBtn.setAttribute("aria-pressed", String(!S.muted));
        volBtns.forEach((b, i) => b.classList.toggle("on", !S.muted && i <= S.step));
        volLabel.textContent = S.muted ? "muet" : [12, 25, 40, 60, 85][S.step] + " %";
    }

    function toggleSound() {
        const S = window.RenardSound;
        if (!S) return;
        S.unlock();
        const muted = S.toggle();
        if (!muted) S.pop();
        soundBtn.classList.remove("bounce");
        void soundBtn.offsetWidth;
        soundBtn.classList.add("bounce");
        sayEl.textContent = muted ? "son coupé" : "son activé";
        sayEl.hidden = false;
        clearTimeout(sayTimer);
        sayTimer = setTimeout(() => { sayEl.hidden = true; }, 1000);
    }

    /* ------------------------------ thème ------------------------------ */
    let themePref = store("renard-theme") || "auto", skyPhase = "day";
    function applyTheme() {
        const t = themePref === "auto" ? (skyPhase === "night" ? "dark" : "light") : themePref;
        document.documentElement.dataset.theme = t;
        for (const b of document.querySelectorAll("[data-theme-choice]")) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === themePref));
    }
    function setTheme(v) {
        themePref = ["light", "dark"].includes(v) ? v : "auto";
        store("renard-theme", themePref);
        applyTheme();
    }

    /* ------------------------------ menu réglages ------------------------------ */
    function buildMenu() {
        const btn = $("menuBtn"), menu = $("menu");
        if (!btn || !menu) return;
        const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
        btn.addEventListener("click", e => {
            e.stopPropagation();
            menu.hidden = !menu.hidden;
            btn.setAttribute("aria-expanded", String(!menu.hidden));
        });
        document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
        for (const b of menu.querySelectorAll("[data-theme-choice]")) b.addEventListener("click", () => setTheme(b.dataset.themeChoice));
    }

    /* ------------------------------ confirmation ------------------------------ */
    function ask(text, yes, no) {
        return new Promise(resolve => {
            const back = document.createElement("div");
            back.className = "dialog-back";
            const box = document.createElement("div");
            box.className = "dialog";
            box.setAttribute("role", "alertdialog");
            box.setAttribute("aria-modal", "true");
            const p = document.createElement("p");
            p.textContent = text;
            const row = document.createElement("div");
            row.className = "row";
            const done = v => { back.remove(); document.removeEventListener("keydown", key, true); resolve(v); };
            const bNo = document.createElement("button");
            bNo.type = "button"; bNo.className = "btn"; bNo.textContent = no || "rester";
            bNo.addEventListener("click", () => done(false));
            const bYes = document.createElement("button");
            bYes.type = "button"; bYes.className = "btn"; bYes.textContent = yes || "quitter";
            bYes.addEventListener("click", () => done(true));
            const key = e => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
            document.addEventListener("keydown", key, true);
            row.append(bNo, bYes);
            box.append(p, row);
            back.append(box);
            back.addEventListener("click", e => { if (e.target === back) done(false); });
            document.body.append(back);
            bNo.focus();
        });
    }

    /* ------------------------------ démarrage ------------------------------ */
    if (DESKTOP) {
        window.chrome.webview.addEventListener("message", e => {
            let d = e.data;
            if (typeof d === "string") { try { d = JSON.parse(d); } catch (err) { return; } }
            if (!d || !d.type) return;
            if (d.type === "maximized") setMaximized(d.value);
            emit(d.type, d);
        });
    }

    function init() {
        if (DESKTOP) buildTitlebar();
        buildSound();
        buildMenu();
        applyTheme();
        if (window.RenardScene) RenardScene.onPhase(p => { skyPhase = p; applyTheme(); });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();

    window.RenardShell = { DESKTOP, post, on, emit, ask, setTheme, get theme() { return themePref; } };
})();
