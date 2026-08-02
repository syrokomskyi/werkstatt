import { test, expect } from "vitest";
import { stripHtmlGeneratedMarker } from "../strip-html-generated-marker.ts";
import { GENERATED_MARKER, buildGeneratedHeader } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
<purpose>
  ADR-0018: unit tests for parse5-based stripHtmlGeneratedMarker function.
  Verifies that HTML comment nodes containing the GENERATED_MARKER are removed
  correctly, and that content between separate comments is preserved.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0018: initial test suite.</item>
</CHANGE_SUMMARY>
*/

test("stripHtmlGeneratedMarker removes the full HTML block advisory header", () => {
  const header = buildGeneratedHeader({
    filePath: "public/index.md",
    ownerCommand: "page.markdown.generate",
  });
  const content = `<!DOCTYPE html><html><head><title>Test</title></head><body>${header}<main id="main-content"><p>Body</p></main></body></html>`;
  const { changed, content: stripped } = stripHtmlGeneratedMarker(content);
  expect(changed).toBe(true);
  expect(stripped).not.toContain(GENERATED_MARKER);
  expect(stripped).toContain('<main id="main-content">');
  expect(stripped).toContain("<p>Body</p>");
});

test("stripHtmlGeneratedMarker does not swallow content between separate HTML comments", () => {
  const header = buildGeneratedHeader({
    filePath: "public/index.md",
    ownerCommand: "page.markdown.generate",
  });
  const content = `<!DOCTYPE html><html><body><!--\n  GrowthProvider injects two things.\n-->\n<main id="main-content">${header}<p>Body</p></main></body></html>`;
  const { changed, content: stripped } = stripHtmlGeneratedMarker(content);
  expect(changed).toBe(true);
  expect(stripped).not.toContain(GENERATED_MARKER);
  expect(stripped).toContain('<main id="main-content">');
  expect(stripped).toContain("<p>Body</p>");
  expect(stripped).toContain("GrowthProvider injects two things.");
});

test("stripHtmlGeneratedMarker returns unchanged when no marker present", () => {
  const content = `<!DOCTYPE html><html><body><p>No marker here</p></body></html>`;
  const { changed, content: stripped } = stripHtmlGeneratedMarker(content);
  expect(changed).toBe(false);
  expect(stripped).toBe(content);
});

test("stripHtmlGeneratedMarker removes multiple marker comments", () => {
  const header1 = buildGeneratedHeader({
    filePath: "public/index.md",
    ownerCommand: "routes.generate",
  });
  const header2 = buildGeneratedHeader({
    filePath: "public/about.md",
    ownerCommand: "routes.generate",
  });
  const content = `<!DOCTYPE html><html><body>${header1}<div>Content 1</div>${header2}<div>Content 2</div></body></html>`;
  const { changed, content: stripped } = stripHtmlGeneratedMarker(content);
  expect(changed).toBe(true);
  expect(stripped).not.toContain(GENERATED_MARKER);
  expect(stripped).toContain("<div>Content 1</div>");
  expect(stripped).toContain("<div>Content 2</div>");
});

test("stripHtmlGeneratedMarker preserves non-marker comments", () => {
  const content = `<!DOCTYPE html><html><body><!-- regular comment --><!--${GENERATED_MARKER}--><p>Body</p></body></html>`;
  const { changed, content: stripped } = stripHtmlGeneratedMarker(content);
  expect(changed).toBe(true);
  expect(stripped).not.toContain(GENERATED_MARKER);
  expect(stripped).toContain("regular comment");
  expect(stripped).toContain("<p>Body</p>");
});

test("stripHtmlGeneratedMarker handles empty content", () => {
  const { changed, content: stripped } = stripHtmlGeneratedMarker("");
  expect(changed).toBe(false);
  expect(stripped).toBe("");
});
