---
reviewId: REVIEW-CODE-2026-07-24-01
date: 2026-07-24
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: f6a79824f...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/guards.ts
  - packages/os/site-kernel-handoff/src/index.ts
  - packages/os/site-kernel-handoff/src/release/breaks-c-helper.ts
  - packages/os/site-kernel-handoff/src/release/breaks-c-helper.test.ts
  - packages/os/site-kernel-handoff/src/release/c-surface-guard.ts
  - packages/os/site-kernel-handoff/src/release/c-surface-guard.test.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts
  - packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.test.ts
  - packages/os/site-kernel-handoff/src/sternsystem/external-edit-collector.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: f6a79824f...HEAD (RFC-0520 implementation)

### Verdict: Needs revision

One behavioral regression found in the C-surface guard call site: `exitCode ?? 0` changes semantics for `undefined` exit codes from "fail" to "pass". Two minor findings on log formatting and unused imports.

### Mechanical floor

Pass — `build:check` (tsc --noEmit) exit 0, `rfc.validate` pass, 13/13 new tests pass.

### Axis A — Structural correctness

**Finding A-1 (minor): Unused imports in `sternsystem-validate.ts`.**
`execSync`, `fs`, `existsSync`, and `path` are still imported and used elsewhere in the file (mirror remote check, pin file validation, bundle contract check). No issue — all imports are still needed. No action required.

**Finding A-2 (minor): `CSurfaceGuardResult` re-declares `metadata` with a narrower type.**
`GuardResult.metadata` is `Record<string, unknown>`. `CSurfaceGuardResult` narrows it to `{ surfaceSummary?: string; rfcId?: string | null; breaksC?: boolean }`. This is valid TypeScript and provides better type narrowing for consumers. No action required.

No other structural issues. No `any`, no magic numbers, no dead code. Error handling preserves existing patterns.

### Axis B — DNA alignment

No issues. DNA-42 (Compass markup) satisfied — all 5 new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. No other DNA invariants directly touched.

### Axis C — Ecosystem fit

No issues. Package boundaries respected — all imports within `@warpgogol/site-kernel-handoff`. AGENTS.md updated with extracted guard references. No new commands, no pipeline changes.

### Axis D — Forward-only compliance

No issues. Inline code was replaced, not kept alongside. No compatibility shims, no dual paths.

### Axis E — Agent-facing clarity

No issues. All new files have Compass scaffolding. Function names are descriptive (`evaluateCSurfaceGate`, `evaluateExternalEditGate`, `checkBreaksCDeclaration`, `collectExternalEditInputs`). No ungrounded assertions.

### Axis F — Pragmatism

No issues. No new commands. `GuardResult` is minimal. Extraction follows the pattern of `GateResult` from `@warpgogol/surface` but intentionally simpler. Scope is tight — only the two inline guards were extracted.

### Axis G — Blind spots

**Finding G-1 (must fix): Behavioral regression in `release-commands.ts` — `exitCode ?? 0` changes semantics for `undefined`.**

`KernelCommandResult.exitCode` is typed as `exitCode?: number` (optional). The original code:
```ts
cSurfaceVerdict = surfaceResult.exitCode === 0 ? "pass" : "fail";
```
When `exitCode` is `undefined`: `undefined === 0` → `false` → `"fail"`.

The new code:
```ts
surfaceValidateResult: { exitCode: surfaceResult.exitCode ?? 0, ... }
```
When `exitCode` is `undefined`: `undefined ?? 0` → `0` → guard sees `0` → `"pass"`.

This is a behavioral regression. When `surface.contract.validate` returns without an `exitCode` (which is valid per the type), the original code treated it as a failure; the new code treats it as a pass.

**Fix:** Remove the `?? 0` and pass `surfaceResult.exitCode` directly. The guard already handles non-zero values correctly. Alternatively, change to `surfaceResult.exitCode ?? 1` to default to fail (matching original semantics).

File: `packages/os/site-kernel-handoff/src/release/release-commands.ts:250`

**Finding G-2 (minor): Log message indentation lost.**

Original:
```ts
logger.info(`  C-surface regression detected but breaksC: true declared in RFC ${rfcId}`);
```
(two leading spaces for indentation)

New:
```ts
logger.info(guardResult.summary);
```
Guard summary: `C-surface regression detected but breaksC: true declared in RFC ${rfcId}` (no leading spaces)

This is a cosmetic regression — the log line loses its indentation. No behavioral impact.

### Spec compliance

| Requirement from RFC-0520 | Status | Evidence |
| --- | --- | --- |
| GuardResult types exported | Done | guards.ts:16-26, index.ts:71 |
| evaluateCSurfaceGate pure function | Done | c-surface-guard.ts:38-72 |
| evaluateExternalEditGate pure function | Done | external-edit-guard.ts:40-77 |
| release.prepare delegates to guard | Done | release-commands.ts:230-267 |
| sternsystem.validate delegates to guard | Done | sternsystem-validate.ts:238-260 |
| Unit tests for guards | Done | 13 tests, all pass |
| build:check passes | Done | tsc --noEmit exit 0 |
| rfc.validate passes | Done | status:pass |
| Preserve exact error messages | Partial | Error messages preserved, but exitCode ?? 0 changes behavior (G-1) |
| Preserve string-matching heuristic | Done | err.message.includes("C-surface regression") preserved |

### Questions for the author

1. Should `exitCode ?? 0` be changed to `exitCode ?? 1` (default fail) or just `exitCode` (let guard handle undefined)? The original code defaulted to fail for undefined exit codes.
2. Is the lost log indentation (G-2) acceptable, or should the guard summary include leading spaces?
