---
reviewId: REVIEW-CODE-2026-07-14-22
date: 2026-07-14
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1e7048658...HEAD
filesReviewed:
  - packages/integration-adapter-supabase-crm/migrations/002_sync_tenants.sql
  - packages/integration-adapter-supabase-crm/src/tenant-registry.ts
  - packages/os/site-kernel/package.json
  - packages/os/site-kernel/src/lagebild/env.ts
  - packages/os/site-kernel/src/lagebild/handlers.ts
  - packages/os/site-kernel/src/lagebild/lagebild.module.ts
  - pnpm-lock.yaml
---

# Code Review: 1e7048658...HEAD (lagebild tenant lifecycle implementation)

### Verdict: Needs revision

The diff replaces stub handlers with real Supabase PostgREST calls — the core architecture is sound and package boundaries are respected. However, there are two security/correctness findings (Axis G) that should be addressed before merging: the `countOutboxByStatus` function bypasses RLS by not setting `app.current_tenant`, and the `runLagebildWorkerDeploy` handler spawns `npx wrangler` without forwarding stderr to the user's terminal. A missing `CHANGE_SUMMARY` on the new `env.ts` file is a minor DNA-42 gap.

### Mechanical floor

Pass — `pnpm --filter @gogol/integration-adapter-supabase-crm build:check` and `pnpm --filter @gogol/site-kernel build:check` both pass with exit code 0.

### Axis A — Structural correctness

- **Duplicated Code** (possible) — `setTenantEnabled` and `updateTenantSecretRef` in `tenant-registry.ts` share the same PATCH-with-Prefer-return-representation pattern, including identical response-parsing logic (`const text = await res.text(); if (!text) return null; const parsed = JSON.parse(text); return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;`). Consider extracting a `patchAndParseSingle` helper to reduce the three duplicated blocks (also in `createTenant`).
- **Primitive Obsession** — `secretKind` in `updateTenantSecretRef` is a `string` parameter validated at runtime against a `Record<string, string>` map. A union type `"supabase-url" | "supabase-service-key" | "pipedrive-token" | "pipedrive-domain"` would give compile-time safety. The `kind` flag in the module declaration is also `kind: "string"` — a string union would be more precise.
- **Error handling** — `countOutboxByStatus` silently returns `0` on non-OK responses (`if (!res.ok) return 0;`). A transient Supabase error would be indistinguishable from "no pending rows". At minimum, log the error or throw.
- **Magic numbers** — `limit=1000` in `countOutboxByStatus` is an arbitrary cap. If a tenant has >1000 pending rows, the count is wrong. Use the PostgREST `Prefer: count=exact` header with `Range: 0-0` instead, or document the limitation.

### Axis B — DNA alignment

- **DNA-42** (Compass markup) — **Fail**: The new file `packages/os/site-kernel/src/lagebild/env.ts` has `MODULE_CONTRACT` but is missing `CHANGE_SUMMARY`. Per DNA-42, new non-trivial source files must carry both. Add:
  ```xml
  <CHANGE_SUMMARY>
    <item>RFC-0186: Initial env helper for loading registry credentials from .dev.vars.</item>
  </CHANGE_SUMMARY>
  ```
- **DNA-1** (monorepo boundary) — Pass. `site-kernel` imports from `@gogol/integration-adapter-supabase-crm` (package → package), no `apps/*` or `services/*` imports into packages.
- **DNA-6** (kebab-case) — Pass. `env.ts` is kebab-case.
- **DNA-40** (env-example) — N/A. No new env vars introduced; the code reads existing `LAGEBILD_REGISTRY_URL` / `LAGEBILD_REGISTRY_API_KEY` already documented in `.dev.vars.example`.

### Axis C — Ecosystem fit

- **Package boundaries** — Pass. `site-kernel` → `integration-adapter-supabase-crm` is a valid package-to-package dependency. The `tenant-registry` subpath export is already declared in the package's `exports` map.
- **Command lifecycle** — Pass. The `--new-ref` flag was added to the `rotate-secret` command declaration in `lagebild.module.ts`, matching the handler's expectation. All handlers are properly wired.
- **Compass sync** — N/A. No repository-wide requirements or shared package contracts changed.
- **AGENTS.md updates** — N/A. No new rules or patterns introduced.

### Axis D — Forward-only compliance

