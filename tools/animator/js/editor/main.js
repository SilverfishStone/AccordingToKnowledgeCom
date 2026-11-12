// Editor entry point: loads the project, wires the canvas, pointer input, menus, shortcuts and saving.
import { app, on, emit, $, el, makeCanvas, clamp, requestRender, changed, markUnsaved } from './state.js';
import { Doc } from './doc.js';
import { undo, redo, canUndo, canRedo, undoLabel, redoLabel, metaCmd, beginMeta, commitMeta } from './history.js';
import { TOOLS, setTool } from './tools.js';
import { selectAll, selectNone, invertSelection } from './selection.js';
import { FILTERS, runFilter } from './filters.js';
import { buildToolbar, buildColors, buildLayers, buildProps, swapColors, addLayer, duplicateLayer, deleteLayer, moveLayer, mergeDown, addGroup, groupActive, ungroup,
  flattenImage, transformPixels, clearPixels, fillPixels, importImageLayer, copySelection, pasteInternal } from './panels.js';
import { buildTimeline, setFrame, stepFrame, togglePlay, stop, addKeyAll, removeKeyAll, jumpKey, editProp, toggleMode, goTo } from './timeline.js';
import { exportDialog } from './exporters.js';
import { transformTool } from './transform.js';
import { initLayout, setDock, dockSide, resetLayout } from './layout.js';
import { TEMPLATE_MENU, editTemplate } from './templates.js';
import { motionDialog } from './motions.js';
import { importSketch, pickPhoto } from './sketch.js';
import { replaceLayer, canReplace } from './replace.js';
import { buildMenubar, toast, dialog, formDialog, pickFile, progress } from './ui.js';
import { api, getBlob } from '../api.js';

const pid = new URLSearchParams(location.search).get('id');
const vp = $('#viewport'), stage = $('#stage'), overlay = $('#overlay');
const sctx = stage.getContext('2d'), octx = overlay.getContext('2d');
let pointer = null, strokeActive = false, pan = null, spaceDown = false, saving = false;

/* ---------------- view ---------------- */
function applyView() {
  const v = app.view;
  stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
  stage.style.imageRendering = v.zoom >= 3 ? 'pixelated' : 'auto';
  $('#zoomInfo').textContent = Math.round(v.zoom * 100) + '%';
  drawOverlay();
}
function fitView() {
  const d = app.doc, w = vp.clientWidth, h = vp.clientHeight;
  const z = Math.max(0.02, Math.min((w - 40) / d.width, (h - 40) / d.height));     // never negative, even in a tiny window
  app.view = { zoom: z, x: (w - d.width * z) / 2, y: (h - d.height * z) / 2 };
  applyView();
}
function zoomAt(factor, cx = vp.clientWidth / 2, cy = vp.clientHeight / 2) {
  const v = app.view, z = clamp(v.zoom * factor, 0.02, 64);
  v.x = cx - (cx - v.x) * (z / v.zoom); v.y = cy - (cy - v.y) * (z / v.zoom); v.zoom = z;
  applyView();
}
function setZoom(z) { zoomAt(z / app.view.zoom); }
app.d2s = (x, y) => ({ x: x * app.view.zoom + app.view.x, y: y * app.view.zoom + app.view.y });
app.l2s = (x, y) => {
  const L = app.doc.active;
  if (!L) return app.d2s(x, y);
  const q = app.doc.worldMatrix(L, app.frame).transformPoint(new DOMPoint(x, y));
  return app.d2s(q.x, q.y);
};

/* ---------------- stage rendering ---------------- */
let renderQueued = false;
function render() {
  renderQueued = false;
  app.doc.render(sctx, app.frame);
  drawOverlay();
}
on('render', () => { if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); } });
on('change', requestRender);

