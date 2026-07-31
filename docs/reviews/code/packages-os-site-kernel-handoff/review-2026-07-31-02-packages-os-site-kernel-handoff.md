---
reviewId: REVIEW-CODE-2026-07-31-01
date: 2026-07-31
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: ea7094e...HEAD
filesReviewed:
  - packages/forge/os/compass/compass.module.ts
  - packages/forge/os/compass/handlers/resolve-scan-root.ts
  - packages/forge/os/compass/handlers/resolve-scan-root-workpiece.test.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/tests/mission-materialize-baseline.test.ts
  - packages/forge/AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0617-compass-audit-baseline-in-mission-materialization.md
---

# Code Review: ea7094e...HEAD (RFC-0617 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and minimal. One minor finding on axis E — the warning log line uses `logger.info` for a warning message, which is inconsistent with the non-fatal warning intent.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge build:check` and `pnpm --filter @warpgogol/site-kernel-handoff build:check` both pass. All 351 forge tests and 421 handoff tests pass.

### Axis A — Structural correctness

No issues. The `resolveCompassScanRoot` changes follow the existing pattern: check mutual exclusivity, resolve path, verify existence. The `mission-materialize.ts` integration uses the same `executeKernelCommand` pattern as the preflight gate. No magic numbers, no dead code, no untyped data.

### Axis B — DNA alignment

No issues. DNA-43 (Compass semantic-truth audit) is supported — the baseline seeds the ledger for workpiece files, which is the intended use of `compass.audit.baseline`. No invariant is weakened or bypassed.

### Axis C — Ecosystem fit

No issues. The `--workpiece` flag is added to the shared `compassScanFlags` object, making it available to all compass commands. The integration in `mission.materialize` is placed after codegen + git commit, before the materialization report — exactly as specified in the RFC. Package boundaries are respected: `forge` owns the flag handling, `site-kernel-handoff` owns the integration call.

### Axis D — Forward-only compliance

No issues. No backward compatibility shims. The flag is additive — no existing behavior is changed or maintained behind a flag.

### Axis E — Agent-facing clarity

**Finding E-1 (minor):** The warning log line at `mission-materialize.ts:996` uses `logger.info` for a warning message:

```ts
logger.info(`  Warning: compass.audit.baseline failed: ${msg}`);
```

This should use `logger.warn` if available, or at minimum the message prefix should be consistent with other warning lines in the file. The `logger.info` call is functional but semantically misleading — a baseline failure is a warning, not an informational message. However, checking the existing pattern in the file: other non-fatal warnings also use `logger.info` (e.g., preflight skip messages), so this is consistent with the existing convention. The finding is cosmetic.

### Axis F — Pragmatism

No issues. The `--workpiece` flag is a minimal addition — one new flag on the shared `compassScanFlags` object, one resolution path in `resolveCompassScanRoot`, one `executeKernelCommand` call in `mission.materialize`. No new command, no over-engineering.

### Axis G — Blind spots

No issues. Performance is addressed in the RFC (workpieces are small, < 1s scan). Edge cases: non-existent path throws clearly; non-fatal failure is caught and logged. The `path.relative` call handles absolute paths correctly.

### Spec compliance

| Requirement from RFC-0617 | Status | Evidence |
| --- | --- | --- |
| `compass.audit.baseline` accepts `--workpiece <path>` | Done | `resolve-scan-root.ts:41-48` |
| `--workpiece` mutually exclusive with `--packages` | Done | `resolve-scan-root.ts:29-33` |
| `--workpiece` mutually exclusive with `--site` | Done | `resolve-scan-root.ts:35-39` |
| `mission.materialize` calls baseline after codegen | Done | `mission-materialize.ts:982-997` |
| Non-fatal baseline failure | Done | `mission-materialize.ts:994-997` (try/catch with warning) |
| Shared `compassScanFlags` for flag | Done | `compass.module.ts:38-41` |
| Unit tests | Done | 5 resolve-scan-root tests + 2 materialize tests |

### Questions for the author

1. The warning log uses `logger.info` — is this the established convention for non-fatal warnings in `mission-materialize.ts`, or should `logger.warn` be used? (Answered: existing convention uses `logger.info` for non-fatal warnings.)
