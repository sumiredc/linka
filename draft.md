# Project Draft: Linka — Local Graph Memory for Chrome (Relate Wasm × Chrome Built-in AI)

## 1. プロジェクト概要・コンセプト
* **プロダクト名:** **Linka**（リンカ）
  * **ワンラインピッチ:** *Turn your Chrome browsing into a local, connected knowledge graph powered by Relate Wasm and Gemini Nano.*
* **対象ハッカソン:** Relate by Neo4j Hackathon (`https://relate.devpost.com/`)
  * **テーマ:** "Context, connected"
  * **提出締切:** 2026年12月11日 18:00 PST（日本時間: 2026年12月12日 11:00 JST）
* **プロダクト形態:** **Chrome 拡張機能（Manifest V3 / Side Panel API）**
* **コンセプト:**
  「その場限りの要約で文脈が消える既存ブラウザAI（Ask Gemini等）」や「タブが散乱する従来のブラウジング」に対し、**Chrome のサイドパネルからワンクリックでWeb記事や選択テキストを構造化し、ローカルの知識グラフ（長期記憶）として編み上げる Chrome 拡張機能（Manifest V3）**。
* **コアバリュー:**
  1. **普段のブラウジング体験へのシームレスな統合:** 特別なアプリにURLをコピペする手間がなく、今開いているアクティブタブ（認証が必要な社内Wikiや会員記事も含む）から直接 DOM テキストを取得してグラフ化できる。
  2. **100% ローカル・サーバーレス完結:** バックエンドサーバーも外部LLM APIも不要。Chrome 組み込み AI（Gemini Nano / Prompt API）とブラウザ内グラフDB（Relate Wasm）のみを使用し、閲覧・調査履歴や社内資料の内容が外部に一切送信されない。
  3. **選択的取り込み（スマート・クリッピング）:** 全閲覧履歴を無差別に入れるのではなく、ユーザーが「残したい」と選択したページやハイライトテキストのみを構造化してグラフ化する（ノイズ防止）。
  4. **多段階の関係性探索（Connected Context）:** 単なるベクトル検索や要約ではなく、異なるページ間にまたがる共通の概念・人物・課題・解決策のつながり（マルチホップ）を Cypher で探索し、サイドパネル上のグラフで視覚的にハイライトする。

---

## 2. システムアーキテクチャ（Chrome 拡張機能 Manifest V3）

### 全体構成図
```text
+-----------------------------------+-----------------------------------+
|  通常ブラウザ画面 (Active Tab)     |  Linka Side Panel (Chrome 拡張機能) |
|                                   |                                   |
|  閲覧中の Web ページ (DOM)         |  [+ このページを記憶] [選択テキスト追加] |
|    │                              |  ┌─────────────────────────────┐  |
|    ▼ (Content Script / Scripting) |  │ インタラクティブ・知識グラフ  │  |
|  記事本文・タイトル・URL・選択範囲   |  │  [記事A] ─(MENTIONS)─▶ [技術X]│  |
|    │                              |  │     │                 ▲     │  |
|    └───────(chrome.runtime)──────▶|  │  (SOLVES) ◀── [記事B] ┘     │  |
|                                   |  └─────────────────────────────┘  |
|                                   |  ┌─────────────────────────────┐  |
|                                   |  │ AI コンテキスト質問チャット    │  |
|                                   |  │ 「今のページと過去の関連は？」 │  |
|                                   |  └─────────────────────────────┘  |
+-----------------------------------+-----------------------------------+
                                                   │ (postMessage)
                                                   ▼
                                    +-----------------------------------+
                                    |  Web Worker (Dedicated Worker)    |
                                    |  └─ Relate Wasm (@relate/relate-wasm)
                                    |     └─ OPFS (opfs://linka-graph)  |
                                    +-----------------------------------+
```

### 技術スタックとコンポーネント配置
* **拡張機能基盤:** Chrome Extension Manifest V3 + Vite (`@crxjs/vite-plugin` 等) + React + TypeScript
* **グラフDBエンジン:** `@relate/relate-wasm`
  * **配置場所:** Side Panel ページから起動する **Web Worker (Dedicated Worker)** 内に配置する。
  * **理由:**
    1. 拡張機能のバックグラウンド Service Worker は一定時間でスリープするため、Side Panel 内の Dedicated Worker に配置することでライフサイクルを安定させる。
    2. ブラウザ内ストレージ（OPFS: `RelateDb.open("opfs://linka-graph")`）への永続化には Worker コンテキストが必要。
    3. Wasm モジュールの制約（並列クエリ実行時の `recursive use of an object detected` エラー回避）のため、Worker 内に直列実行キュー（Promiseチェーン）を実装する。
