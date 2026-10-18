// Laying a ship out: placing free-standing hulls, linking two hulls with a hall, wings and scaffolding between halls, and groups of
// halls that move, turn and resize together. The state of the tools lives on `app` (placeH, bridgeTool); the data lives in the ship
// (ship.bridges, ship.groups, hall.group).
import * as THREE from 'three';
import { app } from './app.js';
import { newBridge, newHall, newConn, matrixToXf, branchOf, computeWorlds, HALL_DEFAULTS } from './ship.js';
import { anchorOf } from './bridge.js';
import { clone, newId, toast, round } from './util.js';

const { Vector3, Matrix4, Quaternion } = THREE;
const A = app.actions;

// ------------------------------------------------------------------ placing a hull
app.placeH = { shape: 'tube', w: 0, h: 0, l: 0, yaw: 0, y: null, snap: 0.5 };
app.multi = new Set();                         // halls picked together (ctrl-click) to be grouped
app.bridgeTool = { kind: 'wing', first: null };
app.linkOpts = { shape: 'tube', w: 2.2, h: 2.2, embed: 0.4 };

/** the size a hull will be placed at (the shape's default until you change it) */
export const placeSize = () => {
  const P = app.placeH, d = HALL_DEFAULTS[P.shape];
  return { w: P.w || d.w, h: P.h || d.h, l: P.l || d.l };
};

A.startPlaceHull = shape => {
  const P = app.placeH;
  if (shape && shape !== P.shape) Object.assign(P, { shape, w: 0, h: 0, l: 0 });
  A.setTool('place');
};

/** the height of the plane new hulls are placed on: set by you, or the middle of the ship */
export function placeY() {
  const P = app.placeH;
  if (P.y != null) return P.y;
  return app.ship.halls.length ? app.sv.bounds.getCenter(new Vector3()).y : 0;
}

A.placeHullAt = point => {
  const P = app.placeH, sz = placeSize(), n = app.ship.halls.filter(h => h.shape === P.shape).length + 1;
  const h = newHall(P.shape, { ...sz });
  h.name = `${h.name} ${n}`;
  h.xf = { p: [round(point.x, 3), round(point.y, 3), round(point.z, 3)], r: [0, P.yaw || 0, 0] };
  app.ship.halls.push(h);
  A.requestHull();
  A.commit();
  A.select('hall', h.id);
  app.emit('tree');
  return h;
};

// ------------------------------------------------------------------ wings, scaffolding, and halls that link two halls
A.requestBridges = () => { app.dirty.bridges = true; };
A.bridge = id => app.ship.bridges.find(b => b.id === id);

A.startBridge = kind => {
  app.bridgeTool = { kind, first: null };
  A.setTool('bridge');
};

/** a click of the wing / link tool: the first click picks a hall and a spot, the second picks the other */
A.bridgeClick = hit => {
  const T = app.bridgeTool;
  if (hit?.type !== 'hall' || hit.slot !== 'ext') { toast('Click the outside of a hall.'); return; }
  const hall = A.hall(hit.id), W = app.worlds.get(hit.id);
  if (!hall || !W) return;
  const here = { hall: hall.id, point: hit.point.clone(), ...anchorOf(hall, W, hit.point) };
  if (!T.first) { T.first = here; app.emit('tool'); toast('Now click the second hall.'); return; }
  if (T.first.hall === here.hall) { toast('Pick a different hall for the other end.'); return; }
  const a = T.first;
  T.first = null;
  if (T.kind === 'hall') A.createLinkHall(a, here);
  else {
    const br = newBridge(T.kind, { hall: a.hall, u: a.u, ang: a.ang }, { hall: here.hall, u: here.u, ang: here.ang });
    br.name = `${br.name} ${app.ship.bridges.filter(b => b.kind === br.kind).length + 1}`;
    app.ship.bridges.push(br);
    A.requestBridges();
    A.commit();
    A.setTool('select');
    A.select('bridge', br.id);
    app.emit('tree');
  }
};

/**
 * A hall that spans from one hall to another. It is laid straight between the outermost points of the two halls and reaches a little
 * way into each, so its inside opens into both; it hangs off the first hall in the list, and it is held by BOTH: whenever either hall
 * moves, turns or changes shape the link is re-aimed and re-measured (`hall.link`).
 */
