/*
<MODULE_CONTRACT>
<purpose>RFC-0826: Service integration test runner — runs vitest-based integration
tests against dev-deployed Workers. Reuses .env.dev credentials (RFC-0806).
Guarded by RUN_INTEGRATION_TESTS env var so tests are skipped by default.</purpose>
<keywords>integration, testing, runner, vitest, dev-deploy</keywords>
<responsibilities>
  <item>Resolves the integration test directory for a service.</item>
  <item>Loads .env.dev for the service and injects credentials as env vars.</item>
  <item>Spawns vitest with RUN_INTEGRATION_TESTS=1 to run integration test files.</item>
  <item>Returns structured IntegrationRunResult with pass/fail/skipped status.</item>
</responsibilities>
<non-goals>
  <item>Do not register kernel commands — that lives in testing/module.ts.</item>
  <item>Do not run integration tests in CI — they require dev-deployed Workers.</item>
  <item>Do not mock external APIs — integration tests hit real endpoints.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0826: initial integration runner implementation.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { loadServiceDevEnv } from "../helpers/test-env.ts";
import type { IntegrationRunResult, IntegrationTestSummary } from "@warpgogol/werkstatt/testing/integration";

export class IntegrationTestDirNotFoundError extends Error {
  constructor(serviceId: string, dir: string) {
    super(
      `[service.integration.run] no integration test directory found for service '${serviceId}' at ${dir}`,
    );
    this.name = "IntegrationTestDirNotFoundError";
  }
}

/**
 * Resolves the integration test directory for a service.
 * Integration tests live in packages/werkstatt-site/src/testing/integration/services/<serviceId>/.
 */
export function resolveIntegrationTestDir(
  serviceId: string,
  workspaceRoot: string,
): string {
  return resolve(
    workspaceRoot,
    "packages/werkstatt-site/src/testing/integration/services",
    serviceId,
  );
}

/**
 * Runs vitest-based integration tests for a service against a dev-deployed URL.
 *
 * @param serviceId - Service id from services/registry.yaml
 * @param workspaceRoot - Workspace root path
 * @param deployedUrl - Base URL of the dev-deployed Worker
 * @param logger - Logger for info/warn messages
 * @returns IntegrationRunResult with test outcomes
 */
export async function runServiceIntegrationTests(
  serviceId: string,
  workspaceRoot: string,
  deployedUrl: string,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<IntegrationRunResult> {
  const testDir = resolveIntegrationTestDir(serviceId, workspaceRoot);
  const startedAt = Date.now();

  if (!existsSync(testDir)) {
    logger.warn(
      `[service.integration.run] no integration tests found for ${serviceId} at ${testDir} — skipping`,
    );
    return {
      command: "service.integration.run",
      serviceId,
      status: "skipped",
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      durationMs: 0,
      stdout: "",
      stderr: "",
      exitCode: 0,
    };
  }

  // Load .env.dev for the service and inject as env vars
  let testEnv: Record<string, string> = {};
  try {
    testEnv = loadServiceDevEnv(serviceId, workspaceRoot);
  } catch {
    logger.warn(
      `[service.integration.run] no .env.dev found for ${serviceId} — proceeding with process env only`,
    );
  }

  logger.info(
    `[service.integration.run] running integration tests for ${serviceId} against ${deployedUrl}…`,
  );

  const vitestEnv: Record<string, string> = {
    ...process.env,
    ...testEnv,
    RUN_INTEGRATION_TESTS: "1",
    INTEGRATION_TEST_URL: deployedUrl,
    INTEGRATION_TEST_SERVICE: serviceId,
  };

  const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolvePromise) => {
      const child = spawn(
        "npx",
        ["--yes", "vitest", "run", "--reporter=json", testDir],
        {
          cwd: workspaceRoot,
          env: vitestEnv,
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
        resolvePromise({
          exitCode: 1,
          stdout,
          stderr: "Failed to spawn vitest",
        });
      });
      child.on("exit", (code) => {
        resolvePromise({ exitCode: code ?? 1, stdout, stderr });
      });
    },
  );

  const durationMs = Date.now() - startedAt;
  const summary = parseVitestJsonSummary(result.stdout);
  const status: IntegrationRunResult["status"] =
    summary.failed > 0 ? "fail" : summary.total > 0 ? "pass" : "skipped";

  logger.info(
    `[service.integration.run] ${serviceId}: ${summary.passed}/${summary.total} passed, ${summary.failed} failed (${durationMs}ms)`,
  );

  return {
    command: "service.integration.run",
    serviceId,
    status,
    summary,
    durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * Parses vitest JSON reporter output to extract test counts.
 * Falls back to zero counts if JSON is malformed or missing.
 */
function parseVitestJsonSummary(stdout: string): IntegrationTestSummary {
  try {
    // vitest JSON reporter outputs a JSON object with numTotalTests, numPassedTests, etc.
    const match = stdout.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (!match) {
      return { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    const parsed = JSON.parse(match[0]) as {
      numTotalTests?: number;
      numPassedTests?: number;
      numFailedTests?: number;
      numPendingTests?: number;
      numTodoTests?: number;
    };
    return {
      total: parsed.numTotalTests ?? 0,
      passed: parsed.numPassedTests ?? 0,
      failed: parsed.numFailedTests ?? 0,
      skipped: (parsed.numPendingTests ?? 0) + (parsed.numTodoTests ?? 0),
    };
  } catch {
    return { total: 0, passed: 0, failed: 0, skipped: 0 };
  }
}
