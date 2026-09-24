"""Preview the articles site on this computer: python articles-site/dev_server.py [port]

Serves articles-site/ the way Cloudflare Pages will: /articles/ and /story-content.css come
from the top of the repo (the build copies them in), and any address that isn't a file gets
index.html, so /article/<slug> and /contact work.
"""
import http.server
import os
import sys

SITE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(SITE)
SHARED = ("/articles/", "/story-content.css")


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        root = REPO if clean.startswith(SHARED) else SITE
        self.directory = root
        full = super().translate_path(path)
        if not os.path.exists(full) and "." not in os.path.basename(clean):
            full = os.path.join(SITE, "index.html")   # a page address, not a file
        return full

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    print(f"Articles site on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
