// The one shared state object (ship data, selection, current tool) + everything the UI and the 3D view can ask it to do.
import * as THREE from 'three';
import { newLight, newShip, newHall, newConn, newAtt, normalizeShip, computeWorlds, matrixToXf, childrenOf, branchOf, defaultSlot, CONN_PRESETS, wallOf, portFrame, childMatrix } from './ship.js';
import { lib, exportLib, importLib, loadVariant, variantOf, isHullPiece } from './assets.js';
import * as paint from './paint.js';
import { atlasScale } from './geo.js';
import { clone, toast, newId } from './util.js';
import { AnimState, newClip, newTrack, presetClip } from './anim.js';

const { Vector3, Matrix4 } = THREE;

export const app = {
  ship: newShip(),
  sel: { type: null, id: null },
  worlds: new Map(),
  tool: 'select',
  placing: { mode: 'new', shape: 'tube', type: 'doorway', face: '-z', roll: 0, style: 'builtin:plain', morph: 0, part: null, variant: '', spin: 0, scale: 1, reposId: null, template: null },
  brush: { color: '#c24a2d', tex: '', tile: 3, metal: 0.5, rough: 0.45, glow: 0, opacity: 1 },
  brush2: { mode: 'fill', size: 0.4, hardness: 0.5, flow: 0.6 },       // how the Paint tool works: fill a surface, or paint / erase with a soft brush
  dirty: { hull: false, conn: false, atts: false, mats: false, lights: false, model: false, bridges: false },
  model: null,                // the model being built when the open tab is a model tab
  docs: [],                   // open tabs: ships and models
  docIdx: 0,
  frameAfterBuild: false,
  anim: { on: false, state: new AnimState(), throttle: 0.7, clipId: null, sel: null },       // animate mode: playing the ship's animations and exhaust in the designer
  vp: null,
  sv: null,
  actions: {},
  _h: {},
  on(ev, fn) { (this._h[ev] ||= []).push(fn); },
  emit(ev, ...a) { this.vp?.invalidate(ev === 'built' ? 2500 : 900); (this._h[ev] || []).forEach(f => f(...a)); },
};
const A = app.actions;
const hist = { stack: [], i: -1 };

const defaultTemplate = () => {
  const p = app.placing, n = app.ship.halls.filter(h => h.shape === p.shape).length + 1;
  const h = newHall(p.shape);
  h.name = `${h.name} ${n}`;
  return h;
};
app.placing.template = defaultTemplate;

// ---------------------------------------------------------------- history / persistence
const snap = () => JSON.stringify({ ship: app.ship, sel: app.sel, model: app.model });
const AUTOSAVE = 'shipdesigner.autosave.v1';

let saveTimer = 0;
/** saving the whole session (ships, painting) is slow: do it a moment after the last change, and when the page is hidden or closed */
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosaveNow, 1800);
}
addEventListener('pagehide', () => autosaveNow());
addEventListener('visibilitychange', () => { if (document.hidden) autosaveNow(); });

function autosaveNow() {
  clearTimeout(saveTimer);
  if (!app.restored) return;                       // until the last session has been loaded, a save would overwrite it with the empty starting ship
  try {
    stash();
    const ships = app.docs.map(d => d.ship).filter(Boolean);
    const pieces = new Set(), texs = new Set(), conns = new Set();
    for (const sh of ships) {
      sh.atts.forEach(a => pieces.add(a.part));
      sh.halls.forEach(h => { [h.ext, h.int, h.floor, h.conn?.mat].forEach(s => s?.tex && texs.add(s.tex)); if (h.conn) conns.add(h.conn.style); });
      sh.atts.forEach(a => a.paint?.tex && texs.add(a.paint.tex));
    }
    const docs = app.docs.map(d => ({ kind: d.kind, ship: d.ship, model: d.model || null }));
    const base = { ship: app.ship, docs, cur: app.docIdx, lib: exportLib(pieces, texs, conns) };
    try { localStorage.setItem(AUTOSAVE, JSON.stringify({ ...base, paint: paint.exportPaint(new Set(ships.flatMap(sh => sh.halls.map(h => h.id)))) })); }
    catch (e) { localStorage.setItem(AUTOSAVE, JSON.stringify(base)); }      // painting too big for the browser's storage: keep the rest
  } catch (e) { /* storage full or blocked: not important */ }
}

export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (!raw) return false;
    const o = JSON.parse(raw);
    const hasWork = o.docs?.some(d => d.kind === 'model' || d.ship?.halls?.length || d.ship?.atts?.length);
    if (!hasWork && !o.ship?.halls?.length && !o.ship?.atts?.length) return false;       // (the open tab may be an empty one while other tabs hold the work)
    importLib(o.lib);
    paint.importPaint(o.paint).then(() => { app.dirty.mats = true; });
    if (o.docs?.length) {
      app.docs = o.docs.map(d => ({ id: newId('d'), kind: d.kind === 'model' ? 'model' : 'ship', ship: normalizeShip(d.ship || newShip()), model: d.kind === 'model' ? d.model : null, sel: { type: null, id: null }, hist: { stack: [], i: -1 } }));
      app.docIdx = Math.min(Math.max(o.cur | 0, 0), app.docs.length - 1);
      loadDoc(app.docs[app.docIdx], { fresh: true });
      return true;
    }
    A.setShip(o.ship, { keepHistory: false });
    return true;
  } catch (e) { console.error('Could not restore the last session:', e); return false; }
}

export const usedPieces = () => new Set(app.ship.atts.map(a => a.part));
export const usedConnectors = () => new Set(app.ship.halls.filter(h => h.conn).map(h => h.conn.style));

export function usedTextures() {
  const t = new Set();
  for (const h of app.ship.halls) {
    [h.ext, h.int, h.floor, h.conn?.mat].forEach(s => s?.tex && t.add(s.tex));
  }
  app.ship.atts.forEach(a => a.paint?.tex && t.add(a.paint.tex));
  return t;
}

