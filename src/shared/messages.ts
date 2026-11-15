// 画面・service worker・offscreen document の間で chrome.runtime を通して送るメッセージ。
// 長い依頼が service worker の休止で返事を失わないよう、DB への依頼と通知は service worker を通さない
import type { ClipEvent, ClipRequest } from "./clip-status";
import type { ModelStatus } from "./model-status";

export type CypherParams = Record<string, unknown>;

export type DbRequest =
  | { kind: "execute"; query: string; params?: CypherParams }
  | { kind: "executeScript"; script: string; params?: CypherParams }
  /** Reset to demo data。グラフをすべて消してから、同梱のデモデータを入れ直す */
  | { kind: "resetToDemo" }
  | { kind: "status" };

/** Relate の結果（wire envelope）のうち、画面が使う部分 */
export type RelateResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  stats: Record<string, number>;
};

export type StorageState =
  | { kind: "starting" }
  | { kind: "opfs" }
  // OPFS を開けず、メモリ上の DB で動いている。閉じると中身は消える
  | { kind: "memory"; reason: string }
  | { kind: "unavailable"; reason: string };

export type DbFailureKind =
  /** Relate が `error` を返した（構文の誤りなど）。DB はそのまま使える */
  | "relate"
  /** worker の中で trap 以外の例外が起きた */
  | "exception"
  | "timeout"
  /** wasm が trap した、または worker が落ちた。worker は作り直される */
  | "trap"
  /** 前の依頼の時間切れや trap で worker を作り直すため、実行せずに打ち切った */
  | "restarting"
  | "unavailable"
  /** offscreen document を用意できなかった、または依頼が届かなかった */
  | "unreachable"
  /** ページの記憶の最中なので、グラフを置き換える依頼（Reset to demo data）を実行せずに断った */
  | "busy";

export type DbFailure = { ok: false; error: { kind: DbFailureKind; message: string } };

export type DbResponse<T = unknown> = { ok: true; value: T } | DbFailure;

export type DbResultOf<R extends DbRequest> = R extends { kind: "execute" }
  ? RelateResult
  : R extends { kind: "executeScript" } | { kind: "resetToDemo" }
    ? RelateResult[]
    : StorageState;

export type DbNotification =
  | { type: "graphChanged" }
  | { type: "storageChanged"; storage: StorageState };

/** Gemini Nano のモデルへの依頼。返事はどちらも依頼を受けた時点の `ModelStatus` */
export type ModelRequest =
  | { kind: "status" }
  /** モデルが入っていなければダウンロードを始める。終わるのを待たずに返事をし、進み具合は通知する */
  | { kind: "download" };

export type RuntimeMessage =
  /** service worker に offscreen document を用意させる。返事は `EnsureResponse` */
  | { target: "background"; type: "ensureOffscreen" }
  /** 返事は `DbResponse` */
  | { target: "offscreen"; type: "db"; request: DbRequest }
  /** 返事は `DbResponse<ModelStatus>` */
  | { target: "offscreen"; type: "model"; request: ModelRequest }
  /** 返事は `DbResponse<ClipResultOf<R>>`。記憶の依頼は、記憶が終わってから返事をする */
  | { target: "offscreen"; type: "clip"; request: ClipRequest }
  /** offscreen document から拡張機能のすべてのページへ */
  | { target: "ui"; type: "notify"; notification: DbNotification }
  /** offscreen document から拡張機能のすべてのページへ。モデルの状態やダウンロードの進み具合が変わった */
  | { target: "ui"; type: "model"; status: ModelStatus }
  /** offscreen document から拡張機能のすべてのページへ。記憶の進み具合と結果 */
  | { target: "ui"; type: "clip"; event: ClipEvent };

export type EnsureResponse = { ok: true } | DbFailure;

export type MessageTarget = RuntimeMessage["target"];

// runtime.sendMessage は拡張機能のすべてのページに届くので、宛先で自分宛てかを見分ける
export function isMessageFor<T extends MessageTarget>(
  message: unknown,
  target: T,
): message is Extract<RuntimeMessage, { target: T }> {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { target?: unknown }).target === target
  );
}

/**
 * 拡張機能のページからのメッセージか。content script は閲覧中のページの URL で届くので受け付けない。
 * 開発用ページはタブで開くため、`sender.tab` の有無では見分けない
 */
export function isFromExtensionPage(sender: { url?: string }, extensionRoot: string): boolean {
  return sender.url?.startsWith(extensionRoot) ?? false;
}

export function failure(kind: DbFailureKind, message: string): DbFailure {
  return { ok: false, error: { kind, message } };
}

type Envelope = Partial<RelateResult> & { error?: string | null };

function parseEnvelope(json: string): Envelope {
  return JSON.parse(json) as Envelope;
}

function toResult(envelope: Envelope): RelateResult {
  return {
    columns: envelope.columns ?? [],
    rows: envelope.rows ?? [],
    stats: envelope.stats ?? {},
  };
}

/** `execute` が返した JSON 文字列を、成功か失敗に振り分ける */
export function classifyExecute(json: string): DbResponse<RelateResult> {
  const envelope = parseEnvelope(json);
  if (envelope.error) return failure("relate", envelope.error);
  return { ok: true, value: toResult(envelope) };
}

/** `executeScript` の結果を振り分ける。Relate は最初のエラーで止まるので、エラーがあれば全体を失敗にする */
export function classifyScript(jsons: string[]): DbResponse<RelateResult[]> {
  const envelopes = jsons.map(parseEnvelope);
  const failedAt = envelopes.findIndex((e) => e.error);
  const failed = envelopes[failedAt];
  if (failed?.error) {
    return failure("relate", `statement ${failedAt + 1}: ${failed.error}`);
  }
  return { ok: true, value: envelopes.map(toResult) };
}

/**
 * グラフが変わったか。トランザクションが無く、スクリプトは途中で止まっても
 * それまでの文の書き込みが残るので、失敗した結果も含めて数える
 */
export function changedGraph(jsons: string[]): boolean {
  return jsons.some((json) =>
    Object.values(parseEnvelope(json).stats ?? {}).some((count) => count > 0),
  );
}
