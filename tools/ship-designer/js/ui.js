// All the panels: outliner, hall / gadget / paint libraries, inspector, view settings, export.
import { app } from './app.js';
import { lib, loadManifest, loadVariant, importPiece, importConnector, importTexture, textureSrc, instantiate, variantOf, isHullPiece } from './assets.js';
import { PARAM_SPECS, paramsOf } from './connector.js';
import { state as paintState } from './paint.js';
import { PROFILE_PRESETS } from './geo.js';
import { doorOptions } from './doors.js';
import { SHAPES, CONN_TYPES, FACES, CONN_PRESETS, childMatrix, matrixToXf } from './ship.js';
import { PRESETS, BACKGROUNDS } from './viewport.js';
import { savePNG, exportModel, saveShipFile, saveShipToResources, openShipObject, saveConnectorStyle } from './export.js';
import { el, clamp, toast, round, fileToDataURL, newId } from './util.js';
import { actionFor, openSettings, keyName, settings, saveSettings } from './settings.js';
import { showMenu } from './ctxmenu.js';
import { BRIDGE_KINDS } from './bridge.js';
import { placeSize } from './layout.js';
import { setBuilderUI, renderModelLeft, renderModelInspector, saveModel, nodeMenu } from './modelbuilder.js';
import { Viz } from './viz.js';
import { CHANNELS, EASES, MODES, PRESETS as CLIP_PRESETS, hingeAt, trackValue, setKeyAt } from './anim.js';
import { initTimeline } from './timeline.js';
import { FX_COLORS, FX_DIRS, newFx } from './fx.js';
import * as THREE from 'three';

const A = app.actions;
const $ = id => document.getElementById(id);
let refreshers = [];

// ------------------------------------------------------------------ small controls
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : String(round(+v, step < 0.01 ? 3 : 2)));

/** label + range + number box. `get` re-reads the value (so a gizmo drag can update the display). */
function slider({ label, get, min, max, step = 0.1, unit = '', onInput, onChange, hardMin, hardMax }) {
  const rng = el('input', { type: 'range', min, max, step });
  const num = el('input', { type: 'number', step, class: 'num' });
  const refresh = () => { const v = get(); rng.value = v; num.value = fmt(v, step); };
  refresh();
  refreshers.push(refresh);
  rng.addEventListener('input', () => { num.value = fmt(rng.value, step); onInput(+rng.value); });
  rng.addEventListener('change', () => onChange?.());
  num.addEventListener('change', () => {
    const v = clamp(+num.value || 0, hardMin ?? min, hardMax ?? max * 4);
    num.value = fmt(v, step);
    rng.value = v;
    onInput(v);
    onChange?.();
  });
  return el('div', { class: 'row slider' }, el('span', { class: 'lbl' }, label), rng, num, el('span', { class: 'unit' }, unit));
}

function select({ label, options, get, onChange }) {
  const s = el('select', { onchange: e => onChange(e.target.value) });
  for (const [v, t] of Object.entries(options)) s.append(el('option', { value: v }, t));
  s.value = get();
  return label ? el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), s) : s;
}

function check({ label, get, onChange }) {
  const c = el('input', { type: 'checkbox', checked: get(), onchange: e => onChange(e.target.checked) });
  return el('label', { class: 'row check' }, c, el('span', {}, label));
}

function section(title, ...kids) {
  return el('details', { class: 'sec', open: true }, el('summary', {}, title), el('div', { class: 'secbody' }, ...kids));
}

function button(label, onclick, cls = '', title = '') {
  return el('button', { class: 'btn ' + cls, onclick, title }, label);
}

// ------------------------------------------------------------------ paint / material editor
const SWATCHES = ['#ffffff', '#d3d8df', '#9aa4b4', '#59616e', '#2a2f38', '#c2452d', '#e0713a', '#e0b341', '#6fae4a', '#3aa6a0', '#3c6fb0', '#7a4fb0', '#b04f8f', '#7d5a3a'];

function textureGrid(current, onPick) {
  const grid = el('div', { class: 'texgrid' });
  const add = (id, name, src) => {
    const b = el('button', { class: 'tex' + (current() === id ? ' on' : ''), title: name, onclick: () => { onPick(id); grid.querySelectorAll('.tex').forEach(x => x.classList.toggle('on', x === b)); } },
      src ? el('img', { src, alt: name }) : el('span', {}, 'None'));
    grid.append(b);
  };
  add('', 'No texture', '');
  for (const t of lib.textures.values()) if (!t.hidden) add(t.id, t.name, textureSrc(t.id));
  const imp = el('button', { class: 'tex add', title: 'Import your own texture (png / jpg / webp)', onclick: () => pickFiles('image/*', false, async files => {
    const id = await importTexture(files[0]);
    onPick(id);
    app.emit('inspector');
    app.emit('brush');
  }) }, '+');
  grid.append(imp);
  return grid;
}

/** edits a material slot {color, tex, tile, metal, rough, glow}; `fields` limits what is shown */
function matEditor(slot, { onChange, onCommit, fields = ['color', 'tex', 'tile', 'metal', 'rough', 'glow', 'opacity'], swatches = true, rerender = null }) {
  const root = el('div', { class: 'mat' });
  const upd = k => v => { slot[k] = v; onChange(); };
  if (fields.includes('color')) {
    const c = el('input', { type: 'color', value: slot.color, oninput: e => { slot.color = e.target.value; onChange(); }, onchange: () => onCommit() });
    const sw = el('div', { class: 'swatches' }, SWATCHES.map(col => el('button', { class: 'sw', style: { background: col }, title: col, onclick: () => { slot.color = col; c.value = col; onChange(); onCommit(); } })));
    root.append(el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), c, el('span', { class: 'hex' }, slot.color)), swatches ? sw : '');
    c.addEventListener('input', () => { c.nextSibling.textContent = c.value; });
  }
  if (fields.includes('tex')) root.append(el('div', { class: 'lbl small' }, 'Texture'), textureGrid(() => slot.tex, id => { slot.tex = id; onChange(); onCommit(); }));
  if (fields.includes('tile')) root.append(slider({ label: 'Tile size', get: () => slot.tile, min: 0.2, max: 12, step: 0.1, unit: 'm', onInput: upd('tile'), onChange: onCommit }));
  if (fields.includes('metal')) root.append(slider({ label: 'Metal', get: () => slot.metal, min: 0, max: 1, step: 0.05, onInput: upd('metal'), onChange: onCommit, hardMax: 1 }));
  if (fields.includes('rough')) root.append(slider({ label: 'Rough', get: () => slot.rough, min: 0, max: 1, step: 0.05, onInput: upd('rough'), onChange: onCommit, hardMax: 1 }));
  if (fields.includes('glow')) root.append(slider({ label: 'Glow', get: () => slot.glow, min: 0, max: 3, step: 0.1, onInput: upd('glow'), onChange: onCommit }));
  if (fields.includes('opacity')) {
    root.append(slider({ label: 'See-through', get: () => 1 - (slot.opacity ?? 1), min: 0, max: 0.95, step: 0.05, onInput: v => { slot.opacity = 1 - v; onChange(); }, onChange: onCommit, hardMax: 0.95 }),
      el('div', { class: 'row wrap' }, button('Make it glass', () => { Object.assign(slot, { color: '#a8d4ff', tex: '', metal: 0, rough: 0.05, glow: 0, opacity: 0.25 }); onChange(); onCommit(); (rerender || (() => app.emit('inspector')))(); }, 'small', 'Transparent, glossy, light blue')));
  }
  return root;
}

function pickFiles(accept, multiple, cb) {
  const i = el('input', { type: 'file', accept, multiple, style: { display: 'none' } });
  i.addEventListener('change', () => { if (i.files.length) cb([...i.files]); i.remove(); });
  document.body.append(i);
  i.click();
}

// ------------------------------------------------------------------ left panel

// ------------------------------------------------------------------ animations and exhaust
let animOpen = null;
const animTargetName = t => (t.type === 'ship' ? 'The whole ship' : t.type === 'hall' ? (A.hall(t.id)?.name || '(missing hall)') : t.type === 'att' ? (A.att(t.id)?.name || '(missing gadget)') : (A.group(t.id)?.name || '(missing group)'));

/** turn animate mode on (the timeline opens) and bring the picture to the playhead */
function animShow() {
  if (!app.anim.on) A.animMode(true);
  app.sv.animTick(0);
}

/** the pose boxes follow the playhead while it moves (without rebuilding the panel) */
function refreshPose() {
  const clip = A.curClip(), sel = app.anim.sel;
  if (!clip || !sel) return;
  const tr = clip.tracks.find(t => t.id === sel.track);
  if (!tr) return;
  const t = app.anim.state.get(clip.id).t;
  document.querySelectorAll('#leftBody input[data-ch]').forEach(inp => {
    if (document.activeElement === inp) return;
    inp.value = round(trackValue(tr, inp.dataset.ch, t)[+inp.dataset.i], 3);
  });
}
app.anim.refreshPose = refreshPose;

function clipSection(clip) {
  const S = app.anim.state, st = S.get(clip.id), commit = () => A.animEdited();
  const on = S.isOn(clip);
  const verb = clip.mode === 'once' ? (on ? '◀ Close' : '▶ Open') : (on ? '■ Stop' : '▶ Play');
  return [
    el('div', { class: 'row' }, el('input', { type: 'text', class: 'name', value: clip.name, onchange: e => { clip.name = e.target.value || clip.name; A.animEdited(); } }),
      el('button', { class: 'btn small primary', onclick: () => { animShow(); S.toggle(clip); renderLeft(); } }, verb)),
    slider({ label: 'Length', get: () => clip.dur, min: 0.2, max: 20, step: 0.1, unit: 's', onInput: v => { clip.dur = v; }, onChange: commit, hardMin: 0.1, hardMax: 600 }),
    select({ label: 'Plays', options: MODES, get: () => clip.mode, onChange: v => { clip.mode = v; commit(); renderLeft(); } }),
    slider({ label: 'Speed', get: () => clip.speed, min: 0.1, max: 4, step: 0.05, unit: '×', onInput: v => { clip.speed = v; }, onChange: commit, hardMin: 0.01, hardMax: 20 }),
    check({ label: 'Already running in the Visualizer', get: () => clip.auto, onChange: v => { clip.auto = v; commit(); } }),
    el('div', { class: 'row wrap' }, button('Duplicate clip', () => { const c = JSON.parse(JSON.stringify(clip)); c.id = newId('n'); c.name += ' copy'; c.tracks.forEach(t => { t.id = newId('t'); }); app.ship.anims.push(c); app.anim.clipId = c.id; A.animChanged(); }, 'small'), button('Delete clip', () => A.deleteClip(clip.id), 'small danger')),
  ];
}

function trackSection(clip) {
  const sel = app.anim.sel, kids = [];
  const target = A.animTarget();
  for (const tr of clip.tracks) {
    kids.push(el('div', { class: 'trow' + (sel?.track === tr.id ? ' sel' : ''), onclick: () => { app.anim.sel = { track: tr.id, ch: sel?.track === tr.id ? sel.ch : 'rot', k: -1 }; renderLeft(); app.emit('animsel'); } },
      el('span', { class: 'ttl' }, animTargetName(tr.target)), el('button', { class: 'x', title: 'Remove from this clip', onclick: e => { e.stopPropagation(); A.deleteTrack(clip.id, tr.id); } }, '✕')));
  }
  if (!clip.tracks.length) kids.push(el('p', { class: 'muted small' }, 'Nothing moves in this clip yet. Select a hall, gadget or group and add it.'));
  kids.push(el('div', { class: 'row wrap' },
    button(target ? 'Add the selected ' + (target.type === 'att' ? 'gadget' : target.type) : 'Select something to add', () => { if (target) { animShow(); A.addTrack(clip, target); } }, 'small primary'),
    button('Add the whole ship', () => { animShow(); A.addTrack(clip, { type: 'ship' }); }, 'small')));
  return kids;
}

function poseSection(clip) {
  const sel = app.anim.sel, tr = clip.tracks.find(t => t.id === sel?.track);
  if (!tr) return [el('p', { class: 'muted small' }, 'Pick one of the clip\'s objects above to pose it.')];
  const S = app.anim.state, t = S.get(clip.id).t, kids = [];
  const num = (ch, i) => el('input', { type: 'number', class: 'num', step: CHANNELS[ch].step, value: round(trackValue(tr, ch, t)[i], 3), 'data-ch': ch, 'data-i': i, onchange: e => { animShow(); setKeyAt(tr, ch, S.get(clip.id).t, i, +e.target.value || 0); app.anim.sel = { track: tr.id, ch, k: tr[ch].findIndex(k => Math.abs(k.t - S.get(clip.id).t) < 0.02) }; A.animEdited(); } });
  kids.push(el('p', { class: 'muted small' }, `At ${round(t, 2)} s. Type a value to set a key at the playhead (move the playhead on the timeline first).`));
  for (const ch of ['pos', 'rot', 'scl']) kids.push(el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, CHANNELS[ch].label + ' ' + CHANNELS[ch].unit), num(ch, 0), num(ch, 1), num(ch, 2)));
  const pv = i => el('input', { type: 'number', class: 'num', step: 0.05, value: round(tr.pivot[i], 3), onchange: e => { tr.pivot[i] = +e.target.value || 0; A.animEdited(); } });
  kids.push(el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, 'Pivot'), pv(0), pv(1), pv(2)));
  if (tr.target.type === 'hall') kids.push(select({ label: 'Pivot on', options: { '': '(choose…)', centre: 'Middle', back: 'Back edge, bottom', front: 'Front edge, bottom', left: 'Left edge, bottom', right: 'Right edge, bottom', top: 'Top edge', bottom: 'Bottom edge' }, get: () => '', onChange: v => {
    const box = v && app.sv.hallLocalBox(tr.target.id);
    if (!box) return;
    tr.pivot = v === 'centre' ? box.min.clone().add(box.max).multiplyScalar(0.5).toArray().map(x => Math.round(x * 1000) / 1000) : hingeAt(v, box).pivot;
    A.animEdited();
  } }));
  else if (tr.target.type === 'group' || tr.target.type === 'ship') kids.push(el('div', { class: 'row wrap' }, button('Pivot at the middle', () => { tr.pivot = (tr.target.type === 'group' ? A.groupPivot(tr.target.id) : app.sv.bounds.getCenter(new THREE.Vector3())).toArray(); A.animEdited(); }, 'small')));
  kids.push(el('p', { class: 'muted small' }, 'Pivot is the point the object turns and grows about (in its own axes for a hall or gadget, in the ship for a group).'));
  // the selected key
  const k = sel.k >= 0 ? tr[sel.ch]?.[sel.k] : null;
  if (k) {
    kids.push(el('div', { class: 'lbl small' }, `Selected key (${CHANNELS[sel.ch].label})`),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Time'), el('input', { type: 'number', class: 'num wide', step: 0.05, value: round(k.t, 3), onchange: e => { k.t = Math.min(Math.max(+e.target.value || 0, 0), clip.dur); tr[sel.ch].sort((a, b) => a.t - b.t); sel.k = tr[sel.ch].indexOf(k); A.animEdited(); } })),
      select({ label: 'Easing', options: EASES, get: () => k.ease, onChange: v => { k.ease = v; A.animEdited(); } }),
      el('div', { class: 'row wrap' }, button('Delete key', () => { tr[sel.ch].splice(sel.k, 1); sel.k = -1; A.animEdited(); }, 'small danger')));
  }
  return kids;
}