A.commit = extra => {
  const ok = t => t.type === 'ship' || (t.type === 'hall' && app.ship.halls.some(h => h.id === t.id)) || (t.type === 'att' && app.ship.atts.some(x => x.id === t.id)) || (t.type === 'group' && (app.ship.groups || []).some(g => g.id === t.id));
  for (const c of app.ship.anims || []) if (c.tracks.some(t => !ok(t.target))) c.tracks = c.tracks.filter(t => ok(t.target));          // animations of things that were deleted go too
  const sn = snap();
  const last = hist.stack[hist.i];
  if (!extra && last && last.s === sn) return;
  hist.stack.length = hist.i + 1;
  hist.stack.push({ s: sn, paint: extra?.paint || null });
  if (hist.stack.length > 100) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  autosave();
  app.emit('history');
};

function restore(sn) {
  const o = JSON.parse(sn);
  app.ship = o.ship;
  app.sel = o.sel;
  app.model = o.model || null;
  if (curDoc()) curDoc().model = app.model;
  app.dirty.hull = true;
  app.dirty.model = true;
  app.emit('tree');
  app.emit('sel');
  app.emit('inspector');
  autosave();
  app.emit('history');
}
A.undo = () => {
  if (hist.i <= 0) return;
  const e = hist.stack[hist.i];
  e.paint?.forEach(r => { paint.putRegion(r, 'before'); app.sv.bindPaint(r.key + ''); });
  hist.i--;
  restore(hist.stack[hist.i].s);
};
A.redo = () => {
  if (hist.i >= hist.stack.length - 1) return;
  hist.i++;
  const e = hist.stack[hist.i];
  e.paint?.forEach(r => { paint.putRegion(r, 'after'); app.sv.bindPaint(r.key + ''); });
  restore(e.s);
};
A.canUndo = () => hist.i > 0;
A.canRedo = () => hist.i < hist.stack.length - 1;

A.setShip = (data, { keepHistory = false } = {}) => {
  app.ship = normalizeShip(data);
  app.sel = { type: null, id: null };
  if (!keepHistory) { hist.stack = []; hist.i = -1; }
  app.dirty.hull = true;
  app.frameAfterBuild = true;
  A.commit();
  app.emit('tree');
  app.emit('sel');
  app.emit('inspector');
};

A.newShip = () => { A.newDoc('ship'); };

// ---------------------------------------------------------------- tabs: several ships and models open at once
const curDoc = () => app.docs[app.docIdx];
app.docs.push({ id: newId('d'), kind: 'ship', hist: { stack: [], i: -1 } });
const noSel = () => ({ type: null, id: null });

/** put the live state back into the open tab's record (before switching away, or before saving) */
function stash() {
  const d = curDoc();
  if (!d) return;
  d.ship = app.ship;
  d.sel = app.sel;
  d.model = app.model;
  d.hist = { stack: hist.stack, i: hist.i };
  d.view = app.vp?.currentView?.() || d.view;
}

function loadDoc(d, { fresh = false } = {}) {
  app.ship = d.ship;
  app.sel = d.sel || noSel();
  app.model = d.kind === 'model' ? d.model : null;
  hist.stack = d.hist.stack;
  hist.i = d.hist.i;
  app.dirty.hull = true;
  app.dirty.model = true;
  if (d.view && !fresh) app.vp?.applyView(d.view); else app.frameAfterBuild = true;
  if (!hist.stack.length) A.commit();
  app.sv?.updateSelection();
  app.vp?.syncGizmo();
  app.vp?.setTool?.('select');
  app.tool = 'select';
  app.emit('doc');
  app.emit('tree');
  app.emit('sel');
  app.emit('inspector');
  app.emit('history');
}

A.docTitle = d => (d === curDoc() ? (app.model ? app.model.part.name : app.ship.name) : d.kind === 'model' ? d.model.part.name : d.ship.name) || 'Untitled';

A.switchDoc = i => {
  if (i === app.docIdx || !app.docs[i]) return;
  stash();
  app.docIdx = i;
  loadDoc(app.docs[i]);
  autosave();
};

/** a new tab: a ship, or a model (a piece you build from shapes) */
A.newDoc = (kind = 'ship', init = null) => {
  stash();
  const d = { id: newId('d'), kind, ship: newShip(), sel: noSel(), model: kind === 'model' ? (init || A.blankModel()) : null, hist: { stack: [], i: -1 } };
  if (kind === 'ship' && init) d.ship = normalizeShip(init);
  app.docs.push(d);
  app.docIdx = app.docs.length - 1;
  loadDoc(d, { fresh: true });
  autosave();
  return d;
};

A.closeDoc = i => {
  const d = app.docs[i];
  if (!d) return;
  stash();
  const has = d.kind === 'model' ? d.model.part.variants.some(v => v.nodes.length) : d.ship.halls.length || d.ship.atts.length;
  if (has && !confirm(`Close "${A.docTitle(d)}"?\n\nIts changes are only kept if you saved it (Save, or Save to resources/).`)) return;
  app.docs.splice(i, 1);
  if (!app.docs.length) app.docs.push({ id: newId('d'), kind: 'ship', ship: newShip(), sel: noSel(), model: null, hist: { stack: [], i: -1 } });
  app.docIdx = Math.min(i <= app.docIdx ? Math.max(app.docIdx - (i < app.docIdx ? 1 : 0), 0) : app.docIdx, app.docs.length - 1);
  loadDoc(app.docs[app.docIdx]);
  autosave();
};

