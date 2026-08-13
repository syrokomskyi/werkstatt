/*
<MODULE_CONTRACT>
<purpose>RFC-0825: Testing module — registers service.smoke.run and site.smoke.run
kernel commands. Delegates to the smoke runner in smoke/smoke-runner.ts.</purpose>
<keywords>smoke, testing, module, kernel, commands</keywords>
<responsibilities>
  <item>Registers service.smoke.run and site.smoke.run commands.</item>
  <item>Resolves YAML definition file paths relative to this module.</item>
  <item>Returns structured SmokeRunResult via KernelCommandResult.data.</item>
</responsibilities>
<non-goals>
  <item>Do not implement fetch logic — that lives in smoke-runner.ts.</item>
  <item>Do not integrate with deployment pipelines — that lives in leitstand commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0825: initial testing module with smoke test commands.</item>
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
import { runSmokeChecks, SmokeConfigNotFoundError, SmokeEntryNotFoundError } from "./smoke/smoke-runner.ts";
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
        description:
          "Run post-deploy smoke tests for a site (RFC-0825). Flags: --site, --url.",
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
    },
  };
}
