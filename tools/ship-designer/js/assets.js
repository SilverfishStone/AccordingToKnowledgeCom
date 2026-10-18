// The resources folder: pieces (gadgets + hull pieces, each with one or more model variants), connector styles and
// textures - listed by serve.py at resources/index.json - plus whatever the user imports into a ship.
// Ships only keep ids; imported files are embedded when a ship is saved.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { rnd, bytesToBase64, base64ToBytes, fileToDataURL, wake } from './util.js';

const { MeshStandardMaterial, Mesh, Group, Box3, Vector3, DoubleSide, MathUtils } = THREE;

export const lib = {
  textures: new Map(),   // id -> {id, name, url|data, imported, tex}
  pieces: new Map(),     // id -> {id, name, category, kind:'gadget'|'hull', mount, variants:[variant], imported, thumb}
  connectors: new Map(), // id -> {id, name, kind:'proc'|'model', params, ext, url|data, meta, imported, obj}
  doors: new Map(),      // id -> {id, name, def, imported}
  ships: [],
  hasServer: false,
};
// variant: {name, ext:'part'|'glb'|'gltf'|'obj'|'stl', def (part.json) | url | data, meta, cut:{shape,w,h,sides}, obj}

lib.connectors.set('builtin:plain', { id: 'builtin:plain', name: 'Plain collar', kind: 'proc', params: {}, imported: false });

export const MODEL_EXT = ['glb', 'gltf', 'obj', 'stl'];
export const prettyName = s => s.replace(/\.(part\.json|connector\.json|glb|gltf|obj|stl)$/i, '').replace(/[_]+/g, ' ').trim();
const fetchJson = async url => { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };

// ------------------------------------------------------------------ manifest
export async function loadManifest() {
  const m = await fetchJson('resources/index.json');
  if (!m) return;
  lib.hasServer = !m.static;                        // a published copy has a fixed resources/index.json and no server to save to
  for (const t of m.textures || []) lib.textures.set('res:' + t.name, { id: 'res:' + t.name, name: t.name, url: t.url, imported: false, tex: null });
  lib.ships = m.ships || [];

  // ---- pieces: every file is a variant; files in one sub-folder are variants of one piece
  const pieces = new Map();
  const jobs = (m.parts || []).map(async e => {
    const id = e.piece ? `res:parts/${e.category}/${e.piece}` : 'res:' + e.url;
    let p = pieces.get(id);
    if (!p) {
      p = { id, name: e.piece || e.name, category: e.category || 'Other', kind: /^hull$/i.test(e.category) ? 'hull' : 'gadget', mount: 'any', variants: [], imported: false, thumb: lib.pieces.get(id)?.thumb || null };
      pieces.set(id, p);
      if (e.pieceMeta) Object.assign(p, pickMeta(await fetchJson(e.pieceMeta)));
    }
    const meta = e.meta ? await fetchJson(e.meta) : null;
    if (e.ext === 'part') {
      const def = await fetchJson(e.url);
      if (!def) return;
      if (!e.piece && def.name) p.name = def.name;
      Object.assign(p, pickMeta(def));
      const vs = def.variants?.length ? def.variants : [def];
      vs.forEach((v, i) => p.variants.push({ name: v.name && def.variants ? v.name : e.piece ? def.name || e.name : 'Default', ext: 'part', url: e.url, def: { ...def, ...v, variants: undefined }, cut: v.cut || def.cut, order: i }));
    } else {
      Object.assign(p, pickMeta(meta));
      p.variants.push({ name: meta?.name || e.name, ext: e.ext, url: e.url, meta: meta || {}, cut: meta?.cut });
    }
  });
  await Promise.all(jobs);
  for (const p of pieces.values()) {
    p.variants.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    lib.pieces.set(p.id, p);
  }

  // ---- door styles
  await Promise.all((m.doors || []).map(async e => {
    const def = await fetchJson(e.url);
    if (def) lib.doors.set('res:' + e.url, { id: 'res:' + e.url, name: def.name || e.name, def, imported: false });
  }));

  // ---- connector styles
  await Promise.all((m.connectors || []).map(async e => {
    const id = 'res:' + e.url;
    if (e.ext === 'part') {
      const def = await fetchJson(e.url);
      if (def) lib.connectors.set(id, { id, name: def.name || e.name, kind: 'proc', params: def.params || stripKeys(def), imported: false });
    } else {
      const meta = e.meta ? await fetchJson(e.meta) : {};
      lib.connectors.set(id, { id, name: meta?.name || e.name, kind: 'model', ext: e.ext, url: e.url, meta: meta || {}, imported: false });
    }
  }));
}

