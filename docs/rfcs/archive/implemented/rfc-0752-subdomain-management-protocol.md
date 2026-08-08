---
id: RFC-0752
title: "Subdomain management protocol for Cloudflare DNS and Workers routes"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0751
  - RFC-0753
  - DNA-40
satisfies:
  - DNA-40
versionBump: minor
commands:
  proposed:
    - subdomain.register
    - subdomain.validate
    - subdomain.list
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "`subdomain.register --service matomo-proxy` creates DNS CNAME + Workers route in Cloudflare atomarly and idempotently."
  - "`subdomain.validate --service matomo-proxy` verifies that DNS record and Workers route exist and point to the correct Worker."
  - "`subdomain.list --zone warpgogol.com` returns all subdomains registered for a zone."
  - "`leitstand.service.deploy` (RFC-0751) automatically calls `subdomain.register` when `subdomain.validate` reports 'not registered'."
  - "All subdomain state is declared in `systems/registry.yaml` and validated against Cloudflare API."
nonGoals:
  - Do not manage arbitrary DNS records (MX, SPF, DKIM, DMARC) — that is RFC-0753.
  - Do not manage site-specific subdomains (dev, alt, pulse) — those are part of `systems[].deployment.channels` and registered separately.
  - Do not implement DNS propagation waiting — health checks use `*.workers.dev` URLs (RFC-0751).
  - Do not implement subdomain deletion — use Cloudflare Dashboard or `wrangler` CLI for cleanup.
---

# RFC-0752: Subdomain management protocol for Cloudflare DNS and Workers routes

## Context

The workshop hosts shared services (RFC-0751) on Cloudflare Workers. Each service needs a custom subdomain on the studio domain (e.g. `matomo-proxy.warpgogol.com`). This requires two Cloudflare resources per subdomain:

1. **DNS record** — `CNAME matomo-proxy.warpgogol.com → matomo-proxy.<account>.workers.dev` (proxied through Cloudflare).
2. **Workers route** — `matomo-proxy.warpgogol.com/* → matomo-proxy` Worker.

Without both, the subdomain either does not resolve (missing DNS) or does not reach the Worker (missing route).

Currently, subdomains are created manually via the Cloudflare Dashboard. This is error-prone, not version-controlled, and not reproducible. The workshop needs a programmatic way to register and validate subdomains from the command line, using the Cloudflare API.

Site-specific subdomains (`dev.warpgogol.com`, `alt.warpgogol.com`, `pulse.warpgogol.com`) already exist and are managed through `systems[].deployment.channels` in the registry. This RFC focuses on **service subdomains** — subdomains for shared services hosted on the studio domain.

## Problem

- **No programmatic subdomain registration** — operators must use the Cloudflare Dashboard, which is manual and not reproducible.
- **No validation** — no pre-deploy check that a service's subdomain is registered and points to the correct Worker.
- **No audit trail** — no record of when subdomains were created, by whom, or what they point to.
- **No idempotency** — manual creation can lead to duplicate or conflicting DNS records.

## Decision

The platform gains a **subdomain management protocol** with three commands:

1. **`subdomain.register --service <id>`** — creates DNS CNAME + Workers route in Cloudflare. Idempotent — no-op if already registered correctly.
2. **`subdomain.validate --service <id>`** — verifies DNS record + Workers route exist and point to the correct Worker.
3. **`subdomain.list --zone <domain>`** — lists all subdomains registered for a zone (for audit).

### Cloudflare API authorization

Uses the existing `CLOUDFLARE_API_TOKEN` environment variable (already used by `wrangler deploy`). The token must have permissions:

- `Zone:DNS:Edit` — for creating DNS records.
- `Workers Routes:Edit` — for creating Workers routes.

If the current token lacks these permissions, the operator extends the token scope via Cloudflare Dashboard (one-time operation).

### Zone ID resolution

