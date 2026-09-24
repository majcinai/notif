// ==UserScript==
// @name         Konfiguracja łupów – nowe efekty animacji
// @namespace    majcin.margonem.lnfx
// @version      1.4.0
// @description  Nowe efekty animacji i losowy dźwięk (z własnych) w dodatku "Konfiguracja łupów" (Margonem NI)
// @author       Majcin
// @match        https://*.margonem.pl/*
// @exclude      https://www.margonem.pl/*
// @exclude      https://forum.margonem.pl/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/majcinai/notif
// @supportURL   https://github.com/majcinai/notif/issues
// @updateURL    https://raw.githubusercontent.com/majcinai/notif/main/konfiguracja-lupow-efekty.user.js
// @downloadURL  https://raw.githubusercontent.com/majcinai/notif/main/konfiguracja-lupow-efekty.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'lnfx_choice_v1';
  const SOUND_STORE_KEY = 'lnfx_sound_v1';
  const CFG_STORE_KEY = 'lnfx_cfg_v2';
  const PREFIX = '✦ ';
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  const G_FRAME = 'ramka okna łupów';
  const G_AROUND = 'wokół okna łupów';
  const G_SCREEN = 'cały ekran';
  const G_ITEM = 'przedmiot legendarny';
  const G_WIN = 'łup zdobyty';
  const G_LOSE = 'łup utracony';

  /* ---------------------------- pomocnicze: rysowanie ---------------------------- */
  const spriteCache = {};
  function glowSprite(rgb, hot) {
    const key = rgb + (hot ? '|h' : '');
    if (spriteCache[key]) return spriteCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (hot) gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(hot ? 0.18 : 0, `rgba(${rgb},1)`);
    gr.addColorStop(0.4, `rgba(${rgb},0.45)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (spriteCache[key] = c);
  }
  function dot(ctx, rgb, x, y, r, alpha, hot) {
    if (alpha <= 0.003 || r <= 0.2) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glowSprite(rgb, hot), x - r, y - r, r * 2, r * 2);
  }
  function sparkleStar(ctx, x, y, r, alpha) {
    if (alpha <= 0.003 || r <= 0.2) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.strokeStyle = 'rgba(255,255,230,1)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    dot(ctx, '255,230,150', x, y, r * 0.8, alpha, true);
  }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // punkt na obwodzie prostokąta (u = 0..1, zgodnie z ruchem wskazówek zegara) + normalna na zewnątrz
  function perim(b, u, pad = 0) {
    const w = b.w + pad * 2, h = b.h + pad * 2, x0 = b.x - pad, y0 = b.y - pad;
    let d = (((u % 1) + 1) % 1) * 2 * (w + h);
    if (d < w) return { x: x0 + d, y: y0, nx: 0, ny: -1 }; d -= w;
    if (d < h) return { x: x0 + w, y: y0 + d, nx: 1, ny: 0 }; d -= h;
    if (d < w) return { x: x0 + w - d, y: y0 + h, nx: 0, ny: 1 }; d -= w;
    return { x: x0, y: y0 + h - d, nx: -1, ny: 0 };
  }
  function hsl(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const f = n => { const k = (n + h * 12) % 12, q = s * Math.min(l, 1 - l); return Math.round(255 * (l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `${f(0)},${f(8)},${f(4)}`;
  }
  function boltPath(x1, y1, x2, y2, disp, levels = 7) {
    let pts = [[x1, y1], [x2, y2]];
    for (let k = 0; k < levels; k++) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, off = rand(-1, 1) * disp;
        np.push(pts[i], [(ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off]);
      }
      np.push(pts[pts.length - 1]);
      pts = np; disp *= 0.55;
    }
    return pts;
  }
  function strokePts(ctx, pts, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  // proceduralne "runy": pionowa laska + 1–3 odgałęzienia (w siatce 1×2)
  const GLYPHS = (() => {
    const out = [];
    for (let i = 0; i < 28; i++) {
      const sx = pick([0.35, 0.5, 0.65]);
      const segs = [[[sx, 0], [sx, 2]]];
      const n = 1 + ((Math.random() * 3) | 0);
      for (let j = 0; j < n; j++) {
        const y0 = pick([0, 0.5, 1, 1.5]);
        segs.push([[sx, y0], [pick([0, 1]), Math.min(2, Math.max(0, y0 + pick([-0.5, 0.5, 0.7])))]]);
      }
      out.push(segs);
    }
    return out;
  })();
  function glyphPath(ctx, g, x, y, size) {
    for (const [[ax, ay], [bx, by]] of g) {
      ctx.moveTo(x + (ax - 0.5) * size * 0.6, y + (ay - 1) * size * 0.5);
      ctx.lineTo(x + (bx - 0.5) * size * 0.6, y + (by - 1) * size * 0.5);
    }
  }
  const glyphSpriteCache = {};
  function glyphSprite(i, rgb) {
    const key = i + '|' + rgb;
    if (glyphSpriteCache[key]) return glyphSpriteCache[key];
    const c = document.createElement('canvas'); c.width = 20; c.height = 26;
    const g = c.getContext('2d');
    g.strokeStyle = `rgb(${rgb})`; g.lineWidth = 1.8; g.lineCap = 'round';
    g.shadowColor = `rgb(${rgb})`; g.shadowBlur = 4;
    g.beginPath(); glyphPath(g, GLYPHS[i], 10, 13, 18); g.stroke();
    return (glyphSpriteCache[key] = c);
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.7);
    ctx.bezierCurveTo(x - s * 1.2, y - s * 0.05, x - s * 0.6, y - s * 0.95, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 0.95, x + s * 1.2, y - s * 0.05, x, y + s * 0.7);
    ctx.closePath();
  }
  // jakość renderowania: skala rozdzielczości canvasa i rozmycia (auto – obniżana, gdy klatki są za wolne)
  const RENDER = { blur: 1, autoScale: 1 };
  function renderScaleFor(q) {
    const dpr = window.devicePixelRatio || 1;
    if (q === 'high') return Math.min(dpr, 2);
    if (q === 'medium') return 1;
    if (q === 'low') return 0.6;
    return Math.min(dpr, 1) * RENDER.autoScale; // auto
  }
  // poświata ramki: kilka obrysów zamiast shadowBlur (rozmycie na dużym prostokącie jest bardzo kosztowne)
  function glowFrame(ctx, b, rgb, alpha, lw = 3, pad = 2, blur = 16) {
    if (alpha <= 0.003) return;
    ctx.save();
    const prev = ctx.globalCompositeOperation;
    ctx.strokeStyle = `rgb(${rgb})`;
    rrect(ctx, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 6);
    if (blur > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [k, al] of [[1, 0.06], [0.6, 0.1], [0.3, 0.18]]) { ctx.globalAlpha = Math.min(1, alpha * al); ctx.lineWidth = lw + blur * 1.6 * k; ctx.stroke(); }
      ctx.globalCompositeOperation = prev;
    }
    ctx.globalAlpha = Math.min(1, alpha); ctx.lineWidth = lw; ctx.stroke();
    ctx.restore();
  }
  // trzęsienie ekranu gry (sam kontener gry, nasz canvas i panel stoją w miejscu)
  const SHAKE = { el: null, orig: '', active: false };
  function shakeScreen(amount) {
    if (!(amount > 0.3)) return;
    const el = document.querySelector('.game-window-positioner') || document.body;
    if (!SHAKE.el) { SHAKE.el = el; SHAKE.orig = el.style.transform || ''; }
    SHAKE.active = true;
    SHAKE.el.style.transform = `${SHAKE.orig} translate(${rand(-amount, amount).toFixed(1)}px, ${rand(-amount, amount).toFixed(1)}px) rotate(${(rand(-amount, amount) * 0.04).toFixed(2)}deg)`;
  }
  function resetShake() {
    if (SHAKE.el) SHAKE.el.style.transform = SHAKE.orig;
    SHAKE.el = null; SHAKE.active = false;
  }

  /* ---------------------- pomocnicze: efekty po łupie ---------------------- */
  const arcPoint = (a, b, f, h) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * h });
  function burst(arr, p, n, smin, smax, cols) {
    for (let i = 0; i < n; i++) { const an = rand(0, TAU), sp = rand(smin, smax); arr.push({ x: p.x, y: p.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: rand(0.5, 1.1), c: pick(cols) }); }
  }
  function sparksDraw(ctx, arr, dt, a, grav) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = arr.length - 1; i >= 0; i--) {
      const q = arr[i]; q.l += dt; if (q.l > q.m) { arr.splice(i, 1); continue; }
      q.vy += grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      dot(ctx, q.c || '255,210,110', q.x, q.y, 5, a * (1 - q.l / q.m), true);
    }
  }
  function trailDraw(ctx, arr, dt, a, col, r) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = arr.length - 1; i >= 0; i--) {
      const q = arr[i]; q.l += dt; if (q.l > 0.4) { arr.splice(i, 1); continue; }
      dot(ctx, col, q.x, q.y, r * (1 - q.l / 0.4), a * (1 - q.l / 0.4), true);
    }
  }
  function ringFx(ctx, p, tt, L, R, col, a) {
    if (tt <= 0 || tt >= L) return;
    const f = tt / L;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(${col},${(1 - f) * a})`; ctx.lineWidth = 6 * (1 - f) + 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, easeOut(f) * R, 0, TAU); ctx.stroke();
  }
  function glowPulse(ctx, p, tt, a) {
    ctx.globalCompositeOperation = 'lighter';
    dot(ctx, '255,200,90', p.x, p.y, 40 * (1 + 0.15 * Math.sin(tt * 10)), a * clamp01(1 - tt / 1.6) * 0.8);
  }
  function tearDrop(ctx, x, y, z, a) {
    if (z < 0.5 || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.beginPath(); ctx.moveTo(x, y - z * 1.8);
    ctx.bezierCurveTo(x + z * 0.4, y - z * 0.9, x + z, y - z * 0.3, x + z, y + z * 0.2);
    ctx.arc(x, y + z * 0.2, z, 0, Math.PI);
    ctx.bezierCurveTo(x - z, y - z * 0.3, x - z * 0.4, y - z * 0.9, x, y - z * 1.8);
    ctx.fillStyle = '#6fb6ff'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - z * 0.35, y + z * 0.1, z * 0.25, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function sadFace(ctx, x, y, r, a, t, opt = {}) {
    if (r < 1 || a <= 0.01) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(opt.rot || 0); ctx.scale(1, opt.sy || 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fff3a0'); g.addColorStop(0.7, '#ffcf3a'); g.addColorStop(1, '#e59b10');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = '#a8650a'; ctx.stroke();
    ctx.fillStyle = '#3b2405'; ctx.strokeStyle = '#3b2405'; ctx.lineCap = 'round';
    const ly = opt.look ? -r * 0.12 : 0;
    ctx.lineWidth = Math.max(1, r * 0.07);
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * r * 0.14, -r * 0.47 + ly); ctx.lineTo(sd * r * 0.5, -r * 0.32 + ly); ctx.stroke(); }
    if (opt.cry) {
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * r * 0.33, -r * 0.14, r * 0.13, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.22, r * 0.14 * (1 + 0.3 * Math.sin(t * 14)), 0, 0, TAU); ctx.fill();
    } else {
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * r * 0.33, -r * 0.1 + ly, r * 0.09, r * 0.13, 0, 0, TAU); ctx.fill(); }
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(0, r * 0.62, r * 0.34, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      const ty = (t * 0.7) % 1;
      tearDrop(ctx, -r * 0.34, r * 0.05 + ty * r * 0.55, r * 0.11, a * (1 - ty));
    }
    ctx.restore();
  }
  function caption(ctx, text, x, y, a, fs = 24) {
    if (!text || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.font = `bold ${fs}px Georgia, "Times New Roman", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, fs * 0.3); ctx.strokeStyle = 'rgba(10,12,25,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = '#dfe7fb'; ctx.fillText(text, x, y);
    ctx.restore();
  }
  // "szary świat" – filtr na kontenerze gry (przywracany po efekcie)
  const GREY = { el: null, orig: '', active: false };
  function greyScreen(v) {
    if (!(v > 0.01)) return;
    const el = document.querySelector('.game-window-positioner') || document.body;
    if (!GREY.el) { GREY.el = el; GREY.orig = el.style.filter || ''; }
    GREY.active = true;
    GREY.el.style.filter = `${GREY.orig} grayscale(${Math.min(1, v).toFixed(2)}) brightness(${(1 - 0.25 * Math.min(1, v)).toFixed(2)})`;
  }
  function resetGrey() { if (GREY.el) GREY.el.style.filter = GREY.orig; GREY.el = null; GREY.active = false; }


  const clampX = (x, W, S) => Math.max(S * 0.6, Math.min(W - S * 0.6, x));
  function drawBin(ctx, x, y, S, lid, wob, a, dark) {
    if (S < 2 || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.translate(x, y + S * 0.5); ctx.rotate(wob); ctx.translate(0, -S * 0.5);
    const c = dark ? ['#2e2e2e', '#5a5a5a', '#222'] : ['#7d8792', '#c9d1d9', '#6b7480'];
    const g = ctx.createLinearGradient(-S * 0.42, 0, S * 0.42, 0);
    g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[2]);
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-S * 0.42, -S * 0.45); ctx.lineTo(S * 0.42, -S * 0.45); ctx.lineTo(S * 0.34, S * 0.5); ctx.lineTo(-S * 0.34, S * 0.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d444c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(50,56,64,0.55)'; ctx.lineWidth = 3;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * S * 0.14, -S * 0.38); ctx.lineTo(i * S * 0.115, S * 0.44); ctx.stroke(); }
    ctx.fillStyle = dark ? '#1a1a1a' : '#4a525b'; ctx.beginPath(); ctx.ellipse(0, -S * 0.45, S * 0.45, S * 0.06, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(S * 0.45, -S * 0.47); ctx.rotate(-lid); // lid > 0 = otwarta (w górę)
    ctx.fillStyle = dark ? '#3c3c3c' : '#9aa4ae'; ctx.beginPath(); ctx.moveTo(-S * 0.92, 0); ctx.quadraticCurveTo(-S * 0.46, -S * 0.17, 0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3d444c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3d444c'; ctx.fillRect(-S * 0.53, -S * 0.14, S * 0.14, S * 0.05);
    ctx.restore();
    ctx.restore();
  }
  function drawHand(ctx, x, y, s, side, closed, a) {
    if (s < 2 || a <= 0.01) return;
    const rr = (x0, y0, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r); else ctx.rect(x0, y0, w, h); ctx.fill(); };
    ctx.save(); ctx.translate(x, y); ctx.scale(side < 0 ? 1 : -1, 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.shadowColor = 'rgba(170,80,255,0.9)'; ctx.shadowBlur = 18; ctx.fillStyle = '#1b1024';
    ctx.beginPath(); ctx.ellipse(-s * 0.35, 0, s * 0.45, s * 0.38, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const fy = -s * 0.27 + i * s * 0.18, len = s * (0.62 - Math.abs(i - 1.5) * 0.08) * (1 - closed * 0.55);
      rr(-s * 0.05, fy - s * 0.07, len, s * 0.14, s * 0.07);
      if (closed > 0.5) { ctx.beginPath(); ctx.arc(-s * 0.05 + len, fy + s * 0.05, s * 0.08, 0, TAU); ctx.fill(); }
    }
    ctx.save(); ctx.translate(-s * 0.2, -s * 0.3); ctx.rotate(-0.9 + closed * 0.8); rr(0, -s * 0.07, s * 0.42, s * 0.14, s * 0.07); ctx.restore();
    ctx.restore();
  }
  function drawThief(ctx, x, y, s, dir, ph, a) {
    if (s < 2 || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.strokeStyle = '#1c1424'; ctx.fillStyle = '#231a2e'; ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.12;
    for (const k of [1, -1]) { const an = Math.sin(ph) * 0.7 * k; ctx.beginPath(); ctx.moveTo(x, y + s * 0.15); ctx.lineTo(x + Math.sin(an) * s * 0.45, y + s * 0.15 + Math.cos(an) * s * 0.45); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.22); ctx.lineTo(x + s * 0.3, y + s * 0.22); ctx.lineTo(x + s * 0.16, y - s * 0.38); ctx.lineTo(x - s * 0.16, y - s * 0.38); ctx.closePath(); ctx.fill();
    ctx.lineWidth = s * 0.09;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + k * s * 0.14, y - s * 0.3); ctx.lineTo(x + k * s * 0.12 + dir * s * 0.05, y - s * 0.95); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y - s * 0.55, s * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.shadowColor = '#ffd23a'; ctx.shadowBlur = 8;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(x + dir * s * 0.08 + k * s * 0.06, y - s * 0.57, s * 0.03, 0, TAU); ctx.fill(); }
    ctx.restore();
  }


  // grafika złodzieja (animowany sprite 64×64, 67 klatek: 0–44 postać, 44–50 znikanie, 50–55 pojawianie się)
  const THIEF = new Image();
  THIEF.src = 'data:image/png;base64,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';
  const thiefIdle = t => 1 + (Math.floor(t * 10) % 33);
  const thiefVanish = f => 44 + Math.min(6, Math.floor(f * 7));
  const thiefAppear = f => 50 + Math.min(5, Math.floor(f * 6));
  function drawThiefSprite(ctx, x, y, size, frame, flip, a) {
    if (!THIEF.complete || !THIEF.naturalWidth || a <= 0.01 || size < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(THIEF, (frame | 0) * 64, 0, 64, 64, -size / 2, -size, size, size); // zakotwiczenie: środek dołu
    ctx.restore();
  }
  function drawCrown(ctx, x, y, s, a) {
    if (s < 2 || a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.translate(x, y);
    const g = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.2);
    g.addColorStop(0, '#fff3a8'); g.addColorStop(0.5, '#ffc933'); g.addColorStop(1, '#b8740c');
    ctx.fillStyle = g; ctx.strokeStyle = '#7a4a05'; ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath(); ctx.moveTo(-s * 0.5, s * 0.15);
    const pts = [[-0.5, -0.35], [-0.3, -0.05], [-0.15, -0.45], [0, -0.1], [0.15, -0.45], [0.3, -0.05], [0.5, -0.35]];
    for (const [px, py] of pts) ctx.lineTo(px * s, py * s);
    ctx.lineTo(s * 0.5, s * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(-s * 0.52, s * 0.08, s * 1.04, s * 0.14); ctx.strokeRect(-s * 0.52, s * 0.08, s * 1.04, s * 0.14);
    for (const [px, c] of [[-0.3, '#e0115f'], [0, '#2266ff'], [0.3, '#12b865']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px * s, s * 0.15, s * 0.05, 0, TAU); ctx.fill(); }
    for (const [px, py] of [[-0.5, -0.35], [-0.15, -0.45], [0.15, -0.45], [0.5, -0.35]]) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px * s, py * s, s * 0.04, 0, TAU); ctx.fill(); }
    ctx.restore();
  }


  // wiedźma-mimik (sprite 96×96, 60 klatek)
  const WITCH = new Image();
  WITCH.src = 'data:image/png;base64,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';
  function drawWitchSprite(ctx, x, y, size, frame, flip, a) {
    if (!WITCH.complete || !WITCH.naturalWidth || a <= 0.01 || size < 2) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(WITCH, (frame | 0) * 96, 0, 96, 96, -size / 2, -size, size, size);
    ctx.restore();
  }
  // strój gracza z silnika gry (arkusz: 4 kolumny kroków × 4 kierunki; animowane stroje mają kolejne klatki pod spodem)
  function drawCharSprite(ctx, ch, x, feetY, sc, dir, step, t, a) {
    const img = ch && ch.sprite;
    if (!img || !img.complete || !img.naturalWidth || a <= 0.01) return false;
    const fw = ch.fw || 32, fh = ch.fh || 48;
    const row = { S: 0, W: 1, E: 2, N: 3 }[dir] || 0;
    const frames = Math.max(1, Math.floor(img.naturalHeight / (fh * 4)));
    const af = frames > 1 ? Math.floor(t * 10) % frames : 0;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (step % Math.max(1, Math.floor(img.naturalWidth / fw))) * fw, af * fh * 4 + row * fh, fw, fh, x - fw * sc / 2, feetY - fh * sc, fw * sc, fh * sc);
    ctx.restore();
    return true;
  }
  function drawHeroSprite(ctx, x, feetY, sc, dir, step, t, a) {
    let h = null;
    try { h = window.Engine && Engine.hero; } catch (e) { /* ignore */ }
    return drawCharSprite(ctx, h, x, feetY, sc, dir, step, t, a);
  }
  function drawBat(ctx, x, y, len, dir, ang, a) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = Math.min(1, a);
    ctx.translate(x, y); ctx.scale(dir < 0 ? -1 : 1, 1); ctx.rotate(ang);
    const g = ctx.createLinearGradient(-8, 0, 8, 0);
    g.addColorStop(0, '#8a5a2b'); g.addColorStop(0.5, '#d9a765'); g.addColorStop(1, '#7a4a1f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-2.5, 0); ctx.lineTo(-3, -len * 0.35); ctx.quadraticCurveTo(-7, -len * 0.7, -6.5, -len * 0.95);
    ctx.arc(0, -len * 0.95, 6.5, Math.PI, 0);
    ctx.quadraticCurveTo(7, -len * 0.7, 3, -len * 0.35); ctx.lineTo(2.5, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4a2a0e'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#222'; ctx.fillRect(-3, -len * 0.22, 6, len * 0.22);
    ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function vignette(ctx, W, H, rgb, alpha, inner = 0.3) {
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, `rgba(${rgb},0)`);
    v.addColorStop(1, `rgba(${rgb},${alpha})`);
    ctx.globalAlpha = 1; ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function drawItem(ctx, img, x, y, size, rot, sx, alpha, glow, filter) {
    if (!img || alpha <= 0.003 || size <= 0.5) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(sx == null ? 1 : sx, 1);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.imageSmoothingEnabled = false; // piksel-art bez rozmycia
    if (glow && RENDER.blur) { ctx.shadowColor = 'rgba(255,175,40,1)'; ctx.shadowBlur = size * 0.25; }
    if (filter) ctx.filter = filter;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  function raysBehind(ctx, x, y, R, t, alpha) {
    if (alpha <= 0.003 || R <= 1) return;
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(255,215,120,${0.55 * alpha})`); g.addColorStop(1, 'rgba(255,150,30,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 1;
    for (const [n, w, sp] of [[12, 0.09, 0.5], [8, 0.06, -0.8]]) {
      ctx.save(); ctx.rotate(t * sp);
      for (let i = 0; i < n; i++) { const an = (i / n) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, an - w, an + w); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    ctx.restore();
  }
  // zastępcza ikona (gdyby grafiki legendy nie dało się znaleźć)
  const FALLBACK_ICON = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    g.translate(16, 16); g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, an = (i / 10) * TAU - Math.PI / 2; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    g.closePath(); g.fillStyle = '#ffc933'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#8a4b00'; g.stroke();
    return c;
  })();

  /* ======================================================================= */
  /*                                  EFEKTY                                  */
  /*  frame(ctx, stan, t, dt, alfa, W, H, b) – b = prostokąt okna łupów        */
  /*  { x, y, w, h, cx, cy }; gdy okna nie ma – środek mapy                    */
  /* ======================================================================= */
  const EFFECTS = [

    /* ------------------------------ RAMKA OKNA ------------------------------ */

    {
      id: 'phoenix_fire', group: G_FRAME, name: 'Płonąca ramka', dur: 5,
      init: () => ({ fl: [], em: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        ctx.globalCompositeOperation = 'lighter';
        glowFrame(ctx, b, '255,110,20', a * (0.6 + 0.25 * Math.sin(t * 11)), 3, 2, 20);
        if (t < this.dur - 1.2) {
          s.acc += dt * 480 * Math.pow(sc, 0.75);
          const cap = 420 * Math.sqrt(sc); // limit cząsteczek (wydajność)
          while (s.acc >= 1) {
            s.acc--;
            if (s.fl.length > cap) continue;
            const p = perim(b, Math.random(), 2);
            s.fl.push({ x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), vx: p.nx * rand(10, 45) + rand(-12, 12), vy: p.ny * rand(10, 35) - rand(50, 140),
              l: 0, m: rand(0.45, 0.95) * (p.ny > 0 ? 0.4 : 1), r: rand(8, 19), sd: rand(0, TAU) }); // dolna krawędź krócej – nie zasłania łupów
          }
        }
        if (Math.random() < dt * 30 * sc && t < this.dur - 0.8) {
          const p = perim(b, Math.random(), 2);
          s.em.push({ x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-220, -90), l: 0, m: rand(1, 2), sd: rand(0, TAU) });
        }
        for (let i = s.fl.length - 1; i >= 0; i--) {
          const p = s.fl[i];
          p.l += dt; const f = p.l / p.m;
          if (f >= 1) { s.fl.splice(i, 1); continue; }
          p.vx += Math.sin(t * 5 + p.sd) * 50 * dt; p.vy -= 110 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const col = f < 0.18 ? '255,240,190' : f < 0.45 ? '255,175,45' : f < 0.75 ? '255,90,20' : '150,30,10';
          dot(ctx, col, p.x, p.y, p.r * (0.8 + f * 0.7), (1 - f) * 0.6 * a, f < 0.2);
        }
        for (let i = s.em.length - 1; i >= 0; i--) {
          const e = s.em[i];
          e.l += dt; const f = e.l / e.m;
          if (f >= 1) { s.em.splice(i, 1); continue; }
          e.x += (e.vx + Math.sin(t * 6 + e.sd) * 50) * dt; e.y += e.vy * dt;
          dot(ctx, '255,200,90', e.x, e.y, 5, (1 - f) * a * (0.6 + 0.4 * Math.sin(t * 20 + e.sd)), true);
        }
      }
    },

    {
      id: 'frost_frame', group: G_FRAME, name: 'Lodowa ramka', dur: 5.5,
      init(env) {
        const sp = [];
        for (let i = 0; i < 110 * (env.scale || 1); i++) sp.push({ u: Math.random(), ang: rand(-0.75, 0.75), len: rand(8, 36), d: rand(0, 1), br: Math.random() < 0.75 });
        const fl = [];
        for (let i = 0; i < 80; i++) fl.push({ x: Math.random(), y: rand(-0.1, 1), vy: rand(15, 45), r: rand(1.5, 4), ph: rand(0, TAU) });
        return { sp, fl };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        if (!o.second) vignette(ctx, W, H, '160,210,255', 0.35 * a, 0.35);
        ctx.globalCompositeOperation = 'lighter';
        glowFrame(ctx, b, '170,225,255', a * 0.9, 2, 1, 14);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgb(140,210,255)'; ctx.shadowBlur = 6;
        ctx.strokeStyle = 'rgb(215,240,255)'; ctx.lineWidth = 1.5; ctx.globalAlpha = a;
        ctx.beginPath();
        for (const c of s.sp) {
          const g = easeOut(clamp01((t - c.d) / 0.9));
          if (g <= 0) continue;
          const p = perim(b, c.u, 1), an = Math.atan2(p.ny, p.nx) + c.ang, L = c.len * g;
          const ex = p.x + Math.cos(an) * L, ey = p.y + Math.sin(an) * L;
          ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey);
          if (c.br) {
            const mx = p.x + Math.cos(an) * L * 0.55, my = p.y + Math.sin(an) * L * 0.55;
            for (const sg of [-1, 1]) { ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(an + sg * 0.7) * L * 0.35, my + Math.sin(an + sg * 0.7) * L * 0.35); }
          }
        }
        ctx.stroke();
        ctx.restore();
        if (!o.second) for (const f of s.fl) {
          f.y += (f.vy * dt) / H;
          if (f.y > 1.05) f.y = -0.05;
          dot(ctx, '235,245,255', f.x * W + Math.sin(t + f.ph) * 12, f.y * H, f.r * 2, a * 0.8, true);
        }
        if (Math.random() < dt * 14 * sc) s.gl = { p: perim(b, Math.random(), 1), l: 0 };
        if (s.gl) {
          s.gl.l += dt;
          const k = Math.sin(clamp01(s.gl.l / 0.4) * Math.PI);
          sparkleStar(ctx, s.gl.p.x, s.gl.p.y, 12 * k, a * k);
          if (s.gl.l > 0.4) s.gl = null;
        }
      }
    },

    {
      id: 'electric_frame', group: G_FRAME, name: 'Elektryczna ramka', dur: 4.5,
      init: () => ({ sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        ctx.globalCompositeOperation = 'lighter';
        glowFrame(ctx, b, '120,150,255', a * (0.5 + 0.4 * Math.random()), 2, 3, 18);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let k = 0; k < Math.round(8 * sc); k++) {
          const u = Math.random(), p1 = perim(b, u, 3), p2 = perim(b, u + rand(0.02, 0.08), 3);
          const pts = boltPath(p1.x, p1.y, p2.x, p2.y, 14, 5);
          ctx.globalAlpha = a * rand(0.5, 1);
          strokePts(ctx, pts, 8, 'rgba(90,120,255,0.35)');
          strokePts(ctx, pts, 3, 'rgba(160,190,255,0.7)');
          strokePts(ctx, pts, 1.4, '#ffffff');
        }
        if (Math.random() < dt * 7 * sc) {
          const p = perim(b, Math.random(), 3), L = rand(40, 100);
          s.arc = { pts: boltPath(p.x, p.y, p.x + p.nx * L + rand(-30, 30), p.y + p.ny * L + rand(-30, 30), 20, 6), l: 0 };
        }
        if (s.arc) {
          s.arc.l += dt;
          ctx.globalAlpha = a * (1 - s.arc.l / 0.2);
          strokePts(ctx, s.arc.pts, 8, 'rgba(120,150,255,0.4)');
          strokePts(ctx, s.arc.pts, 2, '#ffffff');
          if (s.arc.l > 0.2) s.arc = null;
        }
        if (t < this.dur - 0.8) for (let i = 0; i < 2; i++) if (Math.random() < dt * 25 * sc) {
          const p = perim(b, Math.random(), 3), sp = rand(80, 220);
          s.sp.push({ x: p.x, y: p.y, vx: p.nx * sp + rand(-60, 60), vy: p.ny * sp + rand(-60, 60), l: 0 });
        }
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.5) { s.sp.splice(i, 1); continue; }
          q.vy += 400 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, '170,200,255', q.x, q.y, 5, a * (1 - q.l / 0.5), true);
        }
      }
    },

    {
      id: 'rainbow_frame', group: G_FRAME, name: 'Tęczowa ramka', dur: 5,
      init: () => ({ sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createConicGradient ? ctx.createConicGradient(t * 2.5, b.cx, b.cy) : null;
        if (g) { for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `rgb(${hsl(i / 6, 1, 0.6)})`); }
        for (const [lw, al] of [[16, 0.12], [8, 0.3], [3, 0.95]]) {
          ctx.globalAlpha = a * al; ctx.strokeStyle = g || '#ff66cc'; ctx.lineWidth = lw;
          rrect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 7); ctx.stroke();
        }
        const nc = sc > 1.5 ? 4 : 2;
        for (let k = 0; k < nc; k++) {
          const u = t * 0.32 / Math.sqrt(sc) + k / nc;
          for (let j = 0; j < 26; j++) {
            const p = perim(b, u - j * 0.004, 3);
            dot(ctx, hsl(u - j * 0.01, 1, 0.65), p.x, p.y, 11 * (1 - j / 26), a * (1 - j / 26), j < 2);
          }
          if (Math.random() < 0.6) {
            const p = perim(b, u, 3);
            s.sp.push({ x: p.x, y: p.y, vx: p.nx * rand(30, 90) + rand(-30, 30), vy: p.ny * rand(30, 90) + rand(-30, 30), l: 0, c: hsl(Math.random(), 1, 0.7) });
          }
        }
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.8) { s.sp.splice(i, 1); continue; }
          q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, q.c, q.x, q.y, 4, a * (1 - q.l / 0.8), true);
        }
      }
    },

    {
      id: 'dark_aura', group: G_FRAME, name: 'Mroczna aura', dur: 5,
      init: () => ({ sm: [], wi: [], acc: 0, acc2: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        if (!o.second) vignette(ctx, W, H, '15,0,25', 0.5 * a, 0.25);
        if (t < this.dur - 1.3) {
          s.acc += dt * 110 * Math.pow(sc, 0.75);
          while (s.acc >= 1) {
            s.acc--;
            if (s.sm.length > 160 * Math.sqrt(sc)) continue;
            const p = perim(b, Math.random(), 4);
            s.sm.push({ x: p.x, y: p.y, vx: p.nx * rand(15, 45), vy: p.ny * rand(15, 45) - rand(15, 45), l: 0, m: rand(1.2, 2.1), r: rand(14, 30) });
          }
          s.acc2 += dt * 45 * sc;
          while (s.acc2 >= 1) {
            s.acc2--;
            const p = perim(b, Math.random(), 4);
            s.wi.push({ x: p.x, y: p.y, vy: rand(-90, -40), l: 0, m: rand(0.8, 1.5), ph: rand(0, TAU) });
          }
        }
        for (let i = s.sm.length - 1; i >= 0; i--) {
          const p = s.sm[i];
          p.l += dt; const f = p.l / p.m;
          if (f >= 1) { s.sm.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt;
          dot(ctx, '30,0,45', p.x, p.y, p.r * (1 + f * 1.4), Math.min(1, f * 5) * (1 - f) * 0.85 * a);
        }
        ctx.globalCompositeOperation = 'lighter';
        glowFrame(ctx, b, '170,60,255', a * (0.55 + 0.3 * Math.sin(t * 4)), 2, 3, 22);
        for (let i = s.wi.length - 1; i >= 0; i--) {
          const w = s.wi[i];
          w.l += dt; const f = w.l / w.m;
          if (f >= 1) { s.wi.splice(i, 1); continue; }
          w.x += Math.sin(t * 4 + w.ph) * 30 * dt; w.y += w.vy * dt;
          dot(ctx, '190,90,255', w.x, w.y, 7, (1 - f) * a, true);
        }
      }
    },

    {
      id: 'neon_pulse', group: G_FRAME, name: 'Neonowy puls', dur: 4.2,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        ctx.globalCompositeOperation = 'lighter';
        const cols = ['60,230,255', '255,60,200'];
        const base = cols[Math.floor(t * 3) % 2];
        for (const [lw, al] of [[12, 0.15], [6, 0.35], [2, 1]]) {
          ctx.globalAlpha = a * al; ctx.strokeStyle = `rgb(${base})`; ctx.lineWidth = lw;
          rrect(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 8); ctx.stroke();
        }
        for (let k = 0; k * 0.33 < this.dur - 1; k++) {
          const tt = t - k * 0.33;
          if (tt <= 0 || tt >= 1.1) continue;
          const f = tt / 1.1, pad = 3 + easeOut(f) * 130, col = cols[k % 2], al = (1 - f) * a;
          for (const [lw, m] of [[10, 0.15], [4, 0.4], [1.5, 1]]) {
            ctx.globalAlpha = al * m; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = lw;
            rrect(ctx, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 8 + pad * 0.3); ctx.stroke();
          }
        }
        const pl = 0.6 + 0.4 * Math.sin(t * 12);
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) dot(ctx, base, x, y, 22 * pl, a, true);
      }
    },

    {
      id: 'gold_frame', group: G_FRAME, name: 'Złota ramka', dur: 5,
      init: () => ({ gl: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const sc = o.scale || 1;
        ctx.globalCompositeOperation = 'lighter';
        glowFrame(ctx, b, '255,195,70', a * 0.85, 3, 2, 16);
        glowFrame(ctx, b, '255,245,200', a * 0.5, 1, 5, 6);
        for (let k = 0; k < 2; k++) {
          const u = t * 0.25 / Math.sqrt(sc) + k * 0.5;
          for (let j = 0; j < 18; j++) {
            const p = perim(b, u - j * 0.003, 2);
            dot(ctx, '255,235,170', p.x, p.y, 12 * (1 - j / 18), a * (1 - j / 18), j < 2);
          }
        }
        if (t < this.dur - 0.8) for (let i = 0; i < 3; i++) if (Math.random() < dt * 30 * sc) {
          const p = perim(b, Math.random(), rand(-2, 8));
          s.gl.push({ x: p.x, y: p.y, vx: p.nx * rand(5, 25), vy: p.ny * rand(5, 25) + rand(-10, 10), l: 0, m: rand(0.35, 0.8), r: rand(5, 12) });
        }
        for (let i = s.gl.length - 1; i >= 0; i--) {
          const q = s.gl[i];
          q.l += dt; if (q.l > q.m) { s.gl.splice(i, 1); continue; }
          q.x += q.vx * dt; q.y += q.vy * dt;
          const kk = Math.sin((q.l / q.m) * Math.PI);
          sparkleStar(ctx, q.x, q.y, q.r * kk, a * kk);
        }
      }
    },

    {
      id: 'vines', group: G_FRAME, name: 'Kwitnące pnącza', dur: 6,
      init(env) {
        const n = Math.round(5 * (env.scale || 1));
        return { v: Array.from({ length: n }, (_, i) => ({ u0: i / n + rand(0, 0.03), len: rand(0.15, 0.2), ph: rand(0, TAU),
          leaves: Array.from({ length: 12 }, () => ({ f: Math.random(), side: Math.random() < 0.5 ? -1 : 1, z: rand(4, 7) })),
          flowers: Array.from({ length: 4 }, () => ({ f: rand(0.15, 1), c: pick(['255,120,170', '255,225,90', '200,140,255', '255,255,255', '255,150,80']) })) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b) {
        const g = easeOut(clamp01(t / 1.8)), N = 60;
        const pt = (v, f) => {
          const p = perim(b, v.u0 + f * v.len, 2), w = Math.sin(f * N * 0.45 + v.ph) * 5;
          return { x: p.x + p.nx * w, y: p.y + p.ny * w, nx: p.nx, ny: p.ny };
        };
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const v of s.v) {
          const m = Math.floor(N * g);
          if (m < 1) continue;
          ctx.beginPath();
          for (let j = 0; j <= m; j++) { const q = pt(v, j / N); j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
          ctx.globalAlpha = a; ctx.strokeStyle = 'rgb(55,120,40)'; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = 'rgb(130,200,80)'; ctx.lineWidth = 1; ctx.stroke();
          for (const l of v.leaves) {
            if (l.f > g) continue;
            const q = pt(v, l.f), k = easeOutBack(clamp01((g - l.f) * 6)), z = l.z * k;
            if (z <= 0.2) continue;
            ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.atan2(q.ny, q.nx) + l.side * 0.9);
            ctx.beginPath(); ctx.ellipse(z, 0, z, z * 0.45, 0, 0, TAU);
            ctx.fillStyle = 'rgb(85,170,60)'; ctx.fill();
            ctx.strokeStyle = 'rgba(30,80,20,0.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(z * 1.8, 0); ctx.stroke();
            ctx.restore();
          }
          for (const f of v.flowers) {
            const k = easeOutBack(clamp01((t - 1.8 * f.f - 0.3) / 0.5));
            if (k <= 0.02) continue;
            const q = pt(v, f.f), r = 5 * k;
            ctx.globalCompositeOperation = 'lighter';
            dot(ctx, f.c, q.x, q.y, r * 3, a * 0.4);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = a; ctx.fillStyle = `rgb(${f.c})`;
            for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU + t * 0.5; ctx.beginPath(); ctx.arc(q.x + Math.cos(an) * r, q.y + Math.sin(an) * r, r * 0.75, 0, TAU); ctx.fill(); }
            ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.55, 0, TAU); ctx.fill();
          }
        }
      }
    },

    /* ------------------------------ WOKÓŁ OKNA ------------------------------ */

    {
      id: 'legend_rays', group: G_AROUND, name: 'Blask legendy', dur: 4.2,
      init(env) {
        const parts = [], b = env.box;
        const cols = ['255,190,60', '255,140,20', '255,230,150', '255,110,30'];
        for (let i = 0; i < Math.round(180 * (env.density || 1)); i++) {
          const an = rand(0, TAU), sp = rand(120, 700);
          parts.push({ x: b.cx, y: b.cy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, c: pick(cols), r: rand(3, 9), l: 0, m: rand(1.2, 2.6) });
        }
        return { parts };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const cx = b.cx, cy = b.cy;
        const k = easeOutBack(clamp01(t / 0.55));
        const R = Math.max(1, Math.hypot(W, H) * 0.75 * k);
        ctx.globalCompositeOperation = 'lighter';
        const layer = (n, width, speed, alpha) => {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * speed);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
          g.addColorStop(0, `rgba(255,215,120,${alpha * a})`);
          g.addColorStop(0.35, `rgba(255,160,40,${alpha * 0.5 * a})`);
          g.addColorStop(1, 'rgba(255,120,0,0)');
          ctx.fillStyle = g; ctx.globalAlpha = 1;
          for (let i = 0; i < n; i++) {
            const an = (i / n) * TAU;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, an - width, an + width); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        };
        layer(14, 0.07, 0.35, 0.55);
        layer(9, 0.045, -0.55, 0.45);
        [0, 0.28, 0.6].forEach(st => {
          const tt = t - st, L = 1.5;
          if (tt <= 0 || tt >= L) return;
          const f = tt / L, r = easeOut(f) * Math.max(W, H) * 0.6;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(255,215,130,${(1 - f) * 0.85 * a})`;
          ctx.lineWidth = 12 * (1 - f) + 1;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        });
        const pulse = 1 + 0.08 * Math.sin(t * 7);
        dot(ctx, '255,160,40', cx, cy, 170 * k * pulse, 0.9 * a);
        dot(ctx, '255,240,200', cx, cy, 60 * k * pulse, a, true);
        const drag = Math.pow(0.18, dt);
        for (const p of s.parts) {
          p.l += dt; if (p.l > p.m) continue;
          p.vx *= drag; p.vy = p.vy * drag + 60 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const f = 1 - p.l / p.m;
          dot(ctx, p.c, p.x, p.y, p.r * 3 * (0.4 + f), f * a, true);
        }
      }
    },

    {
      id: 'rune_circle', group: G_AROUND, name: 'Krąg runiczny', dur: 5,
      init: () => ({ pt: [], runes: Array.from({ length: 18 }, () => (Math.random() * GLYPHS.length) | 0) }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const cx = b.cx, cy = b.cy;
        const R = Math.max(1, Math.hypot(b.w, b.h) * 0.66 * easeOutBack(clamp01(t / 0.7)));
        ctx.globalCompositeOperation = 'lighter';
        // słup światła
        const beam = ctx.createLinearGradient(cx - R * 0.35, 0, cx + R * 0.35, 0);
        beam.addColorStop(0, 'rgba(255,210,120,0)');
        beam.addColorStop(0.5, `rgba(255,220,140,${0.22 * a})`);
        beam.addColorStop(1, 'rgba(255,210,120,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = beam; ctx.fillRect(cx - R * 0.35, 0, R * 0.7, cy);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.shadowColor = 'rgb(255,190,80)'; ctx.shadowBlur = 12;
        ctx.strokeStyle = 'rgb(255,205,110)'; ctx.globalAlpha = a;
        ctx.save(); ctx.rotate(t * 0.6);
        ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.stroke();
        const gs = Math.max(10, R * 0.1);
        ctx.lineWidth = 1.6; ctx.beginPath();
        s.runes.forEach((gi, i) => {
          const an = (i / s.runes.length) * TAU;
          // punkty ścieżki są przeliczane przez bieżącą transformację, więc każda runa ląduje w swoim miejscu
          ctx.save(); ctx.rotate(an); glyphPath(ctx, GLYPHS[gi], 0, -R * 0.93, gs); ctx.restore();
        });
        ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.rotate(-t * 0.9);
        ctx.strokeStyle = 'rgb(130,225,255)'; ctx.shadowColor = 'rgb(90,200,255)';
        ctx.lineWidth = 1.8;
        for (const off of [0, Math.PI / 3]) {
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { const an = off + (i / 3) * TAU - Math.PI / 2; const x = Math.cos(an) * R * 0.8, y = Math.sin(an) * R * 0.8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.closePath(); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(an) * R * 0.8, Math.sin(an) * R * 0.8, R * 0.06, 0, TAU); ctx.stroke(); }
        ctx.restore();
        ctx.restore();
        if (t < this.dur - 1) for (let i = 0; i < 2; i++) if (Math.random() < dt * 40) {
          const an = rand(0, TAU);
          s.pt.push({ x: cx + Math.cos(an) * R, y: cy + Math.sin(an) * R, vy: rand(-120, -50), l: 0, m: rand(0.8, 1.6), c: Math.random() < 0.5 ? '255,210,120' : '140,225,255' });
        }
        for (let i = s.pt.length - 1; i >= 0; i--) {
          const p = s.pt[i];
          p.l += dt; if (p.l > p.m) { s.pt.splice(i, 1); continue; }
          p.y += p.vy * dt;
          dot(ctx, p.c, p.x, p.y, 6, a * (1 - p.l / p.m), true);
        }
      }
    },

    {
      id: 'galaxy', group: G_AROUND, name: 'Wir galaktyki', dur: 4.6,
      init(env) {
        const cols = ['170,120,255', '110,170,255', '255,130,220', '240,240,255'];
        const st = [];
        for (let i = 0; i < Math.round(750 * (env.density || 1)); i++) st.push({ arm: i % 3, d: Math.pow(Math.random(), 0.7), j: rand(-1, 1) * rand(0, 1), c: pick(cols), r: rand(2, 5) });
        return { st };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const cx = b.cx, cy = b.cy;
        const R = Math.min(W, H) * 0.45 * easeOut(clamp01(t / 0.9));
        const bt = this.dur - 1.5, boom = t > bt ? Math.pow(t - bt, 2) * 9 : 0;
        ctx.globalCompositeOperation = 'lighter';
        const core = 1 + 0.1 * Math.sin(t * 8);
        dot(ctx, '160,100,255', cx, cy, R * 0.7 * core, 0.55 * a);
        dot(ctx, '255,220,255', cx, cy, 45 * core * (1 + boom * 0.3), a, true);
        for (const p of s.st) {
          const an = p.arm * TAU / 3 + p.d * 4.8 + t * (1.1 / (0.25 + p.d)) + p.j * 0.35;
          const r = p.d * R * (1 + boom) + p.j * 12;
          dot(ctx, p.c, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 0.55, p.r * 2.2,
            a * (0.35 + 0.65 * (1 - p.d)) * (boom ? Math.max(0, 1 - boom * 0.25) : 1), p.r > 4);
        }
        if (t > bt && t < bt + 1) {
          const f = t - bt;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(220,180,255,${(1 - f) * a})`;
          ctx.lineWidth = 10 * (1 - f) + 1;
          ctx.beginPath(); ctx.ellipse(cx, cy, easeOut(f) * W * 0.6, easeOut(f) * W * 0.33, 0, 0, TAU); ctx.stroke();
        }
      }
    },

    {
      id: 'gem_burst', group: G_AROUND, name: 'Fontanna klejnotów', dur: 4.5,
      init: () => ({ g: [], acc: 0, gl: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const GEMS = [['#e0115f', '#ff9cc0', '#6e002b'], ['#12b865', '#9dffc9', '#05532a'], ['#2266ff', '#a8c8ff', '#0a2478'],
          ['#9b30ff', '#dcb0ff', '#440d7a'], ['#ffb000', '#ffe7a0', '#7d5100'], ['#d6f3ff', '#ffffff', '#6b9cbc']];
        if ((t % 3.5) < 1.8 && t < this.dur - 1.2) {
          s.acc += dt * 95 * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            s.g.push({ x: b.cx + rand(-b.w * 0.3, b.w * 0.3), y: b.y + 8, vx: rand(-280, 280), vy: rand(-780, -420),
              rot: rand(0, TAU), vr: rand(-6, 6), sz: rand(12, 21), c: pick(GEMS) });
          }
        }
        for (let i = s.g.length - 1; i >= 0; i--) {
          const g = s.g[i];
          g.vy += 950 * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.vr * dt;
          if (g.y > H + 40) { s.g.splice(i, 1); continue; }
          const z = g.sz, [base, hi, dk] = g.c;
          ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rot); ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(-z * 0.55, -z * 0.15); ctx.lineTo(-z * 0.3, -z * 0.45); ctx.lineTo(z * 0.3, -z * 0.45);
          ctx.lineTo(z * 0.55, -z * 0.15); ctx.lineTo(0, z * 0.6); ctx.closePath();
          ctx.fillStyle = base; ctx.fill();
          ctx.lineWidth = 1; ctx.strokeStyle = dk; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-z * 0.3, -z * 0.45); ctx.lineTo(-z * 0.1, -z * 0.15); ctx.lineTo(-z * 0.55, -z * 0.15); ctx.closePath();
          ctx.fillStyle = hi; ctx.fill();
          ctx.beginPath(); ctx.moveTo(-z * 0.55, -z * 0.15); ctx.lineTo(z * 0.55, -z * 0.15);
          ctx.moveTo(-z * 0.1, -z * 0.15); ctx.lineTo(0, z * 0.6); ctx.moveTo(z * 0.2, -z * 0.15); ctx.lineTo(0, z * 0.6);
          ctx.strokeStyle = dk; ctx.globalAlpha = a * 0.6; ctx.stroke();
          ctx.restore();
          if (Math.random() < dt * 3) s.gl.push({ x: g.x, y: g.y, l: 0 });
        }
        ctx.globalCompositeOperation = 'lighter';
        dot(ctx, '255,220,150', b.cx, b.y + 8, 60, a * clamp01(1 - t / 2) * 0.8, true);
        for (let i = s.gl.length - 1; i >= 0; i--) {
          const q = s.gl[i];
          q.l += dt; if (q.l > 0.35) { s.gl.splice(i, 1); continue; }
          const k = Math.sin((q.l / 0.35) * Math.PI);
          sparkleStar(ctx, q.x, q.y, 10 * k, a * k);
        }
      }
    },

    {
      id: 'hearts', group: G_AROUND, name: 'Serduszka', dur: 5,
      init: () => ({ h: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        if (t < this.dur - 1.6) {
          s.acc += dt * 28 * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            s.h.push({ x: b.x + rand(-10, b.w + 10), y: b.y + rand(-10, 25), vy: rand(-130, -60), ph: rand(0, TAU), sz: rand(9, 20),
              c: pick(['255,70,120', '255,120,170', '255,40,80', '255,160,205']), l: 0, m: rand(2, 3.2) });
          }
        }
        for (let i = s.h.length - 1; i >= 0; i--) {
          const h = s.h[i];
          h.l += dt; const f = h.l / h.m;
          if (f >= 1) { s.h.splice(i, 1); continue; }
          h.y += h.vy * dt; h.x += Math.sin(t * 2.5 + h.ph) * 35 * dt;
          const k = easeOutBack(clamp01(h.l / 0.35)), al = a * (1 - Math.pow(f, 3)), z = h.sz * k;
          ctx.globalCompositeOperation = 'lighter';
          dot(ctx, h.c, h.x, h.y, z * 2.2, al * 0.45);
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.sin(t * 3 + h.ph) * 0.25);
          heartPath(ctx, 0, 0, z);
          ctx.globalAlpha = al; ctx.fillStyle = `rgb(${h.c})`; ctx.fill();
          ctx.beginPath(); ctx.ellipse(-z * 0.35, -z * 0.3, z * 0.18, z * 0.11, -0.6, 0, TAU);
          ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
          ctx.restore();
        }
      }
    },

    {
      id: 'butterflies', group: G_AROUND, name: 'Motyle', dur: 6,
      init(env) {
        const b = env.box, cols = [['255,150,40', '255,215,120'], ['70,150,255', '170,225,255'], ['255,80,190', '255,185,235'],
          ['120,230,100', '215,255,185'], ['180,110,255', '230,200,255']];
        return { bf: Array.from({ length: Math.round(30 * (env.density || 1)) }, () => ({ x: b.cx + rand(-b.w * 0.3, b.w * 0.3), y: b.cy + rand(-b.h * 0.3, b.h * 0.3), an: rand(0, TAU),
          sp: rand(60, 140), ph: rand(0, TAU), fs: rand(14, 22), sz: rand(13, 20), c: pick(cols), d: rand(0, 1.3) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        for (const f of s.bf) {
          if (t < f.d) continue;
          f.an += Math.sin(t * 1.7 + f.ph) * 1.6 * dt;
          f.x += Math.cos(f.an) * f.sp * dt; f.y += Math.sin(f.an) * f.sp * dt;
          const al = a * clamp01((t - f.d) / 0.4), z = f.sz, fl = 0.2 + 0.8 * Math.abs(Math.sin(t * f.fs + f.ph));
          ctx.globalCompositeOperation = 'lighter';
          dot(ctx, f.c[0], f.x, f.y, z * 2, al * 0.35);
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.an + Math.PI / 2); ctx.globalAlpha = al;
          for (const sd of [-1, 1]) {
            ctx.beginPath(); ctx.ellipse(sd * z * 0.5 * fl, -z * 0.2, z * 0.55 * fl, z * 0.42, sd * 0.5, 0, TAU);
            ctx.fillStyle = `rgb(${f.c[0]})`; ctx.fill();
            ctx.beginPath(); ctx.ellipse(sd * z * 0.38 * fl, z * 0.3, z * 0.36 * fl, z * 0.3, -sd * 0.4, 0, TAU);
            ctx.fillStyle = `rgb(${f.c[1]})`; ctx.fill();
          }
          ctx.beginPath(); ctx.ellipse(0, 0, z * 0.09, z * 0.48, 0, 0, TAU); ctx.fillStyle = '#2a1a10'; ctx.fill();
          ctx.restore();
        }
      }
    },

    {
      id: 'banner', group: G_AROUND, name: 'Napis LEGENDA!', dur: 4,
      init() { return { oc: document.createElement('canvas'), sp: [] }; },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const fs = Math.round(Math.max(34, Math.min(72, W * 0.055)));
        const text = 'LEGENDA!';
        let x = b.cx, y = b.y - fs * 0.75;
        if (y < fs * 0.7) y = b.y + b.h + fs * 0.75;
        const oc = s.oc, ow = fs * 6, oh = fs * 1.6;
        if (oc.width !== ow) { oc.width = ow; oc.height = oh; }
        const ox = oc.getContext('2d');
        ox.clearRect(0, 0, ow, oh);
        ox.globalCompositeOperation = 'source-over';
        ox.font = `900 ${fs}px Georgia, "Times New Roman", serif`;
        ox.textAlign = 'center'; ox.textBaseline = 'middle';
        ox.lineJoin = 'round'; ox.lineWidth = fs * 0.14; ox.strokeStyle = '#3a1800';
        ox.strokeText(text, ow / 2, oh / 2);
        const gr = ox.createLinearGradient(0, oh * 0.2, 0, oh * 0.8);
        gr.addColorStop(0, '#fff7c8'); gr.addColorStop(0.45, '#ffc933'); gr.addColorStop(1, '#b86b00');
        ox.fillStyle = gr; ox.fillText(text, ow / 2, oh / 2);
        ox.globalCompositeOperation = 'source-atop';
        const sx = ((t * 0.9) % 1.6 - 0.3) * ow;
        const sh = ox.createLinearGradient(sx - fs, 0, sx + fs, 0);
        sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.85)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        ox.fillStyle = sh; ox.fillRect(0, 0, ow, oh);
        const k = Math.max(0.01, easeOutBack(clamp01(t / 0.55)));
        ctx.globalCompositeOperation = 'lighter';
        dot(ctx, '255,160,30', x, y, fs * 2.6 * k, a * 0.55);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.globalAlpha = a;
        ctx.drawImage(oc, -ow / 2, -oh / 2);
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        if (Math.random() < dt * 18) s.sp.push({ x: x + rand(-fs * 2.4, fs * 2.4), y: y + rand(-fs * 0.6, fs * 0.6), l: 0 });
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.45) { s.sp.splice(i, 1); continue; }
          const kk = Math.sin((q.l / 0.45) * Math.PI);
          sparkleStar(ctx, q.x, q.y, 13 * kk, a * kk);
        }
      }
    },

    {
      id: 'tornado', group: G_AROUND, name: 'Tornado', dur: 5,
      init(env) {
        const cols = ['200,190,165', '160,150,125', '225,215,195', '130,120,100'];
        return {
          p: Array.from({ length: Math.round(320 * (env.density || 1)) }, () => ({ h: Math.random(), an: rand(0, TAU), sp: rand(3, 6), z: rand(2, 5), c: pick(cols) })),
          d: Array.from({ length: 14 }, () => ({ h: Math.random(), an: rand(0, TAU), sp: rand(2.5, 4.5), z: rand(4, 8), rot: rand(0, TAU), c: pick(['#6b4a2b', '#4d3b28', '#7a6a50', '#3f5a2a']) })),
        };
      },
      frame(ctx, s, t, dt, a, W, H, b) {
        const grow = easeOut(clamp01(t / 0.9)), baseY = b.y + b.h + 12, HT = (b.h * 1.8 + 90) * grow;
        const rad = h => (18 + h * b.w * 0.95) * grow;
        const pos = (h, an) => ({ x: b.cx + Math.cos(an) * rad(h) + Math.sin(t * 2.2 + h * 5) * 12 * h, y: baseY - h * HT + Math.sin(an) * rad(h) * 0.18, front: Math.sin(an) > 0 });
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= 9; i++) {
          const h = i / 9, c = pos(h, 0);
          ctx.globalAlpha = a * 0.16; ctx.strokeStyle = 'rgb(230,225,210)';
          ctx.beginPath(); ctx.ellipse(b.cx + Math.sin(t * 2.2 + h * 5) * 12 * h, c.y, rad(h), rad(h) * 0.18, 0, 0, TAU); ctx.stroke();
        }
        for (const p of s.p) {
          p.an += p.sp * dt * (1.5 - p.h * 0.6); p.h += dt * 0.14; if (p.h > 1) p.h -= 1;
          const q = pos(p.h, p.an);
          dot(ctx, p.c, q.x, q.y, p.z * 2.3, a * (q.front ? 0.75 : 0.35));
        }
        for (const d of s.d) {
          d.an += d.sp * dt; d.h += dt * 0.1; if (d.h > 1) d.h -= 1; d.rot += dt * 6;
          const q = pos(d.h, d.an);
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(d.rot); ctx.globalAlpha = a * (q.front ? 1 : 0.5);
          ctx.fillStyle = d.c; ctx.fillRect(-d.z / 2, -d.z / 3, d.z, d.z * 0.66);
          ctx.restore();
        }
      }
    },

    {
      id: 'portal', group: G_AROUND, name: 'Portal', dur: 5,
      init(env) {
        return { p: Array.from({ length: Math.round(420 * (env.density || 1)) }, () => ({ r: rand(0.75, 1.35), an: rand(0, TAU), sp: rand(0.8, 1.6),
          c: pick(['150,90,255', '90,200,255', '230,120,255', '120,255,230']) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b) {
        const R = Math.max(1, Math.max(b.w, b.h) * 0.95 * easeOutBack(clamp01(t / 0.7)));
        ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.translate(b.cx, b.cy);
        for (const [rr, lw, col, al, sp] of [[0.78, 5, '160,90,255', 0.8, 1], [0.86, 2, '90,210,255', 0.7, -1.4], [1.18, 1.5, '200,130,255', 0.35, 0.6]]) {
          ctx.save(); ctx.rotate(t * sp);
          ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 14;
          ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = lw; ctx.globalAlpha = a * al;
          ctx.setLineDash([R * 0.3, R * 0.08]);
          ctx.beginPath(); ctx.ellipse(0, 0, R * rr, R * rr * 0.88, 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        ctx.setLineDash([]);
        ctx.restore();
        for (const p of s.p) {
          p.r -= dt * 0.18 * p.sp; p.an += dt * p.sp * (1.6 / (p.r - 0.5));
          if (p.r < 0.76) { p.r = rand(1.2, 1.4); p.an = rand(0, TAU); }
          const x = b.cx + Math.cos(p.an) * p.r * R, y = b.cy + Math.sin(p.an) * p.r * R * 0.88;
          dot(ctx, p.c, x, y, 4 + (1.4 - p.r) * 6, a * clamp01((1.4 - p.r) * 2), p.r < 0.9);
        }
      }
    },

    /* -------------------------- PRZEDMIOT LEGENDARNY -------------------------- */
    /* ox.item = { img, x, y, base } – grafika legendy z okna łupów i środek jej slotu */

    {
      id: 'item_fall', group: G_ITEM, name: 'Spadający przedmiot', dur: 3.2,
      init: () => ({ trail: [], sp: [], landed: false, hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item, big = 88 * (o.itemScale || 1), T = 0.9;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem(); // przedmiot "wyleciał" ze slotu – wraca w chwili uderzenia
          const f = t / T, e = f * f;
          const y = -big + (it.y + big) * e, size = big + (it.base - big) * e, rot = (1 - f) * 5;
          s.trail.push({ x: it.x, y, l: 0, r: size * 0.45 });
          dot(ctx, '255,170,40', it.x, y, size * 1.1, a * 0.75);
          drawItem(ctx, it.img, it.x, y, size, rot, 1, a, true);
        } else if (!s.landed) {
          s.landed = true; s.hit = t;
          for (let i = 0; i < 60; i++) { const an = rand(0, TAU), sp = rand(120, 380); s.sp.push({ x: it.x, y: it.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: rand(0.5, 1.1) }); }
        }
        shakeScreen(6 * clamp01(1 - (t - s.hit) / 0.3) * a);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = s.trail.length - 1; i >= 0; i--) {
          const q = s.trail[i];
          q.l += dt; if (q.l > 0.35) { s.trail.splice(i, 1); continue; }
          dot(ctx, '255,190,70', q.x + rand(-3, 3), q.y, q.r * (1 - q.l / 0.35), a * (1 - q.l / 0.35) * 0.6);
        }
        if (s.landed) {
          const tt = t - s.hit;
          if (tt < 0.9) {
            const f = tt / 0.9;
            ctx.globalAlpha = 1;
            ctx.strokeStyle = `rgba(255,210,120,${(1 - f) * a})`; ctx.lineWidth = 6 * (1 - f) + 1;
            ctx.beginPath(); ctx.arc(it.x, it.y, easeOut(f) * 130, 0, TAU); ctx.stroke();
            dot(ctx, '255,220,150', it.x, it.y, 70 * (1 - f), a * (1 - f), true);
          }
        }
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > q.m) { s.sp.splice(i, 1); continue; }
          q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, '255,210,110', q.x, q.y, 5, a * (1 - q.l / q.m), true);
        }
      }
    },

    {
      id: 'item_spin', group: G_ITEM, name: 'Obracający się przedmiot', dur: 4.8,
      init: () => ({ sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item, big = 128 * (o.itemScale || 1);
        const hx = b.cx + ((o.index || 0) - ((o.count || 1) - 1) / 2) * big * 1.3, hy = Math.max(big * 0.7, b.y - big * 0.75);
        const back = clamp01((t - (this.dur - 1)) / 0.8);
        const k = easeOutBack(clamp01(t / 0.5)) * (1 - back) + back * (it.base / big);
        const x = hx + (it.x - hx) * easeOut(back), y = hy + (it.y - hy) * easeOut(back) + Math.sin(t * 2.2) * 5 * (1 - back);
        const size = big * Math.max(0.01, k);
        if (back < 1) o.hideItem();
        ctx.globalCompositeOperation = 'lighter';
        raysBehind(ctx, x, y, size * 1.5, t, a * (1 - back));
        dot(ctx, '255,170,40', x, y, size * 1.05, a * 0.8);
        const c = Math.cos(t * 3.2);
        drawItem(ctx, it.img, x, y, size, 0, Math.max(0.06, Math.abs(c)), a, true, c < 0 ? 'brightness(0.55) sepia(0.6)' : null);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const an = t * 2.4 + (i / 3) * TAU, rx = size * 0.9, ry = size * 0.28;
          const px = x + Math.cos(an) * rx, py = y + Math.sin(an) * ry;
          dot(ctx, '255,230,160', px, py, 9, a * (1 - back) * (Math.sin(an) > 0 ? 1 : 0.45), true);
        }
        if (Math.random() < dt * 20 * (1 - back)) s.sp.push({ x: x + rand(-size * 0.6, size * 0.6), y: y + rand(-size * 0.6, size * 0.6), l: 0 });
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.4) { s.sp.splice(i, 1); continue; }
          const kk = Math.sin((q.l / 0.4) * Math.PI);
          sparkleStar(ctx, q.x, q.y, 12 * kk, a * kk);
        }
      }
    },

    {
      id: 'item_reveal', group: G_ITEM, name: 'Objawienie przedmiotu', dur: 4.8,
      init: () => ({ sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item, big = 180 * (o.itemScale || 1), cx = W / 2 + ((o.index || 0) - ((o.count || 1) - 1) / 2) * big * 1.2, cy = H * 0.42;
        const inF = easeOut(clamp01(t / 0.7)), outF = easeOut(clamp01((t - (this.dur - 1.1)) / 0.9));
        const x = it.x + (cx - it.x) * inF + (it.x - cx) * outF;
        const y = it.y + (cy - it.y) * inF + (it.y - cy) * outF + Math.sin(t * 2) * 6 * inF * (1 - outF);
        const size = it.base + (big - it.base) * inF * (1 - outF);
        const hold = inF * (1 - outF);
        if (outF < 0.999) o.hideItem();
        ctx.globalCompositeOperation = 'lighter';
        raysBehind(ctx, x, y, size * 2.2, t, a * hold);
        dot(ctx, '255,160,40', x, y, size * 1.2, a * (0.4 + 0.5 * hold));
        dot(ctx, '255,235,190', x, y, size * 0.5, a * hold * 0.6, true);
        drawItem(ctx, it.img, x, y, size, 0, 1, a, true);
        ctx.globalCompositeOperation = 'lighter';
        if (Math.random() < dt * 30 * hold) { const an = rand(0, TAU), r = size * rand(0.55, 1); s.sp.push({ x: x + Math.cos(an) * r, y: y + Math.sin(an) * r, l: 0 }); }
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.45) { s.sp.splice(i, 1); continue; }
          const kk = Math.sin((q.l / 0.45) * Math.PI);
          sparkleStar(ctx, q.x, q.y, 14 * kk, a * kk);
        }
      }
    },

    {
      id: 'item_orbit', group: G_ITEM, name: 'Orbita przedmiotów', dur: 5,
      init: () => ({ tr: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item, n = 8, rx = b.w * 0.95, ry = b.h * 0.72;
        const grow = easeOutBack(clamp01(t / 0.6)), shrink = easeOut(clamp01((t - (this.dur - 1.2)) / 1));
        const rr = Math.max(0.01, grow * (1 - shrink));
        for (let i = 0; i < n; i++) {
          const an = t * 1.6 + (i / n) * TAU + (o.index || 0) * (TAU / n / Math.max(1, o.count || 1));
          const x = b.cx + Math.cos(an) * rx * rr + (it.x - b.cx) * shrink;
          const y = b.cy + Math.sin(an) * ry * rr + (it.y - b.cy) * shrink;
          const depth = 0.75 + 0.25 * Math.sin(an), size = 44 * (o.itemScale || 1) * depth * (1 - shrink * 0.5);
          if (Math.random() < 0.5) s.tr.push({ x, y, l: 0 });
          ctx.globalCompositeOperation = 'lighter';
          dot(ctx, '255,170,40', x, y, size * 0.9, a * 0.6 * depth);
          drawItem(ctx, it.img, x, y, size, Math.sin(t * 3 + i) * 0.3, 1, a * depth, false);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = s.tr.length - 1; i >= 0; i--) {
          const q = s.tr[i];
          q.l += dt; if (q.l > 0.5) { s.tr.splice(i, 1); continue; }
          dot(ctx, '255,215,120', q.x, q.y, 6 * (1 - q.l / 0.5), a * (1 - q.l / 0.5), true);
        }
      }
    },

    {
      id: 'item_fountain', group: G_ITEM, name: 'Fontanna przedmiotu', dur: 4.8,
      init: () => ({ p: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item;
        if ((t % 3.5) < 2 && t < this.dur - 1.2) {
          s.acc += dt * 26 * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            s.p.push({ x: it.x, y: it.y, vx: rand(-260, 260), vy: rand(-820, -480), rot: rand(0, TAU), vr: rand(-7, 7), z: rand(36, 60) * (o.itemScale || 1) });
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        dot(ctx, '255,200,90', it.x, it.y, 70, a * clamp01(1 - t / 2.3), true);
        for (let i = s.p.length - 1; i >= 0; i--) {
          const q = s.p[i];
          q.vy += 950 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
          if (q.y > H + 60) { s.p.splice(i, 1); continue; }
          ctx.globalCompositeOperation = 'lighter';
          dot(ctx, '255,170,40', q.x, q.y, q.z * 0.8, a * 0.5);
          drawItem(ctx, it.img, q.x, q.y, q.z, q.rot, 1, a, false);
        }
      }
    },

    {
      id: 'item_rain', group: G_ITEM, name: 'Deszcz przedmiotów', dur: 5.5,
      init: () => ({ p: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item;
        if (t < this.dur - 1.8) {
          s.acc += dt * 32 * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            s.p.push({ x: rand(0, W), y: -40, vy: rand(180, 380), vx: rand(-30, 30), rot: rand(0, TAU), vr: rand(-3, 3), z: rand(34, 66) * (o.itemScale || 1) });
          }
        }
        for (let i = s.p.length - 1; i >= 0; i--) {
          const q = s.p[i];
          q.vy += 200 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
          if (q.y > H + 60) { s.p.splice(i, 1); continue; }
          ctx.globalCompositeOperation = 'lighter';
          dot(ctx, '255,180,60', q.x, q.y, q.z * 0.75, a * 0.45);
          drawItem(ctx, it.img, q.x, q.y, q.z, q.rot, 1, a, false);
        }
      }
    },

    {
      id: 'item_pulse', group: G_ITEM, name: 'Pulsujący przedmiot', dur: 4.5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item;
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k * 0.45 < this.dur - 1; k++) {
          const tt = t - k * 0.45;
          if (tt <= 0 || tt >= 1.3) continue;
          const f = tt / 1.3, z = it.base * (1 + easeOut(f) * 5 * (o.itemScale || 1));
          ctx.globalCompositeOperation = 'lighter';
          drawItem(ctx, it.img, it.x, it.y, z, 0, 1, a * (1 - f) * 0.55, false);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.strokeStyle = `rgba(255,200,90,${(1 - f) * a})`; ctx.lineWidth = 3 * (1 - f) + 0.5;
          ctx.beginPath(); ctx.arc(it.x, it.y, z * 0.75, 0, TAU); ctx.stroke();
        }
        const pl = 1 + 0.12 * Math.sin(t * 9);
        dot(ctx, '255,170,40', it.x, it.y, it.base * 2.2 * pl, a);
        drawItem(ctx, it.img, it.x, it.y, it.base * 1.5 * (o.itemScale || 1) * pl, 0, 1, a, true);
      }
    },

    {
      id: 'item_chest', group: G_ITEM, name: 'Skrzynia skarbów', dur: 5.2,
      init: () => ({ coins: [], popped: false, sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const it = o.item, sz = 74 * (o.itemScale || 1);
        const cx = b.cx + ((o.index || 0) - ((o.count || 1) - 1) / 2) * sz * 1.4, bodyTop = Math.max(sz * 1.3, b.y - sz * 0.62);
        const k = Math.max(0.01, easeOutBack(clamp01(t / 0.45)));
        const open = easeOut(clamp01((t - 0.7) / 0.5));
        if (t < this.dur - 0.35) o.hideItem();
        const bw = sz * k, bh = sz * 0.55 * k, lidH = sz * 0.3 * k;
        // promień światła
        if (open > 0) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(0, bodyTop, 0, bodyTop - sz * 2.6);
          g.addColorStop(0, `rgba(255,220,130,${0.55 * open * a})`); g.addColorStop(1, 'rgba(255,220,130,0)');
          ctx.globalAlpha = 1; ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(cx - bw * 0.42, bodyTop); ctx.lineTo(cx + bw * 0.42, bodyTop);
          ctx.lineTo(cx + bw * 0.9, bodyTop - sz * 2.6); ctx.lineTo(cx - bw * 0.9, bodyTop - sz * 2.6); ctx.closePath(); ctx.fill();
        }
        // przedmiot wychodzi ze skrzyni
        const ry = easeOut(clamp01((t - 1) / 0.9));
        if (ry > 0) {
          const iy = bodyTop + sz * 0.1 - ry * sz * 1.25 + Math.sin(t * 2.5) * 4 * ry, isz = sz * 0.85;
          ctx.globalCompositeOperation = 'lighter';
          raysBehind(ctx, cx, iy, isz * 1.4 * ry, t, a * ry);
          dot(ctx, '255,170,40', cx, iy, isz, a * 0.7 * ry);
          drawItem(ctx, it.img, cx, iy, isz, 0, 1, a, true);
        }
        // skrzynia
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        const x0 = cx - bw / 2;
        const wood = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bh);
        wood.addColorStop(0, '#9a5a24'); wood.addColorStop(1, '#5c3212');
        ctx.fillStyle = wood; ctx.fillRect(x0, bodyTop, bw, bh);
        ctx.fillStyle = '#e0a82e';
        ctx.fillRect(x0 + bw * 0.14, bodyTop, bw * 0.08, bh); ctx.fillRect(x0 + bw * 0.78, bodyTop, bw * 0.08, bh);
        ctx.fillRect(x0 + bw * 0.42, bodyTop + bh * 0.08, bw * 0.16, bh * 0.36);
        ctx.fillStyle = '#3a1e08'; ctx.fillRect(x0 + bw * 0.485, bodyTop + bh * 0.2, bw * 0.03, bh * 0.14);
        ctx.strokeStyle = '#2c1605'; ctx.lineWidth = 2; ctx.strokeRect(x0, bodyTop, bw, bh);
        // wieko (obraca się do tyłu)
        const c = Math.cos(open * 2.0), lh = lidH * Math.abs(c);
        ctx.fillStyle = c >= 0 ? '#8a4d1c' : '#3d200a';
        ctx.beginPath();
        if (c >= 0) { ctx.moveTo(x0, bodyTop); ctx.lineTo(x0, bodyTop - lh * 0.7); ctx.quadraticCurveTo(cx, bodyTop - lh * 1.4, x0 + bw, bodyTop - lh * 0.7); ctx.lineTo(x0 + bw, bodyTop); }
        else { ctx.moveTo(x0 + bw * 0.02, bodyTop); ctx.lineTo(x0 - bw * 0.04, bodyTop - lh * 1.2); ctx.lineTo(x0 + bw * 1.04, bodyTop - lh * 1.2); ctx.lineTo(x0 + bw * 0.98, bodyTop); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (c >= 0) { ctx.fillStyle = '#e0a82e'; ctx.fillRect(x0 + bw * 0.14, bodyTop - lh * 0.95, bw * 0.08, lh * 0.95); ctx.fillRect(x0 + bw * 0.78, bodyTop - lh * 0.95, bw * 0.08, lh * 0.95); }
        // monety
        if (!s.popped && t > 1.05) {
          s.popped = true;
          for (let i = 0; i < Math.round(30 * (o.density || 1)); i++) s.coins.push({ x: cx + rand(-bw * 0.3, bw * 0.3), y: bodyTop, vx: rand(-220, 220), vy: rand(-620, -300), ph: rand(0, TAU), r: rand(5, 8) });
        }
        for (let i = s.coins.length - 1; i >= 0; i--) {
          const q = s.coins[i];
          q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.ph += dt * 9;
          if (q.y > H + 20) { s.coins.splice(i, 1); continue; }
          ctx.globalAlpha = a; ctx.fillStyle = Math.cos(q.ph) > 0 ? '#ffd24a' : '#d99a16';
          ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(1, Math.abs(Math.cos(q.ph)) * q.r), q.r, 0, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        if (open > 0 && Math.random() < dt * 25) s.sp.push({ x: cx + rand(-bw * 0.6, bw * 0.6), y: bodyTop - rand(0, sz * 1.8), l: 0 });
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i];
          q.l += dt; if (q.l > 0.4) { s.sp.splice(i, 1); continue; }
          const kk = Math.sin((q.l / 0.4) * Math.PI);
          sparkleStar(ctx, q.x, q.y, 11 * kk, a * kk);
        }
      }
    },

    /* ------------------------------ CAŁY EKRAN ------------------------------ */

    {
      id: 'gold_rain', group: G_SCREEN, name: 'Deszcz złota', dur: 5,
      init: () => ({ coins: [], sparks: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const lg = ctx.createLinearGradient(0, 0, 0, H * 0.45);
        lg.addColorStop(0, `rgba(255,190,60,${0.22 * a})`);
        lg.addColorStop(1, 'rgba(255,190,60,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H * 0.45);
        if (t < this.dur - 1.7) {
          s.acc += dt * (60 + 120 * clamp01(t / 0.6)) * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            s.coins.push({ x: rand(0, W), y: rand(-80, -10), vx: rand(-50, 50), vy: rand(80, 260), r: rand(7, 13), ph: rand(0, TAU), spin: rand(4, 11), rot: rand(-0.5, 0.5) });
          }
        }
        for (let i = s.coins.length - 1; i >= 0; i--) {
          const c = s.coins[i];
          c.vy += 650 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.ph += c.spin * dt;
          if (c.y > H + 30) { s.coins.splice(i, 1); continue; }
          const cs = Math.cos(c.ph), w = Math.max(1.3, Math.abs(cs) * c.r);
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.globalAlpha = a;
          const g = ctx.createLinearGradient(-w, -c.r, w, c.r);
          g.addColorStop(0, cs > 0 ? '#fff1a8' : '#f2c14a');
          g.addColorStop(0.5, cs > 0 ? '#ffc933' : '#d99a16');
          g.addColorStop(1, '#b8740c');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.ellipse(0, 0, w, c.r, 0, 0, TAU); ctx.fill();
          ctx.lineWidth = 1.4; ctx.strokeStyle = '#8f5708'; ctx.stroke();
          if (w > c.r * 0.45) {
            ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62, c.r * 0.62, 0, 0, TAU);
            ctx.strokeStyle = 'rgba(255,248,200,0.85)'; ctx.lineWidth = 1; ctx.stroke();
          }
          ctx.restore();
          if (Math.abs(cs) > 0.985 && Math.random() < 0.5) s.sparks.push({ x: c.x + rand(-4, 4), y: c.y - c.r * 0.4, l: 0, m: rand(0.25, 0.45), r: rand(6, 11) });
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = s.sparks.length - 1; i >= 0; i--) {
          const p = s.sparks[i];
          p.l += dt;
          if (p.l > p.m) { s.sparks.splice(i, 1); continue; }
          const k = Math.sin((p.l / p.m) * Math.PI);
          sparkleStar(ctx, p.x, p.y, p.r * k, a * k);
        }
      }
    },

    {
      id: 'aurora', group: G_SCREEN, name: 'Zorza polarna', dur: 6.5,
      init(env) {
        const mk = (rgb) => {
          const c = document.createElement('canvas'); c.width = 1; c.height = 256;
          const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
          gr.addColorStop(0, `rgba(${rgb},0)`);
          gr.addColorStop(0.7, `rgba(${rgb},0.35)`);
          gr.addColorStop(0.93, `rgba(${rgb},1)`);
          gr.addColorStop(0.97, 'rgba(255,255,255,0.9)');
          gr.addColorStop(1, `rgba(${rgb},0)`);
          g.fillStyle = gr; g.fillRect(0, 0, 1, 256); return c;
        };
        const H = env.H;
        const bands = [
          { spr: mk('60,255,170'), base: H * 0.3, amp: H * 0.07, fr: 0.006, sp: 0.9, h: H * 0.28, ph: rand(0, TAU) },
          { spr: mk('70,190,255'), base: H * 0.24, amp: H * 0.06, fr: 0.0045, sp: -0.7, h: H * 0.22, ph: rand(0, TAU) },
          { spr: mk('200,110,255'), base: H * 0.36, amp: H * 0.05, fr: 0.008, sp: 1.2, h: H * 0.18, ph: rand(0, TAU) },
        ];
        const stars = [];
        for (let i = 0; i < Math.round(140 * (env.density || 1)); i++) stars.push({ x: rand(0, env.W), y: rand(0, H * 0.55), r: rand(1.5, 4), tw: rand(1.5, 5), ph: rand(0, TAU) });
        const meteors = [{ t0: 1.3, x: env.W * rand(0.6, 0.9), y: H * 0.05 }, { t0: 3.6, x: env.W * rand(0.3, 0.6), y: H * 0.08 }];
        return { bands, stars, meteors };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const dark = ctx.createLinearGradient(0, 0, 0, H * 0.7);
        dark.addColorStop(0, `rgba(4,8,28,${0.55 * a})`);
        dark.addColorStop(1, 'rgba(4,8,28,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H * 0.7);
        ctx.globalCompositeOperation = 'lighter';
        for (const st of s.stars) dot(ctx, '230,240,255', st.x, st.y, st.r * 2, a * (0.2 + 0.8 * Math.abs(Math.sin(t * st.tw + st.ph))), true);
        const step = 4;
        for (const b of s.bands) {
          for (let x = -step; x < W + step; x += step) {
            const y = b.base + Math.sin(x * b.fr + t * b.sp + b.ph) * b.amp + Math.sin(x * b.fr * 2.3 - t * b.sp * 1.7) * b.amp * 0.35;
            const inten = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(x * 0.011 + t * 1.4 + b.ph * 2), 2);
            const h = b.h * (0.6 + 0.4 * inten);
            ctx.globalAlpha = a * 0.5 * inten;
            ctx.drawImage(b.spr, x, y - h, step + 1, h);
          }
        }
        ctx.globalAlpha = 1;
        for (const m of s.meteors) {
          const tt = t - m.t0; if (tt < 0 || tt > 0.9) continue;
          const f = tt / 0.9, hx = m.x - f * W * 0.35, hy = m.y + f * H * 0.25;
          const g = ctx.createLinearGradient(hx, hy, hx + 140, hy - 100);
          g.addColorStop(0, `rgba(255,255,255,${(1 - f) * a})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 140, hy - 100); ctx.stroke();
          dot(ctx, '200,230,255', hx, hy, 10, (1 - f) * a, true);
        }
      }
    },

    {
      id: 'fireflies', group: G_SCREEN, name: 'Świetliki', dur: 6.5,
      init(env) {
        const cols = ['190,255,90', '255,230,110', '130,255,170'];
        return { f: Array.from({ length: Math.round(110 * (env.density || 1)) }, () => ({ x: rand(0, env.W), y: rand(env.H * 0.2, env.H), an: rand(0, TAU), sp: rand(20, 55),
          fr: rand(0.6, 1.6), pf: rand(1.5, 4), ph: rand(0, TAU), c: pick(cols), r: rand(3, 6), d: rand(0, 1.8) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        vignette(ctx, W, H, '0,15,8', 0.5 * a);
        ctx.globalCompositeOperation = 'lighter';
        for (const p of s.f) {
          p.an += Math.sin(t * p.fr + p.ph) * 2.2 * dt;
          p.x += Math.cos(p.an) * p.sp * dt;
          p.y += Math.sin(p.an) * p.sp * dt - 18 * dt;
          const pulse = Math.pow(0.5 + 0.5 * Math.sin(t * p.pf + p.ph), 2);
          const al = a * clamp01((t - p.d) / 0.8) * (0.2 + 0.8 * pulse);
          dot(ctx, p.c, p.x, p.y, p.r * 7, al * 0.55);
          dot(ctx, p.c, p.x, p.y, p.r * 1.8, al, true);
        }
      }
    },

    {
      id: 'storm', group: G_SCREEN, name: 'Burza z piorunami', dur: 4,
      init: () => ({ bolts: [], next: 0.1, flash: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = `rgba(8,12,35,${0.45 * a})`; ctx.fillRect(0, 0, W, H);
        if (t >= s.next && t < this.dur - 0.7) {
          const sx = rand(W * 0.1, W * 0.9), ex = b.cx + rand(-W * 0.3, W * 0.3), ey = rand(H * 0.5, H * 0.9);
          const main = boltPath(sx, -10, ex, ey, 110);
          const br = [];
          for (let k = 0; k < 3; k++) {
            const [bx, by] = main[(rand(0.2, 0.7) * main.length) | 0];
            br.push(boltPath(bx, by, bx + rand(-220, 220), by + rand(80, 240), 50));
          }
          s.bolts.push({ main, br, t0: t, end: [ex, ey] });
          s.flash = 1; s.next = t + rand(0.25, 0.7);
        }
        s.flash *= Math.pow(0.015, dt);
        ctx.fillStyle = `rgba(190,215,255,${s.flash * 0.28 * a})`; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let i = s.bolts.length - 1; i >= 0; i--) {
          const bo = s.bolts[i], age = t - bo.t0;
          if (age > 0.5) { s.bolts.splice(i, 1); continue; }
          const al = (1 - age / 0.5) * (Math.random() > 0.25 ? 1 : 0.35) * a;
          ctx.globalAlpha = al;
          strokePts(ctx, bo.main, 12, 'rgba(90,140,255,0.35)');
          strokePts(ctx, bo.main, 5, 'rgba(160,200,255,0.8)');
          strokePts(ctx, bo.main, 2, '#ffffff');
          bo.br.forEach(p => { strokePts(ctx, p, 4, 'rgba(120,170,255,0.5)'); strokePts(ctx, p, 1.2, '#ffffff'); });
          dot(ctx, '150,190,255', bo.end[0], bo.end[1], 110, al, true);
        }
      }
    },

    {
      id: 'sakura', group: G_SCREEN, name: 'Płatki wiśni', dur: 6.5,
      init(env) {
        return { p: Array.from({ length: Math.round(160 * (env.density || 1)) }, () => ({ x: rand(-0.2, 1) * env.W, y: rand(-0.3, 1) * env.H, vx: rand(25, 75), vy: rand(45, 100),
          rot: rand(0, TAU), vr: rand(-2, 2), ph: rand(0, TAU), z: rand(9, 15), c: pick(['255,183,197', '255,205,218', '255,160,188', '255,228,236']) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        vignette(ctx, W, H, '255,190,215', 0.18 * a, 0.4);
        for (const p of s.p) {
          p.x += (p.vx + Math.sin(t * 1.5 + p.ph) * 35) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          if (p.y > H + 20) continue;
          const fl = Math.max(0.15, Math.abs(Math.cos(t * 3 + p.ph))), z = p.z;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, fl);
          ctx.beginPath();
          ctx.moveTo(0, -z); ctx.quadraticCurveTo(z * 0.85, -z * 0.25, 0, z);
          ctx.quadraticCurveTo(-z * 0.85, -z * 0.25, 0, -z);
          ctx.globalAlpha = a * 0.92; ctx.fillStyle = `rgb(${p.c})`; ctx.fill();
          ctx.globalAlpha = a * 0.4; ctx.strokeStyle = 'rgb(235,120,150)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(0, -z * 0.6); ctx.lineTo(0, z * 0.7); ctx.stroke();
          ctx.restore();
        }
      }
    },

    {
      id: 'snow', group: G_SCREEN, name: 'Śnieżyca', dur: 6.5,
      init(env) {
        return { f: Array.from({ length: Math.round(170 * (env.density || 1)) }, () => ({ x: rand(0, env.W), y: rand(-0.2, 1) * env.H, vy: rand(30, 90), z: rand(2, 8), ph: rand(0, TAU), vr: rand(-1, 1) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const top = ctx.createLinearGradient(0, 0, 0, H);
        top.addColorStop(0, `rgba(190,215,255,${0.28 * a})`); top.addColorStop(1, `rgba(190,215,255,${0.08 * a})`);
        ctx.globalAlpha = 1; ctx.fillStyle = top; ctx.fillRect(0, 0, W, H);
        ctx.lineCap = 'round';
        for (const f of s.f) {
          f.y += f.vy * dt * (0.6 + f.z / 10); f.x += Math.sin(t * 0.9 + f.ph) * 25 * dt;
          if (f.y > H + 10) { f.y = -10; f.x = rand(0, W); }
          if (f.z < 5) { ctx.globalCompositeOperation = 'lighter'; dot(ctx, '240,248,255', f.x, f.y, f.z * 1.6, a * 0.85, true); continue; }
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(t * f.vr + f.ph);
          ctx.globalAlpha = a * 0.95; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.moveTo(0, 0); ctx.lineTo(0, -f.z);
            ctx.moveTo(0, -f.z * 0.55); ctx.lineTo(f.z * 0.25, -f.z * 0.8);
            ctx.moveTo(0, -f.z * 0.55); ctx.lineTo(-f.z * 0.25, -f.z * 0.8);
          }
          ctx.stroke(); ctx.restore();
        }
      }
    },

    {
      id: 'bubbles', group: G_SCREEN, name: 'Podwodne bąbelki', dur: 6,
      init(env) {
        return { b: Array.from({ length: Math.round(110 * (env.density || 1)) }, () => ({ x: rand(0, env.W), y: env.H * rand(0.25, 1.7), vy: rand(-170, -60), r: rand(5, 20), ph: rand(0, TAU) })) };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        const g = ctx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, `rgba(0,90,130,${0.4 * a})`); g.addColorStop(1, `rgba(0,60,110,${0.12 * a})`);
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // promienie światła z góry
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const x = W * (0.15 + i * 0.18) + Math.sin(t * 0.6 + i) * 40;
          const rg = ctx.createLinearGradient(0, 0, 0, H * 0.8);
          rg.addColorStop(0, `rgba(150,230,255,${0.12 * a})`); rg.addColorStop(1, 'rgba(150,230,255,0)');
          ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 90, H * 0.8); ctx.lineTo(x - 50, H * 0.8); ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        for (const q of s.b) {
          q.y += q.vy * dt; q.x += Math.sin(t * 2 + q.ph) * 22 * dt;
          if (q.y < -q.r) continue;
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU);
          ctx.fillStyle = 'rgba(160,225,255,0.12)'; ctx.fill();
          ctx.strokeStyle = 'rgba(210,245,255,0.75)'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.beginPath(); ctx.arc(q.x - q.r * 0.35, q.y - q.r * 0.35, q.r * 0.28, 0, TAU);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
        }
      }
    },

    {
      id: 'rune_rain', group: G_SCREEN, name: 'Deszcz run', dur: 5.5,
      init(env) {
        const cols = [];
        for (let x = 8; x < env.W; x += 20) cols.push({ x, y: rand(-env.H, 0), sp: rand(220, 520), n: 8 + ((Math.random() * 14) | 0),
          g: Array.from({ length: 24 }, () => (Math.random() * GLYPHS.length) | 0) });
        return { cols };
      },
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,12,4,${0.5 * a})`; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        for (const c of s.cols) {
          c.y += c.sp * dt;
          if (c.y - c.n * 22 > H) { c.y = rand(-200, 0); c.sp = rand(220, 520); }
          if (Math.random() < dt * 8) c.g[(Math.random() * c.g.length) | 0] = (Math.random() * GLYPHS.length) | 0;
          for (let j = 0; j < c.n; j++) {
            const y = c.y - j * 22;
            if (y < -20 || y > H + 20) continue;
            ctx.globalAlpha = a * (j === 0 ? 1 : 0.85 * (1 - j / c.n));
            ctx.drawImage(glyphSprite(c.g[j % c.g.length], j === 0 ? '220,255,230' : '70,255,130'), c.x - 10, y - 13);
          }
          dot(ctx, '120,255,160', c.x, c.y, 12, a * 0.6);
        }
      }
    },

    {
      id: 'disco', group: G_SCREEN, name: 'Dyskoteka', dur: 6.5,
      init: () => ({ dots: Array.from({ length: 70 }, () => ({ an: rand(0, TAU), r: rand(0.15, 1), sp: rand(0.25, 0.7) * (Math.random() < 0.5 ? -1 : 1), c: hsl(Math.random(), 1, 0.62) })) }),
      frame(ctx, s, t, dt, a, W, H) {
        const bx = W / 2, by = Math.min(90, H * 0.12), br = 34;
        const beat = (t * 2.2) % 1, flash = Math.pow(1 - beat, 4), bc = hsl(Math.floor(t * 2.2) * 0.17, 1, 0.55);
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(6,0,18,${0.55 * a})`; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${bc},${0.13 * flash * a})`; ctx.fillRect(0, 0, W, H);
        // reflektory
        for (let i = 0; i < 6; i++) {
          const sx = W * (i + 0.5) / 6, an = Math.PI / 2 + Math.sin(t * 1.3 + i * 1.1) * 0.65, L = H * 1.2, wdt = 0.12;
          const col = hsl(i / 6 + t * 0.08, 1, 0.6);
          const g = ctx.createLinearGradient(sx, 0, sx + Math.cos(an) * L, Math.sin(an) * L);
          g.addColorStop(0, `rgba(${col},${0.45 * a})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.moveTo(sx, 0);
          ctx.lineTo(sx + Math.cos(an - wdt) * L, Math.sin(an - wdt) * L); ctx.lineTo(sx + Math.cos(an + wdt) * L, Math.sin(an + wdt) * L);
          ctx.closePath(); ctx.fill();
        }
        // odbicia kuli
        for (const d of s.dots) {
          const an = d.an + t * d.sp;
          dot(ctx, d.c, bx + Math.cos(an) * d.r * W * 0.6, H * 0.55 + Math.sin(an) * d.r * H * 0.42, 9, a * (0.5 + 0.5 * flash), true);
        }
        // kula disco
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, by - br); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.clip();
        ctx.fillStyle = '#556'; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
        const tile = 7;
        for (let y = -br; y < br; y += tile) for (let x = -br; x < br; x += tile) {
          const v = 0.5 + 0.5 * Math.sin(x * 0.7 + y * 1.3 + t * 7);
          ctx.fillStyle = `rgb(${Math.round(120 + 135 * v)},${Math.round(120 + 135 * v)},${Math.round(140 + 115 * v)})`;
          ctx.fillRect(bx + x + 0.5, by + y + 0.5, tile - 1, tile - 1);
        }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter';
        dot(ctx, '255,255,255', bx - br * 0.35, by - br * 0.35, 14, a * 0.8, true);
        if (Math.random() < 0.3) sparkleStar(ctx, bx + rand(-br, br) * 0.8, by + rand(-br, br) * 0.8, 12, a);
      }
    },

    {
      id: 'earthquake', group: G_SCREEN, name: 'Trzęsienie ziemi', dur: 4.5,
      init(env) {
        const cr = (x, y, ang, len) => {
          const pts = [[x, y]]; let cx = x, cy = y, an = ang;
          for (let i = 0; i < 16; i++) { an += rand(-0.5, 0.5); cx += Math.sin(an) * len / 16; cy -= Math.cos(an) * len / 16; pts.push([cx, cy]); }
          return pts;
        };
        const cracks = [];
        for (let i = 0; i < 6; i++) {
          const main = cr(rand(0.1, 0.9) * env.W, env.H + 5, rand(-0.5, 0.5), rand(env.H * 0.3, env.H * 0.6));
          const j = 5 + ((Math.random() * 7) | 0);
          cracks.push({ pts: main, d: rand(0, 1.1) }, { pts: cr(main[j][0], main[j][1], rand(-1.3, 1.3), rand(60, 150)), d: rand(0.4, 1.5) });
        }
        return { cracks, rocks: [], dust: [] };
      },
      frame(ctx, s, t, dt, a, W, H) {
        const k = clamp01(t / 0.3) * clamp01((this.dur - 0.4 - t) / 2);
        shakeScreen(11 * k * a * (0.65 + 0.35 * Math.sin(t * 31)));
        const g = ctx.createLinearGradient(0, H, 0, H * 0.4);
        g.addColorStop(0, `rgba(60,30,10,${0.35 * a})`); g.addColorStop(1, 'rgba(60,30,10,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, H * 0.4, W, H * 0.6);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (const c of s.cracks) {
          const gg = easeOut(clamp01((t - c.d) / 0.6)), n = Math.floor(gg * (c.pts.length - 1));
          if (n < 1) continue;
          const part = c.pts.slice(0, n + 1);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
          strokePts(ctx, part, 5, 'rgba(25,12,5,0.9)');
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 9 + c.d * 5));
          strokePts(ctx, part, 1.6, 'rgba(255,120,30,0.9)');
        }
        if (Math.random() < dt * 22 * k) s.rocks.push({ x: rand(0, W), y: -10, vx: rand(-30, 30), vy: rand(50, 200), rot: rand(0, TAU), vr: rand(-6, 6), z: rand(3, 8) });
        if (Math.random() < dt * 30 * k) s.dust.push({ x: rand(0, W), y: H - rand(0, 40), l: 0, m: rand(1, 1.8), r: rand(25, 55) });
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.dust.length - 1; i >= 0; i--) {
          const d = s.dust[i];
          d.l += dt; const f = d.l / d.m; if (f >= 1) { s.dust.splice(i, 1); continue; }
          d.y -= 25 * dt;
          dot(ctx, '150,125,95', d.x, d.y, d.r * (1 + f), a * 0.35 * Math.sin(f * Math.PI));
        }
        for (let i = s.rocks.length - 1; i >= 0; i--) {
          const r = s.rocks[i];
          r.vy += 900 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt;
          if (r.y > H + 20) { s.rocks.splice(i, 1); continue; }
          ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot); ctx.globalAlpha = a;
          ctx.fillStyle = '#6d6259'; ctx.beginPath();
          ctx.moveTo(-r.z, -r.z * 0.3); ctx.lineTo(-r.z * 0.2, -r.z); ctx.lineTo(r.z, -r.z * 0.4); ctx.lineTo(r.z * 0.6, r.z * 0.8); ctx.lineTo(-r.z * 0.7, r.z * 0.6);
          ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#3d352f'; ctx.lineWidth = 1; ctx.stroke();
          ctx.restore();
        }
      }
    },

    {
      id: 'blizzard', group: G_SCREEN, name: 'Zamieć', dur: 6.5,
      init(env) {
        return {
          p: Array.from({ length: Math.round(450 * (env.density || 1)) }, () => ({ x: rand(0, env.W), y: rand(0, env.H), z: rand(0.3, 1) })),
          fog: Array.from({ length: 8 }, () => ({ x: rand(0, env.W), y: rand(0, env.H), r: rand(160, 360), sp: rand(0.5, 1.1) })),
        };
      },
      frame(ctx, s, t, dt, a, W, H) {
        const gust = 0.7 + 0.3 * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 5.3), vx = 950 * gust, vy = 280;
        vignette(ctx, W, H, '225,238,255', 0.6 * a, 0.2);
        ctx.fillStyle = `rgba(215,228,245,${0.16 * a * gust})`; ctx.fillRect(0, 0, W, H);
        for (const f of s.fog) {
          f.x += vx * 0.22 * f.sp * dt; if (f.x - f.r > W) { f.x = -f.r; f.y = rand(0, H); }
          dot(ctx, '240,246,255', f.x, f.y, f.r, 0.22 * a);
        }
        ctx.lineCap = 'round';
        for (const [lo, hi, lw, al] of [[0.3, 0.55, 1, 0.45], [0.55, 0.8, 1.6, 0.7], [0.8, 1.01, 2.4, 0.95]]) {
          ctx.beginPath();
          for (const p of s.p) {
            if (p.z < lo || p.z >= hi) continue;
            p.x += vx * p.z * dt; p.y += vy * p.z * dt;
            if (p.x > W + 30 || p.y > H + 30) { if (Math.random() < 0.5) { p.x = -20; p.y = rand(-20, H); } else { p.x = rand(-20, W); p.y = -20; } }
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - vx * p.z * 0.02, p.y - vy * p.z * 0.02);
          }
          ctx.globalAlpha = a * al; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw; ctx.stroke();
        }
      }
    },

    {
      id: 'meteors', group: G_SCREEN, name: 'Deszcz meteorów', dur: 5.5,
      init: () => ({ m: [], acc: 0.8, fx: [], deb: [], hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(25,6,0,${0.38 * a})`; ctx.fillRect(0, 0, W, H);
        const top = ctx.createLinearGradient(0, 0, 0, H * 0.4);
        top.addColorStop(0, `rgba(255,80,20,${0.22 * a})`); top.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.4);
        if (t < this.dur - 1.4) {
          s.acc += dt * 5 * (o.density || 1);
          while (s.acc >= 1) {
            s.acc--;
            const x0 = rand(W * 0.25, W * 1.15), x1 = x0 - rand(W * 0.2, W * 0.45);
            s.m.push({ x0, y0: -40, x1, y1: rand(H * 0.55, H * 0.95), t0: t, T: rand(0.55, 0.9), z: rand(6, 12) });
          }
        }
        shakeScreen(7 * clamp01(1 - (t - s.hit) / 0.3) * a);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = s.m.length - 1; i >= 0; i--) {
          const m = s.m[i], f = (t - m.t0) / m.T;
          if (f >= 1) {
            s.m.splice(i, 1); s.hit = t;
            s.fx.push({ x: m.x1, y: m.y1, l: 0 });
            for (let j = 0; j < 22; j++) { const an = rand(Math.PI, TAU), sp = rand(100, 380); s.deb.push({ x: m.x1, y: m.y1, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: rand(0.5, 1.1) }); }
            continue;
          }
          const x = m.x0 + (m.x1 - m.x0) * f, y = m.y0 + (m.y1 - m.y0) * f;
          const dx = m.x1 - m.x0, dy = m.y1 - m.y0, len = Math.hypot(dx, dy), tl = 22 * m.z;
          const tx = x - dx / len * tl, ty = y - dy / len * tl;
          const g = ctx.createLinearGradient(x, y, tx, ty);
          g.addColorStop(0, `rgba(255,235,190,${a})`); g.addColorStop(0.3, `rgba(255,140,40,${0.7 * a})`); g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = m.z; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
          dot(ctx, '255,170,70', x, y, m.z * 3.2, a, true);
        }
        for (let i = s.fx.length - 1; i >= 0; i--) {
          const q = s.fx[i];
          q.l += dt; if (q.l > 0.7) { s.fx.splice(i, 1); continue; }
          const f = q.l / 0.7;
          dot(ctx, '255,160,60', q.x, q.y, 90 * (1 - f * 0.5), a * (1 - f), true);
          ctx.globalAlpha = 1; ctx.strokeStyle = `rgba(255,190,110,${(1 - f) * a})`; ctx.lineWidth = 4 * (1 - f) + 1;
          ctx.beginPath(); ctx.ellipse(q.x, q.y, easeOut(f) * 120, easeOut(f) * 35, 0, 0, TAU); ctx.stroke();
        }
        for (let i = s.deb.length - 1; i >= 0; i--) {
          const q = s.deb[i];
          q.l += dt; if (q.l > q.m) { s.deb.splice(i, 1); continue; }
          q.vy += 800 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, '255,150,50', q.x, q.y, 5, a * (1 - q.l / q.m), true);
        }
      }
    },

    {
      id: 'fireworks2', group: G_SCREEN, name: 'Pokaz fajerwerków', dur: 6.5,
      init: () => ({ r: [], p: [], fl: [], next: 0.1 }),
      frame(ctx, s, t, dt, a, W, H, b, o = {}) {
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(0,0,18,${0.4 * a})`; ctx.fillRect(0, 0, W, H);
        if (t >= s.next && t < this.dur - 2) {
          s.r.push({ x: rand(W * 0.15, W * 0.85), y: H + 10, vx: rand(-60, 60), vy: -rand(720, 960), ty: rand(H * 0.12, H * 0.45), hue: Math.random(), type: pick(['kula', 'kula', 'wierzba', 'pierścień']) });
          s.next = t + rand(0.15, 0.35) / (o.density || 1);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = s.r.length - 1; i >= 0; i--) {
          const r = s.r[i];
          r.vy += 480 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
          dot(ctx, '255,220,160', r.x, r.y, 6, a, true);
          dot(ctx, '255,160,60', r.x - r.vx * 0.02, r.y - r.vy * 0.02, 5, a * 0.6);
          if (r.vy > -90 || r.y < r.ty) {
            s.r.splice(i, 1);
            s.fl.push({ x: r.x, y: r.y, l: 0, c: hsl(r.hue, 1, 0.65) });
            const n = r.type === 'pierścień' ? 70 : 130;
            for (let j = 0; j < n; j++) {
              const an = (j / n) * TAU + rand(-0.05, 0.05);
              const sp = r.type === 'pierścień' ? 380 : rand(120, 460);
              const will = r.type === 'wierzba';
              s.p.push({ x: r.x, y: r.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: will ? rand(1.8, 2.6) : rand(1, 1.6),
                c: will ? '255,200,90' : hsl(r.hue + rand(-0.05, 0.05), 1, 0.62), g: will ? 160 : 110, tw: Math.random() < 0.4 });
            }
          }
        }
        for (let i = s.fl.length - 1; i >= 0; i--) {
          const q = s.fl[i];
          q.l += dt; if (q.l > 0.35) { s.fl.splice(i, 1); continue; }
          dot(ctx, q.c, q.x, q.y, 140 * (1 - q.l / 0.35), a * (1 - q.l / 0.35) * 0.7, true);
        }
        const drag = Math.pow(0.3, dt);
        for (let i = s.p.length - 1; i >= 0; i--) {
          const q = s.p[i];
          q.l += dt; const f = q.l / q.m; if (f >= 1) { s.p.splice(i, 1); continue; }
          dot(ctx, q.c, q.x, q.y, 14, a * (1 - f) * 0.25);
          q.vx *= drag; q.vy = q.vy * drag + q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          const tw = q.tw && f > 0.5 ? (Math.random() < 0.5 ? 1 : 0.2) : 1;
          dot(ctx, q.c, q.x, q.y, 6.5, a * (1 - f) * tw, true);
        }
      }
    },

    {
      id: 'leaves', group: G_SCREEN, name: 'Jesienne liście', dur: 6.5,
      init(env) {
        return { l: Array.from({ length: Math.round(95 * (env.density || 1)) }, () => ({ x: rand(-0.3, 1) * env.W, y: rand(-0.2, 1) * env.H, vx: rand(70, 150), vy: rand(30, 75),
          rot: rand(0, TAU), vr: rand(-2.5, 2.5), ph: rand(0, TAU), z: rand(8, 14), c: pick(['214,92,26', '236,140,32', '190,50,30', '240,180,40', '150,80,30']) })) };
      },
      frame(ctx, s, t, dt, a, W, H) {
        vignette(ctx, W, H, '120,60,10', 0.25 * a, 0.35);
        const gust = 0.8 + 0.4 * Math.sin(t * 1.3);
        for (const p of s.l) {
          p.x += (p.vx * gust + Math.sin(t * 2 + p.ph) * 40) * dt; p.y += (p.vy + Math.cos(t * 1.5 + p.ph) * 30) * dt; p.rot += p.vr * dt;
          if (p.x > W + 30) { p.x = -30; p.y = rand(-50, H * 0.8); }
          if (p.y > H + 30) continue;
          const z = p.z;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.3 + 0.7 * Math.abs(Math.cos(t * 2 + p.ph)));
          ctx.globalAlpha = a;
          ctx.beginPath(); ctx.moveTo(0, -z);
          ctx.bezierCurveTo(z * 0.8, -z * 0.5, z * 0.6, z * 0.6, 0, z);
          ctx.bezierCurveTo(-z * 0.6, z * 0.6, -z * 0.8, -z * 0.5, 0, -z);
          ctx.fillStyle = `rgb(${p.c})`; ctx.fill();
          ctx.strokeStyle = 'rgba(80,35,10,0.7)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(0, -z * 0.8); ctx.lineTo(0, z * 1.25); ctx.stroke();
          ctx.restore();
        }
      }
    },

    /* ------------------------ PO ŁUPIE: ZDOBYTY (do torby) ------------------------ */
    /* o.out = { img, el, from:{x,y}, to:{x,y}, base, reason, name } */

    {
      id: 'win_arc', group: G_WIN, name: 'Lot do torby', dur: 4,
      init: () => ({ tr: [], sp: [], hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.0, big = 64 * (o.itemScale || 1);
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeInOut(t / T), p = arcPoint(u.from, u.to, f, 220);
          const z = big + (u.base - big) * f;
          s.tr.push({ x: p.x, y: p.y, l: 0 });
          dot(ctx, '255,180,50', p.x, p.y, z, a * 0.7);
          drawItem(ctx, u.img, p.x, p.y, z, f * TAU * 2, 1, a, true);
        } else if (!s.hit) { s.hit = true; burst(s.sp, u.to, 50, 120, 380, ['255,220,120', '255,170,50', '255,255,220']); }
        trailDraw(ctx, s.tr, dt, a, '255,200,90', 14);
        if (s.hit) { const tt = t - T; ringFx(ctx, u.to, tt, 0.8, 90, '255,210,120', a); glowPulse(ctx, u.to, tt, a); }
        sparksDraw(ctx, s.sp, dt, a, 500);
      }
    },

    {
      id: 'win_comet', group: G_WIN, name: 'Kometa', dur: 3.5,
      init: () => ({ sp: [], hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 0.7;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = Math.pow(t / T, 2), x = u.from.x + (u.to.x - u.from.x) * f, y = u.from.y + (u.to.y - u.from.y) * f;
          const dx = u.to.x - u.from.x, dy = u.to.y - u.from.y, L = Math.hypot(dx, dy) || 1, tl = 60 + 180 * f;
          const g = ctx.createLinearGradient(x, y, x - dx / L * tl, y - dy / L * tl);
          g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(0.4, `rgba(255,140,40,${0.7 * a})`); g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 14; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / L * tl, y - dy / L * tl); ctx.stroke();
          dot(ctx, '255,190,80', x, y, 36, a, true);
          drawItem(ctx, u.img, x, y, u.base * 1.4, 0, 1, a, true);
        } else if (s.hit < 0) { s.hit = t; burst(s.sp, u.to, 80, 150, 520, ['255,200,90', '255,120,30', '255,240,200']); }
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(5 * clamp01(1 - tt / 0.25) * a);
          dot(ctx, '255,220,150', u.to.x, u.to.y, 140 * clamp01(1 - tt / 0.5), a * clamp01(1 - tt / 0.5), true);
          ringFx(ctx, u.to, tt, 0.7, 160, '255,170,60', a);
          ringFx(ctx, u.to, tt - 0.12, 0.7, 110, '255,230,160', a);
        }
        sparksDraw(ctx, s.sp, dt, a, 450);
      }
    },

    {
      id: 'win_spiral', group: G_WIN, name: 'Spirala', dur: 4,
      init: () => ({ tr: [], sp: [], hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T1 = 0.6, T2 = 1.7, R = 90;
        ctx.globalCompositeOperation = 'lighter';
        let p = null;
        if (t < T1) {
          const f = easeOut(t / T1);
          p = { x: u.from.x + (u.to.x + R - u.from.x) * f, y: u.from.y + (u.to.y - u.from.y) * f };
        } else if (t < T2) {
          const f = (t - T1) / (T2 - T1), r = R * (1 - easeInOut(f)), an = f * TAU * 2.5;
          p = { x: u.to.x + Math.cos(an) * r, y: u.to.y + Math.sin(an) * r * 0.8 };
        } else if (!s.hit) { s.hit = true; burst(s.sp, u.to, 60, 100, 330, ['170,120,255', '120,220,255', '255,150,230']); }
        if (p) {
          o.hideItem();
          s.tr.push({ x: p.x, y: p.y, l: 0, c: hsl(t * 0.8, 1, 0.65) });
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.5, t * 6, 1, a, true);
        }
        for (let i = s.tr.length - 1; i >= 0; i--) {
          const q = s.tr[i]; q.l += dt; if (q.l > 0.6) { s.tr.splice(i, 1); continue; }
          dot(ctx, q.c, q.x, q.y, 10 * (1 - q.l / 0.6), a * (1 - q.l / 0.6), true);
        }
        if (s.hit) { const tt = t - T2; dot(ctx, '220,200,255', u.to.x, u.to.y, 90 * clamp01(1 - tt / 0.5), a * clamp01(1 - tt / 0.5), true); ringFx(ctx, u.to, tt, 0.8, 100, '190,150,255', a); }
        sparksDraw(ctx, s.sp, dt, a, 300);
      }
    },

    {
      id: 'win_firework', group: G_WIN, name: 'Fajerwerk w torbie', dur: 4,
      init: () => ({ tr: [], sp: [], n: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 0.9;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeInOut(t / T), p = arcPoint(u.from, u.to, f, 260);
          s.tr.push({ x: p.x, y: p.y, l: 0 });
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.6, 0, 1, a, true);
        }
        for (const [k, tk] of [[1, T], [2, T + 0.35], [3, T + 0.7]]) {
          if (t >= tk && s.n < k) {
            s.n = k;
            const hue = Math.random(), n = 110;
            for (let i = 0; i < n; i++) { const an = (i / n) * TAU, sp = rand(140, 360) * (k === 2 ? 0.7 : 1); s.sp.push({ x: u.to.x, y: u.to.y - (k - 1) * 30, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: rand(0.9, 1.5), c: hsl(hue + rand(-0.05, 0.05), 1, 0.62) }); }
          }
        }
        trailDraw(ctx, s.tr, dt, a, '255,220,160', 6);
        const drag = Math.pow(0.3, dt);
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i]; q.l += dt; const f = q.l / q.m; if (f >= 1) { s.sp.splice(i, 1); continue; }
          q.vx *= drag; q.vy = q.vy * drag + 120 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, q.c, q.x, q.y, 12, a * (1 - f) * 0.25);
          dot(ctx, q.c, q.x, q.y, 5.5, a * (1 - f), true);
        }
      }
    },

    {
      id: 'win_coins', group: G_WIN, name: 'Fontanna monet', dur: 4,
      init: () => ({ tr: [], c: [], hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 0.9;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeInOut(t / T), p = arcPoint(u.from, u.to, f, 200);
          s.tr.push({ x: p.x, y: p.y, l: 0 });
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.5, f * 8, 1, a, true);
        } else if (!s.hit) s.hit = true;
        trailDraw(ctx, s.tr, dt, a, '255,210,100', 10);
        if (s.hit && t < this.dur - 1.3 && Math.random() < dt * 45 * (o.density || 1) * 2) {
          for (let i = 0; i < 2; i++) s.c.push({ x: u.to.x, y: u.to.y, vx: rand(-160, 160), vy: rand(-620, -340), ph: rand(0, TAU), r: rand(5, 8) });
        }
        if (s.hit) glowPulse(ctx, u.to, t - T, a);
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.c.length - 1; i >= 0; i--) {
          const q = s.c[i];
          q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.ph += dt * 10;
          if (q.y > H + 20) { s.c.splice(i, 1); continue; }
          const w = Math.max(1, Math.abs(Math.cos(q.ph)) * q.r);
          ctx.globalAlpha = a; ctx.fillStyle = Math.cos(q.ph) > 0 ? '#ffd24a' : '#d99a16';
          ctx.beginPath(); ctx.ellipse(q.x, q.y, w, q.r, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#8f5708'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    },

    {
      id: 'win_portal', group: G_WIN, name: 'Portal w torbie', dur: 3.8,
      init: () => ({ p: Array.from({ length: 90 }, () => ({ r: rand(0.6, 1.6), an: rand(0, TAU), sp: rand(1, 2) })), done: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.2;
        const open = easeOutBack(clamp01(t / 0.5)), close = clamp01((t - T - 0.2) / 0.5), R = Math.max(1, 46 * open * (1 - close));
        ctx.globalCompositeOperation = 'lighter';
        for (const [rr, col, sp] of [[1, '160,90,255', 2], [0.75, '90,210,255', -3]]) {
          ctx.save(); ctx.translate(u.to.x, u.to.y); ctx.rotate(t * sp);
          ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 14; ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 3; ctx.globalAlpha = a;
          ctx.setLineDash([R * 0.5, R * 0.2]); ctx.beginPath(); ctx.ellipse(0, 0, R * rr, R * rr * 0.85, 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        ctx.setLineDash([]);
        for (const q of s.p) {
          q.r -= dt * 0.8 * q.sp; q.an += dt * q.sp * 4 / (q.r + 0.3); if (q.r < 0.1) q.r = rand(1.2, 1.6);
          dot(ctx, '190,130,255', u.to.x + Math.cos(q.an) * q.r * R * 1.6, u.to.y + Math.sin(q.an) * q.r * R * 1.3, 4, a * clamp01(q.r) * (1 - close), true);
        }
        if (t < T) {
          o.hideItem();
          const f = easeIn(t / T), an = f * TAU * 1.5, r = (1 - f) * 70;
          const x = u.from.x + (u.to.x - u.from.x) * f + Math.cos(an) * r, y = u.from.y + (u.to.y - u.from.y) * f + Math.sin(an) * r;
          drawItem(ctx, u.img, x, y, u.base * (1.8 - 0.8 * f), an, 1, a, true);
        } else if (s.done < 0) s.done = t;
        if (s.done > 0) dot(ctx, '220,190,255', u.to.x, u.to.y, 100 * clamp01(1 - (t - s.done) / 0.5), a * clamp01(1 - (t - s.done) / 0.5), true);
      }
    },

    {
      id: 'win_teleport', group: G_WIN, name: 'Teleportacja', dur: 3.5,
      init: () => ({ sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out;
        ctx.globalCompositeOperation = 'lighter';
        if (t < 0.9) o.hideItem();
        if (t < 0.45) { // znika w miejscu startu
          const f = t / 0.45;
          drawItem(ctx, u.img, u.from.x, u.from.y, u.base * 1.6 * (1 - f), 0, 1, a * (1 - f), true);
          const g = ctx.createLinearGradient(0, u.from.y - 160, 0, u.from.y + 20);
          g.addColorStop(0, 'rgba(140,220,255,0)'); g.addColorStop(1, `rgba(140,220,255,${0.6 * a})`);
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(u.from.x - 18 * (1 - f), u.from.y - 160, 36 * (1 - f), 180);
          if (Math.random() < 0.8) s.sp.push({ x: u.from.x + rand(-20, 20), y: u.from.y + rand(-20, 20), vx: 0, vy: rand(-160, -60), l: 0, m: 0.6, c: '160,230,255' });
        }
        if (t > 0.45 && t < 1.6) { // promień nad torbą
          const f = clamp01((t - 0.45) / 0.25) * clamp01((1.6 - t) / 0.5);
          const g = ctx.createLinearGradient(0, 0, 0, u.to.y);
          g.addColorStop(0, 'rgba(140,220,255,0)'); g.addColorStop(1, `rgba(170,235,255,${0.7 * a * f})`);
          ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(u.to.x - 22, 0, 44, u.to.y + 10);
          dot(ctx, '170,235,255', u.to.x, u.to.y, 60 * f, a * f, true);
          if (t > 0.6 && t < 0.9) { const k = (t - 0.6) / 0.3; drawItem(ctx, u.img, u.to.x, u.to.y, u.base * (0.3 + 0.9 * k), 0, 1, a, true); }
          if (Math.random() < 0.7) s.sp.push({ x: u.to.x + rand(-22, 22), y: rand(0, u.to.y), vx: 0, vy: rand(80, 200), l: 0, m: 0.7, c: '200,245,255' });
        }
        sparksDraw(ctx, s.sp, dt, a, 0);
      }
    },

    {
      id: 'win_bounce', group: G_WIN, name: 'Odbijanie', dur: 3.8,
      init: () => ({ puffs: [], sp: [], hops: 0, hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.5;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = t / T, hop = Math.abs(Math.sin(f * Math.PI * 3)), h = 120 * (1 - f * 0.6);
          const x = u.from.x + (u.to.x - u.from.x) * f, y = u.from.y + (u.to.y - u.from.y) * f - hop * h;
          const k = Math.floor(f * 3);
          if (k > s.hops) { s.hops = k; s.puffs.push({ x, y: y + 16, l: 0 }); }
          drawItem(ctx, u.img, x, y, u.base * 1.6, Math.sin(f * 30) * 0.2, 1, a, true);
        } else if (!s.hit) { s.hit = true; burst(s.sp, u.to, 40, 100, 300, ['255,240,150', '255,200,90']); }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.puffs.length - 1; i >= 0; i--) {
          const q = s.puffs[i]; q.l += dt; if (q.l > 0.6) { s.puffs.splice(i, 1); continue; }
          dot(ctx, '200,190,170', q.x, q.y, 18 + q.l * 40, a * 0.5 * (1 - q.l / 0.6));
        }
        ctx.globalCompositeOperation = 'lighter';
        if (s.hit) { const tt = t - T; for (let i = 0; i < 5; i++) { const an = i / 5 * TAU + tt * 3; sparkleStar(ctx, u.to.x + Math.cos(an) * 30 * (1 + tt), u.to.y + Math.sin(an) * 30 * (1 + tt), 12 * clamp01(1 - tt), a * clamp01(1 - tt)); } }
        sparksDraw(ctx, s.sp, dt, a, 400);
      }
    },

    {
      id: 'win_magnet', group: G_WIN, name: 'Magnes', dur: 3.5,
      init: () => ({ sp: [], hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (t < T) {
          o.hideItem();
          const f = easeIn(t / T);
          const x = u.from.x + (u.to.x - u.from.x) * f, y = u.from.y + (u.to.y - u.from.y) * f;
          for (let g = 1; g <= 4; g++) { const fg = Math.max(0, f - g * 0.06); drawItem(ctx, u.img, u.from.x + (u.to.x - u.from.x) * fg, u.from.y + (u.to.y - u.from.y) * fg, u.base * 1.4, 0, 1, a * 0.25 / g, false); }
          for (let k = 0; k < 2; k++) {
            ctx.globalAlpha = a * rand(0.5, 1);
            const pts = boltPath(x, y, u.to.x, u.to.y, 18, 5);
            strokePts(ctx, pts, 5, 'rgba(90,130,255,0.35)'); strokePts(ctx, pts, 1.4, '#e8f0ff');
          }
          drawItem(ctx, u.img, x, y, u.base * 1.5, 0, 1, a, true);
        } else if (!s.hit) { s.hit = true; burst(s.sp, u.to, 50, 120, 360, ['160,200,255', '230,240,255']); }
        dot(ctx, '140,180,255', u.to.x, u.to.y, 30 + 10 * Math.sin(t * 20), a * (t < T ? 0.8 : clamp01(1 - (t - T) / 0.6)), true);
        sparksDraw(ctx, s.sp, dt, a, 300);
      }
    },

    {
      id: 'win_confetti', group: G_WIN, name: 'Konfetti', dur: 4.2,
      init: () => ({ tr: [], c: [], hit: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 0.9;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeInOut(t / T), p = arcPoint(u.from, u.to, f, 220);
          s.tr.push({ x: p.x, y: p.y, l: 0 });
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.5, 0, 1, a, true);
        } else if (!s.hit) {
          s.hit = true;
          for (let i = 0; i < Math.round(140 * (o.density || 1)); i++) s.c.push({ x: u.to.x, y: u.to.y, vx: rand(-320, 320), vy: rand(-700, -250), rot: rand(0, TAU), vr: rand(-10, 10), w: rand(5, 9), h: rand(3, 5), c: hsl(Math.random(), 0.9, 0.6), ph: rand(0, TAU) });
        }
        trailDraw(ctx, s.tr, dt, a, '255,230,160', 8);
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.c.length - 1; i >= 0; i--) {
          const q = s.c[i];
          q.vx *= Math.pow(0.4, dt); q.vy = q.vy * Math.pow(0.5, dt) + 500 * dt; q.x += (q.vx + Math.sin(t * 5 + q.ph) * 30) * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
          if (q.y > H + 20) { s.c.splice(i, 1); continue; }
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(1, Math.cos(t * 8 + q.ph));
          ctx.globalAlpha = a; ctx.fillStyle = `rgb(${q.c})`; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
          ctx.restore();
        }
      }
    },

    {
      id: 'win_halo', group: G_WIN, name: 'Aureola', dur: 4,
      init: () => ({ tr: [], sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 0.9;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeInOut(t / T), p = arcPoint(u.from, u.to, f, 200);
          s.tr.push({ x: p.x, y: p.y, l: 0 });
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.5, 0, 1, a, true);
        } else {
          const tt = t - T, k = easeOutBack(clamp01(tt / 0.4));
          raysBehind(ctx, u.to.x, u.to.y, 80 * k, t, a);
          ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = 'rgb(255,220,120)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgb(255,200,80)'; ctx.shadowBlur = 12;
          ctx.beginPath(); ctx.ellipse(u.to.x, u.to.y - 30 - Math.sin(t * 3) * 3, 20 * k, 6 * k, 0, 0, TAU); ctx.stroke(); ctx.restore();
          if (Math.random() < dt * 15) s.sp.push({ x: u.to.x + rand(-30, 30), y: u.to.y + rand(-30, 30), l: 0 });
        }
        trailDraw(ctx, s.tr, dt, a, '255,230,170', 8);
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i]; q.l += dt; if (q.l > 0.4) { s.sp.splice(i, 1); continue; }
          const kk = Math.sin((q.l / 0.4) * Math.PI); sparkleStar(ctx, q.x, q.y, 10 * kk, a * kk);
        }
      }
    },

    /* ------------------------ PO ŁUPIE: UTRACONY (smutek) ------------------------ */

    {
      id: 'lose_rain', group: G_LOSE, name: 'Deszcz smutnych minek', dur: 4.5,
      init(env) { return { f: Array.from({ length: Math.round(45 * (env.density || 1)) }, () => ({ x: rand(0, env.W), y: rand(-env.H, -20), vy: rand(90, 220), r: rand(22, 44), rot: rand(-0.4, 0.4), vr: rand(-1, 1), ph: rand(0, TAU) })) }; },
      frame(ctx, s, t, dt, a, W, H, b, o) {
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(20,25,45,${0.25 * a})`; ctx.fillRect(0, 0, W, H);
        for (const q of s.f) {
          q.y += q.vy * dt; q.rot += q.vr * dt; q.x += Math.sin(t * 1.5 + q.ph) * 15 * dt;
          if (q.y > H + 40) continue;
          sadFace(ctx, q.x, q.y, q.r, a, t + q.ph, { rot: q.rot });
        }
        caption(ctx, o.out.reason, W / 2, H * 0.2, a * clamp01((t - 0.3) / 0.4));
      }
    },

    {
      id: 'lose_cry', group: G_LOSE, name: 'Płacząca minka', dur: 4.5,
      init: () => ({ tears: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, x = u.from.x, y = Math.max(140, u.from.y - 60), k = easeOutBack(clamp01(t / 0.5)), r = 105 * k;
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(15,20,40,${0.3 * a})`; ctx.fillRect(0, 0, W, H);
        const sob = 1 + Math.sin(t * 14) * 0.04;
        sadFace(ctx, x, y, r, a, t, { sy: sob, cry: true });
        if (k > 0.9) for (const sd of [-1, 1]) if (Math.random() < dt * 30) s.tears.push({ x: x + sd * r * 0.38, y: y - r * 0.05, vx: sd * rand(50, 150), vy: rand(-40, 20), l: 0 });
        for (let i = s.tears.length - 1; i >= 0; i--) {
          const q = s.tears[i]; q.l += dt; q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          if (q.y > H + 10) { s.tears.splice(i, 1); continue; }
          tearDrop(ctx, q.x, q.y, 8, a);
        }
        caption(ctx, u.reason, x, y + r + 34, a * clamp01((t - 0.4) / 0.4));
      }
    },

    {
      id: 'lose_cloud', group: G_LOSE, name: 'Burzowa chmurka', dur: 4.5,
      init: () => ({ drops: [], flash: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, cx = u.from.x, cy = Math.max(90, u.from.y - 170), k = easeOut(clamp01(t / 0.5));
        // przemoczony, szary przedmiot
        drawItem(ctx, u.img, u.from.x, u.from.y + Math.sin(t * 2) * 2, u.base * 3, 0, 1, a, false, 'grayscale(1) brightness(0.7)');
        if (Math.random() < dt * 70) s.drops.push({ x: cx + rand(-110, 110), y: cy + 30, vy: rand(300, 420) });
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(150,180,230,0.8)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = s.drops.length - 1; i >= 0; i--) {
          const q = s.drops[i]; q.y += q.vy * dt;
          if (q.y > u.from.y + 60) { s.drops.splice(i, 1); continue; }
          ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - 1, q.y + 9);
        }
        ctx.globalAlpha = a; ctx.stroke();
        if (Math.random() < dt * 0.8) s.flash = 1;
        s.flash *= Math.pow(0.01, dt);
        for (const [dx, dy, r] of [[-80, 14, 50], [-27, -14, 64], [40, -7, 58], [90, 18, 43], [9, 25, 54]]) {
          ctx.globalAlpha = a * k; ctx.fillStyle = s.flash > 0.3 ? '#9aa2b8' : '#4a4f5e';
          ctx.beginPath(); ctx.arc(cx + dx * k, cy + dy, r * k, 0, TAU); ctx.fill();
        }
        if (s.flash > 0.3) { ctx.globalAlpha = a * s.flash; strokePts(ctx, boltPath(cx, cy + 20, cx + rand(-20, 20), u.from.y - 20, 12, 4), 2, '#fff8c0'); }
        sadFace(ctx, cx, cy + 6, 28 * k, a, t, {});
        caption(ctx, u.reason, cx, u.from.y + 90, a * clamp01((t - 0.5) / 0.4));
      }
    },

    {
      id: 'lose_shatter', group: G_LOSE, name: 'Rozbity przedmiot', dur: 4.2,
      init: () => ({ pieces: null }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, size = 170 * (o.itemScale || 1), x = u.from.x, y = u.from.y;
        const T = 0.8;
        if (t < T) {
          const sh = t > 0.3 ? rand(-3, 3) * (t / T) : 0;
          drawItem(ctx, u.img, x + sh, y + sh, size * easeOutBack(clamp01(t / 0.3)), 0, 1, a, false, 'grayscale(1)');
          if (t > 0.4) { ctx.globalAlpha = a; strokePts(ctx, [[x - 20, y - 30], [x - 5, y - 8], [x - 14, y + 6], [x + 4, y + 30]], 2, '#222'); }
        } else {
          if (!s.pieces) {
            s.pieces = []; const n = 5, ps = size / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s.pieces.push({ i, j, x: x - size / 2 + (i + 0.5) * ps, y: y - size / 2 + (j + 0.5) * ps, vx: rand(-160, 160), vy: rand(-320, -60), rot: 0, vr: rand(-6, 6), ps });
          }
          const iw = u.img.width || 32, ih = u.img.height || 32;
          ctx.save(); ctx.imageSmoothingEnabled = false; ctx.filter = 'grayscale(1)';
          for (const p of s.pieces) {
            p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a;
            ctx.drawImage(u.img, (p.i / 5) * iw, (p.j / 5) * ih, iw / 5, ih / 5, -p.ps / 2, -p.ps / 2, p.ps, p.ps);
            ctx.restore();
          }
          ctx.restore();
          sadFace(ctx, x, y, 60 * easeOutBack(clamp01((t - T - 0.3) / 0.4)), a, t, {});
          caption(ctx, u.reason, x, y + 100, a * clamp01((t - T - 0.4) / 0.4));
        }
      }
    },

    {
      id: 'lose_flyaway', group: G_LOSE, name: 'Odlatujący przedmiot', dur: 4.5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, f = clamp01((t - 0.4) / 3);
        const x = u.from.x + f * f * (W * 0.45) + Math.sin(t * 4) * 12, y = u.from.y - f * (u.from.y + 120);
        const z = u.base * 3.2 * (1 - f * 0.5), fl = Math.abs(Math.sin(t * 16));
        ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#99a'; ctx.lineWidth = 1;
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sd * z * 0.6, y - z * 0.1, z * 0.5, z * 0.22 * (0.3 + fl), sd * -0.5, 0, TAU); ctx.fill(); ctx.stroke(); }
        drawItem(ctx, u.img, x, y, z, Math.sin(t * 3) * 0.2, 1, a, false);
        if (t > 0.6 && t < 2.6) caption(ctx, 'Pa pa!', x, y - z, a * clamp01((t - 0.6) / 0.3) * clamp01((2.6 - t) / 0.4), 22);
        sadFace(ctx, u.from.x, u.from.y + 10, 55 * easeOutBack(clamp01(t / 0.5)), a, t, { look: -1 });
        caption(ctx, u.reason, u.from.x, u.from.y + 100, a * clamp01((t - 0.8) / 0.4));
      }
    },

    {
      id: 'lose_grey', group: G_LOSE, name: 'Szary świat', dur: 4.5,
      init(env) { return { d: Array.from({ length: 70 }, () => ({ x: rand(0, env.W), y: rand(-env.H, env.H), vy: rand(250, 400) })) }; },
      frame(ctx, s, t, dt, a, W, H, b, o) {
        greyScreen(a);
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(30,40,70,${0.18 * a})`; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(170,190,230,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (const q of s.d) { q.y += q.vy * dt; if (q.y > H) q.y = rand(-60, 0); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - 2, q.y + 12); }
        ctx.globalAlpha = a; ctx.stroke();
        sadFace(ctx, W / 2, H * 0.4, 85 * easeOutBack(clamp01((t - 0.3) / 0.5)), a, t, {});
        caption(ctx, o.out.reason, W / 2, H * 0.4 + 130, a * clamp01((t - 0.6) / 0.4));
      }
    },

    {
      id: 'lose_wahwah', group: G_LOSE, name: 'Wah wah waaah', dur: 4.5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, text = 'Wah wah waaaah...', fs = 58, cx = W / 2, cy = H * 0.26;
        ctx.save();
        ctx.font = `bold ${fs}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const total = ctx.measureText(text).width;
        let xx = cx - total / 2;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i], w = ctx.measureText(ch).width, td = 0.12 * i;
          const k = clamp01((t - td) / 0.3), droop = Math.max(0, t - 1.8 - i * 0.05);
          const y = cy + i * 3 + droop * droop * 160, rot = droop * (i % 2 ? 1.2 : -1.2);
          ctx.save(); ctx.translate(xx + w / 2, y); ctx.rotate(rot * 0.3); ctx.globalAlpha = a * k;
          ctx.lineWidth = 7; ctx.strokeStyle = '#1a1a2a'; ctx.strokeText(ch, 0, 0);
          ctx.fillStyle = '#9fb4d9'; ctx.fillText(ch, 0, 0);
          ctx.restore();
          xx += w;
        }
        ctx.restore();
        sadFace(ctx, cx, cy + 130, 60 * easeOutBack(clamp01((t - 0.4) / 0.5)), a, t, {});
        caption(ctx, u.reason, cx, cy + 220, a * clamp01((t - 0.8) / 0.4));
      }
    },

    {
      id: 'lose_heart', group: G_LOSE, name: 'Złamane serce', dur: 4.2,
      init: () => ({ tears: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, x = u.from.x, y0 = Math.max(130, u.from.y - 40), z = 85 * easeOutBack(clamp01(t / 0.45));
        const br = clamp01((t - 0.9) / 1.6), sep = br * 70, fall = br * br * 320;
        for (const sd of [-1, 1]) {
          ctx.save();
          ctx.translate(x + sd * sep, y0 + fall); ctx.rotate(sd * br * 0.6);
          ctx.beginPath();
          if (sd < 0) ctx.rect(-z * 1.4, -z * 1.2, z * 1.4, z * 2.2); else ctx.rect(0, -z * 1.2, z * 1.4, z * 2.2);
          ctx.clip();
          heartPath(ctx, 0, 0, z);
          ctx.globalAlpha = a * (1 - br * 0.6); ctx.fillStyle = '#d4213b'; ctx.fill();
          ctx.lineWidth = 3; ctx.strokeStyle = '#6e0616'; ctx.stroke();
          ctx.restore();
        }
        if (t > 0.6) { ctx.globalAlpha = a * (1 - br); strokePts(ctx, [[x, y0 - z * 0.35], [x - 6, y0 - z * 0.1], [x + 6, y0 + z * 0.1], [x - 4, y0 + z * 0.35], [x, y0 + z * 0.7]], 3, '#2a0008'); }
        if (Math.random() < dt * 12 && t < this.dur - 1) s.tears.push({ x: x + rand(-70, 70), y: y0 + rand(-20, 20), vy: rand(60, 140) });
        for (let i = s.tears.length - 1; i >= 0; i--) { const q = s.tears[i]; q.vy += 400 * dt; q.y += q.vy * dt; if (q.y > H) { s.tears.splice(i, 1); continue; } tearDrop(ctx, q.x, q.y, 8, a); }
        caption(ctx, u.reason, x, y0 + z * 1.3 + 30, a * clamp01((t - 0.5) / 0.4));
      }
    },

    {
      id: 'lose_tears', group: G_LOSE, name: 'Deszcz łez', dur: 4.5,
      init: () => ({ d: [], rip: [], acc: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(20,40,80,${0.25 * a})`; ctx.fillRect(0, 0, W, H);
        if (t < this.dur - 1) { s.acc += dt * 45 * (o.density || 1); while (s.acc >= 1) { s.acc--; s.d.push({ x: rand(0, W), y: -20, vy: rand(200, 360), z: rand(7, 13), gy: rand(H * 0.7, H - 10) }); } }
        for (let i = s.d.length - 1; i >= 0; i--) {
          const q = s.d[i]; q.vy += 300 * dt; q.y += q.vy * dt;
          if (q.y > q.gy) { s.d.splice(i, 1); s.rip.push({ x: q.x, y: q.gy, l: 0 }); continue; }
          tearDrop(ctx, q.x, q.y, q.z, a);
        }
        for (let i = s.rip.length - 1; i >= 0; i--) {
          const q = s.rip[i]; q.l += dt; if (q.l > 0.8) { s.rip.splice(i, 1); continue; }
          const f = q.l / 0.8; ctx.globalAlpha = a * (1 - f); ctx.strokeStyle = 'rgba(140,190,255,0.9)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(q.x, q.y, 4 + f * 26, 1.5 + f * 7, 0, 0, TAU); ctx.stroke();
        }
        caption(ctx, o.out.reason, W / 2, H * 0.2, a * clamp01((t - 0.3) / 0.4));
      }
    },

    {
      id: 'lose_balloon', group: G_LOSE, name: 'Uciekający balonik', dur: 5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, f = clamp01((t - 0.3) / 3.8), sway = Math.sin(t * 2.2) * 20 * f;
        const ix = u.from.x + sway + f * 80, iy = u.from.y - f * (u.from.y + 200);
        const bx = ix + Math.sin(t * 2.2 + 0.6) * 10, by = iy - 110;
        ctx.globalAlpha = a; ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ix, iy - u.base * 0.8); ctx.quadraticCurveTo(ix + 14, (iy + by) / 2, bx, by + 50); ctx.stroke();
        const g = ctx.createRadialGradient(bx - 14, by - 16, 4, bx, by, 52);
        g.addColorStop(0, '#ff8a8a'); g.addColorStop(1, '#c21a2b');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, by, 40, 50, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx - 6, by + 52); ctx.lineTo(bx + 6, by + 52); ctx.lineTo(bx, by + 45); ctx.fill();
        drawItem(ctx, u.img, ix, iy, u.base * 2.8, Math.sin(t * 2.2) * 0.25, 1, a, false);
        sadFace(ctx, u.from.x, u.from.y + 12, 55 * easeOutBack(clamp01(t / 0.5)), a, t, { look: -1 });
        caption(ctx, u.reason, u.from.x, u.from.y + 100, a * clamp01((t - 0.6) / 0.4));
      }
    },

    {
      id: 'lose_trash', group: G_LOSE, name: 'Do kosza', dur: 4.5,
      init: () => ({ flies: Array.from({ length: 5 }, () => ({ an: rand(0, TAU), sp: rand(3, 6), r: rand(20, 45) })), hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, S = 150, bin = { x: clampX(u.from.x + 170, W, S), y: Math.min(H - S * 0.6, u.from.y + 80) };
        const k = easeOutBack(clamp01(t / 0.45));
        const T0 = 0.5, T1 = 1.4; // lot przedmiotu
        const lid = t < T0 ? 0 : t < T1 + 0.1 ? -1.9 * easeOut(clamp01((t - T0) / 0.3)) : -1.9 * (1 - easeOutBack(clamp01((t - T1 - 0.1) / 0.25)));
        const wob = s.hit > 0 ? Math.sin((t - s.hit) * 30) * 0.08 * clamp01(1 - (t - s.hit) / 0.6) : 0;
        if (t > T1 + 0.3 && s.hit < 0) s.hit = t;
        if (s.hit > 0) shakeScreen(4 * clamp01(1 - (t - s.hit) / 0.25) * a);
        // przedmiot leci do kosza (za przednią ścianką)
        if (t > T0 && t < T1 + 0.05) {
          const f = easeInOut(clamp01((t - T0) / (T1 - T0)));
          const p = arcPoint(u.from, { x: bin.x, y: bin.y - S * 0.35 }, f, 170);
          drawItem(ctx, u.img, p.x, p.y, u.base * (2.6 - 0.8 * f), f * 9, 1, a, false);
        } else if (t <= T0) drawItem(ctx, u.img, u.from.x, u.from.y, u.base * 2.6 * k, 0, 1, a, false);
        drawBin(ctx, bin.x, bin.y, S * k, lid, wob, a);
        // smród i muchy
        if (s.hit > 0) {
          ctx.save(); ctx.globalAlpha = a * 0.7; ctx.strokeStyle = '#8fd46a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            for (let j = 0; j <= 12; j++) { const yy = bin.y - S * 0.6 - j * 6, xx = bin.x + i * 28 + Math.sin(j * 0.8 + t * 5 + i) * 7; j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
            ctx.stroke();
          }
          ctx.restore();
          for (const f of s.flies) {
            f.an += f.sp * dt;
            const fx = bin.x + Math.cos(f.an) * f.r * 1.6, fy = bin.y - S * 0.75 + Math.sin(f.an * 1.7) * f.r * 0.6;
            ctx.globalAlpha = a; ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(fx, fy, 3, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(220,230,255,0.7)'; ctx.beginPath(); ctx.ellipse(fx - 2, fy - 3, 3, 1.6, -0.5, 0, TAU); ctx.ellipse(fx + 2, fy - 3, 3, 1.6, 0.5, 0, TAU); ctx.fill();
          }
        }
        sadFace(ctx, u.from.x, u.from.y, 48 * easeOutBack(clamp01((t - T1) / 0.4)), a, t, { look: 1 });
        caption(ctx, u.reason, bin.x, bin.y + S * 0.72, a * clamp01((t - T1) / 0.4), 26);
      }
    },

    {
      id: 'lose_dumpster', group: G_LOSE, name: 'Płonący śmietnik', dur: 5,
      init: () => ({ fl: [], sm: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, S = 170, bin = { x: clampX(u.from.x, W, S), y: Math.min(H - S * 0.6, u.from.y + 90) };
        const k = easeOutBack(clamp01(t / 0.4)), T = 1.1;
        if (t < T) {
          const f = easeIn(clamp01((t - 0.3) / (T - 0.3)));
          drawItem(ctx, u.img, bin.x, u.from.y - 80 + (bin.y - S * 0.3 - u.from.y + 80) * f, u.base * 2.6, f * 6, 1, a, false);
        }
        const fire = clamp01((t - T) / 0.4);
        if (fire > 0 && t < this.dur - 0.8) {
          for (let i = 0; i < 6; i++) s.fl.push({ x: bin.x + rand(-S * 0.35, S * 0.35), y: bin.y - S * 0.45, vx: rand(-20, 20), vy: rand(-220, -90), l: 0, m: rand(0.5, 1), r: rand(14, 30) });
          if (Math.random() < dt * 12) s.sm.push({ x: bin.x + rand(-30, 30), y: bin.y - S * 0.9, l: 0, m: rand(1.5, 2.5), r: rand(25, 45) });
        }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.sm.length - 1; i >= 0; i--) {
          const q = s.sm[i]; q.l += dt; const f = q.l / q.m; if (f >= 1) { s.sm.splice(i, 1); continue; }
          q.y -= 60 * dt; q.x += Math.sin(t + i) * 15 * dt;
          dot(ctx, '60,60,60', q.x, q.y, q.r * (1 + f), a * 0.45 * Math.sin(f * Math.PI));
        }
        ctx.globalCompositeOperation = 'lighter';
        dot(ctx, '255,110,20', bin.x, bin.y - S * 0.5, S * 0.9 * fire, a * 0.5 * fire);
        for (let i = s.fl.length - 1; i >= 0; i--) {
          const p = s.fl[i]; p.l += dt; const f = p.l / p.m; if (f >= 1) { s.fl.splice(i, 1); continue; }
          p.vy -= 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          dot(ctx, f < 0.2 ? '255,240,190' : f < 0.5 ? '255,170,40' : '255,80,20', p.x, p.y, p.r * (0.8 + f), (1 - f) * 0.6 * a, f < 0.2);
        }
        drawBin(ctx, bin.x, bin.y, S * k, -2.2 * clamp01(t / 0.3), Math.sin(t * 20) * 0.02 * fire, a, true);
        caption(ctx, u.reason, bin.x, bin.y + S * 0.72, a * clamp01((t - T) / 0.4), 26);
      }
    },

    {
      id: 'lose_thief', group: G_LOSE, name: 'Ręka złodzieja', dur: 4.5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, S = 1.4 * (o.itemScale || 1);
        const side = u.from.x < W / 2 ? -1 : 1, edgeX = side < 0 ? -80 : W + 80;
        const reach = easeOut(clamp01((t - 0.2) / 0.7)), grab = t > 0.95, back = easeIn(clamp01((t - 1.35) / 0.8));
        const hx = edgeX + (u.from.x - edgeX) * reach * (1 - back), hy = u.from.y + Math.sin(t * 3) * 6;
        if (!grab || back < 0.02) drawItem(ctx, u.img, u.from.x, u.from.y, u.base * 2.4, 0, 1, a, true);
        ctx.save(); ctx.globalAlpha = a;
        ctx.strokeStyle = '#1b1024'; ctx.lineCap = 'round'; ctx.lineWidth = 50 * S;
        ctx.beginPath(); ctx.moveTo(edgeX + side * 60, hy + 25); ctx.lineTo(hx + side * 64 * S, hy + 6); ctx.stroke();
        ctx.restore();
        drawHand(ctx, hx, hy, 80 * S, side, grab ? 1 : clamp01((t - 0.7) / 0.25) * 0.3, a);
        if (grab && back > 0.02) drawItem(ctx, u.img, hx - side * 5, hy - 6, u.base * 2.2, 0, 1, a, false);
        if (t > 0.95 && t < 1.3) { ctx.globalCompositeOperation = 'lighter'; dot(ctx, '200,120,255', u.from.x, u.from.y, 60, a * (1 - (t - 0.95) / 0.35), true); }
        const who = u.who ? `${u.who} podebrał łup!` : (u.reasonKey === 'other' ? 'Ktoś podebrał Ci łup!' : u.reason);
        caption(ctx, who, clampX(u.from.x, W, 300), u.from.y + 90, a * clamp01((t - 1.1) / 0.4), 26);
        sadFace(ctx, u.from.x, u.from.y, 46 * easeOutBack(clamp01((t - 1.8) / 0.4)), a, t, { look: side });
      }
    },

    {
      id: 'lose_runner', group: G_LOSE, name: 'Uciekający złodziej', dur: 5,
      init: () => ({ puffs: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, dir = u.from.x < W / 2 ? 1 : -1, S = 2;
        const run = clamp01((t - 0.9) / 3.2), appear = easeOutBack(clamp01(t / 0.5));
        const tx = u.from.x - dir * 90 + dir * (run * run * (W * 0.9)), ty = u.from.y + 40;
        const carry = t > 0.7;
        if (!carry) drawItem(ctx, u.img, u.from.x, u.from.y, u.base * 2.2, 0, 1, a, true);
        if (run > 0 && Math.random() < dt * 14) s.puffs.push({ x: tx - dir * 20, y: ty + 55 * S * 0.5, l: 0 });
        for (let i = s.puffs.length - 1; i >= 0; i--) {
          const q = s.puffs[i]; q.l += dt; if (q.l > 0.6) { s.puffs.splice(i, 1); continue; }
          dot(ctx, '190,180,160', q.x, q.y, 14 + q.l * 30, a * 0.5 * (1 - q.l / 0.6));
        }
        const hop = run > 0 ? Math.abs(Math.sin(t * 16)) * 6 : 0;
        const sz = 190, fr = t < 0.5 ? thiefAppear(t / 0.5) : thiefIdle(t);
        drawThiefSprite(ctx, tx, ty + 50 - hop, sz, fr, dir > 0, a);
        if (carry) drawItem(ctx, u.img, tx + dir * 18, ty + 50 - hop - sz * 0.45, u.base * 2, Math.sin(t * 10) * 0.2, 1, a, true);
        if (t > 0.6 && t < 2.2) caption(ctx, 'Hehe!', tx, ty + 50 - 160, a * clamp01((t - 0.6) / 0.2) * clamp01((2.2 - t) / 0.3), 24);
        if (u.who) caption(ctx, u.who, tx, ty + 72, a * appear, 18);
        caption(ctx, u.who ? `${u.who} podebrał łup!` : (u.reasonKey === 'other' ? 'Ktoś podebrał Ci łup!' : u.reason), clampX(u.from.x, W, 300), Math.max(40, u.from.y - 150), a * clamp01((t - 1) / 0.4), 26);
      }
    },

    {
      id: 'lose_sack', group: G_LOSE, name: 'Worek złodzieja', dur: 4.5,
      init: () => ({}),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, S = 110;
        const drop = easeOutBack(clamp01(t / 0.6)), up = easeIn(clamp01((t - 2.1) / 0.9));
        const sx = u.from.x, sy = -S + (u.from.y - 30 + S) * drop - up * (u.from.y + 2 * S);
        const suck = clamp01((t - 0.7) / 0.6);
        if (suck < 1) {
          const ix = u.from.x, iy = u.from.y + (sy + S * 0.1 - u.from.y) * easeIn(suck);
          drawItem(ctx, u.img, ix, iy, u.base * 2.4 * (1 - suck * 0.6), suck * 8, 1, a, true);
        }
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(sx, sy - S * 0.55); ctx.lineTo(sx, -20); ctx.stroke();
        const g = ctx.createLinearGradient(sx - S * 0.5, 0, sx + S * 0.5, 0);
        g.addColorStop(0, '#7a5a30'); g.addColorStop(0.5, '#b08a52'); g.addColorStop(1, '#6a4a22');
        ctx.fillStyle = g;
        const tied = t > 1.4 ? 0.2 : 0.55;
        ctx.beginPath();
        ctx.moveTo(sx - S * 0.15 * (tied / 0.55 + 0.3), sy - S * 0.5);
        ctx.bezierCurveTo(sx - S * 0.7, sy - S * 0.1, sx - S * 0.65, sy + S * 0.55, sx, sy + S * 0.55);
        ctx.bezierCurveTo(sx + S * 0.65, sy + S * 0.55, sx + S * 0.7, sy - S * 0.1, sx + S * 0.15 * (tied / 0.55 + 0.3), sy - S * 0.5);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#4a3214'; ctx.stroke();
        ctx.fillStyle = '#3a2a14'; ctx.fillRect(sx - S * 0.18, sy - S * 0.52, S * 0.36, S * 0.08);
        ctx.font = `bold ${S * 0.32}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#4a3214';
        ctx.fillText('$', sx, sy + S * 0.18);
        ctx.restore();
        caption(ctx, u.who ? `${u.who} podebrał łup!` : u.reason, u.from.x, u.from.y + 90, a * clamp01((t - 1.2) / 0.4), 26);
        sadFace(ctx, u.from.x, u.from.y + 20, 46 * easeOutBack(clamp01((t - 1.6) / 0.4)), a, t, { look: -1 });
      }
    },

    {
      id: 'lose_stamp', group: G_LOSE, name: 'Pieczątka ODRZUCONO', dur: 4.2,
      init: () => ({ ink: null, hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, x = u.from.x, y = u.from.y, S = 1.3;
        const word = u.reasonKey === 'full' ? 'BRAK MIEJSCA' : u.reasonKey === 'other' ? 'PODEBRANE' : 'ODRZUCONO';
        drawItem(ctx, u.img, x, y, u.base * 3, 0, 1, a, false, s.hit > 0 ? 'grayscale(1)' : null);
        const T = 0.75, down = t < T ? easeIn(t / T) : 1, lift = easeOut(clamp01((t - T - 0.15) / 0.4));
        const stampY = y - 260 + 250 * down - 240 * lift;
        if (t >= T && s.hit < 0) {
          s.hit = t;
          s.ink = Array.from({ length: 18 }, () => ({ an: rand(0, TAU), r: rand(90, 150), z: rand(2, 6) }));
        }
        if (s.hit > 0) {
          shakeScreen(6 * clamp01(1 - (t - s.hit) / 0.25) * a);
          ctx.save(); ctx.translate(x, y); ctx.rotate(-0.22); ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = '#d0162b'; ctx.lineWidth = 7 * S; ctx.strokeRect(-125 * S, -34 * S, 250 * S, 68 * S);
          ctx.lineWidth = 2 * S; ctx.strokeRect(-115 * S, -26 * S, 230 * S, 52 * S);
          let fsz = 38 * S;
          ctx.font = `900 ${fsz}px Impact, "Arial Black", sans-serif`;
          const tw = ctx.measureText(word).width;
          if (tw > 215 * S) { fsz *= (215 * S) / tw; ctx.font = `900 ${fsz}px Impact, "Arial Black", sans-serif`; }
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#d0162b'; ctx.fillText(word, 0, 2);
          ctx.globalCompositeOperation = 'destination-out';
          for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(rand(-120, 120) * S, rand(-30, 30) * S, rand(1, 3), 0, TAU); ctx.fill(); }
          ctx.restore();
          ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#c0132a';
          for (const d of s.ink) { ctx.beginPath(); ctx.arc(x + Math.cos(d.an) * d.r, y + Math.sin(d.an) * d.r * 0.5, d.z, 0, TAU); ctx.fill(); }
        }
        // pieczątka
        ctx.save(); ctx.translate(x, stampY); ctx.rotate(-0.22); ctx.globalAlpha = a;
        const wg = ctx.createLinearGradient(-30, 0, 30, 0); wg.addColorStop(0, '#6b3f1d'); wg.addColorStop(0.5, '#a8683a'); wg.addColorStop(1, '#5a3316');
        ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(0, -120 * S, 30 * S, 22 * S, 0, 0, TAU); ctx.fill();
        ctx.fillRect(-14 * S, -115 * S, 28 * S, 70 * S);
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(-130 * S, -48 * S, 260 * S, 14 * S);
        ctx.fillStyle = '#a0121f'; ctx.fillRect(-126 * S, -36 * S, 252 * S, 10 * S);
        ctx.restore();
        caption(ctx, u.reason, x, y + 110, a * clamp01((t - 1) / 0.4), 24);
      }
    },

    {
      id: 'lose_shredder', group: G_LOSE, name: 'Niszczarka', dur: 4.8,
      init: () => ({ strips: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, S = 170, sx = clampX(u.from.x, W, S), sy = Math.min(H - 120, u.from.y + 40);
        const k = easeOutBack(clamp01(t / 0.4));
        const feed = clamp01((t - 0.6) / 1.8), iz = u.base * 3.2, iy = sy - S * 0.2 - iz / 2 + feed * iz;
        // przedmiot wjeżdża w szczelinę (część nad szczeliną)
        if (feed < 1) {
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, sy - S * 0.2); ctx.clip();
          drawItem(ctx, u.img, sx + Math.sin(t * 40) * 1.5, iy, iz, 0, 1, a, false);
          ctx.restore();
          if (feed > 0) shakeScreen(1.5 * a);
        }
        // paski wypadające spod niszczarki
        if (feed > 0 && feed < 1 && Math.random() < dt * 30) s.strips.push({ x: sx + rand(-iz * 0.45, iz * 0.45), y: sy + S * 0.28, vy: rand(40, 90), l: 0, h: rand(24, 50), c: pick(['#c9c0a8', '#b3a88c', '#8f866e']), rot: rand(-0.3, 0.3) });
        for (let i = s.strips.length - 1; i >= 0; i--) {
          const q = s.strips[i]; q.l += dt; q.vy += 200 * dt; q.y += q.vy * dt;
          if (q.y > H + 40) { s.strips.splice(i, 1); continue; }
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot + Math.sin(q.l * 6) * 0.2); ctx.globalAlpha = a;
          ctx.fillStyle = q.c; ctx.fillRect(-2.5, 0, 5, q.h); ctx.restore();
        }
        // obudowa
        ctx.save(); ctx.globalAlpha = a; ctx.translate(sx, sy); ctx.scale(k, k);
        const g = ctx.createLinearGradient(0, -S * 0.2, 0, S * 0.3); g.addColorStop(0, '#5a5f6a'); g.addColorStop(1, '#2b2e35');
        ctx.fillStyle = g; ctx.fillRect(-S * 0.5, -S * 0.2, S, S * 0.48);
        ctx.fillStyle = '#111'; ctx.fillRect(-S * 0.42, -S * 0.2, S * 0.84, 6);
        ctx.fillStyle = feed > 0 && feed < 1 ? (Math.sin(t * 20) > 0 ? '#ff3b3b' : '#6b1515') : '#3fbf4a';
        ctx.beginPath(); ctx.arc(S * 0.38, S * 0.05, 6, 0, TAU); ctx.fill();
        ctx.font = 'bold 14px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfd3da'; ctx.fillText('NISZCZARKA', -S * 0.05, S * 0.1);
        ctx.restore();
        caption(ctx, u.reason, sx, Math.max(40, sy - S * 0.2 - iz - 20), a * clamp01((t - 0.8) / 0.4), 24);
      }
    },

    /* ----------------------- ZDOBYTY – efekty z rozmachem ----------------------- */

    {
      id: 'win_meteor', group: G_WIN, name: 'Meteor legendy', dur: 4.5,
      init: () => ({ deb: [], fire: [], hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.3, start = { x: u.to.x - W * 0.55, y: -120 };
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = easeIn(t / T), x = start.x + (u.to.x - start.x) * f, y = start.y + (u.to.y - start.y) * f;
          const dx = u.to.x - start.x, dy = u.to.y - start.y, L = Math.hypot(dx, dy), tl = 260 + 200 * f;
          const g = ctx.createLinearGradient(x, y, x - dx / L * tl, y - dy / L * tl);
          g.addColorStop(0, `rgba(255,245,210,${a})`); g.addColorStop(0.25, `rgba(255,150,40,${0.85 * a})`); g.addColorStop(1, 'rgba(200,40,0,0)');
          ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineCap = 'round';
          for (const [lw, al] of [[70, 0.35], [36, 0.7], [14, 1]]) { ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx / L * tl, y - dy / L * tl); ctx.stroke(); }
          for (let i = 0; i < 4; i++) s.fire.push({ x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-60, 60) - dx / L * 120, vy: rand(-60, 60) - dy / L * 120, l: 0, m: rand(0.3, 0.7), c: pick(['255,200,80', '255,120,30', '255,240,190']) });
          dot(ctx, '255,200,90', x, y, 90, a, true);
          drawItem(ctx, u.img, x, y, u.base * 2.2, t * 12, 1, a, true);
          ctx.globalAlpha = 1; ctx.fillStyle = `rgba(255,120,30,${0.12 * f * a})`; ctx.fillRect(0, 0, W, H);
        } else if (s.hit < 0) {
          s.hit = t;
          burst(s.deb, u.to, 140, 200, 760, ['255,200,90', '255,120,30', '255,240,200', '180,90,40']);
        }
        sparksDraw(ctx, s.fire, dt, a, 0);
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(16 * clamp01(1 - tt / 0.6) * a);
          ctx.globalAlpha = 1; ctx.fillStyle = `rgba(255,240,210,${0.6 * clamp01(1 - tt / 0.35) * a})`; ctx.fillRect(0, 0, W, H);
          ringFx(ctx, u.to, tt, 1.1, Math.max(W, H) * 0.6, '255,190,90', a);
          ringFx(ctx, u.to, tt - 0.15, 1.0, Math.max(W, H) * 0.4, '255,240,200', a);
          dot(ctx, '255,160,50', u.to.x, u.to.y, 220 * clamp01(1 - tt / 1.2), a * clamp01(1 - tt / 1.2), true);
          for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU + tt; const r = 50 + tt * 60; dot(ctx, '255,120,30', u.to.x + Math.cos(an) * r, u.to.y + Math.sin(an) * r * 0.5, 22, a * clamp01(1 - tt / 1.8) * 0.8); }
        }
        sparksDraw(ctx, s.deb, dt, a, 650);
      }
    },

    {
      id: 'win_phoenix', group: G_WIN, name: 'Lot feniksa', dur: 4.8,
      init: () => ({ fl: [], hit: -9, sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 2.4;
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) {
          o.hideItem();
          const f = t / T;
          // pętla przez cały ekran: start z miejsca łupu, zatoczenie łuku i lot do torby
          const cx = W * 0.5, cy = H * 0.4;
          const p = f < 0.6
            ? { x: u.from.x + (cx - u.from.x) * (f / 0.6) + Math.sin(f / 0.6 * Math.PI) * W * 0.25, y: u.from.y + (cy - H * 0.25 - u.from.y) * Math.sin(f / 0.6 * Math.PI / 2) }
            : { x: cx + (u.to.x - cx) * easeIn((f - 0.6) / 0.4), y: cy - H * 0.25 + (u.to.y - cy + H * 0.25) * easeIn((f - 0.6) / 0.4) };
          const prev = s.prev || p; s.prev = p;
          const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
          const flap = Math.sin(t * 14);
          // skrzydła z płomieni
          for (const sd of [-1, 1]) {
            for (let i = 0; i < 12; i++) {
              const k = i / 11, wa = ang + sd * (Math.PI / 2 + 0.3 - k * 0.5) + sd * flap * 0.5 * k;
              const r = 18 + k * 110;
              dot(ctx, k < 0.3 ? '255,230,150' : k < 0.7 ? '255,150,40' : '255,80,20', p.x + Math.cos(wa) * r, p.y + Math.sin(wa) * r, 30 - k * 14, a * (1 - k * 0.5), k < 0.2);
            }
          }
          for (let i = 0; i < 6; i++) s.fl.push({ x: p.x - Math.cos(ang) * 30 + rand(-8, 8), y: p.y - Math.sin(ang) * 30 + rand(-8, 8), vx: -Math.cos(ang) * 120 + rand(-40, 40), vy: -Math.sin(ang) * 120 + rand(-40, 40), l: 0, m: rand(0.5, 1), c: pick(['255,200,80', '255,120,30', '255,60,20']) });
          dot(ctx, '255,220,140', p.x, p.y, 60, a, true);
          drawItem(ctx, u.img, p.x, p.y, u.base * 1.8, 0, 1, a, true);
        } else if (s.hit < 0) { s.hit = t; burst(s.sp, u.to, 120, 150, 520, ['255,200,80', '255,120,30', '255,240,190']); }
        sparksDraw(ctx, s.fl, dt, a, -60);
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(7 * clamp01(1 - tt / 0.3) * a);
          raysBehind(ctx, u.to.x, u.to.y, 200 * easeOut(clamp01(tt / 0.4)), t, a * clamp01(1 - tt / 1.6));
          ringFx(ctx, u.to, tt, 0.9, 260, '255,170,60', a);
        }
        sparksDraw(ctx, s.sp, dt, a, 300);
      }
    },

    {
      id: 'win_goldstorm', group: G_WIN, name: 'Złota burza', dur: 4.8,
      init: () => ({ coins: Array.from({ length: 140 }, () => ({ an: rand(0, TAU), r: rand(60, 260), sp: rand(1.5, 3.5), z: rand(5, 10), ph: rand(0, TAU) })), hit: -9, sp: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, cx = W / 2, cy = H * 0.42, T1 = 0.6, T2 = 2.2, T3 = 3.0;
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(30,18,0,${0.35 * a * clamp01(t / 0.5) * clamp01((T3 - t) / 0.5 + 0.2)})`; ctx.fillRect(0, 0, W, H);
        let ix, iy, iz;
        if (t < T1) { const f = easeOut(t / T1); ix = u.from.x + (cx - u.from.x) * f; iy = u.from.y + (cy - u.from.y) * f; iz = u.base * (1 + 3 * f); }
        else if (t < T2) { ix = cx; iy = cy + Math.sin(t * 3) * 6; iz = u.base * 4; }
        else if (t < T3) { const f = easeIn((t - T2) / (T3 - T2)); ix = cx + (u.to.x - cx) * f; iy = cy + (u.to.y - cy) * f; iz = u.base * (4 - 3 * f); }
        const pull = clamp01((t - T2) / (T3 - T2));
        for (const c of s.coins) {
          c.an += c.sp * dt * (1 + pull * 3);
          const r = c.r * (t < T1 ? easeOut(t / T1) : 1) * (1 - pull);
          const bx = t < T3 ? (ix || u.to.x) : u.to.x, by = t < T3 ? (iy || u.to.y) : u.to.y;
          const x = bx + Math.cos(c.an) * r, y = by + Math.sin(c.an) * r * 0.45;
          if (t > T3 + 0.05) continue;
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
          const w = Math.max(1, Math.abs(Math.cos(t * 8 + c.ph)) * c.z);
          ctx.fillStyle = Math.cos(t * 8 + c.ph) > 0 ? '#ffd24a' : '#d99a16';
          ctx.beginPath(); ctx.ellipse(x, y, w, c.z, 0, 0, TAU); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        if (t < T3) {
          o.hideItem();
          raysBehind(ctx, ix, iy, iz * 1.8, t, a);
          dot(ctx, '255,190,60', ix, iy, iz * 1.2, a * 0.8);
          drawItem(ctx, u.img, ix, iy, iz, 0, Math.cos(t * 2.5), a, true);
        } else if (s.hit < 0) { s.hit = t; burst(s.sp, u.to, 120, 150, 560, ['255,220,120', '255,190,60', '255,255,220']); }
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(8 * clamp01(1 - tt / 0.3) * a);
          dot(ctx, '255,230,160', u.to.x, u.to.y, 200 * clamp01(1 - tt / 0.8), a * clamp01(1 - tt / 0.8), true);
          ringFx(ctx, u.to, tt, 0.9, 220, '255,210,110', a);
        }
        sparksDraw(ctx, s.sp, dt, a, 450);
      }
    },

    {
      id: 'win_rocket', group: G_WIN, name: 'Rakieta', dur: 4.8,
      init: () => ({ smoke: [], sp: [], hit: -9, n: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 2.3;
        if (t < T) {
          o.hideItem();
          const f = t / T;
          // start w górę, pętla (looping) na środku ekranu, nurkowanie do torby
          let x, y;
          if (f < 0.3) { const k = f / 0.3; x = u.from.x + (W * 0.5 - u.from.x) * k; y = u.from.y + (H * 0.3 - u.from.y) * easeOut(k); }
          else if (f < 0.7) { const k = (f - 0.3) / 0.4, an = -Math.PI / 2 + k * TAU; x = W * 0.5 + Math.cos(an) * 140 + 0; y = H * 0.3 + 140 + Math.sin(an) * 140; }
          else { const k = easeIn((f - 0.7) / 0.3); x = W * 0.5 + (u.to.x - W * 0.5) * k; y = H * 0.3 + (u.to.y - H * 0.3) * k; }
          const prev = s.prev || { x, y }; s.prev = { x, y };
          const ang = Math.atan2(y - prev.y, x - prev.x);
          if (Math.random() < 0.9) s.smoke.push({ x: x - Math.cos(ang) * 26, y: y - Math.sin(ang) * 26, l: 0 });
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 3; i++) dot(ctx, pick(['255,220,120', '255,140,40']), x - Math.cos(ang) * (22 + i * 10), y - Math.sin(ang) * (22 + i * 10), 16 - i * 3, a, true);
          drawItem(ctx, u.img, x, y, u.base * 1.8, ang + Math.PI / 2, 1, a, true);
        }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.smoke.length - 1; i >= 0; i--) {
          const q = s.smoke[i]; q.l += dt; if (q.l > 1.4) { s.smoke.splice(i, 1); continue; }
          dot(ctx, '220,220,225', q.x, q.y - q.l * 20, 10 + q.l * 26, a * 0.45 * (1 - q.l / 1.4));
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const [k, tk] of [[1, T], [2, T + 0.3], [3, T + 0.55]]) {
          if (t >= tk && s.n < k) {
            s.n = k; if (k === 1) s.hit = t;
            const hue = Math.random(), n = 120;
            for (let i = 0; i < n; i++) { const an = (i / n) * TAU, sp = rand(200, 460); s.sp.push({ x: u.to.x + (k - 1) * rand(-60, 60), y: u.to.y - (k - 1) * 60, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, l: 0, m: rand(0.9, 1.5), c: hsl(hue + rand(-0.05, 0.05), 1, 0.62) }); }
          }
        }
        if (s.hit > 0) shakeScreen(7 * clamp01(1 - (t - s.hit) / 0.3) * a);
        const drag = Math.pow(0.3, dt);
        for (let i = s.sp.length - 1; i >= 0; i--) {
          const q = s.sp[i]; q.l += dt; const f = q.l / q.m; if (f >= 1) { s.sp.splice(i, 1); continue; }
          q.vx *= drag; q.vy = q.vy * drag + 110 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          dot(ctx, q.c, q.x, q.y, 14, a * (1 - f) * 0.25); dot(ctx, q.c, q.x, q.y, 6, a * (1 - f), true);
        }
      }
    },

    {
      id: 'win_thunder', group: G_WIN, name: 'Grom z nieba', dur: 4.2,
      init: () => ({ bolts: [], sp: [], hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 1.1;
        const dark = clamp01(t / 0.4) * clamp01((this.dur - t) / 1);
        ctx.globalAlpha = 1; ctx.fillStyle = `rgba(5,8,25,${0.55 * dark * a})`; ctx.fillRect(0, 0, W, H);
        if (t < T) o.hideItem();
        if (t >= T && s.hit < 0) {
          s.hit = t;
          for (let k = 0; k < 4; k++) s.bolts.push(boltPath(u.to.x + rand(-40, 40), -10, u.to.x, u.to.y, 90));
          burst(s.sp, u.to, 90, 150, 520, ['170,210,255', '255,255,255', '120,160,255']);
        }
        ctx.globalCompositeOperation = 'lighter';
        if (t < T) { // item wisi w chmurach i ładuje się
          const f = t / T, x = u.from.x + (u.to.x - u.from.x) * f, y = 40 + Math.sin(t * 8) * 4;
          dot(ctx, '150,190,255', x, y, 40 + 30 * f, a, true);
          drawItem(ctx, u.img, x, y, u.base * 1.6, 0, 1, a, true);
          if (Math.random() < 0.4) { ctx.globalAlpha = a * 0.7; strokePts(ctx, boltPath(x, y, x + rand(-60, 60), y + rand(20, 70), 12, 4), 1.5, '#dfe9ff'); }
        }
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(13 * clamp01(1 - tt / 0.4) * a);
          ctx.globalAlpha = 1; ctx.fillStyle = `rgba(200,220,255,${0.6 * clamp01(1 - tt / 0.3) * a})`; ctx.fillRect(0, 0, W, H);
          const fl = clamp01(1 - tt / 0.7) * (Math.random() > 0.2 ? 1 : 0.4);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          for (const pts of s.bolts) { ctx.globalAlpha = a * fl; strokePts(ctx, pts, 22, 'rgba(90,140,255,0.35)'); strokePts(ctx, pts, 8, 'rgba(170,210,255,0.8)'); strokePts(ctx, pts, 3, '#ffffff'); }
          if (tt < 0.5) { const f = tt / 0.5; drawItem(ctx, u.img, u.to.x, -40 + (u.to.y + 40) * easeIn(f), u.base * (2.4 - 1.4 * f), 0, 1, a, true); }
          ringFx(ctx, u.to, tt, 0.9, 240, '160,200,255', a);
          dot(ctx, '180,210,255', u.to.x, u.to.y, 160 * clamp01(1 - tt / 1), a * clamp01(1 - tt / 1), true);
        }
        sparksDraw(ctx, s.sp, dt, a, 500);
      }
    },

    {
      id: 'win_blackhole', group: G_WIN, name: 'Czarna dziura', dur: 4.6,
      init(env) { return { p: Array.from({ length: 260 }, () => ({ x: rand(0, env.W), y: rand(0, env.H), c: pick(['200,170,255', '140,200,255', '255,255,255']) })), hit: -9, sp: [] }; },
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, T = 2.4, R = Math.max(0.5, 60 * easeOutBack(clamp01(t / 0.6)) * (1 - clamp01((t - T - 0.1) / 0.3)));
        ctx.globalCompositeOperation = 'lighter';
        // dysk akrecyjny
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.translate(u.to.x, u.to.y); ctx.rotate(t * (2 + i));
          ctx.shadowColor = 'rgb(170,110,255)'; ctx.shadowBlur = 16; ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = i === 1 ? 'rgb(120,200,255)' : 'rgb(190,130,255)'; ctx.lineWidth = 4 - i;
          ctx.setLineDash([R * 0.6, R * 0.25]); ctx.beginPath(); ctx.ellipse(0, 0, R * (1.6 + i * 0.4), R * (0.55 + i * 0.12), 0, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        ctx.setLineDash([]);
        // cząsteczki z całego ekranu wciągane do środka
        for (const q of s.p) {
          const dx = u.to.x - q.x, dy = u.to.y - q.y, d = Math.hypot(dx, dy) || 1;
          const sp = (220 + 60000 / d) * dt * (t < T ? 1 : 0);
          q.x += dx / d * sp + (-dy / d) * sp * 0.6; q.y += dy / d * sp + (dx / d) * sp * 0.6;
          if (d < R * 0.6) { q.x = rand(0, W); q.y = Math.random() < 0.5 ? -10 : H + 10; }
          if (t < T + 0.2) dot(ctx, q.c, q.x, q.y, 3.5, a * 0.8, true);
        }
        // przedmiot rozciągany i wciągany
        if (t < T) {
          o.hideItem();
          const f = easeIn(clamp01(t / T)), an = f * TAU * 2;
          const x = u.from.x + (u.to.x - u.from.x) * f + Math.cos(an) * 60 * (1 - f), y = u.from.y + (u.to.y - u.from.y) * f + Math.sin(an) * 60 * (1 - f);
          drawItem(ctx, u.img, x, y, u.base * (2.2 - 1.6 * f), an, 1 + f * 1.5, a, true);
        } else if (s.hit < 0) { s.hit = t; burst(s.sp, u.to, 140, 200, 700, ['255,255,255', '200,170,255', '140,200,255']); }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(u.to.x, u.to.y, Math.max(0, R * 0.55), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        if (s.hit > 0) {
          const tt = t - s.hit;
          shakeScreen(10 * clamp01(1 - tt / 0.4) * a);
          ctx.globalAlpha = 1; ctx.fillStyle = `rgba(235,225,255,${0.7 * clamp01(1 - tt / 0.4) * a})`; ctx.fillRect(0, 0, W, H);
          ringFx(ctx, u.to, tt, 1.1, Math.max(W, H) * 0.5, '200,170,255', a);
        }
        sparksDraw(ctx, s.sp, dt, a, 0);
      }
    },

    {
      id: 'win_legion', group: G_WIN, name: 'Deszcz legend', dur: 4.6,
      init(env) { return { c: Array.from({ length: 24 }, () => ({ x0: rand(0, env.W), y0: rand(-200, -40), d: rand(0, 1.2), T: rand(0.9, 1.4), bend: rand(-250, 250), hit: false })), sp: [], last: -9 }; },
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out;
        ctx.globalCompositeOperation = 'lighter';
        o.hideItem();
        for (const c of s.c) {
          const f = (t - c.d) / c.T;
          if (f < 0) continue;
          if (f >= 1) {
            if (!c.hit) { c.hit = true; s.last = t; burst(s.sp, u.to, 14, 80, 260, ['255,220,120', '255,180,60']); }
            continue;
          }
          const e = easeIn(f), x = c.x0 + (u.to.x - c.x0) * e + Math.sin(f * Math.PI) * c.bend, y = c.y0 + (u.to.y - c.y0) * e;
          dot(ctx, '255,190,70', x, y, 26, a * 0.6);
          drawItem(ctx, u.img, x, y, u.base * (1.8 - 0.8 * f), f * 10, 1, a, false);
        }
        const done = s.c.every(c => c.hit);
        if (s.last > 0) {
          const tt = t - s.last;
          shakeScreen(3 * clamp01(1 - tt / 0.15) * a);
          dot(ctx, '255,220,150', u.to.x, u.to.y, done ? 160 * clamp01(1 - tt / 0.8) : 60 * clamp01(1 - tt / 0.2), a, true);
          if (done) ringFx(ctx, u.to, tt, 0.9, 200, '255,210,120', a);
        }
        sparksDraw(ctx, s.sp, dt, a, 400);
      }
    },

    {
      id: 'win_crown', group: G_WIN, name: 'Koronacja', dur: 5,
      init: () => ({ conf: [], hit: -9, popped: false }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, cx = W / 2, cy = H * 0.45, T1 = 0.6, T2 = 2.5, T3 = 3.2;
        let ix = u.to.x, iy = u.to.y, iz = u.base;
        if (t < T1) { const f = easeOut(t / T1); ix = u.from.x + (cx - u.from.x) * f; iy = u.from.y + (cy - u.from.y) * f; iz = u.base * (1 + 2.5 * f); }
        else if (t < T2) { ix = cx; iy = cy; iz = u.base * 3.5; }
        else if (t < T3) { const f = easeIn((t - T2) / (T3 - T2)); ix = cx + (u.to.x - cx) * f; iy = cy + (u.to.y - cy) * f; iz = u.base * (3.5 - 2.5 * f); }
        ctx.globalCompositeOperation = 'lighter';
        if (t < T3) {
          o.hideItem();
          raysBehind(ctx, ix, iy, iz * 2.4, t, a);
          dot(ctx, '255,200,80', ix, iy, iz * 1.3, a * 0.8);
          drawItem(ctx, u.img, ix, iy, iz, 0, 1, a, true);
          // korona opada na przedmiot
          const cd = easeOutBack(clamp01((t - T1) / 0.6)), crY = iy - iz * 0.55 - (1 - cd) * 220, cs = iz * 0.9;
          if (t > T1) drawCrown(ctx, ix, crY, cs, a);
          if (!s.popped && t > T1 + 0.6) {
            s.popped = true;
            for (let i = 0; i < 160; i++) s.conf.push({ x: cx + rand(-40, 40), y: cy - 40, vx: rand(-520, 520), vy: rand(-760, -200), rot: rand(0, TAU), vr: rand(-10, 10), w: rand(6, 11), h: rand(3, 6), c: hsl(Math.random(), 0.9, 0.6), ph: rand(0, TAU) });
          }
          if (t > T1 + 0.6 && t < T2) caption(ctx, 'LEGENDA!', cx, cy + iz * 0.9, a * clamp01((t - T1 - 0.6) / 0.3), 34);
        } else if (s.hit < 0) s.hit = t;
        if (s.hit > 0) { const tt = t - s.hit; shakeScreen(6 * clamp01(1 - tt / 0.3) * a); ringFx(ctx, u.to, tt, 0.9, 180, '255,210,110', a); dot(ctx, '255,230,160', u.to.x, u.to.y, 130 * clamp01(1 - tt / 0.7), a * clamp01(1 - tt / 0.7), true); }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.conf.length - 1; i >= 0; i--) {
          const q = s.conf[i];
          q.vx *= Math.pow(0.4, dt); q.vy = q.vy * Math.pow(0.5, dt) + 500 * dt; q.x += (q.vx + Math.sin(t * 5 + q.ph) * 30) * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
          if (q.y > H + 20) { s.conf.splice(i, 1); continue; }
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.scale(1, Math.cos(t * 8 + q.ph));
          ctx.globalAlpha = a; ctx.fillStyle = `rgb(${q.c})`; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
          ctx.restore();
        }
      }
    },

    /* ----------------------- UTRACONY – złodziej (sprite) ----------------------- */

    {
      id: 'lose_vanish', group: G_LOSE, name: 'Znikający złodziej', dur: 4.8,
      init: () => ({ smoke: [] }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, side = u.from.x < W / 2 ? 1 : -1, size = 210;
        const tx = clampX(u.from.x + side * 110, W, size), ty = u.from.y + size * 0.45;
        let frame;
        if (t < 0.45) frame = thiefAppear(t / 0.45);
        else if (t < 2.4) frame = thiefIdle(t);
        else frame = thiefVanish(clamp01((t - 2.4) / 0.6));
        const grab = clamp01((t - 1.0) / 0.35), gone = clamp01((t - 2.4) / 0.6);
        // przedmiot leci w ręce złodzieja
        if (gone < 1) {
          const ix = u.from.x + (tx - side * 12 - u.from.x) * easeInOut(grab), iy = u.from.y + (ty - size * 0.42 - u.from.y) * easeInOut(grab);
          drawItem(ctx, u.img, ix, iy, u.base * (2.4 - 0.9 * grab), 0, 1, a * (1 - gone), grab < 1);
        }
        if ((t < 0.5 || (t > 2.3 && t < 3.1)) && Math.random() < 0.7) s.smoke.push({ x: tx + rand(-50, 50), y: ty - rand(10, size * 0.9), l: 0 });
        for (let i = s.smoke.length - 1; i >= 0; i--) {
          const q = s.smoke[i]; q.l += dt; if (q.l > 0.9) { s.smoke.splice(i, 1); continue; }
          dot(ctx, '90,60,120', q.x, q.y - q.l * 30, 20 + q.l * 30, a * 0.5 * (1 - q.l / 0.9));
        }
        drawThiefSprite(ctx, tx, ty, size, frame, side < 0, a);
        if (t > 1.2 && t < 2.5) caption(ctx, 'Hehe!', tx, ty - size - 10, a * clamp01((t - 1.2) / 0.2) * clamp01((2.5 - t) / 0.3), 24);
        caption(ctx, u.who ? `${u.who} podebrał łup!` : (u.reasonKey === 'other' ? 'Ktoś podebrał Ci łup!' : u.reason), clampX(tx, W, 360), ty + 34, a * clamp01((t - 1.2) / 0.4), 26);
        sadFace(ctx, u.from.x, u.from.y, 44 * easeOutBack(clamp01((t - 3) / 0.4)), a, t, { look: side });
      }
    },

    {
      id: 'win_hero', group: G_WIN, name: 'Bohater niesie łup', dur: 5,
      init: () => ({ sp: [], hit: -9 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, sc = 3 * (o.itemScale || 1), fw = 32 * sc, fh = 48 * sc;
        const dist = Math.hypot(u.to.x - u.from.x, u.to.y - u.from.y);
        const T0 = 0.35, T = T0 + Math.max(1.1, Math.min(2.8, dist / 320)); // pojawienie się + marsz
        const f = clamp01((t - T0) / (T - T0));
        const x = u.from.x + (u.to.x - u.from.x) * f, y = u.from.y + (u.to.y - u.from.y) * f;
        const walking = t > T0 && t < T;
        const dir = !walking ? 'S' : Math.abs(u.to.x - u.from.x) > Math.abs(u.to.y - u.from.y) ? (u.to.x > u.from.x ? 'E' : 'W') : (u.to.y > u.from.y ? 'S' : 'N');
        const step = walking ? Math.floor(t * 8) % 4 : 0;
        const bob = walking ? Math.abs(Math.sin(t * 16)) * 3 : 0;
        const appear = clamp01(t / T0), leave = clamp01((t - T - 0.9) / 0.5);
        const ha = a * appear * (1 - leave);
        const feetY = y + fh * 0.12;
        // cień
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ha * 0.35; ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(x, feetY, fw * 0.35, fw * 0.12, 0, 0, TAU); ctx.fill();
        // postać gracza
        const drawn = drawHeroSprite(ctx, x, feetY - bob, sc, dir, step, t, ha);
        if (!drawn) sadFace(ctx, x, feetY - fh * 0.5, fw * 0.4, ha, t, {}); // awaryjnie
        // przedmiot niesiony nad głową
        if (t < T + 0.05) {
          o.hideItem();
          ctx.globalCompositeOperation = 'lighter';
          const ix = x, iy = feetY - fh - 14 - bob + Math.sin(t * 5) * 3;
          dot(ctx, '255,190,70', ix, iy, u.base * 1.4, a * 0.7);
          drawItem(ctx, u.img, ix, iy, u.base * 1.6, Math.sin(t * 4) * 0.15, 1, a, true);
          if (Math.random() < 0.5) s.sp.push({ x: ix + rand(-16, 16), y: iy + rand(-16, 16), vx: rand(-20, 20), vy: rand(-60, -20), l: 0, m: 0.6, c: '255,220,140' });
        } else if (s.hit < 0) {
          s.hit = t;
          burst(s.sp, u.to, 70, 120, 420, ['255,220,120', '255,180,60', '255,255,220']);
        }
        if (s.hit > 0) {
          const tt = t - s.hit;
          ringFx(ctx, u.to, tt, 0.8, 140, '255,210,120', a);
          dot(ctx, '255,230,160', u.to.x, u.to.y, 90 * clamp01(1 - tt / 0.6), a * clamp01(1 - tt / 0.6), true);
          if (tt < 0.9) caption(ctx, 'Moje!', x, feetY - fh - 30, a * clamp01(tt / 0.2) * clamp01((0.9 - tt) / 0.3), 22);
        }
        sparksDraw(ctx, s.sp, dt, a, 200);
      }
    },

    {
      id: 'lose_witch', group: G_LOSE, name: 'Wiedźma-pożeraczka', dur: 5.2,
      init: () => ({ crumbs: [], chomp: -1 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, size = 260 * (o.itemScale || 1);
        const side = u.from.x < W / 2 ? 1 : -1;
        const wx = clampX(u.from.x + side * 110, W, size), wy = Math.min(H - 10, u.from.y + size * 0.55);
        // oś czasu klatek: 0–33 spokój, 34–37 przemiana, 38–53 kłapanie, 54–59 powrót
        const T1 = 0.6, T2 = T1 + 0.4, T3 = T2 + 1.4, T4 = T3 + 0.45;
        let fr;
        if (t < T1) fr = Math.floor(t * 8) % 34;
        else if (t < T2) fr = 34 + Math.min(3, Math.floor((t - T1) / (T2 - T1) * 4));
        else if (t < T3) fr = 38 + Math.floor((t - T2) * 12) % 16;
        else if (t < T4) fr = 54 + Math.min(5, Math.floor((t - T3) / (T4 - T3) * 6));
        else fr = Math.floor(t * 8) % 34;
        const appear = clamp01(t / 0.35), leave = clamp01((t - this.dur + 0.6) / 0.5);
        // „paszcza” (tył postaci) – mniej więcej lewa dolna część klatki
        const flip = side < 0; // w oryginale tył (paszcza) jest po lewej – odwracamy tak, by był od strony przedmiotu
        const mx = wx + (flip ? 1 : -1) * size * 0.2, my = wy - size * 0.36;
        // przedmiot podlatuje i zostaje pożarty
        if (t < T2 + 0.6) {
          const k = clamp01((t - 0.25) / (T2 - 0.25));
          const ix = u.from.x + (mx - u.from.x) * easeInOut(k), iy = u.from.y + (my - u.from.y) * easeInOut(k) - Math.sin(k * Math.PI) * 60;
          const eat = clamp01((t - T2) / 0.6);
          const shake = eat > 0 ? rand(-3, 3) * (1 - eat) : 0;
          drawItem(ctx, u.img, ix + shake, iy + shake, u.base * 2.2 * (1 - eat * 0.85), eat * 2, 1 - eat * 0.4, a * (1 - eat), false, eat > 0 ? `brightness(${1 - eat * 0.5})` : null);
        }
        // kłapnięcia: okruchy, drgania
        if (t > T2 && t < T3) {
          const c = Math.floor((t - T2) * 3);
          if (c !== s.chomp) {
            s.chomp = c;
            for (let i = 0; i < 16; i++) s.crumbs.push({ x: mx + rand(-20, 20), y: my + rand(-10, 10), vx: rand(-220, 220), vy: rand(-320, -80), l: 0, m: rand(0.6, 1.1), c: pick(['#c9a24a', '#8a6a2a', '#e8d9a0', '#9a9a9a']), z: rand(2, 5) });
          }
          shakeScreen(3 * Math.abs(Math.sin((t - T2) * Math.PI * 3)) * a);
        }
        drawWitchSprite(ctx, wx, wy, size, fr, flip, a * appear * (1 - leave));
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.crumbs.length - 1; i >= 0; i--) {
          const q = s.crumbs[i]; q.l += dt; if (q.l > q.m) { s.crumbs.splice(i, 1); continue; }
          q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
          ctx.globalAlpha = a * (1 - q.l / q.m); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.z, q.z);
        }
        if (t > T2 + 0.3 && t < T3 + 0.2) caption(ctx, ['CHRUP!', 'MLASK!', 'CHRUP!'][Math.max(0, s.chomp) % 3], mx + rand(-3, 3), my - size * 0.55, a * 0.9, 30);
        if (t > T4) caption(ctx, 'Mniam!', wx, wy - size - 10, a * clamp01((t - T4) / 0.3) * (1 - leave), 26);
        caption(ctx, u.reason, wx, Math.min(H - 20, wy + 26), a * clamp01((t - T2) / 0.4), 24);
      }
    },

    {
      id: 'lose_chase', group: G_LOSE, name: 'Pościg z kijem bejsbolowym', dur: 4.5,
      init: () => ({ puffs: [], bonk: -9, stars: 0 }),
      frame(ctx, s, t, dt, a, W, H, b, o) {
        const u = o.out, sc = 2.6;
        const dir = u.from.x < W / 2 ? 1 : -1;
        const T0 = 0.35, run = Math.max(0, t - T0), dur = Math.max(1.5, this.dur - T0 - 0.6);
        const k = clamp01(run / dur);
        const baseY = Math.min(H - 20, u.from.y + 90);
        const tx = u.from.x + dir * (40 + k * k * W * 0.85);           // uciekający
        const gap = 110 - 70 * clamp01(run / 1.4) + (s.bonk > 0 ? 60 * clamp01((t - s.bonk) / 0.6) : 0);
        const hx = tx - dir * gap;                                       // gracz z kijem
        const appear = clamp01(t / T0);
        const rdir = dir > 0 ? 'E' : 'W';
        const step = run > 0 ? Math.floor(t * 10) % 4 : 0;
        const bobT = run > 0 ? Math.abs(Math.sin(t * 18)) * 5 : 0, bobH = run > 0 ? Math.abs(Math.sin(t * 18 + 1)) * 5 : 0;
        // kurz spod nóg
        if (run > 0 && Math.random() < dt * 20) { s.puffs.push({ x: tx - dir * 10, y: baseY, l: 0 }); s.puffs.push({ x: hx - dir * 10, y: baseY, l: 0 }); }
        ctx.globalCompositeOperation = 'source-over';
        for (let i = s.puffs.length - 1; i >= 0; i--) {
          const q = s.puffs[i]; q.l += dt; if (q.l > 0.6) { s.puffs.splice(i, 1); continue; }
          dot(ctx, '190,180,160', q.x, q.y - q.l * 10, 12 + q.l * 26, a * 0.45 * (1 - q.l / 0.6));
        }
        // uciekający z łupem (strój gracza, który zgarnął; gdy go nie widać – złodziej)
        const stagger = s.bonk > 0 ? Math.max(0, 1 - (t - s.bonk) / 0.4) : 0;
        const drawnThief = drawCharSprite(ctx, u.whoChar, tx, baseY - bobT + stagger * 6, sc, rdir, step, t, a * appear);
        if (!drawnThief) drawThiefSprite(ctx, tx, baseY - bobT, 150, thiefIdle(t), dir > 0, a * appear);
        const headY = baseY - (drawnThief ? 48 * sc : 150) - bobT;
        drawItem(ctx, u.img, tx, headY - 16 + Math.sin(t * 9) * 3, u.base * 1.7, Math.sin(t * 7) * 0.25, 1, a * appear, true);
        if (u.who) caption(ctx, u.who, tx, baseY + 22, a * appear, 17);
        // gracz z kijem bejsbolowym
        const drawnHero = drawHeroSprite(ctx, hx, baseY - bobH, sc, rdir, step, t, a * appear);
        const hh = drawnHero ? 48 * sc : 120;
        const swingPh = (run * 2.6) % 1;                                 // zamach co ~0.4 s
        const swing = swingPh < 0.35 ? -2.2 + (swingPh / 0.35) * 3.0 : 0.8 - ((swingPh - 0.35) / 0.65) * 3.0;
        drawBat(ctx, hx + dir * 10, baseY - hh * 0.55 - bobH, 70 * sc / 2.6, dir, swing, a * appear);
        // BONK!
        if (s.bonk < 0 && run > 1.3) { s.bonk = t; }
        if (s.bonk > 0) {
          const tt = t - s.bonk;
          shakeScreen(6 * clamp01(1 - tt / 0.25) * a);
          if (tt < 0.9) caption(ctx, 'BONK!', tx - dir * 10, headY - 50 - tt * 20, a * clamp01(1 - tt / 0.9), 34);
          for (let i = 0; i < 5; i++) {
            const an = t * 5 + (i / 5) * TAU;
            sparkleStar(ctx, tx + Math.cos(an) * 26, headY - 28 + Math.sin(an) * 8, 9, a * clamp01(1.8 - tt));
          }
        }
        if (run > 0.2 && run < 1.3) caption(ctx, 'Oddawaj!', hx, baseY - hh - 26, a * clamp01((run - 0.2) / 0.2), 22);
        caption(ctx, u.who ? `${u.who} ucieka z Twoim łupem!` : u.reason, W / 2, Math.max(50, u.from.y - 240), a * clamp01((t - 0.4) / 0.4), 26);
      }
    },
  ];

  // skalowanie gęstości efektów ramki do obwodu (ramka mapy jest dużo dłuższa niż okno łupów)
  const PERIM_LOOT = 2 * (212 + 231);
  const perimScale = bx => Math.max(1, Math.min(3.5, (2 * (bx.w + bx.h)) / PERIM_LOOT));

  /* ------------------------------- WARSTWY ------------------------------- */
  // kolejność = kolejność rysowania (od spodu)
  const LAYERS = [
    { key: 'screen', label: 'Cały ekran', group: G_SCREEN },
    { key: 'map', label: 'Ramka okna gry', group: G_FRAME, target: 'map' },
    { key: 'around', label: 'Wokół okna łupów', group: G_AROUND },
    { key: 'loot', label: 'Ramka okna łupów', group: G_FRAME, target: 'loot' },
    { key: 'item', label: 'Animacja przedmiotu', group: G_ITEM },
    { key: 'win', label: 'Łup zdobyty – do torby', group: G_WIN, outcome: true },
    { key: 'lose', label: 'Łup utracony', group: G_LOSE, outcome: true },
  ];
  const layerOptions = Ly => [['', 'Brak'], ['random', 'Losowy']].concat(Ly.key === 'lose' ? [['auto', 'Dopasuj do powodu']] : [], EFFECTS.filter(e => e.group === Ly.group).map(e => [e.id, e.name]));
  const UI_ORDER = ['item', 'loot', 'map', 'around', 'screen', 'win', 'lose'];
  const DEFAULT_CFG = () => ({
    enabled: false,
    layers: { loot: '', map: '', around: '', item: '', screen: '', win: '', lose: '' },
    hue: { loot: 0, map: 0, around: 0, item: 0, screen: 0, win: 0, lose: 0 },
    outcomeSec: 4,
    quality: 'auto',
    durationSec: 0, strength: 100, density: 100, itemSize: 100, // durationSec: 0 = do zamknięcia okna łupów
  });

  /* ---------------------------------- SILNIK ---------------------------------- */
  const FX = { canvas: null, raf: 0 };

  function stopFx() {
    resetShake();
    resetGrey();
    setItemHidden(null, false);
    if (FX.raf) cancelAnimationFrame(FX.raf);
    FX.raf = 0;
    if (FX.canvas) FX.canvas.remove();
    FX.canvas = null;
  }

  function mapCenter() {
    const el = mapCanvas();
    const best = el ? el.getBoundingClientRect() : null;
    if (best && best.width > 200 && best.height > 200) return { x: best.left + best.width / 2, y: best.top + best.height / 2 };
    return { x: innerWidth / 2, y: innerHeight / 2 };
  }
  // prostokąt okna łupów (jeśli jest widoczne)
  function lootBox() {
    for (const el of document.querySelectorAll('.loot-wnd')) {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40 && el.offsetParent !== null) return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
    return null;
  }
  // obramowanie okna gry = największy canvas (mapa)
  // canvas mapy wyszukujemy rzadko (na stronie są setki małych canvasów ikon – pomijamy je bez liczenia layoutu)
  let MAPEL = null, MAPEL_T = 0;
  function mapCanvas() {
    const now = performance.now();
    if (MAPEL && MAPEL.isConnected && now - MAPEL_T < 5000) return MAPEL;
    let el = null, area = 0;
    for (const c of document.querySelectorAll('canvas')) {
      if (c.width < 200 || c.height < 150 || c.classList.contains('lnfx-canvas')) continue;
      const r = c.getBoundingClientRect(), ar = r.width * r.height;
      if (ar > area) { area = ar; el = c; }
    }
    MAPEL = el; MAPEL_T = now;
    return el;
  }
  function mapBox() {
    const el = mapCanvas();
    const best = el ? el.getBoundingClientRect() : null;
    if (!best || best.width < 200) return { x: 20, y: 20, w: innerWidth - 40, h: innerHeight - 40, cx: innerWidth / 2, cy: innerHeight / 2 };
    return { x: best.left, y: best.top, w: best.width, h: best.height, cx: best.left + best.width / 2, cy: best.top + best.height / 2 };
  }
  // grafika legendy: najpierw w oknie łupów, potem (np. łup prosto do torby) najnowsza legenda w ekwipunku
  // wszystkie legendy w oknie łupów (kilka legend w jednym łupie)
  function findLegendIcons() {
    const out = [];
    for (const hl of document.querySelectorAll('.loot-wnd .item .highlight.t-leg')) {
      const c = hl.parentElement.querySelector('canvas.icon');
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }
  function findLegendIcon() {
    for (const hl of document.querySelectorAll('.loot-wnd .item .highlight.t-leg')) {
      const c = hl.parentElement.querySelector('canvas.icon');
      if (c) return c;
    }
    let best = null, maxId = -1;
    for (const hl of document.querySelectorAll('.item .highlight.t-leg')) {
      const el = hl.parentElement, c = el.querySelector('canvas.icon'), m = /item-id-(\d+)/.exec(el.className);
      const id = m ? +m[1] : 0;
      if (c && id > maxId && c.getBoundingClientRect().width > 0) { maxId = id; best = c; }
    }
    return best;
  }
  // chowanie oryginalnej ikonki w slocie (gdy animacja "zabiera" przedmiot)
  const hiddenIcons = new Set();
  function setItemsHidden(set) {
    for (const el of [...hiddenIcons]) if (!set.has(el)) { el.style.visibility = ''; hiddenIcons.delete(el); }
    for (const el of set) if (el && el.isConnected) { el.style.visibility = 'hidden'; hiddenIcons.add(el); }
  }
  function setItemHidden(el, flag) { setItemsHidden(flag && el ? new Set([el]) : new Set()); }
  // fixedSrc: konkretna ikonka (przy kilku legendach); bez niej – pierwsza znaleziona legenda
  function makeItemTracker(fixedSrc) {
    const tr = { src: fixedSrc || null, snap: document.createElement('canvas'), found: false, rect: null };
    return function update(b) {
      if (!fixedSrc && !tr.found) {
        const c = findLegendIcon();
        if (c) tr.src = c;
      }
      tr.n = (tr.n || 0) + 1;
      if (tr.src && tr.src.isConnected && (tr.n % 4 === 1 || !tr.found)) {
        const r = tr.src.getBoundingClientRect();
        if (r.width > 0) tr.rect = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
        const w = tr.src.width || 32, h = tr.src.height || 32;
        if (tr.snap.width !== w || tr.snap.height !== h) { tr.snap.width = w; tr.snap.height = h; }
        const g = tr.snap.getContext('2d');
        g.clearRect(0, 0, w, h);
        try { g.drawImage(tr.src, 0, 0); tr.found = true; } catch (e) { /* ignore */ }
      }
      return { el: tr.src && tr.src.isConnected ? tr.src : null, img: tr.found ? tr.snap : FALLBACK_ICON, x: tr.rect ? tr.rect.x : b.cx, y: tr.rect ? tr.rect.y : b.cy, base: tr.rect ? tr.rect.w : 32 };
    };
  }
  function fallbackBox() {
    const c = mapCenter();
    return { x: c.x - 106, y: c.y - 115, w: 212, h: 230, cx: c.x, cy: c.y };
  }

  // shadowBlur jest drogi – na naszych kontekstach skalujemy go jakością (RENDER.blur)
  const SB = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
  function tameBlur(c) {
    if (!SB || c.__lnfxBlur) return c;
    Object.defineProperty(c, 'shadowBlur', { configurable: true, get() { return SB.get.call(this); }, set(v) { SB.set.call(this, v * RENDER.blur); } });
    c.__lnfxBlur = true;
    return c;
  }
  function newCanvas() {
    const cv = document.createElement('canvas');
    cv.className = 'lnfx-canvas';
    document.body.appendChild(cv);
    return cv;
  }

  // Odtwarza kompozycję warstw (każda z własnym efektem, odcieniem i czasem).
  function playComposition(cfg, onlyKey, extra) {
    // efekty po łupie: extra.outcome = { win: [out, …], lose: [out, …] } (kilka legend naraz → kilka animacji)
    let outcome = extra && extra.outcome;
    if (!outcome && extra && extra.out && onlyKey) outcome = { [onlyKey]: [extra.out] };
    const isOut = !!outcome;
    const untilClose = !isOut && !(cfg.durationSec > 0);
    const P = { dur: isOut ? Math.max(1, Math.min(30, cfg.outcomeSec || 4)) : untilClose ? 600 : Math.min(120, cfg.durationSec), strength: cfg.strength / 100, density: cfg.density / 100, itemScale: cfg.itemSize / 100 };
    const resolveId = (Ly, out) => {
      let id = cfg.layers[Ly.key];
      if (id === 'auto') id = !out ? 'lose_thief' : out.reasonKey === 'full' ? 'lose_trash' : out.reasonKey === 'declined' ? 'lose_stamp' : pick(['lose_thief', 'lose_runner', 'lose_sack', 'lose_vanish', 'lose_chase']);
      if (id === 'random') id = pick(EFFECTS.filter(e => e.group === Ly.group)).id;
      return EFFECTS.find(e => e.id === id) || null;
    };
    // lista instancji: [{ Ly, eff, hue, delay, out, tracker }]
    const inst = [];
    const icons = isOut ? [] : findLegendIcons();
    for (const Ly of LAYERS) {
      if (onlyKey && Ly.key !== onlyKey) continue;
      if (!cfg.layers[Ly.key]) continue;
      const hue = +cfg.hue[Ly.key] || 0;
      if (isOut) {
        if (!Ly.outcome || !(outcome[Ly.key] && outcome[Ly.key].length)) continue;
        outcome[Ly.key].forEach((out, i) => { const eff = resolveId(Ly, out); if (eff) inst.push({ Ly, eff, hue, delay: i * 0.4, out }); });
      } else {
        if (Ly.outcome) continue; // efekty po łupie odpalają się osobno
        if (Ly.key === 'item' && icons.length > 1) {
          const eff = resolveId(Ly, null);
          if (eff) icons.forEach((ic, i) => inst.push({ Ly, eff, hue, delay: i * 0.3, tracker: makeItemTracker(ic) }));
        } else {
          const eff = resolveId(Ly, null);
          if (eff) inst.push({ Ly, eff, hue, delay: 0, tracker: Ly.key === 'item' ? makeItemTracker(icons[0] || null) : null });
        }
      }
    }
    // numer instancji w obrębie warstwy (żeby kilka przedmiotów nie nakładało się w jednym miejscu)
    const perKey = {};
    for (const it of inst) { it.idx = perKey[it.Ly.key] = (perKey[it.Ly.key] ?? -1) + 1; }
    for (const it of inst) it.n = perKey[it.Ly.key] + 1;
    stopFx();
    if (!inst.length) return;
    const cv = newCanvas(), ctx = tameBlur(cv.getContext('2d'));
    const quality = cfg.quality || 'auto';
    let dpr = renderScaleFor(quality);
    RENDER.blur = quality === 'low' || dpr < 0.8 ? 0 : quality === 'high' ? 1 : 0.5;
    const resize = () => { cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); };
    resize();
    let frameNo = 0, ema = 0.016, lastAdapt = 0, real = null;
    let box = lootBox() || fallbackBox();
    let map = mapBox();
    const shared = makeItemTracker(icons[0] || null);
    const layers = inst.map(sp => {
      const dur = P.dur; // każda warstwa trwa dokładnie tyle, ile ustawiono
      const self = Object.assign(Object.create(sp.eff), { dur }); // efekty czytają this.dur
      const isMap = sp.Ly.target === 'map';
      const scale = (sp.Ly.group === G_FRAME ? (isMap ? perimScale(map) : 1) : 1) * P.density;
      // gdy ten sam efekt jest na obu ramkach, tło (winieta, śnieg) rysuje tylko jedna z nich
      const second = sp.Ly.key === 'loot' && inst.some(o => o.Ly.key === 'map' && o.eff.id === sp.eff.id);
      const env = { W: innerWidth, H: innerHeight, box: isMap ? map : box, map, scale, density: P.density, itemScale: P.itemScale };
      return { sp, self, dur, delay: sp.delay, isMap, scale, second, state: sp.eff.init.call(self, env), lc: sp.hue ? document.createElement('canvas') : null };
    });
    let total = Math.max(...layers.map(l => l.dur + l.delay));
    let seenWindow = false;
    const endAt = te => { for (const l of layers) if (l.dur + l.delay > te) { l.dur = Math.max(0, te - l.delay); l.self.dur = l.dur; } total = Math.min(total, te); };
    const t0 = performance.now();
    let last = t0;
    FX.canvas = cv;
    const frame = now => {
      if (FX.canvas !== cv) return;
      // znacznik czasu rAF bywa wcześniejszy niż performance.now() z chwili startu
      const t = Math.max(0, (now - t0) / 1000), dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      frameNo++;
      // tryb auto: gdy średni czas klatki > ~24 ms, zmniejszamy rozdzielczość efektów (do 55%)
      ema = ema * 0.92 + dt * 0.08;
      if (quality === 'auto' && frameNo > 20 && frameNo - lastAdapt > 30 && ema > 0.024 && RENDER.autoScale > 0.56) {
        RENDER.autoScale = Math.max(0.55, RENDER.autoScale * 0.8);
        dpr = renderScaleFor(quality); RENDER.blur = dpr < 0.8 ? 0 : 0.5; lastAdapt = frameNo;
        for (const l of layers) if (l.lc) { l.lc.width = 1; }
      }
      if (cv.width !== Math.round(innerWidth * dpr)) resize();
      // odczyty z DOM (layout) co kilka klatek, a nie w każdej
      if (!isOut && (frameNo % 4 === 1)) real = lootBox();
      if (real) { box = real; seenWindow = true; } // okno zamknięte w trakcie efektu → zostaje ostatnia pozycja
      // gracz zamknął okno łupów → animacja szybko wygasa
      if (seenWindow && !real && total > t + 0.45) endAt(t + 0.45);
      // tryb "do zamknięcia okna", a okna w ogóle nie ma (np. podgląd) → 8 s
      if (untilClose && !seenWindow && t > 1.5 && total > 8) endAt(Math.max(8, t));
      if (frameNo % 10 === 1) map = mapBox();
      let holed = false;
      const hide = new Set();
      // okno łupów musi być zawsze widoczne: wycinamy jego prostokąt z naszego canvasa
      const hole = () => {
        if (holed || !real) return;
        holed = true;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(Math.floor((real.x - 2) * dpr), Math.floor((real.y - 8) * dpr), Math.ceil((real.w + 4) * dpr), Math.ceil((real.h + 10) * dpr));
      };
      const W = innerWidth, H = innerHeight;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const sharedItem = isOut ? null : shared(box);
      SHAKE.active = false; GREY.active = false;
      for (const l of layers) {
        const tl = t - l.delay;
        if (tl < 0 || tl > l.dur) continue;
        if (l.sp.Ly.key === 'item') hole(); // animacja przedmiotu może być nad oknem
        const out = l.sp.out || null;
        const item = out ? { el: out.el && out.el.isConnected ? out.el : null, img: out.img, x: out.to.x, y: out.to.y, base: out.base }
          : l.sp.tracker ? l.sp.tracker(box) : sharedItem;
        let c = ctx;
        // warstwa z przesunięciem koloru: osobny canvas (w niższej rozdzielczości, chyba że jakość wysoka) + filtr hue-rotate
        const ls = quality === 'high' ? 1 : 0.5;
        if (l.lc) {
          const lw = Math.round(cv.width * ls), lh = Math.round(cv.height * ls);
          if (l.lc.width !== lw || l.lc.height !== lh) { l.lc.width = lw; l.lc.height = lh; }
          c = tameBlur(l.lc.getContext('2d'));
          c.setTransform(1, 0, 0, 1, 0, 0);
          c.clearRect(0, 0, l.lc.width, l.lc.height);
        }
        const cs = l.lc ? dpr * ls : dpr;
        c.setTransform(cs, 0, 0, cs, 0, 0);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.shadowBlur = 0; c.filter = 'none';
        const a = clamp01(tl / 0.35) * clamp01((l.dur - tl) / Math.min(0.9, Math.max(0.3, l.dur * 0.2))) * P.strength;
        const o = { map, item, scale: l.scale, second: l.second, density: P.density, itemScale: P.itemScale, hideItem: () => { if (item && item.el) hide.add(item.el); }, out, index: l.sp.idx || 0, count: l.sp.n || 1 };
        try { l.sp.eff.frame.call(l.self, c, l.state, tl, dt, a, W, H, l.isMap ? map : box, o); }
        catch (e) { console.error('[LNFX]', l.sp.eff.id, e); l.dur = -1; continue; }
        if (l.lc) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
          ctx.filter = `hue-rotate(${l.sp.hue}deg)`;
          ctx.drawImage(l.lc, 0, 0, cv.width, cv.height);
          ctx.filter = 'none';
        }
      }
      // ikonki czekające na swoją (opóźnioną) animację też są schowane, jeśli animacja je "zabiera"
      for (const l of layers) {
        const tl = t - l.delay;
        if (tl < 0 && l.sp.out && l.sp.out.el && l.sp.Ly.key === 'win') hide.add(l.sp.out.el);
      }
      hole();
      setItemsHidden(hide);
      if (!SHAKE.active) resetShake();
      if (!GREY.active) resetGrey();
      if (t < total) FX.raf = requestAnimationFrame(frame); else stopFx();
    };
    FX.raf = requestAnimationFrame(frame);
  }

  // pojedynczy efekt (podgląd / konsola)
  function playFx(id) {
    const eff = EFFECTS.find(e => e.id === id);
    if (!eff) return;
    const cfg = DEFAULT_CFG();
    const Ly = eff.group === G_FRAME ? LAYERS.find(l => l.key === 'loot') : LAYERS.find(l => l.group === eff.group);
    cfg.layers[Ly.key] = id;
    if (Ly.outcome) playComposition(cfg, Ly.key, { out: demoOutcome(Ly.key) });
    else playComposition(cfg);
  }


  /* --------------------------- zapis ustawień (per preset) --------------------------- */
  // Aktywny preset bierzemy z danych dodatku w silniku gry (Engine.serverStorage "LN_SETTINGS"),
  // a nie z okna ustawień – ono nie zawsze jest otwarte (na dev siedzi w Ustawieniach gry).
  let lastPreset = 'default';
  function presetNameDom() {
    let el = document.querySelector('.ln_presets .menu-option');
    if (!el) {
      const d = [...document.querySelectorAll('.opt_LEGENDARY_NOTIFICATOR_CHECKBOX .option-description')].find(e => e.textContent.trim() === 'Preset');
      el = d && d.closest('.option-container').querySelector('.menu-option');
    }
    return el && el.textContent.trim() ? el.textContent.trim() : null;
  }
  function presetInfo() {
    let d = null;
    try { d = window.Engine && Engine.serverStorage && Engine.serverStorage.get('LN_SETTINGS'); } catch (e) { /* ignore */ }
    const dom = presetNameDom();
    if (d && d.active_preset != null) {
      const id = d.active_preset;
      const c = (d.preset_custom_list || []).find(x => x && x.id === id);
      const name = dom || (c && (c.text || c.name)) || 'Domyślny ' + (id + 1);
      lastPreset = name;
      return { key: 'p' + id, name };
    }
    if (dom) lastPreset = dom;
    return { key: lastPreset, name: lastPreset };
  }
  function presetName() { return presetInfo().name; }
  function makeStore(key) {
    const loadAll = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
    const saveAll = o => { try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) { /* ignore */ } };
    return {
      get() {
        const all = loadAll(), p = presetInfo();
        if (all[p.key] != null) return all[p.key];
        if (all[p.name] != null) return all[p.name]; // zapis ze starszych wersji (po nazwie presetu)
        const vals = Object.values(all);
        return vals.length === 1 ? vals[0] : null;  // jeden zapisany preset → używamy go
      },
      set(v) {
        const o = loadAll(), p = presetInfo();
        if (p.name !== p.key) delete o[p.name];
        if (v) o[p.key] = v; else delete o[p.key];
        saveAll(o);
      },
    };
  }
  const oldFxStore = makeStore(STORE_KEY);      // v0.1–0.4: jeden wybrany efekt
  const cfgStore = makeStore(CFG_STORE_KEY);    // v0.5+: kompozycja warstw
  const soundStore = makeStore(SOUND_STORE_KEY);

  function getCfg() {
    const saved = cfgStore.get();
    const cfg = DEFAULT_CFG();
    if (saved) {
      Object.assign(cfg, saved);
      cfg.layers = Object.assign(DEFAULT_CFG().layers, saved.layers);
      cfg.hue = Object.assign(DEFAULT_CFG().hue, saved.hue);
      return cfg;
    }
    // migracja z pojedynczego efektu ze starszych wersji
    const old = oldFxStore.get();
    if (old) {
      const base = old.replace(/_dual$/, '');
      const eff = EFFECTS.find(e => e.id === base);
      if (eff) {
        cfg.enabled = true;
        if (eff.group === G_FRAME) { cfg.layers.loot = base; if (old.endsWith('_dual')) cfg.layers.map = base; }
        else cfg.layers[LAYERS.find(l => l.group === eff.group).key] = base;
      }
    }
    return cfg;
  }
  function saveCfg(cfg) { cfgStore.set(cfg); }
  const hasLayers = cfg => Object.values(cfg.layers).some(Boolean);

  /* ------------------------------ losowy dźwięk ------------------------------ */
  // Tylko dźwięki dodane przez użytkownika (lista "sound_custom_list" dodatku), bez "Domyślny X".
  let lastSoundLink = null;
  function customSounds() {
    try {
      const d = window.Engine && Engine.serverStorage && Engine.serverStorage.get('LN_SETTINGS');
      return ((d && d.sound_custom_list) || []).filter(s => s && s.link);
    } catch (e) { return []; }
  }
  function playRandomSound() {
    let list = customSounds();
    if (!list.length) return;
    if (list.length > 1) list = list.filter(s => s.link !== lastSoundLink); // bez powtórki z rzędu
    const s = pick(list);
    lastSoundLink = s.link;
    try {
      if (Engine.soundManager && Engine.soundManager.createNotifSound) Engine.soundManager.createNotifSound(s.link, { keyAsUrl: true });
      else new Audio(s.link).play();
    } catch (e) { console.error('[LNFX] dźwięk', e); }
  }


  /* ------------- rozpoznawanie wyniku łupu: zdobyty (do torby) / utracony ------------- */
  // Z komunikacji z serwerem: legenda w oknie łupów ma loc "l"; po wygranej przychodzi ten sam
  // przedmiot z loc "g" (torba). Brak miejsca → komunikat "Przedmioty odrzucone lub brak wolnego
  // miejsca". W pozostałych przypadkach okno łupów znika, a przedmiot nie trafia do torby.
  const REASONS = { full: 'Brak miejsca w torbie', declined: 'Odrzucono łup', other: 'Ktoś był szybszy…' };
  const pending = new Map();
  const lootLog = []; // do diagnostyki: lnfx.lootLog
  let lastOutcomeAt = 0;
  const heroId = () => { try { return Engine.hero.d.id; } catch (e) { return null; } };
  const isLegend = it => !!(it && /rarity=legendary/.test(it.stat || ''));
  function copyCanvas(src) {
    try {
      const c = document.createElement('canvas');
      c.width = src.width || 32; c.height = src.height || 32;
      c.getContext('2d').drawImage(src, 0, 0);
      return c;
    } catch (e) { return null; }
  }
  const knownIds = new Set();        // przedmioty już widziane (np. ekwipunek po zalogowaniu)
  let legendNotifyAt = 0;             // kiedy dodatek ostatnio zgłosił legendę (confetti.reset)
  function onItems(items) {
    for (const [id, it] of Object.entries(items || {})) {
      if (!it || +id < 1000) continue; // pomijamy przedmiot z przycisku "Test"
      const known = knownIds.has(id);
      knownIds.add(id);
      if (it.loc === 'l' && isLegend(it)) {
        if (!pending.has(id)) pending.set(id, { name: it.name, hid: it.hid, who: null, state: 0, snap: null, from: null, goneAt: 0, reason: null, t: Date.now() });
      } else if (it.loc === 'g' && pending.has(id) && (it.own == null || it.own === heroId())) {
        const p = pending.get(id);
        pending.delete(id);
        setTimeout(() => resolveOutcome('win', id, p), 80);
      } else if (it.loc === 'g' && !known && isLegend(it) && (it.own == null || it.own === heroId())) {
        // legenda wpadła prosto do torby (łup osobisty, bez okna łupów) – dodatek zgłasza ją tuż przed/po
        setTimeout(() => {
          if (Date.now() - legendNotifyAt < 3000) resolveOutcome('win', id, { name: it.name, hid: it.hid, state: 1, snap: null, from: null, t: Date.now() });
        }, 150);
      }
    }
  }
  function parseLootSplit(msg) {
    const out = {};
    const body = String(msg).replace(/^\s*\[b\][^\[]*\[\/b\]\s*:\s*/, '');
    const re = /([^;]+?)\s+otrzyma(?:ł|ła|li|ły)\s+((?:ITEM#[0-9a-f]+(?::"[^"]*")?\s*,?\s*)+)/g;
    let m;
    while ((m = re.exec(body))) {
      const nick = m[1].replace(/\[\/?[a-z]+[^\]]*\]/gi, '').replace(/^[\s,.;:]+|[\s,.;:]+$/g, '').replace(/^i\s+/, '');
      for (const h of m[2].matchAll(/ITEM#([0-9a-f]+)/g)) out[h[1]] = nick;
    }
    return out;
  }
  function onLoot(loot, full) {
    if (loot && loot.states) for (const [id, st] of Object.entries(loot.states)) if (pending.has(id)) pending.get(id).state = st;
    let chat = '';
    try { chat = full && full.chat ? JSON.stringify(full.chat) : ''; } catch (e) { /* ignore */ }
    if (/brak wolnego miejsca/i.test(chat)) for (const p of pending.values()) p.reason = 'full';
    if (chat) {
      lootLog.push({ t: Date.now(), chat: chat.slice(0, 3000) });
      if (lootLog.length > 30) lootLog.shift();
      // kto zabrał łup – komunikat systemowy grupy, np.:
      // "[b]Podział łupów[/b]: Nick Gracza otrzymał ITEM#<hid>:"Nazwa", ITEM#<hid>:"Nazwa""
      const texts = [];
      const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.msg === 'string') texts.push(v.msg); Object.values(v).forEach(walk); } };
      try { walk(full.chat); } catch (e) { /* ignore */ }
      for (const txt of texts) {
        const who = parseLootSplit(txt);
        for (const p of pending.values()) if (p.hid && who[p.hid]) p.who = who[p.hid];
      }
    }
  }
  // gracze na mapie wg nicku (żeby pobrać strój gracza, który zgarnął łup)
  const OTHERS = new Map();
  function hookOthers() {
    const o = window.Engine && Engine.others;
    if (!o || o.__lnfx || typeof o.updateData !== 'function' || typeof o.getById !== 'function') return;
    const orig = o.updateData;
    o.updateData = function (data) {
      const r = orig.apply(this, arguments);
      try {
        for (const id of Object.keys(data || {})) {
          const ch = o.getById(id);
          const nick = (data[id] && data[id].nick) || (ch && ch.d && ch.d.nick);
          if (nick && ch && !(data[id] && data[id].del)) OTHERS.set(nick, ch);
        }
      } catch (e) { /* ignore */ }
      return r;
    };
    o.__lnfx = true;
  }
  function findOther(nick) {
    if (!nick) return null;
    let ch = OTHERS.get(nick) || null;
    if (!ch) {
      try { for (const x of Engine.others.getDrawableList() || []) if (x && x.d && x.d.nick === nick) ch = x; } catch (e) { /* ignore */ }
    }
    if (!ch || !ch.sprite) return null;
    return { sprite: ch.sprite, fw: ch.fw, fh: ch.fh };
  }
  function hookOutcome() {
    const d = window.Engine && Engine.communication && Engine.communication.dispatcher;
    if (!d || d.__lnfxOut || typeof d.on_item !== 'function' || typeof d.on_loot !== 'function') return;
    const oItem = d.on_item, oLoot = d.on_loot;
    d.on_item = function (items) {
      const r = oItem.apply(this, arguments);
      try { onItems(items); } catch (e) { console.error('[LNFX]', e); }
      return r;
    };
    d.on_loot = function (loot, full) {
      try { onLoot(loot, full); } catch (e) { console.error('[LNFX]', e); }
      return oLoot.apply(this, arguments);
    };
    d.__lnfxOut = true;
  }
  function pollOutcome() {
    if (!pending.size) return;
    const win = lootBox(), now = Date.now();
    for (const [id, p] of pending) {
      if (now - p.t > 180000) { pending.delete(id); continue; }
      const c = document.querySelector(`.loot-wnd .item-id-${id} canvas.icon`);
      if (c) {
        const snap = copyCanvas(c);
        if (snap) p.snap = snap;
        const r = c.getBoundingClientRect();
        if (r.width > 0) p.from = { x: r.left + r.width / 2, y: r.top + r.height / 2, base: r.width };
        p.goneAt = 0;
      } else if (!win) {
        if (!p.goneAt) p.goneAt = now;
        else if (now - p.goneAt > 1500) { pending.delete(id); resolveOutcome('lose', id, p); }
      }
    }
  }
  function bagTarget(id) {
    const el = id ? document.querySelector(`.inventory-item.item-id-${id}`) : null;
    const r = el && el.getBoundingClientRect();
    if (r && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, base: r.width, el: el.querySelector('canvas.icon') };
    for (const sel of ['.inventory-grid', '.bags-navigation-bg']) {
      const n = document.querySelector(sel), q = n && n.getBoundingClientRect();
      if (q && q.width > 0) return { x: q.left + q.width / 2, y: q.top + q.height / 2, base: 32, el: null };
    }
    return { x: innerWidth - 90, y: innerHeight - 90, base: 32, el: null };
  }
  function buildOut(kind, id, p) {
    const mc = mapCenter();
    const from = (p && p.from) || { x: mc.x, y: mc.y, base: 32 };
    const to = kind === 'win' ? bagTarget(id) : { x: from.x, y: from.y, base: from.base || 32, el: null };
    const img = (p && p.snap) || (to.el && copyCanvas(to.el)) || FALLBACK_ICON;
    const why = (p && p.reason) || (p && (p.who || p.state) ? 'other' : 'declined');
    return { img, el: kind === 'win' ? to.el : null, from, to, base: to.base || 32, reason: kind === 'lose' ? (why === 'other' && p && p.who ? `Łup zgarnął: ${p.who}` : REASONS[why]) : '', reasonKey: kind === 'lose' ? why : '', who: (p && p.who) || '', whoChar: kind === 'lose' && p ? findOther(p.who) : null, name: p ? p.name : '' };
  }
  // kilka legend w jednym łupie: zbieramy wyniki przez chwilę i odpalamy jedną kompozycję
  // (osobna animacja dla każdego przedmiotu, lekko przesunięte w czasie)
  const outQueue = { win: [], lose: [] };
  let outTimer = 0;
  function resolveOutcome(kind, id, p) {
    const cfg = getCfg();
    if (!cfg.enabled || !cfg.layers[kind]) return;
    outQueue[kind].push(buildOut(kind, id, p));
    if (outTimer) return;
    outTimer = setTimeout(() => {
      outTimer = 0;
      const outcome = { win: outQueue.win.splice(0), lose: outQueue.lose.splice(0) };
      lastOutcomeAt = Date.now();
      playComposition(getCfg(), null, { outcome });
    }, 450);
  }
  // podgląd bez prawdziwego łupu
  function demoOutcome(kind) {
    const src = findLegendIcon();
    const lb = lootBox(), mc = mapCenter();
    const from = lb ? { x: lb.cx, y: lb.cy, base: 32 } : { x: mc.x, y: mc.y, base: 32 };
    const to = kind === 'win' ? bagTarget(null) : { x: from.x, y: from.y, base: 32 };
    const rk = pick(Object.keys(REASONS));
    return { img: (src && copyCanvas(src)) || FALLBACK_ICON, el: null, from, to, base: 32, reason: kind === 'lose' ? REASONS[rk] : '', reasonKey: kind === 'lose' ? rk : '', who: '', name: '' };
  }
  function previewLayer(cfg, key) {
    const Ly = LAYERS.find(l => l.key === key);
    if (Ly && Ly.outcome) playComposition(cfg, key, { out: demoOutcome(key) });
    else playComposition(cfg, key);
  }

  /* ------------------------ podpięcie pod dodatek (confetti) ------------------------ */
  // Dodatek przy każdym powiadomieniu o legendzie (i przy "Test") woła confetti.reset(),
  // niezależnie od wybranej animacji – to nasz punkt zaczepienia.
  function hookConfetti() {
    const c = window.confetti;
    if (typeof c !== 'function' || c.__lnfx) return;
    const orig = c.reset;
    c.reset = function () {
      legendNotifyAt = Date.now();
      const r = orig ? orig.apply(this, arguments) : undefined;
      stopFx();
      const cfg = getCfg();
      if (cfg.enabled && hasLayers(cfg)) setTimeout(() => playComposition(cfg), 0);
      if (soundStore.get() === 'random') playRandomSound();
      return r;
    };
    c.__lnfx = true;
  }

  /* ---------------------------- wstrzyknięcie opcji do UI ---------------------------- */
  // Uwaga: po otwarciu listy gra przenosi ją do warstwy .mAlert-layer (poza okno dodatku),
  // dlatego trzymamy referencję do listy, a nie szukamy opcji wewnątrz kontrolki.
  const CONTROLS = [
    {
      label: 'Efekty animacji',
      store: {
        get: () => (getCfg().enabled ? 'custom' : null),
        set: v => { const c = getCfg(); c.enabled = !!v; saveCfg(c); },
      },
      position: 'end',
      items: () => [{ id: 'custom', name: 'Własne efekty', group: 'rozszerzenie' }],
      onPick: () => openPanel(),
      onNative: () => { stopFx(); refreshPanel(); },
      extra: ctl => addConfigButton(ctl),
    },
    {
      label: 'Dźwięk',
      store: soundStore,
      position: 'afterFirst',
      items: () => [{ id: 'random', name: 'Losowe', tip: () => {
        const n = customSounds().length;
        return n ? `Losuje spośród Twoich dźwięków (${n})` : 'Najpierw dodaj własne dźwięki przyciskiem +';
      } }],
      onPick: () => playRandomSound(),
    },
  ];

  let internalClick = false;

  // obsługa obu miejsc: stare okno dodatku (.ln-control/.ln-label) i nowe w Ustawieniach (.option-container/.option-description)
  function findControl(text) {
    const lab = [...document.querySelectorAll('.ln-label, .option-description')].find(e => e.textContent.trim() === text);
    return lab ? lab.closest('.ln-control, .option-container') : null;
  }

  function clickNativeNone(list) {
    const natives = [...list.querySelectorAll('.option:not(.lnfx-opt)')];
    const none = natives.find(o => o.textContent.trim() === 'Brak') || natives[0];
    internalClick = true;
    try { none && none.click(); } finally { internalClick = false; }
  }

  // ustawia natywną animację dodatku na "Brak" (żeby nie grała razem z naszymi)
  function nativeAnimationToNone() {
    const ctl = findControl('Efekty animacji');
    const list = ctl && ctl.__lnfxList;
    if (!list) return;
    const label = ctl.querySelector('.menu-option');
    if (label && label.textContent.trim() !== 'Brak' && !label.textContent.startsWith(PREFIX)) clickNativeNone(list);
  }

  function choose(cfg, ctl, list, id) {
    clickNativeNone(list);
    cfg.store.set(id);
    setTimeout(() => {
      const menu = ctl.querySelector('.menu-list');
      if (menu && !ctl.contains(list)) {
        try { window.$ && window.$(menu).trigger('close'); } catch (e) { /* ignore */ }
      }
      syncControl(cfg);
      cfg.onPick && cfg.onPick(id);
    }, 30);
  }

  function syncControl(cfg) {
    const ctl = findControl(cfg.label);
    if (!ctl) return;
    const list = ctl.querySelector('.bck-wrapper');
    const label = ctl.querySelector('.menu-option');
    const ch = cfg.store.get();
    const items = cfg.items();
    if (list) ctl.__lnfxList = list;

    if (list && !list.querySelector('.lnfx-opt')) {
      const nodes = [];
      let group = null;
      items.forEach(it => {
        if (it.group && it.group !== group) {
          group = it.group;
          const sep = document.createElement('div');
          sep.className = 'lnfx-sep';
          sep.textContent = group;
          nodes.push(sep);
        }
        const o = document.createElement('div');
        o.className = 'option lnfx-opt';
        o.dataset.fx = it.id;
        const tx = document.createElement('div');
        tx.className = 'text';
        tx.textContent = PREFIX + it.name;
        o.appendChild(tx);
        if (it.tip) o.addEventListener('mouseenter', () => { o.title = it.tip(); });
        o.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); choose(cfg, ctl, list, it.id); });
        nodes.push(o);
      });
      const first = list.querySelector('.option');
      if (cfg.position === 'afterFirst' && first) first.after(...nodes);
      else list.append(...nodes);

      list.querySelectorAll('.option:not(.lnfx-opt)').forEach(o =>
        o.addEventListener('click', () => { if (!internalClick) { cfg.store.set(null); cfg.onNative && cfg.onNative(); } }, true));
      const rst = ctl.querySelector('.reset');
      if (rst) rst.addEventListener('click', () => { if (!internalClick) { cfg.store.set(null); cfg.onNative && cfg.onNative(); } }, true);
      try { window.$ && window.$(ctl).find('.scroll-wrapper').trigger('update'); } catch (e) { /* ignore */ }
    }

    if (list) {
      list.querySelectorAll('.lnfx-opt').forEach(o => o.classList.toggle('selected', o.dataset.fx === ch));
      if (ch) list.querySelectorAll('.option.selected:not(.lnfx-opt)').forEach(o => o.classList.remove('selected'));
    }
    if (ch && label) {
      const it = items.find(x => x.id === ch);
      if (it && label.textContent !== PREFIX + it.name) label.textContent = PREFIX + it.name;
    }
    cfg.extra && cfg.extra(ctl);
  }

  function addConfigButton(ctl) {
    const host = ctl.parentElement;
    if (!host || host.querySelector('.lnfx-cfg-btn')) return;
    const b = document.createElement('div');
    b.className = 'lnfx-cfg-btn';
    b.textContent = PREFIX + 'Konfigurator efektów';
    b.addEventListener('click', ev => { ev.stopPropagation(); openPanel(); });
    ctl.after(b);
  }

  /* ------------------------------- KONFIGURATOR ------------------------------- */
  let panel = null, panelPreset = null;
  const QUALITY_OPTS = [['auto', 'Automatyczna (zalecana)'], ['high', 'Wysoka'], ['medium', 'Średnia'], ['low', 'Niska (najszybsza)']];
  const SLIDERS = [
    { key: 'durationSec', label: 'Czas trwania', min: 1, max: 31, step: 0.5, unit: ' s',
      toSlider: v => (v > 0 ? v : 31), fromSlider: v => (v >= 31 ? 0 : v), fmt: v => (v >= 31 || v === 0 ? 'do zamknięcia okna' : v + ' s') },
    { key: 'outcomeSec', label: 'Czas efektu po łupie', min: 1, max: 10, step: 0.5, unit: ' s' },
    { key: 'strength', label: 'Siła (widoczność)', min: 20, max: 100, step: 5, unit: '%' },
    { key: 'density', label: 'Gęstość cząsteczek', min: 30, max: 200, step: 10, unit: '%' },
    { key: 'itemSize', label: 'Rozmiar przedmiotu', min: 50, max: 250, step: 10, unit: '%' },
  ];

  const sVal = (S, cfg) => (S.toSlider ? S.toSlider(cfg[S.key]) : cfg[S.key]);
  const sSet = (S, c, v) => { c[S.key] = S.fromSlider ? S.fromSlider(v) : v; };
  const sFmt = (S, v) => (S.fmt ? S.fmt(v) : v + S.unit);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function enableCustom(cfg) {
    // wybranie czegokolwiek w konfiguratorze włącza "Własne efekty" i wyłącza animację dodatku
    if (!cfg.enabled && hasLayers(cfg)) { cfg.enabled = true; nativeAnimationToNone(); }
  }

  function buildPanel() {
    const cfg = getCfg();
    panelPreset = presetInfo().key;
    const p = el('div', 'lnfx-panel');
    const head = el('div', 'lnfx-head');
    head.append(el('span', 'lnfx-title', PREFIX + 'Konfigurator efektów łupów'));
    const x = el('span', 'lnfx-x', '×');
    x.title = 'Zamknij';
    x.addEventListener('click', closePanel);
    head.append(x);
    p.append(head);

    const body = el('div', 'lnfx-body');
    const info = el('div', 'lnfx-info');
    info.append(el('span', null, 'Preset: '), el('b', null, presetName()));
    const onL = el('label', 'lnfx-switch');
    const on = document.createElement('input'); on.type = 'checkbox'; on.checked = cfg.enabled;
    on.addEventListener('change', () => {
      const c = getCfg(); c.enabled = on.checked; saveCfg(c);
      if (on.checked) nativeAnimationToNone();
    });
    onL.append(on, el('span', null, ' włączone'));
    info.append(onL);
    body.append(info);

    body.append(el('div', 'lnfx-h', 'Warstwy efektu (łączą się ze sobą)'));
    for (const key of UI_ORDER) {
      const Ly = LAYERS.find(l => l.key === key);
      const row = el('div', 'lnfx-row');
      row.append(el('div', 'lnfx-lab', Ly.label));
      const sel = document.createElement('select');
      sel.className = 'lnfx-sel';
      const opts = layerOptions(Ly);
      for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
      sel.value = cfg.layers[key] || '';
      sel.addEventListener('change', () => {
        const c = getCfg(); c.layers[key] = sel.value; enableCustom(c); saveCfg(c); refreshPanel();
        if (sel.value) previewLayer(c, key);
      });
      const pv = el('span', 'lnfx-mini', '▶');
      pv.title = 'Podgląd tej warstwy';
      pv.addEventListener('click', () => { const c = getCfg(); if (c.layers[key]) previewLayer(c, key); });
      row.append(sel, pv);
      const hueWrap = el('div', 'lnfx-hue');
      const hue = document.createElement('input');
      hue.type = 'range'; hue.min = 0; hue.max = 350; hue.step = 10; hue.value = cfg.hue[key] || 0;
      hue.title = 'Zmiana koloru (przesunięcie barwy)';
      const hv = el('span', 'lnfx-val', (cfg.hue[key] || 0) + '°');
      hue.addEventListener('input', () => { hv.textContent = hue.value + '°'; const c = getCfg(); c.hue[key] = +hue.value; saveCfg(c); });
      hue.addEventListener('change', () => { const c = getCfg(); if (c.layers[key]) previewLayer(c, key); });
      hueWrap.append(el('span', 'lnfx-sub', 'kolor'), hue, hv);
      row.append(hueWrap);
      body.append(row);
    }

    body.append(el('div', 'lnfx-h', 'Ustawienia'));
    for (const S of SLIDERS) {
      const row = el('div', 'lnfx-srow');
      row.append(el('div', 'lnfx-lab', S.label));
      const r = document.createElement('input');
      r.type = 'range'; r.min = S.min; r.max = S.max; r.step = S.step; r.value = sVal(S, cfg);
      const v = el('span', 'lnfx-val', sFmt(S, +r.value));
      r.addEventListener('input', () => { v.textContent = sFmt(S, +r.value); const c = getCfg(); sSet(S, c, +r.value); saveCfg(c); });
      row.append(r, v);
      body.append(row);
    }

    const btns = el('div', 'lnfx-btns');
    const mk = (t, fn, title) => { const b = el('div', 'lnfx-btn', t); if (title) b.title = title; b.addEventListener('click', fn); btns.append(b); return b; };
    mk('▶ Podgląd', () => playComposition(getCfg()), 'Odtwórz wszystkie warstwy');
    mk('Test w grze', () => {
      const c = getCfg();
      if (!c.enabled && hasLayers(c)) { c.enabled = true; saveCfg(c); nativeAnimationToNone(); refreshPanel(); }
      const t = [...document.querySelectorAll('.button')].find(e => e.textContent.trim() === 'Test');
      if (t) t.click(); else playComposition(getCfg());
    }, 'Kliknij "Test" dodatku – prawdziwe okno łupów z legendą');
    mk('Losuj', () => {
      const c = getCfg();
      for (const Ly of LAYERS) c.layers[Ly.key] = Math.random() < (Ly.key === 'screen' || Ly.key === 'around' ? 0.5 : 0.8) ? pick(EFFECTS.filter(e => e.group === Ly.group)).id : '';
      if (!hasLayers(c)) c.layers.loot = pick(EFFECTS.filter(e => e.group === G_FRAME)).id;
      enableCustom(c); saveCfg(c); refreshPanel(true); playComposition(c);
    }, 'Wylosuj zestaw warstw');
    mk('Wyczyść', () => {
      const c = getCfg(), d = DEFAULT_CFG();
      c.layers = d.layers; c.hue = d.hue; c.durationSec = d.durationSec; c.outcomeSec = d.outcomeSec; c.strength = d.strength; c.density = d.density; c.itemSize = d.itemSize;
      saveCfg(c); stopFx(); refreshPanel(true);
    }, 'Wyczyść wszystkie warstwy i ustawienia');
    body.append(btns);
    body.append(el('div', 'lnfx-note', 'Ustawienia zapisują się osobno dla każdego presetu dodatku. „Losowy” wybiera efekt przy każdej legendzie.'));
    p.append(body);

    // przeciąganie za nagłówek
    head.addEventListener('mousedown', ev => {
      if (ev.target === x) return;
      const r = p.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const mv = e => { p.style.left = Math.max(0, e.clientX - dx) + 'px'; p.style.top = Math.max(0, e.clientY - dy) + 'px'; };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        try { localStorage.setItem('lnfx_panel_pos', JSON.stringify({ l: p.style.left, t: p.style.top })); } catch (e) { /* ignore */ }
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      ev.preventDefault();
    });
    // nie przepuszczaj klików/klawiszy do gry (chodzenie, skróty)
    ['mousedown', 'click', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu'].forEach(t => p.addEventListener(t, e => e.stopPropagation()));
    return p;
  }

  /* ------------- konfigurator w stylu gry (klony elementów okna "Konfiguracja łupów") ------------- */
  function templateWindow() {
    const t = [...document.querySelectorAll('.header-label .text')].find(e => e.textContent.trim() === 'Konfiguracja łupów');
    if (t) return t.closest('.c-window');
    const o = document.querySelector('.opt_LEGENDARY_NOTIFICATOR_CHECKBOX'); // nowe miejsce: okno Ustawień gry
    return o ? o.closest('.c-window') : null;
  }
  const stripTips = e => { if (e.removeAttribute) e.removeAttribute('tip-id'); e.querySelectorAll && e.querySelectorAll('[tip-id]').forEach(x => x.removeAttribute('tip-id')); return e; };

  function uiKit(tw) {
    const cl = (sel, deep = true) => { const e = tw.querySelector(sel); return e ? stripTips(e.cloneNode(deep)) : null; };
    // kolory wypełnienia suwaka odczytane z oryginału
    let fillA = 'rgb(57, 107, 41)', fillB = 'rgb(12, 13, 13)';
    const si = tw.querySelector('.c-slider__input');
    const m = si && /(rgb\([^)]+\))[^,]*,\s*(rgb\([^)]+\))/.exec(si.getAttribute('style') || '');
    if (m) { fillA = m[1]; fillB = m[2]; }
    let uid = 0;
    return {
      heading(text) {
        const h = cl('.tw-heading') || el('div', 'tw-heading lnfx-heading');
        h.textContent = text;
        h.className = h.className.split(' ').filter(c => !/^m[tb]-\d$/.test(c)).concat(['mt-3', 'mb-2']).join(' ');
        return h;
      },
      line() { return cl('.c-line') || el('div', 'c-line lnfx-line'); },
      // etykieta (i wartość) w osobnej linii nad kontrolką – długie nazwy nie nachodzą na siebie
      stack(label, value, child) {
        const c = el('div', 'lnfx-stack');
        const h = el('div', 'lnfx-stack-head');
        h.append(el('div', 'ln-label lnfx-stack-label', label));
        if (value != null) h.append(el('span', 'lnfx-stack-val', value));
        c.append(h, child);
        return c;
      },
      control(label, ...children) {
        const c = el('div', 'ln-control lnfx-ctl');
        const l = el('div', 'ln-label lnfx-ctl-label', label);
        const box = el('div', 'lnfx-ctl-box');
        box.append(...children);
        c.append(l, box);
        return c;
      },
      select(options, value, onChange) {
        const menu = cl('.ln-control .menu-list') || cl('.option-control .menu-list');
        const wrap = el('div', 'lnfx-selwrap');
        let span;
        if (menu) {
          menu.querySelectorAll('.dropdown-menu').forEach(d => d.remove());
          span = menu.querySelector('.menu-option');
          wrap.append(menu);
        } else { span = el('span', 'lnfx-seltext'); wrap.append(span); }
        const sel = document.createElement('select');
        sel.className = 'lnfx-native-select';
        for (const [v, t] of options) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.append(o); }
        sel.value = value;
        const upd = () => { span.textContent = (options.find(o => o[0] === sel.value) || options[0])[1]; };
        upd();
        sel.addEventListener('change', () => { upd(); onChange(sel.value); });
        wrap.append(sel);
        return wrap;
      },
      slider(min, max, step, value, onInput, rainbow) {
        const s = cl('.c-slider') || el('div', 'c-slider');
        let inp = s.querySelector('input');
        if (!inp) { inp = document.createElement('input'); inp.className = 'c-slider__input'; s.prepend(inp); }
        inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
        const paint = () => {
          if (rainbow) { inp.style.background = 'linear-gradient(to right,#f44,#fb3,#4e4,#3ee,#46f,#e4e,#f44)'; return; }
          const p = ((inp.value - min) / (max - min)) * 100;
          inp.style.background = `linear-gradient(to right, ${fillA} ${p}%, ${fillB} ${p}%)`;
        };
        paint();
        inp.addEventListener('input', () => { paint(); onInput(+inp.value, false); });
        inp.addEventListener('change', () => onInput(+inp.value, true));
        return s;
      },
      checkbox(label, checked, onChange) {
        const c = cl('.c-checkbox') || el('div', 'c-checkbox');
        let inp = c.querySelector('input'), lab = c.querySelector('label');
        if (!inp) { inp = document.createElement('input'); inp.type = 'checkbox'; c.append(inp); }
        if (!lab) { lab = document.createElement('label'); c.append(lab); }
        const id = 'lnfx-cb-' + (++uid) + '-' + Date.now();
        inp.id = id; inp.name = id; lab.htmlFor = id; lab.textContent = label;
        inp.checked = checked;
        inp.addEventListener('change', () => onChange(inp.checked));
        return c;
      },
      button(text, onClick, title) {
        const b = cl('.ln-buttons-container .button') || cl('.option-control .button.small.green:not(.bck)') || el('div', 'button small green');
        const l = b.querySelector('.label');
        if (l) l.textContent = text; else b.textContent = text;
        if (title) b.title = title;
        b.addEventListener('click', onClick);
        return b;
      },
    };
  }

  function buildGamePanel(tw) {
    const cfg = getCfg();
    panelPreset = presetInfo().key;
    const K = uiKit(tw);
    const w = stripTips(tw.cloneNode(false));
    w.classList.remove('window-on-peak');
    w.classList.add('lnfx-gwin');
    w.style.width = Math.min(tw.offsetWidth, 270) + 'px';
    const head = stripTips(tw.querySelector('.header-label-positioner').cloneNode(true));
    const ht = head.querySelector('.header-label .text');
    if (ht) ht.textContent = 'Własne efekty';
    const content = tw.querySelector('.content').cloneNode(false);
    const inner = tw.querySelector('.inner-content').cloneNode(false);
    // przewijanie jak w innych oknach gry: scroll-wrapper + scroll-pane (pasek dodaje initScroll)
    const lnc = el('div', 'ln-content lnfx-gbody');
    const sw = el('div', 'scroll-wrapper lnfx-sw');
    const body = el('div', 'scroll-pane');
    sw.append(body); lnc.append(sw);
    inner.append(lnc); content.append(inner);
    w.append(head, content);
    for (const sel of ['.c-window__bottom-bar', '.close-button-corner-decor', '.border-image']) {
      const x = tw.querySelector(sel);
      if (x) w.append(stripTips(x.cloneNode(true)));
    }
    const cb = w.querySelector('.close-button');
    if (cb) cb.addEventListener('click', ev => { ev.stopPropagation(); closePanel(); });

    // --- zawartość ---
    const top = el('div', 'lnfx-gtop');
    top.append(K.checkbox('Włącz (preset: ' + presetName() + ')', cfg.enabled, v => {
      const c = getCfg(); c.enabled = v; saveCfg(c);
      if (v) nativeAnimationToNone();
    }));
    body.append(top, K.line());

    body.append(K.heading('Warstwy'));
    for (const key of UI_ORDER) {
      const Ly = LAYERS.find(l => l.key === key);
      if (key === 'win') body.append(K.heading('Po zakończeniu łupu'));
      const opts = layerOptions(Ly);
      body.append(K.stack(Ly.label, null, K.select(opts, cfg.layers[key] || '', v => {
        const c = getCfg(); c.layers[key] = v; enableCustom(c); saveCfg(c); refreshPanel();
        if (v) previewLayer(c, key);
      })));
      body.append(K.control('kolor', K.slider(0, 350, 10, cfg.hue[key] || 0, (v, done) => {
        const c = getCfg(); c.hue[key] = v; saveCfg(c);
        if (done && c.layers[key]) previewLayer(c, key);
      }, true)));
    }

    body.append(K.heading('Ustawienia'));
    for (const S of SLIDERS) {
      let valEl = null;
      const ctl = K.stack(S.label, sFmt(S, sVal(S, cfg)), K.slider(S.min, S.max, S.step, sVal(S, cfg), (v, done) => {
        valEl.textContent = sFmt(S, v);
        if (!done) { const c = getCfg(); sSet(S, c, v); saveCfg(c); }
      }));
      valEl = ctl.querySelector('.lnfx-stack-val');
      body.append(ctl);
    }

    body.append(K.stack('Jakość animacji', null, K.select(QUALITY_OPTS, cfg.quality || 'auto', v => { const c = getCfg(); c.quality = v; saveCfg(c); })));
    lnc.append(K.line());
    const btns = el('div', 'ln-buttons-container lnfx-gbtns');
    btns.append(
      K.button('Podgląd', () => playComposition(getCfg()), 'Odtwórz wszystkie warstwy'),
      K.button('Test', () => {
        const c = getCfg();
        if (!c.enabled && hasLayers(c)) { c.enabled = true; saveCfg(c); nativeAnimationToNone(); refreshPanel(); }
        const t = [...tw.querySelectorAll('.button')].find(e => e.textContent.trim() === 'Test');
        if (t) t.click(); else playComposition(getCfg());
      }, 'Test dodatku – prawdziwe okno łupów z legendą'),
      K.button('Zdobyty', () => { const c = getCfg(); if (c.layers.win) previewLayer(c, 'win'); }, 'Podgląd efektu: łup trafił do torby'),
      K.button('Utracony', () => { const c = getCfg(); if (c.layers.lose) previewLayer(c, 'lose'); }, 'Podgląd efektu: łup utracony'),
      K.button('Losuj', () => {
        const c = getCfg();
        for (const Ly of LAYERS) c.layers[Ly.key] = Math.random() < (Ly.key === 'screen' || Ly.key === 'around' ? 0.5 : 0.8) ? pick(EFFECTS.filter(e => e.group === Ly.group)).id : '';
        if (!hasLayers(c)) c.layers.loot = pick(EFFECTS.filter(e => e.group === G_FRAME)).id;
        enableCustom(c); saveCfg(c); refreshPanel(true); playComposition(c);
      }, 'Wylosuj zestaw warstw'),
      K.button('Wyczyść', () => {
        const c = getCfg(), d = DEFAULT_CFG();
        c.layers = d.layers; c.hue = d.hue; c.durationSec = d.durationSec; c.outcomeSec = d.outcomeSec; c.strength = d.strength; c.density = d.density; c.itemSize = d.itemSize;
        saveCfg(c); stopFx(); refreshPanel(true);
      }, 'Wyczyść warstwy i ustawienia'),
    );
    lnc.append(btns);

    // przeciąganie za nagłówek
    head.addEventListener('mousedown', ev => {
      const sx = ev.clientX, sy = ev.clientY, l0 = w.offsetLeft, t0 = w.offsetTop;
      const mv = e => { w.style.left = Math.max(0, l0 + e.clientX - sx) + 'px'; w.style.top = Math.max(0, t0 + e.clientY - sy) + 'px'; };
      const up = () => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        try { localStorage.setItem('lnfx_panel_pos2', JSON.stringify({ l: w.style.left, t: w.style.top })); } catch (e) { /* ignore */ }
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      ev.preventDefault(); ev.stopPropagation();
    });
    ['mousedown', 'click', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu'].forEach(t => w.addEventListener(t, e => e.stopPropagation()));
    return w;
  }

  // pasek przewijania gry (ten sam plugin i te same klasy co w oknie "Konfiguracja łupów")
  function initScroll(w, tw) {
    const sw = w.querySelector('.lnfx-sw');
    if (!sw) return;
    sw.style.height = Math.round(Math.max(200, Math.min(innerHeight * 0.55, 430))) + 'px';
    try {
      window.$(sw).addScrollBar({ track: true });
      const main = tw && (tw.querySelector('.ln-content > .scroll-wrapper') || tw.querySelector('.right-scroll.scroll-wrapper'));
      if (main) {
        const pairs = [[main, sw], [main.querySelector(':scope > .scroll-pane'), sw.querySelector(':scope > .scroll-pane')],
          [main.querySelector('.scrollbar-wrapper'), sw.querySelector('.scrollbar-wrapper')], [main.querySelector('.track'), sw.querySelector('.track')],
          [main.querySelector('.handle'), sw.querySelector('.handle')]];
        for (const [src, dst] of pairs) if (src && dst) [...src.classList].filter(c => /^[0-9a-f]{8}-/.test(c)).forEach(c => dst.classList.add(c));
      }
      window.$(sw).trigger('update');
      setTimeout(() => { try { window.$(sw).trigger('update'); } catch (e) { /* ignore */ } }, 50);
    } catch (e) { sw.style.overflowY = 'auto'; }
  }

  function openPanel() {
    if (panel) { refreshPanel(true); return; }
    const tw = templateWindow();
    if (tw) {
      panel = buildGamePanel(tw);
      tw.parentElement.append(panel);
      let pos = null;
      try { pos = JSON.parse(localStorage.getItem('lnfx_panel_pos2')); } catch (e) { /* ignore */ }
      if (pos && pos.l) { panel.style.left = pos.l; panel.style.top = pos.t; }
      else {
        const pw = panel.offsetWidth || 270;
        let l = tw.offsetLeft + tw.offsetWidth + 6;
        if (l + pw > innerWidth) l = Math.max(0, tw.offsetLeft - pw - 6);
        panel.style.left = l + 'px'; panel.style.top = tw.offsetTop + 'px';
      }
      panel.style.zIndex = (parseInt(getComputedStyle(tw).zIndex, 10) || 20) + 1;
      initScroll(panel, tw);
      return;
    }
    panel = buildPanel(); // zapasowy wygląd, gdy okna dodatku nie ma
    let pos = null;
    try { pos = JSON.parse(localStorage.getItem('lnfx_panel_pos')); } catch (e) { /* ignore */ }
    panel.style.left = (pos && pos.l) || Math.max(10, innerWidth / 2 - 190) + 'px';
    panel.style.top = (pos && pos.t) || '80px';
    document.body.append(panel);
  }
  function closePanel() { if (panel) panel.remove(); panel = null; }
  function refreshPanel(force) {
    if (!panel) return;
    if (!force && panelPreset === presetInfo().key) {
      const on = panel.querySelector('.lnfx-switch input, .lnfx-gtop input');
      if (on) on.checked = getCfg().enabled;
      return;
    }
    const l = panel.style.left, t = panel.style.top, z = panel.style.zIndex;
    const tw = templateWindow();
    const np = tw && panel.classList.contains('lnfx-gwin') ? buildGamePanel(tw) : buildPanel();
    np.style.left = l; np.style.top = t; if (z) np.style.zIndex = z;
    panel.replaceWith(np);
    panel = np;
    if (np.classList.contains('lnfx-gwin')) initScroll(np, tw);
  }

  function sync() {
    hookConfetti();
    hookOutcome();
    hookOthers();
    CONTROLS.forEach(syncControl);
    if (panel && panelPreset !== presetInfo().key) refreshPanel(true);
  }

  const css = document.createElement('style');
  css.textContent = `
    .lnfx-canvas{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000}
    .lnfx-sep{pointer-events:none;text-align:center;font-size:10px;letter-spacing:1px;text-transform:uppercase;
      color:#d9b36a;padding:4px 0 2px;margin-top:4px;border-top:1px solid rgba(217,179,106,.35)}
    .lnfx-opt .text{color:#ffd57a !important}
    .lnfx-cfg-btn{margin:4px auto 2px;width:max-content;padding:3px 10px;border:1px solid #8a6d3b;border-radius:4px;
      background:linear-gradient(#3a2c14,#241a0b);color:#ffd57a;font-size:11px;cursor:pointer;user-select:none}
    .lnfx-cfg-btn:hover{filter:brightness(1.25)}
    .lnfx-panel{position:fixed;z-index:2147482000;width:380px;max-height:90vh;display:flex;flex-direction:column;
      background:rgba(18,19,28,.97);border:1px solid #8a6d3b;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.6),0 0 0 1px #000;
      color:#ddd;font:12px/1.35 Arial,sans-serif;user-select:none}
    .lnfx-head{display:flex;align-items:center;justify-content:space-between;padding:7px 10px;cursor:move;
      background:linear-gradient(#3a2c14,#211709);border-bottom:1px solid #8a6d3b;border-radius:8px 8px 0 0}
    .lnfx-title{color:#ffd57a;font-weight:bold;letter-spacing:.3px}
    .lnfx-x{cursor:pointer;color:#e9c47a;font-size:18px;line-height:14px;padding:0 3px}
    .lnfx-x:hover{color:#fff}
    .lnfx-body{padding:8px 10px 10px;overflow:auto}
    .lnfx-info{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;color:#bbb}
    .lnfx-info b{color:#fff}
    .lnfx-switch{cursor:pointer;color:#ffd57a}
    .lnfx-h{margin:9px 0 5px;padding-bottom:3px;border-bottom:1px solid rgba(217,179,106,.35);color:#d9b36a;
      font-size:10px;letter-spacing:1px;text-transform:uppercase}
    .lnfx-row{display:grid;grid-template-columns:118px 1fr 18px;grid-template-rows:auto auto;gap:2px 6px;align-items:center;
      padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
    .lnfx-lab{color:#ccc}
    .lnfx-sel{width:100%;background:#0d0e15;color:#fff;border:1px solid #555;border-radius:3px;padding:2px;font-size:12px}
    .lnfx-mini{cursor:pointer;color:#ffd57a;text-align:center}
    .lnfx-mini:hover{color:#fff}
    .lnfx-hue{grid-column:2 / 4;display:flex;align-items:center;gap:6px}
    .lnfx-hue input{flex:1;height:10px;-webkit-appearance:none;appearance:none;border-radius:5px;
      background:linear-gradient(90deg,#f33,#fb3,#3f3,#3ff,#36f,#f3f,#f33)}
    .lnfx-hue input::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#fff;border:1px solid #333}
    .lnfx-sub{color:#888;font-size:10px;width:30px}
    .lnfx-val{color:#ffd57a;min-width:38px;text-align:right;font-size:11px}
    .lnfx-srow{display:grid;grid-template-columns:118px 1fr 42px;gap:6px;align-items:center;padding:3px 0}
    .lnfx-srow input{width:100%;accent-color:#d9a441}
    .lnfx-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .lnfx-btn{flex:1;text-align:center;padding:5px 6px;border:1px solid #8a6d3b;border-radius:4px;cursor:pointer;
      background:linear-gradient(#3a2c14,#241a0b);color:#ffd57a;white-space:nowrap}
    .lnfx-btn:hover{filter:brightness(1.25)}
    .lnfx-note{margin-top:8px;color:#888;font-size:10.5px}
    .lnfx-gwin .lnfx-sw{position:relative}
    .lnfx-gwin .lnfx-heading{text-align:center;font-weight:bold;color:#e9c47a;margin:10px 0 6px}
    .lnfx-gwin .lnfx-line{border-top:1px solid rgba(217,179,106,.35);margin:6px 0}
    .lnfx-gwin .lnfx-sw > .scroll-pane{padding-right:12px;box-sizing:border-box}
    .lnfx-gwin .lnfx-stack{margin:9px 0 6px}
    .lnfx-gwin .lnfx-stack-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:7px;line-height:16px}
    .lnfx-gwin .lnfx-stack-label{width:auto !important;height:auto !important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lnfx-gwin .lnfx-stack-val{color:#e9c47a;font-size:11px;white-space:nowrap}
    .lnfx-gwin .lnfx-stack .c-slider,.lnfx-gwin .lnfx-stack .c-slider__input{width:100%}
    .lnfx-gwin .lnfx-stack .c-slider{margin-top:4px}
    .lnfx-gwin .lnfx-ctl{margin:7px 0}
    .lnfx-gwin .lnfx-ctl{display:flex;align-items:center;gap:6px;margin:3px 0}
    .lnfx-gwin .lnfx-ctl-label{flex:0 0 auto;min-width:34px;width:auto !important;height:auto !important;white-space:nowrap;color:#aaa;font-size:11px}
    .lnfx-gwin .lnfx-ctl-box{flex:1;min-width:0}
    .lnfx-gwin .lnfx-ctl-box .c-slider,.lnfx-gwin .lnfx-ctl-box .c-slider__input{width:100%}
    .lnfx-gwin .lnfx-selwrap{position:relative;width:100%}
    .lnfx-gwin .lnfx-selwrap .menu-list,.lnfx-gwin .lnfx-selwrap .bck{width:100% !important;max-width:none !important}
    .lnfx-gwin .lnfx-selwrap .menu-option{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .lnfx-gwin .lnfx-native-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:12px}
    .lnfx-gwin .lnfx-native-select option{background:#1b1c22;color:#ddd}
    .lnfx-gwin .lnfx-gtop{margin:2px 0 4px}
    .lnfx-gwin .lnfx-gbtns{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:6px}
  `;
  document.head.appendChild(css);

  setInterval(sync, 400);
  setInterval(() => { try { pollOutcome(); } catch (e) { console.error('[LNFX]', e); } }, 250);
  sync();

  // do testów z konsoli: lnfx.play('aurora'), lnfx.config(), lnfx.list()
  window.lnfx = {
    play: playFx, stop: stopFx, randomSound: playRandomSound, config: openPanel, lootLog,
    debug: () => ({ preset: presetInfo(), enabled: getCfg().enabled, layers: getCfg().layers, pending: [...pending.entries()].map(([id, p]) => ({ id, name: p.name, state: p.state, reason: p.reason, who: p.who, goneAt: p.goneAt })), hooked: !!(window.Engine && Engine.communication && Engine.communication.dispatcher && Engine.communication.dispatcher.__lnfxOut) }),
    compose: cfg => playComposition(Object.assign(DEFAULT_CFG(), cfg)),
    list: () => EFFECTS.map(e => `${e.id} – ${e.name}`),
  };
})();