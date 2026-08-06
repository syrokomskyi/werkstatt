---
id: RFC-0707
title: "Add Nachweis kernel module with R2 storage and Bordbuch lifecycle"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0028
  - RFC-0706
  - RFC-0355
  - RFC-0651
  - RFC-0169
satisfies:
  - DNA-46
  - DNA-53
  - DNA-59
versionBump: minor
commands:
  proposed:
    - nachweis.ingest
    - nachweis.validate
    - nachweis.manifest.generate
    - nachweis.consent.update
    - nachweis.publish
    - nachweis.withdraw
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "nachweis.ingest creates Bordbuch entry with source SHA-256 and R2 upload"
  - "nachweis.validate enforces publication gate (consent + integrity + verification level)"
  - "nachweis.manifest.generate produces manifest.json with only published records"
  - "nachweis.publish transitions record to published after gate check"
  - "nachweis.withdraw removes public visibility within SLA"
nonGoals:
  - "Does not implement UI components or site pages (RFC-0708)"
  - "Does not create PBP content records (RFC-0708)"
  - "Does not implement RFC 3161 qualified timestamp (N3) — deferred to future RFC"
  - "Does not implement operator cryptographic signature — deferred to future RFC"
  - "Does not implement redacted PDF generation — manual process for pilot"
  - "Does not implement consent form templates — content authoring in RFC-0708"
  - "Does not modify @warpgogol/ontology or @warpgogol/fingerprint — only imports from them (RFC-0706 modifies ontology)"
  - "Does not implement GDPR data retention policy for withdrawn records — deferred to future RFC"
---

# RFC-0707: Add Nachweis kernel module with R2 storage and Bordbuch lifecycle

## Context

ADR-0028 establishes Nachweisregister as a PBP trust-layer extension. RFC-0706 extends the schema (EvidenceSource kinds, Consent entity, Bordbuch entry kinds, entitlement catalog). This RFC implements the kernel commands that manage the Nachweis lifecycle: ingest, validate, manifest generation, consent updates, publication, and withdrawal.

The Werkstatt has existing infrastructure for:

- Bordbuch append-only hash chain (RFC-0355) — `appendBordbuchEntry` in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`
- R2 evidence storage (RFC-0651) — `evidence.sync` in `packages/os/site-kernel-handoff/src/evidence/`
- Cryptographic hashing — `@warpgogol/fingerprint` (`byteHash`, `byteHashFile`, `stableJsonHash`)
- Entitlement gating (RFC-0169) — `entitlement.module.validate` in `packages/os/site-kernel-checks/`

R2 credentials are configured (bucket `axiom-evidence` exists). A new dedicated bucket `nachweise` will be created for Nachweisregister storage.

## Problem

1. **No intake command.** Ingesting a PDF evidence document requires: computing SHA-256, uploading to R2, creating a PBP `EvidenceSource` entity, and appending a Bordbuch entry — all manual steps with no atomicity guarantee.

2. **No publication gate enforcement.** The specification defines a normative publication gate (consent granted + source integrity verified + record approved + verification level N3 + public derivative ready + legal content check passed). No command enforces this gate.

3. **No manifest generation.** The specification requires a public `manifest.json` with ETag, `Cache-Control`, and only published records. No command generates this projection.

4. **No consent lifecycle command.** Consent status transitions (not_requested → requested → granted → revoked) need to be recorded in both the PBP `Consent` entity and the Bordbuch.

5. **No withdrawal command.** The specification defines a 4-hour SLA for revocation: set consent_status=revoked, record_status=withdrawn, remove from manifest, purge CDN, return 410 Gone. No command orchestrates this.

## Decision

A new kernel module `nachweis` is created in `packages/os/site-kernel-handoff/src/nachweis/` with six commands.

### nachweis.ingest

Intakes a source document (PDF), computes SHA-256, uploads to R2, and appends a Bordbuch `nachweis-record` entry.

```sh
pnpm exec site-kernel run nachweis.ingest \
  --system warpgogol-com \
  --file path/to/source.pdf \
  --record-type project_confirmation \
  --slug nicaragua-projekt \
  --title-de "Nicaragua-Projekt e. V. – Projektbestätigung"
