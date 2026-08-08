---
rfcId: RFC-0751
planId: PLAN-RFC-0751-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-check-warpgogol"
  services:
    - matomo-proxy
    - rate-fetcher-worker
    - lagebild-sync-worker
    - telegram-alert-bridge
  docs:
    - AGENTS.md
    - services/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0751

## 1. Objectives

- [ ] O1 — Extend `serviceEntrySchema` in `@warpgogol/ontology` with deployment fields (`kind`, `url`, `publicEndpoints`, `routes`, `upstreams`, `lastDeployed`, `healthCheckPath`) — maps to acceptance criterion "systems/registry.yaml has a services: key with entries"
- [ ] O2 — Implement `leitstand.service.deploy` command in `@warpgogol/site-kernel-handoff` — maps to acceptance criterion "leitstand.service.deploy command registered" and "leitstand.service.deploy --service matomo-proxy successfully deploys"
- [ ] O3 — Implement `service.registry.validate` and `service.naming.validate` in `@warpgogol/site-kernel-checks` — maps to acceptance criteria "service.registry.validate command registered" and "service.naming.validate command registered"
- [ ] O4 — Integrate `service.naming.validate` into `services.check.run` in `@warpgogol/site-kernel-check-warpgogol` — maps to acceptance criterion "service.naming.validate is integrated into services.check.run"
- [ ] O5 — Register 4 CF Worker services in `systems/registry.yaml` and rename Workers in `wrangler.jsonc` — maps to acceptance criteria "All Worker names match service IDs" and "systems/registry.yaml systems[] entries have cloudflareZoneId"
- [ ] O6 — Remove per-service `deploy` scripts from `services/*/package.json` — maps to forward-only discipline
- [ ] O7 — Update documentation and run validation suite — maps to acceptance criterion "AGENTS.md updated" and "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/sternsystem.ts` — extend `serviceEntrySchema` with deployment fields
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `runLeitstandServiceDeploy` function
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — register `leitstand.service.deploy` command
- `packages/os/site-kernel-checks/src/command-tables/30-check-warpgogol.ts` — register `service.registry.validate` and `service.naming.validate`
- `packages/os/site-kernel-checks/src/services/service-registry-validate.ts` — new file: `runServiceRegistryValidate`
- `packages/os/site-kernel-checks/src/services/service-naming-validate.ts` — new file: `runServiceNamingValidate`
- `packages/os/site-kernel-check-warpgogol/src/commands/services-check.ts` — integrate `service.naming.validate` into `runServicesCheckRun`
- `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts` — add `findServiceEntry` helper

### 2.2 Configuration and data

- `systems/registry.yaml` — add `services:` key with 4 CF Worker service entries; add `cloudflareZoneId` to `systems[]` entries if missing
- `services/rate-fetcher-worker/wrangler.jsonc` — rename `gogol-rate-fetcher` → `rate-fetcher-worker`
- `services/lagebild-sync-worker/wrangler.jsonc` — rename `gogol-lagebild-sync` → `lagebild-sync-worker`
- `services/matomo-proxy/wrangler.jsonc` — already `matomo-proxy`, no change
- `services/telegram-alert-bridge/wrangler.jsonc` — already `telegram-alert-bridge`, no change
- `services/matomo-proxy/package.json` — remove `deploy` script
- `services/rate-fetcher-worker/package.json` — remove `deploy` script
- `services/lagebild-sync-worker/package.json` — remove `deploy` script
- `services/telegram-alert-bridge/package.json` — remove `deploy` script

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add service deployment protocol section
- `services/AGENTS.md` — update env-and-deploy contract section with `leitstand.service.deploy` as sole entry point
- `docs/COMMANDS.md` — add `leitstand.service.deploy`, `service.registry.validate`, `service.naming.validate`

### 2.4 Validation and pipelines

- `service.naming.validate` joins `services.check.run` pipeline
- `service.registry.validate` is a standalone pre-deploy gate
- Unit tests in `packages/os/site-kernel-handoff/src/tests/leitstand-service-deploy.test.ts`
- Unit tests in `packages/os/site-kernel-checks/src/tests/service-registry-validate.test.ts`
- Unit tests in `packages/os/site-kernel-checks/src/tests/service-naming-validate.test.ts`

## 3. Step sequence

### Step 1. Extend `serviceEntrySchema` in ontology

