// Particles: falling snow, rain, confetti, rising bubbles, twinkling sparkles. Loops cleanly.
// Each particle is its own tiny layer; when one leaves the picture it jumps (a 'hold' key) back to the start.
import { makeCanvas } from './state.js';
import { register, r2, rng, shade, newGroup, layerFrom, bake, keyFrames, timeFields, loopTiming, speedFields } from './tpl-core.js';

const DEF = {
  name: 'Snow', kind: 'snow', count: 60, size: 12, period: 2, fit: true, wind: 0, sway: 30, color: '#ffffff', seed: 1,
  from: 1, to: 0, keyEvery: 2,
};
const CONFETTI = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac', '#ffa94d'];

function picture(kind, size, color, rand) {
  if (kind === 'rain') {
    const c = makeCanvas(Math.max(2, size * 0.25), size * 3), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, color + '00'); g.addColorStop(1, color);
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  if (kind === 'confetti') {
    const c = makeCanvas(size, size * 0.6), x = c.getContext('2d');
    x.fillStyle = CONFETTI[Math.floor(rand() * CONFETTI.length)]; x.fillRect(0, 0, c.width, c.height);
    return c;
  }
  if (kind === 'sparkle') {
    const c = makeCanvas(size * 2, size * 2), x = c.getContext('2d'), m = size;
    const g = x.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, color + '00');
    x.fillStyle = g;
    x.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? m * 0.22 : m; x.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); }
    x.closePath(); x.fill();
    return c;
  }
  const c = makeCanvas(size + 4, size + 4), x = c.getContext('2d'), m = c.width / 2, r = size / 2;
  if (kind === 'bubbles') {
    x.lineWidth = Math.max(1, size * 0.08); x.strokeStyle = color + 'cc'; x.fillStyle = color + '22';
    x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#ffffffcc'; x.beginPath(); x.arc(m - r * 0.35, m - r * 0.35, r * 0.2, 0, Math.PI * 2); x.fill();
    return c;
  }
  const g = x.createRadialGradient(m, m, 0, m, m, r);           // snow: soft dot
  g.addColorStop(0, color); g.addColorStop(0.6, shade(color, -0.03) + 'dd'); g.addColorStop(1, color + '00');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, r, 0, Math.PI * 2); x.fill();
  return c;
}

function build(doc, p) {
  const { f0, f1, cycles } = loopTiming(p, doc), W = doc.width, H = doc.height, rand = rng(p.seed * 7919 + 13);
  const frames = keyFrames(f0, f1, p.keyEvery), N = f1 - f0 + 1;
  const g = newGroup(doc, p.name), kids = [];
  const count = Math.max(1, Math.min(400, Math.round(p.count)));
  for (let i = 0; i < count; i++) {
    const depth = 0.45 + rand() * 0.55;                         // far particles are smaller and slower
    const size = Math.max(2, p.size * depth);
    const L = layerFrom(doc, `${p.kind} ${i + 1}`, picture(p.kind, size, p.color, rand));
    const margin = Math.max(L.canvas.width, L.canvas.height) * 2;
    const x0 = rand() * (W + 2 * margin) - margin, phase = rand(), swayPh = rand(), spin = (rand() < 0.5 ? -1 : 1) * (1 + Math.round(rand() * 2));
    const passes = cycles * (depth < 0.7 ? 1 : 1 + Math.round(rand()));   // near ones go faster; whole numbers so it loops
    const xs = [], ys = [], rot = [], sx = [], op = [], sc = [], holds = new Set();
    let prevFrac = null;
    frames.forEach((f, k) => {
      const tau = (f - f0) / N;
      if (p.kind === 'sparkle') {
        const tw = 0.5 + 0.5 * Math.sin(2 * Math.PI * (cycles * 2 * tau + phase));
        xs.push(x0); ys.push(phase * (H + margin * 2) - margin); op.push(100 * tw * tw); sc.push(60 + 60 * tw);
        return;
      }
      const frac = (phase + passes * tau) % 1;
      if (prevFrac != null && frac < prevFrac) holds.add(k - 1);     // left the picture: jump back without sliding across
      prevFrac = frac;
      const travel = H + 2 * margin;
      const y = p.kind === 'bubbles' ? H + margin - frac * travel : frac * travel - margin;
      const sway = p.kind === 'rain' ? 0 : p.sway * depth * Math.sin(2 * Math.PI * (2 * tau + swayPh));
      xs.push(x0 + p.wind * frac + sway); ys.push(y);
      if (p.kind === 'confetti') { rot.push(spin * 360 * 2 * tau); sx.push(100 * Math.cos(2 * Math.PI * (3 * tau + phase))); }
    });
    // positions are for the picture's centre
    bake(L, 'x', frames, xs.map(v => v - L.pivot.x), { holds });
    bake(L, 'y', frames, ys.map(v => v - L.pivot.y), { holds });
    if (p.kind === 'confetti') { bake(L, 'rotation', frames, rot, { holds }); bake(L, 'scaleX', frames, sx, { holds }); }
    if (p.kind === 'rain') L.base.rotation = r2(-Math.atan2(p.wind, H) * 180 / Math.PI);
    if (p.kind === 'sparkle') { bake(L, 'opacity', frames, op); bake(L, 'scaleX', frames, sc); bake(L, 'scaleY', frames, sc); }
    if (p.kind === 'snow' || p.kind === 'bubbles') L.base.opacity = r2(55 + 45 * depth);
    L.base.depth = r2(depth * 100);
    kids.push(L);
  }
  g.sortByDepth = true;              // near (bigger) particles in front
  g.children = kids;
  return g;
}

