/* Time courses: when an effect starts, how it builds, and how long it lasts. A design can ask for a time course
   (from near-instant to weeks to forever), and every structure gets an estimate from its size, polarity and groups:
   how fast it would arrive, how long the body would take to clear it, and whether it could build up or leave damage that
   outlasts it. The estimates are rough, rule-of-thumb figures for fiction (see the notes on each option). */

export const ROUTES = [
  { id: "oral", label: "Swallowed" },
  { id: "inject", label: "Injected or inhaled" },
  { id: "skin", label: "Through the skin" },
];
export const ONSETS = [
  { id: "any", label: "Any", min: null },
  { id: "instant", label: "Near instant (seconds)", min: 0.2 },
  { id: "minutes", label: "Minutes", min: 5 },
  { id: "hour", label: "About an hour", min: 60 },
  { id: "hours", label: "Several hours", min: 360 },
  { id: "day", label: "About a day", min: 1440 },
  { id: "days", label: "Days", min: 5000 },
  { id: "weeks", label: "Weeks", min: 20000 },
];
export const BUILDS = [
  { id: "any", label: "Any" },
  { id: "spike", label: "Sharp spike, then fades" },
  { id: "rise", label: "Quick rise, then holds" },
  { id: "gradual", label: "Gradual build-up" },
  { id: "delayed", label: "Quiet, then a sudden surge" },
  { id: "waves", label: "Comes in waves" },
];
export const DURATIONS = [
  { id: "any", label: "Any", min: null },
  { id: "minutes", label: "Minutes", min: 30 },
  { id: "hours", label: "Hours", min: 240 },
  { id: "day", label: "About a day", min: 1440 },
  { id: "days", label: "Days", min: 7000 },
  { id: "weeks", label: "Weeks", min: 30000 },
  { id: "months", label: "Months", min: 130000 },
  { id: "years", label: "Years", min: 1000000 },
  { id: "permanent", label: "Permanent (never wears off)", min: Infinity },
  { id: "unending", label: "Unending (keeps growing without limit)", min: Infinity },
];
export const TIME_NOTES = {
  permanent: "No single dose of a simple molecule lasts forever by itself. It takes damage that doesn't heal (pick an effect like organ or vision damage), a molecule that binds for good, or one that builds up in fat for months.",
  unending: "Only fiction does this: something has to keep amplifying itself after the molecule is gone (a self-copying agent, or a chain reaction in the body). No structure is rated for that, so it scores as a fixed hypothesis.",
};
export const DEFAULT_TIME = { route: "oral", onset: "any", build: "any", duration: "any" };

