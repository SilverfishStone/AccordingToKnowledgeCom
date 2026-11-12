// Ready-made motions for the selected layer or group. They are baked into ordinary keyframes on top of
// where the layer is now (its values at the start frame), so they can be edited afterwards.
import { app, el, clamp, emit, requestRender } from './state.js';
import { beginMeta, commitMeta } from './history.js';
import { saveProps, restoreProps } from './doc.js';
import { dialog, form, toast } from './ui.js';
import { play, stop, setMode, setFrame } from './timeline.js';
import { rng, keyFrames, r2 } from './tpl-core.js';

const TAU = Math.PI * 2;
const easeOut = t => 1 - (1 - t) ** 3;
/* Each motion: which properties it keys, what Strength means, and either
   at(base, t, P, i) for smooth sampled motion, or keys(base, P) → { prop: [[t, value, ease], …] } for a few eased keys. */
export const MOTIONS = {
  bob:      { name: 'Bob (float up and down)', props: ['y'], unit: 'px', def: 40, max: 600, at: (b, t, P) => ({ y: b.y - P.strength * Math.sin(TAU * P.cycles * t) }) },
  pulse:    { name: 'Pulse (grow and shrink)', props: ['scaleX', 'scaleY'], unit: '%', def: 15, max: 100,
    at: (b, t, P) => { const k = 1 + P.strength / 100 * Math.sin(TAU * P.cycles * t) ** 2; return { scaleX: b.scaleX * k, scaleY: b.scaleY * k }; } },
  spin:     { name: 'Spin (one cycle = one turn)', props: ['rotation'], unit: '', def: 0, max: 0, noStrength: true,
    at: (b, t, P) => ({ rotation: b.rotation + (P.direction === 'ccw' ? -360 : 360) * P.cycles * t }) },
  wobble:   { name: 'Wobble (rock side to side)', props: ['rotation'], unit: '°', def: 12, max: 180, at: (b, t, P) => ({ rotation: b.rotation + P.strength * Math.sin(TAU * P.cycles * t) }) },
  pendulum: { name: 'Pendulum swing (around the pivot)', props: ['rotation'], unit: '°', def: 30, max: 180,
    at: (b, t, P) => ({ rotation: b.rotation + P.strength * Math.sin(TAU * P.cycles * t) * Math.exp(-3 * P.damping / 100 * t) }) },
  shake:    { name: 'Shake', props: ['x', 'y'], unit: 'px', def: 10, max: 200,
    at: (b, t, P, i, rand) => { const k = P.strength * (1 - P.damping / 100 * t); return { x: b.x + (rand() * 2 - 1) * k, y: b.y + (rand() * 2 - 1) * k }; } },
  bounce:   { name: 'Bounce down into place', props: ['y'], unit: 'px', def: 300, max: 1500,
    at: (b, t, P) => {
      // fall from Strength above, then bounces that lose height, ending in place
      const n = Math.max(1, Math.round(P.count)), keep = 0.45, hs = [1], ws = [1];
      for (let j = 1; j <= n; j++) { hs.push(keep ** j); ws.push(2 * Math.sqrt(keep ** j)); }
      const tot = ws.reduce((a, c) => a + c, 0);
      let u = t * tot, j = 0;
      while (j < ws.length - 1 && u > ws[j]) { u -= ws[j]; j++; }
      const s = Math.min(1, u / ws[j]);
      const h = j === 0 ? 1 - s * s : hs[j] * 4 * s * (1 - s);
      return { y: b.y - P.strength * h };
    } },
  fadeIn:   { name: 'Fade in', props: ['opacity'], noStrength: true, keys: b => ({ opacity: [[0, 0, 'linear'], [1, b.opacity, 'linear']] }) },
  fadeOut:  { name: 'Fade out', props: ['opacity'], noStrength: true, keys: b => ({ opacity: [[0, b.opacity, 'linear'], [1, 0, 'linear']] }) },
  popIn:    { name: 'Pop in (overshoot)', props: ['scaleX', 'scaleY'], unit: '%', def: 15, max: 80,
    keys: (b, P) => { const o = 1 + P.strength / 100; return { scaleX: [[0, 0, 'out'], [0.65, b.scaleX * o, 'inout'], [1, b.scaleX, 'linear']], scaleY: [[0, 0, 'out'], [0.65, b.scaleY * o, 'inout'], [1, b.scaleY, 'linear']] }; } },
  slideIn:  { name: 'Slide in from off-screen', props: ['x', 'y'], noStrength: true,
    keys: (b, P) => {
      const d = app.doc, dx = P.direction === 'left' ? -d.width : P.direction === 'right' ? d.width : 0, dy = P.direction === 'top' ? -d.height : P.direction === 'bottom' ? d.height : 0;
      return { x: [[0, b.x + dx, 'out'], [1, b.x, 'linear']], y: [[0, b.y + dy, 'out'], [1, b.y, 'linear']] };
    } },
};

