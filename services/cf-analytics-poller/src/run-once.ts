/*
<MODULE_CONTRACT>
<purpose>One-shot poller runner — execute one cycle then exit (RFC-0343).</purpose>
<non-goals>
  <item>Do not implement polling internals; this entrypoint only wires pusher creation to one cycle.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { createPollerPusher } from "./pusher-factory.ts";
import { runPollCycle } from "./loop.ts";

async function main() {
  const pusher = createPollerPusher();
  if (!pusher) {
    console.error("[cf-analytics-poller] OTLP endpoint/token not configured — exiting");
    process.exitCode = 1;
    return;
  }

  const points = await runPollCycle(pusher);
  console.log(`[cf-analytics-poller] one-shot complete: ${points.length} metric points`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