function leftAnimate(body) {
  const anims = app.ship.anims || [], clip = A.curClip();
  const target = A.animTarget();
  body.append(
    section('Animate',
      el('div', { class: 'row wrap' },
        el('button', { class: 'btn primary' + (app.anim.on ? ' on' : ''), onclick: () => { A.animMode(!app.anim.on); renderLeft(); } }, app.anim.on ? '■ Animate mode: ON' : '▶ Animate mode'),
        button('Reset', () => { app.anim.state.reset(); app.sv.animTick(0); renderLeft(); }, 'small')),
      slider({ label: 'Engine power', get: () => Math.round(app.anim.throttle * 100), min: 0, max: 100, step: 1, unit: '%', onInput: v => { app.anim.throttle = v / 100; }, hardMin: 0, hardMax: 100 }),
      el('p', { class: 'muted small' }, 'Animate mode opens the timeline under the view: drag the playhead, double-click a row to add a key, drag keys to move them. Everything is posed with Move, Rotate and Size keyframes. Switch it off to go back to editing. To animate your own: pick a hall, gadget or group, move the playhead, then drag its handles in the view (Move 1 / Rotate 2 / Scale 3): a key is recorded at the playhead. You can also type exact numbers under Pose.')),
    section('Clips',
      ...(anims.length ? [select({ label: 'Clip', options: Object.fromEntries(anims.map(c => [c.id, c.name])), get: () => clip?.id, onChange: v => { app.anim.clipId = v; app.anim.sel = null; renderLeft(); app.emit('animsel'); } })] : [el('p', { class: 'muted small' }, 'No clips yet. A clip is one animation (Open the hatch, Engines idle...).')]),
      el('div', { class: 'row wrap' },
        select({ options: CLIP_PRESETS, get: () => animOpen || 'hinge', onChange: v => { animOpen = v; } }),
        button(target ? 'New clip for selection' : 'New clip', () => { animShow(); A.addClip(animOpen || 'hinge', animOpen === 'empty' ? null : target || (animOpen && animOpen !== 'empty' ? { type: 'ship' } : null)); }, 'small primary')),
      ...(clip ? clipSection(clip) : [])),
    ...(clip ? [section('Moving in this clip', ...trackSection(clip)), section('Pose', ...poseSection(clip))] : []),
    section('Thruster fire and smoke',
      el('p', { class: 'muted small' }, 'Any hall or gadget can have exhaust: select it and use "Exhaust" in its panel (right). A thruster gadget with a spin clip turns its rotor; a hall with exhaust becomes a rocket nozzle. Fire and smoke can be switched off in the Visualizer.')));
}

/** exhaust settings of a hall or gadget */
function fxSection(o, isHall) {
  const commit = () => A.commit(), upd = () => A.fxChanged();
  const kids = [check({ label: 'Has exhaust (fire and smoke)', get: () => !!o.fx, onChange: v => { o.fx = v ? newFx({ dir: isHall ? '-z' : '+y' }) : null; upd(); commit(); renderInspector(); } })];
  if (o.fx) {
    const f = o.fx, off = i => el('input', { type: 'number', class: 'num', step: 0.05, value: round(f.off[i], 2), onchange: e => { f.off[i] = +e.target.value || 0; upd(); commit(); } });
    kids.push(
      select({ label: 'Points', options: FX_DIRS, get: () => f.dir, onChange: v => { f.dir = v; upd(); commit(); } }),
      select({ label: 'Colour', options: Object.fromEntries(Object.entries(FX_COLORS).map(([k, v]) => [k, v[0]])), get: () => f.color, onChange: v => { f.color = v; upd(); commit(); } }),
      check({ label: 'Flame', get: () => f.fire, onChange: v => { f.fire = v; upd(); commit(); } }),
      check({ label: 'Smoke trail', get: () => f.smoke, onChange: v => { f.smoke = v; upd(); commit(); } }),
      slider({ label: 'Flame length', get: () => f.len, min: 0.3, max: 20, step: 0.1, unit: 'm', onInput: v => { f.len = v; upd(); }, onChange: commit, hardMin: 0.05, hardMax: 200 }),
      slider({ label: 'Nozzle radius', get: () => f.r, min: 0.05, max: 4, step: 0.05, unit: 'm', onInput: v => { f.r = v; upd(); }, onChange: commit, hardMin: 0.02, hardMax: 50 }),
      el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, 'Nudge'), off(0), off(1), off(2)),
      el('p', { class: 'muted small' }, (isHall ? 'Starts at the middle of the end it points out of.' : 'Starts at the gadget\'s own centre.') + ' It moves with the hall or gadget when that is animated. Shown in Animate mode and in the Visualizer.'));
  }
  return section('Exhaust (thruster fire & smoke)', ...kids);
}

/** a button in a hall / gadget panel that adds it to the current clip (or starts a new one) */
const animateButton = (type, id) => {
  const n = (app.ship.anims || []).reduce((k, c) => k + c.tracks.filter(t => t.target.type === type && t.target.id === id).length, 0);
  return el('div', { class: 'row wrap' }, button('Animate this…', () => { app.sel = { type, id }; animShow(); const clip = A.curClip(); if (clip) A.addTrack(clip, { type, id }); else A.addClip('empty', null), A.addTrack(A.curClip(), { type, id }); leftTab = 'animate'; renderLeft(); }, 'small'),
    el('span', { class: 'muted small' }, n + ' track(s) in clips'));
};

const TABS = [['ship', 'Ship'], ['halls', 'Halls'], ['gadgets', 'Gadgets'], ['paint', 'Paint'], ['animate', 'Animate']];
let leftTab = 'ship';

function renderLeft() {
  const nav = $('leftTabs');
  if (app.model) {                                       // a model tab has its own panel
    nav.replaceChildren(el('button', { class: 'tab on' }, 'Model'));
    const b = $('leftBody');
    b.replaceChildren();
    renderModelLeft(b);
    return;
  }
  nav.replaceChildren(...TABS.map(([id, name]) => el('button', { class: 'tab' + (id === leftTab ? ' on' : ''), onclick: () => { leftTab = id; renderLeft(); } }, name)));
  const body = $('leftBody');
  body.replaceChildren();
  ({ ship: leftShip, halls: leftHalls, gadgets: leftGadgets, paint: leftPaint, animate: leftAnimate })[leftTab](body);
}

function leftShip(body) {
  const tree = el('div', { class: 'tree' });
  const ship = app.ship;
  const gadgetsOf = id => ship.atts.filter(a => a.hall === id);
  const row = (kind, id, text, cls = '', hidden = false, onHide) => el('div', {
    class: 'trow ' + cls + (app.sel.id === id ? ' sel' : '') + (kind === 'hall' && app.multi.has(id) ? ' multi' : ''),
    onclick: e => {
      if (kind === 'hall' && (e.ctrlKey || e.metaKey || e.shiftKey)) {                // ctrl-click: pick several halls to group them
        if (app.multi.has(id)) app.multi.delete(id); else { app.multi.add(id); if (app.sel.type === 'hall' && app.sel.id !== id) app.multi.add(app.sel.id); }
        renderLeft();
        return;
      }
      app.multi.clear();
      A.select(kind, id);
    },
    oncontextmenu: e => { e.preventDefault(); showContext(e.clientX, e.clientY, { type: kind, id }); },
  },
    el('button', { class: 'eye' + (hidden ? ' off' : ''), title: 'Show / hide', onclick: e => { e.stopPropagation(); onHide?.(); } }, hidden ? '○' : '●'),
    el('span', { class: 'ttl' }, text));
  const node = hall => {
    const kids = ship.halls.filter(h => h.conn && h.conn.parent === hall.id && !h.group);
    const li = el('div', { class: 'node' });
    const via = hall.conn ? ` · ${CONN_TYPES[hall.conn.type].toLowerCase()}` : '';
    li.append(row('hall', hall.id, `${hall.name}${via}`, 'hall', hall.hidden, () => { hall.hidden = !hall.hidden; A.requestHull(); A.commit(); renderLeft(); }));
    const sub = el('div', { class: 'sub' });
    gadgetsOf(hall.id).forEach(a => sub.append(row('att', a.id, a.name || 'Gadget', 'att', a.hidden, () => { a.hidden = !a.hidden; A.requestAtts(); A.commit(); renderLeft(); })));
    kids.forEach(k => sub.append(node(k)));
    if (sub.children.length) li.append(sub);
    return li;
  };
  const roots = ship.halls.filter(h => !h.group && (!h.conn || !ship.halls.some(p => p.id === h.conn.parent)));
  roots.forEach(h => tree.append(node(h)));
  for (const g of ship.groups) {                                                // groups: a folder of halls that move and resize together
    const li = el('div', { class: 'node group' });
    li.append(row('group', g.id, `▣ ${g.name}`, 'hall grp'));
    const sub = el('div', { class: 'sub' });
    ship.halls.filter(h => h.group === g.id).forEach(h => sub.append(node(h)));
    li.append(sub);
    tree.append(li);
  }
  ship.atts.filter(a => !ship.halls.some(h => h.id === a.hall)).forEach(a => tree.append(row('att', a.id, a.name, 'att', a.hidden, () => { a.hidden = !a.hidden; A.requestAtts(); renderLeft(); })));
  if (!ship.halls.length && !ship.atts.length) tree.append(el('p', { class: 'muted' }, 'Nothing here yet. Pick a shape on the Halls tab to start your central hall.'));

  const bridges = ship.bridges.length ? el('div', { class: 'tree' }, ship.bridges.map(b => row('bridge', b.id, `${b.name} · ${BRIDGE_KINDS[b.kind]?.split(' (')[0].toLowerCase() || 'bridge'}`, 'att', b.hidden, () => { A.toggleHidden('bridge', b.id); }))) : null;
  const views = el('div', { class: 'views' });
  ship.views.forEach((v, i) => views.append(el('div', { class: 'vrow' },
    el('button', { class: 'btn small', onclick: () => app.vp.applyView(v) }, v.name),
    el('button', { class: 'btn small ghost', title: 'Delete view', onclick: () => A.deleteView(i) }, '✕'))));
  views.append(button('＋ Save current view', () => { A.saveView(); }, 'small'));
  body.append(section('Hulls & gadgets', app.multi.size > 1 ? el('div', { class: 'row wrap' }, el('b', {}, `${app.multi.size} halls picked`), button('Group them', A.groupSelectedHalls, 'small primary'), button('Clear', () => { app.multi.clear(); renderLeft(); }, 'small')) : '', tree,
    el('p', { class: 'muted small' }, 'Ctrl-click halls to pick several, then Group them: a group moves, turns and resizes as one.')),
    ...(bridges ? [section('Wings & scaffolding', bridges)] : []), section('Saved views', views));
}

const SHAPE_ICON = {
  tube: '<svg viewBox="0 0 64 40"><ellipse cx="14" cy="20" rx="7" ry="14" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M14 6h36a7 14 0 0 1 0 28H14" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
  prism: '<svg viewBox="0 0 64 40"><path d="M10 14l8-9h24l8 9v12l-8 9H18l-8-9z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M42 5l12 6v18l-12 6M50 14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  sphere: '<svg viewBox="0 0 64 40"><circle cx="32" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="2.5"/><ellipse cx="32" cy="20" rx="16" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  profile: '<svg viewBox="0 0 64 40"><path d="M8 20c4-14 10-16 16-16h18c6 0 12 2 14 16-2 14-8 16-14 16H24c-6 0-12-2-16-16z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M28 4c-4 8-4 24 0 32" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  box: '<svg viewBox="0 0 64 40"><path d="M8 12l10-7h32l-10 7zM8 12v22h32V12M40 12l10-7v22l-10 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>',
};
export const shapeIcon = s => { const d = el('span', { class: 'ico' }); d.innerHTML = SHAPE_ICON[s]; return d; };

/** put free-standing hulls down anywhere in the view */
function placeSection() {
  const P = app.placeH, cards = el('div', { class: 'cards shapes small' }), sz = placeSize();
  for (const [shape, name] of Object.entries(SHAPES)) cards.append(el('button', { class: 'card' + (app.tool === 'place' && P.shape === shape ? ' on' : ''), onclick: () => { A.startPlaceHull(shape); renderLeft(); } }, shapeIcon(shape), el('b', {}, name)));
  const num = (label, key) => el('div', { class: 'row' }, el('span', { class: 'lbl' }, label), el('input', { type: 'number', class: 'num wide', step: 0.1, min: 0.3, value: sz[key], onchange: e => { P[key] = Math.max(0.3, +e.target.value || 0); renderLeft(); } }));
  return section('Place a hull',
    el('p', { class: 'muted small' }, 'Pick a shape, then click in the view to put a free-standing hull down where the pointer is (it follows a flat plane, snapped to a grid). Keep clicking to place more · Esc stops. Connect or fuse it to other halls afterwards.'),
    cards, num('Width', 'w'), num('Height', 'h'), num('Length', 'l'),
    slider({ label: 'Turn', get: () => P.yaw, min: -180, max: 180, step: 15, unit: '°', onInput: v => { P.yaw = v; }, hardMin: -360 }),
    el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Plane height'), el('input', { type: 'number', class: 'num wide', step: 0.5, placeholder: 'the middle of the ship', value: P.y ?? '', onchange: e => { P.y = e.target.value === '' ? null : +e.target.value; } })),
    select({ label: 'Grid snap', options: { 0: 'Off', 0.25: '0.25 m', 0.5: '0.5 m', 1: '1 m', 2: '2 m' }, get: () => String(P.snap), onChange: v => { P.snap = +v; } }),
    el('div', { class: 'row wrap' }, button('Add one beside the others', () => A.addDetached(P.shape), 'small')));
}

