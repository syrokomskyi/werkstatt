import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runEcosystemCommit } from "../ecosystem-commit.ts";

const execFileAsync = promisify(execFile);

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

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

function input(flags: Record<string, unknown>): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function setupWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ecosystem-commit-"));
  await mkdir(join(root, "packages", "dummy"), { recursive: true });
  await mkdir(join(root, "docs", "rfcs"), { recursive: true });
  await writeJson(join(root, "package.json"), { name: "test-platform", version: "1.0.0" });
  await writeFile(join(root, "packages", "dummy", "index.ts"), "export const x = 1;\n", "utf8");
  // Init git repo
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });
  return root;
}

async function stageFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(root, relPath.split("/").slice(0, -1).join("/")), { recursive: true });
  await writeFile(abs, content, "utf8");
  await execFileAsync("git", ["add", relPath], { cwd: root });
}

async function writeRfc(root: string, rfcId: string, versionBump?: string): Promise<void> {
  const slug = rfcId.toLowerCase();
  const content = `---
id: ${rfcId}
title: "Test RFC"
status: accepted
versionBump: ${versionBump ?? "patch"}
---

# ${rfcId}
`;
  await writeFile(join(root, "docs", "rfcs", `${slug}-test.md`), content, "utf8");
}

describe("ecosystem.commit", () => {
  it("EC-01: blocks when no staged files at all", async () => {
    const root = await setupWorkspace();
    try {
      const result = await runEcosystemCommit(input({ message: "test" }), ctx(root));
      expect(result.exitCode).toBe(1);
      expect(result.data?.status).toBe("blocked");
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-01");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // RFC-0754: non-platform-only commit — new fallback path

  it("RFC-0754: non-platform-only commit succeeds without version bump (dry-run)", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "docs: update readme", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: non-platform-only commit succeeds without version bump (actual)", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(input({ message: "docs: update readme" }), ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("ok");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
      expect(result.data?.commitSha).toBeTruthy();
      // Verify commit message does NOT have platform trailers
      const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B"], { cwd: root });
      expect(stdout).not.toContain("X-Platform-Bump");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: mixed-scope commit splits into two commits (dry-run)", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: add y and docs", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.bumpType).toBe("patch");
      expect(result.data?.newVersion).toBe("1.0.1");
      expect(result.data?.nonPlatformCommit).toBeDefined();
      expect(result.data?.nonPlatformCommit?.files).toContain("docs/readme.md");
      // Verify no commit was made
      const { stdout } = await execFileAsync("git", ["log", "--oneline"], { cwd: root });
      expect(stdout.trim().split("\n").length).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: mixed-scope commit splits into two commits (actual)", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: add y and docs" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("ok");
      expect(result.data?.newVersion).toBe("1.0.1");
      expect(result.data?.commitSha).toBeTruthy();
      expect(result.data?.nonPlatformCommit).toBeDefined();
      expect(result.data?.nonPlatformCommit?.sha).toBeTruthy();
      expect(result.data?.nonPlatformCommit?.files).toContain("docs/readme.md");
      // Verify two commits were made (plus initial = 3 total)
      const { stdout } = await execFileAsync("git", ["log", "--oneline"], { cwd: root });
      const lines = stdout.trim().split("\n");
      expect(lines.length).toBe(3);
      // First commit (HEAD) is non-platform, second is platform
      const { stdout: headMsg } = await execFileAsync("git", ["log", "-1", "--format=%B"], {
        cwd: root,
      });
      expect(headMsg).not.toContain("X-Platform-Bump");
      const { stdout: prevMsg } = await execFileAsync(
        "git",
        ["log", "-2", "--format=%B", "--reverse"],
        { cwd: root },
      );
      // The platform commit (second from HEAD) should have trailers
      const { stdout: platformMsg } = await execFileAsync(
        "git",
        ["log", "-2", "--format=%B", "--skip=1"],
        { cwd: root },
      );
      expect(platformMsg).toContain("X-Platform-Bump: patch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: --rfc trailer on platform commit only in mixed-scope", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9003", "patch");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: add y and docs", rfc: "RFC-9003", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.rfcId).toBe("RFC-9003");
      expect(result.data?.nonPlatformCommit).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: EC-11 --amend with non-platform only → error", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "docs: update readme", amend: true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-11");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0754: skipPlatformBump preserved — .md files in packages/ still skip bump in mixed-scope", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/AGENTS.md", "# Agent Guide\n");
      await stageFile(root, "docs/readme.md", "# readme\n");
      const result = await runEcosystemCommit(
        input({ message: "docs: update docs", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
      expect(result.data?.nonPlatformCommit).toBeDefined();
      expect(result.data?.nonPlatformCommit?.files).toContain("docs/readme.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-02: blocks when package.json is already staged", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      // Modify and stage package.json
      await writeJson(join(root, "package.json"), {
        name: "test-platform",
        version: "1.0.0",
        custom: true,
      });
      await execFileAsync("git", ["add", "package.json"], { cwd: root });
      const result = await runEcosystemCommit(input({ message: "test" }), ctx(root));
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-02");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-04: blocks when RFC not found", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9999" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-04");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-05: blocks when versionBump absent in RFC", async () => {
    const root = await setupWorkspace();
    try {
      // Write an RFC without versionBump
      const content = `---
id: RFC-9001
title: "No versionBump"
status: accepted
---

# RFC-9001
`;
      await writeFile(join(root, "docs", "rfcs", "rfc-9001-test.md"), content, "utf8");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9001" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-05");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-06: blocks when versionBump is none and staged files include code", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9002", "none");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9002" }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-06");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("docs-only .md files in packages/** skip version bump (versionBump: none)", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9003", "none");
      await stageFile(root, "packages/dummy/AGENTS.md", "# Agent Guide\n");
      const result = await runEcosystemCommit(
        input({ message: "docs: update AGENTS.md", rfc: "RFC-9003", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("docs-only .md files in packages/** skip version bump (no --rfc)", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/AGENTS.md", "# Agent Guide\n");
      const result = await runEcosystemCommit(
        input({ message: "docs: update AGENTS.md", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("mixed .md and .ts files in packages/** do NOT skip version bump", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9004", "none");
      await stageFile(root, "packages/dummy/AGENTS.md", "# Agent Guide\n");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test", rfc: "RFC-9004", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-06");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("default patch bump without --rfc", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.bumpType).toBe("patch");
      expect(result.data?.previousVersion).toBe("1.0.0");
      expect(result.data?.newVersion).toBe("1.0.1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--rfc reads versionBump from frontmatter", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9003", "minor");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9003", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("minor");
      expect(result.data?.newVersion).toBe("1.1.0");
      expect(result.data?.rfcId).toBe("RFC-9003");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--bump flag overrides RFC versionBump", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9004", "patch");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9004", bump: "minor", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("minor");
      expect(result.data?.newVersion).toBe("1.1.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--bump flag works without --rfc", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", bump: "major", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("major");
      expect(result.data?.newVersion).toBe("2.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-10: blocks on invalid --bump value", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", bump: "mega", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-10");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads versionBump from archived RFC in docs/rfcs/archive/", async () => {
    const root = await setupWorkspace();
    try {
      // Create archived RFC directory structure
      await mkdir(join(root, "docs", "rfcs", "archive", "implemented"), { recursive: true });
      const content = `---
id: RFC-9005
title: "Archived RFC"
status: implemented
versionBump: minor
---

# RFC-9005
`;
      await writeFile(
        join(root, "docs", "rfcs", "archive", "implemented", "rfc-9005-test.md"),
        content,
        "utf8",
      );
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9005", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("minor");
      expect(result.data?.newVersion).toBe("1.1.0");
      expect(result.data?.rfcId).toBe("RFC-9005");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads versionBump from draft RFC in docs/rfcs/draft/", async () => {
    const root = await setupWorkspace();
    try {
      await mkdir(join(root, "docs", "rfcs", "draft"), { recursive: true });
      const content = `---
id: RFC-9008
title: "Draft RFC"
status: accepted
versionBump: minor
---

# RFC-9008
`;
      await writeFile(join(root, "docs", "rfcs", "draft", "rfc-9008-test.md"), content, "utf8");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9008", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.bumpType).toBe("minor");
      expect(result.data?.rfcId).toBe("RFC-9008");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("EC-05: blocks when archived RFC has no versionBump", async () => {
    const root = await setupWorkspace();
    try {
      await mkdir(join(root, "docs", "rfcs", "archive", "implemented"), { recursive: true });
      const content = `---
id: RFC-9006
title: "Archived RFC without versionBump"
status: implemented
---

# RFC-9006
`;
      await writeFile(
        join(root, "docs", "rfcs", "archive", "implemented", "rfc-9006-test.md"),
        content,
        "utf8",
      );
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9006", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-05");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--bump override does not bypass EC-06 when RFC has versionBump: none", async () => {
    const root = await setupWorkspace();
    try {
      await writeRfc(root, "RFC-9007", "none");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", rfc: "RFC-9007", bump: "minor", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(1);
      const codes = result.data?.violations?.map((v) => v.code) ?? [];
      expect(codes).toContain("EC-06");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("--dry-run returns forecast without committing", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "test change", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.commitSha).toBeNull();
      // Verify no commit was made
      const { stdout } = await execFileAsync("git", ["log", "--oneline"], { cwd: root });
      expect(stdout.trim().split("\n").length).toBe(1); // only initial commit
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("actual commit bumps version and writes trailers", async () => {
    const root = await setupWorkspace();
    try {
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(input({ message: "feat: add y" }), ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("ok");
      expect(result.data?.newVersion).toBe("1.0.1");
      expect(result.data?.commitSha).toBeTruthy();
      // Verify commit message has trailers
      const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B"], { cwd: root });
      expect(stdout).toContain("X-Platform-Bump: patch");
      expect(stdout).toContain("X-Platform-Version: 1.0.1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // RFC-0704: Independent version packages — skip-bump tests

  async function setupWorkspaceWithIndependentPkg(): Promise<string> {
    const root = await setupWorkspace();
    // Create packages/forge with a package.json
    await mkdir(join(root, "packages", "forge", "src"), { recursive: true });
    await writeJson(join(root, "packages", "forge", "package.json"), {
      name: "@warpgogol/forge",
      version: "0.1.0",
    });
    await writeFile(
      join(root, "packages", "forge", "src", "index.ts"),
      "export const x = 1;\n",
      "utf8",
    );
    // Write forge.yaml with independentVersionPackages
    await writeFile(
      join(root, "forge.yaml"),
      "schema: forge/config@1\nproject:\n  name: test\n  stack: []\n  packageManager: pnpm\nindependentVersionPackages:\n  - packages/forge\n",
      "utf8",
    );
    // Commit the new files so git is clean
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "add forge pkg"], { cwd: root });
    return root;
  }

  it("RFC-0704: skips platform bump when all staged files are in independentVersionPackages", async () => {
    const root = await setupWorkspaceWithIndependentPkg();
    try {
      await stageFile(root, "packages/forge/src/index.ts", "export const x = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: update forge", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: actual commit with skip-bump does not write trailers or bump version", async () => {
    const root = await setupWorkspaceWithIndependentPkg();
    try {
      await stageFile(root, "packages/forge/src/index.ts", "export const x = 2;\n");
      const result = await runEcosystemCommit(input({ message: "feat: update forge" }), ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("ok");
      expect(result.data?.skipPlatformBump).toBe(true);
      expect(result.data?.bumpType).toBe("none");
      expect(result.data?.commitSha).toBeTruthy();
      // Verify commit message does NOT have platform trailers
      const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B"], { cwd: root });
      expect(stdout).not.toContain("X-Platform-Bump");
      expect(stdout).not.toContain("X-Platform-Version");
      // Verify package.json version was NOT bumped
      const pkgContent = await readFile(join(root, "package.json"), "utf8");
      const pkg = JSON.parse(pkgContent) as { version: string };
      expect(pkg.version).toBe("1.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: normal bump when staged files are in both independent and non-independent packages", async () => {
    const root = await setupWorkspaceWithIndependentPkg();
    try {
      await stageFile(root, "packages/forge/src/index.ts", "export const x = 2;\n");
      await stageFile(root, "packages/dummy/index.ts", "export const y = 3;\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: update both", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.status).toBe("dry-run");
      expect(result.data?.skipPlatformBump).toBeUndefined();
      expect(result.data?.bumpType).toBe("patch");
      expect(result.data?.newVersion).toBe("1.0.1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: warns and proceeds with normal bump when independentVersionPackages has invalid path", async () => {
    const root = await setupWorkspace();
    try {
      // Write forge.yaml with an invalid independent package path
      await writeFile(
        join(root, "forge.yaml"),
        "schema: forge/config@1\nproject:\n  name: test\n  stack: []\n  packageManager: pnpm\nindependentVersionPackages:\n  - packages/nonexistent\n",
        "utf8",
      );
      await execFileAsync("git", ["add", "forge.yaml"], { cwd: root });
      await execFileAsync("git", ["commit", "-m", "add forge.yaml"], { cwd: root });
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: update dummy", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.skipPlatformBump).toBeUndefined();
      expect(result.data?.bumpType).toBe("patch");
      expect(result.data?.warnings).toBeDefined();
      expect(result.data?.warnings?.some((w) => w.includes("packages/nonexistent"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: path matching — packages/forge does NOT match packages/forge-os", async () => {
    const root = await setupWorkspace();
    try {
      // Create packages/forge-os with a package.json
      await mkdir(join(root, "packages", "forge-os", "src"), { recursive: true });
      await writeJson(join(root, "packages", "forge-os", "package.json"), {
        name: "@warpgogol/forge-os",
        version: "0.1.0",
      });
      await writeFile(
        join(root, "packages", "forge-os", "src", "index.ts"),
        "export const x = 1;\n",
        "utf8",
      );
      // Write forge.yaml with packages/forge as independent (NOT packages/forge-os)
      await writeFile(
        join(root, "forge.yaml"),
        "schema: forge/config@1\nproject:\n  name: test\n  stack: []\n  packageManager: pnpm\nindependentVersionPackages:\n  - packages/forge\n",
        "utf8",
      );
      await execFileAsync("git", ["add", "."], { cwd: root });
      await execFileAsync("git", ["commit", "-m", "add forge-os"], { cwd: root });
      // Stage a file in packages/forge-os — should NOT trigger skip-bump
      await stageFile(root, "packages/forge-os/src/index.ts", "export const x = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: update forge-os", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.skipPlatformBump).toBeUndefined();
      expect(result.data?.bumpType).toBe("patch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: normal bump when no independentVersionPackages in forge.yaml (backward compatible)", async () => {
    const root = await setupWorkspace();
    try {
      // Write forge.yaml without independentVersionPackages
      await writeFile(
        join(root, "forge.yaml"),
        "schema: forge/config@1\nproject:\n  name: test\n  stack: []\n  packageManager: pnpm\n",
        "utf8",
      );
      await execFileAsync("git", ["add", "forge.yaml"], { cwd: root });
      await execFileAsync("git", ["commit", "-m", "add forge.yaml"], { cwd: root });
      await stageFile(root, "packages/dummy/index.ts", "export const y = 2;\n");
      const result = await runEcosystemCommit(
        input({ message: "feat: update dummy", "dry-run": true }),
        ctx(root),
      );
      expect(result.exitCode).toBe(0);
      expect(result.data?.skipPlatformBump).toBeUndefined();
      expect(result.data?.bumpType).toBe("patch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("RFC-0704: --amend works with skip-bump mode", async () => {
    const root = await setupWorkspaceWithIndependentPkg();
    try {
      // First commit via ecosystem.commit (skip-bump)
      await stageFile(root, "packages/forge/src/index.ts", "export const x = 2;\n");
      const result1 = await runEcosystemCommit(input({ message: "feat: update forge" }), ctx(root));
      expect(result1.exitCode).toBe(0);
      expect(result1.data?.skipPlatformBump).toBe(true);

      // Amend the skip-bump commit
      await stageFile(root, "packages/forge/src/index.ts", "export const x = 3;\n");
      const result2 = await runEcosystemCommit(
        input({ message: "feat: update forge v2", amend: true }),
        ctx(root),
      );
      expect(result2.exitCode).toBe(0);
      expect(result2.data?.skipPlatformBump).toBe(true);
      expect(result2.data?.status).toBe("ok");

      // Verify the commit message was amended (not a new commit)
      const { stdout: logOut } = await execFileAsync("git", ["log", "--oneline"], { cwd: root });
      const lines = logOut.trim().split("\n");
      // Should have: initial, add forge pkg, and 1 ecosystem.commit (amended)
      expect(lines.length).toBe(3);
      // Verify the amended message
      const { stdout: msgOut } = await execFileAsync("git", ["log", "-1", "--format=%B"], {
        cwd: root,
      });
      expect(msgOut).toContain("feat: update forge v2");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
