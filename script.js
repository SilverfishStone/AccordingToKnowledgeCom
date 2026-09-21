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
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /* ───────── left: tools ───────── */
  const toolList = $("#tool-list");
  toolList.innerHTML = SITE.tools.map((t) => {
    const href = t.embed ? `tool.html?id=${encodeURIComponent(t.id)}` : t.url;
    const ext  = t.embed ? "" : ' target="_blank" rel="noopener"';
    return `<a class="tool" data-tool="${esc(t.id)}" href="${esc(href)}"${ext}>
      ${svg(t.icon)}
      <span>
        <span class="tool-name">${esc(t.title)}${t.embed ? "" : svg("ext")}</span>
        <span class="tool-desc">${esc(t.desc)}</span>
      </span>
    </a>`;
  }).join("");
  $("#year").textContent = new Date().getFullYear();

  /* ───────── data (articles/, stories/ — written by /write/) ───────── */
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const RESERVED = new Set(["index", "series"]);
  const cache = new Map();
  function getJSON(path, { optional } = {}) {
    if (!cache.has(path)) {
      const p = fetch(path, { cache: "no-cache" }).then((r) => {
        if (r.status === 404 && optional) return [];
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
      cache.set(path, p);
      p.catch(() => cache.delete(path));
    }
    return cache.get(path);
  }
  const newest = (a, b) => new Date(b.published) - new Date(a.published);
  const cleanList = (l) => (Array.isArray(l) ? l : []).filter((s) => s && SLUG_RE.test(s.slug) && !RESERVED.has(s.slug));

  const loadArticles = () => getJSON("articles/index.json", { optional: true }).then((l) =>
    cleanList(l).map((a) => ({ ...a, categories: (Array.isArray(a.categories) ? a.categories : []).filter(Boolean) })).sort(newest));
  const loadStories = () => getJSON("stories/index.json", { optional: true }).then((l) => cleanList(l).sort(newest));
  const loadSeriesMeta = () => getJSON("stories/series.json", { optional: true }).then((l) =>
    (Array.isArray(l) ? l : []).filter((s) => s && SLUG_RE.test(s.slug)));

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const readTime = (words) => (words ? Math.max(1, Math.round(words / 220)) + " min read" : "");
  const metaLine = (s) => [fmtDate(s.published), readTime(s.words)].filter(Boolean).join(" · ");

  /* series: derived from each story's `series` + `chapter`, titled from stories/series.json */
  function buildSeries(stories, meta) {
    const map = new Map();
    for (const s of stories) {
      if (!s.series || !SLUG_RE.test(s.series)) continue;
      if (!map.has(s.series)) {
        const m = meta.find((x) => x.slug === s.series) || {};
        map.set(s.series, {
          slug: s.series,
          title: m.title || s.series.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          summary: m.summary || "",
          chapters: [],
        });
      }
      map.get(s.series).chapters.push(s);
    }
    for (const x of map.values()) {
      x.chapters.sort((a, b) => (a.chapter || 0) - (b.chapter || 0) || new Date(a.published) - new Date(b.published));
    }
    return map;
  }
  const chapterLabel = (s) => (s.chapter ? `Chapter ${s.chapter}` : "Chapter");
  const storyKicker = (s, series) => (s.series && series.get(s.series) ? `${series.get(s.series).title} · ${chapterLabel(s)}` : "");
  const lastPublished = (x) => Math.max(...x.chapters.map((c) => new Date(c.published).getTime()));

  /* categories: derived from the articles' `categories` */
  function buildCategories(articles) {
    const map = new Map();
    for (const a of articles) for (const name of a.categories) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, { slug, name, count: 0 });
      map.get(slug).count++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const catLink = (c) => `#articles/category/${encodeURIComponent(c.slug)}`;

  /* ───────── reader libs (loaded the first time something is opened) ───────── */
  const QUILL_CSS = "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css";
  const PURIFY_JS = "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js";
  let libsPromise = null;
  function loadReaderLibs() {
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

  /* ───────── shared bits of markup ───────── */
  const note = (msg) => `<p class="empty-note">${esc(msg)}</p>`;

  function storyEntry(s, series) {
    const kicker = storyKicker(s, series);
    return `<a class="entry" href="#story/${esc(s.slug)}">
      ${kicker ? `<span class="entry-kicker">${esc(kicker)}</span>` : ""}
      <h2>${esc(s.title || "Untitled")}</h2>
      <span class="entry-meta">${esc(metaLine(s))}</span>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
      <span class="more">Read story →</span>
    </a>`;
  }

  /* ───────── left panel: latest story ───────── */
  const latestEl = $("#latest-story");
  function markLatest() {
    const hash = location.hash.replace(/^#\/?/, "");
    latestEl.classList.toggle("active", hash.startsWith("story/") && hash.slice(6) === latestEl.dataset.slug);
  }
  Promise.all([loadStories(), loadSeriesMeta().catch(() => [])]).then(([stories, meta]) => {
    latestEl.hidden = false;
    if (!stories.length) {
      latestEl.href = "#stories";
      $("#latest-title").textContent = "Stories are on the way";
      $("#latest-meta").textContent = "";
      return;
    }
    const s = stories[0], kicker = storyKicker(s, buildSeries(stories, meta));
    latestEl.href = "#story/" + s.slug;
    latestEl.dataset.slug = s.slug;
    $("#latest-title").textContent = s.title || "Untitled";
    $("#latest-meta").textContent = [kicker, fmtDate(s.published)].filter(Boolean).join(" · ");
    markLatest();
  }, () => { latestEl.hidden = true; });

  /* ───────── right panel: latest articles + categories ───────── */
  const postList = $("#post-list"), postEmpty = $("#post-empty"), search = $("#search"), topicRow = $("#topic-row");
  let allArticles = [];
  function renderHighlights() {
    const q = search.value.trim().toLowerCase();
    const list = q
      ? allArticles.filter((a) => (a.title + " " + (a.subtitle || "") + " " + a.categories.join(" ")).toLowerCase().includes(q))
      : allArticles.slice(0, 5);
    postList.innerHTML = list.map((a) => `<a class="post-card" href="#article/${esc(a.slug)}">
      <div class="kicker">${a.categories.slice(0, 1).map((c) => `<b>${esc(c)}</b>`).join("")}<span>${esc(fmtDate(a.published))}</span></div>
      <div class="title">${esc(a.title)}</div>
    </a>`).join("");
    postEmpty.hidden = list.length > 0;
  }
  loadArticles().then((articles) => {
    allArticles = articles;
    const has = articles.length > 0;
    $("#wip-card").hidden = has;
    $("#search-wrap").hidden = !has;
    $("#articles-card").hidden = !has;
    const cats = buildCategories(articles);
    $("#topics-card").hidden = !cats.length;
    topicRow.innerHTML = cats.map((c) => `<a class="topic" href="${catLink(c)}">${esc(c.name)} <small>${c.count}</small></a>`).join("");
    renderHighlights();
  }, () => { $("#wip-card").hidden = false; });
  search.addEventListener("input", renderHighlights);

  /* ───────── views ───────── */
  async function showArticles(catSlug) {
    const list = $("#article-list"), filters = $("#article-filters");
    try {
      const articles = await loadArticles();
      const cats = buildCategories(articles);
      const cat = catSlug ? cats.find((c) => c.slug === catSlug) : null;
      filters.hidden = cats.length === 0;
      filters.innerHTML = cats.length
        ? `<a class="chip${cat ? "" : " active"}" href="#articles">All <small>${articles.length}</small></a>` +
          cats.map((c) => `<a class="chip${cat && cat.slug === c.slug ? " active" : ""}" href="${catLink(c)}">${esc(c.name)} <small>${c.count}</small></a>`).join("")
        : "";
      if (catSlug && !cat) { list.innerHTML = note("No articles in that category."); return; }
      const shown = cat ? articles.filter((a) => a.categories.some((n) => slugify(n) === cat.slug)) : articles;
      if (!shown.length) { list.innerHTML = note("No articles yet. They'll appear here as I publish them."); return; }
      list.innerHTML = shown.map((a) => `<a class="entry" href="#article/${esc(a.slug)}">
        <h2>${esc(a.title)}</h2>
        ${a.subtitle ? `<span class="entry-sub">${esc(a.subtitle)}</span>` : ""}
        <span class="entry-meta">${esc(metaLine(a))}</span>
        ${a.categories.length ? `<span class="tags">${a.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</span>` : ""}
        ${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
        <span class="more">Read article →</span>
      </a>`).join("");
    } catch {
      filters.hidden = true;
      list.innerHTML = note("Couldn't load the articles right now. Try again in a moment.");
    }
  }

  async function showStories() {
    const box = $("#stories-box");
    try {
      const [stories, meta] = await Promise.all([loadStories(), loadSeriesMeta()]);
      if (!stories.length) { box.innerHTML = note("No stories yet. The first one is on its way."); return; }
      const series = buildSeries(stories, meta);
      const standalone = stories.filter((s) => !s.series);
      let html = `<h2 class="section-h">Latest</h2>${storyEntry(stories[0], series)}`;
      if (series.size) {
        const ordered = [...series.values()].sort((a, b) => lastPublished(b) - lastPublished(a));
        html += `<h2 class="section-h">Series</h2>` + ordered.map((x) => {
          const last = x.chapters[x.chapters.length - 1];
          return `<a class="entry series-card" href="#series/${esc(x.slug)}">
            <span class="entry-kicker">Series · ${x.chapters.length} chapter${x.chapters.length === 1 ? "" : "s"}</span>
            <h2>${esc(x.title)}</h2>
            ${x.summary ? `<p>${esc(x.summary)}</p>` : ""}
            <span class="entry-meta">Latest: ${esc(chapterLabel(last))}, ${esc(last.title || "Untitled")}</span>
            <span class="more">View chapters →</span>
          </a>`;
        }).join("");
      }
      if (standalone.length) html += `<h2 class="section-h">Standalone stories</h2>` + standalone.map((s) => storyEntry(s, series)).join("");
      box.innerHTML = html;
    } catch {
      box.innerHTML = note("Couldn't load the stories right now. Try again in a moment.");
    }
  }

  async function showSeries(slug) {
    const box = $("#series-box");
    if (!SLUG_RE.test(slug)) { box.innerHTML = note("That series doesn't exist."); return; }
    try {
      const [stories, meta] = await Promise.all([loadStories(), loadSeriesMeta()]);
      const s = buildSeries(stories, meta).get(slug);
      if (!s) { box.innerHTML = note("That series doesn't exist."); return; }
      document.title = s.title + " · " + SITE.name;
      box.innerHTML = `
        <p class="eyebrow series-eyebrow">Series</p>
        <h1 class="page-title">${esc(s.title)}</h1>
        <p class="page-sub">${esc(s.summary || `${s.chapters.length} chapter${s.chapters.length === 1 ? "" : "s"}`)}</p>
        <a class="pager-btn start" href="#story/${esc(s.chapters[0].slug)}"><small>Start reading</small>${esc(chapterLabel(s.chapters[0]))}: ${esc(s.chapters[0].title || "Untitled")} →</a>
        <ol class="chapters">${s.chapters.map((c) => `<li><a href="#story/${esc(c.slug)}">
          <span class="ch-num">${esc(c.chapter || "·")}</span>
          <span class="ch-main"><strong>${esc(c.title || "Untitled")}</strong><span>${esc(metaLine(c))}</span>${c.summary ? `<span>${esc(c.summary)}</span>` : ""}</span>
        </a></li>`).join("")}</ol>`;
    } catch {
      box.innerHTML = note("Couldn't load this series right now. Try again in a moment.");
    }
  }

  function seriesNav(story, series) {
    const s = story.series && series.get(story.series);
    if (!s) return null;
    const i = s.chapters.findIndex((c) => c.slug === story.slug);
    if (i < 0) return null;
    const prev = s.chapters[i - 1], next = s.chapters[i + 1];
    const nav = document.createElement("nav");
    nav.className = "series-nav";
    nav.setAttribute("aria-label", s.title + " chapters");
    nav.innerHTML = `
      <p class="eyebrow">${esc(s.title)}</p>
      <p class="series-progress">${esc(chapterLabel(s.chapters[i]))} · ${s.chapters.length} published</p>
      <div class="pager">
        ${prev ? `<a class="pager-btn" href="#story/${esc(prev.slug)}"><small>← Previous</small>${esc(chapterLabel(prev))}: ${esc(prev.title)}</a>` : `<span class="pager-btn off"><small>← Previous</small>Start of series</span>`}
        ${next ? `<a class="pager-btn next" href="#story/${esc(next.slug)}"><small>Next →</small>${esc(chapterLabel(next))}: ${esc(next.title)}</a>` : `<span class="pager-btn off next"><small>Next →</small>End of published chapters</span>`}
      </div>
      <ol class="chapters compact">${s.chapters.map((c) => `<li${c.slug === story.slug ? ' class="current" aria-current="page"' : ""}><a href="#story/${esc(c.slug)}">
        <span class="ch-num">${esc(c.chapter || "·")}</span>
        <span class="ch-main"><strong>${esc(c.title || "Untitled")}</strong></span></a></li>`).join("")}</ol>
      <a class="back-link" href="#series/${esc(s.slug)}">All chapters of ${esc(s.title)}</a>`;
    return nav;
  }

  /* one reader for both kinds of writing */
  const DIRS = { story: "stories", article: "articles" };
  let docToken = 0;
  async function renderDoc(kind, slug) {
    const box = $(kind === "story" ? "#story-box" : "#article-box");
    const mine = ++docToken;
    if (!SLUG_RE.test(slug) || RESERVED.has(slug)) { box.innerHTML = note("That page doesn't exist."); return; }
    box.innerHTML = note("Loading…");
    try {
      const [, res, extra] = await Promise.all([
        loadReaderLibs(),
        fetch(`${DIRS[kind]}/${slug}.json`, { cache: "no-cache" }),
        kind === "story" ? Promise.all([loadStories(), loadSeriesMeta()]).catch(() => null) : null,
      ]);
      if (!res.ok) throw new Error(String(res.status));
      const doc = await res.json();
      if (mine !== docToken) return;

      const parts = [];
      const series = extra ? buildSeries(extra[0], extra[1]) : null;
      if (series) {
        const kicker = storyKicker(doc, series);
        if (kicker) {
          const k = document.createElement("a");
          k.className = "entry-kicker doc-kicker"; k.href = "#series/" + doc.series; k.textContent = kicker;
          parts.push(k);
        }
      }
      const title = document.createElement("h1"); title.textContent = doc.title || "Untitled"; parts.push(title);
      if (doc.subtitle) { const sub = document.createElement("p"); sub.className = "doc-sub"; sub.textContent = doc.subtitle; parts.push(sub); }
      const meta = document.createElement("p"); meta.className = "story-meta";
      meta.textContent = metaLine(doc) + (doc.updated && doc.updated !== doc.published && kind === "story" ? ` · Updated ${fmtDate(doc.updated)}` : "");
      parts.push(meta);
      if (kind === "article" && Array.isArray(doc.categories) && doc.categories.length) {
        const tags = document.createElement("div"); tags.className = "tags doc-tags";
        for (const name of doc.categories) {
          const a = document.createElement("a"); a.className = "tag"; a.textContent = name;
          a.href = `#articles/category/${encodeURIComponent(slugify(name))}`;
          tags.appendChild(a);
        }
        parts.push(tags);
      }
      const body = document.createElement("div"); body.className = "story-body ql-snow";
      const inner = document.createElement("div"); inner.className = "ql-editor";
      inner.innerHTML = DOMPurify.sanitize(String(doc.html || ""));
      body.appendChild(inner); parts.push(body);

      if (kind === "article" && doc.source && /^https:\/\//.test(doc.source)) {
        const p = document.createElement("p"); p.className = "doc-source";
        const a = document.createElement("a"); a.className = "text-link"; a.href = doc.source; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Originally published on Substack ↗";
        p.appendChild(a); parts.push(p);
      }
      if (series) {
        const nav = seriesNav(doc, series);
        if (nav) parts.push(nav);
      }
      box.replaceChildren(...parts);
      document.title = (doc.title || "Untitled") + " · " + SITE.name;
    } catch (err) {
      if (mine !== docToken) return;
      box.innerHTML = String(err.message) === "404"
        ? note("That page doesn't exist (or was unpublished).")
        : note("Couldn't load this right now. Try again in a moment.");
    }
  }

  /* ───────── middle: hash router ───────── */
  const views = $$(".view");
  const keys = $$(".key");
  const notFound = $("#not-found");
  const SECTION = { articles: "Articles", article: "Articles", stories: "Stories", story: "Stories", series: "Stories", contact: "Contact" };
  const TAB = { articles: "articles", article: "articles", stories: "stories", story: "stories", series: "stories", contact: "contact" };
  const TITLE = { articles: "Articles", stories: "Stories", contact: "Contact", article: "Article", story: "Story", series: "Series" };

  function route() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [a = "", b = "", c = ""] = raw.split("/");
    let view = "", arg = "";

    if (!raw || (["home", "about", "goals", "articles"].includes(a) && !b)) view = "articles";
    else if (a === "articles" && b === "category") { view = "articles"; arg = decodeURIComponent(c); }
    else if (a === "article" && b) { view = "article"; arg = b; }
    else if (a === "stories" && !b) view = "stories";
    else if (a === "story" && b) { view = "story"; arg = b; }
    else if (a === "series" && b) { view = "series"; arg = b; }
    else if (a === "contact" && !b) view = "contact";

    views.forEach((v) => { v.hidden = v.dataset.view !== view; });
    notFound.hidden = view !== "";
    keys.forEach((k) => {
      const on = k.dataset.tab === TAB[view];
      k.classList.toggle("active", on);
      on ? k.setAttribute("aria-current", "page") : k.removeAttribute("aria-current");
    });
    $("#readout").textContent = SECTION[view] || "Unknown";

    if (view === "articles") showArticles(arg);
    if (view === "stories") showStories();
    if (view === "series") showSeries(arg);
    if (view === "article") renderDoc("article", arg);
    if (view === "story") renderDoc("story", arg);
    markLatest();

    document.title = (TITLE[view] || "Not found") + " · " + SITE.name;
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
