/*
<MODULE_CONTRACT>
<purpose>RFC-0828: Site E2E test runner — runs Playwright E2E tests against
dev-deployed site URLs. Verifies Chromium is installed before running.
Spawns `pnpm exec playwright test` as a child process with E2E_BASE_URL env var.</purpose>
<keywords>e2e, testing, runner, playwright, dev-deploy</keywords>
<responsibilities>
  <item>Verifies Playwright Chromium is installed before running tests.</item>
  <item>Resolves the E2E test directory and Playwright config path.</item>
  <item>Spawns `pnpm exec playwright test` with E2E_BASE_URL env var.</item>
  <item>Parses Playwright JSON reporter output for test counts and failures.</item>
  <item>Returns structured SiteE2eRunResult with pass/fail/skipped status.</item>
</responsibilities>
<non-goals>
  <item>Do not register kernel commands — that lives in testing/module.ts.</item>
  <item>Do not run E2E tests in CI — they require a dev-deployed site.</item>
  <item>Do not auto-install Chromium — use playwright.chromium.ensure for that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0828: initial E2E runner implementation.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolveSiteDevUrl } from "../helpers/dev-url-resolver.ts";
import { waitForDeploy } from "../helpers/wait-for-deploy.ts";
import type { SiteE2eRunResult, E2eTestFailure } from "@warpgogol/werkstatt/testing/e2e";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const e2eConfigPath = join(moduleDir, "playwright.e2e.config.ts");

export class ChromiumNotInstalledError extends Error {
  constructor() {
    super(
      "Playwright Chromium is not installed. Run `pnpm exec playwright install chromium` before E2E tests.",
    );
    this.name = "ChromiumNotInstalledError";
  }
}

export function ensureChromiumInstalled(): void {
  const cacheDir = join(homedir(), ".cache", "ms-playwright");
  const chromiumDirs = existsSync(cacheDir)
    ? readdirSync(cacheDir).filter((d) => d.startsWith("chromium"))
    : [];
  if (chromiumDirs.length === 0) {
    throw new ChromiumNotInstalledError();
  }
}

/**
 * Runs Playwright E2E tests for a site against a dev-deployed URL.
 *
 * @param siteId - Sternsystem id
 * @param workspaceRoot - Workspace root path
 * @param url - Base URL to test against (optional, resolved from registry if not provided)
 * @param logger - Logger for info/warn messages
 * @returns SiteE2eRunResult with test outcomes
 */
export async function runSiteE2eTests(
  siteId: string,
  workspaceRoot: string,
  url: string | undefined,
  logger: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<SiteE2eRunResult> {
  const startedAt = Date.now();

  ensureChromiumInstalled();

  const resolvedUrl = url ?? resolveSiteDevUrl(siteId, workspaceRoot);

  logger.info(`[site.e2e.run] waiting for ${resolvedUrl} to be reachable…`);
  await waitForDeploy(resolvedUrl);

  logger.info(`[site.e2e.run] running E2E tests for ${siteId} against ${resolvedUrl}…`);

  const jsonOutputPath = join(workspaceRoot, `.e2e-result-${siteId}-${Date.now()}.json`);
  const childEnv: Record<string, string> = {
    ...process.env,
    E2E_BASE_URL: resolvedUrl,
    E2E_JSON_OUTPUT: jsonOutputPath,
  };

  const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolvePromise) => {
      const child = spawn("pnpm", ["exec", "playwright", "test", "--config", e2eConfigPath], {
        cwd: moduleDir,
        env: childEnv,
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
      child.on("error", () => {
        resolvePromise({
          exitCode: 1,
          stdout,
          stderr: "Failed to spawn playwright",
        });
      });
      child.on("exit", (code) => {
        resolvePromise({ exitCode: code ?? 1, stdout, stderr });
      });
    },
  );

  const durationMs = Date.now() - startedAt;

  let testFiles = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  let failures: E2eTestFailure[] | undefined;

  if (existsSync(jsonOutputPath)) {
    try {
      const jsonContent = await import("node:fs/promises").then((m) =>
        m.readFile(jsonOutputPath, "utf8"),
      );
      const parsed = JSON.parse(jsonContent) as {
        stats?: {
          total?: number;
          passed?: number;
          failed?: number;
          suites?: number;
        };
        suites?: Array<{
          suites?: Array<{
            specs?: Array<{
              title: string;
              tests?: Array<{
                results?: Array<{ status: string; error?: { message?: string } }>;
              }>;
              file?: string;
            }>;
          }>;
        }>;
      };
      testFiles = parsed.stats?.suites ?? 0;
      testsPassed = parsed.stats?.passed ?? 0;
      testsFailed = parsed.stats?.failed ?? 0;

      if (testsFailed > 0 && parsed.suites) {
        failures = [];
        for (const suite of parsed.suites) {
          for (const innerSuite of suite.suites ?? []) {
            for (const spec of innerSuite.specs ?? []) {
              for (const test of spec.tests ?? []) {
                for (const testResult of test.results ?? []) {
                  if (testResult.status === "failed") {
                    failures.push({
                      testName: spec.title,
                      message: testResult.error?.message ?? "unknown error",
                      file: spec.file ?? "unknown",
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      logger.warn(`[site.e2e.run] failed to parse Playwright JSON output`);
    }

    try {
      await import("node:fs/promises").then((m) => m.unlink(jsonOutputPath));
    } catch {
      // Non-fatal — temp file cleanup
    }
  }

  const status: SiteE2eRunResult["status"] =
    testsFailed > 0 ? "fail" : testsPassed > 0 ? "pass" : "skipped";

  logger.info(
    `[site.e2e.run] ${siteId}: ${testsPassed} passed, ${testsFailed} failed (${testFiles} files, ${durationMs}ms)`,
  );

  return {
    command: "site.e2e.run",
    status,
    site: siteId,
    url: resolvedUrl,
    testFiles,
    testsPassed,
    testsFailed,
    durationMs,
    failures,
  };
}
