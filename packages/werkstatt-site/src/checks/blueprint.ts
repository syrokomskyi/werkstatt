import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0193] blueprint.validate: validate every Programmatic Surface Blueprint
  (packages/ontology/blueprints/*.yaml) against the schema and cross-check it against the app's
  datasets — axis universe collections + the record dataset must exist, and every level slug
  template may only reference axes in scope at that depth. No-op pass when `pseo` is not entitled.
</purpose>
<non-goals>
  <item>Do not expand the surface (surface.generate) or check constellations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0193: initial validator.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parseBlueprint, type Blueprint } from "@warpgogol/werkstatt-site/surface";
import { failResult, passResult } from "./result-helpers.ts";
import { readDeclaredBlueprints } from "./surface-expand.ts";

const BLUEPRINTS_DIR = join("packages", "ontology", "blueprints");

async function readEntitledFeatures(appDir: string): Promise<string[] | null> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) ? parsed.features.map(String) : null;
  } catch {
    return null;
  }
}

function tokensIn(template: string): string[] {
  return [...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!);
}

function collectionExists(appDir: string, collection: string): boolean {
  return existsSync(join(appDir, "src", "content", "surface", collection));
}

function validateBlueprint(bp: Blueprint, appDir: string, explicitlyDeclared: boolean): string[] {
  const violations: string[] = [];
  const axisOrder = bp.axes.map((a) => a.id);

  // Adoption: a Blueprint applies either because system.md `surface.blueprints` lists it
  // (explicit) or, in legacy mode, because the app ships its dataset collection. A site that
  // explicitly adopts a Blueprint MUST ship its dataset (missing → error); a non-adopted
  // Blueprint skips the dataset cross-checks.
  if (!collectionExists(appDir, bp.dataset.collection)) {
    if (explicitlyDeclared) {
      violations.push(
        `${bp.id}: declared in system.md surface.blueprints but its dataset collection "${bp.dataset.collection}" is not present under src/content/surface/`,
      );
    }
    return violations;
  }
  for (const axis of bp.axes) {
    if ("provider" in axis.universe) continue; // RFC-0238: geo provider axes have no content collection
    if (!collectionExists(appDir, axis.universe.collection)) {
      violations.push(
        `${bp.id}: axis "${axis.id}" universe collection "${axis.universe.collection}" not found under src/content/surface/`,
      );
    }
  }

  // Level slug templates may only reference axes in scope at that depth.
  for (const level of bp.levels) {
    const inScope = new Set(axisOrder.slice(0, level.depth));
    for (const template of Object.values(level.slug)) {
      for (const token of tokensIn(template)) {
        if (!inScope.has(token)) {
          violations.push(
            `${bp.id}: level depth ${level.depth} slug "${template}" references axis "${token}" not in scope`,
          );
        }
      }
    }
  }

  return violations;
}

export async function runBlueprintValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "blueprint.validate must run inside an app context." };
  }

  const features = await readEntitledFeatures(app.directory);
  const pseoEntitled = features === null || features.includes("pseo");
  if (!pseoEntitled) {
    return passResult("blueprint.validate", "skipped (pseo not entitled)");
  }

  const dir = join(context.workspaceRoot, BLUEPRINTS_DIR);
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return passResult("blueprint.validate", "skipped (no blueprints)");
  }

  // RFC-0193: explicit adoption list from system.md (null ⇒ legacy opt-in by datasets).
  const declared = await readDeclaredBlueprints(app.directory);

  const { parse } = await import("yaml");
  const violations: string[] = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8");
    let parsedYaml: unknown;
    try {
      parsedYaml = parse(raw);
    } catch (err) {
      violations.push(
        `${file}: invalid YAML (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    const parsed = parseBlueprint(parsedYaml);
    if (!parsed.ok || !parsed.blueprint) {
      violations.push(...parsed.errors.map((e) => `${file}: ${e}`));
      continue;
    }
    const bp = parsed.blueprint;
    const explicitlyDeclared = declared !== null && declared.includes(bp.id);
    // In explicit mode, skip Blueprints the site did not adopt.
    if (declared !== null && !explicitlyDeclared) continue;
    violations.push(...validateBlueprint(bp, app.directory, explicitlyDeclared));
  }

  // Explicit mode: a declared Blueprint id with no matching YAML file is an error.
  if (declared !== null) {
    const known = new Set<string>();
    for (const file of files) {
      try {
        const parsed = parseBlueprint(parse(await readFile(join(dir, file), "utf8")));
        if (parsed.ok && parsed.blueprint) known.add(parsed.blueprint.id);
      } catch {
        /* already reported above */
      }
    }
    for (const id of declared) {
      if (!known.has(id)) {
        violations.push(`system.md surface.blueprints lists "${id}" but no such Blueprint exists`);
      }
    }
  }

  if (violations.length > 0) {
    return failResult("blueprint.validate", violations);
  }
  return passResult("blueprint.validate", `ok (${files.length} blueprint(s))`);
}
