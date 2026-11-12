// Transform tool: move, resize (corners and edges), rotate and flip the selected layer or group.
//   Movement: changes the layer's position / size / rotation properties (keyframes in Animate mode).
//   Pixels:   permanently resizes / rotates the drawing itself; Apply (Enter) or Cancel (Esc).
import { app, on, emit, el, clamp, requestRender, changed } from './state.js';
import { beginMeta, commitMeta, metaCmd, beginEdit, commitEdit, revertEdit, backupCanvas } from './history.js';
import { saveProps, restoreProps, PROPS } from './doc.js';
import { editProp } from './timeline.js';
import { target } from './tools.js';
import { toast } from './ui.js';

const PROPS_T = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'flipH', 'flipV'];
const r1 = v => Math.round(v * 10) / 10;
const RAD = Math.PI / 180;
let drag = null;        // the current drag
let pix = null;         // pending pixel transform: { L, b, c, tx, ty, sx, sy, rot }
const fields = {};      // option-bar inputs

const mode = () => app.opt.tfMode || 'move';
const docPt = p => new DOMPoint(p.x, p.y);

/* ---------- pixel transform ---------- */
function pixMatrix(P) {
  return new DOMMatrix().translateSelf(P.c.x + P.tx, P.c.y + P.ty).rotateSelf(P.rot).scaleSelf(P.sx, P.sy).translateSelf(-P.c.x, -P.c.y);
}
function startPix() {
  if (pix) return pix;
  const L = target();
  if (!L) return null;
  const b = L.bbox();
  if (!b) { toast('This layer is empty'); return null; }
  beginEdit(L);
  pix = { L, b, c: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 };
  return pix;
}
function previewPix() {
  const P = pix, c = P.L.ctx, m = pixMatrix(P);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.clearRect(0, 0, P.L.canvas.width, P.L.canvas.height);
  c.imageSmoothingQuality = 'high';
  c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  c.drawImage(backupCanvas(), 0, 0);
  c.restore();
  P.L.rev++;
  requestRender(); emit('overlay'); sync();
}
export function applyPixels() {
  if (!pix) return;
  const L = pix.L, same = pix.tx === 0 && pix.ty === 0 && pix.sx === 1 && pix.sy === 1 && pix.rot === 0;
  pix = null;
  if (same) { revertEdit(L); requestRender(); sync(); return; }
  commitEdit(L, null, 'Transform pixels');
  changed(); sync();
}
export function cancelPixels() {
  if (!pix) return;
  revertEdit(pix.L);
  pix = null;
  requestRender(); emit('overlay'); sync();
}

/* ---------- handles ---------- */
/* Box corners/edges/handles on screen, plus the matrices needed to turn the pointer into the right space. */
function gizmo() {
  const d = app.doc, L = pix ? pix.L : d.active;
  if (!L) return null;
  const f = app.frame, W = d.worldMatrix(L, f);
  const b = pix ? pix.b : (d.bounds(L, f) || { x: 0, y: 0, w: L.canvas.width, h: L.canvas.height });
  const m = pix ? W.multiply(pixMatrix(pix)) : W;
  const S = (x, y) => { const q = m.transformPoint(new DOMPoint(x, y)); return app.d2s(q.x, q.y); };
  const { x, y, w, h } = b;
  const corners = [S(x, y), S(x + w, y), S(x + w, y + h), S(x, y + h)];
  const edges = [S(x + w / 2, y), S(x + w, y + h / 2), S(x + w / 2, y + h), S(x, y + h / 2)];
  const ctr = S(x + w / 2, y + h / 2);
  let ux = edges[0].x - ctr.x, uy = edges[0].y - ctr.y;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const rot = { x: edges[0].x + ux * 30, y: edges[0].y + uy * 30 };
  const pivot = pix ? ctr : S(L.pivot.x, L.pivot.y);
  return { L, corners, edges, rot, pivot, ctr };
}
function inside(poly, p) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}

