---
id: RFC-0281
title: "Drive deep surface existence from Werk-Register evidence joins"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0192
  - RFC-0211
  - RFC-0214
  - RFC-0215
  - RFC-0217
  - RFC-0220
  - RFC-0238
  - RFC-0274
  - RFC-0280
commands:
  proposed:
    []
  added:
    - werk.record.validate
    - surface.evidence.join
  changed:
    - surface.generate
    - surface.evidence.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "The deepest commercial/local pages are born from an evidence join over verifiable Werke (completed works), not from a cartesian product filtered afterward."
  - "Each such page cites at least one anchored, provenanced reference: a real object with location, materials, and outcome."
  - "Pages without qualifying evidence do not exist, bounding combinatorics by facts instead of universes."
  - "The evidence a page rests on is the same anchored provenance the platform already uses for material credits and claim lineage."
nonGoals:
  - "Do not remove the demand taxonomy; it remains a classifier over facts, not the page generator."
  - "Do not fabricate or infer works; only anchored, provenanced records qualify as evidence."
  - "Do not expose private client project data that a client has not cleared for publication."
---

# RFC-0281: Drive deep surface existence from Werk-Register evidence joins

## Context

Fable's §B7/§E.2 identifies the deepest problem and the strongest opportunity together: the PSEO system has **no proprietary data asset**. It generates pages from a demand taxonomy that any studio can reproduce in weeks. Meanwhile the one asset a Handwerk client genuinely owns and no competitor can copy — the record of **completed works** (Werke): real projects with addresses, photos, materials, problems solved, timelines — is used by nothing.

Today deep pages are produced by `enumerateCandidateTuples` (a cartesian product over axis universes, confirmed in `packages/surface/src/eligibility.ts`) and then filtered by record count. That is "cartesian-then-filter": existence is a property of the taxonomy, not of any verifiable fact about the world. The result is exactly the near-duplicate, evidence-free surface that Google's site-wide quality systems suppress.

This RFC inverts the driver: deep surface existence becomes an **evidence join** over the Werk-Register. A page exists because a real, anchored work backs it — turning the SEO surface into a projection of verifiable truth, which is both the brand's core philosophy and a non-copyable moat.

## Problem

- `surface.generate` derives deep pages from cartesian tuples; the record set only _counts_, it does not _substantiate_.
- RFC-0274 can _gate_ on evidence fields but there is no defined **evidence record** and no **join** that makes evidence the source of existence rather than a post-hoc filter.
- The platform already has anchored provenance (RFC-0220 material credits, RFC-0217 claim ledger, RFC-0214 source binding) but nothing connects it to which pages may exist.
- Combinatorics are therefore bounded by universe size, not by facts, so the surface grows into thin territory by construction.

## Decision

The platform gains a **Werk-Register evidence record** and an **evidence-join generation path** for deep, commercial/local depths.

A `WerkRecord` is an anchored, provenanced description of a completed work: what was done, where, with which materials, over what timeline, with which media and outcome. Each record carries publication consent and provenance (reusing RFC-0215/0217/0220 anchoring).

`surface.evidence.join` builds deep-page candidates by **joining Werke to axis tuples**: a `(industry, city, demand)` page at d5 is a candidate only if one or more consenting Werke match that tuple. The demand taxonomy (RFC-0280 signals + demand records) becomes a _classifier over works_, not the generator of pages. `surface.generate` uses this join as the existence source for evidence-driven depths; cartesian enumeration is retained only for shallow hub depths that legitimately aggregate live descendants.

## Architectural fit

- RFC-0192 route-source port is unchanged; the evidence join is a new candidate-production strategy feeding the same eligibility/baking pipeline.
- RFC-0238's five axes remain the page identity; the join binds Werke to those axes by their own location/industry/demand fields.
- RFC-0274 evidence gates now have a concrete evidence source to validate against; `evidencePerDepth.preferredEvidenceSources: [works, references, verifiedClaims]` resolves to real records.
- RFC-0215 derivation stamps, RFC-0217 claim ledger, and RFC-0220 material credits provide the anchoring so each cited reference is provenanced — the same trust spine the platform already ships.
- RFC-0280 demand and RFC-0281 evidence compose the two-key existence rule: searched **and** provable.

## Design

### TypeScript contracts

```ts
export interface WerkRecord {
  id: string;
  title: string;
  axes: { industry: string[]; country?: string; region?: string; city: string; demand?: string[] };
  facts: {
    materials?: string[];
    scope?: string;               // what was done
    problem?: string;             // problem solved
    outcome?: string;
    completedAt?: string;         // ISO
    durationDays?: number;
  };
  media?: Array<{ ref: string; creditRef: string }>;   // RFC-0220 anchored credits
  provenance: { sourceRef: string; anchoredHash: string }; // RFC-0215/0217
  consent: { publishable: boolean; clientApproved: boolean; redactions?: string[] };
}
```

### Evidence join

