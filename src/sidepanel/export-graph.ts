// Export（PRD UC4）。グラフを 1 回の executeScript で読み、Cypher スクリプトにしてファイルとして保存させる
import {
  buildGraphExport,
  EXPORT_FILE_NAME,
  EXPORT_READ_SCRIPT,
  type ExportCounts,
} from "../shared/graph-export";
import type { DbResponse, RelateResult } from "../shared/messages";

export type ExportDeps = {
  readGraph(request: {
    kind: "executeScript";
    script: string;
  }): Promise<DbResponse<RelateResult[]>>;
  save(fileName: string, text: string): void;
};

export type ExportOutcome = { ok: true; counts: ExportCounts } | { ok: false; message: string };

export async function exportGraph(deps: ExportDeps): Promise<ExportOutcome> {
  const response = await deps.readGraph({ kind: "executeScript", script: EXPORT_READ_SCRIPT });
  if (!response.ok) return { ok: false, message: response.error.message };
  try {
    const { script, counts } = buildGraphExport(response.value);
    deps.save(EXPORT_FILE_NAME, script);
    return { ok: true, counts };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

// 保存は Chrome のダウンロードに任せる。chrome.downloads を使わないので downloads の権限は要らない。
// 同じ名前のファイルがあると、Chrome は「linka-export (1).cypher」のように名前を変えて保存する
const REVOKE_AFTER_MS = 60_000;

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // クリックの直後に解放すると、ダウンロードが始まる前に URL が消えることがある
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** グラフにページが無い（読み込み中も含む）なら書き出せない（PRD UC4 の例外フロー） */
export function canExport(view: { totalPages: number } | null): boolean {
  return (view?.totalPages ?? 0) > 0;
}
