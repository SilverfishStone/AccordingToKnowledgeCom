// The right-click menu: a small floating list. items: [{label, hint, onclick, disabled, danger} | 'sep']
import { el } from './util.js';

let menu = null;

export function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  removeEventListener('pointerdown', outside, true);
  removeEventListener('keydown', onKey, true);
  removeEventListener('blur', closeMenu);
  removeEventListener('wheel', closeMenu, true);
}
const outside = e => { if (menu && !menu.contains(e.target)) closeMenu(); };
const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } };

export function showMenu(x, y, items, title = '') {
  closeMenu();
  const rows = items.filter(Boolean).map(it => it === 'sep' ? el('div', { class: 'sep' }) : el('button', {
    class: 'item' + (it.danger ? ' danger' : ''), disabled: !!it.disabled,
    onclick: () => { closeMenu(); it.onclick?.(); },
  }, el('span', {}, it.label), it.hint ? el('kbd', {}, it.hint) : ''));
  menu = el('div', { class: 'ctx', oncontextmenu: e => e.preventDefault() }, title ? el('div', { class: 'ctitle' }, title) : '', rows);
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  addEventListener('pointerdown', outside, true);
  addEventListener('keydown', onKey, true);
  addEventListener('blur', closeMenu);
  addEventListener('wheel', closeMenu, { capture: true, passive: true });
}
