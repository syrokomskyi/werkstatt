# Plan: RFC-0878 — Require explicit --bump major for platform major version bumps

**RFC:** RFC-0878
**Status:** accepted
**Created:** 2026-08-18

## Objectives

1. Change `ecosystem.commit` bump-type resolution so `versionBump: major` in RFC frontmatter is treated as advisory only — downgraded to `patch` when `--bump major` is not explicitly passed.
2. Add test coverage for the new behavior.
3. Update AGENTS.md with the new rule (already done in the previous commit, verify and refine).
4. Address audit findings: remove redundant Proposal section, fix DNA-51 reference, complete behavior table.

## Affected artifacts

- `packages/werkstatt-site/src/checks/ecosystem-commit.ts` — bump-type resolution logic (line 537-541)
- `packages/werkstatt-site/src/checks/tests/ecosystem-commit.test.ts` — new test cases
- `AGENTS.md` — Platform-scope commit discipline section (already updated, verify alignment)
- `docs/rfcs/rfc-0878-require-explicit-bump-major-for-platform-major-version-bumps.md` — fix audit findings

## Steps

### Step 1: Fix audit findings in RFC-0878

- Remove redundant `## Proposal` section — merge its content into `## Decision`
- Add `--bump minor` with `versionBump: major` row to the behavior table
- Clarify or remove `satisfies: DNA-51` — the RFC changes bump-type resolution, not consistency primitives. If no direct DNA link exists, remove the `satisfies` entry.
- **Completion criterion:** `rfc.validate --id RFC-0878` passes with 0 errors

### Step 2: Update bump-type resolution in ecosystem-commit.ts

- In `packages/werkstatt-site/src/checks/ecosystem-commit.ts` line 537-541, change the logic:
  - When `versionBump === "major"` and `!hasValidBumpOverride`: set `bumpType = "patch"` instead of `bumpType = "major"`
  - Keep `versionBump === "minor"` behavior unchanged
- Add a comment explaining the RFC-0878 rationale
- **Completion criterion:** `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

### Step 3: Add test cases

- Add test: `ecosystem.commit --rfc RFC-XXXX` where RFC has `versionBump: major` and no `--bump` → produces patch bump
- Add test: `ecosystem.commit --rfc RFC-XXXX --bump major` where RFC has `versionBump: major` → produces major bump
- Verify existing tests for `versionBump: minor` and `versionBump: patch` still pass
- **Completion criterion:** `pnpm --filter @warpgogol/werkstatt-site run test` passes with all new + existing tests

### Step 4: Verify AGENTS.md alignment

- Check that the AGENTS.md rule added in the previous commit aligns with the final implementation
- Refine wording if needed
- **Completion criterion:** AGENTS.md rule matches actual behavior

### Step 5: Validate and stamp

- Run `rfc.validate --id RFC-0878` — must pass with 0 errors
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — must pass
- Check off all acceptance criteria in RFC-0878
- Run `rfc.implement.stamp --id RFC-0878`
- **Completion criterion:** RFC-0878 status is `implemented`

### Step 6: Review and fix

- Run `fo-review` on all session code changes
- Run `fo-fix` if review has findings
- **Completion criterion:** Review report exists, any findings fixed

### Step 7: Doc audit

- Run `fo-doc-audit` to sync documentation surfaces
- **Completion criterion:** Doc audit complete

## Validation suite

- `pnpm exec forge rfc.validate --id RFC-0878`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

## Risks

- **Existing tests may assume major bump from RFC** — if any test relies on `versionBump: major` producing a major bump without `--bump major`, it will fail. Mitigation: search for existing tests using `versionBump: major` before changing the logic.
- **AGENTS.md already updated** — the rule was added in a previous commit. Verify it matches the final implementation.
