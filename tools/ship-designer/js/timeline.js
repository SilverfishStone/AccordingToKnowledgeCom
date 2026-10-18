// The timeline under the 3D view in animate mode: the clip's tracks, three channels each (Move, Rotate, Size), keyframes you can add,
// drag, select and delete, and a playhead you can drag. Everything edits `ship.anims` through the actions in app.js.
import { app } from './app.js';
import { el, round } from './util.js';
import { CHANNELS, EASES, MODES, evalChannel } from './anim.js';
import { showMenu } from './ctxmenu.js';

const A = app.actions;
const LABEL = 190, PAD = 12, ROW = 22;
let box, rowsEl, head, playhead, readout, playBtn, raf = 0, area = null;

const clipNow = () => A.curClip();
const tname = t => (t.type === 'ship' ? 'The whole ship' : t.type === 'hall' ? (A.hall(t.id)?.name || '(missing hall)') : t.type === 'att' ? (A.att(t.id)?.name || '(missing gadget)') : (A.group(t.id)?.name || '(missing group)'));

/** the width in pixels the keys have to spread over */
const keyWidth = () => Math.max((rowsEl?.clientWidth || 600) - LABEL - PAD * 2, 100);
const xOf = (clip, t) => LABEL + PAD + (t / Math.max(clip.dur, 0.05)) * keyWidth();
const tOf = (clip, clientX) => {
  const r = rowsEl.getBoundingClientRect();
  return Math.min(Math.max(((clientX - r.left - LABEL - PAD) / keyWidth()) * clip.dur, 0), clip.dur);
};
const snap = t => Math.round(t * 20) / 20;

function seek(clip, t) {
  app.anim.state.seek(clip, t);
  app.sv.animTick(0);
  app.anim.refreshPose?.();
}

function setSel(trackId, ch, k) {
  app.anim.sel = { track: trackId, ch, k };
  app.emit('animsel');
}

function keyMenu(e, clip, tr, ch, i) {
  e.preventDefault();
  setSel(tr.id, ch, i);
  showMenu(e.clientX, e.clientY, [
    ...Object.entries(EASES).map(([id, label]) => ({ label: 'Easing: ' + label, onclick: () => { tr[ch][i].ease = id; A.animEdited(); } })),
    'sep',
    { label: 'Copy to the playhead', onclick: () => { const t = app.anim.state.get(clip.id).t, k = tr[ch][i]; if (!tr[ch].some(x => Math.abs(x.t - t) < 0.02)) { tr[ch].push({ t: Math.round(t * 1000) / 1000, v: [...k.v], ease: k.ease }); tr[ch].sort((a, b) => a.t - b.t); A.animEdited(); } } },
    { label: 'Delete key', danger: true, onclick: () => { tr[ch].splice(i, 1); app.anim.sel = null; A.animEdited(); } },
  ], CHANNELS[ch].label + ' key');
}

function keyEl(clip, tr, ch, i) {
  const k = tr[ch][i], sel = app.anim.sel, on = sel && sel.track === tr.id && sel.ch === ch && sel.k === i;
  const d = el('div', { class: 'tlkey' + (on ? ' on' : ''), title: `${CHANNELS[ch].label} at ${round(k.t, 2)} s`, style: { left: xOf(clip, k.t) - LABEL - PAD + 'px' } });
  d.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation();
    app.anim.sel = { track: tr.id, ch, k: i };
    rowsEl.querySelectorAll('.tlkey.on').forEach(x => x.classList.remove('on'));
    d.classList.add('on');
    d.setPointerCapture(e.pointerId);
    let moved = false;
    const move = ev => {
      moved = true;
      k.t = Math.round(snap(tOf(clip, ev.clientX)) * 1000) / 1000;
      d.style.left = xOf(clip, k.t) - LABEL - PAD + 'px';
      app.sv.animTick(0);
    };
    const up = () => {
      d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up);
      if (moved) { tr[ch].sort((a, b) => a.t - b.t); app.anim.sel = { track: tr.id, ch, k: tr[ch].indexOf(k) }; A.animEdited(); } else app.emit('animsel');
    };
    d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
  });
  d.addEventListener('contextmenu', e => keyMenu(e, clip, tr, ch, i));
  return d;
}

