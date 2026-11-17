// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClearDialog, PanelMenu } from "./PanelMenu";
import { EmptyGraph } from "./SidePanel";

// PRD UC5：空のグラフから始め、Clear graph で空に戻す

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup = () => {};
afterEach(() => cleanup());

/** メニューを開いて、項目のボタンを返す */
function openMenu(canExport: boolean, onClear = () => {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  act(() => {
    root.render(
      <PanelMenu canExport={canExport} onExport={() => {}} onGuide={() => {}} onClear={onClear} />,
    );
  });
  act(() => container.querySelector<HTMLButtonElement>('button[aria-label="More"]')?.click());
  return [...container.querySelectorAll<HTMLButtonElement>("button:not([aria-label])")];
}

const named = (buttons: HTMLButtonElement[], name: string) =>
  buttons.find((button) => button.textContent === name);

describe("the panel menu", () => {
  it("offers Clear graph instead of Reset to demo data", () => {
    const names = openMenu(true).map((button) => button.textContent);
    expect(names).toEqual(["Export", "Use with your agent", "Clear graph"]);
  });

  it("asks to clear the graph when Clear graph is chosen", () => {
    const onClear = vi.fn();
    const clear = named(openMenu(true, onClear), "Clear graph");
    act(() => clear?.click());
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not offer Clear graph for an empty graph", () => {
    expect(named(openMenu(false), "Clear graph")?.disabled).toBe(true);
  });
});

describe("the Clear graph confirmation", () => {
  it("says what is deleted and what is kept, and confirms with Clear graph", () => {
    const html = renderToStaticMarkup(<ClearDialog open onClose={() => {}} onConfirm={() => {}} />);
    const dialog = new DOMParser().parseFromString(html, "text/html");
    expect(dialog.querySelector("h2")?.textContent).toBe("Clear the graph?");
    expect(dialog.querySelector("p")?.textContent).toContain("Files you already exported");
    const buttons = [...dialog.querySelectorAll("button")].map((button) => button.textContent);
    expect(buttons).toEqual(["Cancel", "Clear graph"]);
  });
});

describe("the empty graph", () => {
  it("tells how to clip the first page", () => {
    const text = renderToStaticMarkup(<EmptyGraph />).replace(/<[^>]+>/g, "");
    expect(text).toContain("Your graph is empty.");
    expect(text).toContain("click the Linka icon in the toolbar");
  });
});
