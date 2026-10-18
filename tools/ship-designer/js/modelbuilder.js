// The model builder: a tab where you make a gadget or hull piece from scratch - shapes, extruded outlines, revolved profiles,
// groups, cut-outs (booleans), mirrors and arrays, colours, textures and brush painting - see it live, move / rotate / scale the
// parts with the gizmo, and save it into resources/parts/ so it shows up in the Gadgets library.
// A model is the same JSON as resources/parts/**/*.part.json (see README.md), so files you wrote by hand open here too.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { app } from './app.js';
import { lib, loadManifest, buildFromJson } from './assets.js';
import * as paint from './paint.js';
import { el, clone, newId, toast, download, round } from './util.js';
import { showMenu } from './ctxmenu.js';

const A = app.actions;
let H = null;                                   // the ui.js controls (slider, select, ...), handed over at start-up
export const setBuilderUI = helpers => { H = helpers; };

// ------------------------------------------------------------------ the shapes a part can be made of
export const SHAPES = {
  group: { label: 'Group (holds other parts)', size: [1, 1, 1], sizes: [], solid: false },
  box: { label: 'Box', size: [1, 1, 1], sizes: ['Width', 'Height', 'Depth'], solid: true },
  cyl: { label: 'Cylinder / cone', size: [0.5, 0.5, 1], sizes: ['Top radius', 'Bottom radius', 'Height'], solid: true },
  sphere: { label: 'Sphere', size: [0.5, 0.5, 0.5], sizes: ['Radius X', 'Radius Y', 'Radius Z'], solid: true },
  extrude: { label: 'Extruded outline', size: [0.5], sizes: ['Height'], solid: true, extra: { poly: [[-0.5, -0.3], [0.5, -0.3], [0.65, 0], [0.5, 0.3], [-0.5, 0.3], [-0.65, 0]], bevel: 0 } },
  torus: { label: 'Torus', size: [0.5, 0.08], sizes: ['Ring radius', 'Tube radius'], solid: true },
  ring: { label: 'Ring (washer)', size: [0.5, 0.35, 0.1], sizes: ['Outer radius', 'Inner radius', 'Height'], solid: true },
  rframe: { label: 'Frame (square ring)', size: [1, 1, 0.1, 0.1], sizes: ['Inner width', 'Inner depth', 'Border', 'Height'], solid: true },
  plane: { label: 'Flat panel', size: [1, 1], sizes: ['Width', 'Depth'] },
  text: { label: 'Lettering', size: [2, 0.6], sizes: ['Width', 'Height'], extra: { text: 'TEXT' } },
  wheel: { label: 'Hand wheel', size: [0.4, 0.04], sizes: ['Radius', 'Rim'], extra: { spokes: 6 } },
  dish: { label: 'Dish', size: [1, 0.3, 0.05], sizes: ['Radius', 'Depth', 'Thickness'] },
  truss: { label: 'Truss', size: [3, 0.2, 0.4], sizes: ['Length', 'Width', 'Bay length'] },
  lathe: { label: 'Lathe (revolved profile)', size: [1, 1, 1], sizes: [], extra: { profile: [[0, 0], [0.5, 0], [0.5, 0.2], [0.2, 0.4], [0, 0.4]], closed: false, smooth: false } },
  tube: { label: 'Pipe along a path', size: [0.05], sizes: ['Radius'], extra: { path: [[0, 0, 0], [0, 0.5, 0.3], [0, 1, 0]] } },
};
const isSolid = n => !!SHAPES[n.shape]?.solid && !(n.shape === 'sphere' && n.hemi);

export function newNode(shape = 'box', over = {}) {
  const d = SHAPES[shape];
  return { id: newId('n'), shape, pos: [0, 0.5, 0], rot: [0, 0, 0], size: [...d.size], color: '#8e98a6', metal: 0.55, rough: 0.5, glow: 0, ...clone(d.extra || {}), ...over };
}

// ------------------------------------------------------------------ the model record
const META = ['format', 'version', 'name', 'kind', 'mount', 'category', 'variants'];

A.blankModel = () => ({
  part: { format: 'ship-part', version: 2, name: 'New model', kind: 'gadget', mount: 'any', category: 'Custom', variants: [{ name: 'Default', nodes: [newNode('box', { pos: [0, 0.25, 0], size: [1, 0.5, 1] })] }] },
  vi: 0, file: null,
});

/** a part file (single model or several styles) as a model record */
A.modelFromPart = (json, { file = null, category = '', variant = '' } = {}) => {
  const src = clone(json);
  const top = {};
  const shared = {};
  for (const [k, v] of Object.entries(src)) (META.includes(k) ? top : shared)[k] = v;
  const vs = (src.variants?.length ? src.variants : [{}]).map((v, i) => ({ ...clone(shared), ...v, name: v.name || (src.variants?.length ? 'Style ' + (i + 1) : 'Default'), nodes: v.nodes || shared.nodes || [] }));
  vs.forEach(v => v.nodes.forEach(n => { n.id ||= newId('n'); }));
  const vi = Math.max(0, vs.findIndex(v => v.name === variant));
  return {
    part: { format: 'ship-part', version: 2, name: top.name || 'Model', kind: top.kind || 'gadget', mount: top.mount || 'any', category: top.category || category || 'Custom', variants: vs },
    vi, file,
  };
};

/** the model as clean part JSON (editor ids are kept only where something refers to them) */
export function partJson(model) {
  const p = clone(model.part);
  p.variants.forEach(v => {
    const used = new Set(v.nodes.map(n => n.parent).filter(Boolean));
    v.nodes.forEach(n => { if (n.shape !== 'group' && !used.has(n.id)) delete n.id; if (!n.parent) delete n.parent; if (!n.op || n.op === 'add') delete n.op; if (!n.hidden) delete n.hidden; });
  });
  return p;
}

const curVariant = () => app.model.part.variants[app.model.vi];
const nodeOf = id => curVariant().nodes.find(n => n.id === id);
const touch = () => { A.requestModel(); };
const commit = () => A.commit();
const kidsOf = id => curVariant().nodes.filter(n => (n.parent || null) === id);
const subtree = id => { const out = [id]; for (let i = 0; i < out.length; i++) kidsOf(out[i]).forEach(k => out.push(k.id)); return out; };
const objOf = id => { let f = null; app.vp.modelGroup?.traverse(o => { if (!f && o.userData.nodeId === id) f = o; }); return f; };

// model builder settings kept for the session
app.modelSnap ||= { on: false, move: 0.05, rot: 15 };
app.modelBrush ||= { color: '#d94a3a', size: 0.12, hardness: 0.5, flow: 0.8, erase: false };

// ------------------------------------------------------------------ painting parts (a canvas over the part's own surface)
const PAINT_RES = 512;
const paintKey = id => 'node.' + id;

