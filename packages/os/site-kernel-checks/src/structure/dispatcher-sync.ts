/*
<MODULE_CONTRACT>
<purpose>dispatcher.sync.validate — validates that components/layouts/pages dispatcher
registrations stay in sync with actual content and schema files.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of structure.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { collectMarkdownFiles } from "@gogol/site-kernel-content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import {
  CONTENT_COMPONENTS_SUBPATH,
  collectLangSubdirs,
  collectTsFiles,
  collectComponentPaths,
  extractDispatcherKeys,
} from "./shared.ts";

const COMPONENT_DISPATCHER_FILENAME = "components-dispatcher.ts";
const LAYOUTS_DISPATCHER_FILENAME = "layouts-dispatcher.ts";
const PAGES_DISPATCHER_FILENAME = "pages-dispatcher.ts";

/**
 * Validates that dispatcher registrations stay in sync with actual content and schema files.
 *
 * Components dispatcher (bidirectional):
 *   - Every key in componentContentSchemaById must have a content file in content/components/{lang}/.
 *   - Every content file in content/components/{lang}/ must be registered as a dispatcher key.
 *
 * Pages dispatcher (one-directional: stale entries only):
 *   - Every non-dynamic key in pagesSchemaById must have a matching content file in content/pages/{lang}/.
 *   - Content pages without a dispatcher key are not flagged (pass-through pages are intentional).
 */