function channelRow(clip, tr, ch) {
  const sel = app.anim.sel, cell = el('div', { class: 'tlcell' });
  tr[ch].forEach((_, i) => cell.append(keyEl(clip, tr, ch, i)));
  cell.addEventListener('dblclick', e => {
    if (e.target !== cell) return;
    const t = Math.round(snap(tOf(clip, e.clientX)) * 1000) / 1000;
    if (tr[ch].some(k => Math.abs(k.t - t) < 0.02)) return;
    const k = { t, v: evalChannel(tr[ch], t, CHANNELS[ch].def), ease: 'smooth' };
    tr[ch].push(k); tr[ch].sort((a, b) => a.t - b.t);
    app.anim.sel = { track: tr.id, ch, k: tr[ch].indexOf(k) };
    A.animEdited();
  });
  const add = el('button', { class: 'tladd', title: `Add a ${CHANNELS[ch].label} key at the playhead`, onclick: () => {
    const t = Math.round(app.anim.state.get(clip.id).t * 1000) / 1000;
    if (!tr[ch].some(k => Math.abs(k.t - t) < 0.02)) { tr[ch].push({ t, v: evalChannel(tr[ch], t, CHANNELS[ch].def), ease: 'smooth' }); tr[ch].sort((a, b) => a.t - b.t); }
    app.anim.sel = { track: tr.id, ch, k: tr[ch].findIndex(k => Math.abs(k.t - t) < 0.02) };
    A.animEdited();
  } }, '◆+');
  const on = sel && sel.track === tr.id && sel.ch === ch;
  return el('div', { class: 'tlrow' + (on ? ' on' : ''), style: { height: ROW + 'px' } },
    el('div', { class: 'tllabel sub', onclick: () => setSel(tr.id, ch, -1) }, el('span', {}, CHANNELS[ch].label), add), cell);
}

