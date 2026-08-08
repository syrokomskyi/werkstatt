---
id: RFC-0753
title: "DNS record management protocol for Cloudflare DNS zones"
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
  - RFC-0752
  - DNA-40
satisfies:
  - DNA-40
versionBump: minor
commands:
  proposed:
    - dns.record.upsert
    - dns.record.validate
    - dns.record.list
    - dns.record.delete
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/ontology"
successSignals:
  - `dns.record.upsert --zone warpgogol.com` creates or updates DNS records from a version-controlled declaration file.
  - `dns.record.validate --zone warpgogol.com` verifies that all declared DNS records exist in Cloudflare and match the declaration.
  - `dns.record.list --zone warpgogol.com` returns all DNS records in the zone for audit.
  - Email deliverability records (MX, SPF, DKIM, DMARC) are declared in git and validated against Cloudflare.
  - External CNAMEs (e.g. `pulse → app.pulsetic.com`) are managed through this protocol.
nonGoals:
  - Do not manage Worker-backed subdomains (DNS + Workers route) — that is RFC-0752.
  - Do not manage DNS records for site deployment channels (dev, alt) — those are part of site deployment.
  - Do not implement DNS propagation waiting — DNS changes are asynchronous.
  - Do not implement reverse DNS (PTR) records — those are managed by the IP provider, not Cloudflare.
  - Do not implement DNSSEC management — separate concern, handled via Cloudflare Dashboard.
---

# RFC-0753: DNS record management protocol for Cloudflare DNS zones

## Context

The workshop manages multiple client domains in Cloudflare. Each domain needs various DNS records beyond Worker-backed subdomains (RFC-0752):

- **Email deliverability** — MX, SPF (TXT), DKIM (TXT/CNAME), DMARC (TXT), and optionally BIMI (TXT).
- **External service CNAMEs** — e.g. `pulse.warpgogol.com → app.pulsetic.com` (Pulsetic monitoring).
- **Verification records** — TXT records for domain ownership verification (Google, Microsoft, etc.).
- **Custom A/AAAA records** — for non-Worker origins.

Currently, these records are created manually via the Cloudflare Dashboard. This is error-prone, not version-controlled, and not reproducible. A missing DKIM record can silently break email delivery. A missing DMARC record can allow email spoofing.

RFC-0752 handles Worker-backed subdomains (DNS CNAME + Workers route). This RFC handles **all other DNS records** — arbitrary record types that don't have an associated Workers route.

## Problem

- **No version control** — DNS records exist only in Cloudflare, not in git. No audit trail, no code review, no rollback.
- **No validation** — no check that declared records match what's in Cloudflare. Drift goes unnoticed.
- **No reproducibility** — setting up a new zone or recovering from a mistake requires manual Dashboard work.
- **Email deliverability risk** — missing or incorrect SPF/DKIM/DMARC records degrade email delivery silently. Operators may not notice until emails bounce or land in spam.

## Decision

The platform gains a **DNS record management protocol** with four commands:

1. **`dns.record.upsert --zone <domain>`** — creates or updates DNS records from a declaration file. Idempotent.
2. **`dns.record.validate --zone <domain>`** — verifies all declared records exist in Cloudflare and match.
3. **`dns.record.list --zone <domain>`** — lists all DNS records in a zone for audit.
4. **`dns.record.delete --zone <domain> --name <record> --type <type>`** — deletes a specific DNS record.

### Declaration file

DNS records are declared in a version-controlled YAML file per zone:

```
systems/<system-id>/dns-records.yaml
```

Or for the studio domain:

```
systems/warpgogol-com/dns-records.yaml
```

```yaml
kind: dns-records
schemaVersion: 1
zone: warpgogol.com
updatedAt: 2026-08-08
records:
  # Email — MX records (Cloudflare Email Routing)
  - name: warpgogol.com
    type: MX
    content: route1.mx.cloudflare.net
    priority: 10
    proxied: false
  - name: warpgogol.com
    type: MX
    content: route2.mx.cloudflare.net
    priority: 20
    proxied: false
  - name: warpgogol.com
    type: MX
    content: route3.mx.cloudflare.net
    priority: 30
    proxied: false

  # Email — SPF
  - name: warpgogol.com
    type: TXT
    content: "v=spf1 include:_spf.mx.cloudflare.net ~all"
    proxied: false

  # Email — DKIM (Cloudflare Email Routing)
  - name: cf-cloudflare-emu._domainkey.warpgogol.com
    type: TXT
    content: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBA..."
    proxied: false

  # Email — DMARC
  - name: _dmarc.warpgogol.com
    type: TXT
    content: "v=DMARC1; p=quarantine; rua=mailto:dmarc@warpgogol.com; ruf=mailto:dmarc@warpgogol.com; fo=1;"
    proxied: false

  # External CNAME — Pulsetic monitoring
  - name: pulse.warpgogol.com
    type: CNAME
    content: app.pulsetic.com
    proxied: true

  # Domain verification — Google Search Console
  - name: warpgogol.com
    type: TXT
    content: "google-site-verification=..."
    proxied: false
```

