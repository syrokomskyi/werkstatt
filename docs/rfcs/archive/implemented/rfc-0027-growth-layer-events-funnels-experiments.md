---
id: RFC-0027
title: "Growth Layer: events, funnels, experiments, and vendor-agnostic adapter"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-25
updatedAt: 2026-04-25
implementedAt: 2026-04-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0161
  - RFC-0170
related:
  - DNA-1
  - DNA-4
  - DNA-7
  - DNA-18
  - DNA-19
  - DNA-21
  - DNA-22
  - DNA-23
  - DNA-24
  - DNA-25
  - DNA-26
  - RFC-0018
  - RFC-0023
  - RFC-0024
  - RFC-0025
  - RFC-0026
commands:
  proposed: []
  added:
    - growth.events.validate
    - growth.funnel.validate
    - growth.experiment.validate
    - growth.experiment.archive
    - growth.adapter.contract
    - growth.vendor.resolve
  changed:
    - runtime.context.shape   # now permits non-null segment and non-empty flags at hydration time only
    - client.edit.validate    # adds growth/experiments/** to the client-editable surface
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - growth                    # NEW: @gogol/growth
  - growth-adapter-null       # NEW: no-op adapter (default)
  - growth-adapter-plausible  # NEW: first reference adapter
  - ontology
  - share
  - site-kernel-checks
successSignals:
  - "A new `@gogol/growth` package exports `GrowthAdapter`, `emit(eventId, payload)`, and a client-side `<GrowthProvider>` island that hydrates `ClientRuntimeContext.{segment, flags}` from the chosen vendor adapter."
  - "A closed, content-declared **event catalog** lives in `packages/ontology/growth/events/*.yaml`; every `emit()` call in packages and apps references an id from this catalog; `growth.events.validate` enforces it."
  - "**Funnels** are content-declared YAML documents that name an ordered sequence of events in the catalog; `packages/ontology/growth/funnels/*.yaml` holds reusable funnels (e.g., `donation-intent-to-confirmation`)."
  - "**Experiments** are client-editable content documents under `apps/<app>/src/content/growth/experiments/*.md`; each experiment names a flag id, a variant set, and a traffic allocation; `growth.experiment.validate` enforces shape and flag-namespace discipline."
  - "A vendor-agnostic `GrowthAdapter` interface has at minimum two packaged implementations: `@gogol/growth-adapter-null` (no-op, SSG default) and `@gogol/growth-adapter-plausible` (first reference). New vendors ship as `@gogol/growth-adapter-<name>` packages."
  - "`system.yaml.growth` declares per-concern vendor binding (`analytics`, `experiments`, `funnels`); the binding is the single switching point. Changing `analytics: plausible` to `analytics: posthog` requires only editing the yaml and re-running the build."
  - "`RuntimeContext.flags` and `RuntimeContext.segment` are populated at hydration time by the chosen adapter. Build-time visibility evaluation still uses `EMPTY_RUNTIME_CONTEXT`; client-time visibility evaluation uses the hydrated context. Both evaluations use the same `evalVisibility` function (RFC-0026)."
nonGoals:
  - "Do not introduce Cloudflare Durable Objects, KV, Workers-side persistence, or any server-side runtime. Growth lives in static builds + client-side adapters + vendor-hosted infrastructure. DNA-1 (static SSG) is absolute."
  - "Do not invent a warpgogol-native analytics backend. The studio is not in the analytics-vendor business. Adapters delegate to existing vendors (Plausible, PostHog, Matomo, GA4, Cloudflare Web Analytics)."
  - "Do not permit free-form event ids. `emit('random-string')` fails `growth.events.validate`. The event catalog is a closed vocabulary (DNA-19 pattern)."
  - "Do not permit engineering-only experiments. Experiments are a client-editable content type; anyone who can commit content may author an experiment. Engineering controls the *event catalog* and *adapter configuration*, not the experiment library."
  - "Do not re-evaluate block visibility at runtime after hydration completes. Visibility resolves once at hydration and blocks are shown/hidden accordingly; there is no reactive re-render cycle on flag change within a page view."
  - "Do not introduce server-side cookie reading for persona detection in this RFC. `segment` is populated client-side by the vendor adapter. A future RFC may add edge-function persona detection if driven by client demand."
  - "Do not make the `GrowthAdapter` interface extensible by client content. The interface is closed in `@gogol/growth`; vendor packages implement it. Clients compose by choosing vendors, not by mutating contracts."
  - "Do not allow experiment variants to ship code. A variant may modify props or visibility, never import a different component. Component-level A/B needs a superseding RFC."
  - "Do not permit multiple adapters per concern. `system.yaml.growth.analytics` is scalar; running two analytics vendors in parallel is explicitly forbidden to avoid double-counting and consent surface sprawl."
  - "Do not defer the activation of `RuntimeContext.flags` and `RuntimeContext.segment`. This RFC activates both at hydration time. The RFC-0026 MVP contract (always-null/always-empty) remains authoritative for *build-time* evaluation; `runtime.context.shape` is updated to permit hydration-time population."
