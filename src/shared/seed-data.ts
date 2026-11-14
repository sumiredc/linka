import { z } from "zod";
import { claimId } from "./claim-id";
import { type Clip, ClipSchema, ExtractionSchema } from "./extraction";
import type { AddressesLink } from "./graph-statements";
import { normalizeUrl } from "./url";

/**
 * ADDRESSES の端にする Claim を、ページと文で指す。
 * `page` は絶対 URL か、同梱サンプルなら拡張機能の中の相対パス（`samples/…`）。
 */
export const ClaimRefSchema = z.object({
  page: z.string().min(1),
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
 * 拡張機能の ID は環境ごとに変わるので URL は持たず、クリップするときに拡張機能の URL から作る。
 * Nano が無いと UC2 の判定もできないので、デモデータの Claim との ADDRESSES も判定済みで持つ。
 */
export const SampleSchema = z.object({
  path: z.string().regex(/^samples\/[a-z0-9-]+\.html$/),
  title: z.string(),
  extraction: ExtractionSchema,
  addresses: z.array(AddressesRefSchema),
});
export type Sample = z.infer<typeof SampleSchema>;

/** サンプルを、拡張機能の URL（`chrome.runtime.getURL("")`）の下のページとしてクリップにする。 */
export function sampleClip(sample: Sample, extensionBaseUrl: string, clippedAt: string): Clip {
  return {
    url: new URL(sample.path, extensionBaseUrl).href,
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
  baseUrl?: string,
): AddressesLink[] {
  const types = new Map<string, string>();
  for (const clip of clips) {
    for (const claim of clip.extraction.claims) {
      types.set(claimId(clip.url, claim.statement), claim.type);
    }
  }
  const resolve = (ref: ClaimRef, expected: "solution" | "concern") => {
    const page = normalizeUrl(new URL(ref.page, baseUrl).href);
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
