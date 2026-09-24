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
    // quote styles: a class on a quote line (no class = the usual quote with a bar down the left)
    const Parchment = Quill.import("parchment");
    Quill.register(new Parchment.ClassAttributor("quote", "ql-quote", {
      scope: Parchment.Scope.BLOCK, whitelist: QUOTES.map(([v]) => v).filter(Boolean),
    }), true);
  }

  const ICON_UNDO = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="6 10 4 12 2 10 6 10"/><path class="ql-stroke" d="M8.09,13.91A4.6,4.6,0,0,0,9,14,5,5,0,1,0,4,9"/></svg>';
  const ICON_REDO = '<svg viewBox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="12 10 14 12 16 10 12 10"/><path class="ql-stroke" d="M9.91,13.91A4.6,4.6,0,0,1,9,14a5,5,0,1,1,5-5"/></svg>';
  const ICON_BREAK = '<svg viewBox="0 0 18 18"><line class="ql-stroke" x1="3" x2="15" y1="9" y2="9"/><line class="ql-stroke" x1="3" x2="5" y1="4" y2="4"/><line class="ql-stroke" x1="13" x2="15" y1="14" y2="14"/></svg>';
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
        ${full ? `<button type="button" class="ql-image" title="Image from a web address"></button>` : ""}
        <button type="button" class="ql-divider" title="Scene break">${ICON_BREAK}</button>
        <button type="button" class="ql-clean" title="Clear formatting"></button>
      </span>`;
  }

  // what each preset allows in the text, so pasted text can't bring in anything the toolbar can't make
  const COMMUNITY_FORMATS = ["header", "bold", "italic", "underline", "strike", "align", "list", "indent", "blockquote", "quote", "link", "divider"];

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

    const words = () => { const t = quill.getText().trim(); return t ? t.split(/\s+/).length : 0; };
    return {
      quill,
      words,
      hasBody: () => !!(quill.getText().trim() || quill.getContents().ops.some((o) => o.insert && typeof o.insert === "object")),
      html: () => quill.root.innerHTML,
      forgetSelection: () => { lastRange = null; },
    };
  }

  window.ATKEditor = { create, toolbarHTML, FONTS, SIZES, QUOTES, COMMUNITY_FORMATS };
})();
