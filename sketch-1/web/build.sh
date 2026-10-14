#!/bin/sh
# Builds the GitHub Pages version of Sketch 1 into dist/: public/ plus server.js bundled to run in the browser.
# Usage (from sketch-1/): sh web/build.sh, then serve dist/ with any static server.
set -e
rm -rf dist && mkdir -p dist/seed
cp -r public/. dist/
cp seed/events.json seed/requests.json dist/seed/
npx -y esbuild@0.24.0 web/boot.js --bundle --format=iife --platform=browser --outfile=dist/server.js --inject:web/globals.js \
  --alias:fs=./web/node.js --alias:path=./web/node.js --alias:crypto=./web/node.js --alias:http=./web/node.js \
  --alias:zlib=./web/node.js --alias:os=./web/node.js --alias:child_process=./web/node.js
sed -i 's|<script src="./js/ui.js"></script>|<script src="./server.js"></script>\n  &|' dist/index.html
