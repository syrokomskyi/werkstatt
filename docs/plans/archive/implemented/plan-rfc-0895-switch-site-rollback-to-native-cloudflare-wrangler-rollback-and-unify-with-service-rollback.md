---
rfcId: RFC-0895
planId: PLAN-RFC-0895-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - AGENTS.md
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0895

## 1. Objectives

- [ ] O1 — Switch site rollback from re-deploy to native `wrangler rollback` (maps to acceptance: "calls `runWranglerRollback` not `runWranglerDeployWithRetry`")
- [ ] O2 — Unify `leitstand.rollback` to accept `--site` or `--service` (maps to acceptance: "rolls back a service Worker via the same code path")
- [ ] O3 — Remove `--gate-decision` and `--to-release` from rollback (maps to acceptance: "flag is rejected by `leitstand.rollback`")
- [ ] O4 — Remove `leitstand.service.rollback` and `release.rollback` commands (maps to acceptance: "command registration is removed")
- [ ] O5 — Simplify `RollbackInput` interface (maps to acceptance: "no longer contains `distPath`, `toReleaseId`, `url`, `secretsFilePath`, `nodeModulesBinPath`")
- [ ] O6 — Preserve effect record compatibility and cache purging for sites (maps to acceptance: "effect record written with `state: \"rolled-back\"`", "CDN cache purge is performed after site rollback")
- [ ] O7 — Update AGENTS.md and module registrations (maps to acceptance: "AGENTS.md updated")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/leitstand/adapter.ts` — `RollbackInput` simplified, `RollbackResult` added, `DeploymentAdapter.rollback()` signature changed
- `packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts` — `rollback()` method rewritten to call `runWranglerRollback`
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — `runLeitstandRollback` rewritten, `LeitstandRollbackData` updated
- `packages/werkstatt/src/leitstand/service-rollback.ts` — deleted (logic merged into `leitstand-commands.ts`)
- `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` — `runWranglerRollback` reused as-is; `ServiceRollbackData` may be removed or kept for the unified data shape
- `packages/werkstatt/src/leitstand/leitstand.module.ts` — `leitstand.rollback` registration updated (add `--service`, remove `--to-release`); `leitstand.service.rollback` registration removed
- `packages/werkstatt/src/leitstand/index.ts` — remove `runLeitstandServiceRollback` export
- `packages/werkstatt/src/release/release-commands.ts` — `runReleaseRollback` removed
- `packages/werkstatt/src/release/release.module.ts` — `release.rollback` registration removed
- `packages/werkstatt/src/release/index.ts` — remove `runReleaseRollback` export if present

### 2.2 Configuration and data

- `services/registry.yaml` — no structural change; service rollback state recording continues
- `systems-cache/{id}/deployment-operations/` — effect record shape preserved (candidateId, state, channel, timestamp)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update deployment commands section: `leitstand.rollback` description, remove `release.rollback` and `leitstand.service.rollback`
- `packages/werkstatt/AGENTS.md` — update Leitstand section if it references old rollback flags

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0895`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- No acceptance probes declared (commented out in frontmatter)

## 3. Step sequence

### Step 1. Simplify RollbackInput and add RollbackResult

**Goal:** Update the adapter contract types to reflect the new native rollback model.

**Agent actions:**

