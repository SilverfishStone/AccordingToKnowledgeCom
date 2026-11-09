/* Compound Lab: build a theoretical compound from a ring and groups, and see its formula, name and 3D shape.
   Groups that would break the bonding rules are greyed out with the reason as a tooltip. */
import { CORES, CORE_BY_ID, SUBS, SUB_BY_ID, SUB_GROUPS } from "./data.js";
import { loadChem, assemble, canAttach, freeHydrogens, analyse, drawFlat, release, isValid, coreSvg } from "./chem.js";
import { nameCompound } from "./naming.js";
import { embed3D } from "./embed3d.js";
import { suggestNames } from "./inn.js";
import { createViewer } from "./viewer.js";
import { EFFECTS, EFFECT_BY_ID, EFFECT_GROUPS, STATUS_NOTE, LEVELS, FEATURES, KIND_INFO, resolve } from "./effects.js";
import { profile } from "./chem.js";
import { fitOf, fitLabel, featuresOf, featureMatch, blockedReason, hazard, topEffects, harmReport, antidoteTargets, antidoteTime } from "./predict.js";
import { findCandidates, findVariants, findBlockers, buildPool, neutralisers, flushers, cureTimes } from "./search.js";
import { buildTimeline, timelineSvg, formatDay, TONES, START_CHOICES, END_CHOICES } from "./timeline.js";
import { openTour } from "./tour.js";
import { ROUTES, ONSETS, BUILDS, DURATIONS, TIME_NOTES, DEFAULT_TIME, estimateTime, timeMatch, timeIsSet, formatMinutes, requestCurve, estimateCurve, curveSvg } from "./timecourse.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const state = { coreId: "benzene", placed: [], active: null, round: 0, custom: null, hover: null, effects: [], features: { form: "any", colour: "any", solubility: "any" }, time: { ...DEFAULT_TIME }, view: "substance", rescue: null, cure: { neutralise: true, flush: true, block: false, reverse: true }, goals: {} };
let info = null, coords = null, viewer = null, current = null;

/* ───────── the address keeps the design, so it can be shared ───────── */
// which cure types are switched on, as letters (neutralise, flush, block, reverse)
const cureCode = () => [["neutralise", "n"], ["flush", "f"], ["block", "b"], ["reverse", "r"]].filter(([k]) => state.cure[k]).map(([, c]) => c).join("");
function saveHash() {
  const g = state.placed.map((p) => `${p.atom}:${p.sub.id}${p.locked ? "!" : ""}`).join(",");
  const e = state.effects.map((x) => `${x.id}:${x.level}:${x.mode || ""}${(x.onset && x.onset !== "inherit") || (x.duration && x.duration !== "inherit") ? ":" + (x.onset || "inherit") + ":" + (x.duration || "inherit") : ""}`).join(","), f = Object.values(state.features).join("."), t = [state.time.route, state.time.onset, state.time.build, state.time.duration].join(".");
  const h = (state.custom ? "#smiles=" + encodeURIComponent(state.custom) : `#core=${state.coreId}${g ? "&g=" + g : ""}`) + (e ? "&e=" + e : "") + (f !== "any.any.any" ? "&f=" + f : "") + (t !== "oral.any.any.any" ? "&t=" + t : "") + (state.view !== "substance" ? "&v=" + state.view : "") + (state.rescue != null ? "&r=" + state.rescue : "") + (cureCode() !== "nfr" ? "&c=" + (cureCode() || "-") : "");
  try { history.replaceState(null, "", h); } catch { /* embedded */ }
}
function loadHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const part of (p.get("e") || "").split(",").filter(Boolean)) {
    const [id, lv, mode, on, du] = part.split(":");
    if (EFFECT_BY_ID[id] && !blockedReason(id, state.effects)) {
      const e = EFFECT_BY_ID[id];
      state.effects.push({
        id, level: Math.min(2, Math.max(0, Number(lv) || 0)), mode: e.modes ? (mode in e.modes ? mode : e.defaultMode) : null,
        onset: START_CHOICES.some((o) => o.id === on) ? on : "inherit", duration: END_CHOICES.some((o) => o.id === du) ? du : "inherit",
      });
    }
  }
  const f = (p.get("f") || "").split(".");
  if (f.length === 3) for (const [i, k] of ["form", "colour", "solubility"].entries()) if (FEATURES[k].options.some(([v]) => v === f[i])) state.features[k] = f[i];
  const t = (p.get("t") || "").split(".");
  if (t.length === 4) for (const [i, [k, list]] of [["route", ROUTES], ["onset", ONSETS], ["build", BUILDS], ["duration", DURATIONS]].entries()) if (list.some((o) => o.id === t[i])) state.time[k] = t[i];
  if (["antidote", "both"].includes(p.get("v"))) state.view = p.get("v");
  if (p.get("r") && Number(p.get("r")) > 0) state.rescue = Number(p.get("r"));
  if (p.get("c") != null) { const c = p.get("c"); state.cure = { neutralise: c.includes("n"), flush: c.includes("f"), block: c.includes("b"), reverse: c.includes("r") }; }
  if (p.get("smiles") && isValid(p.get("smiles"))) { state.custom = p.get("smiles"); return; }
  if (CORE_BY_ID[p.get("core")]) {
    state.coreId = p.get("core");
    const core = CORE_BY_ID[state.coreId];
    for (const part of (p.get("g") || "").split(",").filter(Boolean)) {
      const [a, raw] = part.split(":"), atom = Number(a), id = (raw || "").replace("!", ""), sub = SUB_BY_ID[id];
      if (sub && Number.isInteger(atom) && core.hs[atom] != null && canAttach(core, state.placed, atom, sub).ok) state.placed.push({ atom, sub, locked: (raw || "").endsWith("!") });
    }
  }
}

