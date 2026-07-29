---
reviewId: REVIEW-CODE-2026-07-29-02
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 6e066a9...HEAD
filesReviewed:
  - packages/os/site-kernel/src/types.ts
  - packages/os/site-kernel/src/runtime/execute-command.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/tests/build-failure-diagnostics.test.ts
  - packages/forge/os/rfc/handlers/archive.ts
  - packages/forge/os/adr/handlers/archive.ts
  - packages/forge/os/plan/handlers/archive.ts
  - packages/forge/os/audit/handlers/archive.ts
  - packages/forge/os/session/handlers/archive.ts
  - packages/forge/os/mission/handlers/archive.ts
---

# Code Review: 6e066a9...HEAD (RFC-0578 + RFC-0579)

### Verdict: Needs revision

Two Compass header gaps and one JSON-mode output corruption bug. The core implementation is sound — `KernelNextStep` type, `nextSteps` propagation, pattern-matched diagnostics, and archive handler population are all correct. The findings are mechanical fixes.

### Mechanical floor

Pass — all three packages (`@warpgogol/site-kernel`, `@warpgogol/site-kernel-handoff`, `@warpgogol/forge`) typecheck clean. All 20 handoff tests + all forge archive tests pass.

### Axis A — Structural correctness

- **Finding A-1: `nextSteps` rendering uses raw `console.log` in JSON mode.** `execute-command.ts:232-239` renders the "Next steps:" block via `console.log` directly, not through the `logger`. In JSON mode, the logger suppresses its output (`logger.ts:48-49`), but these raw `console.log` calls are NOT suppressed. This means that when `--json` is passed, the "Next steps:" text block prints to stdout before the JSON output in `cli/index.ts:220`, corrupting the JSON stream. The fix: gate the block with `context.outputFormat !== "json"` (the `outputFormat` is available on `context`), or use `logger.info` instead of `console.log`.

### Axis B — DNA alignment

No issues. `KernelNextStep` is structurally identical to `ForgeNextStep` — no dependency, just structural typing. No DNA invariants violated.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (site-kernel-handoff → site-kernel, forge handlers self-contained). `nextSteps` flows from `KernelCommandResult` → `KernelExecutionReport` → CLI JSON output (additive, backward-compatible). Archive `nextSteps` are all `kind: "optional"` per RFC-0579 design.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths. `diagnostics` field is additive to the report; `nextSteps` is additive to `KernelCommandResult`.

### Axis E — Agent-facing clarity

- **Finding E-1: `build-failure-diagnostics.test.ts` missing MODULE_CONTRACT/CHANGE_SUMMARY headers (DNA-42).** The file starts directly with `import { describe, it, expect } from "vitest"` — no Compass header. All other test files in the same directory (e.g. `mission-dirty-guard.test.ts:1-10`) carry `MODULE_CONTRACT` + `CHANGE_SUMMARY`. Add a header with purpose "RFC-0578: tests for buildFailureDiagnostics pattern matching" and a CHANGE_SUMMARY entry.

- **Finding E-2: `mission-materialization-commands.ts` CHANGE_SUMMARY missing RFC-0579 entry.** The CHANGE_SUMMARY at line 20 has an RFC-0578 entry but no RFC-0579 entry for the `nextSteps` additions (fail/pass/dirty state population, `KernelNextStep` import). Add: `<item>RFC-0579: populate nextSteps in mission.validate for pass, fail, and dirty-workpiece states.</item>`.

- **Finding E-3: `execute-command.ts` CHANGE_SUMMARY missing RFC-0579 entry.** The CHANGE_SUMMARY at lines 13-16 has RFC-0303 and RFC-0326 entries but no RFC-0579 entry for the `nextSteps` rendering and propagation. Add: `<item>RFC-0579: propagate nextSteps from KernelCommandResult to KernelExecutionReport and render as "Next steps:" block in pretty mode.</item>`.

### Axis F — Pragmatism

No issues. `KernelNextStep` is minimal (2 fields). Pattern matching is a simple array find. Archive `nextSteps` are 1-entry arrays. No over-engineering.

### Axis G — Blind spots

No issues. Build failure patterns are regex-based with fallback to "unknown". `nextSteps` for dirty state correctly interpolates `missionId`. Edge case: empty `nextSteps` array is handled (length > 0 check in renderer).

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC-0578: `BUILD-01` diagnostic with pattern-matched `fixHint` | Done | `mission-materialization-commands.ts:122-138` |
| RFC-0578: 4 build failure patterns | Done | `mission-materialization-commands.ts:87-116` |
| RFC-0578: preserve raw `build.error` | Done | `mission-materialization-commands.ts:285` |
| RFC-0578: export `buildFailureDiagnostics` for testing | Done | `mission-materialization-commands.ts:122` |
| RFC-0578: test file with pattern coverage | Done | `build-failure-diagnostics.test.ts` (7 tests) |
| RFC-0579: `KernelNextStep` interface | Done | `types.ts:150-153` |
| RFC-0579: `nextSteps` on `KernelCommandResult` | Done | `types.ts:160` |
| RFC-0579: `nextSteps` on `KernelExecutionReport` | Done | `types.ts:316` |
| RFC-0579: pretty-mode "Next steps:" block | Done | `execute-command.ts:232-239` (but see A-1) |
| RFC-0579: `mission.validate` populates for pass/fail/dirty | Done | `mission-materialization-commands.ts:302-355` |
| RFC-0579: all 6 archive handlers populate `nextSteps` | Done | `forge/os/*/handlers/archive.ts` |
| RFC-0579: `--json` includes `nextSteps` | Done | `KernelExecutionReport.nextSteps` serialized in `cli/index.ts:220` |

### Questions for the author

1. The `nextSteps` rendering at `execute-command.ts:232-239` uses `console.log` directly instead of the logger — was this intentional to bypass JSON-mode suppression, or should it be gated by `outputFormat`?
2. The `content-schema-error` pattern tests for `/schema|frontmatter|collection.*error|ZodError/i` — is the broad `schema` keyword likely to produce false positives on non-schema-related build errors that happen to mention "schema" in a file path or import?
