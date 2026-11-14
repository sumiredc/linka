import { describe, expect, it } from "vitest";
import { type CypherValue, inlineParameters, toCypherLiteral, toCypherScript } from "./cypher";
import { openMemoryDb, runScript, scalar } from "./test/relate-node";

describe("toCypherLiteral", () => {
  it("wraps a string in single quotes", () => {
    expect(toCypherLiteral("OPFS")).toBe("'OPFS'");
  });

  it("escapes a single quote", () => {
    expect(toCypherLiteral("it's")).toBe("'it\\'s'");
  });

  it("escapes a backslash before anything else", () => {
    expect(toCypherLiteral("a\\'b")).toBe("'a\\\\\\'b'");
  });

  it("leaves a double quote as it is inside single quotes", () => {
    expect(toCypherLiteral('say "hi"')).toBe("'say \"hi\"'");
  });

  it("writes a newline as \\n", () => {
    expect(toCypherLiteral("a\nb")).toBe("'a\\nb'");
  });

  it("writes a carriage return as \\u000d because Relate does not decode \\r", () => {
    expect(toCypherLiteral("a\r\nb")).toBe("'a\\u000d\\nb'");
  });

  it("writes other control characters as \\uXXXX", () => {
    expect(toCypherLiteral("a\u0000b\u001fc")).toBe("'a\\u0000b\\u001fc'");
  });

  it("writes integers and floats as numbers", () => {
    expect(toCypherLiteral(42)).toBe("42");
    expect(toCypherLiteral(-1.5)).toBe("-1.5");
  });

  it("refuses NaN and infinities, which Cypher cannot write", () => {
    expect(() => toCypherLiteral(Number.NaN)).toThrow();
    expect(() => toCypherLiteral(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("writes booleans and null as keywords", () => {
    expect(toCypherLiteral(true)).toBe("true");
    expect(toCypherLiteral(false)).toBe("false");
    expect(toCypherLiteral(null)).toBe("null");
  });

  it("writes lists and maps recursively", () => {
    expect(toCypherLiteral([{ key: "opfs", n: 1 }])).toBe("[{key: 'opfs', n: 1}]");
  });

  it("quotes a map key that is not a plain identifier with backticks", () => {
    expect(toCypherLiteral({ "a b": 1, "x`y": 2 })).toBe("{`a b`: 1, `x``y`: 2}");
  });
});

describe("toCypherLiteral read back by Relate", () => {
  const db = openMemoryDb();
  const roundTrip = (value: CypherValue) => scalar(db, `RETURN ${toCypherLiteral(value)} AS v`);
  const tricky: [string, string][] = [
    ["quotes", `it's "quoted"`],
    ["backslashes", "C:\\path\\to\\file \\n is not a newline"],
    ["newlines and tabs", "line 1\nline 2\r\n\tindented"],
    ["control characters", "nul\u0000 bell\u0007 esc\u001b del\u007f nel\u0085"],
    ["line and paragraph separators", "a\u2028b\u2029c"],
    ["non-ASCII text", "日本語とémoji 😀"],
    ["semicolons and comment markers", "a; b // c /* d */"],
  ];

  for (const [name, value] of tricky) {
    it(`reads back a string with ${name} unchanged`, () => {
      expect(roundTrip(value)).toBe(value);
    });
  }

  it("reads back a nested map unchanged", () => {
    const value = { name: "x'y", list: [1, 2.5, true, null], "odd key": "v" };
    expect(roundTrip(value)).toEqual(value);
  });
});

describe("inlineParameters", () => {
  it("replaces each parameter with its literal", () => {
    expect(
      inlineParameters({ query: "MERGE (p:Page {url: $url})", params: { url: "https://x/'" } }),
    ).toBe("MERGE (p:Page {url: 'https://x/\\''})");
  });

  it("does not confuse a parameter with a longer one that shares its prefix", () => {
    expect(inlineParameters({ query: "RETURN $a, $ab", params: { a: 1, ab: 2 } })).toBe(
      "RETURN 1, 2",
    );
  });

  it("throws when a parameter has no value", () => {
    expect(() => inlineParameters({ query: "RETURN $missing", params: {} })).toThrow(/missing/);
  });
});

describe("toCypherScript", () => {
  it("ends every statement with a semicolon on its own line", () => {
    expect(
      toCypherScript([
        { query: "RETURN $a", params: { a: 1 } },
        { query: "RETURN $b", params: { b: 2 } },
      ]),
    ).toBe("RETURN 1;\nRETURN 2;\n");
  });

  it("keeps a semicolon inside a string value from splitting the statement in Relate", () => {
    const db = openMemoryDb();
    const results = runScript(
      db,
      toCypherScript([{ query: "RETURN $s AS s", params: { s: "a; RETURN 2" } }]),
    );
    expect(results.map((result) => result.rows)).toEqual([[{ s: "a; RETURN 2" }]]);
  });
});
