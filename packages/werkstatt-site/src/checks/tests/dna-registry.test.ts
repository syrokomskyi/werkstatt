import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { collectDnaEnforcerDiagnostics, runDnaRegistryValidate } from "../dna-registry.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

/** RFC-0158: dna.registry.validate keeps the DNA registry and the establishing RFCs in sync. */

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
const ctx = (root: string) =>
  ({
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  }) as unknown as KernelRuntimeContext;
const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

async function setup(registry: string, rfcs: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dna-reg-"));
  await mkdir(join(root, "docs", "rfcs"), { recursive: true });
  await writeFile(join(root, "docs", "architecture-dna.md"), registry, "utf8");
  for (const [name, body] of Object.entries(rfcs)) {
    const filePath = join(root, "docs", "rfcs", name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body, "utf8");
  }
  return root;
}

describe("dna.registry.validate (RFC-0158)", () => {
  it("passes when the registry is contiguous and every entry is traced", async () => {
    const root = await setup("## DNA-1 · A\n\nText. Established by RFC-0001.\n", {
      "RFC-0001-a.md": "# RFC-0001\nbody\n",
    });
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-04: a 'Foundational invariant (pre-RFC)' marker is valid provenance", async () => {
    const root = await setup(
      "## DNA-1 · Monorepo boundary\n\nText. Foundational invariant (pre-RFC).\n",
      {
        "RFC-0001-a.md": "x",
      },
    );
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-05: errors when an active entry names an unregistered enforcer, but exempts reclassified features", async () => {
    // No packages/os in the fixture → no registered commands, so a named enforcer is 'unregistered'.
    const active = await setup(
      "## DNA-1 · X\n\nText. Enforced by `nope.validate`. Established by RFC-0001.\n",
      { "RFC-0001-a.md": "x" },
    );
    const r1 = await runDnaRegistryValidate(input, ctx(active));
    expect(r1.exitCode).toBe(1);
    expect(JSON.stringify(r1.data)).toContain("DNA-REG-05");
    await rm(active, { recursive: true, force: true });

    const reclassified = await setup(
      "## DNA-1 · X\n\nText. Enforced by `nope.validate`. Established by RFC-0001. Reclassified to feature (RFC-0161).\n",
      { "RFC-0001-a.md": "x" },
    );
    const r2 = await runDnaRegistryValidate(input, ctx(reclassified));
    expect(r2.exitCode ?? 0).toBe(0);
    await rm(reclassified, { recursive: true, force: true });
  });

  it("DNA-REG-05: reports registered-but-unpipelined enforcers as advisory warnings", () => {
    const registry =
      "## DNA-1 · X\n\nText. Enforced by `thing.validate`. Established by RFC-0001.\n";
    const result = collectDnaEnforcerDiagnostics(registry, new Set(["thing.validate"]), new Set());
    expect(result.violations).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.severity).toBe("warning");
  });

  it("DNA-REG-03: fails when an RFC establishes a DNA the registry omits (the B7 drift)", async () => {
    const root = await setup("## DNA-1 · A\n\nText. Established by RFC-0001.\n", {
      "RFC-0001-a.md": "# RFC-0001\nbody\n",
      "RFC-0002-b.md": "# RFC-0002\nThis section is DNA-2 established by this RFC.\n",
    });
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(r.data)).toContain("DNA-REG-03");
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-01: fails on a gap in the registry ids", async () => {
    const root = await setup(
      "## DNA-1 · A\n\nEstablished by RFC-0001.\n\n## DNA-3 · C\n\nEstablished by RFC-0001.\n",
      { "RFC-0001-a.md": "x" },
    );
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(r.data)).toContain("DNA-REG-01");
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-02: fails on a citation to a nonexistent RFC", async () => {
    const root = await setup("## DNA-1 · A\n\nEstablished by RFC-9999.\n", {
      "RFC-0001-a.md": "x",
    });
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode).toBe(1);
    expect(JSON.stringify(r.data)).toContain("DNA-REG-02");
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-02: resolves lowercase kebab-case rfc-XXXX filenames (V-21 rename)", async () => {
    const root = await setup("## DNA-1 · A\n\nText. Established by RFC-0001.\n", {
      "rfc-0001-a.md": "# RFC-0001\nbody\n",
    });
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode ?? 0).toBe(0);
    expect(JSON.stringify(r.data)).not.toContain("DNA-REG-02");
    await rm(root, { recursive: true, force: true });
  });

  it("DNA-REG-02/03: resolves archived RFC files as part of the RFC corpus", async () => {
    const root = await setup("## DNA-1 · A\n\nText. Established by RFC-0002.\n", {
      "archive/implemented/rfc-0002-archived.md": "# RFC-0002\nbody\n",
    });
    const r = await runDnaRegistryValidate(input, ctx(root));
    expect(r.exitCode ?? 0).toBe(0);
    expect(JSON.stringify(r.data)).not.toContain("DNA-REG-02");
    await rm(root, { recursive: true, force: true });
  });
});
