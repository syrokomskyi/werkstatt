/*
<MODULE_CONTRACT>
<purpose>RFC-0211: round-trip + edge-case tests for the claim subject address codec.</purpose>
<keywords>RFC-0211, CKL, claim, subject, test</keywords>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">parse/format round-trips, lang detection, malformed input.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0211: initial codec tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  parseClaimSubject,
  formatClaimSubject,
  claimSubjectsEqual,
  ClaimSubjectParseError,
} from "../knowledge/claim.ts";

test("parse: lang-scoped subject with simple field", () => {
  const s = parseClaimSubject("business/de/location#residents");
  expect(s.collection).toBe("business");
  expect(s.lang).toBe("de");
  expect(s.file).toBe("location");
  expect(s.fieldPath).toEqual(["residents"]);
});

test("parse: lang-scoped subject with nested field path", () => {
  const s = parseClaimSubject("business/uk/offer#price.monthly");
  expect(s.lang).toBe("uk");
  expect(s.file).toBe("offer");
  expect(s.fieldPath).toEqual(["price", "monthly"]);
});

test("parse: collection without lang", () => {
  const s = parseClaimSubject("surface/landing#headline");
  expect(s.collection).toBe("surface");
  expect(s.lang).toBe(undefined);
  expect(s.file).toBe("landing");
  expect(s.fieldPath).toEqual(["headline"]);
});

test("parse: nested file path under a lang", () => {
  const s = parseClaimSubject("business/de/faq/df-start#answer");
  expect(s.lang).toBe("de");
  expect(s.file).toBe("faq/df-start");
  expect(s.fieldPath).toEqual(["answer"]);
});

test("format is the inverse of parse", () => {
  for (const raw of [
    "business/de/location#residents",
    "business/uk/offer#price.monthly",
    "surface/landing#headline",
    "business/de/faq/df-start#answer",
  ]) {
    expect(formatClaimSubject(parseClaimSubject(raw))).toBe(raw);
  }
});

test("claimSubjectsEqual compares canonical forms", () => {
  const a = parseClaimSubject("business/de/location#residents");
  const b = parseClaimSubject("business/de/location#residents");
  const c = parseClaimSubject("business/uk/location#residents");
  expect(claimSubjectsEqual(a, b)).toBeTruthy();
  expect(!claimSubjectsEqual(a, c)).toBeTruthy();
});

test("parse: a two-letter file stem is not mistaken for a lang when alone", () => {
  // Only treated as lang when a file segment still remains after it.
  const s = parseClaimSubject("glossary/de#term");
  expect(s.collection).toBe("glossary");
  expect(s.lang).toBe(undefined);
  expect(s.file).toBe("de");
  expect(s.fieldPath).toEqual(["term"]);
});

test("parse: missing # throws", () => {
  expect(() => parseClaimSubject("business/de/location")).toThrow(ClaimSubjectParseError);
});

test("parse: empty field path throws", () => {
  expect(() => parseClaimSubject("business/de/location#")).toThrow(ClaimSubjectParseError);
});

test("parse: too-short path throws", () => {
  expect(() => parseClaimSubject("business#x")).toThrow(ClaimSubjectParseError);
});
