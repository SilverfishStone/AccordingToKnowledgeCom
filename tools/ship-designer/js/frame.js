// Hall decoration that is not part of the CSG skin: interior rib rings and an outside lattice of stringers / hoops (dome poles,
// trusswork). Also the cross-section lookup the bulkheads use.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sectionPoints, PROFILE_PRESETS } from './geo.js';
import { wallOf, childrenOf, trimKeeps, trimsOf } from './ship.js';

const { Vector3 } = THREE;

export function profileScale(hall, u) {
  const prof = hall.profile?.length >= 2 ? hall.profile : PROFILE_PRESETS['Dished ends'];
  if (u <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    if (u <= prof[i][0]) {
      const [u0, s0] = prof[i - 1], [u1, s1] = prof[i];
      return u1 - u0 < 1e-6 ? s1 : s0 + (s1 - s0) * (u - u0) / (u1 - u0);
    }
  }
  return prof[prof.length - 1][1];
}

/** cross-section at fraction u (0 = back, 1 = front) of a hall, shrunk by `inset` (negative = grown): {w, h, round, pts:[[x,y]...]} */
export function crossAt(hall, u, inset = 0, N = 48) {
  let w, h, kind = 'poly', corners, oy = 0;   // oy: how far the section's centre moves when the hall tapers toward its bottom or top
  const lift = s => (hall.ay || 0) * (hall.h / 2) * (1 - s);
  switch (hall.shape) {
    case 'box': { const s = hall.sb + (hall.sf - hall.sb) * u; w = hall.w * s; h = hall.h * s; oy = lift(s); corners = sectionPoints('rect', 4); break; }
    case 'tube': { const s = hall.sb + (hall.sf - hall.sb) * u; w = hall.w * s; h = hall.h * s; oy = lift(s); kind = 'round'; break; }
    case 'prism': { const s = hall.sb + (hall.sf - hall.sb) * u; w = hall.w * s; h = hall.h * s; oy = lift(s); corners = sectionPoints('ngon', hall.sides); break; }
    case 'sphere': { const s = Math.sqrt(Math.max(1 - (2 * u - 1) ** 2, 0.0004)); w = hall.w * s; h = hall.h * s; kind = 'round'; break; }
    default: { const s = profileScale(hall, u); w = hall.w * s; h = hall.h * s; kind = hall.pkind === 'rect' ? 'rectround' : 'round'; }
  }
  w = Math.max(w - 2 * inset, 0.05); h = Math.max(h - 2 * inset, 0.05);
  let pts;
  if (corners) pts = corners.map(p => [p[0] * w, p[1] * h]);
  else {
    const e = kind === 'rectround' ? 16 : 2;
    pts = Array.from({ length: N }, (_, j) => { const a = 2 * Math.PI * j / N, c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.abs(c) ** (2 / e) * w / 2, Math.sign(s) * Math.abs(s) ** (2 / e) * h / 2]; });
  }
  if (oy) pts = pts.map(p => [p[0], p[1] + oy]);
  return { w, h, round: !corners, pts };
}

/** a closed band (rib) between an outer and inner outline, from z0 to z1 */
function band(outer, inner, z0, z1) {
  const P = [];
  const v = (p, z) => new Vector3(p[0], p[1], z);
  const quad = (a, b, c, d) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z); };
  const n = outer.length;
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    quad(v(outer[j], z0), v(outer[k], z0), v(outer[k], z1), v(outer[j], z1));       // outer face
    quad(v(inner[k], z0), v(inner[j], z0), v(inner[j], z1), v(inner[k], z1));       // inner face
    quad(v(outer[j], z1), v(outer[k], z1), v(inner[k], z1), v(inner[j], z1));       // front
    quad(v(outer[k], z0), v(outer[j], z0), v(inner[j], z0), v(inner[k], z0));       // back
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

/** a poly-line (or closed loop) cut by the hall's slicing planes: the kept runs of points, with the cut ends on the planes */
function clipRuns(hall, pts, closed) {
  if (!trimsOf(hall).length) return [{ pts, closed }];
  const d = p => trimsOf(hall).reduce((m, t) => {
    const v = (t.axis === 'x' ? p.x : t.axis === 'y' ? p.y : p.z) - t.pos;
    return Math.min(m, t.keep === 'below' ? -v : v);
  }, Infinity);                                   // >= 0 inside the kept region
  const n = pts.length, ds = pts.map(d);
  if (ds.every(v => v >= 0)) return [{ pts, closed }];
  if (ds.every(v => v < 0)) return [];
  let start = 0;
  if (closed) start = ds.findIndex(v => v < 0);   // begin the walk in the removed part so no run wraps round
  const runs = [];
  let cur = null;
  const total = closed ? n + 1 : n;
  for (let k = 0; k < total; k++) {
    const i = (start + k) % n, j = (start + k - 1 + n) % n;
    const ok = ds[i] >= 0;
    if (ok && !cur) { cur = []; if (k > 0 && ds[j] < 0) cur.push(pts[j].clone().lerp(pts[i], ds[j] / (ds[j] - ds[i]))); }
    if (ok && cur) cur.push(pts[i]);
    if (!ok && cur) {
      cur.push(pts[j].clone().lerp(pts[i], ds[j] / (ds[j] - ds[i])));
      runs.push({ pts: cur, closed: false }); cur = null;
    }
  }
  if (cur) runs.push({ pts: cur, closed: false });
  return runs.filter(r => r.pts.length >= 2);
}

