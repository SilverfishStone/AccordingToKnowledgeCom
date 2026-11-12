// Photo of a drawing → one clean, transparent pencil layer.
// Pipeline: find the paper → straighten it (perspective warp) → divide out uneven lighting and
// shadows → map "darker than paper" to line opacity → drop isolated specks.
import { app, el, makeCanvas, clamp, hexToRgb } from './state.js';
import { dialog, form, toast, pickFile } from './ui.js';
import { importImageLayer } from './panels.js';
import { api, getBlob, mediaUrl, backend } from '../api.js';
import { cloudActive } from '../cloud.js';

/* ---------- geometry ---------- */
/* 3x3 homography (row-major, h[8] = 1) taking the 4 points `from` onto the 4 points `to`. */
function homography(from, to) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [X, Y] = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X]);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let k = c; k < 9; k++) A[c][k] /= d;
    for (let r = 0; r < 8; r++) if (r !== c) { const m = A[r][c]; if (m) for (let k = c; k < 9; k++) A[r][k] -= m * A[c][k]; }
  }
  return [...A.map(r => r[8]), 1];
}

/* Straighten the quad `q` (TL, TR, BR, BL in source pixels) into an ow×oh image, bilinear sampled. */
export function warp(src, q, ow, oh) {
  const H = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], q);
  const out = new ImageData(ow, oh), o = out.data, s = src.data, sw = src.width, sh = src.height;
  const mx = sw - 1.001, my = sh - 1.001;
  for (let y = 0; y < oh; y++) {
    const yy = y + 0.5;
    let X = H[0] * 0.5 + H[1] * yy + H[2], Y = H[3] * 0.5 + H[4] * yy + H[5], Wd = H[6] * 0.5 + H[7] * yy + H[8];
    let oi = y * ow * 4;
    for (let x = 0; x < ow; x++, X += H[0], Y += H[3], Wd += H[6], oi += 4) {
      let sx = X / Wd - 0.5, sy = Y / Wd - 0.5;
      sx = sx < 0 ? 0 : sx > mx ? mx : sx; sy = sy < 0 ? 0 : sy > my ? my : sy;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i = (y0 * sw + x0) * 4, j = i + sw * 4;
      const a = (1 - fx) * (1 - fy), b = fx * (1 - fy), c = (1 - fx) * fy, d = fx * fy;
      o[oi] = s[i] * a + s[i + 4] * b + s[j] * c + s[j + 4] * d;
      o[oi + 1] = s[i + 1] * a + s[i + 5] * b + s[j + 1] * c + s[j + 5] * d;
      o[oi + 2] = s[i + 2] * a + s[i + 6] * b + s[j + 2] * c + s[j + 6] * d;
      o[oi + 3] = 255;
    }
  }
  return out;
}

/* Guess the paper's four corners (fractions 0..1 of the photo), or null to use the whole photo. */
export function detectPaper(canvas) {
  const k = 160 / Math.max(canvas.width, canvas.height);
  const w = Math.max(8, Math.round(canvas.width * k)), h = Math.max(8, Math.round(canvas.height * k));
  const c = makeCanvas(w, h, { willReadFrequently: true }).getContext('2d', { willReadFrequently: true });
  c.drawImage(canvas, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, n = w * h;
  const g = new Uint8Array(n), hist = new Float64Array(256);
  for (let i = 0; i < n; i++) { g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; hist[g[i]]++; }
  // Otsu threshold between "paper" and "everything else"
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  // largest bright connected region
  const label = new Int32Array(n), stack = new Int32Array(n);
  let bestArea = 0, bestId = 0, id = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] || g[s] <= thr) continue;
    id++; let top = 0, area = 0;
    stack[top++] = s; label[s] = id;
    while (top) {
      const p = stack[--top], x = p % w; area++;
      if (x > 0 && !label[p - 1] && g[p - 1] > thr) { label[p - 1] = id; stack[top++] = p - 1; }
      if (x < w - 1 && !label[p + 1] && g[p + 1] > thr) { label[p + 1] = id; stack[top++] = p + 1; }
      if (p >= w && !label[p - w] && g[p - w] > thr) { label[p - w] = id; stack[top++] = p - w; }
      if (p < n - w && !label[p + w] && g[p + w] > thr) { label[p + w] = id; stack[top++] = p + w; }
    }
    if (area > bestArea) { bestArea = area; bestId = id; }
  }
  if (bestArea < n * 0.15 || bestArea > n * 0.93) return null;   // no clear sheet, or it already fills the frame
  let tl, tr, br, bl, mTL = Infinity, mTR = -Infinity, mBR = -Infinity, mBL = Infinity;
  for (let p = 0; p < n; p++) {
    if (label[p] !== bestId) continue;
    const x = p % w, y = (p / w) | 0;
    if (x + y < mTL) { mTL = x + y; tl = [x, y]; }
    if (x + y > mBR) { mBR = x + y; br = [x, y]; }
    if (x - y > mTR) { mTR = x - y; tr = [x, y]; }
    if (x - y < mBL) { mBL = x - y; bl = [x, y]; }
  }
  const quad = [tl, tr, br, bl];
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = quad[i], b = quad[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
  if (Math.abs(area) / 2 < n * 0.12) return null;
  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4, cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
  return quad.map(([x, y]) => [clamp((x + 0.5 + (cx - x) * 0.03) / w, 0, 1), clamp((y + 0.5 + (cy - y) * 0.03) / h, 0, 1)]);   // nudge inside the edge
}

