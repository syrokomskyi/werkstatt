---
rfcId: RFC-0659
planId: PLAN-RFC-0659-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0659

## 1. Objectives

- [ ] O1 — Add `MaterializationCacheState` interface and `ArtifactCacheFields` to `MissionMaterializeData` — maps to acceptance criterion "MaterializationCacheState interface defined" and "JSON output includes artifactCacheHit, artifactCacheKey, artifactCacheSkipped"
- [ ] O2 — Compute cache key as `byteHash(cacheCloneHead + "|" + platformVersion + "|" + platformSemanticHash)` using existing primitives — maps to acceptance criterion "Cache key computed as byteHash(...)"
- [ ] O3 — On cache miss, write workpiece snapshot to `systems/<id>/.cache/materialization/<hash>/` after `build.prepare.dev` succeeds — maps to acceptance criterion "On cache miss, workpiece snapshot written"
- [ ] O4 — On cache hit, restore workpiece from cache via atomic staging + move, skipping codegen and build.prepare.dev — maps to acceptance criterion "On cache hit, workpiece restored from cache"
- [ ] O5 — Introduce `--force` flag (new) to bypass cache read; hardcoded `force: true` in `executeKernelPipeline` remains unchanged — maps to acceptance criterion "--force flag bypasses cache read"
- [ ] O6 — Delete previous cache entries on new write (keep only latest) — maps to acceptance criterion "Previous cache entry deleted"
- [ ] O7 — Add `.cache/` to cache clone `.gitignore` — maps to acceptance criterion ".cache/ added to cache clone's .gitignore"
- [ ] O8 — Write `.materialization-cache-state.json` separately from `.materialization-state.json` — maps to acceptance criterion ".materialization-cache-state.json written separately"
- [ ] O9 — Unit tests for cache hit, cache miss, `--force` bypass, and stale state file fallback — maps to 4 acceptance criteria for unit tests
- [ ] O10 — Update `AGENTS.md` for `site-kernel-handoff` with artifact cache documentation — maps to acceptance criterion "AGENTS.md updated"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — core implementation: `MaterializationCacheState` interface, `ArtifactCacheFields` added to `MissionMaterializeData`, cache key computation, cache read/write/restore logic, `--force` flag parsing
- `packages/os/site-kernel-handoff/src/build-pipeline-helpers.ts` — no changes needed (reuse `resolvePlatformSemanticHash`, `resolveCurrentEcosystem`, `byteHash` as-is)
- `packages/os/site-kernel-handoff/src/bundle-io.ts` — no changes needed (reuse `resolvePlatformSemanticHash`, `resolveCurrentEcosystem`)
- `packages/os/site-kernel-handoff/src/werkstatt/atomic.ts` — no changes needed (reuse `atomicMoveDir`, `atomicWriteFile`)

### 2.2 Configuration and data

- `systems/<id>/.cache/materialization/<hash>/` — new cache directory (gitignored)
- `systems/<id>/.materialization-cache-state.json` — new cache state file (committed to cache clone)
- `systems/<id>/.gitignore` — add `.cache/` entry

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add artifact cache documentation to Mission materialization section
- RFC file (`docs/rfcs/rfc-0659-*.md`) — read-only reference, no modifications during implementation

### 2.4 Validation and pipelines

- No new pipeline steps. The artifact cache is internal to `mission.materialize`.
- No CI workflow changes.
- `rfc.validate --id RFC-0659` must pass before stamping.

## 3. Step sequence

### Step 1. Add TypeScript contracts

**Goal:** Define `MaterializationCacheState` interface and extend `MissionMaterializeData` with `ArtifactCacheFields`.

**Agent actions:**

- Add `MaterializationCacheState` interface to `mission-materialize.ts` with fields: `systemId`, `cacheKey`, `cacheCloneHead`, `platformVersion`, `platformSemanticHash`, `writtenAt`
- Add `ArtifactCacheFields` (`artifactCacheHit: boolean`, `artifactCacheKey: string | null`, `artifactCacheSkipped: boolean`) to `MissionMaterializeData` interface
- Add `--force` flag parsing: `const force = flagBool(input, "force");` alongside existing `--report-only` and `--skip-preflight`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** `MissionMaterializeData` includes the three new fields; `MaterializationCacheState` interface is exported; `--force` flag is parsed.

