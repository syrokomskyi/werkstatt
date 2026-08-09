/*
<MODULE_CONTRACT>
<purpose>
Implements b2b.model.validate (RFC-0487) — when businessModel: b2b-only is declared
in system.md, checks that no B2C-specific page IDs, route slugs, navigation labels,
or consumer-law prose references (§ 312g, § 312j, Verbraucher-Widerrufsrecht) exist.
No-op when businessModel is absent or not b2b-only.
</purpose>
<non-goals>
  <item>Do not validate AGB prose content — that is a separate expert-file session.</item>
  <item>Do not validate Impressum/Datenschutz prose — those are separate expert-file sessions.</item>
  <item>Do not check for "Widerruf" in inline prose — only navigation labels and page IDs are checked.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0487: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";

const B2C_PAGE_IDS = new Set(["widerruf", "musterWiderruf"]);
const B2C_ROUTE_SLUGS = new Set(["widerruf", "widerruf-formular", "vidmova", "forma-vidmovy"]);
const PROSE_PATTERNS: Array<{ rule: string; pattern: RegExp; message: string }> = [
  {
    rule: "B2B-PROSE-01",
    pattern: /§\s*312[gj]\s*BGB/i,
    message: "Reference to § 312g/312j BGB (consumer withdrawal law) found in B2B-only site",
  },
  {
    rule: "B2B-PROSE-02",
    pattern: /Verbraucher-Widerrufsrecht/i,
    message: "Reference to Verbraucher-Widerrufsrecht found in B2B-only site",
  },
];

interface B2bViolation {
  rule: string;
  file: string;
  message: string;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try {
    return YAML.parse(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function runB2bModelValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const systemMdPath = join(paths.appDirectory, "src", "content", "system.md");
  if (!existsSync(systemMdPath)) {
    return {
      exitCode: 0,
      data: { diagnostics: ["No system.md found — skipping b2b.model.validate."] },
    };
  }

  const systemFm = parseFrontmatter(readFileSync(systemMdPath, "utf-8"));
  const businessModel = systemFm?.businessModel;
  if (businessModel !== "b2b-only") {
    return {
      exitCode: 0,
      data: {
        diagnostics: [
          `businessModel is ${businessModel ?? "not declared"} — b2b.model.validate is a no-op.`,
        ],
      },
    };
  }

  const violations: B2bViolation[] = [];
  const pages = (systemFm?.pages ?? []) as Array<{
    pageId?: string;
    routes?: Record<string, string>;
    route?: string;
  }>;
  const retiredRoutes = (systemFm?.retiredRoutes ?? []) as Array<{
    slug: string;
    status: number;
  }>;
  const retiredSlugs = new Set(retiredRoutes.map((r) => r.slug));

  // B2B-PAGE-01: no B2C page IDs in pages[]
  for (const page of pages) {
    if (page.pageId && B2C_PAGE_IDS.has(page.pageId)) {
      violations.push({
        rule: "B2B-PAGE-01",
        file: systemMdPath,
        message: `pageId '${page.pageId}' is a B2C legal page but businessModel is b2b-only`,
      });
    }
  }

  // B2B-ROUTE-01: no B2C route slugs in pages[] (retiredRoutes is the escape hatch)
  for (const page of pages) {
    const routeValues = page.routes ? Object.values(page.routes) : page.route ? [page.route] : [];
    for (const route of routeValues) {
      const slug = route.replace(/^\/+|\/+$/g, "");
      if (B2C_ROUTE_SLUGS.has(slug) && !retiredSlugs.has(slug)) {
        violations.push({
          rule: "B2B-ROUTE-01",
          file: systemMdPath,
          message: `route slug '${slug}' is a B2C widerruf route but businessModel is b2b-only`,
        });
      }
    }
  }

  // B2B-CONFLICT-01: no retiredRoutes slug also present as active route in pages[]
  const activeSlugs = new Set<string>();
  for (const page of pages) {
    const routeValues = page.routes ? Object.values(page.routes) : page.route ? [page.route] : [];
    for (const route of routeValues) {
      activeSlugs.add(route.replace(/^\/+|\/+$/g, ""));
    }
  }
  for (const retired of retiredRoutes) {
    if (activeSlugs.has(retired.slug)) {
      violations.push({
        rule: "B2B-CONFLICT-01",
        file: systemMdPath,
        message: `retiredRoutes slug '${retired.slug}' is also an active route in pages[] — a route cannot be both active and retired`,
      });
    }
  }

  // B2B-LABEL-01: no navigation entries with semanticTarget.pageId: widerruf or musterWiderruf
  const i18n = (systemFm?.i18n ?? {}) as { supported?: Record<string, unknown> };
  const locales = Object.keys(i18n.supported ?? {});
  for (const lang of locales) {
    const navPath = join(paths.appDirectory, "src", "content", "navigation", lang, "navigation.md");
    if (!existsSync(navPath)) continue;
    const navFm = parseFrontmatter(readFileSync(navPath, "utf-8"));
    const navEntries = (navFm?.navigation ?? []) as unknown[];
    for (const entry of navEntries) {
      const target = (entry as { semanticTarget?: { pageId?: string } })?.semanticTarget;
      if (target?.pageId && B2C_PAGE_IDS.has(target.pageId)) {
        violations.push({
          rule: "B2B-LABEL-01",
          file: navPath,
          message: `navigation entry with semanticTarget.pageId '${target.pageId}' links to a B2C legal page but businessModel is b2b-only`,
        });
      }
    }
  }

  // B2B-PROSE-01/02: no consumer-law references in prose and page files
  const contentDir = join(paths.appDirectory, "src", "content");
  const proseDirs = [join(contentDir, "prose"), join(contentDir, "pages")];
  for (const dir of proseDirs) {
    for (const filePath of collectMarkdownFiles(dir)) {
      const content = readFileSync(filePath, "utf-8");
      for (const { rule, pattern, message } of PROSE_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({ rule, file: filePath, message });
        }
      }
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        command: "b2b.model.validate",
        status: "fail",
        businessModel: "b2b-only",
        violations: violations.map((v) => ({
          rule: v.rule,
          file: relative(context.workspaceRoot, v.file).replace(/\\/g, "/"),
          message: v.message,
        })),
        count: violations.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      command: "b2b.model.validate",
      status: "pass",
      businessModel: "b2b-only",
      violations: [],
      count: 0,
    },
  };
}
