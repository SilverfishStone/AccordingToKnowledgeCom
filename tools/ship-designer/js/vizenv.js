// Visualizer environments: a city and a hillside coast (from the two world files), open ocean, desert, open space, a planet, a star and hyperspace.
// Every environment keeps the ship at the origin heading toward -Z and moves the world past it at `ctx.speed` (metres per second of scenery).
import * as THREE from 'three';
import { NOISE_GLSL } from './vizsky.js';

const { Vector3, Color, MathUtils } = THREE;
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ small helpers
const ih = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = ih(ix, iy), b = ih(ix + 1, iy), c = ih(ix, iy + 1), d = ih(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm2(x, y, oct = 4) { let a = 0.5, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 5.3; a *= 0.5; } return s; }

function disposeTree(o) {
  o.traverse(c => {
    if (c.isMesh || c.isLine || c.isPoints) {
      if (!c.userData.shared) { c.geometry?.dispose?.(); [].concat(c.material || []).forEach(m => m.dispose?.()); }
    }
  });
}

/** streaks / dust that flow past the ship: lines from the head back along the flow, fading to nothing */
class Streaks {
  constructor({ n, rMin, rMax, depth, color, colors, minLen = 0.2, lenK = 0.02 }) {
    this.n = n; this.depth = depth; this.minLen = minLen; this.lenK = lenK;
    this.p = new Float32Array(n * 3);
    const col = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rMin + (rMax - rMin) * Math.sqrt(Math.random());
      this.p.set([Math.cos(a) * r, Math.sin(a) * r, rnd(-depth / 2, depth / 2)], i * 3);
      const c = new Color(colors ? colors[(Math.random() * colors.length) | 0] : color).multiplyScalar(rnd(0.4, 1));
      col.set([c.r, c.g, c.b, 0, 0, 0], i * 6);
    }
    this.pos = new Float32Array(n * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false;
  }

