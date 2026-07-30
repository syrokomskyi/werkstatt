import { test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0599: the fingerprint cache short-circuit in runGenerateOpenSourcePage
  checks ALL declared output paths, not just the content page. Missing any output
  file triggers full regeneration even when the fingerprint matches.
</purpose>
<responsibilities>
  <item>Assert that when all outputs exist and fingerprint matches, the generator returns "up to date".</item>
  <item>Assert that when a public artifact is missing but fingerprint matches, the generator proceeds to regeneration.</item>
  <item>Assert that when a content page is missing but fingerprint matches, the generator proceeds to regeneration.</item>
</responsibilities>
<non-goals>
  <item>Do not test the full pnpm-licenses pipeline — execFileSync is mocked.</item>
  <item>Do not test SBOM content or license normalization — those are covered by other tests.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0599: initial test suite for fingerprint cache output completeness verification.</item>
</CHANGE_SUMMARY>
*/

// Mock execFileSync so we don't need real pnpm-licenses
const mockExecFileSync = vi.fn();

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: mockExecFileSync,
  };
});

// Mock @quantco/pnpm-licenses bin resolution
vi.mock("node:module", () => ({
  createRequire: () => ({
    resolve: () => "/mocked/pnpm-licenses/dist/index.mjs",
  }),
}));

// Track whether regeneration logic was invoked (execFileSync called = regeneration happened)
function resetMocks() {
  mockExecFileSync.mockReset();
  // First call: pnpm licenses list --prod --json → return minimal valid JSON
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (args.includes("list") && args.includes("--prod") && args.includes("--json")) {
      return JSON.stringify([]);
    }
    return "";
  });
}

/**
 * Create a minimal site workspace with system.md, i18n config, labels.md,
 * and optional pre-existing output files.
 */
