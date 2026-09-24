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
mkdir -p dist/assets
cp index.html site.css site.js config.js dist/
cp assets/*.png dist/assets/
cp -r ../articles dist/articles
cp ../story-content.css dist/
echo "Built dist/ with $(ls dist/articles/*.json | wc -l) article files."
