import { describe, expect, it } from "vitest";
import { inlineParameters } from "./cypher";
import {
  buildQuery,
  CANDIDATE_QUERIES,
  type Candidates,
  findConcept,
  findPage,
  KIND_SPECS,
  QUERY_KINDS,
  type QueryPlan,
  type QuestionChoice,
  QuestionChoiceSchema,
  RESULT_LIMIT,
  resolveChoice,
} from "./graph-question";
import { detectWrite } from "./write-detection";

const opfs = { key: "opfs", name: "OPFS" };
const worker = { key: "webworker", name: "Web Worker" };
const localFirst = {
  url: "https://www.inkandswitch.com/essay/local-first/",
  title: "Local-first software: You own your data, in spite of the cloud",
};
const localFirstNotes = { url: "https://example.com/notes", title: "Notes on local-first sync" };

const candidates: Candidates = {
  concepts: [opfs, worker, { key: "webassembly", name: "WebAssembly" }],
  pages: [localFirst, { url: "https://crdt.tech/", title: "About CRDTs" }],
};

const choice = (fields: Partial<QuestionChoice>): QuestionChoice => ({
  kind: "none",
  concepts: [],
  page: "",
  moreThan: 0,
  ...fields,
});

const PLANS: readonly QueryPlan[] = [
  { kind: "concernsAbout", concept: opfs },
  { kind: "solutionsForConcernsAbout", concept: opfs },
  { kind: "pagesMentioning", concept: opfs },
  { kind: "pagesMentioningBoth", concepts: [opfs, worker] },
  { kind: "authorsOfPagesMentioning", concept: opfs },
  { kind: "relatedConcepts", concept: opfs },
  { kind: "conceptsOnManyPages", moreThan: 3 },
  { kind: "claimCountsByType" },
  { kind: "pagesSolvingConcernsOfPage", page: localFirst },
];

describe("prepared queries", () => {
  it("covers each of the nine kinds once", () => {
    expect(PLANS.map((plan) => plan.kind)).toEqual([...QUERY_KINDS]);
  });

  for (const plan of PLANS) {
    it(`${plan.kind} is read-only with its parameters filled in`, () => {
      const statement = buildQuery(plan);
      expect(detectWrite(statement.query)).toBeNull();
      expect(detectWrite(inlineParameters(statement))).toBeNull();
    });

    it(`${plan.kind} ends with the result limit`, () => {
      const statement = buildQuery(plan);
      expect(statement.query.endsWith("\nLIMIT $limit")).toBe(true);
      expect(statement.params.limit).toBe(RESULT_LIMIT);
    });

    it(`${plan.kind} returns every column it shows`, () => {
      const returned = KIND_SPECS[plan.kind].query;
      for (const column of KIND_SPECS[plan.kind].visible) {
        expect(returned).toMatch(new RegExp(`AS ${column}\\b`));
      }
    });
  }

  it("reads the candidate names read-only", () => {
    expect(detectWrite(CANDIDATE_QUERIES.concepts.query)).toBeNull();
    expect(detectWrite(CANDIDATE_QUERIES.pages.query)).toBeNull();
  });

  it("puts the concept key in a parameter, not the name", () => {
    expect(buildQuery({ kind: "pagesMentioning", concept: worker }).params).toEqual({
      concept: "webworker",
      limit: RESULT_LIMIT,
    });
  });

  it("puts both concept keys in parameters for pages mentioning both", () => {
    expect(buildQuery({ kind: "pagesMentioningBoth", concepts: [opfs, worker] }).params).toEqual({
      first: "opfs",
      second: "webworker",
      limit: RESULT_LIMIT,
    });
  });

  it("puts the page URL in a parameter for concerns raised on a page", () => {
    expect(buildQuery({ kind: "pagesSolvingConcernsOfPage", page: localFirst }).params).toEqual({
      page: localFirst.url,
      limit: RESULT_LIMIT,
    });
  });

  it("shows the executed query with its parameters as literals", () => {
    const text = inlineParameters(buildQuery({ kind: "conceptsOnManyPages", moreThan: 3 }));
    expect(text).toContain("WHERE pages > 3");
    expect(text).toContain(`LIMIT ${RESULT_LIMIT}`);
    expect(text).not.toContain("$");
  });

  it("quotes a target that contains a quote", () => {
    const text = inlineParameters(
      buildQuery({ kind: "pagesMentioning", concept: { key: "o'reilly", name: "O'Reilly" } }),
    );
    expect(text).toContain("{key: 'o\\'reilly'}");
  });
});

describe("findConcept", () => {
  it("matches a name by its concept key, ignoring case, spaces and hyphens", () => {
    expect(findConcept("web-worker", candidates.concepts)).toEqual(worker);
  });

  it("matches an alias through the alias table", () => {
    expect(findConcept("Wasm", candidates.concepts)?.key).toBe("webassembly");
  });

  it("returns null for a name not in the graph", () => {
    expect(findConcept("SQLite", candidates.concepts)).toBeNull();
  });

  it("returns null for an empty name", () => {
    expect(findConcept("  ", candidates.concepts)).toBeNull();
  });
});