/* ---------------- overlay: selection ants, tool gizmos, brush cursor ---------------- */
let antC = null, antPattern = null, antPhase = 0;
function drawOverlay() {
  const dpr = window.devicePixelRatio || 1, w = vp.clientWidth, h = vp.clientHeight;
  if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) { overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, w, h);
  if (!app.doc) return;
  if (app.sel) {
    const d = app.doc;
    if (!antC || antC.width !== d.width || antC.height !== d.height) antC = makeCanvas(d.width, d.height);
    const a = antC.getContext('2d');
    if (!antPattern) {
      const p = makeCanvas(8, 8), pc = p.getContext('2d');
      pc.fillStyle = '#fff'; pc.fillRect(0, 0, 8, 8);
      pc.fillStyle = '#000'; pc.beginPath(); pc.moveTo(0, 0); pc.lineTo(4, 0); pc.lineTo(0, 4); pc.closePath(); pc.moveTo(8, 0); pc.lineTo(8, 4); pc.lineTo(4, 8); pc.lineTo(0, 8); pc.closePath(); pc.fill();
      antPattern = a.createPattern(p, 'repeat');
    }
    antPattern.setTransform(new DOMMatrix().translateSelf(antPhase, 0));
    a.globalCompositeOperation = 'copy'; a.drawImage(app.sel.ring, 0, 0);
    a.globalCompositeOperation = 'source-in'; a.fillStyle = antPattern; a.fillRect(0, 0, d.width, d.height);
    const L = d.active, m = L ? d.worldMatrix(L, app.frame) : new DOMMatrix(), v = app.view;
    octx.save();
    octx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.x, dpr * v.y);
    octx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    octx.imageSmoothingEnabled = v.zoom < 1;
    octx.drawImage(antC, 0, 0);
    octx.restore();
  }
  octx.save();
  if (app.showBounds && !app.tool?.ownsBounds) drawBounds();
  app.tool?.overlay?.(octx);
  octx.restore();
  if (app.tool?.cursorSize && pointer && !pan) {
    const r = Math.max(1, app.opt.size * app.view.zoom / 2);
    octx.beginPath(); octx.arc(pointer.sx, pointer.sy, r, 0, Math.PI * 2);
    octx.strokeStyle = '#000'; octx.lineWidth = 2; octx.stroke();
    octx.strokeStyle = '#fff'; octx.lineWidth = 1; octx.stroke();
  }
}
on('overlay', drawOverlay); on('sel', drawOverlay); on('tool', drawOverlay); on('props', drawOverlay);
setInterval(() => { if (app.sel && app.doc) { antPhase = (antPhase + 1) % 8; drawOverlay(); } }, 140);

/* Dashed box round what the selected layer shows, with its size; dotted box for a small layer's own canvas. */
try { app.showBounds = localStorage.getItem('animator.showBounds') !== 'off'; } catch { app.showBounds = true; }
function drawBounds() {
  const d = app.doc, L = d.active;
  if (!L || !d.shown(L)) return;
  const m = d.worldMatrix(L, app.frame);
  const poly = (b, dash, color) => {
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => { const q = m.transformPoint(new DOMPoint(x, y)); return app.d2s(q.x, q.y); });
    octx.beginPath(); pts.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y))); octx.closePath();
    octx.setLineDash([]); octx.lineWidth = 3; octx.strokeStyle = '#0008'; octx.stroke();
    octx.setLineDash(dash); octx.lineWidth = 1.5; octx.strokeStyle = color; octx.stroke(); octx.setLineDash([]);
    return pts;
  };
  octx.save();
  if (!L.isGroup && (L.canvas.width !== d.width || L.canvas.height !== d.height)) poly({ x: 0, y: 0, w: L.canvas.width, h: L.canvas.height }, [2, 3], '#c3c8d1');
  const b = d.bounds(L, app.frame);
  if (b) {
    const pts = poly(b, [6, 4], '#ffb020');
    // size in document pixels, as it appears on this frame
    const p0 = m.transformPoint(new DOMPoint(b.x, b.y)), p1 = m.transformPoint(new DOMPoint(b.x + b.w, b.y)), p3 = m.transformPoint(new DOMPoint(b.x, b.y + b.h));
    const label = `${L.name}  ${Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y))} × ${Math.round(Math.hypot(p3.x - p0.x, p3.y - p0.y))} px`;
    const top = pts.reduce((a, p) => (p.y < a.y ? p : a));
    octx.font = '11px system-ui, sans-serif';
    const w = octx.measureText(label).width + 10, x = Math.max(2, Math.min(top.x, vp.clientWidth - w - 2)), y = Math.max(16, top.y - 6);
    octx.fillStyle = '#000b'; octx.fillRect(x, y - 13, w, 17);
    octx.fillStyle = '#ffd27a'; octx.fillText(label, x + 5, y);
  }
  octx.restore();
}
export function toggleBounds() {
  app.showBounds = !app.showBounds;
  try { localStorage.setItem('animator.showBounds', app.showBounds ? 'on' : 'off'); } catch { /* storage unavailable */ }
  drawOverlay();
}

