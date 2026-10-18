// User settings kept in the browser: rebindable keys, picture quality. The settings dialog lives here too.
import { el, clone } from './util.js';

const KEY = 'shipdesigner.settings.v1';

/** every rebindable action: [id, label, group]. Each can have two keys. */
export const ACTIONS = [
  ['forward', 'Move forward', 'Camera'],
  ['back', 'Move back', 'Camera'],
  ['left', 'Move left', 'Camera'],
  ['right', 'Move right', 'Camera'],
  ['up', 'Move up', 'Camera'],
  ['down', 'Move down', 'Camera'],
  ['fast', 'Hold to move faster', 'Camera'],
  ['frame', 'Frame the whole ship', 'Camera'],
  ['tool_select', 'Select tool', 'Tools'],
  ['tool_hall', 'Attach-hall tool', 'Tools'],
  ['tool_gadget', 'Gadget library', 'Tools'],
  ['tool_paint', 'Paint tool', 'Tools'],
  ['tool_light', 'Lamp tool', 'Tools'],
  ['tool_place', 'Place-a-hull tool', 'Tools'],
  ['tool_bridge', 'Wing / link tool', 'Tools'],
  ['gizmo_move', 'Gizmo: move', 'Tools'],
  ['gizmo_rotate', 'Gizmo: rotate', 'Tools'],
  ['gizmo_scale', 'Gizmo: scale', 'Tools'],
  ['delete', 'Delete the selection', 'Edit'],
];

export const DEFAULT_KEYS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  up: ['KeyE', 'Space'], down: ['KeyQ', 'KeyC'], fast: ['ShiftLeft', 'ShiftRight'], frame: ['KeyF', ''],
  tool_select: ['KeyV', ''], tool_hall: ['KeyH', ''], tool_gadget: ['KeyG', ''], tool_paint: ['KeyB', ''], tool_light: ['KeyL', ''], tool_place: ['KeyP', ''], tool_bridge: ['KeyJ', ''],
  gizmo_move: ['Digit1', ''], gizmo_rotate: ['Digit2', ''], gizmo_scale: ['Digit3', ''], delete: ['Delete', 'Backspace'],
};

const DEFAULTS = { keys: DEFAULT_KEYS, flatLight: false, draftMoving: true, draftScale: 0.6, flicker: false, pixelRatio: 0, softShadows: false, lampShadows: 4, moveSpeed: 1 };

export const settings = (() => {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { /* blocked storage: defaults */ }
  const s = { ...clone(DEFAULTS), ...o };
  s.keys = { ...clone(DEFAULT_KEYS), ...(o.keys || {}) };
  return s;
})();

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* not important */ }
}

/** is any key bound to `action` held down? */
export const held = (action, keys) => (settings.keys[action] || []).some(c => c && keys.has(c));

/** the action a pressed key code triggers (first match) */
export function actionFor(code) {
  for (const [id] of ACTIONS) if ((settings.keys[id] || []).includes(code)) return id;
  return null;
}

