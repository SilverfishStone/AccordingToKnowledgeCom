// Built-in "surface art" textures drawn at start-up: equipment faces, screens, signs. They are listed like any texture
// (id "gen:<name>") but kept out of the paint swatch grid; gadgets use them through "tex" on a plane or box node.
import { lib } from './assets.js';

const TAU = Math.PI * 2;
let seed = 11;
const R = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const U = (a, b) => a + (b - a) * R();

function canvasUrl(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  fn(g, w, h);
  return c.toDataURL('image/png');
}

const led = (g, x, y, c, r = 4) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
function knob(g, x, y, r) {
  g.fillStyle = '#1c1c1e'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = '#b8b4aa'; g.lineWidth = 2; const a = U(0, TAU); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke();
  g.strokeStyle = '#8a8a8a'; g.lineWidth = 1; for (let k = 0; k < 9; k++) { const t = -2.4 + k * 0.6; g.beginPath(); g.moveTo(x + Math.cos(t) * (r + 4), y + Math.sin(t) * (r + 4)); g.lineTo(x + Math.cos(t) * (r + 8), y + Math.sin(t) * (r + 8)); g.stroke(); }
}
function meter(g, x, y, mw, mh) {
  g.fillStyle = '#d9d2b4'; g.fillRect(x, y, mw, mh); g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(x, y, mw, mh);
  g.beginPath(); g.arc(x + mw / 2, y + mh * 1.1, mh * 0.85, -2.4, -0.74); g.stroke();
  const a = U(-2.2, -1.0); g.strokeStyle = '#a01010'; g.beginPath(); g.moveTo(x + mw / 2, y + mh * 1.1); g.lineTo(x + mw / 2 + Math.cos(a) * mh * 0.8, y + mh * 1.1 + Math.sin(a) * mh * 0.8); g.stroke();
}
const label = (g, t, x, y, px = 15) => { g.fillStyle = '#d8d4c8'; g.font = `bold ${px}px monospace`; g.fillText(t, x, y); };

function rack(kind) {
  return canvasUrl(512, 160, (g, w, h) => {
    g.fillStyle = kind === 'tx' || kind === 'amp' ? '#3b3d3a' : '#34373c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#161718'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.fillStyle = '#8c8f94'; for (const x of [12, w - 12]) for (const y of [14, h - 14]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
    if (kind === 'tx') { meter(g, 40, 40, 100, 60); meter(g, 150, 40, 100, 60); knob(g, 330, 80, 26); knob(g, 400, 80, 18); knob(g, 450, 80, 18); label(g, 'TX-3  BROADCAST  500W', 40, 28); led(g, 290, 130, '#aa2020'); led(g, 310, 130, '#a07a10'); }
    else if (kind === 'rx') { g.fillStyle = '#0c1410'; g.fillRect(36, 38, 300, 56); g.strokeStyle = '#7d8a7a'; g.lineWidth = 1; for (let x = 44; x < 330; x += 10) { g.beginPath(); g.moveTo(x, 44); g.lineTo(x, x % 50 === 4 ? 66 : 56); g.stroke(); } g.strokeStyle = '#b02020'; g.lineWidth = 2; g.beginPath(); const px = U(80, 300); g.moveTo(px, 40); g.lineTo(px, 92); g.stroke(); knob(g, 380, 70, 22); knob(g, 450, 70, 16); label(g, 'RX-7  4-30 MHZ', 40, 28); led(g, 380, 130, '#2a8a3a'); }
    else if (kind === 'amp') { g.fillStyle = '#121314'; for (let y = 36; y < h - 20; y += 12) g.fillRect(40, y, 250, 5); meter(g, 320, 44, 80, 50); knob(g, 440, 70, 18); label(g, 'PA-AMP  200W', 40, 26); led(g, 330, 130, '#aa2020'); led(g, 350, 130, '#2a8a3a'); }
    else if (kind === 'patch') { for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) { const x = 40 + c * 28, y = 50 + r * 46; g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); g.fillStyle = '#8a8a8a'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); g.fillStyle = '#d8d4c8'; g.font = '9px monospace'; g.fillText(String(r * 16 + c + 1), x - 5, y + 20); } label(g, 'PATCH BAY', 40, 28); }
    else if (kind === 'switch') { for (let c = 0; c < 12; c++) { const x = 40 + c * 36; g.fillStyle = '#121212'; g.fillRect(x - 6, 50, 12, 40); g.fillStyle = '#b9b9b9'; g.fillRect(x - 3, c % 3 ? 52 : 70, 6, 20); led(g, x, 112, c % 4 ? '#2a8a3a' : '#a07a10', 4); } label(g, 'LINE SELECT', 40, 28); }
    else if (kind === 'tape') { knob(g, 60, 80, 22); knob(g, 450, 80, 22); g.fillStyle = '#0c0c0c'; g.fillRect(160, 40, 190, 70); g.fillStyle = '#d49a2a'; g.font = 'bold 32px monospace'; g.fillText('0147', 200, 90); label(g, 'REC  TAPE', 40, 26); led(g, 110, 130, '#aa2020'); }
    else { g.fillStyle = '#05080a'; g.fillRect(100, 40, 300, 70); g.fillStyle = '#d49a2a'; g.font = 'bold 44px monospace'; g.fillText('12:47:05', 130, 92); knob(g, 50, 80, 18); knob(g, 460, 80, 18); label(g, 'MASTER CLOCK', 100, 28); }
  });
}

