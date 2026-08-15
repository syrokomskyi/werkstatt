/*
<MODULE_CONTRACT>
<purpose>RFC-0074 infra brief audit validator: checks infra brief against wrangler/workflow surfaces.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { pathExists } from "../../content-discipline.ts";
import { finding } from "./helpers.ts";

export async function runInfraBriefValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];
  const infraPath = join(audit.onboardingScaffoldDirectory, "infra-config.yaml");
  const wranglerPath = join(audit.appDirectory, "wrangler.jsonc");
  const workflowDir = join(audit.appDirectory, "..", "..", ".github", "workflows");
  if (!(await pathExists(infraPath))) {
    findings.push(
      finding({
        ruleId: "infra-brief.missing-config",
        severity: "info",
        file: infraPath,
        message:
          "infra-config.yaml is missing; onboarding.phase.validate owns required scaffold artifact enforcement.",
        evidence: [{ kind: "config", file: infraPath }],
      }),
    );
  }
  if (!(await pathExists(wranglerPath))) {
    findings.push(
      finding({
        ruleId: "infra-brief.missing-wrangler",
        severity: "warning",
        file: wranglerPath,
        message: "wrangler.jsonc is missing.",
        evidence: [{ kind: "config", file: wranglerPath }],
      }),
    );
  }
  if (!(await pathExists(workflowDir))) {
    findings.push(
      finding({
        ruleId: "infra-brief.missing-workflows",
        severity: "warning",
        file: ".github/workflows",
        message: ".github/workflows directory is missing.",
        evidence: [{ kind: "config", file: ".github/workflows" }],
      }),
    );
  }
  const result = buildAuditResult({
    command: "infra.brief.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `infra.brief.validate: ${result.status}`,
  };
}
