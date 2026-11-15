import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type Extraction, ExtractionSchema } from "../shared/extraction";
import type {
  LanguageModelSession,
  LanguageModelStatic,
  PromptOptions,
} from "../shared/prompt-api";
import {
  EXTRACTION_INSTRUCTIONS,
  extractChunk,
  extractPage,
  parseExtractionOutput,
} from "./extract";

const extraction = (fields: Partial<Extraction> = {}): Extraction => ({
  summary: "About OPFS.",
  concepts: [{ name: "OPFS", category: "storage" }],
  authors: [],
  claims: [],
  relatedConcepts: [],
  ...fields,
});

type Answer = string | Error | "hang";

/** 答えを順に返す偽の Prompt API。clone ごとに 1 回だけ prompt を受け付ける */
class FakeModel implements LanguageModelStatic {
  readonly prompts: { input: string; options?: PromptOptions }[] = [];
  readonly createOptions: unknown[] = [];
  clones = 0;
  destroyed = 0;
  baseDestroyed = false;

  constructor(
    private readonly answers: Answer[],
    private readonly state = "available",
  ) {}

  async availability() {
    return this.state;
  }

  async create(options?: unknown): Promise<LanguageModelSession> {
    this.createOptions.push(options);
    return this.session(true);
  }

  private session(isBase: boolean): LanguageModelSession {
    let used = false;
    return {
      prompt: async (input, options) => {
        if (isBase) throw new Error("the base session must not be prompted");
        if (used) throw new Error("kErrorUnknown");
        used = true;
        this.prompts.push({ input, options });
        const answer = this.answers.shift();
        if (answer === undefined) throw new Error("no more answers");
        if (answer === "hang") return new Promise<string>(() => {});
        if (answer instanceof Error) throw answer;
        return answer;
      },
      clone: async () => {
        this.clones++;
        return this.session(false);
      },
      destroy: () => {
        if (isBase) this.baseDestroyed = true;
        else this.destroyed++;
      },
    };
  }
}

const json = (value: unknown) => JSON.stringify(value);

describe("parseExtractionOutput", () => {
  it("accepts JSON that matches the shared schema", () => {
    expect(parseExtractionOutput(json(extraction()))).toEqual({
      ok: true,
      extraction: extraction(),
    });
  });

  it("rejects output that is not JSON", () => {
    expect(parseExtractionOutput("{")).toMatchObject({ ok: false });
  });

  it("rejects JSON with the wrong shape and names the offending field", () => {
    const result = parseExtractionOutput(json({ ...extraction(), claims: "none" }));
    expect(result).toMatchObject({ ok: false, issues: expect.stringContaining("claims") });
  });
});

describe("extractChunk", () => {
  it("passes the shared schema unchanged as the response constraint", async () => {
    const model = new FakeModel([json(extraction())]);
    await extractChunk(await model.create(), "text");
    expect(model.prompts[0]?.options?.responseConstraint).toEqual(z.toJSONSchema(ExtractionSchema));
  });

  it("prompts a fresh clone of the base session and destroys it afterwards", async () => {
    const model = new FakeModel([json(extraction())]);
    const result = await extractChunk(await model.create(), "text");
    expect(result).toEqual({ ok: true, extraction: extraction() });
    expect({ clones: model.clones, destroyed: model.destroyed }).toEqual({
      clones: 1,
      destroyed: 1,
    });
  });

  it("retries once with a new clone when the output has the wrong shape, then succeeds", async () => {
    const model = new FakeModel([json({ summary: 1 }), json(extraction())]);
    const result = await extractChunk(await model.create(), "text");
    expect(result).toEqual({ ok: true, extraction: extraction() });
    expect({ clones: model.clones, destroyed: model.destroyed }).toEqual({
      clones: 2,
      destroyed: 2,
    });
  });

  it("fails with invalidOutput when the output has the wrong shape twice", async () => {
    const model = new FakeModel([json({ summary: 1 }), "not json", json(extraction())]);
    const result = await extractChunk(await model.create(), "text");
    expect(result).toMatchObject({ ok: false, error: { kind: "invalidOutput" } });
    expect(model.prompts).toHaveLength(2);
    expect(model.destroyed).toBe(2);
  });

  it("does not retry when the prompt itself fails", async () => {
    const model = new FakeModel([new Error("kErrorUnknown"), json(extraction())]);
    const result = await extractChunk(await model.create(), "text");
    expect(result).toMatchObject({ ok: false, error: { kind: "prompt" } });
    expect(model.prompts).toHaveLength(1);
    expect(model.destroyed).toBe(1);
  });

  it("gives up on a prompt that does not answer in time and aborts it", async () => {
    const model = new FakeModel(["hang"]);
    const result = await extractChunk(await model.create(), "text", { timeoutMs: 10 });
    expect(result).toMatchObject({ ok: false, error: { kind: "prompt" } });
    expect(model.prompts[0]?.options?.signal?.aborted).toBe(true);
    expect(model.destroyed).toBe(1);
  });
});

