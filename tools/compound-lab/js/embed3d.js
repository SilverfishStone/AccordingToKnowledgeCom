/* A 3D shape for a molecule, made here because the chemistry library in the browser only draws flat pictures.

   It starts from the flat layout, then pushes the atoms around until bond lengths, bond angles (by the kind of atom:
   tetrahedral, trigonal planar, linear), flat rings and flat double-bond systems, and the sizes of the atoms (no two
   overlapping) all agree as well as they can. This is a geometric relaxation, not a quantum calculation: it gives a
   believable shape to look at, not exact bond lengths or the lowest-energy twist of a flexible chain. */
const COV = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Cl: 1.02, Br: 1.2, I: 1.39, S: 1.05, P: 1.07, B: 0.84, Si: 1.11, Se: 1.2 };
const VDW = { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, Cl: 1.75, Br: 1.85, I: 1.98, S: 1.8, P: 1.8, B: 1.92, Si: 2.1, Se: 1.9 };
const BOND_FACTOR = { 1: 1, 2: 0.88, 3: 0.8, arom: 0.92 };

// a small repeatable random source so the same molecule always comes out the same way
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function embed3D(graph) {
  const { atoms, bonds } = graph, n = atoms.length;
  const adj = Array.from({ length: n }, () => []);
  const bondOf = new Map();
  for (const b of bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); bondOf.set(Math.min(b.a, b.b) + "-" + Math.max(b.a, b.b), b); }
  const getBond = (i, j) => bondOf.get(Math.min(i, j) + "-" + Math.max(i, j));
  const rad = (el) => COV[el] ?? 0.9, vdw = (el) => VDW[el] ?? 1.8;
  const blen = (i, j) => {
    const b = getBond(i, j), f = b.arom ? BOND_FACTOR.arom : BOND_FACTOR[b.order] || 1;
    return (rad(atoms[i].el) + rad(atoms[j].el)) * f;
  };

  // what kind of centre each atom is, which sets the angle between its bonds
  const angleAt = new Array(n).fill(109.5), flat = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const bs = adj[i].map((j) => getBond(i, j));
    const dbl = bs.filter((b) => b.order === 2 && !b.arom).length, trip = bs.some((b) => b.order === 3), arom = bs.some((b) => b.arom);
    if (trip || dbl >= 2) { angleAt[i] = 180; flat[i] = true; }
    else if (dbl === 1 || arom) { angleAt[i] = 120; flat[i] = true; }
    else if (atoms[i].el === "N" && adj[i].length === 3 && adj[i].some((j) => flat[j] || atoms[j].el === "C" && getBond(i, j) && adj[j].some((k) => k !== i && getBond(j, k).order === 2))) { angleAt[i] = 118; flat[i] = true; }
    else if (atoms[i].el === "O" && adj[i].length === 2) angleAt[i] = 106;
    else if (atoms[i].el === "S" && adj[i].length === 2) angleAt[i] = 100;
    else if (atoms[i].el === "N" && adj[i].length === 3) angleAt[i] = 108;
  }
  // N and O next to a flat carbon (anilines, amides, ethers on rings) join its plane
  for (let i = 0; i < n; i++) {
    if (flat[i] || !(atoms[i].el === "N" || atoms[i].el === "O") || adj[i].length < 2) continue;
    if (adj[i].some((j) => flat[j] && atoms[j].el === "C" && (getBond(i, j).order === 1))) { angleAt[i] = atoms[i].el === "O" ? 118 : 120; flat[i] = true; }
  }

  // the angle between two bonds at an atom: set by the smallest ring they share, else by the kind of atom; at a flat atom with
  // three bonds the angle left over after the ring angles is shared out among the bonds that aren't in a ring together
  const rings = graph.rings || [], RING_ANGLE = { 3: 60, 4: 90, 5: 108, 6: 120, 7: 128, 8: 135 };
  const ringSize = (c, x, y) => rings.filter((r) => r.includes(c) && r.includes(x) && r.includes(y)).reduce((m, r) => Math.min(m, r.length), 99);
  const angCache = new Map();
  const ang = (c, x, y) => {
    const key = c + "-" + Math.min(x, y) + "-" + Math.max(x, y);
    if (angCache.has(key)) return angCache.get(key);
    let v = angleAt[c];
    const rs = ringSize(c, x, y);
    if (rs < 99) v = flat[c] ? RING_ANGLE[rs] ?? 120 : rs === 5 ? 104 : rs === 6 ? 111 : rs === 3 ? 60 : rs === 4 ? 90 : v;
    else if (flat[c] && adj[c].length === 3) {
      const [a, b, d] = adj[c];
      let known = 0, unknown = 0;
      for (const [u, w] of [[a, b], [a, d], [b, d]]) { const r = ringSize(c, u, w); if (r < 99) known += RING_ANGLE[r] ?? 120; else unknown++; }
      v = unknown ? (360 - known) / unknown : 120;
    }
    angCache.set(key, v);
    return v;
  };

  const springs = [];   // [i, j, target distance, strength]
  for (const b of bonds) springs.push([b.a, b.b, blen(b.a, b.b), 2.5]);
  for (let c = 0; c < n; c++) {
    const nb = adj[c];
    for (let x = 0; x < nb.length; x++) for (let y = x + 1; y < nb.length; y++) {
      const d1 = blen(c, nb[x]), d2 = blen(c, nb[y]), th = (ang(c, nb[x], nb[y]) * Math.PI) / 180;
      springs.push([nb[x], nb[y], Math.sqrt(d1 * d1 + d2 * d2 - 2 * d1 * d2 * Math.cos(th)), 1.2]);
    }
  }

  // start from the flat layout (scaled to real bond lengths), with a little depth to break the symmetry
  const rand = rng(7), pos = atoms.map((a) => [a.x * 0.93, a.y * 0.93, (rand() - 0.5) * 0.8]);

  // flat systems stay flat: pairs four bonds apart across a bond between two flat atoms keep their flat-layout distance
  for (const b of bonds) {
    if (!flat[b.a] || !flat[b.b]) continue;
    // a single bond joining two aromatic rings is not held flat: the second ring starts turned about 40° and settles from there
    if (!b.arom && b.order === 1 && bonds.some((o) => o.arom && (o.a === b.a || o.b === b.a)) && bonds.some((o) => o.arom && (o.a === b.b || o.b === b.b))) {
      const side = new Set([b.b]), stack = [b.b];
      let bridge = true;
      while (stack.length) {
        const x = stack.pop();
        for (const j of adj[x]) {
          if (x === b.b && j === b.a) continue;
          if (j === b.a) { bridge = false; continue; }
          if (!side.has(j)) { side.add(j); stack.push(j); }
        }
      }
      if (bridge) {
        const ax = [pos[b.b][0] - pos[b.a][0], pos[b.b][1] - pos[b.a][1], pos[b.b][2] - pos[b.a][2]], len = Math.hypot(...ax), k = ax.map((v) => v / len);
        const c = Math.cos((40 * Math.PI) / 180), sn = Math.sin((40 * Math.PI) / 180);
        for (const i of side) {
          const v = [pos[i][0] - pos[b.a][0], pos[i][1] - pos[b.a][1], pos[i][2] - pos[b.a][2]];
          const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]], dt = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
          for (let m = 0; m < 3; m++) pos[i][m] = pos[b.a][m] + v[m] * c + cr[m] * sn + k[m] * dt * (1 - c);
        }
      }
      continue;
    }
    // flat systems: atoms four bonds apart across the bond lie in one plane, on the same side (cis) or opposite sides (trans)
    const sideOf = (q) => Math.sign((atoms[b.b].x - atoms[b.a].x) * (atoms[q].y - atoms[b.a].y) - (atoms[b.b].y - atoms[b.a].y) * (atoms[q].x - atoms[b.a].x)) || 1;
    for (const p of adj[b.a]) if (p !== b.b) for (const q of adj[b.b]) if (q !== b.a && q !== p) {
      const r1 = blen(b.a, p), r2 = blen(b.a, b.b), r3 = blen(b.b, q), t1 = (ang(b.a, p, b.b) * Math.PI) / 180, t2 = (ang(b.b, q, b.a) * Math.PI) / 180;
      const s = sideOf(p) === sideOf(q) ? 1 : -1;
      springs.push([p, q, Math.hypot(r1 * Math.cos(t1) - (r2 - r3 * Math.cos(t2)), r1 * Math.sin(t1) - s * r3 * Math.sin(t2)), 0.8]);
    }
  }

  // which pairs are close enough in the bonding graph that they are not pushed apart
  const near = new Set();
  for (let i = 0; i < n; i++) for (const j of adj[i]) { near.add(i + "-" + j); for (const k of adj[j]) if (k !== i) near.add(i + "-" + k); }
  const far14 = new Set();
  for (let i = 0; i < n; i++) for (const j of adj[i]) for (const k of adj[j]) for (const l of adj[k]) if (l !== j && l !== i) far14.add(i + "-" + l);

  const force = pos.map(() => [0, 0, 0]);
  const iters = 2200;
  for (let it = 0; it < iters; it++) {
    for (const f of force) { f[0] = 0; f[1] = 0; f[2] = 0; }
    for (const [i, j, t, k] of springs) {
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1], dz = pos[j][2] - pos[i][2];
      const d = Math.hypot(dx, dy, dz) || 1e-6, s = (k * (d - t)) / d;
      force[i][0] += s * dx; force[i][1] += s * dy; force[i][2] += s * dz;
      force[j][0] -= s * dx; force[j][1] -= s * dy; force[j][2] -= s * dz;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const key = i + "-" + j;
      if (near.has(key)) continue;
      const lim = (vdw(atoms[i].el) + vdw(atoms[j].el)) * (far14.has(key) ? 0.7 : 0.82);
      const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1], dz = pos[j][2] - pos[i][2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      if (d >= lim) continue;
      const s = (0.5 * (d - lim)) / d;
      force[i][0] += s * dx; force[i][1] += s * dy; force[i][2] += s * dz;
      force[j][0] -= s * dx; force[j][1] -= s * dy; force[j][2] -= s * dz;
    }
    const step = 0.18 * (1 - it / iters) + 0.02, noise = it < iters * 0.4 ? 0.03 * (1 - it / (iters * 0.4)) : 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      let move = step * force[i][c] + (noise ? (rand() - 0.5) * noise : 0);
      if (move > 0.12) move = 0.12; else if (move < -0.12) move = -0.12;
      pos[i][c] += move;
    }
  }

  // centre it
  const cx = pos.reduce((t, p) => t + p[0], 0) / n, cy = pos.reduce((t, p) => t + p[1], 0) / n, cz = pos.reduce((t, p) => t + p[2], 0) / n;
  return pos.map((p) => [p[0] - cx, p[1] - cy, p[2] - cz]);
}

export const ELEMENT_STYLE = {
  H: { color: 0xf2f2f2, r: 0.3 }, C: { color: 0x6b6f76, r: 0.52 }, N: { color: 0x3a5cff, r: 0.5 }, O: { color: 0xff3b30, r: 0.48 },
  F: { color: 0x90e050, r: 0.42 }, Cl: { color: 0x1ff01f, r: 0.6 }, Br: { color: 0xa62929, r: 0.66 }, I: { color: 0x940094, r: 0.72 },
  S: { color: 0xf5d90a, r: 0.62 }, P: { color: 0xff8000, r: 0.6 }, B: { color: 0xffb5b5, r: 0.5 }, Si: { color: 0xf0c8a0, r: 0.62 },
};
export { COV, VDW };
