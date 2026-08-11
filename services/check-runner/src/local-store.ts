/*
<MODULE_CONTRACT>
<purpose>Filesystem-backed queue and status store for the Check Warpgogol runner service workspace.</purpose>
<non-goals>
  <item>Do not perform browser capture or report generation; this module only claims, persists, and completes local jobs.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0365: services source files participate in the Compass source-markup contract.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readFile, rename, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseCheckRunRequest,
  type CheckRunRequest,
  type CheckRunStatus,
} from "@warpgogol/werkstatt-site/check-core";
import type { RunnerConfig } from "./config.ts";

export async function ensureStore(config: RunnerConfig): Promise<void> {
  await mkdir(config.queueDir, { recursive: true });
  await mkdir(config.runsDir, { recursive: true });
}

export async function claimNextRequest(config: RunnerConfig): Promise<CheckRunRequest | undefined> {
  await ensureStore(config);
  const entries = (await readdir(config.queueDir)).filter((entry) =>
    entry.endsWith(".request.json"),
  );
  entries.sort();
  for (const entry of entries) {
    const queued = join(config.queueDir, entry);
    const claimed = join(config.queueDir, `${entry}.running`);
    try {
      await rename(queued, claimed);
      const request = parseCheckRunRequest(JSON.parse(await readFile(claimed, "utf8")));
      const runDir = join(config.runsDir, request.runId);
      await mkdir(runDir, { recursive: true });
      await writeFile(join(runDir, "request.json"), `${JSON.stringify(request, null, 2)}\n`);
      return request;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function writeStatus(config: RunnerConfig, status: CheckRunStatus): Promise<void> {
  const runDir = join(config.runsDir, status.runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "status.json"), `${JSON.stringify(status, null, 2)}\n`);
}

export async function completeRequest(
  config: RunnerConfig,
  request: CheckRunRequest,
): Promise<void> {
  await unlink(join(config.queueDir, `${request.runId}.request.json.running`)).catch(
    () => undefined,
  );
}
