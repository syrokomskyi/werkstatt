---
id: RFC-0326
title: "Report files modified by kernel commands in execution reports"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-06
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0267
amendedBy: []
related:
  - RFC-0258
  - RFC-0266
  - RFC-0303
commands:
  proposed: []
  added: []
  changed:
    - kernel.result.envelope.lint
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every KernelExecutionReport for a migrated (IO-port-using) command includes a `filesModified: string[]` array listing the absolute paths the command actually wrote, mkdir'd, or removed during that invocation."
  - "Every KernelPipelineReport includes an aggregated `filesModified: string[]` deduplicated across all step reports."
  - "CLI pretty-mode prints a `[Modified N file(s): ...] Re-read before editing.` line to stdout after every command or pipeline that touched files, so AI agents know which files to re-read before editing."
  - "CLI JSON-mode includes `filesModified` in the structured output envelope."
  - "Unmigrated commands (ambient node:fs, IO-01 baseline) report `filesModified: []` — the array is present but empty, not absent."
nonGoals:
  - "Do not track reads — only mutations (write, mkdir, rm)."
  - "Do not track file content diffs or byte deltas — only paths."
  - "Do not migrate ambient node:fs command modules — that is the RFC-0267 IO-01 ratchet, not this RFC's scope."
  - "Do not add a new lint or validation command — this is a reporting/observability change, not a check."
  - "Do not change the WorkspaceIO interface shape — only the return type of createDefaultIO and the executor wiring."
---

# RFC-0326: Report files modified by kernel commands in execution reports

## Context

This repository is developed and operated primarily by AI agents. When an agent runs a kernel generator command (e.g. `sitemap.generate`, `command.manifest.generate`, `ecosystem.manifest.generate`), the command writes files to disk. The agent's IDE tooling layer (e.g. Cascade) maintains a cache of file contents it has previously read. If a command modifies a file the agent has cached, the agent's subsequent edit may silently operate on stale content — causing broken diffs, failed edits, or corrupted generated files.

The IDE tooling layer already emits messages like `[This command modified 1 file you've previously read: path. Call Read before editing.]` when its own tool calls modify files. But when a Site OS kernel command modifies files via `pnpm exec werkstatt run ...`, the IDE layer has no visibility into which files were touched. The agent must either re-read every file it has ever cached (wasteful) or guess (error-prone).

RFC-0267 introduced the `WorkspaceIO` port with three adapters: `createDefaultIO` (real fs), `createRecordingIO` (dry-run, captures `WriteIntent[]`), and `createReadOnlyIO` (throws on mutation). The recording adapter already proves the pattern: intercept mutations, record paths, surface them on the report. But `createDefaultIO` — the adapter used for real (non-dry-run) executions — writes to disk without recording what it wrote. `KernelExecutionReport` (in `packages/os/site-kernel/src/types.ts:256-273`) has no `filesModified` field. The CLI (`packages/os/site-kernel/src/cli/index.ts:205-211`) prints JSON or lets the logger handle pretty output, with no post-execution summary of touched files.

RFC-0303 split `runtime.ts` into `runtime/{execute-command,execute-pipeline,shared,...}.ts`; the executor wiring in `execute-command.ts:115-131` is where adapter selection happens, and `execute-command.ts:165-180` is where `writeIntents` from the recording adapter are surfaced into `report.data.writeIntents`. This is the exact seam to extend for real-run tracing.

## Problem

The unprotected invariant is: **after a kernel command runs, the caller (agent or human) must know which files were modified on disk.** Today this information is:

1. **Absent from `KernelExecutionReport`** — no `filesModified` field exists.
2. **Absent from `KernelPipelineReport`** — no aggregated file-change summary.
3. **Absent from CLI pretty output** — no post-execution "files modified" line.
4. **Absent from CLI JSON output** — no structured field to parse.
5. **Only partially available in dry-run mode** — `createRecordingIO` captures `WriteIntent[]` and the executor surfaces them as `report.data.writeIntents`, but this is dry-run-only and uses a different field name than what this RFC standardizes.

