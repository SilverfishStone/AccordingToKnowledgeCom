// Selection = an alpha mask canvas (white where selected) in layer space, plus a thin
// "ring" canvas along its inside edge that the overlay animates as marching ants.
import { app, emit, makeCanvas } from './state.js';

function buildRing(mask) {
  const w = mask.width, h = mask.height, t = 2;
  const er = makeCanvas(w, h), ec = er.getContext('2d');
  ec.drawImage(mask, 0, 0);
  ec.globalCompositeOperation = 'destination-in';
  for (const [dx, dy] of [[t, 0], [-t, 0], [0, t], [0, -t]]) {
    // keep only what is still covered after shifting; fill the uncovered strip so edges erode too
    const s = makeCanvas(w, h), sc = s.getContext('2d');
    sc.drawImage(mask, dx, dy);
    ec.drawImage(s, 0, 0);
  }
  const ring = makeCanvas(w, h), rc = ring.getContext('2d');
  rc.drawImage(mask, 0, 0);
  rc.globalCompositeOperation = 'destination-out';
  rc.drawImage(er, 0, 0);
  return ring;
}

function finish(mask) {
  app.sel = mask ? { mask, ring: buildRing(mask) } : null;
  emit('sel');
}

/* drawFn(ctx) paints the shape (fillStyle is already white).
   mode: replace | add | subtract | intersect, combined with `base` (defaults to the current selection).
   Always builds a new mask, so the base can be reused while a tool is being dragged. */
export function setSelection(drawFn, mode = 'replace', base = app.sel?.mask || null) {
  const { width, height } = app.doc;
  const shape = makeCanvas(width, height), sc = shape.getContext('2d');
  sc.fillStyle = '#fff';
  drawFn(sc);
  if (mode === 'replace' || !base) {
    if (mode === 'subtract' || mode === 'intersect') return finish(null);   // nothing to subtract from / intersect with
    return finish(shape);
  }
  const mask = makeCanvas(width, height), c = mask.getContext('2d');
  c.drawImage(base, 0, 0);
  c.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
  c.drawImage(shape, 0, 0);
  finish(mask);
}
export function selectNone() { if (app.sel) finish(null); }
export function selectAll() { setSelection(c => c.fillRect(0, 0, app.doc.width, app.doc.height)); }
export function invertSelection() {
  if (!app.sel) return selectAll();
  const c = app.sel.mask.getContext('2d');
  c.save();
  c.globalCompositeOperation = 'source-out';
  c.fillStyle = '#fff';
  c.fillRect(0, 0, app.doc.width, app.doc.height);
  c.restore();
  finish(app.sel.mask);
}
/* Keep only the selected part of whatever is on ctx. */
export function clipToSelection(ctx) {
  if (!app.sel) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(app.sel.mask, 0, 0);
  ctx.restore();
}

/* What "similar colour" means. Each returns a 0..255 value per pixel (hue wraps around). */
export const CRITERIA = [
  ['composite', 'Colour + alpha'], ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['alpha', 'Alpha'],
  ['hue', 'Hue'], ['saturation', 'Saturation'], ['lightness', 'Lightness'],
];
function channel(criterion, d, i) {
  const r = d[i], g = d[i + 1], b = d[i + 2];
  switch (criterion) {
    case 'red': return r;
    case 'green': return g;
    case 'blue': return b;
    case 'alpha': return d[i + 3];
    case 'lightness': return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    case 'saturation': { const mx = Math.max(r, g, b); return mx ? (mx - Math.min(r, g, b)) / mx * 255 : 0; }
    case 'hue': {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
      if (!dd) return -1;                          // greys have no hue
      let hh = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      hh *= 255 / 6;
      return hh < 0 ? hh + 255 : hh;
    }
  }
  return 0;
}

/* Scanline flood fill over ImageData. Returns { mask: Uint8Array, bounds } (mask is 1 where matched).
   tol 0..255 is how far a pixel may be from the clicked one; contiguous = only the connected region. */
export function flood(img, sx, sy, tol, contiguous, criterion = 'composite') {
  const w = img.width, h = img.height, d = img.data;
  const out = new Uint8Array(w * h);
  const i0 = (sy * w + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3], c0 = channel(criterion, d, i0);
  const match = p => {
    const i = p * 4, a = d[i + 3];
    if (criterion === 'alpha') return Math.abs(a - a0) <= tol;
    if (a0 === 0 || a === 0) return Math.abs(a - a0) <= tol;   // colour of a fully transparent pixel is meaningless
    if (criterion === 'composite') return Math.abs(d[i] - r0) <= tol && Math.abs(d[i + 1] - g0) <= tol && Math.abs(d[i + 2] - b0) <= tol && Math.abs(a - a0) <= tol;
    const c = channel(criterion, d, i);
    if (criterion === 'hue') {
      if (c < 0 || c0 < 0) return c === c0;
      const dh = Math.abs(c - c0);
      return Math.min(dh, 255 - dh) <= tol;
    }
    return Math.abs(c - c0) <= tol;
  };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const grow = (xa, xb, y) => { if (xa < x0) x0 = xa; if (xb > x1) x1 = xb; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  if (!contiguous) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (match(y * w + x)) { out[y * w + x] = 1; grow(x, x, y); }
  } else {
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      const row = y * w;
      if (out[row + x] || !match(row + x)) continue;
      let xl = x, xr = x;
      while (xl > 0 && !out[row + xl - 1] && match(row + xl - 1)) xl--;
      while (xr < w - 1 && !out[row + xr + 1] && match(row + xr + 1)) xr++;
      for (let i = xl; i <= xr; i++) out[row + i] = 1;
      grow(xl, xr, y);
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        let run = false;
        for (let i = xl; i <= xr; i++) {
          const ok = !out[nrow + i] && match(nrow + i);
          if (ok && !run) { stack.push(i, ny); run = true; } else if (!ok) run = false;
        }
      }
    }
  }
  return { mask: out, bounds: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/* Turn a flood mask into a canvas painted with one colour. */
export function maskToCanvas(mask, w, h, rgb = [255, 255, 255]) {
  const img = new ImageData(w, h), d = img.data;
  for (let p = 0; p < mask.length; p++) if (mask[p]) { const i = p * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}
