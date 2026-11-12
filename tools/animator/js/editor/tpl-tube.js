// Tube / rope / snake / string template, in 3D.
// The tube lies along a direction D (heading + tilt), its wave moves along W (a direction around D,
// set by "twist"), and a camera (tilted down by "camera angle", with perspective) turns it into a picture.
// Segments get an animated Depth so the group can draw near segments over far ones as the tube turns.
import { clamp } from './state.js';
import { register, RAD, r2, newGroup, layerFrom, centreAt, bake, keyFrames, unwrap, timeFields, ovalCanvas, loopTiming, speedFields } from './tpl-core.js';

const DEF = {
  name: 'Tube', segments: 16, length: 900, thickHead: 60, thickTail: 24, roundness: 70,
  heading: 0, elevation: 0, twist: 0, camera: 0, perspective: 30,
  style: 'solid', shape: 'oval', customArt: null,
  fill: '#5f9e4f', outlineColor: '#1d2a18', outlineWidth: 5, shading: true,
  motion: 'slither', amplitude: 35, waves: 1.2, bendAngle: 60, anchor: 'tail',
  swing: 280, vibration: 30, harmonic: 1, decay: 50,
  period: 1, fit: true, segmentGroups: true, from: 1, to: 0, keyEvery: 2,
  turn: 'auto',
};

/* ---------- 3D maths ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };

/* World axes: x right, y up, z toward the viewer.
   D = direction from tail to head; U = "up" around the tube; S = sideways; W = wave direction. */
