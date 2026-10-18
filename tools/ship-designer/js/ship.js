// Ship data model + the maths that places halls, ports and gadgets.
// Everything in a hall is in its own local frame: X = width, Y = height (up), Z = length (nose is +Z). Metres.
import * as THREE from 'three';
import { newId } from './util.js';
import { linkPlacement } from './bridge.js';
import { normalizeAnims } from './anim.js';
import { newFx } from './fx.js';

const { Vector3, Matrix4, Quaternion, Euler, MathUtils } = THREE;

export const SHAPES = { box: 'Box room', tube: 'Tube', prism: 'Prism', sphere: 'Sphere', profile: 'Custom profile' };
export const CONN_TYPES = { doorway: 'Open doorway', door: 'Door', hatch: 'Hatch', airlock: 'Air lock', fuse: 'Fused (no tunnel: rooms that overlap)' };
export const FACES = { '-z': 'Rear end', '+z': 'Front end', '-x': 'Left side', '+x': 'Right side', '+y': 'Top', '-y': 'Bottom' };
export const CONN_PRESETS = {
  doorway: { round: false, w: 1.4, h: 2.0, len: 1.2 },
  door: { round: false, w: 1.3, h: 2.0, len: 1.2 },
  hatch: { round: true, w: 1.1, h: 1.1, len: 1.0 },
  airlock: { round: true, w: 1.7, h: 1.7, len: 2.6 },
  fuse: { round: false, w: 1.4, h: 2.0, len: 0 },
};
export const HALL_DEFAULTS = {
  box: { w: 4, h: 3, l: 8, sides: 4 },
  tube: { w: 3, h: 3, l: 12, sides: 32 },
  prism: { w: 4, h: 4, l: 10, sides: 6 },
  sphere: { w: 8, h: 8, l: 8, sides: 24 },
  profile: { w: 4, h: 4, l: 10, sides: 32 },
};

export const defaultSlot = kind => kind === 'int'
  ? { color: '#cfd5de', tex: '', tile: 3, metal: 0.15, rough: 0.7, glow: 0, opacity: 1 }
  : kind === 'frame'
    ? { color: '#d9a93a', tex: '', tile: 1, metal: 0.4, rough: 0.5, glow: 0, opacity: 1 }
    : { color: '#9aa4b4', tex: '', tile: 3, metal: 0.6, rough: 0.45, glow: 0, opacity: 1 };

export function newLight(type = 'point', over = {}) {
  const sun = type === 'sun';
  return {
    id: newId('l'), type, name: sun ? 'Sun' : 'Lamp', color: sun ? '#fff4e6' : '#ffb98a', intensity: sun ? 1.9 : 30,
    az: 35, el: 50, hall: null, p: [0, 0, 0], reach: 0, shadows: sun ? false : true, flicker: 0, speed: 1, hidden: false, ...over,
  };
}

/** a key light + a cool back light, like the old fixed rig - delete them for a pitch-dark scene */
export const defaultLights = () => [
  newLight('sun', { name: 'Sun', shadows: true }),
  newLight('sun', { name: 'Back light', color: '#8fa8ff', intensity: 0.5, az: -145, el: 20 }),
];

export function newShip() {
  return { name: 'Untitled Ship', wall: 0.18, halls: [], atts: [], bridges: [], groups: [], anims: [], views: [], lights: defaultLights(), ambient: { env: 1, hemi: 0.35 } };
}

export function newHall(shape, over = {}) {
  const d = HALL_DEFAULTS[shape];
  const names = { box: 'Room', tube: 'Tube', prism: 'Prism hall', sphere: 'Sphere hall', profile: 'Shaped hall' };
  return {
    id: newId('h'), name: names[shape], shape, sides: d.sides, w: d.w, h: d.h, l: d.l, sf: 1, sb: 1, ay: 0,
    wall: null, hollow: true, deck: false, deckY: 0.6, hidden: false, openF: false, openB: false,
    tear: { f: 0, b: 0, seed: 1 }, profile: null, pkind: 'round', bulkheads: [], trim: { axis: '', pos: 0, keep: 'above' }, trim2: { axis: '', pos: 0, keep: 'above' },
    frame: { inSpacing: 0, inWidth: 0.14, inDepth: 0.28, outLongs: 0, outHoops: 0, thick: 0.07 }, rib: defaultSlot('frame'),
    ext: defaultSlot('ext'), int: defaultSlot('int'), floor: defaultSlot('int'), deckFill: false,
    xf: { p: [0, 0, 0], r: [0, 0, 0] }, conn: null, ...over,
  };
}

