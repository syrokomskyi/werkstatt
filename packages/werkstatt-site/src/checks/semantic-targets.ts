/*
<MODULE_CONTRACT>
<purpose>
RFC-0250 app validator for semantic page targets. It turns missing route/pageId
runtime warnings into canonical diagnostics before Astro render/build logs.
</purpose>
<non-goals>
  <item>Do not validate external URLs or anchors.</item>
  <item>Do not replace existing content-specific validators; this is the shared route-target net.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0250: add static app diagnostics for internal semantic targets.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import { diagnosticsResult } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

interface RouteEntry {
  pageId: string;
  routes: Record<string, string>;
  locales?: string[];
}

interface TargetReference {
  file: string;
  pageId: string;
  propPath: string;
  source: "content" | "system" | "generated-surface" | "navigation";
  lang?: string;
  line?: number;
}

const TARGET_KEY_RE = /(^|\.)(pageId|ctaTarget|primaryCtaTarget|secondaryCtaTarget|targetPageId)$/;

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  try {
    const parsed = yamlParse(raw.slice(3, end));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function collectMarkdown(dir: string): Promise<string[]> {
  return collectFiles(dir, { extensions: [".md"], ignore: (name) => name === "AGENTS.md" });
}

function lineFor(raw: string, value: string): number | undefined {
  const lines = raw.split(/\r?\n/);
  const quoted = [`"${value}"`, `'${value}'`, `: ${value}`];
  const index = lines.findIndex((line) => quoted.some((candidate) => line.includes(candidate)));
  return index >= 0 ? index + 1 : undefined;
}

function langFromRel(file: string): string | undefined {
  const match = file.replace(/\\/g, "/").match(/^src\/content\/[^/]+\/([^/]+)\//);
  return match?.[1];
}

function isPageIdTarget(value: string): boolean {
  if (value.startsWith("#") || value.startsWith("http://") || value.startsWith("https://"))
    return false;
  if (value.startsWith("/") || value.startsWith("mailto:") || value.startsWith("tel:"))
    return false;
  return true;
}

function collectTargetRefs(
  node: unknown,
  refs: TargetReference[],
  base: Omit<TargetReference, "pageId" | "propPath">,
  path: string,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectTargetRefs(item, refs, base, `${path}[${index}]`));
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const propPath = path ? `${path}.${key}` : key;
    if (
      typeof value === "string" &&
      TARGET_KEY_RE.test(propPath) &&
      value.trim() !== "" &&
      isPageIdTarget(value)
    ) {
      refs.push({ ...base, pageId: value, propPath });
    }
    collectTargetRefs(value, refs, base, propPath);
  }
}

function routeDiagnostics(routes: Map<string, RouteEntry>, refs: TargetReference[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const ref of refs) {
    const entry = routes.get(ref.pageId);
    if (!entry) {
      diagnostics.push({
        ruleId: ref.source === "generated-surface" ? "SEM-TARGET-04" : "SEM-TARGET-01",
        severity: "error",
        file: ref.file,
        line: ref.line,
        message: `Semantic target pageId "${ref.pageId}" does not exist in src/content/system.md pages[].`,
        fixHint: "Add the pageId to system.md pages[] or update the authored semantic target.",
        data: { pageId: ref.pageId, propPath: ref.propPath, source: ref.source },
      });
      continue;
    }
    if (
      ref.lang &&
      !Object.prototype.hasOwnProperty.call(entry.routes, ref.lang) &&
      !(entry.locales && !entry.locales.includes(ref.lang))
    ) {
      diagnostics.push({
        ruleId: "SEM-TARGET-03",
        severity: "error",
        file: ref.file,
        line: ref.line,
        message: `Semantic target pageId "${ref.pageId}" has no route for language "${ref.lang}".`,
        fixHint: `Add routes.${ref.lang} for "${ref.pageId}" in system.md or remove the localized target.`,
        data: { pageId: ref.pageId, lang: ref.lang, propPath: ref.propPath },
      });
    }
  }
  return diagnostics;
}

export async function runSemanticTargetsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const command = "semantic.targets.validate";
  const paths = requireAstroSitePaths(context);
  const contentRoot = join(paths.appDirectory, "src", "content");
  const systemPath = join(contentRoot, "system.md");
  const systemRaw = await readFile(systemPath, "utf-8").catch(() => "");
  const system = parseFrontmatter(systemRaw);
  const pages = Array.isArray(system?.pages) ? system.pages : [];
  const routes = new Map<string, RouteEntry>();
  const refs: TargetReference[] = [];

  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const record = page as Record<string, unknown>;
    if (typeof record.pageId !== "string") continue;
    const routeMap = record.routes && typeof record.routes === "object" ? record.routes : {};
    routes.set(record.pageId, {
      pageId: record.pageId,
      routes: Object.fromEntries(
        Object.entries(routeMap as Record<string, unknown>).filter(
          ([, value]) => typeof value === "string",
        ),
      ) as Record<string, string>,
      ...(Array.isArray(record.locales) ? { locales: record.locales.map(String) } : {}),
    });
  }

  collectTargetRefs(
    system,
    refs,
    { file: "src/content/system.md", source: "system", line: undefined },
    "",
  );

  for (const domain of ["pages", "navigation", "site", "business"]) {
    for (const file of await collectMarkdown(join(contentRoot, domain))) {
      const raw = await readFile(file, "utf-8").catch(() => "");
      const fm = parseFrontmatter(raw);
      if (!fm) continue;
      const rel = file.slice(paths.appDirectory.length + 1).replace(/\\/g, "/");
      const lang = langFromRel(rel);
      const before = refs.length;
      collectTargetRefs(
        fm,
        refs,
        {
          file: rel,
          source: domain === "navigation" ? "navigation" : "content",
          lang,
        },
        "",
      );
      for (const ref of refs.slice(before)) ref.line = lineFor(raw, ref.pageId);
    }
  }

  const surfacePath = join(paths.appDirectory, "src", "surface.generated.yaml");
  if (existsSync(surfacePath)) {
    const surfaceRaw = await readFile(surfacePath, "utf-8").catch(() => "");
    try {
      const surface = yamlParse(surfaceRaw) as unknown;
      const entries = Array.isArray((surface as { entries?: unknown }).entries)
        ? (surface as { entries: unknown[] }).entries
        : Array.isArray(surface)
          ? (surface as unknown[])
          : [];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        if (
          typeof record.pageId === "string" &&
          record.routes &&
          typeof record.routes === "object"
        ) {
          routes.set(record.pageId, {
            pageId: record.pageId,
            routes: Object.fromEntries(
              Object.entries(record.routes as Record<string, unknown>).filter(
                ([, value]) => typeof value === "string",
              ),
            ) as Record<string, string>,
          });
        }
      }
      collectTargetRefs(
        surface,
        refs,
        { file: "src/surface.generated.yaml", source: "generated-surface" },
        "",
      );
    } catch {
      // surface.validate owns JSON syntax diagnostics.
    }
  }

  return diagnosticsResult(command, routeDiagnostics(routes, refs));
}