/** the paint layer of a node (null if it has none yet); keeps the canvas in step with the saved picture (undo, loading) */
function layerOf(n, create = false) {
  let L = paint.layers.get(paintKey(n.id));
  if (!L && (n.paint || create)) {
    L = paint.makeLayer(paintKey(n.id), PAINT_RES);
    L.ctx.clearRect(0, 0, PAINT_RES, PAINT_RES);
    L.src = '';
  }
  if (L && (L.src || '') !== (n.paint || '')) {
    L.src = n.paint || '';
    L.ctx.clearRect(0, 0, PAINT_RES, PAINT_RES);
    if (n.paint) { const img = new Image(); img.onload = () => { if (L.src === n.paint) { L.ctx.drawImage(img, 0, 0); L.dirty = true; app.vp.invalidate(500); } }; img.src = n.paint; }
    L.dirty = true;
  }
  return L || null;
}

let stroke = null;
export function beginPaint() { stroke = { last: null, touched: new Set() }; }

/** paint under the pointer; `ray` is a Raycaster */
export function paintAt(ray) {
  if (!stroke || !app.vp.modelGroup) return;
  const hit = ray.intersectObject(app.vp.modelGroup, true).find(h => h.object.userData.nodeId && h.object.isMesh && !h.object.userData.cutter && h.uv);
  if (!hit) { stroke.last = null; return; }
  const id = hit.object.userData.nodeId, n = nodeOf(id);
  if (!n) return;
  const fresh = !paint.layers.has(paintKey(id));
  const L = layerOf(n, true);
  const B = app.modelBrush, cur = [hit.uv.x, hit.uv.y];
  const from = stroke.last && stroke.last.id === id && Math.hypot(stroke.last.uv[0] - cur[0], stroke.last.uv[1] - cur[1]) < 0.25 ? stroke.last.uv : null;
  paint.stroke(L, from, cur, Math.max(B.size * L.res * 0.5, 1), B.color, B.hardness, B.flow, B.erase);
  stroke.last = { id, uv: cur };
  stroke.touched.add(id);
  if (fresh || !hit.object.material.userData.paintU) touch();       // the part needs its painted material: rebuild once
  app.vp.invalidate(300);
}

export function endPaint() {
  if (!stroke) return;
  for (const id of stroke.touched) { const n = nodeOf(id), L = paint.layers.get(paintKey(id)); if (n && L) { n.paint = L.canvas.toDataURL('image/png'); L.src = n.paint; } }
  const any = stroke.touched.size;
  stroke = null;
  if (any) { commit(); app.emit('inspector'); }
}

function clearNodePaint(id) {
  const n = nodeOf(id);
  if (!n) return;
  delete n.paint;
  const L = paint.layers.get(paintKey(id));
  if (L) { L.ctx.clearRect(0, 0, L.res, L.res); L.dirty = true; L.src = ''; }
  touch(); commit();
  app.emit('inspector');
}

// ------------------------------------------------------------------ the 3D side
const GHOST = new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.12, depthWrite: false });

/** rebuild what the viewport shows from the model (called when it changes) */
export function rebuildModel() {
  const vp = app.vp, scene = vp.scene;
  if (vp.modelGroup) { scene.remove(vp.modelGroup); vp.modelGroup.traverse(o => { o.geometry?.dispose?.(); }); vp.modelGroup = null; }
  app.modelBox = null;
  if (!app.model) return;
  const v = curVariant();
  const ctx = { ...(v.vars || {}), t: 0.2, glass: 0.28, r: v.vars ? Math.min(v.vars.w ?? 1, v.vars.h ?? 1) / 2 : 0.5, tag: true, showCutters: true, showHidden: false, paintTex: n => layerOf(n)?.tex || null };
  const g = buildFromJson(v, ctx);
  g.name = 'model';
  g.updateMatrixWorld(true);
  const box = new THREE.Box3();
  g.traverse(o => { if (o.isMesh && o.visible && !o.userData.cutter) box.expandByObject(o); });
  // the surface the piece sits on (Y = out of the surface)
  const base = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 3), GHOST);
  base.position.y = -0.02;
  base.userData.ghost = true;
  base.raycast = () => {};
  g.add(base);
  const sel = app.sel.type === 'node' ? app.sel.id : null;
  const so = sel && objOf(sel);
  if (so) { const bh = new THREE.BoxHelper(so, '#4ab0ff'); bh.userData.ghost = true; bh.raycast = () => {}; g.add(bh); }
  scene.add(g);
  vp.modelGroup = g;
  if (!box.isEmpty()) { app.modelBox = box.clone().expandByScalar(0.15); app.modelBox.expandByPoint(new THREE.Vector3(0, -0.1, 0)); }
  app.sv.updateBounds();
  vp.fitLights();
  vp.syncGizmo();
  vp.invalidate(600);
}

/** the part's node under a ray (null for empty space) */
export function pickNode(ray) {
  const g = app.vp.modelGroup;
  if (!g) return null;
  const hit = ray.intersectObject(g, true).find(h => h.object.userData.nodeId);
  return hit ? hit.object.userData.nodeId : null;
}

/** where a node is in the view (its world matrix), so the viewport can put the gizmo on it */
export function nodeFrame(id) {
  const n = app.model && nodeOf(id), obj = n && objOf(id);
  if (!obj) return null;
  obj.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
  obj.matrixWorld.decompose(pos, quat, sc);
  return { node: n, obj, pos, quat };
}

let gizmoStart = null;
/** a gizmo drag begins: remember how the node was, so scaling is always measured from the start */
export function beginGizmo(id) { const n = nodeOf(id); gizmoStart = n ? { id, node: clone(n) } : null; }

/** the gizmo moved: write position / rotation / size back into the node (the proxy is in the view's space) */
export function applyGizmo(id, proxy, mode) {
  const n = nodeOf(id);
  if (!n) return;
  const f = x => round(x, 3), D = THREE.MathUtils.radToDeg;
  const par = n.parent && objOf(n.parent);
  const pw = par ? (par.updateWorldMatrix(true, false), par.matrixWorld) : new THREE.Matrix4();
  if (mode === 'scale') { scaleNode(n, gizmoStart?.id === id ? gizmoStart.node : n, proxy.scale); touch(); return; }
  const inv = pw.clone().invert();
  if (mode === 'rotate') {
    const pq = new THREE.Quaternion().setFromRotationMatrix(pw).invert();
    const e = new THREE.Euler().setFromQuaternion(pq.multiply(proxy.quaternion), 'XYZ');
    n.rot = [f(D(e.x)), f(D(e.y)), f(D(e.z))];
  } else {
    const p = proxy.position.clone().applyMatrix4(inv);
    n.pos = [f(p.x), f(p.y), f(p.z)];
  }
  touch();
}