```

Flags:

- `--system` (required) — Sternsystem id
- `--file` (required) — path to source PDF
- `--record-type` (required) — maps to `EvidenceSource.kind` new enum values
- `--slug` (required) — URL slug for the record
- `--title-de`, `--title-uk`, `--title-en` — localized titles
- `--quality-status` (default: `unverified`) — initial source quality status
- `--dry-run` — compute hash and validate without uploading or appending

Output:

```json
{
  "command": "nachweis.ingest",
  "data": {
    "recordId": "nr_nicaragua_20260803",
    "slug": "nicaragua-projekt",
    "sourceSha256": "58e9cde7607f2f1a00dae1676f44955b0b4cfe62c412d3dfb6b2c4b701503deb",
    "r2Path": "nachweise/private/nr_nicaragua_20260803/v1/source.pdf",
    "bordbuchEventId": "event-000123",
    "verificationLevel": "N1"
  }
}
```

### nachweis.validate

Validates Nachweis PBP entities and enforces the publication gate.

```sh
pnpm exec site-kernel run nachweis.validate --system warpgogol-com
pnpm exec site-kernel run nachweis.validate --system warpgogol-com --json
```

Checks:

- All `EvidenceSource` entities with Nachweis kinds have `sha256` in items
- All `Consent` entities with `status: granted` have `grantedAt` set
- All `Claim` entities with `statementLang` have valid BCP 47 tags
- Publication gate: no entity with `record_status: published` exists without all gate conditions met (consent granted, source integrity verified, N3, public derivative ready, legal content check passed)
- Bordbuch: all `nachweis-record` and `nachweis-consent` entries have valid hash chain (delegates to `bordbuch.validate`)

### nachweis.manifest.generate

Generates `public/nachweise/manifest.json` from published Nachweis records.

```sh
pnpm exec site-kernel run nachweis.manifest.generate --system warpgogol-com
```

Reads PBP trust collections, filters by `publication.visibility: public`, produces manifest with `schema_version`, `generated_at: null` (RFC-0602 determinism), `expires_at`, `records[]` (id, slug, title, canonical_url, verification_level, source_sha256).

Writes to `public/nachweise/manifest.json` in the cache clone. Integrated into `build.prepare` pipeline after `bordbuch.commit` (the last bordbuch step).

### nachweis.consent.update

Updates consent status and appends Bordbuch entry.

```sh
pnpm exec site-kernel run nachweis.consent.update \
  --system warpgogol-com \
  --consent-id consent_nicaragua_1 \
  --status requested \
  --method verified_business_email
```

Updates the PBP `Consent` entity's `status` field and appends a `nachweis-consent` Bordbuch entry with metadata (previous status, new status, method, actor).

### nachweis.publish

Transitions a record to `published` after gate check.

```sh
pnpm exec site-kernel run nachweis.publish \
  --system warpgogol-com \
  --slug nicaragua-projekt
```

Preconditions (publication gate):

- `consent.status: granted`
- `source_integrity_status: verified`
- `record_status: approved`
- `verification_level: N3` (or `N2` for pilot with documented exception)
- `publication.public_derivative_ready: true`
- `publication.legal_content_check: passed`

If all conditions met: sets `publication.visibility: public`, appends `nachweis-record` Bordbuch entry, regenerates manifest.

### nachweis.withdraw

Withdraws a published record (revocation flow).

```sh
pnpm exec site-kernel run nachweis.withdraw \
  --system warpgogol-com \
  --slug nicaragua-projekt \
  --reason "consent revoked"
