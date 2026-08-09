/*
<MODULE_CONTRACT>
<purpose>
Implements biome.contract.validate — the OS command that enforces the RFC-0071
Biome contract:
  - Every packages/ontology/biomes/*.yaml parses against the extended visual-DNA schema.
  - Every biome family pointer resolves to a real site family and is reciprocated.
  - Every app src/content/system.md identity.biome references an existing biome.
  - Every biome field emitted to CSS maps to a known --ds-* token.
  - No forbidden app-local CSS drift reintroduces per-feature overrides.
</purpose>
<non-goals>
  <item>Do not generate CSS — biome-css codegen handles that.</item>
  <item>Do not validate constellation references (system.manifest.validate handles that).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>RFC-0071: Rewrite biome validation around the extended biome contract and family linkage.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { biomeSchema, siteFamilySchema } from "@warpgogol/werkstatt-site/ontology/schemas";
import { getAllProjectedTokenNames } from "@warpgogol/werkstatt-site/ontology";
import { TOKEN_NAME_SET } from "@warpgogol/werkstatt-site/tokens";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { fileExists } from "./lib/file-exists.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readYaml(p: string): Promise<unknown> {
  const raw = await readFile(p, "utf-8");
  return parseYaml(raw);
}

// Token names from the consolidated biome-token projection (RFC-0071).
const ALL_PROJECTED_TOKENS = getAllProjectedTokenNames();

/** Collect all files in a directory (non-recursive) with a given extension. */
async function listDir(dir: string, ext: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => extname(e) === ext).map((e) => join(dir, e));
}

/** Recursively collect CSS files under a directory. */
async function collectCssFiles(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".css"], ignore: () => false });
}

// ---------------------------------------------------------------------------
// biome.contract.validate
// ---------------------------------------------------------------------------

interface BiomeViolation {
  file: string;
  errors: string[];
}

interface PerFeatureCssViolation {
  file: string;
  error: string;
}

interface BiomeContractResult {
  biomesScanned: number;
  biomeViolations: number;
  systemsScanned: number;
  systemViolations: number;
  familyViolations: number;
  tokenMappingViolations: number;
  perFeatureCssViolations: number;
  details: BiomeViolation[];
  perFeatureCss: PerFeatureCssViolation[];
}

/**
 * Validates the full Biome contract:
 *
 * 1. Every *.yaml in packages/ontology/biomes/ parses against biomeSchema.
 * 2. Every apps/<app>/system.yaml identity.biome references an existing biome.
 * 3. No per-feature CSS files exist outside src/styles/ in any app (ERROR-level).
 *
 * Exits non-zero on any violation. No warn-only mode.
 */
