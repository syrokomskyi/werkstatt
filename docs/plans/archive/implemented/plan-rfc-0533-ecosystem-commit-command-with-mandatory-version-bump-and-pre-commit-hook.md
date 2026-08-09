---
rfcId: RFC-0533
planId: PLAN-RFC-0533-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - docs/verification-plan.xml
    - AGENTS.md
---

# Implementation Plan: RFC-0533

## 1. Objectives

- [ ] O1 — `ecosystem.commit` command registered and callable — maps to acceptance criterion "ecosystem.commit command registered in ECOSYSTEM_COMMANDS table"
- [ ] O2 — `ecosystem.commit` atomically bumps version, writes log, commits with trailers — maps to acceptance criterion "ecosystem.commit --message <msg> bumps package.json version..."
- [ ] O3 — `--rfc` flag reads `versionBump` from RFC frontmatter; EC-05 error for missing field — maps to acceptance criterion "ecosystem.commit --rfc RFC-XXXX reads versionBump..."
- [ ] O4 — Error guards EC-01 through EC-07 — maps to acceptance criteria "refuses with EC-01...", "refuses with EC-02/EC-03...", "refuses with EC-06...", "refuses with EC-07..."
- [ ] O5 — `--dry-run` outputs planned bump without committing — maps to acceptance criterion "ecosystem.commit --dry-run outputs planned bump..."
- [ ] O6 — `--amend` recalculates and refuses pushed commits — maps to acceptance criterion "ecosystem.commit --amend recalculates version..."
- [ ] O7 — Pre-commit hook blocks direct `git commit` for platform scope — maps to acceptance criteria "hooks/pre-commit script exists..." and "Hook error message includes..."
- [ ] O8 — PC-04 rule added to `platform.consistency.validate` — maps to acceptance criterion "PC-04 rule added to platform.consistency.validate"
- [ ] O9 — `--json` output matches `EcosystemCommitResult` interface — maps to acceptance criterion "--json output format matches..."
- [ ] O10 — AGENTS.md updated with `ecosystem.commit` instructions — maps to acceptance criterion "AGENTS.md updated..."

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ecosystem-commit.ts` — **new file**: `runEcosystemCommit` handler
- `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` — register `ecosystem.commit` in `ECOSYSTEM_COMMANDS`
- `packages/os/site-kernel-checks/src/ecosystem.ts` — re-export `runEcosystemCommit` (thin shim)
- `packages/os/site-kernel-handoff/src/platform-consistency.ts` — add PC-04 rule to `runPlatformConsistencyValidate`; extend `PlatformConsistencyViolation` type with `"PC-04"`
- `packages/os/site-kernel-handoff/src/bundle-io.ts` — extend `resolvePlatformSemanticHash` to cover `integrations/` and `services/` (per RFC design)
- `hooks/pre-commit` — **new file**: bash pre-commit hook script

### 2.2 Configuration and data

- `package.json` (root) — read for current version; `version` field bumped by `ecosystem.commit`
- `docs/platform-version-log.generated.yaml` — written by `ecosystem.commit` with new hash, version, timestamp

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add instructions to use `ecosystem.commit` for platform-scope changes
- `docs/verification-plan.xml` — add PC-04 to platform consistency verification flow
- `packages/os/site-kernel-checks/AGENTS.md` — add `ecosystem-commit.ts` module entry
- `packages/os/site-kernel-handoff/AGENTS.md` — add PC-04 rule description

### 2.4 Validation and pipelines

- `build.check` pipeline — PC-04 runs as part of `platform.consistency.validate` (already in pipeline)
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.validate RFC-0533`
- `pnpm exec site-kernel run ecosystem.manifest.generate` (command surface changed)

## 3. Step sequence

### Step 1. Extend `resolvePlatformSemanticHash` to cover full platform scope

