/* The religiolect dictionary: terms and phrases heard in religious circles, explained across groups.
     /dictionary                  search or scroll through every term
     /dictionary/<id>             one term: pick whose understanding of it, and whose terms to read it in
     /dictionary/add              add a term (Silver only)
     /dictionary/edit/<entry id>  edit one group's meaning of a term and its explanations in other groups' terms
     /dictionary/groups           fix a group's details, or remove one nothing uses
   Words:
     term         "Salvation". Shared by every group that uses it.
     synonyms     other ways of saying a term ("On fire for the Lord" for "On fire for God"): searched, and shown under the term as "Also:"
     group        who uses it: a religion (blank = Trinitarian Christian), a tradition (Baptist, Pentecostal, Catholic),
                  optionally the exact denomination (PCUSA, RCC) and a location. A group with nothing in it is
                  "every Trinitarian Christian"; a religion on its own covers everyone in that religion.
     meaning      the understanding of a term shared by one or more groups, with its plain explanation ("entry" in the code).
                  A group has at most one meaning of a term. The add and edit forms take several groups at once, and
                  "all traditions except…" fills in the rows (so the term shows who uses it, not who was left out)
     translation  that meaning explained in another group's terms, so a reader can read it their own way
   A group written for a whole tradition ("Baptist") applies to every denomination inside it, and a reader who picks a more
   exact group sees the most exact meaning and explanation that fits them.
   The server (worker/index.js) keeps all of it, and only lets Silver read it until DICTIONARY_PUBLIC is "true". */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const L = () => community.lib;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const fold = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

  /* ───────── groups ───────── */
  const FIELDS = ["religion", "tradition", "denomination", "location"];
  const FIELD_NAME = { religion: "Religion", tradition: "Tradition", denomination: "Denomination", location: "Location" };
  const FIELD_NOTE = { religion: " (only if not Trinitarian Christian)", tradition: "", denomination: " (optional)", location: " (optional, where it applies)" };
  const FIELD_HINT = { religion: "Islam, Judaism…", tradition: "Baptist, Pentecostal, Catholic…", denomination: "PCUSA, RCC, SBC…", location: "Where it applies" };
  const blank = () => ({ religion: "", tradition: "", denomination: "", location: "" });
  const tidy = (g) => Object.fromEntries(FIELDS.map((f) => [f, String((g && g[f]) || "").replace(/\s+/g, " ").trim()]));
  const gkey = (g) => FIELDS.map((f) => fold(g[f]).trim()).join("|");
  const sameGroup = (a, b) => gkey(a) === gkey(b);
  const specificity = (g) => FIELDS.filter((f) => g[f]).length;
  // a group written for a whole tradition applies to everyone in it: every part it names must match the reader's
  // (the religion has to match exactly: blank means Trinitarian Christian, not "any religion")
  const applies = (g, reader) => !!reader && same(g.religion, reader.religion) && FIELDS.every((f) => f === "religion" || !g[f] || same(g[f], reader[f]));
  // "Religion › Tradition › Denomination (Location)"
  const label = (g) => ([g.religion, g.tradition, g.denomination].filter(Boolean).join(" › ") || "All Trinitarian Christians") + (g.location ? ` (${g.location})` : "");
  // the short name for a chip: the most exact part
  const short = (g) => (g.denomination || g.tradition || g.religion || "Trinitarian Christians") + (g.location ? ` (${g.location})` : "");

  const MINE_KEY = "atk_dict_me";
  const getMine = () => { try { const g = JSON.parse(localStorage.getItem(MINE_KEY)); return g ? tidy(g) : null; } catch { return null; } };
  const setMine = (g) => { try { g ? localStorage.setItem(MINE_KEY, JSON.stringify(g)) : localStorage.removeItem(MINE_KEY); } catch { /* private mode */ } };

  let box = null, data = null, admin = false, flash = "";
  const groupOf = (id) => data.sects.find((s) => s.id === id) || blank();
  const entryGroups = (e) => e.groups.map(groupOf).sort((x, y) => label(x).localeCompare(label(y)));
  const entryFull = (e) => entryGroups(e).map(label).join("; ");
  // a chip's name: the first few groups by their short names, then how many more
  const entryChip = (e) => { const n = entryGroups(e).map(short); return n.length > 3 ? n.slice(0, 3).join(", ") + ` +${n.length - 3}` : n.join(", "); };
  const entryOf = (term, group) => term.entries.find((e) => entryGroups(e).some((g) => sameGroup(g, group)));
  // a term by its name or by one of its synonyms
  const termByName = (name) => data.terms.find((t) => same(t.term, name) || (t.aliases || []).some((a) => same(a, name)));
  const load = async () => { data = await L().api("dict"); return data; };
  const paragraphs = (s) => L().paragraphs(s);
  const link = (href, text, cls = "text-link") => `<a class="${cls}" href="${href}" data-link>${text}</a>`;

  // the meaning (or explanation) that fits a reader best: the most exact group that applies to them
  const best = (items, getGroup, reader) => {
    let top = null, score = -1;
    for (const it of items) { const g = getGroup(it); if (applies(g, reader) && specificity(g) > score) { top = it; score = specificity(g); } }
    return top;
  };
  // the meaning whose most exact group fits the reader best
  const bestEntry = (term, reader) => {
    let top = null, score = -1;
    for (const e of term.entries) for (const g of entryGroups(e)) if (applies(g, reader) && specificity(g) > score) { top = e; score = specificity(g); }
    return top;
  };
  const bestTr = (entry, reader) => best(entry.tr, (t) => groupOf(t.sect), reader);

  // every group a reader can say they are: each one in the data, and the broader groups inside which they sit
  function readerOptions() {
    const map = new Map();
    if (data.sects.some((s) => !s.religion)) map.set(gkey(blank()), blank());   // a Trinitarian Christian who hasn't said which tradition
    for (const s of data.sects) {
      const g = blank();
      for (const f of FIELDS) {
        if (!s[f]) continue;
        g[f] = s[f];
        const k = gkey(g);
        if (!map.has(k)) map.set(k, { ...g });
      }
    }
    return [...map.values()].sort((a, b) => label(a).localeCompare(label(b)));
  }

  /* ───────── the way in ───────── */
  async function show(parts) {
    box = $("#dictionary-box");
    box.onclick = box.onsubmit = null;   // each page sets its own
    dictionary.site.setTitle("Dictionary", "");
    const me = await L().loadMe();
    admin = !!(me.user && me.user.role === "admin");
    box.innerHTML = `<p class="note">Loading…</p>`;
    try { await load(); }
    catch (e) {
      box.innerHTML = `<h1 class="page-h">Religiolect dictionary</h1><p class="note">${esc(e.message)}${e.status === 401 ? ` ${link("login?next=" + encodeURIComponent(location.pathname), "Sign in")}` : ""}</p>`;
      return;
    }
    const [a, b] = parts;
    if (!a) return home();
    if (a === "add" && admin) return addForm();
    if (a === "groups" && admin) return groupsPage();
    if (a === "edit" && admin && /^\d+$/.test(b || "")) return editForm(Number(b));
    if (/^\d+$/.test(a) && !b) return termPage(Number(a));
    box.innerHTML = `<h1 class="page-h">Not found</h1><p class="center">${link("dictionary", "Back to the dictionary")}</p>`;
  }

  /* ───────── the list ───────── */
  function explanationFor(term, reader) {
    // what to preview: the reader's own group's meaning, in their terms if there is a version of it
    const e = (reader && bestEntry(term, reader)) || term.entries.find((x) => x.definition) || term.entries[0];
    if (!e) return "";
    const tr = reader && bestTr(e, reader);
    return (tr && tr.body) || e.definition || (e.tr[0] && e.tr[0].body) || "";
  }

  function home() {
    dictionary.site.setTitle("Religiolect dictionary", "");
    const mine = getMine(), options = readerOptions();
    box.innerHTML = `
      <h1 class="page-h">Religiolect dictionary</h1>
      <p class="lead center">Words and phrases heard in religious circles, explained across traditions and denominations${admin && !data.public ? ". <b>Private for now: only you can see this.</b>" : "."}</p>
      <div class="dict-bar">
        <input type="search" id="dict-q" placeholder="Search terms and explanations" autocomplete="off" aria-label="Search the dictionary" />
        <label class="dict-me">I am
          <select id="dict-me"><option value="">Not chosen</option>${options.map((g, i) => `<option value="${i}"${mine && sameGroup(g, mine) ? " selected" : ""}>${esc(FIELDS.some((f) => g[f]) ? label(g) : "Trinitarian Christian (no tradition given)")}</option>`).join("")}</select></label>
      </div>
      ${admin ? `<p class="row dict-admin">${link("dictionary/add", "Add a term", "btn")} ${link("dictionary/groups", "Traditions &amp; denominations", "btn ghost")}</p>` : ""}
      <div id="dict-az" class="dict-az"></div>
      <div id="dict-list"></div>`;
    const q = $("#dict-q", box), me = $("#dict-me", box);
    const reader = () => (me.value === "" ? null : options[Number(me.value)]);
    const draw = () => drawList(q.value, reader());
    q.addEventListener("input", draw);
    me.addEventListener("change", () => { setMine(reader()); draw(); });
    draw();
  }

  function drawList(query, reader) {
    const list = $("#dict-list", box), az = $("#dict-az", box);
    const words = fold(query).split(/\s+/).filter(Boolean);
    let terms = data.terms;
    if (words.length) {
      terms = terms.map((t) => {
        const names = [t.term, ...(t.aliases || [])].map(fold);
        const head = names.find((n) => words.every((w) => n.includes(w))) || names[0];
        const rest = fold(t.entries.map((e) => entryGroups(e).map(label).join(" ") + " " + e.definition + " " + e.tr.map((x) => label(groupOf(x.sect)) + " " + x.body).join(" ")).join(" "));
        if (!words.every((w) => head.includes(w) || rest.includes(w))) return null;
        return { t, rank: head === words.join(" ") ? 0 : head.startsWith(words[0]) ? 1 : words.every((w) => head.includes(w)) ? 2 : 3 };
      }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.t.term.localeCompare(b.t.term)).map((x) => x.t);
    }
    if (!terms.length) {
      az.innerHTML = "";
      list.innerHTML = `<p class="note">${data.terms.length ? "Nothing matches that." : "No terms yet."}${admin && !data.terms.length ? ` ${link("dictionary/add", "Add the first one")}` : ""}</p>`;
      return;
    }
    const row = (t) => {
      const groups = [...new Set(t.entries.flatMap((e) => entryGroups(e).map(short)))];
      const snip = clip(explanationFor(t, reader), 150);
      return `<a class="item" href="dictionary/${t.id}" data-link><span class="item-title">${esc(t.term)}</span>
        <span class="meta">${groups.length ? esc(groups.join(" · ")) : "Nobody uses it yet"}</span>${t.aliases && t.aliases.length ? `<span class="meta dict-also">Also: ${esc(t.aliases.join(" · "))}</span>` : ""}${snip ? `<p>${esc(snip)}</p>` : ""}</a>`;
    };

    if (words.length) { az.innerHTML = ""; list.innerHTML = `<div class="article-list">${terms.map(row).join("")}</div>`; return; }
    const groups = new Map();
    const place = (name, html) => {
      const ch = fold(name).replace(/[^a-z0-9]/g, "").charAt(0).toUpperCase();
      const key = /[A-Z]/.test(ch) ? ch : "#";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ name: fold(name), html });
    };
    for (const t of terms) place(t.term, row(t));
    const keys = [...groups.keys()].sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));
    az.innerHTML = keys.map((k) => `<a href="#dict-${k === "#" ? "num" : k}" data-jump>${k}</a>`).join("");
    az.onclick = (e) => { const a = e.target.closest("[data-jump]"); if (!a) return; e.preventDefault(); $(a.getAttribute("href"), box)?.scrollIntoView({ block: "start" }); };
    list.innerHTML = keys.map((k) => `<h2 class="dict-letter" id="dict-${k === "#" ? "num" : k}">${k}</h2><div class="article-list">${groups.get(k).sort((a, b) => a.name.localeCompare(b.name)).map((x) => x.html).join("")}</div>`).join("");
  }

  /* ───────── one term ───────── */
  function termPage(id) {
    const term = data.terms.find((t) => t.id === id);
    if (!term) { box.innerHTML = `<h1 class="page-h">Not found</h1><p class="center">${link("dictionary", "Back to the dictionary")}</p>`; return; }
    dictionary.site.setTitle(term.term, "");
    const mine = getMine();
    let entry = (mine && bestEntry(term, mine)) || term.entries[0] || null;
    let lang = null;   // "plain" or the id of a group; chosen again whenever the meaning changes, unless it still fits
    const defaultLang = (e) => { const t = e && mine && bestTr(e, mine); return t ? t.sect : "plain"; };
    lang = defaultLang(entry);

    const draw = () => {
      const langs = entry ? [{ key: "plain", label: "Plain terms", full: "" }, ...entry.tr.map((t) => ({ key: t.sect, label: short(groupOf(t.sect)) + " terms", full: label(groupOf(t.sect)) }))] : [];
      if (!langs.some((l) => l.key === lang)) lang = "plain";
      const tr = entry && lang !== "plain" ? entry.tr.find((t) => t.sect === lang) : null;
      const body = entry ? (tr ? tr.body : entry.definition) : "";
      const lacking = mine && entry && lang === "plain" && !bestTr(entry, mine)
        ? `<p class="meta dict-lack">No version in ${esc(label(mine))} terms yet, so this is the plain explanation.</p>` : "";
      box.innerHTML = `
        <p class="dict-back">${link("dictionary", "← All terms")}</p>
        <h1 class="page-h">${esc(term.term)}</h1>
        ${term.aliases && term.aliases.length ? `<p class="center dict-also">Also: ${esc(term.aliases.join(" · "))}</p>` : ""}
        ${entry ? `
        <div class="dict-pick"><span class="dict-pick-label">As understood by</span>
          ${term.entries.map((e) => `<button type="button" class="dict-chip" data-entry="${e.id}" title="${esc(entryFull(e))}" aria-pressed="${e === entry}">${esc(entryChip(e))}</button>`).join("")}</div>
        <div class="dict-pick"><span class="dict-pick-label">Explained in</span>
          ${langs.map((l) => `<button type="button" class="dict-chip" data-lang="${l.key}" title="${esc(l.full)}" aria-pressed="${l.key === lang}">${esc(l.label)}</button>`).join("")}</div>
        <article class="dict-card">
          <h2>${esc(entryFull(entry))}${lang === "plain" ? "" : ` <small>in ${esc(label(groupOf(lang)))} terms</small>`}</h2>
          ${body ? paragraphs(body) : `<p class="note">${lang === "plain" ? "No plain explanation written yet." : "Nothing written yet."}</p>`}
        </article>${lacking}` : `<p class="note">Nobody uses this term yet.</p>`}
        ${admin ? `<p class="row dict-admin">
          ${entry ? link("dictionary/edit/" + entry.id, "Edit this meaning", "btn ghost small-btn") : ""}
          ${link("dictionary/add?term=" + encodeURIComponent(term.term), "Add a meaning for other groups", "btn ghost small-btn")}</p>` : ""}`;
    };
    box.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.entry) { entry = term.entries.find((x) => x.id === Number(b.dataset.entry)); lang = entry.tr.some((t) => t.sect === lang) ? lang : defaultLang(entry); draw(); }
      else if (b.dataset.lang) { lang = b.dataset.lang === "plain" ? "plain" : Number(b.dataset.lang); draw(); }
    };
    draw();
  }

  /* ───────── the four boxes that say who a group is ───────── */
  const listId = (f) => `dl-${f}`;
  function groupDatalists() {
    const uniq = (f) => [...new Map(data.sects.filter((s) => s[f]).map((s) => [s[f].toLowerCase(), s[f]])).values()].sort((a, b) => a.localeCompare(b));
    return FIELDS.map((f) => `<datalist id="${listId(f)}">${uniq(f).map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>`).join("");
  }
  // the four inputs; `small` drops the captions for rows that repeat them
  function groupInputs(g, { small = false } = {}) {
    return `<div class="dict-group${small ? " small" : ""}">${FIELDS.map((f) => `
      <label>${small ? "" : `<span>${FIELD_NAME[f]}<span class="meta">${FIELD_NOTE[f]}</span></span>`}
        <input data-g="${f}" list="${listId(f)}" maxlength="60" value="${esc(g[f])}" placeholder="${esc(small ? FIELD_NAME[f] + (f === "religion" ? " (if not Christian)" : "") : FIELD_HINT[f])}" aria-label="${FIELD_NAME[f]}" autocomplete="off" /></label>`).join("")}</div>`;
  }
  const readGroup = (el) => tidy(Object.fromEntries(FIELDS.map((f) => [f, el.querySelector(`[data-g=${f}]`).value])));
  const groupOk = (g) => !!(g.religion || g.tradition || g.denomination);
  const NEED_GROUP = "Say the tradition or denomination (or the religion, if it isn't Christian).";

  /* ───────── who a meaning belongs to ─────────
     "Every Trinitarian Christian" (an empty group, which covers every tradition, now and later), and any number of rows:
     a tradition (Baptist), an exact denomination, or a whole religion by itself (Latter-day Saints). "All traditions
     except…" fills in a row for each tradition the dictionary knows now, minus the ones left out, and the rows can be
     edited after. What is saved is the explicit list. */
  const prow = (g) => `<div class="dict-prow">${groupInputs(g, { small: true })}<button class="link-btn" type="button" data-pick="remove">Remove</button></div>`;
  function pickerHtml(rows, all) {
    return `<fieldset class="dict-fieldset dict-picker"><legend>Who says it</legend>
      <label class="dict-all"><input type="checkbox" data-pick-all${all ? " checked" : ""} /> <span>Every Trinitarian Christian <span class="meta">(all traditions, now and any added later)</span></span></label>
      <p class="meta">Then add each other group that uses it this way. A tradition on its own (just “Baptist”) covers every denomination inside it, and a religion on its own (just “Latter-day Saints”) covers everyone in that religion.</p>
      <div class="dict-prows">${(rows.length ? rows : [blank()]).map(prow).join("")}</div>
      <p class="row"><button class="btn ghost small-btn" type="button" data-pick="add">+ Add another group</button>
        <button class="btn ghost small-btn" type="button" data-pick="except-open">+ All traditions except…</button></p>
      <div class="dict-pexcept" hidden>
        <label>Within the religion <span class="meta">(blank = Trinitarian Christian)</span><input data-except="religion" list="${listId("religion")}" maxlength="60" autocomplete="off" /></label>
        <label>Leave out these traditions <span class="meta">(one per line)</span><textarea data-except="out" rows="3" placeholder="Catholic&#10;Eastern Orthodox"></textarea></label>
        <p class="meta dict-ppreview" aria-live="polite"></p>
        <p class="row"><button class="btn small-btn" type="button" data-pick="except-apply">Add these as groups</button>
          <button class="btn ghost small-btn" type="button" data-pick="except-close">Cancel</button></p>
      </div></fieldset>`;
  }
  const traditionPool = (religion) => {
    const m = new Map();
    for (const g of data.sects) if (g.tradition && same(g.religion, religion)) m.set(g.tradition.toLowerCase(), g.tradition);
    return [...m.values()].sort((x, y) => x.localeCompare(y));
  };
  function exceptResult(root) {
    const religion = String(root.querySelector("[data-except=religion]").value || "").replace(/\s+/g, " ").trim();
    const out = root.querySelector("[data-except=out]").value.split("\n").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const pool = traditionPool(religion), skip = new Set(out.map((x) => x.toLowerCase()));
    return {
      pool,
      groups: pool.filter((t) => !skip.has(t.toLowerCase())).map((t) => ({ ...blank(), religion, tradition: t })),
      unknown: out.filter((x) => !pool.some((p) => p.toLowerCase() === x.toLowerCase())),
    };
  }
  // { groups: the finished groups to save, rows: every row as typed, all: the "every Trinitarian Christian" box, bad: a row has something in it but isn't a usable group }
  function readPicker(root) {
    const all = root.querySelector("[data-pick-all]").checked;
    const rows = [...root.querySelectorAll(".dict-prow")].map(readGroup);
    const filled = rows.filter((g) => FIELDS.some((f) => g[f]));
    const seen = new Set(), groups = [];
    const take = (g) => { const k = gkey(g); if (!seen.has(k)) { seen.add(k); groups.push(g); } };
    if (all) take({ ...blank(), all: true });
    for (const g of filled) if (groupOk(g)) take(g);
    return { groups, rows, all, bad: filled.some((g) => !groupOk(g)) };
  }
  function bindPicker(root, onChange) {
    const rowsEl = root.querySelector(".dict-prows"), panel = root.querySelector(".dict-pexcept");
    const preview = () => {
      const r = exceptResult(root);
      root.querySelector(".dict-ppreview").textContent = !r.pool.length ? "No traditions to choose from yet. Add some meanings first."
        : !r.groups.length ? "That leaves out every tradition."
        : `Adds ${r.groups.length} group${r.groups.length === 1 ? "" : "s"}: ${r.groups.map((g) => g.tradition).join(", ")}. These are the traditions the dictionary knows now; for every tradition, including ones added later, tick “Every Trinitarian Christian” instead.${r.unknown.length ? " Not a known tradition (ignored): " + r.unknown.join(", ") + "." : ""}`;
      return r;
    };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick]");
      if (!b) return;
      const act = b.dataset.pick;
      if (act === "add") { rowsEl.insertAdjacentHTML("beforeend", prow(blank())); rowsEl.lastElementChild.querySelector("input")?.focus(); }
      else if (act === "remove") {
        if (rowsEl.children.length > 1) b.closest(".dict-prow").remove();
        else b.closest(".dict-prow").querySelectorAll("input").forEach((i) => { i.value = ""; });
      } else if (act === "except-open") { panel.hidden = false; preview(); panel.querySelector("input").focus(); }
      else if (act === "except-close") panel.hidden = true;
      else if (act === "except-apply") {
        const r = preview();
        if (!r.groups.length) return;
        const have = new Set(readPicker(root).rows.map(gkey));
        [...rowsEl.querySelectorAll(".dict-prow")].filter((x) => !FIELDS.some((f) => readGroup(x)[f])).forEach((x) => x.remove());
        for (const g of r.groups) if (!have.has(gkey(g))) rowsEl.insertAdjacentHTML("beforeend", prow(g));
        panel.hidden = true;
        panel.querySelectorAll("input, textarea").forEach((i) => { i.value = ""; });
      }
      if (onChange) onChange();
    });
    const changed = () => { if (!panel.hidden) preview(); if (onChange) onChange(); };
    root.addEventListener("input", changed);
    root.addEventListener("change", changed);
    if (onChange) onChange();
  }

  /* ───────── add a term ───────── */
  function addForm() {
    dictionary.site.setTitle("Add a term", "");
    const params = new URLSearchParams(location.search);
    box.innerHTML = `
      <p class="dict-back">${link("dictionary", "← All terms")}</p>
      <h1 class="page-h">Add a term</h1>
      <p class="lead center">Type what you heard and who says it. If several groups use it the same way, add them all here. Terms, traditions and denominations that already exist are suggested as you type.</p>
      <form class="form dict-form" id="dict-add" autocomplete="off">
        <label>Term or phrase<input name="term" maxlength="120" required list="dl-terms" value="${esc(params.get("term") || "")}" placeholder="Salvation, washed in the blood, theosis…" /></label>
        ${pickerHtml([blank()], false)}
        <label>Explanation <span class="meta">(optional, in plain terms; you can add more later)</span><textarea name="definition" rows="5" maxlength="4000"></textarea></label>
        <p class="form-note" id="dict-hint"></p>
        <button class="btn" type="submit">Add it</button>
      </form>
      <datalist id="dl-terms">${data.terms.flatMap((t) => [t.term, ...(t.aliases || [])]).map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>${groupDatalists()}`;
    const f = $("#dict-add", box), hint = $("#dict-hint", box), submit = f.querySelector("button[type=submit]"), picker = $(".dict-picker", f);
    const names = (groups) => groups.map(short).join(", ");
    const check = () => {
      const t = termByName(f.term.value), { groups } = readPicker(picker);
      const hits = t ? groups.filter((g) => entryOf(t, g)) : [];
      submit.textContent = hits.length ? "Open it to edit" : "Add it";
      const via = t && !same(t.term, f.term.value) ? `“${esc(f.term.value.trim())}” is a synonym of <b>${esc(t.term)}</b>. ` : "";
      if (hits.length) hint.innerHTML = `${via}<b>${esc(t.term)}</b> already has a meaning for ${esc(names(hits))}. It will open to edit instead of adding a copy; nothing is changed.`;
      else if (t && t.entries.length) hint.innerHTML = `${via || `<b>${esc(t.term)}</b> is already a term. `}It's used by ${esc([...new Set(t.entries.flatMap((e) => entryGroups(e).map(short)))].join(", "))}. This adds ${groups.length ? esc(names(groups)) + "'s" : "another meaning"} to it.`;
      else hint.textContent = "";
      hint.className = "form-note" + (hint.textContent ? " ok" : "");
    };
    bindPicker(picker, check);
    f.term.addEventListener("input", check);
    check();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const { groups, bad } = readPicker(picker);
      if (bad || !groups.length) { L().say(hint, NEED_GROUP); return; }
      L().busy(submit, "Saving…", async () => {
        try {
          const r = await L().api("admin/dict/entries", { term: f.term.value, groups, definition: f.definition.value });
          flash = r.existed ? "It was already here, so this is that entry to edit. Nothing was changed." : "Added. You can add explanations in other groups' terms below.";
          await load();
          dictionary.site.go("/dictionary/edit/" + r.id);
        } catch (err) { L().say(hint, err.message); }
      });
    });
  }

  /* ───────── edit one meaning ───────── */
  function findEntry(id) {
    for (const t of data.terms) { const e = t.entries.find((x) => x.id === id); if (e) return { term: t, entry: e }; }
    return null;
  }

  function editForm(id) {
    const found = findEntry(id);
    if (!found) { box.innerHTML = `<h1 class="page-h">Not found</h1><p class="center">${link("dictionary", "Back to the dictionary")}</p>`; return; }
    const { term, entry } = found;
    dictionary.site.setTitle("Edit " + term.term, "");
    const who = entryFull(entry);
    let rows = entry.tr.map((t) => ({ group: { ...groupOf(t.sect) }, body: t.body }));
    // who uses this meaning, kept while the page is redrawn
    let picked = { all: entryGroups(entry).some((g) => !FIELDS.some((f) => g[f])), rows: entryGroups(entry).filter((g) => FIELDS.some((f) => g[f])).map((g) => ({ ...g })) };
    const note = flash; flash = "";
    const draw = () => {
      box.innerHTML = `
        <p class="dict-back">${link("dictionary", "← All terms")} · ${link("dictionary/" + term.id, "View it")} · ${link("dictionary/add", "Add another term")}</p>
        <h1 class="page-h">${esc(term.term)} <small class="dict-sect">${esc(who)}</small></h1>
        ${note ? `<p class="form-note ok">${esc(note)}</p>` : ""}
        <form class="form dict-form" id="dict-edit">
          <label>Term <span class="meta">(renames it for every group)</span><input name="term" maxlength="120" required value="${esc(term.term)}" /></label>
          <label>Synonyms <span class="meta">(one per line, for every group; they're searchable and shown under the term as “Also”)</span><textarea name="aliases" rows="3" maxlength="3000" placeholder="One synonym per line…">${esc((term.aliases || []).join("\n"))}</textarea></label>
          ${pickerHtml(picked.rows, picked.all)}
          <label>What they mean by it, in plain terms<textarea name="definition" rows="6" maxlength="4000">${esc(entry.definition)}</textarea></label>
          <h2 class="dict-sub">The same meaning, explained in another group's terms</h2>
          <p class="lead">Write it the way someone from that tradition or denomination would understand it. A tradition on its own (just “Baptist”) covers every Baptist denomination. They pick “Explained in” on the term's page to read it.</p>
          <div id="dict-rows">${rows.map((r, i) => `
            <div class="dict-row" data-i="${i}">
              ${groupInputs(r.group, { small: true })}
              <textarea data-f="body" rows="4" maxlength="4000" placeholder="Explained in their terms…" aria-label="Explanation">${esc(r.body)}</textarea>
              <button class="link-btn" type="button" data-act="remove">Remove</button>
            </div>`).join("")}</div>
          <p><button class="btn ghost small-btn" type="button" data-act="add-row">+ Add an explanation for another group</button></p>
          ${groupDatalists()}
          <p class="form-note" id="dict-note"></p>
          <p class="row"><button class="btn" type="submit">Save</button>
            <button class="btn danger" type="button" data-act="delete">Delete this meaning</button></p>
        </form>`;
      bindPicker($(".dict-picker", box));
    };
    const collect = () => {
      rows = [...box.querySelectorAll(".dict-row")].map((r) => ({ group: readGroup(r), body: r.querySelector("[data-f=body]").value }));
      { const r = readPicker($(".dict-picker", box)); picked = { all: r.all, rows: r.rows }; }
    };
    draw();
    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      if (b.dataset.act === "add-row") { collect(); rows.push({ group: blank(), body: "" }); draw(); box.querySelector(".dict-row:last-child input")?.focus(); }
      else if (b.dataset.act === "remove") { collect(); rows.splice(Number(b.closest(".dict-row").dataset.i), 1); draw(); }
      else if (b.dataset.act === "delete") {
        const sure = await L().confirmBox({ title: "Delete this meaning?", yes: "Delete it", danger: true,
          text: `The meaning of “${term.term}” for ${who}, and its explanations, will be deleted. ${term.entries.length === 1 ? "It's the only one, so the term goes too." : "The other groups' meanings stay."}` });
        if (!sure) return;
        try { await L().api(`admin/dict/entries/${id}/delete`, {}); await load(); dictionary.site.go("/dictionary"); }
        catch (err) { L().say($("#dict-note", box), err.message); }
      }
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const f = $("#dict-edit", box), noteEl = $("#dict-note", box);
      const { groups, bad } = readPicker($(".dict-picker", box));
      if (bad || !groups.length) { L().say(noteEl, NEED_GROUP); return; }
      collect();
      L().busy(f.querySelector("button[type=submit]"), "Saving…", async () => {
        try {
          await L().api(`admin/dict/entries/${id}`, { term: f.term.value, aliases: f.aliases.value.split("\n"), groups, definition: f.definition.value, translations: rows });
          await load();
          const again = findEntry(id);
          if (again) { term.aliases = again.term.aliases; term.term = again.term.term; entry.groups = again.entry.groups; }
          L().say(noteEl, "Saved.", "ok");
          dictionary.site.setTitle("Edit " + f.term.value, "");
          const h = box.querySelector("h1"); if (h) { h.firstChild.textContent = f.term.value + " "; const sm = h.querySelector("small"); if (sm) sm.textContent = entryFull(entry); }
        } catch (err) { L().say(noteEl, err.message); }
      });
    };
  }

  /* ───────── traditions & denominations ───────── */
  function groupsPage() {
    dictionary.site.setTitle("Traditions & denominations", "");
    const uses = (s) => {
      let meanings = 0, explanations = 0;
      for (const t of data.terms) for (const e of t.entries) { if (e.groups.includes(s.id)) meanings++; explanations += e.tr.filter((x) => x.sect === s.id).length; }
      return { meanings, explanations };
    };
    box.innerHTML = `
      <p class="dict-back">${link("dictionary", "← All terms")}</p>
      <h1 class="page-h">Traditions &amp; denominations</h1>
      <p class="lead center">Fix a spelling, add a location, or remove a group nothing uses. A change shows everywhere the group appears.</p>
      <div class="dict-sects">${data.sects.map((s) => { const u = uses(s); return `
        <div class="dict-sect-row" data-id="${s.id}">
          ${FIELDS.some((f) => s[f]) ? groupInputs(s, { small: true }) : `<b class="dict-allname">${esc(label(s))}</b>`}
          <span class="meta">${u.meanings} meaning${u.meanings === 1 ? "" : "s"} · ${u.explanations} explanation${u.explanations === 1 ? "" : "s"} written in its terms</span>
          <span class="row">${FIELDS.some((f) => s[f]) ? `<button class="btn ghost small-btn" type="button" data-act="save">Save</button>` : ""}
          ${u.meanings + u.explanations ? "" : `<button class="btn danger small-btn" type="button" data-act="delete">Remove</button>`}</span>
          <span class="form-note"></span>
        </div>`; }).join("") || `<p class="note">None yet. They're added when you add a term.</p>`}</div>
      ${groupDatalists()}`;
    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]"), row = b && b.closest(".dict-sect-row");
      if (!b || !row) return;
      const note = row.querySelector(".form-note");
      try {
        if (b.dataset.act === "save") { await L().api(`admin/dict/sects/${row.dataset.id}`, { group: readGroup(row) }); await load(); L().say(note, "Saved.", "ok"); }
        else { await L().api(`admin/dict/sects/${row.dataset.id}`, { action: "delete" }); await load(); groupsPage(); }
      } catch (err) { L().say(note, err.message); }
    };
  }

  window.dictionary = { show, site: { go: (u) => { location.href = u; }, setTitle: () => {} } };   // site.js fills `site` in
})();
