/*
<MODULE_CONTRACT>
<purpose>Implements manifest.contract.validate and mirror.quintet.validate - the OS commands
that enforce the Uni UI Ontology manifest contract (DNA-17, RFC-0023) in packages/ui.</purpose>
<non-goals>
  <item>Do not validate business schemas (pbp.profile.validate handles that).</item>
  <item>Do not enforce content schema key existence (dispatcher.sync.validate handles that).</item>
  <item>Do not write or modify manifest files.</item>
  <item>Do not scan apps/../src/components/. Apps consume UI from packages/ui and do not ship manifests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 4 (RFC-0023): Created to enforce manifest.yaml contract and Mirror Quintet.</item>
  <item>Fixed: Changed scope from app to workspace; scans packages/ui only, not apps (apps consume UI via uni.registry.yaml).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, basename, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import { manifestSchema } from "@warpgogol/werkstatt-site/ontology";
import { fileExists as exists, collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestViolation {
  file: string;
  errors: string[];
}

interface ManifestContractResult {
  scanned: number;
  violations: number;
  details: ManifestViolation[];
}

interface QuintetViolation {
  astroFile: string;
  missingManifest: string;
}

interface QuintetResult {
  scanned: number;
  violations: number;
  details: QuintetViolation[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Recursively collect all files matching a predicate under rootDir. */
async function collectFilesMatching(
  rootDir: string,
  predicate: (filePath: string) => boolean,
): Promise<string[]> {
  const all = await collectFilesShared(rootDir, { ignore: () => false });
  return all.filter(predicate);
}

/** Resolve the scan roots for packages/ui. */
function getScanRoots(workspaceRoot: string): string[] {
  return [
    join(workspaceRoot, "packages", "ui", "src", "sections"),
    join(workspaceRoot, "packages", "ui", "src", "components"),
    join(workspaceRoot, "packages", "ui", "src", "pages"),
  ];
}

// ---------------------------------------------------------------------------
// manifest.contract.validate
// ---------------------------------------------------------------------------

/**
 * Validates every *.manifest.yaml file found under packages/ui/src/{sections,components,pages}/:
 *   1. Parses and validates against @warpgogol/werkstatt-site/ontology manifestSchema (Zod).
 *   2. Checks that a colocated .astro file of the same stem exists.
 */
export async function runManifestContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ManifestContractResult>> {
  const scanRoots = getScanRoots(context.workspaceRoot);

  const manifestFiles: string[] = [];

  for (const root of scanRoots) {
    const found = await collectFilesMatching(root, (f) => f.endsWith(".manifest.yaml"));
    manifestFiles.push(...found);
  }

  const violations: ManifestViolation[] = [];

  for (const filePath of manifestFiles) {
    const relFile = relative(context.workspaceRoot, filePath);
    const fileErrors: string[] = [];

    // 1. Parse YAML
    let parsed: unknown;
    try {
      const raw = await readFile(filePath, "utf-8");
      parsed = parseYaml(raw);
    } catch (e) {
      fileErrors.push(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
      violations.push({ file: relFile, errors: fileErrors });
      context.logger.error(`${relFile}: YAML parse error`);
      continue;
    }

    // 2. Validate against manifestSchema
    const result = manifestSchema.safeParse(parsed);

    if (!result.success) {
      const zodErrors = result.error.issues.map(
        (issue) => `${issue.path.map(String).join(".")}: ${issue.message}`,
      );
      fileErrors.push(...zodErrors);
      for (const err of zodErrors) {
        context.logger.error(`${relFile}: ${err}`);
      }
    }

    // 3. Check for colocated .astro — but skip page-layer manifests in
    //    packages/ui/src/pages/. These are page-archetype catalog descriptors
    //    (Star metadata) and pages are implemented by apps, not packages/ui.
    //    Sections and components keep the colocated .astro contract.
    const layer =
      parsed && typeof parsed === "object" ? (parsed as { layer?: unknown }).layer : undefined;
    if (layer !== "page") {
      const stem = basename(filePath).replace(".manifest.yaml", "");
      const dir =
        filePath.slice(0, filePath.lastIndexOf("/") + 1) ||
        filePath.slice(0, filePath.lastIndexOf("\\") + 1);
      const astroPath = join(dir, `${stem}.astro`);

      if (!(await exists(astroPath))) {
        const missing = relative(context.workspaceRoot, astroPath);
        fileErrors.push(`Missing colocated .astro file: ${missing}`);
        context.logger.error(`${relFile}: missing colocated .astro → ${missing}`);
      }
    }

    if (fileErrors.length > 0) {
      violations.push({ file: relFile, errors: fileErrors });
    }
  }

  if (violations.length === 0) {
    context.logger.info(
      `manifest.contract.validate: OK (${manifestFiles.length} manifest${manifestFiles.length === 1 ? "" : "s"} valid)`,
    );
  }

  return {
    data: {
      scanned: manifestFiles.length,
      violations: violations.length,
      details: violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `OK - ${manifestFiles.length} manifest${manifestFiles.length === 1 ? "" : "s"} valid`
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// mirror.quintet.validate
// ---------------------------------------------------------------------------

/**
 * Validates that every .astro file under packages/ui/src/{sections,components,pages}/
 * has a colocated <stem>.manifest.yaml file.
 * This is the fifth leg of the Mirror Quintet (DNA-17, RFC-0023).
 *
 * Exclusions:
 *   - Files ending in .test.astro or .stories.astro
 *   - Files named exactly index.astro (layout/aggregate entry points - no manifest needed)
 */
export async function runMirrorQuintetValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<QuintetResult>> {
  const scanRoots = getScanRoots(context.workspaceRoot);

  const astroFiles: string[] = [];

  for (const root of scanRoots) {
    const found = await collectFilesMatching(
      root,
      (f) =>
        extname(f) === ".astro" &&
        !f.endsWith(".test.astro") &&
        !f.endsWith(".stories.astro") &&
        basename(f) !== "index.astro",
    );
    astroFiles.push(...found);
  }

  const violations: QuintetViolation[] = [];

  for (const filePath of astroFiles) {
    const stem = basename(filePath, ".astro");
    const dir =
      filePath.slice(0, filePath.lastIndexOf("/") + 1) ||
      filePath.slice(0, filePath.lastIndexOf("\\") + 1);
    const manifestPath = join(dir, `${stem}.manifest.yaml`);

    if (!(await exists(manifestPath))) {
      const relAstro = relative(context.workspaceRoot, filePath);
      const relManifest = relative(context.workspaceRoot, manifestPath);
      violations.push({ astroFile: relAstro, missingManifest: relManifest });
      context.logger.error(`${relAstro}: missing manifest.yaml → ${relManifest}`);
    }
  }

  if (violations.length === 0) {
    context.logger.info(
      `mirror.quintet.validate: OK (${astroFiles.length} component${astroFiles.length === 1 ? "" : "s"} all have manifests)`,
    );
  }

  return {
    data: {
      scanned: astroFiles.length,
      violations: violations.length,
      details: violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `OK - all ${astroFiles.length} component${astroFiles.length === 1 ? "" : "s"} have colocated manifest.yaml`
        : undefined,
  };
}
