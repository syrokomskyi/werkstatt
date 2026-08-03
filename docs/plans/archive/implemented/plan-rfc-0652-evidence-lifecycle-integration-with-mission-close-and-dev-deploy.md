---
rfcId: RFC-0652
planId: PLAN-RFC-0652-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts
---

# Implementation Plan: RFC-0652

## 1. Objectives

- [ ] Objective 1 — `mission.close` invokes `evidence.sync` as a mandatory step before writing `close-report.json` (maps to acceptance criteria 1-5)
- [ ] Objective 2 — `leitstand.dev-deploy` invokes `evidence.sync` after `axiom.report` as best-effort, non-blocking (maps to acceptance criteria 6-9)
- [ ] Objective 3 — `mission.cleanup` removes local Axiom evidence older than a configurable threshold in both `--mission` and `--older-than` modes (maps to acceptance criteria 10-15)
- [ ] Objective 4 — `--skip-evidence-sync` flag on `mission.close` appends Bordbuch entry for auditability (maps to acceptance criterion 3)
- [ ] Objective 5 — Documentation updated: AGENTS.md, package AGENTS.md, infra-contracts.ts (maps to acceptance criteria 16-18)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add `evidence.sync` invocation before `close-report.json`, `--skip-evidence-sync` flag, Bordbuch entry for skip, `evidenceSynced`/`evidenceSyncResult` output fields
- `packages/os/site-kernel-handoff/src/mission/mission-cleanup.ts` — replace unconditional evidence preservation with age-based cleanup, `--evidence-retention-days` flag, apply to both `--mission` and `--older-than` modes, `evidenceCleaned`/`evidenceRetentionDays` output fields
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `evidence.sync` invocation after `axiom.report` (line ~820), `--skip-evidence-sync` flag, `evidenceSynced`/`evidenceSyncError` output fields
- `packages/os/site-kernel-handoff/src/mission/mission.module.ts` — register `--skip-evidence-sync` flag on `mission.close`, `--evidence-retention-days` flag on `mission.cleanup`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — register `--skip-evidence-sync` flag on `leitstand.dev-deploy`

### 2.2 Configuration and data

