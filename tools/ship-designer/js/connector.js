// Connectors: the neck that joins two halls. It is generated, not modelled: its cross-section morphs from the opening
// in the parent's wall to the face of the child hall (round <-> rectangular, small <-> large), and a style adds
// flares, rings or bellows along its length. Styles are plain numbers (resources/connectors/*.connector.json) or an
// imported model that is stretched and resized to fit.
import * as THREE from 'three';
import { lib } from './assets.js';
import { wallOf, tunnelMatrix } from './ship.js';
import { morphLoft } from './geo.js';

const { Vector3, BufferGeometry, Float32BufferAttribute, MathUtils } = THREE;

export const DEFAULT_PARAMS = { flare: 0, flareLen: 0.3, ribs: 0, ribSize: 0.08, ribWidth: 0.08, bellows: 0, bellowsDepth: 0.08 };
export const PARAM_SPECS = [
  ['flare', 'Flare (blend into hull)', 0, 1.5, 0.05, 'm'],
  ['flareLen', 'Flare length', 0.05, 0.5, 0.01, ''],
  ['ribs', 'Rings', 0, 12, 1, ''],
  ['ribSize', 'Ring height', 0.02, 0.4, 0.01, 'm'],
  ['bellows', 'Bellows folds', 0, 12, 1, ''],
  ['bellowsDepth', 'Fold depth', 0.02, 0.4, 0.01, 'm'],
];

export const styleOf = c => lib.connectors.get(c.style) || lib.connectors.get('builtin:plain');
export const paramsOf = c => ({ ...DEFAULT_PARAMS, ...(styleOf(c)?.params || {}), ...(c.params || {}) });

const E_ROUND = 2, E_RECT = 16;
const smooth = x => x * x * (3 - 2 * x);

/** size of the child hall's face as seen through the connection: [width, height, section exponent] */
function faceSection(ship, hall) {
  const c = hall.conn, t = wallOf(ship, hall), f = c.face[1];
  const [a, b] = f === 'z' ? [hall.w, hall.h] : f === 'x' ? [hall.l, hall.h] : [hall.w, hall.l];
  const round = f === 'z' && (hall.shape === 'tube' || hall.shape === 'sphere' || (hall.shape === 'prism' && hall.sides >= 6));
  return { w: Math.max(a - 3 * t, 0.3), h: Math.max(b - 3 * t, 0.3), e: round ? E_ROUND : E_RECT };
}

/** the two ends of the passage: A in the parent's wall, B at the child's face (blended by conn.morph) */
export function ends(ship, hall) {
  const c = hall.conn;
  const A = { w: c.w, h: c.h, e: c.round ? E_ROUND : E_RECT };
  const F = faceSection(ship, hall), m = MathUtils.clamp(c.morph || 0, 0, 1);
  if (F.e === E_ROUND && m > 0) { F.h = F.w = Math.min(F.w, F.h); }
  const B = { w: MathUtils.lerp(A.w, F.w, m), h: MathUtils.lerp(A.h, F.h, m), e: MathUtils.lerp(A.e, F.e, m) };
  return { A, B };
}

/** cross-section at fraction tt (0 = parent end, 1 = child end) */
export function sectionAt(E, tt) {
  const u = smooth(MathUtils.clamp(tt, 0, 1));
  return { w: MathUtils.lerp(E.A.w, E.B.w, u), h: MathUtils.lerp(E.A.h, E.B.h, u), e: MathUtils.lerp(E.A.e, E.B.e, u) };
}

