// Export: PNG frame, PNG sequence (ZIP), animated GIF, MP4 video, WebM video, OpenRaster (layers for GIMP / Krita).
import { app, emit, makeCanvas } from './state.js';
import { download, toast, formDialog, progress } from './ui.js';
import { encodeMp4 } from './mp4.js';

const toBlob = (canvas, type = 'image/png', q) => new Promise(r => canvas.toBlob(r, type, q));
const safeName = s => (s || 'animation').replace(/[^\w\- ]+/g, '_').trim() || 'animation';
/* progress: text in the status bar, plus the progress bar while an export runs (throws if Cancel was pressed) */
let prog = null;
const status = (t, frac) => { emit('status', t); if (prog && t) prog.update(frac ?? 0, t); };
const breathe = () => new Promise(r => setTimeout(r, 0));
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

/* ---------- ZIP (stored, no compression: PNGs are already compressed) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { let c = ~0; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; }
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ---------- GIF ---------- */
/* Median-cut palette over a 15-bit colour histogram. Returns Uint8Array of n*3 bytes. */
function buildPalette(count, sumR, sumG, sumB, maxColors) {
  const bins = [];
  for (let i = 0; i < 32768; i++) if (count[i]) bins.push(i);
  const chan = [i => i >> 10, i => (i >> 5) & 31, i => i & 31];
  const mk = list => {
    const lo = [31, 31, 31], hi = [0, 0, 0]; let total = 0;
    for (const b of list) { total += count[b]; for (let c = 0; c < 3; c++) { const v = chan[c](b); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; } }
    let axis = 0;
    for (let c = 1; c < 3; c++) if (hi[c] - lo[c] > hi[axis] - lo[axis]) axis = c;
    return { list, total, axis, range: hi[axis] - lo[axis] };
  };
  const boxes = bins.length ? [mk(bins)] : [];
  while (boxes.length < maxColors) {
    let bi = -1, score = 0;
    boxes.forEach((b, i) => { const s = b.range * Math.sqrt(b.total); if (b.list.length > 1 && s > score) { score = s; bi = i; } });
    if (bi < 0) break;
    const b = boxes[bi], f = chan[b.axis];
    b.list.sort((p, q) => f(p) - f(q));
    let acc = 0, cut = 1;
    for (let i = 0; i < b.list.length - 1; i++) { acc += count[b.list[i]]; if (acc >= b.total / 2) { cut = i + 1; break; } cut = i + 1; }
    boxes.splice(bi, 1, mk(b.list.slice(0, cut)), mk(b.list.slice(cut)));
  }
  const pal = new Uint8Array(maxColors * 3);
  boxes.forEach((b, i) => {
    let r = 0, g = 0, bl = 0, t = 0;
    for (const k of b.list) { r += sumR[k]; g += sumG[k]; bl += sumB[k]; t += count[k]; }
    pal[i * 3] = r / t; pal[i * 3 + 1] = g / t; pal[i * 3 + 2] = bl / t;
  });
  return { pal, used: boxes.length };
}
function lzw(indices, out) {
  // GIF-flavoured LZW with 8-bit symbols, written as 255-byte sub-blocks
  const bytes = [];
  let cur = 0, bits = 0;
  const emitCode = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8) { bytes.push(cur & 255); cur >>>= 8; bits -= 8; } };
  const CLEAR = 256, EOI = 257;
  let dict = new Map(), next = 258, size = 9;
  emitCode(CLEAR, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emitCode(prefix, size);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emitCode(CLEAR, size); dict = new Map(); next = 258; size = 9; }
    prefix = k;
  }
  emitCode(prefix, size); emitCode(EOI, size);
  if (bits > 0) bytes.push(cur & 255);
  out.push(new Uint8Array([8]));
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(new Uint8Array([chunk.length, ...chunk]));
  }
  out.push(new Uint8Array([0]));
}
async function exportGif(scale, transparent) {
  const d = app.doc, w = Math.round(d.width * scale), h = Math.round(d.height * scale);
  const c = makeCanvas(w, h, { willReadFrequently: true }), ctx = c.getContext('2d', { willReadFrequently: true });
  const frame = f => {
    d.render(ctx, f, { scale, bg: !transparent });
    if (!transparent && !d.bg) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
    return ctx.getImageData(0, 0, w, h).data;
  };
  // pass 1: colour statistics from a spread of frames
  const count = new Uint32Array(32768), sumR = new Float64Array(32768), sumG = new Float64Array(32768), sumB = new Float64Array(32768);
  const stride = Math.max(1, Math.floor(d.frames / 24)), skip = Math.max(1, Math.floor(w * h / 120000));
  for (let f = 0; f < d.frames; f += stride) {
    const px = frame(f);
    for (let i = 0; i < px.length; i += 4 * skip) {
      if (px[i + 3] < 128) continue;
      const k = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      count[k]++; sumR[k] += px[i]; sumG[k] += px[i + 1]; sumB[k] += px[i + 2];
    }
    status(`GIF: analysing colours ${Math.min(d.frames, f + stride)}/${d.frames}`, 0.15 * Math.min(d.frames, f + stride) / d.frames); await breathe();
  }
  const { pal, used } = buildPalette(count, sumR, sumG, sumB, 255);
  const TRANS = 255, cache = new Int16Array(32768).fill(-1);
  const nearest = (r, g, b) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < used; i++) { const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b, dd = dr * dr + dg * dg + db * db; if (dd < bd) { bd = dd; best = i; } }
    return best;
  };
  const out = [];
  const head = new Uint8Array(13 + 768);
  head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0]);
  head.set(pal, 13);
  out.push(head, new Uint8Array([0x21, 0xFF, 0x0B, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]));
  const delay = Math.max(2, Math.round(100 / d.fps)), idx = new Uint8Array(w * h);
  for (let f = 0; f < d.frames; f++) {
    const px = frame(f);
    for (let p = 0, i = 0; p < idx.length; p++, i += 4) {
      if (transparent && px[i + 3] < 128) { idx[p] = TRANS; continue; }
      const k = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      let v = cache[k];
      if (v < 0) v = cache[k] = nearest(px[i], px[i + 1], px[i + 2]);
      idx[p] = v;
    }
    out.push(new Uint8Array([0x21, 0xF9, 4, transparent ? 0x09 : 0x04, delay & 255, delay >> 8, TRANS, 0,
      0x2C, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0]));
    lzw(idx, out);
    status(`GIF: encoding frame ${f + 1}/${d.frames}`, 0.15 + 0.85 * (f + 1) / d.frames); await breathe();
  }
  out.push(new Uint8Array([0x3B]));
  return new Blob(out, { type: 'image/gif' });
}