/** a model tab with the model (and its file) of a piece from the library; a model file that cannot be edited opens in a browser tab */
A.editPiece = async (pieceId, variantName) => {
  const piece = lib.pieces.get(pieceId);
  const v = piece && (piece.variants.find(x => x.name === variantName) || piece.variants[0]);
  if (!v) return;
  if (v.ext !== 'part') {
    if (v.url) window.open(v.url, '_blank');
    else toast('This imported model lives inside the ship file; export the ship to get it out.');
    return;
  }
  const existing = app.docs.findIndex(d => d.kind === 'model' && d.model.file && d.model.file === v.url);
  if (existing >= 0) { A.switchDoc(existing); return; }
  let json = null;
  try { json = v.url ? await (await fetch(v.url, { cache: 'no-store' })).json() : null; } catch (e) { /* use the loaded copy */ }
  const model = A.modelFromPart(json || v.def, { file: v.url || null, category: piece.category, variant: variantName });
  A.newDoc('model', model);
};

// ---------------------------------------------------------------- dirty flags
let draftTimer = 0;
/** the hull changed. While a slider or a profile dot is being dragged the CSG rebuild (slow) waits: a ghost of the hall follows the drag and the rebuild runs when you pause */
A.requestHull = () => {
  if (app.suppressHull) return;                       // a group is being moved: the caller rebuilds once at the end
  const ev = window.event?.type, h = A.selHall();
  if (h && app.vp && !app.model && (ev === 'input' || ev === 'pointermove')) {
    app.vp.showDragGhost(h.id, true);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { app.dirty.hull = true; }, 450);
    return;
  }
  clearTimeout(draftTimer);
  app.dirty.hull = true;
};
A.requestConn = () => { app.dirty.conn = true; };
A.requestAtts = () => { app.dirty.atts = true; };
A.requestMats = () => { app.dirty.mats = true; };
A.requestLights = () => { app.dirty.lights = true; };
A.requestModel = () => { app.dirty.model = true; };

// ---------------------------------------------------------------- selection
A.select = (type, id) => {
  app.sel = id ? { type, id } : { type: null, id: null };
  app.sv.updateSelection();
  app.vp.syncGizmo();
  app.emit('sel');
  app.emit('inspector');
};
A.hall = id => app.ship.halls.find(h => h.id === id);
A.light = id => app.ship.lights.find(l => l.id === id);
A.isBranch = (rootId, id) => branchOf(app.ship, rootId).some(h => h.id === id);
A.att = id => app.ship.atts.find(a => a.id === id);
A.selHall = () => (app.sel.type === 'hall' ? A.hall(app.sel.id) : null);
A.selAtt = () => (app.sel.type === 'att' ? A.att(app.sel.id) : null);

A.setTool = tool => {
  app.tool = tool;
  app.vp.setTool(tool);
  app.emit('tool');
};

// ---------------------------------------------------------------- halls
function maxOpening(hall) {
  const c = hall.conn, t = wallOf(app.ship, hall);
  const f = c.face[1];
  const [a, b] = f === 'z' ? [hall.w, hall.h] : f === 'x' ? [hall.l, hall.h] : [hall.w, hall.l];
  return [Math.max(a - 3 * t, 0.4), Math.max(b - 3 * t, 0.4)];
}

/** keep an opening smaller than the face of the hall it opens into */
A.clampConn = hall => {
  const c = hall.conn;
  if (!c) return;
  const [a, b] = maxOpening(hall);
  c.w = Math.max(0.3, Math.min(c.w, a));
  c.h = Math.max(0.3, Math.min(c.h, b));
};

/** a fused hall keeps its place relative to its parent: (re)record it from the port it was dropped on */
A.refuse = hall => { if (hall?.conn?.type === 'fuse') hall.conn.rel = matrixToXf(childMatrix(hall, hall.conn)); };

A.createCentral = shape => {
  app.ship.halls.push(newHall(shape, { name: 'Central hall' }));
  app.frameAfterBuild = true;
  A.select('hall', app.ship.halls[0].id);
  A.requestHull();
  A.commit();
  app.emit('tree');
};

A.addDetached = shape => {
  const h = newHall(shape);
  h.name = `${h.name} ${app.ship.halls.length + 1}`;
  const b = app.sv.bounds;
  h.xf.p = [b.max.x + h.w / 2 + 2, 0, (b.min.z + b.max.z) / 2];
  if (!app.ship.halls.length) h.xf.p = [0, 0, 0];
  app.ship.halls.push(h);
  A.select('hall', h.id);
  A.requestHull();
  A.commit();
  app.emit('tree');
  return h;
};

A.startAttach = (shape, opts = {}) => {
  Object.assign(app.placing, { mode: 'new', shape, reposId: null, template: defaultTemplate }, opts);
  A.setTool('hall');
};

A.startReposition = id => {
  const h = A.hall(id);
  if (!h) return;
  const c = h.conn;       // a free-standing hall can be connected this way too: it takes the chosen opening type and face
  Object.assign(app.placing, { mode: 'repos', reposId: id, shape: h.shape, type: c?.type || (app.placing.type === 'fuse' ? 'doorway' : app.placing.type), face: c?.face || app.placing.face, roll: c?.roll || 0 });
  app.placing.template = () => ({ ...h, id: 'ghost' });
  A.setTool('hall');
};

