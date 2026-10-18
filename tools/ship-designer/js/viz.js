// The Visualizer tab: fly the ship through a city, over the ocean, across a desert, through space, around a planet or a star, or through hyperspace.
// It has its own renderer and scene. The ship is a snapshot of the open ship tab (the same triangles the exporter writes), kept at the origin
// heading toward -Z; the environment moves past it. You can roll it around its nose-to-tail axis, choose the lighting and speed, and look from
// preset angles or drag to turn the view.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { app } from './app.js';
import { buildExportRoot } from './export.js';
import { el, toast, download, debounce } from './util.js';
import { Sky, LOOKS } from './vizsky.js';
import { ENVS } from './vizenv.js';
import { AnimState, computeDeltas } from './anim.js';
import { Exhaust } from './fx.js';

const { Vector3, MathUtils } = THREE;
const KEY = 'shipdesigner.viz.v1';
const DEF = { anims: true, fx: true, thrust: 0.75, panel: true, env: 'ocean', look: 'midday', speed: 1, size: 30, roll: 0, spin: 0, sunAz: 40, lamps: null, drift: true, orbit: false, fov: 45, heights: {}, opts: {} };
const SPACE_SKY = new Set(['space', 'planet', 'star']);

const S = (() => {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* blocked storage: defaults */ }
  return { ...DEF, ...o, heights: { ...(o.heights || {}) }, opts: { ...(o.opts || {}) } };
})();
const save = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not important */ } }, 300);

const PRESETS = [
  ['Chase', 0, 16, 1.7], ['Front', 180, 8, 1.5], ['Right', 90, 4, 1.5], ['Left', -90, 4, 1.5],
  ['Above', 0, 82, 1.6], ['Below', 0, -62, 1.6], ['¾ front', 140, 22, 1.6], ['¾ rear', -35, 20, 1.6], ['Close up', 25, 10, 0.85],
];

const dirOf = (azDeg, elDeg) => {
  const a = MathUtils.degToRad(azDeg), e = MathUtils.degToRad(elDeg);
  return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();       // azimuth 0 = straight ahead, 90 = to the ship's right
};

export const Viz = {
  open: false,
  show() { return show(); },
  hide() { return hide(); },
  toggle() { return (Viz.open ? hide() : show()); },
};

let shipModel = null, rigObjs = [], vizShip = null, vizWorlds = null, exhaust = null;
const vizAnim = new AnimState();
let root, canvas, panel, bar, hud, renderer, scene, camera, controls, sky, sun, hemi, shipRoot, rollG, orient, holder, pm, envRT, envScene;
let env = null, envToken = 0, shipLen = 10, shipInfo = null, lamps = [], paused = false, last = 0, raf = 0, tween = null, lightsDirty = true, loadingText = '';
const ctx = { len: 30, height: 0, speed: 0, pos: new Vector3(), t: 0, look: LOOKS.midday, sunDir: new Vector3(0, 1, 0), sunAz: 40, opts: S.opts };

// ------------------------------------------------------------------ building the page
function ensureDom() {
  if (root) return;
  root = el('div', { id: 'viz' });
  canvas = el('canvas', { id: 'vizCanvas' });
  panel = el('div', { id: 'vizPanel', class: 'vpanel scroll' });
  bar = el('div', { id: 'vizBar' });
  hud = el('span', { id: 'vizHud' });
  const toggle = el('button', { class: 'tool small', title: 'Show or hide the controls', onclick: () => { S.panel = !S.panel; save(); layout(); } }, '◧ Controls');
  root.append(canvas, el('div', { id: 'vizTop' }, hud, toggle), bar, panel);
  document.getElementById('app').append(root);
  new ResizeObserver(() => resize()).observe(root);
}

