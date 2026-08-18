# Baseline and gap analysis

## 1. Current normative baseline

The supplied implementation already establishes a coherent Nachweisregister:

- ADR-0028 makes it an extension of **PBP + Bordbuch**, not a parallel evidence system.
- RFC-0706 extends `PbpEvidenceSource`, creates `PbpConsent`, adds Nachweis Bordbuch kinds/writer role and the `nachweis` entitlement.
- RFC-0707 adds the Nachweis kernel lifecycle, R2 storage, manifest generation, validation, publish and withdrawal.
- RFC-0713 isolates R2 credentials for the Nachweis bucket.
- RFC-0714 adds approval and public-derivative commands.
- RFC-0715 implements N3 with Ed25519 operator signature + RFC 3161 timestamp.
- RFC-0708 adds reusable UI components and Warpgogol routes.
- RFC-0716 adds contextual projections to selected Warpgogol pages.
- RFC-0717 confirms Nachweis pages are **block-declarative**, not programmatic-surface blueprints.

This package extends that baseline. It does not reinterpret it away.

## 2. Current model is attestation/document-centric

Current evidence kinds include:

- `client-statement`
- `project-confirmation`
- `certificate`
- `operational-evidence`

The current lifecycle assumes PDF/file-oriented evidence and a single publication gate:

```text
consentGranted
sourceIntegrityVerified
recordApproved
verificationLevelMet
publicDerivativeReady
legalContentCheckPassed
```

That is correct for customer letters/project confirmations, but it does not model a machine-run technical observation accurately.

### Concrete mismatch

A Lighthouse result for `https://warpgogol.com/`:

- does not need a customer publication Consent;
- may have canonical JSON rather than a PDF;
- does not require a "public derivative PDF";
- needs tool/version/environment/run metadata;
- needs a distinction between a Warpgogol-run external tool and a provider-run test;
- needs immutable observation history instead of overwriting a single "current score".

A Cloudflare Agent Readiness result has the same mismatch and additionally comes from a provider-run remote scanner.

Creating fake `Consent` records or fake public PDFs merely to satisfy the current gate would corrupt the semantics of the trust layer. The gate therefore must become policy-driven while preserving the old policy unchanged for attestation records.

## 3. Current UI is human-attestation-centric

The current `NachweisCardProps` centers on:

- `claim`;
- statement language;
- limitations;
- quote;
- organization/person;
- source hash;
- verification level.

This is appropriate for project/client evidence. A technical assessment needs a separate presentation variant with:

- provider/tool;
- execution mode;
- tested subject URL;
- observed time;
- methodology;
- run count/aggregation;
- dimensions/scores/statuses;
- explicit measurement limitations;
- source/raw artifact hashes;
- Sichtpass/N3 data.

The right solution is a discriminated UI variant within the existing Nachweis components, not a parallel page system.

## 4. Static contextual projection is no longer sufficient

RFC-0716 deliberately used static trust-strip/transparency text because no records were published at pilot time.

Once technical evidence exists, the homepage should show actual published evidence data rather than only saying that a register exists.

The original product/content proposal places the evidence block after the demonstrated result and before the collaboration/process section. That is the stronger decision point:

```text
offer
→ what the result looks like
→ evidence
→ how collaboration starts
```

The old generic contextual links on Services/Pricing/Team/Notausgang may remain.

## 5. Technical evidence must distinguish provenance

Use these exact semantics:

### `operator-run`

The site owner/operator invokes a third-party tool, for example Lighthouse.

Allowed public wording:

- `Messung mit Google Lighthouse`
- `durch Warpgogol/Werkstatt ausgeführt`

Forbidden wording:

- `unabhängig geprüft`
- `von Google zertifiziert`
- `Google bestätigt unsere Qualität`

### `provider-run`

An external provider itself performs the remote scan, for example Cloudflare URL Scanner / Agent Readiness.

Allowed public wording:

- `Test durch Cloudflare`
- `Cloudflare Agent Readiness`

