// Small fetch wrapper shared by every page. Works two ways:
//   - with the Animator server (node server.js): accounts, projects on the computer, phone uploads
//   - as plain files on any website: no server, so everything is kept in this browser (local-store.js)
import { localApi } from './local-store.js';
import { cloudActive, cloudInbox, cloudPhotoLimit } from './cloud.js';

let modeP = null;
/* 'server' or 'local' — decided once, by asking the server who is signed in */
export function backend() {
  modeP ||= (async () => {
    try {
      const res = await fetch('api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) return 'server';
    } catch { /* no server (or opened as a file) */ }
    return 'local';
  })();
  return modeP;
}
const rel = url => url.replace(/^\//, '');           // pages may live in a sub-folder of a website
// With no server of its own, the photo inbox moves online when the Animator is linked to an account (see cloud.js)
const inCloud = async url => /^api\/inbox(\/|\?|$)/.test(rel(url)) && cloudActive() && await backend() === 'local';

/* An image (layer picture, thumbnail, inbox photo) as a Blob, or null if there isn't one. */
export async function getBlob(url) {
  if (await inCloud(url)) { try { return await cloudInbox('GET', rel(url)); } catch { return null; } }
  if (await backend() === 'local') { try { return await localApi('GET', rel(url)); } catch { return null; } }
  const res = await fetch(rel(url), { credentials: 'same-origin' });
  return res.ok ? res.blob() : null;
}
/* Something an <img> can show for that image. */
export async function mediaUrl(url) {
  if (await backend() === 'server') return rel(url);
  const b = await getBlob(url);
  return b ? URL.createObjectURL(b) : '';
}

export async function api(method, url, body, headers = {}) {
  if (await inCloud(url)) return cloudInbox(method, rel(url), body, headers);
  if (await backend() === 'local') return localApi(method, rel(url), body, headers);
  url = rel(url);
  const opts = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    opts.body = body;
    if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

// Shrink a photo before upload: applies the camera's rotation and caps the long side. A photo kept in an online account
// also has to fit the account's size limit, so it is scaled and compressed until it does.
export async function preparePhoto(file, maxSide = 3000) {
  const online = cloudActive() && await backend() === 'local';
  const limit = online ? cloudPhotoLimit() * 0.96 : 0;
  if (online) maxSide = Math.min(maxSide, 2600);
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), blob = null;
    for (let attempt = 0; attempt < 6; attempt++, k *= 0.8) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of limit ? [0.9, 0.8, 0.7, 0.6] : [0.92]) {
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
        if (!blob || !limit || blob.size <= limit) break;
      }
      if (!blob || !limit || blob.size <= limit) break;
    }
    bmp.close?.();
    if (blob) return blob;
  } catch { /* fall back to the original file */ }
  return file;
}

// Shared sign-in / sign-up card. Calls onDone(user) once signed in.
export function authCard(container, onDone, allowSignup = true) {
  container.innerHTML = `
    <div class="card auth">
      <h2 id="authTitle">Sign in</h2>
      <form id="authForm">
        <div class="field"><label for="authUser">Username</label><input id="authUser" type="text" autocomplete="username" required></div>
        <div class="field"><label for="authPass">Password</label><input id="authPass" type="password" autocomplete="current-password" required></div>
        <div class="error" id="authErr"></div>
        <div class="row">
          <button class="primary" type="submit" id="authGo">Sign in</button>
          <button type="button" id="authSwap" ${allowSignup ? '' : 'hidden'}>Create an account</button>
        </div>
      </form>
    </div>`;
  let mode = 'login';
  const q = id => container.querySelector('#' + id);
  q('authSwap').onclick = () => {
    mode = mode === 'login' ? 'register' : 'login';
    q('authTitle').textContent = mode === 'login' ? 'Sign in' : 'Create an account';
    q('authGo').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    q('authSwap').textContent = mode === 'login' ? 'Create an account' : 'I already have an account';
    q('authPass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    q('authErr').textContent = '';
  };
  q('authForm').onsubmit = async e => {
    e.preventDefault();
    q('authErr').textContent = '';
    try {
      const r = await api('POST', '/api/' + mode, { username: q('authUser').value, password: q('authPass').value });
      onDone(r.user);
    } catch (err) { q('authErr').textContent = err.message; }
  };
}
