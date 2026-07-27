/*
<MODULE_CONTRACT>
<purpose>content.layouts.validate — validates the src/content/layouts/ content layer
structure per RFC-0021 (registry-only apps using @gogol/ui's layout are skipped).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";

/**
 * Validates the layouts content layer structure per RFC-0021.
 *
 * Checks:
 *   - src/content/layouts/[lang]/*.md exists for each language
 *   - src/content/schemas/layouts/*.ts exists
 *   - Schemas do not have -component suffix
 *   - No layout.md remains in src/content/components/
 */
export async function runContentLayoutsValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number; checkedFiles: number }>> {
  const paths = requireAstroSitePaths(context);
  const layoutsContentDir = join(paths.contentDirectory, "layouts");
  const layoutsSchemasDir = join(paths.contentDirectory, "schemas", "layouts");
  const componentsContentDir = join(paths.contentDirectory, "components");

  // Post-RFC-0023: when neither src/content/layouts/ nor
  // src/content/schemas/layouts/ exists, the app uses the canonical
  // `@gogol/ui` layout — this is a valid registry-only configuration. Skip
  // the entire RFC-0021 contract in that case (registry-only mode).
  let layoutsContentDirExists = true;
  let layoutsSchemasDirExists = true;
  try {
    await readdir(layoutsContentDir);
  } catch {
    layoutsContentDirExists = false;
  }
  try {
    await readdir(layoutsSchemasDir);
  } catch {
    layoutsSchemasDirExists = false;
  }
  if (!layoutsContentDirExists && !layoutsSchemasDirExists) {
    return {
      data: { violations: 0, checkedFiles: 0 },
      exitCode: 0,
      summary: "[content.layouts.validate] skipped — registry-only mode (using @gogol/ui layout)",
    };
  }

  const violations: string[] = [];
  let checkedFiles = 0;

  // Check 1: src/content/layouts/ structure
  let langDirs: string[] = [];
  try {
    const entries = await readdir(layoutsContentDir, { withFileTypes: true });
    langDirs = entries
      .filter((e) => e.isDirectory() && /^[a-z]{2}$/i.test(e.name))
      .map((e) => e.name);

    if (langDirs.length === 0) {
      violations.push(
        `${layoutsContentDir}: no language directories found (expected [lang] subdirs)`,
      );
    }
  } catch {
    violations.push(`${layoutsContentDir}: directory does not exist`);
  }

  // Check 2: .md files in each lang dir
  for (const lang of langDirs) {
    const langDir = join(layoutsContentDir, lang);
    try {
      const files = await readdir(langDir, { withFileTypes: true });
      const mdFiles = files.filter((f) => f.isFile() && f.name.endsWith(".md"));
      if (mdFiles.length === 0) {
        violations.push(`src/content/layouts/${lang}/: no .md files found`);
      } else {
        checkedFiles += mdFiles.length;
      }
    } catch {
      violations.push(`src/content/layouts/${lang}/: cannot read directory`);
    }
  }

  // Check 3: src/content/schemas/layouts/ exists.
  // Post-RFC-0023: when the directory is absent, the layout schema is provided
  // by @gogol/ui's layout component types. Content still exists locally for
  // translated strings; treat the missing schema dir as registry-only and skip.
  let schemaFiles: string[] = [];
  try {
    const entries = await readdir(layoutsSchemasDir, { withFileTypes: true });
    schemaFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".ts")).map((e) => e.name);

    if (schemaFiles.length === 0) {
      violations.push(`src/content/schemas/layouts/: no .ts schema files found`);
    }
  } catch {
    // Registry-only mode: schema lives in @gogol/ui — no violation.
  }

  // Check 4: schemas must not have -component suffix
  for (const schemaFile of schemaFiles) {
    if (schemaFile.endsWith("-component.ts")) {
      violations.push(
        `src/content/schemas/layouts/${schemaFile}: schema must not have -component suffix (RFC-0021)`,
      );
    }
  }

  // Check 5: no layout.md in components/
  try {
    const langDirsInComponents = await readdir(componentsContentDir, { withFileTypes: true });
    for (const langDir of langDirsInComponents.filter((e) => e.isDirectory())) {
      const langPath = join(componentsContentDir, langDir.name);
      const files = await readdir(langPath, { withFileTypes: true });
      if (files.some((f) => f.isFile() && f.name === "layout.md")) {
        violations.push(
          `src/content/components/${langDir.name}/layout.md: must be moved to src/content/layouts/${langDir.name}/ per RFC-0021`,
        );
      }
    }
  } catch {
    // components dir may not exist, ignore
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { violations: violations.length, checkedFiles },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[content.layouts.validate] OK (${checkedFiles} files, ${schemaFiles.length} schemas)`
        : undefined,
  };
}
