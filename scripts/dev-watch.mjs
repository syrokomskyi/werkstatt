#!/usr/bin/env node
/*
<MODULE_CONTRACT>
<purpose>
Dev-workflow watcher for mission workpieces. Runs essential generators, starts
`astro dev`, and performs a cold restart when platform packages change
structurally (new files, deleted files, manifest changes). HMR handles in-file
edits via the Vite server.watch config in astro.config.mjs.
</purpose>
<non-goals>
  <item>Does not replace mission.preview — it's a dev convenience wrapper.</item>
  <item>Does not run full build.prepare — only the generators needed for dev.</item>
</non-goals>
</MODULE_CONTRACT>
*/

import { spawn, spawnSync } from "node:child_process";
import { existsSync, watch, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "..");
const PACKAGES_DIR = join(WORKSPACE_ROOT, "packages");

function parseArgs() {
  const args = process.argv.slice(2);
  const mission = args.find((a) => a.startsWith("--mission="))?.slice("--mission=".length);
  const port = args.find((a) => a.startsWith("--port="))?.slice("--port=".length) ?? "4321";
  if (!mission) {
    console.error("Usage: node scripts/dev-watch.mjs --mission=<mission-id> [--port=4321]");
    process.exit(1);
  }
  return { mission, port };
}

function runGenerators(mission) {
  const generators = ["biome.css.generate", "fonts.imports.generate", "styles.global.generate"];
  for (const cmd of generators) {
    const result = spawnSync(
      "pnpm",
      ["exec", "site-kernel", "run", cmd, "--site", "webgogol-com"],
      { cwd: WORKSPACE_ROOT, stdio: "pipe", encoding: "utf-8" },
    );
    if (result.status !== 0) {
      console.error(`[dev-watch] ${cmd} failed: ${result.stderr?.trim() ?? result.stdout?.trim()}`);
    } else {
      console.log(`[dev-watch] ${cmd} OK`);
    }
  }
}

function startAstroDev(workpieceDir, port) {
  // Run the astro binary directly (not via npx/pnpm exec) so that
  // child.kill("SIGTERM") hits the actual astro process, which will
  // then clean up its lock file on graceful shutdown.
  const env = { ...process.env };
  // Prevent Astro's am-i-vibing from detecting "vscode-copilot-agent" which
  // forces background mode (lock file + port auto-increment on restart).
  // The detector matches TERM_PROGRAM=vscode + GIT_PAGER=cat.
  delete env.GIT_PAGER;
  delete env.WINDSURF_CASCADE_TERMINAL;
  delete env.WINDSURF_CASCADE_TERMINAL_ID;
  delete env.WINDSURF_CASCADE_TERMINAL_KIND;
  delete env.WINDSURF_USE_CASCADE_SANDBOX;
  const astroEntry = join(workpieceDir, "node_modules", "astro", "bin", "astro.mjs");
  const child = spawn("node", [astroEntry, "dev", "--port", String(port), "--host", "127.0.0.1"], {
    cwd: workpieceDir,
    stdio: "inherit",
    env,
  });
  child.on("exit", (code) => {
    if (child._stopping) return;
    if (code !== null && code !== 0) {
      console.log(`[dev-watch] astro dev exited with code ${code}, retrying in 3s…`);
      setTimeout(() => {
        astroChild = startAstroDev(workpieceDir, port);
      }, 3000);
    }
  });
  return child;
}

function stopAstroDev(child, workpieceDir) {
  if (!child || !child.pid) return;
  child._stopping = true;
  try {
    child.kill("SIGTERM");
  } catch {
    // already dead
  }
  // Astro doesn't remove its lock file on SIGTERM — remove it manually
  // so the next start doesn't see a stale server.
  const devLock = join(workpieceDir, ".astro", "dev.json");
  try {
    unlinkSync(devLock);
  } catch {
    // file doesn't exist or already removed — ignore
  }
}

function watchPackages(onChange) {
  if (!existsSync(PACKAGES_DIR)) return;
  let debounceTimer = null;
  const debounce = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange();
    }, 800);
  };
  try {
    watch(PACKAGES_DIR, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (
        filename.endsWith(".ts") ||
        filename.endsWith(".astro") ||
        filename.endsWith(".css") ||
        filename.endsWith(".yaml")
      ) {
        console.log(`[dev-watch] package change: ${filename}`);
        debounce();
      }
    });
  } catch (err) {
    console.warn(`[dev-watch] fs.watch recursive not supported on this platform: ${err.message}`);
    console.warn("[dev-watch] Falling back to polling mode (Vite server.watch handles HMR).");
  }
}

const { mission, port } = parseArgs();
const workpieceDir = join(WORKSPACE_ROOT, "missions", mission, "workpiece");
if (!existsSync(workpieceDir)) {
  console.error(`[dev-watch] workpiece not found: ${workpieceDir}`);
  process.exit(1);
}

console.log(`[dev-watch] mission: ${mission}`);
console.log(`[dev-watch] workpiece: ${workpieceDir}`);
console.log(`[dev-watch] port: ${port}`);

runGenerators(mission);

let astroChild = startAstroDev(workpieceDir, port);
let restartTimer = null;

watchPackages(() => {
  console.log("[dev-watch] cold restart: regenerating + restarting astro dev…");
  stopAstroDev(astroChild, workpieceDir);
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    runGenerators(mission);
    astroChild = startAstroDev(workpieceDir, port);
  }, 5000);
});

process.on("SIGINT", () => {
  console.log("\n[dev-watch] shutting down…");
  stopAstroDev(astroChild, workpieceDir);
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAstroDev(astroChild, workpieceDir);
  process.exit(0);
});
