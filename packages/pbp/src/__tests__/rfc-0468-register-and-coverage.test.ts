/*
<MODULE_CONTRACT>
<purpose>RFC-0468: validate owner-decision-register.yaml and migration-coverage-report.yaml
structure and coverage for the Webgogol PBP content tree.</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0468: initial tests for owner decision register and migration coverage report.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkdownFrontmatter } from "@gogol/site-kernel-content";

const WORKSPACE_ROOT = join(fileURLToPath(new URL("../../../..", import.meta.url)));
const BIZ_PROFILE_DIR = join(WORKSPACE_ROOT, "systems/webgogol-com/src/content/business-profile");

function readYaml(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const wrapped = `---\n${raw}\n---\n`;
  return parseMarkdownFrontmatter(wrapped).data;
}

describe("RFC-0468: owner-decision-register.yaml", () => {
  it("file exists at expected path", () => {
    const registerPath = join(BIZ_PROFILE_DIR, "owner-decision-register.yaml");
    expect(existsSync(registerPath)).toBe(true);
  });

  it("has schemaVersion 1.0.0", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    expect(data.schemaVersion).toBe("1.0.0");
  });

  it("contains exactly 28 items", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(28);
  });

  it("all items have id, topic, question, status, blocks fields", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.id).toBeDefined();
      expect(item.topic).toBeDefined();
      expect(item.question).toBeDefined();
      expect(item.status).toBeDefined();
      expect(item.blocks).toBeDefined();
    }
  });

  it("ids are sequential 1 through 28", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    for (let i = 0; i < 28; i++) {
      expect(items[i]!.id).toBe(i + 1);
    }
  });

  it("all items have status: open (blocking decisions unresolved)", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item.status).toBe("open");
    }
  });

  it("blocks field is an array (possibly empty)", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(Array.isArray(item.blocks)).toBe(true);
    }
  });

  it("covers all 4 categories from spec §28", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "owner-decision-register.yaml"));
    const items = data.items as Array<Record<string, unknown>>;
    const topics = items.map((i) => i.topic as string);
    // Business/legal: items 1-4
    expect(topics[0]).toBe("public-legal-form");
    expect(topics[3]).toBe("business-jurisdiction-semantics");
    // Pricing: items 5-10
    expect(topics[4]).toBe("price-tax-disclosure");
    expect(topics[9]).toBe("hourly-rate-meaning");
    // SLA/guarantees: items 11-20
    expect(topics[10]).toBe("availability-sla-metric");
    expect(topics[19]).toBe("backup-retention-public-or-internal");
    // Claims/evidence: items 26-28
    expect(topics[25]).toBe("platform-comparison-exact-sources");
    expect(topics[27]).toBe("gobd-statement-meaning");
  });
});

describe("RFC-0468: migration-coverage-report.yaml", () => {
  it("file exists at expected path", () => {
    const reportPath = join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml");
    expect(existsSync(reportPath)).toBe(true);
  });

  it("has schemaVersion 1.0.0", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.schemaVersion).toBe("1.0.0");
  });

  it("reports 100% coverage", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.coveragePercentage).toBe(100);
  });

  it("totalLegacyEntities is 19", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.totalLegacyEntities).toBe(18);
  });

  it("mappedEntities equals totalLegacyEntities", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.mappedEntities).toBe(data.totalLegacyEntities);
  });

  it("unmappedEntities is empty", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.unmappedEntities).toEqual([]);
  });

  it("verifiedEntities equals mappedEntities", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    expect(data.verifiedEntities).toBe(data.mappedEntities);
  });

  it("legacySourceMappings covers all 19 legacy files", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    const mappings = data.legacySourceMappings as Array<Record<string, unknown>>;
    expect(mappings).toHaveLength(18);
  });

  it("each mapping has legacyFile, targetEntities, and category", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    const mappings = data.legacySourceMappings as Array<Record<string, unknown>>;
    for (const mapping of mappings) {
      expect(mapping.legacyFile).toBeDefined();
      expect(mapping.targetEntities).toBeDefined();
      expect(mapping.category).toBeDefined();
    }
  });

  it("includes all required legacy files", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    const mappings = data.legacySourceMappings as Array<Record<string, unknown>>;
    const legacyFiles = mappings.map((m) => m.legacyFile as string);
    const required = [
      "company.md",
      "offer.md",
      "contact.md",
      "legal.md",
      "location.md",
      "web.md",
      "compliance.md",
      "external-services.md",
      "meta.md",
      "platform-comparison.md",
      "services.md",
    ];
    for (const file of required) {
      expect(legacyFiles).toContain(file);
    }
  });

  it("validation has no errors", () => {
    const data = readYaml(join(BIZ_PROFILE_DIR, "migration-coverage-report.yaml"));
    const validation = data.validation as Record<string, unknown[]>;
    expect(validation.errors).toEqual([]);
  });
});