/** resize a node by the gizmo's scale factors (x, y, z in the node's own axes) from how it started */
function scaleNode(n, base, k) {
  const sx = Math.max(k.x, 0.01), sy = Math.max(k.y, 0.01), sz = Math.max(k.z, 0.01), r = (sx + sz) / 2, a = (sx + sy + sz) / 3;
  const b = clone(base), f = x => round(x, 3), S = (arr, i, m) => f((+arr[i] || 0) * m);
  const sz0 = b.size || [];
  const set = (...v) => { n.size = v.map(f); };
  switch (n.shape) {
    case 'box': set(S(sz0, 0, sx), S(sz0, 1, sy), S(sz0, 2, sz)); break;
    case 'cyl': set(S(sz0, 0, r), S(sz0, 1, r), S(sz0, 2, sy)); break;
    case 'sphere': set(S(sz0, 0, sx), S(sz0, 1, sy), S(sz0, 2, sz)); break;
    case 'torus': set(S(sz0, 0, a), S(sz0, 1, a)); break;
    case 'ring': set(S(sz0, 0, r), S(sz0, 1, r), S(sz0, 2, sy)); break;
    case 'rframe': set(S(sz0, 0, sx), S(sz0, 1, sz), S(sz0, 2, r), S(sz0, 3, sy)); break;
    case 'plane': case 'text': set(S(sz0, 0, sx), S(sz0, 1, sz)); break;
    case 'wheel': set(S(sz0, 0, r), S(sz0, 1, r)); break;
    case 'dish': set(S(sz0, 0, r), S(sz0, 1, sy), S(sz0, 2, sy)); break;
    case 'truss': set(S(sz0, 0, sy), S(sz0, 1, r), S(sz0, 2, sy)); break;
    case 'tube': set(S(sz0, 0, a)); n.path = (b.path || []).map(p => p.map(c => +c * a)); break;
    case 'extrude': set(S(sz0, 0, sy)); n.poly = (b.poly || []).map(p => [f(+p[0] * sx), f(+p[1] * sz)]); break;
    case 'lathe': n.profile = (b.profile || []).map(p => [f(+p[0] * r), f(+p[1] * sy)]); break;
    default: n.scale = [f((b.scale?.[0] ?? 1) * sx), f((b.scale?.[1] ?? 1) * sy), f((b.scale?.[2] ?? 1) * sz)];        // groups (and anything else): a plain scale
  }
}

// ------------------------------------------------------------------ editing actions
let nodeClip = null;
const dropY = shape => ({ box: 0.25, cyl: 0.5, sphere: 0.25, torus: 0.1, ring: 0.05, rframe: 0.05, plane: 0.01, text: 0.01, wheel: 0.04, dish: 0.3, truss: 0.1, lathe: 0, tube: 0, extrude: 0.25, group: 0 }[shape] ?? 0.25);

function addNode(shape) {
  const sel = app.sel.type === 'node' ? nodeOf(app.sel.id) : null;
  const n = newNode(shape, { pos: [0, dropY(shape), 0] });
  if (shape === 'box') n.size = [0.5, 0.5, 0.5];
  if (sel && sel.shape === 'group') { n.parent = sel.id; n.pos = [0, 0, 0]; }      // a new part goes into the selected group
  curVariant().nodes.push(n);
  touch(); commit();
  A.select('node', n.id);
  app.emit('tree');
}

/** copies of a part (and everything inside it) with new ids; `edit(copy, original)` can change each copy; returns the new top part */
function duplicateTree(id, edit = null) {
  const v = curVariant(), ids = subtree(id), map = new Map(ids.map(i => [i, newId('n')]));
  let top = null;
  for (const i of ids) {
    const o = nodeOf(i), c = clone(o);
    c.id = map.get(i);
    if (i !== id) c.parent = map.get(o.parent); else top = c;
    edit?.(c, o);
    v.nodes.splice(v.nodes.indexOf(nodeOf(ids[ids.length - 1] === i ? i : i)) + 1, 0, c);
  }
  return top;
}

function duplicateNode(id, offset = true) {
  if (!nodeOf(id)) return;
  const top = duplicateTree(id, (c, o) => { if (c.id && o.id === id && offset) c.pos = [(+c.pos[0] || 0) + 0.2, c.pos[1], c.pos[2]]; });
  touch(); commit();
  A.select('node', top.id);
  app.emit('tree');
}

function deleteNode(id) {
  const ids = new Set(subtree(id));
  if (ids.size > 1 && !confirm(`Delete this group and the ${ids.size - 1} part(s) inside it?`)) return;
  const v = curVariant();
  v.nodes = v.nodes.filter(n => !ids.has(n.id));
  ids.forEach(i => paint.layers.delete(paintKey(i)));
  touch(); commit();
  A.select(null, null);
  app.emit('tree');
}

function moveNode(id, d) {
  const v = curVariant(), i = v.nodes.findIndex(n => n.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= v.nodes.length) return;
  [v.nodes[i], v.nodes[j]] = [v.nodes[j], v.nodes[i]];
  touch(); commit();
  app.emit('tree');
}

/** hang a part under a group (or take it out), staying where it is in the view */
function reparent(id, parentId) {
  const n = nodeOf(id);
  if (!n || (n.parent || null) === (parentId || null) || (parentId && subtree(id).includes(parentId))) return;
  const o = objOf(id), po = parentId && objOf(parentId);
  if (o) {
    o.updateWorldMatrix(true, false);
    const M = o.matrixWorld.clone();
    if (po) { po.updateWorldMatrix(true, false); M.premultiply(po.matrixWorld.clone().invert()); }
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    M.decompose(p, q, s);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'), D = THREE.MathUtils.radToDeg;
    n.pos = [round(p.x, 3), round(p.y, 3), round(p.z, 3)];
    n.rot = [round(D(e.x), 2), round(D(e.y), 2), round(D(e.z), 2)];
  }
  if (parentId) n.parent = parentId; else delete n.parent;
  touch(); commit();
  app.emit('tree');
  app.emit('inspector');
}

/** group a part into a new group at its place */
function groupSelected() {
  const n = app.sel.type === 'node' && nodeOf(app.sel.id);
  if (!n) { toast('Select a part first.'); return; }
  const g = newNode('group', { pos: [...n.pos], rot: [0, 0, 0], name: 'Group' });
  if (n.parent) g.parent = n.parent;
  g.pos = [0, 0, 0];
  const o = objOf(n.id);
  if (o) { o.updateWorldMatrix(true, false); const w = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); const po = n.parent && objOf(n.parent); if (po) w.applyMatrix4(po.matrixWorld.clone().invert()); g.pos = [round(w.x, 3), round(w.y, 3), round(w.z, 3)]; }
  const v = curVariant();
  v.nodes.splice(v.nodes.indexOf(n), 0, g);
  touch();
  rebuildModel();
  reparent(n.id, g.id);
  A.select('node', g.id);
}

// ---- mirror, arrays, placement
const M3 = { x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1] };

