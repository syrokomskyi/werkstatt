/*
<MODULE_CONTRACT>
<purpose>
RFC-0613: Regression tests for parseMarkdownTwinFrontmatter null handling
and buildMarkdownTwinFrontmatter null serialization.
</purpose>
<keywords>RFC-0613, RFC-0602, markdown twin, provenance, null parsing, lastModified</keywords>
<responsibilities>
  <item>Verify bare YAML null is parsed as JS null for lastModified.</item>
  <item>Verify quoted "null" is also parsed as JS null (parser strips quotes before null check).</item>
  <item>Verify valid date strings are parsed as strings.</item>
  <item>Verify buildMarkdownTwinFrontmatter serializes null as bare YAML null.</item>
  <item>Verify buildMarkdownTwinFrontmatter serializes date strings as quoted YAML.</item>
</responsibilities>
<non-goals>
  <item>Do not test page.markdown.validate — that is covered in site-kernel-checks tests.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest cases for parseMarkdownTwinFrontmatter and buildMarkdownTwinFrontmatter null handling.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0613: Added regression tests for null parsing and serialization in markdown twin provenance.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import {
  parseMarkdownTwinFrontmatter,
  buildMarkdownTwinFrontmatter,
  type MarkdownTwinProvenance,
} from "../semantic/markdown-twin-provenance.ts";

const baseProvenance: MarkdownTwinProvenance = {
  canonical: "https://example.com/page/",
  language: "de",
  lastModified: null,
  license: "https://example.com/ai.txt",
  generator: "test-generator",
  sourceKind: "test",
};

describe("parseMarkdownTwinFrontmatter — null handling (RFC-0613)", () => {
  it("parses bare YAML null as JS null for lastModified", () => {
    const content = `---\nlastModified: null\ncanonical: "https://example.com/"\n---\n\nbody`;
    const parsed = parseMarkdownTwinFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBeNull();
  });

  it('parses quoted YAML "null" as JS null (parser strips quotes before null check)', () => {
    const content = `---\nlastModified: "null"\ncanonical: "https://example.com/"\n---\n\nbody`;
    const parsed = parseMarkdownTwinFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBeNull();
  });

  it("parses valid date string as string", () => {
    const content = `---\nlastModified: "2026-07-30"\ncanonical: "https://example.com/"\n---\n\nbody`;
    const parsed = parseMarkdownTwinFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBe("2026-07-30");
  });

  it("parses invalid date string as string (not null)", () => {
    const content = `---\nlastModified: "2026-7-4"\ncanonical: "https://example.com/"\n---\n\nbody`;
    const parsed = parseMarkdownTwinFrontmatter(content);
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBe("2026-7-4");
  });
});

describe("buildMarkdownTwinFrontmatter — null serialization (RFC-0613)", () => {
  it("serializes null lastModified as bare YAML null", () => {
    const provenance: MarkdownTwinProvenance = { ...baseProvenance, lastModified: null };
    const fm = buildMarkdownTwinFrontmatter(provenance, "sha256:abc");
    expect(fm).toContain("lastModified: null");
    expect(fm).not.toContain('lastModified: "null"');
  });

  it("serializes date string lastModified as quoted YAML", () => {
    const provenance: MarkdownTwinProvenance = { ...baseProvenance, lastModified: "2026-07-30" };
    const fm = buildMarkdownTwinFrontmatter(provenance, "sha256:abc");
    expect(fm).toContain('lastModified: "2026-07-30"');
  });
});

describe("round-trip: build → parse (RFC-0613)", () => {
  it("null lastModified survives build → parse round-trip as JS null", () => {
    const provenance: MarkdownTwinProvenance = { ...baseProvenance, lastModified: null };
    const fm = buildMarkdownTwinFrontmatter(provenance, "sha256:abc");
    const parsed = parseMarkdownTwinFrontmatter(
      `${fm}## Summary\n\nTest.\n\n## Business context\n\nTest.`,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBeNull();
  });

  it("date string lastModified survives build → parse round-trip as string", () => {
    const provenance: MarkdownTwinProvenance = { ...baseProvenance, lastModified: "2026-07-30" };
    const fm = buildMarkdownTwinFrontmatter(provenance, "sha256:abc");
    const parsed = parseMarkdownTwinFrontmatter(
      `${fm}## Summary\n\nTest.\n\n## Business context\n\nTest.`,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.frontmatter.lastModified).toBe("2026-07-30");
  });
});
