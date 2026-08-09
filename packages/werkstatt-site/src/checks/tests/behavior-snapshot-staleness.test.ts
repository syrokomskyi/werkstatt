import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runBehaviorSnapshotStalenessCheck } from "../behavior-snapshot-staleness.ts";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0721: unit tests for behavior.snapshot.staleness.check — verifies
    one-directional route comparison (newRoutes only), skip behavior, and
    that Programmatic Surface routes (DNA-39) do not produce false positives.
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

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string, appDirectory: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: { name: "fixture-app", directory: appDirectory },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

function ctxNoSite(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: undefined,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

const SYSTEM_MD_WITH_ROUTES = `---
id: fixture-app
i18n:
  default: de
  languages: [de]
pages:
  - id: home
    routes:
      de: "/de/"
  - id: impressum
    routes:
      de: "/de/impressum/"
  - id: nachweis
    routes:
      de: "/de/nachweis/"
---

# Fixture App
`;

const SNAPSHOT_WITH_TWO_ROUTES = yamlStringify({
  routes: [{ route: "/de/" }, { route: "/de/impressum/" }],
});

const SNAPSHOT_WITH_ALL_ROUTES_PLUS_SURFACE = yamlStringify({
  routes: [
    { route: "/de/" },
    { route: "/de/impressum/" },
    { route: "/de/nachweis/" },
    { route: "/de/surface/city-berlin/" },
  ],
});

async function createAppDir(root: string): Promise<string> {
  const appDir = join(root, "apps", "fixture-app");
  const contentDir = join(appDir, "src", "content");
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, "system.md"), SYSTEM_MD_WITH_ROUTES, "utf8");
  return appDir;
}

async function writeSnapshot(appDir: string, content: string): Promise<void> {
  await writeFile(join(appDir, "behavior.snapshot.generated.yaml"), content, "utf8");
}

describe("runBehaviorSnapshotStalenessCheck (RFC-0721)", () => {
  it("SNAP-STALE-01: warns when system.md route is absent from committed snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-stale-"));
    try {
      const appDir = await createAppDir(root);
      await writeSnapshot(appDir, SNAPSHOT_WITH_TWO_ROUTES);

      const result = await runBehaviorSnapshotStalenessCheck(input, ctx(root, appDir));

      expect(result.exitCode).toBe(0);
      expect(result.data!.diagnostics).toHaveLength(1);
      expect(result.data!.diagnostics[0]?.ruleId).toBe("SNAP-STALE-01");
      expect(result.data!.diagnostics[0]?.severity).toBe("warning");
      expect(result.data!.diagnostics[0]?.message).toContain("/de/nachweis/");
      expect(result.data!.summary.warning).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips when no committed snapshot exists (SNAP-02 handles this in build.post)", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-stale-"));
    try {
      const appDir = await createAppDir(root);

      const result = await runBehaviorSnapshotStalenessCheck(input, ctx(root, appDir));

      expect(result.exitCode).toBe(0);
      expect(result.data!.diagnostics).toHaveLength(0);
      expect(result.data!.summary.warning).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips when no app context (requireAstroSitePaths throws)", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-stale-"));
    try {
      const result = await runBehaviorSnapshotStalenessCheck(input, ctxNoSite(root));

      expect(result.exitCode).toBe(0);
      expect(result.data!.diagnostics).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not flag removedRoutes — surface routes in snapshot are not false positives", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-stale-"));
    try {
      const appDir = await createAppDir(root);
      await writeSnapshot(appDir, SNAPSHOT_WITH_ALL_ROUTES_PLUS_SURFACE);

      const result = await runBehaviorSnapshotStalenessCheck(input, ctx(root, appDir));

      expect(result.exitCode).toBe(0);
      expect(result.data!.diagnostics).toHaveLength(0);
      expect(result.data!.summary.warning).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("passes when all system.md routes are in snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "snap-stale-"));
    try {
      const appDir = await createAppDir(root);
      await writeSnapshot(
        appDir,
        yamlStringify({
          routes: [{ route: "/de/" }, { route: "/de/impressum/" }, { route: "/de/nachweis/" }],
        }),
      );

      const result = await runBehaviorSnapshotStalenessCheck(input, ctx(root, appDir));

      expect(result.exitCode).toBe(0);
      expect(result.data!.diagnostics).toHaveLength(0);
      expect(result.data!.summary.warning).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