/** a mirrored copy across the plane through the origin (x: left-right, y: up-down, z: front-back) */
function mirror(axis) {
  const id = app.sel.id, src = app.sel.type === 'node' && nodeOf(id);
  if (!src) { toast('Select a part (or a group) to mirror.'); return; }
  const m = M3[axis], MM = new THREE.Matrix4().makeScale(...m);
  const top = duplicateTree(id, (c, o) => {
    if (o.parent && o.id !== id) return;                                        // parts inside a group keep their place relative to the group: only the group mirrors
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]).map(x => THREE.MathUtils.degToRad(+x || 0)), 'XYZ'));
    const e = new THREE.Euler().setFromRotationMatrix(MM.clone().multiply(R).multiply(MM), 'XYZ');
    c.pos = (o.pos || [0, 0, 0]).map((x, i) => round((+x || 0) * m[i], 3));
    c.rot = [round(THREE.MathUtils.radToDeg(e.x), 2), round(THREE.MathUtils.radToDeg(e.y), 2), round(THREE.MathUtils.radToDeg(e.z), 2)];
  });
  // the shapes themselves are mirrored too, where they are not symmetric
  for (const i of subtree(top.id)) {
    const c = nodeOf(i);
    if (c.shape === 'extrude' && c.poly) { c.poly = c.poly.map(p => [axis === 'x' ? -p[0] : p[0], axis === 'z' ? -p[1] : p[1]]).reverse(); }
    if (c.shape === 'lathe' && c.profile && axis === 'y') c.profile = c.profile.map(p => [p[0], -p[1]]).reverse();
    if (c.shape === 'tube' && c.path) c.path = c.path.map(p => p.map((x, k) => x * m[k]));
    c.name = (c.name || SHAPES[c.shape]?.label || '') + ' (mirror)';
  }
  touch(); commit();
  A.select('node', top.id);
  app.emit('tree');
}

/** copies in a line: `count` parts in total, each moved by (dx, dy, dz) from the one before */
function linearArray(count, d) {
  const id = app.sel.id;
  if (!(app.sel.type === 'node' && nodeOf(id))) { toast('Select a part (or a group) to repeat.'); return; }
  let last = null;
  for (let k = 1; k < count; k++) last = duplicateTree(id, (c, o) => { if (o.id === id || !o.parent) { c.pos = (o.pos || [0, 0, 0]).map((x, i) => round((+x || 0) + d[i] * k, 3)); } });
  touch(); commit();
  if (last) A.select('node', last.id);
  app.emit('tree');
}

/** copies in a circle around the vertical (Y) axis through the origin */
function radialArray(count) {
  const id = app.sel.id;
  if (!(app.sel.type === 'node' && nodeOf(id))) { toast('Select a part (or a group) to repeat.'); return; }
  let last = null;
  for (let k = 1; k < count; k++) {
    const ang = (2 * Math.PI * k) / count, Ry = new THREE.Matrix4().makeRotationY(ang);
    last = duplicateTree(id, (c, o) => {
      if (o.parent && o.id !== id) return;
      const p = new THREE.Vector3(...(o.pos || [0, 0, 0]).map(x => +x || 0)).applyMatrix4(Ry);
      const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(o.rot || [0, 0, 0]).map(x => THREE.MathUtils.degToRad(+x || 0)), 'XYZ'));
      const e = new THREE.Euler().setFromRotationMatrix(Ry.clone().multiply(R), 'XYZ');
      c.pos = [round(p.x, 3), round(p.y, 3), round(p.z, 3)];
      c.rot = [round(THREE.MathUtils.radToDeg(e.x), 2), round(THREE.MathUtils.radToDeg(e.y), 2), round(THREE.MathUtils.radToDeg(e.z), 2)];
    });
  }
  touch(); commit();
  if (last) A.select('node', last.id);
  app.emit('tree');
}

/** put the lowest point of the selection (or of the whole model) on the ground (Y = 0), and optionally centre it in X and Z */
function dropToGround(center = false) {
  const g = app.vp.modelGroup;
  if (!g) return;
  const sel = app.sel.type === 'node' ? nodeOf(app.sel.id) : null;
  const targets = sel ? [sel] : curVariant().nodes.filter(n => !n.parent);
  const box = new THREE.Box3();
  for (const n of targets) { const o = objOf(n.id); if (o) o.traverse(m => { if (m.isMesh && !m.userData.cutter) box.expandByObject(m); }); }
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  for (const n of targets) {
    const p = [...n.pos];
    if (!n.parent) { p[1] = round((+p[1] || 0) - box.min.y, 3); if (center) { p[0] = round((+p[0] || 0) - c.x, 3); p[2] = round((+p[2] || 0) - c.z, 3); } }
    else p[1] = round((+p[1] || 0) - box.min.y, 3);
    n.pos = p;
  }
  touch(); commit();
  app.emit('inspector');
}

app.on('sel', () => { if (app.model) A.requestModel(); });
app.on('node-duplicate', () => app.model && app.sel.type === 'node' && duplicateNode(app.sel.id));
app.on('node-delete', () => app.model && app.sel.type === 'node' && deleteNode(app.sel.id));
app.on('node-copy', () => { if (app.model && app.sel.type === 'node' && nodeOf(app.sel.id)) { nodeClip = subtree(app.sel.id).map(i => clone(nodeOf(i))); toast('Copied'); } });
app.on('node-paste', () => {
  if (!app.model || !nodeClip) return;
  const map = new Map(nodeClip.map(n => [n.id, newId('n')]));
  const copies = nodeClip.map(n => { const c = clone(n); c.id = map.get(n.id); if (c.parent) c.parent = map.get(c.parent) || undefined; if (!c.parent) delete c.parent; return c; });
  curVariant().nodes.push(...copies);
  touch(); commit();
  A.select('node', copies[0].id);
  app.emit('tree');
});

export const nodeMenu = id => {
  const n = nodeOf(id);
  return [
    { label: 'Duplicate', hint: 'Ctrl+D', onclick: () => duplicateNode(id) },
    { label: 'Copy', hint: 'Ctrl+C', onclick: () => { A.select('node', id); app.emit('node-copy'); } },
    { label: 'Paste', hint: 'Ctrl+V', onclick: () => app.emit('node-paste'), disabled: !nodeClip },
    'sep',
    { label: 'Mirror across X (left-right)', onclick: () => { A.select('node', id); mirror('x'); } },
    { label: 'Mirror across Z (front-back)', onclick: () => { A.select('node', id); mirror('z'); } },
    { label: 'Put into a new group', onclick: () => { A.select('node', id); groupSelected(); } },
    n?.parent ? { label: 'Take out of its group', onclick: () => reparent(id, null) } : null,
    'sep',
    { label: n?.hidden ? 'Show' : 'Hide', onclick: () => { n.hidden = !n.hidden; touch(); commit(); app.emit('tree'); } },
    { label: 'Move up in the list', onclick: () => moveNode(id, -1) },
    { label: 'Move down in the list', onclick: () => moveNode(id, 1) },
    'sep',
    { label: 'Delete', hint: 'Del', danger: true, onclick: () => deleteNode(id) },
  ];
};

