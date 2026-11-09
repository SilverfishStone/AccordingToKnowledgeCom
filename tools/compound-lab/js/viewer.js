/* The 3D viewer: drag to turn the molecule, scroll or pinch to zoom, right-drag to move it. Three styles (ball and stick,
   sticks, space-filling), optional hydrogens, and hovering an atom names it. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ELEMENT_STYLE, VDW } from "./embed3d.js";

const ELEMENT_NAME = { H: "hydrogen", C: "carbon", N: "nitrogen", O: "oxygen", F: "fluorine", Cl: "chlorine", Br: "bromine", I: "iodine", S: "sulfur", P: "phosphorus", B: "boron", Si: "silicon" };

export function createViewer(host, hover) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(0, 0, 12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ab4ff, 0.5); fill.position.set(-6, -2, -4); scene.add(fill);

  const group = new THREE.Group();
  scene.add(group);
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let state = { graph: null, coords: null, style: "ballstick", hydrogens: true, focus: null }, spheres = [], halos = [];

  const stickGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const ballGeo = new THREE.SphereGeometry(1, 28, 20);
  const matCache = new Map();
  const mat = (color) => { if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 })); return matCache.get(color); };
  const up = new THREE.Vector3(0, 1, 0);
  // atoms outside the focus are drawn faint so one part of the molecule stands out (used by the guided tour)
  const faintCache = new Map();
  const matTier = (color, tier) => {
    if (tier >= 1) return mat(color);
    const key = color + ":" + tier;
    if (!faintCache.has(key)) faintCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05, transparent: true, opacity: tier, depthWrite: tier > 0.4 }));
    return faintCache.get(key);
  };
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x8ab4ff, transparent: true, opacity: 0.16, depthWrite: false });

  function clear() {
    for (const c of [...group.children]) group.remove(c);
    spheres = []; halos = [];
  }

  function draw() {
    clear();
    const { graph, coords, style, hydrogens } = state;
    if (!graph) return;
    const show = (i) => hydrogens || graph.atoms[i].el !== "H";
    // how clearly each atom is drawn: 1 in focus, softer for its surroundings, faint for the rest (hydrogens follow their atom)
    const heavyOf = (i) => { if (graph.atoms[i].el !== "H") return i; const b = graph.bonds.find((o) => o.a === i || o.b === i); return b ? (b.a === i ? b.b : b.a) : i; };
    const tierOf = state.focus ? (i) => { const h = heavyOf(i); return state.focus.strong.has(h) ? 1 : state.focus.soft.has(h) ? 0.5 : 0.13; } : () => 1;
    const P = coords.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    const radius = (el) => (style === "spacefill" ? (VDW[el] ?? 1.8) * 0.85 : style === "sticks" ? 0.16 : (ELEMENT_STYLE[el]?.r ?? 0.55) * 0.62);
    graph.atoms.forEach((a, i) => {
      if (!show(i)) return;
      const m = new THREE.Mesh(ballGeo, matTier(ELEMENT_STYLE[a.el]?.color ?? 0xc8a2c8, tierOf(i)));
      m.position.copy(P[i]); m.scale.setScalar(radius(a.el)); m.userData.atom = i;
      group.add(m); spheres.push(m);
      if (state.focus && tierOf(i) === 1 && a.el !== "H") {
        const h = new THREE.Mesh(ballGeo, haloMat); h.position.copy(P[i]); h.scale.setScalar(radius(a.el) * 1.4); h.userData.base = h.scale.x;
        group.add(h); halos.push(h);
      }
    });
    if (style === "spacefill") return;
    const thick = style === "sticks" ? 0.16 : 0.085;
    const segment = (from, to, color, tier = 1) => {
      const d = new THREE.Vector3().subVectors(to, from);
      const m = new THREE.Mesh(stickGeo, matTier(color, tier));
      m.position.addVectors(from, to).multiplyScalar(0.5);
      m.scale.set(thick, d.length(), thick);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      group.add(m);
    };
    const colorOf = (i) => ELEMENT_STYLE[graph.atoms[i].el]?.color ?? 0xc8a2c8;
    for (const b of graph.bonds) {
      if (!show(b.a) || !show(b.b)) continue;
      const tier = Math.min(tierOf(b.a), tierOf(b.b));
      const A = P[b.a], B = P[b.b], dir = new THREE.Vector3().subVectors(B, A).normalize();
      // double and triple bonds are drawn as parallel sticks, spread across the plane of a neighbouring bond
      const count = b.arom ? 1 : b.order;
      let side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0.31, 0.57, 0.76)).normalize();
      const nb = graph.bonds.find((o) => o !== b && (o.a === b.a || o.b === b.a) && !(o.a === b.b || o.b === b.b));
      if (nb) {
        const v = new THREE.Vector3().subVectors(P[nb.a === b.a ? nb.b : nb.a], A), s2 = new THREE.Vector3().crossVectors(dir, v);
        if (s2.lengthSq() > 1e-4) side = new THREE.Vector3().crossVectors(s2, dir).normalize();
      }
      for (let k = 0; k < count; k++) {
        const off = side.clone().multiplyScalar((k - (count - 1) / 2) * thick * 3.2);
        const from = A.clone().add(off), to = B.clone().add(off), mid = from.clone().add(to).multiplyScalar(0.5);
        segment(from, mid, colorOf(b.a), tier); segment(mid, to, colorOf(b.b), tier);
      }
    }
    group.position.set(0, 0, 0);
  }

  function fit() {
    if (!state.coords) return;
    let r = 1;
    for (const c of state.coords) r = Math.max(r, Math.hypot(c[0], c[1], c[2]));
    const dist = (r + 1.2) / Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, 0, Math.min(dist * (camera.aspect < 1 ? 1.4 : 0.95), 150));
    controls.target.set(0, 0, 0); controls.update();
  }

  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // a smooth camera move (used by the guided tour); `onFrame` lets a page place labels over the model
  let raf = 0, auto = false, move = null, onFrame = null;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (auto) group.rotation.y += 0.006;
    if (move) {
      const t = Math.min(1, (performance.now() - move.t0) / move.ms), k = ease(t);
      camera.position.lerpVectors(move.fromPos, move.toPos, k); controls.target.lerpVectors(move.fromTarget, move.toTarget, k);
      if (t >= 1) move = null;
    }
    const pulse = 1 + 0.12 * Math.sin(performance.now() / 260);
    for (const h of halos) h.scale.setScalar(h.userData.base * pulse);
    controls.update(); renderer.render(scene, camera);
    if (onFrame) onFrame();
  };
  loop();

  renderer.domElement.addEventListener("pointermove", (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(spheres, false)[0];
    if (hit && hover) { const i = hit.object.userData.atom, el = state.graph.atoms[i].el; hover(`${el} · ${ELEMENT_NAME[el] || el}, atom ${i + 1}`, e.clientX - r.left, e.clientY - r.top); }
    else if (hover) hover(null);
  });
  renderer.domElement.addEventListener("pointerleave", () => hover && hover(null));

  return {
    setMolecule(graph, coords) { state.graph = graph; state.coords = coords; state.focus = null; move = null; group.rotation.set(0, 0, 0); draw(); fit(); },
    setStyle(style) { state.style = style; draw(); },
    setHydrogens(on) { state.hydrogens = on; draw(); },
    setSpin(on) { auto = on; },
    /* focus: { strong: [atoms], soft: [atoms] } or null for the whole molecule at full strength */
    setFocus(f) { state.focus = f ? { strong: new Set(f.strong || []), soft: new Set(f.soft || []) } : null; draw(); },
    setDrift(on, speed = 1.1) { controls.autoRotate = on; controls.autoRotateSpeed = speed; },
    /* fly the camera to look at some atoms (or the whole molecule when none are given) */
    flyTo(atoms, ms = 1100) {
      if (!state.coords) return;
      group.rotation.set(0, 0, 0); auto = false;
      const whole = !(atoms && atoms.length);
      const pts = (whole ? state.coords.map((_, i) => i) : atoms).filter((i) => state.coords[i]).map((i) => new THREE.Vector3(...state.coords[i]));
      const centre = new THREE.Vector3(); pts.forEach((p) => centre.add(p)); centre.divideScalar(pts.length || 1);
      let r = 1.2; pts.forEach((p) => { r = Math.max(r, p.distanceTo(centre)); });
      const dist = Math.min(((r + (whole ? 1.2 : 3.4)) / Math.tan((camera.fov * Math.PI) / 360)) * (camera.aspect < 1 ? 1.35 : 0.95), 150);
      // look at the part from the side facing away from the middle of the molecule, a little from above
      const out = centre.clone(); if (out.length() < 0.6 || whole) out.copy(camera.position).sub(controls.target); out.normalize();
      // a flat group (a ring) is best seen face on: look along the normal of the plane its atoms lie in
      let view = out.clone();
      if (!whole && pts.length >= 3) {
        let a = new THREE.Vector3(), best = 0;
        for (const p of pts) for (const q of pts) { const l = p.distanceToSquared(q); if (l > best) { best = l; a = q.clone().sub(p); } }
        let b = new THREE.Vector3(), far = 0;
        for (const p of pts) { const v = p.clone().sub(centre), l = v.clone().sub(a.clone().multiplyScalar(v.dot(a) / (a.lengthSq() || 1))).lengthSq(); if (l > far) { far = l; b = v; } }
        const n = new THREE.Vector3().crossVectors(a, b);
        if (n.lengthSq() > 1e-3 && far > 0.35) { n.normalize(); if (n.dot(out) < 0) n.negate(); view = n.multiplyScalar(0.85).add(out.clone().multiplyScalar(0.25)).normalize(); }
      }
      const toPos = centre.clone().add(view.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.1, 0));
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { camera.position.copy(toPos); controls.target.copy(centre); controls.update(); move = null; return; }
      move = { t0: performance.now(), ms, fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget: centre };
    },
    /* where some atoms are on screen, in pixels from the top left of the viewer: { x, y, behind } */
    project(atoms) {
      if (!state.coords || !atoms || !atoms.length) return null;
      const v = new THREE.Vector3(); atoms.forEach((i) => v.add(new THREE.Vector3(...state.coords[i]))); v.divideScalar(atoms.length);
      v.applyMatrix4(group.matrixWorld).project(camera);
      return { x: ((v.x + 1) / 2) * host.clientWidth, y: ((1 - v.y) / 2) * host.clientHeight, behind: v.z > 1 };
    },
    set onFrame(fn) { onFrame = fn; },
    reset() { group.rotation.set(0, 0, 0); fit(); },
    png() { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
    resize,
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
