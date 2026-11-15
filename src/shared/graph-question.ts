// 質問（PRD UC3）を、用意した問い合わせの種類と対象に置き換えて Cypher にする。
// Nano が正しい Cypher を書けたのは 10 問中 2 問だった（#10）ので、Nano には種類と対象を選ばせるだけにし、
// Cypher は種類ごとのパラメータ付きの文に対象を入れて作る。各文は src/dev/questions.ts の答えの Cypher を元にした
import { z } from "zod";
import { normalizeConceptKey } from "./concept-key";
import type { CypherStatement } from "./cypher";

/** 表示する結果の上限。これより多い結果は先頭だけを返す */
export const RESULT_LIMIT = 50;

/** 質問の文字数の上限。プロンプトにはグラフの概念名とページ名も入るので、長い質問は断る */
export const QUESTION_MAX_LENGTH = 500;

export const QUERY_KINDS = [
  "concernsAbout",
  "solutionsForConcernsAbout",
  "pagesMentioning",
  "pagesMentioningBoth",
  "authorsOfPagesMentioning",
  "relatedConcepts",
  "conceptsOnManyPages",
  "claimCountsByType",
  "pagesSolvingConcernsOfPage",
] as const;

export type QueryKind = (typeof QUERY_KINDS)[number];

type Target = "concept" | "twoConcepts" | "page" | "threshold" | "none";

interface KindSpec {
  target: Target;
  /** Nano への説明。プロンプトに入れる */
  meaning: string;
  /** 答えられる質問の例（PRD UC3 の表）。プロンプトにも、答えられないときの案内にも使う */
  example: string;
  /** 結果の列のうち、画面に出すもの。ほかの列はページへのリンクとグラフの強調に使う */
  visible: readonly string[];
  /** パラメータ付きの文。最後に `LIMIT $limit` を付ける */
  query: string;
}