function initGL() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  ctx.scene = scene;
  camera = new THREE.PerspectiveCamera(S.fov, 1, 0.3, 200000);
  camera.position.set(0, 8, 28);
  scene.add(camera);
  sky = new Sky();
  scene.add(sky.mesh);
  sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  hemi = new THREE.HemisphereLight('#9fc4f0', '#8a7f6a', 0.8);
  scene.add(hemi);
  shipRoot = new THREE.Group();
  rollG = new THREE.Group();
  orient = new THREE.Group();
  orient.rotation.y = Math.PI;                                  // the designer's nose is +Z; it flies toward -Z
  holder = new THREE.Group();
  orient.add(holder);
  rollG.add(orient);
  shipRoot.add(rollG);
  scene.add(shipRoot);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.addEventListener('start', () => { tween = null; });
  pm = new THREE.PMREMGenerator(renderer);
  envScene = new THREE.Scene();
  envScene.add(sky.twin());
  resize();
}

function resize() {
  if (!renderer || !root.clientWidth) return;
  const w = root.clientWidth, h = root.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  layout();
}

/** the controls cover the right edge: slide the picture left so the ship stays in the middle of what is left */
function layout() {
  if (!root) return;
  panel.style.display = S.panel ? '' : 'none';
  bar.style.right = S.panel ? '330px' : '12px';
  if (!camera) return;
  const w = root.clientWidth, h = root.clientHeight, pw = S.panel ? panel.offsetWidth + 20 : 0;
  if (pw && w > pw * 1.6) camera.setViewOffset(w, h, pw / 2, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ the ship
const shipDocs = () => app.docs.map((d, i) => ({ d, i })).filter(x => x.d.kind === 'ship');

function builtOnce() {
  return new Promise(res => {
    let done = false;
    app.on('built', () => { if (!done) { done = true; res(); } });
    setTimeout(() => { if (!done) { done = true; res(); } }, 6000);
  });
}

async function useShipDoc(i) {
  if (i !== app.docIdx) {
    app.actions.switchDoc(i);
    await builtOnce();
  }
  snapshot();
}

/** copy what the exporter would write into the visualizer's own scene */
function snapshot() {
  while (holder.children.length) { const c = holder.children[0]; holder.remove(c); }
  lamps = [];
  if (exhaust) { exhaust.dispose(); exhaust = null; }
  shipModel = null; rigObjs = []; vizAnim.reset();
  let model = null;
  try {
    model = buildExportRoot('ship');
  } catch (e) {
    shipInfo = { empty: true, name: app.ship.name };
    shipLen = 10;
    fitShip();
    renderPanel();
    return;
  }
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = o.receiveShadow = true; [].concat(o.material).forEach(m => { m.envMapIntensity = 1; m.needsUpdate = true; }); }
  });
  const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new Vector3()), sz = box.getSize(new Vector3());
  model.position.sub(c);
  holder.add(model);
  shipModel = model; vizShip = app.ship; vizWorlds = app.worlds;
  for (const o of model.children) {                             // what animations can move: hulls, ribs, connectors, gadgets
    const key = o.userData.hallId ? 'h:' + o.userData.hallId : o.userData.connHall ? 'h:' + o.userData.connHall : o.userData.attId ? 'a:' + o.userData.attId : null;
    if (!key) continue;
    if (o.matrixAutoUpdate) o.updateMatrix();
    o.matrixAutoUpdate = false;
    rigObjs.push({ obj: o, key, base: o.matrix.clone() });
  }
  model.matrixAutoUpdate = false;
  model.updateMatrix();
  shipModel.userData.base = model.matrix.clone();
  exhaust = new Exhaust(model, scene);
  try { exhaust.sync(app.sv.exhaustList()); } catch (e) { console.warn('exhaust', e); }
  for (const a of vizShip.anims || []) vizAnim.set(a, !!a.auto);
  // the ship's own lamps (a few of the strongest)
  const found = [];
  for (const rec of app.vp?.lightObjs?.values() || []) {
    if (rec.type !== 'point' || !rec.l || rec.l.hidden) continue;
    found.push({ pos: rec.obj.position.clone().sub(c), color: rec.l.color, intensity: rec.l.intensity ?? 20, reach: rec.l.reach || 0 });
  }
  found.sort((a, b) => b.intensity - a.intensity);
  for (const f of found.slice(0, 12)) {
    const l = new THREE.PointLight(f.color, f.intensity, f.reach, 2);
    l.position.copy(f.pos);
    l.userData.base = f;
    holder.add(l);
    lamps.push(l);
  }
  shipLen = Math.max(sz.z, 0.5);
  shipInfo = { empty: false, name: app.ship.name, serial: app.sv.hullSerial, doc: app.docs[app.docIdx]?.id, size: sz };
  fitShip();
  lightsDirty = true;
  renderPanel();
}

