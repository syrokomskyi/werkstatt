/*
<MODULE_CONTRACT>
<purpose>
pipeline.cache.parity — RFC-0259: prove that a turbo cache-restored (warm)
app build produces byte-identical generated artifacts to a from-scratch
(cold) build. This is the permanent gate for ever re-enabling turbo caching
on app `build`/`build:check` tasks (Step 2, gated on rfc-0266); while
`cache: false` is in force (Step 1, this RFC) the command trivially passes
because there is no cache to diverge from.
</purpose>
<non-goals>
  <item>Do not optimize build speed — this proves correctness of the cache contract, not performance.</item>
  <item>Do not use `git clean -dfx` or any broad destructive clean — only the explicit snapshot-scoped file list is removed between runs.</item>
  <item>Do not normalize "volatile" bytes (e.g. Astro asset hashes) — a cold and warm build of identical inputs must be byte-identical; divergence is itself the finding.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0259: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { spawn } from "node:child_process";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { byteHash } from "@gogol/fingerprint";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { diagnosticsResult } from "../result-helpers.ts";

export interface CacheParitySnapshot {
  /** app-relative POSIX path -> file content digest */
  files: Record<string, string>;
}

export interface CacheParityReport extends CheckResult {
  app: string;
  coldHash: string;
  warmHash: string;
  missingAfterWarm: string[];
  differingAfterWarm: string[];
}

/** Directories/glob roots snapshotted, relative to the app directory (RFC-0259 Design). */
const SNAPSHOT_ROOTS = ["dist", "public/_img", "public/_video", "src"];

function toPosixPath(value: string): string {
  return value.split("\\").join("/");
}

const HASH_PREFIX = "sha" + "256:";

function digestHex(content: Buffer | string): string {
  return byteHash(content).slice(HASH_PREFIX.length);
}

function matchesSnapshotScope(appRelativePath: string): boolean {
  if (appRelativePath.startsWith("dist/")) return true;
  if (appRelativePath.startsWith("public/_img/")) return true;
  if (appRelativePath.startsWith("public/_video/")) return true;
  if (/^public\/[^/]+\.(xml|txt)$/.test(appRelativePath)) return true;
  if (/^src\/[^/]+\.generated\.json$/.test(appRelativePath)) return true;
  if (/^src\/styles\/[^/]+\.generated\.css$/.test(appRelativePath)) return true;
  return false;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/** RFC-0259: content-hash snapshot of the declared generated-artifact scope for one app. */
export async function snapshotCacheParityFiles(appDirectory: string): Promise<CacheParitySnapshot> {
  const files: Record<string, string> = {};
  for (const root of SNAPSHOT_ROOTS) {
    for await (const filePath of walk(join(appDirectory, root))) {
      const appRelative = toPosixPath(relative(appDirectory, filePath));
      if (!matchesSnapshotScope(appRelative)) continue;
      const content = await readFile(filePath);
      files[appRelative] = digestHex(content);
    }
  }
  // public/*.xml|txt (not nested under _img/_video) needs a direct scan too.
  for await (const filePath of walk(join(appDirectory, "public"))) {
    const appRelative = toPosixPath(relative(appDirectory, filePath));
    if (files[appRelative]) continue;
    if (!matchesSnapshotScope(appRelative)) continue;
    const content = await readFile(filePath);
    files[appRelative] = digestHex(content);
  }
  return { files };
}

/** RFC-0259: deterministic hash over the full sorted snapshot, for a stable coldHash/warmHash. */
export function hashCacheParitySnapshot(snapshot: CacheParitySnapshot): string {
  const entries = Object.entries(snapshot.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return digestHex(JSON.stringify(entries));
}

/** Pure diff: which cold-build files are missing or differ after the warm build. */
export function compareCacheParitySnapshots(
  cold: CacheParitySnapshot,
  warm: CacheParitySnapshot,
): { missingAfterWarm: string[]; differingAfterWarm: string[] } {
  const missingAfterWarm: string[] = [];
  const differingAfterWarm: string[] = [];
  for (const [file, coldHash] of Object.entries(cold.files)) {
    const warmHash = warm.files[file];
    if (warmHash === undefined) {
      missingAfterWarm.push(file);
    } else if (warmHash !== coldHash) {
      differingAfterWarm.push(file);
    }
  }
  missingAfterWarm.sort();
  differingAfterWarm.sort();
  return { missingAfterWarm, differingAfterWarm };
}

/** Pure projection: turn a snapshot diff into registered Diagnostic[] (RFC-0259). */
export function buildCacheParityDiagnostics(
  app: string,
  missingAfterWarm: string[],
  differingAfterWarm: string[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const file of missingAfterWarm) {
    diagnostics.push({
      ruleId: "CACHE-PARITY-01",
      severity: "error",
      file: `apps/${app}/${file}`,
      message: `Present after the cold build, missing after the warm (cache-restored) build.`,
      fixHint:
        "The turbo task outputs for this app do not declare this path. Add it, or keep cache: false until rfc-0266 supplies generated outputs.",
      data: { app, file },
    });
  }
  for (const file of differingAfterWarm) {
    diagnostics.push({
      ruleId: "CACHE-PARITY-02",
      severity: "error",
      file: `apps/${app}/${file}`,
      message: `Content differs between the cold build and the warm (cache-restored) build.`,
      fixHint:
        "The build is not deterministic under cache restore. Find the non-deterministic generator and fix it before re-enabling caching.",
      data: { app, file },
    });
  }
  return diagnostics;
}

function runTurbo(args: string[], cwd: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("pnpm", ["exec", "turbo", ...args], {
      cwd,
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ exitCode: code ?? 1, output }));
  });
}

