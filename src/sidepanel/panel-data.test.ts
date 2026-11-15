import { describe, expect, it } from "vitest";
import type { DbNotification, DbResponse, RelateResult } from "../shared/messages";
import type { ModelStatus } from "../shared/model-status";
import { type GraphState, startGraphLoader, watchLatest } from "./panel-data";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** 1 ページだけのグラフを返す executeScript の結果 */
function graphOf(url: string): DbResponse<RelateResult[]> {
  const result = (rows: Record<string, unknown>[]): RelateResult => ({
    columns: [],
    rows,
    stats: {},
  });
  return {
    ok: true,
    value: [result([{ pages: 1 }]), result([{ url, title: url }]), ...Array(5).fill(result([]))],
  };
}

const failed = (message: string): DbResponse<RelateResult[]> => ({
  ok: false,
  error: { kind: "unavailable", message },
});

/** 読むたびに保留の返事を作り、通知を手で流せる偽の DB */
function fakeDb() {
  const answers: Deferred<DbResponse<RelateResult[]>>[] = [];
  let listener: (notification: DbNotification) => void = () => {};
  let state: GraphState = { kind: "loading" };
  const loader = startGraphLoader({
    readGraph: () => {
      const answer = deferred<DbResponse<RelateResult[]>>();
      answers.push(answer);
      return answer.promise;
    },
    subscribe: (l) => {
      listener = l;
      return () => {};
    },
    onState: (update) => {
      state = update(state);
    },
  });
  return {
    loader,
    answers,
    notify: (notification: DbNotification) => listener(notification),
    state: () => state,
  };
}

const pageIds = (state: GraphState) =>
  state.kind === "loading" ? [] : (state.view?.nodes.map((node) => node.id) ?? []);

describe("startGraphLoader", () => {
  it("reads the graph when it starts", async () => {
    const db = fakeDb();
    db.answers[0]?.resolve(graphOf("https://a.example/"));
    await flush();
    expect(db.state().kind).toBe("ready");
    expect(pageIds(db.state())).toEqual(["page:https://a.example/"]);
  });

  it("reads again on graphChanged", () => {
    const db = fakeDb();
    db.notify({ type: "graphChanged" });
    expect(db.answers).toHaveLength(2);
  });

  it("reads again when the store opens on OPFS or in memory", () => {
    const db = fakeDb();
    db.notify({ type: "storageChanged", storage: { kind: "opfs" } });
    db.notify({ type: "storageChanged", storage: { kind: "memory", reason: "no OPFS" } });
    expect(db.answers).toHaveLength(3);
  });

  it("does not read again when the store becomes unavailable or is starting", () => {
    const db = fakeDb();
    db.notify({ type: "storageChanged", storage: { kind: "unavailable", reason: "locked" } });
    db.notify({ type: "storageChanged", storage: { kind: "starting" } });
    expect(db.answers).toHaveLength(1);
  });

  it("recovers from a failed first read once the store reopens", async () => {
    const db = fakeDb();
    db.answers[0]?.resolve(failed("database is unavailable"));
    await flush();
    expect(db.state()).toEqual({
      kind: "failed",
      message: "database is unavailable",
      view: null,
    });

    db.notify({ type: "storageChanged", storage: { kind: "opfs" } });
    db.answers[1]?.resolve(graphOf("https://a.example/"));
    await flush();
    expect(db.state().kind).toBe("ready");
  });

  it("reads again when asked, as the Retry button does", async () => {
    const db = fakeDb();
    db.answers[0]?.resolve(failed("timeout"));
    await flush();
    db.loader.reload();
    db.answers[1]?.resolve(graphOf("https://a.example/"));
    await flush();
    expect(db.state().kind).toBe("ready");
  });

  it("keeps the newer graph when an older read answers last", async () => {
    const db = fakeDb();
    db.notify({ type: "graphChanged" });
    db.answers[1]?.resolve(graphOf("https://new.example/"));
    await flush();
    db.answers[0]?.resolve(graphOf("https://old.example/"));
    await flush();
    expect(pageIds(db.state())).toEqual(["page:https://new.example/"]);
  });

  it("keeps the graph it had when a later read fails", async () => {
    const db = fakeDb();
    db.answers[0]?.resolve(graphOf("https://a.example/"));
    await flush();
    db.loader.reload();
    db.answers[1]?.resolve(failed("timeout"));
    await flush();
    expect(db.state().kind).toBe("failed");
    expect(pageIds(db.state())).toEqual(["page:https://a.example/"]);
  });
});

describe("watchLatest", () => {
  function watch() {
    const answer = deferred<ModelStatus | null>();
    let listener: (status: ModelStatus) => void = () => {};
    const values: ModelStatus[] = [];
    const stop = watchLatest<ModelStatus>({
      subscribe: (l) => {
        listener = l;
        return () => {};
      },
      ask: () => answer.promise,
      onValue: (value) => values.push(value),
    });
    return { answer, notify: (status: ModelStatus) => listener(status), values, stop };
  }

  it("uses the answer when no notification came first", async () => {
    const w = watch();
    w.answer.resolve({ kind: "available" });
    await flush();
    expect(w.values).toEqual([{ kind: "available" }]);
  });

  it("does not let a late status answer overwrite a notification", async () => {
    const w = watch();
    w.notify({ kind: "downloading", progress: 0.5 });
    w.answer.resolve({ kind: "downloadable", error: null });
    await flush();
    expect(w.values).toEqual([{ kind: "downloading", progress: 0.5 }]);
  });

  it("ignores an answer that arrives after it stopped", async () => {
    const w = watch();
    w.stop();
    w.answer.resolve({ kind: "available" });
    await flush();
    expect(w.values).toEqual([]);
  });
});
