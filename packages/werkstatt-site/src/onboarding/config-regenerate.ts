/*
<MODULE_CONTRACT>
<purpose>
Implements RFC-0078 config.regenerate command.
Re-applies root config templates from site-kernel-onboarding to an existing app.
Uses RFC-0081 GENERATED marker protocol to skip customized files.
</purpose>
<keywords>config, regenerate, onboarding, rfc-0078, rfc-0081</keywords>
<responsibilities>
  <item>Read app system.md to resolve substitution tokens.</item>
  <item>Re-apply root config templates idempotently using GENERATED marker protocol.</item>
  <item>Preserve custom additions when --force is not passed.</item>
  <item>Support JSON files via '_' field marker per RFC-0081.</item>
</responsibilities>
<non-goals>
  <item>Do not touch src/content/ or customer-editable files.</item>
  <item>Do not manage marker-less JSON configs.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="runConfigRegenerate">Kernel command entry for config.regenerate.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0078: Add config.regenerate command for root config files.</item>
  <item>RFC-0081: Use GENERATED marker protocol instead of content comparison. Support JSON via '_' field.</item>
  <item>RFC-0571: Use requireAstroSitePaths for mission-aware path resolution.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import matter from "gray-matter";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import { readTemplate, readRuntimeTemplate, applyTokens } from "./templates.ts";

async function readFileIfExists(target: string): Promise<string | null> {
  try {
    return readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

function hasJsonGeneratedMarker(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return (
      typeof parsed.generatedMarker === "string" &&
      parsed.generatedMarker ===
        "GENERATED. Do not change this line unless the file contains project specific changes."
    );
  } catch {
    return false;
  }
}

function loadSystemTokens(appDir: string): Record<string, string> | null {
  const systemPath = join(appDir, "src", "content", "system.md");
  try {
    const raw = readFileSync(systemPath, "utf8");
    const parsed = matter(raw);
    const identity = (parsed.data["identity"] as Record<string, unknown>) ?? {};
    const i18n = (parsed.data["i18n"] as Record<string, unknown>) ?? {};
    return {
      CLIENT_ID: String(parsed.data["app"] ?? identity["id"] ?? ""),
      DOMAIN: String(identity["domain"] ?? ""),
      BIOME_ID: String(identity["biome"] ?? ""),
      CONSTELLATION_ID: String(identity["constellation"] ?? ""),
      DEFAULT_LANG: String(i18n["default"] ?? "de"),
      SYSTEM_STAR: String(identity["systemStar"] ?? ""),
      TAGLINE: String(identity["tagline"] ?? ""),
    };
  } catch {
    return null;
  }
}

interface ConfigRegenerateData {
  command: "config.regenerate";
  app: string;
  generated: string[];
  skipped: string[];
}

export async function runConfigRegenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ConfigRegenerateData>> {
  const app = typeof input.flags.site === "string" ? input.flags.site : context.site?.name;
  const force = input.flags.force === true;

  if (!app) {
    return {
      data: { command: "config.regenerate", app: "unknown", generated: [], skipped: [] },
      exitCode: 1,
      summary: "config.regenerate: app not resolved (use --site <name>)",
    };
  }

  const { appDirectory: appDir } = requireAstroSitePaths(context);

  const tokens = loadSystemTokens(appDir);
  if (!tokens) {
    return {
      data: { command: "config.regenerate", app, generated: [], skipped: [] },
      exitCode: 1,
      summary: "config.regenerate: unable to read " + appDir + "/src/content/system.md",
    };
  }

  const generated: string[] = [];
  const skipped: string[] = [];

  const files: Array<{ path: string; content: string; isJson?: boolean }> = [
    {
      path: join(appDir, "package.json"),
      content: applyTokens(readTemplate("package.template.json"), tokens),
      isJson: true,
    },
    {
      path: join(appDir, "astro.config.mjs"),
      content: applyTokens(readRuntimeTemplate("astro.config.template.mjs"), {
        ...tokens,
        SITE_LINE: tokens.DOMAIN
          ? `  // [ALT-DEPLOY] PUBLIC_SITE_URL overrides the canonical domain for alt builds.\n  site: process.env.PUBLIC_SITE_URL || "https://${tokens.DOMAIN}",`
          : "  // site: omitted (no domain configured)",
      }),
    },
    {
      path: join(appDir, "wrangler.jsonc"),
      content: applyTokens(readTemplate("wrangler.template.jsonc"), tokens),
    },
    {
      path: join(appDir, ".gitignore"),
      content: applyTokens(readRuntimeTemplate("gitignore.template"), tokens),
    },
    {
      path: join(appDir, "postcss.config.cjs"),
      content: readRuntimeTemplate("postcss.config.template.cjs"),
    },
  ];

  for (const file of files) {
    if (!force) {
      const existing = await readFileIfExists(file.path);
      if (existing !== null) {
        const hasMarker = file.isJson
          ? hasJsonGeneratedMarker(existing)
          : hasGeneratedMarker(existing);
        if (!hasMarker) {
          skipped.push(file.path.replace(context.workspaceRoot + "\\", ""));
          continue;
        }
      }
    }
    await mkdir(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, "utf8");
    generated.push(file.path.replace(context.workspaceRoot + "\\", ""));
  }

  return {
    data: { command: "config.regenerate", app, generated, skipped },
    exitCode: 0,
    summary:
      skipped.length > 0
        ? "config.regenerate: " +
          generated.length +
          " file(s) written, " +
          skipped.length +
          " skipped (use --force to overwrite)"
        : "config.regenerate: " + generated.length + " file(s) written",
  };
}
