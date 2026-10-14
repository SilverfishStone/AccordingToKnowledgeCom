/* Quizzes on the articles site: the list, taking a quiz, and the results.
   site.js owns the addresses and calls in here:
     quiz.list()                    /quizzes
     quiz.play(slug, username)      /quiz/<slug> (take it), /quiz/<slug>/<username> (a result they shared)
   A result is also a link: /quiz/<slug>#r<one digit per question>. The maths is in quiz-core.js;
   saving results to an account goes through /api/quizzes/<slug>/… (worker/index.js). */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const L = () => community.lib;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pct = (x) => Math.round(x * 100) + "%";
  const SITE = "https://accordingtoknowledge.com";
  const store = {
    get: (slug) => { try { return JSON.parse(localStorage.getItem("atk-quiz:" + slug) || "null"); } catch { return null; } },
    set: (slug, v) => { try { localStorage.setItem("atk-quiz:" + slug, JSON.stringify(v)); } catch { } },
    clear: (slug) => { try { localStorage.removeItem("atk-quiz:" + slug); } catch { } },
  };
  const setTitle = (t, d) => quiz.site.setTitle(t, d);
  const say = (m, kind) => { const t = $("#toast"); if (!t) return; t.textContent = m; t.className = "toast show"; clearTimeout(say.h); say.h = setTimeout(() => (t.className = "toast"), 2600); };

  /* ───────── /quizzes ───────── */
  async function list() {
    const box = $("#quizzes-box");
    setTitle("Quizzes", "Quizzes from According To Knowledge.");
    box.innerHTML = `<p class="note">Loading…</p>`;
    try {
      const [d, me] = await Promise.all([L().api("quizzes"), L().loadMe()]);
      const admin = me.user && me.user.role === "admin";
      box.innerHTML = (d.quizzes.length ? `<div class="article-list">${d.quizzes.map((q) => `
        <a class="item" href="quiz/${esc(q.slug)}" data-link>
          <span class="item-title">${esc(q.title)}${q.published ? "" : ' <span class="author-tag held-tag">Draft</span>'}</span>
          ${q.summary ? `<p>${esc(q.summary)}</p>` : ""}
          <span class="meta">${q.questions} questions</span>
        </a>`).join("")}</div>` : `<p class="empty">No quizzes yet.</p>`)
        + (admin ? `<p class="center"><a class="text-link" href="quiz-maker" data-link>Make or edit quizzes →</a></p>` : "");
    } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
  }

  /* ───────── drawing a result ───────── */
  const wrap = (text, n) => {
    const lines = []; let cur = "";
    for (const w of String(text).split(/\s+/)) {
      if (cur && (cur + " " + w).length > n) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };
  // corners go anticlockwise from the top, so three poles make the usual triangle (the second bottom-left)
  const corners = (n, cx, cy, R) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 - (2 * Math.PI * i) / n;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a), Math.cos(a), Math.sin(a)];
  });

  function polySVG(sec, r) {
    const n = sec.poles.length, cx = 250, cy = 205, R = 105;
    const ys = Array.from({ length: n }, (_, i) => cy + (R + 14) * Math.sin(-Math.PI / 2 - (2 * Math.PI * i) / n));
    const top = Math.round(Math.min(...ys) - 82), height = Math.round(Math.max(...ys) + 82 - top);   // room for the labels
    const v = corners(n, cx, cy, R);
    const pt = [0, 1].map((k) => v.reduce((s, c, i) => s + r.p[i] * c[k], 0));
    const shape = (f) => v.map((c) => `${(cx + (c[0] - cx) * f).toFixed(1)},${(cy + (c[1] - cy) * f).toFixed(1)}`).join(" ");
    const labels = v.map((c, i) => {
      const lx = cx + (R + 14) * c[2], ly = cy + (R + 14) * c[3];
      const lines = wrap(sec.poles[i], 13), total = lines.length * 19 + 19;
      const anchor = c[2] > 0.3 ? "start" : c[2] < -0.3 ? "end" : "middle";
      const y0 = c[3] < -0.3 ? ly - total + 15 : c[3] > 0.3 ? ly + 17 : ly - total / 2 + 15;
      return `<text text-anchor="${anchor}" font-size="16" font-weight="600" fill="var(--ink)">${lines.map((t, k) => `<tspan x="${lx.toFixed(1)}" y="${(y0 + k * 19).toFixed(1)}">${esc(t)}</tspan>`).join("")}<tspan x="${lx.toFixed(1)}" y="${(y0 + lines.length * 19).toFixed(1)}" fill="var(--accent)" font-weight="700">${pct(r.p[i])}</tspan></text>`;
    }).join("");
    return `<svg class="q-viz" viewBox="0 ${top} 500 ${height}" role="img" aria-label="${esc(sec.title)}: ${esc(sec.poles.map((p, i) => p + " " + pct(r.p[i])).join(", "))}">
      <polygon points="${shape(1)}" fill="rgba(123,45,18,.1)" stroke="var(--accent)" stroke-width="1.6" stroke-linejoin="round"/>
      <polygon points="${shape(0.5)}" fill="none" stroke="var(--line)" stroke-dasharray="3 4"/>
      ${v.map((c) => `<line x1="${cx}" y1="${cy}" x2="${c[0].toFixed(1)}" y2="${c[1].toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 5"/>`).join("")}
      ${labels}
      ${r.answered ? `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="14" fill="var(--accent)" opacity=".22"/><circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="7" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/>` : ""}
    </svg>`;
  }
  function lineSVG(sec, r) {
    const x0 = 20, x1 = 600, x = x0 + (x1 - x0) * r.pos, mid = sec.mid || "Balanced";
    const text = (t, ax, anchor, weight, fill) => wrap(t, 20).map((l, k) => `<text x="${ax}" y="${84 + k * 20}" font-size="17" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`).join("");
    return `<svg class="q-viz q-line" viewBox="0 0 620 135" role="img" aria-label="${esc(sec.title)}: position ${pct(r.pos)} toward ${esc(sec.poles[1])}">
      <rect x="${x0}" y="38" width="${x1 - x0}" height="8" rx="4" fill="rgba(123,45,18,.1)" stroke="var(--line)"/>
      ${[0, 0.25, 0.5, 0.75, 1].map((t) => `<line x1="${x0 + (x1 - x0) * t}" y1="34" x2="${x0 + (x1 - x0) * t}" y2="50" stroke="var(--line)"/>`).join("")}
      ${r.answered ? `<circle cx="${x}" cy="42" r="15" fill="var(--accent)" opacity=".22"/><circle cx="${x}" cy="42" r="8" fill="var(--accent)" stroke="var(--paper)" stroke-width="2"/>` : ""}
      ${text(sec.poles[0], x0, "start", 600, "var(--ink)")}${text(mid, (x0 + x1) / 2, "middle", 400, "var(--dim)")}${text(sec.poles[1], x1, "end", 600, "var(--ink)")}
    </svg>`;
  }

  function matchHTML(m) {
    if (!m.ranked.length) return "";
    const [top, ...rest] = m.ranked;
    const img = top.item.image ? `<img class="q-match-img" src="${esc(top.item.image)}" alt="" width="96" height="96" loading="lazy" />` : "";
    return `<article class="q-match">
      <p class="eyebrow">${esc(m.label)}</p>
      <div class="q-match-top">${img}<div>
        <h3>${esc(top.item.name)} <span class="q-pct">${pct(top.score)}</span></h3>
        ${top.item.blurb ? `<p>${esc(top.item.blurb)}</p>` : ""}
        ${top.same != null ? `<p class="q-same">Same answer as you on <b>${top.same}</b> of the ${top.counted} questions you answered${top.same < top.counted ? ", and close on many of the rest" : ""}.</p>` : ""}
      </div></div>
      ${rest.length ? `<p class="q-also"><b>Also close:</b> ${rest.slice(0, 3).map((x) => `${esc(x.item.name)} (${pct(x.score)})`).join(" · ")}</p>` : ""}
    </article>`;
  }

  function resultsHTML(quizData, res) {
    const plates = quizData.sections.map((sec, i) => {
      const r = res.sections[i];
      const notes = [];
      if (r.idk) notes.push(`${r.idk} × "I don't know"`);
      if (r.skipped) notes.push(`${r.skipped} skipped`);
      return `<article class="q-plate"><p class="eyebrow">${esc(sec.title)}</p><div class="q-verdict">${esc(r.verdict)}</div>
        ${r.kind === "poly" ? polySVG(sec, r) + `<p class="q-legend">${sec.poles.map((p, k) => `<span>${esc(p)} <b>${pct(r.p[k])}</b></span>`).join("")}</p>` : lineSVG(sec, r)}
        ${notes.length ? `<p class="meta center">${esc(notes.join(" · "))}</p>` : ""}</article>`;
    }).join("");
    return `${res.matches.map(matchHTML).join("")}${plates}`;
  }

  /* ───────── the picture to share ───────── */
  async function makeImage(quizData, res) {
    try { await document.fonts.ready; } catch { }
    const W = 1080, P = 72, FONT = '"Open Sans", "Segoe UI", Arial, sans-serif';
    const PAPER = "#e9cb77", INK = "#1f160a", DIM = "#6e5628", LINE = "rgba(70,45,10,.35)", ACC = "#7b2d12", WASH = "rgba(123,45,18,.1)";
    const matches = res.matches.filter((m) => m.ranked.length);
    const blockH = (s) => (s.poles.length >= 3 ? 600 : 260);
    const H = 330 + matches.length * 150 + quizData.sections.reduce((t, s) => t + blockH(s), 0) + 120;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48);
    g.fillStyle = DIM; g.font = `700 22px ${FONT}`; g.fillText("ACCORDING TO KNOWLEDGE", P, 118);
    g.fillStyle = INK; g.font = `800 70px ${FONT}`; g.fillText(quizData.title, P, 205, W - 2 * P);
    g.font = `600 30px ${FONT}`; g.fillStyle = DIM; g.fillText("My results", P, 252);
    g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(P, 282); g.lineTo(W - P, 282); g.stroke();
    let y = 340;
    const faces = await topFaces(matches);
    matches.forEach((m, i) => {
      const room = W - 2 * P - (faces[i] ? 124 : 0);
      if (faces[i]) drawFace(g, faces[i], W - P - 104, y - 22, 104);
      g.fillStyle = DIM; g.font = `700 20px ${FONT}`; g.fillText(m.label.toUpperCase(), P, y, room);
      g.fillStyle = ACC; g.font = `800 48px ${FONT}`; g.fillText(`${m.ranked[0].item.name}  ${pct(m.ranked[0].score)}`, P, y + 58, room);
      y += 150;
    });
    g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.moveTo(P, y - 60); g.lineTo(W - P, y - 60); g.stroke();
    y += 20;
    quizData.sections.forEach((sec, i) => {
      const r = res.sections[i];
      g.textAlign = "left"; g.fillStyle = DIM; g.font = `700 20px ${FONT}`; g.fillText(sec.title.toUpperCase(), P, y, W - 2 * P);
      g.fillStyle = ACC; g.font = `800 46px ${FONT}`; g.fillText(r.verdict, P, y + 56, W - 2 * P);
      if (r.kind === "poly") {
        const n = sec.poles.length, cx = W / 2, cy = y + 330, R = 170, v = corners(n, cx, cy, R);
        const pt = [0, 1].map((k) => v.reduce((s, c, j) => s + r.p[j] * c[k], 0));
        const path = (f) => { g.beginPath(); v.forEach((c, j) => { const px = cx + (c[0] - cx) * f, py = cy + (c[1] - cy) * f; j ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); };
        path(1); g.fillStyle = WASH; g.fill(); g.strokeStyle = ACC; g.lineWidth = 3; g.stroke();
        path(0.5); g.setLineDash([6, 8]); g.strokeStyle = LINE; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
        v.forEach((c, j) => {
          const lx = cx + (R + 20) * c[2], ly = cy + (R + 20) * c[3];
          g.textAlign = c[2] > 0.3 ? "left" : c[2] < -0.3 ? "right" : "center";
          const lines = wrap(sec.poles[j], 20), total = lines.length * 28 + 28;
          const y0 = c[3] < -0.3 ? ly - total + 20 : c[3] > 0.3 ? ly + 24 : ly - total / 2 + 22;
          g.font = `700 24px ${FONT}`; g.fillStyle = INK;
          lines.forEach((t, k) => g.fillText(t, lx, y0 + k * 28));
          g.fillStyle = ACC; g.fillText(pct(r.p[j]), lx, y0 + lines.length * 28);
        });
        if (r.answered) { g.fillStyle = "rgba(123,45,18,.25)"; g.beginPath(); g.arc(pt[0], pt[1], 22, 0, 7); g.fill(); g.fillStyle = ACC; g.strokeStyle = PAPER; g.lineWidth = 4; g.beginPath(); g.arc(pt[0], pt[1], 12, 0, 7); g.fill(); g.stroke(); }
      } else {
        const x0 = P, x1 = W - P, ty = y + 130, x = x0 + (x1 - x0) * r.pos;
        g.fillStyle = WASH; g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.roundRect(x0, ty - 7, x1 - x0, 14, 7); g.fill(); g.stroke();
        [0, 0.25, 0.5, 0.75, 1].forEach((t) => { g.beginPath(); g.moveTo(x0 + (x1 - x0) * t, ty - 16); g.lineTo(x0 + (x1 - x0) * t, ty + 16); g.stroke(); });
        if (r.answered) { g.fillStyle = "rgba(123,45,18,.25)"; g.beginPath(); g.arc(x, ty, 24, 0, 7); g.fill(); g.fillStyle = ACC; g.strokeStyle = PAPER; g.lineWidth = 4; g.beginPath(); g.arc(x, ty, 13, 0, 7); g.fill(); g.stroke(); }
        g.font = `700 22px ${FONT}`; g.fillStyle = INK; g.textAlign = "left"; g.fillText(sec.poles[0], x0, ty + 58, 330);
        g.textAlign = "right"; g.fillText(sec.poles[1], x1, ty + 58, 330);
        g.textAlign = "center"; g.fillStyle = DIM; g.font = `400 22px ${FONT}`; g.fillText(sec.mid || "Balanced", W / 2, ty + 58, 300); g.textAlign = "left";
      }
      y += blockH(sec);
      if (i < quizData.sections.length - 1) { g.strokeStyle = LINE; g.lineWidth = 1; g.beginPath(); g.moveTo(P, y - 30); g.lineTo(W - P, y - 30); g.stroke(); }
    });
    g.textAlign = "left"; g.fillStyle = DIM; g.font = `600 20px ${FONT}`; g.fillText("accordingtoknowledge.com", P, H - 62);
    return new Promise((res2) => cv.toBlob(res2, "image/png"));
  }

  /* More picture shapes: a square one with everything, or two square ones (who you match, where you stand). */
  const IMG = { FONT: '"Open Sans", "Segoe UI", Arial, sans-serif', PAPER: "#e9cb77", INK: "#1f160a", DIM: "#6e5628", LINE: "rgba(70,45,10,.35)", ACC: "#7b2d12", WASH: "rgba(123,45,18,.1)" };
  // a result's picture, if its entry has one (a picture on another website only draws if that site allows it)
  function loadPic(src) {
    return new Promise((done) => {
      if (!src) return done(null);
      const img = new Image();
      if (!src.startsWith("/")) img.crossOrigin = "anonymous";
      img.onload = () => done(img);
      img.onerror = () => done(null);
      img.src = src;
    });
  }
  function drawFace(g, img, x, y, s) {
    const r = s * 0.14, side = Math.min(img.naturalWidth, img.naturalHeight);
    g.save(); g.beginPath(); g.roundRect(x, y, s, s, r); g.clip();
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x, y, s, s);
    g.restore();
    g.strokeStyle = IMG.INK; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, s, s, r); g.stroke();
  }
  const topFaces = (ms) => Promise.all(ms.map((m) => loadPic(m.ranked[0].item.image)));
  const toBlob = (cv) => new Promise((done) => cv.toBlob(done, "image/png"));
  function newCanvas(W, H) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = IMG.PAPER; g.fillRect(0, 0, W, H);
    g.strokeStyle = IMG.INK; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48);
    g.textBaseline = "alphabetic"; g.textAlign = "left";
    return [cv, g];
  }
  // brand and title (and an optional second line); returns where the content can start
  function cardHeader(g, W, P, title, sub) {
    g.fillStyle = IMG.DIM; g.font = `700 20px ${IMG.FONT}`; g.fillText("ACCORDING TO KNOWLEDGE", P, 76);
    g.fillStyle = IMG.INK; g.font = `800 46px ${IMG.FONT}`; g.fillText(title, P, 130, W - 2 * P);
    let y = 154;
    if (sub) { g.fillStyle = IMG.DIM; g.font = `600 26px ${IMG.FONT}`; g.fillText(sub, P, 172); y = 190; }
    g.strokeStyle = IMG.INK; g.lineWidth = 4; g.beginPath(); g.moveTo(P, y); g.lineTo(W - P, y); g.stroke();
    return y + 34;
  }
  const cardFooter = (g, W, H, P) => { g.fillStyle = IMG.DIM; g.font = `600 20px ${IMG.FONT}`; g.textAlign = "left"; g.fillText("accordingtoknowledge.com", P, H - 52); };

  // one section as a small tile: its name, the verdict, a little chart and the numbers
  function drawTile(g, sec, r, x, y, w) {
    const { FONT, INK, DIM, LINE, ACC, WASH, PAPER } = IMG;
    g.textAlign = "left";
    g.fillStyle = DIM; g.font = `700 15px ${FONT}`; g.fillText((sec.short || sec.title).toUpperCase(), x, y + 14, w);
    g.fillStyle = ACC; g.font = `800 25px ${FONT}`;
    const vl = wrap(r.verdict, 19).slice(0, 2);
    vl.forEach((t, k) => g.fillText(t, x, y + 46 + k * 28, w));
    const top = y + 46 + vl.length * 28 + 8;
    if (r.kind === "poly") {
      const n = sec.poles.length, R = Math.min(56, (w - 24) / 2), cx = x + w / 2, cy = top + R + 6, v = corners(n, cx, cy, R);
      const pt = [0, 1].map((k) => v.reduce((s, c, j) => s + r.p[j] * c[k], 0));
      const path = (f) => { g.beginPath(); v.forEach((c, j) => { const px = cx + (c[0] - cx) * f, py = cy + (c[1] - cy) * f; j ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath(); };
      path(1); g.fillStyle = WASH; g.fill(); g.strokeStyle = ACC; g.lineWidth = 2.5; g.stroke();
      path(0.5); g.setLineDash([4, 6]); g.strokeStyle = LINE; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
      if (r.answered) { g.fillStyle = "rgba(123,45,18,.25)"; g.beginPath(); g.arc(pt[0], pt[1], 13, 0, 7); g.fill(); g.fillStyle = ACC; g.strokeStyle = PAPER; g.lineWidth = 3; g.beginPath(); g.arc(pt[0], pt[1], 7, 0, 7); g.fill(); g.stroke(); }
      sec.poles.forEach((p, k) => {
        const ly = cy + R + 28 + k * 19;
        g.textAlign = "left"; g.fillStyle = INK; g.font = `600 14px ${FONT}`; g.fillText(p, x, ly, w - 50);
        g.textAlign = "right"; g.fillStyle = ACC; g.font = `700 14px ${FONT}`; g.fillText(pct(r.p[k]), x + w, ly);
      });
    } else {
      const by = top + 34, x0 = x + 4, x1 = x + w - 4, mx = x0 + (x1 - x0) * r.pos;
      g.fillStyle = WASH; g.strokeStyle = LINE; g.lineWidth = 1.5; g.beginPath(); g.roundRect(x0, by - 5, x1 - x0, 10, 5); g.fill(); g.stroke();
      if (r.answered) { g.fillStyle = "rgba(123,45,18,.25)"; g.beginPath(); g.arc(mx, by, 14, 0, 7); g.fill(); g.fillStyle = ACC; g.strokeStyle = PAPER; g.lineWidth = 3; g.beginPath(); g.arc(mx, by, 8, 0, 7); g.fill(); g.stroke(); }
      g.font = `600 14px ${FONT}`; g.fillStyle = INK; g.textAlign = "left"; g.fillText(sec.poles[0], x, by + 34, w / 2 - 6);
      g.textAlign = "right"; g.fillText(sec.poles[1], x + w, by + 34, w / 2 - 6);
      g.textAlign = "center"; g.fillStyle = ACC; g.font = `700 16px ${FONT}`; g.fillText(`${pct(r.pos)} toward ${sec.poles[1]}`, x + w / 2, by + 64, w);
      g.textAlign = "left";
    }
  }
  // the tiles in rows of three; returns the y where they end
  function drawTiles(g, quizData, res, P, W, y0, rowH) {
    const cols = 3, gap = 24, w = (W - 2 * P - (cols - 1) * gap) / cols;
    quizData.sections.forEach((sec, i) => drawTile(g, sec, res.sections[i], P + (i % cols) * (w + gap), y0 + Math.floor(i / cols) * rowH, w));
    return y0 + Math.ceil(quizData.sections.length / cols) * rowH;
  }
  const tileRows = (quizData) => Math.ceil(quizData.sections.length / 3);
  // a row of tiles is as tall as its longest list of corners needs
  const tileRowH = (quizData, base) => base + Math.max(0, Math.max(...quizData.sections.map((s) => (s.poles.length >= 3 ? s.poles.length : 0))) - 3) * 19;
  const rankedMatches = (res) => res.matches.filter((m) => m.ranked.length);

  async function drawSquare(quizData, res) {
    try { await document.fonts.ready; } catch { }
    const W = 1080, P = 60, ms = rankedMatches(res), rowH = tileRowH(quizData, 326);
    const H = Math.max(1080, 188 + ms.length * 66 + 10 + tileRows(quizData) * rowH + 96);
    const [cv, g] = newCanvas(W, H);
    let y = cardHeader(g, W, P, quizData.title, "");
    const faces = await topFaces(ms);
    ms.forEach((m, i) => {
      const room = W - 2 * P - (faces[i] ? 72 : 0);
      if (faces[i]) drawFace(g, faces[i], W - P - 58, y - 16, 58);
      g.fillStyle = IMG.DIM; g.font = `700 17px ${IMG.FONT}`; g.fillText(m.label.toUpperCase(), P, y, room);
      g.fillStyle = IMG.ACC; g.font = `800 34px ${IMG.FONT}`; g.fillText(`${m.ranked[0].item.name}  ${pct(m.ranked[0].score)}`, P, y + 36, room);
      y += 66;
    });
    y += 6;
    g.strokeStyle = IMG.LINE; g.lineWidth = 2; g.beginPath(); g.moveTo(P, y - 24); g.lineTo(W - P, y - 24); g.stroke();
    drawTiles(g, quizData, res, P, W, y + 4, rowH);
    cardFooter(g, W, H, P);
    return toBlob(cv);
  }
  // picture 1 of 2: who you match, with a line about each
  async function drawMatchesCard(quizData, res) {
    try { await document.fonts.ready; } catch { }
    const W = 1080, P = 64, ms = rankedMatches(res), per = Math.max(330, Math.floor(730 / Math.max(ms.length, 1)));
    const H = Math.max(1080, 270 + ms.length * per + 80);
    const [cv, g] = newCanvas(W, H);
    let y = cardHeader(g, W, P, quizData.title, "My closest matches");
    const faces = await topFaces(ms);
    ms.forEach((m, i) => {
      const [top, ...rest] = m.ranked, face = faces[i], room = W - 2 * P - (face ? 200 : 0);
      if (face) drawFace(g, face, W - P - 176, y - 16, 176);
      g.fillStyle = IMG.DIM; g.font = `700 22px ${IMG.FONT}`; g.fillText(m.label.toUpperCase(), P, y + 6, room);
      g.fillStyle = IMG.ACC; g.font = `800 ${face ? 52 : 62}px ${IMG.FONT}`; g.fillText(`${top.item.name}  ${pct(top.score)}`, P, y + 76, room);
      g.fillStyle = IMG.INK; g.font = `400 29px ${IMG.FONT}`;
      let ly = y + 128;
      wrap(top.item.blurb || "", face ? 46 : 62).slice(0, 4).forEach((t) => { g.fillText(t, P, ly, room); ly += 40; });
      if (rest.length) {
        g.fillStyle = IMG.DIM; g.font = `600 22px ${IMG.FONT}`;
        wrap("Also close: " + rest.slice(0, 3).map((x) => `${x.item.name} ${pct(x.score)}`).join(" · "), 84).slice(0, 2)
          .forEach((t, k) => g.fillText(t, P, Math.max(ly + 14, y + 250) + k * 30, W - 2 * P));
      }
      y += per;
    });
    cardFooter(g, W, H, P);
    return toBlob(cv);
  }
  // picture 2 of 2: where you stand on every section
  async function drawPositionsCard(quizData, res) {
    try { await document.fonts.ready; } catch { }
    const W = 1080, P = 60, rowH = tileRowH(quizData, 340);
    const H = Math.max(1080, 250 + tileRows(quizData) * rowH + 90);
    const [cv, g] = newCanvas(W, H);
    const y = cardHeader(g, W, P, quizData.title, "Where I stand");
    drawTiles(g, quizData, res, P, W, y + 14, rowH);
    cardFooter(g, W, H, P);
    return toBlob(cv);
  }

  const LAYOUTS = {
    long: { label: "Tall", note: "Everything in one long picture.", make: async (Q, res) => [{ blob: await makeImage(Q, res), name: "results" }] },
    square: { label: "Square", note: "Everything in one square picture.", make: async (Q, res) => [{ blob: await drawSquare(Q, res), name: "results-square" }] },
    two: {
      label: "Two pictures", note: "Who you match, and where you stand, as two square pictures.",
      make: async (Q, res) => [{ blob: await drawMatchesCard(Q, res), name: "results-1-matches", caption: "1 of 2: matches" }, { blob: await drawPositionsCard(Q, res), name: "results-2-positions", caption: "2 of 2: positions" }],
    },
  };

  // the "save as a picture" window: pick a shape, then download or press-and-hold to save
  function openPictureDialog(Q, res) {
    const dlg = document.createElement("dialog");
    dlg.className = "parch-dialog q-pic-dialog";
    dlg.innerHTML = `<form method="dialog"><h2>Save your results as a picture</h2>
      <div class="tabs q-layouts" role="tablist">${Object.entries(LAYOUTS).map(([k, l]) => `<button type="button" role="tab" data-layout="${k}" aria-selected="false">${esc(l.label)}</button>`).join("")}</div>
      <p class="small" id="q-pic-note"></p>
      <div class="q-pics" id="q-pics"></div>
      <p class="small">Press and hold (or right-click) a picture to save it, or use its button.</p>
      <div class="row dialog-row"><button class="btn ghost small-btn" value="close">Close</button></div></form>`;
    document.body.appendChild(dlg);
    let urls = [], token = 0;
    const show = async (key) => {
      const mine = ++token;
      dlg.querySelectorAll("[data-layout]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.layout === key)));
      $("#q-pic-note", dlg).textContent = LAYOUTS[key].note;
      const box = $("#q-pics", dlg);
      box.innerHTML = `<p class="note">Drawing…</p>`;
      let pics;
      try { pics = await LAYOUTS[key].make(Q, res); } catch { box.innerHTML = `<p class="note">The picture couldn't be made here.</p>`; return; }
      if (mine !== token) return;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = pics.map((p) => URL.createObjectURL(p.blob));
      box.innerHTML = pics.map((p, i) => `<figure><img class="q-pic" src="${urls[i]}" alt="Your quiz results${p.caption ? ", " + esc(p.caption) : ""}">
        ${p.caption ? `<figcaption class="small">${esc(p.caption)}</figcaption>` : ""}
        <a class="btn small-btn" href="${urls[i]}" download="${esc(Q.slug)}-${esc(p.name)}.png">Download${pics.length > 1 ? " " + (i + 1) : ""}</a></figure>`).join("");
    };
    dlg.querySelectorAll("[data-layout]").forEach((b) => b.addEventListener("click", () => {
      try { localStorage.setItem("atk-quiz-layout", b.dataset.layout); } catch { }
      show(b.dataset.layout);
    }));
    dlg.addEventListener("close", () => { token++; urls.forEach((u) => URL.revokeObjectURL(u)); dlg.remove(); });
    dlg.showModal();
    let first = "long";
    try { const s = localStorage.getItem("atk-quiz-layout"); if (LAYOUTS[s]) first = s; } catch { }
    show(first);
  }

  /* ───────── taking a quiz ───────── */
  let token = 0;   // a newer page load makes older ones stop
  let keyHandler = null;
  document.addEventListener("keydown", (e) => {
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) keyHandler(e);
  });

  async function play(slug, byUser) {
    const box = $("#quiz-box"), mine = ++token;
    keyHandler = null;
    box.innerHTML = `<p class="note">Loading…</p>`;
    let data, me;
    try {
      [data, me] = await Promise.all([L().api("quizzes/" + encodeURIComponent(slug)), L().loadMe()]);
    } catch (e) {
      if (mine !== token) return;
      box.innerHTML = `<h1 class="missing-h">${e.status === 404 ? "That quiz doesn't exist" : "The quiz couldn't be loaded"}</h1><p class="center"><a class="text-link" href="quizzes" data-link>All quizzes</a></p>`;
      setTitle("Quiz not found", "");
      return;
    }
    if (mine !== token) return;
    const Q = data.quiz, N = QuizCore.questionCount(Q);
    setTitle(Q.title, Q.summary || Q.intro);
    const flat = Q.sections.flatMap((sec, si) => sec.questions.map((q, qi) => ({ si, qi, q })));
    const link = (digits) => `${SITE}/quiz/${Q.slug}#r${digits}`;
    let answers = new Array(N).fill(0), idx = 0;
    const user = me.user;

    /* a result somebody else shared, or a link to a result */
    if (byUser) {
      try {
        const d = await L().api(`quizzes/${encodeURIComponent(slug)}/shared/${encodeURIComponent(byUser)}`);
        const a = QuizCore.parseAnswers(Q, d.answers);
        if (mine !== token) return;
        if (!a) throw new Error("That result doesn't fit this quiz any more.");
        return showResults(a, { who: d.username });
      } catch (e) {
        if (mine !== token) return;
        box.innerHTML = `<h1 class="missing-h">${e.status === 404 ? "That result isn't shared" : "The result couldn't be loaded"}</h1><p class="center"><a class="text-link" href="quiz/${esc(slug)}" data-link>Take the quiz yourself</a></p>`;
        return;
      }
    }
    const hash = location.hash.replace(/^#r/, "");
    const fromLink = /^[0-9]+$/.test(location.hash.slice(2)) && location.hash[1] === "r" ? QuizCore.parseAnswers(Q, hash) : null;
    if (fromLink) {
      // the sender's own browser still has these answers (they just came back from signing in): theirs; otherwise somebody's
      const own = (store.get(slug) || {}).a;
      return showResults(fromLink, own && own.join("") === fromLink.join("") ? { own: true } : { link: true });
    }

    /* intro */
    const saved = store.get(slug);
    const resumable = saved && Array.isArray(saved.a) && saved.a.length === N && !saved.done && saved.a.some((x) => x);
    let theirs = null;
    if (user) { try { theirs = (await L().api(`quizzes/${encodeURIComponent(slug)}/mine`)).result; } catch { } }
    if (mine !== token) return;
    box.innerHTML = `
      <p class="eyebrow">${esc(Q.eyebrow || "Quiz")}</p>
      <h1 class="page-h">${esc(Q.title)}</h1>
      ${Q.intro ? `<p class="lead q-intro">${esc(Q.intro)}</p>` : ""}
      <ul class="q-sections">${Q.sections.map((s) => `<li><span>${esc(s.title)}</span><small>${s.questions.length} questions</small></li>`).join("")}</ul>
      <div class="row-center q-row">
        <button class="btn" type="button" id="q-start">Begin the quiz</button>
        ${resumable ? `<button class="btn ghost" type="button" id="q-resume">Resume where I left off</button>` : ""}
        ${theirs && QuizCore.parseAnswers(Q, theirs.answers) ? `<button class="btn ghost" type="button" id="q-saved">See my saved result</button>` : ""}
      </div>
      ${user ? "" : `<p class="small center q-hint">Sign in to store your results and share them on the site! No email or personal data requested.</p>`}`;
    $("#q-start").onclick = () => { answers = new Array(N).fill(0); idx = 0; ask(); };
    if (resumable) $("#q-resume").onclick = () => { answers = saved.a.slice(); idx = Math.min(saved.i || 0, N - 1); ask(); };
    if ($("#q-saved")) $("#q-saved").onclick = () => showResults(QuizCore.parseAnswers(Q, theirs.answers), { own: true, saved: theirs });

    /* the questions */
    function ask() {
      history.replaceState(null, "", location.pathname + location.search);
      let advancing = false;
      const { si, q } = flat[idx], sec = Q.sections[si];
      const startOf = (k) => Q.sections.slice(0, k).reduce((s, x) => s + x.questions.length, 0);
      box.innerHTML = `
        <div class="q-progress">${Q.sections.map((s, k) => `<div><i style="width:${Math.max(0, Math.min(1, (idx - startOf(k)) / s.questions.length)) * 100}%"></i></div>`).join("")}</div>
        <div class="q-meta"><span>${esc(sec.title)}</span><span>Question ${idx + 1} of ${N}</span></div>
        <h2 class="q-text">${esc(q.text)}</h2>
        <div class="q-opts">${q.options.map((o, i) => `<button class="q-opt${answers[idx] === i + 1 ? " sel" : ""}${o.idk ? " idk" : ""}" type="button" data-i="${i + 1}"><b>${i + 1}</b><span>${esc(o.text)}</span></button>`).join("")}</div>
        <div class="q-nav"><button class="link-btn" type="button" id="q-back"${idx === 0 ? " disabled" : ""}>← Previous</button><button class="link-btn" type="button" id="q-skip">${idx === N - 1 ? "See results →" : "Skip →"}</button></div>`;
      const choose = (v) => {
        if (advancing || v < 1 || v > q.options.length) return;
        advancing = true; answers[idx] = v;
        box.querySelectorAll(".q-opt").forEach((b) => b.classList.toggle("sel", +b.dataset.i === v));
        const at = idx;
        setTimeout(() => { if (idx === at && mine === token) next(); }, 170);
      };
      const next = () => { if (idx < N - 1) { idx++; store.set(slug, { a: answers, i: idx }); ask(); } else finish(); };
      box.querySelectorAll(".q-opt").forEach((b) => b.addEventListener("click", () => choose(+b.dataset.i)));
      $("#q-back").onclick = () => { if (idx > 0 && !advancing) { idx--; ask(); } };
      $("#q-skip").onclick = () => { if (!advancing) next(); };
      keyHandler = (e) => {
        if (/^[1-9]$/.test(e.key)) choose(+e.key);
        else if (e.key === "ArrowLeft" && idx > 0 && !advancing) { idx--; ask(); }
      };
    }
    function finish() {
      keyHandler = null;
      if (!answers.some((a) => a)) { say("Answer at least one question to see results"); idx = 0; ask(); return; }
      store.set(slug, { a: answers, i: N - 1, done: true });
      showResults(answers, { own: true });
    }

    /* the results */
    async function showResults(a, mode) {
      keyHandler = null;
      const digits = a.join(""), res = QuizCore.score(Q, a);
      history.replaceState(null, "", mode.who ? location.pathname : `${location.pathname}#r${digits}`);
      const heading = mode.who ? `Where ${esc(mode.who)} Stands` : mode.own ? "Where You Stand" : "Where They Stand";
      box.innerHTML = `
        <p class="eyebrow">${esc(Q.title)}</p>
        <h1 class="page-h">${heading}</h1>
        <p class="center small">Based on ${a.filter(Boolean).length} of ${N} questions answered.</p>
        ${mode.who ? `<p class="center small">Shared by <a class="text-link" href="people/${encodeURIComponent(mode.who)}" data-link>${esc(mode.who)}</a>.</p>` : ""}
        <div id="q-save"></div>
        <div class="q-results">${resultsHTML(Q, res)}</div>
        <p class="small center">Each polygon places a person between its corners and each spectrum between two ends; the closer the mark sits to one, the more consistently they answered that way. A percentage next to a sect or figure says how often its usual answers match the answers given: the same answer counts in full, and a neighbouring answer counts half.</p>
        <div class="q-share">
          <h2>Share these results</h2>
          <div class="row-center q-row">
            <button class="chip" type="button" id="q-img">Save image</button>
            <button class="chip" type="button" id="q-copyimg">Copy image</button>
            <button class="chip" type="button" id="q-copytext">Copy as text</button>
            <a class="chip" id="q-x" target="_blank" rel="noopener">Post on X</a>
            <a class="chip" id="q-reddit" target="_blank" rel="noopener">Reddit</a>
            <a class="chip" id="q-fb" target="_blank" rel="noopener">Facebook</a>
          </div>
        </div>
        <p class="center">${mode.own ? `<button class="link-btn" type="button" id="q-retake">↺ Retake the quiz</button>` : `<a class="btn" href="quiz/${esc(slug)}" data-link>Take the quiz yourself</a>`}</p>`;
      window.scrollTo(0, 0);

      const text = `${mode.who ? mode.who + "'s" : "My"} results on ${Q.title}:\n` +
        Q.sections.map((s, i) => `• ${s.short || s.title}: ${res.sections[i].verdict}`).join("\n") +
        res.matches.filter((m) => m.ranked.length).map((m) => `\n• ${m.label}: ${m.ranked[0].item.name} (${pct(m.ranked[0].score)})`).join("");
      const url = link(digits);
      $("#q-x").href = "https://x.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url);
      $("#q-reddit").href = "https://www.reddit.com/submit?title=" + encodeURIComponent(`${Q.title}: ${res.sections.map((r) => r.verdict).join(" · ")}`) + "&url=" + encodeURIComponent(url);
      $("#q-fb").href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);
      $("#q-copytext").onclick = async () => {
        try { await navigator.clipboard.writeText(text + "\n" + url); say("Results copied"); }
        catch { say("Copy didn't work here. Select the text manually."); }
      };
      $("#q-img").onclick = () => openPictureDialog(Q, res);
      $("#q-copyimg").onclick = () => {
        try {
          navigator.clipboard.write([new ClipboardItem({ "image/png": drawSquare(Q, res) })])
            .then(() => say("Image copied. Paste it into a post."), () => say("Copying images isn't supported here. Use Save image."));
        } catch { say("Copying images isn't supported here. Use Save image."); }
      };
      if (mode.own) $("#q-retake").onclick = () => { store.clear(slug); answers = new Array(N).fill(0); idx = 0; ask(); };
      if (mode.own) saveBox(digits, mode.saved);
      else if (mode.link) $("#q-save").innerHTML = "";
    }

    /* keeping a result: saved to an account (and shown on its profile, if they choose) */
    async function saveBox(digits, already) {
      const el = $("#q-save"), api = L().api;
      if (!user) {
        const next = encodeURIComponent(`/quiz/${Q.slug}#r${digits}`);
        el.innerHTML = `<div class="q-keep"><p><b>Sign in to store your results and share them on the site!</b> No email or personal data requested.</p>
          <p class="center"><a class="btn" href="login?next=${next}" data-link>Sign in or create an account</a></p></div>`;
        return;
      }
      el.innerHTML = `<div class="q-keep"><p class="small" id="q-state">Saving to your account…</p></div>`;
      try {
        // coming back to look at a saved result doesn't save it again
        const r = already && already.answers === digits ? already : (await api(`quizzes/${encodeURIComponent(slug)}/result`, { answers: digits })).result;
        if (mine !== token) return;
        el.innerHTML = `<div class="q-keep"><p class="form-note ok">Saved to your account.</p>
          <label class="check"><input type="checkbox" id="q-shared"${r.shared ? " checked" : ""}> Show this result on my profile</label>
          <p class="small" id="q-share-note"></p>
          <button class="link-btn danger-link" type="button" id="q-forget">Delete my saved result</button></div>`;
        const note = () => { $("#q-share-note").innerHTML = $("#q-shared").checked ? `Anyone can see this result on <a class="text-link" href="people/${encodeURIComponent(user.username)}" data-link>your profile</a>.` : "Only you can see it."; };
        note();
        $("#q-shared").onchange = async (e) => {
          try { await api(`quizzes/${encodeURIComponent(slug)}/share`, { shared: e.target.checked }); note(); }
          catch (err) { e.target.checked = !e.target.checked; say(err.message); }
        };
        $("#q-forget").onclick = async () => {
          try { await api(`quizzes/${encodeURIComponent(slug)}/forget`, {}); el.innerHTML = `<div class="q-keep"><p class="small">Deleted from your account.</p></div>`; }
          catch (err) { say(err.message); }
        };
      } catch (err) {
        el.innerHTML = `<div class="q-keep"><p class="form-note err">${esc(err.message)}</p><button class="btn ghost small-btn" type="button" id="q-retry">Try saving again</button></div>`;
        $("#q-retry").onclick = () => saveBox(digits);
      }
    }
  }

  window.quiz = { list, play, site: { setTitle() { } } };
})();
