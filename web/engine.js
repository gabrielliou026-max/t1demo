/* CAS / CCS explainer — deterministic canvas renderer.
 * render(t) draws the frame at time t (seconds) on a 1920×1080 canvas, so the
 * interactive page and the offline MP4 export produce identical pictures.
 * All artwork is drawn in code; no external images. */
(function () {
  'use strict';
  const W = 1920, H = 1080;
  const FONT = {
    sans: "'Noto Sans TC','WenQuanYi Zen Hei','Microsoft JhengHei',sans-serif",
    mono: "'JetBrains Mono','DejaVu Sans Mono',Consolas,monospace",
    disp: "'Oxanium','Noto Sans TC',sans-serif",
  };
  const C = {
    bg0: '#040811', bg1: '#0b1630', ink: '#eaf2ff', mute: '#93a7cc', dim: '#51658c', line: '#1d2d4f',
    panel: 'rgba(12,22,44,0.82)', cyan: '#3fe2ff', teal: '#34e3a4', amber: '#ffb74a', pink: '#ff6190',
    violet: '#a08cff', green: '#5cf29c', red: '#ff5c5c',
  };
  // semantic roles
  const CAS = C.amber, CCS = C.cyan, VOICE = C.teal, SYNC = C.violet;

  // ---------- math ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // ---------- drawing primitives ----------
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
  function font(size, weight = 400, fam = 'sans') { return `${weight} ${size}px ${FONT[fam]}`; }
  function text(ctx, s, x, y, o = {}) {
    ctx.font = font(o.size || 24, o.weight || 400, o.fam || 'sans');
    ctx.fillStyle = o.color || C.ink;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.ls) ctx.letterSpacing = o.ls + 'px';
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || 18; }
    ctx.fillText(s, x, y);
    ctx.shadowBlur = 0;
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
  // Bilingual tag: zh on top, en below. anchor = point the tag hangs from.
  function tag(ctx, x, y, zh, en, color, a = 1, o = {}) {
    if (a <= 0.003) return;
    const zs = o.zs || 22, es = o.es || 15;
    const zw = measure(ctx, zh, zs, 700), ew = en ? measure(ctx, en, es, 500) : 0;
    const w = Math.max(zw, ew) + 32, h = en ? zs + es + 26 : zs + 20;
    let bx = x - w / 2;
    if (o.align === 'left') bx = x;
    if (o.align === 'right') bx = x - w;
    let by = y;
    if (o.anchor === 'bottom') by = y - h;
    if (o.anchor === 'middle') by = y - h / 2;
    const k = easeOut(a);
    withA(ctx, a, () => {
      ctx.translate(0, (1 - k) * 8);
      rr(ctx, bx, by, w, h, 10);
      ctx.fillStyle = 'rgba(8,15,32,0.9)';
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.75);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 12, by + 11 + zs / 2, 3.5, 0, 7);
      ctx.fill();
      const cx = bx + w / 2 + 6;
      text(ctx, zh, cx, by + 9 + zs * 0.88, { size: zs, weight: 700, align: 'center', color: C.ink });
      if (en) text(ctx, en, cx, by + 14 + zs + es * 0.9, { size: es, weight: 500, align: 'center', color: hexA(color, 0.95) });
    });
    return { x: bx, y: by, w, h };
  }
  function arrow(ctx, x0, y0, x1, y1, color, p = 1, o = {}) {
    if (p <= 0) return;
    const xe = lerp(x0, x1, p), ye = lerp(y0, y1, p);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = o.w || 3;
    if (o.dash) ctx.setLineDash(o.dash);
    if (o.glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(xe, ye);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y1 - y0, x1 - x0), hs = o.head || 14;
    ctx.beginPath();
    ctx.moveTo(xe, ye);
    ctx.lineTo(xe - hs * Math.cos(ang - 0.42), ye - hs * Math.sin(ang - 0.42));
    ctx.lineTo(xe - hs * Math.cos(ang + 0.42), ye - hs * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // A glowing tube carrying a voice waveform.
  function lane(ctx, x0, x1, y, color, t, o = {}) {
    const h = o.h || 34;
    rr(ctx, x0, y - h / 2, x1 - x0, h, h / 2);
    ctx.fillStyle = hexA(color, 0.07);
    ctx.fill();
    ctx.strokeStyle = hexA(color, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (o.wave !== false) {
      ctx.save();
      ctx.beginPath();
      rr(ctx, x0, y - h / 2, x1 - x0, h, h / 2);
      ctx.clip();
      ctx.strokeStyle = hexA(color, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      const ph = o.phase || 0;
      for (let x = x0 + 8; x <= x1 - 8; x += 4) {
        const u = (x - x0) / 38 - t * 3.2 + ph;
        const amp = (h / 2 - 7) * (0.55 + 0.45 * Math.sin(u * 0.37 + ph));
        const yy = y + Math.sin(u) * amp;
        x === x0 + 8 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  function car(ctx, x, y, w, h, color, label, o = {}) {
    rr(ctx, x, y, w, h, 7);
    ctx.fillStyle = o.fill || hexA(color, 0.16);
    ctx.fill();
    ctx.strokeStyle = hexA(color, o.strong ? 1 : 0.7);
    ctx.lineWidth = o.strong ? 2.5 : 1.5;
    if (o.glow) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (o.wheels !== false) {
      ctx.fillStyle = hexA(color, 0.55);
      for (const wx of [x + w * 0.25, x + w * 0.75]) {
        ctx.beginPath();
        ctx.arc(wx, y + h + 5, Math.min(5, w / 9), 0, 7);
        ctx.fill();
      }
    }
    if (label !== undefined && label !== '') {
      text(ctx, String(label), x + w / 2, y + h / 2 + (o.fs || 18) * 0.36, {
        size: o.fs || 18, weight: 700, align: 'center', color: o.textColor || C.ink, fam: o.fam || 'disp',
      });
    }
  }
  function envelope(ctx, x, y, w, h, color, label) {
    rr(ctx, x - w / 2, y - h / 2, w, h, 5);
    ctx.fillStyle = '#0c1a33';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 3, y - h / 2 + 3);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x + w / 2 - 3, y - h / 2 + 3);
    ctx.strokeStyle = hexA(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (label) text(ctx, label, x, y + h / 2 + 20, { size: 15, weight: 700, align: 'center', color, fam: 'mono' });
  }
  function panel(ctx, x, y, w, h, color, a = 1) {
    withA(ctx, a, () => {
      rr(ctx, x, y, w, h, 18);
      ctx.fillStyle = C.panel;
      ctx.fill();
      ctx.strokeStyle = hexA(color, 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // corner ticks
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 18, y); ctx.lineTo(x + 58, y);
      ctx.moveTo(x + w - 58, y + h); ctx.lineTo(x + w - 18, y + h);
      ctx.stroke();
    });
  }
  function eyes(ctx, x, y, gap, r, t, color = C.ink) {
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    ctx.fillStyle = color;
    for (const dx of [-gap / 2, gap / 2]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, r, r * blink, 0, 0, 7);
      ctx.fill();
    }
  }

  // ---------- characters (original designs) ----------
  const CH = {};
  CH.phone = function (ctx, x, y, s, t, o = {}) {
    const lift = o.lift || 0, ring = o.ring || 0, col = o.color || C.cyan;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // ring waves
    if (ring > 0) {
      for (let i = 0; i < 3; i++) {
        const k = ((t * 1.8 + i / 3) % 1);
        ctx.strokeStyle = hexA(C.amber, (1 - k) * ring);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -40, 70 + k * 60, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      }
    }
    // body
    ctx.beginPath();
    ctx.moveTo(-78, 90); ctx.lineTo(-62, -10); ctx.lineTo(62, -10); ctx.lineTo(78, 90); ctx.closePath();
    const g = ctx.createLinearGradient(0, -10, 0, 90);
    g.addColorStop(0, '#16284d'); g.addColorStop(1, '#0b1630');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    // screen with face
    rr(ctx, -34, 2, 68, 28, 6);
    ctx.fillStyle = '#071022';
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    eyes(ctx, 0, 16, 22, 4.5, t + (o.seed || 0), col);
    // keypad
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      ctx.fillStyle = hexA(col, (o.dial && ((Math.floor(t * 6) + r * 3 + c) % 5 === 0)) ? 1 : 0.35);
      ctx.beginPath();
      ctx.arc(-24 + c * 24, 44 + r * 15, 4.2, 0, 7);
      ctx.fill();
    }
    // cradle
    ctx.fillStyle = hexA(col, 0.5);
    rr(ctx, -70, -24, 20, 16, 4); ctx.fill();
    rr(ctx, 50, -24, 20, 16, 4); ctx.fill();
    // handset
    ctx.save();
    ctx.translate(-lift * 20, -lift * 62);
    ctx.rotate(-lift * 0.38);
    ctx.beginPath();
    ctx.moveTo(-96, -30);
    ctx.quadraticCurveTo(-96, -58, -62, -56);
    ctx.lineTo(62, -56);
    ctx.quadraticCurveTo(96, -58, 96, -30);
    ctx.lineTo(74, -22);
    ctx.quadraticCurveTo(60, -40, 40, -38);
    ctx.lineTo(-40, -38);
    ctx.quadraticCurveTo(-60, -40, -74, -22);
    ctx.closePath();
    ctx.fillStyle = '#12254a';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  };
  CH.pbx = function (ctx, x, y, s, t, o = {}) {
    const col = o.color || C.violet;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    rr(ctx, -72, -120, 144, 240, 14);
    const g = ctx.createLinearGradient(0, -120, 0, 120);
    g.addColorStop(0, '#1a2250'); g.addColorStop(1, '#0c1330');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    // visor face
    rr(ctx, -52, -100, 104, 44, 10);
    ctx.fillStyle = '#070b1d';
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    eyes(ctx, 0, -78, 34, 6, t + 1.3, col);
    // rack units with LEDs
    for (let r = 0; r < 5; r++) {
      const yy = -40 + r * 30;
      rr(ctx, -56, yy, 112, 22, 4);
      ctx.fillStyle = '#0e1838';
      ctx.fill();
      ctx.strokeStyle = hexA(col, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let c = 0; c < 6; c++) {
        const on = hash(r * 11 + c * 3 + Math.floor(t * 4 + c)) > 0.45;
        ctx.fillStyle = on ? (c % 3 === 0 ? C.green : C.cyan) : '#1c2a4f';
        ctx.fillRect(-46 + c * 16, yy + 8, 8, 6);
      }
    }
    ctx.restore();
  };
  CH.co = function (ctx, x, y, s, t, o = {}) {
    const col = o.color || C.cyan;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // tower
    ctx.strokeStyle = hexA(col, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -70); ctx.lineTo(0, -160); ctx.lineTo(18, -70);
    ctx.moveTo(-12, -95); ctx.lineTo(12, -95);
    ctx.moveTo(-7, -122); ctx.lineTo(7, -122);
    ctx.stroke();
    const blink = (t % 1.4) < 0.7;
    ctx.fillStyle = blink ? C.red : '#5a1f2a';
    ctx.beginPath(); ctx.arc(0, -164, 6, 0, 7); ctx.fill();
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.9 + i * 0.5) % 1;
      ctx.strokeStyle = hexA(col, (1 - k) * 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -164, 16 + k * 40, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    // building
    rr(ctx, -90, -70, 180, 170, 10);
    const g = ctx.createLinearGradient(0, -70, 0, 100);
    g.addColorStop(0, '#132a52'); g.addColorStop(1, '#0a1530');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const lit = hash(r * 7 + c * 13 + Math.floor(t * 0.7 + r)) > 0.35;
      ctx.fillStyle = lit ? hexA(C.amber, 0.85) : '#1a2b52';
      ctx.fillRect(-72 + c * 30, -52 + r * 30, 18, 16);
    }
    rr(ctx, -20, 62, 40, 38, 4);
    ctx.fillStyle = '#081126';
    ctx.fill();
    ctx.restore();
  };
  CH.gateway = function (ctx, x, y, s, t, o = {}) {
    const col = o.color || C.teal;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    rr(ctx, -130, -46, 260, 92, 14);
    const g = ctx.createLinearGradient(0, -46, 0, 46);
    g.addColorStop(0, '#15304f'); g.addColorStop(1, '#0a1830');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    rr(ctx, -112, -28, 70, 40, 8);
    ctx.fillStyle = '#061022';
    ctx.fill();
    eyes(ctx, -77, -8, 26, 5, t + 2.1, col);
    // T1/E1 ports
    for (let i = 0; i < 4; i++) {
      rr(ctx, -24 + i * 36, -18, 28, 22, 3);
      ctx.fillStyle = '#081426';
      ctx.fill();
      ctx.strokeStyle = hexA(col, 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const on = hash(i * 5 + Math.floor(t * 5)) > 0.3;
      ctx.fillStyle = on ? C.green : '#1b3a2c';
      ctx.fillRect(-20 + i * 36, 12, 6, 5);
      ctx.fillStyle = C.amber;
      ctx.fillRect(-8 + i * 36, 12, 6, 5);
    }
    text(ctx, 'T1/E1', 44, 36, { size: 13, weight: 700, color: hexA(col, 0.8), align: 'center', fam: 'mono' });
    ctx.restore();
  };
  CH.thief = function (ctx, x, y, s, t, o = {}) {
    const col = o.color || C.pink;
    const bob = Math.sin(t * 3) * 6;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(s, s);
    // bag
    ctx.save();
    ctx.translate(62, 28);
    ctx.rotate(Math.sin(t * 3 + 1) * 0.08);
    ctx.beginPath();
    ctx.moveTo(-8, -30);
    ctx.quadraticCurveTo(46, -34, 44, 18);
    ctx.quadraticCurveTo(38, 48, 8, 46);
    ctx.quadraticCurveTo(-26, 44, -22, 10);
    ctx.quadraticCurveTo(-24, -22, -8, -30);
    ctx.fillStyle = '#2a1733';
    ctx.fill();
    ctx.strokeStyle = C.amber;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    text(ctx, o.bag || 'LSB', 11, 18, { size: 17, weight: 800, align: 'center', color: C.amber, fam: 'disp' });
    ctx.restore();
    // body
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, 7);
    const g = ctx.createRadialGradient(-18, -22, 8, 0, 0, 62);
    g.addColorStop(0, '#3a2350'); g.addColorStop(1, '#170d24');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    // beanie
    ctx.beginPath();
    ctx.arc(0, -40, 40, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    ctx.fillStyle = hexA(col, 0.85);
    ctx.fill();
    ctx.beginPath(); ctx.arc(0, -84, 8, 0, 7); ctx.fill();
    // mask band
    rr(ctx, -54, -18, 108, 30, 14);
    ctx.fillStyle = '#05030a';
    ctx.fill();
    eyes(ctx, 0, -3, 34, 7, t + 0.7, '#ffffff');
    // grin
    ctx.strokeStyle = hexA(C.ink, 0.8);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 22, 16, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  };
  CH.courier = function (ctx, x, y, s, t, o = {}) {
    const col = o.color || C.cyan;
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 4) * 4);
    ctx.scale(s, s);
    // arms & rotors
    ctx.strokeStyle = hexA(col, 0.8);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-60, -22); ctx.lineTo(60, -22);
    ctx.stroke();
    for (const rx of [-60, 60]) {
      const k = Math.abs(Math.sin(t * 40 + rx));
      ctx.fillStyle = hexA(col, 0.35);
      ctx.beginPath();
      ctx.ellipse(rx, -30, 34 * (0.35 + 0.65 * k), 5, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(rx - 3, -32, 6, 10);
    }
    // body
    rr(ctx, -34, -24, 68, 38, 16);
    ctx.fillStyle = '#10284a';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
    eyes(ctx, 0, -5, 22, 5, t + 0.4, col);
    // string + envelope
    ctx.strokeStyle = hexA(col, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, 30); ctx.stroke();
    envelope(ctx, 0, 46, 54, 34, col, o.msg || '');
    ctx.restore();
  };
  CH.slot = function (ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const cols = [SYNC, VOICE, VOICE, CAS];
    for (let i = 0; i < 4; i++) {
      const bx = -150 + i * 76 + Math.sin(t * 2 + i) * 1.5;
      car(ctx, bx, -32, 68, 56, cols[i], i === 0 ? 'F' : (i === 3 ? 'S' : i), { fs: 22 });
      if (i < 3) { ctx.fillStyle = hexA(C.mute, 0.6); ctx.fillRect(bx + 68, -6, 8, 4); }
    }
    ctx.restore();
  };
  const CHAR_COLOR = { phone: C.cyan, pbx: C.violet, co: C.cyan, slot: C.teal, thief: C.pink, courier: C.cyan, gateway: C.teal };

  // ---------- background ----------
  let bgCache = null;
  function buildBG() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(960, 420, 60, 960, 520, 1250);
    g.addColorStop(0, '#0f2147');
    g.addColorStop(0.55, '#081330');
    g.addColorStop(1, C.bg0);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // dot grid
    for (let gy = 24; gy < H; gy += 40) for (let gx = 20; gx < W; gx += 40) {
      const d = Math.hypot(gx - 960, gy - 480) / 1100;
      x.fillStyle = `rgba(110,160,255,${0.10 * (1 - d * 0.8)})`;
      x.fillRect(gx, gy, 2, 2);
    }
    // faint circuit traces
    x.strokeStyle = 'rgba(63,226,255,0.05)';
    x.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      let px = hash(i) * W, py = hash(i + 50) * H;
      x.beginPath();
      x.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) px += (hash(i * 9 + k) - 0.5) * 500; else py += (hash(i * 7 + k) - 0.5) * 300;
        x.lineTo(px, py);
      }
      x.stroke();
      x.fillStyle = 'rgba(63,226,255,0.08)';
      x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill();
    }
    // vignette
    const v = x.createRadialGradient(960, 540, 500, 960, 540, 1150);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
    return c;
  }
  function drawBG(ctx, t) {
    if (!bgCache) bgCache = buildBG();
    ctx.drawImage(bgCache, 0, 0);
    // drifting particles
    for (let i = 0; i < 70; i++) {
      const sp = 8 + hash(i + 3) * 22;
      const px = (hash(i) * W + t * sp) % W;
      const py = (hash(i + 99) * H - t * sp * 0.35 + H * 10) % H;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + hash(i + 7)) + i));
      ctx.fillStyle = i % 5 === 0 ? `rgba(255,183,74,${0.22 * tw})` : `rgba(63,226,255,${0.28 * tw})`;
      ctx.beginPath();
      ctx.arc(px, py, 1 + hash(i + 5) * 1.8, 0, 7);
      ctx.fill();
    }
    // slow scan sweep
    const sy = ((t * 60) % (H + 400)) - 200;
    const sg = ctx.createLinearGradient(0, sy - 120, 0, sy + 120);
    sg.addColorStop(0, 'rgba(63,226,255,0)');
    sg.addColorStop(0.5, 'rgba(63,226,255,0.025)');
    sg.addColorStop(1, 'rgba(63,226,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, sy - 120, W, 240);
  }

  // ---------- scenes ----------
  // Each scene receives S: { ctx, t, lt, cue(k), end(k), A(k,d,off), P(k), dur }
  const SCENES = {};

  SCENES.intro = function (S) {
    const { ctx, t, A, P, cue, end } = S;
    const aA = 1 - A(2, 0.6), aB = A(2, 0.7, 0.25);
    // ---- part A: a call between two phones through the CO ----
    withA(ctx, aA * A(0, 0.8, -0.3), () => {
      const p0 = P(0);
      const ev = Math.floor(p0 * 5 + 0.0001);     // 0..4 active event while sentence 0 plays
      const done = S.lt > end(0);
      const lx = 300, rx = 1620, cx = 960, wy = 520;
      // wires
      for (const [a, b] of [[lx + 90, cx - 110], [cx + 110, rx - 90]]) {
        ctx.strokeStyle = hexA(C.cyan, 0.25);
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(a, wy); ctx.lineTo(b, wy); ctx.stroke();
        ctx.strokeStyle = hexA(C.cyan, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a, wy); ctx.lineTo(b, wy); ctx.stroke();
      }
      const talking = !done && ev === 3 || (S.lt > cue(1) && S.lt < cue(2) + 1);
      const liftL = done ? (S.lt > cue(1) ? 1 : 0) : (ev >= 0 && ev <= 3 ? 1 : 0);
      const liftR = done ? (S.lt > cue(1) ? 1 : 0) : (ev === 3 ? 1 : 0);
      CH.phone(ctx, lx, 520, 1.05, t, { lift: liftL, dial: !done && ev === 1, seed: 0 });
      CH.phone(ctx, rx, 520, 1.05, t, { lift: liftR, ring: !done && ev === 2 ? 1 : 0, seed: 1.7, color: C.teal });
      CH.co(ctx, cx, 530, 0.95, t);
      tag(ctx, lx, 640, '小話機 A', 'Phone A', C.cyan, 1);
      tag(ctx, rx, 640, '小話機 B', 'Phone B', C.teal, 1);
      tag(ctx, cx, 640, '電信局', 'Central Office', C.cyan, 1);
      // event chips during sentence 0
      const evs = [['摘機', 'Off-hook'], ['撥號', 'Dialing'], ['響鈴', 'Ringing'], ['通話', 'Talking'], ['掛機', 'On-hook']];
      withA(ctx, 1 - A(1, 0.4), () => {
        evs.forEach((e, i) => {
          const at = cue(0) + (end(0) - cue(0)) * i / 5;
          const a = clamp((S.lt - at) / 0.35);
          const x = 420 + i * 270;
          const active = !done && i === ev;
          tag(ctx, x, 250, e[0], e[1], active ? C.amber : C.dim, a, { zs: 24 });
          if (i < 4) arrow(ctx, x + 70, 283, x + 200, 283, hexA(C.mute, 0.5), a, { w: 2, head: 9 });
        });
      });
      // signal pulses on the wire
      const pulses = (x0, x1, dir, color, n, sp) => {
        for (let i = 0; i < n; i++) {
          const k = ((t * sp + i / n) % 1);
          const x = dir > 0 ? lerp(x0, x1, k) : lerp(x1, x0, k);
          ctx.fillStyle = color;
          ctx.shadowColor = color; ctx.shadowBlur = 12;
          ctx.fillRect(x - 7, wy - 7, 14, 14);
          ctx.shadowBlur = 0;
        }
      };
      if (!done && ev === 1) pulses(lx + 90, cx - 110, 1, C.amber, 3, 0.9);
      if (!done && ev === 2) pulses(cx + 110, rx - 90, 1, C.amber, 2, 0.9);
      if (talking) {
        // voice waves both ways
        for (const [a, b, ph] of [[lx + 100, cx - 120, 0], [cx + 120, rx - 100, 2]]) {
          ctx.strokeStyle = C.teal;
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let x = a; x <= b; x += 4) {
            const yy = wy - 26 + Math.sin(x / 22 - t * 6 + ph) * 12 * Math.sin((x - a) / (b - a) * Math.PI);
            x === a ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      }
      // sentence 1: voice + control, "Signaling"
      withA(ctx, A(1, 0.6), () => {
        pulses(lx + 90, cx - 110, 1, C.amber, 2, 0.35);
        pulses(cx + 110, rx - 90, -1, C.amber, 2, 0.35);
        text(ctx, '信令', 960, 250, { size: 84, weight: 900, align: 'center', color: C.ink, glow: C.amber, glowBlur: 30 });
        text(ctx, 'SIGNALING', 960, 300, { size: 30, weight: 700, align: 'center', color: C.amber, fam: 'disp', ls: 10 });
        tag(ctx, 640, 740, '語音', 'Voice (media)', C.teal, A(1, 0.5, 0.4));
        tag(ctx, 1280, 740, '控制訊息', 'Control messages', C.amber, A(1, 0.5, 0.8));
      });
    });
    // ---- part B: CAS vs CCS preview ----
    withA(ctx, aB, () => {
      const drawPanel = (x, color, zh, en) => {
        panel(ctx, x, 180, 800, 620, color);
        text(ctx, zh, x + 400, 250, { size: 40, weight: 900, align: 'center', color });
        text(ctx, en, x + 400, 288, { size: 20, weight: 500, align: 'center', color: C.mute });
      };
      drawPanel(120, CAS, '隨路信令 CAS', 'Channel Associated Signaling');
      drawPanel(1000, CCS, '共路信令 CCS', 'Common Channel Signaling');
      const hl = A(3, 0.6);
      // CAS: every lane carries its own bits
      for (let i = 0; i < 4; i++) {
        const y = 370 + i * 88;
        lane(ctx, 190, 850, y, VOICE, t, { phase: i });
        const k = (t * 0.22 + i * 0.27) % 1;
        const bx = lerp(210, 800, k);
        rr(ctx, bx, y - 16, 44, 32, 6);
        ctx.fillStyle = hexA(CAS, 0.9);
        ctx.shadowColor = CAS; ctx.shadowBlur = 10 + hl * 14;
        ctx.fill();
        ctx.shadowBlur = 0;
        text(ctx, 'AB', bx + 22, y + 7, { size: 17, weight: 800, align: 'center', color: '#1b1204', fam: 'disp' });
      }
      tag(ctx, 520, 718, '每一路自帶信令', 'Signaling rides every channel', CAS, hl);
      // CCS: one dedicated lane with messages + clean voice lanes
      lane(ctx, 1070, 1730, 370, CCS, t, { wave: false, h: 40 });
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.18 + i / 3) % 1;
        envelope(ctx, lerp(1110, 1690, k), 370, 40, 26, CCS);
      }
      for (let i = 0; i < 3; i++) lane(ctx, 1070, 1730, 458 + i * 88, VOICE, t, { phase: i + 3 });
      tag(ctx, 1400, 718, '一條專用信令通道', 'One dedicated signaling channel', CCS, hl);
    });
  };

  SCENES.t1e1 = function (S) {
    const { ctx, t, A, P } = S;
    // ---- T1 ----
    const x0 = 150, cw = 62, gap = 4, fy = 212, chh = 64;
    withA(ctx, A(0, 0.5, -0.2), () => {
      text(ctx, 'T1', x0, 180, { size: 46, weight: 700, color: C.cyan, fam: 'disp' });
      text(ctx, '24 個時槽 · 24 timeslots (DS0)', x0 + 72, 176, { size: 24, weight: 700, color: C.ink });
    });
    const sweep = (t * 1.2) % 1.4;
    for (let i = 0; i <= 24; i++) {
      const a = clamp((S.lt - S.cue(0) + 0.3 - i * 0.03) / 0.35);
      if (a <= 0) continue;
      const isF = i === 0;
      const x = isF ? x0 : x0 + 56 + (i - 1) * (cw + gap);
      const w = isF ? 48 : cw;
      const fpulse = isF ? A(2, 0.4) * (0.5 + 0.5 * Math.sin(t * 8)) : 0;
      const hot = Math.abs((x - x0) / 1650 - sweep) < 0.04;
      withA(ctx, a, () => {
        ctx.translate((1 - easeOut(a)) * 60, 0);
        car(ctx, x, fy, w, chh, isF ? SYNC : VOICE, isF ? 'F' : i,
          { strong: hot || fpulse > 0.5, glow: fpulse > 0.3, fs: 20 });
      });
    }
    // DS0 callout
    withA(ctx, A(0, 0.5, 1.6), () => {
      const cx = x0 + 56 + 2 * (cw + gap) + cw / 2;
      ctx.strokeStyle = hexA(C.teal, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, fy + chh + 12); ctx.lineTo(cx, 318); ctx.stroke();
      panel(ctx, 300, 318, 520, 86, C.teal);
      text(ctx, 'DS0 = 8 bits × 8000 /s', 330, 354, { size: 24, weight: 700, color: C.ink, fam: 'mono' });
      text(ctx, '= 64 kbps', 330, 388, { size: 24, weight: 700, color: C.teal, fam: 'mono' });
    });
    withA(ctx, A(1, 0.5), () => {
      panel(ctx, 880, 318, 914, 86, C.cyan);
      text(ctx, '1 + 24 × 8 = 193 bits / frame', 910, 354, { size: 24, weight: 700, color: C.ink, fam: 'mono' });
      text(ctx, '193 × 8000 frames/s = 1.544 Mbps', 910, 388, { size: 24, weight: 700, color: C.cyan, fam: 'mono' });
    });
    withA(ctx, A(2, 0.5), () => {
      tag(ctx, x0 + 24, 424, 'F bit 訊框同步', 'Framing bit', SYNC, 1, { align: 'left' });
    });
    // ---- E1 ----
    const ex = 128, ew = 48, eg = 4, ey = 596;
    withA(ctx, A(3, 0.5), () => {
      text(ctx, 'E1', ex, 566, { size: 46, weight: 700, color: C.cyan, fam: 'disp' });
      text(ctx, '32 個時槽 · 32 timeslots · 2.048 Mbps', ex + 72, 562, { size: 24, weight: 700, color: C.ink });
    });
    for (let i = 0; i < 32; i++) {
      const a = clamp((S.lt - S.cue(3) - i * 0.025) / 0.3);
      if (a <= 0) continue;
      const col = i === 0 ? SYNC : i === 16 ? CAS : VOICE;
      const strong = (i === 0 || i === 16) && S.lt > S.cue(4);
      withA(ctx, a, () => {
        ctx.translate((1 - easeOut(a)) * 60, 0);
        car(ctx, ex + i * (ew + eg), ey, ew, 60, col, i, { fs: 17, strong, glow: strong });
      });
    }
    const cxOf = (i) => ex + i * (ew + eg) + ew / 2;
    tag(ctx, cxOf(0) + 64, 680, 'TS0 同步', 'Frame alignment', SYNC, A(4, 0.5));
    tag(ctx, cxOf(16), 680, 'TS16 信令', 'Signaling', CAS, A(4, 0.5, 0.5));
    withA(ctx, A(5, 0.5), () => {
      ctx.strokeStyle = hexA(C.teal, 0.9);
      ctx.lineWidth = 2.5;
      for (const [a, b] of [[1, 15], [17, 31]]) {
        const xa = cxOf(a) - ew / 2, xb = cxOf(b) + ew / 2;
        ctx.beginPath();
        ctx.moveTo(xa, 752); ctx.lineTo(xa, 764); ctx.lineTo(xb, 764); ctx.lineTo(xb, 752);
        ctx.stroke();
      }
      tag(ctx, cxOf(8), 778, '15 路語音', '15 voice', C.teal, 1, { zs: 20 });
      tag(ctx, cxOf(24), 778, '15 路語音', '15 voice', C.teal, 1, { zs: 20 });
      text(ctx, '= 30 路 · 30 voice channels', cxOf(16), 812, { size: 26, weight: 800, align: 'center', color: C.teal });
    });
  };

  SCENES.cas = function (S) {
    const { ctx, t, A, P, cue, end } = S;
    const aA = 1 - A(4, 0.5), aB = A(4, 0.6, 0.25);
    withA(ctx, aA, () => {
      withA(ctx, A(0, 0.6, -0.3), () => {
        CH.pbx(ctx, 220, 420, 0.95, t);
        CH.co(ctx, 1700, 440, 0.9, t);
        tag(ctx, 220, 548, '阿交', 'PBX', C.violet);
        tag(ctx, 1700, 548, '電信局', 'Central Office', C.cyan);
        const lanesY = [300, 370, 440, 510];
        lanesY.forEach((y, i) => {
          lane(ctx, 340, 1580, y, VOICE, t, { phase: i * 1.3 });
          const k = (t * 0.16 + i * 0.29) % 1;
          const bx = lerp(360, 1500, k);
          const off = S.lt > cue(1) ? ((Math.floor(t / 1.6 + i * 0.5) % 2) === 0) : true;
          rr(ctx, bx, y - 17, 64, 34, 7);
          ctx.fillStyle = off ? CAS : '#3b2d17';
          ctx.shadowColor = CAS; ctx.shadowBlur = off ? 16 : 0;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = CAS; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, 'ABCD', bx + 32, y + 6, { size: 15, weight: 800, align: 'center', color: off ? '#1c1204' : CAS, fam: 'disp' });
          text(ctx, 'CH' + (i + 1), 352, y - 22, { size: 13, weight: 700, color: C.mute, fam: 'mono' });
        });
        tag(ctx, 960, 190, '每一路語音通道，帶著自己的狀態位元', 'Each voice channel carries its own state bits', CAS, A(0, 0.5, 0.6));
      });
      withA(ctx, A(1, 0.5), () => {
        const lg = (x, on, zh, en) => {
          rr(ctx, x - 150, 580, 36, 24, 6);
          ctx.fillStyle = on ? CAS : '#3b2d17'; ctx.fill();
          ctx.strokeStyle = CAS; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, zh, x - 100, 600, { size: 22, weight: 700, color: C.ink });
          text(ctx, en, x - 100 + measure(ctx, zh, 22, 700) + 10, 600, { size: 17, weight: 500, color: C.mute });
        };
        lg(800, true, '摘機', 'Off-hook');
        lg(1180, false, '掛機', 'On-hook');
      });
      const types = [['Loop Start', '迴路啟動'], ['Ground Start', '接地啟動'], ['E&M', 'E&M 中繼信令']];
      types.forEach((ty, i) => {
        tag(ctx, 520 + i * 440, 648, ty[0], ty[1], i === 2 ? CAS : C.cyan, A(2, 0.45, i * 0.45), { zs: 26 });
      });
      ['Immediate', 'Wink', 'Delay Dial'].forEach((m, i) => {
        const x = 1230 + i * 170;
        const a = A(3, 0.4, 0.4 + i * 0.35);
        withA(ctx, a, () => {
          ctx.strokeStyle = hexA(CAS, 0.6);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(1400, 728); ctx.lineTo(x, 770); ctx.stroke();
        });
        tag(ctx, x, 770, m, '', m === 'Wink' ? C.amber : C.mute, a, { zs: 20 });
      });
    });
    // ---- part B: wink-start timing diagram ----
    withA(ctx, aB, () => {
      text(ctx, 'E&M Wink Start 時序', 960, 168, { size: 36, weight: 900, align: 'center', color: C.ink });
      text(ctx, 'Signaling timing', 960, 200, { size: 20, weight: 500, align: 'center', color: C.mute });
      const X0 = 440, X1 = 1760, ux = (u) => lerp(X0, X1, u);
      const rows = [
        { y: 330, zh: '發起端 PBX', en: 'Originating', col: C.violet },
        { y: 500, zh: '對端 CO', en: 'Terminating', col: C.cyan },
        { y: 670, zh: '號碼', en: 'Digits (in-band)', col: C.teal },
      ];
      rows.forEach((r) => {
        text(ctx, r.zh, 130, r.y - 4, { size: 26, weight: 800, color: r.col });
        text(ctx, r.en, 130, r.y + 26, { size: 17, weight: 500, color: C.mute });
        ctx.strokeStyle = hexA(C.dim, 0.5);
        ctx.setLineDash([4, 6]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(X0, r.y + 40); ctx.lineTo(X1, r.y + 40); ctx.stroke();
        ctx.setLineDash([]);
      });
      // progress in diagram units
      const u = cue(5) > S.lt
        ? lerp(0, 0.3, P(4))
        : S.lt < cue(6) ? lerp(0.3, 0.8, P(5)) : lerp(0.8, 1, P(6));
      const wave = (y, pts, col) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(X0 - 4, y - 70, (X1 - X0) * u + 8, 140);
        ctx.clip();
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.shadowColor = col; ctx.shadowBlur = 10;
        ctx.beginPath();
        pts.forEach(([uu, hi], i) => {
          const yy = hi ? y - 34 : y + 34;
          if (i === 0) ctx.moveTo(ux(uu), yy); else {
            ctx.lineTo(ux(uu), ctx._lastY ?? yy);
            ctx.lineTo(ux(uu), yy);
          }
          ctx._lastY = yy;
        });
        ctx.lineTo(X1, ctx._lastY);
        ctx.stroke();
        ctx._lastY = undefined;
        ctx.restore();
      };
      wave(330, [[0, 0], [0.12, 1]], C.violet);
      wave(500, [[0, 0], [0.32, 1], [0.4, 0], [0.88, 1]], C.cyan);
      // digits bursts
      for (let i = 0; i < 6; i++) {
        const ua = 0.48 + i * 0.05;
        if (u < ua) continue;
        const x = ux(ua);
        ctx.fillStyle = hexA(C.teal, 0.25);
        rr(ctx, x, 645, ux(0.03) - X0, 50, 6);
        ctx.fill();
        ctx.strokeStyle = C.teal; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath();
        for (let xx = x + 3; xx < x + ux(0.03) - X0 - 3; xx += 2) {
          const yy = 670 + Math.sin(xx * 0.9 + i) * 8 * Math.sin(xx * 0.23);
          xx === x + 3 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        text(ctx, '5551234'[i], x + (ux(0.03) - X0) / 2, 630, { size: 18, weight: 700, align: 'center', color: C.teal, fam: 'mono' });
      }
      const mark = (uu, col) => {
        ctx.strokeStyle = hexA(col, 0.4);
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ux(uu), 240); ctx.lineTo(ux(uu), 720); ctx.stroke();
        ctx.setLineDash([]);
      };
      if (u > 0.12) mark(0.12, C.violet);
      if (u > 0.32) mark(0.32, C.cyan);
      tag(ctx, ux(0.12) + 140, 238, '① 佔線', 'Seize (off-hook)', C.violet, clamp((u - 0.12) / 0.05));
      tag(ctx, ux(0.36), 410, '② Wink', 'Brief off-hook pulse', C.cyan, clamp((u - 0.4) / 0.05), { anchor: 'bottom' });
      tag(ctx, ux(0.625), 718, '③ 送號 DTMF / MF', 'Digits sent as in-band tones', C.teal, A(6, 0.5));
      tag(ctx, ux(0.88) - 10, 410, '④ 應答', 'Answer', C.cyan, clamp((u - 0.9) / 0.05), { anchor: 'bottom' });
    });
  };

  SCENES.robbed = function (S) {
    const { ctx, t, A, P, cue } = S;
    // SF stack
    const sx = 250, sy = 196, sz = 36, pitch = 45;
    withA(ctx, A(0, 0.5, -0.3), () => {
      text(ctx, 'SF 超訊框', 150, 160, { size: 28, weight: 900, color: C.ink });
      text(ctx, 'Superframe · 12 frames', 150 + measure(ctx, 'SF 超訊框', 28, 900) + 14, 160, { size: 18, weight: 500, color: C.mute });
      text(ctx, 'LSB', sx + 7 * 42 + sz / 2, 186, { size: 15, weight: 800, align: 'center', color: CAS, fam: 'mono' });
      for (let r = 0; r < 12; r++) {
        const y = sy + r * pitch;
        const sig = (r === 5 || r === 11);
        const hl = sig ? A(1, 0.4, r === 11 ? 0.5 : 0) : 0;
        if (hl > 0) {
          rr(ctx, 140, y - 4, 470, sz + 8, 8);
          ctx.fillStyle = hexA(CAS, 0.12 * hl);
          ctx.fill();
          ctx.strokeStyle = hexA(CAS, 0.6 * hl);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        text(ctx, 'F' + (r + 1), 200, y + 25, { size: 17, weight: 700, align: 'right', color: sig && hl > 0.5 ? CAS : C.mute, fam: 'mono' });
        for (let b = 0; b < 8; b++) {
          const x = sx + b * 42;
          const robbed = sig && b === 7 && A(2, 0.4, r === 11 ? 0.6 : 0.1) > 0.5;
          rr(ctx, x, y, sz, sz, 6);
          ctx.fillStyle = robbed ? CAS : hexA(VOICE, 0.13);
          ctx.fill();
          ctx.strokeStyle = robbed ? CAS : hexA(VOICE, 0.55);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          const bit = robbed ? (r === 5 ? 'A' : 'B') : (hash(r * 8 + b + Math.floor(t * 2)) > 0.5 ? '1' : '0');
          text(ctx, bit, x + sz / 2, y + 25, { size: 17, weight: 700, align: 'center', color: robbed ? '#1b1204' : hexA(C.ink, 0.6), fam: 'mono' });
        }
      }
    });
    // thief in the middle
    withA(ctx, A(0, 0.6, 0.4), () => {
      const grab = A(2, 0.4);
      CH.thief(ctx, 880, 400, 1.05, t, { bag: grab > 0.5 ? 'A B' : 'LSB' });
      tag(ctx, 880, 530, '位元小偷', 'Bit Thief', C.pink);
      if (grab > 0) {
        for (const r of [5, 11]) {
          const y0 = sy + r * pitch + sz / 2;
          arrow(ctx, 596, y0, 800, 430, hexA(CAS, 0.7), grab, { w: 2.5, dash: [8, 6], head: 12 });
        }
      }
    });
    // ESF stack
    const ex = 1250, ey = 196, esz = 19, ep = 23;
    withA(ctx, A(3, 0.5), () => {
      text(ctx, 'ESF 延伸超訊框', 1150, 160, { size: 28, weight: 900, color: C.ink });
      text(ctx, 'Extended superframe · 24 frames', 1150, 186, { size: 17, weight: 500, color: C.mute });
      for (let r = 0; r < 24; r++) {
        const y = ey + 14 + r * ep;
        const sig = (r + 1) % 6 === 0;
        const on = sig && A(3, 0.4, 0.5 + ((r + 1) / 6) * 0.35) > 0.5;
        text(ctx, 'F' + (r + 1), ex - 12, y + 15, { size: 13, weight: 700, align: 'right', color: on ? CAS : C.dim, fam: 'mono' });
        for (let b = 0; b < 8; b++) {
          const x = ex + b * 26;
          const robbed = on && b === 7;
          rr(ctx, x, y, esz, esz, 4);
          ctx.fillStyle = robbed ? CAS : hexA(VOICE, 0.12);
          ctx.fill();
          ctx.strokeStyle = robbed ? CAS : hexA(VOICE, 0.45);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (on) {
          const L = 'ABCD'[(r + 1) / 6 - 1];
          arrow(ctx, ex + 8 * 26 + 2, y + 9, ex + 8 * 26 + 44, y + 9, CAS, 1, { w: 2, head: 9 });
          text(ctx, L, ex + 8 * 26 + 62, y + 17, { size: 24, weight: 800, align: 'center', color: CAS, fam: 'disp' });
          text(ctx, `bit ${L}`, ex + 8 * 26 + 82, y + 15, { size: 14, weight: 500, color: C.mute, fam: 'mono' });
        }
      }
    });
    withA(ctx, A(4, 0.6), () => {
      text(ctx, '位元竊取', 880, 640, { size: 50, weight: 900, align: 'center', color: C.ink, glow: C.pink, glowBlur: 24 });
      text(ctx, 'Robbed-Bit Signaling', 880, 680, { size: 26, weight: 700, align: 'center', color: C.pink, fam: 'disp' });
    });
    withA(ctx, A(5, 0.5), () => {
      tag(ctx, 380, 812, '語音：幾乎聽不出差別', 'Voice: barely noticeable', C.teal, 1, { anchor: 'middle' });
      // data meter
      const bx = 1010, by = 790, bw = 560, bh = 34;
      text(ctx, '資料 Data', bx - 16, by + 26, { size: 22, weight: 800, align: 'right', color: C.ink });
      rr(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = '#101b36'; ctx.fill();
      const k = easeOut(A(5, 1.2, 0.3));
      rr(ctx, bx, by, bw * lerp(1, 7 / 8, k), bh, 8);
      ctx.fillStyle = hexA(C.teal, 0.8); ctx.fill();
      rr(ctx, bx + bw * 7 / 8, by, bw / 8, bh, 0);
      ctx.fillStyle = hexA(CAS, 0.55 * k); ctx.fill();
      text(ctx, k > 0.5 ? '56 kbps' : '64 kbps', bx + 20, by + 25, { size: 20, weight: 800, color: '#07141a', fam: 'mono' });
      text(ctx, '−8k', bx + bw * 15 / 16, by + 24, { size: 16, weight: 800, align: 'center', color: '#1b1204', fam: 'mono' });
    });
  };

  SCENES.e1cas = function (S) {
    const { ctx, t, A, P, cue } = S;
    const aA = 1 - A(4, 0.5), aB = A(4, 0.6, 0.25);
    withA(ctx, aA, () => {
      // mini E1 frame
      withA(ctx, A(0, 0.5, -0.3), () => {
        text(ctx, 'E1 訊框 frame', 150, 168, { size: 20, weight: 700, color: C.mute });
        for (let i = 0; i < 32; i++) {
          const col = i === 0 ? SYNC : i === 16 ? CAS : VOICE;
          rr(ctx, 290 + i * 17, 150, 14, 24, 3);
          ctx.fillStyle = hexA(col, i === 16 ? 1 : 0.35);
          ctx.fill();
        }
        const tx = 290 + 16 * 17 + 7;
        arrow(ctx, tx, 180, tx, 214, CAS, A(0, 0.5, 0.4), { w: 2.5, head: 10 });
      });
      // multiframe table
      const tx0 = 300, ty0 = 234, rp = 34;
      withA(ctx, A(0, 0.5, 0.6), () => {
        text(ctx, 'TS16 · 16 訊框多訊框', 360, 226, { size: 17, weight: 700, color: CAS });
        for (let r = 0; r < 16; r++) {
          const ra = r === 0 ? A(1, 0.4) : clamp((S.lt - cue(1) - 0.6 - r * 0.07) / 0.3);
          const y = ty0 + 12 + r * rp;
          withA(ctx, Math.max(0.25, ra), () => {
            text(ctx, 'F' + r, tx0, y + 21, { size: 16, weight: 700, color: r === 0 ? SYNC : C.mute, fam: 'mono' });
            for (let g = 0; g < 2; g++) for (let b = 0; b < 4; b++) {
              const x = 350 + g * 190 + b * 42;
              const col = r === 0 ? SYNC : CAS;
              rr(ctx, x, y, 36, 28, 5);
              ctx.fillStyle = hexA(col, r === 0 ? 0.25 : 0.22);
              ctx.fill();
              ctx.strokeStyle = hexA(col, 0.7);
              ctx.lineWidth = 1.2;
              ctx.stroke();
              const ch = r === 0 ? (g === 0 ? '0' : 'xyxx'[b]) : 'ABCD'[b];
              text(ctx, ch, x + 18, y + 20, { size: 15, weight: 800, align: 'center', color: r === 0 ? SYNC : CAS, fam: 'mono' });
            }
            const mapA = A(3, 0.4, r * 0.04);
            if (r === 0) text(ctx, 'MFAS', 730, y + 20, { size: 16, weight: 800, color: SYNC, fam: 'mono' });
            else withA(ctx, Math.max(0.35, mapA), () => text(ctx, `TS${r} · TS${r + 16}`, 730, y + 20, { size: 15, weight: 700, color: mapA > 0.5 ? C.ink : C.mute, fam: 'mono' }));
          });
        }
      });
      // explanation cards
      const card = (y, a, col, zh, en, big) => withA(ctx, a, () => {
        panel(ctx, 960, y, 840, big ? 118 : 100, col);
        text(ctx, zh, 996, y + (big ? 54 : 44), { size: big ? 40 : 28, weight: 900, color: big ? col : C.ink, fam: big ? 'disp' : 'sans' });
        text(ctx, en, 996, y + (big ? 92 : 78), { size: 18, weight: 500, color: C.mute });
      });
      card(206, A(0, 0.5, 0.2), CAS, 'TS16 = 信令時槽', 'Timeslot 16 carries the signaling bits');
      card(326, A(1, 0.5), SYNC, '16 個訊框 = 1 個多訊框', 'F0 carries the multiframe alignment signal (MFAS)');
      card(446, A(2, 0.5), CAS, '15 frames × 2 = 30 路', 'Each frame: ABCD for two channels', true);
      card(584, A(3, 0.5), C.teal, '位置固定對應通道 → 仍是 CAS', 'Each bit group maps to one fixed channel');
    });
    // ---- R2 ----
    withA(ctx, aB, () => {
      CH.pbx(ctx, 210, 470, 0.9, t);
      CH.co(ctx, 1710, 490, 0.85, t);
      tag(ctx, 210, 592, '阿交', 'PBX', C.violet);
      tag(ctx, 1710, 592, '電信局', 'Central Office', C.cyan);
      text(ctx, 'MFC-R2', 960, 172, { size: 44, weight: 700, align: 'center', color: C.ink, fam: 'disp' });
      // line signaling lane
      lane(ctx, 340, 1580, 320, CAS, t, { wave: false, h: 44 });
      tag(ctx, 960, 240, '線路信令：TS16 的 ABCD 位元', 'Line signaling: ABCD bits in TS16', CAS, A(4, 0.5, 0.3));
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.2 + i / 3) % 1;
        const dir = i % 2 === 0;
        const x = dir ? lerp(360, 1500, k) : lerp(1500, 360, k);
        rr(ctx, x, 304, 60, 32, 6);
        ctx.fillStyle = CAS; ctx.fill();
        text(ctx, dir ? '1 0' : '1 1', x + 30, 327, { size: 16, weight: 800, align: 'center', color: '#1b1204', fam: 'mono' });
      }
      // register signaling (compelled)
      withA(ctx, A(5, 0.5), () => {
        lane(ctx, 340, 1580, 470, VOICE, t, { wave: false, h: 44 });
        const cyc = 2.4, k = (S.lt % cyc) / cyc;
        const fwd = k < 0.5, kk = fwd ? k / 0.5 : (k - 0.5) / 0.5;
        const x = fwd ? lerp(380, 1480, easeInOut(kk)) : lerp(1480, 380, easeInOut(kk));
        const col = fwd ? C.teal : C.cyan;
        ctx.fillStyle = hexA(col, 0.9);
        ctx.shadowColor = col; ctx.shadowBlur = 16;
        rr(ctx, x, 452, 100, 36, 18); ctx.fill();
        ctx.shadowBlur = 0;
        text(ctx, fwd ? 'Group I' : 'Group A', x + 50, 476, { size: 15, weight: 800, align: 'center', color: '#05121a', fam: 'mono' });
        arrow(ctx, 700, 530, 1060, 530, C.teal, 1, { w: 2.5 });
        text(ctx, '前向 Forward', 880, 560, { size: 18, weight: 700, align: 'center', color: C.teal });
        arrow(ctx, 1220, 530, 860 + 400, 530, C.cyan, 0);
        arrow(ctx, 1300, 590, 940, 590, C.cyan, 1, { w: 2.5 });
        text(ctx, '後向 Backward', 1120, 620, { size: 18, weight: 700, align: 'center', color: C.cyan });
        tag(ctx, 960, 668, '記錄器信令：語音通道內的多頻互控音', 'Register signaling: compelled MF tones, in-band', C.teal, 1);
        tag(ctx, 960, 764, '互控：前向音一直送，直到收到後向音回應', 'Compelled: each tone holds until the other side answers', C.mute, A(5, 0.5, 1.2), { zs: 20 });
      });
    });
  };

  SCENES.ccs = function (S) {
    const { ctx, t, A, P, cue } = S;
    const aA = 1 - A(3, 0.5), aB = A(3, 0.5, 0.25) * (1 - A(5, 0.5)), aC = A(5, 0.6, 0.25);
    withA(ctx, aA * A(0, 0.6, -0.4), () => {
      CH.pbx(ctx, 210, 470, 0.9, t);
      CH.co(ctx, 1710, 490, 0.85, t);
      tag(ctx, 210, 592, '阿交', 'PBX', C.violet);
      tag(ctx, 1710, 592, '電信局', 'Central Office', C.cyan);
      const dLabelA = A(2, 0.5);
      lane(ctx, 340, 1580, 300, CCS, t, { wave: false, h: 44 });
      withA(ctx, 1 - dLabelA, () => text(ctx, '專用信令通道 Dedicated signaling channel', 360, 262, { size: 20, weight: 700, color: CCS }));
      withA(ctx, dLabelA, () => text(ctx, 'D 通道 · D channel (ISDN PRI)', 360, 262, { size: 22, weight: 800, color: CCS }));
      const k = (Math.sin(t * 0.7) + 1) / 2;
      const cx = lerp(760, 1380, k);
      const msgs = ['SETUP', 'ALERTING', 'CONNECT', 'DISCONNECT'];
      CH.courier(ctx, cx, 238, 0.8, t, { msg: '' });
      text(ctx, msgs[Math.floor(t / 2.2) % 4], cx, 350, { size: 16, weight: 800, align: 'center', color: CCS, fam: 'mono' });
      tag(ctx, cx, 140, 'D 通道信差', 'D-Channel Courier', CCS, A(0, 0.5, 0.8), { zs: 18, es: 13 });
      for (let i = 0; i < 5; i++) lane(ctx, 340, 1580, 410 + i * 62, VOICE, t, { phase: i * 1.7, h: 30 });
      tag(ctx, 960, 724, 'B 通道：純語音', 'B channels: bearer (voice only)', VOICE, A(0, 0.5, 1.2));
      // structured message card
      withA(ctx, A(1, 0.5) * (1 - A(2, 0.5, 0.8)), () => {
        panel(ctx, 640, 400, 640, 250, CCS);
        text(ctx, 'Q.931  SETUP', 680, 450, { size: 30, weight: 700, color: CCS, fam: 'mono' });
        const rows = [['Called Party', '2100', '被叫號碼'], ['Calling Party', '5550142', '來電號碼'], ['Channel ID', 'B5', '使用通道'], ['Bearer', 'Speech', '承載類型']];
        rows.forEach((r, i) => {
          const y = 496 + i * 38;
          text(ctx, r[0], 680, y, { size: 20, weight: 700, color: C.mute, fam: 'mono' });
          text(ctx, r[1], 920, y, { size: 20, weight: 700, color: C.ink, fam: 'mono' });
          text(ctx, r[2], 1240, y, { size: 18, weight: 700, align: 'right', color: C.dim });
        });
      });
    });
    withA(ctx, aB, () => {
      const row = (y, n, dAt, title, sub) => {
        text(ctx, title, 150, y - 26, { size: 34, weight: 700, color: C.ink, fam: 'disp' });
        text(ctx, sub, 150 + measure(ctx, title, 34, 700, 'disp') + 18, y - 28, { size: 20, weight: 600, color: C.mute });
        const w = n === 24 ? 64 : 48, g = 4, x0 = n === 24 ? 150 : 128;
        for (let i = 0; i < n; i++) {
          const ts = n === 24 ? i + 1 : i;
          const isD = ts === dAt, isS = n === 32 && ts === 0;
          const col = isD ? CCS : isS ? SYNC : VOICE;
          car(ctx, x0 + i * (w + g), y, w, 58, col, isD ? 'D' : isS ? 'S' : 'B', { fs: 18, strong: isD, glow: isD });
        }
        const dx = x0 + (n === 24 ? dAt - 1 : dAt) * (w + g) + w / 2;
        return dx;
      };
      withA(ctx, A(3, 0.5), () => {
        const dx = row(290, 24, 24, 'T1 PRI = 23B + D', '23 條 B 通道 + 1 條 D 通道');
        tag(ctx, dx - 60, 370, 'D = 時槽 24', 'Timeslot 24', CCS);
      });
      withA(ctx, A(4, 0.5), () => {
        const dx = row(560, 32, 16, 'E1 PRI = 30B + D', '30 條 B 通道 + 1 條 D 通道');
        tag(ctx, dx, 640, 'D = 時槽 16', 'Timeslot 16', CCS);
        tag(ctx, 128 + 24, 640, 'TS0 同步', 'Alignment', SYNC, 1, { align: 'left' });
      });
    });
    withA(ctx, aC, () => {
      text(ctx, 'SS7 · Signaling System No. 7', 960, 170, { size: 34, weight: 700, align: 'center', color: C.ink, fam: 'disp' });
      const A1 = [420, 520], B1 = [1500, 520], S1 = [760, 290], S2 = [1160, 290];
      ctx.strokeStyle = hexA(CCS, 0.7);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 30;
      for (const [a, b] of [[A1, S1], [A1, S2], [B1, S1], [B1, S2], [S1, S2]]) {
        ctx.beginPath(); ctx.moveTo(a[0], a[1] - 150); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const [sx, sy] of [S1, S2]) {
        ctx.beginPath(); ctx.arc(sx, sy, 34, 0, 7);
        ctx.fillStyle = '#0e2346'; ctx.fill();
        ctx.strokeStyle = CCS; ctx.lineWidth = 3; ctx.stroke();
        text(ctx, 'STP', sx, sy + 7, { size: 20, weight: 700, align: 'center', color: CCS, fam: 'disp' });
      }
      tag(ctx, 960, 206, 'SS7 信令網路', 'Separate signaling network', CCS, 1, { zs: 20 });
      CH.co(ctx, A1[0], A1[1], 0.8, t);
      CH.co(ctx, B1[0], B1[1], 0.8, t + 0.5);
      tag(ctx, A1[0], 610, '電信局 A', 'Carrier switch', C.cyan, 1, { zs: 20 });
      tag(ctx, B1[0], 610, '電信局 B', 'Carrier switch', C.cyan, 1, { zs: 20 });
      lane(ctx, 520, 1400, 560, VOICE, t, { h: 40 });
      text(ctx, '話路中繼 Voice trunks', 960, 612, { size: 20, weight: 700, align: 'center', color: VOICE });
      withA(ctx, A(6, 0.5), () => {
        tag(ctx, 640, 700, 'D 通道 / SS7 ≈ SIP', 'Signaling', CCS, 1, { zs: 26 });
        text(ctx, '+', 960, 742, { size: 40, weight: 700, align: 'center', color: C.mute });
        tag(ctx, 1280, 700, 'B 通道 ≈ RTP', 'Media', VOICE, 1, { zs: 26 });
      });
    });
  };

  SCENES.q931 = function (S) {
    const { ctx, t, A, P, cue } = S;
    // protocol stack
    const layers = [
      ['Layer 3 · Q.931', '通話控制 Call control', CCS],
      ['Layer 2 · Q.921 (LAPD)', '可靠鏈路 Reliable link', C.violet],
      ['Layer 1 · T1 / E1', '實體層 Physical', C.teal],
    ];
    layers.forEach((L, i) => {
      const a = A(0, 0.5, i * 0.5);
      withA(ctx, a, () => {
        ctx.translate(-(1 - easeOut(a)) * 30, 0);
        rr(ctx, 110, 170 + i * 92, 470, 80, 12);
        ctx.fillStyle = hexA(L[2], 0.12); ctx.fill();
        ctx.strokeStyle = L[2]; ctx.lineWidth = 2; ctx.stroke();
        text(ctx, L[0], 134, 204 + i * 92, { size: 24, weight: 700, color: L[2], fam: 'mono' });
        text(ctx, L[1], 134, 234 + i * 92, { size: 18, weight: 600, color: C.mute });
      });
    });
    // info card: SETUP IEs, later cause codes
    const ie = A(1, 0.5) * (1 - A(5, 0.4)), cause = A(5, 0.5, 0.3);
    withA(ctx, ie, () => {
      panel(ctx, 110, 470, 470, 330, CCS);
      text(ctx, 'SETUP 攜帶的資訊元素', 136, 514, { size: 22, weight: 800, color: C.ink });
      text(ctx, 'Information Elements', 136, 540, { size: 16, weight: 500, color: C.mute });
      [['Called Party Number', '被叫號碼'], ['Channel ID', '使用哪條 B 通道'], ['Bearer Capability', '承載能力（語音/數據）'], ['Calling Party Number', '來電號碼']]
        .forEach((r, i) => {
          text(ctx, r[0], 136, 588 + i * 54, { size: 19, weight: 700, color: CCS, fam: 'mono' });
          text(ctx, r[1], 136, 612 + i * 54, { size: 16, weight: 500, color: C.mute });
        });
    });
    withA(ctx, cause, () => {
      panel(ctx, 110, 470, 470, 330, C.pink);
      text(ctx, 'Cause Code 拆線原因', 136, 514, { size: 22, weight: 800, color: C.ink });
      text(ctx, 'ITU-T Q.850 cause values', 136, 540, { size: 16, weight: 500, color: C.mute });
      [['16', 'Normal call clearing', '正常拆線'], ['17', 'User busy', '使用者忙線'], ['1', 'Unallocated number', '空號'], ['34', 'No circuit available', '無可用電路']]
        .forEach((r, i) => {
          text(ctx, r[0], 158, 594 + i * 52, { size: 26, weight: 700, align: 'center', color: C.pink, fam: 'disp' });
          text(ctx, r[1], 196, 588 + i * 52, { size: 18, weight: 700, color: C.ink, fam: 'mono' });
          text(ctx, r[2], 196, 610 + i * 52, { size: 15, weight: 500, color: C.mute });
        });
    });
    // ladder
    const L = 780, R = 1640;
    withA(ctx, A(0, 0.6, 0.6), () => {
      tag(ctx, L, 150, '語音閘道 · 使用者端', 'Gateway · user side', C.teal, 1, { zs: 20 });
      tag(ctx, R, 150, '電信局 · 網路端', 'CO · network side', C.cyan, 1, { zs: 20 });
      for (const x of [L, R]) {
        ctx.strokeStyle = hexA(C.mute, 0.45);
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 7]);
        ctx.beginPath(); ctx.moveTo(x, 222); ctx.lineTo(x, 830); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    const msgs = [
      ['SETUP', 1, 1, 0, CCS, 262],
      ['CALL PROCEEDING', -1, 2, 0, CCS, 322],
      ['ALERTING', -1, 2, 0.5, CCS, 382],
      ['CONNECT', -1, 3, 0, C.green, 442],
      ['CONNECT ACK', 1, 3, 0.5, C.green, 502],
      ['DISCONNECT', 1, 4, 0, C.pink, 632],
      ['RELEASE', -1, 4, 0.33, C.pink, 692],
      ['RELEASE COMPLETE', 1, 4, 0.66, C.pink, 752],
    ];
    msgs.forEach(([name, dir, k, frac, col, y]) => {
      const at = cue(k) + (S.end(k) - cue(k)) * frac;
      const p = clamp((S.lt - at) / 0.55);
      if (p <= 0) return;
      const [x0, x1] = dir > 0 ? [L + 6, R - 6] : [R - 6, L + 6];
      arrow(ctx, x0, y, x1, y, col, easeOut(p), { w: 3, glow: true });
      withA(ctx, clamp(p * 2 - 0.4), () => {
        text(ctx, name, (L + R) / 2, y - 12, { size: 20, weight: 800, align: 'center', color: C.ink, fam: 'mono' });
        if (name === 'DISCONNECT') {
          withA(ctx, A(5, 0.4), () => {
            rr(ctx, (L + R) / 2 + 100, y - 34, 132, 28, 14);
            ctx.fillStyle = C.pink; ctx.fill();
            text(ctx, 'Cause 16', (L + R) / 2 + 166, y - 14, { size: 16, weight: 800, align: 'center', color: '#1b0610', fam: 'mono' });
          });
        }
      });
    });
    withA(ctx, A(3, 0.5, 0.9), () => {
      rr(ctx, L + 12, 530, R - L - 24, 64, 10);
      ctx.fillStyle = hexA(C.teal, 0.1); ctx.fill();
      ctx.strokeStyle = hexA(C.teal, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
      for (let x = L + 30; x < R - 30; x += 4) {
        const y = 562 + Math.sin(x / 18 - t * 6) * 12 * Math.sin((x - L) / (R - L) * Math.PI);
        ctx.fillStyle = hexA(C.teal, 0.6);
        ctx.fillRect(x, y, 2, 2);
      }
      text(ctx, '通話中 · 語音走 B 通道', (L + R) / 2, 558, { size: 20, weight: 800, align: 'center', color: C.ink });
      text(ctx, 'Talking · voice on the B channel', (L + R) / 2, 582, { size: 15, weight: 500, align: 'center', color: C.teal });
    });
  };

  SCENES.compare = function (S) {
    const { ctx, A } = S;
    const X = [150, 560, 1165, 1770];
    withA(ctx, A(0, 0.6, -0.2), () => {
      text(ctx, '項目 Item', X[0] + 20, 214, { size: 22, weight: 700, color: C.mute });
      text(ctx, 'CAS 隨路信令', (X[1] + X[2]) / 2, 214, { size: 32, weight: 900, align: 'center', color: CAS });
      text(ctx, 'CCS 共路信令', (X[2] + X[3]) / 2, 214, { size: 32, weight: 900, align: 'center', color: CCS });
      for (const [a, b, col] of [[X[1] + 20, X[2] - 20, CAS], [X[2] + 20, X[3] - 20, CCS]]) {
        const g = ctx.createLinearGradient(a, 0, b, 0);
        g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.5, col); g.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(a, 234, b - a, 3);
      }
    });
    const rows = [
      ['設計', 'Design', ['簡單、相容老設備', 'Simple, legacy-friendly'], ['訊息式協定', 'Message-based protocol']],
      ['資訊量', 'Information', ['有限：狀態位元 + 號碼音頻', 'Limited: state bits + digit tones'], ['豐富：來電號碼、Cause', 'Rich: calling number, cause']],
      ['B 通道頻寬', 'Bearer', ['T1 資料只有 56k', '56k data on T1 (robbed bit)'], ['完整 64k', 'Clear 64 kbps']],
      ['T1 可用路數', 'T1 bearers', ['24', 'all 24 timeslots'], ['23 + D', 'one timeslot for D']],
      ['擴充', 'Scaling', ['每路各自處理', 'Per-channel bits'], ['NFAS：一條 D 控多條 T1', 'One D channel, many T1s']],
    ];
    rows.forEach((r, i) => {
      const a = A(i + 1, 0.5);
      const y = 258 + i * 110;
      withA(ctx, a, () => {
        ctx.translate(0, (1 - easeOut(a)) * 14);
        rr(ctx, X[0], y, X[3] - X[0], 98, 12);
        ctx.fillStyle = i % 2 ? 'rgba(14,26,52,0.72)' : 'rgba(18,32,62,0.72)';
        ctx.fill();
        text(ctx, r[0], X[0] + 24, y + 46, { size: 26, weight: 800, color: C.ink });
        text(ctx, r[1], X[0] + 24, y + 76, { size: 17, weight: 500, color: C.mute });
        const big = i === 3;
        for (const [col, cell, x] of [[CAS, r[2], (X[1] + X[2]) / 2], [CCS, r[3], (X[2] + X[3]) / 2]]) {
          text(ctx, cell[0], x, y + (big ? 52 : 46), { size: big ? 38 : 25, weight: big ? 700 : 800, align: 'center', color: big ? col : C.ink, fam: big ? 'disp' : 'sans' });
          text(ctx, cell[1], x, y + 80, { size: 17, weight: 500, align: 'center', color: hexA(col, 0.9) });
        }
      });
    });
  };

  function terminal(ctx, x, y, w, h, title, lines, typed, o = {}) {
    rr(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(5,10,20,0.94)';
    ctx.fill();
    ctx.strokeStyle = hexA(C.teal, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    rr(ctx, x, y, w, 44, 14);
    ctx.fillStyle = '#0e1b33';
    ctx.fill();
    ctx.fillRect(x, y + 30, w, 14);
    [C.red, C.amber, C.green].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 24 + i * 22, y + 22, 6.5, 0, 7); ctx.fill(); });
    text(ctx, title, x + w / 2, y + 29, { size: 17, weight: 700, align: 'center', color: C.mute, fam: 'mono' });
    const fs = o.fs || 22, lh = o.lh || 38;
    let left = typed;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 8, y + 48, w - 16, h - 56); ctx.clip();
    lines.forEach((L, i) => {
      if (left <= 0) return;
      const full = L.p + L.c;
      const n = Math.min(full.length, Math.floor(left));
      left -= full.length + 6;
      const yy = y + 86 + i * lh;
      const shown = full.slice(0, n);
      const pShown = shown.slice(0, L.p.length), cShown = shown.slice(L.p.length);
      ctx.font = font(fs, 500, 'mono');
      text(ctx, pShown, x + 24, yy, { size: fs, weight: 500, color: L.pc || C.dim, fam: 'mono' });
      const pw = measure(ctx, L.p, fs, 500, 'mono');
      const hl = L.hl && n >= full.length;
      text(ctx, cShown, x + 24 + pw, yy, { size: fs, weight: 700, color: L.color || (hl ? C.amber : C.ink), fam: 'mono' });
      if (n < full.length || (i === lines.length - 1 && n === full.length)) {
        const cw = measure(ctx, shown, fs, 500, 'mono');
        if (Math.floor(o.t * 2.5) % 2 === 0 || n < full.length) {
          ctx.fillStyle = C.teal;
          ctx.fillRect(x + 24 + cw + 2, yy - fs + 4, fs * 0.55, fs);
        }
      }
    });
    ctx.restore();
  }
  // characters typed so far, spread across sentence k
  function typedBy(S, lines, from, to, k, frac = 0.85) {
    let total = 0;
    for (let i = from; i < to; i++) total += (lines[i].p + lines[i].c).length + 6;
    let before = 0;
    for (let i = 0; i < from; i++) before += (lines[i].p + lines[i].c).length + 6;
    return before + total * clamp(S.P(k) / frac);
  }

  SCENES.cfgcas = function (S) {
    const { ctx, t, A, P, cue } = S;
    // checklist
    withA(ctx, A(0, 0.6, -0.2), () => {
      panel(ctx, 100, 150, 640, 670, C.cyan);
      text(ctx, '開通前核對', 132, 204, { size: 32, weight: 900, color: C.ink });
      text(ctx, 'Pre-turn-up checklist · match the far end', 132, 234, { size: 17, weight: 500, color: C.mute });
    });
    const items = [
      ['T1 訊框 Framing', ['SF', 'ESF'], 1, 0],
      ['T1 線路編碼 Line code', ['AMI', 'B8ZS'], 1, 0.45],
      ['E1 CRC4', ['crc4', 'no-crc4'], 2, 0],
      ['E1 線路編碼 Line code', ['HDB3'], 2, 0.5],
      ['時脈來源 Clock source', ['line ← 電信端'], 3, 0],
      ['信令類型 Signaling', ['e&m-wink-start …'], 4, 0],
    ];
    items.forEach(([label, opts, k, off], i) => {
      const a = A(k, 0.45, off * (S.end(k) - cue(k)));
      const y = 266 + i * 90;
      withA(ctx, a, () => {
        ctx.beginPath(); ctx.arc(150, y + 30, 16, 0, 7);
        ctx.fillStyle = hexA(C.green, 0.18); ctx.fill();
        ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(142, y + 30); ctx.lineTo(148, y + 37); ctx.lineTo(159, y + 23);
        ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.stroke();
        text(ctx, label, 184, y + 22, { size: 22, weight: 800, color: C.ink });
        let ox = 184;
        opts.forEach((o) => {
          const w = measure(ctx, o, 18, 700, 'mono') + 24;
          rr(ctx, ox, y + 36, w, 30, 8);
          ctx.fillStyle = hexA(C.cyan, 0.12); ctx.fill();
          ctx.strokeStyle = hexA(C.cyan, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
          text(ctx, o, ox + 12, y + 57, { size: 18, weight: 700, color: C.cyan, fam: 'mono' });
          ox += w + 10;
        });
      });
    });
    // right side: characters negotiating, then terminal
    const aA = 1 - A(4, 0.5), aB = A(4, 0.5, 0.2);
    withA(ctx, aA * A(0, 0.6, 0.3), () => {
      CH.gateway(ctx, 1030, 440, 1.0, t);
      CH.co(ctx, 1600, 470, 0.9, t);
      tag(ctx, 1030, 520, '語音閘道', 'Voice Gateway', C.teal);
      tag(ctx, 1600, 590, '電信局', 'Central Office', C.cyan);
      const chips = ['ESF?', 'B8ZS?', 'CRC4?', 'clock?'];
      chips.forEach((c, i) => {
        const k = ((t * 0.35 + i / 4) % 1);
        const x = lerp(1180, 1480, k), y = 360 - Math.sin(k * Math.PI) * 90;
        withA(ctx, Math.sin(k * Math.PI), () => {
          rr(ctx, x - 44, y - 16, 88, 32, 16);
          ctx.fillStyle = hexA(C.cyan, 0.2); ctx.fill();
          ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.stroke();
          text(ctx, c, x, y + 6, { size: 16, weight: 800, align: 'center', color: C.ink, fam: 'mono' });
        });
      });
      tag(ctx, 1320, 680, '兩端參數必須一致', 'Both ends must match', C.amber, A(0, 0.5, 1));
    });
    const lines = [
      { p: 'gw(config)# ', c: 'controller T1 0/1/0' },
      { p: 'gw(config-controller)# ', c: 'framing esf' },
      { p: 'gw(config-controller)# ', c: 'linecode b8zs' },
      { p: 'gw(config-controller)# ', c: 'clock source line' },
      { p: 'gw(config-controller)# ', c: 'ds0-group 0 timeslots 1-24', hl: true },
      { p: '   ', c: '  type e&m-wink-start', hl: true },
      { p: '', c: '! 自動產生 voice-port 0/1/0:0', color: C.dim },
      { p: 'gw(config)# ', c: 'dial-peer voice 100 pots' },
      { p: 'gw(config-dial-peer)# ', c: 'destination-pattern 9T' },
      { p: 'gw(config-dial-peer)# ', c: 'port 0/1/0:0', hl: true },
    ];
    withA(ctx, aB, () => {
      const typed = S.lt < cue(5) ? typedBy(S, lines, 0, 6, 4) : typedBy(S, lines, 6, 10, 5, 0.8);
      terminal(ctx, 780, 150, 1030, 670, 'voice-gateway · Cisco IOS', lines, typed, { t, fs: 21, lh: 40 });
      tag(ctx, 1070, 700, 'ds0-group = 時槽 + 信令類型', 'Timeslots + signaling type', CAS, A(4, 0.5, 1.5), { zs: 20 });
      tag(ctx, 1520, 700, 'dial-peer ─ port ─▶ voice-port', 'Route calls to the CAS trunk', C.teal, A(5, 0.5, 1.5), { zs: 20 });
    });
  };

  SCENES.cfgpri = function (S) {
    const { ctx, t, A, P, cue } = S;
    const aA = 1 - A(3, 0.5), aB = A(3, 0.5, 0.2) * (1 - A(6, 0.5)), aC = A(6, 0.6, 0.25);
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
    withA(ctx, aA * A(0, 0.5, -0.4), () => {
      let typed;
      if (S.lt < cue(1)) typed = typedBy(S, cfg, 0, 1, 0, 0.6);
      else if (S.lt < cue(2)) typed = typedBy(S, cfg, 1, 6, 1, 0.9);
      else typed = typedBy(S, cfg, 6, 9, 2, 0.8);
      terminal(ctx, 100, 150, 1150, 670, 'voice-gateway · T1 PRI', cfg, typed, { t, fs: 22, lh: 44 });
      withA(ctx, A(0, 0.5, 0.8), () => {
        panel(ctx, 1290, 150, 530, 250, C.cyan);
        text(ctx, '常見 switch-type', 1320, 196, { size: 22, weight: 800, color: C.ink });
        text(ctx, 'Must match the carrier / PBX', 1320, 222, { size: 16, weight: 500, color: C.mute });
        ['primary-ni', 'primary-5ess', 'primary-dms100', 'primary-net5', 'primary-qsig'].forEach((s, i) => {
          const cx = 1320 + (i % 2) * 245, cy = 252 + Math.floor(i / 2) * 44;
          rr(ctx, cx, cy, 230, 34, 8);
          ctx.fillStyle = hexA(C.cyan, i === 0 ? 0.25 : 0.1); ctx.fill();
          ctx.strokeStyle = hexA(C.cyan, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
          text(ctx, s, cx + 115, cy + 23, { size: 17, weight: 700, align: 'center', color: C.cyan, fam: 'mono' });
        });
      });
      withA(ctx, A(2, 0.5, 0.3), () => {
        panel(ctx, 1290, 430, 530, 390, CCS);
        text(ctx, 'D 通道介面', 1320, 476, { size: 24, weight: 900, color: C.ink });
        text(ctx, 'The D channel appears as a serial interface', 1320, 502, { size: 15, weight: 500, color: C.mute });
        const row = (y, a, b, c) => {
          text(ctx, a, 1320, y, { size: 26, weight: 700, color: C.cyan, fam: 'disp' });
          text(ctx, b, 1420, y, { size: 22, weight: 700, color: C.ink, fam: 'mono' });
          text(ctx, c, 1420, y + 28, { size: 16, weight: 500, color: C.mute });
        };
        row(566, 'T1', 'Serial0/1/0:23', '時槽 24 = D · pri-group timeslots 1-24');
        row(660, 'E1', 'Serial0/1/0:15', '時槽 16 = D · pri-group timeslots 1-31');
        text(ctx, '介面編號從 0 起算 · numbering starts at 0', 1320, 772, { size: 16, weight: 600, color: C.dim });
      });
    });
    const out = [
      { p: 'gw# ', c: 'show isdn status', pc: C.teal },
      { p: '', c: 'ISDN Serial0/1/0:23 interface', color: C.ink },
      { p: '', c: '  dsl 0, interface ISDN Switchtype = primary-ni', color: C.mute },
      { p: '', c: 'Layer 1 Status:', color: C.mute },
      { p: '', c: '  ACTIVE', color: C.green },
      { p: '', c: 'Layer 2 Status:', color: C.mute },
      { p: '', c: '  TEI = 0, Ces = 1, SAPI = 0,', color: C.mute },
      { p: '', c: '  State = MULTIPLE_FRAME_ESTABLISHED', color: C.green },
      { p: '', c: 'Layer 3 Status:', color: C.mute },
      { p: '', c: '  0 Active Layer 3 Call(s)', color: C.mute },
    ];
    withA(ctx, aB, () => {
      const typed = typedBy(S, out, 0, out.length, 3, 0.55) * 1.0;
      terminal(ctx, 100, 150, 1150, 670, 'verify · show isdn status', out, typed, { t, fs: 22, lh: 44 });
      withA(ctx, A(3, 0.5, 2.2), () => {
        ctx.strokeStyle = C.green; ctx.lineWidth = 2.5;
        ctx.shadowColor = C.green; ctx.shadowBlur = 14;
        rr(ctx, 118, 150 + 86 + 7 * 44 - 32, 690, 44, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;
        tag(ctx, 1020, 150 + 86 + 7 * 44 - 60, '第二層建立完成', 'Layer 2 is up', C.green, 1, { zs: 20 });
      });
      withA(ctx, A(4, 0.5), () => {
        panel(ctx, 1290, 150, 530, 300, C.amber);
        text(ctx, 'Slips 時脈滑移', 1320, 200, { size: 26, weight: 900, color: C.amber });
        text(ctx, '→ 多半是時脈來源不一致', 1320, 244, { size: 21, weight: 700, color: C.ink });
        text(ctx, 'Usually mismatched clock sources', 1320, 272, { size: 16, weight: 500, color: C.mute });
        text(ctx, 'show controllers t1 0/1/0', 1320, 322, { size: 19, weight: 700, color: C.cyan, fam: 'mono' });
        text(ctx, '檢查 slips 與告警計數', 1320, 350, { size: 17, weight: 600, color: C.mute });
        text(ctx, 'clock source line  (跟隨電信端)', 1320, 400, { size: 18, weight: 700, color: C.teal, fam: 'mono' });
      });
      withA(ctx, A(5, 0.5), () => {
        panel(ctx, 1290, 480, 530, 340, C.violet);
        text(ctx, '即時觀察 Debug', 1320, 530, { size: 26, weight: 900, color: C.ink });
        text(ctx, 'CAS', 1320, 590, { size: 22, weight: 700, color: CAS, fam: 'disp' });
        text(ctx, 'debug vpm signal', 1320, 622, { size: 21, weight: 700, color: C.ink, fam: 'mono' });
        text(ctx, '看 ABCD 位元變化 · bit transitions', 1320, 650, { size: 16, weight: 500, color: C.mute });
        text(ctx, 'PRI', 1320, 712, { size: 22, weight: 700, color: CCS, fam: 'disp' });
        text(ctx, 'debug isdn q931', 1320, 744, { size: 21, weight: 700, color: C.ink, fam: 'mono' });
        text(ctx, '看 SETUP / CONNECT / Cause', 1320, 772, { size: 16, weight: 500, color: C.mute });
      });
    });
    withA(ctx, aC, () => {
      const card = (x, col, title, zh, en, fn) => {
        panel(ctx, x, 170, 760, 440, col);
        text(ctx, title, x + 380, 236, { size: 44, weight: 700, align: 'center', color: col, fam: 'disp' });
        text(ctx, zh, x + 380, 548, { size: 28, weight: 900, align: 'center', color: C.ink });
        text(ctx, en, x + 380, 584, { size: 18, weight: 500, align: 'center', color: C.mute });
        fn(x);
      };
      card(160, CAS, 'CAS', '信令跟著每個通道走', 'Signaling rides every channel', (x) => {
        for (let i = 0; i < 4; i++) {
          const y = 300 + i * 50;
          lane(ctx, x + 60, x + 700, y, VOICE, t, { phase: i, h: 30 });
          const bx = lerp(x + 80, x + 620, (t * 0.2 + i * 0.3) % 1);
          rr(ctx, bx, y - 13, 40, 26, 6);
          ctx.fillStyle = CAS; ctx.fill();
        }
      });
      card(1000, CCS, 'CCS', '信令集中在專用通道', 'Signaling on one dedicated channel', (x) => {
        lane(ctx, x + 60, x + 700, 300, CCS, t, { wave: false, h: 30 });
        for (let i = 0; i < 3; i++) envelope(ctx, lerp(x + 90, x + 670, (t * 0.2 + i / 3) % 1), 300, 34, 22, CCS);
        for (let i = 1; i < 4; i++) lane(ctx, x + 60, x + 700, 300 + i * 50, VOICE, t, { phase: i + 2, h: 30 });
      });
      withA(ctx, A(7, 0.6), () => {
        text(ctx, '兩端參數對齊 · Match both ends', 960, 690, { size: 30, weight: 800, align: 'center', color: C.amber });
        text(ctx, '謝謝收看', 960, 780, { size: 60, weight: 900, align: 'center', color: C.ink, glow: C.cyan, glowBlur: 26 });
        text(ctx, 'THANKS FOR WATCHING', 960, 822, { size: 22, weight: 700, align: 'center', color: C.cyan, fam: 'disp', ls: 8 });
      });
    });
  };

  // ---------- overlays ----------
  function chapterCard(ctx, ch, idx, lt, lead, isFirst, data) {
    const out = lead + 0.35;
    if (lt > out) return;
    if (isFirst && lt < lead - 1.6) {
      // main title
      const a = clamp(lt / 0.6) * clamp((lead - 1.6 - lt) / 0.4);
      withA(ctx, a, () => {
        ctx.fillStyle = 'rgba(3,6,14,0.55)';
        ctx.fillRect(0, 0, W, H);
        const k = easeOut(lt / 1.2);
        text(ctx, 'TELEPHONY SIGNALING', 960, 330, { size: 26, weight: 700, align: 'center', color: C.cyan, fam: 'disp', ls: 12 });
        text(ctx, '電話信令 CAS / CCS', 960, 450, { size: 104, weight: 900, align: 'center', color: C.ink, glow: C.cyan, glowBlur: 30 });
        ctx.fillStyle = C.amber;
        ctx.fillRect(960 - 260 * k, 492, 520 * k, 3);
        text(ctx, '原理與設定 · Concepts & Configuration', 960, 560, { size: 34, weight: 700, align: 'center', color: C.ink });
        text(ctx, 'T1 / E1 · Robbed-bit · R2 · ISDN PRI · Cisco IOS', 960, 612, { size: 22, weight: 500, align: 'center', color: C.mute, fam: 'mono' });
        text(ctx, '給網路工程師 · For network engineers', 960, 690, { size: 22, weight: 600, align: 'center', color: C.teal });
      });
      return;
    }
    const st = isFirst ? lead - 1.6 : 0;
    const a = clamp((lt - st) / 0.3) * clamp((out - lt) / 0.45);
    withA(ctx, a, () => {
      ctx.fillStyle = 'rgba(3,6,14,0.6)';
      ctx.fillRect(0, 0, W, H);
      const k = easeOut((lt - st) / 0.7);
      text(ctx, `CHAPTER ${String(idx + 1).padStart(2, '0')}`, 960, 400, { size: 28, weight: 700, align: 'center', color: C.cyan, fam: 'disp', ls: 10 });
      ctx.fillStyle = hexA(C.cyan, 0.8);
      ctx.fillRect(960 - 200 * k, 428, 400 * k, 2);
      text(ctx, ch.zh, 960 + (1 - k) * 40, 530, { size: 88, weight: 900, align: 'center', color: C.ink, glow: C.cyan, glowBlur: 24 });
      text(ctx, ch.en, 960 - (1 - k) * 40, 592, { size: 32, weight: 600, align: 'center', color: C.mute });
    });
  }
  function header(ctx, ch, idx, total) {
    const num = String(idx + 1).padStart(2, '0');
    rr(ctx, 40, 30, 76, 58, 12);
    ctx.fillStyle = hexA(C.cyan, 0.14);
    ctx.fill();
    ctx.strokeStyle = hexA(C.cyan, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, 'CH', 78, 52, { size: 13, weight: 700, align: 'center', color: C.mute, fam: 'disp', ls: 2 });
    text(ctx, num, 78, 79, { size: 26, weight: 700, align: 'center', color: C.cyan, fam: 'disp' });
    text(ctx, ch.zh, 134, 62, { size: 28, weight: 900, color: C.ink });
    text(ctx, ch.en, 134, 88, { size: 17, weight: 500, color: C.mute });
    text(ctx, '電話信令 CAS / CCS', 1880, 58, { size: 18, weight: 700, align: 'right', color: hexA(C.ink, 0.7) });
    text(ctx, `${num} / ${String(total).padStart(2, '0')}`, 1880, 82, { size: 15, weight: 600, align: 'right', color: C.dim, fam: 'mono' });
  }
  function progress(ctx, t, tl) {
    const x0 = 40, x1 = 1880, y = 1050, h = 6, gap = 6;
    const span = x1 - x0 - gap * (tl.chapters.length - 1);
    let x = x0;
    tl.chapters.forEach((c, i) => {
      const w = span * (c.end - c.start) / tl.duration;
      rr(ctx, x, y, w, h, 3);
      ctx.fillStyle = '#18264a';
      ctx.fill();
      const k = clamp((t - c.start) / (c.end - c.start));
      if (k > 0) {
        rr(ctx, x, y, Math.max(h, w * k), h, 3);
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, C.cyan); g.addColorStop(1, C.teal);
        ctx.fillStyle = g;
        ctx.fill();
      }
      if (t >= c.start && t < c.end) {
        ctx.fillStyle = C.ink;
        ctx.shadowColor = C.cyan; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(x + w * k, y + h / 2, 7, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
      x += w + gap;
    });
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    text(ctx, `${fmt(Math.min(t, tl.duration))} / ${fmt(tl.duration)}`, 1880, 1036, { size: 15, weight: 600, align: 'right', color: C.dim, fam: 'mono' });
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
    let zw = showZh ? measure(ctx, s.zh, zs, 700) : 0;
    if (zw > maxW) { zs = Math.floor(zs * maxW / zw); zw = measure(ctx, s.zh, zs, 700); }
    let ew = showEn ? measure(ctx, s.en, es, 500) : 0;
    if (ew > maxW) { es = Math.floor(es * maxW / ew * 10) / 10; ew = measure(ctx, s.en, es, 500); }
    const w = Math.max(zw, ew) + 72;
    const h = (showZh ? zs + 16 : 0) + (showEn ? es + 14 : 0) + 30;
    const bottom = 1014, top = bottom - h;
    withA(ctx, a, () => {
      rr(ctx, 960 - w / 2, top, w, h, 14);
      ctx.fillStyle = 'rgba(3,7,16,0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,170,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      let y = top + 18;
      if (showZh) {
        y += zs;
        text(ctx, s.zh, 960, y - 4, { size: zs, weight: 700, align: 'center', color: '#ffffff' });
        y += 12;
      }
      if (showEn) {
        y += es;
        text(ctx, s.en, 960, y - 2, { size: es, weight: 500, align: 'center', color: '#b9cbef' });
      }
    });
  }

  // ---------- public API ----------
  function create(canvas, data) {
    const ctx = canvas.getContext('2d');
    const tl = data.timeline;
    const byChapter = tl.chapters.map((c, i) => tl.sentences.filter((s) => s.c === i));
    function render(t, opts = {}) {
      const mode = opts.subs || 'both';
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.globalAlpha = 1;
      drawBG(ctx, t);
      let ci = tl.chapters.findIndex((c) => t >= c.start && t < c.end);
      if (ci < 0) ci = t < 0 ? 0 : tl.chapters.length - 1;
      const ch = tl.chapters[ci];
      const lt = t - ch.start;
      const cues = byChapter[ci];
      const cue = (k) => cues[Math.min(k, cues.length - 1)].start - ch.start;
      const end = (k) => cues[Math.min(k, cues.length - 1)].end - ch.start;
      const S = {
        ctx, t, lt, cue, end, dur: ch.end - ch.start,
        A: (k, d = 0.6, off = 0) => easeOut((lt - cue(k) - off) / d),
        P: (k) => clamp((lt - cue(k)) / Math.max(0.1, end(k) - cue(k))),
      };
      // cross-fade out at the chapter end
      const fade = clamp((ch.end - t) / 0.45);
      const fin = ci === tl.chapters.length - 1;
      withA(ctx, fin ? 1 : fade, () => SCENES[ch.id](S));
      chapterCard(ctx, ch, ci, lt, ch.lead, ci === 0, data);
      header(ctx, ch, ci, tl.chapters.length);
      subtitles(ctx, t, tl, mode);
      progress(ctx, t, tl);
    }
    return { render, timeline: tl, W, H, activeSentence: (t) => activeSentence(t, tl) };
  }
  function drawCharacter(ctx, id, x, y, s, t) { CH[id](ctx, x, y, s, t, {}); }
  window.CASCCS = { create, drawCharacter, CHAR_COLOR, W, H, fonts: FONT };
})();