* **Manifest V3 セキュリティ設定 (`manifest.json`):**
  * WebAssembly 実行を許可するため、以下を必須設定とする：
    ```json
    {
      "manifest_version": 3,
      "name": "Linka",
      "description": "Local-first knowledge graph memory for Chrome powered by Relate Wasm and Gemini Nano.",
      "permissions": ["sidePanel", "activeTab", "scripting", "contextMenus", "storage"],
      "content_security_policy": {
        "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
      }
    }
    ```
* **AI エンジン:** Chrome Built-in AI (`LanguageModel` / Prompt API - Gemini Nano)
  * **役割分担（重要）:** 軽量なオンデバイスモデルである Gemini Nano に複雑な Cypher を直接書かせると構文エラーが起きやすいため、**Gemini Nano には「構造化 JSON の抽出（Structured Output）」のみを担当させ、受け取った JSON を TypeScript 側のテンプレート関数で安全な `MERGE` / `MATCH` Cypher クエリに変換して Relate Wasm に渡す**設計とする。
  * **フォールバック対応:** 審査員のブラウザ環境で Prompt API が無効・未ダウンロードの場合でも動作するよう、以下を用意する：
    1. 事前定義されたサンプル記事・プリセット質問のワンクリック実行機能
    2. 任意の外部 API キー（Gemini API 等）または手動テキスト抽出モードへの切り替えオプション
* **グラフ可視化:** `react-force-graph-2d` または `cytoscape.js`（検索パスがヒットした際に該当ノードとエッジをハイライト発光させる演出を実装）

---

## 3. グラフデータモデル（オントロジー / スキーマ設計）

AI による抽出ブレを防ぐため、ノードラベルとリレーションシップを以下のスキーマに固定する。

### ノード (Nodes)
* `:Page` — クリッピングした Web ページ・記事・メモ
  * プロパティ: `id` (string), `title` (string), `url` (string), `summary` (string), `createdAt` (string)
* `:Concept` — 技術名、トピック、製品、キーワード（例: `Rust`, `WebAssembly`, `GraphRAG`）
  * プロパティ: `name` (string, 正規化された表記), `category` (string)
* `:Person` — 著者、言及されている人物、開発者
  * プロパティ: `name` (string)
* `:Claim` — 記事内の重要な主張、メリット、課題（懸念点）、解決策
  * プロパティ: `id` (string), `statement` (string), `type` (`"benefit" | "concern" | "solution" | "fact"`)

### リレーションシップ (Relationships)
* `(:Page)-[:AUTHORED_BY]->(:Person)`
* `(:Page)-[:MENTIONS]->(:Concept)`
* `(:Page)-[:ASSERTS]->(:Claim)`
* `(:Claim)-[:ABOUT]->(:Concept)`
* `(:Claim)-[:ADDRESSES]->(:Claim)`（あるページの「解決策」が、別ページの「懸念点」を解決する関係）
* `(:Concept)-[:RELATED_TO]->(:Concept)`

---

## 4. 主要ユースケースとデモシナリオ

### シナリオ 1：閲覧中ページのワンクリック・グラフ化
1. ユーザーが Chrome で技術記事やドキュメントを開き、右側の **Linka サイドパネル** で「+ このページを記憶（Clip Page）」をクリック（またはテキストを選択して右クリックメニュー「Linka に追加」を実行）。
2. Content Script / `chrome.scripting.executeScript` が現在のタブからタイトル・URL・本文テキストを抽出。
3. Chrome 組み込み AI（Gemini Nano）がローカルで本文を解析し、`Page`, `Concept`, `Person`, `Claim` を JSON として抽出。
4. TypeScript 側で `MERGE` Cypher クエリを生成し、Web Worker 内の Relate Wasm に投入。
5. 既存ノード（例：`Rust` や `WebAssembly`）と自動的に結合し、サイドパネル上のグラフキャンバスに新しいノードとエッジがリアルタイムに追加される。

### シナリオ 2：多段階関係性（マルチホップ）による文脈検索
* ユーザーがサイドパネル下部のチャット欄（またはプリセットボタン）で質問する：
  * 例：「これまで保存した記事の中で、ある記事が指摘していた『課題（concern）』と、それに対する『解決策（solution）』を書いている別記事のつながりを教えて」
* Relate Wasm 上で以下のようなマルチホップクエリを実行：
  ```cypher
  MATCH (p1:Page)-[:ASSERTS]->(c1:Claim {type: 'concern'})-[:ABOUT]->(concept:Concept)
  OPTIONAL MATCH (p2:Page)-[:ASSERTS]->(c2:Claim {type: 'solution'})-[:ADDRESSES]->(c1)
  RETURN p1.title AS page1, p1.url AS url1, c1.statement AS concern, concept.name AS topic, p2.title AS page2, p2.url AS url2, c2.statement AS solution
  ```
