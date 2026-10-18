// Geometry for halls, tunnels and door trim. Every geometry has position + normal + uv + uv1 (the CSG needs all four).
//  uv  = metres (arc length around, distance along), so a material's tile size is a real size.
//  uv1 = the hall's "paint canvas": one unique, undistorted atlas per hall surface (0..1), so brush strokes can be stored per surface.
import * as THREE from 'three';

const { Vector3, BufferGeometry, Float32BufferAttribute, Shape, Path, ExtrudeGeometry, SphereGeometry } = THREE;

/** cross-section outline, CCW seen from +Z, scaled to fill the unit box (-0.5..0.5) */
export function sectionPoints(kind, sides) {
  if (kind === 'rect') return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const n = Math.max(3, sides | 0);
  const raw = [];
  for (let j = 0; j < n; j++) {
    const a = Math.PI / 2 - Math.PI / n + (2 * Math.PI * j) / n; // a flat side on top
    raw.push([Math.cos(a), Math.sin(a)]);
  }
  const xs = raw.map(p => p[0]), ys = raw.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return raw.map(p => [(p[0] - (x0 + x1) / 2) / (x1 - x0), (p[1] - (y0 + y1) / 2) / (y1 - y0)]);
}

const ringLen = (pts, w, h) => {
  let s = 0;
  for (let j = 0; j < pts.length; j++) { const a = pts[j], b = pts[(j + 1) % pts.length]; s += Math.hypot((b[0] - a[0]) * w, (b[1] - a[1]) * h); }
  return s;
};

/** dimensions of a loft hall, shared by the geometry and by the paint-canvas scale */
function loftDims({ kind = 'rect', sides = 4, w, h, l, sf = 1, sb = 1, ay = 0, inset = 0, openF = false, openB = false }) {
  const t = inset;
  const wF = Math.max(w * sf - 2 * t, 0.05), hF = Math.max(h * sf - 2 * t, 0.05);
  const wB = Math.max(w * sb - 2 * t, 0.05), hB = Math.max(h * sb - 2 * t, 0.05);
  const open = t > 0; // only the cavity is open-ended: it runs through the end wall
  const z1 = open && openF ? l / 2 + 0.06 : l / 2 - t, z0 = open && openB ? -l / 2 - 0.06 : -l / 2 + t;
  const L = Math.max(z1 - z0, 0.05);
  // ay = -1 / 0 / 1: an end that tapers shrinks toward the bottom, the middle or the top of the hall instead of always the middle
  const oyF = ay * (h / 2) * (1 - sf), oyB = ay * (h / 2) * (1 - sb);
  return { t, wF, hF, wB, hB, oyF, oyB, z1: z0 + L, z0, L, kind, sides };
}

/** the paint atlas of a loft: sides = a strip (perimeter x length), the two end caps sit beside it */
function loftAtlas(d, pts) {
  const P = (ringLen(pts, d.wF, d.hF) + ringLen(pts, d.wB, d.hB)) / 2;
  const cw = Math.max(d.wF, d.wB), ch = Math.max(d.hF, d.hB), G = 0.3;
  const W = P + G + cw, H = Math.max(d.L, 2 * ch + G);
  return { P, cw, ch, G, s: 1 / Math.max(W, H) };
}

/**
 * A hollow-able prism: a rectangle or n-gon section, optionally tapered (sf = scale at the +Z end, sb = at the -Z end).
 * `inset` shrinks every wall in by that much - the inner cavity of a hall is the same shape inset by the wall thickness.
 * With inset > 0, openF / openB let the cavity run out through that end (an open-ended tube).
 */
