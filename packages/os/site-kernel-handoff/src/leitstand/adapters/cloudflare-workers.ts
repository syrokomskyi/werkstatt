/*
<MODULE_CONTRACT>
<purpose>RFC-0379: cloudflare-workers adapter — wraps wrangler deploy with injectable CommandRunner, health verification via @warpgogol/fingerprint HTML normalization.</purpose>
<non-goals>
  <item>Do not implement netlify or other adapters — only cloudflare-workers in this wave.</item>
  <item>Do not log, echo, or serialize secret values or resolved secrets-file contents.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0379: initial cloudflare-workers adapter with injectable CommandRunner, secretsFile resolution, deterministic health probes.</item>
</CHANGE_SUMMARY>
*/

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PropagationResult, HealthCheck } from "@warpgogol/ontology/operations";
import { hashHtml } from "@warpgogol/fingerprint";
import type {
  CommandRunner,
  DeploymentAdapter,
  PropagateInput,
  RollbackInput,
  HealthInput,
} from "../adapter.ts";

function createDefaultCommandRunner(): CommandRunner {
  return (cmd, args, opts) =>
    new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: opts?.cwd,
        env: { ...process.env, ...opts?.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
}

async function sourceDotenv(filePath: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  if (!existsSync(filePath)) return env;
  const content = await fs.readFile(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    env[key] = value;
  }
  return env;
}

function extractDeploymentUrl(stdout: string): string | undefined {
  const match = stdout.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : undefined;
}

interface RouteFact {
  path: string;
  contentHash?: string;
}

interface BehaviorSnapshot {
  routes: RouteFact[];
}

async function readBehaviorSnapshot(
  workspaceRoot: string,
  releaseId: string,
): Promise<BehaviorSnapshot | null> {
  const snapshotPath = path.join(workspaceRoot, "releases", releaseId, "behavior-snapshot.json");
  if (!existsSync(snapshotPath)) return null;
  const content = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(content) as BehaviorSnapshot;
}

function selectProbeRoutes(routes: RouteFact[], maxProbes: number): RouteFact[] {
  const homeRoutes = routes.filter((r) => r.path === "/" || /^\/[a-z]{2}\/?$/.test(r.path));
  const legalRoutes = routes.filter((r) =>
    /legal|imprint|privacy|datenschutz|impressum|agb|terms/i.test(r.path),
  );
  const sitemapRoutes = routes.filter((r) => /sitemap|llms|robots/i.test(r.path));
  const remaining = routes.filter(
    (r) => !homeRoutes.includes(r) && !legalRoutes.includes(r) && !sitemapRoutes.includes(r),
  );
  remaining.sort((a, b) => a.path.localeCompare(b.path));

  const prioritized = [...homeRoutes, ...legalRoutes, ...sitemapRoutes, ...remaining];
  return prioritized.slice(0, maxProbes);
}

async function fetchWithRetry(
  url: string,
  maxAttempts: number,
): Promise<{ ok: boolean; status: number; body: string } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      const body = await response.text();
      return { ok: response.ok, status: response.status, body };
    } catch {
      if (attempt < maxAttempts - 1) {
        const delayMs = Math.min(1000 * 2 ** attempt, 30000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return null;
}

export function createCloudflareWorkersAdapter(exec?: CommandRunner): DeploymentAdapter {
  const runner = exec ?? createDefaultCommandRunner();

  return {
    name: "cloudflare-workers",

    async propagate(input: PropagateInput): Promise<PropagationResult> {
      const now = new Date().toISOString();

      const secretsEnv = input.secretsFilePath ? await sourceDotenv(input.secretsFilePath) : {};

      const wranglerArgs = ["exec", "wrangler", "deploy", "--name", input.workerName];
      if (input.secretsFilePath) {
        wranglerArgs.push("--secrets-file", input.secretsFilePath);
      }

      const result = await runner("pnpm", wranglerArgs, {
        cwd: input.distPath,
        env: secretsEnv,
      });

      if (result.exitCode !== 0) {
        return {
          systemId: input.systemId,
          releaseId: input.releaseId,
          state: "failed",
          deploymentUrl: input.url,
          startedAt: now,
          completedAt: new Date().toISOString(),
          healthChecks: [],
        };
      }

      const deployedUrl = extractDeploymentUrl(result.stdout) ?? input.url;

      return {
        systemId: input.systemId,
        releaseId: input.releaseId,
        state: "succeeded",
        deploymentUrl: deployedUrl,
        startedAt: now,
        completedAt: new Date().toISOString(),
        healthChecks: [],
      };
    },

    async rollback(input: RollbackInput): Promise<PropagationResult> {
      const now = new Date().toISOString();

      const secretsEnv = input.secretsFilePath ? await sourceDotenv(input.secretsFilePath) : {};

      const wranglerArgs = ["exec", "wrangler", "deploy", "--name", input.workerName];
      if (input.secretsFilePath) {
        wranglerArgs.push("--secrets-file", input.secretsFilePath);
      }

      const result = await runner("pnpm", wranglerArgs, {
        cwd: input.distPath,
        env: secretsEnv,
      });

      const deployedUrl = extractDeploymentUrl(result.stdout) ?? input.url;
      const state = result.exitCode === 0 ? "succeeded" : "failed";

      return {
        systemId: input.systemId,
        releaseId: input.toReleaseId,
        state,
        deploymentUrl: deployedUrl,
        startedAt: now,
        completedAt: new Date().toISOString(),
        healthChecks: [],
      };
    },

    async health(
      input: HealthInput,
    ): Promise<{ state: "healthy" | "unhealthy" | "unknown"; checks: HealthCheck[] }> {
      const maxProbes = 10;
      const maxAttempts = 5;

      const snapshot = await readBehaviorSnapshot(input.workspaceRoot, input.releaseId);
      const routes = snapshot?.routes ?? [];
      const probeRoutes = selectProbeRoutes(routes, maxProbes);

      if (probeRoutes.length === 0) {
        return {
          state: "unknown",
          checks: [
            {
              name: "probe-selection",
              url: input.deploymentUrl,
              status: 0,
              passed: false,
              detail: "No routes available in behavior snapshot for probing",
            },
          ],
        };
      }

      const checks: HealthCheck[] = [];
      let allPassed = true;
      let anyNetworkFailure = false;
      let anyContentMismatch = false;

      for (const route of probeRoutes) {
        const url = `${input.deploymentUrl}${route.path === "/" ? "" : route.path}`;
        const response = await fetchWithRetry(url, maxAttempts);

        if (response === null) {
          anyNetworkFailure = true;
          allPassed = false;
          checks.push({
            name: `probe:${route.path}`,
            url,
            status: 0,
            passed: false,
            detail: "Network failure after retries",
            expectedHash: route.contentHash,
          });
          continue;
        }

        if (!response.ok) {
          allPassed = false;
          checks.push({
            name: `probe:${route.path}`,
            url,
            status: response.status,
            passed: false,
            detail: `HTTP ${response.status}`,
            expectedHash: route.contentHash,
          });
          continue;
        }

        if (route.contentHash) {
          const actualHash = hashHtml(response.body);
          const hashMatch = actualHash === route.contentHash;
          if (!hashMatch) {
            allPassed = false;
            anyContentMismatch = true;
          }
          checks.push({
            name: `probe:${route.path}`,
            url,
            status: response.status,
            passed: hashMatch,
            detail: hashMatch ? "Content hash matches" : "Content hash mismatch",
            expectedHash: route.contentHash,
            actualHash,
          });
        } else {
          checks.push({
            name: `probe:${route.path}`,
            url,
            status: response.status,
            passed: true,
            detail: "HTTP OK, no content hash in snapshot",
          });
        }
      }

      const state: "healthy" | "unhealthy" | "unknown" = anyContentMismatch
        ? "unhealthy"
        : anyNetworkFailure
          ? "unknown"
          : allPassed
            ? "healthy"
            : "unhealthy";

      return { state, checks };
    },
  };
}