**Goal:** Add deployment fields to the existing `serviceEntrySchema` so the registry can track deployment state.

**Agent actions:**

- Add fields to `serviceEntrySchema` in `packages/ontology/src/operations/sternsystem.ts`:
  - `kind: z.enum(["proxy-worker", "scheduled-worker"])`
  - `url: z.string().url()`
  - `publicEndpoints: z.boolean().default(false)`
  - `routes: z.array(z.string()).optional()`
  - `upstreams: z.array(z.string()).optional()`
  - `lastDeployed: z.object({ at: z.string().datetime().nullable(), state: z.enum(["succeeded", "failed"]).nullable(), operationId: z.string().nullable() }).default({ at: null, state: null, operationId: null })`
  - `healthCheckPath: z.string().optional()`
- Update `CHANGE_SUMMARY` with RFC-0751 entry
- Export `ServiceEntry` type (already exported, will pick up new fields automatically)

**Validation:**

- `rtk pnpm --filter @warpgogol/ontology build:check`

**Completion criterion:** `serviceEntrySchema` includes all RFC-0751 fields; `build:check` passes.

**Human review:** no

---

### Step 2. Add `findServiceEntry` helper to registry-io

**Goal:** Provide a helper to look up service entries by id, analogous to `findEntry` for systems.

**Agent actions:**

- Add `findServiceEntry(registry: FleetRegistry, id: string): ServiceEntry | undefined` to `packages/os/site-kernel-handoff/src/sternsystem/registry-io.ts`
- Export it from the module

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `findServiceEntry` is exported and returns the matching service entry or undefined.

**Human review:** no

---

### Step 3. Implement `leitstand.service.deploy`

**Goal:** Create the centralized service deployment command with preflight, subdomain validation, wrangler deploy, health check, and state recording.

**Agent actions:**

- Add `runLeitstandServiceDeploy` to `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  1. Read registry, find service entry by `--service <id>`
  2. Run `deploy.preflight --service <id>` via `executeKernelCommand`
  3. Run `subdomain.validate` (RFC-0752) via `executeKernelCommand`; if "not registered", call `subdomain.register`
  4. Execute `npx wrangler deploy --config wrangler.jsonc --name <workerName> --secrets-file .env` from the service directory
  5. Health check: if `publicEndpoints: true`, fetch `workersDevUrl + healthCheckPath` (default `/`), expect non-5xx
  6. Record state: update `lastDeployed` in registry with atomic write (staging + rename)
  7. Return `ServiceDeployResult` JSON
- Register `leitstand.service.deploy` in `packages/os/site-kernel-handoff/src/leitstand/index.ts`:
  - `scope: "workspace"`
  - `flags: { service: { kind: "string", required: true } }`
  - `writes: ["systems/registry.yaml"]`
  - `reads: ["systems/registry.yaml", "services/<id>/**"]`
  - `mutatesState: true`
- Handle `workersDevUrl` resolution: extract from wrangler stdout, fallback to `CLOUDFLARE_ACCOUNT_ID` env var, fallback to `healthState: "unknown"`

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** `leitstand.service.deploy` is registered in the kernel command table; `build:check` passes.

**Human review:** no

---

### Step 4. Implement `service.registry.validate`

**Goal:** Validate the service registry structure and cross-check with `service.config.yaml`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/services/service-registry-validate.ts` with `runServiceRegistryValidate`:
  1. Parse `systems/registry.yaml`, extract `services:` key
  2. For each entry: validate `id`, `workerName`, `url`, `kind`, `hostedBy` are present and non-empty
  3. Cross-check with `services/<id>/service.config.yaml` — ensure `id`, `kind`, and `routes` match
  4. Check for duplicate `id` or `workerName`
  5. Validate `workerName === id`
  6. Report diagnostics with rule IDs `SVC-REG-01` through `SVC-REG-05`
- Register in `packages/os/site-kernel-checks/src/command-tables/30-check-warpgogol.ts`:
  - `name: "service.registry.validate"`
  - `scope: "workspace"`
  - `reads: ["systems/registry.yaml", "services/*/service.config.yaml"]`

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-checks build:check`

**Completion criterion:** `service.registry.validate` is registered; `build:check` passes.

**Human review:** no

---

### Step 5. Implement `service.naming.validate`

**Goal:** Enforce Worker name = service ID = directory name = package.json name.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/services/service-naming-validate.ts` with `runServiceNamingValidate`:
  1. For each `services:` entry in registry:
     - `workerName` must equal `id`
     - `services/<id>/wrangler.jsonc` `name` must equal `id`
     - `services/<id>/service.config.yaml` `id` must equal `id`
     - `services/<id>/package.json` `name` must equal `id` (or `@warpgogol/<id>`)
     - Directory `services/<id>/` must exist
  2. Report diagnostics with rule IDs `SVC-NAME-01` through `SVC-NAME-05`