export async function runDispatcherSyncValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const contentComponentsDir = join(paths.contentDirectory, CONTENT_COMPONENTS_SUBPATH);
  const componentDispatcherPath = join(
    paths.contentDirectory,
    "schemas",
    COMPONENT_DISPATCHER_FILENAME,
  );
  const layoutsDispatcherPath = join(
    paths.contentDirectory,
    "schemas",
    LAYOUTS_DISPATCHER_FILENAME,
  );
  const pagesDispatcherPath = join(paths.contentDirectory, "schemas", PAGES_DISPATCHER_FILENAME);

  let violations = 0;

  // --- Components dispatcher ---
  // Post-RFC-0023: the components dispatcher is OPTIONAL — uni.registry.yaml
  // (built by uni.registry.build) is now the canonical content-schema lookup.
  // Apps that promoted all components to @gogol/ui no longer need a local
  // schemas/components-dispatcher.ts. Apps that still maintain one are still
  // validated below (consistency with content/components/{lang}/*.md).
  let componentDispatcherSource: string | null = null;
  try {
    componentDispatcherSource = await readFile(componentDispatcherPath, "utf8");
  } catch {
    // Dispatcher missing — registry-only mode. No violation.
  }

  if (componentDispatcherSource !== null) {
    const dispatcherKeys = new Set(
      extractDispatcherKeys(componentDispatcherSource, "componentContentSchemaById"),
    );

    if (dispatcherKeys.size === 0) {
      context.logger.error(
        `schemas/${COMPONENT_DISPATCHER_FILENAME}: could not parse componentContentSchemaById — check object name`,
      );
      violations += 1;
    } else {
      const contentPaths = await collectComponentPaths(contentComponentsDir);

      // dispatcher key → no content file
      for (const key of dispatcherKeys) {
        if (!contentPaths.has(key)) {
          context.logger.error(
            `components-dispatcher.ts key "${key}": no content file found at content/components/{lang}/${key}.md`,
          );
          violations += 1;
        }
      }

      // content file → no dispatcher key
      for (const contentPath of contentPaths) {
        if (!dispatcherKeys.has(contentPath)) {
          context.logger.error(
            `content/components/{lang}/${contentPath}.md: not registered in componentContentSchemaById — add a schema or remove the content file`,
          );
          violations += 1;
        }
      }
    }
  }

  // --- Layouts dispatcher ---
  let layoutsDispatcherSource: string | null = null;
  try {
    layoutsDispatcherSource = await readFile(layoutsDispatcherPath, "utf8");
  } catch {
    // Layouts dispatcher is optional for now, but recommended by RFC-0021
  }

  if (layoutsDispatcherSource !== null) {
    const dispatcherKeys = new Set(
      extractDispatcherKeys(layoutsDispatcherSource, "layoutContentSchemaById"),
    );

    if (dispatcherKeys.size === 0) {
      context.logger.error(
        `schemas/${LAYOUTS_DISPATCHER_FILENAME}: could not parse layoutContentSchemaById — check object name`,
      );
      violations += 1;
    } else {
      const layoutsContentDir = join(paths.contentDirectory, "layouts");
      const langDirs = await collectLangSubdirs(layoutsContentDir);
      const contentPaths = new Set<string>();

      for (const lang of langDirs) {
        const langDir = join(layoutsContentDir, lang);
        const mdFiles = await collectMarkdownFiles(langDir);
        for (const file of mdFiles) {
          const rel = relative(langDir, file).replace(/\\/g, "/").replace(/\.md$/i, "");
          contentPaths.add(rel);
        }
      }

      // dispatcher key → no content file
      for (const key of dispatcherKeys) {
        if (!contentPaths.has(key)) {
          context.logger.error(
            `layouts-dispatcher.ts key "${key}": no content file found at content/layouts/{lang}/${key}.md`,
          );
          violations += 1;
        }
      }

      // content file → no dispatcher key
      for (const contentPath of contentPaths) {
        if (!dispatcherKeys.has(contentPath)) {
          context.logger.error(
            `content/layouts/{lang}/${contentPath}.md: not registered in layoutContentSchemaById — add a schema or remove the content file`,
          );
          violations += 1;
        }
      }
    }
  }

  // --- Pages dispatcher (stale-entry check only) ---
  let pagesDispatcherSource: string | null = null;
  try {
    pagesDispatcherSource = await readFile(pagesDispatcherPath, "utf8");
  } catch {
    // Pages dispatcher is optional — not all apps require per-page Zod validation.
  }

  if (pagesDispatcherSource !== null) {
    const dispatcherKeys = extractDispatcherKeys(pagesDispatcherSource, "pagesSchemaById");

    // A key is dynamic if it contains "[" — dynamic routes have no single content file to check.
    const staticDispatcherKeys = dispatcherKeys.filter((k) => !k.includes("["));

    const langDirs = await collectLangSubdirs(paths.contentPagesDirectory);
    const contentPagePaths = new Set<string>();

    // Collect language-specific content files
    for (const lang of langDirs) {
      const langDir = join(paths.contentPagesDirectory, lang);
      const mdFiles = await collectMarkdownFiles(langDir);
      for (const file of mdFiles) {
        const rel = relative(langDir, file).replace(/\\/g, "/").replace(/\.md$/i, "");
        contentPagePaths.add(rel);
      }
    }

    // Collect language-neutral content files at content/pages/ root
    const rootMdFiles = await collectMarkdownFiles(paths.contentPagesDirectory);
    for (const file of rootMdFiles) {
      const rel = relative(paths.contentPagesDirectory, file)
        .replace(/\\/g, "/")
        .replace(/\.md$/i, "");
      contentPagePaths.add(rel);
    }

    // dispatcher key (static) → no content file (stale registration)
    for (const key of staticDispatcherKeys) {
      // The "root" key maps to "root.md" in the content dir; "index" maps to "index.md".
      // We check both the key itself and its "{key}/index" variant to handle Astro conventions.
      const hasDirectFile = contentPagePaths.has(key);
      const hasIndexVariant = contentPagePaths.has(`${key}/index`);
      if (!hasDirectFile && !hasIndexVariant) {
        context.logger.error(
          `pages-dispatcher.ts key "${key}": no content file found at content/pages/{lang}/${key}.md — possible stale entry`,
        );
        violations += 1;
      }
    }

    // Schema file checks: every static pagesSchemaById key must have a matching .ts file,
    // and every .ts schema file must be registered in pagesSchemaById (utility files excluded).
    const schemasPagesDir = join(paths.contentDirectory, "schemas", "pages");
    const schemaTsFiles = await collectTsFiles(schemasPagesDir);
    const schemaPagePaths = new Set<string>();
    for (const file of schemaTsFiles) {
      const rel = relative(schemasPagesDir, file).replace(/\\/g, "/").replace(/\.ts$/i, "");
      schemaPagePaths.add(rel);
    }

    const UTILITY_PAGE_SCHEMAS = new Set(["base"]);

    for (const key of staticDispatcherKeys) {
      if (!schemaPagePaths.has(key)) {
        context.logger.error(
          `pages-dispatcher.ts key "${key}": missing schema file schemas/pages/${key}.ts`,
        );
        violations += 1;
      }
    }

    for (const schemaPath of schemaPagePaths) {
      if (UTILITY_PAGE_SCHEMAS.has(schemaPath)) continue;
      if (!dispatcherKeys.includes(schemaPath)) {
        context.logger.error(
          `schemas/pages/${schemaPath}.ts: not registered in pagesSchemaById — orphan schema file`,
        );
        violations += 1;
      }
    }
  }

  return {
    data: { violations },
    exitCode: violations > 0 ? 1 : 0,
    summary: violations > 0 ? undefined : "[dispatcher.sync] OK",
  };
}
