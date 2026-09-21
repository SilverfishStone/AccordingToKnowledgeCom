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
    return `<a class="tool${t.wip ? " wip-tool" : ""}" data-tool="${esc(t.id)}" href="${esc(href)}"${ext}>
      ${svg(t.icon)}
      <span>
        <span class="tool-name">${esc(t.title)}${t.embed ? "" : svg("ext")}</span>
        ${t.wip ? '<span class="tool-badge">Work in progress</span>' : ""}
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
    const kicker = [s.pinned ? "Pinned" : "", storyKicker(s, series)].filter(Boolean).join(" · ");
    return `<a class="entry" href="#story/${esc(s.slug)}">
      ${kicker ? `<span class="entry-kicker">${esc(kicker)}</span>` : ""}
      <h2>${esc(s.title || "Untitled")}</h2>
      ${s.subtitle ? `<span class="entry-sub">${esc(s.subtitle)}</span>` : ""}
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
        ${a.pinned ? '<span class="entry-kicker">Pinned</span>' : ""}
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
          <span class="ch-main"><strong>${esc(c.title || "Untitled")}</strong>${c.subtitle ? `<em>${esc(c.subtitle)}</em>` : ""}<span>${esc(metaLine(c))}</span>${c.summary ? `<span>${esc(c.summary)}</span>` : ""}</span>
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

  /* ───────── gallery (gallery/index.json — written by /write/) ───────── */
  const IMG_RE = /^gallery\/(?:images|thumbs)\/[a-z0-9-]+\.(?:jpe?g|png|webp|gif)$/;
  const strList = (x) => (Array.isArray(x) ? x.map((v) => String(v).trim()).filter(Boolean) : []);
  const loadGallery = () => getJSON("gallery/index.json", { optional: true }).then((l) =>
    (Array.isArray(l) ? l : [])
      .filter((g) => g && SLUG_RE.test(g.slug) && IMG_RE.test(g.file || "") && IMG_RE.test(g.thumb || ""))
      .map((g) => ({ ...g, categories: strList(g.categories), tags: strList(g.tags) }))
      .sort((a, b) => new Date(b.added) - new Date(a.added)));

  function buildFacets(items, field) {
    const map = new Map();
    for (const g of items) for (const name of g[field]) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, { slug, name, count: 0 });
      map.get(slug).count++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const fmtDay = (d) => {
    const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d + "T00:00:00" : d);
    return isNaN(t) ? String(d || "") : t.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };
  const dims = (g) => (Number(g.width) > 0 && Number(g.height) > 0 ? ` width="${Number(g.width)}" height="${Number(g.height)}"` : "");
  const galleryLink = (kind, slug) => `#gallery/${kind}/${encodeURIComponent(slug)}`;

  /* Groups can sit inside other groups (gallery/groups.json: Sketches inside Art), so an image is
     in every group it is filed under and in every group those sit inside. */
  const loadGroups = () => getJSON("gallery/groups.json", { optional: true }).then((l) =>
    (Array.isArray(l) ? l : []).filter((g) => g && typeof g.name === "string" && slugify(g.name))
      .map((g) => ({ name: g.name.trim(), parents: strList(g.parents) })));

  function buildGroups(items, nesting) {
    const names = new Map(), parentsOf = new Map();
    const learn = (n) => { const s = slugify(n); if (s && !names.has(s)) names.set(s, String(n).trim()); return s; };
    for (const g of nesting) { const s = learn(g.name); parentsOf.set(s, g.parents.map(learn).filter((p) => p && p !== s)); }
    for (const g of items) g.categories.forEach(learn);
    const above = (slug) => {                                // every group this one sits inside
      const seen = new Set(), todo = [...(parentsOf.get(slug) || [])];
      while (todo.length) { const s = todo.pop(); if (seen.has(s) || s === slug) continue; seen.add(s); todo.push(...(parentsOf.get(s) || [])); }
      return seen;
    };
    const facets = new Map();
    for (const g of items) {
      g.groupSlugs = new Set();
      for (const name of g.categories) {
        const s = slugify(name); if (!s) continue;
        g.groupSlugs.add(s); above(s).forEach((p) => g.groupSlugs.add(p));
      }
      for (const s of g.groupSlugs) {
        if (!facets.has(s)) facets.set(s, { slug: s, name: names.get(s) || s, count: 0, parents: [], children: [] });
        facets.get(s).count++;
      }
    }
    for (const f of facets.values()) f.parents = (parentsOf.get(f.slug) || []).filter((p) => facets.has(p) && p !== f.slug);
    for (const f of facets.values()) for (const p of f.parents) facets.get(p).children.push(f);
    const byName = (x, y) => x.name.localeCompare(y.name);
    for (const f of facets.values()) f.children.sort(byName);
    return { facets, top: [...facets.values()].filter((f) => !f.parents.length).sort(byName), above };
  }

  async function showGallery(kind, slug) {
    const grid = $("#gallery-grid"), fc = $("#gallery-filters"), fs = $("#gallery-subgroups"), ft = $("#gallery-tags");
    try {
      const [items, nesting] = await Promise.all([loadGallery(), loadGroups().catch(() => [])]);
      const { facets, top, above } = buildGroups(items, nesting);
      const tags = buildFacets(items, "tags");
      const activeCat = kind === "category" ? facets.get(slug) : null;
      const activeTag = kind === "tag" ? tags.find((t) => t.slug === slug) : null;
      const path = activeCat ? above(activeCat.slug) : new Set();
      const chip = (f) => `<a class="chip${activeCat && activeCat.slug === f.slug ? " active" : path.has(f.slug) ? " path" : ""}" href="${galleryLink("category", f.slug)}">${esc(f.name)} <small>${f.count}</small></a>`;

      fc.hidden = !facets.size; ft.hidden = !tags.length;
      fc.innerHTML = facets.size
        ? `<a class="chip${activeCat || activeTag ? "" : " active"}" href="#gallery">All <small>${items.length}</small></a>` + top.map(chip).join("")
        : "";
      // second row: what is inside the group you're in (or the group your group sits inside)
      const focus = activeCat && (activeCat.children.length ? activeCat : facets.get(activeCat.parents[0]));
      fs.hidden = !(focus && focus.children.length);
      fs.innerHTML = focus && focus.children.length
        ? `<span class="sub-label">In ${esc(focus.name)}</span>` + chip({ ...focus, name: "All " + focus.name }) + focus.children.map(chip).join("")
        : "";
      ft.innerHTML = tags.map((t) => `<a class="chip${activeTag && activeTag.slug === t.slug ? " active" : ""}" href="${galleryLink("tag", t.slug)}">#${esc(t.name)}</a>`).join("");
      if (!items.length) { grid.innerHTML = note("No images yet. They'll appear here as I add them."); return; }
      if (kind && !activeCat && !activeTag) { grid.innerHTML = note("Nothing here."); return; }
      const shown = activeCat ? items.filter((g) => g.groupSlugs.has(activeCat.slug))
        : activeTag ? items.filter((g) => g.tags.some((n) => slugify(n) === activeTag.slug)) : items;
      grid.innerHTML = shown.map((g) => `<a class="tile" href="#image/${esc(g.slug)}">
        <img src="${esc(g.thumb)}" alt="${esc(g.alt || g.title)}"${dims(g)} loading="lazy" decoding="async">
        <span class="tile-cap">${esc(g.title)}</span>
      </a>`).join("");
    } catch {
      fc.hidden = true; fs.hidden = true; ft.hidden = true;
      grid.innerHTML = note("Couldn't load the gallery right now. Try again in a moment.");
    }
  }

  async function showImage(slug) {
    const box = $("#image-box");
    if (!SLUG_RE.test(slug)) { box.innerHTML = note("That image doesn't exist."); return; }
    box.innerHTML = note("Loading…");
    try {
      const items = await loadGallery();
      const i = items.findIndex((g) => g.slug === slug);
      if (i < 0) { box.innerHTML = note("That image doesn't exist (or was removed)."); return; }
      const g = items[i], newer = items[i - 1], older = items[i + 1];
      document.title = g.title + " · " + SITE.name;
      const rows = [["Date", g.date && fmtDay(g.date)], ["Location", g.location], ["Details", g.details]].filter((r) => r[1]);
      const chips = g.categories.map((c) => `<a class="tag" href="${galleryLink("category", slugify(c))}">${esc(c)}</a>`).join("") +
                    g.tags.map((t) => `<a class="tag" href="${galleryLink("tag", slugify(t))}">#${esc(t)}</a>`).join("");
      box.innerHTML = `
        <a class="photo-frame" href="${esc(g.file)}" target="_blank" rel="noopener" title="Open full size">
          <img src="${esc(g.file)}" alt="${esc(g.alt || g.title)}"${dims(g)}>
        </a>
        <h1>${esc(g.title)}</h1>
        ${g.caption ? `<p class="photo-caption">${esc(g.caption)}</p>` : ""}
        ${rows.length ? `<dl class="photo-meta">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${chips ? `<div class="tags doc-tags">${chips}</div>` : ""}
        <div class="pager">
          ${newer ? `<a class="pager-btn" href="#image/${esc(newer.slug)}"><small>← Newer</small>${esc(newer.title)}</a>` : `<span class="pager-btn off"><small>← Newer</small>Latest image</span>`}
          ${older ? `<a class="pager-btn next" href="#image/${esc(older.slug)}"><small>Older →</small>${esc(older.title)}</a>` : `<span class="pager-btn off next"><small>Older →</small>First image</span>`}
        </div>`;
    } catch {
      box.innerHTML = note("Couldn't load this image right now. Try again in a moment.");
    }
  }

  /* ───────── "Why am I not…" (whynot/index.json, written by /write/; no tab until SITE.whyNotTab) ───────── */
  const loadWhyNot = () => getJSON("whynot/index.json", { optional: true }).then((l) =>
    (Array.isArray(l) ? l : []).filter((e) => e && SLUG_RE.test(e.slug || "") && typeof e.name === "string" && e.name.trim())
      .map((e) => ({ slug: e.slug, name: e.name.trim(), group: String(e.group || "").trim() || "Other",
        reason: String(e.reason || "").trim(), inherits: SLUG_RE.test(e.inherits || "") ? e.inherits : "" })));

  // blank line = new paragraph; **bold**, *italic*, [text](https://link)
  const wnFormat = (text) => String(text).split(/\n\s*\n/).filter((p) => p.trim()).map((p) => "<p>" + esc(p.trim()).replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#)[^\s)]+)\)/g, (_, t, u) => `<a href="${u}"${u[0] === "#" ? "" : ' target="_blank" rel="noopener"'}>${t}</a>`) + "</p>").join("");

  // an item's own text first, then the text of the item it inherits from, and so on
  function wnBlocks(list, entry) {
    const by = new Map(list.map((e) => [e.slug, e])), seen = new Set(), out = [];
    for (let e = entry; e && !seen.has(e.slug); e = by.get(e.inherits)) {
      seen.add(e.slug);
      if (e.reason) out.push({ from: e === entry ? null : e, text: e.reason });
    }
    return out;
  }

  $("#wn-select").addEventListener("change", (e) => { location.hash = e.target.value ? "#why-not/" + e.target.value : "#why-not"; });

  async function showWhyNot(slug) {
    const sel = $("#wn-select"), box = $("#wn-detail"), pick = $("#wn-pick");
    try {
      const list = await loadWhyNot();
      pick.hidden = !list.length;
      if (!list.length) { box.innerHTML = note("Nothing here yet."); return; }
      const groups = new Map();
      for (const e of list.slice().sort((x, y) => x.name.localeCompare(y.name))) (groups.get(e.group) || groups.set(e.group, []).get(e.group)).push(e);
      sel.innerHTML = '<option value="">Choose one…</option>' + [...groups].sort((x, y) => x[0].localeCompare(y[0]))
        .map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((e) => `<option value="${esc(e.slug)}">${esc(e.name)}</option>`).join("")}</optgroup>`).join("");
      const e = slug ? list.find((x) => x.slug === slug) : null;
      sel.value = e ? e.slug : "";
      if (!slug) { box.innerHTML = ""; return; }
      if (!e) { box.innerHTML = note("That one isn't on the list."); return; }
      document.title = e.name + " · Why am I not… · " + SITE.name;
      const blocks = wnBlocks(list, e);
      box.innerHTML = `<h2 class="wn-name">${esc(e.name)}</h2><div class="tags"><span class="tag">${esc(e.group)}</span></div>` +
        (blocks.length
          ? blocks.map((b) => (b.from ? `<p class="wn-from">Same reasoning as <a class="text-link" href="#why-not/${esc(b.from.slug)}">${esc(b.from.name)}</a></p>` : "") + `<div class="wn-text">${wnFormat(b.text)}</div>`).join("")
          : note("I haven't written this one yet."));
    } catch {
      box.innerHTML = note("Couldn't load this right now. Try again in a moment.");
    }
  }

  /* ───────── home: about, pinned article, gallery button, the rules ───────── */
  const boldify = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  $("#h-home").textContent = SITE.about || "";
  $("#h-rules").textContent = SITE.rulesTitle || "Rules";
  $("#rules-list").innerHTML = (SITE.rules || []).map((r) => `<li><span>${boldify(r)}</span></li>`).join("");

  async function showHome() {
    const [articles, gallery, stories, seriesMeta] = await Promise.allSettled([loadArticles(), loadGallery(), loadStories(), loadSeriesMeta()]);

    // the pinned article (or, until one is pinned, the newest)
    const list = articles.status === "fulfilled" ? articles.value : [];
    const a = list.find((x) => x.pinned) || list[0];
    $("#home-pinned").hidden = !a;
    if (a) {
      $("#home-pinned .eyebrow").textContent = a.pinned ? "Pinned article" : "Latest article";
      $("#pinned-link").href = "#article/" + a.slug;
      $("#pinned-title").textContent = a.title || "Untitled";
      $("#pinned-sub").textContent = a.subtitle || "";
      $("#pinned-tags").innerHTML = a.categories.map((c) => `<span class="tag">${esc(c)}</span>`).join("");
      $("#pinned-summary").textContent = a.summary || "";
    }

    // the pinned story (or the latest one)
    const sl = stories.status === "fulfilled" ? stories.value : [];
    const st = sl.find((x) => x.pinned) || sl[0];
    $("#home-story").hidden = !st;
    if (st) {
      const sm = seriesMeta.status === "fulfilled" ? seriesMeta.value : [];
      $("#home-story .eyebrow").textContent = st.pinned ? "Pinned story" : "Latest story";
      $("#story-link").href = "#story/" + st.slug;
      $("#story-kicker").textContent = storyKicker(st, buildSeries(sl, sm));
      $("#story-title").textContent = st.title || "Untitled";
      $("#story-sub").textContent = st.subtitle || "";
      $("#story-summary").textContent = st.summary || "";
    }

    // the gallery button shows the pinned image (or, until one is pinned, the newest)
    const items = gallery.status === "fulfilled" ? gallery.value : [];
    const g = items.find((x) => x.pinned) || items[0];
    const img = $("#home-gallery-img");
    img.hidden = !g;
    $("#home-gallery").classList.toggle("has-image", !!g);
    if (g) {
      img.src = g.thumb; img.alt = g.alt || g.title;
      $("#home-gallery-cap").textContent = (g.pinned ? "Best work: " : "Latest: ") + g.title;
    } else $("#home-gallery-cap").textContent = "Art and photography";
  }

  /* ───────── middle: hash router ───────── */
  const views = $$(".view");
  const keys = $$(".key");
  if (SITE.whyNotTab) $("#key-whynot").hidden = false;
  const notFound = $("#not-found");
  const TAB = { home: "home", articles: "articles", article: "articles", stories: "stories", story: "stories", series: "stories", gallery: "gallery", image: "gallery", contact: "contact", "why-not": "why-not" };
  const TITLE = { home: "Home", articles: "Articles", stories: "Stories", gallery: "Gallery", contact: "Contact", article: "Article", story: "Story", series: "Series", image: "Image", "why-not": "Why am I not…" };

  function route() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [a = "", b = "", c = ""] = raw.split("/");
    let view = "", arg = "", arg2 = "";

    if (!raw || (["home", "about", "goals"].includes(a) && !b)) view = "home";
    else if (a === "articles" && !b) view = "articles";
    else if (a === "gallery" && !b) view = "gallery";
    else if (a === "gallery" && (b === "category" || b === "tag") && c) { view = "gallery"; arg = b; arg2 = decodeURIComponent(c); }
    else if (a === "image" && b) { view = "image"; arg = b; }
    else if (a === "articles" && b === "category") { view = "articles"; arg = decodeURIComponent(c); }
    else if (a === "article" && b) { view = "article"; arg = b; }
    else if (a === "stories" && !b) view = "stories";
    else if (a === "story" && b) { view = "story"; arg = b; }
    else if (a === "series" && b) { view = "series"; arg = b; }
    else if (a === "contact" && !b) view = "contact";
    else if (a === "why-not") { view = "why-not"; arg = b; }

    views.forEach((v) => { v.hidden = v.dataset.view !== view; });
    notFound.hidden = view !== "";
    keys.forEach((k) => {
      const on = k.dataset.tab === TAB[view];
      k.classList.toggle("active", on);
      on ? k.setAttribute("aria-current", "page") : k.removeAttribute("aria-current");
    });

    // reading a story or article: two panels, so the text gets the room
    const reading = view === "article" || view === "story";
    document.body.classList.toggle("reading", reading);
    document.body.classList.toggle("hide-left", reading && SITE.readingHides !== "right");
    document.body.classList.toggle("hide-right", reading && SITE.readingHides === "right");

    if (view === "home") showHome();
    if (view === "gallery") showGallery(arg, arg2);
    if (view === "why-not") showWhyNot(arg);
    if (view === "image") showImage(arg);
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
