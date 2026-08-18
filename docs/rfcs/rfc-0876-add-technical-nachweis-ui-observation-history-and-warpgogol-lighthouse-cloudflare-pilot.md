---
id: RFC-0876
title: "Add technical Nachweis UI, observation history and Warpgogol Lighthouse/Cloudflare pilot"
status: accepted
kind: architecture
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0708
  - RFC-0716
amendedBy: []
related:
  - ADR-0028
  - ADR-0054
  - RFC-0871
  - RFC-0872
  - RFC-0873
  - RFC-0874
  - RFC-0875
satisfies:
  - DNA-17
  - DNA-23
  - DNA-24
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "/nachweise/ presents technical assessments and attestations as distinct evidence classes"
  - "Technical detail exposes provenance, method, observed time, limitations and Sichtpass"
  - "Homepage dynamically projects current published evidence after the demonstrated result and before collaboration"
  - "Footer contains only stable Nachweise navigation, not volatile scores"
  - "Warpgogol pilot publishes fresh canonical Lighthouse and Cloudflare observations"
nonGoals:
  - "Does not create a surface blueprint"
  - "Does not create a carousel"
  - "Does not hard-code provider scores"
  - "Does not publish raw private provider artifacts by default"
  - "Does not add technical score strips to every page — context-specific future projections require evidence relevance"
  - "Does not draw a chart in v1 — no existing generic accessible chart component exists in the codebase"
  - "Does not make wall-clock freshness a deterministic build gate — a future scheduler may automate reruns"
  - "Does not create a separate badge component for compact projection — reuses nachweis-card with variant: compact"
---

# RFC-0876: Add technical Nachweis UI, observation history and Warpgogol Lighthouse/Cloudflare pilot

## Problem

The existing Nachweis UI (RFC-0708) only supports attestation records — project confirmations and client testimonials. Technical measurements (Lighthouse performance scores, Cloudflare Agent Readiness checks) have no dedicated presentation variant. Without one, technical results either cannot be shown or are forced into the attestation card shape, misrepresenting their nature (point-in-time measurements vs. ongoing attestations).

The homepage (RFC-0716) shows a static trust-strip with hardcoded Nachweis references. It does not dynamically project published evidence from PBP records. Visitors see stale references, not current observations.

The `/nachweise/` registry page presents only project attestations. Technical assessments need their own section with distinct copy, methodology disclosure, and observation history.

The Warpgogol pilot needs real canonical Lighthouse and Cloudflare observations published through the N3 verification gate — not screenshot-seeded values — to demonstrate the product as a future client site would use it.

## Architectural fit

This RFC extends existing components (DNA-17: cosmic overlay, DNA-23: manifests) without creating new ones. The `nachweis-card`, `nachweis-list`, `nachweis-detail`, and `nachweis-verify` components gain a `variant` discriminant — a forward-only change with no compatibility shim.

The `/nachweise/` page remains block-declarative (DNA-24). The homepage evidence block remains block-declarative. No markdown bodies in page entries.

All data is resolved at Astro build time (SSG) via `getCollection("business-profile")` — no client-side fetching. PBP evidence-source entities are the source of truth. The manifest (`/public/nachweise/manifest.json`) carries summary fields for technical assessments.

Observation history is resolved by grouping PBP entities by `assessment.seriesId` and sorting by `assessment.observedAt` descending. No separate collection is created.

The RFC amends RFC-0708 (component extensions) and RFC-0716 (homepage placement). Both are updated with `amendedBy: [RFC-0876]`.

## Context

RFC-0708 provides four reusable Nachweis UI components. RFC-0716 adds static contextual references.

Technical measurements now require a dedicated presentation variant while remaining part of the same registry.

The Warpgogol pilot should demonstrate the product exactly as a future client site would use it.

## Decision

### 1. Keep the existing routes and block-declarative model

Keep:

```text
/nachweise/
/nachweise/[slug]/
/nachweise/verify/[version]/
/nachweise/status/[id].json
/public/nachweise/manifest.json
```