- No YAML/JSON config changes. R2 credentials are environment variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) defined by RFC-0651.
- `mission.cleanup` `writes` array in module registration needs update to include `missions/{mission}/evidence/axiom/**`.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — document that `mission.close` mandates evidence sync and `--skip-evidence-sync` is an escape hatch
- `packages/os/site-kernel-handoff/AGENTS.md` — document evidence sync integration points in the Leitstand section and mission lifecycle section
- `packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts` — document `evidence.sync` invocations in `mission.close` and `leitstand.dev-deploy` writes

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0652`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Unit tests in `packages/os/site-kernel-handoff/src/tests/`
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Add TypeScript contracts and flag parsing

**Goal:** Define the new flag types and extend result interfaces with evidence sync fields.

**Agent actions:**

- In `mission-close.ts`: add `skipEvidenceSync` flag parsing via `flagBoolean(input, "skip-evidence-sync")`. Extend `MissionCloseData` interface with `evidenceSynced: boolean` and `evidenceSyncResult: { r2KeyPrefix: string; uploadedFiles: number } | null`.
- In `mission-cleanup.ts`: add `evidenceRetentionDays` flag parsing via `flagNumber(input, "evidence-retention-days")` (default 30). Extend `MissionCleanupData` interface with `evidenceCleaned: boolean` and `evidenceRetentionDays: number`.
- In `leitstand-commands.ts`: add `skipEvidenceSync` flag parsing. Extend `DevDeployResult` interface with `evidenceSynced: boolean` and `evidenceSyncError: string | null`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles with new types.

**Completion criterion:** New flag parsing and extended result interfaces compile without errors.

**Human review:** no

---

### Step 2. Implement evidence lifecycle integrations

**Goal:** Integrate `evidence.sync` into `mission.close` (mandatory) and `leitstand.dev-deploy` (best-effort), and add age-based evidence cleanup to `mission.cleanup`. These three integrations are independent and can be implemented in parallel.

**Agent actions:**

**2a. `mission.close` — mandatory evidence sync:**

- In `mission-close.ts`, before the `close-report.json` write (line ~363):
  - Check `skipEvidenceSync` flag. If true, log warning and append `mission-close-evidence-skipped` entry to Bordbuch via `bordbuch.append`.
  - If not skipped, check `existsSync(evidenceDir)` AND `existsSync(metadataPath)` for `evidence/axiom/evidence-metadata.json`.
  - If both exist: invoke `executeKernelCommand({ workspaceRoot, commandName: "evidence.sync", argv: [`--mission=${missionId}`] })` via dynamic import from `@warpgogol/site-kernel`.
  - On success: set `evidenceSynced = true`, extract `evidenceSyncResult` from sync result data.
  - On failure: throw `Error("EVIDENCE_SYNC_FAILED: ...")` — mission remains open.
  - If `evidence/axiom/` exists but `evidence-metadata.json` missing: log warning, skip sync (mission never ran `mission.check`).
  - If `evidence/axiom/` does not exist: skip sync silently (no evidence to archive).
- Populate `evidenceSynced` and `evidenceSyncResult` in the `closeReport` data object.
- Register `--skip-evidence-sync` flag in `mission.module.ts` for `mission.close`.

**2b. `leitstand.dev-deploy` — best-effort evidence sync:**

- In `leitstand-commands.ts`, after the `axiom.report` block (line ~820):
  - Check `skipEvidenceSync` flag. If true, skip silently.
  - If not skipped: invoke `executeKernelCommand({ workspaceRoot, commandName: "evidence.sync", argv: [`--mission=${missionId}`] })` via dynamic import.
  - On success: set `evidenceSynced = true`, `evidenceSyncError = null`.
  - On failure: set `evidenceSynced = false`, `evidenceSyncError = error.message`, log `logger.warn` (non-blocking).
- Populate `evidenceSynced` and `evidenceSyncError` in the `DevDeployResult` return object.
- Register `--skip-evidence-sync` flag in `leitstand.module.ts` for `leitstand.dev-deploy`.

**2c. `mission.cleanup` — age-based evidence cleanup:**

- In `mission-cleanup.ts`, `--mission` mode (line ~79):
  - Replace `skipped.push("evidence (preserved)")` with age-based cleanup logic.
  - Check `evidence/axiom/` directory existence.
  - If `retentionDays === 0`: skip with `"evidence (preserved — retention=0)"`.
  - If `evidence-metadata.json` exists: parse `runTimestamp`, compare against `cutoff = Date.now() - retentionDays * 24h`. If older: `rm` the `evidence/axiom/` directory, push to `cleaned`. If newer: skip with `"evidence (within retention period)"`.
  - If `evidence-metadata.json` missing: skip with `"evidence (no metadata — preserved)"`.
  - Non-Axiom evidence (`close-report.json`, `workpiece.git-bundle`) is always preserved — do not touch `evidence/` root, only `evidence/axiom/`.
- In `mission-cleanup.ts`, `--older-than` mode (line ~88):
  - After removing workpiece/distribution for each old mission, apply the same age-based evidence cleanup logic using `--evidence-retention-days` (default 30d).
  - `--older-than` determines which missions to clean; `--evidence-retention-days` determines which evidence within those missions to clean.
- Register `--evidence-retention-days` flag in `mission.module.ts` for `mission.cleanup`.
- Update `writes` array in module registration to include `missions/{mission}/evidence/axiom/**`.
- Populate `evidenceCleaned` and `evidenceRetentionDays` in the return data.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** All three command handlers implement their evidence lifecycle integration, new flags are registered in modules, and TypeScript compiles without errors.

**Human review:** no

---

### Step 3. Write unit tests

**Goal:** Create unit tests covering all acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/rfc-0652-mission-close-evidence-sync.test.ts`:
  - Test: `mission.close` invokes `evidence.sync` before `close-report.json` (mock `executeKernelCommand`).
  - Test: `mission.close` exits 1 with `EVIDENCE_SYNC_FAILED` when `evidence.sync` fails.
  - Test: `mission.close --skip-evidence-sync` skips sync, logs warning, appends Bordbuch entry.
  - Test: `mission.close` skips sync with warning when `evidence/axiom/` exists but `evidence-metadata.json` missing.
  - Test: `mission.close --json` includes `evidenceSynced` and `evidenceSyncResult` fields.
- Create `packages/os/site-kernel-handoff/src/tests/rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts`:
  - Test: `leitstand.dev-deploy` invokes `evidence.sync` after `axiom.report`.
  - Test: `leitstand.dev-deploy` does not fail when `evidence.sync` fails.
  - Test: `leitstand.dev-deploy --json` includes `evidenceSynced` and `evidenceSyncError` fields.
  - Test: `leitstand.dev-deploy --skip-evidence-sync` skips sync silently.
- Create `packages/os/site-kernel-handoff/src/tests/rfc-0652-mission-cleanup-evidence-retention.test.ts`:
  - Test: `mission.cleanup` removes evidence older than 30 days by default in `--mission` mode.
  - Test: `mission.cleanup --evidence-retention-days 7` removes evidence older than 7 days.
  - Test: `mission.cleanup --evidence-retention-days 0` preserves all evidence.
  - Test: `mission.cleanup` preserves evidence when `evidence-metadata.json` is missing.
  - Test: `mission.cleanup` preserves non-Axiom evidence (`close-report.json`, `workpiece.git-bundle`).
  - Test: `mission.cleanup --older-than <N>d` applies age-based evidence cleanup.
  - Test: `mission.cleanup --json` includes `evidenceCleaned` and `evidenceRetentionDays` fields.
- Mock `executeKernelCommand` from `@warpgogol/site-kernel` in all tests.
- Mock `bordbuch.append` for the Bordbuch entry test.
- Use mock filesystem (tmp directories) for cleanup tests.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` — all tests pass.

**Completion criterion:** All 16 test cases pass, covering every acceptance criterion.

**Human review:** no

---

### Step 4. Update documentation

**Goal:** Update AGENTS.md files and infra-contracts.ts with evidence sync integration points.

**Agent actions:**

- Update root `AGENTS.md`: add a rule under the mission lifecycle section that `mission.close` mandates `evidence.sync` and `--skip-evidence-sync` is an escape hatch for offline scenarios only.
- Update `packages/os/site-kernel-handoff/AGENTS.md`: document evidence sync integration in the Leitstand section (`leitstand.dev-deploy` auto-syncs after `axiom.report`) and mission lifecycle section (`mission.close` mandates sync, `mission.cleanup` cleans old evidence).
- Update `packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts`: document `evidence.sync` invocations in `mission.close` writes and `leitstand.dev-deploy` writes, and evidence cleanup in `mission.cleanup` writes.

**Validation:**

- `git diff` shows documentation changes in all three files.

**Completion criterion:** All three documentation files updated with evidence sync integration points.

**Human review:** no

---

### Step 5. Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new flags on existing commands).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0652 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0652`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0652`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0652` (if acceptance probes declared — none declared in this RFC)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0652` in the subject line (RFC-0265 commit hygiene)
- Unit test files in `packages/os/site-kernel-handoff/src/tests/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `mission.close` blocked by R2 outage | Step 2: `--skip-evidence-sync` escape hatch allows offline close |
| `mission.close` latency increase (~17s upload) | Step 2: sync skipped entirely if no Axiom evidence; operator warned via log |
| Upload time in `leitstand.dev-deploy` | Step 3: sync is non-blocking, deploy result available before sync starts |
| `mission.cleanup` deletes evidence too aggressively | Step 4: default 30-day retention; operator must explicitly set low value |
| Agent misinterpretation of `--skip-evidence-sync` | Step 6: AGENTS.md documents that `--skip-evidence-sync` is escape hatch only |
| Concurrent `evidence.sync` from dev-deploy and close | Step 2/3: R2 PutObject idempotent; duplicate Iceberg rows non-fatal (documented in RFC nonGoals) |
| Circular dependency | None — `evidence.sync` is a leaf command, does not invoke `mission.close` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, DNA-49, or DNA-59, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0652 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `evidence.sync` (RFC-0651) or `runTimestamp` (RFC-0650) are not yet implemented, stop — this RFC cannot be implemented without its dependencies.
