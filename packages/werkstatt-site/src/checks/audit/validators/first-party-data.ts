/*
<MODULE_CONTRACT>
<purpose>RFC-0074 first-party data audit validator: checks built forms against first-party-data strategy.</purpose>
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
import type { Diagnostic } from "../types.ts";
import { pathExists } from "../../content-discipline.ts";
import { collectRenderedHtml, extractMetaContent, finding, parseYaml } from "./helpers.ts";

export async function runFirstPartyDataValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];
  const strategyPath = join(audit.onboardingAuthorDirectory, "first-party-data.yaml");
  if (!(await pathExists(strategyPath))) {
    findings.push(
      finding({
        ruleId: "FIRST-PARTY-DATA.MISSING-STRATEGY",
        severity: "info",
        file: strategyPath,
        message:
          "first-party-data.yaml is missing; onboarding.phase.validate owns required author artifact enforcement.",
        evidence: [{ kind: "config", file: strategyPath }],
      }),
    );
  }
  const strategy = (await pathExists(strategyPath))
    ? (parseYaml(await readFile(strategyPath, "utf8")) as Record<string, unknown>)
    : {};
  const fields = Array.isArray(strategy.fields)
    ? (strategy.fields as Record<string, unknown>[])
    : [];
  const allowedFields = new Set<string>(
    fields.map((field) => String(field.name ?? field.id ?? field)),
  );
  const consent = (strategy.consent ?? {}) as Record<string, unknown>;
  const consentRequired = consent.required !== false;
  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  for (const html of htmlFiles) {
    // Skip noindex pages — they are not public-facing and tool pages (e.g.
    // check.astro) may have form fields that are tool parameters, not PII.
    const robots = extractMetaContent(html.html, "robots", "name") ?? "";
    if (/noindex/i.test(robots)) continue;
    for (const match of html.html.matchAll(
      /<(input|textarea|select)[^>]+name=["']([^"']+)["'][^>]*>/gi,
    )) {
      const name = match[2];
      if (allowedFields.size > 0 && !allowedFields.has(name)) {
        findings.push(
          finding({
            ruleId: "FIRST-PARTY-DATA.UNDECLARED-FIELD",
            severity: "error",
            file: html.file,
            message: `Rendered form field ${name} is not declared in first-party-data.yaml.`,
            evidence: [{ kind: "rendered", file: html.file, snippet: name }],
          }),
        );
      }
    }
    if (consentRequired && /<form[\s>]/i.test(html.html) && !/consent/i.test(html.html)) {
      findings.push(
        finding({
          ruleId: "FIRST-PARTY-DATA.MISSING-CONSENT-TEXT",
          severity: "warning",
          file: html.file,
          message: "Rendered form does not appear to include consent text.",
          evidence: [{ kind: "rendered", file: html.file }],
        }),
      );
    }
  }
  const result = buildAuditResult({
    command: "first-party-data.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `first-party-data.validate: ${result.status}`,
  };
}
