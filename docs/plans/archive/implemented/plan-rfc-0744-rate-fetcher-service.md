---
rfcId: RFC-0744
planId: PLAN-RFC-0744-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/pbp"
    - "@warpgogol/pbp-rate-adapters"
    - "@warpgogol/site-kernel-checks"
  services:
    - rate-fetcher-worker
  docs:
    - services/AGENTS.md
    - packages/pbp/AGENTS.md
    - docs/technology.xml
    - docs/development-plan.xml
---

# Implementation Plan: RFC-0744

## 1. Objectives

- [ ] O1 — `PbpRateSource` entity + Zod schema exported from `@warpgogol/pbp` (maps to acceptance criteria: entity/schema exports)
- [ ] O2 — `packages/pbp-rate-adapters/` package created with adapter registry + ECB adapter (maps to: adapter package, interfaces, ECB adapter)
- [ ] O3 — `services/rate-fetcher-worker/` service workspace created following Lagebild pattern (maps to: service workspace, daily schedule, health, concurrent guard)
- [ ] O4 — Supabase migration for `rate_sources`, `rate_observations`, `rate_fetcher_health`, `rate_fetcher_locks` (maps to: Supabase schema)
- [ ] O5 — `rate-snapshot.resolve` (RFC-0741) amended to read from Supabase instead of calling adapters directly (maps to: command amendment, snapshot creation, pruning)
- [ ] O6 — Env-and-deploy contract compliance: `.env.example`, `deploy.preflight` script, `wrangler.jsonc` (maps to: env contract, deploy script, wrangler format)
- [ ] O7 — All validation passes: `tsc --noEmit`, `vitest run`, `services.check.run`, `rfc.validate` (maps to: validation criteria)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/entities/rate-source.ts` — NEW: `PbpRateSource` entity interface + `RATE_SOURCE_SCHEMA_ID`
- `packages/pbp/src/schemas/rate-source.ts` — NEW: `pbpRateSourceSchema` Zod schema
- `packages/pbp/src/schemas/index.ts` — MODIFIED: add `pbpRateSourceSchema` to schema registry
- `packages/pbp/src/index.ts` — MODIFIED: re-export `PbpRateSource`, `RATE_SOURCE_SCHEMA_ID`, `pbpRateSourceSchema`
- `packages/pbp-rate-adapters/` — NEW package
  - `src/types.ts` — `RateSourceAdapter`, `RateFetchResult` interfaces
  - `src/registry.ts` — `registerRateSourceAdapter`, `getRateSourceAdapter`
  - `src/adapters/ecb.ts` — ECB adapter implementation
  - `src/index.ts` — barrel exports
  - `package.json`, `tsconfig.json` — package config
- `services/rate-fetcher-worker/` — NEW service workspace
  - `src/index.ts` — worker entrypoint (scheduled handler + health endpoint)
  - `src/health.ts` — health endpoint handler
  - `src/supabase-client.ts` — Supabase REST client (thin, like Lagebild)
  - `wrangler.jsonc` — Cloudflare Workers config with cron trigger
  - `.env.example` — env vars with `# How to obtain:` lines (RFC-0388)
  - `package.json` — with `deploy.preflight` script
  - `service.config.yaml` — service config (id, kind, entry)
  - `supabase/migrations/001-rate-fetcher-tables.sql` — Supabase migration
- `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts` — NEW (RFC-0741 handler, amended by this RFC to read from Supabase)
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — MODIFIED: register `rate-snapshot.resolve` command
- `pnpm-workspace.yaml` — MODIFIED: add `services/rate-fetcher-worker` (if not auto-discovered)

### 2.2 Configuration and data

- Supabase migration SQL — 4 tables: `rate_sources`, `rate_observations`, `rate_fetcher_health`, `rate_fetcher_locks`
- `services/rate-fetcher-worker/wrangler.jsonc` — cron config, observability, secrets documentation

### 2.3 Documentation and specs