/* ---------- line extraction ---------- */
function boxBlur(a, w, h, r, tmp) {
  // separable running-sum blur, in place (uses tmp)
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0, cnt = 0;
    for (let x = -r; x < w; x++) {
      const add = x + r; if (add < w) { s += a[row + add]; cnt++; }
      const rem = x - r - 1; if (rem >= 0) { s -= a[row + rem]; cnt--; }
      if (x >= 0) tmp[row + x] = s / cnt;
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0, cnt = 0;
    for (let y = -r; y < h; y++) {
      const add = y + r; if (add < h) { s += tmp[add * w + x]; cnt++; }
      const rem = y - r - 1; if (rem >= 0) { s -= tmp[rem * w + x]; cnt--; }
      if (y >= 0) a[y * w + x] = s / cnt;
    }
  }
}
/* separable max (sign = 1) or min (sign = -1) filter, in place */
function rankFilter(a, w, h, r, tmp, sign) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let i = Math.max(0, x - r), e = Math.min(w - 1, x + r); i <= e; i++) { const v = a[y * w + i] * sign; if (v > m) m = v; }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = -Infinity;
    for (let i = Math.max(0, y - r), e = Math.min(h - 1, y + r); i <= e; i++) { const v = tmp[i * w + x]; if (v > m) m = v; }
    a[y * w + x] = m * sign;
  }
}

/* Per-pixel paper-normalised brightness: 1 = bare paper, lower = pencil. Returns { norm, bg }. */
export function normalise(img) {
  const w = img.width, h = img.height, d = img.data, n = w * h;
  const g = new Float32Array(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) g[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
  // paper brightness on a coarse grid: block means → max then min filter (a morphological closing:
  // erases pencil lines but keeps the edges of shadows where they are) → slight blur
  const k = Math.max(1, Math.round(Math.max(w, h) / 240));
  const sw = Math.ceil(w / k), sh = Math.ceil(h / k);
  const small = new Float32Array(sw * sh), cnt = new Uint16Array(sw * sh), tmp = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) { const sy = (y / k) | 0; for (let x = 0; x < w; x++) { const q = sy * sw + ((x / k) | 0); small[q] += g[y * w + x]; cnt[q]++; } }
  for (let q = 0; q < small.length; q++) small[q] /= cnt[q] || 1;
  const r = Math.max(3, Math.round(Math.max(sw, sh) / 40));
  rankFilter(small, sw, sh, r, tmp, 1);
  rankFilter(small, sw, sh, r, tmp, -1);
  boxBlur(small, sw, sh, 1, tmp);
  // bilinear upsample + divide
  const norm = new Float32Array(n), bg = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const fy = clamp((y + 0.5) / k - 0.5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = clamp((x + 0.5) / k - 0.5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const b = (small[y0 * sw + x0] * (1 - tx) + small[y0 * sw + x1] * tx) * (1 - ty) + (small[y1 * sw + x0] * (1 - tx) + small[y1 * sw + x1] * tx) * ty;
      const p = y * w + x, bb = Math.max(b, 0.04);
      bg[p] = bb;
      norm[p] = Math.min(1, g[p] / bb);
    }
  }
  return { norm, bg };
}