export function basis(p) {
  const th = p.heading * RAD, ph = p.elevation * RAD;
  const D = [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
  let U = add([0, 1, 0], mul(D, -D[1]));
  if (Math.hypot(...U) < 1e-3) U = add([0, 0, 1], mul(D, -D[2]));
  U = norm(U);
  const S = cross(D, U), rho = p.twist * RAD;
  return { D, U, S, W: add(mul(U, Math.cos(rho)), mul(S, Math.sin(rho))) };
}
/* camera: tilt the world toward the viewer by the camera angle (90° = looking straight down) */
export function toCamera(P, p) {
  const a = p.camera * RAD, c = Math.cos(a), s = Math.sin(a);
  return [P[0], P[1] * c - P[2] * s, P[1] * s + P[2] * c];
}
const camDist = p => p.length * (0.75 + 10 * (1 - clamp(p.perspective, 0, 100) / 100) ** 2);

/* Bent spine in the tube's own plane (slither / bend): [{ u, w }] with u along the body from the head. */
function planeSpine(p, tau) {
  const n = p.segments, L = p.length, ds = L / (n - 1), theta = new Float64Array(n - 1);
  if (p.motion === 'slither') {
    const A = p.amplitude * RAD;
    for (let j = 0; j < n - 1; j++) theta[j] = A * Math.sin(2 * Math.PI * (p.waves * (j + 0.5) / (n - 1) - p.cycles * tau));
    const mean = theta.reduce((a, b) => a + b, 0) / (n - 1);
    for (let j = 0; j < n - 1; j++) theta[j] -= mean;
  } else if (p.motion === 'bend') {
    const B = p.bendAngle * RAD * Math.sin(2 * Math.PI * p.cycles * tau), sa = { head: 0, middle: 0.5 }[p.anchor] ?? 1;
    for (let j = 0; j < n - 1; j++) theta[j] = B * ((j + 0.5) / (n - 1) - sa);
  }
  const pts = [{ u: 0, w: 0 }];
  for (let j = 0; j < n - 1; j++) pts.push({ u: pts[j].u + ds * Math.cos(theta[j]), w: pts[j].w + ds * Math.sin(theta[j]) });
  let du, dw;
  if (p.motion === 'bend') {
    const sa = { head: 0, middle: 0.5 }[p.anchor] ?? 1, k = sa * (n - 1), i0 = Math.min(n - 2, Math.floor(k)), t = k - i0, a = pts[i0], b = pts[i0 + 1];
    du = sa * L - (a.u + (b.u - a.u) * t); dw = -(a.w + (b.w - a.w) * t);
  } else { du = L / 2 - pts.reduce((s, q) => s + q.u, 0) / n; dw = -pts.reduce((s, q) => s + q.w, 0) / n; }
  return pts.map(q => ({ u: q.u + du, w: q.w + dw }));
}

/* 3D points of the spine at animation time tau (0..1), centred on the origin, head at +D·L/2. */
export function spine3D(p, tau) {
  const { D, U, S, W } = basis(p), n = p.segments, L = p.length;
  const at = (u, disp) => add(mul(D, L / 2 - u), disp);
  if (p.motion === 'rope') {
    // ends stay put; the middle swings round the line between them (like a skipping rope)
    const a = p.twist * RAD + 2 * Math.PI * p.cycles * tau, dir = add(mul(U, Math.cos(a)), mul(S, Math.sin(a)));
    return Array.from({ length: n }, (_, i) => { const s = i / (n - 1); return at(s * L, mul(dir, p.swing * Math.sin(Math.PI * s))); });
  }
  if (p.motion === 'string') {
    // standing wave between fixed ends that fades away (a plucked string)
    const amp = p.vibration * Math.cos(2 * Math.PI * p.cycles * tau) * Math.exp(-3 * (p.decay / 100) * tau);
    return Array.from({ length: n }, (_, i) => { const s = i / (n - 1); return at(s * L, mul(W, amp * Math.sin(Math.PI * p.harmonic * s))); });
  }
  return planeSpine(p, tau).map(q => at(q.u, mul(W, q.w)));
}

/* picture points (relative to the picture centre) with perspective size s and depth z (bigger = nearer) */
export function projectAll(p, pts) {
  const Dc = camDist(p);
  return pts.map(P => {
    const [x, y, z] = toCamera(P, p);
    const s = Dc / Math.max(Dc * 0.08, Dc - z);
    return { x: x * s, y: -y * s, s, z };
  });
}

function headAngles(q) {
  return q.map((_, i) => { const a = q[Math.max(0, i - 1)], b = q[Math.min(q.length - 1, i + 1)]; return Math.atan2(a.y - b.y, a.x - b.x) / RAD; });
}

function timing(p, doc) { return loopTiming(p, doc); }

function build(doc, p, art) {
  const { f0, f1, cycles } = timing(p, doc);
  p = { ...p, cycles };
  const n = p.segments, ds = p.length / (n - 1);
  const restP = { ...p, motion: p.motion === 'rope' || p.motion === 'string' ? p.motion : 'none' };
  const tau0 = 0;
  const rest = projectAll(p, spine3D(p.motion === 'rope' || p.motion === 'string' ? p : restP, tau0));
  // place the starting pose in the middle of the picture
  const xs = rest.map(q => q.x), ys = rest.map(q => q.y);
  const ox = doc.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2, oy = doc.height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  const g = newGroup(doc, p.name);
  g.sortByDepth = true;
  g.outline = p.style === 'solid' && p.outlineWidth > 0 ? { width: p.outlineWidth, color: p.outlineColor } : null;
  const segs = [], fRest = [];
  for (let i = 0; i < n; i++) {
    const r = p.thickHead + (p.thickTail - p.thickHead) * (i / (n - 1)), si = rest[i].s, rc = r * si;
    // how much of the tube's length shows across the picture here (0 = pointing straight at you)
    const a = rest[Math.max(0, i - 1)], b = rest[Math.min(n - 1, i + 1)];
    const span = (Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * ds * si;
    const f = clamp(Math.hypot(a.x - b.x, a.y - b.y) / (span || 1), 0, 1);
    fRest[i] = f;
    let ra = rc * (1 - f) + rc * p.roundness / 100 * f;
    if (p.style === 'solid') ra = Math.max(ra, ds * si * 1.4 * f);
    let pic;
    if (art) {
      const aspect = art.width / art.height;
      pic = document.createElement('canvas'); pic.width = Math.ceil(2 * rc * aspect + 4); pic.height = Math.ceil(2 * rc + 4);
      pic.getContext('2d').drawImage(art, 2, 2, pic.width - 4, pic.height - 4);
    } else {
      pic = ovalCanvas(ra, rc, { fill: p.fill, shading: p.shading, radial: f < 0.35, outline: p.style === 'separate' ? p.outlineWidth : 0, outlineColor: p.outlineColor, topLight: p.camera < 45 });
    }
    const label = i === 0 ? 'Segment 1 (head)' : i === n - 1 ? `Segment ${n} (tail)` : `Segment ${i + 1}`;
    const L = layerFrom(doc, p.segmentGroups ? label + ' art' : label, pic);
    if (p.segmentGroups) {
      // the group carries the motion; its picture sits centred on the group's pivot (the middle of the canvas),
      // so anything drawn into the group around the segment moves with it and has room on every side
      const sg = newGroup(doc, label);
      sg.pivot = { x: doc.width / 2, y: doc.height / 2 };
      sg.expanded = false;
      L.tag = 'segment-art';
      L.base.x = r2(doc.width / 2 - L.pivot.x); L.base.y = r2(doc.height / 2 - L.pivot.y);
      sg.children = [L];
      segs.push(sg);
    } else segs.push(L);
  }
  const animated = p.motion !== 'none';
  const frames = animated ? keyFrames(f0, f1, p.keyEvery) : [f0];
  // Each segment turns to follow the body's direction on screen, which is what keeps a long oval lying along the body.
  // A tube that points at the camera is built from round segments (nothing to line up), and the body direction on screen
  // is then just the side-to-side wobble, flipping left and right: the segments, and anything drawn into them, would spin
  // for no reason. So by default a segment only turns as much as it is drawn long. 'turn' always follows; 'never' never does.
  const prevRot = new Array(n).fill(null), baseRot = new Array(n).fill(null);
  const turnMode = ['turn', 'auto', 'never'].includes(p.turn) ? p.turn : 'auto';
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const vals = segs.map(() => ({ x: [], y: [], rotation: [], scaleX: [], scaleY: [], depth: [] }));
  for (const fr of frames) {
    const tau = f1 > f0 ? (fr - f0) / (f1 - f0 + 1) : 0;    // the frame after the last equals the first: loops cleanly
    const q = projectAll(p, spine3D(animated ? p : restP, tau)), ang = headAngles(q);
    q.forEach((pt, i) => {
      const L = segs[i], k = pt.s / rest[i].s * 100;
      const c = L.isGroup ? { x: r2(ox + pt.x - doc.width / 2), y: r2(oy + pt.y - doc.height / 2) } : centreAt(L, ox + pt.x, oy + pt.y);
      // how much of the body's length shows across the picture at this segment right now (0 = pointing at you)
      const na = q[Math.max(0, i - 1)], nb = q[Math.min(n - 1, i + 1)];
      const seen = clamp(Math.hypot(na.x - nb.x, na.y - nb.y) / ((Math.min(n - 1, i + 1) - Math.max(0, i - 1)) * ds * pt.s || 1), 0, 1);
      if (turnMode === 'turn' || seen > 0.12 || prevRot[i] == null) prevRot[i] = unwrap(prevRot[i], ang[i]);   // end-on, the angle is noise: keep the last good one
      if (baseRot[i] == null) baseRot[i] = prevRot[i];
      const rot = turnMode === 'turn' ? prevRot[i] : turnMode === 'never' ? baseRot[i] : baseRot[i] + smooth((fRest[i] - 0.15) / 0.45) * (prevRot[i] - baseRot[i]);
      const v = vals[i];
      v.x.push(c.x); v.y.push(c.y); v.rotation.push(rot); v.scaleX.push(k); v.scaleY.push(k); v.depth.push(pt.z);
    });
  }
  segs.forEach((L, i) => { for (const prop in vals[i]) bake(L, prop, frames, vals[i][prop]); });
  g.children = segs.reverse();          // tail at the bottom of the stack, head on top (ties in depth keep this order)
  const xsAll = rest.map(q => q.x + ox), ysAll = rest.map(q => q.y + oy);
  g.pivot = { x: r2((Math.min(...xsAll) + Math.max(...xsAll)) / 2), y: r2((Math.min(...ysAll) + Math.max(...ysAll)) / 2) };
  return g;
}

function fields(p, ctx) {
  const shapeOpts = [['oval', 'Ovals']];
  if (ctx.haveLayerArt) shapeOpts.push(['layer', 'My drawing (the selected layer)']);
  if (ctx.editing && p.customArt) shapeOpts.push(['custom', 'Keep the drawing used before']);
  const m = p.motion;
  return [
    { key: 'name', label: 'Name', type: 'text', value: p.name },
    { key: 'heading', label: 'Heading', type: 'range', min: -180, max: 180, value: p.heading, unit: '°', title: 'Which way the head points: 0 = right, 90 = toward you, 180 = left, -90 = away' },
    { key: 'elevation', label: 'Tilt up / down', type: 'range', min: -89, max: 89, value: p.elevation, unit: '°' },
    { key: 'twist', label: 'Wave direction', type: 'range', min: -180, max: 180, value: p.twist, unit: '°', title: 'Around the tube: 0 = waves go up and down, 90 = side to side' },
    { key: 'camera', label: 'Camera angle', type: 'range', min: -30, max: 90, value: p.camera, unit: '°', title: '0 = level, 90 = looking straight down' },
    { key: 'perspective', label: 'Perspective', type: 'range', min: 0, max: 100, value: p.perspective, unit: '%' },
    { key: 'motion', label: 'Motion', type: 'select', value: m, options: [['slither', 'Slither (wave travels along it)'], ['bend', 'Bend (swings back and forth)'], ['rope', 'Jump rope (swings round, ends fixed)'], ['string', 'Plucked string (vibrates, ends fixed)'], ['none', 'None (just build it)']] },
    { key: 'amplitude', label: 'Slither strength', type: 'range', min: 0, max: 80, value: p.amplitude, unit: '°' },
    { key: 'waves', label: 'Waves along it', type: 'range', min: 0.25, max: 4, step: 0.05, value: p.waves },
    { key: 'bendAngle', label: 'Bend amount', type: 'range', min: 0, max: 360, value: p.bendAngle, unit: '°' },
    { key: 'anchor', label: 'Bend from', type: 'select', value: p.anchor, options: [['tail', 'Tail end stays put'], ['head', 'Head end stays put'], ['middle', 'Middle stays put']] },
    { key: 'swing', label: 'Rope swing size', type: 'range', min: 10, max: 1000, value: p.swing, unit: 'px' },
    { key: 'vibration', label: 'String vibration', type: 'range', min: 1, max: 200, value: p.vibration, unit: 'px' },
    { key: 'harmonic', label: 'String harmonic', type: 'range', min: 1, max: 6, value: p.harmonic },
    { key: 'decay', label: 'String fade-out', type: 'range', min: 0, max: 100, value: p.decay, unit: '%' },
    ...speedFields(p, { min: 0.05 }),
    { key: 'segments', label: 'Segments', type: 'range', min: 3, max: 80, value: p.segments },
    { key: 'length', label: 'Length', type: 'range', min: 100, max: 3000, step: 10, value: p.length, unit: 'px' },
    { key: 'thickHead', label: 'Thickness at head', type: 'range', min: 1, max: 400, value: p.thickHead, unit: 'px' },
    { key: 'thickTail', label: 'Thickness at tail', type: 'range', min: 1, max: 400, value: p.thickTail, unit: 'px' },
    { key: 'turn', label: 'Segments turn', type: 'select', value: p.turn, options: [['auto', 'With the body, but not round segments (pointing at you)'], ['turn', 'Always with the body'], ['never', 'Never (they keep their starting angle)']], title: 'Each segment turns to follow the body. When the tube points at the camera its segments are round and the turning is only a spin, so by default they turn only as much as they are drawn long.' },
    { key: 'roundness', label: 'Segment roundness', type: 'range', min: 20, max: 150, value: p.roundness, unit: '%' },
    { key: 'style', label: 'Look', type: 'select', value: p.style, options: [['solid', 'Solid tube (segments blend together)'], ['separate', 'Separate segments']] },
    { key: 'shape', label: 'Segment shape', type: 'select', value: ctx.editing && p.shape === 'custom' && p.customArt ? 'custom' : 'oval', options: shapeOpts },
    { key: 'fill', label: 'Colour', type: 'color', value: p.fill },
    { key: 'shading', label: 'Shading', type: 'checkbox', value: p.shading },
    { key: 'outlineColor', label: 'Outline colour', type: 'color', value: p.outlineColor },
    { key: 'outlineWidth', label: 'Outline width', type: 'range', min: 0, max: 30, value: p.outlineWidth, unit: 'px' },
    { key: 'segmentGroups', label: 'Each segment in its own group', type: 'checkbox', value: p.segmentGroups, title: 'Put legs, spikes, eyes… inside a segment’s group and they move with it' },
    ...timeFields(p, ctx.doc),
  ];
}

/* Drag on the preview: left/right = heading, up/down = tilt, Shift = wave direction, Alt = camera angle. */
function drag(p, dx, dy, e) {
  if (e.shiftKey) return { twist: wrap(p.twist + dx * 0.6) };
  if (e.altKey) return { camera: clamp(Math.round(p.camera + dy * 0.4), -30, 90) };
  return { heading: wrap(p.heading - dx * 0.6), elevation: clamp(Math.round(p.elevation - dy * 0.4), -89, 89) };
}
const wrap = a => Math.round((((a + 180) % 360) + 360) % 360 - 180);

/* Little 3D compass in the preview: where the head points and which way the wave goes. */
function overlay(x, p, w, h) {
  const { D, W } = basis(p), c = [44, h - 44], len = 30;
  const pr = v => { const [a, b] = toCamera(v, p); return [c[0] + a * len, c[1] - b * len]; };
  x.save();
  x.lineWidth = 1; x.strokeStyle = '#0003'; x.fillStyle = '#ffffffcc';
  x.beginPath(); x.arc(c[0], c[1], 38, 0, Math.PI * 2); x.fill(); x.stroke();
  // ground grid (the floor the tube stands on)
  x.strokeStyle = '#0002';
  for (let k = -1; k <= 1; k += 0.5) {
    const a1 = pr([k, -0.6, -1]), a2 = pr([k, -0.6, 1]), b1 = pr([-1, -0.6, k]), b2 = pr([1, -0.6, k]);
    x.beginPath(); x.moveTo(...a1); x.lineTo(...a2); x.moveTo(...b1); x.lineTo(...b2); x.stroke();
  }
  const arrow = (v, col, label) => {
    const [ex, ey] = pr(v), [, , z] = toCamera(v, p);
    x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 3;
    x.beginPath(); x.moveTo(...c); x.lineTo(ex, ey); x.stroke();
    x.beginPath(); x.arc(ex, ey, 3 + 2 * Math.max(0, z), 0, Math.PI * 2); x.fill();
    x.font = '11px system-ui'; x.fillText(label, ex + 5, ey - 4);
  };
  if (p.motion !== 'rope') arrow(W, '#0a84ff', 'wave');
  arrow(D, '#e8590c', 'head');
  x.restore();
}

register({
  id: 'tube', name: 'Tube / rope / snake', icon: '🐍', defaults: DEF, fields, build, timing, drag, overlay, usesArt: true,
  blurb: 'A chain of segments in 3D: snakes, tails, tentacles, ropes, strings.',
  hint: 'Drag the preview to aim the tube · Shift-drag: wave direction · Alt-drag: camera angle',
  presets: [
    { label: 'Snake (side)', values: { name: 'Snake', heading: 0, elevation: 0, twist: 0, camera: 0, perspective: 30, motion: 'slither', segments: 16, length: 900, thickHead: 60, thickTail: 24, period: 1, keyEvery: 2 } },
    { label: 'Snake (top-down)', values: { name: 'Snake', heading: 0, elevation: 0, twist: 90, camera: 90, perspective: 20, motion: 'slither', segments: 16, length: 900, thickHead: 60, thickTail: 24, period: 1, keyEvery: 2 } },
    { label: 'Snake (front-on)', values: { name: 'Snake', heading: 90, elevation: 0, twist: 90, camera: 38, perspective: 60, motion: 'slither', segments: 22, length: 1300, thickHead: 70, thickTail: 22, period: 1, keyEvery: 2 } },
    { label: '¾ view', values: { heading: 35, elevation: 0, twist: 90, camera: 25, perspective: 45 } },
    { label: 'Jump rope', values: { name: 'Jump rope', heading: 0, elevation: 0, twist: 0, camera: 12, perspective: 35, motion: 'rope', swing: 300, segments: 32, length: 1000, thickHead: 9, thickTail: 9, period: 1, keyEvery: 1, fill: '#c0392b', outlineWidth: 2, outlineColor: '#4a1010' } },
    { label: 'Guitar string', values: { name: 'String', heading: 0, elevation: 0, twist: 0, camera: 0, perspective: 0, motion: 'string', vibration: 45, harmonic: 1, decay: 60, segments: 48, length: 1400, thickHead: 4, thickTail: 4, period: 0.15, keyEvery: 1, fill: '#d4b06a', shading: false, outlineWidth: 0 } },
    { label: 'Tail / tentacle', values: { name: 'Tail', heading: 0, elevation: 0, twist: 0, camera: 0, perspective: 20, motion: 'bend', anchor: 'tail', bendAngle: 70, segments: 14, length: 600, thickHead: 12, thickTail: 50, period: 1, keyEvery: 2 } },
  ],
});