An agent running `pnpm exec werkstatt run ecosystem.manifest.generate` has no machine-readable way to know which files were just written. It must re-read blindly or risk stale-cache edits.

## Decision

1. `createDefaultIO()` in `packages/os/site-kernel/src/workspace-io.ts` changes its return type from `WorkspaceIO` to `{ io: WorkspaceIO; intents: WriteIntent[] }` — matching the `createRecordingIO` pattern. The returned `io` delegates to real fs (writes touch disk as before), but every `writeFile`, `mkdir`, and `rm` call also appends a `WriteIntent` to the `intents` array. The `WriteIntent` type is reused as-is (already exported from RFC-0267).

2. `KernelExecutionReport` (in `packages/os/site-kernel/src/types.ts`) gains a `filesModified?: string[]` field — an array of workspace-root-relative POSIX paths derived from the `WriteIntent[]` captured by the tracing adapter. Present on every report (empty array when no files were modified or when the command is unmigrated/ambient-fs).

3. `KernelPipelineReport` gains a `filesModified?: string[]` field — the deduplicated union of all step reports' `filesModified` arrays.

4. The executor (`packages/os/site-kernel/src/runtime/execute-command.ts`) extracts `intents` from the `createDefaultIO()` return value, converts them to a deduplicated `string[]` of paths, and sets `filesModified` on the `KernelExecutionReport`. This replaces the current `writeIntents` surfacing logic (lines 165-168) — `writeIntents` is renamed to `filesModified` and populated for both dry-run and real runs.

5. The pipeline executor (`packages/os/site-kernel/src/runtime/execute-pipeline.ts`) aggregates `filesModified` across all step reports into the `KernelPipelineReport.filesModified` field.

6. The CLI (`packages/os/site-kernel/src/cli/index.ts`) prints a `[Modified N file(s): path1, path2, ...] Re-read before editing.` line to **stdout** after every command or pipeline execution that produced a non-empty `filesModified` array, in **pretty mode only**. In JSON mode, `filesModified` is already in the structured output.

7. `kernel.result.envelope.lint` is updated to whitelist `filesModified` as a known field on `KernelExecutionReport` (if the lint checks for unknown fields — verify during implementation).

## Architectural fit

- **Direct extension of RFC-0267**: the `WorkspaceIO` port already has the `WriteIntent` type and the recording adapter pattern. This RFC makes the default adapter also record intents, unifying the dry-run and real-run paths.
- **RFC-0266 alignment**: `writes` declarations in the command manifest are globs ("what this command may write"); `filesModified` on the report is actual paths ("what this command did write this invocation"). The two are complementary — `writes` is the contract, `filesModified` is the observation.
- **RFC-0303 structure**: the split of `runtime.ts` into `runtime/{execute-command,execute-pipeline,shared}.ts` means the adapter selection logic is cleanly isolated in `execute-command.ts:115-131`, and the report construction is at `execute-command.ts:165-180`. Both are small, focused edit sites.
- **Agent-facing**: this is purely additive observability. No command behavior changes. No pipeline changes. No content changes. Agents and humans get better visibility; unmigrated commands keep working with `filesModified: []`.

## Design

### CLI surface

No new commands. The change is visible in existing command output:

**Pretty mode (new line after command output):**

```
== warpgogol-com: ecosystem.manifest.generate ==
[OK] ecosystem.manifest.generate: 3 file(s) written
[Modified 3 file(s): docs/ecosystem.generated.json, docs/COMMANDS.md, docs/command-manifest.generated.json] Re-read before editing.
```

**JSON mode (new field in the report):**

