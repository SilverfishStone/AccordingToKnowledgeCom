/* The writing editor, shared by silverfishstone.com/write and accordingtoknowledge.com/write.
   Needs Quill 2 (quill.js and quill.snow.css) on the page first; shared/editor.css labels its
   menus, and story-content.css styles the text the same way the sites show it.

     const ed = ATKEditor.create({
       editor: "#editor",          // where the text goes
       toolbar: "#toolbar",        // an empty element; the buttons are put in it
       preset: "full",             // "full" (everything) or "community" (no fonts, sizes, colours or images)
       placeholder: "Start writing…",
       toast: (message, kind) => {},   // how to tell the writer something ("err" for problems)
     });
     ed.quill                      // the Quill editor itself
     ed.words()  ed.hasBody()  ed.html()  ed.forgetSelection()

   The full preset can also place interactives: a standalone .html file (a map, a chart…)
   uploaded like a picture. In the text each one is
   <div class="atk-embed" data-doc="(the file, base64)" data-height="600" data-title="…">; the
   sites turn that into the live page with shared/embeds.js.

   The fonts, sizes and quote styles below must match story-content.css. */
(() => {
  "use strict";
  if (!window.Quill) return;

  const FONTS = [
    ["", "Calibri"], ["calibri-light", "Calibri Light"], ["times", "Times New Roman"], ["cambria", "Cambria"],
    ["serif", "Georgia"], ["sans", "Sans"], ["palatino", "Palatino"], ["garamond", "Garamond"],
    ["monospace", "Typewriter"], ["cursive", "Script"],
  ];
  const SIZES = ["12", "14", "16", "18", "20", "22", "24", "28", "36", "48", "64"];
  const QUOTES = [["", "Side bar"], ["center", "Centered"], ["pull", "Pull quote"], ["indent", "Indented"]];

  // formats are registered once per page, however many editors it has
  let registered = false;
  function register() {
    if (registered) return;
    registered = true;
    const Font = Quill.import("formats/font");
    Font.whitelist = FONTS.map(([v]) => v).filter(Boolean);   // no font class = Calibri, the reading font
    Quill.register(Font, true);
    const Size = Quill.import("attributors/style/size");
    Size.whitelist = SIZES.map((s) => s + "px");
    Quill.register(Size, true);
    const BlockEmbed = Quill.import("blots/block/embed");
    class Divider extends BlockEmbed {}
    Divider.blotName = "divider"; Divider.tagName = "hr";
    Quill.register(Divider);
    // an interactive: stored as a marker, shown as a labelled box while writing
    class Interactive extends BlockEmbed {
      static create(value) {
        const node = super.create();
        const v = cleanEmbed(value) || { doc: "", height: 600, title: "Interactive" };
        node.setAttribute("contenteditable", "false");
        node.setAttribute("data-doc", v.doc);
        node.setAttribute("data-height", String(v.height));
        node.setAttribute("data-title", v.title);
        return node;
      }
      static value(node) {
        return { doc: node.getAttribute("data-doc") || "", height: +node.getAttribute("data-height") || 600, title: node.getAttribute("data-title") || "" };
      }
    }
    Interactive.blotName = "interactive"; Interactive.tagName = "DIV"; Interactive.className = "atk-embed";
    Quill.register(Interactive);
    // quote styles: a class on a quote line (no class = the usual quote with a bar down the left)
    const Parchment = Quill.import("parchment");
    Quill.register(new Parchment.ClassAttributor("quote", "ql-quote", {
      scope: Parchment.Scope.BLOCK, whitelist: QUOTES.map(([v]) => v).filter(Boolean),
    }), true);
  }

  const ICON_UNDO = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="6 10 4 12 2 10 6 10"/><path class="ql-stroke" d="M8.09,13.91A4.6,4.6,0,0,0,9,14,5,5,0,1,0,4,9"/></svg>';
  const ICON_REDO = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="12 10 14 12 16 10 12 10"/><path class="ql-stroke" d="M9.91,13.91A4.6,4.6,0,0,1,9,14a5,5,0,1,1,5-5"/></svg>';
  const ICON_BREAK = '<svg viewBox="0 0 18 18"><line class="ql-stroke" x1="3" x2="15" y1="9" y2="9"/><line class="ql-stroke" x1="3" x2="5" y1="4" y2="4"/><line class="ql-stroke" x1="13" x2="15" y1="14" y2="14"/></svg>';
  const ICON_EMBED = '<svg viewBox="0 0 18 18"><rect class="ql-stroke" x="2.5" y="3.5" width="13" height="11" rx="1.5"/><circle class="ql-stroke" cx="7" cy="9.5" r="2.4"/><circle class="ql-stroke" cx="11.4" cy="8" r="1.6"/></svg>';
  const opt = (value, label, selected) => `<option${value ? ` value="${value}"` : ""}${selected ? " selected" : ""}>${label}</option>`;

  function toolbarHTML(preset) {
    const full = preset !== "community";
    return `
      <span class="ql-formats">
        <button type="button" class="ql-undo" title="Undo (Ctrl+Z)">${ICON_UNDO}</button>
        <button type="button" class="ql-redo" title="Redo (Ctrl+Y)">${ICON_REDO}</button>
      </span>
      <span class="ql-formats">
        <select class="ql-header" title="Paragraph style">
          ${full ? opt("1", "Heading 1") : ""}${opt("2", "Heading 2")}${opt("3", "Heading 3")}${opt("", "Paragraph", true)}
        </select>
        ${full ? `<select class="ql-font" title="Font">${FONTS.map(([v, l]) => opt(v, l, !v)).join("")}</select>
        <select class="ql-size" title="Font size">${opt("", "19", true)}${SIZES.map((s) => opt(s + "px", s)).join("")}</select>` : ""}
      </span>
      <span class="ql-formats">
        <button type="button" class="ql-bold" title="Bold (Ctrl+B)"></button>
        <button type="button" class="ql-italic" title="Italic (Ctrl+I)"></button>
        <button type="button" class="ql-underline" title="Underline (Ctrl+U)"></button>
        <button type="button" class="ql-strike" title="Strikethrough"></button>
        ${full ? `<button type="button" class="ql-script" value="sub" title="Subscript"></button>
        <button type="button" class="ql-script" value="super" title="Superscript"></button>` : ""}
      </span>
      ${full ? `<span class="ql-formats">
        <select class="ql-color" title="Text color"></select>
        <select class="ql-background" title="Highlight color"></select>
        <label class="custom-color" title="Any text color"><span>A</span><input type="color" data-color="color" value="#8ab4ff" /></label>
        <label class="custom-color hl" title="Any highlight color"><span>▮</span><input type="color" data-color="background" value="#5b4b00" /></label>
      </span>` : ""}
      <span class="ql-formats">
        <button type="button" class="ql-align" value="" title="Align left"></button>
        <button type="button" class="ql-align" value="center" title="Center (Ctrl+E)"></button>
        <button type="button" class="ql-align" value="right" title="Align right"></button>
        ${full ? `<button type="button" class="ql-align" value="justify" title="Justify"></button>` : ""}
        <button type="button" class="ql-list" value="ordered" title="Numbered list"></button>
        <button type="button" class="ql-list" value="bullet" title="Bulleted list"></button>
        ${full ? `<button type="button" class="ql-list" value="check" title="Checklist"></button>` : ""}
        <button type="button" class="ql-indent" value="-1" title="Decrease indent"></button>
        <button type="button" class="ql-indent" value="+1" title="Increase indent"></button>
      </span>
      <span class="ql-formats">
        <button type="button" class="ql-blockquote" title="Quote"></button>
        <select class="ql-quote" title="Quote style">${QUOTES.map(([v, l]) => opt(v, l, !v)).join("")}</select>
        ${full ? `<button type="button" class="ql-code-block" title="Code block"></button>` : ""}
        <button type="button" class="ql-link" title="Link (Ctrl+K)"></button>
        ${full ? `<button type="button" class="ql-image" title="Image from a web address"></button>
        <button type="button" class="ql-interactive" title="Interactive: upload an .html file (a map or chart readers can explore)">${ICON_EMBED}</button>` : ""}
        <button type="button" class="ql-divider" title="Scene break">${ICON_BREAK}</button>
        <button type="button" class="ql-clean" title="Clear formatting"></button>
      </span>`;
  }

  // what each preset allows in the text, so pasted text can't bring in anything the toolbar can't make
  const COMMUNITY_FORMATS = ["header", "bold", "italic", "underline", "strike", "align", "list", "indent", "blockquote", "quote", "link", "divider"];

  /* ───────── interactives ───────── */
  // An interactive is a whole .html page (a map, a chart…) uploaded from the computer and kept
  // inside the article itself, like a picture, as base64 so it passes through the sanitiser
  // untouched. shared/embeds.js shows it to readers in a sealed-off frame.
  const MAX_EMBED = 500000;   // characters of HTML (a whole article must stay under the site's size limit)
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
  function toB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function cleanEmbed(v) {
    if (!v || !B64.test(String(v.doc || "")) || v.doc.length > MAX_EMBED * 1.4) return null;
    return { doc: String(v.doc), height: Math.min(1200, Math.max(280, Math.round(+v.height) || 600)), title: String(v.title || "Interactive").slice(0, 140) };
  }
  const escHTML = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // asks for an .html file; resolves to { doc, title } or null
  function chooseFile(toast) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".html,.htm,text/html";
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) { resolve(null); return; }
        if (!/\.html?$/i.test(file.name)) { toast("Choose an .html file.", "err"); resolve(null); return; }
        const text = await file.text();
        if (text.length > MAX_EMBED) { toast(`That file is too big (the limit is ${Math.round(MAX_EMBED / 1e6 * 10) / 10} MB).`, "err"); resolve(null); return; }
        const named = (new DOMParser().parseFromString(text, "text/html").title || "").trim();
        resolve({ doc: toB64(text), title: named || file.name.replace(/\.html?$/i, "") });
      }, { once: true });
      input.addEventListener("cancel", () => resolve(null), { once: true });
      input.click();
    });
  }

  // the settings of one interactive: resolves to the new value, "remove", or null (no change)
  async function editInteractive(current, toast) {
    const dlg = document.createElement("dialog");
    dlg.className = "atk-embed-dialog";
    dlg.innerHTML = `
      <form method="dialog">
        <h2>Interactive</h2>
        <label>Caption<input name="title" maxlength="140" /></label>
        <label>Height on the page<span><input name="height" type="number" min="280" max="1200" step="20" /> pixels</span></label>
        <p class="atk-embed-note">Readers can use it right in the article, or open it full screen.</p>
        <div class="atk-embed-actions">
          <button value="remove" type="submit" class="left">Remove</button>
          <button value="replace" type="submit">Replace file…</button>
          <button value="cancel" type="submit">Cancel</button>
          <button value="ok" type="submit" class="primary">Save</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const f = dlg.querySelector("form");
    f.title.value = current.title;
    f.height.value = current.height;
    const answer = await new Promise((resolve) => {
      const ac = new AbortController();
      const finish = (v) => { ac.abort(); if (dlg.open) dlg.close(); resolve(v); };
      dlg.querySelectorAll("button[value]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); finish(b.value); }, { signal: ac.signal }));
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish("cancel"); }, { signal: ac.signal });   // Esc
      dlg.showModal();
    });
    const edited = { ...current, title: f.title.value.trim() || current.title, height: f.height.value };
    dlg.remove();
    if (answer === "remove") return "remove";
    if (answer === "replace") {
      const file = await chooseFile(toast);
      return file ? cleanEmbed({ ...edited, doc: file.doc }) : null;
    }
    return answer === "ok" ? cleanEmbed(edited) : null;
  }

  function create({ editor, toolbar, preset = "full", placeholder = "Start writing…", toast = () => {} }) {
    register();
    const toolbarEl = typeof toolbar === "string" ? document.querySelector(toolbar) : toolbar;
    toolbarEl.innerHTML = toolbarHTML(preset);

    let quill;   // assigned just below; handlers only run after that
    quill = new Quill(editor, {
      theme: "snow",
      placeholder,
      ...(preset === "community" ? { formats: COMMUNITY_FORMATS } : {}),
      modules: {
        toolbar: {
          container: toolbarEl,
          handlers: {
            undo() { quill.history.undo(); },
            redo() { quill.history.redo(); },
            // turning a quote off also drops its style, so the style doesn't linger on a plain paragraph
            blockquote(on) {
              const r = quill.getSelection(true);
              quill.formatLine(r.index, r.length, on ? { blockquote: true } : { blockquote: false, quote: false }, "user");
            },
            // picking a style makes the line a quote too
            quote(style) {
              const r = quill.getSelection(true);
              quill.formatLine(r.index, r.length, { blockquote: true, quote: style || false }, "user");
            },
            divider() {
              const r = quill.getSelection(true);
              quill.insertEmbed(r.index, "divider", true, "user");
              quill.setSelection(r.index + 1, 0, "silent");
            },
            async interactive() {
              const r = quill.getSelection(true);
              const file = await chooseFile(toast);
              const value = file && cleanEmbed({ ...file, height: 600 });
              if (!value) return;
              quill.insertEmbed(r.index, "interactive", value, "user");
              quill.setSelection(r.index + 1, 0, "silent");
              toast("Interactive added. Click it to change its caption or height; Preview shows it working.");
            },
            image() {
              const url = (prompt("Image web address (https://…)") || "").trim();
              if (!url) return;
              if (!/^https?:\/\//i.test(url)) { toast("Use a full http:// or https:// address.", "err"); return; }
              const r = quill.getSelection(true);
              quill.insertEmbed(r.index, "image", url, "user");
              quill.setSelection(r.index + 1, 0, "silent");
            },
          },
        },
        history: { delay: 800, maxStack: 300, userOnly: true },
      },
    });

    // Ctrl+E centers the current paragraph (press again to undo), like Word
    quill.keyboard.addBinding({ key: "e", shortKey: true }, (range) => {
      quill.format("align", quill.getFormat(range).align === "center" ? false : "center", "user");
      return false;
    });

    // the quote-style menu only means something inside a quote
    const quotePicker = toolbarEl.querySelector(".ql-picker.ql-quote");
    let lastRange = null;
    quill.on("selection-change", (range) => { if (range) lastRange = range; });
    quill.on("editor-change", () => {
      const r = quill.getSelection();
      if (quotePicker && r) quotePicker.classList.toggle("not-quote", !quill.getFormat(r).blockquote);
    });

    // any-colour pickers: remember the selection, since the colour dialog steals focus
    toolbarEl.querySelectorAll("input[data-color]").forEach((input) => {
      input.addEventListener("input", () => { input.parentElement.style.setProperty("--c", input.value); });
      input.addEventListener("change", () => {
        if (!lastRange) { toast("Click into the text first.", "err"); return; }
        quill.setSelection(lastRange.index, lastRange.length, "silent");
        quill.format(input.dataset.color, input.value, "user");
        quill.focus();
      });
    });

    // click an interactive in the text to change it
    quill.root.addEventListener("click", async (e) => {
      const node = e.target.closest && e.target.closest(".atk-embed");
      if (!node || !quill.root.contains(node) || !quill.isEnabled()) return;
      const blot = Quill.find(node);
      if (!blot || blot.statics.blotName !== "interactive") return;
      const value = await editInteractive(blot.statics.value(node), toast);
      if (!value) return;
      const at = quill.getIndex(blot);
      quill.updateContents({ ops: value === "remove" ? [{ retain: at }, { delete: 1 }]
        : [{ retain: at }, { delete: 1 }, { insert: { interactive: value } }] }, "user");
    });

    const words = () => { const t = quill.getText().trim(); return t ? t.split(/\s+/).length : 0; };
    return {
      quill,
      words,
      hasBody: () => !!(quill.getText().trim() || quill.getContents().ops.some((o) => o.insert && typeof o.insert === "object")),
      html: () => quill.root.innerHTML,
      forgetSelection: () => { lastRange = null; },
    };
  }

  /* ───────── article thumbnails ─────────
     Any picture, cropped from the middle to 1200 x 630 (the shape link previews on Twitter/X,
     Discord and the like use) and saved as a JPEG. Published into articles/thumbs/. */
  const THUMB_PATH = /^articles\/thumbs\/[a-z0-9-]+\.jpg$/;
  async function makeThumbnail(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error("Choose a picture (JPEG, PNG, WebP or GIF).");
    const bmp = await createImageBitmap(file).catch(() => { throw new Error("That picture couldn't be read."); });
    const W = 1200, H = 630, scale = Math.max(W / bmp.width, H / bmp.height);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#e9cb77"; g.fillRect(0, 0, W, H);   // (under any transparent parts)
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, (W - bmp.width * scale) / 2, (H - bmp.height * scale) / 2, bmp.width * scale, bmp.height * scale);
    return c.toDataURL("image/jpeg", 0.85);
  }

  window.ATKEditor = { create, toolbarHTML, FONTS, SIZES, QUOTES, COMMUNITY_FORMATS, makeThumbnail, THUMB_PATH };
})();
