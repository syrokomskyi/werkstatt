/*
<MODULE_CONTRACT>
<purpose>
RFC-0613: Regression tests for page.markdown.validate null acceptance for lastModified.
Integration-style tests that create temp directories with public/ markdown twins
and call runPageMarkdownValidate to verify MDMETA-02 and MDMETA-04 behavior.
</purpose>
<keywords>RFC-0613, RFC-0602, page.markdown.validate, MDMETA-02, MDMETA-04, lastModified, null</keywords>
<responsibilities>
  <item>Verify lastModified: null is accepted without MDMETA-02 or MDMETA-04 errors.</item>
  <item>Verify valid date string lastModified is accepted without errors.</item>
  <item>Verify invalid date string lastModified triggers MDMETA-04.</item>
  <item>Verify missing lastModified field triggers MDMETA-02.</item>
  <item>Verify quoted "null" lastModified is parsed as JS null and accepted (parser strips quotes).</item>
</responsibilities>
<non-goals>
  <item>Do not test parser null handling — covered in packages/share tests.</item>
  <item>Do not test HTML link resolution — only frontmatter validation is in scope.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest integration cases for runPageMarkdownValidate lastModified null acceptance.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0613: Added regression tests for page.markdown.validate null lastModified acceptance.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runPageMarkdownValidate } from "../page-markdown.ts";
import {
  buildMarkdownTwin,
  type MarkdownTwinProvenance,
  type MarkdownTwinSemanticMeta,
} from "@warpgogol/werkstatt-site/share/semantic";

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: {
      name: "test-app",
      directory: root,
      toolsDirectory: join(root, "tools"),
    },
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

const semanticMeta: MarkdownTwinSemanticMeta = {
  id: "test-page",
  route: "/test/",
  title: "Test Page",
  type: "content",
  domain: "content",
  audience: "general",
  lang: "de",
  metaDescription: "Test page for validation",
  priority: 0.5,
  tags: [],
};

function makeProvenance(lastModified: string | null): MarkdownTwinProvenance {
  return {
    canonical: "https://example.com/test/",
    language: "de",
    lastModified,
    license: "https://example.com/ai.txt",
    generator: "test-generator",
    sourceKind: "test",
    semantic: semanticMeta,
  };
}

const body = `## Summary

Test summary.

## Business context

Test business context.
`;

function errorMessages(result: { data?: unknown }): string[] {
  const data = result.data as { diagnostics?: Array<{ message: string }> } | undefined;
  return (data?.diagnostics ?? []).map((d) => d.message);
}

describe("page.markdown.validate — lastModified null acceptance (RFC-0613)", () => {
  it("accepts lastModified: null without MDMETA-02 or MDMETA-04", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-md-validate-null-"));
    try {
      const publicDir = join(root, "public");
      await mkdir(publicDir, { recursive: true });
      const twin = buildMarkdownTwin(body, makeProvenance(null));
      await writeFile(join(publicDir, "test.md"), twin, "utf8");

      const result = await runPageMarkdownValidate(input, ctx(root));
      const errors = errorMessages(result);
      expect(errors).not.toContain(expect.stringContaining("MDMETA-02"));
      expect(errors).not.toContain(expect.stringContaining("MDMETA-04"));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts lastModified: valid date string without MDMETA-02 or MDMETA-04", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-md-validate-date-"));
    try {
      const publicDir = join(root, "public");
      await mkdir(publicDir, { recursive: true });
      const twin = buildMarkdownTwin(body, makeProvenance("2026-07-30"));
      await writeFile(join(publicDir, "test.md"), twin, "utf8");

      const result = await runPageMarkdownValidate(input, ctx(root));
      const errors = errorMessages(result);
      expect(errors).not.toContain(expect.stringContaining("MDMETA-02"));
      expect(errors).not.toContain(expect.stringContaining("MDMETA-04"));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid date string lastModified with MDMETA-04", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-md-validate-invalid-"));
    try {
      const publicDir = join(root, "public");
      await mkdir(publicDir, { recursive: true });
      const twin = buildMarkdownTwin(body, makeProvenance("2026-7-4"));
      await writeFile(join(publicDir, "test.md"), twin, "utf8");

      const result = await runPageMarkdownValidate(input, ctx(root));
      const errors = errorMessages(result);
      expect(result.exitCode).toBe(1);
      expect(errors.some((e) => e.includes("MDMETA-04"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects missing lastModified field with MDMETA-02", async () => {
    const root = await mkdtemp(join(tmpdir(), "page-md-validate-missing-"));
    try {
      const publicDir = join(root, "public");
      await mkdir(publicDir, { recursive: true });
      // Manually construct frontmatter without lastModified field
      const twin = `---
canonical: "https://example.com/test/"
language: "de"
contentHash: "sha256:fakesha"
license: "https://example.com/ai.txt"
generator: "test-generator"
sourceKind: "test"
id: "test-page"
route: "/test/"
title: "Test Page"
type: "content"
domain: "content"
audience: "general"
lang: "de"
metaDescription: "Test page for validation"
priority: 0.5
tags: []
schema: "gogol.markdown-twin@2"
---

${body}`;
      await writeFile(join(publicDir, "test.md"), twin, "utf8");

      const result = await runPageMarkdownValidate(input, ctx(root));
      const errors = errorMessages(result);
      expect(result.exitCode).toBe(1);
      expect(errors.some((e) => e.includes("MDMETA-02") && e.includes("lastModified"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts quoted "null" lastModified (parser converts to JS null)', async () => {
    const root = await mkdtemp(join(tmpdir(), "page-md-validate-quoted-null-"));
    try {
      const publicDir = join(root, "public");
      await mkdir(publicDir, { recursive: true });
      // Manually construct frontmatter with quoted "null" — parser strips quotes
      // and converts to JS null, so validator should accept it
      const twin = `---
canonical: "https://example.com/test/"
language: "de"
lastModified: "null"
contentHash: "sha256:fakesha"
license: "https://example.com/ai.txt"
generator: "test-generator"
sourceKind: "test"
id: "test-page"
route: "/test/"
title: "Test Page"
type: "content"
domain: "content"
audience: "general"
lang: "de"
metaDescription: "Test page for validation"
priority: 0.5
tags: []
schema: "gogol.markdown-twin@2"
---

${body}`;
      await writeFile(join(publicDir, "test.md"), twin, "utf8");

      const result = await runPageMarkdownValidate(input, ctx(root));
      const errors = errorMessages(result);
      expect(errors).not.toContain(expect.stringContaining("MDMETA-04"));
      expect(errors).not.toContain(expect.stringContaining("MDMETA-02"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
