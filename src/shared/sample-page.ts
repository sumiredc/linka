// 拡張機能に同梱したサンプルページ（public/samples/）。本文は読まず、同梱の事前抽出データでクリップする
import { type Clip, ClipSchema } from "./extraction";
import { type AddressesRef, SampleSchema, sampleClip } from "./seed-data";

/** Page の URL にする、リポジトリにある public/ のファイルの URL */
const REPOSITORY_FILES = "https://github.com/sumiredc/linka/blob/main/public/";

const SAMPLE_PATH = /^\/samples\/([a-z0-9-]+)\.html$/;

export type SamplePage = {
  name: string;
  /** 拡張機能の中でのページの位置（`samples/<name>.html`） */
  path: string;
  /** 事前抽出データの URL（`chrome-extension://<id>/samples/<name>.json`） */
  dataUrl: string;
  /** Page の URL。拡張機能の ID は環境ごとに変わるので、リポジトリにあるそのファイルの URL にする */
  url: string;
};

/**
 * 開いているタブがサンプルページなら、その名前と URL を返す。
 * 拡張機能自身のオリジンで、パスが `samples/<name>.html` のときだけサンプルと見なす
 */
export function samplePageOf(tabUrl: string, extensionRoot: string): SamplePage | null {
  let tab: URL;
  let root: URL;
  try {
    tab = new URL(tabUrl);
    root = new URL(extensionRoot);
  } catch {
    return null;
  }
  // chrome-extension: は WHATWG URL では特別なスキームでなく origin が "null" になる環境があるので、スキームとホストで比べる
  if (root.host === "" || tab.protocol !== root.protocol || tab.host !== root.host) return null;
  const name = SAMPLE_PATH.exec(tab.pathname)?.[1];
  if (name === undefined) return null;
  const path = `samples/${name}.html`;
  return {
    name,
    path,
    dataUrl: new URL(`samples/${name}.json`, root).href,
    url: `${REPOSITORY_FILES}${path}`,
  };
}

export type LoadedSample = {
  clip: Clip;
  /** 判定済みの、このサンプルの solution とデモデータの concern の組 */
  addresses: AddressesRef[];
};

/** サンプルの事前抽出データを読み、検証してクリップにする。読めない・形が違うときは例外にする */
export async function loadSample(
  page: SamplePage,
  clippedAt: string,
  fetchFile: (url: string) => Promise<Response> = (url) => fetch(url),
): Promise<LoadedSample> {
  const response = await fetchFile(page.dataUrl);
  if (!response.ok) throw new Error(`${page.dataUrl} を読めません: ${response.status}`);
  const sample = SampleSchema.parse(await response.json());
  if (sample.path !== page.path || sample.url !== page.url) {
    throw new Error(`${page.dataUrl} は ${page.path} の事前抽出データではありません`);
  }
  return { clip: ClipSchema.parse(sampleClip(sample, clippedAt)), addresses: sample.addresses };
}
