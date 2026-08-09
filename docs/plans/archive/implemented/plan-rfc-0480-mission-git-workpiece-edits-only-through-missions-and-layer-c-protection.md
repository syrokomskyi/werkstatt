---
rfcId: RFC-0480
planId: PLAN-RFC-0480-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/ontology"
    - "@gogol/share"
    - "@gogol/forge"
  services: []
  docs:
    - docs/requirements.xml
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0480

## 1. Objectives

- [ ] O1 — Workpiece is a fresh git repository with step-by-step commits for materialize, migrate, and operator edits (maps to AC: `mission.materialize` initializes git, `mission.migrate` commits, `mission.git.commit` implemented)
- [ ] O2 — `mission.reconcile` transfers workpiece commits to cache clone via `git format-patch` + `git am` with idempotent re-run (maps to AC: `mission.reconcile` uses format-patch + git am)
- [ ] O3 — `mission.close` and `mission.abort` create git bundles in `evidence/` and preserve workpiece/distribution for `mission.preview` (maps to AC: close/abort bundles, preview command)
- [ ] O4 — `mission.preview` and `mission.cleanup` commands implemented (maps to AC: preview starts dev server, cleanup removes workpiece)
- [ ] O5 — Edits-only-through-missions enforced: `sternsystem.sync` push-only, `sternsystem.validate` Bordbuch-vs-git-log check, `paused` guard on `mission.materialize` (maps to AC: pull/both removed, external-edit detection, paused guard)
- [ ] O6 — Layer C protection: declarative C-contract, `surface.contract.validate`, behavior snapshot C-coverage, `breaksC` frontmatter field + V-30 rule (maps to AC: C-contract, surface.contract.validate, release.prepare C-coverage, breaksC field, V-30, contract tests)

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/os/site-kernel-handoff/src/mission/`:**

- `mission-materialize.ts` — add `git init` + `git add -A` + `git commit` after staging, before atomic move; add `paused` status guard
- `mission-materialization-commands.ts` — rewrite `runMissionReconcile` to use `git format-patch --root` + `git am` with `preReconcileSha` reset; update `runMissionPreview` to start dev server (blocking); update `runMissionAbort` to create git bundle + preserve workpiece/distribution
- `mission-close.ts` — add git bundle creation in `evidence/`
- `mission-git-commit.ts` — **new**: `mission.git.commit` command handler
- `mission-preview.ts` — **new**: extracted `mission.preview` command handler (blocking `astro dev`/`astro preview`)
- `mission-cleanup.ts` — **new**: `mission.cleanup` command handler
- `mission.module.ts` — register `mission.git.commit`, `mission.preview` (changed), `mission.cleanup`

**`packages/os/site-kernel-handoff/src/sternsystem/`:**

- `sternsystem-sync.ts` — remove `--direction pull` and `--direction both` from validation + logic; push-only
- `sternsystem-validate.ts` — add Bordbuch-vs-git-log consistency check (SHA-range matching)
- `sternsystem.module.ts` — update `sternsystem.sync` command description and flags (remove `direction` enum values pull/both)

**`packages/os/site-kernel-handoff/src/surface-contract.ts` — new:** `surface.contract.validate` command handler

**`packages/os/site-kernel-handoff/src/behavior-snapshot/`:**

- `behavior-snapshot-commands.ts` — extend snapshot with C-coverage (URL list, JSON-LD per page, sitemap structure)

**`packages/os/site-kernel-handoff/src/release/`:**

- `release-commands.ts` — extend `release.prepare` with C-surface regression check; block on `C-surface-regression` without `breaksC: true` RFC

**`packages/ontology/src/external-surfaces/` — new:**

- `url-schema.yaml` — declarative URL pattern contract
- `jsonld-types.yaml` — declarative JSON-LD type contract
- `sitemap-shape.yaml` — declarative sitemap shape contract
- `index.ts` — re-exports + Zod schemas

**`packages/ontology/package.json`:**

- Add `./external-surfaces` subpath export

**`packages/share/src/__tests__/external-surfaces/` — new:**

- Contract test suite validating generated C-surfaces match declarative contract

**`packages/forge/os/rfc/`:**

- `types.ts` — add `breaksC` to `RFC_KNOWN_KEYS`
- `handlers/validate-rules.ts` — add V-30 rule

**`tools/kernel.config.ts`:**

- Register `mission.git.commit`, `mission.cleanup`, `surface.contract.validate`

### 2.2 Configuration and data

- `missions/<id>/workpiece/.git/` — new git repository per mission
- `missions/<id>/evidence/workpiece.git-bundle` — git bundle audit artifact
- `missions/<id>/evidence/reconciliation-report.json` — add `preReconcileSha` field
- Bordbuch `reconcile` entries — add `preReconcileSha` and `commitSha` metadata fields

### 2.3 Documentation and specs

- `AGENTS.md` — document edits-only-through-missions invariant, Layer C protection, `breaksC` field, `mission.git.commit` usage, `mission.preview`/`mission.cleanup` commands
- `packages/os/site-kernel-handoff/AGENTS.md` — update mission lifecycle rules, workpiece git, reconcile format-patch mechanism
- `docs/requirements.xml` — add edits-only-through-missions invariant
- `docs/verification-plan.xml` — add `surface.contract.validate` check
- `docs/COMMANDS.md` — add `mission.git.commit`, `mission.cleanup`, `surface.contract.validate`; update `mission.preview`, `sternsystem.sync`
- RFC-0472 — add `amendedBy: [RFC-0480]` backreference

### 2.4 Validation and pipelines

- `build.check` — add `surface.contract.validate` as blocking check
- `ci.local.validate` — add `surface.contract.validate`
- `rfc.validate` — V-30 rule for `breaksC` field

## 3. Step sequence

### Step 1. Ontology C-contract schemas and exports

**Goal:** Create the declarative C-contract in `@gogol/ontology` and export it.

**Agent actions:**

- Create `packages/ontology/src/external-surfaces/url-schema.yaml` with URL pattern definitions
- Create `packages/ontology/src/external-surfaces/jsonld-types.yaml` with JSON-LD type catalog
- Create `packages/ontology/src/external-surfaces/sitemap-shape.yaml` with sitemap shape
- Create `packages/ontology/src/external-surfaces/index.ts` with re-exports and Zod schemas
- Add `./external-surfaces` subpath export to `packages/ontology/package.json`

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes

**Completion criterion:** `@gogol/ontology/external-surfaces` importable, Zod schemas validate YAML contracts

**Human review:** no

---

### Step 2. `breaksC` frontmatter field and V-30 rule

**Goal:** Add `breaksC` to RFC frontmatter schema and implement V-30 validation rule.

**Agent actions:**

- Add `breaksC: z.boolean().optional()` to `RFC_KNOWN_KEYS` in `packages/forge/os/rfc/types.ts`
- Add V-30 rule to `packages/forge/os/rfc/handlers/validate-rules.ts`: if `breaksC: true` — RFC must modify files in `packages/ontology/src/external-surfaces/`; if `breaksC` absent/false but RFC modifies those files — V-30 warning

**Validation:**

- `pnpm --filter @gogol/forge build:check` passes
- `pnpm exec werkstatt run rfc.validate RFC-0480 --json` passes

**Completion criterion:** V-30 rule fires on test RFC with `breaksC: true` but no external-surfaces changes

**Human review:** no

---

### Step 3. Workpiece git initialization in `mission.materialize`

**Goal:** `mission.materialize` initializes a git repository in the workpiece and commits the materialized state.

**Agent actions:**

- In `mission-materialize.ts`, after copying data to staging and before atomic move: `git init`, `git add -A`, `git commit -m "materialize from pin <version>"`
- Add `paused` status guard: if registry entry status is `paused`, refuse with error

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** After `mission.materialize`, `missions/<id>/workpiece/.git/` exists with one commit

**Human review:** no

---

### Step 4. `mission.git.commit` command

**Goal:** Implement the canonical commit command for operator edits within a mission.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` with `runMissionGitCommit` handler
- Register `mission.git.commit` in `mission.module.ts` and `tools/kernel.config.ts`
- Command: `pnpm exec werkstatt run mission.git.commit --mission <id> --message "..."`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission.git.commit --mission <id> --message "test"` creates a git commit in the workpiece

**Human review:** no

---

### Step 5. `mission.reconcile` with `git format-patch` + `git am`

**Goal:** Replace `copyDir` + single commit with patch-based transfer and idempotent re-run.

**Agent actions:**

- Rewrite `runMissionReconcile` in `mission-materialization-commands.ts`:
  - Record cache clone HEAD as `preReconcileSha` before applying patches
  - `git format-patch --root` in workpiece
  - `git am <patches>` in cache clone
  - `git push origin <branch>` in cache clone
  - On re-run after partial failure: read `preReconcileSha` from previous reconciliation report, `git reset --hard <preReconcileSha>`, re-apply all patches
- Add `preReconcileSha` and `commitSha` to Bordbuch `reconcile` entry metadata
- Add `preReconcileSha` to `evidence/reconciliation-report.json`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** Reconcile transfers workpiece commits to cache clone; re-run after simulated partial failure resets and re-applies cleanly

**Human review:** no

---

### Step 6. Git bundle on `mission.close` and `mission.abort`

**Goal:** Create git bundles as audit artifacts and preserve workpiece/distribution.

**Agent actions:**

- In `mission-close.ts`: add `git bundle create <mission-dir>/evidence/workpiece.git-bundle --all` before state transition; add Bordbuch `git-bundle` entry
- In `mission-abort.ts`: remove `fs.rm(workpieceDir)` and `fs.rm(distributionDir)`; add `git bundle create` + Bordbuch `git-bundle` entry; preserve workpiece and distribution on disk

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** After close/abort, `evidence/workpiece.git-bundle` exists; workpiece and distribution directories remain on disk

**Human review:** no

---

### Step 7. `mission.preview` command (blocking dev server)

**Goal:** Start a blocking dev server for any mission (open, closed, aborted).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-preview.ts` with `runMissionPreview` handler
- Remove old `runMissionPreview` from `mission-materialization-commands.ts`
- Command runs `astro dev` (or `astro preview` with `--production`) in workpiece dir, blocking, with `--port` flag
- Works for open, closed, and aborted missions (remove `state !== "open"` guard)
- Register in `mission.module.ts` and `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission.preview --mission <id> --port 4321` starts dev server; works on closed/aborted missions

