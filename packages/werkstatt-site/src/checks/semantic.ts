/*
<MODULE_CONTRACT>
<purpose>Facilitates validation of route files, RFC-0183 Feature Policy aliasing, and semantic mirror integrity.</purpose>
<non-goals>
  <item>Do not modify or create new route files during validation.</item>
  <item>Do not handle transport or configuration orchestration.</item>
  <item>Do not parse raw content outside of defined validation scopes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0183: Replace legacy feature visibility validation with a Feature Policy alias.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { runSemanticMirrorValidation } from "./semantic-mirror.ts";
import { runFeaturePolicyValidate } from "./feature-policy.ts";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { PAGES_NON_ROUTE_SUBDIRS } from "./lib/route-constants.ts";

export interface FeatureVisibilityViolation {
  file: string;
  rule: "undeclared-feature-flag" | "missing-features-file";
  message: string;
}

export interface FeatureVisibilityValidationResult {
  command: "feature.visibility.validate";
  status: "pass" | "fail";
  checkedFiles: number;
  violations: FeatureVisibilityViolation[];
}

async function collectAstroPageFiles(pagesDir: string): Promise<string[]> {
  // PAGES_NON_ROUTE_SUBDIRS only applies at the top level of pagesDir (a nested
  // directory that happens to share a name, e.g. src/pages/foo/api/, is not excluded),
  // so the top level is enumerated separately from the uniform-ignore recursive collect.
  let topEntries;
  try {
    topEntries = await readdir(pagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of topEntries) {
    if (entry.isDirectory()) {
      if (PAGES_NON_ROUTE_SUBDIRS.has(entry.name)) continue;
      results.push(
        ...(await collectFiles(join(pagesDir, entry.name), {
          extensions: [".astro"],
          ignore: () => false,
        })),
      );
    } else if (entry.isFile() && entry.name.endsWith(".astro")) {
      results.push(join(pagesDir, entry.name));
    }
  }
  return results;
}

// Replace content inside ``` fences with spaces to avoid false positives in documentation pages.
// Newlines are preserved so that line-number reporting stays accurate.
function stripCodeFences(source: string): string {
  return source.replace(/```[\s\S]*?```/g, (match) => match.replace(/[^\n]/g, " "));
}

function findStyleViolations(source: string, filePath: string, appDir: string): string[] {
  const violations: string[] = [];
  const cleaned = stripCodeFences(source);
  const rel = relative(appDir, filePath).replace(/\\/g, "/");

  // Detect <style> or <style lang="..."> or <style is:global> etc.
  const styleTagRe = /<style(\s[^>]*)?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleTagRe.exec(cleaned)) !== null) {
    const line = cleaned.slice(0, match.index).split("\n").length;
    violations.push(`${rel}:${line}: <style> block in route file (move styles to src/styles/)`);
  }

  // Detect inline style= attributes: style="...", style={...}, style={`...`}
  const inlineStyleRe = /\bstyle\s*=\s*["'`{]/gi;
  while ((match = inlineStyleRe.exec(cleaned)) !== null) {
    const line = cleaned.slice(0, match.index).split("\n").length;
    violations.push(
      `${rel}:${line}: inline style= attribute in route file (use CSS classes instead)`,
    );
  }

  return violations;
}

export async function runRouteSlimValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ checkedFiles: number; violations: number }>> {
  const paths = requireAstroSitePaths(context);
  const pagesDir = join(paths.srcDirectory, "pages");

  const files = await collectAstroPageFiles(pagesDir);
  const violations: string[] = [];

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    violations.push(...findStyleViolations(source, filePath, paths.appDirectory));
  }

  for (const v of violations) {
    context.logger.error(v);
  }

  return {
    data: { checkedFiles: files.length, violations: violations.length },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[route.thin.validate] OK (${files.length} route files checked)`
        : undefined,
  };
}

/**
 * Validates semantic layer mirror integrity according to RFC-0012.
 * Checks SM-01 (routes → builders), SM-02 (builders → routes), and SM-03 (type aliases).
 */
export async function runFeatureVisibilityValidation(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeatureVisibilityValidationResult>> {
  const policyResult = await runFeaturePolicyValidate(input, context);
  const policyData = policyResult.data;
  const violations: FeatureVisibilityViolation[] =
    policyData?.violations.map((violation) => ({
      file: violation.file,
      rule:
        violation.ruleId === "POLICY-LEGACY-FEATURES-TS"
          ? "missing-features-file"
          : "undeclared-feature-flag",
      message: violation.message,
    })) ?? [];

  return {
    data: {
      command: "feature.visibility.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedFiles: policyData?.checkedFiles ?? 0,
      violations,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[feature.visibility.validate] OK (${policyData?.checkedFiles ?? 0} content files checked via RFC-0183 Feature Policy)`
        : undefined,
  };
}

export async function runSemanticMirrorValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const app = context.site?.name ?? "unknown";

  const result = await runSemanticMirrorValidation(paths.appDirectory, app);

  if (result.status === "pass") {
    return {
      data: result,
      exitCode: 0,
      summary: `[semantic.mirror.validate] OK (${app})`,
    };
  }

  // Report violations
  for (const violation of result.violations) {
    context.logger.error(`${violation.file}: ${violation.message} [${violation.rule}]`);
  }

  return {
    data: result,
    exitCode: 1,
    summary: `[semantic.mirror.validate] FAIL (${app}): ${result.violations.length} violations`,
  };
}