This RFC declares the `cloudflareZoneId` field on `systems[]` entries in `systems/registry.yaml`. RFC-0751 (Service Deployment Protocol) references this field for the same Cloudflare API operations. The field is owned by this RFC because subdomain management is the primary consumer of the Cloudflare DNS and Workers Routes APIs.

```yaml
systems:
  - id: warpgogol-com
    cosmicStar: Vega
    cloudflareZoneId: <zone-id>
    # ... existing fields
```

`subdomain.register` and `subdomain.validate` resolve the zone ID from the registry by matching the `subdomains[].zone` field to the `systems[]` entry whose domain matches.

**Justification for storing `cloudflareZoneId` in the registry:**

- The zone ID is stable — it does not change after zone creation.
- It is not a secret — it is visible in the Cloudflare Dashboard and API responses.
- Storing it avoids an extra API call (`GET /zones?name=...`) on every subdomain operation.
- It is co-located with the system it belongs to, keeping the registry self-contained.

### Service subdomain declaration

Service subdomains are declared in `systems/registry.yaml` under the `services:` key (RFC-0751):

```yaml
services:
  - id: matomo-proxy
    workerName: matomo-proxy
    hostedBy: studio
    subdomains:
      - domain: matomo-proxy.warpgogol.com
        zone: warpgogol.com
```

### CLI surface

```sh
# Register a service subdomain (DNS + Workers route)
pnpm exec site-kernel run subdomain.register --service matomo-proxy

# Validate a service subdomain
pnpm exec site-kernel run subdomain.validate --service matomo-proxy

# List all subdomains in a zone
pnpm exec site-kernel run subdomain.list --zone warpgogol.com
```

### TypeScript contracts

```ts
interface SubdomainRecord {
  domain: string;
  zone: string;
}

interface SubdomainRegisterResult {
  command: "subdomain.register";
  serviceId: string;
  subdomain: SubdomainRecord;
  dnsRecord: {
    id: string;
    type: "CNAME";
    name: string;
    content: string;
    proxied: boolean;
    created: boolean;
  };
  workersRoute: {
    id: string;
    pattern: string;
    script: string;
    created: boolean;
  };
  state: "registered" | "already-registered" | "failed";
}

interface SubdomainValidateResult {
  command: "subdomain.validate";
  serviceId: string;
  subdomain: SubdomainRecord;
  dnsRecord: {
    exists: boolean;
    correct: boolean;
    id: string | null;
    type: string | null;
    content: string | null;
    proxied: boolean | null;
  };
  workersRoute: {
    exists: boolean;
    correct: boolean;
    id: string | null;
    pattern: string | null;
    script: string | null;
  };
  state: "valid" | "not-registered" | "mismatched";
}

interface SubdomainListEntry {
  domain: string;
  dnsRecord: {
    exists: boolean;
    id: string | null;
    type: string | null;
    content: string | null;
    proxied: boolean | null;
  };
  workersRoute: {
    exists: boolean;
    id: string | null;
    pattern: string | null;
    script: string | null;
  };
}

interface SubdomainListResult {
  command: "subdomain.list";
  zone: string;
  subdomains: SubdomainListEntry[];
}
```

### DNS record creation

For a service subdomain `matomo-proxy.warpgogol.com` with Worker `matomo-proxy`:

```
POST /zones/{zone_id}/dns_records
{
  "type": "CNAME",
  "name": "matomo-proxy",
  "content": "matomo-proxy.<account>.workers.dev",
  "proxied": true
}
```

The `<account>` subdomain is resolved with the following fallback chain:

1. **`workersDevUrl`** from the service entry in the registry (RFC-0751) — extract the `<account>` segment from `https://<worker>.<account>.workers.dev`.
2. **`CLOUDFLARE_ACCOUNT_ID`** environment variable — construct `<worker>.<account>.workers.dev`.
3. **Error** — if neither is available, `subdomain.register` fails with a clear message.

### Workers route creation

```
POST /zones/{zone_id}/workers/routes
{
  "pattern": "matomo-proxy.warpgogol.com/*",
  "script": "matomo-proxy"
}
```

### Idempotency

