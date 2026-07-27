/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0082 regression tests for parseOnboardingArtifactHeader and
    parseOnboardingArtifactPayload across the five contract shapes:
    single-doc file, two-doc file, missing-header file, empty file,
    doc-count > 2.
  </purpose>
  <responsibilities>
    <item>Pin the "first doc is header, last doc is payload" rule.</item>
    <item>Pin that single-doc payloads keep schema-declared keys (e.g. generatedAt) even when those overlap with RFC-0076 metadata.</item>
    <item>Pin the > 2 docs rejection.</item>
  </responsibilities>
  <non-goals>
    <item>Do not test specific content-discipline schemas — they own their own validation.</item>
  </non-goals>
</MODULE_CONTRACT>
*/

import { test, expect } from "vitest";
import { z } from "zod";
import {
  parseOnboardingArtifactHeader,
  parseOnboardingArtifactPayload,
  RFC_METADATA_KEYS,
} from "../onboarding-yaml/index.ts";

const HEADER_FIXTURE = `phase: 04-author
derivedFromInputHash: sha256:deadbeef
generatedAt: 2026-05-23T12:00:00.000Z
generator: agent`;

test("parseOnboardingArtifactHeader returns the metadata in a two-doc file", () => {
  const source = `---\n${HEADER_FIXTURE}\n---\nclient: webgogol-com\npayload: 42\n`;
  const header = parseOnboardingArtifactHeader(source);
  expect(header).toEqual({
    phase: "04-author",
    derivedFromInputHash: "sha256:deadbeef",
    generatedAt: "2026-05-23T12:00:00.000Z",
    generator: "agent",
  });
});

test("parseOnboardingArtifactHeader reads the merged metadata in a single-doc file", () => {
  const source = `${HEADER_FIXTURE}\nclient: webgogol-com\npayload: 42\n`;
  const header = parseOnboardingArtifactHeader(source);
  expect(header?.phase).toBe("04-author");
  expect(header?.derivedFromInputHash).toBe("sha256:deadbeef");
});

test("parseOnboardingArtifactHeader returns null when the header is missing", () => {
  const source = "client: webgogol-com\nfoo: bar\n";
  expect(parseOnboardingArtifactHeader(source)).toBe(null);
});

test("parseOnboardingArtifactHeader returns null for an empty source", () => {
  expect(parseOnboardingArtifactHeader("")).toBe(null);
});

test("parseOnboardingArtifactPayload returns the second doc unchanged in a two-doc file", () => {
  const source = `---\n${HEADER_FIXTURE}\n---\nclient: webgogol-com\npayload: 42\n`;
  const schema = z.object({ client: z.string(), payload: z.number() }).strict();
  const data = parseOnboardingArtifactPayload(source, schema);
  expect(data).toEqual({ client: "webgogol-com", payload: 42 });
});

test("parseOnboardingArtifactPayload strips RFC-0076 keys from a single-doc payload", () => {
  const source = `${HEADER_FIXTURE}\nclient: webgogol-com\npayload: 42\n`;
  const schema = z.object({ client: z.string(), payload: z.number() }).strict();
  const data = parseOnboardingArtifactPayload(source, schema);
  expect(data).toEqual({ client: "webgogol-com", payload: 42 });
});

test("parseOnboardingArtifactPayload preserves a metadata-named key when the schema declares it", () => {
  // RFC-0082 carve-out: contentAtomsFileSchema (and others) declare
  // `generatedAt` as a strict payload field. The helper must NOT strip it
  // from a single-doc payload when the schema's .shape introspects it.
  const source = `${HEADER_FIXTURE}\nclient: webgogol-com\n`;
  const schema = z.object({ client: z.string(), generatedAt: z.string() }).strict();
  const data = parseOnboardingArtifactPayload(source, schema);
  expect(data).toEqual({
    client: "webgogol-com",
    generatedAt: "2026-05-23T12:00:00.000Z",
  });
});

test("parseOnboardingArtifactPayload throws on an empty source", () => {
  expect(() => parseOnboardingArtifactPayload("", z.any())).toThrow(/no YAML documents/);
});

test("parseOnboardingArtifactPayload rejects doc-count > 2", () => {
  const source = `---\n${HEADER_FIXTURE}\n---\nclient: webgogol-com\n---\nstray: doc\n`;
  expect(() => parseOnboardingArtifactPayload(source, z.any())).toThrow(
    /expected exactly 1 or 2 YAML documents/,
  );
});

test("RFC_METADATA_KEYS pins the four header field names", () => {
  expect([...RFC_METADATA_KEYS].sort()).toEqual([
    "derivedFromInputHash",
    "generatedAt",
    "generator",
    "phase",
  ]);
});

test("parseOnboardingArtifactPayload propagates Zod schema errors", () => {
  const source = `---\n${HEADER_FIXTURE}\n---\nclient: 42\n`;
  const schema = z.object({ client: z.string() }).strict();
  expect(() => parseOnboardingArtifactPayload(source, schema)).toThrow();
});
