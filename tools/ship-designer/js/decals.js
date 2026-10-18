// Decals: lettering, stripes and signs that wrap onto the hull. The picture is projected onto the real (curved) skin, so a name
// along a tube follows the tube. They are gadgets whose piece variant has a "decal" block (see resources/parts/decals).
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { textTexture, getTexture, whenTexture } from './assets.js';

const { Vector3, Matrix4, Euler, Mesh, MeshStandardMaterial, DoubleSide } = THREE;

/** reading direction for a viewer looking at the surface: "up" is the hall's up (or its nose direction on a roof / floor), spun by att.spin */
export function decalBasis(att) {
  const n = new Vector3(...att.n).normalize();
  let up = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  up.addScaledVector(n, -up.dot(n)).normalize();
  let r = new Vector3().crossVectors(up, n);
  const a = THREE.MathUtils.degToRad(att.spin || 0);
  if (a) { const c = Math.cos(a), s = Math.sin(a); const r2 = r.clone().multiplyScalar(c).addScaledVector(up, s); up = up.clone().multiplyScalar(c).addScaledVector(r, -s); r = r2; }
  return { r, u: up, n };
}

/** the decal's settings: the variant's defaults overridden by what the user typed on this one */
export const decalSpec = (att, def) => ({ ...(def || {}), ...(att.decal || {}) });

/**
 * @param hull the hull mesh (identity transform), W = hall-local -> ship matrix of the hall the decal sits on
 * @returns a Mesh, or null when nothing of the hull is under it
 */
export function buildDecal(hull, att, W, spec) {
  const { r, u, n } = decalBasis(att);
  const pos = new Vector3(...att.p).applyMatrix4(W);
  const rw = r.clone().transformDirection(W), uw = u.clone().transformDirection(W), nw = n.clone().transformDirection(W);
  const euler = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(rw, uw, nw));
  const s = att.s || 1, w = (spec.w || 2) * s, h = (spec.h || 1) * s;
  let g;
  try { g = new DecalGeometry(hull, pos, euler, new Vector3(w, h, 0.5)); } catch (e) { return null; }
  // keep only the faces that face the way the decal does (the hull's far / inside wall would show it twice)
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const keep = [];
  for (let i = 0; i + 2 < P.count; i += 3) {
    const nrm = new Vector3(N.getX(i) + N.getX(i + 1) + N.getX(i + 2), N.getY(i) + N.getY(i + 1) + N.getY(i + 2), N.getZ(i) + N.getZ(i + 1) + N.getZ(i + 2)).normalize();
    if (nrm.dot(nw) > 0.25) keep.push(i, i + 1, i + 2);
  }
  if (!keep.length) return null;
  const q = (attr, size) => { const a = new Float32Array(keep.length * size); keep.forEach((v, k) => { for (let c = 0; c < size; c++) a[k * size + c] = attr.array[v * size + c]; }); return new THREE.BufferAttribute(a, size); };
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', q(P, 3)); out.setAttribute('normal', q(N, 3)); out.setAttribute('uv', q(UV, 2));
  const mat = new MeshStandardMaterial({ color: spec.tex ? (spec.color || '#ffffff') : '#ffffff', roughness: 0.6, metalness: 0.1, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  if (spec.tex) whenTexture(spec.tex, t => { const c = t.clone(); c.needsUpdate = true; mat.map = c; mat.needsUpdate = true; });
  else mat.map = textTexture(spec.text || 'TEXT', spec.font, spec.color, w, h);
  const mesh = new Mesh(out, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 3;
  return mesh;
}
