---
id: RFC-0277
title: "Govern PSEO as managed visibility program with proof gates"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0196
  - RFC-0238
  - RFC-0240
  - RFC-0269
  - RFC-0271
  - RFC-0274
  - RFC-0275
  - RFC-0276
commands:
  proposed: []
  added:
    - pseo.proof.validate
    - pseo.experiment.plan
    - pseo.product.validate
  changed:
    - pseo.validate
    - entitlement.module.validate
    - surface.context.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/surface"
successSignals:
  - "PSEO is governed as an internal capability and managed visibility program until demand, indexation, and cost proof gates are met."
  - "The product surface sells managed coverage, monitoring, review, and reporting, not an index budget or a promise that Google will index pages."
  - "Published URLs are not removed or noindexed for tariff downgrade reasons; quality, legal, and explicit client deletion are separate policies."
  - "Scaling decisions use GSC/observability metrics, review cost, and experiment thresholds instead of route-count enthusiasm."
nonGoals:
  - "Do not implement marketing copy or pricing in this RFC."
  - "Do not remove internal budgets; they remain quality and operations controls."
  - "Do not guarantee leads, rankings, indexation, or AI-answer placement."
---

# RFC-0277: Govern PSEO as managed visibility program with proof gates

## Context

The PSEO engine is technically promising, but the product question is separate. Selling "index budget" or tariff-based depth unlocks risks promising a result the platform does not control: Google indexation. It also conflicts with the Digitales Fundament/Notausgang promise if a client's published URL graph can be downgraded because a subscription changed.

The better product shape is a managed visibility program: the studio maintains a bounded coverage map, evidence, review, translation, monitoring, reports, and experiments. Indexability budgets still exist internally, but they are operational guardrails, not customer-facing units.

## Problem

Current PSEO productization risks:

- index budget can be interpreted as a sold indexation entitlement;
- tariff downgrade can imply destructive noindex/redirect behavior on already-published URLs;
- route count can become the success metric instead of search demand, indexation, and conversion evidence;
- dogfooding on the studio site can fail to prove client-site demand;
- AI generation cost is easy to underestimate while human/target-language review cost dominates.

## Decision

PSEO is governed in three stages:

1. **Internal capability:** engine development, dogfood, and limited experiments. No customer-facing PSEO promise.
2. **Managed visibility program:** bounded client pilots with explicit coverage, evidence, monitoring, review, and quarterly reporting. No indexation guarantee.
3. **Product module:** only after proof gates pass on at least two sites, including one client pilot.

Customer-facing packaging MUST NOT sell raw index budget, route count, or "Google will index N pages." It MAY sell managed coverage, review capacity, monitoring, reports, and additional evidence collection.

Internal index budgets remain valid as quality controls. Entitlements may control the studio's ongoing work, monitoring, and new coverage generation, but they MUST NOT automatically remove or noindex already-published URLs for downgrade reasons.

## Architectural fit

- RFC-0240 productization is constrained: entitlement controls service scope, not a destructive public URL graph.
- RFC-0274 quality gates decide page existence/indexability by evidence and risk, not tariff.
- RFC-0275 scaling plans expose route count and artifact cost as operational facts.
- RFC-0276 Bordbuch records experiments, proof-gate status, and PSEO lifecycle transitions.
- Quartalsbericht/Sichtpass can present managed visibility status as reporting, without promising growth.

## Design

### URL policy

Once a URL is publicly published and indexable, it is not removed, redirected, or noindexed solely because a client downgrades. Allowed reasons for removal/noindex:

- quality/evidence gate fails;
- legal/compliance risk;
- client explicitly requests deletion;
- content is obsolete and has a better canonical successor;
- migration RFC defines a redirect map.

Tariff changes may stop future expansion, enrichment, monitoring, reporting, or review work. They do not erase accumulated public asset value by default.

### Proof gates

`pseo.proof.validate` evaluates whether a PSEO module is allowed to move stages:

| Gate | Minimum signal |
| --- | --- |
| Demand map | Keyword/GSC/market evidence exists for the intended clusters |
| Indexation | Eligible pilot pages reach configured indexation threshold after an observation window |
| Query diversity | A meaningful share of pages receive more than one query |
| Core safety | Non-PSEO core pages do not degrade during the experiment |
| Review economics | Full-cycle cost per page fits the intended managed-service model |
| Target-language quality | Translation QA/review thresholds pass for published locales |
| URL policy | Downgrade/non-destruction policy is declared |

