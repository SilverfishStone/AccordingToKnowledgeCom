// The 3D view: renderer, camera (orbit or fly), lights, picking, placement ghosts, gizmo, PNG capture.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hallGeometry } from './geo.js';
import { newHall, newConn, childMatrix, attMatrix, tunnelMatrix, wallOf, matrixToXf, CONN_PRESETS, branchOf, computeWorlds } from './ship.js';
import { instantiate, variantReady, loadVariant, isHullPiece, variantOf, attMode } from './assets.js';
import { settings, held, pixelRatio, actionFor } from './settings.js';
import { placeSize, placeY } from './layout.js';
import { trackValue, setKeyAt, frameOf } from './anim.js';
import { pickNode, nodeFrame, applyGizmo, beginGizmo, beginPaint, paintAt, endPaint } from './modelbuilder.js';
import { wake } from './util.js';

const { Vector3, Matrix4, Quaternion, Euler, Raycaster, Vector2, MathUtils, Mesh, Group } = THREE;
const _v1 = new Vector3(), _v2 = new Vector3();
const round3 = v => Math.round(v * 1000) / 1000;

export const BACKGROUNDS = {
  space: { label: 'Deep space', color: '#05070d', stars: true },
  dusk: { label: 'Dusk gradient', color: '#1b2336', stars: true },
  studio: { label: 'Studio grey', color: '#3b414d', stars: false },
  paper: { label: 'Light paper', color: '#dfe3ea', stars: false },
  none: { label: 'Transparent (PNG)', color: null, stars: false },
};

export const PRESETS = {
  overview: 'Overview (3/4 from above)',
  top: 'Top (plan)',
  bottom: 'Bottom',
  front: 'Front (from the nose)',
  back: 'Rear (engines)',
  left: 'Left side',
  right: 'Right side',
  chase: 'Chase (behind & above)',
  inside: 'Inside the selected hall',
  door: 'Looking through the selected hall\'s door',
};

export class Viewport {
  constructor(canvas, app, shipView, scene) {
    this.canvas = canvas;
    this.app = app;
    this.sv = shipView;
    this.scene = scene;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(pixelRatio());
    this.renderer.shadowMap.enabled = !settings.flatLight;
    this.renderer.shadowMap.type = settings.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;     // shadow maps are redrawn only when the ship or its lights change (many lamps would be slow otherwise)
    this.shadowDirty = true;
    this.renderer.localClippingEnabled = true;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 6000);
    this.camera.position.set(14, 9, 16);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;
    this.orbit.maxDistance = 3000;
    this.mode = 'orbit';
    this.scheme = 'standard';
    this.fly = { yaw: 0, pitch: 0, speed: 6, keys: new Set(), drag: false };
    this.tool = 'select';
    this.ghost = null;
    this.ghostKey = '';
    this.hover = null;
    this.pending = null;
    this.stroke = null;

