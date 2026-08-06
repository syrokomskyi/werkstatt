/*
<MODULE_CONTRACT>
<purpose>RFC-0580: integration test verifying git status is clean after mission.open.</purpose>
<keywords>RFC-0580, integration, mission.open, git status, clean</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0580: initial integration test for clean working tree after mission.open.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { runMissionOpen } from "../mission/mission-open.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function gitInit(dir: string): void {
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

function setupBareOrigin(workspaceDir: string): string {
  const bareDirName = `${basename(workspaceDir)}.git`;
  const bareDir = join(workspaceDir, bareDirName);
  writeFileSync(join(workspaceDir, ".gitignore"), `${bareDirName}/\n`);
  execSync("git add .gitignore", { cwd: workspaceDir, stdio: "pipe" });
  execSync('git commit -m "add .gitignore"', { cwd: workspaceDir, stdio: "pipe" });
  execSync(`git init --bare ${JSON.stringify(bareDir)}`, { stdio: "pipe" });
  execSync(`git remote add origin ${JSON.stringify(bareDir)}`, {
    cwd: workspaceDir,
    stdio: "pipe",
  });
  execSync("git push -u origin HEAD", { cwd: workspaceDir, stdio: "pipe" });
  return bareDir;
}

function gitCommit(dir: string, msg: string): void {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: dir, stdio: "pipe" });
}

function gitStatusPorcelain(dir: string): string {
  return execSync("git status --porcelain", { cwd: dir, encoding: "utf-8", stdio: "pipe" }).trim();
}

let tmpWorkspace: string;

beforeEach(() => {
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-mission-open-integration-"));
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

test("after mission.open, git status in monorepo is clean", async () => {
  // Set up workspace structure
  gitInit(tmpWorkspace);
  writeFileSync(join(tmpWorkspace, "README.md"), "# test\n");
  gitCommit(tmpWorkspace, "initial");

  // Create systems/registry.yaml
  mkdirSync(join(tmpWorkspace, "systems"), { recursive: true });
  const registryContent = `schemaVersion: "1.0.0"
systems:
  - id: test-system
    cosmicStar: Vega
    mirrors:
      - path: "./systems/test-system"
        storageType: non-bare
    pinnedPlatform: "4.5.0"
    currentMission: null
    lastRelease: null
    status: active
    registeredAt: "2026-01-01T00:00:00Z"
    notes: ""
`;
  writeFileSync(join(tmpWorkspace, "systems", "registry.yaml"), registryContent);
  gitCommit(tmpWorkspace, "add registry");

  // Create cache clone directory with pin file
  mkdirSync(join(tmpWorkspace, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpWorkspace, "systems", "test-system", "system.pin.json"),
    JSON.stringify({ platform: { version: "1.0.0" } }, null, 2) + "\n",
  );

  // Create bordbuch directory
  mkdirSync(join(tmpWorkspace, "systems", "test-system", "bordbuch"), { recursive: true });

  // Commit the system directory
  gitCommit(tmpWorkspace, "add system");

  // ADR-0030: commitAndPushBordbuch now verifies push succeeded — set up bare origin
  setupBareOrigin(tmpWorkspace);

  // Run mission.open
  const input = {
    flags: {
      system: "test-system",
      brief: "Test mission",
      actor: "test-agent",
    },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  await runMissionOpen(input, context);

  // Verify git status is clean (no uncommitted changes)
  const status = gitStatusPorcelain(tmpWorkspace);
  expect(status).toBe("");
});
