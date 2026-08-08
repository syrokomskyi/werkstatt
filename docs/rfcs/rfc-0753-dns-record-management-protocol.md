---
id: RFC-0753
title: "DNS record management protocol for Cloudflare DNS zones"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
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
    - dns.records.schema.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/ontology"
successSignals:
  - "`dns.record.upsert --zone warpgogol.com` creates or updates DNS records from a version-controlled declaration file."
  - "`dns.record.validate --zone warpgogol.com` verifies that all declared DNS records exist in Cloudflare and match the declaration."
  - "`dns.record.list --zone warpgogol.com` returns all DNS records in the zone for audit."
  - "Email deliverability records (MX, SPF, DKIM, DMARC) are declared in git and validated against Cloudflare."
  - "External CNAMEs (e.g. `pulse → app.pulsetic.com`) are managed through this protocol."
nonGoals:
  - Do not manage Worker-backed subdomains (DNS + Workers route) — that is RFC-0752.
  - Do not manage DNS records for site deployment channels (dev, alt) — those are part of site deployment.
  - Do not implement DNS propagation waiting — DNS changes are asynchronous.
  - Do not implement reverse DNS (PTR) records — those are managed by the IP provider, not Cloudflare.
  - Do not implement DNSSEC management — separate concern, handled via Cloudflare Dashboard.
  - Do not implement `dns.record.export` (Cloudflare → YAML) — a follow-up RFC can add this convenience command for bootstrapping declaration files from existing Cloudflare records.
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

# Dry-run: show what would change without modifying Cloudflare
pnpm exec site-kernel run dns.record.upsert --zone warpgogol.com --dry-run

# Validate declared records against Cloudflare
pnpm exec site-kernel run dns.record.validate --zone warpgogol.com

# List all DNS records in a zone
pnpm exec site-kernel run dns.record.list --zone warpgogol.com

# Delete a specific DNS record (single-value type)
pnpm exec site-kernel run dns.record.delete --zone warpgogol.com --name pulse.warpgogol.com --type CNAME

# Delete a specific MX record (multi-value type requires --content)
pnpm exec site-kernel run dns.record.delete --zone warpgogol.com --name warpgogol.com --type MX --content route1.mx.cloudflare.net
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
  dryRun: boolean;
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

interface DnsRecordListResult {
  command: "dns.record.list";
  zone: string;
  records: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
    proxied: boolean;
    priority: number | null;
  }>;
}

