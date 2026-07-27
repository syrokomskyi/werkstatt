---
id: RFC-0211
title: "Content Knowledge Lifecycle: claims as the atomic unit of durable site truth"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-20
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0045
  - RFC-0073
  - RFC-0136
  - RFC-0148
  - RFC-0196
  - RFC-0197
  - RFC-0203
  - RFC-0207
  - RFC-0212
  - RFC-0213
  - RFC-0214
  - RFC-0215
  - RFC-0216
  - RFC-0217
  - RFC-0218
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - business
  - share
  - os
successSignals:
  - "Every load-bearing fact on a client site is a claim with provenance and a temporal validity window, not an anonymous string in markdown."
  - "An agent can answer, for any published fact, three questions from artifacts alone: where did it come from, when was it last verified, and when must it be re-checked."
  - "Stale and source-diverged facts surface as dated maintenance tasks before they reach a build, not as silent drift discovered years later."
  - "The two existing provenance islands (surface Freshness Ledger RFC-0196, frozen enriched content RFC-0197/0207) are special cases of one general claim model."
nonGoals:
  - "Does not introduce a graph database, triple store, or any runtime service beyond the existing shared-worker pattern."
  - "Does not change how pages render or how content references (RFC-0045) resolve."
  - "Does not define the concrete schema fields, validators, monitor, planner, or ledger — those are RFC-0212 through RFC-0218."
  - "Does not make any new check block a build on first introduction."
---

# RFC-0211: Content Knowledge Lifecycle: claims as the atomic unit of durable site truth

## Context

The platform already treats a site as typed data, not pages: canonical records under `business/{lang}/*.md` on closed Zod schemas (`packages/business/src/schemas/*.ts`), single-source references `{collection.file.field}` resolved at render and validated by `content.references.validate` (RFC-0045/0073/0138), cross-language coverage and mirroring checks, JSON-LD/llms emission, and a mature APPS*CHECK gate of ~100 validators. Structurally, the integrity-of-dependencies problem is largely solved \_within* a site and _at a moment in time_.

Two capabilities the platform needs for decade-scale maintenance already exist — but only as isolated islands:

- The **surface Freshness Ledger** (RFC-0196) decays generated pSEO pages to `noindex` over time, but only for generated routes, never for authored facts.
- **Enriched content** (RFC-0197/0207) is generate-once, frozen, provenanced, and gated behind a human `surface.enrich.review` approval — exactly the "syntax firewall + human-in-the-loop" pattern — but only inside the pSEO module.

Meanwhile, the highest-value authored facts on a site — a city's population, a price, the status of a government support programme, a founding year, a legal effective date — are bare strings. There is no record that "350,000 residents" was true _as of 2026_ and must be re-verified, no link to _where_ it came from, and no clock that fires _before_ a build to flag that it has expired.

## Problem

A site built and maintained by AI agents over decades will drift unless three properties are made first-class, machine-checkable, and uniform across all authored content — not just pSEO:

1. **Provenance** — every load-bearing fact must declare where it came from (external source, internal derivation, or human assertion), so its truth can be re-verified rather than trusted forever.
2. **Temporal validity** — every fact that can go stale must carry a validity window and/or a review cadence, so "it expired" is an explicit, dated event rather than a discovery.
3. **Derivation integrity over time** — every copied or translated fact must remember which source it was derived from and the hash of that source at derivation time, so a source change marks the copy `outdated` instead of silently leaving a stale translation that passes coverage checks.

Today none of these exist for authored business records. The platform is a _reaction_ system (build gates) with no _temporal_ half. There is no single model that the Freshness Ledger, enriched provenance, and authored facts are all instances of, so each is reinvented per module.

## Decision

Establish the **Content Knowledge Lifecycle (CKL)**: a workspace-wide model in which the atomic unit of durable site truth is a **claim**, not a page or a string. A claim is an addressable fact with provenance, an optional temporal validity window, and an optional derivation link. CKL is realized as **version-controlled content plus closed schemas plus kernel commands plus the RFC-0203 Diagnostic model** — never a graph database — consistent with the rest of the platform.

This RFC is the umbrella. It fixes the model, the vocabulary, the command namespace, and the rollout posture. It delegates the concrete mechanisms to seven component RFCs:

- **RFC-0212** — field-level provenance and temporal-validity annotations on canonical records.
- **RFC-0213** — `content.freshness.validate` and the authored-content Freshness Ledger (generalizes RFC-0196).
- **RFC-0214** — external source binding and the shared Truth Monitor worker.
- **RFC-0215** — derived-content staleness (`derivedFrom` + `sourceHash`); generalizes RFC-0197/0207.
- **RFC-0216** — proactive maintenance planning: the review calendar and task router.
- **RFC-0217** — the Claim Ledger: append-only fact lineage and temporal knowledge-graph projection.
- **RFC-0218** — the agent operating model: how agents author, source, and maintain claims.

### The claim model (normative)

A **claim** is the binding of a _value_ to a _subject field_, qualified by provenance and time:

