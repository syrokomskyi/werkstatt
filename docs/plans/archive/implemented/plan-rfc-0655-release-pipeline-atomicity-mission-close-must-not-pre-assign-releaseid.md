---
rfcId: RFC-0655
planId: PLAN-RFC-0655-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0655

## 1. Objectives

- [ ] Objective 1 — Add `releaseId` as a first-class field on `CloseReport` interface and write it to `close-report.json` (maps to acceptance criterion: "mission.close adds releaseId as a first-class field on CloseReport interface")
- [ ] Objective 2 — Fix `mission.close` to pass `releaseId` as a top-level option to `appendBordbuchEntry` (maps to acceptance criterion: "mission.close passes releaseId as a top-level option to appendBordbuchEntry")
- [ ] Objective 3 — Update `release.prepare` to read, update, and write back `close-report.json` after writing `releaseId` to `mission.yaml` (maps to acceptance criterion: "release.prepare updates close-report.json releaseId field")
- [ ] Objective 4 — Register `release.state.validate` command in the `release` module with `--mission`, `--release`, `--system` flags (maps to acceptance criterion: "release.state.validate command registered")
- [ ] Objective 5 — Implement all five consistency checks in `release.state.validate` (maps to acceptance criterion: "release.state.validate detects: missing release directory, close-report/mission.yaml releaseId mismatch, orphaned prepared releases, bordbuch releaseId mismatch, registry lastRelease inconsistency")
- [ ] Objective 6 — Unit tests cover all five checks with pass/fail scenarios plus edge cases (maps to acceptance criterion: "Unit tests cover all five checks" and "Unit tests cover edge cases")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add `releaseId` to `CloseReport` interface; pass `releaseId` as top-level option to `appendBordbuchEntry`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — update `runReleasePrepare` to read/update/write `close-report.json`; add `runReleaseStateValidate` function
- `packages/os/site-kernel-handoff/src/release/release.module.ts` — register `release.state.validate` command
- `packages/os/site-kernel-handoff/src/release/index.ts` — export `runReleaseStateValidate` and `ReleaseStateValidateData` type

### 2.2 Configuration and data

- No new YAML/JSON config files. The `close-report.json` schema is extended with a `releaseId` field (additive, non-breaking).

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — note the `release.state.validate` command and the `close-report.json` `releaseId` field
- RFC file is read-only reference (status: accepted)

### 2.4 Validation and pipelines

- `release.state.validate` is introduced as a standalone command, not yet integrated into `build.check` (per RFC rollout section)
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Add `releaseId` to `CloseReport` and fix bordbuch calling code in `mission.close`

**Goal:** Fix the root cause of bordbuch `releaseId: null` and add `releaseId` to `close-report.json`.

**Agent actions:**

