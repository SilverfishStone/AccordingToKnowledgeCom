// Toolbar, tool options, colour panel, layers panel, animated-properties panel, and layer operations.
import { app, on, emit, $, el, makeCanvas, uid, changed, requestRender } from './state.js';
import { PROPS, PROP_GROUPS, BLENDS, EASES, saveProps, restoreProps } from './doc.js';
import { metaCmd, beginMeta, commitMeta, beginEdit, commitEdit, backupCanvas, makePatch, putPatch, pushCmd } from './history.js';
import { TOOLS, OPTS, setTool, target, paintOnLayer } from './tools.js';
import { clipToSelection } from './selection.js';
import { toast, confirmDialog, contextMenu, formDialog } from './ui.js';
import { editProp } from './timeline.js';

/* =============== layer operations =============== */
/* Where a new layer goes: above the active layer in the same group, or on top inside a selected open group. */
export function insertPoint({ intoGroup = true } = {}) {
  const d = app.doc;
  let A = d.active;
  if (!A) return { list: d.layers, index: d.layers.length };
  if (!intoGroup) {
    // never inside a template's group: go next to the outermost template group the selection is in
    const outer = [...d.ancestors(A), A].find(n => n.template);
    if (outer) A = outer;
  } else if (A.isGroup && (A.expanded || artOf(A))) return { list: A.children, index: A.children.length };   // a tube segment: new layers go inside it
  const list = d.siblings(A);
  return { list, index: list.indexOf(A) + 1 };
}
const countOf = isGroup => app.doc.all().filter(l => l.isGroup === isGroup).length;

