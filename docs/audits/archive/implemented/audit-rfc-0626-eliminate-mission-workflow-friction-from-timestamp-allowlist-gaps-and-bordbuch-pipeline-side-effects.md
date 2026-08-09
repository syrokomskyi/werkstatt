---
rfcId: RFC-0626
auditId: AUDIT-RFC-0626-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0626

## Verdict: Needs revision

The RFC has a critical architectural flaw in Phase 2: `bordbuch.commit` cannot be an "internal pipeline step, not a registered CLI command" because pipeline steps are dispatched via `executeKernelCommand({ commandName: step.command })`, which requires a registered command handler. Additionally, the RFC's Context narrative for Gap 1 is stale — `content-freshness.ts` is already in `TIMESTAMP_ALLOWLIST`.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **TypeScript contract syntax error**: The `checkAllowlistParity` signature at line 176 reads `): Diagnostic[];` — the semicolon should be a colon (`): Diagnostic[] {` or use interface notation). This is a cosmetic issue but will confuse agents implementing the contract.
- **File system responsibilities table** for Phase 2 omits `packages/os/site-kernel-handoff/src/werkstatt/git-exec.ts` (the shared `gitExec` utility the RFC says to reuse) and `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` (`resolveCachePath`). These are read/import dependencies for the new `bordbuch-commit.ts` file.
- **Output format** section only covers Phase 1 (TS-TIME-02). Phase 2's `bordbuch.commit` step produces a pipeline step result — the RFC should clarify what the step's `summary` and `data` shape look like in the pipeline report.

## Axis B — DNA alignment

- **DNA-18 alignment is tenuous.** The RFC says the parity check "ensures that all modules in `GENERATOR_OWNERSHIP_MAP` are consistently validated, maintaining the integrity of the generated-file contract that feeds the uni registry." This is indirect — `GENERATOR_OWNERSHIP_MAP` feeds `generated.files.validate` and `ownership.sync.validate`, not the uni registry directly. The uni registry (`uni.registry.yaml`) is built from manifests, not from `GENERATOR_OWNERSHIP_MAP`. Consider replacing DNA-18 with a more directly relevant invariant or removing it.
- **DNA-51 alignment is solid.** The `bordbuch.commit` step extends the auto-commit pattern (RFC-0580, RFC-0477) which is a werkstatt consistency primitive.

## Axis C — Ecosystem fit

- **Critical: `bordbuch.commit` cannot be an unregistered internal pipeline step.** The pipeline executor at `packages/os/site-kernel-checks/src/module.ts:195` dispatches each step via `executeKernelCommand({ commandName: step.command, ... })`. This requires the command to be registered in a kernel module's command registry. If `bordbuch.commit` is not registered, the pipeline will fail with "unknown command: bordbuch.commit". The RFC must either:
  1. Register `bordbuch.commit` as a kernel command (in `site-kernel-handoff`'s bordbuch module) and add it to `commands.added` in the frontmatter, OR
  2. Implement the auto-commit within an existing mechanism (e.g., extend `bordbuch.generate` with an `--auto-commit` flag — but the RFC rejected this alternative for single-responsibility reasons, which is valid), OR
  3. Use a pipeline post-hook or a different mechanism that doesn't require a command registration.

  Option 1 is the cleanest: register `bordbuch.commit` as a command, add it to `commands.added`, and note in the RFC that while it is callable by operators, it is primarily intended as a pipeline step. The RFC's `commands` frontmatter already has `bordbuch.generate` in `changed` — `bordbuch.commit` should be in `added`.

- **`commands.changed` lists `bordbuch.generate`** but the RFC explicitly says "Do not change the bordbuch.generate command handler itself" (nonGoals, line 67) and "bordbuch-generate.ts: Unchanged" (file system responsibilities, line 272). `bordbuch.generate` should not be in `changed` — it is not modified by this RFC. Only `generated.timestamp.validate` is changed.
- **Package boundary**: `commitBordbuchProjections` in `site-kernel-handoff` is correct — it follows the existing `commitAndPushBordbuch` and `commitWerkstattSideEffects` pattern in the same package.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual paths.

## Axis E — Agent-facing policy

- **Implementation notes** correctly reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). No self-authorizing language.
- **Status gate**: the RFC is `draft` and correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted."

## Axis F — Pragmatism

- **Gap 1 parity check is well-scoped**: extending `generated.timestamp.validate` with a Phase 2 parity check is the right approach — it reuses existing scanning infrastructure and adds minimal new logic.
- **Gap 2 `bordbuch.commit` is minimal but architecturally broken** (see Axis C). The helper function `commitBordbuchProjections` is lean and follows existing patterns, but it cannot be invoked as a pipeline step without command registration.
- **`appsImpacted` lists `warpgogol-com`** — this is accurate as the motivating system, but the changes are package-level (`site-kernel-checks`, `site-kernel-handoff`). No app-specific changes are needed. Consider whether `appsImpacted` should be empty since the changes are in shared packages.

## Axis G — Blind spots

- **Stale context narrative**: The RFC's Context section (line 92) states `content-freshness.ts` "was missing from `TIMESTAMP_ALLOWLIST`" — but the actual code at `generated-timestamp-validate.ts:81-85` shows it IS already in the allowlist with a proper reason. The specific incident that motivated Gap 1 has already been fixed. The parity check is still valuable as a preventive measure, but the RFC's narrative should be updated to reflect the current state: "was missing during mission warpgogol-com-m000023 but has since been added — the parity check would have caught this automatically."
- **Phase 1 performance claim is inaccurate**: The RFC says "the parity check reuses the same `scanModuleForTimestamps` results from Phase 1 — no additional file I/O" (line 328). However, `runPhase1` does not expose the raw scan results — it only returns `Diagnostic[]`. The violations are computed inside the loop at line 215 but not returned. The implementation would need to either refactor `runPhase1` to return scan results alongside diagnostics, or re-scan modules in the parity check (doubling the file I/O). The RFC should specify which approach to take.
- **`bordbuch.commit` non-mission scenario**: The RFC says the step "skips with a warning if the cache path cannot be resolved" for non-mission `build.prepare`. But `bordbuch.generate` itself calls `resolveCachePath` and throws if it fails (line 184: `if (!systemId) throw new Error`). If `bordbuch.generate` succeeds, the cache path is valid — so `bordbuch.commit` running after it will always have a valid cache path. The non-mission skip scenario is unreachable when `bordbuch.commit` follows `bordbuch.generate` in the pipeline.

## Questions for the author

1. How will `bordbuch.commit` be executed as a pipeline step if it is not a registered kernel command? The pipeline executor dispatches via `executeKernelCommand({ commandName: step.command })` — will you register it as a command, or use a different mechanism?
2. Why is `bordbuch.generate` listed in `commands.changed` when the RFC explicitly states it is not modified?
3. How will the Phase 1 parity check access `scanModuleForTimestamps` results without re-scanning, given that `runPhase1` only returns `Diagnostic[]` and does not expose the raw violations?
4. Is DNA-18 the right invariant to reference? The parity check validates `GENERATOR_OWNERSHIP_MAP` ↔ `TIMESTAMP_ALLOWLIST` consistency, which feeds `generated.files.validate` — not the uni registry directly.
