// Builds the hull as one solid:  (all hall outsides + tunnel collars)  minus  (all hall insides + doorway cavities)  plus  floor decks.
// Overlapping halls therefore merge into one skin, and every doorway is a clean hole through every wall it crosses.
import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { hallGeometry, deckGeometry, tearGeometry, loftGeometry } from './geo.js';
import { crossAt } from './frame.js';
import { wallOf, trimsOf } from './ship.js';
import { tunnelGeometry } from './connector.js';

let evaluator = null;
/** a fresh solid-geometry engine (after an error inside the old one its working buffers cannot be trusted) */
export function resetCsg() {
  evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv', 'uv1'];
  evaluator.useGroups = true;
}
resetCsg();

function brush(geo, matrix, material) {
  const b = new Brush(geo, material);
  matrix.decompose(b.position, b.quaternion, b.scale);
  b.updateMatrixWorld(true);
  return b;
}


/**
 * One solid-geometry operation that never takes the whole build down. Surfaces that coincide exactly (a hall copied on top of
 * itself, halves cut on one plane) can defeat the engine; then the second shape is nudged a hair and it tries again, and if it
 * still cannot be done that one operation is skipped.
 */
function ev(a, b, op) {
  const nudges = [[0, 0, 0], [0.0007, 0.0011, 0.0005], [-0.0013, 0.0006, -0.0009], [0.0021, -0.0017, 0.0014]];
  for (const n of nudges) {
    const px = b.position.x, py = b.position.y, pz = b.position.z;
    try {
      b.position.x += n[0]; b.position.y += n[1]; b.position.z += n[2];
      b.updateMatrixWorld(true);
      return evaluator.evaluate(a, b, op);
    } catch (e) {
      resetCsg();
    } finally {
      b.position.set(px, py, pz);
      b.updateMatrixWorld(true);
    }
  }
  console.warn('A solid-geometry step was skipped (coincident surfaces)');
  return a;
}

const _a = new THREE.Box3(), _b = new THREE.Box3();
/** world bounding box of a brush */
function boxOf(b, out) {
  if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
  b.updateMatrixWorld(true);
  return out.copy(b.geometry.boundingBox).applyMatrix4(b.matrixWorld);
}
const touches = (x, y) => boxOf(x, _a).intersectsBox(boxOf(y, _b));

/** union of many brushes, combined pairwise (small with small) instead of one by one into an ever-growing result */
function unionAll(list) {
  let cur = list.slice();
  while (cur.length > 1) {
    const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? ev(cur[i], cur[i + 1], ADDITION) : cur[i]);
    cur = next;
  }
  return cur[0] || null;
}

/** a hall's brush with one side of a plane (in the hall's own axes) sliced off */
function trimmed(b, hall, W, mat, open = 0) {
  for (const t of trimsOf(hall)) {
    // how much of the hall along this axis is left: nothing / a sliver is gone, a plane outside the hall cuts nothing
    // (slicing off a hair's breadth makes the solid-geometry step fail or hang, so it is never attempted)
    const ext = (t.axis === 'x' ? hall.w : t.axis === 'y' ? hall.h : hall.l) / 2, kept = t.keep === 'below' ? t.pos + ext : ext - t.pos;
    if (kept >= 2 * ext - 0.02) continue;
    if (kept <= 0.1) return null;
    // `open`: the hollow inside is cut a little beyond the skin's cut, so the slice shows a clean open section (equal planes confuse the solid-geometry step)
    try { b = trimOnce(b, hall, open ? { ...t, pos: t.pos + (t.keep === 'below' ? open : -open) } : t, W, mat); } catch (e) { resetCsg(); return null; }       // a cut that leaves only a sliver (or none) of the hall: treat it as gone
    if (!(b.geometry.attributes.position?.count > 0)) return null;        // the planes cut the whole hall away
  }
  return b;
}
function trimOnce(b, hall, t, W, mat) {
  const big = Math.max(hall.w, hall.h, hall.l) * 3 + 10, ai = 'xyz'.indexOf(t.axis);
  const g = new THREE.BoxGeometry(big, big, big);
  g.clearGroups();
  const c = [0, 0, 0];
  c[ai] = t.pos + (t.keep === 'below' ? 1 : -1) * big / 2;
  g.translate(c[0], c[1], c[2]);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return ev(b, brush(g, W, mat), SUBTRACTION);
}