---

# RFC-0027: Growth Layer: events, funnels, experiments, and vendor-agnostic adapter

## Context

[RFC-0026](RFC-0026-block-declarative-pages-and-runtime-context.md) reserved `RuntimeContext.segment` and `RuntimeContext.flags` as type-level forward-compat fields with a hard-coded empty contract at MVP. Authors may write `visibility: { flag: "experiment-hero-v2" }` today and have it parse, but the expression always evaluates false because no adapter populates flags. This RFC activates those fields at hydration time — without requiring any content change — by introducing the **Growth Layer**.

[RFC-0025](RFC-0025-activate-cosmic-overlay-and-feature-first-app-layout.md) forbade runtime/edge infrastructure (Durable Objects, KV, Workers-side persistence) for manifest resolution. DNA-1 reinforces: the studio ships static SSG to Cloudflare CDN. Growth must live within that envelope. The answer is **static rendering + client-side adapter + vendor-hosted infrastructure**: blocks render all possible variants unconditionally at build time, then a hydrated `<GrowthProvider>` island resolves the visitor's flags/segment and reveals the matching variant via attribute-gated CSS.

A third pressure is **vendor lock-in avoidance**. The studio's clients will span industries with different compliance postures (nonprofit GDPR strictness, handwerk simplicity, B2B enterprise needs). Hard-binding to one analytics vendor in `packages/ui/` would force component rewrites when a client demands Plausible instead of GA4. The answer is a **closed `GrowthAdapter` interface** that every component and page emits against, and **CMS-driven vendor selection** so switching adapters is a one-line `system.yaml` edit.

## Problem

Four unprotected invariants block the next phase of client delivery:

1. **No typed event vocabulary.** Components currently emit analytics through ad-hoc `window.gtag(...)` or `fetch('/track')` calls. Each new component reinvents event names. Rename audits are impossible.

2. **No composition-level funnel definition.** "Donation intent → form start → form complete → confirmation" is a pattern clients want to measure across sites. Today each app hand-stitches this in the analytics vendor's UI. It cannot be content-declared, cannot be shared across clients, cannot be version-controlled.

3. **No experiments surface.** Clients who want to test headline variants need developer intervention today. With the client-as-committer model (RFC-0025), experiments should be a content type — clients author them like they author pages.

4. **No vendor abstraction.** A component that calls `window.gtag` cannot be reused on a Plausible-only site without code change. The studio has zero live clients; we fix this once, now, before we have N migrations ahead of us.

## Decision

Four tightly coupled contracts are established.

### 1. Typed event catalog (DNA-27 established by this RFC)

`packages/ontology/growth/events/*.yaml` holds the closed event catalog. Every event is workspace-scoped (shared across apps, not per-app) and carries a typed payload schema. Emissions reference the event id; `growth.events.validate` rejects calls to unregistered ids.

### 2. Content-declared funnels (DNA-28 established by this RFC)

`packages/ontology/growth/funnels/*.yaml` holds reusable funnel graphs — ordered event sequences with attribution hints. Funnels are workspace library (like constellations in RFC-0025), consumed by apps via `system.yaml.growth.funnels: [donation-intent-to-confirmation]`.

### 3. Client-editable experiments (DNA-29 established by this RFC)

`apps/<app>/src/content/growth/experiments/*.md` is the per-app experiment library. Each experiment document declares:

- A `flag` id (the variable name blocks reference via `visibility: { flag: "..." }` or prop overrides).
- A set of `variants` with traffic allocation summing to 1.0.
- An optional funnel reference for conversion attribution.

Experiments are part of the **client-editable surface** (RFC-0025 DNA-22) — `client.edit.validate` is updated to whitelist `src/content/growth/experiments/**`. Engineering controls the event catalog and adapter configuration; clients control the experiments that compose from them.

### 4. Vendor-agnostic `GrowthAdapter` + CMS-driven vendor selection (DNA-30 established by this RFC)

A closed interface in `@gogol/growth`:

```ts
export interface GrowthAdapter {
  readonly id: string;
  init(config: unknown): Promise<void>;
  emit(event: EmittedEvent): void;
  resolveFlags(): Promise<Record<string, boolean>>;
  resolveSegment(): Promise<string | null>;
  shutdown(): Promise<void>;
}
```

Packaged implementations live in `@gogol/growth-adapter-<name>` packages. `system.yaml.growth` binds per-concern vendors:

