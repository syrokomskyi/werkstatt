# Code Review: forge.upgrade --update-npm + RTK onboarding integration

**Date:** 2026-08-03 **Diff scope:** `HEAD~2..HEAD` (commits `2b98600`, `b980280`) **Files reviewed:** 8 files, +408/-5

## Mechanical floor

- **tsc --noEmit:** PASS (0 errors)
- **vitest upgrade.test.ts:** PASS (13/13 tests)
- **No RFC files touched** — RFC validation not required

## Axis A — Structural correctness

| Item | Status | Notes |
| --- | --- | --- |
| Strict typing | PASS | No `any` introduced. `UpgradeResult` extended with typed fields. |
| Error handling | PASS | `execSync` wrapped in try/catch with structured `{ updated, skipped }` return. |
| Dead code | PASS | No unused exports. `resolvePmInstall` consumed by `upgrade.ts`. |
| Duplicated code | **FINDING A1** | `setupForgeSource`-style node_modules setup is duplicated between the `--dry-run` and `--update-npm attempts` tests (~15 lines repeated). Minor — test fixture duplication. |
| Fowler code smells | PASS | No Feature Envy, no Shotgun Surgery. `updateNpmPackage` is cohesive. |
| Magic numbers | PASS | `120_000` timeout is inline but conventional for npm install. |

**Finding A1 — Test fixture duplication (low severity)**

The npm consumer test setup (creating `node_modules/@warpgogol/forge/` with skills, package.json, os/rfc, profiles) is duplicated between the `--dry-run` test and the `--update-npm attempts` test. Could extract a `setupNpmConsumerForge` helper. Non-blocking — test-only code.

## Axis B — DNA alignment

| Invariant              | Status | Notes                                               |
| ---------------------- | ------ | --------------------------------------------------- |
| DNA-2 (pnpm workspace) | PASS   | `PM_INSTALL_MAP` correctly maps pnpm to `pnpm add`. |
| DNA-6 (kebab-case)     | PASS   | `--update-npm` flag uses kebab-case.                |

No other DNA invariants are directly touched by this diff.

## Axis C — Ecosystem fit

| Item | Status | Notes |
| --- | --- | --- |
| Package boundaries | PASS | `upgrade.ts` imports only from `../config/forge-config.ts` (same package). No cross-package imports added. |
| `src/` portability | PASS | `execSync` from `node:child_process` is a Node standard module, not a kernel import. `src/` remains portable. |
| CLI flag wired to behavior | PASS | `--update-npm` flag is read in `runUpgrade` and triggers `updateNpmPackage()`. Verified: `isUpdateNpm` controls execution path. |
| Skill sync | PASS | SKILL.md synced to `.agents/skills/forge-bootstrap/SKILL.md` in same commit. |
| AGENTS.md documentation | **FINDING C1** | `packages/forge/AGENTS.md` § "Silent upgrade trigger" still says `forge upgrade` without `--update-npm`. Should be updated to reflect the new flag. |

**Finding C1 — AGENTS.md § Silent upgrade trigger not updated (medium severity)**

`@/packages/forge/AGENTS.md:213` documents the silent upgrade trigger as running `forge upgrade` invisibly. The SKILL.md step 0 now uses `forge upgrade --update-npm`, but the AGENTS.md documentation was not updated. This creates a documentation drift — agents reading AGENTS.md will not know about the `--update-npm` flag.

**Recommended fix:** Update the sentence at line 213 to mention `--update-npm`:

> If they differ, it runs `forge upgrade --update-npm` invisibly — the operator is never informed about migration, version numbers, or upgrade mechanics. The npm update is skipped automatically in monorepo environments.

## Axis D — Forward-only compliance

| Item | Status | Notes |
| --- | --- | --- |
| No breaking changes | PASS | `--update-npm` is opt-in (default: false). `UpgradeResult` adds fields (additive). Existing callers unaffected. |
| No removed exports | PASS | Only additions: `PM_INSTALL_MAP`, `resolvePmInstall`, new fields on `UpgradeResult`. |
| No renamed symbols | PASS | — |

## Axis E — Agent clarity

| Item | Status | Notes |
| --- | --- | --- |
| SKILL.md clarity | PASS | Step 0.5 clearly documents monorepo skip, dry-run skip, and npm consumer behavior. Re-run guidance is explicit. |
| RTK step 6.10 | PASS | Substeps are sequential, failure modes documented, operator-facing language specified. |
| Test readability | PASS | Test names are descriptive. Mock setup is explicit. |

## Axis F — Test coverage

| Item | Status | Notes |
| --- | --- | --- |
| Monorepo skip | PASS | Test verifies `npmUpdateSkipped: "monorepo (local package, not npm-installed)"`. |
| Dry-run skip | PASS | Test verifies `npmUpdateSkipped: "dry-run"`. |
| npm consumer mock | PASS | Test mocks `execSync` and verifies `npmUpdated: true`. |
| No-flag default | PASS | Test verifies `npmUpdated: false, npmUpdateSkipped: null` without flag. |
| Install failure | **FINDING F1** | No test for `execSync` throwing (network error / registry unavailable). The catch block returns `{ updated: false, skipped: "install failed..." }` but this path is not tested. |
| RTK step 6.10 | N/A | RTK is a SKILL.md-only change (agent instructions, not executable code). No unit tests needed. |

**Finding F1 — Missing test for npm install failure path (low severity)**

The `catch` block in `updateNpmPackage` returns `{ updated: false, skipped: "install failed (network error or registry unavailable)" }` but no test exercises this path. Could add a test where `execSync` throws and verify the result reports the failure. Non-blocking — the path is simple and the error message is descriptive.

## Axis G — Security

| Item | Status | Notes |
| --- | --- | --- |
| Command injection | PASS | `installCmd` comes from `PM_INSTALL_MAP` (hardcoded map), not user input. `@warpgogol/forge@latest` is a literal string. No concatenation of user-controlled data. |
| No secrets | PASS | No API keys, tokens, or credentials in the diff. |
| Timeout | PASS | `execSync` has 120s timeout — prevents indefinite hang. |

## Summary

| Axis              | Findings                                           | Severity |
| ----------------- | -------------------------------------------------- | -------- |
| A — Structural    | A1: test fixture duplication                       | low      |
| B — DNA           | none                                               | —        |
| C — Ecosystem     | C1: AGENTS.md § Silent upgrade trigger not updated | medium   |
| D — Forward-only  | none                                               | —        |
| E — Agent clarity | none                                               | —        |
| F — Test coverage | F1: missing npm install failure test               | low      |
| G — Security      | none                                               | —        |

**Verdict: PASS with 1 medium finding (C1) and 2 low findings (A1, F1)**

The medium finding (C1) should be addressed — update `packages/forge/AGENTS.md` § "Silent upgrade trigger" to mention `--update-npm`. The low findings are non-blocking improvements.
