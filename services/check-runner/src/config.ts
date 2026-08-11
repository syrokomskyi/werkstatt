/*
<MODULE_CONTRACT>
<purpose>Load Check Warpgogol runner service filesystem paths and polling configuration from environment variables.</purpose>
<non-goals>
  <item>Do not validate target URLs or run artifacts; this module only resolves runner-local configuration.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0365: services source files participate in the Compass source-markup contract.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { findWorkspaceRoot } from "@warpgogol/werkstatt-site/check-core";

export interface RunnerConfig {
  workspaceRoot: string;
  checkRoot: string;
  queueDir: string;
  runsDir: string;
  pollMs: number;
}

export function loadRunnerConfig(): RunnerConfig {
  const workspaceRoot = findWorkspaceRoot(process.env.CHECK_WEBGOGOL_WORKSPACE_ROOT);
  const checkRoot = process.env.CHECK_WEBGOGOL_ROOT ?? join(workspaceRoot, ".check-warpgogol");
  return {
    workspaceRoot,
    checkRoot,
    queueDir: join(checkRoot, "queue"),
    runsDir: join(checkRoot, "runs"),
    pollMs: Number(process.env.CHECK_WEBGOGOL_POLL_MS ?? 1500),
  };
}
