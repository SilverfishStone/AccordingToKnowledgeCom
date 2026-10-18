// Wings and scaffolding: generated structures that span from one hall to another. A bridge is anchored to the outside of two halls
// (a position along each hall and an angle around it, so it stays on the skin when the halls change shape or move) and its
// shape is made from a handful of numbers: a tapered wing sheet, a flat scaffold of rails and rungs, or a box / triangle truss.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crossAt } from './frame.js';

const { Vector3 } = THREE;

export const BRIDGE_KINDS = {
  wing: 'Wing sheet',
  ladder: 'Flat scaffolding (rails and rungs)',
  truss: 'Truss (box or triangle section)',
};

export const BRIDGE_DEFAULTS = {
  wing: { chordA: 4, chordB: 2, thick: 0.16, thickB: 0.08, sweep: 0, embed: 0.3, bays: 6, rad: 0.05, rails: 3, sides: 3 },
  ladder: { chordA: 3, chordB: 3, thick: 0.1, thickB: 0.1, sweep: 0, embed: 0.3, bays: 6, rad: 0.05, rails: 3, sides: 3 },
  truss: { chordA: 1.4, chordB: 1.4, thick: 0.1, thickB: 0.1, sweep: 0, embed: 0.3, bays: 6, rad: 0.06, rails: 3, sides: 3 },
};

/** a point on the outside of a hall, in the hall's own space: `u` along its length (0 back, 1 front), `ang` around it (radians) */
export function surfaceLocal(hall, u, ang) {
  const uu = Math.min(Math.max(u, 0.004), 0.996);
  const pts = crossAt(hall, uu, 0, 64).pts, n = pts.length;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let best = 0;
  for (let i = 0; i < n; i++) {                                     // where the ray from the axis meets the outline (the farthest crossing)
    const a = pts[i], b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (a[0] * ey - a[1] * ex) / den, s = (a[0] * dy - a[1] * dx) / den;
    if (t > best && s >= -1e-6 && s <= 1 + 1e-6) best = t;
  }
  return new Vector3(dx * best, dy * best, (uu - 0.5) * hall.l);
}

/** the (u, angle) of a world point near a hall's surface */
export function anchorOf(hall, world, point) {
  const p = point.clone().applyMatrix4(world.clone().invert());
  return { hall: hall.id, u: Math.min(Math.max(p.z / hall.l + 0.5, 0.01), 0.99), ang: Math.atan2(p.y, p.x) };
}

/**
 * The two ends of a bridge in the ship: {P, Q, A, B (halls), angA, angB}, or null when a hall is missing. Unless the angles were set
 * by hand (`manual`) each end is on the outermost point of its hall facing the other one, so a bridge never has to cut through a hull.
 */
export function bridgeEnds(ship, worlds, br) {
  const A = ship.halls.find(h => h.id === br.a.hall), B = ship.halls.find(h => h.id === br.b.hall);
  const Wa = A && worlds.get(A.id), Wb = B && worlds.get(B.id);
  if (!A || !B || !Wa || !Wb) return null;
  let angA = br.a.ang, angB = br.b.ang;
  if (!br.manual) {
    const ca = new Vector3(0, 0, (br.a.u - 0.5) * A.l).applyMatrix4(Wa), cb = new Vector3(0, 0, (br.b.u - 0.5) * B.l).applyMatrix4(Wb);
    const d = cb.clone().sub(ca);
    if (d.lengthSq() > 1e-8) {
      const la = d.clone().transformDirection(Wa.clone().invert()), lb = d.clone().negate().transformDirection(Wb.clone().invert());
      angA = Math.atan2(la.y, la.x);
      angB = Math.atan2(lb.y, lb.x);
    }
  }
  return { A, B, Wa, Wb, angA, angB, P: surfaceLocal(A, br.a.u, angA).applyMatrix4(Wa), Q: surfaceLocal(B, br.b.u, angB).applyMatrix4(Wb) };
}

