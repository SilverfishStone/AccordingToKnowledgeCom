/* Accounts, comments, messages, sharing and the admin page for the articles site.
   site.js owns the addresses and calls in here:
     community.show(view)          /login /account /messages /admin /privacy
     community.article(slug, doc)  the share buttons and comments under an article
   The server side is worker/index.js; everything goes through /api/. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const enc = new TextEncoder();
  const when = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const paragraphs = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  const go = (url) => community.go(url);
  const here = () => location.pathname + location.search + location.hash;

  /* ───────── talking to the server ───────── */
  async function api(path, body) {
    const opts = { method: body ? "POST" : "GET", credentials: "same-origin", headers: {} };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch("/api/" + path, opts); }
    catch { throw Object.assign(new Error("Couldn't reach the site. Check your connection and try again."), { status: 0 }); }
    let data = {};
    try { data = await res.json(); } catch { }
    if (!res.ok) throw Object.assign(new Error(data.error || `Something went wrong (${res.status}).`), { status: res.status, data });
    return data;
  }

  // The password is stretched here, on the visitor's device, before it's sent: the slow part
  // of protecting it runs in the browser, and the server hashes the result again with its own
  // salt. Changing these two values would lock everyone out, so they stay as they are.
  const ROUNDS = 600000, SALT = "atk-v1:";
  async function stretch(username, password) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SALT + username.trim().toLowerCase()), iterations: ROUNDS }, key, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // a button that says what it's doing and can't be pressed twice
  async function busy(button, label, work) {
    const was = button.textContent;
    button.disabled = true; button.textContent = label;
    try { return await work(); } finally { button.disabled = false; button.textContent = was; }
  }
  function say(el, message, kind = "err") {
    if (!el) return;
    el.textContent = message || "";
    el.className = "form-note " + (message ? kind : "");
  }

  /* ───────── who's signed in ───────── */
  let state = { user: null, unread: 0 };
  let meLoad = null;
  function loadMe(force = false) {
    if (force || !meLoad) meLoad = api("me").then((d) => { state = { unread: 0, ...d }; renderNav(); return state; })
      .catch(() => { state = { user: null, unread: 0, offline: true }; renderNav(); return state; });
    return meLoad;
  }
  function setUser(user) { state = { ...state, user }; meLoad = Promise.resolve(state); renderNav(); loadMe(true); }

  let avatarList = [];
  const avatarsLoaded = fetch("assets/avatars/index.json").then((r) => r.json()).then((l) => { avatarList = l; return l; }).catch(() => []);
  const avatarSrc = (u) => {
    if (!u) return "assets/avatars/default.svg";
    if (u.picture) return u.picture;
    const a = avatarList.find((x) => x.id === u.avatar);
    return "assets/avatars/" + (a ? a.file : "default.svg");
  };
  const avatarImg = (u, size = 40) => `<img class="avatar" src="${esc(avatarSrc(u))}" alt="" width="${size}" height="${size}" loading="lazy" />`;
  const nameTag = (u) => `<span class="who">${esc(u.username)}</span>${u.role === "admin" ? ' <span class="author-tag">Author</span>' : ""}`;

  function renderNav() {
    const nav = $("#account-nav");
    if (!nav) return;
    const u = state.user;
    if (!u) {
      nav.innerHTML = state.offline ? "" : `<a class="nav-link" href="login?next=${encodeURIComponent(here())}" data-link>Sign in</a>`;
      return;
    }
    const pending = state.pending ? (state.pending.comments || 0) + (state.pending.pictures || 0) : 0;
    nav.innerHTML = `
      ${u.role === "admin" ? `<a class="nav-link" href="admin" data-link>Admin${pending || state.unread ? ` <span class="dot">${pending + state.unread}</span>` : ""}</a>` : ""}
      ${u.role !== "admin" ? `<a class="nav-link" href="messages" data-link aria-label="Messages${state.unread ? `, ${state.unread} new` : ""}">Messages${state.unread ? ` <span class="dot">${state.unread}</span>` : ""}</a>` : ""}
      <a class="nav-me" href="account" data-link title="Your account">${avatarImg(u, 30)}<span>${esc(u.username)}</span></a>`;
  }
  avatarsLoaded.then(renderNav);

  /* ───────── /login: sign in, create an account, or use a recovery code ───────── */
  const nextUrl = () => {
    const n = new URLSearchParams(location.search).get("next") || "";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/";
  };
  const passwordRules = (p) => (p.length < 8 ? "Use at least 8 characters for your password." : p.length > 200 ? "That password is too long." : "");

  async function showLogin() {
    const box = $("#login-box");
    const params = new URLSearchParams(location.search);
    const tab = ["create", "forgot"].includes(params.get("tab")) ? params.get("tab") : "signin";
    await loadMe();
    if (state.user) { go(nextUrl()); return; }
    await avatarsLoaded;
    box.innerHTML = `
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-tab="signin">Sign in</button>
        <button type="button" role="tab" data-tab="create">Create account</button>
        <button type="button" role="tab" data-tab="forgot">Forgot password</button>
      </div>

      <form class="form" data-panel="signin" autocomplete="on">
        <label>Username <input name="username" autocomplete="username" required maxlength="24" /></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
        <p class="form-note"></p>
        <button class="btn" type="submit">Sign in</button>
      </form>

      <form class="form" data-panel="create" autocomplete="on">
        <p class="lead">No email or other details needed: just a username and a password. You'll get a recovery code to keep in case you forget the password.</p>
        <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,23}" />
          <small>3 to 24 letters, numbers, dots, dashes or underscores. It can't be changed later.</small></label>
        <label>Password <input name="password" type="password" autocomplete="new-password" required minlength="8" /></label>
        <label>Password again <input name="password2" type="password" autocomplete="new-password" required minlength="8" /></label>
        <fieldset class="avatar-pick"><legend>Pick a picture <small>(you can ask to use your own later)</small></legend>
          <div class="avatar-grid">${avatarList.map((a, i) => `
            <label class="avatar-choice"><input type="radio" name="avatar" value="${esc(a.id)}" ${i === 0 ? "checked" : ""} />
              <img src="assets/avatars/${esc(a.file)}" alt="${esc(a.name)}" width="52" height="52" /></label>`).join("")}</div>
        </fieldset>
        <label class="admin-code" hidden>Admin code <input name="adminCode" autocomplete="off" /></label>
        <div class="turnstile" id="turnstile"></div>
        <p class="small">You must be 13 or older. Read what's kept on the <a class="text-link" href="privacy" data-link>privacy page</a>.</p>
        <p class="form-note"></p>
        <button class="btn" type="submit">Create account</button>
      </form>

      <form class="form" data-panel="forgot" autocomplete="on">
        <p class="lead">Enter the recovery code you saved when you made your account. Lost it too? Make a new account and send me a message from it, and I can help you get back in.</p>
        <label>Username <input name="username" autocomplete="username" required maxlength="24" /></label>
        <label>Recovery code <input name="code" autocomplete="off" required placeholder="XXXX-XXXX-XXXX-XXXX" /></label>
        <label>New password <input name="password" type="password" autocomplete="new-password" required minlength="8" /></label>
        <label>New password again <input name="password2" type="password" autocomplete="new-password" required minlength="8" /></label>
        <p class="form-note"></p>
        <button class="btn" type="submit">Set new password</button>
      </form>`;

    const pick = (name) => {
      box.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
      box.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== name; });
      if (name === "create") mountTurnstile();
    };
    box.querySelector(".tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-tab]"); if (t) pick(t.dataset.tab); });
    pick(tab);

    const [signin, create, forgot] = ["signin", "create", "forgot"].map((n) => box.querySelector(`[data-panel="${n}"]`));
    signin.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(signin), note = signin.querySelector(".form-note");
      busy(signin.querySelector("button[type=submit]"), "Signing in…", async () => {
        try {
          const username = String(f.get("username")).trim();
          const d = await api("login", { username, password: await stretch(username, String(f.get("password"))) });
          setUser(d.user); go(nextUrl());
        } catch (err) { say(note, err.message); }
      });
    });
    create.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(create), note = create.querySelector(".form-note");
      const username = String(f.get("username")).trim(), password = String(f.get("password"));
      const bad = passwordRules(password) || (password !== f.get("password2") ? "The two passwords don't match." : "");
      if (bad) { say(note, bad); return; }
      busy(create.querySelector("button[type=submit]"), "Creating…", async () => {
        try {
          const d = await api("signup", {
            username, password: await stretch(username, password), avatar: f.get("avatar"),
            adminCode: f.get("adminCode") || undefined, turnstile: turnstileToken(),
          });
          setUser(d.user);
          showRecoveryCode(box, d.recoveryCode, "Your account is ready");
        } catch (err) {
          if (err.data && err.data.needAdminCode) create.querySelector(".admin-code").hidden = false;
          resetTurnstile();
          say(note, err.message);
        }
      });
    });
    forgot.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(forgot), note = forgot.querySelector(".form-note");
      const username = String(f.get("username")).trim(), password = String(f.get("password"));
      const bad = passwordRules(password) || (password !== f.get("password2") ? "The two passwords don't match." : "");
      if (bad) { say(note, bad); return; }
      busy(forgot.querySelector("button[type=submit]"), "Checking…", async () => {
        try {
          const d = await api("recover", { username, code: f.get("code"), password: await stretch(username, password) });
          setUser(d.user);
          showRecoveryCode(box, d.recoveryCode, "Your password is changed", "Your old recovery code is used up. Here's your new one:");
        } catch (err) { say(note, err.message); }
      });
    });
  }

  // shown once, after sign-up, a reset, or asking for a new code
  function showRecoveryCode(box, code, title, intro = "This is your recovery code:") {
    box.innerHTML = `
      <div class="recovery">
        <h2>${esc(title)}</h2>
        <p>${esc(intro)}</p>
        <p class="code" id="rc">${esc(code)}</p>
        <p>If you ever forget your password, your username and this code let you set a new one. <b>It's shown only this once</b>, so save it somewhere safe, like a password manager or a note on paper.</p>
        <div class="row">
          <button class="btn ghost" type="button" data-copy>Copy</button>
          <button class="btn ghost" type="button" data-save>Save as a file</button>
        </div>
        <label class="check"><input type="checkbox" id="rc-ok" /> I've saved my recovery code</label>
        <button class="btn" type="button" id="rc-go" disabled>Continue</button>
      </div>`;
    $("[data-copy]", box).addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(code); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select it and copy"; }
    });
    $("[data-save]", box).addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([`According To Knowledge recovery code for ${state.user ? state.user.username : "your account"}\n\n${code}\n`], { type: "text/plain" }));
      a.download = "accordingtoknowledge-recovery-code.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("#rc-ok", box).addEventListener("change", (e) => { $("#rc-go", box).disabled = !e.target.checked; });
    $("#rc-go", box).addEventListener("click", () => { box.hasAttribute("data-inline") ? box.dispatchEvent(new Event("done")) : go(nextUrl() === "/" ? "/account" : nextUrl()); });
  }

  // Cloudflare's "are you human" check on sign-up, when a site key is set in config.js
  let tsWidget = null;
  function mountTurnstile() {
    const key = ATK.turnstileSiteKey, el = $("#turnstile");
    if (!key || !el || tsWidget !== null) return;
    const draw = () => { tsWidget = window.turnstile.render(el, { sitekey: key, theme: "light" }); };
    if (window.turnstile) { draw(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.onload = draw;
    document.head.appendChild(s);
  }
  const turnstileToken = () => (window.turnstile && tsWidget !== null ? window.turnstile.getResponse(tsWidget) : undefined);
  const resetTurnstile = () => { if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); };

  /* ───────── /account ───────── */
  async function showAccount() {
    const box = $("#account-box");
    await loadMe(true);
    const u = state.user;
    if (!u) { go("/login?next=/account"); return; }
    await avatarsLoaded;
    box.innerHTML = `
      <header class="me-head">${avatarImg(u, 72)}<div><h1>${esc(u.username)}</h1>
        ${u.role === "admin" ? `<a class="text-link" href="admin" data-link>Open the admin page</a>` : `<a class="text-link" href="messages" data-link>Messages with Silver${state.unread ? ` (${state.unread} new)` : ""}</a>`}</div></header>

      <section class="card-sec">
        <h2>Picture</h2>
        <div class="avatar-grid" id="pick-avatar">${avatarList.map((a) => `
          <button type="button" class="avatar-choice${u.avatar === a.id ? " on" : ""}" data-avatar="${esc(a.id)}" aria-pressed="${u.avatar === a.id}" title="${esc(a.name)}">
            <img src="assets/avatars/${esc(a.file)}" alt="${esc(a.name)}" width="52" height="52" /></button>`).join("")}
          ${state.ownPicture ? `<button type="button" class="avatar-choice${u.avatar === "custom" ? " on" : ""}" data-avatar="custom" aria-pressed="${u.avatar === "custom"}" title="Your own picture"><img src="${esc(state.ownPicture)}" alt="Your own picture" width="52" height="52" /></button>` : ""}
        </div>
        <details class="own-pic"${state.pictureWaiting ? " open" : ""}>
          <summary>Use your own picture</summary>
          <p class="small">Send a picture and I'll look at it before it shows up. Until then you keep the one picked above.</p>
          ${state.pictureWaiting ? `<p class="form-note ok">Your picture is waiting for approval. Sending another replaces it.</p>` : ""}
          <div class="row">
            <label class="btn ghost file">Choose a picture <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="pic-file" hidden /></label>
            <canvas id="pic-preview" width="160" height="160" hidden></canvas>
            <button class="btn" type="button" id="pic-send" hidden>Send for approval</button>
          </div>
          <p class="form-note" id="pic-note"></p>
        </details>
        <p class="form-note" id="avatar-note"></p>
      </section>

      <section class="card-sec">
        <h2>Password</h2>
        <form class="form" id="pw-form">
          <input type="text" name="username" value="${esc(u.username)}" autocomplete="username" hidden />
          <label>Current password <input name="current" type="password" autocomplete="current-password" required /></label>
          <label>New password <input name="password" type="password" autocomplete="new-password" required minlength="8" /></label>
          <label>New password again <input name="password2" type="password" autocomplete="new-password" required minlength="8" /></label>
          <p class="form-note"></p>
          <button class="btn" type="submit">Change password</button>
        </form>
      </section>

      <section class="card-sec" id="rc-sec">
        <h2>Recovery code</h2>
        <p class="small">Lost your recovery code? Make a new one; the old one stops working.</p>
        <form class="form" id="rc-form">
          <label>Current password <input name="current" type="password" autocomplete="current-password" required /></label>
          <p class="form-note"></p>
          <button class="btn ghost" type="submit">Make a new recovery code</button>
        </form>
      </section>

      <section class="card-sec">
        <h2>Signing out</h2>
        <div class="row">
          <button class="btn ghost" type="button" id="out">Sign out</button>
          <button class="btn ghost" type="button" id="out-all">Sign out on every device</button>
        </div>
      </section>

      ${u.role === "admin" ? "" : `
      <section class="card-sec danger">
        <h2>Delete account</h2>
        <p class="small">This removes your account, your comments, your messages and your picture for good.</p>
        <form class="form" id="del-form">
          <label>Current password <input name="current" type="password" autocomplete="current-password" required /></label>
          <label class="check"><input type="checkbox" name="sure" required /> Yes, delete everything</label>
          <p class="form-note"></p>
          <button class="btn danger" type="submit">Delete my account</button>
        </form>
      </section>`}`;

    $("#pick-avatar", box).addEventListener("click", async (e) => {
      const b = e.target.closest("[data-avatar]");
      if (!b) return;
      try {
        const d = await api("account/avatar", { avatar: b.dataset.avatar });
        setUser(d.user);
        box.querySelectorAll("[data-avatar]").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
        $(".me-head .avatar", box).src = avatarSrc(d.user);
        say($("#avatar-note", box), "");
      } catch (err) { say($("#avatar-note", box), err.message); }
    });

    // your own picture: cropped to a small square here, then sent for approval
    let picData = null;
    $("#pic-file", box).addEventListener("change", async (e) => {
      const file = e.target.files[0], note = $("#pic-note", box);
      if (!file) return;
      try {
        const img = await createImageBitmap(file);
        const cv = $("#pic-preview", box), g = cv.getContext("2d"), s = Math.min(img.width, img.height);
        g.clearRect(0, 0, 160, 160);
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
        picData = cv.toDataURL("image/webp", 0.85);
        if (!picData.startsWith("data:image/webp")) picData = cv.toDataURL("image/jpeg", 0.85);
        if (picData.length > 110000) picData = cv.toDataURL("image/jpeg", 0.7);
        cv.hidden = false; $("#pic-send", box).hidden = false;
        say(note, "");
      } catch { say(note, "That file couldn't be opened as a picture."); }
    });
    $("#pic-send", box).addEventListener("click", (e) => busy(e.target, "Sending…", async () => {
      try {
        await api("account/picture", { image: picData });
        state.pictureWaiting = true;
        say($("#pic-note", box), "Sent. It'll show up once I've approved it.", "ok");
        e.target.hidden = true;
      } catch (err) { say($("#pic-note", box), err.message); }
    }));

    const pwForm = $("#pw-form", box);
    pwForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(pwForm), note = pwForm.querySelector(".form-note"), p = String(f.get("password"));
      const bad = passwordRules(p) || (p !== f.get("password2") ? "The two new passwords don't match." : "");
      if (bad) { say(note, bad); return; }
      busy(pwForm.querySelector("button"), "Changing…", async () => {
        try {
          await api("account/password", { current: await stretch(u.username, String(f.get("current"))), password: await stretch(u.username, p) });
          pwForm.reset();
          say(note, "Password changed. Other devices will need to sign in again.", "ok");
        } catch (err) { say(note, err.message); }
      });
    });

    const rcForm = $("#rc-form", box);
    rcForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = rcForm.querySelector(".form-note");
      busy(rcForm.querySelector("button"), "Making…", async () => {
        try {
          const d = await api("account/recovery", { current: await stretch(u.username, String(new FormData(rcForm).get("current"))) });
          const sec = $("#rc-sec", box);
          sec.setAttribute("data-inline", "");
          showRecoveryCode(sec, d.recoveryCode, "Your new recovery code");
          sec.addEventListener("done", () => showAccount(), { once: true });
        } catch (err) { say(note, err.message); }
      });
    });

    $("#out", box).addEventListener("click", async () => { await api("logout", {}).catch(() => {}); setUser(null); go("/"); });
    $("#out-all", box).addEventListener("click", async () => { await api("account/logout-all", {}).catch(() => {}); setUser(null); go("/"); });

    const del = $("#del-form", box);
    if (del) del.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = del.querySelector(".form-note");
      busy(del.querySelector("button"), "Deleting…", async () => {
        try {
          await api("account/delete", { current: await stretch(u.username, String(new FormData(del).get("current"))) });
          setUser(null); go("/");
        } catch (err) { say(note, err.message); }
      });
    });
  }

  /* ───────── /messages: one conversation with Silver ───────── */
  async function showMessages() {
    const box = $("#messages-box");
    await loadMe(true);
    if (!state.user) {
      box.innerHTML = `<p class="center">To send me a message, <a class="text-link" href="login?next=/messages" data-link>sign in</a> or <a class="text-link" href="login?tab=create&next=/messages" data-link>make an account</a>. It only takes a username and a password, and my replies show up here.</p>`;
      return;
    }
    if (state.user.role === "admin") { go("/admin#messages"); return; }
    box.innerHTML = `<p class="note">Loading…</p>`;
    let d;
    try { d = await api("messages"); } catch (err) { box.innerHTML = `<p class="note">${esc(err.message)}</p>`; return; }
    loadMe(true);   // they're read now
    box.innerHTML = `
      <p class="lead center">Questions, corrections or ideas? Write to me here. You'll get an answer on this page, so check back.</p>
      <div class="thread" id="thread">${d.messages.length ? d.messages.map((m) => bubble(m)).join("") : `<p class="note">No messages yet.</p>`}</div>
      <form class="form compose" id="compose">
        <label class="visually-hidden" for="msg">Your message</label>
        <textarea id="msg" name="body" rows="5" maxlength="4000" required placeholder="Write your message…"></textarea>
        <p class="form-note"></p>
        <button class="btn" type="submit">Send</button>
      </form>`;
    const thread = $("#thread", box);
    thread.scrollTop = thread.scrollHeight;
    const form = $("#compose", box);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = form.querySelector(".form-note"), body = form.body.value.trim();
      if (!body) return;
      busy(form.querySelector("button"), "Sending…", async () => {
        try {
          const r = await api("messages", { body });
          if (!thread.querySelector(".bubble")) thread.innerHTML = "";
          thread.insertAdjacentHTML("beforeend", bubble(r.message));
          thread.scrollTop = thread.scrollHeight;
          form.reset();
          say(note, "Sent. I'll reply here.", "ok");
        } catch (err) { say(note, err.message); }
      });
    });
  }
  // `mine` is whose side a message sits on: the visitor's own, or Silver's when he's reading
  const bubble = (m, adminView = false, theirName = "Them") => {
    const mine = adminView ? m.fromAdmin : !m.fromAdmin;
    return `<div class="bubble ${mine ? "mine" : "theirs"}"><div class="bubble-body">${paragraphs(m.body)}</div>
      <span class="meta">${esc(m.fromAdmin ? "Silver" : adminView ? theirName : "You")} · ${esc(when(m.created))}</span></div>`;
  };

  /* ───────── /admin ───────── */
  async function showAdmin() {
    const box = $("#admin-box");
    await loadMe(true);
    if (!state.user || state.user.role !== "admin") {
      box.innerHTML = `<p class="center">This page is only for the site's author. <a class="text-link" href="login?next=/admin" data-link>Sign in</a></p>`;
      return;
    }
    box.innerHTML = `<p class="note">Loading…</p>`;
    let d, words;
    try { [d, words] = await Promise.all([api("admin/overview"), api("admin/words")]); }
    catch (err) { box.innerHTML = `<p class="note">${esc(err.message)}</p>`; return; }
    box.innerHTML = `
      <section class="card-sec" id="held">
        <h2>Held comments <span class="count">${d.comments.length}</span></h2>
        ${d.comments.length ? d.comments.map((c) => `
          <article class="held-item" data-comment="${c.id}">
            <header>${avatarImg(c.user, 32)} ${nameTag(c.user)} on <a class="text-link" href="article/${esc(c.article.slug)}#comments" data-link>${esc(c.article.title)}</a> <span class="meta">${esc(when(c.created))}</span></header>
            <div class="comment-body">${paragraphs(c.body)}</div>
            <div class="row"><button class="btn" type="button" data-act="approve">Approve</button><button class="btn ghost" type="button" data-act="reject">Delete</button></div>
          </article>`).join("") : `<p class="small">Nothing waiting. Comments only wait here when they use a word from your list below.</p>`}
      </section>

      <section class="card-sec" id="pictures">
        <h2>Picture requests <span class="count">${d.pictures.length}</span></h2>
        ${d.pictures.length ? `<div class="pic-requests">${d.pictures.map((p) => `
          <figure data-picture="${p.user.id}"><img src="${esc(p.url)}" alt="" width="96" height="96" />
            <figcaption>${esc(p.user.username)}</figcaption>
            <div class="row"><button class="btn" type="button" data-act="approve">Approve</button><button class="btn ghost" type="button" data-act="reject">Reject</button></div>
          </figure>`).join("")}</div>` : `<p class="small">No pictures waiting.</p>`}
      </section>

      <section class="card-sec" id="messages">
        <h2>Messages</h2>
        ${d.threads.length ? `<ul class="threads">${d.threads.map((t) => `
          <li><button type="button" class="thread-link" data-thread="${t.user.id}">${avatarImg(t.user, 32)}
            <span class="t-main"><b>${esc(t.user.username)}</b>${t.unread ? ` <span class="dot">${t.unread}</span>` : ""}<span class="t-prev">${esc(t.preview)}</span></span>
            <span class="meta">${esc(when(t.last))}</span></button></li>`).join("")}</ul>` : `<p class="small">No messages yet.</p>`}
        <div id="open-thread"></div>
      </section>

      <section class="card-sec" id="words">
        <h2>Words that hold a comment for review</h2>
        <p class="small">One word or phrase per line. Comments using any of them wait above until you approve them; everything else goes up straight away. Matching ignores capitals and accents and only matches whole words (so "ass" won't catch "class"). End a word with * to catch longer forms too ("idiot*" catches "idiots" and "idiotic"). Usernames containing these are refused as well.</p>
        <form class="form" id="words-form">
          <textarea name="words" rows="8" spellcheck="false">${esc(words.words.join("\n"))}</textarea>
          <p class="form-note"></p>
          <button class="btn" type="submit">Save the list</button>
        </form>
      </section>

      <section class="card-sec" id="accounts">
        <h2>Accounts</h2>
        <form class="row" id="user-search"><input name="q" placeholder="Search usernames" aria-label="Search usernames" /><button class="btn ghost" type="submit">Search</button></form>
        <div id="user-list"></div>
      </section>`;

    box.addEventListener("click", adminClick);
    $("#words-form", box).addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target, note = f.querySelector(".form-note");
      busy(f.querySelector("button"), "Saving…", async () => {
        try {
          const r = await api("admin/words", { words: f.words.value.split("\n") });
          f.words.value = r.words.join("\n");
          say(note, `Saved ${r.words.length} word${r.words.length === 1 ? "" : "s"}.`, "ok");
        } catch (err) { say(note, err.message); }
      });
    });
    $("#user-search", box).addEventListener("submit", (e) => { e.preventDefault(); listUsers(e.target.q.value); });
    listUsers("");
    if (location.hash) setTimeout(() => $(location.hash)?.scrollIntoView({ block: "start" }), 50);
  }

  async function adminClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    const box = $("#admin-box");
    const comment = b.closest("[data-comment]"), pic = b.closest("[data-picture]"), user = b.closest("[data-user]");
    try {
      if (comment && b.dataset.act) {
        await api(`admin/comments/${comment.dataset.comment}`, { action: b.dataset.act });
        comment.remove(); loadMe(true);
      } else if (pic && b.dataset.act) {
        await api(`admin/pictures/${pic.dataset.picture}`, { action: b.dataset.act });
        pic.remove(); loadMe(true);
      } else if (b.dataset.thread) {
        openThread(Number(b.dataset.thread));
        b.querySelector(".dot")?.remove();
      } else if (user && b.dataset.act) {
        const act = b.dataset.act, name = user.dataset.name;
        const ask = { delete: `Delete ${name}'s account, comments and messages for good?`, ban: `Suspend ${name}? They'll be signed out and can't sign in, and their held comments are removed.`, picture: `Take down ${name}'s own picture?`, recovery: `Make a new recovery code for ${name}? Their old one stops working. Give them the new one in a message.` }[act];
        if (ask && !confirm(ask)) return;
        const r = await api(`admin/users/${user.dataset.user}`, { action: act });
        if (r.recoveryCode) {
          user.querySelector(".user-out").innerHTML = `New recovery code for ${esc(name)}: <b class="code-inline">${esc(r.recoveryCode)}</b> (copy it into a message to them)`;
          return;
        }
        listUsers($("#user-search", box).q.value);
      }
    } catch (err) { alert(err.message); }
  }

  async function openThread(id) {
    const host = $("#open-thread");
    host.innerHTML = `<p class="note">Loading…</p>`;
    try {
      const d = await api(`admin/messages/${id}`);
      host.innerHTML = `
        <div class="thread-head">${avatarImg(d.user, 32)} Conversation with <b>${esc(d.user.username)}</b></div>
        <div class="thread">${d.messages.map((m) => bubble(m, true, d.user.username)).join("")}</div>
        <form class="form compose" id="reply">
          <textarea name="body" rows="4" maxlength="4000" required placeholder="Reply to ${esc(d.user.username)}…"></textarea>
          <p class="form-note"></p>
          <button class="btn" type="submit">Send reply</button>
        </form>`;
      const thread = $(".thread", host);
      thread.scrollTop = thread.scrollHeight;
      host.scrollIntoView({ block: "nearest" });
      $("#reply", host).addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target, note = f.querySelector(".form-note");
        busy(f.querySelector("button"), "Sending…", async () => {
          try {
            const r = await api(`admin/messages/${id}`, { body: f.body.value });
            thread.insertAdjacentHTML("beforeend", bubble(r.message, true, d.user.username));
            thread.scrollTop = thread.scrollHeight;
            f.reset(); say(note, "Sent. They'll see it on their Messages page.", "ok");
          } catch (err) { say(note, err.message); }
        });
      });
      loadMe(true);
    } catch (err) { host.innerHTML = `<p class="note">${esc(err.message)}</p>`; }
  }

  async function listUsers(q) {
    const host = $("#user-list");
    try {
      const d = await api("admin/users?q=" + encodeURIComponent(q || ""));
      host.innerHTML = d.users.length ? `<ul class="users">${d.users.map((u) => `
        <li data-user="${u.id}" data-name="${esc(u.username)}">
          <div class="u-main">${avatarImg(u, 32)} ${nameTag(u)}${u.banned ? ' <span class="author-tag banned">Suspended</span>' : ""}
            <span class="meta">joined ${esc(new Date(u.created).toLocaleDateString())} · ${u.comments} comment${u.comments === 1 ? "" : "s"}</span></div>
          ${u.role === "admin" ? "" : `<div class="row">
            <button class="btn ghost small-btn" type="button" data-act="recovery">New recovery code</button>
            ${u.avatar === "custom" ? `<button class="btn ghost small-btn" type="button" data-act="picture">Remove picture</button>` : ""}
            <button class="btn ghost small-btn" type="button" data-act="${u.banned ? "unban" : "ban"}">${u.banned ? "Unsuspend" : "Suspend"}</button>
            <button class="btn danger small-btn" type="button" data-act="delete">Delete</button></div>`}
          <p class="user-out small"></p>
        </li>`).join("")}</ul>` : `<p class="small">No accounts${q ? " match that" : " yet"}.</p>`;
    } catch (err) { host.innerHTML = `<p class="note">${esc(err.message)}</p>`; }
  }

  /* ───────── under an article: sharing and comments ───────── */
  function shareBar(url, title) {
    const u = encodeURIComponent(url), t = encodeURIComponent(title);
    const links = [
      ["X", `https://x.com/intent/post?url=${u}&text=${t}`],
      ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
      ["Reddit", `https://www.reddit.com/submit?url=${u}&title=${t}`],
      ["Email", `mailto:?subject=${t}&body=${u}`],
    ];
    return `
      <div class="share" aria-label="Share this article">
        <span class="share-label">Share</span>
        ${navigator.share ? `<button class="chip" type="button" data-share>Share…</button>` : ""}
        <button class="chip" type="button" data-copy-link>Copy link</button>
        ${links.map(([name, href]) => `<a class="chip" href="${esc(href)}" target="_blank" rel="noopener">${name}</a>`).join("")}
      </div>`;
  }

  let articleToken = 0;
  async function article(slug, doc) {
    const host = $("#article-extras"), mine = ++articleToken;
    const url = `${location.origin}/article/${slug}`;
    host.innerHTML = `${shareBar(url, doc.title || "")}
      <section class="comments" id="comments" aria-labelledby="comments-h">
        <h2 id="comments-h">Comments</h2>
        <p class="small center">Please keep to the <a class="text-link" href="#rules" data-link>Nine Rules</a>.</p>
        <div id="comment-list"><p class="note">Loading comments…</p></div>
        <div id="comment-form"></div>
      </section>`;
    host.querySelector("[data-copy-link]").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied"; }
      catch { prompt("Copy this link:", url); }
      setTimeout(() => { e.target.textContent = "Copy link"; }, 1600);
    });
    host.querySelector("[data-share]")?.addEventListener("click", () => navigator.share({ title: doc.title, url }).catch(() => {}));

    const [st, data] = await Promise.all([loadMe(), api("comments?slug=" + encodeURIComponent(slug)).catch((err) => ({ error: err }))]);
    await avatarsLoaded;
    if (mine !== articleToken) return;
    const list = $("#comment-list"), formHost = $("#comment-form");
    if (data.error) {
      list.innerHTML = `<p class="note">${data.error.status === 503 ? "Comments aren't switched on yet." : "Comments couldn't be loaded right now."}</p>`;
      return;
    }
    const render = (comments) => {
      $("#comments-h").textContent = `Comments${comments.filter((c) => c.status === "approved").length ? ` (${comments.filter((c) => c.status === "approved").length})` : ""}`;
      list.innerHTML = comments.length ? comments.map((c) => commentHtml(c, st.user)).join("") : `<p class="note">No comments yet.</p>`;
    };
    let comments = data.comments;
    render(comments);
    if (location.hash === "#comments") $("#comments").scrollIntoView({ block: "start" });

    list.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-act]"), el = e.target.closest("[data-comment]");
      if (!b || !el) return;
      const id = Number(el.dataset.comment);
      try {
        if (b.dataset.act === "delete") {
          if (!confirm("Delete this comment?")) return;
          await api(`comments/${id}/delete`, {});
          comments = comments.filter((c) => c.id !== id);
        } else if (b.dataset.act === "approve") {
          await api(`admin/comments/${id}`, { action: "approve" });
          comments = comments.map((c) => (c.id === id ? { ...c, status: "approved" } : c));
        }
        render(comments);
      } catch (err) { alert(err.message); }
    });

    if (!st.user) {
      formHost.innerHTML = `<p class="center sign-to-comment"><a class="btn" href="login?next=${encodeURIComponent(`/article/${slug}#comments`)}" data-link>Sign in to comment</a>
        <span class="small">or <a class="text-link" href="login?tab=create&next=${encodeURIComponent(`/article/${slug}#comments`)}" data-link>make an account</a>. Just a username and password.</span></p>`;
      return;
    }
    formHost.innerHTML = `
      <form class="form compose" id="comment-compose">
        <div class="as">${avatarImg(st.user, 32)} Commenting as <b>${esc(st.user.username)}</b></div>
        <label class="visually-hidden" for="comment-body">Your comment</label>
        <textarea id="comment-body" name="body" rows="4" maxlength="3000" required placeholder="Add to the conversation…"></textarea>
        <p class="form-note"></p>
        <button class="btn" type="submit">Post comment</button>
      </form>`;
    const form = $("#comment-compose");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = form.querySelector(".form-note");
      busy(form.querySelector("button"), "Posting…", async () => {
        try {
          const r = await api("comments", { slug, body: form.body.value });
          comments = [...comments, r.comment];
          render(comments);
          form.reset();
          say(note, r.comment.status === "pending" ? "Posted. It's being held for a quick review before it shows to everyone." : "", "ok");
          list.lastElementChild?.scrollIntoView({ block: "nearest" });
        } catch (err) { say(note, err.message); }
      });
    });
  }

  function commentHtml(c, me) {
    const admin = me && me.role === "admin";
    const held = c.status === "pending";
    return `<article class="comment${held ? " held" : ""}" data-comment="${c.id}">
      ${avatarImg(c.user, 40)}
      <div class="c-main">
        <header>${nameTag(c.user)} <span class="meta">${esc(when(c.created))}</span>${held ? ' <span class="author-tag held-tag">Held for review</span>' : ""}</header>
        <div class="comment-body">${paragraphs(c.body)}</div>
        ${c.mine || admin ? `<div class="c-actions">${admin && held ? `<button class="link-btn" type="button" data-act="approve">Approve</button>` : ""}<button class="link-btn" type="button" data-act="delete">Delete</button></div>` : ""}
      </div>
    </article>`;
  }

  /* ───────── the way in from other pages ───────── */
  const VIEWS = { login: showLogin, account: showAccount, messages: showMessages, admin: showAdmin, privacy: () => {} };
  const TITLES = { login: "Sign in", account: "Your account", messages: "Messages", admin: "Admin", privacy: "Privacy" };
  window.community = {
    go: (url) => { location.href = url; },   // replaced by site.js
    views: Object.keys(VIEWS),
    title: (v) => TITLES[v],
    show: (v) => VIEWS[v](),
    article,
    refresh: () => loadMe(true),
  };
  loadMe();
})();
