/**
 * Person の MERGE キー（そのまま `name` として保存する）。表示にも使うので大文字小文字は変えず、
 * 互換文字（NFKC）と空白の揺れだけを揃える。
 */
export function normalizePersonName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}