- Edit `packages/werkstatt/src/leitstand/adapter.ts`:
  - Remove from `RollbackInput`: `toReleaseId`, `distPath`, `url`, `secretsFilePath`, `nodeModulesBinPath`
  - Keep: `systemId`, `channel`, `workerName`
  - Add: `wranglerConfigDir` (replaces `distPath` as the working directory for `wrangler rollback`)
  - Add new `RollbackResult` interface: `systemId`, `channel`, `state`, `workerName`, `startedAt`, `completedAt`, `stdout`, `stderr`
  - Change `DeploymentAdapter.rollback()` return type from `Promise<PropagationResult>` to `Promise<RollbackResult>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — expect type errors in `cloudflare-workers.ts` and `leitstand-commands.ts` (will be fixed in subsequent steps)

**Completion criterion:** `adapter.ts` exports the new `RollbackInput` and `RollbackResult` interfaces; `build:check` shows errors only in downstream consumers, not in `adapter.ts` itself.

**Human review:** no

---

### Step 2. Rewrite cloudflare-workers adapter rollback()

**Goal:** Switch the adapter's `rollback()` method from `wrangler deploy` to `runWranglerRollback`.

**Agent actions:**

- Edit `packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts`:
  - Import `runWranglerRollback` from `../service-deploy-helpers.ts`
  - Rewrite `rollback()` method:
    - Remove `sourceDotenv`, `runWranglerDeployWithRetry`, `wrangler deploy` args
    - Call `runWranglerRollback(input.wranglerConfigDir, env)` where `env` is `filterEnv(process.env)` (no secrets file for rollback — Cloudflare stores secrets server-side)
    - Map the result to `RollbackResult` shape: `state: exitCode === 0 ? "succeeded" : "failed"`
  - Remove `runWranglerDeployWithRetry` import if no longer used by `propagate()` (check first — `propagate()` still uses it)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — expect remaining type errors in `leitstand-commands.ts`

**Completion criterion:** `cloudflare-workers.ts` `rollback()` calls `runWranglerRollback` and returns `RollbackResult`; no `wrangler deploy` in the rollback method.

**Human review:** no

---

### Step 3. Rewrite runLeitstandRollback command handler

**Goal:** Unify site and service rollback into a single `runLeitstandRollback` that accepts `--site` or `--service`.

**Agent actions:**

- Edit `packages/werkstatt/src/leitstand/leitstand-commands.ts`:
  - Update `LeitstandRollbackData` interface: `target: "site" | "service"`, `systemId?`, `serviceId?`, `channel?`, `workerName`, `rollbackState`, `startedAt`, `completedAt`, `operationId`
  - Rewrite `runLeitstandRollback`:
    - Read `--site` and `--service` flags; validate exactly one is provided
    - Read `--channel` (default `main`); only meaningful for sites
    - Reject `--gate-decision` and `--to-release` flags if passed (throw clear error)
    - **Site path:**
      1. Read `system-config.yaml` → `deployment.channels.<channel>.workerName` (fallback to `systemId`)
      2. Create temp directory with minimal `wrangler.json` (`{"name": "<workerName>"}`)
      3. Acquire lock using `werkstatt.lock` primitive with system ID
      4. Call `runWranglerRollback(tempDir, env)`
      5. On success: purge CDN cache via `purgeCacheByUrls` using channel URL from `system-config.yaml`
      6. Write deployment effect record with `candidateId`, `state: "rolled-back"`, `channel`, `timestamp`
      7. Clean up temp directory in `finally` block
    - **Service path:**
      1. Read `services/registry.yaml` → `serviceEntry.workerName`
      2. Verify `services/<id>/wrangler.jsonc` exists
      3. Acquire `acquireServiceLock`
      4. Call `runWranglerRollback(services/<id>, deployEnv)` where `deployEnv` from `.env` file
      5. Record rollback state in `services/registry.yaml` via `recordProdDeployState`
      6. Release lock in `finally` block
    - Return `LeitstandRollbackData` with appropriate fields

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — expect no type errors after this step

**Completion criterion:** `runLeitstandRollback` handles both `--site` and `--service`; rejects `--gate-decision` and `--to-release`; calls `runWranglerRollback` for both paths.

**Human review:** no

---

### Step 4. Delete service-rollback.ts and remove release.rollback

**Goal:** Remove the now-redundant `leitstand.service.rollback` and `release.rollback` commands.

**Agent actions:**

- Delete `packages/werkstatt/src/leitstand/service-rollback.ts`
- Edit `packages/werkstatt/src/leitstand/index.ts` — remove `runLeitstandServiceRollback` export
- Edit `packages/werkstatt/src/leitstand/leitstand.module.ts`:
  - Remove `leitstand.service.rollback` command registration (lines ~388-405)
  - Remove dynamic import of `runLeitstandServiceRollback`
  - Update `leitstand.rollback` registration: add `--service` flag, remove `--to-release` flag, update description
- Edit `packages/werkstatt/src/release/release-commands.ts` — remove `runReleaseRollback` function and `ReleaseRollbackData` interface
- Edit `packages/werkstatt/src/release/release.module.ts` — remove `release.rollback` registration
- Edit `packages/werkstatt/src/release/index.ts` — remove `runReleaseRollback` export if present

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `service-rollback.ts` deleted; `leitstand.service.rollback` and `release.rollback` registrations removed; no build errors from dangling imports.

**Human review:** no

---

### Step 5. Update AGENTS.md files

**Goal:** Synchronize documentation with the new unified rollback command.

**Agent actions:**

- Edit `AGENTS.md` (root):
  - Update the deployment commands section: `leitstand.rollback` now accepts `--site` or `--service`, no `--gate-decision`, no `--to-release`
  - Remove `leitstand.service.rollback` and `release.rollback` from the command list
  - Update any text that says rollback requires `--gate-decision` or `evaluateRollback()`
- Edit `packages/werkstatt/AGENTS.md`:
  - Update Leitstand section if it references old rollback flags or `leitstand.service.rollback`

**Validation:**

- `grep -r "leitstand.service.rollback" AGENTS.md packages/werkstatt/AGENTS.md` — no results
- `grep -r "release.rollback" AGENTS.md packages/werkstatt/AGENTS.md` — no results
- `grep -r "gate-decision.*rollback\|rollback.*gate-decision" AGENTS.md` — no results

**Completion criterion:** No references to removed commands or flags in AGENTS.md files.

**Human review:** no

---

### Step 6. Build verification and typecheck

**Goal:** Verify the implementation compiles cleanly.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check`
- Run `pnpm --filter @warpgogol/werkstatt run lint`
- Fix any type errors or lint issues

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — exit code 0
- `pnpm --filter @warpgogol/werkstatt run lint` — exit code 0