    this.renderUntil = 0;                 // the view only draws while something is changing (saves the GPU, and the laptop fan)
    this.lastDraw = 0;
    wake.fn = () => this.invalidate(900);
    this.drafting = false;                 // while you move things the view is drawn flat and smaller; full quality comes back when you stop
    this.moveUntil = 0;
    this.orbit.addEventListener('change', () => { this.invalidate(300); this.markMoving(); });
    addEventListener('input', () => this.markMoving(600), { capture: true, passive: true });
    for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'keydown', 'keyup', 'input', 'change', 'click', 'contextmenu', 'dragover', 'drop']) addEventListener(ev, () => this.invalidate(500), { capture: true, passive: true });
    this.setupLights();
    this.setupGizmo();
    this.setBackground('space');
    this.setScheme('standard');
    this.bindInput();
    new ResizeObserver(() => { this.resize(); this.invalidate(); }).observe(canvas.parentElement);
    this.resize();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ scene furniture
  setupLights() {
    const s = this.scene;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environment = this.envTex;
    this.hemi = new THREE.HemisphereLight('#cfe0ff', '#2a2e38', 0.35);
    s.add(this.hemi);
    this.head = new THREE.DirectionalLight('#ffffff', 0);       // flat-light mode: one soft light from the camera so shapes still read
    s.add(this.head, this.head.target);
    this.lightGroup = new Group();      // the little bulbs that mark point lights (click one to select it)
    s.add(this.lightGroup);
    this.lightObjs = new Map();
    this.shadowsOn = true;

    const N = 1800, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new Vector3().randomDirection().multiplyScalar(2600);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, sizeAttenuation: false, fog: false, depthWrite: false, depthTest: false }));
    this.stars.renderOrder = -1;
    s.add(this.stars);

    this.grid = new THREE.GridHelper(200, 200, '#556078', '#2c3342');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    s.add(this.grid);
    this.gridOn = true;
  }

  /** the ship's own lights (any number, or none): sun-like directional lights and placeable point lamps */
  syncLights() {
    const { ship, worlds } = this.app;
    const b = this.sv.bounds, c = b.getCenter(new Vector3()), r = Math.max(b.getSize(new Vector3()).length() / 2, 2);
    const seen = new Set();
    const lamps = [];                       // lights that belong to gadgets (a lamp fixture): they follow the gadget
    for (const att of ship.atts) {
      const lt = variantOf(att.part, att.variant)?.def?.light;
      const hall = ship.halls.find(h => h.id === att.hall);
      if (!lt || !worlds) continue;
      const W = hall ? worlds.get(hall.id) : new Matrix4();
      if (!W) continue;                      // the hull has not been built yet (first frame after loading a saved ship)
      const M = W.clone().multiply(attMatrix(att, attMode(att)));
      lamps.push({ id: 'att:' + att.id, type: 'point', virtual: true, color: lt.color || '#ffb98a', intensity: (lt.intensity ?? 8) * att.s * att.s, reach: lt.reach || 0, shadows: lt.shadows !== false,
        flicker: lt.flicker || 0, speed: lt.speed || 1, hidden: !!att.hidden || !!hall?.hidden, worldPos: new Vector3(0, lt.y ?? 0.15, 0).applyMatrix4(M) });
    }
    let shadowed = 0;
    for (const l of [...ship.lights, ...lamps]) {
      seen.add(l.id);
      let rec = this.lightObjs.get(l.id);
      if (rec && rec.type !== l.type) { this.dropLight(l.id); rec = null; }
      if (!rec) {
        let obj, icon = null;
        if (l.type === 'sun') {
          obj = new THREE.DirectionalLight();
          obj.shadow.mapSize.set(2048, 2048);
          obj.shadow.bias = -0.0004;
          obj.shadow.normalBias = 0.04;
          this.scene.add(obj, obj.target);
        } else {
          obj = new THREE.PointLight();
          obj.decay = 2;
          obj.shadow.mapSize.set(512, 512);
          obj.shadow.bias = -0.002;
          obj.shadow.normalBias = 0.02;
          obj.shadow.camera.near = 0.05;
          this.scene.add(obj);
          if (!l.virtual) {
            icon = new Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshBasicMaterial({ color: l.color, toneMapped: false }));
            icon.userData.lightId = l.id;
            this.lightGroup.add(icon);
          }
        }
        rec = { type: l.type, obj, icon, seed: [...l.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) };
        this.lightObjs.set(l.id, rec);
      }
      const { obj, icon } = rec;
      rec.l = l;
      obj.color.set(l.color);
      icon?.material.color.set(l.color);
      obj.visible = !l.hidden && !this.flat();                 // flat-light mode: no lamp is rendered at all
      if (icon) icon.visible = !l.hidden;
      obj.castShadow = !!l.shadows && this.shadowsOn && !l.hidden && !this.flat() && (l.type === 'sun' || shadowed++ < settings.lampShadows);
      if (l.type === 'sun') {
        const az = MathUtils.degToRad(l.az), el = MathUtils.degToRad(l.el);
        const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
        obj.position.copy(c).addScaledVector(dir, r * 3);
        obj.target.position.copy(c);
        const sc = obj.shadow.camera;
        sc.left = -r * 1.3; sc.right = r * 1.3; sc.top = r * 1.3; sc.bottom = -r * 1.3;
        sc.near = r * 0.5; sc.far = r * 6;
        sc.updateProjectionMatrix();
      } else {
        const p = l.worldPos ? l.worldPos.clone() : new Vector3(...l.p), W = !l.worldPos && l.hall && worlds.get(l.hall);
        if (W) p.applyMatrix4(W);
        obj.position.copy(p);
        icon?.position.copy(p);
        obj.distance = l.reach || 0;
        obj.shadow.camera.far = Math.max(l.reach || 0, 40);
        obj.shadow.camera.updateProjectionMatrix();
      }
    }
    for (const id of [...this.lightObjs.keys()]) if (!seen.has(id)) this.dropLight(id);
    this.shadowDirty = true;
    this.animateLights(performance.now() / 1000);
  }

  dropLight(id) {
    const rec = this.lightObjs.get(id);
    if (!rec) return;
    this.scene.remove(rec.obj);
    if (rec.obj.target) this.scene.remove(rec.obj.target);
    if (rec.icon) { this.lightGroup.remove(rec.icon); rec.icon.geometry.dispose(); rec.icon.material.dispose(); }
    rec.obj.dispose?.();
    this.lightObjs.delete(id);
  }

  animateLights(t) {
    let any = false;
    if (this.flat()) return false;
    for (const rec of this.lightObjs.values()) {
      const l = rec.l, k = settings.flicker ? (l.flicker || 0) : 0, s = l.speed || 1;
      if (k && rec.obj.visible) any = true;
      const f = k ? 1 - k * (0.5 + 0.5 * Math.sin(t * s * 7 + rec.seed) * Math.sin(t * s * 2.3 + rec.seed * 1.7)) : 1;
      rec.obj.intensity = l.intensity * f;
      if (rec.icon) rec.icon.scale.setScalar(0.6 + 0.4 * f);
    }
    return any;
  }

  flat() { return settings.flatLight || this.drafting; }

  markMoving(ms = 400) { this.moveUntil = Math.max(this.moveUntil, performance.now() + ms); }

  ratio() { return pixelRatio() * (this.drafting ? settings.draftScale : 1); }

  setDraft(on) {
    if (this.drafting === on) return;
    this.drafting = on;
    this.applyLighting();
  }

  /** lamps, shadows, fill light and picture size for the current mode (normal, flat, or draft while moving) */
  applyLighting() {
    const r = this.renderer;
    r.setPixelRatio(this.ratio());
    r.shadowMap.enabled = !this.flat();
    this.applyAmbient();
    this.syncLights();
    this.resize();
    if (!this.flat()) this.shadowDirty = true;
    this.invalidate(500);
  }

  /** ask for a few more frames */
  invalidate(ms = 600) { this.renderUntil = Math.max(this.renderUntil, performance.now() + ms); }

  /** picture settings changed (render scale, shadow softness) */
  applySettings() {
    const r = this.renderer;
    this.applyLighting();
    const type = settings.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (r.shadowMap.type !== type) {
      r.shadowMap.type = type;
      this.sv.mats.forEach(m => { m.needsUpdate = true; });
      this.sv.attGroup.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    }
    this.resize();
    this.syncLights();
    this.invalidate(1000);
  }

  /** fill light: sky/ground (hemisphere) and the room-like reflection environment; both 0 = true darkness */
  applyAmbient() {
    const a = this.app.ship.ambient, flat = this.flat();
    this.hemi.intensity = flat ? 1.1 : a.hemi;
    this.head.intensity = flat ? 0.75 : 0;
    this.head.visible = flat;
    this.scene.environment = flat || a.env > 0.001 ? this.envTex : null;
    this.sv.setEnvIntensity(flat ? 0.6 : a.env);
  }

  /** fit the ground grid around the ship, and re-aim the lights at it */
  fitLights() {
    const b = this.sv.bounds, c = b.getCenter(new Vector3()), r = Math.max(b.getSize(new Vector3()).length() / 2, 2);
    const size = Math.max(40, Math.ceil(r * 8 / 10) * 10);
    this.grid.scale.setScalar((this.app.model ? 12 : size) / 200);
    this.grid.position.set(this.app.model ? 0 : Math.round(c.x), this.app.model ? -0.045 : b.min.y - 1.5, this.app.model ? 0 : Math.round(c.z));
    this.syncLights();
  }

  setBackground(name) {
    const bg = BACKGROUNDS[name] || BACKGROUNDS.space;
    this.bgName = name;
    this.scene.background = bg.color ? new THREE.Color(bg.color) : null;
    this.stars.visible = bg.stars;
    if (this.sky && name !== 'none') { this.scene.background = this.sky; this.stars.visible = false; }
  }

  /** a picture of the sky (equirectangular, like a panorama) behind the ship; null removes it. Not saved with the ship (it can be huge). */
  setSkyImage(url) {
    if (!url) { this.sky = null; this.setBackground(this.bgName); return; }
    new THREE.TextureLoader().load(url, t => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      this.sky = t;
      this.setBackground(this.bgName);
      this.invalidate(900);
    });
  }

  setGrid(on) { this.gridOn = on; this.grid.visible = on; }
  setShadows(on) { this.shadowsOn = on; this.syncLights(); }
  setFov(f) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }

  setCut({ on, axis = 'x', t = 0.5, flip = false }) {
    this.shadowDirty = true;
    this.sv.display = { ...this.sv.display, cut: on };
    if (!on) { this.sv.clip.set(new Vector3(1, 0, 0), 1e6); this.sv.applyDisplay(); return; }
    const b = this.sv.bounds;
    const ax = new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    const lo = b.min.getComponent('xyz'.indexOf(axis)), hi = b.max.getComponent('xyz'.indexOf(axis));
    const pos = lo + (hi - lo) * t;
    const sign = flip ? 1 : -1;
    this.sv.clip.set(ax.clone().multiplyScalar(sign), -sign * pos);
    this.sv.applyDisplay();
  }

  // ------------------------------------------------------------ gizmo (move / rotate free halls, move / scale gadgets)
  setupGizmo() {
    this.proxy = new Group();
    this.scene.add(this.proxy);
    this.gizmo = new TransformControls(this.camera, this.canvas);
    this.gizmo.setSize(0.85);
    this.scene.add(this.gizmo);
    this.gizmo.addEventListener('dragging-changed', e => {
      this.orbit.enabled = !e.value && this.mode === 'orbit';
      this.gizmoDragging = e.value;
      if (e.value) { this.gizmoStart = this.snapshotTarget(); this.beginAnimDrag(); }
      if (e.value && this.gizmoTarget?.type === 'node') beginGizmo(this.gizmoTarget.id);
      if (!e.value) {
        this.endDragPreview();
        if (this.animRec) { this.animRec = null; this.app.actions.animEdited(); }       // a pose recorded as keys in Animate mode
        else this.app.actions.commit('Move');
      }
    });
    this.gizmo.addEventListener('objectChange', () => this.onGizmoChange());
    this.gizmoDragging = false;
    this.gizmo.enabled = false;
    this.gizmo.visible = false;
  }

  /** put the gizmo on whatever is selected, if it can be dragged */
  syncGizmo() {
    const { sel, ship, worlds } = this.app;
    if (this.gizmoDragging) return;
    let ok = false;
    if (this.tool === 'select' && sel.id) {
      if (sel.type === 'hall') {
        const h = ship.halls.find(x => x.id === sel.id);
        if (h && !h.link && (!h.conn || h.conn.type === 'fuse') && worlds?.has(h.id)) {
          let m = worlds.get(h.id);
          const D = this.app.anim.on ? this.sv.rig?.deltas.get('h:' + h.id) : null;      // in Animate mode the gizmo sits where the hall is at the playhead
          if (D) m = D.clone().multiply(m);
          m.decompose(this.proxy.position, this.proxy.quaternion, this.proxy.scale);
          this.proxy.scale.set(1, 1, 1);
          ok = true;
        }
      } else if (sel.type === 'light') {
        const rec = this.lightObjs.get(sel.id);
        if (rec?.icon) {
          this.proxy.position.copy(rec.icon.position);
          this.proxy.quaternion.identity();
          this.proxy.scale.set(1, 1, 1);
          this.gizmo.setMode('translate');
          ok = true;
        }
      } else if (sel.type === 'group') {
        if (this.app.actions.groupRoots(sel.id).length) {
          this.proxy.position.copy(this.app.actions.groupPivot(sel.id));
          const D = this.app.anim.on ? this.sv.rig?.deltas.get('h:' + this.app.actions.groupRoots(sel.id)[0]?.id) : null;
          if (D) this.proxy.position.applyMatrix4(D);
          this.proxy.quaternion.identity();
          this.proxy.scale.set(1, 1, 1);
          ok = true;
        }
      } else if (sel.type === 'node') {
        const f = nodeFrame(sel.id);
        if (f) {
          this.proxy.position.copy(f.pos);
          this.proxy.quaternion.copy(f.quat);
          this.proxy.scale.set(1, 1, 1);
          const sn = this.app.modelSnap;                 // move / turn / scale in steps if asked
          this.gizmo.setTranslationSnap(sn.on ? sn.move : null);
          this.gizmo.setRotationSnap(sn.on ? THREE.MathUtils.degToRad(sn.rot) : null);
          this.gizmo.setScaleSnap(sn.on ? 0.05 : null);
          ok = true;
        }
      } else if (sel.type === 'att') {
        const rec = this.sv.attObjs.get(sel.id);
        if (rec) {
          rec.root.matrix.decompose(this.proxy.position, this.proxy.quaternion, this.proxy.scale);
          this.proxy.scale.set(1, 1, 1);
          ok = true;
        }
      }
    }
    this.gizmo.setSpace(this.gizmo.mode === 'scale' || (sel.type === 'att' && this.gizmo.mode === 'rotate') ? 'local' : 'world');
    const spinOnly = ok && sel.type === 'att' && this.gizmo.mode === 'rotate';      // a gadget turns about its own up (out of the surface): that is its Spin
    this.gizmo.showX = !spinOnly; this.gizmo.showZ = !spinOnly;
    if (ok) this.gizmo.attach(this.proxy); else this.gizmo.detach();
    this.gizmo.enabled = ok;
    this.gizmo.visible = ok;
    this.gizmoTarget = ok ? sel : null;
  }

  /** Animate mode: moving, turning or resizing the selected hall, gadget or group with the gizmo records Move / Rotate / Size keys at the playhead. */
  beginAnimDrag() {
    this.animRec = null;
    const t = this.gizmoTarget, A = this.app.actions, app = this.app;
    if (!app.anim.on || !t || !['hall', 'att', 'group'].includes(t.type)) return;
    const mode = this.gizmo.mode;
    const clip = A.curClip() || A.addClip('empty');
    const tr = clip.tracks.find(x => x.target.type === t.type && x.target.id === t.id) || A.addTrack(clip, { type: t.type, id: t.id });
    const time = app.anim.state.get(clip.id).t, F = frameOf(app.ship, app.worlds, tr.target);
    this.animRec = {
      tr, time, mode, p0: trackValue(tr, 'pos', time), r0: trackValue(tr, 'rot', time), s0: trackValue(tr, 'scl', time),
      P0: this.proxy.position.clone(), Q0: this.proxy.quaternion.clone(), Frot: new THREE.Quaternion().setFromRotationMatrix(F),
    };
  }

  recordAnimKey() {
    const r = this.animRec, p = this.proxy;
    if (!r) return false;
    const inv = r.Frot.clone().invert();
    if (r.mode === 'translate') {
      const v = p.position.clone().sub(r.P0).applyQuaternion(inv).toArray();
      v.forEach((d, i) => setKeyAt(r.tr, 'pos', r.time, i, round3(r.p0[i] + d)));
    } else if (r.mode === 'rotate') {                               // the turn, seen in the thing's own axes, on top of how it is turned already
      const dq = p.quaternion.clone().multiply(r.Q0.clone().invert());
      const own = inv.clone().multiply(dq).multiply(r.Frot);
      const cur = new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.r0.map(THREE.MathUtils.degToRad), 'XYZ'));
      const e = new THREE.Euler().setFromQuaternion(own.multiply(cur), 'XYZ');
      [e.x, e.y, e.z].forEach((a, i) => setKeyAt(r.tr, 'rot', r.time, i, Math.round(THREE.MathUtils.radToDeg(a) * 100) / 100));
    } else {
      [p.scale.x, p.scale.y, p.scale.z].forEach((k, i) => setKeyAt(r.tr, 'scl', r.time, i, Math.max(0.05, round3(r.s0[i] * k))));
    }
    this.app.sv.animTick(0);
    this.app.anim.refreshPose?.();
    return true;
  }

  onGizmoChange() {
    const t = this.gizmoTarget;
    if (!t) return;
    if (this.animRec && this.recordAnimKey()) return;
    const { ship, worlds } = this.app;
    if (t.type === 'node') { applyGizmo(t.id, this.proxy, this.gizmo.mode); this.app.emit('inspector-values'); return; }
    if (t.type === 'group') {                               // move, turn or resize every hall of the group, always measured from where the drag began
      const st = this.gizmoStart;
      if (!st?.snap) return;
      const pv = st.snap.pivot, d = this.proxy.position.clone().sub(pv);
      const M = new Matrix4().makeTranslation(pv.x + d.x, pv.y + d.y, pv.z + d.z).multiply(new Matrix4().makeRotationFromQuaternion(this.proxy.quaternion)).multiply(new Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z));
      const k = this.gizmo.mode === 'scale' ? Math.max(0.05, (this.proxy.scale.x + this.proxy.scale.y + this.proxy.scale.z) / 3) : 1;
      this.app.actions.groupApply(st.snap, M, k, false);
      this.pendingHull = true;
      this.showDragGhost(st.snap.roots.map(r => r.id), true);
      this.app.emit('inspector-values');
      return;
    }
    if (t.type === 'light') {
      const l = ship.lights.find(x => x.id === t.id);
      if (!l) return;
      const W = l.hall && worlds.get(l.hall);
      const p = this.proxy.position.clone();
      if (W) p.applyMatrix4(W.clone().invert());
      l.p = p.toArray();
      this.syncLights();
      this.app.emit('inspector-values');
      return;
    }
    if (t.type === 'hall') {
      const h = ship.halls.find(x => x.id === t.id);
      if (!h) return;
      if (this.gizmo.mode === 'scale' && this.gizmoStart?.type === 'hall') {      // stretch the hall: width, height, length, in its own axes
        const s = this.gizmoStart, k = this.proxy.scale, set = (key, v) => { const nv = Math.max(0.5, round3(v)); if (nv !== h[key]) this.app.actions.setHallProp(h, key, nv); };
        set('w', s.w * k.x); set('h', s.h * k.y); set('l', s.l * k.z);
        this.pendingHull = true;
        this.showDragGhost(h.id, true);
        this.app.emit('inspector-values');
        return;
      }
      const M = new Matrix4().compose(this.proxy.position, this.proxy.quaternion, new Vector3(1, 1, 1));
      if (h.conn) h.conn.rel = matrixToXf(worlds.get(h.conn.parent).clone().invert().multiply(M));       // fused: relative to the parent
      else h.xf = matrixToXf(M);
      this.pendingHull = true;                      // the hull is rebuilt once, when you let go; meanwhile a ghost shows where the hall is going
      this.showDragGhost(h.id);
      this.app.emit('inspector-values');
    } else {
      const att = ship.atts.find(x => x.id === t.id);
      if (!att) return;
      const hall = ship.halls.find(x => x.id === att.hall);
      const W = hall ? worlds.get(hall.id) : new Matrix4();
      const p = this.proxy.position.clone().applyMatrix4(W.clone().invert());
      att.p = [p.x, p.y, p.z];
      const st = this.gizmoStart?.type === 'att' ? this.gizmoStart : null;
      if (this.gizmo.mode === 'scale') att.s = MathUtils.clamp((st ? st.s : att.s) * (this.proxy.scale.x + this.proxy.scale.y + this.proxy.scale.z) / 3, 0.02, 60);
      else this.proxy.scale.set(1, 1, 1);
      if (this.gizmo.mode === 'rotate' && st) {                                   // turning about the gadget's up axis sets its spin
        const dq = this.proxy.quaternion.clone().multiply(st.quat.clone().invert());
        const axis = new Vector3(0, 1, 0).applyQuaternion(st.quat);
        const ang = THREE.MathUtils.radToDeg(2 * Math.atan2(dq.x * axis.x + dq.y * axis.y + dq.z * axis.z, dq.w));
        const wrap = a => ((a + 540) % 360) - 180;
        const cand = s => wrap(st.spin + s * ang);
        const want = new Vector3(1, 0, 0).applyQuaternion(this.proxy.quaternion);
        const x = s => { const m = attMatrix({ ...att, spin: cand(s) }, attMode(att)); return new Vector3(m.elements[0], m.elements[1], m.elements[2]).transformDirection(W).dot(want); };
        att.spin = round3(cand(x(1) >= x(-1) ? 1 : -1));
      }
      if (isHullPiece(att.part)) this.pendingHull = true;                  // the hole is cut when you let go
      this.sv.syncAtts();
      this.app.emit('inspector-values');
    }
  }

  /** what the selected thing looked like when a gizmo drag began (scale and spin are measured from there) */
  snapshotTarget() {
    const t = this.gizmoTarget, { ship } = this.app;
    if (!t) return null;
    if (t.type === 'group') return { type: 'group', snap: this.app.actions.groupSnapshot(t.id) };
    if (t.type === 'hall') { const h = ship.halls.find(x => x.id === t.id); return h && { type: 'hall', w: h.w, h: h.h, l: h.l }; }
    if (t.type === 'att') { const a = ship.atts.find(x => x.id === t.id); return a && { type: 'att', s: a.s, spin: a.spin, quat: this.proxy.quaternion.clone() }; }
    return null;
  }

  /** while a hall is being dragged: see-through copies of it (and everything attached beyond it) at the new place - the real hull is rebuilt once at the end */
  showDragGhost(rootId, fresh = false) {
    const ship = this.app.ship, roots = [].concat(rootId), ids = [...new Map(roots.flatMap(r => branchOf(ship, r)).map(h => [h.id, h])).values()], rootKey = roots.join(',');
    if (fresh) this.clearDragGhost();
    if (!this.dragGhost || this.dragGhost.userData.root !== rootKey) {
      this.clearDragGhost();
      const g = new Group();
      g.userData.root = rootKey;
      const mat = new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.3, depthWrite: false });
      for (const h of ids) {
        const m = new Mesh(hallGeometry(h, 0), mat);
        m.matrixAutoUpdate = false;
        m.userData.hallId = h.id;
        g.add(m);
      }
      this.scene.add(g);
      this.dragGhost = g;
    }
    const W = computeWorlds(ship);
    for (const m of this.dragGhost.children) { m.matrix.copy(W.get(m.userData.hallId)); m.matrixWorldNeedsUpdate = true; }
    this.invalidate(400);
  }

  clearDragGhost() {
    if (!this.dragGhost) return;
    this.scene.remove(this.dragGhost);
    this.dragGhost.traverse(o => o.geometry?.dispose?.());
    this.dragGhost = null;
  }

  endDragPreview() {
    this.clearDragGhost();
    if (this.pendingHull) { this.pendingHull = false; this.app.actions.requestHull(); }
    this.shadowDirty = true;
  }

  setGizmoMode(m) {
    this.gizmo.setMode(m);
    this.syncGizmo();
  }

  // ------------------------------------------------------------ camera
  setScheme(name) {
    this.scheme = name;
    const O = this.orbit, M = THREE.MOUSE;
    if (name === 'fly') { this.setMode('fly'); return; }
    this.setMode('orbit');
    O.mouseButtons = name === 'middle' ? { LEFT: -1, MIDDLE: M.ROTATE, RIGHT: M.PAN } : { LEFT: M.ROTATE, MIDDLE: M.DOLLY, RIGHT: M.PAN };
  }

  setMode(m) {
    if (m === this.mode) return;
    if (m === 'fly') {
      const e = new Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.fly.yaw = e.y; this.fly.pitch = e.x;
      this.orbit.enabled = false;
    } else {
      const fwd = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const c = this.sv.bounds.getCenter(new Vector3());
      const d = MathUtils.clamp(this.camera.position.distanceTo(c), 6, 400);
      this.orbit.target.copy(this.camera.position).addScaledVector(fwd, Math.min(d, 12));
      this.orbit.enabled = true;
      this.orbit.update();
    }
    this.mode = m;
    this.app.emit('camera-mode');
  }

  fitDistance(radius) {
    const vf = MathUtils.degToRad(this.camera.fov) / 2, hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    return (radius / Math.sin(Math.min(vf, hf))) * 1.08;
  }

  frame(box = this.sv.bounds, dir = new Vector3(0.9, 0.55, 1)) {
    const c = box.getCenter(new Vector3()), r = Math.max(box.getSize(new Vector3()).length() / 2, 1.5);
    this.setMode('orbit');
    this.scheme = this.scheme === 'fly' ? 'standard' : this.scheme;
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(c).addScaledVector(dir.clone().normalize(), this.fitDistance(r));
    this.orbit.target.copy(c);
    this.orbit.update();
    this.app.emit('camera-mode');
  }

  /** put the camera at `pos` looking at `target` in the current mode (fly keeps its own look angles) */
  lookFrom(pos, target) {
    this.camera.position.copy(pos);
    if (this.mode === 'fly') {
      const m = new Matrix4().lookAt(pos, target, new Vector3(0, 1, 0));
      const e = new Euler().setFromRotationMatrix(m, 'YXZ');
      this.fly.yaw = e.y; this.fly.pitch = e.x;
      this.camera.quaternion.setFromEuler(new Euler(e.x, e.y, 0, 'YXZ'));
    } else {
      this.orbit.target.copy(target);
      this.orbit.update();
    }
  }

  goPreset(name) {
    const { ship, worlds, sel } = this.app;
    const b = this.sv.bounds, c = b.getCenter(new Vector3()), r = Math.max(b.getSize(new Vector3()).length() / 2, 1.5);
    const dirs = { overview: [0.9, 0.55, 1], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], front: [0, 0.05, 1], back: [0, 0.05, -1], left: [-1, 0.05, 0], right: [1, 0.05, 0], chase: [0.25, 0.4, -1] };
    if (dirs[name]) { this.frame(b, new Vector3(...dirs[name])); return; }
    const hall = ship.halls.find(h => h.id === (sel.type === 'hall' ? sel.id : null)) || ship.halls[0];
    if (!hall || !worlds?.has(hall.id)) return;
    const W = worlds.get(hall.id);
    if (name === 'inside') {
      const t = wallOf(ship, hall);
      const floor = -hall.h / 2 + t + (hall.deck ? hall.deckY : 0);
      const eye = Math.min(floor + 1.6, hall.h / 2 - t - 0.2);
      const z = hall.shape === 'sphere' ? -hall.l * 0.25 : -hall.l / 2 + t + 1.2;
      const p = new Vector3(0, hall.shape === 'sphere' ? 0 : eye, Math.min(z, hall.l / 2 - t - 0.5)).applyMatrix4(W);
      const tg = new Vector3(0, hall.shape === 'sphere' ? 0 : eye, hall.l / 2).applyMatrix4(W);
      this.setScheme('fly');
      this.camera.up.set(0, 1, 0);
      this.lookFrom(p, tg);
    } else if (name === 'door' && hall.conn) {
      const tm = tunnelMatrix(worlds.get(hall.conn.parent), hall.conn);
      const p = new Vector3(0, 0, -Math.max(2, Math.min(hall.conn.w * 2, 4))).applyMatrix4(tm);
      const tg = new Vector3(0, 0, hall.conn.len + 4).applyMatrix4(tm);
      this.setScheme('fly');
      this.camera.up.set(0, 1, 0);
      this.lookFrom(p, tg);
    }
  }

  currentView() {
    return { p: this.camera.position.toArray(), t: this.mode === 'orbit' ? this.orbit.target.toArray() : new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).add(this.camera.position).toArray(), fov: this.camera.fov, mode: this.mode };
  }

  applyView(v) {
    this.setScheme(v.mode === 'fly' ? 'fly' : this.scheme === 'fly' ? 'standard' : this.scheme);
    this.setFov(v.fov);
    this.lookFrom(new Vector3(...v.p), new Vector3(...v.t));
  }

  // ------------------------------------------------------------ input
  setTool(tool) {
    this.tool = tool;
    this.clearGhost();
    this.canvas.style.cursor = tool === 'select' ? '' : 'crosshair';
    this.syncGizmo();
    this.app.emit('tool');
  }

  bindInput() {
    const c = this.canvas;
    let down = null;
    let rdown = null;                       // right button: a drag pans the view, a click opens the menu
    c.addEventListener('pointerdown', e => { if (e.button === 2) rdown = { x: e.clientX, y: e.clientY }; }, true);
    c.addEventListener('contextmenu', e => {
      e.preventDefault();
      const d = rdown;
      rdown = null;
      if ((d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) || this.tool !== 'select' || this.gizmoDragging) return;
      const ray = this.rayAt(e.clientX, e.clientY);
      let target = null;
      if (this.app.model) { const id = pickNode(ray); if (id) target = { type: 'node', id }; }
      else {
        const hit = this.sv.pick(ray), bulb = ray.intersectObjects(this.lightGroup.children, false)[0];
        if (bulb && (!hit || bulb.distance < hit.distance)) target = { type: 'light', id: bulb.object.userData.lightId };
        else if (hit) target = { type: hit.type === 'att' ? 'att' : hit.type === 'bridge' ? 'bridge' : 'hall', id: hit.id, hit };
        else target = { type: null, id: null, hit: null };
      }
      this.app.actions.showContext?.(e.clientX, e.clientY, target || { type: null, id: null });
    });
    // grab the selected, connected hall and drag it along the hull (runs before the orbit controls see the press)
    c.addEventListener('pointerdown', e => {
      const sel = this.app.sel, hall = sel.type === 'hall' && this.app.actions.hall(sel.id);
      if (e.button !== 0 || this.tool !== 'select' || this.gizmoDragging || !hall?.conn || hall.link || this.mode === 'fly') return;
      const hit = this.sv.pick(this.rayAt(e.clientX, e.clientY));
      if (hit?.type !== 'hall' || hit.id !== sel.id) return;
      this.reloc = { id: sel.id, moved: false, x: e.clientX, y: e.clientY };
      this.orbit.enabled = false;
      c.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    }, true);
    const endReloc = () => {
      if (!this.reloc) return;
      const moved = this.reloc.moved;
      this.reloc = null;
      this.orbit.enabled = this.mode === 'orbit';
      if (moved) { this.pendingHull = true; this.endDragPreview(); this.app.actions.commit(); this.app.emit('inspector'); this.app.emit('tree'); }
    };
    c.addEventListener('pointerup', endReloc, true);
    c.addEventListener('pointercancel', endReloc, true);
    // painting on a model's parts
    c.addEventListener('pointerdown', e => {
      if (!this.app.model || e.button !== 0 || this.tool !== 'paint') return;
      this.mstroke = true;
      beginPaint();
      this.orbit.enabled = false;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      e.stopImmediatePropagation();
      paintAt(this.rayAt(e.clientX, e.clientY));
    }, true);
    const endModelStroke = () => { if (!this.mstroke) return; this.mstroke = false; endPaint(); this.orbit.enabled = this.mode === 'orbit'; };
    c.addEventListener('pointerup', endModelStroke, true);
    c.addEventListener('pointercancel', endModelStroke, true);
    // brush painting: press and drag over a surface
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.tool !== 'paint' || this.app.brush2.mode === 'fill' || this.gizmoDragging) return;
      this.stroke = this.app.actions.beginStroke();
      this.orbit.enabled = false;
      c.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
      this.strokeAt(e.clientX, e.clientY);
    }, true);
    const endStroke = () => {
      if (!this.stroke) return;
      this.app.actions.endStroke(this.stroke);
      this.stroke = null;
      this.orbit.enabled = this.mode === 'orbit';
    };
    c.addEventListener('pointerup', endStroke, true);
    c.addEventListener('pointercancel', endStroke, true);
    c.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
      if (this.mode === 'fly' && e.button === 0 && !this.gizmoDragging) { this.fly.drag = true; c.setPointerCapture(e.pointerId); }
    });
    c.addEventListener('pointermove', e => {
      if (this.stroke) this.strokeAt(e.clientX, e.clientY);
      if (this.mstroke) paintAt(this.rayAt(e.clientX, e.clientY));
      if (this.fly.drag) {
        this.fly.yaw -= e.movementX * 0.0035;
        this.fly.pitch = MathUtils.clamp(this.fly.pitch - e.movementY * 0.0035, -1.55, 1.55);
      }
      this.pending = { x: e.clientX, y: e.clientY };
    });
    c.addEventListener('pointerleave', () => { this.pending = null; this.clearGhost(); });
    c.addEventListener('pointerup', e => {
      this.fly.drag = false;
      const d = down;
      down = null;
      if (!d || d.button !== 0 || this.gizmoDragging) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this.onClick(e);
    });
    c.addEventListener('wheel', e => {
      if (this.mode !== 'fly') return;
      e.preventDefault();
      const f = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(f, -Math.sign(e.deltaY) * this.fly.speed * 0.25);
    }, { passive: false });
    addEventListener('keydown', e => {
      if (this.app.vizOpen || /^(input|textarea|select)$/i.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      this.fly.keys.add(e.code);
      if (['forward', 'back', 'left', 'right', 'up', 'down'].includes(actionFor(e.code))) {      // a camera key must not also scroll the panel you used last (Space) or press its focused button
        e.preventDefault();
        const f = document.activeElement;
        if (f && f !== document.body && !/^(input|textarea|select)$/i.test(f.tagName)) f.blur();
      }
    });
    addEventListener('keyup', e => this.fly.keys.delete(e.code));
    addEventListener('blur', () => this.fly.keys.clear());
  }

  strokeAt(x, y) {
    this.app.actions.paintStroke(this.stroke, this.sv.pick(this.rayAt(x, y)));
  }

  /** a ring on the surface under the pointer showing the brush's size */
  brushRing(p) {
    const B = this.app.brush2, show = p && this.tool === 'paint' && B.mode !== 'fill';
    if (!this.ring) {
      this.ring = new Mesh(new THREE.RingGeometry(0.47, 0.5, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }));
      this.ring.renderOrder = 20;
      this.ring.matrixAutoUpdate = false;
      this.scene.add(this.ring);
    }
    this.ring.visible = false;
    if (!show) return;
    const hit = this.sv.pick(this.rayAt(p.x, p.y));
    if (hit?.type !== 'hall') return;
    const n = hit.normal.clone();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
    this.ring.matrix.compose(hit.point.clone().addScaledVector(n, 0.01), q, new Vector3(B.size, B.size, 1));
    this.ring.visible = true;
  }

  rayAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const rc = new Raycaster();
    rc.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    return rc;
  }

  /** a hit on the hull as a port/placement in the hall's own space */
  localHit(hit) {
    const W = this.app.worlds.get(hit.id);
    if (!W) return null;
    const inv = W.clone().invert();
    return { hallId: hit.id, p: hit.point.clone().applyMatrix4(inv), n: hit.normal.clone().transformDirection(inv) };
  }

  onClick(e) {
    const ray = this.rayAt(e.clientX, e.clientY);
    if (this.tool === 'place') { const pt = this.planePoint(e.clientX, e.clientY); if (pt) this.app.actions.placeHullAt(pt); return; }
    if (this.app.model) { if (this.tool === 'paint') return; const id = pickNode(ray); this.app.actions.select(id ? 'node' : null, id); return; }
    const hit = this.sv.pick(ray);
    if (this.tool === 'select') {
      const bulb = ray.intersectObjects(this.lightGroup.children, false)[0];
      if (bulb && (!hit || bulb.distance < hit.distance)) { this.app.actions.select('light', bulb.object.userData.lightId); return; }
    }
    this.app.actions.viewportClick(hit, e);
  }

  /** where on the placing plane the pointer is (snapped to the grid), or null */
  planePoint(x, y) {
    const ray = this.rayAt(x, y).ray, pt = new Vector3();
    if (!ray.intersectPlane(new THREE.Plane(new Vector3(0, 1, 0), -placeY()), pt)) return null;
    const sn = this.app.placeH.snap;
    if (sn > 0) { pt.x = Math.round(pt.x / sn) * sn; pt.z = Math.round(pt.z / sn) * sn; }
    return pt;
  }

  /** the see-through hull that follows the pointer while placing */
  placeGhost(p) {
    if (!p) return;                                  // the pointer has not moved: the ghost stays where it is
    const P = this.app.placeH, sz = placeSize();
    const key = ['place', P.shape, sz.w, sz.h, sz.l].join(':');
    if (this.ghostKey !== key) {
      this.clearGhost();
      const tmpl = newHall(P.shape, sz);
      this.ghost = new Mesh(hallGeometry(tmpl, 0), new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.35, depthWrite: false }));
      this.ghost.matrixAutoUpdate = true;
      this.scene.add(this.ghost);
      this.ghostKey = key;
    }
    const pt = p && this.planePoint(p.x, p.y);
    this.ghost.visible = !!pt;
    if (pt) { this.ghost.position.copy(pt); this.ghost.rotation.set(0, THREE.MathUtils.degToRad(P.yaw || 0), 0); this.invalidate(300); }
  }

  /** a line from the first spot you clicked to the pointer while joining two halls */
  bridgeGhost(p) {
    const T = this.app.bridgeTool;
    if (!T.first) { if (this.bridgeLine) this.bridgeLine.visible = false; return; }
    if (!p) return;
    const hit = this.sv.pick(this.rayAt(p.x, p.y)), to = hit?.type === 'hall' ? hit.point : null;
    if (!this.bridgeLine) {
      this.bridgeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), new THREE.LineBasicMaterial({ color: '#ffb24a', depthTest: false }));
      this.bridgeLine.renderOrder = 30;
      this.bridgeLine.frustumCulled = false;
      this.scene.add(this.bridgeLine);
    }
    this.bridgeLine.visible = !!to;
    if (to) { this.bridgeLine.geometry.setFromPoints([T.first.point, to]); this.invalidate(300); }
  }

  // ------------------------------------------------------------ ghosts (placement previews)
  clearGhost() {
    if (this.bridgeLine) this.bridgeLine.visible = false;
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost.traverse(o => o.geometry?.dispose?.()); this.ghost = null; this.ghostKey = ''; }
  }

  updateHover() {
    const p = this.pending;
    this.pending = null;
    if (p && this.reloc) {
      if (Math.hypot(p.x - this.reloc.x, p.y - this.reloc.y) < 4 && !this.reloc.moved) return;
      const hit = this.sv.pick(this.rayAt(p.x, p.y), (id) => this.app.actions.isBranch(this.reloc.id, id), true);
      if (this.app.actions.relocateTo(this.reloc.id, hit)) { this.reloc.moved = true; this.showDragGhost(this.reloc.id); }
      return;
    }
    if (this.tool === 'paint') { this.brushRing(p); return; }
    if (this.ring) this.ring.visible = false;
    if (this.tool === 'place') { this.placeGhost(p); return; }
    if (this.tool === 'bridge') { this.bridgeGhost(p); return; }
    if (!p || this.tool === 'select' || this.tool === 'light') return;
    const hit = this.sv.pick(this.rayAt(p.x, p.y));
    const ok = hit && hit.type === 'hall' && this.app.worlds.has(hit.id) && (this.tool === 'gadget' || hit.slot === 'ext');
    this.hover = ok ? hit : null;
    if (!ok) { if (this.ghost) this.ghost.visible = false; return; }
    const A = this.app;
    if (this.tool === 'gadget') {
      const part = A.placing.part, variant = A.placing.variant;
      if (!variantReady(part, variant)) { loadVariant(part, variant); return; }
      if (this.ghostKey !== 'g:' + part + variant) {
        this.clearGhost();
        const g = instantiate(part, variant, { t: this.app.ship.wall, glass: 0.4 });
        g.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.transparent = true; m.opacity = 0.55; m.depthWrite = false; } });
        this.ghost = new Group();
        this.ghost.add(g);
        this.ghost.matrixAutoUpdate = false;
        this.scene.add(this.ghost);
        this.ghostKey = 'g:' + part + variant;
      }
      const L = this.localHit(hit);
      const local = { p: L.p.toArray(), n: L.n.toArray(), spin: A.placing.spin || 0, tx: 0, tz: 0, s: A.placing.scale || 1 };
      this.ghost.matrix.copy(this.app.worlds.get(L.hallId)).multiply(attMatrix(local, attMode({ part, variant })));
      this.ghost.matrixWorldNeedsUpdate = true;
      this.ghost.visible = true;
    } else if (this.tool === 'hall') {
      const L = this.localHit(hit);
      const tmpl = A.placing.template();
      const key = ['h', tmpl.shape, tmpl.w, tmpl.h, tmpl.l, tmpl.sides, tmpl.sf, tmpl.sb, tmpl.ay].join(':');
      if (this.ghostKey !== key) {
        this.clearGhost();
        const hall = tmpl;
        this.ghost = new Mesh(hallGeometry(hall, 0), new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.35, depthWrite: false }));
        this.ghost.userData.hall = hall;
        this.ghost.matrixAutoUpdate = false;
        this.scene.add(this.ghost);
        this.ghostKey = key;
      }
      const hall = this.ghost.userData.hall;
      const conn = newConn(A.placing.type, L.hallId, L.p.toArray(), L.n.toArray(), A.placing.face);
      conn.roll = A.placing.roll || 0;
      this.ghost.matrix.copy(this.app.worlds.get(L.hallId)).multiply(childMatrix(hall, conn));
      this.ghost.matrixWorldNeedsUpdate = true;
      this.ghost.visible = true;
    }
  }

  // ------------------------------------------------------------ frame loop
  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const D = this.app.dirty;
    if (D.hull || D.conn || D.atts || D.mats || D.lights || D.model || D.bridges) this.invalidate(400);
    this.moveUpdate(dt);
    if (this.app.anim.on && !this.app.vizOpen) { this.app.sv.animTick(dt); this.invalidate(120); }
    if (this.mode === 'orbit') this.orbit.update();
    this.setDraft(settings.draftMoving && (now < this.moveUntil || !!this.gizmoDragging || !!this.reloc || this.fly.keys.size > 0));
    const flicker = this.animateLights(now / 1000);
    this.app.onFrame?.(dt);
    // shadow maps are the costly part of a frame: while something is being dragged they wait until you let go
    if (this.flat()) this.shadowDirty = false;
    if (this.shadowDirty && !this.gizmoDragging && !this.reloc) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; this.invalidate(300); }
    this.updateHover();
    // draw while something changes; lamps that flicker are drawn at 30 pictures a second
    if (!this.app.vizOpen && (now < this.renderUntil || this.fly.keys.size || (flicker && now - this.lastDraw > 33))) {
      this.updateClip();
      this.renderer.render(this.scene, this.camera);
      this.lastDraw = now;
    }
  }

  /** near / far planes that follow the camera: a tight range keeps flat panels from shimmering through each other (z-fighting) */
  updateClip() {
    const cam = this.camera, b = this.sv.bounds, size = b.getSize(_v1).length();
    const d = this.mode === 'orbit' ? cam.position.distanceTo(this.orbit.target) : 6;
    const near = this.mode === 'fly' ? 0.05 : MathUtils.clamp(d * 0.004, 0.02, 1.5);
    const far = Math.max(400, (cam.position.distanceTo(b.getCenter(_v2)) + size) * 2.5);
    if (Math.abs(near - cam.near) > 1e-4 || Math.abs(far - cam.far) > 1) { cam.near = near; cam.far = far; cam.updateProjectionMatrix(); }
    this.stars.position.copy(cam.position);
    this.stars.scale.setScalar(far * 0.9 / 2600);
    if (this.flat()) {
      this.head.position.copy(cam.position).add(new Vector3(0.4, 1, 0.3).multiplyScalar(5));
      this.head.target.position.copy(this.mode === 'orbit' ? this.orbit.target : _v1.set(0, 0, -1).applyQuaternion(cam.quaternion).add(cam.position));
    }
  }

  /** move the camera with the keys (rebindable in Settings): flying, or sliding the whole orbit view around */
  moveUpdate(dt) {
    const f = this.fly, k = f.keys;
    if (this.mode === 'fly') this.camera.quaternion.setFromEuler(new Euler(f.pitch, f.yaw, 0, 'YXZ'));
    if (!k.size) return;
    const v = new Vector3();
    const fwd = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    if (held('forward', k)) v.add(fwd);
    if (held('back', k)) v.sub(fwd);
    if (held('right', k)) v.add(right);
    if (held('left', k)) v.sub(right);
    if (held('up', k)) v.y += 1;
    if (held('down', k)) v.y -= 1;
    if (!v.lengthSq()) return;
    const base = this.mode === 'fly' ? f.speed : MathUtils.clamp(this.camera.position.distanceTo(this.orbit.target) * 0.8, 1.5, 120);
    const step = v.normalize().multiplyScalar(base * settings.moveSpeed * dt * (held('fast', k) ? 3.5 : 1));
    this.camera.position.add(step);
    if (this.mode === 'orbit') this.orbit.target.add(step);
  }

  // ------------------------------------------------------------ pictures
  /** Render the current view to a PNG blob at `longSide` pixels (0 = as shown). */
  capture({ longSide = 2400, transparent = false } = {}) {
    const r = this.renderer, cv = this.canvas;
    const w0 = cv.clientWidth, h0 = cv.clientHeight, dpr = r.getPixelRatio();
    const maxSize = Math.min(r.capabilities.maxTextureSize, 8192);
    const k = longSide ? Math.min(longSide, maxSize) / Math.max(w0, h0) : 1;
    const W = Math.max(2, Math.round(w0 * k)), H = Math.max(2, Math.round(h0 * k));
    const hide = [this.gizmo, this.proxy, this.sv.fxGroup, this.ghost, this.grid, this.lightGroup, this.ring].filter(Boolean);
    const vis = hide.map(o => o.visible);
    hide.forEach(o => (o.visible = false));
    const bg = this.scene.background, starsVis = this.stars.visible;
    if (transparent) { this.scene.background = null; this.stars.visible = false; }
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.render(this.scene, this.camera);
    return new Promise(res => {
      cv.toBlob(blob => {
        hide.forEach((o, i) => (o.visible = vis[i]));
        this.scene.background = bg;
        this.stars.visible = starsVis;
        r.setPixelRatio(dpr);
        r.setSize(w0, h0, false);
        cv.style.width = w0 + 'px';
        cv.style.height = h0 + 'px';
        res({ blob, width: W, height: H });
      }, 'image/png');
    });
  }

  /** small preview picture of a model (used for the gadget library cards) */
  thumb(object, size = 96) {
    const r = this.renderer;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color('#242933');
    sc.environment = this.envTex;
    sc.add(new THREE.HemisphereLight('#ffffff', '#445', 0.7));
    const d = new THREE.DirectionalLight('#ffffff', 2);
    d.position.set(3, 5, 4);
    sc.add(d);
    const obj = object.clone(true);
    sc.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new Vector3()), rad = Math.max(box.getSize(new Vector3()).length() / 2, 0.1);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    cam.position.copy(c).add(new Vector3(0.8, 0.6, 1).normalize().multiplyScalar(rad / Math.sin(MathUtils.degToRad(17.5)) * 1.05));
    cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 0 });
    const prev = r.getRenderTarget(), prevClip = r.localClippingEnabled;
    r.localClippingEnabled = false;
    r.setRenderTarget(rt);
    r.render(sc, cam);
    const buf = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    r.setRenderTarget(prev);
    r.localClippingEnabled = prevClip;
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[di + ch] = Math.round(255 * Math.pow(buf[si + ch] / 255, 1 / 2.2));
        img.data[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
}
