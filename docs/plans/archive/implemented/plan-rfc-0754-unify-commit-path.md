---
rfcId: RFC-0754
planId: PLAN-RFC-0754-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-checks
    - packages/os/site-kernel
  services: []
  docs:
    - AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0754

## 1. Objectives

- [ ] Objective 1 — `ecosystem.commit` handles non-platform-scope-only commits without version bump (new fallback). Maps to acceptance criterion: "handles non-platform-scope-only commits without version bump".
- [ ] Objective 2 — `ecosystem.commit` handles mixed-scope commits by splitting into two sequential commits. Maps to acceptance criterion: "handles mixed-scope commits by splitting into two sequential commits".
- [ ] Objective 3 — RFC-0704 `skipPlatformBump` path is preserved within the platform subset. Maps to acceptance criterion: "RFC-0704 skipPlatformBump path is preserved".
- [ ] Objective 4 — Existing flags (`--rfc`, `--bump`, `--amend`, `--dry-run`) work correctly in all scope scenarios. Maps to acceptance criteria for flag behavior.
- [ ] Objective 5 — `EcosystemCommitResult` is extended with `nonPlatformCommit` field. Maps to acceptance criterion: "--json output includes nonPlatformCommit field".
- [ ] Objective 6 — Root `AGENTS.md` updated to direct agents to always use `ecosystem.commit`. Maps to acceptance criterion: "Root AGENTS.md updated".
- [ ] Objective 7 — Unit tests cover all three scope scenarios + skipPlatformBump preservation. Maps to acceptance criterion: "Unit tests cover all three scope scenarios".

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/ecosystem-commit.ts` — main handler: add scope partitioning, non-platform fallback, split-commit logic, extend result type
- `packages/os/site-kernel-checks/src/ecosystem.ts` — re-export barrel (no change needed, already re-exports `runEcosystemCommit`)
- `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` — update `ecosystem.commit` command description to reflect auto-detect behavior
- `packages/os/site-kernel/src/platform-scope.ts` — `isPlatformScope` already exported, reused as-is (no change needed)

### 2.2 Configuration and data

- `docs/command-manifest.generated.yaml` — regenerate if command metadata changes (description update)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update ecosystem.commit usage rule to "always use ecosystem.commit"
- `packages/os/site-kernel-checks/AGENTS.md` — add handler ownership note for auto-detect logic
- `docs/rfcs/rfc-0754-unify-commit-path.md` — read-only reference (accepted status)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — scoped typecheck
- `pnpm --filter @warpgogol/site-kernel-checks run test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0754` — RFC validation

## 3. Step sequence

### Step 1. Extend TypeScript contracts

**Goal:** Add `nonPlatformCommit` to `EcosystemCommitResult` and update the result interface.

**Agent actions:**

- Add `nonPlatformCommit?: { sha: string; files: string[] }` to `EcosystemCommitResult` interface in `packages/os/site-kernel-checks/src/ecosystem-commit.ts`
- Update `CHANGE_SUMMARY` block with RFC-0754 entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `EcosystemCommitResult` includes optional `nonPlatformCommit` field; typecheck passes.

**Human review:** no

---

### Step 2. Implement scope partitioning and non-platform fallback

**Goal:** Replace EC-01 block with auto-detect logic that handles non-platform-only commits.

**Agent actions:**

- In `runEcosystemCommit`, after getting `stagedFiles`:
  - Partition into `platformFiles` and `nonPlatformFiles` using `isPlatformScope()`
  - If `platformFiles.length === 0` and `nonPlatformFiles.length > 0`: delegate to `git commit` with `ECOSYSTEM_COMMIT=1` env var, return result with `skipPlatformBump: true`, empty platform fields, `commitSha` from HEAD
  - If `stagedFiles.length === 0`: keep existing "no staged files" error behavior (EC-08 for missing message is separate)
- Remove the EC-01 violation push for `platformStaged.length === 0` — replace with the fallback path
- Update `MODULE_CONTRACT` purpose to mention auto-detect

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `ecosystem.commit` with only non-platform staged files commits successfully without version bump; EC-01 is no longer raised for non-platform-only commits.

**Human review:** no

---

### Step 3. Implement mixed-scope split-commit logic

**Goal:** When both platform and non-platform files are staged, split into two sequential commits.

**Agent actions:**

- After scope partitioning, if both `platformFiles.length > 0` and `nonPlatformFiles.length > 0`:
  - Unstage non-platform files: `git reset HEAD -- <nonPlatformFiles>`
  - Run existing platform commit logic (bump, trailers, etc.) on platform files only
  - Re-stage non-platform files: `git add <nonPlatformFiles>`
  - Commit non-platform files with `git commit -m <message>` and `ECOSYSTEM_COMMIT=1` env var (no trailers, no bump)
  - Set `nonPlatformCommit: { sha, files: nonPlatformFiles }` on the result
- Handle `--amend` in mixed-scope: amend platform commit, non-platform is a new commit
- Handle `--dry-run` in mixed-scope: return forecast for platform commit + non-platform plan
- Handle `--rfc` in mixed-scope: trailer on platform commit only (already the case since non-platform commit has no trailers)
- Handle git failure on second commit: return error with platform commit SHA and pending files list

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Mixed-scope staged files produce two commits — platform commit with bump/trailers, non-platform commit without; result includes `nonPlatformCommit` field.

**Human review:** no

---

### Step 4. Update EC-01 behavior and error codes

**Goal:** Adjust EC-01 to only fire when there are zero staged files total, not when non-platform files are present.

**Agent actions:**

- Remove EC-01 violation for `platformStaged.length === 0` when `nonPlatformFiles.length > 0` (replaced by fallback in Step 2)
- Keep EC-01 for the case where `stagedFiles.length === 0` (no files staged at all) — or use a more specific error code
- Update EC-01 message if needed to reflect "no staged files" rather than "no platform-scope files"

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** EC-01 only fires when there are zero staged files; non-platform-only commits proceed successfully.

**Human review:** no

---

### Step 5. Update unit tests

**Goal:** Add tests for all three scope scenarios and skipPlatformBump preservation.

**Agent actions:**

- Update existing EC-01 test: change to expect success when only non-platform files are staged (or split into two tests: zero files → error, non-platform only → success)
- Add test: non-platform-only commit (e.g. `docs/readme.md`) succeeds without version bump, `skipPlatformBump: true`
- Add test: mixed-scope commit (e.g. `packages/dummy/index.ts` + `docs/readme.md`) produces two commits, platform commit has trailers, non-platform commit does not, result has `nonPlatformCommit`
- Add test: mixed-scope with `--rfc` — trailer on platform commit only
- Add test: mixed-scope with `--dry-run` — forecast includes both scopes
- Add test: `--amend` with non-platform only → error
- Add test: skipPlatformBump preserved — `.md` files in `packages/` still skip bump (existing RFC-0704 behavior)
- Add test: `independentVersionPackages` skip-bump preserved in mixed-scope (platform subset is all independent → no bump on platform commit, non-platform commit separate)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All new and existing tests pass; test coverage includes all three scope scenarios + skipPlatformBump + flag behavior in mixed-scope.

**Human review:** no

---

### Step 6. Update command table description

**Goal:** Update the `ecosystem.commit` command description to reflect auto-detect behavior.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts`, update the `ecosystem.commit` description from "Replaces direct git commit for packages/**, integrations/**, services/**." to mention auto-detect and fallback for non-platform scope
- Regenerate command manifest if needed: `pnpm exec site-kernel run command.manifest.generate`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Command table description reflects auto-detect behavior; manifest regenerated if needed.

