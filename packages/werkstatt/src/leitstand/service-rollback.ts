/*
<MODULE_CONTRACT>
<purpose>RFC-0806: leitstand.service.rollback command handler — rolls back a
Cloudflare Worker service to its previous deployment via wrangler rollback.
Records rollback state in the services registry.</purpose>
<non-goals>
  <item>Do not implement dev-channel rollback — production rollback only.</item>
  <item>Do not run pre-deploy gates — rollback is an emergency operation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0806: initial rollback command handler.</item>
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
  generateOperationId,
  runWranglerRollback,
  parseEnvFile,
  acquireServiceLock,
  releaseServiceLock,
  recordProdDeployState,
  type ServiceRollbackData,
  type KernelRuntimeContext,
} from "./service-deploy-helpers.ts";

export async function runLeitstandServiceRollback(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ServiceRollbackData>> {
  const { workspaceRoot, logger } = context;
  const serviceId = flagString(input, "service");

  if (!serviceId) {
    throw new Error("[leitstand.service.rollback] --service is required");
  }

  const operationId = generateOperationId();
  const startedAt = new Date().toISOString();

  const registry = await readServicesRegistry(workspaceRoot);
  const serviceEntry = findServiceEntry(registry, serviceId);
  if (!serviceEntry) {
    throw new Error(
      `[leitstand.service.rollback] service '${serviceId}' not found in services/registry.yaml`,
    );
  }

  const serviceDir = path.join(workspaceRoot, "services", serviceId);
  if (!existsSync(serviceDir)) {
    throw new Error(`[leitstand.service.rollback] services/${serviceId}/ does not exist`);
  }

  const wranglerPath = path.join(serviceDir, "wrangler.jsonc");
  if (!existsSync(wranglerPath)) {
    throw new Error(
      `[leitstand.service.rollback] services/${serviceId}/wrangler.jsonc not found — not a Cloudflare Worker service`,
    );
  }

  await acquireServiceLock(workspaceRoot, serviceId, operationId, "leitstand.service.rollback");

  try {
    // Read .env for secrets (rollback may need env for the Worker)
    const envPath = path.join(serviceDir, ".env");
    const deployEnv = await parseEnvFile(envPath);

    // Run wrangler rollback
    logger.info(
      `[leitstand.service.rollback] rolling back ${serviceEntry.workerName} via wrangler rollback…`,
    );
    const wranglerResult = await runWranglerRollback(serviceDir, deployEnv);

    if (wranglerResult.exitCode !== 0) {
      const failedData: ServiceRollbackData = {
        command: "leitstand.service.rollback",
        serviceId,
        workerName: serviceEntry.workerName,
        rollbackState: "failed",
        startedAt,
        completedAt: new Date().toISOString(),
        operationId,
      };
      return {
        data: failedData,
        exitCode: 1,
        summary: `[leitstand.service.rollback] ${serviceId}: wrangler rollback failed — ${wranglerResult.stderr.slice(-200)}`,
      };
    }

    // Record rollback state
    await recordProdDeployState(workspaceRoot, serviceId, {
      at: new Date().toISOString(),
      state: "rolled-back",
      operationId,
    });

    const completedAt = new Date().toISOString();
    const data: ServiceRollbackData = {
      command: "leitstand.service.rollback",
      serviceId,
      workerName: serviceEntry.workerName,
      rollbackState: "succeeded",
      startedAt,
      completedAt,
      operationId,
    };

    return {
      data,
      summary: `[leitstand.service.rollback] ${serviceId}: rolled back to previous deployment`,
    };
  } finally {
    await releaseServiceLock(workspaceRoot, serviceId);
  }
}