**Completion criterion:** Both `build:check` and `lint` pass with zero errors.

**Human review:** no

---

### Step 7. RFC validation, review, fix, and stamp

**Goal:** Validate the RFC, run code review, fix findings, verify acceptance criteria, and stamp implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0895 --json`
- Run `pnpm exec werkstatt run command.manifest.generate` if command surface changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- If review has findings: invoke `fo-fix` via the `skill` tool, re-run `fo-review` to confirm
- Check off acceptance criteria in the RFC, adding `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0895 --implementation-commit <sha>`

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0895` — pass
- `pnpm --filter @warpgogol/werkstatt run build:check` — pass
- Review report in `docs/reviews/code/` for this session
- `git status` — clean tree

**Completion criterion:** RFC validated, code review passed, acceptance criteria checked, RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0895`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run lint`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0895` in the subject line
- No acceptance probes declared (commented out in frontmatter) — `rfc.verification.emit` will produce no evidence file (expected behavior)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Cloudflare 100-version limit | Step 3 — `wrangler rollback` error propagates as `rollbackState: "failed"` with stderr tail |
| Bindings not changed on rollback | Documented in RFC risks; no code mitigation needed |
| No `--gate-decision` safety check | Step 3 — command rejects `--gate-decision` flag explicitly |
| Breaking change for existing callers | Step 5 — AGENTS.md updated; Step 3 — clear error messages for removed flags |
| Agent misinterpretation risk | Step 5 — AGENTS.md updated in same implementation |
| Effect record shape change | Step 3 — effect record preserves `candidateId`, `state`, `channel`, `timestamp` for `leitstand.status` compatibility |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-52, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0895 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `wrangler rollback` requires a full wrangler config (not just `name`), escalate to the operator — the temp `wrangler.json` approach may need revision.
- If `evaluateRollbackRequest` has other callers beyond `leitstand.rollback` and `release.rollback`, do not remove the function — only remove the calls from rollback paths.
