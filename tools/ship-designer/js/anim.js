// Animation: clips with keyframes, like a small Blockbench / Blender.
// A CLIP ("Open hatch", "Engines idle") has a length, a way of playing (once, loop, back and forth) and TRACKS. A TRACK moves one thing -
// a hall, a gadget, a group of halls or the whole ship - about a PIVOT, and has three channels of keyframes: Move, Rotate and Size.
// Each key is {t, v: [x, y, z], ease}; between keys the value is interpolated with the ease of the key it leaves.
// The engine only works out matrices: for every moving thing, how far it has moved from where it was built (a "delta" in ship space).
import * as THREE from 'three';
import { newId } from './util.js';
import { attMatrix, branchOf } from './ship.js';

const { Vector3, Matrix4, Euler, Quaternion } = THREE;

export const CHANNELS = {
  pos: { label: 'Move', unit: 'm', def: [0, 0, 0], step: 0.05 },
  rot: { label: 'Rotate', unit: '°', def: [0, 0, 0], step: 5 },
  scl: { label: 'Size', unit: '×', def: [1, 1, 1], step: 0.05 },
};
export const EASES = { smooth: 'Smooth', linear: 'Straight line', step: 'Hold, then jump' };
export const MODES = { once: 'Once (open / close)', loop: 'Repeat', pingpong: 'Back and forth' };

export const newKey = (t, v, ease = 'smooth') => ({ t: Math.round(t * 1000) / 1000, v: [...v], ease });
export const newTrack = (target, over = {}) => ({ id: newId('t'), target: { type: target.type, id: target.id || null }, pivot: [0, 0, 0], pos: [], rot: [], scl: [], ...over });
export const newClip = (over = {}) => ({ id: newId('n'), name: 'Clip', dur: 2, mode: 'once', speed: 1, auto: false, tracks: [], ...over });

/** the value of a channel at time t */
export function evalChannel(keys, t, def) {
  if (!keys.length) return [...def];
  if (t <= keys[0].t) return [...keys[0].v];
  const last = keys[keys.length - 1];
  if (t >= last.t) return [...last.v];
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  if (a.ease === 'step') return [...a.v];
  const k = (t - a.t) / Math.max(b.t - a.t, 1e-6), e = a.ease === 'linear' ? k : k * k * (3 - 2 * k);
  return a.v.map((x, j) => x + (b.v[j] - x) * e);
}
export const trackValue = (track, ch, t) => evalChannel(track[ch], t, CHANNELS[ch].def);

/** set one component of a channel at time t (adding a key there if there is none): what typing into the pose boxes does */
export function setKeyAt(track, ch, t, comp, value, snap = 0.02) {
  const keys = track[ch];
  if (!keys.length && t > snap) keys.push(newKey(0, CHANNELS[ch].def));       // the first key after the start: it moves from how the thing was built, not from the key's own value
  let k = keys.find(x => Math.abs(x.t - t) < snap);
  if (!k) { k = newKey(t, evalChannel(keys, t, CHANNELS[ch].def)); keys.push(k); keys.sort((a, b) => a.t - b.t); }
  k.v[comp] = value;
  return k;
}

/** older ships: one-shot "swing / slide / spin" animations become clips */
export function normalizeAnims(list) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a) continue;
    if (a.tracks) {
      out.push({ ...newClip(), ...a, tracks: a.tracks.map(t => ({ ...newTrack(t.target || { type: 'ship' }), ...t, pivot: [...(t.pivot || [0, 0, 0])], pos: (t.pos || []).map(k => ({ ease: 'smooth', ...k })), rot: (t.rot || []).map(k => ({ ease: 'smooth', ...k })), scl: (t.scl || []).map(k => ({ ease: 'smooth', ...k })) })) });
      continue;
    }
    if (!a.target) continue;
    const ax = a.axis || [1, 0, 0], tr = newTrack(a.target, { pivot: [...(a.pivot || [0, 0, 0])] });
    let dur = Math.max(a.dur || 1.6, 0.2);
    if (a.kind === 'slide') { tr.pos = [newKey(0, [0, 0, 0]), newKey(dur, ax.map(v => v * (a.amount || 0)))]; }
    else if (a.kind === 'spin') { dur = 360 / Math.max(Math.abs(a.speed || 180), 1); const sg = Math.sign(a.speed || 1); tr.rot = [newKey(0, [0, 0, 0], 'linear'), newKey(dur, ax.map(v => v * 360 * sg), 'linear')]; }
    else tr.rot = [newKey(0, [0, 0, 0]), newKey(dur, ax.map(v => v * (a.amount || 0)))];
    out.push(newClip({ id: a.id, name: a.name || 'Animation', dur, mode: a.kind === 'spin' ? 'loop' : a.loop ? 'pingpong' : 'once', auto: !!a.auto, tracks: [tr] }));
  }
  return out;
}

