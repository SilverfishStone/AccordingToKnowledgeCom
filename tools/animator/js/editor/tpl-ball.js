// Bouncing ball with squash and stretch, plus a shadow that shrinks and fades as the ball rises.
import { register, r2, newGroup, layerFrom, bake, keyFrames, timeFields, frameRange, ovalCanvas, speedFields } from './tpl-core.js';

const DEF = {
  name: 'Bouncing ball', size: 120, fill: '#e8590c', outlineColor: '#5a1e00', outlineWidth: 4, shading: true,
  height: 500, bounces: 3, keep: 70, travel: 1100, squash: 30, shadow: true,
  period: 0.8, fit: true, from: 1, to: 0, keyEvery: 1,
};
/* a real ball: each bounce's time grows with the square root of its height; period = seconds of the first bounce */
function timing(p, doc) {
  const [f0] = frameRange(p, doc), k = p.keep / 100, B = Math.max(1, Math.round(p.bounces));
  let total = 0;
  for (let j = 0; j < B; j++) total += Math.sqrt(k ** j);
  const f1 = f0 + Math.max(1, Math.round(total * p.period * doc.fps)) - 1;
  return { f0, f1: p.fit ? f1 : Math.min(doc.frames - 1, f1) };
}

function build(doc, p) {
  const { f0, f1 } = timing(p, doc), N = f1 - f0 + 1, r = p.size / 2, ground = doc.height * 0.8;
  // each bounce is lower (keep %) and, like a real ball, shorter in time (∝ √height)
  const k = p.keep / 100, B = Math.max(1, Math.round(p.bounces));
  const hts = Array.from({ length: B }, (_, j) => p.height * k ** j);
  const w = hts.map(h => Math.sqrt(Math.max(h, 1))), wsum = w.reduce((a, b) => a + b, 0);
  const dur = w.map(x => x / wsum * N), starts = dur.map((_, j) => dur.slice(0, j).reduce((a, b) => a + b, 0));
  const contacts = [...starts, N];
  const state = t => {               // t in frames from f0
    let j = 0;
    while (j < B - 1 && t >= starts[j + 1]) j++;
    const u = Math.min(1, Math.max(0, (t - starts[j]) / dur[j]));
    const h = hts[j] * 4 * u * (1 - u);
    const near = Math.min(...contacts.map(c => Math.abs(t - c)));        // frames to the nearest ground contact
    const sq = (p.squash / 100) * Math.exp(-(near * near) / 0.8);        // squash at contact
    const st = (p.squash / 100) * 0.5 * Math.abs(1 - 2 * u) ** 3 * (1 - Math.exp(-(near * near) / 0.8)) * (hts[j] / p.height); // stretch when fast
    return { h, sx: 100 * (1 + sq * 0.8 - st * 0.5), sy: 100 * (1 - sq + st) };
  };
  const g = newGroup(doc, p.name);
  const ballPic = ovalCanvas(r, r, { fill: p.fill, shading: p.shading, radial: true, outline: p.outlineWidth, outlineColor: p.outlineColor });
  const ball = layerFrom(doc, 'Ball', ballPic);
  ball.pivot = { x: ballPic.width / 2, y: ballPic.height / 2 + r };          // squash from the bottom of the ball
  const shPic = ovalCanvas(r * 1.1, r * 0.22, { fill: '#000000', shading: false });
  const shadow = layerFrom(doc, 'Shadow', shPic);
  const frames = keyFrames(f0, f1, p.keyEvery);
  const v = { bx: [], by: [], sx: [], sy: [], hx: [], hs: [], ho: [] };
  const x0 = doc.width / 2 - p.travel / 2;
  for (const f of frames) {
    const t = f - f0, s = state(t), x = x0 + p.travel * (t / N);
    v.bx.push(x - ball.pivot.x); v.by.push(ground - s.h - ball.pivot.y); v.sx.push(s.sx); v.sy.push(s.sy);
    const lift = Math.min(1, s.h / Math.max(1, p.height));
    v.hx.push(x - shadow.pivot.x); v.hs.push(100 * (1 - 0.5 * lift)); v.ho.push(45 * (1 - 0.6 * lift));
  }
  bake(ball, 'x', frames, v.bx); bake(ball, 'y', frames, v.by); bake(ball, 'scaleX', frames, v.sx); bake(ball, 'scaleY', frames, v.sy);
  bake(shadow, 'x', frames, v.hx); bake(shadow, 'scaleX', frames, v.hs); bake(shadow, 'scaleY', frames, v.hs); bake(shadow, 'opacity', frames, v.ho);
  shadow.base.y = r2(ground - shadow.pivot.y);
  g.children = p.shadow ? [shadow, ball] : [ball];
  g.pivot = { x: doc.width / 2, y: ground };
  return g;
}

const fields = (p, ctx) => [
  { key: 'name', label: 'Name', type: 'text', value: p.name },
  { key: 'size', label: 'Ball size', type: 'range', min: 10, max: 600, value: p.size, unit: 'px' },
  { key: 'height', label: 'Bounce height', type: 'range', min: 20, max: 1000, value: p.height, unit: 'px' },
  { key: 'bounces', label: 'Bounces', type: 'range', min: 1, max: 12, value: p.bounces },
  { key: 'keep', label: 'Height kept each bounce', type: 'range', min: 20, max: 100, value: p.keep, unit: '%', title: '100% = bounces forever (loops cleanly)' },
  { key: 'travel', label: 'Travel across', type: 'range', min: 0, max: 3000, step: 10, value: p.travel, unit: 'px' },
  ...speedFields(p, { label: 'Seconds for the first bounce', min: 0.1, max: 6 }),
  { key: 'squash', label: 'Squash and stretch', type: 'range', min: 0, max: 70, value: p.squash, unit: '%' },
  { key: 'shadow', label: 'Shadow', type: 'checkbox', value: p.shadow },
  { key: 'fill', label: 'Colour', type: 'color', value: p.fill },
  { key: 'shading', label: 'Shading', type: 'checkbox', value: p.shading },
  { key: 'outlineColor', label: 'Outline colour', type: 'color', value: p.outlineColor },
  { key: 'outlineWidth', label: 'Outline width', type: 'range', min: 0, max: 20, value: p.outlineWidth, unit: 'px' },
  ...timeFields(p, ctx.doc),
];

register({
  id: 'ball', name: 'Bouncing ball', icon: '🏀', defaults: DEF, fields, build, timing,
  blurb: 'Classic squash-and-stretch bounce with a shadow.',
  presets: [
    { label: 'Bouncing in place', values: { travel: 0, keep: 100, bounces: 2 } },
    { label: 'Dropped ball', values: { travel: 1100, keep: 65, bounces: 4 } },
    { label: 'Heavy ball', values: { size: 220, height: 300, keep: 40, squash: 12, fill: '#4a4e57', outlineColor: '#15171a' } },
    { label: 'Rubber ball', values: { size: 90, height: 700, keep: 85, squash: 50, fill: '#e64980', outlineColor: '#5c0f30' } },
  ],
});