/** wings, scaffolding, trusses and link halls between two halls */
function bridgeSection() {
  const T = app.bridgeTool, O = app.linkOpts;
  const kinds = { ...BRIDGE_KINDS, hall: 'A hall (tube, box or prism) between them' };
  const rows = [select({ label: 'Join with', options: kinds, get: () => T.kind, onChange: v => { T.kind = v; T.first = null; renderLeft(); if (app.tool === 'bridge') A.startBridge(v); } })];
  if (T.kind === 'hall') {
    rows.push(
      select({ label: 'Hall shape', options: { tube: 'Tube', box: 'Box room', prism: 'Prism' }, get: () => O.shape, onChange: v => { O.shape = v; } }),
      slider({ label: 'Width', get: () => O.w, min: 0.8, max: 8, step: 0.1, unit: 'm', onInput: v => { O.w = v; }, hardMin: 0.4 }),
      slider({ label: 'Height', get: () => O.h, min: 0.8, max: 8, step: 0.1, unit: 'm', onInput: v => { O.h = v; }, hardMin: 0.4 }),
      slider({ label: 'Pushed into each hall', get: () => O.embed, min: 0, max: 1.5, step: 0.05, unit: 'm', onInput: v => { O.embed = v; }, hardMin: 0 }));
  }
  rows.push(
    el('div', { class: 'row wrap' }, button(app.tool === 'bridge' ? 'Click two halls… (Esc stops)' : 'Join two halls…', () => { A.startBridge(T.kind); renderLeft(); }, 'primary')),
    el('p', { class: 'muted small' }, T.kind === 'hall'
      ? 'Click a spot on one hall, then a spot on another: a hall is laid between the two spots, straight along them, and the insides open into both. It hangs off the first hall (fused).'
      : 'Click a spot on one hall, then a spot on the other. The wing, scaffold or truss spans between them and stays on both skins; change its width, thickness, bays and where it meets each hall in the inspector.'));
  return section('Wings, scaffolding & links', ...rows);
}

function leftHalls(body) {
  const empty = !app.ship.halls.length;
  const P = app.placing;
  const cards = el('div', { class: 'cards shapes' });
  for (const [shape, name] of Object.entries(SHAPES)) {
    cards.append(el('button', { class: 'card', onclick: () => (empty ? A.createCentral(shape) : A.startAttach(shape)) }, shapeIcon(shape), el('b', {}, name),
      el('small', {}, empty ? 'Start the ship with this' : 'Click, then click the hull')));
  }
  body.append(el('p', { class: 'lead' }, empty ? 'Start with a central hall.' : 'Add a hall: pick a shape, then click the outside of any hall to join it there.'), cards);
  if (!empty) {
    body.append(section('How it joins',
      select({ label: 'Opening', options: CONN_TYPES, get: () => P.type, onChange: v => { P.type = v; } }),
      select({ label: 'Hall face', options: FACES, get: () => P.face, onChange: v => { P.face = v; } }),
      slider({ label: 'Roll', get: () => P.roll, min: -180, max: 180, step: 5, unit: '°', onInput: v => { P.roll = v; }, hardMin: -360 }),
      select({ label: 'Connector', options: connectorOptions(), get: () => P.style, onChange: v => { P.style = v; } }),
      slider({ label: 'Morph to hall', get: () => P.morph, min: 0, max: 1, step: 0.05, onInput: v => { P.morph = v; }, hardMax: 1 }),
      el('p', { class: 'muted small' }, 'The new hall is joined by its chosen face. The connector neck morphs from the opening in this hull to the face of the new hall (Morph to hall: 0 = keep the opening size, 1 = grow to fit the face). You can change everything afterwards in the inspector.')));
    body.append(placeSection(), bridgeSection());
  }
}

let thumbQueue = null;
function queueThumbs(grid) {
  clearTimeout(thumbQueue);
  const todo = [...lib.pieces.values()].filter(p => !p.thumb);
  const step = async () => {
    if (app.vp.drafting || performance.now() < app.vp.moveUntil) { thumbQueue = setTimeout(step, 400); return; }
    const p = todo.shift();
    if (!p) return;
    await loadVariant(p.id, p.variants[0]?.name);
    const inst = instantiate(p.id, p.variants[0]?.name, { t: 0.2, glass: 0.4 });
    if (inst && !p.thumb) {
      p.thumb = app.vp.thumb(inst);
      grid.querySelectorAll(`img[data-part="${CSS.escape(p.id)}"]`).forEach(i => (i.src = p.thumb));
    }
    thumbQueue = setTimeout(step, 60);
  };
  step();
}

let partFilter = '';
function leftGadgets(body) {
  const search = el('input', { type: 'search', placeholder: 'Search pieces…', value: partFilter, oninput: e => { partFilter = e.target.value; fill(); } });
  const holder = el('div');
  const fill = () => {
    holder.replaceChildren();
    const groups = new Map();
    for (const p of lib.pieces.values()) {
      if (partFilter && !(p.name + ' ' + p.category).toLowerCase().includes(partFilter.toLowerCase())) continue;
      const g = p.kind === 'hull' ? 'Hull pieces (windows & openings)' : p.category;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const order = [...groups.keys()].sort((a, b) => (b.startsWith('Hull')) - (a.startsWith('Hull')) || (a === 'Imported') - (b === 'Imported') || a.localeCompare(b));
    for (const cat of order) {
      const grid = el('div', { class: 'cards parts' });
      groups.get(cat).sort((a, b) => a.name.localeCompare(b.name)).forEach(p => grid.append(el('button', { class: 'card part' + (app.tool === 'gadget' && app.placing.part === p.id ? ' on' : ''), title: p.variants.length > 1 ? `${p.name}: ${p.variants.map(v => v.name).join(', ')}` : p.name, onclick: () => { A.startPlace(p.id); }, oncontextmenu: e => { e.preventDefault(); pieceMenu(e.clientX, e.clientY, p); } },
        el('img', { 'data-part': p.id, src: p.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', alt: '' }), el('b', {}, p.name), p.variants.length > 1 ? el('small', { class: 'badge' }, p.variants.length + ' styles') : '')));
      holder.append(section(cat, grid));
    }
    if (!order.length) holder.append(el('p', { class: 'muted' }, lib.hasServer ? 'Nothing matches.' : 'Start the site with serve.py to list resources/parts, or import a model.'));
    queueThumbs(holder);
  };
  fill();
  const tools = el('div', { class: 'row wrap' },
    button('⬆ Import gadget…', () => pickFiles('.glb,.gltf,.obj,.stl', true, f => importModels(f, 'gadget')), 'primary', 'Import model files: several files become styles of one piece'),
    button('⬆ Import hull piece…', () => pickFiles('.glb,.gltf,.obj,.stl', true, f => importModels(f, 'hull')), '', 'A piece that cuts a hole through the hull (a window, vent...)'),
    button('↻ Reload folder', async () => { await loadManifest(); A.requestHull(); refreshAll(); toast('Reloaded resources/'); }, ''));
  if (app.tool === 'gadget' && app.placing.part) {
    const piece = lib.pieces.get(app.placing.part);
    const vs = piece ? Object.fromEntries(piece.variants.map(v => [v.name, v.name])) : {};
    body.append(el('div', { class: 'placing' }, el('b', {}, `Placing: ${piece?.name || ''}`),
      Object.keys(vs).length > 1 ? select({ label: 'Style', options: vs, get: () => app.placing.variant, onChange: v => { app.placing.variant = v; loadVariant(app.placing.part, v); } }) : '',
      slider({ label: 'Scale', get: () => app.placing.scale, min: 0.1, max: 6, step: 0.05, onInput: v => { app.placing.scale = v; }, hardMin: 0.02 }),
      slider({ label: 'Spin', get: () => app.placing.spin, min: -180, max: 180, step: 5, unit: '°', onInput: v => { app.placing.spin = v; }, hardMin: -360 }),
      piece?.kind === 'hull' ? el('p', { class: 'muted small' }, 'Hull pieces cut a real hole through the wall; glass is see-through.') : ''));
  }
  body.append(tools, el('p', { class: 'muted small' }, 'Add your own: drop .glb .gltf .obj .stl or a .part.json into resources/parts/ and press Reload. Put several files in one sub-folder to make them styles of one piece. +Y of a model points away from the surface it is mounted on.'), search, holder);
}
const leftGadgets_refresh = () => { if (leftTab === 'gadgets') renderLeft(); };

async function importModels(files, kind = 'gadget') {
  let ids = [];
  try {
    if (files.length > 1 && confirm(`Import these ${files.length} files as styles of ONE piece?\n\nOK = one piece with ${files.length} styles\nCancel = ${files.length} separate pieces`)) {
      const first = files[0].name.replace(/\.[^.]+$/, '').replace(/[_\- ]*\d*$/, '') || 'Imported set';
      ids = [await importPiece(files, { kind, name: first })];
    } else for (const f of files) ids.push(await importPiece([f], { kind }));
    for (const id of ids) await loadVariant(id, lib.pieces.get(id).variants[0].name);
  } catch (e) { toast(e.message, 4000); return; }
  leftTab = 'gadgets';
  renderLeft();
  if (ids.length) {
    A.startPlace(ids[ids.length - 1]);
    toast('Imported - click on the ship to place it');
  }
}

function leftPaint(body) {
  const b = app.brush, B = app.brush2;
  const modes = el('div', { class: 'seg' }, [['fill', 'Fill', 'Click a surface to cover it with the paint below'], ['paint', 'Brush', 'Drag over a surface to paint on it, like a canvas'], ['erase', 'Eraser', 'Drag to rub brush paint away']].map(([m, label, tip]) =>
    el('button', { class: 'segbtn' + (B.mode === m ? ' on' : ''), title: tip, onclick: () => { B.mode = m; if (app.tool !== 'paint') A.setTool('paint'); renderLeft(); renderTools(); } }, label)));
  body.append(
    el('p', { class: 'lead' }, 'Paint the ship'),
    el('div', { class: 'row wrap' },
      button('🖌 Paint tool', () => A.setTool(app.tool === 'paint' ? 'select' : 'paint'), app.tool === 'paint' ? 'primary on' : 'primary'),
      el('small', { class: 'muted' }, B.mode === 'fill' ? 'Shift: both sides · Alt: pick up' : 'Alt-click: pick up a colour')),
    modes);
  if (B.mode !== 'fill') {
    body.append(
      slider({ label: 'Brush size', get: () => B.size, min: 0.03, max: 3, step: 0.01, unit: 'm', onInput: v => { B.size = v; }, hardMin: 0.01, hardMax: 12 }),
      slider({ label: 'Softness', get: () => 1 - B.hardness, min: 0, max: 1, step: 0.05, onInput: v => { B.hardness = 1 - v; }, hardMax: 1 }),
      slider({ label: 'Flow', get: () => B.flow, min: 0.05, max: 1, step: 0.05, onInput: v => { B.flow = v; }, hardMin: 0.02, hardMax: 1 }),
      matEditor(b, { onChange: () => app.emit('brush'), onCommit: () => {}, fields: ['color'] }),
      el('p', { class: 'muted small' }, 'Painting goes on top of the surface\'s material, on the outside or the inside of a hall - look from inside (Fly) to paint rooms. Resizing a hall stretches its painting.'),
      section('Painting', el('div', { class: 'row wrap' },
        button('Clear selected hall', () => { const h = A.selHall(); if (h) A.clearPaint(h.id); else toast('Select a hall first'); }, 'small'),
        button('Clear everything', () => { if (confirm('Wipe all brush painting?')) A.clearPaint(null); }, 'small')),
        select({ label: 'Canvas detail', options: { 1024: 'Light (1024)', 2048: 'Normal (2048)', 4096: 'Fine (4096, slow)' }, get: () => String(paintState.res), onChange: v => { paintState.res = +v; toast('Applies to surfaces painted from now on'); } })));
  } else {
    body.append(matEditor(b, { onChange: () => app.emit('brush'), onCommit: () => {} }),
      section('Apply the paint to…',
        el('div', { class: 'row wrap' },
          button('Selected hall outside', () => { const h = A.selHall(); if (h) { A.paintSlot(h, 'ext'); A.commit(); } else toast('Select a hall first'); }, 'small'),
          button('Selected hall inside', () => { const h = A.selHall(); if (h) { A.paintSlot(h, 'int'); A.commit(); } else toast('Select a hall first'); }, 'small'),
          button('Whole ship outside', () => A.paintAll('ext'), 'small'),
          button('Whole ship inside', () => A.paintAll('int'), 'small'))));
  }
}

// ------------------------------------------------------------------ inspector
function renderInspector() {
  refreshers = [];
  const root = $('inspector');
  root.replaceChildren();
  if (app.model) { root.append(...renderModelInspector()); return; }
  if (app.sel.type === 'bridge' && A.bridge(app.sel.id)) { root.append(...inspectBridge(A.bridge(app.sel.id))); return; }
  if (app.sel.type === 'group' && A.group(app.sel.id)) { root.append(...inspectGroup(A.group(app.sel.id))); return; }
  const h = A.selHall(), a = A.selAtt(), lt = app.sel.type === 'light' ? A.light(app.sel.id) : null;
  if (h) root.append(...inspectHall(h));
  else if (a) root.append(...inspectAtt(a));
  else if (lt) root.append(...inspectLight(lt));
  else root.append(...inspectShip());
}

function inspectLight(l) {
  const upd = () => A.requestLights(), commit = () => A.commit();
  const name = el('input', { type: 'text', value: l.name, class: 'name', onchange: e => { l.name = e.target.value || l.name; A.commit(); renderLights(); } });
  const out = [el('div', { class: 'title' }, el('span', { class: 'ico' }, l.type === 'sun' ? '☀' : '●'), name),
    el('p', { class: 'muted small' }, l.type === 'sun' ? 'A distant light (sun, star, back light): it shines from a direction, lighting everything it can reach.' : 'A lamp: lights the space around it. Drag the bulb with the gizmo, or click a surface with the Lamp tool.')];
  const color = el('input', { type: 'color', value: l.color, oninput: e => { l.color = e.target.value; upd(); }, onchange: commit });
  out.push(el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), color),
    slider({ label: 'Brightness', get: () => l.intensity, min: 0, max: l.type === 'sun' ? 6 : 200, step: l.type === 'sun' ? 0.05 : 1, onInput: v => { l.intensity = v; upd(); }, onChange: commit, hardMin: 0, hardMax: 2000 }));
  if (l.type === 'sun') {
    out.push(slider({ label: 'Direction', get: () => l.az, min: -180, max: 180, step: 5, unit: '°', onInput: v => { l.az = v; upd(); }, onChange: commit, hardMin: -360 }),
      slider({ label: 'Height', get: () => l.el, min: -90, max: 90, step: 5, unit: '°', onInput: v => { l.el = v; upd(); }, onChange: commit, hardMin: -90, hardMax: 90 }),
      el('p', { class: 'muted small' }, 'Direction 0° shines from the nose side (+Z); 180° from the tail. Height 90° = straight down. A negative height lights from below.'));
  } else {
    const pos = i => el('input', { type: 'number', class: 'num', step: 0.1, value: round(l.p[i], 2), onchange: e => { l.p[i] = +e.target.value || 0; upd(); commit(); } });
    refreshers.push(() => $('inspector').querySelectorAll('.lightpos input').forEach((inp, i) => { inp.value = round(l.p[i], 2); }));
    out.push(el('div', { class: 'row xyz lightpos' }, el('span', { class: 'lbl' }, 'Position'), pos(0), pos(1), pos(2)),
      slider({ label: 'Reach', get: () => l.reach, min: 0, max: 40, step: 0.5, unit: 'm', onInput: v => { l.reach = v; upd(); }, onChange: commit, hardMin: 0 }),
      el('p', { class: 'muted small' }, 'Reach 0 = the light fades naturally and never quite stops.'),
      slider({ label: 'Flicker', get: () => l.flicker, min: 0, max: 1, step: 0.05, onInput: v => { l.flicker = v; upd(); }, onChange: commit, hardMax: 1 }),
      slider({ label: 'Flicker speed', get: () => l.speed, min: 0.1, max: 6, step: 0.1, onInput: v => { l.speed = v; upd(); }, onChange: commit, hardMin: 0.05 }));
  }
  out.push(check({ label: 'Casts shadows (walls block it)', get: () => l.shadows, onChange: v => { l.shadows = v; upd(); commit(); } }),
    check({ label: 'Switched on', get: () => !l.hidden, onChange: v => { l.hidden = !v; upd(); commit(); renderLights(); } }),
    el('div', { class: 'row wrap end' }, button('Delete light', () => A.deleteLight(l.id), 'small danger')));
  return out;
}

/** the list of lights + the room's fill light */
function renderLights() {
  const root = $('lightPanel'), ship = app.ship;
  const rows = ship.lights.map(l => el('div', { class: 'trow' + (app.sel.id === l.id ? ' sel' : ''), onclick: () => A.select('light', l.id), oncontextmenu: e => { e.preventDefault(); showContext(e.clientX, e.clientY, { type: 'light', id: l.id }); } },
    el('button', { class: 'eye' + (l.hidden ? ' off' : ''), title: 'Switch on / off', onclick: e => { e.stopPropagation(); l.hidden = !l.hidden; A.requestLights(); A.commit(); renderLights(); } }, l.hidden ? '○' : '●'),
    el('span', { class: 'ttl' }, (l.type === 'sun' ? '☀ ' : '💡 ') + l.name)));
  const apply = () => app.vp.applyAmbient();
  root.replaceChildren(section('Lights',
    el('div', { class: 'tree' }, rows.length ? rows : el('p', { class: 'muted small' }, 'No lights: the ship is only lit by the fill below (turn that down too for true darkness).')),
    el('div', { class: 'row wrap' }, button('+ Distant light', () => A.addLight('sun'), 'small', 'A sun, a star or a back light - shines from a direction'),
      button('+ Lamp (click ship)', () => A.setTool('light'), 'small', 'Click a surface, inside or out, to place a lamp'),
      button('+ Lamp (at centre)', () => A.addLight('point'), 'small')),
    slider({ label: 'Room fill', get: () => ship.ambient.env, min: 0, max: 2, step: 0.05, onInput: v => { ship.ambient.env = v; apply(); }, onChange: () => A.commit(), hardMax: 4 }),
    slider({ label: 'Sky fill', get: () => ship.ambient.hemi, min: 0, max: 1.5, step: 0.05, onInput: v => { ship.ambient.hemi = v; apply(); }, onChange: () => A.commit(), hardMax: 4 }),
    el('p', { class: 'muted small' }, 'Fill lights everything a little, shadows or not. 0 and 0 with no lights = pitch dark: lamps only.')));
}

function inspectShip() {
  const s = app.ship;
  return [el('h3', {}, 'Ship'),
    el('p', { class: 'muted small' }, 'Nothing selected. Click a hall or gadget in the view or the Ship list.'),
    slider({ label: 'Wall thickness', get: () => s.wall, min: 0.05, max: 0.8, step: 0.01, unit: 'm', onInput: v => { s.wall = v; A.requestHull(); }, onChange: () => A.commit() }),
    el('p', { class: 'muted small' }, 'Default for every hall; a hall can override it.')];
}

/** arrows that slide the connection point along the surface in the opening's width / height directions */
function nudgeRow(hall) {
  let step = 0.5;
  const mk = (label, du, dv) => button(label, () => A.slideConn(hall, du * step, dv * step), 'small');
  const sel = el('select', { onchange: e => { step = +e.target.value; } }, [0.1, 0.25, 0.5, 1, 2].map(v => el('option', { value: v, selected: v === step }, v + ' m')));
  return el('div', { class: 'row wrap' }, mk('◀', -1, 0), mk('▶', 1, 0), mk('▲', 0, 1), mk('▼', 0, -1), sel);
}

/** a little graph of the hall's shape: drag the dots, click to add one, double-click to remove one */
function profileEditor(hall) {
  if (!hall.profile) hall.profile = PROFILE_PRESETS['Dished ends'].map(p => [...p]);
  const W = 252, H = 96, pad = 10, smax = 1.5;
  const X = t => pad + t * (W - 2 * pad), Y = sc => H - pad - (sc / smax) * (H - 2 * pad);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'profile');
  const mk = (tag, attrs) => { const e = document.createElementNS(svgNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); svg.append(e); return e; };
  const outline = P => 'M' + P.map(([t, sc]) => `${X(t)},${Y(sc)}`).join('L') + 'L' + P.slice().reverse().map(([t, sc]) => `${X(t)},${H - pad + (Y(0) - (H - pad)) + (Y(0) - Y(sc))}`).join('L') + 'Z';
  const lineOf = P => 'M' + P.map(([t, sc]) => `${X(t)},${Y(sc)}`).join('L');
  let shape, line, dots = [], dragging = null;
  /** move the existing shapes (never rebuild them while a dot is held: that would drop the mouse) */
  const update = () => {
    const P = hall.profile;
    shape.setAttribute('d', outline(P));
    line.setAttribute('d', lineOf(P));
    dots.forEach((c, i) => { c.setAttribute('cx', X(P[i][0])); c.setAttribute('cy', Y(P[i][1])); });
  };
  const draw = () => {
    svg.replaceChildren();
    mk('line', { x1: pad, x2: W - pad, y1: Y(1), y2: Y(1), class: 'grid' });
    mk('line', { x1: pad, x2: W - pad, y1: Y(0), y2: Y(0), class: 'grid' });
    const P = hall.profile;
    shape = mk('path', { class: 'shape', d: outline(P) });
    line = mk('path', { class: 'line', d: lineOf(P) });
    dots = P.map((p, i) => {
      const c = mk('circle', { cx: X(p[0]), cy: Y(p[1]), r: 6, class: 'dot' });
      c.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        dragging = i;
        try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }       // the svg itself keeps the mouse, so redrawing dots cannot lose it
      });
      return c;
    });
  };
  svg.addEventListener('pointermove', e => {
    if (dragging === null) return;
    const P = hall.profile, i = dragging, p = P[i];
    const r = svg.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width * W - pad) / (W - 2 * pad), sc = ((H - pad) - (e.clientY - r.top) / r.height * H) / (H - 2 * pad) * smax;
    const lo = i === 0 ? 0 : P[i - 1][0] + 0.003, hi = i === P.length - 1 ? 1 : P[i + 1][0] - 0.003;
    p[0] = i === 0 ? 0 : i === P.length - 1 ? 1 : Math.min(hi, Math.max(lo, t));
    p[1] = Math.min(smax, Math.max(0.02, sc));
    update();
    A.requestHull();
  });
  const release = () => { if (dragging === null) return; dragging = null; A.commit(); A.requestHull(); };
  /** the point nearest the mouse (the svg holds the mouse while dragging, so clicks arrive at the svg, not at the dot) */
  const nearest = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    let best = -1, d = 14;
    hall.profile.forEach((p, i) => { const dd = Math.hypot(X(p[0]) - x, Y(p[1]) - y); if (dd < d) { d = dd; best = i; } });
    return best;
  };
  const removePoint = i => {
    const P = hall.profile;
    if (P.length <= 2) { toast('A profile needs at least two points.'); return; }
    P.splice(i, 1);
    P[0][0] = 0;                                   // the new first / last point becomes the end of the hall
    P[P.length - 1][0] = 1;
    A.requestHull(); A.commit(); draw();
  };
  svg.addEventListener('dblclick', e => { const i = nearest(e); if (i >= 0) { e.preventDefault(); removePoint(i); } });
  svg.addEventListener('contextmenu', e => {
    e.preventDefault();
    dragging = null;
    const i = nearest(e), r = svg.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width * W - pad) / (W - 2 * pad), sc = ((H - pad) - (e.clientY - r.top) / r.height * H) / (H - 2 * pad) * smax;
    showMenu(e.clientX, e.clientY, [
      i >= 0 ? { label: `Delete this point${i === 0 ? ' (the back end)' : i === hall.profile.length - 1 ? ' (the front end)' : ''}`, danger: true, disabled: hall.profile.length <= 2, onclick: () => removePoint(i) } : null,
      i < 0 && t > 0.01 && t < 0.99 ? { label: 'Add a point here', onclick: () => { hall.profile.push([t, Math.min(smax, Math.max(0.02, sc))]); hall.profile.sort((a, b) => a[0] - b[0]); A.requestHull(); A.commit(); draw(); } } : null,
      i >= 0 ? { label: 'Set to the same width as the neighbour before', disabled: i === 0, onclick: () => { hall.profile[i][1] = hall.profile[i - 1][1]; A.requestHull(); A.commit(); draw(); } } : null,
    ], 'Profile point');
  });
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (e.target !== svg && e.target.tagName !== 'path' && e.target.tagName !== 'line')) return;
    const r = svg.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width * W - pad) / (W - 2 * pad), sc = ((H - pad) - (e.clientY - r.top) / r.height * H) / (H - 2 * pad) * smax;
    if (t <= 0.01 || t >= 0.99) return;
    hall.profile.push([t, Math.min(smax, Math.max(0.02, sc))]);
    hall.profile.sort((a, b) => a[0] - b[0]);
    A.requestHull(); A.commit(); draw();
  });
  draw();
  return el('div', {}, svg, el('p', { class: 'muted small' }, 'Left = back of the hall, right = front. Height = how wide the hall is there. Drag dots · click to add · double-click to remove.'));
}

