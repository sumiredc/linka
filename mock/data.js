// モック用のデータ。デモデータ（初回に入っているグラフ）と、ブラウザのタブに開いているページ。
// 実際の製品では Gemini Nano が抽出するもの、または同梱の事前抽出済みデータに当たる。

window.LINKA_CONCEPTS = {
  indexeddb: "IndexedDB",
  "browser-storage": "ブラウザストレージ",
  webassembly: "WebAssembly",
  memory: "メモリ上限",
  opfs: "OPFS",
  sqlite: "SQLite",
  "web-workers": "Web Workers",
  "main-thread": "メインスレッド",
  memory64: "Memory64",
  embeddings: "埋め込み",
  quantization: "量子化",
  crdt: "CRDT",
  sync: "同期",
};

// clipped: true はデモデータとして最初からグラフにあるページ。
// sample: true は Gemini Nano が無くてもクリップできる同梱サンプル。
window.LINKA_PAGES = {
  p1: {
    title: "ブラウザ内データベースにおける IndexedDB の隠れたコスト",
    short: "IndexedDB のコスト",
    url: "https://storage-notes.dev/indexeddb-cost",
    clipped: true,
    clippedAt: "11/12",
    summary: "小さなランダム書き込みが多い処理で、IndexedDB のトランザクションがどれだけ遅くなるかを測った記事。",
    concepts: ["indexeddb", "browser-storage"],
    claims: [
      { id: "p1c1", type: "concern", text: "小さな書き込みのたびに IndexedDB のトランザクションが走り、ランダム書き込みが詰まる。", about: ["indexeddb"] },
      { id: "p1c2", type: "fact", text: "IndexedDB は主要ブラウザのすべてと Worker の中で使える。", about: ["indexeddb"] },
    ],
  },
  p2: {
    title: "本番で必ず当たる Wasm のメモリ上限",
    short: "Wasm のメモリ上限",
    url: "https://wasm-weekly.io/memory-limits",
    clipped: true,
    clippedAt: "11/12",
    summary: "32 ビット Wasm の 4GB の壁と、メモリ上にデータを持つアプリへの影響を解説した記事。",
    concepts: ["webassembly", "memory"],
    claims: [
      { id: "p2c1", type: "concern", text: "32 ビット Wasm の線形メモリは 1 インスタンスあたり 4GB が上限。", about: ["webassembly", "memory"] },
      { id: "p2c2", type: "concern", text: "メモリ上のグラフは、インデックスも含めてその枠に収める必要がある。", about: ["memory"] },
    ],
  },
  p3: {
    title: "OPFS で SQLite をブラウザに載せる",
    short: "SQLite + OPFS",
    url: "https://sqlite-in-browser.dev/opfs",
    clipped: true,
    clippedAt: "11/13",
    summary: "OPFS の同期アクセスハンドルで、ブラウザ内に本物のデータベースファイルを置けるようになった話。",
    concepts: ["opfs", "sqlite", "web-workers", "browser-storage"],
    claims: [
      { id: "p3c1", type: "solution", text: "OPFS の同期アクセスハンドルを使えば、専用 Worker から高速にランダム書き込みできる。", about: ["opfs"], addresses: "p1c1" },
      { id: "p3c2", type: "concern", text: "同期アクセスハンドルは排他なので、2 つ目のタブは同じファイルを開けない。", about: ["opfs"] },
    ],
    body: [
      "これまでブラウザで本物のデータベースを動かすには、IndexedDB に無理やり押し込むしかなかった。Origin Private File System（OPFS）はこれを変える。オリジンごとに、本物のファイルを置ける専用のディレクトリが手に入る。",
      "要になるのは同期アクセスハンドルだ。専用 Worker の中で createSyncAccessHandle() を使ってファイルを開けば、1 回ごとに Promise を待たずに任意の位置を読み書きできる。ストレージエンジンが欲しかったのはまさにこれだ。",
      "手元のベンチマークでは、4KB のランダム書き込みが IndexedDB の同じ処理より 1 桁速かった。ただし落とし穴がある。同期アクセスハンドルは排他で、ある Worker が握っている間は、2 つ目のタブから同じファイルを開こうとするとエラーになる。",
      "アプリが複数のタブで開かれうるなら、どのタブがデータベースを持つかを決めておく必要がある。",
    ],
  },
  p4: {
    title: "同期的な Wasm 呼び出しによるメインスレッドのカクつき",
    short: "メインスレッドのカクつき",
    url: "https://perf.fyi/sync-wasm-jank",
    clipped: true,
    clippedAt: "11/13",
    summary: "長い同期 Wasm 呼び出しが描画と入力を止める様子を示した記事。",
    concepts: ["webassembly", "main-thread"],
    claims: [
      { id: "p4c1", type: "concern", text: "長い同期クエリは、返るまで入力と描画を止めてしまう。", about: ["main-thread"] },
    ],
  },
  p5: {
    title: "Web Workers でデータベースを動かす設計パターン",
    short: "Worker で DB を動かす",
    url: "https://workers.guide/databases",
    clipped: true,
    clippedAt: "11/14",
    summary: "クライアント側データベースを Worker で動かす構成と、処理の中断の仕方をまとめた記事。",
    concepts: ["web-workers", "main-thread"],
    claims: [
      { id: "p5c1", type: "solution", text: "エンジンを専用 Worker で動かし、クエリが暴走したら Worker ごと止める。", about: ["web-workers"], addresses: "p4c1" },
      { id: "p5c2", type: "benefit", text: "Worker に逃がせば、クエリの実行中も UI が固まらない。", about: ["web-workers"] },
    ],
  },
  p6: {
    title: "Memory64 が使えるようになって何が変わるか",
    short: "Memory64",
    url: "https://wasm-weekly.io/memory64",
    clipped: true,
    clippedAt: "11/14",
    summary: "64 ビットメモリが、大きなデータを持つ Wasm アプリにとって何を意味するかの解説。",
    concepts: ["webassembly", "memory64", "memory"],
    claims: [
      { id: "p6c1", type: "solution", text: "Memory64 なら Wasm の線形メモリの 4GB の上限がなくなる。", about: ["memory64", "memory"], addresses: "p2c1" },
    ],
  },
  t1: {
    title: "埋め込みベクトルをブラウザのメモリに収める",
    short: "埋め込みとメモリ",
    url: "https://vectors.dev/browser-memory",
    sample: true,
    summary: "メモリ上のインデックスと並べて置けるよう、ベクトルデータを小さくする方法。",
    concepts: ["embeddings", "memory", "quantization"],
    claims: [
      { id: "t1c1", type: "solution", text: "ベクトルを int8 に量子化すれば、精度をほとんど落とさずにメモリを 4 分の 1 にできる。", about: ["memory", "quantization"], addresses: "p2c2" },
      { id: "t1c2", type: "concern", text: "端末内の埋め込みモデルは、ダウンロードを数百 MB 増やしてしまう。", about: ["embeddings"] },
    ],
    body: [
      "ローカル検索で静かにメモリを食うのはベクトルだ。768 次元の float32 の埋め込みは 1,000 件で 3MB、10 万件なら 300MB になる。インデックスを足す前の話だ。",
      "一番安い対策は量子化だ。各次元を float32 ではなく int8 で持てばメモリは 4 分の 1 になる。手元の検証では recall@10 の低下は 2 ポイント未満だった。",
      "ただ、量子化はモデル本体には効かない。端末内の埋め込みモデルは、最初のダウンロードをやはり数百 MB 増やす。ブラウザ拡張機能としては受け入れてもらいにくい。",
    ],
  },
  t2: {
    title: "ブラウザだけで動くグラフエクスプローラーを作って学んだこと",
    short: "グラフツールの教訓",
    url: "https://graphs.example.dev/lessons",
    sample: true,
    summary: "すべてブラウザの中で動くグラフツールを作った振り返り。",
    concepts: ["opfs", "web-workers", "browser-storage"],
    claims: [
      { id: "t2c1", type: "solution", text: "ストアの持ち主を 1 つのタブに決め、他のタブのクエリは BroadcastChannel でそこへ送る。", about: ["opfs"], addresses: "p3c2" },
      { id: "t2c2", type: "fact", text: "Chrome 拡張機能のサイドパネルからも、OPFS を使う専用 Worker を起動できる。", about: ["opfs", "web-workers"] },
    ],
    body: [
      "このグラフエクスプローラーは、サーバーを一切使わずに動くように作った。エンジンは Wasm にコンパイルし、データは OPFS に置き、すべてを専用 Worker の中で動かす。",
      "最初に来たバグ報告はタブについてだった。アプリを 2 つ開くと、2 つ目のタブがストアを開けない。OPFS の同期アクセスハンドルは排他だからだ。",
      "解決策として、1 つのタブをストアの持ち主にし、他のタブのクエリは BroadcastChannel でそこへ回すようにした。持ち主のタブが閉じたら、次のタブが引き継ぐ。",
      "うれしい発見もあった。Chrome 拡張機能のサイドパネルからも OPFS を使う専用 Worker を起動できるので、同じ構成が拡張機能の中でもそのまま使える。",
    ],
  },
  t3: {
    title: "端末間の CRDT 同期についてのメモ",
    short: "CRDT 同期メモ",
    url: "https://someone.blog/crdt-sync",
    summary: "オフラインでの編集を複数の端末で食い違わないように保つ方法についての個人メモ。",
    concepts: ["crdt", "sync"],
    claims: [
      { id: "t3c1", type: "concern", text: "2 台の端末でのオフライン編集をまとめるには、衝突しないデータ型が要る。", about: ["crdt", "sync"] },
    ],
    body: [
      "ローカルファーストのアプリは、いずれ同じ問いにぶつかる。2 台の端末が同じものをオフラインで編集したらどうなるか。",
      "最後に書いた方を勝たせるのは簡単だが、データが消える。CRDT（衝突しない複製データ型）なら編集を決まった手順でまとめられる。代わりにメタデータが増える。",
      "グラフ向けで気に入ったライブラリはまだ見つかっていない。",
    ],
  },
};

// ブラウザに開いているタブの並び。chrome は Linka が読めないページの例。
window.LINKA_TABS = ["t1", "t2", "p3", "t3", "chrome"];
