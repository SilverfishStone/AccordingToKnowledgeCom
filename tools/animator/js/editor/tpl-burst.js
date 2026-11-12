// Radial burst / hyperspace: copies of a streak (your drawing, or a generated one) fly outward from a centre
// point along evenly spaced spokes, growing longer and wider as they go. Loops cleanly.
import { makeCanvas, clamp } from './state.js';
import { register, r2, rng, newGroup, layerFrom, bake, keyFrames, timeFields, loopTiming, speedFields } from './tpl-core.js';

const DEF = {
  name: 'Hyperspace', shape: 'streak', orient: 'auto', color: '#cfe8ff', streakLength: 140, streakWidth: 6,
  spokes: 24, perSpoke: 2, centreX: 0, centreY: 0, startRadius: 30, endRadius: 1150, accel: 2,
  lenStart: 20, lenEnd: 300, widStart: 60, widEnd: 140, fadeIn: 15, fadeOut: 10,
  angleJitter: 6, phaseJitter: 40, turn: 0, seed: 1, hideOriginal: true,
  period: 1, fit: true, from: 1, to: 0, keyEvery: 1,
};

/* the picture every copy uses, turned so it points along +x (outward) */
function streakPicture(p, art) {
  if (art && p.shape !== 'streak') {
    const vertical = p.orient === 'up' || (p.orient === 'auto' && art.height > art.width * 1.15);
    if (!vertical) { const c = makeCanvas(art.width, art.height); c.getContext('2d').drawImage(art, 0, 0); return c; }
    const c = makeCanvas(art.height, art.width), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(art, -art.width / 2, -art.height / 2);
    return c;
  }
  // generated streak of light: transparent tail → colour → bright tip
  const w = Math.max(4, p.streakLength), h = Math.max(2, p.streakWidth), c = makeCanvas(w, h + 4), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, p.color + '00'); g.addColorStop(0.6, p.color + 'cc'); g.addColorStop(1, '#ffffff');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, c.height / 2); x.lineTo(w - h / 2, 2); x.arc(w - h / 2, c.height / 2, h / 2, -Math.PI / 2, Math.PI / 2); x.lineTo(0, c.height / 2); x.fill();
  return c;
}

function build(doc, p, art) {
  const { f0, f1, cycles } = loopTiming(p, doc), N = f1 - f0 + 1;
  const cx = doc.width / 2 + p.centreX, cy = doc.height / 2 + p.centreY;
  const pic = streakPicture(p, art), rand = rng(p.seed * 104729 + 7);
  const frames = keyFrames(f0, f1, p.keyEvery);
  const g = newGroup(doc, p.name), kids = [];
  const spokes = clamp(Math.round(p.spokes), 1, 400), per = clamp(Math.round(p.perSpoke), 1, 20);
  const ease = u => u ** Math.max(0.2, p.accel);           // >1: starts slow near the centre, then rushes outward
  for (let s = 0; s < spokes; s++) {
    for (let k = 0; k < per; k++) {
      const ang = (s / spokes) * 360 + p.turn + (rand() * 2 - 1) * p.angleJitter / 2;
      const phase = (k / per + (rand() * 2 - 1) * p.phaseJitter / 100 / per + 1) % 1;
      const L = layerFrom(doc, `Spoke ${s + 1}${per > 1 ? '.' + (k + 1) : ''}`, pic);
      const a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const vals = { x: [], y: [], scaleX: [], scaleY: [], opacity: [] }, holds = new Set();
      let prev = null;
      frames.forEach((f, i) => {
        const u = (phase + cycles * (f - f0) / N) % 1;
        if (prev != null && u < prev) holds.add(i - 1);     // flew off: jump back to the centre without sliding across
        prev = u;
        const e = ease(u), r = p.startRadius + (p.endRadius - p.startRadius) * e;
        vals.x.push(cx + ca * r - L.pivot.x); vals.y.push(cy + sa * r - L.pivot.y);
        vals.scaleX.push(p.lenStart + (p.lenEnd - p.lenStart) * e);
        vals.scaleY.push(p.widStart + (p.widEnd - p.widStart) * u);
        const fi = p.fadeIn > 0 ? Math.min(1, u / (p.fadeIn / 100)) : 1, fo = p.fadeOut > 0 ? Math.min(1, (1 - u) / (p.fadeOut / 100)) : 1;
        vals.opacity.push(100 * Math.max(0, Math.min(fi, fo)));
      });
      for (const prop in vals) bake(L, prop, frames, vals[prop], { holds });
      L.base.rotation = r2(ang);
      kids.push(L);
    }
  }
  g.children = kids;
  g.pivot = { x: r2(cx), y: r2(cy) };
  return g;
}