describe("findPage", () => {
  it("matches the whole title, ignoring case", () => {
    expect(findPage(localFirst.title.toUpperCase(), candidates.pages)).toEqual(localFirst);
  });

  it("matches the only page whose title contains the name", () => {
    expect(findPage("local-first software", candidates.pages)).toEqual(localFirst);
  });

  it("does not pick one of several pages whose titles contain the name", () => {
    expect(findPage("local-first", [localFirst, localFirstNotes])).toBeNull();
  });

  it("returns null for a page not in the graph", () => {
    expect(findPage("SQLite on the web", candidates.pages)).toBeNull();
  });
});

describe("resolveChoice", () => {
  it("rejects a question that fits no kind", () => {
    expect(resolveChoice(choice({ kind: "none" }), candidates)).toEqual({
      ok: false,
      reason: "noKind",
    });
  });

  it("resolves a one-concept kind to the concept in the graph", () => {
    expect(
      resolveChoice(choice({ kind: "concernsAbout", concepts: ["opfs"] }), candidates),
    ).toEqual({
      ok: true,
      plan: { kind: "concernsAbout", concept: opfs },
    });
  });

  it("names the concept that is not in the graph", () => {
    expect(
      resolveChoice(choice({ kind: "pagesMentioning", concepts: ["SQLite"] }), candidates),
    ).toEqual({ ok: false, reason: "unknownTarget", missing: ["SQLite"] });
  });

  it("rejects a one-concept kind without a concept", () => {
    expect(resolveChoice(choice({ kind: "relatedConcepts" }), candidates)).toEqual({
      ok: false,
      reason: "unknownTarget",
      missing: [],
    });
  });

  it("resolves two concepts for pages mentioning both", () => {
    expect(
      resolveChoice(
        choice({ kind: "pagesMentioningBoth", concepts: ["OPFS", "Web Worker"] }),
        candidates,
      ),
    ).toEqual({ ok: true, plan: { kind: "pagesMentioningBoth", concepts: [opfs, worker] } });
  });

  it("rejects pages mentioning both with one concept", () => {
    expect(
      resolveChoice(choice({ kind: "pagesMentioningBoth", concepts: ["OPFS"] }), candidates),
    ).toMatchObject({ ok: false, reason: "unknownTarget" });
  });

  it("rejects pages mentioning both when the two names are the same concept", () => {
    expect(
      resolveChoice(
        choice({ kind: "pagesMentioningBoth", concepts: ["Web Worker", "web workers"] }),
        candidates,
      ),
    ).toMatchObject({ ok: false, reason: "unknownTarget" });
  });

  it("names the missing one of two concepts", () => {
    expect(
      resolveChoice(
        choice({ kind: "pagesMentioningBoth", concepts: ["OPFS", "SQLite"] }),
        candidates,
      ),
    ).toEqual({ ok: false, reason: "unknownTarget", missing: ["SQLite"] });
  });

  it("takes the threshold for concepts on many pages", () => {
    expect(resolveChoice(choice({ kind: "conceptsOnManyPages", moreThan: 2 }), candidates)).toEqual(
      {
        ok: true,
        plan: { kind: "conceptsOnManyPages", moreThan: 2 },
      },
    );
  });

  it("needs no target for claim counts", () => {
    expect(
      resolveChoice(choice({ kind: "claimCountsByType", concepts: ["x"] }), candidates),
    ).toEqual({
      ok: true,
      plan: { kind: "claimCountsByType" },
    });
  });

  it("resolves the page for concerns raised on a page", () => {
    expect(
      resolveChoice(
        choice({ kind: "pagesSolvingConcernsOfPage", page: "Local-first software" }),
        candidates,
      ),
    ).toEqual({ ok: true, plan: { kind: "pagesSolvingConcernsOfPage", page: localFirst } });
  });

  it("names the page that is not in the graph", () => {
    expect(
      resolveChoice(choice({ kind: "pagesSolvingConcernsOfPage", page: "Yjs docs" }), candidates),
    ).toEqual({ ok: false, reason: "unknownTarget", missing: ["Yjs docs"] });
  });
});

describe("QuestionChoiceSchema", () => {
  it("accepts a kind outside the prepared queries only as none", () => {
    expect(QuestionChoiceSchema.safeParse(choice({ kind: "none" })).success).toBe(true);
    expect(
      QuestionChoiceSchema.safeParse({ ...choice({}), kind: "deleteEverything" }).success,
    ).toBe(false);
  });

  it("rejects more than two concepts", () => {
    expect(QuestionChoiceSchema.safeParse(choice({ concepts: ["a", "b", "c"] })).success).toBe(
      false,
    );
  });
});