```

Sets `consent.status: revoked`, `record_status: withdrawn`, `publication.visibility: private`, appends `nachweis-consent` and `nachweis-record` Bordbuch entries, regenerates manifest.

## Architectural fit

- **Module placement:** `packages/os/site-kernel-handoff/src/nachweis/` — same layer as Bordbuch and evidence.sync. Commands interact with Bordbuch (hash chain), R2 (storage), and PBP content (read/write entity files).
- **Bordbuch integration:** Uses `appendBordbuchEntry` with writer-role `nachweis` and kinds `nachweis-record` / `nachweis-consent` (RFC-0706).
- **R2 integration:** Uses `@aws-sdk/client-s3` (already a dependency for evidence.sync). New bucket `nachweise` with prefix `private/{recordId}/{version}/` and `public/{recordId}/{version}/`.
- **Fingerprint integration:** Uses `byteHashFile` from `@warpgogol/fingerprint` for SHA-256 computation. Uses `stableJsonHash` for record payload hash (JCS).
- **Pipeline integration:** `nachweis.manifest.generate` added to `build.prepare` pipeline after `bordbuch.commit` (the last bordbuch step, before `passport.key.ensure`). `nachweis.validate` added to `build.check` pipeline after `SITES_CHECK_AUTHOR_PIPELINE` (which includes `pbp.content.validate`), before `biome.tokens.validate`.
- **Entitlement gating:** Commands check `nachweis` entitlement at runtime. If not resolved, commands return skip result (not error) — same pattern as `pseo` commands.
- **Module registration:** `nachweis.module.ts` is wired into the handoff platform module via `tools/kernel.config.ts` (lazy-loaded `moduleLoaders` entry), following the same pattern as `evidence-module.ts` and `bordbuch-module.ts`.
- **AGENTS.md update:** `packages/os/site-kernel-handoff/AGENTS.md` must be updated with nachweis-specific rules: entitlement gating pattern, R2 bucket prerequisite, atomicity gap guidance, and the `--pilot-n2-exception` removal commitment.
- **Compass sync:** `docs/verification-plan.xml` may need synchronization if the new pipeline steps (`nachweis.manifest.generate`, `nachweis.validate`) affect the verification surface.

## Design

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts

export interface NachweisRecord {
  recordId: string;
  slug: string;
  recordType: PbpEvidenceKind;
  title: Record<string, string>;
  sourceSha256: string;
  r2Path: string;
  bordbuchEventId: string;
  verificationLevel: "N0" | "N1" | "N2" | "N3";
}

export interface NachweisIngestResult {
  recordId: string;
  slug: string;
  sourceSha256: string;
  r2Path: string;
  bordbuchEventId: string;
  verificationLevel: "N0" | "N1" | "N2" | "N3";
}

export interface NachweisManifest {
  schemaVersion: string;
  generatedAt: string | null;
  expiresAt: string | null;
  records: NachweisManifestEntry[];
}

export interface NachweisManifestEntry {
  id: string;
  slug: string;
  title: Record<string, string>;
  canonicalUrl: string;
  verificationLevel: string;
  sourceSha256: string;
}

export interface NachweisPublicationGate {
  consentGranted: boolean;
  sourceIntegrityVerified: boolean;
  recordApproved: boolean;
  verificationLevelMet: boolean;
  publicDerivativeReady: boolean;
  legalContentCheckPassed: boolean;
  allPassed: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts` | Module registration |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` | R2 upload/download, hash computation |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-ingest.ts` | Intake command handler |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-validate.ts` | Validation + publication gate |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-manifest.ts` | Manifest generation |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-consent.ts` | Consent lifecycle command |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts` | Publish gate command |
| `packages/os/site-kernel-handoff/src/nachweis/nachweis-withdraw.ts` | Withdrawal command |
| `packages/os/site-kernel-handoff/src/nachweis/index.ts` | Barrel exports |
| `systems/{system}/public/nachweise/manifest.json` | Generated manifest output |
| `systems/{system}/bordbuch/events.ndjson` | Bordbuch entries (existing) |
| R2 bucket `nachweise` | Private and public document storage |

### Pipeline integration

```ts
// build.prepare pipeline — after bordbuch.commit, before passport.key.ensure
{ command: "nachweis.manifest.generate" },

// build.check pipeline — after SITES_CHECK_AUTHOR_PIPELINE, before biome.tokens.validate
{ command: "nachweis.validate" },
```

### Output format

All commands return `KernelCommandResult<T>` with `--json` support:

```json
{
  "command": "nachweis.validate",
  "data": {
    "systemId": "warpgogol-com",
    "records": 2,
    "violations": [],
    "gateResults": [
      {
        "slug": "nicaragua-projekt",
        "allPassed": false,
        "consentGranted": false,
        "sourceIntegrityVerified": true,
        "recordApproved": false,
        "verificationLevelMet": false,
        "publicDerivativeReady": false,
        "legalContentCheckPassed": false
      }
    ]
  },
  "exitCode": 0,
  "summary": "nachweis.validate: 2 records, 0 violations, 0 published"
}
```

### Failure modes

- `nachweis.ingest` fails if file does not exist or is not a PDF.
- `nachweis.ingest` fails if R2 upload fails (network error, credentials). Bordbuch entry is NOT appended — ingest is atomic: upload first, then append.
- `nachweis.ingest` acquires `system:<id>` and `bordbuch:<id>` locks before appending, preventing concurrent ingests from producing duplicate Bordbuch entries. R2 uploads are not lock-protected — concurrent uploads of the same file produce separate R2 objects with version-prefixed paths.
- `nachweis.validate` exits non-zero if any publication gate violation exists (record published without all conditions met). Performance cost is O(n+m) where n is Bordbuch entries and m is PBP trust entities. For sites with 100+ Nachweis records, bordbuch validation dominates — monitor execution time.
- `nachweis.publish` fails if any gate condition is not met. Does not modify any state on failure.
- `nachweis.withdraw` always succeeds (idempotent) — if already withdrawn, returns no-op result. The R2 object is NOT deleted — personal data persists in private R2 storage as an audit trail. Data retention policy for withdrawn records is deferred to a future RFC.
- `nachweis.manifest.generate` writes empty manifest if no published records.
- All commands skip (not fail) if `nachweis` entitlement is not resolved.

