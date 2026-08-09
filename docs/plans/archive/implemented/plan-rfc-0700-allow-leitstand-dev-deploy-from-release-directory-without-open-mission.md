---
rfcId: RFC-0700
planId: PLAN-RFC-0700-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/command-manifest.generated.yaml
---

# Implementation Plan: RFC-0700

## 1. Objectives

- [ ] Obj 1 — Add `--release` flag to `leitstand.dev-deploy` command registration (maps to AC: `--release` flag accepted by command registration)
- [ ] Obj 2 — Implement release-path deployment logic in `runLeitstandDevDeploy` (maps to AC: deploys from `releases/<id>/dist/` without `currentMission`)
- [ ] Obj 3 — Preserve workpiece-path behavior unchanged (maps to AC: without `--release` behaves exactly as before)
- [ ] Obj 4 — Run CDN purge and health check in release path (maps to AC: CDN purge + health check run after release deploy)
- [ ] Obj 5 — Return correct `DevDeployResult` with `releaseDeployed`, `buildSkipped`, `axiom.status: "not-run"` (maps to AC: `--json` output includes release fields)
- [ ] Obj 6 — Unit tests for release path (maps to AC: unit test covers `--release` path)
- [ ] Obj 7 — Update `leitstand.module.ts` `reads` (maps to AC: `reads` includes `releases/{release}/**`)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy` handler, `DevDeployResult` interface
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — command registration (`reads`, `flags.release`)

### 2.2 Configuration and data

- `docs/command-manifest.generated.yaml` — regenerated via `command.manifest.generate`

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Leitstand section: document `--release` flag on `leitstand.dev-deploy`
- RFC file (read-only reference): `docs/rfcs/rfc-0700-allow-leitstand-dev-deploy-from-release-directory-without-open-mission.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run rfc.validate --id RFC-0700`
- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run --reporter=verbose` (leitstand-0700 tests)

## 3. Step sequence

### Step 1. Add `releaseDeployed` to `DevDeployResult` interface

**Goal:** Add the new optional field to the TypeScript interface.

**Agent actions:**

