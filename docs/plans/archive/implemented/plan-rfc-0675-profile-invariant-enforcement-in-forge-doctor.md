---
planId: PLAN-RFC-0675
rfcId: RFC-0675
date: 2026-08-04
status: active
---

# Plan: RFC-0675 — Profile invariant enforcement in forge.doctor

## Objective

Upgrade `forge.doctor`'s `domain-invariants` check from advisory-only to active enforcement using a generic invariant engine that reads `check` declarations from the active stack profile and verifies files against them.

## Affected artifacts

| Artifact | Change |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Add `profileInvariantCheckSchema` and `check` field to `profileInvariantSchema` |
| `packages/forge/src/onboarding/invariant-engine.ts` | New — generic invariant enforcement engine |
| `packages/forge/src/onboarding/doctor.ts` | Upgrade `domain-invariants` check to use invariant engine |
| `packages/forge/profiles/editframe-html.yaml` | Add `check` declarations to VIDEO-01, VIDEO-02, VIDEO-03 |
| `packages/forge/os/core/handlers/invariant-engine.test.ts` | New — unit tests for invariant engine |
| `packages/forge/AGENTS.md` | Update with invariant enforcement documentation |
| `docs/command-manifest.generated.yaml` | Regenerate (no new commands, but `forge.doctor` metadata changes) |

## Step sequence

### Step 1: Profile schema extension

- Add `profileInvariantCheckSchema` to `profile-schema.ts` with `kind` (enum: `filename-pattern`, `file-contains`, `file-not-contains`), `glob`, `pattern`, `negatedPattern` fields.
- Add `check: profileInvariantCheckSchema.optional()` to `profileInvariantSchema`.
- Add `ProfileInvariantCheck` TypeScript interface.
- Update `CHANGE_SUMMARY` with RFC-0675 entry.
- **Verify**: `pnpm --filter @warpgogol/forge run build:check`
- **Verify**: `forge.profile.validate` passes on all profiles

### Step 2: Invariant engine

- Create `packages/forge/src/onboarding/invariant-engine.ts`.
- Export `checkInvariants(profile: StackProfile, workspaceRoot: string): InvariantCheckResult[]`.
- Implement three check kinds:
  - `filename-pattern`: glob files, check filename against regex pattern.
  - `file-contains`: glob files, check content contains pattern.
  - `file-not-contains`: glob files, check content does not contain negatedPattern.
- Invariants without `check` field return `{ checked: false, violations: [] }`.
- Handle malformed patterns gracefully (return violation with `warn` severity).
- Use `fast-glob` or Node.js `fs.readdirSync` with manual glob matching.
- **Verify**: `pnpm --filter @warpgogol/forge run build:check`

### Step 3: Doctor integration

- Modify `doctor.ts` `domain-invariants` check to call `checkInvariants`.
- Replace advisory listing with enforcement results.
- `domain-invariants` check status: `fail` if error-severity violations, `warn` if warning-severity only, `pass` if no violations.
- `--strict` flag elevates warning-severity violations to `fail` (already handled by existing strict logic).
- Add `invariantViolations` array to the check data for `--json` output.
- **Verify**: `pnpm --filter @warpgogol/forge run build:check`

### Step 4: Editframe profile update

- Add `check` declarations to VIDEO-01, VIDEO-02, VIDEO-03 in `editframe-html.yaml`.
- VIDEO-01: `kind: filename-pattern`, `glob: "compositions/**/*.{html,tsx}"`, `pattern: "^[a-z0-9-]+\\.(html|tsx)$"`.
- VIDEO-02: `kind: file-contains`, `glob: "compositions/**/*.html"`, `pattern: "contain"`.
- VIDEO-03: `kind: file-contains`, `glob: "compositions/**/*.html"`, `pattern: "ef-captions"`.
- **Verify**: `forge.profile.validate --id editframe-html`

### Step 5: Unit tests

- Create `packages/forge/os/core/handlers/invariant-engine.test.ts`.
- Test `filename-pattern` detects non-kebab-case filenames.
- Test `file-contains` detects missing required elements.
- Test `file-not-contains` detects forbidden content.
- Test invariants without `check` field remain advisory.
- Test malformed pattern handling.
- Test empty glob results (no files = pass).
- **Verify**: `pnpm --filter @warpgogol/forge run test`

### Step 6: Documentation

- Update `packages/forge/AGENTS.md` with invariant enforcement documentation.
- Regenerate `docs/command-manifest.generated.yaml`.
- Regenerate `docs/COMMANDS.md`.
- **Verify**: `command.manifest.generate` and `docs.commands.generate`

### Step 7: Heavy checks and stamp

- Run `pnpm --filter @warpgogol/forge run build:check`.
- Run `pnpm --filter @warpgogol/forge run test`.
- Run `rfc.validate --id RFC-0675`.
- Mark acceptance criteria with evidence.
- Run `rfc.implement.stamp --id RFC-0675`.
- Commit.

## Validation suite

| Check              | Command                                          | Expected     |
| ------------------ | ------------------------------------------------ | ------------ |
| TypeScript         | `pnpm --filter @warpgogol/forge run build:check` | Pass         |
| Unit tests         | `pnpm --filter @warpgogol/forge run test`        | All pass     |
| RFC validation     | `rfc.validate --id RFC-0675`                     | 0 violations |
| Profile validation | `forge.profile.validate --id editframe-html`     | Valid        |

## Risks

- **Glob pattern matching**: Node.js doesn't have built-in glob. Use `fs.readdirSync` with manual recursive matching or a minimal glob implementation. Avoid adding a new dependency.
- **File reading performance**: `file-contains` checks read file content. For large projects, this may be slow. Mitigation: glob patterns are scoped to `compositions/**`, not `**/*`.
- **Regex safety**: User-provided patterns from profile YAML could be malformed. Wrap in try/catch and report as `warn`.

## Escalation triggers

- If `fast-glob` or any new dependency is needed, stop and ask the operator.
- If the invariant engine needs to be in `os/` instead of `src/` (due to import constraints), adjust the plan.
- If doctor.ts changes are more extensive than expected (e.g. the `domain-invariants` check is deeply intertwined with other checks), break the change into smaller edits.
