/*
<MODULE_CONTRACT>
<purpose>RFC-0806: leitstand.service.dev-deploy command handler — deploys a service
to the dev channel (wrangler.dev.jsonc) with pre-deploy gates, lock, wrangler deploy,
health check, and dev state recording.</purpose>
<non-goals>
  <item>Do not deploy to production — use leitstand.service.promote for that.</item>
  <item>Do not run subdomain validation — dev Workers use *.workers.dev URLs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0806: initial dev-deploy command handler.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { existsSync } from "node:fs";
import type { KernelCommandInput, KernelCommandResult } from "@warpgogol/werkstatt/kernel";
import { readServicesRegistry, findServiceEntry } from "../sternsystem/registry-io.ts";
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
  recordDevDeployState,
  updateWorkersDevUrl,
  type ServiceDevDeployData,
  type KernelRuntimeContext,
} from "./service-deploy-helpers.ts";

export async function runLeitstandServiceDevDeploy(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ServiceDevDeployData>> {
  const { workspaceRoot, logger } = context;
  const serviceId = flagString(input, "service");
  const skipHealthCheck = flagBoolean(input, "skip-health-check");

  if (!serviceId) {
    throw new Error("[leitstand.service.dev-deploy] --service is required");
  }

  const operationId = generateOperationId();
  const startedAt = new Date().toISOString();

  const registry = await readServicesRegistry(workspaceRoot);
  const serviceEntry = findServiceEntry(registry, serviceId);
  if (!serviceEntry) {
    throw new Error(
      `[leitstand.service.dev-deploy] service '${serviceId}' not found in services/registry.yaml`,
    );
  }

  const serviceDir = path.join(workspaceRoot, "services", serviceId);
  if (!existsSync(serviceDir)) {
    throw new Error(`[leitstand.service.dev-deploy] services/${serviceId}/ does not exist`);
  }

  const devConfigPath = path.join(serviceDir, "wrangler.dev.jsonc");
  if (!existsSync(devConfigPath)) {
    throw new Error(
      `[leitstand.service.dev-deploy] services/${serviceId}/wrangler.dev.jsonc not found — cannot dev-deploy without dev config`,
    );
  }

  await acquireServiceLock(workspaceRoot, serviceId, operationId, "leitstand.service.dev-deploy");

  try {
    // 1. Pre-deploy gates: service.naming.validate, service.registry.validate, deploy.preflight --dev
    const gates = [
      { commandName: "service.naming.validate", argv: [] },
      { commandName: "service.registry.validate", argv: [] },
      { commandName: "deploy.preflight", argv: ["--service", serviceId, "--dev"] },
    ];

    const gateResults = await runPreDeployGates(workspaceRoot, gates, logger);
    const failedGate = gateResults.find((g) => !g.passed);
    if (failedGate) {
      const failedData: ServiceDevDeployData = {
        command: "leitstand.service.dev-deploy",
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
        summary: `[leitstand.service.dev-deploy] ${serviceId}: pre-deploy gate '${failedGate.command}' failed — ${failedGate.summary}`,
      };
    }

    // 2. Read .env.dev for secrets
    const envDevPath = path.join(serviceDir, ".env.dev");
    const deployEnv = await parseEnvFile(envDevPath);

    // 3. Wrangler deploy with dev config
    logger.info(
      `[leitstand.service.dev-deploy] deploying ${serviceEntry.workerName}-dev via wrangler…`,
    );
    const wranglerResult = await runWranglerDeploy(serviceDir, "wrangler.dev.jsonc", deployEnv);

    if (wranglerResult.exitCode !== 0) {
      await recordDevDeployState(workspaceRoot, serviceId, {
        at: new Date().toISOString(),
        state: "failed",
        operationId,
      });
      const failedData: ServiceDevDeployData = {
        command: "leitstand.service.dev-deploy",
        serviceId,
        workerName: serviceEntry.workerName,
        deployState: "failed",
        workersDevUrl: extractWorkersDevUrl(wranglerResult.stdout) ?? "",
        healthState: "unknown",
        preDeployGates: gateResults,
        startedAt,
        completedAt: new Date().toISOString(),
        operationId,
      };
      return {
        data: failedData,
        exitCode: 1,
        summary: `[leitstand.service.dev-deploy] ${serviceId}: wrangler deploy failed — ${wranglerResult.stderr.slice(-200)}`,
      };
    }

    // 4. Resolve workersDevUrl from wrangler output
    const deployedUrl = extractWorkersDevUrl(wranglerResult.stdout) ?? "";

    // 5. Health check (skip if --skip-health-check or no URL)
    let healthState: "healthy" | "unhealthy" | "unknown" = "unknown";
    if (!skipHealthCheck && deployedUrl) {
      logger.info(`[leitstand.service.dev-deploy] running health check on ${deployedUrl}…`);
      healthState = await runHealthCheck(deployedUrl, serviceEntry.healthCheckPath);
    }

    // 6. Record dev deploy state
    await recordDevDeployState(workspaceRoot, serviceId, {
      at: new Date().toISOString(),
      state: "succeeded",
      operationId,
    });

    // 7. Update workersDevUrl in registry if resolved
    if (deployedUrl) {
      await updateWorkersDevUrl(workspaceRoot, serviceId, deployedUrl);
    }

    const completedAt = new Date().toISOString();
    const data: ServiceDevDeployData = {
      command: "leitstand.service.dev-deploy",
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
      summary: `[leitstand.service.dev-deploy] ${serviceId}: dev-deployed (${healthState})`,
    };
  } finally {
    await releaseServiceLock(workspaceRoot, serviceId);
  }
}
