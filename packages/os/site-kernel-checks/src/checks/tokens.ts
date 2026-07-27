/*
<MODULE_CONTRACT>
<purpose>design-system.token.lint / hardcoded-color.lint / biome.coverage.hint — design-token
hygiene: forbid raw CSS custom properties outside --ds-* and raw color literals, and hint at
studio defaults a biome silently inherits (RFC-0071/0098).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: split out of checks.ts (Phase 3 file-size split).</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import {
  collectFilesByExtensions,
  getFlagValues,
  getLineColumn,
  stripBlockCommentsPreserveLength,
  stripUrlsPreserveLength,
} from "./shared.ts";

const DEFAULT_TOKEN_ROOTS = ["src"];
const DEFAULT_COLOR_ROOTS = ["src/styles"];
const TOKEN_ALLOWED_PREFIX = "--ds-";
const TOKEN_FILE_EXTENSIONS = new Set([".css", ".astro", ".ts", ".tsx", ".js", ".jsx"]);
const TOKEN_DECLARATION_REGEX = /(^|[\s{;])(--[a-z][a-z0-9-]*)\s*:/gim;
const TOKEN_VAR_USAGE_REGEX = /var\(\s*(--[a-z][a-z0-9-]*)/gim;
const TOKEN_PROPERTY_AT_RULE_REGEX = /@property\s+(--[a-z][a-z0-9-]*)/gim;
const TOKEN_STYLE_API_REGEX =
  /\b(setProperty|getPropertyValue|removeProperty)\(\s*['"](--[a-z][a-z0-9-]*)/gim;
const COLOR_EXTENSION = ".css";
const RGBA_REGEX = /\brgba\s*\(/gim;
const HEX_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b/gm;

function resolveRoots(
  appDirectory: string,
  input: KernelCommandInput,
  defaults: string[],
): string[] {
  const fromFlags = getFlagValues(input, "root");
  const values = fromFlags.length > 0 ? fromFlags : defaults;
  return values.map((value) => resolve(appDirectory, value));
}

function addFindingsFromRegex(
  text: string,
  filePath: string,
  regex: RegExp,
  tokenGroupIndex: number,
): Array<{ filePath: string; line: number; column: number; token: string }> {
  const findings: Array<{ filePath: string; line: number; column: number; token: string }> = [];
  for (const match of text.matchAll(regex)) {
    const token = match[tokenGroupIndex];
    if (typeof token !== "string") continue;
    if (token.startsWith(TOKEN_ALLOWED_PREFIX)) continue;

    const matchIndex = match.index ?? 0;
    const tokenOffsetInsideMatch = match[0].indexOf(token);
    const tokenIndex =
      tokenOffsetInsideMatch >= 0 ? matchIndex + tokenOffsetInsideMatch : matchIndex;
    const { line, column } = getLineColumn(text, tokenIndex);
    findings.push({ filePath, line, column, token });
  }
  return findings;
}

export async function runDesignSystemTokenLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ findings: number }>> {
  const paths = requireAstroSitePaths(context);
  const roots = resolveRoots(paths.appDirectory, input, DEFAULT_TOKEN_ROOTS);
  const allFiles: string[] = [];

  for (const root of roots) {
    allFiles.push(...(await collectFilesByExtensions(root, TOKEN_FILE_EXTENSIONS)));
  }

  const findings: Array<{ filePath: string; line: number; column: number; token: string }> = [];

  for (const filePath of allFiles) {
    const content = await readFile(filePath, "utf8");
    findings.push(
      ...addFindingsFromRegex(content, filePath, TOKEN_DECLARATION_REGEX, 2),
      ...addFindingsFromRegex(content, filePath, TOKEN_VAR_USAGE_REGEX, 1),
      ...addFindingsFromRegex(content, filePath, TOKEN_PROPERTY_AT_RULE_REGEX, 1),
      ...addFindingsFromRegex(content, filePath, TOKEN_STYLE_API_REGEX, 2),
    );
  }

  for (const finding of findings) {
    const relativePath = relative(paths.appDirectory, finding.filePath).replace(/\\/g, "/");
    context.logger.error(`${relativePath}:${finding.line}:${finding.column} ${finding.token}`);
  }

  return {
    data: { findings: findings.length },
    exitCode: findings.length > 0 ? 1 : 0,
    summary: findings.length > 0 ? undefined : "OK: only --ds-* custom properties found",
  };
}

export async function runHardcodedColorLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ findings: number }>> {
  const paths = requireAstroSitePaths(context);
  const roots = resolveRoots(paths.appDirectory, input, DEFAULT_COLOR_ROOTS);
  const distilledCssPath = resolve(paths.appDirectory, "src/styles/distilled.css").toLowerCase();
  const ignoredDefinitionPatterns = [
    "src/styles/global-bundle.css",
    "src/styles/global.css",
    "src/styles/tokens-override.css", // Wave 6: app-level token override definitions — raw values by design
    "src/styles/biome.generated.css", // RFC-0025: auto-generated from biome YAML — raw color tokens are the file's purpose
  ];
  const allFiles: string[] = [];

  for (const root of roots) {
    allFiles.push(...(await collectFilesByExtensions(root, new Set([COLOR_EXTENSION]))));
  }

  const findings: Array<{ filePath: string; line: number; column: number; token: string }> = [];

  for (const filePath of allFiles) {
    const resolvedPath = resolve(filePath).toLowerCase();
    if (resolvedPath === distilledCssPath) {
      continue;
    }

    const relativePath = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
    if (ignoredDefinitionPatterns.includes(relativePath)) {
      continue;
    }

    const content = await readFile(filePath, "utf8");
    const cleanText = stripUrlsPreserveLength(stripBlockCommentsPreserveLength(content));

    for (const match of cleanText.matchAll(RGBA_REGEX)) {
      const index = match.index ?? 0;
      const { line, column } = getLineColumn(cleanText, index);
      findings.push({ filePath, line, column, token: "rgba(" });
    }

    for (const match of cleanText.matchAll(HEX_COLOR_REGEX)) {
      const token = match[0];
      const index = match.index ?? 0;
      const { line, column } = getLineColumn(cleanText, index);
      findings.push({ filePath, line, column, token });
    }
  }

  for (const finding of findings) {
    const relativePath = relative(paths.appDirectory, finding.filePath).replace(/\\/g, "/");
    context.logger.error(`${relativePath}:${finding.line}:${finding.column} ${finding.token}`);
  }

  return {
    data: { findings: findings.length },
    exitCode: findings.length > 0 ? 1 : 0,
    summary: findings.length > 0 ? undefined : "OK: no hardcoded rgba(...) or #hex colors found",
  };
}

// ---------------------------------------------------------------------------
// RFC-0098 follow-up: detect biome inheritance of brand-tinted studio defaults.
//
// Studio `packages/tokens/src/tokens.css` carries historical defaults for
// gradients / shadows / section-alt colors. Several of those defaults bake
// nicaragua-projekt brand RGB into the values (e.g. `rgb(181 76 31)` orange,
// `rgb(26 67 50)` forest green). A biome that doesn't override them silently
// renders with another brand's identity — invisible to the operator until a
// human opens the page and notices the gradient color is "wrong".
//
// Mapping below pairs each known brand-tinted studio token with the biome
// dotted-path that overrides it. When the app's biome lacks the override, we
// emit a hint with the studio value + the YAML path to add.
// ---------------------------------------------------------------------------
interface BrandedStudioDefault {
  cssVar: string;
  biomePath: string; // dotted path, e.g. "gradients.primary"
  /** Short human description of the literal brand tint baked into the studio default. */
  tint: string;
}

