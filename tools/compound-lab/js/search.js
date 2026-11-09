/* From effects and features to compounds: try many ring-and-group designs, score each against what was asked for, keep
   improving the best ones by changing one group at a time, and return a few different good ones. Structures that
   are of a controlled or dangerous family (see CLASSES in effects.js) are rated and may be returned, with the family's risks shown. */
import { CORES, SUBS } from "./data.js";
import { assemble, profile } from "./chem.js";
import { resolve, PATTERNS } from "./effects.js";
import { fitOf, featuresOf, featureMatch, intensityLabel } from "./predict.js";
import { estimateTime, timeMatch, timeIsSet, DEFAULT_TIME } from "./timecourse.js";
import { nameCompound } from "./naming.js";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const freeAt = (core, placed, atom) => core.hs[atom] - placed.reduce((t, p) => t + (p.atom === atom ? (p.sub.order || 1) : 0), 0);

function randomDesign(rand) {
  const core = CORES[Math.floor(rand() * CORES.length)], placed = [], want = 1 + Math.floor(rand() * 3);
  for (let t = 0; t < want * 3 && placed.length < want; t++) {
    const atoms = core.atoms.map((_, i) => i).filter((i) => freeAt(core, placed, i) > 0);
    if (!atoms.length) break;
    const atom = atoms[Math.floor(rand() * atoms.length)];
    const subs = SUBS.filter((s) => (s.order || 1) <= freeAt(core, placed, atom));
    placed.push({ atom, sub: subs[Math.floor(rand() * subs.length)] });
  }
  return { core, placed };
}

function mutate(d, rand) {
  const placed = d.placed.slice();
  const r = rand();
  if (r < 0.3 && placed.length > 1) placed.splice(Math.floor(rand() * placed.length), 1);
  else if (r < 0.6 && placed.length) {
    const i = Math.floor(rand() * placed.length), rest = placed.filter((_, k) => k !== i);
    const subs = SUBS.filter((s) => (s.order || 1) <= freeAt(d.core, rest, placed[i].atom));
    placed[i] = { atom: placed[i].atom, sub: subs[Math.floor(rand() * subs.length)] };
  } else {
    const atoms = d.core.atoms.map((_, i) => i).filter((i) => freeAt(d.core, placed, i) > 0);
    if (atoms.length && placed.length < 4) {
      const atom = atoms[Math.floor(rand() * atoms.length)], subs = SUBS.filter((s) => (s.order || 1) <= freeAt(d.core, placed, atom));
      placed.push({ atom, sub: subs[Math.floor(rand() * subs.length)] });
    }
  }
  return { core: d.core, placed };
}

/* spec: { effects: [{ id, level }], features: { form, colour, solubility }, time: { route, onset, build, duration } } */
export async function findCandidates(spec, onProgress, seed = 11) {
  const rand = rng(seed + spec.effects.length * 101);
  const scored = spec.effects.map(resolve), time = { ...DEFAULT_TIME, ...(spec.time || {}) };
  const seen = new Map();

  const evaluate = (d) => {
    const { smiles } = assemble(d.core, d.placed);
    if (seen.has(smiles)) return seen.get(smiles);
    const prof = profile(smiles);
    let result = null;
    if (prof) {
      const fits = scored.map((r) => ({ id: r.id, ...fitOf(r, prof) }));
      const weights = spec.effects.map((s) => 1 + 0.15 * s.level);
      const mean = fits.length ? fits.reduce((t, f, i) => t + f.fit * weights[i], 0) / weights.reduce((t, w) => t + w, 0) : 0.5;
      const feat = featuresOf(prof), miss = featureMatch(spec.features || {}, feat);
      // when it acts and for how long, against what was asked
      const est = estimateTime(prof, time.route, scored), tm = timeMatch(time, est);
      const timeFactor = timeIsSet(time) ? 0.35 + 0.65 * tm.factor : 1;
      result = { d, smiles, prof, fits, feat, miss, est, tm, intensity: intensityLabel(mean, spec.effects.map((x) => x.level)), score: mean * (miss.length ? Math.pow(0.35, miss.length) : 1) * timeFactor };
    }
    seen.set(smiles, result);
    return result;
  };

  const total = 1400;
  let pool = [];
  for (let i = 0; i < total; i++) {
    const r = evaluate(randomDesign(rand));
    if (r) pool.push(r);
    if (i % 30 === 0) { onProgress && onProgress(i / (total * 1.5)); await new Promise((res) => setTimeout(res, 0)); }
  }
  pool.sort((a, b) => b.score - a.score);
  // improve the best designs by changing one thing at a time
  let top = pool.slice(0, 16);
  for (let round = 0; round < 7; round++) {
    const next = [];
    for (const t of top) for (let k = 0; k < 8; k++) { const r = evaluate(mutate(t.d, rand)); if (r) next.push(r); }
    top = [...new Map([...top, ...next].sort((a, b) => b.score - a.score).map((r) => [r.smiles, r])).values()].slice(0, 16);
    onProgress && onProgress(0.67 + ((round + 1) / 7) * 0.33);
    await new Promise((res) => setTimeout(res, 0));
  }
  // a few different good ones from everything tried: at most two from the same ring
  const out = [], perCore = new Map();
  for (const r of [...seen.values()].filter(Boolean).sort((a, b) => b.score - a.score)) {
    const c = perCore.get(r.d.core.id) || 0;
    if (c >= 2) continue;
    perCore.set(r.d.core.id, c + 1);
    out.push({ ...r, name: nameCompound(r.d.core, r.d.placed) });
    if (out.length === 6) break;
  }
  return out;
}