/* ---------------- pointer input ---------------- */
function point(e) {
  const r = vp.getBoundingClientRect(), v = app.view;
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const doc = { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom };
  let local = doc;
  const L = app.doc.active;
  if (L) {
    // pointer in the active layer's own pixel space, through every group transform around it
    const q = app.doc.worldMatrix(L, app.frame).inverse().transformPoint(new DOMPoint(doc.x, doc.y));
    local = { x: q.x, y: q.y };
  }
  const pen = e.pointerType === 'pen';
  return { sx, sy, doc, local, pen, pressure: pen ? (e.pressure || 0.5) : 1 };
}
vp.addEventListener('pointerdown', e => {
  if (!app.doc) return;
  document.activeElement?.blur?.();
  vp.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && spaceDown)) { pan = { x: e.clientX, y: e.clientY, vx: app.view.x, vy: app.view.y }; vp.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  stop();
  const p = point(e);
  pointer = p;
  strokeActive = app.tool.down(p, e) !== false;
  drawOverlay();
});
vp.addEventListener('pointermove', e => {
  if (!app.doc) return;
  if (pan) { app.view.x = pan.vx + e.clientX - pan.x; app.view.y = pan.vy + e.clientY - pan.y; applyView(); return; }
  const p = point(e);
  pointer = p;
  $('#posInfo').textContent = `${Math.round(p.doc.x)}, ${Math.round(p.doc.y)}`;
  if (strokeActive) {
    const list = e.getCoalescedEvents?.() || [];
    if (list.length > 1) for (const ce of list) app.tool.move(point(ce), e); else app.tool.move(p, e);
  }
  drawOverlay();
});
const endPointer = e => {
  if (pan) { pan = null; vp.style.cursor = ''; return; }
  if (strokeActive) { strokeActive = false; app.tool.up(point(e), e); changed(); }
  drawOverlay();
};
vp.addEventListener('pointerup', endPointer);
vp.addEventListener('pointercancel', endPointer);
vp.addEventListener('pointerleave', () => { if (!strokeActive) { pointer = null; drawOverlay(); } });
vp.addEventListener('wheel', e => {
  e.preventDefault();
  const r = vp.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
vp.addEventListener('contextmenu', e => e.preventDefault());
new ResizeObserver(() => { if (app.doc) drawOverlay(); }).observe(vp);

/* ---------------- saving ---------------- */
const blobOf = c => new Promise(r => c.toBlob(r, 'image/png'));
async function save(quiet = false) {
  let bar = null;
  if (saving || strokeActive) return;
  saving = true;
  const d = app.doc;
  app.unsaved = false; emit('saved', 'Saving…');
  try {
    // upload changed layer pictures, six at a time
    const queue = d.all().filter(L => !L.isGroup && L.dirty);
    if (!quiet && queue.length > 30) bar = progress('Saving', { cancel: false });
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const L = queue[next++], rev = L.rev;
        await api('PUT', `/api/projects/${pid}/layers/${L.id}`, await blobOf(L.canvas));
        if (L.rev === rev) L.dirty = false;
        if (queue.length > 20) emit('saved', `Saving… ${next}/${queue.length}`);
        bar?.update(next / (queue.length + 1), `Layer ${next} of ${queue.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
    await api('PUT', `/api/projects/${pid}`, d.meta());
    const k = 320 / d.width, t = makeCanvas(320, Math.round(d.height * k));
    d.render(t.getContext('2d'), 0, { scale: k });
    await api('PUT', `/api/projects/${pid}/thumb`, await blobOf(t));
    emit('saved');
    if (!quiet) toast('Saved');
  } catch (err) {
    app.unsaved = true; emit('saved');
    toast('Save failed: ' + err.message, 5000);
    if (err.status === 401) toast('You were signed out. Sign in again in another tab, then save.', 8000);
  } finally { saving = false; bar?.done(); }
}
on('saved', msg => { $('#saveState').textContent = msg || (app.unsaved ? '● Unsaved changes' : 'All changes saved'); });
setInterval(() => { if (app.doc && app.unsaved && !document.querySelector('.backdrop')) save(true); }, 90000);
window.addEventListener('beforeunload', e => { if (app.unsaved) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- commands used by menus + shortcuts ---------------- */
async function importImage() {
  // photos kept in the inbox (sent from a phone) can be used here too; with none, go straight to choosing a file
  let photos = 0;
  try { photos = (await api('GET', '/api/inbox')).items.length; } catch { /* no inbox */ }
  let file, name;
  if (photos) {
    const p = await pickPhoto({ title: 'Import image as layer', intro: 'Pick one of your photos, or choose an image file from this computer.' });
    if (!p) return;
    file = p.blob; name = p.name;
  } else {
    file = await pickFile('image/*');
    if (!file) return;
    name = file.name;
  }
  try { importImageLayer(await createImageBitmap(file, { imageOrientation: 'from-image' }), String(name || '').replace(/\.[^.]+$/, '').slice(0, 40) || 'Image'); }
  catch { toast('That file could not be read as an image'); }
}
async function projectSettings() {
  const d = app.doc;
  const v = await formDialog('Project settings', [
    { key: 'name', label: 'Name', type: 'text', value: d.name },
    { key: 'frames', label: 'Length (frames)', type: 'number', value: d.frames, min: 1, max: 2000 },
    { key: 'fps', label: 'Frames per second', type: 'number', value: d.fps, min: 1, max: 60 },
    { key: 'transparent', label: 'Transparent background', type: 'checkbox', value: !d.bg },
    { key: 'bg', label: 'Background colour', type: 'color', value: d.bg || '#ffffff' },
  ]);
  if (!v) return;
  metaCmd('Project settings', () => {
    d.name = String(v.name || 'Untitled').slice(0, 80);
    d.frames = clamp(Math.round(v.frames) || 1, 1, 2000);
    d.fps = clamp(Math.round(v.fps) || 24, 1, 60);
    d.bg = v.transparent ? null : v.bg;
    app.frame = Math.min(app.frame, d.frames - 1);
  });
}
function nudge(dx, dy) {
  const L = app.doc.active;
  if (!L || L.locked) return;
  const before = beginMeta(), f = app.frame;
  const x = L.value('x', f), y = L.value('y', f);
  editProp(L, 'x', x + dx); editProp(L, 'y', y + dy);
  commitMeta(before, 'Nudge layer');
}
function showShortcuts() {
  const rows = [
    ['Space + drag / middle mouse', 'Pan the canvas'], ['Mouse wheel', 'Zoom'], ['Ctrl+0 / Ctrl+1', 'Fit to window / 100%'],
    ['[ and ]', 'Smaller / larger brush'], ['X / D', 'Swap colours / black & white'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+S', 'Save'], ['Ctrl+C / X / V', 'Copy / cut / paste as new layer'],
    ['Delete', 'Clear the selection (or the layer)'], ['Shift+Backspace', 'Fill with the foreground colour'],
    ['Ctrl+A / Ctrl+Shift+A / Ctrl+I', 'Select all / none / invert'],
    ['Enter', 'Play / pause'], [', and .', 'Previous / next frame'], ['Home / End', 'First / last frame'],
    ['K / Shift+K', 'Add / remove keyframe'], ['Alt+, / Alt+.', 'Previous / next keyframe'], ['Arrow keys (Move tool)', 'Nudge layer (Shift = 10px)'],
    ...TOOLS.map(t => [t.key.toUpperCase(), t.label]),
  ];
  dialog({ title: 'Keyboard shortcuts', buttons: [['Close', null]],
    content: el('div', { class: 'keys' }, rows.flatMap(([k, t]) => [el('kbd', { text: k }), el('span', { text: t })])) });
}

function buildMenus() {
  const filter = id => ({ label: FILTERS[id].name + (FILTERS[id].fields ? '…' : ''), run: () => runFilter(id) });
  buildMenubar($('#menus'), [
    { label: 'File', items: [
      { label: 'Save', key: 'Ctrl+S', run: () => save() },
      '-',
      { label: 'Import image as layer…', run: importImage },
      { label: 'Import photo as pencil sketch…', run: importSketch },
      '-',
      { label: 'Export…', key: 'Ctrl+E', run: exportDialog },
      { label: 'Project settings…', run: projectSettings },
      '-',
      { label: 'Back to projects', run: () => { location.href = 'index.html'; } },
    ] },
    { label: 'Edit', items: [
      { label: () => 'Undo ' + undoLabel(), key: 'Ctrl+Z', run: undo, enabled: canUndo },
      { label: () => 'Redo ' + redoLabel(), key: 'Ctrl+Y', run: redo, enabled: canRedo },
      '-',
      { label: 'Cut', key: 'Ctrl+X', run: () => copySelection(true) },
      { label: 'Copy', key: 'Ctrl+C', run: () => copySelection(false) },
      { label: 'Paste as new layer', key: 'Ctrl+V', run: pasteInternal },
      '-',
      { label: 'Clear', key: 'Delete', run: clearPixels },
      { label: 'Fill with foreground colour', key: 'Shift+Backspace', run: () => fillPixels(app.fg) },
      { label: 'Fill with background colour', run: () => fillPixels(app.bg) },
    ] },
    { label: 'Select', items: [
      { label: 'All', key: 'Ctrl+A', run: selectAll },
      { label: 'None', key: 'Ctrl+Shift+A', run: selectNone },
      { label: 'Invert', key: 'Ctrl+I', run: invertSelection },
    ] },
    { label: 'Layer', items: [
      { label: 'New layer', key: 'Ctrl+Shift+N', run: () => addLayer() },
      { label: 'New group', run: addGroup },
      { label: 'Put layer in a new group', key: 'Ctrl+G', run: groupActive },
      { label: 'Ungroup', key: 'Ctrl+Shift+G', run: ungroup, enabled: () => !!app.doc.active?.isGroup },
      { label: 'Duplicate layer', key: 'Ctrl+J', run: duplicateLayer },
      { label: 'Replace picture with another layer…', run: () => replaceLayer(), enabled: () => canReplace(app.doc.active) },
      { label: 'Delete layer', run: deleteLayer },
      '-',
      { label: 'Raise', run: () => moveLayer(1) },
      { label: 'Lower', run: () => moveLayer(-1) },
      { label: 'Merge down', run: mergeDown },
      { label: 'Flatten image…', run: flattenImage },
      '-',
      { label: 'Flip pixels horizontally', run: () => transformPixels('flipH') },
      { label: 'Flip pixels vertically', run: () => transformPixels('flipV') },
      { label: 'Rotate pixels 90° clockwise', run: () => transformPixels('cw') },
      { label: 'Rotate pixels 90° counter-clockwise', run: () => transformPixels('ccw') },
      { label: 'Rotate pixels 180°', run: () => transformPixels('r180') },
    ] },
    { label: 'Filters', items: [
      filter('brightnessContrast'), filter('hsl'), filter('levels'), filter('threshold'), filter('posterize'), filter('invert'), filter('desaturate'),
      '-', filter('blur'), filter('sharpen'), filter('dropShadow'), '-', filter('colorToAlpha'),
    ] },
    { label: 'Templates', items: [
      ...TEMPLATE_MENU,
      '-',
      { label: 'Settings of the selected template…', run: () => editTemplate(app.doc.active), enabled: () => !!app.doc.active?.template },
    ] },
    { label: 'Animation', items: [
      { label: 'Add a motion to the selected layer…', run: motionDialog },
      '-',
      { label: 'Play / pause', key: 'Enter', run: togglePlay },
      { label: 'Add keyframe', key: 'K', run: addKeyAll },
      { label: 'Remove keyframe', key: 'Shift+K', run: removeKeyAll },
      { label: 'Previous keyframe', key: 'Alt+,', run: () => jumpKey(-1) },
      { label: 'Next keyframe', key: 'Alt+.', run: () => jumpKey(1) },
    ] },
    { label: 'View', items: [
      { label: 'Zoom in', key: '+', run: () => zoomAt(1.25) },
      { label: 'Zoom out', key: '-', run: () => zoomAt(0.8) },
      { label: 'Fit to window', key: 'Ctrl+0', run: fitView },
      { label: 'Actual size (100%)', key: 'Ctrl+1', run: () => setZoom(1) },
      '-',
      { label: () => (dockSide() === 'right' ? 'Move side panels to the left' : 'Move side panels to the right'), run: () => setDock(dockSide() === 'right' ? 'left' : 'right') },
      { label: 'Reset panel layout', run: resetLayout },
      '-',
      { label: () => (app.showBounds ? '✓ ' : '') + 'Show the selected layer’s boundary', key: 'Shift+B', run: toggleBounds },
    ] },
    { label: 'Help', items: [{ label: 'Keyboard shortcuts', run: showShortcuts }] },
  ]);
}

/* ---------------- keyboard ---------------- */
const typing = t => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(t.type)));
document.addEventListener('keydown', e => {
  if (!app.doc || typing(e.target) || document.querySelector('.backdrop')) return;
  if (app.tool?.onKey?.(e)) { e.preventDefault(); return; }     // e.g. Enter / Esc for a pending pixel transform
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  const hit = fn => { e.preventDefault(); fn(); };
  if (k === ' ') { spaceDown = true; vp.style.cursor = 'grab'; e.preventDefault(); return; }
  if (ctrl) {
    if (k === 'z') return hit(e.shiftKey ? redo : undo);
    if (k === 'y') return hit(redo);
    if (k === 's') return hit(() => save());
    if (k === 'e') return hit(exportDialog);
    if (k === 'a') return hit(e.shiftKey ? selectNone : selectAll);
    if (k === 'd') return hit(selectNone);
    if (k === 'i') return hit(invertSelection);
    if (k === 'c') return hit(() => copySelection(false));
    if (k === 'x') return hit(() => copySelection(true));
    if (k === 'j') return hit(duplicateLayer);
    if (k === 'g') return hit(e.shiftKey ? ungroup : groupActive);
    if (k === 'n' && e.shiftKey) return hit(() => addLayer());
    if (k === '0') return hit(fitView);
    if (k === '1') return hit(() => setZoom(1));
    return;
  }
  if (e.altKey) {
    if (k === ',') return hit(() => jumpKey(-1));
    if (k === '.') return hit(() => jumpKey(1));
    return;
  }
  if (k === 'enter') return hit(togglePlay);
  if (k === ',') return hit(() => stepFrame(-1));
  if (k === '.') return hit(() => stepFrame(1));
  if (k === 'home') return hit(() => goTo(0));
  if (k === 'end') return hit(() => goTo(app.doc.frames - 1));
  if (k === 'm') return hit(toggleMode);
  if (k === 'k') return hit(e.shiftKey ? removeKeyAll : addKeyAll);
  if (k === 'delete') return hit(clearPixels);
  if (k === 'backspace') return hit(e.shiftKey ? () => fillPixels(app.fg) : clearPixels);
  if (k === 'b' && e.shiftKey) return hit(toggleBounds);
  if (k === 'x') return hit(swapColors);
  if (k === '[') return hit(() => { app.opt.size = Math.max(1, Math.round(app.opt.size * 0.85) - 1); emit('tool'); });
  if (k === ']') return hit(() => { app.opt.size = Math.min(400, Math.round(app.opt.size * 1.15) + 1); emit('tool'); });
  if (k === '+' || k === '=') return hit(() => zoomAt(1.25));
  if (k === '-') return hit(() => zoomAt(0.8));
  if (k === 'escape') return hit(selectNone);
  if (k.startsWith('arrow') && app.tool.id === 'move') {
    const s = e.shiftKey ? 10 : 1;
    return hit(() => nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0));
  }
  if (k === 'd' && !strokeActive && e.shiftKey) return hit(() => { app.fg = '#000000'; app.bg = '#ffffff'; emit('color'); });
  const t = TOOLS.find(x => x.key === k);
  if (t && !strokeActive) hit(() => setTool(t.id));
});
document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; if (!pan) vp.style.cursor = ''; } });
document.addEventListener('paste', e => {
  if (!app.doc || typing(e.target) || document.querySelector('.backdrop')) return;
  const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
  e.preventDefault();
  if (!item) return pasteInternal();
  createImageBitmap(item.getAsFile()).then(b => importImageLayer(b, 'Pasted')).catch(() => toast('Could not paste that image'));
});

/* ---------------- boot ---------------- */
async function boot() {
  const me = await api('GET', '/api/me');
  if (!me.user || !pid) { location.href = 'index.html'; return; }
  let proj;
  try { proj = await api('GET', '/api/projects/' + pid); }
  catch (err) { $('#loading').textContent = err.message; return; }
  const doc = new Doc({ ...proj.meta, id: pid });
  app.doc = doc;
  stage.width = doc.width; stage.height = doc.height;
  app.stage = stage;
  doc.layers = (proj.meta.layers || []).map(lm => doc.fromMeta(lm));
  const pixelLayers = doc.all().filter(L => !L.isGroup);
  let loaded = 0;
  await Promise.all(pixelLayers.map(async L => {
    try {
      const blob = await getBlob(`api/projects/${pid}/layers/${L.id}`);
      if (blob) L.ctx.drawImage(await createImageBitmap(blob), 0, 0);
    } catch { /* layer image missing: leave it empty */ }
    L.touch(); L.dirty = false;
    $('#loading').textContent = `Loading layers ${++loaded}/${pixelLayers.length}…`;
  }));
  if (!doc.layers.length) doc.addLayer('Layer 1');
  doc.activeId = doc.layer(proj.meta.activeId) ? proj.meta.activeId : doc.layers[doc.layers.length - 1].id;

  initLayout();
  if (!TOOLS.includes(transformTool)) TOOLS.splice(1, 0, transformTool);
  buildMenus(); buildToolbar(); buildColors(); buildLayers(); buildProps(); buildTimeline();
  on('change', () => { $('#docName').textContent = app.doc.name; document.title = app.doc.name + ' – Animator'; });
  on('history', () => { $('#undoInfo').textContent = canUndo() ? 'Last: ' + undoLabel() : ''; });
  on('motion-dialog', motionDialog);
  on('status', t => { $('#status').textContent = t || ''; });
  setTool('brush');
  fitView();
  changed(); emit('frame'); emit('saved');
  $('#loading').remove();
  window.addEventListener('resize', () => drawOverlay());
}
boot().catch(err => { console.error(err); $('#loading').textContent = 'Could not open the project: ' + err.message; });
