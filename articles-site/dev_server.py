"""Preview the articles site on this computer: python articles-site/dev_server.py [port]

Serves articles-site/ the way Cloudflare Pages will: /articles/ and /story-content.css come
from the top of the repo (the build copies them in), and any address that isn't a file gets
index.html, so /article/<slug> and /contact work.
"""
import http.server
import json
import os
import re
import sys

SITE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(SITE)
SHARED = ("/articles/", "/story-content.css", "/shared/")


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        root = REPO if clean.startswith(SHARED) else SITE
        self.directory = root
        full = super().translate_path(path)
        if not os.path.exists(full) and "." not in os.path.basename(clean):
            full = os.path.join(SITE, "index.html")   # a page address, not a file
        return full

    def do_GET(self):
        # the list of anonymous-message backgrounds (build.sh makes this file on Cloudflare)
        if self.path.split("?", 1)[0] == "/assets/ask-backgrounds/index.json":
            folder = os.path.join(SITE, "assets", "ask-backgrounds")
            names = sorted(f for f in os.listdir(folder) if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._ -]*\.(png|jpe?g|webp)", f)) if os.path.isdir(folder) else []
            body = json.dumps(names).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    print(f"Articles site on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