function connectorOptions() {
  return Object.fromEntries([...lib.connectors.values()].map(c => [c.id, c.name + (c.kind === 'model' ? ' (model)' : '')]));
}

/** style picker + the numbers behind the connector's shape; edits are kept on this connection, "Save as style" makes them reusable */
function connectorEditor(hall) {
  const c = hall.conn, commit = () => A.commit();
  const style = lib.connectors.get(c.style);
  const box = el('details', { class: 'sub', open: true }, el('summary', {}, 'Connector style'),
    select({ label: 'Style', options: connectorOptions(), get: () => c.style, onChange: v => { c.style = v; c.params = {}; if (v !== 'builtin:plain' && c.len < 0.8) { c.len = 1.2; toast('Passage lengthened to 1.2 m so the style shows - it shapes the neck between the two halls.'); } A.requestHull(); commit(); renderInspector(); } }));
  if (style?.kind === 'model') {
    box.append(el('p', { class: 'muted small' }, 'An imported model: its ends keep their size and the middle stretches to the passage length; it is resized to the opening at each end.'));
  } else {
    PARAM_SPECS.forEach(([k, label, min, max, step, unit]) => box.append(slider({ label, get: () => paramsOf(c)[k], min, max, step, unit, onInput: v => { c.params[k] = v; A.requestHull(); }, onChange: commit, hardMin: 0 })));
    if (c.len <= 0.15) box.append(el('p', { class: 'muted small' }, 'Give the passage some length to see flares, rings and folds.'));
    box.append(el('div', { class: 'row wrap' },
      button('Reset', () => { c.params = {}; A.requestHull(); commit(); renderInspector(); }, 'small'),
      button('Save as style…', async () => {
        const name = prompt('Name for this connector style?', style?.name === 'Plain collar' ? 'My connector' : style?.name);
        if (!name) return;
        try { await saveConnectorStyle(hall, name); A.requestHull(); commit(); renderInspector(); } catch (e) { toast(e.message, 4000); }
      }, 'small')));
  }
  box.append(el('div', { class: 'row wrap' }, button('⬆ Import connector…', () => pickFiles('.glb,.gltf,.obj,.stl,.json', false, async f => {
    try { c.style = await importConnector(f[0]); c.params = {}; A.requestHull(); commit(); renderInspector(); } catch (e) { toast(e.message, 4000); }
  }), 'small', 'A model (long axis along Z, open at both ends) or a .connector.json style')));
  return box;
}

/** the group a hall belongs to (or a new one) */
function groupPicker(hall) {
  const opts = { '': '(none)', ...Object.fromEntries(app.ship.groups.map(g => [g.id, g.name])), __new: '+ A new group with this hall' };
  return section('Group', select({ label: 'In group', options: opts, get: () => hall.group || '', onChange: v => { if (v === '__new') { app.multi.clear(); A.groupSelectedHalls(); } else A.setHallGroup(hall.id, v || null); } }),
    el('p', { class: 'muted small' }, 'Halls in a group move, turn and resize together (select the group in the list, then use the gizmo or the boxes there).'));
}

/** a wing, scaffold or truss between two halls */
function inspectBridge(br) {
  const commit = () => A.commit(), upd = () => A.requestBridges(), ship = app.ship;
  const hallOpts = Object.fromEntries(ship.halls.map(h => [h.id, h.name]));
  const end = (label, e) => [
    el('div', { class: 'lbl small' }, label),
    select({ label: 'Hall', options: hallOpts, get: () => e.hall, onChange: v => { e.hall = v; upd(); commit(); } }),
    slider({ label: 'Along it', get: () => e.u, min: 0.02, max: 0.98, step: 0.005, onInput: v => { e.u = v; upd(); }, onChange: commit, hardMin: 0.01, hardMax: 0.99 }),
    ...(br.manual ? [slider({ label: 'Around it', get: () => (e.ang * 180) / Math.PI, min: -180, max: 180, step: 1, unit: '°', onInput: v => { e.ang = (v * Math.PI) / 180; upd(); }, onChange: commit, hardMin: -360, hardMax: 360 })] : []),
  ];
  const wing = br.kind === 'wing', truss = br.kind === 'truss';
  const num = (label, key, min, max, step, unit = 'm', hardMin = 0) => slider({ label, get: () => br[key], min, max, step, unit, onInput: v => { br[key] = v; upd(); }, onChange: commit, hardMin, hardMax: max * 8 });
  return [
    el('div', { class: 'row' }, el('input', { type: 'text', class: 'name', value: br.name, onchange: e => { br.name = e.target.value || br.name; commit(); app.emit('tree'); } })),
    select({ label: 'Kind', options: BRIDGE_KINDS, get: () => br.kind, onChange: v => { br.kind = v; upd(); commit(); renderInspector(); } }),
    section('Where it meets the halls', check({ label: 'Meet at the outermost points (facing each other)', get: () => !br.manual, onChange: v => { br.manual = !v; upd(); commit(); renderInspector(); } }), ...end('From', br.a), ...end('To', br.b), num('Pushed in', 'embed', 0, 0.5, 0.01),
      el('p', { class: 'muted small' }, 'The two ends sit on the skin of the halls (a spot along each) at the points that face each other, and hug the curve of the hull, so the structure follows them when they move or change shape without cutting through either. Untick the box above to choose the angle around each hall yourself.')),
    section(wing ? 'The wing' : truss ? 'The truss' : 'The scaffolding',
      num(wing ? 'Chord at the first hall' : 'Width at the first hall', 'chordA', 0.2, 12, 0.05), num(wing ? 'Chord at the second' : 'Width at the second', 'chordB', 0.2, 12, 0.05),
      ...(wing ? [num('Thickness', 'thick', 0.02, 1.2, 0.01), slider({ label: 'Thickness at the tip ×', get: () => br.taper ?? 1, min: 0.2, max: 2, step: 0.05, onInput: v => { br.taper = v; upd(); }, onChange: commit, hardMin: 0.05, hardMax: 6 }), num('Sweep', 'sweep', -8, 8, 0.1, 'm', -50)] : [
        slider({ label: 'Bays', get: () => br.bays, min: 1, max: 24, step: 1, onInput: v => { br.bays = v; upd(); }, onChange: commit, hardMin: 1, hardMax: 80 }),
        num('Strut thickness', 'rad', 0.01, 0.3, 0.005),
        ...(truss ? [slider({ label: 'Sides', get: () => br.sides, min: 3, max: 8, step: 1, onInput: v => { br.sides = v; upd(); }, onChange: commit, hardMin: 3, hardMax: 12 })]
          : [slider({ label: 'Rails', get: () => br.rails, min: 2, max: 8, step: 1, onInput: v => { br.rails = v; upd(); }, onChange: commit, hardMin: 2, hardMax: 16 })])])),
    section('Paint', matEditor(br.mat, { onChange: () => A.requestMats(), onCommit: commit, swatches: false })),
    el('div', { class: 'row wrap end' }, button('Duplicate', () => A.duplicateBridge(br.id), 'small'), button(br.hidden ? 'Show' : 'Hide', () => A.toggleHidden('bridge', br.id), 'small'), button('Delete', () => A.deleteBridge(br.id), 'small danger')),
  ];
}

