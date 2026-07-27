import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runCompassAuditRecord } from "../compass-audit.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@gogol/site-kernel";

const execFileAsync = promisify(execFile);

/*
<MODULE_CONTRACT>
  <purpose>
    Regression test for compass.audit.record path normalization.
    Ensures --file is resolved relative to process.cwd() and then stored
    relative to workspaceRoot, preventing phantom ledger entries when the
    command is run from a subdirectory (e.g. a mission workpiece).
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

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: undefined,
    siteExplicit: false,
    logger: logger as never,
    dryRun: false,
    outputFormat: "pretty",
    io: {} as never,
    fileIntents: [],
  };
}

describe("compass.audit.record path normalization", () => {
  let workspaceRoot: string;
  let subDir: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "compass-audit-test-"));
    subDir = join(workspaceRoot, "missions", "m000010", "workpiece");
    await mkdir(subDir, { recursive: true });
    await mkdir(join(workspaceRoot, "docs"), { recursive: true });
    await mkdir(join(subDir, "src", "styles"), { recursive: true });
    await writeFile(join(subDir, "src", "styles", "local.css"), "/* test content */\n");
    // Initialize a git repo so getRevisionByPath's git fallback works
    await execFileAsync("git", ["init"], { cwd: workspaceRoot });
    await execFileAsync("git", ["add", "."], { cwd: workspaceRoot });
    await execFileAsync("git", ["commit", "-m", "init"], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
    });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("stores path relative to workspaceRoot when --file is relative to cwd", async () => {
    // Simulate running from the workpiece subdirectory
    const originalCwd = process.cwd();
    process.chdir(subDir);
    try {
      const input: KernelCommandInput = {
        flags: { file: "src/styles/local.css", verdict: "baseline" },
        argv: [],
        args: [],
      };

      const result = await runCompassAuditRecord(input, makeContext(workspaceRoot));

      expect(result.exitCode).toBe(0);
      expect(result.data!.path).toBe("missions/m000010/workpiece/src/styles/local.css");
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("stores path relative to workspaceRoot when --file is absolute", async () => {
    const input: KernelCommandInput = {
      flags: {
        file: join(subDir, "src", "styles", "local.css"),
        verdict: "baseline",
      },
      argv: [],
      args: [],
    };

    const result = await runCompassAuditRecord(input, makeContext(workspaceRoot));

    expect(result.exitCode).toBe(0);
    expect(result.data!.path).toBe("missions/m000010/workpiece/src/styles/local.css");
  });
});