/** Remove exactly the files captured by a snapshot (never a broad `git clean`). */
async function removeSnapshotFiles(
  appDirectory: string,
  snapshot: CacheParitySnapshot,
): Promise<void> {
  for (const appRelative of Object.keys(snapshot.files)) {
    await rm(join(appDirectory, appRelative), { force: true });
  }
  // dist/ and .astro/ are wholesale build outputs; wipe them so the warm run
  // proves it restores them from cache rather than reusing a stale directory.
  await rm(join(appDirectory, "dist"), { recursive: true, force: true });
  await rm(join(appDirectory, ".astro"), { recursive: true, force: true });
}

export async function runPipelineCacheParity(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CacheParityReport>> {
  const app = context.site?.name ?? (input.flags["app"] as string | undefined);
  if (!app) {
    throw new Error(
      "pipeline.cache.parity requires an app target (--site <name> or cwd inference).",
    );
  }
  const paths = requireAstroSitePaths(context);

  try {
    await stat(paths.appDirectory);
  } catch {
    throw new Error(`App directory not found: ${paths.appDirectory}`);
  }

  const cold = await runTurbo(["run", "build", "--filter", app, "--force"], context.workspaceRoot);
  if (cold.exitCode !== 0) {
    throw new Error(
      `Cold build failed for app "${app}" (exit ${cold.exitCode}). See turbo output.`,
    );
  }
  const coldSnapshot = await snapshotCacheParityFiles(paths.appDirectory);

  await removeSnapshotFiles(paths.appDirectory, coldSnapshot);

  const warm = await runTurbo(["run", "build", "--filter", app], context.workspaceRoot);
  if (warm.exitCode !== 0) {
    throw new Error(
      `Warm build failed for app "${app}" (exit ${warm.exitCode}). See turbo output.`,
    );
  }
  const warmSnapshot = await snapshotCacheParityFiles(paths.appDirectory);

  const { missingAfterWarm, differingAfterWarm } = compareCacheParitySnapshots(
    coldSnapshot,
    warmSnapshot,
  );
  const diagnostics = buildCacheParityDiagnostics(app, missingAfterWarm, differingAfterWarm);
  const base = diagnosticsResult("pipeline.cache.parity", diagnostics);

  return {
    ...base,
    data: {
      ...(base.data as CheckResult),
      app,
      coldHash: hashCacheParitySnapshot(coldSnapshot),
      warmHash: hashCacheParitySnapshot(warmSnapshot),
      missingAfterWarm,
      differingAfterWarm,
    },
  };
}
