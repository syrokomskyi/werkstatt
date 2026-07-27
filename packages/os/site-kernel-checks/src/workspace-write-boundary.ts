/*
<MODULE_CONTRACT>
<purpose>
  RFC-0258 workspace-write-boundary lint. Enforces the fourth generator
  invariant introduced by RFC-0258 (parallel-safe) on top of the RFC-0087
  single-owner invariant: every kernel command that writes a file outside its
  target app directory (workspace root, docs/, packages/ontology/) MUST be
  declared on SHARED_WRITE_ALLOWLIST and MUST write through writeFileAtomic
  or the writeFileIfChanged wrapper from @warpgogol/site-kernel — never a raw
  node:fs/promises writeFile/writeFileSync.
</purpose>
<non-goals>
  <item>Do not perform full data-flow analysis — WS-WRITE-02 is a source-text scan (RFC-0258 accepts
  this as heuristic; the allowlist plus code review is the primary control).</item>
  <item>Do not enforce ownership uniqueness — that is generator.ownership.lint (RFC-0087).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0258: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";
import { GENERATOR_OWNERSHIP_MAP, type OwnershipEntry } from "./generator-ownership.ts";
import { SITES_CHECK_AUTHOR_PIPELINE } from "./pipelines/sites-check-author.ts";
import { SITES_CHECK_POSTBUILD_PIPELINE } from "./pipelines/sites-check-postbuild.ts";
import { SITES_BUILD_PREPARE_PIPELINE } from "./pipelines/build-prepare.ts";
import { SITES_BUILD_CHECK_PIPELINE } from "./pipelines/build-check.ts";
import { SITES_BUILD_POST_PIPELINE } from "./pipelines/build-post.ts";

// ---------------------------------------------------------------------------
// SHARED_WRITE_ALLOWLIST
// RFC-0258: every kernel command that writes a workspace-shared file (workspace
// root, docs/, packages/ontology/) must be declared here AND write through
// writeFileAtomic. Add an entry in the same commit that introduces a new
// shared writer.
// ---------------------------------------------------------------------------

export interface SharedWriteEntry {
  /** Kernel command name that owns the write. */
  command: string;
  /** Workspace-root-relative output path(s) it may write. */
  outputs: string[];
  /** Module path (repo-relative) that must import writeFileAtomic. */
  module: string;
}

export const SHARED_WRITE_ALLOWLIST: SharedWriteEntry[] = [
  {
    command: "uni.registry.build",
    outputs: ["uni.registry.yaml"],
    module: "packages/os/site-kernel-checks/src/registry.ts",
  },
  {
    command: "archetype.registry.build",
    outputs: ["packages/ontology/archetypes/index.yaml"],
    module: "packages/os/site-kernel-checks/src/archetype/registry-build.ts",
  },
  {
    command: "gitattributes.generate",
    outputs: [".gitattributes"],
    module: "packages/os/site-kernel-checks/src/gitattributes.ts",
  },
  {
    command: "fleet.sites.generate",
    outputs: ["fleet/fleet.sites.yaml"],
    module: "packages/os/site-kernel-checks/src/fleet-sites-generate.ts",
  },
  {
    command: "ecosystem.manifest.generate",
    outputs: ["docs/ecosystem.generated.yaml"],
    module: "packages/os/site-kernel-checks/src/ecosystem/manifest-commands.ts",
  },
  {
    command: "maintenance.debt.queue.generate",
    outputs: ["docs/maintenance-debt.queues.generated.yaml", "docs/maintenance-debt/queues/{file}"],
    module: "packages/os/site-kernel-checks/src/maintenance/maintenance-debt-queue.ts",
  },
  {
    command: "funnel.statechart.generate",
    outputs: ["docs/specs/visitor-funnel/state-chart.generated.md"],
    module: "packages/os/site-kernel-checks/src/funnel-statechart.ts",
  },
  {
    command: "pipeline.budget.generate",
    outputs: ["docs/pipeline-budgets.generated.yaml"],
    module: "packages/os/site-kernel/src/pipeline-budgets.ts",
  },
  {
    command: "rfc.verification.emit",
    outputs: ["docs/rfcs/verification/{file}"],
    module: "packages/forge/os/rfc/verification-evidence.ts",
  },
  {
    command: "rfc.dna.trace.generate",
    outputs: ["docs/rfcs/dna-trace.generated.yaml"],
    module: "packages/forge/os/rfc/dna-trace.ts",
  },
  {
    command: "rfc.decision-log.generate",
    outputs: ["docs/rfcs/decision-log.generated.yaml", "docs/rfcs/decision-log.generated.md"],
    module: "packages/forge/os/rfc/decision-log.ts",
  },
  // RFC-0352: compass-audit ledger — two writer commands, one output file
  {
    command: "compass.audit.record",
    outputs: ["docs/compass-audit-ledger.generated.yaml"],
    module: "packages/os/site-kernel-checks/src/compass-audit.ts",
  },
  {
    command: "compass.audit.baseline",
    outputs: ["docs/compass-audit-ledger.generated.yaml"],
    module: "packages/os/site-kernel-checks/src/compass-audit.ts",
  },
  {
    command: "gate.catalog.generate",
    outputs: ["docs/gate-catalog.generated.yaml"],
    module: "packages/os/site-kernel-checks/src/gate-catalog.ts",
  },
];

// ---------------------------------------------------------------------------
// WS-WRITE-01: undeclared workspace-shared write reachable from an APPS_* pipeline
// ---------------------------------------------------------------------------

/**
 * Recognized app-relative root prefixes a GENERATOR_OWNERSHIP_MAP path may
 * legitimately start with. Anything else (e.g. a path starting with
 * "docs/", "packages/", or a bare workspace-root filename) is workspace-shared
 * and must be allowlisted.
 */
