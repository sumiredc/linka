// Export（PRD UC4）。保存先を選んでもらい、グラフを 1 回の executeScript で読み、Cypher スクリプトにして保存する
import {
  buildGraphExport,
  EXPORT_FILE_NAME,
  EXPORT_READ_SCRIPT,
  type ExportCounts,
} from "../shared/graph-export";
import type { DbResponse, RelateResult } from "../shared/messages";

/** 書き出しの保存先。選んだファイルに書くか、Chrome のダウンロードに任せるか */
export type SaveTarget = { kind: "file" | "download"; write(text: string): Promise<void> };

export type ExportDeps = {
  readGraph(request: {
    kind: "executeScript";
    script: string;
  }): Promise<DbResponse<RelateResult[]>>;
  /** 保存先を決める。利用者が取り消したら null */
  pickTarget(fileName: string): Promise<SaveTarget | null>;
};

export type ExportOutcome =
  | { ok: true; counts: ExportCounts; savedTo: SaveTarget["kind"] }
  | { ok: false; message: string };

/**
 * 保存先を先に選ぶ。ファイルを選ぶダイアログはクリックの直後でないと開けないので、グラフを読む前に開く。
 * 取り消したら何も読まず何も保存せず、null を返す
 */
export async function exportGraph(deps: ExportDeps): Promise<ExportOutcome | null> {
  const target = await deps.pickTarget(EXPORT_FILE_NAME);
  if (!target) return null;
  const response = await deps.readGraph({ kind: "executeScript", script: EXPORT_READ_SCRIPT });
  if (!response.ok) return { ok: false, message: response.error.message };
  try {
    const { script, counts } = buildGraphExport(response.value);
    await target.write(script);
    return { ok: true, counts, savedTo: target.kind };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

// File System Access API。TypeScript の DOM の型にまだ無いので、使う分だけ書く
type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{
  createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }>;
}>;

/**
 * プロジェクトのフォルダに同じ名前で保存できるよう、保存先を選ぶダイアログを出す。
 * ダイアログが無いか開けない環境では、Chrome のダウンロードに任せる
 */
export async function pickSaveTarget(
  fileName: string,
  picker = (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker,
): Promise<SaveTarget | null> {
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: "Cypher script", accept: { "text/plain": [".cypher"] } }],
      });
      return {
        kind: "file",
        write: async (text) => {
          const file = await handle.createWritable();
          await file.write(text);
          await file.close();
        },
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      // SecurityError などで開けなかったときは、ダウンロードに切り替える
    }
  }
  return {
    kind: "download",
    write: async (text) => downloadText(fileName, text),
  };
}

// chrome.downloads を使わないので downloads の権限は要らない。
// 同じ名前のファイルがあると、Chrome は「linka-export (1).cypher」のように名前を変えて保存する
const REVOKE_AFTER_MS = 60_000;

function downloadText(fileName: string, text: string): void {
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
