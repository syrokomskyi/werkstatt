---
rfcId: RFC-0587
planId: PLAN-RFC-0587-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0587

## 1. Objectives

- [ ] Objective 1 — `artifact.store.put` creates a tar.gz archive and stores `distArtifactHash` as the archive hash (maps to acceptance criterion: "creates a tar.gz archive")
- [ ] Objective 2 — `artifact.store.put` is idempotent: re-running for the same `releaseId` removes old manifests before writing the new one (maps to acceptance criterion: "idempotent")
- [ ] Objective 3 — `artifactStoreRehydrate` extracts the tar.gz archive to the output directory (maps to acceptance criterion: "extracts tar.gz")
- [ ] Objective 4 — `DeploymentAdapter` interface gains `getLimits(): DeploymentLimits` and `checkDistSize` uses adapter-declared limits via `runPreflight` pass-through (maps to acceptance criteria: "getLimits", "checkDistSize receives limits", "cloudflare-workers getLimits", "null adapter getLimits")
- [ ] Objective 5 — `filterEnv` and `sourceDotenv` are exported from `cloudflare-workers.ts` (maps to acceptance criteria: "filterEnv exported", "sourceDotenv exported")
- [ ] Objective 6 — `ArtifactStorePutData` retains `siteContentHash` alongside new `archivePath` (maps to acceptance criterion: "retains siteContentHash")
- [ ] Objective 7 — Verify six already-applied hotfixes are present in the codebase (maps to "Formalized hotfixes" acceptance criteria)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` — add `DeploymentLimits` interface, `getLimits()` method to `DeploymentAdapter`
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — export `filterEnv` and `sourceDotenv`, implement `getLimits()`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `adapter` parameter to `runPreflight`, pass `adapter.getLimits()` to `checkDistSize`, remove hardcoded limits from `checkDistSize`
- `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` — `runArtifactStorePut`: create tar.gz archive, compute archive hash, store `archivePath` in manifest, idempotent manifest removal; `artifactStoreRehydrate`: extract tar.gz instead of creating empty dir; retain `siteContentHash` in `ArtifactStorePutData`
- `packages/os/site-kernel-handoff/src/leitstand/adapters/index.ts` — re-export `filterEnv` and `sourceDotenv` if needed for cross-adapter reuse

### 2.2 Configuration and data

- No YAML/JSON config changes. The tar.gz archives are stored at `.werkstatt/artifacts/releases/sha256/<prefix>/<hash>.tar.gz` (runtime data, not config).

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section to document `getLimits()` on adapters, tar.gz archive creation in `artifact.store.put`, and `artifactStoreRehydrate` extraction behavior.
- RFC file (read-only reference): `docs/rfcs/rfc-0587-*.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — TypeScript strict build
- `pnpm --filter @warpgogol/site-kernel-handoff test` — Vitest unit tests
- `pnpm exec werkstatt run rfc.validate RFC-0587` — RFC mechanical validation

## 3. Step sequence

### Step 1. Add `DeploymentLimits` interface and `getLimits()` to `DeploymentAdapter`

**Goal:** Define the contract for adapter-declared size limits.

**Agent actions:**

- Add `DeploymentLimits` interface (`maxTotalSize: number`, `maxFileSize: number`) to `packages/os/site-kernel-handoff/src/leitstand/adapter.ts`
- Add `getLimits(): DeploymentLimits` method to the `DeploymentAdapter` interface
- Update the `CHANGE_SUMMARY` comment with `RFC-0587` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — confirms the interface compiles (existing adapters will fail until they implement `getLimits()`, which is expected; fix in Step 2)

**Completion criterion:** `DeploymentLimits` interface and `getLimits()` method exist in `adapter.ts`; TypeScript compiler sees the new contract.

**Human review:** no

---

### Step 2. Implement `getLimits()` in cloudflare-workers and null adapters

**Goal:** Provide concrete limit values for each adapter.

**Agent actions:**