/* Blockers for one substance: close relatives that keep most of its shape (so they can sit where it sits) but lose the
   group that made it work. Found by changing the substance a little and keeping the ones whose rating for the same
   effects drops the most. `effects` are the chosen effects the substance was searched for. */
export function findBlockers(result, effects, tries = 500) {
  const res = effects.map(resolve);
  const meanFit = (prof) => (res.length ? res.reduce((t, e) => t + fitOf(e, prof).fit, 0) / res.length : 0);
  const base = meanFit(result.prof);
  const keys = (d) => new Set(d.placed.map((p) => `${p.atom}:${p.sub.id}`));
  const k0 = keys(result.d), rand = rng(97), seen = new Set([result.smiles]), out = [];
  for (let i = 0; i < tries; i++) {
    let d = mutate(result.d, rand);
    if (rand() < 0.4) d = mutate(d, rand);
    const { smiles } = assemble(d.core, d.placed);
    if (seen.has(smiles)) continue;
    seen.add(smiles);
    const k1 = keys(d), shared = [...k1].filter((k) => k0.has(k)).length, sim = shared / (k0.size + k1.size - shared || 1);
    if (sim < 0.3 || (k0.size && !shared)) continue;
    const prof = profile(smiles);
    if (!prof) continue;
    const to = meanFit(prof), drop = base - to;
    if (drop < 0.15) continue;
    const lost = [...result.prof.flags].filter((f) => !prof.flags.has(f)).map((f) => PATTERNS[f].label);
    out.push({ d, smiles, prof, sim, from: base, to, lost, score: sim * drop, name: nameCompound(d.core, d.placed) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ───────── cures that end the effects: neutralise the substance, or flush it out ─────────
   A neutraliser binds or reacts with the substance in the gut or blood so it can no longer act (an acid for a basic amine,
   an amine for an acid, hydrogen-bonding partners, or an oil to soak up a fatty substance). A flush-out agent makes the
   body clear it faster (by trapping it as a charged salt in the urine, by giving the liver something to attach to it, or by
   driving urine flow). Both are scored against a pool of random designs, and are never designs that act like the substance
   or belong to a controlled or dangerous family. */
export async function buildPool(n, onProgress, seed = 5) {
  const rand = rng(seed), pool = [];
  for (let i = 0; i < n; i++) {
    const d = randomDesign(rand), { smiles } = assemble(d.core, d.placed), prof = profile(smiles);
    if (prof && !prof.classes.length) pool.push({ d, smiles, prof });
    if (i % 40 === 0) { onProgress && onProgress(i / n); await new Promise((res) => setTimeout(res, 0)); }
  }
  return pool;
}

// [what the substance has, what a partner needs to bind it, weight, how it is described]
const BINDING = [
  ["amine_basic", "acid", 1, "its basic amine (the acid forms a salt with it)"],
  ["amine_any", "acid", 0.8, "its primary or secondary amine"],
  ["acid", "amine_basic", 1, "its acid group (the amine forms a salt with it)"],
  ["sulfonamide", "amine_basic", 0.5, "its sulfonamide"],
  ["amide", "amide", 0.5, "its amide (hydrogen-bonded pairing)"],
  ["phenol", "amide", 0.4, "its phenol (hydrogen bonds)"],
  ["aryl", "aryl", 0.3, "its aromatic ring (stacking)"],
];
const FLUSHING = [
  ["amine_basic", "acid", 0.5, "acidifies the urine so its amine stays charged and is flushed out"],
  ["amine_any", "acid", 0.4, "acidifies the urine so its amine stays charged and is flushed out"],
  ["acid", "amine_basic", 0.5, "alkalises the urine so its acid stays charged and is flushed out"],
];
const GENERIC_FLUSH = [
  [["thiol", "acid"], 0.4, "gives the liver a thiol-and-acid partner to attach to it, making it water-soluble"],
  [["acid", "amine_any"], 0.35, "gives the liver an amino-acid-like partner to attach to it, making it water-soluble"],
  [["sulfonamide", "aryl"], 0.3, "drives extra urine flow, the way diuretics do"],
];
const excretable = (d) => (d.CrippenClogP <= 1.5 || d.tpsa >= 80) && d.amw <= 500;
const actsLikeIt = (res, prof) => (res.length ? res.reduce((t, e) => t + fitOf(e, prof).fit, 0) / res.length : 0);

export function neutralisers(result, effects, pool, count = 1) {
  const res = effects.map(resolve), sub = result.prof;
  const out = [];
  for (const p of pool) {
    const matched = BINDING.filter(([a, b]) => sub.flags.has(a) && p.prof.flags.has(b));
    const possible = BINDING.filter(([a]) => sub.flags.has(a)).reduce((t, x) => t + x[2], 0) || 1;
    let bind = Math.min(1, (matched.reduce((t, x) => t + x[2], 0) / possible) * (matched.length >= 2 ? 1.15 : 1)), why = matched.map((m) => m[3]);
    // a fatty substance can also be soaked up by an oil that nothing else wants
    const sink = sub.desc.CrippenClogP >= 3.5 && p.prof.desc.CrippenClogP >= 4 ? 0.55 : 0;
    if (sink > bind) { bind = sink; why = ["its oily character (an oil that soaks it up)"]; }
    if (bind < 0.3) continue;
    const exc = excretable(p.prof.desc) ? 1 : sink ? 0.4 : 0.2, act = actsLikeIt(res, p.prof);
    out.push({ ...p, bind, why, score: 0.6 * bind + 0.25 * exc + 0.15 * (act < 0.5 ? 1 : 0.3), name: nameCompound(p.d.core, p.d.placed) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count);
}

export function flushers(result, effects, pool, count = 1) {
  const res = effects.map(resolve), sub = result.prof, out = [];
  for (const p of pool) {
    const trap = FLUSHING.filter(([a, b]) => sub.flags.has(a) && p.prof.flags.has(b)).sort((x, y) => y[2] - x[2])[0];
    const gen = GENERIC_FLUSH.filter(([ids]) => ids.every((id) => p.prof.flags.has(id))).sort((x, y) => y[1] - x[1])[0];
    if (!trap && !gen) continue;
    let flush = Math.min(1, (trap ? trap[2] : 0) + (gen ? gen[1] : 0) + (trap && gen ? 0.1 : 0));
    if (!excretable(p.prof.desc)) flush *= 0.4;
    if (flush < 0.3 || actsLikeIt(res, p.prof) >= 0.5) continue;
    out.push({ ...p, flush, why: [trap && trap[3], gen && gen[2]].filter(Boolean), score: flush, name: nameCompound(p.d.core, p.d.placed) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count);
}

/* how long the effects last without help, and with each cure (minutes). A neutraliser acts within minutes of arriving;
   a flush-out agent shortens the half-life; fat-stored substances are slow to reach either way. */
export function cureTimes(est, bind, flush) {
  const slow = est.accumulates ? 1 : 0;
  const natural = est.permanent ? Infinity : 4.3 * est.halfLifeH * 60 * (slow ? 3 : 1);
  return {
    natural,
    neutralise: bind == null ? null : Math.max(10, 45 * (1 - 0.8 * bind)) * (slow ? 4 : 1),
    flush: flush == null ? null : natural / (1 + 3 * flush) * (slow ? 1.5 : 1),
  };
}
