/*
<MODULE_CONTRACT>
<purpose>RFC-0665: Zod schemas and loader for the workshop-level methodologies config at systems/methodologies.md. Defines the shape for instruments, methodologies, gate, and evidence-metadata extension.</purpose>
<non-goals>
  <item>Does not execute methodologies — that belongs in mission.check and the external Axiom package.</item>
  <item>Does not validate methodology IDs against the external package — that belongs in methodologies.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0665: initial implementation of methodologies config schema and loader.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

export const instrumentConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "accessibility",
    "runtime-health",
    "seo-runtime",
    "security-headers",
    "performance-vitals",
    "visual-regression",
    "privacy-consent",
    "multilingual-consistency",
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const methodologyConfigSchema = z.object({
  id: z.string().min(1),
  instrument: z.string().min(1),
  active: z.boolean().default(true),
  blockOn: z.array(z.enum(["low", "medium", "high", "critical"])).default(["high", "critical"]),
});

export const gateConfigSchema = z.object({
  aggregation: z.literal("all-must-pass"),
  allowIncomplete: z.boolean().default(true),
  requireEvidence: z.boolean().default(true),
  minCoverage: z.number().min(0).max(1).default(1.0),
});

export const methodologiesConfigSchema = z.object({
  instruments: z.array(instrumentConfigSchema),
  methodologies: z.array(methodologyConfigSchema),
  gate: gateConfigSchema,
});

export const methodologyEvidenceSchema = z.object({
  id: z.string().min(1),
  digest: z.string().min(1),
  blockOn: z.array(z.enum(["low", "medium", "high", "critical"])),
});

export const evidenceMetadataSchema = z.object({
  missionId: z.string().min(1),
  commitSha: z.string().optional(),
  runTimestamp: z.string().min(1),
  methodologies: z.array(methodologyEvidenceSchema),
});

export type InstrumentConfig = z.infer<typeof instrumentConfigSchema>;
export type MethodologyConfig = z.infer<typeof methodologyConfigSchema>;
export type GateConfig = z.infer<typeof gateConfigSchema>;
export type MethodologiesConfig = z.infer<typeof methodologiesConfigSchema>;
export type MethodologyEvidence = z.infer<typeof methodologyEvidenceSchema>;

export const METHODOLOGIES_CONFIG_PATH = "systems/methodologies.md";

export const KNOWN_METHODOLOGY_IDS = [
  "automated-web-accessibility",
  "multilingual-content-consistency",
  "runtime-functional-health",
  "privacy-consent-compliance",
  "seo-technical-runtime",
  "security-headers",
  "performance-vitals",
  "visual-regression",
] as const;

export const KNOWN_INSTRUMENT_TYPES = [
  "accessibility",
  "runtime-health",
  "seo-runtime",
  "security-headers",
  "performance-vitals",
  "visual-regression",
  "privacy-consent",
  "multilingual-consistency",
] as const;

export function parseMethodologiesConfig(content: string): MethodologiesConfig {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("No YAML frontmatter found in methodologies config.");
  }
  const yamlContent = frontmatterMatch[1];
  const raw = parseYaml(yamlContent) as unknown;
  return methodologiesConfigSchema.parse(raw);
}

export function loadMethodologiesConfig(workspaceRoot: string): MethodologiesConfig {
  const absPath = join(workspaceRoot, METHODOLOGIES_CONFIG_PATH);
  const content = readFileSync(absPath, "utf-8");
  return parseMethodologiesConfig(content);
}

export function tryLoadMethodologiesConfig(
  workspaceRoot: string,
): { ok: true; config: MethodologiesConfig } | { ok: false; error: string } {
  try {
    const config = loadMethodologiesConfig(workspaceRoot);
    return { ok: true, config };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