/** a group of halls: move, turn and resize them all at once */
function inspectGroup(g) {
  const commit = () => A.commit(), members = A.groupMembers(g.id), st = { move: [0, 0, 0], yaw: 90, k: 2 };
  const box = (arr, i) => el('input', { type: 'number', class: 'num', step: 0.5, value: arr[i], onchange: e => { arr[i] = +e.target.value || 0; } });
  return [
    el('div', { class: 'row' }, el('input', { type: 'text', class: 'name', value: g.name, onchange: e => { g.name = e.target.value || g.name; commit(); app.emit('tree'); } })),
    el('p', { class: 'muted small' }, `${A.groupRoots(g.id).length} hall(s) in the group, ${members.length} with everything attached to them. Drag the gizmo in the view: Move (1), Rotate (2), Scale (3) - or type it here.`),
    section('Resize the whole group',
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Scale by'), el('input', { type: 'number', class: 'num wide', step: 0.1, min: 0.1, value: st.k, onchange: e => { st.k = Math.max(0.05, +e.target.value || 1); } })),
      el('div', { class: 'row wrap' }, button('Scale the group', () => A.groupChange(g.id, { k: st.k }), 'primary'), button('Double it', () => A.groupChange(g.id, { k: 2 }), 'small'), button('Halve it', () => A.groupChange(g.id, { k: 0.5 }), 'small')),
      el('p', { class: 'muted small' }, 'Every hall grows about the middle of the group, and so do the gadgets, doorways and fused halls on them.')),
    section('Move and turn',
      el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, 'Move by'), box(st.move, 0), box(st.move, 1), box(st.move, 2)),
      el('div', { class: 'row wrap' }, button('Move the group', () => A.groupChange(g.id, { move: st.move }), 'small')),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Turn by °'), el('input', { type: 'number', class: 'num wide', step: 15, value: st.yaw, onchange: e => { st.yaw = +e.target.value || 0; } })),
      el('div', { class: 'row wrap' }, button('Turn about the up axis', () => A.groupChange(g.id, { yaw: st.yaw }), 'small'))),
    section('Halls', el('div', { class: 'tree' }, A.groupRoots(g.id).map(h => el('div', { class: 'trow', onclick: () => A.select('hall', h.id) }, el('span', { class: 'ttl' }, h.name)))),
      el('p', { class: 'muted small' }, 'Add a hall to the group from its own panel (Group) or by ctrl-clicking halls and pressing Group them.')),
    el('div', { class: 'row wrap end' }, button('Duplicate the group', () => A.duplicateGroup(g.id), 'small'), button('Ungroup', () => A.ungroup(g.id), 'small'), button('Delete group and halls', () => A.deleteGroup(g.id), 'small danger')),
  ];
}

/** a hall laid between two halls: which halls, where along each, how far it reaches in */
function linkSection(hall) {
  const lk = hall.link, commit = () => A.commit(), upd = () => A.requestHull(), opts = Object.fromEntries(app.ship.halls.filter(h => h.id !== hall.id).map(h => [h.id, h.name]));
  const end = (label, e) => [
    select({ label, options: opts, get: () => e.hall, onChange: v => { e.hall = v; upd(); commit(); } }),
    slider({ label: 'Along it', get: () => e.u, min: 0.02, max: 0.98, step: 0.005, onInput: v => { e.u = v; upd(); }, onChange: commit, hardMin: 0.01, hardMax: 0.99 }),
  ];
  return section('Link between two halls',
    el('p', { class: 'muted small' }, 'This hall is held by both halls: it runs straight between their outermost points and is re-aimed and re-measured whenever either one moves, turns or changes shape. Its width and height are in Size.'),
    ...end('From', lk.a), ...end('To', lk.b),
    slider({ label: 'Reaches into each', get: () => lk.embed ?? 0.4, min: 0, max: 1.5, step: 0.05, unit: 'm', onInput: v => { lk.embed = v; upd(); }, onChange: commit, hardMin: 0, hardMax: 4 }),
    el('div', { class: 'row wrap' }, button('Cut loose (make it a free-standing hall)', () => A.cutLinkLoose(hall.id), 'small')));
}

/** halls this one may hang off (not itself, not anything that hangs off it) */
function candidateParents(hall) {
  const below = new Set(branchOfIds(hall.id));
  return app.ship.halls.filter(h => !below.has(h.id));
}
const branchOfIds = id => { const out = [id]; for (let i = 0; i < out.length; i++) app.ship.halls.filter(h => h.conn && h.conn.parent === out[i]).forEach(h => out.push(h.id)); return out; };

/** move this (already joined) hall onto a different parent: pick the hall, the spot is found automatically */
function parentPicker(hall) {
  const opts = Object.fromEntries(candidateParents(hall).map(h => [h.id, h.name]));
  if (!Object.keys(opts).length) return '';
  const sel = select({ label: 'Joined to', options: opts, get: () => hall.conn.parent, onChange: v => { if (v !== hall.conn.parent) A.connectHall(hall.id, v, hall.conn.type, null); } });
  return el('div', {}, sel, el('p', { class: 'muted small' }, 'Pick another hall to hang this one off. The spot where they meet is found from where the two are; use "Pick a new spot" to choose it yourself.'));
}

/** a free-standing hall can be connected to any other hall: choose how, and where */
function connectSection(hall) {
  const opts = Object.fromEntries(candidateParents(hall).map(h => [h.id, h.name]));
  if (!Object.keys(opts).length) return '';
  const st = { parent: Object.keys(opts)[0], type: app.placing.type || 'doorway', face: '' };
  const faces = { '': 'The side that faces it', ...FACES };
  return section('Connect to another hall',
    el('p', { class: 'muted small' }, 'This hall is free-standing. Connect it to a hall so it hangs off it, with a doorway, door, hatch or air lock - or fuse it where it is.'),
    select({ label: 'Connect to', options: opts, get: () => st.parent, onChange: v => { st.parent = v; } }),
    select({ label: 'Opening', options: CONN_TYPES, get: () => st.type, onChange: v => { st.type = v; app.placing.type = v; } }),
    select({ label: 'Joined by', options: faces, get: () => st.face, onChange: v => { st.face = v; app.placing.face = v || app.placing.face; } }),
    el('div', { class: 'row wrap' },
      button('Connect', () => { if (A.connectHall(hall.id, st.parent, st.type, st.face || null)) toast('Connected. Fine-tune it under Connection.'); }, 'primary'),
      button('Pick the spot…', () => { app.placing.type = st.type; app.placing.face = st.face || '-z'; A.startReposition(hall.id); }, 'small', 'Click the outside of the hall it should join')),
    el('p', { class: 'muted small' }, 'Fuse keeps the hall in place and just merges the insides; the others move it to the opening.'));
}

/** change what joins a hall to its parent; a fused hall stays exactly where it is */
function setConnType(hall, v) {
  const c = hall.conn;
  if (c.type === 'fuse' && v !== 'fuse') {                 // a fused hall was never lined up with a port: find where it really meets its parent
    if (A.connectHall(hall.id, c.parent, v, null)) return;
  }
  const rel = v === 'fuse' ? matrixToXf(app.worlds.get(c.parent).clone().invert().multiply(app.worlds.get(hall.id))) : null;
  Object.assign(c, { type: v, ...CONN_PRESETS[v] });
  if (rel) c.rel = rel;
  A.requestHull();
  A.requestConn();
  A.commit();
}