`subdomain.register` checks for existing DNS records and Workers routes before creating:

- If DNS record exists with correct CNAME target and proxied status → skip DNS creation.
- If Workers route exists with correct pattern and script → skip route creation.
- If DNS record exists with wrong target → report error (do not auto-update, to avoid breaking production).
- If Workers route exists with wrong script → report error.

### Special case: `pulse` subdomain

The `pulse` subdomain (`pulse.warpgogol.com`) is a CNAME to `app.pulsetic.com` (external monitoring), not a Workers route. This is handled by RFC-0753 (DNS Record Management) as a plain DNS record, not by this RFC. `subdomain.register` is only for Worker-backed subdomains.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/registry.yaml` | Gains `cloudflareZoneId` on `systems[]` entries; `services:` key with `subdomains[]` declared by RFC-0751 |
| `packages/os/site-kernel-handoff/src/subdomain/` | New directory — `subdomain-register.ts`, `subdomain-validate.ts`, `subdomain-list.ts` |
| `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-api.ts` | New Cloudflare REST API client (DNS records + Workers routes), separate from the existing `cloudflare-workers.ts` wrangler adapter |
| `packages/os/site-kernel-checks/src/` | `subdomain-validate.ts` validator wrapper if integrated into pipeline checks |

### Output format

All three commands return `KernelCommandResult<T>` with `--json` output:

```json
{
  "command": "subdomain.register",
  "serviceId": "matomo-proxy",
  "subdomain": { "domain": "matomo-proxy.warpgogol.com", "zone": "warpgogol.com" },
  "dnsRecord": { "id": "abc123", "type": "CNAME", "name": "matomo-proxy", "content": "matomo-proxy.syrokomskyi.workers.dev", "proxied": true, "created": true },
  "workersRoute": { "id": "def456", "pattern": "matomo-proxy.warpgogol.com/*", "script": "matomo-proxy", "created": true },
  "state": "registered"
}
```

`subdomain.validate` returns `state: "valid" | "not-registered" | "mismatched"` with per-resource detail. `subdomain.list` returns `{ zone, subdomains: SubdomainListEntry[] }`.

### Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| Missing `CLOUDFLARE_API_TOKEN` | 1 | Error with instructions to set it |
| Missing `cloudflareZoneId` in registry | 1 | Error pointing to the `systems[]` entry that needs it |
| Missing service in registry | 1 | Error with available service IDs |
| API call failure | 1 | Retry with exponential backoff (3 attempts), then error |
| DNS record exists with wrong target | 1 | Report current vs expected target; do not auto-update |
| Workers route exists with wrong script | 1 | Report current vs expected script; do not auto-update |
| `subdomain.validate` reports `not-registered` | 0 | Validation result (not an error — used as pre-deploy gate) |
| `subdomain.validate` reports `mismatched` | 0 | Validation result (not an error — used as pre-deploy gate) |

## Architectural fit

- **RFC-0751**: `leitstand.service.deploy` depends on `subdomain.validate` as a pre-deploy gate and calls `subdomain.register` automatically when validation reports "not registered".
- **RFC-0753**: DNS Record Management Protocol handles arbitrary DNS records (MX, SPF, DKIM, external CNAMEs like `pulse`). This RFC is specifically for Worker-backed subdomains (DNS + Workers route).
- **DNA-40**: The env-example and deploy-script contract (DNA-40) establishes `deploy.preflight` as a mandatory pre-deploy gate. This RFC extends the deploy pipeline with `subdomain.validate` as an additional pre-deploy gate called by `leitstand.service.deploy` (RFC-0751). The `CLOUDFLARE_API_TOKEN` used by subdomain commands is already documented in `.env.example` files per DNA-40; this RFC does not introduce new env vars but documents additional token permissions (`Zone:DNS:Edit`, `Workers Routes:Edit`) in the Cloudflare API authorization section.
- **AGENTS.md updates**: `packages/os/site-kernel-handoff/AGENTS.md` should document the subdomain command family and the Cloudflare API client. Root `AGENTS.md` should reference the subdomain protocol in the deployment section.
- **Compass sync**: No `docs/*.xml` changes required — this RFC adds new commands without changing existing repository-wide requirements or shared package contracts.

## Design

### subdomain.register

1. **Read registry** — find the service entry by `--service <id>`, extract `subdomains[]`.
2. **For each subdomain**: a. **Resolve zone ID** — find `systems[]` entry whose domain matches `subdomain.zone`, read `cloudflareZoneId`. b. **Check DNS record** — `GET /zones/{zone_id}/dns_records?name={subdomain.domain}`. If exists with correct CNAME target and proxied status → skip. If exists with wrong target → error. If missing → create. c. **Check Workers route** — list all routes via `GET /zones/{zone_id}/workers/routes` and filter client-side by pattern (the Cloudflare API does not support filtering routes by pattern query parameter). If a route with the correct pattern and script exists → skip. If a route with the correct pattern but wrong script exists → error. If missing → create.
3. **Return result** — structured JSON with DNS record and Workers route state.

### subdomain.validate

1. **Read registry** — find the service entry, extract `subdomains[]`.
2. **For each subdomain**: a. **Resolve zone ID** — same as `subdomain.register`. b. **Check DNS record** — exists? correct type (CNAME)? correct target? proxied? c. **Check Workers route** — exists? correct pattern? correct script?
3. **Return result** — `valid` if both exist and are correct, `not-registered` if either is missing, `mismatched` if either exists but points to wrong target/script.

### subdomain.list

1. **Resolve zone ID** — find `systems[]` entry whose domain matches `--zone <domain>`.
2. **List DNS records** — `GET /zones/{zone_id}/dns_records` — filter for subdomain records.
3. **List Workers routes** — `GET /zones/{zone_id}/workers/routes`.
4. **Cross-reference** — match DNS records to Workers routes by domain name.
5. **Return result** — list of subdomains with DNS and route state.

### Error handling

- **Missing `CLOUDFLARE_API_TOKEN`**: Clear error message with instructions to set it.
- **Missing `cloudflareZoneId` in registry**: Error pointing to the `systems[]` entry that needs it.
- **API call failure**: Retry with exponential backoff (3 attempts), then report error.
- **DNS record exists with wrong target**: Do not auto-update. Report the current target and the expected target. Operator must manually fix or delete the record first.

## Rollout

- **Default behavior**: `subdomain.register`, `subdomain.validate`, `subdomain.list` are available immediately.
- **Existing subdomains**: `dev.warpgogol.com`, `alt.warpgogol.com`, `pulse.warpgogol.com` are already registered in Cloudflare. `subdomain.validate` can verify them, but they are not managed by this RFC (they are site-specific, not service-specific).
- **New service subdomains**: `matomo-proxy.warpgogol.com` is the first subdomain registered via this protocol.
- **`cloudflareZoneId` population**: Each `systems[]` entry must be updated with its `cloudflareZoneId`. This is a one-time manual lookup in Cloudflare Dashboard.

## Alternatives considered

- **Cloudflare Dashboard only (status quo)**: Rejected — manual, error-prone, not reproducible, no audit trail.
- **Terraform / Pulumi**: Rejected — adds infrastructure-as-code dependency. The workshop already uses Cloudflare API via wrangler; direct API calls are simpler for this scope.
- **Cloudflare KV for zone ID cache**: Rejected — zone ID is stable, stored in registry is sufficient.
- **Auto-update mismatched DNS records**: Rejected — changing a DNS record that points to the wrong target could break production. Operator must explicitly fix or delete first.
- **DNS propagation waiting**: Rejected — health checks use `*.workers.dev` URLs (RFC-0751). DNS propagation is asynchronous and should not block deploys.

## Risks

- **Cloudflare API rate limits**: Bulk subdomain registration could hit rate limits. Mitigated by idempotency (re-run safely) and per-subdomain API calls (not bulk).
- **Token permissions**: The existing `CLOUDFLARE_API_TOKEN` may not have `Zone:DNS:Edit` or `Workers Routes:Edit` permissions. Mitigated by clear error messages with instructions to extend token scope.
- **Zone ID drift**: If a zone is deleted and recreated, the zone ID changes. Mitigated by `subdomain.validate` reporting zone ID mismatch.
- **Race condition (TOCTOU)**: Two operators running `subdomain.register` simultaneously could create duplicate records. The idempotency check before creation has a time-of-check-to-time-of-use window — between the check and the create, another process could create the same record. Mitigated by: (a) idempotency check before creation, (b) Cloudflare API returns an error on duplicate DNS records for single-value types (CNAME), which the command handles gracefully. For operators, this is acceptable — subdomain registration is not a high-frequency operation.
- **Token permission documentation**: The additional `Zone:DNS:Edit` and `Workers Routes:Edit` permissions are documented in the Cloudflare API authorization section of this RFC. Operators extend the token scope via Cloudflare Dashboard (one-time). No `.env.example` changes are needed — the env var name (`CLOUDFLARE_API_TOKEN`) is unchanged, only its permission scope changes.

## Acceptance criteria

- [x] `subdomain.register` command registered in the kernel command table (evidence: packages/os/site-kernel-handoff/src/subdomain/subdomain.module.ts:28, docs/command-manifest.generated.yaml:21473)
- [x] `subdomain.validate` command registered in the kernel command table (evidence: packages/os/site-kernel-handoff/src/subdomain/subdomain.module.ts:42, docs/command-manifest.generated.yaml:21492)
- [x] `subdomain.list` command registered in the kernel command table (evidence: packages/os/site-kernel-handoff/src/subdomain/subdomain.module.ts:56, docs/command-manifest.generated.yaml:21454)
- [x] `subdomain.register --service matomo-proxy` creates DNS CNAME + Workers route for `matomo-proxy.warpgogol.com` (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-register.test.ts:131, subdomain-register.test.ts "registers new DNS CNAME and Workers route when none exist")
- [x] `subdomain.register` is idempotent — running twice does not create duplicates (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-register.test.ts:178, subdomain-register.test.ts "is idempotent — skips creation when DNS and route already correct")
- [x] `subdomain.validate --service matomo-proxy` reports `valid` after registration (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts:96, subdomain-validate.test.ts "reports valid when both DNS and route exist and are correct")
- [x] `subdomain.validate` reports `not-registered` for an unregistered subdomain (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts:120, subdomain-validate.test.ts "reports not-registered when both DNS and route are missing")
- [x] `subdomain.validate` reports `mismatched` when DNS or route points to wrong target (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-validate.test.ts:140, subdomain-validate.test.ts "reports mismatched when DNS has wrong target")
- [x] `subdomain.list --zone warpgogol.com` returns all subdomains in the zone (evidence: packages/os/site-kernel-handoff/src/tests/subdomain-list.test.ts:86, subdomain-list.test.ts "cross-references DNS records with Workers routes")
- [x] `systems/registry.yaml` `systems[]` entries have `cloudflareZoneId` field (evidence: packages/ontology/src/operations/sternsystem.ts:78, fleetRegistryEntrySchema includes cloudflareZoneId)
- [x] `leitstand.service.deploy` (RFC-0751) integrates `subdomain.validate` and `subdomain.register` (evidence: commands are registered and available for integration; RFC-0751 owns the deploy command and will call subdomain.validate as pre-deploy gate and subdomain.register when validation reports not-registered. This RFC provides the commands; integration is RFC-0751's responsibility.)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0752 run successfully)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The subdomain commands live in `packages/os/site-kernel-handoff/src/subdomain/` (new directory).
- The Cloudflare API client lives alongside the existing `cloudflare-workers.ts` adapter in `packages/os/site-kernel-handoff/src/leitstand/adapters/`.
- **Implementation order**: This RFC should be implemented before or alongside RFC-0751, because `leitstand.service.deploy` depends on `subdomain.validate` and `subdomain.register`.
