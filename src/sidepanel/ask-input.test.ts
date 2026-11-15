import { describe, expect, it } from "vitest";
import type { AskResult } from "../shared/graph-question";
import { failure } from "../shared/messages";
import { type AskState, askGate, type SubmitKey, shouldSubmit, textAfterAsk } from "./ask-input";

const key = (fields: Partial<SubmitKey>): SubmitKey => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
  keyCode: 13,
  ...fields,
});

describe("shouldSubmit", () => {
  it("sends on Cmd+Enter", () => {
    expect(shouldSubmit(key({ metaKey: true }))).toBe(true);
  });

  it("sends on Ctrl+Enter", () => {
    expect(shouldSubmit(key({ ctrlKey: true }))).toBe(true);
  });

  it("keeps Enter alone for a new line", () => {
    expect(shouldSubmit(key({}))).toBe(false);
  });

  it("does not send the Enter that confirms an IME composition", () => {
    expect(shouldSubmit(key({ metaKey: true, isComposing: true }))).toBe(false);
  });

  it("does not send a composition Enter reported only by keyCode 229", () => {
    expect(shouldSubmit(key({ ctrlKey: true, keyCode: 229 }))).toBe(false);
  });

  it("ignores other keys with Cmd", () => {
    expect(shouldSubmit(key({ key: "a", metaKey: true }))).toBe(false);
  });
});

describe("askGate", () => {
  it("opens the input when the model is available", () => {
    expect(askGate({ kind: "available" })).toEqual({ open: true });
  });

  it("says questions need on-device AI when it is not available", () => {
    expect(askGate({ kind: "unavailable", reason: "the model is unavailable" })).toEqual({
      open: false,
      text: "Questions need on-device AI (Gemini Nano), which is not available here: the model is unavailable.",
    });
  });

  it("says questions work after the download while it downloads", () => {
    expect(askGate({ kind: "downloading", progress: 0.42 })).toEqual({
      open: false,
      text: "Questions can be asked once the on-device AI model has downloaded (42%).",
    });
  });

  it("points to the popup when the model is not downloaded", () => {
    expect(askGate({ kind: "downloadable", error: null })).toMatchObject({
      open: false,
      text: expect.stringContaining("popup"),
    });
  });

  it("keeps the input closed while the status is unknown", () => {
    expect(askGate(null)).toMatchObject({ open: false });
  });
});

describe("textAfterAsk", () => {
  const question = "Which pages mention OPFS?";
  const done = (value: AskResult): AskState => ({
    kind: "done",
    question,
    response: { ok: true, value },
  });
  const answered = done({
    kind: "answer",
    plan: { kind: "pagesMentioning", concept: { key: "opfs", name: "OPFS" } },
    title: "Pages that mention OPFS",
    cypher: "MATCH ...",
    columns: ["page", "url"],
    rows: [],
    truncated: false,
    concepts: ["OPFS"],
  });

  it("clears the question once it is answered", () => {
    expect(textAfterAsk(question, answered)).toBe("");
  });

  it("clears the question when only surrounding spaces differ from what was sent", () => {
    expect(textAfterAsk(`  ${question}\n`, answered)).toBe("");
  });

  it("keeps text written while waiting, which is not the question that was answered", () => {
    expect(textAfterAsk("Which pages mention Web Worker?", answered)).toBe(
      "Which pages mention Web Worker?",
    );
  });

  it("keeps the question while it is being asked", () => {
    expect(textAfterAsk(question, { kind: "asking", question })).toBe(question);
  });

  it("keeps the question when the ask is cancelled", () => {
    expect(textAfterAsk(question, { kind: "idle" })).toBe(question);
  });

  it.each<[string, AskState]>([
    ["a page is being clipped", done({ kind: "busy" })],
    [
      "the answer timed out",
      { kind: "done", question, response: failure("timeout", "no answer within 180 s") },
    ],
    [
      "the query failed",
      done({ kind: "failed", stage: "query", message: "boom", cypher: "MATCH ..." }),
    ],
    [
      "the question cannot be answered",
      done({ kind: "unanswerable", reason: "tooLong", missing: [], matches: [], concepts: [] }),
    ],
  ])("keeps the question when %s", (_, state) => {
    expect(textAfterAsk(question, state)).toBe(question);
  });
});
