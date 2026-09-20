(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const ICONS = {
    target:  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    tool:    '<path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z"/>',
    ext:     '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.tool}</svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ───────── left: tools ───────── */
  const toolList = $("#tool-list");
  toolList.innerHTML = SITE.tools.map((t) => {
    const href = t.embed ? `#tool/${t.id}` : t.url;
    const ext  = t.embed ? "" : ' target="_blank" rel="noopener"';
    return `<a class="tool" data-tool="${esc(t.id)}" href="${esc(href)}"${ext}>
      ${svg(t.icon)}
      <span>
        <span class="tool-name">${esc(t.title)}${t.embed ? "" : svg("ext")}</span>
        <span class="tool-desc">${esc(t.desc)}</span>
      </span>
    </a>`;
  }).join("");

  /* ───────── right: articles ───────── */
  const postList = $("#post-list");
  const postEmpty = $("#post-empty");
  const search = $("#search");
  const topicRow = $("#topic-row");
  let activeTopic = "";

  const topics = [...new Set(SITE.posts.map((p) => p.topic))];
  topicRow.innerHTML = topics.map((t) => `<button type="button" class="topic" aria-pressed="false" data-topic="${esc(t)}">${esc(t)}</button>`).join("");

  function renderPosts() {
    const q = search.value.trim().toLowerCase();
    const list = SITE.posts.filter((p) =>
      (!activeTopic || p.topic === activeTopic) &&
      (!q || (p.title + " " + p.topic).toLowerCase().includes(q)));
    postList.innerHTML = list.map((p) => {
      const inner = `<div class="kicker"><b>${esc(p.topic)}</b><span>· ${esc(p.date)}</span><span>· ${esc(p.read)}</span></div>
        <div class="title">${esc(p.title)}</div>${p.url ? "" : '<span class="soon">Coming soon</span>'}`;
      return p.url
        ? `<a class="post-card" href="${esc(p.url)}">${inner}</a>`
        : `<div class="post-card">${inner}</div>`;
    }).join("");
    postEmpty.hidden = list.length > 0;
  }
  search.addEventListener("input", renderPosts);
  topicRow.addEventListener("click", (e) => {
    const b = e.target.closest(".topic");
    if (!b) return;
    activeTopic = activeTopic === b.dataset.topic ? "" : b.dataset.topic;
    $$(".topic", topicRow).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.topic === activeTopic)));
    renderPosts();
  });
  renderPosts();
  $("#year").textContent = new Date().getFullYear();

  /* ───────── stories (published from /write/) ───────── */
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const readTime = (words) => (words ? Math.max(1, Math.round(words / 220)) + " min read" : "");
  const metaLine = (s) => [fmtDate(s.published), readTime(s.words)].filter(Boolean).join(" · ");

  let indexPromise = null;
  function loadIndex(force) {
    if (!indexPromise || force) {
      indexPromise = fetch("stories/index.json", { cache: "no-cache" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then((list) => (Array.isArray(list) ? list : [])
          .filter((s) => s && SLUG_RE.test(s.slug) && s.slug !== "index")
          .sort((a, b) => new Date(b.published) - new Date(a.published)));
      indexPromise.catch(() => { indexPromise = null; });
    }
    return indexPromise;
  }

  // Quill's stylesheet (list markers, alignment, indents) and DOMPurify are only
  // needed to read a story, so they load the first time one is opened.
  const QUILL_CSS = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css";
  const PURIFY_JS = "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js";
  let libsPromise = null;
  function loadStoryLibs() {
    if (libsPromise) return libsPromise;
    const css = new Promise((res, rej) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = QUILL_CSS; l.onload = res; l.onerror = () => rej(new Error("css"));
      document.head.prepend(l);   // prepend so story-content.css (linked later) wins
    });
    const js = window.DOMPurify ? Promise.resolve() : new Promise((res, rej) => {
      const sc = document.createElement("script");
      sc.src = PURIFY_JS; sc.onload = res; sc.onerror = () => rej(new Error("js"));
      document.head.appendChild(sc);
    });
    libsPromise = Promise.all([css, js]).then(() => {
      DOMPurify.addHook("afterSanitizeAttributes", (n) => {
        if (n.tagName === "A" && n.getAttribute("href")) {
          n.setAttribute("target", "_blank");
          n.setAttribute("rel", "noopener noreferrer");
        }
      });
    });
    libsPromise.catch(() => { libsPromise = null; });
    return libsPromise;
  }

  const latestEl = $("#latest-story");
  function renderLatest(list, error) {
    if (error) { latestEl.hidden = true; return; }
    latestEl.hidden = false;
    if (!list.length) {
      latestEl.href = "#stories";
      $("#latest-title").textContent = "Stories are on the way";
      $("#latest-meta").textContent = "";
      return;
    }
    const s = list[0];
    latestEl.href = "#story/" + s.slug;
    latestEl.dataset.slug = s.slug;
    $("#latest-title").textContent = s.title || "Untitled";
    $("#latest-meta").textContent = metaLine(s);
  }

  function renderStoryList(list, error) {
    const box = $("#story-list");
    if (error) { box.innerHTML = '<p class="empty-note">Couldn\'t load the stories right now. Try again in a moment.</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="empty-note">No stories yet. The first one is on its way.</p>'; return; }
    box.innerHTML = list.map((s) => `<a class="post link-post story-card" href="#story/${esc(s.slug)}">
      <span class="avatar" aria-hidden="true">S</span>
      <div class="post-body">
        <div class="post-head"><strong>${esc(s.title || "Untitled")}</strong></div>
        <div class="dim story-meta">${esc(metaLine(s))}</div>
        ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
        <span class="post-go">Read story →</span>
      </div>
    </a>`).join("");
  }

  let storyToken = 0;
  async function renderStory(slug) {
    const box = $("#story-box");
    const mine = ++storyToken;
    if (!SLUG_RE.test(slug) || slug === "index") { box.innerHTML = '<p class="empty-note">That story doesn\'t exist.</p>'; return; }
    box.innerHTML = '<p class="empty-note">Loading…</p>';
    try {
      const [, res] = await Promise.all([
        loadStoryLibs(),
        fetch(`stories/${slug}.json`, { cache: "no-cache" }),
      ]);
      if (!res.ok) throw new Error(String(res.status));
      const story = await res.json();
      if (mine !== storyToken) return;

      const title = document.createElement("h1"); title.textContent = story.title || "Untitled";
      const meta = document.createElement("p"); meta.className = "dim story-meta";
      meta.textContent = metaLine(story) + (story.updated && story.updated !== story.published ? ` · Updated ${fmtDate(story.updated)}` : "");
      const body = document.createElement("div"); body.className = "story-body ql-snow";
      const inner = document.createElement("div"); inner.className = "ql-editor";
      inner.innerHTML = DOMPurify.sanitize(String(story.html || ""));
      body.appendChild(inner);
      box.replaceChildren(title, meta, body);
      document.title = (story.title || "Story") + " · " + SITE.name;
    } catch (err) {
      if (mine !== storyToken) return;
      box.innerHTML = String(err.message) === "404"
        ? '<p class="empty-note">That story doesn\'t exist (or was unpublished).</p>'
        : '<p class="empty-note">Couldn\'t load this story. Try again in a moment.</p>';
    }
  }

  // left-panel "latest story" + list, loaded once up front
  loadIndex().then(
    (list) => { renderLatest(list); renderStoryList(list); markLatest(); },
    () => { renderLatest([], true); renderStoryList([], true); }
  );
  function markLatest() {
    const hash = location.hash.replace(/^#\/?/, "");
    latestEl.classList.toggle("active", hash.startsWith("story/") && hash.slice(6) === latestEl.dataset.slug);
  }

  /* ───────── middle: hash router ───────── */
  const views = $$(".view");
  const tabs = $$(".tabs a");
  const frame = $("#tool-frame");
  const notFound = $("#not-found");
  const PAGES = ["home", "stories", "about", "goals", "contact"];

  function route() {
    const hash = location.hash.replace(/^#\/?/, "") || "home";
    let view = "", toolId = "", storySlug = "";

    if (PAGES.includes(hash)) view = hash;
    else if (hash.startsWith("tool/")) { view = "tool"; toolId = hash.slice(5); }
    else if (hash.startsWith("story/")) { view = "story"; storySlug = hash.slice(6); }
    else if (hash === "articles") { setPanel("right"); return; }

    const tool = SITE.tools.find((t) => t.id === toolId && t.embed);
    if (view === "tool" && !tool) view = "";

    views.forEach((v) => { v.hidden = v.dataset.view !== view; });
    notFound.hidden = view !== "";
    tabs.forEach((a) => {
      const on = a.dataset.tab === (view === "story" ? "stories" : view);
      a.classList.toggle("active", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
    $$(".tool", toolList).forEach((a) => a.classList.toggle("active", a.dataset.tool === toolId && !!tool));

    if (tool) {
      $("#tool-title").textContent = tool.title;
      $("#tool-newtab").href = tool.url;
      frame.title = tool.title;
      if (frame.getAttribute("src") !== tool.url) frame.src = tool.url;
    }

    if (view === "story") renderStory(storySlug);
    if (view === "stories") loadIndex().then((l) => renderStoryList(l), () => renderStoryList([], true));
    markLatest();

    document.title = (view === "tool" ? tool.title : view === "story" ? "Story" : view ? view[0].toUpperCase() + view.slice(1) : "Not found") + " · " + SITE.name;
    window.scrollTo(0, 0);
    setPanel("mid");
  }
  window.addEventListener("hashchange", route);

  /* ───────── mobile: one panel at a time ───────── */
  function setPanel(p) {
    document.body.dataset.panel = p;
    $$(".bottom-bar button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.show === p)));
    window.scrollTo(0, 0);
  }
  $$(".bottom-bar button").forEach((b) => b.addEventListener("click", () => setPanel(b.dataset.show)));
  $$("[data-panel-link]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); setPanel(a.dataset.panelLink); }));

  route();

  /* ───────── starfield ───────── */
  const canvas = $("#stars");
  const ctx = canvas.getContext("2d");
  function drawStars() {
    const dpr = window.devicePixelRatio || 1;
    const w = innerWidth, h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#03050b"); g.addColorStop(1, "#0b1020");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // seeded so stars don't jump on resize
    let s = 1337; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const n = Math.round((w * h) / 4500);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, r = rnd() * 1.2 + 0.2;
      ctx.globalAlpha = 0.25 + rnd() * 0.75;
      ctx.fillStyle = rnd() > 0.85 ? "#cfe0ff" : "#fff";
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  drawStars();
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(drawStars, 150); });
})();
