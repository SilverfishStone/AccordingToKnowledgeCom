// Document model: layers with pixels plus keyframed properties, and the compositor.
import { makeCanvas, uid, clamp, hexToRgb, rgbToHex } from './state.js';

/* Every animatable property. `base` holds the value used when a property has no keyframes. */
export const PROPS = {
  x:          { label: 'Move X',      def: 0,   min: -4000, max: 4000, step: 1, unit: 'px' },
  y:          { label: 'Move Y',      def: 0,   min: -4000, max: 4000, step: 1, unit: 'px' },
  scaleX:     { label: 'Width',       def: 100, min: 0,     max: 1000, step: 1, unit: '%' },
  scaleY:     { label: 'Height',      def: 100, min: 0,     max: 1000, step: 1, unit: '%' },
  rotation:   { label: 'Rotate',      def: 0,   min: -720,  max: 720,  step: 1, unit: '°' },
  flipH:      { label: 'Flip horizontal', def: 0, type: 'bool' },
  flipV:      { label: 'Flip vertical',   def: 0, type: 'bool' },
  opacity:    { label: 'Opacity',     def: 100, min: 0,    max: 100, step: 1, unit: '%' },
  hue:        { label: 'Hue shift',   def: 0,   min: -180, max: 180, step: 1, unit: '°' },
  saturation: { label: 'Saturation',  def: 100, min: 0,    max: 300, step: 1, unit: '%' },
  brightness: { label: 'Brightness',  def: 100, min: 0,    max: 300, step: 1, unit: '%' },
  contrast:   { label: 'Contrast',    def: 100, min: 0,    max: 300, step: 1, unit: '%' },
  grayscale:  { label: 'Grayscale',   def: 0,   min: 0,    max: 100, step: 1, unit: '%' },
  sepia:      { label: 'Sepia',       def: 0,   min: 0,    max: 100, step: 1, unit: '%' },
  invert:     { label: 'Invert',      def: 0,   min: 0,    max: 100, step: 1, unit: '%' },
  blur:       { label: 'Blur',        def: 0,   min: 0,    max: 100, step: 0.5, unit: 'px' },
  tint:       { label: 'Tint amount', def: 0,   min: 0,    max: 100, step: 1, unit: '%' },
  tintColor:  { label: 'Tint colour', def: '#ff3b30', type: 'color' },
  depth:      { label: 'Depth', def: 0, min: -10000, max: 10000, step: 1, unit: '' },
};
export const PROP_GROUPS = [
  ['Transform', ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'flipH', 'flipV', 'depth']],
  ['Appearance', ['opacity', 'hue', 'saturation', 'brightness', 'contrast', 'grayscale', 'sepia', 'invert', 'blur', 'tint', 'tintColor']],
];
export const BLENDS = [
  ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['darken', 'Darken only'], ['lighten', 'Lighten only'], ['color-dodge', 'Dodge'], ['color-burn', 'Burn'],
  ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
  ['lighter', 'Addition'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Colour'], ['luminosity', 'Luminosity'],
];
export const EASES = {
  linear: ['Linear', t => t],
  in:     ['Ease in', t => t * t],
  out:    ['Ease out', t => 1 - (1 - t) * (1 - t)],
  inout:  ['Ease in-out', t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))],
  hold:   ['Hold (no in-between)', () => 0],
};

function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/* Remember and put back a few properties of a layer (used so a drag always starts from the same state). */
export const saveProps = (L, props) => props.map(p => [p, L.base[p], L.tracks[p] ? L.tracks[p].map(k => ({ ...k })) : null]);
export function restoreProps(L, saved) {
  for (const [p, b, tr] of saved) { L.base[p] = b; if (tr) L.tracks[p] = tr.map(k => ({ ...k })); else delete L.tracks[p]; }
}

let scratch = null;     // shared canvas for tinting
let probe = null;       // shared small canvas for bounding boxes

