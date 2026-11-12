// Replace a layer's picture with another layer's picture and keep everything else about it: its keyframes, pivot,
// position, name and place in the group. Made for template animations (a centipede segment, a bouncing ball, a burst
// particle): swap the generated art for your own drawing or photo and the animation carries on unchanged.
import { app, el, makeCanvas, clamp, changed } from './state.js';
import { pushCmd } from './history.js';
import { dialog, form, toast, pickFile } from './ui.js';

const artOf = g => g?.children?.find(c => c.tag === 'segment-art') || null;

/* The pixel layer a command on `node` should work on: the layer itself, or a tube segment's picture. */
export function replaceTarget(node) {
  if (!node) return null;
  if (!node.isGroup) return node;
  const art = artOf(node);
  if (art) return art;
  const only = node.children.filter(c => !c.isGroup);
  return only.length === 1 && node.children.length === 1 ? only[0] : null;
}
export const canReplace = node => !!replaceTarget(node);

/* The same part in the other segments of a tube (for "do it in every segment"). */
function siblingsInOtherSegments(L) {
  const d = app.doc, seg = d.parentOf(L);
  if (!seg || !seg.isGroup || !artOf(seg)) return [];
  const tube = d.parentOf(seg);
  if (!tube) return [];
  const idx = seg.children.indexOf(L);
  const out = [];
  for (const g of tube.children) {
    if (g === seg || !g.isGroup || !artOf(g)) continue;
    const c = L.tag === 'segment-art' ? artOf(g) : (g.children.find(x => !x.isGroup && x.name === L.name) || (g.children[idx] && !g.children[idx].isGroup ? g.children[idx] : null));
    if (c && !c.isGroup) out.push(c);
  }
  return out;
}

/* Everything the replacement can come from: any layer or group that is not part of the template group being changed. */
function candidates(target) {
  const d = app.doc;
  // not the layer itself, the groups around it, or (inside a template) anything else that belongs to that template group
  const bad = new Set([target, ...d.ancestors(target)]);
  const outer = [...d.ancestors(target), target].find(n => n.template);
  if (outer) for (const n of d.walk(outer.children)) bad.add(n);
  const out = [];
  const rec = list => { for (let i = list.length - 1; i >= 0; i--) { const n = list[i]; if (!bad.has(n) && !(n.isGroup && !n.children.length)) out.push(n); if (n.children) rec(n.children); } };
  rec(d.layers);
  return out;
}

/* The layer (or group) as it looks on the current frame, drawn on a document-sized canvas. */
function renderNode(node) {
  const d = app.doc, f = app.frame, c = makeCanvas(d.width, d.height), x = c.getContext('2d');
  const parent = d.parentOf(node), was = node.visible;
  node.visible = true;
  try { d.drawNode(x, node, f, 1, 0, parent ? d.worldMatrix(parent, f) : null, parent); } finally { node.visible = was; }
  return c;
}
/* Crop to the painted pixels (and keep it to a sensible size). Null when there is nothing there. */
function trim(src, max = 2400) {
  const w = src.width, h = src.height, data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0, i = (y * w) * 4 + 3; x < w; x++, i += 4) if (data[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, max / Math.max(cw, ch));
  const out = makeCanvas(Math.max(1, Math.round(cw * k)), Math.max(1, Math.round(ch * k))), o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  return out;
}
const pictureOf = node => trim(renderNode(node));

/* Put `pic` into layer L where the old picture was. mode: fit | stretch | keep. */
function drawInto(L, pic, mode) {
  const cw = L.canvas.width, ch = L.canvas.height;
  const old = L.bbox();
  const box = old || { x: cw / 4, y: ch / 4, w: cw / 2, h: ch / 2 };       // an empty layer: the middle of its canvas
  let sx, sy;
  if (mode === 'stretch') { sx = box.w / pic.width; sy = box.h / pic.height; }
  else if (mode === 'keep') { sx = sy = Math.min(1, cw / pic.width, ch / pic.height); }
  else sx = sy = Math.min(box.w / pic.width, box.h / pic.height);
  const w = pic.width * sx, h = pic.height * sy;
  const x = clamp(box.x + box.w / 2 - w / 2, Math.min(0, cw - w), Math.max(0, cw - w)), y = clamp(box.y + box.h / 2 - h / 2, Math.min(0, ch - h), Math.max(0, ch - h));
  const c = L.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.imageSmoothingQuality = 'high';
  c.clearRect(0, 0, cw, ch);
  c.drawImage(pic, x, y, w, h);
  c.restore();
  L.touch();
}
const copyOf = canvas => { const c = makeCanvas(canvas.width, canvas.height); c.getContext('2d').drawImage(canvas, 0, 0); return c; };
function putPixels(L, canvas) {
  const c = L.ctx;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.globalCompositeOperation = 'copy';
  c.drawImage(canvas, 0, 0);
  c.restore();
  L.touch();
}

