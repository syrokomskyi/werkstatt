---
rfcId: RFC-0596
planId: PLAN-RFC-0596-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0596

## 1. Objectives

- [ ] O1 — Extract lock-free `storeArtifactCore` helper from `runArtifactStorePut` — maps to acceptance criterion "storeArtifactCore is extracted"
- [ ] O2 — Call `storeArtifactCore` from `release.publish` before state transition — maps to "release.publish calls storeArtifactCore inline BEFORE transitioning"
- [ ] O3 — Fix `systemId` derivation bug (`releaseId.split("-m")` → release manifest's `systemId`) — maps to "Existing systemId derivation bug is fixed"
- [ ] O4 — Extend `ReleasePublishData` with `distArtifactHash` field — maps to "release.publish --json output includes artifactUri and distArtifactHash"
- [ ] O5 — Extend `release.validate` to check artifact field for published releases — maps to "release.validate checks that published releases have a non-null artifact field"
- [ ] O6 — Update `packages/os/site-kernel-handoff/AGENTS.md` — maps to "AGENTS.md updated with the automatic artifact storage behavior"
- [ ] O7 — Unit tests covering all failure modes and idempotency — maps to "Unit tests cover: publish stores artifact before transition, ..."

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts` — extract `storeArtifactCore` from `runArtifactStorePut`; fix `systemId` derivation; `runArtifactStorePut` becomes a thin wrapper that acquires lock then calls `storeArtifactCore`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleasePublish` calls `storeArtifactCore` before state transition; `ReleasePublishData` extended with `distArtifactHash`; `runReleaseValidate` checks `artifact` field for published releases
- `packages/os/site-kernel-handoff/src/artifact-store/index.ts` — export `storeArtifactCore` if not already exported

### 2.2 Configuration and data

- `releases/<releaseId>/release.yaml` — `artifact` and `distArtifactHash` fields populated before state transition (runtime change, no schema file change)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add bullet about automatic artifact storage in `release.publish`
- RFC file (read-only reference): `docs/rfcs/rfc-0596-*.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0596`

## 3. Step sequence

### Step 1. Extract `storeArtifactCore` and fix `systemId` derivation

**Goal:** Refactor `artifact-store-commands.ts` to separate lock-free core logic from lock management, and fix the existing `systemId` derivation bug.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts`:
  - Extract the core logic from `runArtifactStorePut` (lines 113-196: hash dir, create tar.gz, compute `distArtifactHash`, move to content-addressed path, idempotent manifest cleanup, write manifest) into a new exported function `storeArtifactCore(workspaceRoot, releaseId, distDir, sitePath?)`.
  - `storeArtifactCore` returns `{ uri, distArtifactHash, distTreeHash, siteContentHash, archivePath, byteSize, fileCount, createdAt }` — same fields as `ArtifactStorePutData` minus `releaseId` and `systemId` (which the caller already knows).
  - `runArtifactStorePut` becomes: validate flags → resolve distDir → acquire lock → call `storeArtifactCore` → release lock → return result.
  - Fix `systemId` derivation: change `releaseId.split("-m")[0]` to accept `systemId` as a parameter. `storeArtifactCore` signature: `storeArtifactCore(workspaceRoot, releaseId, distDir, systemId, sitePath?)`. `runArtifactStorePut` derives `systemId` from the release manifest (read `releases/<releaseId>/release.yaml`) instead of parsing the release ID. If the manifest is not found, fall back to `releaseId.split("-r")[0]`.
  - Export `storeArtifactCore` from the artifact-store barrel (`index.ts`).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — compiles without errors
- `pnpm --filter @warpgogol/site-kernel-handoff test` — existing tests still pass

**Completion criterion:** `storeArtifactCore` is exported, `runArtifactStorePut` delegates to it, `systemId` is derived from the release manifest (not `releaseId.split("-m")`), and `build:check` passes.

**Human review:** no

---

### Step 2. Modify `runReleasePublish` to call `storeArtifactCore` before state transition

**Goal:** `release.publish` stores the dist artifact before transitioning to `published`, eliminating the partial failure window.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`:
  - Import `storeArtifactCore` from `../artifact-store/artifact-store-commands.ts` (or the barrel).
  - Inside the `try` block of `runReleasePublish`, after all validation gates pass and after lock acquisition, but BEFORE the state transition:
    - Call `storeArtifactCore(workspaceRoot, releaseId, path.join(releaseDir, "dist"), manifest.systemId as string)`.
    - Set `manifest.artifact = artifactResult.uri`.
    - Set `manifest.distArtifactHash = artifactResult.distArtifactHash`.
    - Set `manifest.state = "published"`.
    - Set `manifest.publishedAt = now`.
    - Write all fields in a single `writeReleaseYaml(workspaceRoot, releaseId, manifest)` call — atomically transitions to published with artifact fields populated. No intermediate state where artifact is written but state is still prepared.
  - Update the return value: set `artifactUri: manifest.artifact ?? null` (already present) and add `distArtifactHash: manifest.distArtifactHash ?? null`.
  - Add `distArtifactHash: string | null` to the `ReleasePublishData` interface.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** `release.publish` calls `storeArtifactCore` before the state transition; `release.yaml` has `artifact` and `distArtifactHash` populated before `state: published`; `ReleasePublishData` includes `distArtifactHash`; `build:check` passes.

**Human review:** no

---

### Step 3. Extend `release.validate` to check artifact field for published releases

**Goal:** A published release without an artifact is invalid — `release.validate` enforces this.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`, in `runReleaseValidate`:
  - After reading the manifest, if `manifest.state === "published"` and `manifest.artifact` is null or undefined, set `artifactPresent` to `false` and add a log warning: `[release.validate] published release '${releaseId}' has no artifact — run release.publish to store it`.
  - The existing `artifactPresent` check (`existsSync(distDir) || manifest.artifact !== null`) remains for `prepared` releases. For `published` releases, require `manifest.artifact` to be non-null.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** `release.validate` reports `artifactPresent: false` for published releases with null `artifact` field; `build:check` passes.

**Human review:** no

---

### Step 4. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the automatic artifact storage behavior.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, in the Leitstand section (which already documents `artifact.store.put`), add a bullet:
  - `release.publish` automatically stores the dist artifact via `storeArtifactCore` (lock-free helper extracted from `runArtifactStorePut`) before transitioning the release to `published`. The standalone `artifact.store.put` command remains available for manual use. `storeArtifactCore` is called directly (not `runArtifactStorePut`) to avoid lock conflict — `release.publish` already holds `release:${releaseId}`.

**Validation:**

- Visual inspection — the bullet is in the correct section.

**Completion criterion:** `packages/os/site-kernel-handoff/AGENTS.md` has a bullet documenting automatic artifact storage in `release.publish`.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover all failure modes and idempotency scenarios from the acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/release-0596-artifact-storage.test.ts` following the pattern in `release-0585-dist-guard.test.ts`:
  - **Test: publish stores artifact before transition** — set up a prepared release with dist directory, run `release.publish`, verify `release.yaml` has `artifact` and `distArtifactHash` set AND `state: published`, verify artifact manifest exists in `.werkstatt/artifacts/`.
  - **Test: publish fails on missing dist (remains prepared)** — set up a prepared release without dist directory, run `release.publish`, verify it throws and state remains `prepared`.
  - **Test: artifact storage failure leaves release prepared** — mock `storeArtifactCore` to throw, verify `release.publish` throws and state remains `prepared` (no partial failure).
  - **Test: re-publish is idempotent** — run `release.publish` twice on the same prepared release (reset state between runs), verify both succeed and artifact manifest is overwritten.
  - **Test: lock-free helper does not deadlock** — verify `storeArtifactCore` does not acquire any locks (check no lock files created for `release:` scope).
  - **Test: systemId derivation uses release manifest** — verify the artifact manifest's `systemId` matches the release manifest's `systemId`, not the release ID.
  - **Test: release.validate flags published release without artifact** — set up a published release with null `artifact`, run `release.validate`, verify `artifactPresent: false`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All 7 tests pass; `pnpm --filter @warpgogol/site-kernel-handoff test` is green.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 4).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `release.publish` behavior changed — check if manifest needs update).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0596 against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0596 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0596`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0596`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0596` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Lock conflict (non-reentrant lock) | Step 1 extracts lock-free `storeArtifactCore`; Step 2 calls it directly, not `runArtifactStorePut` |
| Partial failure (published but no artifact) | Step 2 stores artifact BEFORE state transition; if storage fails, release remains `prepared` |
| Orphaned artifacts (transition fails after storage) | Step 5 test verifies idempotency; `artifact.store.gc` handles cleanup |
| Existing `systemId` derivation bug | Step 1 fixes `releaseId.split("-m")` → use release manifest's `systemId` |
| Agent confusion (manual `artifact.store.put` before publish) | Step 4 documents that this is harmless (idempotent) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-52, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0596 --reason "..." --invariant "DNA-48"` instead of working around it.
- If `storeArtifactCore` extraction reveals additional lock-related side effects not identified in the audit, stop and document the finding before proceeding.