const fields = (p, ctx) => [
  { key: 'name', label: 'Name', type: 'text', value: p.name },
  { key: 'kind', label: 'Kind', type: 'select', value: p.kind, options: [['snow', 'Snow'], ['rain', 'Rain'], ['confetti', 'Confetti'], ['bubbles', 'Bubbles (rise)'], ['sparkle', 'Sparkles (twinkle)']] },
  { key: 'count', label: 'How many', type: 'range', min: 1, max: 400, value: p.count },
  { key: 'size', label: 'Size', type: 'range', min: 2, max: 120, value: p.size, unit: 'px' },
  ...speedFields(p, { label: 'Seconds to cross the picture', min: 0.2, max: 20 }),
  { key: 'wind', label: 'Wind', type: 'range', min: -1500, max: 1500, step: 10, value: p.wind, unit: 'px' },
  { key: 'sway', label: 'Sway', type: 'range', min: 0, max: 200, value: p.sway, unit: 'px' },
  { key: 'color', label: 'Colour', type: 'color', value: p.color },
  { key: 'seed', label: 'Variation', type: 'range', min: 1, max: 99, value: p.seed, title: 'Pick another number for a different random arrangement' },
  ...timeFields(p, ctx.doc),
];

register({
  id: 'particles', name: 'Particles', icon: '❄️', defaults: DEF, fields, build, timing: (p, doc) => loopTiming(p, doc),
  blurb: 'Falling snow, rain, confetti, rising bubbles or sparkles that loop.',
  presets: [
    { label: 'Snow', values: { name: 'Snow', kind: 'snow', count: 70, size: 12, period: 2, wind: 150, sway: 30, color: '#ffffff', keyEvery: 2 } },
    { label: 'Rain', values: { name: 'Rain', kind: 'rain', count: 120, size: 14, period: 0.5, wind: 200, sway: 0, color: '#9ec5fe', keyEvery: 1 } },
    { label: 'Confetti', values: { name: 'Confetti', kind: 'confetti', count: 80, size: 16, period: 2.5, wind: 0, sway: 60, keyEvery: 2 } },
    { label: 'Bubbles', values: { name: 'Bubbles', kind: 'bubbles', count: 30, size: 40, period: 3, wind: 0, sway: 40, color: '#a5d8ff', keyEvery: 2 } },
    { label: 'Sparkles', values: { name: 'Sparkles', kind: 'sparkle', count: 40, size: 24, period: 1.5, color: '#ffe066', keyEvery: 2 } },
  ],
});
