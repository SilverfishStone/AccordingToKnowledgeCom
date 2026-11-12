import { api, esc, timeAgo, authCard, preparePhoto, mediaUrl, backend } from './api.js';

const root = document.getElementById('root');
let user = null;

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 2600);
}

async function boot() {
  const me = await api('GET', 'api/me');
  user = me.user;
  if (!user) {
    root.innerHTML = `<div class="topbar"><h1>Animator</h1></div><div id="auth"></div>`;
    authCard(root.querySelector('#auth'), () => boot(), me.allowSignup);
    return;
  }
  renderHome();
}

async function renderHome() {
  const local = await backend() === 'local';
  root.innerHTML = `
    <div class="topbar">
      <h1>Animator</h1>
      ${local ? '<span class="muted" title="Nothing is uploaded anywhere. Clearing this browser’s site data deletes them.">Projects are saved in this browser</span>'
        : `<span class="muted">Signed in as <b>${esc(user.username)}</b></span>
      <a class="btn" href="phone.html">Phone upload page</a>
      <button id="logout">Sign out</button>`}
    </div>

    <div class="card">
      <h2>New project</h2>
      <form id="newForm" class="row">
        <input type="text" id="npName" placeholder="Project name" value="Untitled" style="flex:1 1 180px" aria-label="Project name">
        <label>W <input type="number" id="npW" value="1920" min="16" max="4096" style="width:80px"></label>
        <label>H <input type="number" id="npH" value="1080" min="16" max="4096" style="width:80px"></label>
        <label>FPS <input type="number" id="npFps" value="24" min="1" max="60" style="width:60px"></label>
        <label>Frames <input type="number" id="npFrames" value="48" min="1" max="2000" style="width:70px"></label>
        <label>Background
          <select id="npBg"><option value="">Transparent</option><option value="#ffffff">White</option><option value="#000000">Black</option></select>
        </label>
        <button class="primary" type="submit">Create</button>
      </form>
    </div>

    <div class="card">
      <h2>Projects</h2>
      <div class="grid" id="projects"><span class="muted">Loading…</span></div>
    </div>

    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Photo inbox</h2>
        <div class="row">
          <button id="inboxRefresh">Refresh</button>
          <button id="inboxAdd">Upload from this device</button>
          <input type="file" id="inboxFile" accept="image/*" multiple hidden>
        </div>
      </div>
      <p class="muted">${local ? 'Photos of drawings you add here' : 'Photos of drawings you send from your phone'} land here. Open a project and use
        <b>File → Import photo as pencil sketch</b> to turn one into a clean pencil layer.</p>
      <p id="phoneHelp" class="muted"></p>
      <div class="grid" id="inbox"></div>
    </div>`;

  root.querySelector('#logout')?.addEventListener('click', async () => { await api('POST', 'api/logout'); location.reload(); });
  root.querySelector('#newForm').onsubmit = async e => {
    e.preventDefault();
    const v = id => root.querySelector('#' + id).value;
    try {
      const r = await api('POST', 'api/projects', { name: v('npName'), width: v('npW'), height: v('npH'), fps: v('npFps'), frames: v('npFrames'), bg: v('npBg') || null });
      location.href = 'editor.html?id=' + r.id;
    } catch (err) { toast(err.message); }
  };
  root.querySelector('#inboxRefresh').onclick = loadInbox;
  const file = root.querySelector('#inboxFile');
  root.querySelector('#inboxAdd').onclick = () => file.click();
  file.onchange = async () => {
    for (const f of file.files) {
      try {
        const blob = await preparePhoto(f);
        await api('POST', 'api/inbox', blob, { 'X-Filename': encodeURIComponent(f.name) });
      } catch (err) { toast(err.message); }
    }
    file.value = '';
    loadInbox();
  };

  loadProjects(); loadInbox();
  if (local) root.querySelector('#phoneHelp').textContent = 'On a phone, “Upload from this device” can open the camera.';
  else api('GET', 'api/info').then(info => {
    const help = root.querySelector('#phoneHelp');
    if (!help) return;
    help.innerHTML = info.urls.length
      ? `On your phone (same Wi-Fi as this computer) open: ${info.urls.map(u => `<span class="url">${esc(u)}/phone</span>`).join(' or ')}`
      : 'Connect this computer to Wi-Fi to upload from your phone.';
  }).catch(() => {});
}

async function loadProjects() {
  const box = root.querySelector('#projects');
  const { projects } = await api('GET', 'api/projects');
  if (!projects.length) { box.innerHTML = '<span class="muted">No projects yet. Create one above.</span>'; return; }
  box.innerHTML = '';
  for (const p of projects) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = `
      <img class="thumb" alt="">
      <div class="info">
        <div class="name" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="muted">Edited ${timeAgo(p.updated)}</div>
        <div class="actions">
          <a class="btn primary" href="editor.html?id=${p.id}">Open</a>
          <button data-a="rename">Rename</button>
          <button data-a="delete" class="danger">Delete</button>
        </div>
      </div>`;
    const img = tile.querySelector('img');
    img.onerror = () => { img.removeAttribute('src'); img.onerror = null; };
    mediaUrl(`api/projects/${p.id}/thumb?t=${p.updated}`).then(u => { if (u) img.src = u; });
    img.onclick = () => { location.href = 'editor.html?id=' + p.id; };
    tile.querySelector('[data-a=rename]').onclick = async () => {
      const name = prompt('Project name', p.name);
      if (!name) return;
      const full = await api('GET', 'api/projects/' + p.id);
      full.meta.name = name;
      await api('PUT', 'api/projects/' + p.id, full.meta);
      loadProjects();
    };
    tile.querySelector('[data-a=delete]').onclick = async () => {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      await api('DELETE', 'api/projects/' + p.id);
      loadProjects();
    };
    box.append(tile);
  }
}

async function loadInbox() {
  const box = root.querySelector('#inbox');
  const { items } = await api('GET', 'api/inbox');
  box.innerHTML = items.length ? '' : '<span class="muted">Nothing here yet.</span>';
  for (const it of items) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = `
      <img class="thumb" alt="" loading="lazy">
      <div class="info">
        <div class="name" title="${esc(it.name)}">${esc(it.name)}</div>
        <div class="muted">${timeAgo(it.created)} · ${(it.size / 1048576).toFixed(1)} MB</div>
        <div class="actions"><button class="danger">Delete</button></div>
      </div>`;
    mediaUrl(`api/inbox/${it.id}`).then(u => { if (u) tile.querySelector('img').src = u; });
    tile.querySelector('button').onclick = async () => {
      if (!confirm('Delete this photo from the inbox?')) return;
      await api('DELETE', 'api/inbox/' + it.id);
      loadInbox();
    };
    box.append(tile);
  }
}

boot().catch(err => { root.textContent = 'Could not reach the server: ' + err.message; });
