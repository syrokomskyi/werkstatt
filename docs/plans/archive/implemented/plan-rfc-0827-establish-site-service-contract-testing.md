---
rfcId: RFC-0827
planId: PLAN-RFC-0827-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services:
    - lagebild-sync
    - matomo-proxy
    - rate-fetcher
    - telegram-alert-bridge
    - maturity-score
    - cf-analytics-poller
    - check-runner
    - fleet-probe-runner
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0827

## 1. Objectives

- [ ] O1 — Define Zod contract schemas for 7 initial site-service API boundaries — maps to "Zod schemas defined for all site-service API boundaries"
- [ ] O2 — Register `contract.validate` command in the checks module — maps to "contract.validate command registered"
- [ ] O3 — Register `contract.list` command in the checks module — maps to "contract.list command registered"
- [ ] O4 — Add `contract.validate` to `PACKAGES_CHECK_PIPELINE` after `props.contract.validate` — maps to "contract.validate integrated into PACKAGES_CHECK_PIPELINE"
- [ ] O5 — Add `@warpgogol/werkstatt-site/testing/contract` subpath export to `packages/werkstatt-site/package.json` — maps to "Zod schemas defined for all site-service API boundaries" (enables cross-package imports)
- [ ] O6 — Update `send-message` and `integration-route` handlers to import and use contract schemas — maps to "Contract tests pass bidirectionally (site request shape, service response shape)"
- [ ] O7 — Document contract testing convention in `packages/werkstatt-site/AGENTS.md` — maps to "contract.validate integrated into PACKAGES_CHECK_PIPELINE" (governance)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/testing/contract/index.ts` — contract registry (new)
- `packages/werkstatt-site/src/testing/contract/send-message.contract.ts` — send-message contract (new)
- `packages/werkstatt-site/src/testing/contract/integration-route.contract.ts` — integration-route contract (new, reuses `IntegrationEventSchema`)
- `packages/werkstatt-site/src/testing/contract/health.contract.ts` — health endpoint contract (new)
- `packages/werkstatt-site/src/testing/contract/rate-fetch.contract.ts` — rate-fetcher contract (new)
- `packages/werkstatt-site/src/testing/contract/maturity-score.contract.ts` — maturity-score contract (new)
- `packages/werkstatt-site/src/testing/contract/matomo-proxy.contract.ts` — matomo-proxy contract (new)
- `packages/werkstatt-site/src/testing/contract/telegram-alert.contract.ts` — telegram-alert-bridge contract (new)
- `packages/werkstatt-site/src/testing/contract/contract-validator.ts` — `runContractValidate` and `runContractList` handlers (new)
- `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts` — add `contract.validate` and `contract.list` entries
- `packages/werkstatt-site/src/checks/pipelines/packages-check.ts` — add `{ command: "contract.validate" }` after `props.contract.validate`
- `packages/werkstatt-site/package.json` — add `@warpgogol/werkstatt-site/testing/contract` subpath export
- `packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts` — import `SendMessageRequestSchema` for validation
- `packages/werkstatt-site/src/domain/integration/delivery-handler.ts` — import `IntegrationRouteRequestSchema` (re-exports `IntegrationEventSchema`)

### 2.2 Configuration and data

- No YAML/JSON config files. Contract schemas are TypeScript-native (Zod).

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — document contract testing convention, subpath export, grace period escalation date
- `docs/rfcs/rfc-0827-establish-site-service-contract-testing.md` — read-only reference (acceptance criteria source of truth)

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — `contract.validate` added after `props.contract.validate` (line 149 of `packages-check.ts`)
- `pnpm exec werkstatt run packages-check.run --json` — CI gate that includes contract validation
- `pnpm exec werkstatt run contract.validate --json` — standalone contract validation
- `pnpm exec werkstatt run contract.list --json` — list registered contracts
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-site run test` — vitest unit tests

## 3. Step sequence

### Step 1. Create contract schema definitions

