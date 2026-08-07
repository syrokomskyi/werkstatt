---
rfcId: RFC-0732
planId: PLAN-RFC-0732-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/verification-plan.xml
    - docs/development-plan.xml
    - packages/os/site-kernel-checks/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0732

## 1. Objectives

- [ ] O1 — Create `content.regression.check` command that snapshots resolved page content and diffs against golden baseline — maps to acceptance criteria 1, 3, 5, 6, 9
- [ ] O2 — Create `content.regression.snapshot.update` command with `--confirm` flag — maps to acceptance criteria 2
- [ ] O3 — Register CREG-01, CREG-02, CREG-03 diagnostic rules — maps to acceptance criterion 4
- [ ] O4 — Integrate gate into `mission.validate` with `--skip-content-regression` escape hatch — maps to acceptance criterion 8
- [ ] O5 — Add golden snapshot copy to `mission.close` — maps to acceptance criterion 7
- [ ] O6 — Synchronize documentation (DNA-61, Compass XML, AGENTS.md) — maps to acceptance criterion 10
- [ ] O7 — Unit tests covering red/green/cold-start/route-mismatch scenarios — maps to acceptance criterion 11

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel/src/types.ts` — add `flags?: Record<string, unknown>` to `ExecuteKernelPipelineOptions`
- `packages/os/site-kernel/src/runtime/execute-pipeline.ts` — merge pipeline-level flags into step inputs
- `packages/os/site-kernel-checks/src/content-regression.ts` — **new file**: snapshot builder, diff logic, `runContentRegressionCheck`, `runContentRegressionSnapshotUpdate`
- `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` — register `content.regression.check` and `content.regression.snapshot.update` commands
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — add `{ command: "content.regression.check" }` after `generated.drift.validate`
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — register CREG-01, CREG-02, CREG-03
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — add `--skip-content-regression` flag to `runMissionValidate`, propagate to `executeKernelPipeline`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add golden snapshot copy step after `.cache/video/` copy

### 2.2 Configuration and data

- `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` — golden snapshot (runtime artifact, not committed)
- `{workpiecePath}/.cache/content-regression/current.snapshot.yaml` — working snapshot (runtime artifact, not committed)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-61 entry already exists (line 259-261), verify reference is correct
- `docs/verification-plan.xml` — add content regression gate verification entry
- `docs/development-plan.xml` — add `content.regression.check` and `content.regression.snapshot.update` commands
- `packages/os/site-kernel-checks/AGENTS.md` — add module entry for `content-regression.ts`
- `AGENTS.md` (root) — add gate boundary rule: CREG-01 vs DRIFT-01 vs SNAP-01

### 2.4 Validation and pipelines

- `SITES_BUILD_CHECK_PIPELINE` — new step `content.regression.check` after `generated.drift.validate`
- `mission.validate` — `--skip-content-regression` flag propagation
- `mission.close` — golden snapshot copy step

## 3. Step sequence

### Step 0. Add `flags` field to `ExecuteKernelPipelineOptions`

**Goal:** Enable pipeline-level flag passthrough so `mission.validate` can pass `--skip-content-regression` to the `content.regression.check` pipeline step.

**Agent actions:**

- In `packages/os/site-kernel/src/types.ts`, add `flags?: Record<string, unknown>` to `ExecuteKernelPipelineOptions` (line 416-429)
- In `packages/os/site-kernel/src/runtime/execute-pipeline.ts`, merge `options.flags` into each step's `KernelCommandInput.flags` when constructing step inputs. The merge should be additive — step-level flags from the pipeline definition take precedence over pipeline-level flags.
- Add a comment: `// RFC-0732: pipeline-level flags propagated to each step's KernelCommandInput.flags`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — typecheck passes
- `pnpm --filter @warpgogol/site-kernel run test` — existing tests still pass

**Completion criterion:** `ExecuteKernelPipelineOptions` has `flags?: Record<string, unknown>` field; pipeline executor merges it into step inputs

**Human review:** no

---

### Step 1. Create `content-regression.ts` — snapshot builder and validator

