---
id: RFC-0876
title: "Add technical Nachweis UI, observation history and Warpgogol Lighthouse/Cloudflare pilot"
status: draft
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-08-18
updatedAt: 2026-08-18
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
---

# RFC-0876: Add technical Nachweis UI, observation history and Warpgogol Lighthouse/Cloudflare pilot

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

Change to a discriminated union:

```ts
type NachweisCardProps =
  | NachweisAttestationCardProps
  | NachweisTechnicalAssessmentCardProps;
```

Existing attestation props remain compatible.

Technical variant:

```ts
interface NachweisTechnicalAssessmentCardProps {
  variant: "technical-assessment";
  slug: string;
  title: Record<string, string>;
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
  sourceHashes: string[];
  limitation: string;
}
```

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

`compact` uses the same semantic data but reduces explanatory detail for contextual projection. No separate badge component unless implementation proves the existing component cannot meet composition/accessibility requirements.

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

Data comes from published immutable observations sharing `seriesId`.

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

The component reads published records; no scores are copied manually into `home.md`.

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
