/* The effect model: how well a structure suits an effect's mechanism, which effects cannot be combined, what a structure
   is likely to look like, and how risky losing several warning signals at once would be. Everything here is a rough,
   hand-made estimate for fiction, built from the mechanism each effect needs (see effects.js). */
import { EFFECT_BY_ID, PATTERNS, resolve } from "./effects.js";
import { ONSETS } from "./timecourse.js";

const SCALE = { mw: 80, logp: 1.2, tpsa: 30, hbd: 1 };
const valueOf = (d) => ({ mw: d.amw, logp: d.CrippenClogP, tpsa: d.tpsa, hbd: d.NumHBD });

// 1 when inside the window, falling off smoothly with distance outside it
function windowScore(win, d) {
  const v = valueOf(d);
  let total = 0, n = 0;
  for (const k of Object.keys(win)) {
    const [lo, hi] = win[k], gap = v[k] < lo ? lo - v[k] : v[k] > hi ? v[k] - hi : 0;
    total += Math.exp(-gap / SCALE[k]); n++;
  }
  return n ? total / n : 1;
}

const labelOf = (ids) => ids.map((i) => PATTERNS[i].label).join(" + ");

/* how well the profile suits one effect: { fit 0..1, why, missing } */
export function fitOf(effect, prof) {
  const prop = windowScore(effect.window, prof.desc);
  let pat, why = "", missing = "";
  if (effect.needs.length) {
    const hit = effect.needs.filter((n) => n.all.every((id) => prof.flags.has(id))).sort((a, b) => b.w - a.w)[0];
    pat = hit ? hit.w : 0.12;
    why = hit ? `has ${labelOf(hit.all)}: ${hit.why}` : "";
    if (!hit) missing = `would need ${effect.needs[0].why}`;
  } else {
    pat = 0.5;
    why = "no structural template is known, so this is rated on size and polarity only";
  }
  let fit = effect.needs.length ? 0.4 * prop + 0.6 * pat : 0.5 * prop + 0.25 * (pat / 0.5);
  if (effect.must && effect.must.some((id) => !prof.flags.has(id))) { fit *= 0.25; missing = `needs ${labelOf(effect.must.filter((id) => !prof.flags.has(id)))}`; }
  if (effect.cns && prof.flags.has("acid")) { fit *= 0.25; missing = "an acid group would keep it out of the brain"; }
  // a structural family known to cause this effect (stimulants for alertness, and so on) counts for what it does
  if (effect.modeId !== "need" && effect.modeId !== "ability") {
    for (const c of prof.classes || []) if (c.fits && c.fits[effect.id] > fit) { fit = c.fits[effect.id]; why = `belongs to the ${c.short} family, which is known to act this way`; missing = ""; }
  }
  if (prop < 0.6) missing = missing || "its size or polarity is outside the range this mechanism suits";
  return { fit: Math.max(0, Math.min(1, fit)), why, missing };
}
export const fitLabel = (f) => (f >= 0.75 ? "strong fit" : f >= 0.55 ? "plausible fit" : f >= 0.35 ? "weak fit" : "poor fit");

/* what the structure is likely to look like and dissolve in */
export function featuresOf(prof) {
  const d = prof.desc, hbd = d.NumHBD, arom = d.NumAromaticRings;
  // a rough melting-point guide: heavier, flatter, more hydrogen-bonded molecules are solids
  const tm = 20 + 0.4 * (d.amw - 100) + 35 * Math.min(hbd, 3) + 18 * arom + (prof.flags.has("amide") ? 25 : 0) + (prof.flags.has("acid") ? 30 : 0) - 6 * d.NumRotatableBonds;
  const form = tm >= 45 ? "solid" : "liquid", formSure = Math.abs(tm - 45) > 25;
  const colour = prof.flags.has("nitro_arene") ? "yellow" : "white";
  const water = d.CrippenClogP <= 1.8 || d.tpsa >= 80, oil = d.CrippenClogP >= 2.2;
  return {
    form, formSure, colour, water, oil,
    text: {
      form: form === "solid" ? "A solid (powder or crystals)" : "A liquid or oil",
      colour: colour === "white" ? "White or colourless" : "Yellow (nitro-aromatics absorb blue light)",
      solubility: water && oil ? "Dissolves in both water and oils" : water ? "Dissolves in water" : oil ? "Dissolves in oils and fats, little in water" : "Dissolves poorly in either",
    },
  };
}
export function featureMatch(spec, feat) {
  const miss = [];
  if (spec.form && spec.form !== "any" && spec.form !== feat.form) miss.push("form");
  if (spec.colour && spec.colour !== "any" && spec.colour !== feat.colour) miss.push("colour");
  if (spec.solubility === "water" && !feat.water) miss.push("solubility");
  if (spec.solubility === "oil" && !feat.oil) miss.push("solubility");
  return miss;
}

