import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0732: unit tests for content regression gate — covers diff logic,
    cold start (CREG-03), content drift (CREG-01), route set mismatch (CREG-02),
    skip flag, and snapshot update scenarios.
  </purpose>
</MODULE_CONTRACT>
*/

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSemanticSiteModel = {
  pages: [
    {
      url: "/de/",
      title: "Home",
      blocks: [
        {
          id: "block-1",
          blockType: "prose",
          heading: "Welcome",
          summary: "Introduction text",
          body: "This is the home page body.",
        },
      ],
      faqEntries: [],
    },
    {
      url: "/de/leistungen/",
      title: "Leistungen",
      blocks: [
        {
          id: "block-1",
          blockType: "cardGrid",
          heading: "Our Services",
          summary: "Service overview",
          items: [
            { title: "Service A", description: "Description A" },
            { title: "Service B", description: "Description B" },
          ],
        },
      ],
      faqEntries: [{ question: "What do you do?", answer: "We build things." }],
    },
  ],
};

vi.mock("@warpgogol/site-kernel-content", () => ({
  loadSemanticSiteModel: vi.fn(async () => mockSemanticSiteModel),
  loadSystemManifest: vi.fn(async () => ({
    manifest: {
      i18n: { default: "de", supported: { de: { name: "Deutsch" } } },
    },
  })),
}));

