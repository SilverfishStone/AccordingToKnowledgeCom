// Drawing, selection and transform tools.
// Pixel tools work in the active layer's own space: the pointer is mapped through the inverse
// of the layer's transform at the current frame, so you can paint on a moved/rotated layer.
import { app, emit, makeCanvas, clamp, hexToRgb, rgbToHex, rectOf, unionRect, requestRender } from './state.js';
import { beginEdit, commitEdit, backupCanvas, beginMeta, commitMeta, metaCmd } from './history.js';
import { setSelection, selectNone, flood, maskToCanvas, CRITERIA } from './selection.js';
import { toast, formDialog } from './ui.js';
import { saveProps, restoreProps } from './doc.js';
import { editProp } from './timeline.js';

/* ---------- shared scratch canvases ---------- */
let strokeC = null, sctx = null, tmpC = null, tctx = null, sDirty = null;
function ensure() {
  const { width: w, height: h } = app.doc;
  if (strokeC && strokeC.width === w && strokeC.height === h) return;
  strokeC = makeCanvas(w, h); sctx = strokeC.getContext('2d');
  tmpC = makeCanvas(w, h); tctx = tmpC.getContext('2d');
  sDirty = null;
}
function resetStroke() {
  ensure();
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
  if (sDirty) sctx.clearRect(sDirty.x, sDirty.y, sDirty.w, sDirty.h);
  sDirty = null;
}
const fullRect = () => ({ x: 0, y: 0, w: app.doc.width, h: app.doc.height });

/* Rebuild rect r of the layer as: pre-edit pixels + the stroke canvas (limited to the selection). */
function compose(L, r, alpha, erase) {
  if (!r || r.w <= 0 || r.h <= 0) return;
  let src = strokeC;
  if (app.sel) {
    tctx.save();
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.beginPath(); tctx.rect(r.x, r.y, r.w, r.h); tctx.clip();
    tctx.globalCompositeOperation = 'source-over'; tctx.globalAlpha = 1;
    tctx.clearRect(r.x, r.y, r.w, r.h);
    tctx.drawImage(strokeC, 0, 0);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(app.sel.mask, 0, 0);
    tctx.restore();
    src = tmpC;
  }
  const c = L.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.clearRect(r.x, r.y, r.w, r.h);
  c.drawImage(backupCanvas(), 0, 0);
  c.globalAlpha = alpha;
  c.globalCompositeOperation = erase ? 'destination-out' : (L.alphaLock ? 'source-atop' : 'source-over');
  c.drawImage(src, 0, 0);
  c.restore();
  L.rev++;
  requestRender();
}

/* The layer a pixel tool may edit, or null (with a hint) when it can't. */
export function target() {
  const L = app.doc.active;
  if (!L) { toast('Select a layer first'); return null; }
  if (L.isGroup) { toast(`"${L.name}" is a group. Pick a layer inside it to draw on.`); return null; }
  if (L.locked) { toast(`"${L.name}" is locked`); return null; }
  if (!app.doc.shown(L)) { toast(`"${L.name}" is hidden`); return null; }
  return L;
}

/* Paint with drawFn(ctx) onto the active layer as one undoable step (honours selection + alpha lock). */
export function paintOnLayer(label, drawFn, { erase = false, alpha = 1, rect = null } = {}) {
  const L = target();
  if (!L) return false;
  beginEdit(L);
  resetStroke();
  sctx.save(); drawFn(sctx); sctx.restore();
  const r = rect || fullRect();
  sDirty = r;
  compose(L, r, alpha, erase);
  commitEdit(L, r, label);
  return true;
}

