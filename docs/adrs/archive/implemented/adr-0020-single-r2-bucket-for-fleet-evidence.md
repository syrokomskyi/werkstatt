---
id: ADR-0020
title: "Use a single R2 bucket for fleet-wide evidence archiving"
status: implemented
scope: workspace
decider: architecture
createdAt: 2026-08-03
updatedAt: 2026-08-03
implementedAt: 2026-08-03
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0651
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0020: Use a single R2 bucket for fleet-wide evidence archiving

## Context

RFC-0651 introduced evidence sync to Cloudflare R2 for Axiom evidence archives. The fleet currently has a single-digit number of Sternsystemen, each producing ~10-50 MB of evidence per mission (JSON + screenshots). The R2 bucket `axiom-evidence` was created in EU Central.

The key structure in `evidence-sync.ts` is `{systemId}/{missionId}/{runTimestamp}/{evidence-file}`, which partitions evidence by system within the bucket.

## Decision

Use a single R2 bucket (`axiom-evidence`) for the entire fleet's evidence archives, with key-prefix partitioning by `systemId`.

- All Sternsystemen share the same bucket and R2 API credentials.
- Evidence isolation is achieved via key prefix, not separate buckets.
- Per-system access control is not implemented — the operator manages all systems.

## Justification

- **Key-prefix partitioning provides logical isolation.** `listObjectsV2({ Prefix: "<systemId>/" })` returns only that system's evidence. No cross-system leakage.
- **R2/S3 has no per-prefix quota or performance penalty.** A single bucket with millions of prefixed keys performs identically to multiple buckets.
- **Simpler credentials management.** One R2 API token, one set of credentials in `.env`, one bucket lifecycle policy. Multi-bucket means per-system credentials or a token with cross-bucket access.
- **Lower operational overhead.** No per-site bucket creation, no per-site lifecycle rules, no per-site cost monitoring.
- **R2 free tier covers it.** R2 has no egress fees and 10 GB/month free storage. Evidence for 100 missions/year at ~50 MB each = ~5 GB/year.
- **Evidence is not secret.** Evidence files are public-facing page captures (HTML, screenshots, axe results). No PII. Compromised credentials expose public-facing content, not secrets.
- **Alternatives considered:** per-system buckets (rejected — operational overhead without benefit at current scale), per-environment buckets (rejected — dev/alt/main evidence is separated by key prefix, not bucket).

## Consequences

- **Positive:** Single credential set, single lifecycle policy, zero per-system bucket management, within R2 free tier.
- **Negative:** No per-system access control. A compromised R2 token exposes all systems' evidence. Mitigated by least-privilege token scoping (Object Read & Write on `axiom-evidence` only) and the non-secret nature of evidence content.
- **Negative:** Cost allocation is per-bucket, not per-system. Irrelevant for a single-operator fleet.
- **Technical debt:** None. If multi-tenant access or regulatory isolation is needed, per-system buckets can be introduced without changing the key structure (just change the bucket name in R2 client config).

## Evolution

Revisit this decision if any of the following thresholds are crossed:

- **Multi-tenant access** — external clients get direct R2 access to their evidence (switch to per-system buckets with per-tenant credentials).
- **Regulatory isolation** — a specific system's evidence must be stored in a separate jurisdiction.
- **Volume** — a single system produces >100 GB/month of evidence (per-system buckets simplify cost allocation and lifecycle).
- **Fleet size** — >50 active Sternsystemen (per-system buckets may reduce blast radius and simplify per-system lifecycle rules).