**Goal:** Make the hash function cover `packages/`, `integrations/`, and `services/` as specified in the RFC.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/src/bundle-io.ts` `resolvePlatformSemanticHash` function
- Add `integrations/` and `services/` directories to the fingerprint tree scan (in addition to `packages/`)
- Ensure directories that don't exist are skipped gracefully (no throw)
- Add unit test for the extended scope

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

**Completion criterion:** `resolvePlatformSemanticHash` fingerprints `packages/`, `integrations/`, and `services/`; tests pass; typecheck passes.

**Human review:** no

---

### Step 2. Implement `runEcosystemCommit` handler

**Goal:** Create the core command handler that atomically bumps version, computes hash, writes log, and commits with trailers.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/ecosystem-commit.ts`
- Implement `runEcosystemCommit(input, context)` with the following logic:
  1. Check staged files for platform scope (`packages/`, `integrations/`, `services/`); EC-01 if none
  2. Check `package.json` not already staged (EC-02); check `docs/platform-version-log.generated.yaml` not already staged (EC-03)
  3. If `--rfc` provided: read RFC frontmatter `versionBump`; EC-04 if RFC not found; EC-05 if `versionBump` absent; EC-06 if `versionBump: none`
  4. Determine bump type: from RFC `versionBump` or default `patch`
  5. Read current `package.json` version; compute new version via `parseSemver`/`compareSemver` from `@gogol/site-kernel-handoff`
  6. If `--amend`: read previous commit's `X-Platform-Version` trailer; restore version; EC-07 if pushed
  7. Compute `platformSemanticHash` via `resolvePlatformSemanticHash` (extended in Step 1)
  8. If `--dry-run`: return forecast result without writing or committing
  9. Bump `package.json` version; write `docs/platform-version-log.generated.yaml`
  10. `git add package.json docs/platform-version-log.generated.yaml`
  11. `git commit` with `ECOSYSTEM_COMMIT=1` env var and trailers (`X-Platform-Bump`, `X-Platform-Version`, `X-RFC` if provided)
- Export `EcosystemCommitInput`, `EcosystemCommitResult`, `EcosystemCommitViolation` types
- Add re-export from `packages/os/site-kernel-checks/src/ecosystem.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `runEcosystemCommit` compiles; all error codes EC-01 through EC-07 are implemented; `--dry-run` and `--amend` paths are handled.

**Human review:** no

---

### Step 3. Register `ecosystem.commit` in command table

**Goal:** Wire the command into the Site OS command registry.

**Agent actions:**

- Add import of `runEcosystemCommit` to `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts`
- Add `CheckCommandEntry` for `ecosystem.commit` with:
  - `name: "ecosystem.commit"`
  - `scope: "workspace"`
  - `mutatesState: true`
  - `writes: ["package.json", "docs/platform-version-log.generated.yaml"]`
  - `reads: ["package.json", "docs/rfcs/**/*.md", "packages/**", "integrations/**", "services/**"]`
  - `execute: runEcosystemCommit`
- Add RFC-0533 to `CHANGE_SUMMARY` in the file header

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run ecosystem.manifest.generate` (regenerate manifest with new command)

**Completion criterion:** `ecosystem.commit` appears in `ECOSYSTEM_COMMANDS`; `ecosystem.manifest.generate` includes it; typecheck passes.

**Human review:** no

---

### Step 4. Add PC-04 rule to `platform.consistency.validate`