- In `leitstand-commands.ts:563-586`, add `releaseDeployed?: string;` to `DevDeployResult` interface (after `evidenceSyncError`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type check passes

**Completion criterion:** `DevDeployResult` interface includes `releaseDeployed?: string` field and build:check passes

**Human review:** no

---

### Step 2. Add `--release` flag to command registration in `leitstand.module.ts`

**Goal:** Register the new optional flag and update `reads`.

**Agent actions:**

- In `leitstand.module.ts`, add `release` flag to `leitstand.dev-deploy` registration:
  ```ts
  release: {
    kind: "string",
    description: "RFC-0700: Deploy an existing release to dev without open mission. When set, deploys from releases/<id>/dist/.",
  },
  ```
- Update `reads` to include `releases/{release}/**`:
  ```ts
  reads: ["systems/registry.yaml", "missions/{mission}/workpiece/**", "releases/{release}/**"],
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type check passes

**Completion criterion:** `leitstand.module.ts` registers `release` flag and `reads` includes `releases/{release}/**`

**Human review:** no

---

### Step 3. Implement release-path logic in `runLeitstandDevDeploy`

**Goal:** Add the `--release` branch to the handler that deploys from `releases/<id>/dist/` without requiring an open mission.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts:588`), read the `--release` flag via `flagString(input, "release")`
- After resolving `systemId` and verifying the registry entry exists, check if `releaseId` is set
- If `releaseId` is set:
  1. Log warning if `--force-build` is set: `[leitstand.dev-deploy] --force-build ignored because --release is set`
  2. Read `releases/<id>/release.yaml` via `readReleaseManifest` (already imported at line 52)
  3. Verify `releaseManifest.systemId === systemId` — mismatch returns `exitCode: 1` with `[leitstand.dev-deploy] release '<id>' does not belong to system '<system>'`
  4. Resolve dist path: `path.join(workspaceRoot, "releases", releaseId, "dist")` — check `existsSync`, return exit 1 if missing
  5. Resolve `secretsFilePath` via `resolveConventionSecretsPath(path.join(workspaceRoot, "releases", releaseId), channel)` (dev → `.env.alt`)
  6. Resolve `nodeModulesBinPath` from workspace root `node_modules/.bin/` (since release dir has no `node_modules/`)
  7. Call `adapter.propagate()` with release dist, `channelConfig`, `secretsFilePath`, `nodeModulesBinPath`
  8. Run CDN purge via `runPurgeStep` (same as workpiece path)
  9. Run health check via `adapter.health()` (same as workpiece path)
  10. Return `DevDeployResult` with:
      - `missionId` ← `releaseManifest.missionId`
      - `commitSha` ← `releaseManifest.commitSha`
      - `buildState: "succeeded"`, `buildSkipped: true`
      - `deployState` ← from adapter result
      - `buildIdentity: { releaseId, written: false, path: "" }`
      - `axiom: { status: "not-run", errors: 0, warnings: 0, exitCode: 0, freshness: { verified: false, cdnDistTreeHash: null, localDistTreeHash: "", attempts: 0, error: "release path — axiom skipped" } }`
      - `evidenceSynced: false`, `evidenceSyncError: null`
      - `releaseDeployed: releaseId`
- If `releaseId` is not set: existing behavior (require `currentMission`, build from workpiece, etc.)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — type check passes

**Completion criterion:** `runLeitstandDevDeploy` handles `--release` flag: deploys from `releases/<id>/dist/`, skips build/axiom/auto-commit, runs CDN purge + health check, returns correct `DevDeployResult`

**Human review:** no

---

### Step 4. Write unit tests for release path

**Goal:** Create `leitstand-0700-release-dev-deploy.test.ts` covering all release-path scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0700-release-dev-deploy.test.ts`
- Test cases:
  1. **Release deploy succeeds** — `--release` set, release exists with matching `systemId`, dist exists → `deployState: "succeeded"`, `buildSkipped: true`, `releaseDeployed` set, `axiom.status: "not-run"`
  2. **System mismatch** — `--release` set, `releaseManifest.systemId` ≠ `--system` → `exitCode: 1`, error message contains "does not belong to system"
  3. **Release not found** — `--release` set, `releases/<id>/release.yaml` missing → `exitCode: 1`
  4. **Dist missing** — release exists but `releases/<id>/dist/` missing → `exitCode: 1`, error message contains "no dist directory"
  5. **No currentMission required** — registry has no `currentMission`, `--release` set → succeeds (does not throw "no active mission")
  6. **Workpiece path unchanged** — no `--release`, `currentMission` set → existing behavior (verify `buildSkipped: false` or true depending on cache, `releaseDeployed` undefined)
- Follow the test pattern from `leitstand-0628-dev-deploy.test.ts`: mock `node:child_process`, mock `@warpgogol/site-kernel`, use `nullAdapter` (adapter: "null" in registry), create temp workspace with registry + release directory

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run leitstand-0700 --reporter=verbose` — all tests pass

**Completion criterion:** All 6 test cases pass

**Human review:** no

---

### Step 5. Update AGENTS.md and command manifest

**Goal:** Document the new `--release` flag in AGENTS.md and regenerate the command manifest.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, Leitstand section: add note that `leitstand.dev-deploy` accepts optional `--release <id>` flag for deploying existing releases to dev without open mission (RFC-0700)
- Run `pnpm exec site-kernel run command.manifest.generate` to refresh `docs/command-manifest.generated.yaml`

**Validation:**

- `git diff docs/command-manifest.generated.yaml` shows `release` flag added to `leitstand.dev-deploy`
- AGENTS.md updated

**Completion criterion:** AGENTS.md Leitstand section documents `--release` flag; command manifest regenerated

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations
- Check off acceptance criteria: verify each criterion in the RFC against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0700 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0700`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0700`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run leitstand-0700 --reporter=verbose`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0700` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation: using `--release` during active development | Step 5: AGENTS.md documents that `--release` is for re-deploying existing releases, not for skipping build |
| No axiom verification in release path | By design — release was already validated during `release.prepare`. Step 3 sets `axiom.status: "not-run"` explicitly |
| Wrangler binary not found in release dir | Step 3: resolve from workspace root `node_modules/.bin/` with PATH fallback |
| System-release mismatch | Step 3: verify `releaseManifest.systemId === systemId`, exit 1 on mismatch |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0700 --reason "..." --invariant "DNA-N"` instead of working around it.
