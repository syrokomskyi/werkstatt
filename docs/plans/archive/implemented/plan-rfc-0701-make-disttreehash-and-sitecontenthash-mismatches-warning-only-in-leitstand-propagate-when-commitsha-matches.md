---
rfcId: RFC-0701
planId: PLAN-RFC-0701-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - docs/rfcs/rfc-0701-make-disttreehash-and-sitecontenthash-mismatches-warning-only-in-leitstand-propagate-when-commitsha-matches.md
    - docs/rfcs/archive/implemented/rfc-0608-enforce-alt-to-main-deployment-promotion-chain-with-release-state-machine-and-public-build-identity-verification.md
---

# Implementation Plan: RFC-0701

## 1. Objectives

- [ ] Objective 1 — Commit the working-tree code change that converts `distTreeHash` and `siteContentHash` mismatch from `throw new Error(...)` to `logger.warn(...)` in `leitstand-commands.ts:1572-1595` — maps to acceptance criteria 1, 2, 3, 5
- [ ] Objective 2 — Add a unit test covering the warning-only path (secondary hash mismatch with matching `commitSha` does not throw) — maps to acceptance criterion 6
- [ ] Objective 3 — Verify warning messages include both manifest and identity hash values — maps to acceptance criterion 4
- [ ] Objective 4 — Validate, review, stamp implemented — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandPropagate` hash check logic (lines 1572-1595): `throw new Error(...)` → `logger.warn(...)` for `distTreeHash` and `siteContentHash`. **Already changed in working tree.**
- `packages/os/site-kernel-handoff/src/tests/rfc-0701-propagate-warning-only.test.ts` — new unit test file.

### 2.2 Configuration and data

No configuration or data changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0701-*.md` — RFC file (read-only reference; status transition via `rfc.implement.stamp`).
- `docs/rfcs/archive/implemented/rfc-0608-*.md` — `amendedBy` list updated with `RFC-0701` (already done during enhance).
- No `AGENTS.md` updates needed — the behavior change is within an existing command, no new rules.
- No `docs/*.xml` Compass sync needed — no repository-wide semantic changes.
- No `docs/architecture-dna.md` updates needed — no new DNA invariant; DNA-49 is amended, not replaced.

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0701`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

## 3. Step sequence

### Step 1. Commit the working-tree code change

**Goal:** Commit the already-applied `throw` → `logger.warn` conversion in `leitstand-commands.ts` with a reference to RFC-0701.

**Agent actions:**

- Verify the working-tree diff in `leitstand-commands.ts` matches the RFC's Design section: `distTreeHash` and `siteContentHash` checks use `logger.warn(...)` instead of `throw new Error(...)`.
- Verify `commitSha` mismatch check (lines 1562-1566) still uses `throw new Error(...)` — must not be changed.
- Stage only `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`.
- Commit with message: `implement: RFC-0701 — warning-only for distTreeHash/siteContentHash mismatch when commitSha matches`

**Validation:**

- `rtk git diff HEAD~1 -- packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` shows only the `throw` → `logger.warn` conversion.
- `commitSha` check still uses `throw new Error(...)`.

**Completion criterion:** Code change committed; `git diff` confirms only the two hash checks were converted from `throw` to `logger.warn`.

**Human review:** no

---

### Step 2. Add unit test for warning-only path

**Goal:** Create a unit test that verifies `distTreeHash` and `siteContentHash` mismatches produce warnings (not errors) when `commitSha` matches, and that propagation succeeds.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0701-propagate-warning-only.test.ts`.
- Mock `fetch` via `vi.stubGlobal("fetch", ...)` to return a `build-identity.json` with `distTreeHash` and `siteContentHash` that differ from the release manifest, but `commitSha` that matches.
- Write a minimal `package.json` to the temp directory (required by `resolveCurrentEcosystem`).
- Test cases:
  1. `distTreeHash` mismatch with matching `commitSha` → `logger.warn` called, no throw, propagation continues.
  2. `siteContentHash` mismatch with matching `commitSha` → `logger.warn` called, no throw, propagation continues.
  3. Both mismatches with matching `commitSha` → two `logger.warn` calls, no throw.
  4. `commitSha` mismatch (both non-`"0000000"`) → `throw` (hard error, unchanged).
  5. Warning message includes both `manifest='...'` and `identity='...'` hash values.
- Follow the mock pattern from `leitstand-0608-propagate-channel-removed.test.ts` and `rfc-0634-propagate-dev-verification.test.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run rfc-0701`

**Completion criterion:** All test cases pass; test file committed.

**Human review:** no

---

### Step 3. Typecheck and full test suite

**Goal:** Verify the package passes typecheck and all existing tests still pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`.
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`.
- Fix any type errors or test failures caused by the code change.

**Validation:**

- `build:check` exits 0.
- `test` exits 0.

**Completion criterion:** Both commands pass with zero errors.

**Human review:** no

---

### Step 4. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify no `AGENTS.md` or `docs/*.xml` updates are needed (behavior change within existing command, no new rules).
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0701` — must pass with 0 violations.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0701` (RFC-0330, for probe-bearing RFCs — this RFC has commented-out probes, so this may produce no evidence file; that is expected).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)` annotations.
  - AC1: `distTreeHash` mismatch with matching `commitSha` produces a warning — evidence: `leitstand-commands.ts:1580-1583`, test case 1
  - AC2: `siteContentHash` mismatch with matching `commitSha` produces a warning — evidence: `leitstand-commands.ts:1592-1594`, test case 2
  - AC3: `commitSha` mismatch remains a hard error — evidence: `leitstand-commands.ts:1567-1569`, test case 4
  - AC4: Warning message includes both hash values — evidence: `leitstand-commands.ts:1581-1582`, test case 5
  - AC5: Propagation succeeds when only secondary hashes mismatch — evidence: test case 1/2 (no throw)
  - AC6: Unit test covers the warning-only path — evidence: `rfc-0701-propagate-warning-only.test.ts`
  - AC7: `rfc.validate` passes — evidence: `rfc.validate --id RFC-0701` output
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0701 --implementation-commit <sha>` (first `--dry-run`, then without). The implementation commit is the SHA from Step 1.
- **Commit the stamped RFC separately** — the implementation commit (Step 1) and the stamp commit MUST be separate commits.

**Validation:**

- `git status` — no uncommitted changes from this session (except changes by other agents).
- `pnpm exec werkstatt run rfc.validate --id RFC-0701` — 0 violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented`; implementation commit and stamp commit are separate; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0701`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0701` in the subject line (RFC-0265 commit hygiene).
- `docs/rfcs/verification/rfc-0701.generated.json` — verification evidence (RFC-0330, if probes were declared; this RFC has commented-out probes so the file may not be generated — that is expected).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Silent content drift — `distTreeHash` mismatch could indicate real content differences | Step 2 test case 5 verifies warning message includes both hash values, making drift visible |
| Agent complacency — agents might ignore warnings | Warning message includes `(commitSha matches)` note and both hash values; test verifies message format |
| False sense of security — `commitSha` match does not guarantee identical dist | Step 2 test case 4 verifies `commitSha` mismatch still throws (hard error unchanged) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0701 --reason "..." --invariant "DNA-49"` instead of working around it (RFC-0334).
