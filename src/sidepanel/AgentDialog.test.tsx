// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EXPORT_FILE_NAME } from "../shared/graph-export";
import { AgentDialog, type AgentHandoff } from "./AgentDialog";
import { BUILD_STORE_COMMAND, CHECK_STORE_COMMAND } from "./agent-guide";

// 手順はプロジェクトのフォルダで完結する。.rl を作る前に登録すると失敗する（#21 の実機確認でつまずいた）

const handoff: AgentHandoff = {
  open: true,
  exported: { kind: "idle" },
  exportNow: () => {},
  showGuide: () => {},
  close: () => {},
};

const steps = () => {
  const html = renderToStaticMarkup(<AgentDialog handoff={handoff} canExport />);
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll("ol > li")];
};

const text = (element: Element | undefined) => element?.textContent?.replace(/\s+/g, " ") ?? "";

describe("the Use with your agent dialog", () => {
  it("numbers the steps: save the export, build the store, register it, then ask", () => {
    const [save, build, register, ask] = steps().map(text);
    expect(save).toMatch(/^Save the export in your project folder/);
    expect(build).toMatch(/^Make a Relate file/);
    expect(register).toMatch(/^Register it/);
    expect(ask).toMatch(/^Ask your agent/);
  });

  it("explains saving the export in words, without a command", () => {
    const save = steps()[0];
    expect(save?.querySelectorAll("pre")).toHaveLength(0);
    expect(text(save)).toContain(EXPORT_FILE_NAME);
  });

  it("shows the store command as one line run in the project folder", () => {
    const build = steps()[1];
    expect(build?.querySelector("pre")?.textContent).toBe(BUILD_STORE_COMMAND);
    expect(BUILD_STORE_COMMAND).not.toContain("\n");
  });

  it("names each Copy button after what it copies, so a screen reader can tell them apart", () => {
    const names = steps().flatMap((step) =>
      [...step.querySelectorAll("button[data-state]")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    );
    expect(names).toEqual([
      "Copy the store command",
      "Copy the Claude Code command",
      "Copy the Codex command",
      "Copy the prompt",
    ]);
  });

  it("announces the copy result in a status region next to each button", () => {
    for (const button of steps().flatMap((step) => [
      ...step.querySelectorAll("button[data-state]"),
    ])) {
      expect(button.nextElementSibling?.getAttribute("role")).toBe("status");
    }
  });

  it("says the store must be built before registering, and how to check when /mcp shows linka failed", () => {
    const register = text(steps()[2]);
    expect(register).toContain("after step 2 succeeds");
    expect(register).toContain("If /mcp shows linka as failed");
    expect(register).toContain(CHECK_STORE_COMMAND);
    expect(register).toContain("run step 2");
  });
});
