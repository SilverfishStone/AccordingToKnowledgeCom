/* The quiz maker (Silver only): /quiz-maker lists the quizzes, /quiz-maker/new and /quiz-maker/<slug> edit one.
   What a quiz is, and how answers turn into results, is described in quiz-core.js. Saving goes to
   /api/admin/quizzes (worker/index.js checks everything again).

   The page keeps the quiz being edited in `doc`; every input has a data-f="path.into.doc" and writes
   straight into it. Buttons that add, remove or move something (data-act) change `doc` and draw the
   form again. Long lists are <details> whose insides are only drawn when opened, which keeps a
   fifty-question quiz with sixty-five matches light. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const L = () => community.lib;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const slugify = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const sid = () => "s" + Math.random().toString(36).slice(2, 6);
  const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  let doc = null;          // the quiz being edited: { title, eyebrow, intro, sections, matches }
  let meta = null;         // { slug, summary, published, isNew }
  let dirty = false;
  let openKeys = new Set();   // which <details> are open, kept across redraws
  let box = null;

  const qid = () => "q" + Math.random().toString(36).slice(2, 8);
  // every question needs an id: result-list entries refer to their answers through it
  const ensureIds = () => { doc.sections.forEach((s) => s.questions.forEach((q) => { if (!q.id) q.id = qid(); })); };
  const blankQuestion = (like) => ({
    id: qid(),
    text: "",
    options: like ? like.options.map((o) => (o.idk ? { text: "", idk: true } : { text: "", to: [] })) : [1, 2, 3, 4, 5].map(() => ({ text: "", to: [] })),
  });
  const newSection = (poles) => ({ id: sid(), title: "", short: "", poles, mid: poles.length === 2 ? "Balanced" : undefined, questions: [blankQuestion()] });
  const newDoc = () => ({ title: "", eyebrow: "", intro: "", sections: [newSection(["", ""])], matches: [] });

  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), doc);
  function put(path, v) {
    const ks = path.split("."), last = ks.pop();
    ks.reduce((o, k) => o[k], doc)[last] = v;
  }
  const touch = () => { dirty = true; const s = $("#mk-status"); if (s) { s.textContent = "Unsaved changes"; s.className = "w-status warn"; } };

  /* ───────── /quiz-maker ───────── */
  async function show(slug) {
    box = $("#quiz-maker-box");
    quizMaker.site.setTitle("Quiz maker", "");
    const me = await L().loadMe();
    if (!me.user || me.user.role !== "admin") {
      box.innerHTML = `<h1 class="page-h">Quiz maker</h1><p class="note">Only Silver can make quizzes. <a class="text-link" href="login?next=${encodeURIComponent(location.pathname)}" data-link>Sign in</a></p>`;
      return;
    }
    if (!slug) return showList();
    if (slug === "new") { doc = newDoc(); meta = { slug: "", summary: "", published: false, isNew: true }; dirty = false; openKeys = new Set(["s.0"]); return draw(); }
    box.innerHTML = `<p class="note">Loading…</p>`;
    try {
      const { quiz } = await L().api("quizzes/" + encodeURIComponent(slug));
      const { slug: s, published, summary, updated, ...rest } = quiz;
      doc = rest; meta = { slug: s, summary: summary || "", published, isNew: false }; dirty = false; openKeys = new Set();
      ensureIds(); draw();
    } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p><p class="center"><a class="text-link" href="quiz-maker" data-link>Back to the list</a></p>`; }
  }

  async function showList() {
    box.innerHTML = `<h1 class="page-h">Quiz maker</h1><p class="note">Loading…</p>`;
    try {
      const { quizzes } = await L().api("quizzes");
      box.innerHTML = `<h1 class="page-h">Quiz maker</h1>
        <p class="lead center">Quizzes can be spectra (two poles) or polygons (three or more), and can name the closest sect, figure or anything else you list.</p>
        <p class="row-center q-row"><a class="btn" href="quiz-maker/new" data-link>New quiz</a>
          <label class="btn ghost">Import a quiz file<input type="file" id="mk-import-new" accept=".json,application/json" hidden></label></p>
        <div class="article-list">${quizzes.map((q) => `<div class="mk-row">
          <a class="item" href="quiz-maker/${esc(q.slug)}" data-link><span class="item-title">${esc(q.title)}${q.published ? "" : ' <span class="author-tag held-tag">Draft</span>'}</span>
            <span class="meta">${q.questions} questions · /quiz/${esc(q.slug)}</span></a>
          <a class="link-btn" href="quiz/${esc(q.slug)}" data-link>View</a></div>`).join("") || `<p class="empty">No quizzes yet.</p>`}</div>
        <p class="center"><a class="text-link" href="quizzes" data-link>← All quizzes</a></p>`;
      $("#mk-import-new").onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { importFile(await f.text(), true); draw(); } catch (err) { alert(err.message); }
      };
    } catch (e) { box.innerHTML = `<h1 class="page-h">Quiz maker</h1><p class="note">${esc(e.message)}</p>`; }
  }

  /* a quiz file: the quiz itself, optionally with slug, summary and published as Export writes them */
  function importFile(text, asNew) {
    let j; try { j = JSON.parse(text); } catch { throw new Error("That file isn't a quiz (it couldn't be read)."); }
    if (!j || !Array.isArray(j.sections)) throw new Error("That file isn't a quiz (no sections in it).");
    const { slug, summary, published, updated, ...rest } = j;
    doc = rest; doc.matches = doc.matches || []; ensureIds();
    meta = asNew ? { slug: slugify(slug || doc.title || ""), summary: summary || "", published: false, isNew: true } : { ...meta, summary: summary ?? meta.summary };
    dirty = true; openKeys = new Set();
    history.replaceState(null, "", "/quiz-maker/" + (asNew ? "new" : meta.slug));
  }

  /* ───────── drawing the editor ───────── */
  const label = (text, inner, cls = "") => `<label class="${cls}"><span>${text}</span>${inner}</label>`;
  const inp = (path, extra = "") => `<input type="text" data-f="${path}" value="${esc(get(path))}" ${extra}>`;

  function draw() {
    const scroll = window.scrollY;
    quizMaker.site.setTitle(doc.title ? "Editing " + doc.title : "New quiz", "");
    box.innerHTML = `
      <div class="w-bar">
        <a class="back" href="quiz-maker" data-link>← Quizzes</a>
        <span class="spacer"></span>
        <span class="w-status${dirty ? " warn" : ""}" id="mk-status">${dirty ? "Unsaved changes" : "Saved"}</span>
        <button class="btn small-btn" type="button" data-act="save">Save</button>
      </div>
      <h1 class="page-h">${meta.isNew ? "New quiz" : "Edit quiz"}</h1>
      <div class="form mk-form">
        ${label("Title", inp("title", 'maxlength="120"'))}
        ${label("Address <small>(quiz/…)</small>", `<input type="text" id="mk-slug" value="${esc(meta.slug)}" maxlength="60" ${meta.isNew ? "" : "disabled"} placeholder="made from the title">`)}
        ${label("Summary <small>(in the list and in link previews)</small>", `<textarea id="mk-summary" maxlength="300" rows="2">${esc(meta.summary)}</textarea>`)}
        ${label("Line above the title <small>(optional)</small>", inp("eyebrow", 'maxlength="80"'))}
        ${label("Introduction", `<textarea data-f="intro" maxlength="2000" rows="4">${esc(doc.intro)}</textarea>`)}
        <label class="check"><input type="checkbox" id="mk-pub"${meta.published ? " checked" : ""}> Published <small>(a draft can only be seen by you)</small></label>
      </div>

      <div class="ink-rule" data-rule="21"></div>
      <h2 class="section-h">Sections</h2>
      <p class="lead center">Each section is one spectrum or polygon on the results. Two poles make a spectrum; three or more make a polygon.</p>
      <div id="mk-sections">${doc.sections.map((_, si) => detailsHTML(`s.${si}`, sectionSummary(si), si === 0 && doc.sections.length === 1)).join("")}</div>
      <p class="row-center q-row"><button class="btn ghost small-btn" type="button" data-act="add-section">Add a section</button></p>

      <div class="ink-rule" data-rule="22"></div>
      <h2 class="section-h">Result lists</h2>
      <p class="lead center">Optional. Each list (sects, figures…) names the entry the person's answers sit closest to. Set where each entry stands in every section.</p>
      <div id="mk-matches">${doc.matches.map((_, gi) => detailsHTML(`g.${gi}`, groupSummary(gi), false)).join("")}</div>
      <p class="row-center q-row"><button class="btn ghost small-btn" type="button" data-act="add-group"${doc.matches.length >= 4 ? " disabled" : ""}>Add a result list</button></p>

      <div class="ink-rule" data-rule="23"></div>
      <div class="row-center q-row">
        <button class="btn" type="button" data-act="save">Save</button>
        ${meta.isNew ? "" : `<a class="btn ghost" href="quiz/${esc(meta.slug)}" target="_blank" rel="noopener">View the quiz ↗</a>`}
        <button class="btn ghost" type="button" data-act="export">Export file</button>
        <label class="btn ghost">Import file<input type="file" id="mk-import" accept=".json,application/json" hidden></label>
        ${meta.isNew ? "" : `<button class="btn danger" type="button" data-act="delete-quiz">Delete quiz</button>`}
      </div>
      <p class="form-note center" id="mk-msg"></p>`;
    box.querySelectorAll(".ink-rule").forEach((el) => quizMaker.site.inkRule && quizMaker.site.inkRule(el));
    box.querySelectorAll("details[open][data-key]").forEach(fillBody);
    $("#mk-import").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await L().confirmBox({ title: "Replace what's here?", text: "The quiz in the editor is replaced by the file's. Nothing is saved until you press Save.", yes: "Replace" }))) { e.target.value = ""; return; }
      try { importFile(await f.text(), false); draw(); } catch (err) { say(err.message, "err"); }
    };
    window.scrollTo(0, scroll);
  }

  const say = (m, kind = "err") => L().say($("#mk-msg"), m, kind);

  const detailsHTML = (key, summary, open) =>
    `<details class="mk-d" data-key="${key}"${open || openKeys.has(key) ? " open" : ""}><summary>${esc(summary)}</summary><div class="mk-body"></div></details>`;
  const sectionSummary = (si) => {
    const s = doc.sections[si];
    return `${si + 1}. ${clip(s.title, 70) || "(untitled section)"} · ${s.poles.length === 2 ? "spectrum" : `polygon, ${s.poles.length} corners`} · ${s.questions.length} questions`;
  };
  const questionSummary = (si, qi) => `${qi + 1}. ${clip(doc.sections[si].questions[qi].text, 90) || "(blank question)"}`;
  const groupSummary = (gi) => `${clip(doc.matches[gi].title || doc.matches[gi].label, 60) || "(untitled list)"} · ${doc.matches[gi].items.length} entries`;
  const itemSummary = (gi, ii) => clip(doc.matches[gi].items[ii].name, 70) || "(unnamed entry)";
  const pickSummary = (gi, ii) => {
    const it = doc.matches[gi].items[ii], all = doc.sections.reduce((n, s) => n + s.questions.length, 0);
    const set = doc.sections.reduce((n, s) => n + s.questions.filter((q) => it.picks && it.picks[q.id]).length, 0);
    return `How it would answer each question (${set} of ${all} set)`;
  };

  function summaryFor(key) {
    const [kind, a, b] = key.split(".");
    try {
      if (kind === "s") return sectionSummary(+a);
      if (kind === "q") return questionSummary(+a, +b);
      if (kind === "g") return groupSummary(+a);
      if (kind === "m") return itemSummary(+a, +b);
      if (kind === "a") return pickSummary(+a, +b);
    } catch { }
    return "";
  }

  function fillBody(d) {
    const body = $(".mk-body", d);
    if (body.dataset.done) return;
    body.dataset.done = "1";
    const [kind, a, b] = d.dataset.key.split(".").map((x, i) => (i ? +x : x));
    body.innerHTML = kind === "s" ? sectionBody(a) : kind === "q" ? questionBody(a, b) : kind === "g" ? groupBody(a) : kind === "a" ? pickBody(a, b) : itemBody(a, b);
  }

  function sectionBody(si) {
    const s = doc.sections[si], p = `sections.${si}`, poly = s.poles.length >= 3;
    return `<div class="form">
      ${label("Title <small>(shown above its result)</small>", inp(`${p}.title`, 'maxlength="400"'))}
      ${label("Short name <small>(used in the shared text)</small>", inp(`${p}.short`, 'maxlength="80"'))}
      <fieldset class="mk-poles"><legend>Poles: ${poly ? `polygon with ${s.poles.length} corners` : "spectrum"}</legend>
        ${s.poles.map((_, pi) => `<div class="row">${inp(`${p}.poles.${pi}`, `maxlength="80" placeholder="Pole ${pi + 1}"`)}
          <button class="link-btn danger-link" type="button" data-act="del-pole" data-a="${si}" data-b="${pi}"${s.poles.length <= 2 ? " disabled" : ""}>Remove</button></div>`).join("")}
        <button class="btn ghost small-btn" type="button" data-act="add-pole" data-a="${si}"${s.poles.length >= 8 ? " disabled" : ""}>Add a pole</button>
        <p class="small">${poly ? "Each answer can vote for one or more corners." : "Answers run from the first pole (top of the list) to the second (bottom). A third pole turns this into a polygon."}</p>
      </fieldset>
      ${poly ? "" : label("Label for the middle <small>(for example Balanced)</small>", inp(`${p}.mid`, 'maxlength="80"'))}
      <h3 class="small-h">Questions</h3>
      <div>${s.questions.map((_, qi) => detailsHTML(`q.${si}.${qi}`, questionSummary(si, qi), false)).join("")}</div>
      <div class="row"><button class="btn ghost small-btn" type="button" data-act="add-q" data-a="${si}">Add a question</button></div>
      <div class="row mk-tools">
        <button class="link-btn" type="button" data-act="up-section" data-a="${si}"${si === 0 ? " disabled" : ""}>Move up</button>
        <button class="link-btn" type="button" data-act="down-section" data-a="${si}"${si === doc.sections.length - 1 ? " disabled" : ""}>Move down</button>
        <button class="link-btn danger-link" type="button" data-act="del-section" data-a="${si}"${doc.sections.length <= 1 ? " disabled" : ""}>Delete this section</button>
      </div></div>`;
  }

  function questionBody(si, qi) {
    const s = doc.sections[si], q = s.questions[qi], p = `sections.${si}.questions.${qi}`, poly = s.poles.length >= 3;
    return `<div class="form">
      ${label("Question", `<textarea data-f="${p}.text" maxlength="400" rows="2">${esc(q.text)}</textarea>`)}
      <div class="mk-opts">${q.options.map((o, oi) => `<div class="mk-opt">
        <b>${oi + 1}</b>
        <div class="mk-opt-main">
          <input type="text" data-f="${p}.options.${oi}.text" value="${esc(o.text)}" maxlength="400" placeholder="Answer ${oi + 1}">
          <div class="mk-opt-set">
            <label class="check"><input type="checkbox" data-idk="${p}.options.${oi}"${o.idk ? " checked" : ""}> "I don't know"</label>
            ${poly && !o.idk ? `<span class="mk-to">Votes for:</span>${s.poles.map((pole, pi) => `<label class="check mk-to" title="${esc(pole)}"><input type="checkbox" data-to="${p}.options.${oi}" data-pi="${pi}"${(o.to || []).includes(pi) ? " checked" : ""}> ${esc(clip(pole, 16) || "Pole " + (pi + 1))}</label>`).join("")}` : ""}
          </div></div>
        <div class="mk-opt-tools">
          <button class="link-btn" type="button" data-act="up-opt" data-a="${si}" data-b="${qi}" data-c="${oi}"${oi === 0 ? " disabled" : ""} aria-label="Move answer up">↑</button>
          <button class="link-btn" type="button" data-act="down-opt" data-a="${si}" data-b="${qi}" data-c="${oi}"${oi === q.options.length - 1 ? " disabled" : ""} aria-label="Move answer down">↓</button>
          <button class="link-btn danger-link" type="button" data-act="del-opt" data-a="${si}" data-b="${qi}" data-c="${oi}"${q.options.length <= 2 ? " disabled" : ""} aria-label="Remove answer">✕</button>
        </div></div>`).join("")}</div>
      <div class="row mk-tools">
        <button class="btn ghost small-btn" type="button" data-act="add-opt" data-a="${si}" data-b="${qi}"${q.options.length >= 9 ? " disabled" : ""}>Add an answer</button>
        <button class="link-btn" type="button" data-act="dup-q" data-a="${si}" data-b="${qi}">Duplicate question</button>
        <button class="link-btn" type="button" data-act="up-q" data-a="${si}" data-b="${qi}"${qi === 0 ? " disabled" : ""}>Move up</button>
        <button class="link-btn" type="button" data-act="down-q" data-a="${si}" data-b="${qi}"${qi === s.questions.length - 1 ? " disabled" : ""}>Move down</button>
        <button class="link-btn danger-link" type="button" data-act="del-q" data-a="${si}" data-b="${qi}"${s.questions.length <= 1 ? " disabled" : ""}>Delete question</button>
      </div></div>`;
  }

  function groupBody(gi) {
    const g = doc.matches[gi], p = `matches.${gi}`;
    return `<div class="form">
      ${label("Heading on the results <small>(for example The sect you are closest to)</small>", inp(`${p}.label`, 'maxlength="80"'))}
      ${label("Name of the list <small>(for example Sects)</small>", inp(`${p}.title`, 'maxlength="80"'))}
      <div>${g.items.map((_, ii) => detailsHTML(`m.${gi}.${ii}`, itemSummary(gi, ii), false)).join("")}</div>
      <div class="row mk-tools">
        <button class="btn ghost small-btn" type="button" data-act="add-item" data-a="${gi}">Add an entry</button>
        <button class="link-btn" type="button" data-act="sort-items" data-a="${gi}">Sort A–Z</button>
        <button class="link-btn danger-link" type="button" data-act="del-group" data-a="${gi}">Delete this list</button>
      </div></div>`;
  }

  function pickBody(gi, ii) {
    const it = doc.matches[gi].items[ii];
    it.picks = it.picks || {};
    return doc.sections.map((s, si) => `<h4 class="mk-pick-h">${esc(clip(s.title || s.short, 80) || "Section " + (si + 1))}</h4>` + s.questions.map((q, qi) =>
      `<label class="mk-pick"><span>${qi + 1}. ${esc(clip(q.text, 100))}</span><select data-pick="matches.${gi}.items.${ii}" data-qid="${esc(q.id)}">
        <option value="">(no answer)</option>${q.options.map((o, oi) => (o.idk ? "" : `<option value="${oi + 1}"${it.picks[q.id] === oi + 1 ? " selected" : ""}>${oi + 1}. ${esc(clip(o.text, 80))}</option>`)).join("")}</select></label>`).join("")).join("");
  }

  function itemBody(gi, ii) {
    const it = doc.matches[gi].items[ii], p = `matches.${gi}.items.${ii}`;
    it.pos = it.pos || {};
    const controls = doc.sections.map((s, si) => {
      const v = it.pos[s.id], on = v != null, poly = s.poles.length >= 3;
      let inner = "";
      if (on && poly) {
        const total = v.reduce((a, x) => a + x, 0) || 1;
        inner = s.poles.map((pole, pi) => `<label class="mk-range"><span>${esc(clip(pole, 28))}</span>
          <input type="range" min="0" max="100" value="${Math.round(v[pi] * 100)}" data-pos="${p}" data-sec="${si}" data-pi="${pi}"><output>${Math.round((v[pi] / total) * 100)}%</output></label>`).join("");
      } else if (on) {
        inner = `<label class="mk-range mk-range-line"><span>${esc(clip(s.poles[0], 22))}</span>
          <input type="range" min="0" max="100" value="${Math.round(v * 100)}" data-pos="${p}" data-sec="${si}"><span class="mk-end">${esc(clip(s.poles[1], 22))}</span></label>`;
      }
      return `<fieldset class="mk-pos"><legend>${esc(clip(s.title || s.short, 70) || "Section " + (si + 1))}</legend>
        <label class="check"><input type="checkbox" data-poson="${p}" data-sec="${si}"${on ? " checked" : ""}> Compare on this section</label>${inner}</fieldset>`;
    }).join("");
    return `<div class="form">
      ${label("Name", inp(`${p}.name`, 'maxlength="80"'))}
      ${label("Description", `<textarea data-f="${p}.blurb" maxlength="500" rows="3">${esc(it.blurb)}</textarea>`)}
      <div class="mk-img">
        ${it.image ? `<img src="${esc(it.image)}" alt="" width="72" height="72">` : `<span class="small">No picture yet.</span>`}
        <div class="row">
          <label class="btn ghost small-btn">${it.image ? "Replace picture" : "Upload a picture"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-upload="${p}"></label>
          ${it.image ? `<button class="link-btn" type="button" data-act="clear-img" data-a="${gi}" data-b="${ii}">Remove</button>` : ""}
        </div>
        ${label("…or a picture address <small>(https://…)</small>", inp(`${p}.image`, 'maxlength="300" placeholder="https://"'))}
      </div>
      <h3 class="small-h">How it would answer</h3>
      <p class="small">Pick the answer this entry would give to each question. A result is worked out by comparing answers one by one; an entry with none set is compared by the positions below instead.</p>
      ${detailsHTML(`a.${gi}.${ii}`, pickSummary(gi, ii), false)}
      <h3 class="small-h">Where it stands <small>(used when no answers are set)</small></h3>
      ${controls}
      <div class="row mk-tools">
        <button class="link-btn" type="button" data-act="dup-item" data-a="${gi}" data-b="${ii}">Duplicate</button>
        <button class="link-btn danger-link" type="button" data-act="del-item" data-a="${gi}" data-b="${ii}">Delete this entry</button>
      </div></div>`;
  }

  /* ───────── changes ───────── */
  const eachItem = (fn) => doc.matches.forEach((g) => g.items.forEach(fn));
  function reorderOpt(a, b, c, d) {   // entries' answers follow the answer they chose
    const q = doc.sections[a].questions[b], j = c + d;
    if (j < 0 || j >= q.options.length) return;
    move(q.options, c, d);
    eachItem((it) => { const n = it.picks && it.picks[q.id]; if (n === c + 1) it.picks[q.id] = j + 1; else if (n === j + 1) it.picks[q.id] = c + 1; });
    shiftKeys(); openKeys.add(`s.${a}`); openKeys.add(`q.${a}.${b}`);
  }
  const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; };
  const shiftKeys = () => { openKeys = new Set(); };   // positions changed, so forget which were open

  const ACTIONS = {
    "add-section": () => { doc.sections.push(newSection(["", ""])); openKeys.add(`s.${doc.sections.length - 1}`); },
    "del-section": async (a) => {
      if (!(await L().confirmBox({ title: "Delete this section?", text: "Its questions go with it, and result-list entries lose their position on it.", yes: "Delete", danger: true }))) return false;
      const [gone] = doc.sections.splice(a, 1);
      doc.matches.forEach((g) => g.items.forEach((it) => { if (it.pos) delete it.pos[gone.id]; }));
      shiftKeys();
    },
    "up-section": (a) => { move(doc.sections, a, -1); shiftKeys(); },
    "down-section": (a) => { move(doc.sections, a, 1); shiftKeys(); },
    "add-pole": (a) => {
      const s = doc.sections[a], was = s.poles.length;
      s.poles.push("");
      if (was === 2) {   // spectrum -> polygon: answers start with no votes, entries need new positions
        delete s.mid; s.questions.forEach((q) => q.options.forEach((o) => { if (!o.idk) o.to = []; }));
        doc.matches.forEach((g) => g.items.forEach((it) => { if (it.pos) delete it.pos[s.id]; }));
      } else doc.matches.forEach((g) => g.items.forEach((it) => { if (it.pos && Array.isArray(it.pos[s.id])) it.pos[s.id].push(0); }));
    },
    "del-pole": async (a, b) => {
      const s = doc.sections[a];
      if (s.poles.length <= 2) return false;
      if (!(await L().confirmBox({ title: "Remove this pole?", text: s.poles.length === 3 ? "With two poles left this becomes a spectrum, and the answers' votes and entries' positions on it are cleared." : "Answers that voted for it lose that vote.", yes: "Remove", danger: true }))) return false;
      s.poles.splice(b, 1);
      if (s.poles.length === 2) {
        s.mid = s.mid || "Balanced";
        s.questions.forEach((q) => q.options.forEach((o) => { delete o.to; }));
        doc.matches.forEach((g) => g.items.forEach((it) => { if (it.pos) delete it.pos[s.id]; }));
      } else {
        s.questions.forEach((q) => q.options.forEach((o) => { if (o.to) o.to = o.to.filter((k) => k !== b).map((k) => (k > b ? k - 1 : k)); }));
        doc.matches.forEach((g) => g.items.forEach((it) => { if (it.pos && Array.isArray(it.pos[s.id])) it.pos[s.id].splice(b, 1); }));
      }
    },
    "add-q": (a) => { const s = doc.sections[a]; s.questions.push(blankQuestion(s.questions[s.questions.length - 1])); openKeys.add(`s.${a}`); openKeys.add(`q.${a}.${s.questions.length - 1}`); },
    "dup-q": (a, b) => { const s = doc.sections[a], copy = JSON.parse(JSON.stringify(s.questions[b])); copy.id = qid(); s.questions.splice(b + 1, 0, copy); shiftKeys(); openKeys.add(`s.${a}`); },
    "up-q": (a, b) => { move(doc.sections[a].questions, b, -1); shiftKeys(); openKeys.add(`s.${a}`); },
    "down-q": (a, b) => { move(doc.sections[a].questions, b, 1); shiftKeys(); openKeys.add(`s.${a}`); },
    "del-q": async (a, b) => {
      if (!(await L().confirmBox({ title: "Delete this question?", text: clip(doc.sections[a].questions[b].text, 120) || "It's blank.", yes: "Delete", danger: true }))) return false;
      doc.sections[a].questions.splice(b, 1); shiftKeys(); openKeys.add(`s.${a}`);
    },
    "add-opt": (a, b) => { const poly = doc.sections[a].poles.length >= 3; doc.sections[a].questions[b].options.push(poly ? { text: "", to: [] } : { text: "" }); },
    "del-opt": (a, b, c) => {
      const q = doc.sections[a].questions[b];
      q.options.splice(c, 1);
      eachItem((it) => { const n = it.picks && it.picks[q.id]; if (n === c + 1) delete it.picks[q.id]; else if (n > c + 1) it.picks[q.id] = n - 1; });
      shiftKeys(); openKeys.add(`s.${a}`); openKeys.add(`q.${a}.${b}`);
    },
    "up-opt": (a, b, c) => reorderOpt(a, b, c, -1),
    "down-opt": (a, b, c) => reorderOpt(a, b, c, 1),
    "add-group": () => { doc.matches.push({ id: sid(), title: "", label: "", items: [] }); openKeys.add(`g.${doc.matches.length - 1}`); },
    "del-group": async (a) => {
      if (!(await L().confirmBox({ title: "Delete this list?", text: `“${doc.matches[a].title || doc.matches[a].label || "Untitled"}” and its ${doc.matches[a].items.length} entries.`, yes: "Delete", danger: true }))) return false;
      doc.matches.splice(a, 1); shiftKeys();
    },
    "add-item": (a) => { doc.matches[a].items.push({ name: "", blurb: "", image: "", pos: {}, picks: {} }); openKeys.add(`g.${a}`); openKeys.add(`m.${a}.${doc.matches[a].items.length - 1}`); },
    "dup-item": (a, b) => { const l = doc.matches[a].items, c = JSON.parse(JSON.stringify(l[b])); c.name = c.name ? c.name + " (copy)" : ""; l.splice(b + 1, 0, c); shiftKeys(); openKeys.add(`g.${a}`); },
    "del-item": (a, b) => { doc.matches[a].items.splice(b, 1); shiftKeys(); openKeys.add(`g.${a}`); },
    "sort-items": (a) => { doc.matches[a].items.sort((x, y) => x.name.localeCompare(y.name)); shiftKeys(); openKeys.add(`g.${a}`); },
    "clear-img": (a, b) => { doc.matches[a].items[b].image = ""; openKeys.add(`g.${a}`); openKeys.add(`m.${a}.${b}`); },
  };

  /* ───────── saving ───────── */
  async function save(button) {
    const slug = meta.isNew ? slugify($("#mk-slug").value || doc.title) : meta.slug;
    if (!slug) return say("Give the quiz a title (or an address) first.");
    meta.summary = $("#mk-summary").value; meta.published = $("#mk-pub").checked;
    say("");
    try {
      await L().busy(button, "Saving…", () => L().api("admin/quizzes", { slug, summary: meta.summary, published: meta.published, create: meta.isNew, quiz: doc }));
      const wasNew = meta.isNew;
      meta.slug = slug; meta.isNew = false; dirty = false;
      if (wasNew) history.replaceState(null, "", "/quiz-maker/" + slug);
      draw();
      say("Saved.", "ok");
    } catch (e) { say(e.message); }
  }

  const readPicture = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d"), side = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn't be read. Try a PNG or JPEG.")); };
    img.src = url;
  });

  /* ───────── events (one set, on the container the editor is drawn into) ───────── */
  function wire() {
    const root = $("#quiz-maker-box");
    root.addEventListener("toggle", (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.dataset.key) return;
      if (d.open) { openKeys.add(d.dataset.key); fillBody(d); } else openKeys.delete(d.dataset.key);
    }, true);

    root.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.f) { put(t.dataset.f, t.value); touch(); refreshSummaries(); }
      else if (t.dataset.pos) {   // a position slider
        const it = get(t.dataset.pos), s = doc.sections[+t.dataset.sec];
        if (s.poles.length >= 3) {
          it.pos[s.id][+t.dataset.pi] = t.value / 100;
          const total = it.pos[s.id].reduce((a, x) => a + x, 0) || 1;
          t.closest(".mk-pos").querySelectorAll("input[type=range]").forEach((r, k) => { r.nextElementSibling.textContent = Math.round((it.pos[s.id][k] / total) * 100) + "%"; });
        } else it.pos[s.id] = t.value / 100;
        touch();
      }
    });

    root.addEventListener("change", async (e) => {
      const t = e.target;
      if (t.id === "mk-slug" || t.id === "mk-summary" || t.id === "mk-pub") { touch(); return; }
      if (t.dataset.idk) {
        const o = get(t.dataset.idk), poly = doc.sections[+t.dataset.idk.split(".")[1]].poles.length >= 3;
        if (t.checked) { o.idk = true; delete o.to; } else { delete o.idk; if (poly) o.to = []; }
        touch(); const d = t.closest("details"); d.querySelector(".mk-body").dataset.done = ""; fillBody(d); return;
      }
      if (t.dataset.to) {
        const o = get(t.dataset.to), k = +t.dataset.pi, set = new Set(o.to || []);
        t.checked ? set.add(k) : set.delete(k);
        o.to = [...set].sort((a, b) => a - b); touch(); return;
      }
      if (t.dataset.poson) {
        const it = get(t.dataset.poson), s = doc.sections[+t.dataset.sec];
        if (t.checked) it.pos[s.id] = s.poles.length >= 3 ? s.poles.map(() => 1 / s.poles.length) : 0.5; else delete it.pos[s.id];
        touch(); const d = t.closest("details"); d.querySelector(".mk-body").dataset.done = ""; fillBody(d); return;
      }
      if (t.dataset.pick) {
        const it = get(t.dataset.pick); it.picks = it.picks || {};
        t.value ? (it.picks[t.dataset.qid] = +t.value) : delete it.picks[t.dataset.qid];
        touch(); refreshSummaries(); return;
      }
      if (t.dataset.upload) {
        const f = t.files[0]; if (!f) return;
        try {
          const dataUrl = await readPicture(f);
          const { url } = await L().api("admin/quiz-images", { image: dataUrl });
          put(t.dataset.upload + ".image", url); touch();
          const d = t.closest("details"); d.querySelector(".mk-body").dataset.done = ""; fillBody(d);
        } catch (err) { say(err.message); }
        return;
      }
      if (t.dataset.f && t.dataset.f.endsWith(".image")) { const d = t.closest("details"); d.querySelector(".mk-body").dataset.done = ""; fillBody(d); }
    });

    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      e.preventDefault();
      const act = b.dataset.act, [a, bb, c] = [b.dataset.a, b.dataset.b, b.dataset.c].map((x) => (x == null ? undefined : +x));
      if (act === "save") return save(b);
      if (act === "export") {
        const blob = new Blob([JSON.stringify({ slug: meta.slug, summary: meta.summary, published: meta.published, ...doc }, null, 1)], { type: "application/json" });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${meta.slug || slugify(doc.title) || "quiz"}.quiz.json`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        return;
      }
      if (act === "delete-quiz") {
        if (!(await L().confirmBox({ title: "Delete this quiz?", text: `“${doc.title}” and everyone's saved results for it will be deleted for good.`, yes: "Delete quiz", danger: true }))) return;
        try { await L().api(`admin/quizzes/${encodeURIComponent(meta.slug)}/delete`, {}); dirty = false; quizMaker.site.go("/quiz-maker"); }
        catch (err) { say(err.message); }
        return;
      }
      const fn = ACTIONS[act];
      if (!fn) return;
      if ((await fn(a, bb, c)) === false) return;
      touch(); draw();
    });
  }

  function refreshSummaries() {
    box.querySelectorAll("details[data-key]").forEach((d) => { const s = $(":scope > summary", d); const t = summaryFor(d.dataset.key); if (s && t && s.textContent !== t) s.textContent = t; });
  }

  addEventListener("beforeunload", (e) => { if (dirty && box && box.isConnected && !box.closest("[hidden]")) { e.preventDefault(); e.returnValue = ""; } });

  window.quizMaker = { show, site: { go: (u) => { location.href = u; }, setTitle: () => {}, inkRule: null } };
  $("#quiz-maker-box") && wire();
})();
