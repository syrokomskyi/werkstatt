---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: e2b1211b^...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/behavior-snapshot-staleness.ts
  - packages/os/site-kernel-checks/src/command-tables/01-codegen.ts
  - packages/os/site-kernel-checks/src/command-tables/build-infra.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/tests/behavior-snapshot-staleness.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/command-manifest.generated.yaml
  - docs/rfcs/rfc-0721-add-behavior-snapshot-staleness-warning.md
---

# Code Review: e2b1211b^...HEAD (RFC-0721)

### Verdict: Approved

The diff correctly implements RFC-0721: a one-directional advisory staleness check in build.prepare. The command is properly registered in build-infra.ts with scope: app, the handler only checks newRoutes direction (avoiding DNA-39 false positives), and 5 unit tests cover all key scenarios. No findings across any axis.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks build:check` exits 0. `rfc.validate --id RFC-0721` exits 0 with zero errors/warnings. All 5 unit tests pass.

### Axis A — Structural correctness

No issues. The handler uses proper typed imports, no `any`, no magic numbers. Error handling is consistent: all failure paths (no app context, no system.md, no snapshot) return empty diagnostics with exit code 0 — correct for an advisory check. No dead code, no duplicated logic.

### Axis B — DNA alignment

No issues. DNA-39 (Route registry is a merge of route sources) is correctly handled: the one-directional check only verifies system.md routes exist in the snapshot, not the reverse. This avoids false positives from Programmatic Surface routes that are in the snapshot but not in system.md pages[].

### Axis C — Ecosystem fit

No issues. Command moved from 01-codegen.ts to build-infra.ts (alongside existing behavior.snapshot commands). Pipeline placement is correct: last step in both SITES_BUILD_PREPARE_PIPELINE and SITES_BUILD_PREPARE_DEV_PIPELINE. AGENTS.md module table updated. Command manifest regenerated.

### Axis D — Forward-only compliance

No issues. The old command entry in 01-codegen.ts was removed — no dual-path. The removedRoutes direction was deleted from the handler, not kept behind a flag.

### Axis E — Agent-facing clarity

No issues. MODULE_CONTRACT and CHANGE_SUMMARY present on both the handler and test files. Compass scaffolding is complete. Variable names are clear (`declaredRoutes`, `committedRoutes`). The non-goal about removedRoutes is explicitly documented in the MODULE_CONTRACT.

### Axis F — Pragmatism

No issues. The command earns its existence as a distinct advisory check — it cannot be a flag on behavior.snapshot.validate (which runs in build.post and is fatal). Scope is minimal: only the newRoutes direction, only route existence, advisory severity.

### Axis G — Blind spots

No issues. Performance is ~200ms (YAML parse + set comparison). False positives from DNA-39 routes are explicitly avoided by the one-directional design. Edge cases (no snapshot, no app context) are handled with graceful skips. Migration path: existing apps need no changes — the check is advisory.

### Spec compliance

| Requirement from RFC-0721 | Status | Evidence |
| --- | --- | --- |
| Command registered in BUILD_INFRA_COMMANDS with scope: app | Done | build-infra.ts:142-152 |
| SNAP-STALE-01 warning for stale routes | Done | behavior-snapshot-staleness.ts:77-88 |
| One-directional (newRoutes only) | Done | behavior-snapshot-staleness.ts:75-90 |
| Advisory, non-fatal (exit code 0) | Done | diagnosticsResult sets exitCode 0 for warnings |
| Skip when no snapshot | Done | behavior-snapshot-staleness.ts:71-73 |
| build.prepare pipeline (both prod and dev) | Done | build-prepare.ts:141,208 |
| AGENTS.md updated | Done | AGENTS.md:30 |
| Command manifest regenerated | Done | docs/command-manifest.generated.yaml |
| Unit tests (5 cases) | Done | tests/behavior-snapshot-staleness.test.ts |
| SNAP-01 auto-regen unchanged | Done | No changes to build.post or orchestrateSnap01Recovery |

### Questions for the author

None — the implementation is clean and complete.
