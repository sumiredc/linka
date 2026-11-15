import { z } from "zod";
import { claimId } from "./claim-id";
import { type Clip, ClipSchema, ExtractionSchema } from "./extraction";
import type { AddressesLink } from "./graph-statements";
import { normalizeUrl } from "./url";

/** ADDRESSES の端にする Claim を、ページの URL と文で指す。 */
export const ClaimRefSchema = z.object({
  page: z.url(),
  statement: z.string().min(1),
});
export type ClaimRef = z.infer<typeof ClaimRefSchema>;

/** 判定済みの「solution が concern を解決する」組。 */
export const AddressesRefSchema = z.object({
  solution: ClaimRefSchema,
  concern: ClaimRefSchema,
});
export type AddressesRef = z.infer<typeof AddressesRefSchema>;

/** `seed/demo.json` の形。seed・同梱ストア・初回のグラフはすべてここから作る。 */
export const DemoDataSchema = z.object({
  clips: z.array(ClipSchema),
  addresses: z.array(AddressesRefSchema),
});
export type DemoData = z.infer<typeof DemoDataSchema>;

/**
 * 同梱サンプルページ（`samples/<name>.html`）の事前抽出データ（`samples/<name>.json`）。
 * 拡張機能の ID は環境ごとに変わるので、Page の URL には `chrome-extension://` ではなく、
 * どの環境でも同じ `url`（リポジトリにあるそのファイルの URL）を使う。
 * Nano が無いと UC2 の判定もできないので、デモデータの Claim との ADDRESSES も判定済みで持つ。
 */
export const SampleSchema = z.object({
  /** 拡張機能の中でのページの位置。開いているタブがサンプルかどうかはこれで見分ける */
  path: z.string().regex(/^samples\/[a-z0-9-]+\.html$/),
  url: z.url(),
  title: z.string(),
  extraction: ExtractionSchema,
  addresses: z.array(AddressesRefSchema),
});
export type Sample = z.infer<typeof SampleSchema>;

/** サンプルをクリップにする。Page の URL はサンプルの `url` にする。 */
export function sampleClip(sample: Sample, clippedAt: string): Clip {
  return {
    url: sample.url,
    title: sample.title,
    clippedAt,
    source: "sample",
    extraction: sample.extraction,
  };
}

function describeRef(ref: ClaimRef): string {
  return `${ref.page} の「${ref.statement}」`;
}

/**
 * 判定済みの組を Claim の id の組にする。`buildAddressesStatement` は条件に合わない組を黙って飛ばすので、
 * 指す Claim が `clips` に無い・種類が違う・同じページどうし、のどれかなら例外にしてデータの誤りを知らせる。
 */
export function resolveAddresses(
  clips: readonly Clip[],
  refs: readonly AddressesRef[],
): AddressesLink[] {
  const types = new Map<string, string>();
  for (const clip of clips) {
    for (const claim of clip.extraction.claims) {
      types.set(claimId(clip.url, claim.statement), claim.type);
    }
  }
  const resolve = (ref: ClaimRef, expected: "solution" | "concern") => {
    const page = normalizeUrl(ref.page);
    const id = claimId(page, ref.statement);
    const type = types.get(id);
    if (type === undefined) throw new Error(`Claim が見つかりません: ${describeRef(ref)}`);
    if (type !== expected) {
      throw new Error(`${expected} ではなく ${type} です: ${describeRef(ref)}`);
    }
    return { page, id };
  };
  return refs.map((ref) => {
    const solution = resolve(ref.solution, "solution");
    const concern = resolve(ref.concern, "concern");
    if (solution.page === concern.page) {
      throw new Error(`同じページの Claim どうしです: ${describeRef(ref.solution)}`);
    }
    return { solution: solution.id, concern: concern.id };
  });
}
