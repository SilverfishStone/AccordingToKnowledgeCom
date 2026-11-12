// Timeline: transport controls, one row per layer with keyframe diamonds, scrubbing and playback.
import { app, on, emit, $, el, clamp, requestRender } from './state.js';
import { metaCmd } from './history.js';
import { toast } from './ui.js';

const GUT = 150, CW = 14, RH = 22, HDR = 24;
const KEY_ALL = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
let cv, ctx, scrollX = 0, scrollY = 0, drag = null, raf = 0;
let playT0 = 0, playF0 = 0;

export function setFrame(f) {
  f = clamp(Math.round(f), 0, app.doc.frames - 1);
  if (f === app.frame) return;
  app.frame = f;
  emit('frame'); requestRender();
}
export const stepFrame = d => { ensureAnimate(); stop(); setFrame(app.frame + d); };
export const goTo = f => { ensureAnimate(); stop(); setFrame(f); };

/* ---------- Paint / Animate mode ----------
   Paint:   the canvas shows the starting look (frame 1); every change edits that look.
   Animate: the canvas shows the current frame; every change adds a waypoint there. */
export function setMode(m) {
  if (m === app.mode) return;
  if (m === 'paint') {
    app.animFrame = app.frame;
    app.playing = false; emit('play');
    app.mode = 'paint';
    setFrame(0);
  } else {
    stop();
    app.mode = 'animate';
    setFrame(app.animFrame);
  }
  document.body.classList.toggle('mode-animate', app.mode === 'animate');
  emit('mode'); emit('props'); requestRender();
}
export const toggleMode = () => setMode(app.mode === 'paint' ? 'animate' : 'paint');
/* Timeline actions only make sense while animating: switch over (once) and say so. */
export function ensureAnimate() {
  if (app.mode === 'animate') return;
  setMode('animate');
  toast('Animate mode: changes now add waypoints · press M for Paint mode');
}
/* Change one property of a layer the way the current mode says. */
export function editProp(L, prop, v) {
  if (app.mode === 'paint') {
    if (app.playing || app.frame !== 0) { stop(); setFrame(0); }
    L.setStart(prop, v);
  } else L.animSet(prop, app.frame, v);
}

function tick(now) {
  if (!app.playing) return;
  const d = app.doc;
  let f = playF0 + Math.floor((now - playT0) / 1000 * d.fps);
  if (f >= d.frames) {
    if (app.loop) f %= d.frames;
    else { setFrame(d.frames - 1); return stop(); }
  }
  setFrame(f);
  requestAnimationFrame(tick);
}
export function play() {
  if (app.playing) return;
  if (app.frame >= app.doc.frames - 1) setFrame(0);
  app.playing = true; playT0 = performance.now(); playF0 = app.frame;
  emit('play'); requestAnimationFrame(tick);
}
export function stop() {
  if (!app.playing) return;
  app.playing = false; emit('play');
  if (app.mode === 'paint') setFrame(0);     // playback in Paint mode is only a preview
}
export const togglePlay = () => (app.playing ? stop() : play());

/* Keyframe every transform property (plus anything already animated) on the active layer. */
export function addKeyAll() {
  const L = app.doc.active;
  if (!L) return;
  ensureAnimate();
  const f = app.frame;
  metaCmd('Add keyframe', () => { for (const p of new Set([...KEY_ALL, ...Object.keys(L.tracks)])) L.animSet(p, f, L.value(p, f)); });
}
export function removeKeyAll() {
  const L = app.doc.active;
  if (!L) return;
  ensureAnimate();
  const f = app.frame;
  if (!L.hasKeyAt(f)) return;
  metaCmd('Remove keyframe', () => { for (const p of Object.keys(L.tracks)) L.removeKey(p, f); });
}
export function jumpKey(dir) {
  const L = app.doc.active;
  if (!L) return;
  ensureAnimate();
  const fs = [...L.keyFrames()].sort((a, b) => a - b);
  const t = dir > 0 ? fs.find(f => f > app.frame) : fs.reverse().find(f => f < app.frame);
  if (t !== undefined) { stop(); setFrame(t); }
}

