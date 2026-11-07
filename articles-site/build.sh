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
cp index.html site.css site.js community.js writing.js quiz-core.js quiz.js quiz-maker.js dictionary.js config.js robots.txt dist/
cp assets/*.png dist/assets/
# the backgrounds for the anonymous-message pictures: every picture in the folder is offered in /admin
# (index.json is the list; names starting with _ or holding odd characters are left out)
mkdir -p dist/assets/ask-backgrounds
cp assets/ask-backgrounds/*.{png,jpg,jpeg,webp} dist/assets/ask-backgrounds/ 2>/dev/null || true
(cd dist/assets/ask-backgrounds && first=1 && ok='^[A-Za-z0-9][A-Za-z0-9._ -]*$' && printf '[' && for f in *.png *.jpg *.jpeg *.webp; do
  [ -f "$f" ] || continue
  [[ $f =~ $ok ]] || continue
  [ $first = 1 ] || printf ','
  first=0; printf '"%s"' "$f"
done; printf ']') > dist/assets/ask-backgrounds/index.json.tmp
mv dist/assets/ask-backgrounds/index.json.tmp dist/assets/ask-backgrounds/index.json
cp assets/avatars/*.svg assets/avatars/*.png assets/avatars/index.json dist/assets/avatars/ 2>/dev/null || true
test -f dist/assets/avatars/index.json   # the avatar list must be there
cp -r ../articles dist/articles
cp ../story-content.css dist/
cp -r ../shared dist/shared   # the editor, shared with silverfishstone.com/write
echo "Built dist/ with $(ls dist/articles/*.json | wc -l) article files."