const stripKeys = d => Object.fromEntries(Object.entries(d).filter(([k]) => !['format', 'version', 'name'].includes(k)));
function pickMeta(d) {
  const out = {};
  if (!d) return out;
  for (const k of ['kind', 'mount', 'category']) if (d[k]) out[k] = d[k];
  if (d.name && !out.name && d.piece) out.name = d.name;
  return out;
}

// ------------------------------------------------------------------ textures
const texLoader = new THREE.TextureLoader();

export function getTexture(id) {
  const rec = lib.textures.get(id);
  if (!rec) return null;
  if (!rec.tex) {
    rec.tex = texLoader.load(rec.url || rec.data, t => { t.userData.onLoad?.forEach(f => f()); wake(); });
    rec.tex.wrapS = rec.tex.wrapT = THREE.RepeatWrapping;
    rec.tex.colorSpace = THREE.SRGBColorSpace;
    rec.tex.anisotropy = 8;
    rec.tex.userData.onLoad = [];
  }
  return rec.tex;
}

export const textureSrc = id => { const r = lib.textures.get(id); return r ? (r.url || r.data) : ''; };

export async function importTexture(file) {
  const id = 'imp:' + rnd();
  lib.textures.set(id, { id, name: file.name.replace(/\.[^.]+$/, ''), data: await fileToDataURL(file), imported: true, tex: null });
  return id;
}

// ------------------------------------------------------------------ importing / embedding
const extOf = f => f.name.split('.').pop().toLowerCase();

/** one piece from one or more model files (several files = several variants of the same piece) */
export async function importPiece(files, { kind = 'gadget', name } = {}) {
  const variants = [];
  for (const f of files) {
    const ext = extOf(f);
    if (!MODEL_EXT.includes(ext)) throw new Error('Unsupported model type: .' + ext + ' (use .glb .gltf .obj .stl)');
    variants.push({ name: prettyName(f.name), ext, data: bytesToBase64(new Uint8Array(await f.arrayBuffer())), meta: {} });
  }
  const id = 'imp:' + rnd();
  lib.pieces.set(id, { id, name: name || (files.length > 1 ? 'Imported set' : prettyName(files[0].name)), category: kind === 'hull' ? 'Hull' : 'Imported', kind, mount: 'any', variants, imported: true, thumb: null });
  return id;
}

export async function importConnector(file) {
  const ext = extOf(file);
  const id = 'imp:' + rnd();
  if (/\.connector\.json$/i.test(file.name) || ext === 'json') {
    const def = JSON.parse(await file.text());
    lib.connectors.set(id, { id, name: def.name || prettyName(file.name), kind: 'proc', params: def.params || stripKeys(def), imported: true });
  } else if (MODEL_EXT.includes(ext)) {
    lib.connectors.set(id, { id, name: prettyName(file.name), kind: 'model', ext, data: bytesToBase64(new Uint8Array(await file.arrayBuffer())), meta: {}, imported: true });
  } else throw new Error('Use a .glb / .gltf / .obj / .stl model or a .connector.json style.');
  return id;
}

/** only the imported things a ship actually uses, ready to embed in the saved file */
export function exportLib(pieceIds, texIds, connIds = []) {
  const out = { pieces: {}, textures: {}, connectors: {} };
  for (const id of pieceIds) {
    const p = lib.pieces.get(id);
    if (p?.imported) out.pieces[id] = { name: p.name, kind: p.kind, category: p.category, mount: p.mount, variants: p.variants.map(v => ({ name: v.name, ext: v.ext, data: v.data, meta: v.meta, cut: v.cut })) };
  }
  for (const id of texIds) {
    const t = lib.textures.get(id);
    if (t?.imported) out.textures[id] = { name: t.name, data: t.data };
  }
  for (const id of connIds) {
    const c = lib.connectors.get(id);
    if (c?.imported) out.connectors[id] = { name: c.name, kind: c.kind, params: c.params, ext: c.ext, data: c.data, meta: c.meta };
  }
  return out;
}

