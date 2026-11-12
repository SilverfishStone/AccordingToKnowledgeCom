// Optional online account for the Animator, linked to the According to Knowledge account system.
// Everything else (projects, layers) stays in this browser; only the photo inbox moves online, so a photo taken on a phone
// is waiting in the editor on a computer. Signing in returns a token (kept here, sent as "Authorization: Bearer …"); the
// website is a different address from the Animator, so the account's cookie can't be used.
const TOKEN_KEY = 'animator.cloudToken', USER_KEY = 'animator.cloudUser', BASE_KEY = 'animator.cloudBase';
const DEFAULT_BASE = 'https://accordingtoknowledge.com/api/animator';
const SITE_NAME = 'According to Knowledge';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
/* where the account lives; a different address can be set for testing: localStorage['animator.cloudBase'] */
export const cloudBase = () => (store.get(BASE_KEY) || DEFAULT_BASE).replace(/\/$/, '');
export const cloudToken = () => store.get(TOKEN_KEY);
export const cloudActive = () => !!cloudToken();
export function cloudUser() { try { return JSON.parse(store.get(USER_KEY) || 'null'); } catch { return null; } }
export const cloudSiteName = SITE_NAME;
export const cloudSiteUrl = () => cloudBase().replace(/\/api\/animator$/, '');
/* the largest photo the account will keep (bytes); the server tells us after sign-in, this is its default */
export const cloudPhotoLimit = () => Number(store.get('animator.cloudPhotoLimit')) || 1300000;

function forget() { store.del(TOKEN_KEY); store.del(USER_KEY); }

/* The password is stretched here, on this device, before it's sent: the same steps the website uses (see its community.js),
   so the same account works. These two values must stay exactly as they are. */
const ROUNDS = 600000, SALT = 'atk-v1:';
async function stretch(username, password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT + username.trim().toLowerCase()), iterations: ROUNDS }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) headers.Authorization = 'Bearer ' + cloudToken();
  let res;
  try { res = await fetch(cloudBase() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' }); }
  catch { throw Object.assign(new Error(`Couldn’t reach ${SITE_NAME}. Check the connection and try again.`), { status: 0 }); }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) {
    if (res.status === 401 && auth) { forget(); throw Object.assign(new Error('You were signed out of your account. Sign in again.'), { status: 401 }); }
    throw Object.assign(new Error(data?.error || `Something went wrong (${res.status}).`), { status: res.status });
  }
  return data;
}

export async function cloudSignIn(username, password) {
  username = String(username || '').trim();
  if (!username || !password) throw new Error('Enter your username and password.');
  const d = await call('POST', '/login', { username, password: await stretch(username, password) }, { auth: false });
  store.set(TOKEN_KEY, d.token);
  store.set(USER_KEY, JSON.stringify(d.user));
  if (d.maxPhoto) store.set('animator.cloudPhotoLimit', String(d.maxPhoto));
  return d.user;
}
export async function cloudSignOut() {
  try { if (cloudActive()) await call('POST', '/logout', {}); } catch { /* already gone */ }
  forget();
}
export const cloudUsage = () => call('GET', '/me');

/* ---- the photo inbox, in the shape the Animator's own server uses (see api.js) ---- */
const blobToBase64 = blob => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('That photo could not be read'));
  r.readAsDataURL(blob);
});
const photoCache = new Map();

/* path is "api/inbox" or "api/inbox/<id>" */
export async function cloudInbox(method, path, body, headers = {}) {
  const id = path.replace(/^\/?api\/inbox\/?/, '').split('?')[0];
  if (!id) {
    if (method === 'GET') return call('GET', '/photos');
    if (method === 'POST') {
      if (!(body instanceof Blob) || !/^image\/(jpeg|png|webp)$/.test(body.type)) throw new Error('Only JPEG, PNG or WebP photos can be kept online.');
      let name = 'photo';
      try { name = decodeURIComponent(headers['X-Filename'] || 'photo'); } catch { /* keep the default */ }
      return call('POST', '/photos', { name, type: body.type, data: await blobToBase64(body) });
    }
  } else {
    if (method === 'GET') {
      if (photoCache.has(id)) return photoCache.get(id);
      const d = await call('GET', '/photos/' + id);
      const bin = atob(d.data), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: d.type });
      if (photoCache.size > 30) photoCache.delete(photoCache.keys().next().value);
      photoCache.set(id, blob);
      return blob;
    }
    if (method === 'DELETE') { photoCache.delete(id); return call('DELETE', '/photos/' + id); }
  }
  throw new Error('Not found');
}

/* A sign-in card (same look as the Animator's own). Calls onDone(user) once signed in. */
export function cloudAuthCard(container, onDone, { intro = '' } = {}) {
  container.innerHTML = `
    <div class="card auth">
      <h2>Sign in</h2>
      <p class="muted">${intro || `Use your <b>${SITE_NAME}</b> account to keep photos online, so a photo from your phone is waiting in the editor.`}</p>
      <form id="cloudForm">
        <div class="field"><label for="cloudUser">Username</label><input id="cloudUser" type="text" autocomplete="username" autocapitalize="none" required></div>
        <div class="field"><label for="cloudPass">Password</label><input id="cloudPass" type="password" autocomplete="current-password" required></div>
        <div class="error" id="cloudErr" role="alert"></div>
        <div class="row"><button class="primary" type="submit" id="cloudGo">Sign in</button></div>
      </form>
    </div>`;
  const q = id => container.querySelector('#' + id);
  q('cloudForm').onsubmit = async e => {
    e.preventDefault();
    q('cloudErr').textContent = '';
    q('cloudGo').disabled = true; q('cloudGo').textContent = 'Signing in…';
    try { onDone(await cloudSignIn(q('cloudUser').value, q('cloudPass').value)); }
    catch (err) { q('cloudErr').textContent = err.message; q('cloudGo').disabled = false; q('cloudGo').textContent = 'Sign in'; }
  };
}
