/*
<MODULE_CONTRACT>
<purpose>
  RFC-0519: unit tests for gate catalog generator and validator. Tests
  pipeline scanning, phase priority resolution, generate handler output,
  and validate handler drift detection.
</purpose>
<non-goals>
  <item>Does not test against the real workspace — uses temp dirs with minimal fixtures.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0519: initial test suite.</item>
</CHANGE_SUMMARY>
*/

import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultIO } from "@gogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";
import { parse as yamlParse } from "yaml";
import {
  buildGateCatalog,
  renderGateCatalog,
  runGateCatalogGenerate,
  runGateCatalogValidate,
} from "../gate-catalog.ts";

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
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

const MINIMAL_KERNEL_CONFIG = `export default { modules: [] };\n`;

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gate-catalog-test-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(join(root, "packages/os/site-kernel-checks/src/command-tables"), {
    recursive: true,
  });
  await mkdir(join(root, "packages/os/site-kernel-checks/src/pipelines"), {
    recursive: true,
  });
  await mkdir(join(root, "packages/os/site-kernel/src"), { recursive: true });

  await writeFile(join(root, "package.json"), '{"name":"test"}\n', "utf8");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  await writeFile(join(root, "tools/kernel.config.mjs"), MINIMAL_KERNEL_CONFIG, "utf8");

  return root;
}

async function writeStubSources(root: string): Promise<void> {
  await writeFile(join(root, "packages/os/site-kernel/src/types.ts"), "// stub\n", "utf8");
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts"),
    "// stub\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/pipelines/packages-check.ts"),
    "// stub\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts"),
    "// stub\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts"),
    "// stub\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/pipelines/build-check.ts"),
    "// stub\n",
    "utf8",
  );
  await writeFile(
    join(root, "packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts"),
    "// stub\n",
    "utf8",
  );
}

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()!;
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
});

describe("gate catalog — buildGateCatalog (RFC-0519)", () => {
  it("produces a catalog with schemaVersion 1 and deterministic structure", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    const catalog = await buildGateCatalog(root);

    expect(catalog.meta.schemaVersion).toBe(1);
    expect(catalog.meta.deterministic).toBe(true);
    expect(catalog.meta.generatedAt).toBeNull();
    expect(catalog.meta.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(catalog.gates).toBeInstanceOf(Array);
    expect(catalog.summary.total).toBe(catalog.gates.length);
    expect(catalog.summary.withMetadata + catalog.summary.withoutMetadata).toBe(
      catalog.summary.total,
    );
  });

  it("renderGateCatalog produces stable YAML output", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    const catalog1 = await buildGateCatalog(root);
    const catalog2 = await buildGateCatalog(root);

    const yaml1 = renderGateCatalog(catalog1);
    const yaml2 = renderGateCatalog(catalog2);

    expect(yaml1).toBe(yaml2);
    expect(yaml1).toContain("schemaVersion: 1");
    expect(yaml1).toContain("gates:");
    expect(yaml1).toContain("summary:");
  });
});

describe("gate catalog — runGateCatalogGenerate (RFC-0519)", () => {
  it("writes docs/gate-catalog.generated.yaml to the workspace", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    const result = await runGateCatalogGenerate(input, ctx(root));

    expect(result.exitCode).toBe(0);
    expect(result.data?.file).toBe("docs/gate-catalog.generated.yaml");

    const { readFile } = await import("node:fs/promises");
    const written = await readFile(join(root, "docs/gate-catalog.generated.yaml"), "utf8");
    const parsed = yamlParse(written) as { meta: { schemaVersion: number } };
    expect(parsed.meta.schemaVersion).toBe(1);
  });
});

describe("gate catalog — runGateCatalogValidate (RFC-0519)", () => {
  it("fails with GATE-CAT-01 when catalog is missing", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    const result = await runGateCatalogValidate(input, ctx(root));

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data?.diagnostics ?? [];
    expect(diagnostics.some((d) => d.ruleId === "GATE-CAT-01")).toBe(true);
  });

  it("passes when catalog matches live state", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    await runGateCatalogGenerate(input, ctx(root));
    const result = await runGateCatalogValidate(input, ctx(root));

    expect(result.exitCode).toBe(0);
    const diagnostics = result.data?.diagnostics ?? [];
    expect(diagnostics.some((d) => d.severity === "error")).toBe(false);
  });

  it("fails with GATE-CAT-02 when catalog is stale", async () => {
    const root = await createTempRoot();
    roots.push(root);
    await writeStubSources(root);

    await writeFile(
      join(root, "docs/gate-catalog.generated.yaml"),
      "meta:\n  schemaVersion: 1\n  deterministic: true\n  generatedAt: null\n  contentHash: stale\n  sources: []\ngates: []\nsummary:\n  total: 0\n  withMetadata: 0\n  withoutMetadata: 0\n  bySeverity: {}\n  byPhase: {}\n",
      "utf8",
    );

    const result = await runGateCatalogValidate(input, ctx(root));

    expect(result.exitCode).toBe(1);
    const diagnostics = result.data?.diagnostics ?? [];
    expect(diagnostics.some((d) => d.ruleId === "GATE-CAT-02")).toBe(true);
  });
});
