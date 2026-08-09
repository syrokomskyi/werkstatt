/*
<MODULE_CONTRACT>
<purpose>
Implements fonts.imports.generate — the OS codegen command that reads the biome
fonts section from packages/ontology/biomes/<id>.yaml and emits
apps/<app>/src/styles/fonts.imports.css with @import "@fontsource/..." lines.
The generated file is imported by global.css and must not be hand-edited.
(DNA-50, RFC-0371)
</purpose>
<non-goals>
  <item>Do not validate the biome file — biome.contract.validate handles that.</item>
  <item>Do not copy font binary files — Vite bundles woff2 from node_modules as hashed _astro/ assets.</item>
  <item>Do not generate @font-face rules — Fontsource CSS imports handle that.</item>
  <item>The generated file carries a GENERATED marker (RFC-0081) and is committed; generators only overwrite files with the marker.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0371: Initial creation — replaces fonts.generate (RFC-0164) copy-to-public pipeline.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { biomeSchema, systemManifestSchema } from "@warpgogol/werkstatt-site/ontology/schemas";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { GENERATED_MARKER } from "./generated-marker.ts";

interface FontsImportsResult {
  app: string;
  biomeId: string;
  outputPath: string;
  imports: number;
  cssChanged: boolean;
}

/**
 * Reads apps/<app>/src/content/system.md, resolves the biome, reads its
 * fonts section, and generates apps/<app>/src/styles/fonts.imports.css
 * with @import "@fontsource/<pkg>/<weight>.css" lines for each declared
 * weight and @import "@fontsource/<pkg>/<weight>-italic.css" for italic weights.
 *
 * Run this command as part of the build prepare pipeline before Astro build.
 */
export async function runFontsImportsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FontsImportsResult>> {
  if (!context.site?.directory) {
    context.logger.error("fonts.imports.generate requires an app context (pass --site <name>).");
    return {
      exitCode: 1,
      data: { app: "", biomeId: "", outputPath: "", imports: 0, cssChanged: false },
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
      `fonts.imports.generate: cannot read system manifest — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId: "", outputPath: "", imports: 0, cssChanged: false },
    };
  }

  const sysResult = systemManifestSchema.safeParse(systemRaw);
  if (!sysResult.success) {
    context.logger.error(
      "fonts.imports.generate: system manifest is invalid — run system.manifest.validate for details",
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId: "", outputPath: "", imports: 0, cssChanged: false },
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
      `fonts.imports.generate: cannot read biome "${biomeId}" — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath: "", imports: 0, cssChanged: false },
    };
  }

  const biomeResult = biomeSchema.safeParse(biomeRaw);
  if (!biomeResult.success) {
    context.logger.error(
      `fonts.imports.generate: biome "${biomeId}" is invalid — run biome.contract.validate for details`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath: "", imports: 0, cssChanged: false },
    };
  }

  const biome = biomeResult.data;

  // ── Generate CSS ────────────────────────────────────────────────────────
  const importLines: string[] = [];

  if (biome.fonts && biome.fonts.length > 0) {
    for (const font of biome.fonts) {
      for (const weight of font.weights) {
        importLines.push(`@import "${font.package}/${weight}.css";`);
      }
      if (font.italicWeights) {
        for (const weight of font.italicWeights) {
          importLines.push(`@import "${font.package}/${weight}-italic.css";`);
        }
      }
    }
  }

  const cssLines: string[] = [
    "/* " + GENERATED_MARKER + " */",
    `/* Source: packages/ontology/biomes/${biomeId}.yaml                              */`,
    "/* Generated by: fonts.imports.generate (site-kernel-codegen, RFC-0371)          */",
    "/* Fontsource CSS imports; Vite bundles woff2 as hashed _astro/ assets.          */",
    "",
    ...importLines,
    "",
  ];

  const css = cssLines.join("\n");
  const outputPath = join(appDir, "src", "styles", "fonts.imports.css");
  const stylesDir = join(appDir, "src", "styles");

  let cssChanged = false;
  try {
    await mkdir(stylesDir, { recursive: true });
    if (existsSync(outputPath)) {
      const existing = await readFile(outputPath, "utf-8");
      if (existing !== css) {
        await writeFile(outputPath, css, "utf-8");
        cssChanged = true;
      }
    } else {
      await writeFile(outputPath, css, "utf-8");
      cssChanged = true;
    }
  } catch (e) {
    context.logger.error(
      `fonts.imports.generate: failed to write ${outputPath} — ${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      exitCode: 1,
      data: { app: appSlug, biomeId, outputPath, imports: 0, cssChanged: false },
    };
  }

  context.logger.info(
    `fonts.imports.generate: OK — ${importLines.length} import(s) written to ${outputPath}`,
  );

  return {
    data: { app: appSlug, biomeId, outputPath, imports: importLines.length, cssChanged },
    exitCode: 0,
    summary: `OK — ${importLines.length} import(s) written to src/styles/fonts.imports.css`,
  };
}
