export type CypherValue =
  | string
  | number
  | boolean
  | null
  | readonly CypherValue[]
  | { readonly [key: string]: CypherValue };

/** パラメータ付きの 1 文。拡張機能の中ではこのまま `execute(query, JSON.stringify(params))` に渡す。 */
export interface CypherStatement {
  readonly query: string;
  readonly params: { readonly [name: string]: CypherValue };
}

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * 対になっていないサロゲートを U+FFFD に置き換える（String.prototype.toWellFormed と同じ。
 * tsconfig の lib を es2024 に上げずに使うため自前で持つ）。埋め込みとパラメータで値を揃えるために使う
 */
export function toWellFormed(text: string): string {
  return text.replace(LONE_SURROGATE, "\uFFFD");
}

/** 値の中の文字列（マップのキーも）をすべて {@link toWellFormed} にかける */
export function wellFormedValue<T extends CypherValue>(value: T): T;
export function wellFormedValue(value: CypherValue): CypherValue {
  if (typeof value === "string") return toWellFormed(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(wellFormedValue);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [toWellFormed(key), wellFormedValue(item)]),
  );
}

// Relate 1.0.1 は \n と \t は解釈するが、\r・\b・\f は解釈せずバックスラッシュごと残す。
// そのため \n・\t 以外の制御文字（C0・DEL・C1）と行区切りはすべて \uXXXX で書く
function escapeStringChar(char: string): string {
  switch (char) {
    case "\\":
      return "\\\\";
    case "'":
      return "\\'";
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    default:
      return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  }
}

function quoteString(value: string): string {
  return `'${toWellFormed(value).replace(/[\\'\p{Cc}\u2028\u2029]/gu, escapeStringChar)}'`;
}

function quoteMapKey(key: string): string {
  return SIMPLE_IDENTIFIER.test(key) ? key : `\`${toWellFormed(key).replace(/`/g, "``")}\``;
}

/** 値を Cypher のリテラルにする。パラメータで渡したときと同じ値として読み戻される。 */
export function toCypherLiteral(value: CypherValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return quoteString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cypher に書けない数値です: ${value}`);
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(toCypherLiteral).join(", ")}]`;
  const entries = Object.entries(value as { readonly [key: string]: CypherValue });
  return `{${entries.map(([key, item]) => `${quoteMapKey(key)}: ${toCypherLiteral(item)}`).join(", ")}}`;
}

/**
 * パラメータをリテラルに置き換えた 1 文を返す。
 * `$name` を字句として置き換えるだけなので、文字列リテラルの中に `$` を含まない、
 * このリポジトリで組み立てた query にだけ使う。
 */
export function inlineParameters(statement: CypherStatement): string {
  return statement.query.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    if (!Object.hasOwn(statement.params, name)) {
      throw new Error(`パラメータ $${name} の値がありません`);
    }
    return toCypherLiteral(statement.params[name] as CypherValue);
  });
}

/**
 * 値を埋め込んだ Cypher スクリプト。seed・書き出し・CLI に渡すものはすべてこれで作る。
 * Relate の `executeScript` と CLI は `;` で文を区切る。
 */
export function toCypherScript(statements: readonly CypherStatement[]): string {
  return statements.map((statement) => `${inlineParameters(statement)};\n`).join("");
}