A.attachAt = hit => {
  const L = app.vp.localHit(hit);
  if (!L) return;
  const P = app.placing;
  if (P.mode === 'repos') {
    const h = A.hall(P.reposId);
    if (!h || branchOf(app.ship, h.id).some(x => x.id === L.hallId)) { toast('Pick a hull that is not part of this hall\'s own branch.'); return; }
    if (!h.conn) { h.conn = newConn(P.type, L.hallId, L.p.toArray(), L.n.toArray(), P.face); h.conn.roll = P.roll || 0; A.clampConn(h); }
    h.conn.parent = L.hallId;
    h.conn.p = L.p.toArray();
    h.conn.n = L.n.toArray();
    A.refuse(h);
    app.placing.template = defaultTemplate;
    app.placing.mode = 'new';
    A.requestHull();
    A.commit();
    A.setTool('select');
    A.select('hall', h.id);
    app.emit('tree');
    return;
  }
  const hall = app.placing.template();
  hall.conn = newConn(P.type, L.hallId, L.p.toArray(), L.n.toArray(), P.face);
  hall.conn.roll = P.roll || 0;
  hall.conn.style = P.style;
  hall.conn.morph = P.morph || 0;
  A.clampConn(hall);
  A.refuse(hall);
  app.ship.halls.push(hall);
  A.setTool('select');
  A.select('hall', hall.id);
  A.requestHull();
  A.commit();
  app.emit('tree');
};

/** move a connected hall's port along the parent's surface by (du, dv) metres in the opening's own width / height directions */
A.slideConn = (hall, du, dv) => {
  const c = hall?.conn, W = c && app.worlds.get(c.parent);
  if (!c || !W || !app.sv.hull) return;
  const fr = portFrame(c);
  const P2 = fr.P.clone().addScaledVector(fr.t1, du).addScaledVector(fr.t2, dv);
  const rc = new THREE.Raycaster(P2.clone().addScaledVector(fr.n, 2.5).applyMatrix4(W), fr.n.clone().negate().transformDirection(W), 0, 10);
  const inv = W.clone().invert();
  const hit = app.sv.pick(rc, (id, slot) => !(id === c.parent && slot === 'ext'), true);
  if (hit?.type === 'hall' && hit.id === c.parent) {
    c.p = hit.point.clone().applyMatrix4(inv).toArray();
    c.n = hit.normal.clone().transformDirection(inv).toArray();
  } else { c.p = P2.toArray(); toast('Slid off the hull there - the port is where you put it.'); }
  A.requestHull();
  A.commit();
};

/** while dragging a connected hall across the hull: re-attach it where the pointer is (any outside surface that is not part of its own branch) */
A.relocateTo = (id, hit) => {
  const h = A.hall(id);
  if (!h?.conn || hit?.type !== 'hall' || hit.slot !== 'ext') return false;
  if (branchOf(app.ship, id).some(x => x.id === hit.id)) return false;
  const L = app.vp.localHit(hit);
  if (!L) return false;
  h.conn.parent = L.hallId;
  h.conn.p = L.p.toArray();
  h.conn.n = L.n.toArray();
  A.refuse(h);
  return true;                    // the hull is rebuilt when the drag ends (the view shows a ghost meanwhile)
};

/**
 * Join an existing hall (free-standing, or already joined elsewhere) to another hall, without rebuilding anything.
 * The spot on the other hall is found from where the two halls are (a ray between their centres), and the face of this hall that
 * looks at it is the one that joins. 'fuse' keeps the hall exactly where it is; the other types snap it to the opening.
 */
A.connectHall = (id, parentId, type = 'doorway', face = null) => {
  const h = A.hall(id), par = A.hall(parentId);
  if (!h || !par || h.id === par.id) return false;
  if (branchOf(app.ship, id).some(x => x.id === parentId)) { toast('That hall hangs off this one already: pick another.'); return false; }
  const Wc = app.worlds.get(id), Wp = app.worlds.get(parentId);
  if (!Wc || !Wp || !app.sv.hull) { toast('Wait for the ship to finish building, then try again.'); return false; }
  const cc = new Vector3().setFromMatrixPosition(Wc), pc = new Vector3().setFromMatrixPosition(Wp);
  const dir = pc.clone().sub(cc);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const onlyParentOutside = (hid, slot) => !(hid === parentId && slot === 'ext');
  let hit = app.sv.pick(new THREE.Raycaster(cc, dir, 0, 1000), onlyParentOutside, true);
  if (!hit) hit = app.sv.pick(new THREE.Raycaster(pc.clone().addScaledVector(dir, -400), dir, 0, 1000), onlyParentOutside, true);      // the hall's centre is inside the other: take the surface beyond it
  if (!hit || hit.id !== parentId) { toast('Could not find where these two halls meet - use "Pick the spot" and click the other hall.'); return false; }
  const L = app.vp.localHit(hit);
  const local = dir.clone().transformDirection(Wc.clone().invert());
  const ax = ['x', 'y', 'z'].reduce((best, k) => (Math.abs(local[k]) > Math.abs(local[best]) ? k : best), 'x');
  const f = face || (local[ax] >= 0 ? '+' : '-') + ax;
  const old = h.conn, keep = new Matrix4().copy(Wp).invert().multiply(Wc);
  h.conn = newConn(type, parentId, L.p.toArray(), L.n.toArray(), f);
  if (old) h.conn.mat = old.mat || h.conn.mat;
  if (type === 'fuse') h.conn.rel = matrixToXf(keep);
  else A.clampConn(h);
  A.requestHull();
  A.commit();
  app.emit('tree');
  app.emit('inspector');
  app.vp.syncGizmo();
  return true;
};

A.detach = id => {
  const h = A.hall(id);
  if (!h?.conn) return;
  h.xf = matrixToXf(app.worlds.get(h.id));
  h.conn = null;
  delete h.link;
  A.requestHull();
  A.commit();
  app.emit('tree');
  app.emit('inspector');
  app.vp.syncGizmo();
};

