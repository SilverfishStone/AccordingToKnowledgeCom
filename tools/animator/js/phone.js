import { api, esc, timeAgo, authCard, preparePhoto, mediaUrl, backend } from './api.js';

const root = document.getElementById('root');

async function boot() {
  if (await backend() === 'local') {
    root.innerHTML = `<div class="topbar"><h1>Send a drawing</h1></div>
      <div class="card"><p>Sending photos from a phone to a computer needs the Animator’s own server, which this website doesn’t have.</p>
      <p class="muted">Instead, open the Animator on the device that has the photo and use <b>Upload from this device</b>, or in a project
      <b>File → Import photo as pencil sketch</b>. On a phone that can open the camera.</p>
      <p><a class="btn primary" href="index.html">Go to the Animator</a></p></div>`;
    return;
  }
  const me = await api('GET', 'api/me');
  if (!me.user) {
    root.innerHTML = `<div class="topbar"><h1>Animator</h1></div><div id="auth"></div>`;
    authCard(root.querySelector('#auth'), () => boot(), me.allowSignup);
    return;
  }
  root.innerHTML = `
    <div class="topbar">
      <h1>Send a drawing</h1>
      <span class="muted">${esc(me.user.username)}</span>
      <button id="logout">Sign out</button>
    </div>
    <button class="primary big" id="shoot">📷 Take a photo</button>
    <button class="big" id="pick">🖼 Choose from gallery</button>
    <input type="file" id="cam" accept="image/*" capture="environment" hidden>
    <input type="file" id="gal" accept="image/*" multiple hidden>
    <div class="status" id="status" role="status"></div>
    <div class="card">
      <h3>For the cleanest pencil layer</h3>
      <ul class="tips muted">
        <li>Lay the paper flat and fill the frame with it.</li>
        <li>Use even light and avoid your own shadow.</li>
        <li>Shoot straight down, not at an angle.</li>
      </ul>
    </div>
    <div class="card">
      <h3>Sent to your inbox</h3>
      <div class="grid" id="list"></div>
    </div>
    <p class="muted">On your computer: open a project → <b>File → Import photo as pencil sketch</b>.</p>`;

  const q = id => root.querySelector('#' + id);
  q('logout').onclick = async () => { await api('POST', 'api/logout'); location.reload(); };
  q('shoot').onclick = () => q('cam').click();
  q('pick').onclick = () => q('gal').click();
  const send = async input => {
    const files = [...input.files];
    input.value = '';
    let done = 0;
    for (const f of files) {
      q('status').textContent = `Uploading ${done + 1} of ${files.length}…`;
      try {
        const blob = await preparePhoto(f);
        await api('POST', 'api/inbox', blob, { 'X-Filename': encodeURIComponent(f.name || 'photo.jpg') });
        done++;
      } catch (err) { q('status').textContent = 'Upload failed: ' + err.message; return; }
    }
    if (files.length) q('status').textContent = `✓ Sent ${done} photo${done === 1 ? '' : 's'} to your inbox.`;
    list();
  };
  q('cam').onchange = () => send(q('cam'));
  q('gal').onchange = () => send(q('gal'));
  list();
}

async function list() {
  const box = root.querySelector('#list');
  const { items } = await api('GET', 'api/inbox');
  box.innerHTML = items.length ? '' : '<span class="muted">Nothing sent yet.</span>';
  for (const it of items.slice(0, 12)) {
    const d = document.createElement('div');
    d.className = 'tile';
    d.innerHTML = `<img class="thumb" alt="" loading="lazy"><div class="info"><div class="muted">${timeAgo(it.created)}</div></div>`;
    mediaUrl(`api/inbox/${it.id}`).then(u => { if (u) d.querySelector('img').src = u; });
    box.append(d);
  }
}

boot().catch(err => { root.textContent = 'Could not reach the server: ' + err.message; });
