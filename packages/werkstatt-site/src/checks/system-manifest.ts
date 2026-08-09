/*
<MODULE_CONTRACT>
<purpose>
Implements system.manifest.validate and constellation.compose.validate —
the OS commands that enforce the per-app src/content/system.md contract and the
constellation composition order (DNA-23, RFC-0025, RFC-0077).
</purpose>
<non-goals>
  <item>Do not validate biome tokens (biome.contract.validate handles that).</item>
  <item>Do not generate files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>RFC-0077: Remove system.yaml compatibility and fail on legacy manifest presence.</item>
  <item>RFC-0328: Reject sitemap category "legal" unless semanticType is "legal".</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { systemManifestSchema, constellationSchema } from "@warpgogol/werkstatt-site/ontology/schemas";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { fileExists } from "./lib/file-exists.ts";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function readYaml(p: string): Promise<unknown> {
  const raw = await readFile(p, "utf-8");
  return parseYaml(raw);
}

/** Recursively collect all *.manifest.yaml files under a directory. */
async function collectManifests(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".manifest.yaml"], ignore: () => false });
}

// ---------------------------------------------------------------------------
// system.manifest.validate
// ---------------------------------------------------------------------------

interface SystemViolation {
  file: string;
  errors: string[];
}

interface SystemManifestResult {
  systemsScanned: number;
  violations: number;
  details: SystemViolation[];
}

/**
 * Validates apps/<app>/src/content/system.md:
 *   1. Parses against systemManifestSchema.
 *   2. Checks identity.systemStar is used as cosmicName in at least one page manifest.
 *   3. Checks all constellations[] slugs resolve to existing YAML files.
 */
