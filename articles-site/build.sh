#!/usr/bin/env bash
# Cloudflare Pages build for accordingtoknowledge.com (the articles site).
#
#   Build command:           bash articles-site/build.sh
#   Build output directory:  articles-site
#
# The articles are published once, by the editor on the personal site, into /articles/ at the
# top of this repo. This copies them (and the article styles shared with the editor) next to
# this site, so each site serves its own copy of the same files.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf articles
cp -r ../articles ./articles
cp ../story-content.css ./story-content.css
echo "Copied $(ls articles/*.json | wc -l) article files."