// ------------------------------------------------------------------ saving
export async function saveModel() {
  const m = app.model, part = partJson(m);
  const clean = s => s.replace(/[^\w\- ()]+/g, '_').trim() || 'Model';
  const path = m.file || `resources/parts/${clean(m.part.category || 'Custom').replace(/ +/g, '_')}/${clean(m.part.name).replace(/ +/g, '_')}.part.json`;
  if (!lib.hasServer) {                                 // the published site cannot save into resources/: hand the file over instead
    download(new Blob([JSON.stringify(part, null, 1)], { type: 'application/json' }), path.split('/').pop());
    toast('Downloaded ' + path.split('/').pop() + '. Run the designer locally and put it in resources/parts/ to find it in the Gadgets library.', 6000);
    return;
  }
  try {
    const r = await fetch(path, { method: 'POST', body: JSON.stringify(part, null, 1) });
    if (!r.ok) throw new Error('The server refused the file (' + r.status + '). Is the site running from serve.py?');
    m.file = path;
    await loadManifest();
    for (const p of lib.pieces.values()) p.thumb = null;
    app.docs.forEach(d => { if (d.ship) d.ship._stale = true; });
    A.requestAtts();
    toast('Saved ' + path + ' - it is in the Gadgets library now');
    app.emit('tree');
  } catch (e) { toast(e.message, 5000); }
}

function exportGlb() {
  const g = app.vp.modelGroup;
  if (!g) return;
  const copy = g.clone(true);
  const drop = [];
  copy.traverse(c => { if (c.userData.ghost || c.userData.cutter || !c.visible) drop.push(c); });
  drop.forEach(c => c.parent?.remove(c));
  new GLTFExporter().parse(copy, res => download(new Blob([res], { type: 'model/gltf-binary' }), clean(app.model.part.name) + '.glb'), e => toast(String(e)), { binary: true });
  function clean(s) { return s.replace(/[^\w\- ()]+/g, '_'); }
}

// ------------------------------------------------------------------ point editor (outlines and profiles)
/**
 * A little drawing board for a list of points: `mode` 'xz' is an outline seen from above (x across, z down the page),
 * 'ry' is a revolved profile (radius across, height up the page). Drag to move, click a line to add a point,
 * double-click or right-click a point to delete it.
 */
function pointEditor(pts, { mode = 'xz', minPoints = 3, onChange, onCommit }) {
  const W = 252, Hh = 190, pad = 14;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
  svg.setAttribute('class', 'profile pointed');
  const span = () => Math.max(1, ...pts.flatMap(p => [Math.abs(+p[0]), Math.abs(+p[1])])) * 1.25;
  let ext = span();
  const sx = mode === 'ry' ? x => pad + (x / ext) * (W - 2 * pad) : x => W / 2 + (x / ext) * (W / 2 - pad);
  const sy = mode === 'ry' ? y => Hh - pad - ((y + ext * 0.1) / (ext * 1.1)) * (Hh - 2 * pad) : y => Hh / 2 + (y / ext) * (Hh / 2 - pad);
  const inv = (cx, cy) => mode === 'ry'
    ? [((cx - pad) / (W - 2 * pad)) * ext, ((Hh - pad - cy) / (Hh - 2 * pad)) * ext * 1.1 - ext * 0.1]
    : [((cx - W / 2) / (W / 2 - pad)) * ext, ((cy - Hh / 2) / (Hh / 2 - pad)) * ext];
  const mk = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); return e; };
  let dots = [], line = null, drag = null;
  const pathD = () => 'M' + pts.map(p => `${sx(+p[0])},${sy(+p[1])}`).join('L') + (mode === 'xz' ? 'Z' : '');
  const draw = () => {
    ext = span();
    svg.replaceChildren();
    const grid = Math.pow(10, Math.floor(Math.log10(ext))) / (ext / Math.pow(10, Math.floor(Math.log10(ext))) > 5 ? 1 : 2);
    for (let g = grid; g < ext; g += grid) {
      if (mode === 'xz') { [g, -g].forEach(v => { mk('line', { x1: sx(v), x2: sx(v), y1: 0, y2: Hh, class: 'grid' }); mk('line', { y1: sy(v), y2: sy(v), x1: 0, x2: W, class: 'grid' }); }); }
      else { mk('line', { x1: sx(g), x2: sx(g), y1: 0, y2: Hh, class: 'grid' }); mk('line', { y1: sy(g), y2: sy(g), x1: 0, x2: W, class: 'grid' }); }
    }
    mk('line', { x1: sx(0), x2: sx(0), y1: 0, y2: Hh, class: 'axis' });
    mk('line', { y1: sy(0), y2: sy(0), x1: 0, x2: W, class: 'axis' });
    if (mode === 'xz') mk('path', { class: 'shape', d: pathD() });
    line = mk('path', { class: 'line', d: pathD() });
    dots = pts.map(p => mk('circle', { cx: sx(+p[0]), cy: sy(+p[1]), r: 6, class: 'dot' }));
  };
  const update = () => { line.setAttribute('d', pathD()); svg.querySelector('.shape')?.setAttribute('d', pathD()); dots.forEach((c, i) => { c.setAttribute('cx', sx(+pts[i][0])); c.setAttribute('cy', sy(+pts[i][1])); }); };
  const where = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * Hh]; };
  const nearest = e => { const [x, y] = where(e); let best = -1, d = 14; pts.forEach((p, i) => { const dd = Math.hypot(sx(+p[0]) - x, sy(+p[1]) - y); if (dd < d) { d = dd; best = i; } }); return best; };
  const snap = (v, e) => (e.shiftKey ? round(v, 3) : round(Math.round(v / 0.05) * 0.05, 3));
  const remove = i => { if (pts.length <= minPoints) { toast(`At least ${minPoints} points are needed.`); return; } pts.splice(i, 1); onChange(); onCommit(); draw(); };
  const insertAt = e => {                               // a click near a line adds a point on it
    const [x, y] = where(e);
    const n = pts.length, last = mode === 'xz' ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = [sx(+pts[i][0]), sy(+pts[i][1])], b = [sx(+pts[(i + 1) % n][0]), sy(+pts[(i + 1) % n][1])];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
      if (Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 8) { const [wx, wy] = inv(x, y); pts.splice(i + 1, 0, [snap(wx, e), snap(wy, e)]); onChange(); onCommit(); draw(); return true; }
    }
    return false;
  };
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const i = nearest(e);
    if (i >= 0) { e.preventDefault(); drag = i; try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } }
    else insertAt(e);
  });
  svg.addEventListener('pointermove', e => {
    if (drag === null) return;
    const [x, y] = where(e), [wx, wy] = inv(x, y);
    pts[drag][0] = mode === 'ry' ? Math.max(0, snap(wx, e)) : snap(wx, e);
    pts[drag][1] = snap(wy, e);
    update();
    onChange();
  });
  const release = () => { if (drag === null) return; drag = null; onCommit(); draw(); };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('dblclick', e => { const i = nearest(e); if (i >= 0) { e.preventDefault(); remove(i); } });
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    drag = null;
    const i = nearest(e), [x, y] = where(e), [wx, wy] = inv(x, y);
    showMenu(e.clientX, e.clientY, [
      i >= 0 ? { label: 'Delete this point', danger: true, disabled: pts.length <= minPoints, onclick: () => remove(i) } : null,
      i < 0 ? { label: 'Add a point here', onclick: () => { pts.push([snap(wx, e), snap(wy, e)]); onChange(); onCommit(); draw(); } } : null,
    ], 'Point');
  });
  draw();
  return svg;
}

