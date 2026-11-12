// Generic UI pieces: toasts, dialogs, small forms, the menu bar, downloads.
import { el, $ } from './state.js';

export function toast(msg, ms = 2400) {
  const t = el('div', { class: 'toast', text: msg });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

/* Modal dialog. Resolves with the clicked button's value (null for Cancel/Escape). */
export function dialog({ title, content, buttons = [['Cancel', null], ['OK', 'ok']], onOpen, light = false }) {
  return new Promise(resolve => {
    const done = v => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.stopPropagation(); e.preventDefault(); done(buttons[buttons.length - 1][1]); }
      else e.stopPropagation();
    };
    const btns = buttons.map(([label, value], i) => el('button', { text: label, class: i === buttons.length - 1 ? 'primary' : '', onclick: () => done(value) }));
    const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h3', { text: title }), content, el('div', { class: 'buttons' }, btns));
    const back = el('div', { class: light ? 'backdrop light' : 'backdrop' }, box);   // light = keep the canvas visible for previews
    document.body.append(back);
    document.addEventListener('keydown', onKey, true);
    (box.querySelector('input, select, textarea') || btns[btns.length - 1]).focus();
    onOpen?.(box, done);
  });
}

/* Build a small form. fields: [{ key, label, type: range|number|text|color|select|checkbox|textarea, ... }]
   Returns { node, values }. `values` is updated live; onInput(values) fires on every change. */
export function form(fields, onInput) {
  const values = {};
  const node = el('div', { class: 'form' });
  for (const f of fields) {
    values[f.key] = f.value;
    const id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 6);
    const label = el('label', { for: id, text: f.label });
    let input, out = null;
    const fire = () => onInput?.(values, f.key);
    if (f.type === 'range') {
      out = el('span', { class: 'val', text: f.value + (f.unit || '') });
      input = el('input', { id, type: 'range', min: f.min, max: f.max, step: f.step ?? 1, value: f.value,
        oninput: () => { values[f.key] = +input.value; out.textContent = input.value + (f.unit || ''); fire(); } });
    } else if (f.type === 'select') {
      input = el('select', { id, onchange: () => { values[f.key] = input.value; fire(); } },
        f.options.map(([v, t]) => el('option', { value: v, text: t, selected: v === f.value })));
    } else if (f.type === 'checkbox') {
      input = el('input', { id, type: 'checkbox', checked: !!f.value, onchange: () => { values[f.key] = input.checked; fire(); } });
    } else if (f.type === 'textarea') {
      input = el('textarea', { id, rows: 3, value: f.value ?? '', oninput: () => { values[f.key] = input.value; fire(); } });
    } else {
      input = el('input', { id, type: f.type || 'text', value: f.value ?? '', min: f.min, max: f.max, step: f.step,
        oninput: () => { values[f.key] = f.type === 'number' ? +input.value : input.value; fire(); } });
    }
    if (!out) input.classList.add('span2');
    node.append(label, input);
    if (out) node.append(out);
  }
  return { node, values };
}

export async function formDialog(title, fields, { onInput, okLabel = 'OK' } = {}) {
  const f = form(fields, onInput);
  const r = await dialog({ title, content: f.node, buttons: [['Cancel', null], [okLabel, 'ok']] });
  return r ? f.values : null;
}

export async function confirmDialog(title, text, okLabel = 'OK') {
  return (await dialog({ title, content: el('p', { text }), buttons: [['Cancel', null], [okLabel, 'ok']] })) === 'ok';
}

export function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export function pickFile(accept = 'image/*') {
  return new Promise(resolve => {
    const i = el('input', { type: 'file', accept });
    i.onchange = () => resolve(i.files[0] || null);
    i.click();
  });
}

