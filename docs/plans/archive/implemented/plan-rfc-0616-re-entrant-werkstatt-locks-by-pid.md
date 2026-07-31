---
rfcId: RFC-0616
planId: PLAN-RFC-0616-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0616

## 1. Objectives

- [ ] Add re-entrant lock behavior rule to `packages/forge/AGENTS.md` — maps to acceptance criterion "packages/forge/AGENTS.md documents the re-entrant lock behavior"
- [ ] Add test assertion verifying that re-entrant acquire preserves original `operationId` and `command` — maps to acceptance criterion "Test asserts that re-entrant acquire preserves the original operationId and command"
- [ ] Stamp RFC-0616 as implemented — maps to all acceptance criteria

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/tests/werkstatt-lock.test.ts` — add assertion for `operationId`/`command` preservation in re-entrant acquire test (line 128-149)

### 2.2 Configuration and data

None — the lock schema and handler implementation are already applied (commit `0896e17`).

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add rule documenting re-entrant lock behavior (acquireLock increments depth for same PID, releaseLock decrements, `?? 1` fallback for optional depth)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge test` — must pass with new assertion
- `pnpm --filter @warpgogol/forge build:check` — must pass
- `pnpm --filter @warpgogol/ontology build:check` — must pass (schema unchanged, already has `.optional()`)
- `pnpm exec site-kernel run rfc.validate --id RFC-0616` — must pass

## 3. Step sequence

### Step 1. Add AGENTS.md rule for re-entrant lock behavior

**Goal:** Document the re-entrant lock behavior in `packages/forge/AGENTS.md` so agents understand that `acquireLock` does not throw when the same PID re-acquires.

**Agent actions:**

- Read `packages/forge/AGENTS.md` to find the appropriate section for the new rule.
- Add a rule under the OS modules or import rules section explaining: `acquireLock` is re-entrant by PID — when the same process re-acquires a lock it already holds, `depth` is incremented instead of throwing. `releaseLock` decrements `depth` and only deletes the lock file at `depth=1` or `undefined`. The `depth` field is `.optional()` in `werkstattLockSchema`; `?? 1` fallbacks handle pre-existing lock files without `depth`.

**Validation:**

- `packages/forge/AGENTS.md` contains a paragraph mentioning re-entrant lock behavior.

**Completion criterion:** `grep -c "re-entrant" packages/forge/AGENTS.md` returns ≥ 1.

**Human review:** no

---

### Step 2. Add test assertion for operationId/command preservation

**Goal:** Verify that re-entrant `acquireLock` preserves the original `operationId` and `command` from the outermost acquire.

**Agent actions:**

- In `packages/forge/src/tests/werkstatt-lock.test.ts`, in the test "is re-entrant for same PID (increments depth)" (line 128-149), add assertions after the re-entrant acquire:
  - `expect(lock2.operationId).toBe("op-001")` — original operationId preserved
  - `expect(lock2.command).toBe("outer.cmd")` — original command preserved

**Validation:**

- `pnpm --filter @warpgogol/forge test` passes with the new assertions.

**Completion criterion:** Test "is re-entrant for same PID (increments depth)" asserts `lock2.operationId === "op-001"` and `lock2.command === "outer.cmd"`.

**Human review:** no

---

### Step 3. Run validation suite

**Goal:** Confirm all acceptance criteria pass.

**Agent actions:**

- Run `pnpm --filter @warpgogol/forge test`
- Run `pnpm --filter @warpgogol/forge build:check`
- Run `pnpm --filter @warpgogol/ontology build:check`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0616`

**Validation:**

- All commands exit with code 0.

**Completion criterion:** All 4 commands pass.

**Human review:** no

---

### Step 4. Check acceptance criteria and stamp implemented

**Goal:** Mark all acceptance criteria as verified and stamp the RFC as implemented.

**Agent actions:**

- Update the two pending acceptance criteria in the RFC file from `[ ]` to `[x]` with inline evidence:
  - `[x] packages/forge/AGENTS.md documents the re-entrant lock behavior (evidence: packages/forge/AGENTS.md)`
  - `[x] Test asserts that re-entrant acquire preserves the original operationId and command (evidence: packages/forge/src/tests/werkstatt-lock.test.ts:<line>)`
- Commit the acceptance criteria update.
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0616 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
- Commit the stamp transition.

**Validation:**

- `rfc.validate --id RFC-0616` passes with zero violations.
- `git status` is clean.

**Completion criterion:** RFC-0616 status is `implemented`, `implementedAt` is set, all acceptance criteria are `[x]`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and confirm the RFC is stamped as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` was updated in Step 1.
- Run `fo-review` via the `skill` tool on all session code changes.
- Run `fo-fix` if review has findings.
- Run `fo-doc-audit` to sync documentation surfaces.
- Confirm `git status` is clean.

**Validation:**

- `git status` — no uncommitted changes from this session.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; RFC is stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0616`
- `pnpm --filter @warpgogol/forge test`
- `pnpm --filter @warpgogol/forge build:check`
- `pnpm --filter @warpgogol/ontology build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0616` in the subject line
- `packages/forge/AGENTS.md` with re-entrant lock rule
- `packages/forge/src/tests/werkstatt-lock.test.ts` with operationId preservation assertions

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Agent confusion — agents assume acquireLock always throws on existing lock | Step 1 adds AGENTS.md rule documenting re-entrant behavior |
| Unbalanced release — crash leaves depth > 1 | Not mitigated by this plan; stale detection handles it (RFC documents this) |
| Concurrent re-entrant acquisition race | Not mitigated; pipeline phases run sequentially (RFC documents this) |
| Schema duplication — two schema files must stay in sync | Step 3 validates both packages pass build:check |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0616 --reason "..." --invariant "DNA-51"` instead of working around it.
