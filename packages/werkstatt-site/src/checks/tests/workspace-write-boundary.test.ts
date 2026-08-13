/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0258 fixture tests for workspace.write.boundary.lint: an undeclared
    shared write is flagged WS-WRITE-01, an allowlisted module that bypasses
    writeFileAtomic is flagged WS-WRITE-02, and the real (clean) configuration
    passes with zero diagnostics.
  </purpose>
</MODULE_CONTRACT>
*/

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runWsWrite01,
  runWsWrite02,
  runWorkspaceWriteBoundaryLint,
  SHARED_WRITE_ALLOWLIST,
} from "../workspace-write-boundary.ts";
import type { OwnershipEntry } from "../generator-ownership.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

describe("workspace.write.boundary.lint (RFC-0258)", () => {
  it("WS-WRITE-01: flags an undeclared workspace-shared write reachable from an APPS_* pipeline", () => {
    const ownershipMap: OwnershipEntry[] = [
      {
        path: "docs/undeclared-shared-output.json",
        command: "undeclared.shared.generate",
        module: "packages/test/sample.ts",
      },
    ];
    const reachable = new Set(["undeclared.shared.generate"]);

    const diagnostics = runWsWrite01(ownershipMap, SHARED_WRITE_ALLOWLIST, reachable);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe("WS-WRITE-01");
    expect(diagnostics[0]?.message).toContain("undeclared.shared.generate");
  });

  it("WS-WRITE-01: does not flag an app-relative path even when reachable and unallowlisted", () => {
    const ownershipMap: OwnershipEntry[] = [
      {
        path: "src/pages/index.astro",
        command: "routes.generate",
        module: "packages/test/routes.ts",
      },
    ];
    const reachable = new Set(["routes.generate"]);

    expect(runWsWrite01(ownershipMap, SHARED_WRITE_ALLOWLIST, reachable)).toHaveLength(0);
  });

  it("WS-WRITE-01: does not flag a command absent from any APPS_* pipeline", () => {
    const ownershipMap: OwnershipEntry[] = [
      {
        path: "docs/some-output.json",
        command: "not.reachable.generate",
        module: "packages/test/not-reachable.ts",
      },
    ];

    expect(runWsWrite01(ownershipMap, SHARED_WRITE_ALLOWLIST, new Set())).toHaveLength(0);
  });

  describe("WS-WRITE-02", () => {
    let root: string | undefined;

    afterEach(async () => {
      if (root) await rm(root, { recursive: true, force: true });
      root = undefined;
    });

    it("flags an allowlisted module that does not import writeFileAtomic", async () => {
      root = await mkdtemp(join(tmpdir(), "ws-write-02-"));
      const modulePath = "src/bad-writer.ts";
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, modulePath),
        `import { writeFile } from "node:fs/promises";\nexport async function run() { await writeFile("x", "y"); }\n`,
        "utf8",
      );

      const diagnostics = await runWsWrite02(root, [
        { command: "bad.writer.generate", outputs: ["docs/bad.json"], module: modulePath },
      ]);

      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.every((d) => d.ruleId === "WS-WRITE-02")).toBe(true);
    });

    it("passes for a module that imports and uses writeFileAtomic only", async () => {
      root = await mkdtemp(join(tmpdir(), "ws-write-02-clean-"));
      const modulePath = "src/good-writer.ts";
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, modulePath),
        `import { writeFileAtomic } from "@warpgogol/werkstatt/kernel";\nexport async function run() { await writeFileAtomic("x", "y"); }\n`,
        "utf8",
      );

      const diagnostics = await runWsWrite02(root, [
        { command: "good.writer.generate", outputs: ["docs/good.json"], module: modulePath },
      ]);

      expect(diagnostics).toHaveLength(0);
    });

    it("RFC-0345: passes for a module that uses writeFileIfChanged", async () => {
      root = await mkdtemp(join(tmpdir(), "ws-write-02-idempotent-"));
      const modulePath = "src/idempotent-writer.ts";
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(
        join(root, modulePath),
        `import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";\nexport async function run() { await writeFileIfChanged("x", "y"); }\n`,
        "utf8",
      );

      const diagnostics = await runWsWrite02(root, [
        { command: "idempotent.writer.generate", outputs: ["docs/good.json"], module: modulePath },
      ]);

      expect(diagnostics).toHaveLength(0);
    });

    it("RFC-0270: passes for a module inside @warpgogol/site-kernel itself importing writeFileAtomic via a relative ./fs-atomic.ts specifier", async () => {
      root = await mkdtemp(join(tmpdir(), "ws-write-02-self-"));
      const modulePath = "packages/os/site-kernel/src/self-writer.ts";
      await mkdir(join(root, "packages/os/site-kernel/src"), { recursive: true });
      await writeFile(
        join(root, modulePath),
        `import { writeFileAtomic } from "./fs-atomic.ts";\nexport async function run() { await writeFileAtomic("x", "y"); }\n`,
        "utf8",
      );

      const diagnostics = await runWsWrite02(root, [
        { command: "self.writer.generate", outputs: ["docs/self.json"], module: modulePath },
      ]);

      expect(diagnostics).toHaveLength(0);
    });
  });

  it("clean fixture: the real SHARED_WRITE_ALLOWLIST modules all pass WS-WRITE-02 against the repo workspace", async () => {
    // Walk up from this test file to the repo workspace root (packages/os/site-kernel-checks/src/tests -> repo root).
    const workspaceRoot = join(import.meta.dirname, "..", "..", "..", "..", "..");
    const diagnostics = await runWsWrite02(workspaceRoot);
    expect(diagnostics).toEqual([]);
  });

  it("runWorkspaceWriteBoundaryLint passes cleanly against the real repo workspace", async () => {
    const workspaceRoot = join(import.meta.dirname, "..", "..", "..", "..", "..");
    const context = { workspaceRoot } as KernelRuntimeContext;
    const result = await runWorkspaceWriteBoundaryLint({ argv: [], flags: {} }, context);
    expect(result.exitCode).toBe(0);
  });
});
