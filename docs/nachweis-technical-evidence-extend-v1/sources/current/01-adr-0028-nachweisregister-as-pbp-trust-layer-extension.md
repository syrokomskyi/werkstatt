---
id: ADR-0028
title: "Nachweisregister as PBP trust-layer extension"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt: 2026-08-06
supersedes: []
supersededBy:
related:
  - RFC-0706
  - RFC-0707
  - RFC-0708
  - RFC-0398
  - RFC-0416
  - RFC-0417
  - RFC-0405
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0028: Nachweisregister as PBP trust-layer extension

## Context

The Warpgogol Nachweisregister specification (v0.2) proposes a standalone evidence registry with its own JSON Schema (`nachweisregister-v0.1.schema.json`), lifecycle model, and API surface. The specification defines `NachweisRecord`, `Claim`, `Quote`, `SourceDocument`, `Consent`, `Status`, and `Verification` entities with cryptographic hash chains, publication gates, and consent management.

The Werkstatt already has a PBP trust layer with three entity types:

- `pbp/claim@1` (RFC-0405) — business claims with `evidenceRefs` and `governance`
- `pbp/evidence-source@1` (RFC-0416) — evidence sources with `kind` and `authority`
- `pbp/disclosure@1` (RFC-0417) — disclosures with `materiality` and `publication`

The Werkstatt also has a Bordbuch system (RFC-0355) — an append-only hash-chained event log with writer-role enforcement, and `@warpgogol/fingerprint` for cryptographic hashing.

The question is whether to implement Nachweisregister as a parallel system with its own schema, or as an extension of existing PBP + Bordbuch infrastructure.

## Decision

Nachweisregister is implemented as an extension of the existing PBP trust layer and Bordbuch infrastructure, not as a parallel system.

- PBP `Claim` entity is extended with Nachweis-specific fields (`statementLang`, `verificationLevel`) rather than creating a separate `NachweisRecord` entity.
- PBP `EvidenceSource` entity is extended with new `kind` enum values (`client-statement`, `project-confirmation`, `certificate`, `operational-evidence`) and optional `items` fields (`sha256`, `storage`, `mediaType`, `qualityStatus`) for file-based evidence.
- A new PBP `Consent` entity (`pbp/consent@1`) is created for granular consent management — consent is not a sub-type of `EvidenceSource` but a separate trust entity that authorises publication of evidence.
- Cryptographic verification data (SHA-256 chain, operator signature, RFC 3161 timestamp) lives in Bordbuch entry metadata, not in PBP content files. PBP entities store only the `verificationLevel` (N0–N3) as a status field.
- Two new `BordbuchEntryKind` values (`nachweis-record`, `nachweis-consent`) and a new writer-role (`nachweis`) are added to the Bordbuch system.
- A new `EntitledFeature` value (`nachweis`) is added to the paid-feature catalog for commercial module gating.

## Justification

- **Avoids schema duplication.** The external specification's `NachweisRecord` overlaps significantly with PBP `Claim` (claims, quotes, source references, limitations). A parallel schema would require duplicate validation, duplicate semantic projection, and duplicate content collection wiring.
- **Leverages Bordbuch hash-chain.** The Bordbuch already provides an append-only, hash-chained, writer-role-enforced audit log. Storing cryptographic verification data in Bordbuch metadata reuses this infrastructure instead of building a separate chain.
- **Consent is a distinct concern.** Consent authorises publication of personal data in evidence; it is not evidence itself. Modeling it as a separate PBP entity (not a sub-type of `EvidenceSource`) keeps the trust layer clean.
- **Commercial module pattern.** The existing entitlement system (`ENTITLED_FEATURES`, Stripe mapping, `entitlement.module.validate`) provides the exact gating mechanism for a paid Nachweisregister module. Adding `nachweis` to the catalog follows the established pattern (`trust`, `pseo`, `blog`, etc.).
- **Backward compatible.** Extending `EvidenceSource` enum values and adding optional `items` fields are non-breaking changes within `pbp/*@1`. New `BordbuchEntryKind` values are additive. New `EntitledFeature` is additive.

## Consequences

- **Positive:** Single validation path for all trust entities. Bordbuch provides cryptographic integrity without a separate chain. Commercial gating reuses existing entitlement infrastructure. Client sites activate Nachweisregister via `system.md` module declaration + Stripe entitlement.
- **Negative:** PBP `Claim` entity accumulates Nachweis-specific fields, which may not be relevant for non-Nachweis claims. The `statementLang` field is Nachweis-specific but lives on a general entity. Mitigated by making it optional.
- **Technical debt:** The external specification's `record_type` enum (`client_statement`, `project_confirmation`, etc.) maps to `EvidenceSource` `kind` values, but the mapping is not 1:1 — `record_type` describes the Nachweis record, while `kind` describes the evidence source. This semantic gap is documented but not resolved; a future `pbp/*@2` namespace may introduce a dedicated `NachweisRecord` entity if the field proliferation becomes unsustainable.

## Evolution

- If Nachweisregister field proliferation on `Claim` becomes problematic (more than 5 Nachweis-specific optional fields), extract a dedicated `pbp/nachweis-record@1` entity in a future namespace.
- If client sites need custom verification levels beyond N0–N3, extend the `verificationLevel` enum via a superseding RFC.
- If R2 storage requirements diverge significantly from the existing `axiom-evidence` bucket pattern, create per-site buckets with a provisioning command.
- The `nachweis` entitlement may be split into tiers (basic, pro) if feature differentiation is needed — following the `pseo` tier pattern.