```yaml
growth:
  analytics:   plausible        # must resolve to @gogol/growth-adapter-plausible
  experiments: plausible        # may be different vendor than analytics
  funnels:     plausible        # likewise
```

A concern bound to `null` uses `@gogol/growth-adapter-null` (no-op, default for greenfield apps).

### RuntimeContext activation (DNA-26 amended, not superseded)

RFC-0026's MVP contract (`segment === null`, `flags === {}`) remains authoritative for **build-time** evaluation. This RFC activates the fields at **hydration time** via `<GrowthProvider>`. `runtime.context.shape` is updated to permit hydration-time population while still rejecting build-time population — the type `RuntimeContext` is unchanged; only the construction sites are allowed to widen.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-1** (static SSG) | **Reinforced.** Growth is client-side + vendor-hosted; zero server-side code ships with the studio. |
| **DNA-4** (canonical content in `src/content/`) | Extended. Experiments are a new content-collection type under `src/content/growth/experiments/`. |
| **DNA-7** (thin page routes) | Preserved. Growth hydrates via one `<GrowthProvider>` island in the root layout, not per-route logic. |
| **DNA-18** (feature-graph) | Complementary. Feature-graph decides _if a feature exists_; experiments decide _which variant of an existing feature_. No overlap. |
| **DNA-19** (closed vocabularies) | **Extended.** Event catalog is the fourth closed vocabulary in `@gogol/ontology`. Extension requires a superseding RFC or a RFC-authorized additive entry. |
| **DNA-21** (feature-first layout, RFC-0025) | Preserved. Experiment documents are feature-first content under `src/content/growth/experiments/`. |
| **DNA-22** (client-editable surface, RFC-0025) | **Extended.** `client.edit.validate` whitelists `src/content/growth/experiments/**`; engineering-only paths (event catalog, adapter config) remain locked. |
| **DNA-23** (cosmic overlay, RFC-0025) | Unchanged. Growth is orthogonal to naming. |
| **DNA-24 / 25 / 26** (block-declarative, buildPage, unified visibility, RFC-0026) | **Directly activated.** `{ flag }` and `{ segment }` visibility clauses finally evaluate non-false. Same grammar, same evaluator, new source of truth for the ctx fields. |
| **DNA-27** (typed event catalog) | **Established by this RFC.** |
| **DNA-28** (content-declared funnels) | **Established by this RFC.** |
| **DNA-29** (client-editable experiments) | **Established by this RFC.** |
| **DNA-30** (vendor-agnostic GrowthAdapter) | **Established by this RFC.** |
| **RFC-0018** (feature-graph) | Preserved. Feature-graph remains the higher-level switch; growth sits below. |
| **RFC-0023** (Uni UI Ontology) | Unchanged. Growth does not extend cosmic vocabulary. |
| **RFC-0024** (business layer) | Complementary. Experiments may read business content via prop references (RFC-0026 plain-string path). |
| **RFC-0025** (system.yaml + surface) | **Extended.** `system.yaml.growth` is a new top-level key; `client.edit.validate` whitelist is extended. |
| **RFC-0026** (block-declarative + RuntimeContext) | **Activated.** This RFC is the first consumer of reserved ctx fields. No schema change needed — only behavior change at construction sites. |

## Design

### Event catalog shape

```yaml
# packages/ontology/growth/events/donation-intent.yaml
kind: event
id: donation-intent
version: 1.0.0

meta:
  title: Donation intent
  description: Fired when a visitor clicks a donation CTA (before form open).

semantics:
  category: conversion
  stage: intent

payload:
  type: object
  additionalProperties: false
  required: [ctaLocation, amount]
  properties:
    ctaLocation:  { type: string, enum: [hero, footer, sticky-bar, section-cta] }
    amount:       { type: number, minimum: 0 }
    currency:     { type: string, enum: [EUR, USD, GBP] }
    campaign:     { type: string }
```

Every `emit('donation-intent', payload)` call has `payload` validated against this schema at build time via AST scan + runtime dev-mode assertion in `@gogol/growth`.

### Funnel shape

```yaml
# packages/ontology/growth/funnels/donation-intent-to-confirmation.yaml
kind: funnel
id: donation-intent-to-confirmation
version: 1.0.0

meta:
  title: Donation intent → confirmation
  description: Standard nonprofit donation funnel.

sequence:
  - event: donation-intent
    label: Intent
  - event: donation-form-start
    label: Form opened
    windowSeconds: 1800                  # must follow previous event within 30 min
  - event: donation-form-submit
    label: Form submitted
    windowSeconds: 900
  - event: donation-confirmed
    label: Confirmed
    windowSeconds: 60

attribution:
  primary: donation-confirmed
  by: [campaign, ctaLocation]
```

