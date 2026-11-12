// Workspace layout: resizable sidebar / panels / timeline, drag-to-reorder and collapsible panels,
// sidebar docked left or right. Remembered in this browser (localStorage).
import { $, el, clamp } from './state.js';

const KEY = 'animator.layout.v1';
const DEFAULT = {
  dock: 'right', sideW: 290, tlH: 190,
  order: ['colors', 'layers', 'props'],
  weights: { colors: null, layers: 1, props: 1 },     // null = natural height
  collapsed: {},
};
let L = load();

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* storage unavailable */ }
  const out = { ...structuredClone(DEFAULT), ...saved };
  // keep the panel list valid even if panels are added or renamed later
  const known = DEFAULT.order;
  out.order = [...(out.order || []).filter(id => known.includes(id)), ...known.filter(id => !(out.order || []).includes(id))];
  out.weights = { ...DEFAULT.weights, ...(out.weights || {}) };
  out.collapsed = out.collapsed || {};
  return out;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch { /* storage unavailable */ } }

const side = () => $('#side');
const panelEl = id => side().querySelector(`.panel[data-panel="${id}"]`);

function apply() {
  const body = document.body;
  body.classList.toggle('dock-left', L.dock === 'left');
  document.documentElement.style.setProperty('--side-w', clamp(L.sideW, 200, 700) + 'px');
  $('#bottom').style.height = clamp(L.tlH, 90, Math.round(innerHeight * 0.6)) + 'px';
  // panel order, splitters between panels, and sizes
  const s = side();
  s.querySelectorAll('.psplit').forEach(n => n.remove());
  L.order.forEach((id, i) => {
    const p = panelEl(id);
    if (i > 0) s.append(makePanelSplitter(L.order[i - 1], id));
    s.append(p);
    const collapsed = !!L.collapsed[id];
    p.classList.toggle('collapsed', collapsed);
    p.querySelector('.collapse').textContent = collapsed ? '▸' : '▾';
    p.querySelector('.collapse').setAttribute('aria-expanded', String(!collapsed));
    const w = L.weights[id];
    p.style.flex = w == null ? '0 0 auto' : `${w} 1 0px`;
  });
}

/* Generic drag helper for handles: onMove(dx, dy) with offsets from the press point. */
function dragHandle(handle, cursorClass, onStart, onMove) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY;
    onStart?.();
    handle.classList.add('dragging');
    document.body.classList.add('resizing', cursorClass);
    const move = ev => onMove(ev.clientX - x0, ev.clientY - y0);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing', cursorClass);
      save();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

function makePanelSplitter(aboveId, belowId) {
  const h = el('div', { class: 'psplit', role: 'separator', 'aria-orientation': 'horizontal', title: 'Drag to resize' });
  let start = null;
  dragHandle(h, 'rs-row', () => {
    // switch every open panel to weights equal to its current pixel height, then trade height between the two neighbours
    start = {};
    for (const id of L.order) {
      if (L.collapsed[id]) continue;
      const px = panelEl(id).getBoundingClientRect().height;
      start[id] = px;
      L.weights[id] = px;
    }
    apply();
  }, (dx, dy) => {
    const a = nearestOpen(aboveId, -1), b = nearestOpen(belowId, 1);
    if (!a || !b || start[a] == null || start[b] == null) return;
    const total = start[a] + start[b], min = 60;
    const ha = clamp(start[a] + dy, min, total - min);
    L.weights[a] = ha; L.weights[b] = total - ha;
    panelEl(a).style.flex = `${ha} 1 0px`;
    panelEl(b).style.flex = `${total - ha} 1 0px`;
  });
  return h;
}
/* the closest panel in a direction that is not collapsed (collapsed panels can't give or take height) */
function nearestOpen(id, dir) {
  let i = L.order.indexOf(id);
  while (i >= 0 && i < L.order.length) { if (!L.collapsed[L.order[i]]) return L.order[i]; i += dir; }
  return null;
}

export function setDock(dock) { L.dock = dock; apply(); save(); }
export const dockSide = () => L.dock;
export function resetLayout() { L = structuredClone(DEFAULT); apply(); save(); }

export function initLayout() {
  // turn each panel's plain heading into a header with a grip and a collapse button
  for (const p of side().querySelectorAll('.panel')) {
    const id = p.dataset.panel, h4 = p.querySelector(':scope > h4');
    const title = h4.textContent;
    const collapse = el('button', { class: 'collapse', title: 'Collapse / expand', 'aria-label': 'Collapse or expand ' + title,
      onclick: e => { e.stopPropagation(); L.collapsed[id] = !L.collapsed[id]; apply(); save(); } });
    const head = el('div', { class: 'phead', draggable: true, title: 'Drag to move this panel · double-click to collapse',
      ondblclick: () => collapse.click() },
      el('span', { class: 'grip', text: '⋮⋮', 'aria-hidden': 'true' }), el('h4', { text: title }), collapse);
    h4.replaceWith(head);

    // drag a header onto another panel to move it above / below that panel
    head.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-panel', id); e.dataTransfer.effectAllowed = 'move'; p.classList.add('dragging'); });
    head.addEventListener('dragend', () => { p.classList.remove('dragging'); side().querySelectorAll('.panel').forEach(n => n.classList.remove('drop-before', 'drop-after')); });
    p.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes('text/x-panel')) return;
      e.preventDefault();
      const r = p.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
      p.classList.toggle('drop-before', before); p.classList.toggle('drop-after', !before);
    });
    p.addEventListener('dragleave', e => { if (!p.contains(e.relatedTarget)) p.classList.remove('drop-before', 'drop-after'); });
    p.addEventListener('drop', e => {
      const src = e.dataTransfer.getData('text/x-panel');
      const before = p.classList.contains('drop-before');
      p.classList.remove('drop-before', 'drop-after');
      if (!src || src === id) return;
      e.preventDefault();
      L.order = L.order.filter(x => x !== src);
      L.order.splice(L.order.indexOf(id) + (before ? 0 : 1), 0, src);
      apply(); save();
    });
  }

  // sidebar width
  let w0 = 0;
  dragHandle($('#sideSplit'), 'rs-col', () => { w0 = side().getBoundingClientRect().width; }, dx => {
    L.sideW = clamp(Math.round(w0 + (L.dock === 'left' ? dx : -dx)), 200, 700);
    document.documentElement.style.setProperty('--side-w', L.sideW + 'px');
  });
  // timeline height
  let h0 = 0;
  dragHandle($('#tlSplit'), 'rs-row', () => { h0 = $('#bottom').getBoundingClientRect().height; }, (dx, dy) => {
    L.tlH = clamp(Math.round(h0 - dy), 90, Math.round(innerHeight * 0.6));
    $('#bottom').style.height = L.tlH + 'px';
  });
  window.addEventListener('resize', () => { $('#bottom').style.height = clamp(L.tlH, 90, Math.round(innerHeight * 0.6)) + 'px'; });
  apply();
}
