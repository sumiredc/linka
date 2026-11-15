// デモデータ（seed/demo.cypher）の初回投入で流す Cypher
import type { DbResponse, RelateResult } from "../shared/messages";

/** グラフが空かを確かめる。全件は数えず、1 件でもあるかだけを見る */
export const EMPTINESS_QUERY = "MATCH (n) WITH n LIMIT 1 RETURN count(n) AS nodes";

/**
 * 開いた DB にデモデータを入れるか。空だと確かめられたときだけ入れる。
 * 確かめられなかったときも、利用者のグラフを上書きしないよう入れない
 */
export function shouldSeed(check: DbResponse<RelateResult>): boolean {
  return check.ok && check.value.rows.length === 1 && check.value.rows[0]?.nodes === 0;
}
