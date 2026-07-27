/*
<MODULE_CONTRACT>
<purpose>naming.suffixes.lint — RFC-0020 (extended): validates layer-specific file suffix
contracts across src/components/, src/styles/, src/content/components/, src/pages/, and
src/semantic/pages/.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of naming.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { walkFiles } from "./shared.ts";

// @ai-invariant RFC-0020: The suffix rules and forbidden token sets below are the canonical
// source for naming.suffixes.lint. Update naming-conventions.md when these change.
// AGENTS.md files are always excluded — never add them to the checked set.

// @ai-invariant RFC-0020 forbidden-token policy (extended):
// - src/components/ .astro (any depth, except paths containing a 'section' segment):
//   must end with "-component". Root-level files additionally must not have
//   "-page", "-section", or "-style" as the last token before "-component";
//   files in subdirectories (e.g. effects/, funding/) only require the -component suffix.
// - src/components/section/ .astro (and nested under section/): must end with "-section".
//   Logical stem before "-section" must not end with "-page", "-component", or "-style".
// - src/styles/components/ root .css: must end with "-component".
// - src/styles/components/section/ .css: must end with "-section".
//   (CSS names now mirror .astro layer suffixes — no forbidden token check needed:
//    if the .astro passes, the mirrored .css name is valid by construction.)
// - src/content/components/ root .md: must end with "-component".
//   layout.md is the only permitted exception (Class 4 layout singleton).
// - src/content/components/section/ .md: must end with "-section".
// - src/pages/: full stem must not contain "-component", "-section", "-style",
//   or "-page" (do not leak implementation detail into URL stems).
// - src/styles/ files outside src/styles/components/: only "-style" is forbidden.

/**
 * Returns true when the logical stem (the portion before the required layer suffix)
 * ends with a forbidden suffix-position token.
 *
 * Example: stem="brand-label-component", required="-component"
 *   → logical = "brand-label"
 *   → checks if logical ends with any forbidden token
 */
function hasForbiddenSuffixToken(
  stem: string,
  requiredSuffix: string,
  forbiddenTokens: readonly string[],
): string | null {
  const logical = stem.endsWith(requiredSuffix)
    ? stem.slice(0, stem.length - requiredSuffix.length)
    : stem;
  for (const t of forbiddenTokens) {
    if (logical.endsWith(t)) return t;
  }
  return null;
}

/** Layer-specific rules: { dir subpath, required suffix, forbidden suffix-position tokens } */
const SUFFIX_LAYER_RULES = [
  {
    layerLabel: "src/components (non-section)",
    requiredSuffix: "-component",
    forbiddenSuffixTokens: ["-page", "-section", "-style"] as readonly string[],
    extensions: new Set([".astro"]),
  },
  {
    layerLabel: "src/components/section",
    requiredSuffix: "-section",
    forbiddenSuffixTokens: ["-page", "-component", "-style"] as readonly string[],
    extensions: new Set([".astro"]),
  },
  {
    // CSS files that mirror root components — must end with -component.
    // No forbidden-suffix check needed: CSS name is derived from the .astro name.
    layerLabel: "src/styles/components (root)",
    requiredSuffix: "-component",
    forbiddenSuffixTokens: [] as readonly string[],
    extensions: new Set([".css"]),
  },
  {
    // CSS files that mirror section components — must end with -section.
    layerLabel: "src/styles/components/section",
    requiredSuffix: "-section",
    forbiddenSuffixTokens: [] as readonly string[],
    extensions: new Set([".css"]),
  },
  {
    // Content .md files that mirror root components — must end with -component.
    // Exception: layout.md is a Class 4 singleton and is excluded by the runner.
    layerLabel: "src/content/components (root)",
    requiredSuffix: "-component",
    forbiddenSuffixTokens: [] as readonly string[],
    extensions: new Set([".md"]),
  },
  {
    // Content .md files that mirror section components — must end with -section.
    layerLabel: "src/content/components/section",
    requiredSuffix: "-section",
    forbiddenSuffixTokens: [] as readonly string[],
    extensions: new Set([".md"]),
  },
] as const;

