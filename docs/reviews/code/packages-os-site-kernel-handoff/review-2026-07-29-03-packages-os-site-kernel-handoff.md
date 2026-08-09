---
reviewId: REVIEW-CODE-2026-07-29-03
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
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
  - .agents/skills/fo-idea-implement/SKILL.md
  - .agents/skills/fo-fix/SKILL.md
---

# Code Review: 6e066a9...HEAD (RFC-0578 + RFC-0579 + RFC-0575 fix)

### Verdict: Approved

Zero findings across all axes. The diff implements RFC-0578 (structured BUILD-01 diagnostics), RFC-0579 (`nextSteps` on kernel results and archive handlers), and restores RFC-0575 pre-flight steps that were accidentally deleted by commit `575a108`.

### Mechanical floor

Pass — all three affected packages (`@warpgogol/site-kernel`, `@warpgogol/site-kernel-handoff`, `@warpgogol/forge`) typecheck clean. 7/7 `build-failure-diagnostics` tests pass.

### Axis A — Structural correctness

No issues.

- `KernelNextStep` is minimal: `action: string` + `kind: "required" | "optional"`. No over-engineering.
- `buildFailureDiagnostics` is a pure function: takes `string`, returns `Diagnostic[]`. Pattern matching is a simple `Array.find` — no speculative generality.
- `BUILD_FAILURE_PATTERNS` array is well-structured with `id`, `test`, `fixHint`, `excerpt` fields. Each pattern is self-contained.
- `extractErrorLine` handles edge cases: missing match line, empty output. Truncates to 200 chars.
- `nextSteps` propagation in `execute-command.ts:219` is a single-field assignment from `result?.nextSteps` to `report.nextSteps`. No transformation, no data loss.
- Pretty-mode rendering at `execute-command.ts:234` correctly gates on `context.outputFormat !== "json"` — prevents JSON stream corruption.
- Archive handler `nextSteps` are all 1-entry arrays with `kind: "optional"`. Consistent across all 6 handlers.

### Axis B — DNA alignment

No issues.

- No DNA invariants violated. `KernelNextStep` is a new type, not a modification of existing DNA-protected types.
- `Diagnostic` shape (DNA-11 relevant via `content.links.validate` etc.) is preserved — `buildFailureDiagnostics` returns canonical `Diagnostic[]` with `ruleId`, `severity`, `message`, `fixHint`, `data`.
- No `apps/*` → `apps/*` or `apps/*` → `services/*` imports introduced.

### Axis C — Ecosystem fit

No issues.

- Package boundaries respected: `site-kernel` defines `KernelNextStep` and `nextSteps` on `KernelCommandResult`/`KernelExecutionReport`; `site-kernel-handoff` consumes them; `forge` archive handlers return them.
- `nextSteps` is additive to `KernelCommandResult` and `KernelExecutionReport` — backward-compatible (optional field).
- Archive `nextSteps` follow the RFC-0542 `ForgeCommandResult.nextSteps` pattern (cross-cutting field, not inside `data`).
- `buildFailureDiagnostics` follows the RFC-0203 canonical `Diagnostic` model — `ruleId: "BUILD-01"`, `severity: "error"`, `fixHint`, `data`.

### Axis D — Forward-only compliance

No issues.

- No compatibility shims, no legacy paths, no fallback logic.
- `nextSteps` is additive — existing consumers that don't read it are unaffected.
- `diagnostics` field on `MissionValidateData` is additive — existing readers of `build.error` are unaffected.
- RFC-0575 pre-flight restoration is a pure re-addition of deleted content. No dual-path.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` + `CHANGE_SUMMARY` headers present on all new/modified source files:
  - `build-failure-diagnostics.test.ts` — has headers (added in fix commit `ef1d77e`)
  - `mission-materialization-commands.ts` — CHANGE_SUMMARY includes RFC-0578 and RFC-0579 entries
  - `execute-command.ts` — CHANGE_SUMMARY includes RFC-0579 entry
  - `types.ts` — CHANGE_SUMMARY includes RFC-0579 entry
- `fixHint` fields in `buildFailureDiagnostics` are actionable: "Guard loadSystemManifestSync with import.meta.env.DEV", "Check the import path... run pnpm install", "Check the frontmatter... against its content collection schema", "Fix the TypeScript type mismatch".
- `nextSteps` in `mission.validate` are actionable with copy-pasteable commands: `pnpm exec werkstatt run mission.reconcile --mission ${missionId}`.
- Archive `nextSteps` are actionable: `pnpm exec werkstatt run rfc.list --json to verify archive status`.
- RFC-0575 pre-flight steps in skill files are clear 6-point procedures.

### Axis F — Pragmatism

No issues.

- `KernelNextStep` is 2 fields — minimal.
- `BUILD_FAILURE_PATTERNS` has 4 patterns covering the most common Astro build failures. Not exhaustive, but the fallback ("unknown") handles unrecognized errors gracefully.
- Archive `nextSteps` are 1-entry arrays — not bloated.
- `buildFailureDiagnostics` is a single pure function, not an over-abstracted class hierarchy.

### Axis G — Blind spots

No issues.

- Empty `nextSteps` array is handled: `report.nextSteps && report.nextSteps.length > 0` check in renderer.
- `buildError` empty string: `buildFailureDiagnostics("")` would return a diagnostic with `patternId: "unknown"` and `message: "Astro build failed: "` — acceptable edge case (empty build error is unlikely in practice).
- `parseUrl` trailing slash normalization (RFC-0576, not in this diff) correctly preserves root path `/`.
- Pattern matching order: `BUILD_FAILURE_PATTERNS.find()` returns first match. If an error matches multiple patterns, the first one wins. This is deterministic and acceptable.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC-0578: `BUILD-01` diagnostic with pattern-matched `fixHint` | Done | `mission-materialization-commands.ts:124-140` |
| RFC-0578: 4 build failure patterns | Done | `mission-materialization-commands.ts:89-118` |
| RFC-0578: preserve raw `build.error` | Done | `mission-materialization-commands.ts:287` |
| RFC-0578: export `buildFailureDiagnostics` for testing | Done | `mission-materialization-commands.ts:124` |
| RFC-0578: test file with pattern coverage | Done | `build-failure-diagnostics.test.ts` (7 tests) |
| RFC-0579: `KernelNextStep` interface | Done | `types.ts:150-153` |
| RFC-0579: `nextSteps` on `KernelCommandResult` | Done | `types.ts:160` |
| RFC-0579: `nextSteps` on `KernelExecutionReport` | Done | `types.ts:316` |
| RFC-0579: pretty-mode "Next steps:" block gated from JSON | Done | `execute-command.ts:234` |
| RFC-0579: `mission.validate` populates for pass/fail/dirty | Done | `mission-materialization-commands.ts:303-361` |
| RFC-0579: all 6 archive handlers populate `nextSteps` | Done | `forge/os/*/handlers/archive.ts` |
| RFC-0579: `--json` includes `nextSteps` | Done | `cli/index.ts:220` serializes full `KernelExecutionReport` |
| RFC-0575: pre-flight step 3.0 in `fo-idea-implement` | Done | `.agents/skills/fo-idea-implement/SKILL.md:46-55` |
| RFC-0575: pre-flight step 0 in `fo-fix` | Done | `.agents/skills/fo-fix/SKILL.md:34-43` |

### Questions for the author

None.