export function keyName(code) {
  if (!code) return '—';
  const m = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', Delete: 'Del', Escape: 'Esc' };
  return m[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

/** the effective render scale */
export const pixelRatio = () => (settings.pixelRatio > 0 ? settings.pixelRatio : Math.min(devicePixelRatio || 1, 1.5));

// ------------------------------------------------------------------ the dialog
let dlg = null;
export function openSettings(onChange) {
  if (dlg) { dlg.remove(); dlg = null; }
  let waiting = null;
  const rows = el('div', { class: 'keyrows' });
  const render = () => {
    rows.replaceChildren();
    let group = '';
    for (const [id, label, grp] of ACTIONS) {
      if (grp !== group) { group = grp; rows.append(el('div', { class: 'lbl small grp' }, grp)); }
      const slot = i => {
        const wait = waiting && waiting[0] === id && waiting[1] === i;
        return el('button', { class: 'btn small key' + (wait ? ' on' : ''), title: 'Click, then press the new key (Esc cancels, Backspace clears)', onclick: () => { waiting = [id, i]; render(); } },
          wait ? 'press a key…' : keyName(settings.keys[id][i]));
      };
      rows.append(el('div', { class: 'row keyrow' }, el('span', { class: 'lbl wide' }, label), slot(0), slot(1)));
    }
  };
  const onKey = e => {
    if (!waiting) { if (e.key === 'Escape') close(); return; }
    e.preventDefault();
    e.stopPropagation();
    const [id, i] = waiting;
    if (e.key === 'Escape') { waiting = null; render(); return; }
    if (['Control', 'Alt', 'Meta'].includes(e.key)) return;
    const code = e.key === 'Backspace' && !['delete'].includes(id) ? '' : e.code;
    // a key belongs to one action: take it from whoever had it
    if (code) for (const k of Object.keys(settings.keys)) settings.keys[k] = settings.keys[k].map(c => (c === code ? '' : c));
    settings.keys[id][i] = code;
    waiting = null;
    saveSettings();
    onChange?.();
    render();
  };
  const close = () => { removeEventListener('keydown', onKey, true); dlg?.remove(); dlg = null; };
  addEventListener('keydown', onKey, true);

  const num = (label, get, set, { min, max, step }, note = '') => {
    const rng = el('input', { type: 'range', min, max, step, value: get() });
    const out = el('span', { class: 'unit wide' }, String(get()));
    rng.addEventListener('input', () => { set(+rng.value); out.textContent = rng.value; });
    rng.addEventListener('change', () => { saveSettings(); onChange?.(); });
    return el('div', { class: 'row slider' }, el('span', { class: 'lbl wide' }, label), rng, out, note ? el('span', { class: 'muted small' }, note) : '');
  };
  render();
  dlg = el('div', { class: 'modal', onclick: e => { if (e.target === dlg) close(); } },
    el('div', { class: 'dialog' },
      el('div', { class: 'dlghead' }, el('b', {}, 'Settings'), el('button', { class: 'btn small', onclick: close }, 'Close')),
      el('div', { class: 'dlgbody scroll' },
        el('h4', {}, 'Keys'),
        rows,
        el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { settings.keys = clone(DEFAULT_KEYS); saveSettings(); onChange?.(); render(); } }, 'Reset keys to defaults')),
        el('h4', {}, 'Speed and picture quality'),
        num('Movement speed ×', () => settings.moveSpeed, v => { settings.moveSpeed = v; }, { min: 0.25, max: 4, step: 0.25 }),
        num('Render scale', () => settings.pixelRatio || 0, v => { settings.pixelRatio = v; }, { min: 0, max: 2, step: 0.25 }, '0 = automatic. Lower is faster.'),
        num('Lamps that cast shadows', () => settings.lampShadows, v => { settings.lampShadows = v; }, { min: 0, max: 24, step: 1 }, 'Fewer is faster.'),
        el('label', { class: 'row check' }, el('input', { type: 'checkbox', checked: settings.draftMoving, onchange: e => { settings.draftMoving = e.target.checked; saveSettings(); onChange?.(); } }), el('span', {}, 'Draft quality while moving (flat light, lower resolution; full quality when you stop)')),
        el('label', { class: 'row check' }, el('input', { type: 'checkbox', checked: settings.flicker, onchange: e => { settings.flicker = e.target.checked; saveSettings(); onChange?.(); } }), el('span', {}, 'Animate flickering lamps (keeps the view redrawing all the time: slow)')),
        el('label', { class: 'row check' }, el('input', { type: 'checkbox', checked: settings.softShadows, onchange: e => { settings.softShadows = e.target.checked; saveSettings(); onChange?.(); } }), el('span', {}, 'Soft shadow edges (about 3x slower with many lamps)')),
        el('p', { class: 'muted small' }, 'Saved in this browser.'))));
  document.body.append(dlg);
}
