/*
<MODULE_CONTRACT>
<purpose>RFC-0215: tests for normalized hashing + derived-state comparison.</purpose>
<keywords>RFC-0215, CKL, derivation, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="tests">normalize stability, hash sensitivity, derivedState transitions.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0215: initial derivation tests.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { normalizeForHash, hashSourceValue, derivedState } from "../knowledge/derivation.ts";

test("normalize: whitespace and markdown are insensitive", () => {
  expect(normalizeForHash("Hello   world")).toBe("Hello world");
  expect(normalizeForHash("**Hello** _world_")).toBe("Hello world");
  expect(hashSourceValue("Hello world")).toBe(hashSourceValue("**Hello**   world"));
});

test("hash: wording change is sensitive", () => {
  expect(hashSourceValue("Price is 70 EUR")).not.toBe(hashSourceValue("Price is 80 EUR"));
});

test("derivedState: current when hash matches", () => {
  const h = hashSourceValue("Digitales Fundament");
  expect(derivedState(h, "Digitales Fundament").state).toBe("current");
});

test("derivedState: outdated when source changed", () => {
  const h = hashSourceValue("old source");
  expect(derivedState(h, "new source").state).toBe("outdated");
});

test("derivedState: outdated when never stamped", () => {
  expect(derivedState(undefined, "any").state).toBe("outdated");
});

test("derivedState: source-missing when source value absent", () => {
  expect(derivedState("sha256:x", undefined).state).toBe("source-missing");
});
