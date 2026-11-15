// サイドパネルに描くグラフを DB から読む Cypher と、その結果を描画用のノードと線にする変換。
// Person は描かないので AUTHORED_BY も読まない

/** 描くページの上限。新しく記憶した順に数え、超えた古いページとその Claim・Concept は描かない */
export const PAGE_LIMIT = 100;

const KEPT_PAGES =
  "MATCH (p:Page) WITH p ORDER BY coalesce(p.clippedAt, '') DESC, p.url LIMIT $limit";

/**
 * 結果は文ごとに 1 つ、この順に返る。
 * 線の相手がページの上限で外れたときは、変換の側で線ごと落とす
 */
const STATEMENTS = [
  "MATCH (p:Page) RETURN count(p) AS pages",
  `${KEPT_PAGES} RETURN p.url AS url, p.title AS title, p.summary AS summary, p.clippedAt AS clippedAt`,
  `${KEPT_PAGES} MATCH (p)-[:ASSERTS]->(c:Claim) RETURN p.url AS page, c.id AS id, c.statement AS statement, c.type AS type`,
  `${KEPT_PAGES} MATCH (p)-[:MENTIONS]->(k:Concept) RETURN p.url AS page, k.key AS key, k.name AS name, k.category AS category`,
  // ページが MENTIONS に挙げていない Concept も、Claim が指していれば描く
  `${KEPT_PAGES} MATCH (p)-[:ASSERTS]->(c:Claim)-[:ABOUT]->(k:Concept) RETURN c.id AS claim, k.key AS key, k.name AS name, k.category AS category`,
  `${KEPT_PAGES} MATCH (p)-[:ASSERTS]->(s:Claim)-[:ADDRESSES]->(c:Claim) RETURN s.id AS solution, c.id AS concern`,
  `${KEPT_PAGES} MATCH (p)-[:MENTIONS]->(a:Concept)-[:RELATED_TO]->(b:Concept) RETURN DISTINCT a.key AS from, b.key AS to`,
] as const;

export const GRAPH_VIEW_SCRIPT = STATEMENTS.map((statement) => `${statement};`).join("\n");

export const GRAPH_VIEW_PARAMS = { limit: PAGE_LIMIT };

/** 描き分ける Claim の種類。benefit・fact と、知らない種類は other にまとめる */
export type ClaimShape = "concern" | "solution" | "other";

export type PageNode = {
  id: string;
  kind: "page";
  url: string;
  title: string;
  summary: string | null;
  clippedAt: string | null;
};

export type ConceptNode = {
  id: string;
  kind: "concept";
  name: string;
  category: string | null;
};

export type ClaimNode = {
  id: string;
  kind: "claim";
  statement: string;
  /** DB にある種類のまま（`benefit` など）。描き分けには `shape` を使う */
  type: string;
  shape: ClaimShape;
};

export type GraphNode = PageNode | ConceptNode | ClaimNode;

export type LinkType = "MENTIONS" | "ASSERTS" | "ABOUT" | "ADDRESSES" | "RELATED_TO";

export type GraphLink = { id: string; source: string; target: string; type: LinkType };

export type GraphView = {
  nodes: GraphNode[];
  links: GraphLink[];
  /** DB にあるページの数。`PAGE_LIMIT` を超えると、描いたページの数より多い */
  totalPages: number;
};

type Rows = readonly Record<string, unknown>[];

export const pageNodeId = (url: string) => `page:${url}`;
export const conceptNodeId = (key: string) => `concept:${key}`;
export const claimNodeId = (id: string) => `claim:${id}`;

function text(row: Record<string, unknown>, column: string): string | null {
  const value = row[column];
  return typeof value === "string" && value !== "" ? value : null;
}

function claimShape(type: string): ClaimShape {
  return type === "concern" || type === "solution" ? type : "other";
}