  update(dt, speed) {
    const { p, pos, n, depth } = this, len = this.minLen + speed * this.lenK;
    for (let i = 0; i < n; i++) {
      let z = p[i * 3 + 2] + speed * dt;
      if (z > depth / 2) z -= depth;
      p[i * 3 + 2] = z;
      pos[i * 6] = pos[i * 6 + 3] = p[i * 3]; pos[i * 6 + 1] = pos[i * 6 + 4] = p[i * 3 + 1];
      pos[i * 6 + 2] = z; pos[i * 6 + 5] = z - len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ base class
export class Env {
  constructor(ctx) { this.ctx = ctx; this.group = new THREE.Group(); this.group.frustumCulled = false; }
  opt(id) { return this.ctx.opts[this.constructor.info.id]?.[id] ?? this.constructor.info.options?.find(o => o.id === id)?.def; }
  async load() { /* nothing to fetch */ }
  update() { /* per frame */ }
  /** lighting overrides for environments that make their own light: {sunDir, sunCol, sunInt, hemi:[sky,ground,int], expo, fog} */
  light() { return null; }
  optionChanged() { /* rebuild what depends on the option */ }
  dispose() { disposeTree(this.group); this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ the two world files: city tile, hillside coast
const TILE = 600;
const fileCache = new Map();

async function readEnvFile(url, progress) {
  if (fileCache.has(url)) return fileCache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status}) - run tools/prep_env.py to make it.`);
  const total = +res.headers.get('content-length') || 0;
  const rd = res.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    parts.push(value); got += value.length;
    if (total) progress?.(got / total);
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const buf = all.buffer;
  const jl = new DataView(buf).getUint32(0, true);
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
  const data = { meta, buf, base: 4 + jl };
  fileCache.set(url, data);
  return data;
}

function dequant(q, bmin, bmax) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = bmin[i % 3] + q[i] / 65535 * (bmax[i % 3] - bmin[i % 3]);
  return out;
}

/** windows on the buildings: a grid on every upright face, lit at night */
function windowMaterial(base, win) {
  base.onBeforeCompile = sh => {
    sh.uniforms.uWin = win;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLoc; uniform float uWin;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float winLit = 0.; float winMask = 0.;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 fn = normalize(cross(dFdx(vLoc), dFdy(vLoc)));
  if (abs(fn.y) < 0.35) {
    float u = dot(vLoc.xz, normalize(vec2(-fn.z, fn.x)));
    vec2 cell = vec2(u / 3.2, vLoc.y / 3.6), id = floor(cell), f = fract(cell);
    float w = step(.16, f.x) * step(f.x, .84) * step(.2, f.y) * step(f.y, .78) * step(2.8, vLoc.y + 3.0);
    winMask = w;
    winLit = w * step(h21(id), uWin * .55 + .02);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.07, .1, .14), w * .8);
  }
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1., .78, .45) * winLit * 1.4 * step(.05, uWin);');
  };
  base.customProgramCacheKey = () => 'viz-windows';
  return base;
}

class TileWorld extends Env {
  constructor(ctx, url, def) {
    super(ctx);
    this.url = url; this.def = def;
    this.win = { value: 0 };
    this.tiles = new Map();
    this.template = [];
    this.treeDefs = [];
    this.gy = null;
  }

  async load(progress) {
    const { meta, buf, base } = await readEnvFile(this.url, progress);
    this.meta = meta;
    const mats = {
      surface: n => new THREE.MeshStandardMaterial({ color: new Color().setRGB(...n.color), flatShading: true, roughness: 0.95, metalness: 0 }),
      water: n => new THREE.MeshStandardMaterial({ color: new Color().setRGB(...n.color), flatShading: true, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.9 }),
      detail: n => (n.name === 'buildings' ? windowMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.05 }), this.win)
        : new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0 })),
    };
    const H = 150, cellM = TILE / H;
    const hm = new Float32Array(H * H).fill(-1e9);
    for (const g of meta.groups) {
      const q = new Uint16Array(buf, base + g.pos.o, g.n * 3);
      const pos = dequant(q, g.bmin, g.bmax);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (g.col) geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf, base + g.col.o, g.n * 3), 3, true));
      const m = new THREE.Mesh(geo, mats[g.kind](g));
      m.userData.shared = true;
      m.userData.kind = g.kind;
      m.userData.name = g.name;
      m.receiveShadow = g.kind !== 'water';
      this.template.push(m);
      if (g.name === 'ground' || g.name === 'buildings' || g.name === 'road') {          // a height map to fly over
        for (let i = 0; i < pos.length; i += 3) {
          const ix = Math.min(H - 1, Math.max(0, Math.floor((pos[i] + TILE / 2) / cellM))), iz = Math.min(H - 1, Math.max(0, Math.floor((pos[i + 2] + TILE / 2) / cellM)));
          if (pos[i + 1] > hm[iz * H + ix]) hm[iz * H + ix] = pos[i + 1];
        }
      }
    }
    for (let i = 0; i < hm.length; i++) if (hm[i] < -1e8) hm[i] = meta.groundY[0];
    this.hm = this.blur(this.blur(hm, H, 4), H, 4);
    this.H = H; this.cellM = cellM;
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    for (const t of meta.trees) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(dequant(new Uint16Array(buf, base + t.pos.o, t.n * 3), t.bmin, t.bmax), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf, base + t.col.o, t.n * 3), 3, true));
      geo.setIndex(new THREE.BufferAttribute(t.idx32 ? new Uint32Array(buf, base + t.idx.o, t.ni) : new Uint16Array(buf, base + t.idx.o, t.ni), 1));
      this.treeDefs.push({ geo, inst: new Float32Array(buf, base + t.inst.o, t.inst.n), mat: treeMat });
    }
    const gy = meta.groundY;
    this.gy = this.sample(this.ctx.pos.x, this.ctx.pos.z);
    this.groundMin = gy[0];
  }

  blur(src, H, r) {
    const out = new Float32Array(src.length), tmp = new Float32Array(src.length);
    for (let z = 0; z < H; z++) for (let x = 0; x < H; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < H) { s = Math.max(s, src[z * H + xx]); c++; } } tmp[z * H + x] = s; }
    for (let z = 0; z < H; z++) for (let x = 0; x < H; x++) { let s = -1e9; for (let k = -r; k <= r; k++) { const zz = z + k; if (zz >= 0 && zz < H) s = Math.max(s, tmp[zz * H + x]); } out[z * H + x] = s; }
    return out;
  }

  /** the (smoothed) height of the ground at a point of the endless, mirrored world */
  sample(px, pz) {
    const i = Math.round(px / TILE), j = Math.round(pz / TILE);
    const lx = (px - i * TILE) * (i & 1 ? -1 : 1), lz = (pz - j * TILE) * (j & 1 ? -1 : 1);
    const ix = MathUtils.clamp(Math.floor((lx + TILE / 2) / this.cellM), 0, this.H - 1), iz = MathUtils.clamp(Math.floor((lz + TILE / 2) / this.cellM), 0, this.H - 1);
    return this.hm[iz * this.H + ix];
  }

  makeTile(i, j) {
    const g = new THREE.Group();
    g.userData.detail = [];
    for (const m of this.template) {
      const c = new THREE.Mesh(m.geometry, m.material);
      c.userData.shared = true;
      c.receiveShadow = m.receiveShadow;
      if (m.userData.kind === 'detail' && m.userData.name !== 'buildings') g.userData.detail.push(c);
      g.add(c);
    }
    g.userData.trees = [];
    for (const t of this.treeDefs) {
      const n = t.inst.length / 6;
      if (!n) continue;
      const im = new THREE.InstancedMesh(t.geo, t.mat, n);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new Vector3();
      for (let k = 0; k < n; k++) {
        const o = k * 6;
        q.setFromAxisAngle(new Vector3(0, 1, 0), t.inst[o + 3]);
        s.set(t.inst[o + 4], t.inst[o + 5], t.inst[o + 4]);
        M.compose(new Vector3(t.inst[o], t.inst[o + 1], t.inst[o + 2]), q, s);
        im.setMatrixAt(k, M);
      }
      im.userData.shared = true;
      im.frustumCulled = false;
      g.userData.trees.push(im);
      g.add(im);
    }
    this.group.add(g);
    return g;
  }

  update(dt) {
    const { ctx } = this, p = ctx.pos, R = this.def.fogFar + TILE * 0.5;
    this.win.value = ctx.look.win ?? 0;
    const ahead = MathUtils.clamp(ctx.speed * 1.2, 20, 160);
    const target = Math.max(this.sample(p.x, p.z), this.sample(p.x, p.z - ahead), this.sample(p.x, p.z - ahead * 0.5));
    this.gy += (target - this.gy) * (1 - Math.exp(-dt / 0.8));
    const i0 = Math.floor((p.x - R + TILE / 2) / TILE), i1 = Math.floor((p.x + R + TILE / 2) / TILE), j0 = Math.floor((p.z - R + TILE / 2) / TILE), j1 = Math.floor((p.z + R + TILE / 2) / TILE);
    const live = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = i + ',' + j;
      live.add(key);
      let t = this.tiles.get(key);
      if (!t) { t = this.makeTile(i, j); this.tiles.set(key, t); }
      t.visible = true;
      t.position.set(i * TILE - p.x, -(this.gy + ctx.height), j * TILE - p.z);
      t.scale.set(i & 1 ? -1 : 1, 1, j & 1 ? -1 : 1);
      const dx = Math.max(Math.abs(p.x - i * TILE) - TILE / 2, 0), dz = Math.max(Math.abs(p.z - j * TILE) - TILE / 2, 0), near = Math.hypot(dx, dz);
      const showDetail = near < 320, showTrees = near < 460;
      for (const d of t.userData.detail) d.visible = showDetail;
      for (const d of t.userData.trees) d.visible = showTrees;
    }
    for (const [key, t] of this.tiles) {
      if (!live.has(key)) { t.visible = false; if (this.tiles.size > 14) { t.removeFromParent(); t.userData.trees.forEach(m => m.dispose()); this.tiles.delete(key); } }
    }
  }

  dispose() {
    this.tiles.forEach(t => t.userData.trees.forEach(m => m.dispose()));
    this.group.removeFromParent();
  }
}

class City extends TileWorld {
  static info = { id: 'city', name: 'City', height: { label: 'Height above the roofs', min: 5, max: 250, def: 28, unit: 'm' }, speedK: 1, fog: [120, 760], note: 'A low-poly downtown. The tile repeats mirrored, so the city never ends.' };
  constructor(ctx) { super(ctx, 'resources/environments/city.env', { fogFar: 760 }); }
}
class Hillside extends TileWorld {
  static info = { id: 'hillside', name: 'Hillside & coast', height: { label: 'Height above the ground', min: 5, max: 250, def: 45, unit: 'm' }, speedK: 1, fog: [140, 820], note: 'A town on a hill running down to the sea. The ground is followed, so you skim the slope.' };
  constructor(ctx) { super(ctx, 'resources/environments/hillside.env', { fogFar: 820 }); }
}

// ------------------------------------------------------------------ ocean
const OCEAN_VERT = /* glsl */`
uniform float uTime, uAmp; uniform vec2 uOff;
varying vec3 vN; varying vec3 vWorld; varying float vH; varying vec2 vP;
void wv(vec2 p, vec2 dir, float wl, float amp, inout float h, inout vec2 g){
  float k = 6.2831853 / wl, w = sqrt(9.8 * k);
  float ph = dot(dir, p) * k + uTime * w;
  h += amp * sin(ph); g += amp * k * cos(ph) * dir;
}
void main(){
  vec2 p = position.xz + uOff;
  float h = 0.; vec2 g = vec2(0.);
  wv(p, normalize(vec2(1., .35)), 190., uAmp * 1.0, h, g);
  wv(p, normalize(vec2(.6, 1.)), 110., uAmp * .65, h, g);
  wv(p, normalize(vec2(-.5, .8)), 62., uAmp * .38, h, g);
  wv(p, normalize(vec2(.9, -.6)), 36., uAmp * .2, h, g);
  vec3 pos = vec3(position.x, h, position.z);
  vN = normalize(vec3(-g.x, 1., -g.y));
  vH = h; vP = p;
  vec4 wp = modelMatrix * vec4(pos, 1.);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OCEAN_FRAG = /* glsl */`
uniform vec3 uTop, uHor, uDeep, uShallow, uFog, uSunDir, uSunCol; uniform float uTime, uAmp, uFogNear, uFogFar, uLight;
varying vec3 vN; varying vec3 vWorld; varying float vH; varying vec2 vP;
${NOISE_GLSL}
vec3 skyc(vec3 d){
  float h = max(d.y, 0.);
  vec3 c = mix(uHor, uTop, pow(h, .45));
  float sd = max(dot(d, uSunDir), 0.);
  return c + uSunCol * (pow(sd, 6.) * .2 + pow(sd, 70.) * .5 + smoothstep(.99965, .99985, sd) * 30.);
}
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec2 q = vP * .09;
  float e = .6;
  float n0 = fbm(vec3(q, uTime * .12)), nx = fbm(vec3(q + vec2(e, 0.) * .05, uTime * .12)), nz = fbm(vec3(q + vec2(0., e) * .05, uTime * .12));
  vec3 N = normalize(vN + vec3(n0 - nx, 0., n0 - nz) * 6. * (1. - smoothstep(200., 900., dist) * .8));
  float F = .02 + .98 * pow(1. - clamp(dot(N, V), 0., 1.), 5.);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyc(R);
  float crest = clamp(vH / (uAmp * 2.2) * .5 + .5, 0., 1.);
  vec3 body = mix(uDeep, uShallow, crest * crest);
  float ndl = max(dot(N, uSunDir), 0.);
  body *= (.18 + .82 * uLight) * (.6 + .6 * ndl) + .04;
  vec3 c = mix(body, refl, F);
  c += uSunCol * pow(max(dot(R, uSunDir), 0.), 280.) * 5.;
  float foam = smoothstep(.8, 1., crest + (n0 - .5) * .5) * smoothstep(0., 1., uAmp * .6);
  c = mix(c, vec3(.9, .95, 1.) * (.03 + .97 * uLight), foam * .5);
  c = mix(c, uFog, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Ocean extends Env {
  static info = { id: 'ocean', name: 'Over the ocean', height: { label: 'Height above the waves', min: 3, max: 250, def: 22, unit: 'm' }, speedK: 1, fog: [200, 1900],
    options: [{ id: 'waves', label: 'Waves', type: 'range', min: 0.2, max: 3, step: 0.05, def: 1 }], note: 'Open water to the horizon.' };
  constructor(ctx) {
    super(ctx);
    const rings = 90, seg = 144, rMax = 3600, pos = [], idx = [];
    pos.push(0, 0, 0);
    for (let r = 1; r <= rings; r++) { const rr = rMax * Math.pow(r / rings, 2.4) + 1; for (let s = 0; s < seg; s++) { const a = s / seg * Math.PI * 2; pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr); } }
    for (let s = 0; s < seg; s++) idx.push(0, 1 + (s + 1) % seg, 1 + s);
    for (let r = 1; r < rings; r++) for (let s = 0; s < seg; s++) {
      const a = 1 + (r - 1) * seg + s, b = 1 + (r - 1) * seg + (s + 1) % seg, c = 1 + r * seg + s, d = 1 + r * seg + (s + 1) % seg;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    this.u = {
      uTime: { value: 0 }, uAmp: { value: 1 }, uOff: { value: new THREE.Vector2() }, uTop: { value: new Color() }, uHor: { value: new Color() }, uDeep: { value: new Color('#06304f') }, uShallow: { value: new Color('#1d7f9a') },
      uFog: { value: new Color() }, uSunDir: { value: new Vector3(0, 1, 0) }, uSunCol: { value: new Color() }, uFogNear: { value: 200 }, uFogFar: { value: 1900 }, uLight: { value: 1 },
    };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, uniforms: this.u, fog: false }));
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  update(dt) {
    const { ctx, u } = this, L = ctx.look;
    u.uTime.value = ctx.t;
    u.uAmp.value = 1.2 * this.opt('waves');
    u.uOff.value.set(ctx.pos.x, ctx.pos.z);
    this.mesh.position.set(0, -ctx.height, 0);
    u.uTop.value.set(L.top); u.uHor.value.set(L.hor); u.uFog.value.copy(ctx.scene.fog.color);
    u.uSunDir.value.copy(ctx.sunDir);
    u.uSunCol.value.set(L.col).multiplyScalar(L.int > 0 ? 1 : 0);
    u.uLight.value = L.moon ? 0.12 : MathUtils.clamp(L.int / 3, 0.08, 1);
    u.uFogNear.value = ctx.scene.fog.near; u.uFogFar.value = ctx.scene.fog.far;
  }
}

// ------------------------------------------------------------------ desert
class Desert extends Env {
  static info = { id: 'desert', name: 'Desert', height: { label: 'Height above the dunes', min: 5, max: 300, def: 30, unit: 'm' }, speedK: 1, fog: [250, 1500],
    options: [{ id: 'dunes', label: 'Dune height', type: 'range', min: 0.3, max: 2.5, step: 0.05, def: 1 }], note: 'Rolling dunes; the ship follows the sand.' };
  constructor(ctx) {
    super(ctx);
    this.N = 170; this.cell = 11;
    const n = this.N;
    this.geo = new THREE.PlaneGeometry(1, 1, n - 1, n - 1);
    this.geo.rotateX(-Math.PI / 2);
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    this.hs = new Float32Array(n * n);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.cx = 1e9; this.cz = 1e9; this.gy = 0;
    this.amp = 0;
  }

  height(x, z) {
    const a = this.opt('dunes'), c = Math.cos(0.5), s = Math.sin(0.5), qx = x * c - z * s, qz = x * s + z * c;
    const big = fbm2(qx * 0.0021, qz * 0.0021, 4);
    const ridge = 1 - Math.abs(2 * fbm2(qx * 0.0075 + 3, qz * 0.0125 - 9, 2) - 1);
    const crest = Math.pow(ridge, 2.2);
    return a * (46 * Math.pow(big, 1.5) + 16 * crest * (0.3 + big) + 1.4 * fbm2(x * 0.08, z * 0.08, 2)) - 10;
  }

  rebuild(cx, cz) {
    const n = this.N, c = this.cell, pos = this.geo.attributes.position, col = this.geo.attributes.color, hs = this.hs;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const wx = cx + (i - n / 2) * c, wz = cz + (j - n / 2) * c, k = j * n + i;
      hs[k] = this.height(wx, wz);
      pos.setXYZ(k, (i - n / 2) * c, hs[k], (j - n / 2) * c);
    }
    const sand = [new Color('#caa066'), new Color('#e6c488'), new Color('#b07c46')], tmp = new Color();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, hl = hs[j * n + Math.max(i - 1, 0)], hr = hs[j * n + Math.min(i + 1, n - 1)], hu = hs[Math.max(j - 1, 0) * n + i], hd = hs[Math.min(j + 1, n - 1) * n + i];
      const slope = MathUtils.clamp((Math.abs(hr - hl) + Math.abs(hd - hu)) / (c * 1.4), 0, 1), t = fbm2((cx + (i - n / 2) * c) * 0.03, (cz + (j - n / 2) * c) * 0.03, 2);
      tmp.copy(sand[0]).lerp(sand[1], MathUtils.clamp((hs[k] + 10) / 50 + (t - 0.5) * 0.6, 0, 1)).lerp(sand[2], slope * 0.55);
      col.setXYZ(k, tmp.r, tmp.g, tmp.b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.cx = cx; this.cz = cz;
  }

  optionChanged() { this.cx = 1e9; }

  update(dt) {
    const { ctx } = this, c = this.cell, cx = Math.round(ctx.pos.x / c) * c, cz = Math.round(ctx.pos.z / c) * c;
    if (cx !== this.cx || cz !== this.cz) this.rebuild(cx, cz);
    const ahead = MathUtils.clamp(ctx.speed * 1.2, 20, 200);
    const h = Math.max(this.height(ctx.pos.x, ctx.pos.z), this.height(ctx.pos.x, ctx.pos.z - ahead), this.height(ctx.pos.x, ctx.pos.z - ahead * 0.5));
    this.gy += (h - this.gy) * (1 - Math.exp(-dt / 0.8));
    this.mesh.position.set(this.cx - ctx.pos.x, -(this.gy + ctx.height), this.cz - ctx.pos.z);
  }
}

// ------------------------------------------------------------------ planets and stars
const PLANET_VERT = /* glsl */`
varying vec3 vObj; varying vec3 vNw; varying vec3 vWorld;
void main(){
  vObj = normalize(position);
  vNw = normalize(mat3(modelMatrix) * position);
  vec4 wp = modelMatrix * vec4(position, 1.);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PLANET_FRAG = /* glsl */`
uniform vec3 uSunDir, uSunCol; uniform float uType, uTime, uLight;
varying vec3 vObj; varying vec3 vNw; varying vec3 vWorld;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(vObj), V = normalize(cameraPosition - vWorld), N = normalize(vNw);
  float lat = abs(p.y);
  vec3 col; float spec = 0.; float emis = 0.; float cityMask = 0.;
  if (uType < .5) {                                         // living world: oceans, land, ice, clouds
    float h = fbm(p * 2.4 + 3.) * .56 + fbm(p * 9. + 1.) * .2 + fbm(p * 38.) * .14 + fbm(p * 150.) * .1;
    float land = smoothstep(.5, .54, h);
    vec3 ocean = mix(vec3(.01, .09, .26), vec3(.05, .3, .5), smoothstep(.3, .5, h));
    float dry = smoothstep(.45, .85, fbm(p * 3.1 + 8.) + (1. - lat) * .15);
    vec3 ground = mix(vec3(.16, .36, .14), vec3(.5, .42, .24), dry);
    ground = mix(ground, vec3(.42, .4, .38), smoothstep(.62, .78, h));
    ground = mix(ground, vec3(.95), smoothstep(.76, .86, h));
    col = mix(ocean, ground, land);
    float ice = smoothstep(.82, .9, lat + (fbm(p * 6.) - .5) * .12);
    col = mix(col, vec3(.93, .96, 1.), ice);
    spec = (1. - land) * (1. - ice);
    cityMask = land * (1. - ice) * step(.93, hash13(floor(p * 220.))) * smoothstep(.3, .6, fbm(p * 14.));
    float cl = smoothstep(.5, .8, fbm(p * 4.2 + vec3(uTime * .004, 0., 0.)) * .6 + fbm(p * 21. + uTime * .003) * .3 + fbm(p * 90.) * .1);
    col = mix(col, vec3(1.), cl * .85);
    spec *= 1. - cl;
    cityMask *= 1. - cl;
  } else if (uType < 1.5) {                                 // dry rusty world
    float h = fbm(p * 3. + 2.) * .6 + fbm(p * 13.) * .4;
    col = mix(vec3(.45, .17, .08), vec3(.8, .42, .2), h);
    col = mix(col, vec3(.2, .09, .06), smoothstep(.55, .75, fbm(p * 5. + 9.)) * .6);
    col = mix(col, vec3(.92, .9, .88), smoothstep(.9, .96, lat));
  } else if (uType < 2.5) {                                 // ice world
    float h = fbm(p * 4. + 5.);
    col = mix(vec3(.65, .78, .92), vec3(.97, .99, 1.), h);
    float cr = abs(vnoise(p * 22.) - .5);
    col = mix(col, vec3(.25, .4, .6), smoothstep(.03, 0., cr) * .7);
  } else if (uType < 3.5) {                                 // lava world
    float h = fbm(p * 3. + 1.) , r = abs(fbm(p * 7. + 4.) - .5);
    col = mix(vec3(.04, .035, .035), vec3(.16, .12, .1), h);
    float crack = smoothstep(.05, 0., r);
    emis = crack * (.7 + .3 * sin(uTime * .6 + h * 20.));
    col = mix(col, vec3(1., .35, .05), crack);
  } else {                                                  // gas giant
    float w = p.y * 16. + fbm(vec3(p.x * 2., p.y * 9., p.z * 2.) + uTime * .02) * 3.;
    float band = .5 + .5 * sin(w);
    col = mix(vec3(.78, .55, .34), vec3(.95, .86, .7), band);
    col = mix(col, vec3(.55, .3, .2), smoothstep(.6, 1., .5 + .5 * sin(w * 2.7 + 1.)) * .5);
    vec3 s = p - normalize(vec3(.6, -.25, .75));
    col = mix(col, vec3(.7, .25, .15), smoothstep(.22, .05, length(s * vec3(1., 2.2, 1.))));
  }
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-.06, .3, ndl) * uLight;
  vec3 c = col * (lit * uSunCol * 1.15 + .02 + (1. - uLight) * .03);
  c += vec3(1., .72, .38) * cityMask * (1. - smoothstep(-.12, .05, ndl)) * 1.2;
  c += vec3(1., .5, .15) * emis * 1.6 * (1. - lit * .3);
  c += uSunCol * spec * pow(max(dot(reflect(-V, N), uSunDir), 0.), 70.) * .8 * lit;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uSunDir, uColor; uniform float uLight, uPow;
varying vec3 vObj; varying vec3 vNw; varying vec3 vWorld;
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1. - abs(dot(normalize(vNw), V)), uPow);
  float day = smoothstep(-.35, .45, dot(normalize(vNw), uSunDir)) * uLight + .06;
  gl_FragColor = vec4(uColor * rim * day * 1.6, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const RING_FRAG = /* glsl */`
uniform vec3 uSunDir; uniform float uLight; varying vec3 vObj; varying vec3 vWorld;
${NOISE_GLSL}
void main(){
  float r = length(vObj.xy);
  float b = fbm(vec3(r * 40., 1., 2.)) * .8 + fbm(vec3(r * 160., 4., 7.)) * .35;
  float a = smoothstep(.34, .5, b) * smoothstep(0., .04, r - .43) * smoothstep(0., .04, 1. - r);
  a *= .85;
  vec3 c = mix(vec3(.55, .48, .4), vec3(.9, .82, .7), b) * (.35 + .65 * uLight);
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const WORLD_TYPES = [[0, 'Ocean world'], [1, 'Desert world'], [2, 'Ice world'], [3, 'Lava world'], [4, 'Gas giant with rings']];
const ATMOS = [['#5aa0ff', 3], ['#ff9a6a', 4], ['#9fd0ff', 3], ['#ff5a2a', 2.5], ['#ffe0b0', 3.5]];

/** a planet (surface, thin cloud-free atmosphere shell, optional rings) as a group; `rot` spins the surface */
function makePlanet(type, R) {
  const g = new THREE.Group(), u = { uSunDir: { value: new Vector3(0, 1, 0) }, uSunCol: { value: new Color('#fff') }, uType: { value: type }, uTime: { value: 0 }, uLight: { value: 1 } };
  const geo = new THREE.SphereGeometry(R, 128, 96);
  const body = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: u, fog: false }));
  body.frustumCulled = false;
  g.add(body);
  const au = { uSunDir: u.uSunDir, uColor: { value: new Color(ATMOS[type][0]) }, uLight: u.uLight, uPow: { value: ATMOS[type][1] } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 96, 64), new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG, uniforms: au, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  atmo.frustumCulled = false;
  if (type !== 3) g.add(atmo);
  let ring = null;
  if (type === 4) {
    ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.35, R * 2.5, 160, 1), new THREE.ShaderMaterial({ vertexShader: PLANET_VERT.replace('normalize(position)', 'position / ' + (R * 2.5).toFixed(1)), fragmentShader: RING_FRAG, uniforms: { uSunDir: u.uSunDir, uLight: u.uLight }, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = Math.PI / 2 + 0.3;
    ring.frustumCulled = false;
    g.add(ring);
  }
  return { group: g, body, ring, u, atmo };
}

class Planet extends Env {
  static info = { id: 'planet', name: 'Around a planet', height: { label: 'Orbit height', min: 300, max: 9000, def: 800, unit: 'm' }, speedK: 25, fog: null,
    options: [{ id: 'world', label: 'World', type: 'select', choices: WORLD_TYPES.map(([v, l]) => [String(v), l]), def: '0' }], note: 'A world turning beneath you under a distant sun. Speed is stretched (the ground is a long way down).' };
  constructor(ctx) {
    super(ctx);
    this.R = 5200; this.spin = 0;
    this.build();
  }

  build() {
    if (this.pl) { this.pl.group.removeFromParent(); disposeTree(this.pl.group); }
    this.pl = makePlanet(+this.opt('world'), this.R);
    this.group.add(this.pl.group);
  }

  optionChanged() { this.build(); }

  update(dt) {
    const { ctx, pl } = this;
    this.spin += ctx.speed / this.R * dt;
    pl.group.position.set(0, -(this.R + ctx.height), 0);
    pl.body.rotation.x = this.spin;
    if (pl.ring) pl.ring.rotation.x = Math.PI / 2 + 0.3;
    pl.u.uSunDir.value.copy(ctx.sunDir);
    pl.u.uSunCol.value.set(ctx.look.col);
    pl.u.uLight.value = ctx.look.moon ? 0.0 : MathUtils.clamp(ctx.look.int / 3, 0, 1);
    pl.u.uTime.value = ctx.t;
    if (ctx.look.moon) pl.u.uLight.value = 0.0;
  }
}

const STAR_FRAG = /* glsl */`
uniform vec3 uColA, uColB; uniform float uTime;
varying vec3 vObj; varying vec3 vNw; varying vec3 vWorld;
${NOISE_GLSL}
void main(){
  vec3 p = normalize(vObj), V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(normalize(vNw), V), 0., 1.);
  float g = fbm(p * 26. + vec3(0., uTime * .05, 0.)) * .6 + fbm(p * 70. - uTime * .08) * .4;
  float spot = smoothstep(.74, .8, fbm(p * 5. + 3. + uTime * .004));
  vec3 c = mix(uColA, uColB, smoothstep(.25, .8, g));
  c *= (.3 + .7 * pow(mu, .55)) * 3.2 * (1. - spot * .55);
  float flare = smoothstep(.8, .95, fbm(p * 9. + uTime * .03));
  c += uColB * flare * 1.5;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const CORONA_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime;
varying vec3 vObj; varying vec3 vNw; varying vec3 vWorld;
${NOISE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = 1. - abs(dot(normalize(vNw), V));
  float streak = .6 + .6 * fbm(normalize(vObj) * 7. + uTime * .04);
  gl_FragColor = vec4(uColor * pow(rim, 2.2) * streak * 1.5, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_TYPES = [['yellow', 'Yellow dwarf', '#ff8a1e', '#fff1b0'], ['red', 'Red giant', '#a31a08', '#ff7b3a'], ['blue', 'Blue-white star', '#5a8dff', '#e8f0ff']];

class Star extends Env {
  static info = { id: 'star', name: 'Near a star', lookless: true, height: { label: 'Orbit height', min: 800, max: 40000, def: 3500, unit: 'm' }, speedK: 80, fog: null,
    options: [{ id: 'type', label: 'Star', type: 'select', choices: STAR_TYPES.map(s => [s[0], s[1]]), def: 'yellow' }],
    note: 'The star is the only light; Sun direction moves it around the sky. Speed is stretched.' };
  constructor(ctx) {
    super(ctx);
    this.R = 14000; this.spin = 0;
    this.u = { uColA: { value: new Color() }, uColB: { value: new Color() }, uTime: { value: 0 } };
    this.body = new THREE.Mesh(new THREE.SphereGeometry(this.R, 128, 96), new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: STAR_FRAG, uniforms: this.u, fog: false }));
    this.cu = { uColor: { value: new Color() }, uTime: this.u.uTime };
    this.corona = new THREE.Mesh(new THREE.SphereGeometry(this.R * 1.5, 64, 48), new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: CORONA_FRAG, uniforms: this.cu, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }));
    this.body.frustumCulled = this.corona.frustumCulled = false;
    this.group.add(this.body, this.corona);
    this.colors();
  }

  colors() {
    const t = STAR_TYPES.find(s => s[0] === this.opt('type')) || STAR_TYPES[0];
    this.u.uColA.value.set(t[2]); this.u.uColB.value.set(t[3]); this.cu.uColor.value.set(t[2]);
    this.tint = new Color(t[3]);
  }

  optionChanged() { this.colors(); }

  /** the star's direction as seen from the ship: `sunAz` degrees round, 40 degrees below the horizon */
  dir() {
    const ctx = this.ctx, az = MathUtils.degToRad(ctx.sunAz), el = MathUtils.degToRad(-38);
    return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  }

  light() {
    const d = this.dir();
    return { sunDir: d, sunCol: '#' + this.tint.clone().lerp(new Color('#ffffff'), 0.4).getHexString(), sunInt: 5.5, hemi: ['#ffb070', '#ffd8a0', 0.55], expo: 0.75, fog: null };
  }

  update(dt) {
    const { ctx } = this, d = this.dir(), dist = this.R + ctx.height;
    this.spin += ctx.speed / this.R * dt;
    this.group.position.copy(d).multiplyScalar(dist);
    this.body.rotation.y = this.spin * 0.6;
    this.u.uTime.value = ctx.t;
  }
}

// ------------------------------------------------------------------ open space
class Space extends Env {
  static info = { id: 'space', name: 'Open space', height: null, speedK: 6, fog: null,
    options: [{ id: 'rocks', label: 'Asteroids', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }], note: 'Stars, a nebula, drifting rocks and a far-off world. Speed is stretched a little.' };
  constructor(ctx) {
    super(ctx);
    const len = ctx.len;
    this.dust = new Streaks({ n: 1400, rMin: len * 0.8, rMax: len * 14, depth: len * 40, color: '#b8c8ff', minLen: len * 0.02, lenK: 0.012 });
    this.group.add(this.dust.mesh);
    // rocks: one lumpy rock shape, many sizes
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i), k = 1 + (fbm2(v.x * 2.2 + 7, v.y * 2.2 + v.z * 1.7, 3) - 0.5) * 0.9;
      p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.85, v.z * k);
    }
    g.computeVertexNormals();
    this.rockN = 320;
    this.rocks = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: false }), this.rockN);
    this.rocks.frustumCulled = false;
    this.rd = [];
    const col = new Color();
    for (let i = 0; i < this.rockN; i++) {
      this.rd.push({ r: len * Math.pow(Math.random(), 3) * 4 + len * 0.25, a: Math.random() * 6.28, d: len * rnd(3, 60), z: rnd(-1, 0.15) * len * 120, rot: new Vector3(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: new Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.15) });
      this.rocks.setColorAt(i, col.setHSL(rnd(0.05, 0.12), rnd(0.05, 0.25), rnd(0.22, 0.5)));
    }
    this.group.add(this.rocks);
    // a far-off ringed world
    this.far = makePlanet(4, 1);
    this.far.group.scale.setScalar(len * 900);
    this.far.group.position.set(-len * 2200, len * 700, -len * 6500);
    this.group.add(this.far.group);
    this.depth = len * 120;
  }

  update(dt) {
    const { ctx } = this, len = ctx.len, M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new Vector3();
    this.dust.update(dt, ctx.speed);
    const show = Math.round(this.rockN * this.opt('rocks'));
    this.rocks.count = show;
    for (let i = 0; i < show; i++) {
      const o = this.rd[i];
      o.z += ctx.speed * dt;
      if (o.z > len * 20) o.z -= len * 140;
      o.rot.addScaledVector(o.spin, dt);
      q.setFromEuler(e.set(o.rot.x, o.rot.y, o.rot.z));
      s.setScalar(o.r);
      M.compose(new Vector3(Math.cos(o.a) * o.d, Math.sin(o.a) * o.d, o.z), q, s);
      this.rocks.setMatrixAt(i, M);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    const fp = this.far;
    fp.u.uSunDir.value.copy(ctx.sunDir);
    fp.u.uSunCol.value.set(ctx.look.col);
    fp.u.uLight.value = ctx.look.moon ? 0.05 : MathUtils.clamp(ctx.look.int / 3, 0.05, 1);
    fp.u.uTime.value = ctx.t;
    fp.body.rotation.y = ctx.t * 0.01;
  }
}

// ------------------------------------------------------------------ hyperspace
const HYPER_VERT = /* glsl */`
varying vec3 vPos;
void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const HYPER_FRAG = /* glsl */`
uniform float uTime, uSpeed, uLen; uniform vec3 uC1, uC2, uC3;
varying vec3 vPos;
${NOISE_GLSL}
void main(){
  float a = atan(vPos.y, vPos.x) / 6.2831853 + .5;
  float z = vPos.z;
  float ahead = clamp(-z / (uLen * .5), 0., 1.);
  float s = uTime * uSpeed;
  float st = 0.;
  for (int i = 0; i < 3; i++) {
    float k = float(i) + 1.;
    vec3 q = vec3(a * 90. * k, (z * .5 + s * 2.5) / (uLen * (2.2 / k)) * 3., k * 7.3);
    float n = vnoise(q);
    st += pow(smoothstep(.55, 1., n), 2.) / k;
  }
  float swirl = fbm(vec3(a * 6. + z * .004 + s * .01, z * .0016 + s * .1, 2.));
  vec3 c = mix(uC1, uC2, swirl) * (.25 + swirl * .9);
  c += mix(uC2, uC3, fract(a * 3. + z * .001)) * st * 2.2;
  float ring = smoothstep(.93, 1., sin((z + s * 40.) * .02)) * .6;
  c += uC3 * ring * (.3 + ahead);
  c += uC3 * pow(ahead, 5.) * 3.;
  float far = smoothstep(.0, .12, ahead);
  gl_FragColor = vec4(c * (.35 + far), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const HYPER_PALETTES = { blue: ['#1030a0', '#2a8cff', '#c8f4ff'], violet: ['#40106a', '#c040ff', '#ffd0ff'], gold: ['#6a3a08', '#ffb030', '#fff4c0'], green: ['#06503a', '#20e0a0', '#d8fff0'] };

class Hyper extends Env {
  static info = { id: 'hyper', name: 'Hyperspace', lookless: true, height: null, speedK: 1, fog: null,
    options: [{ id: 'palette', label: 'Colour', type: 'select', choices: [['blue', 'Blue'], ['violet', 'Violet'], ['gold', 'Gold'], ['green', 'Green']], def: 'blue' }],
    note: 'A tunnel of light. The faster you go, the longer the streaks.' };
  constructor(ctx) {
    super(ctx);
    const len = ctx.len, r = Math.max(len * 7, 60), L = len * 120;
    this.L = L; this.r = r;
    this.u = { uTime: { value: 0 }, uSpeed: { value: 1 }, uLen: { value: L }, uC1: { value: new Color() }, uC2: { value: new Color() }, uC3: { value: new Color() } };
    const geo = new THREE.CylinderGeometry(r, r * 0.03, L, 64, 24, true);
    geo.rotateX(Math.PI / 2);
    this.tunnel = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: HYPER_VERT, fragmentShader: HYPER_FRAG, uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.tunnel.frustumCulled = false;
    this.tunnel.renderOrder = -50;
    this.streaks = new Streaks({ n: 900, rMin: len * 1.4, rMax: r * 0.9, depth: len * 90, color: '#ffffff', minLen: len * 0.1, lenK: 0.12 });
    this.group.add(this.tunnel, this.streaks.mesh);
    this.colors();
  }

  colors() {
    const p = HYPER_PALETTES[this.opt('palette')] || HYPER_PALETTES.blue;
    this.u.uC1.value.set(p[0]); this.u.uC2.value.set(p[1]); this.u.uC3.value.set(p[2]);
    const cols = [p[1], p[2], '#ffffff'], c = this.streaks.geo.attributes.color;
    for (let i = 0; i < this.streaks.n; i++) { const k = new Color(cols[(Math.random() * 3) | 0]).multiplyScalar(rnd(0.35, 1)); c.setXYZ(i * 2, k.r, k.g, k.b); }
    c.needsUpdate = true;
  }

  optionChanged() { this.colors(); }

  light() {
    const p = HYPER_PALETTES[this.opt('palette')] || HYPER_PALETTES.blue;
    return { sunDir: new Vector3(0.2, 0.5, -1).normalize(), sunCol: p[2], sunInt: 3.2, hemi: [p[2], p[1], 1.5], expo: 1.0, fog: null };
  }

  update(dt) {
    const { ctx } = this;
    this.u.uTime.value = ctx.t;
    this.u.uSpeed.value = ctx.speed / Math.max(ctx.len, 1);
    this.streaks.update(dt, ctx.speed * 14 + ctx.len * 4);
    this.tunnel.position.z = 0;
  }
}

export const ENVS = [City, Hillside, Ocean, Desert, Space, Planet, Star, Hyper];