**Goal:** Implement the CI-side safety net that checks git history for `X-Platform-Bump` trailers on platform-scope commits.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/platform-consistency.ts`:
  - Extend `PlatformConsistencyViolation.rule` type to include `"PC-04"`
  - Add PC-04 check logic after PC-03:
    1. Determine cutoff commit SHA (hardcoded constant — the implementation commit of this RFC)
    2. Run `git log --oneline <cutoffSha>..HEAD --name-only` to get commits after cutoff
    3. Skip merge commits (commits with 2+ parents)
    4. For each non-merge commit touching `packages/`, `integrations/`, or `services/`:
       - Check commit message for `X-Platform-Bump:` trailer
       - If missing, add PC-04 violation (severity: error)
  - Trust cherry-picked trailers (trailers are part of commit message, preserved by `git cherry-pick`)
- Add unit tests for PC-04 (mock git log output)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

**Completion criterion:** PC-04 rule produces error violations for platform-scope commits without `X-Platform-Bump` trailer; merge commits are skipped; tests pass.

**Human review:** no

---

### Step 5. Create pre-commit hook script

**Goal:** Create the versioned `hooks/pre-commit` bash script that blocks direct `git commit` for platform scope.

**Agent actions:**

- Create `hooks/pre-commit` with the exact bash script from RFC-0533 (lines 133-163)
- Make it executable (`chmod +x hooks/pre-commit`)
- The script:
  1. Checks `ECOSYSTEM_COMMIT` env var; exits 0 if set
  2. Checks staged files for `packages/`, `integrations/`, `services/` prefixes
  3. If platform files staged: prints error with exact `ecosystem.commit` command and agent tip; exits 1
  4. Otherwise exits 0

**Validation:**

- `bash -n hooks/pre-commit` (syntax check)
- Manual test: `git config core.hooksPath hooks/` then stage a `packages/` file and attempt `git commit` — should block

**Completion criterion:** `hooks/pre-commit` exists, is executable, passes syntax check, and blocks platform-scope commits when `ECOSYSTEM_COMMIT` is not set.

**Human review:** no

---

### Step 6. Write tests

**Goal:** Add unit and integration tests for `ecosystem.commit` and PC-04.

**Agent actions:**

- Add `packages/os/site-kernel-checks/src/tests/ecosystem-commit.test.ts`:
  - Test EC-01: no staged platform files → blocked
  - Test EC-02: `package.json` already staged → blocked
  - Test EC-03: log file already staged → blocked
  - Test EC-04: RFC not found → blocked
  - Test EC-05: `versionBump` absent in post-cutoff RFC → blocked
  - Test EC-06: `versionBump: none` → blocked
  - Test default patch bump without `--rfc`
  - Test `--rfc` reads `versionBump` from frontmatter
  - Test `--dry-run` returns forecast without committing
  - Test `--amend` reads previous version from trailer
  - Test `--json` output matches `EcosystemCommitResult`
- Add PC-04 tests to `packages/os/site-kernel-handoff/src/tests/platform-consistency.test.ts`:
  - Test PC-04: platform commit without trailer → error
  - Test PC-04: platform commit with trailer → pass
  - Test PC-04: merge commit skipped
  - Test PC-04: commits before cutoff SHA skipped

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-handoff run test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Synchronize AGENTS.md files and Compass XML with the new command and rule.

**Agent actions:**

- Update `AGENTS.md` (root): add a rule under "Active instruction model" or a new section instructing agents to use `ecosystem.commit` for platform-scope changes (`packages/**`, `integrations/**`, `services/**`)
- Update `packages/os/site-kernel-checks/AGENTS.md`: add `src/ecosystem-commit.ts` module entry to the table
- Update `packages/os/site-kernel-handoff/AGENTS.md`: add PC-04 rule description
- Update `docs/verification-plan.xml`: add PC-04 to the platform consistency verification flow
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml` with the new command

**Validation:**

- `git diff` shows only documentation files changed
- `pnpm exec site-kernel run ecosystem.manifest.validate` passes

**Completion criterion:** All documentation artifacts in scope are updated; `ecosystem.manifest.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in RFC-0533 against the implemented code; mark `[x]` with inline `(evidence: ...)` annotations
- Run `pnpm exec site-kernel run rfc.validate RFC-0533`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/site-kernel-checks run test`
- Run `pnpm --filter @gogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run ecosystem.manifest.validate`
- Stamp the RFC: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0533 --implementation-commit <sha>`
- Commit the stamped RFC separately from the implementation commit

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0533` — passes
- All acceptance criteria checked off

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0533`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run ecosystem.manifest.validate`
- `bash -n hooks/pre-commit` (syntax check)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0533` in the subject line (RFC-0265 commit hygiene)
- Implementation commit (code changes) separate from RFC stamp commit

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Semantic hash computation latency | Step 1: hash computed in single pass after `git add`; acceptable for low-frequency platform commits |
| Env var bypass | Step 4: PC-04 in CI catches bypasses via trailer check in git history |
| Hook not activated | Step 7: AGENTS.md documents `git config core.hooksPath hooks/`; RFC-0534 handles onboarding automation |
| Amend complexity | Step 2: `--amend` reads previous `X-Platform-Version` trailer to undo bump before applying new one |
| Agent confusion | Step 7: AGENTS.md updated with explicit `ecosystem.commit` instructions for platform-scope changes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 (semantic fingerprint), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0533 --reason "..." --invariant "DNA-53"` instead of working around it.
- If `resolvePlatformSemanticHash` extension breaks existing callers (`release.prepare`, `sternsystem.pin`, `handoff.absorb`), do not add a compatibility layer — fix the callers forward-only or escalate via `rfc.supersede.propose`.
