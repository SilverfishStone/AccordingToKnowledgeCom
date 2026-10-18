// Turns the ship data into three.js objects: the CSG hull, door/hatch/airlock hardware, connector models, gadgets and
// hull pieces (windows), selection overlay.
import * as THREE from 'three';
import { buildHull, extractGeometry, resetCsg } from './hull.js';
import { bridgeGeometry } from './bridge.js';
import { frameGeometry, loftGeometry } from './geo.js';
import { computeWorlds, attMatrix, wallOf, tunnelMatrix } from './ship.js';
import { ends, sectionAt, styleOf, deformModel } from './connector.js';
import { instantiate, loadVariant, variantReady, isHullPiece, cutOf, applyPaint, getTexture, lib, loadConnectorModel, variantOf, attMode } from './assets.js';
import { toast, wake } from './util.js';
import * as paint from './paint.js';
import { doorStyleFor, buildDoorLeaf } from './doors.js';
import { buildDecal, decalSpec } from './decals.js';
import { frameGeometry as hallFrame } from './frame.js';
import { computeDeltas, movingKeys } from './anim.js';
import { Exhaust, dirVector } from './fx.js';

const { Mesh, Group, MeshStandardMaterial, Matrix4, Vector3, Box3, MathUtils, DoubleSide, FrontSide } = THREE;

const textureReady = new Map();
function loadTexture(id) {
  if (!textureReady.has(id)) {
    const tex = getTexture(id);
    if (!tex) return Promise.resolve(null);
    textureReady.set(id, new Promise(res => (tex.image ? res(tex) : tex.userData.onLoad.push(() => res(tex)))));
  }
  return textureReady.get(id);
}

const CUT_FRAME = new Matrix4().makeBasis(new Vector3(1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, 1, 0)); // loft's Z (depth) -> piece Y (out of the wall)

export class ShipView {
  constructor(app, scene) {
    this.app = app;
    this.root = new Group();
    this.hullGroup = new Group();
    this.connGroup = new Group();
    this.attGroup = new Group();
    this.fxGroup = new Group();
    this.frameGroup = new Group();
    this.bridgeGroup = new Group();
    this.root.add(this.hullGroup, this.frameGroup, this.connGroup, this.bridgeGroup, this.attGroup, this.fxGroup);
    scene.add(this.root);
    this.scene = scene;
    this.rig = null;
    this.mats = new Map();
    this.hullSerial = 0;
    this.hull = null;
    this.hullData = null;
    this.attObjs = new Map();
    this.clip = new THREE.Plane(new Vector3(1, 0, 0), 1e6);
    this.display = { xray: false, wire: false, cut: false };
    this.bounds = new Box3(new Vector3(-3, -3, -3), new Vector3(3, 3, 3));
    this.buildMs = 0;
    this.asked = new Set();
    this.envI = 1;
  }