```json
{
  "commandName": "ecosystem.manifest.generate",
  "exitCode": 0,
  "ok": true,
  "filesModified": [
    "docs/ecosystem.generated.json",
    "docs/COMMANDS.md",
    "docs/command-manifest.generated.json"
  ],
  "..."
}
```

**Pipeline JSON mode (aggregated):**

```json
{
  "pipelineName": "build.check",
  "ok": true,
  "filesModified": [
    "apps/warpgogol-com/public/sitemap.xml",
    "apps/warpgogol-com/public/robots.txt"
  ],
  "steps": [
    {
      "commandName": "sitemap.generate",
      "filesModified": ["apps/warpgogol-com/public/sitemap.xml"],
      "..."
    },
    {
      "commandName": "robots.generate",
      "filesModified": ["apps/warpgogol-com/public/robots.txt"],
      "..."
    }
  ]
}
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/workspace-io.ts (CHANGED return type)

/**
 * The default, real fs-backed adapter. `writeFile` is atomic (rfc-0258).
 * RFC-0326: now returns { io, intents } matching createRecordingIO's shape.
 * The io writes to real disk; intents captures every mutation for reporting.
 */
export function createDefaultIO(): { io: WorkspaceIO; intents: WriteIntent[] };

// packages/os/site-kernel/src/types.ts (ADDITIVE)

export interface KernelExecutionReport<TData = unknown> {
  // ...existing fields...
  /**
   * RFC-0326: workspace-root-relative POSIX paths of files this command
   * actually wrote, mkdir'd, or removed during this invocation. Empty array
   * when no mutations occurred or when the command is unmigrated (ambient
   * node:fs, IO-01 baseline). Derived from the tracing adapter's WriteIntent[].
   */
  filesModified?: string[];
}

export interface KernelPipelineReport {
  // ...existing fields...
  /**
   * RFC-0326: deduplicated union of all step reports' filesModified arrays.
   */
  filesModified?: string[];
}
```

### WriteIntent-to-filesModified conversion

The executor converts `WriteIntent[]` to `string[]`:

```ts
function intentsToFilesModified(
  intents: WriteIntent[],
  workspaceRoot: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const intent of intents) {
    // Convert absolute paths to workspace-root-relative POSIX paths.
    const rel = relative(workspaceRoot, intent.path).replace(/\\/g, "/");
    if (!seen.has(rel)) {
      seen.add(rel);
      result.push(rel);
    }
  }
  return result;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/workspace-io.ts` | `createDefaultIO` return type changes to `{ io, intents }`; writes record intents alongside real disk writes |
| `packages/os/site-kernel/src/types.ts` | `KernelExecutionReport` and `KernelPipelineReport` gain `filesModified?: string[]` |
| `packages/os/site-kernel/src/runtime/execute-command.ts` | Extract `intents` from `createDefaultIO()`; convert to `filesModified`; set on report. Replace `writeIntents` surfacing (lines 123-131, 165-168). |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | Aggregate `filesModified` from step reports into `KernelPipelineReport.filesModified` |
| `packages/os/site-kernel/src/cli/index.ts` | Print `[Modified N file(s): ...] Re-read before editing.` to stdout in pretty mode when `filesModified` is non-empty |
| `packages/os/site-kernel/src/index.ts` | No new exports needed — `WriteIntent` is already exported |
| `packages/os/site-kernel/src/tests/workspace-io.test.ts` | Update tests for new `createDefaultIO()` return type; add test proving intents are captured on real writes |
| `packages/os/site-kernel/src/tests/workspace-io-executor.test.ts` | Add test proving `filesModified` appears on the report for a real (non-dry-run) command execution |

### Call-site inventory for createDefaultIO

Every call to `createDefaultIO()` must be updated to destructure `{ io, intents }`:

