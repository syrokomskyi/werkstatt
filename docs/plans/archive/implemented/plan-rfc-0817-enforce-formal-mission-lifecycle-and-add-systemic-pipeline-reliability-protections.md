---
rfcId: RFC-0817
planId: PLAN-RFC-0817-01
status: draft
owner: architecture
createdAt: 2026-08-12
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
    - packages/werkstatt-site
  services: []
  docs:
    - AGENTS.md
    - .github/workflows/ci.yml
---

# Implementation Plan: RFC-0817

## 1. Objectives

- [ ] O1 — `mission.preview` auto-runs `mission.materialize` when `materializedAt === null` and mission state is `open` (maps to AC1, AC2)
- [ ] O2 — `executeKernelCommand` and `executePipelineForSite` auto-inject detects `--system=value` and `--site=value` format and does not double-inject (maps to AC3)
- [ ] O3 — `dns.record.upsert` returns exitCode 0 with skip summary when `dns-records.yaml` is absent (maps to AC4)
- [ ] O4 — CI workflow includes `ownership.generator.cross-check` (maps to AC5)
- [ ] O5 — Unit test validates `GENERATOR_OWNERSHIP_MAP` conditional entries behavior in `generated.files.validate` (maps to AC6)
- [ ] O6 — `AGENTS.md` updated with lifecycle enforcement rule (maps to AC7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/mission-preview.ts` — add materialization gate before `ensureDevCriticalFiles`
- `packages/werkstatt/src/kernel/runtime/execute-command.ts` — fix `--system` and `--site` injection guards (lines 402, 407)
- `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` — fix `--system` and `--site` injection guards (lines 755, 760)
- `packages/werkstatt/src/kernel/tests/system-injection.test.ts` — update test helpers to match new pattern matching
- `packages/werkstatt/src/dns/dns-record-upsert.ts` — replace throw with graceful skip result
- `packages/werkstatt-site/src/checks/tests/generated-files-validate.test.ts` — add conditional entries test

### 2.2 Configuration and data

- `.github/workflows/ci.yml` — add `ownership.generator.cross-check` step

### 2.3 Documentation and specs

- `AGENTS.md` — add lifecycle enforcement rule to mission lifecycle section
- `docs/rfcs/archive/implemented/rfc-0814-*.md` — already updated `amendedBy` during enhance

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0817` — must pass
- `pnpm --filter @warpgogol/werkstatt run build:check` — must pass
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- `pnpm test` — all tests including new conditional entries test must pass

## 3. Step sequence

### Step 1. Fix `--system` and `--site` pattern matching in CLI and pipeline paths

**Goal:** Replace `Array.includes()` guards with `some(a => a === "--flag" || a.startsWith("--flag="))` pattern in all 4 injection points.

**Agent actions:**

- Edit `packages/werkstatt/src/kernel/runtime/execute-command.ts`:
  - Line 402: `!wsArgv.includes("--site")` → `!wsArgv.some((a) => a === "--site" || a.startsWith("--site="))`
  - Line 407: `!wsArgv.includes("--system")` → `!wsArgv.some((a) => a === "--system" || a.startsWith("--system="))`
- Edit `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts`:
  - Line 755: `!stepArgs.includes("--site")` → `!stepArgs.some((a) => a === "--site" || a.startsWith("--site="))`
  - Line 760: `!stepArgs.includes("--system")` → `!stepArgs.some((a) => a === "--system" || a.startsWith("--system="))`
- Update test helpers in `packages/werkstatt/src/kernel/tests/system-injection.test.ts`:
  - `injectSystemCli` (line 73): `!wsArgv.includes("--system")` → same pattern
  - `injectSystemPipeline` (line 49): `!stepArgs.includes("--system")` → same pattern
  - Add test cases for `--system=value` and `--site=value` format (both should NOT double-inject)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test -- system-injection`

**Completion criterion:** All 4 production injection points use `some()` pattern matching; test helpers updated; new test cases verify `--flag=value` format is detected; `build:check` and tests pass.

**Human review:** no

---

### Step 2. `dns.record.upsert` graceful skip

**Goal:** Replace the throw on missing `dns-records.yaml` with a graceful skip result (exitCode 0).

**Agent actions:**

- Edit `packages/werkstatt/src/dns/dns-record-upsert.ts`:
  - Replace the `throw new Error(...)` at lines 72-76 with a skip result: return `KernelCommandResult` with `exitCode: 0`, `ok: true`, `data.summary` containing `"skipped — no dns-records.yaml"`, `data.results: []`
- Add or update unit test in `packages/werkstatt/src/dns/tests/` verifying:
  - When `dns-records.yaml` is absent, result has `exitCode: 0`, `ok: true`
  - Summary message contains "skipped"

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test -- dns-record-upsert`

**Completion criterion:** `dns.record.upsert` returns exitCode 0 with skip summary when `dns-records.yaml` is absent; unit test verifies this; `build:check` and tests pass.

**Human review:** no

---

### Step 3. `mission.preview` materialization gate

**Goal:** Add a materialization check before `ensureDevCriticalFiles` in `mission.preview`.

**Agent actions:**

- Edit `packages/werkstatt/src/mission/mission-preview.ts`:
  - After reading the mission manifest, check `materializedAt` field
  - If `materializedAt === null` AND mission state is `open` AND `--skip-prepare` is NOT set with a new `--skip-materialize` flag (or reuse existing logic), auto-run `mission.materialize` via `executeKernelCommand`
  - If materialize fails, throw with descriptive error message
  - If `--skip-prepare` is set, still enforce materialization (per RFC: `--skip-prepare` skips dev-critical file check, NOT materialization)
  - If mission state is not `open` (e.g. `closed`, `aborted`), skip the materialization check
- Add unit test verifying:
  - `materializedAt === null` + state `open` → materialize is called, dev server starts after
  - `materializedAt !== null` → materialize is NOT called
  - `materializedAt === null` + state `closed` → materialize is NOT called
  - Materialize fails → error thrown, dev server does not start

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test -- mission-preview`

**Completion criterion:** `mission.preview` auto-runs `mission.materialize` when `materializedAt === null` and state is `open`; `--skip-prepare` does NOT skip materialization; non-open missions skip the check; unit tests pass.

**Human review:** no

---

### Step 4. Add `ownership.generator.cross-check` to CI workflow

**Goal:** Add the existing `ownership.generator.cross-check` command to the CI workflow.

**Agent actions:**

- Edit `.github/workflows/ci.yml`:
  - Add a new step after "RFC command lifecycle validation" (line 61):
    ```yaml
    - name: Generator ownership cross-check
      run: pnpm exec werkstatt run ownership.generator.cross-check --json
    ```
  - This runs the existing workspace-scoped command without `--site` (discovers all systems)

**Validation:**

- `pnpm exec werkstatt run ownership.generator.cross-check --json` (local dry run)
- `actionlint -color` (workflow lint)

**Completion criterion:** CI workflow includes `ownership.generator.cross-check` step; local run passes; actionlint passes.

**Human review:** no

---

### Step 5. Add `GENERATOR_OWNERSHIP_MAP` conditional entries test

**Goal:** Add a unit test verifying `generated.files.validate` respects `conditional: true` entries.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/tests/generated-files-validate.test.ts`:
  - Add a new `describe` block "conditional entries (RFC-0817)"
  - Test 1 (conditional skip): Create a mock `GENERATOR_OWNERSHIP_MAP` entry with `conditional: true`, do NOT create the file on disk, run `runGeneratedFilesValidate`, assert NO `GEN-FILES-01` diagnostic for that entry
  - Test 2 (non-conditional error): Create a mock entry without `conditional`, do NOT create the file, run validator, assert `GEN-FILES-01` IS produced for that entry
  - Use `vi.mock` or inject a test-specific ownership map to isolate from the production map

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site test -- generated-files-validate`

**Completion criterion:** Test verifies conditional entries do NOT produce `GEN-FILES-01` when absent, and non-conditional entries DO produce `GEN-FILES-01` when absent; `build:check` and tests pass.

**Human review:** no

---

### Step 6. Update `AGENTS.md` with lifecycle enforcement rule

**Goal:** Document the `mission.preview` materialization enforcement rule.

**Agent actions:**

- Edit `AGENTS.md` at the repository root:
  - In the mission lifecycle section (or appropriate section), add a rule: "`mission.preview` enforces `mission.materialize` before starting the dev server. If `materializedAt === null` and the mission state is `open`, materialize is auto-run. `--skip-prepare` skips the dev-critical file check but NOT materialization. Non-open missions skip the materialization check."

**Validation:**

- `git diff AGENTS.md` shows the new rule

**Completion criterion:** `AGENTS.md` contains the lifecycle enforcement rule.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` is updated (Step 6).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands added, but `executeKernelCommand` and `executePipelineForSite` are listed in `commands.changed`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review`. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0817 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0817`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0817`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0817` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0817.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0817` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Performance: first `mission.preview` for unmaterialized mission is slow (~60s) | Step 3 — materialize is only run when `materializedAt === null`; subsequent calls are fast |
| False sense of safety: materialization does not guarantee `mission.validate` passes | Step 6 — AGENTS.md rule documents that dev server uses lighter pipeline |
| `dns.record.upsert` silent skip: systems that should have DNS records silently skip | Step 2 — skip summary is logged; `dns.records.schema.validate` can check for file presence if needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0817 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `mission.materialize` is found to be non-idempotent (partial failure corrupts workpiece), escalate to a new RFC for materialize atomicity before proceeding.