```
claim := (subject, value, provenance, validity?, derivation?)
  subject    — a content address: collection/file/fieldPath (RFC-0045 coordinates)
  value      — the asserted value (string, number, money, date, enum, …)
  provenance — how this value is known: external | derived | asserted | generated
  validity   — { asOf, validUntil?, reviewEvery? }  (RFC-0212)
  derivation — { derivedFrom, sourceHash }           (RFC-0215, when provenance = derived)
```

Every existing primitive is an instance:

| Existing primitive | As a claim |
| --- | --- |
| A bare business field (e.g. `company.foundingYear`) | `provenance: asserted`, no validity yet |
| A NEED_THIS marker (RFC-0136) | A claim with no sourced value — never substituted as live fact |
| A surface page below freshness threshold (RFC-0196) | A `generated` claim past its `validUntil` |
| A frozen enriched entry (RFC-0197/0207) | A `generated` claim with provenance + `approved` gate |
| A translated paragraph | A `derived` claim with `derivedFrom` + `sourceHash` (RFC-0215) |

## Architectural fit

- **Site OS operator model.** CKL adds one validator family, one shared worker, one planner, and one ledger projection — all behind `site-kernel run` commands, app- or workspace-scoped like everything else. No new runtime surface on the rendered site.
- **RFC-0203 Diagnostics.** Every CKL check emits canonical `Diagnostic` objects (severity `error|warning|info`, rule-id registry, `file:line:col` + `fix:` renderer). Freshness, source divergence, and derivation staleness become Diagnostics, so the agent-legible output and the amber/red gate policy already exist.
- **Content-as-data.** Claims live next to the records they annotate (sidecar or structured block, RFC-0212), version-controlled, diffable, and resolvable by the existing RFC-0045 resolver. The "knowledge graph" is a _projection_ over files (RFC-0217), not a separate store.
- **Shared-worker discipline (RFC-0186).** The Truth Monitor (RFC-0214) reuses the Lagebild pattern: one platform worker, a tenant/source registry, an outbox — never a per-site worker.
- **Provenance unification.** The Freshness Ledger and enriched-content approval are re-expressed as the generated-claim and derived-claim special cases of the one model, removing per-module reinvention.

## Design

### CLI surface

CKL introduces these command groups (defined in detail by the component RFCs):

```sh
# RFC-0212 — claims & provenance
pnpm exec site-kernel run content.claim.validate --app <name>      # provenance/temporal annotation shape
pnpm exec site-kernel run content.claim.report   --app <name>      # inventory of claims + coverage

# RFC-0213 — freshness
pnpm exec site-kernel run content.freshness.validate --app <name>  # expired / over-due-for-review facts
pnpm exec site-kernel run content.freshness.report   --app <name>  # ledger view, never fails

# RFC-0214 — external source binding + monitor
pnpm exec site-kernel run content.source.validate --app <name>     # source descriptors resolve & shape-check
pnpm exec site-kernel run source.monitor.run                       # shared worker: re-fetch, diff, enqueue

# RFC-0215 — derived staleness
pnpm exec site-kernel run content.derived.validate --app <name>    # derivedFrom + sourceHash currency
pnpm exec site-kernel run content.derived.stamp    --app <name>    # re-stamp sourceHash after review

# RFC-0216 — planning
pnpm exec site-kernel run content.plan.build  --app <name>         # emit dated review/maintenance tasks
pnpm exec site-kernel run content.plan.status --app <name>         # what is due, overdue, blocking

# RFC-0217 — ledger / temporal KG
pnpm exec site-kernel run content.claim.ledger.append --app <name> # append fact-change events
pnpm exec site-kernel run content.claim.ledger.query  --app <name> # "what was claimed about X on date D"
```

### TypeScript contracts

The shared kernel-level contract that the component RFCs specialize:

```ts
export type ClaimProvenanceKind = "external" | "derived" | "asserted" | "generated";

export interface ClaimSubject {
  collection: string;     // RFC-0045 collection
  file: string;           // record stem (locale-independent, RFC-0044)
  fieldPath: string[];    // dotted path into the record
  lang?: string;          // present for language-scoped claims
}

export interface ClaimValidity {
  asOf: string;           // ISO date the value was last verified/asserted
  validUntil?: string;    // ISO date after which the claim is stale
  reviewEvery?: string;   // ISO 8601 duration, e.g. "P3M" — recurring review cadence
}

export interface Claim {
  subject: ClaimSubject;
  provenance: ClaimProvenanceKind;
  validity?: ClaimValidity;
  sourceRef?: string;     // → source descriptor id (RFC-0214) when provenance = external
  derivedFrom?: ClaimSubject;  // RFC-0215 when provenance = derived
  sourceHash?: string;    // RFC-0215 hash of the source value at derivation time
  owner?: string;         // responsible agent/human handle (routing, RFC-0216)
  confidence?: "high" | "medium" | "low";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/specs/content-knowledge-lifecycle/` | Operator + integrator spec for CKL (this umbrella's narrative home) |
| `packages/business/src/schemas/` | Records gain provenance/validity annotation surface (RFC-0212) |
| `packages/share/src/knowledge/` | Shared claim model, projection helpers (RFC-0217) |
| `docs/COMMANDS.md` | CKL command group documented alongside existing groups |

### Output format

All CKL validators conform to the RFC-0203 Diagnostic envelope:

```json
{
  "command": "content.freshness.validate",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "CKL-FRESH-01",
      "severity": "warning",
      "file": "src/content/business/de/location.md",
      "line": 14,
      "message": "Claim location.residents validUntil 2026-12-31 is within 30 days of expiry",
      "fix": "Re-verify against sourceRef gov:destatis-backnang and run content.derived.stamp"
    }
  ]
}
```

### Failure modes

CKL is additive and warn-first. On first introduction every check is `info`/`warning` only; none blocks a build. Promotion to `error` (build-blocking) is per-rule, per-criticality, and staged by the component RFCs — reusing the RFC-0203 severity model and the amber/red gate policy (RFC-0216). A claim with no sourced value stays a NEED_THIS marker (RFC-0136) and is never substituted as a live fact.

## Rollout

1. **Model + spec (this RFC).** Vocabulary, command namespace, Diagnostic conformance, warn-first posture.
2. **RFC-0212** lands the annotation surface with `info`-only validation — zero risk, immediate visibility into which facts lack provenance.
3. **RFC-0213/0215** add freshness and derivation Diagnostics at `warning`.
4. **RFC-0214** adds the monitor (off by default; opt-in per source, mirroring Lagebild tenant enable).
5. **RFC-0216** turns the accumulated signals into dated tasks; only here do critical rules graduate to build-blocking `error`.
6. **RFC-0217/0218** add the ledger projection and the agent discipline that keeps claims honest over time.

New apps comply from onboarding day one (RFC-0218). Existing apps adopt incrementally: an unannotated field is simply an `asserted` claim with no validity — valid, just not yet under temporal management.

## Alternatives considered

- **Graph database (Neo4j) / temporal KG engine (Graphiti/Zep).** Rejected: it contradicts the content-as-data, version-controlled, AI-agent-buildable philosophy, adds a runtime dependency, and duplicates state that git + closed schemas already hold. The knowledge graph is a projection, not a store.
- **A separate external "content control" service with its own dashboard/Jira/VS Code plugin.** Rejected as the _primary_ mechanism: it re-creates a second source of truth beside the repo. Dashboards may consume CKL artifacts later, but the artifacts live in the repo.
- **Per-module freshness (keep Freshness Ledger and enriched provenance separate).** Rejected: it guarantees drift between modules and triples maintenance. One claim model, specialized per provenance kind.
- **Build-time only, no proactive clock.** Rejected: it is the status quo. Facts expire silently between builds; the whole point is to plan _before_ the build (RFC-0216).

## Risks

- **Annotation overhead.** Mitigated by making provenance/validity optional and agent-generated at authoring time (RFC-0218); unannotated content stays valid.
- **False sense of truth.** A `validUntil` in the future does not prove a fact is _correct_, only that it is _not yet due for re-check_. The Truth Monitor (RFC-0214) and human approval gates address correctness; the model must not be read as a correctness oracle.
- **Scope creep.** This umbrella explicitly defers all mechanism to component RFCs; agents must not implement claim storage, monitor, planner, or ledger from this RFC alone.
- **Agent misinterpretation.** Agents could over-annotate trivial copy. The spec (RFC-0218) defines load-bearing-fact criteria so claims concentrate on facts that can actually go stale.

## Acceptance criteria

- [x] The claim model (`Claim`, `ClaimSubject`, `ClaimValidity`, `ClaimProvenanceKind`) is defined in `packages/share/src/knowledge/`. (evidence: packages/ directory, package exists)
- [x] `docs/specs/content-knowledge-lifecycle/` describes the model, vocabulary, and command map. (evidence: docs/ directory, documentation exists)
- [x] All CKL component RFCs (0212–0218) reference this RFC and conform to the claim model and the RFC-0203 Diagnostic envelope. _(referenced; conformance verified as each component lands)_ (evidence: implemented historically)
- [x] The Freshness Ledger (RFC-0196) and enriched provenance (RFC-0197/0207) are documented as the generated-claim and derived/generated special cases. (evidence: implemented historically)
- [x] `docs/COMMANDS.md` gains a CKL section listing the proposed command groups. (evidence: docs/ directory, documentation exists)
- [x] `AGENTS.md` references CKL authoring discipline (delegated to RFC-0218). (evidence: AGENTS.md:1, agent guide updated)
- [x] No CKL check blocks a build on first introduction (warn-first posture recorded). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted`, and even then only the model/spec scaffolding — concrete mechanisms require the corresponding component RFC to be `accepted`.
- Agents MUST NOT introduce a graph database, triple store, or external runtime service under the name of this RFC.
- Agents MUST treat a claim with no sourced value as a NEED_THIS marker (RFC-0136), never substituting a guessed value as a live fact.
- Agents MUST NOT change status fields in any RFC.
- When implementing any CKL component, agents MUST reference both the component RFC and RFC-0211 in commit messages.