const APP_RELATIVE_ROOTS = ["src/", "public/", ".env", "AGENTS.md"];

function isAppRelativePath(path: string): boolean {
  return APP_RELATIVE_ROOTS.some((root) => path === root || path.startsWith(root));
}

/** Every command name reachable from any APPS_* pipeline (flat union, already pre-expanded arrays). */
function collectAppsPipelineReachableCommands(): Set<string> {
  const pipelines = [
    SITES_CHECK_AUTHOR_PIPELINE,
    SITES_CHECK_POSTBUILD_PIPELINE,
    SITES_BUILD_PREPARE_PIPELINE,
    SITES_BUILD_CHECK_PIPELINE,
    SITES_BUILD_POST_PIPELINE,
  ];
  const commands = new Set<string>();
  for (const pipeline of pipelines) {
    for (const step of pipeline) {
      commands.add(step.command);
    }
  }
  return commands;
}

/** @internal exported for fixture tests — production callers use the zero-arg overload. */
export function runWsWrite01(
  ownershipMap: OwnershipEntry[] = GENERATOR_OWNERSHIP_MAP,
  allowlist: SharedWriteEntry[] = SHARED_WRITE_ALLOWLIST,
  reachable: Set<string> = collectAppsPipelineReachableCommands(),
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const allowlistedCommands = new Set(allowlist.map((entry) => entry.command));

  for (const entry of ownershipMap) {
    if (isAppRelativePath(entry.path)) continue;
    if (!reachable.has(entry.command)) continue;
    if (allowlistedCommands.has(entry.command)) continue;

    diagnostics.push({
      ruleId: "WS-WRITE-01",
      severity: "error",
      message: `Command \`${entry.command}\` (reachable from an APPS_* pipeline) writes \`${entry.path}\`, which is outside apps/<app>/, but is not declared on SHARED_WRITE_ALLOWLIST.`,
      fixHint: `Add a SharedWriteEntry for \`${entry.command}\` to SHARED_WRITE_ALLOWLIST in packages/os/site-kernel-checks/src/workspace-write-boundary.ts, and migrate its write to writeFileAtomic from @warpgogol/site-kernel (RFC-0258).`,
    });
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// WS-WRITE-02: allowlisted module doesn't use an atomic write primitive
// ---------------------------------------------------------------------------

// RFC-0270: a module that itself lives inside packages/os/site-kernel/src (the
// package that defines writeFileAtomic) cannot import it via the "@warpgogol/site-kernel"
// package specifier — it imports the sibling ./fs-atomic.ts source file directly.
// RFC-0345: writeFileIfChanged is also accepted because it delegates the actual
// write to writeFileAtomic while avoiding unchanged-file churn.
const ATOMIC_IMPORT_PATTERN =
  /import\s*\{[^}]*\b(writeFileAtomic|writeFileIfChanged)\b[^}]*\}\s*from\s*["'](@warpgogol\/site-kernel|\.{1,2}\/(.*\/)?fs-(atomic|idempotent)\.ts)["']/;
const RAW_WRITE_CALL_PATTERN = /\bwriteFileSync?\s*\(/;

/** @internal exported for fixture tests — production callers use the default allowlist. */
export async function runWsWrite02(
  workspaceRoot: string,
  allowlist: SharedWriteEntry[] = SHARED_WRITE_ALLOWLIST,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const seenModules = new Set<string>();

  for (const entry of allowlist) {
    if (seenModules.has(entry.module)) continue;
    seenModules.add(entry.module);

    const absolutePath = join(workspaceRoot, ...entry.module.split("/"));
    let source: string;
    try {
      source = await readFile(absolutePath, "utf8");
    } catch {
      diagnostics.push({
        ruleId: "WS-WRITE-02",
        severity: "error",
        message: `Allowlisted module \`${entry.module}\` for command \`${entry.command}\` could not be read.`,
        file: entry.module,
        fixHint: `Fix the module path in SHARED_WRITE_ALLOWLIST or restore the file (RFC-0258).`,
      });
      continue;
    }

    if (!ATOMIC_IMPORT_PATTERN.test(source)) {
      diagnostics.push({
        ruleId: "WS-WRITE-02",
        severity: "error",
        message: `Allowlisted module \`${entry.module}\` (command \`${entry.command}\`) does not import writeFileAtomic or writeFileIfChanged from @warpgogol/site-kernel.`,
        file: entry.module,
        fixHint: `Import writeFileAtomic or writeFileIfChanged from "@warpgogol/site-kernel" in ${entry.module} and use it for the workspace-shared write (RFC-0258/RFC-0345).`,
      });
    }

    // Strip the atomic primitive import line itself before scanning for raw
    // writeFile/writeFileSync calls, so the named import doesn't self-match.
    const withoutAtomicImport = source.replace(ATOMIC_IMPORT_PATTERN, "");
    if (RAW_WRITE_CALL_PATTERN.test(withoutAtomicImport)) {
      diagnostics.push({
        ruleId: "WS-WRITE-02",
        severity: "error",
        message: `Allowlisted module \`${entry.module}\` (command \`${entry.command}\`) still calls writeFile/writeFileSync directly — every workspace-shared write must go through writeFileAtomic.`,
        file: entry.module,
        fixHint: `Replace the raw writeFile/writeFileSync call in ${entry.module} with writeFileAtomic (RFC-0258).`,
      });
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// workspace.write.boundary.lint
// ---------------------------------------------------------------------------

export async function runWorkspaceWriteBoundaryLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const diagnostics: Diagnostic[] = [
    ...runWsWrite01(),
    ...(await runWsWrite02(context.workspaceRoot)),
  ];

  return diagnosticsResult("workspace.write.boundary.lint", diagnostics);
}