const MIN = { min: 1, hour: 60, day: 1440, week: 10080, month: 43200, year: 525600 };
export function formatMinutes(m) {
  if (m === Infinity) return "never ends";
  if (m < 1) return "seconds";
  if (m < 90) return `~${Math.round(m)} min`;
  if (m < 36 * MIN.hour) return `~${Math.round(m / MIN.hour)} h`;
  if (m < 14 * MIN.day) return `~${Math.round(m / MIN.day)} days`;
  if (m < 90 * MIN.day) return `~${Math.round(m / MIN.week)} weeks`;
  if (m < 2 * MIN.year) return `~${Math.round(m / MIN.month)} months`;
  return `~${Math.round(m / MIN.year)} years`;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lg = (x) => Math.log10(Math.max(x, 0.05));

/* how a structure would act in time: effects are the chosen effects (resolved), used for slow-acting and permanent harms */
export function estimateTime(prof, route, effects = []) {
  const d = prof.desc, logp = d.CrippenClogP, tpsa = d.tpsa, mw = d.amw, f = prof.flags;
  // onset: how long it takes to arrive, by route, then slowed by polarity, size and awkward oil/water balance
  let onset = route === "inject" ? 0.3 : route === "skin" ? 240 : 40;
  if (route === "skin") { if (logp < 0.5 || logp > 5 || mw > 500) onset *= 6; else if (logp < 1 || mw > 400) onset *= 2; }
  if (tpsa > 100) onset *= 1 + (tpsa - 100) / 30;
  if (route !== "inject") { if (logp < 0) onset *= 2; if (logp > 4.5) onset *= 1.6; if (mw > 450) onset *= 1.5; }
  if (f.has("acid")) onset *= 1.3;
  onset *= Math.max(1, ...effects.map((e) => e.lag || 1));   // slow-acting harms show long after arrival

  // half-life: oilier, halogenated, heavier molecules are cleared more slowly; esters and free hydroxyls and amines faster
  let hl = 2 * Math.exp(0.35 * (logp - 2));
  if (f.has("ester")) hl *= 0.25;
  for (const id of ["phenol", "amine_any", "acid"]) if (f.has(id)) hl *= 0.8;
  if (f.has("aryl_halide")) hl *= 1.8;
  if (/C\(F\)\(F\)F|FC\(F\)F/.test(prof.canonical || "")) hl *= 1.5;
  if (d.NumAromaticRings >= 2) hl *= 1.3;
  if (mw > 400) hl *= 1.3;
  hl = clamp(hl, 0.2, 300);
  let duration = 3 * hl * 60;
  const accumulates = logp >= 5.5 || (logp >= 4.5 && f.has("aryl_halide"));
  if (accumulates) duration = Math.max(duration, 130000);
  const permanent = effects.some((e) => e.irreversible);
  const dominant = [...effects].sort((a, b) => (b.severity || 0) - (a.severity || 0))[0];
  return { onsetMin: onset, halfLifeH: hl, pkDurationMin: duration, durationMin: permanent ? Infinity : duration, accumulates, permanent, shape: dominant && dominant.shape ? dominant.shape : "rise" };
}

/* how well an estimate matches the requested time course: factors between 0 and 1 */
export function timeMatch(req, est) {
  const onsetReq = ONSETS.find((o) => o.id === req.onset), durReq = DURATIONS.find((o) => o.id === req.duration);
  const onsetF = !onsetReq || onsetReq.min == null ? 1 : Math.exp(-Math.abs(lg(est.onsetMin) - lg(onsetReq.min)) / 0.9);
  let durF = 1;
  if (durReq && durReq.min != null) {
    if (durReq.id === "unending") durF = 0.45;
    else if (durReq.id === "permanent") durF = est.permanent ? 1 : Math.exp(-Math.max(0, 8 - lg(est.durationMin)) / 1.2);
    else durF = Math.exp(-Math.abs(lg(est.permanent ? 8 : est.durationMin) - lg(durReq.min)) / 0.9);
  }
  const buildF = req.build === "any" || !req.build ? 1 : est.shape === req.build ? 1 : 0.8;
  return { onsetF, durF, buildF, factor: Math.sqrt(onsetF * durF) * buildF, set: onsetF < 1 || durF < 1 || buildF < 1 || req.onset !== "any" || req.duration !== "any" || req.build !== "any" };
}
export const timeIsSet = (t) => t.onset !== "any" || t.build !== "any" || t.duration !== "any";

/* ───────── the curve ───────── */
const sig = (x) => 1 / (1 + Math.exp(-x));
// intensity (0 to 1) at time t minutes, for a time course starting at `onset`, lasting `dur` (Infinity: never fades)
export function intensityAt(t, onset, shape, dur, mode) {
  const lt = Math.log10(t), lo = Math.log10(Math.max(onset, 0.05));
  let rise;
  if (shape === "spike") rise = sig((lt - lo) * 9);
  else if (shape === "gradual") rise = clamp((lt - lo + 0.25) / 1.2, 0, 1);
  else if (shape === "delayed") rise = sig((lt - lo) * 16);
  else rise = sig((lt - lo) * 5);
  if (mode === "unending") return clamp(rise * (0.45 + 0.18 * Math.max(0, lt - lo)), 0, 1);
  let fall = 1;
  if (Number.isFinite(dur)) fall = shape === "spike" ? Math.exp(-Math.max(0, t - onset) / Math.max(dur / 3, 0.5)) : sig((Math.log10(Math.max(dur, 1) + onset) - lt) * 6);
  let y = rise * fall;
  if (shape === "waves") y *= 0.65 + 0.35 * Math.cos((lt - lo) * 2 * Math.PI * 1.4);
  return clamp(y, 0, 1);
}

// a request as numbers (null where it was left open)
export function requestCurve(time) {
  const on = ONSETS.find((o) => o.id === time.onset), du = DURATIONS.find((o) => o.id === time.duration);
  if (!on || on.min == null) return null;
  return { onset: on.min, shape: time.build === "any" ? "rise" : time.build, dur: du && du.min != null ? du.min : 240, mode: du && du.id };
}
export const estimateCurve = (est) => ({ onset: est.onsetMin, shape: est.shape, dur: est.durationMin, mode: null });

/* a small chart on a log time axis: seconds to years. `curves` is [{ curve, colour, dashed }] */
export function curveSvg(curves, w = 260, h = 78) {
  const x0 = Math.log10(0.2), x1 = 7, pad = { l: 4, r: 4, t: 6, b: 16 };
  const X = (lt) => pad.l + ((lt - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v) * (h - pad.t - pad.b);
  const ticks = [[0, "1 min"], [Math.log10(60), "1 h"], [Math.log10(1440), "1 day"], [Math.log10(10080), "1 wk"], [Math.log10(43200), "1 mo"], [Math.log10(525600), "1 yr"]];
  const grid = ticks.map(([lt, t], i) => `<line x1="${X(lt)}" y1="${pad.t}" x2="${X(lt)}" y2="${h - pad.b}" stroke="#2f3336" stroke-width="1"/><text x="${X(lt)}" y="${h - 4}" fill="#8b949e" font-size="9" text-anchor="${i === 0 ? "start" : "middle"}">${t}</text>`).join("");
  const paths = curves.filter((c) => c && c.curve).map(({ curve, colour, dashed }) => {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const lt = x0 + ((x1 - x0) * i) / 120;
      pts.push(`${i ? "L" : "M"}${X(lt).toFixed(1)} ${Y(intensityAt(Math.pow(10, lt), curve.onset, curve.shape, curve.dur, curve.mode)).toFixed(1)}`);
    }
    return `<path d="${pts.join(" ")}" fill="none" stroke="${colour}" stroke-width="2"${dashed ? ' stroke-dasharray="5 3"' : ""}/>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Intensity over time">${grid}${paths}</svg>`;
}
