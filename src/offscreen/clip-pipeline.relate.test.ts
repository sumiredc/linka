import type { RelateDb } from "@relate/relate-wasm";
import { describe, expect, it, vi } from "vitest";
import sampleJson from "../../public/samples/keep-offline-data.json?raw";
import seed from "../../seed/demo.cypher?raw";
import { CHUNK_MAX_CHARS } from "../shared/chunk-text";
import { claimId } from "../shared/claim-id";
import type { ClipBody, ClipEvent, ClipResult } from "../shared/clip-status";
import type { CypherStatement } from "../shared/cypher";
import type { Extraction } from "../shared/extraction";
import { buildAddressesStatement, buildClipStatements } from "../shared/graph-statements";
import { classifyExecute, failure } from "../shared/messages";
import type { LanguageModelSession, LanguageModelStatic } from "../shared/prompt-api";
import { samplePageOf } from "../shared/sample-page";
import { openMemoryDb, run, runScript, runStatements } from "../shared/test/relate-node";
import { ClipPipeline } from "./clip-pipeline";
import type { ClipDb, PendingUndo, UndoJournal } from "./clip-undo";

// 記憶の処理本体を、本物の Relate（Node 上のメモリ DB）と偽の Prompt API で確かめる

const ROOT = "chrome-extension://abcdefghijklmnop/";
const PAGE = "https://relate.example/blog/graph-in-the-browser";
const OTHER = "https://other.example/notes";
const MDN_OPFS =
  "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system";
const MDN_CONCERN =
  "The synchronous OPFS file calls, such as those on a sync access handle, can run only inside web workers, not on the main thread.";

const SAMPLE_TAB = `${ROOT}samples/keep-offline-data.html`;
const SAMPLE_URL =
  "https://github.com/sumiredc/linka/blob/main/public/samples/keep-offline-data.html";

function extraction(fields: Partial<Extraction> = {}): Extraction {
  return { summary: "", concepts: [], authors: [], claims: [], relatedConcepts: [], ...fields };
}

// 既存の Concept（OPFS・IndexedDB）と Person（Martin Kleppmann）にもつながる、1 回目の抽出
const FIRST = extraction({
  summary: "A graph database in the browser.",
  concepts: [
    { name: "OPFS", category: "storage" },
    { name: "Relate", category: "database" },
  ],
  authors: ["Martin Kleppmann", "Ada Writer"],
  claims: [
    {
      statement: "Relate keeps the graph in OPFS from a dedicated worker.",
      type: "solution",
      concepts: ["Relate", "OPFS"],
    },
    {
      statement: "Only one context can open the store at a time.",
      type: "concern",
      concepts: ["Relate", "Store lock"],
    },
  ],
  relatedConcepts: [
    { from: "Relate", to: "OPFS" },
    { from: "OPFS", to: "IndexedDB" },
  ],
});

// 記憶し直したときの抽出。1 回目と同じ文の Claim を 1 つ含む。
// 分類の無い既存の Concept（Web storage）に分類を付け、既存の Concept どうしに新しい RELATED_TO を張る
const SECOND = extraction({
  summary: "Rewritten.",
  concepts: [
    { name: "Relate", category: "database" },
    { name: "Web storage", category: "storage" },
  ],
  claims: [
    {
      statement: "Only one context can open the store at a time.",
      type: "concern",
      concepts: ["Relate"],
    },
    { statement: "Relate 1.0 has no transactions.", type: "fact", concepts: ["Relate"] },
  ],
  relatedConcepts: [{ from: "OPFS", to: "CRDT" }],
});

type Answer = string | Error | Promise<string>;

/** 答えを順に返す偽の Prompt API。`state` は availability の答え */
class FakeModel implements LanguageModelStatic {
  prompts = 0;

  constructor(
    private readonly answers: Answer[],
    public state = "available",
  ) {}

  async availability() {
    return this.state;
  }

  async create(): Promise<LanguageModelSession> {
    const session: LanguageModelSession = {
      prompt: async () => {
        this.prompts++;
        const answer = this.answers.shift();
        if (answer === undefined) throw new Error("no more answers");
        if (answer instanceof Error) throw answer;
        return answer;
      },
      clone: async () => session,
      destroy: () => {},
    };
    return session;
  }
}