/* ---------- ruled (lined) paper ---------- */
/* How strongly darkness lines up along direction `th` (radians): sum of squared projection bins. */
function alignScore(px, py, pv, m, th, binW, hist) {
  const nx = -Math.sin(th) / binW, ny = Math.cos(th) / binW, off = hist.length / 2;
  hist.fill(0);
  for (let i = 0; i < m; i++) hist[(px[i] * nx + py[i] * ny + off) | 0] += pv[i];
  let s = 0;
  for (let i = 0; i < hist.length; i++) s += hist[i] * hist[i];
  return s;
}
/* Find the direction of the printed lines. Returns a function (x, y) → angle in radians, or null if
   the page does not look ruled. The angle may drift across the page (perspective, curled paper). */
function ruledField(dark, w, h) {
  // direction per tile: search every angle, keep tiles where one direction clearly stands out
  const RAD = Math.PI / 180, TX = 5, TY = 4, found = [];
  const hist = new Float32Array(2 * Math.ceil(Math.hypot(w / TX, h / TY) / 1.5) + 8);
  const tcap = Math.ceil(w / TX / 2 + 1) * Math.ceil(h / TY / 2 + 1), tx = new Float32Array(tcap), ty = new Float32Array(tcap), tv = new Float32Array(tcap);
  for (let j = 0; j < TY; j++) for (let i = 0; i < TX; i++) {
    const x0 = Math.floor(i * w / TX), x1 = Math.floor((i + 1) * w / TX), y0 = Math.floor(j * h / TY), y1 = Math.floor((j + 1) * h / TY);
    let n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const v = dark[y * w + x]; if (v > 0.06) { tx[n] = x - x0; ty[n] = y - y0; tv[n] = Math.min(0.5, v); n++; } }
    if (n < 150) continue;
    const scores = [];
    let tb = 0, ts = 0;
    for (let a = 0; a < 180; a++) { const s = alignScore(tx, ty, tv, n, a * RAD, 1.5, hist); scores.push(s); if (s > ts) { ts = s; tb = a; } }
    const conf = ts / [...scores].sort((p, q) => p - q)[90];
    if (conf < 1.3) continue;
    for (let a = tb - 1; a <= tb + 1; a += 0.25) { const s = alignScore(tx, ty, tv, n, a * RAD, 1.5, hist); if (s > ts) { ts = s; tb = a; } }
    found.push({ u: (i + 0.5) / TX - 0.5, v: (j + 0.5) / TY - 0.5, a: tb, wt: conf - 1 });
  }
  // the ruling is the direction most tiles agree on (within 10°, angles wrap at 180°)
  const diff = (p, q) => ((p - q + 270) % 180 + 180) % 180 - 90;
  let best = null, bestW = 0;
  for (const c of found) {
    let sum = 0, cnt = 0;
    for (const t of found) if (Math.abs(diff(t.a, c.a)) <= 10) { sum += t.wt; cnt++; }
    if (cnt >= Math.max(5, found.length * 0.4) && sum > bestW) { bestW = sum; best = c; }
  }
  if (!best) return null;
  const tiles = found.filter(t => Math.abs(diff(t.a, best.a)) <= 10).map(t => ({ ...t, a: best.a + diff(t.a, best.a) }));
  const fit = list => {
    // weighted least squares for a + b·u + c·v
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (const t of list) { const r = [1, t.u, t.v]; for (let p = 0; p < 3; p++) { for (let q = 0; q < 3; q++) M[p][q] += t.wt * r[p] * r[q]; M[p][3] += t.wt * r[p] * t.a; } }
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-9) return null;
      for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let q = c; q < 4; q++) M[r][q] -= f * M[c][q]; }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  };
  let co = tiles.length >= 5 ? fit(tiles) : null;
  if (co) {
    const good = tiles.filter(t => Math.abs(co[0] + co[1] * t.u + co[2] * t.v - t.a) < 3);   // drop tiles fooled by the drawing
    co = good.length >= 5 ? fit(good) || co : co;
  }
  if (!co) co = [tiles.reduce((q, t) => q + t.a * t.wt, 0) / tiles.reduce((q, t) => q + t.wt, 0), 0, 0];
  return (x, y) => (co[0] + co[1] * (x / w - 0.5) + co[2] * (y / h - 0.5)) * RAD;
}