/** the halls, gadgets and (maybe) whole ship a track moves */
export function moversOf(ship, target) {
  const halls = new Set(), atts = new Set();
  let whole = false;
  const t = target || {};
  if (t.type === 'ship') whole = true;
  else if (t.type === 'hall') halls.add(t.id);
  else if (t.type === 'group') ship.halls.filter(h => h.group === t.id).forEach(h => branchOf(ship, h.id).forEach(x => halls.add(x.id)));
  else if (t.type === 'att') atts.add(t.id);
  if (!whole) for (const a of ship.atts) if (halls.has(a.hall)) atts.add(a.id);          // gadgets and windows on a moving hall go with it
  return { halls, atts, whole };
}

/** the frame a track's pivot is given in (a hall's or gadget's own axes; the ship for a group or the whole ship), as a matrix to ship space */
export function frameOf(ship, worlds, target) {
  const t = target || {};
  if (t.type === 'hall') return worlds.get(t.id)?.clone() || new Matrix4();
  if (t.type === 'att') {
    const att = ship.atts.find(a => a.id === t.id);
    if (!att) return new Matrix4();
    const W = (att.hall && worlds.get(att.hall)) || new Matrix4();
    return W.clone().multiply(attMatrix({ ...att, s: 1 }, 'gadget'));
  }
  return new Matrix4();
}

/** the running state of every clip: where its playhead is and which way it is playing (+1 forward, -1 back, 0 stopped) */
export class AnimState {
  constructor() { this.m = new Map(); }

  get(id) {
    let s = this.m.get(id);
    if (!s) { s = { t: 0, dir: 0 }; this.m.set(id, s); }
    return s;
  }

  /** open (or running)? */
  isOn(clip) {
    const s = this.get(clip.id);
    return clip.mode === 'once' ? s.dir > 0 || (s.dir === 0 && s.t >= clip.dur - 1e-6) : s.dir !== 0;
  }

  toggle(clip) {
    const s = this.get(clip.id);
    if (clip.mode === 'once') s.dir = this.isOn(clip) ? -1 : 1;
    else s.dir = s.dir ? 0 : 1;
  }

  set(clip, on) { if (this.isOn(clip) !== !!on) this.toggle(clip); }

  /** put the playhead somewhere and stop */
  seek(clip, t) { const s = this.get(clip.id); s.t = Math.min(Math.max(t, 0), clip.dur); s.dir = 0; }

  play(clip, dir = 1) { const s = this.get(clip.id); if (dir > 0 && clip.mode === 'once' && s.t >= clip.dur - 1e-6) s.t = 0; s.dir = dir; }

  reset() { this.m.clear(); }

  busy(clips) { return clips.some(c => this.get(c.id).dir !== 0); }

  step(clips, dt) {
    for (const c of clips) {
      const s = this.get(c.id);
      if (!s.dir) continue;
      const dur = Math.max(c.dur, 0.05);
      s.t += s.dir * dt * (c.speed || 1);
      if (c.mode === 'loop') { s.t = ((s.t % dur) + dur) % dur; }
      else if (c.mode === 'pingpong') { if (s.t >= dur) { s.t = dur - (s.t - dur); s.dir = -1; } else if (s.t <= 0) { s.t = -s.t; s.dir = 1; } s.t = Math.min(Math.max(s.t, 0), dur); }
      else if (s.t >= dur) { s.t = dur; s.dir = 0; }
      else if (s.t <= 0) { s.t = 0; s.dir = 0; }
    }
  }
}

const _e = new Euler(), _q = new Quaternion();

/** how far a track has moved the thing at time t: a matrix in ship space */
export function trackDelta(ship, worlds, track, t) {
  const F = frameOf(ship, worlds, track.target);
  const p = trackValue(track, 'pos', t), r = trackValue(track, 'rot', t), s = trackValue(track, 'scl', t), pv = track.pivot;
  const M = new Matrix4().makeTranslation(pv[0] + p[0], pv[1] + p[1], pv[2] + p[2])
    .multiply(new Matrix4().makeRotationFromQuaternion(_q.setFromEuler(_e.set(THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[1]), THREE.MathUtils.degToRad(r[2]), 'XYZ'))))
    .multiply(new Matrix4().makeScale(s[0], s[1], s[2]))
    .multiply(new Matrix4().makeTranslation(-pv[0], -pv[1], -pv[2]));
  return F.clone().multiply(M).multiply(F.clone().invert());
}

