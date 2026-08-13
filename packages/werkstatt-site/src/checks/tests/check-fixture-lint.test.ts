import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveCommandModules,
  computeFixtureCoverage,
  buildFixtureCoverageDiagnostics,
} from "../check-fixture-lint.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0261: fixture tests for check.fixture.lint. resolveCommandModules is
    tested against a fixture command-table file (declared/undeclared/legacy
    shapes); computeFixtureCoverage/buildFixtureCoverageDiagnostics are pure
    and tested directly with in-memory fixtures — this is how check.fixture.lint
    satisfies its own rule without needing a full monorepo fixture tree.
  </purpose>
</MODULE_CONTRACT>
*/

const CHECKS_SRC = ["packages", "werkstatt-site", "src", "checks"];

async function setupCommandTableFixture(tableSource: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "check-fixture-lint-"));
  const commandTablesDir = join(root, ...CHECKS_SRC, "command-tables");
  await mkdir(commandTablesDir, { recursive: true });
  await writeFile(join(commandTablesDir, "01-fixture.ts"), tableSource, "utf8");
  return root;
}

describe("check.fixture.lint: resolveCommandModules (RFC-0261)", () => {
  it("declared: resolves a command's execute function to its imported module path", async () => {
    const root = await setupCommandTableFixture(`
      import { runSampleValidate } from "../sample-validate.ts";
      export const FIXTURE_COMMANDS = [
        {
          name: "sample.validate",
          description: "fixture",
          scope: "workspace",
          execute: runSampleValidate,
        },
      ];
    `);
    const modules = await resolveCommandModules(root);
    expect(modules.get("sample.validate")).toBe(
      "packages/werkstatt-site/src/checks/sample-validate.ts",
    );
    await rm(root, { recursive: true, force: true });
  });

  it("undeclared/legacy: an inline execute function resolves to null (undecidable)", async () => {
    const root = await setupCommandTableFixture(`
      export const FIXTURE_COMMANDS = [
        {
          name: "inline.validate",
          description: "fixture",
          scope: "workspace",
          execute: runInlineHandler,
        },
      ];
      function runInlineHandler() {}
    `);
    const modules = await resolveCommandModules(root);
    expect(modules.get("inline.validate")).toBeNull();
    await rm(root, { recursive: true, force: true });
  });
});

describe("check.fixture.lint: coverage decision + diagnostics (RFC-0261)", () => {
  it("declared: a fully covered command produces no diagnostic", () => {
    const entries = computeFixtureCoverage(
      ["sample.validate"],
      new Map([["sample.validate", "packages/werkstatt-site/src/checks/sample.ts"]]),
      [
        {
          name: "sample.test.ts",
          content:
            'import {} from "../sample.ts"; expect(x.exitCode).toBe(1); expect(y.exitCode).toBe(0);',
        },
      ],
    );
    const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set());
    expect(diagnostics).toEqual([]);
  });

  it("CHECK-FIX-01: an uncovered command (no importing test file) fails", () => {
    const entries = computeFixtureCoverage(
      ["sample.validate"],
      new Map([["sample.validate", "packages/werkstatt-site/src/checks/sample.ts"]]),
      [],
    );
    const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set());
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("CHECK-FIX-01");
  });

  it("CHECK-FIX-02: a covering test with only a fail fixture (no pass fixture) fails", () => {
    const entries = computeFixtureCoverage(
      ["sample.validate"],
      new Map([["sample.validate", "packages/werkstatt-site/src/checks/sample.ts"]]),
      [
        {
          name: "sample.test.ts",
          content: 'import {} from "../sample.ts"; expect(x.exitCode).toBe(1);',
        },
      ],
    );
    const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set());
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("CHECK-FIX-02");
  });

  it("CHECK-FIX-03: an undecidable module (inline execute) warns instead of failing", () => {
    const entries = computeFixtureCoverage(
      ["sample.validate"],
      new Map([["sample.validate", null]]),
      [],
    );
    const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set());
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("CHECK-FIX-03");
    expect(diagnostics[0]?.severity).toBe("warning");
  });

  it("legacy: a baselined uncovered command is silently accepted (shrink-only ratchet)", () => {
    const entries = computeFixtureCoverage(
      ["legacy.validate"],
      new Map([["legacy.validate", "packages/werkstatt-site/src/checks/legacy.ts"]]),
      [],
    );
    const diagnostics = buildFixtureCoverageDiagnostics(entries, new Set(["legacy.validate"]));
    expect(diagnostics).toEqual([]);
  });
});
