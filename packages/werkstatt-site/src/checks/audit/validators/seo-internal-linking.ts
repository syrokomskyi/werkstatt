/*
<MODULE_CONTRACT>
<purpose>RFC-0074 SEO internal linking audit validator: checks linking-plan constraints against built HTML links.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { AuditFinding } from "../types.ts";
import { pathExists } from "../../content-discipline.ts";
import { collectRenderedHtml, finding, parseYaml } from "./helpers.ts";

export async function runSeoInternalLinkingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: AuditFinding[] = [];
  const linkingPlanPath = join(audit.onboardingComposeDirectory, "linking-plan.yaml");
  const linkingPlan = (await pathExists(linkingPlanPath))
    ? (parseYaml(await readFile(linkingPlanPath, "utf8")) as Record<string, unknown>)
    : null;
  if (!linkingPlan) {
    findings.push(
      finding({
        ruleId: "seo-internal-linking.missing-plan",
        severity: "info",
        file: linkingPlanPath,
        message:
          "linking-plan.yaml is missing; onboarding.phase.validate owns required compose artifact enforcement.",
        evidence: [{ kind: "config", file: linkingPlanPath }],
      }),
    );
  }

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  const inboundCounts = new Map<string, number>();
  for (const html of htmlFiles) {
    for (const match of html.html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi)) {
      const href = match[1];
      if (href.startsWith("/")) inboundCounts.set(href, (inboundCounts.get(href) ?? 0) + 1);
    }
  }
  const keyPages = (linkingPlan?.keyPages as Array<Record<string, unknown>> | undefined) ?? [];
  for (const page of keyPages) {
    const path = String(page.path ?? "");
    const minimumInbound = Number(page.minimumInbound ?? 1);
    if (path && (inboundCounts.get(path) ?? 0) < minimumInbound) {
      findings.push(
        finding({
          ruleId: "seo-internal-linking.inbound-threshold",
          severity: "warning",
          file: linkingPlanPath,
          message: `Key page ${path} has ${inboundCounts.get(path) ?? 0} inbound links; expected at least ${minimumInbound}.`,
          evidence: [{ kind: "config", file: linkingPlanPath, snippet: path }],
        }),
      );
    }
  }

  const result = buildAuditResult({
    command: "seo.internal-linking.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `seo.internal-linking.validate: ${result.status}`,
  };
}
