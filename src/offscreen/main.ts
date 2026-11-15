// DB の唯一の持ち主。画面から直接届いた依頼を Relate の worker に渡し、DB の変化を全画面に知らせる
import demoCypher from "../../seed/demo.cypher?raw";
import type { ClipRequest } from "../shared/clip-status";
import {
  type CypherParams,
  type DbRequest,
  type DbResponse,
  failure,
  isFromExtensionPage,
  isMessageFor,
  type RuntimeMessage,
} from "../shared/messages";
import { languageModel } from "../shared/prompt-api";
import { GraphQuestions } from "./answer-question";
import { ClipPipeline } from "./clip-pipeline";
import { storedUndoJournal } from "./clip-undo";
import { DbClient } from "./db-client";
import { ModelTracker } from "./model-tracker";
import { storedSeedProgress } from "./seed";
import type { WorkerResponse } from "./worker-protocol";

// execute は止められないので、これを超えたら worker ごと作り直す
const REQUEST_TIMEOUT_MS = 30_000;

const client = new DbClient({
  uri: "opfs://linka-graph",
  timeoutMs: REQUEST_TIMEOUT_MS,
  // Playwright の Chromium では terminate から約 2 秒でロックが外れた。余裕を見て 10 秒まで待つ
  lockRetry: { attempts: 40, delayMs: 250 },
  // CLI が data/linka.rl を作るのと同じファイルを、文字列としてバンドルに含める
  seed: demoCypher,
  seedProgress: storedSeedProgress(localStorage),
  createWorker: ({ onMessage, onError }) => {
    const worker = new Worker(new URL("./relate.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => onMessage(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      onError(event.message || "the database worker crashed");
    };
    // 返事を受け取れないと、待っている依頼は時間切れまで終わらないので、落ちたものとして扱う
    worker.onmessageerror = () => onError("could not read a message from the database worker");
    return { post: (request) => worker.postMessage(request), terminate: () => worker.terminate() };
  },
  onNotify: (notification) => {
    const message: RuntimeMessage = { target: "ui", type: "notify", notification };
    // 開いている画面が無ければ受け手がいないだけなので捨てる
    chrome.runtime.sendMessage(message).catch(() => {});
  },
});

const model = new ModelTracker({
  api: languageModel,
  onChange: (status) => {
    const message: RuntimeMessage = { target: "ui", type: "model", status };
    chrome.runtime.sendMessage(message).catch(() => {});
  },
});

const clips = new ClipPipeline({
  db: {
    execute: (statement) =>
      client.request({
        kind: "execute",
        query: statement.query,
        params: statement.params as CypherParams,
      }),
  },
  api: languageModel,
  journal: storedUndoJournal(localStorage),
  extensionRoot: chrome.runtime.getURL(""),
  onEvent: (event) => {
    const message: RuntimeMessage = { target: "ui", type: "clip", event };
    chrome.runtime.sendMessage(message).catch(() => {});
  },
});

const questions = new GraphQuestions({
  api: languageModel,
  execute: (statement) =>
    client.request({
      kind: "execute",
      query: statement.query,
      params: statement.params as CypherParams,
    }),
});

function handleClip(request: ClipRequest): Promise<DbResponse> {
  switch (request.kind) {
    case "clip":
      return clips
        .clip(request.tabUrl, request.title, request.body)
        .then((value) => ({ ok: true, value }));
    case "current":
      return Promise.resolve({ ok: true, value: clips.current() });
    case "isClipped":
      return clips.isClipped(request.tabUrl);
  }
}

// グラフを書き換えうる依頼は記憶の処理を通し、取り消しの記録が別のグラフに流れないようにする。
// execute は開発用のコンソールからしか書き込まないので通さない。記憶と同時に書くと混ざりうるが、開発用なので許す
function handleDb(request: DbRequest): Promise<DbResponse> {
  switch (request.kind) {
    case "resetToDemo":
      return clips.replaceGraph(() => client.request(request));
    case "executeScript":
      return clips.runScript(() => client.request(request));
    default:
      return client.request(request);
  }
}

function handle(message: Extract<RuntimeMessage, { target: "offscreen" }>): Promise<DbResponse> {
  switch (message.type) {
    case "model":
      return (message.request.kind === "download" ? model.download() : model.status()).then(
        (value) => ({ ok: true, value }),
      );
    case "clip":
      return handleClip(message.request);
    case "db":
      return handleDb(message.request);
    case "ask":
      return questions.ask(message.request.question);
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse: (response: DbResponse) => void) => {
    if (!isMessageFor(message, "offscreen")) return false;
    if (!isFromExtensionPage(sender, chrome.runtime.getURL(""))) return false;
    handle(message).then(sendResponse, (error: unknown) =>
      sendResponse(failure("exception", error instanceof Error ? error.message : String(error))),
    );
    return true;
  },
);