A.createLinkHall = (a, b) => {
  const O = app.linkOpts, ha = A.hall(a.hall), hb = A.hall(b.hall);
  if (!ha || !hb || !app.worlds.get(a.hall)) return null;
  if (a.point.distanceTo(b.point) < 0.2) { toast('Those two spots are too close together.'); return null; }
  const hall = newHall(O.shape, { name: `Link ${app.ship.halls.length + 1}`, w: O.w, h: O.h, l: 4 });
  hall.link = { a: { hall: a.hall, u: a.u, ang: a.ang }, b: { hall: b.hall, u: b.u, ang: b.ang }, embed: O.embed };
  hall.conn = newConn('fuse', ha.id, [0, 0, 0], [1, 0, 0], '-z');            // it hangs under the first hall in the list (its place comes from the link)
  hall.conn.rel = { p: [0, 0, 0], r: [0, 0, 0] };
  app.ship.halls.push(hall);
  A.requestHull();
  A.commit();
  A.setTool('select');
  A.select('hall', hall.id);
  app.emit('tree');
  return hall;
};

/** a link hall turns into an ordinary free-standing hall where it is */
A.cutLinkLoose = id => {
  const h = A.hall(id);
  if (!h?.link) return;
  h.xf = matrixToXf(app.worlds.get(h.id));
  h.conn = null;
  delete h.link;
  A.requestHull();
  A.commit();
  app.emit('tree');
  app.emit('inspector');
  app.vp.syncGizmo();
};

A.deleteBridge = id => {
  app.ship.bridges = app.ship.bridges.filter(b => b.id !== id);
  if (app.sel.id === id) A.select(null, null);
  A.requestBridges();
  A.commit();
  app.emit('tree');
};

A.duplicateBridge = id => {
  const b = A.bridge(id);
  if (!b) return;
  const c = clone(b);
  c.id = newId('b');
  c.name = b.name + ' copy';
  c.a.u = Math.min(c.a.u + 0.08, 0.98); c.b.u = Math.min(c.b.u + 0.08, 0.98);
  app.ship.bridges.push(c);
  A.requestBridges();
  A.commit();
  A.select('bridge', c.id);
  app.emit('tree');
};

// ------------------------------------------------------------------ groups of halls
A.group = id => app.ship.groups.find(g => g.id === id);
A.groupRoots = gid => {
  const ids = new Set(A.groupMembers(gid).map(h => h.id));
  return app.ship.halls.filter(h => ids.has(h.id) && !(h.conn && ids.has(h.conn.parent)));       // members whose parent is not also a member
};
/** the halls of a group and everything hanging off them */
A.groupMembers = gid => {
  const out = new Map();
  for (const h of app.ship.halls.filter(x => x.group === gid)) branchOf(app.ship, h.id).forEach(b => out.set(b.id, b));
  return [...out.values()];
};

A.groupSelectedHalls = () => {
  const ids = app.multi.size ? [...app.multi] : app.sel.type === 'hall' ? [app.sel.id] : [];
  if (!ids.length) { toast('Select halls first (ctrl-click them in the list to pick several).'); return; }
  const g = { id: newId('g'), name: `Group ${app.ship.groups.length + 1}` };
  app.ship.groups.push(g);
  ids.forEach(i => { const h = A.hall(i); if (h) h.group = g.id; });
  app.multi.clear();
  A.commit();
  A.select('group', g.id);
  app.emit('tree');
};

A.setHallGroup = (hallId, gid) => {
  const h = A.hall(hallId);
  if (!h) return;
  if (gid) h.group = gid; else delete h.group;
  A.commit();
  app.emit('tree');
  app.emit('inspector');
};

A.ungroup = gid => {
  app.ship.halls.forEach(h => { if (h.group === gid) delete h.group; });
  app.ship.groups = app.ship.groups.filter(g => g.id !== gid);
  if (app.sel.id === gid) A.select(null, null);
  A.commit();
  app.emit('tree');
};

A.deleteGroup = gid => {
  const ids = new Set(A.groupMembers(gid).map(h => h.id));
  if (ids.size && !confirm(`Delete this group and its ${ids.size} hall(s)?`)) return;
  app.ship.halls = app.ship.halls.filter(h => !ids.has(h.id));
  app.ship.atts = app.ship.atts.filter(a => !ids.has(a.hall));
  app.ship.bridges = app.ship.bridges.filter(b => !ids.has(b.a.hall) && !ids.has(b.b.hall));
  app.ship.groups = app.ship.groups.filter(g => g.id !== gid);
  A.select(null, null);
  A.requestHull();
  A.commit();
  app.emit('tree');
};