/* The command: pick the replacement and how it fits, then swap. One undo step covers every layer it touched. */
export async function replaceLayer(node = app.doc.active) {
  const d = app.doc, target = replaceTarget(node);
  if (!target) return toast(node?.isGroup ? 'Select a layer inside the group (or a tube segment) to replace' : 'Select a layer to replace');
  if (target.locked) return toast('That layer is locked. Unlock it first.');
  const list = candidates(target);
  const others = siblingsInOtherSegments(target).filter(L => !L.locked);

  let chosen = list.find(n => !n.isGroup) || list[0] || null, file = null;
  const tiles = [];
  const grid = el('div', { class: 'replace-grid', role: 'listbox', 'aria-label': 'Replacement layer' });
  const mark = () => { for (const [n, b] of tiles) b.setAttribute('aria-selected', String(!file && n === chosen)); fileBtn.classList.toggle('picked', !!file); };
  for (const n of list) {
    const t = makeCanvas(96, Math.round(96 * d.height / d.width) || 54);
    const pic = pictureOf(n), x = t.getContext('2d');
    if (pic) { const k = Math.min(t.width / pic.width, t.height / pic.height, 1); x.drawImage(pic, (t.width - pic.width * k) / 2, (t.height - pic.height * k) / 2, pic.width * k, pic.height * k); }
    t.className = 'thumb';
    const b = el('button', { class: 'replace-item', role: 'option', title: n.name + (pic ? '' : ' (empty)'), onclick: () => { chosen = n; file = null; mark(); } },
      t, el('span', { class: 'lname', text: (n.isGroup ? '📁 ' : '') + n.name }));
    tiles.push([n, b]); grid.append(b);
  }
  const fileBtn = el('button', { class: 'replace-file', text: 'Use an image file instead…', onclick: async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try { file = { name: f.name, bmp: await createImageBitmap(f, { imageOrientation: 'from-image' }) }; fileBtn.textContent = 'File: ' + f.name.slice(0, 32); mark(); }
    catch { toast('That file could not be read as an image'); }
  } });
  if (!list.length) grid.append(el('p', { class: 'muted', text: 'There are no other layers to use. Draw one, or use File → Import image as layer…, or choose an image file below.' }));

  const fields = [
    { key: 'mode', label: 'Fit', type: 'select', value: 'fit', options: [['fit', 'Fit inside the old picture'], ['stretch', 'Stretch to the old picture’s size'], ['keep', 'Keep its own size']] },
    { key: 'after', label: 'The layer you picked', type: 'select', value: 'hide', options: [['hide', 'Hide it afterwards'], ['keep', 'Leave it as it is'], ['delete', 'Delete it afterwards']] },
  ];
  if (others.length) fields.push({ key: 'all', label: `Do the same in the other ${others.length} segment${others.length === 1 ? '' : 's'}`, type: 'checkbox', value: false });
  const f = form(fields);
  const content = el('div', { class: 'replace' },
    el('p', { class: 'muted', text: `Replace the picture of “${target.name}” with another layer. Its keyframes, pivot, position and place in the group stay exactly as they are.` }),
    grid, fileBtn, f.node,
    el('p', { class: 'muted', text: 'The replacement is taken as it looks on the current frame. Whatever you pick is copied, so you can pick it again for another part.' }));
  mark();
  const ok = await dialog({ title: 'Replace picture', content, buttons: [['Cancel', null], ['Replace', 'ok']] });
  if (ok !== 'ok') return;
  if (!file && !chosen) return toast('Pick a layer to use first');

  let pic;
  if (file) { const c = makeCanvas(file.bmp.width, file.bmp.height); c.getContext('2d').drawImage(file.bmp, 0, 0); pic = trim(c); }
  else pic = pictureOf(chosen);
  if (!pic) return toast('That layer is empty, so there is nothing to put in');

  const v = f.values, targets = [target, ...(v.all ? others : [])];
  const before = d.snapshot(), olds = targets.map(L => copyOf(L.canvas));
  for (const L of targets) drawInto(L, pic, v.mode);
  if (!file && chosen) {
    if (v.after === 'hide') chosen.visible = false;
    else if (v.after === 'delete') { const sib = d.siblings(chosen), i = sib.indexOf(chosen); if (i >= 0) sib.splice(i, 1); }
  }
  d.activeId = target.id;
  const news = targets.map(L => copyOf(L.canvas)), after = d.snapshot();
  pushCmd({
    label: 'Replace picture', bytes: targets.reduce((s, L) => s + L.canvas.width * L.canvas.height * 8, 0) + 2000,
    undo: () => { targets.forEach((L, i) => putPixels(L, olds[i])); d.restore(before); },
    redo: () => { targets.forEach((L, i) => putPixels(L, news[i])); d.restore(after); },
  });
  changed();
  toast(`Replaced the picture of “${target.name}”` + (targets.length > 1 ? ` and ${targets.length - 1} more` : '') + ' · Ctrl+Z to undo');
}