/** where a link hall lies: straight between the outermost points of its two halls, reaching `embed` into each. {matrix, length} or null */
export function linkPlacement(ship, worlds, hall) {
  const lk = hall.link, E = lk && bridgeEnds(ship, worlds, { a: lk.a, b: lk.b, manual: false });
  if (!E) return null;
  const V = E.Q.clone().sub(E.P), L = V.length();
  if (L < 0.05) return null;
  const s = V.clone().divideScalar(L);
  let y = new Vector3(0, 1, 0).addScaledVector(s, -s.y);
  if (y.lengthSq() < 0.04) y = new Vector3(0, 0, 1).addScaledVector(s, -s.z);
  y.normalize();
  const x = new Vector3().crossVectors(y, s).normalize(), embed = lk.embed ?? 0.4;
  return { matrix: new THREE.Matrix4().makeBasis(x, y, s).setPosition(E.P.clone().add(E.Q).multiplyScalar(0.5)), length: L + 2 * embed };
}

/** how far out a hall's skin is at (u, angle), from a table made once per hall shape (looking it up thousands of times is what clipping a truss needs) */
const TABLES = new Map();
function outlineTable(hall) {
  const { conn, xf, group, link, name, hidden, id, ...shape } = hall;
  const key = JSON.stringify(shape);
  let t = TABLES.get(hall.id);
  if (t && t.key === key) return t;
  const NU = 32, NA = 48, R = new Float32Array(NU * (NA + 1));
  for (let i = 0; i < NU; i++) for (let j = 0; j <= NA; j++) {
    const v = surfaceLocal(hall, 0.004 + 0.992 * i / (NU - 1), 2 * Math.PI * j / NA);
    R[i * (NA + 1) + j] = Math.hypot(v.x, v.y);
  }
  t = { key, R, NU, NA };
  TABLES.set(hall.id, t);
  return t;
}
function skinRadius(t, u, ang) {
  const fu = Math.min(Math.max((u - 0.004) / 0.992, 0), 1) * (t.NU - 1), i = Math.min(Math.floor(fu), t.NU - 2), a = ((ang % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * t.NA, j = Math.min(Math.floor(a), t.NA - 1);
  const du = fu - i, da = a - j, w = t.NA + 1, R = t.R;
  return (R[i * w + j] * (1 - da) + R[i * w + j + 1] * da) * (1 - du) + (R[(i + 1) * w + j] * (1 - da) + R[(i + 1) * w + j + 1] * da) * du;
}

const Y = new Vector3(0, 1, 0);
function cylBetween(a, b, r, seg = 6) {
  const d = new Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, Math.max(len, 1e-4), seg, 1);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()), new Vector3(1, 1, 1)));
  return g.toNonIndexed();
}

/** the bridge's own axes: s along the span, e1 across it (along the first hall's length), e2 through it */
export function bridgeFrame(E) {
  const V = E.Q.clone().sub(E.P), L = V.length() || 1e-6, s = V.clone().divideScalar(L);
  const across = new Vector3(0, 0, 1).transformDirection(E.Wa);
  let e1 = across.clone().addScaledVector(s, -across.dot(s));
  if (e1.lengthSq() < 0.04) { const alt = new Vector3(0, 0, 1).transformDirection(E.Wb); e1 = alt.clone().addScaledVector(s, -alt.dot(s)); }
  if (e1.lengthSq() < 0.04) e1 = new Vector3(1, 0, 0).addScaledVector(s, -s.x);
  e1.normalize();
  const e2 = new Vector3().crossVectors(s, e1).normalize();
  // "up" through the structure is the ship's up whichever way the span runs (otherwise a truss turns upside down when it goes the other direction)
  const up = Math.abs(e2.y) > 0.25 ? new Vector3(0, 1, 0) : new Vector3(0, 1, 0).transformDirection(E.Wa);
  if (e2.dot(up) < 0) e2.negate();
  return { s, e1, e2, L };
}

/**
 * Where a point of the bridge's end meets a hall: `m1` metres across the span (along the hall) and `m2` metres up / down it
 * (around the hall) from the end's centre, taken ON the hall's skin - so a wide end hugs a curved hull instead of floating off it or digging in.
 */
function endOn(hall, W, u, ang, e1, e2) {
  const b = surfaceLocal(hall, u, ang), R = Math.max(Math.hypot(b.x, b.y), 0.2);
  const at = (du, da) => surfaceLocal(hall, u + du, ang + da).applyMatrix4(W);
  const P0 = at(0, 0), s1 = Math.sign(at(0.01, 0).sub(P0).dot(e1)) || 1, s2 = Math.sign(at(0, 0.02).sub(P0).dot(e2)) || 1;     // which way along / around the hall is "across" / "up" on the bridge
  return (m1, m2) => at(s1 * m1 / hall.l, s2 * Math.asin(Math.max(-0.95, Math.min(0.95, m2 / R))));        // m2 up the hull's flank: a point m2 off the middle line sits at asin(m2 / R) round the hull (a hull narrower than the structure just takes its top and bottom)
}