Do not create Nachweis surface blueprints.

### 2. Extend, do not fork, the existing components

#### `nachweis-card`

Change to a discriminated union with an explicit discriminant field `variant` on both variants:

```ts
type NachweisCardProps =
  | NachweisAttestationCardProps
  | NachweisTechnicalAssessmentCardProps;
```

Attestation variant (extends existing props with a discriminant):

```ts
interface NachweisAttestationCardProps {
  variant: "attestation";
  // ...all existing props from RFC-0708 (slug, title, result, scope, etc.)
}
```

The `variant: "attestation"` field is added to all existing call sites. This is a forward-only change — no compatibility shim, no dual-path. Existing attestation card snapshot/semantic tests are updated to include the discriminant.

Technical variant:

```ts
interface NachweisTechnicalAssessmentCardProps {
  variant: "technical-assessment";
  slug: string;
  title: string; // localized by the page per-locale, same as attestation
  provider: { id: string; name: string };
  tool: { name: string; version?: string };
  executionMode: "operator-run" | "provider-run";
  subjectUrl: string;
  observedAt: string;
  methodology: {
    id: string;
    version: string;
    runCount: number;
    aggregation: "provider" | "median" | "none";
  };
  overall?: { score?: number; level?: string };
  dimensions: NachweisAssessmentDimension[];
  verificationLevel: "N0" | "N1" | "N2" | "N3";
  sourceHashes: string[]; // SHA-256 hashes from the Sichtpass, shown as a summary on the card
  limitation: string;
}
```

`NachweisAssessmentDimension` is the UI projection of the dimension shape from `AssessmentBundleV1["result"]["dimensions"]` in `@warpgogol/werkstatt/nachweis`:

```ts
interface NachweisAssessmentDimension {
  id: string;
  providerLabel: string;
  score?: number;
  numerator?: number;
  denominator?: number;
  status?: "pass" | "fail" | "not-checked";
  level?: string;
}
```

The UI dimension type omits `experimental`, `min`, `max`, `samples` — these are not rendered in v1. The source of truth remains the `AssessmentBundleV1` schema; the UI type is a minimal projection.

`sourceHashes` are the same SHA-256 values shown in the Sichtpass section of `nachweis-detail`. The card shows them as a compact summary; the detail page shows them with full labels. No duplicate data — both read from the same PBP entity.

Do not require quote, organization/person or Consent props for this variant.

#### `nachweis-list`

Extend:

```ts
interface NachweisListProps {
  records: NachweisCardProps[];
  emptyMessage: string;
  variant?: "registry" | "compact";
  kindFilter?: Array<"attestation" | "technical-assessment">;
  limit?: number;
}
```

`compact` uses the same semantic data but reduces explanatory detail for contextual projection. In compact mode, the card omits: `context`, `limitations` (full text), `verifiedScope`, `notVerifiedScope`, and `sourceHashes`. It keeps: `title`, `result`, `observedAt` (as `<time datetime>`), `provider` name, `limitation` (short), and a link to detail. No separate badge component — `nachweis-card` with `variant: "compact"` renders the reduced form.

`kindFilter` is used when a single `NachweisList` receives mixed record types and needs to render only one kind. The registry page uses two separate `NachweisList` instances (one per section), each with `kindFilter` set to its section's kind. This avoids pre-filtering in the page block and keeps the component self-contained.

#### `nachweis-detail`

Technical detail contains:

1. provider/tool;
2. target URL;
3. observed time;
4. methodology;
5. full normalized dimensions;
6. `Was dieser Test misst`;
7. `Was dieser Test nicht beweist`;
8. execution provenance;
9. canonical source hashes;
10. optional provider report link;
11. N3/Sichtpass;
12. observation history link/list.

Do not show Consent status for technical records unless a real Consent is linked for a specific reason.

#### `nachweis-verify`

Use timestamp assurance language from RFC-0871.

Verification page remains read-only.

### 3. Registry information architecture

Change `/nachweise/` from project-only semantics to umbrella evidence semantics.