function fitShip() {
  if (!shipRoot) return;
  const k = S.size / shipLen;
  shipRoot.scale.setScalar(k);
  for (const l of lamps) {                                      // lamps are measured in ship metres: keep them as bright, at the new size
    l.intensity = l.userData.base.intensity * k * k;
    l.distance = l.userData.base.reach * k;
  }
  ctx.len = S.size;
  if (controls) { controls.minDistance = S.size * 0.15; controls.maxDistance = S.size * (env?.constructor.info.id === 'hyper' ? 6 : 16); }
  const sh = sun?.shadow.camera;
  if (sh) { const h = S.size * 1.1; sh.left = -h; sh.right = h; sh.top = h; sh.bottom = -h; sh.updateProjectionMatrix(); }
  camera.near = MathUtils.clamp(S.size * 0.01, 0.1, 2);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ lighting and environment
function applyLighting() {
  lightsDirty = false;
  if (!env) return;
  const info = env.constructor.info, L = LOOKS[S.look] || LOOKS.midday;
  ctx.look = L;
  ctx.sunAz = S.sunAz;
  const space = SPACE_SKY.has(info.id), noSky = info.id === 'hyper';
  let sunDir = dirOf(S.sunAz, L.el), lightDir = sunDir.clone(), lightCol = L.col, lightInt = L.int, expo = L.expo;
  let hemiC = [L.hemi[0], L.hemi[1], L.hemi[2]];
  if (L.moon) { lightDir = dirOf(S.sunAz + 180, L.moon.el); lightCol = L.moon.col; lightInt = L.moon.int; }
  if (space) hemiC = [L.hemi[0], '#000000', Math.max(L.hemi[2] * 0.45, 0.14)];
  const ov = env.light();
  if (ov) { sunDir = ov.sunDir.clone(); lightDir = ov.sunDir.clone(); lightCol = ov.sunCol; lightInt = ov.sunInt; hemiC = ov.hemi; expo = ov.expo; }
  ctx.sunDir.copy(sunDir);
  sun.color.set(lightCol);
  sun.intensity = lightInt;
  sun.castShadow = lightInt > 0.05;
  sun.userData.dir = lightDir;
  hemi.color.set(hemiC[0]); hemi.groundColor.set(hemiC[1]); hemi.intensity = hemiC[2];
  renderer.toneMappingExposure = expo;
  const fog = info.fog;
  scene.fog = fog && !space ? new THREE.Fog(L.fog, fog[0], fog[1]) : null;
  scene.background = new THREE.Color('#000000');
  sky.mesh.visible = !noSky;
  sky.setLook(L, { space, sunDir, sunCol: ov?.sunCol, nebula: info.id === 'planet' ? ['#2a3a7a', '#5a2a5a', 0.35] : ['#3a4a9a', '#8a3a6a', 0.55] });
  if (info.id === 'star') { sky.u.uSunBoost.value = 0; sky.u.uNebAmt.value = 0.2; }
  const on = S.lamps ?? L.lamps;
  for (const l of lamps) l.visible = !!on;
  if (!noSky) {
    if (envRT) envRT.dispose();
    envRT = pm.fromScene(envScene, 0.02);
    scene.environment = envRT.texture;
  } else {
    scene.environment = null;
  }
}

async function setEnv(id) {
  const token = ++envToken;
  const Cls = ENVS.find(e => e.info.id === id) || ENVS[0];
  S.env = Cls.info.id;
  save();
  if (env) { env.dispose(); env = null; }
  const next = new Cls(ctx);
  ctx.height = S.heights[Cls.info.id] ?? Cls.info.height?.def ?? 0;
  loadingText = `Loading ${Cls.info.name}…`;
  renderPanel();
  try {
    await next.load(p => { loadingText = `Loading ${Cls.info.name}… ${Math.round(p * 100)}%`; });
  } catch (e) {
    console.error(e);
    if (token === envToken) { loadingText = ''; toast(e.message || 'That environment could not be loaded.', 6000); }
    next.dispose();
    return;
  }
  if (token !== envToken) { next.dispose(); return; }
  env = next;
  scene.add(env.group);
  loadingText = '';
  fitShip();
  lightsDirty = true;
  renderPanel();
}

// ------------------------------------------------------------------ animations and exhaust
/** play the ship's animations and its engines for one frame */
function stepShip(dt) {
  if (!shipModel || !vizShip) return;
  const anims = vizShip.anims || [];
  if (!S.anims) { for (const a of anims) vizAnim.set(a, false); }
  if (!paused) vizAnim.step(anims, dt);
  const deltas = S.anims || vizAnim.busy(anims) ? computeDeltas(vizShip, vizWorlds, anims, vizAnim) : new Map();
  for (const o of rigObjs) { const D = deltas.get(o.key); if (D) o.obj.matrix.copy(D).multiply(o.base); else o.obj.matrix.copy(o.base); o.obj.matrixWorldNeedsUpdate = true; }
  const whole = deltas.get('ship');
  shipModel.matrix.copy(shipModel.userData.base);
  if (whole) shipModel.matrix.copy(shipModel.userData.base).multiply(whole);
  shipModel.matrixWorldNeedsUpdate = true;
  if (exhaust) {
    exhaust.setDeltas(k => deltas.get(k));
    const flow = new Vector3(0, 0, ctx.speed), thr = S.thrust * (ctx.speed > 0 ? 1 : 0.45), L = ctx.look;
    if (!S.fx && exhaust.n) { exhaust.n = 0; exhaust.geo.setDrawRange(0, 0); }
    exhaust.update(paused ? 0 : dt, { throttle: thr, flow, fire: S.fx, smoke: S.fx, bright: MathUtils.clamp((L?.int ?? 3) / 3 + 0.3, 0.3, 1), height: renderer.domElement.height, fov: camera.fov });
  }
}

/** the animations list, and the switches for animation and exhaust */
function animSection() {
  const anims = vizShip?.anims || [];
  const rows = [chk('Play ship animations', () => S.anims, v => { S.anims = v; if (v) for (const a of anims) vizAnim.set(a, !!a.auto); renderPanel(); })];
  if (S.anims) for (const a of anims) {
    const loops = a.mode !== 'once';
    rows.push(el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { vizAnim.toggle(a); renderPanel(); } }, loops ? (vizAnim.isOn(a) ? '■ Stop' : '▶ Start') : (vizAnim.isOn(a) ? '◀ Close' : '▶ Open')), el('span', {}, a.name)));
  }
  if (S.anims && !anims.length) rows.push(el('p', { class: 'muted small' }, 'This ship has no animations yet (Animate tab in the designer).'));
  rows.push(chk('Thruster fire & smoke', () => S.fx, v => { S.fx = v; }), sl({ label: 'Engine power', min: 0, max: 100, step: 1, unit: '%', get: () => Math.round(S.thrust * 100), set: v => { S.thrust = v / 100; } }));
  if (!exhaust || !exhaust.items.size) rows.push(el('p', { class: 'muted small' }, 'No hall or gadget has exhaust yet (give one in its panel: "Exhaust").'));
  return sec('Animation & engines', ...rows);
}