export function importLib(obj) {
  for (const [id, p] of Object.entries(obj?.pieces || {})) {
    if (!lib.pieces.has(id)) lib.pieces.set(id, { id, name: p.name, kind: p.kind || 'gadget', category: p.category || 'Imported', mount: p.mount || 'any', variants: p.variants, imported: true, thumb: null });
  }
  // older files stored single-model parts
  for (const [id, p] of Object.entries(obj?.parts || {})) {
    if (!lib.pieces.has(id)) lib.pieces.set(id, { id, name: p.name, kind: 'gadget', category: 'Imported', mount: 'any', variants: [{ name: p.name, ext: p.ext, data: p.data, meta: {} }], imported: true, thumb: null });
  }
  for (const [id, t] of Object.entries(obj?.textures || {})) {
    if (!lib.textures.has(id)) lib.textures.set(id, { id, name: t.name, data: t.data, imported: true, tex: null });
  }
  for (const [id, c] of Object.entries(obj?.connectors || {})) {
    if (!lib.connectors.has(id)) lib.connectors.set(id, { id, ...c, imported: true });
  }
}

// ------------------------------------------------------------------ building models
/** numbers in a part file may be expressions: t = wall thickness; doors also get w, h (opening) and r (half the smaller of them) */
function num(v, ctx) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || !/^[0-9twhr+\-*/(). ]+$/.test(v)) return 0;
  try { return Function('t', 'w', 'h', 'r', `"use strict";return (${v});`)(ctx.t ?? 0.2, ctx.w ?? 1, ctx.h ?? 1, ctx.r ?? 0.5) || 0; } catch (e) { return 0; }
}

/** load a texture and call back when its picture is there (so nodes can show screens / faces) */
export function whenTexture(id, cb) {
  const tex = getTexture(id);
  if (!tex) return;
  if (tex.image) cb(tex); else (tex.userData.onLoad ||= []).push(() => cb(tex));
}

function material(n, ctx) {
  if (n.color === '$frame' && ctx.frameMat) return ctx.frameMat;      // door styles borrow the connection's paintable frame material
  const glow = num(n.glow || 0, ctx);
  if (n.glass) {
    const m = new MeshStandardMaterial({ color: n.color || '#9fd0ff', metalness: 0, roughness: 0.06, side: DoubleSide, envMapIntensity: 1.6 });
    m.userData.glass = true;
    setGlass(m, ctx.glass ?? 0.28);
    return m;
  }
  const m = new MeshStandardMaterial({
    color: n.color || '#999999', metalness: n.metal ?? 0.5, roughness: n.rough ?? 0.5, side: DoubleSide,
    emissive: glow > 0 ? (n.tex ? '#ffffff' : n.color || '#ffffff') : '#000000', emissiveIntensity: glow, flatShading: !!n.flat,
  });
  if (n.tex) {
    m.userData.textured = true;                  // gets its picture later: such parts are not merged
    whenTexture(n.tex, t => {
      wake();
      const c = t.clone();
      c.needsUpdate = true;
      if (n.tile) c.repeat.set(n.tile, n.tile);
      m.map = c;
      if (glow > 0) m.emissiveMap = c;
      m.needsUpdate = true;
    });
  }
  return m;
}

export function setGlass(m, opacity) {
  m.opacity = opacity;
  m.transparent = opacity < 0.99;
  m.depthWrite = opacity >= 0.99;
}

function ringGeometry(ro, ri, h, seg) {
  const sh = new THREE.Shape(), hole = new THREE.Path();
  sh.absarc(0, 0, ro, 0, Math.PI * 2, false);
  hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return extruded(sh, h, seg);
}

function frameShape(iw, ih, b) {
  const sh = new THREE.Shape(), hole = new THREE.Path();
  const ow = iw / 2 + b, oh = ih / 2 + b, w = iw / 2, h = ih / 2;
  sh.moveTo(-ow, -oh); sh.lineTo(ow, -oh); sh.lineTo(ow, oh); sh.lineTo(-ow, oh); sh.lineTo(-ow, -oh);
  hole.moveTo(-w, -h); hole.lineTo(-w, h); hole.lineTo(w, h); hole.lineTo(w, -h); hole.lineTo(-w, -h);
  sh.holes.push(hole);
  return sh;
}

