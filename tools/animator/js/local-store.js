// Browser-only backend. When the Animator is hosted as plain files (e.g. on a static website) there is no
// server, so the same API routes are answered here and everything is kept in this browser (IndexedDB).
// Mirrors server.js: projects (metadata + one PNG per layer + a thumbnail) and the photo inbox.

const DB_NAME = 'animator', DB_VERSION = 1;
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');            // key: "<pid>/l_<lid>" or "<pid>/thumb"
      if (!d.objectStoreNames.contains('inbox')) d.createObjectStore('inbox', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('This browser blocked saving (private window?)'));
  });
  // ask the browser not to clear our data when space runs low
  try { navigator.storage?.persist?.(); } catch { /* not supported */ }
  return dbp;
}
async function tx(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let out;
    Promise.resolve(fn(...[].concat(stores).map(s => t.objectStore(s)))).then(v => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Saving was stopped (storage full?)'));
  });
}
const req = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

class LocalError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
const ID_RE = /^[a-z0-9]{6,32}$/;
const int = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || d)));
function layerIds(list, out = new Set()) {
  for (const l of list || []) { if (ID_RE.test(l?.id || '')) out.add(l.id); if (l?.kind === 'group') layerIds(l.children, out); }
  return out;
}
async function projectOrThrow(store, pid) {
  const p = ID_RE.test(pid) ? await req(store.get(pid)) : null;
  if (!p) throw new LocalError(404, 'Project not found');
  return p;
}

const ME = { user: { id: 0, username: 'this browser' }, allowSignup: false, local: true };

/* Answer an API call. path is like "api/projects/abc". Returns JSON-able data. */
export async function localApi(method, path, body, headers = {}) {
  const parts = path.replace(/^\/?api\//, '').split('?')[0].split('/').filter(Boolean);
  const [a, b, c, dd] = parts;
  const now = Date.now();

  if (a === 'me' || a === 'login' || a === 'register') return ME;
  if (a === 'logout') return { ok: true };
  if (a === 'info') return { port: 0, urls: [], local: true };

  if (a === 'projects') {
    if (!b) {
      if (method === 'GET') {
        const all = await tx('projects', 'readonly', s => req(s.getAll()));
        return { projects: all.map(({ id, name, created, updated }) => ({ id, name, created, updated })).sort((x, y) => y.updated - x.updated) };
      }
      if (method === 'POST') {
        const v = body || {};
        const meta = {
          v: 1, name: String(v.name || 'Untitled').slice(0, 80),
          width: int(v.width, 1920, 16, 4096), height: int(v.height, 1080, 16, 4096),
          fps: int(v.fps, 24, 1, 60), frames: int(v.frames, 48, 1, 2000),
          bg: typeof v.bg === 'string' && /^#[0-9a-f]{6}$/i.test(v.bg) ? v.bg : null, layers: [],
        };
        const id = newId();
        await tx('projects', 'readwrite', s => req(s.put({ id, name: meta.name, meta, created: now, updated: now })));
        return { id };
      }
    }
    if (b && !c) {
      if (method === 'GET') {
        const p = await tx('projects', 'readonly', s => projectOrThrow(s, b));
        return { id: p.id, name: p.name, updated: p.updated, meta: p.meta };
      }
      if (method === 'PUT') {
        const meta = body;
        if (!meta || !Array.isArray(meta.layers)) throw new LocalError(400, 'Invalid project data');
        meta.name = String(meta.name || 'Untitled').slice(0, 80);
        const keep = layerIds(meta.layers);
        await tx(['projects', 'blobs'], 'readwrite', async (ps, bs) => {
          const p = await projectOrThrow(ps, b);
          await req(ps.put({ ...p, name: meta.name, meta, updated: now }));
          // drop pictures of layers that no longer exist
          const keys = await req(bs.getAllKeys(IDBKeyRange.bound(b + '/', b + '/￿')));
          for (const k of keys) { const m = /\/l_([a-z0-9]+)$/.exec(k); if (m && !keep.has(m[1])) bs.delete(k); }
        });
        return { ok: true, updated: now };
      }
      if (method === 'DELETE') {
        await tx(['projects', 'blobs'], 'readwrite', async (ps, bs) => {
          await projectOrThrow(ps, b);
          ps.delete(b);
          bs.delete(IDBKeyRange.bound(b + '/', b + '/￿'));
        });
        return { ok: true };
      }
    }
    if (b && (c === 'layers' && dd || c === 'thumb')) {
      const key = c === 'thumb' ? `${b}/thumb` : `${b}/l_${dd}`;
      if (c === 'layers' && !ID_RE.test(dd)) throw new LocalError(400, 'Invalid layer id');
      if (method === 'PUT') {
        if (!(body instanceof Blob)) throw new LocalError(400, 'Expected an image');
        await tx(['projects', 'blobs'], 'readwrite', async (ps, bs) => { await projectOrThrow(ps, b); await req(bs.put(body, key)); });
        return { ok: true };
      }
      if (method === 'GET') {
        const blob = await tx('blobs', 'readonly', s => req(s.get(key)));
        if (!blob) throw new LocalError(404, 'Not found');
        return blob;
      }
    }
  }

  if (a === 'inbox') {
    if (!b && method === 'GET') {
      const all = await tx('inbox', 'readonly', s => req(s.getAll()));
      return { items: all.map(({ id, name, size, created }) => ({ id, name, size, created })).sort((x, y) => y.created - x.created) };
    }
    if (!b && method === 'POST') {
      if (!(body instanceof Blob) || !/^image\//.test(body.type || 'image/')) throw new LocalError(400, 'Only images can be added');
      let name = 'photo';
      try { name = decodeURIComponent(headers['X-Filename'] || 'photo').slice(0, 100) || 'photo'; } catch { /* keep default */ }
      const id = newId();
      await tx('inbox', 'readwrite', s => req(s.put({ id, name, size: body.size, created: now, blob: body })));
      return { id };
    }
    if (b && method === 'GET') {
      const it = await tx('inbox', 'readonly', s => req(s.get(b)));
      if (!it) throw new LocalError(404, 'Not found');
      return it.blob;
    }
    if (b && method === 'DELETE') { await tx('inbox', 'readwrite', s => req(s.delete(b))); return { ok: true }; }
  }
  throw new LocalError(404, 'Not found');
}
