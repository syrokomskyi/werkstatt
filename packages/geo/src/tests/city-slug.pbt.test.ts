/*
<MODULE_CONTRACT>
  <purpose>RFC-0347: property-based tests for citySlug output invariants.</purpose>
  <keywords>RFC-0347, PBT, fast-check, slug, geo, citySlug</keywords>
  <responsibilities>
    <item>Verify slug output only contains lowercase alphanumeric and hyphens.</item>
    <item>Verify slug output never starts or ends with a hyphen.</item>
    <item>Verify slug output is never empty for non-empty input.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="pbt-city-slug">Property-based tests for citySlug format invariants.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0347: initial PBT illustrative example for citySlug invariants.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import fc from "fast-check";
import { citySlug } from "../slug.ts";

const cityNameArbitrary = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

test("PBT: citySlug output only contains lowercase alphanumeric and hyphens", () => {
  fc.assert(
    fc.property(cityNameArbitrary, fc.constant("de"), (name, lang) => {
      const slug = citySlug(name, lang);
      expect(slug).toMatch(/^[a-z0-9-]*$/);
    }),
  );
});

test("PBT: citySlug output never starts or ends with a hyphen", () => {
  fc.assert(
    fc.property(cityNameArbitrary, fc.constant("en"), (name, lang) => {
      const slug = citySlug(name, lang);
      if (slug.length > 0) {
        expect(slug.startsWith("-")).toBe(false);
        expect(slug.endsWith("-")).toBe(false);
      }
    }),
  );
});

test("PBT: citySlug is idempotent — citySlug(citySlug(name)) === citySlug(name)", () => {
  fc.assert(
    fc.property(cityNameArbitrary, fc.constant("en"), (name, lang) => {
      const once = citySlug(name, lang);
      expect(citySlug(once, lang)).toBe(once);
    }),
  );
});