- `services/AGENTS.md` — MODIFIED: add `rate-fetcher-worker` to current services list
- `packages/pbp/AGENTS.md` — MODIFIED: add `PbpRateSource` to API surface
- `docs/technology.xml` — MODIFIED: add rate-fetcher-worker service + pbp-rate-adapters package
- `docs/development-plan.xml` — MODIFIED: add rate fetcher service to development plan

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` — typecheck PBP
- `pnpm --filter @warpgogol/pbp-rate-adapters run build:check` — typecheck adapters
- `pnpm --filter @warpgogol/rate-fetcher-worker run build:check` — typecheck worker
- `pnpm exec site-kernel run services.check.run` — service import rules
- `pnpm exec site-kernel run rfc.validate --id RFC-0744` — RFC validation

## 3. Step sequence

### Step 1. PbpRateSource entity + Zod schema

**Goal:** Add `PbpRateSource` entity interface and Zod schema to `@warpgogol/pbp`.

**Agent actions:**

- Create `packages/pbp/src/entities/rate-source.ts` with `PbpRateSource` interface extending `PbpEntity` and `RATE_SOURCE_SCHEMA_ID` constant
- Create `packages/pbp/src/schemas/rate-source.ts` with `pbpRateSourceSchema` Zod schema
- Add `pbpRateSourceSchema` to `packages/pbp/src/schemas/index.ts` schema registry
- Add re-exports to `packages/pbp/src/index.ts`: `PbpRateSource`, `RATE_SOURCE_SCHEMA_ID`, `pbpRateSourceSchema`
- Follow the exact pattern of existing entities (e.g. `rate-policy.ts`, `rate-snapshot.ts`)

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes
- `pnpm --filter @warpgogol/pbp run test` passes

**Completion criterion:** `PbpRateSource`, `RATE_SOURCE_SCHEMA_ID`, and `pbpRateSourceSchema` are exported from `@warpgogol/pbp` and typecheck passes.

**Human review:** no

---

### Step 2. Rate source adapters package

**Goal:** Create `packages/pbp-rate-adapters/` with adapter registry and ECB adapter.

**Agent actions:**

- Create `packages/pbp-rate-adapters/package.json` with `@warpgogol/pbp-rate-adapters` name, `build:check` script, dependency on `@warpgogol/pbp`
- Create `packages/pbp-rate-adapters/tsconfig.json` extending base config
- Create `packages/pbp-rate-adapters/src/types.ts` with `RateSourceAdapter` and `RateFetchResult` interfaces
- Create `packages/pbp-rate-adapters/src/registry.ts` with `registerRateSourceAdapter` and `getRateSourceAdapter` functions
- Create `packages/pbp-rate-adapters/src/adapters/ecb.ts` — ECB adapter that fetches `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`, parses all EUR reference rates, normalizes to `target-per-source` decimal strings, handles cross-rate computation for non-EUR pairs
- Create `packages/pbp-rate-adapters/src/index.ts` barrel exports
- Register ECB adapter in registry at import time
- Write unit tests for ECB adapter: parse sample XML, verify rate extraction, verify cross-rate computation, verify decimal string output

**Validation:**

- `pnpm --filter @warpgogol/pbp-rate-adapters run build:check` passes
- `pnpm --filter @warpgogol/pbp-rate-adapters run test` passes

**Completion criterion:** `RateSourceAdapter`, `RateFetchResult` interfaces exported; ECB adapter implemented, registered, and tested; typecheck + tests pass.

**Human review:** no

---

### Step 3. Supabase migration

**Goal:** Create Supabase migration SQL for rate fetcher tables.

**Agent actions:**

- Create `services/rate-fetcher-worker/supabase/migrations/001-rate-fetcher-tables.sql`
- Define `rate_sources` table (source_id PK, adapter, config jsonb, enabled, created_at)
- Define `rate_observations` table (id bigint PK, source_id FK, source_currency, target_currency, value text, observed_at, fetched_at, metadata jsonb, unique constraint)
- Define `rate_fetcher_health` table (source_id PK, last_seen_at, last_success_at, last_error_at, last_error)
- Define `rate_fetcher_locks` table (lock_id PK, created_at)
- Add RLS policies as appropriate (rate_observations is readable by all authenticated, rate_sources is readable by all authenticated, writes restricted to service role)

**Validation:**

- SQL syntax verified (manual review or `supabase db lint` if available)
- Migration follows existing Supabase migration patterns in `services/lagebild-sync-worker/supabase/`

**Completion criterion:** Migration SQL file created with 4 tables, constraints, and RLS policies.

**Human review:** yes — Supabase schema changes require operator approval (external contract: Supabase)

---

### Step 4. Service workspace: rate-fetcher-worker

**Goal:** Create `services/rate-fetcher-worker/` following the Lagebild pattern.

**Agent actions:**

- Create `services/rate-fetcher-worker/package.json` with `@warpgogol/rate-fetcher-worker` name, `build:check` and `deploy` scripts (deploy uses `deploy.preflight` prefix + `--secrets-file .env`)
- Create `services/rate-fetcher-worker/tsconfig.json`
- Create `services/rate-fetcher-worker/service.config.yaml` (id: rate-fetcher-worker, kind: scheduled-worker, entry: src/index.ts)
- Create `services/rate-fetcher-worker/wrangler.jsonc` with cron trigger (`0 6 * * *`), observability config, secrets documentation comments
- Create `services/rate-fetcher-worker/.env.example` with documented env vars:
  - `RATE_FETCHER_SUPABASE_URL` — Supabase project URL
  - `RATE_FETCHER_SUPABASE_SERVICE_KEY` — Supabase service_role key
  - `WARPGOGOL_OTLP_ENDPOINT` — OTLP ingest endpoint
  - `WARPGOGOL_OTLP_TOKEN` — OTLP bearer token
  - Each with `# How to obtain:` lines (RFC-0388)
