/*
<MODULE_CONTRACT>
<purpose>RFC-0074 agent readiness audit validator: checks built HTML and machine-readable artifacts for key business facts.</purpose>
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
import { buildAuditResult, getAuditPageInfo, loadAuditAppContext } from "../helpers.ts";
import type { AuditFinding } from "../types.ts";
import { pathExists } from "../../content-discipline.ts";
import {
  collectRenderedHtml,
  finding,
  getRoutePathForHtml,
  hasMeaningfulPrimaryCta,
  hasVisibleMainHeading,
  isHtmlRedirectPage,
} from "./helpers.ts";

export async function runAuditAgentReadinessValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: AuditFinding[] = [];
  const publicPaths = ["llms.txt", "llms-full.txt", "ai.txt"];
  for (const file of publicPaths) {
    if (!(await pathExists(join(audit.publicDirectory, file)))) {
      findings.push(
        finding({
          ruleId: `agent-readiness.missing-${file}`,
          severity: "error",
          file: `public/${file}`,
          message: `${file} is required for agent readiness validation.`,
          evidence: [{ kind: "config", file: `public/${file}` }],
        }),
      );
    }
  }

  const htmlFiles = await collectRenderedHtml(audit.distDirectory);
  if (htmlFiles.length === 0) {
    findings.push(
      finding({
        ruleId: "agent-readiness.missing-dist",
        severity: "error",
        file: audit.distDirectory,
        message:
          "dist/ HTML files not found; build the app before running audit.agent.readiness.validate.",
        evidence: [{ kind: "runtime", file: audit.distDirectory }],
      }),
    );
  }

  for (const page of htmlFiles) {
    if (isHtmlRedirectPage(page.html)) {
      continue;
    }
    const routePath = getRoutePathForHtml(audit.distDirectory, page.file, page.html);
    const pageInfo = getAuditPageInfo(audit.systemManifest, routePath);

    if (!hasVisibleMainHeading(page.html) && !pageInfo?.isLegal && !pageInfo?.isUtility) {
      findings.push(
        finding({
          ruleId: "agent-readiness.h1-required",
          severity: "error",
          file: page.file,
          message: "Rendered page is missing an H1 element.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
    if (!/<title>.+<\/title>/i.test(page.html)) {
      findings.push(
        finding({
          ruleId: "agent-readiness.title-required",
          severity: "error",
          file: page.file,
          message: "Rendered page is missing a <title> element.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
    const ctaIndex = page.html.search(/<a[^>]+href=["'][^"']+["'][^>]*>/i);
    if (
      pageInfo?.expectsTransactionalCta &&
      (!hasMeaningfulPrimaryCta(page.html) ||
        ctaIndex === -1 ||
        ctaIndex > audit.agentReadinessBaseline.maxBytesToCta)
    ) {
      findings.push(
        finding({
          ruleId: "agent-readiness.bytes-to-cta",
          severity: "warning",
          file: page.file,
          message: `Primary CTA not detected within ${audit.agentReadinessBaseline.maxBytesToCta} bytes from body start.`,
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
    if ((pageInfo?.requiresJsonLd ?? true) && !/application\/ld\+json/i.test(page.html)) {
      findings.push(
        finding({
          ruleId: "agent-readiness.jsonld-required",
          severity: pageInfo?.isLegal ? "warning" : "error",
          file: page.file,
          message: "Rendered page is missing JSON-LD.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
    if (
      pageInfo?.pageId === "donateContact" &&
      !/<form[\s>]/i.test(page.html) &&
      !/mailto:|tel:|contact/i.test(page.html)
    ) {
      findings.push(
        finding({
          ruleId: "agent-readiness.contact-form-required",
          severity: "warning",
          file: page.file,
          message: "Contact or donation page has no rendered form.",
          evidence: [{ kind: "rendered", file: page.file }],
        }),
      );
    }
  }

  const result = buildAuditResult({
    command: "audit.agent.readiness.validate",
    app: audit.siteName,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `audit.agent.readiness.validate: ${result.status}`,
  };
}
