/*
<MODULE_CONTRACT>
<purpose>
Implements RFC-0137 config.template.sync command.
Propagates dependency versions and Vite config blocks from a reference app
into the canonical onboarding templates so that config.regenerate and
onboarding.scaffold always emit current versions.
</purpose>
<non-goals>
  <item>Do not diff or merge; overwrite blindly per RFC-0137.</item>
  <item>Do not sync app-specific custom fields unrelated to the template.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0137: Add config.template.sync command.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { TEMPLATES_DIR, RUNTIME_TEMPLATES_DIR } from "./templates.ts";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

interface RegistryMirror {
  path: string;
  storageType: string;
}

interface RegistrySystem {
  id: string;
  mirrors?: RegistryMirror[];
}

interface RegistryFile {
  systems?: RegistrySystem[];
}

async function resolveAppDir(workspaceRoot: string, app: string): Promise<string | null> {
  const directPath = join(workspaceRoot, "systems", app);
  if (await pathExists(directPath)) return directPath;

  try {
    const registryRaw = readFileSync(join(workspaceRoot, "systems", "registry.yaml"), "utf8");
    const registry = parseYaml(registryRaw) as RegistryFile;
    const entry = registry.systems?.find((s) => s.id === app);
    const cacheMirrorPath = entry?.mirrors?.[0]?.path;
    if (!cacheMirrorPath) return null;
    const resolved = resolve(workspaceRoot, cacheMirrorPath);
    if (await pathExists(resolved)) return resolved;
  } catch {
    // registry unreadable or entry not found
  }

  return null;
}

function readJsonIfExists(target: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(target, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readTextIfExists(target: string): string | null {
  try {
    return readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

/**
 * Extract a top-level object literal block from JS source by brace counting.
 * Returns the raw text including the key, e.g. "optimizeDeps: { ... }".
 */
function extractObjectBlock(source: string, key: string): string | null {
  const pattern = new RegExp(`\\b${key}\\s*:`);
  const match = pattern.exec(source);
  if (!match) return null;

  const startIdx = match.index;
  let idx = match.index + match[0].length;

  // Skip whitespace until opening brace
  while (idx < source.length && /\s/.test(source[idx])) idx++;
  if (source[idx] !== "{") return null;

  let braceDepth = 1;
  idx++; // skip opening {
  while (idx < source.length && braceDepth > 0) {
    if (source[idx] === "{") braceDepth++;
    else if (source[idx] === "}") braceDepth--;
    else if (source[idx] === '"' || source[idx] === "'") {
      const quote = source[idx];
      idx++;
      while (idx < source.length && source[idx] !== quote) {
        if (source[idx] === "\\") idx++;
        idx++;
      }
    }
    idx++;
  }

  return source.slice(startIdx, idx);
}

interface ConfigTemplateSyncData {
  command: "config.template.sync";
  app: string;
  synced: Array<{
    templateFile: string;
    sourceFile: string;
    fieldsUpdated: string[];
  }>;
  skipped: Array<{
    templateFile: string;
    reason: string;
  }>;
}

export async function runConfigTemplateSync(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ConfigTemplateSyncData>> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  const filesFlag = (input.flags.files as string | undefined) ?? "package.json,astro.config.mjs";
  const dryRun = input.flags.dryRun === true;
  const filesToSync = filesFlag.split(",").map((f) => f.trim());

  if (!app) {
    return {
      data: { command: "config.template.sync", app: "unknown", synced: [], skipped: [] },
      exitCode: 1,
      summary: "config.template.sync: app not resolved (use --site <name>)",
    };
  }

  const appDir = await resolveAppDir(context.workspaceRoot, app);
  if (!appDir) {
    return {
      data: { command: "config.template.sync", app, synced: [], skipped: [] },
      exitCode: 1,
      summary: `config.template.sync: could not resolve working tree for '${app}' (checked systems/${app} and registry mirrors[0])`,
    };
  }

  const synced: ConfigTemplateSyncData["synced"] = [];
  const skipped: ConfigTemplateSyncData["skipped"] = [];

  // --- package.json -> package.template.json ---
  if (filesToSync.includes("package.json")) {
    const appPkg = readJsonIfExists(join(appDir, "package.json"));
    const templatePath = join(TEMPLATES_DIR, "package.template.json");
    const templatePkg = readJsonIfExists(templatePath);

    if (!appPkg) {
      skipped.push({
        templateFile: "package.template.json",
        reason: `systems/${app}/package.json missing`,
      });
    } else if (!templatePkg) {
      skipped.push({
        templateFile: "package.template.json",
        reason: "package.template.json missing",
      });
    } else {
      const fieldsUpdated: string[] = [];
      if (appPkg.dependencies && typeof appPkg.dependencies === "object") {
        templatePkg.dependencies = appPkg.dependencies;
        fieldsUpdated.push("dependencies");
      }
      if (appPkg.devDependencies && typeof appPkg.devDependencies === "object") {
        templatePkg.devDependencies = appPkg.devDependencies;
        fieldsUpdated.push("devDependencies");
      }
      if (!dryRun) {
        writeFileSync(templatePath, JSON.stringify(templatePkg, null, 2) + "\n", "utf8");
      }
      synced.push({
        templateFile: "package.template.json",
        sourceFile: `systems/${app}/package.json`,
        fieldsUpdated,
      });
    }
  }

  // --- astro.config.mjs -> astro.config.template.mjs ---
  if (filesToSync.includes("astro.config.mjs")) {
    const appConfig = readTextIfExists(join(appDir, "astro.config.mjs"));
    const templatePath = join(RUNTIME_TEMPLATES_DIR, "astro.config.template.mjs");
    const templateConfig = readTextIfExists(templatePath);

    if (!appConfig) {
      skipped.push({
        templateFile: "astro.config.template.mjs",
        reason: `systems/${app}/astro.config.mjs missing`,
      });
    } else if (!templateConfig) {
      skipped.push({
        templateFile: "astro.config.template.mjs",
        reason: "astro.config.template.mjs missing",
      });
    } else {
      const fieldsUpdated: string[] = [];
      let updatedTemplate = templateConfig;

      const optimizeDepsBlock = extractObjectBlock(appConfig, "optimizeDeps");
      if (optimizeDepsBlock) {
        const existing = extractObjectBlock(updatedTemplate, "optimizeDeps");
        if (existing) {
          updatedTemplate = updatedTemplate.replace(existing, optimizeDepsBlock);
          fieldsUpdated.push("optimizeDeps");
        }
      }

      const ssrBlock = extractObjectBlock(appConfig, "ssr");
      if (ssrBlock) {
        const existing = extractObjectBlock(updatedTemplate, "ssr");
        if (existing) {
          updatedTemplate = updatedTemplate.replace(existing, ssrBlock);
          fieldsUpdated.push("ssr");
        }
      }

      if (!dryRun) {
        writeFileSync(templatePath, updatedTemplate, "utf8");
      }
      synced.push({
        templateFile: "astro.config.template.mjs",
        sourceFile: `systems/${app}/astro.config.mjs`,
        fieldsUpdated,
      });
    }
  }

  const summary = dryRun
    ? `config.template.sync (dry-run): ${synced.length} file(s) would be updated, ${skipped.length} skipped`
    : `config.template.sync: ${synced.length} file(s) updated, ${skipped.length} skipped`;

  return {
    data: { command: "config.template.sync", app, synced, skipped },
    exitCode: 0,
    summary,
  };
}