/** change one property of a hall; width/height/length also carry its gadgets and ports along so they stay on the skin */
A.setHallProp = (hall, key, val) => {
  const old = { w: hall.w, h: hall.h, l: hall.l };
  hall[key] = val;
  if (key in old) {
    const s = [hall.w / old.w, hall.h / old.h, hall.l / old.l];
    const scale = p => [p[0] * s[0], p[1] * s[1], p[2] * s[2]];
    app.ship.atts.filter(a => a.hall === hall.id).forEach(a => { a.p = scale(a.p); });
    for (const t of [hall.trim, hall.trim2]) if (t?.axis) t.pos *= { x: s[0], y: s[1], z: s[2] }[t.axis];       // slicing planes and bulkheads stay at the same place on the hall
    (hall.bulkheads || []).forEach(b => { b.z *= s[2]; if (b.hole) { b.hole.x *= s[0]; b.hole.y *= s[1]; } });
    childrenOf(app.ship, hall.id).forEach(c => { c.conn.p = scale(c.conn.p); if (c.conn.type === 'fuse' && c.conn.rel) c.conn.rel.p = scale(c.conn.rel.p); });       // fused halls keep their place on the resized hall
  }
  if (hall.conn && ['w', 'h', 'l', 'wall'].includes(key)) A.clampConn(hall);
  A.requestHull();
};

A.deleteHall = id => {
  const branch = branchOf(app.ship, id);
  const ids = new Set(branch.map(h => h.id));
  for (const h of app.ship.halls) if (h.link && (ids.has(h.link.a.hall) || ids.has(h.link.b.hall))) branchOf(app.ship, h.id).forEach(x => ids.add(x.id));       // halls laid between this one and another go with it
  const gadgets = app.ship.atts.filter(a => ids.has(a.hall)).length;
  if ((branch.length > 1 || gadgets > 0) && !confirm(`Delete ${branch.length > 1 ? branch.length + ' halls (this one and everything attached beyond it)' : 'this hall'}${gadgets ? ' and its ' + gadgets + ' gadget(s)' : ''}?`)) return;
  app.ship.halls = app.ship.halls.filter(h => !ids.has(h.id));
  app.ship.atts = app.ship.atts.filter(a => !ids.has(a.hall));
  app.ship.bridges = (app.ship.bridges || []).filter(b => !ids.has(b.a.hall) && !ids.has(b.b.hall));
  A.select(null, null);
  A.requestHull();
  A.commit();
  app.emit('tree');
};

// ---------------------------------------------------------------- animations and exhaust
/** what the selection is, as something to animate: {type: 'hall'|'att'|'group', id} or null */
A.animTarget = () => (['hall', 'att', 'group'].includes(app.sel.type) ? { type: app.sel.type, id: app.sel.id } : null);
A.curClip = () => app.ship.anims.find(c => c.id === app.anim.clipId) || app.ship.anims[0] || null;
const targetName = t => (t.type === 'ship' ? 'the ship' : t.type === 'hall' ? A.hall(t.id)?.name : t.type === 'att' ? A.att(t.id)?.name : A.group?.(t.id)?.name) || 'it';

/** a new clip. With a target, it starts from a ready-made one (hatch, slide, spin, pulse); 'empty' makes a clip with nothing in it */
A.addClip = (kind = 'empty', target = null) => {
  const opts = {};
  if (target?.type === 'hall') opts.box = app.sv.hallLocalBox(target.id);
  if (target?.type === 'group') opts.centre = A.groupPivot(target.id);
  if (target?.type === 'ship') opts.centre = app.sv.bounds.getCenter(new THREE.Vector3());
  if (kind !== 'empty' && target) opts.name = `${{ hinge: 'Open', slide: 'Slide', spin: 'Spin', pulse: 'Pulse' }[kind]} ${targetName(target)}`;
  const clip = presetClip(kind, target || { type: 'ship' }, opts);
  if (kind === 'empty' || !target) clip.tracks = [];
  app.ship.anims.push(clip);
  app.anim.clipId = clip.id;
  app.anim.sel = clip.tracks.length ? { track: clip.tracks[0].id, ch: clip.tracks[0].rot.length ? 'rot' : clip.tracks[0].pos.length ? 'pos' : 'scl', k: -1 } : null;
  A.animChanged();
  return clip;
};
/** a track in a clip for a hall, gadget, group or the whole ship (it starts at rest: add keys to move it) */
A.addTrack = (clip, target) => {
  if (!clip) clip = A.curClip() || A.addClip('empty');
  const tr = newTrack(target);
  if (target.type === 'hall') { const box = app.sv.hallLocalBox(target.id); if (box) tr.pivot = box.min.clone().add(box.max).multiplyScalar(0.5).toArray().map(v => Math.round(v * 1000) / 1000); }
  else if (target.type === 'group') tr.pivot = A.groupPivot(target.id).toArray();
  else if (target.type === 'ship') tr.pivot = app.sv.bounds.getCenter(new THREE.Vector3()).toArray();
  clip.tracks.push(tr);
  app.anim.clipId = clip.id;
  app.anim.sel = { track: tr.id, ch: 'rot', k: -1 };
  A.animChanged();
  return tr;
};
A.deleteClip = id => { app.ship.anims = app.ship.anims.filter(c => c.id !== id); app.anim.state.m.delete(id); if (app.anim.clipId === id) app.anim.clipId = null; app.anim.sel = null; A.animChanged(); };
A.deleteTrack = (clipId, trackId) => { const c = app.ship.anims.find(x => x.id === clipId); if (c) c.tracks = c.tracks.filter(t => t.id !== trackId); app.anim.sel = null; A.animChanged(); };
/** the clips or their tracks changed in structure */
A.animChanged = () => {
  A.commit();
  if (app.anim.on) { app.sv.startRig(); app.sv.animTick(0); }
  app.emit('anims');
};
/** keys or values changed (the picture is updated, the panels redrawn) */
A.animEdited = () => {
  A.commit();
  if (app.anim.on) app.sv.animTick(0);
  app.emit('anims');
};
/** exhaust fire / smoke settings changed on a hall or gadget */
A.fxChanged = () => { app.sv.syncExhaust(); app.vp?.invalidate(600); };
A.animMode = on => { app.sv.setAnimMode(on); app.emit('anims'); };

