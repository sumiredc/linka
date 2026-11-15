// 質問の答え（UC3）を、サイドパネルの結果の一覧とグラフの強調にする
import {
  type AnswerRow,
  type AskResult,
  KIND_SPECS,
  QUESTION_MAX_LENGTH,
  type QueryKind,
  type QueryPlan,
} from "../shared/graph-question";
import { claimNodeId, conceptNodeId, type LinkType, pageNodeId } from "./graph-view";

export type Highlight = { nodes: ReadonlySet<string>; links: ReadonlySet<string> };

// graph-view.ts の toGraphView が付ける線の id と同じ形
const linkId = (source: string, type: LinkType, target: string) => `${source}|${type}|${target}`;

const text = (row: AnswerRow, column: string): string | null => {
  const value = row[column];
  return typeof value === "string" && value !== "" ? value : null;
};

/**
 * 結果に含まれるノードと線。グラフに描いていないもの（Person、ページの上限で外れたもの）も含むが、
 * 描く側で id が一致しないだけなので、ここでは落とさない
 */
export function answerHighlight(plan: QueryPlan, rows: readonly AnswerRow[]): Highlight {
  const nodes = new Set<string>();
  const links = new Set<string>();
  const node = (id: string | null) => {
    if (id) nodes.add(id);
    return id;
  };
  const link = (source: string | null, type: LinkType, target: string | null) => {
    if (source && target) links.add(linkId(source, type, target));
  };
  const page = (row: AnswerRow) => {
    const url = text(row, "url");
    return node(url && pageNodeId(url));
  };
  const claim = (row: AnswerRow, column: string) => {
    const id = text(row, column);
    return node(id && claimNodeId(id));
  };
  const concept = (key: string | null) => node(key && conceptNodeId(key));

  for (const row of rows) {
    switch (plan.kind) {
      case "concernsAbout": {
        const target = concept(plan.concept.key);
        const p = page(row);
        const cl = claim(row, "claimId");
        link(p, "ASSERTS", cl);
        link(cl, "ABOUT", target);
        break;
      }
      case "solutionsForConcernsAbout": {
        const target = concept(plan.concept.key);
        const p = page(row);
        const s = claim(row, "solutionId");
        const cl = claim(row, "concernId");
        link(p, "ASSERTS", s);
        link(s, "ADDRESSES", cl);
        link(cl, "ABOUT", target);
        break;
      }
      case "pagesMentioning":
      case "authorsOfPagesMentioning":
        link(page(row), "MENTIONS", concept(plan.concept.key));
        break;
      case "pagesMentioningBoth": {
        const p = page(row);
        for (const target of plan.concepts) link(p, "MENTIONS", concept(target.key));
        break;
      }
      case "relatedConcepts": {
        const target = concept(plan.concept.key);
        const other = concept(text(row, "key"));
        // RELATED_TO は向きを問わずに問い合わせるので、どちら向きに張られていても強調する
        link(target, "RELATED_TO", other);
        link(other, "RELATED_TO", target);
        break;
      }
      case "conceptsOnManyPages":
        concept(text(row, "key"));
        break;
      case "claimCountsByType":
        break;
      case "pagesSolvingConcernsOfPage": {
        const target = node(pageNodeId(plan.page.url));
        const p = page(row);
        const s = claim(row, "solutionId");
        const cl = claim(row, "concernId");
        link(p, "ASSERTS", s);
        link(s, "ADDRESSES", cl);
        link(target, "ASSERTS", cl);
        break;
      }
    }
  }
  return { nodes, links };
}

/** 新しいタブで開いてよい URL か。DB の値をそのまま href にしないため、http(s) と拡張機能のページだけにする */
export function isOpenableUrl(url: string): boolean {
  try {
    return ["http:", "https:", "chrome-extension:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export type AnswerCell = { column: string; text: string; href: string | null };

/** 結果の 1 行のうち、画面に出す列。`page` の列は、その行の `url` へのリンクにする */
export function answerCells(kind: QueryKind, row: AnswerRow): AnswerCell[] {
  const url = text(row, "url");
  return KIND_SPECS[kind].visible.map((column) => {
    const value = row[column];
    return {
      column,
      text: value === null || value === undefined ? "" : String(value),
      href: column === "page" && url && isOpenableUrl(url) ? url : null,
    };
  });
}

/** ページの記憶の最中に質問したときの案内 */
export const BUSY_TEXT = "A page is being clipped. Ask again when it finishes.";

/** 答えられなかった理由の案内。何も実行していないことも書く */
export function unanswerableText(result: Extract<AskResult, { kind: "unanswerable" }>): string {
  switch (result.reason) {
    case "noKind":
      return "Linka cannot turn this question into one of the queries it knows. Nothing was run.";
    case "unknownTarget":
      return result.missing.length > 0
        ? `${result.missing.map((name) => `“${name}”`).join(" and ")} ${result.missing.length === 1 ? "is" : "are"} not in the graph. Nothing was run.`
        : "Linka could not tell which concept or page the question is about. Nothing was run.";
    case "ambiguous":
      return `${result.matches.length} pages match the page in the question, so Linka did not pick one. Nothing was run. Ask again with more of the title:`;
    case "emptyGraph":
      return "The graph has no pages yet. Clip a page first.";
    case "tooLong":
      return `Questions can be up to ${QUESTION_MAX_LENGTH} characters.`;
  }
}
