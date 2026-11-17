#!/bin/sh
# Chrome Web Store に上げる zip を作る。dist/ の中身を zip の直下に置く。使い方: npm run package
set -eu

version=$(node -p 'require("./public/manifest.json").version')
out="release/linka-$version.zip"

npm run build
mkdir -p release
rm -f "$out"
# -X で更新時刻以外のファイル属性を入れない
(cd dist && zip -qrX "../$out" . -x '*.DS_Store')
echo "Wrote $out"
