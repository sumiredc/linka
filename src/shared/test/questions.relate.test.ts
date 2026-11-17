import { describe, expect, it } from "vitest";
import demoCypher from "../../../seed/demo.cypher?raw";
import { detectWrite } from "../write-detection";
import { QUESTIONS } from "./questions";
import { openMemoryDb, run, runScript } from "./relate-node";

// 10 問がデモデータで答えを持つこと（答えの Cypher が読むだけで、1 行以上返すこと）を確かめる
describe("QUESTIONS on the demo graph", () => {
  const db = openMemoryDb();
  runScript(db, demoCypher);

  it("has ten questions", () => {
    expect(QUESTIONS).toHaveLength(10);
  });

  for (const question of QUESTIONS) {
    it(`${question.id} has a read-only reference query with rows`, () => {
      expect(detectWrite(question.reference)).toBeNull();
      expect(run(db, question.reference).rows.length).toBeGreaterThan(0);
    });
  }
});
