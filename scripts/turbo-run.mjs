// Turbo wrapper that excludes terminal (closed/aborted) mission workpieces.
// Usage: node scripts/turbo-run.mjs <task> [additional turbo args]
//
// Reads missions/*/mission.yaml, temporarily rewrites pnpm-workspace.yaml
// to replace the `missions/*/workpiece` glob with explicit paths for
// non-terminal (active) missions only, then proxies to `turbo run <task>`.
// The original pnpm-workspace.yaml is restored after turbo exits.

import { readdir, readFile } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const missionsDir = join(repoRoot, "missions");
const workspaceFile = join(repoRoot, "pnpm-workspace.yaml");
const terminalStates = new Set(["closed", "aborted"]);

async function getMissionWorkpieces() {
  if (!existsSync(missionsDir)) return { terminal: [], active: [] };

  const entries = await readdir(missionsDir, { withFileTypes: true });
  const terminal = [];
  const active = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(missionsDir, entry.name, "mission.yaml");
    if (!existsSync(manifestPath)) continue;

    try {
      const raw = await readFile(manifestPath, "utf8");
      const match = raw.match(/^state:\s*(\S+)/m);
      if (!match) continue;

      const workpieceDir = join(missionsDir, entry.name, "workpiece");
      if (!existsSync(workpieceDir)) continue;

      if (terminalStates.has(match[1])) {
        terminal.push(`missions/${entry.name}/workpiece`);
      } else {
        active.push(`missions/${entry.name}/workpiece`);
      }
    } catch {
      // skip unreadable manifests
    }
  }

  return { terminal, active };
}

const [task, ...restArgs] = process.argv.slice(2);
if (!task) {
  console.error("[turbo-run] task name required (e.g. build, build:check)");
  process.exit(1);
}

const { terminal, active } = await getMissionWorkpieces();

let originalWorkspace = null;
if (terminal.length > 0) {
  originalWorkspace = await readFile(workspaceFile, "utf8");

  const activeLines = active.map((p) => `  - ${p}`).join("\n");
  let modified;
  if (activeLines) {
    modified = originalWorkspace.replace(/^(\s*-\s*)missions\/\*\/workpiece\s*$/m, activeLines);
  } else {
    modified = originalWorkspace.replace(/^\s*-\s*missions\/\*\/workpiece\s*\n?/m, "");
  }

  writeFileSync(workspaceFile, modified);
  console.error(
    `[turbo-run] excluding ${terminal.length} terminal mission workpiece(s) from workspace discovery`,
  );
}

let exitCode = 1;
try {
  const turboBin = join(repoRoot, "node_modules", ".bin", "turbo");
  const turboArgs = ["run", task, ...restArgs];
  const result = spawnSync(turboBin, turboArgs, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  exitCode = result.status ?? 1;
} finally {
  if (originalWorkspace !== null) {
    writeFileSync(workspaceFile, originalWorkspace);
  }
}

process.exit(exitCode);