/* ---------- brush engine ---------- */
function makeStamp(d, hard, color) {
  const n = Math.max(1, Math.ceil(d)), c = makeCanvas(n, n), x = c.getContext('2d'), r = n / 2;
  const [R, G, B] = hexToRgb(color);
  if (d < 3) {
    x.fillStyle = color;
    if (n === 1) x.fillRect(0, 0, 1, 1); else { x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill(); }
    return c;
  }
  const inner = clamp(Math.min(hard, 1 - 1.5 / r), 0, 0.999);
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, `rgba(${R},${G},${B},1)`); g.addColorStop(inner, `rgba(${R},${G},${B},1)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  return c;
}

function brushTool({ erase = false, pencil = false }) {
  let L, stamp, last, lastPr, carry, dirty, raf = 0, size;
  const W = () => app.doc.width, H = () => app.doc.height;
  const dab = (x, y, pr, pen) => {
    const d = Math.max(1, size * (app.opt.pressure && pen && !pencil ? 0.2 + 0.8 * pr : 1));
    if (pencil) { x = Math.round(x - d / 2) + d / 2; y = Math.round(y - d / 2) + d / 2; }
    sctx.drawImage(stamp, x - d / 2, y - d / 2, d, d);
    dirty = unionRect(dirty, rectOf(x - d / 2, y - d / 2, x + d / 2, y + d / 2, 1, W(), H()));
  };
  const flush = () => {
    raf = 0;
    if (!dirty) return;
    sDirty = dirty;
    compose(L, dirty, app.opt.opacity / 100, erase);
  };
  return {
    cursorSize: true,
    down(p) {
      L = target();
      if (!L) return false;
      beginEdit(L);
      resetStroke();
      size = pencil ? Math.max(1, Math.round(app.opt.size)) : app.opt.size;
      stamp = makeStamp(size, pencil ? 1 : app.opt.hardness / 100, erase ? '#000000' : app.fg);
      sctx.globalAlpha = pencil ? 1 : app.opt.flow / 100;
      sctx.imageSmoothingEnabled = !pencil;
      last = p.local; lastPr = p.pressure; carry = 0; dirty = null;
      dab(last.x, last.y, lastPr, p.pen);
      flush();
    },
    move(p) {
      const pt = p.local, dx = pt.x - last.x, dy = pt.y - last.y, dist = Math.hypot(dx, dy);
      if (dist === 0) return;
      const step = Math.max(0.5, size * (pencil ? 0.25 : 0.1));
      let t = step - carry;
      while (t <= dist) {
        const u = t / dist;
        dab(last.x + dx * u, last.y + dy * u, lastPr + (p.pressure - lastPr) * u, p.pen);
        t += step;
      }
      carry = dist - (t - step);
      last = pt; lastPr = p.pressure;
      if (!raf) raf = requestAnimationFrame(flush);
    },
    up() {
      if (raf) cancelAnimationFrame(raf);
      flush();
      sctx.globalAlpha = 1; sctx.imageSmoothingEnabled = true;
      commitEdit(L, dirty, erase ? 'Erase' : pencil ? 'Pencil' : 'Paint');
    },
  };
}

/* ---------- shapes ---------- */
function shapeTool(kind) {
  let L, a, prev;
  const draw = (b, e) => {
    let { x: x1, y: y1 } = b;
    if (e.shiftKey) {
      if (kind === 'line') {
        const ang = Math.round(Math.atan2(y1 - a.y, x1 - a.x) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(x1 - a.x, y1 - a.y);
        x1 = a.x + Math.cos(ang) * len; y1 = a.y + Math.sin(ang) * len;
      } else {
        const s = Math.max(Math.abs(x1 - a.x), Math.abs(y1 - a.y));
        x1 = a.x + Math.sign(x1 - a.x || 1) * s; y1 = a.y + Math.sign(y1 - a.y || 1) * s;
      }
    }
    const lw = app.opt.size;
    if (prev) sctx.clearRect(prev.x, prev.y, prev.w, prev.h);
    sctx.save();
    sctx.strokeStyle = sctx.fillStyle = app.fg;
    sctx.lineWidth = lw; sctx.lineCap = 'round'; sctx.lineJoin = 'round';
    sctx.beginPath();
    if (kind === 'line') { sctx.moveTo(a.x, a.y); sctx.lineTo(x1, y1); }
    else if (kind === 'rect') sctx.rect(Math.min(a.x, x1), Math.min(a.y, y1), Math.abs(x1 - a.x), Math.abs(y1 - a.y));
    else sctx.ellipse((a.x + x1) / 2, (a.y + y1) / 2, Math.abs(x1 - a.x) / 2, Math.abs(y1 - a.y) / 2, 0, 0, Math.PI * 2);
    if (kind !== 'line' && app.opt.fillShape) sctx.fill(); else sctx.stroke();
    sctx.restore();
    const r = rectOf(a.x, a.y, x1, y1, lw / 2 + 2, app.doc.width, app.doc.height);
    compose(L, unionRect(prev, r), app.opt.opacity / 100, false);
    prev = r; sDirty = r;
  };
  return {
    down(p, e) { L = target(); if (!L) return false; beginEdit(L); resetStroke(); a = p.local; prev = null; draw(p.local, e); },
    move(p, e) { draw(p.local, e); },
    up(p, e) { draw(p.local, e); commitEdit(L, prev, kind === 'line' ? 'Line' : kind === 'rect' ? 'Rectangle' : 'Ellipse'); },
  };
}

const gradientTool = {
  _L: null, _a: null,
  _draw(b) {
    const a = this._a, [R, G, B] = hexToRgb(app.fg);
    sctx.clearRect(0, 0, strokeC.width, strokeC.height);
    const g = app.opt.gradType === 'radial'
      ? sctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)))
      : sctx.createLinearGradient(a.x, a.y, b.x + (a.x === b.x && a.y === b.y ? 1 : 0), b.y);
    g.addColorStop(0, app.fg);
    g.addColorStop(1, app.opt.gradTo === 'transparent' ? `rgba(${R},${G},${B},0)` : app.bg);
    sctx.fillStyle = g; sctx.fillRect(0, 0, strokeC.width, strokeC.height);
    sDirty = fullRect();
    compose(this._L, sDirty, app.opt.opacity / 100, false);
  },
  down(p) { this._L = target(); if (!this._L) return false; beginEdit(this._L); resetStroke(); this._a = p.local; },
  move(p) { this._draw(p.local); },
  up(p) {
    if (Math.hypot(p.local.x - this._a.x, p.local.y - this._a.y) < 2) { compose(this._L, fullRect(), 0, false); toast('Drag to set the gradient direction'); return; }
    this._draw(p.local); commitEdit(this._L, null, 'Gradient');
  },
};

/* ---------- fill + colour picker ---------- */
function sampleSource(L) {
  const c = app.opt.sampleMerged ? app.stage : L.canvas;
  return c.getContext('2d').getImageData(0, 0, c.width, c.height);
}
const inside = (pt, L = app.doc.active) => pt.x >= 0 && pt.y >= 0 && pt.x < L.canvas.width && pt.y < L.canvas.height;

const fillTool = {
  down(p) {
    const L = target();
    if (!L) return false;
    if (app.opt.fillArea === 'selection') {
      paintOnLayer('Fill', c => { c.fillStyle = app.fg; c.fillRect(0, 0, app.doc.width, app.doc.height); }, { alpha: app.opt.opacity / 100 });
      return false;
    }
    if (!inside(p.local)) return false;
    const img = sampleSource(L);
    const res = flood(img, Math.floor(p.local.x), Math.floor(p.local.y), app.opt.tolerance, app.opt.fillArea === 'connected', app.opt.criterion);
    if (!res.bounds) return false;
    beginEdit(L);
    resetStroke();
    sctx.drawImage(maskToCanvas(res.mask, img.width, img.height, hexToRgb(app.fg)), 0, 0);
    sDirty = res.bounds;
    compose(L, res.bounds, app.opt.opacity / 100, false);
    commitEdit(L, res.bounds, 'Fill');
    return false;
  },
};

const pickerTool = {
  _pick(p, e) {
    if (!inside(p.doc)) return;
    const d = app.stage.getContext('2d').getImageData(Math.floor(p.doc.x), Math.floor(p.doc.y), 1, 1).data;
    if (!d[3]) return;
    const hex = rgbToHex(d[0], d[1], d[2]);
    if (e.altKey) app.bg = hex; else app.fg = hex;
    emit('color');
  },
  down(p, e) { this._pick(p, e); }, move(p, e) { this._pick(p, e); }, up() {},
};

/* ---------- text ---------- */
const textTool = {
  down(p) {
    const at = p.doc;
    formDialog('Add text', [
      { key: 'text', label: 'Text', type: 'textarea', value: '' },
      { key: 'size', label: 'Size (px)', type: 'number', value: app.opt.fontSize, min: 4, max: 1000 },
      { key: 'font', label: 'Font', type: 'select', value: app.opt.font, options: ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS', 'Segoe UI', 'Segoe Script'].map(f => [f, f]) },
      { key: 'bold', label: 'Bold', type: 'checkbox', value: app.opt.bold },
      { key: 'italic', label: 'Italic', type: 'checkbox', value: app.opt.italic },
    ], { okLabel: 'Add as new layer' }).then(v => {
      if (!v || !v.text.trim()) return;
      Object.assign(app.opt, { fontSize: v.size, font: v.font, bold: v.bold, italic: v.italic });
      metaCmd('Add text', () => {
        const doc = app.doc, A = doc.active, list = A ? doc.siblings(A) : doc.layers, idx = A ? list.indexOf(A) + 1 : list.length;
        const L = doc.addLayer(v.text.trim().split('\n')[0].slice(0, 24), idx, null, list);
        const c = L.ctx;
        c.font = `${v.italic ? 'italic ' : ''}${v.bold ? 'bold ' : ''}${v.size}px "${v.font}"`;
        c.fillStyle = app.fg; c.textBaseline = 'top';
        v.text.split('\n').forEach((line, i) => c.fillText(line, at.x, at.y + i * v.size * 1.2));
        L.touch();
        const b = L.bbox();
        if (b) L.pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      });
    });
    return false;
  },
};

/* ---------- selections ---------- */
/* Modifier keys override the Mode option: Shift add, Alt subtract, Ctrl+Shift intersect. */
const selMode = e => ((e.ctrlKey || e.metaKey) && e.shiftKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : app.opt.selMode);
function dragSelect(kind) {
  let a, b, pts;
  return {
    down(p) { a = b = p.local; pts = [p.local]; },
    move(p) { b = p.local; pts.push(p.local); emit('overlay'); },
    up(p, e) {
      const mode = selMode(e);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (kind === 'lasso' ? pts.length < 3 : (w < 2 || h < 2)) { if (mode === 'replace') selectNone(); a = null; return; }
      const snap = [...pts], A = a, B = b;
      setSelection(c => {
        c.beginPath();
        if (kind === 'rect') c.rect(Math.round(Math.min(A.x, B.x)), Math.round(Math.min(A.y, B.y)), Math.round(w), Math.round(h));
        else if (kind === 'ellipse') c.ellipse((A.x + B.x) / 2, (A.y + B.y) / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        else { c.moveTo(snap[0].x, snap[0].y); for (const q of snap) c.lineTo(q.x, q.y); c.closePath(); }
        c.fill();
      }, mode);
      a = null;
    },
    overlay(o) {
      if (!a) return;
      let poly;
      if (kind === 'rect') poly = [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]];
      else if (kind === 'ellipse') {
        poly = [];
        for (let i = 0; i < 64; i++) { const t = i / 64 * Math.PI * 2; poly.push([(a.x + b.x) / 2 + Math.cos(t) * (b.x - a.x) / 2, (a.y + b.y) / 2 + Math.sin(t) * (b.y - a.y) / 2]); }
      } else poly = pts.map(q => [q.x, q.y]);
      o.beginPath();
      poly.forEach(([x, y], i) => { const s = app.l2s(x, y); if (i) o.lineTo(s.x, s.y); else o.moveTo(s.x, s.y); });
      o.closePath();
      o.lineWidth = 1; o.strokeStyle = '#000'; o.setLineDash([]); o.stroke();
      o.strokeStyle = '#fff'; o.setLineDash([4, 4]); o.stroke(); o.setLineDash([]);
    },
  };
}
/* Fuzzy select (connected region) and select by colour (every similar pixel).
   Click to select; keep the button down and drag left/right to lower/raise the threshold live. */
function regionSelect(contiguous) {
  let s = null, raf = 0;
  const apply = () => {
    raf = 0;
    const res = flood(s.img, s.x, s.y, s.tol, contiguous, app.opt.criterion);
    const m = maskToCanvas(res.mask, s.img.width, s.img.height);
    setSelection(c => c.drawImage(m, 0, 0), s.mode, s.base);
    emit('status', `Threshold ${s.tol} · drag left/right to change`);
  };
  return {
    down(p, e) {
      const L = app.doc.active;
      if (!L) { toast('Select a layer first'); return false; }
      if (L.isGroup) { toast('Pick a layer inside the group to select from'); return false; }
      if (!inside(p.local)) return false;
      s = { img: sampleSource(L), x: Math.floor(p.local.x), y: Math.floor(p.local.y), tol: app.opt.tolerance, t0: app.opt.tolerance,
        sx: p.sx, mode: selMode(e), base: app.sel?.mask || null };
      apply();
    },
    move(p) {
      const t = clamp(Math.round(s.t0 + (p.sx - s.sx) / 2), 0, 255);
      if (t !== s.tol) { s.tol = t; if (!raf) raf = requestAnimationFrame(apply); }
    },
    up() {
      if (raf) { cancelAnimationFrame(raf); apply(); }
      if (s.tol !== s.t0) { app.opt.tolerance = s.tol; emit('tool'); }
      emit('status', '');
      s = null;
    },
  };
}

/* ---------- move / scale / rotate (writes animated properties, never pixels) ---------- */
const round1 = v => Math.round(v * 10) / 10;
function gizmo(L) {
  const f = app.frame, m = app.doc.worldMatrix(L, f);
  const b = app.doc.bounds(L, f) || { x: 0, y: 0, w: L.canvas.width, h: L.canvas.height };
  const pt = (x, y) => { const q = m.transformPoint(new DOMPoint(x, y)); return app.d2s(q.x, q.y); };
  const corners = [pt(b.x, b.y), pt(b.x + b.w, b.y), pt(b.x + b.w, b.y + b.h), pt(b.x, b.y + b.h)];
  const pivot = pt(L.pivot.x, L.pivot.y);
  const top = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
  const ctr = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
  let ux = top.x - ctr.x, uy = top.y - ctr.y;
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  return { corners, pivot, top, rot: { x: top.x + ux * 28, y: top.y + uy * 28 } };
}
const moveTool = {
  _s: null,
  down(p, e) {
    const L = app.doc.active;
    if (!L) { toast('Select a layer first'); return false; }
    if (L.locked) { toast(`"${L.name}" is locked`); return false; }
    const f = app.frame, g = gizmo(L), sp = app.d2s(p.doc.x, p.doc.y);
    const near = q => Math.hypot(q.x - sp.x, q.y - sp.y) < 11;
    let mode = 'move';
    if (near(g.pivot)) mode = 'pivot';
    else if (near(g.rot)) mode = 'rotate';
    else if (g.corners.some(near)) mode = 'scale';
    const v = k => L.value(k, f);
    const pinv = app.doc.parentMatrix(L, f).inverse();       // document → the space of the group the layer is in
    const toParent = q => { const r = pinv.transformPoint(new DOMPoint(q.x, q.y)); return { x: r.x, y: r.y }; };
    this._s = {
      L, mode, before: beginMeta(), start: toParent(p.doc), toParent,
      x: v('x'), y: v('y'), sx: v('scaleX'), sy: v('scaleY'), rot: v('rotation'),
      pivot: { ...L.pivot }, lin: L.linear(f), saved: saveProps(L, ['x', 'y', 'scaleX', 'scaleY', 'rotation']),
      keysX: JSON.stringify(L.tracks.x || null), keysY: JSON.stringify(L.tracks.y || null), baseX: L.base.x, baseY: L.base.y,
    };
  },
  move(p, e) {
    const s = this._s;
    if (!s) return;
    const L = s.L, pd = s.toParent(p.doc);
    if (s.mode !== 'pivot') restoreProps(L, s.saved);               // every move starts from the pre-drag state
    const dx = pd.x - s.start.x, dy = pd.y - s.start.y;
    const P = { x: s.pivot.x + s.x, y: s.pivot.y + s.y };           // pivot in document space
    if (s.mode === 'move') {
      let mx = dx, my = dy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
      editProp(L, 'x', round1(s.x + mx)); editProp(L, 'y', round1(s.y + my));
    } else if (s.mode === 'rotate') {
      let ang = s.rot + (Math.atan2(pd.y - P.y, pd.x - P.x) - Math.atan2(s.start.y - P.y, s.start.x - P.x)) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      editProp(L, 'rotation', round1(ang));
    } else if (s.mode === 'scale') {
      const inv = new DOMMatrix().rotateSelf(-s.rot);
      const q0 = inv.transformPoint(new DOMPoint(s.start.x - P.x, s.start.y - P.y));
      const q = inv.transformPoint(new DOMPoint(pd.x - P.x, pd.y - P.y));
      let kx = Math.abs(q0.x) > 2 ? q.x / q0.x : 1, ky = Math.abs(q0.y) > 2 ? q.y / q0.y : 1;
      if (!e.shiftKey) { const k = Math.hypot(q.x, q.y) / (Math.hypot(q0.x, q0.y) || 1); kx = ky = k; }   // uniform unless Shift
      editProp(L, 'scaleX', round1(clamp(s.sx * Math.max(0, kx), 0, 1000)));
      editProp(L, 'scaleY', round1(clamp(s.sy * Math.max(0, ky), 0, 1000)));
    } else if (s.mode === 'pivot') {
      // move the pivot without moving the picture: shift x/y (and their keys) to compensate
      const d = s.lin.inverse().transformPoint(new DOMPoint(dx, dy));
      L.pivot = { x: round1(s.pivot.x + d.x), y: round1(s.pivot.y + d.y) };
      const ox = dx - d.x, oy = dy - d.y;
      L.base.x = round1(s.baseX + ox); L.base.y = round1(s.baseY + oy);
      const kx = JSON.parse(s.keysX), ky = JSON.parse(s.keysY);
      if (kx) L.tracks.x = kx.map(k => ({ ...k, v: round1(k.v + ox) }));
      if (ky) L.tracks.y = ky.map(k => ({ ...k, v: round1(k.v + oy) }));
    }
    emit('props'); requestRender();
  },
  up() {
    const s = this._s;
    if (!s) return;
    this._s = null;
    commitMeta(s.before, s.mode === 'pivot' ? 'Move pivot' : s.mode === 'rotate' ? 'Rotate layer' : s.mode === 'scale' ? 'Scale layer' : 'Move layer');
  },
  overlay(o) {
    const L = app.doc.active;
    if (!L) return;
    const g = gizmo(L);
    o.lineWidth = 1; o.setLineDash([]);
    o.beginPath(); g.corners.forEach((c, i) => (i ? o.lineTo(c.x, c.y) : o.moveTo(c.x, c.y))); o.closePath();
    o.moveTo(g.top.x, g.top.y); o.lineTo(g.rot.x, g.rot.y);
    o.strokeStyle = '#000a'; o.lineWidth = 3; o.stroke();
    o.strokeStyle = '#5aa2ff'; o.lineWidth = 1.5; o.stroke();
    o.fillStyle = '#fff'; o.strokeStyle = '#1a5fc4';
    for (const c of g.corners) { o.beginPath(); o.rect(c.x - 5, c.y - 5, 10, 10); o.fill(); o.stroke(); }
    o.beginPath(); o.arc(g.rot.x, g.rot.y, 6, 0, Math.PI * 2); o.fill(); o.stroke();
    o.beginPath(); o.arc(g.pivot.x, g.pivot.y, 6, 0, Math.PI * 2);
    o.moveTo(g.pivot.x - 10, g.pivot.y); o.lineTo(g.pivot.x + 10, g.pivot.y); o.moveTo(g.pivot.x, g.pivot.y - 10); o.lineTo(g.pivot.x, g.pivot.y + 10);
    o.strokeStyle = '#000'; o.lineWidth = 3; o.stroke(); o.strokeStyle = '#ffd60a'; o.lineWidth = 1.5; o.stroke();
  },
};

/* ---------- registry ---------- */
const SEL_HINT = 'Shift = add · Alt = subtract · Ctrl+Shift = intersect';
const stroke = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const dashed = d => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2.500"/>`;
const solid = d => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`;

export const TOOLS = [
  { id: 'move', label: 'Move / scale / rotate layer', key: 'v', opts: [], ownsBounds: true, icon: solid('M12 2l3 3h-2v6h6V9l3 3-3 3v-2h-6v6h2l-3 3-3-3h2v-6H5v2l-3-3 3-3v2h6V5H9z'), ...moveTool,
    hint: 'Drag to move · corners scale (Shift = stretch) · round handle rotates · yellow cross is the pivot' },
  { id: 'brush', label: 'Paintbrush', key: 'b', opts: ['size', 'hardness', 'opacity', 'flow', 'pressure'], icon: solid('M20 3c-2 0-9 6-11 10l2 2c4-2 10-9 10-11 0-.6-.4-1-1-1zM7 14c-2 0-3 1.500-3 3 0 1.500-1 2-2 2 1 1.500 3 2 4 2 2 0 4-1.500 4-4z'), ...brushTool({}) },
  { id: 'pencil', label: 'Pencil (hard edge)', key: 'n', opts: ['size', 'opacity'], icon: solid('M3 17.250V21h3.750L17.800 9.940l-3.750-3.750zM20.700 7c.4-.4.4-1 0-1.400l-2.300-2.300a1 1 0 00-1.400 0l-1.800 1.800 3.750 3.750z'), ...brushTool({ pencil: true }) },
  { id: 'eraser', label: 'Eraser', key: 'e', opts: ['size', 'hardness', 'opacity', 'flow', 'pressure'], icon: solid('M15.500 3l5.500 5.500-9 9H7L3 13.500zM3 20h18v2H3z'), ...brushTool({ erase: true }) },
  { id: 'fill', label: 'Bucket fill', key: 'g', opts: ['fillArea', 'tolerance', 'criterion', 'opacity', 'sampleMerged'], icon: solid('M5 11l7-7 7 7-7 7zM19 15s2 2.500 2 4a2 2 0 01-4 0c0-1.500 2-4 2-4z'), ...fillTool },
  { id: 'gradient', label: 'Gradient', key: 'd', opts: ['gradType', 'gradTo', 'opacity'], icon: solid('M3 5h18v14H3zM5 7v10L19 7z'), ...gradientTool },
  { id: 'picker', label: 'Colour picker (Alt = background)', key: 'i', opts: [], icon: solid('M20 4a2.800 2.800 0 00-4 0l-3 3-1-1-2 2 1 1-7 7v4h4l7-7 1 1 2-2-1-1 3-3a2.800 2.800 0 000-4z'), ...pickerTool },
  { id: 'line', label: 'Line', key: 'l', opts: ['size', 'opacity'], icon: stroke('M4 20L20 4'), ...shapeTool('line') },
  { id: 'rect', label: 'Rectangle', key: 'u', opts: ['size', 'opacity', 'fillShape'], icon: stroke('M4 6h16v12H4z'), ...shapeTool('rect') },
  { id: 'ellipse', label: 'Ellipse', key: 'o', opts: ['size', 'opacity', 'fillShape'], icon: stroke('M12 5c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7z'), ...shapeTool('ellipse') },
  { id: 'text', label: 'Text (creates a new layer)', key: 't', opts: [], icon: solid('M5 4h14v3h-2V6h-4v12h2v2H9v-2h2V6H7v1H5z'), ...textTool },
  { id: 'selRect', label: 'Rectangle select', key: 'r', opts: ['selMode'], icon: dashed('M4 6h16v12H4z'), ...dragSelect('rect'), hint: SEL_HINT },
  { id: 'selEllipse', label: 'Ellipse select', key: 'q', opts: ['selMode'], icon: dashed('M12 5c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7z'), ...dragSelect('ellipse'), hint: SEL_HINT },
  { id: 'lasso', label: 'Free select (lasso)', key: 'f', opts: ['selMode'], icon: stroke('M12 4c5 0 9 2.500 9 6s-4 6-9 6c-1 0-2-.1-3-.3C8 17.500 7 19 5 20'), ...dragSelect('lasso'), hint: SEL_HINT },
  { id: 'wand', label: 'Fuzzy select (connected region)', key: 'w', opts: ['selMode', 'tolerance', 'criterion', 'sampleMerged'], icon: solid('M4 20L15 9l1 1L5 21zM17 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z'), ...regionSelect(true),
    hint: 'Selects the touching area of similar colour · hold and drag left/right to change the threshold' },
  { id: 'byColor', label: 'Select by colour', key: 'c', opts: ['selMode', 'tolerance', 'criterion', 'sampleMerged'], icon: solid('M12 3a9 9 0 100 18c1 0 1.500-.7 1.500-1.500 0-1-.8-1.300-.8-2.200 0-.8.700-1.300 1.500-1.300H16a5 5 0 005-5c0-4.400-4-8-9-8zM7 12a1.500 1.500 0 110-3 1.500 1.500 0 010 3zm3-4a1.500 1.500 0 110-3 1.500 1.500 0 010 3zm5 0a1.500 1.500 0 110-3 1.500 1.500 0 010 3z'), ...regionSelect(false),
    hint: 'Selects every pixel of similar colour on the layer · hold and drag left/right to change the threshold' },
];

export const OPTS = {
  size: { label: 'Size', type: 'range', min: 1, max: 400 },
  hardness: { label: 'Hardness', type: 'range', min: 0, max: 100 },
  opacity: { label: 'Opacity', type: 'range', min: 1, max: 100 },
  flow: { label: 'Flow', type: 'range', min: 1, max: 100 },
  tolerance: { label: 'Threshold', type: 'range', min: 0, max: 255, title: 'How different a colour may be and still count as the same (0 = exact match)' },
  criterion: { label: 'Compare by', type: 'select', options: CRITERIA, title: 'Which part of the colour is compared against the threshold' },
  selMode: { label: 'Mode', type: 'select', options: [['replace', 'Replace'], ['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']] },
  fillArea: { label: 'Fill', type: 'select', options: [['connected', 'Connected region'], ['similar', 'All similar colours'], ['selection', 'Whole selection']] },
  pressure: { label: 'Pen pressure', type: 'checkbox' },
  sampleMerged: { label: 'Sample all layers', type: 'checkbox' },
  fillShape: { label: 'Filled', type: 'checkbox' },
  gradType: { label: 'Shape', type: 'select', options: [['linear', 'Linear'], ['radial', 'Radial']] },
  gradTo: { label: 'Colours', type: 'select', options: [['bg', 'Foreground → background'], ['transparent', 'Foreground → transparent']] },
};

export function setTool(id) {
  const t = TOOLS.find(x => x.id === id);
  if (!t) return;
  app.tool = t;
  emit('tool');
}
