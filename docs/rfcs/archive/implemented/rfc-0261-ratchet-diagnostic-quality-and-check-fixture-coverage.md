---
id: RFC-0261
title: "Ratchet diagnostic quality and check fixture coverage"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0251
  - RFC-0256
commands:
  proposed:
    - check.fixture.lint
  added:
    - check.fixture.lint
  changed:
    - diagnostic.shape.lint
    - root.canonical.validate
    - cloudflare.residency.validate
    - hdri.firewall.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "No new check module can ship with coarse resultFromViolations diagnostics; the 38-file legacy set only shrinks."
  - "Every new *.validate / *.lint command ships with a red fixture and a green fixture test before it lands."
  - "The diagnostic-shim burn-down is a registered RFC-0256 maintenance-debt queue, not tribal knowledge."
nonGoals:
  - "Do not migrate all 38 legacy shim files in this RFC — that is the burn-down queue's job, batch by batch."
  - "Do not require fixture tests retroactively for all existing checks in one change; the baseline ratchets down."
  - "Do not change the Diagnostic type or the RFC-0203 renderer."
---

# RFC-0261: Ratchet diagnostic quality and check fixture coverage

## Context

Part C of the 2026-07-02 AEO audit series (check quality; see rfc-0258 for series order).

RFC-0203 gave the platform a canonical `Diagnostic` model (registered ruleId, severity, `file:line:col` locator, `fix:` hint). But 38 check modules in `packages/os/site-kernel-checks/src/` still build their results through `resultFromViolations` (see `result-helpers.ts`), which emits diagnostics with `ruleId = command name`, no locator, and no fixHint. Phase 3 of RFC-0203 ("enforcement") was never scheduled. Separately, `site-kernel-checks` carries roughly 150 registered check commands but only 13 test files: most checks have no red/green fixture proving what they accept and reject.

## Problem

Two unprotected invariants:

1. **Diagnostic precision.** For an autonomous agent, a diagnostic without a locator and fixHint is the difference between "open file X line Y, apply fix Z" and "re-derive the entire check's logic from source". Nothing today prevents a new check from shipping coarse diagnostics, so the debt grows.
2. **Check behavior is unspecified.** A check without fixtures has its specification only in its author's head. The next agent editing a detection regex (for example `ZOD_DEFINITION_PATTERN` in `schema-drift.ts`) has no safety net and no examples of intended positives/negatives.

## Decision

1. `diagnostic.shape.lint` gains rule `DSL-04`: importing or calling `resultFromViolations` / `failResult` with bare strings is an error in any file NOT listed in a committed baseline. The baseline is generated once from the current 38 files and may only shrink.
2. The shim migration is registered as an RFC-0256 maintenance-debt queue (`id: diagnostic-shim-migration`, sourceCommand `diagnostic.shape.lint`, ruleId `DSL-04`), so burn-down is planned and observable via `maintenance.debt.queue` machinery.
3. A new `check.fixture.lint` command enforces: every command whose name matches `\.(validate|lint)$` registered by `@gogol/site-kernel-checks` must have a matching test file under `packages/os/site-kernel-checks/src/tests/` that exercises at least one failing fixture and one passing fixture. Existing gaps live in a shrink-only baseline; new checks must comply immediately.

## Architectural fit

- Completes RFC-0203 Phase 3 with the ratchet pattern already proven by RFC-0251 (test-signal and maintenance-debt baselines).
- Uses RFC-0256 queue machinery for the burn-down instead of inventing a new tracker.
- Both lints run in `PACKAGES_CHECK_PIPELINE`, workspace scope.

## Design

### CLI surface

```sh
pnpm exec site-kernel run diagnostic.shape.lint --json   # now includes DSL-04
pnpm exec site-kernel run check.fixture.lint --json
pnpm exec site-kernel run check.fixture.lint --write-baseline   # regenerate shrink-only baseline
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.json (shape)
export interface Dsl04Baseline {
  generatedMarker: string;
  rule: "DSL-04";
  files: string[]; // repo-relative module paths still using resultFromViolations
}

// packages/os/site-kernel-checks/src/check-fixture-lint.ts (new)
export interface FixtureCoverageEntry {
  command: string;      // e.g. "schema.drift.validate"
  module: string;       // implementing module path
  testFile: string | null; // resolved test file or null
  hasFailFixture: boolean; // test contains a case asserting exitCode 1 / status "fail"
  hasPassFixture: boolean;
}
```

