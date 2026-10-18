// Thruster, booster and rocket exhaust: a flickering flame and a trail of smoke that any hall or gadget can have (`fx` on the hall or gadget).
// A flame is two soft additive cones; smoke is a pool of particles simulated in world space, so it hangs in the air behind a moving ship.
import * as THREE from 'three';

const { Vector3, Color, Matrix4 } = THREE;

export const FX_COLORS = {
  orange: ['Orange fire', '#fff1c8', '#ff6a1a'],
  blue: ['Blue plasma', '#eef6ff', '#3a7dff'],
  white: ['White-hot', '#ffffff', '#c4e2ff'],
  green: ['Green', '#c8ffd8', '#10d070'],
  violet: ['Violet', '#ffe6ff', '#a040ff'],
};
export const FX_DIRS = { '-z': 'Out of the back (-Z)', '+z': 'Out of the front (+Z)', '-y': 'Down (-Y)', '+y': 'Up / out of the surface (+Y)', '-x': 'Left (-X)', '+x': 'Right (+X)' };

export const newFx = (over = {}) => ({ fire: true, smoke: true, len: 3, r: 0.5, color: 'orange', dir: '-z', off: [0, 0, 0], ...over });

/** the direction a flame points, as a unit vector in the owner's own frame */
export const dirVector = d => new Vector3(d.includes('x') ? 1 : 0, d.includes('y') ? 1 : 0, d.includes('z') ? 1 : 0).multiplyScalar(d[0] === '-' ? -1 : 1);

const FLAME_VERT = /* glsl */`
varying float vV; varying vec3 vN; varying vec3 vView; varying float vA;
void main(){
  vV = clamp(position.z, 0., 1.);
  vA = atan(position.y, position.x);
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */`
uniform vec3 uCore, uEdge; uniform float uTime, uThrottle, uCoreMix, uSeed;
varying float vV; varying vec3 vN; varying vec3 vView; varying float vA;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
void main(){
  float rim = pow(clamp(abs(dot(normalize(vN), normalize(vView))), 0., 1.), 1.3);
  float turb = n2(vec2(vA * 2.2 + uSeed, vV * 5. - uTime * 9.)) * .7 + n2(vec2(vA * 5. - uSeed, vV * 11. - uTime * 15.)) * .3;
  float body = pow(1. - vV, 1.1) * (.55 + .7 * turb);
  float a = clamp(body * rim * 1.5, 0., 1.) * uThrottle;
  vec3 c = mix(uEdge, uCore, clamp((1. - vV) * uCoreMix + (turb - .5) * .3, 0., 1.));
  gl_FragColor = vec4(c * a * 2.2, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** a cone from the nozzle (z = 0, radius 1) to a point at z = 1 */
function coneGeometry() {
  const g = new THREE.CylinderGeometry(0.02, 1, 1, 24, 8, true);
  g.rotateX(-Math.PI / 2);                 // axis along +Z: wide end (was +Y... after the turn) - put the wide end at z = 0
  g.translate(0, 0, 0.5);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), k = 1 - z; const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y) || 1; const want = 0.02 + 0.98 * Math.pow(k, 0.8); p.setXY(i, x / r * want, y / r * want); }
  g.computeVertexNormals();
  return g;
}

