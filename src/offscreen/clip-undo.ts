// 記憶の書き込みを取り消す。Relate にはトランザクションが無いので、書く前にそのクリップが触れうる部分を読んでおき、
// 失敗したら「触れうるものを消してから、読んでおいた状態を入れ直す」文を流す
import type { CypherStatement, CypherValue } from "../shared/cypher";
import type { ClipRows } from "../shared/graph-statements";
import type { DbResponse, RelateResult } from "../shared/messages";

export type ClipDb = {
  execute(statement: CypherStatement): Promise<DbResponse<RelateResult>>;
};

type Props = { readonly [key: string]: CypherValue };

/** 書く前のグラフのうち、そのクリップが変えうる部分 */
export type Snapshot = {
  /** Page のプロパティ。Page が無ければ null */
  page: Props | null;
  /** Page が ASSERTS する Claim（選択範囲から足したものを含む） */
  claims: { id: string; props: Props }[];
  about: { claim: string; concept: string }[];
  addresses: { solution: string; concern: string }[];
  mentions: string[];
  authoredBy: string[];
  /** クリップが書く key のうち、既にある Concept */
  concepts: { key: string; props: Props }[];
  /** クリップが書く名前のうち、既にある Person */
  persons: string[];
  /** クリップが書く RELATED_TO のうち、既にあるもの */
  related: { from: string; to: string }[];
};

/** 取り消しを済ませていない書き込み。offscreen document が書き込みの途中で閉じても、次の起動で取り消す */
export type PendingUndo = { url: string; statements: CypherStatement[] };

export type UndoJournal = {
  get(): PendingUndo | null;
  set(undo: PendingUndo): void;
  clear(): void;
};

const JOURNAL_KEY = "linka.pendingUndo";

/** offscreen document には chrome.storage が無いので localStorage に残す */
export function storedUndoJournal(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): UndoJournal {
  return {
    get: () => {
      const value = storage.getItem(JOURNAL_KEY);
      return value === null ? null : (JSON.parse(value) as PendingUndo);
    },
    set: (undo) => storage.setItem(JOURNAL_KEY, JSON.stringify(undo)),
    clear: () => storage.removeItem(JOURNAL_KEY),
  };
}

async function rows(db: ClipDb, query: string, params: Props): Promise<Record<string, unknown>[]> {
  const response = await db.execute({ query, params });
  if (!response.ok) throw new Error(`${response.error.kind}: ${response.error.message}`);
  return response.value.rows;
}

const text = (value: unknown) => String(value);
const props = (value: unknown) => value as Props;

/** クリップを書く前に、そのクリップが変えうる部分を読む。読めなければ例外にする */
export async function readSnapshot(db: ClipDb, clip: ClipRows): Promise<Snapshot> {
  const { url } = clip;
  const keys = clip.concepts.map((concept) => concept.key);

  const page = await rows(db, "MATCH (p:Page {url: $url}) RETURN properties(p) AS props", { url });
  const claims = (
    await rows(
      db,
      "MATCH (:Page {url: $url})-[:ASSERTS]->(c:Claim) RETURN c.id AS id, properties(c) AS props",
      { url },
    )
  ).map((row) => ({ id: text(row.id), props: props(row.props) }));
  const claimIds = claims.map((claim) => claim.id);
  const about = await rows(
    db,
    "MATCH (c:Claim)-[:ABOUT]->(k:Concept) WHERE c.id IN $ids RETURN c.id AS claim, k.key AS concept",
    { ids: claimIds },
  );
  const addresses = await rows(
    db,
    [
      "MATCH (s:Claim)-[:ADDRESSES]->(c:Claim)",
      "WHERE s.id IN $ids OR c.id IN $ids",
      "RETURN s.id AS solution, c.id AS concern",
    ].join("\n"),
    { ids: claimIds },
  );
  const mentions = await rows(
    db,
    "MATCH (:Page {url: $url})-[:MENTIONS]->(k:Concept) RETURN k.key AS key",
    { url },
  );
  const authoredBy = await rows(
    db,
    "MATCH (:Page {url: $url})-[:AUTHORED_BY]->(a:Person) RETURN a.name AS name",
    { url },
  );
  const concepts = await rows(
    db,
    "MATCH (k:Concept) WHERE k.key IN $keys RETURN k.key AS key, properties(k) AS props",
    { keys },
  );
  const persons = await rows(db, "MATCH (a:Person) WHERE a.name IN $names RETURN a.name AS name", {
    names: clip.authors,
  });
  const related = await rows(
    db,
    [
      "UNWIND $related AS link",
      "MATCH (:Concept {key: link.from})-[:RELATED_TO]->(:Concept {key: link.to})",
      "RETURN link.from AS from, link.to AS to",
    ].join("\n"),
    { related: clip.related },
  );

  return {
    page: page[0] ? props(page[0].props) : null,
    claims,
    about: about.map((row) => ({ claim: text(row.claim), concept: text(row.concept) })),
    addresses: addresses.map((row) => ({
      solution: text(row.solution),
      concern: text(row.concern),
    })),
    mentions: mentions.map((row) => text(row.key)),
    authoredBy: authoredBy.map((row) => text(row.name)),
    concepts: concepts.map((row) => ({ key: text(row.key), props: props(row.props) })),
    persons: persons.map((row) => text(row.name)),
    related: related.map((row) => ({ from: text(row.from), to: text(row.to) })),
  };
}

