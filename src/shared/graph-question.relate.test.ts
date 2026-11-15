import { describe, expect, it } from "vitest";
import demoCypher from "../../seed/demo.cypher?raw";
import { QUESTIONS } from "../dev/questions";
import {
  buildQuery,
  CANDIDATE_QUERIES,
  type Candidates,
  type QuestionChoice,
  RESULT_LIMIT,
  resolveChoice,
  targetLookup,
  toConceptRefs,
  toPageRefs,
} from "./graph-question";
import { openMemoryDb, run, runScript } from "./test/relate-node";

const db = openMemoryDb();
runScript(db, demoCypher);

const candidates: Candidates = {
  concepts: toConceptRefs(
    run(db, CANDIDATE_QUERIES.concepts.query, CANDIDATE_QUERIES.concepts.params).rows,
  ),
  pages: toPageRefs(run(db, CANDIDATE_QUERIES.pages.query, CANDIDATE_QUERIES.pages.params).rows),
};

/** 対象を、本物の DB に {@link targetLookup} で尋ねて結びつける（offscreen document と同じ手順） */
function resolveOnDb(picked: QuestionChoice) {
  const lookup = targetLookup(picked);
  const rows = lookup ? run(db, lookup.query, lookup.params).rows : [];
  return resolveChoice(picked, { concepts: toConceptRefs(rows), pages: toPageRefs(rows) });
}

const choice = (fields: Partial<QuestionChoice>): QuestionChoice => ({
  kind: "none",
  concepts: [],
  page: "",
  moreThan: 0,
  ...fields,
});

/** Nano が #10 の各問で選ぶはずの種類と対象と、答えの Cypher と比べる列（答えの列名 → こちらの列名） */
const CASES: { id: string; choice: QuestionChoice; columns: Record<string, string> }[] = [
  {
    id: "Q1",
    choice: choice({ kind: "concernsAbout", concepts: ["OPFS"] }),
    columns: { concern: "concern" },
  },
  {
    id: "Q2",
    choice: choice({ kind: "solutionsForConcernsAbout", concepts: ["Offline support"] }),
    columns: { solution: "solution", concern: "concern" },
  },
  {
    id: "Q3",
    choice: choice({ kind: "pagesMentioning", concepts: ["IndexedDB"] }),
    columns: { title: "page", url: "url" },
  },
  {
    id: "Q4",
    choice: choice({ kind: "conceptsOnManyPages", moreThan: 3 }),
    columns: { concept: "concept", pages: "pages" },
  },
  {
    id: "Q5",
    choice: choice({ kind: "authorsOfPagesMentioning", concepts: ["SQLite"] }),
    columns: { author: "author", title: "page" },
  },
  {
    id: "Q6",
    choice: choice({ kind: "claimCountsByType" }),
    columns: { type: "type", claims: "claims" },
  },
  {
    id: "Q7",
    choice: choice({ kind: "pagesSolvingConcernsOfPage", page: "local-first software" }),
    columns: { page: "page", solution: "solution" },
  },
  {
    id: "Q8",
    choice: choice({ kind: "relatedConcepts", concepts: ["Web Worker"] }),
    columns: { concept: "concept" },
  },
  {
    id: "Q9",
    choice: choice({ kind: "pagesMentioningBoth", concepts: ["OPFS", "Web Worker"] }),
    columns: { title: "page" },
  },
];

const project = (rows: readonly Record<string, unknown>[], columns: readonly string[]) =>
  [...new Set(rows.map((row) => JSON.stringify(columns.map((column) => row[column]))))].sort();

describe("query kinds on the demo graph", () => {
  for (const { id, choice: picked, columns } of CASES) {
    it(`answers ${id} with the same rows as its reference query`, () => {
      const question = QUESTIONS.find((item) => item.id === id);
      if (!question) throw new Error(`${id} is missing`);
      const resolved = resolveOnDb(picked);
      if (!resolved.ok) throw new Error(`${id} did not resolve: ${JSON.stringify(resolved)}`);
      const statement = buildQuery(resolved.plan);

      const ours = run(db, statement.query, statement.params).rows;
      const reference = run(db, question.reference).rows;
      expect(ours.length).toBeGreaterThan(0);
      expect(project(ours, Object.values(columns))).toEqual(
        project(reference, Object.keys(columns)),
      );
    });
  }

  it("stops at the result limit", () => {
    const resolved = resolveChoice(
      choice({ kind: "conceptsOnManyPages", moreThan: 0 }),
      candidates,
    );
    if (!resolved.ok) throw new Error("did not resolve");
    const statement = buildQuery(resolved.plan);
    const limited = run(db, statement.query, { ...statement.params, limit: 2 }).rows;
    expect(limited).toHaveLength(2);
    expect(run(db, statement.query, statement.params).rows.length).toBeLessThanOrEqual(
      RESULT_LIMIT,
    );
  });

  it("finds a concept that is in the graph but not among the prompt's candidates", () => {
    const fewest = run(db, CANDIDATE_QUERIES.concepts.query, { limit: 1000 }).rows.at(-1);
    const top = toConceptRefs(run(db, CANDIDATE_QUERIES.concepts.query, { limit: 1 }).rows);
    const name = String(fewest?.name);
    expect(top.map((concept) => concept.name)).not.toContain(name);
    expect(
      resolveOnDb(choice({ kind: "pagesMentioning", concepts: [name.toUpperCase()] })),
    ).toMatchObject({ ok: true, plan: { concept: { name } } });
  });

  it("finds a page that is in the graph but not among the prompt's candidates", () => {
    const oldest = run(db, CANDIDATE_QUERIES.pages.query, { limit: 1000 }).rows.at(-1);
    const title = String(oldest?.title);
    expect(resolveOnDb(choice({ kind: "pagesSolvingConcernsOfPage", page: title }))).toMatchObject({
      ok: true,
      plan: { page: { title } },
    });
  });

  it("lists every page that matches an ambiguous page name", () => {
    const resolved = resolveOnDb(
      choice({ kind: "pagesSolvingConcernsOfPage", page: "web apis | mdn" }),
    );
    expect(resolved).toMatchObject({ ok: false, reason: "ambiguous" });
    if (resolved.ok || resolved.reason !== "ambiguous") return;
    expect(resolved.matches.length).toBeGreaterThan(1);
    for (const page of resolved.matches) expect(page.title).toContain("Web APIs | MDN");
  });

  it("reports a concept that is not in the graph", () => {
    expect(resolveOnDb(choice({ kind: "relatedConcepts", concepts: ["Kubernetes"] }))).toEqual({
      ok: false,
      reason: "unknownTarget",
      missing: ["Kubernetes"],
    });
  });

  it("reads every concept and page as a candidate", () => {
    expect(candidates.concepts).toHaveLength(29);
    expect(candidates.pages).toHaveLength(15);
    expect(candidates.concepts.map((concept) => concept.name)).toContain("Web Worker");
  });
});
