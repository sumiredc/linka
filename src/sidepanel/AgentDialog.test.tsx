// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentDialog, type AgentHandoff } from "./AgentDialog";
import { BUILD_STORE_FROM_LINKA_COMMAND, CHECK_STORE_COMMAND } from "./agent-guide";

// #21 の実機確認でつまずいた 2 か所（macOS のダウンロードフォルダの許可・.rl を作る前の登録）の案内

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
  it("numbers the steps: build the store, register it, then ask", () => {
    const [build, register, ask] = steps().map(text);
    expect(build).toMatch(/^Make a Relate file/);
    expect(register).toMatch(/^Register it/);
    expect(ask).toMatch(/^Ask your agent/);
  });

  it("points at the first line of the store command for a different download folder", () => {
    const build = steps()[0];
    expect(text(build)).toContain("change the path on the first line");
    expect(build?.querySelector("pre")?.textContent?.split("\n")[0]).toBe(
      'downloads="$HOME/Downloads" &&',
    );
  });

  it("tells what to do when the terminal may not read ~/Downloads, with a copyable command for ~/linka", () => {
    const build = steps()[0];
    expect(text(build)).toContain("Operation not permitted");
    expect(text(build)).toContain(
      "Privacy & Security → Files and Folders → your terminal app → Downloads Folder (or Full Disk Access)",
    );
    expect(text(build)).toContain("restart the terminal");
    expect(text(build)).toContain("move the file to ~/linka (create the folder if needed)");
    expect(text(build)).toContain(
      "rename it to linka-export.cypher if it is, say, linka-export (1).cypher",
    );
    const fallback = build?.querySelectorAll("pre")[1];
    expect(fallback?.textContent).toBe(BUILD_STORE_FROM_LINKA_COMMAND);
    expect(fallback?.parentElement?.querySelector("button")?.textContent).toBe("Copy");
  });

  it("names each Copy button after what it copies, so a screen reader can tell them apart", () => {
    const names = steps().flatMap((step) =>
      [...step.querySelectorAll("button[data-state]")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    );
    expect(names).toEqual([
      "Copy the store command",
      "Copy the command for a file in ~/linka",
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

  it("says step 1 must succeed before registering, and how to check when /mcp shows linka failed", () => {
    const register = text(steps()[1]);
    expect(register).toContain("after step 1 succeeds");
    expect(register).toContain("If /mcp shows linka as failed");
    expect(register).toContain(CHECK_STORE_COMMAND);
    expect(register).toContain("run step 1");
  });
});
