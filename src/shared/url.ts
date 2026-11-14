// 同じ記事を指す URL を 1 つの Page にまとめるため、閲覧の経路で変わる部分だけを除く
const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "twclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "_hsenc",
  "_hsmi",
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAM_NAMES.has(lower);
}

function decodeParamName(rawPair: string): string {
  const rawName = rawPair.split("=", 1)[0] ?? "";
  try {
    return decodeURIComponent(rawName.replace(/\+/g, " "));
  } catch {
    return rawName;
  }
}

/**
 * Page の MERGE キーにする URL を返す。フラグメントと追跡パラメータを除き、
 * スキームとホストの大文字小文字・既定のポートは URL の解析で揃える。
 * 残すパラメータは順序も符号化も元のまま（並べ替えると別のページを指しうるため）。
 */
export function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  url.hash = "";
  // URLSearchParams で組み直すと %20 が + になるなど符号化が変わるので、生の文字列を絞り込む
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !isTrackingParam(decodeParamName(pair)));
  url.search = kept.length > 0 ? `?${kept.join("&")}` : "";
  return url.href;
}
