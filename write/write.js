(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Where things are published. Change if the repo moves. */
  const DEFAULTS = { owner: "SilverfishStone", repo: "AccordingToKnowledgeCom", branch: "main" };
  const KINDS = {
    story:   { label: "Story",   dir: "stories" },
    article: { label: "Article", dir: "articles" },
  };
  const indexPath = (kind) => `${KINDS[kind].dir}/index.json`;
  const filePath  = (kind, slug) => `${KINDS[kind].dir}/${slug}.json`;
  const SERIES_PATH = "stories/series.json";
  const RESERVED = new Set(["index", "series"]);
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
  const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

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

  /* Images already on the site are stored as paths relative to the site root
     ("articles/images/x.png"). This page lives in /write/, so show them with the
     root prefixed, and take it off again when publishing. */
  const ROOT = new URL("../", location.href).href;
  const isRel = (u) => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(u);
  const toEditorUrl = (u) => (isRel(u) ? ROOT + u : u);
  const toSiteUrl = (u) => (u.startsWith(ROOT) ? u.slice(ROOT.length) : u);
  const mapHtml = (html, fn) => html.replace(/(<img\b[^>]*?\bsrc=")([^"]*)(")/gi, (_, a, u, c) => a + fn(u) + c);
  const mapDelta = (delta, fn) => {
    const d = JSON.parse(JSON.stringify(delta || { ops: [] }));
    for (const op of d.ops || []) if (op.insert && typeof op.insert === "object" && typeof op.insert.image === "string") op.insert.image = fn(op.insert.image);
    return d;
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
  async function readList(path) {
    const f = await getFile(path);
    if (!f) return [];
    const list = JSON.parse(f.text);
    return Array.isArray(list) ? list : [];
  }
  /* Read-modify-write of a JSON list file, retrying if something else committed in between. */
  async function updateList(path, mutate, message, sort) {
    for (let attempt = 0; ; attempt++) {
      const f = await getFile(path);
      const list = f ? JSON.parse(f.text) : [];
      let next = mutate(Array.isArray(list) ? list : []);
      if (sort) next = next.sort(sort);
      try {
        await putFile(path, JSON.stringify(next, null, 2) + "\n", message, f && f.sha);
        return next;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 2) continue;
        throw e;
      }
    }
  }
  const listProblem = (err) => (err instanceof SyntaxError ? "One of the index files in the repo isn't valid JSON, so nothing was changed. Fix it in the repo first." : err.message);

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
  const titleEl = $("#title"), subtitleEl = $("#subtitle"), summaryEl = $("#summary");
  let drafts = store.getJSON(K.drafts) || {};   // id -> draft
  let remote = { story: [], article: [] };      // published index entries
  let seriesList = [];                          // stories/series.json
  let cur = null;                               // the open draft
  let previewOn = false;
  let busy = false;
  let savedAt = null;

  const normalize = (d) => ({
    kind: "story", subtitle: "", series: "", pendingSeries: false, seriesTitle: "", seriesSummary: "", chapter: null, categories: [], extra: {},
    ...d,
  });
  for (const id of Object.keys(drafts)) drafts[id] = normalize(drafts[id]);

  const newDraft = (kind = "story") => normalize({
    id: uid(), kind, title: "", summary: "", delta: { ops: [] }, slug: null, published: null,
    created: Date.now(), updated: Date.now(), changed: false,
  });
  const bodyHasContent = () => quill.getText().trim() || quill.getContents().ops.some((o) => o.insert && typeof o.insert === "object");
  const hasContent = () => titleEl.value.trim() || summaryEl.value.trim() || bodyHasContent();
  const countWords = () => { const t = quill.getText().trim(); return t ? t.split(/\s+/).length : 0; };

  function persist() { return store.setJSON(K.drafts, drafts); }

  function saveLocal({ quiet } = {}) {
    if (!cur) return true;
    cur.title = titleEl.value;
    cur.subtitle = subtitleEl.value;
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
  subtitleEl.addEventListener("input", onEdit);
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

  /* ───────── type / series / categories ───────── */
  const NEW_SERIES = "__new__";
  const seriesSelect = $("#series-select"), chapterEl = $("#chapter");

  const nextChapter = (seriesSlug) => {
    const nums = remote.story.filter((s) => s.series === seriesSlug).map((s) => Number(s.chapter) || 0);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };
  function knownCategories() {
    const seen = new Map();
    const add = (n) => { const k = String(n).trim(); if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); };
    (window.SITE && SITE.categories || []).forEach(add);
    remote.article.forEach((a) => (a.categories || []).forEach(add));
    (cur ? cur.categories : []).forEach(add);
    return [...seen.values()];
  }

  function renderMeta() {
    if (!cur) return;
    const isArticle = cur.kind === "article";
    $$('input[name="kind"]').forEach((r) => { r.checked = r.value === cur.kind; r.disabled = !!cur.slug; });
    $("#kind-hint").textContent = cur.slug ? "Already published, so its type is fixed." : "";
    $("#story-meta").hidden = isArticle;
    $("#article-meta").hidden = !isArticle;
    subtitleEl.hidden = !isArticle;
    quill.root.setAttribute("data-placeholder", isArticle ? "Start writing…" : "Once upon a time…");

    // series
    const pendingNew = cur.pendingSeries || (cur.series && !seriesList.some((s) => s.slug === cur.series));
    seriesSelect.innerHTML =
      `<option value="">Standalone (not in a series)</option>` +
      seriesList.map((s) => `<option value="${esc(s.slug)}">${esc(s.title)}</option>`).join("") +
      `<option value="${NEW_SERIES}">+ New series…</option>`;
    seriesSelect.value = pendingNew ? NEW_SERIES : (cur.series || "");
    $("#new-series-row").hidden = !pendingNew && seriesSelect.value !== NEW_SERIES;
    $("#new-series-title").value = cur.seriesTitle || "";
    $("#new-series-summary").value = cur.seriesSummary || "";
    chapterEl.value = cur.chapter || "";
    chapterEl.disabled = !cur.series && seriesSelect.value !== NEW_SERIES;

    // categories
    $("#cat-chips").innerHTML = knownCategories().map((c) =>
      `<button type="button" class="cat" data-cat="${esc(c)}" aria-pressed="${cur.categories.some((x) => x.toLowerCase() === c.toLowerCase())}">${esc(c)}</button>`).join("");
  }

  $$('input[name="kind"]').forEach((r) => r.addEventListener("change", () => {
    if (!cur || cur.slug || !r.checked) return;
    cur.kind = r.value; onEdit(); renderMeta();
  }));
  seriesSelect.addEventListener("change", () => {
    if (!cur) return;
    const v = seriesSelect.value;
    cur.pendingSeries = v === NEW_SERIES;
    if (v === NEW_SERIES) {
      cur.series = slugify(cur.seriesTitle || "");
      $("#new-series-row").hidden = false;
      chapterEl.disabled = false;
      if (!cur.chapter) { cur.chapter = 1; chapterEl.value = 1; }
      $("#new-series-title").focus();
    } else {
      cur.series = v; cur.seriesTitle = ""; cur.seriesSummary = "";
      $("#new-series-row").hidden = true;
      chapterEl.disabled = !v;
      if (v && !cur.chapter) { cur.chapter = nextChapter(v); chapterEl.value = cur.chapter; }
      if (!v) { cur.chapter = null; chapterEl.value = ""; }
    }
    onEdit();
  });
  $("#new-series-title").addEventListener("input", (e) => { cur.seriesTitle = e.target.value; cur.series = slugify(e.target.value); onEdit(); });
  $("#new-series-summary").addEventListener("input", (e) => { cur.seriesSummary = e.target.value; onEdit(); });
  chapterEl.addEventListener("input", () => { const n = parseInt(chapterEl.value, 10); cur.chapter = n > 0 ? n : null; onEdit(); });

  function toggleCategory(name) {
    const i = cur.categories.findIndex((x) => x.toLowerCase() === name.toLowerCase());
    if (i >= 0) cur.categories.splice(i, 1); else cur.categories.push(name);
    onEdit(); renderMeta();
  }
  $("#cat-chips").addEventListener("click", (e) => { const b = e.target.closest(".cat"); if (b && cur) toggleCategory(b.dataset.cat); });
  function addCategory() {
    const input = $("#new-cat"), name = input.value.trim().replace(/\s+/g, " ");
    if (!name || !cur) return;
    if (!slugify(name)) { toast("Use letters or numbers in the category name.", "err"); return; }
    const existing = knownCategories().find((c) => c.toLowerCase() === name.toLowerCase());
    if (!cur.categories.some((x) => x.toLowerCase() === (existing || name).toLowerCase())) cur.categories.push(existing || name);
    input.value = ""; onEdit(); renderMeta();
  }
  $("#btn-add-cat").addEventListener("click", addCategory);
  $("#new-cat").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } });

  /* ───────── list + open/new ───────── */
  function renderChrome() {
    $("#btn-publish").textContent = cur && cur.slug ? "Update" : "Publish";
    $("#m-unpublish").disabled = !(cur && cur.slug);
    renderMeta();
    renderStatus();
    renderFoot();
  }

  function renderList() {
    const local = Object.values(drafts).sort((a, b) => b.updated - a.updated);
    // a brand-new empty draft isn't saved yet, but should still show as the open item
    if (cur && !drafts[cur.id]) local.unshift(cur);
    const taken = new Set(local.filter((d) => d.slug).map((d) => d.kind + ":" + d.slug));
    const remoteOnly = ["article", "story"].flatMap((k) => remote[k].map((s) => ({ ...s, kind: k })))
      .filter((s) => !taken.has(s.kind + ":" + s.slug)).sort(byNewest);

    const status = (d) => !d.slug ? '<span class="badge">Draft</span>' : d.changed ? '<span class="badge edited">Live · edited</span>' : '<span class="badge live">Live</span>';
    const kindBadge = (k) => `<span class="badge kind">${KINDS[k].label}</span>`;
    const item = (d) => `<button type="button" class="item${cur && d.id === cur.id ? " active" : ""}" data-id="${esc(d.id)}">
      <span class="item-title">${esc(d.title.trim() || "Untitled")}</span>
      <span class="item-meta">${kindBadge(d.kind)}${status(d)}<span>${esc(fmtDate(d.updated))}</span></span></button>`;
    const rItem = (s) => `<button type="button" class="item" data-kind="${s.kind}" data-slug="${esc(s.slug)}">
      <span class="item-title">${esc(s.title || "Untitled")}</span>
      <span class="item-meta">${kindBadge(s.kind)}<span class="badge live">Live</span><span>${esc(fmtDate(s.published))}</span></span></button>`;

    $("#story-items").innerHTML =
      (local.length ? `<div class="group-label">Drafts &amp; edits</div>${local.map(item).join("")}` : "") +
      (remoteOnly.length ? `<div class="group-label">Published</div>${remoteOnly.map(rItem).join("")}` : "");
    $("#side-note").textContent = `Drafts stay in this browser. Publishing commits to ${cfg.owner}/${cfg.repo}.`;
  }

  function loadIntoUI() {
    titleEl.value = cur.title || "";
    subtitleEl.value = cur.subtitle || "";
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
  function newOne(kind) {
    leaveCurrent();
    cur = newDraft(kind);
    loadIntoUI();
    titleEl.focus();
  }

  async function openRemote(kind, slug) {
    if (busy) return;
    leaveCurrent();
    setBusy(true, "Opening…");
    try {
      const f = await getFile(filePath(kind, slug));
      if (!f) throw new Error(`That ${KINDS[kind].label.toLowerCase()}'s file is missing from the repo.`);
      const s = JSON.parse(f.text);
      const delta = mapDelta(s.delta && s.delta.ops ? s.delta : quill.clipboard.convert({ html: mapHtml(String(s.html || ""), toEditorUrl) }), toEditorUrl);
      const d = normalize({
        ...newDraft(kind), title: s.title || "", subtitle: s.subtitle || "", summary: s.summary || "", delta,
        slug: s.slug || slug, published: s.published || null,
        series: s.series || "", chapter: s.chapter || null,
        categories: Array.isArray(s.categories) ? s.categories : [],
        extra: s.source ? { source: s.source } : {},
      });
      drafts[d.id] = d; persist();
      cur = d;
      loadIntoUI();
    } catch (err) {
      toast(listProblem(err), "err");
    } finally { setBusy(false); }
  }

  $("#story-items").addEventListener("click", (e) => {
    const b = e.target.closest(".item");
    if (!b) return;
    document.body.classList.remove("side-open");
    if (b.dataset.id) openDraft(b.dataset.id); else openRemote(b.dataset.kind, b.dataset.slug);
  });
  $("#btn-new-story").addEventListener("click", () => { document.body.classList.remove("side-open"); newOne("story"); });
  $("#btn-new-article").addEventListener("click", () => { document.body.classList.remove("side-open"); newOne("article"); });
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
  const actionBtns = ["#btn-save", "#btn-publish", "#btn-new-story", "#btn-new-article"];
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

  async function freeSlug(kind, title, list) {
    const base = slugify(title) || KINDS[kind].label.toLowerCase();
    const used = new Set(list.map((s) => s.slug));
    for (let n = 1; n < 50; n++) {
      const cand = (n === 1 ? base : `${base}-${n}`);
      if (RESERVED.has(cand) || used.has(cand)) continue;
      if (!(await getFile(filePath(kind, cand)))) return cand;
    }
    throw new Error("Couldn't find a free web address for this title. Try a different title.");
  }

  /* problems worth telling the author about before anything is sent */
  function checkBeforePublish() {
    const title = titleEl.value.trim();
    if (!title) { titleEl.focus(); return "Give it a title first."; }
    if (!bodyHasContent()) return "There's nothing written yet.";
    if (cur.kind === "story" && (cur.pendingSeries || cur.series)) {
      const isNew = cur.pendingSeries || !seriesList.some((s) => s.slug === cur.series);
      if (isNew && (!cur.seriesTitle.trim() || !cur.series)) { $("#new-series-title").focus(); return "Give the new series a title, or choose “Standalone”."; }
      if (!(cur.chapter > 0)) { chapterEl.focus(); return "Enter this story's chapter number (1 or higher)."; }
    }
    return "";
  }

  $("#btn-publish").addEventListener("click", async () => {
    if (busy || !cur) return;
    const problem = checkBeforePublish();
    if (problem) { toast(problem, "err"); return; }
    const kind = cur.kind, label = KINDS[kind].label;
    const title = titleEl.value.trim();
    const verb = cur.slug ? "Update" : "Publish";

    const clash = kind === "story" && cur.series && remote.story.find((s) => s.series === cur.series && Number(s.chapter) === cur.chapter && s.slug !== cur.slug);
    const where = kind === "story" && cur.series ? ` as chapter ${cur.chapter} of “${(seriesList.find((s) => s.slug === cur.series) || { title: cur.seriesTitle }).title}”` : "";
    if (!confirm(`${verb} “${title}”${where} on the public site?${clash ? `\n\nHeads up: “${clash.title}” is already chapter ${cur.chapter} of this series.` : ""}`)) return;

    clearTimeout(autosave);
    saveLocal({ quiet: true });
    setBusy(true, verb === "Publish" ? "Publishing…" : "Updating…");
    try {
      // a brand-new series is registered first, so a chapter never points at a series that doesn't exist
      if (kind === "story" && cur.series && !seriesList.some((s) => s.slug === cur.series)) {
        seriesList = await updateList(SERIES_PATH, (l) => (l.some((s) => s.slug === cur.series) ? l : [...l, { slug: cur.series, title: cur.seriesTitle.trim(), summary: cur.seriesSummary.trim() }]),
          `Add series: ${cur.seriesTitle.trim()}`);
      }

      const list = await readList(indexPath(kind));
      const slug = cur.slug || await freeSlug(kind, title, list);
      const now = new Date().toISOString();
      const published = cur.published || now;
      const html = mapHtml(quill.root.innerHTML, toSiteUrl);
      const delta = mapDelta(quill.getContents(), toSiteUrl);
      const words = countWords();
      const summary = summaryEl.value.trim();

      const meta = { slug, title, summary, published, updated: now, words };
      if (kind === "story") { if (cur.series) { meta.series = cur.series; meta.chapter = cur.chapter; } }
      else {
        const sub = subtitleEl.value.trim();
        if (sub) meta.subtitle = sub;
        meta.categories = cur.categories.slice();
      }
      const doc = { ...meta, ...(kind === "article" && cur.extra && cur.extra.source ? { source: cur.extra.source } : {}), html, delta };

      const path = filePath(kind, slug);
      const existing = await getFile(path);
      await putFile(path, JSON.stringify(doc), `${verb} ${label.toLowerCase()}: ${title}`, existing && existing.sha);

      remote[kind] = await updateList(indexPath(kind), (l) => {
        const i = l.findIndex((s) => s.slug === slug);
        if (i >= 0) l[i] = meta; else l.push(meta);
        return l;
      }, `${verb} ${label.toLowerCase()} index: ${title}`, byNewest);

      cur.slug = slug; cur.published = published; cur.changed = false; cur.pendingSeries = false;
      saveLocal({ quiet: true });
      toast(`${verb === "Publish" ? "Published" : "Updated"}. GitHub Pages usually shows it on the site within a minute or two.`, "ok");
    } catch (err) {
      toast(listProblem(err) + " Your draft is still saved here.", "err");
    } finally {
      setBusy(false);
      renderList();
    }
  });

  $("#m-unpublish").addEventListener("click", async () => {
    closeMenu();
    if (busy || !cur || !cur.slug) return;
    if (!confirm(`Take “${cur.title || "this"}” off the public site? Your local draft is kept, and you can publish it again later.`)) return;
    setBusy(true, "Unpublishing…");
    try {
      const kind = cur.kind, slug = cur.slug, label = KINDS[kind].label.toLowerCase();
      const f = await getFile(filePath(kind, slug));
      if (f) await deleteFile(filePath(kind, slug), f.sha, `Unpublish ${label}: ${cur.title}`);
      remote[kind] = await updateList(indexPath(kind), (l) => l.filter((s) => s.slug !== slug), `Unpublish ${label} index: ${cur.title}`, byNewest);
      cur.slug = null; cur.published = null; cur.changed = false;
      saveLocal({ quiet: true });
      toast("Unpublished. It stays here as a draft.", "ok");
    } catch (err) {
      toast(listProblem(err), "err");
    } finally { setBusy(false); renderList(); }
  });

  $("#m-delete").addEventListener("click", () => {
    closeMenu();
    if (!cur || !confirm(`Delete this local draft${cur.slug ? " copy? (The published version stays on the site.)" : "? This can't be undone."}`)) return;
    clearTimeout(autosave);
    delete drafts[cur.id]; persist();
    cur = null;
    const next = Object.values(drafts).sort((a, b) => b.updated - a.updated)[0];
    if (next) { cur = next; loadIntoUI(); } else newOne("story");
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
.ql-editor{padding:0;overflow:visible;height:auto}.ql-editor p{margin:0 0 1em}.ql-editor img{max-width:100%}
.ql-font-sans{font-family:system-ui,sans-serif}.ql-font-serif{font-family:Georgia,serif}
.ql-font-palatino{font-family:"Palatino Linotype",Palatino,serif}.ql-font-garamond{font-family:Garamond,serif}
.ql-font-monospace{font-family:"Courier New",monospace}.ql-font-cursive{font-family:"Segoe Script","Brush Script MT",cursive}
</style></head><body class="ql-snow"><h1>${esc(title)}</h1><div class="ql-editor">${body}</div></body></html>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
    a.download = (slugify(title) || "draft") + ".html";
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
      const [stories, articles, series] = await Promise.all([readList(indexPath("story")), readList(indexPath("article")), readList(SERIES_PATH)]);
      remote = { story: stories.sort(byNewest), article: articles.sort(byNewest) };
      seriesList = series;
      if (announce) toast("Lists refreshed.", "ok");
    } catch (err) {
      toast("Couldn't load what's published: " + listProblem(err), "err");
    }
    renderList();
    renderMeta();
  }

  /* ───────── lock / unlock ───────── */
  function lock() { document.body.classList.add("locked"); }
  let started = false;
  function unlock() {
    document.body.classList.remove("locked");
    if (started) { refreshRemote(); return; }
    started = true;
    const lastId = store.getJSON(K.cur);
    cur = (lastId && drafts[lastId]) || Object.values(drafts).sort((a, b) => b.updated - a.updated)[0] || newDraft("story");
    loadIntoUI();
    refreshRemote();
  }

  window.addEventListener("pagehide", () => { if (cur && !document.body.classList.contains("locked")) saveLocal({ quiet: true }); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && cur && !document.body.classList.contains("locked")) saveLocal({ quiet: true }); });

  /* ───────── boot ───────── */
  if (getToken() && cfg.owner && cfg.repo) unlock();
})();