export function loftGeometry(params) {
  const d = loftDims(params);
  const { wF, hF, wB, hB, z0, z1 } = d;
  const pts = sectionPoints(d.kind, d.sides);
  const n = pts.length;
  const smooth = d.kind === 'ngon' && n >= 13;
  const A = loftAtlas(d, pts);
  const F = pts.map(p => new Vector3(p[0] * wF, p[1] * hF + d.oyF, z1));
  const B = pts.map(p => new Vector3(p[0] * wB, p[1] * hB + d.oyB, z0));

  // running distance around the section (for u)
  const arc = [0];
  for (let j = 1; j <= n; j++) arc.push(arc[j - 1] + (F[j % n].distanceTo(F[j - 1]) + B[j % n].distanceTo(B[j - 1])) / 2);

  const pos = [], nor = [], uv = [], uv1 = [], idx = [];
  const push = (v, nr, u, vv, a, b) => {
    pos.push(v.x, v.y, v.z); nor.push(nr.x, nr.y, nr.z); uv.push(u, vv); uv1.push(a, b);
    return pos.length / 3 - 1;
  };
  const side = (v, nr, j, z) => push(v, nr, arc[j], z, arc[j] * A.s, (z - z0) * A.s);
  const capUv = (front, x, y) => [(A.P + A.G + A.cw / 2 + x) * A.s, ((front ? 0 : A.ch + A.G) + A.ch / 2 + y) * A.s];
  const tmpA = new Vector3(), tmpB = new Vector3();

  // long halls get rings along their length: one quad 30 m long is a triangle the solid-geometry engine cannot always cut cleanly (it drops pieces of it)
  const M = Math.max(1, Math.min(24, Math.ceil((z1 - z0) / 2.5)));
  const at = (j, k) => new Vector3().lerpVectors(B[j], F[j], k / M);
  if (smooth) {
    const rows = [];
    for (let k = 0; k <= M; k++) rows.push([]);
    for (let j = 0; j <= n; j++) {
      const jm = (j - 1 + n) % n, jp = (j + 1) % n, jj = j % n;
      const nF = tmpA.subVectors(F[jp], F[jm]).cross(tmpB.subVectors(F[jj], B[jj])).normalize().clone();
      const nB = tmpA.subVectors(B[jp], B[jm]).cross(tmpB.subVectors(F[jj], B[jj])).normalize().clone();
      for (let k = 0; k <= M; k++) rows[k].push(side(at(jj, k), nB.clone().lerp(nF, k / M).normalize(), j, z0 + (z1 - z0) * k / M));
    }
    for (let k = 0; k < M; k++) for (let j = 0; j < n; j++) idx.push(rows[k][j], rows[k][j + 1], rows[k + 1][j + 1], rows[k][j], rows[k + 1][j + 1], rows[k + 1][j]);
  } else {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      const nr = tmpA.subVectors(B[j1], B[j]).cross(tmpB.subVectors(F[j1], B[j])).normalize().clone();
      let prev = null;
      for (let k = 0; k <= M; k++) {
        const z = z0 + (z1 - z0) * k / M, a = side(at(j, k), nr, j, z), b = side(at(j1, k), nr, j + 1, z);
        if (prev) idx.push(prev[0], prev[1], b, prev[0], b, a);
        prev = [a, b];
      }
    }
  }
  // caps
  const up = new Vector3(0, 0, 1), dn = new Vector3(0, 0, -1);
  const cF = push(new Vector3(0, d.oyF, z1), up, 0, 0, ...capUv(true, 0, 0)), fi = F.map(p => push(p, up, p.x, p.y - d.oyF, ...capUv(true, p.x, p.y - d.oyF)));
  const cB = push(new Vector3(0, d.oyB, z0), dn, 0, 0, ...capUv(false, 0, 0)), bi = B.map(p => push(p, dn, p.x, p.y - d.oyB, ...capUv(false, p.x, p.y - d.oyB)));
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n;
    idx.push(cF, fi[j], fi[j1], cB, bi[j1], bi[j]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ ellipsoids
const ellipsoidDims = (w, h, l, inset) => ({ sx: Math.max(w - 2 * inset, 0.05), sy: Math.max(h - 2 * inset, 0.05), sz: Math.max(l - 2 * inset, 0.05) });

export function ellipsoidGeometry(w, h, l, inset = 0) {
  const { sx, sy, sz } = ellipsoidDims(w, h, l, inset);
  const g = new SphereGeometry(0.5, 32, 20);
  const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
  const v = new Vector3();
  const perim = Math.PI * (sx + sz) / 2, half = Math.PI * sy / 2, s = 1 / Math.max(perim, half);
  const uv1 = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * sx, p.getY(i) * sy, p.getZ(i) * sz);
    v.set(nr.getX(i) / sx, nr.getY(i) / sy, nr.getZ(i) / sz).normalize();
    nr.setXYZ(i, v.x, v.y, v.z);
    uv1[i * 2] = uv.getX(i) * perim * s;
    uv1[i * 2 + 1] = uv.getY(i) * half * s;
    uv.setXY(i, uv.getX(i) * perim, uv.getY(i) * half);
  }
  g.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  return g;
}