Thresholds are module-context or experiment-config data, not hard-coded constants. Suggested pilot defaults may follow the audit: 90-day window, cluster-level indexation and impressions, query diversity, and review-cost caps.

### Experiment plan

```yaml
pseoExperiments:
  - id: warpgogol-local-visibility-g1
    module: pseo
    app: warpgogol-com
    windowDays: 90
    clusters:
      - blueprint: website-local
        industry: friseur
        cities: [karlsruhe, stuttgart, ulm]
        demands: [haarschnitt, balayage]
    thresholds:
      indexationRate: 0.6
      medianImpressionsPerPage28d: 30
      minQueryDiversityShare: 0.4
      maxFullCycleCostPerPageEur: 25
```

### CLI surface

```sh
pnpm exec site-kernel run pseo.experiment.plan --app warpgogol-com --module pseo --json
pnpm exec site-kernel run pseo.proof.validate --app warpgogol-com --module pseo --json
pnpm exec site-kernel run pseo.product.validate --app warpgogol-com --json
```

`pseo.product.validate` checks authored product language and module context for forbidden promises:

- index budget as customer-facing SKU;
- guaranteed indexation/ranking/lead wording;
- destructive downgrade policy;
- missing no-guarantee boundaries;
- missing export/Notausgang statement for PSEO records, glossary, briefs, and reports.

### Observability inputs

The proof layer may consume:

- GSC query/page coverage by cluster;
- sitemap and behavior snapshot membership;
- PSEO generated artifact counts;
- target-language QA status;
- review time/cost records;
- Bordbuch events;
- Quartalsbericht/Sichtpass reporting snapshots.

If observability is missing, proof validation reports "not enough data" instead of guessing.

## Failure modes

- No demand map: cannot leave internal capability stage.
- Pilot below thresholds: keep engine internal or narrow coverage; do not scale.
- Product copy promises indexation: validation error.
- Downgrade policy removes existing public pages by entitlement alone: validation error.
- Review cost exceeds threshold: scale blocked even if generation is cheap.

## Rollout

1. Declare PSEO stage as `internalCapability` for `warpgogol-com`.
2. Add URL non-destruction policy to module/product context.
3. Add proof-gate experiment config for a small pilot cluster.
4. Wire GSC/observability inputs into Bordbuch status or an interim report.
5. Only after proof gates pass, draft customer-facing managed visibility packaging.

## Alternatives considered

- **Sell index budget directly.** Rejected: the platform does not control Google indexation and it creates destructive downgrade pressure.
- **Keep PSEO as pure internal tooling forever.** Rejected as premature: the engine may become a valuable managed program after proof gates pass.
- **Scale dogfood first and decide later.** Rejected: route count without demand and observability can create SEO risk before learning anything transferable to client sites.

## Risks

- Proof gates slow visible productization. Mitigation: this is intentional; it prevents selling an unproven SEO promise.
- URL non-destruction can increase maintenance obligations. Mitigation: tariffs control future service, while quality/legal gates still protect the site.
- Product validation of language can be imperfect. Mitigation: treat it as a guardrail plus human product review, not a legal oracle.

## Acceptance criteria

- [x] PSEO stages are defined in module/product context. (evidence: implemented historically)
- [x] URL non-destruction policy is declared and validated. (evidence: implemented historically)
- [x] `pseo.experiment.plan`, `pseo.proof.validate`, and `pseo.product.validate` are registered. (evidence: implemented historically)
- [x] Customer-facing copy cannot describe index budget, guaranteed indexation, guaranteed rankings, or guaranteed leads as sold outcomes. (evidence: implemented historically)
- [x] Proof validation consumes observability data or reports "not enough data" explicitly. (evidence: implemented historically)
- [x] PSEO records, glossary, translator notes, briefs, and reports are included in Notausgang/export policy. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not optimize product language around what the engine can generate. Optimize around what the studio can prove, maintain, and export.
- Internal budgets are allowed; customer-facing index promises are not.
- A downgrade may reduce future work. It must not silently destroy already-published asset value.