- In `cloudflare-workers.ts`: add `getLimits()` returning `{ maxTotalSize: 20 * 1024 ** 3, maxFileSize: 25 * 1024 ** 2 }`
- In the null adapter (wherever it is defined in `leitstand-commands.ts` or a separate file): add `getLimits()` returning `{ maxTotalSize: Infinity, maxFileSize: Infinity }`
- Export `filterEnv` and `sourceDotenv` from `cloudflare-workers.ts` (add `export` keyword)
- Update `CHANGE_SUMMARY` comments with `RFC-0587` entries

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — all adapters now implement `getLimits()`

**Completion criterion:** `cloudflare-workers` adapter `getLimits()` returns 20 GiB / 25 MiB; null adapter returns `Infinity`; `filterEnv` and `sourceDotenv` are exported.

**Human review:** no

---

### Step 3. Wire adapter through `runPreflight` to `checkDistSize`

**Goal:** Replace hardcoded limits in `checkDistSize` with adapter-declared limits.

**Agent actions:**

- Add `adapter: DeploymentAdapter` parameter to `runPreflight` in `leitstand-commands.ts`
- In `runPreflight`, call `adapter.getLimits()` and pass the result to `checkDistSize`
- Change `checkDistSize` signature to accept `limits: DeploymentLimits` instead of using hardcoded constants
- Update the call site in `runLeitstandPropagate` (where the adapter is already resolved ~line 364) to pass the adapter to `runPreflight`
- Update `CHANGE_SUMMARY` comment with `RFC-0587` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — confirms the wiring compiles
- `pnpm --filter @warpgogol/site-kernel-handoff test` — existing tests pass

**Completion criterion:** `checkDistSize` has no hardcoded limit constants; limits come from `adapter.getLimits()` via `runPreflight` parameter.

**Human review:** no

---

### Step 4. Implement tar.gz archive creation in `artifact.store.put`

**Goal:** Create a durable tar.gz archive and use its hash as `distArtifactHash`.

**Agent actions:**

- In `runArtifactStorePut` (`artifact-store-commands.ts`): after computing `treeHash`, create a tar.gz archive of the dist directory using `node:tar` (or `node:zlib` + `node:tar`)
- Compute `sha256` of the tar.gz archive → this becomes `distArtifactHash`
- Store the archive at `.werkstatt/artifacts/releases/sha256/<prefix>/<archiveHash>.tar.gz`
- Add `archivePath` field to the manifest JSON
- Retain `siteContentHash` field in the manifest (do not remove it)
- Update `ArtifactStorePutData` type to include `archivePath: string` alongside existing `siteContentHash`
- Update `CHANGE_SUMMARY` comment with `RFC-0587` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** `artifact.store.put --json` output contains `archivePath`; `distArtifactHash` is the sha256 of the tar.gz archive, not the tree hash; `siteContentHash` is still present in the output.

**Human review:** no

---

### Step 5. Implement idempotent manifest storage

**Goal:** Ensure only one manifest exists per `releaseId` after multiple `put` runs.

**Agent actions:**

- In `runArtifactStorePut`: before writing the new manifest, scan for existing manifests matching the same `releaseId` (using `findArtifactManifest` or a similar scan) and remove them
- The old tar.gz archive is NOT removed (content-addressed — may be referenced by other releases)
- The existing lock at `artifact-store-commands.ts:102-108` (scope `release:${releaseId}`) already prevents concurrent puts — no lock changes needed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` — new unit test verifies idempotency (see Step 7)

**Completion criterion:** After multiple `artifact.store.put` runs for the same `releaseId` with different dist content, only one `.manifest.json` file exists for that release.

**Human review:** no

---

### Step 6. Update `artifactStoreRehydrate` to extract tar.gz

**Goal:** Enable restoration from the durable archive.

**Agent actions:**

- In `artifactStoreRehydrate` (`artifact-store-commands.ts:363-380`): replace the empty-directory creation with tar.gz extraction
- Read `archivePath` from the manifest, verify the archive exists, extract to the output directory using `node:tar`
- If the archive does not exist but the manifest is found, throw `archive not found for release <id>`
- Update `CHANGE_SUMMARY` comment with `RFC-0587` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test` — new unit test verifies extraction (see Step 7)

