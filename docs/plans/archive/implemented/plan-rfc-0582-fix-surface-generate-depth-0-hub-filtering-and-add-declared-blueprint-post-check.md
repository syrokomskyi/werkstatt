---
rfcId: RFC-0582
planId: PLAN-RFC-0582-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs: []
---

# Implementation Plan: RFC-0582

## 1. Objectives

- [ ] Remove `existsSync` collection-directory filter from blueprint selection — maps to acceptance criterion "existsSync filter removed"
- [ ] Add `SURFACE-GEN-01` post-generation consistency check using `diagnosticsResult` — maps to acceptance criterion "Post-generation consistency check added"
- [ ] Verify depth-0 hub entries generated without collection directory — maps to acceptance criterion "surface.generate produces depth-0 hub entries for ratgeber blueprint"
- [ ] Add unit test covering depth-0-hub-without-collection-directory scenario — maps to acceptance criterion "Unit test in surface-generate.test.ts"
- [ ] Document `kernel.cache.clear` as post-implementation step — maps to acceptance criterion "kernel.cache.clear documented"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/surface/generate.ts` — remove `existsSync` filter at line 89, add `diagnosticsResult` import, add post-generation check after `surfaces[]` is built
- `packages/os/site-kernel-checks/src/tests/surface-generate.test.ts` — new test file

### 2.2 Configuration and data

None. No blueprint YAML, system.md, or ontology catalog changes.

### 2.3 Documentation and specs

- RFC file (read-only reference, already accepted)
- No AGENTS.md updates needed — no new modules, commands, or ownership changes
- No `docs/*.xml` Compass files need sync — no repository-wide semantic changes
- No `docs/architecture-dna.md` changes — no new DNA invariant

### 2.4 Validation and pipelines

- `surface.generate` remains in `build.prepare` — no pipeline change
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-checks run test` — unit tests

## 3. Step sequence

### Step 1. Remove existsSync filter and add post-generation check

**Goal:** Remove the redundant `existsSync` collection-directory filter from blueprint selection and add the `SURFACE-GEN-01` post-generation consistency check.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface/generate.ts`:
  - Add `diagnosticsResult` to the import from `../result-helpers.ts` (alongside existing `failResult`)
  - Remove the `existsSync(join(appDir, "src", "content", "surface", bp.dataset.collection))` condition from the blueprint filter (line 89)
  - After the blueprint expansion loop (after line 181, before `injectServiceCatalogLinks`), add the post-generation check:
    ```ts
    const emptyBlueprints = surfaces.filter((s) => s.generated === 0);
    if (emptyBlueprints.length > 0) {
      return diagnosticsResult("surface.generate", [
        {
          ruleId: "SURFACE-GEN-01",
          severity: "error",
          message: `declared blueprint '${emptyBlueprints[0]!.surfaceId}' produced zero entries — check expandBlueprint logs`,
        },
      ]);
    }
    ```
  - Do NOT remove the `existsSync` import — it is still used at line 108 for the `.surface-cache` directory check

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- No TypeScript errors from the removed filter or new check

**Completion criterion:** `generate.ts` no longer filters blueprints by `existsSync` on collection directory; post-generation check emits `SURFACE-GEN-01` via `diagnosticsResult` when any blueprint produces zero entries; `build:check` passes.

**Human review:** no

---

### Step 2. Add unit test for depth-0 hub without collection directory

**Goal:** Verify that `surface.generate` produces depth-0 hub entries for a declared blueprint even when the collection directory does not exist, and that `SURFACE-GEN-01` fires when a blueprint produces zero entries.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/surface-generate.test.ts`
- Test case 1: "depth-0 hub generated without collection directory" — set up a minimal fixture with a declared blueprint (e.g. `ratgeber`) whose `dataset.collection: articles` directory does NOT exist; run `runSurfaceGenerate`; assert the result exits 0 and the artifact contains a depth-0 hub entry for the blueprint
- Test case 2: "SURFACE-GEN-01 fires when blueprint produces zero entries" — set up a fixture where `expandBlueprint` returns zero entries (mock or malformed blueprint); assert the result exits 1 with `ruleId: "SURFACE-GEN-01"` in diagnostics
- Follow existing test patterns from `src/tests/surface-translation.test.ts` or `src/tests/surface-demand.test.ts` for fixture setup (mkdtemp, system.md, etc.)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass including new ones

**Completion criterion:** New test file exists and both test cases pass.

**Human review:** no

---

### Step 3. Run kernel.cache.clear and verify

**Goal:** Clear stale command-result cache entries and verify the fix works end-to-end.

**Agent actions:**

- Run `pnpm exec site-kernel run kernel.cache.clear --namespace command_results` to invalidate stale `surface.generate` cache entries
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` to confirm typecheck
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` to confirm all tests pass

**Validation:**

- `kernel.cache.clear` exits 0
- `build:check` exits 0
- `test` exits 0

**Completion criterion:** Cache cleared, typecheck passes, all tests pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md or Compass XML updates needed — no new modules, commands, or ownership changes.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected for this RFC).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0582 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0582`
- Every file in `scope.docs` is either updated or documented as not-applicable (none in scope).
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0582`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0582` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive for SURFACE-GEN-01 | Step 1: check uses `surfaces.filter((s) => s.generated === 0)` which only fires for blueprints that passed entitlement + declaration filter but produced zero entries |
| Stale cache entries | Step 3: run `kernel.cache.clear --namespace command_results` |
| Agent misinterpretation of SURFACE-GEN-01 | Error message says "check expandBlueprint logs" — guides agents to config, not empty directories |
| existsSync import accidentally removed | Step 1 explicitly notes: do NOT remove the import (still used at line 108) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-22 or DNA-39, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0582 --reason "..." --invariant "DNA-N"` instead of working around it.