/** the bridge as one geometry in ship space (null if it cannot be made) */
export function bridgeGeometry(ship, worlds, br) {
  const E = bridgeEnds(ship, worlds, br);
  if (!E || E.P.distanceTo(E.Q) < 0.05) return null;
  const { s, e1, e2 } = bridgeFrame(E);
  const emb = Math.max(br.embed ?? 0.02, 0), sweep = br.sweep || 0;
  const onA = endOn(E.A, E.Wa, br.a.u, E.angA, e1, e2), onB = endOn(E.B, E.Wb, br.b.u, E.angB, e1, e2);
  const root = (m1, m2) => onA(m1, m2).addScaledVector(s, -emb);          // the end on the first hall, a hair inside the skin
  const tip = (m1, m2) => onB(m1 + sweep, m2).addScaledVector(s, emb);
  const lerp = (a, b, t) => a + (b - a) * t;
  const bays = Math.max(1, Math.round(br.bays || 6));
  // a point that would be inside any hull (the span crossing a tapering nose, say) is lifted onto the skin, so the structure drapes over a hull instead of cutting through it
  const solids = ship.halls.filter(h => !h.hidden && worlds.get(h.id)).map(h => ({ h, W: worlds.get(h.id), inv: worlds.get(h.id).clone().invert() }));
  const pushOut = p => {
    for (const { h, W, inv } of [...solids, ...solids]) {                // twice round, so lifting off one hull does not leave it inside the next
      const q = p.clone().applyMatrix4(inv);
      if (Math.abs(q.z) > h.l / 2 + 0.03) continue;
      const R = surfaceLocal(h, q.z / h.l + 0.5, Math.atan2(q.y, q.x)), RR = Math.hypot(R.x, R.y) + 0.025, rr = Math.hypot(q.x, q.y);
      if (rr < RR) {
        const k = rr > 1e-4 ? RR / rr : 0;
        if (k) { q.x *= k; q.y *= k; } else { q.x = RR; }
        p.copy(q.applyMatrix4(W));
      }
    }
    return p;
  };
  const thB = br.taper != null ? br.thick * br.taper : br.thickB;                      // thickness at the second hall

  if (br.kind === 'wing') {
    const K = 14, M = 16, P = [];
    const nu = Array.from({ length: M + 1 }, (_, i) => -1 + 2 * i / M);
    const rt = nu.map(v => root(v * br.chordA / 2, 0)), tp = nu.map(v => tip(v * br.chordB / 2, 0));
    const ring = k => {
      const t = k / K, th = lerp(br.thick, thB, t), at = i => rt[i].clone().lerp(tp[i], t), pts = [];
      for (let i = 0; i <= M; i++) pts.push(pushOut(at(i).addScaledVector(e2, th / 2 * (1 - nu[i] * nu[i]) ** 0.35)));
      for (let i = M - 1; i >= 1; i--) pts.push(pushOut(at(i).addScaledVector(e2, -th / 2 * (1 - nu[i] * nu[i]) ** 0.35)));
      return pts;
    };
    const rings = Array.from({ length: K + 1 }, (_, k) => ring(k)), N = rings[0].length;
    const tri = (a, b, c) => P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, a = rings[k][i], b = rings[k][j], c = rings[k + 1][j], d = rings[k + 1][i];
      tri(a, b, c); tri(a, c, d);
    }
    for (const [k, flip] of [[0, true], [K, false]]) {                                 // end caps (they sit on the hulls)
      const o = new Vector3();
      rings[k].forEach(p => o.add(p));
      o.divideScalar(N);
      pushOut(o);
      for (let i = 0; i < N; i++) { const a = rings[k][i], b = rings[k][(i + 1) % N]; if (flip) tri(o, b, a); else tri(o, a, b); }
    }
    let vol = 0;                                                                       // a closed sheet must have a positive volume: otherwise it came out inside out
    for (let i = 0; i < P.length; i += 9) vol += P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) + P[i + 1] * (P[i + 5] * P[i + 6] - P[i + 3] * P[i + 8]) + P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6]);
    if (vol < 0) for (let i = 0; i < P.length; i += 9) for (let k = 0; k < 3; k++) { const t = P[i + 3 + k]; P[i + 3 + k] = P[i + 6 + k]; P[i + 6 + k] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
    return g;
  }

  const r = Math.max(br.rad || 0.05, 0.01), parts = [];
  let line, count;                                                                    // line(j) = the two ends of longitudinal member j
  if (br.kind === 'ladder') {
    count = Math.max(2, Math.round(br.rails || 3));
    line = j => { const v = -1 + 2 * j / (count - 1); return [root(v * br.chordA / 2, 0), tip(v * br.chordB / 2, 0)]; };
  } else {                                                                            // truss: the corners of a regular section
    count = Math.max(3, Math.min(Math.round(br.sides || 3), 8));
    line = j => { const a = 2 * Math.PI * j / count + Math.PI / 2; return [root(Math.cos(a) * br.chordA / 2, Math.sin(a) * br.chordA / 2), tip(Math.cos(a) * br.chordB / 2, Math.sin(a) * br.chordB / 2)]; };
  }
  const ends = Array.from({ length: count }, (_, j) => line(j));
  const node = (i, j) => ends[j][0].clone().lerp(ends[j][1], i / bays);
  // a member stops where it meets a hull's skin: only the part outside every hull is made, so nothing runs through or inside a hull
  const q = new Vector3();
  const inside = p => {
    for (const { h, inv } of solids) {
      q.copy(p).applyMatrix4(inv);
      if (Math.abs(q.z) >= h.l / 2) continue;
      if (Math.hypot(q.x, q.y) < skinRadius(outlineTable(h), q.z / h.l + 0.5, Math.atan2(q.y, q.x)) - 0.012) return true;
    }
    return false;
  };
  const S = 24, pa = new Vector3(), at = (a, b, t) => pa.copy(a).lerp(b, t);
  const edge = (a, b, t0, t1) => { for (let k = 0; k < 9; k++) { const m = (t0 + t1) / 2; if (inside(at(a, b, m))) t0 = m; else t1 = m; } return t1; };       // t0 inside, t1 outside -> the crossing
  const edgeIn = (a, b, t0, t1) => { for (let k = 0; k < 9; k++) { const m = (t0 + t1) / 2; if (inside(at(a, b, m))) t1 = m; else t0 = m; } return t0; };      // t0 outside, t1 inside
  const member = (a, b, rad) => {
    const sh = 0.6 * rad / Math.max(a.distanceTo(b), 1e-3);                            // a cut end is a flat disc across the member: pull it back a little so its corner does not dip into the hull
    const put = (t0, t1) => { if (t1 > t0 + 1e-3) parts.push(cylBetween(a.clone().lerp(b, t0), a.clone().lerp(b, t1), rad)); };
    let prev = inside(a), start = prev ? -1 : 0;
    for (let i = 1; i <= S; i++) {
      const cur = inside(at(a, b, i / S));
      if (prev && !cur) start = edge(a, b, (i - 1) / S, i / S) + sh;
      else if (!prev && cur) { put(start, edgeIn(a, b, (i - 1) / S, i / S) - sh); start = -1; }
      prev = cur;
    }
    if (!prev && start >= 0) put(start, 1);
  };
  const cyl = (a, b, rad) => member(a, b, rad);
  for (let j = 0; j < count; j++) for (let i = 0; i < bays; i++) cyl(node(i, j), node(i + 1, j), r);
  if (br.kind === 'ladder') {
    for (let i = 0; i <= bays; i++) for (let j = 0; j < count - 1; j++) {
      cyl(node(i, j), node(i, j + 1), r * 0.8);
      if (i < bays) (j + i) & 1 ? cyl(node(i, j), node(i + 1, j + 1), r * 0.6) : cyl(node(i, j + 1), node(i + 1, j), r * 0.6);
    }
  } else {
    for (let i = 0; i <= bays; i++) for (let j = 0; j < count; j++) cyl(node(i, j), node(i, (j + 1) % count), r * 0.7);
    for (let i = 0; i < bays; i++) for (let j = 0; j < count; j++) cyl(node(i, j), node(i + 1, (j + 1) % count), r * 0.55);
  }
  if (!parts.length) return null;
  const g = mergeGeometries(parts, false);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
