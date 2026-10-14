/* The maths of a quiz: turns a person's answers into a result. Used by the quiz page (quiz.js)
   and the preview in the quiz maker (quiz-maker.js).

   A quiz is { title, intro, sections: [...], matches: [...] } (the worker's cleanQuiz in index.js
   checks every quiz it saves). A section has `poles` (its labels) and `questions`:
     - 2 poles  -> a spectrum. Each answer sits at its place in the list (first answer = the first
                   pole's end, last answer = the other end). `mid` names the middle.
     - 3+ poles -> a polygon with one corner per pole. Each answer has `to`: the poles it votes
                   for (it counts 1, shared evenly when it names more than one).
   An answer marked `idk` ("I don't know") leaves the person's position where it is.
   Answers are stored as one digit per question: 0 = skipped, 1 = the first answer, 2 = the second…
   Matches are lists of things to compare people with (sects, figures…). Each entry can say how it would
   answer each question (`picks`: { questionId: answer number }); a person is then compared answer by
   answer. An entry without picks is compared by its `pos` per section instead: a number 0..1 on a
   spectrum, or a share for each pole on a polygon. */
(() => {
  "use strict";

  const isPoly = (sec) => sec.poles.length >= 3;
  const WORDS = ["", "", "two", "three", "four", "five", "six", "seven", "eight"];

  const questionCount = (quiz) => quiz.sections.reduce((n, s) => n + s.questions.length, 0);

  // "3141…" -> [3,1,4,1,…], or null if it doesn't fit this quiz
  function parseAnswers(quiz, text) {
    const s = String(text || "");
    if (s.length !== questionCount(quiz) || !/^[0-9]+$/.test(s)) return null;
    const out = [...s].map(Number);
    let i = 0;
    for (const sec of quiz.sections) for (const q of sec.questions) {
      if (out[i++] > q.options.length) return null;
    }
    return out;
  }

  function scoreSection(sec, answers) {   // answers: one number per question of this section
    let idk = 0, skipped = 0;
    if (isPoly(sec)) {
      const w = sec.poles.map(() => 0);
      sec.questions.forEach((q, i) => {
        const a = answers[i];
        if (!a) { skipped++; return; }
        const o = q.options[a - 1];
        if (!o || o.idk) { idk++; return; }
        const to = o.to || [];
        to.forEach((k) => { w[k] += 1 / to.length; });
      });
      const total = w.reduce((s, x) => s + x, 0);
      const n = sec.poles.length;
      const p = w.map((x) => (total ? x / total : 1 / n));
      const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const dominant = Math.min(0.5, 1.5 / n);   // three poles: half or more
      let verdict;
      if (!total) verdict = "Undecided";
      else if (order[0][0] >= dominant) verdict = sec.poles[order[0][1]];
      else if (order[1][0] >= dominant * 0.6 && order[0][0] - order[2][0] > 0.15) verdict = `${sec.poles[order[0][1]]} / ${sec.poles[order[1][1]]}`;
      else verdict = `Balanced between all ${WORDS[n] || n}`;
      return { kind: "poly", p, verdict, idk, skipped, answered: !!total };
    }
    const vals = [];
    sec.questions.forEach((q, i) => {
      const a = answers[i];
      if (!a) { skipped++; return; }
      const o = q.options[a - 1];
      if (!o || o.idk) { idk++; return; }
      vals.push(q.options.length > 1 ? (a - 1) / (q.options.length - 1) : 0.5);
    });
    const pos = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0.5;
    const [left, right] = sec.poles, mid = sec.mid || "Balanced";
    const verdict = !vals.length ? "Undecided"
      : pos < 0.2 ? "Strong " + left : pos < 0.4 ? "Leans " + left : pos <= 0.6 ? mid : pos <= 0.8 ? "Leans " + right : "Strong " + right;
    return { kind: "line", pos, verdict, idk, skipped, answered: !!vals.length };
  }

  // Answer by answer: the same answer counts 1. On a spectrum a neighbouring answer counts half; on a
  // polygon an answer that votes for one of the same corners counts half. Questions the person skipped
  // or answered "I don't know" (or the entry has no answer for) are left out.
  function byAnswers(quiz, answers, item) {
    if (!item.picks) return null;
    let sum = 0, n = 0, same = 0, at = 0;
    for (const sec of quiz.sections) for (const q of sec.questions) {
      const mine = answers[at++], theirs = q.id && item.picks[q.id];
      if (!mine || !theirs) continue;
      const a = q.options[mine - 1], b = q.options[theirs - 1];
      if (!a || !b || a.idk || b.idk) continue;
      n++;
      if (mine === theirs) { sum += 1; same++; continue; }
      if (isPoly(sec)) sum += (a.to || []).some((k) => (b.to || []).includes(k)) ? 0.5 : 0;
      else sum += Math.max(0, 1 - Math.abs(mine - theirs) / 2);
    }
    return n >= 3 ? { score: sum / n, counted: n, same } : null;
  }

  // how alike a person's result and a match are on the sections both have: 1 = identical
  function closeness(quiz, sections, item) {
    let sum = 0, n = 0;
    quiz.sections.forEach((sec, i) => {
      const r = sections[i], q = item.pos && item.pos[sec.id];
      if (!r.answered || q == null) return;
      if (r.kind === "poly") {
        if (!Array.isArray(q) || q.length !== r.p.length) return;
        sum += Math.sqrt(r.p.reduce((s, x, k) => s + (x - q[k]) ** 2, 0)) / Math.SQRT2;   // corner to corner is √2
      } else {
        if (typeof q !== "number") return;
        sum += Math.abs(r.pos - q);
      }
      n++;
    });
    return n ? { score: 1 - sum / n, sections: n } : null;
  }

  function score(quiz, answers) {
    let at = 0;
    const sections = quiz.sections.map((sec) => {
      const mine = answers.slice(at, at + sec.questions.length);
      at += sec.questions.length;
      return scoreSection(sec, mine);
    });
    const matches = (quiz.matches || []).map((g) => {
      const ranked = g.items.map((item) => {
        const a = byAnswers(quiz, answers, item);
        return { item, c: a || closeness(quiz, sections, item), answers: a };
      }).filter((x) => x.c).sort((a, b) => b.c.score - a.c.score)
        .map((x) => ({ item: x.item, score: x.c.score, sections: x.c.sections, same: x.answers ? x.answers.same : null, counted: x.answers ? x.answers.counted : null }));
      return { id: g.id, title: g.title, label: g.label, ranked };
    });
    return { sections, matches };
  }

  window.QuizCore = { isPoly, questionCount, parseAnswers, score, scoreSection, WORDS };
})();
