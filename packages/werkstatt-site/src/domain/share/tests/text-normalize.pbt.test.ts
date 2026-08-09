/*
<MODULE_CONTRACT>
  <purpose>RFC-0347 + ADR-0019: property-based tests for text normalization idempotency and HTML structural invariance.</purpose>
  <keywords>RFC-0347, ADR-0019, PBT, fast-check, text-normalize, idempotency, tag balance, comment isolation, no content creation</keywords>
  <responsibilities>
    <item>Verify normalizeText is idempotent: normalize(normalize(x)) === normalize(x).</item>
    <item>Verify normalizeHtml is idempotent.</item>
    <item>Verify normalizeMarkdown is idempotent.</item>
    <item>ADR-0019: Verify normalizeHtml preserves tag balance — structural tags in input remain balanced in output.</item>
    <item>ADR-0019: Verify normalizeHtml preserves comment isolation — HTML comments are not created or destroyed.</item>
    <item>ADR-0019: Verify normalizeHtml does not create HTML tags not present in input.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="pbt-text-normalize">Property-based tests for normalization idempotency and structural invariance.</entry></MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0347: initial PBT illustrative example for text-normalize idempotency.</item>
  <item>ADR-0019: added tag balance, comment isolation, and no-content-creation properties for normalizeHtml.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import fc from "fast-check";
import {
  normalizeText,
  normalizeHtml,
  normalizeMarkdown,
  DEFAULT_NORMALIZE_CONFIG,
} from "../text-normalize.ts";

const textArbitrary = fc
  .string({ minLength: 0, maxLength: 200 })
  .filter((s) => !s.includes("\uFFFD"));

test("PBT: normalizeText is idempotent — normalize(normalize(x)) === normalize(x)", () => {
  fc.assert(
    fc.property(textArbitrary, (s) => {
      const once = normalizeText(s, DEFAULT_NORMALIZE_CONFIG);
      expect(normalizeText(once, DEFAULT_NORMALIZE_CONFIG)).toBe(once);
    }),
  );
});

test("PBT: normalizeHtml is idempotent — normalize(normalize(x)) === normalize(x)", () => {
  fc.assert(
    fc.property(textArbitrary, (s) => {
      const once = normalizeHtml(s, DEFAULT_NORMALIZE_CONFIG);
      expect(normalizeHtml(once, DEFAULT_NORMALIZE_CONFIG)).toBe(once);
    }),
  );
});

test("PBT: normalizeMarkdown is idempotent — normalize(normalize(x)) === normalize(x)", () => {
  fc.assert(
    fc.property(textArbitrary, (s) => {
      const once = normalizeMarkdown(s, DEFAULT_NORMALIZE_CONFIG);
      expect(normalizeMarkdown(once, DEFAULT_NORMALIZE_CONFIG)).toBe(once);
    }),
  );
});

// ---------------------------------------------------------------------------
// ADR-0019: structural invariance properties for normalizeHtml
// ---------------------------------------------------------------------------

const STRUCTURAL_TAGS = [
  "div",
  "span",
  "p",
  "main",
  "section",
  "article",
  "header",
  "footer",
  "ul",
  "li",
] as const;

const htmlTextSegment = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => !s.includes("<") && !s.includes(">") && !s.includes("\uFFFD"));

const htmlComment = fc.tuple(htmlTextSegment).map(([text]) => `<!-- ${text} -->`);

const htmlBalancedTag = fc
  .tuple(fc.constantFrom(...STRUCTURAL_TAGS), htmlTextSegment)
  .map(([tag, text]) => `<${tag}>${text}</${tag}>`);

const htmlSegment = fc.oneof(htmlTextSegment, htmlComment, htmlBalancedTag);

const htmlArbitrary = fc
  .array(htmlSegment, { minLength: 1, maxLength: 8 })
  .map((segments) => segments.join("\n"));

function countTagOccurrences(html: string, tag: string): number {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}>`, "gi");
  return (html.match(openRe) ?? []).length + (html.match(closeRe) ?? []).length;
}

test("PBT: normalizeHtml preserves tag balance — structural tags in input remain balanced in output", () => {
  fc.assert(
    fc.property(htmlArbitrary, (input) => {
      const output = normalizeHtml(input, DEFAULT_NORMALIZE_CONFIG);
      for (const tag of STRUCTURAL_TAGS) {
        const inputCount = countTagOccurrences(input, tag);
        const outputCount = countTagOccurrences(output, tag);
        expect(outputCount).toBe(inputCount);
      }
    }),
  );
});

test("PBT: normalizeHtml preserves comment isolation — comments are not created or destroyed", () => {
  fc.assert(
    fc.property(htmlArbitrary, (input) => {
      const output = normalizeHtml(input, DEFAULT_NORMALIZE_CONFIG);
      const inputCommentCount = (input.match(/<!--[\s\S]*?-->/g) ?? []).length;
      const outputCommentCount = (output.match(/<!--[\s\S]*?-->/g) ?? []).length;
      expect(outputCommentCount).toBe(inputCommentCount);
    }),
  );
});

test("PBT: normalizeHtml does not create HTML tags not present in input", () => {
  fc.assert(
    fc.property(htmlArbitrary, (input) => {
      const output = normalizeHtml(input, DEFAULT_NORMALIZE_CONFIG);
      const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b/g;
      const inputTagNames = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(input)) !== null) {
        inputTagNames.add(m[1].toLowerCase());
      }
      const outputTagNames = new Set<string>();
      while ((m = tagRe.exec(output)) !== null) {
        outputTagNames.add(m[1].toLowerCase());
      }
      for (const tag of outputTagNames) {
        expect(inputTagNames.has(tag)).toBe(true);
      }
    }),
  );
});