/* ---------- WebM (recorded in real time from a canvas) ---------- */
async function exportWebM(scale) {
  const d = app.doc, w = Math.round(d.width * scale), h = Math.round(d.height * scale);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record WebM video');
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const paint = f => {
    d.render(ctx, f, { scale });
    if (!d.bg) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
  };
  paint(0);
  const rec = new MediaRecorder(c.captureStream(d.fps), { mimeType: mime, videoBitsPerSecond: 16e6 }), chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start();
  const t0 = performance.now();
  for (let f = 0; f < d.frames; f++) {
    paint(f);
    status(`WebM: recording frame ${f + 1}/${d.frames} (plays in real time)`, (f + 1) / d.frames);
    const due = t0 + (f + 1) * 1000 / d.fps;
    await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
  }
  rec.stop(); await stopped;
  return new Blob(chunks, { type: 'video/webm' });
}

/* ---------- OpenRaster: every layer as its own PNG, readable by GIMP and Krita ---------- */
const ORA_OPS = { 'source-over': 'svg:src-over', lighter: 'svg:plus', multiply: 'svg:multiply', screen: 'svg:screen', overlay: 'svg:overlay', darken: 'svg:darken',
  lighten: 'svg:lighten', 'color-dodge': 'svg:color-dodge', 'color-burn': 'svg:color-burn', 'hard-light': 'svg:hard-light', 'soft-light': 'svg:soft-light',
  difference: 'svg:difference', color: 'svg:color', luminosity: 'svg:luminosity', hue: 'svg:hue', saturation: 'svg:saturation' };