/* Erase printed ruled lines from `norm` (in place). A pixel is treated as ruled line when the
   darkness continues a long way along the ruling direction but not just beside it, so drawn strokes
   (short, curved, or crossing the lines) and filled areas are left alone. Returns false if the page
   does not look ruled. */
export function removeRuledLines(norm, w, h) {
  const n = w * h, dark = new Float32Array(n);
  for (let i = 0; i < n; i++) dark[i] = 1 - norm[i];
  const angleAt = ruledField(dark, w, h);
  if (!angleAt) return false;
  // 3×3 max so a line that wanders by a pixel is still followed
  const tmp = new Float32Array(n), wide = new Float32Array(dark);
  rankFilter(wide, w, h, 1, tmp, 1);
  const S = 20, step = Math.max(2, Math.round(w / 440)), side = Math.max(3, Math.round(w / 220));
  const reach = Math.max(2, Math.round(side * 0.7));
  const buf = new Float32Array(2 * S + 1);
  const medianAlong = (src, x, y, c, s) => {
    let m = 0;
    for (let t = -S; t <= S; t++) {
      const xx = Math.round(x + c * t * step), yy = Math.round(y + s * t * step);
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) buf[m++] = src[yy * w + xx];
    }
    if (m < 12) return 0;
    const part = buf.subarray(0, m).sort();
    return part[m >> 1];
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (wide[p] < 0.04) continue;
    const th = angleAt(x, y), c = Math.cos(th), s = Math.sin(th);
    const along = medianAlong(wide, x, y, c, s);
    if (along < 0.04) continue;
    const beside = Math.max(medianAlong(dark, x - s * side, y + c * side, c, s), medianAlong(dark, x + s * side, y - c * side, c, s));
    const line = Math.min(0.9, along - beside);
    if (line < 0.03) continue;
    let v = Math.min(1, norm[p] / (1 - line));
    // a drawn stroke crossing the ruled line shows up dark on both sides of it: bridge the gap
    let bridge = 0;
    for (let t = -2; t <= 2; t += 0.25) {    // fan of directions a crossing stroke might take
      const ox = -s * reach + c * t * reach, oy = c * reach + s * t * reach;
      const ax = Math.round(x + ox), ay = Math.round(y + oy), bx = Math.round(x - ox), by = Math.round(y - oy);
      if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= w || bx >= w || ay >= h || by >= h) continue;
      const pair = Math.min(dark[ay * w + ax], dark[by * w + bx]);
      if (pair > bridge) bridge = pair;
    }
    if (1 - bridge < v) v = 1 - bridge;
    norm[p] = Math.max(norm[p], v);
  }
  return true;
}

/* Suggest levels from the picture itself: where paper noise ends and how dark the darkest lines are. */
export function autoLevels(norm) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < norm.length; i++) hist[(norm[i] * 255) | 0]++;
  const pct = q => { let acc = 0, target = norm.length * q; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i / 255; } return 1; };
  const p50 = pct(0.5), p16 = pct(0.16), dark = pct(0.004);
  const white = clamp(p50 - 3.5 * (p50 - p16) - 0.03, 0.7, 0.96);
  const black = clamp(dark + 0.05, 0.15, white - 0.1);
  return { white, black };
}

