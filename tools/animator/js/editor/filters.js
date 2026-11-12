// Destructive image filters for the active layer, with live preview. All honour the selection.
import { app, makeCanvas, clamp, hexToRgb, requestRender } from './state.js';
import { beginEdit, commitEdit, revertEdit, backupCanvas } from './history.js';
import { target } from './tools.js';
import { form, dialog } from './ui.js';

const range = (key, label, min, max, value, step = 1, unit = '') => ({ key, label, type: 'range', min, max, value, step, unit });

/* A filter is either `css` (a canvas filter string) or `pixels` (edits a copy of the RGBA data in place). */
export const FILTERS = {
  brightnessContrast: {
    name: 'Brightness / Contrast',
    fields: [range('b', 'Brightness', -100, 100, 0), range('c', 'Contrast', -100, 100, 0)],
    css: v => `brightness(${100 + v.b}%) contrast(${100 + v.c}%)`,
  },
  hsl: {
    name: 'Hue / Saturation / Lightness',
    fields: [range('h', 'Hue', -180, 180, 0, 1, '°'), range('s', 'Saturation', -100, 100, 0), range('l', 'Lightness', -100, 100, 0)],
    css: v => `hue-rotate(${v.h}deg) saturate(${100 + v.s}%) brightness(${100 + v.l}%)`,
  },
  levels: {
    name: 'Levels',
    fields: [range('lo', 'Black point', 0, 254, 0), range('hi', 'White point', 1, 255, 255), range('g', 'Gamma', 0.1, 3, 1, 0.05)],
    pixels(d, v) {
      const lut = new Uint8ClampedArray(256), span = Math.max(1, v.hi - v.lo);
      for (let i = 0; i < 256; i++) lut[i] = 255 * Math.pow(clamp((i - v.lo) / span, 0, 1), 1 / v.g);
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    },
  },
  blur: {
    name: 'Gaussian blur',
    fields: [range('r', 'Radius', 0, 100, 5, 0.5, 'px')],
    css: v => `blur(${v.r}px)`,
  },
  sharpen: {
    name: 'Sharpen (unsharp mask)',
    fields: [range('a', 'Amount', 0, 300, 100, 1, '%'), range('r', 'Radius', 0.5, 10, 1.5, 0.5, 'px')],
    pixels(d, v, w, h) {
      const c = makeCanvas(w, h, { willReadFrequently: true }), x = c.getContext('2d');
      x.filter = `blur(${v.r}px)`;
      x.drawImage(backupCanvas(), 0, 0);
      const b = x.getImageData(0, 0, w, h).data, k = v.a / 100;
      for (let i = 0; i < d.length; i += 4) {
        d[i] += (d[i] - b[i]) * k; d[i + 1] += (d[i + 1] - b[i + 1]) * k; d[i + 2] += (d[i + 2] - b[i + 2]) * k;
      }
    },
  },
  threshold: {
    name: 'Threshold',
    fields: [range('t', 'Threshold', 0, 255, 128)],
    pixels(d, v) {
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) >= v.t ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = y;
      }
    },
  },
  posterize: {
    name: 'Posterize',
    fields: [range('n', 'Levels', 2, 16, 4)],
    pixels(d, v) {
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round(i / 255 * (v.n - 1)) / (v.n - 1) * 255);
      for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    },
  },
  colorToAlpha: {
    name: 'Colour to alpha',
    fields: [{ key: 'color', label: 'Make transparent', type: 'color', value: '#ffffff' }],
    pixels(d, v) {
      const k = hexToRgb(v.color);
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let a = 0;
        for (let c = 0; c < 3; c++) {
          const p = d[i + c], q = k[c];
          const t = p > q ? (p - q) / (255 - q) : p < q ? (q - p) / q : 0;
          if (t > a) a = t;
        }
        if (a > 0) for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - k[c]) / a + k[c];
        d[i + 3] *= a;
      }
    },
  },
  dropShadow: {
    name: 'Drop shadow',
    fields: [range('x', 'Offset X', -200, 200, 12, 1, 'px'), range('y', 'Offset Y', -200, 200, 12, 1, 'px'), range('r', 'Blur', 0, 100, 10, 1, 'px'),
      range('o', 'Opacity', 0, 100, 60, 1, '%'), { key: 'color', label: 'Colour', type: 'color', value: '#000000' }],
    css: v => { const [r, g, b] = hexToRgb(v.color); return `drop-shadow(${v.x}px ${v.y}px ${v.r}px rgba(${r},${g},${b},${v.o / 100}))`; },
  },
  invert: { name: 'Invert colours', css: () => 'invert(100%)' },
  desaturate: { name: 'Desaturate', css: () => 'grayscale(100%)' },
};

let outC = null, srcData = null;
function apply(def, v, L) {
  const w = L.canvas.width, h = L.canvas.height;
  if (!outC || outC.width !== w || outC.height !== h) outC = makeCanvas(w, h);
  const o = outC.getContext('2d');
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over';
  o.clearRect(0, 0, w, h);
  if (def.css) { o.filter = def.css(v); o.drawImage(backupCanvas(), 0, 0); o.filter = 'none'; }
  else {
    srcData ||= backupCanvas().getContext('2d').getImageData(0, 0, w, h);
    const img = new ImageData(new Uint8ClampedArray(srcData.data), w, h);
    def.pixels(img.data, v, w, h);
    o.putImageData(img, 0, 0);
  }
  const c = L.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none';
  if (app.sel) {
    o.globalCompositeOperation = 'destination-in'; o.drawImage(app.sel.mask, 0, 0);
    c.globalCompositeOperation = 'copy'; c.drawImage(backupCanvas(), 0, 0);
    c.globalCompositeOperation = 'destination-out'; c.drawImage(app.sel.mask, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.drawImage(outC, 0, 0);
  } else { c.globalCompositeOperation = 'copy'; c.drawImage(outC, 0, 0); }
  c.restore(); o.restore();
  L.rev++;
  requestRender();
}

export async function runFilter(id) {
  const def = FILTERS[id], L = target();
  if (!L) return;
  beginEdit(L);
  srcData = null;
  if (!def.fields) { apply(def, {}, L); commitEdit(L, null, def.name); return; }
  let raf = 0;
  const f = form(def.fields.map(x => ({ ...x })), v => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(def, v, L); }); });
  apply(def, f.values, L);
  const ok = await dialog({ title: def.name, content: f.node, buttons: [['Cancel', null], ['Apply', 'ok']], light: true });
  if (raf) cancelAnimationFrame(raf);
  if (ok) { apply(def, f.values, L); commitEdit(L, null, def.name); }
  else { revertEdit(L); requestRender(); }
  srcData = null;
}