- Create `services/rate-fetcher-worker/src/supabase-client.ts` — thin Supabase REST client (following Lagebild pattern)
- Create `services/rate-fetcher-worker/src/index.ts` — worker entrypoint:
  - `scheduled()` handler: acquire lock, read rate sources from Supabase, for each source call adapter, write observations to Supabase, update health, release lock
  - `fetch()` handler: health endpoint at `/health`
- Create `services/rate-fetcher-worker/src/health.ts` — health endpoint handler reading from `rate_fetcher_health`
- Create `services/rate-fetcher-worker/AGENTS.md` (will be generated by `forge.agents.generate`)
- Create `.gitignore` (if needed, following other services)

**Validation:**

- `pnpm --filter @warpgogol/rate-fetcher-worker run build:check` passes
- `pnpm exec site-kernel run services.check.run` passes
- `pnpm exec site-kernel run env.contract.validate --service rate-fetcher-worker` passes (if available)

**Completion criterion:** Service workspace created with all files, typecheck passes, services.check.run passes, env contract compliant.

**Human review:** no

---

### Step 5. Amend rate-snapshot.resolve to read from Supabase

**Goal:** Create `rate-snapshot.resolve` command handler (RFC-0741) that reads from Supabase instead of calling adapters directly.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/rate-snapshot-resolve.ts`:
  - `runRateSnapshotResolve(input, context)` — kernel command handler
  - Reads all RatePolicy entities for the system
  - For `mode: "external"`: queries Supabase `rate_observations` for each pair + source, creates RateSnapshot content files with digests
  - For `mode: "business-fixed"`: resolves from RateSchedule entries
  - Handles fallback source, `allowLastKnownValue`, `maximumAge`
  - Prunes old snapshots (keep latest per pair + within maximumAge)
  - Returns summary JSON (snapshotsCreated, snapshotsReused, snapshotsPruned, pairs, errors)
- Register command in `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`
- The handler reads Supabase credentials from environment (`RATE_FETCHER_SUPABASE_URL`, `RATE_FETCHER_SUPABASE_SERVICE_KEY`)
- Write unit tests: mock Supabase responses, verify snapshot creation, verify digest computation, verify pruning logic, verify fallback handling

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** `rate-snapshot.resolve` command registered, reads from Supabase, creates RateSnapshot files with digests, prunes old snapshots, tests pass.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update all documentation artifacts in scope.

**Agent actions:**

- Update `services/AGENTS.md` — add `rate-fetcher-worker` to current services list
- Update `packages/pbp/AGENTS.md` — add `PbpRateSource` to API surface multi-currency section
- Update `docs/technology.xml` — add `rate-fetcher-worker` service and `pbp-rate-adapters` package
- Update `docs/development-plan.xml` — add rate fetcher service to development plan
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed
- Verify every file in `scope.docs` is updated

**Validation:**

- `git diff` shows changes to all scope.docs files
- `pnpm exec site-kernel run rfc.validate --id RFC-0744` passes

**Completion criterion:** All documentation artifacts in scope are updated; `rfc.validate` passes.

**Human review:** no

---

### Step 7. Tests

**Goal:** Write unit tests for all new code.

**Agent actions:**

- ECB adapter tests: parse sample XML, verify rate extraction, cross-rate computation, decimal string output, error handling
- Registry tests: register, lookup, not-found
- Worker tests: mock Supabase, verify scheduled handler flow, lock acquisition, health updates
- `rate-snapshot.resolve` tests: mock Supabase, verify snapshot creation, digest, pruning, fallback, allowLastKnownValue, failure modes
- `PbpRateSource` schema tests: validate example entity, invalid entities

**Validation:**

- `pnpm --filter @warpgogol/pbp run test` passes
- `pnpm --filter @warpgogol/pbp-rate-adapters run test` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** All test suites pass with new tests covering the new code.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, services/, packages/) with new modules, commands, or ownership changes.
- Update affected `docs/*.xml` Compass files (requirements, technology, development-plan, knowledge-graph, verification-plan, source-markup, styling) when repository-wide semantics changed.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0744 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0744`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0744`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp-rate-adapters run build:check`
- `pnpm --filter @warpgogol/rate-fetcher-worker run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/pbp run test`
- `pnpm --filter @warpgogol/pbp-rate-adapters run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run services.check.run`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0744` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| External API changes | Step 2: each adapter is isolated and independently updateable |
| API rate limits | Step 4: daily cron is well within free API limits |
| Supabase availability | Step 5: `allowLastKnownValue` + `maximumAge` policy ensures build proceeds with stale snapshots |
| Cross-rate precision | Step 2: ECB adapter uses decimal string arithmetic, not binary float |
| Agent misinterpretation | Step 6: documentation clearly separates `rate_observations` (Supabase) from `RateSnapshot` (content files) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0744 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the Supabase schema requires changes to existing Lagebild tables, stop and escalate — Lagebild tables are owned by RFC-0186.
- If `rate-snapshot.resolve` command registration conflicts with RFC-0741's registration, stop and resolve the conflict via an amending RFC before proceeding.