/** a flat floor for any hall shape: a slab cut to exactly fit the hall's cavity (slab INTERSECT cavity) */
function fittedDeck(hall, t, W, mat) {
  const y = -(hall.h / 2 - t) + Math.min(Math.max(hall.deckY, 0.05), hall.h), th = hall.deckFill ? hall.h + 1 : 0.1;       // solid floor: the slab reaches down through the bottom of the hall
  const g = new THREE.BoxGeometry(hall.w * 2 + 1, th, hall.l * 2 + 1);
  g.clearGroups();
  g.translate(0, y - th / 2 + 0.005, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return ev(brush(g, W, mat), brush(hallGeometry(hall, Math.max(t - 0.05, 0.01)), W, mat), INTERSECTION);
}

/** hall-local height of the walking surface: the deck, or the lowest point of the inside */
export function floorLevel(ship, hall) {
  const t = wallOf(ship, hall), b = Math.max(hall.h - 2 * t, 0.1) / 2;
  if (!hall.deck) return -b;
  return Math.min(Math.max(hall.deckY, 0.05), b * 1.9) - b;
}

/**
 * The threshold between two rooms: fills the floor of the passage so the two floors meet (a ramp, a step, or a flat sill),
 * shaped as (profile prism) INTERSECT (the passage's hole), in the tunnel frame.
 */
function sillBrush(ship, worlds, hall, tp, getMat) {
  const c = hall.conn, par = ship.halls.find(h => h.id === c.parent);
  if (!par || (c.v ?? 1) < 2 || (c.sill || 'auto') === 'none' || !(par.deck || hall.deck)) return null;
  const mode = c.sill || 'auto';
  const T = tp.matrix, Ti = T.clone().invert();
  const yIn = (h, lvl) => new THREE.Vector3(0, lvl, 0).applyMatrix4(worlds.get(h.id)).applyMatrix4(Ti).y;
  const yP = yIn(par, floorLevel(ship, par)), yC = yIn(hall, floorLevel(ship, hall));
  const tP = wallOf(ship, par), tC = wallOf(ship, hall), len = c.len;
  const z0 = -tP, z1 = len + tC, zm = (z0 + z1) / 2;
  if (mode === 'auto' && Math.abs(yP - yC) < 0.01) { /* same level: still fill the passage floor flat */ }
  const lift = 0.003;
  const lo = Math.min(yP, yC), hi = Math.max(yP, yC);
  const zA = -tP - 0.8 - 0.2 * Math.max(tp.E.A.w, tp.E.A.h), zB = len + tC + 0.8 + 0.2 * Math.max(tp.E.B.w, tp.E.B.h);
  const pts = [];                                   // the top edge of the plug, [z, y]
  const m = mode === 'auto' ? 'ramp' : mode;
  if (m === 'fill') pts.push([zA, hi + lift], [zB, hi + lift]);
  else if (m === 'step') pts.push([zA, yP + lift], [zm, yP + lift], [zm, yC + lift], [zB, yC + lift]);
  else pts.push([zA, yP + lift], [z0, yP + lift], [z1, yC + lift], [zB, yC + lift]);
  const bottom = lo - Math.max(tp.E.A.h, tp.E.B.h) - 1;
  const sh = new THREE.Shape();
  sh.moveTo(zA, bottom);
  pts.forEach(([z, y]) => sh.lineTo(z, y));
  sh.lineTo(zB, bottom);
  sh.lineTo(zA, bottom);
  const wide = Math.max(tp.E.A.w, tp.E.B.w) + 1;
  const g = new THREE.ExtrudeGeometry(sh, { depth: wide, bevelEnabled: false });
  g.translate(0, 0, -wide / 2);
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));   // shape x -> passage z, shape y -> up, extrusion -> across
  g.clearGroups();
  const n = g.attributes.position.count;
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const pm = getMat(hall.id, hall.deck ? 'floor' : 'int');
  const plug = brush(g, T, pm);
  return ev(plug, brush(tp.cavityGeo, tp.matrix, pm), INTERSECTION);
}