export function newConn(type, parent, p, n, face = '-z') {
  return { v: 2, parent, p: [...p], n: [...n], face, roll: 0, type, open: 1, style: 'builtin:plain', params: {}, morph: 0, doorStyle: '', sill: 'auto', ...CONN_PRESETS[type], mat: defaultSlot('frame') };
}

/** a wing / scaffold / truss between two halls: anchors are {hall, u, ang} (see bridge.js) */
export function newBridge(kind, a, b, over = {}) {
  const d = { wing: { chordA: 4, chordB: 2, thick: 0.16, thickB: 0.1, taper: 0.6 }, ladder: { chordA: 3, chordB: 3, thick: 0.1, thickB: 0.1, taper: 1 }, truss: { chordA: 1.4, chordB: 1.4, thick: 0.1, thickB: 0.1, taper: 1 } }[kind] || {};
  return { id: newId('b'), name: { wing: 'Wing', ladder: 'Scaffolding', truss: 'Truss' }[kind] || 'Bridge', kind, a: { ...a }, b: { ...b }, sweep: 0, embed: 0.02, manual: false, bays: 6, rad: kind === 'truss' ? 0.06 : 0.05, rails: 3, sides: 3, hidden: false, mat: defaultSlot('ext'), ...d, ...over };
}

export function newAtt(part, hall, p, n, name = '', variant = '') {
  return { id: newId('a'), name, part, variant, glass: 0.28, hall, p: [...p], n: [...n], spin: 0, tx: 0, tz: 0, s: 1, paint: { mode: 'none', color: '#ffffff', tex: '', tile: 1 }, hidden: false };
}

export const wallOf = (ship, hall) => hall.wall ?? ship.wall;

export function xfMatrix(xf) {
  const q = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(xf.r[0]), MathUtils.degToRad(xf.r[1]), MathUtils.degToRad(xf.r[2]), 'XYZ'));
  return new Matrix4().compose(new Vector3(...xf.p), q, new Vector3(1, 1, 1));
}

/** world matrix -> {p, r} (degrees) */
export function matrixToXf(m) {
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(p, q, s);
  const e = new Euler().setFromQuaternion(q, 'XYZ');
  return { p: [p.x, p.y, p.z], r: [MathUtils.radToDeg(e.x), MathUtils.radToDeg(e.y), MathUtils.radToDeg(e.z)] };
}

/** the frame of a port, in the parent hall's space: P = point, n = outward normal, t1/t2 = in-plane axes (t1 x t2 = n) */
export function portFrame(c) {
  const n = new Vector3(...c.n).normalize();
  const up = Math.abs(n.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const t1 = new Vector3().crossVectors(up, n).normalize();
  const t2 = new Vector3().crossVectors(n, t1);
  const a = MathUtils.degToRad(c.roll || 0), ca = Math.cos(a), sa = Math.sin(a);
  return {
    P: new Vector3(...c.p), n,
    t1: t1.clone().multiplyScalar(ca).addScaledVector(t2, sa),
    t2: t2.clone().multiplyScalar(ca).addScaledVector(t1, -sa),
  };
}

export function faceInfo(hall, face) {
  const sgn = face[0] === '+' ? 1 : -1, ax = face[1];
  const nf = new Vector3(ax === 'x' ? sgn : 0, ax === 'y' ? sgn : 0, ax === 'z' ? sgn : 0);
  const half = ax === 'x' ? hall.w / 2 : ax === 'y' ? hall.h / 2 : hall.l / 2;
  return { nf, cf: nf.clone().multiplyScalar(half), uc: ax === 'y' ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0) };
}