/** {@link GRAPH_VIEW_SCRIPT} の結果を、描画用のノードと線にする。同じノードと線は 1 つにまとめる */
export function toGraphView(results: readonly { rows: Rows }[]): GraphView {
  const rowsAt = (index: number): Rows => results[index]?.rows ?? [];
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();
  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const pending: Omit<GraphLink, "id">[] = [];
  const addLink = (source: string | null, type: LinkType, target: string | null) => {
    if (source !== null && target !== null) pending.push({ source, type, target });
  };
  const addConcept = (row: Record<string, unknown>): string | null => {
    const key = text(row, "key");
    if (key === null) return null;
    const id = conceptNodeId(key);
    addNode({
      id,
      kind: "concept",
      name: text(row, "name") ?? key,
      category: text(row, "category"),
    });
    return id;
  };

  const totalPages = rowsAt(0)[0]?.pages;

  for (const row of rowsAt(1)) {
    const url = text(row, "url");
    if (url === null) continue;
    addNode({
      id: pageNodeId(url),
      kind: "page",
      url,
      title: text(row, "title") ?? url,
      summary: text(row, "summary"),
      clippedAt: text(row, "clippedAt"),
    });
  }
  for (const row of rowsAt(2)) {
    const id = text(row, "id");
    const page = text(row, "page");
    // 描かないページの Claim は描かない
    if (id === null || page === null || !nodes.has(pageNodeId(page))) continue;
    const type = text(row, "type") ?? "";
    addNode({
      id: claimNodeId(id),
      kind: "claim",
      statement: text(row, "statement") ?? "",
      type,
      shape: claimShape(type),
    });
    addLink(pageNodeId(page), "ASSERTS", claimNodeId(id));
  }
  for (const row of rowsAt(3)) {
    const page = text(row, "page");
    addLink(page && pageNodeId(page), "MENTIONS", addConcept(row));
  }
  for (const row of rowsAt(4)) {
    const claim = text(row, "claim");
    addLink(claim && claimNodeId(claim), "ABOUT", addConcept(row));
  }
  for (const row of rowsAt(5)) {
    const solution = text(row, "solution");
    const concern = text(row, "concern");
    addLink(solution && claimNodeId(solution), "ADDRESSES", concern && claimNodeId(concern));
  }
  for (const row of rowsAt(6)) {
    const from = text(row, "from");
    const to = text(row, "to");
    addLink(from && conceptNodeId(from), "RELATED_TO", to && conceptNodeId(to));
  }

  // 相手のノードを描かない線は落とす（force-graph は端の無い線で例外を投げる）
  for (const link of pending) {
    if (!nodes.has(link.source) || !nodes.has(link.target)) continue;
    const id = `${link.source}|${link.type}|${link.target}`;
    if (!links.has(id)) links.set(id, { id, ...link });
  }

  // 描かない Claim だけが指していた Concept は、どこにもつながらずに浮くので描かない
  const linked = new Set([...links.values()].flatMap((link) => [link.source, link.target]));
  const drawn = [...nodes.values()].filter(
    (node) => node.kind !== "concept" || linked.has(node.id),
  );

  const pageCount = drawn.filter((node) => node.kind === "page").length;
  return {
    nodes: drawn,
    links: [...links.values()],
    totalPages: typeof totalPages === "number" ? totalPages : pageCount,
  };
}

export type Neighbor = { link: GraphLink; node: GraphNode; direction: "out" | "in" };

/** ノードと線でつながったノード。詳細の表示と強調に使う */
export function neighborsOf(view: GraphView, id: string): Neighbor[] {
  const byId = new Map(view.nodes.map((node) => [node.id, node]));
  return view.links.flatMap((link): Neighbor[] => {
    const other =
      link.source === id
        ? { id: link.target, direction: "out" as const }
        : link.target === id
          ? { id: link.source, direction: "in" as const }
          : null;
    const node = other && byId.get(other.id);
    return other && node ? [{ link, node, direction: other.direction }] : [];
  });
}
