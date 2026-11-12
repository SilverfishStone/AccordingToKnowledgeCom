// Template registry and shared helpers. A template is a small generator:
//   { id, name, icon, blurb, defaults, fields(p, ctx), build(doc, p, art) → group, presets?, drag?, overlay? }
// build() makes an ordinary group of ordinary layers with ordinary keyframes; nothing stays procedural.
import { makeCanvas, hexToRgb, rgbToHex } from './state.js';

export const TEMPLATES = [];
export function register(T) { TEMPLATES.push(T); return T; }
export const byId = id => TEMPLATES.find(t => t.id === id) || null;

export const RAD = Math.PI / 180;
export const r2 = v => Math.round(v * 100) / 100;

/* lighten (k > 0) or darken (k < 0) a #rrggbb colour */
export function shade(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return k >= 0 ? rgbToHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : rgbToHex(r * (1 + k), g * (1 + k), b * (1 + k));
}

/* small deterministic random numbers, so a template rebuilds the same way every time */
export function rng(seed = 1) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function newGroup(doc, name) { return doc.fromMeta({ kind: 'group', name, children: [] }); }

/* A layer exactly the size of `canvas`, holding its picture. Its pivot is the picture's centre. */
export function layerFrom(doc, name, canvas) {
  const L = doc.fromMeta({ kind: 'layer', name, size: { w: canvas.width, h: canvas.height } });
  L.ctx.drawImage(canvas, 0, 0);
  L.touch();
  return L;
}
/* Place a layer so the centre of its picture sits at document point (x, y). */
export const centreAt = (L, x, y) => ({ x: r2(x - L.pivot.x), y: r2(y - L.pivot.y) });

/* Bake values into keyframes. frames: [f…]; vals: [v…]. A property that never changes gets no keys.
   holds: optional Set of key indexes whose easing is 'hold' (jump to the next key instead of sliding). */
export function bake(L, prop, frames, vals, { holds = null, ease = 'linear', eps = 0.05 } = {}) {
  const v = vals.map(r2);
  if (!frames.length) return;
  if (v.every(x => Math.abs(x - v[0]) < eps)) { L.base[prop] = v[0]; delete L.tracks[prop]; return; }
  L.base[prop] = v[0];
  L.tracks[prop] = frames.map((f, i) => ({ f, v: v[i], ease: holds?.has(i) ? 'hold' : ease }));
}

/* Frames to key: every `step` frames from f0 to f1, always including f1. */
export function keyFrames(f0, f1, step) {
  const out = [];
  for (let f = f0; f <= f1; f += Math.max(1, step)) out.push(f);
  if (out[out.length - 1] !== f1) out.push(f1);
  return out;
}

/* Keep an angle sequence continuous (no 179° → -179° flips that would spin the wrong way). */
export function unwrap(prev, a) { return prev == null ? a : prev + ((((a - prev) % 360) + 540) % 360 - 180); }

/* Shared form fields for a template's time range. */
export const timeFields = (p, doc) => [
  { key: 'from', label: 'From frame', type: 'number', min: 1, max: doc.frames, value: p.from },
  { key: 'to', label: 'To frame', type: 'number', min: 1, max: doc.frames, value: p.to || doc.frames },
  { key: 'keyEvery', label: 'Keyframe every', type: 'range', min: 1, max: 8, value: p.keyEvery, unit: ' fr' },
];
export function frameRange(p, doc) {
  const f0 = Math.min(doc.frames - 1, Math.max(0, Math.round(p.from || 1) - 1));
  const f1 = Math.min(doc.frames - 1, Math.max(f0, Math.round(p.to || doc.frames) - 1));
  return [f0, f1];
}

export function ovalCanvas(ra, rc, { fill, shading = true, radial = false, outline = 0, outlineColor = '#000', topLight = true }) {
  const pad = Math.ceil(outline + 3);
  const c = makeCanvas(Math.ceil(2 * ra + 2 * pad), Math.ceil(2 * rc + 2 * pad)), x = c.getContext('2d');
  const cx = c.width / 2, cy = c.height / 2;
  x.beginPath(); x.ellipse(cx, cy, Math.max(0.5, ra), Math.max(0.5, rc), 0, 0, Math.PI * 2);
  if (shading) {
    let g;
    if (radial) {
      g = x.createRadialGradient(cx - ra * 0.3, cy - rc * 0.35, 0, cx, cy, Math.max(ra, rc));
      g.addColorStop(0, shade(fill, 0.45)); g.addColorStop(0.55, fill); g.addColorStop(1, shade(fill, -0.35));
    } else {
      g = x.createLinearGradient(0, cy - rc, 0, cy + rc);
      g.addColorStop(0, shade(fill, topLight ? -0.1 : -0.3)); g.addColorStop(topLight ? 0.3 : 0.5, shade(fill, 0.35)); g.addColorStop(1, shade(fill, -0.4));
    }
    x.fillStyle = g;
  } else x.fillStyle = fill;
  x.fill();
  if (outline > 0) { x.lineWidth = outline; x.strokeStyle = outlineColor; x.stroke(); }
  return c;
}

/* ---------- speed in seconds ----------
   period = seconds per cycle. With p.fit ("loop cleanly") the cycles are rounded to whole numbers that fit the
   frame range exactly; if a single cycle is longer than the range, the range (and project) is lengthened. */
export const speedFields = (p, { label = 'Seconds per cycle', min = 0.1, max = 20, step = 0.05 } = {}) => [
  { key: 'period', label, type: 'range', min, max, step, value: p.period, unit: ' s', title: 'Bigger = slower' },
  { key: 'fit', label: 'Loop cleanly (adjust the length)', type: 'checkbox', value: p.fit,
    title: 'Fit whole cycles into the frames (speed adjusts slightly); a cycle longer than the project lengthens it' },
];
export function loopTiming(p, doc, period = p.period) {
  const [f0, f1] = frameRange(p, doc);
  const fps = doc.fps, sec = (f1 - f0 + 1) / fps, per = Math.max(0.02, period || 1);
  if (!p.fit) return { f0, f1, cycles: sec / per };
  // whole cycles in the same frames (the speed shifts slightly); only a cycle longer than the range needs more frames
  const cycles = Math.round(sec / per);
  if (cycles >= 1) return { f0, f1, cycles };
  return { f0, f1: f0 + Math.max(1, Math.round(per * fps)) - 1, cycles: 1 };
}