const answer = (value: Extraction) => JSON.stringify(value);

type Fault = { write: number; when: "before" | "after" | "throws" };

const WRITE = /\b(MERGE|CREATE|SET|DELETE)\b/;

/**
 * 本物の Relate に流す DB。`faults` に入れると、その番目（1 から）の書き込みの文を失敗させる。
 * before は流さずに失敗し、after は流してから失敗する（書き込みが残ったまま時間切れになったときと同じ）。
 * throws は流さずに例外を投げる。
 * `down` の間は、すべての文が失敗する
 */
function testDb(db: RelateDb) {
  const state = {
    faults: [] as Fault[],
    writes: 0,
    down: false,
    /** 書き込みの文を流す直前に呼ぶ。Promise を返すと、それが終わるまで流さない */
    beforeWrite: null as ((write: number, query: string) => Promise<void> | undefined) | null,
  };
  const execute: ClipDb["execute"] = async (statement: CypherStatement) => {
    if (state.down) return failure("unavailable", "the database is down");
    const isWrite = WRITE.test(statement.query);
    if (isWrite) state.writes++;
    if (isWrite) await state.beforeWrite?.(state.writes, statement.query);
    const fault = isWrite ? state.faults.find((f) => f.write === state.writes) : undefined;
    const hit = fault !== undefined;
    if (hit && fault.when === "before") return failure("relate", "injected failure");
    if (hit && fault.when === "throws") throw new Error("injected exception");
    const response = classifyExecute(db.execute(statement.query, JSON.stringify(statement.params)));
    if (hit) return failure("timeout", "injected failure after the write");
    return response;
  };
  return { state, execute };
}

function memoryJournal(): UndoJournal & { value: PendingUndo | null } {
  const journal = {
    value: null as PendingUndo | null,
    get: () => journal.value,
    set: (undo: PendingUndo) => {
      journal.value = undo;
    },
    clear: () => {
      journal.value = null;
    },
  };
  return journal;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** グラフの全ノードと全関係を、順序によらない形で取り出す */
function dump(db: RelateDb) {
  const nodes = run(db, "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props").rows;
  const rels = run(
    db,
    "MATCH (a)-[r]->(b) RETURN type(r) AS type, properties(a) AS a, properties(b) AS b",
  ).rows;
  return { nodes: nodes.map(stable).sort(), rels: rels.map(stable).sort() };
}

function count(db: RelateDb, query: string, params?: CypherStatement["params"]): number {
  return Number(run(db, query, params).rows[0]?.n);
}

function setup(options: { model?: LanguageModelStatic | null; seeded?: boolean } = {}) {
  const db = openMemoryDb();
  if (options.seeded ?? true) runScript(db, seed);
  const conn = testDb(db);
  const journal = memoryJournal();
  const events: ClipEvent[] = [];
  let model = options.model === undefined ? new FakeModel([]) : options.model;
  let clock = 0;
  const pipeline = (j: UndoJournal = journal) =>
    new ClipPipeline({
      db: conn,
      api: () => model,
      journal: j,
      extensionRoot: ROOT,
      onEvent: (event) => events.push(event),
      now: () => new Date(Date.UTC(2026, 10, 15, 9, 0, clock++)).toISOString(),
      fetchFile: async (url) =>
        url === `${ROOT}samples/keep-offline-data.json`
          ? new Response(sampleJson)
          : new Response("", { status: 404 }),
    });
  return {
    db,
    conn,
    journal,
    events,
    pipeline: pipeline(),
    restart: pipeline,
    setModel: (next: LanguageModelStatic | null) => {
      model = next;
    },
  };
}

const text = (body = "Some article text."): ClipBody => ({ kind: "text", text: body });

function sampleBody(): ClipBody {
  const page = samplePageOf(SAMPLE_TAB, ROOT);
  if (!page) throw new Error("not a sample page");
  return { kind: "sample", page };
}

function expectFailure(result: ClipResult, kind: string) {
  expect(result).toMatchObject({ ok: false, error: { kind } });
}

describe("UC1 exception flows leave the graph unchanged", () => {
  it("refuses a page that is not a sample when the Prompt API is missing", async () => {
    const t = setup({ model: null });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text()), "unavailable");
    expect(dump(t.db)).toEqual(before);
  });

  it("refuses a page that is not a sample when the model is unavailable", async () => {
    const t = setup({ model: new FakeModel([], "unavailable") });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text()), "unavailable");
    expect(dump(t.db)).toEqual(before);
  });

  it.each(["downloadable", "downloading"])("does not clip while the model is %s", async (state) => {
    const model = new FakeModel([answer(FIRST)], state);
    const t = setup({ model });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text()), "notReady");
    expect(model.prompts).toBe(0);
    expect(dump(t.db)).toEqual(before);
  });

  it("refuses a page that extensions cannot run scripts on", async () => {
    const model = new FakeModel([answer(FIRST)]);
    const t = setup({ model });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip("chrome://settings/", "Settings", text()), "unreadable");
    expect(model.prompts).toBe(0);
    expect(dump(t.db)).toEqual(before);
  });

  it("refuses a page with no text", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text(" \n ")), "noText");
    expect(dump(t.db)).toEqual(before);
  });

  it("refuses a URL it cannot parse", async () => {
    const t = setup();
    expectFailure(await t.pipeline.clip("not a url", "T", text()), "invalidUrl");
  });

  it("fails without writing when the output has the wrong shape twice", async () => {
    const t = setup({ model: new FakeModel(["{}", "not json"]) });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text()), "invalidOutput");
    expect(dump(t.db)).toEqual(before);
  });

  it("fails without writing when the Prompt API call fails", async () => {
    const t = setup({ model: new FakeModel([new Error("kErrorUnknown")]) });
    const before = dump(t.db);
    expectFailure(await t.pipeline.clip(PAGE, "T", text()), "prompt");
    expect(dump(t.db)).toEqual(before);
  });

  it("fails when the sample's pre-extracted data cannot be read", async () => {
    const t = setup({ model: null });
    const before = dump(t.db);
    const body = sampleBody();
    if (body.kind !== "sample") throw new Error("unreachable");
    const missing: ClipBody = {
      kind: "sample",
      page: { ...body.page, dataUrl: `${ROOT}samples/missing.json` },
    };
    expectFailure(await t.pipeline.clip(SAMPLE_TAB, "Sample", missing), "sample");
    expect(dump(t.db)).toEqual(before);
  });
});

