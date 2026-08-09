import { test, expect, describe } from "vitest";
import { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "../markdown-frontmatter.ts";

describe("parseMarkdownFrontmatter", () => {
  test("parses frontmatter and content", () => {
    const source = `---
title: Hello
lang: de
---

This is the body content.`;
    const result = parseMarkdownFrontmatter(source);
    expect(result.data.title).toBe("Hello");
    expect(result.data.lang).toBe("de");
    expect(result.content).toBe("\nThis is the body content.");
  });

  test("returns empty data when no frontmatter", () => {
    const source = "Just some text without frontmatter.";
    const result = parseMarkdownFrontmatter(source);
    expect(result.data).toEqual({});
    expect(result.content).toBe(source);
  });

  test("handles empty frontmatter", () => {
    const source = `---
title: ~
---

Body here.`;
    const result = parseMarkdownFrontmatter(source);
    expect(result.data).toEqual({ title: null });
    expect(result.content).toBe("\nBody here.");
  });

  test("handles frontmatter with nested objects", () => {
    const source = `---
title: Test
metadata:
  author: Jane
  version: 2
---

Body.`;
    const result = parseMarkdownFrontmatter(source);
    expect(result.data.title).toBe("Test");
    expect(result.data.metadata).toEqual({ author: "Jane", version: 2 });
  });

  test("handles frontmatter with arrays", () => {
    const source = `---
tags:
  - foo
  - bar
---

Body.`;
    const result = parseMarkdownFrontmatter(source);
    expect(result.data.tags).toEqual(["foo", "bar"]);
  });

  test("handles CRLF line endings", () => {
    const source = "---\r\ntitle: Test\r\n---\r\n\r\nBody.";
    const result = parseMarkdownFrontmatter(source);
    expect(result.data.title).toBe("Test");
  });

  test("handles empty content after frontmatter", () => {
    const source = `---
title: Test
---`;
    const result = parseMarkdownFrontmatter(source);
    expect(result.data.title).toBe("Test");
  });
});

describe("stringifyMarkdownFrontmatter", () => {
  test("produces valid frontmatter + content", () => {
    const result = stringifyMarkdownFrontmatter("Body text.", { title: "Test" });
    expect(result).toContain("---");
    expect(result).toContain("title: Test");
    expect(result).toContain("Body text.");
  });

  test("trims leading/trailing whitespace from content", () => {
    const result = stringifyMarkdownFrontmatter("  Body  ", { title: "Test" });
    expect(result).not.toMatch(/^  Body/);
  });

  test("handles empty data object", () => {
    const result = stringifyMarkdownFrontmatter("Body.", {});
    expect(result).toContain("---");
    expect(result).toContain("Body.");
  });
});

describe("round-trip: parse → stringify → parse", () => {
  test("data survives round-trip", () => {
    const data = { title: "Round Trip", lang: "de", count: 3 };
    const stringified = stringifyMarkdownFrontmatter("Body content.", data);
    const parsed = parseMarkdownFrontmatter(stringified);
    expect(parsed.data.title).toBe("Round Trip");
    expect(parsed.data.lang).toBe("de");
    expect(parsed.data.count).toBe(3);
    expect(parsed.content).toContain("Body content.");
  });
});