// ---------------------------------------------------------------- gadgets
A.startPlace = (pieceId, variant) => {
  const piece = lib.pieces.get(pieceId);
  app.placing.part = pieceId;
  app.placing.variant = variant ?? piece?.variants[0]?.name ?? '';
  app.placing.spin = 0;
  loadVariant(pieceId, app.placing.variant);
  A.setTool('gadget');
};

A.placeGadget = hit => {
  const L = app.vp.localHit(hit);
  if (!L) return;
  const piece = lib.pieces.get(app.placing.part);
  const att = newAtt(app.placing.part, L.hallId, L.p.toArray(), L.n.toArray(), piece?.name || 'Gadget', app.placing.variant);
  att.spin = app.placing.spin || 0;
  att.s = app.placing.scale || 1;
  const dspec = variantOf(att.part, att.variant)?.def?.decal;
  if (dspec) att.decal = { ...dspec };
  app.ship.atts.push(att);
  if (isHullPiece(att.part)) A.requestHull(); else A.requestAtts();
  A.commit();
  app.emit('tree');
  A.select('att', att.id);
};

A.deleteAtt = id => {
  const wasHull = isHullPiece(A.att(id)?.part);
  app.ship.atts = app.ship.atts.filter(a => a.id !== id);
  if (app.sel.id === id) A.select(null, null);
  if (wasHull) A.requestHull(); else A.requestAtts();
  A.commit();
  app.emit('tree');
};

A.duplicateAtt = (id, mirror = false) => {
  const a = A.att(id);
  if (!a) return;
  const c = clone(a);
  c.id = newId('a');
  if (mirror) { c.p[0] = -c.p[0]; c.n[0] = -c.n[0]; c.spin = -c.spin; c.tz = -c.tz; c.name = a.name + ' (mirrored)'; }
  else { c.p[0] += 0.6 * a.s; c.name = a.name; }
  app.ship.atts.push(c);
  A.requestAtts();
  A.commit();
  app.emit('tree');
  A.select('att', c.id);
};

/** drop a gadget back onto the hull along its normal (after resizing a hall, say) */
A.snapAtt = id => {
  const a = A.att(id), hall = a && A.hall(a.hall);
  if (!a || !hall || !app.sv.hull) return;
  const W = app.worlds.get(hall.id);
  const n = new Vector3(...a.n).normalize(), p = new Vector3(...a.p);
  const o = p.clone().addScaledVector(n, 1.0).applyMatrix4(W);
  const d = n.clone().transformDirection(W).negate();
  const rc = new THREE.Raycaster(o, d, 0, 6);
  const hit = rc.intersectObject(app.sv.hull, false)[0];
  if (hit) {
    const back = hit.point.clone().applyMatrix4(W.clone().invert());
    a.p = back.toArray();
    if (isHullPiece(a.part)) A.requestHull(); else A.requestAtts();
    A.commit();
    app.emit('inspector-values');
  } else toast('Nothing to snap to along that direction.');
};

// ---------------------------------------------------------------- painting
const SLOT_KEYS = ['color', 'tex', 'tile', 'metal', 'rough', 'glow', 'opacity'];
const pickSlot = s => Object.fromEntries(SLOT_KEYS.map(k => [k, s[k]]));

A.paintSlot = (hall, which) => {
  const s = which === 'conn' ? hall.conn?.mat : hall[which];
  if (!s) return;
  Object.assign(s, pickSlot(app.brush));
  A.requestMats();
};

A.paintAtt = att => {
  att.paint = { mode: 'replace', color: app.brush.color, tex: app.brush.tex, tile: Math.max(app.brush.tile / 3, 0.2) };
  A.requestAtts();
};

A.eyedrop = hit => {
  const L = hit.type === 'hall' && paint.getLayer(hit.id + '.' + hit.slot, false), uv = hit.hit?.uv1;
  const px = L && uv && paint.sample(L, uv.x, uv.y);
  if (px) { app.brush.color = px.color; app.emit('brush'); toast('Picked up that paint'); return; }
  let s = null;
  if (hit.type === 'hall') s = A.hall(hit.id)?.[hit.slot];
  else if (hit.type === 'door') s = A.hall(hit.id)?.conn?.mat;
  if (s) { Object.assign(app.brush, pickSlot(s)); app.emit('brush'); toast('Picked up that paint'); }
};

A.paintHit = (hit, e) => {
  if (!hit) return;
  if (e.altKey) { A.eyedrop(hit); return; }
  if (hit.type === 'hall') {
    const h = A.hall(hit.id);
    if (!h) return;
    if (e.shiftKey) { A.paintSlot(h, 'ext'); A.paintSlot(h, 'int'); } else A.paintSlot(h, hit.slot);
  } else if (hit.type === 'door') {
    const h = A.hall(hit.id);
    if (h) A.paintSlot(h, 'conn');
  } else if (hit.type === 'att') {
    const a = A.att(hit.id);
    if (a) A.paintAtt(a);
  }
  A.commit();
  app.emit('inspector');
};

A.paintAll = which => {
  for (const h of app.ship.halls) {
    if (which !== 'int') A.paintSlot(h, 'ext');
    if (which !== 'ext') { A.paintSlot(h, 'int'); if (h.deck) A.paintSlot(h, 'floor'); }
  }
  A.commit();
  app.emit('inspector');
};

// ---------------------------------------------------------------- brush strokes
A.beginStroke = () => ({ before: new Map(), last: null });