**Human review:** no

---

### Step 8. `mission.cleanup` command

**Goal:** Implement explicit workpiece cleanup with age-based option.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-cleanup.ts` with `runMissionCleanup` handler
- `--mission <id>`: remove workpiece (preserve evidence bundle); refuse on open missions
- `--older-than 30d`: clean workpieces for closed/aborted missions where `closedAt`/`abortedAt` is older than threshold
- Register in `mission.module.ts` and `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** `mission.cleanup --mission <id>` removes workpiece; `--older-than 30d` cleans old closed/aborted missions; refuses on open missions

**Human review:** no

---

### Step 9. `sternsystem.sync` push-only (remove pull/both)

**Goal:** Remove `--direction pull` and `--direction both` from `sternsystem.sync`.

**Agent actions:**

- In `sternsystem-sync.ts`: remove `pull` and `both` from direction validation; remove pull/both logic blocks; update `SternsystemSyncData.direction` type to `"push"` only
- In `sternsystem.module.ts`: update command description and `direction` flag description
- Update error messages that reference `--direction pull`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** `sternsystem.sync --direction pull` throws error; `--direction push` works; default (no flag) works

**Human review:** no

---

### Step 10. `sternsystem.validate` Bordbuch-vs-git-log check

**Goal:** Detect external edits on the cache clone by comparing git log to Bordbuch reconcile entries.

