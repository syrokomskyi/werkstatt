/*
<MODULE_CONTRACT>
<purpose>Long-running Check Warpgogol service entrypoint that polls the local queue and executes runner jobs.</purpose>
<non-goals>
  <item>Do not implement check execution details here; job processing stays in run-once.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0365: services source files participate in the Compass source-markup contract.</item>
</CHANGE_SUMMARY>
*/

import { loadRunnerConfig } from "./config.ts";
import { runOnce } from "./run-once.ts";

const config = loadRunnerConfig();

async function loop(): Promise<void> {
  for (;;) {
    const didWork = await runOnce();
    if (!didWork) await new Promise((resolve) => setTimeout(resolve, config.pollMs));
  }
}

await loop();
