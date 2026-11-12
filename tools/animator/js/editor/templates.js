// Template dialogs: a live, looping preview next to the settings, presets, the template library,
// and rebuilding a template group with new settings.
import { app, el, makeCanvas, clamp, on } from './state.js';
import { Doc } from './doc.js';
import { metaCmd } from './history.js';
import { insertPoint } from './panels.js';
import { dialog, form, toast, confirmDialog } from './ui.js';
import { TEMPLATES, byId } from './tpl-core.js';
import './tpl-tube.js';
import './tpl-ball.js';
import './tpl-particles.js';
import './tpl-burst.js';
import { motionDialog } from './motions.js';

/* The selected layer's drawing, cropped and capped in size (for templates that can use your art). */
function layerArt(max = 400) {
  const A = app.doc.active;
  if (!A || A.isGroup) return null;
  const b = A.bbox();
  if (!b) return null;
  const k = Math.min(1, max / Math.max(b.w, b.h));
  const c = makeCanvas(b.w * k, b.h * k);
  c.getContext('2d').drawImage(A.canvas, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  return c;
}
async function imageFromUrl(url) {
  try { return await createImageBitmap(await (await fetch(url)).blob()); } catch { return null; }
}
function cleanParams(T, v) {
  const p = { ...T.defaults, ...v };
  for (const k in p) if (typeof T.defaults[k] === 'number' && typeof p[k] !== 'number') p[k] = Number(p[k]) || T.defaults[k];
  p.from = clamp(Math.round(p.from) || 1, 1, app.doc.frames);
  p.to = clamp(Math.round(p.to) || app.doc.frames, p.from, app.doc.frames);
  if (p.segments) p.segments = clamp(Math.round(p.segments), 3, 80);
  p.name = String(p.name || T.name).slice(0, 60);
  return p;
}
/* Write a value into a form field (and its value label) built by ui.form(). */
function setField(node, values, key, v) {
  const input = node.querySelector(`[id^="f_${key}_"]`);
  values[key] = v;
  if (!input) return;
  if (input.type === 'checkbox') input.checked = !!v;
  else input.value = v;
  const out = input.nextElementSibling;
  if (out?.classList.contains('val')) out.textContent = input.value + (out.textContent.replace(/^[-\d.]+/, '') || '');
}

/* ---- background of the preview (so a white or black item can be seen); remembered between visits ---- */
const PREVIEW_BGS = [['project', 'Project'], ['#ffffff', 'White'], ['#c8ccd4', 'Light grey'], ['#7a808c', 'Grey'], ['#2b2f37', 'Dark grey'], ['#000000', 'Black'], ['checker', 'Checkerboard']];
const PBG_KEY = 'animator.templatePreviewBg';
const readPreviewBg = () => { try { return localStorage.getItem(PBG_KEY) || 'project'; } catch { return 'project'; } };
const savePreviewBg = v => { try { localStorage.setItem(PBG_KEY, v); } catch { /* storage unavailable */ } };
const isDark = hex => { const n = parseInt(String(hex).slice(1), 16) || 0; return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128; };

/* Open a template's dialog. preset: index into T.presets to start from. group: rebuild this template group. */
export async function openTemplate(id, { preset = null, group = null } = {}) {
  const T = byId(id);
  if (!T) return;
  const doc = app.doc, editing = !!group;
  const art = T.usesArt ? layerArt(T.artMax) : null, source = art ? doc.active : null;
  const haveLayerArt = !!art && !(group && doc.isInside(doc.active, group));
  let start = { ...T.defaults, to: doc.frames };
  if (editing) start = { ...start, ...group.template.params };
  else if (preset != null && T.presets?.[preset]) start = { ...start, ...T.presets[preset].values };
  const f = form(T.fields(start, { editing, haveLayerArt, doc }), () => schedule());
  const values = f.values;
  for (const k in start) if (!(k in values)) values[k] = start[k];      // settings without a field (e.g. stored art)

  // ---- live preview: build into a scratch document and loop it ----
  const W = doc.width, H = doc.height, pw = 520, ph = Math.round(pw * H / W), dpr = window.devicePixelRatio || 1;
  const prev = el('canvas', { class: 'tpl-preview', width: Math.round(pw * dpr), height: Math.round(ph * dpr), style: `width:${pw}px;height:${ph}px` });
  const pctx = prev.getContext('2d');
  const tdoc = new Doc({ width: W, height: H, fps: doc.fps, frames: doc.frames, bg: doc.bg });
  const info = el('div', { class: 'muted tpl-info' });
  let built = null, timer = 0, alive = true, savedArt = null;
  const artFor = async p => {
    if (p.shape === 'layer') return art;
    if (p.shape === 'custom' && p.customArt) return (savedArt ||= await imageFromUrl(p.customArt));
    return null;
  };
  /* project length the template wants: exactly the loop if it fills the project, otherwise only ever longer */
  const framesFor = p => {
    if (!T.timing || !p.fit) return doc.frames;
    const need = T.timing(p, { ...doc, frames: doc.frames, fps: doc.fps, width: doc.width, height: doc.height }).f1 + 1;
    return Math.max(1, Math.min(2000, Math.max(doc.frames, need)));       // only ever longer, so earlier loops keep working
  };
  const rebuild = async () => {
    timer = 0;
    const p = cleanParams(T, values), t0 = performance.now();
    tdoc.frames = framesFor(p);
    try {
      built = T.build(tdoc, p, await artFor(p));
      tdoc.layers = [built];
      const n = tdoc.all().length - 1, keys = tdoc.all().reduce((s, l) => s + Object.values(l.tracks).reduce((a, t) => a + t.length, 0), 0);
      info.textContent = `${n} layer${n === 1 ? '' : 's'} · ${keys.toLocaleString()} keyframes · built in ${Math.round(performance.now() - t0)} ms`
        + (tdoc.frames !== doc.frames ? ` · project becomes ${tdoc.frames} frames (${(tdoc.frames / doc.fps).toFixed(2)} s); loops made earlier may need a rebuild` : '');
    } catch (err) { console.error(err); info.textContent = 'Could not build with these settings: ' + err.message; }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(rebuild, 70); };
  // preview background: the project's own, a plain colour, or a checkerboard
  let pbg = readPreviewBg(), checker = null;
  const bgColour = () => (pbg === 'project' ? doc.bg || '#ffffff' : pbg);
  const bgIsDark = () => pbg !== 'checker' && isDark(bgColour());
  const paintBg = () => {
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    if (pbg === 'checker') {
      if (!checker) {
        const s = Math.max(8, Math.round(12 * dpr)), t = makeCanvas(s * 2, s * 2), x = t.getContext('2d');
        x.fillStyle = '#f2f3f5'; x.fillRect(0, 0, s * 2, s * 2); x.fillStyle = '#c9ccd3'; x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
        checker = pctx.createPattern(t, 'repeat');
      }
      pctx.fillStyle = checker;
    } else pctx.fillStyle = bgColour();
    pctx.fillRect(0, 0, prev.width, prev.height);
  };
  const t0 = performance.now();
  const loop = () => {
    if (!alive) return;
    const fr = Math.floor((performance.now() - t0) / 1000 * doc.fps) % tdoc.frames;
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    paintBg();
    if (built) tdoc.render(pctx, fr, { scale: prev.width / W, bg: false, clear: false });
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    T.overlay?.(pctx, cleanParams(T, values), pw, ph, doc);
    pctx.fillStyle = bgIsDark() ? '#fffa' : '#0008'; pctx.font = '11px system-ui'; pctx.fillText(`frame ${fr + 1}/${tdoc.frames}`, pw - 82, ph - 8);
    requestAnimationFrame(loop);
  };

  // ---- drag on the preview (templates that support it, e.g. aiming the tube in 3D) ----
  if (T.drag) {
    let last = null;
    prev.style.cursor = 'grab';
    prev.addEventListener('pointerdown', e => { last = { x: e.clientX, y: e.clientY }; prev.setPointerCapture(e.pointerId); prev.style.cursor = 'grabbing'; });
    prev.addEventListener('pointermove', e => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      const change = T.drag(cleanParams(T, values), dx, dy, e, W / pw);
      for (const k in change) setField(f.node, values, k, change[k]);
      schedule();
    });
    const end = () => { last = null; prev.style.cursor = 'grab'; };
    prev.addEventListener('pointerup', end); prev.addEventListener('pointercancel', end);
  }

  const bgRow = el('div', { class: 'tpl-bg', role: 'group', 'aria-label': 'Preview background' }, el('span', { class: 'muted', text: 'Preview background:' }));
  const swatches = [];
  const syncBg = () => {
    for (const [b, btn] of swatches) btn.setAttribute('aria-pressed', String(b === pbg));
    custom.classList.toggle('on', !PREVIEW_BGS.some(([v]) => v === pbg));
  };
  const chooseBg = v => { pbg = v; savePreviewBg(v); syncBg(); };
  for (const [v, label] of PREVIEW_BGS) {
    const btn = el('button', { class: 'bg-swatch' + (v === 'checker' ? ' checker' : ''), title: label, 'aria-label': label + ' background', onclick: () => chooseBg(v) });
    if (v === 'project') { btn.classList.add('project'); btn.textContent = 'P'; if (doc.bg) btn.style.background = doc.bg; }
    else if (v !== 'checker') btn.style.background = v;
    swatches.push([v, btn]); bgRow.append(btn);
  }
  const custom = el('input', { type: 'color', class: 'bg-custom', title: 'Any colour', 'aria-label': 'Custom preview background colour', value: /^#[0-9a-f]{6}$/i.test(pbg) ? pbg : '#ff00ff',
    oninput: () => chooseBg(custom.value) });
  bgRow.append(custom);
  syncBg();
  const presetRow = T.presets?.length ? el('div', { class: 'tpl-presets' },
    T.presets.map(pr => el('button', { text: pr.label, onclick: () => { for (const k in pr.values) setField(f.node, values, k, pr.values[k]); schedule(); } }))) : null;
  const content = el('div', { class: 'tpl' },
    el('div', { class: 'tpl-left' }, prev, bgRow, T.hint ? el('div', { class: 'muted', text: T.hint }) : null, info, presetRow ? el('div', { class: 'muted', text: 'Start from:' }) : null, presetRow),
    el('div', { class: 'tpl-right' }, f.node));
  await rebuild();
  requestAnimationFrame(loop);
  const ok = await dialog({ title: editing ? `${T.name} settings: ${group.name}` : `New ${T.name.toLowerCase()}`, content,
    buttons: [['Cancel', null], [editing ? 'Rebuild' : 'Create', 'ok']] });
  alive = false; clearTimeout(timer);
  if (!ok) return;
  if (editing && !await confirmDialog('Rebuild', 'Rebuilding replaces the layers inside this group, including any drawing or keyframes you changed on them. The group’s own movement is kept. (You can undo.)', 'Rebuild')) return;

  const p = cleanParams(T, values), newFrames = framesFor(p);
  const fromLayer = p.shape === 'layer';
  if (fromLayer) { p.shape = 'custom'; p.customArt = art?.toDataURL('image/png') || null; savedArt = null; }
  const img = await artFor(p);
  metaCmd(editing ? `Rebuild ${T.name.toLowerCase()}` : `New ${T.name.toLowerCase()}`, () => {
    const d = app.doc;
    if (newFrames !== d.frames) { d.frames = newFrames; app.frame = Math.min(app.frame, d.frames - 1); }
    const g = T.build(d, p, img);
    if (T.hidesSource && fromLayer && p.hideOriginal && source) source.visible = false;
    g.template = { type: T.id, params: p };
    if (editing) {
      group.name = p.name; group.template = g.template; group.outline = g.outline; group.sortByDepth = g.sortByDepth;
      group.children = g.children;
      d.activeId = group.id;
    } else {
      const { list, index } = insertPoint({ intoGroup: false });
      list.splice(index, 0, g);
      d.activeId = g.id;
    }
  });
  const n = (editing ? group : app.doc.active).children.length;
  toast(`${p.name}: ${n} layer${n === 1 ? '' : 's'} with keyframes, ready to edit`);
}

