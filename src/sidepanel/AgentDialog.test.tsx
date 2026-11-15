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

  it("tells what to do when the terminal may not read ~/Downloads, with a copyable command for ~/linka", () => {
    const build = steps()[0];
    expect(text(build)).toContain("Operation not permitted");
    expect(text(build)).toContain("Files and Folders → Downloads (or Full Disk Access)");
    expect(text(build)).toContain("restart the terminal");
    expect(text(build)).toContain("move the file to ~/linka/linka-export.cypher in Finder");
    const commands = [...(build?.querySelectorAll("pre") ?? [])].map((pre) => pre.textContent);
    expect(commands).toContain(BUILD_STORE_FROM_LINKA_COMMAND);
    const fallback = build?.querySelectorAll("pre")[1];
    expect(fallback?.parentElement?.querySelector("button")?.textContent).toBe("Copy");
  });

  it("says step 1 must succeed before registering, and how to check when /mcp shows linka failed", () => {
    const register = text(steps()[1]);
    expect(register).toContain("after step 1 succeeds");
    expect(register).toContain("If /mcp shows linka as failed");
    expect(register).toContain(CHECK_STORE_COMMAND);
    expect(register).toContain("run step 1");
  });
});
