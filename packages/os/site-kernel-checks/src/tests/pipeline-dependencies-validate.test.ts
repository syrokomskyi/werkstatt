import { test, expect, describe } from "vitest";
import { buildSchedule, ScheduleError } from "@warpgogol/site-kernel";
import { runPipelineDependenciesValidate } from "../pipeline/pipeline-dependencies-validate.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0686: Unit tests for pipeline.dependencies.validate command.
    Covers valid pipeline, missing dependency, forward reference, and duplicate command names.
  </purpose>
</MODULE_CONTRACT>
*/

const mockInput = {
  commandName: "pipeline.dependencies.validate",
  args: [],
  flags: {},
  argv: [],
} as unknown as KernelCommandInput;

const mockContext = {
  workspaceRoot: process.cwd(),
  site: undefined,
  siteExplicit: false,
  logger: {
    section: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    success: () => {},
    event: () => {},
    getEvents: () => [],
  },
  dryRun: false,
  outputFormat: "pretty" as const,
  io: {
    readFile: async () => "",
    writeFile: async () => {},
    exists: async () => false,
    mkdir: async () => {},
    readdir: async () => [],
    rm: async () => {},
  },
  fileIntents: [],
} as unknown as KernelRuntimeContext;

describe("pipeline.dependencies.validate", () => {
  test("valid standard pipelines pass (no violations)", async () => {
    const result = await runPipelineDependenciesValidate(mockInput, mockContext);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });
});

describe("buildSchedule error cases (used by pipeline.dependencies.validate)", () => {
  test("missing dependency throws ScheduleError", () => {
    expect(() => buildSchedule([{ command: "cmd.a", dependsOn: ["cmd.nonexistent"] }])).toThrow(
      ScheduleError,
    );
  });

  test("forward reference throws ScheduleError", () => {
    expect(() =>
      buildSchedule([{ command: "cmd.a", dependsOn: ["cmd.b"] }, { command: "cmd.b" }]),
    ).toThrow(ScheduleError);
  });

  test("duplicate command names throw ScheduleError", () => {
    expect(() => buildSchedule([{ command: "cmd.a" }, { command: "cmd.a" }])).toThrow(
      ScheduleError,
    );
  });
});
