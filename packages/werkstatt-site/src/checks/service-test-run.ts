/*
<MODULE_CONTRACT>
<purpose>Handler for service.test.run — runs vitest unit tests for a specific service and returns structured results (RFC-0824).</purpose>
<non-goals>
  <item>Does not run integration, contract, or E2E tests — those are separate RFCs (0826, 0827, 0828).</item>
  <item>Does not wire into build pipelines — standalone command invoked manually or via turbo run test.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0824: initial implementation of service.test.run command.</item>
</CHANGE_SUMMARY>
*/

import { execFile } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";

const execFileAsync = promisify(execFile);

export interface ServiceTestRunResult {
  command: "service.test.run";
  status: "pass" | "fail";
  service: string;
  testFiles: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  failures?: {
    testName: string;
    message: string;
    file: string;
  }[];
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

interface VitestJsonResult {
  numTotalTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: {
    name: string;
    assertionResults: {
      fullName: string;
      status: string;
      failureMessages?: string[];
    }[];
  }[];
}

function extractFailures(parsed: VitestJsonResult): NonNullable<ServiceTestRunResult["failures"]> {
  const failures: ServiceTestRunResult["failures"] = [];
  for (const suite of parsed.testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status === "failed") {
        failures.push({
          testName: assertion.fullName,
          message: assertion.failureMessages?.join("\n") ?? "",
          file: suite.name,
        });
      }
    }
  }
  return failures;
}

export async function runServiceTestRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ServiceTestRunResult>> {
  const service = flagString(input, "service");
  if (!service) {
    return {
      data: {
        command: "service.test.run",
        status: "fail",
        service: "",
        testFiles: 0,
        testsPassed: 0,
        testsFailed: 0,
        durationMs: 0,
      },
      exitCode: 1,
      summary: "service.test.run requires --service <id>",
    };
  }

  const testDir = join(
    context.workspaceRoot,
    "packages/werkstatt-site/src/testing/unit/services",
    service,
  );

  let entries: string[];
  try {
    entries = await readdir(testDir);
  } catch {
    return {
      data: {
        command: "service.test.run",
        status: "fail",
        service,
        testFiles: 0,
        testsPassed: 0,
        testsFailed: 0,
        durationMs: 0,
      },
      exitCode: 1,
      summary: `Test directory not found: packages/werkstatt-site/src/testing/unit/services/${service}/`,
    };
  }

  const testFiles = entries.filter((f) => f.endsWith(".test.ts"));
  if (testFiles.length === 0) {
    return {
      data: {
        command: "service.test.run",
        status: "pass",
        service,
        testFiles: 0,
        testsPassed: 0,
        testsFailed: 0,
        durationMs: 0,
      },
      exitCode: 0,
      summary: `No test files found for service "${service}" — directory exists but is empty.`,
    };
  }

  const startMs = Date.now();
  const jsonOutputFile = join(
    tmpdir(),
    `service-test-run-${service}-${Date.now()}-${process.pid}.json`,
  );

  try {
    try {
      await execFileAsync(
        "pnpm",
        [
          "--filter",
          service,
          "exec",
          "vitest",
          "run",
          "--reporter=json",
          `--outputFile=${jsonOutputFile}`,
        ],
        {
          cwd: context.workspaceRoot,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, CI: "true" },
        },
      );
    } catch {
      // vitest exits non-zero on test failures, but the JSON file is still written
      // — proceed to read the output file regardless of the exec error
    }

    const durationMs = Date.now() - startMs;
    let jsonContent: string;
    try {
      jsonContent = await readFile(jsonOutputFile, "utf-8");
    } catch {
      throw new Error(`vitest JSON output file not found: ${jsonOutputFile}`);
    }
    const parsed = JSON.parse(jsonContent) as VitestJsonResult;
    const failures = extractFailures(parsed);

    const status: "pass" | "fail" = parsed.numFailedTests > 0 ? "fail" : "pass";
    return {
      data: {
        command: "service.test.run",
        status,
        service,
        testFiles: parsed.numTotalTestSuites,
        testsPassed: parsed.numPassedTests,
        testsFailed: parsed.numFailedTests,
        durationMs,
        ...(failures.length > 0 ? { failures } : {}),
      },
      exitCode: status === "pass" ? 0 : 1,
      summary: `service.test.run: ${parsed.numPassedTests} passed, ${parsed.numFailedTests} failed (${service})`,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const error = err as { message?: string };

    // Try to read the JSON output file even on error (vitest writes it before exiting)
    try {
      const jsonContent = await readFile(jsonOutputFile, "utf-8");
      const parsed = JSON.parse(jsonContent) as VitestJsonResult;
      const failures = extractFailures(parsed);
      return {
        data: {
          command: "service.test.run",
          status: "fail",
          service,
          testFiles: parsed.numTotalTestSuites,
          testsPassed: parsed.numPassedTests,
          testsFailed: parsed.numFailedTests,
          durationMs,
          failures,
        },
        exitCode: 1,
        summary: `service.test.run: ${parsed.numPassedTests} passed, ${parsed.numFailedTests} failed (${service})`,
      };
    } catch {
      // JSON file not readable — return generic error
    }

    return {
      data: {
        command: "service.test.run",
        status: "fail",
        service,
        testFiles: 0,
        testsPassed: 0,
        testsFailed: 0,
        durationMs,
      },
      exitCode: 1,
      summary: `service.test.run failed for "${service}": ${error.message ?? "unknown error"}`,
    };
  } finally {
    await rm(jsonOutputFile, { force: true }).catch(() => {});
  }
}
