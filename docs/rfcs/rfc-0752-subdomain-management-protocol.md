---
id: RFC-0752
title: "Subdomain management protocol for Cloudflare DNS and Workers routes"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
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
  - "@warpgogol/ontology"
successSignals:
  - `subdomain.register --service matomo-proxy` creates DNS CNAME + Workers route in Cloudflare atomarly and idempotently.
  - `subdomain.validate --service matomo-proxy` verifies that DNS record and Workers route exist and point to the correct Worker.
  - `subdomain.list --zone warpgogol.com` returns all subdomains registered for a zone.
  - `leitstand.service.deploy` (RFC-0751) automatically calls `subdomain.register` when `subdomain.validate` reports "not registered".
  - All subdomain state is declared in `systems/registry.yaml` and validated against Cloudflare API.
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

Each `systems[]` entry in `systems/registry.yaml` gains a `cloudflareZoneId` field:

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

The `<account>` subdomain is derived from `CLOUDFLARE_ACCOUNT_ID` or from the existing `workersDevUrl` in the registry.

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

## Architectural fit

- **RFC-0751**: `leitstand.service.deploy` depends on `subdomain.validate` as a pre-deploy gate and calls `subdomain.register` automatically when validation reports "not registered".
- **RFC-0753**: DNS Record Management Protocol handles arbitrary DNS records (MX, SPF, DKIM, external CNAMEs like `pulse`). This RFC is specifically for Worker-backed subdomains (DNS + Workers route).
- **DNA-40**: Extends the deployment contract with subdomain validation as a pre-deploy gate.

## Design

### subdomain.register

1. **Read registry** — find the service entry by `--service <id>`, extract `subdomains[]`.
2. **For each subdomain**:
   a. **Resolve zone ID** — find `systems[]` entry whose domain matches `subdomain.zone`, read `cloudflareZoneId`.
   b. **Check DNS record** — `GET /zones/{zone_id}/dns_records?name={subdomain.domain}`. If exists with correct CNAME target and proxied status → skip. If exists with wrong target → error. If missing → create.
   c. **Check Workers route** — `GET /zones/{zone_id}/workers/routes?pattern={subdomain.domain}/*`. If exists with correct script → skip. If exists with wrong script → error. If missing → create.
3. **Return result** — structured JSON with DNS record and Workers route state.

### subdomain.validate

1. **Read registry** — find the service entry, extract `subdomains[]`.
2. **For each subdomain**:
   a. **Resolve zone ID** — same as `subdomain.register`.
   b. **Check DNS record** — exists? correct type (CNAME)? correct target? proxied?
   c. **Check Workers route** — exists? correct pattern? correct script?
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
- **Race condition**: Two operators running `subdomain.register` simultaneously could create duplicate records. Mitigated by idempotency check before creation.

## Acceptance criteria

- [ ] `subdomain.register` command registered in the kernel command table
- [ ] `subdomain.validate` command registered in the kernel command table
- [ ] `subdomain.list` command registered in the kernel command table
- [ ] `subdomain.register --service matomo-proxy` creates DNS CNAME + Workers route for `matomo-proxy.warpgogol.com`
- [ ] `subdomain.register` is idempotent — running twice does not create duplicates
- [ ] `subdomain.validate --service matomo-proxy` reports `valid` after registration
- [ ] `subdomain.validate` reports `not-registered` for an unregistered subdomain
- [ ] `subdomain.validate` reports `mismatched` when DNS or route points to wrong target
- [ ] `subdomain.list --zone warpgogol.com` returns all subdomains in the zone
- [ ] `systems/registry.yaml` `systems[]` entries have `cloudflareZoneId` field
- [ ] `leitstand.service.deploy` (RFC-0751) integrates `subdomain.validate` and `subdomain.register`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The subdomain commands live in `packages/os/site-kernel-handoff/src/subdomain/` (new directory).
- The Cloudflare API client lives alongside the existing `cloudflare-workers.ts` adapter in `packages/os/site-kernel-handoff/src/leitstand/adapters/`.
- **Implementation order**: This RFC should be implemented before or alongside RFC-0751, because `leitstand.service.deploy` depends on `subdomain.validate` and `subdomain.register`.
