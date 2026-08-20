---
rfcId: RFC-0896
planId: PLAN-RFC-0896-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - AGENTS.md
    - docs/audits/audit-rfc-0896-custom-domain-dns-and-www-redirect.md
---

# Implementation Plan: RFC-0896

## 1. Objectives

- [ ] Objective 1 — Create `customdomain.register` command that idempotently creates a proxied A record + Workers route for the apex domain — maps to acceptance criterion [`customdomain.register` creates a proxied A record...]
- [ ] Objective 2 — Create `redirect.register` command that idempotently creates a proxied CNAME + Cloudflare Redirect Rule for www→apex 301 — maps to acceptance criterion [`redirect.register` creates a proxied CNAME record...]
- [ ] Objective 3 — Wire both commands into `runLeitstandPromote` before `executeDeployPhases` — maps to acceptance criterion [`runLeitstandPromote` calls both commands...]
- [ ] Objective 4 — Extend `cloudflare-api.ts` with Rulesets API functions for Redirect Rules — maps to acceptance criterion [`cloudflare-api.ts` extended with `getRedirectRuleset`...]
- [ ] Objective 5 — Unit tests covering create, idempotent skip, mismatch error for both commands — maps to acceptance criterion [Unit tests for both commands...]
- [ ] Objective 6 — Update `AGENTS.md` with custom domain and redirect registration pipeline step — maps to acceptance criterion [`AGENTS.md` updated...]
- [ ] Objective 7 — `rfc.validate` passes with zero errors — maps to acceptance criterion [`rfc.validate` passes...]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/customdomain/customdomain.module.ts` — new kernel module (analogous to `subdomain.module.ts`)
- `packages/werkstatt/src/customdomain/customdomain-register.ts` — `customdomain.register` handler
- `packages/werkstatt/src/customdomain/redirect-register.ts` — `redirect.register` handler
- `packages/werkstatt/src/customdomain/customdomain-helpers.ts` — shared helpers (resolve config, build payloads)
- `packages/werkstatt/src/customdomain/index.ts` — barrel re-exports
- `packages/werkstatt/src/handoff/index.ts` — add `createCustomdomainModule` export
- `packages/werkstatt/src/leitstand/adapters/cloudflare-api.ts` — add `getRedirectRuleset`, `createRedirectRule`
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — wire both commands into `runLeitstandPromote` before `executeDeployPhases`
- `tools/kernel.config.ts` — register `customdomain` module loader
- `packages/werkstatt/src/customdomain/customdomain-register.test.ts` — unit tests
- `packages/werkstatt/src/customdomain/redirect-register.test.ts` — unit tests

### 2.2 Configuration and data

- `systems-cache/{system}/system-config.yaml` — read-only: `cloudflareZoneId`, `deployment.channels.main.url`, `deployment.channels.main.workerName`

### 2.3 Documentation and specs

- `AGENTS.md` — add custom domain and redirect registration as a pipeline step in the deployment section
- `docs/audits/audit-rfc-0896-custom-domain-dns-and-www-redirect.md` — audit report (already committed)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0896` — RFC validation

## 3. Step sequence

### Step 1. Extend cloudflare-api.ts with Redirect Rules functions

**Goal:** Add `getRedirectRuleset` and `createRedirectRule` to the Cloudflare API adapter.

**Agent actions:**

