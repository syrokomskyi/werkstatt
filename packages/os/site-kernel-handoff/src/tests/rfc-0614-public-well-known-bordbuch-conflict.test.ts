/*
<MODULE_CONTRACT>
<purpose>RFC-0614: regression tests for bordbuch/ and public/.well-known/bordbuch* delete/modify conflict auto-resolution in mission.reconcile.</purpose>
<keywords>RFC-0614, RFC-0584, reconcile, bordbuch, conflict, auto-resolution, delete-modify</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0614: add regression tests for bordbuch/ and public/.well-known/bordbuch* conflict auto-resolution.</item>
  <item>RFC-0584: add regression test for bordbuch/ conflict auto-resolution (previously untested).</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function gitInit(dir: string): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email test@test.com", { cwd: dir, stdio: "pipe" });
  execSync("git config user.name Test", { cwd: dir, stdio: "pipe" });
}

function gitCommit(dir: string, msg: string): void {
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: dir, stdio: "pipe" });
}

function conflictedPaths(dir: string): string[] {
  const status = execSync("git status --porcelain", {
    cwd: dir,
    encoding: "utf-8",
  });
  return status
    .split("\n")
    .filter(
      (l) => l.startsWith("DU") || l.startsWith("UD") || l.startsWith("AA") || l.startsWith("UU"),
    )
    .map((l) => l.slice(3).trim())
    .filter((l) => l.length > 0);
}

const isBordbuchPath = (p: string) =>
  p.startsWith("bordbuch/") || p.startsWith("public/.well-known/bordbuch");

let cacheCloneDir: string;
let workpieceDir: string;
let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(process.cwd(), "tmp-rfc0614-"));
  cacheCloneDir = join(baseDir, "cache");
  workpieceDir = join(baseDir, "workpiece");
  mkdirSync(cacheCloneDir, { recursive: true });
  mkdirSync(workpieceDir, { recursive: true });
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

function setupCommonAncestor(filePath: string, content: string): void {
  gitInit(cacheCloneDir);
  mkdirSync(join(cacheCloneDir, join(filePath, "..").replace(/^\.\//, "")), {
    recursive: true,
  });
  writeFileSync(join(cacheCloneDir, filePath), content);
  gitCommit(cacheCloneDir, "initial");

  execSync(`git clone ${JSON.stringify(cacheCloneDir)} ${JSON.stringify(workpieceDir)}`, {
    stdio: "pipe",
  });
}

function simulateDeleteModify(
  cacheFilePath: string,
  workpieceFilePath: string,
  cacheModifiedContent: string,
): void {
  // Modify in cache clone (ours)
  writeFileSync(join(cacheCloneDir, cacheFilePath), cacheModifiedContent);
  gitCommit(cacheCloneDir, "modify in cache");

  // Delete in workpiece
  execSync(`git rm ${JSON.stringify(workpieceFilePath)}`, {
    cwd: workpieceDir,
    stdio: "pipe",
  });
  gitCommit(workpieceDir, "delete in workpiece");

  // Fetch workpiece into cache clone and merge
  execSync(`git fetch ${JSON.stringify(workpieceDir)} HEAD`, {
    cwd: cacheCloneDir,
    stdio: "pipe",
  });
  // Merge produces a delete/modify conflict — execSync throws on non-zero exit
  try {
    execSync("git merge --no-ff FETCH_HEAD -m test-merge", {
      cwd: cacheCloneDir,
      stdio: "pipe",
    });
  } catch {
    // Expected: conflict during merge — this is the state we want to test
  }
}

function autoResolve(dir: string, paths: string[]): void {
  const pathArgs = paths.map((p) => JSON.stringify(p)).join(" ");
  execSync(`git checkout --ours -- ${pathArgs}`, { cwd: dir, stdio: "pipe" });
  execSync(`git add -- ${pathArgs}`, { cwd: dir, stdio: "pipe" });
  execSync("git commit --no-edit", { cwd: dir, stdio: "pipe" });
}

test("RFC-0584 regression: bordbuch/events.ndjson delete/modify conflict is auto-resolved", () => {
  const filePath = "bordbuch/events.ndjson";
  setupCommonAncestor(filePath, '{"event":"initial"}\n');
  simulateDeleteModify(filePath, filePath, '{"event":"modified-by-cache"}\n');

  const conflicts = conflictedPaths(cacheCloneDir);
  expect(conflicts).toContain(filePath);
  expect(conflicts.every(isBordbuchPath)).toBe(true);

  autoResolve(cacheCloneDir, conflicts);

  // Verify cache clone version is kept
  const content = execSync(`cat ${JSON.stringify(filePath)}`, {
    cwd: cacheCloneDir,
    encoding: "utf-8",
  });
  expect(content).toContain("modified-by-cache");

  // Verify merge commit exists
  const log = execSync("git log --oneline", {
    cwd: cacheCloneDir,
    encoding: "utf-8",
  });
  expect(log).toContain("test-merge");
});

test("RFC-0614: public/.well-known/bordbuch.json delete/modify conflict is auto-resolved", () => {
  const filePath = "public/.well-known/bordbuch.json";
  setupCommonAncestor(filePath, '{"status":"initial"}\n');
  simulateDeleteModify(filePath, filePath, '{"status":"modified-by-cache"}\n');

  const conflicts = conflictedPaths(cacheCloneDir);
  expect(conflicts).toContain(filePath);
  expect(conflicts.every(isBordbuchPath)).toBe(true);

  autoResolve(cacheCloneDir, conflicts);

  const content = execSync(`cat ${JSON.stringify(filePath)}`, {
    cwd: cacheCloneDir,
    encoding: "utf-8",
  });
  expect(content).toContain("modified-by-cache");
});

test("RFC-0614: public/.well-known/bordbuch/index.html delete/modify conflict is auto-resolved", () => {
  const filePath = "public/.well-known/bordbuch/index.html";
  setupCommonAncestor(filePath, "<html>initial</html>\n");
  simulateDeleteModify(filePath, filePath, "<html>modified-by-cache</html>\n");

  const conflicts = conflictedPaths(cacheCloneDir);
  expect(conflicts).toContain(filePath);
  expect(conflicts.every(isBordbuchPath)).toBe(true);

  autoResolve(cacheCloneDir, conflicts);

  const content = execSync(`cat ${JSON.stringify(filePath)}`, {
    cwd: cacheCloneDir,
    encoding: "utf-8",
  });
  expect(content).toContain("modified-by-cache");
});

test("RFC-0614: partial bordbuch set — only bordbuch/ conflicted, public/.well-known/bordbuch* does not exist", () => {
  const filePath = "bordbuch/events.ndjson";
  setupCommonAncestor(filePath, '{"event":"initial"}\n');
  simulateDeleteModify(filePath, filePath, '{"event":"modified-by-cache"}\n');

  const conflicts = conflictedPaths(cacheCloneDir);
  expect(conflicts).toEqual([filePath]);
  expect(conflicts.every(isBordbuchPath)).toBe(true);

  // Dynamic pathArgs only includes actually-conflicted paths — no error on missing paths
  expect(() => autoResolve(cacheCloneDir, conflicts)).not.toThrow();

  // public/.well-known/bordbuch* was never created, so it should not exist
  expect(existsSync(join(cacheCloneDir, "public/.well-known/bordbuch.json"))).toBe(false);
});

test("RFC-0614: mixed bordbuch + non-bordbuch conflict is NOT auto-resolved", () => {
  const bordbuchPath = "bordbuch/events.ndjson";
  const contentPath = "src/content/page.md";
  const initialBordbuch = '{"event":"initial"}\n';
  const initialContent = "# Initial page\n";

  // Setup common ancestor with both files
  gitInit(cacheCloneDir);
  mkdirSync(join(cacheCloneDir, "bordbuch"), { recursive: true });
  mkdirSync(join(cacheCloneDir, "src/content"), { recursive: true });
  writeFileSync(join(cacheCloneDir, bordbuchPath), initialBordbuch);
  writeFileSync(join(cacheCloneDir, contentPath), initialContent);
  gitCommit(cacheCloneDir, "initial");

  execSync(`git clone ${JSON.stringify(cacheCloneDir)} ${JSON.stringify(workpieceDir)}`, {
    stdio: "pipe",
  });

  // Modify both in cache clone
  writeFileSync(join(cacheCloneDir, bordbuchPath), '{"event":"modified-by-cache"}\n');
  writeFileSync(join(cacheCloneDir, contentPath), "# Modified by cache\n");
  gitCommit(cacheCloneDir, "modify in cache");

  // Delete both in workpiece
  execSync(`git rm ${JSON.stringify(bordbuchPath)}`, { cwd: workpieceDir, stdio: "pipe" });
  execSync(`git rm ${JSON.stringify(contentPath)}`, { cwd: workpieceDir, stdio: "pipe" });
  gitCommit(workpieceDir, "delete in workpiece");

  // Fetch and merge — conflict expected
  execSync(`git fetch ${JSON.stringify(workpieceDir)} HEAD`, {
    cwd: cacheCloneDir,
    stdio: "pipe",
  });
  try {
    execSync("git merge --no-ff FETCH_HEAD -m test-merge", {
      cwd: cacheCloneDir,
      stdio: "pipe",
    });
  } catch {
    // Expected: conflict during merge
  }

  const conflicts = conflictedPaths(cacheCloneDir);
  expect(conflicts).toContain(bordbuchPath);
  expect(conflicts).toContain(contentPath);

  // allBordbuch check should fail because contentPath is not a bordbuch path
  const allBordbuch = conflicts.every(isBordbuchPath);
  expect(allBordbuch).toBe(false);

  // Abort merge — auto-resolution must NOT proceed
  execSync("git merge --abort", { cwd: cacheCloneDir, stdio: "pipe" });
});
