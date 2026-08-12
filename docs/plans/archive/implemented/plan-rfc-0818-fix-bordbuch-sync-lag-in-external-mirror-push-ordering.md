---
rfcId: RFC-0818
planId: PLAN-RFC-0818-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs: []
---

# Implementation Plan: RFC-0818

## 1. Objectives

- [ ] Objective 1 — Reorder `sternsystem.sync` operations so bordbuch commit precedes external mirror push and bundle creation — maps to acceptance criterion [external mirror HEAD matches refs/mirror]
- [ ] Objective 2 — Add integration test verifying external mirror HEAD matches `refs/mirror/${branch}` after sync — maps to acceptance criterion [integration test verifies external mirror HEAD matches refs/mirror]
- [ ] Objective 3 — Add integration test verifying bundle mirrors include the bordbuch commit — maps to acceptance criterion [bundle mirrors include bordbuch commit]
- [ ] Objective 4 — Verify existing tests still pass (non-fatal failure handling, refs/mirror = bare HEAD) — maps to acceptance criteria [refs/mirror matches bare HEAD, non-fatal failure handling unchanged]
- [ ] Objective 5 — Stamp RFC as implemented — maps to acceptance criterion [rfc.validate passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/sternsystem/sternsystem-sync.ts` — reorder: move external push loop (lines 126-161) and bundle creation block (lines 163-198) to after `appendAndCommitBordbuch` call (line 212). Capture `commitSha` before the bordbuch commit (stays at current position, lines 202-207).
- `packages/werkstatt/src/sternsystem/sternsystem-sync-integration.test.ts` — add test: external mirror HEAD matches `refs/mirror/main` after sync. Add test: bundle mirror includes bordbuch commit.

### 2.2 Configuration and data

None — no config changes, no new flags.

### 2.3 Documentation and specs

- RFC file is read-only reference (already accepted).
- No AGENTS.md updates needed — the root AGENTS.md describes sync protocol at a high level and does not specify operation ordering.
- No `docs/*.xml` Compass changes needed — this is a bug fix, not a semantic change.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit + integration tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0818` — RFC validation

## 3. Step sequence

### Step 1. Reorder operations in sternsystem-sync.ts

**Goal:** Move the external mirror push loop and bundle creation block to after the `appendAndCommitBordbuch` call, ensuring the bordbuch commit reaches external mirrors and bundles.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-sync.ts`, restructure `runSternsystemSync` so the operation order is:
  1. Push cache clone → bare repo (lines 102-111, unchanged)
  2. Capture `commitSha` = bare HEAD (lines 202-207, stays in place — before bordbuch commit)
  3. `appendAndCommitBordbuch` (lines 211-232, stays in place — after commitSha capture)
  4. External mirror push loop (lines 126-161, moved DOWN — after bordbuch commit)
  5. Bundle creation block (lines 163-198, moved DOWN — after bordbuch commit)
  6. Update `refs/mirror/${branch}` (lines 239-250, stays in place — after all pushes)
- Update the comment at lines 234-238 to reflect the new ordering — the bordbuch commit now precedes the external push, not follows it.
- Ensure `commitSha` is still captured before the bordbuch commit (it records the content SHA, not the bordbuch commit SHA).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes with zero errors.
- Manual review: the external push loop and bundle block are positioned after the `appendAndCommitBordbuch` call.

**Completion criterion:** `sternsystem-sync.ts` compiles and the external push + bundle creation execute after the bordbuch commit.

**Human review:** no

---

### Step 2. Add integration test: external mirror HEAD matches refs/mirror

**Goal:** Verify that after sync, the external mirror's HEAD matches `refs/mirror/${branch}` in the bare repo.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-sync-integration.test.ts`, add a test:
  - Setup: cache clone + bare repo + external bare repo (3 mirrors).
  - Make a new commit in cache, run sync.
  - Assert: `git(externalDir, "rev-parse main")` === `git(bareDir, "rev-parse refs/mirror/main")`.
  - Assert: external mirror log contains the bordbuch commit message (`Bordbuch: mirror-sync test-site`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --reporter=verbose sternsystem-sync-integration` passes.

**Completion criterion:** New test passes and verifies external mirror HEAD = `refs/mirror/main`.

**Human review:** no

---

### Step 3. Add integration test: bundle mirror includes bordbuch commit

**Goal:** Verify that bundles created during sync include the bordbuch commit.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-sync-integration.test.ts`, add a test:
  - Setup: cache clone + bare repo + bundle mirror (file-based path).
  - Make a new commit in cache, run sync.
  - Assert: bundle file exists at the configured path.
  - Assert: `git bundle verify` succeeds on the bundle.
  - Assert: `git bundle list-heads` includes `refs/heads/main`.
  - Clone the bundle and verify the bordbuch commit message appears in the log.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --reporter=verbose sternsystem-sync-integration` passes.

**Completion criterion:** New test passes and verifies the bundle includes the bordbuch commit.

**Human review:** no

---

### Step 4. Add regression test: residual false positive on external push failure

**Goal:** Document the known edge case where external push fails after bordbuch commit — refs/mirror = N+1 but external = N.

**Agent actions:**

- In `packages/werkstatt/src/sternsystem/sternsystem-sync-integration.test.ts`, add a test:
  - Setup: cache clone + bare repo + two external bare repos, one of which is a non-existent path (simulates push failure).
  - Make a new commit in cache, run sync.
  - Assert: sync exits 0 (non-fatal failure).
  - Assert: `refs/mirror/main` exists and matches bare HEAD (N+1, includes bordbuch commit).
  - Assert: the working external mirror has N+1 (bordbuch commit reached it).
  - Document in test comment: the failed external mirror has N (stale), but `refs/mirror` = N+1 — this is the known residual false positive, only on push failure.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --reporter=verbose sternsystem-sync-integration` passes.

**Completion criterion:** New test passes and documents the residual false positive edge case in code.

**Human review:** no

---

### Step 5. Run full test suite and typecheck

**Goal:** Verify all existing tests still pass and the package typechecks.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check`.
- Run `pnpm --filter @warpgogol/werkstatt run test`.
- Fix any failures.

**Validation:**

- `build:check` exits 0.
- `test` exits 0 — all tests pass including existing tests for non-fatal failure handling and `refs/mirror` = bare HEAD.

**Completion criterion:** Zero typecheck errors, zero test failures.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review and fix, stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md or Compass XML updates needed — this is a bug fix in existing code.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0818` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
  - [x] External mirror HEAD matches `refs/mirror/${branch}` — (evidence: `sternsystem-sync-integration.test.ts`, new test from Step 2)
  - [x] `refs/mirror/${branch}` matches bare repo HEAD — (evidence: `sternsystem-sync-integration.test.ts:199-222`, existing test)
  - [x] Bundle mirrors include the bordbuch commit — (evidence: `sternsystem-sync-integration.test.ts`, new test from Step 3)
  - [x] Integration test verifies external mirror HEAD matches `refs/mirror/${branch}` — (evidence: `sternsystem-sync-integration.test.ts`, Step 2 test)
  - [x] `sternsystem.sync` non-fatal failure handling unchanged — (evidence: `sternsystem-sync-integration.test.ts:173-197`, existing test passes)
  - [x] `rfc.validate` passes — (evidence: `rfc.validate --id RFC-0818` exit 0)
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0818` (auto-detects implementation commit). Run `--dry-run` first, then without `--dry-run`.
- Commit the stamped RFC separately from the implementation commit.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0818` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; review and fix complete.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0818`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0818 --dry-run`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0818` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| External push now includes bordbuch commits | Step 2 test verifies external mirror receives bordbuch commit |
| Bundle files are larger | Step 3 test verifies bundle includes bordbuch commit |
| commitSha in bordbuch metadata is content SHA, not post-bordbuch SHA | Step 1 ensures commitSha is captured before bordbuch commit — semantically correct |
| Residual false positive on external push failure | Documented in RFC failure modes — not a regression, only occurs on push failure |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0818 --reason "..." --invariant "DNA-N"` instead of working around it.