/* Build the transparent line image. o: { white, black, speck, smooth, mode: 'pencil'|'colour', color } */
export function extractLines(img, pre, o) {
  const w = img.width, h = img.height, n = w * h, d = img.data;
  let norm = pre.norm;
  if (o.smooth > 0) { norm = new Float32Array(pre.norm); const tmp = new Float32Array(n); for (let i = 0; i < o.smooth; i++) boxBlur(norm, w, h, 1, tmp); }
  const alpha = new Float32Array(n), span = Math.max(0.01, o.white - o.black);
  for (let p = 0; p < n; p++) { const t = (o.white - norm[p]) / span; alpha[p] = t <= 0 ? 0 : t >= 1 ? 1 : t; }
  if (o.speck > 0) {
    // remove connected blobs of "ink" smaller than o.speck pixels (dust, paper grain, JPEG noise)
    const seen = new Uint8Array(n), stack = new Int32Array(n), members = new Int32Array(n), T = 0.12;
    for (let s = 0; s < n; s++) {
      if (seen[s] || alpha[s] <= T) continue;
      let top = 0, m = 0;
      stack[top++] = s; seen[s] = 1;
      while (top) {
        const p = stack[--top], x = p % w; members[m++] = p;
        for (let dy = -1; dy <= 1; dy++) {
          const q0 = p + dy * w;
          if (q0 < 0 || q0 >= n) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx < 0 || x + dx >= w) continue;
            const q = q0 + dx;
            if (!seen[q] && alpha[q] > T) { seen[q] = 1; stack[top++] = q; }
          }
        }
      }
      if (m >= o.speck) for (let i = 0; i < m; i++) seen[members[i]] = 2;   // 2 = part of a real line
    }
    // keep real lines plus a 2px soft edge around them; everything else (specks, faint haze) goes
    const near = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      if (seen[p] !== 2) continue;
      const x = p % w, xa = Math.max(0, x - 2), xb = Math.min(w - 1, x + 2);
      for (let dy = -2; dy <= 2; dy++) {
        const row = p - x + dy * w;
        if (row < 0 || row >= n) continue;
        for (let xx = xa; xx <= xb; xx++) near[row + xx] = 1;
      }
    }
    for (let p = 0; p < n; p++) if (!near[p]) alpha[p] = 0;
  }
  const out = new ImageData(w, h), od = out.data, [R, G, B] = hexToRgb(o.color);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = alpha[p];
    if (!a) continue;
    if (o.mode === 'colour') {
      const b = pre.bg[p];
      od[i] = d[i] / b; od[i + 1] = d[i + 1] / b; od[i + 2] = d[i + 2] / b;
    } else { od[i] = R; od[i + 1] = G; od[i + 2] = B; }
    od[i + 3] = a * 255;
  }
  return out;
}

/* ---------- dialog ---------- */
const sliderToLevels = v => {
  const white = 0.99 - v.clean * 0.004;
  return { white, black: Math.max(0.02, white - (0.6 - v.strength * 0.0056)) };
};
const levelsToSlider = l => ({
  clean: clamp(Math.round((0.99 - l.white) / 0.004), 0, 100),
  strength: clamp(Math.round((0.6 - (l.white - l.black)) / 0.0056), 0, 100),
});