/* can this effect be added to the ones already chosen? Returns a reason if not. */
export function blockedReason(id, selection) {
  const e = resolve({ id });
  const others = selection.map(resolve).filter((o) => o.id !== id);
  for (const o of others) if ((e.conflicts || []).includes(o.id) || (o.conflicts || []).includes(id)) return `Opposes “${o.name}”.`;
  const forbids = (x) => [...(x.forbid || []), ...(x.cns ? ["acid"] : [])];
  for (const o of others) {
    const c1 = (e.must || []).find((m) => forbids(o).includes(m)), c2 = (o.must || []).find((m) => forbids(e).includes(m));
    if (c1) return `“${e.name}” needs ${PATTERNS[c1].label}, but “${o.name}” has to reach the brain, which that group prevents.`;
    if (c2) return `“${o.name}” needs ${PATTERNS[c2].label}, but “${e.name}” has to reach the brain, which that group prevents.`;
  }
  // do the size and polarity ranges still overlap?
  const names = { mw: "molecular weight", logp: "oil/water balance", tpsa: "polarity", hbd: "hydrogen-bond donors" };
  for (const k of Object.keys(names)) {
    let lo = e.window[k] ? e.window[k][0] : -Infinity, hi = e.window[k] ? e.window[k][1] : Infinity, who = null;
    for (const o of others) {
      if (!o.window[k]) continue;
      if (o.window[k][0] > lo) { lo = o.window[k][0]; who = o; }
      if (o.window[k][1] < hi) { hi = o.window[k][1]; who = who || o; }
    }
    if (lo > hi && who) return `Needs a different ${names[k]} from “${who.name}”.`;
  }
  return null;
}

const NEED_NOTE = "A “no longer needs it” effect only protects you if the need is truly gone; if it is only partly removed, the missing sleep, food or water still does harm.";
const UNNOTICED = {
  pain_local: "local injuries", pain_inflam: "inflammation and tissue damage", pain_central: "serious injury", tired: "exhaustion",
  hunger: "starvation", thirst: "dehydration", nausea: "poisoning", temp: "burns and frostbite", muscle_burn: "muscle damage",
};
/* the hazard of removing warning signals: the more of them, and the stronger, the worse. A fictional estimate. */
export function hazard(selection) {
  const warn = selection.map((s) => ({ s, r: resolve(s) })).filter((x) => x.r.warn);
  const needs = selection.some((s) => resolve(s).modeId === "need");
  if (!warn.length) return needs ? { level: "Low", weight: 0, text: NEED_NOTE } : null;
  const weight = warn.reduce((t, { s, r }) => t + (s.level + 1) + (r.hazardExtra || 0) + (s.id === "thirst" ? 2 : 0), 0);
  const level = weight >= 8 ? "Severe" : weight >= 5 ? "High" : weight >= 3 ? "Moderate" : "Low";
  const hides = [...new Set(warn.map(({ s, r }) => r.unnoticed || UNNOTICED[s.id]))];
  return {
    level, weight,
    text: `Switching off these signals means ${hides.length > 1 ? hides.slice(0, -1).join(", ") + " and " + hides[hides.length - 1] : hides[0]} can go unnoticed.` +
      (level === "Severe" ? " At this strength, losing so many warnings at once would very likely be fatal." : level === "High" ? " Serious harm is likely if it's pushed hard." : "") + (needs ? " " + NEED_NOTE : ""),
  };
}

/* the effects a structure suits best, strongest first */
export function topEffects(prof, minimum = 0.55, limit = 6) {
  return Object.values(EFFECT_BY_ID).map((e) => resolve({ id: e.id }))
    // (effects with no structural template are not something a structure can be said to suit)
    .map((e) => ({ effect: e, ...fitOf(e, prof) })).filter((x) => x.fit >= minimum && !/no structural template/.test(x.why)).sort((a, b) => b.fit - a.fit).slice(0, limit);
}

/* how dangerous the chosen poison effects are on their own, ignoring treatment: a fictional estimate */
const SEVERITY = [0.5, 1, 1.6];
export function harmReport(selection) {
  const harms = selection.map((s) => ({ s, r: resolve(s) })).filter((x) => x.r.kind === "harm");
  if (!harms.length) return null;
  const score = harms.reduce((t, { s, r }) => t + r.severity * SEVERITY[s.level], 0);
  const label = score >= 10 ? "Almost certainly lethal" : score >= 6 ? "Likely lethal if untreated" : score >= 3 ? "Dangerous" : "Harmful";
  const permanent = harms.some(({ r }) => r.irreversible);
  return { label, score, permanent, text: `Without treatment: ${label.toLowerCase()}.${permanent ? " Some of the damage would not heal." : ""} A rough fictional estimate, not a medical figure.` };
}

/* the effects that would undo the ones chosen: a harm's listed counters, or for any other effect its opposites */
export function antidoteTargets(selection) {
  const out = new Map();
  for (const s of selection) {
    const e = resolve(s);
    if (e.kind === "counter" || e.modeId === "need") continue;   // (nothing to cure where the need itself is gone)
    for (const id of e.counters || e.conflicts || []) if (EFFECT_BY_ID[id]) out.set(id, Math.max(out.get(id) || 0, Math.max(1, s.level)));
  }
  return [...out].map(([id, level]) => ({ id, level, mode: EFFECT_BY_ID[id].defaultMode || null }));
}

/* an antidote has to act at least as fast as the substance and outlast it, and is usually injected */
export function antidoteTime(time) {
  const i = ONSETS.findIndex((o) => o.id === time.onset);
  return {
    route: "inject",
    onset: time.onset === "any" ? "minutes" : i > 1 ? ONSETS[i - 1].id : time.onset,
    build: "any",
    duration: time.duration === "permanent" || time.duration === "unending" ? "days" : time.duration,
  };
}

// how strong the effect is likely to be, from how well the structure suits it and how strong it was asked to be
export function intensityLabel(meanFit, levels) {
  const avg = levels.length ? levels.reduce((t, l) => t + l, 0) / levels.length : 1;
  const v = meanFit * (0.8 + 0.25 * avg);
  return v < 0.4 ? "faint" : v < 0.6 ? "mild" : v < 0.8 ? "marked" : "intense";
}
