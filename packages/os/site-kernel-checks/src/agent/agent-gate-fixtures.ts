/*
<MODULE_CONTRACT>
<purpose>
RFC-0290: agent.gate.fixtures.run — the workspace-scoped regression gate for
@warpgogol/agent-gate's conformance corpus (packages/agent-gate/src/tests/*.test.ts,
covering the pinned MCP subset + the action interpreter). Any protocol work
must keep this green.
</purpose>
<non-goals>
  <item>Do not duplicate the conformance assertions here — they live once in
        packages/agent-gate/src/tests/*.test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0290: initial fixtures-run wrapper.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

export function parseVitestSummary(
  stdout: string,
  exitCode: number,
): { passed: number; failed: number } {
  const testsLine = stdout.split(/\r?\n/).find((line) => /\bTests\b/.test(line));
  const passedMatch = testsLine?.match(/(\d+)\s+passed/);
  const failedMatch = testsLine?.match(/(\d+)\s+failed/);
  const passed = passedMatch ? Number(passedMatch[1]) : 0;
  const failed = failedMatch ? Number(failedMatch[1]) : exitCode === 0 ? 0 : 1;
  return { passed, failed };
}

export async function runAgentGateFixturesRun(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const cwd = join(context.workspaceRoot, "packages", "agent-gate");
  const vitestCli = join(cwd, "node_modules", "vitest", "vitest.mjs");
  const result = await context.io.exec(
    "node",
    [vitestCli, "run", "src/tests/actions.test.ts", "src/tests/gate.test.ts"],
    { cwd, timeoutMs: 60_000 },
  );

  const { passed, failed } = parseVitestSummary(result.stdout, result.exitCode ?? 1);

  if (result.exitCode !== 0 || failed > 0) {
    return {
      data: { command: "agent.gate.fixtures.run", status: "fail", passed, failed },
      exitCode: 1,
      summary: `agent.gate.fixtures.run: ${failed} failing fixture(s) (see stdout/stderr)\n${result.stdout}\n${result.stderr}`,
    };
  }

  return {
    data: { command: "agent.gate.fixtures.run", status: "pass", passed, failed: 0 },
    exitCode: 0,
    summary: `agent.gate.fixtures.run: ${passed} fixture(s) passed`,
  };
}
