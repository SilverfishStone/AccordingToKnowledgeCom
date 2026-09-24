/* Writing on the articles site: the editor, community articles, and people's pages.
   site.js owns the addresses and calls in here:
     writing.write(id)        /write (your desk) and /write/<id> (the editor)
     writing.list()           /community
     writing.read(slug)       /community/<slug>
     writing.person(name)     /people/<username>
     writing.home()           the "From the community" part of the home page
   The editor itself is shared with silverfishstone.com/write: shared/editor.js. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const L = () => community.lib;
  const go = (url) => writing.site.go(url);
  const setTitle = (t, d) => writing.site.setTitle(t, d);
  const readTime = (w) => (w ? Math.max(1, Math.round(w / 220)) + " min read" : "");
  const day = (ms) => new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  /* ───────── the editor library is only fetched when someone opens the editor ───────── */
  let editorLoad = null;
  const script = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("The editor couldn't load. Check your connection and reload."));
    document.head.appendChild(s);
  });
  const style = (href) => new Promise((res) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = res; l.onerror = res;
    document.head.appendChild(l);
  });
  const loadEditor = () => (editorLoad ||= Promise.all([
    style("shared/editor.css"),
    window.Quill ? null : script("https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"),
  ]).then(() => (window.ATKEditor ? null : script("shared/editor.js"))).catch((e) => { editorLoad = null; throw e; }));

  /* ───────── the site has a newer version of this article ─────────
     Silver's drafts remember which published version they started from. If the site has a newer
     one (it was edited on silverfishstone.com/write, or in another draft here), ask first. */
  const asked = new Set();
  function askSync(site, words, publishing) {
    const { esc } = L();
    let dlg = $("#sync-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "sync-dialog"; dlg.className = "parch-dialog";
      dlg.setAttribute("aria-labelledby", "sy-h");
      document.body.appendChild(dlg);
    }
    const at = new Date(site.updated);
    dlg.innerHTML = `<form method="dialog">
      <h2 id="sy-h">${publishing ? "This article changed on the site" : "There's a newer version on the site"}</h2>
      <p>“${esc(site.title || "This article")}” was updated on the site on ${esc(at.toLocaleDateString(undefined, { dateStyle: "long" }))} at ${esc(at.toLocaleTimeString(undefined, { timeStyle: "short" }))}${site.words ? ` (${Number(site.words).toLocaleString()} words)` : ""}, after this draft was started (${words.toLocaleString()} words). It was probably edited on silverfishstone.com/write or in another draft.</p>
      <p class="small">${publishing ? "Publishing yours replaces the changes made on the site. Loading the site's version keeps this draft as a separate copy." : "Loading the site's version keeps this draft as a separate copy, so nothing is lost."}</p>
      <div class="row dialog-row">
        <button class="btn ghost small-btn" value="cancel">${publishing ? "Cancel" : "Decide later"}</button>
        ${publishing ? `<button class="btn danger small-btn" value="force">Publish mine anyway</button>` : `<button class="btn ghost small-btn" value="keep">Keep my draft</button>`}
        <button class="btn small-btn" value="load">Load the site's version</button>
      </div></form>`;
    return new Promise((resolve) => {
      const ac = new AbortController();
      const finish = (v) => { ac.abort(); if (dlg.open) dlg.close(); resolve(v); };
      dlg.querySelectorAll("button[value]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); finish(b.value); }, { signal: ac.signal }));
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish("cancel"); }, { signal: ac.signal });   // Esc
      dlg.addEventListener("close", () => finish(dlg.returnValue || "cancel"), { signal: ac.signal });
      dlg.returnValue = "";
      dlg.showModal();
    });
  }
  const siteIsNewer = (w, site) => !!(site && site.updated && w.base && Date.parse(site.updated) > Date.parse(w.base) + 1000);

  /* ───────── /write: the desk ───────── */
  let open = null;   // the editor that's open, so leaving can save it

  async function write(id) {
    const box = $("#write-box");
    leave();
    if (id) return editorPage(box, id);
    const { api, esc, when, loadMe, say, busy, paragraphs } = L();
    box.innerHTML = `<p class="note">Loading…</p>`;
    const st = await loadMe(true);
    const u = st.user;
    setTitle("Write", "Write for According To Knowledge.");
    if (!u) {
      box.innerHTML = `<h1 class="page-h">Write for the site</h1>
        <p class="lead center">Approved writers can publish articles here, in the Community section. It starts with an account.</p>
        <p class="center row-center"><a class="btn" href="login?next=/write" data-link>Sign in</a> <a class="btn ghost" href="login?tab=create&next=/write" data-link>Make an account</a></p>
        <p class="small center">Read <a class="text-link" href="writing-terms" data-link>writing for the site</a> first.</p>`;
      return;
    }
    if (u.role === "user") {
      box.innerHTML = `<h1 class="page-h">Write for the site</h1>
        <p class="lead">Community writers publish articles in the <a class="text-link" href="community" data-link>Community</a> section. I read each one before it goes up. Please read <a class="text-link" href="writing-terms" data-link>writing for the site</a> first.</p>
        ${st.writerRequest ? `<p class="form-note ok">Your request is with me. I'll reply in your <a class="text-link" href="messages" data-link>messages</a>. You can update it below.</p>` : ""}
        <form class="form" id="w-request">
          <label>Tell me a little about what you'd like to write
            <textarea name="note" rows="5" maxlength="1000" required minlength="10" placeholder="Topics, an idea for a first article, anything you've written before…"></textarea></label>
          <p class="form-note"></p>
          <button class="btn" type="submit">${st.writerRequest ? "Update my request" : "Ask to write"}</button>
        </form>`;
      const f = $("#w-request", box);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        busy(f.querySelector("button"), "Sending…", async () => {
          try { await api("writer/request", { note: f.note.value }); say(f.querySelector(".form-note"), "Sent. I'll reply in your messages.", "ok"); f.querySelector("button").textContent = "Update my request"; }
          catch (err) { say(f.querySelector(".form-note"), err.message); }
        });
      });
      return;
    }

    // a writer (or Silver): their pieces
    const admin = u.role === "admin";
    let mine, site = [];
    try {
      [mine, site] = await Promise.all([
        api("writing").then((d) => d.writings),
        admin ? fetch("articles/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : [])).catch(() => []) : [],
      ]);
    } catch (err) { box.innerHTML = `<p class="note">${esc(err.message)}</p>`; return; }
    const label = (w) => {
      if (w.kind === "official") return w.published ? ["On the site", "live"] : ["Draft", ""];
      if (w.state === "submitted") return [w.published ? "Changes waiting for review" : "Waiting for review", "wait"];
      if (w.note) return ["Sent back with a note", "back"];
      return w.published ? ["Published", "live"] : ["Draft", ""];
    };
    const item = (w) => {
      const [text, cls] = label(w);
      return `<div class="w-row" data-id="${w.id}" data-title="${esc(w.title || "Untitled")}" data-kind="${w.kind}" data-published="${w.published ? 1 : ""}">
        <a class="item w-item" href="write/${w.id}" data-link>
          <span class="item-title">${esc(w.title || "Untitled")}</span>
          <span class="meta"><span class="state ${cls}">${text}</span> · edited ${esc(when(w.updated))}</span></a>
        <button class="link-btn danger-link w-del" type="button" aria-label="Delete ${esc(w.title || "Untitled")}">Delete</button></div>`;
    };
    // Silver: the site's published articles that haven't been opened here yet
    const opened = new Set(mine.filter((w) => w.kind === "official" && w.slug).map((w) => w.slug));
    const onSite = (Array.isArray(site) ? site : []).filter((a) => !opened.has(a.slug));
    box.innerHTML = `
      <div class="desk-head"><h1 class="page-h">${admin ? "Your articles" : "Your writing"}</h1>
        <button class="btn" type="button" id="w-new">New article</button></div>
      ${admin ? `<p class="small center">Articles you publish here go on both sites, the same as publishing from silverfishstone.com/write. Drafts are kept on the site, so you can pick them up on any device.</p>`
        : `<p class="small center">Drafts save as you type. When one's ready, send it to me for review; I'll publish it or send it back with a note. Keep to <a class="text-link" href="writing-terms" data-link>writing for the site</a>.</p>`}
      <div class="article-list">${mine.length ? mine.map(item).join("") : `<p class="empty">Nothing here yet. Start a new article.</p>`}</div>
      ${admin && onSite.length ? `<h2 class="section-h small-h">On the site</h2>
        <div class="article-list">${onSite.map((a) => `<button class="item w-item w-import" type="button" data-slug="${esc(a.slug)}">
          <span class="item-title">${esc(a.title)}</span><span class="meta"><span class="state live">On the site</span> · open to edit</span></button>`).join("")}</div>` : ""}`;
    $("#w-new", box).addEventListener("click", (e) => busy(e.target, "Starting…", async () => {
      try { const r = await api("writing", {}); go(`/write/${r.id}`); } catch (err) { alert(err.message); }
    }));
    box.querySelectorAll(".w-del").forEach((b) => b.addEventListener("click", async () => {
      const row = b.closest(".w-row"), official = row.dataset.kind === "official", published = !!row.dataset.published;
      const sure = await L().confirmBox({
        title: "Delete this?", yes: "Delete it", danger: true,
        text: official && published
          ? `This deletes your draft of “${row.dataset.title}” here. The article stays on the site; to take it down, open it on the site and use Delete there.`
          : published ? `“${row.dataset.title}” will be deleted for good, and taken off the site along with its comments.`
          : `“${row.dataset.title}” will be deleted for good.`,
      });
      if (!sure) return;
      busy(b, "Deleting…", async () => {
        try { await api(`writing/${row.dataset.id}/delete`, {}); row.remove(); } catch (err) { alert(err.message); }
      });
    }));
    box.querySelectorAll(".w-import").forEach((b) => b.addEventListener("click", () => busy(b, "Opening…", async () => {
      try { const r = await api("writing/import", { slug: b.dataset.slug }); go(`/write/${r.id}`); } catch (err) { alert(err.message); }
    })));
  }

  /* ───────── /write/<id>: the editor ───────── */
  async function editorPage(box, id) {
    const { api, esc, when, say, busy, loadMe, paragraphs, cleanCommunity } = L();
    box.innerHTML = `<p class="note">Loading…</p>`;
    const st = await loadMe();
    if (!st.user) { go(`/login?next=/write/${id}`); return; }
    let w;
    try {
      [w] = await Promise.all([api(`writing/${id}`).then((d) => d.writing), loadEditor()]);
    } catch (err) {
      box.innerHTML = `<p class="note">${esc(err.message)}</p><p class="center"><a class="text-link" href="write" data-link>← Your writing</a></p>`;
      return;
    }
    const admin = st.user.role === "admin", official = w.kind === "official";
    const locked = w.state === "submitted" && !admin;
    setTitle(w.title || "Untitled", "");
    box.innerHTML = `
      <div class="w-bar">
        <a class="back" href="write" data-link>← Your writing</a>
        <span class="w-status" id="w-status" role="status" aria-live="polite"></span>
        <span class="spacer"></span>
        <button class="btn ghost small-btn" type="button" id="w-preview-btn" aria-pressed="false">Preview</button>
        ${locked ? `<button class="btn small-btn" type="button" id="w-withdraw">Withdraw to edit</button>`
          : `<button class="btn small-btn" type="button" id="w-main">${official ? (w.published ? "Update on the site" : "Publish") : (w.published ? "Send changes for review" : "Send for review")}</button>`}
      </div>
      ${w.note && w.state === "draft" ? `<div class="w-note"><b>Silver sent this back:</b>${paragraphs(w.note)}</div>` : ""}
      ${locked ? `<p class="w-note wait">It's with Silver for review${w.published ? "; the published version stays up until then" : ""}. Withdraw it to make changes.</p>` : ""}
      ${!official && w.published && !locked ? `<p class="small">Published at <a class="text-link" href="community/${esc(w.live.slug)}" data-link>/community/${esc(w.live.slug)}</a>. Changes you make here only show after I approve them.</p>` : ""}
      ${official && w.published ? `<p class="small">On the site at <a class="text-link" href="article/${esc(w.slug)}" data-link>/article/${esc(w.slug)}</a>. Changes show after you press Update.</p>` : ""}
      <input class="w-title" id="w-title" placeholder="Title" maxlength="150" autocomplete="off" aria-label="Title" />
      <input class="w-sub" id="w-subtitle" placeholder="Subtitle (optional)" maxlength="200" autocomplete="off" aria-label="Subtitle" />
      <textarea class="w-summary" id="w-summary" rows="2" maxlength="400" placeholder="A line or two for the list page (optional)" aria-label="Summary"></textarea>
      <div class="w-meta">
        <label>Categories <input id="w-cats" list="w-cat-list" placeholder="Up to 5, separated by commas" autocomplete="off" /></label>
        <datalist id="w-cat-list"></datalist>
        ${official ? `<label class="check"><input type="checkbox" id="w-pin" /> Pin to the home page</label>` : ""}
      </div>
      <div id="w-toolbar"></div>
      <div id="w-editor" class="story-body"></div>
      <div id="w-preview" class="story-body ql-snow" hidden><div class="ql-editor"></div></div>
      <footer class="w-foot" id="w-foot"></footer>
      <details class="w-more"><summary>More</summary>
        <div class="row">
          <button class="btn ghost small-btn" type="button" data-download="docx">Download as Word</button>
          <button class="btn ghost small-btn" type="button" data-download="html">Download as a web page</button>
        </div>
        <div class="row">
          ${w.published ? `<button class="btn ghost small-btn" type="button" id="w-unpublish">${official ? "Take it off the site" : "Unpublish"}</button>` : ""}
          <button class="btn danger small-btn" type="button" id="w-delete">Delete this ${official && w.published ? "draft (the site keeps the article)" : "draft"}</button>
        </div>
      </details>`;

    const status = $("#w-status", box);
    const note = (m, kind = "") => { status.textContent = m; status.className = "w-status " + kind; };
    const ed = ATKEditor.create({
      editor: "#w-editor", toolbar: "#w-toolbar", preset: official ? "full" : "community",
      placeholder: official ? "Start writing…" : "Start writing your article…",
      toast: (m, kind) => note(m, kind === "err" ? "err" : ""),
    });
    const q = ed.quill;
    const f = { title: $("#w-title", box), subtitle: $("#w-subtitle", box), summary: $("#w-summary", box), cats: $("#w-cats", box), pin: $("#w-pin", box) };
    f.title.value = w.title; f.subtitle.value = w.subtitle; f.summary.value = w.summary; f.cats.value = w.categories.join(", ");
    if (f.pin) f.pin.checked = w.pinned;
    if (w.delta && w.delta.ops && w.delta.ops.length) q.setContents(w.delta, "silent");
    else if (w.html) q.setContents(q.clipboard.convert({ html: w.html }), "silent");
    q.history.clear();
    // categories already in use, as suggestions
    fetch("articles/index.json").then((r) => r.json()).then((list) => {
      const names = [...new Set(list.flatMap((a) => a.categories || []))].sort();
      $("#w-cat-list", box).innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
    }).catch(() => {});
    if (locked) { q.enable(false); Object.values(f).forEach((el) => { if (el) el.disabled = true; }); }

    const foot = () => { const n = ed.words(); $("#w-foot", box).textContent = `${n.toLocaleString()} word${n === 1 ? "" : "s"}${n ? " · " + readTime(n) : ""}`; };
    foot();
    const payload = () => ({
      title: f.title.value, subtitle: f.subtitle.value, summary: f.summary.value,
      categories: f.cats.value.split(",").map((s) => s.trim()).filter(Boolean),
      html: ed.html(), delta: q.getContents(), words: ed.words(), pinned: f.pin ? f.pin.checked : false,
    });
    let dirty = false, timer = null, saving = null;
    async function save() {
      clearTimeout(timer);
      if (!dirty || locked) return saving;
      dirty = false;
      note("Saving…");
      saving = api(`writing/${w.id}`, payload())
        .then((r) => { note(`Saved ${new Date(r.updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, "ok"); })
        .catch((err) => { dirty = true; note(`Couldn't save: ${err.message}`, "err"); throw err; });
      return saving.catch(() => {});
    }
    const changed = () => { if (locked) return; dirty = true; note("Unsaved changes…", "warn"); clearTimeout(timer); timer = setTimeout(save, 1500); foot(); };
    q.on("text-change", (_d, _o, source) => { if (source === "user") changed(); });
    [f.title, f.subtitle, f.summary, f.cats].forEach((el) => el.addEventListener("input", changed));
    if (f.pin) f.pin.addEventListener("change", changed);
    note(locked ? "Waiting for review" : w.updated ? `Saved ${when(w.updated)}` : "");
    open = { save, isDirty: () => dirty, send: () => {   // when the tab closes: one last save that outlives the page
      if (!dirty) return;
      try { fetch(`/api/writing/${w.id}`, { method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) }); } catch { }
    } };

    // preview, the way readers will see it
    const pv = $("#w-preview-btn", box);
    pv.addEventListener("click", () => {
      const on = pv.getAttribute("aria-pressed") !== "true";
      pv.setAttribute("aria-pressed", String(on)); pv.textContent = on ? "Back to editing" : "Preview";
      $("#w-toolbar", box).hidden = on; $("#w-editor", box).hidden = on; $("#w-preview", box).hidden = !on;
      if (on) $("#w-preview .ql-editor", box).innerHTML = official ? DOMPurify.sanitize(ed.html()) : cleanCommunity(ed.html());
      if (on && official) window.ATKEmbeds?.hydrate($("#w-preview .ql-editor", box));
    });

    $("#w-main", box)?.addEventListener("click", (e) => busy(e.target, official ? "Publishing…" : "Sending…", async () => {
      if (!f.title.value.trim()) { note("Give it a title first.", "err"); f.title.focus(); return; }
      if (!ed.words()) { note("There's nothing written yet.", "err"); return; }
      const go_ = await L().confirmBox(official
        ? { title: w.published ? "Update it on the site?" : "Publish it?", yes: w.published ? "Update" : "Publish", text: `“${f.title.value.trim()}” will ${w.published ? "be updated" : "go up"} on both sites.` }
        : { title: "Send it for review?", yes: "Send it", text: w.published ? "Your changes go to Silver. The published version stays up until they're approved." : "It goes to Silver to read. You can't change it while it's waiting, unless you withdraw it." });
      if (!go_) return;
      dirty = true; await save();
      if (dirty) return;   // the save failed; the status says why
      try {
        if (official) {
          let r;
          try { r = await api(`writing/${w.id}/publish`, {}); }
          catch (err) {
            if (!(err.status === 409 && err.data && err.data.conflict)) throw err;
            const force = await publishConflict(err.data.conflict);
            if (!force) { if (force === false) note("Not published.", ""); return; }
            r = await api(`writing/${w.id}/publish`, { force: true });
          }
          note(`${r.verb === "Publish" ? "Published" : "Updated"}. Both sites show it within a couple of minutes.`, "ok");
          if (!w.published) setTimeout(() => editorPage(box, w.id), 1200);
        } else {
          await api(`writing/${w.id}/submit`, {});
          editorPage(box, w.id);
        }
      } catch (err) { note(err.message, "err"); }
    }));
    $("#w-withdraw", box)?.addEventListener("click", (e) => busy(e.target, "Withdrawing…", async () => {
      try { await api(`writing/${w.id}/withdraw`, {}); editorPage(box, w.id); } catch (err) { note(err.message, "err"); }
    }));
    $("#w-unpublish", box)?.addEventListener("click", async (e) => {
      if (!(await L().confirmBox({ title: official ? "Take it off the site?" : "Unpublish it?", yes: official ? "Take it off" : "Unpublish", danger: true,
        text: official ? "The article comes off both sites. This draft stays here, and you can publish it again." : "It comes off the site. It stays here as a draft, and you can send it for review again." }))) return;
      busy(e.target, "Working…", async () => {
        try { await api(`writing/${w.id}/unpublish`, {}); editorPage(box, w.id); } catch (err) { note(err.message, "err"); }
      });
    });
    $("#w-delete", box).addEventListener("click", async (e) => {
      if (!(await L().confirmBox({ title: "Delete this?", yes: "Delete it", danger: true,
        text: official && w.published ? "This deletes the draft. The article stays on the site; you can open it again from Your articles."
          : w.published ? "It will be deleted for good, and taken off the site along with its comments." : "It will be deleted for good." }))) return;
      busy(e.target, "Deleting…", async () => {
        try { dirty = false; await api(`writing/${w.id}/delete`, {}); open = null; go("/write"); } catch (err) { note(err.message, "err"); }
      });
    });
    box.querySelectorAll("[data-download]").forEach((b) => b.addEventListener("click", () => L().download({
      title: f.title.value.trim() || "Untitled", subtitle: f.subtitle.value.trim(),
      author: official ? "Silver" : st.user.username, date: Date.now(),
      html: official ? DOMPurify.sanitize(ed.html()) : cleanCommunity(ed.html()),
    }, b.dataset.download, b)));
    if (!w.title) f.title.focus();

    const loadSite = async () => {
      if (dirty) { await save(); if (dirty) return; }
      note("Loading the site's version…");
      try { await api(`writing/${w.id}/reload`, {}); editorPage(box, w.id); }
      catch (err) { note(err.message, "err"); }
    };
    publishConflict = async (conflict) => {
      const choice = await askSync(conflict, ed.words(), true);
      if (choice === "load") { await loadSite(); return null; }
      return choice === "force";
    };
    if (official && siteIsNewer(w, w.site) && !asked.has(`${w.id}|${w.site.updated}`)) {
      asked.add(`${w.id}|${w.site.updated}`);
      const choice = await askSync(w.site, ed.words(), false);
      if (choice === "load") await loadSite();
      else if (choice === "keep") api(`writing/${w.id}/keep`, { version: w.site.updated }).catch(() => {});
    }
  }
  let publishConflict = async () => false;

  // leaving the editor (another page, or closing the tab) saves what's unsaved
  function leave() { if (open) { open.save(); open = null; } }
  addEventListener("pagehide", () => { if (open) open.send(); });

  /* ───────── /community ───────── */
  const itemHtml = (a) => {
    const { esc, avatarImg } = L();
    return `<a class="item" href="community/${esc(a.slug)}" data-link>
      <span class="item-title">${esc(a.title)}</span>
      ${a.subtitle ? `<span class="item-sub">${esc(a.subtitle)}</span>` : ""}
      <span class="meta byline-sm">${avatarImg(a.author, 22)} ${esc(a.author.username)} · ${esc(day(a.published))}${a.words ? " · " + readTime(a.words) : ""}</span>
      ${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
    </a>`;
  };

  async function list() {
    const box = $("#community-list");
    const { api, esc } = L();
    setTitle("Community", "Articles by According To Knowledge's community writers.");
    box.innerHTML = `<p class="note">Loading…</p>`;
    try {
      const d = await api("community");
      box.innerHTML = d.articles.length ? d.articles.map(itemHtml).join("") : `<p class="empty">No community articles yet. <a class="text-link" href="write" data-link>Want to write the first?</a></p>`;
    } catch (err) {
      box.innerHTML = `<p class="empty">${err.status === 503 ? "Community articles aren't switched on yet." : esc(err.message)}</p>`;
    }
  }

  async function home() {
    const sec = $("#home-community");
    if (!sec) return;
    try {
      const d = await L().api("community?limit=3");
      sec.hidden = !d.articles.length;
      $("#home-community-list").innerHTML = d.articles.map(itemHtml).join("");
    } catch { sec.hidden = true; }
  }

  /* ───────── /community/<slug> ───────── */
  let readToken = 0;
  async function read(slug) {
    const box = $("#c-doc"), mine = ++readToken;
    const { api, esc, avatarImg, nameTag, cleanCommunity } = L();
    box.innerHTML = `<p class="note">Loading…</p>`;
    $("#community-extras").innerHTML = "";
    let a;
    try { a = (await api(`community/${encodeURIComponent(slug)}`)).article; }
    catch (err) {
      if (mine !== readToken) return;
      box.innerHTML = `<h1 class="missing-h">${err.status === 404 ? "That article doesn't exist" : esc(err.message)}</h1>`;
      setTitle("Not found", "");
      return;
    }
    if (mine !== readToken) return;
    const updated = a.updated && day(a.updated) !== day(a.published) ? ` · Updated ${day(a.updated)}` : "";
    box.innerHTML = `
      <h1 class="doc-title">${esc(a.title)}</h1>
      ${a.subtitle ? `<p class="doc-sub">${esc(a.subtitle)}</p>` : ""}
      <p class="byline">${avatarImg(a.author, 30)} <span>by ${nameTag(a.author)}</span></p>
      <span class="meta">${esc(day(a.published))}${a.words ? " · " + readTime(a.words) : ""}${esc(updated)}</span>
      ${a.categories.length ? `<div class="tags">${a.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
      <div class="ink-rule" data-rule="8"></div>
      <div class="story-body ql-snow"><div class="ql-editor">${cleanCommunity(a.html)}</div></div>
      <p class="small community-note">Community articles are written by readers. I read each one before it's published, but the views are the writer's own.</p>`;
    writing.site.inkRule($(".ink-rule", box));
    setTitle(a.title, a.summary || "");
    community.article(slug, { title: a.title, html: cleanCommunity(a.html) }, {
      key: `c:${slug}`, path: `/community/${slug}`, host: "#community-extras",
      info: { subtitle: a.subtitle, author: a.author.username, date: a.published },
      owner: { kind: "community", authorId: a.author.id },
    });
  }

  /* ───────── /people/<username> ───────── */
  async function person(name) {
    const box = $("#person-box");
    const { api, esc, avatarImg } = L();
    box.innerHTML = `<p class="note">Loading…</p>`;
    let d;
    try { d = await api(`people/${encodeURIComponent(name)}`); }
    catch (err) {
      box.innerHTML = `<h1 class="missing-h">${err.status === 404 ? "There's no one here by that name" : esc(err.message)}</h1>`;
      setTitle("Not found", "");
      return;
    }
    const p = d.person;
    setTitle(p.username, `${p.username} on According To Knowledge.`);
    const tag = p.role === "admin" ? "Author" : p.role === "writer" ? "Community writer" : "";
    box.innerHTML = `
      <header class="person-head">${avatarImg(p, 96)}
        <div><h1>${esc(p.username)}</h1>
          <p class="meta">${tag ? `<span class="author-tag${p.role === "writer" ? " writer-tag" : ""}">${tag}</span> · ` : ""}joined ${esc(day(p.joined))} · ${p.comments} comment${p.comments === 1 ? "" : "s"}</p></div></header>
      ${p.role === "admin" ? `<p class="center"><a class="text-link" href="" data-link>Silver's articles are on the home page →</a></p>` : ""}
      ${d.articles.length ? `<div class="ink-rule" data-rule="9"></div><h2 class="section-h">Articles</h2><div class="article-list">${d.articles.map(itemHtml).join("")}</div>` : ""}`;
    box.querySelectorAll(".ink-rule").forEach(writing.site.inkRule);
  }

  window.writing = {
    site: { go: (u) => { location.href = u; }, setTitle: () => {}, inkRule: () => {} },   // filled in by site.js
    write, list, read, person, home, leave,
  };
})();
