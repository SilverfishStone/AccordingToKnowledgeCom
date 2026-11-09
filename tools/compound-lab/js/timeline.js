/* The timeline: when each chosen effect starts and ends, and what follows from it. An effect that leaves a need unmet
   (sleep, food, water) or removes a warning (pain, fear) has consequences that arrive day by day, and together they can
   end in the body giving out. Each effect can start and end on its own schedule, set apart from the compound's own time
   course. The days are rough rule-of-thumb figures for fiction (see `consequences` in effects.js). */
import { resolve } from "./effects.js";
import { ONSETS, DURATIONS } from "./timecourse.js";

const SCALE = [1.4, 1, 0.8];   // mild effects take longer to do harm, extreme ones less
const DAY = 1440;
export const TONES = { cognitive: "#8ab4ff", behaviour: "#ffc46b", body: "#ff9b9b", danger: "#c9a0ff", cure: "#7fe3b0" };

// per-effect schedule choices: "inherit" follows the substance's own time course
export const START_CHOICES = [{ id: "inherit", label: "With the substance" }, ...ONSETS.filter((o) => o.id !== "any")];
export const END_CHOICES = [{ id: "inherit", label: "As the substance" }, ...DURATIONS.filter((o) => o.id !== "any")];

/* an effect's start and end in days: end is null when it carries on */
export function effectDays(sel, global) {
  const onsetId = sel.onset && sel.onset !== "inherit" ? sel.onset : global.onset;
  const durId = sel.duration && sel.duration !== "inherit" ? sel.duration : global.duration;
  const on = ONSETS.find((o) => o.id === onsetId), du = DURATIONS.find((o) => o.id === durId);
  const start = on && on.min != null ? on.min / DAY : 0;
  const end = du && du.min != null && Number.isFinite(du.min) ? start + du.min / DAY : null;
  return { start, end };
}

/* `rescue` is the day the cure is given (or null): the substance is neutralised within the hour, so effects stop, the
   consequences still to come are prevented and, if it comes before the collapse, the collapse is averted. What has already
   happened has to be recovered from, which takes time. */
export function buildTimeline(selection, global, rescue = null) {
  const items = selection.map((s) => ({ s, r: resolve(s), ...effectDays(s, global) }));
  const events = [], collapses = [];
  let painBlocked = false;
  for (const { s, r, start } of items) {
    const k = SCALE[s.level];
    for (const c of r.consequences || []) events.push({ day: start + c.day * k, text: c.text, source: r.name, tone: c.tone });
    if (r.collapse) collapses.push({ day: start + r.collapse.day * k, text: r.collapse.text, source: r.name });
    if (r.painLike && !(r.modeId === "need")) painBlocked = true;
  }
  // the chosen aggression or erratic behaviour, and a steady mood that gives way when sleep loss has damaged the brain
  for (const { r, start } of items) if (["aggression_up", "erratic"].includes(r.id)) events.push({ day: start, text: `${r.name} sets in`, source: r.name, tone: "behaviour" });
  const steady = items.find((x) => x.r.id === "mood_steady");
  const breakdown = events.filter((e) => e.tone !== "danger" && /erratic|aggress|violent/i.test(e.text)).sort((a, b) => a.day - b.day)[0];
  if (steady && breakdown && breakdown.day > steady.start) events.push({ day: breakdown.day, text: "The steady mood breaks down as the damaged brain can no longer hold it: erratic, aggressive behaviour", source: steady.r.name, tone: "behaviour" });

  let collapse = null;
  if (collapses.length) {
    collapses.sort((a, b) => a.day - b.day);
    let day = collapses[0].day * Math.max(0.5, 1 - 0.12 * (collapses.length - 1));   // several unmet needs at once wear the body down faster
    const notes = [];
    if (collapses.length > 1) notes.push("several unmet needs at once speed it up");
    if (painBlocked) { day *= 0.9; notes.push("unnoticed injuries make it worse"); }
    collapse = { day, causes: [...new Set(collapses.map((c) => c.source))], text: collapses[0].text, notes };
  }
  // the same consequence from several effects (three kinds of pain relief all hide injuries) is listed once
  const merged = [];
  for (const e of events.sort((a, b) => a.day - b.day)) {
    const same = merged.find((m) => m.text === e.text && Math.abs(m.day - e.day) < 0.05);
    if (same) { if (!same.source.split(", ").includes(e.source)) same.source += ", " + e.source; } else merged.push({ ...e });
  }
  if (rescue == null) return { items, events: merged, collapse };
  const stop = rescue + 1 / 24;
  let kept = merged.filter((e) => e.day <= stop);
  for (const it of items) it.end = it.end == null ? stop : Math.min(it.end, stop);
  const late = collapse && collapse.day <= rescue;
  const done = late ? collapse : collapse && { ...collapse, averted: true };
  kept.push({ day: stop, text: late ? "The cure is given, but the body had already collapsed" : "The cure is given: the substance is neutralised and the effects stop", source: "Cure", tone: "cure" });
  if (!late) for (const it of items.filter((x) => x.r.consequences && x.r.consequences.length && x.r.collapse)) {
    const n = Math.max(1, Math.round(rescue * 0.6));
    kept.push({ day: stop + n, text: `Recovery from the effects of ${it.r.name.toLowerCase()} takes about ${n} day${n === 1 ? "" : "s"} (faster with brain repair and careful refeeding)`, source: "Recovery", tone: "cure" });
  }
  return { items, events: kept.sort((a, b) => a.day - b.day), collapse: done, rescue: stop };
}