const rowList = () => app.doc.rows();
const rowsTopDown = () => rowList().map(r => r.node);

function draw() {
  raf = 0;
  const d = app.doc, dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const rows = rowsTopDown();
  scrollX = clamp(scrollX, 0, Math.max(0, d.frames * CW - (W - GUT) + 40));
  scrollY = clamp(scrollY, 0, Math.max(0, rows.length * RH - (H - HDR)));
  const fx = f => GUT + f * CW - scrollX;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1b1d22'; ctx.fillRect(0, 0, W, H);
  ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';

  // rows
  rows.forEach((L, i) => {
    const y = HDR + i * RH - scrollY;
    if (y + RH < HDR || y > H) return;
    ctx.fillStyle = L.id === d.activeId ? '#2c3a52' : (i % 2 ? '#22252b' : '#262930');
    ctx.fillRect(GUT, y, W - GUT, RH);
    const keys = [...L.keyFrames()].sort((a, b) => a - b);
    if (keys.length > 1) { ctx.fillStyle = '#5aa2ff55'; ctx.fillRect(fx(keys[0]) + CW / 2, y + RH / 2 - 1.5, (keys[keys.length - 1] - keys[0]) * CW, 3); }
    for (const f of keys) {
      const x = fx(f) + CW / 2;
      if (x < GUT - CW || x > W + CW) continue;
      const moving = drag?.mode === 'key' && drag.layer === L && drag.from === f;
      ctx.fillStyle = moving ? '#5aa2ff66' : '#ffd60a';
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x + 5, y + RH / 2); ctx.lineTo(x, y + RH - 5); ctx.lineTo(x - 5, y + RH / 2); ctx.closePath(); ctx.fill();
    }
    if (drag?.mode === 'key' && drag.layer === L && drag.to !== drag.from) {
      const x = fx(drag.to) + CW / 2;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x + 5, y + RH / 2); ctx.lineTo(x, y + RH - 5); ctx.lineTo(x - 5, y + RH / 2); ctx.closePath(); ctx.stroke();
    }
  });
  // frame grid + shading past the end
  ctx.fillStyle = '#0006';
  const endX = fx(d.frames);
  if (endX < W) ctx.fillRect(Math.max(GUT, endX), 0, W - Math.max(GUT, endX), H);
  ctx.strokeStyle = '#ffffff10'; ctx.lineWidth = 1;
  ctx.beginPath();
  const f0 = Math.max(0, Math.floor(scrollX / CW)), f1 = Math.min(d.frames, f0 + Math.ceil((W - GUT) / CW) + 1);
  for (let f = f0; f <= f1; f++) if (f % 5 === 0) { const x = Math.round(fx(f)) + 0.5; ctx.moveTo(x, HDR); ctx.lineTo(x, H); }
  ctx.stroke();
  if (app.mode === 'paint' && !app.playing) {
    ctx.fillStyle = '#1b1d22b8'; ctx.fillRect(GUT, HDR, W - GUT, H - HDR);
    ctx.fillStyle = '#c3c8d1'; ctx.textAlign = 'center';
    ctx.fillText('Paint mode: you are editing the starting look. Click the timeline or press M to animate.', GUT + (W - GUT) / 2, HDR + (H - HDR) / 2);
  }
  // header
  ctx.fillStyle = '#2e323b'; ctx.fillRect(GUT, 0, W - GUT, HDR);
  ctx.fillStyle = '#9aa1ad'; ctx.textAlign = 'center';
  const every = d.fps >= 20 ? (d.fps % 6 === 0 ? 6 : 5) : 5;
  for (let f = f0; f < f1; f++) {
    const x = fx(f);
    ctx.fillRect(Math.round(x), HDR - (f % every === 0 ? 8 : 3), 1, f % every === 0 ? 8 : 3);
    if (f % every === 0) ctx.fillText(String(f + 1), x + CW / 2 + 8, 9);
  }
  // playhead
  const px = fx(app.frame);
  if (px > GUT - CW) {
    const ph = app.mode === 'animate' || app.playing ? '#ff453a' : '#8a909c';
    ctx.fillStyle = ph + '44'; ctx.fillRect(px, 0, CW, H);
    ctx.fillStyle = ph; ctx.fillRect(px + CW / 2 - 0.5, 0, 1.5, H);
    ctx.fillRect(px, 0, CW, 4);
  }
  // gutter with layer names
  ctx.fillStyle = '#24272e'; ctx.fillRect(0, 0, GUT, H);
  ctx.textAlign = 'left';
  const depths = rowList().map(r => r.depth);
  rows.forEach((L, i) => {
    const y = HDR + i * RH - scrollY;
    if (y + RH < HDR || y > H) return;
    if (L.id === d.activeId) { ctx.fillStyle = '#2c3a52'; ctx.fillRect(0, y, GUT, RH); }
    const x0 = 8 + depths[i] * 10;
    ctx.fillStyle = d.shown(L) ? '#e6e8ec' : '#6b7280';
    let name = (L.isGroup ? (L.expanded ? '▾ ' : '▸ ') : '') + L.name;
    while (name.length > 1 && ctx.measureText(name).width > GUT - 8 - x0) name = name.slice(0, -2) + '…';
    ctx.fillText(name, x0, y + RH / 2);
  });
  ctx.fillStyle = '#2e323b'; ctx.fillRect(0, 0, GUT, HDR);
  ctx.fillStyle = '#9aa1ad'; ctx.fillText('Layer / frame', 8, HDR / 2);
  ctx.fillStyle = '#3b404b'; ctx.fillRect(GUT - 1, 0, 1, H); ctx.fillRect(0, HDR - 1, W, 1);
}
const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };

