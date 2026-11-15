// 記憶（UC1）の依頼・結果・通知の形。吹き出しとサイドパネルが offscreen document とやり取りする
import { type SamplePage, samplePageOf } from "./sample-page";
import { normalizeUrl } from "./url";

/** 記憶する中身。同梱サンプルでは本文を読まず、事前抽出データを使う */
export type ClipBody = { kind: "text"; text: string } | { kind: "sample"; page: SamplePage };

export type ClipRequest =
  /** 返事は `ClipResult`。記憶が終わるまで返事をしない */
  | { kind: "clip"; tabUrl: string; title: string; body: ClipBody }
  /** 返事は `ClipProgress | null`。進行中の記憶が無ければ null */
  | { kind: "current" }
  /** 返事は `ClippedPage | null`。記憶していないページなら null */
  | { kind: "isClipped"; tabUrl: string };

/** 記憶しているページ。`url` は Page の URL（正規化したもの。サンプルではリポジトリの URL） */
export type ClipTarget = { url: string; tabUrl: string; title: string };

export type ClipStage =
  /** 受け付けて、抽出の前の確認やサンプルの読み込みをしている */
  | { kind: "preparing" }
  /** 分割した本文の `part` 番目（1 から）を抽出している */
  | { kind: "extracting"; part: number; parts: number }
  | { kind: "writing" };

export type ClipProgress = { target: ClipTarget; stage: ClipStage };

export type ClipSummary = {
  url: string;
  title: string;
  /** この記憶で抽出した Concept の数 */
  concepts: number;
  /** そのうち、この記憶で初めてグラフに入った Concept の数 */
  newConcepts: number;
  /** この記憶で抽出した Claim の数 */
  claims: number;
  /** Page が初めてグラフに入ったか。false なら記憶し直し */
  newPage: boolean;
  /** この記憶で張った ADDRESSES の数（新しいつながり）。判定（UC2）を行わなかったときは null */
  connections: number | null;
};

export type ClipFailureKind =
  /** URL を解釈できない */
  | "invalidUrl"
  /** chrome:// など、拡張機能がスクリプトを実行できないページ */
  | "unreadable"
  /** 抽出する本文が無い */
  | "noText"
  /** この環境では Gemini Nano が使えない（同梱サンプル以外は記憶できない） */
  | "unavailable"
  /** モデルがまだ入っていない、またはダウンロード中 */
  | "notReady"
  /** 抽出結果が期待する形でなかった（1 回やり直しても） */
  | "invalidOutput"
  /** Prompt API の呼び出しが失敗した、または時間切れ */
  | "prompt"
  /** 同梱サンプルの事前抽出データを読めない */
  | "sample"
  /** 同じページを記憶している最中 */
  | "alreadyClipping"
  /** 別のページを記憶している最中。終わってから押し直してもらう */
  | "busy"
  /** グラフへの書き込みが失敗した */
  | "write";

export type ClipFailure =
  | { kind: Exclude<ClipFailureKind, "busy" | "write">; message: string }
  | { kind: "busy"; message: string; clipping: ClipTarget }
  /**
   * `restored` が true なら、書きかけを消して記憶の前のグラフに戻した。
   * false なら戻せておらず、次の記憶か offscreen document の起動のときにもう一度戻す
   */
  | { kind: "write"; message: string; restored: boolean };

export type ClipResult = { ok: true; summary: ClipSummary } | { ok: false; error: ClipFailure };

export type ClippedPage = { url: string; clippedAt: string | null };

export type ClipResultOf<R extends ClipRequest> = R extends { kind: "clip" }
  ? ClipResult
  : R extends { kind: "current" }
    ? ClipProgress | null
    : ClippedPage | null;

export type ClipEvent =
  | { kind: "progress"; progress: ClipProgress }
  /** 依頼を受け付けた記憶が、成功か失敗で終わった。受け付けなかった依頼（busy など）では送らない */
  | { kind: "finished"; target: ClipTarget; result: ClipResult };

/**
 * タブの URL から、記憶したときの Page の URL を返す。サンプルページはリポジトリの URL になる。
 * URL として読めなければ null
 */
export function pageUrlOf(tabUrl: string, extensionRoot: string): string | null {
  const sample = samplePageOf(tabUrl, extensionRoot);
  if (sample) return sample.url;
  try {
    return normalizeUrl(tabUrl);
  } catch {
    return null;
  }
}
