(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Where stories are published. Change if the repo moves. */
  const DEFAULTS = { owner: "SilverfishStone", repo: "AccordingToKnowledgeCom", branch: "main" };
  const INDEX_PATH = "stories/index.json";
  const K = {
    drafts: "atk.drafts.v1",
    cfg: "atk.gh.cfg.v1",
    tok: "atk.gh.token.v1",
    cur: "atk.current.v1",
  };

  /* ───────── storage (every access guarded; browsers can block it) ───────── */
  const store = {
    getJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const getToken = () => { try { return sessionStorage.getItem(K.tok) || localStorage.getItem(K.tok) || ""; } catch { return ""; } };
  const setToken = (t, remember) => {
    try {
      sessionStorage.removeItem(K.tok); localStorage.removeItem(K.tok);
      (remember ? localStorage : sessionStorage).setItem(K.tok, t);
      return true;
    } catch { return false; }
  };
  const clearToken = () => { try { sessionStorage.removeItem(K.tok); localStorage.removeItem(K.tok); } catch {} };

  /* ───────── UI helpers ───────── */
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg, kind = "") {
    toastEl.textContent = msg;
    toastEl.className = "toast " + kind;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, kind === "err" ? 9000 : 5000);
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); };
  const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  /* ───────── base64 (UTF-8 safe) ───────── */
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const unb64 = (str) => {
    const bin = atob(str.replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };

  /* ───────── GitHub ───────── */
  let cfg = store.getJSON(K.cfg) || { ...DEFAULTS };

  async function gh(path, { method = "GET", body, accept } = {}) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
        method,
        cache: "no-store",
        headers: {
          Accept: accept || "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: "Bearer " + getToken(),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      const e = new Error("Couldn't reach GitHub. Check your connection."); e.status = 0; throw e;
    }
    if (!res.ok) {
      const e = new Error(explain(res.status)); e.status = res.status; throw e;
    }
    if (accept && accept.includes("raw")) return res.text();
    return res.status === 204 ? null : res.json();
  }
  function explain(status) {
    if (status === 401) return "GitHub rejected the token (expired or revoked). Disconnect and connect again.";
    if (status === 403) return "GitHub denied that. The token needs “Contents: Read and write” on this repo (or you've hit a rate limit).";
    if (status === 404) return "GitHub couldn't find that. Check the owner, repo and branch, and that the token can access the repo.";
    if (status === 409 || status === 422) return "GitHub reported a conflict (something changed at the same time). Try again.";
    return "GitHub returned an error (" + status + ").";
  }
  const contentsPath = (p) => "/contents/" + p.split("/").map(encodeURIComponent).join("/");

  async function getFile(path) {
    try {
      const j = await gh(`${contentsPath(path)}?ref=${encodeURIComponent(cfg.branch)}`);
      if (j.encoding === "base64" && j.content != null && j.content !== "") return { sha: j.sha, text: unb64(j.content) };
      // large files come back without inline content
      const text = await gh(`${contentsPath(path)}?ref=${encodeURIComponent(cfg.branch)}`, { accept: "application/vnd.github.raw+json" });
      return { sha: j.sha, text };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  const putFile = (path, text, message, sha) =>
    gh(contentsPath(path), { method: "PUT", body: { message, content: b64(text), branch: cfg.branch, ...(sha ? { sha } : {}) } });
  const deleteFile = (path, sha, message) =>
    gh(contentsPath(path), { method: "DELETE", body: { message, sha, branch: cfg.branch } });

  const byNewest = (a, b) => new Date(b.published) - new Date(a.published);
  async function readIndex() {
    const f = await getFile(INDEX_PATH);
    if (!f) return [];
    const list = JSON.parse(f.text);
    return Array.isArray(list) ? list : [];
  }
  /* Read-modify-write of stories/index.json, retrying if someone else committed in between. */
  async function updateIndex(mutate, message) {
    for (let attempt = 0; ; attempt++) {
      const f = await getFile(INDEX_PATH);
      const list = f ? JSON.parse(f.text) : [];
      const next = mutate(Array.isArray(list) ? list : []).sort(byNewest);
      try {
        await putFile(INDEX_PATH, JSON.stringify(next, null, 2) + "\n", message, f && f.sha);
        return next;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 2) continue;
        throw e;
      }
    }
  }

  /* ───────── gate ───────── */
  const gateForm = $("#gate-form");
  const gErr = $("#g-error");
  $("#g-owner").value = cfg.owner || DEFAULTS.owner;
  $("#g-repo").value = cfg.repo || DEFAULTS.repo;
  $("#g-branch").value = cfg.branch || DEFAULTS.branch;

  gateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = { owner: $("#g-owner").value.trim(), repo: $("#g-repo").value.trim(), branch: $("#g-branch").value.trim() };
    const token = $("#g-token").value.trim();
    const btn = $("#g-submit");
    gErr.hidden = true; btn.disabled = true; btn.textContent = "Checking…";
    const prev = cfg; cfg = next;
    const prevTok = getToken(); setToken(token, $("#g-remember").checked);
    let step = "repo";
    try {
      const repo = await gh("");
      if (repo && repo.permissions && repo.permissions.push === false) {
        const err = new Error("This token can read the repository but not write to it."); throw err;
      }
      step = "branch";
      await gh("/branches/" + encodeURIComponent(next.branch));
      store.setJSON(K.cfg, next);
      $("#g-token").value = "";
      unlock();
    } catch (err) {
      cfg = prev;
      if (prevTok) setToken(prevTok, true); else clearToken();
      gErr.textContent = err.status === 404 && step === "branch" ? `The branch “${next.branch}” doesn't exist in that repository.` : err.message;
      gErr.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Connect";
    }
  });

  /* ───────── editor setup ───────── */
  if (!window.Quill) {
    gErr.textContent = "The editor library didn't load (blocked or offline). Reload the page.";
    gErr.hidden = false;
    return;
  }

  const Font = Quill.import("formats/font");
  Font.whitelist = ["sans", "serif", "palatino", "garamond", "monospace", "cursive"];
  Quill.register(Font, true);
  const Size = Quill.import("attributors/style/size");
  Size.whitelist = ["12px", "14px", "16px", "20px", "24px", "28px", "36px", "48px", "64px"];
  Quill.register(Size, true);
  const BlockEmbed = Quill.import("blots/block/embed");
  class Divider extends BlockEmbed {}
  Divider.blotName = "divider"; Divider.tagName = "hr";
  Quill.register(Divider);

  let quill;   // assigned just below; handlers only run after that
  quill = new Quill("#editor", {
    theme: "snow",
    placeholder: "Once upon a time…",
    modules: {
      toolbar: {
        container: "#toolbar",
        handlers: {
          undo() { quill.history.undo(); },
          redo() { quill.history.redo(); },
          divider() {
            const r = quill.getSelection(true);
            quill.insertEmbed(r.index, "divider", true, "user");
            quill.setSelection(r.index + 1, 0, "silent");
          },
          image() {
            const url = (prompt("Image web address (https://…)") || "").trim();
            if (!url) return;
            if (!/^https?:\/\//i.test(url)) { toast("Use a full http:// or https:// address.", "err"); return; }
            const r = quill.getSelection(true);
            quill.insertEmbed(r.index, "image", url, "user");
            quill.setSelection(r.index + 1, 0, "silent");
          },
        },
      },
      history: { delay: 800, maxStack: 300, userOnly: true },
    },
  });

  // custom (any-color) pickers: remember the selection, since the native dialog steals focus
  let lastRange = null;
  quill.on("selection-change", (range) => { if (range) lastRange = range; });
  function wireColor(inputSel, format) {
    const input = $(inputSel);
    input.addEventListener("input", () => { input.parentElement.style.setProperty("--c", input.value); });
    input.addEventListener("change", () => {
      if (!lastRange) { toast("Click into the text first.", "err"); return; }
      quill.setSelection(lastRange.index, lastRange.length, "silent");
      quill.format(format, input.value, "user");
      quill.focus();
    });
  }
  wireColor("#c-text", "color");
  wireColor("#c-bg", "background");

  /* ───────── drafts ───────── */
  const titleEl = $("#title"), summaryEl = $("#summary");
  let drafts = store.getJSON(K.drafts) || {};   // id -> draft
  let remote = [];                              // published index entries
  let cur = null;                               // the open draft
  let previewOn = false;
  let busy = false;
  let savedAt = null;

  const newDraft = () => ({ id: uid(), title: "", summary: "", delta: { ops: [] }, slug: null, published: null, created: Date.now(), updated: Date.now(), changed: false });
  const bodyHasContent = () => quill.getText().trim() || quill.getContents().ops.some((o) => o.insert && typeof o.insert === "object");
  const hasContent = () => titleEl.value.trim() || summaryEl.value.trim() || bodyHasContent();
  const countWords = () => { const t = quill.getText().trim(); return t ? t.split(/\s+/).length : 0; };

  function persist() { return store.setJSON(K.drafts, drafts); }

  function saveLocal({ quiet } = {}) {
    if (!cur) return true;
    cur.title = titleEl.value;
    cur.summary = summaryEl.value;
    cur.delta = quill.getContents();
    cur.updated = Date.now();
    if (!hasContent()) { delete drafts[cur.id]; persist(); renderList(); return true; }
    drafts[cur.id] = cur;
    const ok = persist();
    if (ok) { savedAt = new Date(); store.setJSON(K.cur, cur.id); } else if (!quiet) toast("Couldn't save: this browser is blocking or has run out of storage.", "err");
    renderStatus(ok ? "" : "warn");
    renderList();
    return ok;
  }

  let autosave;
  function onEdit() {
    if (!cur) return;
    cur.changed = true;
    renderStatus("warn", "Unsaved changes…");
    clearTimeout(autosave);
    autosave = setTimeout(() => saveLocal({ quiet: true }), 700);
    renderFoot();
  }
  quill.on("text-change", (_d, _o, source) => { if (source !== "silent") onEdit(); else renderFoot(); });
  titleEl.addEventListener("input", onEdit);
  summaryEl.addEventListener("input", onEdit);

  function renderFoot() {
    const w = countWords();
    $("#foot").innerHTML = `<span>${w.toLocaleString()} word${w === 1 ? "" : "s"}</span><span>${Math.max(0, quill.getLength() - 1).toLocaleString()} characters</span><span>${w ? Math.max(1, Math.round(w / 220)) + " min read" : ""}</span>`;
  }

  function renderStatus(cls = "", override = "") {
    const el = $("#status");
    el.className = "status " + cls;
    if (override) { el.textContent = override; return; }
    if (!cur) { el.textContent = ""; return; }
    const saved = savedAt ? "Saved on this device " + fmtTime(savedAt) : "Not saved yet";
    const live = cur.slug ? (cur.changed ? "Live version is older than this draft" : "Live on the site") : "Not published";
    el.textContent = saved + " · " + live;
  }

  function renderChrome() {
    $("#btn-publish").textContent = cur && cur.slug ? "Update" : "Publish";
    $("#m-unpublish").disabled = !(cur && cur.slug);
    renderStatus();
    renderFoot();
  }

  function renderList() {
    const local = Object.values(drafts).sort((a, b) => b.updated - a.updated);
    // a brand-new empty draft isn't saved yet, but should still show as the open item
    if (cur && !drafts[cur.id]) local.unshift(cur);
    const taken = new Set(local.map((d) => d.slug).filter(Boolean));
    const remoteOnly = remote.filter((s) => !taken.has(s.slug));

    const badge = (d) => !d.slug ? '<span class="badge">Draft</span>' : d.changed ? '<span class="badge edited">Live · edited</span>' : '<span class="badge live">Live</span>';
    const item = (d) => `<button type="button" class="item${cur && d.id === cur.id ? " active" : ""}" data-id="${esc(d.id)}">
      <span class="item-title">${esc(d.title.trim() || "Untitled")}</span>
      <span class="item-meta">${badge(d)}<span>${esc(fmtDate(d.updated))}</span></span></button>`;
    const rItem = (s) => `<button type="button" class="item" data-slug="${esc(s.slug)}">
      <span class="item-title">${esc(s.title || "Untitled")}</span>
      <span class="item-meta"><span class="badge live">Live</span><span>${esc(fmtDate(s.published))}</span></span></button>`;

    $("#story-items").innerHTML =
      (local.length ? `<div class="group-label">Drafts &amp; edits</div>${local.map(item).join("")}` : "") +
      (remoteOnly.length ? `<div class="group-label">Published</div>${remoteOnly.map(rItem).join("")}` : "");
    $("#side-note").textContent = `Drafts stay in this browser. Publishing commits to ${cfg.owner}/${cfg.repo}.`;
  }

  function loadIntoUI() {
    titleEl.value = cur.title || "";
    summaryEl.value = cur.summary || "";
    quill.setContents(cur.delta && cur.delta.ops ? cur.delta : { ops: [] }, "silent");
    quill.history.clear();
    lastRange = null;
    setPreview(false);
    savedAt = drafts[cur.id] ? new Date(cur.updated) : null;
    store.setJSON(K.cur, cur.id);
    renderChrome();
    renderList();
    window.scrollTo(0, 0);
  }

  function leaveCurrent() {
    clearTimeout(autosave);
    if (cur) saveLocal({ quiet: true });
  }
  function openDraft(id) {
    if (!drafts[id] || (cur && cur.id === id)) return;
    leaveCurrent();
    cur = drafts[id];
    loadIntoUI();
  }
  function newStory() {
    leaveCurrent();
    cur = newDraft();
    loadIntoUI();
    titleEl.focus();
  }

  async function openRemote(slug) {
    if (busy) return;
    leaveCurrent();
    setBusy(true, "Opening…");
    try {
      const f = await getFile(`stories/${slug}.json`);
      if (!f) throw new Error("That story's file is missing from the repo.");
      const s = JSON.parse(f.text);
      const delta = s.delta && s.delta.ops ? s.delta : quill.clipboard.convert({ html: String(s.html || "") });
      const d = { ...newDraft(), title: s.title || "", summary: s.summary || "", delta, slug: s.slug || slug, published: s.published || null };
      drafts[d.id] = d; persist();
      cur = d;
      loadIntoUI();
    } catch (err) {
      toast(err.message, "err");
    } finally { setBusy(false); }
  }

  $("#story-items").addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (!b) return;
    document.body.classList.remove("side-open");
    if (b.dataset.id) openDraft(b.dataset.id); else openRemote(b.dataset.slug);
  });
  $("#btn-new").addEventListener("click", () => { document.body.classList.remove("side-open"); newStory(); });
  $("#btn-side").addEventListener("click", () => {
    const open = document.body.classList.toggle("side-open");
    $("#btn-side").setAttribute("aria-expanded", String(open));
  });

  /* ───────── preview / focus ───────── */
  function setPreview(on) {
    previewOn = on;
    $("#btn-preview").setAttribute("aria-pressed", String(on));
    $("#toolbar").style.display = on ? "none" : "";
    $("#editor").hidden = on;
    $("#preview").hidden = !on;
    if (on) $("#preview .ql-editor").innerHTML = DOMPurify.sanitize(quill.root.innerHTML);
  }
  $("#btn-preview").addEventListener("click", () => setPreview(!previewOn));
  $("#btn-focus").addEventListener("click", () => {
    const on = document.body.classList.toggle("focus");
    $("#btn-focus").setAttribute("aria-pressed", String(on));
  });

  /* ───────── save / publish / unpublish / delete / export ───────── */
  const actionBtns = ["#btn-save", "#btn-publish", "#btn-new"];
  function setBusy(on, label) {
    busy = on;
    actionBtns.forEach((s) => { $(s).disabled = on; });
    if (on && label) renderStatus("", label);
    else renderStatus();
    if (!on) renderChrome();
  }

  $("#btn-save").addEventListener("click", () => {
    clearTimeout(autosave);
    if (!hasContent()) { toast("Nothing to save yet."); return; }
    if (saveLocal()) toast("Draft saved on this device.", "ok");
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); $("#btn-save").click(); }
  });

  const slugify = (t) => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "story";

  async function freeSlug(title, list) {
    const base = slugify(title);
    const used = new Set(list.map((s) => s.slug));
    for (let n = 1; n < 50; n++) {
      const cand = (n === 1 ? base : `${base}-${n}`);
      if (cand === "index" || used.has(cand)) continue;
      if (!(await getFile(`stories/${cand}.json`))) return cand;
    }
    throw new Error("Couldn't find a free web address for this title. Try a different title.");
  }

  $("#btn-publish").addEventListener("click", async () => {
    if (busy || !cur) return;
    const title = titleEl.value.trim();
    if (!title) { toast("Give the story a title first.", "err"); titleEl.focus(); return; }
    if (!bodyHasContent()) { toast("The story is empty.", "err"); return; }
    const verb = cur.slug ? "Update" : "Publish";
    if (!confirm(`${verb} “${title}” on the public site?`)) return;

    clearTimeout(autosave);
    saveLocal({ quiet: true });
    setBusy(true, verb === "Publish" ? "Publishing…" : "Updating…");
    try {
      const list = await readIndex();
      const slug = cur.slug || await freeSlug(title, list);
      const now = new Date().toISOString();
      const published = cur.published || now;
      const html = quill.root.innerHTML;
      const words = countWords();
      const summary = summaryEl.value.trim();

      const story = { slug, title, summary, published, updated: now, words, html, delta: quill.getContents() };
      const path = `stories/${slug}.json`;
      const existing = await getFile(path);
      await putFile(path, JSON.stringify(story), `${verb} story: ${title}`, existing && existing.sha);

      remote = await updateIndex((l) => {
        const entry = { slug, title, summary, published, updated: now, words };
        const i = l.findIndex((s) => s.slug === slug);
        if (i >= 0) l[i] = entry; else l.push(entry);
        return l;
      }, `${verb} story index: ${title}`);

      cur.slug = slug; cur.published = published; cur.changed = false;
      saveLocal({ quiet: true });
      toast(`${verb === "Publish" ? "Published" : "Updated"}. GitHub Pages usually shows it on the site within a minute or two.`, "ok");
    } catch (err) {
      toast((err instanceof SyntaxError ? "stories/index.json isn't valid JSON, so nothing was changed. Fix it in the repo first." : err.message) + " Your draft is still saved here.", "err");
    } finally {
      setBusy(false);
      renderList();
    }
  });

  $("#m-unpublish").addEventListener("click", async () => {
    closeMenu();
    if (busy || !cur || !cur.slug) return;
    if (!confirm(`Take “${cur.title || "this story"}” off the public site? Your local draft is kept, and you can publish it again later.`)) return;
    setBusy(true, "Unpublishing…");
    try {
      const slug = cur.slug;
      const f = await getFile(`stories/${slug}.json`);
      if (f) await deleteFile(`stories/${slug}.json`, f.sha, `Unpublish story: ${cur.title}`);
      remote = await updateIndex((l) => l.filter((s) => s.slug !== slug), `Unpublish story index: ${cur.title}`);
      cur.slug = null; cur.published = null; cur.changed = false;
      saveLocal({ quiet: true });
      toast("Unpublished. It stays here as a draft.", "ok");
    } catch (err) {
      toast(err.message, "err");
    } finally { setBusy(false); renderList(); }
  });

  $("#m-delete").addEventListener("click", () => {
    closeMenu();
    if (!cur || !confirm(`Delete this local draft${cur.slug ? " copy? (The published version stays on the site.)" : "? This can't be undone."}`)) return;
    clearTimeout(autosave);
    delete drafts[cur.id]; persist();
    cur = null;
    const next = Object.values(drafts).sort((a, b) => b.updated - a.updated)[0];
    if (next) { cur = next; loadIntoUI(); } else newStory();
    toast("Draft deleted.");
  });

  $("#m-export").addEventListener("click", () => {
    closeMenu();
    const title = titleEl.value.trim() || "Untitled";
    const body = DOMPurify.sanitize(quill.root.innerHTML);
    const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css">
<style>
body{max-width:720px;margin:40px auto;padding:0 20px;font:18px/1.75 Georgia,serif;color:#111}
.ql-editor{padding:0;overflow:visible;height:auto}.ql-editor p{margin:0 0 1em}
.ql-font-sans{font-family:system-ui,sans-serif}.ql-font-serif{font-family:Georgia,serif}
.ql-font-palatino{font-family:"Palatino Linotype",Palatino,serif}.ql-font-garamond{font-family:Garamond,serif}
.ql-font-monospace{font-family:"Courier New",monospace}.ql-font-cursive{font-family:"Segoe Script","Brush Script MT",cursive}
</style></head><body class="ql-snow"><h1>${esc(title)}</h1><div class="ql-editor">${body}</div></body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    a.download = slugify(title) + ".html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $("#m-refresh").addEventListener("click", () => { closeMenu(); refreshRemote(true); });
  $("#m-disconnect").addEventListener("click", () => {
    closeMenu();
    if (!confirm("Disconnect this device? Your drafts stay here, but you'll need the token again to publish.")) return;
    leaveCurrent();
    clearToken();
    lock();
  });

  const menu = $(".menu");
  function closeMenu() { menu.open = false; }
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  async function refreshRemote(announce) {
    try {
      remote = (await readIndex()).sort(byNewest);
      if (announce) toast("Story list refreshed.", "ok");
    } catch (err) {
      toast("Couldn't load the published list: " + (err instanceof SyntaxError ? "stories/index.json isn't valid JSON." : err.message), "err");
    }
    renderList();
  }

  /* ───────── lock / unlock ───────── */
  function lock() { document.body.classList.add("locked"); }
  let started = false;
  function unlock() {
    document.body.classList.remove("locked");
    if (started) { refreshRemote(); return; }
    started = true;
    const lastId = store.getJSON(K.cur);
    cur = (lastId && drafts[lastId]) || Object.values(drafts).sort((a, b) => b.updated - a.updated)[0] || newDraft();
    loadIntoUI();
    refreshRemote();
  }

  window.addEventListener("pagehide", () => { if (cur && !document.body.classList.contains("locked")) saveLocal({ quiet: true }); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && cur && !document.body.classList.contains("locked")) saveLocal({ quiet: true }); });

  /* ───────── boot ───────── */
  if (getToken() && cfg.owner && cfg.repo) unlock();
})();
