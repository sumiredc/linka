import { useEffect, useState } from "react";
import { extractPage } from "../offscreen/extract";
import { chunkText } from "../shared/chunk-text";
import type { DbResponse } from "../shared/messages";
import { askModel, onModelStatus } from "../shared/model";
import type { ModelStatus } from "../shared/model-status";
import { languageModel } from "../shared/prompt-api";
import { annotatedNames } from "./extraction-checks";

// 開発用。本番の抽出（extractPage）を実際の記事の本文で試す。モデルの状態とダウンロードは offscreen document に尋ねる

export function ExtractionCheck() {
  const [model, setModel] = useState<DbResponse<ModelStatus> | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");

  useEffect(() => onModelStatus((status) => setModel({ ok: true, value: status })), []);

  const run = async () => {
    const chunks = chunkText(text);
    setOutput(`${chunks.length} 個に分けて抽出しています`);
    const started = performance.now();
    const result = await extractPage(languageModel(), { title, chunks });
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const annotated = result.ok ? annotatedNames(result.extraction) : [];
    setOutput(
      [
        `${chunks.length} 個・${seconds} 秒`,
        `注記の疑いがある概念名: ${annotated.map((a) => `${a.name}（${a.reason}）`).join(", ") || "無し"}`,
        JSON.stringify(result, null, 2),
      ].join("\n"),
    );
  };

  return (
    <section>
      <h2>抽出（extractPage）</h2>
      <button
        id="model-status"
        type="button"
        onClick={async () => setModel(await askModel({ kind: "status" }))}
      >
        モデルの状態
      </button>{" "}
      <button
        id="model-download"
        type="button"
        onClick={async () => setModel(await askModel({ kind: "download" }))}
      >
        ダウンロードを始める
      </button>
      <pre id="model-output">{model ? JSON.stringify(model) : ""}</pre>
      <div>
        <input
          id="extract-title"
          size={80}
          placeholder="記事のタイトル"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <textarea
        id="extract-text"
        rows={8}
        cols={80}
        placeholder="記事の本文を貼る"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div>
        <button id="extract-run" type="button" onClick={run}>
          抽出する
        </button>
      </div>
      <pre id="extract-output">{output}</pre>
    </section>
  );
}
