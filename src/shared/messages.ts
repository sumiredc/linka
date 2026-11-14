// 画面・service worker・offscreen document の間で chrome.runtime を通して送るメッセージ

export type CypherParams = Record<string, unknown>;

export type DbRequest =
  | { kind: "execute"; query: string; params?: CypherParams }
  | { kind: "executeScript"; script: string; params?: CypherParams }
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
  /** service worker から offscreen document に届かなかった */
  | "relay";

export type DbFailure = { ok: false; error: { kind: DbFailureKind; message: string } };

export type DbResponse<T = unknown> = { ok: true; value: T } | DbFailure;

export type DbResultOf<R extends DbRequest> = R extends { kind: "execute" }
  ? RelateResult
  : R extends { kind: "executeScript" }
    ? RelateResult[]
    : StorageState;

export type DbNotification =
  | { type: "graphChanged" }
  | { type: "storageChanged"; storage: StorageState };

export type RuntimeMessage =
  | { target: "background"; type: "db"; request: DbRequest }
  | { target: "offscreen"; type: "db"; request: DbRequest }
  | { target: "background"; type: "notify"; notification: DbNotification }
  | { target: "ui"; type: "notify"; notification: DbNotification };

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