**Goal:** Define Zod schemas for all 7 initial site-service API boundaries.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/contract/` directory
- Create `send-message.contract.ts` — `SendMessageRequestSchema` (message, formId, referrer), `SendMessageResponseSchema` ({ ok: boolean, error?: string }), contract object with `id`, `name`, `direction`, `version: 1`, `request`, `response`, `description`
- Create `integration-route.contract.ts` — re-export `IntegrationEventSchema` from `@warpgogol/werkstatt-site/integration` as the request schema; define `IntegrationRouteResponseSchema` ({ ok: boolean, channels?, destinations?, emailed?, deduped?, error? })
- Create `health.contract.ts` — `HealthResponseSchema` ({ status: "ok" | "error", version?, timestamp? }), shared across all services
- Create `rate-fetch.contract.ts` — request schema for cron trigger, response schema for rate observation
- Create `maturity-score.contract.ts` — `ScoreRequestSchema`, `ScoreResponseSchema`
- Create `matomo-proxy.contract.ts` — proxy request/response schemas
- Create `telegram-alert.contract.ts` — Signoz webhook payload schema, alert response schema
- Create `index.ts` — contract registry: import all contract objects, export `CONTRACTS` array and `getContractById(id)` helper

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Each contract object has `id`, `name`, `direction`, `version`, `request`, `response`, `description` fields

**Completion criterion:** All 7 contract files exist, TypeScript compiles, `index.ts` exports `CONTRACTS` array with 7 entries.

**Human review:** no

---

### Step 2. Create contract validator and list handlers

**Goal:** Implement `runContractValidate` and `runContractList` command handlers.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/contract/contract-validator.ts`
- Implement `runContractValidate` — loads `CONTRACTS` from registry, for each contract checks:
  - CONTRACT-01: schema is valid Zod (attempt `schema.parse({})` or `schema.safeParse()`)
  - CONTRACT-02: contract has both `request` and `response` schemas
  - CONTRACT-03: site-side code imports the contract (scan `packages/werkstatt-site/src/domain/` for `from ".*contract"` imports matching contract id)
  - CONTRACT-04: service-side code imports the contract (scan `services/*/src/` for `from ".*contract"` imports matching contract id)
  - CONTRACT-05: both sides reference same contract id and version