// ------------------------------------------------------------------ the left panel
const treeOrder = () => {
  const v = curVariant(), out = [];
  const walk = (pid, depth) => v.nodes.filter(n => (n.parent || null) === pid).forEach(n => { out.push([n, depth]); walk(n.id, depth + 1); });
  walk(null, 0);
  v.nodes.forEach(n => { if (!out.some(o => o[0] === n)) out.push([n, 0]); });         // anything whose group is missing
  return out;
};

export function renderModelLeft(body) {
  const m = app.model, v = curVariant();
  const { section, button, select, check, slider } = H;
  const nameInput = el('input', { type: 'text', value: m.part.name, onchange: e => { m.part.name = e.target.value || 'Model'; commit(); app.emit('doc'); } });
  const cats = [...new Set([...lib.pieces.values()].filter(p => !p.imported).map(p => p.category))].sort();
  const catInput = el('input', { type: 'text', value: m.part.category || '', list: 'catlist', onchange: e => { m.part.category = e.target.value || 'Custom'; commit(); } });
  const B = app.modelBrush, S = app.modelSnap;
  const num = (label, init, step = 0.1) => { const i = el('input', { type: 'number', class: 'num', step, value: init }); return [el('span', { class: 'lbl small' }, label), i]; };
  const addSel = select({ options: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), get: () => 'box', onChange: () => {} });
  const [lcL, lcN] = num('Copies', 4, 1), [ldL, ldX] = num('Step X', 1), [, ldY] = num('Y', 0), [, ldZ] = num('Z', 0);
  const [rcL, rcN] = num('Copies', 6, 1);
  body.append(
    el('p', { class: 'lead' }, 'Model builder'),
    section('This model',
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Name'), nameInput),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Folder'), catInput, el('datalist', { id: 'catlist' }, cats.map(c => el('option', { value: c })))),
      el('div', { class: 'row wrap' },
        button('💾 Save to resources/', saveModel, 'primary', m.file ? 'Writes ' + m.file : 'Writes resources/parts/<folder>/<name>.part.json'),
        button('Download .part.json', () => download(new Blob([JSON.stringify(partJson(m), null, 1)], { type: 'application/json' }), (m.part.name || 'model').replace(/[^\w\- ()]+/g, '_') + '.part.json'), 'small'),
        button('Export .glb', exportGlb, 'small')),
      m.file ? el('p', { class: 'muted small' }, 'File: ' + m.file) : el('p', { class: 'muted small' }, 'Not saved yet. Y is up, out of the surface the piece is mounted on (for wall pieces Z is up).')),
    section('Parts of this style',
      el('div', { class: 'row' }, addSel, el('button', { class: 'btn small primary', onclick: () => addNode(addSel.value) }, '+ Add')),
      el('div', { class: 'tree' }, v.nodes.length ? treeOrder().map(([n, depth]) => el('div', { class: 'trow' + (app.sel.id === n.id ? ' sel' : '') + (n.hidden ? ' dim' : ''), style: { paddingLeft: 6 + depth * 14 + 'px' }, onclick: () => A.select('node', n.id), oncontextmenu: e => { e.preventDefault(); A.select('node', n.id); showMenu(e.clientX, e.clientY, nodeMenu(n.id)); } },
        el('button', { class: 'eye' + (n.hidden ? ' off' : ''), title: 'Show / hide', onclick: e => { e.stopPropagation(); n.hidden = !n.hidden; touch(); commit(); app.emit('tree'); } }, n.hidden ? '○' : '●'),
        n.shape === 'group' ? el('span', { class: 'ico2' }, '▣') : el('span', { class: 'swatch', style: { background: n.color || '#999' } }),
        el('span', { class: 'ttl' }, n.name || SHAPES[n.shape]?.label || n.shape), n.op && n.op !== 'add' ? el('small', { class: 'badge' }, n.op === 'subtract' ? 'cuts' : 'trims') : '', n.paint ? el('small', { class: 'badge' }, 'painted') : '')) : el('p', { class: 'muted small' }, 'No parts yet: add a box, cylinder, sphere...')),
      el('p', { class: 'muted small' }, 'Click a part here or in the view, then drag the gizmo (1 move, 2 rotate, 3 scale) or type values on the right. A new part goes into the selected group. Right-click for more.')),
    section('Tools',
      el('div', { class: 'row wrap' },
        button('Group', groupSelected, 'small', 'Put the selected part into a new group'),
        button('Mirror X', () => mirror('x'), 'small', 'A mirrored copy: left-right'), button('Mirror Y', () => mirror('y'), 'small'), button('Mirror Z', () => mirror('z'), 'small', 'A mirrored copy: front-back'),
        button('Drop to ground', () => dropToGround(false), 'small', 'Rest the selection (or the whole model) on the ground'), button('Centre it', () => dropToGround(true), 'small')),
      el('div', { class: 'lbl small' }, 'Line of copies'),
      el('div', { class: 'row xyz' }, lcL, lcN, ldL, ldX, ldY, ldZ),
      el('div', { class: 'row wrap' }, button('Make copies in a line', () => linearArray(Math.max(2, Math.round(+lcN.value) || 2), [+ldX.value || 0, +ldY.value || 0, +ldZ.value || 0]), 'small')),
      el('div', { class: 'lbl small' }, 'Ring of copies (around the up axis)'),
      el('div', { class: 'row xyz' }, rcL, rcN),
      el('div', { class: 'row wrap' }, button('Make a ring of copies', () => radialArray(Math.max(2, Math.round(+rcN.value) || 2)), 'small')),
      check({ label: 'Snap the gizmo to a grid', get: () => S.on, onChange: x => { S.on = x; app.vp.syncGizmo(); } }),
      el('div', { class: 'row xyz' }, el('span', { class: 'lbl small' }, 'Move step'), el('input', { type: 'number', class: 'num', step: 0.01, min: 0.01, value: S.move, onchange: e => { S.move = +e.target.value || 0.05; app.vp.syncGizmo(); } }), el('span', { class: 'lbl small' }, 'Turn step'), el('input', { type: 'number', class: 'num', step: 1, min: 1, value: S.rot, onchange: e => { S.rot = +e.target.value || 15; app.vp.syncGizmo(); } }))),
    section('Paint',
      el('div', { class: 'row wrap' }, button(app.tool === 'paint' ? 'Painting: ON (press Esc to stop)' : '🖌 Paint on the parts', () => A.setTool(app.tool === 'paint' ? 'select' : 'paint'), app.tool === 'paint' ? 'primary on' : 'primary')),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), el('input', { type: 'color', value: B.color, oninput: e => { B.color = e.target.value; } })),
      slider({ label: 'Brush size', get: () => B.size, min: 0.01, max: 0.5, step: 0.005, onInput: x => { B.size = x; }, hardMin: 0.005, hardMax: 1 }),
      slider({ label: 'Softness', get: () => 1 - B.hardness, min: 0, max: 1, step: 0.05, onInput: x => { B.hardness = 1 - x; }, hardMax: 1 }),
      slider({ label: 'Flow', get: () => B.flow, min: 0.05, max: 1, step: 0.05, onInput: x => { B.flow = x; }, hardMin: 0.02, hardMax: 1 }),
      check({ label: 'Eraser', get: () => B.erase, onChange: x => { B.erase = x; } }),
      el('p', { class: 'muted small' }, 'Drag over a part to paint on it like a canvas (Brush size is a fraction of the part\'s picture). The painting is saved with the model and shows on every copy in a ship. Parts with plain, flat sides (boxes, cylinders, spheres, extrusions) paint best.')),
    section('Styles (variants)',
      el('div', { class: 'vlist' }, m.part.variants.map((x, i) => el('button', { class: 'btn small' + (i === m.vi ? ' primary' : ''), onclick: () => { m.vi = i; A.select(null, null); touch(); app.emit('tree'); app.emit('inspector'); } }, x.name))),
      el('div', { class: 'row wrap' },
        button('+ Style', () => { const c = clone(v); c.name = v.name + ' 2'; const map = new Map(c.nodes.map(n => [n.id, newId('n')])); c.nodes.forEach(n => { n.id = map.get(n.id); if (n.parent) n.parent = map.get(n.parent); }); m.part.variants.push(c); m.vi = m.part.variants.length - 1; touch(); commit(); app.emit('tree'); }, 'small', 'A copy of this style to change into something else (round / square, open / closed...)'),
        button('Rename', () => { const n = prompt('Style name:', v.name); if (n) { v.name = n; commit(); app.emit('tree'); } }, 'small'),
        button('Delete style', () => { if (m.part.variants.length < 2) { toast('A model needs at least one style.'); return; } m.part.variants.splice(m.vi, 1); m.vi = 0; A.select(null, null); touch(); commit(); app.emit('tree'); }, 'small'))),
    section('Open another model',
      (() => {
        const opts = {};
        for (const p of [...lib.pieces.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))) if (p.variants.some(x => x.ext === 'part')) opts[p.id] = `${p.category} / ${p.name}`;
        const sel = select({ options: opts, get: () => Object.keys(opts)[0] });
        return el('div', { class: 'row' }, sel, el('button', { class: 'btn small', onclick: () => A.editPiece(sel.value) }, 'Open'));
      })()));
}

