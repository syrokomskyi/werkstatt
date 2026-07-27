/*
<MODULE_CONTRACT>
<purpose>
growth.experiment.validate + growth.experiment.archive — validates experiment
YAML files in packages/ontology/growth/experiments/ and cross-references with
system.md growth.experiments[] (DNA-29, RFC-0027).

growth.experiment.archive checks that archived experiments have a concluded date
and are not referenced in system.md.
</purpose>
<non-goals>
  <item>Do not run experiments at validation time — only validate structure and references.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0027): Initial creation.</item>
  <item>Architecture review 2026-07-10: Replace system.yaml reads with loadSystemManifest for system.md cross-reference checks.</item>
  <item>Architecture review 2026-07-10: Replace system.yaml reads with loadSystemManifest for system.md cross-reference checks.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { resultFromViolations } from "./result-helpers.ts";

// Valid experiment statuses
const VALID_STATUSES = new Set(["draft", "active", "concluded", "archived"]);

// ---------------------------------------------------------------------------
// runGrowthExperimentValidate
// ---------------------------------------------------------------------------

export async function runGrowthExperimentValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const appDir = context.site?.directory ?? process.cwd();
  const repoRoot = join(appDir, "..", "..");
  const experimentsDir = join(repoRoot, "packages", "ontology", "growth", "experiments");

  const knownExperimentIds = new Set<string>();

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(experimentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml"))) {
        continue;
      }

      const filePath = join(experimentsDir, entry.name);
      const rel = `packages/ontology/growth/experiments/${entry.name}`;

      let rawContent: string;
      try {
        rawContent = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = parseYaml(rawContent);
      } catch (err) {
        violations.push(`GX-01: ${rel}: YAML parse error — ${(err as Error).message}`);
        continue;
      }

      const doc = parsed as Record<string, unknown>;

      // id validation
      if (typeof doc["id"] !== "string" || !doc["id"]) {
        violations.push(`GX-02: ${rel}: missing required field "id"`);
      } else {
        knownExperimentIds.add(doc["id"]);
        const expectedId = entry.name.replace(/\.(yaml|yml)$/, "");
        if (doc["id"] !== expectedId) {
          violations.push(
            `GX-03: ${rel}: experiment id "${doc["id"]}" does not match filename "${expectedId}"`,
          );
        }
      }

      // Required fields
      for (const field of ["label", "hypothesis", "status"]) {
        if (typeof doc[field] !== "string" || !doc[field]) {
          violations.push(`GX-02: ${rel}: missing required field "${field}"`);
        }
      }

      // Status must be from closed vocabulary
      if (typeof doc["status"] === "string" && !VALID_STATUSES.has(doc["status"])) {
        violations.push(
          `GX-04: ${rel}: status "${doc["status"]}" is not valid. Must be one of: ${[...VALID_STATUSES].join(", ")}`,
        );
      }

      // variants must be an array with at least 2 entries
      if (!Array.isArray(doc["variants"]) || doc["variants"].length < 2) {
        violations.push(
          `GX-05: ${rel}: "variants" must be an array with at least 2 entries (control + at least one treatment)`,
        );
      } else {
        for (let i = 0; i < doc["variants"].length; i++) {
          const variant = doc["variants"][i] as Record<string, unknown>;
          if (!variant || typeof variant !== "object") {
            violations.push(`GX-06: ${rel}: variants[${i}] must be an object`);
            continue;
          }
          if (typeof variant["id"] !== "string" || !variant["id"]) {
            violations.push(`GX-06: ${rel}: variants[${i}].id is required`);
          }
          if (typeof variant["label"] !== "string" || !variant["label"]) {
            violations.push(`GX-06: ${rel}: variants[${i}].label is required`);
          }
        }
        // First variant must be "control"
        const firstVariant = doc["variants"][0] as Record<string, unknown>;
        if (typeof firstVariant?.["id"] === "string" && firstVariant["id"] !== "control") {
          violations.push(
            `GX-07: ${rel}: variants[0].id must be "control" (got "${firstVariant["id"]}"). The control variant must be listed first.`,
          );
        }
      }
    }
  } catch {
    // experiments dir absent — valid (no experiments)
  }

  // Cross-reference system.md growth.experiments[]
  try {
    const { manifest: system } = await loadSystemManifest(join(appDir, "src", "content"));
    const growth = system["growth"] as Record<string, unknown> | undefined;
    if (growth) {
      const experimentIds = (growth["experiments"] as string[] | undefined) ?? [];
      for (const expId of experimentIds) {
        if (!knownExperimentIds.has(expId)) {
          violations.push(
            `GX-08: system.md growth.experiments[] references "${expId}" but no matching file found in packages/ontology/growth/experiments/`,
          );
        }
      }
    }
  } catch {
    // No system.md — handled by system.manifest.validate
  }

  return resultFromViolations("growth.experiment.validate", violations);
}

// ---------------------------------------------------------------------------
// runGrowthExperimentArchive
// ---------------------------------------------------------------------------

/**
 * Validates archival hygiene:
 * - concluded/archived experiments must not appear in system.md growth.experiments[]
 * - concluded experiments must have a "concludedAt" date field
 */
export async function runGrowthExperimentArchive(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const appDir = context.site?.directory ?? process.cwd();
  const repoRoot = join(appDir, "..", "..");
  const experimentsDir = join(repoRoot, "packages", "ontology", "growth", "experiments");

  const concludedIds = new Set<string>();
  const archivedIds = new Set<string>();

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(experimentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml"))) {
        continue;
      }

      const filePath = join(experimentsDir, entry.name);
      const rel = `packages/ontology/growth/experiments/${entry.name}`;

      let rawContent: string;
      try {
        rawContent = await readFile(filePath, "utf8");
      } catch {
        continue;
      }

      let doc: Record<string, unknown>;
      try {
        doc = parseYaml(rawContent) as Record<string, unknown>;
      } catch {
        continue;
      }

      const id = doc["id"] as string | undefined;
      const status = doc["status"] as string | undefined;

      if (!id) continue;

      if (status === "concluded" || status === "archived") {
        if (status === "concluded") concludedIds.add(id);
        if (status === "archived") archivedIds.add(id);

        // concluded experiments must have concludedAt
        if (status === "concluded" && !doc["concludedAt"]) {
          violations.push(
            `GA-01: ${rel}: concluded experiment "${id}" is missing "concludedAt" date field`,
          );
        }
      }
    }
  } catch {
    // no experiments dir — no archival issues
    return resultFromViolations("growth.experiment.archive", []);
  }

  // Check system.md doesn't reference concluded/archived experiments
  try {
    const { manifest: system } = await loadSystemManifest(join(appDir, "src", "content"));
    const growth = system["growth"] as Record<string, unknown> | undefined;
    if (growth) {
      const experimentIds = (growth["experiments"] as string[] | undefined) ?? [];
      for (const expId of experimentIds) {
        if (concludedIds.has(expId)) {
          violations.push(
            `GA-02: system.md growth.experiments[] references concluded experiment "${expId}" — remove it or revert status to "active"`,
          );
        }
        if (archivedIds.has(expId)) {
          violations.push(
            `GA-02: system.md growth.experiments[] references archived experiment "${expId}" — remove it`,
          );
        }
      }
    }
  } catch {
    // No system.md — handled by system.manifest.validate
  }

  return resultFromViolations("growth.experiment.archive", violations);
}