describe("extractPage", () => {
  it("extracts every chunk and merges duplicate concepts across chunks", async () => {
    const model = new FakeModel([
      json(extraction({ concepts: [{ name: "WebAssembly", category: "runtime" }] })),
      json(
        extraction({
          concepts: [
            { name: "Wasm", category: "format" },
            { name: "OPFS", category: "storage" },
          ],
        }),
      ),
    ]);
    const result = await extractPage(model, { title: "T", chunks: ["first", "second"] });
    expect(result).toMatchObject({
      ok: true,
      extraction: {
        concepts: [
          { name: "WebAssembly", category: "runtime" },
          { name: "OPFS", category: "storage" },
        ],
      },
    });
    expect(model.prompts.map((p) => p.input)).toEqual([
      "Title: T\nPart 1 of 2 of the page.\n\nfirst",
      "Title: T\nPart 2 of 2 of the page.\n\nsecond",
    ]);
  });

  it("reports each part before extracting it", async () => {
    const model = new FakeModel([json(extraction()), json(extraction())]);
    const parts: string[] = [];
    await extractPage(
      model,
      { title: "T", chunks: ["first", "second"] },
      { onPart: (part, count) => parts.push(`${part}/${count} after ${model.prompts.length}`) },
    );
    expect(parts).toEqual(["1/2 after 0", "2/2 after 1"]);
  });

  it("puts the instructions in the base session that every prompt is cloned from", async () => {
    const model = new FakeModel([json(extraction())]);
    await extractPage(model, { title: "T", chunks: ["text"] });
    expect(model.createOptions[0]).toMatchObject({
      initialPrompts: [{ role: "system", content: EXTRACTION_INSTRUCTIONS }],
    });
    expect(model.baseDestroyed).toBe(true);
  });

  it("tells the model that concept names are bare names", () => {
    expect(EXTRACTION_INSTRUCTIONS).toMatch(/no parentheses, no colons, and no explanation/);
  });

  it("fails the whole page when one chunk fails twice, without prompting the rest", async () => {
    const model = new FakeModel(["bad", "bad", json(extraction())]);
    const result = await extractPage(model, { title: "T", chunks: ["a", "b"] });
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "invalidOutput", message: expect.stringContaining("part 1 of 2") },
    });
    expect(model.prompts).toHaveLength(2);
    expect(model.baseDestroyed).toBe(true);
  });

  it("fails with unavailable without creating a session when the model is unavailable", async () => {
    const model = new FakeModel([], "unavailable");
    const result = await extractPage(model, { title: "T", chunks: ["text"] });
    expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
    expect(model.createOptions).toHaveLength(0);
  });

  it("fails with unavailable when the browser has no Prompt API", async () => {
    const result = await extractPage(null, { title: "T", chunks: ["text"] });
    expect(result).toMatchObject({ ok: false, error: { kind: "unavailable" } });
  });

  it.each(["downloadable", "downloading"])(
    "fails with notReady while the model is %s",
    async (state) => {
      const model = new FakeModel([], state);
      const result = await extractPage(model, { title: "T", chunks: ["text"] });
      expect(result).toMatchObject({ ok: false, error: { kind: "notReady" } });
      expect(model.createOptions).toHaveLength(0);
    },
  );

  it("fails with noText when every chunk is blank", async () => {
    const model = new FakeModel([]);
    const result = await extractPage(model, { title: "T", chunks: ["", "  \n"] });
    expect(result).toMatchObject({ ok: false, error: { kind: "noText" } });
  });
});
