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
  let state = { graph: null, coords: null, style: "ballstick", hydrogens: true }, spheres = [];

  const stickGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const ballGeo = new THREE.SphereGeometry(1, 28, 20);
  const matCache = new Map();
  const mat = (color) => { if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05 })); return matCache.get(color); };
  const up = new THREE.Vector3(0, 1, 0);

  function clear() {
    for (const c of [...group.children]) group.remove(c);
    spheres = [];
  }

  function draw() {
    clear();
    const { graph, coords, style, hydrogens } = state;
    if (!graph) return;
    const show = (i) => hydrogens || graph.atoms[i].el !== "H";
    const P = coords.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    const radius = (el) => (style === "spacefill" ? (VDW[el] ?? 1.8) * 0.85 : style === "sticks" ? 0.16 : (ELEMENT_STYLE[el]?.r ?? 0.55) * 0.62);
    graph.atoms.forEach((a, i) => {
      if (!show(i)) return;
      const m = new THREE.Mesh(ballGeo, mat(ELEMENT_STYLE[a.el]?.color ?? 0xc8a2c8));
      m.position.copy(P[i]); m.scale.setScalar(radius(a.el)); m.userData.atom = i;
      group.add(m); spheres.push(m);
    });
    if (style === "spacefill") return;
    const thick = style === "sticks" ? 0.16 : 0.085;
    const segment = (from, to, color) => {
      const d = new THREE.Vector3().subVectors(to, from);
      const m = new THREE.Mesh(stickGeo, mat(color));
      m.position.addVectors(from, to).multiplyScalar(0.5);
      m.scale.set(thick, d.length(), thick);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      group.add(m);
    };
    const colorOf = (i) => ELEMENT_STYLE[graph.atoms[i].el]?.color ?? 0xc8a2c8;
    for (const b of graph.bonds) {
      if (!show(b.a) || !show(b.b)) continue;
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
        segment(from, mid, colorOf(b.a)); segment(mid, to, colorOf(b.b));
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

  let raf = 0, auto = false;
  const loop = () => { raf = requestAnimationFrame(loop); if (auto) group.rotation.y += 0.006; controls.update(); renderer.render(scene, camera); };
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
    setMolecule(graph, coords) { state.graph = graph; state.coords = coords; group.rotation.set(0, 0, 0); draw(); fit(); },
    setStyle(style) { state.style = style; draw(); },
    setHydrogens(on) { state.hydrogens = on; draw(); },
    setSpin(on) { auto = on; },
    reset() { group.rotation.set(0, 0, 0); fit(); },
    png() { renderer.render(scene, camera); return renderer.domElement.toDataURL("image/png"); },
    resize,
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
