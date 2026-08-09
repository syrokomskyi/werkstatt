---
rfcId: RFC-0599
planId: PLAN-RFC-0599-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-codegen"
  services: []
  docs: []
---

# Implementation Plan: RFC-0599

## 1. Objectives

- [ ] Objective 1 — Replace the single `fs.access(firstPagePath)` check with a loop over all declared output paths in the fingerprint cache short-circuit — maps to acceptance criterion [Fingerprint cache short-circuit checks all declared output paths]
- [ ] Objective 2 — Ensure missing public artifacts trigger full regeneration — maps to acceptance criteria [THIRD_PARTY_LICENSES.txt regenerated, THIRD_PARTY_NOTICES.txt regenerated, sbom.cdx.json regenerated]
- [ ] Objective 3 — Add a unit test covering the missing-output regeneration scenario — maps to acceptance criterion [Unit test covers missing-output regeneration]
- [ ] Objective 4 — Verify `generated.files.validate` passes after `open-source.generate` — maps to acceptance criterion [generated.files.validate passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-codegen/src/open-source-page.ts` — `runGenerateOpenSourcePage` function, fingerprint cache short-circuit block (lines 800-820)
- `packages/os/site-kernel-codegen/src/tests/open-source-fingerprint.test.ts` — new unit test file

### 2.2 Configuration and data

No configuration changes. The `declaredOutputPaths` array is internal to the function.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0599-fix-open-source-generate-output-completeness-verification.md`
- No `AGENTS.md` updates needed — the fix is internal to an existing command, no new commands or ownership changes.
- No `docs/*.xml` Compass updates needed — no repository-wide semantics change.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-codegen run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-codegen run test` — unit tests
- `pnpm exec site-kernel run rfc.validate RFC-0599` — RFC validation

## 3. Step sequence

### Step 1. Fix the fingerprint cache short-circuit in `open-source-page.ts`

**Goal:** Replace the single `fs.access(firstPagePath)` check with a loop over all declared output paths so that missing any output file triggers full regeneration.

**Agent actions:**

- Read `packages/os/site-kernel-codegen/src/open-source-page.ts` lines 800-820 (the fingerprint cache check block).
- Build the `declaredOutputPaths` array using the actual path construction from the generator body (lines 912-955):
  - Content pages: `path.join(paths.contentPagesDirectory, lang, "open-source.md")` per language
  - Prose pages: `path.join(paths.contentDirectory, "prose", lang, "open-source.md")` per language
  - Registry JSON: `path.join(paths.contentDirectory, "data", lang, "open-source-registry.json")` per language
  - Public artifacts: `path.join(paths.publicDirectory, "open-source", "THIRD_PARTY_NOTICES.txt")`, `THIRD_PARTY_LICENSES.txt`, `sbom.cdx.json`
- Replace the `await fs.access(firstPagePath)` check with `Promise.all` over `declaredOutputPaths` checking existence.
- If all outputs exist, return "up to date"; otherwise fall through to regeneration with a log message.
- Remove the now-unused `firstPagePath` variable (or keep it as part of the `declaredOutputPaths` array — it's the first element).
- Ensure the `declaredOutputPaths` array matches the output paths in `GENERATOR_OWNERSHIP_MAP` (`packages/os/site-kernel-checks/src/generator-ownership.ts:159-180`).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen run build:check` — must pass with zero type errors
- Visual inspection: the `declaredOutputPaths` array covers all 4 output categories (content pages, prose pages, registry JSON, public artifacts)

**Completion criterion:** The fingerprint cache short-circuit checks all declared output paths, not just `firstPagePath`. `build:check` passes.

**Human review:** no

---

### Step 2. Add unit test for missing-output regeneration

**Goal:** Create a unit test that verifies the fingerprint cache short-circuit triggers full regeneration when output files are missing, even when the fingerprint matches.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/tests/open-source-fingerprint.test.ts`.
- The test must mock the external dependencies (`pnpm licenses list`, `@quantco/pnpm-licenses`) since the test should not depend on a real `pnpm-lock.yaml`. Use `vi.mock` or inject a fake `execFileSync`.
- Test scenario: create a temp directory with a matching fingerprint cache file and all output files present → verify the generator returns "up to date" without calling pnpm licenses.
- Test scenario: create a temp directory with a matching fingerprint cache file but with one public artifact missing → verify the generator proceeds to regeneration (calls pnpm licenses).
- Test scenario: create a temp directory with a matching fingerprint cache file but with one content page missing → verify the generator proceeds to regeneration.
- The test needs a minimal `system.md` with `openSource` page enabled and `i18n` config, plus `labels.md` files. Use the pattern from existing tests in `src/tests/`.
- Mock `@warpgogol/site-kernel-content` (`loadSystemManifestSync`, `loadI18nConfigSync`) to return controlled data.
- Include `logger: { info: () => {} }` in the test context to avoid `TypeError: Cannot read properties of undefined`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen run test` — all tests pass

**Completion criterion:** Unit test exists and passes, covering the missing-output regeneration scenario for both public artifacts and content pages.

**Human review:** no

---

### Step 3. Run validation suite

**Goal:** Verify all acceptance criteria are met and the implementation is complete.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-codegen run test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0599`
- Verify each acceptance criterion against the implementation:
  1. Fingerprint cache short-circuit checks all declared output paths — verify by reading the code
  2. After deleting `THIRD_PARTY_LICENSES.txt` and re-running, file is regenerated — verify via unit test
  3. After deleting `THIRD_PARTY_NOTICES.txt` and re-running, file is regenerated — verify via unit test
  4. After deleting `sbom.cdx.json` and re-running, file is regenerated — verify via unit test
  5. `generated.files.validate` passes — verify the ownership map already declares all paths (no new paths added)
  6. Unit test covers the missing-output regeneration scenario — verify test file exists and passes
  7. `rfc.validate` passes — verify command output

**Validation:**

- All commands exit 0
- All acceptance criteria verified

**Completion criterion:** All validation commands pass, all acceptance criteria verified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed (internal fix, no new commands or ownership changes).
- No `docs/*.xml` Compass updates needed (no repository-wide semantics change).
- No `docs/architecture-dna.md` update (no new DNA invariant).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Commit the acceptance criteria update** as a separate commit: `rfc: RFC-0599 check acceptance criteria with evidence`
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0599 --implementation-commit <sha>` (dry-run first, then without `--dry-run`). The command validates all preconditions (status, criteria, clean tree, commit reachability).
- **Commit the stamp transition** as a separate commit: `rfc: implement RFC-0599 ...`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0599`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0599`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0599` in the subject line (RFC-0265 commit hygiene)
- Unit test file `packages/os/site-kernel-codegen/src/tests/open-source-fingerprint.test.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance: N `fs.access` calls before short-circuit | Step 1 uses `Promise.all` for parallel `fs.access` — sub-millisecond total cost |
| False positives: site without `openSource` page | Existing `hasSystemPage` guard at line 756 returns early before fingerprint check — no false positive |
| Maintenance: `declaredOutputPaths` must stay in sync with generator outputs | Step 1 adds a comment linking to `GENERATOR_OWNERSHIP_MAP` (lines 159-180) — the ownership map is the source of truth |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0599 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the unit test cannot be written without real `pnpm licenses` execution (e.g., the function is too tightly coupled to `execFileSync`), consider extracting the completeness check into a testable helper function. This does not change the RFC's scope — it's a testability refactor.