export class Layer {
  constructor(doc, o = {}) {
    this.doc = doc;
    this.id = o.id || uid();
    this.name = o.name || 'Layer';
    // kind 'group' holds child layers and no pixels. A pixel layer may be smaller than the document
    // (e.g. one tube segment); its picture then starts at the document's top-left, before its transform.
    this.kind = o.kind || o.meta?.kind || 'layer';
    const size = this.kind === 'group' ? { w: 1, h: 1 } : (o.size || o.meta?.size || null);
    this.canvas = makeCanvas(size ? size.w : doc.width, size ? size.h : doc.height);
    this.ctx = this.canvas.getContext('2d');
    this.visible = true; this.locked = false; this.alphaLock = false;
    this.blend = 'source-over';
    this.pivot = size && this.kind !== 'group' ? { x: size.w / 2, y: size.h / 2 } : { x: doc.width / 2, y: doc.height / 2 };
    this.children = this.kind === 'group' ? [] : null;
    this.expanded = true;       // groups: shown open in the layers panel / timeline
    this.outline = null;        // { width, color }: a layer gets an outline round its picture; a group, one outline round everything in it
    this.follow = { pos: true, rot: true, size: true };   // which parts of the group's movement this layer follows
    this.tag = '';              // role given by a template (e.g. 'segment-art')
    this.template = null;       // groups made by a template: { type, params } so they can be regenerated
    this.sortByDepth = false;   // groups: draw children by their animated Depth (higher = nearer) instead of stack order
    this.base = {};
    for (const k in PROPS) this.base[k] = PROPS[k].def;
    this.tracks = {};
    this.dirty = true;      // pixels need uploading on next save
    this.rev = 0;           // bumped on every pixel change (thumbnail cache key)
    this._bbox = undefined;
    if (o.meta) this.applyMeta(o.meta);
  }
  get isGroup() { return this.kind === 'group'; }
  touch() { this.dirty = !this.isGroup; this.rev++; this._bbox = undefined; }
  meta() {
    const m = {
      id: this.id, kind: this.kind, name: this.name, visible: this.visible, locked: this.locked, alphaLock: this.alphaLock,
      blend: this.blend, pivot: { ...this.pivot }, base: { ...this.base },
      tracks: JSON.parse(JSON.stringify(this.tracks)),
      outline: this.outline ? { ...this.outline } : null,
    };
    if (!this.follow.pos || !this.follow.rot || !this.follow.size) m.follow = { ...this.follow };
    if (this.tag) m.tag = this.tag;
    if (this.isGroup) {
      m.expanded = this.expanded;
      m.template = this.template ? JSON.parse(JSON.stringify(this.template)) : null;
      m.sortByDepth = this.sortByDepth;
      m.children = this.children.map(c => c.meta());
    } else if (this.canvas.width !== this.doc.width || this.canvas.height !== this.doc.height) {
      m.size = { w: this.canvas.width, h: this.canvas.height };
    }
    return m;
  }
  applyMeta(m) {
    this.name = m.name ?? this.name;
    if (this.isGroup) {
      this.expanded = m.expanded !== false;
      this.template = m.template || null;
      this.sortByDepth = !!m.sortByDepth;
    }
    this.outline = m.outline && m.outline.width > 0 ? { width: +m.outline.width, color: m.outline.color || '#000000' } : null;
    this.follow = { pos: m.follow?.pos !== false, rot: m.follow?.rot !== false, size: m.follow?.size !== false };
    this.tag = m.tag || '';
    this.visible = m.visible !== false; this.locked = !!m.locked; this.alphaLock = !!m.alphaLock;
    this.blend = BLENDS.some(b => b[0] === m.blend) ? m.blend : 'source-over';
    if (m.pivot) this.pivot = { x: +m.pivot.x || 0, y: +m.pivot.y || 0 };
    for (const k in PROPS) this.base[k] = m.base && m.base[k] !== undefined ? m.base[k] : PROPS[k].def;
    this.tracks = {};
    for (const k in m.tracks || {}) {
      if (PROPS[k] && m.tracks[k].length) this.tracks[k] = m.tracks[k].map(key => ({ f: key.f, v: key.v, ease: EASES[key.ease] ? key.ease : 'linear' })).sort((a, b) => a.f - b.f);
    }
  }
  /* value of a property at a frame, interpolating between keyframes */
  value(prop, f) {
    const tr = this.tracks[prop];
    if (!tr || !tr.length) return this.base[prop];
    if (f <= tr[0].f) return tr[0].v;
    const last = tr[tr.length - 1];
    if (f >= last.f) return last.v;
    let i = 0;
    while (tr[i + 1].f <= f) i++;
    const a = tr[i], b = tr[i + 1];
    const type = PROPS[prop].type;
    if (type === 'bool' || a.ease === 'hold') return a.v;
    const t = EASES[a.ease][1]((f - a.f) / (b.f - a.f));
    if (type === 'color') return lerpColor(a.v, b.v, t);
    return a.v + (b.v - a.v) * t;
  }
  keyAt(prop, f) { return this.tracks[prop]?.find(k => k.f === f) || null; }
  setKey(prop, f, v, ease) {
    const tr = (this.tracks[prop] ||= []);
    const k = tr.find(x => x.f === f);
    if (k) { k.v = v; if (ease) k.ease = ease; return; }
    // a new key inherits the easing of the key before it
    let prev = null;
    for (const x of tr) if (x.f < f) prev = x;
    tr.push({ f, v, ease: ease || prev?.ease || 'linear' });
    tr.sort((a, b) => a.f - b.f);
  }
  removeKey(prop, f) {
    const tr = this.tracks[prop];
    if (!tr) return;
    const i = tr.findIndex(k => k.f === f);
    if (i < 0) return;
    const [gone] = tr.splice(i, 1);
    if (!tr.length) { delete this.tracks[prop]; this.base[prop] = gone.v; }
  }
  /* Animate mode: a waypoint at frame f. The first waypoint on a property also pins the current
     starting value at frame 0, so the animation begins from the layer's default look. */
  animSet(prop, f, v) {
    if (!this.tracks[prop]?.length && f !== 0) this.setKey(prop, 0, this.base[prop]);
    this.setKey(prop, f, v);
  }
  /* Paint mode: change the starting look. Existing animation of the property is carried along
     (moved, scaled or shifted by the same amount) instead of being overwritten. */
  setStart(prop, v) {
    const P = PROPS[prop], tr = this.tracks[prop], old = this.value(prop, 0);
    this.base[prop] = v;
    if (!tr?.length) return;
    if (P.type === 'bool') { if (!!v !== !!old) for (const k of tr) k.v = k.v ? 0 : 1; }
    else if (P.type === 'color') tr[0].v = v;
    else if ((prop === 'scaleX' || prop === 'scaleY') && Math.abs(old) > 0.001) for (const k of tr) k.v = clamp(k.v * v / old, P.min, P.max);
    else for (const k of tr) k.v = clamp(k.v + (v - old), P.min, P.max);
  }
  keyFrames() {
    const s = new Set();
    for (const k in this.tracks) for (const key of this.tracks[k]) s.add(key.f);
    return s;
  }
  hasKeyAt(f) { for (const k in this.tracks) if (this.tracks[k].some(key => key.f === f)) return true; return false; }
  /* linear part (rotation, scale, flip) of the transform at a frame */
  linear(f) {
    const sx = this.value('scaleX', f) / 100 * (this.value('flipH', f) ? -1 : 1);
    const sy = this.value('scaleY', f) / 100 * (this.value('flipV', f) ? -1 : 1);
    return new DOMMatrix().rotateSelf(this.value('rotation', f)).scaleSelf(sx, sy);
  }
  /* full layer-space → document-space matrix at a frame */
  matrix(f) {
    const { x: px, y: py } = this.pivot;
    return new DOMMatrix().translateSelf(px + this.value('x', f), py + this.value('y', f)).multiplySelf(this.linear(f)).translateSelf(-px, -py);
  }
  /* this group's transform, keeping only the parts a child follows */
  partialMatrix(f, follow) {
    const { x: px, y: py } = this.pivot;
    const m = new DOMMatrix().translateSelf(px + (follow.pos ? this.value('x', f) : 0), py + (follow.pos ? this.value('y', f) : 0));
    if (follow.rot) m.rotateSelf(this.value('rotation', f));
    if (follow.size) m.scaleSelf(this.value('scaleX', f) / 100 * (this.value('flipH', f) ? -1 : 1), this.value('scaleY', f) / 100 * (this.value('flipV', f) ? -1 : 1));
    return m.translateSelf(-px, -py);
  }
  get followsAll() { return this.follow.pos && this.follow.rot && this.follow.size; }
  isIdentity(f) {
    const m = this.matrix(f);
    return Math.abs(m.a - 1) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.e) < 1e-9 && Math.abs(m.f) < 1e-9;
  }
  filterString(f, scale = 1) {
    let s = '';
    const v = p => this.value(p, f);
    if (v('hue')) s += `hue-rotate(${v('hue')}deg) `;
    if (v('saturation') !== 100) s += `saturate(${v('saturation')}%) `;
    if (v('brightness') !== 100) s += `brightness(${v('brightness')}%) `;
    if (v('contrast') !== 100) s += `contrast(${v('contrast')}%) `;
    if (v('grayscale')) s += `grayscale(${v('grayscale')}%) `;
    if (v('sepia')) s += `sepia(${v('sepia')}%) `;
    if (v('invert')) s += `invert(${v('invert')}%) `;
    if (v('blur') > 0) s += `blur(${v('blur') * scale}px) `;
    return s.trim() || 'none';
  }
  /* bounding box of the painted pixels (approximate to 4px), or null when empty */
  bbox() {
    if (this._bbox !== undefined) return this._bbox;
    const k = 4, w = Math.ceil(this.canvas.width / k), h = Math.ceil(this.canvas.height / k);
    if (!probe || probe.width !== w || probe.height !== h) probe = makeCanvas(w, h, { willReadFrequently: true });
    const pc = probe.getContext('2d', { willReadFrequently: true });
    pc.clearRect(0, 0, w, h);
    pc.drawImage(this.canvas, 0, 0, w, h);
    const d = pc.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    this._bbox = x1 < 0 ? null : {
      x: Math.max(0, x0 * k - 2), y: Math.max(0, y0 * k - 2),
      w: Math.min(this.canvas.width, (x1 + 1) * k + 2) - Math.max(0, x0 * k - 2),
      h: Math.min(this.canvas.height, (y1 + 1) * k + 2) - Math.max(0, y0 * k - 2),
    };
    return this._bbox;
  }
}