export function addLayer(name) {
  metaCmd('New layer', () => {
    const { list, index } = insertPoint();
    const L = app.doc.addLayer(name || `Layer ${countOf(false) + 1}`, index, null, list);
    for (const g of app.doc.ancestors(L)) g.expanded = true;      // show where it went
  });
}
export function addGroup() {
  metaCmd('New group', () => { const { list, index } = insertPoint(); app.doc.addGroup(`Group ${countOf(true) + 1}`, index, list); });
}
/* Put the active layer (or group) inside a new group, in the same place in the stack. */
export function groupActive() {
  const d = app.doc, A = d.active;
  if (!A) return;
  metaCmd('Group layer', () => {
    const list = d.siblings(A);
    const g = d.addGroup(A.name + ' group', list.indexOf(A), list);
    list.splice(list.indexOf(A), 1);
    g.children.push(A);
    d.activeId = g.id;
  });
}
export async function ungroup() {
  const d = app.doc, G = d.active;
  if (!G?.isGroup) return toast('Select a group to ungroup');
  const own = Object.keys(G.tracks).length || !G.isIdentity(0) || G.value('opacity', 0) !== 100 || G.outline || G.blend !== 'source-over';
  if (own && !await confirmDialog('Ungroup', `"${G.name}" has its own movement, opacity, blend mode or outline. Ungrouping drops those; the layers inside keep their own animation.`, 'Ungroup')) return;
  metaCmd('Ungroup', () => {
    const list = d.siblings(G);
    list.splice(list.indexOf(G), 1, ...G.children);
    d.activeId = G.children[G.children.length - 1]?.id || null;
  });
}
export function duplicateLayer() {
  const d = app.doc, L = d.active;
  if (!L) return;
  metaCmd('Duplicate layer', () => {
    const remap = m => ({ ...m, id: uid(), children: m.children ? m.children.map(remap) : undefined });
    const n = d.fromMeta({ ...remap(L.meta()), name: L.name + ' copy' });
    const copy = (a, b) => {
      if (a.isGroup) a.children.forEach((c, i) => copy(c, b.children[i]));
      else { b.ctx.drawImage(a.canvas, 0, 0); b.touch(); }
    };
    copy(L, n);
    const list = d.siblings(L);
    list.splice(list.indexOf(L) + 1, 0, n);
    d.activeId = n.id;
  });
}
export function deleteLayer() {
  const d = app.doc, L = d.active;
  if (!L) return;
  metaCmd(L.isGroup ? 'Delete group' : 'Delete layer', () => {
    const parent = d.parentOf(L), list = d.siblings(L), i = list.indexOf(L);
    list.splice(i, 1);
    d.activeId = (list[i - 1] || list[i] || parent || {}).id || null;
  });
}
/* Move up/down within its group; past the top or bottom of a group it steps out of the group. */
export function moveLayer(dir) {
  const d = app.doc, L = d.active;
  if (!L) return;
  const list = d.siblings(L), i = list.indexOf(L), j = i + dir;
  if (j >= 0 && j < list.length) {
    metaCmd(dir > 0 ? 'Raise layer' : 'Lower layer', () => { list.splice(i, 1); list.splice(j, 0, L); });
    return;
  }
  const parent = d.parentOf(L);
  if (!parent) return;
  metaCmd('Move out of group', () => {
    list.splice(i, 1);
    const outer = d.siblings(parent);
    outer.splice(outer.indexOf(parent) + (dir > 0 ? 1 : 0), 0, L);
  });
}
/* Place layer `src` above or below `target`, or inside group `target` (on top). */
export function placeLayer(src, target, where) {
  const d = app.doc;
  if (!src || !target || src === target || (src.isGroup && d.isInside(target, src))) return;
  metaCmd('Reorder layers', () => {
    const from = d.siblings(src);
    from.splice(from.indexOf(src), 1);
    if (where === 'into') { target.children.push(src); target.expanded = true; return; }
    const list = d.siblings(target);
    list.splice(list.indexOf(target) + (where === 'above' ? 1 : 0), 0, src);
  });
}
export function mergeDown() {
  const d = app.doc, up = d.active;
  if (!up) return;
  const list = d.siblings(up), i = list.indexOf(up), low = list[i - 1];
  if (!low) return toast('There is no layer below to merge into');
  if (up.isGroup || low.isGroup) return toast('Merging groups is not supported yet. Ungroup first, or flatten the image.');
  if (low.locked) return toast(`"${low.name}" is locked`);
  const f = app.frame, r = { x: 0, y: 0, w: low.canvas.width, h: low.canvas.height };
  const beforeMeta = d.snapshot();
  beginEdit(low);
  const before = makePatch(backupCanvas(), r);
  // draw the upper layer as it appears right now, expressed in the lower layer's space
  const m = low.matrix(f).inverse().multiply(up.matrix(f)), c = low.ctx;
  c.save();
  c.globalAlpha = Math.min(1, up.value('opacity', f) / 100);
  c.globalCompositeOperation = up.blend;
  c.filter = up.filterString(f);
  c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  c.drawImage(up.canvas, 0, 0);
  c.restore();
  low.touch();
  const after = makePatch(low.canvas, r);
  list.splice(i, 1);
  d.activeId = low.id;
  const afterMeta = d.snapshot();
  pushCmd({
    label: 'Merge down', bytes: r.w * r.h * 8,
    undo: () => { putPatch(low, before, r); d.restore(beforeMeta); },
    redo: () => { putPatch(low, after, r); d.restore(afterMeta); },
  });
  changed();
}
export async function flattenImage() {
  const d = app.doc;
  if (d.all().length < 2) return;
  if (!await confirmDialog('Flatten image', 'Merge every layer and group into one, as it looks on the current frame? Layer animation is removed (you can undo).', 'Flatten')) return;
  metaCmd('Flatten image', () => {
    const flat = makeCanvas(d.width, d.height);
    d.render(flat.getContext('2d'), app.frame, { bg: false });
    d.layers = [];
    const L = d.addLayer('Flattened');
    L.ctx.drawImage(flat, 0, 0);
    L.touch();
  });
}
/* Flip / rotate the pixels of the active layer around its own centre. */
export function transformPixels(kind) {
  const L = target();
  if (!L) return;
  const { width: w, height: h } = L.canvas, c = L.ctx;
  beginEdit(L);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  c.translate(w / 2, h / 2);
  if (kind === 'flipH') c.scale(-1, 1);
  else if (kind === 'flipV') c.scale(1, -1);
  else if (kind === 'cw') c.rotate(Math.PI / 2);
  else if (kind === 'ccw') c.rotate(-Math.PI / 2);
  else c.rotate(Math.PI);
  c.drawImage(backupCanvas(), -w / 2, -h / 2);
  c.restore();
  commitEdit(L, null, { flipH: 'Flip horizontally', flipV: 'Flip vertically', cw: 'Rotate 90° clockwise', ccw: 'Rotate 90° counter-clockwise', r180: 'Rotate 180°' }[kind]);
  changed();
}
export const clearPixels = () => paintOnLayer(app.sel ? 'Clear selection' : 'Clear layer', c => { c.fillStyle = '#000'; c.fillRect(0, 0, app.doc.width, app.doc.height); }, { erase: true }) && changed();
export const fillPixels = color => paintOnLayer('Fill', c => { c.fillStyle = color; c.fillRect(0, 0, app.doc.width, app.doc.height); }) && changed();

