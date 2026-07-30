---
rfcId: RFC-0604
planId: PLAN-RFC-0604-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
---

# Implementation Plan: RFC-0604

## 1. Objectives

- [ ] Add `bordbuch.generate` to `SITES_BUILD_PREPARE_PIPELINE` before `generated.files.validate` — maps to acceptance criterion "bordbuch.generate added to SITES_BUILD_PREPARE_PIPELINE"
- [ ] Add `passport.key.ensure` to `SITES_BUILD_PREPARE_PIPELINE` after `bordbuch.generate` — maps to acceptance criterion "passport.key.ensure added to SITES_BUILD_PREPARE_PIPELINE"
- [ ] Confirm neither command is in `SITES_BUILD_PREPARE_DEV_PIPELINE` — maps to acceptance criterion "Neither command is added to SITES_BUILD_PREPARE_DEV_PIPELINE"
- [ ] Verify `bordbuch.generate` is pipeline-safe (no git commits, no bordbuch entries, idempotent via `writeFileIfChanged`) — maps to acceptance criterion "bordbuch.generate does not create git commits or bordbuch entries"
- [ ] Verify `passport.key.ensure` is idempotent and never prints private key — maps to acceptance criterion "passport.key.ensure is idempotent"
- [ ] Confirm prerequisites RFC-0605 and RFC-0606 are accepted and implemented — maps to acceptance criteria "RFC-0605 is accepted and implemented" and "RFC-0606 is accepted and implemented"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — fix target: add two entries to `SITES_BUILD_PREPARE_PIPELINE`, update `CHANGE_SUMMARY`
- No new commands. No command handler changes. No registry changes.

### 2.2 Configuration and data