**Human review:** no

---

### Step 7. Update AGENTS.md files

**Goal:** Update root AGENTS.md and package AGENTS.md with new ecosystem.commit guidance.

**Agent actions:**

- In root `AGENTS.md`, find the ecosystem.commit usage rule and update to: "Always use `ecosystem.commit` for all commits. It auto-detects scope and delegates non-platform changes to `git commit` under the hood."
- In `packages/os/site-kernel-checks/AGENTS.md`, add a note that `ecosystem-commit.ts` handles auto-detect and split-commit logic per RFC-0754

**Validation:**

- Visual inspection — both files updated

**Completion criterion:** Root AGENTS.md directs to always use `ecosystem.commit`; package AGENTS.md notes the auto-detect logic.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0754 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0754`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0754`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0754` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0754.generated.json` — verification evidence (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Split-commit atomicity: platform commit succeeds but non-platform fails | Step 3: error message includes platform commit SHA and pending files list for manual recovery |
| Agent misinterpretation: agents may still try `git commit` for platform files | Step 7: AGENTS.md update + pre-commit guard remains as safety net |
| RFC-0704 regression: skipPlatformBump path accidentally broken | Step 5: explicit test verifying `.md`-only and `independentVersionPackages` skip-bump still works within platform subset |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0754 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the split-commit mechanism proves unreliable (git staging edge cases), escalate to the operator — a simpler approach (e.g. always-single-commit with optional bump) may be needed.
