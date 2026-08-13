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
import { readdir } from "node:fs/promises";
import { join } from "node:path";
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

  const serviceDir = join(context.workspaceRoot, "services", service);
  const startMs = Date.now();

  try {
    const { stdout } = await execFileAsync(
      "pnpm",
      ["--filter", service, "run", "test", "--", "--reporter=json"],
      {
        cwd: context.workspaceRoot,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, CI: "true" },
      },
    );

    const durationMs = Date.now() - startMs;
    const parsed = JSON.parse(stdout) as VitestJsonResult;
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
    const error = err as { stdout?: string; message?: string };
    let parsed: VitestJsonResult | null = null;
    if (error.stdout) {
      try {
        parsed = JSON.parse(error.stdout) as VitestJsonResult;
      } catch {
        // vitest may output non-JSON on crash
      }
    }

    if (parsed) {
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
  }
}
