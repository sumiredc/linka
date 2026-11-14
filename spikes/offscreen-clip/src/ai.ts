// Prompt API が今いる文脈（offscreen document / side panel）で使えるかを調べ、使えれば小さな抽出を 1 回行う。
declare const LanguageModel: {
  availability(opts?: unknown): Promise<string>;
  create(opts?: unknown): Promise<{ prompt(text: string, opts?: unknown): Promise<string>; destroy(): void }>;
};

const LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const SCHEMA = {
  type: "object",
  properties: {
    concepts: { type: "array", items: { type: "string" }, maxItems: 5 },
    concerns: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["concepts", "concerns"],
  additionalProperties: false,
};

export async function aiCheck(text: string) {
  const out: Record<string, unknown> = { context: location.pathname, hasLanguageModel: typeof LanguageModel !== "undefined" };
  if (!out.hasLanguageModel) return out;
  try {
    out.availability = await LanguageModel.availability(LANG);
    if (out.availability !== "available") return out;
    const start = performance.now();
    const session = await LanguageModel.create(LANG);
    const raw = await session.prompt(`Extract the technical concepts and the concerns from this text:\n\n${text}`, { responseConstraint: SCHEMA });
    session.destroy();
    out.ms = Math.round(performance.now() - start);
    out.result = JSON.parse(raw);
  } catch (e) {
    out.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return out;
}
