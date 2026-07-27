/*
<MODULE_CONTRACT>
<purpose>Golden fixture tests for the PBP compiler pipeline (RFC-0467).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — compiler pipeline golden fixture tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compilePbpProfile } from "../index.js";
import type { PbpCompilerInput } from "../index.js";

let testDir: string;

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `pbp-compiler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeEntity(locale: string, filename: string, data: Record<string, unknown>): void {
  const dir = join(testDir, locale);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n`);
}

describe("PBP Compiler Pipeline", () => {
  it("compiles a minimal valid business profile", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.inventory.recordsDiscovered).toBe(1);
    expect(result.resolvedGraph.business.id).toBe("https://wgogol.com/business");
    expect(result.resolvedGraph.business.name).toBe("Webgogol");
    expect(result.validationErrors).toHaveLength(0);
    expect(result.graphErrors).toHaveLength(0);
    expect(result.context.locale).toBe("de");
    expect(result.context.sourceRevision).toBeDefined();
  });

  it("detects duplicate entity IDs as fatal errors", async () => {
    writeEntity("de", "business-a.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
    });
    writeEntity("de", "business-b.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol Duplicate",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const dupErrors = result.validationErrors.filter(
      (e: { code: string }) => e.code === "PBP-ID-DUPLICATE",
    );
    expect(dupErrors.length).toBeGreaterThan(0);
  });

  it("detects missing Business singleton", async () => {
    writeEntity("de", "place.md", {
      schema: "pbp/place@1",
      id: "https://wgogol.com/places/office",
      type: "place",
      status: "published",
      name: "Office",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    await expect(compilePbpProfile(input)).rejects.toThrow(/No Business entity/);
  });

  it("detects dangling references", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
      legalIdentityRef: {
        ref: "https://wgogol.com/legal-identity",
        expectedType: "legal-identity",
      },
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    const danglingErrors = result.graphErrors.filter(
      (e: { kind: string }) => e.kind === "missing-internal-ref",
    );
    expect(danglingErrors.length).toBeGreaterThan(0);
  });

  it("detects HTML in canonical fields", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "<b>Webgogol</b>",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "migration",
    };

    const result = await compilePbpProfile(input);

    const htmlErrors = result.validationErrors.filter(
      (e: { code: string }) => e.code === "PBP-HTML",
    );
    expect(htmlErrors.length).toBeGreaterThan(0);
  });

  it("handles empty source directory gracefully", async () => {
    const input: PbpCompilerInput = {
      sourceDirectory: join(testDir, "nonexistent"),
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    await expect(compilePbpProfile(input)).rejects.toThrow(/No Business entity/);
  });

  it("produces deterministic results across runs", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
      summary: "Software development studio",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
      buildTime: "2026-07-20T00:00:00.000Z",
    };

    const result1 = await compilePbpProfile(input);
    const result2 = await compilePbpProfile(input);

    expect(result1.inventory.recordsDiscovered).toBe(result2.inventory.recordsDiscovered);
    expect(result1.entityIndex.size).toBe(result2.entityIndex.size);
    expect(result1.validationErrors.length).toBe(result2.validationErrors.length);
    expect(result1.graphErrors.length).toBe(result2.graphErrors.length);
    expect(result1.context.buildId).toBe(result2.context.buildId);
  });

  it("runs cycle detection on the entity graph", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.cycleResults).toHaveLength(5);
    for (const cycleResult of result.cycleResults) {
      expect(cycleResult.hasCycle).toBe(false);
    }
  });

  it("generates Schema.org projection with organization data", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://wgogol.com/business",
      type: "business",
      status: "published",
      name: "Webgogol",
    });

    const input: PbpCompilerInput = {
      sourceDirectory: testDir,
      locale: "de",
      defaultLocale: "de",
      strictness: "production",
    };

    const result = await compilePbpProfile(input);

    expect(result.projections.schemaOrg["@type"]).toBe("Organization");
    expect(result.projections.schemaOrg.name).toBe("Webgogol");
  });
});
