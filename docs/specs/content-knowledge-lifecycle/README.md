# Content Knowledge Lifecycle (CKL) — operator & integrator spec

> Normative source: RFC-0211 (umbrella) and component RFCs RFC-0212…RFC-0218. This spec is the human-readable map; the RFCs are the contract.

## Why CKL exists

The platform already treats a site as typed, validated data with single-source references and ~100 build-time validators — so a site is structurally sound **at a moment in time**. CKL adds the two dimensions that keep it true **over decades**:

- **time** — every fact that can go stale carries a validity window and/or review cadence;
- **external truth** — every fact bound to the outside world carries a re-checkable source.

CKL is a **planning** system, not a reaction system: it turns expiry and divergence into dated, owner-routed maintenance tasks _before_ a build, instead of surfacing silent drift years later.

## The atomic unit: a claim

A **claim** is the binding of a value to a subject field, qualified by provenance and time (`packages/share/src/knowledge/claim.ts`):

```
claim := (subject, value, provenance, validity?, derivation?)
```

| Part | Meaning |
| --- | --- |
| `subject` | a content address `<collection>/[<lang>/]<file>#<fieldPath>` (RFC-0045 coordinates) |
| `value` | the asserted value — stays in the record body; a claim **annotates**, never wraps it |
| `provenance` | `external` \| `derived` \| `asserted` \| `generated` |
| `validity` | `{ asOf, validUntil?, reviewEvery? }` (RFC-0212/0213) |
| `derivation` | `{ derivedFrom, sourceHash }` for `derived` claims (RFC-0215) |

The canonical subject string is the same syntax used by every CLI `--subject` flag and by `derivedFrom`, e.g. `business/de/location#residents`, `business/uk/offer#price.monthly`.

## Vocabulary

- **claim sidecar** — `<record>.claims.yaml`, the per-record home for provenance/validity (RFC-0212).
- **Freshness Ledger** — per-app snapshot of every claim's freshness state (RFC-0213); generalizes the surface ledger (RFC-0196).
- **source descriptor** — a named external authority + fetch strategy (RFC-0214).
- **Truth Monitor** — the one shared platform worker that re-checks sources on a cadence (RFC-0214).
- **derivation stamp** — `derivedFrom` + `sourceHash` on a translation/copy (RFC-0215).
- **maintenance plan** — consolidated, dated, owner-routed tasks + the amber/red gate (RFC-0216).
- **claim ledger** — append-only `claims.ndjson` fact-change log + temporal-KG projection (RFC-0217).

## Command map

| Group | Commands | RFC |
| --- | --- | --- |
| Claims & provenance | `content.claim.validate`, `content.claim.report` | RFC-0212 |
| Freshness | `content.freshness.validate`, `content.freshness.report` | RFC-0213 |
| External source | `source.binding.validate`, `source.monitor.*` | RFC-0214 |
| Derived staleness | `content.derived.validate`, `content.derived.stamp` | RFC-0215 |
| Planning | `content.plan.build`, `content.plan.status`, `content.plan.route` | RFC-0216 |
| Ledger / temporal KG | `content.claim.ledger.append`, `content.claim.ledger.query`, `content.claim.ledger.project` | RFC-0217 |

Every CKL check emits the canonical RFC-0203 `Diagnostic` (severity `error|warning|info`, registered `ruleId`, `file:line`, `fixHint`). Rule ids are namespaced `CKL-*`.

## Policy configuration — `knowledge.*` in `system.md`

All per-app CKL policy lives under one typed `knowledge:` block in `src/content/system.md` frontmatter (validated by the ontology `systemManifestSchema`). Every key is optional; absent keys take the defaults.

```yaml
knowledge:
  freshness:                       # RFC-0213
    soonWindowDays: 30             # how many days before validUntil counts as "expiring-soon"
    critical:                      # glob → criticality; promotes a freshness signal above advisory
      - { match: "business/*/compliance#*", criticality: blocking }
  derivation:                      # RFC-0215
    critical:
      - { match: "business/*/legal#*", criticality: blocking }
  plan:                            # RFC-0216 maintenance-plan policy
    leadTimeDays: 30               # raise a task this many days before validUntil
    defaultOwner: agent:content-maintainer
    criticalityMap:                # glob → criticality, overrides a trigger's default
      - { match: "business/*/offer#price.*", criticality: important }
```

**The gate verdict** (consumed by the build, RFC-0216): a task is **red** (blocks the build) iff its claim is `blocking` criticality **and** it no longer matches reality — `expired`, `source-diverged`, or `derived-outdated`. Every other open task is **amber** — it ships, including a `blocking` claim that is merely pre-expiry (`review-due` / `expiring-soon`). The single source of truth for this verdict is `isRedTask` in `@gogol/share/knowledge/plan`, so the planner and APPS_CHECK can never diverge.

## Two existing primitives are special cases of one model

| Existing primitive | As a claim |
| --- | --- |
| Surface Freshness Ledger (RFC-0196) — generated pSEO pages decay to `noindex` | a `generated` claim past its `validUntil` |
| Frozen enriched content (RFC-0197/0207) — generate-once, provenanced, `approved:false` | a `generated`/`derived` claim with a human-approval gate |
| NEED_THIS marker (RFC-0136) | a claim with no sourced value — never substituted as a live fact |
| A bare business field | an `asserted` claim with no validity (valid, just not yet under temporal management) |

CKL factors these shared mechanisms (decay, frozen-provenance hashing) into `@gogol/share` so the modules stop reinventing them.

## Rollout posture

**Warn-first and additive.** On first introduction every CKL check is `info`/`warning` only; nothing blocks a build. Promotion to build-blocking `error` is per-rule, per-criticality, and intentionally the _last_ step — only contract-critical claims (price, legal) graduate, via `system.md` policy, through the maintenance plan's amber/red gate (RFC-0216). An unannotated field stays a valid `asserted` claim.

## Agent discipline

How AI agents author, source, and maintain claims across the site lifecycle (onboard → work → publish → archive → return) is defined by **RFC-0218** and summarized in [`agent-operating-model.md`](./agent-operating-model.md).