/**
 * @param getMat (hallId, 'ext'|'int') -> THREE.Material with userData.key
 * @param cutters extra holes to cut: [{geo, matrix, hallId}] (windows and other hull pieces)
 * @returns {geometry, materials} or null when there is nothing to build
 */
/** milliseconds spent in each stage of the last build (for finding what is slow) */
export const profile = {};

export function buildHull(ship, worlds, getMat, cutters = []) {
  const outers = [], inners = [], decks = [], slabs = [], holes = [], bulks = [], tunnels = [], sills = [], plugs = [], tearsOf = new Map();
  const live = new Set(ship.halls.filter(h => !h.hidden).map(h => h.id));
  for (const hall of ship.halls) {
    if (!live.has(hall.id)) continue;
    const W = worlds.get(hall.id), t = wallOf(ship, hall);
    const ob = trimmed(brush(hallGeometry(hall, 0), W, getMat(hall.id, 'ext')), hall, W, getMat(hall.id, 'ext'), 0.005);       // halves cut on the same plane overlap by 5 mm, never touch face to face
    if (!ob) continue;                                                      // nothing of this hall is left after the cuts
    outers.push(ob);
    if (hall.hollow) {
      const ib = trimmed(brush(hallGeometry(hall, t), W, getMat(hall.id, 'int')), hall, W, getMat(hall.id, 'int'), 0.03);
      if (ib) inners.push(ib);
      const deckBrush = !hall.deck ? null : (hall.shape === 'tube' || hall.shape === 'prism') && !hall.deckFill ? trimmed(brush(deckGeometry(hall, t), W, getMat(hall.id, 'floor')), hall, W, getMat(hall.id, 'floor')) : trimmed(fittedDeck(hall, t, W, getMat(hall.id, 'floor')), hall, W, getMat(hall.id, 'floor'));
      if (hall.deck && deckBrush) decks.push({ hallId: hall.id, b: deckBrush });
    }
    if (hall.hollow && hall.shape !== 'sphere') {                  // bulkheads: internal walls, optionally with a doorway through them
      const kind = hall.shape === 'box' ? 'rect' : hall.shape === 'profile' && hall.pkind === 'rect' ? 'rect' : 'ngon';
      const sides = hall.shape === 'prism' ? hall.sides : 32;
      for (const b of hall.bulkheads || []) {
        const c = crossAt(hall, (b.z + hall.l / 2) / hall.l, t);
        const zero = g => { g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
        const at = (x, y) => W.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, b.z));
        const slab = brush(zero(loftGeometry({ kind, sides, w: c.w + 1.6 * t, h: c.h + 1.6 * t, l: b.th })), at(0, 0), getMat(hall.id, 'int'));
        const hole = b.hole.kind !== 'none' ? brush(zero(loftGeometry({ kind: b.hole.kind === 'rect' ? 'rect' : 'ngon', sides: 32, w: b.hole.w, h: b.hole.h, l: b.th + 0.5 })), at(b.hole.x, b.hole.y), getMat(hall.id, 'int')) : null;
        slabs.push(slab);
        bulks.push({ hallId: hall.id, slab, hole });
      }
    }
    for (const [end, depth] of [[1, hall.tear?.f || 0], [-1, hall.tear?.b || 0]]) {   // torn, jagged ends
      if (depth > 0.01) {
        const tb = brush(tearGeometry(hall, end, depth, hall.tear.seed || 1), W, getMat(hall.id, 'int'));
        inners.push(tb);
        if (!tearsOf.has(hall.id)) tearsOf.set(hall.id, []);
        tearsOf.get(hall.id).push(tb);
      }
    }
    if (hall.conn && hall.conn.type !== 'fuse' && live.has(hall.conn.parent)) {
      const tp = tunnelGeometry(ship, worlds, hall);
      if (tp.shell) outers.push(brush(tp.shell.geo, tp.shell.matrix, getMat(hall.id, 'ext')));
      const cb = brush(tp.cavity.geo, tp.cavity.matrix, getMat(hall.id, 'int'));
      inners.push(cb);
      tunnels.push({ child: hall.id, parent: hall.conn.parent, cavity: cb });
      sills.push({ hall, tp: { ...tp, cavityGeo: tp.cavity.geo } });
    }
  }
  for (const c of cutters) if (live.has(c.hallId)) inners.push(brush(c.geo, c.matrix, getMat(c.hallId, 'int')));
  if (!outers.length) return null;
  // floors stop at a torn end and at every doorway through them (otherwise a flat plank sticks out of the jagged edge)
  for (const d of decks) {
    for (const tb of tearsOf.get(d.hallId) || []) if (touches(d.b, tb)) d.b = ev(d.b, tb, SUBTRACTION);
    for (const tn of tunnels) if ((tn.child === d.hallId || tn.parent === d.hallId) && touches(d.b, tn.cavity)) d.b = ev(d.b, tn.cavity, SUBTRACTION);
  }
  const tick = (k) => { const n = performance.now(); profile[k] = Math.round(n - T0); T0 = n; };
  let T0 = performance.now();
  // a bulkhead's doorway is cut in the (small) wall on its own, and through that room's floor, instead of through the whole finished hull
  for (const bk of bulks) {
    if (!bk.hole) continue;
    for (const d of decks) if (d.hallId === bk.hallId && touches(d.b, bk.hole)) d.b = ev(d.b, bk.hole, SUBTRACTION);
    const i = slabs.indexOf(bk.slab);
    bk.slab = ev(bk.slab, bk.hole, SUBTRACTION);
    slabs[i] = bk.slab;
    holes.push(bk.hole);
  }
  // The big hull is only worked on twice: (all outsides) minus (all holes), then plus (floors, thresholds, walls).
  // Everything else is combined first, in pairs, while the pieces are still small - that is what keeps rebuilds quick.
  const solid = b => b && b.geometry.attributes.position?.count > 0;
  let acc = unionAll(outers);
  tick('outers');
  const outerBox = boxOf(acc, new THREE.Box3());
  const holesAll = unionAll(inners.filter(b => boxOf(b, _b).intersectsBox(outerBox)));
  if (solid(holesAll)) acc = ev(acc, holesAll, SUBTRACTION);
  tick('inners');
  tick('deckPrep');
  const extras = decks.map(d => d.b).filter(solid);
  tick('decks');
  for (const s of sills) { const sb = sillBrush(ship, worlds, s.hall, s.tp, getMat); if (solid(sb)) { extras.push(sb); plugs.push(sb); } }
  tick('sills');
  extras.push(...slabs.filter(solid));
  const add = unionAll(extras);
  if (solid(add)) acc = ev(acc, add, ADDITION);
  tick('slabsHoles');
  const geometry = acc.geometry;
  const materials = [].concat(acc.material);
  // free the helper geometries (the result owns its own buffers)
  [...outers, ...inners, ...decks.map(d => d.b), ...slabs, ...holes, ...plugs].forEach(b => { if (b !== acc) b.geometry.dispose(); });
  return { geometry, materials };
}

