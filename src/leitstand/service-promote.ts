/*
<MODULE_CONTRACT>
<purpose>RFC-0806: leitstand.service.promote command handler — promotes a service
from dev to production (wrangler.jsonc) with pre-deploy gates, subdomain validation,
lock, wrangler deploy, health check, and prod state recording.</purpose>
<non-goals>
  <item>Do not deploy to dev — use leitstand.service.dev-deploy for that.</item>
  <item>Do not implement build verification — services have no build step.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0806: initial promote command handler (replaces leitstand.service.deploy).</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { existsSync } from "node:fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel";
import {
  readServicesRegistry,
  findServiceEntry,
} from "../sternsystem/registry-io.ts";
import {
  flagString,
  flagBoolean,
  generateOperationId,
  runWranglerDeploy,
  extractWorkersDevUrl,
  runHealthCheck,
  parseEnvFile,
  runPreDeployGates,
  acquireServiceLock,
  releaseServiceLock,
  recordProdDeployState,
  updateWorkersDevUrl,
  type ServicePromoteData,
  type KernelRuntimeContext,
} from "./service-deploy-helpers.ts";

export async function runLeitstandServicePromote(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ServicePromoteData>> {
  const { workspaceRoot, logger } = context;
  const serviceId = flagString(input, "service");
  const skipHealthCheck = flagBoolean(input, "skip-health-check");

  if (!serviceId) {
    throw new Error("[leitstand.service.promote] --service is required");
  }

  const operationId = generateOperationId();
  const startedAt = new Date().toISOString();

  const registry = await readServicesRegistry(workspaceRoot);
  const serviceEntry = findServiceEntry(registry, serviceId);
  if (!serviceEntry) {
    throw new Error(
      `[leitstand.service.promote] service '${serviceId}' not found in services/registry.yaml`,
    );
  }

  const serviceDir = path.join(workspaceRoot, "services", serviceId);
  if (!existsSync(serviceDir)) {
    throw new Error(`[leitstand.service.promote] services/${serviceId}/ does not exist`);
  }

  const wranglerPath = path.join(serviceDir, "wrangler.jsonc");
  if (!existsSync(wranglerPath)) {
    throw new Error(
      `[leitstand.service.promote] services/${serviceId}/wrangler.jsonc not found — not a Cloudflare Worker service`,
    );
  }

  await acquireServiceLock(workspaceRoot, serviceId, operationId, "leitstand.service.promote");

  try {
    // 1. Pre-deploy gates: service.naming.validate, service.registry.validate, services.check.run, deploy.preflight
    const gates = [
      { commandName: "service.naming.validate", argv: ["--service", serviceId] },
      { commandName: "service.registry.validate", argv: ["--service", serviceId] },
      { commandName: "services.check.run", argv: [] },
      { commandName: "deploy.preflight", argv: ["--service", serviceId] },
    ];

    const gateResults = await runPreDeployGates(workspaceRoot, gates, logger);
    const failedGate = gateResults.find((g) => !g.passed);
    if (failedGate) {
      const failedData: ServicePromoteData = {
        command: "leitstand.service.promote",
        serviceId,
        workerName: serviceEntry.workerName,
        deployState: "failed",
        workersDevUrl: serviceEntry.workersDevUrl ?? "",
        healthState: "unknown",
        preDeployGates: gateResults,
        startedAt,
        completedAt: new Date().toISOString(),
        operationId,
      };
      return {
        data: failedData,
        exitCode: 1,
        summary: `[leitstand.service.promote] ${serviceId}: pre-deploy gate '${failedGate.command}' failed — ${failedGate.summary}`,
      };
    }

    // 2. Subdomain validation (RFC-0752) — best-effort, skip if command not available
    if (serviceEntry.subdomains && serviceEntry.subdomains.length > 0) {
      logger.info(`[leitstand.service.promote] running subdomain.validate for ${serviceId}…`);
      try {
        const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");
        const subdomainResult = (await executeKernelCommand({
          workspaceRoot,
          commandName: "subdomain.validate",
          argv: ["--service", serviceId],
        })) as { exitCode: number; summary?: string };

        if (subdomainResult.exitCode !== 0) {
          logger.info(
            `[leitstand.service.promote] subdomain.validate reported missing subdomains — attempting subdomain.register…`,
          );
          const registerResult = (await executeKernelCommand({
            workspaceRoot,
            commandName: "subdomain.register",
            argv: ["--service", serviceId],
          })) as { exitCode: number; summary?: string };

          if (registerResult.exitCode !== 0) {
            const failedData: ServicePromoteData = {
              command: "leitstand.service.promote",
              serviceId,
              workerName: serviceEntry.workerName,
              deployState: "failed",
              workersDevUrl: serviceEntry.workersDevUrl ?? "",
              healthState: "unknown",
              preDeployGates: gateResults,
              startedAt,
              completedAt: new Date().toISOString(),
              operationId,
            };
            return {
              data: failedData,
              exitCode: 1,
              summary: `[leitstand.service.promote] ${serviceId}: subdomain.register failed — ${registerResult.summary ?? "unknown error"}`,
            };
          }
        }
      } catch {
        logger.warn(
          `[leitstand.service.promote] subdomain.validate not available — skipping subdomain validation`,
        );
      }
    }

    // 3. Read .env for secrets
    const envPath = path.join(serviceDir, ".env");
    const deployEnv = await parseEnvFile(envPath);

    // 4. Wrangler deploy with production config
    logger.info(
      `[leitstand.service.promote] deploying ${serviceEntry.workerName} to production via wrangler…`,
    );
    const wranglerResult = await runWranglerDeploy(serviceDir, "wrangler.jsonc", deployEnv);

    if (wranglerResult.exitCode !== 0) {
      await recordProdDeployState(workspaceRoot, serviceId, {
        at: new Date().toISOString(),
        state: "failed",
        operationId,
      });
      const failedData: ServicePromoteData = {
        command: "leitstand.service.promote",
        serviceId,
        workerName: serviceEntry.workerName,
        deployState: "failed",
        workersDevUrl: extractWorkersDevUrl(wranglerResult.stdout) ?? serviceEntry.workersDevUrl ?? "",
        healthState: "unknown",
        preDeployGates: gateResults,
        startedAt,
        completedAt: new Date().toISOString(),
        operationId,
      };
      return {
        data: failedData,
        exitCode: 1,
        summary: `[leitstand.service.promote] ${serviceId}: wrangler deploy failed — ${wranglerResult.stderr.slice(-200)}`,
      };
    }

    // 5. Resolve workersDevUrl
    const deployedUrl =
      extractWorkersDevUrl(wranglerResult.stdout) ?? serviceEntry.workersDevUrl ?? "";

    // 6. Health check
    let healthState: "healthy" | "unhealthy" | "unknown" = "unknown";
    if (!skipHealthCheck && serviceEntry.publicEndpoints && deployedUrl) {
      logger.info(
        `[leitstand.service.promote] running health check on ${deployedUrl}…`,
      );
      healthState = await runHealthCheck(deployedUrl, serviceEntry.healthCheckPath);
    } else if (!serviceEntry.publicEndpoints) {
      logger.info(
        `[leitstand.service.promote] skipping health check — service has no public endpoints`,
      );
    }

    // 7. Record prod deploy state
    await recordProdDeployState(workspaceRoot, serviceId, {
      at: new Date().toISOString(),
      state: "succeeded",
      operationId,
    });

    // 8. Update workersDevUrl in registry if resolved
    if (deployedUrl && deployedUrl !== serviceEntry.workersDevUrl) {
      await updateWorkersDevUrl(workspaceRoot, serviceId, deployedUrl);
    }

    const completedAt = new Date().toISOString();
    const data: ServicePromoteData = {
      command: "leitstand.service.promote",
      serviceId,
      workerName: serviceEntry.workerName,
      deployState: "succeeded",
      workersDevUrl: deployedUrl,
      healthState,
      preDeployGates: gateResults,
      startedAt,
      completedAt,
      operationId,
    };

    return {
      data,
      summary: `[leitstand.service.promote] ${serviceId}: promoted to production (${healthState})`,
    };
  } finally {
    await releaseServiceLock(workspaceRoot, serviceId);
  }
}
