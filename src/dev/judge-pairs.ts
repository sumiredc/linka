// 開発用。UC2 の判定の当たり外れを測るための、デモデータの solution と concern の組と、人が付けた正解（#47）。
// 組はどれも別々のページの Claim で、同じ Concept を ABOUT で指す（judge-pairs.relate.test.ts で確かめる）。
// true はデモデータで ADDRESSES を張った組。ただし同じ Concept を持たない 2 組（y-indexeddb とベンダーの撤退、
// IndexedDB と Service Worker の同期 API）は UC2 の候補にならないので入れていない。false は同じ話題で別の問題の組
import type { LabeledPair } from "./judge-accuracy";

export const JUDGE_PAIRS: readonly LabeledPair[] = [
  {
    id: "crdt-merge",
    solution: {
      page: "https://crdt.tech/",
      statement:
        "With a CRDT, users can modify the data on any replica independently, and the CRDT merges the changes automatically into a consistent state.",
    },
    concern: {
      page: "https://www.inkandswitch.com/essay/local-first/",
      statement:
        "When people modify the same data concurrently on different devices, the changes have to be merged afterwards without losing anyone's work.",
    },
    concepts: ["CRDT"],
    expected: true,
    reason: "CRDT が変更を自動でマージするので、同時編集の変更を失わずにまとめる問題そのものを解く",
  },
  {
    id: "idb-async-vs-localstorage",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
      statement:
        "IndexedDB operations run asynchronously so they do not block the application, and the API is available in Web Workers.",
    },
    concern: {
      page: "https://web.dev/articles/storage-for-the-web",
      statement:
        "localStorage is synchronous and blocks the main thread, and it is not accessible from web workers or service workers.",
    },
    concepts: ["Web Worker"],
    expected: true,
    reason:
      "非同期で動き Worker からも使えるので、localStorage の「同期でメインスレッドを止める・Worker から使えない」を避けられる",
  },
  {
    id: "idb-async-vs-opfs-sync",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
      statement:
        "IndexedDB operations run asynchronously so they do not block the application, and the API is available in Web Workers.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      statement:
        "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.",
    },
    concepts: ["Web Worker"],
    expected: false,
    reason: "IndexedDB の性質の話で、OPFS の同期呼び出しが Worker の中に限られる制約は変わらない",
  },
  {
    id: "idb-async-vs-worker-dom",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
      statement:
        "IndexedDB operations run asynchronously so they do not block the application, and the API is available in Web Workers.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers",
      statement:
        "A worker cannot manipulate the DOM directly, so it has to send messages back to the main script.",
    },
    concepts: ["Web Worker"],
    expected: false,
    reason: "Worker から DOM を触れない問題とは別。Web Worker という話題が同じだけ",
  },
  {
    id: "persist-vs-eviction",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist",
      statement:
        "navigator.storage.persist() requests persistent storage, which the browser clears only by explicit user action rather than under storage pressure.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria",
      statement:
        "When the browser needs space, it evicts best-effort data without interrupting the user, so an app can lose its stored data without being asked.",
    },
    concepts: ["Eviction"],
    expected: true,
    reason:
      "永続ストレージを求めると容量不足で消されなくなるので、best-effort のデータが黙って消える問題を防ぐ",
  },
  {
    id: "worker-vs-localstorage",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers",
      statement:
        "A Web Worker runs a script in a background thread, so it can perform heavy tasks without interfering with the user interface.",
    },
    concern: {
      page: "https://web.dev/articles/storage-for-the-web",
      statement:
        "localStorage is synchronous and blocks the main thread, and it is not accessible from web workers or service workers.",
    },
    concepts: ["Web Worker"],
    expected: false,
    reason:
      "localStorage は Worker から使えないので、処理を Worker に移しても localStorage がメインスレッドを止める問題は解けない",
  },
  {
    id: "worker-vs-opfs-sync",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers",
      statement:
        "A Web Worker runs a script in a background thread, so it can perform heavy tasks without interfering with the user interface.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      statement:
        "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.",
    },
    concepts: ["Web Worker"],
    expected: true,
    reason:
      "同期の OPFS 呼び出しは Worker の中でしか使えないので、処理を Worker で動かすことがそのまま手立てになる",
  },
  {
    id: "serviceworker-vs-offline",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API",
      statement:
        "A service worker can put the assets an app needs into a cache when it installs and serve them from there, so the app keeps working when the network is not available.",
    },
    concern: {
      page: "https://www.inkandswitch.com/essay/local-first/",
      statement:
        "A cloud app cannot be used at all while its service is unavailable, for example when the device is offline.",
    },
    concepts: ["Offline support"],
    expected: true,
    reason: "アセットをキャッシュから配るので、ネットワークが無くてもアプリが使える",
  },
  {
    id: "absurdsql-vs-tab-lock",
    solution: {
      page: "https://github.com/jlongster/absurd-sql",
      statement:
        "absurd-sql treats IndexedDB like a disk and reads and writes the SQLite database in small blocks, so the database is persisted.",
    },
    concern: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "A sync access handle locks its OPFS file exclusively, so tabs contend for the database and can get SQLITE_BUSY or locking errors.",
    },
    concepts: ["SQLite"],
    expected: false,
    reason:
      "absurd-sql の保存の仕組みの話で、sync access handle の排他ロックでタブが競合する問題には触れていない",
  },
  {
    id: "sqlitewasm-vs-opfs-sync",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "SQLite Wasm with the OPFS persistence backend keeps a SQLite database in the origin private file system and is offered as the replacement for Web SQL.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      statement:
        "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.",
    },
    concepts: ["OPFS"],
    expected: false,
    reason:
      "SQLite Wasm が OPFS に DB を置くという事実で、同期呼び出しが Worker の中に限られる制約への手立てを述べていない",
  },
  {
    id: "sqlitewasm-vs-whole-image",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "SQLite Wasm with the OPFS persistence backend keeps a SQLite database in the origin private file system and is offered as the replacement for Web SQL.",
    },
    concern: {
      page: "https://github.com/jlongster/absurd-sql",
      statement:
        "Reading and writing the whole SQLite database image at once is a poor way to persist it in the browser.",
    },
    concepts: ["SQLite"],
    expected: false,
    reason:
      "DB を置く場所の話で、DB 全体を一度に読み書きしないことは文に無い（SQLite の永続化という話題が同じ）",
  },
  {
    id: "sqlitewasm-vs-tab-lock",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "SQLite Wasm with the OPFS persistence backend keeps a SQLite database in the origin private file system and is offered as the replacement for Web SQL.",
    },
    concern: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "A sync access handle locks its OPFS file exclusively, so tabs contend for the database and can get SQLITE_BUSY or locking errors.",
    },
    concepts: ["SQLite"],
    expected: false,
    reason: "OPFS に DB を置けるという事実で、タブ間のロック競合には触れていない",
  },
  {
    id: "sqlitewasm-vs-wasm-memory",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "SQLite Wasm with the OPFS persistence backend keeps a SQLite database in the origin private file system and is offered as the replacement for Web SQL.",
    },
    concern: {
      page: "https://v8.dev/blog/4gb-wasm-memory",
      statement:
        "4GB is the largest amount of memory possible with 32-bit pointers, so a WebAssembly program cannot hold more data than that in memory.",
    },
    concepts: ["WebAssembly"],
    expected: false,
    reason: "WebAssembly という話題が同じだけで、32 ビットのメモリ上限とは別の話",
  },
  {
    id: "sqlitewasm-worker-vs-localstorage",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "The library sets up the worker needed for synchronous OPFS access itself, so it can be used right from the main thread.",
    },
    concern: {
      page: "https://web.dev/articles/storage-for-the-web",
      statement:
        "localStorage is synchronous and blocks the main thread, and it is not accessible from web workers or service workers.",
    },
    concepts: ["Web Worker"],
    expected: false,
    reason:
      "OPFS 用の Worker を用意する話で、localStorage が同期でメインスレッドを止める問題は変わらない",
  },
  {
    id: "sqlitewasm-worker-vs-opfs-sync",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "The library sets up the worker needed for synchronous OPFS access itself, so it can be used right from the main thread.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      statement:
        "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.",
    },
    concepts: ["Web Worker", "Sync access handle"],
    expected: true,
    reason:
      "同期の OPFS 呼び出しに要る Worker をライブラリが用意するので、メインスレッドから使える",
  },
  {
    id: "sqlitewasm-worker-vs-worker-dom",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "The library sets up the worker needed for synchronous OPFS access itself, so it can be used right from the main thread.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers",
      statement:
        "A worker cannot manipulate the DOM directly, so it has to send messages back to the main script.",
    },
    concepts: ["Web Worker"],
    expected: false,
    reason: "Worker から DOM を触れない問題とは別。Worker という話題が同じだけ",
  },
  {
    id: "sqlitewasm-worker-vs-tab-lock",
    solution: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "The library sets up the worker needed for synchronous OPFS access itself, so it can be used right from the main thread.",
    },
    concern: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "A sync access handle locks its OPFS file exclusively, so tabs contend for the database and can get SQLITE_BUSY or locking errors.",
    },
    concepts: ["Sync access handle"],
    expected: false,
    reason:
      "sync access handle という概念が同じだけで、排他ロックでタブが競合する問題には触れていない",
  },
  {
    id: "sahpool-vs-opfs-sync",
    solution: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "The opfs-sahpool VFS does not require COOP and COEP headers, but it does not support multiple simultaneous connections to the same database.",
    },
    concern: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system",
      statement:
        "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.",
    },
    concepts: ["OPFS"],
    expected: false,
    reason: "COOP・COEP が要らないという話で、同期呼び出しが Worker の中に限られる制約とは別",
  },
  {
    id: "sahpool-vs-absurdsql-coop",
    solution: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "The opfs-sahpool VFS does not require COOP and COEP headers, but it does not support multiple simultaneous connections to the same database.",
    },
    concern: {
      page: "https://github.com/jlongster/absurd-sql",
      statement:
        "absurd-sql relies on SharedArrayBuffer and Atomics, so the server must send COOP and COEP headers.",
    },
    concepts: ["Cross-origin isolation"],
    expected: true,
    reason:
      "COOP・COEP を要らなくする VFS なので、そのヘッダーを送らなければならない問題を避けられる",
  },
  {
    id: "sahpool-vs-opfs-coop",
    solution: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "The opfs-sahpool VFS does not require COOP and COEP headers, but it does not support multiple simultaneous connections to the same database.",
    },
    concern: {
      page: "https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system",
      statement:
        "The OPFS persistence backend depends on SharedArrayBuffer, so the page must be served with COOP and COEP headers.",
    },
    concepts: ["Cross-origin isolation", "OPFS"],
    expected: true,
    reason:
      "COOP・COEP を要らなくする VFS なので、OPFS のバックエンドがそのヘッダーを要る問題を避けられる",
  },
  {
    id: "weblocks-vs-tab-lock",
    solution: {
      page: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API",
      statement:
        "Web Locks let tabs and workers of the same origin coordinate the use of a resource: while one holds a lock, other requests for it are queued until it is released.",
    },
    concern: {
      page: "https://sqlite.org/wasm/doc/trunk/persistence.md",
      statement:
        "A sync access handle locks its OPFS file exclusively, so tabs contend for the database and can get SQLITE_BUSY or locking errors.",
    },
    concepts: ["Multiple tabs"],
    expected: true,
    reason:
      "タブと Worker が順番に資源を使うよう調整するので、タブがロックを取り合って失敗する問題を減らす",
  },
];
