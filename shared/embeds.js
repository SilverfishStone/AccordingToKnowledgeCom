/* Interactives in articles, on both sites. An article's text marks each one with
   <div class="atk-embed" data-doc="(an .html file, base64)" data-height="600" data-title="…">
   (placed by the editor, shared/editor.js); this swaps each marker for the live page.

     ATKEmbeds.hydrate(container)

   The page runs in a sealed-off frame (sandboxed, with no access to the site, its cookies or the
   reader's account), so an uploaded file can't do anything to the page around it. */
(() => {
  "use strict";
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

  function decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function frame(doc, title, height) {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads");
    f.setAttribute("allow", "fullscreen");
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.title = title;
    f.loading = "lazy";
    f.srcdoc = doc;
    // on phones, never taller than most of the screen, so the article can still be scrolled past it
    f.style.height = `min(${height}px, 82vh)`;
    return f;
  }

  function hydrate(container) {
    if (!container) return;
    container.querySelectorAll("div.atk-embed").forEach((node) => {
      const b64 = node.getAttribute("data-doc") || "";
      const title = (node.getAttribute("data-title") || "Interactive").slice(0, 140);
      const height = Math.min(1200, Math.max(280, Math.round(+node.getAttribute("data-height")) || 600));
      let doc = "";
      try { if (B64.test(b64)) doc = decode(b64); } catch { }
      if (!doc) { node.remove(); return; }

      const fig = document.createElement("figure");
      fig.className = "atk-interactive";
      const f = frame(doc, title, height);
      const cap = document.createElement("figcaption");
      const name = document.createElement("span");
      name.textContent = title;
      const full = document.createElement("button");
      full.type = "button";
      full.className = "atk-full";
      full.textContent = "Full screen ⛶";
      full.addEventListener("click", () => (f.requestFullscreen || f.webkitRequestFullscreen)?.call(f));
      cap.append(name, full);
      fig.append(f, cap);
      node.replaceWith(fig);
    });
  }

  window.ATKEmbeds = { hydrate, decode };
})();
