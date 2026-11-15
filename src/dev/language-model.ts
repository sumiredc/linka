// 開発用。検証の画面で Prompt API を呼ぶ小物
import {
  LANGUAGES,
  type LanguageModelCreateOptions,
  type LanguageModelSession,
  languageModel,
} from "../shared/prompt-api";

export { LANGUAGES, type LanguageModelSession, languageModel };

export async function createSession(
  options: LanguageModelCreateOptions = {},
): Promise<LanguageModelSession> {
  const api = languageModel();
  if (!api) throw new Error("LanguageModel unavailable: このページに LanguageModel がありません");
  // downloadable・downloading では create がダウンロードを始めるので通す。unavailable だけ先に止める
  const availability = await api.availability(LANGUAGES);
  if (availability === "unavailable") {
    throw new Error(
      "LanguageModel unavailable: availability が unavailable（chrome://on-device-internals を確認）",
    );
  }
  return api.create({ ...LANGUAGES, ...options });
}

export function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Chrome の版。userAgentData が無ければ userAgent を返す */
export async function chromeVersion(): Promise<string> {
  const data = (
    navigator as {
      userAgentData?: {
        getHighEntropyValues(hints: string[]): Promise<{
          fullVersionList?: { brand: string; version: string }[];
          platform?: string;
        }>;
      };
    }
  ).userAgentData;
  if (!data) return navigator.userAgent;
  const values = await data.getHighEntropyValues(["fullVersionList", "platform"]);
  const brands = (values.fullVersionList ?? [])
    .filter((brand) => !brand.brand.includes("Not"))
    .map((brand) => `${brand.brand} ${brand.version}`);
  return `${brands.join(", ")} (${values.platform ?? "?"})`;
}

/** availability・params・Chrome の版を 1 つの文にする（どの検証の出力にも頭に付ける） */
export async function environmentText(): Promise<string> {
  const api = languageModel();
  const lines = [`Chrome: ${await chromeVersion()}`];
  if (!api) return [...lines, "LanguageModel: 無し"].join("\n");
  try {
    lines.push(`availability(en): ${await api.availability(LANGUAGES)}`);
  } catch (error) {
    lines.push(`availability(en): エラー ${errorText(error)}`);
  }
  try {
    // WebIDL の属性はプロトタイプにあり JSON.stringify では出ないので、名前で読む
    const params = (api.params ? await api.params() : null) as Record<string, unknown> | null;
    const keys = ["defaultTopK", "maxTopK", "defaultTemperature", "maxTemperature"];
    lines.push(
      `params: ${params ? keys.map((key) => `${key}=${String(params[key])}`).join(" ") : "無し"}`,
    );
  } catch (error) {
    lines.push(`params: エラー ${errorText(error)}`);
  }
  return lines.join("\n");
}
