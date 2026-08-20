import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findUndeclaredFlagReads,
  findHeuristicPathViolations,
  findRequiredFlagsNotInDescription,
  type KernelFlagSchemaSourceEntry,
} from "../kernel-flags-lint.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0260: fixture tests for kernel.flags.lint — declared (clean), undeclared
    (KERNEL-FLAG-04), and legacy/heuristic-path (KERNEL-FLAG-05) command shapes.
  </purpose>
</MODULE_CONTRACT>
*/

async function setupFixtureModule(source: string): Promise<{ root: string; relFile: string }> {
  const root = await mkdtemp(join(tmpdir(), "kernel-flags-lint-"));
  const relFile = join("fixtures", "sample-command.ts");
  await mkdir(join(root, "fixtures"), { recursive: true });
  await writeFile(join(root, relFile), source, "utf8");
  return { root, relFile: relFile.split("\\").join("/") };
}

describe("kernel.flags.lint (RFC-0260)", () => {
  it("KERNEL-FLAG-04: passes when every input.flags read is declared", async () => {
    const { root, relFile } = await setupFixtureModule(`
      export async function runFixture(input, context) {
        const title = input.flags["title"];
        const mini = input.flags.mini;
        return { exitCode: 0 };
      }
    `);
    const entries: KernelFlagSchemaSourceEntry[] = [
      { command: "fixture.declared", file: relFile, functionName: "runFixture" },
    ];
    const registeredByName = new Map([
      [
        "fixture.declared",
        {
          flags: {
            title: { kind: "string", description: "x" },
            mini: { kind: "boolean", description: "x" },
          },
        },
      ],
    ]);
    const diagnostics = await findUndeclaredFlagReads(root, registeredByName, entries);
    expect(diagnostics).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it("KERNEL-FLAG-04: fails when a flag read is not in the declared schema", async () => {
    const { root, relFile } = await setupFixtureModule(`
      export async function runFixture(input, context) {
        const title = input.flags["title"];
        const bogus = input.flags["bogus-undeclared"];
        return { exitCode: 0 };
      }
    `);
    const entries: KernelFlagSchemaSourceEntry[] = [
      { command: "fixture.undeclared", file: relFile, functionName: "runFixture" },
    ];
    const registeredByName = new Map([
      ["fixture.undeclared", { flags: { title: { kind: "string", description: "x" } } }],
    ]);
    const diagnostics = await findUndeclaredFlagReads(root, registeredByName, entries);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("KERNEL-FLAG-04");
    expect(diagnostics[0]?.message).toContain("bogus-undeclared");
    await rm(root, { recursive: true, force: true });
  });

  it("KERNEL-FLAG-05: baselined legacy command is a warning; unbaselined new command is an error", () => {
    const registered = [
      { name: "legacy.baselined", flags: undefined },
      { name: "new.unbaselined", flags: undefined },
      { name: "migrated.command", flags: { title: { kind: "string" as const, description: "x" } } },
    ];
    const baseline = {
      generatedMarker: "x",
      doNotEdit: "x",
      ownerCommand: "x",
      editInstead: "x",
      regenerateCommand: "x",
      meta: { schemaVersion: 1 as const },
      commands: ["legacy.baselined"],
    };
    const diagnostics = findHeuristicPathViolations(registered, baseline);

    expect(diagnostics).toHaveLength(2);
    const legacy = diagnostics.find((d) => d.data?.command === "legacy.baselined");
    const fresh = diagnostics.find((d) => d.data?.command === "new.unbaselined");
    expect(legacy?.severity).toBe("warning");
    expect(fresh?.severity).toBe("error");
    expect(diagnostics.every((d) => d.ruleId === "KERNEL-FLAG-05")).toBe(true);
  });

  it("KERNEL-FLAG-06: passes when all required flags are mentioned in description", () => {
    const registered = [
      {
        name: "fixture.clean",
        description: "Do something. Flags: --site, --release.",
        flags: {
          site: { kind: "string" as const, required: true, description: "x" },
          release: { kind: "string" as const, required: true, description: "x" },
          verbose: { kind: "boolean" as const, description: "x" },
        },
      },
    ];
    const diagnostics = findRequiredFlagsNotInDescription(registered);
    expect(diagnostics).toEqual([]);
  });

  it("KERNEL-FLAG-06: fails when a required flag is missing from description", () => {
    const registered = [
      {
        name: "fixture.missing",
        description: "Do something. Flags: --release.",
        flags: {
          release: { kind: "string" as const, required: true, description: "x" },
          site: { kind: "string" as const, required: true, description: "x" },
        },
      },
    ];
    const diagnostics = findRequiredFlagsNotInDescription(registered);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("KERNEL-FLAG-06");
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("--site");
    expect(diagnostics[0]?.data).toEqual({ command: "fixture.missing", flagName: "site" });
  });

  it("KERNEL-FLAG-06: skips commands without flags schema", () => {
    const registered = [{ name: "fixture.no-flags", description: "Do something." }];
    const diagnostics = findRequiredFlagsNotInDescription(registered);
    expect(diagnostics).toEqual([]);
  });

  it("KERNEL-FLAG-06: ignores optional flags not in description", () => {
    const registered = [
      {
        name: "fixture.optional",
        description: "Do something. Flags: --site.",
        flags: {
          site: { kind: "string" as const, required: true, description: "x" },
          dryRun: { kind: "boolean" as const, description: "x" },
        },
      },
    ];
    const diagnostics = findRequiredFlagsNotInDescription(registered);
    expect(diagnostics).toEqual([]);
  });
});
