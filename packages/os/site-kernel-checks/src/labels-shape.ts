/*
<MODULE_CONTRACT>
<purpose>
Implements labels.shape.hint — soft warnings on shapes that compile fine
but degrade the rendered UI, plus fail-fast checks for shell navigation
drift across localized site labels. Soft hints cover label lengths
(RFC-0095); hard errors cover header/footer navIds mismatches because
localized menus must expose the same destinations in the same order.
</purpose>
<non-goals>
  <item>Do not fail on soft label length warnings — header CSS already adapts gracefully.</item>
  <item>Do not validate business labels here — that belongs in pbp.content.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0095: Initial implementation.</item>
  <item>Enforce localized header/footer navIds parity so all language versions expose the same menu destinations.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";

// RFC-0095 soft limits — chosen for the shared site primitives:
//   brandTagline      truncates in the header's absolute-positioned slot
//   brandLabel        renders inline next to the lang chip; long names wrap awkwardly
//   header.ctaLabel   renders inside a button; long labels overflow the chip
//   brandAriaLabel    screen-reader announcement; long strings hurt accessibility
const SOFT_LIMITS: Record<string, number> = {
  brandTagline: 40,
  brandLabel: 24,
  brandAriaLabel: 80,
  "header.ctaLabel": 24,
};

interface Hint {
  file: string;
  message: string;
}

interface LabelsFile {
  lang: string;
  path: string;
  data: Record<string, unknown>;
}

interface ErrorDiagnostic {
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

function getStringArray(data: Record<string, unknown>, path: string): string[] | null {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);

  if (!Array.isArray(value)) return null;
  return value.every((item): item is string => typeof item === "string") ? value : null;
}

function sameOrderedIds(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function formatIds(ids: string[] | null): string {
  return ids === null ? "<missing>" : `[${ids.join(", ")}]`;
}

function readDefaultLanguage(appDirectory: string): string | null {
  const systemPath = join(appDirectory, "src", "content", "system.md");
  if (!existsSync(systemPath)) return null;
  const fm = parseFrontmatter(readFileSync(systemPath, "utf-8"));
  const i18n = fm?.["i18n"];
  if (!i18n || typeof i18n !== "object") return null;
  const value = (i18n as Record<string, unknown>)["default"];
  return typeof value === "string" ? value : null;
}

export async function runLabelsShapeHint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteDir = join(paths.appDirectory, "src", "content", "site");
  if (!existsSync(siteDir)) {
    return { exitCode: 0, data: { diagnostics: [`No site/ directory at ${siteDir}; skipping.`] } };
  }

  let langs: string[];
  try {
    langs = readdirSync(siteDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return { exitCode: 0, data: { diagnostics: [`Cannot read ${siteDir}; skipping.`] } };
  }

  const hints: Hint[] = [];
  const errors: ErrorDiagnostic[] = [];
  const labelsFiles: LabelsFile[] = [];
  for (const lang of langs) {
    const labelsPath = join(siteDir, lang, "labels.md");
    if (!existsSync(labelsPath)) continue;
    const fm = parseFrontmatter(readFileSync(labelsPath, "utf-8"));
    if (!fm) continue;
    labelsFiles.push({ lang, path: labelsPath, data: fm });

    for (const [field, limit] of Object.entries(SOFT_LIMITS)) {
      const value = field.includes(".")
        ? // Dotted path: "header.ctaLabel" → fm.header?.ctaLabel
          field.split(".").reduce<unknown>((acc, k) => {
            if (acc && typeof acc === "object" && k in (acc as Record<string, unknown>)) {
              return (acc as Record<string, unknown>)[k];
            }
            return undefined;
          }, fm)
        : (fm as Record<string, unknown>)[field];

      if (typeof value !== "string" || value.length <= limit) continue;

      hints.push({
        file: labelsPath,
        message:
          `${field} is ${value.length} chars long (soft limit: ${limit}). ` +
          `Long values in this slot break the shared header / brand layout. ` +
          `Either shorten it or move longer copy into a hero or content block (RFC-0095).`,
      });
    }
  }

  const defaultLang = readDefaultLanguage(paths.appDirectory) ?? langs[0];
  const defaultLabels = labelsFiles.find((file) => file.lang === defaultLang) ?? labelsFiles[0];

  if (defaultLabels) {
    for (const field of ["header.navIds", "footer.navIds"]) {
      const defaultIds = getStringArray(defaultLabels.data, field);

      for (const labelsFile of labelsFiles) {
        if (labelsFile.lang === defaultLabels.lang) continue;
        const localizedIds = getStringArray(labelsFile.data, field);
        if (sameOrderedIds(defaultIds, localizedIds)) continue;

        errors.push({
          file: labelsFile.path,
          message:
            `${field} differs from ${defaultLabels.lang}/labels.md. ` +
            `All language versions must expose the same menu destinations in the same order. ` +
            `Expected ${formatIds(defaultIds)}, got ${formatIds(localizedIds)}.`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return {
      exitCode: 1,
      data: {
        errors: errors.map(
          (e) =>
            `[ERROR] ${relative(context.workspaceRoot, e.file).replace(/\\/g, "/")} — ${e.message}`,
        ),
        total: errors.length,
      },
    };
  }

  if (hints.length > 0) {
    return {
      exitCode: 0,
      data: {
        hints: hints.map(
          (h) =>
            `[HINT] ${relative(context.workspaceRoot, h.file).replace(/\\/g, "/")} — ${h.message}`,
        ),
        total: hints.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [`labels.shape.hint: no soft warnings (${langs.length} locale(s) checked).`],
    },
  };
}