// ------------------------------------------------------------------ lofts through any number of stations (connectors, custom-profile halls)
/**
 * A loft through stations {z, w, h, e}: superellipse sections (e = 2 round ... 16 almost rectangular), smooth shaded, closed at
 * both ends. `atlas` also fills uv1 with a paint canvas (strip along the side, the two end caps beside it); without it uv1 = 0.
 */
export function buildRings(stations, N = 40) {
  return stations.map(s => {
    const pts = [];
    for (let j = 0; j < N; j++) {
      const a = (2 * Math.PI * j) / N;
      const c = Math.cos(a), sn = Math.sin(a);
      pts.push(new Vector3(Math.sign(c) * Math.abs(c) ** (2 / s.e) * s.w / 2, Math.sign(sn) * Math.abs(sn) ** (2 / s.e) * s.h / 2, s.z));
    }
    return pts;
  });
}

function ringsAtlas(rings, stations) {
  const N = rings[0].length;
  const per = rings.map(r => { let s = 0; for (let j = 0; j < N; j++) s += r[j].distanceTo(r[(j + 1) % N]); return s; });
  const vcum = [0];
  for (let i = 1; i < rings.length; i++) {
    let d = 0;
    for (let j = 0; j < N; j++) d += rings[i][j].distanceTo(rings[i - 1][j]);
    vcum.push(vcum[i - 1] + d / N);
  }
  const P = Math.max(...per), Lp = vcum[vcum.length - 1];
  const cw = Math.max(...stations.map(s => s.w)), ch = Math.max(...stations.map(s => s.h)), G = 0.3;
  return { per, vcum, P, cw, ch, G, s: 1 / Math.max(P + G + cw, Lp, 2 * ch + G) };
}

