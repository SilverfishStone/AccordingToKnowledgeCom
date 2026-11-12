// MP4 (H.264) export using the browser's built-in video encoder (WebCodecs), plus a small MP4 writer.
// No ffmpeg needed. Works in Chrome / Edge. Renders frames as fast as the encoder takes them.

/* ---------- MP4 box writer ---------- */
const enc = new TextEncoder();
function cat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u8 = (...v) => new Uint8Array(v);
const u16 = v => u8((v >>> 8) & 255, v & 255);
const u32 = v => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const i32 = v => u32(v >>> 0);
const zeros = n => new Uint8Array(n);
const str = s => enc.encode(s);
function box(type, ...payload) {
  const body = cat(payload);
  return cat([u32(body.length + 8), str(type), body]);
}
const fullBox = (type, version, flags, ...payload) => box(type, u8(version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255), ...payload);
const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

/* samples: [{ data: Uint8Array, key: bool, pts: number (in timescale units) }] in decode order */
export function muxMp4({ width, height, timescale, sampleDuration, avcC, samples }) {
  const n = samples.length, duration = n * sampleDuration;
  const offsets = samples.map((s, i) => s.pts - i * sampleDuration);
  const needCtts = offsets.some(o => o !== 0);
  const keys = [];
  samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });

  const build = mdatOffset => {
    const stsd = fullBox('stsd', 0, 0, u32(1),
      box('avc1', zeros(6), u16(1), zeros(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1),
        zeros(32), u16(0x0018), u16(0xFFFF), box('avcC', avcC)));
    const stts = fullBox('stts', 0, 0, u32(1), u32(n), u32(sampleDuration));
    const ctts = needCtts ? fullBox('ctts', 1, 0, u32(n), ...offsets.flatMap(o => [u32(1), i32(o)])) : null;
    const stss = keys.length === n ? null : fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32));
    const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));     // everything in one chunk
    const stsz = fullBox('stsz', 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length)));
    const stco = fullBox('stco', 0, 0, u32(1), u32(mdatOffset));
    const stbl = box('stbl', ...[stsd, stts, ctts, stss, stsc, stsz, stco].filter(Boolean));
    const minf = box('minf', fullBox('vmhd', 0, 1, zeros(8)), box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))), stbl);
    const mdia = box('mdia',
      fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55C4), u16(0)),
      fullBox('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler\0')),
      minf);
    const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0),
      MATRIX, u32(width << 16), u32(height << 16));
    const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), zeros(10),
      MATRIX, zeros(24), u32(2));
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };

  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const mdatSize = samples.reduce((a, s) => a + s.data.length, 0) + 8;
  // moov goes first ("fast start") so the file plays while still downloading; its size doesn't depend on the offset
  const moovLen = build(0).length;
  const moov = build(ftyp.length + moovLen + 8);
  return new Blob([ftyp, moov, u32(mdatSize), str('mdat'), ...samples.map(s => s.data)], { type: 'video/mp4' });
}

/* ---------- encoding ---------- */
// High → Main → Baseline profiles, highest level first; the first one the browser accepts is used.
const CODECS = ['avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D4033', 'avc1.4D402A', 'avc1.4D4028', 'avc1.42E033', 'avc1.42E02A', 'avc1.42E028', 'avc1.42001F'];

export async function mp4Supported() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/* drawFrame(ctx, f) paints frame f (opaque) into a width×height canvas. quality: 'high' | 'medium' | 'small' */
export async function encodeMp4({ width, height, fps, frames, drawFrame, quality = 'high', onProgress = () => {} }) {
  if (!await mp4Supported()) throw new Error('This browser has no built-in video encoder. Use Chrome or Edge for MP4 export.');
  width = Math.max(2, width & ~1); height = Math.max(2, height & ~1);            // H.264 needs even sizes
  const bpp = { high: 0.2, medium: 0.1, small: 0.05 }[quality] || 0.2;              // bits per pixel per frame
  const bitrate = Math.round(Math.min(60e6, Math.max(1e6, width * height * fps * bpp)));
  let config = null;
  for (const codec of CODECS) {
    for (const hardwareAcceleration of ['no-preference', 'prefer-software']) {
      const c = { codec, width, height, bitrate, framerate: fps, hardwareAcceleration, avc: { format: 'avc' }, latencyMode: 'quality' };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch { /* try next */ }
    }
    if (config) break;
  }
  if (!config) throw new Error(`The browser cannot encode H.264 at ${width}×${height}. Try a smaller export size.`);

  const timescale = fps * 1000, sampleDuration = 1000;
  const samples = [];
  let avcC = null, failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description;
      if (d && !avcC) avcC = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice();
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, key: chunk.type === 'key', pts: Math.round(chunk.timestamp / 1e6 * timescale) });
    },
    error: e => { failure = e; },
  });
  encoder.configure(config);

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gop = Math.max(1, fps * 2);                     // a keyframe every 2 seconds
  try {
  for (let f = 0; f < frames; f++) {
    if (failure) break;
    drawFrame(ctx, f);
    const frame = new VideoFrame(canvas, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: f % gop === 0 });
    frame.close();
    onProgress(f + 1, frames);
    // keep the encoder queue short so memory stays flat
    while (encoder.encodeQueueSize > 4 && !failure) await new Promise(r => setTimeout(r, 1));
    if (f % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }
  } catch (e) { try { encoder.close(); } catch { /* closed */ } throw e; }    // cancelled from onProgress
  if (!failure) await encoder.flush().catch(e => { failure = e; });
  try { encoder.close(); } catch { /* already closed */ }
  if (failure) throw new Error('Video encoder failed: ' + (failure.message || failure));
  if (!avcC || !samples.length) throw new Error('The video encoder produced no output');
  // first sample's presentation time becomes 0 (some encoders start slightly later)
  const t0 = Math.min(...samples.map(s => s.pts));
  for (const s of samples) s.pts -= t0;
  return muxMp4({ width, height, timescale, sampleDuration, avcC, samples });
}
