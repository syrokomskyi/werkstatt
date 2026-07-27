import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import {
  runFleetKillswitch,
  runFleetSchedulePlan,
  runFleetStatusCollect,
} from "../fleet-leitstand.ts";

/*
<MODULE_CONTRACT>
  <purpose>RFC-0284 regression coverage for fleet Leitstand status, scheduler, and kill-switch.</purpose>
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

function input(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], args: [], flags } as unknown as KernelCommandInput;
}

async function fixture(): Promise<{ root: string; appDir: string; context: KernelRuntimeContext }> {
  const root = await mkdtemp(join(tmpdir(), "fleet-leitstand-"));
  const appDir = join(root, "apps", "demo");
  await mkdir(join(root, "fleet"), { recursive: true });
  await mkdir(join(appDir, "src", "bordbuch"), { recursive: true });
  await mkdir(join(appDir, "src", "surface", "visibility"), { recursive: true });
  await mkdir(join(appDir, "src", "surface", "states"), { recursive: true });
  await writeFile(
    join(root, "fleet", "fleet.sites.yaml"),
    JSON.stringify({ sites: [{ site: "demo", path: "apps/demo" }] }),
    "utf8",
  );
  await writeFile(
    join(appDir, "src", "bordbuch", "status.generated.yaml"),
    JSON.stringify({ ledgerHash: "sha256:test", openEscalations: [] }),
    "utf8",
  );
  await writeFile(
    join(appDir, "src", "surface", "autonomy.state.yaml"),
    yamlStringify({
      states: [{ scope: { module: "pseo", fieldClass: "narrative", locale: "de" }, level: "L0" }],
    }),
    "utf8",
  );
  await writeFile(
    join(appDir, "src", "surface", "states", "pointer.yaml"),
    yamlStringify({ lastKnownGood: "surface-good" }),
    "utf8",
  );
  await writeFile(
    join(appDir, "src", "surface", "visibility", "outcomes.generated.yaml"),
    JSON.stringify({ outcomes: [{ proposedAction: "enrich" }] }),
    "utf8",
  );
  return {
    root,
    appDir,
    context: {
      workspaceRoot: root,
      dryRun: false,
      logger,
    } as unknown as KernelRuntimeContext,
  };
}

describe("fleet Leitstand (RFC-0284)", () => {
  it("collects site status from per-site primitives", async () => {
    const { root, context } = await fixture();
    try {
      const result = await runFleetStatusCollect(input(), context);
      expect(result.exitCode).toBe(0);
      expect(result.summary).toContain("1 site");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("clips non-safety jobs but keeps safety jobs scheduled", async () => {
    const { root, appDir, context } = await fixture();
    try {
      await writeFile(
        join(appDir, "src", "surface", "freeze.generated.yaml"),
        JSON.stringify({ frozen: [{ scope: "all" }] }),
        "utf8",
      );
      const result = await runFleetSchedulePlan(
        input({ "site-share": 0, budget: "missing-budget.json" }),
        context,
      );
      expect(result.exitCode).toBe(0);
      expect(result.summary).toContain("job");
      const plan = yamlParse(
        await readFile(join(root, "fleet", "fleet.plan.generated.yaml"), "utf8"),
      );
      expect(
        plan.jobs.some(
          (job: { kind?: string; safety?: boolean }) => job.kind === "rollback" && job.safety,
        ),
      ).toBe(true);
      expect(plan.blocked.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes a global kill-switch and per-site freeze projection", async () => {
    const { root, appDir, context } = await fixture();
    try {
      const result = await runFleetKillswitch(
        input({ scope: "all", reason: "test incident" }),
        context,
      );
      expect(result.exitCode).toBe(0);
      const state = yamlParse(await readFile(join(root, "fleet", "killswitch.state.yaml"), "utf8"));
      const freeze = yamlParse(
        await readFile(join(appDir, "src", "surface", "freeze.generated.yaml"), "utf8"),
      );
      expect(state.active).toBe(true);
      expect(freeze.frozen[0].tripwires).toContain("fleet-killswitch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
