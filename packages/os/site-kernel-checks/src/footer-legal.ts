/*
<MODULE_CONTRACT>
<purpose>
Implements footer.legal.validate — fails any DE/EU-locale app whose
src/content/site/<lang>/labels.md leaves footer.legalIds empty.
Impressum (§ 5 TMG) and Datenschutz (DSGVO) are legally required for
every German-language commercial site; shipping a footer without them
is an unfit handoff (RFC-0095).
</purpose>
<non-goals>
  <item>Do not enforce a specific list of legal pages — the rule is "at least one".</item>
  <item>Do not validate the prose content of the legal pages.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0095: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";

// Locales where Impressum + Datenschutz are legally mandated.
// Conservative: DE-speaking + AT + CH + EU-flag locales.
const LEGAL_REQUIRED_LOCALES = new Set(["de", "de-DE", "de-AT", "de-CH", "at", "ch"]);

interface FooterLegalViolation {
  file: string;
  lang: string;
  reason: string;
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

export async function runFooterLegalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const systemMdPath = join(paths.appDirectory, "src", "content", "system.md");
  if (!existsSync(systemMdPath)) {
    return {
      exitCode: 0,
      data: { diagnostics: [`No system.md at ${systemMdPath} — skipping.`] },
    };
  }
  const systemFm = parseFrontmatter(readFileSync(systemMdPath, "utf-8"));
  const i18n = (systemFm?.i18n ?? {}) as { supported?: Record<string, unknown> };
  const supported = Object.keys(i18n.supported ?? {});

  const legalLangs = supported.filter((l) => LEGAL_REQUIRED_LOCALES.has(l));
  if (legalLangs.length === 0) {
    return {
      exitCode: 0,
      data: {
        diagnostics: [
          `No DE/AT/CH locale in supported languages (${supported.join(", ") || "(none)"}); skipping legal-page check.`,
        ],
      },
    };
  }

  const violations: FooterLegalViolation[] = [];
  for (const lang of legalLangs) {
    const labelsPath = join(paths.appDirectory, "src", "content", "site", lang, "labels.md");
    if (!existsSync(labelsPath)) {
      violations.push({
        file: labelsPath,
        lang,
        reason: `expected site/${lang}/labels.md but it does not exist; DE-locale apps need footer labels.`,
      });
      continue;
    }
    const fm = parseFrontmatter(readFileSync(labelsPath, "utf-8"));
    const footer = (fm?.footer ?? {}) as { legalIds?: unknown[] };
    const legalIds = Array.isArray(footer.legalIds) ? footer.legalIds : [];
    if (legalIds.length === 0) {
      violations.push({
        file: labelsPath,
        lang,
        reason:
          `footer.legalIds is empty for locale "${lang}". DE/AT/CH commercial sites must link ` +
          `Impressum (§ 5 TMG) and Datenschutz (DSGVO) from the footer. Author the pages under ` +
          `src/content/pages/${lang}/ (impressum.md, datenschutz.md), add nav targets with ` +
          `group: legal in navigation/${lang}/navigation.md, and list their ids here.`,
      });
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        violations: violations.map(
          (v) =>
            `[ERROR] ${relative(context.workspaceRoot, v.file).replace(/\\/g, "/")} — ${v.reason}`,
        ),
        total: violations.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [`Footer legal links present for locale(s): ${legalLangs.join(", ")}.`],
    },
  };
}