function inspectHall(hall) {
  const S = app.ship;
  const commit = () => A.commit();
  const prop = (key, label, min, max, step, unit = 'm') => slider({ label, get: () => hall[key], min, max, step, unit, onInput: v => A.setHallProp(hall, key, v), onChange: commit, hardMin: min });
  const name = el('input', { type: 'text', value: hall.name, class: 'name', onchange: e => { hall.name = e.target.value || hall.name; A.commit(); app.emit('tree'); } });
  const out = [el('div', { class: 'title' }, shapeIcon(hall.shape), name)];

  const shape = [select({ label: 'Shape', options: SHAPES, get: () => hall.shape, onChange: v => { hall.shape = v; if (v === 'box') hall.sides = 4; else if (v === 'prism' && hall.sides > 16) hall.sides = 6; A.requestHull(); commit(); renderInspector(); } })];
  if (hall.shape === 'prism') shape.push(slider({ label: 'Sides', get: () => hall.sides, min: 3, max: 16, step: 1, onInput: v => { hall.sides = v; A.requestHull(); }, onChange: commit, hardMax: 32 }));
  shape.push(prop('w', 'Width', 0.8, 40, 0.1), prop('h', 'Height', 0.8, 40, 0.1), prop('l', 'Length', 0.8, 120, 0.1));
  if (hall.shape === 'profile') {
    shape.push(select({ label: 'Section', options: { round: 'Round', rect: 'Rectangular' }, get: () => hall.pkind, onChange: v => { hall.pkind = v; A.requestHull(); commit(); } }),
      select({ label: 'Preset', options: { '': 'Start from…', ...Object.fromEntries(Object.keys(PROFILE_PRESETS).map(k => [k, k])) }, get: () => '', onChange: v => { if (v) { hall.profile = PROFILE_PRESETS[v].map(p => [...p]); A.requestHull(); commit(); renderInspector(); } } }),
      profileEditor(hall),
      slider({ label: 'Shrinks toward', get: () => hall.ay || 0, min: -1, max: 1, step: 0.05, onInput: v => { hall.ay = Math.round(v * 100) / 100; A.requestHull(); }, onChange: commit, hardMin: -1, hardMax: 1 }),
      el('p', { class: 'muted small' }, 'Where the narrow parts of the profile sit: -1 = on the bottom (the belly stays flat and the nose or tail closes down to a point below), 0 = the middle, +1 = on the top.'));
  }
  if (hall.shape !== 'sphere' && hall.shape !== 'profile') {
    shape.push(slider({ label: 'Nose taper', get: () => hall.sf, min: 0.05, max: 1.6, step: 0.05, onInput: v => { hall.sf = v; A.requestHull(); }, onChange: commit, hardMin: 0.03 }));
    shape.push(slider({ label: 'Tail taper', get: () => hall.sb, min: 0.05, max: 1.6, step: 0.05, onInput: v => { hall.sb = v; A.requestHull(); }, onChange: commit, hardMin: 0.03 }));
    shape.push(select({ label: 'Taper toward', options: { mid: 'The middle', bottom: 'The bottom (flat belly, point below)', top: 'The top (flat roof)' }, get: () => ((hall.ay || 0) < -0.01 ? 'bottom' : (hall.ay || 0) > 0.01 ? 'top' : 'mid'), onChange: v => { hall.ay = { mid: 0, bottom: -1, top: 1 }[v]; A.requestHull(); commit(); } }),
      el('p', { class: 'muted small' }, 'Where a tapered end shrinks to. Bottom keeps the underside flat while the nose closes down toward it, like the belly of a shuttle; top does the same upside down.'));
  }
  out.push(section('Shape & size', ...shape));

  const walls = [
    check({ label: 'Hollow (has an inside)', get: () => hall.hollow, onChange: v => { hall.hollow = v; A.requestHull(); commit(); renderInspector(); } }),
    check({ label: 'Own wall thickness', get: () => hall.wall != null, onChange: v => { hall.wall = v ? S.wall : null; A.requestHull(); commit(); renderInspector(); } }),
  ];
  if (hall.wall != null) walls.push(slider({ label: 'Wall', get: () => hall.wall, min: 0.05, max: 0.8, step: 0.01, unit: 'm', onInput: v => { A.setHallProp(hall, 'wall', v); }, onChange: commit, hardMin: 0.03 }));
  if (hall.hollow) {
    walls.push(check({ label: 'Flat floor deck', get: () => hall.deck, onChange: v => { hall.deck = v; A.requestHull(); commit(); renderInspector(); } }));
    if (hall.deck) walls.push(check({ label: 'Solid floor (fill the space under the deck)', get: () => !!hall.deckFill, onChange: v => { hall.deckFill = v; A.requestHull(); commit(); } }));
    if (hall.deck) walls.push(slider({ label: 'Deck height', get: () => hall.deckY, min: 0.1, max: Math.max(hall.h - 0.5, 0.5), step: 0.05, unit: 'm', onInput: v => { hall.deckY = v; A.requestHull(); }, onChange: commit }));
  }
  out.push(section('Walls & floor', ...walls));

  // ends: open (the inside runs out through the end) and torn (a jagged breach)
  if (hall.shape !== 'sphere') {
    const ends = [
      check({ label: 'Front end open', get: () => hall.openF, onChange: v => { hall.openF = v; A.requestHull(); commit(); } }),
      check({ label: 'Back end open', get: () => hall.openB, onChange: v => { hall.openB = v; A.requestHull(); commit(); } }),
      slider({ label: 'Torn front', get: () => hall.tear.f, min: 0, max: 8, step: 0.1, unit: 'm', onInput: v => { hall.tear.f = v; if (v > 0) hall.openF = true; A.requestHull(); }, onChange: commit, hardMin: 0 }),
      slider({ label: 'Torn back', get: () => hall.tear.b, min: 0, max: 8, step: 0.1, unit: 'm', onInput: v => { hall.tear.b = v; if (v > 0) hall.openB = true; A.requestHull(); }, onChange: commit, hardMin: 0 }),
      el('div', { class: 'row wrap' }, button('Re-roll the tear', () => { hall.tear.seed = Math.round(Math.random() * 1000) / 10; A.requestHull(); commit(); }, 'small'), el('small', { class: 'muted' }, 'A tear bites a jagged edge out of the end and opens it.')),
    ];
    out.push(section('Open & torn ends', ...ends));
  }

  // slice the hall by up to two planes: half domes, quarter domes, wedges
  {
    const ch = () => A.requestHull();
    const ext = ax => (ax === 'x' ? hall.w : ax === 'y' ? hall.h : hall.l) / 2 + 1;
    const rows = [];
    [['Cut plane', hall.trim], ['Second cut', hall.trim2]].forEach(([lab, tr], i) => {
      if (i === 1 && !hall.trim.axis) return;
      rows.push(select({ label: lab, options: { '': 'No cut', x: 'Across the width (X)', y: 'Across the height (Y)', z: 'Across the length (Z)' }, get: () => tr.axis, onChange: v => { tr.axis = v; ch(); commit(); renderInspector(); } }));
      if (tr.axis) rows.push(
        slider({ label: 'Plane at', get: () => tr.pos, min: -ext(tr.axis), max: ext(tr.axis), step: 0.05, unit: 'm', onInput: v => { tr.pos = v; ch(); }, onChange: commit, hardMin: -200, hardMax: 200 }),
        select({ label: 'Keep', options: { above: 'The + side', below: 'The - side' }, get: () => tr.keep, onChange: v => { tr.keep = v; ch(); commit(); } }));
    });
    rows.push(el('p', { class: 'muted small' }, 'Planes use this hall’s own axes (X across, Y up, Z along). Frame poles and hoops are cut at the same planes. Overlap two halls cut on opposite sides of one plane to give each half its own paint and glass.'));
    out.push(section('Slice by planes', ...rows));
  }

  // bulkheads: internal walls with an optional doorway
  if (hall.shape !== 'sphere' && hall.hollow) {
    const bl = [];
    hall.bulkheads.forEach((b, i) => {
      const hk = b.hole;
      bl.push(el('div', { class: 'sub' },
        el('div', { class: 'row' }, el('b', {}, 'Bulkhead ' + (i + 1)), el('span', { class: 'sp' }), button('✕', () => { hall.bulkheads.splice(i, 1); A.requestHull(); commit(); renderInspector(); }, 'small ghost')),
        slider({ label: 'Position', get: () => b.z, min: -hall.l / 2, max: hall.l / 2, step: 0.1, unit: 'm', onInput: v => { b.z = v; A.requestHull(); }, onChange: commit, hardMin: -200, hardMax: 200 }),
        slider({ label: 'Thickness', get: () => b.th, min: 0.05, max: 1, step: 0.01, unit: 'm', onInput: v => { b.th = v; A.requestHull(); }, onChange: commit, hardMin: 0.03 }),
        select({ label: 'Doorway', options: { none: 'Solid wall', round: 'Round / oval hole', rect: 'Rectangular hole' }, get: () => hk.kind, onChange: v => { hk.kind = v; A.requestHull(); commit(); renderInspector(); } }),
        ...(hk.kind === 'none' ? [] : [
          slider({ label: 'Hole width', get: () => hk.w, min: 0.4, max: 8, step: 0.05, unit: 'm', onInput: v => { hk.w = v; A.requestHull(); }, onChange: commit, hardMin: 0.2 }),
          slider({ label: 'Hole height', get: () => hk.h, min: 0.4, max: 8, step: 0.05, unit: 'm', onInput: v => { hk.h = v; A.requestHull(); }, onChange: commit, hardMin: 0.2 }),
          slider({ label: 'Hole across', get: () => hk.x, min: -4, max: 4, step: 0.05, unit: 'm', onInput: v => { hk.x = v; A.requestHull(); }, onChange: commit, hardMin: -40, hardMax: 40 }),
          slider({ label: 'Hole up', get: () => hk.y, min: -4, max: 4, step: 0.05, unit: 'm', onInput: v => { hk.y = v; A.requestHull(); }, onChange: commit, hardMin: -40, hardMax: 40 })])));
    });
    bl.push(button('＋ Add a bulkhead', () => { hall.bulkheads.push({ z: 0, th: 0.25, hole: { kind: 'round', w: 1.4, h: 2, x: 0, y: 0 } }); A.requestHull(); commit(); renderInspector(); }, 'small'));
    out.push(section('Bulkheads (inside walls)', ...bl));
  }

  // frame: rib rings inside, a lattice of stringers / hoops outside
  {
    const fr = hall.frame, ch = () => { A.requestHull(); };
    const sph = hall.shape === 'sphere';
    out.push(section(sph ? 'Poles & rings' : 'Ribs & frame',
      ...(sph ? [] : [
      slider({ label: 'Inside ribs every', get: () => fr.inSpacing, min: 0, max: 4, step: 0.1, unit: 'm', onInput: v => { fr.inSpacing = v; ch(); }, onChange: commit, hardMin: 0 }),
      slider({ label: 'Rib width', get: () => fr.inWidth, min: 0.04, max: 0.6, step: 0.01, unit: 'm', onInput: v => { fr.inWidth = v; ch(); }, onChange: commit, hardMin: 0.02 }),
      slider({ label: 'Rib depth', get: () => fr.inDepth, min: 0.04, max: 0.8, step: 0.01, unit: 'm', onInput: v => { fr.inDepth = v; ch(); }, onChange: commit, hardMin: 0.02 }),
      ]),
      slider({ label: 'Outside stringers', get: () => fr.outLongs, min: 0, max: 24, step: 1, onInput: v => { fr.outLongs = v; ch(); }, onChange: commit, hardMin: 0, hardMax: 64 }),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Hoops at'), el('input', { type: 'text', placeholder: 'e.g. 0.88, 0.54, 0.02', value: (fr.hoopsAt || []).join(', '), onchange: e => { fr.hoopsAt = e.target.value.split(/[ ,;]+/).map(Number).filter(v => v > 0 && v < 1); ch(); commit(); } })),
      slider({ label: 'Outside hoops', get: () => fr.outHoops, min: 0, max: 24, step: 1, onInput: v => { fr.outHoops = v; ch(); }, onChange: commit, hardMin: 0, hardMax: 64 }),
      slider({ label: 'Pole thickness', get: () => fr.thick, min: 0.02, max: 0.5, step: 0.01, unit: 'm', onInput: v => { fr.thick = v; ch(); }, onChange: commit, hardMin: 0.01 }),
      el('details', { class: 'sub' }, el('summary', {}, 'Frame colour'), matEditor(hall.rib, { onChange: () => A.requestMats(), onCommit: commit })),
      el('p', { class: 'muted small' }, 'Ribs skip the doorways. Stringers sit at the corners of prisms and boxes.')));
  }

  const fused = hall.conn?.type === 'fuse' && !hall.link;
  if (hall.link) out.push(linkSection(hall));
  else if (!hall.conn || fused) {
    const xf = fused ? hall.conn.rel : hall.xf;
    const num = (arr, i, step = 0.1) => el('input', { type: 'number', class: 'num', step, value: round(arr[i], 2), onchange: e => { arr[i] = +e.target.value || 0; A.requestHull(); A.commit(); app.vp.syncGizmo(); } });
    refreshers.push(() => { /* values re-render on selection */ });
    out.push(section(fused ? 'Position (relative to its parent)' : 'Position (free-standing)',
      el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, 'Move'), num(xf.p, 0), num(xf.p, 1), num(xf.p, 2)),
      el('div', { class: 'row xyz' }, el('span', { class: 'lbl' }, 'Rotate°'), num(xf.r, 0, 5), num(xf.r, 1, 5), num(xf.r, 2, 5)),
      el('p', { class: 'muted small' }, 'Drag the gizmo in the view (keys 1 / 2 = move / rotate).' + (fused ? ' It moves with its parent hall.' : ''))));
    if (!hall.conn) out.push(connectSection(hall));
    if (fused) {
      const c = hall.conn, parent = A.hall(c.parent);
      out.push(section('Connection',
        el('p', { class: 'muted small' }, `Fused to ${parent ? parent.name : '(missing)'}: the halls simply overlap and their insides merge (add a bulkhead with a doorway to wall it off). Pick another type to join them with a real tunnel.`),
        select({ label: 'Opening', options: CONN_TYPES, get: () => c.type, onChange: v => { setConnType(hall, v); renderInspector(); } }),
        el('div', { class: 'row wrap' }, button('Pick a new spot…', () => A.startReposition(hall.id), 'small', 'Then click anywhere on the outside of a hull'), button('Detach (free-standing)', () => A.detach(hall.id), 'small')),
        parentPicker(hall)));
    }
  } else {
    const c = hall.conn;
    const parent = A.hall(c.parent);
    const cc = [
      el('p', { class: 'muted small' }, `Joined to ${parent ? parent.name : '(missing)'}`),
      select({ label: 'Opening', options: CONN_TYPES, get: () => c.type, onChange: v => { setConnType(hall, v); A.clampConn(hall); A.requestHull(); commit(); renderInspector(); } }),
      select({ label: 'Joined by', options: FACES, get: () => c.face, onChange: v => { c.face = v; A.clampConn(hall); A.requestHull(); commit(); } }),
      check({ label: 'Round / oval opening', get: () => c.round, onChange: v => { c.round = v; A.clampConn(hall); A.requestHull(); commit(); renderInspector(); } }),
      slider({ label: 'Opening width', get: () => c.w, min: 0.4, max: 8, step: 0.05, unit: 'm', onInput: v => { c.w = v; A.clampConn(hall); A.requestHull(); }, onChange: commit, hardMin: 0.3 }),
    ];
    cc.push(slider({ label: 'Opening height', get: () => c.h, min: 0.4, max: 8, step: 0.05, unit: 'm', onInput: v => { c.h = v; A.clampConn(hall); A.requestHull(); }, onChange: commit, hardMin: 0.3 }));
    cc.push(
      slider({ label: 'Passage length', get: () => c.len, min: 0, max: 12, step: 0.1, unit: 'm', onInput: v => { c.len = v; A.requestHull(); }, onChange: commit, hardMin: 0 }),
      slider({ label: 'Roll', get: () => c.roll, min: -180, max: 180, step: 5, unit: '°', onInput: v => { c.roll = v; A.requestHull(); }, onChange: commit, hardMin: -360 }));
    cc.push(slider({ label: 'Morph to hall', get: () => c.morph || 0, min: 0, max: 1, step: 0.05, onInput: v => { c.morph = v; A.requestHull(); }, onChange: commit, hardMax: 1 }));
    cc.push(select({ label: 'Floor sill', options: { auto: 'Blend (ramp between the floors)', ramp: 'Ramp', step: 'Step down / up', fill: 'Flat sill at the higher floor', none: 'None' }, get: () => c.sill || 'auto', onChange: v => { c.sill = v; A.requestHull(); commit(); } }),
      el('p', { class: 'muted small' }, 'Where the two rooms have floor decks at different heights, this fills the doorway floor so they meet. A longer passage gives a gentler ramp.'));
    if (c.type !== 'doorway') cc.push(select({ label: 'Door style', options: doorOptions(), get: () => c.doorStyle || (c.type === 'door' ? 'builtin:door' : 'builtin:hatch'), onChange: v => { c.doorStyle = v; A.requestConn(); commit(); } }));
    if (c.type !== 'doorway') cc.push(slider({ label: 'Open', get: () => c.open, min: 0, max: 1, step: 0.05, onInput: v => { c.open = v; A.requestConn(); }, onChange: commit, hardMax: 1 }));
    cc.push(el('div', { class: 'lbl small' }, 'Relocate this hall'),
      el('p', { class: 'muted small' }, 'Drag it across the hull in the view (select it first, then press on it and drag), or nudge it:'),
      nudgeRow(hall),
      el('div', { class: 'row wrap' }, button('Pick a new spot…', () => A.startReposition(hall.id), 'small', 'Then click anywhere on the outside of a hull'), button('Detach (free-standing)', () => A.detach(hall.id), 'small')),
      parentPicker(hall));
    cc.push(el('details', { class: 'sub' }, el('summary', {}, 'Frame / door paint'), matEditor(c.mat, { onChange: () => A.requestMats(), onCommit: commit })));
    cc.push(connectorEditor(hall));
    out.push(section('Connection', ...cc));
  }

  out.push(groupPicker(hall));
  out.push(section('Paint',
    el('p', { class: 'muted small' }, 'Outside is what you see from outside the ship; Inside is what you see from within the hall. For a window or cockpit, make the OUTSIDE see-through (and the inside too, to look out from it).'),
    el('div', { class: 'row wrap' }, button('Glass: both sides', () => { for (const sl of [hall.ext, hall.int]) Object.assign(sl, { color: '#a8d4ff', tex: '', metal: 0, rough: 0.05, opacity: 0.25 }); A.requestMats(); A.commit(); renderInspector(); }, 'small', 'Makes the whole hall clear glass; then paint a frame or tint it')),
    el('div', { class: 'lbl small' }, 'Outside'), matEditor(hall.ext, { onChange: () => A.requestMats(), onCommit: commit, swatches: false }),
    el('div', { class: 'lbl small' }, 'Inside'), matEditor(hall.int, { onChange: () => A.requestMats(), onCommit: commit, swatches: false }),
    ...(hall.deck ? [el('div', { class: 'lbl small' }, 'Floor (the deck)'), matEditor(hall.floor, { onChange: () => A.requestMats(), onCommit: commit, swatches: false })] : [])));
  out.push(fxSection(hall, true), animateButton('hall', hall.id));
  out.push(el('div', { class: 'row wrap end' }, button('Attach a hall here…', () => { leftTab = 'halls'; renderLeft(); }, 'small'), button('Frame', () => app.vp.frame(app.sv.bounds), 'small'), button('Delete hall', () => A.deleteHall(hall.id), 'small danger')));
  return out;
}