**Agent actions:**

- In `sternsystem-validate.ts` (or create if not exists): add Bordbuch-vs-git-log consistency check
- Read Bordbuch `reconcile` entries — extract `preReconcileSha` and `commitSha` from metadata
- For each reconcile entry: `git rev-list preReconcileSha..commitSha` to enumerate expected commits
- Union all expected commit SHAs
- Read cache clone git log (all commits on current branch)
- If any commit SHA in git log is not in expected set → violation: `external-edit-detected`
- On violation: recommend demoting Sternsystem to `paused`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes

**Completion criterion:** External edit on cache clone detected; clean history (all commits from reconciles) passes

**Human review:** no

---

### Step 11. `surface.contract.validate` command

**Goal:** Implement the C-surface contract validation command.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/surface-contract.ts` with `runSurfaceContractValidate` handler
- Validate: route registry URLs match `url-schema.yaml`; JSON-LD output matches `jsonld-types.yaml`; sitemap XML matches `sitemap-shape.yaml`
- Register in `tools/kernel.config.ts`
- Add to `build.check` pipeline as blocking check

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run surface.contract.validate` passes on current site

**Completion criterion:** `surface.contract.validate` detects URL pattern mismatch; passes on conforming site

**Human review:** no

---

### Step 12. Behavior snapshot C-coverage and `release.prepare` C-surface regression

**Goal:** Extend behavior snapshots with C-coverage and block `release.prepare` on C-surface regression.

