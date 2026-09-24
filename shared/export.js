/* Downloading an article to read offline or open in a word processor. Shared by both sites
   (article pages, community articles, and both editors).

     ATKExport.download(article, "docx")   a Word document (Word, Google Docs, LibreOffice, Pages)
     ATKExport.download(article, "html")   a single web page that works offline, pictures included

   article = { title, subtitle, author, date, url, html }, where html is the article body as the
   sites store it (Quill's HTML). The fonts, sizes and quote styles match story-content.css. */
(() => {
  "use strict";
  if (window.ATKExport) return;
  const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  const x = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");   // characters XML can't hold
  const h = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fileName = (title, ext) => (String(title || "article").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "article") + "." + ext;
  const niceDate = (d) => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); };
  const byline = (a) => [a.author ? `By ${a.author}` : "", niceDate(a.date)].filter(Boolean).join(" · ");

  function save(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }
  let zipLoad = null;
  const loadZip = () => (window.JSZip ? Promise.resolve() : (zipLoad ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = JSZIP; s.onload = res; s.onerror = () => { zipLoad = null; rej(new Error("Couldn't load what's needed to make a Word file. Check your connection.")); };
    document.head.appendChild(s);
  })));

  // the article's body as a document to walk through
  // Interactives (shared/embeds.js): the offline web page keeps them working in a sealed-off
  // frame; a Word file can't run one, so it gets a line saying where to find it.
  function parse(html, { live = false, url = "" } = {}) {
    const body = new DOMParser().parseFromString(`<body>${String(html || "")}</body>`, "text/html").body;
    const d = body.ownerDocument;
    body.querySelectorAll("div.atk-embed").forEach((node) => {
      const title = node.getAttribute("data-title") || "Interactive";
      let doc = "";
      try { doc = new TextDecoder().decode(Uint8Array.from(atob(node.getAttribute("data-doc") || ""), (c) => c.charCodeAt(0))); } catch { }
      if (live && doc) {
        const f = d.createElement("iframe");
        f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox");
        f.setAttribute("allowfullscreen", "");
        f.setAttribute("title", title);
        f.setAttribute("srcdoc", doc);
        f.setAttribute("style", `width:100%;height:${Math.min(1200, Math.max(280, +node.getAttribute("data-height") || 600))}px;border:1px solid #ccc;border-radius:8px`);
        node.replaceWith(f);
        return;
      }
      const p = d.createElement("p");
      const em = d.createElement("em");
      em.textContent = `[Interactive: ${title}.${url ? " Explore it in the online article: " : " Open the online article to explore it."}]`;
      p.append(em);
      if (url) { const a = d.createElement("a"); a.href = url; a.textContent = url.replace(/^https?:\/\//, ""); p.append(a); }
      node.replaceWith(p);
    });
    return body;
  }

  // every picture, fetched once: { bytes, ext, width, height, dataUrl }. Word only takes PNG, JPEG
  // and GIF, so anything else is redrawn as PNG. A picture that can't be fetched is left out.
  async function fetchImages(body) {
    const out = new Map();
    for (const img of body.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (out.has(src)) continue;
      try {
        const res = await fetch(new URL(src, document.baseURI));
        if (!res.ok) throw new Error();
        let blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        let ext = { "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif" }[blob.type];
        if (!ext) {
          const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
          c.getContext("2d").drawImage(bmp, 0, 0);
          blob = await new Promise((r) => c.toBlob(r, "image/png"));
          ext = "png";
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        out.set(src, { bytes, ext, width: bmp.width, height: bmp.height, dataUrl });
      } catch { out.set(src, null); }
    }
    return out;
  }

  /* ═════════ a web page ═════════ */
  const PAGE_CSS = `
body { margin: 0; background: #faf6ea; color: #1f160a; }
article { max-width: 720px; margin: 0 auto; padding: 48px 24px 72px; font: 19px/1.7 Calibri, Carlito, "Segoe UI", system-ui, sans-serif; }
h1.title { margin: 0; font: 800 36px/1.2 Georgia, "Times New Roman", serif; }
p.subtitle { margin: 6px 0 0; font-size: 21px; color: #3b2c14; }
p.byline { margin: 10px 0 28px; padding-bottom: 18px; border-bottom: 1px solid #d8c9a3; font-size: 14px; color: #6e5628; }
p.byline a { color: inherit; }
.body p, .body ol, .body ul, .body blockquote { margin: 0 0 1em; }
.body h1, .body h2, .body h3 { margin: 1.4em 0 .5em; line-height: 1.25; }
.body h1 { font-size: 1.9em; } .body h2 { font-size: 1.5em; } .body h3 { font-size: 1.2em; }
.body a { color: #7b2d12; }
.body img { max-width: 100%; height: auto; }
.body blockquote { border-left: 3px solid #7b2d12; padding-left: 1em; color: #4a3a1c; font-style: italic; }
.body blockquote.ql-quote-center { border-left: 0; padding: 1.1em 1.5em; text-align: center; border-top: 1px solid #d8c9a3; border-bottom: 1px solid #d8c9a3; color: #1f160a; }
.body blockquote.ql-quote-pull { border-left: 0; padding: 0 1.2em; text-align: center; font: 1.35em/1.45 Georgia, serif; color: #2a1c08; }
.body blockquote.ql-quote-indent { border-left: 0; padding: 0 2em; font-style: normal; color: #1f160a; }
.body hr { border: 0; text-align: center; height: 2em; margin: 1.2em 0; }
.body hr::before { content: "\\2726  \\2726  \\2726"; color: #6e5628; letter-spacing: .5em; font-size: 14px; }
.body pre, .body .ql-code-block-container { background: #efe6cf; border-radius: 6px; padding: 10px 14px; font: 15px/1.5 Consolas, "Courier New", monospace; white-space: pre-wrap; }
.body ol { padding-left: 1.5em; counter-reset: q0; }
.body li { list-style: none; position: relative; padding-left: 1.5em; }
.body li > .ql-ui { position: absolute; left: 0; }
.body li[data-list=bullet] > .ql-ui::before { content: "\\2022"; }
.body li[data-list=ordered] { counter-increment: q0; }
.body li[data-list=ordered] > .ql-ui::before { content: counter(q0) "."; }
.body li[data-list=checked] > .ql-ui::before { content: "\\2611"; }
.body li[data-list=unchecked] > .ql-ui::before { content: "\\2610"; }
${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `.body .ql-indent-${n} { padding-left: ${n * 3 + (n ? 1.5 : 0)}em; }`).join("\n")}
.ql-align-center { text-align: center; } .ql-align-right { text-align: right; } .ql-align-justify { text-align: justify; }
.ql-font-calibri-light { font-family: "Calibri Light", Calibri, Carlito, sans-serif; }
.ql-font-times { font-family: "Times New Roman", Tinos, serif; }
.ql-font-cambria { font-family: Cambria, Caladea, Georgia, serif; }
.ql-font-sans { font-family: "Segoe UI", system-ui, sans-serif; }
.ql-font-serif { font-family: Georgia, "Times New Roman", serif; }
.ql-font-palatino { font-family: "Palatino Linotype", Palatino, serif; }
.ql-font-garamond { font-family: Garamond, "EB Garamond", serif; }
.ql-font-monospace { font-family: "Courier New", monospace; }
.ql-font-cursive { font-family: "Segoe Script", "Brush Script MT", cursive; }
@media print { body { background: #fff; } article { padding-top: 0; } }`;

  async function asHtml(a) {
    const body = parse(a.html, { live: true });
    const images = await fetchImages(body);
    body.querySelectorAll("img[src]").forEach((img) => {
      const pic = images.get(img.getAttribute("src"));
      if (pic) img.setAttribute("src", pic.dataUrl); else img.remove();
    });
    body.querySelectorAll("script, style, iframe:not([srcdoc][sandbox])").forEach((el) => el.remove());
    const page = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(a.title || "Article")}</title><style>${PAGE_CSS}</style></head>
<body><article>
<h1 class="title">${h(a.title || "Untitled")}</h1>
${a.subtitle ? `<p class="subtitle">${h(a.subtitle)}</p>` : ""}
<p class="byline">${h(byline(a))}${a.url ? ` · <a href="${h(a.url)}">${h(a.url.replace(/^https?:\/\//, ""))}</a>` : ""}</p>
<div class="body">${body.innerHTML}</div>
</article></body></html>`;
    return new Blob([page], { type: "text/html;charset=utf-8" });
  }

  /* ═════════ a Word document ═════════ */
  const FONTS = {
    "calibri-light": "Calibri Light", times: "Times New Roman", cambria: "Cambria", serif: "Georgia", sans: "Segoe UI",
    palatino: "Palatino Linotype", garamond: "Garamond", monospace: "Courier New", cursive: "Segoe Script",
  };
  const QUOTE_STYLE = { center: "QuoteCentered", pull: "PullQuote", indent: "QuoteIndented" };
  function hexColor(v) {
    if (!v) return null;
    let m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return m[1].toUpperCase();
    m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
    m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase() : null;
  }
  const classValue = (el, prefix) => { for (const c of (el && el.classList) || []) if (c.startsWith(prefix)) return c.slice(prefix.length); return null; };

  function buildDocx(a, body, images) {
    const rels = [];                 // [id, type, target, external]
    const media = [];                // [name, bytes]
    const orderedLists = [];         // one numbering instance per numbered list, so each starts at 1
    let picN = 0;
    const rel = (type, target, external) => { const id = `rId${rels.length + 10}`; rels.push([id, type, target, external]); return id; };
    const HYPER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
    const IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

    // ── runs: the text of a paragraph, with its formatting ──
    function runProps(f) {
      let p = "";
      if (f.style) p += `<w:rStyle w:val="${f.style}"/>`;
      if (f.font) p += `<w:rFonts w:ascii="${x(f.font)}" w:hAnsi="${x(f.font)}" w:cs="${x(f.font)}"/>`;
      if (f.b) p += "<w:b/>";
      if (f.i) p += "<w:i/>";
      if (f.s) p += "<w:strike/>";
      if (f.color) p += `<w:color w:val="${f.color}"/>`;
      if (f.size) p += `<w:sz w:val="${f.size}"/><w:szCs w:val="${f.size}"/>`;
      if (f.u) p += `<w:u w:val="single"/>`;
      if (f.bg) p += `<w:shd w:val="clear" w:color="auto" w:fill="${f.bg}"/>`;
      if (f.va) p += `<w:vertAlign w:val="${f.va}"/>`;
      return p ? `<w:rPr>${p}</w:rPr>` : "";
    }
    const textRun = (t, f) => t.split("\t").map((part, i) =>
      (i ? `<w:r>${runProps(f)}<w:tab/></w:r>` : "") + (part ? `<w:r>${runProps(f)}<w:t xml:space="preserve">${x(part)}</w:t></w:r>` : "")).join("");
    function picture(src) {
      const pic = images.get(src);
      if (!pic) return "";
      const n = ++picN, name = `image${n}.${pic.ext}`;
      media.push([name, pic.bytes]);
      const id = rel(IMAGE, `media/${name}`);
      const maxW = 5486400, emu = 9525;   // 6 inches wide at most; 96 pixels to the inch
      let cx = pic.width * emu, cy = pic.height * emu;
      if (cx > maxW) { cy = Math.round(cy * maxW / cx); cx = maxW; }
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/>`
        + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
        + `<pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
        + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
        + `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    function runs(node, f) {
      let out = "";
      for (const n of node.childNodes) {
        if (n.nodeType === 3) { out += textRun(n.nodeValue.replace(/[\r\n]+/g, " "), f); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        if (n.classList.contains("ql-ui")) continue;            // list markers; Word draws its own
        if (tag === "br") { out += "<w:r><w:br/></w:r>"; continue; }
        if (tag === "img") { out += picture(n.getAttribute("src")); continue; }
        const g = { ...f };
        if (tag === "strong" || tag === "b") g.b = true;
        if (tag === "em" || tag === "i") g.i = true;
        if (tag === "u") g.u = true;
        if (tag === "s" || tag === "strike" || tag === "del") g.s = true;
        if (tag === "sub") g.va = "subscript";
        if (tag === "sup") g.va = "superscript";
        if (tag === "code") g.font = "Courier New";
        const font = classValue(n, "ql-font-");
        if (font && FONTS[font]) g.font = FONTS[font];
        const st = n.style || {};
        const px = parseFloat(st.fontSize);
        if (px) g.size = Math.round(px * 1.5);                   // pixels to half-points
        const color = hexColor(st.color); if (color) g.color = color;
        const bg = hexColor(st.backgroundColor); if (bg) g.bg = bg;
        if (tag === "a" && /^(https?:|mailto:)/i.test(n.getAttribute("href") || "")) {
          const id = rel(HYPER, n.getAttribute("href"), true);
          out += `<w:hyperlink r:id="${id}" w:history="1">${runs(n, { ...g, style: "Hyperlink" })}</w:hyperlink>`;
          continue;
        }
        out += runs(n, g);
      }
      return out;
    }

    // ── paragraphs ──
    function para(el, { style, numId, ilvl = 0, align, text, prefix = "" } = {}) {
      const jc = { center: "center", right: "right", justify: "both" }[align || classValue(el, "ql-align-")];
      const indent = numId ? 0 : Number(classValue(el, "ql-indent-")) || 0;
      let p = "";
      if (style) p += `<w:pStyle w:val="${style}"/>`;
      if (numId) p += `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;
      if (indent) p += `<w:ind w:left="${indent * 720}"/>`;
      if (jc) p += `<w:jc w:val="${jc}"/>`;
      // an empty line in the editor is a paragraph holding just <br>: that's an empty paragraph here, not two lines
      const emptyLine = el && el.childNodes.length === 1 && el.firstChild.nodeName === "BR";
      const content = (prefix ? textRun(prefix, {}) : "") + (text != null ? textRun(text, {}) : emptyLine ? "" : runs(el, {}));
      return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ""}${content}</w:p>`;
    }
    function blocks(root) {
      let out = "", currentList = null;
      for (const el of root.childNodes) {
        if (el.nodeType === 3) { if (el.nodeValue.trim()) out += `<w:p>${textRun(el.nodeValue, {})}</w:p>`; continue; }
        if (el.nodeType !== 1) continue;
        const tag = el.tagName.toLowerCase();
        if (tag !== "ol" && tag !== "ul") currentList = null;
        if (/^h[1-6]$/.test(tag)) out += para(el, { style: `Heading${Math.min(3, Number(tag[1]))}` });
        else if (tag === "blockquote") out += para(el, { style: QUOTE_STYLE[classValue(el, "ql-quote-")] || "Quote" });
        else if (tag === "hr") out += para(el, { style: "SceneBreak", text: "✦   ✦   ✦" });
        else if (tag === "ol" || tag === "ul") {
          for (const li of el.children) {
            const kind = li.getAttribute("data-list") || (tag === "ul" ? "bullet" : "ordered");
            const ilvl = Math.min(8, Number(classValue(li, "ql-indent-")) || 0);
            if (kind === "checked" || kind === "unchecked") { out += para(li, { style: "ListCheck", prefix: kind === "checked" ? "☑ " : "☐ " }); continue; }
            let numId = 1;                                    // bullets share one list
            if (kind === "ordered") {
              if (!currentList) { orderedLists.push(orderedLists.length + 2); currentList = orderedLists[orderedLists.length - 1]; }
              numId = currentList;
            }
            out += para(li, { numId, ilvl });
          }
        } else if (tag === "pre" || el.classList.contains("ql-code-block-container")) {
          const lines = el.classList.contains("ql-code-block-container") ? [...el.children].map((c) => c.textContent) : el.textContent.split("\n");
          for (const line of lines) out += para(el, { style: "Code", text: line });
        } else if (tag === "div" && el.children.length && [...el.children].some((c) => /^(p|h\d|ol|ul|blockquote|div|pre)$/i.test(c.tagName))) out += blocks(el);
        else out += para(el);
      }
      return out;
    }

    const head = para(null, { style: "Title", text: a.title || "Untitled" })
      + (a.subtitle ? para(null, { style: "Subtitle", text: a.subtitle }) : "")
      + (byline(a) || a.url ? `<w:p><w:pPr><w:pStyle w:val="Byline"/></w:pPr>${textRun(byline(a), {})}${a.url ? `${byline(a) ? textRun(" · ", {}) : ""}<w:hyperlink r:id="${rel(HYPER, a.url, true)}" w:history="1">${textRun(a.url.replace(/^https?:\/\//, ""), { style: "Hyperlink" })}</w:hyperlink>` : ""}</w:p>` : "");
    const main = blocks(body);

    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const document_ = `${XML}<w:document ${NS}><w:body>${head}${main}`
      + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

    const lvl = (i, fmt, textFor, indent = 720) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${textFor}"/><w:lvlJc w:val="left"/>`
      + `<w:pPr><w:ind w:left="${indent * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    const BULLETS = ["•", "◦", "▪"], NUMBERS = ["decimal", "lowerLetter", "lowerRoman"];
    const numbering = `${XML}<w:numbering ${NS}>`
      + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, "bullet", BULLETS[i % 3])).join("")}</w:abstractNum>`
      + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[...Array(9)].map((_, i) => lvl(i, NUMBERS[i % 3], `%${i + 1}.`)).join("")}</w:abstractNum>`
      + `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`
      + orderedLists.map((id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/>${[...Array(9)].map((_, i) => `<w:lvlOverride w:ilvl="${i}"><w:startOverride w:val="1"/></w:lvlOverride>`).join("")}</w:num>`).join("")
      + `</w:numbering>`;

    const pStyle = (id, name, pPr, rPr, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`;
    const line = (side) => `<w:${side} w:val="single" w:sz="6" w:space="8" w:color="BFB08A"/>`;
    const styles = `${XML}<w:styles ${NS}>`
      + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>`
      + `<w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
      + `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>`
      + pStyle("Title", "Title", `<w:spacing w:after="80"/>`, `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/>`)
      + pStyle("Subtitle", "Subtitle", `<w:spacing w:after="80"/>`, `<w:color w:val="4A3A1C"/><w:sz w:val="30"/><w:szCs w:val="30"/>`)
      + pStyle("Byline", "Byline", `<w:pBdr>${line("bottom")}</w:pBdr><w:spacing w:after="360"/>`, `<w:color w:val="6E5628"/><w:sz w:val="20"/><w:szCs w:val="20"/>`)
      + [1, 2, 3].map((n) => pStyle(`Heading${n}`, `heading ${n}`, `<w:keepNext/><w:spacing w:before="${420 - n * 60}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/>`,
        `<w:b/><w:sz w:val="${[0, 38, 32, 27][n]}"/><w:szCs w:val="${[0, 38, 32, 27][n]}"/>`)).join("")
      + pStyle("Quote", "Quote", `<w:pBdr><w:left w:val="single" w:sz="18" w:space="12" w:color="7B2D12"/></w:pBdr><w:ind w:left="360"/>`, `<w:i/><w:color w:val="4A3A1C"/>`)
      + pStyle("QuoteCentered", "Quote Centered", `<w:pBdr>${line("top")}${line("bottom")}</w:pBdr><w:spacing w:before="240" w:after="240"/><w:ind w:left="720" w:right="720"/><w:jc w:val="center"/>`, `<w:i/>`)
      + pStyle("PullQuote", "Pull Quote", `<w:spacing w:before="240" w:after="240"/><w:ind w:left="720" w:right="720"/><w:jc w:val="center"/>`, `<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:i/><w:color w:val="2A1C08"/><w:sz w:val="32"/><w:szCs w:val="32"/>`)
      + pStyle("QuoteIndented", "Quote Indented", `<w:ind w:left="720" w:right="720"/>`, "")
      + pStyle("SceneBreak", "Scene Break", `<w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/>`, `<w:color w:val="6E5628"/>`)
      + pStyle("Code", "Code", `<w:shd w:val="clear" w:color="auto" w:fill="EFE6CF"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>`, `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/><w:szCs w:val="20"/>`)
      + pStyle("ListCheck", "List Check", `<w:ind w:left="360"/>`, "")
      + `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="7B2D12"/><w:u w:val="single"/></w:rPr></w:style>`
      + `</w:styles>`;

    const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`
      + rels.map(([id, type, target, external]) => `<Relationship Id="${id}" Type="${type}" Target="${x(target)}"${external ? ' TargetMode="External"' : ""}/>`).join("")
      + `</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" `
      + `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(a.title || "")}</dc:title><dc:creator>${x(a.author || "")}</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>According To Knowledge</Application></Properties>`;
    const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + `<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>`
      + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
      + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
      + `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
      + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
      + `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
      + `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

    const zip = new JSZip();
    zip.file("[Content_Types].xml", types);
    zip.file("_rels/.rels", rootRels);
    zip.file("docProps/core.xml", core);
    zip.file("docProps/app.xml", app);
    zip.file("word/document.xml", document_);
    zip.file("word/styles.xml", styles);
    zip.file("word/numbering.xml", numbering);
    zip.file("word/_rels/document.xml.rels", docRels);
    for (const [name, bytes] of media) zip.file(`word/media/${name}`, bytes);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  async function asDocx(a) {
    await loadZip();
    const body = parse(a.html, { url: a.url });
    const images = await fetchImages(body);
    return buildDocx(a, body, images);
  }

  async function download(article, format = "docx") {
    const blob = format === "html" ? await asHtml(article) : await asDocx(article);
    save(blob, fileName(article.title, format === "html" ? "html" : "docx"));
  }

  window.ATKExport = { download, asHtml, asDocx };
})();
