/*
<MODULE_CONTRACT>
  <purpose>Unit tests for workshop.scaffold (RFC-0779). Covers SCAFFOLD-01..06 failure modes and happy path.</purpose>
  <non-goals>
    <item>Do not test forge.init internals — those have their own tests.</item>
    <item>Do not test actual pnpm install — mock execSync for --verify tests.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0779: initial workshop.scaffold unit tests.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runWorkshopScaffold, type ScaffoldWorkshopResult } from "./workshop-scaffold.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "../kernel/types.ts";

// Mock forge imports — workshop.scaffold delegates to forge.init and forge.agents.generate
vi.mock("@warpgogol/forge", () => ({
  runInit: vi.fn(() => ({
    status: "pass",
    command: "forge.init",
    created: ["forge.yaml", "PREFERENCES.md", ".agents/skills/fo-idea/SKILL.md"],
    skipped: [],
    errors: [],
    skippedSkills: [],
  })),
  runAgentsGenerate: vi.fn(async () => ({
    data: {
      command: "forge.agents.generate",
      status: "pass",
      configPath: "forge.yaml",
      generated: ["AGENTS.md"],
    },
    exitCode: 0,
  })),
  resolveForgeRoot: vi.fn(() => "/fake/forge/root"),
  scaffoldMemoryLayer: vi.fn(() => ({
    created: [".agents/memory/MEMORY.md", ".agents/memory/daily/.gitkeep"],
    gitignoreUpdated: true,
    skipped: [],
  })),
}));

// Mock execSync — ESM modules are not configurable, so we mock at module level.
// vi.hoisted ensures the mock fn is available when vi.mock's factory is hoisted.
const { execSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

function makeContext(workspaceRoot: string, dryRun = false): KernelRuntimeContext {
  return {
    workspaceRoot,
    siteExplicit: false,
    logger: {
      section: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      event: () => {},
      getEvents: () => [],
    } as unknown as KernelRuntimeContext["logger"],
    dryRun,
    outputFormat: "json",
    io: {} as unknown as KernelRuntimeContext["io"],
  };
}

function makeInput(flags: Record<string, unknown>): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

describe("workshop.scaffold", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "workshop-test-"));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("SCAFFOLD-01: unknown stack profile", () => {
    it("fails with exit code 1 for unknown stack", async () => {
      const dest = path.join(tempDir, "workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "unknown-stack", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("fail");
      expect(data.errors[0]).toContain("SCAFFOLD-01");
      expect(data.errors[0]).toContain("Unknown stack profile");
    });
  });

  describe("SCAFFOLD-05: destination directory not empty", () => {
    it("fails when destination exists and is non-empty", async () => {
      const dest = path.join(tempDir, "existing-workshop");
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, "some-file.txt"), "content");

      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("fail");
      expect(data.errors[0]).toContain("SCAFFOLD-05");
      expect(data.errors[0]).toContain("not empty");
    });
  });

  describe("missing required flags", () => {
    it("fails when --name is missing", async () => {
      const result = await runWorkshopScaffold(
        makeInput({ stack: "phaser-turborepo", dest: "/tmp/test" }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.errors[0]).toContain("Missing required flag: --name");
    });

    it("fails when --stack is missing", async () => {
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", dest: "/tmp/test" }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.errors[0]).toContain("Missing required flag: --stack");
    });

    it("fails when --dest is missing", async () => {
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo" }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.errors[0]).toContain("Missing required flag: --dest");
    });
  });

  describe("kebab-case name validation", () => {
    it("fails for non-kebab-case name", async () => {
      const result = await runWorkshopScaffold(
        makeInput({ name: "My_Workshop", stack: "phaser-turborepo", dest: "/tmp/test" }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("fail");
      expect(data.errors[0]).toContain("kebab-case");
    });
  });

  describe("dry-run mode", () => {
    it("returns pass and lists files without writing", async () => {
      const dest = path.join(tempDir, "dry-run-workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest }),
        makeContext(tempDir, true),
      );
      expect(result.exitCode).toBe(0);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("pass");
      expect(data.filesCreated.length).toBeGreaterThan(0);
      expect(data.filesCreated).toContain("package.json");
      expect(data.filesCreated).toContain("tools/kernel.config.ts");
      expect(data.verification).toEqual({
        "forge.doctor": "skipped",
        "werkstatt.plugin.validate": "skipped",
        "werkstatt.autonomy.validate": "skipped",
      });
      // Directory should not exist after dry-run
      expect(fs.existsSync(dest)).toBe(false);
    });
  });

  describe("happy path — phaser-turborepo stack", () => {
    it("creates all workshop files and delegates to forge.init", async () => {
      const dest = path.join(tempDir, "game-workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-game-workshop", stack: "phaser-turborepo", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("pass");
      expect(data.workshop.name).toBe("my-game-workshop");
      expect(data.workshop.stack).toBe("phaser-turborepo");
      expect(data.workshop.plugin).toBe("@warpgogol/werkstatt-game");
      expect(data.workshop.engine).toBe("@warpgogol/werkstatt");

      // Check workshop-specific files exist
      expect(fs.existsSync(path.join(dest, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "pnpm-workspace.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "turbo.json"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "tools/kernel.config.ts"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".npmrc"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "tsconfig/base.json"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "eslint.config.js"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".prettierrc.mjs"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".gitignore"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".gitattributes"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "hooks/pre-commit"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".github/workflows/ci.yml"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "systems-cache/.gitkeep"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "missions/.gitkeep"))).toBe(true);
      expect(fs.existsSync(path.join(dest, ".forge/pinned.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(dest, "README.md"))).toBe(true);

      // Check pre-commit is executable
      const stat = fs.statSync(path.join(dest, "hooks/pre-commit"));
      expect(stat.mode & 0o100).toBeTruthy();

      // Check package.json content
      const pkgJson = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
      expect(pkgJson.name).toBe("my-game-workshop");
      expect(pkgJson.dependencies["@warpgogol/werkstatt"]).toBe("latest");
      expect(pkgJson.dependencies["@warpgogol/werkstatt-game"]).toBe("latest");
      expect(pkgJson.dependencies["@warpgogol/forge"]).toBe("latest");

      // Check kernel.config.ts content
      const kernelConfig = fs.readFileSync(path.join(dest, "tools/kernel.config.ts"), "utf8");
      expect(kernelConfig).toContain("my-game-workshop");
      expect(kernelConfig).toContain("werkstattGamePlugin");
      expect(kernelConfig).toContain("@warpgogol/werkstatt-game");

      // .gitattributes should NOT have LFS patterns for game stack
      const gitattributes = fs.readFileSync(path.join(dest, ".gitattributes"), "utf8");
      expect(gitattributes).not.toContain("filter=lfs");

      // forge.init should have been called
      const { runInit } = await import("@warpgogol/forge");
      expect(runInit).toHaveBeenCalled();
    });
  });

  describe("stack-specific customization — site stack", () => {
    it("includes LFS patterns in .gitattributes for astro-typescript-turborepo", async () => {
      const dest = path.join(tempDir, "site-workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-site-workshop", stack: "astro-typescript-turborepo", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);

      const gitattributes = fs.readFileSync(path.join(dest, ".gitattributes"), "utf8");
      expect(gitattributes).toContain("filter=lfs");
      expect(gitattributes).toContain("*.mp4");
      expect(gitattributes).toContain("*.png");

      const pkgJson = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
      expect(pkgJson.dependencies["@warpgogol/werkstatt-site"]).toBe("latest");
    });
  });

  describe("stack-specific customization — video stack", () => {
    it("does not include LFS patterns for editframe stack", async () => {
      const dest = path.join(tempDir, "video-workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-video-workshop", stack: "editframe", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);

      const gitattributes = fs.readFileSync(path.join(dest, ".gitattributes"), "utf8");
      expect(gitattributes).not.toContain("filter=lfs");

      const pkgJson = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
      expect(pkgJson.dependencies["@warpgogol/werkstatt-video"]).toBe("latest");
    });
  });

  describe("empty destination directory is allowed", () => {
    it("succeeds when destination exists but is empty", async () => {
      const dest = path.join(tempDir, "empty-workshop");
      fs.mkdirSync(dest, { recursive: true });

      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("pass");
    });
  });

  describe("SCAFFOLD-06: npm auth failure during --verify", () => {
    it("fails with SCAFFOLD-06 when pnpm install hits auth error", async () => {
      const dest = path.join(tempDir, "verify-workshop");
      execSyncMock.mockImplementation(() => {
        const err = new Error("pnpm install failed") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("E401 unable to authenticate");
        throw err;
      });

      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest, verify: true }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("fail");
      expect(data.errors[0]).toContain("SCAFFOLD-06");
    });
  });

  describe("--verify: forge.doctor failure (SCAFFOLD-03)", () => {
    it("reports forge.doctor failure", async () => {
      const dest = path.join(tempDir, "verify-fail-workshop");
      execSyncMock.mockImplementation((cmd: string): string => {
        if (cmd.includes("pnpm install")) return "";
        if (cmd.includes("forge.doctor")) throw new Error("doctor failed");
        if (cmd.includes("plugin.validate")) throw new Error("plugin validate failed");
        return "";
      });

      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest, verify: true }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(1);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("fail");
      expect(data.verification?.["forge.doctor"]).toBe("fail");
      expect(data.verification?.["werkstatt.plugin.validate"]).toBe("fail");
      expect(data.errors.some((e) => e.includes("SCAFFOLD-03"))).toBe(true);
      expect(data.errors.some((e) => e.includes("SCAFFOLD-04"))).toBe(true);
    });
  });

  describe("--verify: all checks pass", () => {
    it("returns pass with all verification checks passing", async () => {
      const dest = path.join(tempDir, "verify-pass-workshop");
      execSyncMock.mockReturnValue("");

      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest, verify: true }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("pass");
      expect(data.verification?.["forge.doctor"]).toBe("pass");
      expect(data.verification?.["werkstatt.plugin.validate"]).toBe("pass");
      expect(data.verification?.["werkstatt.autonomy.validate"]).toBe("pass");
    });
  });

  describe("default mode (no --verify)", () => {
    it("skips verification and returns pass", async () => {
      const dest = path.join(tempDir, "no-verify-workshop");
      const result = await runWorkshopScaffold(
        makeInput({ name: "my-workshop", stack: "phaser-turborepo", dest }),
        makeContext(tempDir),
      );
      expect(result.exitCode).toBe(0);
      const data = result.data as ScaffoldWorkshopResult;
      expect(data.status).toBe("pass");
      expect(data.verification).toEqual({
        "forge.doctor": "skipped",
        "werkstatt.plugin.validate": "skipped",
        "werkstatt.autonomy.validate": "skipped",
      });
    });
  });
});
