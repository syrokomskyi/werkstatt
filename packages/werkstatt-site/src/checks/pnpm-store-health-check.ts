/*
<MODULE_CONTRACT>
<purpose>
pnpm.store.health-check — runs `pnpm licenses list --prod --json` in the
workpiece directory to detect a corrupted pnpm store before the heavy build
pipeline starts. When the store index is stale (ERR_PNPM_MISSING_PACKAGE_INDEX_FILE),
emits a clear diagnostic with the fix hint: `rm -rf node_modules && pnpm install`.
Integrated into SITES_BUILD_PREPARE_PIPELINE and SITES_BUILD_PREPARE_DEV_PIPELINE
as the very first step, before config.regenerate.
</purpose>
<non-goals>
  <item>Does not validate lockfile integrity — that is template.imports.validate.</item>
  <item>Does not validate import resolution — that is workpiece.imports.validate.</item>
  <item>Does not run pnpm install — only probes store health.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: detect corrupted pnpm store before pipeline runs.</item>
</CHANGE_SUMMARY>
*/

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const COMMAND = "pnpm.store.health-check";

export interface PnpmStoreHealthCheckData extends CheckResult {
  site: string;
  healthy: boolean;
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

function resolveWorkpieceDir(
  workspaceRoot: string,
  site: string | undefined,
  workpieceDirOverride: string | undefined,
): string | null {
  if (workpieceDirOverride) {
    return join(workspaceRoot, workpieceDirOverride);
  }
  if (!site) return null;

  const missionsDir = join(workspaceRoot, "missions");
  if (!existsSync(missionsDir)) return null;

  const searchDirs = [missionsDir];
  for (const state of ["archive/closed", "archive/aborted"]) {
    searchDirs.push(join(missionsDir, state));
  }

  for (const searchDir of searchDirs) {
    if (!existsSync(searchDir)) continue;
    let entries;
    try {
      entries = readdirSync(searchDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "archive") continue;
      const candidate = join(searchDir, entry.name, "workpiece");
      if (!existsSync(candidate)) continue;

      const missionFile = join(searchDir, entry.name, "mission.yaml");
      if (existsSync(missionFile)) {
        try {
          const raw = readFileSync(missionFile, "utf-8");
          const data = parseYaml(raw) as { systemId?: string };
          if (data.systemId === site) {
            return candidate;
          }
        } catch {
          // continue
        }
      }
      // Fallback: check system.json for id (legacy convention)
      const systemFile = join(searchDir, entry.name, "system.json");
      if (existsSync(systemFile)) {
        try {
          const raw = readFileSync(systemFile, "utf-8");
          const data = JSON.parse(raw) as { id?: string };
          if (data.id === site) {
            return candidate;
          }
        } catch {
          // continue
        }
      }
    }
  }

  return null;
}

export async function runPnpmStoreHealthCheck(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PnpmStoreHealthCheckData>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;

  const site = readFlag(input, "site");
  const workpieceDirOverride = readFlag(input, "workpiece-dir");

  const workpieceDir = resolveWorkpieceDir(workspaceRoot, site, workpieceDirOverride);

  if (!workpieceDir) {
    diagnostics.push({
      ruleId: "PNPM-STORE-01",
      severity: "error",
      message: "--site <name> is required (or --workpiece-dir override).",
      fixHint: "Pass --site <system-id> to specify which workpiece to check.",
    });
    return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PnpmStoreHealthCheckData>;
  }

  if (!existsSync(workpieceDir)) {
    diagnostics.push({
      ruleId: "PNPM-STORE-01",
      severity: "error",
      message: `Workpiece directory does not exist: ${workpieceDir}.`,
      fixHint: "Run mission.materialize to generate the workpiece before checking.",
    });
    return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PnpmStoreHealthCheckData>;
  }

  const nodeModulesDir = join(workpieceDir, "node_modules");
  if (!existsSync(nodeModulesDir)) {
    diagnostics.push({
      ruleId: "PNPM-STORE-02",
      severity: "error",
      message: `node_modules not found in workpiece: ${nodeModulesDir}.`,
      fixHint: "Run `pnpm install` in the workpiece before running the build pipeline.",
    });
    return diagnosticsResult(COMMAND, diagnostics) as KernelCommandResult<PnpmStoreHealthCheckData>;
  }

  try {
    execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
      cwd: workpieceDir,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: string }).stderr ?? "";

    if (
      message.includes("ERR_PNPM_MISSING_PACKAGE_INDEX_FILE") ||
      stderr.includes("ERR_PNPM_MISSING_PACKAGE_INDEX_FILE")
    ) {
      diagnostics.push({
        ruleId: "PNPM-STORE-03",
        severity: "error",
        message: `pnpm store index is corrupted (ERR_PNPM_MISSING_PACKAGE_INDEX_FILE). The store has stale package references that pnpm install cannot self-heal.`,
        fixHint: "Run: rm -rf node_modules && pnpm install --no-frozen-lockfile",
      });
    } else {
      diagnostics.push({
        ruleId: "PNPM-STORE-04",
        severity: "warning",
        message: `pnpm licenses list failed: ${message}`,
        fixHint: "Check pnpm installation and workpiece dependencies.",
      });
    }
  }

  const result = diagnosticsResult(COMMAND, diagnostics);
  const data: PnpmStoreHealthCheckData = {
    command: COMMAND,
    status: result.data?.status ?? "pass",
    diagnostics: result.data?.diagnostics ?? [],
    summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
    site: site ?? "",
    healthy: result.exitCode === 0,
  };

  return {
    data,
    exitCode: result.exitCode,
    summary: result.summary,
  };
}