- Register in `packages/os/site-kernel-checks/src/command-tables/30-check-warpgogol.ts`:
  - `name: "service.naming.validate"`
  - `scope: "workspace"`
  - `reads: ["systems/registry.yaml", "services/*/wrangler.jsonc", "services/*/service.config.yaml", "services/*/package.json"]`

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-checks build:check`

**Completion criterion:** `service.naming.validate` is registered; `build:check` passes.

**Human review:** no

---

### Step 6. Integrate `service.naming.validate` into `services.check.run`

**Goal:** Run naming validation as part of the existing services check pipeline.

**Agent actions:**

- Update `runServicesCheckRun` in `packages/os/site-kernel-check-warpgogol/src/commands/services-check.ts`:
  - Import `runServiceNamingValidate` from `@warpgogol/site-kernel-checks/services/service-naming-validate` (add subpath export if needed)
  - Call it alongside `runServicesWorkspaceValidate` and `runCheckWarpgogolRunnerValidate`
  - Merge diagnostics into the result

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-check-warpgogol build:check`

**Completion criterion:** `services.check.run` includes naming diagnostics in its output; `build:check` passes.

**Human review:** no

---

### Step 7. Register services in `systems/registry.yaml`

**Goal:** Add `services:` key with 4 CF Worker service entries and `cloudflareZoneId` to `systems[]` entries.

**Agent actions:**

