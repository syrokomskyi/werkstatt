/*
<MODULE_CONTRACT>
<purpose>One-shot probe cycle runner — execute one full cycle then exit (RFC-0341).</purpose>
<non-goals>
  <item>Do not implement scheduler loops or individual probe mechanics in this entrypoint.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0341: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { createMetricsPusher } from "@gogol/observability";
import { runProbeCycle } from "./loop.ts";

async function main() {
  const pusher = createMetricsPusher({
    serviceName: "fleet-probe-runner",
    layer: "probe",
    environment: "production",
  });

  const observations = await runProbeCycle(pusher);
  const up = observations.filter((o) => o.up === 1).length;
  const total = observations.length;
  console.log(`[fleet-probe] cycle complete: ${up}/${total} targets up`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