- Add `releaseId: string | null` field to `CloseReport` interface in `mission-close.ts`
- Set `closeReport.releaseId = releaseId` when building the `closeReport` object
- In the `appendBordbuchEntry` call for `mission-close`, add `releaseId` as a top-level option (not only in `metadata`). The `appendBordbuchEntry` function signature already accepts `releaseId` as a top-level option in its options object — pass it there.
- Keep the existing `metadata: releaseId ? { releaseId } : undefined` for backward compatibility of the metadata field.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles
- Existing tests still pass: `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** `CloseReport` interface has `releaseId: string | null` field; `closeReport` object sets it; `appendBordbuchEntry` call passes `releaseId` as top-level option.

**Human review:** no

---

### Step 2. Update `release.prepare` to sync `close-report.json`

**Goal:** After `release.prepare` writes `releaseId` to `mission.yaml`, update `close-report.json` with the same `releaseId`.

**Agent actions:**

- In `runReleasePrepare`, after the existing `writeMissionManifest` call (line ~482), add code to:
  1. Read `missions/{missionId}/evidence/close-report.json` if it exists
  2. Parse it as JSON (wrap in try/catch per AGENTS.md rule)
  3. Set `releaseId` field to the new `releaseId`
  4. Write it back using `atomicWriteFile`
  5. If `close-report.json` does not exist, emit `logger.warn` and skip — do not create a new file
- Import `atomicWriteFile` from `../werkstatt/atomic.ts` (already imported in the file)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Existing tests still pass

**Completion criterion:** `release.prepare` reads, updates, and writes back `close-report.json` with the `releaseId` field; warns and skips if file doesn't exist.

**Human review:** no

---

### Step 3. Implement `release.state.validate` command

**Goal:** Create the new consistency validator command.

**Agent actions:**

- In `release-commands.ts`, add `runReleaseStateValidate` function and `ReleaseStateValidateData` / `ReleaseStateCheck` interfaces
- The function accepts `--mission`, `--release`, or `--system` flags:
  - `--mission`: resolve missionId → read `mission.yaml` → get `releaseId` → validate that release
  - `--release`: validate that release directly
  - `--system`: find all releases for the system and validate each
- Implement five checks:
  1. `mission-yaml-release-id-exists` — if `mission.yaml` has `releaseId`, release directory and `release.yaml` must exist
  2. `close-report-release-id-consistent` — `close-report.json` `releaseId` (if file exists) must match `mission.yaml` `releaseId`; skip with warning if file missing
  3. `release-state-progressed` — if release exists, state must be at least `published` (warn if `prepared`)
  4. `bordbuch-release-id-consistent` — latest `mission-close` bordbuch entry's top-level `releaseId` must match `releaseId` at close time
  5. `registry-last-release-consistent` — if release state is `promoted`, `registry.yaml.lastRelease` must point to this release or newer
- Error-level checks (exit 1): checks 1, 2, 4
- Warning-level checks (exit 0): check 3 (prepared state), check 5 (registry behind)
- Export `runReleaseStateValidate` and types from `release/index.ts`
- Register `release.state.validate` in `release.module.ts` with `--mission`, `--release`, `--system` flags

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run release.state.validate --release <test-release>` (smoke test if a release exists)

**Completion criterion:** Command registered, all five checks implemented, `--json` output format matches RFC spec, exports in place.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Cover all five checks with pass/fail scenarios plus edge cases.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/release-state-validate.test.ts`
- Test each check independently with mock filesystem state:
  - Check 1: pass (release dir exists) / fail (release dir missing)
  - Check 2: pass (releaseId matches) / fail (mismatch) / skip (close-report.json missing)
  - Check 3: pass (published) / warn (prepared) / pass (promoted)
  - Check 4: pass (bordbuch releaseId matches) / fail (mismatch)
  - Check 5: pass (registry matches) / warn (registry behind)
- Test edge cases:
  - Missing `close-report.json` (mission closed before RFC-0477)
  - Re-opened mission (latest bordbuch entry is the correct one)
  - `release.prepare` after close (bordbuch reflects close-time state, not post-prepare)
- Test `--mission`, `--release`, `--system` flag resolution
- Create `packages/os/site-kernel-handoff/src/tests/mission-close-release-id.test.ts`:
  - Test that `CloseReport` includes `releaseId` field
  - Test that `releaseId` is passed as top-level option to `appendBordbuchEntry` (mock the function)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All tests pass; all five checks have pass and fail test cases; edge cases covered.

**Human review:** no

---

### Step 5. Update AGENTS.md and run validation

**Goal:** Sync documentation and run full validation suite.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` with note about `release.state.validate` command and `close-report.json` `releaseId` field
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0655`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0655` (if acceptance probes declared — check RFC frontmatter)
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0655` (RFC-0330)

**Validation:**

- All commands pass with exit code 0

**Completion criterion:** AGENTS.md updated; all validation commands pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new `release.state.validate` command).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0655 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0655`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0655`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0655` (if acceptance probes declared)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0655` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0655.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0655` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for re-opened missions | Step 4: test case for re-opened mission validates latest bordbuch entry only |
| Re-opened mission + release.prepare race | Step 4: test case for release.prepare after close validates close-time state semantics |
| Missing close-report.json | Step 2: warn and skip; Step 3: check 2 skips with warning; Step 4: test case for missing file |
| Performance for large fleets | Step 3: validate by mission or release ID by default, not system-wide |
| Agent confusion on error vs warning | Step 3: error-level checks exit 1, warning-level exit 0; documented in `--json` output |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48, DNA-46, or DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0655 --reason "..." --invariant "DNA-N"` instead of working around it.
