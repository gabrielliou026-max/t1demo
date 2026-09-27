/* CAS / CCS explainer — Three.js clay / papercraft renderer.
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

  // ---------- characters ----------
  const CH = {};
  CH.phone = function (color = P.pink, trim = P.cream) {
    const g = new THREE.Group();
    const body = mesh(GX.cyl(0.62, 0.86, 0.86, 4), color, { pos: [0, 0.43, 0], rot: [0, Math.PI / 4, 0] });
    g.add(body);
    const blink = face(g, { y: 0.4, z: 0.56, gap: 0.36, r: 0.075 });
    for (const s of [-1, 1]) g.add(mesh(GX.box(0.2, 0.16, 0.34), trim, { pos: [s * 0.42, 0.92, 0] }));
    // keypad buttons on the top slope
    for (let i = 0; i < 3; i++) g.add(mesh(GX.cyl(0.055, 0.055, 0.05, 8), trim, { pos: [-0.16 + i * 0.16, 0.78, 0.36], rot: [0.6, 0, 0] }));
    const hs = new THREE.Group();
    hs.add(mesh(GX.cap(0.13, 1.0, 3, 8), trim, { rot: [0, 0, Math.PI / 2] }));
    for (const s of [-1, 1]) hs.add(mesh(GX.cyl(0.2, 0.15, 0.22, 8), trim, { pos: [s * 0.6, -0.12, 0] }));
    g.add(hs);
    const rings = [0, 1, 2].map((i) => {
      const m = mesh(GX.tor(0.45 + i * 0.22, 0.045, 4, 14, Math.PI * 0.55), P.butter, { shadow: false, unique: true, opacity: 1, emissive: P.butter, ei: 0.35 });
      m.rotation.z = Math.PI * 0.22;
      m.position.set(0, 1.25, 0);
      g.add(m);
      return m;
    });
    g.userData.update = (t, o = {}) => {
      const lift = o.lift || 0, ring = o.ring || 0;
      hs.position.set(-lift * 0.3, 1.08 + lift * 0.75 + ring * Math.abs(Math.sin(t * 30)) * 0.06, 0);
      hs.rotation.z = lift * 0.5;
      rings.forEach((m, i) => {
        const k = (t * 1.5 + i / 3) % 1;
        m.visible = ring > 0.01;
        m.scale.setScalar(0.7 + k * 0.8);
        m.material.opacity = (1 - k) * ring;
      });
      blink(t + (o.seed || 0));
    };
    return g;
  };
  CH.pbx = function () {
    const g = new THREE.Group();
    g.add(mesh(GX.box(1.3, 1.6, 1.0), P.lav, { pos: [0, 0.95, 0] }));
    g.add(mesh(GX.sph(0.65, 12, 6, 0, Math.PI / 2), P.lav, { pos: [0, 1.75, 0], scale: [1, 0.55, 0.77] }));
    g.add(mesh(GX.box(1.0, 0.48, 0.06), '#3d3868', { pos: [0, 1.42, 0.5] }));
    const blink = face(g, { y: 1.42, z: 0.54, gap: 0.36, r: 0.08, eye: '#e9fbff', blush: false });
    for (const s of [-1, 1]) g.add(mesh(GX.sph(0.09, 8, 6), P.blush, { shadow: false, flat: false, pos: [s * 0.52, 1.18, 0.5], scale: [1, 0.55, 0.35] }));
    const leds = [];
    const ledOn = mat(P.mint, { emissive: P.mint, ei: 0.6 }), ledOn2 = mat(P.sky, { emissive: P.sky, ei: 0.6 }), ledOff = mat('#5b5590');
    for (let r = 0; r < 3; r++) {
      g.add(mesh(GX.box(1.0, 0.17, 0.05), P.lilac, { pos: [0, 0.98 - r * 0.25, 0.5] }));
      for (let c = 0; c < 4; c++) {
        const l = mesh(GX.sph(0.045, 6, 5), ledOff, { shadow: false, pos: [-0.3 + c * 0.2, 0.98 - r * 0.25, 0.54] });
        g.add(l);
        leds.push(l);
      }
    }
    for (const s of [-1, 1]) g.add(mesh(GX.cyl(0.18, 0.2, 0.2, 8), P.lilac, { pos: [s * 0.4, 0.1, 0] }));
    g.add(mesh(GX.cyl(0.03, 0.03, 0.5, 6), P.cream, { pos: [0.3, 2.2, 0] }));
    g.add(mesh(GX.sph(0.1, 8, 6), P.butter, { pos: [0.3, 2.47, 0] }));
    g.userData.update = (t) => {
      blink(t + 1.3);
      leds.forEach((l, i) => { l.material = hash(i * 7 + Math.floor(t * 4 + i)) > 0.45 ? (i % 3 ? ledOn : ledOn2) : ledOff; });
    };
    return g;
  };
  CH.co = function () {
    const g = new THREE.Group();
    g.add(mesh(GX.box(2.0, 1.5, 1.4), P.periw, { pos: [0, 0.75, 0] }));
    g.add(mesh(GX.cone(1.52, 0.7, 4), P.peach, { pos: [0, 1.85, 0], rot: [0, Math.PI / 4, 0] }));
    const winOn = mat(P.butter, { emissive: P.butter, ei: 0.35 }), winOff = mat('#7c86d4');
    const wins = [];
    for (const x of [-0.72, -0.42, 0.42, 0.72]) {
      const w = mesh(GX.box(0.22, 0.26, 0.05), winOn, { pos: [x, 0.72, 0.71] });
      g.add(w);
      wins.push(w);
    }
    g.add(mesh(GX.box(0.42, 0.56, 0.05), '#6d6aa8', { pos: [0, 0.28, 0.71] }));
    g.add(mesh(GX.sph(0.035, 6, 5), P.butter, { pos: [0.12, 0.28, 0.75] }));
    const blink = face(g, { y: 1.12, z: 0.72, gap: 0.42, r: 0.085 });
    g.add(mesh(GX.cyl(0.03, 0.14, 1.0, 4), P.cream, { pos: [0.55, 2.55, 0] }));
    const beacon = mesh(GX.sph(0.13, 8, 6), P.coral, { unique: true, emissive: P.coral, ei: 0.8, pos: [0.55, 3.1, 0] });
    g.add(beacon);
    const arcs = [0, 1].map((i) => {
      const m = mesh(GX.tor(0.3 + i * 0.22, 0.035, 4, 12, Math.PI * 0.5), P.cream, { shadow: false, unique: true, opacity: 1 });
      m.position.set(0.55, 3.1, 0);
      m.rotation.z = Math.PI * 0.25;
      g.add(m);
      return m;
    });
    g.userData.update = (t) => {
      blink(t + 0.6);
      beacon.material.emissiveIntensity = (t % 1.4) < 0.7 ? 0.9 : 0.1;
      wins.forEach((w, i) => { w.material = hash(i * 13 + Math.floor(t * 0.6 + i)) > 0.3 ? winOn : winOff; });
      arcs.forEach((m, i) => { const k = (t * 0.9 + i * 0.5) % 1; m.scale.setScalar(0.6 + k); m.material.opacity = 1 - k; });
    };
    return g;
  };
  CH.gateway = function () {
    const g = new THREE.Group();
    g.add(mesh(GX.box(2.4, 0.62, 1.2), P.mint, { pos: [0, 0.4, 0] }));
    g.add(mesh(GX.box(2.2, 0.08, 1.0), '#c6f3dd', { pos: [0, 0.75, 0] }));
    g.add(mesh(GX.box(0.72, 0.42, 0.05), '#2f4b4a', { pos: [-0.72, 0.42, 0.61] }));
    const blink = face(g, { x: -0.72, y: 0.44, z: 0.65, gap: 0.3, r: 0.07, eye: '#e6fff5', blush: false });
    for (const s of [-1, 1]) g.add(mesh(GX.sph(0.08, 8, 6), P.blush, { shadow: false, flat: false, pos: [-0.72 + s * 0.46, 0.28, 0.62], scale: [1, 0.55, 0.35] }));
    const leds = [];
    const on = mat(P.mint, { emissive: '#6dffb8', ei: 0.7 }), off = mat('#3e6d5d'), amber = mat(P.butter, { emissive: P.butter, ei: 0.5 });
    for (let i = 0; i < 4; i++) {
      g.add(mesh(GX.box(0.26, 0.22, 0.05), '#35545a', { pos: [0.05 + i * 0.36, 0.38, 0.61] }));
      const l = mesh(GX.sph(0.04, 6, 5), on, { shadow: false, pos: [0.0 + i * 0.36, 0.58, 0.62] });
      g.add(l, mesh(GX.sph(0.04, 6, 5), amber, { shadow: false, pos: [0.1 + i * 0.36, 0.58, 0.62] }));
      leds.push(l);
    }
    for (const x of [-1, 1]) for (const z of [-0.4, 0.4]) g.add(mesh(GX.cyl(0.1, 0.12, 0.1, 8), '#6ec3a4', { pos: [x, 0.05, z] }));
    g.userData.update = (t) => {
      blink(t + 2.1);
      leds.forEach((l, i) => { l.material = hash(i * 5 + Math.floor(t * 5)) > 0.3 ? on : off; });
    };
    return g;
  };
  CH.thief = function () {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    inner.add(mesh(GX.sph(0.8, 12, 9), '#d9b8ff', { pos: [0, 0.85, 0] }));
    inner.add(mesh(GX.sph(0.64, 12, 6, 0, Math.PI / 2), P.coral, { pos: [0, 1.28, 0] }));
    inner.add(mesh(GX.tor(0.6, 0.1, 6, 16), '#ffd0cb', { pos: [0, 1.3, 0], rot: [Math.PI / 2, 0, 0] }));
    inner.add(mesh(GX.sph(0.16, 8, 6), P.cream, { pos: [0, 1.98, 0] }));
    inner.add(mesh(GX.cyl(0.815, 0.815, 0.3, 16, true), '#2f2a45', { pos: [0, 0.98, 0] }));
    const blink = face(inner, { y: 0.99, z: 0.8, gap: 0.42, r: 0.1, eye: '#ffffff', blush: false });
    for (const s of [-1, 1]) inner.add(mesh(GX.sph(0.11, 8, 6), P.blush, { shadow: false, flat: false, pos: [s * 0.45, 0.66, 0.66], scale: [1, 0.55, 0.35] }));
    inner.add(mesh(GX.tor(0.13, 0.03, 4, 10, Math.PI), P.ink, { pos: [0, 0.62, 0.76], rot: [0, 0, Math.PI] }));
    const bag = new THREE.Group();
    bag.add(mesh(GX.sph(0.46, 10, 8), P.butter, { pos: [0, 0, 0] }));
    bag.add(mesh(GX.cone(0.18, 0.3, 6), '#e8b75c', { pos: [0, 0.5, 0] }));
    bag.position.set(0.95, 0.55, 0.2);
    inner.add(bag);
    for (const s of [-1, 1]) inner.add(mesh(GX.sph(0.2, 8, 6), '#b89ae8', { pos: [s * 0.35, 0.12, 0.2], scale: [1, 0.6, 1.3] }));
    g.userData.bag = bag;
    g.userData.update = (t) => {
      inner.position.y = Math.abs(Math.sin(t * 3)) * 0.12;
      bag.rotation.z = Math.sin(t * 3 + 1) * 0.12;
      blink(t + 0.7);
    };
    return g;
  };
  function envelope(color = P.paper, seal = P.coral) {
    const g = new THREE.Group();
    g.add(mesh(GX.box(0.72, 0.46, 0.08), color));
    for (const s of [-1, 1]) g.add(mesh(GX.box(0.44, 0.035, 0.02), '#d9c7ad', { pos: [s * 0.17, 0.07, 0.045], rot: [0, 0, s * 0.55] }));
    g.add(mesh(GX.sph(0.07, 8, 6), seal, { pos: [0, -0.03, 0.06], scale: [1, 1, 0.5] }));
    return g;
  }
  CH.courier = function () {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    inner.add(mesh(GX.cap(0.34, 0.5, 3, 10), P.sky, { rot: [0, 0, Math.PI / 2] }));
    const blink = face(inner, { y: 0.02, z: 0.33, gap: 0.26, r: 0.065 });
    inner.add(mesh(GX.cyl(0.04, 0.04, 2.0, 6), P.cream, { rot: [0, 0, Math.PI / 2], pos: [0, 0.3, 0] }));
    const rotors = [];
    for (const s of [-1, 1]) {
      inner.add(mesh(GX.cyl(0.05, 0.05, 0.18, 6), P.cream, { pos: [s * 1.0, 0.4, 0] }));
      const r = mesh(GX.box(0.9, 0.03, 0.12), P.lav, { pos: [s * 1.0, 0.5, 0] });
      inner.add(r);
      rotors.push(r);
    }
    inner.add(mesh(GX.cyl(0.015, 0.015, 0.35, 4), P.cream, { pos: [0, -0.5, 0] }));
    const env = envelope();
    env.position.set(0, -0.9, 0);
    inner.add(env);
    g.userData.update = (t) => {
      inner.position.y = Math.sin(t * 4) * 0.08;
      rotors.forEach((r, i) => { r.rotation.y = t * 25 + i; });
      env.rotation.z = Math.sin(t * 3) * 0.1;
      blink(t + 0.4);
    };
    return g;
  };
  CH.slot = function () {
    const g = new THREE.Group();
    const cols = [SYNC, VOICE, VOICE, CAS];
    cols.forEach((c, i) => {
      const cg = car(0.9, c);
      cg.position.x = -1.5 + i * 1.0;
      g.add(cg);
    });
    g.add(mesh(GX.box(4.3, 0.06, 0.9), '#9da0d8', { pos: [0, 0.02, 0] }));
    g.userData.update = () => {};
    return g;
  };
  function car(w, color) {
    const g = new THREE.Group();
    g.add(mesh(GX.box(w, 0.55, 0.78), color, { pos: [0, 0.44, 0] }));
    g.add(mesh(GX.box(w * 0.78, 0.12, 0.6), P.cream, { pos: [0, 0.77, 0] }));
    for (const x of [-w * 0.3, w * 0.3]) g.add(mesh(GX.cyl(0.12, 0.12, 0.86, 8), '#5f5a8f', { pos: [x, 0.14, 0], rot: [Math.PI / 2, 0, 0] }));
    return g;
  }
  // A glass-clay pipe carrying voice beads.
  function pipe(len, color, n = 26) {
    const g = new THREE.Group();
    g.add(mesh(GX.cyl(0.3, 0.3, len, 10, true), color, { opacity: 0.32, shadow: false, rot: [0, 0, Math.PI / 2] }));
    for (const s of [-1, 1]) g.add(mesh(GX.tor(0.3, 0.07, 6, 12), color, { pos: [s * len / 2, 0, 0], rot: [0, Math.PI / 2, 0] }));
    let beads = null;
    if (n) {
      beads = new THREE.InstancedMesh(GX.sph(0.1, 8, 6), mat(deep(color) === '#5a4f7a' ? color : color, { flat: false, emissive: color, ei: 0.25 }), n);
      beads.castShadow = false;
      g.add(beads);
    }
    const m4 = new THREE.Matrix4();
    g.userData.update = (t, phase = 0, on = 1) => {
      if (!beads) return;
      beads.visible = on > 0.01;
      for (let i = 0; i < n; i++) {
        const k = (i / n + t * 0.06) % 1;
        const x = -len / 2 + 0.25 + k * (len - 0.5);
        const y = Math.sin(x * 2.1 - t * 5 + phase) * 0.15 * on;
        m4.makeTranslation(x, y, 0);
        beads.setMatrixAt(i, m4);
      }
      beads.instanceMatrix.needsUpdate = true;
    };
    return g;
  }
  function bit(color = CAS, w = 0.6) {
    const m = mesh(GX.box(w, 0.36, 0.4), color, { unique: true, emissive: color, ei: 0.15 });
    return m;
  }
  function arrow3(len, color, r = 0.06) {
    const g = new THREE.Group();
    const shaft = mesh(GX.cyl(r, r, 1, 8), color, { rot: [0, 0, -Math.PI / 2] });
    const head = mesh(GX.cone(r * 3, r * 6, 10), color, { rot: [0, 0, -Math.PI / 2] });
    g.add(shaft, head);
    g.userData.set = (p) => {
      const L = Math.max(0.001, len * p - r * 5);
      shaft.scale.y = L;
      shaft.position.x = L / 2;
      head.position.x = L + r * 3;
      g.visible = p > 0.01;
    };
    return g;
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
  // clay CRT-ish monitor with a paper-style terminal screen
  function monitor(w, h) {
    const g = new THREE.Group();
    g.add(mesh(GX.box(w + 0.7, h + 0.7, 0.8), P.cream, { pos: [0, h / 2 + 1.35, -0.2] }));
    g.add(mesh(GX.box(w + 0.7, 0.18, 0.6), '#f1dfc4', { pos: [0, 1.0 + 0.05, -0.2] }));
    g.add(mesh(GX.cyl(0.35, 0.45, 0.55, 8), '#f1dfc4', { pos: [0, 0.75, -0.2] }));
    g.add(mesh(GX.box(3.0, 0.22, 1.6), P.cream, { pos: [0, 0.11, -0.2] }));
    for (let i = 0; i < 3; i++) g.add(mesh(GX.sph(0.08, 6, 5), [P.coral, P.butter, P.mint][i], { pos: [w / 2 - 0.2 - i * 0.28, 1.45, 0.22] }));
    const scr = paper(w, h, (c, w2, h2, st) => drawTerm(c, w2, h2, st), { edge: '#3a3760', bg: '#2b2a4a', res: 150, state: { lines: [], typed: 0, title: '' } });
    scr.g.position.set(0, h / 2 + 1.55, 0.25);
    g.add(scr.g);
    g.userData.screen = scr;
    return g;
  }
  function drawTerm(ctx, W2, H2, st) {
    const { lines, typed, cursor, title } = st;
    ctx.fillStyle = '#2b2a4a';
    ctx.fillRect(0, 0, W2, H2);
    ctx.fillStyle = '#3a3862';
    ctx.fillRect(0, 0, W2, 62);
    [P.coral, P.butter, P.mint].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(34 + i * 30, 31, 10, 0, 7); ctx.fill(); });
    text(ctx, title, W2 / 2, 42, { size: 26, weight: 700, align: 'center', color: '#c9c3ef', fam: 'mono' });
    const fs = st.fs || 34, lh = st.lh || 58;
    let left = typed;
    lines.forEach((L, i) => {
      if (left <= 0) return;
      const full = L.p + L.c;
      const n = Math.min(full.length, Math.floor(left));
      left -= full.length + 6;
      const yy = 62 + 56 + i * lh;
      const shown = full.slice(0, n);
      const pS = shown.slice(0, L.p.length), cS = shown.slice(L.p.length);
      text(ctx, pS, 34, yy, { size: fs, weight: 500, color: L.pc || '#9d95d6', fam: 'mono' });
      const pw = measure(ctx, L.p, fs, 500, 'mono');
      const done = n >= full.length;
      text(ctx, cS, 34 + pw, yy, { size: fs, weight: 700, color: L.color || (L.hl && done ? P.butter : '#fff6e8'), fam: 'mono' });
      if (L.box && done) {
        ctx.strokeStyle = P.mint; ctx.lineWidth = 4;
        rr(ctx, 20, yy - fs - 4, measure(ctx, full, fs, 700, 'mono') + 36, fs + 22, 12);
        ctx.stroke();
      }
      if ((n < full.length || i === lines.length - 1) && cursor) {
        ctx.fillStyle = P.mint;
        ctx.fillRect(34 + measure(ctx, shown, fs, 600, 'mono') + 4, yy - fs + 6, fs * 0.55, fs);
      }
    });
  }
  function typedBy(S, lines, from, to, k, frac = 0.85) {
    let total = 0, before = 0;
    for (let i = from; i < to; i++) total += (lines[i].p + lines[i].c).length + 6;
    for (let i = 0; i < from; i++) before += (lines[i].p + lines[i].c).length + 6;
    return Math.floor(before + total * clamp(S.P(k) / frac));
  }
  // Two diorama platforms comparing CAS and CCS (used in the intro and the finale).
  function duo() {
    const g = new THREE.Group();
    g.add(mesh(GX.box(8.6, 0.35, 5.0), '#fff0d2', { pos: [-4.7, 0.18, 0] }));
    g.add(mesh(GX.box(8.6, 0.35, 5.0), '#dff1ff', { pos: [4.7, 0.18, 0] }));
    const lp = [], lb = [], rp = [], env = [];
    for (let i = 0; i < 4; i++) {
      const p = pipe(7.4, VOICE, 18);
      p.position.set(-4.7, 0.68, -1.65 + i * 1.1);
      g.add(p); lp.push(p);
      const b = bit(CAS, 0.62);
      g.add(b); lb.push(b);
    }
    const dp = pipe(7.4, CCS, 0);
    dp.position.set(4.7, 0.68, -1.65);
    g.add(dp);
    for (let i = 0; i < 3; i++) { const e = envelope(); g.add(e); env.push(e); }
    for (let i = 1; i < 4; i++) { const p = pipe(7.4, VOICE, 18); p.position.set(4.7, 0.68, -1.65 + i * 1.1); g.add(p); rp.push(p); }
    g.userData.update = (t, hl = 0) => {
      lp.forEach((p, i) => {
        p.userData.update(t, i);
        const k = (t * 0.16 + i * 0.27) % 1;
        lb[i].position.set(-4.7 - 3.3 + k * 6.6, 1.2 + Math.abs(Math.sin(t * 5 + i)) * 0.08 * hl, p.position.z);
        lb[i].material.emissiveIntensity = 0.15 + hl * 0.35;
      });
      rp.forEach((p, i) => p.userData.update(t, i + 3));
      env.forEach((e, i) => {
        const k = (t * 0.14 + i / 3) % 1;
        e.position.set(4.7 - 3.3 + k * 6.6, 1.25, -1.65);
        e.rotation.y = 0.3;
      });
    };
    return g;
  }
  // Train of timeslot cars; returns { g, cars[], xs[] }.
  function train(n, colorOf, span, x0) {
    const g = new THREE.Group();
    const step = span / n, w = step * 0.86;
    const cars = [], xs = [];
    for (let i = 0; i < n; i++) {
      const c = car(w, colorOf(i));
      const x = x0 + step * (i + 0.5);
      c.position.x = x;
      g.add(c);
      cars.push(c); xs.push(x);
    }
    g.add(mesh(GX.box(span + 0.4, 0.06, 1.0), '#9da0d8', { pos: [x0 + span / 2, 0.02, 0] }));
    return { g, cars, xs, w };
  }

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

  // ---------- scenes ----------
  // build() returns { root, update(S) }. S.lab()/S.draw() queue 2D overlay items.
  const SCENES = {};
  const DUO_BOX = () => box(-9.2, -0.3, -2.6, 9.2, 2.6, 3.2, 0.55);
  const TRAIN_BOX = () => box(-9.9, -0.6, -2.3, 9.9, 4.0, 3.4, 0.62);
  const STAGE_BOX = () => box(-10.2, -0.8, -3.6, 10.2, 5.2, 3.0, 0.5);
  const WINK_BOX = () => box(-9.8, 0.2, -0.3, 9.8, 7.5, 0.4, 0.12);

  SCENES.intro = function () {
    const root = new THREE.Group(), A = new THREE.Group(), B = duo();
    root.add(A, B);
    const phA = CH.phone(P.pink, P.cream), phB = CH.phone(P.mint, P.cream), co = CH.co();
    phA.position.set(-7, 0, 0.6); phA.scale.setScalar(1.7);
    phB.position.set(7, 0, 0.6); phB.scale.setScalar(1.7); phB.rotation.y = -0.15; phA.rotation.y = 0.15;
    co.position.set(0, 0, -0.6); co.scale.setScalar(1.35);
    A.add(phA, phB, co);
    const segs = [[V(-5.4, 0.12, 0.8), V(-1.6, 0.12, 0.2)], [V(1.6, 0.12, 0.2), V(5.4, 0.12, 0.8)]];
    const wires = segs.map(([a, b]) => { const r = rod(a, b, 0.08, P.cream); A.add(r); return r; });
    const pulses = [0, 1, 2, 3].map(() => { const b = bit(CAS, 0.34); A.add(b); return b; });
    const voice = [0, 1].map(() => { const p = new THREE.InstancedMesh(GX.sph(0.12, 8, 6), mat(VOICE, { flat: false, emissive: VOICE, ei: 0.3 }), 16); A.add(p); return p; });
    const evs = [['摘機', 'Off-hook'], ['撥號', 'Dialing'], ['響鈴', 'Ringing'], ['通話', 'Talking'], ['掛機', 'On-hook']];
    const chips = evs.map((e, i) => {
      const c = paper(2.3, 1.05, (ctx, w, h, st) => {
        ctx.fillStyle = st && st.on ? '#fff0c8' : P.paper;
        ctx.fillRect(0, 0, w, h);
        cardTitle(e[0], e[1], st && st.on ? CAS : P.lilac, { zs: 64 })(ctx, w, h);
      }, { edge: P.lav, state: { on: false } });
      c.g.position.set(-7.2 + i * 3.6, 5.3, -0.6);
      A.add(c.g);
      if (i < 4) {
        const ar = arrow3(0.9, P.cream, 0.05);
        ar.position.set(-7.2 + i * 3.6 + 1.35, 5.3, -0.6);
        ar.userData.set(1);
        c.g.userData.arrow = ar;
        A.add(ar);
      }
      return c;
    });
    const m4 = new THREE.Matrix4();
    return {
      root,
      update(S) {
        const { t, A: Ak, P: Pk, cue, end, lt } = S;
        const part = easeInOut((lt - cue(2)) / 0.9);
        setS(A, 1 - easeInOut((lt - cue(2)) / 0.5));
        setS(B, backOut((lt - cue(2) - 0.3) / 0.8));
        S.view(box(-8.8, -1.0, -1.2, 8.8, 6.1, 1.6, 0.2), DUO_BOX(), part);
        const done = lt > end(0);
        const ev = Math.min(4, Math.floor(Pk(0) * 5 + 1e-4));
        const talking = (!done && ev === 3) || (lt > cue(1));
        const liftL = done ? (lt > cue(1) ? 1 : 0) : (ev <= 3 ? 1 : 0);
        const liftR = done ? (lt > cue(1) ? 1 : 0) : (ev === 3 ? 1 : 0);
        const intro = backOut((lt - cue(0) + 0.6) / 0.8);
        [phA, co, phB].forEach((o, i) => { o.visible = intro > 0.01; o.position.y = (1 - clamp((lt - cue(0) + 0.7 - i * 0.12) / 0.5)) * 4; });
        wires.forEach((w) => { w.visible = lt > cue(0) - 0.2; });
        phA.userData.update(t, { lift: liftL, seed: 0 });
        phB.userData.update(t, { lift: liftR, ring: !done && ev === 2 ? 1 : 0, seed: 1.7 });
        co.userData.update(t);
        const chipsOut = 1 - easeInOut((lt - cue(1)) / 0.45);
        chips.forEach((c, i) => {
          const at = cue(0) + (end(0) - cue(0)) * i / 5;
          const a = backOut((lt - at) / 0.45) * chipsOut;
          setS(c.g, a);
          const on = !done && i === ev;
          c.redraw({ on });
          c.g.position.y = 5.3 + (on ? Math.abs(Math.sin(t * 6)) * 0.18 : 0);
          if (c.g.userData.arrow) setS(c.g.userData.arrow, a);
        });
        // pulses on the wire: dialing → left, ringing → right, control ↔ both after cue 1
        const along = (seg, k) => segs[seg][0].clone().lerp(segs[seg][1], k);
        pulses.forEach((p, i) => {
          let vis = false, pos = null;
          if (!done && ev === 1 && i < 2) { vis = true; pos = along(0, (t * 0.9 + i / 2) % 1); }
          if (!done && ev === 2 && i < 2) { vis = true; pos = along(1, (t * 0.9 + i / 2) % 1); }
          if (lt > cue(1)) { vis = true; pos = along(i % 2, i < 2 ? (t * 0.35 + i / 2) % 1 : 1 - ((t * 0.35 + i / 2) % 1)); }
          p.visible = vis;
          if (pos) p.position.copy(pos).add(V(0, 0.3, 0));
        });
        voice.forEach((vm, s) => {
          vm.visible = talking;
          for (let i = 0; i < 16; i++) {
            const k = (i / 16 + t * 0.12 * (s ? -1 : 1) + 10) % 1;
            const p = along(s, k);
            m4.makeTranslation(p.x, 0.75 + Math.sin(k * 18 - t * 6) * 0.22 * Math.sin(k * Math.PI), p.z);
            vm.setMatrixAt(i, m4);
          }
          vm.instanceMatrix.needsUpdate = true;
        });
        if (A.visible) {
          const la = clamp((lt - cue(0) + 0.3) / 0.4);
          S.lab(phA, V(0, -0.1, 0.9), '小話機 A', 'Phone A', P.pink, la);
          S.lab(phB, V(0, -0.1, 0.9), '小話機 B', 'Phone B', P.mint, la);
          S.lab(co, V(0, -0.1, 1.0), '電信局', 'Central Office', P.periw, la);
          const sa = Ak(1, 0.6) * (1 - Ak(2, 0.3));
          S.draw((ctx) => withA(ctx, sa, () => {
            text(ctx, '信令', 960, 262, { size: 96, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(255,215,126,0.9)', blur: 28 });
            text(ctx, 'SIGNALING', 960, 312, { size: 30, weight: 700, align: 'center', color: P.butter, fam: 'disp', ls: 10 });
          }));
          S.lab(null, V(-3.5, 1.4, 0.5), '語音', 'Voice (media)', VOICE, Ak(1, 0.5, 0.4) * (1 - Ak(2, 0.3)), { anchor: 'bottom' });
          S.lab(null, V(3.5, 1.4, 0.5), '控制訊息', 'Control messages', CAS, Ak(1, 0.5, 0.8) * (1 - Ak(2, 0.3)), { anchor: 'bottom' });
        }
        if (B.visible) {
          B.userData.update(t, Ak(3, 0.6));
          const ba = Ak(2, 0.6, 0.6);
          S.head(V(-4.7, 1.3, -2.6), '隨路信令 CAS', 'Channel Associated Signaling', CAS, ba);
          S.head(V(4.7, 1.3, -2.6), '共路信令 CCS', 'Common Channel Signaling', CCS, ba);
          S.lab(null, V(-4.7, 0.3, 2.6), '每一路自帶信令', 'Signaling rides every channel', CAS, Ak(3, 0.5));
          S.lab(null, V(4.7, 0.3, 2.6), '一條專用信令通道', 'One dedicated signaling channel', CCS, Ak(3, 0.5, 0.3));
        }
      },
    };
  };

  SCENES.t1e1 = function () {
    const root = new THREE.Group();
    const T1 = train(25, (i) => (i === 0 ? SYNC : VOICE), 18.8, -9.4);
    T1.g.position.z = -1.6;
    const E1 = train(32, (i) => (i === 0 ? SYNC : i === 16 ? CAS : VOICE), 18.8, -9.4);
    E1.g.position.z = 1.9;
    root.add(T1.g, E1.g);
    const ds0 = paper(4.6, 1.15, (ctx, w, h) => {
      text(ctx, 'DS0 = 8 bits × 8000 /s', 30, 78, { size: 44, weight: 700, color: P.ink, fam: 'mono' });
      text(ctx, '= 64 kbps', 30, 150, { size: 44, weight: 700, color: deep(VOICE), fam: 'mono' });
    }, { edge: VOICE });
    const frm = paper(6.8, 1.15, (ctx) => {
      text(ctx, '1 + 24 × 8 = 193 bits / frame', 30, 78, { size: 44, weight: 700, color: P.ink, fam: 'mono' });
      text(ctx, '193 × 8000 /s = 1.544 Mbps', 30, 150, { size: 44, weight: 700, color: deep(CCS), fam: 'mono' });
    }, { edge: CCS });
    ds0.g.position.set(-4.6, 3.35, -2.2); frm.g.position.set(3.6, 3.35, -2.2);
    ds0.g.rotation.x = frm.g.rotation.x = -0.25;
    const brk = [[1, 15], [17, 31]].map(([a, b]) => {
      const x0 = E1.xs[a] - E1.w / 2, x1 = E1.xs[b] + E1.w / 2;
      const m = mesh(GX.box(x1 - x0, 0.08, 0.14), P.mint, { pos: [(x0 + x1) / 2, 0.06, 2.75] });
      root.add(m);
      return m;
    });
    root.add(ds0.g, frm.g);
    return {
      root,
      update(S) {
        const { t, A, P: Pk, cue, lt } = S;
        S.view(TRAIN_BOX());
        E1.g.visible = lt > cue(3) - 0.1;
        const sweep = (t * 0.8) % 1.4;
        T1.cars.forEach((c, i) => {
          const a = easeOut((lt - cue(0) + 0.4 - i * 0.03) / 0.6);
          c.visible = a > 0.01;
          c.position.x = T1.xs[i] + (1 - a) * 22;
          const hot = Math.abs(i / 25 - sweep) < 0.03 || (i === 0 && A(2, 0.3) > 0 && Math.sin(t * 8) > 0);
          c.position.y = hot ? 0.22 : 0;
        });
        E1.cars.forEach((c, i) => {
          const a = easeOut((lt - cue(3) - i * 0.025) / 0.6);
          c.visible = a > 0.01;
          c.position.x = E1.xs[i] + (1 - a) * 22;
          c.position.y = (i === 0 || i === 16) && lt > cue(4) ? Math.abs(Math.sin(t * 4 + i)) * 0.25 : 0;
        });
        setS(ds0.g, backOut((lt - cue(0) - 1.4) / 0.6));
        setS(frm.g, backOut((lt - cue(1)) / 0.6));
        brk.forEach((b) => setS(b, backOut((lt - cue(5)) / 0.5)));
        const ta = A(0, 0.5, -0.2);
        S.draw((ctx) => withA(ctx, ta, () => {
          const p = S.proj(V(-9.4, 1.3, -2.1));
          text(ctx, 'T1', p.x, p.y - 12, { size: 50, weight: 700, color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.35)', blur: 8, dy: 3 });
          text(ctx, '24 個時槽 · 24 × DS0', p.x + 78, p.y - 18, { size: 26, weight: 800, color: '#fff7ec' });
        }));
        S.draw((ctx) => withA(ctx, A(3, 0.5), () => {
          const p = S.proj(V(-9.4, 1.0, 1.4));
          text(ctx, 'E1', p.x, p.y - 12, { size: 50, weight: 700, color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.35)', blur: 8, dy: 3 });
          text(ctx, '32 個時槽 · 2.048 Mbps', p.x + 78, p.y - 18, { size: 26, weight: 800, color: '#fff7ec' });
        }));
        // car numbers
        S.draw((ctx) => {
          T1.cars.forEach((c, i) => { if (!c.visible) return; const p = S.proj(V(c.position.x, 0.45 + c.position.y, -1.6 + 0.4)); text(ctx, i ? String(i) : 'F', p.x, p.y + 7, { size: 19, weight: 800, align: 'center', color: P.ink, fam: 'disp' }); });
          E1.cars.forEach((c, i) => { if (!c.visible) return; const p = S.proj(V(c.position.x, 0.45 + c.position.y, 1.9 + 0.4)); text(ctx, String(i), p.x, p.y + 7, { size: 17, weight: 800, align: 'center', color: P.ink, fam: 'disp' }); });
        });
        S.lab(null, V(T1.xs[0] - 0.2, 0, -1.1), 'F bit 訊框同步', 'Framing bit', SYNC, A(2, 0.5), { align: 'left' });
        S.lab(null, V(E1.xs[0] + 0.6, 0, 2.5), 'TS0 同步', 'Frame alignment', SYNC, A(4, 0.5));
        S.lab(null, V(E1.xs[16], 0, 2.5), 'TS16 信令', 'Signaling', CAS, A(4, 0.5, 0.4));
        S.lab(null, V((E1.xs[1] + E1.xs[15]) / 2, 0, 2.9), '15 路語音', '15 voice', VOICE, A(5, 0.5), { zs: 20 });
        S.lab(null, V((E1.xs[17] + E1.xs[31]) / 2, 0, 2.9), '15 路語音', '15 voice', VOICE, A(5, 0.5, 0.2), { zs: 20 });
        S.draw((ctx) => withA(ctx, A(5, 0.5, 0.6), () => {
          const p = S.proj(V(E1.xs[16], 0, 3.1));
          text(ctx, '= 30 路語音 · 30 voice channels', p.x, p.y + 100, { size: 30, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.35)', blur: 8, dy: 3 });
        }));
      },
    };
  };

  SCENES.cas = function () {
    const root = new THREE.Group(), A = new THREE.Group(), B = new THREE.Group();
    root.add(A, B);
    const pbx = CH.pbx(), co = CH.co();
    pbx.position.set(-8.4, 0, 0); pbx.scale.setScalar(1.3); pbx.rotation.y = 0.35;
    co.position.set(8.4, 0, 0); co.scale.setScalar(1.15); co.rotation.y = -0.35;
    A.add(pbx, co);
    const zs = [-2.3, -0.8, 0.7, 2.2];
    const pipes = zs.map((z) => { const p = pipe(12.6, VOICE, 34); p.position.set(0, 0.34, z); A.add(p); return p; });
    const bits = zs.map(() => { const b = bit(CAS, 0.8); A.add(b); return b; });
    const onM = mat(CAS, { emissive: CAS, ei: 0.45 }), offM = mat('#9b8d78');
    const types = [['Loop Start', '迴路啟動'], ['Ground Start', '接地啟動'], ['E&M', 'E&M 中繼信令']].map((ty, i) => {
      const c = paper(3.2, 1.1, cardTitle(ty[0], ty[1], i === 2 ? CAS : CCS, { zs: 60 }), { edge: i === 2 ? CAS : CCS });
      c.g.position.set(-4.6 + i * 4.6, 4.4, -3.2);
      A.add(c.g);
      return c;
    });
    const modes = ['Immediate', 'Wink', 'Delay Dial'].map((m, i) => {
      const c = paper(2.3, 0.7, cardTitle(m, '', m === 'Wink' ? CAS : P.lilac, { zs: 56 }), { edge: m === 'Wink' ? CAS : P.lilac });
      c.g.position.set(2.4 + i * 2.5, 3.05, -3.0);
      A.add(c.g);
      return c;
    });
    // ---- B: E&M wink-start timing on paper strips ----
    const X0 = -5.8, X1 = 9.2, ux = (u) => lerp(X0, X1, u);
    const rows = [{ y: 5.4, col: P.lilac }, { y: 3.3, col: CCS }, { y: 1.2, col: VOICE }];
    rows.forEach((r) => B.add(mesh(GX.box(X1 - X0 + 0.8, 1.45, 0.12), '#8d90cc', { pos: [(X0 + X1) / 2, r.y, -0.25] })));
    function wave(y, pts, col) {
      const segs = [];
      for (let i = 0; i < pts.length; i++) {
        const [u0, hi] = pts[i], u1 = i + 1 < pts.length ? pts[i + 1][0] : 1;
        const h = mesh(GX.box(1, 0.16, 0.22), col, {});
        h.userData = { u0, u1, yy: y + (hi ? 0.45 : -0.45) };
        B.add(h);
        segs.push(h);
        if (i + 1 < pts.length) {
          const v = mesh(GX.box(0.16, 1.06, 0.22), col, { pos: [ux(u1), y, 0] });
          v.userData = { at: u1, vert: true };
          B.add(v);
          segs.push(v);
        }
      }
      return (u) => segs.forEach((s) => {
        if (s.userData.vert) { s.visible = u >= s.userData.at; return; }
        const k = clamp((u - s.userData.u0) / (s.userData.u1 - s.userData.u0));
        s.visible = k > 0.001;
        const L = (ux(s.userData.u1) - ux(s.userData.u0)) * k;
        s.scale.x = Math.max(0.001, L);
        s.position.set(ux(s.userData.u0) + L / 2, s.userData.yy, 0);
      });
    }
    const w1 = wave(5.4, [[0, 0], [0.12, 1]], P.lilac);
    const w2 = wave(3.3, [[0, 0], [0.32, 1], [0.4, 0], [0.88, 1]], CCS);
    const digits = [];
    for (let i = 0; i < 6; i++) {
      const d = group(mesh(GX.box(0.55, 0.55, 0.4), VOICE), mesh(GX.cone(0.14, 0.3, 6), P.cream, { pos: [0, 0.45, 0] }));
      d.position.set(ux(0.48 + i * 0.05) + 0.3, 1.2, 0);
      B.add(d);
      digits.push(d);
    }
    return {
      root,
      update(S) {
        const { t, A: Ak, P: Pk, cue, lt } = S;
        const part = easeInOut((lt - cue(4)) / 0.9);
        setS(A, 1 - easeInOut((lt - cue(4)) / 0.5));
        setS(B, backOut((lt - cue(4) - 0.3) / 0.8));
        S.view(STAGE_BOX(), WINK_BOX(), part);
        if (A.visible) {
          const inA = clamp((lt - cue(0) + 0.1) / 0.6);
          [pbx, co].forEach((o) => { o.visible = inA > 0.01; o.position.y = (1 - easeOut(inA)) * 5; o.userData.update(t); });
          pipes.forEach((p, i) => {
            setS(p, backOut((lt - cue(0) + 0.3 - i * 0.12) / 0.6));
            p.userData.update(t, i * 1.3);
            const k = (t * 0.13 + i * 0.29) % 1;
            const off = lt > cue(1) ? (Math.floor(t / 1.6 + i * 0.5) % 2) === 0 : true;
            bits[i].visible = p.visible;
            bits[i].material = off ? onM : offM;
            bits[i].position.set(-5.8 + k * 11.6, 0.92 + (off ? Math.abs(Math.sin(t * 6 + i)) * 0.1 : 0), zs[i]);
          });
          types.forEach((c, i) => setS(c.g, backOut((lt - cue(2) - i * 0.4) / 0.5)));
          modes.forEach((c, i) => setS(c.g, backOut((lt - cue(3) - 0.4 - i * 0.35) / 0.5)));
          if (Ak(3, 0.3) > 0) types[2].g.position.y = 4.4 + 0.25 * backOut((lt - cue(3)) / 0.5);
          S.lab(pbx, V(0, -0.05, 0.9), '阿交', 'PBX', P.lav, inA);
          S.lab(co, V(0, -0.05, 1.0), '電信局', 'Central Office', P.periw, inA);
          S.lab(null, V(0, 0.9, -2.3), '每一路語音通道，帶著自己的狀態位元', 'Each voice channel carries its own state bits', CAS, Ak(0, 0.5, 0.6) * (1 - Ak(2, 0.3)), { anchor: 'bottom' });
          S.lab(null, V(-5.6, 0.1, 3.0), '■ 亮：摘機', 'Bright = off-hook', CAS, Ak(1, 0.5));
          S.lab(null, V(5.6, 0.1, 3.0), '■ 暗：掛機', 'Dim = on-hook', '#b9a98f', Ak(1, 0.5, 0.2));
          S.draw((ctx) => bits.forEach((b) => {
            if (!b.visible) return;
            const p = S.proj(b.position.clone().add(V(0, 0.02, 0.21)));
            text(ctx, 'ABCD', p.x, p.y + 6, { size: 15, weight: 900, align: 'center', color: '#5b4212', fam: 'disp' });
          }));
        }
        if (B.visible) {
          const u = lt < cue(5) ? lerp(0, 0.3, Pk(4)) : lt < cue(6) ? lerp(0.3, 0.8, Pk(5)) : lerp(0.8, 1, Pk(6));
          w1(u); w2(u);
          digits.forEach((d, i) => setS(d, backOut((u - (0.48 + i * 0.05)) / 0.03)));
          S.draw((ctx) => {
            const p = S.proj(V(1.7, 7.0, 0));
            text(ctx, 'E&M Wink Start 時序', p.x, p.y, { size: 38, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.3)', blur: 8, dy: 3 });
            digits.forEach((d, i) => { if (!d.visible) return; const q = S.proj(d.position.clone().add(V(0, 0, 0.21))); text(ctx, '5551234'[i], q.x, q.y + 8, { size: 22, weight: 800, align: 'center', color: '#1f5a44', fam: 'mono' }); });
          });
          [['發起端 PBX', 'Originating', 5.4, P.lilac], ['對端 CO', 'Terminating', 3.3, CCS], ['號碼', 'Digits (in-band)', 1.2, VOICE]].forEach(([zh, en, y, c]) =>
            S.lab(null, V(-6.3, y, 0), zh, en, c, 1, { anchor: 'middle', align: 'right' }));
          S.lab(null, V(ux(0.12), 6.1, 0.2), '① 佔線', 'Seize (off-hook)', P.lilac, clamp((u - 0.12) / 0.05), { anchor: 'bottom' });
          S.lab(null, V(ux(0.36), 4.0, 0.2), '② Wink', 'Brief off-hook pulse', CCS, clamp((u - 0.4) / 0.05), { anchor: 'bottom' });
          S.lab(null, V(ux(0.88), 4.0, 0.2), '④ 應答', 'Answer', CCS, clamp((u - 0.9) / 0.05), { anchor: 'bottom' });
          S.lab(null, V(ux(0.63), 0.3, 0.4), '③ 送號 DTMF / MF', 'Digits sent as in-band tones', VOICE, Ak(6, 0.5));
        }
      },
    };
  };

  SCENES.robbed = function () {
    const root = new THREE.Group();
    const sf = [], esf = [];
    const g1 = mat('#b7ecd4'), g0 = mat('#7fcfb0'), rb = mat(CAS, { emissive: CAS, ei: 0.4 });
    for (let r = 0; r < 12; r++) for (let b = 0; b < 8; b++) {
      const m = mesh(GX.box(0.38, 0.38, 0.38), g1, { pos: [-8.0 + b * 0.46, 6.3 - r * 0.47, 0] });
      m.userData = { r, b };
      root.add(m); sf.push(m);
    }
    for (let r = 0; r < 24; r++) for (let b = 0; b < 8; b++) {
      const m = mesh(GX.box(0.2, 0.2, 0.2), g1, { pos: [4.5 + b * 0.25, 6.35 - r * 0.235, 0] });
      m.userData = { r, b };
      root.add(m); esf.push(m);
    }
    const sfHl = [5, 11].map((r) => { const m = mesh(GX.box(3.9, 0.46, 0.08), CAS, { opacity: 0.35, shadow: false, pos: [-8.0 + 3.5 * 0.46, 6.3 - r * 0.47, -0.3] }); root.add(m); return m; });
    const thief = CH.thief();
    thief.position.set(-0.4, 0, 1.0); thief.scale.setScalar(1.6);
    root.add(thief);
    const fly = [0, 1].map(() => { const m = mesh(GX.box(0.38, 0.38, 0.38), CAS, { emissive: CAS, ei: 0.4 }); root.add(m); return m; });
    const bar = new THREE.Group();
    for (let i = 0; i < 8; i++) bar.add(mesh(GX.box(0.72, 0.5, 0.6), i < 7 ? VOICE : CAS, { pos: [-2.9 + i * 0.8, 0.3, 0] }));
    bar.position.set(5.4, 0, 1.6);
    root.add(bar);
    return {
      root,
      update(S) {
        const { t, A, cue, lt } = S;
        S.view(box(-9.2, -0.6, 0, 8.8, 7.4, 1.8, 0.12));
        const a0 = clamp((lt - cue(0) + 0.3) / 0.6);
        sf.forEach((m) => {
          const { r, b } = m.userData;
          const sig = (r === 5 || r === 11) && b === 7;
          const robbed = sig && A(2, 0.4, r === 11 ? 0.5 : 0) > 0.5;
          m.material = robbed ? rb : (hash(r * 8 + b + Math.floor(t * 1.5)) > 0.5 ? g1 : g0);
          setS(m, backOut((a0 * 1.6) - r * 0.05));
        });
        sfHl.forEach((m, i) => setS(m, easeOut(A(1, 0.4, i * 0.5))));
        esf.forEach((m) => {
          const { r, b } = m.userData;
          const on = (r + 1) % 6 === 0 && b === 7 && A(3, 0.4, 0.5 + ((r + 1) / 6) * 0.35) > 0.5;
          m.material = on ? rb : (hash(r * 9 + b + Math.floor(t * 1.5)) > 0.5 ? g1 : g0);
          setS(m, backOut(A(3, 0.5, r * 0.02)));
        });
        thief.visible = lt > cue(0) - 0.2;
        thief.position.y = (1 - easeOut(A(0, 0.6, 0.2))) * 6;
        thief.userData.update(t);
        // the two LSBs fly into the bag
        fly.forEach((f, i) => {
          const k = easeInOut(A(2, 0.9, 0.2 + i * 0.5));
          const from = V(-8.0 + 7 * 0.46, 6.3 - (i ? 11 : 5) * 0.47, 0);
          const bagW = thief.userData.bag.getWorldPosition(V(0, 0, 0));
          f.visible = k > 0.01 && k < 0.99;
          f.position.copy(from.clone().lerp(bagW, k)).add(V(0, Math.sin(k * Math.PI) * 2.2, 0));
          f.rotation.set(k * 6, k * 4, 0);
        });
        setS(bar, backOut(A(5, 0.6)));
        const drop = easeInOut(A(5, 0.8, 0.8));
        bar.children[7].position.set(-2.9 + 7 * 0.8 + drop * 0.6, 0.3 - drop * 0.2, drop * 0.6);
        bar.children[7].rotation.z = -drop * 0.8;
        S.draw((ctx) => {
          withA(ctx, a0, () => {
            const p = S.proj(V(-8.3, 6.95, 0));
            text(ctx, 'SF 超訊框', p.x, p.y, { size: 30, weight: 900, color: '#fff7ec' });
            text(ctx, 'Superframe · 12 frames', p.x, p.y + 26, { size: 17, weight: 700, color: P.mint });
            for (let r = 0; r < 12; r++) { const q = S.proj(V(-8.45, 6.3 - r * 0.47, 0)); text(ctx, 'F' + (r + 1), q.x, q.y + 6, { size: 16, weight: 800, align: 'right', color: (r === 5 || r === 11) && A(1, 0.3) > 0 ? P.butter : '#d9d6ff', fam: 'mono' }); }
            const l = S.proj(V(-8.0 + 7 * 0.46, 6.62, 0));
            text(ctx, 'LSB', l.x, l.y - 4, { size: 15, weight: 900, align: 'center', color: P.butter, fam: 'mono' });
          });
          [[5, 'A'], [11, 'B']].forEach(([r, L]) => withA(ctx, A(2, 0.4, r === 11 ? 0.5 : 0), () => {
            const q = S.proj(V(-8.0 + 7 * 0.46, 6.3 - r * 0.47, 0.2));
            text(ctx, L, q.x, q.y + 8, { size: 22, weight: 900, align: 'center', color: '#6b4a0e', fam: 'disp' });
          }));
          withA(ctx, A(3, 0.5), () => {
            const p = S.proj(V(4.3, 6.95, 0));
            text(ctx, 'ESF 延伸超訊框', p.x, p.y, { size: 30, weight: 900, color: '#fff7ec' });
            text(ctx, 'Extended superframe · 24 frames', p.x, p.y + 26, { size: 17, weight: 700, color: P.mint });
            ['A', 'B', 'C', 'D'].forEach((L, i) => withA(ctx, A(3, 0.4, 0.5 + (i + 1) * 0.35), () => {
              const q = S.proj(V(6.55, 6.35 - (6 * (i + 1) - 1) * 0.235, 0));
              text(ctx, `← ${L}  (F${6 * (i + 1)})`, q.x, q.y + 7, { size: 20, weight: 900, color: P.butter, fam: 'mono' });
            }));
          });
          withA(ctx, A(4, 0.6), () => {
            const p = S.proj(V(-0.4, 4.6, 1.0));
            text(ctx, '位元竊取', p.x, p.y, { size: 52, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(255,150,180,.9)', blur: 22 });
            text(ctx, 'Robbed-Bit Signaling', p.x, p.y + 40, { size: 26, weight: 700, align: 'center', color: P.pink, fam: 'disp' });
          });
          withA(ctx, A(5, 0.5, 0.4), () => {
            const q = S.proj(V(5.4 - 2.9, 0.9, 1.6));
            text(ctx, drop > 0.5 ? '資料 Data：64 → 56 kbps' : '資料 Data：64 kbps', q.x - 20, q.y - 10, { size: 26, weight: 900, color: '#fff7ec', shadow: 'rgba(0,0,0,.35)', blur: 6, dy: 2 });
          });
        });
        S.lab(thief, V(0, -0.05, 0.9), '位元小偷', 'Bit Thief', P.pink, a0);
        S.lab(null, V(-6.2, 0.0, 1.4), '語音：幾乎聽不出差別', 'Voice: barely noticeable', VOICE, A(5, 0.5));
      },
    };
  };

  SCENES.e1cas = function () {
    const root = new THREE.Group(), A = new THREE.Group(), B = new THREE.Group();
    root.add(A, B);
    const frame = [];
    for (let i = 0; i < 32; i++) {
      const m = mesh(GX.box(0.2, 0.28, 0.2), i === 0 ? SYNC : i === 16 ? CAS : VOICE, { pos: [-9.0 + i * 0.25, 7.05, 0] });
      A.add(m); frame.push(m);
    }
    const wall = [];
    for (let r = 0; r < 16; r++) for (let b = 0; b < 8; b++) {
      const m = mesh(GX.box(0.32, 0.3, 0.3), r === 0 ? SYNC : CAS, { pos: [-7.4 + b * 0.38 + (b > 3 ? 0.35 : 0), 6.25 - r * 0.37, 0] });
      m.userData = { r, b };
      A.add(m); wall.push(m);
    }
    const drop = arrow3(0.55, CAS, 0.05);
    drop.position.set(-9.0 + 16 * 0.25, 6.85, 0.2);
    drop.rotation.z = -Math.PI / 2;
    A.add(drop);
    const infos = [
      ['TS16 = 信令時槽', 'Timeslot 16 carries the signaling bits', CAS],
      ['16 個訊框 = 1 個多訊框', 'F0 carries the multiframe alignment (MFAS)', SYNC],
      ['15 frames × 2 = 30 路', 'Each frame: ABCD for two channels', CAS],
      ['位置固定對應通道 → 仍是 CAS', 'Each bit group maps to one fixed channel', VOICE],
    ].map(([zh, en, c], i) => {
      const card = paper(7.4, 1.2, (ctx, w, h) => {
        text(ctx, zh, 36, 96, { size: 62, weight: 900, color: i === 2 ? deep(c) : P.ink, fam: i === 2 ? 'disp' : 'sans' });
        text(ctx, en, 36, 166, { size: 34, weight: 700, color: deep(c) });
      }, { edge: c });
      card.g.position.set(4.6, 5.9 - i * 1.5, 0);
      A.add(card.g);
      return card;
    });
    // ---- B: R2 ----
    const pbx = CH.pbx(), co = CH.co();
    pbx.position.set(-8.4, 0, 0); pbx.scale.setScalar(1.3); pbx.rotation.y = 0.35;
    co.position.set(8.4, 0, 0); co.scale.setScalar(1.15); co.rotation.y = -0.35;
    const line = pipe(12.6, CAS, 0), reg = pipe(12.6, VOICE, 0);
    line.position.set(0, 0.34, -1.4); reg.position.set(0, 0.34, 1.6);
    const lbits = [0, 1, 2].map(() => { const b = bit(CAS, 0.8); B.add(b); return b; });
    const tone = mesh(GX.cap(0.3, 0.7, 3, 10), VOICE, { unique: true, emissive: VOICE, ei: 0.4, rot: [0, 0, Math.PI / 2] });
    const fwd = arrow3(3.6, VOICE, 0.07), bwd = arrow3(3.6, CCS, 0.07);
    fwd.position.set(-3.4, 0.2, 3.1); bwd.position.set(3.4, 0.2, 3.5); bwd.rotation.y = Math.PI;
    fwd.userData.set(1); bwd.userData.set(1);
    B.add(pbx, co, line, reg, tone, fwd, bwd);
    return {
      root,
      update(S) {
        const { t, A: Ak, cue, lt } = S;
        const part = easeInOut((lt - cue(4)) / 0.9);
        setS(A, 1 - easeInOut((lt - cue(4)) / 0.5));
        setS(B, backOut((lt - cue(4) - 0.3) / 0.8));
        S.view(box(-9.6, 0.3, -0.2, 8.6, 7.5, 0.3, 0.1), box(-10.2, -0.8, -2.2, 10.2, 5.6, 4.4, 0.45), part);
        if (A.visible) {
          frame.forEach((m, i) => { setS(m, backOut(Ak(0, 0.4, -0.3 + i * 0.015))); m.position.y = 7.05 + (i === 16 ? Math.abs(Math.sin(t * 4)) * 0.2 : 0); });
          setS(drop, backOut(Ak(0, 0.4, 0.4)));
          drop.userData.set(1);
          wall.forEach((m) => {
            const { r } = m.userData;
            setS(m, r === 0 ? backOut(Ak(1, 0.4)) : backOut((lt - cue(1) - 0.6 - r * 0.07) / 0.3));
          });
          infos.forEach((c, i) => setS(c.g, backOut(Ak(i, 0.5, i === 0 ? 0.2 : 0))));
          S.draw((ctx) => {
            withA(ctx, Ak(0, 0.4, 0.5), () => {
              const p = S.proj(V(-9.2, 7.05, 0));
              text(ctx, 'E1', p.x - 16, p.y + 8, { size: 22, weight: 800, align: 'right', color: '#fff7ec', fam: 'disp' });
            });
            wall.forEach((m) => {
              if (!m.visible || m.scale.x < 0.5) return;
              const { r, b } = m.userData;
              const q = S.proj(m.position.clone().add(V(0, 0, 0.16)));
              const L = r === 0 ? (b < 4 ? '0' : 'xyxx'[b - 4]) : 'ABCD'[b % 4];
              text(ctx, L, q.x, q.y + 6, { size: 15, weight: 900, align: 'center', color: r === 0 ? '#4b3a8f' : '#6b4a0e', fam: 'mono' });
            });
            for (let r = 0; r < 16; r++) {
              const m = wall[r * 8];
              if (!m.visible) continue;
              const q = S.proj(V(-7.75, 6.25 - r * 0.37, 0));
              text(ctx, 'F' + r, q.x, q.y + 6, { size: 15, weight: 800, align: 'right', color: r === 0 ? P.lav : '#e3e0ff', fam: 'mono' });
              const q2 = S.proj(V(-4.05, 6.25 - r * 0.37, 0));
              withA(ctx, r === 0 ? 1 : Math.max(0.35, Ak(3, 0.4, r * 0.04)), () =>
                text(ctx, r === 0 ? 'MFAS' : `TS${r} · TS${r + 16}`, q2.x, q2.y + 6, { size: 15, weight: 800, color: r === 0 ? P.lav : '#fff7ec', fam: 'mono' }));
            }
          });
        }
        if (B.visible) {
          pbx.userData.update(t); co.userData.update(t);
          lbits.forEach((b, i) => {
            const k = (t * 0.2 + i / 3) % 1, dir = i % 2 === 0;
            b.position.set(dir ? -5.8 + k * 11.6 : 5.8 - k * 11.6, 0.92, -1.4);
          });
          const rA = Ak(5, 0.5);
          setS(reg, backOut(rA)); setS(fwd, backOut(rA)); setS(bwd, backOut(Ak(5, 0.5, 0.2)));
          const cyc = 2.4, k = (lt % cyc) / cyc, fw = k < 0.5, kk = fw ? k / 0.5 : (k - 0.5) / 0.5;
          tone.visible = rA > 0.02;
          tone.position.set(fw ? lerp(-5.4, 5.4, easeInOut(kk)) : lerp(5.4, -5.4, easeInOut(kk)), 0.34, 1.6);
          tone.material.color.set(fw ? VOICE : CCS);
          tone.material.emissive.set(fw ? VOICE : CCS);
          S.lab(pbx, V(0, -0.05, 0.9), '阿交', 'PBX', P.lav, 1);
          S.lab(co, V(0, -0.05, 1.0), '電信局', 'Central Office', P.periw, 1);
          S.lab(null, V(3.2, 1.0, -1.4), '線路信令：TS16 的 ABCD 位元', 'Line signaling: ABCD bits in TS16', CAS, Ak(4, 0.5, 0.4), { anchor: 'bottom' });
          S.lab(null, V(0, 0.1, 4.0), '記錄器信令：多頻互控音，一直送到對方回應', 'Register signaling: compelled MF tones, in-band', VOICE, rA);
          S.draw((ctx) => {
            const p = S.proj(V(0, 5.2, -1.4));
            text(ctx, 'MFC-R2', p.x, p.y, { size: 48, weight: 700, align: 'center', color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.3)', blur: 8, dy: 3 });
            withA(ctx, rA, () => {
              const q = S.proj(tone.position.clone().add(V(0, 0.55, 0)));
              text(ctx, fw ? 'Group I →' : '← Group A', q.x, q.y, { size: 18, weight: 900, align: 'center', color: '#fff7ec', fam: 'mono' });
              const f = S.proj(V(-1.6, 0.2, 3.1)), b = S.proj(V(1.6, 0.2, 3.5));
              text(ctx, '前向 Forward', f.x, f.y - 14, { size: 18, weight: 800, align: 'center', color: '#e6fff4' });
              text(ctx, '後向 Backward', b.x, b.y + 30, { size: 18, weight: 800, align: 'center', color: '#e4f4ff' });
            });
          });
        }
      },
    };
  };

  SCENES.ccs = function () {
    const root = new THREE.Group(), A = new THREE.Group(), B = new THREE.Group(), C = new THREE.Group();
    root.add(A, B, C);
    const pbx = CH.pbx(), co = CH.co();
    pbx.position.set(-8.4, 0, 0); pbx.scale.setScalar(1.3); pbx.rotation.y = 0.35;
    co.position.set(8.4, 0, 0); co.scale.setScalar(1.15); co.rotation.y = -0.35;
    const dp = pipe(12.6, CCS, 0);
    dp.position.set(0, 0.34, -2.6);
    const bps = [-1.3, -0.25, 0.8, 1.85, 2.9].map((z) => { const p = pipe(12.6, VOICE, 30); p.position.set(0, 0.34, z); A.add(p); return p; });
    const courier = CH.courier();
    courier.scale.setScalar(1.25);
    A.add(pbx, co, dp, courier);
    const setup = paper(6.6, 3.0, (ctx, w, h) => {
      text(ctx, 'Q.931  SETUP', 40, 96, { size: 64, weight: 700, color: deep(CCS), fam: 'mono' });
      [['Called Party', '2100', '被叫號碼'], ['Calling Party', '5550142', '來電號碼'], ['Channel ID', 'B5', '使用通道'], ['Bearer', 'Speech', '承載類型']].forEach((r, i) => {
        const y = 196 + i * 78;
        text(ctx, r[0], 40, y, { size: 40, weight: 700, color: '#7a7196', fam: 'mono' });
        text(ctx, r[1], 470, y, { size: 42, weight: 800, color: P.ink, fam: 'mono' });
        text(ctx, r[2], w - 40, y, { size: 36, weight: 800, align: 'right', color: deep(P.lilac) });
      });
    }, { edge: CCS });
    setup.g.position.set(0, 3.0, 2.2);
    setup.g.rotation.x = -0.28;
    A.add(setup.g);
    // B: PRI trains
    const T1 = train(24, (i) => (i === 23 ? CCS : VOICE), 18.8, -9.4);
    T1.g.position.z = -1.6;
    const E1 = train(32, (i) => (i === 0 ? SYNC : i === 16 ? CCS : VOICE), 18.8, -9.4);
    E1.g.position.z = 1.9;
    B.add(T1.g, E1.g);
    // C: SS7
    const coA = CH.co(), coB = CH.co();
    coA.position.set(-6.2, 0, 0.4); coB.position.set(6.2, 0, 0.4);
    coA.scale.setScalar(1.25); coB.scale.setScalar(1.25); coA.rotation.y = 0.3; coB.rotation.y = -0.3;
    const stps = [V(-2.4, 5.0, -2.2), V(2.4, 5.0, -2.2)].map((p) => {
      const g = group(mesh(GX.ico(0.75, 0), CCS, { emissive: CCS, ei: 0.2 }), mesh(GX.cyl(0.1, 0.16, 5.0, 6), P.cream, { pos: [0, -2.6, 0] }));
      g.position.copy(p);
      C.add(g);
      return p;
    });
    const tops = [V(-6.2, 3.6, 0.4), V(6.2, 3.6, 0.4)];
    const links = [[tops[0], stps[0]], [tops[0], stps[1]], [tops[1], stps[0]], [tops[1], stps[1]], [stps[0], stps[1]]];
    links.forEach(([a, b]) => {
      for (let i = 0; i < 9; i++) {
        const k0 = i / 9, k1 = (i + 0.55) / 9;
        C.add(rod(a.clone().lerp(b, k0), a.clone().lerp(b, k1), 0.05, CCS, { shadow: false }));
      }
    });
    const ss7env = links.slice(0, 4).map(() => { const e = envelope(); e.scale.setScalar(0.7); C.add(e); return e; });
    const trunk = pipe(9.0, VOICE, 24);
    trunk.position.set(0, 0.34, 1.6);
    C.add(coA, coB, trunk);
    return {
      root,
      update(S) {
        const { t, A: Ak, cue, lt } = S;
        const pB = easeInOut((lt - cue(3)) / 0.9), pC = easeInOut((lt - cue(5)) / 0.9);
        setS(A, 1 - easeInOut((lt - cue(3)) / 0.5));
        setS(B, backOut((lt - cue(3) - 0.3) / 0.8) * (1 - easeInOut((lt - cue(5)) / 0.5)));
        setS(C, backOut((lt - cue(5) - 0.3) / 0.8));
        const camA = box(-10.2, -0.8, -3.2, 10.2, 4.4, 3.8, 0.5), camB = TRAIN_BOX(), camC = box(-8.6, -0.8, -2.4, 8.6, 7.4, 4.0, 0.25);
        if (pB < 1) S.view(camA, camB, pB); else S.view(camB, camC, pC);
        if (A.visible) {
          const inA = clamp((lt - cue(0) + 0.1) / 0.6);
          pbx.position.y = co.position.y = (1 - easeOut(inA)) * 5;
          pbx.visible = co.visible = inA > 0.01;
          pbx.userData.update(t); co.userData.update(t);
          bps.forEach((p, i) => { setS(p, backOut((lt - cue(0) + 0.3 - i * 0.1) / 0.6)); p.userData.update(t, i * 1.7); });
          setS(dp, backOut((lt - cue(0) + 0.5) / 0.6));
          const kx = (Math.sin(t * 0.7) + 1) / 2;
          courier.position.set(lerp(-4.2, 4.2, kx), 2.4, -2.6);
          courier.rotation.y = Math.cos(t * 0.7) > 0 ? -0.25 : 0.25;
          courier.userData.update(t);
          courier.visible = lt > cue(0) - 0.6;
          setS(setup.g, backOut(Ak(1, 0.6)) * (1 - easeInOut(Ak(2, 0.5, 0.8))));
          const msgs = ['SETUP', 'ALERTING', 'CONNECT', 'DISCONNECT'];
          S.draw((ctx) => {
            if (!courier.visible) return;
            const q = S.proj(courier.position.clone().add(V(0, -1.9, 0)));
            text(ctx, msgs[Math.floor(t / 2.2) % 4], q.x, q.y, { size: 17, weight: 900, align: 'center', color: '#fff7ec', fam: 'mono' });
          });
          S.lab(courier, V(0, 1.0, 0), 'D 通道信差', 'D-Channel Courier', CCS, Ak(0, 0.5, 0.8), { anchor: 'bottom', zs: 18, es: 13 });
          S.lab(pbx, V(0, -0.05, 0.9), '阿交', 'PBX', P.lav, inA);
          S.lab(co, V(0, -0.05, 1.0), '電信局', 'Central Office', P.periw, inA);
          const dl = Ak(2, 0.5);
          const cardOn = setup.g.visible ? clamp(setup.g.scale.x) : 0;
          S.lab(null, V(-6.3, 0.9, -2.6), dl > 0.5 ? 'D 通道（ISDN PRI）' : '專用信令通道', dl > 0.5 ? 'D channel' : 'Dedicated signaling channel', CCS, Ak(0, 0.5, 0.4) * (1 - cardOn), { anchor: 'bottom', align: 'left' });
          S.lab(null, V(0, 0.1, 3.4), 'B 通道：純語音', 'B channels: bearer (voice only)', VOICE, Ak(0, 0.5, 1.2) * (1 - Ak(1, 0.3) + Ak(2, 0.5, 1.2)));
        }
        if (B.visible) {
          T1.cars.forEach((c, i) => { c.position.y = i === 23 ? Math.abs(Math.sin(t * 4)) * 0.25 : 0; c.visible = Ak(3, 0.5, i * 0.02) > 0.01; });
          E1.cars.forEach((c, i) => { c.position.y = i === 16 ? Math.abs(Math.sin(t * 4)) * 0.25 : 0; c.visible = Ak(4, 0.5, i * 0.015) > 0.01; });
          S.draw((ctx) => {
            const lab = (cars, z, name, f) => cars.forEach((c, i) => { if (!c.visible) return; const q = S.proj(V(c.position.x, 0.45 + c.position.y, z + 0.4)); text(ctx, f(i), q.x, q.y + 7, { size: 18, weight: 900, align: 'center', color: P.ink, fam: 'disp' }); });
            lab(T1.cars, -1.6, 'T1', (i) => (i === 23 ? 'D' : 'B'));
            lab(E1.cars, 1.9, 'E1', (i) => (i === 0 ? 'S' : i === 16 ? 'D' : 'B'));
            withA(ctx, Ak(3, 0.5), () => {
              const p = S.proj(V(-9.4, 1.0, -2.1));
              text(ctx, 'T1 PRI = 23B + D', p.x, p.y - 14, { size: 38, weight: 700, color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.35)', blur: 8, dy: 3 });
            });
            withA(ctx, Ak(4, 0.5), () => {
              const p = S.proj(V(-9.4, 1.0, 1.4));
              text(ctx, 'E1 PRI = 30B + D', p.x, p.y - 14, { size: 38, weight: 700, color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.35)', blur: 8, dy: 3 });
            });
          });
          S.lab(null, V(T1.xs[23], 0, -1.1), 'D = 時槽 24', 'Timeslot 24', CCS, Ak(3, 0.5, 0.6), { align: 'right' });
          S.lab(null, V(E1.xs[16], 0, 2.4), 'D = 時槽 16', 'Timeslot 16', CCS, Ak(4, 0.5, 0.6));
          S.lab(null, V(E1.xs[0], 0, 2.4), 'TS0 同步', 'Alignment', SYNC, Ak(4, 0.5, 0.8), { align: 'left' });
        }
        if (C.visible) {
          coA.userData.update(t); coB.userData.update(t + 0.5);
          trunk.userData.update(t, 0);
          ss7env.forEach((e, i) => {
            const [a, b] = links[i];
            const kk = (t * 0.3 + i * 0.25) % 1;
            e.position.copy(i % 2 ? b.clone().lerp(a, kk) : a.clone().lerp(b, kk)).add(V(0, 0.3, 0));
          });
          S.draw((ctx) => {
            const p = S.proj(V(0, 7.0, -2.2));
            text(ctx, 'SS7 · Signaling System No. 7', p.x, p.y, { size: 38, weight: 700, align: 'center', color: '#fff7ec', fam: 'disp', shadow: 'rgba(0,0,0,.3)', blur: 8, dy: 3 });
            stps.forEach((s) => { const q = S.proj(s.clone().add(V(0, 0, 0.8))); text(ctx, 'STP', q.x, q.y + 7, { size: 20, weight: 800, align: 'center', color: '#1f4e78', fam: 'disp' }); });
          });
          S.lab(null, V(0, 5.9, -2.2), 'SS7 信令網路', 'Separate signaling network', CCS, 1, { anchor: 'bottom', zs: 20 });
          S.lab(coA, V(0, -0.05, 1.0), '電信局 A', 'Carrier switch', P.periw, 1, { zs: 20 });
          S.lab(coB, V(0, -0.05, 1.0), '電信局 B', 'Carrier switch', P.periw, 1, { zs: 20 });
          S.lab(null, V(0, 0.9, 1.6), '話路中繼', 'Voice trunks', VOICE, 1, { anchor: 'bottom', zs: 20 });
          S.lab(null, V(-3.2, 0, 3.6), 'D 通道 / SS7 ≈ SIP', 'Signaling', CCS, Ak(6, 0.5), { zs: 26 });
          S.lab(null, V(3.2, 0, 3.6), 'B 通道 ≈ RTP', 'Media', VOICE, Ak(6, 0.5, 0.3), { zs: 26 });
        }
      },
    };
  };

  SCENES.q931 = function () {
    const root = new THREE.Group();
    const layers = [
      ['Layer 3 · Q.931', '通話控制 Call control', CCS],
      ['Layer 2 · Q.921 (LAPD)', '可靠鏈路 Reliable link', P.lilac],
      ['Layer 1 · T1 / E1', '實體層 Physical', VOICE],
    ].map(([a, b, c], i) => {
      const card = paper(4.8, 1.0, (ctx, w, h) => {
        text(ctx, a, 30, 74, { size: 46, weight: 700, color: deep(c), fam: 'mono' });
        text(ctx, b, 30, 138, { size: 34, weight: 700, color: '#6d6590' });
      }, { edge: c });
      const slab = group(mesh(GX.box(5.3, 1.1, 1.0), c, { pos: [0, 0, -0.5] }), card.g);
      slab.position.set(-7.0, 6.1 - i * 1.25, 0);
      root.add(slab);
      return slab;
    });
    const ie = paper(4.9, 2.9, (ctx, w, h) => {
      text(ctx, 'SETUP 攜帶的資訊元素', 34, 70, { size: 44, weight: 900, color: P.ink });
      text(ctx, 'Information Elements', 34, 112, { size: 30, weight: 700, color: '#7a7196' });
      [['Called Party Number', '被叫號碼'], ['Channel ID', '使用哪條 B 通道'], ['Bearer Capability', '承載能力'], ['Calling Party Number', '來電號碼']].forEach((r, i) => {
        text(ctx, r[0], 34, 180 + i * 78, { size: 36, weight: 700, color: deep(CCS), fam: 'mono' });
        text(ctx, r[1], 34, 214 + i * 78, { size: 28, weight: 700, color: '#7a7196' });
      });
    }, { edge: CCS });
    const cause = paper(4.9, 2.9, (ctx) => {
      text(ctx, 'Cause Code 拆線原因', 34, 70, { size: 44, weight: 900, color: P.ink });
      text(ctx, 'ITU-T Q.850 cause values', 34, 112, { size: 30, weight: 700, color: '#7a7196' });
      [['16', 'Normal call clearing', '正常拆線'], ['17', 'User busy', '使用者忙線'], ['1', 'Unallocated number', '空號'], ['34', 'No circuit available', '無可用電路']].forEach((r, i) => {
        text(ctx, r[0], 70, 196 + i * 78, { size: 50, weight: 700, align: 'center', color: deep(CLEAR), fam: 'disp' });
        text(ctx, r[1], 130, 184 + i * 78, { size: 34, weight: 700, color: P.ink, fam: 'mono' });
        text(ctx, r[2], 130, 216 + i * 78, { size: 28, weight: 700, color: '#7a7196' });
      });
    }, { edge: CLEAR });
    ie.g.position.set(-7.0, 1.55, 0.3); cause.g.position.set(-7.0, 1.55, 0.3);
    root.add(ie.g, cause.g);
    const L = -2.2, R = 8.0;
    const gw = CH.gateway(), co = CH.co();
    gw.position.set(L, 6.2, 0); gw.scale.setScalar(0.7);
    co.position.set(R, 6.2, 0); co.scale.setScalar(0.62);
    root.add(gw, co);
    for (const x of [L, R]) {
      root.add(mesh(GX.cyl(0.12, 0.12, 6.1, 8), P.cream, { pos: [x, 3.05, -0.3] }));
      root.add(mesh(GX.cyl(0.9, 1.0, 0.18, 12), P.cream, { pos: [x, 6.1, 0] }));
    }
    const msgs = [
      ['SETUP', 1, 1, 0, CCS, 5.35], ['CALL PROCEEDING', -1, 2, 0, CCS, 4.8], ['ALERTING', -1, 2, 0.5, CCS, 4.25],
      ['CONNECT', -1, 3, 0, VOICE, 3.7], ['CONNECT ACK', 1, 3, 0.5, VOICE, 3.15],
      ['DISCONNECT', 1, 4, 0, CLEAR, 1.8], ['RELEASE', -1, 4, 0.33, CLEAR, 1.25], ['RELEASE COMPLETE', 1, 4, 0.66, CLEAR, 0.7],
    ].map(([name, dir, k, frac, col, y]) => {
      const ar = arrow3(R - L - 0.5, col, 0.07);
      ar.position.set(dir > 0 ? L + 0.25 : R - 0.25, y, 0);
      if (dir < 0) ar.rotation.y = Math.PI;
      const env = envelope();
      env.scale.setScalar(0.62);
      root.add(ar, env);
      return { name, dir, k, frac, col, y, ar, env };
    });
    const band = mesh(GX.box(R - L - 0.6, 0.6, 0.5), VOICE, { opacity: 0.4, shadow: false, pos: [(L + R) / 2, 2.55, -0.1], scale: [1, 0.85, 1] });
    const bandBeads = pipe(R - L - 0.8, VOICE, 22);
    bandBeads.children[0].visible = false; bandBeads.children[1].visible = false; bandBeads.children[2].visible = false;
    bandBeads.position.set((L + R) / 2, 2.55, 0.1);
    root.add(band, bandBeads);
    return {
      root,
      update(S) {
        const { t, A, cue, end, lt } = S;
        S.view(box(-9.8, 0.4, -0.2, 9.4, 8.9, 0.4, 0.08));
        layers.forEach((s, i) => setS(s, backOut(A(0, 0.5, i * 0.45))));
        setS(ie.g, backOut(A(1, 0.5)) * (1 - easeInOut(A(5, 0.4))));
        setS(cause.g, backOut(A(5, 0.5, 0.3)));
        const inL = backOut(A(0, 0.6, 0.6));
        setS(gw, inL * 0.7); setS(co, inL * 0.62);
        gw.userData.update(t); co.userData.update(t);
        msgs.forEach((m) => {
          const at = cue(m.k) + (end(m.k) - cue(m.k)) * m.frac;
          const p = easeOut((lt - at) / 0.7);
          m.ar.userData.set(p);
          m.env.visible = p > 0.01 && p < 0.999;
          const x = m.dir > 0 ? lerp(L + 0.25, R - 0.25, p) : lerp(R - 0.25, L + 0.25, p);
          m.env.position.set(x, m.y + 0.36, 0.1);
        });
        const ba = backOut(A(3, 0.5, 0.9));
        setS(band, ba); bandBeads.visible = ba > 0.5; bandBeads.userData.update(t, 0);
        S.draw((ctx) => {
          msgs.forEach((m) => {
            const at = cue(m.k) + (end(m.k) - cue(m.k)) * m.frac;
            const a = clamp((lt - at - 0.25) / 0.3);
            withA(ctx, a, () => {
              const q = S.proj(V((L + R) / 2, m.y + 0.12, 0));
              text(ctx, m.name, q.x, q.y - 4, { size: 21, weight: 900, align: 'center', color: '#fff7ec', fam: 'mono', shadow: 'rgba(0,0,0,.35)', blur: 6, dy: 2 });
              if (m.name === 'DISCONNECT') withA(ctx, A(5, 0.4), () => {
                rr(ctx, q.x + 100, q.y - 28, 132, 30, 15);
                ctx.fillStyle = CLEAR; ctx.fill();
                text(ctx, 'Cause 16', q.x + 166, q.y - 7, { size: 17, weight: 900, align: 'center', color: '#5a1620', fam: 'mono' });
              });
            });
          });
          withA(ctx, ba, () => {
            const q = S.proj(V((L + R) / 2, 2.55, 0.3));
            text(ctx, '通話中 · 語音走 B 通道  Talking on the B channel', q.x, q.y + 8, { size: 20, weight: 900, align: 'center', color: '#1f5a44' });
          });
        });
        S.lab(gw, V(0, 1.2, 0), '語音閘道 · 使用者端', 'Gateway · user side', VOICE, inL, { anchor: 'bottom', zs: 19, es: 13 });
        S.lab(co, V(0, 2.4, 0), '電信局 · 網路端', 'CO · network side', P.periw, inL, { anchor: 'bottom', zs: 19, es: 13 });
      },
    };
  };

  SCENES.compare = function () {
    const root = new THREE.Group();
    const cols = [[-6.6, 3.4], [-1.5, 6.4], [5.1, 6.4]];
    const rows = [
      ['項目', 'Item', ['CAS 隨路信令', 'Channel Associated'], ['CCS 共路信令', 'Common Channel']],
      ['設計', 'Design', ['簡單、相容老設備', 'Simple, legacy-friendly'], ['訊息式協定', 'Message-based protocol']],
      ['資訊量', 'Information', ['有限：狀態位元 + 號碼音頻', 'Limited: state bits + digit tones'], ['豐富：來電號碼、Cause', 'Rich: calling number, cause']],
      ['B 通道頻寬', 'Bearer', ['T1 資料只有 56k', '56k data on T1 (robbed bit)'], ['完整 64k', 'Clear 64 kbps']],
      ['T1 可用路數', 'T1 bearers', ['24', 'all 24 timeslots'], ['23 + D', 'one timeslot for D']],
      ['擴充', 'Scaling', ['每路各自處理', 'Per-channel bits'], ['NFAS：一條 D 控多條 T1', 'One D channel, many T1s']],
    ];
    const tiles = rows.map((r, ri) => {
      const y = 6.7 - ri * 1.12;
      return [0, 1, 2].map((ci) => {
        const [x, w] = cols[ci];
        const head = ri === 0;
        const color = ci === 0 ? P.lav : ci === 1 ? CAS : CCS;
        const zh = ci === 0 ? r[0] : r[ci + 1][0], en = ci === 0 ? r[1] : r[ci + 1][1];
        const big = ri === 4 && ci > 0;
        const card = paper(w, 0.92, (ctx, W2, H2) => {
          if (head && ci > 0) { ctx.fillStyle = ci === 1 ? '#fff0c8' : '#dff1ff'; ctx.fillRect(0, 0, W2, H2); }
          cardTitle(zh, en, color, { zs: big ? 70 : head ? 58 : 48, es: 30, zc: big ? deep(color) : P.ink })(ctx, W2, H2);
        }, { edge: color, res: 150 });
        const pivot = new THREE.Group();
        card.g.position.y = 0.46;
        pivot.add(card.g);
        pivot.position.set(x, y - 0.46, 0);
        root.add(pivot);
        return pivot;
      });
    });
    return {
      root,
      update(S) {
        const { A } = S;
        S.view(box(-8.6, 0.0, -0.2, 8.6, 7.3, 1.0, 0.08));
        tiles.forEach((row, ri) => row.forEach((p, ci) => {
          const a = ri === 0 ? A(0, 0.7, -0.2 + ci * 0.12) : A(ri, 0.7, ci * 0.12);
          p.visible = a > 0.01;
          p.rotation.x = (1 - backOut(a)) * -Math.PI / 2;
        }));
      },
    };
  };

  SCENES.cfgcas = function () {
    const root = new THREE.Group(), A = new THREE.Group();
    root.add(A);
    const items = [
      ['T1 訊框 Framing', ['SF', 'ESF']], ['T1 線路編碼 Line code', ['AMI', 'B8ZS']], ['E1 CRC4', ['crc4', 'no-crc4']],
      ['E1 線路編碼 Line code', ['HDB3']], ['時脈來源 Clock source', ['line ← 電信端']], ['信令類型 Signaling', ['e&m-wink-start …']],
    ];
    const clip = new THREE.Group();
    clip.add(mesh(GX.box(5.6, 6.9, 0.18), '#e7bd8e', { pos: [0, 0, -0.1] }));
    clip.add(mesh(GX.box(1.8, 0.45, 0.3), '#c9cbe0', { pos: [0, 3.4, 0.05] }));
    clip.add(mesh(GX.cyl(0.18, 0.18, 1.4, 8), '#c9cbe0', { pos: [0, 3.55, 0.12], rot: [0, 0, Math.PI / 2] }));
    const sheet = paper(5.0, 6.2, (ctx, w, h, st) => {
      text(ctx, '開通前核對', 40, 96, { size: 64, weight: 900, color: P.ink });
      text(ctx, 'Pre-turn-up checklist · match the far end', 40, 146, { size: 30, weight: 700, color: '#7a7196' });
      items.forEach(([label, opts], i) => {
        if (i >= st.n) return;
        const y = 220 + i * 142;
        ctx.beginPath(); ctx.arc(66, y + 40, 28, 0, 7); ctx.fillStyle = '#d9f6e8'; ctx.fill();
        ctx.strokeStyle = deep(VOICE); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(52, y + 40); ctx.lineTo(63, y + 52); ctx.lineTo(82, y + 28); ctx.stroke();
        text(ctx, label, 116, y + 36, { size: 40, weight: 900, color: P.ink });
        let ox = 116;
        opts.forEach((o) => {
          const ww = measure(ctx, o, 32, 700, 'mono') + 36;
          rr(ctx, ox, y + 58, ww, 50, 12); ctx.fillStyle = '#e4f3ff'; ctx.fill();
          text(ctx, o, ox + 18, y + 94, { size: 32, weight: 700, color: deep(CCS), fam: 'mono' });
          ox += ww + 14;
        });
      });
    }, { edge: '#fffaf1', state: { n: 0 } });
    sheet.g.position.z = 0.05;
    clip.add(sheet.g);
    clip.position.set(-5.9, 3.75, 0);
    root.add(clip);
    const gw = CH.gateway(), co = CH.co();
    gw.position.set(2.2, 0, 0.8); gw.scale.setScalar(1.6); gw.rotation.y = -0.2;
    co.position.set(7.8, 0, -0.4); co.scale.setScalar(1.35); co.rotation.y = -0.3;
    A.add(gw, co);
    const QS = ['ESF?', 'B8ZS?', 'CRC4?', 'clock?'];
    const bubbles = [0, 1].map(() => {
      const c = paper(1.5, 0.62, (ctx, w, h, st) => cardTitle(QS[st.q], '', CCS, { zs: 56 })(ctx, w, h), { edge: CCS, res: 150, state: { q: 0 } });
      A.add(c.g);
      return c;
    });
    const mon = monitor(9.6, 5.3);
    mon.position.set(4.3, 0, 0);
    root.add(mon);
    const lines = [
      { p: 'gw(config)# ', c: 'controller T1 0/1/0' },
      { p: 'gw(config-controller)# ', c: 'framing esf' },
      { p: 'gw(config-controller)# ', c: 'linecode b8zs' },
      { p: 'gw(config-controller)# ', c: 'clock source line' },
      { p: 'gw(config-controller)# ', c: 'ds0-group 0 timeslots 1-24', hl: true },
      { p: '    ', c: '  type e&m-wink-start', hl: true },
      { p: '', c: '! 自動產生 voice-port 0/1/0:0', color: '#8f89c0' },
      { p: 'gw(config)# ', c: 'dial-peer voice 100 pots' },
      { p: 'gw(config-dial-peer)# ', c: 'destination-pattern 9T' },
      { p: 'gw(config-dial-peer)# ', c: 'port 0/1/0:0', hl: true },
    ];
    return {
      root,
      update(S) {
        const { t, A: Ak, cue, end, lt } = S;
        S.view(box(-9.0, -0.5, -0.4, 9.4, 7.4, 1.5, 0.1));
        setS(clip, backOut(Ak(0, 0.6, -0.3)));
        const at = [[1, 0], [1, 0.45], [2, 0], [2, 0.5], [3, 0], [4, 0]];
        const n = at.filter(([k, f]) => lt > cue(k) + (end(k) - cue(k)) * f).length;
        sheet.redraw({ n });
        const outA = easeInOut((lt - cue(4)) / 0.5);
        setS(A, (1 - outA) * backOut(Ak(0, 0.6, 0.3)));
        gw.userData.update(t); co.userData.update(t);
        bubbles.forEach((b, i) => {
          const ph = t * 0.3 + i * 0.5, k = ph % 1;
          b.redraw({ q: (Math.floor(ph) * 2 + i) % 4 });
          const x = i ? lerp(7.0, 3.4, k) : lerp(3.4, 7.0, k);
          b.g.position.set(x, (i ? 2.6 : 3.4) + Math.sin(k * Math.PI) * (i ? 0.7 : 1.5), 0.3);
          setS(b.g, Math.min(1, Math.sin(k * Math.PI) * 2));
        });
        setS(mon, backOut((lt - cue(4) - 0.2) / 0.7));
        const typed = lt < cue(4) ? 0 : lt < cue(5) ? typedBy(S, lines, 0, 6, 4) : typedBy(S, lines, 6, 10, 5, 0.8);
        mon.userData.screen.redraw({ lines, typed, cursor: Math.floor(t * 2.5) % 2 === 0, title: 'voice-gateway · Cisco IOS', fs: 32, lh: 56 });
        if (A.visible) {
          S.lab(gw, V(0, 0, 0.9), '語音閘道', 'Voice Gateway', VOICE, 1);
          S.lab(co, V(0, 0, 1.0), '電信局', 'Central Office', P.periw, 1);
          S.lab(null, V(5.0, 5.9, 0), '兩端參數必須一致', 'Both ends must match', CAS, Ak(0, 0.5, 1), { anchor: 'bottom' });
        }
        S.lab(null, V(1.6, 0.4, 1.4), 'ds0-group = 時槽 + 信令類型', 'Timeslots + signaling type', CAS, Ak(4, 0.5, 1.5), { zs: 20 });
        S.lab(null, V(7.0, 0.4, 1.4), 'dial-peer ─ port ─▶ voice-port', 'Route calls to the CAS trunk', VOICE, Ak(5, 0.5, 1.2), { zs: 20 });
      },
    };
  };

  SCENES.cfgpri = function () {
    const root = new THREE.Group(), AB = new THREE.Group(), C = duo();
    root.add(AB, C);
    const mon = monitor(10.6, 5.6);
    mon.position.set(-3.0, 0, 0);
    AB.add(mon);
    const note = (w, h, edge, draw) => { const c = paper(w, h, draw, { edge }); AB.add(c.g); return c; };
    const sw = note(5.0, 2.5, CCS, (ctx, w) => {
      text(ctx, '常見 switch-type', 36, 76, { size: 50, weight: 900, color: P.ink });
      text(ctx, 'Must match the carrier / PBX', 36, 122, { size: 30, weight: 700, color: '#7a7196' });
      ['primary-ni', 'primary-5ess', 'primary-dms100', 'primary-net5', 'primary-qsig'].forEach((s, i) => {
        const x = 36 + (i % 2) * 400, y = 160 + Math.floor(i / 2) * 76;
        rr(ctx, x, y, 380, 60, 14); ctx.fillStyle = i === 0 ? '#cfeaff' : '#eaf5ff'; ctx.fill();
        text(ctx, s, x + 190, y + 42, { size: 32, weight: 700, align: 'center', color: deep(CCS), fam: 'mono' });
      });
    });
    const dch = note(5.0, 3.1, CCS, (ctx) => {
      text(ctx, 'D 通道介面', 36, 76, { size: 50, weight: 900, color: P.ink });
      text(ctx, 'The D channel appears as a serial interface', 36, 120, { size: 27, weight: 700, color: '#7a7196' });
      [['T1', 'Serial0/1/0:23', '時槽 24 = D · timeslots 1-24'], ['E1', 'Serial0/1/0:15', '時槽 16 = D · timeslots 1-31']].forEach((r, i) => {
        const y = 200 + i * 140;
        text(ctx, r[0], 36, y + 10, { size: 50, weight: 700, color: deep(CCS), fam: 'disp' });
        text(ctx, r[1], 160, y, { size: 40, weight: 700, color: P.ink, fam: 'mono' });
        text(ctx, r[2], 160, y + 46, { size: 28, weight: 700, color: '#7a7196' });
      });
    });
    const slips = note(5.0, 2.5, P.coral, (ctx) => {
      text(ctx, 'Slips 時脈滑移', 36, 76, { size: 50, weight: 900, color: deep(P.coral) });
      text(ctx, '→ 多半是時脈來源不一致', 36, 140, { size: 38, weight: 900, color: P.ink });
      text(ctx, 'Usually mismatched clock sources', 36, 184, { size: 28, weight: 700, color: '#7a7196' });
      text(ctx, 'show controllers t1 0/1/0', 36, 250, { size: 32, weight: 700, color: deep(CCS), fam: 'mono' });
      text(ctx, 'clock source line (跟隨電信端)', 36, 300, { size: 30, weight: 700, color: deep(VOICE), fam: 'mono' });
    });
    const dbg = note(5.0, 3.1, P.lilac, (ctx) => {
      text(ctx, '即時觀察 Debug', 36, 76, { size: 50, weight: 900, color: P.ink });
      text(ctx, 'CAS', 36, 160, { size: 40, weight: 700, color: deep(CAS), fam: 'disp' });
      text(ctx, 'debug vpm signal', 36, 212, { size: 38, weight: 700, color: P.ink, fam: 'mono' });
      text(ctx, '看 ABCD 位元變化 · bit transitions', 36, 256, { size: 28, weight: 700, color: '#7a7196' });
      text(ctx, 'PRI', 36, 340, { size: 40, weight: 700, color: deep(CCS), fam: 'disp' });
      text(ctx, 'debug isdn q931', 36, 392, { size: 38, weight: 700, color: P.ink, fam: 'mono' });
      text(ctx, '看 SETUP / CONNECT / Cause', 36, 436, { size: 28, weight: 700, color: '#7a7196' });
    });
    [sw, slips].forEach((c) => c.g.position.set(6.4, 5.7, 0));
    [dch, dbg].forEach((c) => c.g.position.set(6.4, 2.55, 0));
    const cfg = [
      { p: 'gw(config)# ', c: 'isdn switch-type primary-ni', hl: true },
      { p: 'gw(config)# ', c: 'controller T1 0/1/0' },
      { p: 'gw(config-controller)# ', c: 'framing esf' },
      { p: 'gw(config-controller)# ', c: 'linecode b8zs' },
      { p: 'gw(config-controller)# ', c: 'clock source line' },
      { p: 'gw(config-controller)# ', c: 'pri-group timeslots 1-24', hl: true },
      { p: 'gw(config)# ', c: 'interface Serial0/1/0:23', hl: true },
      { p: 'gw(config-if)# ', c: 'isdn switch-type primary-ni' },
      { p: 'gw(config-if)# ', c: 'isdn incoming-voice voice' },
    ];
    const out = [
      { p: 'gw# ', c: 'show isdn status', pc: P.mint },
      { p: '', c: 'ISDN Serial0/1/0:23 interface', color: '#fff6e8' },
      { p: '', c: '  dsl 0, interface ISDN Switchtype = primary-ni', color: '#c9c3ef' },
      { p: '', c: 'Layer 1 Status:', color: '#c9c3ef' },
      { p: '', c: '  ACTIVE', color: P.mint },
      { p: '', c: 'Layer 2 Status:', color: '#c9c3ef' },
      { p: '', c: '  TEI = 0, Ces = 1, SAPI = 0,', color: '#c9c3ef' },
      { p: '', c: '  State = MULTIPLE_FRAME_ESTABLISHED', color: P.mint, box: true },
      { p: '', c: 'Layer 3 Status:', color: '#c9c3ef' },
      { p: '', c: '  0 Active Layer 3 Call(s)', color: '#c9c3ef' },
    ];
    return {
      root,
      update(S) {
        const { t, A, cue, lt } = S;
        const pC = easeInOut((lt - cue(6)) / 0.9);
        S.view(box(-9.2, -0.2, -0.2, 9.1, 8.2, 0.6, 0.1), box(-9.2, -2.4, -2.6, 9.2, 2.6, 3.2, 0.55), pC);
        setS(AB, 1 - easeInOut((lt - cue(6)) / 0.5));
        setS(C, backOut((lt - cue(6) - 0.3) / 0.8));
        if (AB.visible) {
          setS(mon, backOut((lt + 0.4) / 0.7));
          const outMode = lt > cue(3);
          let st;
          if (!outMode) {
            const typed = lt < cue(1) ? typedBy(S, cfg, 0, 1, 0, 0.6) : lt < cue(2) ? typedBy(S, cfg, 1, 6, 1, 0.9) : typedBy(S, cfg, 6, 9, 2, 0.8);
            st = { lines: cfg, typed, title: 'voice-gateway · T1 PRI', fs: 32, lh: 58 };
          } else {
            st = { lines: out, typed: typedBy(S, out, 0, out.length, 3, 0.55), title: 'verify · show isdn status', fs: 31, lh: 54 };
          }
          st.cursor = Math.floor(t * 2.5) % 2 === 0;
          mon.userData.screen.redraw(st);
          setS(sw.g, backOut(A(0, 0.5, 0.8)) * (1 - easeInOut(A(3, 0.4))));
          setS(dch.g, backOut(A(2, 0.5, 0.3)) * (1 - easeInOut(A(3, 0.4))));
          setS(slips.g, backOut(A(4, 0.5)));
          setS(dbg.g, backOut(A(5, 0.5)));
          S.lab(null, V(1.2, 7.4, 0.3), '第二層建立完成', 'Layer 2 is up', VOICE, A(3, 0.5, 2.4), { anchor: 'bottom', zs: 20 });
        }
        if (C.visible) {
          C.userData.update(t, 1);
          S.head(V(-4.7, 1.3, -2.6), 'CAS', '信令跟著每個通道走 · Signaling rides every channel', CAS, 1);
          S.head(V(4.7, 1.3, -2.6), 'CCS', '信令集中在專用通道 · One dedicated channel', CCS, 1);
          const ta = A(7, 0.6);
          S.draw((ctx) => withA(ctx, ta, () => {
            const p = { y: 620 };
            text(ctx, '兩端參數對齊 · Match both ends', 960, p.y + 30, { size: 30, weight: 900, align: 'center', color: P.butter, shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 2 });
            text(ctx, '謝謝收看', 960, p.y + 124, { size: 64, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(146,210,255,.9)', blur: 26 });
            text(ctx, 'THANKS FOR WATCHING', 960, p.y + 166, { size: 22, weight: 700, align: 'center', color: '#eaf7ff', fam: 'disp', ls: 8, shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 2 });
          }));
        }
      },
    };
  };

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
        text(ctx, 'TELEPHONY SIGNALING', 960, 330, { size: 26, weight: 700, align: 'center', color: P.sky, fam: 'disp', ls: 12 });
        ctx.save();
        ctx.translate(960, 440); ctx.scale(k, k); ctx.translate(-960, -440);
        text(ctx, '電話信令 CAS / CCS', 960, 470, { size: 106, weight: 900, align: 'center', color: '#fff7ec', shadow: 'rgba(0,0,0,.35)', blur: 0, dy: 8 });
        ctx.restore();
        text(ctx, '原理與設定 · Concepts & Configuration', 960, 560, { size: 34, weight: 800, align: 'center', color: '#fff7ec' });
        text(ctx, 'T1 / E1 · Robbed-bit · R2 · ISDN PRI · Cisco IOS', 960, 612, { size: 22, weight: 600, align: 'center', color: P.lav, fam: 'mono' });
        text(ctx, '給網路工程師 · For network engineers', 960, 690, { size: 24, weight: 800, align: 'center', color: P.mint });
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
    text(ctx, '電話信令 CAS / CCS', 1880, 60, { size: 18, weight: 800, align: 'right', color: '#fff7ec' });
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
      phone: [1.5, 1.25, 8.0], pbx: [1.2, 1.55, 8.4], co: [1.1, 1.85, 9.6], gateway: [1.4, 0.5, 6.4],
      thief: [1.25, 1.0, 6.4], courier: [1.3, 1.4, 6.2], slot: [1.2, 0.5, 7.0],
    };
    const made = {};
    return {
      render(id, t) {
        if (!made[id]) {
          made[id] = CH[id]();
          const f = FRAME[id];
          made[id].scale.setScalar(f[0]);
          if (id === 'courier') made[id].position.y = 1.6;
          scene.add(made[id]);
        }
        Object.entries(made).forEach(([k, g]) => { g.visible = k === id; });
        const g = made[id], f = FRAME[id];
        g.rotation.y = Math.sin(t * 0.8) * 0.35;
        g.userData.update(t, id === 'phone' ? { lift: (t % 4) < 2 ? 0 : 1, ring: (t % 4) < 2 ? 1 : 0 } : {});
        cam.position.set(0, f[1] + 1.4, f[2]);
        cam.lookAt(0, f[1], 0);
        renderer.render(scene, cam);
        return renderer.domElement;
      },
    };
  }
  const CHAR_COLOR = { phone: P.pink, pbx: P.lav, co: P.periw, slot: P.mint, thief: P.pink, courier: P.sky, gateway: P.mint };
  window.CASCCS = { create, studio, CHAR_COLOR, W, H, fonts: FONT };
})();