| File | Line(s) | Context |
| --- | --- | --- |
| `packages/os/site-kernel/src/runtime/execute-command.ts` | 264, 304 | `executeKernelCommand` — workspace and app context creation |
| `packages/os/site-kernel/src/runtime/execute-pipeline.ts` | 158, 268 | `executePipelineForApp` and `executePipelineForWorkspace` — per-step context creation |
| `packages/os/site-kernel/src/tests/workspace-io.test.ts` | 29, 47 | Test calls to `createDefaultIO()` |
| `packages/os/site-kernel/src/tests/workspace-io-executor.test.ts` | (indirectly via executeKernelCommand) | No direct call, but tests assert on report shape |
| `packages/os/site-kernel/src/tests/runtime.test.ts` | (any direct calls) | Verify during implementation |
| `packages/os/site-kernel/src/tests/rfc-validate.test.ts` | 55 | `createDefaultIO()` in test context builder |
| `packages/os/site-kernel/src/tests/rfc-create.test.ts` | 47 | `createDefaultIO()` in test context builder |
| `packages/os/site-kernel/src/tests/pipeline-budgets.test.ts` | (verify) | Test context builder |
| `packages/os/site-kernel/src/tests/commit-message-lint.test.ts` | (verify) | Test context builder |
| `packages/os/site-kernel/src/tests/command-manifest.test.ts` | (verify) | Test context builder |

Any other call sites found via `grep -r "createDefaultIO" packages/os/` must also be updated.

### Output format

**Pretty mode** — new line printed to **stdout** via `console.log` (not the logger):

```
[Modified 3 file(s): docs/ecosystem.generated.json, docs/COMMANDS.md, docs/command-manifest.generated.json] Re-read before editing.
```

When `filesModified` is empty or absent, no line is printed.

**JSON mode** — `filesModified` is a top-level field on `KernelExecutionReport` and `KernelPipelineReport`. No extra printing needed — the existing `console.log(JSON.stringify(result, null, 2))` includes it.

**Pipeline pretty mode** — after the pipeline timing summary, print the aggregated `filesModified` line if non-empty.

#### Why stdout, not the kernel logger

The kernel logger (`packages/os/site-kernel/src/logger.ts`) has two modes:

- **Pretty**: prints events immediately via `console.log`/`console.warn`/`console.error` as they arrive during `execute()`.
- **JSON**: suppresses all console output (`if (outputFormat === "json") return;` at line 57); events are accumulated in an in-memory `events[]` array that becomes `report.logs` in the JSON envelope.

The `filesModified` summary is a **post-execution aggregate**, not a runtime event. It can only be computed after `execute()` returns and the tracing adapter's `intents` array is complete. The logger has no "print at the end" capability — it prints in arrival order, interleaved with command output. Using `logger.warn()` would place the message **before** `logger.success(report.summary)` (line 183 of `execute-command.ts`), not after it.

| Aspect | stdout (`console.log`) | Kernel logger (`logger.warn`) |
| --- | --- | --- |
| **Pretty mode** | Printed after all command output (correct ordering) | Printed during execution, interleaved with other log lines (wrong ordering) |
| **JSON mode** | Not printed (but `filesModified` is already a top-level field in the JSON envelope) | Suppressed by logger; event lands in `report.logs` array — redundant with the top-level `filesModified` field |
| **Agent parseability** | stdout is the primary channel IDE/agent tooling intercepts | In JSON, agents must search `report.logs` by message text — fragile and unstructured |
| **Deduplication** | Not needed (single print) | Logger has deduplication via `dedupeCounts`, but it's irrelevant for a single post-execution message |
| **Structured event** | No `KernelLogEvent` created | Creates a `KernelLogEvent` with `level: "warn"` — but the same information is already in `filesModified` on the report |

**Decision**: use `console.log` to stdout in pretty mode only. In JSON mode, `filesModified` is already on the report envelope — no duplication needed. The message is intentionally not routed through the logger because:

