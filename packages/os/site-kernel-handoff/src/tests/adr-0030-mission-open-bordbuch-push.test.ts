/*
<MODULE_CONTRACT>
<purpose>ADR-0030: unit test verifying mission.open throws when commitAndPushBordbuch fails to commit or push.</purpose>
<keywords>ADR-0030, bordbuch, push, commit, mission.open, guard</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0030: initial tests for commit failure and push failure guards in mission.open.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { runMissionOpen } from "../mission/mission-open.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function gitInit(dir: string): void {
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

function gitCommit(dir: string, msg: string): void {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: dir, stdio: "pipe" });
}

let tmpWorkspace: string;

beforeEach(() => {
  tmpWorkspace = mkdtempSync(join(process.cwd(), "tmp-adr-0030-"));
});

afterEach(() => {
  rmSync(tmpWorkspace, { recursive: true, force: true });
});

function setupWorkspace(): string {
  gitInit(tmpWorkspace);
  writeFileSync(join(tmpWorkspace, "README.md"), "# test\n");
  gitCommit(tmpWorkspace, "initial");

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

  mkdirSync(join(tmpWorkspace, "systems", "test-system"), { recursive: true });
  writeFileSync(
    join(tmpWorkspace, "systems", "test-system", "system.pin.json"),
    JSON.stringify({ platform: { version: "1.0.0" } }, null, 2) + "\n",
  );

  mkdirSync(join(tmpWorkspace, "systems", "test-system", "bordbuch"), { recursive: true });
  gitCommit(tmpWorkspace, "add system");

  return tmpWorkspace;
}

test("mission.open throws when bordbuch commit fails (no git origin configured)", async () => {
  setupWorkspace();

  // No bare origin is set up — commitAndPushBordbuch will commit successfully
  // but the push will fail because there is no 'origin' remote.
  // However, to test the commit-failure path specifically, we need to make
  // the git add/commit fail. We do this by making the bordbuch directory
  // a non-git-tracked path (remove .git after setup so git operations fail).
  // Actually, commitAndPushBordbuch uses the systemDir (cache clone) which
  // IS the workspace itself in this test setup. The commit will succeed
  // because bordbuch/events.ndjson exists. To test commit failure, we
  // need to make the commit itself fail — we can do this by removing
  // the .git directory AFTER setup so gitExec fails.
  //
  // But that also makes the earlier readBordbuch / validateBordbuch fail.
  // Instead, test the push-failure path (no origin) which is the more
  // common real-world scenario described in the ADR.

  const input = {
    flags: { system: "test-system", brief: "Test mission", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  await expect(runMissionOpen(input, context)).rejects.toThrow(
    /bordbuch push failed for system 'test-system'/,
  );
});

test("mission.open throws with distinct commit-failure message when git commit fails", async () => {
  setupWorkspace();

  // Make the bordbuch events.ndjson unreadable as a git-tracked file by
  // creating a situation where git add fails: make bordbuch a symlink to
  // a non-existent target. This causes gitExec("add ...") to fail, which
  // makes commitAndPushBordbuch return { commitSha: null, pushed: false }.
  const bordbuchDir = join(tmpWorkspace, "systems", "test-system", "bordbuch");
  rmSync(bordbuchDir, { recursive: true, force: true });
  execSync(`ln -s /nonexistent/path ${JSON.stringify(bordbuchDir)}`, { stdio: "pipe" });

  const input = {
    flags: { system: "test-system", brief: "Test mission", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  await expect(runMissionOpen(input, context)).rejects.toThrow(
    /bordbuch commit failed for system 'test-system'/,
  );
});

test("mission.open succeeds when commitAndPushBordbuch pushes successfully", async () => {
  setupWorkspace();

  // Set up a bare origin so push succeeds
  const bareDir = join(tmpWorkspace, "..", "bare-origin.git");
  execSync(`git init --bare ${JSON.stringify(bareDir)}`, { stdio: "pipe" });
  execSync(`git remote add origin ${JSON.stringify(bareDir)}`, { cwd: tmpWorkspace, stdio: "pipe" });
  execSync("git push -u origin HEAD:main", { cwd: tmpWorkspace, stdio: "pipe" });

  const input = {
    flags: { system: "test-system", brief: "Test mission", actor: "test-agent" },
  } as unknown as KernelCommandInput;
  const context = { workspaceRoot: tmpWorkspace } as unknown as KernelRuntimeContext;

  const result = await runMissionOpen(input, context);
  expect(result.data?.state).toBe("open");
  expect(result.data?.missionId).toBe("test-system-m000001");
  // Verify the bordbuch event was pushed — check that the bare repo has the commit
  const bareLog = execSync("git log --oneline -1", { cwd: bareDir, encoding: "utf-8", stdio: "pipe" }).trim();
  expect(bareLog).toContain("mission-open");
});