Detection heuristics (documented in the module contract): a test file "covers" a command when it imports the implementing module or invokes the command name via `executeKernelCommand`, and contains assertions on both a failing and a passing result. When heuristics cannot decide, the lint reports `CHECK-FIX-03` (warning) rather than guessing.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/diagnostic-shape-lint.ts` | Add DSL-04 + baseline loading |
| `packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.json` | Shrink-only baseline (38 entries at creation) |
| `packages/os/site-kernel-checks/src/check-fixture-lint.ts` | New lint |
| `packages/os/site-kernel-checks/src/check-fixture-lint.baseline.generated.json` | Shrink-only coverage baseline |
| `docs/maintenance-debt/queues/` | New queue spec `diagnostic-shim-migration` (RFC-0256 shape) |

### Output format

Standard RFC-0203 `CheckResult`. Rule ids:

- `DSL-04` (error): `resultFromViolations`/string-based `failResult` usage outside the baseline.
- `CHECK-FIX-01` (error): a `*.validate`/`*.lint` command outside the baseline has no covering test file.
- `CHECK-FIX-02` (error): covering test exists but lacks a fail fixture or a pass fixture.
- `CHECK-FIX-03` (warning): coverage undecidable by heuristics; fixHint explains how to make the test detectable.

### Failure modes

Both lints exit 1 on errors. Baseline growth is always an error with a fixHint explaining the two legal moves: migrate the module, or (for genuinely new single-rule checks) use `diagnosticsResult` with a registered ruleId from the start.

## Rollout

1. Generate both baselines from the current tree; land lints fail-hard the same day (tree stays green by construction).
2. Register the `diagnostic-shim-migration` queue with batch policy (suggested: 5 modules per batch, priority to checks whose diagnostics agents see most: growth-\*, integration, consent, funnel).
3. Each migration batch: convert module to `diagnosticsResult` with registered fine-grained ruleIds + locators + fixHints, add red/green fixtures (satisfying `check.fixture.lint` simultaneously), shrink both baselines.
4. New check modules comply from day one — `section.scaffold`-style guidance goes into `packages/os/site-kernel-checks/docs/check-module-guide.md`.

**As-built, 2026-07-02:** the actual shim set at DSL-04 introduction was 63 files (top-level `packages/os/site-kernel-checks/src/*.ts` modules with a real `resultFromViolations(`/`failResult(` call — a stricter count than the RFC's "38" estimate, which likely undercounted or predated later shim additions). The first migration batch converted `root-canonical.ts`, `cloudflare-residency.ts`, and `hdri-firewall.ts` to `diagnosticsResult` with fine-grained ruleIds (`RC-00..03`, `CF-RESIDENCY-01/02`, `HDRI-01/02`), shrinking the DSL-04 baseline to 60 and the `check.fixture.lint` baseline correspondingly. The `diagnostic-shim-migration` queue is registered with `status: paused` rather than `active`: DSL-04 is workspace-scoped, error-severity debt gated directly by `diagnostic.shape.lint`, not app-scoped warning/info debt from `ADVISORY_APP_COMMANDS` — so it has no matching entries in the `collectMaintenanceDebtItems` pool that `maintenance.debt.queue.validate`'s MDQ-04 rule checks for _active_ queues. The queue is still registered, discoverable via `maintenance.debt.queue.report --queue diagnostic-shim-migration`, and documents the burn-down plan; its rationale explains the pause and how to track batch completion (the DSL-04 baseline file count) until/unless it is folded into the advisory item pool.

## Alternatives considered

- **Big-bang migration of all 38 modules**: rejected — high-risk diff, blocks other work, and RFC-0256 queues exist precisely for this shape of debt.
- **Deleting `resultFromViolations` immediately**: rejected — breaks 38 modules at once; the ratchet gets the same end state safely.
- **Coverage via c8/istanbul thresholds instead of fixture lint**: rejected — line coverage does not prove red/green behavior; a check can be 100% covered by tests that never assert a failure.

## Risks

- Heuristic fixture detection can mis-attribute coverage; `CHECK-FIX-03` (warn, not fail) is the escape valve, and the guide documents the detectable test pattern.
- Migrating a module changes its ruleIds; downstream consumers filtering on the old coarse ruleId (= command name) could silently match nothing. Mitigation: the migration checklist requires grepping for the old ruleId across the repo (baselines, queues, docs).

## Acceptance criteria

- [x] `DSL-04` implemented in `diagnostic.shape.lint` with fixture tests: baseline file untouched + new offending module → error; baseline-listed module → pass; baseline growth → error. (evidence: implemented historically)
- [x] `dsl04-baseline.generated.json` committed with exactly the current offender set (regenerate via `--write-baseline`, never hand-edit). (evidence: implemented historically)
- [x] `check.fixture.lint` registered in `PACKAGES_CHECK_PIPELINE` with its own red/green fixture tests (the lint must satisfy itself). (evidence: implemented historically)
- [x] `diagnostic-shim-migration` queue registered and visible in `maintenance.debt.queue` output. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] First migration batch (≥ 3 modules) completed as proof of the workflow, shrinking both baselines. (evidence: implemented historically)
- [x] All new rule ids registered in the RFC-0203 registry with fixHints. (evidence: implemented historically)
- [x] `packages/os/site-kernel-checks/docs/check-module-guide.md` documents the required fixture pattern for new checks. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Baselines are shrink-only. Never add entries to either baseline; if a lint blocks you, migrate the module instead.
- When migrating a shim module: choose fine-grained ruleIds (`<domain>.<what>-<detail>` style consistent with the existing registry), attach `file:line` locators wherever the source data allows, and write the red fixture FIRST.
- Do not rename existing registered ruleIds while migrating unrelated modules.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0261` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
