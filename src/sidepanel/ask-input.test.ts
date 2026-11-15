import { describe, expect, it } from "vitest";
import { askGate, type SubmitKey, shouldSubmit } from "./ask-input";

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
