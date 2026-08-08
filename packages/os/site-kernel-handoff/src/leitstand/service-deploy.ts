/*
<MODULE_CONTRACT>
<purpose>RFC-0751: leitstand.service.deploy command handler — deploys a shared Cloudflare Worker service with preflight, subdomain validation, wrangler deploy, health check, and atomic state recording.</purpose>
<non-goals>
  <item>Do not implement multi-channel deployment — services use a single production channel.</item>
  <item>Do not implement CDN cache purge — services are Workers, not static sites.</item>
  <item>Do not reuse the site cloudflare-workers adapter — it expects distPath and wrangler.json; services use wrangler.jsonc and have no build step.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0751: initial service deploy command handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { ServiceEntry } from "@warpgogol/ontology/operations";
import { readRegistry, writeRegistry, findServiceEntry } from "../sternsystem/registry-io.ts";
import { generateOperationId } from "../werkstatt/index.ts";

export interface ServiceDeployData {
  command: "leitstand.service.deploy";
  serviceId: string;
  workerName: string;
  deployState: "succeeded" | "failed";
  workersDevUrl: string;
  healthState: "healthy" | "unhealthy" | "unknown";
  startedAt: string;
  completedAt: string;
  operationId: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

async function runWranglerDeploy(
  serviceDir: string,
  env: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["--yes", "wrangler", "deploy", "--config", "wrangler.jsonc"],
      {
        cwd: serviceDir,
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", () => {
      resolve({ exitCode: 1, stdout, stderr: "Failed to spawn wrangler" });
    });
    child.on("exit", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function extractWorkersDevUrl(stdout: string): string | undefined {
  const match = stdout.match(/https?:\/\/[^\s]+\.workers\.dev[^\s]*/);
  return match ? match[0] : undefined;
}

async function runHealthCheck(
  url: string,
  healthCheckPath: string | undefined,
): Promise<"healthy" | "unhealthy"> {
  const checkUrl = url + (healthCheckPath ?? "/");
  try {
    const response = await fetch(checkUrl, { redirect: "follow" });
    if (response.status < 500) {
      return "healthy";
    }
    return "unhealthy";
  } catch {
    return "unhealthy";
  }
}