**Agent actions:**

- In `behavior-snapshot-commands.ts`: extend snapshot to capture URL list (all routes × all locales), JSON-LD per page (@type + property key set), sitemap structure
- In `release-commands.ts` `runReleasePrepare`: add C-surface regression check — compare current snapshot C-coverage against previous release; if C-surface differs and no `breaksC: true` RFC in release's RFC range → block with `C-surface-regression` violation

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** `release.prepare` blocks on C-surface regression without `breaksC: true` RFC; passes when C-surfaces are stable

**Human review:** no

---

### Step 13. Contract tests for external surfaces

**Goal:** Add test suite validating generated C-surfaces match declarative contract.

**Agent actions:**

- Create `packages/share/src/__tests__/external-surfaces/` test suite
- Test: generated URLs conform to `url-schema.yaml` patterns
- Test: generated JSON-LD conforms to `jsonld-types.yaml` type definitions
- Test: generated sitemap conforms to `sitemap-shape.yaml` shape
- Test: empty system (no content/routes) passes (no surfaces = no violations)
- Add to `ci.local.validate` pipeline

**Validation:**

- `pnpm --filter @gogol/share test` passes

**Completion criterion:** Contract tests pass on current site; empty-state test passes

**Human review:** no

---

### Step 14. Documentation updates

**Goal:** Update all documentation surfaces to reflect the new governance invariants and commands.

**Agent actions:**

- Update `AGENTS.md`: document edits-only-through-missions invariant, Layer C protection, `breaksC` field, `mission.git.commit` usage, `mission.preview`/`mission.cleanup`, push-only `sternsystem.sync`
- Update `packages/os/site-kernel-handoff/AGENTS.md`: update mission lifecycle rules, workpiece git, reconcile format-patch mechanism, abort preservation
- Update `docs/requirements.xml`: add edits-only-through-missions invariant
- Update `docs/verification-plan.xml`: add `surface.contract.validate` check
- Update `docs/COMMANDS.md`: add new commands, update changed commands
- Amend RFC-0472: add `amendedBy: [RFC-0480]` to frontmatter

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0480 --json` passes (V-19 warning resolved by RFC-0472 backreference)
- `pnpm exec werkstatt run rfc.validate RFC-0472 --json` passes

**Completion criterion:** All documentation surfaces updated; `rfc.validate` clean on both RFC-0480 and RFC-0472

**Human review:** yes — Compass XML changes (`docs/requirements.xml`, `docs/verification-plan.xml`) require architecture review

---

### Step 15. Final validation and evidence

**Goal:** Run full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0480 --json`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/ontology build:check`
- Run `pnpm --filter @gogol/forge build:check`
- Run `pnpm --filter @gogol/share test`
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0480` (if acceptance probes declared)

**Validation:**

- All commands pass

**Completion criterion:** All validation commands pass; verification evidence committed

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0480 --json`
- `pnpm exec werkstatt run rfc.validate RFC-0472 --json` (amendedBy backreference)
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/forge build:check`
- `pnpm --filter @gogol/share test`
- `pnpm exec werkstatt run surface.contract.validate`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0480.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0480` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `git am` conflicts during reconcile | Step 5: `preReconcileSha` reset mechanism for idempotent re-run |
| Workpiece disk usage grows with many missions | Step 8: `mission.cleanup --older-than` automates cleanup |
| `mission.preview` dev server port conflicts | Step 7: `--port` flag with clear error on conflict |
| Operator bypasses edits-only-through-missions via direct git push | Step 10: `sternsystem.validate` Bordbuch-vs-git-log check detects external commits |
| Declarative C-contract becomes stale | Step 11: `surface.contract.validate` in `build.check` catches drift |
| `breaksC` field not declared when needed | Step 2: V-30 warning + Step 12: `release.prepare` blocks on C-surface regression |
| Behavior snapshot C-coverage false positive on locale additions | Step 12: snapshot diff reports additions as `added`, not `changed` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 (Sternsystem bundle contract) regarding workpiece git, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0480 --reason "..." --invariant "DNA-44"` instead of working around it.
- If the `git am` idempotency mechanism proves unworkable (e.g., cache clone history is rebased externally), escalate via `rfc.supersede.propose` with `--invariant "DNA-47"` — do not add a parallel transfer mechanism.
- If Layer C protection conflicts with existing behavior snapshot semantics (DNA-48), escalate rather than adding a dual-path snapshot system.
