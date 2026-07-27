import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCosmicLiteralsLint, scanForCosmicLiterals } from "../cosmic-literals-lint.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0263: fixture tests for cosmic.literals.lint — COSMIC-LIT-01 (a cosmic
    catalog name used as a quoted string literal in packages/share/src) and the
    `cosmic-literals-ignore` escape hatch.
  </purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], args: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

async function fixtureWorkspace(fileContent: string): Promise<{ root: string }> {
  const root = await mkdtemp(join(tmpdir(), "cosmic-literals-lint-"));
  const dir = join(root, "packages", "share", "src");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "fixture.ts"), fileContent, "utf8");
  return { root };
}

describe("cosmic.literals.lint (RFC-0263)", () => {
  it("COSMIC-LIT-01: fails when a cosmic-catalog name appears as a string literal", async () => {
    const { root } = await fixtureWorkspace('const planetName = "Europa";\n');
    const result = await runCosmicLiteralsLint(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("COSMIC-LIT-01");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when no cosmic-catalog literal is present", async () => {
    const { root } = await fixtureWorkspace(
      'const planetName = registryRoleByCosmicName["anything"];\n',
    );
    const result = await runCosmicLiteralsLint(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("passes when the literal carries a cosmic-literals-ignore disable comment", async () => {
    const { root } = await fixtureWorkspace(
      'const fallback = lookup["breadcrumbs"] ?? "Thebe"; // cosmic-literals-ignore: defensive fallback\n',
    );
    const result = await runCosmicLiteralsLint(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});

describe("scanForCosmicLiterals (RFC-0263)", () => {
  const catalog = new Map([["Europa", "PlanetCatalog" as const]]);

  it("ignores occurrences inside block and line comments", () => {
    const text = [
      '/* "Europa" in a block comment */',
      '// "Europa" in a line comment',
      "const x = 1;",
    ].join("\n");
    expect(scanForCosmicLiterals(text, catalog)).toEqual([]);
  });

  it("flags a bare quoted occurrence with the correct line number", () => {
    const text = ["const a = 1;", 'const planet = "Europa";'].join("\n");
    const hits = scanForCosmicLiterals(text, catalog);
    expect(hits).toEqual([{ line: 2, name: "Europa", catalog: "PlanetCatalog" }]);
  });
});
