---
rfcId: RFC-0807
planId: PLAN-RFC-0807-01
status: accepted
owner: architecture
createdAt: 2026-08-11
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services:
    - matomo-proxy
    - rate-fetcher
    - lagebild-sync
    - telegram-alert-bridge
    - maturity-score
    - check-runner
  docs:
    - docs/architecture-dna.md
    - services/AGENTS.md
    - docs/technology.xml
---

# Implementation Plan: RFC-0807

## 1. Objectives

- [ ] O1 — Add 5 `back` metrics to registry + update pattern (criterion: back metrics declared, pattern includes back)
- [ ] O2 — Add `back` entries to `METRIC_REFS` in typed-refs.ts (criterion: compile passes)
- [ ] O3 — Integrate OTLP push in 5 Worker services + check-runner (criterion: createMetricsPusher called in each)
- [ ] O4 — Create/update .env.example + .env.dev.example for all 6 services (criterion: OTLP vars present with # How to obtain:)
- [ ] O5 — Register `service.otlp.validate` command + add to services.check.run (criterion: command runs, passes)
- [ ] O6 — Update docs: services/AGENTS.md, architecture-dna.md, technology.xml (criterion: OTLP requirement documented)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/observability/metric-registry.ts` — add 5 metrics, update pattern
- `packages/werkstatt-site/src/domain/observability/typed-refs.ts` — add 5 METRIC_REFS entries
- `packages/werkstatt-site/src/domain/observability/tests/metric-registry.test.ts` — add back prefix tests
- `packages/werkstatt-site/src/checks/check-warpgogol/commands/service-otlp-validate.ts` — new handler
- `packages/werkstatt-site/src/checks/check-warpgogol/commands/services-check.ts` — wire into pipeline
- `packages/werkstatt-site/src/checks/command-tables/30-check-warpgogol.ts` — register command
- `packages/werkstatt-site/src/checks/diagnostics/rules/core-infra.ts` — register OTLP-01/02/03 rules
- `packages/werkstatt-site/src/checks/index.ts` — export new handler
- `packages/werkstatt-site/src/domain/integration-adapter-supabase-crm/worker.ts` — add OTLP vars to LagebildSharedWorkerEnv (summit A1/D1)
- `services/matomo-proxy/src/worker.ts` — add Env interface, change fetch signature (summit A2)
- `services/rate-fetcher/src/index.ts` — add OTLP vars to RateFetcherWorkerEnv, add pusher
- `services/lagebild-sync/src/index.ts` — add pusher (delegates to shared worker)
- `services/telegram-alert-bridge/src/worker.ts` — add OTLP vars to Env, add pusher
- `services/maturity-score/src/index.ts` — add OTLP vars to MaturityScoreWorkerEnv, add pusher
- `services/check-runner/src/worker.ts` — add pusher

### 2.2 Configuration and data

- `services/matomo-proxy/.env.example` — create
- `services/matomo-proxy/.env.dev.example` — create
- `services/maturity-score/.env.example` — create
- `services/maturity-score/.env.dev.example` — create
- `services/rate-fetcher/.env.example` — add OTLP vars
- `services/rate-fetcher/.env.dev.example` — add OTLP vars
- `services/lagebild-sync/.env.example` — add OTLP vars
- `services/lagebild-sync/.env.dev.example` — add OTLP vars
- `services/telegram-alert-bridge/.env.example` — add OTLP vars
- `services/telegram-alert-bridge/.env.dev.example` — add OTLP vars
- `services/check-runner/.env.example` — add OTLP vars

### 2.3 Documentation and specs

- `services/AGENTS.md` — document OTLP env var requirement
- `docs/architecture-dna.md` — amend DNA-40 with OTLP env var requirement
- `docs/technology.xml` — update observability port if documented

### 2.4 Validation and pipelines

- `service.otlp.validate` joins `services.check.run` as blocking (error severity, same as `env.contract.validate`)
- `env.contract.validate` continues to validate `.env.example` format; `service.otlp.validate` adds OTLP-specific presence + source grep checks

## 3. Step sequence

### Step 1. Metric registry extension

**Goal:** Add 5 `back` metrics to `WARPGOGOL_METRIC_REGISTRY` and update `METRIC_NAME_PATTERN`.

**Agent actions:**

- Add 5 metric specs to `WARPGOGOL_METRIC_REGISTRY` in `metric-registry.ts`: `warpgogol_back_requests_total` (counter, `service,status_class`), `warpgogol_back_up` (gauge, `service`), `warpgogol_back_last_run_total` (counter, `service,status`), `warpgogol_back_last_error_total` (counter, `service`), `warpgogol_back_queue_depth` (gauge, `service`).
- Update `METRIC_NAME_PATTERN` regex to include `back`: `/^warpgogol_(factory|probe|delivery|workers|back)_[a-z0-9_]+$/`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compile passes with new metrics.
- `pnpm --filter @warpgogol/werkstatt-site run test -- metric-registry` — existing tests pass with new pattern.

**Completion criterion:** 5 `back` metrics in registry, pattern includes `back`, compile passes.

**Human review:** no

---

### Step 2. Typed refs update

**Goal:** Add `back` metric entries to `METRIC_REFS` in `typed-refs.ts` to satisfy compile-time assertion.

**Agent actions:**

- Add 5 entries to `METRIC_REFS` using `defineCounter`/`defineGauge` with correct label key tuples.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compile-time assertion passes.

**Completion criterion:** `METRIC_REFS` includes all 5 `back` entries, compile passes.

**Human review:** no

---

### Step 3. Metric registry tests

**Goal:** Add unit tests for `back` prefix metrics.

**Agent actions:**

- Add test cases to `metric-registry.test.ts`: `isMetricNameValid("warpgogol_back_up")` returns true, `isMetricNameValid("warpgogol_back_requests_total")` returns true, all 5 new metrics pass `isMetricNameValid`, all 5 new metrics found in registry via `findMetricSpec`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- metric-registry` — all tests pass.

**Completion criterion:** New test cases pass, covering `back` prefix validation and registry lookup.

**Human review:** no

---

### Step 4. `service.otlp.validate` command handler

**Goal:** Create the validator command handler.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/check-warpgogol/commands/service-otlp-validate.ts`.
- Implement `runServiceOtlpValidate` — workspace-scope, scans `services/*` (except `observability-stack`, grilling Q8):
  - OTLP-01: `WARPGOGOL_OTLP_ENDPOINT` in `.env.example` with `# How to obtain:` line.
  - OTLP-02: `WARPGOGOL_OTLP_TOKEN` in `.env.example` with `# How to obtain:` line.
  - OTLP-03: For CF Worker services, grep source for `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` in `Env` interface declaration. Warning (not error) for services that delegate to shared workers where env interface lives in package (grilling Q5).
- Export from `packages/werkstatt-site/src/checks/index.ts`.
- Register OTLP-01/02/03 in `diagnostics/rules/core-infra.ts`.
- Register command in `command-tables/30-check-warpgogol.ts` (workspace scope, no flags, reads `services/*/.env.example` + `services/*/src/**/*.ts`).
- Wire into `services-check.ts` via `executeKernelCommand` (same pattern as `service.naming.validate`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compile passes.
- `pnpm exec werkstatt run service.otlp.validate` — command runs (expected: fail until env vars are added in step 6).

**Completion criterion:** Command registered, runs, produces diagnostics with correct rule IDs.

**Human review:** no

---

### Step 5. Pilot: rate-fetcher OTLP integration

**Goal:** Add OTLP push to `rate-fetcher` as pilot service.

**Agent actions:**

- Add `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` to `RateFetcherWorkerEnv` interface.
- Import `createMetricsPusher` from `@warpgogol/werkstatt-site/observability`.
- In `scheduled` handler: create pusher, push `warpgogol_back_up` gauge (1 on success, 0 on failure), `warpgogol_back_last_run_total` counter (status: success/failure), `warpgogol_back_last_error_total` counter on error. Flush at end.
- Add OTLP vars to `.env.example` and `.env.dev.example` with `# How to obtain:` lines.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compile passes.
- `pnpm exec werkstatt run service.otlp.validate` — rate-fetcher passes OTLP-01/02/03.

**Completion criterion:** rate-fetcher pushes metrics, env vars present, validator passes for this service.

**Human review:** no

---

### Step 6. Remaining Worker services + check-runner

**Goal:** Add OTLP push to matomo-proxy, lagebild-sync, telegram-alert-bridge, maturity-score, check-runner.

**Agent actions:**

- **matomo-proxy:** Add `Env` interface with OTLP vars. Change `fetch` signature to `async fetch(request: Request, env: Env)`. Add pusher in fetch handler — push `warpgogol_back_requests_total` and `warpgogol_back_up`. Create `.env.example` and `.env.dev.example`.
- **lagebild-sync:** Add OTLP vars to `LagebildSharedWorkerEnv` in `packages/werkstatt-site/src/domain/integration-adapter-supabase-crm/worker.ts` (summit A1/D1). Pusher lives in shared worker scheduled handler, not in service (grilling Q2). Service remains thin wrapper. Add OTLP vars to `.env.example` and `.env.dev.example`.
- **telegram-alert-bridge:** Add OTLP vars to `Env` interface. Add pusher in fetch handler — push `warpgogol_back_requests_total`, `warpgogol_back_last_error_total`, `warpgogol_back_up`. Add OTLP vars to `.env.example` and `.env.dev.example`.
- **maturity-score:** Add OTLP vars to `MaturityScoreWorkerEnv`. Add pusher in fetch handler — push `warpgogol_back_requests_total`, `warpgogol_back_up`. Create `.env.example` and `.env.dev.example`.
- **check-runner:** Add pusher in `worker.ts` loop — push `warpgogol_back_queue_depth`, `warpgogol_back_last_run_total`, `warpgogol_back_last_error_total`. Flush per iteration (grilling Q4). Add OTLP vars to `.env.example`. Node service uses internal endpoint — token empty, default in comment (grilling Q6/Q7).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compile passes.
- `pnpm exec werkstatt run service.otlp.validate` — all services pass.

**Completion criterion:** All 6 services have OTLP push, all `.env.example` files have OTLP vars, validator passes for all.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update documentation surfaces.

**Agent actions:**

- Update `services/AGENTS.md` — add OTLP env var requirement to env-and-deploy contract section.
- Amend `docs/architecture-dna.md` DNA-40 — add OTLP env var requirement for services.
- Update `docs/technology.xml` if observability port contract is documented there.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.

**Validation:**

- `git diff` shows all scope.docs files updated.
- `pnpm exec werkstatt run rfc.validate --id RFC-0807` — passes.

**Completion criterion:** All docs in scope are updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Review, fix, acceptance criteria, stamp

**Goal:** Run code review, fix findings, verify acceptance criteria, stamp implemented.

**Agent actions:**

- Run `fo-review` via skill tool on all session code changes.
- Run `fo-fix` if review has findings. Max 3 iterations.
- Check off acceptance criteria with inline `(evidence: ...)` annotations:
  - [x] back metrics declared — evidence: `metric-registry.ts:NN`, `pnpm --filter @warpgogol/werkstatt-site run test -- metric-registry`
  - [x] pattern includes back — evidence: `metric-registry.ts:NN`
  - [x] rate-fetcher pushes — evidence: `rate-fetcher/src/index.ts:NN`, unit test
  - [x] all 5 Workers push — evidence: each service source file
  - [x] check-runner pushes — evidence: `check-runner/src/worker.ts:NN`
  - [x] all services have OTLP vars in .env.example — evidence: `service.otlp.validate` pass
  - [x] service.otlp.validate registered and passing — evidence: `pnpm exec werkstatt run service.otlp.validate`
  - [x] rfc.validate passes — evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0807`
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0807 --dry-run`, then without `--dry-run`.
- Commit stamped RFC separately.

**Validation:**

- `git status` — clean.
- `pnpm exec werkstatt run rfc.validate --id RFC-0807` — passes.
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — passes.
- `pnpm --filter @warpgogol/werkstatt-site run test` — passes.
- `pnpm exec werkstatt run service.otlp.validate` — passes.
- Review report in `docs/reviews/code/`.

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented`; review passed.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0807`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run service.otlp.validate`
- `pnpm exec werkstatt run services.check.run`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0807`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0807.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0807` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| SigNoz downtime = blind spot | Step 5/6: pusher is fire-and-forget, no retry; Workers built-in traces still work |
| Token leakage | Step 5/6: Workers read from `env` bindings (wrangler secret), Node from `.env` (gitignored) |
| Metric cardinality | Step 1: `service` label is low-cardinality (fixed set), `status_class` is 5 values |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40 or DNA-XX, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0807 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `lagebild-sync` shared worker env interface change breaks other consumers of `LagebildSharedWorkerEnv`, stop and assess scope — may require a separate RFC.
