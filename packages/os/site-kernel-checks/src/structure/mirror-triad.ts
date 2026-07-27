/*
<MODULE_CONTRACT>
<purpose>mirror.triad.validate — validates the three-way mirror between component content
files and component schema files (ARCHITECTURE_DNA #5).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of structure.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import {
  CONTENT_COMPONENTS_SUBPATH,
  SCHEMAS_SUBPATH,
  collectLangSubdirs,
  collectTsFiles,
  collectComponentPaths,
  stripContentSuffix,
} from "./shared.ts";

/**
 * Validates the three-way mirror between component content files and component schema files.
 *
 * Convention (ARCHITECTURE_DNA #5):
 *   src/content/components/{lang}/{ComponentPath}.md
 *   src/content/schemas/components/{ComponentPath}.ts
 *
 * Reports:
 *   - Content file without a matching schema file.
 *   - Schema file without a matching content file (in any language directory).
 */
export async function runMirrorTriadValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const contentComponentsDir = join(paths.contentDirectory, CONTENT_COMPONENTS_SUBPATH);
  const schemasComponentsDir = join(paths.contentDirectory, SCHEMAS_SUBPATH);

  const langDirs = await collectLangSubdirs(contentComponentsDir);
  if (langDirs.length === 0) {
    return {
      data: { violations: 0 },
      exitCode: 0,
      summary: "[mirror.triad] OK (no content/components language directories found)",
    };
  }

  const contentPaths = await collectComponentPaths(contentComponentsDir);

  const schemaPaths = new Set<string>();
  const schemaFiles = await collectTsFiles(schemasComponentsDir);
  for (const file of schemaFiles) {
    const rel = relative(schemasComponentsDir, file).replace(/\\/g, "/").replace(/\.ts$/i, "");
    const parts = rel.split("/");
    // RFC-0020: strip -component suffix only from root-level schema files (no subdir).
    // Subdirectory files (e.g. section/hero-section.ts) keep the suffix as part of their
    // logical identity because their content files also carry the suffix (hero-section.md).
    if (parts.length === 1) {
      parts[0] = stripContentSuffix(parts[0]);
    }
    schemaPaths.add(parts.join("/"));
  }

  // Post-RFC-0023: components live in @gogol/ui with colocated *.types.ts.
  // A component-content file in the app is satisfied by either:
  //   a) a local schemas/components/<name>.ts (legacy app-resident schema), OR
  //   b) a packages/ui/src/components/<name>/<name>-component.types.ts (canonical post-migration).
  // Add (b) to the schemaPaths set so the triad accepts package-resident schemas.
  const packagesUiComponentsDir = join(
    paths.appDirectory,
    "..",
    "..",
    "packages",
    "ui",
    "src",
    "components",
  );
  try {
    const componentDirs = await readdir(packagesUiComponentsDir, { withFileTypes: true });
    for (const entry of componentDirs) {
      if (!entry.isDirectory()) continue;
      const typesFile = join(
        packagesUiComponentsDir,
        entry.name,
        `${entry.name}-component.types.ts`,
      );
      try {
        await readFile(typesFile, "utf8");
        schemaPaths.add(entry.name);
      } catch {
        // No types file — ignore; manifest may suffice elsewhere.
      }
    }
  } catch {
    // packages/ui not present — leave schemaPaths as-is.
  }

  let violations = 0;

  // content file → missing schema
  for (const contentPath of contentPaths) {
    if (!schemaPaths.has(contentPath)) {
      context.logger.error(
        `content/components/{lang}/${contentPath}.md → missing schema: schemas/components/${contentPath}.ts`,
      );
      violations += 1;
    }
  }

  // schema file → no content file in any language
  for (const schemaPath of schemaPaths) {
    if (!contentPaths.has(schemaPath)) {
      context.logger.error(
        `schemas/components/${schemaPath}.ts → no content file found in content/components/{lang}/${schemaPath}.md`,
      );
      violations += 1;
    }
  }

  return {
    data: { violations },
    exitCode: violations > 0 ? 1 : 0,
    summary:
      violations > 0
        ? undefined
        : `[mirror.triad] OK (${contentPaths.size} components matched across ${schemaPaths.size} schemas)`,
  };
}