export const KIND_SPECS: { readonly [K in QueryKind]: KindSpec } = {
  concernsAbout: {
    target: "concept",
    meaning: "concerns (problems, risks, limitations) about one concept",
    example: "What concerns are there about OPFS?",
    visible: ["concern", "page"],
    query: [
      "MATCH (p:Page)-[:ASSERTS]->(cl:Claim {type: 'concern'})-[:ABOUT]->(c:Concept {key: $concept})",
      "RETURN DISTINCT cl.statement AS concern, p.title AS page, p.url AS url, cl.id AS claimId",
      "ORDER BY page, concern",
    ].join("\n"),
  },
  solutionsForConcernsAbout: {
    target: "concept",
    meaning: "solutions that address the concerns about one concept",
    example: "Which solutions address concerns about offline support?",
    visible: ["solution", "page", "concern"],
    query: [
      "MATCH (sp:Page)-[:ASSERTS]->(s:Claim {type: 'solution'})-[:ADDRESSES]->(cl:Claim {type: 'concern'})-[:ABOUT]->(c:Concept {key: $concept})",
      "RETURN DISTINCT s.statement AS solution, sp.title AS page, cl.statement AS concern, sp.url AS url, s.id AS solutionId, cl.id AS concernId",
      "ORDER BY page, solution",
    ].join("\n"),
  },
  pagesMentioning: {
    target: "concept",
    meaning: "pages that mention one concept",
    example: "Which pages mention IndexedDB?",
    visible: ["page"],
    query: [
      "MATCH (p:Page)-[:MENTIONS]->(c:Concept {key: $concept})",
      "RETURN DISTINCT p.title AS page, p.url AS url",
      "ORDER BY page",
    ].join("\n"),
  },
  pagesMentioningBoth: {
    target: "twoConcepts",
    meaning: "pages that mention both of two concepts",
    example: "Which pages mention both OPFS and Web Worker?",
    visible: ["page"],
    query: [
      "MATCH (a:Concept {key: $first})<-[:MENTIONS]-(p:Page)-[:MENTIONS]->(b:Concept {key: $second})",
      "RETURN DISTINCT p.title AS page, p.url AS url",
      "ORDER BY page",
    ].join("\n"),
  },
  authorsOfPagesMentioning: {
    target: "concept",
    meaning: "authors of the pages that mention one concept",
    example: "Who wrote the pages that mention SQLite?",
    visible: ["author", "page"],
    query: [
      "MATCH (a:Person)<-[:AUTHORED_BY]-(p:Page)-[:MENTIONS]->(c:Concept {key: $concept})",
      "RETURN DISTINCT a.name AS author, p.title AS page, p.url AS url",
      "ORDER BY author, page",
    ].join("\n"),
  },
  relatedConcepts: {
    target: "concept",
    meaning: "concepts related to one concept",
    example: "Which concepts are related to Web Worker?",
    visible: ["concept"],
    query: [
      "MATCH (c:Concept {key: $concept})-[:RELATED_TO]-(other:Concept)",
      "RETURN DISTINCT other.name AS concept, other.key AS key",
      "ORDER BY concept",
    ].join("\n"),
  },
  conceptsOnManyPages: {
    target: "threshold",
    meaning: "concepts mentioned by more than a number of pages",
    example: "Which concepts are mentioned by more than three pages?",
    visible: ["concept", "pages"],
    query: [
      "MATCH (p:Page)-[:MENTIONS]->(c:Concept)",
      "WITH c, count(p) AS pages",
      "WHERE pages > $moreThan",
      "RETURN c.name AS concept, pages, c.key AS key",
      "ORDER BY pages DESC, concept",
    ].join("\n"),
  },
  claimCountsByType: {
    target: "none",
    meaning: "the number of claims of each type (benefit, concern, solution, fact)",
    example: "How many claims of each type are there?",
    visible: ["type", "claims"],
    query: [
      "MATCH (cl:Claim)",
      "RETURN cl.type AS type, count(cl) AS claims",
      "ORDER BY claims DESC, type",
    ].join("\n"),
  },
  pagesSolvingConcernsOfPage: {
    target: "page",
    meaning: "pages that propose solutions to the concerns raised on one page",
    example:
      "Which pages propose solutions to the concerns raised on the local-first software page?",
    visible: ["page", "solution", "concern"],
    query: [
      "MATCH (sp:Page)-[:ASSERTS]->(s:Claim)-[:ADDRESSES]->(cl:Claim)<-[:ASSERTS]-(cp:Page {url: $page})",
      "RETURN DISTINCT sp.title AS page, s.statement AS solution, cl.statement AS concern, sp.url AS url, s.id AS solutionId, cl.id AS concernId",
      "ORDER BY page, solution",
    ].join("\n"),
  },
};

/** Nano が返す形。対象は名前のまま受け取り、グラフにあるかは {@link resolveChoice} で確かめる */
export const QuestionChoiceSchema = z.object({
  kind: z.enum([...QUERY_KINDS, "none"]),
  concepts: z.array(z.string().max(100)).max(2),
  page: z.string().max(300),
  moreThan: z.int().min(0).max(1000),
});

export type QuestionChoice = z.infer<typeof QuestionChoiceSchema>;

export type ConceptRef = { key: string; name: string };
export type PageRef = { url: string; title: string };

/** 質問の対象になりうる、グラフにある名前 */
export type Candidates = { concepts: readonly ConceptRef[]; pages: readonly PageRef[] };

/** 種類と、グラフにあることを確かめた対象 */
export type QueryPlan =
  | {
      kind: Exclude<
        QueryKind,
        | "pagesMentioningBoth"
        | "conceptsOnManyPages"
        | "claimCountsByType"
        | "pagesSolvingConcernsOfPage"
      >;
      concept: ConceptRef;
    }
  | { kind: "pagesMentioningBoth"; concepts: readonly [ConceptRef, ConceptRef] }
  | { kind: "conceptsOnManyPages"; moreThan: number }
  | { kind: "claimCountsByType" }
  | { kind: "pagesSolvingConcernsOfPage"; page: PageRef };

export type Resolution =
  | { ok: true; plan: QueryPlan }
  /** どの種類にも当てはまらない */
  | { ok: false; reason: "noKind" }
  /** 対象がグラフに無い、または選ばれていない。`missing` は見つからなかった名前（選ばれていなければ空） */
  | { ok: false; reason: "unknownTarget"; missing: string[] };

