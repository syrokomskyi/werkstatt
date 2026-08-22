/*
<MODULE_CONTRACT>
<purpose>
  RFC-0908: Post-build validator that checks trailing-slash normalization
  configuration. Verifies Astro build.format consistency with the
  trailingSlash: "always" policy and presence of normalization redirects in
  _redirects. Rules: SLASH-01 (missing normalization redirects), SLASH-02
  (inconsistent build.format), SLASH-03 (missing policy declaration, warning).
</purpose>
<non-goals>
  <item>Do not generate or modify _redirects or Worker config — validation only.</item>
  <item>Do not validate canonical URL trailing-slash parity between HTML and sitemap — that is owned by canonical.html-parity.validate (RFC-0906).</item>
  <item>Do not validate host canonicalization — that is owned by host.canonical.config.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0908: initial implementation — trailing.slash.config.validate with SLASH-01..03 rules.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { parseRedirectRules } from "@warpgogol/werkstatt-shared/share/redirects";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

const COMMAND = "trailing.slash.config.validate";

async function readAstroBuildFormat(appDirectory: string): Promise<string | undefined> {
  const configPath = join(appDirectory, "astro.config.mjs");
  try {
    const text = await readFile(configPath, "utf-8");
    const match = text.match(/build\s*:\s*\{[^}]*?format\s*:\s*["'](\w+)["']/s);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function hasTrailingSlashNormalization(rules: ReturnType<typeof parseRedirectRules>): boolean {
  for (const rule of rules) {
    if (rule.status === 410 || rule.status === 200) continue;
    if (!rule.to) continue;

    const fromHasSlash = rule.from.endsWith("/");
    const toHasSlash = rule.to.endsWith("/");

    if (!fromHasSlash && toHasSlash) {
      return true;
    }

    if (rule.from.includes("*") && rule.to.includes("*")) {
      const fromBeforeWildcard = rule.from.split("*")[0];
      const toBeforeWildcard = rule.to.split("*")[0];
      if (!fromBeforeWildcard.endsWith("/") && toBeforeWildcard.endsWith("/")) {
        return true;
      }
    }
  }
  return false;
}

export async function runTrailingSlashConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);

  const configPath = join(paths.appDirectory, "astro.config.mjs");
  const configExists = await context.io.exists(configPath);
  if (!configExists) {
    return passResult(COMMAND, `${COMMAND}: no astro.config.mjs — skipped`);
  }

  const buildFormat = await readAstroBuildFormat(paths.appDirectory);
  const effectiveFormat = buildFormat ?? "directory";

  const diagnostics: Diagnostic[] = [];

  if (!buildFormat) {
    diagnostics.push({
      ruleId: "SLASH-03",
      severity: "warning",
      file: "astro.config.mjs",
      message:
        "build.format is not explicitly set in astro.config.mjs — defaulting to 'directory' which matches trailingSlash: always, but explicit declaration is recommended.",
      fixHint:
        "Set build: { format: 'directory' } in astro.config.mjs to explicitly declare the trailing-slash policy.",
    });
  }

  if (effectiveFormat !== "directory") {
    diagnostics.push({
      ruleId: "SLASH-02",
      severity: "error",
      file: "astro.config.mjs",
      message: `build.format is '${effectiveFormat}' but trailingSlash policy is 'always' — pages will be served at /path.html, not /path/.`,
      fixHint:
        "Set build.format to 'directory' in astro.config.mjs to match trailingSlash: always.",
    });
  }

  const redirectsPath = join(paths.publicDirectory, "_redirects");
  const redirectsBody = (await context.io.exists(redirectsPath))
    ? await context.io.readFile(redirectsPath)
    : undefined;

  if (!redirectsBody) {
    diagnostics.push({
      ruleId: "SLASH-01",
      severity: "error",
      file: "public/_redirects",
      message:
        "Trailing-slash policy is 'always' but no _redirects file found — no normalization redirects configured.",
      fixHint:
        "Add trailing-slash normalization rules to public/_redirects or configure normalization in the Worker fetch handler.",
    });
    return diagnosticsResult(COMMAND, diagnostics);
  }

  const rules = parseRedirectRules(redirectsBody);
  const hasNormalization = hasTrailingSlashNormalization(rules);

  if (!hasNormalization) {
    diagnostics.push({
      ruleId: "SLASH-01",
      severity: "error",
      file: "public/_redirects",
      message:
        "Trailing-slash policy is 'always' but no non-trailing-slash → trailing-slash normalization redirects found in _redirects.",
      fixHint:
        "Add trailing-slash normalization rules to _redirects (e.g. /path /path/ 308) or configure normalization in the Worker fetch handler.",
    });
  }

  if (diagnostics.length === 0) {
    return passResult(
      COMMAND,
      `${COMMAND}: OK — policy "always", build.format "${effectiveFormat}", normalization redirects present`,
    );
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