### CLI surface

```sh
# Create or update DNS records from declaration
pnpm exec site-kernel run dns.record.upsert --zone warpgogol.com

# Validate declared records against Cloudflare
pnpm exec site-kernel run dns.record.validate --zone warpgogol.com

# List all DNS records in a zone
pnpm exec site-kernel run dns.record.list --zone warpgogol.com

# Delete a specific DNS record
pnpm exec site-kernel run dns.record.delete --zone warpgogol.com --name pulse.warpgogol.com --type CNAME
```

### TypeScript contracts

```ts
interface DnsRecordDeclaration {
  name: string;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "CAA";
  content: string;
  priority?: number;
  proxied?: boolean;
  comment?: string;
}

interface DnsRecordFile {
  kind: "dns-records";
  schemaVersion: 1;
  zone: string;
  updatedAt: string;
  records: DnsRecordDeclaration[];
}

interface DnsRecordUpsertResult {
  command: "dns.record.upsert";
  zone: string;
  created: Array<{ name: string; type: string; id: string }>;
  updated: Array<{ name: string; type: string; id: string; previousContent: string }>;
  unchanged: Array<{ name: string; type: string; id: string }>;
  errors: Array<{ name: string; type: string; error: string }>;
}

interface DnsRecordValidateResult {
  command: "dns.record.validate";
  zone: string;
  declared: number;
  present: number;
  missing: Array<{ name: string; type: string; expectedContent: string }>;
  mismatched: Array<{ name: string; type: string; expectedContent: string; actualContent: string }>;
  extra: Array<{ name: string; type: string; content: string }>;
  state: "valid" | "drifted" | "missing-records";
}
```

### Cloudflare API

Uses the same `CLOUDFLARE_API_TOKEN` as RFC-0752. Required permissions:
- `Zone:DNS:Edit` — for creating, updating, deleting DNS records.
- `Zone:DNS:Read` — for listing and validating.

Zone ID is resolved from `systems/registry.yaml` `systems[].cloudflareZoneId` (same as RFC-0752).

### Record identity

A DNS record is uniquely identified by `(name, type)` within a zone. Cloudflare allows multiple records with the same `(name, type)` (e.g. multiple MX records with different priorities). For record types that allow multiples (MX, TXT), `dns.record.upsert` matches by `(name, type, content)` — if content differs, it updates; if content matches, it's unchanged.

For single-value types (A, AAAA, CNAME), `(name, type)` is unique — `dns.record.upsert` updates the content if it differs.

### Email deliverability record set

The declaration file for a zone SHOULD include a complete email deliverability record set:

| Record | Type | Purpose |
|---|---|---|
| `warpgogol.com` | MX | Incoming mail routing (Cloudflare Email Routing or external provider) |
| `warpgogol.com` | TXT (SPF) | `v=spf1 include:...` — authorizes sending mail servers |
| `<selector>._domainkey.warpgogol.com` | TXT (DKIM) | `v=DKIM1; k=rsa; p=...` — cryptographic email signing |
| `_dmarc.warpgogol.com` | TXT (DMARC) | `v=DMARC1; p=...; rua=...` — SPF/DKIM enforcement policy |
| `default._bimi.warpgogol.com` | TXT (BIMI) | `v=BIMI1; l=...` — brand logo in email clients (optional) |

`dns.record.validate` reports missing email records as warnings (not errors) unless the zone declares them — in which case missing = error.

## Architectural fit

- **RFC-0752**: Subdomain Management Protocol handles Worker-backed subdomains (DNS + Workers route). This RFC handles all other DNS records. The two protocols are orthogonal — different record types, different lifecycle, different commands.
- **RFC-0751**: Service Deployment Protocol depends on RFC-0752, not this RFC. DNS records managed by this protocol are not part of the service deploy pipeline.
- **DNA-40**: Extends the deployment contract with DNS record declarations as version-controlled artifacts.

## Design

### dns.record.upsert

1. **Read declaration file** — `systems/<system-id>/dns-records.yaml`.
2. **Resolve zone ID** — from `systems/registry.yaml` `cloudflareZoneId`.
3. **List existing DNS records** — `GET /zones/{zone_id}/dns_records` — cache for comparison.
4. **For each declared record**:
   a. **Find matching record** — by `(name, type)` for single-value types, by `(name, type, content)` for multi-value types.
   b. **If not found** — create via `POST /zones/{zone_id}/dns_records`.
   c. **If found but content differs** — update via `PUT /zones/{zone_id}/dns_records/{id}`.
   d. **If found and content matches** — skip (unchanged).
5. **Return result** — structured JSON with created/updated/unchanged/errors arrays.