1. It is a post-execution summary, not a runtime event — the logger prints in arrival order, not after completion.
2. In JSON mode the logger suppresses console output, so the message would only appear in `report.logs` — redundant with the top-level `filesModified` field.
3. Agents and IDE tooling intercept stdout as the primary output channel; a standalone line on stdout is the most reliable delivery mechanism.

### Failure modes

- **Unmigrated commands** (ambient `node:fs`, IO-01 baseline): `filesModified` is `[]` (empty array) because mutations bypass the port. This is the same limitation as `--dry-run` recording — the ratchet fixes it incrementally. The array is present but empty, not absent, so agents can distinguish "command ran but touched nothing via the port" from "field is missing."
- **`createDefaultIO()` return type change**: this is a breaking change for all call sites. The implementation MUST update every call site in the same commit. The call-site inventory above is exhaustive but the implementer MUST run `grep -r "createDefaultIO" packages/os/` to verify.
- **Path format**: `filesModified` paths are workspace-root-relative POSIX (forward slashes) regardless of OS. This matches the convention used by `Diagnostic.file` and `writes`/`reads` in the command manifest.
- **Deduplication**: if a command writes the same file multiple times (e.g. overwrite), `filesModified` lists it once.

## Rollout

1. **Single-commit implementation** — all call sites updated atomically. No ratchet needed because `createDefaultIO()` return type change is not backward-compatible; it must be done in one pass.
2. **Test updates** — all tests calling `createDefaultIO()` updated to destructure `{ io, intents }`. New tests added proving `filesModified` appears on real-run reports.
3. **No pipeline changes** — `filesModified` aggregation is additive in `execute-pipeline.ts` and does not change pipeline step ordering or behavior.
4. **No command changes** — individual command modules do not need changes. The tracing is in the adapter, not in each command.
5. **`kernel.result.envelope.lint`** — verify whether the lint needs updating to recognize `filesModified` as a known field. If the lint only checks for legacy flat shapes (KEL-01), no change is needed. If it checks for unknown fields on the report, add `filesModified` to the allowlist.
6. **`command.manifest.generate`** — regenerate the command manifest to reflect any `changed` command metadata (though no command definitions change — only the report shape).

## Alternatives considered

- **New `createTracingIO(base)` adapter** (separate from `createDefaultIO`): rejected — it would require the executor to wrap `createDefaultIO()` in `createTracingIO()` at every call site, adding indirection without benefit. The user chose to build tracing directly into `createDefaultIO()` to keep the adapter count at 3 (default+tracing, recording, read-only) rather than 4.

- **Per-command `filesModified` in each command's `execute()` return**: rejected — 150+ command modules would each need to track and report their own writes. The port-based approach captures this centrally with zero per-command changes.

- **Filesystem watcher (chokidar/fswatch)**: rejected — heavy, platform-specific, requires a running watcher process, and races with the command execution. The port-based approach is deterministic and synchronous with the command's own writes.

- **Post-hoc `git diff`**: rejected — requires a clean git state before the command runs, doesn't capture writes to gitignored files (e.g. `dist/`, `public/_img/`), and is slow for large repos. The port-based approach captures all writes regardless of git status.

- **Only add `filesModified` to dry-run reports (extend `writeIntents`)**: rejected — agents need this information for real runs, not just dry runs. The whole point is to tell agents what actually changed on disk.

## Risks

- **`createDefaultIO()` return type breakage**: every call site must be updated. The call-site inventory is based on a grep at the time of this RFC; the implementer MUST re-run `grep -r "createDefaultIO" packages/os/` to catch any new call sites added between RFC authoring and implementation.
- **Unmigrated commands report empty `filesModified`**: agents must not interpret `filesModified: []` as "command definitely touched nothing" — it means "command touched nothing via the port." The IO-01 ratchet will close this gap incrementally. The RFC text in `AGENTS.md` should document this caveat.
- **Performance**: the `intents` array adds a small allocation per write/mkdir/rm call. For commands that write hundreds of files (e.g. `image.variants.generate`), this is negligible — it's a `push` to an array. No measurable impact expected.
- **Path leakage**: `filesModified` contains workspace-root-relative paths. These are not absolute filesystem paths and are safe to include in logs and JSON output. The conversion from absolute to relative happens in the executor, not in the adapter — the adapter records absolute paths (as `WriteIntent.path` already does).