const sameText = (text: string) => text.normalize("NFKC").trim().toLowerCase();

/** 名前を、key（Concept の MERGE キーと同じ正規化）か表示名で、グラフの Concept に結びつける */
export function findConcept(name: string, concepts: readonly ConceptRef[]): ConceptRef | null {
  const key = normalizeConceptKey(name.trim());
  if (key === "") return null;
  return (
    concepts.find((concept) => concept.key === key) ??
    concepts.find((concept) => sameText(concept.name) === sameText(name)) ??
    null
  );
}

/**
 * 名前を、題名が一致するページ、無ければ題名にその名前を含むただ 1 つのページに結びつける。
 * 含むページが複数あるときは、どれか決められないので null
 */
export function findPage(name: string, pages: readonly PageRef[]): PageRef | null {
  const wanted = sameText(name);
  if (wanted === "") return null;
  const exact = pages.find((page) => sameText(page.title) === wanted);
  if (exact) return exact;
  const containing = pages.filter((page) => sameText(page.title).includes(wanted));
  return containing.length === 1 ? (containing[0] ?? null) : null;
}

function resolveConcepts(
  names: readonly string[],
  count: number,
  candidates: Candidates,
): { ok: true; concepts: ConceptRef[] } | { ok: false; missing: string[] } {
  const given = names.map((name) => name.trim()).filter((name) => name !== "");
  if (given.length < count)
    return { ok: false, missing: given.filter((name) => !findConcept(name, candidates.concepts)) };
  const picked = given.slice(0, count);
  const found = picked.map((name) => findConcept(name, candidates.concepts));
  const missing = picked.filter((_, index) => found[index] === null);
  if (missing.length > 0) return { ok: false, missing };
  const concepts = found.filter((concept): concept is ConceptRef => concept !== null);
  // 同じ概念を 2 回選んだときは、2 つの概念の問いにならない
  if (new Set(concepts.map((concept) => concept.key)).size < count)
    return { ok: false, missing: [] };
  return { ok: true, concepts };
}

/** Nano の選択を、グラフにある対象に結びつける */
export function resolveChoice(choice: QuestionChoice, candidates: Candidates): Resolution {
  if (choice.kind === "none") return { ok: false, reason: "noKind" };
  const kind = choice.kind;
  switch (KIND_SPECS[kind].target) {
    case "none":
      return { ok: true, plan: { kind: "claimCountsByType" } };
    case "threshold":
      return { ok: true, plan: { kind: "conceptsOnManyPages", moreThan: choice.moreThan } };
    case "page": {
      const page = findPage(choice.page, candidates.pages);
      if (!page) {
        const missing = choice.page.trim();
        return { ok: false, reason: "unknownTarget", missing: missing ? [missing] : [] };
      }
      return { ok: true, plan: { kind: "pagesSolvingConcernsOfPage", page } };
    }
    case "twoConcepts": {
      const resolved = resolveConcepts(choice.concepts, 2, candidates);
      if (!resolved.ok) return { ok: false, reason: "unknownTarget", missing: resolved.missing };
      const [first, second] = resolved.concepts as [ConceptRef, ConceptRef];
      return { ok: true, plan: { kind: "pagesMentioningBoth", concepts: [first, second] } };
    }
    case "concept": {
      const resolved = resolveConcepts(choice.concepts, 1, candidates);
      if (!resolved.ok) return { ok: false, reason: "unknownTarget", missing: resolved.missing };
      const [concept] = resolved.concepts as [ConceptRef];
      return { ok: true, plan: { kind, concept } as QueryPlan };
    }
  }
}

function paramsOf(plan: QueryPlan): Record<string, string | number> {
  switch (plan.kind) {
    case "pagesMentioningBoth":
      return { first: plan.concepts[0].key, second: plan.concepts[1].key };
    case "conceptsOnManyPages":
      return { moreThan: plan.moreThan };
    case "claimCountsByType":
      return {};
    case "pagesSolvingConcernsOfPage":
      return { page: plan.page.url };
    default:
      return { concept: plan.concept.key };
  }
}