export function morphLoft(stations, N = 40, atlas = false) {
  const rings = buildRings(stations, N);
  const K = rings.length;
  const pos = [], nor = [], uv = [], uv1 = [], idx = [];
  const arc = rings.map(r => { const o = [0]; for (let j = 1; j <= N; j++) o.push(o[j - 1] + r[j % N].distanceTo(r[j - 1])); return o; });
  const AT = atlas ? ringsAtlas(rings, stations) : null;
  const base = [];
  const a = new Vector3(), b = new Vector3();
  for (let i = 0; i < K; i++) {
    base.push(pos.length / 3);
    const lo = rings[Math.max(i - 1, 0)], hi = rings[Math.min(i + 1, K - 1)];
    for (let j = 0; j <= N; j++) {
      const jj = j % N, p = rings[i][jj];
      a.subVectors(rings[i][(jj + 1) % N], rings[i][(jj - 1 + N) % N]);
      b.subVectors(hi[jj], lo[jj]);
      const n = a.cross(b).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(arc[i][j], p.z);
      if (AT) uv1.push((arc[i][j] / arc[i][N]) * AT.P * AT.s, AT.vcum[i] * AT.s); else uv1.push(0, 0);
    }
  }
  for (let i = 0; i < K - 1; i++) {
    for (let j = 0; j < N; j++) {
      const p0 = base[i] + j, p1 = base[i] + j + 1, q0 = base[i + 1] + j, q1 = base[i + 1] + j + 1;
      idx.push(p0, p1, q1, p0, q1, q0);
    }
  }
  const cap = (ring, z, nz, flip, front) => {
    const c = pos.length / 3;
    const capUv = (x, y) => (AT ? [(AT.P + AT.G + AT.cw / 2 + x) * AT.s, ((front ? 0 : AT.ch + AT.G) + AT.ch / 2 + y) * AT.s] : [0, 0]);
    pos.push(0, 0, z); nor.push(0, 0, nz); uv.push(0, 0); uv1.push(...capUv(0, 0));
    const first = pos.length / 3;
    ring.forEach(p => { pos.push(p.x, p.y, z); nor.push(0, 0, nz); uv.push(p.x, p.y); uv1.push(...capUv(p.x, p.y)); });
    for (let j = 0; j < N; j++) {
      const u0 = first + j, u1 = first + ((j + 1) % N);
      if (flip) idx.push(c, u1, u0); else idx.push(c, u0, u1);
    }
  };
  cap(rings[0], rings[0][0].z, -1, true, false);
  cap(rings[K - 1], rings[K - 1][0].z, 1, false, true);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ custom-profile halls
/** presets for the profile editor: [t along the length 0..1, scale of the cross-section] */
export const PROFILE_PRESETS = {
  'Dished ends': [[0, 0.45], [0.04, 0.75], [0.08, 0.95], [0.12, 1], [0.88, 1], [0.92, 0.95], [0.96, 0.75], [1, 0.45]],
  'Capsule': [[0, 0.08], [0.02, 0.45], [0.05, 0.7], [0.1, 0.9], [0.16, 1], [0.84, 1], [0.9, 0.9], [0.95, 0.7], [0.98, 0.45], [1, 0.08]],
  'Dome (flat base)': [[0, 1], [0.15, 0.99], [0.3, 0.95], [0.45, 0.89], [0.6, 0.8], [0.75, 0.66], [0.88, 0.46], [0.96, 0.25], [1, 0.08]],
  'Bullet': [[0, 1], [0.7, 1], [0.8, 0.93], [0.9, 0.75], [0.96, 0.5], [1, 0.15]],
  'Cone': [[0, 1], [1, 0.15]],
  'Flanged ends': [[0, 1.2], [0.05, 1.2], [0.052, 1], [0.948, 1], [0.95, 1.2], [1, 1.2]],
  'Bottle': [[0, 1], [0.55, 1], [0.7, 0.55], [0.9, 0.5], [1, 0.6]],
  'Spindle': [[0, 0.15], [0.12, 0.6], [0.3, 0.9], [0.5, 1], [0.7, 0.9], [0.88, 0.6], [1, 0.15]],
  'Waisted': [[0, 1], [0.35, 0.7], [0.5, 0.6], [0.65, 0.7], [1, 1]],
  'Sphere': Array.from({ length: 21 }, (_, i) => [i / 20, Math.max(Math.sin(Math.PI * i / 20), 0.06)]),
};

/**
 * stations of a profile hall (outer, or the cavity when inset > 0).
 * The cavity is the outline pushed inward by the wall thickness (a true offset of the profile curve, with mitred corners),
 * so steps and flanges keep a wall of the same thickness instead of the inside poking out through the skin.
 */
export function profileStations(hall, inset = 0) {
  const prof = hall.profile?.length >= 2 ? hall.profile : PROFILE_PRESETS['Dished ends'];
  const t = inset, e = hall.pkind === 'rect' ? 16 : 2, L = hall.l;
  const base = [];
  for (const [u, sc] of prof) {
    const z = -L / 2 + L * u;
    if (base.length && z - base[base.length - 1].z < 0.004) continue;
    base.push({ z, s: sc });
  }
  const outer = base.map(p => ({ z: p.z, w: hall.w * p.s, h: hall.h * p.s, e }));
  if (!(t > 0)) return outer.length >= 2 ? outer : [{ z: -L / 2, w: hall.w, h: hall.h, e }, { z: L / 2, w: hall.w, h: hall.h, e }];
  if (base.length < 2) return [{ z: -L / 2 + t, w: Math.max(hall.w - 2 * t, 0.05), h: Math.max(hall.h - 2 * t, 0.05), e }, { z: L / 2 - t, w: Math.max(hall.w - 2 * t, 0.05), h: Math.max(hall.h - 2 * t, 0.05), e }];
  // closed outline in (z, radius): axis -> first station -> ... -> last station -> axis; its inside is to the right of the walk
  const rAvg = (hall.w + hall.h) / 4;
  const poly = [[base[0].z, 0], ...base.map(p => [p.z, p.s * rAvg]), [base[base.length - 1].z, 0]];
  const norm = (a, b) => { const dz = b[0] - a[0], dr = b[1] - a[1], len = Math.hypot(dz, dr); return len < 1e-9 ? null : [dr / len, -dz / len]; };
  const out = [];
  for (let k = 1; k < poly.length - 1; k++) {
    const n1 = norm(poly[k - 1], poly[k]) || norm(poly[k], poly[k + 1]) || [0, -1];
    const n2 = norm(poly[k], poly[k + 1]) || n1;
    let mz = n1[0] + n2[0], mr = n1[1] + n2[1];
    const ml = Math.hypot(mz, mr);
    if (ml < 1e-6) { mz = n1[0]; mr = n1[1]; } else { mz /= ml; mr /= ml; }
    const k2 = t / Math.max(0.35, mz * n1[0] + mr * n1[1]);        // mitre length, kept finite on sharp corners
    const z = poly[k][0] + mz * k2, r = poly[k][1] + mr * k2;
    if (out.length && z - out[out.length - 1].z < 0.002) continue;
    const dr = poly[k][1] - r;                                      // how far inward the surface moved (radially)
    out.push({ z, w: Math.max(hall.w * base[k - 1].s - 2 * dr, 0.05), h: Math.max(hall.h * base[k - 1].s - 2 * dr, 0.05), e });
  }
  if (hall.openB) out[0].z = -L / 2 - 0.06;
  if (hall.openF) out[out.length - 1].z = L / 2 + 0.06;
  return out.length >= 2 ? out : [{ z: -L / 2 + t, w: Math.max(hall.w - 2 * t, 0.05), h: Math.max(hall.h - 2 * t, 0.05), e }, { z: L / 2 - t, w: Math.max(hall.w - 2 * t, 0.05), h: Math.max(hall.h - 2 * t, 0.05), e }];
}

// ------------------------------------------------------------------ halls
const loftParams = (hall, inset) => ({
  kind: hall.shape === 'box' ? 'rect' : 'ngon', sides: hall.shape === 'tube' ? 32 : hall.shape === 'prism' ? hall.sides : 4,
  w: hall.w, h: hall.h, l: hall.l, sf: hall.sf, sb: hall.sb, ay: hall.ay || 0, inset, openF: hall.openF, openB: hall.openB,
});

/** outer shape of a hall (inset 0) or its cavity (inset = wall thickness) */
export function hallGeometry(hall, inset = 0) {
  if (hall.shape === 'sphere') return ellipsoidGeometry(hall.w, hall.h, hall.l, inset);
  if (hall.shape === 'profile') return morphLoft(profileStations(hall, inset), 40, true);
  return loftGeometry(loftParams(hall, inset));
}

/** normalised canvas units per metre of a hall's paint canvas (outer surface: inset 0, inner surface: inset = wall) */
export function atlasScale(hall, inset = 0) {
  if (hall.shape === 'sphere') {
    const { sx, sy, sz } = ellipsoidDims(hall.w, hall.h, hall.l, inset);
    return 1 / Math.max(Math.PI * (sx + sz) / 2, Math.PI * sy / 2);
  }
  if (hall.shape === 'profile') {
    const st = profileStations(hall, inset), rings = buildRings(st, 40);
    return ringsAtlas(rings, st).s;
  }
  const p = loftParams(hall, inset), d = loftDims(p);
  return loftAtlas(d, sectionPoints(d.kind, d.sides)).s;
}

// ------------------------------------------------------------------ torn ends
function jag(theta, seed) {
  let s = 0, tot = 0;
  [2, 3, 5, 7, 11, 17].forEach((k, i) => {
    const amp = (0.5 + 0.5 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233))) / Math.sqrt(k);
    s += amp * Math.sin(k * theta + seed * 6.1 + i * 2.7);
    tot += amp;
  });
  return Math.pow(0.5 + 0.5 * s / tot, 1.8);
}