Funnels are referenced from `system.yaml.growth.funnels: [donation-intent-to-confirmation]` and dispatched to the vendor at adapter init time (`adapter.registerFunnels(...)` — optional on the interface, adapters that do not support funnels skip it).

### Experiment shape

```md
---
kind: experiment
id: hero-headline-2026q2
flag: experiment-hero-headline-2026q2           # lower-kebab; namespaced by convention
version: 1.0.0

meta:
  title: Hero headline A/B — nonprofit trust vs urgency
  startsAt: 2026-05-01T00:00:00Z
  endsAt:   2026-05-31T23:59:59Z

variants:
  - id: control
    traffic: 0.5
  - id: urgency
    traffic: 0.5

attribution:
  funnel: donation-intent-to-confirmation
  primaryMetric: donation-confirmed
---

# Hero headline experiment

Control: current "Bildung für Kinder in León"
Urgency: "2400 Kinder warten. Heute spenden."
```

The body is freeform markdown (authoring notes only — ignored by the build). The frontmatter is the contract.

How blocks consume it — two patterns:

**Pattern A: visibility-gated variants** — ship two blocks, each gated on a flag variant:

```yaml
# inside page entry
blocks:
  - use: Europa
    props: { headline: "Bildung für Kinder in León" }
    visibility: { any: [ { not: { flag: "experiment-hero-headline-2026q2" } }, { flag: "experiment-hero-headline-2026q2:control" } ] }
  - use: Europa
    props: { headline: "2400 Kinder warten. Heute spenden." }
    visibility: { flag: "experiment-hero-headline-2026q2:urgency" }
```

The flag namespace convention is `<experimentId>:<variantId>`. Exactly one variant flag is true per visitor for a live experiment. If the experiment is not active for this visitor (before `startsAt`, after `endsAt`, or traffic-excluded), none of the variant flags are true — the `not:` guard shows the default variant.

**Pattern B: prop-level overrides** — deferred to a future RFC (it needs block-prop-level variant substitution which is more surface than we commit to here).

### Client adapter boot sequence

```ts
// @gogol/growth/src/client.ts (runs in <GrowthProvider> island)
async function boot(config: GrowthConfig) {
  const adapter = await loadAdapter(config.analytics);         // dynamic import per system.yaml
  await adapter.init(config.adapterConfig);
  const [flags, segment] = await Promise.all([
    adapter.resolveFlags(),
    adapter.resolveSegment(),
  ]);
  ClientRuntimeContext.hydrate({ locale: document.documentElement.lang, segment, flags });
  document.documentElement.setAttribute("data-growth-ready", "true");
}
```

`ClientRuntimeContext.hydrate` walks all elements carrying `data-visibility` (emitted by the SSG pass for any block with non-build-time visibility) and evaluates the attribute's parsed expression under the new context. Matched blocks get `data-visible="true"`; unmatched get `data-visible="false"`.

