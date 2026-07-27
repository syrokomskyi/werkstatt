---
rfcId: RFC-0520
auditId: AUDIT-RFC-0520-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
rfcPath: docs/rfcs/rfc-0520-extract-inline-guards-into-named-testable-functions.md
---

# Audit: RFC-0520

## Verdict: Approved

The RFC is a well-scoped structural extraction that makes two critical inline guards testable without changing behavior. It correctly references the existing `GateResult` pattern in `@gogol/surface/decision-composer.ts`, preserves exact error messages and violation shapes, and declares `versionBump: patch` (no data contract change). Minor findings on Compass scaffolding and the `guards.ts` export path are non-blocking.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0520 --json` returned 0 violations.

## Axis A — Structural completeness

- **Decision** is present-tense and singular: "Extract both inline guards into named, testable functions." ✓
- **CLI surface**: The RFC does not introduce new commands. `commands.changed` lists `release.prepare` and `sternsystem.validate` — both are existing commands whose handlers are modified. This is correct.
- **TypeScript contracts**: `GuardResult`, `GuardVerdict`, `GuardViolation`, `CSurfaceGuardInput/Result`, `ExternalEditGuardInput/Result` are minimal type signatures. ✓
- **File system responsibilities** table names 7 concrete paths. ✓
- **Output format**: Not applicable — no new commands, no new `--json` output shape. The RFC correctly does not claim a new output format.
- **Failure modes**: Not explicitly documented as a separate section, but the Risks section covers behavioral drift, error message string matching, and I/O-bound helper. Acceptable for a structural extraction RFC.
- **Rollout**: Describes behavior preservation, no migration, testing, forward-only. ✓
- **Alternatives considered**: 4 real alternatives with rejection reasons. ✓
- **Risks**: 3 risks with mitigations. ✓
- **Acceptance criteria**: 10 items, all checkable. ✓
- **Implementation notes**: Explicit behavioral rules (preserve exact messages, don't change string-matching heuristic, write unit tests before stamping). ✓

**Finding A-1 (minor):** The RFC references `@/packages/os/site-kernel-handoff/src/release/release-commands.ts:227-268` and `sternsystem-validate.ts:235-303` with `@/` prefix. The repo uses relative paths in AGENTS.md and package guides, not `@/` aliases. This is cosmetic but could confuse agents looking for the files.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle):** The C-surface regression guard is part of the release flow (terminal phase of mission lifecycle). The RFC explains this relationship in "Architectural fit". The extraction makes the guard testable without changing the lifecycle. ✓
- **DNA-48 (Release discipline):** The C-surface regression guard enforces release discipline by blocking regression without declaration. The RFC explicitly states "The extraction preserves this enforcement while making it auditable." ✓
- The RFC does not establish new DNA invariants. `satisfies: [DNA-46, DNA-48]` is correct — both are real invariants in `docs/architecture-dna.md`.
- `related: [DNA-46, DNA-48, RFC-0478, RFC-0480, RFC-0518]` — all relevant. RFC-0480 established the C-surface guard; RFC-0518 declares gate metadata that can reference the extracted functions.

No issues.

## Axis C — Ecosystem fit

- **Package boundaries**: Both new files are in `packages/os/site-kernel-handoff/` — the correct package since both guards are handoff-package concerns. No cross-package imports introduced. ✓
- **Pipeline placement**: No new pipeline entries. The extracted functions are internal; the call sites remain in `release.prepare` and `sternsystem.validate`. ✓
- **Compass sync**: The RFC does not change repository-wide requirements, shared package contracts, or app-package relationships. No `docs/*.xml` synchronization needed. ✓
- **AGENTS.md updates**: The RFC does not mention updating `packages/os/site-kernel-handoff/AGENTS.md`. The handoff AGENTS.md already documents the C-surface guard (RFC-0480 section) and the Bordbuch-vs-git-log check. After extraction, the AGENTS.md should reference the new guard files. **Finding C-1 (minor):** The RFC should mention updating `packages/os/site-kernel-handoff/AGENTS.md` to reference the extracted guard files.
- **Cosmic naming**: Not applicable — no manifests or component/section/page contracts touched.
- **Command lifecycle**: `commands.changed: [release.prepare, sternsystem.validate]` is correct. No proposed/added/removed commands. ✓

## Axis D — Forward-only compliance

- No compatibility shims, bridges, or dual-paths. The extraction replaces inline code in-place. ✓
- No deprecation grace period. ✓
- No legacy code paths maintained behind a flag. ✓
- The `GuardResult` type is new but does not coexist with an older type — it is the only type. ✓

No issues.

## Axis E — Agent-facing policy

- **Status gate**: The RFC is `status: draft` and does not contain self-authorizing language. Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes** reference RFC-0224 (accepted→implemented transition). ✓
- **Anti-fabrication**: No content authoring in acceptance criteria — all criteria are code changes and test passes. ✓
- **Storage policy**: No persistence changes, no cookies, no client-side storage. ✓

No issues.

## Axis F — Pragmatism

- **Minimal command surface**: No new commands. ✓
- **Lean contracts**: `GuardResult` has 4 fields (`verdict`, `violations`, `summary`, `metadata?`). `GuardViolation` has 3 fields. No speculative generality. ✓
- **Existing patterns**: The RFC explicitly models the extraction on `evaluateDemandGate` / `evaluateEvidenceGate` in `@gogol/surface/decision-composer.ts`. The `GateResult` interface there has `gate`, `pass`, `reason`, `noindex`, `suppress`, `score`, `metadata`. The RFC's `GuardResult` is analogous but simpler (no `noindex`/`suppress`/`score` — different semantics). The RFC explains why unification with `GateResult` was rejected. ✓
- **Scope discipline**: `packagesImpacted: ["@gogol/site-kernel-handoff"]` — correct, only this package is touched. `appsImpacted: []` — correct. `nonGoals` are explicit (5 items). ✓

**Finding F-1 (minor):** The RFC proposes 7 new files (2 guard files, 1 shared types file, 2 helper files, 2 modified call sites). The `guards.ts` shared types file and the two helper files (`breaks-c-helper.ts`, `external-edit-collector.ts`) could be colocated with their guard files to reduce file count. However, the separation is clean and follows the existing pattern. Non-blocking.

## Axis G — Blind spots

- **Performance**: The extraction does not add new I/O. The `collectExternalEditInputs` helper consolidates existing I/O (file read + `git rev-list` calls) that already runs in `sternsystem.validate`. No performance regression. ✓
- **False positives**: Not applicable — no new validation rules. The extracted functions preserve existing violation logic. ✓
- **Edge cases**: The RFC considers empty states (empty Bordbuch, empty git log → pass) in the test plan. Concurrent execution is not relevant — both guards run within single-command handlers. ✓
- **Migration path**: No migration needed — purely structural. ✓
- **Security/privacy**: No user data, PII, or external service changes. ✓

**Finding G-1 (minor):** The `evaluateExternalEditGate` function signature takes `bordbuchEntries` as `Array<{ type?: string; metadata?: { commitSha?: string; preReconcileSha?: string } }>`. This is a structural type, not a named type from `@gogol/site-kernel-handoff/src/bordbuch/`. If the Bordbuch entry shape changes, this inline type drifts silently. The RFC should import the existing Bordbuch entry type if one exists, or acknowledge this as a deliberate simplification.

## Questions for the author

1. Should `guards.ts` (shared `GuardResult` types) be exported from the package's public entrypoint (`src/index.ts`) or only from a subpath? The RFC says "exported from `@gogol/site-kernel-handoff`" but the package has multiple export paths — which one?
2. The `evaluateExternalEditGate` input type uses an inline structural type for Bordbuch entries instead of importing the existing Bordbuch entry type. Is there a named type in `src/bordbuch/` that should be used, or is the structural type intentional?
3. The call site change for `release.prepare` still uses `err.message.includes("C-surface regression")` string matching to distinguish guard failures from import/execution errors. The RFC preserves this but acknowledges it as fragile. Should the extracted `evaluateCSurfaceGate` result include a typed error class to replace the string match, or is that explicitly deferred?
