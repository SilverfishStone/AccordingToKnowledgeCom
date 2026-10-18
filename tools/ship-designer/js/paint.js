// Brush painting: every hall surface (outside / inside) can carry a painted layer - a canvas that the hull shader lays over the
// material. The canvas is the surface's own undistorted atlas (the geometry's uv1), so strokes stay put when the hull is rebuilt.
import * as THREE from 'three';

export const state = { res: 2048 };
export const layers = new Map();   // "<hallId>.<ext|int>" -> {key, canvas, ctx, tex, res, dirty, touched}

export const emptyTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export function makeLayer(key, res = state.res) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = 8;
  const L = { key, canvas, ctx, tex, res, dirty: true, touched: null };
  layers.set(key, L);
  return L;
}

export const getLayer = (key, create = true) => layers.get(key) || (create ? makeLayer(key) : null);

/** call once a frame: uploads only the layers that were drawn on */
export function flush() {
  for (const L of layers.values()) if (L.dirty) { L.tex.needsUpdate = true; L.dirty = false; }
}

const srgbBytes = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export function dab(L, u, v, radius, color, hardness, flow, erase) {
  const x = u * L.res, y = (1 - v) * L.res, ctx = L.ctx;
  const [r, g, b] = srgbBytes(color);
  ctx.save();
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const h = Math.min(Math.max(hardness, 0), 0.98);
  grad.addColorStop(0, `rgba(${r},${g},${b},${flow})`);
  grad.addColorStop(h, `rgba(${r},${g},${b},${flow})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const t = L.touched ||= { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
  t.x0 = Math.min(t.x0, x - radius); t.y0 = Math.min(t.y0, y - radius);
  t.x1 = Math.max(t.x1, x + radius); t.y1 = Math.max(t.y1, y + radius);
  L.dirty = true; L.ver = (L.ver || 0) + 1;
}

/** dabs along the segment a -> b (uv pairs), spaced a fraction of the radius apart so strokes are smooth */
export function stroke(L, a, b, radius, color, hardness, flow, erase, spacing = 0.18) {
  if (!a) { dab(L, b[0], b[1], radius, color, hardness, flow, erase); return; }
  const dx = (b[0] - a[0]) * L.res, dy = (b[1] - a[1]) * L.res;
  const dist = Math.hypot(dx, dy), step = Math.max(radius * spacing, 0.6);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= n; i++) dab(L, a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, radius, color, hardness, flow, erase);
}

export function snapshot(L) {
  const c = document.createElement('canvas');
  c.width = c.height = L.res;
  c.getContext('2d').drawImage(L.canvas, 0, 0);
  return c;
}

/** the changed rectangle of a layer as before / after pixels (small, so undo stays cheap) */
export function region(L, before) {
  const t = L.touched;
  if (!t) return null;
  const x = Math.max(0, Math.floor(t.x0) - 2), y = Math.max(0, Math.floor(t.y0) - 2);
  const w = Math.min(L.res, Math.ceil(t.x1) + 2) - x, h = Math.min(L.res, Math.ceil(t.y1) + 2) - y;
  if (w <= 0 || h <= 0) return null;
  return { key: L.key, x, y, before: before.getContext('2d').getImageData(x, y, w, h), after: L.ctx.getImageData(x, y, w, h) };
}

export function putRegion(r, which) {
  const L = getLayer(r.key);
  L.ctx.save();
  L.ctx.globalCompositeOperation = 'copy';
  L.ctx.putImageData(r[which], r.x, r.y);
  L.ctx.restore();
  L.dirty = true; L.ver = (L.ver || 0) + 1;
}

export function clearLayer(key) {
  const L = layers.get(key);
  if (!L) return;
  L.ctx.clearRect(0, 0, L.res, L.res);
  L.dirty = true; L.ver = (L.ver || 0) + 1;
}

export function sample(L, u, v) {
  const d = L.ctx.getImageData(Math.min(L.res - 1, Math.max(0, Math.floor(u * L.res))), Math.min(L.res - 1, Math.max(0, Math.floor((1 - v) * L.res))), 1, 1).data;
  return d[3] ? { color: '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join(''), alpha: d[3] / 255 } : null;
}

export const isPainted = L => !!L && L.ctx.getImageData(0, 0, L.res, L.res).data.some((v, i) => i % 4 === 3 && v);

// ------------------------------------------------------------------ saving / loading
export function exportPaint(hallIds) {
  const out = {};
  for (const [key, L] of layers) {
    if (!hallIds.has(key.split('.')[0])) continue;
    if (L.exp && L.exp.ver === (L.ver || 0)) { if (L.exp.url) out[key] = L.exp.url; continue; }      // unchanged since the last save
    const url = isPainted(L) ? L.canvas.toDataURL('image/png') : '';
    L.exp = { ver: L.ver || 0, url };
    if (url) out[key] = url;
  }
  return out;
}

export function importPaint(obj) {
  const jobs = [];
  for (const [key, url] of Object.entries(obj || {})) {
    jobs.push(new Promise(res => {
      const img = new Image();
      img.onload = () => {
        layers.get(key)?.tex.dispose();
        const L = makeLayer(key, img.width);
        L.ctx.clearRect(0, 0, L.res, L.res);
        L.ctx.drawImage(img, 0, 0);
        L.dirty = true; L.ver = (L.ver || 0) + 1;
        res();
      };
      img.onerror = res;
      img.src = url;
    }));
  }
  return Promise.all(jobs);
}

export function clearAll() {
  for (const L of layers.values()) { L.ctx.clearRect(0, 0, L.res, L.res); L.dirty = true; L.ver = (L.ver || 0) + 1; }
}