/** Forbidden tokens for src/pages/ (full stem check — any occurrence). */
const PAGES_FORBIDDEN_TOKENS = ["-page", "-component", "-section", "-style"] as const;

/** Forbidden tokens for src/styles/ files OUTSIDE src/styles/components/ (e.g. pages/, global). */
const STYLES_OTHER_FORBIDDEN_TOKENS = ["-style"] as const;

function hasAnyToken(stem: string, tokens: readonly string[]): string | null {
  for (const t of tokens) {
    if (stem.includes(t)) return t;
  }
  return null;
}

/**
 * Validates layer-specific file suffix contracts per RFC-0020 (extended).
 *
 * Source layers checked:
 *   src/components/ (non-section, any depth) .astro — must end with -component
 *     Forbidden-token check (-page/-section/-style before -component) applies at root depth only.
 *     layout.astro is the Class 4 singleton and is exempt.
 *   src/components/section/ .astro — must end with -section
 *   src/styles/components/ root .css — must end with -component
 *   src/styles/components/section/ .css — must end with -section
 *   src/content/components/ root .md  — must end with -component (layout.md excepted)
 *   src/content/components/section/ .md — must end with -section
 *   src/pages/ (any depth) — forbidden: -page, -component, -section, -style
 *   src/styles/ outside components/ — forbidden: -style
 *
 * AGENTS.md files are unconditionally excluded.
 */