#### DE

H1: `Nachweise`

Lead: `Was wir behaupten, soll nachvollziehbar sein. Hier dokumentieren wir technische Pruefungen, Projektbestaetigungen und freigegebene Kundenbelege mit Quelle, Zeitpunkt und Pruefweg.`

Technical section heading: `Technische Pruefungen`

Technical section explanation: `Punktuelle Messungen mit dokumentierter Methode. Ergebnisse gelten fuer den angegebenen Zeitpunkt und Pruefbereich.`

Attestation section heading: `Projektnachweise und Kundenbestaetigungen`

#### UK

Must be semantic parity, not literal machine-generated word substitution. Machine result data remains identical.

Suggested:

H1: `Докази`

Lead: `Те, що ми стверджуємо, має бути перевірним. Тут ми документуємо технічні перевірки, підтвердження проєктів і дозволені до публікації клієнтські докази із джерелом, часом і способом перевірки.`

Technical heading: `Технічні перевірки`

Technical explanation: `Точкові вимірювання за документованою методикою. Результати стосуються зазначеного часу та обсягу перевірки.`

### 4. Technical card copy rules

Every technical card MUST visibly include:

- test/provider name;
- measured target;
- observed date/time (human-readable date is enough on compact card; `<time datetime>` carries exact ISO);
- result;
- method identifier or concise run description;
- execution provenance;
- link to detail/Sichtpass;
- limitation.

Required DE limitation: `Punktuelle technische Messung. Keine Zertifizierung und keine Garantie zukuenftiger Werte.`

For Cloudflare append/adjust: `Keine Empfehlung durch Cloudflare.`

For operator-run Lighthouse, wording MUST make the execution provenance clear.

### 5. Visual treatment

Design target: engineering instrument panel, not badge wall.

Required:

- use existing `--ds-*` tokens;
- neutral/matte surface;
- score numerals may be prominent but provider logos are secondary/absent;
- no all-green "verified" wall;
- no medal/ribbon graphics;
- no carousel;
- preserve semantic `article`, `dl`, `time`, headings and visible focus;
- color is never the sole carrier of pass/fail information;
- provider names are text labels.

### 6. Observation history

For a technical series, show: `Pruefverlauf`

Data comes from published immutable observations sharing `seriesId`. Each observation is a separate PBP evidence-source entity with `assessment.seriesId` and `assessment.observationId` fields. The evidence-source slug MUST be unique per observation (e.g. `{seriesId}-{observationId}`) so that new observations in the same series do not overwrite previous ones.

The history list is resolved at build time by reading PBP evidence-source entities via `getCollection("business-profile")`, filtering by `kind: "technical-assessment"` and `status: "published"`, grouping by `assessment.seriesId`, and sorting by `assessment.observedAt` descending. The manifest (`/public/nachweise/manifest.json`) also carries `seriesId`, `observationId`, and `observedAt` fields for technical assessments — the detail page may read from either source, but the PBP entity is the source of truth.

Initial UI may show up to the latest five rows:

```text
date | overall/primary result | verification | detail
```

Do not draw a chart in v1 unless an existing generic accessible chart component already exists and adds value.

Never delete an older public observation merely because a new score is lower/higher. Withdrawal is a governance action with reason, not routine supersession.

### 7. Homepage placement

Amend RFC-0716.

On the Warpgogol homepage, the primary Nachweis evidence projection MUST appear:

```text
after the existing result/demo section
before "Wie die Zusammenarbeit beginnt"
```

This matches the visitor decision sequence:

```text
what is offered
-> what the result looks like
-> evidence
-> how collaboration starts
```

The old generic `nachweis-register` static trust-strip near the final availability CTA MUST be removed or converted so that the homepage does not contain duplicate competing Nachweis sections.

#### Homepage compact content

When at least one technical record is published, render a dynamic compact list.

Recommended header DE: `Nachweise aus realen Projekten und technischen Pruefungen`

Subheading: `Nicht nur behauptet. Nachvollziehbar dokumentiert.`

