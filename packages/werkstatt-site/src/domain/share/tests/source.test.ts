/*
<MODULE_CONTRACT>
<purpose>RFC-0214: tests for descriptor schema, JSON extraction, tolerance comparison.</purpose>
<keywords>RFC-0214, CKL, source, monitor, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="tests">schema validity, extractJsonPath, compareValues bands.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0214: initial source tests.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  sourceDescriptorSchema,
  extractJsonPath,
  compareValues,
  coerceNumber,
} from "../knowledge/source.ts";

test("descriptor: valid http-json passes", () => {
  const r = sourceDescriptorSchema.safeParse({
    id: "gov:destatis-backnang",
    title: "Backnang residents",
    kind: "http-json",
    endpoint: "https://example.org/api",
    extract: "$.population",
    expectedType: "integer",
    checkEvery: "P3M",
  });
  expect(r.success).toBe(true);
});

test("descriptor: http-json without extract fails", () => {
  const r = sourceDescriptorSchema.safeParse({
    id: "x",
    title: "x",
    kind: "http-json",
    endpoint: "https://example.org/api",
    expectedType: "integer",
    checkEvery: "P3M",
  });
  expect(r.success).toBe(false);
});

test("descriptor: manual without endpoint passes", () => {
  const r = sourceDescriptorSchema.safeParse({
    id: "manual:civic",
    title: "Civic registry",
    kind: "manual",
    expectedType: "string",
    checkEvery: "P1Y",
  });
  expect(r.success).toBe(true);
});

test("extractJsonPath: dotted + array access", () => {
  const payload = { region: { cities: [{ population: 39120 }, { population: 1 }] } };
  expect(extractJsonPath(payload, "$.region.cities[0].population")).toBe(39120);
  expect(extractJsonPath(payload, "$.region.cities[1].population")).toBe(1);
  expect(extractJsonPath(payload, "$.region.missing")).toBe(undefined);
});

test("coerceNumber: pulls numbers from money strings", () => {
  expect(coerceNumber("70 € / Monat")).toBe(70);
  expect(coerceNumber("39.120")).toBe(39120);
  expect(coerceNumber("39,120")).toBe(39120);
  expect(coerceNumber(700)).toBe(700);
});

test("compareValues: exact numeric divergence", () => {
  const r = compareValues("38500", "39120", "integer");
  expect(r.withinTolerance).toBe(false);
});

test("compareValues: relative tolerance allows small drift", () => {
  const r = compareValues(38500, 39120, "integer", { kind: "relative", value: 0.05 });
  expect(r.withinTolerance).toBe(true); // 1.6% < 5%
});

test("compareValues: string normalized exact", () => {
  expect(compareValues("DE ", "DE", "string").withinTolerance).toBe(true);
  expect(compareValues("DE", "FR", "string").withinTolerance).toBe(false);
});