  /** scale how strongly every material picks up the environment light (0 = none) */
  setEnvIntensity(v) {
    this.envI = v;
    const apply = m => { m.userData.envBase ??= m.envMapIntensity; m.envMapIntensity = m.userData.envBase * v; };
    this.mats.forEach(apply);
    this.attGroup.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(apply); });
  }

  // ------------------------------------------------------------ materials
  getMat(hallId, slotName) {
    const key = hallId + '.' + slotName;
    let m = this.mats.get(key);
    if (!m) {
      m = new MeshStandardMaterial({ clippingPlanes: [this.clip], side: FrontSide, envMapIntensity: 0.7 });
      m.userData.key = key;
      this.installPaint(m);
      this.mats.set(key, m);
      const slot = this.slotFor(key);
      if (slot) this.applySlot(m, slot);
    }
    return m;
  }

  /** lay the surface's painted canvas (if it has one) over the material: the canvas is read through the geometry's second uv set */
  installPaint(m) {
    m.userData.paintU = { value: paint.emptyTex };
    m.onBeforeCompile = sh => {
      sh.uniforms.paintMap = m.userData.paintU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\nvarying vec2 vPaintUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintUv = uv1;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D paintMap;\nvarying vec2 vPaintUv;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 paintC = texture2D(paintMap, vPaintUv);\ndiffuseColor.rgb = diffuseColor.rgb * (1.0 - paintC.a) + paintC.rgb;');
    };
    m.customProgramCacheKey = () => 'ship-paint-1';
    this.bindPaint(m);
  }

  bindPaint(m) {
    if (typeof m === 'string') m = this.mats.get(m);
    if (!m) return;
    const L = paint.layers.get(m.userData.key);
    m.userData.paintU.value = L ? L.tex : paint.emptyTex;
  }

  slotFor(key) {
    const [id, name] = key.split('.');
    const br = this.app.ship.bridges?.find(b => b.id === id);
    if (br) return br.mat;
    const hall = this.app.ship.halls.find(h => h.id === id);
    if (!hall) return null;
    return name === 'conn' ? hall.conn?.mat : hall[name];
  }

  applySlot(m, slot) {
    m.color.set(slot.color);
    m.metalness = slot.metal;
    m.roughness = slot.rough;
    m.emissive.set(slot.glow > 0 ? slot.color : '#000000');
    m.emissiveIntensity = slot.glow;
    m.userData.baseOpacity = slot.opacity ?? 1;
    if (slot.tex) {
      if (m.userData.texId !== slot.tex) {
        const id = slot.tex;
        m.userData.texId = id;
        loadTexture(id).then(base => {
          if (!base || m.userData.texId !== id) return;
          const c = base.clone();
          c.needsUpdate = true;
          m.map?.dispose();
          m.map = c;
          m.needsUpdate = true;
          this.setTile(m, slot.tile);
          wake();
        });
      } else this.setTile(m, slot.tile);
    } else if (m.map || m.userData.texId) {
      m.userData.texId = '';
      m.map?.dispose();
      m.map = null;
      m.needsUpdate = true;
    }
  }

  setTile(m, tile) {
    if (m.map) m.map.repeat.set(1 / Math.max(tile, 0.05), 1 / Math.max(tile, 0.05));
  }

  refreshMaterials() {
    for (const [key, m] of this.mats) {
      const slot = this.slotFor(key);
      if (slot) this.applySlot(m, slot);
      this.bindPaint(m);
    }
    this.applyDisplay();
    this.syncAtts();
  }

  applyDisplay(d = this.display) {
    this.display = d;
    if (this.app.vp) this.app.vp.shadowDirty = true;
    if (this.envI !== 1) this.setEnvIntensity(this.envI);
    for (const m of this.mats.values()) {
      const base = m.userData.baseOpacity ?? 1;
      const glassy = base < 0.99;
      m.wireframe = d.wire;
      m.transparent = d.xray || glassy;
      m.opacity = d.xray ? Math.min(base, 0.32) : base;
      m.depthWrite = !(d.xray || glassy);
      m.side = d.cut || d.xray || glassy ? DoubleSide : FrontSide;
    }
    this.attGroup.traverse(o => {
      if (o.isMesh) for (const m of [].concat(o.material)) m.wireframe = d.wire;
    });
  }

  // ------------------------------------------------------------ hull
  /** the holes cut by hull pieces (windows...) */
  collectCutters(ship, worlds) {
    const out = [];
    for (const att of ship.atts) {
      if (att.hidden || !isHullPiece(att.part)) continue;
      const hall = ship.halls.find(h => h.id === att.hall);
      if (!hall || hall.hidden) continue;
      const cut = cutOf(att.part, att.variant);
      if (!cut) {
        const key = att.part + '|' + att.variant;
        if (!this.asked.has(key)) { this.asked.add(key); loadVariant(att.part, att.variant).then(() => this.app.actions.requestHull()); }
        continue;
      }
      const half = wallOf(ship, hall) + 0.3;
      const kind = cut.shape === 'rect' ? 'rect' : 'ngon';
      const sides = cut.shape === 'ngon' ? cut.sides : 32;
      const geo = loftGeometry({ kind, sides, w: cut.w * att.s, h: cut.h * att.s, l: half * 2 });
      const matrix = worlds.get(hall.id).clone().multiply(attMatrix({ ...att, s: 1 }, true)).multiply(CUT_FRAME);
      out.push({ geo, matrix, hallId: hall.id });
    }
    return out;
  }

  rebuildHull() {
    const { ship } = this.app;
    const t0 = performance.now();
    const rigWas = !!this.rig;
    if (rigWas) this.stopRig();
    const worlds = computeWorlds(ship);
    this.app.worlds = worlds;
    const live = new Set([...ship.halls.map(h => h.id), ...(ship.bridges || []).map(b => b.id)]);
    for (const [key, m] of this.mats) {
      if (!live.has(key.split('.')[0])) { m.map?.dispose(); m.dispose(); this.mats.delete(key); }
    }
    let res = null, failed = false;
    try {
      res = buildHull(ship, worlds, (id, s) => this.getMat(id, s), this.collectCutters(ship, worlds));
    } catch (e) {
      failed = true;
      resetCsg();
      console.error(e);
      toast('Could not build the hull: ' + e.message + ' (the last good one is still shown)');
    }
    if (!failed && this.hull) { this.hullGroup.remove(this.hull); this.hull.geometry.dispose(); this.hull = null; }
    if (!failed) this.hullData = res;
    this.hullSerial++;
    if (res && !failed) {
      const mesh = new Mesh(res.geometry, res.materials);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.hull = true;
      this.hull = mesh;
      this.hullGroup.add(mesh);
    }
    this.buildMs = performance.now() - t0;
    this.applyDisplay();
    this.rebuildConns();
    this.rebuildFrames();
    this.rebuildBridges();
    this.syncAtts();
    this.updateBounds();
    this.updateSelection();
    if (rigWas || this.app.anim?.on) this.startRig();
    this.syncExhaust();
  }

  /** wings and scaffolding between halls (plain meshes in ship space) */
  rebuildBridges() {
    const { ship } = this.app, worlds = this.app.worlds;
    this.bridgeGroup.children.slice().forEach(m => { this.bridgeGroup.remove(m); m.geometry.dispose(); });
    for (const br of ship.bridges || []) {
      const ha = ship.halls.find(h => h.id === br.a.hall), hb = ship.halls.find(h => h.id === br.b.hall);
      if (br.hidden || !ha || !hb || ha.hidden || hb.hidden) continue;
      let g = null;
      try { g = bridgeGeometry(ship, worlds, br); } catch (e) { console.warn('bridge failed', e); }
      if (!g) continue;
      const m = new Mesh(g, this.getMat(br.id, 'mat'));
      m.castShadow = m.receiveShadow = true;
      m.userData.bridgeId = br.id;
      this.bridgeGroup.add(m);
    }
    this.applyDisplay();
  }

  /** rib rings and lattice poles (plain meshes riding on the hull) */
  rebuildFrames() {
    const { ship } = this.app, worlds = this.app.worlds;
    this.frameGroup.children.slice().forEach(m => { this.frameGroup.remove(m); m.geometry.dispose(); });
    for (const hall of ship.halls) {
      if (hall.hidden) continue;
      let g = null;
      try { g = hallFrame(ship, hall); } catch (e) { console.warn('frame failed', e); }
      if (!g) continue;
      const m = new Mesh(g, this.getMat(hall.id, 'rib'));
      m.matrixAutoUpdate = false;
      m.matrix.copy(worlds.get(hall.id));
      m.matrixWorldNeedsUpdate = true;
      m.castShadow = m.receiveShadow = true;
      m.userData.hallId = hall.id;
      this.frameGroup.add(m);
    }
    this.applyDisplay();
    this.rigCollect(['frames']);
  }

  updateBounds() {
    const b = new Box3();
    if (this.hull) { this.hull.geometry.computeBoundingBox(); b.copy(this.hull.geometry.boundingBox); }
    this.attGroup.updateMatrixWorld(true);
    this.attObjs.forEach(o => { if (o.root.visible) b.expandByObject(o.root); });
    this.bridgeGroup.children.forEach(o => b.expandByObject(o));
    if (this.app.model && this.app.modelBox) b.copy(this.app.modelBox);        // a model tab frames the model, not the (empty) ship
    this.bounds = b.isEmpty() ? new Box3(new Vector3(-3, -3, -3), new Vector3(3, 3, 3)) : b;
    this.app.emit('bounds');
  }

  // ------------------------------------------------------------ doors, hatches, airlocks, connector models
  rebuildConns() {
    const { ship } = this.app, worlds = this.app.worlds;
    this.connGroup.children.slice().forEach(g => { this.connGroup.remove(g); g.traverse(o => o.geometry?.dispose()); });
    const live = new Set(ship.halls.filter(h => !h.hidden).map(h => h.id));
    for (const hall of ship.halls) {
      const c = hall.conn;
      if (!c || c.type === 'fuse' || !live.has(hall.id) || !live.has(c.parent)) continue;
      const t = wallOf(ship, hall);
      const E = ends(ship, hall);
      const g = new Group();
      g.userData.connHall = hall.id;
      const mat = this.getMat(hall.id, 'conn');
      const add = (geo, x, y, z, rot) => {
        const m = new Mesh(geo, mat);
        m.position.set(x, y, z);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        return m;
      };
      const round = s => s.e < 6;
      // trim ring at both mouths, sized to the opening there
      add(frameGeometry(round(E.A), E.A.w, E.A.h, 0.14), 0, 0, -t + 0.08);
      add(frameGeometry(round(E.B), E.B.w, E.B.h, 0.14), 0, 0, c.len + t - 0.08);
      if (c.type !== 'doorway') {
        const ds = doorStyleFor(c), where = ds.def.where || (c.type === 'airlock' ? 'ends' : 'mid');
        const ctx = { t, open: MathUtils.clamp(c.open ?? 1, 0, 1), frameMat: mat };
        const place = (sec, z) => { const L = buildDoorLeaf(ds.def, sec, ctx); L.position.z = z; g.add(L); };
        if (where === 'ends') { place(E.A, 0); place(E.B, c.len); } else place(sectionAt(E, 0.5), c.len > 0 ? c.len / 2 : 0);
      }

      const style = styleOf(c);
      if (style?.kind === 'model') {
        if (style.obj) g.add(deformModel(style.obj, style.meta, E, Math.max(c.len, 0.01)));
        else loadConnectorModel(style.id).then(() => this.app.actions.requestConn());
      }
      g.matrix.copy(tunnelMatrix(worlds.get(c.parent), c));
      g.matrixAutoUpdate = false;
      g.matrixWorldNeedsUpdate = true;
      this.connGroup.add(g);
    }
    this.applyDisplay();
    this.rigCollect(['conns']);
  }

  // ------------------------------------------------------------ gadgets and hull pieces
  syncAtts() {
    const { ship } = this.app, worlds = this.app.worlds || computeWorlds(ship);
    const seen = new Set();
    for (const att of ship.atts) {
      seen.add(att.id);
      const hall = ship.halls.find(h => h.id === att.hall);
      const t = hall ? wallOf(ship, hall) : 0.2;
      const ready = variantReady(att.part, att.variant);
      const dspec = variantOf(att.part, att.variant)?.def?.decal;
      const key = dspec ? `decal|${this.hullSerial}|${JSON.stringify([att.p, att.n, att.spin, att.s, att.decal, att.variant])}` : `${att.part}|${att.variant}|${t.toFixed(3)}`;
      let rec = this.attObjs.get(att.id);
      if (!rec || rec.key !== key || rec.loaded !== ready) {
        if (rec) this.attGroup.remove(rec.root);
        const root = new Group();
        root.userData.attId = att.id;
        let inst = null;
        if (dspec && this.hull && hall) { inst = buildDecal(this.hull, att, worlds.get(hall.id), decalSpec(att, dspec)); if (inst) { inst.userData.decal = true; inst.material.clippingPlanes = [this.clip]; } }
        if (!inst && ready) inst = instantiate(att.part, att.variant, { t, glass: att.glass });
        if (!inst) {
          if (lib.pieces.has(att.part)) loadVariant(att.part, att.variant).then(() => this.syncAtts());
          inst = new Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ color: '#888888', wireframe: true }));
          inst.position.y = 0.25;
        } else inst.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) m.clippingPlanes = [this.clip]; });
        root.add(inst);
        root.matrixAutoUpdate = false;
        this.attGroup.add(root);
        rec = { root, key, loaded: ready, paintKey: '', decal: !!inst.userData.decal };
        this.attObjs.set(att.id, rec);
      }
      const W = hall ? worlds.get(hall.id) : new Matrix4();
      if (rec.decal) rec.root.matrix.identity(); else rec.root.matrix.copy(W).multiply(attMatrix(att, attMode(att)));
      rec.root.matrixWorldNeedsUpdate = true;
      rec.root.visible = !att.hidden && !(hall && hall.hidden);
      const pk = JSON.stringify(att.paint) + '|' + att.glass;
      if (rec.paintKey !== pk && rec.loaded) {
        applyPaint(rec.root, att.paint, att.glass);
        rec.paintKey = pk;
      }
    }
    for (const [id, rec] of this.attObjs) {
      if (!seen.has(id)) { this.attGroup.remove(rec.root); this.attObjs.delete(id); }
    }
    this.attGroup.updateMatrixWorld(true);
    this.applyDisplay();
    this.updateSelection();
    this.rigCollect(['atts']);
    if (this.rig) this.rigApply(this.rig.deltas);
    if (this.exhaust) this.syncExhaust();
  }


  // ------------------------------------------------------------ animation rig + exhaust
  /** the box (in the hall's own frame) of the hall's actual surfaces, for hinge presets */
  hallLocalBox(id) {
    const hd = this.hullData, W = this.app.worlds?.get(id);
    if (!hd || !W) return null;
    const inv = W.clone().invert(), box = new Box3(), v = new Vector3(), pos = hd.geometry.attributes.position, idx = hd.geometry.index;
    for (const g of hd.geometry.groups) {
      if (!hd.materials[g.materialIndex]?.userData.key?.startsWith(id + '.')) continue;
      const end = g.count === Infinity ? (idx ? idx.count : pos.count) : g.start + g.count;
      for (let i = g.start; i < end; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(inv); box.expandByPoint(v); }
    }
    return box.isEmpty() ? null : box;
  }

  /** split what the animations move off the merged hull and get ready to move it (animate mode) */
  startRig() {
    this.stopRig();
    const { ship } = this.app, anims = ship.anims || [];
    if (!anims.length) return;
    const keys = movingKeys(ship, anims), hd = this.hullData;
    const rig = { hull: this.hull, orig: null, meshes: new Map(), objs: [], root: keys.whole, deltas: new Map() };
    if (hd && this.hull && keys.halls.size) {
      const isMine = k => { const h = k?.split('.')[0]; return keys.halls.has(h); };
      rig.orig = this.hull.geometry.groups.slice();
      for (const id of keys.halls) {
        const ex = extractGeometry(hd.geometry, hd.materials, k => k.startsWith(id + '.'));
        if (!ex) continue;
        const m = new Mesh(ex.geometry, ex.materialIndices.map(i => hd.materials[i]));
        m.castShadow = m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.userData.hallId = id;
        m.userData.rig = true;
        this.hullGroup.add(m);
        rig.meshes.set(id, m);
      }
      this.hull.geometry.groups = rig.orig.filter(g => !isMine(hd.materials[g.materialIndex]?.userData.key));       // what moves is no longer drawn as part of the merged hull
    }
    this.rig = rig;
    this.rigCollect(['frames', 'conns', 'atts']);
    this.rigApply(new Map());
  }

  /** (re)read the static matrices of the things that move with a hall or gadget: ribs, connectors, gadgets */
  rigCollect(cats) {
    const rig = this.rig;
    if (!rig) return;
    const { ship } = this.app, keys = movingKeys(ship, ship.anims || []);
    rig.objs = rig.objs.filter(o => !cats.includes(o.cat));
    const add = (obj, key, cat) => rig.objs.push({ obj, key, cat, base: obj.matrix.clone() });
    if (cats.includes('frames')) for (const m of this.frameGroup.children) if (keys.halls.has(m.userData.hallId)) add(m, 'h:' + m.userData.hallId, 'frames');
    if (cats.includes('conns')) for (const g of this.connGroup.children) if (keys.halls.has(g.userData.connHall)) add(g, 'h:' + g.userData.connHall, 'conns');
    if (cats.includes('atts')) for (const [id, rec] of this.attObjs) if (keys.atts.has(id)) add(rec.root, 'a:' + id, 'atts');
  }

  rigApply(deltas) {
    const rig = this.rig;
    if (!rig) return;
    rig.deltas = deltas;
    for (const [id, m] of rig.meshes) { const D = deltas.get('h:' + id); if (D) m.matrix.copy(D); else m.matrix.identity(); m.matrixWorldNeedsUpdate = true; }
    for (const o of rig.objs) { const D = deltas.get(o.key); if (D) o.obj.matrix.copy(D).multiply(o.base); else o.obj.matrix.copy(o.base); o.obj.matrixWorldNeedsUpdate = true; }
    const whole = deltas.get('ship');
    this.root.matrixAutoUpdate = !whole && !this.rootLocked;
    if (whole) { this.root.matrix.copy(whole); this.rootLocked = true; } else if (this.rootLocked) { this.root.matrix.identity(); this.root.matrixAutoUpdate = true; this.rootLocked = false; this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.root.scale.set(1, 1, 1); }
    this.root.matrixWorldNeedsUpdate = true;
    this.exhaust?.setDeltas(k => deltas.get(k));
    if (this.app.vp) {
      this.app.vp.shadowDirty = true; this.app.vp.invalidate(200);
      if (!this.app.vp.gizmoDragging && this.app.anim.on) this.app.vp.syncGizmo();           // the gizmo follows the object as the playhead moves
    }
  }

  stopRig() {
    const rig = this.rig;
    if (!rig) return;
    this.rig = null;
    if (rig.hull === this.hull && rig.orig && this.hull) this.hull.geometry.groups = rig.orig;
    for (const m of rig.meshes.values()) { this.hullGroup.remove(m); m.geometry.dispose(); }
    for (const o of rig.objs) { o.obj.matrix.copy(o.base); o.obj.matrixWorldNeedsUpdate = true; }
    if (this.rootLocked) { this.root.matrix.identity(); this.root.matrixAutoUpdate = true; this.rootLocked = false; this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.root.scale.set(1, 1, 1); }
    this.exhaust?.setDeltas(() => null);
    if (this.app.vp) { this.app.vp.shadowDirty = true; this.app.vp.invalidate(500); }
  }

  /** every hall and gadget with exhaust, as flame frames in ship space (+Z = the way the exhaust goes) */
  exhaustList() {
    const { ship } = this.app, worlds = this.app.worlds, out = [];
    const frame = (W, local, fx, half) => {
      const d = dirVector(fx.dir), pos = d.clone().multiply(half).add(new Vector3(...(fx.off || [0, 0, 0])));
      const q = new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), d);
      return W.clone().multiply(local).multiply(new Matrix4().compose(pos, q, new Vector3(1, 1, 1)));
    };
    for (const h of ship.halls) {
      if (!h.fx || h.hidden || !worlds?.get(h.id)) continue;
      out.push({ key: 'h:' + h.id, fx: h.fx, base: frame(worlds.get(h.id), new Matrix4(), h.fx, new Vector3(h.w / 2, h.h / 2, h.l / 2)) });
    }
    for (const a of ship.atts) {
      if (!a.fx || a.hidden) continue;
      const hall = ship.halls.find(h => h.id === a.hall);
      if (hall?.hidden) continue;
      const W = (hall && worlds?.get(hall.id)) || new Matrix4();
      out.push({ key: 'a:' + a.id, fx: a.fx, base: frame(W, attMatrix(a, attMode(a)), a.fx, new Vector3(0, 0, 0)) });
    }
    return out;
  }

  syncExhaust() {
    if (!this.exhaust) {
      this.exhaustGroup = new Group();
      this.root.add(this.exhaustGroup);
      this.exhaust = new Exhaust(this.exhaustGroup, this.scene);
    }
    this.exhaust.sync(this.exhaustList());
    this.exhaustGroup.visible = this.exhaust.points.visible = !!this.app.anim?.on;
    if (this.rig) this.exhaust.setDeltas(k => this.rig.deltas.get(k));
  }

  /** animate mode on or off */
  setAnimMode(on) {
    this.app.anim.on = on;
    if (on) this.startRig(); else { this.stopRig(); this.app.anim.state.reset(); }
    this.syncExhaust();
    if (this.exhaust) this.exhaust.points.visible = on && this.exhaust.n > 0;
    this.app.vp?.invalidate(500);
  }

  /** one frame of animate mode */
  animTick(dt) {
    const A = this.app.anim, ship = this.app.ship, anims = ship.anims || [];
    A.state.step(anims, dt);
    this.rigApply(computeDeltas(ship, this.app.worlds, anims, A.state));
    const vp = this.app.vp;
    if (this.exhaust) this.exhaust.update(dt, { throttle: A.throttle, flow: new Vector3(0, 0, -8), fire: true, smoke: true, bright: 1, height: vp?.renderer.domElement.height, fov: vp?.camera.fov });
  }

  // ------------------------------------------------------------ selection highlight
  updateSelection() {
    this.fxGroup.children.filter(c => c.userData.sel).forEach(c => { this.fxGroup.remove(c); c.geometry?.dispose(); });
    const sel = this.app.sel;
    if (!sel.id) return;
    if (sel.type === 'hall' && this.hullData) {
      const ex = extractGeometry(this.hullData.geometry, this.hullData.materials, k => k.startsWith(sel.id + '.'));
      if (ex) {
        const m = new Mesh(ex.geometry, new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, clippingPlanes: [this.clip] }));
        m.userData.sel = true;
        m.renderOrder = 5;
        this.fxGroup.add(m);
      }
    } else if (sel.type === 'bridge') {
      const m = this.bridgeGroup.children.find(c => c.userData.bridgeId === sel.id);
      if (m) { const h = new THREE.BoxHelper(m, '#4ab0ff'); h.userData.sel = true; this.fxGroup.add(h); }
    } else if (sel.type === 'group') {
      for (const h of this.app.actions.groupMembers(sel.id)) {
        const ex = this.hullData && extractGeometry(this.hullData.geometry, this.hullData.materials, k => k.startsWith(h.id + '.'));
        if (!ex) continue;
        const m = new Mesh(ex.geometry, new THREE.MeshBasicMaterial({ color: '#ffb24a', transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, clippingPlanes: [this.clip] }));
        m.userData.sel = true;
        m.renderOrder = 5;
        this.fxGroup.add(m);
      }
    } else if (sel.type === 'att') {
      const rec = this.attObjs.get(sel.id);
      if (rec && rec.root.visible) {
        const h = new THREE.BoxHelper(rec.root, '#4ab0ff');
        h.userData.sel = true;
        this.fxGroup.add(h);
      }
    }
  }

  // ------------------------------------------------------------ picking
  /** nearest thing under the ray: {type:'hall'|'att'|'door', id, point, normal, slot} or null */
  pick(raycaster, skipHall = null, hullOnly = false) {
    let best = null;
    const clipped = pt => this.display.cut && this.clip.distanceToPoint(pt) < 0;     // clicks go through whatever the cutaway has sliced away
    const consider = (hit, info) => { if (hit && (!best || hit.distance < best.distance)) best = { distance: hit.distance, point: hit.point.clone(), ...info, hit }; };
    if (this.hull) {
      for (const hit of raycaster.intersectObject(this.hull, false)) {
        const key = this.hull.material[hit.face.materialIndex]?.userData.key || '';
        const [id, slot] = key.split('.');
        if (clipped(hit.point) || (skipHall && skipHall(id, slot))) continue;
        consider(hit, { type: 'hall', id, slot, normal: hit.face.normal.clone() });
        break;
      }
    }
    if (this.rig) {                                                    // halls that are being animated are separate meshes
      for (const [id, m] of this.rig.meshes) {
        const hit = raycaster.intersectObject(m, false).find(h => !clipped(h.point));
        if (hit) consider(hit, { type: 'hall', id, slot: (m.material[hit.face.materialIndex]?.userData.key || '').split('.')[1], normal: hit.face.normal.clone() });
      }
    }
    if (hullOnly) return best;
    for (const [id, rec] of this.attObjs) {
      if (!rec.root.visible) continue;
      const hit = raycaster.intersectObject(rec.root, true).find(h => !clipped(h.point));
      if (hit) consider(hit, { type: 'att', id, normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 1, 0) });
    }
    for (const m of this.bridgeGroup.children) {
      const hit = raycaster.intersectObject(m, false).find(h => !clipped(h.point));
      if (hit) consider(hit, { type: 'bridge', id: m.userData.bridgeId, normal: hit.face ? hit.face.normal.clone() : new Vector3(0, 1, 0) });
    }
    for (const g of this.connGroup.children) {
      const hit = raycaster.intersectObject(g, true).find(h => !clipped(h.point));
      if (hit) consider(hit, { type: 'door', id: g.userData.connHall, normal: hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 1, 0) });
    }
    return best;
  }
}
