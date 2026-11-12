// Undo/redo. Pixel edits are stored as before/after patches of only the changed rectangle;
// everything else (layer order, properties, keyframes) is stored as a cheap metadata snapshot.
import { app, emit, makeCanvas, markUnsaved, changed } from './state.js';

const undoStack = [], redoStack = [];
const BUDGET = 700 * 1024 * 1024;   // rough cap on patch memory
let bytes = 0;

export function pushCmd(cmd) {
  undoStack.push(cmd);
  bytes += cmd.bytes || 0;
  for (const c of redoStack) bytes -= c.bytes || 0;
  redoStack.length = 0;
  while (undoStack.length > 200 || (bytes > BUDGET && undoStack.length > 1)) bytes -= undoStack.shift().bytes || 0;
  markUnsaved();
  emit('history');
}
export function undo() {
  const c = undoStack.pop();
  if (!c) return;
  c.undo(); redoStack.push(c);
  markUnsaved(); emit('history'); changed();
}
export function redo() {
  const c = redoStack.pop();
  if (!c) return;
  c.redo(); undoStack.push(c);
  markUnsaved(); emit('history'); changed();
}
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const undoLabel = () => undoStack[undoStack.length - 1]?.label || '';
export const redoLabel = () => redoStack[redoStack.length - 1]?.label || '';

/* ---------- pixel edits ---------- */
let backup = null;
/* Copy the layer before editing it. Returns the backup canvas (valid until the next beginEdit). */
export function beginEdit(layer) {
  const { width, height } = layer.canvas;
  if (!backup || backup.width !== width || backup.height !== height) backup = makeCanvas(width, height);
  const b = backup.getContext('2d');
  b.globalCompositeOperation = 'copy';
  b.drawImage(layer.canvas, 0, 0);
  return backup;
}
export const backupCanvas = () => backup;
export function makePatch(canvas, r) {
  const p = makeCanvas(r.w, r.h);
  p.getContext('2d').drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return p;
}
export function putPatch(layer, patch, r) {
  const c = layer.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none';
  c.clearRect(r.x, r.y, r.w, r.h);
  c.drawImage(patch, r.x, r.y);
  c.restore();
  layer.touch();
}
/* Put the pre-edit pixels back (used to cancel a preview). */
export function revertEdit(layer) {
  const c = layer.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.globalCompositeOperation = 'copy';
  c.drawImage(backup, 0, 0);
  c.restore();
  layer.touch();
}
/* Record the edit made since beginEdit(layer) inside rect r (defaults to the whole layer). */
export function commitEdit(layer, r, label) {
  const W = layer.canvas.width, H = layer.canvas.height;
  if (!r) r = { x: 0, y: 0, w: W, h: H };
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  r = { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
  layer.touch();
  if (r.w <= 0 || r.h <= 0) return;
  const before = makePatch(backup, r), after = makePatch(layer.canvas, r);
  pushCmd({
    label, bytes: r.w * r.h * 8,
    undo: () => putPatch(layer, before, r),
    redo: () => putPatch(layer, after, r),
  });
  emit('render');
}

/* ---------- metadata edits ---------- */
export function metaCmd(label, fn) {
  const before = app.doc.snapshot();
  fn();
  commitMeta(before, label);
}
export const beginMeta = () => app.doc.snapshot();
export function commitMeta(before, label) {
  const after = app.doc.snapshot();
  if (before.json === after.json) { changed(); return; }
  pushCmd({ label, bytes: 2000, undo: () => app.doc.restore(before), redo: () => app.doc.restore(after) });
  changed();
}