- CONTRACT-03 and CONTRACT-04 emit `warning` severity during grace period
- Use `diagnosticsResult("contract.validate", diagnostics)` from `../result-helpers.ts`
- Implement `runContractList` — returns `{ contracts: [{ id, name, direction, version, description }] }` from `CONTRACTS` registry
- Import `Diagnostic` type from `@warpgogol/werkstatt/kernel`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run contract.validate --json` — command executes and returns diagnostics
- `pnpm exec werkstatt run contract.list --json` — command executes and returns contract list

**Completion criterion:** Both commands execute without errors, return valid JSON, `contract.validate` emits warnings (not errors) for missing imports during grace period.

**Human review:** no

---

### Step 3. Register commands in command table and pipeline

**Goal:** Wire `contract.validate` and `contract.list` into the command registry and `PACKAGES_CHECK_PIPELINE`.

**Agent actions:**

- Add two entries to `CODEGEN_COMMANDS` in `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts`:
  - `{ name: "contract.validate", description: "RFC-0827: validate site-service contract schemas...", scope: "workspace", flags: {}, reads: ["packages/werkstatt-site/src/testing/contract/**/*.ts", "packages/werkstatt-site/src/domain/**/*.ts", "services/*/src/**/*.ts"], modulePaths: ["contract-validator.ts"], execute: runContractValidate }`
  - `{ name: "contract.list", description: "RFC-0827: list all registered site-service contracts.", scope: "workspace", flags: {}, cacheable: false, execute: runContractList }`
- Import `runContractValidate` and `runContractList` from `../testing/contract/contract-validator.ts`
- Add `{ command: "contract.validate" }` to `PACKAGES_CHECK_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/packages-check.ts` after `{ command: "props.contract.validate" }` (line 149)
- Add CHANGE_SUMMARY entry: `<item>RFC-0827: Add contract.validate after props.contract.validate.</item>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run contract.validate --json` — command is registered and executes
- `pnpm exec werkstatt run contract.list --json` — command is registered and executes
- `pnpm exec werkstatt run packages-check.run --json` — pipeline includes contract.validate

**Completion criterion:** Both commands appear in `command.manifest.validate` output, `contract.validate` runs in `packages-check.run` pipeline.

**Human review:** no

---

### Step 4. Add subpath export

**Goal:** Enable services to import contract schemas via `@warpgogol/werkstatt-site/testing/contract`.

**Agent actions:**

- Add to `packages/werkstatt-site/package.json` `exports` field:
  - `"./testing/contract": "./src/testing/contract/index.ts"`
  - `"./testing/contract/*": "./src/testing/contract/*.ts"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm install --no-frozen-lockfile` — lockfile resolves new export

**Completion criterion:** `@warpgogol/werkstatt-site/testing/contract` resolves from `services/*/src/*.ts` imports.

**Human review:** no

---

### Step 5. Update handlers to import contracts

**Goal:** Wire `send-message` and `integration-route` handlers to use contract schemas for validation.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts`:
  - Import `SendMessageRequestSchema` from `@warpgogol/werkstatt-site/testing/contract`
  - Replace manual `normalizeString`/validation logic with `SendMessageRequestSchema.safeParse(payload)` for the request body
  - Keep existing error response shapes ({ ok: false, error: "..." }) — they match `SendMessageResponseSchema`
- In `packages/werkstatt-site/src/domain/integration/delivery-handler.ts`:
  - Import `IntegrationRouteRequestSchema` from `@warpgol/werkstatt-site/testing/contract` (which re-exports `IntegrationEventSchema`)
  - The handler already uses `IntegrationEventSchema.safeParse(raw)` — swap the import to use the contract re-export so the import checker detects the contract reference
- Do NOT change runtime behavior — only swap the import source to the contract re-export

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests pass
- `pnpm exec werkstatt run contract.validate --json` — CONTRACT-03 and CONTRACT-04 pass for `send-message` and `integration-route` (no more warnings for these two)

**Completion criterion:** Both handlers import from `@warpgogol/werkstatt-site/testing/contract`, `contract.validate` reports zero warnings for these two contracts.

**Human review:** no

---

### Step 6. Write unit tests for contract validator

**Goal:** Add unit tests for `runContractValidate` and `runContractList`.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/contract/tests/contract-validator.test.ts`
- Test cases:
  - `contract.validate` returns pass status with zero errors when all contracts are valid
  - `contract.validate` emits CONTRACT-01 when a schema is invalid Zod
  - `contract.validate` emits CONTRACT-02 when contract is missing request or response
  - `contract.validate` emits CONTRACT-03 (warning) when site code doesn't import contract
  - `contract.validate` emits CONTRACT-04 (warning) when service code doesn't import contract
  - `contract.list` returns all 7 contracts with correct id, name, direction, version
  - `contract.validate` handles empty contracts registry gracefully (warning, not error)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All test cases pass, test file covers all 5 CONTRACT rules.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Document the contract testing convention in `packages/werkstatt-site/AGENTS.md`.

**Agent actions:**

- Add a "Contract testing" section to `packages/werkstatt-site/AGENTS.md`:
  - Contract schemas live in `packages/werkstatt-site/src/testing/contract/`
  - Services import via `@warpgogol/werkstatt-site/testing/contract` subpath export
  - `contract.validate` runs in `PACKAGES_CHECK_PIPELINE` — CI gate
  - CONTRACT-03/04 are warnings during 4-week grace period, then escalate to errors
  - Grace period escalation date: <calculated from implementation date + 4 weeks>
  - To add a new contract: create `*.contract.ts` file, register in `index.ts` `CONTRACTS` array

**Validation:**

- File exists and contains the new section

**Completion criterion:** `packages/werkstatt-site/AGENTS.md` documents contract testing convention with subpath export, pipeline integration, and grace period.

**Human review:** no

---

### Step 8. Run ecosystem manifest generation

**Goal:** Update generated command manifest to include the new commands.

**Agent actions:**

- Run `pnpm exec werkstatt run command.manifest.generate` to regenerate `docs/commands.generated.md` and `docs/ecosystem.generated.yaml` with `contract.validate` and `contract.list`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if needed

**Validation:**

- `pnpm exec werkstatt run command.manifest.validate --json` — manifest is fresh
- `pnpm exec werkstatt run ecosystem.manifest.validate --json` — ecosystem manifest is fresh

**Completion criterion:** Generated manifests include `contract.validate` and `contract.list`, validation passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` is updated (Step 7)
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0827` — RFC passes validation
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run packages-check.run --json` — full pipeline passes including `contract.validate`
- Run `pnpm exec werkstatt run command.manifest.validate --json` — manifest is fresh
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0827 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0827` — passes
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — passes
- `pnpm --filter @warpgogol/werkstatt-site run test` — passes
- `pnpm exec werkstatt run packages-check.run --json` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0827`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run packages-check.run --json`
- `pnpm exec werkstatt run command.manifest.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0827` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Contract drift from runtime behavior | Step 5 updates handlers to import and use contract schemas for runtime validation, not just testing |
| False positives from import checking | Step 2 uses warning severity during grace period; Step 7 documents the limitation |
| Grace period enforcement relies on agent discipline | Step 7 documents escalation date in AGENTS.md; Step 3 adds to CI pipeline |
| Contract schema duplication of IntegrationEventSchema | Step 1 re-exports IntegrationEventSchema for integration-route contract; Step 5 swaps import source to contract re-export |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-66, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0827 --reason "..." --invariant "DNA-66"` instead of working around it.
- If the subpath export causes pnpm resolution issues with services, check `packages/AGENTS.md` "Cross-package imports" section and ensure the export is declared before adding imports.
