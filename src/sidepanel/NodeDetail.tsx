import type { ReactNode } from "react";
import {
  type ClaimNode,
  type ConceptNode,
  type GraphNode,
  type GraphView,
  neighborsOf,
  type PageNode,
} from "./graph-view";
import styles from "./SidePanel.module.css";

type Select = (id: string) => void;

const TYPE_LABEL: Record<string, string> = {
  concern: "Concern",
  solution: "Solution",
  benefit: "Benefit",
  fact: "Fact",
};

const typeLabel = (type: string) => TYPE_LABEL[type] ?? (type || "Claim");

function related<K extends GraphNode["kind"]>(
  view: GraphView,
  id: string,
  kind: K,
  type: string,
  direction: "in" | "out",
): Extract<GraphNode, { kind: K }>[] {
  return neighborsOf(view, id).flatMap(({ node, link, direction: d }) =>
    node.kind === kind && link.type === type && d === direction
      ? [node as Extract<GraphNode, { kind: K }>]
      : [],
  );
}

const pageOf = (view: GraphView, claim: ClaimNode) =>
  related(view, claim.id, "page", "ASSERTS", "in")[0] ?? null;

function NodeButton({ node, onSelect }: { node: GraphNode; onSelect: Select }) {
  const text = node.kind === "page" ? node.title : node.kind === "concept" ? node.name : "";
  return (
    <button type="button" className={styles.linkish} onClick={() => onSelect(node.id)}>
      {text}
    </button>
  );
}

function ClaimItem({
  view,
  claim,
  onSelect,
  children,
}: {
  view: GraphView;
  claim: ClaimNode;
  onSelect: Select;
  children?: ReactNode;
}) {
  const page = pageOf(view, claim);
  return (
    <li>
      <button
        type="button"
        className={`${styles.claim} ${styles[claim.shape]}`}
        onClick={() => onSelect(claim.id)}
      >
        {claim.statement}
        <small>
          {typeLabel(claim.type)}
          {page ? ` · ${page.title}` : ""}
        </small>
      </button>
      {children}
    </li>
  );
}

function ClaimList({
  view,
  claims,
  onSelect,
}: {
  view: GraphView;
  claims: ClaimNode[];
  onSelect: Select;
}) {
  if (claims.length === 0) return null;
  return (
    <ul className={styles.detailList}>
      {claims.map((claim) => (
        <ClaimItem key={claim.id} view={view} claim={claim} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function PageDetail({
  view,
  page,
  onSelect,
}: {
  view: GraphView;
  page: PageNode;
  onSelect: Select;
}) {
  return (
    <>
      <span className={styles.detailKind}>
        Page{page.clippedAt ? ` · clipped ${page.clippedAt.slice(0, 10)}` : ""}
      </span>
      <h3>{page.title}</h3>
      <p className={styles.muted}>{page.url}</p>
      <p>
        <a href={page.url} target="_blank" rel="noreferrer" className={styles.openLink}>
          Open in a new tab
        </a>
      </p>
      {page.summary && <p>{page.summary}</p>}
      <ClaimList
        view={view}
        claims={related(view, page.id, "claim", "ASSERTS", "out")}
        onSelect={onSelect}
      />
    </>
  );
}

function ConceptDetail({
  view,
  concept,
  onSelect,
}: {
  view: GraphView;
  concept: ConceptNode;
  onSelect: Select;
}) {
  const pages = related(view, concept.id, "page", "MENTIONS", "in");
  const relatedConcepts = [
    ...related(view, concept.id, "concept", "RELATED_TO", "out"),
    ...related(view, concept.id, "concept", "RELATED_TO", "in"),
  ];
  return (
    <>
      <span className={styles.detailKind}>
        Concept{concept.category ? ` · ${concept.category}` : ""}
      </span>
      <h3>{concept.name}</h3>
      <p className={styles.muted}>
        Mentioned by {pages.length} {pages.length === 1 ? "page" : "pages"}
      </p>
      <ul className={styles.detailList}>
        {pages.map((page) => (
          <li key={page.id}>
            <NodeButton node={page} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <ClaimList
        view={view}
        claims={related(view, concept.id, "claim", "ABOUT", "in")}
        onSelect={onSelect}
      />
      {relatedConcepts.length > 0 && (
        <p className={styles.muted}>
          Related:{" "}
          {relatedConcepts.map((other, index) => (
            <span key={other.id}>
              {index > 0 && ", "}
              <NodeButton node={other} onSelect={onSelect} />
            </span>
          ))}
        </p>
      )}
    </>
  );
}

function ClaimDetail({
  view,
  claim,
  onSelect,
}: {
  view: GraphView;
  claim: ClaimNode;
  onSelect: Select;
}) {
  const page = pageOf(view, claim);
  const addresses = related(view, claim.id, "claim", "ADDRESSES", "out");
  const addressedBy = related(view, claim.id, "claim", "ADDRESSES", "in");
  const concepts = related(view, claim.id, "concept", "ABOUT", "out");
  return (
    <>
      <span className={styles.detailKind}>Claim · {typeLabel(claim.type)}</span>
      <p className={`${styles.claim} ${styles[claim.shape]}`}>{claim.statement}</p>
      {page && (
        <p className={styles.muted}>
          From <NodeButton node={page} onSelect={onSelect} />
        </p>
      )}
      {concepts.length > 0 && (
        <p className={styles.muted}>
          About:{" "}
          {concepts.map((concept, index) => (
            <span key={concept.id}>
              {index > 0 && ", "}
              <NodeButton node={concept} onSelect={onSelect} />
            </span>
          ))}
        </p>
      )}
      {addresses.length > 0 && (
        <>
          <h4>Addresses</h4>
          <ClaimList view={view} claims={addresses} onSelect={onSelect} />
        </>
      )}
      {addressedBy.length > 0 && (
        <>
          <h4>Addressed by</h4>
          <ClaimList view={view} claims={addressedBy} onSelect={onSelect} />
        </>
      )}
      {claim.shape === "concern" && addressedBy.length === 0 && (
        <p className={styles.muted}>No clipped page addresses this concern yet.</p>
      )}
    </>
  );
}

/** 押したノードの詳細 */
export function NodeDetail({
  view,
  node,
  onSelect,
}: {
  view: GraphView;
  node: GraphNode;
  onSelect: Select;
}) {
  return (
    <div className={styles.detail}>
      {node.kind === "page" ? (
        <PageDetail view={view} page={node} onSelect={onSelect} />
      ) : node.kind === "concept" ? (
        <ConceptDetail view={view} concept={node} onSelect={onSelect} />
      ) : (
        <ClaimDetail view={view} claim={node} onSelect={onSelect} />
      )}
    </div>
  );
}