/* Add a picture (bitmap/canvas) as a new layer, centred; shrunk to fit if it is larger than the canvas. */
export function importImageLayer(src, name = 'Image', { fit = true } = {}) {
  const d = app.doc;
  metaCmd('Add image layer', () => {
    const { list, index } = insertPoint();
    const L = d.addLayer(name, index, null, list);
    const k = fit ? Math.min(1, d.width / src.width, d.height / src.height) : 1;
    const w = src.width * k, h = src.height * k;
    L.ctx.drawImage(src, (d.width - w) / 2, (d.height - h) / 2, w, h);
    L.touch();
    const b = L.bbox();
    if (b) L.pivot = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  });
}

let clip = null;
export function copySelection(cut = false) {
  const L = app.doc.active;
  if (!L) return;
  if (L.isGroup) return toast('Pick a layer inside the group to copy from');
  clip = makeCanvas(app.doc.width, app.doc.height);
  const c = clip.getContext('2d');
  c.drawImage(L.canvas, 0, 0);
  clipToSelection(c);
  clip.toBlob(b => { try { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => {}); } catch { /* clipboard unavailable */ } }, 'image/png');
  if (cut) clearPixels();
  toast(cut ? 'Cut' : 'Copied');
}
export function pasteInternal() {
  if (!clip) return toast('Nothing to paste');
  importImageLayer(clip, 'Pasted', { fit: false });
}

