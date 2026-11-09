/* The guided tour: a short animated walk through the compound in a window that can go fullscreen. The camera flies to
   the ring and then to each group in turn (highlighted in the 3D model) and says what the group does; then it goes through
   the effects, how it moves through the body, when it acts, and the timeline day by day.
   What each group does *here* is worked out by taking it off and re-rating the compound, so the numbers are the model's. */
import { createViewer } from "./viewer.js";
import { assemble, profile } from "./chem.js";
import { PATTERNS, STATUS_NOTE, LEVELS, resolve } from "./effects.js";
import { fitOf, fitLabel, featuresOf, topEffects, hazard, harmReport } from "./predict.js";
import { ROUTES, estimateTime, estimateCurve, requestCurve, curveSvg, formatMinutes } from "./timecourse.js";
import { buildTimeline, timelineSvg, timelineGeometry, formatDay, TONES } from "./timeline.js";
import { ROLE, coreRole } from "./roles.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (f) => Math.round(f * 100) + "%";
const sign = (n, d = 1) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const effectTitle = (r) => (r.modeId && r.label ? `${r.name}: ${r.label.replace(/ \(.*\)$/, "")}` : r.name);
const stat = (label, value, note = "") => `<div class="tour-stat"><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
const fitBar = (f) => `<div class="tour-fit"><i style="--w:${pct(f)}"></i><b>${pct(f)}</b></div>`;
const list = (names) => (names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] || "");
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const SHAPE_WORDS = { spike: "hits as a sharp spike, then fades", rise: "rises quickly, then holds", gradual: "builds up gradually", delayed: "stays quiet, then surges", waves: "comes in waves" };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ───────── what to say, step by step ───────── */
function buildSteps(ctx) {
  const { info, core, placed, custom } = ctx;
  const prof = profile(info.smiles);
  const asm = custom ? null : assemble(core, placed);
  const parts = asm ? asm.parts : [];
  const heavy = info.graph.atoms.map((a, i) => (a.el === "H" ? -1 : i)).filter((i) => i >= 0);
  const ringAtoms = asm ? asm.map : [];
  const d = prof.desc;

  // the effects to talk about: the chosen ones, or what the structure suits best if none were chosen
  const chosen = ctx.effects.length > 0;
  const items = (chosen ? ctx.effects.map((sel) => ({ sel, r: resolve(sel) })) : topEffects(prof, 0.55, 4).map((t) => ({ sel: null, r: t.effect }))).map((it) => ({ ...it, fit: fitOf(it.r, prof) }));

  // take each group off in turn and re-rate: what it adds, and which effects it helps or hurts
  const wanted = new Set(items.flatMap((it) => (it.r.needs || []).flatMap((n) => n.all)));
  const loo = parts.map((part) => {
    const p2 = profile(assemble(core, placed.filter((q) => q !== part.placed)).smiles);
    return {
      part, p2,
      dMW: d.amw - p2.desc.amw, dLogP: d.CrippenClogP - p2.desc.CrippenClogP, dTPSA: d.tpsa - p2.desc.tpsa,
      gained: [...prof.flags].filter((f) => !p2.flags.has(f) && wanted.has(f) && PATTERNS[f]),
      delta: items.map((it) => it.fit.fit - fitOf(it.r, p2).fit),
      without: items.map((it) => fitOf(it.r, p2).fit),
    };
  });

  const steps = [];
  const add = (s) => steps.push(s);
  const nameLine = ctx.name ? esc(ctx.name) : "Your structure";

  /* 1. introduction */
  add({
    id: "intro", kicker: "Guided tour", title: ctx.name || "Your compound",
    html: `<p class="tour-formula">${ctx.formula}</p>
      <p class="tour-lead">${custom ? `A structure entered as SMILES: ${heavy.length} atoms apart from hydrogen.` : `${heavy.length} atoms apart from hydrogen: a ${esc(core.name.toLowerCase())} ring carrying ${parts.length ? `${parts.length} group${parts.length === 1 ? "" : "s"}` : "no groups yet"}.`}</p>
      <p>This tour looks at what each part does, then what the compound would do, how it moves through the body, and when.</p>`,
    strong: [], soft: [],
  });

  /* 2. the ring, then each group */
  if (!custom) {
    add({
      id: "ring", kicker: "The ring", title: core.name.replace(/ \(.*\)$/, ""),
      html: `<p class="tour-lead">The frame everything hangs from.</p>${coreRole(core).map((t) => `<p>${esc(t)}</p>`).join("")}`,
      strong: ringAtoms, soft: [], label: core.name.replace(/ \(.*\)$/, ""),
    });
    for (const l of loo) {
      const sub = l.part.placed.sub, at = core.labels[l.part.placed.atom];
      const moves = items.map((it, k) => ({ it, k, dlt: l.delta[k] })).filter((m) => Math.abs(m.dlt) >= 0.04).sort((a, b) => Math.abs(b.dlt) - Math.abs(a.dlt)).slice(0, 3);
      add({
        id: "g-" + sub.id, kicker: `Group at position ${at}`, title: sub.prefix.replace(/^\[|\]$/g, ""),
        html: `<p class="tour-lead">${esc(ROLE[sub.id] || `A ${sub.prefix} group.`)}</p>
          <h4>What it adds to the molecule</h4>
          <div class="tour-stats">${stat("Weight", sign(l.dMW, 0) + " g/mol")}${stat("Oiliness", sign(l.dLogP) + " logP", l.dLogP > 0.3 ? "more fat-soluble" : l.dLogP < -0.3 ? "more water-soluble" : "about neutral")}${stat("Polar surface", sign(l.dTPSA, 0) + " Å²", l.dTPSA > 8 ? "more polar" : l.dTPSA < -8 ? "less polar" : "")}</div>
          ${l.gained.length ? `<p>With the ring it makes <b>${esc(list(l.gained.map((f) => PATTERNS[f].label)))}</b>, an arrangement the effect model looks for.</p>` : ""}
          ${moves.length ? `<h4>What it does to the effects (without it → with it)</h4><ul class="tour-moves">${moves.map((m) => `<li class="${m.dlt > 0 ? "up" : "down"}"><span>${esc(effectTitle(m.it.r))}</span><b>${pct(l.without[m.k])} → ${pct(m.it.fit.fit)}</b></li>`).join("")}</ul>` : items.length ? `<p class="tour-dim">Taking it off would barely change the ratings; it mainly tunes size and polarity.</p>` : ""}`,
        strong: l.part.atoms, soft: [l.part.attach], label: sub.label.length <= 6 && sub.label !== sub.prefix ? `${sub.label} · ${sub.prefix.replace(/^\[|\]$/g, "")}` : sub.prefix.replace(/^\[|\]$/g, ""),
      });
    }
  } else {
    const found = [...prof.flags].filter((f) => PATTERNS[f]).map((f) => PATTERNS[f].label);
    add({
      id: "found", kicker: "What it contains", title: "Recognised arrangements",
      html: found.length ? `<p class="tour-lead">The effect model recognises these arrangements in the structure:</p><ul class="tour-bullets">${found.slice(0, 10).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p class="tour-lead">No arrangement the effect model looks for was found, so effects are rated on size and polarity alone.</p>`,
      strong: [], soft: [],
    });
  }

  /* 3. how it moves through the body */
  const feat = featuresOf(prof);
  const brain = d.tpsa < 90 && d.amw < 450 && !prof.flags.has("acid") && d.NumHBD <= 3;
  const size = d.amw < 200 ? "small" : d.amw < 350 ? "mid-sized" : "large";
  const oil = d.CrippenClogP < 0 ? "water-loving" : d.CrippenClogP < 2 ? "balanced, leaning towards water" : d.CrippenClogP < 4 ? "fat-loving" : "very oily";
  add({
    id: "body", kicker: "The whole molecule", title: "How it moves through the body",
    html: `<div class="tour-stats">${stat("Weight", d.amw.toFixed(0) + " g/mol", size)}${stat("Oiliness", d.CrippenClogP.toFixed(1) + " logP", oil)}${stat("Polar surface", d.tpsa.toFixed(0) + " Å²", d.NumHBD + " H-bond donors")}</div>
      <p>${brain ? "It is small and not very polar, so it could cross the blood–brain barrier and act on the brain." : prof.flags.has("acid") ? "Its acid group is charged in the blood, which keeps it largely out of the brain." : "It is big or polar enough that it would mostly stay out of the brain."}</p>
      <p>${esc(feat.text.form)}. ${esc(feat.text.colour)}. ${esc(feat.text.solubility)}.</p>`,
    strong: [], soft: [],
  });

  /* 4. the effects */
  items.forEach((it, k) => {
    const r = it.r, f = it.fit.fit;
    const helped = loo.filter((l) => l.delta[k] >= 0.05).sort((a, b) => b.delta[k] - a.delta[k]);
    const held = loo.filter((l) => l.delta[k] <= -0.06).sort((a, b) => a.delta[k] - b.delta[k]);
    const name = (l) => l.part.placed.sub.prefix.replace(/^\[|\]$/g, "");
    add({
      id: "e-" + r.id, kicker: k === 0 ? (chosen ? "The effects you chose" : "What it suits best") : chosen ? "Effect" : "Also suited", title: effectTitle(r),
      html: `<p><span class="badge ${r.status}">${esc(r.status)}</span> <span class="tour-dim">${esc(STATUS_NOTE[r.status])}</span>${it.sel ? ` <span class="tour-dim">Asked for: ${LEVELS[it.sel.level]}.</span>` : ""}</p>
        <p class="tour-lead">${esc(r.mech)}</p>
        <h4>How well this structure suits it</h4>${fitBar(f)}
        <p class="tour-dim">${esc(cap(fitLabel(f)))}${it.fit.why || it.fit.missing ? ". " + esc(cap(it.fit.why || it.fit.missing)) : ""}.</p>
        ${helped.length ? `<p><b>Doing the work:</b> ${esc(list(helped.slice(0, 3).map(name)))}.</p>` : parts.length ? `<p class="tour-dim">No single group carries this: it comes from the size and polarity of the whole molecule.</p>` : ""}
        ${held.length ? `<p><b>Holding it back:</b> ${esc(list(held.slice(0, 2).map(name)))}.</p>` : ""}`,
      strong: helped.slice(0, 3).flatMap((l) => l.part.atoms), soft: helped.length ? ringAtoms : [],
      label: helped.length ? list(helped.slice(0, 3).map(name)) : "",
    });
  });

  /* 5. when it acts */
  const est = estimateTime(prof, ctx.time.route, items.map((it) => it.r));
  const req = requestCurve(ctx.time);
  const way = ROUTES.find((r) => r.id === ctx.time.route).label.toLowerCase();
  add({
    id: "time", kicker: "Time course", title: "When it acts and how long it lasts",
    html: `<div class="tour-reveal">${curveSvg([req && { curve: req, colour: "#8ab4ff", dashed: true }, { curve: estimateCurve(est), colour: "#7fe3b0" }], 380, 120)}</div>
      <p class="tour-lead">${esc(way[0].toUpperCase() + way.slice(1))}, it starts to act after <b>${esc(formatMinutes(est.onsetMin))}</b>${SHAPE_WORDS[est.shape] ? `; then it ${SHAPE_WORDS[est.shape]}` : ""}.</p>
      <p>${est.permanent ? "It leaves damage that does not heal." : `Its effects last <b>${esc(formatMinutes(est.durationMin))}</b>.`} The body clears half of it about every ${est.halfLifeH < 1 ? Math.round(est.halfLifeH * 60) + " minutes" : Math.round(est.halfLifeH) + " hours"}.${est.accumulates ? " It is oily enough to build up in body fat." : ""}</p>
      ${req ? `<p class="tour-dim">Dashed line: the time course you asked for. Solid: the estimate for this structure.</p>` : ""}`,
    strong: [], soft: [], ms: 11000,
    update(p, el) { const r = el.querySelector(".tour-reveal"); if (r) r.style.clipPath = `inset(0 ${Math.max(0, 100 - clamp(p / 0.55, 0, 1) * 100)}% 0 0)`; },
  });

  /* 6. the timeline, day by day */
  if (chosen) {
    const tl = buildTimeline(ctx.effects, ctx.time, ctx.rescue);
    const g = timelineGeometry(tl, 330);
    const svg = timelineSvg(tl, 330).replace("</svg>", `<line class="tl-play" x1="${g.X(0)}" y1="${g.top - 8}" x2="${g.X(0)}" y2="${g.h - 16}" stroke="#fff" stroke-width="1.5"/></svg>`);
    const evs = tl.events;
    add({
      id: "timeline", kicker: "The timeline", title: tl.collapse && !tl.collapse.averted ? "What happens day by day" : "Day by day",
      html: `<div class="tour-clock" data-clock>Day 0</div><div class="tour-chart">${svg}</div>
        <ul class="tour-ticker" data-ticker></ul>
        <p class="tour-dim">${evs.length ? "Days are rough rule-of-thumb figures." : "Nothing here goes wrong over time."}${tl.rescue != null ? " The cure is given on day " + Math.round(tl.rescue) + "." : ""}</p>`,
      strong: [], soft: [], ms: clamp(9000 + evs.length * 1100, 13000, 24000),
      update(p, el) {
        const day = clamp(p / 0.9, 0, 1) * g.last, ph = el.querySelector(".tl-play");
        if (ph) { ph.setAttribute("x1", g.X(day)); ph.setAttribute("x2", g.X(day)); }
        const clock = el.querySelector("[data-clock]");
        if (clock) clock.textContent = day < 1 / 24 ? "Start" : formatDay(day).replace(/^~/, "").replace(/^\w/, (c) => c.toUpperCase());
        const seen = evs.filter((e) => e.day <= day), ul = el.querySelector("[data-ticker]");
        const hit = tl.collapse && !tl.collapse.averted && day >= tl.collapse.day;
        const key = seen.length + ":" + hit;
        if (ul && ul.dataset.key !== key) {
          ul.dataset.key = key;
          const rows = seen.slice(-3).reverse().map((e, i) => `<li style="--o:${i === 0 ? 1 : i === 1 ? 0.65 : 0.4}"><i class="dot" style="background:${TONES[e.tone] || "#ccc"}"></i><b>${esc(formatDay(e.day))}</b> ${esc(e.text)}</li>`);
          if (hit) rows.unshift(`<li class="collapse-row"><i class="dot" style="background:#ff5c5c"></i><b>${esc(formatDay(tl.collapse.day))}</b> ${esc(tl.collapse.text)}</li>`);
          ul.innerHTML = rows.join("");
        }
      },
    });
  }

  /* 7. the summary */
  const weak = items.filter((it) => it.fit.fit < 0.55).map((it) => effectTitle(it.r));
  const strongOnes = items.filter((it) => it.fit.fit >= 0.75).length;
  const hz = hazard(ctx.effects), hr = harmReport(ctx.effects);
  add({
    id: "end", kicker: "In short", title: "What to take away",
    html: `<ul class="tour-bullets">
        <li>${strongOnes} of ${items.length} effect${items.length === 1 ? "" : "s"} ${strongOnes === 1 ? "is a" : "are a"} strong fit.</li>
        ${weak.length ? `<li>Weak fits: ${esc(list(weak))}. The tuning tool can look for a small change that raises them.</li>` : ""}
        ${hr ? `<li>${esc(hr.text)}</li>` : ""}${hz ? `<li>${esc(hz.text)}</li>` : ""}
      </ul>
      <p class="tour-dim">Everything here is theoretical, built for fiction: ratings come from the size, polarity and groups of the structure, not from tests, and nothing says the compound would exist, work or be safe.</p>`,
    strong: [], soft: [],
  });

  for (const s of steps) if (!s.ms) s.ms = clamp(3800 + s.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length * 230, 6500, 17000);
  return steps;
}

