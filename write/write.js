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
  const GALLERY_PATH = "gallery/index.json";
  const RESERVED = new Set(["index", "series"]);
  const K = {
    drafts: "atk.drafts.v1",
    cfg: "atk.gh.cfg.v1",
    tok: "atk.gh.token.v1",
    cur: "atk.current.v1",
    ok: "atk.editor.ok",
  };

  /* Password gate. Only a salted, slow hash is stored here, never the password.
     This keeps casual visitors out of the editor UI; it is not real security (anyone can
     read this file). What actually protects the site is the GitHub token, which is needed
     to publish and is never stored in the repo. */
  const PASS = {
    salt: "atk-write-v1:35ae82797929880a57e14d88",
    hash: "344e03c5b181d10d7ee195f5a2b5a25b1d219cbe31d92c861eddc7b6611daf35",
    iterations: 200000,
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
  const isUnlocked = () => { try { return (sessionStorage.getItem(K.ok) || localStorage.getItem(K.ok)) === PASS.hash; } catch { return false; } };
  const setUnlocked = (remember) => { try { sessionStorage.removeItem(K.ok); localStorage.removeItem(K.ok); (remember ? localStorage : sessionStorage).setItem(K.ok, PASS.hash); } catch {} };
  const clearUnlocked = () => { try { sessionStorage.removeItem(K.ok); localStorage.removeItem(K.ok); } catch {} };

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
  const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
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
  const blobToB64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("Couldn't read the image file."));
    r.readAsDataURL(blob);
  });

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
    if (status === 401) return "GitHub rejected the token (expired or revoked). Use ⋯ → Connect to GitHub to enter a new one.";
    if (status === 403) return "GitHub denied that. The token needs “Contents: Read and write” on this repo (or you've hit a rate limit).";
    if (status === 404) return "GitHub couldn't find that. Check the owner, repo and branch, and that the token can access the repo.";
    if (status === 409 || status === 422) return "GitHub reported a conflict (something changed at the same time). Try again.";
    return "GitHub returned an error (" + status + ").";
  }
  const contentsPath = (p) => "/contents/" + p.split("/").map(encodeURIComponent).join("/");

  /* Reading works without a token: it uses the published site itself. */
  async function getPublic(path) {
    let res;
    try { res = await fetch(ROOT + path + "?_=" + Date.now(), { cache: "no-store" }); }
    catch { const e = new Error("Couldn't reach the site. Check your connection."); e.status = 0; throw e; }
    if (res.status === 404) return null;
    if (!res.ok) { const e = new Error("The site returned an error (" + res.status + ")."); e.status = res.status; throw e; }
    return { sha: null, text: await res.text() };
  }
  async function getFile(path) {
    if (!getToken()) return getPublic(path);
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
  async function getSha(path) {
    try { return (await gh(`${contentsPath(path)}?ref=${encodeURIComponent(cfg.branch)}`)).sha; }
    catch (e) { if (e.status === 404) return null; throw e; }
  }
  const putB64 = (path, content, message, sha) =>
    gh(contentsPath(path), { method: "PUT", body: { message, content, branch: cfg.branch, ...(sha ? { sha } : {}) } });
  const putFile = (path, text, message, sha) => putB64(path, b64(text), message, sha);
  const deleteFile = (path, sha, message) =>
    gh(contentsPath(path), { method: "DELETE", body: { message, sha, branch: cfg.branch } });

  const byNewest = (a, b) => new Date(b.published) - new Date(a.published);
  const byAdded = (a, b) => new Date(b.added) - new Date(a.added);
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

  /* ───────── password gate ───────── */
  const gateForm = $("#gate-form");
  const gErr = $("#g-error");

  async function hashPassword(pw) {
    if (!(window.crypto && crypto.subtle)) throw new Error("This browser can't check the password here (it needs a secure https page).");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(PASS.salt), iterations: PASS.iterations, hash: "SHA-256" }, key, 256);
    return [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  gateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#g-submit"), input = $("#g-password");
    gErr.hidden = true; btn.disabled = true; btn.textContent = "Checking…";
    try {
      const ok = (await hashPassword(input.value)) === PASS.hash;
      if (!ok) {
        await new Promise((r) => setTimeout(r, 700));   // slow down guessing a little
        gErr.textContent = "That password isn't right.";
        gErr.hidden = false; input.select();
        return;
      }
      input.value = "";
      setUnlocked($("#g-remember").checked);
      enterEditor();
    } catch (err) {
      gErr.textContent = err.message; gErr.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Unlock";
    }
  });

  /* ───────── GitHub connection: only asked for when something needs to be published ───────── */
  const dlg = $("#connect-dialog"), cErr = $("#c-error");
  let connectResolve = null;
  function openConnectDialog() {
    $("#c-owner").value = cfg.owner || DEFAULTS.owner;
    $("#c-repo").value = cfg.repo || DEFAULTS.repo;
    $("#c-branch").value = cfg.branch || DEFAULTS.branch;
    $("#c-token").value = "";
    cErr.hidden = true;
    return new Promise((resolve) => {
      connectResolve = resolve;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      $("#c-token").focus();
    });
  }
  function closeConnect(result) {
    const done = connectResolve; connectResolve = null;
    if (dlg.open) dlg.close();
    if (done) done(result);
  }
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeConnect(false); });
  $("#c-cancel").addEventListener("click", () => closeConnect(false));
  $("#connect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = { owner: $("#c-owner").value.trim(), repo: $("#c-repo").value.trim(), branch: $("#c-branch").value.trim() };
    const token = $("#c-token").value.trim();
    const btn = $("#c-submit");
    cErr.hidden = true; btn.disabled = true; btn.textContent = "Checking…";
    const prev = cfg; cfg = next;
    const prevTok = getToken(); setToken(token, $("#c-remember").checked);
    let step = "repo";
    try {
      const repo = await gh("");
      if (repo && repo.permissions && repo.permissions.push === false) throw new Error("This token can read the repository but not write to it.");
      step = "branch";
      await gh("/branches/" + encodeURIComponent(next.branch));
      store.setJSON(K.cfg, next);
      $("#c-token").value = "";
      renderConnectState();
      closeConnect(true);
      refreshRemote();      // now with fresh data straight from GitHub
    } catch (err) {
      cfg = prev;
      if (prevTok) setToken(prevTok, true); else clearToken();
      cErr.textContent = err.status === 404 && step === "branch" ? `The branch “${next.branch}” doesn't exist in that repository.` : err.message;
      cErr.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Connect";
    }
  });
  async function ensureConnected() {
    if (getToken()) return true;
    return openConnectDialog();
  }
  function renderConnectState() {
    $("#m-connect").textContent = getToken() ? "Disconnect GitHub" : "Connect to GitHub…";
  }

  /* ───────── editor setup ───────── */
  if (!window.Quill) {
    gErr.textContent = "The editor library didn't load (blocked or offline). Reload the page.";
    gErr.hidden = false;
    return;
  }

  const Font = Quill.import("formats/font");
  // no font class = Calibri, the site's reading font
  Font.whitelist = ["calibri-light", "times", "cambria", "serif", "sans", "palatino", "garamond", "monospace", "cursive"];
  Quill.register(Font, true);
  const Size = Quill.import("attributors/style/size");
  Size.whitelist = ["12px", "14px", "16px", "18px", "20px", "22px", "24px", "28px", "36px", "48px", "64px"];
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

  // Ctrl+E centers the current paragraph (press again to undo), like Word
  quill.keyboard.addBinding({ key: "e", shortKey: true }, (range) => {
    quill.format("align", quill.getFormat(range).align === "center" ? false : "center", "user");
    return false;
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
  let gal = [];                                 // gallery/index.json
  let cur = null;                               // the open draft
  let previewOn = false;
  let busy = false;
  let savedAt = null;
  let mode = "write";

  const normalize = (d) => ({
    kind: "story", subtitle: "", series: "", pendingSeries: false, seriesTitle: "", seriesSummary: "", chapter: null, categories: [], pinned: false, extra: {},
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
    if (mode === "gallery") { el.textContent = override || `${gal.length} image${gal.length === 1 ? "" : "s"} in the gallery`; return; }
    if (override) { el.textContent = override; return; }
    if (!cur) { el.textContent = ""; return; }
    const saved = savedAt ? "Saved on this device " + fmtTime(savedAt) : "Not saved yet";
    const live = cur.slug ? (cur.changed ? "Live version is older than this draft" : "Live on the site") : "Not published";
    el.textContent = saved + " · " + live;
  }

  /* ───────── type / series / categories (writing) ───────── */
  const NEW_SERIES = "__new__";
  const seriesSelect = $("#series-select"), chapterEl = $("#chapter");

  const nextChapter = (seriesSlug) => {
    const nums = remote.story.filter((s) => s.series === seriesSlug).map((s) => Number(s.chapter) || 0);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  };
  function uniqueNames(lists) {
    const seen = new Map();
    for (const n of lists.flat()) { const k = String(n).trim(); if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k); }
    return [...seen.values()];
  }
  // site-data.js declares SITE with `const`, so it is a global name but not a property of window
  const SITE_CFG = (typeof SITE !== "undefined" && SITE) || {};
  const knownCategories = () => uniqueNames([SITE_CFG.categories || [], ...remote.article.map((a) => a.categories || []), cur ? cur.categories : []]);
  const has = (list, name) => list.some((x) => x.toLowerCase() === name.toLowerCase());

  function renderMeta() {
    if (!cur) return;
    const isArticle = cur.kind === "article";
    $$('input[name="kind"]').forEach((r) => { r.checked = r.value === cur.kind; r.disabled = !!cur.slug; });
    $("#kind-hint").textContent = cur.slug ? "Already published, so its type is fixed." : "";
    $("#story-meta").hidden = isArticle;
    $("#article-meta").hidden = !isArticle;
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
      `<button type="button" class="cat" data-cat="${esc(c)}" aria-pressed="${has(cur.categories, c)}">${esc(c)}</button>`).join("");
    $("#pin-article").checked = !!cur.pinned;
  }
  $("#pin-article").addEventListener("change", (e) => { if (cur) { cur.pinned = e.target.checked; onEdit(); } });

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
    if (!has(cur.categories, existing || name)) cur.categories.push(existing || name);
    input.value = ""; onEdit(); renderMeta();
  }
  $("#btn-add-cat").addEventListener("click", addCategory);
  $("#new-cat").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } });

  /* ───────── list + open/new/delete ───────── */
  function renderChrome() {
    $("#btn-publish").textContent = cur && cur.slug ? "Update" : "Publish";
    $("#m-unpublish").disabled = !(cur && cur.slug);
    renderMeta();
    renderStatus();
    renderFoot();
  }

  const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/><path d="M9 7V4h6v3"/></svg>';

  function renderList() {
    const local = Object.values(drafts).sort((a, b) => b.updated - a.updated);
    // a brand-new empty draft isn't saved yet, but should still show as the open item
    if (cur && !drafts[cur.id]) local.unshift(cur);
    const taken = new Set(local.filter((d) => d.slug).map((d) => d.kind + ":" + d.slug));
    const remoteOnly = ["article", "story"].flatMap((k) => remote[k].map((s) => ({ ...s, kind: k })))
      .filter((s) => !taken.has(s.kind + ":" + s.slug)).sort(byNewest);

    const status = (d) => !d.slug ? '<span class="badge">Draft</span>' : d.changed ? '<span class="badge edited">Live · edited</span>' : '<span class="badge live">Live</span>';
    const kindBadge = (k) => `<span class="badge kind">${KINDS[k].label}</span>`;
    const item = (d) => `<div class="item-row">
      <button type="button" class="item${cur && d.id === cur.id ? " active" : ""}" data-id="${esc(d.id)}">
        <span class="item-title">${esc(d.title.trim() || "Untitled")}</span>
        <span class="item-meta">${kindBadge(d.kind)}${status(d)}${d.slug && d.pinned ? '<span class="badge pin">Pinned</span>' : ""}<span>${esc(fmtDate(d.updated))}</span></span></button>
      <button type="button" class="item-del" data-del="${esc(d.id)}" title="Delete this draft" aria-label="Delete draft: ${esc(d.title.trim() || "Untitled")}">${TRASH}</button></div>`;
    const rItem = (s) => `<div class="item-row"><button type="button" class="item" data-kind="${s.kind}" data-slug="${esc(s.slug)}">
      <span class="item-title">${esc(s.title || "Untitled")}</span>
      <span class="item-meta">${kindBadge(s.kind)}<span class="badge live">Live</span>${s.pinned ? '<span class="badge pin">Pinned</span>' : ""}<span>${esc(fmtDate(s.published))}</span></span></button></div>`;

    $("#story-items").innerHTML =
      (local.length ? `<div class="group-label">Drafts &amp; edits</div>${local.map(item).join("")}` : "") +
      (remoteOnly.length ? `<div class="group-label">Published</div>${remoteOnly.map(rItem).join("")}` : "");
    $("#side-note").textContent = mode === "gallery"
      ? "Gallery images are published straight away (there are no drafts)."
      : `Drafts stay in this browser. Publishing commits to ${cfg.owner}/${cfg.repo}.`;
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

  function deleteDraft(id) {
    const d = cur && cur.id === id ? cur : drafts[id];
    if (!d) return;
    const name = (d.title || "").trim() || "Untitled";
    const msg = d.slug
      ? `Delete your local copy of “${name}”? The published version stays on the site.`
      : `Delete the draft “${name}”? This can't be undone.`;
    if (!confirm(msg)) return;
    clearTimeout(autosave);
    delete drafts[id]; persist();
    if (cur && cur.id === id) {
      cur = null;
      const next = Object.values(drafts).sort((a, b) => b.updated - a.updated)[0];
      if (next) { cur = next; loadIntoUI(); } else newOne(d.kind);
    } else renderList();
    toast("Draft deleted.");
  }

  async function openRemote(kind, slug) {
    if (busy) return;
    leaveCurrent();
    setBusy(true, "Opening…");
    try {
      const f = await getFile(filePath(kind, slug));
      if (!f) throw new Error(`That ${KINDS[kind].label.toLowerCase()}'s file is missing from the site.`);
      const s = JSON.parse(f.text);
      const delta = mapDelta(s.delta && s.delta.ops ? s.delta : quill.clipboard.convert({ html: mapHtml(String(s.html || ""), toEditorUrl) }), toEditorUrl);
      const d = normalize({
        ...newDraft(kind), title: s.title || "", subtitle: s.subtitle || "", summary: s.summary || "", delta,
        slug: s.slug || slug, published: s.published || null,
        series: s.series || "", chapter: s.chapter || null,
        categories: Array.isArray(s.categories) ? s.categories : [],
        pinned: kind === "article" && !!(remote.article.find((a) => a.slug === slug) || {}).pinned,
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
    const del = e.target.closest(".item-del");
    if (del) { deleteDraft(del.dataset.del); return; }
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

  /* ───────── save / publish / unpublish / export ───────── */
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
    if (mode === "write" && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); $("#btn-save").click(); }
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
    if (!(await ensureConnected())) { toast("Publishing needs a GitHub connection. Your draft is saved here.", "err"); return; }

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
      const sub = subtitleEl.value.trim();
      if (sub) meta.subtitle = sub;
      if (kind === "story") { if (cur.series) { meta.series = cur.series; meta.chapter = cur.chapter; } }
      else { meta.categories = cur.categories.slice(); if (cur.pinned) meta.pinned = true; }
      const { pinned: _pinned, ...docMeta } = meta;   // "pinned" lives only in the index, so un-pinning never has to touch other files
      const doc = { ...docMeta, ...(kind === "article" && cur.extra && cur.extra.source ? { source: cur.extra.source } : {}), html, delta };

      const path = filePath(kind, slug);
      const existing = await getFile(path);
      await putFile(path, JSON.stringify(doc), `${verb} ${label.toLowerCase()}: ${title}`, existing && existing.sha);

      remote[kind] = await updateList(indexPath(kind), (l) => {
        if (meta.pinned) l.forEach((s) => { if (s.slug !== slug) delete s.pinned; });   // only one pinned article
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
    if (!(await ensureConnected())) return;
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

  $("#m-delete").addEventListener("click", () => { closeMenu(); if (cur) deleteDraft(cur.id); });

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
  $("#m-connect").addEventListener("click", async () => {
    closeMenu();
    if (getToken()) {
      if (!confirm("Disconnect GitHub on this device? Your drafts stay here, and you can still write. You'll be asked for the token again next time you publish.")) return;
      clearToken(); renderConnectState(); toast("Disconnected from GitHub.");
    } else await ensureConnected();
  });
  $("#m-lock").addEventListener("click", () => {
    closeMenu();
    leaveCurrent();
    clearUnlocked();
    lock();
  });

  const menu = $(".menu");
  function closeMenu() { menu.open = false; }
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  async function refreshRemote(announce) {
    try {
      const [stories, articles, series, gallery] = await Promise.all([
        readList(indexPath("story")), readList(indexPath("article")), readList(SERIES_PATH), readList(GALLERY_PATH)]);
      remote = { story: stories.sort(byNewest), article: articles.sort(byNewest) };
      seriesList = series;
      gal = gallery.sort(byAdded);
      if (announce) toast("Lists refreshed.", "ok");
    } catch (err) {
      toast("Couldn't load what's published: " + listProblem(err), "err");
    }
    renderList();
    renderMeta();
    renderGalleryList();
    renderStatus();
  }

  /* ═════════ gallery ═════════ */
  const MAX_EDGE = 2400, THUMB_EDGE = 640, MAX_BYTES = 25 * 1024 * 1024;
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  let gcur = null;      // { slug, entry, file, categories[], tags[] }
  let gbusy = false;
  const gErrEl = $("#ge-error");
  const gFields = { title: $("#g-title"), caption: $("#g-caption"), date: $("#g-date"), location: $("#g-location"), details: $("#g-details"), alt: $("#g-alt") };
  let previewUrl = null;

  const normTag = (s) => String(s).trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 40);
  const knownGalleryCategories = () => uniqueNames([SITE_CFG.galleryCategories || [], ...gal.map((g) => g.categories || []), gcur ? gcur.categories : []]);

  function renderGalleryChips() {
    if (!gcur) return;
    $("#g-cat-chips").innerHTML = knownGalleryCategories().map((c) =>
      `<button type="button" class="cat" data-cat="${esc(c)}" aria-pressed="${has(gcur.categories, c)}">${esc(c)}</button>`).join("");
    $("#g-tag-chips").innerHTML = gcur.tags.length
      ? gcur.tags.map((t) => `<button type="button" class="cat tag" data-tag="${esc(t)}" aria-pressed="true" title="Click to remove">#${esc(t)}<span class="x" aria-hidden="true">×</span></button>`).join("")
      : '<span class="meta-hint">No tags yet</span>';
    $("#g-tag-list").innerHTML = uniqueNames(gal.map((g) => g.tags || [])).map((t) => `<option value="${esc(t)}">`).join("");
  }
  $("#g-cat-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".cat"); if (!b || !gcur) return;
    const i = gcur.categories.findIndex((x) => x.toLowerCase() === b.dataset.cat.toLowerCase());
    if (i >= 0) gcur.categories.splice(i, 1); else gcur.categories.push(b.dataset.cat);
    renderGalleryChips();
  });
  $("#g-tag-chips").addEventListener("click", (e) => {
    const b = e.target.closest(".cat"); if (!b || !gcur || !b.dataset.tag) return;
    gcur.tags = gcur.tags.filter((t) => t.toLowerCase() !== b.dataset.tag.toLowerCase());
    renderGalleryChips();
  });
  function addGalleryCategory() {
    const input = $("#g-new-cat"), name = input.value.trim().replace(/\s+/g, " ");
    if (!name || !gcur) return;
    if (!slugify(name)) { toast("Use letters or numbers in the category name.", "err"); return; }
    const existing = knownGalleryCategories().find((c) => c.toLowerCase() === name.toLowerCase());
    if (!has(gcur.categories, existing || name)) gcur.categories.push(existing || name);
    input.value = ""; renderGalleryChips();
  }
  function addGalleryTags() {
    const input = $("#g-new-tag"); if (!gcur) return;
    for (const raw of input.value.split(",")) {
      const t = normTag(raw);
      if (t && slugify(t) && !has(gcur.tags, t)) gcur.tags.push(t);
    }
    input.value = ""; renderGalleryChips();
  }
  $("#g-add-cat").addEventListener("click", addGalleryCategory);
  $("#g-new-cat").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGalleryCategory(); } });
  $("#g-add-tag").addEventListener("click", addGalleryTags);
  $("#g-new-tag").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGalleryTags(); } });

  function showGalleryError(msg) { gErrEl.textContent = msg; gErrEl.hidden = !msg; }
  function setPreviewImage(src, info) {
    const box = $("#g-preview");
    if (!src) { box.hidden = true; return; }
    $("#g-preview-img").src = src; $("#g-preview-info").textContent = info || ""; box.hidden = false;
  }
  function revokePreview() { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } }

  function fillGalleryForm() {
    const e = (gcur && gcur.entry) || {};
    gFields.title.value = e.title || ""; gFields.caption.value = e.caption || ""; gFields.date.value = e.date || "";
    gFields.location.value = e.location || ""; gFields.details.value = e.details || ""; gFields.alt.value = e.alt || "";
    $("#g-keep").checked = false; $("#g-file").value = ""; $("#g-pin").checked = !!e.pinned;
    revokePreview();
    if (gcur && gcur.entry) setPreviewImage(ROOT + e.thumb, `${e.width || "?"} × ${e.height || "?"} · Choose a file below only if you want to replace the image.`);
    else setPreviewImage(null);
    $("#ge-h").textContent = gcur && gcur.slug ? "Edit gallery image" : "Add to the gallery";
    $("#file-hint").textContent = gcur && gcur.slug ? "Replace the image file (optional)" : "Choose an image (JPEG, PNG, WebP or GIF)";
    $("#g-publish").textContent = gcur && gcur.slug ? "Save changes" : "Upload & publish";
    $("#g-remove").hidden = !(gcur && gcur.slug);
    showGalleryError("");
    renderGalleryChips();
  }
  function newImage() { gcur = { slug: null, entry: null, file: null, categories: [], tags: [] }; fillGalleryForm(); renderGalleryList(); gFields.title.focus(); }
  function openImage(slug) {
    const entry = gal.find((g) => g.slug === slug); if (!entry) return;
    gcur = { slug, entry, file: null, categories: (entry.categories || []).slice(), tags: (entry.tags || []).slice() };
    fillGalleryForm(); renderGalleryList(); window.scrollTo(0, 0);
  }

  function renderGalleryList() {
    $("#gallery-items").innerHTML = gal.length
      ? `<div class="group-label">In the gallery</div>` + gal.map((g) => `<div class="item-row"><button type="button" class="item gitem${gcur && gcur.slug === g.slug ? " active" : ""}" data-gslug="${esc(g.slug)}">
          <img class="gthumb" src="${esc(ROOT + g.thumb)}" alt="" loading="lazy">
          <span><span class="item-title">${esc(g.title)}</span><span class="item-meta">${g.pinned ? '<span class="badge pin">Pinned</span>' : ""}<span>${esc(fmtDate(g.added))}</span></span></span></button></div>`).join("")
      : '<p class="side-note dim">Nothing in the gallery yet.</p>';
  }
  $("#gallery-items").addEventListener("click", (e) => {
    const b = e.target.closest(".gitem"); if (!b) return;
    document.body.classList.remove("side-open"); openImage(b.dataset.gslug);
  });
  $("#btn-new-image").addEventListener("click", () => { document.body.classList.remove("side-open"); newImage(); });

  /* decoding + resizing happen here, in the browser, before anything is uploaded */
  async function decodeImage(file) {
    if (window.createImageBitmap) {
      try { const b = await createImageBitmap(file, { imageOrientation: "from-image" }); return { src: b, width: b.width, height: b.height, close: () => b.close && b.close() }; } catch { /* fall back */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't an image this browser can read.")); i.src = url; });
      return { src: img, width: img.naturalWidth, height: img.naturalHeight, close() {} };
    } finally { URL.revokeObjectURL(url); }
  }
  function canvasBlob(dec, w, h, mime, quality, bg) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.imageSmoothingQuality = "high"; g.drawImage(dec.src, 0, 0, w, h);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("This browser couldn't prepare that image."))), mime, quality));
  }
  async function processImage(file, keepOriginal) {
    const dec = await decodeImage(file);
    try {
      let blob = file, w = dec.width, h = dec.height;
      // GIFs are kept as-is (re-encoding would drop the animation)
      if (!keepOriginal && file.type !== "image/gif") {
        const s = Math.min(1, MAX_EDGE / Math.max(dec.width, dec.height));
        w = Math.round(dec.width * s); h = Math.round(dec.height * s);
        blob = await canvasBlob(dec, w, h, file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg", 0.9);
      }
      if (blob.size > MAX_BYTES) throw new Error(`That image is ${fmtBytes(blob.size)}, over the 25 MB limit. Try a smaller file.`);
      const ts = Math.min(1, THUMB_EDGE / Math.max(dec.width, dec.height));
      const thumb = await canvasBlob(dec, Math.max(1, Math.round(dec.width * ts)), Math.max(1, Math.round(dec.height * ts)), "image/jpeg", 0.82, "#0b0d10");
      return { blob, ext: EXT[file.type], width: w, height: h, thumb };
    } finally { dec.close(); }
  }

  $("#g-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file || !gcur) return;
    showGalleryError("");
    if (!EXT[file.type]) { showGalleryError("Please choose a JPEG, PNG, WebP or GIF image."); e.target.value = ""; return; }
    gcur.file = file;
    revokePreview(); previewUrl = URL.createObjectURL(file);
    setPreviewImage(previewUrl, `${file.name} · ${fmtBytes(file.size)}`);
    try {
      const dec = await decodeImage(file);
      setPreviewImage(previewUrl, `${file.name} · ${dec.width} × ${dec.height} · ${fmtBytes(file.size)}`);
      dec.close();
    } catch (err) { showGalleryError(err.message); }
    if (!gFields.title.value.trim()) gFields.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
  });

  function setGBusy(on, label) {
    gbusy = on;
    $("#g-publish").disabled = on; $("#g-remove").disabled = on; $("#btn-new-image").disabled = on;
    if (on) $("#g-publish").textContent = label;
    else $("#g-publish").textContent = gcur && gcur.slug ? "Save changes" : "Upload & publish";
  }

  async function freeGallerySlug(title, list) {
    const base = slugify(title) || "image";
    const used = new Set(list.map((g) => g.slug));
    for (let n = 1; n < 50; n++) {
      const cand = n === 1 ? base : `${base}-${n}`;
      if (used.has(cand)) continue;
      if (!(await getSha(`gallery/thumbs/${cand}.jpg`))) return cand;
    }
    throw new Error("Couldn't find a free name for this image. Try a different title.");
  }

  $("#g-publish").addEventListener("click", async () => {
    if (gbusy || !gcur) return;
    const title = gFields.title.value.trim();
    if (!title) { showGalleryError("Give the image a title."); gFields.title.focus(); return; }
    if (!gcur.slug && !gcur.file) { showGalleryError("Choose an image to upload."); return; }
    showGalleryError("");
    if (!(await ensureConnected())) { showGalleryError("Publishing needs a GitHub connection."); return; }

    const editing = !!gcur.slug;
    setGBusy(true, editing ? "Saving…" : "Uploading…");
    try {
      let list = await readList(GALLERY_PATH);
      const slug = gcur.slug || await freeGallerySlug(title, list);
      const entry = gcur.entry ? { ...gcur.entry } : { added: new Date().toISOString() };
      const oldFile = gcur.entry && gcur.entry.file;

      if (gcur.file) {
        setGBusy(true, "Preparing image…");
        const p = await processImage(gcur.file, $("#g-keep").checked);
        const imgPath = `gallery/images/${slug}.${p.ext}`, thumbPath = `gallery/thumbs/${slug}.jpg`;
        setGBusy(true, "Uploading image…");
        await putB64(imgPath, await blobToB64(p.blob), `Upload gallery image: ${title}`, await getSha(imgPath));
        setGBusy(true, "Uploading thumbnail…");
        await putB64(thumbPath, await blobToB64(p.thumb), `Upload gallery thumbnail: ${title}`, await getSha(thumbPath));
        Object.assign(entry, { file: imgPath, thumb: thumbPath, width: p.width, height: p.height });
        if (oldFile && oldFile !== imgPath) { const sha = await getSha(oldFile); if (sha) await deleteFile(oldFile, sha, `Replace gallery image: ${title}`); }
      }

      const optional = { caption: gFields.caption.value.trim(), alt: gFields.alt.value.trim(), date: gFields.date.value, location: gFields.location.value.trim(), details: gFields.details.value.trim() };
      for (const k of Object.keys(optional)) { if (optional[k]) entry[k] = optional[k]; else delete entry[k]; }
      Object.assign(entry, { slug, title, categories: gcur.categories.slice(), tags: gcur.tags.slice() });
      const pinned = $("#g-pin").checked;
      if (pinned) entry.pinned = true; else delete entry.pinned;

      setGBusy(true, "Saving details…");
      gal = await updateList(GALLERY_PATH, (l) => {
        if (pinned) l.forEach((g) => { if (g.slug !== slug) delete g.pinned; });   // only one pinned image
        const i = l.findIndex((g) => g.slug === slug); if (i >= 0) l[i] = entry; else l.push(entry);
        return l;
      }, `${editing ? "Update" : "Add"} gallery image: ${title}`, byAdded);
      gcur = { slug, entry, file: null, categories: entry.categories.slice(), tags: entry.tags.slice() };
      fillGalleryForm(); renderGalleryList(); renderStatus();
      toast(`${editing ? "Saved" : "Uploaded"}. GitHub Pages usually shows it on the site within a minute or two.`, "ok");
    } catch (err) {
      showGalleryError(listProblem(err));
    } finally { setGBusy(false); }
  });

  $("#g-remove").addEventListener("click", async () => {
    if (gbusy || !gcur || !gcur.slug) return;
    if (!(await ensureConnected())) return;
    if (!confirm(`Remove “${gcur.entry.title}” from the gallery? The image files are deleted from the site. This can't be undone (apart from restoring the commit on GitHub).`)) return;
    setGBusy(true, "Removing…");
    try {
      const e = gcur.entry;
      for (const p of [e.file, e.thumb]) { if (!p) continue; const sha = await getSha(p); if (sha) await deleteFile(p, sha, `Remove gallery image: ${e.title}`); }
      gal = await updateList(GALLERY_PATH, (l) => l.filter((g) => g.slug !== e.slug), `Remove gallery image index: ${e.title}`, byAdded);
      toast("Removed from the gallery.", "ok");
      newImage(); renderStatus();
    } catch (err) {
      showGalleryError(listProblem(err));
    } finally { setGBusy(false); }
  });

  /* ───────── writing / gallery mode ───────── */
  function setMode(next) {
    mode = next;
    document.body.classList.toggle("mode-gallery", next === "gallery");
    $$('input[name="mode"]').forEach((r) => { r.checked = r.value === next; });
    $("#story-items").hidden = next === "gallery";
    $("#gallery-items").hidden = next !== "gallery";
    $("#btn-new-image").hidden = next !== "gallery";
    $("#gallery-editor").hidden = next !== "gallery";
    if (next === "gallery") { leaveCurrent(); if (!gcur) newImage(); renderGalleryList(); }
    else { window.scrollTo(0, 0); }
    renderList(); renderStatus();
  }
  $$('input[name="mode"]').forEach((r) => r.addEventListener("change", () => { if (r.checked) setMode(r.value); }));

  /* ───────── lock / enter ───────── */
  function lock() { document.body.classList.add("locked"); $("#g-password").focus(); }
  let started = false;
  function enterEditor() {
    document.body.classList.remove("locked");
    renderConnectState();
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
  if (isUnlocked()) enterEditor(); else $("#g-password").focus();
})();