**Goal:** Implement the core content regression gate logic in a new file.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/content-regression.ts`
- Implement `ContentRegressionSnapshot`, `ContentRegressionRoute`, `ContentRegressionBlock`, `ContentRegressionFaqEntry`, `ContentRegressionDiff`, `ContentRegressionRouteDiff`, `ContentRegressionBlockDiff` interfaces per RFC TypeScript contracts
- Implement `runContentRegressionCheck(input, context)`:
  - Resolve site directory from `input.flags.site` or `context.site`
  - Resolve cache clone path via `resolveCacheClonePath(workspaceRoot, systemId)` (reuse pattern from `generated-files-validate.ts`)
  - Load golden snapshot from `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` (if exists)
  - Build current snapshot: call `loadSemanticSiteModel` for each supported language, extract resolved block content per route. **Field mapping note:** `SemanticBlock` uses `summary` (not `lead`) and `items: Array<{ title, description }>` (not `string[]`). The snapshot builder must map `summary` → `lead` and serialize `items` to stable strings for hashing. `SemanticFaqEntry` has `{ id, question, answer }` which maps directly.
  - Hash each route's content using `stableJsonHash` from `@warpgogol/fingerprint`
  - Compute `contentHash` as `byteHash` of all route hashes
  - Diff current vs golden: CREG-01 (content drift per route), CREG-02 (route set mismatch), CREG-03 (no golden snapshot)
  - Write working snapshot to `{workpiecePath}/.cache/content-regression/current.snapshot.yaml` using `writeFileIfChanged`
  - Return `diagnosticsResult("content.regression.check", diagnostics)`
- Implement `runContentRegressionSnapshotUpdate(input, context)`:
  - Build current snapshot (same as check)
  - Load golden snapshot (if exists)
  - Print diff to stdout (added/removed routes, changed blocks per route)
  - If `--confirm` flag is set: write current snapshot to `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` using `writeFileIfChanged` with `buildGeneratedHeader` YAML comment style
  - If `--confirm` is NOT set: print diff and exit 0 without writing
  - Return `passResult("content.regression.snapshot.update")`
- Use `byteHash` / `stableJsonHash` from `@warpgogol/fingerprint` for all hashing (DNA-53)
- Use `writeFileIfChanged` from `@warpgogol/site-kernel` for all file writes
- Use `buildGeneratedHeader` from `@warpgogol/site-kernel` for snapshot file header (YAML comment style for `.yaml` extension)
- Use `diagnosticsResult` from `./result-helpers.ts` for diagnostic output
- **Cache clone path resolution:** `resolveCacheClonePath` is private in `generated-files-validate.ts`. Extract it to a shared helper (e.g. `packages/os/site-kernel-checks/src/cache-clone-resolver.ts`) and import from both `generated-files-validate.ts` and `content-regression.ts`. Alternatively, duplicate the function (it's ~15 lines) if extraction would break exports.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `content-regression.ts` exists, typechecks, exports `runContentRegressionCheck` and `runContentRegressionSnapshotUpdate`

**Human review:** no

---

### Step 2. Register commands in `build-infra.ts`

**Goal:** Register the two new commands in the command table.

**Agent actions:**

- Add `content.regression.check` entry to `BUILD_INFRA_COMMANDS` in `packages/os/site-kernel-checks/src/command-tables/build-infra.ts`:
  - `scope: "app"`, `cacheable: false`, `supportsAllSites: true`
  - `flags: { site: { kind: "string", description: "..." }, "dry-run": { kind: "boolean", description: "..." } }`
  - `reads: ["<app>/src/content/**/*.md", "<app>/src/content/system.md"]`
  - `execute: runContentRegressionCheck`
- Add `content.regression.snapshot.update` entry:
  - `scope: "app"`, `cacheable: false`, `supportsAllSites: true`
  - `flags: { site: { kind: "string", description: "..." }, confirm: { kind: "boolean", description: "..." } }`
  - `execute: runContentRegressionSnapshotUpdate`
- Import `runContentRegressionCheck`, `runContentRegressionSnapshotUpdate` from `../content-regression.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Both commands registered in `BUILD_INFRA_COMMANDS` array

**Human review:** no

---

### Step 3. Add pipeline step and register diagnostics

**Goal:** Wire the command into the build check pipeline and register diagnostic rules.

**Agent actions:**

- Add `{ command: "content.regression.check" }` to `SITES_BUILD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-check.ts`, after `generated.drift.validate` (line 44)
- Add a comment: `// RFC-0732: content regression gate — resolved page content drift detection (DNA-61)`
- Register CREG-01, CREG-02, CREG-03 in `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`:
  - `CREG-01`: error, "Resolved content for a route differs from golden snapshot", `content.regression.check`
  - `CREG-02`: error, "Route set mismatch — route exists in current but not golden, or vice versa", `content.regression.check`
  - `CREG-03`: warning, "No golden snapshot found — cold start, first mission creates baseline", `content.regression.check`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests still pass

**Completion criterion:** Pipeline step added after `generated.drift.validate`; 3 diagnostic rules registered

**Human review:** no

---

### Step 4. Add `--skip-content-regression` flag to `mission.validate`

