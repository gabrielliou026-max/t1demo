/* Line-of-sight radio link explainer — Three.js clay / papercraft renderer.
 * Every object is assembled from native Three.js geometries (Box, Cylinder, Sphere,
 * Cone, Capsule, Torus, Icosahedron, Plane) with flat shading for a low-poly clay look.
 * render(t) is deterministic in t, so the web page and the MP4 export match frame for frame.
 * A 2D canvas composites the WebGL frame and draws subtitles, header, progress and labels. */
(function () {
  'use strict';
  const THREE = window.THREE;
  const W = 1920, H = 1080;
  const FONT = {
    sans: "'Noto Sans TC','WenQuanYi Zen Hei','Microsoft JhengHei',sans-serif",
    mono: "'JetBrains Mono','DejaVu Sans Mono',Consolas,monospace",
    disp: "'Oxanium','Noto Sans TC',sans-serif",
  };
  // Soft pastel clay palette
  const P = {
    sky0: '#262a57', sky1: '#4a4580', ground: '#6b6fb2', stage: '#7a7fc0',
    cream: '#fff4e2', paper: '#fffaf1', ink: '#3b3452', eye: '#2b2640', blush: '#ff9fb4',
    butter: '#ffd77e', amber: '#ffc463', sky: '#92d2ff', blue: '#86a9f2', mint: '#a2e7c6', teal: '#74d3b9',
    lav: '#c8b8ff', lilac: '#a995e8', pink: '#ffb3c9', coral: '#ff9690', peach: '#ffc9a7', periw: '#a9b9ff',
    white: '#fffdf8', slate: '#555a96', dark: '#34355f',
  };
  const CAS = P.butter, CCS = P.sky, VOICE = P.mint, SYNC = P.lav, CLEAR = P.coral;
  // deep tones for text on cream paper / labels
  const DEEP = {
    [P.butter]: '#b77a12', [P.amber]: '#b77a12', [P.sky]: '#2c78b3', [P.mint]: '#2a936c', [P.teal]: '#2a936c',
    [P.lav]: '#6f55cf', [P.lilac]: '#6f55cf', [P.pink]: '#c9507c', [P.coral]: '#cf4f55', [P.peach]: '#c46a3a',
    [P.periw]: '#4e63c9', [P.blue]: '#3d64c4',
  };
  const deep = (c) => DEEP[c] || '#5a4f7a';

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const backOut = (x) => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const setS = (o, s) => { o.visible = s > 0.002; o.scale.setScalar(Math.max(1e-4, s)); };

  // ---------- 2D primitives (overlay + paper textures) ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const font = (size, weight = 400, fam = 'sans') => `${weight} ${size}px ${FONT[fam]}`;
  function text(ctx, s, x, y, o = {}) {
    ctx.font = font(o.size || 24, o.weight || 400, o.fam || 'sans');
    ctx.fillStyle = o.color || P.ink;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.ls) ctx.letterSpacing = o.ls + 'px';
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 14; ctx.shadowOffsetY = o.dy || 0; }
    ctx.fillText(s, x, y);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (o.ls) ctx.letterSpacing = '0px';
  }
  function measure(ctx, s, size, weight = 400, fam = 'sans') {
    ctx.font = font(size, weight, fam);
    return ctx.measureText(s).width;
  }
  function withA(ctx, a, fn) {
    if (a <= 0.003) return;
    ctx.save();
    ctx.globalAlpha *= clamp(a);
    fn();
    ctx.restore();
  }
  // Paper-label tag: cream pill, zh on top, en below.
  function tag(ctx, x, y, zh, en, color, a = 1, o = {}) {
    if (a <= 0.003) return;
    const zs = o.zs || 22, es = o.es || 15;
    const zw = measure(ctx, zh, zs, 800), ew = en ? measure(ctx, en, es, 600) : 0;
    const w = Math.max(zw, ew) + 40, h = en ? zs + es + 26 : zs + 22;
    let bx = x - w / 2;
    if (o.align === 'left') bx = x;
    if (o.align === 'right') bx = x - w;
    let by = y;
    if (o.anchor === 'bottom') by = y - h;
    if (o.anchor === 'middle') by = y - h / 2;
    const k = backOut(a);
    withA(ctx, clamp(a * 2), () => {
      ctx.translate(bx + w / 2, by + h / 2);
      ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
      ctx.translate(-(bx + w / 2), -(by + h / 2));
      rr(ctx, bx, by + 4, w, h, 14);
      ctx.fillStyle = 'rgba(20,18,50,0.28)';
      ctx.fill();
      rr(ctx, bx, by, w, h, 14);
      ctx.fillStyle = '#fff7ec';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 15, by + 11 + zs / 2, 5, 0, 7);
      ctx.fill();
      const cx = bx + w / 2 + 7;
      text(ctx, zh, cx, by + 9 + zs * 0.88, { size: zs, weight: 800, align: 'center', color: P.ink });
      if (en) text(ctx, en, cx, by + 14 + zs + es * 0.92, { size: es, weight: 600, align: 'center', color: deep(color) });
    });
  }

  // ---------- Three.js helpers ----------
  const gCache = new Map();
  const geo = (key, fn) => { if (!gCache.has(key)) gCache.set(key, fn()); return gCache.get(key); };
  const GX = {
    box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
    cyl: (rt, rb, h, s = 12, open = false, ts = 0, tl = Math.PI * 2) =>
      geo(`c${rt},${rb},${h},${s},${open},${ts},${tl}`, () => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, ts, tl)),
    sph: (r, ws = 12, hs = 9, ts = 0, tl = Math.PI) =>
      geo(`s${r},${ws},${hs},${ts},${tl}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, ts, tl)),
    cone: (r, h, s = 10) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)),
    cap: (r, l, cs = 3, rs = 10) => geo(`p${r},${l},${cs},${rs}`, () => new THREE.CapsuleGeometry(r, l, cs, rs)),
    tor: (R, r, rs = 6, ts = 18, arc = Math.PI * 2) => geo(`t${R},${r},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
    ico: (r, d = 0) => geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
    plane: (w, h) => geo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
  };
  const mCache = new Map();
  function mat(color, o = {}) {
    const key = color + JSON.stringify(o);
    if (!o.unique && mCache.has(key)) return mCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.92, metalness: 0, flatShading: o.flat ?? true,
      emissive: o.emissive || '#000000', emissiveIntensity: o.ei ?? 0,
      transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, depthWrite: o.opacity === undefined,
    });
    if (!o.unique) mCache.set(key, m);
    return m;
  }
  function mesh(g, color, o = {}) {
    const m = new THREE.Mesh(g, color && color.isMaterial ? color : mat(color, o));
    m.castShadow = o.shadow !== false;
    m.receiveShadow = true;
    if (o.pos) m.position.set(...o.pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    return m;
  }
  const group = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);
  function rod(a, b, r, color, o = {}) {
    const d = b.clone().sub(a), len = d.length();
    const m = mesh(GX.cyl(r, r, 1, o.seg || 8), color, o);
    m.scale.y = len;
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  }

  // Chibi face: dark eyes with highlights and pink blush.
  function face(g, { x = 0, y = 0, z = 0, gap = 0.36, r = 0.09, eye = P.eye, blush = true }) {
    const eyes = [];
    for (const s of [-1, 1]) {
      const e = mesh(GX.sph(r, 10, 8), eye, { shadow: false, flat: false, rough: 0.4, pos: [x + s * gap / 2, y, z] });
      const hl = mesh(GX.sph(r * 0.34, 6, 5), '#ffffff', { shadow: false, pos: [r * 0.32, r * 0.36, r * 0.78] });
      e.add(hl);
      g.add(e);
      eyes.push(e);
      if (blush) g.add(mesh(GX.sph(r * 1.1, 8, 6), P.blush, { shadow: false, flat: false, pos: [x + s * (gap / 2 + r * 1.9), y - r * 1.5, z - r * 0.35], scale: [1, 0.55, 0.35] }));
    }
    return (t) => { const b = (t % 3.7) < 0.12 ? 0.15 : 1; eyes.forEach((e) => { e.scale.y = b; }); };
  }

  // Paper card: coloured card stock backing + printed paper face (CanvasTexture).
  const cards = [];
  function paper(w, h, draw, o = {}) {
    const g = new THREE.Group();
    g.add(mesh(GX.box(w + 0.16, h + 0.16, 0.1), o.edge || P.lav, {}));
    const res = o.res || 170;
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * res);
    cv.height = Math.round(h * res);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const face = new THREE.Mesh(GX.plane(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    face.position.z = 0.056;
    g.add(face);
    const ctx = cv.getContext('2d');
    const card = {
      g, ctx, w: cv.width, h: cv.height, tex, draw, key: null,
      redraw(state) {
        const k = JSON.stringify(state ?? null);
        if (k === card.key) return;
        card.key = k;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = o.bg || P.paper;
        ctx.fillRect(0, 0, cv.width, cv.height);
        draw(ctx, cv.width, cv.height, state);
        tex.needsUpdate = true;
      },
    };
    card.redraw(o.state);
    g.userData.card = card;
    cards.push(card);
    return card;
  }
  function refreshCards() { cards.forEach((c) => { const k = c.key; c.key = '#'; c.redraw(JSON.parse(k)); }); }
  // simple two-line centred label for paper cards
  function cardTitle(zh, en, color, o = {}) {
    return (ctx, w, h) => {
      const zs = o.zs || Math.min(h * 0.36, 64), es = o.es || zs * 0.5;
      text(ctx, zh, w / 2, h / 2 - (en ? es * 0.25 : -zs * 0.35), { size: zs, weight: 900, align: 'center', color: o.zc || P.ink });
      if (en) text(ctx, en, w / 2, h / 2 + es * 1.25, { size: es, weight: 700, align: 'center', color: deep(color) });
    };
  }

  // ---------- LOS link palette ----------
  const LOW = P.sky, HIGH = P.coral, CLEARC = P.mint, WARN = P.butter;
  const fspl = (f, d) => 32.4 + 20 * Math.log10(f) + 20 * Math.log10(d);
  // Fresnel–Kirchhoff knife-edge loss (ITU-R P.526)
  const Jv = (v) => (v > -0.78 ? 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1) : 0);
  const knife = (h, fMHz, D, d1) => { const lam = 300 / fMHz, d2 = D - d1; return Jv(h * Math.sqrt(2 * D * 1e3 / (lam * d1 * 1e3 * d2 * 1e3))); };

  // ---------- chart on a paper card ----------
  function chart(ctx, X, Y, Wd, Hd, o) {
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const lg = (v) => Math.log10(v);
    const mx = (v) => X + (o.logx ? (lg(v) - lg(x0)) / (lg(x1) - lg(x0)) : (v - x0) / (x1 - x0)) * Wd;
    const my = (v) => Y + Hd - (v - y0) / (y1 - y0) * Hd;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ece0cd';
    (o.yt || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(X, my(v)); ctx.lineTo(X + Wd, my(v)); ctx.stroke(); });
    (o.xt || []).forEach((v) => { ctx.beginPath(); ctx.moveTo(mx(v), Y); ctx.lineTo(mx(v), Y + Hd); ctx.stroke(); });
    ctx.strokeStyle = '#8f86ad'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X, Y + Hd); ctx.lineTo(X + Wd, Y + Hd); ctx.stroke();
    (o.yt || []).forEach((v) => text(ctx, o.yf ? o.yf(v) : String(v), X - 14, my(v) + 12, { size: 34, weight: 600, align: 'right', color: '#7a7196', fam: 'mono' }));
    (o.xt || []).forEach((v) => text(ctx, o.xf ? o.xf(v) : String(v), mx(v), Y + Hd + 42, { size: 34, weight: 600, align: 'center', color: '#7a7196', fam: 'mono' }));
    if (o.xl) text(ctx, o.xl, X + Wd, Y + Hd + 82, { size: 32, weight: 700, align: 'right', color: '#7a7196' });
    if (o.yl) text(ctx, o.yl, X, Y - 20, { size: 32, weight: 700, align: 'left', color: '#7a7196' });
    (o.series || []).forEach((s) => {
      const n = Math.max(2, Math.round(s.pts.length * clamp(s.k ?? 1)));
      if ((s.k ?? 1) <= 0.001) return;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.w || 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      s.pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(mx(x), my(y)) : ctx.moveTo(mx(x), my(y))));
      ctx.stroke();
      ctx.setLineDash([]);
    });
    return { mx, my };
  }
  const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  function dot(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); }
  function pill(ctx, x, y, s, color, o = {}) {
    const fs = o.size || 30, w = measure(ctx, s, fs, 800) + 34, h = fs + 20;
    const bx = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    rr(ctx, bx, y - h / 2, w, h, h / 2); ctx.fillStyle = color; ctx.fill();
    text(ctx, s, bx + w / 2, y + fs * 0.36, { size: fs, weight: 800, align: 'center', color: o.color || '#fff' });
  }
  // Formula strip card
  function formula(w, h, edge, lines) {
    return paper(w, h, (ctx, W2, H2) => {
      lines.forEach((L, i) => text(ctx, L.s, L.x ?? 34, L.y, { size: L.size || 50, weight: L.weight || 700, color: L.color || P.ink, fam: L.fam || 'mono', align: L.align || 'left' }));
    }, { edge });
  }

  // ---------- characters ----------
  const CH = {};
  // Mast-mounted radio with a panel antenna; local antenna point at userData.ant.
  CH.radio = function (color = P.mint, o = {}) {
    const g = new THREE.Group();
    const mastH = o.mast ?? 2.0;
    g.add(mesh(GX.box(1.0, 0.66, 0.74), color, { pos: [0, 0.36, 0] }));
    g.add(mesh(GX.box(0.62, 0.34, 0.05), '#2f4b4a', { pos: [0, 0.4, 0.38] }));
    const blink = face(g, { y: 0.42, z: 0.41, gap: 0.26, r: 0.06, eye: '#e6fff5', blush: false });
    for (const s of [-1, 1]) g.add(mesh(GX.sph(0.07, 8, 6), P.blush, { shadow: false, flat: false, pos: [s * 0.4, 0.26, 0.38], scale: [1, 0.55, 0.35] }));
    for (const s of [-1, 1]) g.add(mesh(GX.cyl(0.07, 0.09, 0.08, 8), '#6ec3a4', { pos: [s * 0.36, 0.02, 0] }));
    g.add(mesh(GX.cyl(0.05, 0.06, mastH, 6), P.cream, { pos: [0, 0.69 + mastH / 2, 0] }));
    const top = 0.69 + mastH;
    const head = new THREE.Group();
    head.position.set(0, top + 0.22, 0);
    head.add(mesh(GX.box(0.14, 0.62, 0.46), P.cream, {}));
    head.add(mesh(GX.box(0.05, 0.5, 0.36), color, { pos: [0.08, 0, 0] }));
    g.add(head);
    const led = mesh(GX.sph(0.05, 6, 5), P.butter, { unique: true, emissive: P.butter, ei: 0.8, pos: [0.38, 0.62, 0.3] });
    g.add(led);
    const arcs = [0, 1, 2].map((i) => {
      const m = mesh(GX.tor(0.35 + i * 0.2, 0.03, 4, 12, Math.PI * 0.6), P.cream, { shadow: false, unique: true, opacity: 1 });
      m.rotation.set(0, Math.PI / 2, -Math.PI * 0.3);
      m.position.set(0.12, top + 0.22, 0);
      g.add(m);
      return m;
    });
    g.userData.ant = V(0.1, top + 0.22, 0);
    g.userData.head = head;
    g.userData.update = (t, o2 = {}) => {
      const tx = o2.tx ?? 0;
      blink(t + (o2.seed || 0));
      led.material.emissiveIntensity = (t * 2 + (o2.seed || 0)) % 1 < 0.5 ? 0.9 : 0.15;
      arcs.forEach((m, i) => { const k = (t * 1.1 + i / 3) % 1; m.visible = tx > 0.01; m.scale.setScalar(0.6 + k); m.material.opacity = (1 - k) * tx; });
    };
    return g;
  };
  CH.tree = function (color = P.mint, o = {}) {
    const g = new THREE.Group();
    g.add(mesh(GX.cyl(0.16, 0.2, 0.7, 6), '#b39a8a', { pos: [0, 0.35, 0] }));
    g.add(mesh(GX.cone(0.95, 1.3, 7), color, { pos: [0, 1.25, 0] }));
    g.add(mesh(GX.cone(0.75, 1.1, 7), color, { pos: [0, 1.95, 0] }));
    g.add(mesh(GX.cone(0.5, 0.9, 7), color, { pos: [0, 2.55, 0] }));
    const blink = o.face === false ? () => {} : face(g, { y: 1.15, z: 0.62, gap: 0.3, r: 0.07 });
    g.userData.update = (t, o2 = {}) => { blink(t + (o2.seed || 0)); g.rotation.z = Math.sin(t * 1.3 + (o2.seed || 0)) * 0.03; };
    return g;
  };
  CH.tower = function (h = 3.2, color = P.periw, o = {}) {
    const g = new THREE.Group();
    const w = o.w || 1.5, d = o.d || 1.3;
    g.add(mesh(GX.box(w, h, d), color, { pos: [0, h / 2, 0] }));
    g.add(mesh(GX.box(w + 0.12, 0.14, d + 0.12), P.cream, { pos: [0, h + 0.07, 0] }));
    const on = mat(P.butter, { emissive: P.butter, ei: 0.3 }), off = mat('#7c86d4');
    const wins = [];
    for (let r = 0; r < Math.floor((h - 0.9) / 0.55); r++) for (const x of [-w * 0.26, w * 0.26]) {
      const m = mesh(GX.box(w * 0.26, 0.28, 0.05), off, { pos: [x, 0.5 + r * 0.55, d / 2 + 0.02] });
      g.add(m); wins.push(m);
    }
    const blink = o.face === false ? () => {} : face(g, { y: h - 0.42, z: d / 2 + 0.03, gap: 0.34, r: 0.075 });
    g.userData.top = h + 0.14;
    g.userData.update = (t, o2 = {}) => {
      blink(t + (o2.seed || 0));
      wins.forEach((m, i) => { m.material = hash(i * 11 + Math.floor(t * 0.5 + i) + (o2.seed || 0)) > 0.45 ? on : off; });
    };
    return g;
  };
  CH.cloud = function () {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    [[0, 0, 0, 0.8], [-0.8, -0.15, 0, 0.6], [0.8, -0.15, 0, 0.62], [0.35, 0.35, -0.1, 0.55], [-0.4, 0.3, -0.1, 0.5]].forEach(([x, y, z, r]) =>
      body.add(mesh(GX.sph(r, 12, 9), '#e9e6ff', { pos: [x, y, z], flat: false })));
    const blink = face(body, { y: -0.05, z: 0.76, gap: 0.34, r: 0.07 });
    const drops = new THREE.InstancedMesh(GX.cap(0.035, 0.16, 2, 6), mat(P.sky, { emissive: P.sky, ei: 0.2 }), 24);
    drops.castShadow = false;
    g.add(drops);
    const m4 = new THREE.Matrix4();
    g.userData.update = (t, o2 = {}) => {
      body.position.y = Math.sin(t * 1.4) * 0.08;
      blink(t + 0.9);
      const rain = o2.rain ?? 1, fall = o2.fall ?? 3.2;
      drops.visible = rain > 0.01;
      for (let i = 0; i < 24; i++) {
        const k = (t * 0.9 + hash(i)) % 1;
        m4.makeTranslation((hash(i + 7) - 0.5) * 1.9, -0.6 - k * fall, (hash(i + 13) - 0.5) * 0.8);
        drops.setMatrixAt(i, m4);
      }
      drops.instanceMatrix.needsUpdate = true;
    };
    return g;
  };
  CH.bubble = function (color = LOW) {
    const g = new THREE.Group();
    g.add(mesh(GX.sph(1, 20, 14), color, { opacity: 0.45, flat: false, shadow: false, scale: [1.6, 0.9, 0.9], pos: [0, 1.1, 0] }));
    g.add(mesh(GX.sph(1, 20, 14), '#ffffff', { opacity: 0.25, flat: false, shadow: false, scale: [0.5, 0.25, 0.2], pos: [-0.5, 1.6, 0.55] }));
    const blink = face(g, { y: 1.15, z: 0.88, gap: 0.4, r: 0.085 });
    g.userData.update = (t) => { blink(t + 0.3); g.children[0].scale.y = 0.9 + Math.sin(t * 2) * 0.03; };
    return g;
  };

  // ---------- props ----------
  function hill(r, h, color = '#8f93cf', seg = 7) { return mesh(GX.cone(r, h, seg), color, { pos: [0, h / 2, 0] }); }
  function platform(w, d, color = '#fff0d2') { return mesh(GX.box(w, 0.3, d), color, { pos: [0, 0.15, 0] }); }
  // Translucent ellipsoid between two points (Fresnel zone).
  function zone(a, b, r, color, op = 0.3) {
    const g = new THREE.Group();
    const m = mesh(GX.sph(1, 28, 16), color, { opacity: op, flat: false, shadow: false, unique: true });
    g.add(m);
    const d = b.clone().sub(a);
    g.position.copy(a).addScaledVector(d, 0.5);
    g.quaternion.setFromUnitVectors(V(1, 0, 0), d.clone().normalize());
    m.scale.set(d.length() / 2, r, r);
    g.userData.m = m;
    g.userData.setR = (rr2) => { m.scale.y = m.scale.z = Math.max(1e-3, rr2); };
    return g;
  }
  // Beads travelling along a path function p(k) → Vector3.
  function beads(n, color, r = 0.13) {
    const im = new THREE.InstancedMesh(GX.sph(r, 8, 6), mat(color, { flat: false, emissive: color, ei: 0.35 }), n);
    im.castShadow = false;
    const m4 = new THREE.Matrix4();
    im.userData.update = (t, path, o = {}) => {
      const sp = o.speed ?? 0.22, stop = o.stop ?? 1, on = o.on ?? 1;
      im.visible = on > 0.01;
      for (let i = 0; i < n; i++) {
        const k = (i / n + t * sp) % 1;
        const p = path(Math.min(k, stop));
        const s = k > stop ? Math.max(0, 1 - (k - stop) * 8) : 1;
        m4.makeScale(s * on, s * on, s * on);
        m4.setPosition(p.x, p.y, p.z);
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    };
    return im;
  }
  const seg = (a, b) => (k) => a.clone().lerp(b, k);
  const poly = (pts) => {
    const L = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); L.push(l); tot += l; }
    return (k) => {
      let d = k * tot;
      for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) return pts[i].clone().lerp(pts[i + 1], clamp(d / L[i])); d -= L[i]; }
      return pts[pts.length - 1].clone();
    };
  };
  // Expanding translucent wavefront shells.
  function shells(n, color) {
    const g = new THREE.Group();
    const ms = Array.from({ length: n }, () => { const m = mesh(GX.sph(1, 24, 14), color, { opacity: 0.3, flat: false, shadow: false, unique: true }); g.add(m); return m; });
    g.userData.update = (t, R = 6, on = 1) => ms.forEach((m, i) => {
      const k = (t * 0.35 + i / n) % 1;
      m.visible = on > 0.01;
      m.scale.setScalar(0.3 + k * R);
      m.material.opacity = (1 - k) * 0.32 * on;
    });
    return g;
  }
  function water(w, d) {
    const g = new THREE.Group();
    g.add(mesh(GX.box(w, 0.1, d), '#7fc6f2', { pos: [0, 0.05, 0], rough: 0.4 }));
    const waves = [];
    for (let i = 0; i < 10; i++) {
      const m = mesh(GX.box(0.7, 0.04, 0.1), '#dff3ff', { pos: [(hash(i) - 0.5) * w * 0.9, 0.12, (hash(i + 5) - 0.5) * d * 0.8] });
      g.add(m); waves.push(m);
    }
    g.userData.update = (t) => waves.forEach((m, i) => { m.position.x += Math.sin(t * 1.5 + i) * 0.002; m.scale.x = 0.7 + 0.3 * Math.sin(t * 2 + i); });
    return g;
  }
  function dish(r, color = P.cream) {
    const g = new THREE.Group();
    const d = mesh(GX.sph(r, 16, 8, 0, Math.PI * 0.32), color, { flat: false, rot: [0, 0, -Math.PI / 2] });
    g.add(d);
    g.add(mesh(GX.cyl(0.03, 0.03, r * 0.9, 6), '#b8b2d8', { rot: [0, 0, Math.PI / 2], pos: [r * 0.45 - r, 0, 0] }));
    return g;
  }
  // Wide / narrow beam cone pointing +x.
  function beam(len, half, color) {
    const m = mesh(GX.cone(Math.tan(half) * len, len, 20), color, { opacity: 0.22, flat: false, shadow: false, unique: true, rot: [0, 0, Math.PI / 2] });
    m.position.x = len / 2;
    const g = group(m);
    return g;
  }
  const wpos = (o, v) => o.localToWorld(v.clone());

  // ---------- scenes ----------
  // build() returns { root, update(S) }. S.lab()/S.draw() queue 2D overlay items.
  const SCENES = {};

  // A two-hill link diorama used in the intro and the finale.
  function linkDiorama() {
    const g = new THREE.Group();
    const hL = hill(3.2, 2.2, '#8a8ed0'), hR = hill(3.0, 1.8, '#8f93cf');
    hL.position.x = -7.4; hR.position.x = 7.4;
    const rL = CH.radio(P.mint), rR = CH.radio(P.pink);
    rL.position.set(-7.4, 2.2, 0); rR.position.set(7.4, 1.8, 0); rR.userData.head.rotation.y = Math.PI;
    g.add(hL, hR, rL, rR);
    const trees = [];
    for (let i = 0; i < 4; i++) {
      const tr = CH.tree(i % 2 ? P.mint : P.teal, { face: false });
      tr.position.set(-3 + i * 2.1, 0, -1.8 - (i % 2) * 0.6); tr.scale.setScalar(0.7);
      g.add(tr); trees.push(tr);
    }
    g.updateMatrixWorld(true);
    const a = wpos(rL, rL.userData.ant), b = wpos(rR, rR.userData.ant);
    const lo = beads(22, LOW, 0.14), hi = beads(22, HIGH, 0.11);
    g.add(lo, hi);
    g.userData = Object.assign(g.userData, { rL, rR, a, b });
    g.userData.update = (t, o = {}) => {
      rL.userData.update(t, { tx: 1 }); rR.userData.update(t, { seed: 1.3 });
      trees.forEach((tr, i) => tr.userData.update(t, { seed: i }));
      const up = V(0, 0.35, 0), dn = V(0, -0.35, 0);
      lo.userData.update(t, (k) => a.clone().add(up).lerp(b.clone().add(up), k).add(V(0, Math.sin(k * Math.PI) * 0.5, 0)), { on: o.lo ?? 1, speed: 0.18 });
      hi.userData.update(t, (k) => a.clone().add(dn).lerp(b.clone().add(dn), k).add(V(0, Math.sin(k * Math.PI) * 0.5, 0)), { on: o.hi ?? 1, speed: 0.18, stop: o.hiStop ?? 1 });
    };
    return g;
  }

  SCENES.intro = function () {
    const root = new THREE.Group();
    const L = linkDiorama();
    root.add(L);
    const topics = [['距離損耗', 'Path loss', P.sky], ['菲涅爾淨空', 'Fresnel clearance', P.lav], ['多路徑反射', 'Multipath', P.teal], ['植被與天氣', 'Foliage & weather', P.mint]];
    const chips = topics.map((e, i) => {
      const c = paper(3.4, 1.15, cardTitle(e[0], e[1], e[2], { zs: 64 }), { edge: e[2] });
      c.g.position.set(-5.7 + i * 3.8, 6.6, -0.8);
      root.add(c.g);
      return c;
    });
    const envs = [];
    const mk = (o, x) => { o.position.set(x, 0, 2.6); o.scale.setScalar(0.55); root.add(o); envs.push(o); return o; };
    mk(CH.tower(3.4, P.periw), -5.2);
    mk(CH.tree(P.teal), -2.0);
    const wt = water(3.0, 1.6); wt.position.set(1.4, 0, 2.6); root.add(wt); envs.push(wt);
    const mt = group(hill(1.4, 2.6, '#9c9fdc'), mesh(GX.cone(0.5, 0.5, 7), '#fff7ec', { pos: [0, 2.35, 0] }));
    mk(mt, 5.0);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        S.view(box(-10.4, -0.3, -2.4, 10.4, 7.4, 3.4, 0.24));
        const band = A(1, 0.6);
        L.userData.update(t, { lo: clamp((lt - 0.6) / 0.8), hi: clamp((lt - 0.6) / 0.8) });
        S.lab(L.userData.rL, V(0, -0.2, 1.0), '電台 A', 'Radio A', P.mint, clamp((lt - 0.4) / 0.5));
        S.lab(L.userData.rR, V(0, -0.2, -1.0), '電台 B', 'Radio B', P.pink, clamp((lt - 0.4) / 0.5));
        const mid = L.userData.a.clone().lerp(L.userData.b, 0.5);
        S.lab(null, mid.clone().add(V(0, 1.6, 0)), '低頻段 1350–2690 MHz', 'Low band', LOW, band * (1 - A(2, 0.4)), { anchor: 'bottom' });
        S.lab(null, mid.clone().add(V(0, -0.9, 0)), '高頻段 4400–5900 MHz', 'High band', HIGH, A(1, 0.6, 0.8) * (1 - A(2, 0.4)));
        chips.forEach((c, i) => setS(c.g, backOut(A(2, 0.5, 0.6 + i * 0.55))));
        envs.forEach((o, i) => setS(o, 0.55 * backOut(A(3, 0.5, 0.3 + i * 0.45))));
        envs.forEach((o) => o.userData.update && o.userData.update(t));
        [['城市', 'City', P.periw, -5.2], ['森林', 'Forest', P.teal, -2.0], ['水面', 'Water', P.sky, 1.4], ['山區', 'Mountains', P.lav, 5.0]].forEach(([zh, en, c, x], i) =>
          S.lab(null, V(x, 0.1, 3.6), zh, en, c, A(3, 0.5, 0.6 + i * 0.45)));
      },
    };
  };

  SCENES.fspl = function () {
    const root = new THREE.Group();
    const r = CH.radio(P.mint, { mast: 1.8 });
    r.position.set(-7.6, 0, 0.4); r.scale.setScalar(1.1);
    root.add(r);
    root.updateMatrixWorld(true);
    const src = wpos(r, r.userData.ant);
    const sh = shells(4, P.sky);
    sh.position.copy(src);
    root.add(sh);
    const f = formula(9.2, 1.35, P.sky, [{ s: 'FSPL(dB) = 32.4 + 20·log₁₀(f MHz) + 20·log₁₀(d km)', y: 145, size: 50 }]);
    f.g.position.set(2.6, 7.35, 0);
    const cData = { k1: 0, k2: 0, mk: 0 };
    const ch = paper(9.2, 5.3, (ctx, w, h, st) => {
      text(ctx, '自由空間路徑損耗 · FSPL vs distance', 40, 70, { size: 44, weight: 900, color: P.ink });
      const ds = range(1, 30, 60);
      const { mx, my } = chart(ctx, 150, 150, w - 230, h - 290, {
        xr: [0, 30], yr: [95, 140], xt: [0, 5, 10, 20, 30], yt: [100, 110, 120, 130, 140], xl: '距離 Distance (km)', yl: 'dB',
        series: [{ pts: ds.map((d) => [d, fspl(1350, d)]), color: LOW, k: st.k1 }, { pts: ds.map((d) => [d, fspl(5900, d)]), color: HIGH, k: st.k2 }],
      });
      if (st.k1 > 0.1) text(ctx, '1350 MHz', mx(26), my(fspl(1350, 26)) + 50, { size: 32, weight: 800, align: 'center', color: '#2c78b3' });
      if (st.k2 > 0.1) text(ctx, '5900 MHz', mx(26), my(fspl(5900, 26)) - 26, { size: 32, weight: 800, align: 'center', color: '#cf4f55' });
      if (st.mk > 0) {
        ctx.globalAlpha = st.mk;
        ctx.setLineDash([10, 10]); ctx.strokeStyle = '#8f86ad'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx(20), my(95)); ctx.lineTo(mx(20), my(140)); ctx.stroke(); ctx.setLineDash([]);
        dot(ctx, mx(20), my(fspl(1350, 20)), 12, LOW); dot(ctx, mx(20), my(fspl(5900, 20)), 12, HIGH);
        pill(ctx, mx(20) - 24, my(fspl(1350, 20)) + 4, '121 dB', '#2c78b3', { align: 'right', size: 28 });
        pill(ctx, mx(20) - 24, my(fspl(5900, 20)) - 6, '134 dB', '#cf4f55', { align: 'right', size: 28 });
        pill(ctx, mx(20) + 30, my(128), '≈ 13 dB', '#6f55cf', { align: 'left', size: 30 });
        ctx.globalAlpha = 1;
      }
    }, { edge: P.sky, state: cData });
    ch.g.position.set(2.6, 3.4, 0);
    const rx = paper(6.4, 3.5, (ctx, w) => {
      text(ctx, '接收功率 · Received power', 36, 72, { size: 44, weight: 900, color: P.ink });
      text(ctx, 'Pt = 0.3 W = 24.8 dBm · 0 dBi', 36, 124, { size: 32, weight: 700, color: '#7a7196', fam: 'mono' });
      const rows = [['', '10 km', '20 km'], ['1350 MHz', '−90.2', '−96.3'], ['5900 MHz', '−103.0', '−109.1']];
      rows.forEach((rw, i) => {
        const y = 210 + i * 86;
        if (i) { rr(ctx, 26, y - 56, w - 52, 76, 16); ctx.fillStyle = i === 1 ? '#e3f2ff' : '#ffe6e3'; ctx.fill(); }
        rw.forEach((c, j) => text(ctx, c, [40, 520, 820][j], y, { size: j ? 44 : 38, weight: 800, color: i === 0 ? '#7a7196' : j ? (i === 1 ? '#2c78b3' : '#cf4f55') : P.ink, fam: j ? 'mono' : 'sans' }));
      });
      text(ctx, 'dBm · 示範計算 Illustrative', w - 36, 560, { size: 28, weight: 700, align: 'right', color: '#7a7196' });
    }, { edge: P.lav });
    rx.g.position.set(-6.4, 6.3, 0.6);
    root.add(f.g, ch.g, rx.g);
    return {
      root,
      update(S) {
        const { t, A, lt } = S;
        S.view(box(-10.4, -0.3, -1.2, 7.8, 8.2, 1.2, 0.12));
        r.userData.update(t, { tx: 1 });
        sh.userData.update(t, 4.2, clamp(lt / 0.8));
        setS(f.g, backOut(A(1, 0.5)));
        setS(ch.g, backOut(A(2, 0.5, 0.6)));
        cData.k1 = easeInOut(A(3, 1.2)); cData.k2 = easeInOut(A(3, 1.2, 0.5)); cData.mk = A(3, 0.5, 2.2);
        ch.redraw({ ...cData });
        S.lab(null, V(-4.6, 6.6, 0.6), '距離 ×2 → +6 dB', 'Double distance', P.sky, A(2, 0.5, 0.2) * (1 - A(4, 0.4)));
        S.lab(null, V(-4.6, 5.2, 0.6), '頻率 ×2 → +6 dB', 'Double frequency', HIGH, A(2, 0.5, 1.6) * (1 - A(4, 0.4)));
        setS(rx.g, backOut(A(4, 0.5)));
        S.lab(null, V(-6.4, 4.1, 0.9), '示範數字 · 實際依裝備而定', 'Illustrative only', WARN, A(5, 0.5));
      },
    };
  };

  SCENES.aperture = function () {
    const root = new THREE.Group(), A1 = new THREE.Group(), B1 = new THREE.Group();
    root.add(A1, B1);
    const r = CH.radio(P.mint, { mast: 1.6 });
    r.position.set(-8, 0, 0);
    A1.add(r);
    root.updateMatrixWorld(true);
    const src = wpos(r, r.userData.ant);
    const sh = shells(4, P.lav);
    sh.position.copy(src);
    A1.add(sh);
    // effective-aperture "nets": disc size ∝ wavelength
    const net = (R, color) => {
      const g = new THREE.Group();
      g.add(mesh(GX.cyl(R, R, 0.06, 28), color, { opacity: 0.5, flat: false, rot: [0, 0, Math.PI / 2] }));
      g.add(mesh(GX.tor(R, 0.07, 6, 28), color, { rot: [0, Math.PI / 2, 0] }));
      g.add(mesh(GX.cyl(0.05, 0.05, 1.6, 6), P.cream, { pos: [0, -R - 0.8, 0] }));
      return g;
    };
    const nLo = net(1.5, LOW), nHi = net(0.62, HIGH);
    nLo.position.set(5.2, 3.9, -1.0); nHi.position.set(5.2, 2.5, 1.6);
    A1.add(nLo, nHi);
    const cLo = beads(16, LOW, 0.12), cHi = beads(16, HIGH, 0.12);
    A1.add(cLo, cHi);
    const card = formula(6.0, 1.5, P.lav, [{ s: 'Aₑ = λ² / 4π', y: 88, size: 64, x: 40 }, { s: '等向天線 · isotropic, 0 dBi', y: 160, size: 30, fam: 'sans', color: '#7a7196', x: 44 }]);
    card.g.position.set(-1.0, 6.6, 0);
    A1.add(card.g);
    // same-size dishes: low → wide beam, high → narrow beam
    const dL = dish(1.1), dH = dish(1.1, '#ffe2dd');
    dL.position.set(-7.4, 4.2, 0); dH.position.set(-7.4, 1.4, 0);
    const bL = beam(8, 0.34, LOW), bH = beam(10, 0.12, HIGH);
    bL.position.copy(dL.position); bH.position.copy(dH.position);
    B1.add(dL, dH, bL, bH);
    const gc = paper(5.2, 2.3, (ctx) => {
      text(ctx, '同尺寸天線 · Same size', 36, 72, { size: 44, weight: 900, color: P.ink });
      text(ctx, '頻率 ×2 → 增益 +6 dB', 36, 150, { size: 46, weight: 800, color: '#cf4f55' });
      text(ctx, 'Gain grows with frequency²', 36, 208, { size: 30, weight: 700, color: '#7a7196' });
      text(ctx, '→ 高增益天線可補回差距', 36, 290, { size: 40, weight: 800, color: '#2a936c' });
      text(ctx, 'High-gain antennas close the gap', 36, 342, { size: 28, weight: 700, color: '#7a7196' });
    }, { edge: P.coral });
    gc.g.position.set(6.2, 5.0, 0);
    B1.add(gc.g);
    return {
      root,
      update(S) {
        const { t, A, cue, lt } = S;
        const sw = easeInOut((lt - cue(3)) / 0.8);
        S.view(box(-10, -0.3, -2.6, 8.8, 7.6, 2.6, 0.2), box(-8, -0.3, -2, 9.8, 8.0, 2, 0.14), sw);
        setS(A1, 1 - easeInOut((lt - cue(3)) / 0.5));
        setS(B1, backOut((lt - cue(3) - 0.3) / 0.8));
        if (A1.visible) {
          r.userData.update(t, { tx: 1 });
          sh.userData.update(t, 5.2, 1);
          S.lab(null, src.clone().add(V(3.2, 2.4, 0)), '能量擴散與頻率無關', 'Spreading is frequency-independent', P.lav, A(0, 0.5, 0.6), { anchor: 'bottom' });
          setS(card.g, backOut(A(1, 0.5)));
          setS(nLo, backOut(A(2, 0.6))); setS(nHi, backOut(A(2, 0.6, 0.4)));
          const on = clamp(A(2, 0.6, 0.6));
          cLo.userData.update(t, seg(src, nLo.position), { on, speed: 0.3 });
          cHi.userData.update(t, seg(src, nHi.position), { on, speed: 0.3 });
          S.lab(nLo, V(0, 1.7, 0), '低頻：孔徑大', 'Low band: big aperture', LOW, A(2, 0.5, 0.8), { anchor: 'bottom' });
          S.lab(nHi, V(0, -1.7, 0.2), '高頻：孔徑小', 'High band: small aperture', HIGH, A(2, 0.5, 1.2));
        }
        if (B1.visible) {
          bL.children[0].material.opacity = 0.2 + 0.05 * Math.sin(t * 3);
          bH.children[0].material.opacity = 0.26 + 0.05 * Math.sin(t * 3 + 1);
          S.lab(dL, V(0, 1.4, 0), '低頻 · 波束寬', 'Low: wide beam', LOW, A(3, 0.5, 0.6), { anchor: 'bottom' });
          S.lab(dH, V(0, -1.3, 0.2), '高頻 · 波束窄、增益高', 'High: narrow, more gain', HIGH, A(3, 0.5, 1.0));
          setS(gc.g, backOut(A(3, 0.5, 1.4)));
          S.lab(null, V(1.6, 0.2, 1.4), '實際差距 < 公式預期', 'Real gap < formula', CLEARC, A(4, 0.5));
        }
      },
    };
  };

  SCENES.fresnel = function () {
    const root = new THREE.Group();
    const hL = hill(2.8, 3.0, '#8a8ed0'), hR = hill(2.8, 3.0, '#8f93cf');
    hL.position.x = -8.2; hR.position.x = 8.2;
    const rL = CH.radio(P.mint, { mast: 1.2 }), rR = CH.radio(P.pink, { mast: 1.2 });
    rL.position.set(-8.2, 3.0, 0); rR.position.set(8.2, 3.0, 0); rR.userData.head.rotation.y = Math.PI;
    root.add(hL, hR, rL, rR);
    root.updateMatrixWorld(true);
    const a = wpos(rL, rL.userData.ant), b = wpos(rR, rR.userData.ant);
    const los = rod(a, b, 0.035, '#fff7ec');
    const zLo = zone(a, b, 2.0, LOW, 0.26), zHi = zone(a, b, 0.96, HIGH, 0.4);
    root.add(los, zLo, zHi);
    const midH = new THREE.Group();
    const mh = hill(3.4, 1, '#9c9fdc', 8);
    midH.add(mh);
    root.add(midH);
    [-1.4, 1.3].forEach((x, i) => { const tr = CH.tree(i ? P.teal : P.mint, { face: false }); tr.position.set(x, 0, 1.6); tr.scale.setScalar(0.55); root.add(tr); });
    const bar6 = (len, color, dx) => {
      const top = a.clone().lerp(b, 0.5).add(V(dx, 0, 0.3)), bot = top.clone().add(V(0, -len, 0));
      const g = group(rod(top, bot, 0.07, color), mesh(GX.sph(0.14, 8, 6), color, { pos: bot.toArray() }), mesh(GX.box(0.5, 0.06, 0.2), color, { pos: bot.toArray() }));
      root.add(g); return g;
    };
    const r6L = bar6(2.0 * 0.6, '#2c78b3', -0.35), r6H = bar6(0.96 * 0.6, '#cf4f55', 0.35);
    const f = formula(10.4, 1.35, P.lav, [{ s: 'F₁ = 17.3 × √( d₁·d₂ / (f GHz × D) )  [m]', y: 145, size: 54 }]);
    f.g.position.set(0, 8.9, 0);
    root.add(f.g);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        S.view(box(-10.6, -0.3, -2.6, 10.6, 9.8, 2.6, 0.16));
        rL.userData.update(t, { tx: 1 }); rR.userData.update(t, { seed: 2 });
        const zA = backOut(A(1, 0.8));
        zLo.visible = zA > 0.01; zLo.userData.setR(2.0 * zA * (1 + 0.03 * Math.sin(t * 2)));
        const hiA = backOut(A(4, 0.8, 0.5));
        zHi.visible = hiA > 0.01; zHi.userData.setR(0.96 * hiA);
        // middle hill grows into the zone at cue 2, retreats, then grazes at cue 7
        const intr = a.y - 1.3 - 1.2;
        let hh = 1.2 + intr * easeInOut(A(2, 1.0)) - intr * easeInOut(A(3, 0.8));
        hh += (a.y - 0.05 - 1.2) * easeInOut(A(7, 1.0));
        mh.scale.y = hh; mh.position.y = hh / 2;
        const mid = a.clone().lerp(b, 0.5);
        S.lab(null, mid.clone().add(V(0, 2.3, 0)), '第一菲涅爾區', '1st Fresnel zone', LOW, A(1, 0.5, 0.5) * (1 - A(4, 0.4)), { anchor: 'bottom' });
        S.lab(null, V(0, hh + 0.2, 1.8), '侵入 → 繞射損耗', 'Intrusion → diffraction loss', P.coral, A(2, 0.5, 0.6) * (1 - A(3, 0.4)));
        setS(f.g, backOut(A(3, 0.5)));
        S.lab(null, mid.clone().add(V(-2.6, 2.1, 0)), '1350 MHz ≈ 33 m', 'midpoint radius', LOW, A(4, 0.5), { anchor: 'bottom' });
        S.lab(null, mid.clone().add(V(2.6, -1.2, 0.8)), '5900 MHz ≈ 16 m', 'midpoint radius', HIGH, A(4, 0.5, 0.8));
        const r6 = A(5, 0.5);
        [r6L, r6H].forEach((m) => { m.visible = r6 > 0.01; });
        S.lab(null, mid.clone().add(V(-2.6, -1.5, 1.4)), '0.6 × F₁ 淨空', 'ITU-R P.530', CLEARC, A(5, 0.5, 0.5) * (1 - A(7, 0.3)));
        S.lab(null, mid.clone().add(V(-5.2, 1.0, 0)), '低頻 ≈ 20 m', 'Low band clearance', LOW, A(6, 0.5), { anchor: 'bottom' });
        S.lab(null, mid.clone().add(V(5.2, 1.0, 0)), '高頻 ≈ 9.6 m', 'High band clearance', HIGH, A(6, 0.5, 0.6), { anchor: 'bottom' });
        S.lab(null, V(-3.6, a.y - 2.2, 2.0), '貼齊視線：最高約 15 dB', 'Grazing: up to ~15 dB', WARN, A(7, 0.5, 0.8));
      },
    };
  };

  SCENES.quick = function () {
    const root = new THREE.Group(), L1 = new THREE.Group();
    root.add(L1);
    const tA = CH.tower(2.6, P.periw), tB = CH.tower(2.6, P.lav, { face: false });
    tA.position.set(-9.2, 0, 0); tB.position.set(-1.6, 0, 0);
    const rA = CH.radio(P.mint, { mast: 0.6 }), rB = CH.radio(P.pink, { mast: 0.6 });
    rA.position.set(-9.2, 2.74, 0); rB.position.set(-1.6, 2.74, 0); rB.userData.head.rotation.y = Math.PI;
    rA.scale.setScalar(0.8); rB.scale.setScalar(0.8);
    L1.add(tA, tB, rA, rB);
    root.updateMatrixWorld(true);
    const a = wpos(rA, rA.userData.ant), b = wpos(rB, rB.userData.ant);
    const los = rod(a, b, 0.03, '#fff7ec');
    const zn = zone(a, b, 0.62, P.coral, 0.34);
    L1.add(los, zn);
    const obs = CH.tree(P.teal);
    obs.position.set((a.x + b.x) / 2, 0, 0.1);
    L1.add(obs);
    const f = formula(9.4, 1.5, P.mint, [{ s: '0.6F₁(中點) ≈ 5.2 × √(km ÷ GHz)', y: 96, size: 54 }, { s: 'Midpoint clearance in meters', y: 158, size: 30, fam: 'sans', color: '#7a7196' }]);
    f.g.position.set(5.0, 7.5, 0);
    const tbl = paper(9.4, 4.4, (ctx, w) => {
      text(ctx, '4700 MHz 速查 · Quick table', 40, 72, { size: 44, weight: 900, color: P.ink });
      [['1.2 km', 2.6], ['5 km', 5.4], ['10 km', 7.6], ['20 km', 10.7], ['30 km', 13.1]].forEach(([d, m], i) => {
        const y = 130 + i * 118;
        rr(ctx, 30, y, w - 60, 96, 18); ctx.fillStyle = i % 2 ? '#f3fbf7' : '#e2f6ec'; ctx.fill();
        text(ctx, d, 70, y + 64, { size: 46, weight: 800, color: P.ink, fam: 'mono' });
        const bw = (w - 560) * m / 13.1;
        rr(ctx, 330, y + 28, bw, 40, 12); ctx.fillStyle = CLEARC; ctx.fill();
        text(ctx, m.toFixed(1) + ' m', 350 + bw, y + 64, { size: 44, weight: 800, color: '#2a936c', fam: 'mono' });
      });
    }, { edge: P.mint });
    tbl.g.position.set(5.0, 3.5, 0);
    const heights = [0, 3, 6, 9, 12], losses = heights.map((h) => knife(h, 4700, 1.2, 0.6));
    const mState = { n: 0 };
    const mg = paper(9.4, 4.4, (ctx, w, h, st) => {
      text(ctx, '69 dB 餘裕能容忍多高？', 40, 72, { size: 44, weight: 900, color: P.ink });
      text(ctx, '1.2 km · 4700 MHz · obstacle at midpoint', 40, 118, { size: 28, weight: 700, color: '#7a7196' });
      heights.forEach((hm, i) => {
        const y = 150 + i * 106, x0 = 250, bw = w - x0 - 60;
        text(ctx, `+${hm} m`, 40, y + 58, { size: 40, weight: 800, color: P.ink, fam: 'mono' });
        const on = i < st.n;
        const lw = bw * losses[i] / 69;
        rr(ctx, x0, y + 18, bw, 58, 14); ctx.fillStyle = on ? '#bfeedd' : '#eee6da'; ctx.fill();
        if (on) {
          rr(ctx, x0 + bw - lw, y + 18, lw, 58, 14); ctx.fillStyle = HIGH; ctx.fill();
          text(ctx, `−${losses[i].toFixed(1)}`, x0 + bw - lw - 14, y + 60, { size: 32, weight: 800, align: 'right', color: '#cf4f55', fam: 'mono' });
          text(ctx, `剩 ${(69 - losses[i]).toFixed(1)} dB`, x0 + 18, y + 60, { size: 32, weight: 800, color: '#2a936c' });
        }
      });
    }, { edge: P.coral, state: mState });
    mg.g.position.set(5.0, 3.5, 0);
    root.add(f.g, tbl.g, mg.g);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        S.view(box(-10.4, -0.3, -1.6, 10.0, 8.5, 1.6, 0.12));
        [tA, tB].forEach((o, i) => o.userData.update(t, { seed: i }));
        rA.userData.update(t, { tx: 1 }); rB.userData.update(t, { seed: 1 });
        obs.userData.update(t);
        // obstacle top vs line of sight: below → touch (cue5) → +12 m (cue6)
        const unit = 0.62 / 2.6 * 0.6;  // world units per meter (0.6F1 = 2.6 m ↔ 0.6 × zone radius)
        let top = a.y - 0.62 * 0.6 - 0.9;
        top += (0.62 * 0.6 + 0.9) * easeInOut(A(5, 1.0));
        const stepK = clamp((lt - cue(6)) / Math.max(0.5, S.end(6) - cue(6)));
        const nStep = lt < cue(5) ? 0 : lt < cue(6) ? 1 : 1 + Math.min(4, Math.floor(stepK * 4.999));
        top += unit * heights[Math.max(0, nStep - 1)] * (nStep > 0 ? 1 : 0);
        const sc = top / 2.9;
        obs.scale.set(0.7, Math.max(0.2, sc), 0.7);
        setS(f.g, backOut(A(1, 0.5)));
        setS(tbl.g, backOut(A(2, 0.5)) * (1 - easeInOut(A(4, 0.4))));
        setS(mg.g, backOut(A(4, 0.5, 0.3)));
        mState.n = nStep;
        mg.redraw({ ...mState });
        const mid = a.clone().lerp(b, 0.5);
        S.lab(null, mid.clone().add(V(0, 1.1, 0.4)), '路徑中點最嚴苛', 'Midpoint is the tightest', P.coral, A(0, 0.5, 0.5) * (1 - A(3, 0.4)), { anchor: 'bottom' });
        S.lab(null, V(mid.x, 0.3, 1.4), '低於門檻 → 安全', 'Below it → fine', CLEARC, A(3, 0.5) * (1 - A(4, 0.4)));
        S.lab(null, V(mid.x, 0.3, 1.4), '0.6F₁ 是保守門檻', 'A conservative threshold', WARN, A(4, 0.5, 0.3) * (1 - A(7, 0.4)));
        S.lab(null, V(-5.4, 6.3, 0.4), '現地會勘 · 親眼確認', 'Site survey: see it yourself', P.butter, A(7, 0.5), { anchor: 'bottom' });
      },
    };
  };

  SCENES.multipath = function () {
    const root = new THREE.Group();
    const wt = water(17, 4.6);
    wt.position.set(0, 0, 0.4);
    root.add(wt);
    const mA = CH.radio(P.mint, { mast: 2.3 }), mB = CH.radio(P.pink, { mast: 2.3 });
    mA.position.set(-8.2, 0.1, 0); mB.position.set(8.2, 0.1, 0); mB.userData.head.rotation.y = Math.PI;
    root.add(mA, mB);
    const dP = beads(18, P.butter, 0.13), rP = beads(18, P.lav, 0.12);
    root.add(dP, rP);
    const rd = [rod(V(0, 0, 0), V(1, 0, 0), 0.04, P.butter), rod(V(0, 0, 0), V(1, 0, 0), 0.03, P.lav), rod(V(0, 0, 0), V(1, 0, 0), 0.03, P.lav)];
    root.add(...rd);
    const setRod = (m, p, q) => { const d = q.clone().sub(p); m.scale.y = d.length(); m.position.copy(p).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); };
    const phase = { k: 0 };
    const wc = paper(8.6, 3.9, (ctx, w, h, st) => {
      text(ctx, '合成強度 vs 天線高度', 36, 66, { size: 42, weight: 900, color: P.ink });
      text(ctx, 'Direct + reflected (−180°), d = 10 km', 36, 108, { size: 26, weight: 700, color: '#7a7196' });
      const amp = (hh, f) => { const lam = 300 / f, dd = 2 * hh * 10 / 10000; const ph = 2 * Math.PI * dd / lam; return Math.hypot(1 - 0.9 * Math.cos(ph), 0.9 * Math.sin(ph)); };
      const hs = range(2, 30, 140);
      const { mx, my } = chart(ctx, 120, 150, w - 170, h - 280, {
        xr: [2, 30], yr: [0, 2], xt: [2, 10, 20, 30], yt: [0, 1, 2], xl: '天線高度 h₁ (m)',
        series: [{ pts: hs.map((x) => [x, amp(x, 1350)]), color: LOW, k: st.k, w: 6 }, { pts: hs.map((x) => [x, amp(x, 5900)]), color: HIGH, k: st.k, w: 6 }],
      });
      if (st.k > 0.9) { ctx.setLineDash([8, 8]); ctx.strokeStyle = '#8f86ad'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mx(10), my(0)); ctx.lineTo(mx(10), my(2)); ctx.stroke(); ctx.setLineDash([]); }
    }, { edge: P.lav, state: phase });
    wc.g.position.set(4.4, 7.1, -0.6);
    const fc = paper(8.6, 3.9, (ctx, w, h, st) => {
      text(ctx, 'Δd ≈ 2·h₁·h₂ / d', 36, 86, { size: 58, weight: 700, color: P.ink, fam: 'mono' });
      text(ctx, '10 m · 10 m · 10 km → 2 cm', 36, 150, { size: 38, weight: 800, color: '#6f55cf', fam: 'mono' });
      if (st.n > 0) {
        [['1350 MHz', 'λ 22.2 cm', 0.09, LOW, '#2c78b3'], ['5900 MHz', 'λ 5.1 cm', 0.39, HIGH, '#cf4f55']].forEach(([f, l, p, c, dc], i) => {
          const y = 210 + i * 104;
          text(ctx, f, 36, y + 44, { size: 36, weight: 800, color: dc, fam: 'mono' });
          text(ctx, l, 290, y + 44, { size: 30, weight: 700, color: '#7a7196', fam: 'mono' });
          rr(ctx, 490, y + 12, 330, 44, 12); ctx.fillStyle = '#eee6da'; ctx.fill();
          rr(ctx, 490, y + 12, 330 * p / 0.5, 44, 12); ctx.fillStyle = c; ctx.fill();
          text(ctx, Math.round(p * 100) + '%', 840, y + 46, { size: 38, weight: 800, color: dc, fam: 'mono' });
        });
      }
    }, { edge: P.butter, state: { n: 0 } });
    fc.g.position.set(-4.4, 7.1, -0.6);
    root.add(wc.g, fc.g);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        S.view(box(-10.2, -0.3, -2.0, 10.2, 9.3, 2.8, 0.16));
        wt.userData.update(t);
        const raise = easeInOut(A(7, 1.2));
        mA.scale.setScalar(1 + raise * 0.3); mB.scale.setScalar(1 + raise * 0.3);
        const wig = lt > cue(6) && lt < cue(7) ? Math.sin(t * 3) * 0.12 : 0;
        mA.position.y = 0.1 + wig;
        root.updateMatrixWorld(true);
        mA.userData.update(t, { tx: 1 }); mB.userData.update(t, { seed: 1.5 });
        const a = wpos(mA, mA.userData.ant), b = wpos(mB, mB.userData.ant);
        const rp = V(-8.2 + 16.4 * a.y / (a.y + b.y), 0.14, 0.2);
        const ra = clamp(lt / 0.6);
        setRod(rd[0], a, b); setRod(rd[1], a, rp); setRod(rd[2], rp, b);
        rd.forEach((m) => { m.visible = ra > 0.02; });
        dP.userData.update(t, seg(a, b), { on: ra, speed: 0.22 });
        rP.userData.update(t, poly([a, rp, b]), { on: ra, speed: 0.2 });
        S.lab(null, a.clone().lerp(b, 0.5).add(V(0, 0.5, 0)), '直射波', 'Direct', P.butter, A(0, 0.5, 0.3), { anchor: 'bottom' });
        S.lab(null, rp.clone().add(V(0, 0, 1.6)), '反射波', 'Reflected', P.lav, A(0, 0.5, 0.9));
        S.lab(null, V(0, 1.2, 2.4), '疊加 或 抵消', 'Add up or cancel', P.teal, A(1, 0.5) * (1 - A(2, 0.3)));
        setS(fc.g, backOut(A(2, 0.5)));
        fc.redraw({ n: lt > cue(4) ? 1 : 0 });
        S.lab(mA, V(0.6, 1.6, 0.8), 'h₁ = 10 m', '', P.mint, A(3, 0.5) * (1 - A(7, 0.3)));
        S.lab(mB, V(-0.6, 1.6, -0.8), 'h₂ = 10 m', '', P.pink, A(3, 0.5) * (1 - A(7, 0.3)));
        S.lab(null, rp.clone().add(V(0, 0.2, 2.6)), '反射再翻轉約 180°', 'Reflection flips phase ~180°', WARN, A(5, 0.5) * (1 - A(7, 0.3)));
        setS(wc.g, backOut(A(5, 0.5, 0.8)));
        phase.k = easeInOut(A(6, 1.4));
        wc.redraw({ ...phase });
        S.lab(null, V(4.4, 4.7, 0.8), '高頻起伏更劇烈', 'High band swings harder', HIGH, A(6, 0.5, 1.4) * (1 - A(7, 0.3)));
        S.lab(null, V(0, 0.5, 2.6), '天線架高 · 避開貼近水面', 'Mount high · avoid skimming water', CLEARC, A(7, 0.5, 0.6));
      },
    };
  };

  SCENES.foliage = function () {
    const root = new THREE.Group();
    const rL = CH.radio(P.mint, { mast: 1.8 }), rR = CH.radio(P.pink, { mast: 1.8 });
    rL.position.set(-8.4, 0, 0); rR.position.set(8.4, 0, 0); rR.userData.head.rotation.y = Math.PI;
    root.add(rL, rR);
    const trees = [-2.2, -0.6, 1.0, 2.6].map((x, i) => { const tr = CH.tree(i % 2 ? P.teal : P.mint, { face: i === 1 }); tr.position.set(x, 0, (i % 2) * 0.4 - 0.2); tr.scale.setScalar(1.05); root.add(tr); return tr; });
    root.updateMatrixWorld(true);
    const a = wpos(rL, rL.userData.ant), b = wpos(rR, rR.userData.ant);
    const lo = beads(22, LOW, 0.15), hi = beads(22, HIGH, 0.12);
    root.add(lo, hi);
    const cl = CH.cloud();
    cl.position.set(4.6, 6.2, 0.4);
    root.add(cl);
    const fog = new THREE.Group();
    for (let i = 0; i < 6; i++) fog.add(mesh(GX.sph(0.9 + hash(i) * 0.6, 12, 9), '#f2efff', { opacity: 0.35, flat: false, shadow: false, pos: [-6 + i * 2.4, 1.2 + hash(i + 3) * 1.4, 1.2 - hash(i + 5) * 2] }));
    root.add(fog);
    const ple = paper(6.4, 3.8, (ctx, w, h, st) => {
      text(ctx, '損耗指數 · Path-loss exponent', 36, 66, { size: 40, weight: 900, color: P.ink });
      const ds = range(1, 10, 40);
      chart(ctx, 130, 130, w - 180, h - 260, {
        xr: [1, 10], yr: [0, 50], xt: [1, 2, 5, 10], yt: [0, 20, 40], logx: true, xl: '相對距離 (log)', yl: '額外損耗 dB',
        series: [{ pts: ds.map((d) => [d, 20 * Math.log10(d)]), color: CLEARC, k: st.k }, { pts: ds.map((d) => [d, 45 * Math.log10(d)]), color: HIGH, k: st.k, dash: [16, 12] }],
      });
      if (st.k > 0.8) { pill(ctx, w - 70, 330, 'LOS n ≈ 2', '#2a936c', { align: 'right', size: 28 }); pill(ctx, w - 70, 200, 'NLOS n ≈ 4–5', '#cf4f55', { align: 'right', size: 28 }); }
    }, { edge: P.mint, state: { k: 0 } });
    ple.g.position.set(-5.2, 6.6, -0.4);
    root.add(ple.g);
    return {
      root,
      update(S) {
        const { t, A, lt } = S;
        S.view(box(-10.4, -0.3, -2.4, 10.4, 8.6, 2.4, 0.18));
        rL.userData.update(t, { tx: 1 }); rR.userData.update(t, { seed: 1 });
        trees.forEach((tr, i) => tr.userData.update(t, { seed: i }));
        const on = clamp(lt / 0.6);
        const up = V(0, 0.4, 0), dn = V(0, -0.35, 0);
        const pl = (k) => a.clone().add(up).lerp(b.clone().add(up), k).add(V(0, Math.sin(k * Math.PI * 8 + t) * 0.06 * (k > 0.33 && k < 0.66 ? 1 : 0), 0));
        lo.userData.update(t, pl, { on, speed: 0.16 });
        const stop = lt > S.cue(1) ? 0.36 : 1;
        hi.userData.update(t, (k) => a.clone().add(dn).lerp(b.clone().add(dn), k), { on: on * clamp(A(1, 0.3) * 2), speed: 0.16, stop });
        S.lab(null, V(0, a.y + 1.9, 0), '低頻：繞過、穿過樹葉', 'Low band: bends through foliage', LOW, A(0, 0.5, 0.6), { anchor: 'bottom' });
        S.lab(null, V(-3.8, a.y - 1.9, 1.0), '高頻：像光一樣被擋住', 'High band: blocked like light', HIGH, A(1, 0.5, 0.4));
        setS(cl, backOut(A(2, 0.6)));
        cl.userData.update(t, { rain: A(2, 0.5, 0.4), fall: 4.2 });
        S.lab(cl, V(0, 1.2, 0), '< 6 GHz 雨衰不顯著', 'Rain fade minor below 6 GHz', P.sky, A(2, 0.5, 1.0), { anchor: 'bottom' });
        S.lab(cl, V(0, -4.8, 1.0), '> 10 GHz 才明顯', 'Significant above 10 GHz', P.lav, A(2, 0.5, 2.0));
        const fa = A(3, 0.8) * (1 - A(4, 0.6));
        fog.visible = fa > 0.01;
        fog.children.forEach((m, i) => { m.material.opacity = 0.35 * fa; m.position.x += Math.sin(t + i) * 0.003; });
        S.lab(null, V(0, 0.6, 2.4), '濕氣／霧：頻段上緣微幅影響', 'Humidity & fog: slight effect', P.lilac, A(3, 0.5, 0.4) * (1 - A(4, 0.4)));
        setS(ple.g, backOut(A(4, 0.5)));
        ple.redraw({ k: easeInOut(A(4, 1.2, 0.4)) });
      },
    };
  };

  SCENES.urban = function () {
    const root = new THREE.Group(), N = new THREE.Group(), R = new THREE.Group();
    root.add(N, R);
    // A: true NLOS street corner
    const blk = CH.tower(4.2, P.lav, { w: 3.0, d: 3.0 });
    blk.position.set(-4.0, 0, -0.6);
    const b2 = CH.tower(3.2, P.periw, { w: 2.2, d: 2.2, face: false });
    b2.position.set(1.6, 0, -0.4);
    const b3 = CH.tower(2.6, '#b8a8f0', { w: 1.8, d: 1.8, face: false });
    b3.position.set(-7.6, 0, -2.4);
    const nA = CH.radio(P.mint, { mast: 0.8 }), nB = CH.radio(P.pink, { mast: 0.8 });
    nA.position.set(-7.4, 0, 2.0); nB.position.set(-1.2, 0, -2.9); nB.userData.head.rotation.y = Math.PI;
    N.add(blk, b2, b3, nA, nB);
    const nlo = beads(18, LOW, 0.14), nhi = beads(18, HIGH, 0.12);
    N.add(nlo, nhi);
    // B: rooftop-to-rooftop link with a middle building
    const tL = CH.tower(4.2, P.periw), tR = CH.tower(4.2, P.lav, { face: false });
    tL.position.set(-9.4, 0, 0); tR.position.set(1.4, 0, 0);
    const rL = CH.radio(P.mint, { mast: 0.5 }), rR = CH.radio(P.pink, { mast: 0.5 });
    rL.position.set(-9.4, 4.34, 0); rR.position.set(1.4, 4.34, 0); rR.userData.head.rotation.y = Math.PI;
    rL.scale.setScalar(0.85); rR.scale.setScalar(0.85);
    const mid = CH.tower(3.0, '#b8a8f0', { w: 1.6, d: 1.4 });
    mid.position.set(-4.0, 0, 0);
    R.add(tL, tR, rL, rR, mid);
    root.updateMatrixWorld(true);
    const a = wpos(rL, rL.userData.ant), b = wpos(rR, rR.userData.ant);
    const U = 2.0 / 33.3;  // world units per meter (F1 low = 33.3 m)
    R.add(rod(a, b, 0.03, '#fff7ec'), zone(a, b, 2.0, LOW, 0.22), zone(a, b, 0.96, HIGH, 0.38));
    const hsList = [-15, -5, 5];
    const cs = { h: -15, k: 0 };
    const cc = paper(7.0, 5.6, (ctx, w, h, st) => {
      text(ctx, '繞射損耗 vs 障礙物高度', 36, 68, { size: 42, weight: 900, color: P.ink });
      text(ctx, '20 km · obstacle at midpoint · h vs line of sight', 36, 110, { size: 26, weight: 700, color: '#7a7196' });
      const hs = range(-20, 10, 120);
      const { mx, my } = chart(ctx, 120, 160, w - 170, h - 300, {
        xr: [-20, 10], yr: [0, 12], xt: [-20, -15, -5, 0, 5, 10], yt: [0, 4, 8, 12], xl: '障礙物高度 h (m)', yl: 'dB',
        series: [{ pts: hs.map((x) => [x, knife(x, 1350, 20, 10)]), color: LOW, k: st.k }, { pts: hs.map((x) => [x, knife(x, 5900, 20, 10)]), color: HIGH, k: st.k }],
      });
      if (st.k > 0.9) {
        ctx.setLineDash([8, 8]); ctx.strokeStyle = '#8f86ad'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx(st.h), my(0)); ctx.lineTo(mx(st.h), my(12)); ctx.stroke(); ctx.setLineDash([]);
        dot(ctx, mx(st.h), my(knife(st.h, 1350, 20, 10)), 12, LOW);
        dot(ctx, mx(st.h), my(knife(st.h, 5900, 20, 10)), 12, HIGH);
        text(ctx, '1350', mx(-19), my(knife(-19, 1350, 20, 10)) - 18, { size: 28, weight: 800, color: '#2c78b3', fam: 'mono' });
        text(ctx, '5900', mx(-12), my(0) - 16, { size: 28, weight: 800, color: '#cf4f55', fam: 'mono' });
        if (st.x) pill(ctx, mx(0), my(10.8), '交叉點 h ≈ 0', '#6f55cf', { size: 28 });
      }
    }, { edge: P.lav, state: cs });
    cc.g.position.set(6.6, 4.4, 0);
    R.add(cc.g);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        const sw = easeInOut((lt - cue(1)) / 0.8);
        S.view(box(-9.6, -0.3, -3.8, 3.0, 5.4, 3.2, 0.55), box(-10.6, -0.3, -1.8, 10.2, 8.2, 1.8, 0.14), sw);
        setS(N, 1 - easeInOut((lt - cue(1)) / 0.5));
        setS(R, backOut((lt - cue(1) - 0.3) / 0.8));
        if (N.visible) {
          [blk, b2, b3].forEach((o, i) => o.userData.update(t, { seed: i }));
          nA.userData.update(t, { tx: 1 }); nB.userData.update(t, { seed: 1 });
          const pa = wpos(nA, nA.userData.ant), pb = wpos(nB, nB.userData.ant);
          const corner = V(-2.0, pa.y, 1.5);
          nlo.userData.update(t, poly([pa, corner, V(-1.3, pb.y, -0.2), pb]), { on: clamp(lt / 0.6), speed: 0.2 });
          nhi.userData.update(t, poly([pa, V(-5.4, pa.y - 0.2, 0.9)]), { on: clamp(lt / 0.6), speed: 0.3 });
          S.lab(null, corner.clone().add(V(0, 1.1, 0)), '低頻：繞過轉角、穿牆', 'Low band: corners & walls', LOW, A(0, 0.5, 0.8), { anchor: 'bottom' });
          S.lab(null, V(-5.8, 0.6, 2.2), '高頻：撞牆', 'High band: blocked', HIGH, A(0, 0.5, 1.6));
          S.lab(nB, V(0, -0.2, 1.0), '在大樓後方', 'Behind the building', P.pink, A(0, 0.5, 0.4));
        }
        if (R.visible) {
          [tL, tR, mid].forEach((o, i) => o.userData.update(t, { seed: i }));
          rL.userData.update(t, { tx: 1 }); rR.userData.update(t, { seed: 1 });
          const st = lt < cue(3) ? 0 : lt < cue(4) ? 1 : 2;
          const prev = Math.max(0, st - 1), kk = easeInOut((lt - cue(st + 1)) / 0.9);
          const hm = st === 0 ? hsList[0] : lerp(hsList[prev], hsList[st], kk);
          const top = a.y + hm * U;
          mid.scale.y = Math.max(0.1, top / (3.0 + 0.14));
          cs.h = hm; cs.k = easeInOut(A(2, 1.0, 0.3)); cs.x = lt > cue(5) ? 1 : 0;
          setS(cc.g, backOut(A(1, 0.5, 0.9)));
          cc.redraw({ ...cs });
          S.lab(null, V(-4.0, top + 0.1, 1.3), `h = ${hm > 0 ? '+' : ''}${Math.round(hm)} m`, hm < 0 ? 'below the line' : 'above the line', hm < 0 ? CLEARC : P.coral, A(2, 0.5, 0.3));
          S.lab(null, a.clone().lerp(b, 0.5).add(V(0, 2.2, 0)), '屋頂對屋頂 · 勉強視距', 'Rooftop, marginal clearance', P.lav, A(1, 0.5, 1.2) * (1 - A(2, 0.3)), { anchor: 'bottom' });
          S.lab(null, V(-4.0, 0.3, 1.6), '碰到視線 → 優劣反轉', 'Touching the line → they swap', WARN, A(5, 0.5, 0.4));
        }
      },
    };
  };

  SCENES.terrain = function () {
    const root = new THREE.Group();
    const X = [-8.4, -4.2, 0, 4.2, 8.4];
    const plats = X.map((x, i) => { const g = new THREE.Group(); g.position.x = x; g.add(platform(3.8, 3.4, ['#fff0d2', '#e3f6e9', '#dff1ff', '#efe9ff', '#ffe9e3'][i])); root.add(g); return g; });
    const mini = (o, g, x, z, s) => { o.position.set(x, 0.3, z); o.scale.setScalar(s); g.add(o); return o; };
    // 0 open field
    const r0a = mini(CH.radio(P.mint, { mast: 0.7 }), plats[0], -1.4, 0, 0.55), r0b = mini(CH.radio(P.pink, { mast: 0.7 }), plats[0], 1.4, 0, 0.55);
    r0b.userData.head.rotation.y = Math.PI;
    // 1 forest
    for (let i = 0; i < 5; i++) mini(CH.tree(i % 2 ? P.teal : P.mint, { face: i === 2 }), plats[1], -1.3 + i * 0.65, (i % 2) * 0.7 - 0.35, 0.5);
    // 2 water
    const wt = water(3.4, 3.0); wt.position.y = 0.3; plats[2].add(wt);
    const r2a = mini(CH.radio(P.mint, { mast: 1.6 }), plats[2], -1.5, 0, 0.5), r2b = mini(CH.radio(P.pink, { mast: 1.6 }), plats[2], 1.5, 0, 0.5);
    r2b.userData.head.rotation.y = Math.PI;
    // 3 mountains with a gap + narrow beam
    const pk1 = mini(group(hill(1.1, 2.6, '#9c9fdc'), mesh(GX.cone(0.36, 0.5, 7), '#fff7ec', { pos: [0, 2.37, 0] })), plats[3], -0.9, -0.3, 1);
    const pk2 = mini(group(hill(1.0, 2.2, '#8f93cf'), mesh(GX.cone(0.32, 0.45, 7), '#fff7ec', { pos: [0, 2.0, 0] })), plats[3], 1.0, 0.2, 1);
    void pk1; void pk2;
    const d3 = dish(0.36); d3.position.set(-1.6, 1.0, 1.2); plats[3].add(d3);
    const b3 = beam(3.2, 0.07, HIGH); b3.position.copy(d3.position); plats[3].add(b3);
    // 4 tactical tripod + wide beam
    const r4 = mini(CH.radio(P.butter, { mast: 0.9 }), plats[4], -1.2, 0, 0.6);
    const b4 = beam(2.6, 0.45, LOW); plats[4].add(b4);
    root.updateMatrixWorld(true);
    b4.position.copy(plats[4].worldToLocal(wpos(r4, r4.userData.ant)));
    const info = [
      ['開闊平地', 'Open & long', '低頻', LOW], ['森林植被', 'Forest', '低頻', LOW], ['水面沿岸', 'Water & coast', '低頻＋架高', LOW],
      ['山區夾縫', 'Mountain gaps', '高頻＋指向天線', HIGH], ['山區夾縫', 'Mountain gaps', '對準要精確', HIGH], ['快速架設', 'Rapid setup', '低頻較寬容', LOW],
    ];
    const plIdx = [0, 1, 2, 3, 3, 4];
    const views = X.map((x) => box(x - 2.6, -0.2, -1.9, x + 2.6, 3.6, 2.2, 0.32));
    const wide = box(-10.6, -0.2, -2.0, 10.6, 3.6, 2.2, 0.36);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        let s = 0;
        for (let i = 0; i < 6; i++) if (lt >= cue(i) - 0.2) s = i;
        const p = plIdx[s], pp = s ? plIdx[s - 1] : null;
        const k = easeInOut((lt - (cue(s) - 0.2)) / 0.9);
        const from = pp === null ? wide : views[pp];
        const to = views[p];
        S.view(from, to, pp === p ? 1 : k);
        root.traverse((o) => { if (o !== root && typeof o.userData.update === 'function') o.userData.update(t, {}); });
        r0a.userData.update(t, { tx: 1 }); r2a.userData.update(t, { tx: 1 }); r4.userData.update(t, { tx: 1 });
        b3.children[0].material.opacity = 0.3 + (s === 4 ? 0.15 * Math.sin(t * 6) : 0);
        b3.rotation.y = s === 4 ? Math.sin(t * 1.6) * 0.18 : 0;
        b4.children[0].material.opacity = 0.2 + 0.05 * Math.sin(t * 3);
        plats.forEach((g, i) => { g.position.y = i === p ? Math.abs(Math.sin(t * 2)) * 0.05 : 0; });
        const [zh, en, rec, c] = info[s];
        const x = X[p];
        const la = clamp((lt - cue(s) + 0.2) / 0.5);
        S.head(V(x, 3.2, -1.4), zh, en, c, la);
        S.lab(null, V(x, 0.2, 2.0), rec, c === LOW ? 'Low band' : 'High band', c, la);
        if (s === 5) S.lab(null, V(x + 0.8, 1.6, 1.4), '淨空需求較大', 'Needs more clearance', WARN, A(5, 0.5, 2.5), { anchor: 'bottom' });
      },
    };
  };

  SCENES.summary = function () {
    const root = new THREE.Group(), T = new THREE.Group(), E = linkDiorama();
    root.add(T, E);
    const rows = [
      ['城市（真 NLOS）', '低頻', '穿透／繞射韌性佳'], ['開闊長距離', '低頻', 'FSPL 較低，餘裕大'], ['森林植被', '低頻', '繞射穿透植被較佳'],
      ['水面／沿岸', '低頻', '多路徑隨頻率升高'], ['屋頂邊緣淨空', '高頻可能較佳', '菲涅爾區較窄'], ['山區夾縫', '高頻＋指向天線', '易找到淨空路徑'], ['快速架設', '低頻較寬容', '波束寬，容錯高'],
    ];
    const tb = paper(13.0, 6.9, (ctx, w, h, st) => {
      text(ctx, '情境對照 · Scenario summary', 46, 86, { size: 56, weight: 900, color: P.ink });
      const cx = [46, 900, 1440];
      ['情境 Scenario', '建議頻段 Band', '主要原因 Why'].forEach((s, i) => text(ctx, s, cx[i], 164, { size: 34, weight: 800, color: '#7a7196' }));
      rows.forEach((r, i) => {
        const y = 190 + i * 116;
        const hiRow = r[1].startsWith('高');
        const on = i < st.n;
        ctx.globalAlpha = on ? 1 : 0.18;
        rr(ctx, 30, y, w - 60, 100, 20); ctx.fillStyle = st.hl && hiRow ? '#ffe3de' : i % 2 ? '#f7f2ea' : '#fff'; ctx.fill();
        text(ctx, r[0], cx[0] + 10, y + 66, { size: 46, weight: 800, color: P.ink });
        pill(ctx, cx[1], y + 50, r[1], hiRow ? '#cf4f55' : '#2c78b3', { align: 'left', size: 38 });
        text(ctx, r[2], cx[2], y + 66, { size: 42, weight: 700, color: '#5a4f7a' });
        ctx.globalAlpha = 1;
      });
    }, { edge: P.lav, res: 150, state: { n: 0, hl: 0 } });
    tb.g.position.set(0, 4.5, 0);
    T.add(tb.g);
    return {
      root,
      update(S) {
        const { t, A, lt, cue } = S;
        const k = easeInOut((lt - cue(3)) / 0.9);
        S.view(box(-7.2, 0.4, -0.3, 7.2, 7.8, 0.4, 0.08), box(-10.4, -0.3, -2.4, 10.4, 5.2, 2.4, 0.2), k);
        setS(T, 1 - easeInOut((lt - cue(3)) / 0.5));
        setS(E, backOut((lt - cue(3) - 0.3) / 0.8));
        if (T.visible) {
          const n = Math.floor(clamp((lt - 0.3) / Math.max(1, S.end(0) - 0.3)) * 7 + 1e-4);
          tb.redraw({ n: Math.min(7, n), hl: lt > cue(1) ? 1 : 0 });
          S.lab(null, V(-5.0, 0.3, 0.6), '頻譜派配', 'Spectrum', P.lav, A(2, 0.5));
          S.lab(null, V(-1.7, 0.3, 0.6), '干擾', 'Interference', P.coral, A(2, 0.5, 0.4));
          S.lab(null, V(1.7, 0.3, 0.6), '傳輸量', 'Throughput', P.mint, A(2, 0.5, 0.8));
          S.lab(null, V(5.0, 0.3, 0.6), '裝備規格', 'Equipment specs', P.butter, A(2, 0.5, 1.2));
        }
        if (E.visible) {
          E.userData.update(t, {});
          S.lab(null, V(-4.0, 4.6, 0), '鏈路預算', 'Link budget', P.lav, A(3, 0.5, 0.6), { anchor: 'bottom' });
          S.lab(null, V(4.0, 4.6, 0), '現地確認', 'Confirm on site', CLEARC, A(3, 0.5, 1.0), { anchor: 'bottom' });
          const ta = A(4, 0.6);
          S.draw((ctx) => withA(ctx, ta, () => {
            text(ctx, '謝謝收看', 960, 700, { size: 64, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(146,210,255,.9)', blur: 26 });
            text(ctx, 'THANKS FOR WATCHING', 960, 742, { size: 22, weight: 700, align: 'center', color: '#eaf7ff', fam: 'disp', ls: 8, shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 2 });
          }));
        }
      },
    };
  };


  // ---------- world ----------
  function buildWorld(scene) {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 512;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, P.sky0); gr.addColorStop(0.62, P.sky1); gr.addColorStop(1, '#5c5693');
    x.fillStyle = gr;
    x.fillRect(0, 0, 16, 512);
    scene.background = new THREE.CanvasTexture(cv);
    const world = new THREE.Group();
    const ground = mesh(GX.cyl(30, 30, 0.6, 40), P.ground, { pos: [0, -0.3, 0] });
    ground.castShadow = false;
    world.add(ground);
    const stage = mesh(GX.cyl(13.5, 13.8, 0.12, 36), P.stage, { pos: [0, -0.02, 0] });
    stage.castShadow = false;
    world.add(stage);
    // far decorations: low-poly hills, trees and clouds
    const deco = [];
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3, R = 20 + hash(i) * 4;
      const x0 = Math.sin(a) * R, z0 = -Math.cos(a) * R + 2;
      world.add(mesh(GX.ico(2.2 + hash(i + 3) * 1.6, 0), i % 2 ? '#8a86c8' : '#7d7fc0', { pos: [x0, 0.4, z0], scale: [1.4, 0.7, 1] }));
      const tr = group(mesh(GX.cone(0.7, 1.8, 6), i % 3 ? P.mint : P.pink, { pos: [0, 1.5, 0] }), mesh(GX.cyl(0.12, 0.14, 0.6, 6), '#b39a8a', { pos: [0, 0.3, 0] }));
      tr.position.set(x0 + 2.4, 0, z0 + 1.5);
      world.add(tr);
    }
    // sparkles
    const sp = new THREE.InstancedMesh(GX.ico(0.08, 0), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), 60);
    world.add(sp);
    const m4 = new THREE.Matrix4();
    world.userData.update = (t) => {
      for (let i = 0; i < 60; i++) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.5 + hash(i)) + i));
        m4.makeScale(tw, tw, tw);
        m4.setPosition((hash(i) - 0.5) * 60, 8 + hash(i + 20) * 12, -24 - hash(i + 40) * 6);
        sp.setMatrixAt(i, m4);
      }
      sp.instanceMatrix.needsUpdate = true;
    };
    scene.add(world);
    scene.add(new THREE.HemisphereLight('#fff6ea', '#6a64a8', 0.78));
    const sun = new THREE.DirectionalLight('#fff0dc', 0.72);
    sun.position.set(7, 15, 11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 50 });
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#c9d6ff', 0.25);
    fill.position.set(-8, 6, 10);
    scene.add(fill);
    return world;
  }

  // ---------- auto framing ----------
  // Solve for a camera that fits a world-space box inside the safe screen area
  // (clear of the header, subtitles and progress bar).
  const FOV = 32;
  const fitCache = new Map();
  function fit(min, max, elev, azim = 0) {
    const key = [min.toArray(), max.toArray(), elev, azim].join('|');
    if (fitCache.has(key)) return fitCache.get(key);
    const sf = { x0: 90, x1: 1830, y0: 128, y1: 830 };
    const corners = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) corners.push(V(x, y, z));
    const target = min.clone().add(max).multiplyScalar(0.5);
    const dir = V(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
    const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 500);
    let dist = 24;
    for (let i = 0; i < 60; i++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      corners.forEach((c) => {
        const p = c.clone().project(cam);
        const sx = (p.x + 1) / 2 * W, sy = (1 - p.y) / 2 * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      });
      const s = Math.max((x1 - x0) / (sf.x1 - sf.x0), (y1 - y0) / (sf.y1 - sf.y0));
      const wpp = 2 * dist * Math.tan(FOV / 2 * Math.PI / 180) / H;
      const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0), up = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 1);
      const dx = (x0 + x1) / 2 - (sf.x0 + sf.x1) / 2, dy = (y0 + y1) / 2 - (sf.y0 + sf.y1) / 2;
      target.addScaledVector(right, dx * wpp * 0.7).addScaledVector(up, -dy * wpp * 0.7);
      dist *= 1 + (s - 1) * 0.6;
    }
    const out = { pos: cam.position.clone(), look: target.clone() };
    fitCache.set(key, out);
    return out;
  }
  const box = (x0, y0, z0, x1, y1, z1, elev) => fit(V(x0, y0, z0), V(x1, y1, z1), elev);

  // ---------- 2D overlays: chapter card, header, progress, subtitles ----------
  function chapterCard(ctx, ch, idx, lt, lead, isFirst) {
    const out = lead + 0.35;
    if (lt > out) return;
    if (isFirst && lt < lead - 1.6) {
      const a = clamp(lt / 0.6) * clamp((lead - 1.6 - lt) / 0.4);
      withA(ctx, a, () => {
        ctx.fillStyle = 'rgba(30,28,70,0.55)';
        ctx.fillRect(0, 0, W, H);
        const k = backOut(lt / 1.0);
        text(ctx, 'LINE-OF-SIGHT RADIO LINKS', 960, 330, { size: 26, weight: 700, align: 'center', color: P.sky, fam: 'disp', ls: 12 });
        ctx.save();
        ctx.translate(960, 440); ctx.scale(k, k); ctx.translate(-960, -440);
        text(ctx, '視距無線電鏈路', 960, 470, { size: 106, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 8 });
        ctx.restore();
        text(ctx, '頻率與通聯可達率 · Frequency & Link Availability', 960, 560, { size: 34, weight: 800, align: 'center', color: '#fff7ec' });
        text(ctx, 'FSPL · Fresnel zone · Multipath · Foliage · Terrain', 960, 612, { size: 22, weight: 600, align: 'center', color: P.lav, fam: 'mono' });
      });
      return;
    }
    const st = isFirst ? lead - 1.6 : 0;
    const a = clamp((lt - st) / 0.3) * clamp((out - lt) / 0.45);
    withA(ctx, a, () => {
      ctx.fillStyle = 'rgba(30,28,70,0.6)';
      ctx.fillRect(0, 0, W, H);
      const k = backOut((lt - st) / 0.7);
      rr(ctx, 960 - 120, 360, 240, 54, 27);
      ctx.fillStyle = P.butter; ctx.fill();
      text(ctx, `CHAPTER ${String(idx + 1).padStart(2, '0')}`, 960, 397, { size: 24, weight: 700, align: 'center', color: '#5b4212', fam: 'disp', ls: 6 });
      ctx.save();
      ctx.translate(960, 510); ctx.scale(k, k); ctx.translate(-960, -510);
      text(ctx, ch.zh, 960, 540, { size: 90, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 7 });
      ctx.restore();
      text(ctx, ch.en, 960, 604, { size: 32, weight: 700, align: 'center', color: P.lav });
    });
  }
  function header(ctx, ch, idx, total) {
    const g = ctx.createLinearGradient(0, 0, 0, 140);
    g.addColorStop(0, 'rgba(24,22,58,0.62)'); g.addColorStop(1, 'rgba(24,22,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 140);
    const num = String(idx + 1).padStart(2, '0');
    rr(ctx, 40, 32, 78, 58, 18);
    ctx.fillStyle = '#fff4e2'; ctx.fill();
    text(ctx, 'CH', 79, 53, { size: 13, weight: 700, align: 'center', color: '#8a7fb5', fam: 'disp', ls: 2 });
    text(ctx, num, 79, 81, { size: 27, weight: 700, align: 'center', color: '#6f55cf', fam: 'disp' });
    text(ctx, ch.zh, 136, 64, { size: 30, weight: 900, color: '#fff7ec', shadow: 'rgba(0,0,0,.3)', blur: 0, dy: 2 });
    text(ctx, ch.en, 136, 90, { size: 17, weight: 700, color: P.lav });
    text(ctx, '視距無線電鏈路', 1880, 60, { size: 18, weight: 800, align: 'right', color: '#fff7ec' });
    text(ctx, `${num} / ${String(total).padStart(2, '0')}`, 1880, 84, { size: 15, weight: 600, align: 'right', color: P.lav, fam: 'mono' });
  }
  function progress(ctx, t, tl) {
    const x0 = 40, x1 = 1880, y = 1048, h = 8, gap = 6;
    const span = x1 - x0 - gap * (tl.chapters.length - 1);
    let x = x0;
    tl.chapters.forEach((c) => {
      const w = span * (c.end - c.start) / tl.duration;
      rr(ctx, x, y, w, h, 4);
      ctx.fillStyle = 'rgba(255,244,226,0.22)';
      ctx.fill();
      const k = clamp((t - c.start) / (c.end - c.start));
      if (k > 0) {
        rr(ctx, x, y, Math.max(h, w * k), h, 4);
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, P.sky); g.addColorStop(0.5, P.mint); g.addColorStop(1, P.butter);
        ctx.fillStyle = g;
        ctx.fill();
      }
      if (t >= c.start && t < c.end) {
        ctx.fillStyle = '#fff7ec';
        ctx.beginPath(); ctx.arc(x + w * k, y + h / 2, 9, 0, 7); ctx.fill();
        ctx.fillStyle = P.pink;
        ctx.beginPath(); ctx.arc(x + w * k, y + h / 2, 4.5, 0, 7); ctx.fill();
      }
      x += w + gap;
    });
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    text(ctx, `${fmt(Math.min(t, tl.duration))} / ${fmt(tl.duration)}`, 1880, 1034, { size: 15, weight: 600, align: 'right', color: '#e3dcff', fam: 'mono' });
  }
  function activeSentence(t, tl) {
    const ss = tl.sentences;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i], nx = ss[i + 1];
      const until = nx && nx.c === s.c ? nx.start - 0.12 : s.end + 0.55;
      if (t >= s.start - 0.12 && t < until) return s;
    }
    return null;
  }
  function subtitles(ctx, t, tl, mode) {
    if (mode === 'off') return;
    const s = activeSentence(t, tl);
    if (!s) return;
    const a = clamp((t - (s.start - 0.12)) / 0.14);
    const showZh = mode !== 'en', showEn = mode !== 'zh';
    let zs = 40, es = 26;
    const maxW = 1720;
    let zw = showZh ? measure(ctx, s.zh, zs, 800) : 0;
    if (zw > maxW) { zs = Math.floor(zs * maxW / zw); zw = measure(ctx, s.zh, zs, 800); }
    let ew = showEn ? measure(ctx, s.en, es, 600) : 0;
    if (ew > maxW) { es = Math.floor(es * maxW / ew * 10) / 10; ew = measure(ctx, s.en, es, 600); }
    const w = Math.max(zw, ew) + 76;
    const h = (showZh ? zs + 16 : 0) + (showEn ? es + 14 : 0) + 30;
    const bottom = 1014, top = bottom - h;
    withA(ctx, a, () => {
      rr(ctx, 960 - w / 2, top, w, h, 22);
      ctx.fillStyle = 'rgba(28,26,62,0.82)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,226,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      let y = top + 18;
      if (showZh) { y += zs; text(ctx, s.zh, 960, y - 4, { size: zs, weight: 800, align: 'center', color: '#ffffff' }); y += 12; }
      if (showEn) { y += es; text(ctx, s.en, 960, y - 2, { size: es, weight: 600, align: 'center', color: '#d9d2ff' }); }
    });
  }

  // ---------- engine ----------
  function create(canvas, data) {
    const ctx = canvas.getContext('2d');
    const tl = data.timeline;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const world = buildWorld(scene);
    const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 200);
    const built = {};
    const byChapter = tl.chapters.map((c, i) => tl.sentences.filter((s) => s.c === i));
    const proj = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }; };
    function render(t, opts = {}) {
      const mode = opts.subs || 'both';
      let ci = tl.chapters.findIndex((c) => t >= c.start && t < c.end);
      if (ci < 0) ci = t < 0 ? 0 : tl.chapters.length - 1;
      const ch = tl.chapters[ci];
      if (!built[ch.id]) { built[ch.id] = SCENES[ch.id](); scene.add(built[ch.id].root); }
      Object.entries(built).forEach(([id, b]) => { b.root.visible = id === ch.id; });
      const lt = t - ch.start;
      const cues = byChapter[ci];
      const cue = (k) => cues[Math.min(k, cues.length - 1)].start - ch.start;
      const end = (k) => cues[Math.min(k, cues.length - 1)].end - ch.start;
      const queue = [];
      const S = {
        t, lt, cue, end, dur: ch.end - ch.start, proj,
        A: (k, d = 0.6, off = 0) => easeOut((lt - cue(k) - off) / d),
        P: (k) => clamp((lt - cue(k)) / Math.max(0.1, end(k) - cue(k))),
        view(a, b, k = 0) {
          const pos = a.pos.clone().lerp(b ? b.pos : a.pos, k), look = a.look.clone().lerp(b ? b.look : a.look, k);
          S.cam(pos, look);
        },
        cam(pos, look) {
          const sway = V(Math.sin(t * 0.23) * 0.25, Math.sin(t * 0.31) * 0.08, 0);
          camera.position.copy(pos).add(sway);
          camera.lookAt(look);
        },
        lab(obj, off, zh, en, color, a, o = {}) {
          if (a <= 0.003) return;
          queue.push(() => {
            const wp = obj ? obj.localToWorld(off.clone()) : off.clone();
            const p = proj(wp);
            tag(ctx, p.x, p.y + (o.anchor === 'bottom' ? -6 : 8), zh, en, color, a, o);
          });
        },
        head(pos, zh, en, color, a) {
          if (a <= 0.003) return;
          queue.push(() => withA(ctx, a, () => {
            const p = proj(pos);
            text(ctx, zh, p.x, p.y - 40, { size: 40, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.3)', blur: 0, dy: 3 });
            text(ctx, en, p.x, p.y - 8, { size: 19, weight: 800, align: 'center', color: '#f3eeff', shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 2 });
            ctx.fillStyle = color; rr(ctx, p.x - 40, p.y + 2, 80, 6, 3); ctx.fill();
          }));
        },
        draw(fn) { queue.push(() => fn(ctx)); },
      };
      world.userData.update(t);
      built[ch.id].update(S);
      renderer.render(scene, camera);
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(renderer.domElement, 0, 0, W, H);
      queue.forEach((f) => f());
      // soft fade between chapters
      const fin = ci === tl.chapters.length - 1;
      const fade = fin ? 0 : 1 - clamp((ch.end - t) / 0.45);
      if (fade > 0) { ctx.fillStyle = `rgba(30,28,70,${fade * 0.9})`; ctx.fillRect(0, 0, W, H); }
      chapterCard(ctx, ch, ci, lt, ch.lead, ci === 0);
      header(ctx, ch, ci, tl.chapters.length);
      subtitles(ctx, t, tl, mode);
      progress(ctx, t, tl);
    }
    return { render, timeline: tl, W, H, activeSentence: (t) => activeSentence(t, tl), refreshText: refreshCards };
  }

  // Character portrait studio for the page's character cards.
  function studio(w, h) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6ea', '#6a64a8', 0.8));
    const sun = new THREE.DirectionalLight('#fff0dc', 0.7);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    scene.add(sun);
    scene.add(mesh(GX.cyl(3.2, 3.3, 0.3, 24), P.stage, { pos: [0, -0.15, 0] }));
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    const FRAME = {
      radio: [1.0, 1.6, 8.4], bubble: [1.1, 1.2, 6.6], tree: [1.0, 1.5, 8.0], tower: [0.9, 1.6, 8.4], cloud: [1.1, 1.2, 6.8],
    };
    const made = {};
    return {
      render(id, t) {
        if (!made[id]) {
          made[id] = CH[id]();
          const f = FRAME[id];
          made[id].scale.setScalar(f[0]);
          if (id === 'cloud') made[id].position.y = 1.6;
          scene.add(made[id]);
        }
        Object.entries(made).forEach(([k, g]) => { g.visible = k === id; });
        const g = made[id], f = FRAME[id];
        g.rotation.y = Math.sin(t * 0.8) * 0.35;
        g.userData.update(t, id === 'radio' ? { tx: 1 } : { rain: 1, fall: 1.2 });
        cam.position.set(0, f[1] + 1.4, f[2]);
        cam.lookAt(0, f[1], 0);
        renderer.render(scene, cam);
        return renderer.domElement;
      },
    };
  }
  const CHAR_COLOR = { radio: P.mint, bubble: P.sky, tree: P.teal, tower: P.periw, cloud: P.lav };
  window.CASCCS = { create, studio, CHAR_COLOR, W, H, fonts: FONT };
})();
