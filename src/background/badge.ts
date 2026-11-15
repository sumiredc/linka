// ツールバーのアイコンに付ける、記憶済みのページの印（PRD UC1）。どのタブにどの印を付けるかを決める
import { unreadableUrlReason } from "../content/unreadable-url";
import { type ClippedPage, pageUrlOf } from "../shared/clip-status";
import { type DbResponse, isMessageFor } from "../shared/messages";
import { samplePageOf } from "../shared/sample-page";

export type Badge = { text: string; color: string };

/** 記憶済みの印。色はモックの `#action-btn[data-state="saved"]`（--solution） */
export const CLIPPED_BADGE: Badge = { text: "✓", color: "#157a6e" };
export const NO_BADGE: Badge = { text: "", color: "#157a6e" };

export type TabLike = { id?: number; url?: string };

/**
 * 記憶済みかを尋ねる価値のあるタブの URL か。chrome:// などは記憶できないので、
 * 尋ねずに印を消す（offscreen document を起こさない）
 */
export function canBeClipped(tabUrl: string, extensionRoot: string): boolean {
  if (samplePageOf(tabUrl, extensionRoot)) return true;
  // file:// は読めるかどうかを尋ねずに分からないが、記憶済みなら印を付けたいので尋ねる
  return unreadableUrlReason(tabUrl, true) === null;
}

/**
 * タブの更新で印を付け直すか。Chrome は別の文書へ移ると印を消すが、再読み込みでは URL が変わらず
 * `url` が来ないので、読み込みの完了でも付け直す
 */
export function refreshesOnUpdate(changeInfo: { url?: string; status?: string }): boolean {
  return changeInfo.url !== undefined || changeInfo.status === "complete";
}

export type BadgeTrigger =
  /** 記憶が終わった。そのページを表示しているタブだけ付け直す */
  | { kind: "page"; url: string }
  /** グラフが変わった（Reset to demo data など）。どのページの印が変わったか分からないので全タブ */
  | { kind: "all" };

/** offscreen document から拡張機能のすべてのページへの通知のうち、印を付け直すきっかけになるもの */
export function badgeTriggerOf(message: unknown): BadgeTrigger | null {
  if (!isMessageFor(message, "ui")) return null;
  if (message.type === "clip" && message.event.kind === "finished") {
    return { kind: "page", url: message.event.target.url };
  }
  if (message.type === "notify" && message.notification.type === "graphChanged") {
    return { kind: "all" };
  }
  return null;
}

/**
 * 最後に呼ばれてから `ms` 待って 1 回だけ `run` する関数を返す。
 * graphChanged は記憶の書き込みの文ごとに届くので、まとめてから全タブを付け直す
 */
export function debounce(run: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
}

/** isClipped の返事を印にする。返事が失敗なら null（今の印を変えない） */
export function badgeOf(response: DbResponse<ClippedPage | null>): Badge | null {
  if (!response.ok) return null;
  return response.value === null ? NO_BADGE : CLIPPED_BADGE;
}

/** 記憶が終わったページ（Page の URL）を表示しているタブ */
export function tabsShowing(
  tabs: TabLike[],
  pageUrl: string,
  extensionRoot: string,
): { id: number; url: string }[] {
  return tabs.flatMap(({ id, url }) =>
    id !== undefined && url !== undefined && pageUrlOf(url, extensionRoot) === pageUrl
      ? [{ id, url }]
      : [],
  );
}

export type BadgeRefresherOptions = {
  extensionRoot: string;
  isClipped(tabUrl: string): Promise<DbResponse<ClippedPage | null>>;
  setBadge(tabId: number, badge: Badge): Promise<void>;
};

/**
 * タブの印を、今の URL が記憶済みかどうかに合わせる関数を返す。
 * 同じタブで続けて移動すると返事の順が入れ替わりうるので、そのタブで最後に頼んだ分だけを反映する
 */
export function createBadgeRefresher(options: BadgeRefresherOptions) {
  let sequence = 0;
  const latest = new Map<number, number>();
  return async function refreshBadge(tabId: number, tabUrl: string | undefined): Promise<void> {
    sequence += 1;
    const mine = sequence;
    latest.set(tabId, mine);
    try {
      const badge =
        tabUrl !== undefined && canBeClipped(tabUrl, options.extensionRoot)
          ? badgeOf(await options.isClipped(tabUrl))
          : NO_BADGE;
      if (badge === null || latest.get(tabId) !== mine) return;
      await options.setBadge(tabId, badge);
    } finally {
      if (latest.get(tabId) === mine) latest.delete(tabId);
    }
  };
}