export const transformTool = {
  id: 'transform', label: 'Transform: move, resize, rotate, flip', key: 'a', opts: [], ownsBounds: true,
  icon: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="8.500" y="8.500" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.500" stroke-dasharray="2 1.500"/>',
  hint: 'Corners resize (Shift = stretch freely) · edges stretch one way · round handle rotates · yellow cross = pivot',

  down(p, e) {
    const d = app.doc, L = pix ? pix.L : d.active;
    if (!L) { toast('Select a layer first'); return false; }
    if (L.locked) { toast(`"${L.name}" is locked`); return false; }
    const g = gizmo(), sp = app.d2s(p.doc.x, p.doc.y), near = q => Math.hypot(q.x - sp.x, q.y - sp.y) < 10;
    let what = 'move', idx = -1;
    if (mode() === 'move' && near(g.pivot)) what = 'pivot';
    else if (near(g.rot)) what = 'rotate';
    else if ((idx = g.corners.findIndex(near)) >= 0) what = 'corner';
    else if ((idx = g.edges.findIndex(near)) >= 0) what = 'edge';
    else if (!inside(g.corners, sp) && mode() === 'pixels' && pix) what = 'rotate';      // outside the box rotates the pixels
    if (mode() === 'pixels') {
      const P = startPix();
      if (!P) return false;
      const inv = d.worldMatrix(L, app.frame).inverse(), toL = q => { const r = inv.transformPoint(docPt(q)); return { x: r.x, y: r.y }; };
      drag = { kind: 'pixels', what, idx, toL, start: toL(p.doc), s: { ...P } };
      return;
    }
    const f = app.frame, pinv = d.parentMatrix(L, f).inverse(), toP = q => { const r = pinv.transformPoint(docPt(q)); return { x: r.x, y: r.y }; };
    const v = k => L.value(k, f);
    const before = beginMeta();
    // a layer that has never been resized or turned: put its pivot in the middle of the drawing first, so resizing and
    // rotating happen round the drawing rather than round the middle of the canvas (looks exactly the same)
    const plain = ['scaleX', 'scaleY', 'rotation', 'flipH', 'flipV'].every(k => !L.tracks[k] && L.base[k] === PROPS[k].def);
    const bb = d.bounds(L, f);
    if (plain && bb && what !== 'pivot') {
      L.pivot = { x: r1(bb.x + bb.w / 2), y: r1(bb.y + bb.h / 2) };
      // nothing to compensate: with no rotation or scale the pivot doesn't change the picture
    }
    drag = {
      kind: 'move', what, idx, L, toP, start: toP(p.doc), before,
      x: v('x'), y: v('y'), sx: v('scaleX'), sy: v('scaleY'), rot: v('rotation'), pivot: { ...L.pivot }, lin: L.linear(f),
      saved: saveProps(L, PROPS_T), keysX: JSON.stringify(L.tracks.x || null), keysY: JSON.stringify(L.tracks.y || null), baseX: L.base.x, baseY: L.base.y,
    };
  },

  move(p, e) {
    if (!drag) return;
    if (drag.kind === 'pixels') return movePixels(p, e);
    const s = drag, L = s.L, q = s.toP(p.doc), dx = q.x - s.start.x, dy = q.y - s.start.y;
    if (s.what !== 'pivot') restoreProps(L, s.saved);
    const P = { x: s.pivot.x + s.x, y: s.pivot.y + s.y };
    if (s.what === 'move') {
      let mx = dx, my = dy;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) my = 0; else mx = 0; }
      editProp(L, 'x', r1(s.x + mx)); editProp(L, 'y', r1(s.y + my));
    } else if (s.what === 'rotate') {
      let a = s.rot + (Math.atan2(q.y - P.y, q.x - P.x) - Math.atan2(s.start.y - P.y, s.start.x - P.x)) / RAD;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      editProp(L, 'rotation', r1(a));
    } else if (s.what === 'corner' || s.what === 'edge') {
      const inv = new DOMMatrix().rotateSelf(-s.rot);
      const q0 = inv.transformPoint(new DOMPoint(s.start.x - P.x, s.start.y - P.y)), q1 = inv.transformPoint(new DOMPoint(q.x - P.x, q.y - P.y));
      let kx = Math.abs(q0.x) > 2 ? q1.x / q0.x : 1, ky = Math.abs(q0.y) > 2 ? q1.y / q0.y : 1;
      if (s.what === 'edge') { if (s.idx % 2 === 0) kx = 1; else ky = 1; }
      else if (!e.shiftKey) { const k = Math.hypot(q1.x, q1.y) / (Math.hypot(q0.x, q0.y) || 1); kx = ky = k; }
      editProp(L, 'scaleX', r1(clamp(s.sx * Math.max(0, kx), 0, 1000)));
      editProp(L, 'scaleY', r1(clamp(s.sy * Math.max(0, ky), 0, 1000)));
    } else if (s.what === 'pivot') {
      const dd = s.lin.inverse().transformPoint(new DOMPoint(dx, dy));
      L.pivot = { x: r1(s.pivot.x + dd.x), y: r1(s.pivot.y + dd.y) };
      const ox = dx - dd.x, oy = dy - dd.y;
      L.base.x = r1(s.baseX + ox); L.base.y = r1(s.baseY + oy);
      const kx = JSON.parse(s.keysX), ky = JSON.parse(s.keysY);
      if (kx) L.tracks.x = kx.map(k => ({ ...k, v: r1(k.v + ox) }));
      if (ky) L.tracks.y = ky.map(k => ({ ...k, v: r1(k.v + oy) }));
    }
    emit('props'); requestRender(); sync();
  },

  up() {
    if (!drag) return;
    const s = drag;
    drag = null;
    if (s.kind === 'move') commitMeta(s.before, { move: 'Move layer', rotate: 'Rotate layer', corner: 'Resize layer', edge: 'Stretch layer', pivot: 'Move pivot' }[s.what]);
  },

  overlay(o) {
    const g = gizmo();
    if (!g) return;
    o.setLineDash([]);
    o.beginPath(); g.corners.forEach((c, i) => (i ? o.lineTo(c.x, c.y) : o.moveTo(c.x, c.y))); o.closePath();
    o.moveTo(g.edges[0].x, g.edges[0].y); o.lineTo(g.rot.x, g.rot.y);
    o.strokeStyle = '#000a'; o.lineWidth = 3; o.stroke();
    o.strokeStyle = pix ? '#ff922b' : '#5aa2ff'; o.lineWidth = 1.5; o.stroke();
    o.fillStyle = '#fff'; o.strokeStyle = '#1a5fc4'; o.lineWidth = 1.5;
    for (const c of g.corners) { o.beginPath(); o.rect(c.x - 5, c.y - 5, 10, 10); o.fill(); o.stroke(); }
    for (const c of g.edges) { o.beginPath(); o.rect(c.x - 4, c.y - 4, 8, 8); o.fill(); o.stroke(); }
    o.beginPath(); o.arc(g.rot.x, g.rot.y, 6, 0, Math.PI * 2); o.fill(); o.stroke();
    if (!pix && mode() === 'move') {
      o.beginPath(); o.arc(g.pivot.x, g.pivot.y, 6, 0, Math.PI * 2);
      o.moveTo(g.pivot.x - 10, g.pivot.y); o.lineTo(g.pivot.x + 10, g.pivot.y); o.moveTo(g.pivot.x, g.pivot.y - 10); o.lineTo(g.pivot.x, g.pivot.y + 10);
      o.strokeStyle = '#000'; o.lineWidth = 3; o.stroke(); o.strokeStyle = '#ffd60a'; o.lineWidth = 1.5; o.stroke();
    }
    if (pix) {
      o.font = '11px system-ui'; o.fillStyle = '#000b'; o.fillRect(g.ctr.x - 92, g.ctr.y - 10, 184, 18);
      o.fillStyle = '#ffc078'; o.textAlign = 'center'; o.fillText('Enter = apply · Esc = cancel', g.ctr.x, g.ctr.y + 3); o.textAlign = 'left';
    }
  },

  onKey(e) {
    if (!pix) return false;
    if (e.key === 'Enter') { applyPixels(); return true; }
    if (e.key === 'Escape') { cancelPixels(); return true; }
    return false;
  },

  optionsUI(bar) {
    const sel = el('select', { title: 'What the tool changes', onchange: () => { applyPixels(); app.opt.tfMode = sel.value; emit('tool'); } },
      el('option', { value: 'move', text: 'Movement (animatable)', selected: mode() === 'move' }),
      el('option', { value: 'pixels', text: 'Pixels (permanent)', selected: mode() === 'pixels' }));
    bar.append(el('label', { text: 'Changes' }), sel);
    const num = (key, label, step = 1) => {
      fields[key] = el('input', { type: 'number', step, title: label, 'aria-label': label, onchange: () => setField(key, +fields[key].value) });
      bar.append(el('label', { text: label }), fields[key]);
    };
    num('x', 'X'); num('y', 'Y'); num('w', 'W %'); num('h', 'H %'); num('a', 'Angle °');
    bar.append(
      el('button', { text: '⇋', title: 'Flip horizontally', onclick: () => flip('h') }),
      el('button', { text: '⇵', title: 'Flip vertically', onclick: () => flip('v') }),
      el('button', { text: 'Reset', title: 'Back to normal size, angle and position', onclick: reset }));
    if (mode() === 'pixels') bar.append(
      el('button', { class: 'primary', text: 'Apply', title: 'Enter', onclick: applyPixels }),
      el('button', { text: 'Cancel', title: 'Esc', onclick: cancelPixels }));
    sync();
  },
};