/** where the group's gizmo sits: the middle of its halls' bounding box */
A.groupPivot = gid => {
  const box = new THREE.Box3();
  for (const h of A.groupMembers(gid)) {
    const W = app.worlds.get(h.id);
    if (!W) continue;
    const c = new Vector3().setFromMatrixPosition(W);
    box.expandByPoint(c);
  }
  return box.isEmpty() ? new Vector3() : box.getCenter(new Vector3());
};

/** how the group looks now: the halls' places and sizes, to measure a drag or a typed change from */
A.groupSnapshot = gid => {
  const members = A.groupMembers(gid), ids = new Set(members.map(h => h.id));
  return {
    gid, pivot: A.groupPivot(gid),
    roots: A.groupRoots(gid).filter(h => !h.link && (!h.conn || h.conn.type === 'fuse')).map(h => ({ id: h.id, W: app.worlds.get(h.id).clone(), fused: !!h.conn })),
    dims: members.map(h => ({ id: h.id, w: h.w, h: h.h, l: h.l })),
    ids,
  };
};

/**
 * Put the group where a snapshot plus a change says: `M` (a world transform about nothing in particular) is applied after
 * scaling the positions and sizes by `k` about the pivot. Used by the gizmo (every event, from the same snapshot) and by the typed boxes.
 */
A.groupApply = (snap, M, k = 1, rebuild = true) => {
  app.suppressHull = true;
  try {
    for (const d of snap.dims) {                                          // sizes first (this also carries gadgets, ports and fused halls along)
      const h = A.hall(d.id);
      if (!h || k <= 0) continue;
      for (const key of ['w', 'h', 'l']) { const nv = Math.max(0.3, round(d[key] * k, 3)); if (nv !== h[key]) A.setHallProp(h, key, nv); }
    }
    for (const r of snap.roots) {
      const h = A.hall(r.id);
      if (!h) continue;
      const p = new Vector3().setFromMatrixPosition(r.W), q = new Quaternion().setFromRotationMatrix(r.W);
      p.sub(snap.pivot).multiplyScalar(k).add(snap.pivot).applyMatrix4(M);
      q.premultiply(new Quaternion().setFromRotationMatrix(M));
      const W2 = new Matrix4().compose(p, q, new Vector3(1, 1, 1));
      if (r.fused) {
        const PW = app.worlds.get(h.conn.parent);
        if (PW) h.conn.rel = matrixToXf(PW.clone().invert().multiply(W2));
      } else h.xf = matrixToXf(W2);
    }
  } finally { app.suppressHull = false; }
  if (rebuild) A.requestHull();
};

/** a typed change to a whole group: move by (dx, dy, dz), turn by `yaw` degrees about the up axis through the pivot, scale by k */
A.groupChange = (gid, { move = [0, 0, 0], yaw = 0, k = 1 }) => {
  const snap = A.groupSnapshot(gid);
  const M = new Matrix4().makeTranslation(snap.pivot.x + move[0], snap.pivot.y + move[1], snap.pivot.z + move[2])
    .multiply(new Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw))).multiply(new Matrix4().makeTranslation(-snap.pivot.x, -snap.pivot.y, -snap.pivot.z));
  A.groupApply(snap, M, k);
  app.dirty.hull = true;
  A.commit();
  app.emit('inspector');
};

A.duplicateGroup = gid => {
  const g = A.group(gid);
  if (!g) return;
  const roots = A.groupRoots(gid), box = new THREE.Box3();
  roots.forEach(h => { const W = app.worlds.get(h.id); if (W) box.expandByPoint(new Vector3().setFromMatrixPosition(W)); });
  const off = new Vector3(Math.max(box.getSize(new Vector3()).x, 4) + 3, 0, 0);
  const ng = { id: newId('g'), name: g.name + ' copy' };
  app.ship.groups.push(ng);
  for (const r of roots) {
    const pack = A.branchPack(r.id), pos = new Vector3(...pack.rootXf.p).add(off);
    const copy = A.pasteBranch(pack, pos);
    copy.group = ng.id;
  }
  A.commit();
  A.select('group', ng.id);
  app.emit('tree');
};
