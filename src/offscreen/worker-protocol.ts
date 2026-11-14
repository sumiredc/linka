// offscreen document と Relate の dedicated worker の間のメッセージ

export type WorkerOp =
  | { op: "open"; mode: "opfs" | "memory"; uri: string }
  | { op: "execute"; query: string; params: string | null }
  | { op: "executeScript"; script: string; params: string | null };

export type WorkerRequest = WorkerOp & { id: number };

export type WorkerResponse =
  // value は execute なら envelope の JSON 文字列、executeScript ならその配列、open なら null
  | { id: number; ok: true; value: string | string[] | null }
  | { id: number; ok: false; message: string; trap: boolean };