**Goal:** Enable operators to bypass the content regression gate during mission validation.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`, `runMissionValidate`:
  - Read `skipContentRegression` flag: `const skipContentRegression = flagBool(input, "skip-content-regression")`
  - When calling `executeKernelPipeline` for `build.check` (line 373), pass the skip flag via the new `flags` field added in Step 0: `flags: { "skip-content-regression": skipContentRegression }`
  - In `content-regression.ts` `runContentRegressionCheck`: check `input.flags["skip-content-regression"]` — if true, return `passResult("content.regression.check")` immediately without loading the semantic model
- Register the `--skip-content-regression` flag in the `mission.validate` command registration in `packages/os/site-kernel-handoff/src/mission/mission.module.ts` (or wherever the command flags are declared)
- Log `logger.info("  Content regression gate skipped via --skip-content-regression")` when the flag is set

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `--skip-content-regression` flag accepted by `mission.validate` and propagated to `content.regression.check` pipeline step

**Human review:** no

---

### Step 5. Add golden snapshot copy to `mission.close`

**Goal:** Copy the working snapshot to the cache clone as the new golden baseline on mission close.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-close.ts`, after the `.cache/video/` copy loop (line 598), add a new block:
  - Define `CONTENT_REGRESSION_CACHE_DIR = ".cache/content-regression"`
  - Read `manifest.systemId` to construct the golden snapshot filename: `{systemId}.snapshot.yaml`
  - Source: `{workpieceDir}/.cache/content-regression/current.snapshot.yaml`
  - Destination: `{systemDir}/.cache/content-regression/{systemId}.snapshot.yaml`
  - If source exists: `copyDirRecursive` or direct file copy (it's a single file, not a directory)
  - Wrap in try/catch with `logger.warn` on failure (non-fatal, same pattern as `.cache/video/`)
  - Log: `logger.info("  Copied content-regression snapshot from workpiece to cache clone")`
- Add `CONTENT_REGRESSION_CACHE_DIR` to the `MEDIA_CACHE_DIRS` pattern or create a separate copy block (separate is cleaner since it's a single file, not a directory tree)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `mission.close` copies `current.snapshot.yaml` to cache clone after `.cache/video/` copy

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Cover red/green/cold-start/route-mismatch scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/content-regression.test.ts`
- Test cases:
  1. **Green (no drift):** golden snapshot matches current → `status: "pass"`, 0 diagnostics
  2. **Red (content drift → CREG-01):** golden snapshot has different block text → `status: "fail"`, CREG-01 diagnostic with changedBlocks
  3. **Cold start (no golden → CREG-03):** no golden snapshot file → `status: "warn"`, CREG-03 warning, `exitCode: 0`
  4. **Route set mismatch (CREG-02):** current has route not in golden → `status: "fail"`, CREG-02 diagnostic
  5. **Skip flag:** `--skip-content-regression` set → `status: "pass"`, 0 diagnostics, no semantic model loaded
  6. **Snapshot update with `--confirm`:** writes golden snapshot file
  7. **Snapshot update without `--confirm`:** prints diff, does not write
- Mock `loadSemanticSiteModel` from `@warpgogol/site-kernel-content` — return synthetic `SemanticSiteModel` with routes and blocks
- Use temp directories for cache clone paths
- Write minimal `package.json` to temp dirs (per `computeBuildInputHash` pattern)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All 7 test cases pass

**Human review:** no

---

### Step 7. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add module entry for `content-regression.ts` in the module table
- Update root `AGENTS.md` — add a rule in the appropriate section clarifying the gate boundary: CREG-01 (content drift) vs DRIFT-01 (generated file drift) vs SNAP-01 (metadata drift)
- Update `docs/verification-plan.xml` — add content regression gate verification entry
- Update `docs/development-plan.xml` — add `content.regression.check` and `content.regression.snapshot.update` to the command development plan
- Verify `docs/architecture-dna.md` DNA-61 entry (line 259-261) already references RFC-0732 correctly
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Run `rfc.verification.emit`:** `pnpm exec site-kernel run rfc.verification.emit --id RFC-0732` and commit evidence file
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0732 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0732`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0732`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0732` (acceptance probes declared)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0732` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0732.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0732` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — N×L semantic model loads | Step 1: distribution reuse skips build cycle when `build-input-hash` matches; cost only paid on content changes |
| False positives — env-dependent content references | Step 1: `resolveReferencesDeep` is deterministic given same content ref index (generated in `build.prepare`) |
| Agent misinterpretation — CREG vs DRIFT vs SNAP | Step 7: root AGENTS.md rule clarifies gate boundaries; `fixHint` in each diagnostic names the command |
| Escape hatch abuse — routine `--skip-content-regression` | Step 4: flag is per-invocation, not persistent; Bordbuch audit entry recommended; `mission.close` always refreshes baseline |
| Snapshot staleness — unreviewed golden updates | Step 1: `--confirm` flag required for write; diff printed first |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58 or DNA-61, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0732 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `loadSemanticSiteModel` cannot provide resolved block content at the granularity required (e.g., blocks are already rendered to HTML, not structured data), escalate — the snapshot structure may need to hash rendered HTML instead of structured block fields.
- If `executeKernelPipeline` does not support flag passthrough to individual steps, escalate — the `--skip-content-regression` mechanism may need a different approach (e.g., environment variable or pipeline-level conditional).
