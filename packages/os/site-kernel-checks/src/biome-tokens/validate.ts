/*
<MODULE_CONTRACT>
<purpose>RFC-0201 biome token validation command handler: validates CSS token usage against active app biomes and reports BIOME-TOKEN-01..04 violations.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0201: initial implementation of biome token validation.</item>
  <item>RFC-0203: map violations to canonical Diagnostic with ruleId and structured data.</item>
  <item>RFC-0303 Phase 3: extracted from biome-tokens.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { TOKEN_NAME_SET } from "@gogol/tokens";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { hasGeneratedMarker } from "@gogol/site-kernel-codegen";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { fileExists } from "../lib/file-exists.ts";
import { diagnosticsResult } from "../result-helpers.ts";
import {
  collectCssFiles,
  extractTokenUses,
  extractCssDefinitions,
  normalizeCssValue,
} from "./css-utils.ts";
import { loadBiomeYaml, isLightBiome, hasDarkSurfaceIntent, resolveToken } from "./biome-utils.ts";
import { buildExpectedBiomeCss } from "./expected-css.ts";
import type { BiomeTokenViolation, BiomeTokensResult } from "./types.ts";

// Main command implementation
export async function runBiomeTokensValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BiomeTokensResult>> {
  const violations: BiomeTokenViolation[] = [];
  let appsScanned = 0;
  let biomesScanned = 0;
  let cssFilesScanned = 0;
  let tokenUsesFound = 0;

  const biomesDir = join(context.workspaceRoot, "packages", "ontology", "biomes");
  const uiDir = join(context.workspaceRoot, "packages", "ui", "src");
  const appsDir = join(context.workspaceRoot, "apps");

  // Determine target apps from context/flags/args
  let targetApps: string[] = [];
  const appFlag = context.site?.name ?? (input.flags.site as string | undefined) ?? input.args[0];
  const allFlag = input.flags.all === true || input.args.includes("--all");

  if (appFlag) {
    targetApps = [appFlag];
  } else if (allFlag) {
    try {
      targetApps = await readdir(appsDir);
    } catch {
      targetApps = [];
    }
  }

  const biomeOnlyMode = targetApps.length === 0;

  // Collect shared UI CSS
  const uiCssFiles = await collectCssFiles(uiDir);

  if (!biomeOnlyMode) {
    for (const appId of targetApps) {
      const appDir = context.site?.directory ?? join(appsDir, appId);
      if (!(await fileExists(appDir))) {
        violations.push({
          rule: "BIOME-TOKEN-01",
          severity: "error",
          app: appId,
          file: appDir,
          token: "N/A",
          message: `App directory does not exist: ${appId}`,
          fixHint: "Verify the app name or remove the --site flag.",
        });
        continue;
      }

      appsScanned++;
      const contentDir = join(appDir, "src", "content");
      const systemMdPath = join(contentDir, "system.md");

      if (!(await fileExists(systemMdPath))) {
        violations.push({
          rule: "BIOME-TOKEN-01",
          severity: "error",
          app: appId,
          file: systemMdPath,
          token: "N/A",
          message: `System manifest not found for app: ${appId}`,
          fixHint: "Ensure src/content/system.md exists with identity.biome configured.",
        });
        continue;
      }

      let biomeId: string;
      try {
        const systemResult = await loadSystemManifest(contentDir);
        biomeId = systemResult.manifest.identity.biome;
      } catch (e) {
        violations.push({
          rule: "BIOME-TOKEN-01",
          severity: "error",
          app: appId,
          file: systemMdPath,
          token: "N/A",
          message: `Failed to load system manifest: ${e instanceof Error ? e.message : String(e)}`,
          fixHint: "Fix the system.md YAML syntax.",
        });
        continue;
      }

      const biome = await loadBiomeYaml(biomesDir, biomeId);
      if (!biome) {
        violations.push({
          rule: "BIOME-TOKEN-01",
          severity: "error",
          app: appId,
          file: join(biomesDir, `${biomeId}.yaml`),
          token: "N/A",
          biomeId,
          message: `Biome YAML not found: ${biomeId}`,
          fixHint: `Create packages/ontology/biomes/${biomeId}.yaml or update system.md identity.biome.`,
        });
        continue;
      }

      biomesScanned++;
      const isLight = isLightBiome(biome);

      // BIOME-TOKEN-04: Check generated CSS drift
      const appStylesDir = join(appDir, "src", "styles");
      const generatedCssPath = join(appStylesDir, "biome.generated.css");

      if (await fileExists(generatedCssPath)) {
        try {
          const generatedContent = await readFile(generatedCssPath, "utf-8");
          const generatedDefs = extractCssDefinitions(generatedContent);
          const expectedDefs = buildExpectedBiomeCss(biome);

          for (const [token, expectedValue] of expectedDefs.entries()) {
            const actualValue = generatedDefs.get(token);
            if (
              actualValue !== undefined &&
              normalizeCssValue(actualValue) !== normalizeCssValue(expectedValue)
            ) {
              violations.push({
                rule: "BIOME-TOKEN-04",
                severity: "error",
                app: appId,
                file: generatedCssPath,
                token,
                biomeId,
                message: `Generated biome CSS value for ${token} differs from YAML expectation.`,
                fixHint: `Run biome.css.generate to regenerate ${generatedCssPath} from the YAML source.`,
              });
            }
          }
        } catch (e) {
          context.logger.warn(`Could not read generated CSS: ${e}`);
        }
      }

      // BIOME-TOKEN-03: Check app CSS for token overrides (skip biome.generated.css - it's canonical)
      const appCssFiles = await collectCssFiles(appStylesDir);
      for (const cssFile of appCssFiles) {
        // Skip biome.generated.css - it's the canonical output per RFC-0071
        if (cssFile.endsWith("biome.generated.css")) continue;

        cssFilesScanned++;
        const content = await readFile(cssFile, "utf-8");
        const isGenerated = hasGeneratedMarker(content);
        const definitions = extractCssDefinitions(content);

        for (const token of definitions.keys()) {
          if (token.startsWith("--ds-")) {
            const severity: "error" | "warning" = isGenerated ? "error" : "warning";
            violations.push({
              rule: "BIOME-TOKEN-03",
              severity,
              app: appId,
              file: cssFile,
              token,
              biomeId,
              message: `${isGenerated ? "Generated" : "App-local"} CSS defines biome token ${token}.`,
              fixHint: isGenerated
                ? `Update packages/ontology/biomes/${biomeId}.yaml and the generator, not the generated file.`
                : `Consider moving token definition to the biome YAML for cross-site consistency.`,
            });
          }
        }
      }

      // Scan UI CSS for token uses
      for (const cssFile of uiCssFiles) {
        cssFilesScanned++;
        const content = await readFile(cssFile, "utf-8");
        const tokenUses = extractTokenUses(content, cssFile);
        tokenUsesFound += tokenUses.length;

        for (const use of tokenUses) {
          const resolution = await resolveToken(use.token, biomeId, appStylesDir);

          // BIOME-TOKEN-01: Unresolved token
          if (resolution.source === "missing") {
            violations.push({
              rule: "BIOME-TOKEN-01",
              severity: "error",
              app: appId,
              file: use.file,
              selector: use.selector,
              property: use.property,
              token: use.token,
              biomeId,
              source: resolution.source,
              message: `Token ${use.token} used at ${use.selector} is not defined.`,
              fixHint: `Add ${use.token} to packages/ontology/biomes/${biomeId}.yaml or verify the token name.`,
            });
          }

          // BIOME-TOKEN-02: Unsafe contrast-intent inheritance
          if (
            resolution.source === "tokens-default" &&
            isLight &&
            hasDarkSurfaceIntent(use.token)
          ) {
            violations.push({
              rule: "BIOME-TOKEN-02",
              severity: "error",
              app: appId,
              file: use.file,
              selector: use.selector,
              property: use.property,
              token: use.token,
              source: resolution.source,
              biomeId,
              message: `Light biome "${biomeId}" inherits dark-background token ${use.token} from packages/tokens while ${use.selector} uses it on a light surface.`,
              fixHint: `Add an explicit semantic value for ${use.token} to packages/ontology/biomes/${biomeId}.yaml, or change the component to use an adaptive/light-surface token. Do not patch generated app CSS.`,
            });
          }
        }
      }
    }
  } else {
    // Biome-only mode
    context.logger.info("Running in biome-only mode (no --site or --all specified).");
    try {
      const biomeFiles = await readdir(biomesDir);
      for (const file of biomeFiles) {
        if (!file.endsWith(".yaml")) continue;
        const biomeId = file.replace(".yaml", "");
        const biome = await loadBiomeYaml(biomesDir, biomeId);
        if (!biome) continue;
        biomesScanned++;

        const expectedTokens = buildExpectedBiomeCss(biome);
        for (const [token] of expectedTokens.entries()) {
          if (!TOKEN_NAME_SET.has(token)) {
            violations.push({
              rule: "BIOME-TOKEN-01",
              severity: "error",
              file: join(biomesDir, file),
              token,
              biomeId,
              message: `Biome ${biomeId} maps to unknown token ${token}.`,
              fixHint: "Verify the token name exists in @gogol/tokens.",
            });
          }
        }
      }
    } catch {
      context.logger.warn(`Could not read biomes directory at ${biomesDir}`);
    }
  }

  // RFC-0203: map BiomeTokenViolation → canonical Diagnostic (rule → ruleId,
  // carry selector/property/token/source into structured data).
  const diagnostics: Diagnostic[] = violations.map((v) => ({
    ruleId: v.rule,
    severity: v.severity,
    message: v.selector
      ? `${v.message} (selector ${v.selector}${v.property ? `, property ${v.property}` : ""})`
      : v.message,
    file: v.file,
    fixHint: v.fixHint,
    data: {
      ...(v.app ? { app: v.app } : {}),
      ...(v.biomeId ? { biomeId: v.biomeId } : {}),
      ...(v.selector ? { selector: v.selector } : {}),
      ...(v.property ? { property: v.property } : {}),
      token: v.token,
      ...(v.source ? { source: v.source } : {}),
    },
  }));

  const result = diagnosticsResult("biome.tokens.validate", diagnostics);
  const counts = result.data!.summary;
  return {
    ...result,
    data: { ...result.data!, appsScanned, biomesScanned, cssFilesScanned, tokenUsesFound },
    summary:
      `${counts.error} error(s), ${counts.warning} warning(s) — ` +
      `${appsScanned} app(s), ${biomesScanned} biome(s), ${cssFilesScanned} CSS file(s), ${tokenUsesFound} token use(s) checked.`,
  };
}