async function createTestWorkspace(opts: {
  withAllOutputs?: boolean;
  missingArtifact?: string;
  missingContentPage?: boolean;
  missingProsePage?: boolean;
  missingRegistryJson?: boolean;
}): Promise<{ appDir: string; cleanup: () => Promise<void> }> {
  const appDir = await fs.mkdtemp(path.join(os.tmpdir(), "open-source-test-"));
  const srcDir = path.join(appDir, "src");
  const contentDir = path.join(srcDir, "content");
  const pagesDir = path.join(contentDir, "pages", "de");
  const proseDir = path.join(contentDir, "prose", "de");
  const dataDir = path.join(contentDir, "data", "de");
  const siteDir = path.join(contentDir, "site", "de");
  const publicOpenSourceDir = path.join(appDir, "public", "open-source");
  const cacheDir = path.join(appDir, ".cache");

  await fs.mkdir(pagesDir, { recursive: true });
  await fs.mkdir(proseDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(siteDir, { recursive: true });
  await fs.mkdir(publicOpenSourceDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  // system.md with openSource page enabled and i18n config
  const systemMd = `---
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de-DE
pages:
  - route: /open-source
    pageId: openSource
identity:
  domain: test.example.com
  biome: handwerk-material-warm
---
`;
  await fs.writeFile(path.join(contentDir, "system.md"), systemMd, "utf8");

  // labels.md for de
  await fs.writeFile(
    path.join(siteDir, "labels.md"),
    "---\nheading: Open Source\nleadText: Test\n---\n",
    "utf8",
  );

  // package.json and pnpm-lock.yaml (fingerprint inputs)
  await fs.writeFile(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "test-app", version: "1.0.0" }),
    "utf8",
  );
  await fs.writeFile(path.join(appDir, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

  // Compute the fingerprint that the generator will produce.
  // The fingerprint inputs are: appDir/package.json, appDir/pnpm-lock.yaml,
  // workspaceRoot/pnpm-lock.yaml, contentDir/system.md, contentDir/site/de/labels.md
  // We need to pre-populate the cache with a matching fingerprint.
  // Since we mock execFileSync, the generator will compute the fingerprint from
  // these files and compare against the cache file. We'll write the cache file
  // after the first run, or we can compute it ourselves.

  // Pre-create output files if requested
  if (opts.withAllOutputs) {
    await fs.writeFile(path.join(pagesDir, "open-source.md"), "# Open Source", "utf8");
    await fs.writeFile(path.join(proseDir, "open-source.md"), "# Open Source Prose", "utf8");
    await fs.writeFile(path.join(dataDir, "open-source-registry.json"), "[]", "utf8");
    await fs.writeFile(
      path.join(publicOpenSourceDir, "THIRD_PARTY_NOTICES.txt"),
      "notices",
      "utf8",
    );
    await fs.writeFile(
      path.join(publicOpenSourceDir, "THIRD_PARTY_LICENSES.txt"),
      "licenses",
      "utf8",
    );
    await fs.writeFile(path.join(publicOpenSourceDir, "sbom.cdx.json"), '{"type":"sbom"}', "utf8");
  }

  // Remove specific files to simulate missing outputs
  if (opts.missingArtifact === "THIRD_PARTY_LICENSES.txt") {
    await fs.rm(path.join(publicOpenSourceDir, "THIRD_PARTY_LICENSES.txt")).catch(() => {});
  }
  if (opts.missingArtifact === "THIRD_PARTY_NOTICES.txt") {
    await fs.rm(path.join(publicOpenSourceDir, "THIRD_PARTY_NOTICES.txt")).catch(() => {});
  }
  if (opts.missingArtifact === "sbom.cdx.json") {
    await fs.rm(path.join(publicOpenSourceDir, "sbom.cdx.json")).catch(() => {});
  }
  if (opts.missingContentPage) {
    await fs.rm(path.join(pagesDir, "open-source.md")).catch(() => {});
  }
  if (opts.missingProsePage) {
    await fs.rm(path.join(proseDir, "open-source.md")).catch(() => {});
  }
  if (opts.missingRegistryJson) {
    await fs.rm(path.join(dataDir, "open-source-registry.json")).catch(() => {});
  }

  return {
    appDir,
    cleanup: async () => {
      await fs.rm(appDir, { recursive: true, force: true });
    },
  };
}

/**
 * Compute the fingerprint the same way the generator does, so we can
 * pre-populate the cache file with a matching fingerprint.
 */
async function computeFingerprint(appDir: string, workspaceRoot: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const contentDir = path.join(appDir, "src", "content");
  const files = [
    path.join(appDir, "package.json"),
    path.join(appDir, "pnpm-lock.yaml"),
    path.join(workspaceRoot, "pnpm-lock.yaml"),
    path.join(contentDir, "system.md"),
    path.join(contentDir, "site", "de", "labels.md"),
  ];
  const hash = createHash("sha256");
  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      hash.update(path.basename(filePath));
      hash.update("\n");
      hash.update(raw);
      hash.update("\n");
    } catch {
      // skip missing files
    }
  }
  return hash.digest("hex");
}

async function writeFingerprintCache(appDir: string, fingerprint: string): Promise<void> {
  const cacheFile = path.join(appDir, ".cache", "open-source.fingerprint");
  await fs.writeFile(cacheFile, `${fingerprint}\n`, "utf8");
}

function makeContext(appDir: string, workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: {
      name: "test-app",
      directory: appDir,
      packageJsonPath: path.join(appDir, "package.json"),
    } as never,
    dryRun: false,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  } as unknown as KernelRuntimeContext;
}

const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