describe("clipping a page", () => {
  it("writes the page and reports what it clipped", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    const result = await t.pipeline.clip(`${PAGE}?utm_source=feed#top`, "Graph", text());
    expect(result).toEqual({
      ok: true,
      summary: {
        url: PAGE,
        title: "Graph",
        concepts: 4,
        newConcepts: 2,
        claims: 2,
        newPage: true,
        connections: null,
      },
    });
    expect(count(t.db, "MATCH (p:Page {url: $url}) RETURN count(p) AS n", { url: PAGE })).toBe(1);
    expect(t.journal.value).toBeNull();
  });

  it("keeps one Page and only the second run's page-level Claims when clipped twice", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST), answer(SECOND)]) });
    expect(await t.pipeline.clip(PAGE, "Graph", text())).toMatchObject({ ok: true });
    const second = await t.pipeline.clip(`${PAGE}#again`, "Graph v2", text());
    expect(second).toMatchObject({ ok: true, summary: { newPage: false, claims: 2 } });

    expect(count(t.db, "MATCH (p:Page {url: $url}) RETURN count(p) AS n", { url: PAGE })).toBe(1);
    const statements = run(
      t.db,
      "MATCH (:Page {url: $url})-[:ASSERTS]->(c:Claim) RETURN c.statement AS s ORDER BY s",
      { url: PAGE },
    ).rows.map((row) => row.s);
    expect(statements).toEqual(SECOND.claims.map((claim) => claim.statement).sort());
    const mentions = run(
      t.db,
      "MATCH (:Page {url: $url})-[:MENTIONS]->(k:Concept) RETURN k.key AS key ORDER BY key",
      { url: PAGE },
    ).rows.map((row) => row.key);
    expect(mentions).toEqual(["crdt", "opfs", "relate", "webstorage"]);
    expect(
      count(t.db, "MATCH (:Page {url: $url})-[:AUTHORED_BY]->() RETURN count(*) AS n", {
        url: PAGE,
      }),
    ).toBe(0);
  });

  it("does not change the claims of other pages", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST), answer(SECOND)]) });
    const others = () =>
      run(
        t.db,
        "MATCH (p:Page)-[:ASSERTS]->(c:Claim) WHERE p.url <> $url RETURN properties(c) AS c",
        { url: PAGE },
      ).rows.map(stable);
    const before = others().sort();
    await t.pipeline.clip(PAGE, "Graph", text());
    await t.pipeline.clip(PAGE, "Graph", text());
    expect(others().sort()).toEqual(before);
  });

  it("tells the UI how the clip progresses and how it ended", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST), answer(FIRST)]) });
    await t.pipeline.clip(
      PAGE,
      "Graph",
      text(`${"a".repeat(CHUNK_MAX_CHARS - 1_000)}\n\n${"b".repeat(CHUNK_MAX_CHARS - 1_000)}`),
    );
    expect(
      t.events.map((event) => (event.kind === "progress" ? event.progress.stage : event.kind)),
    ).toEqual([
      { kind: "preparing" },
      { kind: "extracting", part: 1, parts: 2 },
      { kind: "extracting", part: 2, parts: 2 },
      { kind: "writing" },
      "finished",
    ]);
    expect(t.events.at(-1)).toMatchObject({
      kind: "finished",
      target: { url: PAGE, tabUrl: PAGE, title: "Graph" },
      result: { ok: true },
    });
  });

  it("tells the UI when a clip it accepted failed", async () => {
    const t = setup({ model: null });
    const result = await t.pipeline.clip(PAGE, "Graph", text());
    expect(t.events.at(-1)).toEqual({
      kind: "finished",
      target: { url: PAGE, tabUrl: PAGE, title: "Graph" },
      result,
    });
  });
});

