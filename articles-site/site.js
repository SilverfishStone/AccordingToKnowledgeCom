/* According To Knowledge: the articles site.
   One page with several views, picked from the address:
     /                 home: the latest (or pinned) article, every article, the rules
     /article/<slug>   one article, with share buttons and comments
     /contact          about me and my links
     /login /account /messages /admin /privacy   accounts and the rest (community.js)
     /write /write/<id> /community /community/<slug> /people/<name>   writing (writing.js)
     /writing-terms   the guidelines for community writers
   The articles are the same files the personal site publishes: articles/index.json and
   articles/<slug>.json (copied in when Cloudflare builds the site; see build.sh). */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const boldify = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };
  const readTime = (w) => (w ? Math.max(1, Math.round(w / 220)) + " min read" : "");
  const metaLine = (a) => [fmtDate(a.published), readTime(a.words)].filter(Boolean).join(" · ");

  /* ───────── old links ─────────
     accordingtoknowledge.com used to be the personal site, with #hash addresses. Article links
     come here; everything else (stories, gallery, the secret page…) goes to the personal site. */
  // #articles and #rules are places on the home page, not old links
  const HOME_ANCHORS = new Set(["#articles", "#rules", "#comments"]);
  function fromOldHash(hash) {
    const [a = "", b = "", c = ""] = hash.replace(/^#\/?/, "").split("/");
    if (!a || a === "home" || a === "about" || a === "goals") return "/";
    if (a === "article" && b) return "/article/" + b;
    if (a === "articles") return b === "category" && c ? "/?category=" + encodeURIComponent(c) + "#articles" : "/#articles";
    if (a === "contact") return "/contact";
    return null;   // not ours
  }
  // "moved" when an old #link was rewritten to its new address here, "leaving" when it belongs
  // to the personal site, false when the address isn't an old link
  function followOldHash() {
    if (location.hash.length <= 1 || location.pathname !== "/" || location.search || HOME_ANCHORS.has(location.hash)) return false;
    const to = fromOldHash(location.hash);
    if (to) { history.replaceState(null, "", to); return "moved"; }
    location.replace(ATK.personalSite.replace(/\/$/, "") + "/" + location.hash);
    return "leaving";
  }
  if (followOldHash() === "leaving") return;

  /* ───────── data ───────── */
  let indexPromise = null;
  const getJSON = async (url) => {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  const loadIndex = () => (indexPromise ||= getJSON("articles/index.json")
    .then((list) => (Array.isArray(list) ? list : [])
      .filter((a) => a && SLUG_RE.test(a.slug || ""))
      .map((a) => ({ ...a, categories: Array.isArray(a.categories) ? a.categories : [] }))
      .sort((x, y) => String(y.published || "").localeCompare(String(x.published || ""))))
    .catch((e) => { indexPromise = null; throw e; }));

  // links in articles: other websites open in a new tab
  DOMPurify.addHook("afterSanitizeAttributes", (n) => {
    if (n.tagName === "A" && /^https?:/i.test(n.getAttribute("href") || "")) {
      try {
        if (new URL(n.href).origin !== location.origin) { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
      } catch { }
    }
  });

  /* ───────── hand-drawn lines ───────── */
  // a slightly tilted, slightly wobbly stroke; the same line every visit (seeded by its number)
  function inkRule(el) {
    let s = (+el.dataset.rule || 1) * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const y = () => 3 + r() * 8;
    const d = `M3 ${y().toFixed(1)} C ${(150 + r() * 60).toFixed(0)} ${y().toFixed(1)}, ${(380 + r() * 60).toFixed(0)} ${y().toFixed(1)}, 597 ${y().toFixed(1)}`;
    el.innerHTML = `<svg viewBox="0 0 600 14" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  document.querySelectorAll(".ink-rule").forEach(inkRule);

  /* ───────── fixed parts ───────── */
  $("#year").textContent = new Date().getFullYear();
  $("#foot-personal").href = ATK.personalSite;
  $("#rules-h").textContent = ATK.rulesTitle || "Rules";
  $("#rules-list").innerHTML = (ATK.rules || []).map((r) => `<li><span>${boldify(r)}</span></li>`).join("");
  $("#links").innerHTML = (ATK.links || []).map((l) => {
    const ext = /^https?:/i.test(l.url);
    return `<li><a href="${esc(l.url)}"${ext ? ' target="_blank" rel="noopener"' : ""}><small>${esc(l.label)}</small><b>${esc(l.text)}${ext ? " ↗" : ""}</b></a></li>`;
  }).join("");

  /* ───────── home ───────── */
  const catSelect = $("#category");
  let articles = [];
  // an article's thumbnail (published into articles/thumbs/ by either editor), if it has one
  const thumbOf = (a) => (/^articles\/thumbs\/[a-z0-9-]+\.jpg$/.test(a.thumbnail || "") ? a.thumbnail : "");

  function renderList() {
    const want = catSelect.value;
    const shown = want ? articles.filter((a) => a.categories.some((c) => slugify(c) === want)) : articles;
    $("#article-list").innerHTML = shown.length ? shown.map((a) => `
      <a class="item${thumbOf(a) ? " has-thumb" : ""}" href="article/${esc(a.slug)}" data-link>
        ${thumbOf(a) ? `<img class="item-thumb" src="${esc(thumbOf(a))}" alt="" loading="lazy" />` : ""}
        <span class="item-title">${esc(a.title || "Untitled")}</span>
        ${a.subtitle ? `<span class="item-sub">${esc(a.subtitle)}</span>` : ""}
        <span class="meta">${esc(metaLine(a))}${a.categories.length ? " · " + esc(a.categories.join(", ")) : ""}</span>
        ${a.summary ? `<p>${esc(a.summary)}</p>` : ""}
      </a>`).join("") : `<p class="empty">No articles here yet.</p>`;
  }
  catSelect.addEventListener("change", () => {
    const url = new URL(location.href);
    if (catSelect.value) url.searchParams.set("category", catSelect.value); else url.searchParams.delete("category");
    url.hash = "";
    history.replaceState(null, "", url.pathname + url.search);
    renderList();
  });

  async function showHome() {
    setTitle("", ATK.description);
    try { articles = await loadIndex(); }
    catch {
      $("#featured-wrap").hidden = true;
      $("#article-list").innerHTML = `<p class="empty">The articles couldn't be loaded right now. Try again in a moment.</p>`;
      return;
    }
    const f = articles.find((a) => a.pinned) || articles[0];
    $("#featured-wrap").hidden = !f;
    if (f) {
      $("#featured-label").textContent = f.pinned ? "Highlighted article" : "Latest article";
      $("#featured").href = "article/" + f.slug;
      $("#featured-title").textContent = f.title || "Untitled";
      $("#featured-sub").textContent = f.subtitle || "";
      $("#featured-summary").textContent = f.summary || "";
      $("#featured-meta").textContent = metaLine(f);
      $("#featured-thumb").hidden = !thumbOf(f);
      if (thumbOf(f)) $("#featured-thumb").src = thumbOf(f);
    }
    // "Latest" (everything, newest first) or one category
    const cats = [...new Map(articles.flatMap((a) => a.categories).map((c) => [slugify(c), c])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    const wanted = new URLSearchParams(location.search).get("category") || "";
    catSelect.innerHTML = `<option value="">Latest</option>` + cats.map(([s, c]) => `<option value="${esc(s)}">${esc(c)}</option>`).join("");
    catSelect.value = cats.some(([s]) => s === wanted) ? wanted : "";
    renderList();
    writing.home();
  }

  /* ───────── an article ───────── */
  let docToken = 0;
  async function showArticle(slug) {
    const box = $("#doc"), mine = ++docToken;
    const note = (t) => `<p class="note">${esc(t)}</p>`;
    if (!SLUG_RE.test(slug)) { showMissing(); return; }
    box.innerHTML = note("Loading…");
    $("#article-extras").innerHTML = "";
    try {
      const doc = await getJSON(`articles/${slug}.json`);
      if (mine !== docToken) return;
      const cats = Array.isArray(doc.categories) ? doc.categories : [];
      const updated = doc.updated && doc.published && doc.updated.slice(0, 10) !== doc.published.slice(0, 10) ? ` · Updated ${fmtDate(doc.updated)}` : "";
      box.innerHTML = `
        <h1 class="doc-title">${esc(doc.title || "Untitled")}</h1>
        ${doc.subtitle ? `<p class="doc-sub">${esc(doc.subtitle)}</p>` : ""}
        <span class="meta">${esc(metaLine(doc))}${esc(updated)}</span>
        ${cats.length ? `<div class="tags">${cats.map((c) => `<a class="tag" href="?category=${encodeURIComponent(slugify(c))}#articles" data-link>${esc(c)}</a>`).join("")}</div>` : ""}
        <div class="ink-rule" data-rule="7"></div>
        <div class="story-body ql-snow"><div class="ql-editor"></div></div>`;
      inkRule($(".ink-rule", box));
      $(".ql-editor", box).innerHTML = DOMPurify.sanitize(String(doc.html || ""));
      window.ATKEmbeds?.hydrate($(".ql-editor", box));
      setTitle(doc.title || "Untitled", doc.summary || ATK.description);
      community.article(slug, doc, {
        info: { subtitle: doc.subtitle, author: "Silver", date: doc.published, html: DOMPurify.sanitize(String(doc.html || "")) },
        owner: { kind: "official" },
      });
    } catch {
      if (mine !== docToken) return;
      showMissing();
    }
  }

  function showMissing() {
    showView("missing");
    setTitle("Not found", ATK.description);
  }

  function setTitle(title, description) {
    document.title = title ? `${title} · ${ATK.name}` : ATK.name;
    const m = $('meta[name="description"]');
    if (m) m.content = description || "";
  }

  /* ───────── router ───────── */
  const views = document.querySelectorAll(".view");
  function showView(name) { views.forEach((v) => { v.hidden = v.dataset.view !== name; }); }

  function route() {
    const parts = location.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const [a = "", b = ""] = parts;
    if (a !== "write") writing.leave();   // leaving the editor saves it
    if (!a) { showView("home"); showHome(); }
    else if (a === "article" && b && parts.length === 2) { showView("article"); showArticle(b); }
    else if (a === "contact" && parts.length === 1) { showView("contact"); setTitle("Contact", "Silver's links: personal site, email, Substack and X."); }
    else if (community.views.includes(a) && parts.length === 1) { showView(a); setTitle(community.title(a), ATK.description); community.show(a); }
    else if (a === "write" && parts.length <= 2) { showView("write"); writing.write(b); }
    else if (a === "community" && parts.length === 1) { showView("community"); writing.list(); }
    else if (a === "community" && b && parts.length === 2) { showView("community-article"); writing.read(b); }
    else if (a === "people" && b && parts.length === 2) { showView("people"); writing.person(decodeURIComponent(b)); }
    else if (a === "writing-terms" && parts.length === 1) { showView("writing-terms"); setTitle("Writing for the site", "Guidelines for According To Knowledge's community writers."); }
    else showMissing();
  }

  function go(url, push = true) {
    const u = new URL(url, location.href);
    if (push) history.pushState(null, "", u.pathname + u.search + u.hash);
    route();
    if (u.hash.length > 1) {
      // wait for the home list to be built, then scroll to it
      setTimeout(() => $(u.hash)?.scrollIntoView({ block: "start" }), 60);
    } else window.scrollTo(0, 0);
  }

  // links inside this site change the view without reloading the page
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank") return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    // an old-style #link inside an older article
    if (u.pathname === "/" && u.hash.length > 1 && !HOME_ANCHORS.has(u.hash)) {
      const to = fromOldHash(u.hash);
      e.preventDefault();
      if (to) go(to); else window.open(ATK.personalSite.replace(/\/$/, "") + "/" + u.hash, "_blank", "noopener");
      return;
    }
    e.preventDefault();
    go(u.href);
  });
  addEventListener("popstate", () => route());
  community.go = go;
  writing.site = { go, setTitle, inkRule };
  addEventListener("hashchange", () => { if (followOldHash() === "moved") go(location.href, false); });

  route();
  if (HOME_ANCHORS.has(location.hash) && location.hash !== "#comments") setTimeout(() => $(location.hash)?.scrollIntoView({ block: "start" }), 300);
})();