export function renderTimeline() {
  if (!box) return;
  const clip = clipNow();
  box.classList.toggle('on', !!app.anim.on);
  if (!app.anim.on) return;
  const S = app.anim.state, clips = app.ship.anims || [];
  head.replaceChildren(
    el('select', { class: 'cam', onchange: e => { app.anim.clipId = e.target.value; app.anim.sel = null; app.emit('anims'); } }, ...clips.map(c => el('option', { value: c.id, selected: clip?.id === c.id }, c.name)), clips.length ? '' : el('option', {}, '(no clips)')),
    el('button', { class: 'cam', title: 'New clip', onclick: () => A.addClip('empty') }, '＋ Clip'),
    ...(clip ? [
      el('label', { class: 'tlf' }, 'Length ', el('input', { type: 'number', class: 'num', step: 0.1, min: 0.2, value: round(clip.dur, 2), onchange: e => { clip.dur = Math.max(0.2, +e.target.value || clip.dur); A.animEdited(); } }), ' s'),
      el('select', { class: 'cam', title: 'How it plays', onchange: e => { clip.mode = e.target.value; A.animEdited(); } }, ...Object.entries(MODES).map(([v, t]) => el('option', { value: v, selected: clip.mode === v }, t))),
      el('span', { class: 'tlsp' }),
      el('button', { class: 'cam', title: 'To the start', onclick: () => seek(clip, 0) }, '⏮'),
      playBtn = el('button', { class: 'cam', title: 'Play / pause', onclick: () => { const s = S.get(clip.id); if (s.dir) s.dir = 0; else S.play(clip, 1); renderTimeline(); } }, '▶'),
      el('button', { class: 'cam', title: 'To the end', onclick: () => seek(clip, clip.dur) }, '⏭'),
      readout = el('span', { class: 'tlread' }, '0.00 s'),
    ] : []),
    el('button', { class: 'cam', title: 'Leave animate mode', onclick: () => A.animMode(false) }, '✕'));
  rowsEl.replaceChildren();
  if (!clip) { rowsEl.append(el('p', { class: 'muted small tlempty' }, 'No clip yet. Press "＋ Clip" (or use the Animate tab on the left to make one from a hatch, door or spinner preset).')); return; }
  // ruler
  const ruler = el('div', { class: 'tlrow tlruler', style: { height: ROW + 'px' } }, el('div', { class: 'tllabel' }, 'Time'), el('div', { class: 'tlcell' }));
  const rc = ruler.lastChild, step = clip.dur > 12 ? 2 : clip.dur > 5 ? 1 : 0.5;
  for (let t = 0; t <= clip.dur + 1e-6; t += step) rc.append(el('span', { class: 'tltick', style: { left: xOf(clip, t) - LABEL - PAD + 'px' } }, round(t, 1) + ''));
  const scrub = ev => seek(clip, snap(tOf(clip, ev.clientX)));
  rc.addEventListener('pointerdown', e => { rc.setPointerCapture(e.pointerId); scrub(e); const mv = ev => scrub(ev), up = () => { rc.removeEventListener('pointermove', mv); rc.removeEventListener('pointerup', up); }; rc.addEventListener('pointermove', mv); rc.addEventListener('pointerup', up); });
  rowsEl.append(ruler);
  for (const tr of clip.tracks) {
    const sel = app.anim.sel;
    rowsEl.append(el('div', { class: 'tlrow tlhead' + (sel?.track === tr.id ? ' on' : ''), style: { height: ROW + 'px' } },
      el('div', { class: 'tllabel', title: 'Select', onclick: () => setSel(tr.id, sel?.track === tr.id ? sel.ch : 'rot', -1) }, el('b', {}, tname(tr.target)), el('button', { class: 'tladd', title: 'Remove from the clip', onclick: e => { e.stopPropagation(); A.deleteTrack(clip.id, tr.id); } }, '✕')),
      el('div', { class: 'tlcell' })));
    for (const ch of ['pos', 'rot', 'scl']) rowsEl.append(channelRow(clip, tr, ch));
  }
  playhead = el('div', { class: 'tlplayhead' });
  rowsEl.append(playhead);
  updateHead();
}

function updateHead() {
  const clip = clipNow();
  if (!clip || !playhead) return;
  const s = app.anim.state.get(clip.id);
  playhead.style.left = xOf(clip, s.t) + 'px';
  if (readout) readout.textContent = `${s.t.toFixed(2)} / ${clip.dur.toFixed(2)} s`;
  if (playBtn) playBtn.textContent = s.dir ? '⏸' : '▶';
}

export function initTimeline() {
  const stage = document.getElementById('stage');
  box = el('div', { id: 'timeline' });
  head = el('div', { class: 'tlbar' });
  rowsEl = el('div', { class: 'tlrows' });
  box.append(head, el('div', { class: 'tlscroll' }, rowsEl));
  stage.append(box);
  app.on('anims', renderTimeline);
  app.on('animsel', renderTimeline);
  app.on('doc', renderTimeline);
  addEventListener('resize', () => renderTimeline());
  const loop = () => { raf = requestAnimationFrame(loop); if (app.anim.on) updateHead(); };
  loop();
  addEventListener('keydown', e => {                       // Delete removes the selected key (not the selected hall)
    const sel = app.anim.sel;
    if (!app.anim.on || !sel || sel.k < 0 || /^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const clip = clipNow(), tr = clip?.tracks.find(t => t.id === sel.track);
    if (!tr || !tr[sel.ch]?.[sel.k]) return;
    e.preventDefault(); e.stopImmediatePropagation();
    tr[sel.ch].splice(sel.k, 1);
    app.anim.sel = null;
    A.animEdited();
  }, true);
}