function movePixels(p, e) {
  const s = drag, P = pix, q = s.toL(p.doc), s0 = s.s, C = { x: s0.c.x + s0.tx, y: s0.c.y + s0.ty };
  if (s.what === 'move') {
    let mx = q.x - s.start.x, my = q.y - s.start.y;
    if (e.shiftKey) { if (Math.abs(mx) > Math.abs(my)) my = 0; else mx = 0; }
    P.tx = s0.tx + mx; P.ty = s0.ty + my;
  } else if (s.what === 'rotate') {
    let a = s0.rot + (Math.atan2(q.y - C.y, q.x - C.x) - Math.atan2(s.start.y - C.y, s.start.x - C.x)) / RAD;
    if (e.shiftKey) a = Math.round(a / 15) * 15;
    P.rot = a;
  } else {
    const inv = new DOMMatrix().rotateSelf(-s0.rot);
    const a0 = inv.transformPoint(new DOMPoint(s.start.x - C.x, s.start.y - C.y)), a1 = inv.transformPoint(new DOMPoint(q.x - C.x, q.y - C.y));
    let kx = Math.abs(a0.x) > 2 ? a1.x / a0.x : 1, ky = Math.abs(a0.y) > 2 ? a1.y / a0.y : 1;
    if (s.what === 'edge') { if (s.idx % 2 === 0) kx = 1; else ky = 1; }
    else if (!e.shiftKey) { const k = Math.hypot(a1.x, a1.y) / (Math.hypot(a0.x, a0.y) || 1); kx = ky = k; }
    P.sx = s0.sx * kx; P.sy = s0.sy * ky;
  }
  previewPix();
}