function tube(points, r, closed) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * (closed ? 2 : 1)), r, 6, closed);
  g.deleteAttribute('uv');
  return g.toNonIndexed();
}

/** z positions along the hall where a side opening (door, window cut) is, so the ribs can stay clear of them */
function openingZs(ship, hall) {
  const out = [];
  for (const c of childrenOf(ship, hall.id)) {
    if (c.conn.type === 'fuse') continue;
    const half = Math.max(c.conn.w, c.conn.h) / 2 + 0.3;
    if (Math.abs(c.conn.n[2]) < 0.8) out.push([c.conn.p[2], half]);   // a port on a side wall; end-face ports do not block rings
  }
  return out;
}

/** all of a hall's frame geometry in hall-local space (null when it has none) */
export function frameGeometry(ship, hall) {
  const f = hall.frame;
  if (!f || (hall.shape === 'sphere' && !(f.outHoops > 0 || f.outLongs > 0 || f.hoopsAt?.length))) return null;
  const t = wallOf(ship, hall), parts = [];
  const L = hall.l;
  // interior rib rings
  if (f.inSpacing > 0.05 && hall.hollow && hall.shape !== 'sphere') {
    const skips = openingZs(ship, hall);
    for (let z = -L / 2 + f.inSpacing * 0.5 + t; z < L / 2 - t; z += f.inSpacing) {
      if (skips.some(([sz, half]) => Math.abs(z - sz) < half)) continue;
      const u = (z + L / 2) / L;
      const outer = crossAt(hall, u, t - 0.03), inner = crossAt(hall, u, t + f.inDepth);
      if (outer.pts.length === inner.pts.length) parts.push(band(outer.pts, inner.pts, z - f.inWidth / 2, z + f.inWidth / 2));
    }
  }
  // outside lattice: stringers along the length and hoops around it
  const r = Math.max(f.thick, 0.02) / 2;
  if (f.outHoops > 0 || f.outLongs > 0 || f.hoopsAt?.length) {
    const grow = -r;                          // inset < 0: sit just outside the skin
    const at = f.hoopsAt?.length ? f.hoopsAt : Array.from({ length: f.outHoops }, (_, k) => (k + 1) / (f.outHoops + 1));
    for (const u of at) {
      const c = crossAt(hall, u, grow);
      for (const run of clipRuns(hall, c.pts.map(p => new Vector3(p[0], p[1], (u - 0.5) * L)), true)) parts.push(tube(run.pts, r, run.closed));
    }
    if (f.outLongs > 0) {
      const sphere = hall.shape === 'sphere', K = sphere ? 40 : hall.shape === 'profile' ? 30 : 2;
      const n0 = crossAt(hall, 0.5, grow).pts.length;
      const idxs = crossAt(hall, 0.5, grow).round ? Array.from({ length: f.outLongs }, (_, i) => Math.round(i * n0 / f.outLongs) % n0) : Array.from({ length: n0 }, (_, i) => i);
      // where the hall comes to a point (a sphere, or a dome / cone whose end is nearly closed) every stringer runs into that one point
      const apexB = sphere || (hall.shape === 'profile' && profileScale(hall, 0) < 0.2), apexF = sphere || (hall.shape === 'profile' && profileScale(hall, 1) < 0.2);
      for (const j of idxs) {
        const pts = [];
        if (apexB) pts.push(new Vector3(0, 0, -L / 2 - r));
        for (let i = apexB && sphere ? 1 : 0; i <= (apexF && sphere ? K - 1 : K); i++) {
          const u = sphere ? (1 - Math.cos(Math.PI * i / K)) / 2 : i / K, c = crossAt(hall, u, grow, n0);
          pts.push(new Vector3(c.pts[j % c.pts.length][0], c.pts[j % c.pts.length][1], (u - 0.5) * L));
        }
        if (apexF) pts.push(new Vector3(0, 0, L / 2 + r));
        for (const run of clipRuns(hall, pts, false)) parts.push(tube(run.pts, r, false));
      }
    }
  }
  return parts.length ? mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false) : null;
}
