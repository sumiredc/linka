export type OffscreenApi = {
  hasDocument(): Promise<boolean>;
  createDocument(): Promise<void>;
};

/**
 * offscreen document が 1 つだけあるようにする関数を返す。
 * 作れるのは拡張機能ごとに 1 つだけなので、同時に呼ばれても作成は 1 回にまとめる。
 */
export function createOffscreenEnsurer(api: OffscreenApi): () => Promise<void> {
  let pending: Promise<void> | null = null;
  const ensure = async () => {
    if (await api.hasDocument()) return;
    try {
      await api.createDocument();
    } catch (error) {
      // service worker が作り直される前に始めた作成と重なると、既にあるとして失敗する
      if (await api.hasDocument()) return;
      throw error;
    }
  };
  return () => {
    pending ??= ensure().finally(() => {
      pending = null;
    });
    return pending;
  };
}