const BRAND_TINTED_STUDIO_DEFAULTS: BrandedStudioDefault[] = [
  // RFC-0098 promoted: gradients
  {
    cssVar: "--ds-gradient-accent",
    biomePath: "gradients.accent",
    tint: "nicaragua orange rgb(181 76 31)",
  },
  {
    cssVar: "--ds-gradient-primary",
    biomePath: "gradients.primary",
    tint: "nicaragua forest green rgb(26 67 50)",
  },
  // RFC-0098 promoted: shadows (only the tinted one — others are gray)
  {
    cssVar: "--ds-shadow-glow",
    biomePath: "shadows.glow",
    tint: "nicaragua green rgb(28 69 50 / 0.12)",
  },
  // Pre-RFC-0098 tinted color tokens (not yet promoted; document the drift)
  {
    cssVar: "--ds-color-section-alt-link",
    biomePath: "components.sectionAltLink",
    tint: "nicaragua warm gold rgb(214 158 46)",
  },
  {
    cssVar: "--ds-color-section-alt-link-hover",
    biomePath: "components.sectionAltLinkHover",
    tint: "nicaragua warm gold-hover rgb(230 176 62)",
  },
  {
    cssVar: "--ds-color-section-alt-link-visited",
    biomePath: "components.sectionAltLinkVisited",
    tint: "nicaragua warm gold-visited rgb(192 139 38)",
  },
  {
    cssVar: "--ds-color-section-alt-accent",
    biomePath: "components.sectionAltAccent",
    tint: "nicaragua brown rgb(139 69 19)",
  },
];

