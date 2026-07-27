/*
<MODULE_CONTRACT>
<purpose>RFC-0489 open-source.validate: validates generated open-source registry JSON, SBOM, and downloadable artifacts for consistency and completeness.</purpose>
<non-goals>
  <item>Do not generate or regenerate open-source artifacts — that is open-source.generate's job.</item>
  <item>Do not validate license normalization or classification logic — that is tested in site-kernel-codegen.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0489: initial implementation of open-source.validate command.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadI18nConfigSync, loadSystemManifestSync } from "@gogol/site-kernel-content";
import { diagnosticsResult } from "./result-helpers.ts";
import { fileExists } from "./lib/file-exists.ts";

interface RegistryComponent {
  name: string;
  version: string;
  license: string;
  scope: string;
  relationship: string;
}

interface RegistrySummary {
  componentsTotal: number;
  directDependencies: number;
  transitiveDependencies: number;
  licensesTotal: number;
  componentsWithNotice: number;
}

interface RegistryData {
  summary: RegistrySummary;
  components: RegistryComponent[];
}

interface SbomComponent {
  name: string;
  version: string;
}

interface SbomMetadata {
  component: {
    components: SbomComponent[];
  };
  components?: SbomComponent[];
}

export async function runOpenSourceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{
    command: string;
    status: string;
    diagnostics: Diagnostic[];
    summary: { error: number; warning: number; info: number };
  }>
> {
  const diagnostics: Diagnostic[] = [];
  const command = "open-source.validate";
  const paths = requireAstroSitePaths(context);

  const system = loadSystemManifestSync(paths.contentDirectory).manifest;
  const hasOpenSourcePage =
    Array.isArray(system.pages) && system.pages.some((page) => page.pageId === "openSource");

  if (!hasOpenSourcePage) {
    return diagnosticsResult(command, []);
  }

  const i18n = loadI18nConfigSync(paths.appDirectory);
  if (!i18n) {
    return diagnosticsResult(command, [
      {
        ruleId: "OS-08",
        severity: "error",
        message: "Failed to load i18n configuration from system.md",
      },
    ]);
  }
  const langs = Object.keys(i18n.config.supported);
  const publicDir = paths.publicDirectory;

  for (const lang of langs) {
    const registryPath = join(paths.contentDirectory, "data", lang, "open-source-registry.json");
    const registryExists = await fileExists(registryPath);
    if (!registryExists) {
      diagnostics.push({
        ruleId: "OS-01",
        severity: "error",
        message: `Missing registry data file: src/content/data/${lang}/open-source-registry.json`,
      });
      continue;
    }

    let registry: RegistryData;
    try {
      const raw = await readFile(registryPath, "utf8");
      const stripped = raw.replace(/^\/\/[^\n]*\n/gm, "");
      registry = JSON.parse(stripped) as RegistryData;
    } catch {
      diagnostics.push({
        ruleId: "OS-02",
        severity: "error",
        message: `Failed to parse registry JSON: src/content/data/${lang}/open-source-registry.json`,
      });
      continue;
    }

    // OS-03: deduplication check — no duplicate name@version in components
    const seen = new Map<string, number>();
    for (const component of registry.components) {
      const key = `${component.name}@${component.version}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) {
      if (count > 1) {
        diagnostics.push({
          ruleId: "OS-03",
          severity: "error",
          message: `Duplicate component in ${lang} registry: ${key} appears ${count} times`,
        });
      }
    }

    // OS-04: public component count matches summary
    const publicComponents = registry.components.filter(
      (c) => c.scope === "runtime" || c.scope === "browser-bundle" || c.scope === "worker-runtime",
    );
    if (publicComponents.length !== registry.summary.componentsTotal) {
      diagnostics.push({
        ruleId: "OS-04",
        severity: "error",
        message: `Summary componentsTotal (${registry.summary.componentsTotal}) does not match public component count (${publicComponents.length}) in ${lang}`,
      });
    }

    // OS-05: direct + transitive counts match
    const directCount = publicComponents.filter((c) => c.relationship === "direct").length;
    const transitiveCount = publicComponents.filter((c) => c.relationship === "transitive").length;
    if (directCount !== registry.summary.directDependencies) {
      diagnostics.push({
        ruleId: "OS-05",
        severity: "error",
        message: `Summary directDependencies (${registry.summary.directDependencies}) does not match direct count (${directCount}) in ${lang}`,
      });
    }
    if (transitiveCount !== registry.summary.transitiveDependencies) {
      diagnostics.push({
        ruleId: "OS-05",
        severity: "error",
        message: `Summary transitiveDependencies (${registry.summary.transitiveDependencies}) does not match transitive count (${transitiveCount}) in ${lang}`,
      });
    }
  }

  // OS-06: download artifacts exist
  const artifacts = [
    join(publicDir, "open-source", "THIRD_PARTY_NOTICES.txt"),
    join(publicDir, "open-source", "THIRD_PARTY_LICENSES.txt"),
    join(publicDir, "open-source", "sbom.cdx.json"),
  ];
  for (const artifactPath of artifacts) {
    const exists = await fileExists(artifactPath);
    if (!exists) {
      diagnostics.push({
        ruleId: "OS-06",
        severity: "error",
        message: `Missing download artifact: ${artifactPath.replace(context.workspaceRoot + "/", "")}`,
      });
    }
  }

  // OS-07: SBOM component count matches registry public count (only if both exist)
  const sbomPath = join(publicDir, "open-source", "sbom.cdx.json");
  const sbomExists = await fileExists(sbomPath);
  if (sbomExists) {
    try {
      const sbomRaw = await readFile(sbomPath, "utf8");
      const sbomStripped = sbomRaw.replace(/^\/\/[^\n]*\n/gm, "");
      const sbom = JSON.parse(sbomStripped) as SbomMetadata;
      const sbomComponentCount = sbom.components?.length ?? sbom.component?.components?.length ?? 0;

      // Check against the default language registry
      const defaultLang = i18n.defaultLanguageCode;
      const defaultRegistryPath = join(
        paths.contentDirectory,
        "data",
        defaultLang,
        "open-source-registry.json",
      );
      const defaultRegistryExists = await fileExists(defaultRegistryPath);
      if (defaultRegistryExists) {
        const raw = await readFile(defaultRegistryPath, "utf8");
        const stripped = raw.replace(/^\/\/[^\n]*\n/gm, "");
        const registry = JSON.parse(stripped) as RegistryData;
        if (registry.summary.componentsTotal !== sbomComponentCount) {
          diagnostics.push({
            ruleId: "OS-07",
            severity: "error",
            message: `SBOM component count (${sbomComponentCount}) does not match registry componentsTotal (${registry.summary.componentsTotal})`,
          });
        }
      }
    } catch {
      diagnostics.push({
        ruleId: "OS-02",
        severity: "error",
        message: "Failed to parse SBOM JSON: public/open-source/sbom.cdx.json",
      });
    }
  }

  return diagnosticsResult(command, diagnostics);
}