export async function runSystemManifestValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SystemManifestResult>> {
  const appsDir = join(context.workspaceRoot, "apps");
  const constellationsDir = join(context.workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ontology", "constellations");

  let appEntries: string[] = [];
  try {
    appEntries = await readdir(appsDir);
  } catch {
    // no apps dir
  }

  // Filter to the specific app if running in app scope
  if (context.site?.directory) {
    const slug = context.site.directory.split(/[/\\]/).pop() ?? "";
    appEntries = appEntries.filter((e) => e === slug);
  }

  const details: SystemViolation[] = [];
  let systemsScanned = 0;

  for (const appSlug of appEntries) {
    const appDir = join(appsDir, appSlug);
    const contentDir = join(appDir, "src", "content");
    const legacySystemYamlPath = join(appDir, "system.yaml");

    if (await fileExists(legacySystemYamlPath)) {
      const rel = relative(context.workspaceRoot, legacySystemYamlPath);
      details.push({
        file: rel,
        errors: [
          "Legacy app-level system.yaml is no longer supported; use src/content/system.md only.",
        ],
      });
      context.logger.error(`${rel}: legacy system.yaml is no longer supported`);
    }

    let systemResult;
    try {
      systemResult = await loadSystemManifest(contentDir);
    } catch (e) {
      const rel = `apps/${appSlug}/src/content/system.md`;
      details.push({
        file: rel,
        errors: [
          `System manifest not found or unreadable: ${e instanceof Error ? e.message : String(e)}`,
        ],
      });
      context.logger.error(`${rel}: missing or unreadable`);
      continue;
    }

    const rel = relative(context.workspaceRoot, systemResult.filePath);
    systemsScanned++;

    // Validate the parsed data against the schema
    const result = systemManifestSchema.safeParse(systemResult.manifest);
    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.map(String).join(".")}: ${i.message}`,
      );
      details.push({ file: rel, errors });
      for (const e of errors) context.logger.error(`${rel}: ${e}`);
      continue;
    }

    const system = result.data;
    const errors: string[] = [];

    // 2. Check systemStar is used in at least one page manifest
    // Page manifests live in packages/werkstatt-site/src/domain/ui/pages/ (RFC-0023), not in apps/*/src/
    const pagesDir = join(context.workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "src", "pages");
    const pageCosmicNames = new Set<string>();

    try {
      const manifestFiles = await collectManifests(pagesDir);
      for (const mPath of manifestFiles) {
        try {
          const m = (await readYaml(mPath)) as { layer?: string; cosmicName?: string };
          if (m.layer === "page" && m.cosmicName) {
            pageCosmicNames.add(m.cosmicName);
          }
        } catch {
          // skip unparseable manifests — manifest.contract.validate reports those
        }
      }
    } catch {
      // directory doesn't exist — skip silently
    }

    if (!pageCosmicNames.has(system.identity.systemStar)) {
      const msg =
        `identity.systemStar "${system.identity.systemStar}" is not used as cosmicName ` +
        `in any page manifest in packages/werkstatt-site/src/domain/ui/pages/`;
      errors.push(msg);
      context.logger.error(`${rel}: ${msg}`);
    }

    // 3. Check constellation slugs resolve
    for (const slug of system.constellations ?? []) {
      const constellationPath = join(constellationsDir, `${slug}.yaml`);
      if (!(await fileExists(constellationPath))) {
        const msg = `constellations[] entry "${slug}" has no matching packages/werkstatt-site/src/domain/ontology/constellations/${slug}.yaml`;
        errors.push(msg);
        context.logger.error(`${rel}: ${msg}`);
      }
    }

    const configuredPageIds = new Set((system.pages ?? []).map((page) => page.pageId));
    for (const pageId of system.sharedContext?.requiredPageIds ?? []) {
      if (!configuredPageIds.has(pageId)) {
        const msg = `sharedContext.requiredPageIds contains "${pageId}" but pages[] has no matching pageId`;
        errors.push(msg);
        context.logger.error(`${rel}: ${msg}`);
      }
    }

    // RFC-0328: legal pages must be declared via semanticType: legal; the
    // sitemap category "legal" is only permitted for that semantic type.
    for (const page of system.pages ?? []) {
      const outputSitemap = page.output?.sitemap;
      const outputCategory = typeof outputSitemap === "object" ? outputSitemap.category : undefined;
      const isLegalSemanticType = page.semanticType === "legal";

      if (outputCategory === "legal" && !isLegalSemanticType) {
        const msg = `page "${page.pageId}" uses sitemap category "legal" with semanticType "${page.semanticType ?? "content"}"; use semanticType: legal (RFC-0328).`;
        errors.push(msg);
        context.logger.error(`${rel}: ${msg}`);
      }
    }

    if (errors.length > 0) {
      details.push({ file: rel, errors });
    }
  }

  const totalViolations = details.length;

  if (totalViolations === 0) {
    context.logger.info(
      `system.manifest.validate: OK — ${systemsScanned} system manifest${systemsScanned === 1 ? "" : "s"} valid`,
    );
  }

  return {
    data: { systemsScanned, violations: totalViolations, details },
    exitCode: totalViolations > 0 ? 1 : 0,
    summary: totalViolations === 0 ? `OK — ${systemsScanned} system manifests valid` : undefined,
  };
}

// ---------------------------------------------------------------------------
// constellation.compose.validate
// ---------------------------------------------------------------------------

interface ComposeViolation {
  app: string;
  constellation: string;
  errors: string[];
  warnings: string[];
}

interface ComposeResult {
  constellationsChecked: number;
  violations: number;
  warnings: number;
  details: ComposeViolation[];
}

/**
 * For each constellation listed in system.md, compares the constellation's
 * required slot order against the section manifests present in the app.
 * Reports:
 *   - ERROR: required slot missing entirely
 *   - ERROR: required slots present but in wrong order relative to each other
 *   - WARNING: optional slot missing
 */
export async function runConstellationComposeValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ComposeResult>> {
  const appsDir = join(context.workspaceRoot, "apps");
  const constellationsDir = join(context.workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ontology", "constellations");

  let appEntries: string[] = [];
  try {
    appEntries = await readdir(appsDir);
  } catch {
    // no apps dir
  }

  if (context.site?.directory) {
    const slug = context.site.directory.split(/[/\\]/).pop() ?? "";
    appEntries = appEntries.filter((e) => e === slug);
  }

  const details: ComposeViolation[] = [];
  let constellationsChecked = 0;
  const totalWarnings: number = 0;

  for (const appSlug of appEntries) {
    let system;
    try {
      const systemResult = await loadSystemManifest(join(appsDir, appSlug, "src", "content"));
      const r = systemManifestSchema.safeParse(systemResult.manifest);
      if (!r.success) continue;
      system = r.data;
    } catch {
      continue;
    }

    if (!system.constellations?.length) continue;

    for (const slug of system.constellations) {
      const cPath = join(constellationsDir, `${slug}.yaml`);
      if (!(await fileExists(cPath))) continue; // system.manifest.validate already errors

      constellationsChecked++;

      let constellation;
      try {
        const parsed = await readYaml(cPath);
        const r = constellationSchema.safeParse(parsed);
        if (!r.success) continue;
        constellation = r.data;
      } catch {
        continue;
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Find pages that use this constellation (by constellation field)
      const pagesUsingConstellation = system.pages?.filter((p) => p.constellation === slug) ?? [];

      if (pagesUsingConstellation.length === 0) {
        warnings.push(`No pages with constellation "${slug}" found to validate`);
        continue;
      }

      // Check each page using this constellation
      for (const page of pagesUsingConstellation) {
        const pagePlanets = page.planets?.map((p) => p.cosmicPlanet) ?? [];

        // Check each slot
        const presentRequiredIndices: number[] = [];

        for (const slot of constellation.slots) {
          const idx = pagePlanets.indexOf(slot.cosmicName);
          const present = idx !== -1;

          if (!present && !slot.optional) {
            errors.push(
              `Required slot "${slot.cosmicName}" (${slot.label}) is missing from page "${page.route}"`,
            );
            context.logger.error(
              `apps/${appSlug}: constellation "${slug}" — required slot "${slot.cosmicName}" missing`,
            );
          } else if (!present && slot.optional) {
            warnings.push(
              `Optional slot "${slot.cosmicName}" (${slot.label}) not present on page "${page.route}"`,
            );
          } else {
            presentRequiredIndices.push(idx);
          }
        }

        // Check required slots maintain relative order
        for (let i = 1; i < presentRequiredIndices.length; i++) {
          if (presentRequiredIndices[i] < presentRequiredIndices[i - 1]) {
            const slotA = constellation.slots[i - 1];
            const slotB = constellation.slots[i];
            const msg = `Slot order violation: "${slotA.cosmicName}" must appear before "${slotB.cosmicName}" on page "${page.route}"`;
            errors.push(msg);
            context.logger.error(`apps/${appSlug}: constellation "${slug}" — ${msg}`);
          }
        }
      }

      if (errors.length > 0 || warnings.length > 0) {
        details.push({
          app: appSlug,
          constellation: slug,
          errors,
          warnings,
        });
        for (const w of warnings) {
          context.logger.warn(`apps/${appSlug}: constellation "${slug}" — ${w}`);
        }
      }
    }
  }

  const errorViolations = details.filter((d) => d.errors.length > 0).length;

  if (errorViolations === 0) {
    context.logger.info(
      `constellation.compose.validate: OK — ${constellationsChecked} constellation${constellationsChecked === 1 ? "" : "s"} checked`,
    );
  }

  return {
    data: {
      constellationsChecked,
      violations: errorViolations,
      warnings: totalWarnings,
      details,
    },
    exitCode: errorViolations > 0 ? 1 : 0,
    summary:
      errorViolations === 0
        ? `OK — ${constellationsChecked} constellations, ${totalWarnings} optional slot warning${totalWarnings === 1 ? "" : "s"}`
        : undefined,
  };
}