async function detectBrandedStudioInheritance(
  workspaceRoot: string,
  appDirectory: string,
): Promise<string[]> {
  // Load the app's biome via system.md identity.biome.
  const { loadSystemManifest } = await import("@gogol/site-kernel-content");
  let biomeId: string;
  try {
    const result = await loadSystemManifest(join(appDirectory, "src", "content"));
    biomeId = result.manifest.identity.biome;
  } catch {
    return [];
  }

  const biomePath = join(workspaceRoot, "packages", "ontology", "biomes", `${biomeId}.yaml`);
  let biomeRaw: string;
  try {
    biomeRaw = await readFile(biomePath, "utf-8");
  } catch {
    return [];
  }

  // Lightweight presence check: we don't parse YAML, just substring-test for
  // the dotted-path keys' last segments. That's enough because biome keys are
  // unique within their section.
  function biomeDeclares(dotted: string): boolean {
    // Walk the YAML for the section + key pair. E.g. "gradients.primary" →
    // look for a top-level `gradients:` block (line starts with `gradients:`)
    // followed by an indented `primary:` key before the next top-level key.
    const [section, key] = dotted.split(".");
    if (!section || !key) return false;
    // Greedy-then-stop pattern: section header at line-start, then indented
    // content up to (but not including) the next non-indented non-blank line.
    const sectionRe = new RegExp(`(?:^|\\n)${section}:[ \\t]*\\n((?:[ \\t]+[^\\n]*\\n|\\n)*)`);
    const match = sectionRe.exec(biomeRaw);
    if (!match) return false;
    const block = match[1] ?? "";
    return new RegExp(`(?:^|\\n)[ \\t]+${key}:`).test(block);
  }

  const hints: string[] = [];
  for (const t of BRAND_TINTED_STUDIO_DEFAULTS) {
    if (biomeDeclares(t.biomePath)) continue;
    hints.push(
      `biome "${biomeId}" inherits studio default ${t.cssVar} which is tinted with ${t.tint}. ` +
        `Declare ${t.biomePath} in packages/ontology/biomes/${biomeId}.yaml to avoid rendering with another brand's identity (RFC-0098).`,
    );
  }
  return hints;
}

/**
 * biome.coverage.hint — info-level signal (RFC-0071).
 *
 * Scans apps/<id>/src/styles/global.css for new --ds-color-* declarations whose
 * value is a raw color literal (hex / rgb / rgba / hsl). Such declarations are
 * permitted by RFC-0025 (component-specific tokens belong in global.css), but
 * each one is a signal that the biome schema does not yet cover that brand
 * surface. The hint suggests promoting the token into the biome YAML so the
 * next sibling site can reuse it.
 *
 * Exits 0 always — this is advisory, never blocking. Findings are emitted at
 * info level so CI surfaces them in the run log without failing the build.
 */
export async function runBiomeCoverageHint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ hints: number }>> {
  const paths = requireAstroSitePaths(context);
  const globalCssPath = resolve(paths.appDirectory, "src/styles/global.css");

  let source: string;
  try {
    source = await readFile(globalCssPath, "utf8");
  } catch {
    return {
      data: { hints: 0 },
      exitCode: 0,
      summary: "biome.coverage.hint: no src/styles/global.css present (noop)",
    };
  }

  const cleaned = stripUrlsPreserveLength(stripBlockCommentsPreserveLength(source));

  // Match `--ds-color-NAME: <raw>` where <raw> is hex, rgb(...), rgba(...), hsl(...) or color(...)
  // and capture the token name. var(--something) values are allowed (not a leak).
  const TOKEN_DECLARATION = /--ds-color-([a-z0-9-]+)\s*:\s*([^;]+);/gim;
  const RAW_VALUE = /^(?:#[0-9a-fA-F]{3,8}|rgba?\s*\(|hsla?\s*\(|color\s*\()/;

  const hints: Array<{ line: number; token: string; value: string }> = [];

  for (const match of cleaned.matchAll(TOKEN_DECLARATION)) {
    const tokenName = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (!RAW_VALUE.test(value)) continue; // var(--…) or color-mix — not a leak

    const index = match.index ?? 0;
    const { line } = getLineColumn(cleaned, index);
    hints.push({ line, token: `--ds-color-${tokenName}`, value });
  }

  const relativePath = relative(paths.appDirectory, globalCssPath).replace(/\\/g, "/");
  for (const hint of hints) {
    context.logger.info(
      `${relativePath}:${hint.line} ${hint.token} = ${hint.value}` +
        ` — consider promoting to packages/ontology/biomes/<id>.yaml so sibling sites can reuse it.`,
    );
  }

  // RFC-0098 follow-up: second pass — does the app's biome silently inherit
  // brand-tinted studio defaults? `--ds-gradient-primary`, `--ds-gradient-accent`,
  // `--ds-shadow-glow`, and several `--ds-color-section-alt-*` carry literal
  // RGB values that originated as nicaragua-projekt brand colors. A biome that
  // doesn't override them ships rendered output tinted with another brand's
  // identity. We list the affected biome keys so the operator can declare them.
  const studioInheritanceHints = await detectBrandedStudioInheritance(
    context.workspaceRoot,
    paths.appDirectory,
  );
  for (const h of studioInheritanceHints) {
    context.logger.info(`[BRAND-DRIFT] ${h}`);
  }

  const totalHints = hints.length + studioInheritanceHints.length;
  return {
    data: { hints: totalHints },
    exitCode: 0,
    summary:
      totalHints === 0
        ? "biome.coverage.hint: OK — no app-local --ds-color-* leaks and no brand-tinted studio defaults inherited"
        : `biome.coverage.hint: ${hints.length} app-local --ds-color-* leak(s)` +
          (studioInheritanceHints.length > 0
            ? ` + ${studioInheritanceHints.length} brand-tinted studio default(s) inherited`
            : ""),
  };
}