vi.mock("@warpgogol/site-kernel-astro", () => ({
  requireAstroSitePaths: vi.fn((context: KernelRuntimeContext) => ({
    appDirectory: context.site?.directory ?? "",
    contentDirectory: join(context.site?.directory ?? "", "src", "content"),
    srcDirectory: join(context.site?.directory ?? "", "src"),
    publicDirectory: join(context.site?.directory ?? "", "public"),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeInput(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

function makeContext(root: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    site: { name: "test-system", directory: appDir },
    siteExplicit: true,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

function makeRegistry(root: string, systemId: string, cacheClonePath: string): string {
  const registryDir = join(root, "systems");
  return registryDir;
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  runContentRegressionCheck,
  runContentRegressionSnapshotUpdate,
  runContentRegressionReviewGenerate,
  runContentRegressionApply,
  diffSnapshots,
  type ContentRegressionSnapshot,
} from "../content-regression.ts";

// ---------------------------------------------------------------------------
// Pure function tests: diffSnapshots
// ---------------------------------------------------------------------------

describe("diffSnapshots (pure logic)", () => {
  function makeSnapshot(routes: Array<{ route: string; hash: string }>): ContentRegressionSnapshot {
    return {
      schemaVersion: 1,
      systemId: "test",
      contentHash: "sha256:test",
      routes: routes.map((r) => ({
        route: r.route,
        blocks: [{ id: "block-1", blockType: "prose", heading: "Test", hash: "sha256:block" }],
        hash: r.hash,
      })),
    };
  }

  it("returns empty diff when snapshots are identical", () => {
    const current = makeSnapshot([{ route: "/de/", hash: "sha256:a" }]);
    const golden = makeSnapshot([{ route: "/de/", hash: "sha256:a" }]);
    const diff = diffSnapshots(current, golden);
    expect(diff.addedRoutes).toEqual([]);
    expect(diff.removedRoutes).toEqual([]);
    expect(diff.changedRoutes).toEqual([]);
  });

  it("detects added routes (CREG-02)", () => {
    const current = makeSnapshot([
      { route: "/de/", hash: "sha256:a" },
      { route: "/de/new/", hash: "sha256:b" },
    ]);
    const golden = makeSnapshot([{ route: "/de/", hash: "sha256:a" }]);
    const diff = diffSnapshots(current, golden);
    expect(diff.addedRoutes).toEqual(["/de/new/"]);
    expect(diff.removedRoutes).toEqual([]);
    expect(diff.changedRoutes).toEqual([]);
  });

  it("detects removed routes (CREG-02)", () => {
    const current = makeSnapshot([{ route: "/de/", hash: "sha256:a" }]);
    const golden = makeSnapshot([
      { route: "/de/", hash: "sha256:a" },
      { route: "/de/old/", hash: "sha256:b" },
    ]);
    const diff = diffSnapshots(current, golden);
    expect(diff.addedRoutes).toEqual([]);
    expect(diff.removedRoutes).toEqual(["/de/old/"]);
    expect(diff.changedRoutes).toEqual([]);
  });

  it("detects changed routes (CREG-01)", () => {
    const current = makeSnapshot([{ route: "/de/", hash: "sha256:changed" }]);
    const golden = makeSnapshot([{ route: "/de/", hash: "sha256:original" }]);
    const diff = diffSnapshots(current, golden);
    expect(diff.addedRoutes).toEqual([]);
    expect(diff.removedRoutes).toEqual([]);
    expect(diff.changedRoutes).toHaveLength(1);
    expect(diff.changedRoutes[0].route).toBe("/de/");
  });
});

// ---------------------------------------------------------------------------
// Command tests: runContentRegressionCheck
// ---------------------------------------------------------------------------

describe("runContentRegressionCheck", () => {
  let root: string;
  let appDir: string;
  let cacheCloneDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "creg-test-"));
    appDir = join(root, "apps", "test-system");
    cacheCloneDir = join(root, "cache-clones", "test-system");
    await mkdir(join(appDir, "src", "content"), { recursive: true });
    await mkdir(join(root, "systems"), { recursive: true });
    await mkdir(cacheCloneDir, { recursive: true });

    // Write registry.yaml
    const registry = {
      systems: [
        {
          id: "test-system",
          mirrors: [{ path: "./cache-clones/test-system" }],
        },
      ],
    };
    await writeFile(join(root, "systems", "registry.yaml"), yamlStringify(registry));

    // Write astro.config.mjs for readAstroSiteUrl
    await writeFile(
      join(appDir, "astro.config.mjs"),
      `export default { site: "https://example.com" };`,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("emits CREG-03 warning on cold start (no golden snapshot)", async () => {
    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionCheck(input, context);
    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics: Array<{ ruleId: string; severity: string }> };
    expect(data.diagnostics).toHaveLength(1);
    expect(data.diagnostics[0].ruleId).toBe("CREG-03");
    expect(data.diagnostics[0].severity).toBe("warning");
  });

  it("passes when current content matches golden snapshot", async () => {
    // Write golden snapshot matching the mock semantic model
    const goldenDir = join(cacheCloneDir, ".cache", "content-regression");
    await mkdir(goldenDir, { recursive: true });

    // Build a snapshot from the mock data to use as golden
    const { runContentRegressionSnapshotUpdate } = await import("../content-regression.ts");
    const updateInput = makeInput({ confirm: true });
    const updateContext = makeContext(root, appDir);
    await runContentRegressionSnapshotUpdate(updateInput, updateContext);

    // Now run the check — should pass
    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionCheck(input, context);
    expect(result.exitCode).toBe(0);
    const data = result.data as { diagnostics: Array<{ ruleId: string }> };
    expect(data.diagnostics).toHaveLength(0);
  });

  it("emits CREG-01 when content drifts from golden snapshot", async () => {
    // Write a golden snapshot with different content
    const goldenDir = join(cacheCloneDir, ".cache", "content-regression");
    await mkdir(goldenDir, { recursive: true });
    const goldenSnapshot: ContentRegressionSnapshot = {
      schemaVersion: 1,
      systemId: "test-system",
      contentHash: "sha256:different",
      routes: [
        {
          route: "/de/",
          blocks: [
            {
              id: "block-1",
              blockType: "prose",
              heading: "OLD HEADING",
              hash: "sha256:old",
            },
          ],
          hash: "sha256:old-route",
        },
      ],
    };
    await writeFile(
      join(goldenDir, "test-system.snapshot.yaml"),
      `# Generated\n${yamlStringify(goldenSnapshot)}`,
    );

    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionCheck(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string; severity: string }> };
    const creg01s = data.diagnostics.filter((d) => d.ruleId === "CREG-01");
    expect(creg01s.length).toBeGreaterThan(0);
  });

  it("emits CREG-02 for route set mismatch (new route)", async () => {
    // Write a golden snapshot with only one route (current has two)
    const goldenDir = join(cacheCloneDir, ".cache", "content-regression");
    await mkdir(goldenDir, { recursive: true });
    const goldenSnapshot: ContentRegressionSnapshot = {
      schemaVersion: 1,
      systemId: "test-system",
      contentHash: "sha256:partial",
      routes: [
        {
          route: "/de/",
          blocks: [
            {
              id: "block-1",
              blockType: "prose",
              heading: "Welcome",
              lead: "Introduction text",
              body: "This is the home page body.",
              hash: "sha256:block1",
            },
          ],
          hash: "sha256:route1",
        },
      ],
    };
    await writeFile(
      join(goldenDir, "test-system.snapshot.yaml"),
      `# Generated\n${yamlStringify(goldenSnapshot)}`,
    );

    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionCheck(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string }> };
    const creg02s = data.diagnostics.filter((d) => d.ruleId === "CREG-02");
    expect(creg02s.length).toBeGreaterThan(0);
  });

  it("skips the gate when --skip-content-regression is set", async () => {
    const input = makeInput({ "skip-content-regression": true });
    const context = makeContext(root, appDir);
    const result = await runContentRegressionCheck(input, context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });
});

// ---------------------------------------------------------------------------
// Command tests: runContentRegressionSnapshotUpdate
// ---------------------------------------------------------------------------

describe("runContentRegressionSnapshotUpdate", () => {
  let root: string;
  let appDir: string;
  let cacheCloneDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "creg-update-"));
    appDir = join(root, "apps", "test-system");
    cacheCloneDir = join(root, "cache-clones", "test-system");
    await mkdir(join(appDir, "src", "content"), { recursive: true });
    await mkdir(join(root, "systems"), { recursive: true });
    await mkdir(cacheCloneDir, { recursive: true });

    const registry = {
      systems: [
        {
          id: "test-system",
          mirrors: [{ path: "./cache-clones/test-system" }],
        },
      ],
    };
    await writeFile(join(root, "systems", "registry.yaml"), yamlStringify(registry));
    await writeFile(
      join(appDir, "astro.config.mjs"),
      `export default { site: "https://example.com" };`,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("prints diff and exits 0 without --confirm", async () => {
    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionSnapshotUpdate(input, context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("diff printed");
  });

  it("writes golden snapshot with --confirm", async () => {
    const input = makeInput({ confirm: true });
    const context = makeContext(root, appDir);
    const result = await runContentRegressionSnapshotUpdate(input, context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("golden snapshot written");

    // Verify file exists
    const { readFile } = await import("node:fs/promises");
    const goldenPath = join(
      cacheCloneDir,
      ".cache",
      "content-regression",
      "test-system.snapshot.yaml",
    );
    const content = await readFile(goldenPath, "utf8");
    const parsed = yamlParse(content) as ContentRegressionSnapshot;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.systemId).toBe("test-system");
    expect(parsed.routes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// RFC-0734: review.generate and apply tests
// ---------------------------------------------------------------------------

describe("runContentRegressionReviewGenerate (RFC-0734)", () => {
  let root: string;
  let appDir: string;
  let cacheCloneDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "creg-review-"));
    appDir = join(root, "apps", "test-system");
    cacheCloneDir = join(root, "cache-clones", "test-system");
    await mkdir(join(appDir, "src", "content"), { recursive: true });
    await mkdir(join(root, "systems"), { recursive: true });
    await mkdir(cacheCloneDir, { recursive: true });

    const registry = {
      systems: [
        {
          id: "test-system",
          mirrors: [{ path: "./cache-clones/test-system" }],
          currentMission: "test-system-m000001",
        },
      ],
    };
    await writeFile(join(root, "systems", "registry.yaml"), yamlStringify(registry));
    await writeFile(
      join(appDir, "astro.config.mjs"),
      `export default { site: "https://example.com" };`,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("emits CREG-03 error when no current mission in registry", async () => {
    // Overwrite registry without currentMission
    const registry = {
      systems: [
        {
          id: "test-system",
          mirrors: [{ path: "./cache-clones/test-system" }],
        },
      ],
    };
    await writeFile(join(root, "systems", "registry.yaml"), yamlStringify(registry));

    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionReviewGenerate(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string }> };
    expect(data.diagnostics[0].ruleId).toBe("CREG-03");
  });

  it("generates review.yaml with changes when drift exists", async () => {
    // Write golden snapshot with different content
    const goldenDir = join(cacheCloneDir, ".cache", "content-regression");
    await mkdir(goldenDir, { recursive: true });
    const goldenSnapshot: ContentRegressionSnapshot = {
      schemaVersion: 1,
      systemId: "test-system",
      contentHash: "sha256:different",
      routes: [
        {
          route: "/de/",
          blocks: [
            {
              id: "block-1",
              blockType: "prose",
              heading: "OLD HEADING",
              hash: "sha256:old",
            },
          ],
          hash: "sha256:old-route",
        },
      ],
    };
    await writeFile(
      join(goldenDir, "test-system.snapshot.yaml"),
      `# Generated\n${yamlStringify(goldenSnapshot)}`,
    );

    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionReviewGenerate(input, context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("change(s) detected");

    // Verify review.yaml was written
    const reviewPath = join(
      root,
      "missions",
      "test-system-m000001",
      "evidence",
      "content-regression",
      "review.yaml",
    );
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(reviewPath, "utf8");
    expect(content).toContain("Content Regression Review");
    expect(content).toContain("decision: pending");
  });

  it("dry-run prints review YAML without writing file", async () => {
    const input = makeInput({ "dry-run": true });
    const context = makeContext(root, appDir);
    const result = await runContentRegressionReviewGenerate(input, context);
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("dry run");
  });
});

describe("runContentRegressionApply (RFC-0734)", () => {
  let root: string;
  let appDir: string;
  let cacheCloneDir: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "creg-apply-"));
    appDir = join(root, "apps", "test-system");
    cacheCloneDir = join(root, "cache-clones", "test-system");
    await mkdir(join(appDir, "src", "content"), { recursive: true });
    await mkdir(join(root, "systems"), { recursive: true });
    await mkdir(cacheCloneDir, { recursive: true });

    const registry = {
      systems: [
        {
          id: "test-system",
          mirrors: [{ path: "./cache-clones/test-system" }],
          currentMission: "test-system-m000001",
        },
      ],
    };
    await writeFile(join(root, "systems", "registry.yaml"), yamlStringify(registry));
    await writeFile(
      join(appDir, "astro.config.mjs"),
      `export default { site: "https://example.com" };`,
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("emits CREG-04 when --review flag is missing", async () => {
    const input = makeInput();
    const context = makeContext(root, appDir);
    const result = await runContentRegressionApply(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string }> };
    expect(data.diagnostics[0].ruleId).toBe("CREG-04");
  });

  it("emits CREG-04 when review has pending decisions", async () => {
    // First generate a review
    const goldenDir = join(cacheCloneDir, ".cache", "content-regression");
    await mkdir(goldenDir, { recursive: true });
    const goldenSnapshot: ContentRegressionSnapshot = {
      schemaVersion: 1,
      systemId: "test-system",
      contentHash: "sha256:different",
      routes: [
        {
          route: "/de/",
          blocks: [
            {
              id: "block-1",
              blockType: "prose",
              heading: "OLD HEADING",
              hash: "sha256:old",
            },
          ],
          hash: "sha256:old-route",
        },
      ],
    };
    await writeFile(
      join(goldenDir, "test-system.snapshot.yaml"),
      `# Generated\n${yamlStringify(goldenSnapshot)}`,
    );

    const genInput = makeInput();
    const genContext = makeContext(root, appDir);
    await runContentRegressionReviewGenerate(genInput, genContext);

    // Read the generated review, then try to apply without filling decisions
    const reviewPath = join(
      root,
      "missions",
      "test-system-m000001",
      "evidence",
      "content-regression",
      "review.yaml",
    );
    const input = makeInput({ review: reviewPath });
    const context = makeContext(root, appDir);
    const result = await runContentRegressionApply(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string; message: string }> };
    expect(data.diagnostics[0].ruleId).toBe("CREG-04");
    expect(data.diagnostics[0].message).toContain("pending");
  });

  it("emits CREG-04 on stale review (currentSnapshotHash mismatch)", async () => {
    // Create a review.yaml with a wrong hash
    const missionDir = join(
      root,
      "missions",
      "test-system-m000001",
      "evidence",
      "content-regression",
    );
    await mkdir(missionDir, { recursive: true });
    const reviewYaml = `# Review
schemaVersion: 1
systemId: test-system
missionId: test-system-m000001
generatedAt: "2026-01-01T00:00:00.000Z"
goldenSnapshotHash: sha256:old
currentSnapshotHash: sha256:STALE
summary:
  totalChanges: 1
  addedRoutes: 0
  removedRoutes: 0
  changedRoutes: 1
changes:
  - id: change-001
    route: /de/
    kind: block-field
    blockId: block-1
    field: heading
    golden: OLD HEADING
    current: Welcome
    decision: accept
    fixValue: ""
    note: ""
`;
    const reviewPath = join(missionDir, "review.yaml");
    await writeFile(reviewPath, reviewYaml);

    const input = makeInput({ review: reviewPath });
    const context = makeContext(root, appDir);
    const result = await runContentRegressionApply(input, context);
    expect(result.exitCode).toBe(1);
    const data = result.data as { diagnostics: Array<{ ruleId: string; message: string }> };
    const creg04 = data.diagnostics.find((d) => d.ruleId === "CREG-04");
    expect(creg04).toBeDefined();
    expect(creg04!.message).toContain("changed");
  });
});
