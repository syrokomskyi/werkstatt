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
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { normalizeSurfaceModules, type SurfaceModules } from "../index.ts";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";

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
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const record = manifest as unknown as {
    i18n?: { default?: string; supported?: Record<string, unknown> };
    surface?: { blueprints?: unknown; modules?: unknown };
  };
  const supportedLocales = record.i18n?.supported
    ? Object.keys(record.i18n.supported)
    : record.i18n?.default
      ? [record.i18n.default]
      : [];
  return {
    modules: normalizeSurfaceModules(record.surface?.modules ?? {}),
    declaredBlueprints: asStringArray(record.surface?.blueprints),
    supportedLocales,
    defaultLocale: record.i18n?.default,
  };
}