/* =============== toolbar + tool options =============== */
export function buildToolbar() {
  const bar = $('#toolbar');
  for (const t of TOOLS) {
    bar.append(el('button', {
      class: 'tool', 'data-id': t.id, title: `${t.label} (${t.key.toUpperCase()})`, 'aria-label': t.label,
      html: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${t.icon}</svg>`, onclick: () => setTool(t.id),
    }));
  }
  on('tool', () => {
    for (const b of bar.children) b.classList.toggle('active', b.dataset.id === app.tool.id);
    buildOptions();
  });
}
function buildOptions() {
  const bar = $('#options');
  bar.replaceChildren(el('b', { text: app.tool.label.replace(/\s*\(.*\)$/, '') }));
  for (const key of app.tool.opts) {
    const o = OPTS[key], id = 'opt_' + key;
    const title = o.title || null;
    if (o.type === 'range') {
      const num = el('input', { type: 'number', min: o.min, max: o.max, value: app.opt[key], 'aria-label': o.label, title,
        onchange: () => { app.opt[key] = Math.min(o.max, Math.max(o.min, +num.value || 0)); rng.value = num.value = app.opt[key]; emit('overlay'); } });
      const rng = el('input', { id, type: 'range', min: o.min, max: o.max, value: app.opt[key], title,
        oninput: () => { app.opt[key] = +rng.value; num.value = rng.value; emit('overlay'); } });
      bar.append(el('label', { for: id, text: o.label, title }), rng, num);
    } else if (o.type === 'checkbox') {
      const cb = el('input', { id, type: 'checkbox', checked: app.opt[key], onchange: () => { app.opt[key] = cb.checked; } });
      bar.append(el('label', { class: 'check', title }, cb, ' ' + o.label));
    } else {
      const s = el('select', { id, title, onchange: () => { app.opt[key] = s.value; } }, o.options.map(([v, t]) => el('option', { value: v, text: t, selected: app.opt[key] === v })));
      bar.append(el('label', { for: id, text: o.label, title }), s);
    }
  }
  app.tool.optionsUI?.(bar);
  if (app.tool.hint) bar.append(el('span', { class: 'hint', text: app.tool.hint }));
}

/* =============== colours =============== */
const SWATCHES = ['#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#b97a57', '#ffaec9', '#ffc90e', '#b5e61d', '#99d9ea', '#7092be'];
export function buildColors() {
  const fg = el('input', { type: 'color', id: 'fgColor', title: 'Foreground colour', 'aria-label': 'Foreground colour', oninput: () => { app.fg = fg.value; emit('color'); } });
  const bg = el('input', { type: 'color', id: 'bgColor', title: 'Background colour', 'aria-label': 'Background colour', oninput: () => { app.bg = bg.value; emit('color'); } });
  $('#colors').append(
    el('div', { class: 'color-pair' }, fg, bg,
      el('button', { text: '⇄', title: 'Swap colours (X)', onclick: swapColors }),
      el('button', { text: '◐', title: 'Black and white (D)', onclick: () => { app.fg = '#000000'; app.bg = '#ffffff'; emit('color'); } })),
    el('div', { class: 'swatches' }, SWATCHES.map(c => el('button', {
      class: 'swatch', style: `background:${c}`, title: c, 'aria-label': 'Colour ' + c,
      onclick: () => { app.fg = c; emit('color'); }, oncontextmenu: e => { e.preventDefault(); app.bg = c; emit('color'); },
    }))));
  on('color', () => { fg.value = app.fg; bg.value = app.bg; });
  emit('color');
}
export function swapColors() { [app.fg, app.bg] = [app.bg, app.fg]; emit('color'); }

/* =============== live property edits (one undo step per drag) =============== */
let pending = null, pendingProp = null;
export function liveProp(prop, value) {
  const L = app.doc.active;
  if (!L) return;
  pending ||= beginMeta();
  // during one slider drag, always start from the pre-drag values (Paint mode shifts animation by a delta)
  if (pendingProp && pendingProp.L === L && pendingProp.prop === prop) restoreProps(L, pendingProp.saved);
  else pendingProp = { L, prop, saved: saveProps(L, [prop]) };
  editProp(L, prop, value);
  emit('props'); requestRender();
}
export function commitProp(label) {
  pendingProp = null;
  if (!pending) return;
  const p = pending; pending = null;
  commitMeta(p, label);
}

/* =============== right-click menu for a layer (layers panel + timeline) =============== */
/* =============== copy a layer into every segment of a tube (legs for a centipede…) =============== */
const artOf = g => g?.children?.find(c => c.tag === 'segment-art') || null;
/* the segment group L sits in, and the other segment groups of the same tube */
function segmentContext(L) {
  const d = app.doc, seg = d.parentOf(L);
  if (!seg || !artOf(seg) || seg === L) return null;
  const tube = d.parentOf(seg);
  if (!tube) return null;
  const segs = tube.children.filter(g => g.isGroup && artOf(g));
  return segs.length > 1 ? { seg, tube, segs } : null;
}
/* Move a layer's animation later by k frames, wrapping round the end of the project (so loops stay loops). */
function shiftInTime(node, k, N) {
  if (k % N) {
    for (const prop in node.tracks) {
      const src = node.tracks[prop], frames = new Set([0, N - 1]);
      for (const key of src) frames.add((((key.f + k) % N) + N) % N);
      node.tracks[prop] = [...frames].sort((a, b) => a - b).map(f => {
        const from = (((f - k) % N) + N) % N, orig = src.find(key => key.f === from);
        return { f, v: node.value(prop, from), ease: orig?.ease || 'linear' };
      });
    }
  }
  node.children?.forEach(c => shiftInTime(c, k, N));
}
async function copyToSegments(L) {
  const ctx = segmentContext(L);
  if (!ctx) return;
  const v = await formDialog(`Copy “${L.name}” into every segment`, [
    { key: 'match', label: 'Resize to each segment', type: 'checkbox', value: true },
    { key: 'stagger', label: 'Delay per segment', type: 'range', min: 0, max: 24, value: 0, unit: ' fr' },
  ], { okLabel: 'Copy' });
  if (!v) return;
  const d = app.doc, { seg, segs } = ctx, idx = seg.children.indexOf(L), srcArt = artOf(seg);
  const cx = d.width / 2, cy = d.height / 2;        // segment pictures are centred here inside their groups
  const myIndex = segs.indexOf(seg);
  let skipped = 0;
  metaCmd('Copy into every segment', () => {
    segs.forEach((g, i) => {
      if (g === seg) return;
      const remap = m => ({ ...m, id: uid(), children: m.children ? m.children.map(remap) : undefined });
      const n = d.fromMeta(remap(L.meta()));
      const ratio = v.match ? artOf(g).canvas.height / srcArt.canvas.height : 1;
      const copy = (a, b) => {
        if (a.isGroup) { a.children.forEach((c, j) => copy(c, b.children[j])); return; }
        const full = a.canvas.width === d.width && a.canvas.height === d.height;
        if (Math.abs(ratio - 1) > 0.01 && full) {
          // full-size picture: scale the pixels round the segment's centre (keeps any keyframes exact)
          b.ctx.setTransform(ratio, 0, 0, ratio, cx - ratio * cx, cy - ratio * cy);
          b.ctx.drawImage(a.canvas, 0, 0);
          b.ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          b.ctx.drawImage(a.canvas, 0, 0);
          if (Math.abs(ratio - 1) > 0.01) skipped++;
        }
        b.touch();
      };
      copy(L, n);
      const stagger = Math.round(v.stagger) * (i - myIndex);
      if (stagger) shiftInTime(n, stagger, d.frames);
      g.children.splice(Math.min(idx, g.children.length), 0, n);
    });
  });
  toast(`Copied into ${segs.length - 1} segments` + (skipped ? ` (${skipped} could not be resized: only full-size layers are)` : ''));
}

function layerMenu(L, x, y) {
  const d = app.doc;
  if (d.activeId !== L.id) { d.activeId = L.id; changed(); }
  const list = d.siblings(L), i = list.indexOf(L);
  contextMenu(x, y, [
    { label: 'Rename…', run: async () => {
      const v = await formDialog('Rename layer', [{ key: 'name', label: 'Name', type: 'text', value: L.name }]);
      if (v && v.name.trim()) metaCmd('Rename layer', () => { L.name = v.name.trim().slice(0, 60); });
    } },
    { label: 'Duplicate', key: 'Ctrl+J', run: duplicateLayer },
    { label: 'Merge down', run: mergeDown, enabled: () => i > 0 && !L.isGroup && !list[i - 1].isGroup },
    '-',
    { label: L.isGroup ? 'Put this group in a new group' : 'Put in a new group', key: 'Ctrl+G', run: groupActive },
    ...(L.isGroup ? [{ label: 'Ungroup', key: 'Ctrl+Shift+G', run: ungroup }] : []),
    ...(L.template ? [{ label: 'Template settings…', run: () => emit('template-edit', L) }] : []),
    ...(L.isGroup ? [{ label: (L.sortByDepth ? '✓ ' : '') + 'Draw by Depth (near over far)', run: () => metaCmd('Draw by depth', () => { L.sortByDepth = !L.sortByDepth; }) }] : []),
    { label: 'Add a motion…', run: () => emit('motion-dialog') },
    ...(segmentContext(L) ? [{ label: 'Copy into every segment…', run: () => copyToSegments(L) }] : []),
    '-',
    { label: L.visible ? 'Hide' : 'Show', run: () => metaCmd(L.visible ? 'Hide layer' : 'Show layer', () => { L.visible = !L.visible; }) },
    { label: L.locked ? 'Unlock' : 'Lock', run: () => metaCmd(L.locked ? 'Unlock layer' : 'Lock layer', () => { L.locked = !L.locked; }) },
    { label: 'Remove all animation', enabled: () => Object.keys(L.tracks).length > 0,
      run: () => metaCmd('Remove animation', () => { for (const p in L.tracks) L.base[p] = L.value(p, 0); L.tracks = {}; }) },
    '-',
    { label: 'Delete layer', danger: true, run: () => { deleteLayer(); toast(`Deleted “${L.name}” · Ctrl+Z to undo`); } },
  ]);
}

/* =============== layers panel =============== */
let dragId = null;
export function buildLayers() {
  const blend = el('select', { id: 'lyBlend', title: 'Blend mode', 'aria-label': 'Blend mode',
    onchange: () => { const L = app.doc.active; if (L) metaCmd('Blend mode', () => { L.blend = blend.value; }); } },
    BLENDS.map(([v, t]) => el('option', { value: v, text: t })));
  const opVal = el('span', { class: 'val' });
  const op = el('input', { id: 'lyOpacity', type: 'range', min: 0, max: 100, 'aria-label': 'Layer opacity',
    oninput: () => { opVal.textContent = op.value + '%'; liveProp('opacity', +op.value); }, onchange: () => commitProp('Layer opacity') });
  const flag = (key, text, title) => {
    const cb = el('input', { type: 'checkbox', onchange: () => { const L = app.doc.active; if (L) metaCmd(text, () => { L[key] = cb.checked; }); } });
    return [el('label', { class: 'check', title }, cb, ' ' + text), cb];
  };
  const [alphaLbl, alphaCb] = flag('alphaLock', 'Lock alpha', 'Paint only on pixels that are already there');
  const [lockLbl, lockCb] = flag('locked', 'Lock', 'Protect this layer from edits');
  // Outline: on a layer it outlines that picture; on a group it outlines everything inside as one shape
  const olOn = el('input', { type: 'checkbox', title: 'Outline' });
  const olW = el('input', { type: 'number', min: 1, max: 60, value: 4, title: 'Outline width', 'aria-label': 'Outline width' });
  const olC = el('input', { type: 'color', value: '#000000', title: 'Outline colour', 'aria-label': 'Outline colour' });
  const setOutline = () => {
    const L = app.doc.active;
    if (!L) return;
    metaCmd(olOn.checked ? 'Outline' : 'Remove outline', () => { L.outline = olOn.checked ? { width: clampN(+olW.value, 1, 60), color: olC.value } : null; });
  };
  const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v || lo));
  olOn.onchange = setOutline; olW.onchange = () => { if (olOn.checked) setOutline(); }; olC.onchange = () => { if (olOn.checked) setOutline(); };
  const olLbl = el('label', { class: 'check', title: 'On a group, the parts inside merge into one outlined shape' }, olOn, ' Outline');
  const list = el('div', { id: 'layerList', role: 'listbox', 'aria-label': 'Layers' });
  const btn = (text, title, fn) => el('button', { text, title, 'aria-label': title, onclick: fn });
  $('#layers').append(
    el('div', { class: 'prow' }, el('label', { for: 'lyBlend', text: 'Mode' }), blend),
    el('div', { class: 'prow' }, el('label', { for: 'lyOpacity', text: 'Opacity' }), op, opVal),
    el('div', { class: 'prow' }, alphaLbl, lockLbl),
    el('div', { class: 'prow' }, olLbl, olW, olC),
    list,
    el('div', { class: 'prow btns' },
      btn('＋', 'New layer', () => addLayer()), btn('📁', 'New group', addGroup), btn('⧉', 'Duplicate layer', duplicateLayer),
      btn('▲', 'Raise layer', () => moveLayer(1)), btn('▼', 'Lower layer', () => moveLayer(-1)),
      btn('⤓', 'Merge down', mergeDown), btn('🗑', 'Delete layer', deleteLayer)));

  const TW = 56;
  /* thumbnail: a layer's pixels, or a group's children combined, at frame 1 */
  const drawThumb = (cv, L) => {
    const d = app.doc, c = cv.getContext('2d'), k = cv.width / d.width;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    if (L.isGroup) d.drawList(c, L.children, 0, k, 20, L.sortByDepth, null, L);
    else {
      const m = L.canvas.width === d.width && L.canvas.height === d.height ? new DOMMatrix() : L.matrix(0);
      c.setTransform(k, 0, 0, k, 0, 0);
      c.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      c.drawImage(L.canvas, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    cv.dataset.rev = d.revOf(L);
  };
  const rebuild = () => {
    const d = app.doc, A = d.active;
    blend.value = A?.blend || 'source-over';
    if (document.activeElement !== op) { op.value = A ? Math.round(A.value('opacity', app.frame)) : 100; opVal.textContent = op.value + '%'; }
    alphaCb.checked = !!A?.alphaLock; lockCb.checked = !!A?.locked;
    alphaCb.disabled = !!A?.isGroup;
    olOn.checked = !!A?.outline; if (A?.outline) { olW.value = A.outline.width; olC.value = A.outline.color; }
    olLbl.title = A?.isGroup ? 'Outline everything in this group as one merged shape' : 'Outline this layer’s picture';
    list.replaceChildren(...d.rows().map(({ node: L, depth }) => {
      const thumb = makeCanvas(TW, Math.round(TW * d.height / d.width));
      thumb.className = 'thumb'; thumb.dataset.id = L.id;
      drawThumb(thumb, L);
      const eye = el('button', { class: 'eye' + (L.visible ? '' : ' off'), text: L.visible ? '👁' : '–', title: 'Show / hide', 'aria-label': 'Show or hide ' + L.name,
        onclick: e => { e.stopPropagation(); metaCmd(L.visible ? 'Hide layer' : 'Show layer', () => { L.visible = !L.visible; }); } });
      const twisty = L.isGroup
        ? el('button', { class: 'twisty', text: L.expanded ? '▾' : '▸', title: L.expanded ? 'Close group' : 'Open group', 'aria-label': (L.expanded ? 'Close ' : 'Open ') + L.name,
          'aria-expanded': String(L.expanded), onclick: e => { e.stopPropagation(); L.expanded = !L.expanded; changed(); } })
        : el('span', { class: 'twisty' });
      const name = el('span', { class: 'lname', text: (L.isGroup ? '📁 ' : '') + L.name, title: 'Double-click to rename' });
      const zone = (row, e) => {
        const r = row.getBoundingClientRect(), t = (e.clientY - r.top) / r.height;
        if (L.isGroup) return t < 0.25 ? 'above' : t > 0.75 ? 'below' : 'into';
        return t < 0.5 ? 'above' : 'below';
      };
      const row = el('div', { class: 'layer' + (L === A ? ' active' : '') + (L.isGroup ? ' group' : ''), draggable: true, role: 'option', 'aria-selected': L === A,
        style: `padding-left:${6 + depth * 14}px`,
        onclick: () => { if (d.activeId !== L.id) { d.activeId = L.id; changed(); } },
        oncontextmenu: e => { e.preventDefault(); layerMenu(L, e.clientX, e.clientY); },
        ondblclick: () => {
          const input = el('input', { type: 'text', value: L.name, class: 'rename' });
          const done = ok => { if (ok && input.value.trim() && input.value !== L.name) metaCmd('Rename layer', () => { L.name = input.value.trim().slice(0, 60); }); else changed(); };
          input.onblur = () => done(true);
          input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.onblur = null; done(false); } };
          name.replaceWith(input); input.focus(); input.select();
        },
        ondragstart: e => { dragId = L.id; e.dataTransfer.effectAllowed = 'move'; },
        ondragover: e => {
          if (!dragId || dragId === L.id) return;
          e.preventDefault();
          const z = zone(row, e);
          row.classList.toggle('drop', z === 'above'); row.classList.toggle('drop-below', z === 'below'); row.classList.toggle('drop-into', z === 'into');
        },
        ondragleave: () => row.classList.remove('drop', 'drop-below', 'drop-into'),
        ondrop: e => {
          e.preventDefault();
          row.classList.remove('drop', 'drop-below', 'drop-into');
          const src = d.layer(dragId); dragId = null;
          placeLayer(src, L, zone(row, e));
        },
      }, twisty, eye, thumb, name,
      el('span', { class: 'flags', text: (L.template ? '⚙' : '') + (L.locked ? '🔒' : '') + (Object.keys(L.tracks).length ? '◆' : '') }));
      return row;
    }));
  };
  const refreshThumbs = () => {
    for (const cv of list.querySelectorAll('canvas.thumb')) {
      const L = app.doc.layer(cv.dataset.id);
      if (L && app.doc.revOf(L) !== cv.dataset.rev) drawThumb(cv, L);
    }
  };
  on('change', rebuild);
  on('history', refreshThumbs);
  on('layermenu', layerMenu);
  on('frame', () => { const A = app.doc.active; if (A && document.activeElement !== op) { op.value = Math.round(A.value('opacity', app.frame)); opVal.textContent = op.value + '%'; } });
  on('props', () => { const A = app.doc.active; if (A && document.activeElement !== op) { op.value = Math.round(A.value('opacity', app.frame)); opVal.textContent = op.value + '%'; } });
}

/* =============== animated properties panel =============== */
export function buildProps() {
  const box = $('#props');
  const rows = {};
  const fmt = v => (Math.round(v * 10) / 10).toString();
  const keyBtn = prop => el('button', { class: 'key', text: '◆', title: 'Add / remove a keyframe here', 'aria-label': 'Toggle keyframe for ' + PROPS[prop].label,
    onclick: () => {
      const L = app.doc.active, f = app.frame;
      if (!L) return;
      if (L.keyAt(prop, f)) metaCmd('Remove keyframe', () => L.removeKey(prop, f));
      else metaCmd('Add keyframe', () => L.animSet(prop, f, L.value(prop, f)));
    } });

  const ease = el('select', { id: 'easeSel', onchange: () => {
    const L = app.doc.active, f = app.frame;
    if (L) metaCmd('Change easing', () => { for (const k in L.tracks) { const key = L.keyAt(k, f); if (key) key.ease = ease.value; } });
  } }, Object.entries(EASES).map(([v, [t]]) => el('option', { value: v, text: t })));
  const pivX = el('input', { type: 'number', step: 1, 'aria-label': 'Pivot X' }), pivY = el('input', { type: 'number', step: 1, 'aria-label': 'Pivot Y' });
  const setPivot = () => { const L = app.doc.active; if (L) metaCmd('Move pivot', () => { L.pivot = { x: +pivX.value || 0, y: +pivY.value || 0 }; }); };
  pivX.onchange = pivY.onchange = setPivot;
  const title = el('div', { class: 'muted', id: 'propsTitle' });
  const fol = {};
  const folRow = el('div', { class: 'prow', title: 'Which parts of its group’s movement this layer copies' }, el('label', { text: 'Follow group' }),
    ...[['pos', 'Position'], ['rot', 'Rotation'], ['size', 'Size']].map(([k, t]) => {
      fol[k] = el('input', { type: 'checkbox', onchange: () => {
        const L = app.doc.active;
        if (L) metaCmd(fol[k].checked ? 'Follow group' : 'Stop following group', () => { L.follow = { ...L.follow, [k]: fol[k].checked }; });
      } });
      return el('label', { class: 'check' }, fol[k], ' ' + t);
    }));
  box.append(title, folRow,
    el('div', { class: 'prow' }, el('label', { for: 'easeSel', text: 'Easing', title: 'How the layer moves from this keyframe to the next' }), ease),
    el('div', { class: 'prow' }, el('label', { text: 'Pivot' }), pivX, pivY,
      el('button', { text: '⌖', title: 'Centre the pivot on the drawing', onclick: () => {
        const L = app.doc.active, b = L?.bbox();
        if (b) metaCmd('Centre pivot', () => { L.pivot = { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) }; });
      } })));

  for (const [group, keys] of PROP_GROUPS) {
    box.append(el('div', { class: 'group', text: group }));
    for (const prop of keys) {
      const P = PROPS[prop], id = 'p_' + prop, key = keyBtn(prop);
      let inputs;
      if (P.type === 'bool') {
        const cb = el('input', { id, type: 'checkbox', onchange: () => { liveProp(prop, cb.checked ? 1 : 0); commitProp(P.label); } });
        inputs = { cb };
        box.append(el('div', { class: 'prow' }, el('label', { class: 'check wide' }, cb, ' ' + P.label), key));
      } else if (P.type === 'color') {
        const col = el('input', { id, type: 'color', oninput: () => liveProp(prop, col.value), onchange: () => commitProp(P.label) });
        inputs = { col };
        box.append(el('div', { class: 'prow' }, el('label', { for: id, text: P.label }), col, key));
      } else {
        const num = el('input', { type: 'number', step: P.step, 'aria-label': P.label + ' value',
          onchange: () => { if (num.value !== '') { liveProp(prop, +num.value); commitProp(P.label); } } });
        const rng = el('input', { id, type: 'range', min: P.min, max: P.max, step: P.step,
          oninput: () => { num.value = rng.value; liveProp(prop, +rng.value); }, onchange: () => commitProp(P.label) });
        inputs = { num, rng };
        box.append(el('div', { class: 'prow' }, el('label', { for: id, text: P.label }), rng, num, key));
      }
      rows[prop] = { ...inputs, key };
    }
  }
  box.append(el('button', { text: 'Reset all to defaults', class: 'wide-btn', onclick: () => {
    const L = app.doc.active;
    if (L) metaCmd('Reset properties', () => { L.tracks = {}; for (const k in PROPS) L.base[k] = PROPS[k].def; });
  } }));

  const update = () => {
    const L = app.doc.active, f = app.frame;
    box.classList.toggle('disabled', !L);
    const inGroup = !!(L && app.doc.parentOf(L));
    folRow.style.display = inGroup ? '' : 'none';
    if (inGroup) for (const k in fol) fol[k].checked = L.follow[k];
    title.textContent = !L ? 'No layer selected' : app.mode === 'paint'
      ? `${L.name} · starting look (Paint mode)`
      : `${L.name} · waypoint at frame ${f + 1}`;
    if (!L) return;
    const hasKey = L.hasKeyAt(f);
    ease.disabled = !hasKey || app.mode !== 'animate';
    if (hasKey) for (const k in L.tracks) { const key = L.keyAt(k, f); if (key) { ease.value = key.ease; break; } }
    if (document.activeElement !== pivX) pivX.value = fmt(L.pivot.x);
    if (document.activeElement !== pivY) pivY.value = fmt(L.pivot.y);
    for (const prop in rows) {
      const r = rows[prop], v = L.value(prop, f);
      if (r.cb) r.cb.checked = !!v;
      else if (r.col) { if (document.activeElement !== r.col) r.col.value = v; }
      else {
        if (document.activeElement !== r.rng) r.rng.value = v;
        if (document.activeElement !== r.num) r.num.value = fmt(v);
      }
      r.key.classList.toggle('on', !!L.keyAt(prop, f));
      r.key.classList.toggle('has', !!L.tracks[prop]?.length);
    }
  };
  on('change', update); on('frame', update); on('props', update); on('mode', update);
}
