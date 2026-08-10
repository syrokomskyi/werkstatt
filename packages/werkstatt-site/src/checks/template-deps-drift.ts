/*
<MODULE_CONTRACT>
<purpose>
RFC-0800: template.deps.drift — compares `dependencies` and `devDependencies`
between the materialized workpiece `package.json` and the canonical
`package.template.json`. Emits TEMPLATE-DEPS-DRIFT-01 for version mismatches
and TEMPLATE-DEPS-DRIFT-02 for missing files. Integrated into
SITES_BUILD_CHECK_PIPELINE as a safety net for the auto-sync in mission.close.
</purpose>
<non-goals>
  <item>Does not sync dependencies — that is config.template.sync.</item>
  <item>Does not compare scripts, engines, or other package.json fields — only dependencies and devDependencies.</item>
  <item>Does not compare astro.config.mjs blocks — already handled by config.template.sync.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0800: initial implementation of template.deps.drift check command.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { fileExists } from "@warpgogol/werkstatt-site/share/fs";
import { TEMPLATES_DIR } from "../onboarding/templates.ts";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const COMMAND = "template.deps.drift";

export interface TemplateDepsDriftData extends CheckResult {
  site: string;
  templatePath: string;
  workpiecePath: string;
  depsCompared: number;
  drift: Array<{
    package: string;
    section: "dependencies" | "devDependencies";
    workpieceVersion: string;
    templateVersion: string;
  }>;
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

export async function runTemplateDepsDrift(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TemplateDepsDriftData>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;

  const site = readFlag(input, "site") ?? context.site?.name;
  if (!site) {
    diagnostics.push({
      ruleId: "TEMPLATE-DEPS-DRIFT-02",
      severity: "error",
      message: "--site <name> is required.",
      fixHint: "Pass --site <system-id> to specify which workpiece to check.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateDepsDriftData>;
  }

  const templatePath = join(TEMPLATES_DIR, "package.template.json");

  let templateRaw: string;
  try {
    templateRaw = await readFile(templatePath, "utf-8");
  } catch {
    diagnostics.push({
      ruleId: "TEMPLATE-DEPS-DRIFT-02",
      severity: "error",
      message: `Template file not found: ${templatePath}`,
      fixHint: "Ensure packages/werkstatt-site/src/onboarding/templates/package.template.json exists.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateDepsDriftData>;
  }

  const workpieceDirOverride = readFlag(input, "workpiece-dir");
  let workpiecePkgPath: string;
  if (workpieceDirOverride) {
    workpiecePkgPath = join(workspaceRoot, workpieceDirOverride, "package.json");
  } else {
    const missionsDir = join(workspaceRoot, "missions");
    if (!(await fileExists(missionsDir))) {
      diagnostics.push({
        ruleId: "TEMPLATE-DEPS-DRIFT-02",
        severity: "error",
        message: `No missions directory found at ${missionsDir}.`,
        fixHint: "Ensure a mission is open for this site before running template.deps.drift.",
      });
      return diagnosticsResult(
        COMMAND,
        diagnostics,
      ) as KernelCommandResult<TemplateDepsDriftData>;
    }

    const { readdir } = await import("node:fs/promises");
    const matchingMissions: string[] = [];
    try {
      const entries = await readdir(missionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = join(missionsDir, entry.name, "workpiece");
        if (await fileExists(candidate)) {
          let matches = false;
          const missionFile = join(missionsDir, entry.name, "mission.yaml");
          if (await fileExists(missionFile)) {
            try {
              const missionRaw = await readFile(missionFile, "utf-8");
              const missionData = parseYaml(missionRaw) as { systemId?: string };
              if (missionData.systemId === site) matches = true;
            } catch {
              // continue to fallback
            }
          }
          if (!matches) {
            const systemFile = join(missionsDir, entry.name, "system.json");
            if (await fileExists(systemFile)) {
              try {
                const systemRaw = await readFile(systemFile, "utf-8");
                const systemData = JSON.parse(systemRaw) as { id?: string };
                if (systemData.id === site) matches = true;
              } catch {
                // continue
              }
            }
          }
          if (matches) matchingMissions.push(entry.name);
        }
      }
    } catch {
      // missions dir not readable
    }

    if (matchingMissions.length === 0) {
      diagnostics.push({
        ruleId: "TEMPLATE-DEPS-DRIFT-02",
        severity: "error",
        message: `No current mission workpiece found for site '${site}'.`,
        fixHint: `Open a mission for site '${site}' via mission.open, or pass --workpiece-dir to specify the path.`,
      });
      return diagnosticsResult(
        COMMAND,
        diagnostics,
      ) as KernelCommandResult<TemplateDepsDriftData>;
    }

    matchingMissions.sort();
    const latest = matchingMissions[matchingMissions.length - 1]!;
    workpiecePkgPath = join(missionsDir, latest, "workpiece", "package.json");
  }

  let workpieceRaw: string;
  try {
    workpieceRaw = await readFile(workpiecePkgPath, "utf-8");
  } catch {
    diagnostics.push({
      ruleId: "TEMPLATE-DEPS-DRIFT-02",
      severity: "error",
      message: `Workpiece package.json not found: ${workpiecePkgPath}`,
      fixHint: "Run mission.materialize to generate the workpiece before checking drift.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateDepsDriftData>;
  }

  let templatePkg: PackageJson;
  let workpiecePkg: PackageJson;
  try {
    templatePkg = JSON.parse(templateRaw) as PackageJson;
  } catch {
    diagnostics.push({
      ruleId: "TEMPLATE-DEPS-DRIFT-02",
      severity: "error",
      message: `Template package.template.json is not valid JSON: ${templatePath}`,
      fixHint: "Fix the JSON syntax in packages/werkstatt-site/src/onboarding/templates/package.template.json.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateDepsDriftData>;
  }
  try {
    workpiecePkg = JSON.parse(workpieceRaw) as PackageJson;
  } catch {
    diagnostics.push({
      ruleId: "TEMPLATE-DEPS-DRIFT-02",
      severity: "error",
      message: `Workpiece package.json is not valid JSON: ${workpiecePkgPath}`,
      fixHint: "Fix the JSON syntax in the workpiece package.json.",
    });
    return diagnosticsResult(
      COMMAND,
      diagnostics,
    ) as KernelCommandResult<TemplateDepsDriftData>;
  }

  const sections: Array<"dependencies" | "devDependencies"> = ["dependencies", "devDependencies"];
  const drift: TemplateDepsDriftData["drift"] = [];
  let depsCompared = 0;

  for (const section of sections) {
    const templateDeps = templatePkg[section] ?? {};
    const workpieceDeps = workpiecePkg[section] ?? {};
    const allKeys = new Set([...Object.keys(templateDeps), ...Object.keys(workpieceDeps)]);

    for (const pkg of allKeys) {
      depsCompared++;
      const templateVersion = templateDeps[pkg];
      const workpieceVersion = workpieceDeps[pkg];

      if (templateVersion === undefined && workpieceVersion !== undefined) {
        drift.push({ package: pkg, section, workpieceVersion, templateVersion: "<missing>" });
        diagnostics.push({
          ruleId: "TEMPLATE-DEPS-DRIFT-01",
          severity: "error",
          message: `Dependency '${pkg}' in ${section}: present in workpiece (${workpieceVersion}) but missing from template.`,
          fixHint: `Run: pnpm exec werkstatt run config.template.sync --site ${site}`,
        });
      } else if (workpieceVersion === undefined && templateVersion !== undefined) {
        drift.push({ package: pkg, section, workpieceVersion: "<missing>", templateVersion });
        diagnostics.push({
          ruleId: "TEMPLATE-DEPS-DRIFT-01",
          severity: "error",
          message: `Dependency '${pkg}' in ${section}: present in template (${templateVersion}) but missing from workpiece.`,
          fixHint: `Run: pnpm exec werkstatt run config.template.sync --site ${site}`,
        });
      } else if (templateVersion !== workpieceVersion) {
        drift.push({ package: pkg, section, workpieceVersion: workpieceVersion!, templateVersion: templateVersion! });
        diagnostics.push({
          ruleId: "TEMPLATE-DEPS-DRIFT-01",
          severity: "error",
          message: `Dependency '${pkg}' in ${section}: workpiece has '${workpieceVersion}' but template has '${templateVersion}'.`,
          fixHint: `Run: pnpm exec werkstatt run config.template.sync --site ${site}`,
        });
      }
    }
  }

  return diagnosticsResult(
    COMMAND,
    diagnostics,
  ) as KernelCommandResult<TemplateDepsDriftData>;
}