/** child-local -> parent-local: the chosen face of the child sits `len` out from the port, facing back at the parent */
export function childMatrix(hall, c) {
  const fr = portFrame(c), fi = faceInfo(hall, c.face);
  const rc = new Vector3().crossVectors(fi.uc, fi.nf).normalize();
  // v2 connections keep the child's own 'up' aligned with the opening's up (the old way turned side rooms upside-down)
  const A = c.v >= 2 ? new Matrix4().makeBasis(fr.t1.clone().negate(), fr.t2, fr.n.clone().negate()) : new Matrix4().makeBasis(fr.t1, fr.t2.clone().negate(), fr.n.clone().negate());
  const C = new Matrix4().makeBasis(rc, fi.uc, fi.nf);
  const R = A.multiply(C.clone().transpose());
  const pos = fr.P.clone().addScaledVector(fr.n, c.len).sub(fi.cf.clone().applyMatrix4(R));
  return R.setPosition(pos);
}

/** Map id -> hall-local -> ship matrix */
export function computeWorlds(ship) {
  const byId = new Map(ship.halls.map(h => [h.id, h]));
  const W = new Map();
  const rec = (h, depth) => {
    if (W.has(h.id)) return W.get(h.id);
    let m;
    const par = h.conn && byId.get(h.conn.parent);
    if (h.link && depth < 64 && byId.get(h.link.a.hall) && byId.get(h.link.b.hall)) {        // a hall laid between two halls: it follows both of them
      rec(byId.get(h.link.a.hall), depth + 1); rec(byId.get(h.link.b.hall), depth + 1);
      const pl = linkPlacement(ship, W, h);
      if (pl) { h.l = pl.length; m = pl.matrix; }
    }
    if (m) { /* placed by its link */ }
    else if (par && depth < 64) m = rec(par, depth + 1).clone().multiply(h.conn.type === 'fuse' && h.conn.rel ? xfMatrix(h.conn.rel) : childMatrix(h, h.conn));      // fused halls keep their own position relative to the parent
    else m = xfMatrix(h.xf);
    W.set(h.id, m);
    return m;
  };
  ship.halls.forEach(h => rec(h, 0));
  return W;
}

/** matrix of the tunnel frame of a connection (origin = port point, +Z = out of the parent, X/Y = t1/t2), in ship space */
export function tunnelMatrix(parentWorld, c) {
  const fr = portFrame(c);
  return parentWorld.clone().multiply(new Matrix4().makeBasis(fr.t1, fr.t2, fr.n).setPosition(fr.P));
}

/**
 * Where a gadget / hull piece sits: its +Y points out of the surface. Sideways it depends on `mode`:
 *  - 'gadget' (default): +Z faces the ship's nose (so turrets and consoles point forward)
 *  - 'hull'   (windows):  +X runs along the ship (so a "wide" window is wide along the hull)
 *  - 'upright' (wall-mounted pieces like racks and panels): +Z is up, whichever wall they are on
 */
export function attMatrix(att, mode = 'gadget') {
  if (mode === true) mode = 'hull';
  const n = new Vector3(...att.n).normalize();
  let X, Z;
  if (mode === 'upright' && Math.abs(n.y) < 0.9) {
    Z = new Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    X = new Vector3().crossVectors(n, Z);
  } else {
    const f = new Vector3(0, 0, 1);
    if (Math.abs(f.dot(n)) > 0.9) f.set(0, 1, 0);
    f.addScaledVector(n, -f.dot(n)).normalize();
    X = mode === 'hull' ? f : new Vector3().crossVectors(n, f);
    Z = mode === 'hull' ? new Vector3().crossVectors(f, n) : f;
  }
  const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(X, n, Z));
  q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(att.spin || 0)));
  q.multiply(new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(att.tx || 0), 0, MathUtils.degToRad(att.tz || 0))));
  return new Matrix4().compose(new Vector3(...att.p), q, new Vector3(att.s, att.s, att.s));
}

export function childrenOf(ship, id) {
  return ship.halls.filter(h => h.conn && h.conn.parent === id);
}