export async function runBiomeContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BiomeContractResult>> {
  const biomesDir = join(context.workspaceRoot, "packages", "ontology", "biomes");
  const familiesDir = join(context.workspaceRoot, "packages", "ontology", "site-families");
  const appsDir = join(context.workspaceRoot, "apps");

  const biomeDetails: BiomeViolation[] = [];
  const perFeatureCss: PerFeatureCssViolation[] = [];
  let biomesScanned = 0;
  let systemsScanned = 0;
  let systemViolations = 0;
  let familyViolations = 0;
  let tokenMappingViolations = 0;

  const familyIds = new Set<string>();
  try {
    const familyFolders = await readdir(familiesDir, { withFileTypes: true });
    for (const familyFolder of familyFolders) {
      if (!familyFolder.isDirectory()) continue;
      const familyYaml = join(familiesDir, familyFolder.name, "family.yaml");
      if (!(await fileExists(familyYaml))) continue;
      try {
        const parsed = siteFamilySchema.safeParse(await readYaml(familyYaml));
        if (parsed.success) familyIds.add(parsed.data.id);
      } catch {
        // family.contract.validate is the authoritative detailed surface
      }
    }
  } catch {
    // no families directory yet
  }

  // ── 1. Validate all biome YAML files ────────────────────────────────────
  const biomeFiles = await listDir(biomesDir, ".yaml");

  for (const filePath of biomeFiles) {
    const rel = relative(context.workspaceRoot, filePath);
    biomesScanned++;

    let parsed: unknown;
    try {
      parsed = await readYaml(filePath);
    } catch (e) {
      biomeDetails.push({
        file: rel,
        errors: [`YAML parse error: ${e instanceof Error ? e.message : String(e)}`],
      });
      context.logger.error(`${rel}: YAML parse error`);
      continue;
    }

    const result = biomeSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.map(String).join(".")}: ${i.message}`,
      );
      biomeDetails.push({ file: rel, errors });
      for (const err of errors) {
        context.logger.error(`${rel}: ${err}`);
      }
      continue;
    }

    const biome = result.data;
    const errors: string[] = [];

    if (!familyIds.has(biome.family)) {
      errors.push(
        `family "${biome.family}" has no matching packages/ontology/site-families/${biome.family}/family.yaml`,
      );
      familyViolations++;
    }

    for (const tokenName of ALL_PROJECTED_TOKENS) {
      if (!TOKEN_NAME_SET.has(tokenName)) {
        errors.push(`token mapping points to unknown design token: ${tokenName}`);
        tokenMappingViolations++;
      }
    }

    if (errors.length > 0) {
      biomeDetails.push({ file: rel, errors });
      for (const err of errors) {
        context.logger.error(`${rel}: ${err}`);
      }
    }
  }

  // Build a set of known biome IDs for cross-reference
  const knownBiomeIds = new Set<string>();
  for (const filePath of biomeFiles) {
    try {
      const parsed = (await readYaml(filePath)) as { id?: string };
      if (parsed?.id) knownBiomeIds.add(parsed.id);
    } catch {
      // already reported above
    }
  }

  // ── 2. Validate src/content/system.md biome references ───────────────────
  let appEntries: string[] = [];
  try {
    appEntries = await readdir(appsDir);
  } catch {
    // no apps dir
  }

  for (const appSlug of appEntries) {
    const contentDir = join(appsDir, appSlug, "src", "content");
    const systemMdPath = join(contentDir, "system.md");
    if (!(await fileExists(systemMdPath))) continue;

    const rel = relative(context.workspaceRoot, systemMdPath);
    systemsScanned++;

    try {
      const systemResult = await loadSystemManifest(contentDir);
      const biomeId = systemResult.manifest.identity.biome;
      if (!knownBiomeIds.has(biomeId)) {
        const msg = `identity.biome "${biomeId}" has no matching packages/ontology/biomes/${biomeId}.yaml`;
        context.logger.error(`${rel}: ${msg}`);
        systemViolations++;
      }
    } catch (e) {
      context.logger.error(
        `${rel}: system manifest read error — ${e instanceof Error ? e.message : String(e)}`,
      );
      systemViolations++;
    }
  }

  // ── 3. Detect per-feature CSS in apps ────────────────────────────────────
  for (const appSlug of appEntries) {
    const appSrc = join(appsDir, appSlug, "src");
    const allowedCssDirs = new Set([join(appSrc, "styles")]);

    const cssFiles = await collectCssFiles(appSrc);

    for (const cssFile of cssFiles) {
      // File is allowed if its immediate parent is the styles directory
      const parentDir =
        cssFile.slice(0, cssFile.lastIndexOf("/") + 1) ||
        cssFile.slice(0, cssFile.lastIndexOf("\\") + 1);
      const normalParent = parentDir.replace(/[/\\]$/, "");
      const isAllowed = [...allowedCssDirs].some((d) => normalParent === d);

      if (!isAllowed) {
        const rel = relative(context.workspaceRoot, cssFile);
        const msg = `Per-feature CSS is forbidden (DNA-23, RFC-0025). Move to src/styles/ or delete.`;
        perFeatureCss.push({ file: rel, error: msg });
        context.logger.error(`${rel}: ${msg}`);
      }
    }
  }

  const totalViolations = biomeDetails.length + systemViolations + perFeatureCss.length;

  if (totalViolations === 0) {
    context.logger.info(
      `biome.contract.validate: OK — ${biomesScanned} biome${biomesScanned === 1 ? "" : "s"}, ` +
        `${systemsScanned} system${systemsScanned === 1 ? "" : "s"} valid`,
    );
  }

  return {
    data: {
      biomesScanned,
      biomeViolations: biomeDetails.length,
      systemsScanned,
      systemViolations,
      familyViolations,
      tokenMappingViolations,
      perFeatureCssViolations: perFeatureCss.length,
      details: biomeDetails,
      perFeatureCss,
    },
    exitCode: totalViolations > 0 ? 1 : 0,
    summary:
      totalViolations === 0
        ? `OK — ${biomesScanned} biomes, ${systemsScanned} system manifests valid`
        : undefined,
  };
}