/* Right-click menu at screen position x, y. items: [{ label, key, run, enabled, danger } | '-'] */
export function contextMenu(x, y, items) {
  document.querySelector('.ctx-menu')?.remove();
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onDown = e => { if (!menu.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const menu = el('div', { class: 'menu-list ctx-menu', role: 'menu' }, items.map(it => it === '-' ? el('div', { class: 'menu-sep' }) :
    el('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: it.enabled ? !it.enabled() : false,
      onclick: () => { close(); it.run(); } },
      el('span', { text: it.label }), el('span', { class: 'menu-key', text: it.key || '' }))));
  document.body.append(menu);
  menu.style.left = Math.max(4, Math.min(x, innerWidth - menu.offsetWidth - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - menu.offsetHeight - 4)) + 'px';
  setTimeout(() => { document.addEventListener('pointerdown', onDown, true); document.addEventListener('keydown', onKey, true); });
  menu.querySelector('button:not(:disabled)')?.focus();
}

/* Menu bar. menus: [{ label, items: [{ label, key, run, enabled } | '-'] }] */
export function buildMenubar(container, menus) {
  let open = null;
  const close = () => { if (open) { open.classList.remove('open'); open = null; } };
  document.addEventListener('pointerdown', e => { if (open && !container.contains(e.target)) close(); });
  for (const m of menus) {
    const list = el('div', { class: 'menu-list', role: 'menu' });
    const btn = el('button', { class: 'menu-btn', text: m.label, 'aria-haspopup': 'true' });
    const wrap = el('div', { class: 'menu' }, btn, list);
    const fill = () => {
      list.replaceChildren(...m.items.map(it => it === '-' ? el('div', { class: 'menu-sep' }) :
        el('button', { class: 'menu-item', role: 'menuitem', disabled: it.enabled ? !it.enabled() : false,
          onclick: () => { close(); it.run(); } },
          el('span', { text: typeof it.label === 'function' ? it.label() : it.label }), el('span', { class: 'menu-key', text: it.key || '' }))));
    };
    btn.onclick = () => { if (open === wrap) return close(); close(); fill(); wrap.classList.add('open'); open = wrap; };
    btn.onpointerenter = () => { if (open && open !== wrap) { close(); fill(); wrap.classList.add('open'); open = wrap; } };
    container.append(wrap);
  }
}

/* Progress bar for slow jobs. Returns { update(fraction, text), done(), cancelled }.
   Jobs check `cancelled` (or call update, which throws a 'Cancelled' error once Cancel was pressed). */
export function progress(title, { cancel = true } = {}) {
  let cancelled = false, closed = false;
  const fill = el('div', { class: 'pbar-fill' });
  const pct = el('span', { class: 'pbar-pct', text: '0%' });
  const text = el('div', { class: 'muted pbar-text', text: 'Starting…' });
  const stop = cancel ? el('button', { text: 'Cancel', onclick: () => { cancelled = true; stop.disabled = true; text.textContent = 'Stopping…'; } }) : null;
  const box = el('div', { class: 'dialog progress-box', role: 'dialog', 'aria-label': title },
    el('h3', { text: title }),
    el('div', { class: 'pbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill, pct),
    text, stop ? el('div', { class: 'buttons' }, stop) : null);
  const back = el('div', { class: 'backdrop' }, box);
  document.body.append(back);
  const t0 = performance.now();
  return {
    get cancelled() { return cancelled; },
    update(frac, msg = '') {
      if (cancelled) { const e = new Error('Cancelled'); e.name = 'Cancelled'; throw e; }
      if (closed) return;
      const f = Math.min(1, Math.max(0, frac || 0)), el_ = (performance.now() - t0) / 1000;
      fill.style.width = (f * 100).toFixed(1) + '%';
      pct.textContent = Math.floor(f * 100) + '%';
      box.querySelector('.pbar').setAttribute('aria-valuenow', Math.floor(f * 100));
      const left = f > 0.02 && el_ > 1 ? el_ / f * (1 - f) : null;
      text.textContent = msg + (left != null ? ` · about ${left < 60 ? Math.ceil(left) + ' s' : Math.ceil(left / 60) + ' min'} left` : '');
    },
    done() { closed = true; back.remove(); },
  };
}