Display at most:

- latest published Lighthouse observation;
- latest published Cloudflare Agent Readiness observation;
- up to one published project/client attestation if available.

CTA: `Alle Nachweise ansehen`

The component reads published records at build time via `getCollection("business-profile")`, filtering by `type: "evidence-source"`, `kind` in the Nachweis evidence kinds set, and `status: "published"`. No scores are copied manually into `home.md`. The block resolves the latest published observation per `seriesId` by sorting on `assessment.observedAt` descending and taking the first row per series.

If no records are published, fall back to a neutral process explanation rather than fake examples.

### 8. Other contextual pages

Existing static links from Services, Pricing, Team and Notausgang may remain.

Do not add technical score strips to every page.

Context-specific future projections require evidence relevance; this RFC does not spray scores across the site.

### 9. Footer

Footer keeps stable navigation only:

```text
Nachweise
```

Optional additional stable links:

```text
Technische Pruefungen
Kundenbestaetigungen
```

Do **not** put live Lighthouse/Cloudflare numbers in the footer.

### 10. Warpgogol pilot records

After both adapter RFCs are implemented, run them against production.

#### Lighthouse

Series: `warpgogol-lighthouse-home`

DE title pattern: `warpgogol.com -- Google Lighthouse`

Authorization: `site-owner`

Method: `WG-LH-01@1.0`

#### Cloudflare

Series: `warpgogol-cloudflare-agent-readiness`

DE title pattern: `warpgogol.com -- Cloudflare Agent Readiness`

Authorization: `site-owner`

Method: `CF-AR-01@1.0`

#### Publication flow

For each captured observation:

```text
measure adapter
-> assessment.ingest (inside adapter)
-> nachweis.validate
-> nachweis.sign
-> nachweis.timestamp
-> nachweis.approve --verification-level N3
-> nachweis.publish
-> nachweis.manifest.generate
-> site validation/build/deploy
```

Do not call `nachweis.public-derivative` merely to satisfy the technical policy. It is optional only if a deliberate public report derivative is created.

Do not call `nachweis.consent.update` for these Warpgogol technical records unless a real consent-bearing artifact is introduced.

### 11. Claims generated from results

Any PBP Claim/public prose derived from the results must be factual and observation-bound.

Good: `Am <Datum> erreichte warpgogol.com im Pruefverfahren WG-LH-01 einen Lighthouse-Performance-Median von <X>.`

Bad: `Warpgogol hat immer perfekte Performance.`

Good: `Cloudflare Agent Readiness bewertete warpgogol.com am <Datum> mit <provider result>.`

Bad: `Cloudflare bestätigt, dass Warpgogol die beste KI-Website baut.`

### 12. Freshness

For the pilot, both methodologies use: `maxAgeDays = 30`

Public UI always shows the observation date.

Do not use the word `aktuell` solely because a record exists. If a record is older than its declared freshness policy, the system should avoid an "current" label.

A future scheduler may automate reruns. This RFC does not make wall-clock freshness a deterministic build gate.

Operational practice:

- rerun after a material production release that can change measured behavior;
- rerun at least monthly while the homepage presents these as current technical evidence.

### 13. Accessibility

Preserve RFC-0708 requirements.

Technical dimension lists use semantic structures; do not rely on circular score graphics alone.

Agentic Browsing `3/3` is rendered as text/status, not a 100 circle.

## Acceptance criteria

- [ ] Existing attestation card snapshot/semantic tests remain valid.
- [ ] Technical card renders without person/org/quote/consent props.
- [ ] Technical detail has method, provenance, observedAt and limitations.
- [ ] Registry has separate technical and attestation sections.
- [ ] Registry uses no carousel.
- [ ] Technical UI never calls a generic measurement a certification.
- [ ] Timestamp wording obeys assurance metadata.
- [ ] Homepage evidence block is after demo and before collaboration.
- [ ] Homepage values come from published records, not content hard-coding.
- [ ] Footer contains no volatile scores.
- [ ] History lists immutable published observations.
- [ ] DE/UK machine results are identical.
- [ ] Lighthouse pilot is rerun canonically; screenshot values are not seeded.
- [ ] Cloudflare pilot is rerun via API; screenshot values are not seeded.
- [ ] Both pilot observations complete N3 and publish through the policy gate.
- [ ] `/nachweise/`, both detail pages, verify pages, status JSON and manifest work after deploy.

