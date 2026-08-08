---
rfcId: RFC-0752
planId: PLAN-RFC-0752-01
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
  services: []
  docs:
    - "packages/os/site-kernel-handoff/AGENTS.md"
    - "docs/rfcs/rfc-0752-subdomain-management-protocol.md"
---

# Implementation Plan: RFC-0752

## 1. Objectives

- [ ] O1 — Add `cloudflareZoneId` to `fleetRegistryEntrySchema` and `services` with `subdomains[]` to `fleetRegistrySchema` in `@warpgogol/ontology` (maps to acceptance criterion: "systems/registry.yaml systems[] entries have cloudflareZoneId field")
- [ ] O2 — Create Cloudflare REST API client for DNS records and Workers routes (maps to acceptance criterion: "subdomain.register --service matomo-proxy creates DNS CNAME + Workers route")
- [ ] O3 — Implement `subdomain.register` command with idempotency (maps to acceptance criteria: "subdomain.register command registered", "subdomain.register is idempotent")
- [ ] O4 — Implement `subdomain.validate` command (maps to acceptance criteria: "subdomain.validate command registered", "reports valid after registration", "reports not-registered", "reports mismatched")
- [ ] O5 — Implement `subdomain.list` command (maps to acceptance criterion: "subdomain.list command registered", "returns all subdomains in the zone")
- [ ] O6 — Register subdomain module in kernel config and export from site-kernel-handoff barrel (maps to all command registration criteria)
- [ ] O7 — Update AGENTS.md with subdomain protocol documentation (maps to architectural fit documentation)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/sternsystem.ts` — add `cloudflareZoneId` to `fleetRegistryEntrySchema`, add `serviceSubdomainSchema` + `serviceEntrySchema` + `services` field to `fleetRegistrySchema`
- `packages/os/site-kernel-handoff/src/subdomain/` — new directory:
  - `subdomain-register.ts` — `runSubdomainRegister` handler
  - `subdomain-validate.ts` — `runSubdomainValidate` handler
  - `subdomain-list.ts` — `runSubdomainList` handler
  - `subdomain.module.ts` — `createSubdomainModule()` kernel module with command registrations
  - `index.ts` — barrel re-exports
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-api.ts` — new Cloudflare REST API client (DNS records + Workers routes), separate from `cloudflare-workers.ts` wrangler adapter
- `packages/os/site-kernel-handoff/src/index.ts` — export `createSubdomainModule`
- `packages/os/site-kernel-handoff/package.json` — add `subdomain-module` subpath export
- `tools/kernel.config.ts` — register `subdomain` module loader

### 2.2 Configuration and data

- `systems/registry.yaml` — `cloudflareZoneId` field on `systems[]` entries (operator-populated, not code-generated)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document subdomain command family and Cloudflare API client
- `docs/rfcs/rfc-0752-subdomain-management-protocol.md` — read-only reference (acceptance criteria source of truth)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ontology build:check` — schema changes compile
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — command handlers compile
- `pnpm exec site-kernel run rfc.validate --id RFC-0752` — RFC validation passes
- Unit tests for all three commands + Cloudflare API client

## 3. Step sequence

### Step 1. Ontology schema changes

**Goal:** Add `cloudflareZoneId` to fleet registry entry schema and `services` with `subdomains[]` to fleet registry schema.

**Agent actions:**

- Add `cloudflareZoneId: z.string().optional()` to `fleetRegistryEntrySchema` in `packages/ontology/src/operations/sternsystem.ts`
- Add `serviceSubdomainSchema` (fields: `domain: string`, `zone: string`) and `serviceEntrySchema` (fields: `id: string`, `workerName: string`, `hostedBy: z.enum(["studio"])`, `subdomains: array(serviceSubdomainSchema)`)
- Add `services: z.array(serviceEntrySchema).optional()` to `fleetRegistrySchema`
- Export new types: `ServiceSubdomain`, `ServiceEntry`
- Update `CHANGE_SUMMARY` comment with RFC-0752 entry

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check`

**Completion criterion:** `fleetRegistryEntrySchema` accepts `cloudflareZoneId`, `fleetRegistrySchema` accepts `services`, build passes.

**Human review:** no

---

### Step 2. Cloudflare REST API client

**Goal:** Create a thin Cloudflare REST API client for DNS records and Workers routes.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-api.ts`
- Implement functions:
  - `listDnsRecords(zoneId, apiToken, name?)` — `GET /zones/{zone_id}/dns_records` with optional `name` query param
  - `createDnsRecord(zoneId, apiToken, record)` — `POST /zones/{zone_id}/dns_records`
  - `listWorkersRoutes(zoneId, apiToken)` — `GET /zones/{zone_id}/workers/routes` (no pattern filter — filter client-side)
  - `createWorkersRoute(zoneId, apiToken, route)` — `POST /zones/{zone_id}/workers/routes`
- Use `fetch` with `Authorization: Bearer ${apiToken}` header (same pattern as `cache-purge.ts`)
- Add MODULE_CONTRACT and CHANGE_SUMMARY comments
- Export from `leitstand/adapters/index.ts` barrel if one exists, otherwise import directly

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Cloudflare API client compiles, exports all 4 functions, uses Bearer token auth.

**Human review:** no

---

### Step 3. Implement subdomain.register

**Goal:** Create the `subdomain.register` command handler with idempotency.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/subdomain/subdomain-register.ts`
- Implement `runSubdomainRegister(input, context)`:
  1. Read `--service` flag, resolve service entry from `systems/registry.yaml` `services[]`
  2. For each subdomain in `service.subdomains[]`:
     a. Resolve zone ID from `systems[]` entry matching `subdomain.zone` → `cloudflareZoneId`
     b. Resolve `<account>` fallback: `workersDevUrl` from service entry → `CLOUDFLARE_ACCOUNT_ID` env → error
     c. Check existing DNS record via `listDnsRecords(zoneId, token, name)` — skip if correct, error if wrong, create if missing
     d. Check existing Workers route via `listWorkersRoutes(zoneId, token)` + client-side filter — skip if correct, error if wrong, create if missing
  3. Return `SubdomainRegisterResult` with `state: "registered" | "already-registered" | "failed"`