/**
 * 書き込みのどこで止まっても、流せば {@link readSnapshot} を読んだときのグラフに戻る文。
 * どれも何度流しても同じ結果になるので、途中で失敗したら最初から流し直してよい
 */
export function buildUndoStatements(clip: ClipRows, before: Snapshot): CypherStatement[] {
  const { url } = clip;
  const existingKeys = new Set(before.concepts.map((concept) => concept.key));
  const existingPersons = new Set(before.persons);
  const existingRelated = new Set(before.related.map((link) => `${link.from}\n${link.to}`));
  const statements: CypherStatement[] = [
    {
      query: "MATCH (c:Claim) WHERE c.id IN $ids\nDETACH DELETE c",
      params: {
        ids: [...new Set([...clip.claims, ...before.claims].map((claim) => claim.id))],
      },
    },
    {
      query: "MATCH (k:Concept) WHERE k.key IN $keys\nDETACH DELETE k",
      params: {
        keys: clip.concepts.map((c) => c.key).filter((key) => !existingKeys.has(key)),
      },
    },
    {
      query: "MATCH (a:Person) WHERE a.name IN $names\nDETACH DELETE a",
      params: { names: clip.authors.filter((name) => !existingPersons.has(name)) },
    },
    {
      query: [
        "UNWIND $related AS link",
        "MATCH (:Concept {key: link.from})-[r:RELATED_TO]->(:Concept {key: link.to})",
        "DELETE r",
      ].join("\n"),
      params: {
        related: clip.related.filter((link) => !existingRelated.has(`${link.from}\n${link.to}`)),
      },
    },
  ];
  if (before.page === null) {
    statements.push({ query: "MATCH (p:Page {url: $url})\nDETACH DELETE p", params: { url } });
  } else {
    statements.push(
      {
        query: "MATCH (:Page {url: $url})-[r:MENTIONS|AUTHORED_BY]->()\nDELETE r",
        params: { url },
      },
      { query: "MERGE (p:Page {url: $url})\nSET p = $props", params: { url, props: before.page } },
      {
        query: [
          "MATCH (p:Page {url: $url})",
          "UNWIND $keys AS key",
          "MATCH (k:Concept {key: key})",
          "MERGE (p)-[:MENTIONS]->(k)",
        ].join("\n"),
        params: { url, keys: before.mentions },
      },
      {
        query: [
          "MATCH (p:Page {url: $url})",
          "UNWIND $names AS name",
          "MATCH (a:Person {name: name})",
          "MERGE (p)-[:AUTHORED_BY]->(a)",
        ].join("\n"),
        params: { url, names: before.authoredBy },
      },
    );
  }
  statements.push(
    {
      // 既にあった Concept の分類は、クリップが空欄を埋めることがあるので元に戻す
      query: "UNWIND $concepts AS row\nMATCH (k:Concept {key: row.key})\nSET k = row.props",
      params: { concepts: before.concepts },
    },
    {
      query: "UNWIND $claims AS row\nMERGE (c:Claim {id: row.id})\nSET c = row.props",
      params: { claims: before.claims },
    },
    {
      query: [
        "MATCH (p:Page {url: $url})",
        "UNWIND $ids AS id",
        "MATCH (c:Claim {id: id})",
        "MERGE (p)-[:ASSERTS]->(c)",
      ].join("\n"),
      params: { url, ids: before.claims.map((claim) => claim.id) },
    },
    {
      query: [
        "UNWIND $about AS link",
        "MATCH (c:Claim {id: link.claim}), (k:Concept {key: link.concept})",
        "MERGE (c)-[:ABOUT]->(k)",
      ].join("\n"),
      params: { about: before.about },
    },
    {
      query: [
        "UNWIND $links AS link",
        "MATCH (s:Claim {id: link.solution}), (c:Claim {id: link.concern})",
        "MERGE (s)-[:ADDRESSES]->(c)",
      ].join("\n"),
      params: { links: before.addresses },
    },
  );
  return statements;
}
