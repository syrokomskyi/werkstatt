/*
<MODULE_CONTRACT>
<purpose>
Implements content.idempotency.validate (RFC-0154) — asserts that running the
build-prepare pipeline does NOT mutate tracked, hand-authored content under
src/content/** (business/legal data, pages, prose, site, navigation).
Complements pipeline.idempotency.smoke (RFC-0087), which only proves a re-run is
stable and would pass even if every run mutated authored content identically.
</purpose>
<non-goals>
  <item>Do not check generated files (public/, src/pages, tools/) — those are legitimately regenerated.</item>
  <item>Do not run the Astro build — only the prepare pipeline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0154: build must not mutate tracked business/authored content.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { executeKernelCommand } from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { SITES_BUILD_PREPARE_PIPELINE } from "./module.ts";
import { collectFiles } from "@gogol/share/fs";

const NEED_THIS_RE = /NEED_THIS_[A-Z][A-Z0-9_]*/g;

/** Snapshot authored content (src/content) as a path → file-content map. */
async function snapshotContent(appDirectory: string): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  const root = join(appDirectory, "src", "content");
  const files = await collectFiles(root, { ignore: () => false });
  for (const f of files) {
    const rel = relative(appDirectory, f).replace(/\\/g, "/");
    try {
      snap.set(rel, readFileSync(f, "utf8"));
    } catch {
      snap.set(rel, "");
    }
  }
  return snap;
}

async function runPrepareOnce(
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
      return { ok: false, failedStep: step.command, summary: single?.summary };
    }
  }
  return { ok: true };
}

/**
 * content.idempotency.validate — run the build-prepare pipeline once and assert
 * it left every tracked authored-content file byte-identical. A change means a
 * build step is mutating source the operator authored; the worst case (a
 * NEED_THIS_* marker blanked) silently defeats the RFC-0042 legal-data gate.
 *
 * @rfc RFC-0154
 */
export async function runContentIdempotencyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const siteName = context.site?.name;
  if (!siteName) {
    return {
      exitCode: 1,
      data: {
        diagnostics: [`[ERROR] content.idempotency.validate requires an app-scoped context.`],
      },
    };
  }

  const before = await snapshotContent(paths.appDirectory);

  const pass = await runPrepareOnce(context, siteName);
  if (!pass.ok) {
    return {
      exitCode: 1,
      data: {
        diagnostics: [
          `[ERROR] content.idempotency.validate: build.prepare failed at "${pass.failedStep}": ${pass.summary ?? "(no summary)"}`,
        ],
      },
    };
  }

  const after = await snapshotContent(paths.appDirectory);

  const violations: string[] = [];
  const allKeys = new Set([...before.keys(), ...after.keys()]);
  for (const key of [...allKeys].sort()) {
    const b = before.get(key);
    const a = after.get(key);
    if (b === a) continue;
    if (b === undefined) {
      violations.push(`+ ${key} — build.prepare CREATED authored content`);
    } else if (a === undefined) {
      violations.push(`- ${key} — build.prepare DELETED authored content`);
    } else {
      const beforeMarkers = (b.match(NEED_THIS_RE) ?? []).length;
      const afterMarkers = (a.match(NEED_THIS_RE) ?? []).length;
      const markerNote =
        afterMarkers < beforeMarkers
          ? ` — CRITICAL: removed ${beforeMarkers - afterMarkers} NEED_THIS_* marker(s); this defeats the RFC-0042 legal-data gate`
          : "";
      violations.push(`~ ${key} — build.prepare MODIFIED authored content${markerNote}`);
    }
  }

  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: {
        violations: [
          `[ERROR] build.prepare mutated ${violations.length} tracked authored-content file(s) for "${siteName}" (RFC-0154):`,
          ...violations.slice(0, 50).map((v) => `        ${v}`),
          ...(violations.length > 50 ? [`        … and ${violations.length - 50} more.`] : []),
          `        Build must be a pure function of source; population belongs in an explicit onboarding/amend command, never in build.`,
        ],
        total: violations.length,
      },
    };
  }

  return {
    exitCode: 0,
    data: {
      diagnostics: [
        `content.idempotency.validate: ${before.size} authored content file(s) unchanged by build.prepare for "${siteName}".`,
      ],
    },
  };
}
