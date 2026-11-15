// 開発用。responseConstraint が受け付けない JSON Schema のキーワードを探すため、キーワードを取り除いた版を作る

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 値が名前ごとのスキーマの表で、キーが利用者の付けた名前のもの。ここではキーを消さない */
const NAME_MAPS = new Set(["properties", "patternProperties", "$defs", "definitions"]);

/** 指定したキーワードを、どの深さにあっても取り除く。`properties` の中のプロパティ名は消さない */
export function stripKeywords(schema: Json, keywords: readonly string[]): Json {
  if (Array.isArray(schema)) return schema.map((item) => stripKeywords(item, keywords));
  if (schema === null || typeof schema !== "object") return schema;
  const result: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(schema)) {
    if (keywords.includes(key)) continue;
    result[key] =
      NAME_MAPS.has(key) && value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, sub]) => [name, stripKeywords(sub, keywords)]),
          )
        : stripKeywords(value, keywords);
  }
  return result;
}

/** スキーマに使われているキーワードの一覧（`properties` の中のプロパティ名は数えない） */
export function listKeywords(schema: Json): string[] {
  const found = new Set<string>();
  const visit = (node: Json) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      found.add(key);
      if (
        NAME_MAPS.has(key) &&
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        Object.values(value).forEach(visit);
      } else {
        visit(value);
      }
    }
  };
  visit(schema);
  return [...found].sort();
}

/** 試す順。そのまま → `$schema` を除く → 長さ・件数の制限を 1 つずつ除く → まとめて除く */
export const SCHEMA_VARIANTS: readonly { label: string; strip: readonly string[] }[] = [
  { label: "そのまま", strip: [] },
  { label: "$schema を除く", strip: ["$schema"] },
  { label: "$schema・minLength を除く", strip: ["$schema", "minLength"] },
  { label: "$schema・maxLength を除く", strip: ["$schema", "maxLength"] },
  { label: "$schema・maxItems を除く", strip: ["$schema", "maxItems"] },
  {
    label: "$schema・minLength・maxLength・maxItems を除く",
    strip: ["$schema", "minLength", "maxLength", "maxItems"],
  },
];

export type { Json };
