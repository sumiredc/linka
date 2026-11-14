#!/bin/sh
# seed/demo.cypher から同梱ストア data/linka.rl を作る。Relate CLI が PATH に要る。使い方: npm run store
set -eu
cd "$(dirname "$0")/.."

if ! command -v relate >/dev/null 2>&1; then
  echo "relate CLI was not found on PATH. Install the Relate CLI 1.0.x and run again." >&2
  exit 1
fi

mkdir -p data
# 既存のストアに MERGE で重ねず、seed だけから作り直す
rm -f data/linka.rl
DO_NOT_TRACK=1 relate -d data/linka.rl < seed/demo.cypher
echo "Wrote data/linka.rl"