// ------------------------------------------------------------------ camera
function sphericalOf() {
  const o = camera.position.clone().sub(controls.target), d = o.length();
  return { az: Math.atan2(o.x, o.z), el: Math.asin(MathUtils.clamp(o.y / d, -1, 1)), d };
}

function toPreset([, azD, elD, k]) {
  const from = sphericalOf(), toAz = MathUtils.degToRad(azD);
  let dAz = toAz - from.az;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
  tween = { t: 0, from, dAz, el: MathUtils.degToRad(elD), d: S.size * k };
  if (S.orbit) { S.orbit = false; controls.autoRotate = false; renderPanel(); }
}

function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(tween.t + dt / 0.9, 1);
  const k = tween.t * tween.t * (3 - 2 * tween.t), f = tween.from;
  const az = f.az + tween.dAz * k, el = MathUtils.lerp(f.el, tween.el, k), d = MathUtils.lerp(f.d, tween.d, k);
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d).add(controls.target);
  camera.lookAt(controls.target);
  if (tween.t >= 1) tween = null;
}

// ------------------------------------------------------------------ the loop
function frame(now) {
  if (!Viz.open) { raf = 0; return; }
  raf = requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (lightsDirty && env) applyLighting();
  const info = env?.constructor.info;
  ctx.speed = paused ? 0 : S.speed * S.size * (info?.speedK || 1);
  ctx.height = S.heights[info?.id] ?? info?.height?.def ?? 0;
  if (!paused) { ctx.t += dt; ctx.pos.z -= ctx.speed * dt; }
  S.roll += S.spin * dt;
  if (S.roll > 180) S.roll -= 360;
  if (S.roll < -180) S.roll += 360;
  const drift = S.drift ? 1 : 0;
  rollG.rotation.z = MathUtils.degToRad(S.roll + Math.sin(ctx.t * 0.55) * 0.9 * drift);
  orient.rotation.x = Math.sin(ctx.t * 0.4) * 0.012 * drift;
  shipRoot.position.y = Math.sin(ctx.t * 0.8) * 0.012 * S.size * drift;
  if (env) env.update(dt);
  stepShip(dt);
  stepTween(dt);
  controls.autoRotate = S.orbit;
  controls.autoRotateSpeed = 1.6;
  controls.update(dt);
  sky.update(camera, ctx.t);                                   // after the camera has moved, or the sky lags a frame behind and the camera slips out of it
  if (sun.userData.dir) {                                       // the sun's shadow box rides on the ship
    sun.position.copy(sun.userData.dir).multiplyScalar(S.size * 4);
    sun.shadow.camera.near = S.size * 0.5;
    sun.shadow.camera.far = S.size * 9 + ctx.height * 2;
    sun.shadow.camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  updateHud();
}

let hudAt = 0;
function updateHud() {
  const now = performance.now();
  if (now - hudAt < 250) return;
  hudAt = now;
  const info = env?.constructor.info;
  const lps = S.speed, mps = lps * S.size;
  const txt = loadingText || (paused ? 'Stopped' : lps === 0 ? 'Hovering' : `${lps.toFixed(2)} ship lengths/s` + (info && info.speedK === 1 ? ` · ${Math.round(mps)} m/s · ${Math.round(mps * 3.6)} km/h` : ''));
  if (hud.textContent !== txt) hud.textContent = txt;
  const roll = panel.querySelector('[data-roll]');
  if (roll && S.spin !== 0) { roll.value = S.roll; roll.nextSibling && (roll.nextSibling.value = Math.round(S.roll)); }
}

// ------------------------------------------------------------------ panel
const speedFromSlider = v => (v <= 0 ? 0 : 0.05 * Math.pow(400, v / 1000));
const sliderFromSpeed = s => (s <= 0.0501 ? (s <= 0 ? 0 : 0) : Math.round(Math.log(s / 0.05) / Math.log(400) * 1000));

function sl({ label, min, max, step = 1, get, set, unit = '', fmt = v => String(Math.round(v * 100) / 100), attr, readout }) {
  const rng = el('input', { type: 'range', min, max, step }), num = readout ? el('span', { class: 'num ro' }) : el('input', { type: 'number', class: 'num', step });
  if (attr) rng.setAttribute(attr, '');
  const refresh = () => { rng.value = get(); if (readout) num.textContent = readout(); else num.value = fmt(get()); };
  refresh();
  rng.addEventListener('input', () => { set(+rng.value); refresh(); save(); });
  if (!readout) num.addEventListener('change', () => { set(+num.value); refresh(); save(); });
  return el('div', { class: 'row slider' }, el('span', { class: 'lbl' }, label), rng, num, el('span', { class: 'unit' }, unit));
}
const sel = (label, choices, get, set) => {
  const s = el('select', { onchange: e => { set(e.target.value); save(); } });
  for (const [v, t] of choices) s.append(el('option', { value: v }, t));
  s.value = get();
  return el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), s);
};
const chk = (label, get, set) => el('label', { class: 'row check' }, el('input', { type: 'checkbox', checked: get(), onchange: e => { set(e.target.checked); save(); } }), el('span', {}, label));
const sec = (title, ...kids) => el('div', { class: 'vsec' }, el('h4', {}, title), ...kids);

