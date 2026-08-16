/*
<MODULE_CONTRACT>
<purpose>RFC-0074 analytics config audit validator: checks system.md growth config against distilled analytics config.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from audit-validators.ts as part of the domain split.</item>
  <item>RFC-0847: add analytics-config.proxy-subdomain-registered check — cross-references proxyBaseUrl hostname against services/registry.yaml subdomains.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { readServicesRegistry } from "@warpgogol/werkstatt/sternsystem";
import { buildAuditResult, loadAuditAppContext } from "../helpers.ts";
import type { Diagnostic } from "../types.ts";
import { pathExists } from "../../content-discipline.ts";
import {
  finding,
  isProductionMatomo,
  loadMatomoFleetRegistry,
  MATOMO_REGISTRY_PATH,
  parseYaml,
} from "./helpers.ts";

export function extractProxyHostname(proxyBaseUrl: string): string | null {
  try {
    const parsed = new URL(proxyBaseUrl);
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function isDevHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".workers.dev");
}

export function isProxySubdomainRegistered(
  proxyBaseUrl: string,
  registeredDomains: string[],
): boolean {
  const hostname = extractProxyHostname(proxyBaseUrl);
  if (!hostname || isDevHostname(hostname)) return true;
  return registeredDomains.includes(hostname);
}

export async function runAnalyticsConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const started = Date.now();
  const audit = await loadAuditAppContext(context);
  const findings: Diagnostic[] = [];
  const analyticsConfigPath = join(audit.onboardingComposeDirectory, "analytics-config.yaml");
  if (!(await pathExists(analyticsConfigPath))) {
    findings.push(
      finding({
        ruleId: "ANALYTICS-CONFIG.MISSING-CONFIG",
        severity: "info",
        file: analyticsConfigPath,
        message:
          "analytics-config.yaml is missing; onboarding.phase.validate owns required compose artifact enforcement.",
        evidence: [{ kind: "config", file: analyticsConfigPath }],
      }),
    );
  } else {
    const analyticsConfig = parseYaml(await readFile(analyticsConfigPath, "utf8")) as Record<
      string,
      Record<string, unknown>
    >;
    const growth = (audit.systemManifest.growth ?? {}) as Record<string, Record<string, unknown>>;
    const expectedAdapter = analyticsConfig.vendor?.adapter ?? analyticsConfig.adapter;
    const actualAdapter = growth.vendor?.adapter;
    if (expectedAdapter !== undefined && expectedAdapter !== actualAdapter) {
      findings.push(
        finding({
          ruleId: "ANALYTICS-CONFIG.VENDOR-ADAPTER",
          severity: "error",
          file: analyticsConfigPath,
          message: `growth.vendor.adapter=${String(actualAdapter)} does not match analytics-config adapter ${String(expectedAdapter)}.`,
          evidence: [{ kind: "config", file: analyticsConfigPath }],
        }),
      );
    }
  }
  const growth = (audit.systemManifest.growth ?? {}) as Record<string, Record<string, unknown>>;
  if (isProductionMatomo(growth)) {
    const options = (growth.vendor?.options ?? {}) as Record<string, string>;
    for (const legacyKey of ["url", "cookieless"]) {
      if (options[legacyKey] !== undefined) {
        findings.push(
          finding({
            ruleId: "ANALYTICS-CONFIG.MATOMO-LEGACY-OPTION",
            severity: "error",
            file: "src/content/system.md",
            message: `growth.vendor.options.${legacyKey} is RFC-0170 legacy and forbidden by RFC-0305.`,
            evidence: [{ kind: "config", file: "src/content/system.md", snippet: legacyKey }],
          }),
        );
      }
    }

    for (const required of [
      "proxyBaseUrl",
      "siteId",
      "productionHost",
      "clientId",
      "siteType",
      "messkanonVersion",
      "privacyProfile",
      "consentLevel",
    ]) {
      if (!options[required]) {
        findings.push(
          finding({
            ruleId: "ANALYTICS-CONFIG.MATOMO-REQUIRED-OPTION",
            severity: "error",
            file: "src/content/system.md",
            message: `Matomo production tracking requires growth.vendor.options.${required} (RFC-0305).`,
            evidence: [{ kind: "config", file: "src/content/system.md", snippet: required }],
          }),
        );
      }
    }

    if (options["proxyBaseUrl"] && !options["proxyBaseUrl"].includes("/_wg/analytics/")) {
      findings.push(
        finding({
          ruleId: "ANALYTICS-CONFIG.MATOMO-PROXY-ROUTE",
          severity: "error",
          file: "src/content/system.md",
          message: "Matomo proxyBaseUrl must route through /_wg/analytics/ (RFC-0305).",
          evidence: [
            { kind: "config", file: "src/content/system.md", snippet: options["proxyBaseUrl"] },
          ],
        }),
      );
    }

    // RFC-0847: cross-reference proxyBaseUrl hostname against services/registry.yaml subdomains
    if (options["proxyBaseUrl"]) {
      try {
        const registry = await readServicesRegistry(context.workspaceRoot);
        const allSubdomainDomains = registry.services.flatMap(
          (s) => s.subdomains?.map((sd) => sd.domain) ?? [],
        );
        if (!isProxySubdomainRegistered(options["proxyBaseUrl"], allSubdomainDomains)) {
          const hostname = extractProxyHostname(options["proxyBaseUrl"]);
          findings.push(
            finding({
              ruleId: "ANALYTICS-CONFIG.PROXY-SUBDOMAIN-REGISTERED",
              severity: "error",
              file: "services/registry.yaml",
              message: `proxyBaseUrl hostname '${hostname}' is not declared in any service subdomains in services/registry.yaml (RFC-0847). Add it to the corresponding service's subdomains array so subdomain.register can provision DNS and Workers Route.`,
              evidence: [
                { kind: "config", file: "src/content/system.md", snippet: options["proxyBaseUrl"] },
                { kind: "config", file: "services/registry.yaml", snippet: hostname ?? undefined },
              ],
            }),
          );
        }
      } catch {
        // Non-fatal: skip if registry cannot be read
      }
    }
    if (options["privacyProfile"] && options["privacyProfile"] !== "bannerfrei-v1") {
      findings.push(
        finding({
          ruleId: "ANALYTICS-CONFIG.MATOMO-PRIVACY-PROFILE",
          severity: "error",
          file: "src/content/system.md",
          message: "Matomo production tracking requires privacyProfile=bannerfrei-v1 (RFC-0305).",
          evidence: [
            { kind: "config", file: "src/content/system.md", snippet: options["privacyProfile"] },
          ],
        }),
      );
    }

    const registry = await loadMatomoFleetRegistry(context.workspaceRoot);
    const registryRecord = registry.find(
      (site) =>
        site?.appId === audit.siteName ||
        (options["clientId"] && site?.clientSemanticId === options["clientId"]),
    );
    if (!registryRecord) {
      findings.push(
        finding({
          ruleId: "ANALYTICS-CONFIG.MATOMO-REGISTRY-RECORD",
          severity: "error",
          file: MATOMO_REGISTRY_PATH,
          message: `Production Matomo app ${audit.siteName} has no fleet registry record (RFC-0305).`,
          evidence: [{ kind: "config", file: MATOMO_REGISTRY_PATH }],
        }),
      );
    }
  }
  const result = buildAuditResult({
    command: "analytics.config.validate",
    app: audit.siteName,
    workspaceRoot: audit.workspaceRoot,
    findings,
    runtimeMs: Date.now() - started,
  });
  return {
    data: result,
    exitCode: result.status === "fail" ? 1 : 0,
    summary: `analytics.config.validate: ${result.status}`,
  };
}