beforeEach(() => {
  resetMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("RFC-0599: returns 'up to date' when all outputs exist and fingerprint matches", async () => {
  const { runGenerateOpenSourcePage } = await import("../open-source-page.ts");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-root-"));
  const { appDir, cleanup } = await createTestWorkspace({ withAllOutputs: true });

  try {
    // Write a pnpm-lock.yaml at workspace root (fingerprint input)
    await fs.writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const fingerprint = await computeFingerprint(appDir, workspaceRoot);
    await writeFingerprintCache(appDir, fingerprint);

    const result = (await runGenerateOpenSourcePage(input, makeContext(appDir, workspaceRoot))) as {
      summary?: string;
    };

    expect(result.summary).toContain("up to date");
    // execFileSync should NOT be called for pnpm licenses list (short-circuit)
    expect(mockExecFileSync).not.toHaveBeenCalled();
  } finally {
    await cleanup();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RFC-0599: regenerates when THIRD_PARTY_LICENSES.txt is missing but fingerprint matches", async () => {
  const { runGenerateOpenSourcePage } = await import("../open-source-page.ts");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-root-"));
  const { appDir, cleanup } = await createTestWorkspace({
    withAllOutputs: true,
    missingArtifact: "THIRD_PARTY_LICENSES.txt",
  });

  try {
    await fs.writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const fingerprint = await computeFingerprint(appDir, workspaceRoot);
    await writeFingerprintCache(appDir, fingerprint);

    // The regeneration path will throw because execFileSync mock doesn't write
    // real pnpm-licenses output files. The key assertion is that execFileSync
    // was called — proving the short-circuit did NOT trigger.
    let result: { summary?: string } | undefined;
    try {
      result = (await runGenerateOpenSourcePage(input, makeContext(appDir, workspaceRoot))) as {
        summary?: string;
      };
    } catch {
      // Expected: regeneration path fails on missing mock output files
    }

    if (result?.summary) {
      expect(result.summary).not.toContain("up to date");
    }
    // execFileSync SHOULD be called (regeneration path was entered)
    expect(mockExecFileSync).toHaveBeenCalled();
  } finally {
    await cleanup();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RFC-0599: regenerates when content page is missing but fingerprint matches", async () => {
  const { runGenerateOpenSourcePage } = await import("../open-source-page.ts");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-root-"));
  const { appDir, cleanup } = await createTestWorkspace({
    withAllOutputs: true,
    missingContentPage: true,
  });

  try {
    await fs.writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const fingerprint = await computeFingerprint(appDir, workspaceRoot);
    await writeFingerprintCache(appDir, fingerprint);

    let result: { summary?: string } | undefined;
    try {
      result = (await runGenerateOpenSourcePage(input, makeContext(appDir, workspaceRoot))) as {
        summary?: string;
      };
    } catch {
      // Expected: regeneration path fails on missing mock output files
    }

    if (result?.summary) {
      expect(result.summary).not.toContain("up to date");
    }
    expect(mockExecFileSync).toHaveBeenCalled();
  } finally {
    await cleanup();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RFC-0599: regenerates when sbom.cdx.json is missing but fingerprint matches", async () => {
  const { runGenerateOpenSourcePage } = await import("../open-source-page.ts");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-root-"));
  const { appDir, cleanup } = await createTestWorkspace({
    withAllOutputs: true,
    missingArtifact: "sbom.cdx.json",
  });

  try {
    await fs.writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const fingerprint = await computeFingerprint(appDir, workspaceRoot);
    await writeFingerprintCache(appDir, fingerprint);

    let result: { summary?: string } | undefined;
    try {
      result = (await runGenerateOpenSourcePage(input, makeContext(appDir, workspaceRoot))) as {
        summary?: string;
      };
    } catch {
      // Expected: regeneration path fails on missing mock output files
    }

    if (result?.summary) {
      expect(result.summary).not.toContain("up to date");
    }
    expect(mockExecFileSync).toHaveBeenCalled();
  } finally {
    await cleanup();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("RFC-0599: regenerates when prose page is missing but fingerprint matches", async () => {
  const { runGenerateOpenSourcePage } = await import("../open-source-page.ts");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ws-root-"));
  const { appDir, cleanup } = await createTestWorkspace({
    withAllOutputs: true,
    missingProsePage: true,
  });

  try {
    await fs.writeFile(path.join(workspaceRoot, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const fingerprint = await computeFingerprint(appDir, workspaceRoot);
    await writeFingerprintCache(appDir, fingerprint);

    let result: { summary?: string } | undefined;
    try {
      result = (await runGenerateOpenSourcePage(input, makeContext(appDir, workspaceRoot))) as {
        summary?: string;
      };
    } catch {
      // Expected: regeneration path fails on missing mock output files
    }

    if (result?.summary) {
      expect(result.summary).not.toContain("up to date");
    }
    expect(mockExecFileSync).toHaveBeenCalled();
  } finally {
    await cleanup();
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
});