- Add `getRedirectRuleset(zoneId, apiToken)` — `GET /zones/{zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, returns the phase ruleset with existing rules.
- Add `createRedirectRule(zoneId, rulesetId, apiToken, rule)` — `POST /zones/{zoneId}/rulesets/{rulesetId}/rules`, appends a single redirect rule.
- Define `CloudflareRedirectRule` type: `{ id: string; description: string; enabled: boolean; action: "redirect"; expression: string; action_parameters: { status_code: number; target_url: { expression: string } } }`.
- Follow the existing `fetchWithRetry` + `authHeaders` pattern used by `listDnsRecords` and `createDnsRecord`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes with new types.

**Completion criterion:** `getRedirectRuleset` and `createRedirectRule` are exported from `cloudflare-api.ts` and TypeScript compiles.

**Human review:** no

---

### Step 2. Create customdomain-helpers.ts

**Goal:** Shared helpers for resolving system config and building DNS/route/redirect payloads.

**Agent actions:**

- `resolveCustomDomainConfig(workspaceRoot, systemId)` — reads `systems-cache/{systemId}/system-config.yaml`, extracts `cloudflareZoneId`, `deployment.channels.main.url` (apex domain), `deployment.channels.main.workerName`.
- `buildApexDnsRecord(domain)` — returns `{ type: "A", name: domain, content: "192.0.2.1", proxied: true }` (TEST-NET-1 placeholder for proxied records).
- `buildApexRoutePattern(domain)` — returns `"{domain}/*"`.
- `buildWwwDnsRecord(apexDomain)` — returns `{ type: "CNAME", name: "www.{apexDomain}", content: apexDomain, proxied: true }`.
- `buildRedirectRuleExpression(wwwDomain)` — returns `(http.host eq "{wwwDomain}")`.
- `buildRedirectRuleDescription(systemId)` — returns `www → apex 301 ({systemId})`.
- `resolveCustomDomainEnv()` — reads `CLOUDFLARE_API_TOKEN` from `process.env`, throws if missing with a descriptive error listing required permissions.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.

**Completion criterion:** All helpers are exported and TypeScript compiles.

**Human review:** no

---

### Step 3. Create customdomain-register.ts (customdomain.register handler)

**Goal:** Implement the `customdomain.register` command handler.

**Agent actions:**

- Define `CustomDomainRegisterResult` interface per RFC TypeScript contract.
- Implement `runCustomdomainRegister(input, context)`:
  1. Parse `--site` via `flagSite(input)`.
  2. Resolve system config via `resolveCustomDomainConfig`.
  3. Resolve env + API token via `resolveCustomDomainEnv`.
  4. Check existing DNS records via `listDnsRecords(zoneId, apiToken, domain)`.
  5. If matching A record exists with `proxied: true`, skip (idempotent). If exists but wrong type/content/proxied, throw with descriptive error.
  6. If missing, create via `createDnsRecord(zoneId, apiToken, { type: "A", name: domain, content: "192.0.2.1", proxied: true })`.
  7. Check existing Workers routes via `listWorkersRoutes(zoneId, apiToken)`.
  8. If matching route exists with correct script, skip. If wrong script, throw.
  9. If missing, create via `createWorkersRoute(zoneId, apiToken, { pattern: "{domain}/*", script: workerName })`.
  10. Return result with `state: "registered" | "already-registered"`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.

**Completion criterion:** `runCustomdomainRegister` is exported and compiles. Follows the same idempotent pattern as `runSubdomainRegister`.

**Human review:** no

---

### Step 4. Create redirect-register.ts (redirect.register handler)

**Goal:** Implement the `redirect.register` command handler.

**Agent actions:**

- Define `RedirectRegisterResult` interface per RFC TypeScript contract.
- Implement `runRedirectRegister(input, context)`:
  1. Parse `--site` via `flagSite(input)`.
  2. Resolve system config via `resolveCustomDomainConfig`.
  3. Resolve env + API token via `resolveCustomDomainEnv`.
  4. Check existing DNS records for `www.{apex}` via `listDnsRecords(zoneId, apiToken, "www.{apex}")`.
  5. If matching CNAME exists with correct content + proxied, skip. If mismatch, throw.
  6. If missing, create via `createDnsRecord(zoneId, apiToken, { type: "CNAME", name: "www.{apex}", content: apex, proxied: true })`.
  7. Fetch existing redirect ruleset via `getRedirectRuleset(zoneId, apiToken)`.
  8. Search existing rules for one matching `www.{apex}` (by expression or description).
  9. If found with correct target + status 301, skip. If mismatch, throw.
  10. If missing, append via `createRedirectRule(zoneId, rulesetId, apiToken, { expression, action: "redirect", action_parameters: { status_code: 301, target_url: { expression: `concat("https://{apex}", http.request.uri.path)` } }, description, enabled: true })`.
  11. Return result with `state: "registered" | "already-registered"`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.

**Completion criterion:** `runRedirectRegister` is exported and compiles.

**Human review:** no

---

### Step 5. Create customdomain.module.ts and barrel

**Goal:** Register both commands in a kernel module.

**Agent actions:**

- Create `customdomain.module.ts` with `createCustomdomainModule()` returning a `KernelModule` that registers `customdomain.register` and `redirect.register` commands.
- Each command: `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: false`, `flags: { site: { kind: "string", required: true } }`, `reads: ["systems-cache/{system}/system-config.yaml"]`, `cacheable: false`.
- Create `index.ts` barrel re-exporting `createCustomdomainModule`, `runCustomdomainRegister`, `runRedirectRegister`, and result types.
- Add `export { createCustomdomainModule } from "../customdomain/index.ts"` to `packages/werkstatt/src/handoff/index.ts`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.

**Completion criterion:** Module is registered and exported from the handoff barrel.

**Human review:** no

---

### Step 6. Register module in kernel.config.ts

**Goal:** Wire the `customdomain` module loader into the workspace kernel config.

**Agent actions:**

- Add `customdomain: async () => (await import("@warpgogol/werkstatt/customdomain-module")).createCustomdomainModule()` to `moduleLoaders` in `tools/kernel.config.ts`.
- Add `<entry key="customdomain.*">Registers workspace custom domain commands: customdomain.register, redirect.register (RFC-0896).</entry>` to `MODULE_MAP`.
- Add `<item>RFC-0896: Register customdomainModule for customdomain.register, redirect.register.</item>` to `CHANGE_SUMMARY`.
- Add subpath export `@warpgogol/werkstatt/customdomain-module` to `packages/werkstatt/package.json` `exports` field, pointing to `./src/customdomain/customdomain.module.ts`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.
- `pnpm exec werkstatt run command.manifest.generate` (optional — verifies command registration).

**Completion criterion:** Module loader is registered in `kernel.config.ts` and the subpath export exists.

**Human review:** no

---

### Step 7. Wire commands into runLeitstandPromote

**Goal:** Call `customdomain.register` and `redirect.register` from `runLeitstandPromote` before `executeDeployPhases`.

**Agent actions:**

- In `runLeitstandPromote` (line ~1130 of `leitstand-commands.ts`), after `prepareDeployContext` succeeds but before `executeDeployPhases`:
  1. Dynamically import `runCustomdomainRegister` and `runRedirectRegister` from `../customdomain/index.ts`.
  2. Call `runCustomdomainRegister` with a synthetic `KernelCommandInput` containing `--site={systemId}`.
  3. Call `runRedirectRegister` with the same input.
  4. If either throws, return a failed result with `failingPhase: "custom-domain-setup"` and a descriptive error message.
- Add `failingPhase: "custom-domain-setup"` to the `LeitstandPromoteData` type (already has `failingPhase?: string`).
- Do NOT add the commands to `runLeitstandPropagate` — alt channel is out of scope.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes.
- Existing `leitstand.promote` tests still pass (mock the customdomain calls if needed).

**Completion criterion:** `runLeitstandPromote` calls both commands before `executeDeployPhases`. If either fails, the promote fails with `failingPhase: "custom-domain-setup"`.

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Unit tests for both commands covering create, idempotent skip, mismatch error.

**Agent actions:**

- Create `customdomain-register.test.ts`:
  - Mock `listDnsRecords`, `createDnsRecord`, `listWorkersRoutes`, `createWorkersRoute` from `cloudflare-api.ts`.
  - Test 1: create — no existing records, creates A record + route, returns `state: "registered"`.
  - Test 2: idempotent skip — existing correct A record + route, returns `state: "already-registered"`.
  - Test 3: mismatch error — existing A record with wrong content, throws with descriptive error.
  - Test 4: missing `cloudflareZoneId` — throws.
  - Test 5: missing `CLOUDFLARE_API_TOKEN` — throws.
- Create `redirect-register.test.ts`:
  - Mock `listDnsRecords`, `createDnsRecord`, `getRedirectRuleset`, `createRedirectRule`.
  - Test 1: create — no existing records, creates CNAME + redirect rule, returns `state: "registered"`.
  - Test 2: idempotent skip — existing correct CNAME + redirect rule, returns `state: "already-registered"`.
  - Test 3: mismatch error — existing CNAME with wrong content, throws.
  - Test 4: redirect rule mismatch — existing rule with wrong status code, throws.
- Use `vi.mock` for `cloudflare-api.ts` and `customdomain-helpers.ts` as needed.
- Write a minimal `package.json` with `{ "version": "1.0.0" }` to temp test dirs if needed (per memory: `resolveCurrentEcosystem` reads it).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes.

**Completion criterion:** All test cases pass. Coverage: create, idempotent skip, mismatch error for both commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `AGENTS.md` (root) with a new bullet in the deployment section: "Custom domain DNS and www→apex redirect are registered automatically during `leitstand.promote` via `customdomain.register` and `redirect.register` (RFC-0896)."
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- Run `pnpm --filter @warpgogol/werkstatt run build:check`.
- Run `pnpm --filter @warpgogol/werkstatt run test`.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0896`.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- Run fix if needed: invoke `fo-fix` if `fo-review` reported findings. Re-run `fo-review`. Max 3 iterations.
- Check off acceptance criteria in the RFC: mark `[x]` for verified criteria.
- Stamp the RFC as implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0896 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0896` — zero violations.
- `pnpm --filter @warpgogol/werkstatt run build:check` — passes.
- `pnpm --filter @warpgogol/werkstatt run test` — passes.
- Review report exists in `docs/reviews/code/`.

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0896`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0896` (if acceptance probes declared — currently commented out)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0896` in the subject line (RFC-0265 commit hygiene)
- No verification evidence file needed (acceptance probes are commented out — `rfc.verification.emit` will skip, which is expected behavior)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| API token permissions | Step 2 (`resolveCustomDomainEnv` throws with required permissions list); Step 8 (test for missing token) |
| Redirect Rules API availability | Step 1 (uses `fetchWithRetry` with backoff, same as existing API functions) |
| Agent misinterpretation (calling for dev/alt) | Step 7 (only wired into `runLeitstandPromote`, not `runLeitstandPropagate`); commands read only `deployment.channels.main` |
| Scale (thousands of sites) | Steps 3-4 (idempotent, run once per deployment); Step 8 (idempotent skip test) |
| False positive on mismatched DNS | Steps 3-4 (throw with descriptive fix hint); Step 8 (mismatch error test) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-73, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0896 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the Cloudflare Rulesets API response shape differs from what the RFC assumes, update `getRedirectRuleset` to match the actual API response and add a test fixture capturing the real shape.