/** extrude a flat shape so its axis runs up +Y, centred on the origin */
function extruded(shape, depth, seg = 32) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: Math.max(3, seg) });
  g.translate(0, 0, -depth / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---- generated shapes
const Y = new THREE.Vector3(0, 1, 0);
function cylBetween(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, Math.max(len, 1e-4), seg, 1);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** a triangular lattice truss along +Y (length, half-width of the triangle, bay length); `damage` bends the last bays out of line */
function trussGeometry(len, width, bay, damage = 0, seed = 1) {
  const R = rng(seed), nb = Math.max(1, Math.floor(len / bay));
  const corners = [0, 2.094, 4.189].map(a => [Math.cos(a) * width, Math.sin(a) * width]);
  const rings = [];
  for (let b = 0; b <= nb; b++) {
    let ring = corners.map(([cx, cz]) => new THREE.Vector3(cx, b * bay, cz));
    if (damage && b > nb - 3) { const k = (b - (nb - 3)) * damage; ring = ring.map(p => p.add(new THREE.Vector3((R() - 0.5) * 2 * k, (R() - 0.5) * 2 * k, (R() - 0.5) * 2 * k))); }
    rings.push(ring);
  }
  const parts = [];
  for (let b = 0; b < nb; b++) for (let c = 0; c < 3; c++) {
    parts.push(cylBetween(rings[b][c], rings[b + 1][c], width * 0.09), cylBetween(rings[b][c], rings[b + 1][(c + 1) % 3], width * 0.05, 5));
  }
  for (let b = 0; b <= nb; b++) if (R() < 0.9 || b === 0) for (let c = 0; c < 3; c++) parts.push(cylBetween(rings[b][c], rings[b][(c + 1) % 3], width * 0.05, 5));
  return mergeGeometries(parts, false);
}

/** a spoked hand wheel in the XZ plane (axis Y): [outer radius, rim thickness, spokes] */
function wheelGeometry(R, r, spokes) {
  const parts = [new THREE.TorusGeometry(R, r, 8, 28).rotateX(Math.PI / 2)];
  for (let k = 0; k < spokes; k++) {
    const a = (k * 2 * Math.PI) / spokes;
    parts.push(cylBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), r * 0.7, 5));
  }
  parts.push(new THREE.CylinderGeometry(r * 2.2, r * 2.2, r * 5, 12));
  return mergeGeometries(parts.map(g => g.toNonIndexed()), false);
}

/** a revolved profile ([radius, height] points, revolved about Y). Hard edges between segments unless `smooth`. */
function latheGeometry(profile, seg, smooth, closed) {
  const pts = profile.map(p => new THREE.Vector2(Math.max(p[0], 0), p[1]));
  if (closed) pts.push(pts[0].clone());
  if (smooth) return new THREE.LatheGeometry(pts, seg);
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) if (pts[i].x > 1e-6 || pts[i + 1].x > 1e-6) parts.push(new THREE.LatheGeometry([pts[i], pts[i + 1]], seg).toNonIndexed());
  return parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry();
}

