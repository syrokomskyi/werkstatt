/*
<MODULE_CONTRACT>
<purpose>observability.factory.smoke — send a test metric through the OTLP pipe to verify end-to-end delivery (RFC-0340).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0340: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { diagnosticsResult } from "@gogol/site-kernel-checks";
import { createMetricsPusher, METRIC_REFS } from "@gogol/observability";

export async function runObservabilityFactorySmoke(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const pusher = createMetricsPusher({
    serviceName: "site-kernel",
    layer: "factory",
    environment: undefined,
  });

  if (!pusher) {
    return diagnosticsResult("observability.factory.smoke", [
      {
        ruleId: "OBS-FACTORY-SMOKE",
        severity: "info",
        file: "",
        message:
          "WGOGOL_OTLP_ENDPOINT and/or WGOGOL_OTLP_TOKEN are not set — smoke test skipped (no-op).",
        fixHint:
          "Set both env vars to enable the smoke test: WGOGOL_OTLP_ENDPOINT=https://ingest.observe.webgogol.com WGOGOL_OTLP_TOKEN=<token>",
      },
    ]);
  }

  METRIC_REFS.wgogol_factory_smoke_total.add(pusher, 1);

  const result = await pusher.flush();

  if (result.delivered) {
    return diagnosticsResult("observability.factory.smoke", [
      {
        ruleId: "OBS-FACTORY-SMOKE",
        severity: "info",
        file: "",
        message: "Smoke metric delivered successfully to the OTLP endpoint.",
        fixHint: "",
      },
    ]);
  }

  return diagnosticsResult("observability.factory.smoke", [
    {
      ruleId: "OBS-FACTORY-SMOKE",
      severity: "error",
      file: "",
      message: `Smoke metric delivery failed: ${result.reason ?? "unknown error"}`,
      fixHint:
        "Check that the OTLP endpoint is reachable and the token is valid. See services/observability-stack/README.md for the runbook.",
    },
  ]);
}
