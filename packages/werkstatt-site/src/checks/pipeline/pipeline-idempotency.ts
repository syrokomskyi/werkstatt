/*
<MODULE_CONTRACT>
<purpose>
Implements pipeline.idempotency.smoke — runs SITES_BUILD_PREPARE_PIPELINE
twice for an app and asserts the second pass writes zero new bytes.
Closes the RFC-0087 deferred acceptance criterion (build-twice
idempotency for the full pipeline, not just the codegen layer).
</purpose>
<non-goals>
  <item>Do not validate the contents of generated files — only their stability across runs.</item>
  <item>Do not run the Astro build itself — only the prepare pipeline.</item>
  <item>Do not block ordinary builds — this command is opt-in via packages-check.run / CI.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0087 Wave 2 (RFC-0097 follow-up): full-pipeline idempotency smoke test.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { SITES_BUILD_PREPARE_PIPELINE } from "../module.ts";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const HASH_PREFIX = "sha" + "256:";

interface Snapshot {
  // relative path under appDirectory → hash (or "" for absent)
  hashes: Map<string, string>;
}

function hashFile(path: string): string {
  try {
    const buf = readFileSync(path);
    return byteHash(buf).slice(HASH_PREFIX.length);
  } catch {
    return "";
  }
}

async function snapshot(appDirectory: string): Promise<Snapshot> {
  const hashes = new Map<string, string>();
  // Cover content surface (RFC-0047) and public/ — everything a prepare-pipeline
  // step can legitimately write to. We hash actual on-disk files instead of
  // resolving GENERATOR_OWNERSHIP_MAP templates so a missing-from-map path
  // still surfaces a non-deterministic write.
  for (const sub of ["src/content", "public"]) {
    const root = join(appDirectory, sub);
    const files = await collectFiles(root, {
      ignore: (name) => name === "node_modules" || name === "dist" || name === ".astro",
    });
    for (const f of files) {
      const rel = relative(appDirectory, f).replace(/\\/g, "/");
      hashes.set(rel, hashFile(f));
    }
  }
  return { hashes };
}

function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const changes: string[] = [];
  const allKeys = new Set([...before.hashes.keys(), ...after.hashes.keys()]);
  for (const key of [...allKeys].sort()) {
    const b = before.hashes.get(key) ?? "";
    const a = after.hashes.get(key) ?? "";
    if (b === a) continue;
    if (!b) changes.push(`+ ${key} (added on second pass)`);
    else if (!a) changes.push(`- ${key} (removed on second pass)`);
    else changes.push(`~ ${key} (modified on second pass)`);
  }
  return changes;
}

async function runPipelineOnce(
  context: KernelRuntimeContext,
  siteName: string,
): Promise<{ ok: boolean; failedStep?: string; summary?: string }> {
  for (const step of SITES_BUILD_PREPARE_PIPELINE) {
    const report = await executeKernelCommand({
      workspaceRoot: context.workspaceRoot,
      commandName: step.command,
      siteName: siteName,
      siteExplicit: true,
      outputFormat: context.outputFormat,
      dryRun: context.dryRun,
      argv: step.args ?? [],
    });
    const single = Array.isArray(report) ? report[0] : report;
    if (!single?.ok) {
      return {
        ok: false,
        failedStep: step.command,
        summary: single?.summary,
      };
    }
  }
  return { ok: true };
}

export async function runPipelineIdempotencySmoke(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteName = context.site?.name;
  if (!siteName) {
    return {
      exitCode: 1,
      data: { diagnostics: [`[ERROR] pipeline.idempotency.smoke requires an app-scoped context.`] },
    };
  }

  // Pass 1
  const pass1 = await runPipelineOnce(context, siteName);
  if (!pass1.ok) {
    return {
      exitCode: 1,
      data: {
        diagnostics: [
          `[ERROR] pipeline.idempotency.smoke: first pass failed at "${pass1.failedStep}": ${pass1.summary ?? "(no summary)"}`,
        ],
      },
    };
  }
  const snap1 = await snapshot(paths.appDirectory);

  // Pass 2
  const pass2 = await runPipelineOnce(context, siteName);
  if (!pass2.ok) {
    return {
      exitCode: 1,
      data: {
        diagnostics: [
          `[ERROR] pipeline.idempotency.smoke: second pass failed at "${pass2.failedStep}": ${pass2.summary ?? "(no summary)"}`,
        ],
      },
    };
  }
  const snap2 = await snapshot(paths.appDirectory);

  const changes = diffSnapshots(snap1, snap2);
  if (changes.length > 0) {
    return {
      exitCode: 1,
      data: {
        violations: [
          `[ERROR] SITES_BUILD_PREPARE_PIPELINE is not idempotent for "${siteName}" — second pass changed ${changes.length} file(s):`,
          ...changes.slice(0, 50).map((c) => `        ${c}`),
          ...(changes.length > 50 ? [`        … and ${changes.length - 50} more.`] : []),
          `        A pipeline step writes non-deterministic output (timestamp, random id, or a generator that consumes generated state). Fix the offender (RFC-0087).`,
        ],
        total: changes.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [
        `pipeline.idempotency.smoke: ${snap1.hashes.size} file(s) stable across two passes for "${siteName}".`,
      ],
    },
  };
}
