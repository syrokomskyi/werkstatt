/*
<MODULE_CONTRACT>
<purpose>
Implements biome.css.generate — the OS codegen command that reads the biome
referenced in apps/<app>/src/content/system.md, maps its biome fields to CSS custom
properties, and writes apps/<app>/src/styles/biome.generated.css.
The generated file is imported by global.css and must not be hand-edited.
(DNA-23, RFC-0025)
</purpose>
<non-goals>
  <item>Do not validate the biome file — biome.contract.validate handles that.</item>
  <item>Do not generate anything other than the biome CSS block.</item>
  <item>The generated file carries a GENERATED marker (RFC-0081) and is committed; generators only overwrite files with the marker.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>RFC-0071: Emit @layer biome.<id> and map extended biome contract fields to design tokens.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { biomeSchema, systemManifestSchema } from "@warpgogol/ontology/schemas";
import {
  BIOME_TO_TOKEN_MAP,
  BIOME_TOKEN_ALIASES,
  BIOME_TOKEN_DERIVED,
  getBiomeField,
} from "@warpgogol/ontology";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { GENERATED_MARKER } from "./generated-marker.ts";
import { normalizeCssValue } from "@warpgogol/share/css-value-normalize";

// Re-export for backward compatibility within codegen internals
export { normalizeCssValue };

// ---------------------------------------------------------------------------
// Token field → CSS custom property name mapping
// ---------------------------------------------------------------------------

/**
 * Format a CSS custom-property value for emission. Long gradient values are
 * pre-broken into multiple lines so Prettier does not reformat them.
 */
function formatCssValue(cssVar: string, value: string): string {
  const line = `    ${cssVar}: ${value};`;
  if (line.length <= 100 || !value.includes("gradient(")) {
    return value;
  }
  const openIdx = value.indexOf("(");
  const prefix = value.slice(0, openIdx + 1);
  const suffix = value.slice(openIdx + 1);
  const body = suffix.endsWith(");")
    ? suffix.slice(0, -2)
    : suffix.endsWith(")")
      ? suffix.slice(0, -1)
      : suffix;
  const parts = body.split(", ");
  return `${prefix}\n${parts.map((p) => `      ${p}`).join(",\n")}\n    )`;
}

// BIOME_TO_TOKEN_MAP is imported from @warpgogol/ontology (consolidated projection).

// ---------------------------------------------------------------------------
// biome.css.generate
// ---------------------------------------------------------------------------

interface BiomeCssResult {
  app: string;
  biomeId: string;
  outputPath: string;
  tokensGenerated: number;
}

/**
 * Reads apps/<app>/src/content/system.md, resolves the biome, and generates
 * apps/<app>/src/styles/biome.generated.css.
 *
 * The generated file contains a single @layer biome.<id> wrapper with
 * html[data-biome="<id>"] { } mapping each declared biome field to --ds-* tokens.
 *
 * Run this command as part of the build prepare pipeline before build.check.
 */
export async function runBiomeCssGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BiomeCssResult>> {
  if (!context.site?.directory) {
    context.logger.error("biome.css.generate requires an app context (pass --site <name>).");
    return {
      exitCode: 1,
      data: { app: "", biomeId: "", outputPath: "", tokensGenerated: 0 },
    };
  }

  const appDir = context.site.directory;
  const appSlug = appDir.split(/[/\\]/).pop() ?? appDir;
  const contentDir = join(appDir, "src", "content");

  // ── Read system manifest ────────────────────────────────────────────────
  let systemRaw: unknown;
  try {
    const systemResult = await loadSystemManifest(contentDir);
    systemRaw = systemResult.manifest;
  } catch (e) {
    context.logger.error(
      `biome.css.generate: cannot read system manifest — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId: "", outputPath: "", tokensGenerated: 0 },
    };
  }

  const sysResult = systemManifestSchema.safeParse(systemRaw);
  if (!sysResult.success) {
    context.logger.error(
      `biome.css.generate: system manifest is invalid — run system.manifest.validate for details`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId: "", outputPath: "", tokensGenerated: 0 },
    };
  }

  const biomeId = sysResult.data.identity.biome;
  const biomePath = join(
    context.workspaceRoot,
    "packages",
    "ontology",
    "biomes",
    `${biomeId}.yaml`,
  );

  // ── Read biome YAML ─────────────────────────────────────────────────────
  let biomeRaw: unknown;
  try {
    const content = await readFile(biomePath, "utf-8");
    biomeRaw = parseYaml(content);
  } catch (e) {
    context.logger.error(
      `biome.css.generate: cannot read biome "${biomeId}" — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath: "", tokensGenerated: 0 },
    };
  }

  const biomeResult = biomeSchema.safeParse(biomeRaw);
  if (!biomeResult.success) {
    context.logger.error(
      `biome.css.generate: biome "${biomeId}" is invalid — run biome.contract.validate for details`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath: "", tokensGenerated: 0 },
    };
  }

  const biome = biomeResult.data;

  // ── Generate CSS ────────────────────────────────────────────────────────
  const cssLines: string[] = [
    "/* " + GENERATED_MARKER + " */",
    "/* Source: packages/ontology/biomes/" + biomeId + ".yaml              */",
    "/* Generated by: biome.css.generate (site-kernel-codegen, RFC-0071)   */",
    "",
    `@layer biome.${biomeId} {`,
    `  html[data-biome="${biomeId}"] {`,
  ];

  let tokensGenerated = 0;

  // Use the consolidated projection: iterate primary mapping, then aliases,
  // then derived entries — all from @warpgogol/ontology.
  const biomeRecord = biome as unknown as Record<string, unknown>;

  for (const [field, cssVar] of Object.entries(BIOME_TO_TOKEN_MAP)) {
    const value = getBiomeField(biomeRecord, field);
    if (value !== undefined && value !== null) {
      const normalized = normalizeCssValue(String(value));
      cssLines.push(`    ${cssVar}: ${formatCssValue(cssVar, normalized)};`);
      tokensGenerated++;
    }
  }

  // Aliases (one biome field → additional CSS var)
  for (const { field, token } of BIOME_TOKEN_ALIASES) {
    const value = getBiomeField(biomeRecord, field);
    if (value !== undefined && value !== null) {
      const normalized = normalizeCssValue(String(value));
      cssLines.push(`    ${token}: ${formatCssValue(token, normalized)};`);
      tokensGenerated++;
    }
  }

  // Derived tokens (computed from multiple biome fields)
  for (const { token, compute } of BIOME_TOKEN_DERIVED) {
    const value = compute(biomeRecord);
    if (value !== undefined) {
      cssLines.push(`    ${token}: ${formatCssValue(token, value)};`);
      tokensGenerated++;
    }
  }

  cssLines.push("  }");
  cssLines.push("}");
  cssLines.push("");

  const outputPath = join(appDir, "src", "styles", "biome.generated.css");
  const stylesDir = join(appDir, "src", "styles");

  try {
    await mkdir(stylesDir, { recursive: true });
    await writeFile(outputPath, cssLines.join("\n"), "utf-8");
  } catch (e) {
    context.logger.error(
      `biome.css.generate: failed to write ${outputPath} — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath, tokensGenerated: 0 },
    };
  }

  context.logger.info(
    `biome.css.generate: OK — wrote ${tokensGenerated} token${tokensGenerated === 1 ? "" : "s"} to ${outputPath}`,
  );

  return {
    data: { app: appSlug, biomeId, outputPath, tokensGenerated },
    exitCode: 0,
    summary: `OK — ${tokensGenerated} tokens written to src/styles/biome.generated.css`,
  };
}
