// Shared editor state, tiny event bus and DOM helpers. No imports: everything else depends on this.
export const app = {
  doc: null,
  frame: 0,
  tool: null,
  fg: '#000000',
  bg: '#ffffff',
  opt: {
    size: 12, hardness: 80, opacity: 100, flow: 100, pressure: true,
    tolerance: 32, criterion: 'composite', sampleMerged: false,
    fillArea: 'connected', selMode: 'replace',
    fillShape: false, gradType: 'linear', gradTo: 'bg',
    fontSize: 96, font: 'Arial', bold: false, italic: false,
  },
  view: { zoom: 1, x: 0, y: 0 },
  sel: null,          // { mask, ring } canvases in layer space, or null
  playing: false,
  loop: true,
  mode: 'paint',      // 'paint': edits set the layer's starting look · 'animate': edits add waypoints
  animFrame: 0,       // frame to return to when switching back to animate mode
  unsaved: false,
};

const listeners = {};
export function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
export function emit(ev, ...args) { for (const fn of listeners[ev] || []) fn(...args); }

/* Events used across the editor:
   render  – pixels or animated values changed, repaint the stage
   change  – structure/values changed, refresh panels + timeline + stage
   frame   – current frame changed
   tool    – active tool or its options changed
   color   – foreground/background colour changed
   sel     – selection changed
   history – undo stack changed                                         */
export const requestRender = () => emit('render');
export const changed = () => emit('change');
export function markUnsaved() { if (!app.unsaved) { app.unsaved = true; emit('saved'); } }

export const $ = (s, r = document) => r.querySelector(s);
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
export function makeCanvas(w, h, opts) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  if (opts) c.getContext('2d', opts);
  return c;
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const uid = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0') + Date.now().toString(36).slice(-4);

export function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/* rectangles: { x, y, w, h } in whole pixels */
export function rectOf(x0, y0, x1, y1, pad = 0, W = Infinity, H = Infinity) {
  const x = Math.max(0, Math.floor(Math.min(x0, x1) - pad)), y = Math.max(0, Math.floor(Math.min(y0, y1) - pad));
  const r = Math.min(W, Math.ceil(Math.max(x0, x1) + pad)), b = Math.min(H, Math.ceil(Math.max(y0, y1) + pad));
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, b - y) };
}
export function unionRect(a, b) {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