## Rollout

- **Default behavior:** Commands are registered but skip execution if `nachweis` entitlement is not resolved. Sites without the module are unaffected.
- **warpgogol-com pilot:** `entitlementsOverride: ["nachweis"]` in `system.md`. R2 bucket `nachweise` created manually. Two records ingested in `preview` status (not published).
- **Pipeline integration:** `nachweis.manifest.generate` and `nachweis.validate` are added to `build.prepare` and `build.check` respectively. They skip silently when no Nachweis content exists.
- **Client site adoption:** Stripe feature `feature_nachweis` activated. `entitlements.resolve` fetches the feature. Kernel commands execute. R2 bucket provisioned per-site or shared with site-prefixed paths.

## Alternatives considered

- **Runtime manifest endpoint (Cloudflare Worker):** Rejected for pilot. Static generation via `nachweis.manifest.generate` is simpler, deterministic, and CDN-cacheable. Revocation requires redeploy (minutes, within 4-hour SLA). Runtime endpoint is a future optimization if revocation frequency demands it.
- **Separate `packages/nachweis/` package:** Rejected. Commands depend on Bordbuch internals (`appendBordbuchEntry`, `resolveBordbuchPath`), R2 helpers from `evidence/`, and fingerprint — all in `site-kernel-handoff`. A separate package would create circular dependencies or require exporting internals.
- **N3 timestamp token in this RFC:** Deferred. RFC 3161 qualified timestamp requires a TSA service integration (e.g. Digicert, Sectigo). This is a separate concern from the core lifecycle. Pilot operates at N1 (source hashed) and N2 (operator signature). N3 is a future RFC.

## Risks

- **R2 bucket proliferation:** Each client site may need its own `nachweise` bucket. Cloudflare R2 has a bucket limit per account. Mitigation: use prefix-based isolation (`nachweise/{systemId}/private/...`) in a shared bucket for small clients; dedicated buckets for large clients.
- **Bordbuch growth:** Each Nachweis record generates 3–5 Bordbuch entries (ingest, consent request, consent grant, publish, withdraw). With many records, the bordbuch grows faster. Mitigation: `bordbuch.validate` performance is O(n) — monitor for sites with 100+ Nachweis records.
- **Atomicity gap in ingest:** If R2 upload succeeds but Bordbuch append fails, the file is in R2 but not tracked. Mitigation: ingest appends Bordbuch immediately after upload; on failure, log a warning with the R2 path for manual cleanup. A future `nachweis.cleanup` command could detect orphaned R2 objects.
- **Pilot N2/N3 gap:** The specification requires N3 for publication. The pilot operates at N1. `nachweis.publish` accepts N2 with a documented exception flag (`--pilot-n2-exception`) to allow pilot publication without N3. This flag is removed when N3 is implemented.

## Acceptance criteria

- [ ] `nachweis.module.ts` registers all 6 commands with correct names, scopes, and flags
- [ ] `nachweis.ingest` computes SHA-256 via `@warpgogol/fingerprint`, uploads to R2, appends Bordbuch entry
- [ ] `nachweis.validate` checks publication gate conditions and reports violations
- [ ] `nachweis.manifest.generate` writes `manifest.json` with only `publication.visibility: public` records
- [ ] `nachweis.consent.update` updates PBP Consent entity and appends `nachweis-consent` Bordbuch entry
- [ ] `nachweis.publish` enforces all gate conditions before transitioning to published
- [ ] `nachweis.withdraw` sets revoked/withdrawn status and regenerates manifest
- [ ] All commands skip silently when `nachweis` entitlement is not resolved
- [ ] `nachweis.manifest.generate` integrated into `build.prepare` pipeline
- [ ] `nachweis.validate` integrated into `build.check` pipeline
- [ ] `generatedAt` in manifest is `null` (RFC-0602 timestamp determinism)
- [ ] All commands support `--json` output
- [ ] All affected packages pass `build:check` (typecheck)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0706 (schema extensions). Implement RFC-0706 first.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0707 --reason "..." --invariant "DNA-N"` instead of working around it. The supersede escalation protocol is defined in RFC-0158 (DNA registry validation) and RFC-0224 (accepted→implemented transition).
- R2 bucket `nachweise` must be created in Cloudflare Dashboard before running `nachweis.ingest`.
- The `--pilot-n2-exception` flag on `nachweis.publish` is temporary and MUST be removed when N3 timestamp support is implemented in a future RFC.