```txt
for tuple in liveHubDescendants:                 # shallow hubs still aggregate
  # deep depths only:
for werk in consentingWerke:
  for tuple in tuplesMatchedBy(werk.axes):       # bounded by facts, not universes
    candidate(tuple).addEvidence(werk)
emit candidate iff candidate.evidenceCount >= blueprint.minEvidence[depth]
```

Combinatorics are bounded by the count of Werke and the axis values they actually touch — never by `∏|universe|`. A city with no work produces no d5 page for that city; the surface cannot outrun the facts.

### CLI surface

```sh
pnpm exec site-kernel run werk.record.validate --app webgogol-com --json
pnpm exec site-kernel run surface.evidence.join --app webgogol-com --blueprint website-local --json
pnpm exec site-kernel run surface.generate --app webgogol-com --json
```

### File system responsibilities

| Path                                                  | Role                                   |
| ----------------------------------------------------- | -------------------------------------- |
| `apps/<app>/src/content/surface/werke/<lang>/*.md`    | Anchored, consented Werk records       |
| `apps/<app>/src/surface/evidence-join.generated.json` | Generated tuple→evidence candidate map |

### Validation rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `WERK-01` | error | Werk record fails schema or lacks anchored provenance |
| `WERK-02` | error | Werk cited on a public page without `consent.publishable && clientApproved` |
| `WERK-03` | error | Deep evidence-driven depth emitted a page with fewer than `minEvidence` qualifying Werke |
| `WERK-04` | warning | Werk media lacks an RFC-0220 credit reference |
| `WERK-05` | warning | Werk axes do not resolve against known geo/industry universes |

## Failure modes

- Deep tuple with no consenting Werk: no page is emitted (bounded combinatorics), no error — absence of a work is a valid reason for a page not to exist.
- Werk cited without consent: `WERK-02` error; the page cannot be published with that reference.
- Anchoring hash mismatch: `WERK-01` error; the record is not trusted as evidence.
- Client withdraws consent: the record flips `publishable:false`; dependent pages lose that evidence and are re-evaluated against `minEvidence` (may drop below the gate and be retired via RFC-0277 URL policy, not silently deleted).

## Rollout

1. Add `WerkRecord` schema and `werk.record.validate`; seed the studio's own works (dogfood) and one friendly client's consented works.
2. Add `surface.evidence.join` in report-only mode; compare evidence-driven candidates to current cartesian d5 output.
3. Wire `surface.evidence.validate` (RFC-0274) to require join evidence at the deepest depth.
4. Switch d5 existence to the evidence join; keep cartesian only for shallow hubs that aggregate live descendants.
5. Grow the Werk-Register as the durable asset; report managed coverage as "pages backed by real works", not raw route count (RFC-0277).

## Alternatives considered

- **Keep cartesian-then-filter, tighten the substance score.** Rejected: a higher score still measures structure; it cannot manufacture a real local reference.
- **Generate synthetic "case studies" with an LLM.** Rejected: invented works are UWG exposure and destroy the trust thesis; only anchored real works qualify.
- **Use demand alone as the existence key.** Rejected: demand says a page _could_ be read; evidence says a page _deserves_ to exist. The deepest pages need both (RFC-0280 + this RFC).
- **Publish all Werke automatically.** Rejected: consent and redaction are mandatory; client ownership includes control over exposure.

## Risks

- **Sparse Werk data early.** Mitigation: evidence-driven existence _intentionally_ yields fewer, stronger pages; RFC-0277 reframes success as coverage quality, so a smaller true surface is a feature.
- **Consent management overhead.** Mitigation: consent is a record field validated by `WERK-02`; intake tooling can batch it; withdrawal is a first-class, reversible state.
- **Join complexity at fleet scale.** Mitigation: the join is bounded by works, not universes, so it is _smaller_ than the cartesian path it replaces; RFC-0275 sharding still applies.

## Acceptance criteria

- [x] `WerkRecord` schema with anchored provenance and consent fields exists. (evidence: implemented historically)
- [x] `werk.record.validate` and `surface.evidence.join` are registered. (evidence: implemented historically)
- [x] Deep evidence-driven depths derive candidates from the evidence join, not cartesian enumeration. (evidence: implemented historically)
- [x] A public page citing a Werk requires publish + client consent (`WERK-02`). (evidence: implemented historically)
- [x] `surface.evidence.validate` requires `minEvidence` qualifying Werke at the deepest depth. (evidence: implemented historically)
- [x] Page count at evidence-driven depths is bounded by the number of consenting Werke, verified through regenerated `webgogol-com` surface artifacts. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Never invent a Werk or infer one from a demand record; only anchored, consented works are evidence.
- Never cite a client's project without recorded publish consent.
- Prefer a smaller surface of real, provable pages over a larger surface of taxonomic pages; that trade is the point of this RFC.
- Keep the demand taxonomy as a classifier over works, not as a page generator.