async function exportOra() {
  const d = app.doc, enc = new TextEncoder(), files = [{ name: 'mimetype', data: enc.encode('image/openraster') }];
  const x = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  // Each layer is saved as a full-size picture placed the way it looks on the current frame
  // (movement of the groups around it included); groups become nested stacks.
  const total = d.all().filter(l => !l.isGroup).length;
  let n = 0;
  const attrs = L => `name="${x(L.name)}" opacity="${(L.value('opacity', app.frame) / 100).toFixed(3)}" visibility="${L.visible ? 'visible' : 'hidden'}" composite-op="${ORA_OPS[L.blend] || 'svg:src-over'}"`;
  const stackOf = async (list, indent) => {
    let out = '';
    for (const L of [...list].reverse()) {
      if (L.isGroup) { out += `${indent}<stack ${attrs(L)}>\n${await stackOf(L.children, indent + ' ')}${indent}</stack>\n`; continue; }
      const c = makeCanvas(d.width, d.height), cx = c.getContext('2d'), m = d.worldMatrix(L, app.frame);
      cx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      cx.filter = L.filterString(app.frame);
      cx.drawImage(L.canvas, 0, 0);
      const i = n++;
      files.push({ name: `data/layer${i}.png`, data: await bytesOf(await toBlob(c)) });
      out += `${indent}<layer ${attrs(L)} src="data/layer${i}.png" x="0" y="0"/>\n`;
      status(`OpenRaster: layer ${n}/${total}`, n / total); await breathe();
    }
    return out;
  };
  const stack = await stackOf(d.layers, '  ');
  files.push({ name: 'stack.xml', data: enc.encode(`<?xml version='1.0' encoding='UTF-8'?>\n<image version="0.0.3" w="${d.width}" h="${d.height}" xres="72" yres="72">\n <stack>\n${stack} </stack>\n</image>\n`) });
  const merged = makeCanvas(d.width, d.height);
  d.render(merged.getContext('2d'), app.frame);
  files.push({ name: 'mergedimage.png', data: await bytesOf(await toBlob(merged)) });
  const th = makeCanvas(256, Math.round(256 * d.height / d.width));
  th.getContext('2d').drawImage(merged, 0, 0, th.width, th.height);
  files.push({ name: 'Thumbnails/thumbnail.png', data: await bytesOf(await toBlob(th)) });
  return new Blob([zip(files)], { type: 'image/openraster' });
}

/* ---------- entry point ---------- */
export async function exportDialog() {
  const d = app.doc;
  const v = await formDialog('Export', [
    { key: 'format', label: 'Format', type: 'select', value: 'png', options: [
      ['png', 'PNG image – current frame'], ['seq', 'PNG sequence – every frame (ZIP)'], ['gif', 'Animated GIF'],
      ['mp4', 'MP4 video (H.264)'], ['webm', 'WebM video (records in real time)'], ['ora', 'OpenRaster layers (.ora for GIMP / Krita)']] },
    { key: 'scale', label: 'Size', type: 'select', value: '1', options: [['1', `100% (${d.width}×${d.height})`], ['0.5', '50%'], ['0.25', '25%']] },
    { key: 'quality', label: 'Video quality', type: 'select', value: 'high', options: [['high', 'High (large file)'], ['medium', 'Medium'], ['small', 'Small file']] },
    { key: 'transparent', label: 'Transparent background (PNG / GIF / ORA)', type: 'checkbox', value: !d.bg },
  ], { okLabel: 'Export' });
  if (!v) return;
  const scale = +v.scale, name = safeName(d.name), bg = !v.transparent;
  const w = Math.round(d.width * scale), h = Math.round(d.height * scale);
  const renderPng = async f => {
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    d.render(ctx, f, { scale, bg });
    if (bg && !d.bg) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    return toBlob(c);
  };
  if (v.format !== 'png') prog = progress(`Exporting ${name}`);
  try {
    if (v.format === 'png') download(await renderPng(app.frame), `${name}_frame${String(app.frame + 1).padStart(4, '0')}.png`);
    else if (v.format === 'seq') {
      const files = [];
      for (let f = 0; f < d.frames; f++) {
        files.push({ name: `${name}_${String(f + 1).padStart(4, '0')}.png`, data: await bytesOf(await renderPng(f)) });
        status(`PNG sequence: frame ${f + 1}/${d.frames}`, (f + 1) / d.frames); await breathe();
      }
      download(zip(files), `${name}_frames.zip`);
    } else if (v.format === 'gif') download(await exportGif(scale, v.transparent), `${name}.gif`);
    else if (v.format === 'mp4') {
      // MP4 has no transparency: use the project background, or white
      const blob = await encodeMp4({
        width: w, height: h, fps: d.fps, frames: d.frames, quality: v.quality,
        drawFrame: (ctx, f) => {
          d.render(ctx, f, { scale });
          if (!d.bg) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.globalCompositeOperation = 'source-over'; }
        },
        onProgress: (i, n) => status(`MP4: encoding frame ${i}/${n}`, i / n),
      });
      download(blob, `${name}.mp4`);
    }
    else if (v.format === 'webm') download(await exportWebM(scale), `${name}.webm`);
    else download(await exportOra(), `${name}.ora`);
    status(''); toast('Export finished');
  } catch (err) {
    status('');
    if (err.name === 'Cancelled') toast('Export cancelled'); else toast('Export failed: ' + err.message, 5000);
  } finally { prog?.done(); prog = null; }
}
