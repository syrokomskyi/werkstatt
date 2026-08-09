/*
<MODULE_CONTRACT>
<purpose>
growth.events.validate — validates that every emit() call in the app source
references a valid event name from the closed EventName catalog (DNA-27, RFC-0027).
Also validates that the ontology event catalog files in packages/ontology/growth/events/
are well-formed YAML with required fields: id, label, category, payload.
Also verifies that every event name in the closed catalog has a corresponding .yaml
file in packages/ontology/growth/events/ (ontology coverage check — RFC-0027 AC).
</purpose>
<non-goals>
  <item>Do not validate payload shapes at runtime — only catalog membership and YAML structure.</item>
  <item>Do not validate adapter implementations.</item>
  <item>Do not maintain a hardcoded duplicate of the event name list — import EVENT_NAMES instead.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0027): Initial creation.</item>
  <item>RFC-0030 defect fix: Replace hardcoded VALID_EVENT_NAMES set with imported EVENT_NAMES from
    @warpgogol/werkstatt-site/growth (single source of truth — DNA-27 / RFC-0027 AC).</item>
  <item>RFC-0030 defect fix: Add ontology coverage check — every EVENT_NAMES entry must have a
    corresponding .yaml file in packages/ontology/growth/events/.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { EVENT_NAMES } from "@warpgogol/werkstatt-site/growth/adapter";
import { resultFromViolations } from "./result-helpers.ts";

// ---------------------------------------------------------------------------
// Single source of truth — derived from @warpgogol/werkstatt-site/growth EVENT_NAMES (DNA-27)
// Do NOT maintain a separate hardcoded set here.
// ---------------------------------------------------------------------------

const VALID_EVENT_NAMES = new Set<string>(EVENT_NAMES);

// Pattern to match emit("event-name", ...) calls
const EMIT_CALL_PATTERN = /\bemit\(\s*["']([^"']+)["']/g;

// ---------------------------------------------------------------------------
// runGrowthEventsValidate
// ---------------------------------------------------------------------------

export async function runGrowthEventsValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  const appDir = context.site?.directory ?? process.cwd();
  const workspaceRoot = context.workspaceRoot;

  const ontologyEventsDir = join(workspaceRoot, "packages", "ontology", "growth", "events");

  // ---- Part 1: Validate ontology event YAML structure + ontology coverage ----

  const foundEventIds = new Set<string>();

  try {
    const entries = await readdir(ontologyEventsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml"))) {
        continue;
      }

      const filePath = join(ontologyEventsDir, entry.name);
      const rel = `packages/ontology/growth/events/${entry.name}`;

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
        violations.push(`GE-01: ${rel}: YAML parse error — ${(err as Error).message}`);
        continue;
      }

      if (parsed === null || typeof parsed !== "object") {
        violations.push(`GE-01: ${rel}: YAML parsed to null or non-object`);
        continue;
      }

      const doc = parsed as Record<string, unknown>;
      const requiredFields = ["id", "label", "category", "payload"];
      for (const field of requiredFields) {
        if (!(field in doc) || doc[field] === undefined || doc[field] === null) {
          violations.push(`GE-02: ${rel}: missing required field "${field}"`);
        }
      }

      if (typeof doc["id"] === "string") {
        foundEventIds.add(doc["id"]);

        // id must be in the closed catalog
        if (!VALID_EVENT_NAMES.has(doc["id"])) {
          violations.push(
            `GE-03: ${rel}: event id "${doc["id"]}" is not in the closed EventName catalog. ` +
              `Valid names: ${[...VALID_EVENT_NAMES].join(", ")}`,
          );
        }
      }
    }
  } catch {
    violations.push(
      "GE-00: packages/ontology/growth/events/ directory not found — growth event catalog is missing",
    );
  }

  // ---- Part 2: Ontology coverage — every EVENT_NAMES entry must have a .yaml file ----
  // This closes the RFC-0027 AC: validator reads actual .yaml files, not just a hardcoded set.

  for (const eventName of EVENT_NAMES) {
    if (!foundEventIds.has(eventName)) {
      violations.push(
        `GE-05: packages/ontology/growth/events/${eventName}.yaml is missing — ` +
          `every event in the closed EventName catalog must have a corresponding ontology file.`,
      );
    }
  }

  // ---- Part 3: Scan app source for emit() calls ----

  const srcDir = join(appDir, "src");
  const tsFiles: string[] = [];

  try {
    const collect = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (
          entry.isDirectory() &&
          entry.name !== "node_modules" &&
          entry.name !== ".astro" &&
          entry.name !== "dist"
        ) {
          await collect(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith(".ts") ||
            entry.name.endsWith(".tsx") ||
            entry.name.endsWith(".astro"))
        ) {
          tsFiles.push(fullPath);
        }
      }
    };
    await collect(srcDir);
  } catch {
    // src/ not found — handled by app.layout.validate
  }

  for (const filePath of tsFiles) {
    const rel = relative(appDir, filePath).replace(/\\/g, "/");

    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    // Only check files that import from @warpgogol/werkstatt-site/growth
    if (!content.includes("@warpgogol/werkstatt-site/growth")) continue;

    let match: RegExpExecArray | null;
    EMIT_CALL_PATTERN.lastIndex = 0;
    while ((match = EMIT_CALL_PATTERN.exec(content)) !== null) {
      const eventName = match[1];
      if (!VALID_EVENT_NAMES.has(eventName)) {
        const lineNumber = content.slice(0, match.index).split("\n").length;
        violations.push(
          `GE-04: ${rel}:${lineNumber}: emit() called with unknown event "${eventName}". ` +
            `Valid names: ${[...VALID_EVENT_NAMES].join(", ")}`,
        );
      }
    }
  }

  return resultFromViolations("growth.events.validate", violations);
}