function inspectAtt(att) {
  const commit = () => A.commit();
  const piece = lib.pieces.get(att.part);
  const isHull = isHullPiece(att.part);
  const upd = () => (isHull ? A.requestHull() : A.requestAtts());
  const hall = A.hall(att.hall);
  const name = el('input', { type: 'text', value: att.name, class: 'name', onchange: e => { att.name = e.target.value; A.commit(); app.emit('tree'); } });
  const pos = i => el('input', { type: 'number', class: 'num', step: 0.05, value: round(att.p[i], 2), onchange: e => { att.p[i] = +e.target.value || 0; upd(); commit(); } });
  refreshers.push(() => { const ins = $('inspector').querySelectorAll('.posrow input'); ins.forEach((inp, i) => { inp.value = round(att.p[i], 2); }); });
  const variants = piece ? Object.fromEntries(piece.variants.map(v => [v.name, v.name])) : {};
  const out = [el('div', { class: 'title' }, el('span', { class: 'ico' }, isHull ? '◻' : '⚙'), name),
    el('p', { class: 'muted small' }, `${isHull ? 'Hull piece (cuts a hole)' : 'Gadget'} on ${hall ? hall.name : 'the ship (free)'} · ${piece?.name || att.part}`)];
  if (Object.keys(variants).length > 1) {
    out.push(select({ label: 'Style', options: variants, get: () => att.variant || piece.variants[0].name, onChange: v => { att.variant = v; loadVariant(att.part, v).then(() => upd()); upd(); commit(); } }));
  }
  const dspec = variantOf(att.part, att.variant)?.def?.decal;
  if (dspec) {
    const d = att.decal || (att.decal = { ...dspec }), upd2 = () => A.requestAtts();
    out.push(section('Decal',
      ...(d.tex ? [] : [el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Text'), el('input', { type: 'text', value: d.text || '', oninput: e => { d.text = e.target.value; upd2(); }, onchange: commit }))]),
      slider({ label: 'Width', get: () => d.w, min: 0.2, max: 12, step: 0.1, unit: 'm', onInput: v => { d.w = v; upd2(); }, onChange: commit, hardMin: 0.05, hardMax: 60 }),
      slider({ label: 'Height', get: () => d.h, min: 0.1, max: 6, step: 0.05, unit: 'm', onInput: v => { d.h = v; upd2(); }, onChange: commit, hardMin: 0.05, hardMax: 30 }),
      el('div', { class: 'row' }, el('span', { class: 'lbl' }, 'Colour'), el('input', { type: 'color', value: d.color || '#d8d4c8', oninput: e => { d.color = e.target.value; upd2(); }, onchange: commit })),
      el('p', { class: 'muted small' }, 'The lettering wraps onto the hull it sits on. Spin turns it; Scale resizes it.')));
  }
  if (isHull) out.push(slider({ label: 'Glass opacity', get: () => att.glass, min: 0.05, max: 1, step: 0.05, onInput: v => { att.glass = v; A.requestAtts(); }, onChange: commit, hardMax: 1 }),
    el('p', { class: 'muted small' }, 'Low = clear glass, 1 = solid pane.'));
  out.push(
    section('Placement',
      slider({ label: 'Scale', get: () => att.s, min: 0.1, max: 6, step: 0.05, onInput: v => { att.s = v; upd(); }, onChange: commit, hardMin: 0.02 }),
      slider({ label: 'Spin', get: () => att.spin, min: -180, max: 180, step: 5, unit: '°', onInput: v => { att.spin = v; upd(); }, onChange: commit, hardMin: -360 }),
      slider({ label: 'Tilt fwd/back', get: () => att.tx, min: -90, max: 90, step: 5, unit: '°', onInput: v => { att.tx = v; upd(); }, onChange: commit, hardMin: -180 }),
      slider({ label: 'Tilt sideways', get: () => att.tz, min: -90, max: 90, step: 5, unit: '°', onInput: v => { att.tz = v; upd(); }, onChange: commit, hardMin: -180 }),
      el('div', { class: 'row xyz posrow' }, el('span', { class: 'lbl' }, 'Position'), pos(0), pos(1), pos(2)),
      el('p', { class: 'muted small' }, 'Gizmo: keys 1 = move, 3 = scale.'),
      el('div', { class: 'row wrap' }, button('Snap to hull', () => A.snapAtt(att.id), 'small'), button('Duplicate', () => A.duplicateAtt(att.id), 'small'), button('Mirror copy', () => A.duplicateAtt(att.id, true), 'small'))),
    section('Paint',
      select({ label: 'Colouring', options: { none: 'Original model colours', tint: 'Tint the model', replace: 'Flat colour / texture' }, get: () => att.paint.mode, onChange: v => { att.paint.mode = v; A.requestAtts(); commit(); renderInspector(); } }),
      ...(att.paint.mode === 'none' ? [] : [matEditor(att.paint, { onChange: () => A.requestAtts(), onCommit: commit, fields: att.paint.mode === 'tint' ? ['color'] : ['color', 'tex', 'tile'] })])),
    ...(isHull ? [] : [fxSection(att, false), animateButton('att', att.id)]),
    el('div', { class: 'row wrap end' }, button('Delete', () => A.deleteAtt(att.id), 'small danger')));
  return out;
}

// ------------------------------------------------------------------ right-hand view + export panels
const LENS_FOV = mm => (2 * Math.atan(12 / mm) * 180) / Math.PI;
const view = { lens: 28, bg: 'space', grid: true, shadows: true, wire: false, xray: false, cut: false, cutAxis: 'x', cutT: 0.5, cutFlip: false, speed: 6, png: 2400, transparent: false, scope: 'ship', format: 'glb' };

function applyView() {
  const vp = app.vp;
  vp.setFov(LENS_FOV(view.lens));
  vp.setBackground(view.bg);
  vp.setGrid(view.grid);
  vp.setShadows(view.shadows);
  vp.fly.speed = view.speed;
  app.sv.display = { ...app.sv.display, xray: view.xray, wire: view.wire };
  vp.setCut({ on: view.cut, axis: view.cutAxis, t: view.cutT, flip: view.cutFlip });
}

/** one switch for the fast mode: nothing is lit by lamps, everything is evenly lit, no light work happens */
function setFlat(on) {
  settings.flatLight = on;
  saveSettings();
  app.vp.applySettings();
  renderCamBar();
  renderViewPanel();
  toast(on ? 'Flat lighting: lamps and shadows are off while you work' : 'Lamps and shadows are back on');
}

function renderViewPanel() {
  const root = $('viewPanel');
  root.replaceChildren(
    section('Display',
      select({ label: 'Background', options: Object.fromEntries(Object.entries(BACKGROUNDS).map(([k, v]) => [k, v.label])), get: () => view.bg, onChange: v => { view.bg = v; applyView(); } }),
      el('div', { class: 'row wrap' }, button('Sky picture…', () => pickFiles('image/*', false, async f => app.vp.setSkyImage(await fileToDataURL(f[0]))), 'small', 'A wide panorama (equirectangular) as the background'), button('Remove sky', () => app.vp.setSkyImage(null), 'small')),
      check({ label: 'Ground grid', get: () => view.grid, onChange: v => { view.grid = v; applyView(); } }),
      check({ label: 'Flat lighting (fastest: no lamps, no shadows)', get: () => settings.flatLight, onChange: v => setFlat(v) }),
      check({ label: 'Shadows', get: () => view.shadows, onChange: v => { view.shadows = v; applyView(); } }),
      check({ label: 'See-through hull', get: () => view.xray, onChange: v => { view.xray = v; applyView(); syncOverlay(); } }),
      check({ label: 'Wireframe', get: () => view.wire, onChange: v => { view.wire = v; applyView(); } })),
    section('Cutaway (see inside)',
      check({ label: 'Slice the ship open', get: () => view.cut, onChange: v => { view.cut = v; applyView(); syncOverlay(); } }),
      select({ label: 'Cut across', options: { x: 'Width (X)', y: 'Height (Y)', z: 'Length (Z)' }, get: () => view.cutAxis, onChange: v => { view.cutAxis = v; applyView(); } }),
      slider({ label: 'Position', get: () => view.cutT, min: 0, max: 1, step: 0.01, onInput: v => { view.cutT = v; applyView(); }, hardMax: 1 }),
      check({ label: 'Keep the other side', get: () => view.cutFlip, onChange: v => { view.cutFlip = v; applyView(); } })),
    section('Walking (fly camera)', slider({ label: 'Speed', get: () => view.speed, min: 1, max: 40, step: 0.5, unit: 'm/s', onInput: v => { view.speed = v; app.vp.fly.speed = v; } }),
      el('p', { class: 'muted small' }, 'Keys move the camera in every mode (orbit slides the view, fly walks): ' + ['forward', 'left', 'back', 'right'].map(a => keyName(settings.keys[a][0])).join(' ') + ' · ' + keyName(settings.keys.down[0]) + ' / ' + keyName(settings.keys.up[0]) + ' down / up · ' + keyName(settings.keys.fast[0]) + ' = fast. Change them in ⚙ Settings.')));
}

function renderExportPanel() {
  const root = $('exportPanel');
  const net = lib.hasServer;
  root.replaceChildren(
    section('Picture (PNG)',
      select({ label: 'Size', options: { 0: 'As shown', 1600: '1600 px long side', 2400: '2400 px', 3600: '3600 px', 4800: '4800 px' }, get: () => String(view.png), onChange: v => { view.png = +v; } }),
      check({ label: 'Transparent background', get: () => view.transparent, onChange: v => { view.transparent = v; } }),
      button('Save this view as PNG', () => savePNG({ longSide: view.png, transparent: view.transparent }), 'primary')),
    section('3D model',
      select({ label: 'What', options: { ship: 'Whole ship', hulls: 'Hulls only', gadgets: 'Gadgets only', hall: 'Selected hall', branch: 'Selected hall + attached halls' }, get: () => view.scope, onChange: v => { view.scope = v; } }),
      select({ label: 'Format', options: { glb: 'GLB (best: colours + textures)', gltf: 'glTF (text)', obj: 'OBJ (shape only)', stl: 'STL (shape only)' }, get: () => view.format, onChange: v => { view.format = v; } }),
      button('Export model', async () => { try { await exportModel(view.scope, view.format); } catch (e) { toast(e.message, 4000); } }, 'primary'),
      el('p', { class: 'muted small' }, 'Metres, Y up, nose toward +Z. Open the GLB in Blender, Unity, Godot, Windows 3D Viewer…')),
    section('Ship file',
      el('div', { class: 'row wrap' },
        button('Save .ship.json', saveShipFile, 'small'),
        button('Open…', () => pickFiles('.json', false, openFile), 'small'),
        net ? button('Save to resources/', async () => { try { await saveShipToResources(); await loadManifest(); } catch (e) { toast(e.message, 4000); } }, 'small') : '')));
}

async function openFile(files) {
  const f = files[0];
  try {
    const obj = JSON.parse(await f.text());
    if (obj.format === 'ship-part' || (!obj.ship && !obj.halls && (obj.nodes || obj.variants))) A.newDoc('model', A.modelFromPart(obj));      // a gadget file opens in the model builder
    else openShipObject(obj);
  } catch (e) { toast('Could not open: ' + e.message, 4000); }
}

// ------------------------------------------------------------------ stage overlays
function renderTools() {
  const t = $('tools');
  if (app.model) {                                      // building a model: just select and the gizmo
    t.replaceChildren(el('button', { class: 'tool' + (app.tool === 'select' ? ' on' : ''), onclick: () => A.setTool('select') }, 'Select', el('kbd', {}, keyName(settings.keys.tool_select[0]))),
      el('button', { class: 'tool' + (app.tool === 'paint' ? ' on' : ''), onclick: () => A.setTool(app.tool === 'paint' ? 'select' : 'paint'), title: 'Paint on the parts with a brush' }, 'Paint', el('kbd', {}, keyName(settings.keys.tool_paint[0]))));
    const g = $('gizmoBar');
    g.replaceChildren(...[['translate', 'Move', '1'], ['rotate', 'Rotate', '2'], ['scale', 'Scale', '3']].map(([m, l, k]) => el('button', { class: 'tool small' + (app.vp.gizmo.mode === m ? ' on' : ''), onclick: () => { app.vp.setGizmoMode(m); renderTools(); } }, l, el('kbd', {}, k))));
    g.style.display = app.vp.gizmo.visible ? '' : 'none';
    $('hint').firstChild.textContent = app.tool === 'paint' ? 'Drag over a part to paint it · set the colour and brush on the left · Esc stops painting' : app.sel.type === 'node' ? 'Drag the gizmo to move (1), rotate (2) or scale (3) · right-click for more · Ctrl+D duplicates' : 'Click a part to edit it. Add parts on the left. Save puts the model in the Gadgets library.';
    return;
  }
  const mk = (id, label, key, title) => el('button', { class: 'tool' + (app.tool === id ? ' on' : ''), title, onclick: () => { if (id === 'hall' && !app.ship.halls.length) { leftTab = 'halls'; renderLeft(); return; } if (app.tool === id) { A.setTool('select'); return; } if (id === 'place') A.startPlaceHull(); else if (id === 'bridge') A.startBridge(app.bridgeTool.kind); else A.setTool(id); if (id === 'hall' && app.tool === 'hall') A.startAttach(app.placing.shape); } }, label, el('kbd', {}, key));
  t.replaceChildren(mk('select', 'Select', 'V', 'Select and move things'), mk('hall', 'Attach hall', 'H', 'Click a hull to attach a new hall'), mk('gadget', 'Place gadget', 'G', 'Click a surface, inside or out, to place the chosen gadget'), mk('paint', 'Paint', 'B', 'Click surfaces to paint them'), mk('light', 'Lamp', 'L', 'Click a surface to place a lamp'), mk('place', 'Place hull', 'P', 'Click in the view to put a free-standing hull down'), mk('bridge', 'Wing / link', 'J', 'Join two halls with a wing, scaffolding, a truss or a hall'));
  const g = $('gizmoBar');
  g.replaceChildren(...[['translate', 'Move', '1'], ['rotate', 'Rotate', '2'], ['scale', 'Scale', '3']].map(([m, l, k]) => el('button', { class: 'tool small' + (app.vp.gizmo.mode === m ? ' on' : ''), onclick: () => { app.vp.setGizmoMode(m); renderTools(); } }, l, el('kbd', {}, k))));
  g.style.display = app.vp.gizmo.visible ? '' : 'none';
  const hints = {
    select: app.sel.id ? (A.selHall()?.conn ? 'Press on the selected hall and drag to slide it along the hull · Delete removes · F frames' : 'Drag the gizmo to move · Delete removes · F frames') : 'Click a hall or gadget to select it. Left-drag orbits, right-drag pans, wheel zooms.',
    hall: app.placing.mode === 'repos' ? 'Click the outside of a hall to move this hall\'s door there · Esc cancels' : `Click the outside of a hall to attach the ${SHAPES[app.placing.shape].toLowerCase()} · Esc cancels`,
    gadget: 'Click a surface (outside or inside) to place it · Esc stops',
    paint: app.brush2.mode === 'fill' ? 'Click a surface to cover it with the paint · Shift = both sides · Alt = pick up the colour · Esc stops' : 'Drag over a surface to paint it (outside or inside) · Alt-click picks up a colour · Esc stops',
    place: 'Click in the view to put the hull down (it follows a flat plane, snapped to a grid) · keep clicking to place more · Esc stops',
    bridge: app.bridgeTool.first ? 'Now click the outside of the other hall · Esc cancels' : 'Click the outside of the first hall, then of the second · Esc cancels',
    light: 'Click a surface (outside or inside) to put a lamp just off it · drag the bulb with the gizmo afterwards · Esc stops',
  };
  $('hint').firstChild.textContent = hints[app.tool];
}

function syncOverlay() { /* placeholder for future per-view overlays */ }

function renderCamBar() {
  const bar = $('camBar');
  const presets = select({ options: { '': 'Camera ▾', ...PRESETS }, get: () => '', onChange: v => { if (v) { app.vp.goPreset(v); renderCamBar(); } } });
  presets.className = 'cam';
  const scheme = select({ options: { standard: 'Orbit · left drag', middle: 'Orbit · middle drag', fly: 'Fly / walk inside' }, get: () => app.vp.scheme, onChange: v => { app.vp.setScheme(v); } });
  scheme.className = 'cam';
  const lens = el('label', { class: 'cam lens' }, 'Lens ', el('input', { type: 'range', min: 14, max: 100, step: 1, value: view.lens, oninput: e => { view.lens = +e.target.value; app.vp.setFov(LENS_FOV(view.lens)); e.target.nextSibling.textContent = view.lens + 'mm'; } }), el('span', {}, view.lens + 'mm'));
  const flat = el('button', { class: 'cam flatbtn' + (settings.flatLight ? ' on' : ''), title: 'Flat lighting: everything evenly lit, no lamps or shadows (much faster)', onclick: () => setFlat(!settings.flatLight) }, settings.flatLight ? '☀ Flat light: ON' : '☀ Flat light');
  const anim = el('button', { class: 'cam flatbtn' + (app.anim.on ? ' on' : ''), title: 'Animate mode: play the ship\'s animations and exhaust', onclick: () => A.animMode(!app.anim.on) }, app.anim.on ? '▶ Animate: ON' : '▶ Animate');
  bar.replaceChildren(presets, scheme, lens, flat, anim);
}

function renderStart() {
  const s = $('start');
  const show = !app.model && !app.ship.halls.length;
  s.style.display = show ? '' : 'none';
  if (!show) return;
  const cards = el('div', { class: 'cards shapes big' });
  for (const [shape, name] of Object.entries(SHAPES)) cards.append(el('button', { class: 'card', onclick: () => A.createCentral(shape) }, shapeIcon(shape), el('b', {}, name)));
  const openExample = async sh => { try { openShipObject(await (await fetch(sh.url)).json()); } catch (e) { toast(e.message); } };
  const ships = lib.ships.slice().sort((x, y) => (/^example ship$/i.test(y.name) ? 1 : 0) - (/^example ship$/i.test(x.name) ? 1 : 0));
  const exCards = ships.length ? el('div', { class: 'row wrap center' }, ...ships.map(sh => el('button', { class: 'btn' + (/^example ship$/i.test(sh.name) ? ' primary' : ''), title: 'Open this ship as your starting point', onclick: () => openExample(sh) }, sh.name))) : '';
  s.replaceChildren(el('div', { class: 'startcard' }, el('h2', {}, 'Design a spaceship'),
    el('p', {}, 'Start from an example ship:'), exCards || el('p', { class: 'muted small' }, 'No examples found (they live in resources/ships).'),
    el('div', { class: 'row wrap center' }, button('Open a ship file…', () => pickFiles('.json', false, openFile), 'small')),
    el('p', {}, 'or start with a central hall:'), cards,
    el('p', { class: 'muted small' }, 'Then add halls through doors, hatches and air locks, place gadgets inside and out, paint, animate, and save pictures or 3D models.')));
}

// ------------------------------------------------------------------ boot
// ------------------------------------------------------------------ tabs
function renderDocBar() {
  const bar = $('docBar');
  const tabs = app.docs.map((d, i) => el('div', {
    class: 'dtab' + (i === app.docIdx && !Viz.open ? ' on' : ''), title: A.docTitle(d),
    onclick: () => { Viz.hide(); A.switchDoc(i); },
    onauxclick: e => { if (e.button === 1) A.closeDoc(i); },
    oncontextmenu: e => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Close', onclick: () => A.closeDoc(i) }, { label: 'Close the other tabs', disabled: app.docs.length < 2, onclick: () => { for (let k = app.docs.length - 1; k >= 0; k--) if (app.docs[k] !== d) A.closeDoc(k); } }]); },
  }, el('span', { class: 'dk' }, d.kind === 'model' ? '◧' : '▲'), el('span', { class: 'dt' }, A.docTitle(d)),
    el('button', { class: 'x', title: 'Close this tab', onclick: e => { e.stopPropagation(); A.closeDoc(i); } }, '✕')));
  const vizTab = el('div', { class: 'dtab vizTab' + (Viz.open ? ' on' : ''), title: 'Fly the ship through a city, over the ocean, through space...', onclick: Viz.toggle }, el('span', { class: 'dk' }, '✈'), el('span', { class: 'dt' }, 'Visualizer'));
  bar.replaceChildren(...tabs, el('button', { class: 'dplus', title: 'New tab', onclick: e => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 2, [
      { label: 'New ship', onclick: () => A.newDoc('ship') },
      { label: 'New model (build a gadget from shapes)', onclick: () => A.newDoc('model') },
      'sep',
      ...lib.ships.map(sh => ({ label: 'Open example: ' + sh.name, onclick: async () => { try { openShipObject(await (await fetch(sh.url)).json()); } catch (e) { toast(e.message); } } })),
      ...(lib.ships.length ? ['sep'] : []),
      { label: 'Open a file…', onclick: () => pickFiles('.json', false, openFile) },
    ]);
  } }, '+'), vizTab);
}