- Use `readRegistry` from `../sternsystem/registry-io.ts`
- Use `sourceDotenv` + `filterEnv` from `../leitstand/adapters/cloudflare-workers.ts` for env resolution
- Error handling per RFC failure modes table (exit code 1 for errors, clear messages)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Handler compiles, implements idempotency check-before-create, returns structured result.

**Human review:** no

---

### Step 4. Implement subdomain.validate

**Goal:** Create the `subdomain.validate` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/subdomain/subdomain-validate.ts`
- Implement `runSubdomainValidate(input, context)`:
  1. Read `--service` flag, resolve service entry
  2. For each subdomain: resolve zone ID, check DNS record (exists? correct type? correct target? proxied?), check Workers route (exists? correct pattern? correct script?)
  3. Return `SubdomainValidateResult` with `state: "valid" | "not-registered" | "mismatched"`
  4. Exit code 0 for all validation states (not-registered and mismatched are validation results, not errors)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Handler compiles, returns correct state for valid/not-registered/mismatched, exit code 0 for all validation results.

**Human review:** no

---

### Step 5. Implement subdomain.list

**Goal:** Create the `subdomain.list` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/subdomain/subdomain-list.ts`
- Implement `runSubdomainList(input, context)`:
  1. Read `--zone` flag, resolve zone ID from `systems[]` entry
  2. List all DNS records via `listDnsRecords(zoneId, token)`
  3. List all Workers routes via `listWorkersRoutes(zoneId, token)`
  4. Cross-reference DNS records to Workers routes by domain name
  5. Return `SubdomainListResult` with `subdomains: SubdomainListEntry[]`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Handler compiles, returns cross-referenced list of subdomains with DNS and route state.

**Human review:** no

---

### Step 6. Create subdomain kernel module and wire into config

**Goal:** Register all three commands in a kernel module and wire it into the workspace kernel config.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/subdomain/subdomain.module.ts`:
  - `createSubdomainModule()` returns `KernelModule` with lazy `register()`
  - Register `subdomain.register` (flags: `service` required), `subdomain.validate` (flags: `service` required), `subdomain.list` (flags: `zone` required)
  - All commands: `scope: "workspace"`, `supportsAllSites: false`, `reads: ["systems/registry.yaml"]`
- Create `packages/os/site-kernel-handoff/src/subdomain/index.ts` barrel
- Export `createSubdomainModule` from `packages/os/site-kernel-handoff/src/index.ts`
- Add `"./subdomain-module"` subpath export to `packages/os/site-kernel-handoff/package.json`
- Add `subdomain: async () => (await import("@warpgogol/site-kernel-handoff/subdomain-module")).createSubdomainModule()` to `tools/kernel.config.ts` `moduleLoaders`
- Update `MODULE_MAP` and `CHANGE_SUMMARY` in `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm exec site-kernel run command.manifest.generate` (regenerate command manifest)

**Completion criterion:** All three commands appear in the command manifest, module loads without error.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Write unit tests for all command handlers and the Cloudflare API client.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/subdomain-register.test.ts`:
  - Test idempotent registration (mock API returns existing record → state "already-registered")
  - Test new registration (mock API returns empty → create called → state "registered")
  - Test mismatched DNS record (existing record with wrong target → error)
  - Test missing `CLOUDFLARE_API_TOKEN` → clear error
  - Test missing `cloudflareZoneId` in registry → clear error
  - Test `<account>` fallback chain: `workersDevUrl` → `CLOUDFLARE_ACCOUNT_ID` → error
- Create `packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts`:
  - Test `valid` state (both DNS + route exist and correct)
  - Test `not-registered` state (either missing)
  - Test `mismatched` state (either exists but wrong target/script)
- Create `packages/os/site-kernel-handoff/src/tests/subdomain-list.test.ts`:
  - Test cross-referencing DNS records with Workers routes
  - Test empty zone
- Create `packages/os/site-kernel-handoff/src/tests/cloudflare-api.test.ts`:
  - Test `listDnsRecords` with and without name filter
  - Test `createDnsRecord` sends correct payload
  - Test `listWorkersRoutes` returns all routes
  - Test `createWorkersRoute` sends correct payload
  - Test auth header is set correctly
- Use `tmp-*` naming for temp directories per services/AGENTS.md
- Write minimal `package.json` to temp dirs (per memory: `resolveCurrentEcosystem` reads it)
- Mock `fetch` for API client tests

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All tests pass, covering idempotency, validation states, list cross-referencing, API client, and error cases.

**Human review:** no

---

### Step 8. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md` with subdomain command family documentation and Cloudflare API client note
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0752 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0752`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0752`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0752` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Cloudflare API rate limits | Step 3: per-subdomain API calls, not bulk; idempotency allows safe re-runs |
| Token permissions insufficient | Step 3: clear error message listing required permissions |
| Zone ID drift | Step 4: `subdomain.validate` reports mismatch |
| Race condition (TOCTOU) | Step 3: idempotency check before create; Cloudflare API rejects duplicate CNAMEs |
| `cloudflareZoneId` missing in registry | Steps 3-5: clear error pointing to the `systems[]` entry |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0752 --reason "..." --invariant "DNA-40"` instead of working around it.
- If the Cloudflare API does not support the endpoints described in the RFC, create an amending RFC with `amends: [RFC-0752]` to document the actual API surface.
