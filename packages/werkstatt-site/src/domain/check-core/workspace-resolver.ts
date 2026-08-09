/*
<MODULE_CONTRACT>
<purpose>
  FS-aware workspace root resolution for the check-warpgogol ecosystem.
  Extracted from run-paths.ts so that the pure path helpers remain
  free of node:fs and process.cwd dependencies.
</purpose>
<non-goals>
  <item>Do not define pure path construction helpers here — those stay in run-paths.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract findWorkspaceRoot from run-paths.ts into workspace-resolver.ts.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

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
