/*
<MODULE_CONTRACT>
  <purpose>RFC-0347: property-based tests for text normalization idempotency.</purpose>
  <keywords>RFC-0347, PBT, fast-check, text-normalize, idempotency</keywords>
  <responsibilities>
    <item>Verify normalizeText is idempotent: normalize(normalize(x)) === normalize(x).</item>
    <item>Verify normalizeHtml is idempotent.</item>
    <item>Verify normalizeMarkdown is idempotent.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="pbt-text-normalize">Property-based tests for normalization idempotency.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0347: initial PBT illustrative example for text-normalize idempotency.</item></CHANGE_SUMMARY>
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
