// サイドパネルが DB とモデルから読む値を、通知に合わせて新しく保つ。React に依存しない部分
import type { DbNotification, DbResponse, RelateResult } from "../shared/messages";
import { GRAPH_VIEW_PARAMS, GRAPH_VIEW_SCRIPT, type GraphView, toGraphView } from "./graph-view";

export type GraphState =
  | { kind: "loading" }
  | { kind: "ready"; view: GraphView }
  | { kind: "failed"; message: string; view: GraphView | null };

export type GraphLoaderDeps = {
  readGraph(request: {
    kind: "executeScript";
    script: string;
    params: Record<string, unknown>;
  }): Promise<DbResponse<RelateResult[]>>;
  subscribe(listener: (notification: DbNotification) => void): () => void;
  onState(update: (previous: GraphState) => GraphState): void;
};

/**
 * グラフを読み、変わったら読み直す。重なったときは最後に頼んだ結果だけを使う。
 * 戻り値の reload は Retry やリセットのあとに呼ぶ
 */
export function startGraphLoader(deps: GraphLoaderDeps): { reload(): void; stop(): void } {
  let latest = 0;
  let stopped = false;
  const reload = () => {
    const ticket = ++latest;
    void deps
      .readGraph({ kind: "executeScript", script: GRAPH_VIEW_SCRIPT, params: GRAPH_VIEW_PARAMS })
      .then((response) => {
        if (stopped || ticket !== latest) return;
        if (response.ok) {
          const view = toGraphView(response.value);
          deps.onState(() => ({ kind: "ready", view }));
        } else {
          const { message } = response.error;
          deps.onState((previous) => ({
            kind: "failed",
            message,
            view: previous.kind === "loading" ? null : previous.view,
          }));
        }
      });
  };
  const unsubscribe = deps.subscribe((notification) => {
    // 開けなかったストアが開き直せたときは graphChanged が来ないので、ここでも読み直す
    if (
      notification.type === "graphChanged" ||
      (notification.type === "storageChanged" &&
        (notification.storage.kind === "opfs" || notification.storage.kind === "memory"))
    ) {
      reload();
    }
  });
  reload();
  return {
    reload,
    stop: () => {
      stopped = true;
      unsubscribe();
    },
  };
}

/**
 * 通知を先に受け始めてから、今の値を尋ねる。尋ねた返事より先に通知が届いていたら、
 * 返事のほうが古いので捨てる。null の返事は使わない
 */
export function watchLatest<T>(deps: {
  subscribe(listener: (value: T) => void): () => void;
  ask(): Promise<T | null>;
  onValue(value: T): void;
}): () => void {
  let notified = false;
  let active = true;
  const unsubscribe = deps.subscribe((value) => {
    notified = true;
    deps.onValue(value);
  });
  void deps.ask().then((answer) => {
    if (active && !notified && answer !== null) deps.onValue(answer);
  });
  return () => {
    active = false;
    unsubscribe();
  };
}