export async function runLeitstandServiceDeploy(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ServiceDeployData>> {
  const { workspaceRoot, logger } = context;
  const serviceId = flagString(input, "service");

  if (!serviceId) {
    throw new Error("[leitstand.service.deploy] --service is required");
  }

  const operationId = generateOperationId();
  const startedAt = new Date().toISOString();

  // 1. Read registry — find service entry
  const registry = await readRegistry(workspaceRoot);
  const serviceEntry = findServiceEntry(registry, serviceId);
  if (!serviceEntry) {
    throw new Error(
      `[leitstand.service.deploy] service '${serviceId}' not found in systems/registry.yaml`,
    );
  }

  const serviceDir = path.join(workspaceRoot, "services", serviceId);
  if (!existsSync(serviceDir)) {
    throw new Error(
      `[leitstand.service.deploy] services/${serviceId}/ does not exist`,
    );
  }

  const wranglerPath = path.join(serviceDir, "wrangler.jsonc");
  if (!existsSync(wranglerPath)) {
    throw new Error(
      `[leitstand.service.deploy] services/${serviceId}/wrangler.jsonc not found — not a Cloudflare Worker service`,
    );
  }

  // 2. Run deploy.preflight
  logger.info(`[leitstand.service.deploy] running deploy.preflight for ${serviceId}…`);
  const { executeKernelCommand } = await import("@warpgogol/site-kernel");
  const preflightResult = (await executeKernelCommand({
    workspaceRoot,
    commandName: "deploy.preflight",
    argv: ["--service", serviceId, "--env", ".env"],
  })) as { exitCode: number; summary?: string };

  if (preflightResult.exitCode !== 0) {
    const failedData: ServiceDeployData = {
      command: "leitstand.service.deploy",
      serviceId,
      workerName: serviceEntry.workerName,
      deployState: "failed",
      workersDevUrl: serviceEntry.workersDevUrl ?? "",
      healthState: "unknown",
      startedAt,
      completedAt: new Date().toISOString(),
      operationId,
    };
    return {
      data: failedData,
      exitCode: 1,
      summary: `[leitstand.service.deploy] ${serviceId}: deploy.preflight failed — ${preflightResult.summary ?? "unknown error"}`,
    };
  }

  // 3. Run subdomain.validate (RFC-0752) — best-effort, skip if command not available
  if (serviceEntry.subdomains && serviceEntry.subdomains.length > 0) {
    logger.info(`[leitstand.service.deploy] running subdomain.validate for ${serviceId}…`);
    try {
      const subdomainResult = (await executeKernelCommand({
        workspaceRoot,
        commandName: "subdomain.validate",
        argv: ["--service", serviceId],
      })) as { exitCode: number; summary?: string };

      if (subdomainResult.exitCode !== 0) {
        // Try to register subdomains if validation reports "not registered"
        logger.info(
          `[leitstand.service.deploy] subdomain.validate reported missing subdomains — attempting subdomain.register…`,
        );
        const registerResult = (await executeKernelCommand({
          workspaceRoot,
          commandName: "subdomain.register",
          argv: ["--service", serviceId],
        })) as { exitCode: number; summary?: string };

        if (registerResult.exitCode !== 0) {
          const failedData: ServiceDeployData = {
            command: "leitstand.service.deploy",
            serviceId,
            workerName: serviceEntry.workerName,
            deployState: "failed",
            workersDevUrl: serviceEntry.workersDevUrl ?? "",
            healthState: "unknown",
            startedAt,
            completedAt: new Date().toISOString(),
            operationId,
          };
          return {
            data: failedData,
            exitCode: 1,
            summary: `[leitstand.service.deploy] ${serviceId}: subdomain.register failed — ${registerResult.summary ?? "unknown error"}`,
          };
        }
      }
    } catch {
      logger.warn(
        `[leitstand.service.deploy] subdomain.validate not available — skipping subdomain validation (RFC-0752 may not be implemented yet)`,
      );
    }
  }

  // 4. Execute wrangler deploy
  logger.info(`[leitstand.service.deploy] deploying ${serviceEntry.workerName} via wrangler…`);
  const envPath = path.join(serviceDir, ".env");
  const deployEnv: Record<string, string> = {};
  if (existsSync(envPath)) {
    const content = await fs.readFile(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (value !== "") deployEnv[key] = value;
    }
  }

  const wranglerResult = await runWranglerDeploy(serviceDir, deployEnv);

  if (wranglerResult.exitCode !== 0) {
    // Record failed state
    await recordDeployState(workspaceRoot, serviceId, {
      at: new Date().toISOString(),
      state: "failed",
      operationId,
    });
    const failedData: ServiceDeployData = {
      command: "leitstand.service.deploy",
      serviceId,
      workerName: serviceEntry.workerName,
      deployState: "failed",
      workersDevUrl: extractWorkersDevUrl(wranglerResult.stdout) ?? serviceEntry.workersDevUrl ?? "",
      healthState: "unknown",
      startedAt,
      completedAt: new Date().toISOString(),
      operationId,
    };
    return {
      data: failedData,
      exitCode: 1,
      summary: `[leitstand.service.deploy] ${serviceId}: wrangler deploy failed — ${wranglerResult.stderr.slice(-200)}`,
    };
  }

  // 5. Resolve workersDevUrl
  const deployedUrl =
    extractWorkersDevUrl(wranglerResult.stdout) ?? serviceEntry.workersDevUrl ?? "";

  // 6. Health check
  let healthState: "healthy" | "unhealthy" | "unknown" = "unknown";
  if (serviceEntry.publicEndpoints && deployedUrl) {
    logger.info(`[leitstand.service.deploy] running health check on ${deployedUrl}…`);
    healthState = await runHealthCheck(deployedUrl, serviceEntry.healthCheckPath);
  } else if (!serviceEntry.publicEndpoints) {
    healthState = "unknown";
    logger.info(
      `[leitstand.service.deploy] skipping health check — service has no public endpoints`,
    );
  }

  // 7. Record state — atomic write
  await recordDeployState(workspaceRoot, serviceId, {
    at: new Date().toISOString(),
    state: "succeeded",
    operationId,
  });

  // Update workersDevUrl in registry if resolved from wrangler output
  if (deployedUrl && deployedUrl !== serviceEntry.workersDevUrl) {
    const updatedRegistry = await readRegistry(workspaceRoot);
    const updatedEntry = findServiceEntry(updatedRegistry, serviceId);
    if (updatedEntry) {
      updatedEntry.workersDevUrl = deployedUrl;
      await writeRegistry(workspaceRoot, updatedRegistry);
    }
  }

  const completedAt = new Date().toISOString();
  const data: ServiceDeployData = {
    command: "leitstand.service.deploy",
    serviceId,
    workerName: serviceEntry.workerName,
    deployState: "succeeded",
    workersDevUrl: deployedUrl,
    healthState,
    startedAt,
    completedAt,
    operationId,
  };

  return {
    data,
    summary: `[leitstand.service.deploy] ${serviceId}: deployed (${healthState})`,
  };
}

async function recordDeployState(
  workspaceRoot: string,
  serviceId: string,
  state: { at: string; state: "succeeded" | "failed"; operationId: string },
): Promise<void> {
  const registry = await readRegistry(workspaceRoot);
  const entry = registry.services?.find((s: ServiceEntry) => s.id === serviceId);
  if (!entry) return;
  entry.lastDeployed = {
    at: state.at,
    state: state.state,
    operationId: state.operationId,
  };
  await writeRegistry(workspaceRoot, registry);
}