/* ───────── the picker ───────── */
const coreImgs = new Map();
const coreImg = (c) => { if (!coreImgs.has(c.id)) coreImgs.set(c.id, coreSvg(c, 88, 64)); return coreImgs.get(c.id); };
function renderCores() {
  const groups = [...new Set(CORES.map((c) => c.group))];
  $("#cores").innerHTML = groups.map((g) => `<div class="core-group"><h3>${esc(g)}</h3><div class="core-row">${
    CORES.filter((c) => c.group === g).map((c) => `<button type="button" class="core" data-core="${c.id}" aria-pressed="${!state.custom && c.id === state.coreId}" title="${esc(c.name)}">
      <span class="core-img">${coreImg(c)}</span><span>${esc(c.name)}</span></button>`).join("")}</div></div>`).join("");
}

const core = () => CORE_BY_ID[state.coreId];

function renderPositions() {
  const c = core(), host = $("#positions");
  if (state.custom) { host.innerHTML = ""; return; }
  host.innerHTML = c.atoms.map((el, i) => {
    const free = freeHydrogens(c, state.placed, i), here = state.placed.map((p, idx) => ({ ...p, idx })).filter((p) => p.atom === i);
    const label = `${c.labels[i]} · ${el.replace("H", "")}${el.endsWith("H") ? "–H" : ""}`;
    if (c.hs[i] === 0) return `<div class="pos blank" data-atom="${i}" title="No hydrogen here to replace."><span class="pos-name">${esc(label)}</span><span class="pos-note">no free site</span></div>`;
    return `<div class="pos${state.active === i ? " active" : ""}" data-atom="${i}">
      <span class="pos-name">${esc(label)}</span>
      <span class="chips">${here.map((p) => `<span class="chip-wrap"><button type="button" class="chip" data-remove="${p.idx}" title="Remove ${esc(p.sub.prefix)}">${esc(p.sub.label)} ×</button><button type="button" class="lock" data-lock="${p.idx}" aria-pressed="${!!p.locked}" title="${p.locked ? "Locked: tuning keeps this group" : "Lock this group so tuning keeps it"}">${p.locked ? "🔒" : "🔓"}</button></span>`).join("")}</span>
      <button type="button" class="add" data-add="${i}" ${free > 0 ? "" : "disabled"} title="${free > 0 ? "Add a group here" : "This atom is full."}">${free > 0 ? "+ add" : "full"}</button>
    </div>`;
  }).join("");
}

function renderPalette() {
  const host = $("#palette");
  if (state.custom || state.active == null) { host.hidden = true; return; }
  host.hidden = false;
  const c = core(), label = c.labels[state.active];
  $("#palette-title").textContent = `Add a group at position ${label}`;
  $("#palette-groups").innerHTML = SUB_GROUPS.map((g) => `<div class="sub-group"><h4>${esc(g)}</h4><div class="sub-row">${
    SUBS.filter((s) => s.group === g).map((s) => {
      const r = canAttach(c, state.placed, state.active, s);
      return `<button type="button" class="sub" data-sub="${s.id}" ${r.ok ? "" : "disabled"} title="${esc(r.ok ? s.prefix : r.why)}">${esc(s.label)}</button>`;
    }).join("")}</div></div>`).join("");
}

/* ───────── the results ───────── */
const hillHtml = (formula, charge) => formula.map((f) => f.el + (f.n > 1 ? `<sub>${f.n}</sub>` : "")).join("") + (charge ? `<sup>${charge > 0 ? "+" : "−"}${Math.abs(charge) > 1 ? Math.abs(charge) : ""}</sup>` : "");
const fmt = (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d));

