#!/usr/bin/env bash
# Cloudflare build for accordingtoknowledge.com (the articles site). Settings:
#
#   Root directory:   /articles-site
#   Build command:    bash build.sh
#   Deploy command:   npx wrangler deploy        (uploads dist/, see wrangler.jsonc)
#
# The articles are published once, by the editor on the personal site, into /articles/ at the
# top of this repo. This puts the site's own files, those articles and the article styles
# shared with the editor into dist/, which is exactly what gets published.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist
mkdir -p dist/assets/avatars
cp index.html site.css site.js community.js config.js dist/
cp assets/*.png dist/assets/
cp assets/avatars/*.svg assets/avatars/*.png assets/avatars/index.json dist/assets/avatars/ 2>/dev/null || true
test -f dist/assets/avatars/index.json   # the avatar list must be there
cp -r ../articles dist/articles
cp ../story-content.css dist/
echo "Built dist/ with $(ls dist/articles/*.json | wc -l) article files."