const SMOKE_VERT = /* glsl */`
attribute float aAge; attribute float aSize; attribute float aSeed;
uniform float uScale;
varying float vAge; varying float vSeed;
void main(){
  vAge = aAge; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, .1), 1., 400.);
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FRAG = /* glsl */`
uniform float uBright; varying float vAge; varying float vSeed;
void main(){
  vec2 q = gl_PointCoord - .5;
  float d = length(q) * 2.;
  if (d > 1.) discard;
  float soft = smoothstep(1., .25, d) * (.75 + .25 * sin(vSeed * 40. + d * 6.));
  float life = 1. - vAge;
  vec3 hot = vec3(1., .55, .22), grey = vec3(.32, .32, .34);
  vec3 c = mix(hot, grey, smoothstep(0., .07, vAge)) * mix(1., uBright, smoothstep(0., .3, vAge));
  float a = soft * pow(life, 1.4) * .34;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const _p = new Vector3(), _d = new Vector3(), _m = new Matrix4(), _s = new Vector3();

export class Exhaust {
  /** `parent`: where the flames live (ship space); `world`: where the smoke lives (the scene) */
  constructor(parent, world, cap = 2400) {
    this.parent = parent; this.world = world;
    this.items = new Map();
    this.cone = coneGeometry();
    this.t = 0;
    this.cap = cap; this.n = 0;
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3); this.age = new Float32Array(cap); this.life = new Float32Array(cap); this.size = new Float32Array(cap); this.seed = new Float32Array(cap); this.s0 = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    this.aAge = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aAge', this.aAge);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.u = { uScale: { value: 600 }, uBright: { value: 1 } };
    this.points = new THREE.Points(this.geo, new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: this.u, transparent: true, depthWrite: false, fog: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    world.add(this.points);
  }

  /** (re)make the flames: list = [{key, fx, base}], base = the nozzle frame in ship space with +Z the way the exhaust goes */
  sync(list) {
    const want = new Set(list.map(l => l.key));
    for (const [k, it] of this.items) if (!want.has(k)) { it.group.removeFromParent(); this.items.delete(k); }
    for (const l of list) {
      let it = this.items.get(l.key);
      const sig = JSON.stringify([l.fx.color, l.fx.r, l.fx.len]);
      if (!it) {
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        this.parent.add(group);
        it = { group, sig: '', acc: 0, seed: Math.random() * 50 };
        this.items.set(l.key, it);
      }
      it.fx = l.fx; it.base = l.base.clone(); it.delta = null;
      if (it.sig !== sig) {
        it.sig = sig;
        it.group.clear();
        const c = FX_COLORS[l.fx.color] || FX_COLORS.orange;
        const mk = (core, edge, mix, kr, kl) => {
          const u = { uCore: { value: new Color(core) }, uEdge: { value: new Color(edge) }, uTime: { value: 0 }, uThrottle: { value: 1 }, uCoreMix: { value: mix }, uSeed: { value: it.seed } };
          const m = new THREE.Mesh(this.cone, new THREE.ShaderMaterial({ vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: u, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
          m.userData.k = [kr, kl]; m.frustumCulled = false; m.renderOrder = 6;
          it.group.add(m);
          return u;
        };
        it.outer = mk(c[1], c[2], 0.8, 1, 1);
        it.inner = mk('#ffffff', c[1], 1.4, 0.45, 0.62);
      }
    }
    this.apply();
  }

  /** where each nozzle has moved to: deltas = Map('h:id'|'a:id'|'ship' -> Matrix4), `keyOf(item key)` -> the mover keys */
  setDeltas(get) {
    for (const [k, it] of this.items) it.delta = get(k);
    this.apply();
  }

  apply() {
    for (const it of this.items.values()) {
      if (it.delta) it.group.matrix.copy(it.delta).multiply(it.base); else it.group.matrix.copy(it.base);
      it.group.matrixWorldNeedsUpdate = true;
    }
  }

  clear() { this.sync([]); this.n = 0; this.geo.setDrawRange(0, 0); }

  dispose() { this.clear(); this.points.removeFromParent(); this.geo.dispose(); this.points.material.dispose(); }

  /** env: {throttle 0..1, flow (Vector3: how the air moves past the ship, world units/s), fire, smoke, bright, camera, height (renderer pixels)} */
  update(dt, env) {
    this.t += dt;
    const thr = env.throttle ?? 1;
    for (const it of this.items.values()) {
      const on = it.fx.fire && env.fire && thr > 0.01;
      it.group.visible = on || (it.fx.smoke && env.smoke);
      it.group.updateWorldMatrix(true, false);
      const sc = _s.setFromMatrixScale(it.group.matrixWorld).x;                    // metres of the ship -> scene units
      const flick = 0.9 + 0.1 * Math.sin(this.t * 37 + it.seed) + 0.05 * Math.sin(this.t * 61 + it.seed * 2);
      const len = it.fx.len * (0.25 + 0.75 * thr) * flick, r = it.fx.r * (0.85 + 0.15 * thr);
      for (const m of it.group.children) {
        m.visible = on;
        m.scale.set(r * m.userData.k[0], r * m.userData.k[0], len * m.userData.k[1]);
      }
      it.outer.uTime.value = it.inner.uTime.value = this.t;
      it.outer.uThrottle.value = it.inner.uThrottle.value = Math.min(1, thr * 1.2);
      // smoke leaves the nozzle
      if (it.fx.smoke && env.smoke && thr > 0.02) {
        const fl = env.flow ? env.flow.length() : 0;
        it.acc += dt * (28 + 60 * thr + Math.min(fl / Math.max(sc * 2, 1e-3), 140));          // faster air: more puffs, so the trail stays unbroken
        _p.setFromMatrixPosition(it.group.matrixWorld);
        _d.set(0, 0, 1).transformDirection(it.group.matrixWorld);
        const sp = (4 + 16 * thr) * sc;
        while (it.acc >= 1) {
          it.acc -= 1;
          const i = this.n < this.cap ? this.n++ : (this.rr = ((this.rr || 0) + 1) % this.cap);
          const j = i * 3, jit = () => (Math.random() - 0.5);
          const a = Math.random() * len * sc * 0.6;                                  // born along the flame, so it trails smoothly
          const back = Math.random() * dt;                                         // born a moment ago, so puffs spread along the path the ship has flown
          const fv = env.flow;
          this.P[j] = _p.x + _d.x * a - (fv ? fv.x * back : 0); this.P[j + 1] = _p.y + _d.y * a - (fv ? fv.y * back : 0); this.P[j + 2] = _p.z + _d.z * a - (fv ? fv.z * back : 0);
          this.V[j] = _d.x * sp + jit() * 0.8 * sc; this.V[j + 1] = _d.y * sp + jit() * 0.8 * sc; this.V[j + 2] = _d.z * sp + jit() * 0.8 * sc;
          this.age[i] = 0; this.life[i] = 2.2 + Math.random() * 2.2; this.s0[i] = it.fx.r * sc * (1.0 + Math.random() * 0.7); this.seed[i] = Math.random();
        }
      }
    }
    const flow = env.flow || _d.set(0, 0, 0);
    const drag = 1 - Math.exp(-dt * 0.9);
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt / this.life[i];
      const j = i * 3;
      if (this.age[i] >= 1) { this.age[i] = 1; this.s0[i] = 0; continue; }
      this.V[j] += (flow.x - this.V[j]) * drag; this.V[j + 1] += (flow.y - this.V[j + 1]) * drag + 0.15 * dt; this.V[j + 2] += (flow.z - this.V[j + 2]) * drag;
      this.P[j] += this.V[j] * dt; this.P[j + 1] += this.V[j + 1] * dt; this.P[j + 2] += this.V[j + 2] * dt;
    }
    for (let i = 0; i < this.n; i++) {
      this.aAge.array[i] = this.age[i];
      this.aSize.array[i] = this.s0[i] * (1 + 5 * this.age[i]) * (this.age[i] >= 1 ? 0 : 1);
    }
    this.geo.attributes.position.needsUpdate = this.aAge.needsUpdate = this.aSize.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
    this.points.visible = !!env.smoke && this.n > 0;
    this.u.uBright.value = env.bright ?? 1;
    if (env.height) this.u.uScale.value = env.height / (2 * Math.tan(THREE.MathUtils.degToRad(env.fov || 45) / 2));
  }

  /** anything alive (so the picture keeps being drawn)? */
  alive() { return this.items.size > 0; }
}
