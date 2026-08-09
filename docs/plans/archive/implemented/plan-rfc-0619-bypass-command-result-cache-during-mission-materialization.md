---
rfcId: RFC-0619
planId: PLAN-RFC-0619-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs: []
---

# Implementation Plan: RFC-0619

## 1. Objectives

- [ ] Objective 1 — Verify `force: true` is passed to `executeKernelPipeline` in `mission-materialize.ts` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add regression test that asserts `force: true` is passed during materialization (maps to acceptance criterion 4)
- [ ] Objective 3 — Verify no `SKIP (cached)` steps appear during materialization via test assertion (maps to acceptance criterion 3)
- [ ] Objective 4 — Stamp RFC as implemented with all acceptance criteria checked (maps to acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — already contains `force: true` at line 884 (hotfix applied). No code change needed.
- `packages/os/site-kernel-handoff/src/tests/mission-materialize-force-cache-bypass.test.ts` — new regression test file.

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0619-*.md` — acceptance criteria annotations (evidence references).
- No AGENTS.md changes needed — the RFC states "No AGENTS.md change is needed — the behavior is transparent to agents" (line 172).
- No `docs/*.xml` Compass sync needed — no repository-wide semantics changed.
- No `docs/architecture-dna.md` change — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck.
- `pnpm --filter @warpgogol/site-kernel-handoff test` — run regression test.
- `pnpm exec werkstatt run rfc.validate --id RFC-0619` — RFC validation.

## 3. Step sequence

### Step 1. Verify hotfix is present in source

**Goal:** Confirm `force: true` is already in `mission-materialize.ts` at the `executeKernelPipeline` call site.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` lines 879-885.
- Verify `force: true` is present in the `executeKernelPipeline` options object.

**Validation:**

- Visual inspection confirms `force: true` in the call.

**Completion criterion:** `force: true` is present at `mission-materialize.ts:884`.

**Human review:** no

---

### Step 2. Create regression test

**Goal:** Add a unit test that asserts `force: true` is passed to `executeKernelPipeline` during materialization.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-materialize-force-cache-bypass.test.ts`.
- Mock `@warpgogol/site-kernel` with `executeKernelPipeline` as `vi.fn` that captures the `force` option.
- Mock `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks` (same pattern as `mission-materialize-preflight-skip.test.ts`).
- Set up a minimal temp workspace with a registry entry, cache clone (git init + commit), `system.pin.json`, `mission.yaml` (state: open).
- Call `runMissionMaterialize` with `--mission <id>`.
- Assert `vi.mocked(executeKernelPipeline)` was called with `force: true` in the options.
- Assert `pipelineNameUsed` is `build.prepare.dev`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test -- mission-materialize-force-cache-bypass` passes.

**Completion criterion:** Test asserts `force: true` is passed and passes green.

**Human review:** no

---

### Step 3. Run full test suite and typecheck

**Goal:** Verify no regressions in the handoff package.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`.
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`.

**Validation:**

- Both commands exit 0.

**Completion criterion:** Typecheck and all tests pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify acceptance criteria, run code review, stamp RFC as implemented.

**Agent actions:**

- Check acceptance criterion 1: verify `force: true` at `mission-materialize.ts:884` — mark `[x]` with `(evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:884)`.
- Check acceptance criterion 2: `mission.materialize` succeeds on re-run — verified by test (mocked pipeline returns ok). Mark `[x]` with test evidence.
- Check acceptance criterion 3: no `SKIP (cached)` — `force: true` bypasses cache reads (`tryCacheRead` returns null when `force` is true, `execute-pipeline.ts:201`). Mark `[x]` with evidence.
- Check acceptance criterion 4: regression test exists — mark `[x]` with test file path.
- Check acceptance criterion 5: `rfc.validate` passes — run and verify.
- Run `fo-review` on all session code changes via `skill` tool.
- Run `fo-fix` if review has findings.
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0619 --implementation-commit <sha>`.
- Run `fo-doc-audit` to sync documentation surfaces.

**Validation:**

- `git status` — clean.
- `pnpm exec werkstatt run rfc.validate --id RFC-0619` — passes.
- Review report in `docs/reviews/code/`.

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented`; `git status` clean.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0619`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Regression test file: `packages/os/site-kernel-handoff/src/tests/mission-materialize-force-cache-bypass.test.ts`
- Commit messages referencing `RFC-0619` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Regression risk: future refactor removes `force: true` | Step 2 regression test catches removal |
| Agent confusion: `SKIP (cached)` disappears from output | No mitigation needed — behavior is transparent and documented in code comment |
| Performance impact: ~5-10s per materialization | No mitigation needed — materialization is infrequent, correctness > speed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0619 --reason "..." --invariant "DNA-47"` instead of working around it.
