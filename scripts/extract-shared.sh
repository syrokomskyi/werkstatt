#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Step 1: Create werkstatt-shared skeleton ==="

# Create directory structure
mkdir -p packages/werkstatt-shared/src/checks/lib

# Create package.json
cat > packages/werkstatt-shared/package.json << 'PKGJSON'
{
  "name": "@warpgogol/werkstatt-shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Stack-agnostic shared infrastructure extracted from werkstatt-site (RFC-0868).",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./checks": {
      "types": "./src/checks/index.ts",
      "default": "./src/checks/index.ts"
    },
    "./checks/result-helpers": {
      "types": "./src/checks/result-helpers.ts",
      "default": "./src/checks/result-helpers.ts"
    },
    "./checks/suppressions-config": {
      "types": "./src/checks/suppressions-config.ts",
      "default": "./src/checks/suppressions-config.ts"
    },
    "./checks/lib/astro-site-url": {
      "types": "./src/checks/lib/astro-site-url.ts",
      "default": "./src/checks/lib/astro-site-url.ts"
    },
    "./checks/lib/i18n": {
      "types": "./src/checks/lib/i18n.ts",
      "default": "./src/checks/lib/i18n.ts"
    },
    "./ontology": {
      "types": "./src/ontology/index.ts",
      "default": "./src/ontology/index.ts"
    },
    "./ontology/*": {
      "types": "./src/ontology/*",
      "default": "./src/ontology/*"
    },
    "./share": {
      "types": "./src/share/index.ts",
      "default": "./src/share/index.ts"
    },
    "./share/*": {
      "types": "./src/share/*",
      "default": "./src/share/*"
    },
    "./passport": {
      "types": "./src/passport/index.ts",
      "default": "./src/passport/index.ts"
    },
    "./passport/*": {
      "types": "./src/passport/*",
      "default": "./src/passport/*"
    },
    "./integration": {
      "types": "./src/integration/index.ts",
      "default": "./src/integration/index.ts"
    },
    "./integration/*": {
      "types": "./src/integration/*",
      "default": "./src/integration/*"
    },
    "./integration-adapter-supabase-crm": {
      "types": "./src/integration-adapter-supabase-crm/index.ts",
      "default": "./src/integration-adapter-supabase-crm/index.ts"
    },
    "./integration-adapter-supabase-crm/*": {
      "types": "./src/integration-adapter-supabase-crm/*",
      "default": "./src/integration-adapter-supabase-crm/*"
    },
    "./observability": {
      "types": "./src/observability/index.ts",
      "default": "./src/observability/index.ts"
    },
    "./observability/*": {
      "types": "./src/observability/*",
      "default": "./src/observability/*"
    },
    "./surface": {
      "types": "./src/surface/index.ts",
      "default": "./src/surface/index.ts"
    },
    "./surface/*": {
      "types": "./src/surface/*",
      "default": "./src/surface/*"
    }
  },
  "scripts": {
    "build": "pnpm exec tsc -p tsconfig.json --noEmit",
    "build:check": "pnpm exec tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "yaml": "^2.9.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^24.0.0"
  }
}
PKGJSON

# Create tsconfig.json
cat > packages/werkstatt-shared/tsconfig.json << 'TSCONFIG'
{
  "extends": "../../tsconfig/node-lib.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "src/**/*.template.*",
    "src/**/*.test.ts",
    "src/**/tests/**",
    "dist/**",
    "node_modules/**"
  ]
}
TSCONFIG

# Create src/index.ts
cat > packages/werkstatt-shared/src/index.ts << 'INDEX'
/*
<MODULE_CONTRACT>
<purpose>Package barrel for @warpgogol/werkstatt-shared — stack-agnostic shared infrastructure extracted from werkstatt-site (RFC-0868).</purpose>
<non-goals>
  <item>Do not export site-specific validators, Astro components, or stack plugin logic.</item>
  <item>Do not import from @warpgogol/werkstatt-site or any stack plugin.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: initial extraction from werkstatt-site.</item>
</CHANGE_SUMMARY>
*/

export * from "./checks/index.ts";
INDEX

# Create src/checks/index.ts
cat > packages/werkstatt-shared/src/checks/index.ts << 'CHECKS'
/*
<MODULE_CONTRACT>
<purpose>Shared check infrastructure barrel for @warpgogol/werkstatt-shared — exports diagnosticsResult, suppressions, i18n, and astro-site-url helpers (RFC-0868).</purpose>
<non-goals>
  <item>Do not export site-specific validators or pipeline definitions.</item>
  <item>Do not import from @warpgogol/werkstatt-site or any stack plugin.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extracted from werkstatt-site/src/checks as shared infrastructure.</item>
</CHANGE_SUMMARY>
*/

export {
  diagnosticsResult,
  passResult,
  failResult,
  resultFromViolations,
} from "./result-helpers.ts";

export * from "./suppressions-config.ts";