const isRest = (track, t) => ['pos', 'rot', 'scl'].every(ch => trackValue(track, ch, t).every((v, i) => Math.abs(v - CHANNELS[ch].def[i]) < 1e-6));

/** for every moving thing ('h:<hall>', 'a:<gadget>', 'ship'), how far it has moved: a matrix in ship space */
export function computeDeltas(ship, worlds, clips, state) {
  const out = new Map();
  for (const c of clips) {
    const t = state.get(c.id).t;
    for (const tr of c.tracks) {
      if (isRest(tr, t)) continue;
      const D = trackDelta(ship, worlds, tr, t), m = moversOf(ship, tr.target);
      const put = k => out.set(k, out.has(k) ? D.clone().multiply(out.get(k)) : D.clone());
      if (m.whole) put('ship');
      m.halls.forEach(h => put('h:' + h));
      m.atts.forEach(x => put('a:' + x));
    }
  }
  return out;
}

/** everything the clips could move (to know what to split off the merged hull) */
export function movingKeys(ship, clips) {
  const halls = new Set(), atts = new Set();
  let whole = false;
  for (const c of clips) for (const tr of c.tracks) { const m = moversOf(ship, tr.target); m.halls.forEach(h => halls.add(h)); m.atts.forEach(x => atts.add(x)); whole = whole || m.whole; }
  return { halls, atts, whole };
}

// ------------------------------------------------------------------ presets
/** pivot (in the thing's own frame) for "hinged on this edge" of a box {min, max}; the axis is the way the hinge pin points */
export function hingeAt(side, box) {
  const c = box.min.clone().add(box.max).multiplyScalar(0.5);
  const p = c.clone();
  let axis = [1, 0, 0];
  if (side === 'back') { p.z = box.min.z; p.y = box.min.y; }
  else if (side === 'front') { p.z = box.max.z; p.y = box.min.y; }
  else if (side === 'left') { p.x = box.min.x; p.y = box.min.y; axis = [0, 0, 1]; }
  else if (side === 'right') { p.x = box.max.x; p.y = box.min.y; axis = [0, 0, 1]; }
  else if (side === 'top') { p.y = box.max.y; p.z = box.min.z; }
  else if (side === 'bottom') { p.y = box.min.y; p.z = box.min.z; }
  return { pivot: p.toArray().map(v => Math.round(v * 1000) / 1000), axis };
}

export const PRESETS = {
  hinge: 'Hatch or flap (swings open)',
  slide: 'Sliding door',
  spin: 'Spinning part (rotor, turret)',
  pulse: 'Pulse (grows and shrinks)',
  empty: 'Empty clip',
};

/** a ready-made clip for a target: `box` is the target's bounding box in its own frame (halls), `centre` a ship-space point (groups, ship) */
export function presetClip(kind, target, { box = null, centre = null, name = '' } = {}) {
  const tr = newTrack(target);
  const c = box ? box.min.clone().add(box.max).multiplyScalar(0.5) : new Vector3();
  if (centre) tr.pivot = centre.toArray();
  else if (box) tr.pivot = [c.x, box.min.y, box.min.z].map(v => Math.round(v * 1000) / 1000);
  const clip = newClip({ name: name || 'New clip', tracks: kind === 'empty' ? [] : [tr] });
  if (kind === 'hinge') { clip.name = name || 'Open'; clip.dur = 1.6; tr.rot = [newKey(0, [0, 0, 0]), newKey(1.6, [-75, 0, 0])]; }
  else if (kind === 'slide') { clip.name = name || 'Slide open'; clip.dur = 1.4; tr.pivot = box ? c.toArray() : tr.pivot; tr.pos = [newKey(0, [0, 0, 0]), newKey(1.4, [1.5, 0, 0])]; }
  else if (kind === 'spin') { clip.name = name || 'Spin'; clip.dur = 1; clip.mode = 'loop'; clip.auto = true; tr.pivot = box ? c.toArray() : tr.pivot; tr.rot = [newKey(0, [0, 0, 0], 'linear'), newKey(1, [0, 0, 360], 'linear')]; }
  else if (kind === 'pulse') { clip.name = name || 'Pulse'; clip.dur = 1.2; clip.mode = 'pingpong'; tr.pivot = box ? c.toArray() : tr.pivot; tr.scl = [newKey(0, [1, 1, 1]), newKey(1.2, [1.25, 1.25, 1.25])]; }
  return clip;
}