async function sketchDialog(blob, name) {
  let bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch { toast('That file could not be read as an image'); return; }
  const doc = app.doc;
  // working copy of the photo (long side capped so everything stays fast)
  let src = makeCanvas(1, 1), srcData = null, quad = null;
  const loadSource = (image, turns = 0) => {
    const k = Math.min(1, 2600 / Math.max(image.width, image.height));
    const w = Math.round(image.width * k), h = Math.round(image.height * k);
    const c = makeCanvas(turns % 2 ? h : w, turns % 2 ? w : h, { willReadFrequently: true }), x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.translate(c.width / 2, c.height / 2); x.rotate(turns * Math.PI / 2);
    x.drawImage(image, -w / 2, -h / 2, w, h);
    src = c; srcData = null;
    quad = detectPaper(src) || [[0, 0], [1, 0], [1, 1], [0, 1]];
  };
  loadSource(bmp);

  const view = el('canvas', { class: 'sk-view', title: 'Drag the corners onto the corners of your paper' });
  const prev = el('canvas', { class: 'sk-prev' });
  const status = el('div', { class: 'muted', text: '' });
  let timer = 0, auto = true, lastAspect = 1, ruledNote = '';

  const f = form([
    { key: 'clean', label: 'Clean up paper', type: 'range', min: 0, max: 100, value: 30 },
    { key: 'strength', label: 'Line strength', type: 'range', min: 0, max: 100, value: 50 },
    { key: 'speck', label: 'Remove specks', type: 'range', min: 0, max: 400, value: 60, unit: 'px' },
    { key: 'smooth', label: 'Smooth', type: 'range', min: 0, max: 3, value: 0 },
    { key: 'ruled', label: 'Remove ruled lines', type: 'checkbox', value: false },
    { key: 'mode', label: 'Lines', type: 'select', value: 'pencil', options: [['pencil', 'Single pencil colour'], ['colour', 'Keep original colours']] },
    { key: 'color', label: 'Pencil colour', type: 'color', value: '#2b2b2b' },
    { key: 'stretch', label: 'Stretch to fill canvas', type: 'checkbox', value: false },
    { key: 'white', label: 'Preview on white', type: 'checkbox', value: true },
  ], (v, key) => { if (key === 'clean' || key === 'strength') auto = false; schedule(); });
  const v = f.values;

  /* output size in document pixels for the current quad */
  const targetSize = () => {
    const [a, b, c, d] = quad.map(([x, y]) => [x * src.width, y * src.height]);
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const aspect = ((dist(a, b) + dist(d, c)) / 2) / Math.max(1, (dist(a, d) + dist(b, c)) / 2);
    lastAspect = aspect;
    if (v.stretch) return [doc.width, doc.height];
    const w = Math.min(doc.width, doc.height * aspect);
    return [Math.round(w), Math.round(w / aspect)];
  };
  const run = scale => {
    srcData ||= src.getContext('2d').getImageData(0, 0, src.width, src.height);
    const [tw, th] = targetSize();
    const ow = Math.max(8, Math.round(tw * scale)), oh = Math.max(8, Math.round(th * scale));
    // pre-shrink a much larger photo so thin lines are averaged instead of skipped
    const q = quad.map(([x, y]) => [x * src.width, y * src.height]);
    const quadW = (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) + Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1])) / 2;
    let data = srcData, qs = q;
    const shrink = ow * 1.3 / quadW;
    if (shrink < 0.75) {
      const c = makeCanvas(src.width * shrink, src.height * shrink, { willReadFrequently: true }), x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, c.width, c.height);
      data = x.getImageData(0, 0, c.width, c.height);
      qs = quad.map(([px, py]) => [px * c.width, py * c.height]);
    }
    const flat = warp(data, qs, ow, oh);
    const pre = normalise(flat);
    ruledNote = v.ruled ? (removeRuledLines(pre.norm, ow, oh) ? ' · ruled lines removed' : ' · no ruled lines found') : '';
    if (auto) {
      const s = levelsToSlider(autoLevels(pre.norm));
      v.clean = s.clean; v.strength = s.strength;
      const inputs = f.node.querySelectorAll('input[type=range]');
      inputs[0].value = s.clean; inputs[0].nextElementSibling.textContent = s.clean;
      inputs[1].value = s.strength; inputs[1].nextElementSibling.textContent = s.strength;
    }
    const lv = sliderToLevels(v);
    return extractLines(flat, pre, { ...lv, speck: Math.round(v.speck * scale * scale), smooth: v.smooth, mode: v.mode, color: v.color });
  };
  const preview = () => {
    timer = 0;
    const scale = Math.min(1, 720 / doc.width);
    const img = run(scale);
    prev.width = img.width; prev.height = img.height;
    prev.getContext('2d').putImageData(img, 0, 0);
    prev.classList.toggle('on-white', v.white);
    status.textContent = `Paper ${lastAspect.toFixed(2)} : 1 → layer ${Math.round(img.width / scale)} × ${Math.round(img.height / scale)} px${ruledNote}`;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(preview, 80); };

  /* source view with draggable corners */
  const drawView = () => {
    const maxW = 460, maxH = 420, k = Math.min(maxW / src.width, maxH / src.height);
    const dpr = window.devicePixelRatio || 1, w = Math.round(src.width * k), h = Math.round(src.height * k);
    view.style.width = w + 'px'; view.style.height = h + 'px';
    view.width = w * dpr; view.height = h * dpr;
    const c = view.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(src, 0, 0, w, h);
    c.beginPath(); quad.forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h))); c.closePath();
    c.strokeStyle = '#000'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#5aa2ff'; c.lineWidth = 2; c.stroke();
    for (const [x, y] of quad) { c.beginPath(); c.arc(x * w, y * h, 8, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#1a5fc4'; c.stroke(); }
  };
  let grab = -1;
  const pos = e => { const r = view.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  view.addEventListener('pointerdown', e => {
    const [x, y] = pos(e), r = view.getBoundingClientRect();
    let best = -1, bd = 30;
    quad.forEach(([qx, qy], i) => { const dd = Math.hypot((qx - x) * r.width, (qy - y) * r.height); if (dd < bd) { bd = dd; best = i; } });
    grab = best;
    if (grab >= 0) view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', e => { if (grab < 0) return; quad[grab] = pos(e); drawView(); schedule(); });
  view.addEventListener('pointerup', () => { grab = -1; });

  let turns = 0;
  const content = el('div', { class: 'sk' },
    el('div', { class: 'sk-col' },
      el('div', { class: 'muted', text: '1. Drag the blue corners onto the corners of the paper' }),
      view,
      el('div', { class: 'row' },
        el('button', { text: '⟳ Rotate photo', onclick: () => { turns = (turns + 1) % 4; loadSource(bmp, turns); auto = true; drawView(); schedule(); } }),
        el('button', { text: 'Find paper again', onclick: () => { quad = detectPaper(src) || [[0, 0], [1, 0], [1, 1], [0, 1]]; drawView(); schedule(); } }),
        el('button', { text: 'Use whole photo', onclick: () => { quad = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawView(); schedule(); } }))),
    el('div', { class: 'sk-col' },
      el('div', { class: 'muted', text: '2. Tune the result' }),
      prev, status, f.node,
      el('button', { text: 'Auto levels', onclick: () => { auto = true; schedule(); } })));

  const result = dialog({ title: `Pencil sketch from “${name}”`, content, buttons: [['Cancel', null], ['Add as pencil layer', 'ok']] });
  drawView(); preview();
  if (!await result) { clearTimeout(timer); return; }
  clearTimeout(timer);
  auto = false;
  const img = run(1);
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').putImageData(img, 0, 0);
  importImageLayer(c, 'Pencil sketch', { fit: false });
  toast('Pencil layer added');
}

/* Choose a photo from the phone inbox (or the online account) or a file from this computer: { blob, name } or null. */
export async function pickPhoto({ title, intro = 'Pick a photo you sent from your phone, or choose an image file from this computer.' }) {
  let items = [];
  const local = await backend() === 'local', cloud = local && cloudActive();
  const lazyImg = (url, alt) => { const img = el('img', { alt, loading: 'lazy' }); mediaUrl(url).then(u => { img.src = u; }); return img; };
  try { items = (await api('GET', '/api/inbox')).items; } catch { /* offline: file only */ }
  let chosen = null;
  const grid = el('div', { class: 'inbox-grid' }, items.length ? items.map(it =>
    el('button', { class: 'inbox-item', title: it.name, onclick: () => { chosen = it; closer('ok'); } },
      lazyImg(`api/inbox/${it.id}`, it.name))) : el('p', { class: 'muted', text: cloud
        ? 'Your account has no photos yet. Open the Phone upload page on your phone, sign in, and send one.'
        : local
          ? 'No photos saved yet. Choose one from this device below (on a phone, that can open the camera). To send photos from a phone, link your account on the Animator’s home page.'
          : 'Your phone inbox is empty. Open this site on your phone and choose “Phone upload page” to send a photo.' }));
  let closer = () => {};
  const content = el('div', {},
    el('p', { class: 'muted', text: intro }),
    grid,
    el('button', { text: 'Choose a file from this computer…', onclick: async () => { const file = await pickFile('image/*'); if (file) { chosen = file; closer('ok'); } } }));
  const r = await dialog({ title, content, buttons: [['Cancel', null]], onOpen: (box, done) => { closer = done; } });
  if (!r || !chosen) return null;
  if (chosen instanceof Blob) return { blob: chosen, name: chosen.name || 'photo' };
  const blob = await getBlob(`api/inbox/${chosen.id}`);
  if (!blob) { toast('Could not load the photo'); return null; }
  return { blob, name: chosen.name };
}

/* Entry point: choose a photo from the phone inbox or from this computer. */
export async function importSketch() {
  const p = await pickPhoto({ title: 'Import photo as pencil sketch' });
  if (!p) return;
  try { await sketchDialog(p.blob, p.name); } catch (err) { toast(err.message); }
}