// ------------------------------------------------------------------ right-click menus
function pieceMenu(x, y, p) {
  const v = p.variants[0];
  showMenu(x, y, [
    { label: 'Place on the ship', onclick: () => A.startPlace(p.id) },
    'sep',
    v?.ext === 'part' ? { label: 'Edit base model (opens a model tab)', onclick: () => A.editPiece(p.id) }
      : { label: v?.url ? 'Open the model file' : 'Imported model (stored in the ship file)', disabled: !v?.url, onclick: () => A.editPiece(p.id) },
  ], p.name);
}

function showContext(x, y, t) {
  if (t.type === 'node') { A.select('node', t.id); showMenu(x, y, nodeMenu(t.id), 'Part'); return; }
  if (!t.type) {
    showMenu(x, y, [{ label: 'Paste', hint: 'Ctrl+V', disabled: !A.hasClip(), onclick: () => A.pasteClipboard() }, 'sep', { label: 'Frame everything', hint: keyName(settings.keys.frame[0]), onclick: () => app.vp.frame(app.sv.bounds) }]);
    return;
  }
  if (app.sel.type !== t.type || app.sel.id !== t.id) A.select(t.type, t.id);
  const hit = t.hit && t.hit.type === 'hall' ? t.hit : null;
  const o = t.type === 'hall' ? A.hall(t.id) : t.type === 'att' ? A.att(t.id) : t.type === 'bridge' ? A.bridge(t.id) : t.type === 'group' ? A.group(t.id) : A.light(t.id);
  if (!o) return;
  if (t.type === 'bridge') {
    showMenu(x, y, [{ label: 'Duplicate', onclick: () => A.duplicateBridge(o.id) }, { label: o.hidden ? 'Show' : 'Hide', onclick: () => A.toggleHidden('bridge', o.id) }, { label: 'Rename…', onclick: A.renameSelection }, 'sep', { label: 'Delete', hint: keyName(settings.keys.delete[0]), danger: true, onclick: () => A.deleteBridge(o.id) }], o.name);
    return;
  }
  if (t.type === 'group') {
    showMenu(x, y, [{ label: 'Double its size', onclick: () => A.groupChange(o.id, { k: 2 }) }, { label: 'Duplicate the group', onclick: () => A.duplicateGroup(o.id) }, { label: 'Rename…', onclick: A.renameSelection }, 'sep', { label: 'Ungroup', onclick: () => A.ungroup(o.id) }, { label: 'Delete group and halls', danger: true, onclick: () => A.deleteGroup(o.id) }], o.name);
    return;
  }
  const common = [
    { label: 'Copy', hint: 'Ctrl+C', onclick: A.copySelection },
    { label: 'Duplicate', hint: 'Ctrl+D', onclick: A.duplicateSelection },
  ];
  const tail = [
    { label: o.hidden ? 'Show' : 'Hide', onclick: () => A.toggleHidden(t.type, t.id) },
    { label: 'Rename…', onclick: A.renameSelection },
    'sep',
    { label: 'Delete', hint: keyName(settings.keys.delete[0]), danger: true, onclick: A.deleteSelection },
  ];
  let items, title;
  if (t.type === 'att') {
    const piece = lib.pieces.get(o.part), v = piece && (piece.variants.find(x => x.name === o.variant) || piece.variants[0]);
    title = o.name || 'Gadget';
    items = [
      { label: v?.ext === 'part' ? 'Edit base model (opens a model tab)' : v?.url ? 'Open the model file' : 'Imported model (stored in the ship file)', disabled: !v || (v.ext !== 'part' && !v.url), onclick: () => A.editPiece(o.part, o.variant) },
      'sep', ...common,
      { label: 'Mirror copy', onclick: () => A.duplicateAtt(o.id, true) },
      { label: 'Paste here', hint: 'Ctrl+V', disabled: !A.hasClip(), onclick: () => A.pasteClipboard(hit) },
      'sep', ...tail,
    ];
  } else if (t.type === 'hall') {
    title = o.name;
    items = [
      ...common,
      { label: 'Paste here', hint: 'Ctrl+V', disabled: !A.hasClip(), onclick: () => A.pasteClipboard(hit) },
      'sep',
      o.conn ? { label: 'Move its door elsewhere (click a hull)', onclick: () => A.startReposition(o.id) } : null,
      o.conn ? { label: 'Detach (make free-standing)', onclick: () => A.detach(o.id) } : null,
      { label: 'Look inside', onclick: () => app.vp.goPreset('inside') },
      app.multi.size > 1 ? { label: `Group the ${app.multi.size} picked halls`, onclick: A.groupSelectedHalls } : { label: 'Put in a new group', onclick: A.groupSelectedHalls },
      o.group ? { label: 'Select its group', onclick: () => A.select('group', o.group) } : null,
      'sep', ...tail,
    ];
    title += o.conn ? '' : ' (free-standing)';
  } else {
    title = o.name || 'Lamp';
    items = [...common, 'sep', ...tail];
  }
  showMenu(x, y, items, title);
}

export function initUI() {
  setBuilderUI({ slider, select, check, section, button, pickFiles });
  A.showContext = showContext;
  renderDocBar();
  renderLeft();
  renderInspector();
  renderViewPanel();
  renderLights();
  renderExportPanel();
  renderTools();
  renderCamBar();
  renderStart();
  const titleOf = () => (app.model ? app.model.part.name : app.ship.name);
  $('shipName').value = titleOf();
  $('shipName').addEventListener('change', e => { if (app.model) app.model.part.name = e.target.value || 'Model'; else app.ship.name = e.target.value || 'Untitled Ship'; A.commit(); app.emit('doc'); });
  $('btnUndo').onclick = A.undo;
  $('btnRedo').onclick = A.redo;
  $('btnNew').onclick = () => A.newShip();
  $('btnSave').onclick = () => (app.model ? saveModel() : saveShipFile());
  $('btnOpen').onclick = () => pickFiles('.json', false, openFile);
  $('btnSettings').onclick = () => openSettings(() => { app.vp.applySettings(); renderViewPanel(); });

  app.on('tree', () => { renderLeft(); renderStart(); renderLights(); $('shipName').value = titleOf(); renderDocBar(); });
  app.on('doc', () => { renderDocBar(); renderLeft(); renderTools(); renderStart(); renderLights(); renderCamBar(); $('shipName').value = titleOf(); $('shipName').placeholder = app.model ? 'Model name' : 'Ship name'; });
  app.on('sel', () => { renderLeft(); renderTools(); renderLights(); });
  app.on('inspector', () => { renderInspector(); renderTools(); });
  app.on('inspector-values', () => refreshers.forEach(f => f()));
  app.on('tool', () => { renderTools(); if (app.model || leftTab === 'gadgets' || leftTab === 'paint') renderLeft(); });
  app.on('brush', () => { if (leftTab === 'paint') renderLeft(); });
  app.on('viz', renderDocBar);
  app.on('anims', () => { if (leftTab === 'animate') renderLeft(); renderCamBar(); });
  app.on('animsel', () => { if (leftTab === 'animate') renderLeft(); });
  initTimeline();
  app.on('history', () => { $('btnUndo').disabled = !A.canUndo(); $('btnRedo').disabled = !A.canRedo(); renderDocBar(); });
  app.on('camera-mode', renderCamBar);
  app.on('built', () => {
    const tris = app.sv.hull ? Math.round((app.sv.hull.geometry.index ? app.sv.hull.geometry.index.count : app.sv.hull.geometry.attributes.position.count) / 3) : 0;
    const sz = app.sv.bounds.getSize(new (app.sv.bounds.min.constructor)());
    $('stats').textContent = app.ship.halls.length ? `${sz.z.toFixed(1)} × ${sz.x.toFixed(1)} × ${sz.y.toFixed(1)} m · ${tris.toLocaleString()} tris · built in ${Math.round(app.sv.buildMs)} ms` : '';
    renderTools();
  });
  applyView();

  addEventListener('keydown', e => {
    if (app.vizOpen || /^(input|textarea|select)$/i.test(e.target.tagName) || document.querySelector('.modal')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); A.redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); A.duplicateSelection?.(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'c') { A.copySelection?.(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'v') { A.pasteClipboard?.(); }
    else if (k === 'escape') { A.setTool('select'); }
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else switch (actionFor(e.code)) {
      case 'delete': A.deleteSelection(); break;
      case 'tool_select': A.setTool('select'); break;
      case 'tool_hall': if (app.ship.halls.length) A.startAttach(app.placing.shape); break;
      case 'tool_gadget': leftTab = 'gadgets'; renderLeft(); break;
      case 'tool_paint': A.setTool('paint'); break;
      case 'tool_light': A.setTool('light'); break;
      case 'tool_place': A.startPlaceHull(); break;
      case 'tool_bridge': A.startBridge(app.bridgeTool.kind); break;
      case 'frame': app.vp.frame(app.sv.bounds); break;
      case 'gizmo_move': app.vp.setGizmoMode('translate'); renderTools(); break;
      case 'gizmo_rotate': app.vp.setGizmoMode('rotate'); renderTools(); break;
      case 'gizmo_scale': app.vp.setGizmoMode('scale'); renderTools(); break;
    }
  });

  // drop files on the view: ship files open, models become gadgets, images become textures
  const stage = $('stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); });
  stage.addEventListener('drop', async e => {
    e.preventDefault();
    const files = [...e.dataTransfer.files];
    const models = files.filter(f => /\.(glb|gltf|obj|stl)$/i.test(f.name));
    if (models.length) importModels(models, 'gadget');
    for (const f of files) {
      if (/\.json$/i.test(f.name)) openFile([f]);
      else if (/^image\//.test(f.type)) { app.brush.tex = await importTexture(f); app.emit('brush'); toast('Texture imported - find it in the Paint tab'); renderInspector(); }
    }
  });
}

export function refreshAll() {
  renderLeft(); renderInspector(); renderTools(); renderStart(); renderExportPanel();
}