* 結果のテキスト回答（該当ページへのリンク付き）と同時に、**サイドパネル上のグラフビューで `p1 -> c1 -> concept` および `p2 -> c2 -> c1` のパスがハイライト表示**される。ノードをクリックすると元の Web ページをタブで開くことも可能。

---

## 5. ハッカソン提出要件・審査基準への対応計画

### 必須提出物チェックリスト
* [ ] **公開 GitHub リポジトリ（必須タグ設定）:**
  * リポジトリの GitHub Topics に **`relate`（必須）** および `relate-neo4j-hackathon`（推奨）を設定する。
  * 明確なビルド・拡張機能読み込み手順（`npm install && npm run build` → `chrome://extensions` で `dist/` 読み込み）を含む `README.md` を作成する。
* [ ] **永続化された Relate ストアの同梱:**
  * 審査員がすぐ検証できるよう、あらかじめ10〜15記事分のリサーチデータが投入された**実体の `.rl` ファイル（例: `data/linka-graph.rl`）**をリポジトリに同梱する（Relate CLI で生成）。
  * また、拡張機能の初回起動時に OPFS が空であれば、同じ初期データセット（`public/seed.cypher`）を自動的に Relate Wasm にロードして即座にグラフが描画されるようにする。
* [ ] **README 指定テンプレートの準拠:**
  * 保存モード（Wasm の `opfs://` 永続化 ＋ リポジトリ同梱の single file `.rl`）を選択した理由とグラフモデルを明記する。
* [ ] **デモ動画（1〜2分）:**
  * Chrome 標準の「Ask Gemini」との違い（永続的なグラフ記憶・多段階探索・完全ローカルプライバシー）を冒頭で示し、実際の Web ページ閲覧 → ワンクリック追加 → グラフ成長 → マルチホップ質問＆パスハイライトの一連の流れを実演する。

### 審査基準の重点対策
* **Relate and connected context (30点):** 単一ノード検索ではなく、複数ページを跨ぐパス探索クエリとグラフ上のパスハイライトUIを中核に据える。
* **Functionality and completeness (25点) & Documentation (15点):** Chrome Built-in AI が使えない審査員環境でも 100% 動作するフォールバック（プリセットデータ＆サンプル投入ボタン）と、`npm install && npm run build` して `dist` を読み込むだけで即動く再現性を徹底する。

---

## 6. Claude Code への初期実装タスク指示

1. **Chrome 拡張機能プロジェクト初期化:**
   * Vite + React + TypeScript + `@crxjs/vite-plugin` で Manifest V3 プロジェクトをセットアップ（アプリ名: `Linka`）。
   * `manifest.json` に `sidePanel`, `activeTab`, `scripting`, `contextMenus`, `storage` 権限および `'wasm-unsafe-eval'` CSP を設定。
   * `@relate/relate-wasm` およびグラフ可視化ライブラリ（`react-force-graph-2d` 等）を導入。
2. **アクティブタブ抽出ヘルパーの実装 (`src/services/pageExtractor.ts`):**
   * `chrome.tabs.query` と `chrome.scripting.executeScript` を用い、開いている Web ページの `title`, `url`, 選択テキスト、および主要本文テキスト（ノイズ除去・最大文字数トリミング済み）を取得する処理を実装。
3. **Relate Wasm Worker の構築 (`src/workers/relate.worker.ts`):**
   * `RelateDb.open("opfs://linka-graph")` による初期化（OPFS 非対応時はインメモリ `new RelateDb()` へ自動フォールバック）。
   * クエリを直列実行するキュー機構の実装。
   * 初期シードデータ（`public/seed.cypher`）のロード処理と、現在の全ノード・全エッジを可視化用 JSON として返すヘルパーの実装。
4. **Chrome Built-in AI サービス層の構築 (`src/services/chromeAi.ts`):**
   * `LanguageModel.availability()` / `LanguageModel.create()` を用いた Chrome Prompt API ラッパーの実装。
   * ページ本文から `{ concepts, people, claims, summary }` を抽出するプロンプトと JSON パース処理、および API 非対応環境向けのルールベース/モック抽出フォールバックの実装。
5. **Cypher ビルダーの構築 (`src/services/cypherBuilder.ts`):**
   * 抽出された JSON からインジェクション対策を施した安全な `MERGE` クエリを生成するモジュール。
6. **Side Panel UI の実装 (`src/sidepanel/App.tsx`):**
   * 狭いサイドパネル幅でも見やすい縦積みレイアウト（上部：「+ このページを記憶」ボタン＆AIステータス表示、中部：インタラクティブ知識グラフ＆パスハイライト、下部：質問チャット＆プリセット質問チップ）。