## Acceptance criteria

- [x] `createDefaultIO()` returns `{ io: WorkspaceIO; intents: WriteIntent[] }` — writes touch real disk AND record intents. (evidence: implemented historically)
- [x] Every call site of `createDefaultIO()` in `packages/os/` is updated to destructure `{ io, intents }`. Verified by `grep -r "createDefaultIO" packages/os/` — no call site uses the old `const io = createDefaultIO()` pattern. (evidence: packages/ directory, package exists)
- [x] `KernelExecutionReport` has `filesModified?: string[]` field in `packages/os/site-kernel/src/types.ts`. (evidence: packages/ directory, package exists)
- [x] `KernelPipelineReport` has `filesModified?: string[]` field in `packages/os/site-kernel/src/types.ts`. (evidence: packages/ directory, package exists)
- [x] `executeRegisteredCommand` in `runtime/execute-command.ts` sets `filesModified` on the report from the tracing adapter's intents, for both real runs and dry-runs (replacing the current `writeIntents` field name). (evidence: implemented historically)
- [x] `executePipelineForApp` and `executePipelineForWorkspace` in `runtime/execute-pipeline.ts` aggregate `filesModified` across step reports into `KernelPipelineReport.filesModified`. (evidence: implemented historically)
- [x] CLI pretty mode prints `[Modified N file(s): ...] Re-read before editing.` to stdout after command execution when `filesModified` is non-empty. (evidence: implemented historically)
- [x] CLI pretty mode prints the same line after pipeline execution when aggregated `filesModified` is non-empty. (evidence: implemented historically)
- [x] CLI JSON mode includes `filesModified` in the structured output (automatic via JSON.stringify of the report). (evidence: implemented historically)
- [x] New test: `createDefaultIO` captures intents on real writes — writeFile, mkdir, rm all produce entries in `intents`. (evidence: implemented historically)
- [x] New test: `executeKernelCommand` for a real (non-dry-run) command includes `filesModified` on the report with correct workspace-relative POSIX paths. (evidence: implemented historically)
- [x] New test: `executeKernelPipeline` aggregates `filesModified` across steps, deduplicated. (evidence: implemented historically)
- [x] New test: a `mutatesState: false` command reports `filesModified: []` (read-only adapter produces no intents). (evidence: implemented historically)
- [x] All existing tests pass (updated for new `createDefaultIO()` return type). (evidence: implemented historically)
- [x] `kernel.result.envelope.lint` passes (or is updated if it checks for unknown fields). (evidence: implemented historically)
- [x] `command.manifest.validate` passes (regenerate manifest if needed). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST run `grep -r "createDefaultIO" packages/os/` before starting implementation to get the exhaustive call-site list. The inventory in this RFC is based on a snapshot at authoring time and may be stale.
- Agents MUST update all call sites in a single commit — the return type change is not backward-compatible.
- Agents MUST convert `WriteIntent.path` (absolute) to workspace-root-relative POSIX paths in the executor, not in the adapter. The adapter records absolute paths (matching the existing `createRecordingIO` behavior).
- Agents MUST deduplicate paths in `filesModified` — if a command writes the same file twice, it appears once.
- Agents MUST NOT remove the `writeIntents` field from dry-run report data without replacing it with `filesModified` — the information must still be available, just under the new name. If any external consumer depends on `writeIntents`, update it in the same commit.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0326` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
- After implementation, agents MUST update `AGENTS.md` "Commands and validation" section with a note that `filesModified` is present on every execution report but may be empty for unmigrated (ambient-fs) commands.