export function formatDay(d) {
  if (d < 1 / 24) return "minutes";
  if (d < 1) return `~${Math.round(d * 24)} h`;
  if (d < 14) return `day ${d < 10 ? Math.round(d * 10) / 10 : Math.round(d)}`;
  if (d < 70) return `week ${Math.round(d / 7)}`;
  return `month ${Math.round(d / 30)}`;
}

/* a chart: one bar per effect, the consequences as dots, and the collapse as a red line */
export function timelineSvg(tl, w = 320) {
  const rowH = 17, top = 16, left = 8, right = 8;
  const last = Math.max(10, tl.collapse ? tl.collapse.day * 1.12 : 0, ...tl.events.map((e) => e.day * 1.05));
  const step = [1, 2, 5, 10, 20, 50, 100].find((x) => last / x <= 7) || 200;
  const X = (d) => left + (Math.min(d, last) / last) * (w - left - right);
  const rows = tl.items.length + 1, h = top + rows * rowH + 18;
  let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Timeline of the chosen effects">`;
  for (let d = 0; d <= last; d += step) svg += `<line x1="${X(d)}" y1="${top - 4}" x2="${X(d)}" y2="${h - 16}" stroke="#2f3336"/><text x="${X(d)}" y="${h - 4}" fill="#8b949e" font-size="9" text-anchor="middle">${d}</text>`;
  svg += `<text x="${w - right}" y="${h - 4}" fill="#8b949e" font-size="9" text-anchor="end">days</text>`;
  tl.items.forEach(({ r, start, end }, i) => {
    const y = top + i * rowH, stop = tl.collapse && !tl.collapse.averted ? tl.collapse.day : last, x1 = X(start), x2 = X(end == null ? stop : Math.min(end, stop));
    svg += `<rect x="${x1}" y="${y + 3}" width="${Math.max(3, x2 - x1)}" height="${rowH - 7}" rx="3" fill="#2b3a5c" stroke="#8ab4ff" stroke-width="1"/><text x="${x1 + 4}" y="${y + rowH - 5}" fill="#e7e9ea" font-size="9">${r.name.length > 34 ? r.name.slice(0, 33) + "…" : r.name}</text>`;
  });
  const ey = top + tl.items.length * rowH;
  for (const e of tl.events) svg += `<circle cx="${X(e.day)}" cy="${ey + rowH / 2 + 2}" r="3.5" fill="${TONES[e.tone] || "#ccc"}"><title>${formatDay(e.day)}: ${e.text}</title></circle>`;
  if (tl.collapse) svg += `<line x1="${X(tl.collapse.day)}" y1="${top - 6}" x2="${X(tl.collapse.day)}" y2="${h - 16}" stroke="${tl.collapse.averted ? "#6b7280" : "#ff5c5c"}" stroke-width="2"${tl.collapse.averted ? ' stroke-dasharray="4 3"' : ""}/><text x="${Math.min(X(tl.collapse.day) + 4, w - 52)}" y="${top - 6}" fill="${tl.collapse.averted ? "#8b949e" : "#ff9b9b"}" font-size="9">${tl.collapse.averted ? "collapse averted" : "collapse"}</text>`;
  if (tl.rescue != null) svg += `<line x1="${X(tl.rescue)}" y1="${top - 6}" x2="${X(tl.rescue)}" y2="${h - 16}" stroke="#7fe3b0" stroke-width="2"/><text x="${Math.min(X(tl.rescue) + 4, w - 28)}" y="${h - 18}" fill="#7fe3b0" font-size="9">cure</text>`;
  return svg + "</svg>";
}