describe("a sample page", () => {
  it("clips from the pre-extracted data without Gemini Nano and links its ADDRESSES", async () => {
    const t = setup({ model: null });
    const result = await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody());
    expect(result).toMatchObject({
      ok: true,
      summary: { url: SAMPLE_URL, newPage: true, claims: 3, connections: 2 },
    });
    const links = run(
      t.db,
      [
        "MATCH (sp:Page)-[:ASSERTS]->(s:Claim)-[:ADDRESSES]->(c:Claim)<-[:ASSERTS]-(cp:Page)",
        "WHERE sp.url = $url OR cp.url = $url",
        "RETURN sp.url AS solution, cp.url AS concern",
      ].join("\n"),
      { url: SAMPLE_URL },
    ).rows;
    expect(links).toHaveLength(2);
    expect(
      run(t.db, "MATCH (p:Page {url: $url}) RETURN p.source AS s", { url: SAMPLE_URL }).rows,
    ).toEqual([{ s: "sample" }]);
  });

  it("does not ask the model even when Gemini Nano is available", async () => {
    const model = new FakeModel([answer(FIRST)]);
    const t = setup({ model });
    expect(await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody())).toMatchObject({ ok: true });
    expect(model.prompts).toBe(0);
  });

  it("skips the links whose other end is not in the graph", async () => {
    const t = setup({ model: null, seeded: false });
    expect(await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody())).toMatchObject({
      ok: true,
      summary: { connections: 0 },
    });
  });

  it("keeps the same ADDRESSES when clipped again", async () => {
    const t = setup({ model: null });
    await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody());
    const once = dump(t.db);
    const again = await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody());
    expect(again).toMatchObject({ ok: true, summary: { newPage: false, connections: 2 } });
    const strip = (rows: string[]) => rows.map((row) => row.replace(/"clippedAt":"[^"]*"/, ""));
    expect(strip(dump(t.db).nodes)).toEqual(strip(once.nodes));
    expect(strip(dump(t.db).rels)).toEqual(strip(once.rels));
  });
});