export function textTexture(text, font, color, w, h) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = Math.max(64, Math.round(1024 * h / w));
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = color || '#d8d4c8';
  g.font = font || `700 ${Math.round(cv.height * 0.7)}px Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, cv.height / 2 + cv.height * 0.04, cv.width * 0.96);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** fewer facets for small things (a bolt does not need 24 sides): most of a ship's triangles are in its gadgets */
const lod = (seg, r) => Math.round(Math.min(seg, Math.max(8, seg * (0.4 + Math.abs(r || 0)))));

/** an extruded outline: points [[x, z], ...] in the floor plane, `h` tall, centred on the origin; `bevel` rounds the edges */
function extrudeGeometry(poly, h, bevel = 0) {
  const pts = (poly && poly.length >= 3 ? poly : [[-0.5, -0.3], [0.5, -0.3], [0.5, 0.3], [-0.5, 0.3]]).map(p => new THREE.Vector2(p[0], -p[1]));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const sh = new THREE.Shape(pts);
  const bv = Math.min(bevel, h / 2 - 1e-3, 0.5);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(h - 2 * Math.max(bv, 0), 1e-3), bevelEnabled: bv > 0.002, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -(h - 2 * Math.max(bv, 0)) / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** texture coordinates 0..1 over a shape (the extrusions use raw metres): painting and tiling need them normalised */
function normaliseUV(g) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < uv.count; i++) { x0 = Math.min(x0, uv.getX(i)); x1 = Math.max(x1, uv.getX(i)); y0 = Math.min(y0, uv.getY(i)); y1 = Math.max(y1, uv.getY(i)); }
  const k = 1 / Math.max(x1 - x0, y1 - y0, 1e-6);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - x0) * k, (uv.getY(i) - y0) * k);
  return g;
}

// ---- painted parts: a canvas picture laid over a node's own surface (read through the geometry's uv)
const paintImages = new Map();
function paintTextureFor(src) {
  if (!paintImages.has(src)) {
    const t = new THREE.TextureLoader().load(src, () => wake());
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = true;
    paintImages.set(src, t);
  }
  return paintImages.get(src);
}

/** lay a painted picture over a material (the picture's alpha says where there is paint) */
export function paintify(mat, tex) {
  mat.userData.paintU = { value: tex };
  mat.userData.textured = true;                   // painted parts are not merged with their neighbours
  mat.onBeforeCompile = sh => {
    sh.uniforms.paintMap = mat.userData.paintU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uvp;\nvarying vec2 vPaintUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintUv = uvp;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap;\nvarying vec2 vPaintUv;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 paintC = texture2D(paintMap, vPaintUv);\ndiffuseColor.rgb = diffuseColor.rgb * (1.0 - paintC.a) + paintC.rgb;');
  };
  mat.customProgramCacheKey = () => 'node-paint-1';
  mat.needsUpdate = true;
}

/** the shapes booleans can work on: closed solids */
const isSolid = n => ['box', 'cyl', 'torus', 'ring', 'rframe', 'extrude'].includes(n.shape) || (n.shape === 'sphere' && !n.hemi);

const csgEval = new Evaluator();
csgEval.attributes = ['position', 'normal', 'uv'];
csgEval.useGroups = false;

function brushOf(mesh) {
  const g = mesh.geometry.clone();
  g.clearGroups();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const b = new Brush(g);
  mesh.updateMatrix();
  mesh.matrix.decompose(b.position, b.quaternion, b.scale);
  b.updateMatrixWorld(true);
  return b;
}

/** "subtract" and "intersect" nodes cut / trim the solids before them in the same group (the solids keep their own identity) */
function applyBooleans(container, ctx) {
  const kids = container.children.filter(o => o.userData.node);
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i], n = c.userData.node;
    if (c.isGroup) applyBooleans(c, ctx);
    if (!n.op || n.op === 'add' || !c.isMesh || !isSolid(n)) continue;
    c.updateMatrix();
    const cb = brushOf(c);
    const box = new Box3().setFromBufferAttribute(c.geometry.attributes.position).applyMatrix4(c.matrix);
    for (let j = 0; j < i; j++) {
      const t = kids[j], tn = t.userData.node;
      if (!t.isMesh || !isSolid(tn) || (tn.op && tn.op !== 'add') || !t.visible) continue;
      t.updateMatrix();
      const tb = new Box3().setFromBufferAttribute(t.geometry.attributes.position).applyMatrix4(t.matrix);
      if (!tb.intersectsBox(box)) continue;
      const res = csgEval.evaluate(brushOf(t), cb, n.op === 'intersect' ? INTERSECTION : SUBTRACTION);
      const old = t.geometry;
      t.geometry = res.geometry;
      if (tn.paint || t.material.userData.paintU) t.geometry.setAttribute('uvp', t.geometry.attributes.uv.clone());
      old.dispose();
      t.position.set(0, 0, 0); t.rotation.set(0, 0, 0); t.scale.set(1, 1, 1);
      t.updateMatrix();
      if (!t.geometry.attributes.position.count) t.visible = false;
    }
    if (ctx.showCutters) {                                  // in the builder the cutter stays visible as a red wireframe so it can be picked
      c.material = new THREE.MeshBasicMaterial({ color: n.op === 'intersect' ? '#4ab0ff' : '#ff5a4a', wireframe: true, transparent: true, opacity: 0.6 });
      c.userData.cutter = true;
      c.castShadow = c.receiveShadow = false;
    } else container.remove(c);
  }
}

/** one node of a part: a shape (Mesh) or a group (empty transform that holds other nodes) */
function makeNode(n, ctx) {
  const s = (n.size || [1, 1, 1]).map(v => num(v, ctx)), seg = n.seg || 24;
  let geo, scale = null, obj;
  if (n.shape === 'group') obj = new Group();
  else {
    switch (n.shape) {
      case 'box': geo = new THREE.BoxGeometry(s[0], s[1], s[2]); break;
      case 'cyl': geo = new THREE.CylinderGeometry(s[0], s[1], s[2], lod(seg, Math.max(s[0], s[1]))); break;
      case 'torus': geo = new THREE.TorusGeometry(s[0], s[1], lod(12, s[0]), lod(36, s[0])); break;
      case 'ring': geo = normaliseUV(ringGeometry(s[0], s[1], s[2], lod(seg, s[0]))); break;               // [outer r, inner r, height]
      case 'rframe': geo = normaliseUV(extruded(frameShape(s[0], s[1], s[2]), s[3])); break;     // [inner w, inner d, border, height]
      case 'extrude': geo = normaliseUV(extrudeGeometry((n.poly || []).map(p => p.map(v => num(v, ctx))), s[0] || 0.5, n.bevel || 0)); break;   // outline [[x, z], ...], [height]
      case 'lathe': { const prof = (n.profile || []).map(p => p.map(v => num(v, ctx))); geo = latheGeometry(prof, lod(n.seg || 40, Math.max(0, ...prof.map(p => p[0]))), n.smooth, n.closed); break; }   // profile [[r, y], ...]
      case 'tube': {                                                                // path [[x,y,z], ...], size [radius]
        const pts = (n.path || []).map(p => new THREE.Vector3(...p.map(v => num(v, ctx))));
        if (pts.length < 2) return null;
        geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !!n.closed, 'centripetal'), Math.max(12, pts.length * 8), s[0] || 0.05, 7, !!n.closed);
        break;
      }
      case 'truss': geo = trussGeometry(s[0], s[1], s[2], n.damage || 0, n.seed || 1); break;                   // [length, width, bay]
      case 'wheel': geo = wheelGeometry(s[0], s[1], n.spokes || 6); break;                                      // [radius, rim, spokes]
      case 'dish': {                                                                // [radius, depth, thickness]: a parabolic dish opening up +Y
        const prof = [];
        for (let i = 0; i <= 12; i++) { const rr = s[0] * i / 12; prof.push([rr, s[1] * (rr / s[0]) ** 2]); }
        for (let i = 12; i >= 0; i--) { const rr = s[0] * i / 12; prof.push([rr, s[1] * (rr / s[0]) ** 2 - (s[2] || 0.05)]); }
        geo = latheGeometry(prof, lod(seg, s[0]), true, false);
        break;
      }
      case 'plane': geo = new THREE.PlaneGeometry(s[0], s[1]).rotateX(-Math.PI / 2); break;                    // [w, d] lying flat, facing +Y
      case 'text': geo = new THREE.PlaneGeometry(s[0], s[1]).rotateX(-Math.PI / 2); break;                     // like a plane, drawn from n.text
      case 'sphere':
        { const sg = lod(seg, Math.max(s[0], s[1], s[2])); geo = n.hemi ? new THREE.SphereGeometry(1, sg, Math.ceil(sg / 2), 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, sg, Math.ceil(sg * 0.7)); }
        scale = s;
        break;
      default: return null;
    }
    let mat = material(n, ctx);
    if (n.shape === 'text') {
      mat = new MeshStandardMaterial({ map: textTexture(n.text || 'TEXT', n.font, n.color, s[0], s[1]), transparent: true, depthWrite: false, roughness: 0.6, metalness: 0.1, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    const ptex = n.shape === 'text' ? null : ctx.paintTex ? ctx.paintTex(n) : n.paint ? paintTextureFor(n.paint) : null;
    if (ptex && geo.attributes.uv) { geo.setAttribute('uvp', geo.attributes.uv.clone()); paintify(mat, ptex); }
    obj = new Mesh(geo, mat);
    if (scale) obj.scale.set(scale[0], scale[1], scale[2]);
    obj.castShadow = obj.receiveShadow = true;
  }
  if (n.scale) { const sc = n.scale.map(v => num(v, ctx)); obj.scale.set(sc[0], sc[1], sc[2]); }
  const p = (n.pos || [0, 0, 0]).map(v => num(v, ctx));
  obj.position.set(p[0], p[1], p[2]);
  const r = n.rot || [0, 0, 0];
  obj.rotation.set(MathUtils.degToRad(num(r[0], ctx)), MathUtils.degToRad(num(r[1], ctx)), MathUtils.degToRad(num(r[2], ctx)));
  if (n.anim && ctx.open !== undefined) {                                           // door parts that follow the door's open / locked state
    const k = 1 - ctx.open;
    if (n.anim.type === 'spin') obj.rotation[n.anim.axis || 'y'] += k * (n.anim.turns || 1) * Math.PI * 2;
    else if (n.anim.type === 'slide') { const d = n.anim.dir || [1, 0, 0], dist = num(n.anim.dist, ctx) * k; obj.position.x += d[0] * dist; obj.position.y += d[1] * dist; obj.position.z += d[2] * dist; }
  }
  return obj;
}

export function buildFromJson(def, ctx = {}) {
  const g = new Group();
  const made = [], byId = new Map();
  for (const n of def.nodes || []) {
    if (n.hidden && !ctx.showHidden) continue;
    const o = makeNode(n, ctx);
    if (!o) continue;
    o.userData.node = n;
    if (ctx.tag && n.id) o.userData.nodeId = n.id;
    made.push([n, o]);
    if (n.id) byId.set(n.id, o);
  }
  const inside = (o, anc) => { for (let k = 0, p = o; p && k < 32; k++, p = p.parent) if (p === anc) return true; return false; };
  for (const [n, o] of made) {                       // hang nodes under their group (a loop or a missing group falls back to the top)
    const par = n.parent && byId.get(n.parent);
    if (par && par !== o && !inside(par, o)) par.add(o); else g.add(o);
  }
  applyBooleans(g, ctx);
  return g;
}

function normalizeModel(obj, meta = {}) {
  const wrap = new Group();
  wrap.add(obj);
  if (meta.rotate) obj.rotation.set(MathUtils.degToRad(meta.rotate[0] || 0), MathUtils.degToRad(meta.rotate[1] || 0), MathUtils.degToRad(meta.rotate[2] || 0));
  if (meta.scale) obj.scale.multiplyScalar(meta.scale);
  wrap.updateMatrixWorld(true);
  const box = new Box3().setFromObject(wrap);
  if (!box.isEmpty()) {
    const c = box.getCenter(new Vector3());
    obj.position.add(new Vector3(-c.x, -box.min.y, -c.z));
  }
  const out = new Group();
  out.add(wrap);
  return out;
}

const loaders = { gltf: new GLTFLoader(), obj: new OBJLoader(), stl: new STLLoader() };
const plainMat = () => new MeshStandardMaterial({ color: '#b0b8c4', metalness: 0.4, roughness: 0.5, side: DoubleSide });

/** raw model from a file record {ext, url|data} */
async function readModel(rec) {
  const asBytes = async () => (rec.data ? base64ToBytes(rec.data) : new Uint8Array(await (await fetch(rec.url)).arrayBuffer()));
  const asText = async () => (rec.data ? new TextDecoder().decode(base64ToBytes(rec.data)) : await (await fetch(rec.url)).text());
  const buf = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  if (rec.ext === 'glb' || rec.ext === 'gltf') {
    const base = rec.url ? rec.url.replace(/[^/]*$/, '') : '';
    const data = rec.ext === 'gltf' ? await asText() : buf(await asBytes());
    return (await new Promise((res, rej) => loaders.gltf.parse(data, base, res, rej))).scene;
  }
  if (rec.ext === 'obj') {
    const o = loaders.obj.parse(await asText());
    o.traverse(c => { if (c.isMesh && (!c.material || c.material.type === 'MeshPhongMaterial')) c.material = plainMat(); });
    return o;
  }
  if (rec.ext === 'stl') {
    const geo = loaders.stl.parse(buf(await asBytes()));
    geo.computeVertexNormals();
    return new Mesh(geo, plainMat());
  }
  throw new Error('unknown model type ' + rec.ext);
}

// ------------------------------------------------------------------ pieces: variants
export const pieceOf = id => lib.pieces.get(id);

export function variantOf(pieceId, name) {
  const p = lib.pieces.get(pieceId);
  if (!p) return null;
  return p.variants.find(v => v.name === name) || p.variants[0] || null;
}

const loading = new Map();

/** make sure a variant is ready to use (JSON ones always are; model files load asynchronously) */
export function loadVariant(pieceId, name) {
  const v = variantOf(pieceId, name);
  if (!v) return Promise.resolve(null);
  if (v.ext === 'part' || v.obj) return Promise.resolve(v);
  const key = pieceId + '|' + v.name;
  if (loading.has(key)) return loading.get(key);
  const job = (async () => {
    try {
      if (v.url && !v.meta?.loaded && v.metaUrl) v.meta = (await fetchJson(v.metaUrl)) || {};
      v.obj = normalizeModel(await readModel(v), v.meta || {});
      if (!v.cut && lib.pieces.get(pieceId)?.kind === 'hull') {
        // no cut given: use the model's footprint (it is authored with +Y out of the wall)
        const b = new Box3().setFromObject(v.obj), sz = b.getSize(new Vector3());
        v.cut = { shape: 'rect', w: Math.max(sz.x * 0.85, 0.2), h: Math.max(sz.z * 0.85, 0.2) };
      }
    } catch (e) {
      console.warn('model failed', pieceId, e);
      v.error = String(e.message || e);
    } finally {
      loading.delete(key);
      wake();
    }
    return v;
  })();
  loading.set(key, job);
  return job;
}

export const variantReady = (pieceId, name) => { const v = variantOf(pieceId, name); return !!v && (v.ext === 'part' || !!v.obj); };
export const isHullPiece = id => lib.pieces.get(id)?.kind === 'hull';

/** how a gadget is oriented on its surface (see attMatrix) */
export const attMode = att => (isHullPiece(att.part) ? 'hull' : variantOf(att.part, att.variant)?.def?.mount === 'wall' ? 'upright' : 'gadget');

/** a gadget made of many shapes becomes one mesh per distinct look (colour, metal, rough...): far fewer draw calls and shadow passes */
function mergeByLook(root) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const buckets = new Map();
  for (const m of meshes) {
    const mat = m.material;
    if (Array.isArray(mat) || mat.map || mat.userData.textured || !m.geometry.attributes.position) continue;
    const key = [mat.color.getHex(), mat.metalness, mat.roughness, mat.emissive.getHex(), mat.emissiveIntensity, mat.flatShading, mat.transparent, mat.opacity, mat.depthWrite, mat.side, mat.userData.glass ? 1 : 0, mat.polygonOffset].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map(m => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    const merged = new Mesh(mergeGeometries(geos, false), list[0].material);
    for (const m of list) { m.parent?.remove(m); m.geometry.dispose(); }
    root.add(merged);
  }
  return root;
}

/** a fresh copy of a piece variant with its own materials (so painting one gadget does not repaint the others) */
export function instantiate(pieceId, variantName, ctx = {}) {
  const v = variantOf(pieceId, variantName);
  if (!v) return null;
  let root;
  if (v.ext === 'part') root = mergeByLook(buildFromJson(v.def, { ...ctx, ...(v.def.vars || {}), r: v.def.vars ? Math.min(v.def.vars.w ?? 1, v.def.vars.h ?? 1) / 2 : ctx.r }));
  else if (v.obj) root = v.obj.clone(true);
  else return null;
  root.traverse(o => {
    if (!o.isMesh) return;
    if (v.ext !== 'part') o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    o.geometry.boundingSphere || o.geometry.computeBoundingSphere();
    o.castShadow = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 0.22;      // bolts and knobs cast no shadow: each caster is drawn once per lamp face
    o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      m.side = DoubleSide;
      if (!m.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }   // a gadget lying on the hull wins the depth tie instead of flickering with it
      m.userData.base = { color: m.color ? m.color.clone() : null, map: m.map || null };
    }
  });
  return root;
}

/** the hole a hull piece cuts, from its variant ({shape:'rect'|'round'|'ngon', w, h, sides}) */
export const cutOf = (pieceId, name) => {
  const c = variantOf(pieceId, name)?.cut;
  return c ? { shape: c.shape || 'rect', w: c.w || 1, h: c.h || c.w || 1, sides: c.sides || 6 } : null;
};

/** apply a gadget's paint: 'none' = the model's own colours, 'tint' = multiply, 'replace' = flat colour / texture; glass keeps its own look */
export function applyPaint(root, paint, glass = 0.28) {
  const tex = paint.tex ? getTexture(paint.tex) : null;
  const tint = new THREE.Color(paint.color || '#ffffff');
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m.userData.glass) { setGlass(m, glass); if (paint.mode === 'tint') m.color.copy(m.userData.base.color).multiply(tint); else m.color.copy(m.userData.base.color); continue; }
      const b = m.userData.base;
      if (!b || !m.color) continue;
      const hadMap = !!m.map;
      if (paint.mode === 'tint') { m.color.copy(b.color).multiply(tint); m.map = b.map; }
      else if (paint.mode === 'replace') {
        m.color.copy(tint);
        if (tex) {
          const t = tex.clone();
          t.needsUpdate = true;
          t.repeat.set(1 / Math.max(paint.tile || 1, 0.05), 1 / Math.max(paint.tile || 1, 0.05));
          m.map = t;
        } else m.map = null;
      } else { m.color.copy(b.color); m.map = b.map; }
      if (hadMap !== !!m.map) m.needsUpdate = true;
    }
  });
}

// ------------------------------------------------------------------ connector models
const connLoading = new Map();
export function loadConnectorModel(id) {
  const c = lib.connectors.get(id);
  if (!c || c.kind !== 'model') return Promise.resolve(null);
  if (c.obj) return Promise.resolve(c.obj);
  if (connLoading.has(id)) return connLoading.get(id);
  const job = (async () => {
    try {
      const obj = await readModel(c);
      const m = c.meta || {};
      const wrap = new Group();
      wrap.add(obj);
      // bring the model's long axis onto +Z
      if (m.axis === 'x') obj.rotation.y = -Math.PI / 2;
      else if (m.axis === 'y') obj.rotation.x = Math.PI / 2;
      wrap.updateMatrixWorld(true);
      c.obj = wrap;
    } catch (e) {
      c.error = String(e.message || e);
      console.warn('connector model failed', id, e);
    } finally {
      connLoading.delete(id);
      wake();
    }
    return c.obj || null;
  })();
  connLoading.set(id, job);
  return job;
}
