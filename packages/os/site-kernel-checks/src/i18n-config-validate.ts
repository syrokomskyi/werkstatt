/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/i18n-config-validate.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not modify system.md files.</item>
  <item>Do not implement language detection algorithms.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation for RFC-0038 Wave 1.</item>
</CHANGE_SUMMARY>
*/

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { validateI18nConfigApp } from "@warpgogol/site-kernel-content";

export interface I18nValidationResult {
  command: "i18n.config.validate";
  status: "pass" | "fail";
  violations: I18nViolation[];
}

export interface I18nViolation {
  site?: string;
  rule: string;
  message: string;
  file?: string;
}

/**
 * Run i18n configuration validation (RFC-0038).
 */
export async function runI18nConfigValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<I18nValidationResult>> {
  const violations: I18nViolation[] = [];
  const workspaceRoot = context.workspaceRoot;
  const app = input.args[0] as string | undefined;

  const appsToCheck = app ? [app] : await discoverApps(workspaceRoot);

  for (const siteName of appsToCheck) {
    const appPath = path.join(workspaceRoot, "apps", siteName);
    const appViolations = await validateAppI18n(appPath, siteName);
    violations.push(...appViolations);
  }

  return {
    data: {
      command: "i18n.config.validate",
      status: violations.length === 0 ? "pass" : "fail",
      violations,
    },
    summary:
      violations.length === 0
        ? "All apps have valid i18n configuration"
        : `${violations.length} violation(s) found`,
  };
}

async function discoverApps(workspaceRoot: string): Promise<string[]> {
  const appsDir = path.join(workspaceRoot, "apps");
  try {
    const entries = await fs.readdir(appsDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function validateAppI18n(appPath: string, siteName: string): Promise<I18nViolation[]> {
  const violations: I18nViolation[] = [];

  // Validate i18n config in system.md
  const configErrors = await validateI18nConfigApp(appPath);
  for (const error of configErrors) {
    violations.push({
      site: siteName,
      ...error,
    });
  }

  // If config is valid, check for orphan content files
  if (configErrors.length === 0) {
    const orphanViolations = await checkOrphanContentFiles(appPath, siteName);
    violations.push(...orphanViolations);
  }

  return violations;
}

/**
 * Check for content files in unsupported languages.
 */
async function checkOrphanContentFiles(
  appPath: string,
  siteName: string,
): Promise<I18nViolation[]> {
  const violations: I18nViolation[] = [];
  const pagesDir = path.join(appPath, "src", "content", "pages");

  try {
    // This is a simplified check — full implementation would parse system.md
    // to get supported languages and scan all content directories
    const entries = await fs.readdir(pagesDir, { withFileTypes: true });
    const langDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // For now, just check for obvious patterns
    // Full validation requires parsing system.md i18n.supported
    const knownLangs = new Set([
      "de",
      "en",
      "es",
      "fr",
      "it",
      "pt",
      "ru",
      "uk",
      "pl",
      "nl",
      "sv",
      "da",
      "fi",
      "no",
      "cs",
      "hu",
      "ro",
      "bg",
      "hr",
      "sr",
      "sl",
      "sk",
      "lt",
      "lv",
      "et",
      "is",
      "ga",
      "mt",
      "cy",
      "eu",
      "ca",
      "gl",
      "ast",
      "oc",
      "br",
      "co",
      "wa",
      "lb",
      "fur",
      "gsw",
      "nds",
      "ksh",
      "pfl",
      "stq",
      "pdc",
      "yi",
      "he",
      "ar",
      "fa",
      "ur",
      "hi",
      "bn",
      "pa",
      "gu",
      "or",
      "ta",
      "te",
      "kn",
      "ml",
      "si",
      "th",
      "lo",
      "my",
      "km",
      "vi",
      "id",
      "ms",
      "tl",
      "jv",
      "su",
      "mg",
      "sw",
      "am",
      "so",
      "rw",
      "ne",
      "mr",
      "kok",
      "sa",
      "bo",
      "dz",
      "ka",
      "hy",
      "az",
      "kk",
      "uz",
      "ky",
      "tk",
      "mn",
      "ps",
      "sd",
      "ckb",
      "ug",
      "bo",
      "dz",
      "ne",
      "mr",
      "kok",
      "sa",
      "ur",
      "he",
      "yi",
      "ar",
      "fa",
      "ps",
      "sd",
      "ckb",
      "ug",
      "bo",
      "dz",
      "ne",
      "mr",
      "kok",
      "sa",
    ]);

    for (const lang of langDirs) {
      if (!knownLangs.has(lang) && lang.length === 2) {
        // Unknown 2-letter code — potential orphan
        violations.push({
          site: siteName,
          rule: "potential-orphan-language",
          message: `Language directory "${lang}" may not be declared in system.md i18n.supported`,
          file: `src/content/pages/${lang}/`,
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return violations;
}