## Design

### Data flow

All Nachweis UI data is resolved at Astro build time (SSG). No client-side fetching.

1. **PBP evidence-source entities** in the `business-profile` content collection are the source of truth. Each entity has `type: "evidence-source"`, `kind` (attestation or technical-assessment), `status` (draft/published), and optional `assessment` metadata (for technical assessments with `seriesId`, `observationId`, `observedAt`, `dimensions`).
2. **`nachweis-routes.ts`** enumerates published entities and generates virtual routes for detail and verify pages.
3. **`/nachweise/` registry page** reads all published entities, splits by kind, renders two `NachweisList` sections (technical + attestation).
4. **Homepage block** reads all published entities, resolves the latest per `seriesId`, renders a compact `NachweisList`.
5. **`/public/nachweise/manifest.json`** is generated by `nachweis.manifest.generate` and carries summary fields including `seriesId`, `observationId`, `observedAt` for technical assessments. The status JSON endpoint reads from the same manifest.
6. **Observation history** on the detail page reads all published entities with the same `assessment.seriesId`, sorted by `observedAt` descending.

### File system responsibilities

| Path | Change |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro` | Add discriminated union, technical-assessment variant |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.css` | Technical-assessment styles |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` | Add `variant`, `kindFilter`, `limit` props |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro` | Add technical detail layout, observation history |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-verify/nachweis-verify-component.astro` | No change (already uses RFC-0871 timestamp assurance) |
| `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` | No change (already includes `technical-assessment` kind) |
| `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-*.yaml` | Update archetype schemas if needed |
| warpgogol-com `src/content/pages/*/home.md` | Replace static nachweis block with dynamic projection |
| warpgogol-com `src/content/pages/*/nachweise/index.md` | Update to umbrella registry with two sections |
| warpgogol-com footer layout | Remove volatile scores, keep stable Nachweise links |

### DNA alignment

- **DNA-17** (Cosmic overlay): Component manifests retain their `cosmicName` entries (Nix, Hydra, Kerberos, Styx). No new components are created — existing ones are extended.
- **DNA-23** (Cosmic overlay — manifests): The `manifest.yaml` files for the four components remain valid. No cosmic name changes.
- **DNA-24** (Block-declarative pages): The `/nachweise/` page remains a frontmatter-only document with `blocks[]`. The homepage block remains block-declarative. No markdown bodies in page entries.

### `amendedBy` reciprocation

Upon implementation, RFC-0708 and RFC-0716 frontmatter must be updated to include `amendedBy: [RFC-0876]`. This is a mechanical step done during implementation, not a separate RFC.

### Compass sync

`docs/verification-plan.xml` may need updates if new verification rules are introduced for technical-assessment UI rendering. `docs/source-markup.xml` may need updates if the component contracts change. Check during `fo-doc-audit` after implementation.

### AGENTS.md updates

`packages/werkstatt-site/AGENTS.md` should document the technical-assessment variant in the component rules section after implementation.

## Rollout

### Default behavior

All Nachweis UI components gain the `variant` discriminant. Existing attestation call sites are updated to pass `variant: "attestation"`. The `/nachweise/` page gains two sections. The homepage block becomes dynamic.

### Adoption path for warpgogol-com

1. Extend the four components in `packages/werkstatt-site`.
2. Update existing attestation content to include `variant: "attestation"`.
3. Update `/nachweise/` page content to umbrella registry.
4. Replace homepage static nachweis block with dynamic projection.
5. Update footer to remove volatile scores.
6. Run Lighthouse and Cloudflare pilot observations through the publication flow.
7. Build, validate, deploy.

### New-app compliance

New sites with the `nachweis` entitlement automatically get the extended components. No migration needed — the components handle empty states gracefully.

## Alternatives considered

1. **Separate components for technical assessments** (e.g. `nachweis-technical-card.astro`): Rejected because it duplicates the semantic structure (article, dl, headings) and creates a maintenance burden. The discriminated union keeps one component with two rendering paths.
2. **Client-side fetching for homepage projection**: Rejected because the site is SSG (Astro). Build-time resolution via `getCollection` is simpler, faster, and consistent with the existing `nachweis-routes.ts` pattern.
3. **Storing observation history in a separate collection**: Rejected because PBP evidence-source entities already carry `assessment.seriesId` and `assessment.observationId`. A separate collection would duplicate data and create a sync problem.
4. **Carousel for registry**: Rejected by explicit nonGoal. A linear list with semantic `<ul>` is more accessible and honest.

## Risks

- **Agent misinterpretation risk**: An agent might treat the `variant` field as optional and omit it, causing a runtime error in the discriminated union. Mitigation: the `cast` helper in `nachweis-list` validates the discriminant and throws a descriptive error if missing.
- **False-positive rate for validators**: The existing `nachweis-card` snapshot tests will need updating to include `variant: "attestation"`. This is expected and not a false positive — the tests are updated, not weakened.
- **Slug collision for observation history**: If the slug is not unique per observation, new observations overwrite old ones. Mitigation: the slug MUST include the observationId (e.g. `{seriesId}-{observationId}`). The `nachweis-assessment-ingest` code currently uses a series-level slug — this RFC requires updating it to include the observationId.
- **Homepage empty state**: If no technical records are published, the homepage block must render a neutral process explanation, not fake examples. This is a content authoring step, not auto-generated.
- **Pilot execution failure**: Lighthouse or Cloudflare API calls may fail. The publication flow is operator-driven — a failed measurement does not block the build. The homepage falls back to the empty state.

## Implementation notes for agents

- **Do not seed screenshot values** into PBP content or test fixtures (RFC-0874, RFC-0875). Run the actual Lighthouse and Cloudflare measurements.
- **Do not call `nachweis.public-derivative`** merely to satisfy the technical policy. It is optional.
- **Do not call `nachweis.consent.update`** for Warpgogol technical records unless a real consent-bearing artifact is introduced.
- **Do not use the word `aktuell`** solely because a record exists. If a record is older than its declared freshness policy (`maxAgeDays = 30`), avoid a "current" label.
- **Do not map `not-checked` Cloudflare dimensions to score 0** (RFC-0875). Render them as `not-checked` status.
- **Do not infer eIDAS qualification** from the word `TSA`, from RFC 3161 compliance, or from a provider marketing page (RFC-0871).
- **Do not silently upgrade legacy records** (RFC-0871).
- **Do not weaken N3** merely to avoid the terminology correction (RFC-0871).
- **Do not put live Lighthouse/Cloudflare numbers in the footer.**
- **Do not spray scores across the site.** Only the homepage and `/nachweise/` render technical scores.
- **Do not create a carousel.** Use semantic `<ul>` lists.
- **Do not draw a chart in v1.** No existing generic accessible chart component exists.
- **Never delete an older public observation** merely because a new score is lower/higher. Withdrawal is a governance action with reason.
- **Distinguish code changes from content authoring**: Component extensions, page block updates, and footer changes are code changes an agent can make. Pilot observations require operator execution of the measurement adapters. Homepage empty-state prose requires human authoring.
- **RFC-0871 compliance**: Timestamp wording in `nachweis-verify` and `nachweis-detail` must use the structured `timestamp` prop with `assurance: "rfc3161" | "eidas-qualified"`. Do not make stronger legal claims than supported.
- **RFC-0874 compliance**: Lighthouse pilot must run 5 sequential runs with median aggregation. Screenshot values are not seeded.
- **RFC-0875 compliance**: Cloudflare pilot must submit via API, poll for results, and parse using the documented field paths. Screenshot values are not seeded.