- **No legacy paths** — Pass. The stubs are fully replaced, not kept behind a flag. No dual-paths or compatibility shims.
- **Migration rewrite** — Pass. The `002_sync_tenants.sql` migration was rewritten from `CREATE TABLE IF NOT EXISTS` to `ALTER TABLE ADD COLUMN IF NOT EXISTS`, which is the correct forward-only fix for the existing base table from `funnel-base.sql`. The old `CREATE TABLE` approach is gone.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — **Fail** (same as DNA-42): `env.ts` is missing `CHANGE_SUMMARY`.
- **No ungrounded assertions** — Pass. Comments and docstrings reference real functions and files.
- **Readable by another agent** — Pass. Function names are clear (`resolveRegistryClient`, `extractProjectRef`, `createTenant`, `getTenantBySiteName`).
- **Log-driven development** — Pass. Error messages include HTTP status and response text. Handler error paths return structured `{ status: "error", message }` data.

### Axis F — Pragmatism

- **Minimal command surface** — Pass. No new commands added; existing commands are implemented.
- **Lean contracts** — Pass. `CreateTenantInput` has only the fields needed for the INSERT. Optional fields (`cron_group`, `batch_size`, etc.) have sensible defaults.
- **Existing patterns** — Pass. The `RegistryClient` interface and PostgREST fetch pattern are reused from the existing `getEnabledTenants` / `updateTenantHealth` functions.
- **Scope discipline** — Pass. The diff touches only lagebild-related files and the migration.

### Axis G — Blind spots

- **Security / RLS bypass** — **Fail**: `countOutboxByStatus` in `tenant-registry.ts` queries `sync_outbox` without setting the `x-set-config: app.current_tenant=<tenantId>` header. The `sync_outbox` table has RLS enabled (from `funnel-base.sql`) with a `sync_outbox_tenant` policy that requires `app.current_tenant` to match `tenant_id`. Without this header, the service_role key bypasses RLS (PostgREST service_role skips RLS by default), so the query works — but this is inconsistent with the `SupabaseCrmBufferClient` which always sets `x-set-config` per query. If the registry API key is ever downgraded from service_role, `countOutboxByStatus` will silently return 0 for all counts. Add the `x-set-config` header for defense-in-depth, or document that the registry client intentionally uses service_role.

- **`runLagebildWorkerDeploy` spawns `npx wrangler` with `shell: true`** — **Fail**: The `spawn("npx", ["wrangler", "deploy"], { shell: true })` call on Windows will spawn `cmd.exe /c npx wrangler deploy`. The `stdio: "pipe"` captures stdout/stderr but does not forward them to the user's terminal — the user sees nothing until the command finishes. For a deploy command that may prompt for authentication, this is a UX problem. Consider `stdio: "inherit"` for interactive use, or at minimum stream stderr to `process.stderr`.

- **Edge cases** — The `createTenant` handler checks for an existing tenant by `site_name` before inserting. If two `lagebild.tenant.add` commands run concurrently for the same site, both could pass the existence check and the second INSERT would fail with a unique constraint violation. This is acceptable for a CLI command (low concurrency), but the error message from PostgREST will be raw JSON — the handler's catch block does surface it, so this is acceptable.

- **Migration path** — The migration drops the `sync_tenants_tenant` RLS policy from `funnel-base.sql` and replaces it with `service_role_all`. This is correct for the registry (platform-level metadata), but if any existing code relies on the tenant-isolation policy on `sync_tenants`, it will break. The `getEnabledTenants` and `updateTenantHealth` functions already use the service key without `x-set-config`, so they already depended on service_role bypass — the migration makes this explicit. Pass.

### Spec compliance

No spec available — spec compliance skipped. The implementation follows RFC-0186's tenant lifecycle description.

### Questions for the author

1. `countOutboxByStatus` queries `sync_outbox` without `x-set-config: app.current_tenant`. Is this intentional (relying on service_role RLS bypass), or should it set the header for consistency with `SupabaseCrmBufferClient`?
2. `runLagebildWorkerDeploy` uses `stdio: "pipe"` — should it use `stdio: "inherit"` so the user sees wrangler's authentication prompts and deploy progress in real time?
3. The `limit=1000` cap in `countOutboxByStatus` means counts above 1000 are inaccurate. Should this use PostgREST's `Prefer: count=exact` + `Range: 0-0` header instead, or is 1000 sufficient for the status command's purpose?
