/*
<MODULE_CONTRACT>
<purpose>RFC-0183 validators for content-layer Feature Policy embedded in RFC-0047 content domains.</purpose>
<non-goals>
  <item>Do not resolve runtime visibility or render content.</item>
  <item>Do not modify content files.</item>
  <item>Do not implement remote feature management.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0183: Add Feature Policy validation commands without reintroducing src/content/features.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { featurePolicySchema } from "@warpgogol/share/schemas/features";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/werkstatt-site/content";

export type FeaturePolicyRuleId =
  | "POLICY-LEGACY-FEATURES-DIR"
  | "POLICY-LEGACY-FEATURES-TS"
  | "POLICY-LEGACY-FEATURE-FLAG"
  | "POLICY-INVALID-SHAPE";

export interface FeaturePolicyViolation {
  file: string;
  ruleId: FeaturePolicyRuleId;
  message: string;
}

export interface FeaturePolicyFinding {
  ruleId: "POLICY-FOUND";
  file: string;
  message: string;
}

export interface FeaturePolicyValidationResult {
  command: "feature.policy.validate" | "feature.references.validate";
  status: "pass" | "fail";
  checkedFiles: number;
  violations: FeaturePolicyViolation[];
  findings: FeaturePolicyFinding[];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function collectPolicyEntries(
  value: unknown,
  path: string,
  entries: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (value == null || typeof value !== "object") return entries;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPolicyEntries(item, `${path}[${index}]`, entries));
    return entries;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "policy") {
      entries.push({ path: childPath, value: child });
    }
    collectPolicyEntries(child, childPath, entries);
  }

  return entries;
}

function collectLegacyFeatureFlags(
  value: unknown,
  path: string,
  entries: Array<{ path: string; value: unknown }> = [],
): Array<{ path: string; value: unknown }> {
  if (value == null || typeof value !== "object") return entries;

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectLegacyFeatureFlags(item, `${path}[${index}]`, entries));
    return entries;
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key === "featureFlag") {
      entries.push({ path: childPath, value: child });
    }
    collectLegacyFeatureFlags(child, childPath, entries);
  }

  return entries;
}

export async function runFeaturePolicyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeaturePolicyValidationResult>> {
  const paths = requireAstroSitePaths(context);
  const violations: FeaturePolicyViolation[] = [];
  const findings: FeaturePolicyFinding[] = [];

  const legacyFeaturesDir = join(paths.contentDirectory, "features");
  if (await pathExists(legacyFeaturesDir)) {
    violations.push({
      file: relative(paths.appDirectory, legacyFeaturesDir),
      ruleId: "POLICY-LEGACY-FEATURES-DIR",
      message:
        "src/content/features/** is retired by RFC-0183. Move policy into existing RFC-0047 content domains.",
    });
  }

  const legacyFeaturesTs = join(paths.appDirectory, "src", "configure", "features.ts");
  if (await pathExists(legacyFeaturesTs)) {
    violations.push({
      file: relative(paths.appDirectory, legacyFeaturesTs),
      ruleId: "POLICY-LEGACY-FEATURES-TS",
      message:
        "src/configure/features.ts is retired by RFC-0183. Declare feature policy in content frontmatter instead.",
    });
  }

  const contentFiles = await collectMarkdownFiles(paths.contentDirectory);

  for (const filePath of contentFiles) {
    const relFile = relative(paths.appDirectory, filePath);
    const source = await readFile(filePath, "utf8");
    const { data } = parseMarkdownFrontmatter(source);
    if (!data || typeof data !== "object") continue;

    for (const entry of collectPolicyEntries(data, "")) {
      if (entry.value == null || typeof entry.value !== "object" || Array.isArray(entry.value)) {
        continue;
      }
      const result = featurePolicySchema.safeParse(entry.value);
      if (!result.success) {
        violations.push({
          file: relFile,
          ruleId: "POLICY-INVALID-SHAPE",
          message: `Invalid policy at ${entry.path}: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
        });
      } else {
        findings.push({
          file: relFile,
          ruleId: "POLICY-FOUND",
          message: `Found valid policy at ${entry.path}`,
        });
      }
    }

    for (const entry of collectLegacyFeatureFlags(data, "")) {
      violations.push({
        file: relFile,
        ruleId: "POLICY-LEGACY-FEATURE-FLAG",
        message: `Legacy featureFlag at ${entry.path} is retired by RFC-0183. Use policy.visibility and policy.behavior instead.`,
      });
    }
  }

  return {
    data: {
      command: "feature.policy.validate",
      status: violations.length > 0 ? "fail" : "pass",
      checkedFiles: contentFiles.length,
      violations,
      findings,
    },
    exitCode: violations.length > 0 ? 1 : 0,
    summary:
      violations.length === 0
        ? `[feature.policy.validate] OK (${contentFiles.length} content files checked, ${findings.length} policy field(s) found)`
        : undefined,
  };
}

/**
 * Transitional alias for `feature.policy.validate` (RFC-0183).
 *
 * DEFERRED: the full reference validator described in RFC-0183 (target-id ↔ existing
 * pages/blocks/components/nav/business items, visible-target-points-to-disabled-content,
 * inherited-policy source reporting) is not implemented yet — there is no authored policy
 * in any app to validate against. Until apps adopt real `policy` fields this re-runs the
 * shape validation under the `feature.references.validate` command name. Replace this body
 * with the reference-graph checks when policy authoring begins; do not present it as more
 * than a shape alias in the meantime.
 */
export async function runFeatureReferencesValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FeaturePolicyValidationResult>> {
  const result = await runFeaturePolicyValidate(input, context);
  const data =
    result.data ??
    ({
      command: "feature.policy.validate",
      status: "fail",
      checkedFiles: 0,
      violations: [
        {
          file: ".",
          ruleId: "POLICY-INVALID-SHAPE",
          message: "feature.policy.validate did not return validation data.",
        },
      ],
      findings: [],
    } satisfies FeaturePolicyValidationResult);

  const referencesData: FeaturePolicyValidationResult = {
    command: "feature.references.validate",
    status: data.status,
    checkedFiles: data.checkedFiles,
    violations: data.violations,
    findings: data.findings,
  };

  return {
    ...result,
    data: referencesData,
    summary:
      referencesData.violations.length === 0
        ? `[feature.references.validate] OK (${referencesData.checkedFiles} content files checked, ${referencesData.findings.length} policy field(s) found)`
        : undefined,
  };
}