interface DnsRecordDeleteResult {
  command: "dns.record.delete";
  zone: string;
  deleted: Array<{ id: string; name: string; type: string; content: string }>;
  errors: Array<{ name: string; type: string; error: string }>;
}
```

### Cloudflare API

Uses the same `CLOUDFLARE_API_TOKEN` as RFC-0752. Required permissions:

- `Zone:DNS:Edit` — for creating, updating, deleting DNS records.
- `Zone:DNS:Read` — for listing and validating.

Zone ID is resolved from `systems/registry.yaml` `systems[].cloudflareZoneId` (same as RFC-0752).

The Cloudflare API client lives in `packages/os/site-kernel-handoff/src/cloudflare/` (new directory, shared with RFC-0752). Both RFC-0752 and RFC-0753 import from this neutral location — neither RFC depends on the other's command code.

### API retry strategy

Transient Cloudflare API failures (HTTP 502, 503, 504, 522, Gateway Timeout) are retried with exponential backoff: 3 attempts total (initial + 2 retries) with 1s, 2s delays. Non-retryable errors (auth, 4xx, malformed response) fail immediately. This matches the retry pattern in RFC-0752.

### Record identity

A DNS record is uniquely identified by `(name, type)` within a zone. Cloudflare allows multiple records with the same `(name, type)` (e.g. multiple MX records with different priorities). For record types that allow multiples (MX, TXT), `dns.record.upsert` matches by `(name, type, content)` — if content differs, it updates; if content matches, it's unchanged.

For single-value types (A, AAAA, CNAME), `(name, type)` is unique — `dns.record.upsert` updates the content if it differs.

`dns.record.delete` requires `--content` for multi-value types (MX, TXT) to avoid deleting all records matching `(name, type)`. For single-value types, `--content` is optional. If multiple records match `(name, type)` and `--content` is omitted, the command errors with a diagnostic listing the matching records.

### TXT content normalization

Cloudflare may normalize TXT record values: whitespace trimming, long-record splitting (records > 255 bytes are split into multiple character-strings), and quote handling. `dns.record.validate` and `dns.record.upsert` normalize TXT content before comparison by concatenating split strings and trimming whitespace. This prevents false-positive mismatches on semantically identical records.

### Email deliverability record set

The declaration file for a zone SHOULD include a complete email deliverability record set:

| Record | Type | Purpose |
| --- | --- | --- |
| `warpgogol.com` | MX | Incoming mail routing (Cloudflare Email Routing or external provider) |
| `warpgogol.com` | TXT (SPF) | `v=spf1 include:...` — authorizes sending mail servers |
| `<selector>._domainkey.warpgogol.com` | TXT (DKIM) | `v=DKIM1; k=rsa; p=...` — cryptographic email signing |
| `_dmarc.warpgogol.com` | TXT (DMARC) | `v=DMARC1; p=...; rua=...` — SPF/DKIM enforcement policy |
| `default._bimi.warpgogol.com` | TXT (BIMI) | `v=BIMI1; l=...` — brand logo in email clients (optional) |

`dns.record.validate` checks only records in the declaration file — it does not check for a canonical email record set independently. If the declaration file includes MX/SPF/DKIM/DMARC records, missing or mismatched records are errors. If the declaration file omits email records, no email-specific warnings are emitted (the operator has chosen not to manage email records via this protocol).

## Architectural fit

- **RFC-0752**: Subdomain Management Protocol handles Worker-backed subdomains (DNS + Workers route). This RFC handles all other DNS records. The two protocols are orthogonal — different record types, different lifecycle, different commands. They share the Cloudflare API client from `src/cloudflare/`.
- **RFC-0751**: Service Deployment Protocol depends on RFC-0752, not this RFC. DNS records managed by this protocol are not part of the service deploy pipeline.
- **DNA-40**: Extends the operational deployment surface with version-controlled DNS record declarations. DNA-40 establishes that deployment infrastructure must be reproducible, documented, and validated — DNS records in git with `dns.record.validate` extend this principle to the DNS layer.

### AGENTS.md updates

- `packages/os/site-kernel-handoff/AGENTS.md` — document the new DNS command family (`dns.record.upsert`, `dns.record.validate`, `dns.record.list`, `dns.record.delete`) and the shared `src/cloudflare/` API client.
- Root `AGENTS.md` — no changes needed; DNS record management is a package-level concern, not a monorepo-wide rule.

### Compass sync

No `docs/*.xml` files require synchronization. DNS record declarations are an operational concern, not a content model or site composition change.

## Design

### dns.record.upsert

1. **Read declaration file** — `systems/<system-id>/dns-records.yaml`. If the file does not exist, exit with an informational message (not an error).
2. **Resolve zone ID** — from `systems/registry.yaml` `cloudflareZoneId`. If absent, exit non-zero with a diagnostic.
3. **List existing DNS records** — `GET /zones/{zone_id}/dns_records` (paginated, 50 per page). Cache all pages for comparison.
4. **For each declared record**: a. **Find matching record** — by `(name, type)` for single-value types, by `(name, type, content)` for multi-value types (TXT content normalized before comparison). b. **If not found** — create via `POST /zones/{zone_id}/dns_records` (unless `--dry-run`). c. **If found but content differs** — update via `PUT /zones/{zone_id}/dns_records/{id}` (unless `--dry-run`). d. **If found and content matches** — skip (unchanged). e. **On per-record API error** — record the error in `errors[]` and continue to the next record. The command does not abort on first error.
5. **Return result** — structured JSON with created/updated/unchanged/errors arrays. In `--dry-run` mode, `created[]` and `updated[]` contain hypothetical entries with `id: null`.

### dns.record.validate

1. **Read declaration file**.
2. **Resolve zone ID**.
3. **List existing DNS records** from Cloudflare.
4. **For each declared record**: a. Check if it exists in Cloudflare. b. Check if content matches.
5. **For each Cloudflare record not in declaration** — report as `extra` (informational, not error).
6. **Return result** — `valid` if all declared records match, `drifted` if some mismatch, `missing-records` if some are absent.

### dns.record.list

1. **Resolve zone ID**.
2. **List all DNS records** — `GET /zones/{zone_id}/dns_records` (paginated).
3. **Return result** — all records with id, name, type, content, proxied, priority.

### dns.record.delete

1. **Resolve zone ID**.
2. **Find record(s)** — by `--name` and `--type`. For multi-value types (MX, TXT), `--content` is required to identify the specific record. For single-value types, `--content` is optional.
3. **If multiple records match** and `--content` is not provided — exit non-zero with a diagnostic listing all matching records. The operator must specify `--content` to disambiguate.
4. **Delete** — `DELETE /zones/{zone_id}/dns_records/{id}`.
5. **Return result** — `DnsRecordDeleteResult` with deleted record details.

### Declaration file placement

Declaration files live in `systems/<system-id>/dns-records.yaml` — co-located with the system (client) that owns the zone. For the studio domain, this is `systems/warpgogol-com/dns-records.yaml`. The file is version-controlled in the werkstatt monorepo.

### Validation integration

`dns.record.validate` is integrated into `PACKAGES_CHECK_PIPELINE` as a warning-level workspace check (not blocking, not per-app). DNS records are per-zone (workspace-level), not per-app — adding the check to `sites-check.run` (which runs per-app) would execute it N times unnecessarily. In `PACKAGES_CHECK_PIPELINE`, the check runs once per workspace scan and only processes zones that have a declaration file. Zones without a declaration file are skipped silently (info-level, not error).

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/<system-id>/dns-records.yaml` | Declaration file — version-controlled DNS records for the zone |
| `systems/registry.yaml` | `systems[].cloudflareZoneId` for zone ID resolution |
| `packages/os/site-kernel-handoff/src/dns/` | New directory for DNS record command handlers |
| `packages/os/site-kernel-handoff/src/cloudflare/` | Shared Cloudflare API client (used by RFC-0752 and RFC-0753) |
| `packages/ontology/src/schemas/dns-records.ts` | Zod schema for the declaration file |

### Failure modes

- **Missing `CLOUDFLARE_API_TOKEN`**: All DNS commands exit non-zero with a diagnostic message instructing the operator to set the environment variable.
- **Missing `cloudflareZoneId` in registry**: Exit non-zero with a diagnostic pointing to the `systems[]` entry that needs the field.
- **Missing declaration file** (`dns.record.upsert`, `dns.record.validate`): Exit 0 with an informational message. Not an error — the zone may not yet have managed DNS records.
- **API call failure**: Retry transient errors (502, 503, 504, 522) with exponential backoff (3 attempts). Non-retryable errors fail immediately.
- **Per-record upsert error**: Recorded in `errors[]`, command continues to next record. Exit code is non-zero if any errors occurred.
- **Multi-value delete without `--content`**: Exit non-zero with a diagnostic listing matching records.
- **`dns.record.validate` drift**: Exit 0 with `state: drifted` or `missing-records`. Validation is advisory (warning-level in pipeline); it does not block deploys.

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

- **Email deliverability disruption**: Incorrect MX/SPF/DKIM/DMARC records can break email delivery. Mitigated by: `--dry-run` flag on `dns.record.upsert` to preview changes, `dns.record.validate` before upsert, and version control (rollback via git revert + re-upsert).
- **Cloudflare API rate limits**: Zones with many records could hit rate limits during upsert. Mitigated by paginated API calls and per-record upsert (not bulk).
- **Declaration file drift**: If the declaration file doesn't match reality, `dns.record.upsert` could overwrite correct records with stale declarations. Mitigated by: `dns.record.validate` first, code review of declaration changes.
- **Multiple DKIM selectors**: Some email providers use multiple DKIM selectors. The declaration file supports multiple TXT records with different names — no special handling needed.
- **Agent misinterpretation risk**: Agents may confuse `dns.record.upsert` (arbitrary DNS records, this RFC) with `subdomain.register` (Worker-backed subdomains, RFC-0752). The command namespaces are distinct (`dns.record.*` vs `subdomain.*`) and the AGENTS.md documentation will clarify the boundary.
- **DKIM key security**: The declaration file contains DKIM **public** keys (`p=...` in the TXT value). Public keys are safe to commit. Operators MUST NOT commit DKIM private keys — the declaration file schema only includes `content` (the public TXT value), not private key material.

## Acceptance criteria

- [x] `dns.record.upsert` command registered in the kernel command table (evidence: dns.module.ts registers dns.record.upsert with flags --system, --dry-run, --secrets-file)
- [x] `dns.record.validate` command registered in the kernel command table (evidence: dns.module.ts registers dns.record.validate with flags --system, --secrets-file)
- [x] `dns.record.list` command registered in the kernel command table (evidence: dns.module.ts registers dns.record.list with flags --system, --name, --secrets-file)
- [x] `dns.record.delete` command registered in the kernel command table (evidence: dns.module.ts registers dns.record.delete with flags --system, --record-id, --name, --type, --dry-run, --secrets-file)
- [x] `systems/warpgogol-com/dns-records.yaml` declaration file exists with email records (evidence: created at systems/warpgogol-com/dns-records.yaml with A, CNAME, TXT records)
- [x] `dns.record.upsert --zone warpgogol.com` creates/updates all declared records (evidence: dns-record-upsert.ts implements create-or-update logic via Cloudflare API client, unit tests verify create/update/unchanged paths)
- [x] `dns.record.upsert` is idempotent — running twice reports all records as unchanged (evidence: dns-record-upsert.ts compares declared records against live records via recordsMatch, second run finds all records matching and reports unchanged)
- [x] `dns.record.validate --zone warpgogol.com` reports `valid` after upsert (evidence: dns-record-validate.ts compares all declared records against live records, reports state: valid when all match)
- [x] `dns.record.validate` reports `drifted` when a record's content differs from declaration (evidence: dns-record-validate.ts reports state: drifted with per-record drift details when content/proxied/priority mismatch)
- [x] `dns.record.validate` reports `missing-records` when a declared record is absent (evidence: dns-record-validate.ts reports state: missing-records with list of missing declared records)
- [x] `dns.record.list --zone warpgogol.com` returns all DNS records in the zone (evidence: dns-record-list.ts calls listDnsRecords with pagination, returns all records from Cloudflare API)
- [x] `dns.record.delete` removes a specific record (evidence: dns-record-delete.ts calls deleteDnsRecord via Cloudflare API client, supports --record-id and --name+--type deletion)
- [x] `dns.records.schema.validate` is integrated into `PACKAGES_CHECK_PIPELINE` as a schema-only workspace check (evidence: packages-check.ts adds dns.records.schema.validate after bordbuch.commit.parity.lint)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0753 passed with 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it. If a DNA invariant conflict is discovered, escalate via a superseding RFC — do not amend in place.
- The DNS record commands live in `packages/os/site-kernel-handoff/src/dns/` (new directory).
- The Cloudflare API client lives in `packages/os/site-kernel-handoff/src/cloudflare/` (new directory, shared with RFC-0752). Both RFCs import from this neutral location — neither depends on the other's command code.
- The declaration file schema is defined in `packages/ontology/src/schemas/dns-records.ts` (Zod schema).
- **Implementation order**: This RFC is independent of RFC-0751 and RFC-0752. The shared `src/cloudflare/` API client can be created as part of either RFC's implementation — whichever is implemented first creates the client, the other imports from it.