/* option-bar numbers */
function setField(key, v) {
  if (!isFinite(v)) return sync();
  if (mode() === 'pixels') {
    const P = startPix();
    if (!P) return;
    if (key === 'x') P.tx = v; else if (key === 'y') P.ty = v;
    else if (key === 'w') P.sx = v / 100; else if (key === 'h') P.sy = v / 100; else P.rot = v;
    previewPix();
    return;
  }
  const L = app.doc.active;
  if (!L || L.locked) return;
  const prop = { x: 'x', y: 'y', w: 'scaleX', h: 'scaleY', a: 'rotation' }[key];
  metaCmd({ x: 'Move layer', y: 'Move layer', w: 'Resize layer', h: 'Resize layer', a: 'Rotate layer' }[key], () => editProp(L, prop, clamp(v, PROPS[prop].min, PROPS[prop].max)));
}
function flip(dir) {
  if (mode() === 'pixels') {
    const P = startPix();
    if (!P) return;
    if (dir === 'h') P.sx = -P.sx; else P.sy = -P.sy;
    previewPix();
    return;
  }
  const L = app.doc.active;
  if (!L || L.locked) return;
  const prop = dir === 'h' ? 'flipH' : 'flipV';
  metaCmd('Flip layer', () => editProp(L, prop, L.value(prop, app.frame) ? 0 : 1));
}
function reset() {
  if (mode() === 'pixels') { if (pix) { Object.assign(pix, { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 }); previewPix(); } return; }
  const L = app.doc.active;
  if (!L || L.locked) return;
  metaCmd('Reset transform', () => { for (const k of PROPS_T) editProp(L, k, PROPS[k].def); });
}
function sync() {
  if (!fields.x || !fields.x.isConnected) return;
  let vals;
  if (mode() === 'pixels') vals = pix ? { x: pix.tx, y: pix.ty, w: pix.sx * 100, h: pix.sy * 100, a: pix.rot } : { x: 0, y: 0, w: 100, h: 100, a: 0 };
  else {
    const L = app.doc.active, f = app.frame;
    vals = L ? { x: L.value('x', f), y: L.value('y', f), w: L.value('scaleX', f), h: L.value('scaleY', f), a: L.value('rotation', f) } : {};
  }
  for (const k in fields) if (document.activeElement !== fields[k]) fields[k].value = vals[k] == null ? '' : r1(vals[k]);
}
on('props', sync); on('frame', sync); on('change', () => {
  // switching layers (or undoing) while pixels are pending: keep what was done
  if (pix && (app.doc.active !== pix.L || !app.doc.all().includes(pix.L))) applyPixels();
  sync();
});
on('tool', () => { if (app.tool?.id !== 'transform') applyPixels(); });