export async function runNamingSuffixesLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const SKIP_DIRS = new Set(["node_modules", "dist", ".astro"]);

  const violations: string[] = [];
  let checkedFiles = 0;

  function isAgentsFile(fileName: string): boolean {
    return fileName.toUpperCase() === "AGENTS.MD";
  }

  // --- src/components (all non-section paths, any depth) ---
  // Any .astro file not under a path segment named "section" must end with -component.
  // Forbidden-suffix-token check (no -page/-section/-style before -component) applies only
  // to root-level files (depth 0); files in subdirectories just need the -component suffix.
  {
    const componentsDir = join(paths.srcDirectory, "components");
    const allFiles: string[] = [];
    await walkFiles(componentsDir, allFiles, SKIP_DIRS);
    const rule = SUFFIX_LAYER_RULES[0];
    for (const filePath of allFiles) {
      const relToComponents = relative(componentsDir, filePath).replace(/\\/g, "/");
      // Skip files whose relative path contains a 'section' segment.
      if (relToComponents.split("/").some((seg) => seg === "section")) continue;
      const fileName = relToComponents.split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
      if (!rule.extensions.has(ext)) continue;
      const stem = fileName.slice(0, fileName.lastIndexOf("."));
      // layout.astro is the Class 4 singleton — exempt from suffix requirement.
      if (stem === "layout") continue;
      checkedFiles++;
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      if (!stem.endsWith(rule.requiredSuffix)) {
        violations.push(
          `${rel}: "${fileName}" must end with "-component" (src/components/ non-section layer rule per RFC-0020)`,
        );
      } else if (!relToComponents.includes("/")) {
        // Forbidden-token check only for root-level components.
        const forbidden = hasForbiddenSuffixToken(
          stem,
          rule.requiredSuffix,
          rule.forbiddenSuffixTokens,
        );
        if (forbidden) {
          violations.push(
            `${rel}: logical stem ends with forbidden layer token "${forbidden}" — root src/components/ files must not have "-page", "-section", or "-style" as the last token before "-component"`,
          );
        }
      }
    }
  }

  // --- src/components/section ---
  {
    const sectionDir = join(paths.srcDirectory, "components", "section");
    const allFiles: string[] = [];
    await walkFiles(sectionDir, allFiles, SKIP_DIRS);
    for (const filePath of allFiles) {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
      if (!SUFFIX_LAYER_RULES[1].extensions.has(ext)) continue;
      checkedFiles++;
      const stem = fileName.slice(0, fileName.lastIndexOf("."));
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      if (!stem.endsWith(SUFFIX_LAYER_RULES[1].requiredSuffix)) {
        violations.push(
          `${rel}: "${fileName}" must end with "-section" (src/components/section/ layer rule per RFC-0020)`,
        );
      } else {
        const forbidden = hasForbiddenSuffixToken(
          stem,
          SUFFIX_LAYER_RULES[1].requiredSuffix,
          SUFFIX_LAYER_RULES[1].forbiddenSuffixTokens,
        );
        if (forbidden) {
          violations.push(
            `${rel}: logical stem ends with forbidden layer token "${forbidden}" — src/components/section/ files must not have "-page", "-component", or "-style" as the last token before "-section"`,
          );
        }
      }
    }
  }

  // --- src/pages: no forbidden tokens anywhere in stem ---
  {
    const pagesDir = join(paths.srcDirectory, "pages");
    const allFiles: string[] = [];
    await walkFiles(pagesDir, allFiles, SKIP_DIRS);
    for (const filePath of allFiles) {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      checkedFiles++;
      const stem = fileName.includes(".") ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName;
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      const forbidden = hasAnyToken(stem, PAGES_FORBIDDEN_TOKENS);
      if (forbidden) {
        violations.push(
          `${rel}: forbidden token "${forbidden}" in src/pages/ file (RFC-0020 — page filenames must not contain layer-specific suffix tokens)`,
        );
      }
    }
  }

  // --- src/styles/components root: must end with -component ---
  {
    const stylesComponentsDir = join(paths.srcDirectory, "styles", "components");
    let entries: { name: string; isFile(): boolean; isDirectory(): boolean }[] = [];
    try {
      entries = (await readdir(stylesComponentsDir, { withFileTypes: true })) as typeof entries;
    } catch {
      // absent — skip
    }
    const rule = SUFFIX_LAYER_RULES[2];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (isAgentsFile(entry.name)) continue;
      const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop()!.toLowerCase() : "";
      if (!rule.extensions.has(ext)) continue;
      checkedFiles++;
      const stem = entry.name.slice(0, entry.name.lastIndexOf("."));
      const rel = relative(paths.appDirectory, join(stylesComponentsDir, entry.name)).replace(
        /\\/g,
        "/",
      );
      if (!stem.endsWith(rule.requiredSuffix)) {
        violations.push(
          `${rel}: "${entry.name}" must end with "-component" (src/styles/components/ root layer rule per RFC-0020)`,
        );
      }
    }
  }

  // --- src/styles/components/section: must end with -section ---
  {
    const stylesSectionDir = join(paths.srcDirectory, "styles", "components", "section");
    const allFiles: string[] = [];
    await walkFiles(stylesSectionDir, allFiles, SKIP_DIRS);
    const rule = SUFFIX_LAYER_RULES[3];
    for (const filePath of allFiles) {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
      if (!rule.extensions.has(ext)) continue;
      checkedFiles++;
      const stem = fileName.slice(0, fileName.lastIndexOf("."));
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      if (!stem.endsWith(rule.requiredSuffix)) {
        violations.push(
          `${rel}: "${fileName}" must end with "-section" (src/styles/components/section/ layer rule per RFC-0020)`,
        );
      }
    }
  }

  // --- src/content/components root: must end with -component (layout.md excepted) ---
  // Only files DIRECTLY under a language directory (e.g. de/, en/) are subject
  // to the -component suffix rule. Other subdirectories are exempt by purpose:
  //   - prose/  — freeform translated/untranslated prose fragments
  //   - assets/ — image and binary assets colocated with content
  //   - section/ — handled by the section-layer rule below
  // Recognised language directories use 2-letter or 3-letter lowercase codes
  // (BCP-47 primary subtag).
  {
    const rule = SUFFIX_LAYER_RULES[4];
    const LANG_DIR_PATTERN = /^[a-z]{2,3}$/;
    let langDirs: string[] = [];
    try {
      const dirents = (await readdir(join(paths.appDirectory, "src", "content", "components"), {
        withFileTypes: true,
      })) as {
        name: string;
        isDirectory(): boolean;
      }[];
      langDirs = dirents
        .filter((d) => d.isDirectory() && LANG_DIR_PATTERN.test(d.name))
        .map((d) => d.name);
    } catch {
      // absent — skip
    }
    const _contentCompRoot = join(paths.appDirectory, "src", "content", "components");
    for (const lang of langDirs) {
      const langDir = join(_contentCompRoot, lang);
      let entries: { name: string; isFile(): boolean }[] = [];
      try {
        entries = (await readdir(langDir, { withFileTypes: true })) as typeof entries;
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (isAgentsFile(entry.name)) continue;
        const ext = entry.name.includes(".")
          ? "." + entry.name.split(".").pop()!.toLowerCase()
          : "";
        if (!rule.extensions.has(ext)) continue;
        const stem = entry.name.slice(0, entry.name.lastIndexOf("."));
        // layout.md is the Class 4 singleton — exempt from suffix requirement.
        if (stem === "layout") continue;
        checkedFiles++;
        const rel = relative(paths.appDirectory, join(langDir, entry.name)).replace(/\\/g, "/");
        if (!stem.endsWith(rule.requiredSuffix)) {
          violations.push(
            `${rel}: "${entry.name}" must end with "-component" (src/content/components/ root layer rule per RFC-0020)`,
          );
        }
      }
    }
  }

  // --- src/content/components/section: must end with -section ---
  {
    const contentCompDir = join(paths.appDirectory, "src", "content", "components");
    const rule = SUFFIX_LAYER_RULES[5];
    let langDirs: string[] = [];
    try {
      const dirents = (await readdir(contentCompDir, { withFileTypes: true })) as {
        name: string;
        isDirectory(): boolean;
      }[];
      langDirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      // absent — skip
    }
    for (const lang of langDirs) {
      const sectionDir = join(contentCompDir, lang, "section");
      const allFiles: string[] = [];
      await walkFiles(sectionDir, allFiles, SKIP_DIRS);
      for (const filePath of allFiles) {
        const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
        if (isAgentsFile(fileName)) continue;
        const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
        if (!rule.extensions.has(ext)) continue;
        checkedFiles++;
        const stem = fileName.slice(0, fileName.lastIndexOf("."));
        const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
        if (!stem.endsWith(rule.requiredSuffix)) {
          violations.push(
            `${rel}: "${fileName}" must end with "-section" (src/content/components/section/ layer rule per RFC-0020)`,
          );
        }
      }
    }
  }

  // --- src/styles/ outside components/: -style token forbidden ---
  {
    const stylesDir = join(paths.srcDirectory, "styles");
    const componentsSubpath = join(paths.srcDirectory, "styles", "components");
    const allFiles: string[] = [];
    await walkFiles(stylesDir, allFiles, SKIP_DIRS);
    for (const filePath of allFiles) {
      // Skip files already checked by the styles/components rules above.
      if (filePath.startsWith(componentsSubpath)) continue;
      const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      checkedFiles++;
      const stem = fileName.includes(".") ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName;
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      const forbidden = hasAnyToken(stem, STYLES_OTHER_FORBIDDEN_TOKENS);
      if (forbidden) {
        violations.push(
          `${rel}: forbidden token "${forbidden}" in src/styles/ file (RFC-0020 — style filenames must not contain "-style")`,
        );
      }
    }
  }

  // --- src/semantic/pages: page builder .ts files must not contain -page suffix ---
  {
    const semanticPagesDir = join(paths.srcDirectory, "semantic", "pages");
    const allFiles: string[] = [];
    await walkFiles(semanticPagesDir, allFiles, SKIP_DIRS);
    for (const filePath of allFiles) {
      const fileName = filePath.replace(/\\/g, "/").split("/").pop()!;
      if (isAgentsFile(fileName)) continue;
      const ext = fileName.includes(".") ? "." + fileName.split(".").pop()!.toLowerCase() : "";
      if (ext !== ".ts") continue;
      const stem = fileName.slice(0, fileName.lastIndexOf("."));
      // Barrel and utility files are exempt.
      if (stem === "index" || stem === "_shared") continue;
      checkedFiles++;
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      if (stem.includes("-page")) {
        violations.push(
          `${rel}: page builder filename contains forbidden "-page" token — semantic page builders must be named by page slug (e.g., home.ts, wir-ueber-uns.ts)`,
        );
      }
    }
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { checkedFiles, violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[naming.suffixes.lint] OK (${checkedFiles} files checked)`
        : undefined,
  };
}