/** 種類と対象から、読むだけの 1 文を作る。結果は {@link RESULT_LIMIT} 件まで */
export function buildQuery(plan: QueryPlan): CypherStatement {
  return {
    query: `${KIND_SPECS[plan.kind].query}\nLIMIT $limit`,
    params: { ...paramsOf(plan), limit: RESULT_LIMIT },
  };
}

/** 結果の見出し。何を問い合わせたかを、利用者の言葉ではなく選んだ種類と対象で示す */
export function describePlan(plan: QueryPlan): string {
  switch (plan.kind) {
    case "concernsAbout":
      return `Concerns about ${plan.concept.name}`;
    case "solutionsForConcernsAbout":
      return `Solutions to concerns about ${plan.concept.name}`;
    case "pagesMentioning":
      return `Pages that mention ${plan.concept.name}`;
    case "pagesMentioningBoth":
      return `Pages that mention both ${plan.concepts[0].name} and ${plan.concepts[1].name}`;
    case "authorsOfPagesMentioning":
      return `Authors of pages that mention ${plan.concept.name}`;
    case "relatedConcepts":
      return `Concepts related to ${plan.concept.name}`;
    case "conceptsOnManyPages":
      return `Concepts mentioned by more than ${plan.moreThan} ${plan.moreThan === 1 ? "page" : "pages"}`;
    case "claimCountsByType":
      return "Number of claims of each type";
    case "pagesSolvingConcernsOfPage":
      return `Pages with solutions to the concerns on “${plan.page.title}”`;
  }
}

/** プロンプトに入れる名前の上限。コンテキスト（9216 トークン）に質問と指示が収まるようにする */
export const CANDIDATE_LIMITS = { concepts: 200, pages: 100 };

/** 質問の対象になりうる名前を読む文。概念は多くのページに出てくる順、ページは新しく記憶した順 */
export const CANDIDATE_QUERIES = {
  concepts: {
    query: [
      "MATCH (c:Concept)",
      "OPTIONAL MATCH (p:Page)-[:MENTIONS]->(c)",
      "WITH c, count(p) AS pages",
      "RETURN c.key AS key, c.name AS name",
      "ORDER BY pages DESC, name",
      "LIMIT $limit",
    ].join("\n"),
    params: { limit: CANDIDATE_LIMITS.concepts },
  },
  pages: {
    query: [
      "MATCH (p:Page)",
      "RETURN p.url AS url, p.title AS title",
      "ORDER BY coalesce(p.clippedAt, '') DESC, p.url",
      "LIMIT $limit",
    ].join("\n"),
    params: { limit: CANDIDATE_LIMITS.pages },
  },
} satisfies Record<string, CypherStatement>;

const textOf = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

export function toConceptRefs(rows: readonly Record<string, unknown>[]): ConceptRef[] {
  return rows.flatMap((row) => {
    const key = textOf(row.key);
    return key ? [{ key, name: textOf(row.name) ?? key }] : [];
  });
}

export function toPageRefs(rows: readonly Record<string, unknown>[]): PageRef[] {
  return rows.flatMap((row) => {
    const url = textOf(row.url);
    return url ? [{ url, title: textOf(row.title) ?? url }] : [];
  });
}

export type AskRequest = { kind: "ask"; question: string };

export type AnswerRow = Record<string, unknown>;

export type AskResult =
  | {
      kind: "answer";
      plan: QueryPlan;
      title: string;
      /** 実行した文に、パラメータを埋めたもの。CLI でそのまま実行できる */
      cypher: string;
      columns: string[];
      rows: AnswerRow[];
      /** 結果が {@link RESULT_LIMIT} 件に届いた（もっとあるかもしれない） */
      truncated: boolean;
    }
  | {
      kind: "unanswerable";
      reason: "noKind" | "unknownTarget" | "emptyGraph" | "tooLong";
      /** グラフに見つからなかった名前 */
      missing: string[];
      /** グラフにある概念の名前（案内に出す） */
      concepts: string[];
    }
  | {
      kind: "failed";
      /** model：Nano が使えない・時間切れ・答えの形が違う。query：問い合わせが失敗した */
      stage: "model" | "query";
      message: string;
      /** query で失敗したときの、実行しようとした文 */
      cypher: string | null;
    };
