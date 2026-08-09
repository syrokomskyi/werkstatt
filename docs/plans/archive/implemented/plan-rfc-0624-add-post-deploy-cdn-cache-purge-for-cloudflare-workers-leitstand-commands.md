---
rfcId: RFC-0624
planId: PLAN-RFC-0624-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/ontology"
  services: []
  docs:
    - "packages/os/site-kernel-handoff/AGENTS.md"
    - ".env.example"
---

# Implementation Plan: RFC-0624

## 1. Objectives

- [ ] O1 — Create `cache-purge.ts` with `collectPurgeUrls` and `purgeCacheByUrls` helpers (batching max 30) — maps to acceptance criteria 1, 2
- [ ] O2 — Insert purge step in `runLeitstandPropagate` after `adapter.propagate`, before `adapter.health` — maps to criterion 3
- [ ] O3 — Insert purge step in `runLeitstandPromote` after main `adapter.propagate`, before main `adapter.health` (not before alt health check) — maps to criterion 4
- [ ] O4 — Insert purge step in `runLeitstandRollback` after `adapter.rollback` (no health check follows) — maps to criterion 5
- [ ] O5 — Add 6-second fixed delay between purge and health check (propagate and promote only) — maps to criterion 6
- [ ] O6 — Purge failures are non-blocking warnings — maps to criterion 7
- [ ] O7 — Missing `CLOUDFLARE_ZONE_ID` skips purge with warning — maps to criterion 8
- [ ] O8 — Record `purgeResult` in per-channel `lastPropagated` registry entry — maps to criterion 9
- [ ] O9 — `leitstand.status` displays `purgeResult` per channel — maps to criterion 10
- [ ] O10 — Update `.env.example` with `CLOUDFLARE_ZONE_ID` — maps to criterion 11
- [ ] O11 — Update `packages/os/site-kernel-handoff/AGENTS.md` with purge documentation — maps to criterion 12
- [ ] O12 — Unit tests for URL collection, batching, non-blocking failure, missing zone ID — maps to criterion 13

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/cache-purge.ts` — **new file**: `PurgeInput`, `PurgeResult`, `collectPurgeUrls`, `purgeCacheByUrls` with internal batching
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — modify `runLeitstandPropagate`, `runLeitstandPromote`, `runLeitstandRollback`, `runLeitstandStatus`, `buildLastPropagatedEntry`
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — export `readBehaviorSnapshot` for import by `cache-purge.ts` (already exists, no changes needed)
- `packages/ontology/src/operations/leitstand.ts` — add `purgeResult` field to `lastPropagatedChannelSchema`

### 2.2 Configuration and data

- `.env.example` — add `CLOUDFLARE_ZONE_ID` entry with comment

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add Leitstand section bullet for purge step
- No `docs/*.xml` Compass sync needed (RFC-0624 Decision: `CLOUDFLARE_ZONE_ID` is a runtime secret, not a repository-wide requirement)
- No `docs/architecture-dna.md` update (DNA-49 not modified)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0624`

## 3. Step sequence

### Step 1. Add `purgeResult` to ontology schema

**Goal:** Extend `lastPropagatedChannelSchema` with optional `purgeResult` field.

**Agent actions:**

- Add `purgeResultSchema` (z.object with `success: z.boolean()`, `purgedUrls: z.number()`, `error: z.string().optional()`) to `packages/ontology/src/operations/leitstand.ts`
- Add `purgeResult: purgeResultSchema.optional()` to `lastPropagatedChannelSchema`
- Export `purgeResultSchema` and `PurgeResult` type from `leitstand.ts` and re-export from `operations/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check`

**Completion criterion:** `lastPropagatedChannelSchema` includes optional `purgeResult`; ontology build passes.

**Human review:** no

---

### Step 2. Create `cache-purge.ts` helper module

**Goal:** Implement `collectPurgeUrls` and `purgeCacheByUrls` with internal batching.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/leitstand/cache-purge.ts`
- Implement `collectPurgeUrls(deploymentUrl: string, routes: RouteFact[]): string[]` — maps behavior snapshot routes to full URLs, appends `/.well-known/build-identity.json`
- Implement `purgeCacheByUrls(input: PurgeInput): Promise<PurgeResult>` — reads `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from env, batches URLs in chunks of 30, calls `POST https://api.cloudflare.com/client/v4/zones/{zoneId}/purge_cache` with `{"files": [...]}` per batch, aggregates results
- Import `RouteFact` from `@warpgogol/ontology/operations`
- Import `sourceDotenv` from `./adapters/cloudflare-workers.ts` for reading secretsFile env
- Use global `fetch` for API calls

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `cache-purge.ts` exists with both functions; build passes; batching is internal to `purgeCacheByUrls`.

**Human review:** no

---

### Step 3. Wire purge into `runLeitstandPropagate`

**Goal:** Insert purge step between `adapter.propagate` and `adapter.health`.

**Agent actions:**

- After `adapter.propagate` succeeds, read behavior snapshot routes via `readBehaviorSnapshot`
- Call `collectPurgeUrls` with `channelConfig.url` and routes
- Read `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` from `sourceDotenv(secretsFilePath)` merged with `process.env`
- If `CLOUDFLARE_ZONE_ID` missing: log warning, set `purgeResult = { success: false, purgedUrls: 0, error: "CLOUDFLARE_ZONE_ID not set" }`, skip to health check
- If present: call `purgeCacheByUrls`, log result
- On purge failure: log `logger.warn`, set `purgeResult` with error, continue
- On purge success: `await sleep(6_000)` (fixed 6s delay), then proceed to health check
- Pass `purgeResult` to `buildLastPropagatedEntry`
- Add `purgeResult` to `LeitstandPropagateData` interface and command return `data`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Purge runs after propagate, before health; 6s delay on success; non-blocking on failure; `purgeResult` in return data.

**Human review:** no

---

### Step 4. Wire purge into `runLeitstandPromote`

**Goal:** Insert purge step between main `adapter.propagate` and main `adapter.health` only.

**Agent actions:**

- After step 4 (main `adapter.propagate`) succeeds, insert purge step (same logic as Step 3)
- Do NOT purge before step 3 (alt health check) — alt was already purged during `leitstand.propagate`
- After purge success: `await sleep(6_000)`, then proceed to step 5 (main health check)
- Pass `purgeResult` to `buildLastPropagatedEntry` for main channel
- Add `purgeResult` to `LeitstandPromoteData` interface and command return `data`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Purge runs only after main deploy, before main health; not before alt health; 6s delay on success; `purgeResult` in return data.

**Human review:** no

---

### Step 5. Wire purge into `runLeitstandRollback`

**Goal:** Insert purge step after `adapter.rollback` succeeds (no health check follows).

**Agent actions:**

- After `adapter.rollback` succeeds, read behavior snapshot for the **target** releaseId (the release being rolled back to)
- If behavior snapshot is unavailable for target releaseId: log warning, purge only `/.well-known/build-identity.json`
- Otherwise: call `collectPurgeUrls` with `channelConfig.url` and routes
- Call `purgeCacheByUrls` (same env/secretsFile logic)
- On success: log "Visitors will see rolled-back content" — NO 6s delay (no health check to wait for)
- On failure: log `logger.warn`, continue
- Pass `purgeResult` to `buildLastPropagatedEntry`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Purge runs after rollback; no 6s delay; non-blocking; `purgeResult` in `lastPropagated`.

**Human review:** no

---

### Step 6. Update `buildLastPropagatedEntry` and `runLeitstandStatus`

**Goal:** Record and display `purgeResult` per channel.

**Agent actions:**

- Add `purgeResult?: PurgeResult` parameter to `buildLastPropagatedEntry`
- Include `purgeResult` in the returned `LastPropagatedChannel` object
- Update all 3 call sites (propagate, promote, rollback) to pass `purgeResult`
- In `runLeitstandStatus`, include `purgeResult` in `channelStatus` output
- Add `purgeResult` to `LeitstandStatusData` channel type
- Log `purgeResult` in status output

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `purgeResult` stored in registry and displayed by `leitstand.status`.

**Human review:** no

---

### Step 7. Update `.env.example`

**Goal:** Add `CLOUDFLARE_ZONE_ID` with documentation.

**Agent actions:**

- Add after the existing `CLOUDFLARE_API_TOKEN` entry:
  ```
  # ── Cloudflare Zone ID (optional — used by Leitstand post-deploy CDN cache purge, RFC-0624)
  # How to obtain: Cloudflare Dashboard → Overview → Zone ID (right sidebar).
  CLOUDFLARE_ZONE_ID=
  ```

**Validation:**

- File visually inspected

**Completion criterion:** `CLOUDFLARE_ZONE_ID` entry exists in `.env.example` with comment.

**Human review:** no

---

### Step 8. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the purge step in the Leitstand section.

**Agent actions:**

- Add bullet to the Leitstand section:
  - "RFC-0624: `leitstand.propagate`, `leitstand.promote`, and `leitstand.rollback` purge CDN cache by URL after deploy/rollback succeeds. Purge sends `POST /zones/{zoneId}/purge_cache` with behavior snapshot route URLs + `/.well-known/build-identity.json`, batched max 30 per call. A fixed 6s delay follows purge before health checks (propagate and promote only; rollback has no health check). Purge failures are non-blocking warnings. `CLOUDFLARE_ZONE_ID` is read from the existing secretsFile env; missing zone ID skips purge with warning. `purgeResult` is recorded in per-channel `lastPropagated` and displayed by `leitstand.status`."

**Validation:**

- File visually inspected

**Completion criterion:** AGENTS.md Leitstand section includes purge documentation.

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Test `collectPurgeUrls`, `purgeCacheByUrls` batching, non-blocking failure, missing zone ID skip.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/cache-purge.test.ts`
- Test `collectPurgeUrls`: routes → URLs, includes `/.well-known/build-identity.json`, handles empty routes
- Test `purgeCacheByUrls` batching: 35 URLs → 2 API calls (30 + 5), mock `fetch`, verify batch payloads
- Test `purgeCacheByUrls` non-blocking failure: mock `fetch` returning 500, verify `success: false` with error
- Test `purgeCacheByUrls` missing zone ID: no env, verify `success: false, purgedUrls: 0, error: "CLOUDFLARE_ZONE_ID not set"`
- Test `purgeCacheByUrls` success: mock `fetch` returning 200, verify `success: true, purgedUrls: N`
- Mock `fetch` via `vi.stubGlobal("fetch", vi.fn())` — no real API calls

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All tests pass; `fetch` is mocked; batching, failure, and skip paths covered.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` updated (Step 8)
- Verify `.env.example` updated (Step 7)
- No `docs/*.xml` Compass sync needed (RFC Decision: runtime secret, not repository-wide)
- No `docs/architecture-dna.md` update (DNA-49 not modified)
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`
- Run `pnpm --filter @warpgogol/ontology build:check`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0624`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: <file:line>)`
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0624 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0624`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All docs updated; review passed; all acceptance criteria checked with evidence; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0624`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0624` in the subject line
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| 6s delay insufficient | Step 3/4: fixed delay; if observed insufficient, follow-up patch |
| Purge API rate limits | Step 2: batching max 30 URLs/call; 2-3 calls per deploy typical |
| Missing `CLOUDFLARE_ZONE_ID` | Step 3/4/5: skip with warning, non-blocking |
| URL count > 30 | Step 2: internal batching in `purgeCacheByUrls` |
| Agent misinterpretation (purge in adapter) | Step 8: AGENTS.md documentation; implementation notes in RFC |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0624 --reason "..." --invariant "DNA-49"` instead of working around it.
