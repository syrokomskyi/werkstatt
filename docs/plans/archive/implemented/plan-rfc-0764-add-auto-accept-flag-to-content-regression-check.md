---
rfcId: RFC-0764
planId: PLAN-RFC-0764-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0764

## 1. Objectives

- [ ] O1 — `content.regression.check --auto-accept` passes when drift is detected and updates the golden baseline (maps to acceptance: "check --auto-accept passes when drift is detected" + "Golden baseline is updated on auto-accept")
- [ ] O2 — Review manifest (`review.yaml`) generated with all decisions set to `accept` on auto-accept (maps to acceptance: "Review manifest is generated with all decisions set to accept")
- [ ] O3 — `apply-result.json` written on auto-accept to satisfy `mission.close` CREG-05 (maps to acceptance: "apply-result.json written on auto-accept")
- [ ] O4 — `mission.validate --auto-accept-regression` propagates the flag to the `build.check` pipeline (maps to acceptance: "mission.validate --auto-accept-regression propagates the flag")
- [ ] O5 — Default behavior (without flag) is unchanged — still fails on drift (maps to acceptance: "Default behavior is unchanged")
- [ ] O6 — CREG-06 diagnostic rule registered (maps to acceptance: "CREG-06 diagnostic rule registered")
- [ ] O7 — Unit tests cover auto-accept pass, audit trail generation, and default fail-on-drift (maps to acceptance: 3 unit test criteria)

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/os/site-kernel-checks/src/content-regression.ts` | Add `--auto-accept` flag handling to `runContentRegressionCheck`: when flag is set and drift detected, update golden snapshot, write `review.yaml` with all-accept decisions, write `apply-result.json`. Add CREG-06 error on write failure. |
| `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` | Add `auto-accept` boolean flag to `content.regression.check` command registration. Set `cacheable: false` on the command to prevent stale cached results when `--auto-accept` mutates the golden baseline. |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Register CREG-06 diagnostic rule |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Add `--auto-accept-regression` flag to `runMissionValidate`, propagate to `build.check` pipeline via `flags` (same pattern as `--skip-content-regression` at line 379-385) |
| `packages/os/site-kernel-checks/src/tests/content-regression.test.ts` | Add unit tests for auto-accept path, audit trail generation, default behavior |

### 2.2 Configuration and data

No configuration files or data schemas need changes. The flag is purely CLI-driven.

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `packages/os/site-kernel-checks/AGENTS.md` | Update `src/content-regression.ts` module description to mention RFC-0764 `--auto-accept` flag and CREG-06 |

No `docs/*.xml` Compass files need updates — this is a command-level change, not a structural or requirements change. No `docs/architecture-dna.md` changes — the RFC `satisfies: []` and doesn't introduce a new DNA invariant.

### 2.4 Validation and pipelines

- `content.regression.check` is in `SITES_BUILD_CHECK_PIPELINE` — no pipeline topology change needed
- `mission.validate` calls `executeKernelPipeline` with `build.check` — flag propagation follows the existing `--skip-content-regression` pattern
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Register CREG-06 diagnostic rule

**Goal:** Add the CREG-06 diagnostic rule to the core-infra rules table.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`
- Add a new entry after CREG-05:
  ```ts
  "CREG-06": rule(
    "CREG-06",
    "Auto-accept write error — golden baseline update failed during --auto-accept",
    "content.regression.check",
  ),
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** CREG-06 rule exists in `core-infra.ts` and the package builds.

**Human review:** no

---

### Step 2. Add `--auto-accept` flag to command registration

**Goal:** Register the `--auto-accept` boolean flag on the `content.regression.check` command entry.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/command-tables/build-infra.ts`
- Find the `content.regression.check` entry (around line 160)
- Add `cacheable: false` to the command entry — with `--auto-accept`, the command mutates the golden baseline. The kernel cache only stores `ok: true` results, so an auto-accepted pass result would be cached. On the next run with the same content, the golden baseline has already been updated (no drift), but the cache would return the stale first-run result (`autoAccepted: N` instead of `autoAccepted: 0`). Setting `cacheable: false` prevents this. The performance impact on the default path is minimal — the command reads content files and builds snapshots, which is not expensive relative to other pipeline steps.
- Add after the `skip-content-regression` flag:
  ```ts
  "auto-accept": {
    kind: "boolean",
    description:
      "RFC-0764: auto-accept all detected content drift, update golden baseline directly, " +
      "and pass. Generates review.yaml (audit trail) and apply-result.json. " +
      "Default behavior (fail on drift) is unchanged without this flag.",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `auto-accept` flag appears in the command table and the package builds.

**Human review:** no

---

### Step 3. Implement `--auto-accept` logic in `runContentRegressionCheck`

**Goal:** When `--auto-accept` is set and drift is detected, update the golden baseline, write `review.yaml` with all-accept decisions, and write `apply-result.json`.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/content-regression.ts`
- In `runContentRegressionCheck` (line 429), after the diff is computed (line 507-508):
  1. Check `flagBool(input, "auto-accept")`
  2. If `autoAccept` is true AND drift exists (diff has addedRoutes, removedRoutes, or changedRoutes): a. Resolve mission ID via `resolveMissionId(workspaceRoot, systemId)` (existing function at line 619) b. Build review changes via `buildReviewChanges(diff, currentSnapshot, goldenSnapshot)` (existing function) c. Set all non-removed-route changes to `decision: "accept"` (same pattern as RFC-0748 in `runContentRegressionReviewGenerate` at lines 905-912) d. Write `review.yaml` to `missions/{missionId}/evidence/content-regression/review.yaml` (reuse `reviewToYaml` + `writeFileIfChanged`) e. Update golden snapshot: write `currentSnapshot` to `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` (reuse `snapshotToYaml` + `writeFileIfChanged`) f. Write `apply-result.json` to `missions/{missionId}/evidence/content-regression/apply-result.json` with shape `{ accepted: N, rejected: 0, fixed: 0, pending: 0, goldenUpdated: true, errors: [], autoAccepted: true }` g. Return `passResult` with summary including `autoAccepted: N`
  3. If `autoAccept` is true AND no drift: return `passResult` with `autoAccepted: 0` (no files written)
  4. If `autoAccept` is false: existing behavior (return diagnostics)
- Wrap golden snapshot write in try/catch — on failure, return `diagnosticsResult` with CREG-06 error
- Update the `CheckResult` data to include `autoAccepted` count and `reviewManifestPath` when auto-accept is used

**Key implementation details:**

- The `resolveMissionId` function already exists (line 619) and is used by `runContentRegressionReviewGenerate`
- The `buildReviewChanges` function already exists and is used by `runContentRegressionReviewGenerate`
- The `reviewToYaml` function already exists
- The `snapshotToYaml` function already exists
- The `writeFileIfChanged` function is already imported
- For standalone mode (no mission context): if `resolveMissionId` returns null, write `review.yaml` and `apply-result.json` to `{cacheClonePath}/.cache/content-regression/` instead. The golden baseline is still updated.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests still pass

**Completion criterion:** `runContentRegressionCheck` handles `--auto-accept` flag, writes golden snapshot + review.yaml + apply-result.json on drift, and returns pass result. Default behavior (without flag) is unchanged.

**Human review:** no

---

### Step 4. Add `--auto-accept-regression` flag to `mission.validate`

**Goal:** Propagate the `--auto-accept-regression` flag from `mission.validate` to the `build.check` pipeline.

**Agent actions:**

- Open `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`
- Find the `runMissionValidate` function, near line 379 where `skipContentRegression` is handled
- Add `autoAcceptRegression` flag handling alongside the existing `skipContentRegression` pattern:
  ```ts
  const skipContentRegression = input.flags["skip-content-regression"] === true;
  const autoAcceptRegression = input.flags["auto-accept-regression"] === true;
  const pipelineFlags: Record<string, boolean> = {};
  if (skipContentRegression) pipelineFlags["skip-content-regression"] = true;
  if (autoAcceptRegression) pipelineFlags["auto-accept"] = true;
  const pipelineResult = await executeKernelPipeline({
    workspaceRoot,
    pipelineName: "build.check",
    siteName: manifest.systemId,
    outputFormat: "pretty",
    ...(Object.keys(pipelineFlags).length > 0 ? { flags: pipelineFlags } : {}),
  });
  ```
- This replaces the existing conditional spread at lines 379-385

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — existing tests still pass

**Completion criterion:** `mission.validate --auto-accept-regression` propagates `auto-accept: true` to the `build.check` pipeline. Existing `--skip-content-regression` behavior is preserved.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Add unit tests covering the auto-accept path, audit trail generation, and default fail-on-drift behavior.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/tests/content-regression.test.ts`
- Add test: "auto-accept passes when drift is detected"
  - Set up golden snapshot with different content from current
  - Run `runContentRegressionCheck` with `auto-accept: true` flag
  - Assert: result is `passResult` (not diagnostics), `autoAccepted > 0`
  - Assert: golden snapshot file was updated to match current
- Add test: "auto-accept generates audit trail manifest"
  - Same setup as above
  - Assert: `review.yaml` exists with all decisions set to `accept`
  - Assert: `apply-result.json` exists with `pending: 0`, `errors: []`, `goldenUpdated: true`, `autoAccepted: true`
- Add test: "auto-accept without drift is a no-op"
  - Set up golden snapshot matching current
  - Run with `auto-accept: true`
  - Assert: result is pass, `autoAccepted: 0`, no files written
- Add test: "default behavior still fails on drift"
  - Set up golden snapshot with different content
  - Run without `auto-accept` flag
  - Assert: result has CREG-01 diagnostics (existing behavior preserved)
- Add test: "auto-accept write failure emits CREG-06"
  - Mock/simulate write failure (e.g. read-only filesystem)
  - Run with `auto-accept: true`
  - Assert: result has CREG-06 diagnostic

**Test fixture notes:**

- Follow existing test patterns in `content-regression.test.ts`
- Use temp directories for cache clone paths
- Write minimal `package.json` to temp dirs (per `computeBuildInputHash` requirement — see memory)
- Check `result.summary` for pass/fail, not `result.exitCode` (per `runMissionValidate` test pattern — see memory)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run content-regression` — all tests pass

**Completion criterion:** All 5 new tests pass alongside existing tests. Tests cover: auto-accept with drift, audit trail generation, auto-accept without drift, default fail-on-drift, CREG-06 write failure.

**Human review:** no

---

### Step 6. Update AGENTS.md

**Goal:** Update the `site-kernel-checks` package AGENTS.md to mention RFC-0764.

**Agent actions:**

- Open `packages/os/site-kernel-checks/AGENTS.md`
- Find the `src/content-regression.ts` row in the module table
- Append to the description: `RFC-0764: --auto-accept flag on content.regression.check auto-accepts all drift, updates golden baseline directly, writes review.yaml (audit trail) and apply-result.json. CREG-06 auto-accept write error.`

**Validation:**

- Visual inspection — description is accurate

**Completion criterion:** AGENTS.md updated with RFC-0764 mention in `content-regression.ts` row.

**Human review:** no

---

### Step 7. Final Step — Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` is updated (Step 6)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (the `--auto-accept` flag is a new flag on an existing command — check if the ecosystem manifest tracks flags)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0764 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The SHA is the last commit containing the implementation code changes.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0764`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0764`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0764` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operators auto-accept unintended changes | Step 3 writes `review.yaml` audit trail — operators can review after the fact |
| False sense of safety | Step 2 — flag name is `--auto-accept`, explicitly clear |
| Audit trail gap | Step 3 — `review.yaml` and `apply-result.json` are always written on auto-accept with drift |
| Production use | No technical guard — consistent with `--skip-content-regression`. Leitstand pipeline does not pass the flag. Discipline-only. |
| Pipeline step mutation | Step 3 — mutation is opt-in, only writes to cache clone, never to workpiece git repo. Default behavior is read-only. |
| mission.close CREG-05 interaction | Step 3 — `apply-result.json` with `pending: 0` and no errors satisfies the existing CREG-05 check in `mission-close.ts` (line 646) without changes to enforcement logic |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-61 or DNA-63, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0764 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `apply-result.json` written by `content.regression.check --auto-accept` does not satisfy the CREG-05 check in `mission.close` (e.g. field shape mismatch), do not modify `mission.close` — instead update the `apply-result.json` shape in Step 3 to match what `mission.close` expects (`{ pending: 0, errors: [] }`).