describe("is this URL clipped?", () => {
  it("answers for the page URL the tab maps to", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    expect(await t.pipeline.isClipped(PAGE)).toEqual({ ok: true, value: null });
    await t.pipeline.clip(PAGE, "Graph", text());
    expect(await t.pipeline.isClipped(`${PAGE}?utm_medium=x#y`)).toEqual({
      ok: true,
      value: { url: PAGE, clippedAt: "2026-11-15T09:00:00.000Z" },
    });
  });

  it("maps a sample tab to its repository URL", async () => {
    const t = setup({ model: null });
    await t.pipeline.clip(SAMPLE_TAB, "ignored", sampleBody());
    expect(await t.pipeline.isClipped(SAMPLE_TAB)).toMatchObject({
      ok: true,
      value: { url: SAMPLE_URL },
    });
  });

  it("answers no for a tab URL that is not a URL", async () => {
    const t = setup();
    expect(await t.pipeline.isClipped("")).toEqual({ ok: true, value: null });
  });
});

describe("one clip at a time", () => {
  function deferred() {
    let resolve: (value: string) => void = () => {};
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("refuses a second clip of the same URL while the first is running", async () => {
    const pending = deferred();
    const model = new FakeModel([pending.promise, answer(SECOND)]);
    const t = setup({ model });
    const first = t.pipeline.clip(PAGE, "Graph", text());
    const second = await t.pipeline.clip(`${PAGE}#other-fragment`, "Graph", text());
    expectFailure(second, "alreadyClipping");
    expect(t.pipeline.current()).toMatchObject({ target: { url: PAGE } });

    pending.resolve(answer(FIRST));
    expect(await first).toMatchObject({ ok: true });
    expect(t.pipeline.current()).toBeNull();
    expect(await t.pipeline.clip(PAGE, "Graph", text())).toMatchObject({ ok: true });
    // 断った依頼は記憶として扱わないので、終わったという通知も送らない
    expect(t.events.filter((event) => event.kind === "finished")).toHaveLength(2);
  });

  it("refuses a clip of another URL and says which page is being clipped", async () => {
    const pending = deferred();
    const t = setup({ model: new FakeModel([pending.promise]) });
    const first = t.pipeline.clip(PAGE, "Graph", text());
    const other = await t.pipeline.clip(OTHER, "Notes", text());
    expect(other).toMatchObject({
      ok: false,
      error: { kind: "busy", clipping: { url: PAGE, title: "Graph" } },
    });
    pending.resolve(answer(FIRST));
    await first;
    expect(count(t.db, "MATCH (p:Page {url: $url}) RETURN count(p) AS n", { url: OTHER })).toBe(0);
  });
});

describe("a write that fails partway", () => {
  /** 書き込みの文の数を、失敗させずに 1 度流して数える */
  async function writesOf(prepare: (t: ReturnType<typeof setup>) => Promise<void>, body: Answer) {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    await prepare(t);
    t.setModel(new FakeModel([body]));
    const start = t.conn.state.writes;
    expect(await t.pipeline.clip(PAGE, "Graph", text())).toMatchObject({ ok: true });
    return t.conn.state.writes - start;
  }

  const firstClip = async (t: ReturnType<typeof setup>) => {
    await t.pipeline.clip(PAGE, "Graph", text());
    // 選択範囲の Claim と、別のページへの ADDRESSES も、元どおりに戻ることを確かめる
    runStatements(
      t.db,
      buildClipStatements({
        url: PAGE,
        title: "ignored",
        clippedAt: "2026-11-15T10:00:00Z",
        source: "selection",
        extraction: extraction({
          claims: [{ statement: "Picked by the user.", type: "benefit", concepts: ["Relate"] }],
        }),
      }),
    );
    // サンプルの事前抽出データは Claim だけが名指す Concept を分類なしで入れる
    runStatements(
      t.db,
      buildClipStatements({
        url: OTHER,
        title: "Other",
        clippedAt: "2026-11-15T10:00:00Z",
        source: "sample",
        extraction: extraction({
          claims: [{ statement: "Quota is shared.", type: "fact", concepts: ["Web storage"] }],
        }),
      }),
    );
    runStatements(t.db, [
      buildAddressesStatement([
        {
          solution: claimId(PAGE, "Relate keeps the graph in OPFS from a dedicated worker."),
          concern: claimId(MDN_OPFS, MDN_CONCERN),
        },
      ]),
    ]);
  };

  const scenarios = [
    { name: "a new page", prepare: async () => {} },
    { name: "a page clipped before", prepare: firstClip },
  ];

  for (const scenario of scenarios) {
    for (const when of ["before", "after", "throws"] as const) {
      it(`leaves nothing from ${scenario.name} when any write fails ${when} it runs`, async () => {
        const writes = await writesOf(scenario.prepare, answer(SECOND));
        expect(writes).toBeGreaterThan(3);
        for (let write = 1; write <= writes; write++) {
          const t = setup({ model: new FakeModel([answer(FIRST)]) });
          await scenario.prepare(t);
          const before = dump(t.db);
          t.setModel(new FakeModel([answer(SECOND)]));
          t.conn.state.faults = [{ write: t.conn.state.writes + write, when }];

          const result = await t.pipeline.clip(PAGE, "Graph", text());
          expect(result, `write ${write}`).toMatchObject({
            ok: false,
            error: { kind: "write", restored: true },
          });
          expect(dump(t.db), `write ${write}`).toEqual(before);
          expect(t.journal.value).toBeNull();
        }
        // 書き込みの数だけ Relate を作り直すので、CI の runner が混むと既定の 5 秒を超える
      }, 30_000);
    }
  }

  it("keeps the undo when it cannot run, and runs it when the pipeline starts again", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    const before = dump(t.db);
    t.conn.state.faults = [{ write: 3, when: "after" }];
    const original = t.conn.execute;
    // 失敗した書き込みのあと、DB が使えなくなる（offscreen document が閉じたときと同じく、取り消せない）
    t.conn.execute = async (statement) => {
      const response = await original(statement);
      if (!response.ok) t.conn.state.down = true;
      return response;
    };
    const result = await t.pipeline.clip(PAGE, "Graph", text());
    expect(result).toMatchObject({ ok: false, error: { kind: "write", restored: false } });
    expect(t.journal.value).not.toBeNull();
    expect(dump(t.db)).not.toEqual(before);

    t.conn.state.down = false;
    t.restart();
    await vi.waitFor(() => expect(t.journal.value).toBeNull());
    expect(dump(t.db)).toEqual(before);
  });

  it("answers that a page is not clipped while its failed write is being undone", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    t.conn.state.faults = [{ write: 3, when: "after" }];
    const original = t.conn.execute;
    t.conn.execute = async (statement) => {
      const response = await original(statement);
      if (!response.ok) t.conn.state.down = true;
      return response;
    };
    await t.pipeline.clip(PAGE, "Graph", text());
    t.conn.state.down = false;
    expect(await t.restart().isClipped(PAGE)).toEqual({ ok: true, value: null });
  });

  it("runs the undo again when one of its statements fails", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    const before = dump(t.db);
    // 2 番目の書き込みで失敗し、取り消しの最初の文（3 番目の書き込み）も失敗する
    t.conn.state.faults = [
      { write: 2, when: "before" },
      { write: 3, when: "before" },
    ];
    const result = await t.pipeline.clip(PAGE, "Graph", text());
    expect(result).toMatchObject({ ok: false, error: { kind: "write", restored: true } });
    expect(dump(t.db)).toEqual(before);
  });

  it("tries the undo left from before again when the next clip writes", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    runStatements(t.db, [{ query: "CREATE (:Page {url: $url})", params: { url: OTHER } }]);
    t.journal.set({
      url: OTHER,
      statements: [{ query: "MATCH (p:Page {url: $url}) DETACH DELETE p", params: { url: OTHER } }],
    });
    t.conn.state.down = true;
    const restarted = t.restart();
    t.conn.state.down = false;
    expect(await restarted.clip(PAGE, "Graph", text())).toMatchObject({ ok: true });
    expect(count(t.db, "MATCH (p:Page {url: $url}) RETURN count(p) AS n", { url: OTHER })).toBe(0);
    expect(t.journal.value).toBeNull();
  });

  it("does not write while an undo left from before cannot run", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    const before = dump(t.db);
    t.journal.set({ url: OTHER, statements: [{ query: "THIS IS NOT CYPHER", params: {} }] });
    const result = await t.restart().clip(PAGE, "Graph", text());
    expect(result).toMatchObject({ ok: false, error: { kind: "write", restored: false } });
    expect(dump(t.db)).toEqual(before);
    expect(t.journal.value).not.toBeNull();
  });
});

