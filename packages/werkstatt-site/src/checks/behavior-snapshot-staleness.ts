/*
<MODULE_CONTRACT>
<purpose>
RFC-0721: behavior.snapshot.staleness.check — compares system.md pages[] routes
against the committed behavior.snapshot.generated.yaml routes. Emits SNAP-STALE-01
warnings when routes are declared in system.md but absent from the committed
snapshot. One-directional (newRoutes only) — does not check the reverse direction
because the behavior snapshot includes Programmatic Surface routes (DNA-39) that
are not declared in system.md pages[]. This is an early warning in build.prepare —
the existing SNAP-01 auto-regeneration in build.post remains the recovery mechanism.
</purpose>
<non-goals>
  <item>Do not regenerate the snapshot — only warn that it may be stale.</item>
  <item>Do not check content changes within pages — only route existence.</item>
  <item>Do not replace SNAP-01 in build.post — this is a pre-build advisory check.</item>
  <item>Do not check removedRoutes direction (snapshot routes not in system.md) — Programmatic Surface routes (DNA-39) would produce false positives.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0721: initial implementation — route-level staleness warning.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { CheckResult, Diagnostic } from "@warpgogol/site-kernel";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { diagnosticsResult } from "./result-helpers.ts";

export async function runBehaviorSnapshotStalenessCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch {
    return diagnosticsResult("behavior.snapshot.staleness.check", []);
  }

  const contentDir = join(paths.appDirectory, "src", "content");
  const snapshotPath = join(paths.appDirectory, "behavior.snapshot.generated.yaml");

  // Read system.md pages[] routes
  let declaredRoutes: Set<string>;
  try {
    const systemResult = await loadSystemManifest(contentDir);
    const pages =
      (systemResult.manifest as { pages?: Array<{ routes?: Record<string, string> }> }).pages ?? [];
    declaredRoutes = new Set<string>();
    for (const page of pages) {
      for (const route of Object.values(page.routes ?? {})) {
        if (typeof route === "string") {
          declaredRoutes.add(route);
        }
      }
    }
  } catch {
    return diagnosticsResult("behavior.snapshot.staleness.check", []);
  }

  // Read committed snapshot routes
  let committedRoutes: Set<string>;
  try {
    const raw = await readFile(snapshotPath, "utf8");
    const snapshot = yamlParse(raw) as { routes?: Array<{ route: string }> };
    committedRoutes = new Set((snapshot.routes ?? []).map((r) => r.route));
  } catch {
    return diagnosticsResult("behavior.snapshot.staleness.check", []);
  }

  const diagnostics: Diagnostic[] = [];

  for (const route of declaredRoutes) {
    if (!committedRoutes.has(route)) {
      diagnostics.push({
        ruleId: "SNAP-STALE-01",
        severity: "warning",
        message: `Route "${route}" is declared in system.md but absent from behavior.snapshot.generated.yaml`,
        fixHint:
          "Run: pnpm exec site-kernel run behavior.snapshot.generate --site <app>, then commit the updated snapshot",
      });
    }
  }

  return diagnosticsResult("behavior.snapshot.staleness.check", diagnostics);
}
