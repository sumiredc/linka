import { useEffect, useRef, useState } from "react";
import { askDb, onDbNotification } from "../shared/db";
import type { StorageState } from "../shared/messages";
import { askModel, onModelStatus } from "../shared/model";
import type { ModelStatus } from "../shared/model-status";
import { type GraphState, startGraphLoader, watchLatest } from "./panel-data";

export type { GraphState } from "./panel-data";

/** グラフを読み、`graphChanged` と、ストアが開けたときの `storageChanged` で読み直す */
export function useGraphView(): { graph: GraphState; reload(): void } {
  const [graph, setGraph] = useState<GraphState>({ kind: "loading" });
  const loader = useRef<{ reload(): void } | null>(null);

  useEffect(() => {
    const started = startGraphLoader({
      readGraph: askDb,
      subscribe: onDbNotification,
      onState: setGraph,
    });
    loader.current = started;
    return started.stop;
  }, []);

  return { graph, reload: () => loader.current?.reload() };
}

function useLatest<T>(
  subscribe: (listener: (value: T) => void) => () => void,
  ask: () => Promise<T | null>,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => watchLatest({ subscribe, ask, onValue: setValue }), [subscribe, ask]);
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