/* Put motion P on layer L (replacing that property's keys inside the frame range). */
const ONE_SHOT = ['bounce', 'fadeIn', 'fadeOut', 'popIn', 'slideIn'];
/* frame range and number of cycles; with "loop cleanly" the cycles are whole and the end frame moves to fit them */
export function motionTiming(P, d) {
  const f0 = clamp(Math.round(P.from) - 1, 0, d.frames - 1), f1 = clamp(Math.round(P.to) - 1, f0, d.frames - 1);
  if (ONE_SHOT.includes(P.motion)) return { f0, f1, cycles: 1 };
  const sec = (f1 - f0 + 1) / d.fps, per = Math.max(0.05, P.period);
  if (!P.fit) return { f0, f1, cycles: sec / per };
  const cycles = Math.round(sec / per);
  if (cycles >= 1) return { f0, f1, cycles };
  return { f0, f1: f0 + Math.max(1, Math.round(per * d.fps)) - 1, cycles: 1 };
}
function apply(L, P) {
  const M = MOTIONS[P.motion], d = app.doc, t = motionTiming(P, d), f0 = t.f0, f1 = t.f1;
  P = { ...P, cycles: t.cycles };
  const base = {};
  for (const k of M.props) base[k] = L.value(k, f0);
  const out = {};
  if (M.keys) {
    const ks = M.keys(base, P);
    for (const k in ks) out[k] = ks[k].map(([t, v, ease]) => ({ f: Math.round(f0 + t * (f1 - f0)), v: r2(v), ease }));
  } else {
    const frames = keyFrames(f0, f1, P.keyEvery), rand = rng(17), loops = !ONE_SHOT.includes(P.motion) && P.motion !== 'shake';
    for (const k of M.props) out[k] = [];
    frames.forEach((f, i) => {
      // looping motions: the frame after the last equals the first; one-shot motions end exactly at t = 1
      const t = f1 > f0 ? (f - f0) / (f1 - f0 + (loops ? 1 : 0)) : 0;
      const v = M.at(base, t, P, i, rand);
      for (const k of M.props) out[k].push({ f, v: r2(v[k]), ease: 'linear' });
    });
  }
  for (const k in out) {
    const kept = (L.tracks[k] || []).filter(key => key.f < f0 || key.f > f1);
    L.tracks[k] = [...kept, ...out[k]].sort((a, b) => a.f - b.f);
  }
}

export async function motionDialog() {
  const L = app.doc.active;
  if (!L) return toast('Select a layer or group first');
  if (L.locked) return toast(`"${L.name}" is locked`);
  const props = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];
  const saved = saveProps(L, props), before = beginMeta();
  const d = app.doc, frames0 = d.frames;
  const hint = el('div', { class: 'muted' }), info = el('div', { class: 'muted' });
  const f = form([
    { key: 'motion', label: 'Motion', type: 'select', value: 'bob', options: Object.entries(MOTIONS).map(([k, m]) => [k, m.name]) },
    { key: 'strength', label: 'Strength', type: 'range', min: 0, max: 600, value: 40 },
    { key: 'period', label: 'Seconds per cycle', type: 'range', min: 0.1, max: 20, step: 0.05, value: 1, unit: ' s', title: 'Bigger = slower' },
    { key: 'fit', label: 'Loop cleanly (adjust the length)', type: 'checkbox', value: true },
    { key: 'count', label: 'Bounces', type: 'range', min: 1, max: 8, value: 3 },
    { key: 'damping', label: 'Dies down', type: 'range', min: 0, max: 100, value: 0, unit: '%' },
    { key: 'direction', label: 'Direction', type: 'select', value: 'left', options: [['left', 'From the left'], ['right', 'From the right'], ['top', 'From the top'], ['bottom', 'From the bottom'], ['cw', 'Clockwise (spin)'], ['ccw', 'Anticlockwise (spin)']] },
    { key: 'from', label: 'From frame', type: 'number', min: 1, max: d.frames, value: 1 },
    { key: 'to', label: 'To frame', type: 'number', min: 1, max: d.frames, value: d.frames },
    { key: 'keyEvery', label: 'Keyframe every', type: 'range', min: 1, max: 8, value: 2, unit: ' fr' },
  ], (v, key) => {
    if (key === 'motion') {
      const M = MOTIONS[v.motion], s = f.node.querySelector('[id^="f_strength_"]');
      if (!M.noStrength) { s.max = M.max; v.strength = M.def; s.value = M.def; s.nextElementSibling.textContent = M.def; }
    }
    update();
  });
  const v = f.values;
  const update = () => {
    const M = MOTIONS[v.motion];
    hint.textContent = M.noStrength ? (v.motion === 'spin' ? 'Seconds per cycle = seconds per turn.' : 'This motion fills the frame range; Strength is not used.') : `Strength is in ${M.unit === '°' ? 'degrees' : M.unit === '%' ? 'percent' : 'pixels'}.`
      + (v.motion === 'pendulum' ? ' Swings around the layer’s pivot (move it with the Move tool).' : '');
    restoreProps(L, saved);
    const P = { ...v, from: clamp(+v.from || 1, 1, frames0), to: clamp(+v.to || frames0, 1, frames0) };
    d.frames = frames0;
    const need = motionTiming(P, { frames: 2000, fps: d.fps }).f1 + 1;
    if (need > frames0) d.frames = Math.min(2000, need);
    apply(L, P);
    info.textContent = d.frames !== frames0 ? `Project lengthened to ${d.frames} frames so a whole cycle fits.` : '';
    emit('change');
    emit('props'); requestRender();
  };
  update();
  setMode('animate');
  setFrame(clamp(+v.from - 1, 0, d.frames - 1));
  play();
  const ok = await dialog({ title: `Add a motion to “${L.name}”`, content: el('div', {}, f.node, hint, info), buttons: [['Cancel', null], ['Apply', 'ok']], light: true });
  stop();
  if (!ok) { restoreProps(L, saved); d.frames = frames0; app.frame = Math.min(app.frame, d.frames - 1); emit('change'); requestRender(); return; }
  commitMeta(before, `Motion: ${MOTIONS[v.motion].name}`);
  toast('Motion added as keyframes');
}