Still forbidden unless independently true:

- `Zertifizierung`
- `Audit`
- `Empfehlung durch Cloudflare`
- `Cloudflare garantiert ...`

## 6. Supplied screenshots are bootstrap artifacts, not canonical evidence

The supplied Lighthouse screenshot visibly shows:

- Performance: 91
- Accessibility: 100
- Best Practices: 96
- SEO: 100
- Agentic Browsing: 3/3

The supplied Cloudflare screenshot visibly shows:

- overall score: 100
- Level 5 / Agent-Native
- Discoverability: 100 (4/4)
- Content: 100 (1/1)
- Bot Access Control: 100 (2/2)
- API/Auth/MCP & Skill Discovery: 100 (7/7)
- Commerce: not checked

These are useful to prove that the desired public visual result is achievable, but screenshots alone do not provide the canonical run metadata needed by the new evidence contract.

**Normative rule:** after implementation, rerun both tests through the canonical adapters. Publish the newly captured values even if they differ from the screenshots.

## 7. Lighthouse-specific measurement gap

Lighthouse performance values can vary with underlying conditions. A single manually selected run encourages accidental cherry-picking.

The canonical Warpgogol methodology therefore uses:

- exact workspace-pinned Lighthouse version;
- exact production target;
- five sequential runs;
- all raw LHR JSON files retained;
- no run discarded for being "bad";
- run fails as a canonical batch if a run has a Lighthouse runtime error;
- median for numeric 0–100 categories;
- full samples + min/max retained;
- pass-count style categories retained as provider-native status/counts, not converted to a fake 0–100 score.

The Agentic Browsing category is currently experimental/informational; the model must carry that fact rather than treating `3/3` as a conventional score.

## 8. Cloudflare-specific provider gap

The public `isitagentready.com` UI should not be scraped.

Cloudflare exposes the same Agent Readiness checks through URL Scanner and supports programmatic scans. The adapter should use the API, request Agent Readiness explicitly and capture the raw provider result.

Provider schemas can evolve. The integration MUST:

- preserve the raw provider JSON;
- use versioned parser fixtures;
- preserve unknown dimensions;
- never assume the number of score categories is fixed;
- treat `not checked` as not checked, not as zero.

## 9. Timestamp terminology gap

The implementation currently sometimes equates `RFC 3161` with a **qualified electronic timestamp**. These are not synonyms.

N3 cryptographic mechanics remain valid as:

```text
Ed25519 operator signature + verified RFC 3161 timestamp token
```

Public copy MUST say `RFC 3161-Zeitstempel` unless the chosen timestamp service is actually verified as an eIDAS-qualified trust service for qualified electronic timestamps.

This is a terminology/assurance correction, not a reason to dismantle N3.

## 10. Target architecture after this extension

```text
PBP Claim
   |
   +--> PBP EvidenceSource
          kind:
            attestation/document kinds
            operational-evidence
            technical-assessment  <NEW>
          assessment?: TechnicalAssessmentV1 <NEW>
          items:
            raw-result/report/screenshot/methodology
                 |
                 v
             R2 immutable artifacts
                 |
                 v
              SHA-256
                 |
                 v
Bordbuch lifecycle + Ed25519 + RFC 3161
                 |
                 v
policy-driven publication gate
                 |
                 v
manifest/status/detail/verify
                 |
        +--------+---------+
        |                  |
 attestation UI      technical UI
        |                  |
        +--------+---------+
                 |
          contextual projections
```

## 11. Things explicitly not in this mission

- no general benchmark platform;
- no competitive scoring of arbitrary third-party websites;
- no auto-publication without human approval;
- no automatic suppression of poor scores;
- no provider-logo licensing project;
- no replacement of Lighthouse with field Core Web Vitals;
- no uptime monitoring implementation;
- no client-side cryptographic verifier;
- no key-rotation redesign;
- no multi-tenant R2 credential redesign beyond the existing architecture;
- no rewrite of PBP into a new namespace unless implementation proves the existing extension impossible.
