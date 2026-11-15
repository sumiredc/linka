import { useCallback, useEffect, useRef, useState } from "react";
import { askDb, onDbNotification } from "../shared/db";
import type { StorageState } from "../shared/messages";
import { askModel, onModelStatus } from "../shared/model";
import type { ModelStatus } from "../shared/model-status";
import { GRAPH_VIEW_PARAMS, GRAPH_VIEW_SCRIPT, type GraphView, toGraphView } from "./graph-view";

export type GraphState =
  | { kind: "loading" }
  | { kind: "ready"; view: GraphView }
  | { kind: "failed"; message: string; view: GraphView | null };

/** グラフを読み、`graphChanged` の通知のたびに読み直す。重なったときは最後に頼んだ結果だけを使う */
export function useGraphView(): { graph: GraphState; reload(): void } {
  const [graph, setGraph] = useState<GraphState>({ kind: "loading" });
  const latest = useRef(0);

  const reload = useCallback(() => {
    const ticket = ++latest.current;
    void askDb({
      kind: "executeScript",
      script: GRAPH_VIEW_SCRIPT,
      params: GRAPH_VIEW_PARAMS,
    }).then((response) => {
      if (ticket !== latest.current) return;
      if (response.ok) {
        setGraph({ kind: "ready", view: toGraphView(response.value) });
      } else {
        setGraph((previous) => ({
          kind: "failed",
          message: response.error.message,
          view: previous.kind === "loading" ? null : previous.view,
        }));
      }
    });
  }, []);

  useEffect(() => {
    const stop = onDbNotification((notification) => {
      if (notification.type === "graphChanged") reload();
    });
    reload();
    return stop;
  }, [reload]);

  return { graph, reload };
}

/**
 * 通知を先に受け始めてから、今の値を尋ねる。尋ねた返事より先に通知が届いていたら、
 * 返事のほうが古いので捨てる
 */
function useLatest<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  ask: () => Promise<T | null>,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let notified = false;
    let active = true;
    const stop = subscribe((next) => {
      notified = true;
      setValue(next);
    });
    void ask().then((answer) => {
      if (active && !notified && answer !== null) setValue(answer);
    });
    return () => {
      active = false;
      stop();
    };
  }, [subscribe, ask]);
  return value;
}

const subscribeStorage = (listener: (storage: StorageState) => void) =>
  onDbNotification((notification) => {
    if (notification.type === "storageChanged") listener(notification.storage);
  });
const askStorage = async () => {
  const response = await askDb({ kind: "status" });
  return response.ok ? response.value : null;
};

/** グラフの保存先（OPFS かメモリか、開けないか） */
export function useStorage(): StorageState | null {
  return useLatest(subscribeStorage, askStorage);
}

const askModelStatus = async (): Promise<ModelStatus | null> => {
  const response = await askModel({ kind: "status" });
  return response.ok
    ? response.value
    : {
        kind: "unavailable",
        reason: `the offscreen document did not answer: ${response.error.message}`,
      };
};

/** Gemini Nano の状態。ダウンロードの進み具合も通知で受け取る */
export function useModelStatus(): ModelStatus | null {
  return useLatest(onModelStatus, askModelStatus);
}
