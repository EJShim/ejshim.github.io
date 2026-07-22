/* fig. 1 — hanging cloth: 2D mass–spring grid, Verlet integration.
   No libraries. Pauses off-screen; renders a single settled frame
   when the visitor prefers reduced motion. */
(() => {
  'use strict';

  const canvas = document.getElementById('cloth');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const panel = canvas.parentElement;

  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  const DT = 1 / 60;          // fixed physics step, refresh-rate independent
  const DAMP = 0.984;
  const ITER = 3;

  let W = 0, H = 0;           // canvas size in CSS px
  let cols = 0, rows = 0, s = 0, topY = 0;
  let x, y, ox, oy;           // positions and previous positions
  let T = 0;                  // sim time in seconds
  let windOn = 1;
  let running = false, visible = true, raf = 0, last = 0, acc = 0;
  let lpx = null, lpy = null; // last pointer position

  const colors = { warp: '', weft: '' };

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors.warp = cs.getPropertyValue('--cloth-warp').trim() || 'rgba(47,69,197,0.42)';
    colors.weft = cs.getPropertyValue('--cloth-weft').trim() || 'rgba(181,69,60,0.26)';
  }

  const idx = (i, j) => j * cols + i;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function init() {
    const rect = panel.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    W = rect.width; H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const clothW = W * 0.72;
    cols = clamp(Math.round(clothW / 11) + 1, 22, 42);
    s = clothW / (cols - 1);
    topY = H * 0.06;
    rows = clamp(Math.round((H * 0.88 - topY) / s) + 1, 14, 48);

    const n = cols * rows;
    x = new Float32Array(n); y = new Float32Array(n);
    ox = new Float32Array(n); oy = new Float32Array(n);
    const left = (W - clothW) / 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = idx(i, j);
        x[k] = ox[k] = left + i * s;
        y[k] = oy[k] = topY + j * s * 0.985;
      }
    }
    T = 0;

    // pre-settle so the first paint already looks like fabric
    const settle = mqReduce.matches ? 180 : 70;
    const wind = windOn;
    if (mqReduce.matches) windOn = 0;
    for (let k = 0; k < settle; k++) step(DT);
    windOn = mqReduce.matches ? 0 : wind;
    render();
  }

  function step(dt) {
    T += dt;
    const g = s * 55;                 // gravity, px/s²
    const wAmp = s * 10 * windOn;     // wind, px/s²
    const dt2 = dt * dt;

    for (let j = 1; j < rows; j++) {  // row 0 is pinned
      for (let i = 0; i < cols; i++) {
        const k = idx(i, j);
        const ax = wAmp * (Math.sin(1.1 * T + j * 0.35 + i * 0.08) * 0.6 +
                           Math.sin(0.7 * T + (i + j) * 0.12) * 0.4);
        const nx = x[k] + (x[k] - ox[k]) * DAMP + ax * dt2;
        const ny = y[k] + (y[k] - oy[k]) * DAMP + g * dt2;
        ox[k] = x[k]; oy[k] = y[k];
        x[k] = nx; y[k] = ny;
      }
    }

    const restH = s, restV = s * 0.985;
    const restD = Math.hypot(restH, restV);
    for (let it = 0; it < ITER; it++) {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = idx(i, j);
          const pinned = j === 0;
          if (i < cols - 1) relax(k, k + 1, restH, pinned, 1);
          if (j < rows - 1) relax(k, k + cols, restV, pinned, 1);
          // shear springs keep the weave from collapsing into creases
          if (i < cols - 1 && j < rows - 1) {
            relax(k, k + cols + 1, restD, pinned, 0.4);
            relax(k + 1, k + cols, restD, pinned, 0.4);
          }
        }
      }
    }
  }

  function relax(a, b, rest, aPinned, strength) {
    let dx = x[b] - x[a], dy = y[b] - y[a];
    const d = Math.hypot(dx, dy) || 1e-6;
    const diff = ((d - rest) / d) * strength;
    const bPinned = b < cols; // row 0
    if (aPinned && bPinned) return;
    if (aPinned) { x[b] -= dx * diff; y[b] -= dy * diff; }
    else if (bPinned) { x[a] += dx * diff; y[a] += dy * diff; }
    else {
      dx *= 0.5 * diff; dy *= 0.5 * diff;
      x[a] += dx; y[a] += dy;
      x[b] -= dx; y[b] -= dy;
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;

    ctx.strokeStyle = colors.weft;     // weft: horizontal threads
    ctx.beginPath();
    for (let j = 0; j < rows; j++) {
      ctx.moveTo(x[idx(0, j)], y[idx(0, j)]);
      for (let i = 1; i < cols; i++) ctx.lineTo(x[idx(i, j)], y[idx(i, j)]);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.warp;     // warp: hanging threads
    ctx.beginPath();
    for (let i = 0; i < cols; i++) {
      ctx.moveTo(x[idx(i, 0)], y[idx(i, 0)]);
      for (let j = 1; j < rows; j++) ctx.lineTo(x[idx(i, j)], y[idx(i, j)]);
    }
    ctx.stroke();

    // hem: a slightly heavier bottom edge
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x[idx(0, rows - 1)], y[idx(0, rows - 1)]);
    for (let i = 1; i < cols; i++) ctx.lineTo(x[idx(i, rows - 1)], y[idx(i, rows - 1)]);
    ctx.stroke();

    // fixed-boundary ticks above the pinned row, drafting style
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < cols; i += 3) {
      const k = idx(i, 0);
      ctx.moveTo(x[k], y[k] - 7);
      ctx.lineTo(x[k], y[k] - 2);
    }
    ctx.stroke();
  }

  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    acc += Math.min((ts - last) / 1000, 1 / 20);
    last = ts;
    let n = 0;
    while (acc >= DT && n < 4) { step(DT); acc -= DT; n++; }
    if (n) render();
  }

  function updateRun() {
    const should = visible && !document.hidden && !mqReduce.matches;
    if (should && !running) {
      running = true;
      last = performance.now(); acc = 0;
      raf = requestAnimationFrame(loop);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }

  function pointerMove(e) {
    if (mqReduce.matches) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (lpx !== null) {
      const dx = clamp(px - lpx, -36, 36), dy = clamp(py - lpy, -36, 36);
      const R = Math.max(70, s * 7);
      const k2 = e.buttons ? 0.5 : 0.22;
      for (let j = 1; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = idx(i, j);
          const ddx = x[k] - px, ddy = y[k] - py;
          const d = Math.hypot(ddx, ddy);
          if (d < R) {
            const w = (1 - d / R) * k2;
            x[k] += dx * w; y[k] += dy * w;
          }
        }
      }
    }
    lpx = px; lpy = py;
  }

  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerdown', e => {
    lpx = null;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerleave', () => { lpx = null; });
  canvas.addEventListener('pointerup', () => { lpx = null; });

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    updateRun();
  }, { threshold: 0.02 }).observe(panel);

  document.addEventListener('visibilitychange', updateRun);

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 120);
  }).observe(panel);

  mqDark.addEventListener('change', () => { readColors(); if (!running) render(); });
  mqReduce.addEventListener('change', () => { windOn = mqReduce.matches ? 0 : 1; init(); updateRun(); });

  readColors();
  init();
  updateRun();
})();