**Completion criterion:** `artifactStoreRehydrate` extracts files from the tar.gz archive to the output directory; throws on missing archive.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Verify all new behavior with automated tests.

**Agent actions:**

- Add test file `packages/os/site-kernel-handoff/src/tests/artifact-store.test.ts` (or extend existing tests):
  - Test: `artifact.store.put` creates a tar.gz archive and `distArtifactHash` matches archive hash
  - Test: `artifact.store.put` is idempotent — second run for same `releaseId` removes old manifest
  - Test: `artifactStoreRehydrate` extracts tar.gz contents to output directory
  - Test: `artifactStoreRehydrate` throws on missing archive
  - Test: `ArtifactStorePutData` retains `siteContentHash`
- Add tests to `packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts`:
  - Test: `getLimits()` returns `{ maxTotalSize: 20 * 1024 ** 3, maxFileSize: 25 * 1024 ** 2 }`
  - Test: `filterEnv` is exported and filters `undefined` values
  - Test: `sourceDotenv` is exported and skips comments/empty lines
- Add test for null adapter `getLimits()` returning `Infinity`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` — all new tests pass

**Completion criterion:** All new tests pass; tests cover tar.gz creation, idempotent put, rehydrate extraction, `getLimits()`, exported helpers.

**Human review:** no

---

### Step 8. Update `AGENTS.md` documentation

**Goal:** Document the new behavior in the handoff package guide.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section:
  - Document `getLimits()` on `DeploymentAdapter` interface
  - Document tar.gz archive creation in `artifact.store.put`
  - Document `artifactStoreRehydrate` extraction behavior
  - Document that `filterEnv` and `sourceDotenv` are exported from `cloudflare-workers.ts`

**Validation:**

- Visual review of `AGENTS.md` changes

**Completion criterion:** `AGENTS.md` reflects the new `getLimits()`, tar.gz archive, rehydrate extraction, and exported helpers.

**Human review:** no

---

### Step 9. Verify formalized hotfixes

**Goal:** Confirm the six already-applied hotfixes are present in the codebase.

**Agent actions:**

- Verify `checkWranglerAvailable` uses `npx --yes wrangler` with `nodeModulesBinPath` in `PATH` (evidence: `leitstand-commands.ts:231-232`)
- Verify `checkDistSize` uses 20 GiB total / 25 MiB per-file limits (evidence: `leitstand-commands.ts:257-258` — will be replaced by adapter limits in Step 3, but the values must match)
- Verify adapter uses `npx --yes wrangler deploy` from `distPath` (evidence: `cloudflare-workers.ts:155-163`)
- Verify adapter logs `stdout`/`stderr` on failure (evidence: `cloudflare-workers.ts:165-168`)
- Verify `filterEnv` filters `undefined` (evidence: `cloudflare-workers.ts:28-36`)
- Verify `sourceDotenv` skips comments/empty lines (evidence: `cloudflare-workers.ts:65-67`)
- Check off the "Formalized hotfixes" acceptance criteria in the RFC

**Validation:**

- `grep` or visual inspection of the cited line ranges

**Completion criterion:** All six hotfix verification criteria are checked off with inline evidence.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 8).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no new commands in this RFC, so likely not needed).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0587 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate RFC-0587`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0587`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0587` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0587.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0587` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| tar.gz archive disk space | Step 4 creates one archive per `put`; `artifact.store.gc` handles retention by age (existing command, no changes needed) |
| Idempotent put data loss | Step 5 operates within the existing `release:${releaseId}` lock scope (DNA-51); concurrent puts for the same release are already serialized |
| Adapter limits maintenance | Step 2 declares limits in one place (`getLimits()` per adapter); updating Cloudflare limits requires changing only `cloudflare-workers.ts` |
| Agent misinterpretation | Step 8 updates `AGENTS.md` to document idempotency and tar.gz archive behavior |
| npx network access | Not a new risk — hotfix already uses `npx --yes wrangler`; Step 9 verifies it |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-52, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0587 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `node:tar` is unavailable in the target Node.js version, escalate to the operator — do not shell out to `tar` command (cross-platform requirement).
