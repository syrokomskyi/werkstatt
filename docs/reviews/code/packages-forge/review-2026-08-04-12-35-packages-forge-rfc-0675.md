---
reviewId: REVIEW-RFC-0675
rfcId: RFC-0675
date: 2026-08-04
reviewer: agent
verdict: needs-revision
findings: 3
---

# Code Review: RFC-0675 — Profile invariant enforcement in forge.doctor

## Scope

Diff range: `a259142a` (plan commit) → `92ff774e` (stamp commit)

Files reviewed:

- `packages/forge/src/profiles/profile-schema.ts` — schema extension
- `packages/forge/src/onboarding/invariant-engine.ts` — invariant engine (new)
- `packages/forge/src/onboarding/doctor.ts` — doctor integration
- `packages/forge/profiles/editframe-html.yaml` — profile check declarations
- `packages/forge/os/core/handlers/invariant-engine.test.ts` — unit tests (new)
- `packages/forge/AGENTS.md` — documentation

## Findings

### A-1: `collectFiles` scans entire workspace tree for each invariant (performance)

**Severity**: medium **Location**: `packages/forge/src/onboarding/invariant-engine.ts:84-85,131-132,183-184`

Each of the three check functions (`checkFilenamePattern`, `checkFileContains`, `checkFileNotContains`) independently calls `collectFiles(workspaceRoot, workspaceRoot, allFiles)` which recursively walks the entire workspace. For a profile with N invariants, the workspace is scanned N times. On a large project, this is O(N × total_files).

**Fix**: Extract `collectFiles` to run once in `checkInvariants` and pass the file list to each check function.

### A-2: `collectFiles` does not skip `node_modules` or `.git`

**Severity**: medium **Location**: `packages/forge/src/onboarding/invariant-engine.ts:62-73`

`collectFiles` recursively walks all directories including `node_modules` and `.git`. This causes:

1. Performance degradation on large projects (thousands of files in `node_modules`)
2. False positive violations from files in `node_modules` matching composition globs

**Fix**: Add a skip set for `node_modules`, `.git`, `.turbo`, `dist`, `.cache` in `collectFiles`.

### A-3: Duplicated file collection and regex compilation across check functions

**Severity**: low **Location**: `packages/forge/src/onboarding/invariant-engine.ts:75-224`

The three check functions (`checkFilenamePattern`, `checkFileContains`, `checkFileNotContains`) share identical boilerplate: collect files, filter by glob, compile regex with try/catch, iterate files. The only difference is the check logic (filename test, content contains, content not-contains).

**Fix**: Extract shared logic into a helper that accepts a check callback. Reduces ~150 lines to ~80.

## Positive observations

- Glob-to-regex conversion handles `**/`, `*`, `?`, and `{a,b}` brace expansion correctly
- Malformed regex patterns are caught and reported as warnings (not crashes)
- Invariants without `check` field correctly remain advisory (`checked: false`)
- Test coverage is comprehensive: 7 tests covering all check kinds, advisory, empty glob, malformed regex
- `DoctorCheck.invariantViolations` field enables `--json` output for programmatic consumption
- `--strict` flag integration reuses existing strict-elevation logic in doctor.ts
- Profile schema extension is backward-compatible (optional `check` field)
- `forge.profile.validate` passes on the updated `editframe-html.yaml`

## Verification

- TypeScript: `pnpm --filter @warpgogol/forge run build:check` — pass
- Unit tests: `pnpm --filter @warpgogol/forge run test` — 579/579 pass
- RFC validation: `rfc.validate --id RFC-0675` — 0 violations
- Profile validation: `forge.profile.validate --id editframe-html` — valid
