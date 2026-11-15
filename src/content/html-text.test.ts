// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-text";
import { normalizeText } from "./page-text";

function read(html: string): string {
  return normalizeText(htmlToText(html));
}

describe("htmlToText", () => {
  it("separates paragraphs with a blank line", () => {
    expect(read("<p>One</p><p>Two</p>")).toBe("One\n\nTwo");
  });

  it("separates headings and list items from the text around them", () => {
    expect(read("<h2>Title</h2><ul><li>a</li><li>b</li></ul>")).toBe("Title\n\na\n\nb");
  });

  it.each(["center", "details", "summary", "fieldset", "legend"])(
    "treats <%s> as a block",
    (tag) => {
      expect(read(`<span>before<${tag}>inside</${tag}>after</span>`)).toBe(
        "before\n\ninside\n\nafter",
      );
    },
  );

  it("puts a table caption on its own paragraph", () => {
    expect(read("<table><caption>Support</caption><tr><td>a</td></tr></table>")).toBe(
      "Support\n\na",
    );
  });

  it("keeps inline elements on the same line", () => {
    expect(read("<p>A <em>quick</em> <a href='#'>link</a>.</p>")).toBe("A quick link.");
  });

  it("separates adjacent table cells", () => {
    expect(read("<table><tr><td>Chrome</td><td>138</td></tr></table>")).toBe("Chrome 138");
  });

  it("separates adjacent header cells", () => {
    expect(read("<table><tr><th>Browser</th><th>Version</th></tr></table>")).toBe(
      "Browser Version",
    );
  });

  it("puts each table row on its own paragraph", () => {
    expect(read("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>")).toBe(
      "a b\n\nc",
    );
  });

  it("turns <br> into a line break", () => {
    expect(read("<p>line one<br>line two</p>")).toBe("line one\nline two");
  });

  it("collapses source line breaks inside a paragraph into spaces", () => {
    expect(read("<p>wrapped\n   in the source</p>")).toBe("wrapped in the source");
  });
});
