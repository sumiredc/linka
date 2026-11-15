// デモデータ（seed/demo.cypher）の初回投入と「Reset to demo data」で流す Cypher
import type { DbResponse, RelateResult } from "../shared/messages";

/** グラフが空かを確かめる。全件は数えず、1 件でもあるかだけを見る */
export const EMPTINESS_QUERY = "MATCH (n) WITH n LIMIT 1 RETURN count(n) AS nodes";

/**
 * OPFS のストアへの投入の進み具合。Relate にはトランザクションが無く、途中で止まると中身だけでは見分けられないので、
 * グラフの外に残す。pending は投入か Reset のスクリプトを流し始めたところ、done は最後まで流し終えたところ
 */
export type SeedProgress = "pending" | "done";

export type SeedProgressStore = {
  get(): SeedProgress | null;
  set(progress: SeedProgress): void;
};

/**
 * OPFS のストアを開いたときにすること。
 * 記録が無ければ空のときだけ入れ、途中で止まっていたら消して入れ直す。
 * 一度入れ終えたら、利用者が空にしたグラフでも入れない
 */
export function seedPlan(progress: SeedProgress | null): "ifEmpty" | "finish" | "none" {
  if (progress === "pending") return "finish";
  if (progress === "done") return "none";
  return "ifEmpty";
}

/**
 * 開いた DB にデモデータを入れるか。空だと確かめられたときだけ入れる。
 * 確かめられなかったときも、利用者のグラフを上書きしないよう入れない
 */
export function shouldSeed(check: DbResponse<RelateResult>): boolean {
  return check.ok && check.value.rows.length === 1 && check.value.rows[0]?.nodes === 0;
}

/** すべてのノードと関係を消してから seed を入れ直すスクリプト */
export function resetScript(seed: string): string {
  return `MATCH (n) DETACH DELETE n;\n${seed}`;
}

const PROGRESS_KEY = "linka.seedProgress";

/** offscreen document には chrome.storage が無いので localStorage に残す */
export function storedSeedProgress(
  storage: Pick<Storage, "getItem" | "setItem">,
): SeedProgressStore {
  return {
    get: () => {
      const value = storage.getItem(PROGRESS_KEY);
      return value === "pending" || value === "done" ? value : null;
    },
    set: (progress) => storage.setItem(PROGRESS_KEY, progress),
  };
}
