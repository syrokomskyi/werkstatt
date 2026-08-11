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
import { createMetricsPusher } from "@warpgogol/werkstatt-site/observability";

const config = loadRunnerConfig();

const pusher = createMetricsPusher(
  { serviceName: "check-runner", layer: "back", environment: "production" },
  { endpoint: process.env.WARPGOGOL_OTLP_ENDPOINT, token: process.env.WARPGOGOL_OTLP_TOKEN },
);

async function loop(): Promise<void> {
  for (;;) {
    let didWork = false;
    try {
      didWork = await runOnce();
      if (pusher) {
        pusher.gaugeSet("warpgogol_back_up", 1, { service: "check-runner" });
        pusher.counterAdd("warpgogol_back_last_run_total", 1, {
          service: "check-runner",
          status: "success",
        });
      }
    } catch (err) {
      console.error("[check-runner] error:", (err as Error).message);
      if (pusher) {
        pusher.gaugeSet("warpgogol_back_up", 0, { service: "check-runner" });
        pusher.counterAdd("warpgogol_back_last_run_total", 1, {
          service: "check-runner",
          status: "failure",
        });
        pusher.counterAdd("warpgogol_back_last_error_total", 1, { service: "check-runner" });
      }
    }
    if (pusher) {
      await pusher.flush();
    }
    if (!didWork) await new Promise((resolve) => setTimeout(resolve, config.pollMs));
  }
}

await loop();