/** 書き込みの途中で DB が使えなくなり、取り消しが残ったままになる */
async function leaveUndo(t: ReturnType<typeof setup>) {
  t.conn.state.faults = [{ write: t.conn.state.writes + 3, when: "after" }];
  const original = t.conn.execute;
  t.conn.execute = async (statement) => {
    const response = await original(statement);
    if (!response.ok) t.conn.state.down = true;
    return response;
  };
  const result = await t.pipeline.clip(PAGE, "Graph", text());
  expect(result).toMatchObject({ ok: false, error: { kind: "write", restored: false } });
  t.conn.execute = original;
  t.conn.state.down = false;
}

/** Reset to demo data と同じく、グラフをすべて消してデモデータを入れ直す */
function resetToDemo(t: ReturnType<typeof setup>) {
  return async () => {
    runScript(t.db, `MATCH (n) DETACH DELETE n;\n${seed}`);
    return { ok: true as const, value: [] };
  };
}

function demoDump() {
  const db = openMemoryDb();
  runScript(db, seed);
  return dump(db);
}

describe("the undo of a clip being written", () => {
  it("is not run by an isClipped asked in the middle of the write", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    let asked: Promise<unknown> | null = null;
    t.conn.state.beforeWrite = (write) => {
      if (write === 2) asked = t.pipeline.isClipped(PAGE);
      return undefined;
    };
    expect(await t.pipeline.clip(PAGE, "Graph", text())).toMatchObject({ ok: true });
    await asked;
    expect(count(t.db, "MATCH (p:Page {url: $url}) RETURN count(p) AS n", { url: PAGE })).toBe(1);
    expect(
      count(t.db, "MATCH (:Page {url: $url})-[:ASSERTS]->() RETURN count(*) AS n", { url: PAGE }),
    ).toBe(FIRST.claims.length);
    expect(t.journal.value).toBeNull();
  });
});