**Human review:** no

---

### Step 2. Implement cache key computation

**Goal:** Compute the artifact cache key from `cacheCloneHead`, `platformVersion`, and `platformSemanticHash`.

**Agent actions:**

- Add a `computeArtifactCacheKey` helper function in `mission-materialize.ts`:
  ```ts
  async function computeArtifactCacheKey(
    workspaceRoot: string,
    cacheCloneHead: string,
  ): Promise<{ cacheKey: string; platformVersion: string; platformSemanticHash: string }> {
    const { version: platformVersion } = await resolveCurrentEcosystem(workspaceRoot);
    const platformSemanticHash = await resolvePlatformSemanticHash(workspaceRoot);
    const cacheKey = byteHash(`${cacheCloneHead}|${platformVersion}|${platformSemanticHash}`);
    return { cacheKey, platformVersion, platformSemanticHash };
  }
  ```
- Import `resolveCurrentEcosystem`, `resolvePlatformSemanticHash` from `../bundle-io.ts` and `byteHash` from `@warpgogol/fingerprint`
- Resolve `cacheCloneHead` via `git rev-parse HEAD` in the cache clone directory (same pattern as RFC-0597 preflight skip)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `computeArtifactCacheKey` returns a `sha256:`-prefixed hash combining all three input dimensions.

**Human review:** no

---

### Step 3. Implement cache read and restore (cache hit path)

**Goal:** On cache hit, restore the workpiece from the cached snapshot via atomic staging + move.

**Agent actions:**

- After `syncCacheClone` and `git clone` (steps 1-3 of existing flow), compute the cache key
- Read `.materialization-cache-state.json` from the cache clone directory
- If state file exists and `cacheKey` matches and `systems/<id>/.cache/materialization/<hash>/` exists:
  - Copy cached snapshot to staging dir (excluding `.git/` — the git clone already provides `.git/`)
  - `atomicMoveDir` staging → workpiece
  - Skip: data-path copy, media cache warming, `generateFullBoilerplate`, `build.prepare.dev`
  - Still run: `pnpm install`, `ensureChromium`, preflight gate (RFC-0597, independent), git commit, `compass.audit.baseline`
  - Set `artifactCacheHit: true`, `artifactCacheKey: <hash>`, `artifactCacheSkipped: false`
- If `--force` is set, skip cache read entirely and set `artifactCacheSkipped: true`
- If `--report-only` is set, do not read cache

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Cache hit path restores workpiece from cache directory, skips codegen, and still runs `pnpm install` + git commit + `compass.audit.baseline`.

**Human review:** no

---

### Step 4. Implement cache write (cache miss path)

**Goal:** After `build.prepare.dev` succeeds on cache miss, snapshot the workpiece to the cache directory and write the state file.

**Agent actions:**

- After `build.prepare.dev` completes successfully (existing flow), copy the workpiece directory (excluding `.git/` and `node_modules/`) to `systems/<id>/.cache/materialization/<hash>/`
- Delete any previous cache entries in `systems/<id>/.cache/materialization/` (keep only the latest)
- Write `.materialization-cache-state.json` to the cache clone directory with `systemId`, `cacheKey`, `cacheCloneHead`, `platformVersion`, `platformSemanticHash`, `writtenAt`
- Commit `.materialization-cache-state.json` to the cache clone (same pattern as `.materialization-state.json` in RFC-0597)
- Skip cache write when `--report-only` or `--force` is set (for `--force`, write a fresh cache entry after full materialization — `--force` refreshes the cache)
- Set `artifactCacheHit: false`, `artifactCacheKey: <hash>`, `artifactCacheSkipped: <true if --force>`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Cache miss path writes snapshot + state file, deletes previous entries, and commits state file to cache clone.

**Human review:** no

---

### Step 5. Add `.cache/` to cache clone `.gitignore`

**Goal:** Prevent `sternsystem.validate` from flagging the cache directory as untracked external edits.

**Agent actions:**

