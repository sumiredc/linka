import { normalizeUrl } from "./url";

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/**
 * UTF-8 のバイト列に対する FNV-1a 64 ビット（16 桁の 16 進）。
 * 改ざん耐性は要らず、同じ文から同じ値が出ればよい。Web Crypto の digest は非同期で、
 * MERGE 文の組み立てまで非同期になるので使わない。
 */
export function fnv1a64Hex(text: string): string {
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** ハッシュにかける前の文。空白と互換文字の揺れでは別の Claim にしない。 */
export function normalizeStatement(statement: string): string {
  return statement.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Claim の MERGE キー。正規化した URL にはフラグメントが無いので、`#` の後ろに文のハッシュを付ける。
 */
export function claimId(pageUrl: string, statement: string): string {
  return `${normalizeUrl(pageUrl)}#claim-${fnv1a64Hex(normalizeStatement(statement))}`;
}
