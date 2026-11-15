#!/bin/sh
# seed/demo.cypher から同梱ストア data/linka.rl を作る。Relate CLI 1.0.x が PATH に要る。使い方: npm run store
set -eu
cd "$(dirname "$0")/.."

# CLI は初期設定で利用状況を送信する
export DO_NOT_TRACK=1

if ! command -v relate >/dev/null 2>&1; then
  echo "relate CLI was not found on PATH. Install the Relate CLI 1.0.x and run again." >&2
  exit 1
fi

# 拡張機能の @relate/relate-wasm 1.0.1 と同じ系列で作る（ストアの形式を揃えるため）。1.0.1 は "Relate v1.0.1" と出す
version=$(relate --version 2>&1 || true)
case "$version" in
  "Relate v1.0."*) ;;
  *)
    echo "Relate CLI 1.0.x is required, but relate --version printed: $version" >&2
    exit 1
    ;;
esac

mkdir -p data
# 失敗した文より前の文は確定したまま残るので、別名で作ってから置き換え、失敗したら別名のほうを消す。
# 別名も .rl で終える（そうでないと単一ファイルではなくディレクトリのストアになる）
tmp=data/linka.tmp.rl
rm -f "$tmp"
trap 'rm -f "$tmp"' EXIT
# 失敗すると 0 以外で終わり、エラーは stderr に出る。stdout は文ごとの所要時間なので捨てる。
# `relate -d PATH` に標準入力を渡す形は、文を実行せずヘルプを出して 0 で終わるので、query を付ける
relate query -d "$tmp" < seed/demo.cypher > /dev/null
mv "$tmp" data/linka.rl
trap - EXIT

# 問い合わせるだけでもファイルが書き換わるので、確かめるときは --read-only で開く
relate query --read-only -d data/linka.rl --mode jsonl \
  "MATCH (n) WITH count(n) AS nodes OPTIONAL MATCH ()-[r]->() RETURN nodes, count(r) AS relationships"
echo "Wrote data/linka.rl"