- During cache write (step 4), ensure `.gitignore` in the cache clone includes `.cache/`
- If `.gitignore` does not exist or does not contain `.cache/`, append `.cache/` to it
- Commit the `.gitignore` update to the cache clone alongside `.materialization-cache-state.json`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Cache clone `.gitignore` contains `.cache/` entry, committed to the cache clone.

**Human review:** no

---

### Step 6. Implement failure modes

**Goal:** Handle all failure modes specified in the RFC.

**Agent actions:**

- Cache directory missing despite state file match: fall through to full materialization, delete stale state file, log warning via `logger.warn`
- Cache directory corrupt or partially written: fall through to full materialization, delete stale cache directory and state file, log warning
- Cache restore I/O error: abort materialization with error, leave staging dir for inspection
- Platform semantic hash computation fails: fall through to full materialization (fail-safe)
- Cache clone HEAD cannot be resolved: fall through to full materialization (fail-safe)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** All failure modes fall through to full materialization (fail-safe) or abort with a descriptive error.

**Human review:** no

---

### Step 7. Update JSON output format

**Goal:** Include `artifactCacheHit`, `artifactCacheKey`, and `artifactCacheSkipped` in the `mission.materialize` JSON output.

**Agent actions:**

- Set the three fields in the return value of `runMissionMaterialize` for both cache hit and cache miss paths
- Update the `summary` string to include cache status (e.g. "materialized (artifact cache hit)" or "materialized (artifact cache miss)")

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** JSON output includes all three fields with correct values for both paths.

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Cover all four test scenarios from the acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/mission-materialize-artifact-cache.test.ts`
- Reuse `createMaterializeWorkspace` from `helpers/materialize-fixture.ts`
- Mock `executeKernelPipeline`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks` (same pattern as `mission-materialize-force-cache-bypass.test.ts`)
- Write minimal `package.json` with `{ "version": "1.0.0" }` in temp workspace (required by `resolveCurrentEcosystem`)
- Test 1: cache hit → `artifactCacheHit: true`, `executeKernelPipeline` not called for `build.prepare.dev`, cache directory contains workpiece snapshot
- Test 2: cache miss → full materialization, `artifactCacheHit: false`, cache written after `build.prepare.dev`, state file exists
- Test 3: `--force` → `artifactCacheSkipped: true`, full materialization runs, cache refreshed (new state file written)
- Test 4: state file exists but cache directory missing → fall through to full materialization, stale state file deleted

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run mission-materialize-artifact-cache`

**Completion criterion:** All 4 tests pass.

**Human review:** no

---

### Step 9. Update AGENTS.md

**Goal:** Document the artifact cache in the package-level agent guide.

**Agent actions:**

- Add a subsection to the Mission materialization section in `packages/os/site-kernel-handoff/AGENTS.md` describing:
  - The artifact cache mechanism (cache key, cache directory, state file)
  - The `--force` flag (new, bypasses cache only)
  - The separation from RFC-0597 preflight skip and RFC-0635 distribution reuse
  - The `.cache/` gitignore requirement
  - The cache hit path (which steps are skipped, which still run)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `AGENTS.md` includes artifact cache documentation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated with artifact cache documentation.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `mission.materialize` changed — check if manifest needs refresh).
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0659 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0659`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run mission-materialize-artifact-cache`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0659`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run mission-materialize-artifact-cache`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0659` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared in the RFC — `rfc.verification.emit` not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale cache after manual cache clone edit | Step 6 — fail-safe fallback to full materialization; `sternsystem.validate` detects dirty cache clones (existing) |
| Cache directory grows large | Step 4 — only latest cache entry kept; step 5 — `.cache/` gitignored |
| Agent misinterpretation | Step 9 — AGENTS.md documents cache key dimensions and `--force` escape hatch |
| Platform semantic hash computation cost | Step 2 — reuses existing `resolvePlatformSemanticHash` (~2-5s, amortized) |
| Cache restore I/O failure | Step 3 — atomic staging + move pattern; step 6 — abort with error on I/O failure |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-47, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0659 --reason "..." --invariant "DNA-47"` instead of working around it.
- If the cache key computation cannot reuse `resolvePlatformSemanticHash` due to a signature mismatch, stop and assess whether a new helper in `build-pipeline-helpers.ts` is needed (would require a separate RFC if it changes the public API).
