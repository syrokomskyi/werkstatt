/*
<MODULE_CONTRACT>
<purpose>
  Centralized run-path construction for the check-webgogol ecosystem.
  Eliminates hardcoded ".check-webgogol/runs/<runId>" path duplication
  across OS commands and the runner service.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Introduced shared run-path helpers to centralize workspace-relative path construction.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";

const CHECK_WEBGOGOL_ROOT = ".check-webgogol";
const RUNS_SUBDIR = "runs";

export function runRelDir(runId: string): string {
  return posix.join(CHECK_WEBGOGOL_ROOT, RUNS_SUBDIR, runId);
}

export function runRelPath(runId: string, fileName: string): string {
  return posix.join(runRelDir(runId), fileName);
}

export function screenshotsRelDir(runId: string): string {
  return posix.join(runRelDir(runId), "screenshots");
}

export function logsRelDir(runId: string): string {
  return posix.join(runRelDir(runId), "logs");
}

export function findWorkspaceRoot(configuredRoot?: string): string {
  if (configuredRoot && configuredRoot.length > 0) return configuredRoot;
  let current = process.cwd();
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}
