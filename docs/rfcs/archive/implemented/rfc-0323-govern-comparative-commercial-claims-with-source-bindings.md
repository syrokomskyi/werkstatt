---
id: RFC-0323
title: "Govern comparative commercial claims with source bindings"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0212
  - RFC-0213
  - RFC-0214
  - RFC-0216
  - RFC-0218
amendedBy: []
related:
  - RFC-0045
  - RFC-0136
  - RFC-0203
  - RFC-0287
commands:
  proposed: []
  added:
    - comparative.claim.validate
  changed:
    - content.claim.validate
    - content.freshness.validate
    - source.binding.validate
    - content.plan.status
    - agent.knowledge.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/business"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every public third-party price, vendor comparison, or competitor capability claim carries a source, Stand date, and review cadence."
  - "Review-due comparative commercial claims block deploy when their configured review date has arrived and no verification event was recorded."
  - "Comparative claims are rendered from structured records or claim-bound fields, not anonymous prose."
nonGoals:
  - "Do not automate legal judgment about comparative advertising."
  - "Do not fetch or scrape arbitrary competitor pages during normal app builds."
  - "Do not create per-client text regex validators for named competitors."
acceptance:
  - probe: command-registered
    name: "comparative.claim.validate"
  - probe: run
    command: "site-kernel run comparative.claim.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0323: Govern comparative commercial claims with source bindings

## Context

The public content audit flagged German offer copy comparing the studio's offer to platforms such as MyHammer, Blauarbeit, Wix, and IONOS. The issue is not that comparisons are forbidden. The issue is that public third-party prices and absolute capability statements need dates, sources, and a review process. The owner decision is broader than one page: every client site may eventually carry source-backed claims and review policies, and deployment must not proceed when a source is due for review but has not been checked.

CKL already supplies the building blocks:

- field-level claim sidecars;
- temporal validity and review cadences;
- source descriptors and the Truth Monitor;
- a maintenance plan and red/amber gate model;
- agent rules that forbid fake verification.

This RFC specializes those building blocks for comparative commercial claims.

## Problem

Anonymous comparative prose creates legal, trust, and maintenance risk:

- third-party prices change;
- vendor plans and support packages change;
- absolute statements such as "no ongoing support" are often false for at least one plan;
- prose with no `Stand` date gives readers and agents no way to know whether the comparison is current;
- current CKL review-due signals are usually advisory, but the owner requires deploy blocking when a required source review date has arrived.

The platform needs a generic claim class, not one-off validators for named competitors.

## Decision

Introduce the **comparative commercial claim** class.

A comparative commercial claim is any public claim that names or clearly identifies a third-party vendor, marketplace, platform, competitor category, or external commercial alternative and states at least one of:

- price, fee, discount, or range;
- included or missing service capability;
- ownership, export, lock-in, cancellation, or support terms;
- superiority, risk, or tradeoff relative to the site's offer.

Every such claim must be structured, sourced, dated, and reviewed on a cadence. When its review is due and no verification ledger event exists, deploy is blocked for sites that publish the claim.

## Architectural fit

This RFC amends the CKL family:

- RFC-0212 gains a `claimClass: comparative-commercial` specialization;
- RFC-0213 treats review-due comparative claims as potentially blocking, not only informational;
- RFC-0214 source descriptors become mandatory for comparative claims;
- RFC-0216 routes due comparative reviews into the red gate when policy says blocking;
- RFC-0218 binds agents to verify, not merely restamp, comparative claims.

It does not replace existing claim sidecars. It defines a stricter class and a structured authoring surface for values that are too risky to leave as anonymous prose.

## Design

### Claim shape

Extend the claim schema with:

```ts
export type ClaimClass =
  | "general"
  | "legal"
  | "price"
  | "comparative-commercial";

export interface ComparativeCommercialClaim {
  claimClass: "comparative-commercial";
  comparedEntity: {
    name: string;
    kind: "vendor" | "marketplace" | "platform" | "competitor-category";
    url?: string;
  };
  claimKind:
    | "third-party-price"
    | "capability"
    | "ownership"
    | "export"
    | "support"
    | "risk"
    | "other";
  statement: string;
  value?: {
    amount?: number;
    min?: number;
    max?: number;
    currency?: string;
    unit?: string;
  };
  sourceRef: string;
  asOf: string;
  reviewEvery: string;
  publicDisclosure: {
    label: string;
    showStandDate: true;
    showSourceLabel: boolean;
  };
  criticality: "blocking";
}
```

For price/range claims, `value.currency`, `value.unit`, `sourceRef`, `asOf`, and `reviewEvery` are required. `reviewEvery` must be no longer than `P3M` unless a later RFC introduces a site policy exception.

### Structured comparison records

Preferred authoring surface:

```text
src/content/business/{lang}/comparisons/{id}.md
src/content/business/{lang}/comparisons/{id}.claims.yaml
```

Example:

```yaml
---
id: myhammer-monthly-fee
comparedEntity:
  name: "MyHammer"
  kind: marketplace
claimKind: third-party-price
display:
  de: "MyHammer kostet nach oeffentlicher Preisliste ..."
---
```

The sidecar owns the factual value, source, `asOf`, review cadence, and public disclosure. Prose and offer pages should reference comparison records through the normal content-reference mechanism or through a shared comparison block. Do not duplicate the numeric value in prose.

When a comparison appears inside a prose Markdown body and cannot be represented as a structured field, the sidecar may bind to an anchored excerpt:

```yaml
claims:
  - id: faq-builder-export-risk
    claimClass: comparative-commercial
    subject:
      file: "src/content/prose/de/digitales-fundament.md"
      anchor: "faq-builder-export"
      quoteHash: "sha256:<hash-of-normalized-sentence>"
```

The `quoteHash` prevents silent drift between the claim and the sentence it annotates.

### Public disclosure

Renderers that output comparative price or vendor claims must include a compact disclosure near the claim:

```text
Stand: 07.2026, oeffentliche Preisliste.
```

Rules:

- Month/year is sufficient for public display; sidecars store full `YYYY-MM-DD`.
- The source label must not expose private operator notes.
- If a claim is sourced from a manual review of a public page, the public label says `oeffentliche Preisliste` or the configured source title.
- If the source is not public, the claim must not be used for public comparative advertising.

### Review-due deploy gate

For `claimClass: comparative-commercial`:

- `reviewEvery` is required;
- `content.freshness.validate` emits `review-due` when `asOf + reviewEvery <= today`;
- `content.plan.status` treats review-due comparative claims as red when `criticality: blocking`;
- deploy/build gates that consume the plan must fail while the red task exists.

A verification ledger event clears the red state only when it records one of:

- `verify-noop`: source checked, public value still current;
- `verify-update`: source checked, value changed and content updated;
- `withdraw`: claim removed from public output.

Advancing `asOf` without a verification event is a policy violation.

### Comparative claim validator

`comparative.claim.validate` is app-scoped and read-only.

It checks:

- every comparison record has a valid claim sidecar;
- every `claimClass: comparative-commercial` has `sourceRef`, `asOf`, `reviewEvery`, and `criticality: blocking`;
- every `sourceRef` resolves through `source.binding.validate`;
- public price/range claims render currency and unit;
- public disclosures include a Stand date;
- prose-bound claims still match their `quoteHash`;
- review-due claims have a current verification ledger event;
- generated agent knowledge does not expose comparative facts without freshness and source metadata.

Diagnostics:

- `CMP-01`: comparative claim missing sidecar or required fields;
- `CMP-02`: source reference missing or invalid;
- `CMP-03`: public disclosure missing Stand date;
- `CMP-04`: prose quote hash drift;
- `CMP-05`: review due without verification event;
- `CMP-06`: absolute capability claim too broad for its source scope.

`CMP-05` is an error for blocking comparative claims.

### Content guidance

Agents implementing comparative content must prefer narrow, source-defensible phrasing.

Allowed:

- `Stand: 07.2026, public price list, monthly fees from X to Y for the compared plan class.`
- `The platform plan does not define ownership/export in the way this offer does.`

Avoid unless the source proves the universal statement:

- `keine laufende Betreuung`;
- `no export`;
- `always more expensive`;
- `all competitors`.

For the audited builder/platform FAQ, the recommended direction is to compare ownership and exit terms rather than making an absolute support claim.

## Pipeline placement

- `comparative.claim.validate` runs in `apps-check.author` and `build.check`.
- `content.freshness.validate`, `source.binding.validate`, and `content.plan.status` continue to run in their existing positions, but now understand the comparative claim class.
- `agent.knowledge.validate` fails if comparative facts appear without source/freshness metadata.

## Rollout

1. Add claim schema specialization and comparison record schema.
2. Add `comparative.claim.validate`.
3. Migrate `warpgogol-com` third-party price/comparison statements into comparison records or prose-bound claim sidecars.
4. Add source descriptors for each compared public price/source. Start with manual sources when automated fetching is not yet safe.
5. Update public copy to include Stand disclosures and remove broad unsupported absolutes.
6. Wire review-due blocking into the maintenance plan gate for comparative claims.

## Alternatives considered

- **Treat comparative claims as normal CKL claims.** Rejected. The owner specifically requires a deploy block when review is due.
- **Create site-specific checks for MyHammer, Blauarbeit, Wix, or IONOS.** Rejected. Future client sites will compare different vendors.
- **Forbid all competitor comparisons.** Rejected. Comparisons can be useful when they are narrow, sourced, and current.
- **Run live scraping during build.** Rejected. Builds must not depend on third-party availability; source checks belong to manual review or the Truth Monitor.

## Risks

- **Authoring overhead.** Mitigated by structured comparison records and reusable display blocks.
- **False confidence from outdated sources.** Mitigated by blocking review-due claims.
- **Legal nuance beyond validator ability.** Mitigated by narrow source-scoped phrasing and human review for legal/price facts.
- **Prompt injection from external pages.** Mitigated by RFC-0218 sanitization before any fetched text is passed to an LLM.

## Acceptance criteria

- [x] `claimClass: comparative-commercial` is supported in claim schemas. (evidence: implemented historically)
- [x] Comparison records or prose-bound claim anchors can represent third-party price and vendor (evidence: implemented historically) statements.
- [x] `comparative.claim.validate` is registered and emits `CMP-01` through `CMP-06`. (evidence: implemented historically)
- [x] Review-due blocking comparative claims make `content.plan.status` red until a verification (evidence: implemented historically) ledger event exists or the claim is withdrawn.
- [x] `warpgogol-com` third-party platform price claims have Stand dates, source refs, and review (evidence: implemented historically) cadences.
- [x] Unsupported absolute competitor capability claims are removed or narrowed to sourced (evidence: implemented historically) ownership/export/exit claims.
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not create per-client competitor regexes.
- Do not advance `asOf` to clear review-due state without a verification ledger event.
- Prefer manual source descriptors first when automated fetching would be brittle.
- Sanitize externally fetched text before using LLMs to summarize or compare it.