/** one pointer position of a stroke: `hit` is what the pointer is over */
A.paintStroke = (st, hit) => {
  const B = app.brush2;
  const hall = hit?.type === 'hall' && A.hall(hit.id);
  const uv = hit?.hit?.uv1;
  if (!hall || !(hit.slot === 'ext' || hit.slot === 'int') || !uv || (uv.x === 0 && uv.y === 0)) { st.last = null; return; }
  const key = hit.id + '.' + hit.slot, L = paint.getLayer(key);
  if (!st.before.has(key)) { st.before.set(key, paint.snapshot(L)); L.touched = null; }
  const inset = hit.slot === 'int' ? wallOf(app.ship, hall) : 0;
  const rPx = Math.max((B.size / 2) * L.res * atlasScale(hall, inset), 0.8);
  const cur = [uv.x, uv.y];
  const from = st.last && st.last.key === key && Math.hypot(st.last.uv[0] - cur[0], st.last.uv[1] - cur[1]) < 0.2 ? st.last.uv : null;
  paint.stroke(L, from, cur, rPx, app.brush.color, B.hardness, B.flow, B.mode === 'erase');
  st.last = { key, uv: cur };
  app.sv.bindPaint(key);
};

A.endStroke = st => {
  const regions = [];
  for (const [key, before] of st.before) {
    const r = paint.region(paint.layers.get(key), before);
    if (r) regions.push(r);
  }
  if (regions.length) { A.commit({ paint: regions }); app.emit('inspector'); }
};

/** wipe the brush painting of one surface (or of every surface when `hallId` is null) */
A.clearPaint = (hallId = null) => {
  const regions = [];
  for (const [key, L] of paint.layers) {
    if (key.startsWith('node.') || (hallId && key.split('.')[0] !== hallId)) continue;
    L.touched = { x0: 0, y0: 0, x1: L.res, y1: L.res };
    const before = paint.snapshot(L);
    paint.clearLayer(key);
    const r = paint.region(L, before);
    if (r) regions.push(r);
  }
  if (regions.length) A.commit({ paint: regions });
};

// ---------------------------------------------------------------- clicks from the 3D view
A.viewportClick = (hit, e) => {
  switch (app.tool) {
    case 'bridge':
      A.bridgeClick(hit);
      break;
    case 'select':
      if (!hit) A.select(null, null);
      else if (hit.type === 'bridge') A.select('bridge', hit.id);
      else if (hit.type === 'att') A.select('att', hit.id);
      else A.select('hall', hit.id);
      break;
    case 'hall':
      if (hit?.type === 'hall' && hit.slot === 'ext') A.attachAt(hit);
      else toast('Click on the outside of a hall to attach there.');
      break;
    case 'gadget':
      if (hit?.type === 'hall') A.placeGadget(hit);
      break;
    case 'paint':
      if (app.brush2.mode === 'fill' || e.altKey) A.paintHit(hit, e);
      break;
    case 'light':
      if (hit?.type === 'hall') A.placeLight(hit);
      break;
  }
};

// ---------------------------------------------------------------- lights
A.addLight = type => {
  const l = newLight(type);
  if (type === 'point') {
    const b = app.sv.bounds, c = b.getCenter(new THREE.Vector3());
    l.p = [c.x, c.y, c.z];
    l.name = `Lamp ${app.ship.lights.filter(x => x.type === 'point').length + 1}`;
  } else l.name = app.ship.lights.some(x => x.type === 'sun') ? `Back light ${app.ship.lights.filter(x => x.type === 'sun').length}` : 'Sun';
  if (type === 'sun') { l.az = Math.round(Math.random() * 360 - 180); l.el = 25; l.intensity = 1.2; }
  app.ship.lights.push(l);
  A.requestLights();
  A.commit();
  A.select('light', l.id);
  app.emit('tree');
  return l;
};

A.deleteLight = id => {
  app.ship.lights = app.ship.lights.filter(l => l.id !== id);
  if (app.sel.id === id) A.select(null, null);
  A.requestLights();
  A.commit();
  app.emit('tree');
};

/** click on a surface to drop a lamp just off it (inside rooms or out) */
A.placeLight = hit => {
  const L = app.vp.localHit(hit);
  if (!L) return;
  const l = newLight('point');
  l.name = `Lamp ${app.ship.lights.filter(x => x.type === 'point').length + 1}`;
  l.hall = L.hallId;
  l.p = L.p.addScaledVector(L.n, 0.3).toArray();
  app.ship.lights.push(l);
  A.requestLights();
  A.commit();
  A.select('light', l.id);
  app.emit('tree');
};

// ---------------------------------------------------------------- views (saved camera bookmarks)
A.saveView = name => {
  app.ship.views.push({ name: name || `View ${app.ship.views.length + 1}`, ...app.vp.currentView() });
  A.commit();
  app.emit('views');
};
A.deleteView = i => { app.ship.views.splice(i, 1); A.commit(); app.emit('views'); };

// ---------------------------------------------------------------- copy, paste, duplicate
let clip = null;
A.hasClip = () => !!clip;
const retag = (o, idMap, key = 'id', pre = 'a') => { const id = newId(pre); idMap.set(o[key], id); o[key] = id; return o; };

/** a hall with everything attached beyond it, its gadgets and the lamps inside, as plain data */
A.branchPack = id => {
  const halls = branchOf(app.ship, id), ids = new Set(halls.map(h => h.id));
  const root = A.hall(id), M = app.worlds.get(id);
  return {
    root: id, rootXf: M ? matrixToXf(M) : root.xf,
    halls: clone(halls), atts: clone(app.ship.atts.filter(a => ids.has(a.hall))), lights: clone(app.ship.lights.filter(l => l.hall && ids.has(l.hall))),
  };
};

