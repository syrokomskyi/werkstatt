/*
<MODULE_CONTRACT>
<purpose>RFC-0825 + RFC-0826 + RFC-0828 + RFC-0829: Testing module — registers service.smoke.run,
site.smoke.run, service.integration.run, site.e2e.run, test.evidence.verify, and test.evidence.list
kernel commands. Delegates to the smoke runner, integration runner, E2E runner, and test-evidence module.</purpose>
<keywords>smoke, integration, e2e, testing, module, kernel, commands, evidence</keywords>
<responsibilities>
  <item>Registers service.smoke.run, site.smoke.run, service.integration.run, site.e2e.run commands.</item>
  <item>Registers test.evidence.verify and test.evidence.list commands (RFC-0829).</item>
  <item>Resolves YAML definition file paths relative to this module.</item>
  <item>Returns structured SmokeRunResult / IntegrationRunResult / SiteE2eRunResult / TestEvidenceVerifyResult / TestEvidenceListResult via KernelCommandResult.data.</item>
</responsibilities>
<non-goals>
  <item>Do not implement fetch logic — that lives in smoke-runner.ts.</item>
  <item>Do not implement vitest spawning — that lives in integration-runner.ts.</item>
  <item>Do not implement Playwright spawning — that lives in e2e/run-e2e-tests.ts.</item>
  <item>Do not implement evidence storage logic — that lives in test-evidence.ts.</item>
  <item>Do not integrate with deployment pipelines — that lives in leitstand commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0825: initial testing module with smoke test commands.</item>
  <item>RFC-0826: added service.integration.run command for vitest-based integration tests.</item>
  <item>RFC-0828: added site.e2e.run command for Playwright E2E tests against dev channel.</item>
  <item>RFC-0829: added test.evidence.verify and test.evidence.list commands.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandDefinition,
  KernelCommandInput,
  KernelCommandResult,
  KernelModule,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { SmokeRunResult } from "@warpgogol/werkstatt/testing/smoke";
import type { IntegrationRunResult } from "@warpgogol/werkstatt/testing/integration";
import type { SiteE2eRunResult } from "@warpgogol/werkstatt/testing/e2e";
import type {
  TestEvidenceVerifyResult,
  TestEvidenceListResult,
  TestEvidence,
} from "./test-evidence.ts";
import { verifyTestEvidence, listTestEvidence, recordTestEvidence } from "./test-evidence.ts";
import {
  runSmokeChecks,
  SmokeConfigNotFoundError,
  SmokeEntryNotFoundError,
} from "./smoke/smoke-runner.ts";
import {
  runServiceIntegrationTests,
  IntegrationTestDirNotFoundError,
} from "./integration/integration-runner.ts";
import { runSiteE2eTests, ChromiumNotInstalledError } from "./e2e/run-e2e-tests.ts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const serviceSmokeYamlPath = join(moduleDir, "smoke", "service-smoke.yaml");
const siteSmokeYamlPath = join(moduleDir, "smoke", "site-smoke.yaml");

async function runServiceSmoke(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SmokeRunResult>> {
  const service = input.flags.service as string | undefined;
  const url = input.flags.url as string | undefined;

  if (!service) {
    return {
      exitCode: 1,
      summary: "service.smoke.run: --service is required",
    };
  }
  if (!url) {
    return {
      exitCode: 1,
      summary: "service.smoke.run: --url is required",
    };
  }

  const commitSha = input.flags["commit-sha"] as string | undefined;

  context.logger.info(`[service.smoke.run] running smoke tests for ${service} against ${url}…`);

  try {
    const result = await runSmokeChecks({
      service,
      url,
      yamlPath: serviceSmokeYamlPath,
      command: "service.smoke.run",
      json: input.flags.json === true,
    });

    const failed = result.checks.filter((c) => !c.passed);
    context.logger.info(
      `[service.smoke.run] ${result.status === "pass" ? "all passed" : `${failed.length} check(s) failed`} (${result.durationMs}ms)`,
    );

    if (commitSha) {
      try {
        const evidence: TestEvidence = {
          testRunId: `service-smoke-${service}-${Date.now()}`,
          level: "L5",
          targetId: service,
          commitSha,
          passed: result.status === "pass",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
          failures: failed.map((c) => ({
            testName: `${c.method} ${c.path}`,
            message: c.error ?? "failed",
            file: c.path,
          })),
        };
        await recordTestEvidence(context.workspaceRoot, service, evidence, { service });
        context.logger.info(
          `[service.smoke.run] recorded L5 evidence for ${service} (commit ${commitSha})`,
        );
      } catch (err) {
        context.logger.warn(
          `[service.smoke.run] failed to record evidence: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      data: result,
      exitCode: result.status === "pass" ? 0 : 1,
      summary:
        result.status === "pass"
          ? `service.smoke.run: ${result.checks.length} check(s) passed`
          : `service.smoke.run: ${failed.length}/${result.checks.length} check(s) failed`,
    };
  } catch (err) {
    if (err instanceof SmokeConfigNotFoundError) {
      context.logger.warn(`[service.smoke.run] ${err.message}`);
      return {
        exitCode: 0,
        summary: `service.smoke.run: skipped (no smoke config)`,
      };
    }
    if (err instanceof SmokeEntryNotFoundError) {
      context.logger.warn(`[service.smoke.run] ${err.message}`);
      return {
        exitCode: 0,
        summary: `service.smoke.run: skipped (no smoke config for ${service})`,
      };
    }
    throw err;
  }
}

async function runSiteSmoke(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SmokeRunResult>> {
  const site = (input.flags.site as string | undefined) ?? context.site?.name;
  const url = input.flags.url as string | undefined;

  if (!site) {
    return {
      exitCode: 1,
      summary: "site.smoke.run: --site is required",
    };
  }
  if (!url) {
    return {
      exitCode: 1,
      summary: "site.smoke.run: --url is required",
    };
  }

  const commitSha = input.flags["commit-sha"] as string | undefined;
  const releaseId = input.flags["release-id"] as string | undefined;

  context.logger.info(`[site.smoke.run] running smoke tests for ${site} against ${url}…`);

  try {
    const result = await runSmokeChecks({
      site,
      url,
      yamlPath: siteSmokeYamlPath,
      command: "site.smoke.run",
      json: input.flags.json === true,
    });

    const failed = result.checks.filter((c) => !c.passed);
    context.logger.info(
      `[site.smoke.run] ${result.status === "pass" ? "all passed" : `${failed.length} check(s) failed`} (${result.durationMs}ms)`,
    );

    if (commitSha) {
      try {
        const evidence: TestEvidence = {
          testRunId: `site-smoke-${site}-${Date.now()}`,
          level: "L5",
          targetId: site,
          commitSha,
          passed: result.status === "pass",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
          failures: failed.map((c) => ({
            testName: `${c.method} ${c.path}`,
            message: c.error ?? "failed",
            file: c.path,
          })),
        };
        await recordTestEvidence(context.workspaceRoot, site, evidence, { releaseId });
        context.logger.info(
          `[site.smoke.run] recorded L5 evidence for ${site} (commit ${commitSha})`,
        );
      } catch (err) {
        context.logger.warn(
          `[site.smoke.run] failed to record evidence: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      data: result,
      exitCode: result.status === "pass" ? 0 : 1,
      summary:
        result.status === "pass"
          ? `site.smoke.run: ${result.checks.length} check(s) passed`
          : `site.smoke.run: ${failed.length}/${result.checks.length} check(s) failed`,
    };
  } catch (err) {
    if (err instanceof SmokeConfigNotFoundError) {
      context.logger.warn(`[site.smoke.run] ${err.message}`);
      return {
        exitCode: 0,
        summary: `site.smoke.run: skipped (no smoke config)`,
      };
    }
    if (err instanceof SmokeEntryNotFoundError) {
      context.logger.warn(`[site.smoke.run] ${err.message}`);
      return {
        exitCode: 0,
        summary: `site.smoke.run: skipped (no smoke config for ${site})`,
      };
    }
    throw err;
  }
}

async function runServiceIntegration(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<IntegrationRunResult>> {
  const service = input.flags.service as string | undefined;
  const url = input.flags.url as string | undefined;

  if (!service) {
    return {
      exitCode: 1,
      summary: "service.integration.run: --service is required",
    };
  }
  if (!url) {
    return {
      exitCode: 1,
      summary: "service.integration.run: --url is required",
    };
  }

  const commitSha = input.flags["commit-sha"] as string | undefined;

  context.logger.info(
    `[service.integration.run] running integration tests for ${service} against ${url}…`,
  );

  try {
    const result = await runServiceIntegrationTests(
      service,
      context.workspaceRoot,
      url,
      context.logger,
    );

    if (result.status === "skipped") {
      return {
        data: result,
        exitCode: 0,
        summary: `service.integration.run: skipped (no integration tests for ${service})`,
      };
    }

    if (commitSha) {
      try {
        const evidence: TestEvidence = {
          testRunId: `service-integration-${service}-${Date.now()}`,
          level: "L2",
          targetId: service,
          commitSha,
          passed: result.status === "pass",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
          failures: [],
        };
        await recordTestEvidence(context.workspaceRoot, service, evidence, { service });
        context.logger.info(
          `[service.integration.run] recorded L2 evidence for ${service} (commit ${commitSha})`,
        );
      } catch (err) {
        context.logger.warn(
          `[service.integration.run] failed to record evidence: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      data: result,
      exitCode: result.status === "pass" ? 0 : 1,
      summary:
        result.status === "pass"
          ? `service.integration.run: ${result.summary.passed}/${result.summary.total} test(s) passed`
          : `service.integration.run: ${result.summary.failed}/${result.summary.total} test(s) failed`,
    };
  } catch (err) {
    if (err instanceof IntegrationTestDirNotFoundError) {
      context.logger.warn(`[service.integration.run] ${err.message}`);
      return {
        exitCode: 0,
        summary: `service.integration.run: skipped (no integration test directory for ${service})`,
      };
    }
    throw err;
  }
}

async function runSiteE2e(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SiteE2eRunResult>> {
  const site = (input.flags.site as string | undefined) ?? context.site?.name;
  const url = input.flags.url as string | undefined;

  if (!site) {
    return {
      exitCode: 1,
      summary: "site.e2e.run: --site is required",
    };
  }

  const commitSha = input.flags["commit-sha"] as string | undefined;
  const releaseId = input.flags["release-id"] as string | undefined;

  context.logger.info(
    `[site.e2e.run] running E2E tests for ${site}${url ? ` against ${url}` : " (resolving URL)"}…`,
  );

  try {
    const result = await runSiteE2eTests(site, context.workspaceRoot, url, context.logger);

    if (result.status === "skipped") {
      return {
        data: result,
        exitCode: 0,
        summary: `site.e2e.run: skipped (no E2E tests for ${site})`,
      };
    }

    if (commitSha) {
      try {
        const evidence: TestEvidence = {
          testRunId: `site-e2e-${site}-${Date.now()}`,
          level: "L4",
          targetId: site,
          commitSha,
          passed: result.status === "pass",
          durationMs: result.durationMs,
          timestamp: new Date().toISOString(),
          failures: result.failures ?? [],
        };
        await recordTestEvidence(context.workspaceRoot, site, evidence, { releaseId });
        context.logger.info(
          `[site.e2e.run] recorded L4 evidence for ${site} (commit ${commitSha})`,
        );
      } catch (err) {
        context.logger.warn(
          `[site.e2e.run] failed to record evidence: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      data: result,
      exitCode: result.status === "pass" ? 0 : 1,
      summary:
        result.status === "pass"
          ? `site.e2e.run: ${result.testsPassed} test(s) passed`
          : `site.e2e.run: ${result.testsFailed}/${result.testsPassed + result.testsFailed} test(s) failed`,
    };
  } catch (err) {
    if (err instanceof ChromiumNotInstalledError) {
      context.logger.warn(`[site.e2e.run] ${err.message}`);
      return {
        exitCode: 1,
        summary: `site.e2e.run: Chromium not installed — run \`pnpm exec playwright install chromium\``,
      };
    }
    throw err;
  }
}

async function runTestEvidenceVerify(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TestEvidenceVerifyResult>> {
  const target = (input.flags.target as string | undefined) ?? "";
  const service = input.flags.service as string | undefined;
  const releaseId = input.flags["release-id"] as string | undefined;
  const levelsStr = input.flags.levels as string | undefined;
  const commitSha = input.flags["commit-sha"] as string | undefined;

  const effectiveTarget = target || service || "";
  if (!effectiveTarget) {
    return {
      exitCode: 1,
      summary: "test.evidence.verify: --target or --service is required",
    };
  }
  if (!levelsStr) {
    return {
      exitCode: 1,
      summary: "test.evidence.verify: --levels is required (e.g. L4,L5)",
    };
  }
  if (!commitSha) {
    return {
      exitCode: 1,
      summary: "test.evidence.verify: --commit-sha is required",
    };
  }

  const levels = levelsStr
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

  context.logger.info(
    `[test.evidence.verify] verifying ${levels.join(",")} evidence for ${effectiveTarget} (commit ${commitSha})…`,
  );

  const result = await verifyTestEvidence(
    context.workspaceRoot,
    effectiveTarget,
    levels,
    commitSha,
    service ? { service } : { releaseId: releaseId ?? target },
  );

  context.logger.info(`[test.evidence.verify] ${result.summary}`);

  return {
    data: result,
    exitCode: result.status === "pass" ? 0 : 1,
    summary: result.summary,
  };
}

async function runTestEvidenceList(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TestEvidenceListResult>> {
  const target = (input.flags.target as string | undefined) ?? "";
  const service = input.flags.service as string | undefined;

  const effectiveTarget = target || service || "";
  if (!effectiveTarget) {
    return {
      exitCode: 1,
      summary: "test.evidence.list: --target or --service is required",
    };
  }

  context.logger.info(`[test.evidence.list] listing evidence for ${effectiveTarget}…`);

  const result = await listTestEvidence(
    context.workspaceRoot,
    effectiveTarget,
    service ? { service } : { releaseId: target },
  );

  context.logger.info(
    `[test.evidence.list] found ${result.evidence.length} evidence file(s) for ${effectiveTarget}`,
  );

  return {
    data: result,
    exitCode: 0,
    summary: `test.evidence.list: ${result.evidence.length} evidence file(s) for ${effectiveTarget}`,
  };
}

export function createTestingModule(): KernelModule {
  return {
    name: "testing",
    version: "0.1.0",
    async register(registry) {
      registry.registerCommand({
        name: "service.smoke.run",
        description:
          "Run post-deploy smoke tests for a service (RFC-0825). Flags: --service, --url.",
        scope: "workspace",
        supportsAllSites: false,
        cacheable: false,
        requiresNetwork: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from services/registry.yaml.",
          },
          url: {
            kind: "string",
            required: true,
            description: "Base URL to test against (e.g. https://example.workers.dev).",
          },
          "commit-sha": {
            kind: "string",
            required: false,
            description:
              "Commit SHA for evidence recording (RFC-0829). If provided, L5 evidence is recorded.",
          },
        },
        reads: ["packages/werkstatt-site/src/testing/smoke/service-smoke.yaml"],
        execute: runServiceSmoke,
      } satisfies KernelCommandDefinition<SmokeRunResult>);

      registry.registerCommand({
        name: "site.smoke.run",
        description: "Run post-deploy smoke tests for a site (RFC-0825). Flags: --site, --url.",
        scope: "workspace",
        supportsAllSites: false,
        cacheable: false,
        requiresNetwork: true,
        flags: {
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id.",
          },
          url: {
            kind: "string",
            required: true,
            description: "Base URL to test against (e.g. https://example.com).",
          },
          "commit-sha": {
            kind: "string",
            required: false,
            description:
              "Commit SHA for evidence recording (RFC-0829). If provided, L5 evidence is recorded.",
          },
          "release-id": {
            kind: "string",
            required: false,
            description:
              "Release id for evidence storage path (releases/<release-id>/.test-evidence/).",
          },
        },
        reads: ["packages/werkstatt-site/src/testing/smoke/site-smoke.yaml"],
        execute: runSiteSmoke,
      } satisfies KernelCommandDefinition<SmokeRunResult>);

      registry.registerCommand({
        name: "service.integration.run",
        description:
          "Run vitest-based integration tests for a service against a dev-deployed URL (RFC-0826). Flags: --service, --url.",
        scope: "workspace",
        supportsAllSites: false,
        cacheable: false,
        requiresNetwork: true,
        flags: {
          service: {
            kind: "string",
            required: true,
            description: "Service id from services/registry.yaml.",
          },
          url: {
            kind: "string",
            required: true,
            description: "Base URL of the dev-deployed Worker (e.g. https://example.workers.dev).",
          },
          "commit-sha": {
            kind: "string",
            required: false,
            description:
              "Commit SHA for evidence recording (RFC-0829). If provided, L2 evidence is recorded.",
          },
        },
        reads: [
          "packages/werkstatt-site/src/testing/integration/services/<service-id>/**/*.test.ts",
        ],
        execute: runServiceIntegration,
      } satisfies KernelCommandDefinition<IntegrationRunResult>);

      registry.registerCommand({
        name: "site.e2e.run",
        description:
          "Run Playwright E2E tests for a site against a dev-deployed URL (RFC-0828). " +
          "Flags: --site (required), --url (optional, resolved from fleet if not provided).",
        scope: "workspace",
        supportsAllSites: true,
        cacheable: false,
        requiresNetwork: true,
        longRunning: true,
        flags: {
          site: {
            kind: "string",
            required: true,
            description: "Sternsystem id.",
          },
          url: {
            kind: "string",
            required: false,
            description:
              "Base URL to test against (e.g. https://example.workers.dev). " +
              "If not provided, resolved from fleet/fleet.sites.yaml.",
          },
          "commit-sha": {
            kind: "string",
            required: false,
            description:
              "Commit SHA for evidence recording (RFC-0829). If provided, L4 evidence is recorded.",
          },
          "release-id": {
            kind: "string",
            required: false,
            description:
              "Release id for evidence storage path (releases/<release-id>/.test-evidence/).",
          },
        },
        reads: ["packages/werkstatt-site/src/testing/e2e/*.test.ts"],
        execute: runSiteE2e,
      } satisfies KernelCommandDefinition<SiteE2eRunResult>);

      registry.registerCommand({
        name: "test.evidence.verify",
        description:
          "Verify that test evidence exists and passed for a target (RFC-0829). " +
          "Flags: --target (site) or --service, --levels (e.g. L4,L5), --commit-sha.",
        scope: "workspace",
        supportsAllSites: false,
        cacheable: false,
        flags: {
          target: {
            kind: "string",
            required: false,
            description:
              "Site id (Sternsystem id). Used for site evidence (releases/<release-id>/.test-evidence/).",
          },
          service: {
            kind: "string",
            required: false,
            description:
              "Service id. Used for service evidence (services/<service-id>/.test-evidence/).",
          },
          levels: {
            kind: "string",
            required: true,
            description: "Comma-separated test levels to verify (e.g. L4,L5 for E2E+smoke).",
          },
          "commit-sha": {
            kind: "string",
            required: true,
            description: "Commit SHA that evidence must match.",
          },
          "release-id": {
            kind: "string",
            required: false,
            description:
              "Release id for evidence storage path (releases/<release-id>/.test-evidence/). Defaults to --target value.",
          },
        },
        reads: [
          "releases/<release-id>/.test-evidence/*.json",
          "services/<service-id>/.test-evidence/*.json",
        ],
        execute: runTestEvidenceVerify,
      } satisfies KernelCommandDefinition<TestEvidenceVerifyResult>);

      registry.registerCommand({
        name: "test.evidence.list",
        description:
          "List all test evidence files for a target (RFC-0829). " +
          "Flags: --target (site) or --service.",
        scope: "workspace",
        supportsAllSites: false,
        cacheable: false,
        flags: {
          target: {
            kind: "string",
            required: false,
            description: "Site id (Sternsystem id).",
          },
          service: {
            kind: "string",
            required: false,
            description: "Service id.",
          },
        },
        reads: [
          "releases/<release-id>/.test-evidence/*.json",
          "services/<service-id>/.test-evidence/*.json",
        ],
        execute: runTestEvidenceList,
      } satisfies KernelCommandDefinition<TestEvidenceListResult>);
    },
  };
}