function renderPanel() {
  if (!panel) return;
  const info = env?.constructor.info || ENVS.find(e => e.info.id === S.env)?.info || ENVS[0].info;
  const space = SPACE_SKY.has(info.id);
  const docs = shipDocs();
  const out = [];
  out.push(sec('Ship',
    docs.length > 1 ? sel('Show', docs.map(x => [String(x.i), app.actions.docTitle(x.d)]), () => String(shipInfo?.doc ? app.docs.findIndex(d => d.id === shipInfo.doc) : app.docIdx), v => useShipDoc(+v)) : el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Showing'), el('span', {}, shipInfo?.name || app.ship.name)),
    shipInfo?.empty ? el('p', { class: 'muted small' }, 'This ship has nothing in it yet - add a hall in the designer first.') : el('p', { class: 'muted small' }, 'A snapshot of the ship tab. Changed it? Refresh.'),
    el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => useShipDoc(shipInfo?.doc ? app.docs.findIndex(d => d.id === shipInfo.doc) : app.docIdx) }, '↻ Refresh from the designer'))));
  out.push(sec('Environment',
    sel('Place', ENVS.map(e => [e.info.id, e.info.name]), () => S.env, v => { setEnv(v); }),
    el('p', { class: 'muted small' }, info.note || ''),
    ...(info.options || []).map(o => {
      const get = () => S.opts[info.id]?.[o.id] ?? o.def, set = v => { (S.opts[info.id] ||= {})[o.id] = v; env?.optionChanged(); };
      return o.type === 'select' ? sel(o.label, o.choices, get, set) : sl({ label: o.label, min: o.min, max: o.max, step: o.step, get, set: v => set(v) });
    }),
    info.height ? sl({ label: info.height.label.length > 14 ? 'Height' : info.height.label, min: info.height.min, max: info.height.max, step: info.height.max > 1000 ? 50 : 1, unit: info.height.unit, get: () => S.heights[info.id] ?? info.height.def, set: v => { S.heights[info.id] = v; } }) : null));
  out.push(sec('Lighting',
    info.lookless ? el('p', { class: 'muted small' }, info.id === 'star' ? 'The star is the only light.' : 'The tunnel lights the ship.')
      : sel('Light', Object.entries(LOOKS).map(([k, v]) => [k, space ? v.space : v.name]), () => S.look, v => { S.look = v; S.lamps = null; lightsDirty = true; renderPanel(); }),
    sl({ label: info.id === 'star' ? 'Star position' : 'Sun direction', min: 0, max: 360, step: 1, unit: '°', get: () => S.sunAz, set: v => { S.sunAz = v; lightsDirty = true; } }),
    lamps.length ? chk('Ship lights on', () => S.lamps ?? (LOOKS[S.look] || LOOKS.midday).lamps, v => { S.lamps = v; lightsDirty = true; }) : el('p', { class: 'muted small' }, 'No lamps on this ship (add some with the Lamp tool).')));
  out.push(sec('Flight',
    sl({ label: 'Speed', min: 0, max: 1000, step: 1, get: () => sliderFromSpeed(S.speed), set: v => { S.speed = speedFromSlider(v); }, readout: () => S.speed.toFixed(2), unit: 'L/s' }),
    el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: e => { paused = !paused; e.target.textContent = paused ? '▶ Go' : '⏸ Stop'; } }, paused ? '▶ Go' : '⏸ Stop'),
      el('span', { class: 'muted small' }, 'L/s = ship lengths per second')),
    sl({ label: 'Ship size', min: 5, max: 800, step: 1, unit: 'm', get: () => S.size, set: v => { S.size = v; fitShip(); rebuildSized(); } })));
  out.push(animSection());
  out.push(sec('Turn the ship',
    sl({ label: 'Roll', min: -180, max: 180, step: 1, unit: '°', attr: 'data-roll', get: () => Math.round(S.roll), set: v => { S.roll = v; S.spin = 0; } }),
    sl({ label: 'Spin', min: -180, max: 180, step: 1, unit: '°/s', get: () => S.spin, set: v => { S.spin = v; } }),
    el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { S.roll = 0; S.spin = 0; renderPanel(); save(); } }, 'Level'), el('button', { class: 'btn small', onclick: () => { S.roll = 180; S.spin = 0; renderPanel(); save(); } }, 'Upside down')),
    chk('Gentle drift', () => S.drift, v => { S.drift = v; })));
  out.push(sec('Camera',
    chk('Slowly orbit the ship', () => S.orbit, v => { S.orbit = v; tween = null; }),
    sl({ label: 'Lens', min: 18, max: 90, step: 1, unit: '°', get: () => S.fov, set: v => { S.fov = v; camera.fov = v; camera.updateProjectionMatrix(); } }),
    el('p', { class: 'muted small' }, 'Drag to turn the view, wheel to zoom, or pick an angle below.'),
    el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: savePicture }, '📷 Save picture'))));
  panel.replaceChildren(...out.filter(Boolean));
  bar.replaceChildren(...PRESETS.map(p => el('button', { class: 'tool small', onclick: () => toPreset(p) }, p[0])));
}