/**
 * The solid that is bitten off the end of a hall to leave a jagged, torn edge.
 * `end` = +1 (front) or -1 (back); `depth` = how far the tear reaches back at its deepest (m).
 */
export function tearGeometry(hall, end, depth, seed = 1) {
  const N = 56, R = 0.5 * Math.max(hall.w, hall.h) * 1.7;
  const zEnd = end * hall.l / 2, zTop = zEnd + end * 2;
  const d = Array.from({ length: N }, (_, j) => 0.15 + depth * jag((2 * Math.PI * j) / N, seed));
  const dm = d.reduce((a, b) => a + b, 0) / N;
  const P = [], I = [];
  const ringB = d.map((dj, j) => { const a = (2 * Math.PI * j) / N; return new Vector3(R * Math.cos(a), R * Math.sin(a), zEnd - end * dj); });
  const ringT = ringB.map(p => new Vector3(p.x, p.y, zTop));
  const cB = new Vector3(0, 0, zEnd - end * dm * 1.1), cT = new Vector3(0, 0, zTop);
  const tri = (a, b, c) => { P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); };
  for (let j = 0; j < N; j++) {
    const j1 = (j + 1) % N;
    if (end > 0) { tri(cB, ringB[j1], ringB[j]); tri(cT, ringT[j], ringT[j1]); tri(ringB[j], ringB[j1], ringT[j1]); tri(ringB[j], ringT[j1], ringT[j]); }
    else { tri(cB, ringB[j], ringB[j1]); tri(cT, ringT[j1], ringT[j]); tri(ringB[j], ringT[j1], ringB[j1]); tri(ringB[j], ringT[j], ringT[j1]); }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  g.setAttribute('uv1', new Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
  return g;
}

/** the flat floor deck of a tube/prism hall: a slab that fills the inside at height `deckY` above the lowest inner point */
export function deckGeometry(hall, wall) {
  const a = Math.max(hall.w - 2 * wall, 0.1) / 2, b = Math.max(hall.h - 2 * wall, 0.1) / 2;
  const y = Math.min(Math.max(hall.deckY, 0.05), b * 1.9) - b;
  const chord = a * Math.sqrt(Math.max(1 - (y / b) ** 2, 0.02)) + wall * 0.5;
  const len = Math.max(hall.l - 2 * wall, 0.1);
  const th = 0.1;
  const g = new THREE.BoxGeometry(chord * 2, th, len);
  g.clearGroups(); // a Brush has one material; the box's 6 face groups would confuse the CSG
  g.translate(0, y - th / 2 + 0.005, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  g.setAttribute('uv1', new Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return g;
}

/** trim lining the mouth of an opening: sits inside the wall, with a small lip showing in the opening */
export function frameGeometry(round, w, h, depth, lip = 0.035, emb = 0.08) {
  const sh = new Shape(), hole = new Path();
  if (round) {
    sh.absellipse(0, 0, w / 2 + emb, h / 2 + emb, 0, Math.PI * 2, false);
    hole.absellipse(0, 0, w / 2 - lip, h / 2 - lip, 0, Math.PI * 2, true);
  } else {
    const ow = w / 2 + emb, oh = h / 2 + emb, iw = w / 2 - lip, ih = h / 2 - lip;
    sh.moveTo(-ow, -oh); sh.lineTo(ow, -oh); sh.lineTo(ow, oh); sh.lineTo(-ow, oh); sh.lineTo(-ow, -oh);
    hole.moveTo(-iw, -ih); hole.lineTo(-iw, ih); hole.lineTo(iw, ih); hole.lineTo(iw, -ih); hole.lineTo(-iw, -ih);
  }
  sh.holes.push(hole);
  const g = new ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  return g;
}