- Add `services:` key to `systems/registry.yaml` with entries for:
  - `matomo-proxy` (kind: proxy-worker, workerName: matomo-proxy, url: https://matomo-proxy.warpgogol.com, publicEndpoints: true, routes: [/_wg/analytics/*], upstreams: [matomo-cloud], subdomains: [{domain: matomo-proxy.warpgogol.com, zone: warpgogol.com}], lastDeployed: {at: null, state: null, operationId: null})
  - `rate-fetcher-worker` (kind: scheduled-worker, workerName: rate-fetcher-worker, url: "", publicEndpoints: false, lastDeployed: {at: null, state: null, operationId: null})
  - `lagebild-sync-worker` (kind: scheduled-worker, workerName: lagebild-sync-worker, url: "", publicEndpoints: false, lastDeployed: {at: null, state: null, operationId: null})
  - `telegram-alert-bridge` (kind: proxy-worker, workerName: telegram-alert-bridge, url: "", publicEndpoints: true, lastDeployed: {at: null, state: null, operationId: null})
- Add `cloudflareZoneId` to each `systems[]` entry that lacks it (if not already present from RFC-0752)

**Validation:**

- `rtk pnpm exec site-kernel run service.registry.validate`
- `rtk pnpm exec site-kernel run sternsystem.validate`

**Completion criterion:** `service.registry.validate` passes on the initial registry; `sternsystem.validate` passes.

**Human review:** no

---

### Step 8. Rename Workers in `wrangler.jsonc`

**Goal:** Update Worker names to match service IDs (directory names).

**Agent actions:**

- `services/rate-fetcher-worker/wrangler.jsonc`: change `"name": "gogol-rate-fetcher"` → `"name": "rate-fetcher-worker"`
- `services/lagebild-sync-worker/wrangler.jsonc`: change `"name": "gogol-lagebild-sync"` → `"name": "lagebild-sync-worker"`
- `services/matomo-proxy/wrangler.jsonc`: already `"matomo-proxy"` — no change
- `services/telegram-alert-bridge/wrangler.jsonc`: already `"telegram-alert-bridge"` — no change

**Validation:**

- `rtk pnpm exec site-kernel run service.naming.validate`

**Completion criterion:** `service.naming.validate` passes on all 4 services.

**Human review:** no — but operator must manually delete old Workers (`gogol-rate-fetcher`, `gogol-lagebild-sync`) from Cloudflare after deployment.

---

### Step 9. Remove per-service `deploy` scripts

**Goal:** Eliminate the dual-path; `leitstand.service.deploy` is the sole entry point.

**Agent actions:**

- Remove `deploy` script from `services/matomo-proxy/package.json`
- Remove `deploy` script from `services/rate-fetcher-worker/package.json`
- Remove `deploy` script from `services/lagebild-sync-worker/package.json`
- Remove `deploy` script from `services/telegram-alert-bridge/package.json`
- If any service has a `deploy:main` or `deploy:alt` script, remove those too

**Validation:**

- `rtk pnpm exec site-kernel run deploy.scripts.validate`
- `rtk pnpm exec site-kernel run env.contract.validate`

**Completion criterion:** No `deploy` scripts in CF Worker service `package.json` files; `deploy.scripts.validate` and `env.contract.validate` pass.

**Human review:** no

---

### Step 10. Write unit tests

**Goal:** Cover all 3 new commands with unit tests.

**Agent actions:**

- `packages/os/site-kernel-handoff/src/tests/leitstand-service-deploy.test.ts`:
  - Test: service not in registry → exit non-zero
  - Test: `deploy.preflight` failure → blocks deploy
  - Test: successful deploy → state recorded in registry
  - Test: health check skipped for `publicEndpoints: false`
  - Test: health check failure → `healthState: "unhealthy"`, exit non-zero
  - Mock `executeKernelCommand` for `deploy.preflight` and `subdomain.validate`
  - Mock wrangler deploy via `CommandRunner` injection
- `packages/os/site-kernel-checks/src/tests/service-registry-validate.test.ts`:
  - Test: valid registry → pass
  - Test: missing `workerName` → SVC-REG-01 error
  - Test: duplicate `id` → SVC-REG-04 error
  - Test: `workerName !== id` → SVC-REG-05 error
  - Test: cross-check with `service.config.yaml` mismatch → error
- `packages/os/site-kernel-checks/src/tests/service-naming-validate.test.ts`:
  - Test: all names match → pass
  - Test: `wrangler.jsonc` name mismatch → SVC-NAME-02 error
  - Test: `service.config.yaml` id mismatch → SVC-NAME-03 error
  - Test: directory missing → SVC-NAME-05 error

**Validation:**

- `rtk pnpm --filter @warpgogol/site-kernel-handoff test`
- `rtk pnpm --filter @warpgogol/site-kernel-checks test`

**Completion criterion:** All tests pass.

**Human review:** no

---

### Step 11. Update documentation

**Goal:** Update AGENTS.md files and COMMANDS.md with the new protocol.

**Agent actions:**

- Update `services/AGENTS.md`:
  - Replace per-service deploy script instructions with `leitstand.service.deploy --service <id>` as the sole entry point
  - Note that per-service `deploy` scripts are removed
  - Add `service.registry.validate` and `service.naming.validate` to validation section
- Update root `AGENTS.md`:
  - Add service deployment protocol to the services section
  - Reference RFC-0751
- Update `docs/COMMANDS.md`:
  - Add `leitstand.service.deploy`, `service.registry.validate`, `service.naming.validate` with descriptions and flags

**Validation:**

- `rtk pnpm exec site-kernel run rfc.validate --id RFC-0751`

**Completion criterion:** All 3 docs updated; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0751 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0751`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0751`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0751`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-check-warpgogol build:check`
- `pnpm exec site-kernel run service.registry.validate`
- `pnpm exec site-kernel run service.naming.validate`
- `pnpm exec site-kernel run services.check.run`
- `pnpm exec site-kernel run deploy.scripts.validate`
- `pnpm exec site-kernel run env.contract.validate`
- `pnpm exec site-kernel run sternsystem.validate`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0751`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0751.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0751` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Registry drift | Step 4 (`service.registry.validate`) cross-checks registry with `service.config.yaml` |
| Health check false negatives | Step 1 adds `healthCheckPath` field; Step 3 uses it with `/` default |
| Worker renaming disruption | Step 8 renames Workers; operator manually deletes old Workers after verification |
| Dependency on RFC-0752 | Step 3 calls `subdomain.validate` via `executeKernelCommand`; gracefully skips with warning if RFC-0752 not yet implemented |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40 (env-example and deploy-script contract), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0751 --reason "..." --invariant "DNA-40"` instead of working around it.
- If `sternsystem.validate` rejects the `services:` key despite the schema accepting it, investigate whether the validate command has a separate unknown-key check that needs updating.
