// Visualizer: the lighting presets and the sky dome (a gradient sky with sun, clouds and stars, or a starry space with a nebula).
import * as THREE from 'three';

/** Lighting presets. `el` is the sun's height in degrees; `moon` replaces the light when the sun is down. */
export const LOOKS = {
  midday: { name: 'Midday', space: 'Full sun', el: 62, int: 3.4, col: '#fff3e0', top: '#2c6fd1', hor: '#bcdcf4', gnd: '#9a9486', hemi: ['#9fc4f0', '#8a7f6a', 0.9], fog: '#bcd6ee', night: 0, cloud: 0.35, expo: 0.9, win: 0, lamps: false },
  golden: { name: 'Golden hour', space: 'Low warm sun', el: 9, int: 2.8, col: '#ffb468', top: '#3d62a8', hor: '#ffb47a', gnd: '#6b5646', hemi: ['#8aa4d8', '#5a4636', 0.55], fog: '#e9b38a', night: 0.1, cloud: 0.5, expo: 1.0, win: 0.15, lamps: false },
  dusk: { name: 'Dusk', space: 'Dim red sun', el: -1, int: 0.7, col: '#ff7a50', top: '#141c4a', hor: '#a85a68', gnd: '#2a2230', hemi: ['#4a5a9a', '#2a2230', 0.45], fog: '#6a4a62', night: 0.55, cloud: 0.4, expo: 1.1, win: 0.7, lamps: true },
  night: { name: 'Night', space: 'Dark (starlight)', el: -30, int: 0, moon: { el: 38, int: 0.3, col: '#a9c0ff' }, top: '#02040c', hor: '#0c1424', gnd: '#05070c', hemi: ['#2a3a66', '#05070c', 0.35], fog: '#0a111f', night: 1, cloud: 0.2, expo: 1.3, win: 1, lamps: true },
  overcast: { name: 'Overcast', space: 'Soft fill', el: 45, int: 0.9, col: '#dfe6ee', top: '#8d97a3', hor: '#c3c9d0', gnd: '#80848a', hemi: ['#b8c0ca', '#7c7f84', 1.1], fog: '#bfc5cc', night: 0, cloud: 1, expo: 1.0, win: 0.2, lamps: false },
};

const NOISE = /* glsl */`
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
`;

export const NOISE_GLSL = NOISE;

const VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uTop, uHor, uGnd, uSunDir, uSunCol, uNeb1, uNeb2;
uniform float uMode, uNight, uCloud, uTime, uNebAmt, uSunBoost, uSunSize;
varying vec3 vDir;
${NOISE}
vec3 starLayer(vec3 d, float scale, float density, float size){
  vec3 p = d * scale, ip = floor(p), f = fract(p) - .5;
  float h = hash13(ip);
  if (h < density) return vec3(0.);
  vec3 jit = (vec3(hash13(ip + 3.1), hash13(ip + 7.7), hash13(ip + 1.3)) - .5) * .6;
  float dist = length(f - jit);
  float br = smoothstep(size, 0., dist) * (.35 + .65 * hash13(ip + 9.2));
  vec3 tint = mix(vec3(.72, .82, 1.), vec3(1., .86, .7), hash13(ip + 5.5));
  return tint * br * (.6 + .4 * sin(uTime * (1. + 3. * h) + h * 40.));
}
vec3 stars(vec3 d){ return starLayer(d, 110., .985, .2) * 1.6 + starLayer(d, 260., .985, .22) * .8; }
void main(){
  vec3 d = normalize(vDir);
  vec3 c;
  float sd = max(dot(d, uSunDir), 0.);
  if (uMode > .5) {                                     // space: black with a faint nebula, stars and a sun
    float band = exp(-pow(dot(d, normalize(vec3(.35, .8, .25))) * 3.2, 2.));
    float n1 = fbm(d * 2.3 + 4.), n2 = fbm(d * 5.1 - 9.);
    c = vec3(.003, .004, .008);
    c += uNeb1 * pow(n1, 2.4) * uNebAmt * (.35 + band * 1.6);
    c += uNeb2 * pow(n2, 3.0) * uNebAmt * (.2 + band * 1.1);
    c += stars(d) * (1. + band * .8);
    c += uSunCol * (pow(sd, 400.) * 2. * uSunBoost + pow(sd, 40.) * .12 * uSunBoost + smoothstep(1. - .00018 * uSunSize, 1. - .00005 * uSunSize, sd) * 80.);
  } else {
    float h = d.y;
    c = mix(uHor, uTop, pow(clamp(h, 0., 1.), .45));
    c = mix(c, uGnd, smoothstep(0., -.06, h));
    c += uSunCol * (pow(sd, 6.) * .22 + pow(sd, 70.) * .5 + smoothstep(.99965, .99985, sd) * 30.) * (1. - uNight * .0);
    if (h > .005 && uCloud > .01) {
      vec2 q = d.xz / (h + .18) * 1.6 + vec2(uTime * .015, uTime * .006);
      float n = fbm(vec3(q, 3.7));
      float cov = smoothstep(.62 - uCloud * .32, .85 - uCloud * .28, n) * smoothstep(.0, .22, h);
      vec3 cc = mix(vec3(.55, .58, .64), vec3(1.), clamp(dot(d, uSunDir) * .5 + .6, 0., 1.)) * (uSunCol * .6 + .55);
      cc = mix(cc, vec3(.6), uCloud * .35) * mix(1., .13, uNight);
      c = mix(c, cc, cov * .9);
    }
    if (uNight > .02 && h > 0.) c += stars(d) * uNight * smoothstep(0., .15, h) * (1. - uCloud * .7);
  }
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#ffffff') },
        uNeb1: { value: new THREE.Color('#3a4a9a') }, uNeb2: { value: new THREE.Color('#8a3a6a') },
        uMode: { value: 0 }, uNight: { value: 0 }, uCloud: { value: 0.3 }, uTime: { value: 0 }, uNebAmt: { value: 0.5 }, uSunBoost: { value: 1 }, uSunSize: { value: 1 },
      },
    });
    this.geo = new THREE.SphereGeometry(1, 40, 20);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.u = this.material.uniforms;
  }

  /** a second mesh with the same material, for the little scene the reflections are made from */
  twin() { const m = new THREE.Mesh(this.geo, this.material); m.frustumCulled = false; return m; }

  setLook(look, { space = false, sunDir, sunCol, nebula }) {
    const u = this.u;
    u.uTop.value.set(look.top); u.uHor.value.set(look.hor); u.uGnd.value.set(look.gnd);
    u.uSunDir.value.copy(sunDir);
    u.uSunCol.value.set(sunCol || look.col).multiplyScalar(look.int > 0 ? 1 : 0);
    u.uMode.value = space ? 1 : 0;
    u.uNight.value = look.night;
    u.uCloud.value = look.cloud;
    if (nebula) { u.uNeb1.value.set(nebula[0]); u.uNeb2.value.set(nebula[1]); u.uNebAmt.value = nebula[2]; }
    u.uSunBoost.value = look.int > 0 ? 1 : 0;
  }

  update(camera, t) {
    this.mesh.position.copy(camera.position);
    this.u.uTime.value = t;
  }
}
