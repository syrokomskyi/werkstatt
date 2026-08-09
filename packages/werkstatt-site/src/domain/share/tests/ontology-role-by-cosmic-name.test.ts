import { test, expect } from "vitest";
import { roleByCosmicName } from "@warpgogol/werkstatt-site/ontology/archetypes";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0263: unit test for the roleByCosmicName re-export — the manifest-
  authored `role` field, keyed by cosmicName, derived by
  archetype.registry.build and re-exported from @warpgogol/werkstatt-site/ontology/archetypes.
  Guards the two concrete hero-role entries buildPage's hideSectionNumber
  injection depends on (see hero-section-numbering-parity.test.ts).
</purpose>
</MODULE_CONTRACT>
*/

test("roleByCosmicName is exported and non-empty", () => {
  expect(typeof roleByCosmicName).toBe("object");
  expect(Object.keys(roleByCosmicName).length > 0).toBeTruthy();
});

test('roleByCosmicName: both hero-role planets map to "hero"', () => {
  expect(roleByCosmicName["Europa"]).toBe("hero"); // cosmic-literals-ignore: fixture cosmicName asserting the real registry output
  expect(roleByCosmicName["Phobos"]).toBe("hero"); // cosmic-literals-ignore: fixture cosmicName asserting the real registry output
});

test('roleByCosmicName: a non-hero planet does not map to "hero"', () => {
  expect(roleByCosmicName["Callisto"]).not.toBe("hero"); // cosmic-literals-ignore: fixture cosmicName for the non-hero control assertion
});
