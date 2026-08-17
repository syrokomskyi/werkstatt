/*
<MODULE_CONTRACT>
<purpose>
  RFC-0473: I/O helper for loading Programmatic Surface module contexts from a Sternsystem's
  system.md. Extracted from site-kernel-checks so bordbuch.generate in site-kernel-handoff
  can read PSEO module context without depending on site-kernel-checks.
</purpose>
<non-goals>
  <item>Do not mutate system.md.</item>
  <item>Do not make LLM calls or interpret Blueprint axis policy.</item>
  <item>Do not define validation diagnostics — that lives in site-kernel-checks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0473: extract loadSurfaceModuleContexts from site-kernel-checks for cross-package reuse.</item>
  <item>RFC-0868: inline loadSystemManifest to break dependency on werkstatt-site/content.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, access } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { normalizeSurfaceModules, type SurfaceModules } from "../index.ts";

async function loadSystemManifestRaw(contentDirectory: string): Promise<Record<string, unknown>> {
  const systemMdPath = join(contentDirectory, "system.md");
  await access(systemMdPath);
  const content = await readFile(systemMdPath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return {};
  return parseYaml(match[1]) as Record<string, unknown>;
}

export interface LoadedModuleContexts {
  modules: SurfaceModules;
  declaredBlueprints: string[];
  supportedLocales: string[];
  defaultLocale?: string;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function loadSurfaceModuleContexts(appDir: string): Promise<LoadedModuleContexts> {
  const record = await loadSystemManifestRaw(join(appDir, "src", "content"));
  const i18n = record.i18n as { default?: string; supported?: Record<string, unknown> } | undefined;
  const surface = record.surface as { blueprints?: unknown; modules?: unknown } | undefined;
  const supportedLocales = i18n?.supported
    ? Object.keys(i18n.supported)
    : i18n?.default
      ? [i18n.default]
      : [];
  return {
    modules: normalizeSurfaceModules(surface?.modules ?? {}),
    declaredBlueprints: asStringArray(surface?.blueprints),
    supportedLocales,
    defaultLocale: i18n?.default,
  };
}