// ------------------------------------------------------------------ the right panel
const asNum = s => { const t = String(s).trim(); return t !== '' && isFinite(+t) ? +t : t; };

/** a row of text boxes that hold numbers or expressions (t = wall thickness, w, h, r in doors) */
function vecRow(label, arr, names, onChange) {
  return el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, label), arr.map((v, i) => el('input', { type: 'text', class: 'num', title: names?.[i] || '', value: String(v), onchange: e => { arr[i] = asNum(e.target.value); onChange(); } })));
}

export function renderModelInspector() {
  const m = app.model, v = curVariant(), { section, slider, select, check } = H;
  const out = [];
  const n = app.sel.type === 'node' ? nodeOf(app.sel.id) : null;
  if (!n) {
    const kind = select({ label: 'Kind', options: { gadget: 'Gadget (sits on a surface)', hull: 'Hull piece (cuts a hole: window, vent...)', decal: 'Decal (wraps onto the hull)' }, get: () => m.part.kind, onChange: x => { m.part.kind = x; commit(); app.emit('inspector'); } });
    out.push(el('h3', {}, m.part.name), el('p', { class: 'muted small' }, 'Select a part to edit it, or set up the whole model here.'),
      section('Model', kind,
        select({ label: 'Mounts', options: { any: 'Any surface (Z points to the nose)', wall: 'Wall (Z is up: racks, panels)' }, get: () => m.part.mount || 'any', onChange: x => { m.part.mount = x; commit(); } })));
    if (m.part.kind === 'hull') {
      const c = v.cut || (v.cut = { shape: 'rect', w: 1, h: 1 });
      out.push(section('The hole it cuts',
        select({ label: 'Shape', options: { rect: 'Rectangle', round: 'Round / oval', ngon: 'Polygon' }, get: () => c.shape || 'rect', onChange: x => { c.shape = x; commit(); } }),
        slider({ label: 'Width', get: () => c.w, min: 0.1, max: 6, step: 0.05, unit: 'm', onInput: x => { c.w = x; }, onChange: commit, hardMin: 0.05, hardMax: 40 }),
        slider({ label: 'Height', get: () => c.h, min: 0.1, max: 6, step: 0.05, unit: 'm', onInput: x => { c.h = x; }, onChange: commit, hardMin: 0.05, hardMax: 40 })));
    }
    const lt = v.light;
    out.push(section('Lamp',
      check({ label: 'This style gives off light', get: () => !!lt, onChange: on => { if (on) v.light = { color: '#ffb98a', intensity: 8, reach: 0, y: 0.15, flicker: 0, speed: 1, shadows: true }; else delete v.light; commit(); app.emit('inspector'); } }),
      ...(lt ? [
        el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), el('input', { type: 'color', value: lt.color, oninput: e => { lt.color = e.target.value; }, onchange: commit })),
        slider({ label: 'Brightness', get: () => lt.intensity, min: 0, max: 40, step: 0.5, onInput: x => { lt.intensity = x; }, onChange: commit, hardMax: 400 }),
        slider({ label: 'Height of the bulb', get: () => lt.y ?? 0.15, min: -1, max: 3, step: 0.05, unit: 'm', onInput: x => { lt.y = x; }, onChange: commit, hardMin: -20, hardMax: 20 }),
        slider({ label: 'Flicker', get: () => lt.flicker || 0, min: 0, max: 1, step: 0.05, onInput: x => { lt.flicker = x; }, onChange: commit, hardMax: 1 }),
        check({ label: 'Casts shadows', get: () => lt.shadows !== false, onChange: x => { lt.shadows = x; commit(); } })] : [])));
    return out;
  }
  const S = SHAPES[n.shape] || SHAPES.box;
  const upd = () => touch();
  const group = n.shape === 'group';
  const sizeRows = (S.sizes || []).map((lab, i) => el('div', { class: 'row' }, el('span', { class: 'lbl' }, lab), el('input', { type: 'text', class: 'num wide', value: String(n.size[i] ?? 0), onchange: e => { n.size[i] = asNum(e.target.value); upd(); commit(); } })));
  const groups = v.nodes.filter(g => g.shape === 'group' && !subtree(n.id).includes(g.id));
  out.push(
    el('h3', {}, n.name || S.label),
    section('Part',
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Name'), el('input', { type: 'text', value: n.name || '', placeholder: S.label, onchange: e => { n.name = e.target.value; commit(); app.emit('tree'); } })),
      select({ label: 'Shape', options: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), get: () => n.shape, onChange: x => { const d = SHAPES[x]; n.shape = x; n.size = [...d.size]; Object.assign(n, clone(d.extra || {})); upd(); commit(); app.emit('inspector'); app.emit('tree'); } }),
      select({ label: 'In group', options: { '': '(nothing: top level)', ...Object.fromEntries(groups.map(g => [g.id, g.name || 'Group'])) }, get: () => n.parent || '', onChange: x => reparent(n.id, x || null) }),
      ...(isSolid(n) ? [select({ label: 'Combine', options: { add: 'Add (a solid part)', subtract: 'Subtract (cut out of the parts above it)', intersect: 'Intersect (trim the parts above it)' }, get: () => n.op || 'add', onChange: x => { n.op = x; upd(); commit(); app.emit('tree'); app.emit('inspector'); } })] : []),
      ...(n.op && n.op !== 'add' ? [el('p', { class: 'muted small' }, 'This part is a cutter: it cuts the solid parts listed above it in the same group (shown red). It is not part of the finished model. Move it with the gizmo to shape the cut.')] : [])),
  );
  if (!group) {
    out.push(section('Size & shape',
      ...sizeRows,
      ...(n.shape === 'sphere' ? [check({ label: 'Half a sphere (dome)', get: () => !!n.hemi, onChange: x => { n.hemi = x; upd(); commit(); app.emit('inspector'); } })] : []),
      ...(n.shape === 'text' ? [el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Text'), el('input', { type: 'text', value: n.text || '', oninput: e => { n.text = e.target.value; upd(); }, onchange: commit }))] : []),
      ...(n.shape === 'wheel' ? [slider({ label: 'Spokes', get: () => n.spokes || 6, min: 2, max: 12, step: 1, onInput: x => { n.spokes = x; upd(); }, onChange: commit, hardMax: 24 })] : []),
      ...(n.shape === 'extrude' ? [
        el('div', { class: 'lbl small' }, 'Outline seen from above'),
        pointEditor(n.poly, { mode: 'xz', minPoints: 3, onChange: upd, onCommit: commit }),
        slider({ label: 'Rounded edges', get: () => n.bevel || 0, min: 0, max: 0.3, step: 0.01, unit: 'm', onInput: x => { n.bevel = x; upd(); }, onChange: commit, hardMax: 1 }),
        el('p', { class: 'muted small' }, 'Drag points · click a line to add one · double-click or right-click a point to delete it · Shift = no grid snap.')] : []),
      ...(n.shape === 'lathe' ? [
        el('div', { class: 'lbl small' }, 'Profile (radius across, height up)'),
        pointEditor(n.profile, { mode: 'ry', minPoints: 2, onChange: upd, onCommit: commit }),
        check({ label: 'Closed (back to the first point)', get: () => !!n.closed, onChange: x => { n.closed = x; upd(); commit(); } }),
        check({ label: 'Smooth', get: () => !!n.smooth, onChange: x => { n.smooth = x; upd(); commit(); } })] : []),
      ...(n.shape === 'tube' ? [(() => {
        const ta = el('textarea', { class: 'json', rows: 5, spellcheck: false, onchange: e => { try { const j = JSON.parse(e.target.value); if (!Array.isArray(j)) throw new Error('needs a list of points'); n.path = j; upd(); commit(); } catch (err) { toast('Not valid: ' + err.message); } } }, JSON.stringify(n.path));
        return el('div', {}, el('div', { class: 'lbl small' }, 'Path [[x, y, z], ...]'), ta, check({ label: 'Closed loop', get: () => !!n.closed, onChange: x => { n.closed = x; upd(); commit(); } }));
      })()] : []),
      slider({ label: 'Smoothness', get: () => n.seg || 24, min: 6, max: 64, step: 1, onInput: x => { n.seg = x; upd(); }, onChange: commit, hardMax: 128 })));
  }
  out.push(section('Where',
    vecRow('Position', n.pos, ['x', 'y', 'z'], () => { upd(); commit(); }),
    vecRow('Rotate °', n.rot, ['x', 'y', 'z'], () => { upd(); commit(); }),
    ...(group ? [vecRow('Scale', n.scale || (n.scale = [1, 1, 1]), ['x', 'y', 'z'], () => { upd(); commit(); })] : []),
    el('p', { class: 'muted small' }, 'Numbers, or short sums: t = the wall thickness (so a piece can follow it). Position and rotation are relative to the group the part is in.')));
  if (!group) {
    out.push(section('Look',
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : '#8e98a6', oninput: e => { n.color = e.target.value; upd(); }, onchange: commit })),
      slider({ label: 'Metal', get: () => n.metal ?? 0.5, min: 0, max: 1, step: 0.05, onInput: x => { n.metal = x; upd(); }, onChange: commit, hardMax: 1 }),
      slider({ label: 'Rough', get: () => n.rough ?? 0.5, min: 0, max: 1, step: 0.05, onInput: x => { n.rough = x; upd(); }, onChange: commit, hardMax: 1 }),
      slider({ label: 'Glow', get: () => n.glow || 0, min: 0, max: 6, step: 0.1, onInput: x => { n.glow = x; upd(); }, onChange: commit, hardMax: 20 }),
      check({ label: 'Glass (see-through)', get: () => !!n.glass, onChange: x => { n.glass = x; upd(); commit(); } }),
      check({ label: 'Flat shading (faceted)', get: () => !!n.flat, onChange: x => { n.flat = x; upd(); commit(); } }),
      select({ label: 'Texture', options: { '': 'None', ...Object.fromEntries([...lib.textures.values()].filter(t => !t.hidden).map(t => [t.id, t.name])) }, get: () => n.tex || '', onChange: x => { if (x) n.tex = x; else delete n.tex; upd(); commit(); app.emit('inspector'); } }),
      ...(n.tex ? [slider({ label: 'Tile', get: () => n.tile || 1, min: 0.1, max: 10, step: 0.1, onInput: x => { n.tile = x; upd(); }, onChange: commit, hardMin: 0.05, hardMax: 100 })] : []),
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn small', onclick: () => { app.modelBrush.color = n.color || '#8e98a6'; A.setTool('paint'); } }, '🖌 Paint on this part'),
        n.paint ? el('button', { class: 'btn small', onclick: () => clearNodePaint(n.id) }, 'Clear its painting') : '')));
  }
  out.push(el('div', { class: 'row wrap end' },
    el('button', { class: 'btn small', onclick: () => duplicateNode(n.id) }, 'Duplicate'),
    el('button', { class: 'btn small', onclick: () => { n.hidden = !n.hidden; touch(); commit(); app.emit('tree'); } }, n.hidden ? 'Show' : 'Hide'),
    el('button', { class: 'btn small danger', onclick: () => deleteNode(n.id) }, 'Delete')));
  return out;
}