- No YAML/JSON/NDJSON changes.
- `GENERATOR_OWNERSHIP_MAP` already lists `bordbuch.generate` as owner of bordbuch files (`generator-ownership.ts:384-396`). RFC-0605 updates the passport key ownership from `passport.key.rotate` to `passport.key.ensure` — that is RFC-0605's responsibility, not this RFC's.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` `CHANGE_SUMMARY` — add RFC-0604 entry.
- No `AGENTS.md` changes — the pipeline change is internal, no new modules or ownership boundaries.
- No `docs/*.xml` Compass file changes — no new commands, contracts, or DNA invariants.
- No `docs/architecture-dna.md` changes — this RFC does not introduce or modify DNA invariants.

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — extended with two new steps.
- `SITES_BUILD_PREPARE_DEV_PIPELINE` — NOT extended (dev-mode exclusion).
- `build.check` — not affected.
- CI workflows — not affected.

## 3. Step sequence

### Step 1. Verify prerequisites

**Goal:** Confirm RFC-0605 and RFC-0606 are accepted and implemented before making any code changes.

**Agent actions:**

- Read `docs/rfcs/rfc-0605-*.md` frontmatter — confirm `status: implemented`. If not implemented, stop and report to operator.
- Read `docs/rfcs/rfc-0606-*.md` frontmatter — confirm `status: implemented`. If not implemented, stop and report to operator.
- Verify `passport.key.ensure` command is registered: `pnpm exec site-kernel run command.list --json 2>/dev/null | grep passport.key.ensure` (or check command table in `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts`).
- Verify `generated.files.validate` resolves `systems/{system}/` paths (RFC-0606 fix is in place).

**Validation:**

- Both RFC files show `status: implemented`.
- `passport.key.ensure` appears in the command registry.

**Completion criterion:** Both prerequisite RFCs are implemented; `passport.key.ensure` command exists in the registry.

**Human review:** no

---

### Step 2. Add `bordbuch.generate` and `passport.key.ensure` to `SITES_BUILD_PREPARE_PIPELINE`

**Goal:** Extend the build-prepare pipeline with the two missing generation commands.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`.
- Locate the `SITES_BUILD_PREPARE_PIPELINE` array.
- Insert two new entries after `{ command: "warpgogol.check-hints.generate" }` and before `{ command: "generated.files.validate" }`:

```ts
// RFC-0604: generate bordbuch projections and ensure passport key before final validation
{ command: "bordbuch.generate" },
{ command: "passport.key.ensure" },
```

- Add `CHANGE_SUMMARY` entry:

```xml
<item>RFC-0604: added bordbuch.generate and passport.key.ensure before generated.files.validate.</item>
```

- Do NOT add these commands to `SITES_BUILD_PREPARE_DEV_PIPELINE`.

**Placement rationale:** The RFC says "at the end" and "after media.variants.generate". The actual pipeline has `generated.files.validate` and `generated.stale.validate` as the final two steps (added by RFC-0375 and RFC-0600). These validators check that all registered generated files exist and detect orphaned files. Since `bordbuch.generate` and `passport.key.ensure` produce registered generated files, they MUST run before the validators. The correct position is after the last generation command (`warpgogol.check-hints.generate`) and before the validators.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- Visual inspection: the two new entries are present in `SITES_BUILD_PREPARE_PIPELINE` and absent from `SITES_BUILD_PREPARE_DEV_PIPELINE`.

**Completion criterion:** Both commands are in `SITES_BUILD_PREPARE_PIPELINE` before `generated.files.validate`; neither is in `SITES_BUILD_PREPARE_DEV_PIPELINE`; typecheck passes.

**Human review:** no

---

### Step 3. Add unit test for pipeline membership

**Goal:** Verify the pipeline includes the new commands and excludes them from dev mode.

**Agent actions:**

- Create test file at `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts` (vitest config requires tests under `src/tests/`).
- Import `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE` from `../pipelines/build-prepare.ts`.
- Assert `bordbuch.generate` is in `SITES_BUILD_PREPARE_PIPELINE`.
- Assert `passport.key.ensure` is in `SITES_BUILD_PREPARE_PIPELINE`.
- Assert `bordbuch.generate` appears before `generated.files.validate` in the pipeline.
- Assert `passport.key.ensure` appears after `bordbuch.generate` in the pipeline.
- Assert `bordbuch.generate` is NOT in `SITES_BUILD_PREPARE_DEV_PIPELINE`.
- Assert `passport.key.ensure` is NOT in `SITES_BUILD_PREPARE_DEV_PIPELINE`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run src/tests/build-prepare-pipeline.test.ts` — test passes.

**Completion criterion:** Unit test passes and covers all pipeline membership acceptance criteria.

**Human review:** no

---

### Step 4. Verify commands individually and via full pipeline

**Goal:** Confirm the two new commands work in isolation and in the full pipeline context.

**Agent actions:**

**4a. Individual command verification:**

- Run `pnpm exec site-kernel run bordbuch.generate --site warpgogol-com`.
- Verify `systems/warpgogol-com/public/.well-known/bordbuch.json` exists.
- Verify `systems/warpgogol-com/public/.well-known/bordbuch/index.html` exists.
- Run `pnpm exec site-kernel run passport.key.ensure --site warpgogol-com`.
- Verify `public/.well-known/cosmic-passport-key.json` exists in the build workspace.

**4b. Full pipeline verification:**

- Run `pnpm exec site-kernel run build.prepare --site warpgogol-com` (6-minute budget, non-blocking).
- Verify `generated.files.validate` passes with no missing-output errors for bordbuch or passport.
- Verify `generated.stale.validate` does not flag bordbuch or passport files as stale.

**Validation:**

- Individual commands exit 0 and produce expected output files.
- `build.prepare` exits 0.
- `generated.files.validate` and `generated.stale.validate` pass.

**Completion criterion:** Both commands work individually; full `build.prepare` passes including validators.

**Human review:** no

---

### Step 5. Verify `bordbuch.generate` side-effect safety

**Goal:** Confirm `bordbuch.generate` does not create git commits or bordbuch entries when run in the pipeline.

**Agent actions:**

- Capture `git log --oneline -1` in `systems/warpgogol-com/` before running `bordbuch.generate`.
- Run `pnpm exec site-kernel run bordbuch.generate --site warpgogol-com` (isolated, not full pipeline).
- Capture `git log --oneline -1` in `systems/warpgogol-com/` after running.
- Confirm the HEAD SHA is unchanged (no new commits from `bordbuch.generate`).
- Read `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts` — confirm it uses `writeFileIfChanged` (line 214-216) and does NOT call `appendBordbuchEntry` or `commitAndPushBordbuch`.

**Validation:**

- HEAD SHA before == HEAD SHA after (no new commits).
- Code inspection confirms no bordbuch entry creation.

**Completion criterion:** `bordbuch.generate` produces no git commits and no bordbuch entries.

**Human review:** no

---

### Step 6. Verify `passport.key.ensure` idempotency

**Goal:** Confirm `passport.key.ensure` is idempotent and does not print the private key.

**Agent actions:**

- Run `pnpm exec site-kernel run passport.key.ensure --site warpgogol-com` once.
- Capture stdout — verify no private key hex string appears.
- Run `passport.key.ensure` again — verify it is a no-op (key file unchanged, no new key generated).
- Compare `public/.well-known/cosmic-passport-key.json` content before and after second run — must be identical.

**Validation:**

- No private key in stdout.
- Key file unchanged on second run.

**Completion criterion:** `passport.key.ensure` is idempotent and never prints private key to stdout.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `CHANGE_SUMMARY` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` (done in Step 2).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed — pipeline topology changed (two new steps), so run it.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0604 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0604` — passes with zero errors.
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run src/tests/build-prepare-pipeline.test.ts` — unit test passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0604`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run src/tests/build-prepare-pipeline.test.ts`
- `pnpm exec site-kernel run build.prepare --site warpgogol-com` (end-to-end verification)
- `pnpm exec site-kernel run generated.files.validate --site warpgogol-com` (requires RFC-0606)
- `pnpm exec site-kernel run generated.stale.validate --site warpgogol-com` (requires RFC-0600)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0604.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0604` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pipeline ordering — commands must run after all generation commands | Step 2 places them after `warpgogol.check-hints.generate` and before validators |
| Dev-mode exclusion — developers may expect bordbuch/passport artifacts in local `public/` | Step 2 explicitly excludes them from `SITES_BUILD_PREPARE_DEV_PIPELINE`; RFC nonGoals document this |
| Concurrent execution — `bordbuch.generate` acquires Werkstatt locks | `bordbuch.generate` already handles locks (acquire/release); pipeline context is acceptable |
| Private key not stored in pipeline — `passport.key.ensure` may generate a key without `--private-key-out` | RFC-0605 design covers this; operator must run `passport.key.rotate` manually for initial key creation or provide `--private-key-out` in CI |
| Prerequisites not met — RFC-0605 or RFC-0606 not implemented | Step 1 verifies both are implemented before any code changes; stops if not |

## 6. Escalation triggers

- If `bordbuch.generate` fails in the pipeline due to `--site` flag injection (KERNEL-FLAG-01), the command's flag schema may need to accept `--site` explicitly. `--site` is in `KERNEL_UNIVERSAL_FLAGS` (argv.ts:167), so it should be accepted. If not, investigate the flag resolver — do not work around it without understanding the root cause.
- If `generated.files.validate` still reports bordbuch files as missing after `build.prepare` (even after RFC-0606 is implemented), the path resolution fix in RFC-0606 may be incomplete. Run `rfc.supersede.propose` for RFC-0606 if the fix is fundamentally wrong.
- If `passport.key.ensure` does not exist in the registry despite RFC-0605 being implemented, check the command table in `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts` — RFC-0605 may have registered it in a different module.