describe("replacing the whole graph", () => {
  it("drops an undo read from the graph it replaces", async () => {
    // 空のグラフで書きかけになったので、取り消しは opfs などの Concept を「新しく入れたもの」として消す
    const t = setup({ model: new FakeModel([answer(FIRST)]), seeded: false });
    await leaveUndo(t);
    expect(await t.pipeline.replaceGraph(resetToDemo(t))).toMatchObject({ ok: true });
    expect(t.journal.value).toBeNull();
    expect(await t.restart().isClipped(PAGE)).toEqual({ ok: true, value: null });
    expect(dump(t.db)).toEqual(demoDump());
  });

  it("waits for an undo that is running before it replaces the graph", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]), seeded: false });
    await leaveUndo(t);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holding = false;
    t.conn.state.beforeWrite = () => {
      if (holding) return undefined;
      holding = true;
      return held;
    };
    const restarted = t.restart();
    await vi.waitFor(() => expect(holding).toBe(true));
    const reset = restarted.replaceGraph(resetToDemo(t));
    release();
    expect(await reset).toMatchObject({ ok: true });
    // 取り消しが走り終わるのを待ってから見る
    await restarted.isClipped(PAGE);
    expect(dump(t.db)).toEqual(demoDump());
  });

  it("is refused while a page is being clipped", async () => {
    let resolve: (value: string) => void = () => {};
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    const t = setup({ model: new FakeModel([pending]) });
    const clipping = t.pipeline.clip(PAGE, "Graph in the browser", text());
    let ran = false;
    const reset = await t.pipeline.replaceGraph(async () => {
      ran = true;
      return { ok: true, value: [] };
    });
    expect(reset).toEqual({
      ok: false,
      error: {
        kind: "busy",
        message: "Linka is clipping “Graph in the browser”. Try again when it finishes.",
      },
    });
    expect(ran).toBe(false);
    resolve(answer(FIRST));
    expect(await clipping).toMatchObject({ ok: true });
  });

  it("drops an undo when a script changes the graph, but not when it only reads", async () => {
    const t = setup({ model: new FakeModel([answer(FIRST)]) });
    await leaveUndo(t);
    const script = (query: string) => async () => {
      const results = runScript(t.db, query);
      return { ok: true as const, value: results };
    };
    await t.pipeline.runScript(script("MATCH (n) RETURN count(n) AS n;"));
    expect(t.journal.value).not.toBeNull();
    await t.pipeline.runScript(script("CREATE (:Page {url: 'https://example.com/x'});"));
    expect(t.journal.value).toBeNull();
  });
});
