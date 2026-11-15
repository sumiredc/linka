#!/bin/sh
# seed/demo.cypher から同梱ストア data/linka.rl を作る。Relate CLI 1.0.x が PATH に要る。使い方: npm run store
set -eu
cd "$(dirname "$0")/.."

if ! command -v relate >/dev/null 2>&1; then
  echo "relate CLI was not found on PATH. Install the Relate CLI 1.0.x and run again." >&2
  exit 1
fi

# 拡張機能の @relate/relate-wasm 1.0.1 と同じ系列で作る（ストアの形式を揃えるため）
version=$(DO_NOT_TRACK=1 relate --version 2>&1 || true)
case "$version" in
  *" 1.0."* | "1.0."*) ;;
  *)
    echo "Relate CLI 1.0.x is required, but relate --version printed: $version" >&2
    exit 1
    ;;
esac

mkdir -p data
# 途中で失敗しても前のストアを壊さないよう、別名で作ってから置き換える
tmp=data/linka.rl.tmp
rm -f "$tmp"
DO_NOT_TRACK=1 relate -d "$tmp" < seed/demo.cypher
mv "$tmp" data/linka.rl
echo "Wrote data/linka.rl"