const fields = (p, ctx) => {
  const shapeOpts = [['streak', 'Generated light streak']];
  if (ctx.haveLayerArt) shapeOpts.unshift(['layer', 'My drawing (the selected layer)']);
  if (ctx.editing && p.customArt) shapeOpts.unshift(['custom', 'Keep the drawing used before']);
  return [
    { key: 'name', label: 'Name', type: 'text', value: p.name },
    { key: 'shape', label: 'Streak', type: 'select', value: ctx.editing && p.customArt ? 'custom' : ctx.haveLayerArt ? 'layer' : 'streak', options: shapeOpts },
    { key: 'orient', label: 'My drawing points', type: 'select', value: p.orient, options: [['auto', 'Work it out (long side)'], ['right', 'Left → right'], ['up', 'Up ↕ down']] },
    { key: 'hideOriginal', label: 'Hide my drawing afterwards', type: 'checkbox', value: p.hideOriginal },
    { key: 'spokes', label: 'Spokes', type: 'range', min: 1, max: 200, value: p.spokes },
    { key: 'perSpoke', label: 'Streaks per spoke', type: 'range', min: 1, max: 10, value: p.perSpoke, title: 'More = a steadier stream along each spoke' },
    { key: 'centreX', label: 'Centre X (from middle)', type: 'range', min: -2000, max: 2000, value: p.centreX, unit: 'px' },
    { key: 'centreY', label: 'Centre Y (from middle)', type: 'range', min: -2000, max: 2000, value: p.centreY, unit: 'px' },
    { key: 'startRadius', label: 'Start distance', type: 'range', min: 0, max: 1500, value: p.startRadius, unit: 'px' },
    { key: 'endRadius', label: 'End distance', type: 'range', min: 50, max: 4000, step: 10, value: p.endRadius, unit: 'px' },
    { key: 'accel', label: 'Speed-up', type: 'range', min: 0.5, max: 4, step: 0.1, value: p.accel, title: '1 = steady; higher starts slow near the centre and rushes outward' },
    { key: 'lenStart', label: 'Length at start', type: 'range', min: 1, max: 1000, value: p.lenStart, unit: '%' },
    { key: 'lenEnd', label: 'Length at end', type: 'range', min: 1, max: 2000, value: p.lenEnd, unit: '%' },
    { key: 'widStart', label: 'Width at start', type: 'range', min: 1, max: 500, value: p.widStart, unit: '%' },
    { key: 'widEnd', label: 'Width at end', type: 'range', min: 1, max: 1000, value: p.widEnd, unit: '%' },
    { key: 'fadeIn', label: 'Fade in', type: 'range', min: 0, max: 100, value: p.fadeIn, unit: '%' },
    { key: 'fadeOut', label: 'Fade out', type: 'range', min: 0, max: 100, value: p.fadeOut, unit: '%' },
    { key: 'angleJitter', label: 'Angle randomness', type: 'range', min: 0, max: 90, value: p.angleJitter, unit: '°' },
    { key: 'phaseJitter', label: 'Timing randomness', type: 'range', min: 0, max: 100, value: p.phaseJitter, unit: '%' },
    { key: 'turn', label: 'Turn all spokes', type: 'range', min: -180, max: 180, value: p.turn, unit: '°' },
    { key: 'color', label: 'Generated streak colour', type: 'color', value: p.color },
    { key: 'streakLength', label: 'Generated streak length', type: 'range', min: 10, max: 800, value: p.streakLength, unit: 'px' },
    { key: 'streakWidth', label: 'Generated streak width', type: 'range', min: 1, max: 80, value: p.streakWidth, unit: 'px' },
    { key: 'seed', label: 'Variation', type: 'range', min: 1, max: 99, value: p.seed },
    ...speedFields(p, { label: 'Seconds per trip outward', min: 0.1, max: 20 }),
    ...timeFields(p, ctx.doc),
  ];
};

/* drag the preview to move the centre */
const drag = (p, dx, dy, e, k) => ({ centreX: Math.round(p.centreX + dx * k), centreY: Math.round(p.centreY + dy * k) });
function overlay(x, p, w, h, doc) {
  const k = w / doc.width, cx = (doc.width / 2 + p.centreX) * k, cy = (doc.height / 2 + p.centreY) * k;
  x.save();
  x.strokeStyle = '#000'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(cx - 10, cy); x.lineTo(cx + 10, cy); x.moveTo(cx, cy - 10); x.lineTo(cx, cy + 10); x.stroke();
  x.strokeStyle = '#ffd60a'; x.lineWidth = 1.5; x.stroke();
  x.restore();
}

register({
  id: 'burst', name: 'Radial burst / hyperspace', icon: '✨', defaults: DEF, fields, build, drag, overlay, usesArt: true, artMax: 1200,
  timing: (p, doc) => loopTiming(p, doc), hidesSource: true,
  blurb: 'Your streak (or a generated one) copied round spokes, flying out from a centre and stretching as it goes.',
  hint: 'Select a streak you drew first to use it · drag the preview to move the centre',
  presets: [
    { label: 'Hyperspace', values: { name: 'Hyperspace', spokes: 48, perSpoke: 3, accel: 2.4, startRadius: 20, endRadius: 1300, lenStart: 10, lenEnd: 420, widStart: 50, widEnd: 160, fadeIn: 20, fadeOut: 5, angleJitter: 7, phaseJitter: 60, period: 0.8 } },
    { label: 'Warp (slow)', values: { name: 'Warp', spokes: 32, perSpoke: 2, accel: 1.6, startRadius: 60, endRadius: 1200, lenStart: 30, lenEnd: 250, widStart: 60, widEnd: 120, fadeIn: 30, fadeOut: 15, period: 2.5 } },
    { label: 'Starburst', values: { name: 'Starburst', spokes: 12, perSpoke: 1, accel: 1, startRadius: 40, endRadius: 600, lenStart: 60, lenEnd: 160, widStart: 100, widEnd: 140, fadeIn: 10, fadeOut: 40, angleJitter: 0, phaseJitter: 0, period: 1.2 } },
    { label: 'Speed lines', values: { name: 'Speed lines', spokes: 60, perSpoke: 1, accel: 1.2, startRadius: 450, endRadius: 1400, lenStart: 80, lenEnd: 260, widStart: 80, widEnd: 140, fadeIn: 25, fadeOut: 25, angleJitter: 4, phaseJitter: 100, color: '#ffffff', period: 0.6 } },
  ],
});