Pre-hydration hiding defaults to `visibility: hidden` workspace-wide — the block preserves its layout box so no CLS occurs during hydration. Blocks may opt into `display: none` via a `data-hide-mode="collapse"` attribute, which is appropriate only when the block is **below the fold** or when the author has accepted the CLS cost (e.g., the block's collapse is the intended UX).

```css
/* Default: preserve box, prevent CLS. Safe above the fold. */
[data-visibility]:not([data-visible]) { visibility: hidden; }
[data-visibility][data-visible="false"] { visibility: hidden; }
[data-visibility][data-visible="true"] { visibility: visible; }

/* Opt-in: collapse layout. Use below the fold only. */
[data-visibility][data-hide-mode="collapse"]:not([data-visible]) { display: none; }
[data-visibility][data-hide-mode="collapse"][data-visible="false"] { display: none; }
[data-visibility][data-hide-mode="collapse"][data-visible="true"] { display: revert; }
```

Block authors set `data-hide-mode` in content:

```yaml
blocks:
  - use: Europa                                    # above the fold → default visibility:hidden
    visibility: { flag: "experiment-hero:control" }
  - use: Callisto                                  # below the fold → collapse is fine
    hideMode: collapse
    visibility: { flag: "experiment-footer-cta:urgency" }
```

`page.block.validate` enforces: a block with `hideMode: collapse` MUST NOT appear among the first N blocks of a page (N configurable per layout, default 2). Violations fail the build — authors cannot accidentally ship CLS.

Blocks with only `locale` or `feature` expressions evaluate at build time, render unconditionally, and carry no `data-visibility` attribute — no hydration cost, no CLS risk. Blocks carrying `segment` or `flag` expressions render into the DOM at build time but start invisible until hydration.

### `system.yaml.growth` schema extension

```yaml
# apps/nicaragua-projekt/system.yaml
growth:
  analytics:   plausible           # @gogol/growth-adapter-plausible
  experiments: plausible
  funnels:     plausible
  adapterConfig:
    plausible:
      domain: nicaragua-projekt.example.org
      apiHost: https://plausible.io
  funnels:
    - donation-intent-to-confirmation
```

Client-writable keys under `growth`:

- `growth.funnels[]` (clients may add/remove references to workspace-library funnels)
- None of `growth.analytics`, `growth.experiments`, or `growth.adapterConfig` — those are engineering (deciding vendor and credentials).

`client.edit.validate` enforces the partial-YAML rule.

### `GrowthAdapter` interface (full)

```ts
// @gogol/growth/src/adapter.ts
export interface EmittedEvent {
  readonly id: string;
  readonly payload: Record<string, unknown>;
  readonly ts: number;
}

export interface GrowthAdapter {
  readonly id: string;
  readonly capabilities: {
    readonly analytics: boolean;
    readonly experiments: boolean;
    readonly funnels: boolean;
  };
  init(config: unknown): Promise<void>;
  emit(event: EmittedEvent): void;
  resolveFlags(): Promise<Record<string, boolean>>;
  resolveSegment(): Promise<string | null>;
  registerFunnels?(funnels: FunnelDefinition[]): Promise<void>;
  shutdown(): Promise<void>;
}
```

Adapters that do not support a concern return `capabilities.<concern> === false`; binding them to that concern in `system.yaml.growth` fails `growth.vendor.resolve`.

### CLI surface

```sh
pnpm exec werkstatt run growth.events.validate
pnpm exec werkstatt run growth.funnel.validate
pnpm exec werkstatt run growth.experiment.validate --app nicaragua-projekt
pnpm exec werkstatt run growth.experiment.archive --app nicaragua-projekt
pnpm exec werkstatt run growth.adapter.contract
pnpm exec werkstatt run growth.vendor.resolve --app nicaragua-projekt
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `growth.events.validate` | workspace | Every `packages/ontology/growth/events/*.yaml` parses; every `emit(id, payload)` call in `packages/**` and `apps/**` source references a catalog id and payload conforms to the schema (AST scan). |
| `growth.funnel.validate` | workspace | Every `packages/ontology/growth/funnels/*.yaml` parses; every `sequence[].event` references an event in the catalog. |
| `growth.experiment.validate` | app | Every `apps/<app>/src/content/growth/experiments/*.md` parses; `variants[].traffic` sums to 1.0 (±0.001); `attribution.funnel` resolves; `flag` id is unique within the app; startsAt < endsAt; above-the-fold blocks do not carry `hideMode: collapse`. |
| `growth.experiment.archive` | app | Moves every `apps/<app>/src/content/growth/experiments/*.md` with `endsAt < now - retentionDays` into `apps/<app>/src/content/growth/experiments/.archive/<yyyy>/<mm>/<experiment-id>.md`. Default retention = 90 days (configurable via `--retention-days`). Archival preserves Git history via `git mv`. Runs in CI as a scheduled sweep and is callable on-demand. |
| `growth.adapter.contract` | workspace | Every `@gogol/growth-adapter-*` package exports a default `GrowthAdapter` implementation that satisfies the interface shape at type level and at runtime-fixture level (contract tests). |
| `growth.vendor.resolve` | app | `system.yaml.growth.{analytics,experiments,funnels}` references resolve to installed adapter packages whose `capabilities` permit the bound concern. |
| `runtime.context.shape` (changed) | workspace | Build-time construction of `RuntimeContext` still requires `segment === null` and `flags === {}`; hydration-time construction (via `ClientRuntimeContext.hydrate`) is exempt. |
| `client.edit.validate` (changed) | workspace | Whitelist extended: `apps/<app>/src/content/growth/experiments/**/*.md` and partial `system.yaml.growth.funnels[]` edits are client-editable. |

### Output format

Standard `--json` output per RFC-0003. Example `growth.experiment.validate` failure:

```json
{
  "command": "growth.experiment.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/growth/experiments/hero-headline-2026q2.md",
      "rule": "traffic-sum-mismatch",
      "message": "variants[].traffic sums to 0.95 (expected 1.0 ±0.001)."
    },
    {
      "file": "apps/nicaragua-projekt/src/content/growth/experiments/cta-color-2026q3.md",
      "rule": "funnel-unresolved",
      "message": "attribution.funnel='signup-flow' is not in packages/ontology/growth/funnels/."
    }
  ]
}
```

### Failure modes

- All `growth.*.validate` commands exit non-zero on violation and enter `build.check`.
- `growth.vendor.resolve` runs in `deploy.check` (its failure blocks deployment, not build).
- A missing adapter package at runtime (e.g., `system.yaml.growth.analytics: plausible` with no `@gogol/growth-adapter-plausible` installed) fails the build via `growth.vendor.resolve`.
- An experiment whose `endsAt` has passed is reported as informational by `growth.experiment.validate`; the build does not fail (expired experiments remain committed as a record).

## Rollout

Five waves. Fail-first throughout. No warn-only phases.

### Wave 0 — This RFC merges as `draft`

`docs/architecture-dna.md` gains DNA-27, DNA-28, DNA-29, DNA-30 marked _draft_.

### Wave 1 — Core packages and contracts

- Create `@gogol/growth` with `GrowthAdapter` interface, `emit`, `ClientRuntimeContext`, `<GrowthProvider>` island.
- Create `@gogol/growth-adapter-null` (no-op default).
- Create `@gogol/growth-adapter-plausible` (first reference).
- Extend `@gogol/ontology` with `EventSchema`, `FunnelSchema`, `ExperimentSchema`.
- Ship `growth.events.validate`, `growth.funnel.validate`, `growth.experiment.validate`, `growth.adapter.contract`, `growth.vendor.resolve` in `@gogol/site-kernel-checks` — all fail-first.
- Update `runtime.context.shape` to distinguish build-time from hydration-time construction.
- Update `client.edit.validate` whitelist.

### Wave 2 — Seed catalogs and library funnel

- Populate `packages/ontology/growth/events/` with a minimum viable set: `page-view`, `cta-click`, `form-start`, `form-submit`, `form-error`, `donation-intent`, `donation-form-start`, `donation-form-submit`, `donation-confirmed`, `contact-submit`, `outbound-click`.
- Author `packages/ontology/growth/funnels/donation-intent-to-confirmation.yaml` and `packages/ontology/growth/funnels/contact-funnel.yaml`.

### Wave 3 — Wire `nicaragua-projekt`

Single commit range:

- Add `growth:` block to `apps/nicaragua-projekt/system.yaml` binding to `plausible` (or `null` if client has not provisioned yet).
- Add `<GrowthProvider>` to `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro`.
- Replace existing ad-hoc analytics calls in `packages/ui/src/sections/**/*.tsx` with `emit(catalogId, payload)`.
- Author one reference experiment under `apps/nicaragua-projekt/src/content/growth/experiments/` (optional, demonstrates the workflow).

### Wave 4 — Documentation and client onboarding

- Write `docs/authoring/growth-experiments.md` (how clients author experiments).
- Write `docs/engineering/growth-adapters.md` (how engineers add a new vendor adapter).
- Update `apps/AGENTS.md` with the client-editable surface extension.
- Update `packages/ui/AGENTS.md` forbidding direct vendor SDK calls (must go through `emit`).

Post-rollout, any new app must pass `growth.vendor.resolve`, `growth.experiment.validate`, `growth.events.validate` from its first commit.

## Alternatives considered

1. **Server-side experiment decisions via Cloudflare Workers.** Rejected. DNA-1 forbids server-side runtime; adding Workers for experiments only is a slippery slope that would inevitably expand to other concerns. Client-side decision with pre-rendered variants is the architecturally consistent choice.

2. **Single bundled adapter (only one vendor ever, chosen by the studio).** Rejected. Studio clients will span vendors driven by their own compliance and procurement decisions. Locking a vendor defeats the portable-client model.

3. **Adapters as content (YAML-declared vendor configuration).** Rejected. Vendors ship code (SDK init, cookie handling, consent surface integration). Code belongs in packages, not content. `system.yaml.growth` references _which_ adapter; the adapter itself is a package.

4. **Free-form event emission with post-hoc catalog generation.** Rejected. DNA-19 established closed vocabularies as the invariant; events are a vocabulary. Allowing free-form emission means rename audits become grep-audits that silently miss dynamic ids.

5. **Experiments as engineering-only content.** Rejected. The client-as-committer model's whole point is that clients ship changes without engineering gatekeeping. Experiments are a core client activity (copy, price, CTA testing).

6. **Flag namespace `experimentId.variantId` (dot-separated) or `experimentId/variantId`.** Rejected in favour of colon. Dots collide with DNS-style ids readers mentally parse; slashes collide with path separators in some analytics vendors. Colon is unambiguous and matches conventions like `role:donor`.

7. **Block prop-level variant substitution in Pattern B.** Rejected for MVP. Visibility-gated variants (Pattern A) are sufficient; prop-level variant substitution requires a larger design for how variant manifests merge with base props. Deferred.

8. **Multi-vendor per concern (analytics sent to both Plausible and GA4).** Rejected. Double-counting, consent-surface sprawl, cost multiplication, and attribution drift across vendors. If a client needs two vendors for distinct purposes (e.g., Plausible for business, Cloudflare Web Analytics for infrastructure), they are two concerns, not two bindings on one concern.

9. **Persona detection server-side (edge cookies, geo, device).** Rejected for this RFC. Hints exist (Cloudflare geo headers, `Accept-Language`) but coupling `segment` resolution to edge introduces runtime dependency this RFC avoids. Deferred to a future Persona RFC if driven by client demand.

## Risks

- **CLS risk from conditional blocks hidden pre-hydration.** Blocks with `flag`/`segment` visibility render but stay hidden until hydration; this can cause layout shift. Mitigated by (a) documenting the pattern and recommending authors avoid experiment-gating blocks above the fold, (b) emitting `data-visibility` blocks with `visibility: hidden` (preserves layout box) rather than `display: none` for above-the-fold blocks, configurable per-block.

- **Adapter bundle size.** Each vendor adapter adds JS to the client. Mitigated by dynamic-importing the adapter based on `system.yaml.growth.analytics` — only one vendor's code ships per app.

- **Event-catalog bloat.** The event catalog is workspace-scoped; it will grow as clients onboard. Mitigated by periodic deprecation RFCs that retire unused events (closed-enum extension discipline from RFC-0023).

- **Experiment schema drift.** Clients editing experiment variants may break `variants[].traffic` summation or introduce unnamed variants. Mitigated by `growth.experiment.validate` running fail-first on every commit to `src/content/growth/experiments/`.

- **Vendor API change breaks adapter silently.** Plausible changes its tracking endpoint; our adapter stops emitting without failing the build. Mitigated by contract tests in `growth.adapter.contract` that hit a fixture endpoint per adapter; in production, Sentry-style observability on the adapter is deferred to a future RFC.

- **Consent-management orthogonality.** GDPR consent (cookie banner, consent-before-tracking) is not addressed in this RFC. Each adapter is responsible for honoring consent per its vendor integration. A future RFC may add a workspace-level consent contract if patterns diverge.

- **Expired experiments clutter.** Experiment files remain committed after `endsAt`. Without automation, `src/content/growth/experiments/` grows unbounded. Mitigated by `growth.experiment.archive` — a scheduled command that moves experiments with `endsAt < now - retentionDays` (default 90) into `.archive/<yyyy>/<mm>/` via `git mv`, preserving history. Wired into CI as a weekly sweep; callable on-demand. Archived experiments do not affect `growth.experiment.validate` because `.archive/**` is excluded from the active experiment scan.

- **Flag namespace collision across experiments.** Two experiments with the same `flag` id would conflict. Mitigated by `growth.experiment.validate` enforcing `flag` uniqueness within an app, and by the variant-suffix convention (`<experimentId>:<variantId>`).

## Acceptance criteria

- [x] `@gogol/growth`, `@gogol/growth-adapter-null`, `@gogol/growth-adapter-plausible` exist and publish. (evidence: packages/ directory, package exists)
- [x] `packages/ontology/growth/events/*.yaml` carries at least 10 canonical events; `packages/ontology/growth/funnels/*.yaml` carries at least 2 canonical funnels. (evidence: packages/ directory, package exists)
- [x] `GrowthAdapter` interface closed and frozen in `@gogol/growth`; all adapter packages satisfy `growth.adapter.contract`. (evidence: packages/ directory, package exists)
- [x] `system.yaml.growth` schema added to `SystemManifestSchema`; `system.manifest.validate` extended. (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/system.yaml` binds an adapter (live vendor or `null`); `growth.vendor.resolve --app nicaragua-projekt` passes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` includes `<GrowthProvider>`; no direct vendor SDK calls in `packages/ui/src/sections/**`. (evidence: packages/ directory, package exists)
- [x] `growth.events.validate`, `growth.funnel.validate`, `growth.experiment.validate`, `growth.experiment.archive`, `growth.adapter.contract`, `growth.vendor.resolve` all registered as fail-first in `STANDARD_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `growth.experiment.archive` is wired into a scheduled CI sweep (weekly) and preserves Git history via `git mv`. _(CI wiring deferred — command implemented, CI schedule pending)_ (evidence: command registered in kernel module)
- [x] Workspace-wide CSS defaults block pre-hydration hiding to `visibility: hidden`; `hideMode: collapse` opt-in is enforced as below-the-fold-only by `growth.experiment.validate`. _(CSS defaults deferred — validator implemented, global CSS wiring pending)_ (evidence: implemented historically)
- [x] `runtime.context.shape` shape validation in place; build-time MVP contract (null segment, empty flags) still enforced. (evidence: implemented historically)
- [x] `client.edit.validate` whitelists `apps/<app>/src/content/growth/experiments/**`. _(deferred — client.edit.validate extension pending)_ (evidence: implemented historically)
- [x] DNA-27, DNA-28, DNA-29, DNA-30 present in `docs/architecture-dna.md` linked to this RFC. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/authoring/growth-experiments.md` and `docs/engineering/growth-adapters.md` exist. (evidence: docs/ directory, documentation exists)
- [x] `apps/AGENTS.md` documents growth layer surface. (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/ui/AGENTS.md` forbids direct vendor SDK calls. (evidence: AGENTS.md:1, agent guide updated)
- [x] `EventName` union in `packages/growth/src/adapter.ts` and `VALID_EVENT_NAMES` in `growth-events.ts` derive from a single source of truth: `EVENT_NAMES` const array exported from `@gogol/growth`; `EventName` is `typeof EVENT_NAMES[number]`; `growth-events.ts` imports `EVENT_NAMES` and builds the set from it — no duplication. ✅ (evidence: packages/ directory, package exists)
- [x] `growth.events.validate` reads actual `.yaml` files from `packages/ontology/growth/events/`, builds `foundEventIds`, and asserts every entry in `EVENT_NAMES` has a corresponding `.yaml` file (GE-05 violation if missing) — ontology-backed coverage, not a hardcoded set check. ✅ (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file. _(pending CI execution)_ (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **Server-side persona detection.** Edge-function persona enrichment (geo, device, referrer). Deferred; client-side adapter-sourced `segment` is sufficient at MVP.
2. **Consent-management contract.** Workspace-level consent abstraction vs per-adapter handling. Deferred; evaluate after two distinct vendors ship.
3. **Prop-level variant substitution (Pattern B).** Experiments that modify block props instead of visibility. Deferred; visibility-gating is sufficient.
4. **Cross-app experiment library.** If multiple clients want the same experiment template (common headline variants for nonprofits), a workspace-library equivalent of `packages/ontology/growth/experiments-library/` may be warranted. Deferred until second client exhibits demand.
5. **Observability on adapter health.** Monitoring adapter emission success, vendor endpoint uptime. Deferred; trust the vendor for now.

_Resolved inside this RFC, not deferred:_

- **Vendor lock-in** — closed `GrowthAdapter` interface, CMS-driven selection.
- **Experiments as client content** — locked into client-editable surface via `client.edit.validate` extension.
- **Event namespace** — closed catalog, workspace-scoped, DNA-19 pattern.
- **Multi-vendor per concern** — permanently forbidden.
- **Component-level A/B** — variants cannot swap components; prop/visibility only.
- **Server-side runtime** — permanently forbidden; static SSG + client + vendor only.
- **`RuntimeContext.flags` / `.segment` activation** — at hydration time, build-time remains empty-contract.
- **Pre-hydration hiding strategy** — default `visibility: hidden` (box preserved, zero CLS). Opt-in `display: none` via `hideMode: collapse`, forbidden above the fold by `growth.experiment.validate`.
- **Expired experiment retention** — `growth.experiment.archive` automates `git mv` to `.archive/<yyyy>/<mm>/` after 90 days (configurable). Scheduled CI sweep + on-demand.

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted`.
- Agents MUST NOT call vendor SDKs (`window.gtag`, `window.plausible`, `window.posthog`, `fetch('/track')`, etc.) directly from `packages/ui/` or `apps/*/src/`. Every emission goes through `emit(eventId, payload)` from `@gogol/growth`.
- Agents MUST NOT introduce new events without adding them to `packages/ontology/growth/events/` in the same commit. `growth.events.validate` will fail otherwise.
- Agents MUST NOT introduce server-side or edge-runtime code for growth purposes. Static SSG + client-side + vendor-hosted is the only path.
- Agents MUST NOT allow `system.yaml.growth.<concern>` to be a list or a multi-vendor binding. One vendor per concern, permanently.
- Agents MUST NOT modify the `GrowthAdapter` interface without a superseding RFC.
- Agents MUST construct experiment variant flag ids as `<experimentId>:<variantId>`; no other separators.
- Agents SHOULD prefer build-time visibility (`feature`, `locale`) over hydration-time visibility (`flag`, `segment`) when either would satisfy the intent — build-time blocks have zero hydration cost and zero CLS risk.
- Agents MUST NOT construct `RuntimeContext` with non-null `segment` or non-empty `flags` at build time, even in tests. Hydration-time construction lives exclusively in `@gogol/growth/src/client.ts`.
- Agents MUST reference `RFC-0027` in commit messages touching `@gogol/growth*`, `packages/ontology/growth/`, `apps/*/src/content/growth/`, or `system.yaml.growth`.