/* ───────── the window ───────── */
export function openTour(ctx) {
  const steps = buildSteps(ctx);
  const opener = document.activeElement;
  const root = document.createElement("div");
  root.className = "tour"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Guided explanation of the compound");
  root.innerHTML = `
    <div class="tour-main">
      <div class="tour-stage"><div class="tour-view"></div><div class="tour-label" hidden></div><p class="tour-help">Drag to turn · scroll to zoom</p></div>
      <aside class="tour-card"><div class="tour-kicker"></div><h2 class="tour-title"></h2><div class="tour-body"></div></aside>
    </div>
    <div class="tour-bar">
      <div class="tour-segs">${steps.map((s, i) => `<button type="button" class="tour-seg" data-go="${i}" title="${esc(s.title)}" aria-label="Go to: ${esc(s.title)}"><i></i></button>`).join("")}</div>
      <div class="tour-ctl">
        <button type="button" class="tour-btn" data-act="prev" aria-label="Previous step">◀</button>
        <button type="button" class="tour-btn big" data-act="play" aria-label="Pause">⏸</button>
        <button type="button" class="tour-btn" data-act="next" aria-label="Next step">▶</button>
        <span class="tour-count" aria-live="off"></span>
        <span class="tour-gap"></span>
        <button type="button" class="tour-btn wide" data-act="full">Fullscreen</button>
        <button type="button" class="tour-btn wide" data-act="close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const $ = (s) => root.querySelector(s);
  const card = $(".tour-card"), body = $(".tour-body"), label = $(".tour-label"), play = $('[data-act="play"]'), segs = [...root.querySelectorAll(".tour-seg")];
  const viewer = createViewer($(".tour-view"));
  viewer.setHydrogens(false);
  viewer.setMolecule(ctx.info.graph, ctx.coords);

  let i = -1, t = 0, playing = !reduced(), last = performance.now(), raf = 0, cur = null;

  function show(n) {
    i = clamp(n, 0, steps.length - 1); t = 0; cur = steps[i];
    segs.forEach((s, k) => { s.classList.toggle("done", k < i); s.classList.toggle("now", k === i); s.firstElementChild.style.width = k < i ? "100%" : "0"; });
    $(".tour-kicker").textContent = cur.kicker; $(".tour-title").textContent = cur.title; $(".tour-title").classList.toggle("long", cur.title.length > 34);
    body.innerHTML = cur.html; body.classList.remove("tour-in"); void body.offsetWidth; body.classList.add("tour-in");
    [...body.children].forEach((c, k) => c.style.setProperty("--i", k));
    card.scrollTop = 0;
    $(".tour-count").textContent = `${i + 1} / ${steps.length}`;
    viewer.setFocus(cur.strong && cur.strong.length ? { strong: cur.strong, soft: cur.soft } : null);
    viewer.flyTo(cur.strong && cur.strong.length ? cur.strong : null);
    viewer.setDrift(!reduced(), cur.strong && cur.strong.length ? 0.5 : 1.1);
    label.hidden = !cur.label; label.textContent = cur.label || "";
    if (cur.update) cur.update(0, body);
    setPlay(playing && true);
  }
  function setPlay(on) {
    playing = on; last = performance.now();
    play.textContent = on ? "⏸" : (i === steps.length - 1 && t >= cur.ms ? "↻" : "▶");
    play.setAttribute("aria-label", on ? "Pause" : "Play");
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = now - last; last = now;
    if (!playing || !cur) return;
    t += dt;
    const p = clamp(t / cur.ms, 0, 1);
    segs[i].firstElementChild.style.width = pct(p);
    if (cur.update) cur.update(p, body);
    if (p >= 1) { if (i < steps.length - 1) show(i + 1); else setPlay(false); }
  }
  // the label follows the group on screen as the model turns
  viewer.onFrame = () => {
    if (label.hidden || !cur || !cur.strong || !cur.strong.length) return;
    const pr = viewer.project(cur.strong);
    if (!pr) return;
    const stage = $(".tour-view"), w = stage.clientWidth;
    label.style.left = clamp(pr.x, 70, w - 70) + "px"; label.style.top = Math.max(pr.y, 70) + "px"; label.style.opacity = pr.behind ? 0.25 : 1;
  };

  const fsOn = () => document.fullscreenElement === root;
  const fsBtn = $('[data-act="full"]');
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  const syncFs = () => { fsBtn.textContent = fsOn() ? "Exit fullscreen" : "Fullscreen"; requestAnimationFrame(() => viewer.resize()); };
  document.addEventListener("fullscreenchange", syncFs);
  const toggleFs = () => { if (fsOn()) document.exitFullscreen(); else root.requestFullscreen && root.requestFullscreen().catch(() => {}); };

  function close() {
    cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", syncFs);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    viewer.destroy(); root.remove();
    document.body.style.overflow = prevOverflow;
    if (opener && opener.focus) opener.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { if (!document.fullscreenElement) close(); }
    else if (e.key === "ArrowRight") { show(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { show(i - 1); e.preventDefault(); }
    else if (e.key === " " && !/BUTTON|SELECT|INPUT/.test(document.activeElement.tagName)) { e.preventDefault(); act("play"); }
    else if (e.key === "f" || e.key === "F") toggleFs();
  }
  function act(a) {
    if (a === "play") {
      if (!playing && i === steps.length - 1 && t >= cur.ms) show(0);
      setPlay(!playing);
    } else if (a === "next") show(i + 1);
    else if (a === "prev") show(t > 2500 || i === 0 ? i : i - 1);
    else if (a === "full") toggleFs();
    else if (a === "close") close();
  }
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-go]");
    if (!b) return;
    if (b.dataset.go != null) show(Number(b.dataset.go)); else act(b.dataset.act);
  });
  document.addEventListener("keydown", onKey);

  show(0);
  play.focus();
  raf = requestAnimationFrame((now) => { last = now; tick(now); });
  return { close };
}
