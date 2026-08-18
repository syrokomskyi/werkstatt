---
id: ADR-0054
title: "Technical assessments as a first-class Nachweisregister evidence profile"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-18
updatedAt: 2026-08-18
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - ADR-0028
  - RFC-0706
  - RFC-0707
  - RFC-0708
  - RFC-0714
  - RFC-0715
  - RFC-0716
  - RFC-0871
  - RFC-0872
  - RFC-0873
  - RFC-0874
  - RFC-0875
  - RFC-0876
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0054: Technical assessments as a first-class Nachweisregister evidence profile

## Context

ADR-0028 correctly established Nachweisregister as an extension of the PBP trust layer and Bordbuch. The first implementation was optimized for client statements, project confirmations, certificates and PDF-based source documents.

Warpgogol now needs to publish another legitimate class of evidence: technical measurements made with external tools/providers, initially:

- Google Lighthouse;
- Cloudflare Agent Readiness.

The same capability is intended to be sold/reused on client Sternsysteme.

A technical measurement differs from a client attestation:

- it describes an observed technical state at a specific time and scope;
- it may be produced by an operator-run tool or by an external provider-run scanner;
- the canonical artifact is normally machine-readable JSON, not a signed customer PDF;
- publication normally does not depend on customer testimonial consent;
- a public PDF derivative is not intrinsically meaningful;
- result provenance, tool/provider version, environment and methodology are essential;
- repeated observations form a time series/history without mutating prior observations.

## Decision

Technical evidence is added **inside** the existing Nachweisregister/PBP/Bordbuch architecture as a new first-class evidence kind `technical-assessment`, with a policy-driven publication gate that preserves the existing attestation gate unchanged.

- No parallel "test registry", "quality registry" or second trust schema is introduced.
- `PbpEvidenceKind` gains `technical-assessment`; `operational-evidence` remains distinct.
- Technical-assessment-specific metadata lives in one optional nested `assessment` object on `PbpEvidenceSource`; provider/tool-specific fields do not leak into `PbpClaim`.
- Every technical assessment declares exactly one execution provenance: `operator-run` or `provider-run`. This distinction is public metadata.
- A technical assessment is normatively a point-in-time observation, not a certification, endorsement, or guarantee of future values.
- Every publishable technical assessment MUST retain at least one canonical machine-readable `raw-result` artifact, hashed and stored immutably under an observation-specific path. Screenshots are supporting artifacts only.
- A stable `seriesId` identifies the measurement series; each canonical measurement has a unique immutable `observationId`. A new run creates a new observation, not an update.
- The existing attestation publication policy remains unchanged. Technical assessments use a measurement policy in which: source integrity, human approval, N3, legal/content check, canonical raw artifact, assessment metadata, and execution authorization basis are REQUIRED; publication Consent and public PDF derivative are N/A by default.
- The implementation MUST NOT create dummy Consent entities, fake "granted" consent records, meaningless public PDFs, or synthetic provider URLs solely to satisfy legacy gate booleans.
- `nachweis.publish` remains a deliberate publication transition. No adapter may directly publish.
- A generic normalized assessment contract sits between provider adapters and PBP/Bordbuch. Provider-specific parsing does not leak into UI components or the core publication policy.

## Justification

- **One trust system.** Avoids duplicating PBP validation, Bordbuch lifecycle, entitlement, manifest, routes and trust semantics in a parallel registry.
- **Reusable client-site product.** The extension preserves the `nachweis` entitlement and block-declarative page model, so client Sternsysteme can activate the same capability.
- **No semantic abuse of Consent.** Technical measurements do not require customer testimonial consent; fabricating it would corrupt the trust layer.
- **Provider/tool changes isolated.** Adapters feed one generic `nachweis.assessment.ingest` command; provider-specific parsing stays in versioned, fixture-backed parsers.
- **Reproducible history.** Immutable observations under stable series IDs turn the system into a cumulative trust asset rather than a marketing screenshot.
- **Existing N3 provenance remains valuable.** Ed25519 operator signature + RFC 3161 timestamp still authenticates the normalized record and fixes its time.
- **UI can connect site claims to measured evidence** without a badge wall, using a discriminated union within existing Nachweis components.

## Consequences

- **Positive:** Single validation path for attestations and technical evidence. Provider adapters are replaceable. History is immutable. Existing N3 and entitlement infrastructure is reused.
- **Negative:** `PbpEvidenceSource` gains a new optional nested profile. Publication-gate code becomes more complex than six booleans (now policy-driven and tri-state). Provider adapters require fixtures and schema-drift handling. History increases R2/Bordbuch/storage volume.
- **Technical debt:** If the nested `assessment` contract begins accumulating unrelated evidence families, architecture MUST reconsider a dedicated `pbp/nachweis-record@1` or a future PBP namespace as anticipated by ADR-0028. This ADR does not authorize arbitrary field growth.

## Evolution

- Future evidence adapters (axe, security headers, validator services, uptime) MUST first determine whether they are `technical-assessment`, `operational-evidence`, or another evidence kind justified by a new RFC. They MUST reuse the generic capture/history/policy mechanisms where semantically correct.
- If the nested `assessment` contract itself begins accumulating unrelated evidence families, a dedicated `pbp/nachweis-record@1` entity or a future PBP namespace must be introduced through a superseding RFC.
