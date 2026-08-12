/*
<MODULE_CONTRACT>
<purpose>
RFC-0815: template.peer-deps.validate — resolves the dependency tree declared in
`package.template.json` and checks all peer dependency constraints are satisfied
by the declared versions. Uses `pnpm install --dry-run --strict-peer-dependencies`
in a temp directory to detect peer conflicts. Emits PEER-01 for violations,
PEER-02 for missing template, PEER-03 for resolution failure. Integrated into
SITES_BUILD_CHECK_PIPELINE after template.deps.drift.
</purpose>
<non-goals>
  <item>Does not check peer dependencies of workspace:* packages — they are stripped before resolution.</item>
  <item>Does not auto-fix version mismatches — report-only.</item>
  <item>Does not check workpiece package.json — only the template.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0815: initial implementation of template.peer-deps.validate check command.</item>
</CHANGE_SUMMARY>
*/

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TEMPLATES_DIR } from "../onboarding/templates.ts";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const COMMAND = "template.peer-deps.validate";
const execFileAsync = promisify(execFile);

export interface PeerViolation {
  ruleId: string;
  package: string;
  declaredVersion: string;
  requiredBy: string;
  requiredRange: string;
  message: string;
}

export interface PeerDepsValidateData extends CheckResult {
  site: string;
  templatePath: string;
  violations: PeerViolation[];
  checked: number;
  passed: number;
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

type DepsRecord = Record<string, string>;

interface PackageJson {
  dependencies?: DepsRecord;
  devDependencies?: DepsRecord;
}

interface PeerDepConflict {
  package: string;
  version: string;
  requiredBy: string;
  requiredRange: string;
}

const PEER_CONFLICT_PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray) => PeerDepConflict;
}> = [
  {
    regex: /peer dependency "([^"]+)"\s+"([^"]+)"\s+required by\s+"([^"]+)"/g,
    extract: (match) => ({
      package: match[1]!,
      requiredRange: match[2]!,
      requiredBy: match[3]!,
      version: "",
    }),
  },
];

function parsePeerConflicts(output: string, templateDeps: DepsRecord): PeerDepConflict[] {
  const conflicts: PeerDepConflict[] = [];
  const seen = new Set<string>();

  for (const pattern of PEER_CONFLICT_PATTERNS) {
    for (const match of output.matchAll(pattern.regex)) {
      const extracted = pattern.extract(match);
      const declaredVersion = templateDeps[extracted.package] ?? "unknown";
      const key = `${extracted.package}@${extracted.requiredBy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      conflicts.push({ ...extracted, version: declaredVersion });
    }
  }

  return conflicts;
}

function isNetworkError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("err_pnpm_fetch_") ||
    lower.includes("err_pnpm_registry_") ||
    lower.includes("network") ||
    lower.includes("etag") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound")
  );
}

export async function runTemplatePeerDepsValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PeerDepsValidateData>> {
  const diagnostics: Diagnostic[] = [];

  const site = readFlag(input, "site") ?? context.site?.name ?? "template";

  const templatePath = join(TEMPLATES_DIR, "package.template.json");

  let templateRaw: string;
  try {
    templateRaw = await readFile(templatePath, "utf-8");
  } catch {
    diagnostics.push({
      ruleId: "PEER-02",
      severity: "error",
      message: `Template file not found: ${templatePath}`,
      fixHint:
        "Ensure packages/werkstatt-site/src/onboarding/templates/package.template.json exists.",
    });
    return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PeerDepsValidateData>;
  }

  let templatePkg: PackageJson;
  try {
    templatePkg = JSON.parse(templateRaw) as PackageJson;
  } catch {
    diagnostics.push({
      ruleId: "PEER-02",
      severity: "error",
      message: `Template package.template.json is not valid JSON: ${templatePath}`,
      fixHint:
        "Fix the JSON syntax in packages/werkstatt-site/src/onboarding/templates/package.template.json.",
    });
    return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PeerDepsValidateData>;
  }

  const allDeps: DepsRecord = {
    ...(templatePkg.dependencies ?? {}),
    ...(templatePkg.devDependencies ?? {}),
  };

  const filteredDeps: DepsRecord = {};
  for (const [name, version] of Object.entries(allDeps)) {
    if (version.startsWith("workspace:")) continue;
    filteredDeps[name] = version;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "peer-deps-validate-"));

  try {
    const tempPkgJson = {
      name: "peer-deps-check",
      version: "0.0.0",
      private: true,
      dependencies: filteredDeps,
    };
    await writeFile(join(tempDir, "package.json"), JSON.stringify(tempPkgJson, null, 2));

    try {
      await execFileAsync(
        "pnpm",
        ["install", "--dry-run", "--strict-peer-dependencies", "--ignore-scripts"],
        {
          cwd: tempDir,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60_000,
        },
      );
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message: string };
      const stderr = error.stderr ?? "";
      const stdout = error.stdout ?? "";
      const combinedOutput = `${stdout}\n${stderr}`;

      if (isNetworkError(stderr) || isNetworkError(combinedOutput)) {
        diagnostics.push({
          ruleId: "PEER-03",
          severity: "warning",
          message: `Dependency resolution failed (registry/network error): ${stderr.slice(0, 200)}`,
          fixHint:
            "Ensure registry access is available, or run in an environment with a local cache.",
        });
        return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PeerDepsValidateData>;
      }

      const conflicts = parsePeerConflicts(combinedOutput, allDeps);
      if (conflicts.length === 0) {
        diagnostics.push({
          ruleId: "PEER-01",
          severity: "error",
          message: `pnpm install --dry-run failed with peer dependency issues but no specific conflicts could be parsed. Raw output: ${combinedOutput.slice(0, 500)}`,
          fixHint: "Check the pnpm output manually for peer dependency conflicts.",
        });
      } else {
        for (const conflict of conflicts) {
          diagnostics.push({
            ruleId: "PEER-01",
            severity: "error",
            message: `${conflict.package} ${conflict.version} does not satisfy peer dependency ${conflict.requiredRange} required by ${conflict.requiredBy}`,
            fixHint: `Update ${conflict.package} in package.template.json to satisfy ${conflict.requiredRange}`,
          });
        }
      }

      return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PeerDepsValidateData>;
    }

    return {
      data: {
        command: COMMAND,
        status: "pass",
        diagnostics: [],
        summary: { error: 0, warning: 0, info: 0 },
        site,
        templatePath,
        violations: [],
        checked: Object.keys(filteredDeps).length,
        passed: Object.keys(filteredDeps).length,
      },
      exitCode: 0,
      summary: `${COMMAND}: OK — ${Object.keys(filteredDeps).length} dependencies checked, 0 peer violations`,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