function screen(kind) {
  return canvasUrl(256, 192, (g, w, h) => {
    g.fillStyle = '#031208'; g.fillRect(0, 0, w, h);
    const col = kind === 'amber' ? '#d49a2a' : '#46e08a'; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5;
    if (kind === 'scope') { g.globalAlpha = 0.25; for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.globalAlpha = 1; g.beginPath(); for (let x = 0; x <= w; x += 2) { const y = h / 2 + Math.sin(x * 0.09) * 40 * Math.sin(x * 0.013 + 1) + Math.sin(x * 0.41) * 9; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
    else if (kind === 'spectrum') { for (let x = 10; x < w - 10; x += 6) { const bh = 16 + Math.abs(Math.sin(x * 0.07) * Math.sin(x * 0.021 + 2)) * 120 * (0.5 + R()); g.fillRect(x, h - 20 - bh, 4, bh); } g.fillRect(10, h - 18, w - 20, 1); }
    else { g.font = '13px monospace'; ['LINK 03 ... OK', 'CH 07  14.205 MHZ', 'CARRIER  -61 DBM', 'SIGNAL ------  LOST', 'RETRY 0412 ...', 'BEACON  ASIA-3', 'PWR 11%  BACKUP', '> _'].forEach((t, i) => g.fillText(t, 12, 22 + i * 20)); }
    g.fillStyle = 'rgba(0,0,0,.3)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  });
}

const make = {
  'rack-tx': () => rack('tx'), 'rack-rx': () => rack('rx'), 'rack-amp': () => rack('amp'), 'rack-patch': () => rack('patch'),
  'rack-switch': () => rack('switch'), 'rack-tape': () => rack('tape'), 'rack-clock': () => rack('clock'),
  'screen-text': () => screen('text'), 'screen-amber': () => screen('amber'), 'screen-scope': () => screen('scope'), 'screen-spectrum': () => screen('spectrum'),
  keys: () => canvasUrl(256, 128, (g, w, h) => { g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h); g.fillStyle = '#9a9a9a'; for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) g.fillRect(8 + c * 16, 8 + r * 22, 13, 18); }),
  mixer: () => canvasUrl(512, 256, (g, w, h) => { g.fillStyle = '#2f3236'; g.fillRect(0, 0, w, h); for (let c = 0; c < 14; c++) { const x = 30 + c * 34; g.fillStyle = '#0c0c0d'; g.fillRect(x - 3, 40, 6, 140); g.fillStyle = c % 5 ? '#b8b4aa' : '#a02c24'; g.fillRect(x - 10, 60 + R() * 90, 20, 12); knob(g, x, 210, 9); led(g, x, 24, c % 3 ? '#2a8a3a' : '#a07a10', 3); } label(g, 'MIXER  MK II', 30, 16, 12); }),
  intercom: () => canvasUrl(256, 320, (g, w, h) => { g.fillStyle = '#34373c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#101010'; for (let y = 24; y < 100; y += 10) g.fillRect(30, y, w - 60, 4); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const x = 30 + c * 72, y = 120 + r * 46; g.fillStyle = '#b9b3a2'; g.fillRect(x, y, 58, 32); label(g, String(r * 3 + c + 1).padStart(2, '0'), x + 18, y + 22, 16); g.fillStyle = '#111'; g.fillRect(x, y + 28, 58, 4); led(g, x + 50, y + 8, r * 3 + c === 4 ? '#aa2020' : '#262626', 4); } label(g, 'INTERCOM', 70, 112, 14); }),
  dial: () => canvasUrl(256, 256, (g) => { g.fillStyle = '#25272a'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d9d2b4'; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.stroke(); for (let k = 0; k <= 40; k++) { const aa = Math.PI * 0.75 + k * (Math.PI * 1.5 / 40); g.lineWidth = k % 5 ? 1 : 3; g.beginPath(); g.moveTo(128 + Math.cos(aa) * 96, 128 + Math.sin(aa) * 96); g.lineTo(128 + Math.cos(aa) * (k % 5 ? 104 : 110), 128 + Math.sin(aa) * (k % 5 ? 104 : 110)); g.stroke(); } g.strokeStyle = '#a01010'; g.lineWidth = 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(2.9) * 90, 128 + Math.sin(2.9) * 90); g.stroke(); label(g, 'FREQ  MHZ', 82, 190, 16); }),
  'on-air': () => canvasUrl(256, 96, (g, w, h) => { g.fillStyle = '#2a0707'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6a1010'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#a02020'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('ON AIR', w / 2, 66); }),
  broadcaster: () => canvasUrl(256, 64, (g, w, h) => { g.fillStyle = '#d8d4c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#6a1010'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('BROADCASTER', w / 2, 44); }),
  grille: () => canvasUrl(128, 96, (g, w, h) => { g.fillStyle = '#2a2b2e'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b0b0c'; for (let y = 8; y < h - 4; y += 8) g.fillRect(8, y, w - 16, 4); }),
  'phased-array': () => canvasUrl(256, 180, (g, w, h) => { g.fillStyle = '#16181c'; g.fillRect(0, 0, w, h); g.fillStyle = '#b8932f'; for (let y = 8; y < h - 4; y += 14) for (let x = 8; x < w - 4; x += 14) g.fillRect(x, y, 8, 8); g.strokeStyle = '#5a5d63'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4); }),
  'status-panel': () => canvasUrl(256, 96, (g, w, h) => { g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#4a4d52'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); [['#ff0d05', 64], ['#d49a2a', 128], ['#2aa85a', 192]].forEach(([c, x], i) => { g.fillStyle = i === 0 ? c : '#26262a'; g.beginPath(); g.arc(x, 48, 20, 0, TAU); g.fill(); }); }),
  'warning-sign': () => canvasUrl(256, 256, (g, w, h) => { g.fillStyle = '#e0b341'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.beginPath(); g.moveTo(128, 30); g.lineTo(230, 215); g.lineTo(26, 215); g.closePath(); g.lineWidth = 12; g.strokeStyle = '#111'; g.stroke(); g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.fillText('!', 128, 190); }),
};

export function registerProcTextures() {
  for (const [name, fn] of Object.entries(make)) {
    const id = 'gen:' + name;
    if (!lib.textures.has(id)) lib.textures.set(id, { id, name: name.replace(/-/g, ' '), data: fn(), imported: false, hidden: true, tex: null });
  }
}
