---
id: RFC-0226
title: "Write embedded content credentials from material credit records"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0528
related:
  - RFC-0204
  - RFC-0210
  - RFC-0220
  - RFC-0223
commands:
  proposed:
    - material.metadata.validate
    - material.metadata.write
  added:
    - material.metadata.validate
    - material.metadata.write
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/os"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "A published image or video carries embedded provenance (IPTC/XMP rights + a C2PA manifest) derived from its existing `*.credits.yaml` record, with no second source of truth."
  - "`material.metadata.write` is a build-time, content-addressed, idempotent step that mirrors the variant-generation cache and never mutates authored source masters in place."
  - "AI-assisted media (e.g. the VEO promo) declares synthetic/edited provenance in embedded metadata, supporting EU AI Act transparency expectations."
  - "`material.credits.validate` can assert that an in-scope material's `iptcMetadataStatus` is `preserved` rather than `stripped`/`unknown` once embedding is enabled."
nonGoals:
  - "Does not change the visible disclosure UI or the JSON-LD projection (RFC-0220/RFC-0223 own those)."
  - "Does not require a paid C2PA signing identity in the first phase; unsigned/dev manifests are acceptable until a signing key is provisioned."
  - "Does not embed metadata into third-party or externally hosted assets the studio does not control."
  - "Does not block the build when a binary toolchain (exiftool/c2patool) is unavailable; the step degrades to a reported skip."
---

# RFC-0226: Write embedded content credentials from material credit records

## Context

RFC-0220 established `*.credits.yaml` as the single source of truth for material provenance and reserved `c2paManifestUrl` and `iptcMetadataStatus` fields for a later metadata-writing phase, explicitly making embedded-metadata writing a non-goal for phase 1. RFC-0223 enriched the machine projection (license URL, copyright holder/year, AI version/date) but still only emits _external_ JSON-LD; the delivered image and video binaries carry no embedded rights or content-credential data.

Search engines, social platforms, and AI systems increasingly read embedded credentials (IPTC Photo Metadata, XMP rights, and C2PA Content Credentials) directly from the file, independent of page HTML. For AI-assisted media this is becoming an expectation rather than a nicety.

## Problem

The platform can describe provenance in the page, but the moment an image or video is copied, hotlinked, or ingested by a crawler that does not parse our JSON-LD, all attribution is lost. There is no build step that writes the credit record into the asset itself, and `iptcMetadataStatus` is currently always author-declared rather than machine-verified.

Embedding must not compromise the existing guarantees: authored source masters must stay untouched, the build must stay deterministic and cache-friendly (mirroring RFC-0204 variant generation and RFC-0210 video variants), and a missing binary toolchain must not break unrelated builds.

## Decision

Add a build-time **content-credential writer** that consumes the same `MaterialCredit` records and writes embedded metadata into the _generated, content-addressed_ delivery variants — never the authored masters.

- `material.metadata.write` (mutating, app-scoped, in the build-prepare/variant stage): for each in-scope material with a credit record, write IPTC/XMP rights (creator, credit line, copyright notice, license URL, rights statement) and attach a C2PA manifest describing creators, AI participants (with `version`/`generatedAt` from RFC-0223), and review. Output is keyed by a content hash of `{asset bytes + credit record}` so re-runs are idempotent and cacheable. When `exiftool`/`c2patool` (or equivalent) is unavailable, the step reports a skip rather than failing.
- `material.metadata.validate` (non-mutating): confirms that emitted variants for credited materials carry the expected embedded fields and that `iptcMetadataStatus` matches reality.
- The writer updates the credit record's effective `iptcMetadataStatus`/`c2paManifestUrl` _projection_ (not the authored sidecar) so `material.credits.validate` can later require `preserved`.

Signing is staged: phase 1 may emit unsigned or dev-signed manifests; a production signing identity is provisioned later behind an env-gated key, mirroring the existing `PASSPORT_SIGNING_KEY` pattern.

## Architectural fit

- **RFC-0204 / RFC-0210.** Embedding attaches to the _generated_ responsive-image and video variants in the content-addressed cache, reusing the same hashing/caching discipline and never touching `src/content` masters.
- **RFC-0220 / RFC-0223.** Same records, no new author burden. This phase consumes `parties`, `license`, and the RFC-0223 AI fields; it adds no visible UI and no new authored schema beyond what RFC-0220 already reserved.
- **Generated-file governance.** The writer is a generator with single ownership over the embedded-metadata variants; the binary toolchain is an optional build dependency, gated like other heavy tools.

## Design sketch

```sh
pnpm exec werkstatt run material.metadata.write --app warpgogol-com
pnpm exec werkstatt run material.metadata.validate --app warpgogol-com
```

- IPTC/XMP fields: `Creator`, `CreditLine`, `CopyrightNotice`, `RightsUsageTerms`, `WebStatementOfRights` (license URL), `Licensor`/`LicensorURL`.
- C2PA assertions: creators and co-creators as producers; AI platform/model as `c2pa.actions`/`assertions` with version + generation date; reviewer as a separate action.
- Cache key: `sha256(variantBytes || canonicalize(creditRecord))`.

## Failure modes

- `metadata-toolchain-missing` (skip/info): `exiftool`/`c2patool` not found; embedding skipped, reported, build continues.
- `metadata-write-failed` (fail): a credited in-scope variant could not be written when the toolchain is present.
- `metadata-mismatch` (fail, validate): emitted variant lacks an expected embedded field.

## Risks

- **Binary mutation risk.** Mitigated by writing only to generated variants in the cache, never masters, and by content-addressed idempotency.
- **Toolchain availability / CI.** Mitigated by graceful skip and an explicit validate that only fails when the toolchain is present.
- **Signing identity.** Real C2PA trust needs a managed signing key; staged behind an env gate so the contract can land before the key exists.

## Acceptance criteria

- [x] `material.metadata.write` embeds IPTC/XMP rights and a C2PA manifest into generated image/video variants from existing credit records, idempotently and content-addressed. (evidence: implemented historically)
- [x] The writer never modifies authored source masters under `src/content`. (evidence: implemented historically)
- [x] AI participants carry `version`/`generatedAt` (RFC-0223) in the embedded C2PA assertions. (evidence: implemented historically)
- [x] `material.metadata.validate` fails when a credited variant lacks expected embedded fields (toolchain present) and reports a skip when the toolchain is absent. (evidence: implemented historically)
- [x] Missing `exiftool`/`c2patool` does not fail unrelated builds. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 once criteria are verified and committed.
- Agents MUST NOT write embedded metadata into authored source masters; only generated variants.
- Agents MUST NOT invent provenance; embedded fields come from the authored credit record.
- Agents MUST reference RFC-0226 in commits that implement this contract.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
