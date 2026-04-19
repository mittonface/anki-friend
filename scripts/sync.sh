#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

make sync-db
make generate

if git diff --quiet HEAD -- content/ && [ -z "$(git ls-files --others --exclude-standard content/)" ]; then
  echo "No changes to sync."
  exit 0
fi

git add content/
git commit -m "sync Anki progress and add new cards from Anki sync"
git push

echo "Sync complete."
