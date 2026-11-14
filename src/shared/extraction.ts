import { z } from "zod";

// このファイルのスキーマは z.toJSONSchema で Prompt API の responseConstraint にも渡す。
// JSON Schema に素直に移らない書き方（transform・refine・default・optional・union）は使わない。

export const CLAIM_TYPES = ["benefit", "concern", "solution", "fact"] as const;
export const ClaimTypeSchema = z.enum(CLAIM_TYPES);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

/** Page と Claim の由来。`selection` の Claim だけは再クリップでも残す。 */
export const CLIP_SOURCES = ["page", "selection", "sample"] as const;
export const ClipSourceSchema = z.enum(CLIP_SOURCES);
export type ClipSource = z.infer<typeof ClipSourceSchema>;

const ConceptNameSchema = z.string().min(1).max(60);

/** 1 ページ（または選択範囲）から抽出した内容。Concept は名前で参照し、key はコード側で作る。 */
export const ExtractionSchema = z.object({
  summary: z.string().max(600),
  concepts: z
    .array(
      z.object({
        name: ConceptNameSchema,
        category: z.string().min(1).max(40),
      }),
    )
    .max(20),
  authors: z.array(z.string().min(1).max(80)).max(5),
  claims: z
    .array(
      z.object({
        statement: z.string().min(1).max(300),
        type: ClaimTypeSchema,
        concepts: z.array(ConceptNameSchema).max(5),
      }),
    )
    .max(20),
  relatedConcepts: z
    .array(
      z.object({
        from: ConceptNameSchema,
        to: ConceptNameSchema,
      }),
    )
    .max(20),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** グラフに入れる 1 回分のクリップ。seed のデモデータもこの形で書く。 */
export const ClipSchema = z.object({
  url: z.url(),
  title: z.string(),
  /** ISO 8601 の日時。Relate の時刻型にはせず文字列で持つ（パラメータと埋め込みで同じ値にするため） */
  clippedAt: z.iso.datetime(),
  source: ClipSourceSchema,
  extraction: ExtractionSchema,
});
export type Clip = z.infer<typeof ClipSchema>;