/** the hall and every hall attached (directly or not) below it */
export function branchOf(ship, id) {
  const out = [], seen = new Set();
  const walk = hid => {
    if (seen.has(hid)) return;
    seen.add(hid);
    const h = ship.halls.find(x => x.id === hid);
    if (!h) return;
    out.push(h);
    childrenOf(ship, hid).forEach(c => walk(c.id));
  };
  walk(id);
  return out;
}

/** make a loaded/old ship safe to use */
export function normalizeShip(s) {
  const base = newShip();
  const ship = { ...base, ...s };
  ship.halls = (s.halls || []).map(h => {
    const hall = { ...newHall(h.shape in HALL_DEFAULTS ? h.shape : 'tube'), ...h };
    hall.tear = { f: 0, b: 0, seed: 1, ...(h.tear || {}) };
    hall.trim = { axis: '', pos: 0, keep: 'above', ...(h.trim || {}) };
    hall.trim2 = { axis: '', pos: 0, keep: 'above', ...(h.trim2 || {}) };
    hall.frame = { inSpacing: 0, inWidth: 0.14, inDepth: 0.28, outLongs: 0, outHoops: 0, thick: 0.07, ...(h.frame || {}) };
    hall.rib = { ...defaultSlot('frame'), ...(h.rib || {}) };
    hall.bulkheads = (h.bulkheads || []).map(b => ({ z: 0, th: 0.25, hole: { kind: 'none', w: 1.4, h: 2, x: 0, y: 0 }, ...b, hole: { kind: 'none', w: 1.4, h: 2, x: 0, y: 0, ...(b.hole || {}) } }));
    hall.ext = { ...defaultSlot('ext'), ...(h.ext || {}) };
    hall.int = { ...defaultSlot('int'), ...(h.int || {}) };
    hall.floor = { ...defaultSlot('int'), ...(h.floor || h.int || {}) };           // the deck has its own paint (older ships: it starts out looking like the inside)
    hall.xf = { p: [0, 0, 0], r: [0, 0, 0], ...(h.xf || {}) };
    hall.fx = h.fx ? newFx(h.fx) : null;
    if (h.conn) hall.conn = { ...newConn(h.conn.type || 'doorway', h.conn.parent, h.conn.p, h.conn.n), ...h.conn, v: h.conn.v ?? 1, mat: { ...defaultSlot('frame'), ...(h.conn.mat || {}) } };
    return hall;
  });
  ship.atts = (s.atts || []).map(a => ({ ...newAtt(a.part, a.hall, a.p || [0, 0, 0], a.n || [0, 1, 0]), ...a, fx: a.fx ? newFx(a.fx) : null }));
  ship.anims = normalizeAnims(s.anims);
  ship.bridges = (s.bridges || []).filter(b => b?.a && b?.b).map(b => ({ ...newBridge(b.kind || 'wing', b.a, b.b), ...b, taper: b.taper ?? (b.thick > 0 && b.thickB > 0 ? b.thickB / b.thick : 1), embed: b.embed === 0.3 ? 0.02 : (b.embed ?? 0.02), mat: { ...defaultSlot('ext'), ...(b.mat || {}) } }));
  ship.groups = (s.groups || []).filter(g => g?.id);
  ship.views = s.views || [];
  ship.lights = Array.isArray(s.lights) ? s.lights.map(l => ({ ...newLight(l.type || 'point'), ...l })) : defaultLights();
  ship.ambient = { env: 1, hemi: 0.35, ...(s.ambient || {}) };
  return ship;
}

/** the planes (in the hall's own axes) that slice a hall: [{axis:'x'|'y'|'z', pos, keep:'above'|'below'}] */
export function trimsOf(hall) { return [hall.trim, hall.trim2].filter(t => t?.axis); }

/** is a hall-local point on the kept side of every slicing plane? */
export function trimKeeps(hall, p) {
  return trimsOf(hall).every(t => { const d = (p.x ?? p[0]) * (t.axis === 'x') + (p.y ?? p[1]) * (t.axis === 'y') + (p.z ?? p[2]) * (t.axis === 'z') - t.pos; return t.keep === 'below' ? d <= 0 : d >= 0; });
}
