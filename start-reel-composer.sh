#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

for tool in node npm ffmpeg ffprobe magick; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing required tool: %s\n' "$tool" >&2
    exit 1
  fi
done

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -f dist/index.html || ! -f server-dist/server/index.js ]]; then
  npm run build
fi

printf 'Hints Reel Composer: http://127.0.0.1:8090\n'
npm start
