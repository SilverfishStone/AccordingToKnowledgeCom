/* The religiolect dictionary: terms and phrases heard in religious circles, explained across groups.
     /dictionary                  search or scroll through every term
     /dictionary/<id>             one term: pick whose understanding of it, and whose terms to read it in
     /dictionary/add              add a term (Silver only)
     /dictionary/edit/<entry id>  edit one group's meaning of a term and its explanations in other groups' terms
     /dictionary/groups           fix a group's details, or remove one nothing uses
   Words:
     term         "Salvation". Shared by every group that uses it.
     alternates   other ways of saying a term ("On fire for the Lord" for "On fire for God"): listed and searched like terms, same page
     group        who uses it: a religion (blank = Trinitarian Christian), a tradition (Baptist, Pentecostal, Catholic),
                  optionally the exact denomination (PCUSA, RCC) and a location. One of the first three is required.
     meaning      one group's understanding of a term, with its plain explanation ("entry" in the code)
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
  const applies = (g, reader) => !!reader && FIELDS.every((f) => !g[f] || same(g[f], reader[f]));
  // "Religion › Tradition › Denomination (Location)"
  const label = (g) => [g.religion, g.tradition, g.denomination].filter(Boolean).join(" › ") + (g.location ? ` (${g.location})` : "");
  // the short name for a chip: the most exact part
  const short = (g) => (g.denomination || g.tradition || g.religion) + (g.location ? ` (${g.location})` : "");

  const MINE_KEY = "atk_dict_me";
  const getMine = () => { try { const g = JSON.parse(localStorage.getItem(MINE_KEY)); return g ? tidy(g) : null; } catch { return null; } };
  const setMine = (g) => { try { g ? localStorage.setItem(MINE_KEY, JSON.stringify(g)) : localStorage.removeItem(MINE_KEY); } catch { /* private mode */ } };

  let box = null, data = null, admin = false, flash = "";
  const groupOf = (id) => data.sects.find((s) => s.id === id) || blank();
  const entryOf = (term, group) => term.entries.find((e) => sameGroup(groupOf(e.sect), group));
  // a term by its name or by one of its alternates
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
  const bestEntry = (term, reader) => best(term.entries, (e) => groupOf(e.sect), reader);
  const bestTr = (entry, reader) => best(entry.tr, (t) => groupOf(t.sect), reader);

  // every group a reader can say they are: each one in the data, and the broader groups inside which they sit
  function readerOptions() {
    const map = new Map();
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
          <select id="dict-me"><option value="">Not chosen</option>${options.map((g, i) => `<option value="${i}"${mine && sameGroup(g, mine) ? " selected" : ""}>${esc(label(g))}</option>`).join("")}</select></label>
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
        const rest = fold(t.entries.map((e) => label(groupOf(e.sect)) + " " + e.definition + " " + e.tr.map((x) => label(groupOf(x.sect)) + " " + x.body).join(" ")).join(" "));
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
      const groups = t.entries.map((e) => short(groupOf(e.sect)));
      const snip = clip(explanationFor(t, reader), 150);
      return `<a class="item" href="dictionary/${t.id}" data-link><span class="item-title">${esc(t.term)}</span>
        <span class="meta">${groups.length ? esc(groups.join(" · ")) : "Nobody uses it yet"}</span>${t.aliases && t.aliases.length ? `<span class="meta dict-also">Also: ${esc(t.aliases.join(" · "))}</span>` : ""}${snip ? `<p>${esc(snip)}</p>` : ""}</a>`;
    };
    // each alternate is listed in its own place in the A–Z list and opens the same page
    const aliasRow = (t, name) => `<a class="item" href="dictionary/${t.id}" data-link><span class="item-title">${esc(name)}</span><span class="meta">Same as <b>${esc(t.term)}</b></span></a>`;
    if (words.length) { az.innerHTML = ""; list.innerHTML = `<div class="article-list">${terms.map(row).join("")}</div>`; return; }
    const groups = new Map();
    const place = (name, html) => {
      const ch = fold(name).replace(/[^a-z0-9]/g, "").charAt(0).toUpperCase();
      const key = /[A-Z]/.test(ch) ? ch : "#";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ name: fold(name), html });
    };
    for (const t of terms) { place(t.term, row(t)); for (const a of t.aliases || []) place(a, aliasRow(t, a)); }
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
      // two groups can share a short name (Baptist in two places): then the whole name is shown
      const shorts = term.entries.map((e) => short(groupOf(e.sect)));
      const chipName = (e) => (shorts.filter((s) => s === short(groupOf(e.sect))).length > 1 ? label(groupOf(e.sect)) : short(groupOf(e.sect)));
      box.innerHTML = `
        <p class="dict-back">${link("dictionary", "← All terms")}</p>
        <h1 class="page-h">${esc(term.term)}</h1>
        ${term.aliases && term.aliases.length ? `<p class="center dict-also">Also said: ${esc(term.aliases.join(" · "))}</p>` : ""}
        ${entry ? `
        <div class="dict-pick"><span class="dict-pick-label">As understood by</span>
          ${term.entries.map((e) => `<button type="button" class="dict-chip" data-entry="${e.id}" title="${esc(label(groupOf(e.sect)))}" aria-pressed="${e === entry}">${esc(chipName(e))}</button>`).join("")}</div>
        <div class="dict-pick"><span class="dict-pick-label">Explained in</span>
          ${langs.map((l) => `<button type="button" class="dict-chip" data-lang="${l.key}" title="${esc(l.full)}" aria-pressed="${l.key === lang}">${esc(l.label)}</button>`).join("")}</div>
        <article class="dict-card">
          <h2>${esc(label(groupOf(entry.sect)))}${lang === "plain" ? "" : ` <small>in ${esc(label(groupOf(lang)))} terms</small>`}</h2>
          ${body ? paragraphs(body) : `<p class="note">${lang === "plain" ? "No plain explanation written yet." : "Nothing written yet."}</p>`}
        </article>${lacking}` : `<p class="note">Nobody uses this term yet.</p>`}
        ${admin ? `<p class="row dict-admin">
          ${entry ? link("dictionary/edit/" + entry.id, "Edit this meaning", "btn ghost small-btn") : ""}
          ${link("dictionary/add?term=" + encodeURIComponent(term.term), "Add another group's meaning", "btn ghost small-btn")}</p>` : ""}`;
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

  /* ───────── add a term ───────── */
  function addForm() {
    dictionary.site.setTitle("Add a term", "");
    const params = new URLSearchParams(location.search);
    box.innerHTML = `
      <p class="dict-back">${link("dictionary", "← All terms")}</p>
      <h1 class="page-h">Add a term</h1>
      <p class="lead center">Type what you heard and who said it. Terms, traditions and denominations that already exist are suggested as you type.</p>
      <form class="form dict-form" id="dict-add" autocomplete="off">
        <label>Term or phrase<input name="term" maxlength="120" required list="dl-terms" value="${esc(params.get("term") || "")}" placeholder="Salvation, washed in the blood, theosis…" /></label>
        <fieldset class="dict-fieldset"><legend>Who says it</legend>${groupInputs(blank())}</fieldset>
        <label>Explanation <span class="meta">(optional, in plain terms; you can add more later)</span><textarea name="definition" rows="5" maxlength="4000"></textarea></label>
        <p class="form-note" id="dict-hint"></p>
        <button class="btn" type="submit">Add it</button>
      </form>
      <datalist id="dl-terms">${data.terms.flatMap((t) => [t.term, ...(t.aliases || [])]).map((n) => `<option value="${esc(n)}"></option>`).join("")}</datalist>${groupDatalists()}`;
    const f = $("#dict-add", box), hint = $("#dict-hint", box), submit = f.querySelector("button[type=submit]"), gbox = $(".dict-group", f);
    const check = () => {
      const t = termByName(f.term.value), g = readGroup(gbox);
      const have = t && groupOk(g) ? entryOf(t, g) : null;
      submit.textContent = have ? "Open it to edit" : "Add it";
      if (have) hint.innerHTML = `<b>${esc(t.term)}</b> is already in the dictionary for ${esc(label(g))}. It will open to edit instead of adding a copy.`;
      else if (t && !same(t.term, f.term.value) && t.entries.length) hint.innerHTML = `“${esc(f.term.value.trim())}” is another way of saying <b>${esc(t.term)}</b> (${esc(t.entries.map((e) => short(groupOf(e.sect))).join(", "))}). This adds ${groupOk(g) ? esc(label(g)) + "'s" : "another group's"} meaning to that term.`;
      else if (t && t.entries.length) hint.innerHTML = `<b>${esc(t.term)}</b> is already a term (${esc(t.entries.map((e) => short(groupOf(e.sect))).join(", "))}). This adds ${groupOk(g) ? esc(label(g)) + "'s" : "another group's"} meaning to it.`;
      else hint.textContent = "";
      hint.className = "form-note" + (hint.textContent ? " ok" : "");
    };
    f.addEventListener("input", check);
    check();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const g = readGroup(gbox);
      if (!groupOk(g)) { L().say(hint, NEED_GROUP); return; }
      L().busy(submit, "Saving…", async () => {
        try {
          const r = await L().api("admin/dict/entries", { term: f.term.value, group: g, definition: f.definition.value });
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
    const who = label(groupOf(entry.sect));
    let rows = entry.tr.map((t) => ({ group: { ...groupOf(t.sect) }, body: t.body }));
    const note = flash; flash = "";
    const draw = () => {
      box.innerHTML = `
        <p class="dict-back">${link("dictionary", "← All terms")} · ${link("dictionary/" + term.id, "View it")} · ${link("dictionary/add", "Add another term")}</p>
        <h1 class="page-h">${esc(term.term)} <small class="dict-sect">${esc(who)}</small></h1>
        ${note ? `<p class="form-note ok">${esc(note)}</p>` : ""}
        <form class="form dict-form" id="dict-edit">
          <label>Term <span class="meta">(renames it for every group)</span><input name="term" maxlength="120" required value="${esc(term.term)}" /></label>
          <label>Other ways of saying it <span class="meta">(one per line, for every group; each is listed and searched like a term and opens this page)</span><textarea name="aliases" rows="3" maxlength="3000" placeholder="On fire for the Lord…">${esc((term.aliases || []).join("\n"))}</textarea></label>
          <label>What ${esc(who)} means by it, in plain terms<textarea name="definition" rows="6" maxlength="4000">${esc(entry.definition)}</textarea></label>
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
    };
    const collect = () => {
      rows = [...box.querySelectorAll(".dict-row")].map((r) => ({ group: readGroup(r), body: r.querySelector("[data-f=body]").value }));
    };
    draw();
    box.onclick = async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      if (b.dataset.act === "add-row") { collect(); rows.push({ group: blank(), body: "" }); draw(); box.querySelector(".dict-row:last-child input")?.focus(); }
      else if (b.dataset.act === "remove") { collect(); rows.splice(Number(b.closest(".dict-row").dataset.i), 1); draw(); }
      else if (b.dataset.act === "delete") {
        const sure = await L().confirmBox({ title: "Delete this meaning?", yes: "Delete it", danger: true,
          text: `${who}'s meaning of “${term.term}” and its explanations will be deleted. ${term.entries.length === 1 ? "It's the only one, so the term goes too." : "The other groups' meanings stay."}` });
        if (!sure) return;
        try { await L().api(`admin/dict/entries/${id}/delete`, {}); await load(); dictionary.site.go("/dictionary"); }
        catch (err) { L().say($("#dict-note", box), err.message); }
      }
    };
    box.onsubmit = (e) => {
      e.preventDefault();
      const f = $("#dict-edit", box), noteEl = $("#dict-note", box);
      collect();
      L().busy(f.querySelector("button[type=submit]"), "Saving…", async () => {
        try {
          await L().api(`admin/dict/entries/${id}`, { term: f.term.value, aliases: f.aliases.value.split("\n"), definition: f.definition.value, translations: rows });
          await load();
          const again = findEntry(id);
          if (again) { term.aliases = again.term.aliases; term.term = again.term.term; }
          L().say(noteEl, "Saved.", "ok");
          dictionary.site.setTitle("Edit " + f.term.value, "");
          const h = box.querySelector("h1"); if (h) h.firstChild.textContent = f.term.value + " ";
        } catch (err) { L().say(noteEl, err.message); }
      });
    };
  }

  /* ───────── traditions & denominations ───────── */
  function groupsPage() {
    dictionary.site.setTitle("Traditions & denominations", "");
    const uses = (s) => {
      let meanings = 0, explanations = 0;
      for (const t of data.terms) for (const e of t.entries) { if (e.sect === s.id) meanings++; explanations += e.tr.filter((x) => x.sect === s.id).length; }
      return { meanings, explanations };
    };
    box.innerHTML = `
      <p class="dict-back">${link("dictionary", "← All terms")}</p>
      <h1 class="page-h">Traditions &amp; denominations</h1>
      <p class="lead center">Fix a spelling, add a location, or remove a group nothing uses. A change shows everywhere the group appears.</p>
      <div class="dict-sects">${data.sects.map((s) => { const u = uses(s); return `
        <div class="dict-sect-row" data-id="${s.id}">
          ${groupInputs(s, { small: true })}
          <span class="meta">${u.meanings} meaning${u.meanings === 1 ? "" : "s"} · ${u.explanations} explanation${u.explanations === 1 ? "" : "s"} written in its terms</span>
          <span class="row"><button class="btn ghost small-btn" type="button" data-act="save">Save</button>
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