const rebuildSized = debounce(() => { const id = env?.constructor.info.id; if (id === 'space' || id === 'hyper') setEnv(id); }, 400);

function savePicture() {
  renderer.render(scene, camera);
  canvas.toBlob(b => { if (b) download(b, `${(app.ship.name || 'ship').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')}_${S.env}.png`); }, 'image/png');
}

// ------------------------------------------------------------------ opening and closing
async function show() {
  ensureDom();
  Viz.open = true;
  app.vizOpen = true;
  root.classList.add('on');
  app.emit('viz');
  try {
    initGL();
  } catch (e) {
    Viz.open = false; app.vizOpen = false; root.classList.remove('on'); app.emit('viz');
    toast('The visualizer needs WebGL: ' + e.message, 6000);
    return;
  }
  resize();
  const docs = shipDocs();
  let target = app.model ? (docs.at(-1)?.i ?? -1) : app.docIdx;
  const cur = app.docs[app.docIdx];
  const unchanged = shipInfo && !shipInfo.empty && cur && shipInfo.doc === cur.id && shipInfo.serial === app.sv.hullSerial && !app.model;
  if (!unchanged && target >= 0) await useShipDoc(target);
  else if (target < 0) { shipInfo = { empty: true, name: '' }; fitShip(); }
  camera.fov = S.fov; camera.updateProjectionMatrix();
  if (!env) {
    camera.position.set(0, S.size * 0.35, S.size * 1.7);
    controls.target.set(0, 0, 0);
    controls.update();
    await setEnv(S.env);
  } else renderPanel();
  last = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
}

function hide() {
  if (!Viz.open) return;
  Viz.open = false;
  app.vizOpen = false;
  root?.classList.remove('on');
  app.emit('viz');
  app.vp?.invalidate(800);
}