export function editTemplate(g) {
  if (!g?.template || !byId(g.template.type)) return toast('Select a group that was made by a template');
  return openTemplate(g.template.type, { group: g });
}

/* ---- the template library ---- */
export async function templateLibrary() {
  let choose = null, close = null;
  const card = (icon, title, blurb, run) => el('button', { class: 'tpl-card', onclick: () => { choose = run; close?.('ok'); } },
    el('span', { class: 'tpl-icon', text: icon }), el('b', { text: title }), el('span', { class: 'muted', text: blurb }));
  const sections = [];
  for (const T of TEMPLATES) {
    const cards = [card(T.icon, T.name, T.blurb, () => openTemplate(T.id))];
    (T.presets || []).forEach((pr, i) => cards.push(card(T.icon, pr.label, `${T.name} preset`, () => openTemplate(T.id, { preset: i }))));
    sections.push(el('h4', { text: `${T.icon} ${T.name}` }), el('div', { class: 'tpl-grid' }, cards));
  }
  sections.push(el('h4', { text: '🎬 Motions for the selected layer' }), el('div', { class: 'tpl-grid' },
    card('🎬', 'Add a motion…', 'Bob, pulse, spin, shake, wobble, pendulum, fades, pop-in, slide-in, bounce: for any layer or group', () => motionDialog())));
  const content = el('div', { class: 'tpl-lib' },
    el('p', { class: 'muted', text: 'Each starter builds ordinary layers and keyframes in your project, sized and coloured the way you choose. Edit anything afterwards.' }),
    ...sections);
  const r = await dialog({ title: 'Template library', content, buttons: [['Close', null]], onOpen: (_, done) => { close = done; } });
  if (r === 'ok' && choose) choose();
}

export const TEMPLATE_MENU = [
  { label: 'Template library…', run: templateLibrary },
  '-',
  ...TEMPLATES.map(T => ({ label: `${T.name}…`, run: () => openTemplate(T.id) })),
];
on('template-edit', g => editTemplate(g));
