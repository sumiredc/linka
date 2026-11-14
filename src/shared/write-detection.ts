// 質問（UC3）でモデルが書いた Cypher を実行する前に、グラフを変えうる文を見つける。
// 字句に分けてから句のキーワードを探すので、文字列・コメント・バッククォートの名前・
// プロパティ名・マップのキーに同じ綴りがあっても書き込みとはみなさない。
// 迷う形（ラベル式の `|` の後ろ、変数名など）は書き込みとみなす側に倒す。

/** 書き込みの句（GQL の INSERT は Relate 1.0.1 で実際に書き込む）とスキーマ・管理の句。 */
const WRITE_KEYWORDS = new Set([
  "CREATE",
  "MERGE",
  "INSERT",
  "SET",
  "DELETE",
  "DETACH",
  "REMOVE",
  "FOREACH",
  "LOAD",
  "DROP",
  "ALTER",
  "RENAME",
  "GRANT",
  "DENY",
  "REVOKE",
]);

/**
 * 呼んでよい手続き。Relate 1.0.1 の `SHOW PROCEDURES` で mode が READ のうち、グラフの形を読むものだけ。
 * WRITE（`db.createLabel` など）や DBMS（`db.checkpoint` など）の手続きは載せない。
 */
const READ_PROCEDURES = new Set([
  "db.labels",
  "db.relationshiptypes",
  "db.propertykeys",
  "db.schema.visualization",
  "db.schema.nodetypeproperties",
  "db.schema.reltypeproperties",
]);

export type WriteDetection =
  /** 書き込みの句のキーワード（大文字） */
  | { kind: "clause"; keyword: string }
  /** 許していない手続きの呼び出し */
  | { kind: "procedure"; name: string }
  /** 閉じていない文字列・コメント・名前。どこまでが字句か決められないので書き込みとみなす */
  | { kind: "unterminated" };

type Token =
  | { type: "word"; text: string }
  /** バッククォートの名前。text は `` を ` に戻した中身 */
  | { type: "quoted"; text: string }
  | { type: "punct"; text: string }
  | { type: "other" };

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function skipString(source: string, start: number, quote: string): number {
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      i++;
    } else if (char === quote) {
      return i + 1;
    }
  }
  return -1;
}

/** バッククォートの名前を読み、中身と次の位置を返す。閉じていなければ null */
function readQuotedName(source: string, start: number): { text: string; end: number } | null {
  let text = "";
  for (let i = start + 1; i < source.length; i++) {
    const char = source[i] as string;
    if (char !== "`") {
      text += char;
    } else if (source[i + 1] === "`") {
      text += "`";
      i++;
    } else {
      return { text, end: i + 1 };
    }
  }
  return null;
}

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i] as string;
    const next = source[i + 1];
    if (/\s/.test(char)) {
      i++;
    } else if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end + 1;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return null;
      i = end + 2;
    } else if (char === "'" || char === '"') {
      const end = skipString(source, i, char);
      if (end === -1) return null;
      tokens.push({ type: "other" });
      i = end;
    } else if (char === "`") {
      const name = readQuotedName(source, i);
      if (name === null) return null;
      tokens.push({ type: "quoted", text: name.text });
      i = name.end;
    } else if (WORD_CHAR.test(char)) {
      let end = i + 1;
      while (end < source.length && WORD_CHAR.test(source[end] as string)) end++;
      tokens.push({ type: "word", text: source.slice(i, end) });
      i = end;
    } else {
      tokens.push({ type: "punct", text: char });
      i++;
    }
  }
  return tokens;
}

function isPunct(token: Token | undefined, text: string): boolean {
  return token?.type === "punct" && token.text === text;
}

/** プロパティ名（`n.set`）・ラベルや関係の型（`:Set`）・パラメータ（`$set`）・マップのキー（`{set: 1}`） */
function isName(tokens: readonly Token[], index: number): boolean {
  const before = tokens[index - 1];
  return (
    isPunct(before, ".") ||
    isPunct(before, ":") ||
    isPunct(before, "$") ||
    isPunct(tokens[index + 1], ":")
  );
}

/**
 * `CALL` の後ろの手続き名を読む。`CALL {` と `CALL (x) {` の副問い合わせなら null。
 * `` `db.createLabel` `` や `` `db`.`createLabel` `` のようにバッククォートで書かれた部分も名前として読む
 */
function procedureName(tokens: readonly Token[], callIndex: number): string | null {
  const parts: string[] = [];
  for (let i = callIndex + 1; i < tokens.length; i += 2) {
    const token = tokens[i];
    if (token?.type !== "word" && token?.type !== "quoted") break;
    parts.push(token.text);
    if (!isPunct(tokens[i + 1], ".")) break;
  }
  return parts.length > 0 ? parts.join(".") : null;
}

/** 書き込みを含みうるなら、その理由を返す。読むだけの文なら null。 */
export function detectWrite(cypher: string): WriteDetection | null {
  const tokens = tokenize(cypher);
  if (tokens === null) return { kind: "unterminated" };
  for (const [index, token] of tokens.entries()) {
    if (token.type !== "word" || isName(tokens, index)) continue;
    const keyword = token.text.toUpperCase();
    if (WRITE_KEYWORDS.has(keyword)) return { kind: "clause", keyword };
    if (keyword === "CALL") {
      const name = procedureName(tokens, index);
      if (name !== null && !READ_PROCEDURES.has(name.toLowerCase())) {
        return { kind: "procedure", name };
      }
    }
  }
  return null;
}
