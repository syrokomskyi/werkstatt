/*
<MODULE_CONTRACT>
<purpose>
growth.funnel.validate — validates funnel definitions in packages/ontology/growth/funnels/
and cross-references funnels declared in system.md growth.funnels[] (DNA-28, RFC-0027).
</purpose>
<non-goals>
  <item>Do not validate funnel runtime execution — only structure and cross-references.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0027): Initial creation.</item>
  <item>Architecture review 2026-07-10: Replace hardcoded VALID_EVENT_NAMES with EVENT_NAMES from @gogol/growth; replace system.yaml reads with loadSystemManifest.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { EVENT_NAMES } from "@gogol/growth";
import { resultFromViolations } from "./result-helpers.ts";

const VALID_EVENT_NAMES = new Set<string>(EVENT_NAMES);

export async function runGrowthFunnelValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const appDir = context.site?.directory ?? process.cwd();
  const repoRoot = join(appDir, "..", "..");
  const funnelsDir = join(repoRoot, "packages", "ontology", "growth", "funnels");

  // Part 1: Validate all funnel YAML files
  const knownFunnelIds = new Set<string>();

  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(funnelsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml"))) {
        continue;
      }

      const filePath = join(funnelsDir, entry.name);
      const rel = `packages/ontology/growth/funnels/${entry.name}`;

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
        violations.push(`GF-01: ${rel}: YAML parse error — ${(err as Error).message}`);
        continue;
      }

      const doc = parsed as Record<string, unknown>;

      // Required fields
      if (typeof doc["id"] !== "string" || !doc["id"]) {
        violations.push(`GF-02: ${rel}: missing required field "id"`);
      } else {
        knownFunnelIds.add(doc["id"]);
        // id must match filename (without extension)
        const expectedId = entry.name.replace(/\.(yaml|yml)$/, "");
        if (doc["id"] !== expectedId) {
          violations.push(
            `GF-03: ${rel}: funnel id "${doc["id"]}" does not match filename "${expectedId}"`,
          );
        }
      }

      if (typeof doc["label"] !== "string" || !doc["label"]) {
        violations.push(`GF-02: ${rel}: missing required field "label"`);
      }

      if (!Array.isArray(doc["steps"]) || doc["steps"].length < 2) {
        violations.push(`GF-04: ${rel}: "steps" must be an array with at least 2 entries`);
      } else {
        // Validate each step
        for (let i = 0; i < doc["steps"].length; i++) {
          const step = doc["steps"][i] as Record<string, unknown>;
          if (!step || typeof step !== "object") {
            violations.push(`GF-05: ${rel}: steps[${i}] must be an object`);
            continue;
          }
          if (typeof step["id"] !== "string" || !step["id"]) {
            violations.push(`GF-05: ${rel}: steps[${i}].id is required`);
          }
          if (typeof step["label"] !== "string" || !step["label"]) {
            violations.push(`GF-05: ${rel}: steps[${i}].label is required`);
          }
          if (typeof step["event"] !== "string") {
            violations.push(`GF-06: ${rel}: steps[${i}].event is required`);
          } else if (!VALID_EVENT_NAMES.has(step["event"])) {
            violations.push(
              `GF-06: ${rel}: steps[${i}].event "${step["event"]}" is not in the closed EventName catalog`,
            );
          }
        }
      }
    }
  } catch {
    // funnels dir absent — not an error (no funnels is valid)
  }

  // Part 2: Cross-reference system.md growth.funnels[]
  try {
    const { manifest: system } = await loadSystemManifest(join(appDir, "src", "content"));
    const growth = system["growth"] as Record<string, unknown> | undefined;
    if (growth) {
      const funnelIds = (growth["funnels"] as string[] | undefined) ?? [];
      for (const funnelId of funnelIds) {
        if (!knownFunnelIds.has(funnelId)) {
          violations.push(
            `GF-07: system.md growth.funnels[] references "${funnelId}" but no matching file found in packages/ontology/growth/funnels/`,
          );
        }
      }
    }
  } catch {
    // No system.md or no growth block — handled by system.manifest.validate
  }

  return resultFromViolations("growth.funnel.validate", violations);
}