/* group rendering scratch canvases, one per nesting depth */
const pool = [];
function poolCanvas(i, w, h) {
  let c = pool[i];
  if (!c || c.width !== w || c.height !== h) c = pool[i] = makeCanvas(w, h);
  return c;
}
/* Draw an outline of the given width around everything painted on canvas T (in place). */
function outlineCanvas(T, width, color, depth) {
  const O = poolCanvas(64 + depth, T.width, T.height), oc = O.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalAlpha = 1; oc.filter = 'none';
  oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, O.width, O.height);
  const rings = width > 4 ? [width, width / 2] : [width];
  for (const r of rings) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; oc.drawImage(T, Math.cos(a) * r, Math.sin(a) * r); }
  oc.globalCompositeOperation = 'source-in';
  oc.fillStyle = color; oc.fillRect(0, 0, O.width, O.height);
  oc.globalCompositeOperation = 'source-over';
  oc.drawImage(T, 0, 0);
  const tc = T.getContext('2d');
  tc.save(); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1; tc.filter = 'none'; tc.globalCompositeOperation = 'copy';
  tc.drawImage(O, 0, 0);
  tc.restore();
}

export class Doc {
  constructor(meta = {}) {
    this.id = meta.id || null;
    this.name = meta.name || 'Untitled';
    this.width = meta.width || 1920;
    this.height = meta.height || 1080;
    this.fps = meta.fps || 24;
    this.frames = meta.frames || 48;
    this.bg = meta.bg || null;          // null = transparent
    this.layers = [];                    // bottom → top; groups hold their own .children (bottom → top)
    this.activeId = meta.activeId || null;
  }
  /* ---------- tree helpers ---------- */
  *walk(list = this.layers) { for (const l of list) { yield l; if (l.children) yield* this.walk(l.children); } }
  all() { return [...this.walk()]; }
  get active() { return this.layer(this.activeId); }
  layer(id) { if (!id) return null; for (const l of this.walk()) if (l.id === id) return l; return null; }
  parentOf(node) { for (const l of this.walk()) if (l.children && l.children.includes(node)) return l; return null; }
  siblings(node) { return this.parentOf(node)?.children || this.layers; }
  ancestors(node) { const out = []; for (let p = this.parentOf(node); p; p = this.parentOf(p)) out.unshift(p); return out; }
  isInside(node, group) { for (let p = this.parentOf(node); p; p = this.parentOf(p)) if (p === group) return true; return false; }
  /* transform of the groups a node sits in (outermost first), and of the node itself in document space */
  /* the group's transform as seen by one of its layers (respects that layer's Follow switches) */
  followMatrix(group, child, f) { return child.followsAll ? group.matrix(f) : group.partialMatrix(f, child.follow); }
  parentMatrix(node, f) {
    const p = this.parentOf(node);
    return p ? this.parentMatrix(p, f).multiply(this.followMatrix(p, node, f)) : new DOMMatrix();
  }
  /* a child's transform inside its group's own space (the group's transform is applied afterwards) */
  childMatrix(group, child, f) {
    return child.followsAll ? child.matrix(f) : group.matrix(f).inverse().multiply(group.partialMatrix(f, child.follow)).multiply(child.matrix(f));
  }
  worldMatrix(node, f) { return this.parentMatrix(node, f).multiply(node.matrix(f)); }
  /* hidden if the node or any group around it is hidden */
  shown(node) { if (!node.visible) return false; for (const a of this.ancestors(node)) if (!a.visible) return false; return true; }
  /* bounds of what a node shows, in its own (pre-transform) space; null when empty */
  bounds(node, f) {
    if (!node.isGroup) return node.bbox();
    let r = null;
    for (const c of node.children) {
      if (!c.visible) continue;
      const b = this.bounds(c, f);
      if (!b) continue;
      const m = this.childMatrix(node, c, f);
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const p = m.transformPoint(new DOMPoint(x, y));
        if (!r) r = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        else { r.x0 = Math.min(r.x0, p.x); r.y0 = Math.min(r.y0, p.y); r.x1 = Math.max(r.x1, p.x); r.y1 = Math.max(r.y1, p.y); }
      }
    }
    return r && { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
  }
  /* rows as shown in the layers panel / timeline: top of the stack first, open groups expanded */
  rows(list = this.layers, depth = 0, out = []) {
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      out.push({ node: l, depth });
      if (l.isGroup && l.expanded) this.rows(l.children, depth + 1, out);
    }
    return out;
  }
  /* changes whenever the pixels of a layer, or of anything inside a group, change (thumbnail cache key) */
  revOf(node) { return node.isGroup ? `${node.rev}(${node.children.map(c => this.revOf(c)).join(',')})` : String(node.rev); }
  addLayer(name, index, meta, list = this.layers, opts = {}) {
    const l = new Layer(this, { name, meta, id: meta?.id, ...opts });
    list.splice(index == null ? list.length : index, 0, l);
    this.activeId = l.id;
    return l;
  }
  addGroup(name, index, list = this.layers) { return this.addLayer(name, index, null, list, { kind: 'group' }); }
  /* Build a whole layer tree from saved metadata (children included). */
  fromMeta(lm) {
    const l = new Layer(this, { name: lm.name, meta: lm, id: lm.id });
    if (l.isGroup) l.children = (lm.children || []).map(c => this.fromMeta(c));
    return l;
  }
  meta() {
    return {
      v: 2, name: this.name, width: this.width, height: this.height, fps: this.fps, frames: this.frames,
      bg: this.bg, activeId: this.activeId, layers: this.layers.map(l => l.meta()),
    };
  }
  /* cheap undo state for everything except pixels: metadata + references to every live layer object */
  snapshot() { return { json: JSON.stringify(this.meta()), objs: new Map(this.all().map(l => [l.id, l])) }; }
  restore(snap) {
    const m = JSON.parse(snap.json);
    const had = new Set(this.all());
    const build = list => list.map(lm => {
      const l = snap.objs.get(lm.id);
      l.applyMeta(lm);
      if (l.isGroup) l.children = build(lm.children || []);
      if (!had.has(l)) l.dirty = !l.isGroup;
      return l;
    });
    this.layers = build(m.layers);
    this.name = m.name; this.fps = m.fps; this.frames = m.frames; this.bg = m.bg; this.activeId = m.activeId;
  }
  /* ---------- compositing ---------- */
  /* Composite every visible layer at a frame into ctx. `scale` renders smaller/larger copies. */
  render(ctx, f, { scale = 1, bg = true, clear = true } = {}) {
    const cv = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    if (clear) ctx.clearRect(0, 0, cv.width, cv.height);
    if (bg && this.bg) { ctx.fillStyle = this.bg; ctx.fillRect(0, 0, cv.width, cv.height); }
    this.drawList(ctx, this.layers, f, scale, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  }
  /* pm: transform (document units) of whatever the list is being drawn inside; parent: the group that owns the list */
  drawList(ctx, list, f, scale, depth, sorted = false, pm = null, parent = null) {
    // depth-sorted groups: far (low Depth) first; equal depths keep their stack order
    const order = sorted ? list.map((l, i) => [l.value('depth', f), i, l]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[2]) : list;
    for (const l of order) this.drawNode(ctx, l, f, scale, depth, pm, parent);
  }
  /* A group with no opacity, blend, colour or outline effect is drawn straight through: its layers are drawn
     directly with the group's transform. Faster, and nothing gets cut off at the picture edge. */
  passThrough(l, f) {
    return !l.outline && l.blend === 'source-over' && l.value('opacity', f) >= 100 && l.value('tint', f) <= 0 && l.filterString(f) === 'none';
  }
  /* Draw one layer, or a whole group combined first so its opacity / blend / effects apply to it as one picture. */
  drawNode(ctx, l, f, scale, depth, pm = null, parent = null) {
    if (!l.visible) return;
    const op = clamp(l.value('opacity', f) / 100, 0, 1);
    if (op <= 0) return;
    const local = parent ? this.childMatrix(parent, l, f) : l.matrix(f);
    const m = pm ? pm.multiply(local) : local;
    if (l.isGroup && this.passThrough(l, f)) { this.drawList(ctx, l.children, f, scale, depth, l.sortByDepth, m, l); return; }
    let src, sw, sh, ox = 0, oy = 0;
    if (l.isGroup) {
      const cv = ctx.canvas, T = poolCanvas(depth, cv.width, cv.height), tc = T.getContext('2d');
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over'; tc.filter = 'none';
      tc.clearRect(0, 0, T.width, T.height);
      this.drawList(tc, l.children, f, scale, depth + 1, l.sortByDepth, null, l);
      if (l.outline) outlineCanvas(T, l.outline.width * scale, l.outline.color, depth);   // one outline round everything inside
      src = T; sw = T.width / scale; sh = T.height / scale;
    } else { src = l.canvas; sw = src.width; sh = src.height; }
    const tint = l.value('tint', f);
    if (tint > 0) {
      if (!scratch || scratch.width !== src.width || scratch.height !== src.height) scratch = makeCanvas(src.width, src.height);
      const sc = scratch.getContext('2d');
      sc.globalCompositeOperation = 'copy'; sc.globalAlpha = 1;
      sc.drawImage(src, 0, 0);
      sc.globalCompositeOperation = 'source-atop'; sc.globalAlpha = clamp(tint / 100, 0, 1);
      sc.fillStyle = l.value('tintColor', f);
      sc.fillRect(0, 0, scratch.width, scratch.height);
      src = scratch;
    }
    if (l.outline && !l.isGroup) {
      {
        // a layer's outline can reach past its own picture: work on a copy with room around it
        const p = Math.ceil(l.outline.width + 2), P = poolCanvas(128 + depth, src.width + 2 * p, src.height + 2 * p), pc = P.getContext('2d');
        pc.setTransform(1, 0, 0, 1, 0, 0); pc.globalAlpha = 1; pc.globalCompositeOperation = 'source-over'; pc.filter = 'none';
        pc.clearRect(0, 0, P.width, P.height);
        pc.drawImage(src, p, p);
        outlineCanvas(P, l.outline.width, l.outline.color, 130 + depth);
        src = P; ox = oy = -p; sw += 2 * p; sh += 2 * p;
      }
    }
    ctx.globalAlpha = op;
    ctx.globalCompositeOperation = l.blend;
    const fs = l.filterString(f, scale);
    if (ctx.filter !== fs) ctx.filter = fs;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(src, ox, oy, sw, sh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  }
}
