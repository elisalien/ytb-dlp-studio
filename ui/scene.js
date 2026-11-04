/* RENARD.mp3 — paysage pixel et renard.
   Un seul <canvas> plein écran, dessiné en basse résolution puis agrandi d'un
   facteur entier (image-rendering: pixelated) : pixels nets à toutes les tailles.
   - ciel piloté par l'heure système : hauteur du soleil calculée pour ~46° N
     (nuit, heure bleue, aube rose/pêche, jour, heure dorée, coucher orange/lavande,
     crépuscule), étoiles et lune (avec sa phase) la nuit, nuages lents ;
   - montagnes en couches avec dégradés tramés, colline au premier plan ;
   - le renard (dessiné en code : formes simples + contour automatique) et ses
     humeurs ; l'alien de l'œuf de Pâques.
   Expose window.RenardScene. */
(function () {
    "use strict";

    const LAT = 46;
    const HILL = 40;          // hauteur (pixels d'art) de la bande laissée libre en bas pour le renard
    const FPS = 30;

    const canvas = document.getElementById("scene");
    if (!canvas) return;
    const g = canvas.getContext("2d", { alpha: false });
    const skyC = document.createElement("canvas"), mtnC = document.createElement("canvas");

    let W = 0, H = 0, S = 3, cssPx = 3, dpr = 1;
    let pal = null, palKey = "", lastPalette = 0, phase = "day";
    const phaseListeners = new Set();

    /* ------------------------------ outils ------------------------------ */
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const css = (c, a) => a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    // Valeur tramée : t continu -> une des `n` bandes, tramage Bayer entre bandes voisines.
    function band(t, x, y, n) {
        const v = clamp(t, 0, 1) * (n - 1);
        let lo = Math.floor(v);
        if (lo < n - 1 && (v - lo) * 16 > BAYER[(y & 3) * 4 + (x & 3)] + 0.5) lo++;
        return lo / (n - 1);
    }
    function rng(seed) {
        return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    }
    // Bruit de valeur 1D lissé, déterministe (x en pixels d'art, indépendant de la largeur).
    function noise1(seed) {
        const r = rng(seed), pts = [];
        for (let i = 0; i < 512; i++) pts.push(r());
        return x => {
            const i = Math.floor(x), f = x - i, a = pts[((i % 512) + 512) % 512], b = pts[(((i + 1) % 512) + 512) % 512];
            const s = f * f * (3 - 2 * f);
            return a + (b - a) * s;
        };
    }

    /* ------------------------------ soleil ------------------------------ */
    // Longitude approchée d'après le fuseau horaire hors heure d'été.
    function longitude() {
        const y = new Date().getFullYear();
        const std = -Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset()) / 60;
        return std === 1 ? 5 : std * 15;   // Europe centrale : ~5° E (Lyon, Genève)
    }
    const LON = longitude();

    function sun(date) {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const n = (date.getTime() - start) / 86400000;
        const decl = 23.44 * Math.sin(2 * Math.PI * (284 + n) / 365) * Math.PI / 180;
        const B = 2 * Math.PI * (n - 81) / 364;
        const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
        const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
        let solar = utcMin + LON * 4 + eot;
        solar = ((solar % 1440) + 1440) % 1440;
        const ha = (solar / 4 - 180);             // angle horaire en degrés (-180..180)
        const lat = LAT * Math.PI / 180;
        const el = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha * Math.PI / 180));
        return { el: el * 180 / Math.PI, ha };
    }

    function moonPhase(date) {
        const synodic = 29.530588853;
        const ref = Date.UTC(2000, 0, 6, 18, 14);
        const p = (((date.getTime() - ref) / 86400000) % synodic + synodic) % synodic;
        return p / synodic;                       // 0 = nouvelle lune, 0,5 = pleine
    }

    /* ------------------------------ palettes ------------------------------ */
    // Images-clés par hauteur du soleil (degrés). Teintes calmes et désaturées.
    const EVENING = [
        [-90, "#121831", "#1b2343", "#28304f"],
        [-14, "#141b37", "#202a4c", "#2f3859"],
        [-9, "#1f2b52", "#38487a", "#62699a"],
        [-4, "#323e6c", "#6f6a9e", "#c89aaa"],
        [0, "#55679a", "#a986aa", "#eaa688"],
        [5, "#7495c0", "#c3b0bb", "#f0c897"],
        [12, "#88abd0", "#b9cfdc", "#e8e2c8"],
        [30, "#8db1d3", "#b8d0de", "#dde8e0"],
        [90, "#86acd1", "#b2cee0", "#e1ebe4"]
    ];
    const MORNING = [
        [-90, "#121831", "#1b2343", "#28304f"],
        [-14, "#141b37", "#202a4c", "#2f3859"],
        [-9, "#202c55", "#3d4a7e", "#6c6c9c"],
        [-4, "#3a4674", "#8d82ad", "#eab9b0"],
        [0, "#6676a8", "#c9a0b4", "#f5c9a8"],
        [5, "#7d9cc6", "#cdbcc2", "#f3dbb2"],
        [12, "#8aadd1", "#bbd0dc", "#ece6cc"],
        [30, "#8db1d3", "#b8d0de", "#dde8e0"],
        [90, "#86acd1", "#b2cee0", "#e1ebe4"]
    ];
    // Couches de montagnes : couleur de jour, de nuit.
    const LAYERS = [
        { day: "#a9b3cf", night: "#36406a", base: 0.50, amp: 0.20, seed: 11, freq: 1 / 38, snow: true },
        { day: "#97a9bf", night: "#2c375c", base: 0.58, amp: 0.15, seed: 23, freq: 1 / 30 },
        { day: "#8ea8a6", night: "#232c4a", base: 0.66, amp: 0.11, seed: 37, freq: 1 / 24 },
        { day: "#83a08c", night: "#1b233b", base: 0.74, amp: 0.08, seed: 51, freq: 1 / 18, trees: true }
    ];
    const HILL_DAY = hex("#9cbc8e"), HILL_NIGHT = hex("#202a38");

    function keyframes(list, el) {
        for (let i = 0; i < list.length - 1; i++) {
            const a = list[i], b = list[i + 1];
            if (el <= b[0]) {
                const t = smooth(0, 1, (el - a[0]) / (b[0] - a[0]));
                return [1, 2, 3].map(k => mix(hex(a[k]), hex(b[k]), t));
            }
        }
        const last = list[list.length - 1];
        return [hex(last[1]), hex(last[2]), hex(last[3])];
    }

    function computePalette(date) {
        const s = sun(date);
        const sky = keyframes(s.ha < 0 ? MORNING : EVENING, s.el);
        const light = smooth(-11, 8, s.el);                  // 0 nuit, 1 jour
        const warm = Math.max(0, 1 - Math.abs(s.el - 1) / 9); // proche de l'horizon
        const stars = 1 - smooth(-13, -5, s.el);
        return { sun: s, sky, light, warm, stars, moon: moonPhase(date) };
    }

    /* ------------------------------ ciel (cache) ------------------------------ */
    let starList = [];
    function drawSky() {
        skyC.width = W;
        skyC.height = H;
        const c = skyC.getContext("2d");
        const img = c.createImageData(W, H);
        const d = img.data;
        const [top, mid, hor] = pal.sky;
        const horizon = H * 0.72;
        for (let y = 0; y < H; y++) {
            const ty = y / horizon;
            for (let x = 0; x < W; x++) {
                let col;
                if (ty < 0.55) col = mix(top, mid, band(ty / 0.55, x, y, 7));
                else col = mix(mid, hor, band((ty - 0.55) / 0.45, x, y, 7));
                const i = (y * W + x) * 4;
                d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
            }
        }
        c.putImageData(img, 0, 0);

        // Étoiles fixes.
        if (pal.stars > 0.02) {
            for (const st of starList) {
                if (st.y > horizon * 0.95) continue;
                const a = pal.stars * st.b;
                c.fillStyle = css([246, 240, 226], a.toFixed(2));
                c.fillRect(st.x, st.y, 1, 1);
                if (st.big && a > 0.5) {
                    c.fillStyle = css([246, 240, 226], (a * 0.45).toFixed(2));
                    c.fillRect(st.x - 1, st.y, 1, 1); c.fillRect(st.x + 1, st.y, 1, 1);
                    c.fillRect(st.x, st.y - 1, 1, 1); c.fillRect(st.x, st.y + 1, 1, 1);
                }
            }
        }

        const s = pal.sun;
        const skyH = horizon;
        // Soleil : disque pâle et halo en anneaux.
        if (s.el > -4) {
            const sx = Math.round(W * (0.5 + s.ha / 220)), sy = Math.round(horizon - s.el / 70 * skyH);
            const warmC = mix([255, 246, 220], [255, 196, 150], pal.warm);
            for (const [r, a] of [[14, 0.08], [10, 0.12], [7, 0.2]]) disc(c, sx, sy, r, css(warmC, a));
            disc(c, sx, sy, 5, css(mix(warmC, [255, 255, 245], 0.5)));
        }
        // Lune la nuit, avec sa phase.
        if (pal.stars > 0.25) {
            const ill = pal.moon;
            const mx = Math.round(W * (0.78 - 0.5 * ((s.ha + 360) % 360 - 180) / 360)), my = Math.round(skyH * 0.22);
            moon(c, clamp(mx, 12, W - 12), my, 6, ill, pal.stars);
        }
    }

    function disc(c, cx, cy, r, color) {
        c.fillStyle = color;
        for (let y = -r; y <= r; y++) {
            const half = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
            c.fillRect(cx - half, cy + y, half * 2 + 1, 1);
        }
    }

    function moon(c, cx, cy, r, p, a) {
        const lit = [244, 238, 222], dark = mix(pal.sky[0], [60, 70, 110], 0.3);
        disc(c, cx, cy, r + 3, css([240, 236, 220], (0.08 * a).toFixed(2)));
        // Terminateur : ellipse dont la largeur suit la phase.
        const k = Math.cos(p * 2 * Math.PI);      // 1 nouvelle, -1 pleine
        for (let y = -r; y <= r; y++) {
            const half = Math.sqrt(Math.max(0, r * r - y * y + r * 0.6));
            for (let x = -Math.floor(half); x <= Math.floor(half); x++) {
                const term = k * half;
                const waxing = p < 0.5;
                const isLit = waxing ? x > term : x < -term;
                c.fillStyle = css(isLit ? lit : dark, isLit ? a : (0.55 * a).toFixed(2));
                c.fillRect(cx + x, cy + y, 1, 1);
            }
        }
        if (Math.abs(p - 0.5) < 0.3) {           // quelques cratères sur la partie éclairée
            c.fillStyle = css([214, 208, 196], a);
            c.fillRect(cx - 2, cy - 1, 2, 1); c.fillRect(cx + 1, cy + 2, 1, 1); c.fillRect(cx + 2, cy - 3, 1, 1);
        }
    }

    /* ------------------------------ montagnes (cache) ------------------------------ */
    const layerNoise = LAYERS.map(l => [noise1(l.seed), noise1(l.seed + 100), noise1(l.seed + 200)]);
    let hillTop = [];     // ordonnée du sol de la colline, par colonne

    function ridge(i, x) {
        const L = LAYERS[i], [a, b, c] = layerNoise[i];
        const v = a(x * L.freq) * 0.62 + b(x * L.freq * 2.3) * 0.28 + c(x * L.freq * 5.1) * 0.1;
        // Pics un peu pointus : on creuse les vallées.
        const peak = Math.pow(v, 1.4);
        return Math.round(H * (L.base + L.amp * 0.5) - peak * L.amp * H * 1.6 - (H - 200) * 0.05);
    }

    function drawMountains() {
        mtnC.width = W;
        mtnC.height = H;
        const c = mtnC.getContext("2d");
        const img = c.createImageData(W, H);
        const d = img.data;
        const hor = pal.sky[2];
        const light = pal.light;
        const put = (x, y, col) => {
            if (y < 0 || y >= H) return;
            const i = (y * W + x) * 4;
            d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
        };
        const ground = H - HILL;
        LAYERS.forEach((L, li) => {
            const day = hex(L.day), night = hex(L.night);
            let base = mix(night, day, light);
            // Perspective atmosphérique : les couches lointaines prennent la teinte de l'horizon.
            base = mix(base, hor, (0.42 - li * 0.1) * (0.4 + light * 0.6));
            const rim = mix(base, mix(hor, [255, 236, 214], pal.warm * 0.5), 0.35 + pal.warm * 0.25);
            const deep = mix(base, mix([40, 46, 80], base, 0.4), 0.35);
            const r = rng(L.seed * 7);
            for (let x = 0; x < W; x++) {
                const top = ridge(li, x);
                const bottom = H;
                for (let y = top; y < bottom; y++) {
                    const t = (y - top) / Math.max(1, bottom - top);
                    let col = y - top < 2 ? (y === top ? rim : mix(rim, base, 0.5)) : mix(base, deep, band(t, x, y, 5));
                    // Neige sur les sommets lointains.
                    if (L.snow && y - top < 3 + (x % 5 === 0 ? 1 : 0) && top < H * 0.42) col = mix(col, [236, 238, 246], 0.55 + light * 0.3);
                    put(x, y, col);
                }
                // Sapins sur la couche proche.
                if (L.trees && r() < 0.11) {
                    const th = 4 + Math.floor(r() * 5), tc = mix(deep, [30, 40, 50], 0.25);
                    for (let k = 0; k < th; k++) {
                        const half = Math.floor((th - k) / 2.6);
                        for (let dx = -half; dx <= half; dx++) if (x + dx >= 0 && x + dx < W) put(x + dx, top - 1 - k + th - 1, tc);
                    }
                }
            }
        });

        // Colline du premier plan : douce bosse sous le renard.
        const hillC = mix(HILL_NIGHT, HILL_DAY, light), hillRim = mix(hillC, mix(hor, [235, 245, 210], 0.5), 0.35), hillDeep = mix(hillC, [30, 40, 44], 0.35);
        hillTop = new Array(W);
        const home = foxHome();
        for (let x = 0; x < W; x++) {
            const dx = (x - home) / Math.max(60, W * 0.35);
            const top = Math.round(H - 9 - 4 * Math.exp(-dx * dx * 2.2) + Math.sin(x / 23) * 1.2 + Math.sin(x / 9.3) * 0.6);
            hillTop[x] = top;
            for (let y = top; y < H; y++) {
                const t = (y - top) / Math.max(1, H - top);
                const col = t < 0.12 ? mix(hillRim, hillC, band(t / 0.12, x, y, 3)) : mix(hillC, hillDeep, band((t - 0.12) / 0.88, x, y, 4));
                put(x, y, col);
            }
        }
        c.putImageData(img, 0, 0);
        // Brins d'herbe fixes et petites fleurs.
        const rr = rng(99);
        for (let x = 0; x < W; x += 1) {
            if (rr() < 0.35) {
                c.fillStyle = css(mix(hillDeep, hillC, 0.3));
                c.fillRect(x, hillTop[x] + 2 + Math.floor(rr() * (H - hillTop[x] - 4)), 1, 1);
            }
            if (rr() < 0.025) {
                const fc = [[244, 214, 222], [246, 238, 214], [214, 204, 240]][Math.floor(rr() * 3)];
                c.fillStyle = css(mix(fc, [60, 70, 100], 1 - light * 0.8 - 0.2));
                c.fillRect(x, hillTop[x] + 3 + Math.floor(rr() * 6), 1, 1);
            }
        }
        grassCol = { a: mix(hillRim, [230, 240, 200], 0.15), b: hillC };
    }
    let grassCol = { a: [180, 200, 160], b: [150, 180, 140] };

    /* ------------------------------ nuages ------------------------------ */
    let clouds = [];
    function makeClouds() {
        const r = rng(5);
        clouds = [];
        const n = Math.max(3, Math.round(W / 90));
        for (let i = 0; i < n; i++) {
            const w = 18 + Math.floor(r() * 26), h = 6 + Math.floor(r() * 5);
            const puffs = [];
            for (let k = 0; k < 4; k++) puffs.push([4 + r() * (w - 8), h * 0.55 + r() * 2, 3 + r() * (h * 0.55), 2.5 + r() * 2.5]);
            clouds.push({ x: r() * (W + 60) - 30, y: 8 + r() * H * 0.32, w, h, puffs, v: 0.35 + r() * 0.6, c: null });
        }
    }
    function renderCloud(cl) {
        const cv = document.createElement("canvas");
        cv.width = cl.w;
        cv.height = cl.h + 4;
        const c = cv.getContext("2d");
        const lightC = mix(mix([60, 70, 110], [252, 250, 246], pal.light), pal.sky[2], 0.25 + pal.warm * 0.3);
        const shadeC = mix(lightC, mix(pal.sky[1], [210, 160, 180], pal.warm * 0.6), 0.45);
        const a = 0.35 + pal.light * 0.55;
        for (let y = 0; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
                let inside = false;
                for (const [px, py, rx, ry] of cl.puffs) if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 < 1) inside = true;
                if (y >= cl.h * 0.55 && y <= cl.h && x > 2 && x < cl.w - 3) inside = true;
                if (!inside) continue;
                const t = y / cv.height;
                c.fillStyle = css(mix(lightC, shadeC, band(t, x, y, 3)), a.toFixed(2));
                c.fillRect(x, y, 1, 1);
            }
        }
        cl.c = cv;
    }

    /* ------------------------------ sprites ------------------------------ */
    // Couleurs indexées : 1 contour, 2 orange, 3 orange ombré, 4 crème, 5 crème ombré,
    // 6 sombre (yeux), 7 rose, 8 éclat, 9 joue, 10 vert alien, 11 vert ombré, 12 antenne, 13 bois.
    const COLORS = [null, "#4a2a26", "#e58c55", "#c06a3e", "#fbefe2", "#e3cfbe", "#2a1e1c", "#f2b3bf", "#ffffff", "#f6a5a8",
        "#c4ecb6", "#8fc489", "#f4a6c8", "#9a6b4a"];

    // Couleurs effectives : assombries et bleuies la nuit.
    let TINT = COLORS.slice();
    function tintSprites(light) {
        const k = (1 - light) * 0.5;
        TINT = COLORS.map(c => c && css(mix(hex(c), [40, 48, 88], k)));
    }

    class Spr {
        constructor(w, h, oy) { this.w = w; this.h = h; this.oy = oy || 0; this.p = new Uint8Array(w * h); }
        set(x, y, c) {
            x = Math.round(x); y = Math.round(y + this.oy);
            if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c;
        }
        ell(cx, cy, rx, ry, c) {
            for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
                for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
                    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                    if (dx * dx + dy * dy <= 1) this.set(x, y, c);
                }
            }
        }
        rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
        line(x0, y0, x1, y1, c, th) {
            const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
            for (let k = 0; k <= n; k++) {
                const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
                if (th > 1) this.rect(Math.round(x - th / 2 + 0.5), Math.round(y - th / 2 + 0.5), th, th, c);
                else this.set(x, y, c);
            }
        }
        tri(ax, ay, bx, by, cx, cy, c) {
            const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
            const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
            const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const px = x + 0.5, py = y + 0.5;
                    const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
                    const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
                    if (w0 >= -0.02 && w1 >= -0.02 && 1 - w0 - w1 >= -0.02) this.set(x, y, c);
                }
            }
        }
        chain(pts, r, c, tipColor, tipCount) {
            // Suite de disques le long d'un chemin (queue).
            const n = pts.length;
            for (let i = 0; i < n - 1; i++) {
                const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
                for (let k = 0; k < 4; k++) {
                    const t = k / 4, rr = r * (1 - (i + t) / n * 0.25);
                    this.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rr, rr, i >= n - 1 - (tipCount || 0) ? tipColor : c);
                }
            }
            const [lx, ly] = pts[n - 1];
            this.ell(lx, ly, r * 0.7, r * 0.7, tipColor);
        }
        outline(c) {
            const src = this.p.slice(), w = this.w, h = this.h;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (src[y * w + x]) continue;
                    if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) ||
                        (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) this.p[y * w + x] = c;
                }
            }
            return this;
        }
        draw(ctx, ox, oy, flip, alpha) {
            if (alpha !== undefined) ctx.globalAlpha = alpha;
            for (let y = 0; y < this.h; y++) {
                for (let x = 0; x < this.w; x++) {
                    const v = this.p[y * this.w + x];
                    if (!v) continue;
                    ctx.fillStyle = this.raw ? COLORS[v] : TINT[v];
                    ctx.fillRect(ox + (flip ? this.w - 1 - x : x), oy + y, 1, 1);
                }
            }
            ctx.globalAlpha = 1;
        }
    }

    // Repères du renard : boîte 34 x 31, pieds sur y = 27 (oy = 3 pour la marge des oreilles).
    const FW = 34, FH = 31, FOY = 3, FEET = 27 + FOY, FCX = 16;

    function earsFor(s, mode, dx, dy) {
        dx = dx || 0; dy = dy || 0;
        if (mode === "down") {
            s.tri(15 + dx, 8 + dy, 11 + dx, 5 + dy, 17 + dx, 5.5 + dy, 2);
            s.tri(18.5 + dx, 6 + dy, 15 + dx, 3 + dy, 21 + dx, 5 + dy, 2);
            s.set(15 + dx, 6 + dy, 7);
        } else {
            const up = mode === "alert" ? -1.5 : 0;
            s.tri(15.5 + dx, 7 + dy, 16.5 + dx, 0.5 + dy + up, 19.5 + dx, 5.5 + dy, 2);
            s.tri(19 + dx, 5.5 + dy, 21.5 + dx, 0.5 + dy + up, 23.5 + dx, 6.5 + dy, 2);
            s.set(17 + dx, 3 + dy + up * 0.5, 7); s.set(17 + dx, 4 + dy, 7);
            s.set(21.5 + dx, 3 + dy + up * 0.5, 7); s.set(21.5 + dx, 4 + dy, 7);
        }
    }

    function eyes(s, kind, x, y) {
        if (kind === "closed") { s.set(x - 1, y + 1, 6); s.set(x, y + 1, 6); }
        else if (kind === "happy") { s.set(x - 1, y + 1, 6); s.set(x, y, 6); s.set(x + 1, y + 1, 6); }
        else if (kind === "wide") { s.set(x, y, 6); s.set(x, y + 1, 6); s.set(x + 1, y, 6); s.set(x + 1, y + 1, 6); s.set(x, y, 8); }
        else { s.set(x, y, 6); s.set(x, y + 1, 6); }
    }

    function head(s, o) {
        const dx = o.dx || 0, dy = o.dy || 0;
        s.ell(19.5 + dx, 9 + dy, 4.6, 4.2, 2);
        s.ell(23 + dx, 11.2 + dy, 3, 1.9, 4);
        s.ell(18.6 + dx, 11.6 + dy, 2.2, 1.4, 4);
        s.set(25.6 + dx, 10.4 + dy, 6);
        eyes(s, o.eyes || "open", 21 + dx, 7.6 + dy);
        if (o.eyes !== "wide") s.set(22.6 + dx, 10.5 + dy, 9);
        earsFor(s, o.ears, dx, dy);
    }

    function foxSit(o) {
        const s = new Spr(FW, FH, FOY);
        const t = o.t || 0;
        // Queue enroulée au sol, ou qui remue.
        if (o.wag) {
            const a = Math.sin(t * 14) * 2.2;
            s.chain([[12, 23], [9, 20], [7.5 + a * 0.4, 16], [7 + a, 12.5], [8 + a * 1.3, 10]], 2.6, 2, 4, 1);
        } else {
            const a = Math.sin(t * 1.3) * 0.5;
            s.chain([[12, 24.5], [8, 24.5], [5, 23.5], [3.5 + a, 21], [4 + a, 18.5]], 2.6, 2, 4, 1);
        }
        s.ell(13, 21.5, 5, 4.6, 2);                       // cuisse
        s.ell(12.5, 22.5, 3.2, 2.5, 3);
        s.ell(16, 17, 4.6, 6.6, 2);                       // corps
        s.ell(19, 17.5, 2.3, 4.5, 4);                     // poitrail
        if (o.raise) {
            s.line(20.5, 18, 24, 12.5, 2, 2);             // patte levée qui tient le panneau
            s.rect(23, 11, 2, 2, 4);
        } else {
            s.rect(20, 19, 2, 7, 2); s.rect(20, 25, 2, 1, 4);
        }
        s.rect(17, 19, 2, 7, 3); s.rect(17, 25, 2, 1, 5);
        head(s, { dx: o.hx || 0, dy: o.hy || 0, eyes: o.eyes, ears: o.ears });
        return s.outline(1);
    }

    function foxSleep(o) {
        const s = new Spr(FW, FH, FOY);
        const b = Math.sin((o.t || 0) * 1.6) * 0.5 + 0.5;
        s.ell(15, 23.4, 8.2, 4.1 + b * 0.5, 2);
        s.ell(15, 25.5, 7, 1.4, 3);
        // Tête posée, oreilles basses.
        s.tri(18, 20.5, 18.8, 16.6 - b * 0.3, 21, 19.5, 2);
        s.tri(20.6, 19.6, 22.6, 16.8 - b * 0.3, 23.6, 20, 2);
        s.set(19, 18.4, 7); s.set(22.3, 18.6, 7);
        s.ell(21.2, 22, 3.8, 3.1, 2);
        s.ell(24, 23.5, 2.2, 1.4, 4);
        s.set(26, 23, 6);
        eyes(s, "closed", 22, 20.6);
        // La queue passe devant, le bout blanc sous le museau.
        s.chain([[7.5, 23.5], [9.5, 26], [14, 27], [19, 26.6], [23, 25.8]], 2.4, 2, 4, 1);
        return s.outline(1);
    }

    function legs(s, hx, hy, ang, len, c, paw) {
        const ex = hx + Math.sin(ang) * len, ey = hy + Math.cos(ang) * len;
        s.line(hx, hy, ex, ey, c, 2);
        s.rect(Math.round(ex - 0.5), Math.round(ey), 2, 1, paw);
    }

    function foxRun(o) {
        const s = new Spr(FW, FH, FOY);
        const p = (o.p || 0) * Math.PI * 2;
        const bob = o.air ? 0 : Math.round(Math.sin(p * 2) * 0.8);
        const swing = o.air ? 0.9 : Math.sin(p) * 0.85;
        legs(s, 11, 19 + bob, o.air ? 1.1 : -swing, 6, 3, 5);
        legs(s, 20, 19 + bob, o.air ? -1.0 : swing, 6, 3, 5);
        s.chain([[9, 17 + bob], [6, 16 + bob], [3.5, 15 + bob + Math.sin(p + 1)], [1.5, 14 + bob + Math.sin(p + 1.4) * 1.5]], 2.3, 2, 4, 1);
        s.ell(15, 18 + bob, 7, 3.7, 2);
        s.ell(16, 20.3 + bob, 5, 1.4, 4);
        legs(s, 13, 19 + bob, o.air ? 1.2 : swing, 6, 2, 4);
        legs(s, 21.5, 19 + bob, o.air ? -0.9 : -swing, 6, 2, 4);
        head(s, { dx: 3.5, dy: 4 + bob, eyes: o.eyes || "open", ears: o.ears || "up" });
        return s.outline(1);
    }

    function foxPlay(o) {
        const s = new Spr(FW, FH, FOY);
        const t = o.t || 0;
        const hit = Math.sin(t * 7) > 0;
        const w = Math.sin(t * 5) * 2;
        s.chain([[9, 20], [6, 17], [5 + w * 0.3, 13], [6 + w, 9.5]], 2.4, 2, 4, 1);
        s.ell(11, 21, 4.6, 4.4, 2);
        s.rect(9, 24, 2, 2, 3); s.rect(9, 25, 2, 1, 5);
        s.ell(15.5, 21.5, 6, 3.2, 2);
        s.ell(17, 23.3, 4, 1.2, 4);
        s.rect(19, 23, 2, 3, 3); s.rect(19, 25, 2, 1, 5);
        if (hit) { s.line(21, 22, 25, 17.5, 2, 2); s.rect(25, 16.5, 2, 1, 4); }
        else { s.line(21, 22, 26, 24.5, 2, 2); s.rect(26, 25, 2, 1, 4); }
        head(s, { dx: 2.5, dy: 10.5, eyes: "wide", ears: "alert" });
        return s.outline(1);
    }

    function foxStretch(o) {
        const s = new Spr(FW, FH, FOY);
        const k = o.k || 0;          // 0..1 amplitude de l'étirement
        s.chain([[7, 15], [5.5, 11], [5, 7.5 - k], [6, 4.5 - k]], 2.3, 2, 4, 1);
        s.rect(9, 18, 2, 8, 3); s.rect(12, 18, 2, 8, 2);
        s.rect(9, 25, 2, 1, 5); s.rect(12, 25, 2, 1, 4);
        s.ell(11, 16.5, 4.6, 4.2, 2);
        s.ell(17, 19.5 + k, 5.4, 3, 2);
        s.line(19, 23, 25 + k * 2, 25.5, 3, 2); s.line(20, 22.5, 27 + k * 2, 25.5, 2, 2);
        s.rect(26 + Math.round(k * 2), 25, 2, 1, 4);
        head(s, { dx: 4.5, dy: 10 + k, eyes: "happy", ears: "up" });
        return s.outline(1);
    }

    function alienSprite(o) {
        const s = new Spr(22, 30, 4);
        const arm = o.arm || 0, laugh = o.laugh;
        s.line(7, 3, 4 + (o.ant || 0), -1.5, 11, 1); s.line(13, 3, 16 - (o.ant || 0), -1.5, 11, 1);
        s.ell(4 + (o.ant || 0), -2, 1.4, 1.4, 12); s.ell(16 - (o.ant || 0), -2, 1.4, 1.4, 12);
        // Bras : poses de danse.
        const poses = [[[6, 15, 2, 10], [14, 15, 18, 10]], [[6, 15, 2, 19], [14, 15, 18, 19]], [[6, 15, 3, 9], [14, 15, 18, 18]], [[6, 15, 2, 18], [14, 15, 17, 9]]];
        for (const [x0, y0, x1, y1] of poses[arm % 4]) { s.line(x0, y0, x1, y1, 10, 2); s.rect(x1 - 0.5, y1 - 0.5, 2, 2, 11); }
        s.line(8.5, 19, 7.5 + (o.leg || 0), 24.5, 10, 2); s.line(11.5, 19, 12.5 + (o.leg || 0), 24.5, 10, 2);
        s.ell(10, 16.5, 3.6, 4.2, 10);
        s.ell(10, 18, 2.2, 2, 11);
        s.ell(10, 7.5, 7, 5.6, 10);
        s.ell(10, 10.5, 5, 2, 11);
        s.ell(10, 7, 6.4, 4.4, 10);
        s.ell(6.8, 8, 1.7, 2.4, 6); s.ell(13.2, 8, 1.7, 2.4, 6);
        s.set(6.3, 6.6, 8); s.set(12.7, 6.6, 8);
        if (laugh) { s.rect(7.5, 11, 5, 1, 6); s.set(8, 12, 6); s.set(11, 12, 6); s.set(9.5, 12, 12); }
        else { s.set(9, 11, 11); s.set(10, 11.4, 11); s.set(11, 11, 11); }
        return s.outline(1);
    }

    /* ------------------------------ particules ------------------------------ */
    const BITMAPS = {
        z: ["XXX", "..X", ".X.", "XXX"],
        Z: ["XXXX", "...X", "..X.", ".X..", "XXXX"],
        heart: [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."],
        note: ["..XX", "..X.", "..X.", "XXX.", "XX.."],
        note2: [".XXXXX", ".X...X", ".X...X", "XX..XX", "XX..XX"],
        spark: [".X.", "XXX", ".X."],
        dust: ["XX"]
    };
    let parts = [];
    function emit(kind, x, y, o) { parts.push(Object.assign({ kind, x, y, vx: 0, vy: 0, life: 0, max: 1.5, color: "#ffffff" }, o)); }

    function drawBitmap(bm, x, y, color, alpha) {
        g.globalAlpha = alpha;
        g.fillStyle = color;
        for (let j = 0; j < bm.length; j++) for (let i = 0; i < bm[j].length; i++) if (bm[j][i] === "X") g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
        g.globalAlpha = 1;
    }

    function stepParts(dt) {
        const keep = [];
        for (const p of parts) {
            p.life += dt;
            if (p.life >= p.max) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.wobble) p.x += Math.sin(p.life * p.wobble) * 0.15;
            const fade = 1 - p.life / p.max;
            const a = fade > 0.66 ? 1 : fade > 0.33 ? 0.7 : 0.4;   // fondu en marches
            if (p.kind === "smoke") {
                const r = p.r0 + p.life * p.grow;
                g.fillStyle = p.color;
                g.globalAlpha = a * 0.9;
                const R = Math.round(r);
                for (let yy = -R; yy <= R; yy++) {
                    const half = Math.floor(Math.sqrt(Math.max(0, R * R - yy * yy + R * 0.5)));
                    g.fillRect(Math.round(p.x) - half, Math.round(p.y) + yy, half * 2 + 1, 1);
                }
                g.globalAlpha = 1;
            } else {
                drawBitmap(BITMAPS[p.kind], p.x, p.y, p.color, a);
            }
            keep.push(p);
        }
        parts = keep;
    }

    function smokePuff(x, y) {
        const colors = ["#f4f1ec", "#ddd8e4", "#c9c6d6", "#ffffff"];
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 14;
            emit("smoke", x + Math.cos(a) * 3, y + Math.sin(a) * 2, {
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 4, r0: 2 + Math.random() * 2, grow: 4 + Math.random() * 3,
                max: 0.6 + Math.random() * 0.35, color: colors[i % colors.length]
            });
        }
    }

    /* ------------------------------ renard : état ------------------------------ */
    const fox = {
        x: 0, y: 0, dir: 1, mood: "idle", progress: 0,
        action: null, actionT: 0, actionLen: 0,   // réaction ponctuelle (étirement, saut...)
        moodT: 0, awakeUntil: 0, alertUntil: 0, hidden: false, runPhase: 0,
        sign: false
    };
    let now = 0, zTimer = 0, egg = null;

    function foxHome() { return clamp(Math.round(W * 0.16), 26, Math.max(26, W - 40)); }
    function groundAt(x) { return hillTop.length ? hillTop[clamp(Math.round(x), 0, W - 1)] : H - HILL + 4; }

    function setMood(m, progress) {
        if (typeof progress === "number") fox.progress = clamp(progress, 0, 1);
        if (m === fox.mood) return;
        fox.mood = m;
        fox.moodT = now;
        if (m === "idle") fox.awakeUntil = now + 6;
    }

    function play(action, len) {
        if (egg) return;
        fox.action = action;
        fox.actionT = now;
        fox.actionLen = len;
    }

    function celebrate() {
        play("jump", 2.6);
        if (window.RenardSound) RenardSound.ding();
        fox.awakeUntil = now + 8;
    }
    function sad() { play("sad", 6); }
    function alert(on) { fox.alertUntil = on ? now + 60 : 0; }

    function updateFox(dt) {
        const home = foxHome();
        let target = home;
        const running = fox.mood === "download" && !fox.action;
        if (running) {
            // Court d'un bord à l'autre de la colline ; la vitesse suit la progression.
            const span = clamp(W * 0.1, 16, 46);
            const speed = 18 + fox.progress * 42;
            fox.x += fox.dir * speed * dt;
            if (fox.x > home + span) { fox.x = home + span; fox.dir = -1; }
            if (fox.x < home - span) { fox.x = home - span; fox.dir = 1; }
            fox.runPhase = (fox.runPhase + dt * (1.6 + fox.progress * 2.6)) % 1;
            if (Math.random() < dt * 6) emit("dust", fox.x - fox.dir * 8, groundAt(fox.x) - 1, { vx: -fox.dir * 8, vy: -4, max: 0.5, color: css(mix(grassCol.b, [240, 230, 210], 0.5)) });
            return;
        }
        // Retour tranquille à la maison.
        if (Math.abs(fox.x - target) > 0.6) {
            fox.dir = fox.x < target ? 1 : -1;
            fox.x += fox.dir * Math.min(28 * dt, Math.abs(fox.x - target));
            fox.runPhase = (fox.runPhase + dt * 1.8) % 1;
        } else {
            fox.x = target;
            fox.dir = 1;
        }
    }

    function poseFox() {
        const t = now;
        const a = fox.action, at = t - fox.actionT;
        if (a && at > fox.actionLen) fox.action = null;
        const moving = !fox.action && fox.mood !== "download" && Math.abs(fox.x - foxHome()) > 0.6;
        let spr, lift = 0, holding = false;
        if (fox.action === "jump") {
            const k = (at % 0.65) / 0.65;
            lift = Math.round(Math.sin(k * Math.PI) * 9);
            spr = lift > 1 ? foxRun({ air: true, eyes: "happy", ears: "up" }) : foxSit({ eyes: "happy", t });
            if (Math.random() < 0.14) emit("heart", fox.x - 2 + (Math.random() * 12 - 6), groundAt(fox.x) - 22 - lift, {
                vy: -10, vx: (Math.random() - 0.5) * 6, max: 1.6, wobble: 6, color: ["#f4a6c8", "#f7b8c4", "#e98fb0"][Math.floor(Math.random() * 3)]
            });
        } else if (fox.action === "sad") {
            spr = foxSit({ eyes: "closed", ears: "down", hy: 1, t });
        } else if (fox.action === "stretch") {
            spr = foxStretch({ k: Math.sin(clamp(at / fox.actionLen, 0, 1) * Math.PI) });
        } else if (fox.action === "wag") {
            spr = foxSit({ wag: true, eyes: "happy", t });
        } else if (fox.action === "sneeze") {
            const pk = at > 0.35 && at < 0.6;
            spr = foxSit({ eyes: at < 0.6 ? "closed" : "open", hx: pk ? 1 : 0, hy: pk ? 1.5 : 0, t });
            if (at > 0.35 && at < 0.4) for (let i = 0; i < 5; i++) emit("dust", fox.x + 10 * fox.dir, groundAt(fox.x) - 17, { vx: fox.dir * (15 + Math.random() * 20), vy: (Math.random() - 0.6) * 15, max: 0.5, color: "#ffffff" });
        } else if (fox.action === "boop") {
            spr = foxSit({ eyes: "happy", ears: "alert", t });
        } else if (fox.mood === "download" || moving) {
            spr = foxRun({ p: fox.runPhase, ears: "up" });
        } else if (fox.mood === "convert") {
            spr = foxPlay({ t });
        } else if (fox.sign) {
            spr = foxSit({ raise: true, ears: "alert", t });
            holding = true;
        } else if (fox.alertUntil > t) {
            spr = foxSit({ eyes: "wide", ears: "alert", t });
        } else if (fox.awakeUntil > t) {
            const blink = (t % 4.2) < 0.15;
            spr = foxSit({ eyes: blink ? "closed" : "open", t });
        } else {
            spr = foxSleep({ t });
            zTimer -= 1 / FPS;
            if (zTimer <= 0) {
                const night = pal && pal.stars > 0.4;
                zTimer = night ? 1.1 : 2.3;
                emit(night && Math.random() < 0.5 ? "Z" : "z", fox.x + 6, groundAt(fox.x) - 14, { vy: -5, vx: 2.5, max: night ? 3.2 : 2.4, wobble: 3, color: night ? "#e9e3ff" : "#5d6a8f" });
            }
        }
        fox.holding = holding;
        return { spr, lift };
    }

    function drawGrass() {
        // Brins animés au vent autour du renard (et celui avec lequel il joue).
        const home = foxHome();
        const wind = Math.sin(now * 0.8) * 0.8;
        for (let i = -14; i <= 26; i += 3) {
            const x = home + i + ((i * 7) % 5);
            if (x < 0 || x >= W) continue;
            const y = groundAt(x);
            const h = 3 + ((i * 13) % 4 + 4) % 4;
            const lean = wind + Math.sin(now * 2 + i) * 0.5;
            g.fillStyle = css(i % 2 ? grassCol.a : grassCol.b);
            for (let k = 0; k < h; k++) g.fillRect(Math.round(x + lean * k / h), y - k, 1, 1);
        }
        if (fox.mood === "convert" && !fox.action && !egg) {
            const x = Math.round(fox.x + 11), y = groundAt(fox.x);
            const hit = Math.sin(now * 7) > 0;
            const bend = hit ? 2.5 : Math.sin(now * 3) * 1;
            g.fillStyle = css(mix(grassCol.a, [240, 250, 220], 0.3));
            for (let k = 0; k < 9; k++) g.fillRect(Math.round(x + bend * (k / 9) * (k / 9)), y - k, 1, 1);
            g.fillStyle = "#f2b3bf";
            g.fillRect(Math.round(x + bend), y - 9, 1, 1);
        }
    }

    /* ------------------------------ œuf de Pâques : l'alien ------------------------------ */
    const DANCE = 22;
    let clicks = [];

    function startEgg() {
        if (egg) return;
        const x = fox.x, y = groundAt(fox.x);
        egg = { t0: now, musicAt: 0, x, y, ending: false };
        fox.action = null;
        smokePuff(x + 1, y - 10);
        if (window.RenardSound) {
            RenardSound.puff();
            setTimeout(() => RenardSound.laugh(), 300);
            // La danse commence avec la musique (ou sans, si elle tarde trop).
            RenardSound.music().then(ok => { if (egg && !egg.musicAt) egg.musicAt = now; });
        }
        setTimeout(() => { if (egg && !egg.musicAt) egg.musicAt = now; }, 2500);
        hideBubble();
    }

    function updateEgg() {
        if (!egg) return false;
        const t = now - egg.t0;
        fox.hidden = true;
        const danceT = egg.musicAt ? now - egg.musicAt : 0;
        if (egg.musicAt && danceT >= DANCE && !egg.ending) {
            egg.ending = true;
            egg.endT = now;
            smokePuff(egg.x + 1, egg.y - 10);
            if (window.RenardSound) { RenardSound.stopMusic(); RenardSound.puff(); }
        }
        if (egg.ending && now - egg.endT > 0.3) {
            egg = null;
            fox.hidden = false;
            fox.awakeUntil = now + 5;
            play("boop", 1.2);
            return false;
        }
        if (t < 0.3 || (egg.ending && now - egg.endT > 0.15)) return true;
        // Danse calée sur le tempo (160 BPM).
        const beat = 60 / 160;
        const mt = window.RenardSound && RenardSound.musicTime() >= 0 ? RenardSound.musicTime() - 0.5 : danceT;
        const b = mt / beat, ph = b - Math.floor(b);
        const dancing = egg.musicAt && mt > 0;
        const bounce = dancing ? Math.round(Math.max(0, 1 - ph * 2.2) * 3) : 0;
        const sway = dancing ? Math.round(Math.sin(mt / beat * Math.PI / 2) * 3) : 0;
        const spr = alienSprite({ arm: dancing ? Math.floor(b) : 0, leg: dancing ? (Math.floor(b) % 2 ? 1 : -1) : 0, ant: bounce > 1 ? 1 : 0, laugh: t < 1.4 || (dancing && Math.floor(b / 8) % 2 === 1) });
        spr.draw(g, Math.round(egg.x - 11 + sway), egg.y - 26 - bounce, Math.floor(b / 4) % 2 === 1);
        if (dancing && Math.random() < 0.12) {
            emit(Math.random() < 0.5 ? "note" : "note2", egg.x + (Math.random() * 30 - 15), egg.y - 22 - Math.random() * 8, {
                vy: -9 - Math.random() * 6, vx: (Math.random() - 0.5) * 6, max: 2.2, wobble: 5,
                color: ["#f4a6c8", "#b9d7f0", "#d6c6f2", "#c4ecb6", "#ffd9b8"][Math.floor(Math.random() * 5)]
            });
        }
        return true;
    }

    function onClick(e) {
        if (!W) return;
        const x = e.clientX * dpr / S, y = e.clientY * dpr / S;
        const fy = groundAt(fox.x);
        const hitFox = Math.abs(x - fox.x) < 14 && y > fy - 28 && y < fy + 4;
        if (!hitFox) return;
        e.preventDefault();
        if (egg) return;                        // pendant la danse, les clics ne font rien
        clicks.push(now);
        clicks = clicks.filter(c => now - c < 4);
        if (clicks.length >= 10) { clicks = []; startEgg(); return; }
        if (window.RenardSound) RenardSound.pop();
        fox.awakeUntil = now + 8;
        if (fox.action) return;
        const r = Math.random();
        if (r < 0.34) play("stretch", 1.6);
        else if (r < 0.67) play("wag", 1.8);
        else { play("sneeze", 1.1); if (window.RenardSound) setTimeout(() => RenardSound.sneeze(), 0); }
        if (Math.random() < 0.18) setTimeout(() => sayNext(), 900);
    }

    /* ------------------------------ bulles ------------------------------ */
    const MESSAGES = ["je t'aime !", "pense à boire de l'eau", "t'es trop fort", "t'es le plus beau", "j'ai trop de chance de t'avoir",
        "je pense fort a toi", "bisous sur ton nez", "bisous partout", "j'te lèche"];
    let deck = [], lastMsg = "", bubbleEl = null, bubbleTimer = 0, nextBubble = 0, signEl = null, signHandler = null;

    function draw() {
        if (!deck.length) {
            deck = MESSAGES.slice();
            for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
            if (deck[deck.length - 1] === lastMsg) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
        }
        return (lastMsg = deck.pop());
    }

    function scheduleBubble() { nextBubble = now + 240 + Math.random() * 360; }   // 4 à 10 min

    function say(text) {
        if (egg || !bubbleEl) return;
        bubbleEl.textContent = text;
        bubbleEl.hidden = false;
        bubbleEl.classList.remove("pop");
        void bubbleEl.offsetWidth;
        bubbleEl.classList.add("pop");
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(hideBubble, 4800);
        if (window.RenardSound) RenardSound.babble(text);
        placeOverlays();
    }
    function hideBubble() { if (bubbleEl) bubbleEl.hidden = true; }
    function sayNext() { say(draw()); scheduleBubble(); }

    function afterDone() {
        // Plus de chances d'un petit mot juste après un téléchargement réussi.
        if (Math.random() < 0.6) setTimeout(sayNext, 2600);
    }

    function placeOverlays() {
        const signUp = fox.sign && fox.holding && !egg;
        const x = fox.x * S / dpr, top = (groundAt(fox.x) - (signUp ? 40 : 26)) * S / dpr;
        const vh = H * S / dpr;
        if (bubbleEl && !bubbleEl.hidden) {
            bubbleEl.style.left = Math.round(x) + "px";
            bubbleEl.style.bottom = Math.round(vh - top + 6) + "px";
        }
        if (signEl) {
            // Le panneau n'apparaît que quand le renard le tient (assis, au calme).
            const show = fox.sign && fox.holding && !egg && !fox.hidden;
            if (signEl.hidden === show) signEl.hidden = !show;
            if (show) {
                signEl.style.left = Math.round((fox.x + 9.5) * S / dpr) + "px";
                signEl.style.bottom = Math.round(vh - (groundAt(fox.x) - 28) * S / dpr) + "px";
            }
        }
    }

    function showSign(text, onClickSign) {
        fox.sign = !!text;
        if (!signEl) return;
        if (text) signEl.textContent = text;
        signHandler = onClickSign || null;
        placeOverlays();
    }

    /* ------------------------------ boucle ------------------------------ */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        const vw = window.innerWidth, vh = window.innerHeight;
        S = Math.max(2, Math.round(vh * dpr / 230));
        W = Math.ceil(vw * dpr / S);
        H = Math.ceil(vh * dpr / S);
        canvas.width = W;
        canvas.height = H;
        cssPx = S / dpr;
        canvas.style.width = (W * cssPx) + "px";
        canvas.style.height = (H * cssPx) + "px";
        document.documentElement.style.setProperty("--hill", Math.round(HILL * cssPx) + "px");
        document.documentElement.style.setProperty("--px", cssPx + "px");
        const r = rng(3);
        starList = [];
        for (let i = 0; i < W * H / 260; i++) starList.push({ x: Math.floor(r() * W), y: Math.floor(r() * H * 0.62), b: 0.35 + r() * 0.65, big: r() < 0.08, tw: r() * 10 });
        makeClouds();
        if (!fox.x) fox.x = foxHome();
        fox.x = clamp(fox.x, 10, W - 10);
        refreshPalette(true);
    }

    let override = null;           // heure forcée (tests) : Date
    function refreshPalette(force) {
        const date = override || new Date();
        const p = computePalette(date);
        const key = [p.sun.el.toFixed(1), p.sun.ha < 0 ? "m" : "e", W, H].join("|");
        if (!force && key === palKey) return;
        palKey = key;
        pal = p;
        drawSky();
        drawMountains();
        tintSprites(p.light);
        for (const cl of clouds) renderCloud(cl);
        const ph = p.light < 0.42 ? "night" : "day";
        if (ph !== phase || force) {
            phase = ph;
            for (const fn of phaseListeners) fn(phase, p);
        }
        // Couleurs du ciel pour le reste de l'interface.
        const root = document.documentElement.style;
        root.setProperty("--sky-top", css(p.sky[0]));
        root.setProperty("--sky-hor", css(p.sky[2]));
    }

    let last = 0, acc = 0;
    function frame(ts) {
        requestAnimationFrame(frame);
        const dtMs = ts - last;
        if (dtMs < 1000 / FPS - 2) return;
        last = ts;
        const dt = Math.min(0.1, dtMs / 1000);
        now += dt;
        acc += dt;
        if (acc > 20) { acc = 0; refreshPalette(false); }

        g.drawImage(skyC, 0, 0);
        // Quelques étoiles scintillent.
        if (pal.stars > 0.3) {
            for (let i = 0; i < starList.length; i += 7) {
                const st = starList[i];
                if (Math.sin(now * 1.7 + st.tw) > 0.85) { g.fillStyle = "rgba(255,250,235," + (pal.stars * 0.9).toFixed(2) + ")"; g.fillRect(st.x - 1, st.y, 3, 1); g.fillRect(st.x, st.y - 1, 1, 3); }
            }
        }
        for (const cl of clouds) {
            cl.x += cl.v * dt;
            if (cl.x > W + 4) cl.x = -cl.w - 4;
            if (cl.c) g.drawImage(cl.c, Math.round(cl.x), Math.round(cl.y));
        }
        g.drawImage(mtnC, 0, 0);
        drawGrass();

        if (!updateEgg()) {
            updateFox(dt);
            if (!fox.hidden) {
                const { spr, lift } = poseFox();
                const gy = groundAt(fox.x);
                spr.draw(g, Math.round(fox.x - FCX), gy - FEET - lift + 1, fox.dir < 0);
                if (fox.holding) {
                    g.fillStyle = TINT[13];
                    g.fillRect(Math.round(fox.x + 9), gy - 29, 1, 15);
                }
            }
        }
        stepParts(dt);
        if (now > nextBubble && nextBubble) sayNext();
        placeOverlays();
    }

    function init() {
        bubbleEl = document.getElementById("foxBubble");
        signEl = document.getElementById("foxSign");
        if (signEl) signEl.addEventListener("click", () => { if (signHandler && !egg) signHandler(); });
        resize();
        window.addEventListener("resize", resize);
        // Le canvas est derrière l'interface : on écoute au niveau du document
        // (seule la bande de colline, laissée libre, laisse passer les clics).
        document.addEventListener("pointerdown", e => { if (e.target === canvas || e.target === document.documentElement || e.target.id === "hillspace") onClick(e); });
        scheduleBubble();
        let first = null;
        try { first = localStorage.getItem("renard-first"); } catch (e) { /* ignoré */ }
        if (!first) {
            setTimeout(() => { say("je t'aime !"); lastMsg = "je t'aime !"; deck = deck.filter(m => m !== lastMsg); }, 2500);
            try { localStorage.setItem("renard-first", "1"); } catch (e) { /* ignoré */ }
        }
        fox.awakeUntil = 8;
        // Musique de l'alien calculée tranquillement après le démarrage.
        setTimeout(() => { if (window.RenardSound) RenardSound.prepare(); }, 4000);
        requestAnimationFrame(frame);
    }

    window.RenardScene = {
        setMood, celebrate, sad, alert, say, sayNext, afterDone, showSign,
        get phase() { return phase; },
        get dancing() { return !!egg; },
        onPhase(fn) { phaseListeners.add(fn); fn(phase, pal); },
        egg: startEgg,
        // Outils de test : forcer l'heure du ciel.
        _setTime(date) { override = date ? new Date(date) : null; refreshPalette(true); }
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
