/*
<MODULE_CONTRACT>
<purpose>RFC-0825 + RFC-0826 + RFC-0828: Testing module — registers service.smoke.run,
site.smoke.run, service.integration.run, and site.e2e.run kernel commands. Delegates to the
smoke runner, integration runner, and E2E runner.</purpose>
<keywords>smoke, integration, e2e, testing, module, kernel, commands</keywords>
<responsibilities>
  <item>Registers service.smoke.run, site.smoke.run, service.integration.run, and site.e2e.run commands.</item>
  <item>Resolves YAML definition file paths relative to this module.</item>
  <item>Returns structured SmokeRunResult / IntegrationRunResult / SiteE2eRunResult via KernelCommandResult.data.</item>
</responsibilities>
<non-goals>
  <item>Do not implement fetch logic — that lives in smoke-runner.ts.</item>
  <item>Do not implement vitest spawning — that lives in integration-runner.ts.</item>
  <item>Do not implement Playwright spawning — that lives in e2e/run-e2e-tests.ts.</item>
  <item>Do not integrate with deployment pipelines — that lives in leitstand commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0825: initial testing module with smoke test commands.</item>
  <item>RFC-0826: added service.integration.run command for vitest-based integration tests.</item>
  <item>RFC-0828: added site.e2e.run command for Playwright E2E tests against dev channel.</item>
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
        },
        reads: ["packages/werkstatt-site/src/testing/e2e/*.test.ts"],
        execute: runSiteE2e,
      } satisfies KernelCommandDefinition<SiteE2eRunResult>);
    },
  };
}