/** the triangles of a built hull whose material key passes `test(key)`, as a fresh (indexed, multi-material) geometry */
export function extractGeometry(geometry, materials, test) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, uv = geometry.attributes.uv;
  const index = geometry.index;
  const P = [], N = [], U = [], U1 = [], groups = [];
  const uv1 = geometry.attributes.uv1;
  let count = 0;
  const groupList = geometry.groups.length ? geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
  const used = [];
  for (const g of groupList) {
    const mat = materials[g.materialIndex];
    if (!mat || !test(mat.userData.key)) continue;
    let slot = used.indexOf(g.materialIndex);
    if (slot < 0) { slot = used.length; used.push(g.materialIndex); }
    const start = count;
    const end = g.count === Infinity ? (index ? index.count : pos.count) : g.start + g.count;
    for (let i = g.start; i < end; i++) {
      const vi = index ? index.getX(i) : i;
      P.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
      N.push(nor.getX(vi), nor.getY(vi), nor.getZ(vi));
      U.push(uv ? uv.getX(vi) : 0, uv ? uv.getY(vi) : 0);
      U1.push(uv1 ? uv1.getX(vi) : 0, uv1 ? uv1.getY(vi) : 0);
      count++;
    }
    groups.push({ start, count: count - start, materialIndex: slot });
  }
  if (!count) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(U1, 2));
  groups.forEach(x => g.addGroup(x.start, x.count, x.materialIndex));
  return { geometry: g, materialIndices: used };
}