### dns.record.validate

1. **Read declaration file**.
2. **Resolve zone ID**.
3. **List existing DNS records** from Cloudflare.
4. **For each declared record**:
   a. Check if it exists in Cloudflare.
   b. Check if content matches.
5. **For each Cloudflare record not in declaration** — report as `extra` (informational, not error).
6. **Return result** — `valid` if all declared records match, `drifted` if some mismatch, `missing-records` if some are absent.

### dns.record.list

1. **Resolve zone ID**.
2. **List all DNS records** — `GET /zones/{zone_id}/dns_records` (paginated).
3. **Return result** — all records with id, name, type, content, proxied, priority.

### dns.record.delete

1. **Resolve zone ID**.
2. **Find record** — by `--name` and `--type`.
3. **Delete** — `DELETE /zones/{zone_id}/dns_records/{id}`.
4. **Return result** — confirmation with deleted record details.

### Declaration file placement

Declaration files live in `systems/<system-id>/dns-records.yaml` — co-located with the system (client) that owns the zone. For the studio domain, this is `systems/warpgogol-com/dns-records.yaml`. The file is version-controlled in the werkstatt monorepo.

### Validation integration

`dns.record.validate` is integrated into `sites-check.run` as a warning-level check (not blocking) for zones that have a declaration file. This surfaces drift without blocking deploys.

## Rollout

- **Default behavior**: All four commands are available immediately.
- **Studio zone**: `systems/warpgogol-com/dns-records.yaml` is the first declaration file, covering `warpgogol.com` email records and external CNAMEs.
- **Client zones**: Each client zone gets its own `dns-records.yaml` when the client is onboarded.
- **Existing records**: `dns.record.validate` can verify existing Cloudflare records against a new declaration file. `dns.record.upsert` is idempotent — safe to run on zones with existing records.

## Alternatives considered

- **Cloudflare Dashboard only (status quo)**: Rejected — no version control, no validation, no audit trail.
- **Terraform / Pulumi**: Rejected — adds infrastructure-as-code dependency. Direct API calls are simpler for this scope.
- **Merge with RFC-0752**: Rejected — different record types, different lifecycle, different commands. Worker-backed subdomains need DNS + Workers route; arbitrary DNS records need only DNS. Merging would conflate two orthogonal concerns.
- **Single global declaration file**: Rejected — per-zone declaration files are co-located with the system that owns the zone, keeping concerns separated.
- **Auto-delete extra records**: Rejected — deleting DNS records that exist in Cloudflare but not in the declaration could break production. `dns.record.validate` reports extras as informational; operator must explicitly delete via `dns.record.delete`.

## Risks

- **Email deliverability disruption**: Incorrect MX/SPF/DKIM/DMARC records can break email delivery. Mitigated by: `dns.record.validate` before `dns.record.upsert` (dry-run mode), and version control (rollback via git revert + re-upsert).
- **Cloudflare API rate limits**: Zones with many records could hit rate limits during upsert. Mitigated by paginated API calls and per-record upsert (not bulk).
- **Declaration file drift**: If the declaration file doesn't match reality, `dns.record.upsert` could overwrite correct records with stale declarations. Mitigated by: `dns.record.validate` first, code review of declaration changes.
- **Multiple DKIM selectors**: Some email providers use multiple DKIM selectors. The declaration file supports multiple TXT records with different names — no special handling needed.

## Acceptance criteria

- [ ] `dns.record.upsert` command registered in the kernel command table
- [ ] `dns.record.validate` command registered in the kernel command table
- [ ] `dns.record.list` command registered in the kernel command table
- [ ] `dns.record.delete` command registered in the kernel command table
- [ ] `systems/warpgogol-com/dns-records.yaml` declaration file exists with email records
- [ ] `dns.record.upsert --zone warpgogol.com` creates/updates all declared records
- [ ] `dns.record.upsert` is idempotent — running twice reports all records as unchanged
- [ ] `dns.record.validate --zone warpgogol.com` reports `valid` after upsert
- [ ] `dns.record.validate` reports `drifted` when a record's content differs from declaration
- [ ] `dns.record.validate` reports `missing-records` when a declared record is absent
- [ ] `dns.record.list --zone warpgogol.com` returns all DNS records in the zone
- [ ] `dns.record.delete` removes a specific record
- [ ] `dns.record.validate` is integrated into `sites-check.run` as a warning-level check
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The DNS record commands live in `packages/os/site-kernel-handoff/src/dns/` (new directory).
- The Cloudflare API client is shared with RFC-0752 (same `CLOUDFLARE_API_TOKEN`, same zone ID resolution).
- The declaration file schema is defined in `packages/ontology/src/schemas/dns-records.ts` (Zod schema).
- **Implementation order**: This RFC is independent of RFC-0751 and RFC-0752. It can be implemented in any order.