function locate(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const rows = rowsTopDown();
  const i = Math.floor((y - HDR + scrollY) / RH);
  return {
    x, y, inGutter: x < GUT, inHeader: y < HDR,
    frame: clamp(Math.floor((x - GUT + scrollX) / CW), 0, app.doc.frames - 1),
    layer: y >= HDR && i >= 0 && i < rows.length ? rows[i] : null,
  };
}

export function buildTimeline() {
  const d = () => app.doc;
  const btn = (text, title, fn) => el('button', { text, title, 'aria-label': title, onclick: fn });
  const playBtn = btn('▶', 'Play / pause (Enter)', togglePlay);
  const frameIn = el('input', { type: 'number', min: 1, title: 'Current frame', 'aria-label': 'Current frame', onchange: () => goTo((+frameIn.value || 1) - 1) });
  const framesIn = el('input', { type: 'number', min: 1, max: 2000, title: 'Total frames', 'aria-label': 'Total frames',
    onchange: () => metaCmd('Change length', () => { d().frames = clamp(Math.round(+framesIn.value) || 1, 1, 2000); app.frame = Math.min(app.frame, d().frames - 1); }) });
  const fpsIn = el('input', { type: 'number', min: 1, max: 60, title: 'Frames per second', 'aria-label': 'Frames per second',
    onchange: () => metaCmd('Change frame rate', () => { d().fps = clamp(Math.round(+fpsIn.value) || 24, 1, 60); }) });
  const loop = el('input', { type: 'checkbox', checked: app.loop, onchange: () => { app.loop = loop.checked; } });
  const time = el('span', { class: 'muted', id: 'tlTime' });

  // Paint / Animate switch, in the menu bar so it is always in view
  const modeBtn = (m, text, title) => el('button', { class: 'mode-btn', 'data-mode': m, text, title, onclick: () => setMode(m) });
  $('#modeSeg').append(
    modeBtn('paint', '✏ Paint', 'Paint mode (M): changes set the layer’s starting look'),
    modeBtn('animate', '◆ Animate', 'Animate mode (M): every change adds a waypoint at the current frame'));
  const syncMode = () => {
    for (const b of $('#modeSeg').children) { const on_ = b.dataset.mode === app.mode; b.classList.toggle('active', on_); b.setAttribute('aria-pressed', on_); }
    redraw();
  };
  on('mode', syncMode);
  syncMode();

  $('#transport').append(
    btn('⏮', 'First frame (Home)', () => goTo(0)),
    btn('◀', 'Previous frame (,)', () => stepFrame(-1)),
    playBtn,
    btn('▶▏', 'Next frame (.)', () => stepFrame(1)),
    btn('⏭', 'Last frame (End)', () => goTo(d().frames - 1)),
    el('label', { text: 'Frame' }), frameIn, el('label', { text: 'of' }), framesIn,
    el('label', { text: 'FPS' }), fpsIn, time,
    el('span', { class: 'sep' }),
    btn('◆＋', 'Add keyframe for the selected layer (K)', addKeyAll),
    btn('◆－', 'Remove keyframe at this frame (Shift+K)', removeKeyAll),
    btn('◆◀', 'Jump to previous keyframe', () => jumpKey(-1)),
    btn('▶◆', 'Jump to next keyframe', () => jumpKey(1)),
    el('label', { class: 'check' }, loop, ' Loop'));

  cv = $('#timeline'); ctx = cv.getContext('2d');
  cv.addEventListener('pointerdown', e => {
    const p = locate(e);
    if (p.layer && d().activeId !== p.layer.id) { d().activeId = p.layer.id; emit('change'); }
    if (e.button === 0 && p.inGutter && p.layer?.isGroup) {
      const depth = rowList().find(r => r.node === p.layer).depth;
      if (p.x < 8 + depth * 10 + 14) { p.layer.expanded = !p.layer.expanded; emit('change'); }
      return;
    }
    if (e.button !== 0 || p.inGutter) return;
    cv.setPointerCapture(e.pointerId);
    ensureAnimate();
    stop();
    if (p.layer && !p.inHeader && p.layer.hasKeyAt(p.frame)) drag = { mode: 'key', layer: p.layer, from: p.frame, to: p.frame };
    else drag = { mode: 'scrub' };
    setFrame(p.frame);
    redraw();
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = locate(e);
    if (drag.mode === 'scrub') setFrame(p.frame);
    else { drag.to = p.frame; redraw(); }
  });
  const end = () => {
    const g = drag; drag = null;
    if (g?.mode === 'key' && g.to !== g.from) {
      metaCmd('Move keyframe', () => {
        for (const prop of Object.keys(g.layer.tracks)) {
          const tr = g.layer.tracks[prop], k = tr.find(x => x.f === g.from);
          if (!k) continue;
          const clash = tr.findIndex(x => x.f === g.to);
          if (clash >= 0) tr.splice(clash, 1);
          k.f = g.to;
          tr.sort((a, b) => a.f - b.f);
        }
      });
      setFrame(g.to);
    }
    redraw();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('contextmenu', e => {
    e.preventDefault();
    const p = locate(e);
    if (p.layer) emit('layermenu', p.layer, e.clientX, e.clientY);
  });
  cv.addEventListener('dblclick', e => {
    const p = locate(e);
    if (!p.layer || p.inGutter || p.inHeader) return;
    if (p.layer.hasKeyAt(p.frame)) removeKeyAll(); else addKeyAll();
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) scrollX += e.deltaX || e.deltaY;
    else if (rowsTopDown().length * RH > cv.clientHeight - HDR) scrollY += e.deltaY;
    else scrollX += e.deltaY;
    redraw();
  }, { passive: false });
  new ResizeObserver(redraw).observe(cv);

  const sync = () => {
    if (document.activeElement !== frameIn) frameIn.value = app.frame + 1;
    if (document.activeElement !== framesIn) framesIn.value = d().frames;
    if (document.activeElement !== fpsIn) fpsIn.value = d().fps;
    frameIn.max = d().frames;
    time.textContent = `${(app.frame / d().fps).toFixed(2)}s / ${(d().frames / d().fps).toFixed(2)}s`;
    // keep the playhead in view
    const vis = cv.clientWidth - GUT, x = app.frame * CW;
    if (vis > 0) { if (x < scrollX) scrollX = x; else if (x + CW > scrollX + vis) scrollX = x + CW - vis; }
    redraw();
  };
  on('frame', sync); on('change', sync); on('props', redraw);
  on('play', () => { playBtn.textContent = app.playing ? '⏸' : '▶'; redraw(); });
}