function renderResults() {
  const r = $("#results");
  if (!info) { r.innerHTML = `<p class="note">That isn't a valid structure.</p>`; return; }
  const d = info.desc, c = core();
  const placedSubs = state.placed.map((p) => p.sub);
  const name = state.custom ? null : nameCompound(c, state.placed);
  const inns = suggestNames({ coreId: state.custom ? "" : c.id, subs: placedSubs }, info.smiles, 3, state.round);
  $("#formula").innerHTML = hillHtml(info.formula, info.charge);
  $("#name").textContent = name || "No systematic name for a custom structure yet";
  $("#name").classList.toggle("dim", !name);
  $("#smiles").textContent = info.smiles;
  $("#inn").innerHTML = inns.map((n) => `<li>${esc(n)}</li>`).join("");
  $("#facts").innerHTML = [
    ["Molecular weight", `${fmt(info.mw)} g/mol`], ["Exact mass", `${fmt(info.exact, 4)}`], ["Heavy atoms", d.NumHeavyAtoms],
    ["logP (estimated)", fmt(d.CrippenClogP)], ["Polar surface area", `${fmt(d.tpsa, 1)} Å²`], ["H-bond donors / acceptors", `${d.NumHBD} / ${d.NumHBA}`],
    ["Rotatable bonds", d.NumRotatableBonds], ["Rings (aromatic)", `${d.NumRings} (${d.NumAromaticRings})`],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  renderProfile();
  $("#warnings").innerHTML = info.warnings.length ? `<h3>Allowed, but fragile</h3><ul>${info.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
}

function draw2D() {
  if (!info) { $("#flat").innerHTML = ""; return; }
  let hl = null;
  if (!state.custom && state.hover != null && current) hl = current.map[state.hover];
  $("#flat").innerHTML = drawFlat(info, hl);
}

let building = 0;
function rebuild() {
  const token = ++building;
  release(info);
  let smiles;
  if (state.custom) { smiles = state.custom; current = { map: [] }; }
  else { current = assemble(core(), state.placed); smiles = current.smiles; }
  info = analyse(smiles);
  renderCores(); renderPositions(); renderPalette(); renderResults(); draw2D(); renderDesign();
  $("#custom-note").hidden = !state.custom;
  if (info) {
    coords = embed3D(info.graph);
    if (token === building && viewer) viewer.setMolecule(info.graph, coords);
  }
  saveHash();
}

/* ───────── effects and features ───────── */
const pct = (f) => Math.round(f * 100) + "%";
const bar = (f) => `<span class="fit"><span class="fit-fill" style="width:${pct(f)}"></span></span>`;
// "Sleep: Don't feel sleepy": the effect and, where it has modes, how it is changed
const effectTitle = (r) => (r.modeId && r.label ? `${r.name}: ${r.label.replace(/ \(.*\)$/, "")}` : r.name);
const statusBadge = (e) => `<span class="badge ${e.status}" title="${esc(STATUS_NOTE[e.status])}">${esc(e.status)}</span>`;

function renderDesign() {
  const host = $("#effects-pick");
  host.innerHTML = Object.entries(KIND_INFO).map(([kind, info]) => `<div class="eff-kind"><h3>${esc(info.label)} <span class="kind-note">${esc(info.note)}</span></h3>${
    EFFECT_GROUPS.filter((g) => EFFECTS.some((e) => e.kind === kind && e.group === g)).map((g) => `<div class="eff-group"><h4>${esc(g)}</h4><div class="eff-row">${
      EFFECTS.filter((e) => e.kind === kind && e.group === g).map((e) => {
        const chosen = state.effects.some((x) => x.id === e.id), why = chosen ? null : blockedReason(e.id, state.effects);
        return `<button type="button" class="eff" data-effect="${e.id}" aria-pressed="${chosen}" ${why ? "disabled" : ""} title="${esc(why || e.mech)}">${esc(e.name)}</button>`;
      }).join("")}</div></div>`).join("")}</div>`).join("");

  $("#effects-chosen").innerHTML = state.effects.length ? state.effects.map((x, i) => {
    const e = resolve(x), base = EFFECT_BY_ID[x.id];
    const when = `<div class="when"><label>Starts <select data-start="${i}">${START_CHOICES.map((o) => `<option value="${o.id}"${(x.onset || "inherit") === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>
        <label>Ends <select data-end="${i}">${END_CHOICES.map((o) => `<option value="${o.id}"${(x.duration || "inherit") === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>`;
    return `<div class="chosen-item"><div class="chosen-head"><b>${esc(e.name)}</b> ${statusBadge(e)}
        <select data-level="${i}" aria-label="Strength of ${esc(e.name)}">${LEVELS.map((l, k) => `<option value="${k}"${k === x.level ? " selected" : ""}>${l}</option>`).join("")}</select>
        <button type="button" class="link" data-unchoose="${i}">Remove</button></div>
      ${base.modes ? `<select class="mode" data-mode="${i}" aria-label="How ${esc(e.name)} is changed">${Object.entries(base.modes).map(([k, m]) => `<option value="${k}"${k === e.modeId ? " selected" : ""}>${esc(m.label)}</option>`).join("")}</select>` : ""}
      ${when}
      <p class="mech">${esc(e.mech)}</p></div>`;
  }).join("") : `<p class="hint">Nothing chosen yet.</p>`;

  const hz = hazard(state.effects), hr = harmReport(state.effects), hbox = $("#hazard");
  hbox.hidden = !(hz || hr);
  hbox.innerHTML = [hr && `<b>Poison outcome (fictional estimate): ${esc(hr.label)}</b><br>${esc(hr.text)}`, hz && `<b>Lost warning signals: ${esc(hz.level)}</b><br>${esc(hz.text)}`].filter(Boolean).join("<hr>");

  $("#features").innerHTML = Object.entries(FEATURES).map(([k, f]) => `<label>${esc(f.label)} <select data-feature="${k}">${f.options.map(([v, t]) => `<option value="${v}"${state.features[k] === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`).join("");

  renderTuneGoals();
  $("#time").innerHTML = [["route", "Taken", ROUTES], ["onset", "Starts", ONSETS], ["build", "Builds as", BUILDS], ["duration", "Lasts", DURATIONS]]
    .map(([k, label, opts]) => `<label>${esc(label)} <select data-time="${k}">${opts.map((o) => `<option value="${o.id}"${state.time[k] === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`).join("");
  const req = requestCurve(state.time);
  $("#time-chart").innerHTML = req ? curveSvg([{ curve: req, colour: "#8ab4ff", dashed: true }], 300, 80) : `<p class="hint">Choose when it starts to see the curve it asks for.</p>`;
  $("#time-note").textContent = TIME_NOTES[state.time.duration] || "";
  renderTimeline();
  for (const r of document.querySelectorAll("#views [name=view]")) r.checked = r.value === state.view;
  for (const c of document.querySelectorAll("#cure-how [name=cure]")) c.checked = !!state.cure[c.value];
}

// what follows from the chosen effects, day by day, and when the body gives out; optionally with the cure given on a day
const RESCUE_DAYS = [1, 2, 3, 5, 7, 10, 14];
function renderTimeline() {
  const host = $("#timeline");
  if (!state.effects.length) { host.innerHTML = `<p class="hint">Choose effects to see when each starts and what follows.</p>`; return; }
  const tl = buildTimeline(state.effects, state.time, state.rescue);
  host.innerHTML = `${timelineSvg(tl, 320)}
    <label class="rescue">Give the cure on <select data-rescue><option value="">never</option>${RESCUE_DAYS.map((d) => `<option value="${d}"${state.rescue === d ? " selected" : ""}>day ${d}</option>`).join("")}</select></label>
    ${tl.events.length ? `<ul class="events">${tl.events.map((ev) => `<li><i class="dot" style="background:${TONES[ev.tone] || "#ccc"}"></i><b>${esc(formatDay(ev.day))}</b> ${esc(ev.text)} <span class="why">${esc(ev.source)}</span></li>`).join("")}</ul>` : `<p class="hint">Nothing here goes wrong over time.</p>`}
    ${tl.collapse ? `<p class="collapse${tl.collapse.averted ? " averted" : ""}"><b>${esc(formatDay(tl.collapse.day))}:</b> ${esc(tl.collapse.text)}${tl.collapse.notes.length ? ` (${esc(tl.collapse.notes.join("; "))})` : ""}. Caused by: ${esc(tl.collapse.causes.join(", "))}.${tl.collapse.averted ? " <b>The cure comes in time: the collapse is averted.</b>" : ""}</p>` : ""}
    <p class="hint">Days are rough rule-of-thumb figures. Each effect can start and end on its own schedule (set it under the effect).</p>`;
}

/* ───────── tuning ───────── */
const GOALS = [["keep", "Keep"], ["raise", "Raise"], ["drop", "Allow to drop"]];
// effects the compound already suits stay as they are; ones it suits poorly (new features) are raised, unless chosen otherwise
const goalFor = (x, prof) => state.goals[x.id] || (prof && fitOf(resolve(x), prof).fit < 0.55 ? "raise" : "keep");
function renderTuneGoals() {
  const host = $("#tune-goals");
  if (!state.effects.length) { host.innerHTML = `<p class="hint">Choose effects above first.</p>`; return; }
  const prof = info && !state.custom ? profile(info.smiles) : null;
  host.innerHTML = state.effects.map((x) => {
    const e = resolve(x), g = goalFor(x, prof), fit = prof ? fitOf(e, prof).fit : null;
    return `<label class="goal"><span>${esc(effectTitle(e))}${fit != null ? ` <span class="fit-label">${pct(fit)} now</span>` : ""}</span>
      <select data-goal="${x.id}">${GOALS.map(([v, t]) => `<option value="${v}"${g === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  }).join("");
}

let tuning = false;
async function runTune() {
  const out = $("#tune-out"), prog = $("#progress"), btn = $("#tune");
  if (tuning || finding) return;
  if (state.custom) { out.innerHTML = `<p class="hint">Tuning works on ring-and-group designs. Open one in the builder first.</p>`; return; }
  if (!state.effects.length) { out.innerHTML = `<p class="hint">Choose at least one effect first.</p>`; return; }
  const prof = profile(info.smiles);
  const goals = Object.fromEntries(state.effects.map((x) => [x.id, goalFor(x, prof)]));
  tuning = true; btn.disabled = true; prog.hidden = false; out.innerHTML = "";
  try {
    const results = await findVariants({ core: core(), placed: state.placed }, { effects: state.effects, goals }, { maxChanges: Number($("#tune-change").value) }, (f) => { prog.firstElementChild.style.width = pct(Math.min(1, f)); });
    out._results = results;
    const raised = state.effects.filter((x) => goals[x.id] === "raise");
    out.innerHTML = results.length ? `<h4>Tuned versions</h4><div class="cand-grid">${results.map((r, i) => `
      <article class="cand">
        <h4>${esc(r.name)}</h4>
        <p class="score">${raised.length ? `raises ${raised.map((x) => esc(effectTitle(resolve(x)))).join(", ")} by ${pct(r.gain)} on average` : "keeps everything close"}</p>
        <p class="meta">${[...r.added.map((a) => "+ " + a), ...r.removed.map((a) => "− " + a)].map(esc).join("<br>")}</p>
        <ul class="fits">${state.effects.map((x, k) => { const d = r.fits[k] - r.baseFits[k]; return `<li>${esc(effectTitle(resolve(x)))} <span class="fit-label">${pct(r.baseFits[k])} → ${pct(r.fits[k])}</span> <span class="delta ${d > 0.02 ? "up" : d < -0.02 ? "down" : ""}">${d > 0.005 ? "+" : ""}${Math.round(d * 100)}%</span></li>`; }).join("")}</ul>
        <p class="meta"><code>${esc(r.prof.canonical)}</code></p>
        <button type="button" class="open" data-tune-open="${i}">Open in the builder</button>
      </article>`).join("")}</div>` : `<p class="hint">No small change raises those effects without dropping the ones to keep. Try allowing a larger change, letting some effects drop, or unlocking a group.</p>`;
  } finally { tuning = false; btn.disabled = false; prog.hidden = true; }
}

function renderProfile() {
  const host = $("#profile");
  if (!info) { host.innerHTML = ""; return; }
  const prof = profile(info.smiles);
  if (!prof) { host.innerHTML = ""; return; }
  const feat = featuresOf(prof);
  const featLines = [["Form", feat.text.form + (feat.formSure ? "" : " (a guess)")], ["Colour", feat.text.colour], ["Solubility", feat.text.solubility]]
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  const classNote = prof.classes.map((c) => `<div class="class-note"><b>${esc(c.label)}.</b> ${esc(c.mech)} <span class="risk">Risks: ${esc(c.risks)}</span></div>`).join("");
  const rows = state.effects.map(resolve).map((e) => {
    const r = fitOf(e, prof);
    return `<li><b>${esc(effectTitle(e))}</b> ${bar(r.fit)} <span class="fit-label">${pct(r.fit)} · ${fitLabel(r.fit)}</span><br><span class="why">${esc(r.why || r.missing || "")}${r.why && r.missing ? " · " + esc(r.missing) : ""}</span></li>`;
  }).join("");
  const top = topEffects(prof).filter((t) => !state.effects.some((x) => x.id === t.effect.id));
  const miss = featureMatch(state.features, feat);
  const est = estimateTime(prof, state.time.route, state.effects.map(resolve)), req = requestCurve(state.time);
  const tm = timeIsSet(state.time) ? timeMatch(state.time, est) : null;
  const way = ROUTES.find((r) => r.id === state.time.route).label.toLowerCase();
  const timeBlock = `<h3>Estimated time course (${esc(way)})</h3>${curveSvg([req && { curve: req, colour: "#8ab4ff", dashed: true }, { curve: estimateCurve(est), colour: "#7fe3b0" }], 300, 80)}
    <p class="hint">Starts ${esc(formatMinutes(est.onsetMin))} after it's taken and ${est.permanent ? "leaves damage that doesn't heal" : `lasts ${esc(formatMinutes(est.durationMin))}`}${est.accumulates ? "; it would build up in body fat" : ""}. Half-life about ${est.halfLifeH < 1 ? Math.round(est.halfLifeH * 60) + " min" : Math.round(est.halfLifeH) + " h"}.
    ${tm && tm.set ? `Matches the requested time course ${pct(tm.factor)}.` : ""}${req ? " Dashed: requested. Solid: estimated." : ""}</p>
    <p><button type="button" class="link" id="ant-here">Find antidotes for this compound</button></p>`;
  host.innerHTML = `${classNote}${rows ? `<h3>For your chosen effects</h3><ul class="fits">${rows}</ul>` : ""}
    <h3>${rows ? "Other effects it suits" : "Effects it suits best"}</h3>
    ${top.length ? `<ul class="fits">${top.map((t) => `<li><b>${esc(effectTitle(t.effect))}</b> ${bar(t.fit)} <span class="fit-label">${pct(t.fit)} · ${fitLabel(t.fit)}</span> ${statusBadge(t.effect)}<br><span class="why">${esc(t.why)}</span></li>`).join("")}</ul>` : `<p class="hint">Nothing in the database suits this structure well.</p>`}
    <h3>Likely appearance</h3><dl class="facts">${featLines}</dl>
    ${timeBlock}
    ${miss.length ? `<p class="hint bad">Doesn't match the requested ${esc(miss.join(" and "))}.</p>` : ""}
    <p class="hint">Rough ratings from the size, polarity and groups of the structure. Not a test of any kind.</p>`;
}

let finding = false;
const NO_FEATURES = { form: "any", colour: "any", solubility: "any" };
const effectsOf = (list, id) => effectTitle(resolve(list.find((x) => x.id === id) || { id }));

function cardHtml(r, key, i, effects, time) {
  const est = r.est, reqC = requestCurve(time);
  return `<article class="cand">
    <h4>${esc(r.name)}</h4>
    <p class="score">${pct(r.score)} overall · estimated strength: ${esc(r.intensity)}${r.miss.length ? ` · misses ${esc(r.miss.join(", "))}` : ""}</p>
    <ul class="fits">${r.fits.map((f) => `<li>${esc(effectsOf(effects, f.id))} ${bar(f.fit)} <span class="fit-label">${pct(f.fit)}${/no structural template/.test(f.why) ? " · size and polarity only" : ""}</span></li>`).join("")}</ul>
    <div class="spark">${curveSvg([reqC && { curve: reqC, colour: "#8ab4ff", dashed: true }, { curve: estimateCurve(est), colour: "#7fe3b0" }], 260, 64)}</div>
    <p class="meta">Starts ${esc(formatMinutes(est.onsetMin))} · ${est.permanent ? "damage doesn't heal" : "lasts " + esc(formatMinutes(est.durationMin))}${est.accumulates ? " · builds up in fat" : ""}${r.tm && r.tm.set ? ` · time match ${pct(r.tm.factor)}` : ""}</p>
    <p class="meta">${esc(r.feat.text.form)} · ${esc(r.feat.text.colour)} · ${esc(r.feat.text.solubility)}</p>
    <p class="meta"><code>${esc(r.prof.canonical)}</code></p>
    <button type="button" class="open" data-open="${key}:${i}">Open in the builder</button>
    ${key === "sub" ? `<button type="button" class="link" data-blockers="${i}">Find blockers for this one</button><div class="blockers" id="blk-${i}"></div>` : ""}
  </article>`;
}

// the cure for one substance: what ends its effects by neutralising it or flushing it out of the body
function cureHtml(r, i, cure) {
  const t = cure.times, est = r.est;
  const item = (c, label, key, line) => c ? `<div class="cure-item"><b>${label}</b>: ${esc(c.name)}<br><span class="fit-label">${esc(line)}</span><br><span class="why">${esc((c.why || (c.lost && c.lost.length ? ["loses " + c.lost.join("; ")] : ["changes a group"])).join("; "))}</span><br><code>${esc(c.prof.canonical)}</code> <button type="button" class="link" data-open="${key}:${i}">Open in the builder</button></div>` : "";
  return `<article class="cure">
    <h4>Cure for ${esc(r.name)}</h4>
    <p class="meta">On its own the effects only fade as the body clears it: ${est.permanent ? "they leave damage that doesn't heal" : esc(formatMinutes(t.natural))}.</p>
    ${item(cure.neut, "Neutralise it", "neut", cure.neut ? `binds it ${pct(cure.neut.bind)} · effects end ${formatMinutes(t.neutralise)} after it is given` : "")}
    ${item(cure.flush, "Flush it out", "flush", cure.flush ? `speeds clearance ${(1 + 3 * cure.flush.flush).toFixed(1)}× · effects end in ${formatMinutes(t.flush)}` : "")}
    ${item(cure.block, "Block it", "block", cure.block ? `${pct(cure.block.sim)} similar to it · its activity falls ${pct(cure.block.from)} → ${pct(cure.block.to)} · holds the effects off while it is present` : "")}
    ${!cure.neut && !cure.flush && !cure.block ? `<p class="hint">Nothing in the design space fits this one for the ways chosen.</p>` : ""}
    ${est.permanent ? `<p class="hint">Stops further damage; the damage already done needs repair.</p>` : ""}
  </article>`;
}

// cures for each substance in `results` (needs the pool of designs to draw neutralisers and flush-out agents from)
function curesFor(results, effects, pool) {
  return results.map((r) => {
    const neut = state.cure.neutralise ? neutralisers(r, effects, pool)[0] || null : null, flush = state.cure.flush ? flushers(r, effects, pool)[0] || null : null;
    const block = state.cure.block ? findBlockers(r, effects, 200)[0] || null : null;
    return { neut, flush, block, times: cureTimes(r.est, neut && neut.bind, flush && flush.flush) };
  });
}

async function runDesign(substances, heading) {
  if (finding) return;
  const out = $("#candidates"), prog = $("#progress"), btn = $("#find");
  const view = state.view, wantCure = view !== "substance", how = state.cure;
  if (wantCure && !Object.values(how).some(Boolean)) { out.innerHTML = `<p class="hint">Pick at least one way the cure works.</p>`; return; }
  const targets = antidoteTargets(state.effects), at = antidoteTime(state.time);
  finding = true; btn.disabled = true; prog.hidden = false; out.innerHTML = "";
  const step = (a, b) => (f) => { prog.firstElementChild.style.width = pct(Math.min(1, a + (b - a) * f)); };
  try {
    const results = substances || await findCandidates({ effects: state.effects, features: state.features, time: state.time }, step(0, wantCure ? 0.45 : 1));
    out._results = { sub: results };
    let cures = [], reverse = [];
    if (wantCure && results.length) {
      const pool = how.neutralise || how.flush ? await buildPool(700, step(0.45, 0.8)) : [];
      cures = curesFor(results, state.effects, pool);
      out._results.neut = cures.map((c) => c.neut); out._results.flush = cures.map((c) => c.flush); out._results.block = cures.map((c) => c.block);
      if (how.reverse && targets.length) reverse = await findCandidates({ effects: targets, features: NO_FEATURES, time: at }, step(0.8, 1));
      out._results.ant = reverse;
    }
    const subCards = results.map((r, i) => cardHtml(r, "sub", i, state.effects, state.time));
    const cureCards = cures.map((c, i) => (how.neutralise || how.flush || how.block ? cureHtml(results[i], i, c) : `<p class="hint">No substance-level cure chosen.</p>`));
    let html = "";
    if (!results.length) html = `<p class="hint">Nothing suitable was found. Try fewer or different effects, or relax a feature or the time course.</p>`;
    else if (view === "substance") html = `<h3>${esc(heading || "The substance")}</h3><div class="cand-grid">${subCards.join("")}</div>`;
    else if (view === "both") html = `<div class="pairs"><h3>The substance</h3><h3>The cure</h3>${subCards.map((c, i) => `<div>${c}</div><div>${cureCards[i]}</div>`).join("")}</div>`;
    else html = `<h3>The cure, for each substance</h3><div class="cand-grid">${cureCards.join("")}</div>`;
    if (wantCure && results.length && how.reverse) html += `<h3>Reverse or repair the effects</h3><p class="hint">${targets.length ? `Works whatever the substance is. Aims to ${esc(targets.map((t) => EFFECT_BY_ID[t.id].name.toLowerCase()).join(", "))}; a step faster, lasting at least as long, injected.` : "None of the chosen effects has a counter-effect modelled."}</p>${reverse.length ? `<div class="cand-grid">${reverse.map((r, i) => cardHtml(r, "ant", i, targets, at)).join("")}</div>` : ""}`;
    out.innerHTML = html;
  } finally { finding = false; btn.disabled = false; prog.hidden = true; }
}

async function runFind() {
  const out = $("#candidates");
  if (!state.effects.length) { out.innerHTML = `<p class="hint">Choose at least one effect first.</p>`; return; }
  await runDesign(null);
}

// the cure for whatever is in the builder now
async function runAntidoteHere() {
  if (!info || finding) return;
  const prof = profile(info.smiles);
  const effects = state.effects.length ? state.effects : topEffects(prof).map((t) => ({ id: t.effect.id, level: 1, mode: t.effect.defaultMode || null }));
  const name = state.custom ? "this compound" : nameCompound(core(), state.placed);
  const r = { name, prof, est: estimateTime(prof, state.time.route, effects.map(resolve)) };
  const out = $("#candidates"), prog = $("#progress"), btn = $("#find");
  $("#design").scrollIntoView({ behavior: "smooth", block: "start" });
  finding = true; btn.disabled = true; prog.hidden = false; out.innerHTML = "";
  try {
    const pool = await buildPool(700, (f) => { prog.firstElementChild.style.width = pct(f); });
    const cures = curesFor([r], effects, pool);
    out._results = { neut: [cures[0].neut], flush: [cures[0].flush] };
    out.innerHTML = `<h3>The cure</h3><div class="cand-grid">${cureHtml(r, 0, cures[0])}</div>`;
  } finally { finding = false; btn.disabled = false; prog.hidden = true; }
}

/* ───────── files ───────── */
function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
const fileName = () => (state.custom ? "compound" : nameCompound(core(), state.placed).replace(/[^a-z0-9]+/gi, "-")).replace(/^-|-$/g, "") || "compound";
function molFile() {
  const { atoms, bonds } = info.graph, pad = (n, w) => String(n).padStart(w);
  const lines = [fileName(), "  Compound Lab (approximate 3D geometry)", "", `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  atoms.forEach((a, i) => lines.push(`${coords[i].map((v) => v.toFixed(4).padStart(10)).join("")} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`));
  for (const b of bonds) lines.push(`${pad(b.a + 1, 3)}${pad(b.b + 1, 3)}${pad(b.order, 3)}  0`);
  lines.push("M  END");
  return lines.join("\n") + "\n";
}
const xyzFile = () => `${info.graph.atoms.length}\n${fileName()}\n` + info.graph.atoms.map((a, i) => `${a.el.padEnd(2)} ${coords[i].map((v) => v.toFixed(5).padStart(11)).join(" ")}`).join("\n") + "\n";

/* ───────── wiring ───────── */
function bind() {
  $("#cores").addEventListener("click", (e) => {
    const b = e.target.closest("[data-core]");
    if (!b) return;
    state.custom = null; state.coreId = b.dataset.core; state.placed = []; state.active = null; state.hover = null;
    rebuild();
  });
  $("#positions").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]"), add = e.target.closest("[data-add]"), lk = e.target.closest("[data-lock]");
    if (lk) { const q = state.placed[Number(lk.dataset.lock)]; q.locked = !q.locked; renderPositions(); saveHash(); }
    else if (rm) { state.placed.splice(Number(rm.dataset.remove), 1); rebuild(); }
    else if (add) { state.active = state.active === Number(add.dataset.add) ? null : Number(add.dataset.add); renderPositions(); renderPalette(); if (state.active != null) $("#palette").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  });
  $("#positions").addEventListener("pointerover", (e) => {
    const row = e.target.closest("[data-atom]");
    const v = row ? Number(row.dataset.atom) : null;
    if (v !== state.hover) { state.hover = v; draw2D(); }
  });
  $("#positions").addEventListener("pointerleave", () => { if (state.hover != null) { state.hover = null; draw2D(); } });
  $("#palette").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sub]");
    if (!b || b.disabled) return;
    state.placed.push({ atom: state.active, sub: SUB_BY_ID[b.dataset.sub] });
    if (freeHydrogens(core(), state.placed, state.active) <= 0) state.active = null;
    rebuild();
  });
  $("#palette-close").addEventListener("click", () => { state.active = null; renderPositions(); renderPalette(); });
  $("#clear").addEventListener("click", () => { state.placed = []; state.active = null; state.custom = null; rebuild(); });

  $("#smiles-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#smiles-in").value.trim(), note = $("#smiles-note");
    if (!v) return;
    if (!isValid(v)) { note.textContent = "That isn't a valid structure: the bonding rules rule it out (or the SMILES has a typo)."; note.className = "bad"; return; }
    note.textContent = ""; state.custom = v; state.active = null; rebuild();
  });
  $("#back-to-builder").addEventListener("click", () => { state.custom = null; rebuild(); });

  $("#effects-pick").addEventListener("click", (e) => {
    const b = e.target.closest("[data-effect]");
    if (!b || b.disabled) return;
    const id = b.dataset.effect, at = state.effects.findIndex((x) => x.id === id);
    if (at >= 0) state.effects.splice(at, 1); else state.effects.push({ id, level: 1, mode: EFFECT_BY_ID[id].defaultMode || null, onset: "inherit", duration: "inherit" });
    renderDesign(); renderProfile(); saveHash();
  });
  $("#effects-chosen").addEventListener("click", (e) => {
    const b = e.target.closest("[data-unchoose]");
    if (b) { state.effects.splice(Number(b.dataset.unchoose), 1); renderDesign(); renderProfile(); saveHash(); }
  });
  $("#effects-chosen").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-level]");
    if (sel) { state.effects[Number(sel.dataset.level)].level = Number(sel.value); renderDesign(); saveHash(); }
  });
  $("#effects-chosen").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-mode]");
    if (sel) { state.effects[Number(sel.dataset.mode)].mode = sel.value; renderDesign(); renderProfile(); saveHash(); }
  });
  $("#effects-chosen").addEventListener("change", (e) => {
    const a = e.target.closest("[data-start]"), b = e.target.closest("[data-end]");
    if (a) { state.effects[Number(a.dataset.start)].onset = a.value; renderTimeline(); saveHash(); }
    if (b) { state.effects[Number(b.dataset.end)].duration = b.value; renderTimeline(); saveHash(); }
  });
  $("#candidates").addEventListener("click", (e) => {
    const bk = e.target.closest("[data-blockers]");
    if (!bk) return;
    const r = $("#candidates")._results && $("#candidates")._results.sub && $("#candidates")._results.sub[Number(bk.dataset.blockers)];
    const host = $(`#blk-${bk.dataset.blockers}`);
    if (!r || !host) return;
    const found = findBlockers(r, state.effects);
    host.innerHTML = found.length
      ? `<p class="hint">Close relatives that keep most of its shape, so they can sit where it sits, but lose what makes it work:</p><ul class="fits">${found.map((f) => `<li><b>${esc(f.name)}</b><br><span class="fit-label">${pct(f.sim)} similar · activity ${pct(f.from)} → ${pct(f.to)}</span><br><span class="why">${f.lost.length ? "loses " + esc(f.lost.join("; ")) : "changes a group"} · <code>${esc(f.prof.canonical)}</code></span></li>`).join("")}</ul>`
      : `<p class="hint">No close relative lost enough activity to count as a blocker.</p>`;
  });
  $("#timeline").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-rescue]");
    if (sel) { state.rescue = sel.value ? Number(sel.value) : null; renderTimeline(); saveHash(); }
  });
  $("#tune-goals").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-goal]");
    if (sel) state.goals[sel.dataset.goal] = sel.value;
  });
  $("#tune").addEventListener("click", () => runTune());
  $("#tune-out").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tune-open]"), r = b && $("#tune-out")._results[Number(b.dataset.tuneOpen)];
    if (!r) return;
    state.placed = r.d.placed.map((p) => ({ atom: p.atom, sub: p.sub, locked: !!p.locked })); state.active = null;
    rebuild(); window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#features").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-feature]");
    if (sel) { state.features[sel.dataset.feature] = sel.value; renderProfile(); saveHash(); }
  });
  $("#clear-effects").addEventListener("click", () => { state.effects = []; state.features = { form: "any", colour: "any", solubility: "any" }; state.time = { ...DEFAULT_TIME }; state.view = "substance"; state.rescue = null; $("#candidates").innerHTML = ""; renderDesign(); renderProfile(); saveHash(); });
  $("#find").addEventListener("click", () => runFind());
  $("#time").addEventListener("change", (e) => {
    const sel = e.target.closest("[data-time]");
    if (sel) { state.time[sel.dataset.time] = sel.value; renderDesign(); renderProfile(); saveHash(); }
  });
  $("#cure-how").addEventListener("change", (e) => {
    if (e.target.name === "cure") { state.cure[e.target.value] = e.target.checked; saveHash(); }
  });
  $("#views").addEventListener("change", (e) => {
    if (e.target.name === "view") { state.view = e.target.value; saveHash(); }
  });
  $("#profile").addEventListener("click", (e) => { if (e.target.closest("#ant-here")) runAntidoteHere(); });
  $("#candidates").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    const [key, idx] = b ? b.dataset.open.split(":") : [];
    const r = key && $("#candidates")._results && $("#candidates")._results[key] && $("#candidates")._results[key][Number(idx)];
    if (!r) return;
    state.custom = null; state.coreId = r.d.core.id; state.placed = r.d.placed.map((p) => ({ atom: p.atom, sub: p.sub })); state.active = null;
    rebuild(); window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("#tour-open").addEventListener("click", () => {
    if (!info) return;
    openTour({ info, coords, core: state.custom ? null : core(), placed: state.placed, custom: !!state.custom, effects: state.effects, time: state.time, rescue: state.rescue, name: state.custom ? null : nameCompound(core(), state.placed), formula: hillHtml(info.formula, info.charge) });
  });
  $("#more-names").addEventListener("click", () => { state.round++; renderResults(); });
  $("#style").addEventListener("change", (e) => viewer.setStyle(e.target.value));
  $("#hydrogens").addEventListener("change", (e) => viewer.setHydrogens(e.target.checked));
  $("#spin").addEventListener("change", (e) => viewer.setSpin(e.target.checked));
  $("#reset").addEventListener("click", () => viewer.reset());
  $("#png").addEventListener("click", () => { const a = document.createElement("a"); a.href = viewer.png(); a.download = fileName() + ".png"; a.click(); });
  $("#copy-smiles").addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(info.smiles); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy SMILES"), 1200); } catch { /* blocked */ } });
  $("#dl-mol").addEventListener("click", () => info && download(fileName() + ".mol", molFile()));
  $("#dl-xyz").addEventListener("click", () => info && download(fileName() + ".xyz", xyzFile()));
  $("#copy-link").addEventListener("click", async (e) => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy link"), 1200); } catch { /* blocked */ } });
}

async function start() {
  const status = $("#status");
  try {
    await loadChem();
    viewer = createViewer($("#viewer"), (text, x, y) => {
      const tip = $("#tip");
      if (!text) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = text; tip.style.left = x + 12 + "px"; tip.style.top = y + 12 + "px";
    });
    loadHash();
    bind();
    rebuild();
    status.hidden = true;
  } catch (err) {
    status.textContent = err.message || "Something went wrong starting up.";
    status.classList.add("bad");
  }
}
window.compoundLab = { get info() { return info; }, get coords() { return coords; } };   // for checking the geometry in the console
start();