/** put a packed branch into the ship as a free-standing copy next to where it came from */
A.pasteBranch = (pack, nearPoint = null) => {
  const map = new Map();
  const halls = clone(pack.halls);
  halls.forEach(h => { retag(h, map, 'id', 'h'); delete h.group; });
  for (const h of halls) {
    if (h.conn && pack.halls.some(p => p.id === h.conn.parent) && h.id !== map.get(pack.root)) h.conn.parent = map.get(h.conn.parent);
  }
  const root = halls.find(h => h.id === map.get(pack.root));
  const M = new Matrix4().compose(new Vector3(...pack.rootXf.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...pack.rootXf.r.map(THREE.MathUtils.degToRad), 'XYZ')), new Vector3(1, 1, 1));
  const q = new THREE.Quaternion().setFromRotationMatrix(M);
  const pos = nearPoint ? nearPoint.clone() : new Vector3(...pack.rootXf.p).add(new Vector3(Math.max(root.w, 1) + 1.5, 0, 0).applyQuaternion(q));
  root.conn = null;
  root.xf = matrixToXf(M.clone().setPosition(pos));
  root.name = root.name.replace(/ copy( \d+)?$/, '') + ' copy';
  const atts = clone(pack.atts).map(a => { const id = newId('a'); a.id = id; a.hall = map.get(a.hall); return a; });
  const lights = clone(pack.lights).map(l => { l.id = newId('l'); l.hall = map.get(l.hall); return l; });
  app.ship.halls.push(...halls);
  app.ship.atts.push(...atts);
  app.ship.lights.push(...lights);
  A.requestHull();
  A.commit();
  A.select('hall', root.id);
  app.emit('tree');
  return root;
};

A.duplicateHall = id => { if (A.hall(id)) A.pasteBranch(A.branchPack(id)); };

A.duplicateLight = id => {
  const l = A.light(id);
  if (!l) return;
  const c = clone(l);
  c.id = newId('l');
  c.name = l.name + ' copy';
  if (l.type === 'point') c.p = [l.p[0] + 0.6, l.p[1], l.p[2]];
  app.ship.lights.push(c);
  A.requestLights();
  A.commit();
  A.select('light', c.id);
  app.emit('tree');
};

A.duplicateSelection = () => {
  const s = app.sel;
  if (s.type === 'att') A.duplicateAtt(s.id);
  else if (s.type === 'hall') A.duplicateHall(s.id);
  else if (s.type === 'light') A.duplicateLight(s.id);
  else if (s.type === 'node') app.emit('node-duplicate');
};

A.copySelection = () => {
  const s = app.sel;
  if (s.type === 'att' && A.att(s.id)) clip = { type: 'att', att: clone(A.att(s.id)) };
  else if (s.type === 'hall' && A.hall(s.id)) clip = { type: 'branch', pack: A.branchPack(s.id) };
  else if (s.type === 'light' && A.light(s.id)) clip = { type: 'light', light: clone(A.light(s.id)) };
  else if (s.type === 'node') { app.emit('node-copy'); return; }
  else { toast('Select something to copy first.'); return; }
  toast('Copied');
};

/** paste: a gadget goes where you right-clicked (or beside the original); a hall branch becomes a free-standing copy */
A.pasteClipboard = hit => {
  if (app.model) { app.emit('node-paste'); return; }
  if (!clip) { toast('Nothing copied yet.'); return; }
  if (clip.type === 'branch') { A.pasteBranch(clip.pack); return; }
  if (clip.type === 'light') {
    const c = clone(clip.light);
    c.id = newId('l');
    if (c.type === 'point') c.p = [c.p[0] + 0.6, c.p[1], c.p[2]];
    app.ship.lights.push(c);
    A.requestLights(); A.commit(); A.select('light', c.id); app.emit('tree');
    return;
  }
  const a = clone(clip.att);
  a.id = newId('a');
  const L = hit?.type === 'hall' && app.vp.localHit(hit);
  if (L) { a.hall = L.hallId; a.p = L.p.toArray(); a.n = L.n.toArray(); }
  else {
    if (!A.hall(a.hall) && app.ship.halls[0]) { a.hall = app.ship.halls[0].id; a.p = [0, 0, 0]; }
    a.p = [a.p[0] + 0.6 * (a.s || 1), a.p[1], a.p[2]];
  }
  app.ship.atts.push(a);
  if (isHullPiece(a.part)) A.requestHull(); else A.requestAtts();
  A.commit();
  app.emit('tree');
  A.select('att', a.id);
};

A.renameSelection = () => {
  const s = app.sel, o = s.type === 'hall' ? A.hall(s.id) : s.type === 'att' ? A.att(s.id) : s.type === 'light' ? A.light(s.id) : s.type === 'bridge' ? A.bridge(s.id) : s.type === 'group' ? A.group(s.id) : null;
  if (!o) return;
  const n = prompt('Name:', o.name || '');
  if (n == null) return;
  o.name = n || o.name;
  A.commit();
  app.emit('tree');
  app.emit('inspector');
};

A.toggleHidden = (type, id) => {
  const o = type === 'hall' ? A.hall(id) : type === 'att' ? A.att(id) : type === 'bridge' ? A.bridge(id) : A.light(id);
  if (!o) return;
  o.hidden = !o.hidden;
  if (type === 'bridge') A.requestBridges();
  else if (type === 'hall') A.requestHull(); else if (type === 'att') (isHullPiece(o.part) ? A.requestHull : A.requestAtts)(); else A.requestLights();
  A.commit();
  app.emit('tree');
};

A.deleteSelection = () => {
  if (app.sel.type === 'node') { app.emit('node-delete'); return; }
  if (app.sel.type === 'bridge') { A.deleteBridge(app.sel.id); return; }
  if (app.sel.type === 'group') { A.deleteGroup(app.sel.id); return; }
  if (app.sel.type === 'light') A.deleteLight(app.sel.id);
  else if (app.sel.type === 'hall') A.deleteHall(app.sel.id);
  else if (app.sel.type === 'att') A.deleteAtt(app.sel.id);
};

export { defaultSlot, CONN_PRESETS };