/** outer bulge (metres beyond the wall) along the passage: [[t, offset], ...] */
export function profile(p, len) {
  const ts = new Set();
  for (let i = 0; i <= 12; i++) ts.add(i / 12);
  const rings = [];
  const folds = Math.min(Math.round(p.bellows), 12), ribs = Math.min(Math.round(p.ribs), 12);
  if (folds) for (let i = 0; i <= folds * 6; i++) ts.add(i / (folds * 6));
  const hw = Math.max(p.ribWidth, 0.02) / 2, ramp = 0.03;
  for (let k = 0; k < ribs; k++) {
    const tc = (k + 1) / (ribs + 1);
    rings.push(tc);
    for (const d of [-hw - ramp, -hw, hw, hw + ramp]) ts.add(tc + d / len);
  }
  const off = tt => {
    let o = 0;
    const edge = Math.min(tt, 1 - tt);
    if (p.flare > 0) { const g = Math.max(0, 1 - edge / Math.max(p.flareLen, 0.02)); o += p.flare * g * g; }
    for (const tc of rings) {
      const d = Math.abs(tt - tc) * len;
      if (d <= hw) o += p.ribSize; else if (d < hw + ramp) o += p.ribSize * (1 - (d - hw) / ramp);
    }
    if (folds) o += p.bellowsDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * folds * tt)) * Math.min(1, edge * 5);
    return o;
  };
  const sorted = [...ts].filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
  const out = [];
  for (const t of sorted) if (!out.length || (t - out[out.length - 1][0]) * len > 0.006) out.push([t, off(t)]);
  out[out.length - 1][0] = 1;
  return out;
}

/** how far the passage reaches back into the walls it joins, so it also covers the gap on curved hulls */
const reach = (t, s) => t + 0.1 + 0.2 * Math.max(s.w, s.h);

/** the solid collar (`shell`) and the hole (`cavity`) of one connection, both in the tunnel frame (z = out of the parent) */
export function tunnelGeometry(ship, worlds, hall) {
  const c = hall.conn, t = wallOf(ship, hall), len = c.len;
  const E = ends(ship, hall);
  const ra = reach(t, E.A), rb = reach(t, E.B);
  const style = styleOf(c);
  const withProfile = len > 0.15 && style?.kind !== 'model';
  const prof = withProfile ? profile(paramsOf(c), len) : [0, 1].map(x => [x, 0]);
  const sta = [], cav = [];
  const add = (list, z, tt, off) => { const s = sectionAt(E, tt); list.push({ z, w: s.w + (off === null ? 0 : 2 * (t + off)), h: s.h + (off === null ? 0 : 2 * (t + off)), e: s.e }); };
  if (len > 0.001) {
    add(sta, -ra, 0, prof[0][1]);
    prof.forEach(([tt, off]) => add(sta, tt * len, tt, off));
    add(sta, len + rb, 1, prof[prof.length - 1][1]);
    add(cav, -ra - 0.06, 0, null);
    for (let i = 0; i <= 8; i++) add(cav, (i / 8) * len, i / 8, null);
    add(cav, len + rb + 0.06, 1, null);
  } else {
    add(sta, -ra, 0, 0);
    add(sta, rb, 1, 0);
    add(cav, -ra - 0.06, 0, null);
    add(cav, rb + 0.06, 1, null);
  }
  const matrix = tunnelMatrix(worlds.get(c.parent), c);
  return {
    shell: style?.kind === 'model' ? null : { geo: morphLoft(sta), matrix },
    cavity: { geo: morphLoft(cav), matrix },
    E, matrix, len,
  };
}

/** a connector model, stretched between the two ends: the first/last `cap` of its length keep their size, the middle stretches */
export function deformModel(model, meta, E, len) {
  const src = model.clone(true);
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const zmin = box.min.z, zmax = box.max.z, zlen = Math.max(zmax - zmin, 1e-4);
  const open = meta?.opening || [box.max.x - box.min.x, box.max.y - box.min.y];
  const cap = Math.min((meta?.cap ?? 0.2) * zlen, Math.max(len, 0.01) / 2);
  const capScale = len < 2 * cap ? len / (2 * cap) : 1;
  const v = new Vector3();
  const mapZ = z => {
    const d = z - zmin;
    if (d <= cap) return d * capScale;
    if (zmax - z <= cap) return len - (zmax - z) * capScale;
    return cap * capScale + ((d - cap) / Math.max(zlen - 2 * cap, 1e-4)) * (len - 2 * cap * capScale);
  };
  const meshes = [];
  src.traverse(o => { if (o.isMesh) meshes.push(o); });
  const out = new THREE.Group();
  for (const o of meshes) {
    const g = o.geometry.clone();
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const nz = mapZ(v.z), s = sectionAt(E, len > 0 ? nz / len : 0);
      p.setXYZ(i, v.x * (s.w / open[0]), v.y * (s.h / open[1]), nz);
    }
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, o.material);
    mesh.castShadow = mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
