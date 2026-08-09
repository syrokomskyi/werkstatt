/*
<MODULE_CONTRACT>
<purpose>
  Implements legal.translation.validate — enforces the RFC-0174 binding-language
  policy for legal documents. A page may declare a `translation` block in its
  binding-language frontmatter; this validator checks every such declaration is
  internally consistent so the mandatory language notice, "unofficial translation"
  indicator, and `disabled` → binding-language fallback always behave correctly.
</purpose>
<non-goals>
  <item>Do not weaken the policy — every legal render must keep its notice (RFC-0174).</item>
  <item>Do not validate prose content or translation accuracy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0174: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";

const STATUSES = new Set(["official", "unofficial", "disabled"]);

interface TranslationPolicy {
  binding?: unknown;
  bindingPageId?: unknown;
  bindingDocLabel?: unknown;
  notice?: unknown;
  indicator?: unknown;
  locales?: Record<string, unknown>;
}

interface PageRecord {
  file: string;
  lang: string;
  pageId: string;
  translation?: TranslationPolicy;
}

interface Violation {
  file: string;
  pageId: string;
  rule: string;
  message: string;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    return YAML.parse(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectPageFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectPageFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

export async function runLegalTranslationValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const pagesDir = join(paths.appDirectory, "src", "content", "pages");
  if (!existsSync(pagesDir)) {
    return { exitCode: 0, data: { diagnostics: [`No pages dir at ${pagesDir} — skipping.`] } };
  }

  // Build pageId -> set of languages that have a page file.
  const records: PageRecord[] = [];
  const langsByPageId = new Map<string, Set<string>>();
  for (const file of collectPageFiles(pagesDir)) {
    const rel = relative(pagesDir, file).replace(/\\/g, "/");
    const lang = rel.split("/")[0] ?? "";
    const fm = parseFrontmatter(readFileSync(file, "utf-8"));
    if (!fm) continue;
    const pageId = String(fm.pageId ?? "");
    if (!pageId) continue;
    if (!langsByPageId.has(pageId)) langsByPageId.set(pageId, new Set());
    langsByPageId.get(pageId)!.add(lang);
    records.push({
      file,
      lang,
      pageId,
      translation: fm.translation as TranslationPolicy | undefined,
    });
  }

  const violations: Violation[] = [];
  let policyCount = 0;

  for (const rec of records) {
    const t = rec.translation;
    if (!t || t.binding === undefined) continue;
    policyCount += 1;
    const rels = relative(context.workspaceRoot, rec.file).replace(/\\/g, "/");

    const binding = typeof t.binding === "string" ? t.binding : "";
    if (!binding) {
      violations.push({
        file: rels,
        pageId: rec.pageId,
        rule: "missing-binding-lang",
        message: "translation.binding must be a non-empty language code.",
      });
      continue;
    }

    const langsWithFile = langsByPageId.get(rec.pageId) ?? new Set();
    if (!langsWithFile.has(binding)) {
      violations.push({
        file: rels,
        pageId: rec.pageId,
        rule: "missing-binding-lang",
        message: `binding language "${binding}" has no page file for pageId "${rec.pageId}".`,
      });
    }

    const locales = (t.locales ?? {}) as Record<string, unknown>;
    let hasUnofficial = false;
    for (const [loc, status] of Object.entries(locales)) {
      if (!STATUSES.has(String(status))) {
        violations.push({
          file: rels,
          pageId: rec.pageId,
          rule: "unknown-status",
          message: `locale "${loc}" has status "${String(status)}" — must be official | unofficial | disabled.`,
        });
        continue;
      }
      if (status === "unofficial") hasUnofficial = true;
      if (loc === binding && status === "disabled") {
        violations.push({
          file: rels,
          pageId: rec.pageId,
          rule: "binding-disabled",
          message: `the binding language "${binding}" can never be disabled.`,
        });
      }
      if (status === "disabled" && !langsWithFile.has(binding)) {
        violations.push({
          file: rels,
          pageId: rec.pageId,
          rule: "disabled-without-fallback",
          message: `locale "${loc}" is disabled but the binding-language fallback "${binding}" has no page file.`,
        });
      }
    }

    if (t.notice === false && hasUnofficial) {
      violations.push({
        file: rels,
        pageId: rec.pageId,
        rule: "missing-notice",
        message:
          "translation.notice is false while a locale is 'unofficial' — the mandatory language notice cannot be turned off (RFC-0174).",
      });
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        command: "legal.translation.validate",
        status: "fail",
        policyCount,
        violations: violations.map((v) => ({ ...v })),
        diagnostics: violations.map(
          (v) => `[ERROR] ${v.file} (${v.pageId}) [${v.rule}] ${v.message}`,
        ),
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      command: "legal.translation.validate",
      status: "ok",
      policyCount,
      violations: [],
      diagnostics: [
        policyCount === 0
          ? "No pages declare a translation policy — nothing to validate."
          : `All ${policyCount} legal translation policy declaration(s) valid.`,
      ],
    },
  };
}