export { readAstroSiteUrl } from "./lib/astro-site-url.ts";
export { readDefaultLanguageCode } from "./lib/i18n.ts";
CHECKS

echo "=== Step 2: Copy shared domains ==="

# Copy domains (excluding files that depend on werkstatt-site)
cp -r packages/werkstatt-site/src/domain/ontology packages/werkstatt-shared/src/
cp -r packages/werkstatt-site/src/domain/integration-adapter-supabase-crm packages/werkstatt-shared/src/
cp -r packages/werkstatt-site/src/domain/observability packages/werkstatt-shared/src/
cp -r packages/werkstatt-site/src/domain/surface packages/werkstatt-shared/src/

# Copy share (excluding astro/ which depends on werkstatt-site/content-source)
mkdir -p packages/werkstatt-shared/src/share
for item in packages/werkstatt-site/src/domain/share/*; do
  name=$(basename "$item")
  if [ "$name" = "astro" ]; then
    continue
  fi
  cp -r "$item" packages/werkstatt-shared/src/share/
done

# Copy passport (excluding verify.ts, data.ts, emit.ts, pipeline.ts which depend on werkstatt-site)
mkdir -p packages/werkstatt-shared/src/passport
for item in packages/werkstatt-site/src/domain/passport/*; do
  name=$(basename "$item")
  if [ "$name" = "verify.ts" ] || [ "$name" = "data.ts" ] || [ "$name" = "emit.ts" ] || [ "$name" = "pipeline.ts" ]; then
    continue
  fi
  cp -r "$item" packages/werkstatt-shared/src/passport/
done

# Copy integration (excluding delivery-handler.ts which depends on werkstatt-site/testing)
mkdir -p packages/werkstatt-shared/src/integration
for item in packages/werkstatt-site/src/domain/integration/*; do
  name=$(basename "$item")
  if [ "$name" = "delivery-handler.ts" ]; then
    continue
  fi
  cp -r "$item" packages/werkstatt-shared/src/integration/
done

# Copy check infrastructure files
cp packages/werkstatt-site/src/checks/result-helpers.ts packages/werkstatt-shared/src/checks/
cp packages/werkstatt-site/src/checks/suppressions-config.ts packages/werkstatt-shared/src/checks/
cp packages/werkstatt-site/src/checks/lib/astro-site-url.ts packages/werkstatt-shared/src/checks/lib/
cp packages/werkstatt-site/src/checks/lib/i18n.ts packages/werkstatt-shared/src/checks/lib/

echo "=== Step 3: Fix i18n.ts dependency ==="

# Fix i18n.ts to inline parseFrontmatter instead of importing from werkstatt-site/content
cat > packages/werkstatt-shared/src/checks/lib/i18n.ts << 'I18N'
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

function parseFrontmatter(source: string): { data: Record<string, unknown> } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {} };
  const data = parseYaml(match[1]) as Record<string, unknown>;
  return { data };
}

export async function readDefaultLanguageCode(contentRoot: string): Promise<string> {
  const systemPath = join(contentRoot, "system.md");
  const raw = await readFile(systemPath, "utf-8");
  const { data } = parseFrontmatter(raw);
  const i18n = (data as Record<string, unknown>).i18n as { default?: unknown } | undefined;
  if (typeof i18n?.default === "string" && i18n.default.trim() !== "") {
    return i18n.default.trim();
  }
  throw new Error("[i18n] src/content/system.md must declare i18n.default.");
}

export function defaultLanguageFromManifest(manifest: { i18n?: unknown }): string {
  const i18n = manifest.i18n as { default?: unknown } | undefined;
  const defaultLanguage = i18n?.default;
  if (typeof defaultLanguage === "string" && defaultLanguage.trim() !== "") {
    return defaultLanguage.trim();
  }
  throw new Error("[i18n] manifest must declare i18n.default.");
}
I18N

echo "=== Step 4: Fix surface-module-context-io.ts ==="

# Fix surface/io/surface-module-context-io.ts to inline loadSystemManifest
cat > packages/werkstatt-shared/src/surface/io/surface-module-context-io.ts << 'SURFACE_IO'
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
SURFACE_IO

echo "=== Step 5: Remove problematic files from werkstatt-shared ==="
# These files have dependencies on werkstatt-site and should stay there
# (they were excluded from copy, but double-check)
rm -f packages/werkstatt-shared/src/share/astro 2>/dev/null || true
rm -f packages/werkstatt-shared/src/passport/verify.ts 2>/dev/null || true
rm -f packages/werkstatt-shared/src/passport/data.ts 2>/dev/null || true
rm -f packages/werkstatt-shared/src/passport/emit.ts 2>/dev/null || true
rm -f packages/werkstatt-shared/src/passport/pipeline.ts 2>/dev/null || true
rm -f packages/werkstatt-shared/src/integration/delivery-handler.ts 2>/dev/null || true

echo "=== DONE ==="
ls packages/werkstatt-shared/src/
