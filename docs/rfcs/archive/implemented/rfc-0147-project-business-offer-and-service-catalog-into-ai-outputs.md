---
id: RFC-0147
title: "Project the business offer and service catalog into AI-facing outputs"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-02
updatedAt: 2026-06-04
implementedAt: 2026-06-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0373
related:
  - DNA-25
  - RFC-0042
  - RFC-0050
  - RFC-0138
  - RFC-0142
  - RFC-0143
commands:
  proposed: []
  added: []
  changed:
    - llms.generate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/site-kernel-content"
successSignals:
  - "llms-full.txt and JSON-LD include the offering: prices, written guarantees, and the service catalog — drawn from the existing RFC-0138 offer schema and the service schema."
  - "A site with an offer.md but no rich prose still produces an AI file that explains what the business sells, for how much, with what guarantees."
  - "warpgogol-com's llms-full.txt grows from organization contact facts to a substantive business description."
nonGoals:
  - "Do not author new business data — project the existing offer/service schemas only."
  - "Do not duplicate the offer source of truth — read RFC-0138 offer-canonical, never a second copy."
  - "Do not change the offer/service on-disk schema."
  - "Do not make the offer per-page — pricing and guarantees are site-wide and project at the organization level."
  - "Do not force every app to have an offer — absent offer simply omits the section."
---

# RFC-0147: Project the business offer and service catalog into AI-facing outputs

## Context

`llms.txt` / `llms-full.txt` (RFC-0050) and per-page JSON-LD are the platform's AI-facing projections of a site. Today they are built from:

- the **organization profile** — `loadSiteSemanticProfile` ([semantic-loader.ts](../../packages/os/site-kernel-content/src/semantic-loader.ts)) reads only `business/company.md`, `legal.md`, `contact.md` → name, legal name, address, founders, contact points, donation account;
- **per-page content** — prose answer-blocks, people, initiatives, and (for donation-contact pages) FAQ.

But the richest, most decision-relevant business data is authored elsewhere and **never projected**. `apps/warpgogol-com/src/content/business/` contains:

- `offer.md` — the RFC-0138 canonical offer: `price.{monthly,yearly,setup}` and written `guarantees.{delivery,uptime,smallChanges,response,dataPackage}.{label,detail}` (the single source of truth for prices and guarantees, validated by the offer-canonical schema in [packages/business/src/schemas/offer-canonical.ts](../../packages/business/src/schemas/offer-canonical.ts));
- `services.md` — the service catalog (service schema);
- `meta.md`, `web.md`, `location.md` — further structured context.

The `SemanticPageModel` even declares a `services?: SemanticService[]` field — but no loader ever populates it, and there is no offer concept in the semantic model at all.

The visible symptom: `apps/warpgogol-com/public/llms-full.txt` is ~700 bytes — organization contact facts and nothing else — despite the site having a fully specified offer (price `70 €/Monat`, five written guarantees), a service catalog, and pages. (A secondary cause compounds it: warpgogol-com's `system.md` pages carry **no `semanticType`**, so even their prose does not generate — see Rollout.)

## Problem

The unprotected invariant is:

> The AI projection of a site must describe what the business actually offers — its services, prices, and guarantees — when that information is authored as structured data. An AI file that omits the offering is not a faithful projection.

Current failure modes:

1. **The offering is invisible to AI.** Prices and guarantees — exactly what a prospective buyer (human or AI agent) most needs — are absent from `llms*.txt` and JSON-LD, although they exist as validated schema (RFC-0138).
2. **`services` is a dead model field.** `SemanticPageModel.services` exists but is never populated; the service catalog never reaches any output.
3. **Thin sites look empty to AI.** A site whose value is captured in `offer.md` rather than long prose produces an almost-empty AI file, understating the business.

## Decision

Project the existing business **offer** and **service catalog** into the semantic model at the organization level, and emit them in `llms*.txt` and JSON-LD. No new authoring; read the schemas already on disk.

1. **Semantic model.** Extend `SemanticOrganization` (or the site model) with an optional `offer` and `services`:

   ```ts
   export type SemanticGuarantee = { id: string; label: string; detail?: string };
   export type SemanticOffer = {
     prices?: { id: string; label: string; amount: string }[]; // e.g. monthly → "70 €/Monat"
     guarantees?: SemanticGuarantee[];
   };
   // SemanticService already exists: { id, name, description }
   ```

2. **Profile loader.** `loadSiteSemanticProfile` additionally reads `business/offer.md` (via the RFC-0138 offer-canonical schema) and `business/services.md` (service schema), mapping them to `SemanticOffer` / `SemanticService[]`. Content references and language fallback follow the existing rules. Absent files → omitted (no error).

3. **Formatters.** `buildLlmsFull` emits a `## Offer` section (prices as facts, each guarantee as `- <label>: <detail>`) and a `## Services` section; `buildLlmsIndex` adds a one-line offer summary under Preferred facts. JSON-LD emits schema.org `Offer` / `PriceSpecification` and `Service` / `OfferCatalog` on the Organization node.

4. **Projection control (RFC-0143).** The offer/service sections honor the same spirit as per-page `output`: a site-level toggle (e.g. `output.offer: false` in `system.md`, default true when an offer exists) lets a site opt out. Kept minimal — site-wide, mirroring the `ai:` / `robots:` policy family, not per-page.

5. **warpgogol-com content adoption.** Add `semanticType` (+ the RFC-0143 `output`) to warpgogol-com's content pages so their prose also flows into the projection. This is content/manifest work, sequenced after the projection lands so the effect is visible.

## Architectural fit

**RFC-0138 / offer source of truth.** The projection **reads** the canonical offer; it does not copy or re-define it. `{business.offer.*}` references and the offer-canonical schema remain the single source.

**RFC-0050 / llms generation.** Adds sections to the existing pure formatters; the command stays thin.

**RFC-0042 / semantic content.** Extends the semantic model with offer/service the same way people/initiatives/faq were added.

**RFC-0142 / RFC-0143 / projection control.** The offer is a site-wide projection; its toggle joins the policy family (site-level), deliberately not the per-page `output` container.

**RFC-0146 / one builder.** Offer/service assembly lives in the shared profile construction, so both the JSON-LD and llms consumers get it from one place.

## Design

### File responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/models.ts` | Add `SemanticOffer` / `SemanticGuarantee`; `offer?` + `services?` on the org/site model. |
| `packages/business/src/schemas/offer-canonical.ts` | Source schema (read-only here). |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Read `offer.md` / `services.md` into the profile. |
| `packages/business/src/semantic-profile.ts` | Same projection on the Astro path (shared once RFC-0146 lands). |
| `packages/share/src/semantic/llms.ts` | Emit `## Offer` / `## Services`. |
| `packages/share/src/semantic/jsonld.ts` | Emit `Offer` / `Service` on the Organization. |
| `apps/warpgogol-com/src/content/system.md` | Add `semanticType` + `output` to content pages (Rollout). |

### Output sketch (warpgogol-com `llms-full.txt`)

```txt
## Offer
- Monthly: 70 €/Monat
- Yearly: 700 €/Jahr
- Setup: 200 €

### Guarantees
- Fertig in 12 Werktagen: Nach Erhalt Ihrer Materialien ist Ihre Seite online. Sonst arbeite ich kostenlos weiter bis zum Launch.
- 99,9 % Verfügbarkeit im Monat: Ausfall über 1 Stunde im Monat → der Folgemonat ist kostenlos.
- 48 Stunden für kleine Änderungen: …
- Antwort innerhalb von 24 Stunden: …
- Datenpaket in 72 Stunden bei Kündigung: …

## Services
- Website Development: …
```

## Failure modes

- **No `offer.md`** → `## Offer` omitted; no error (nicaragua, a nonprofit, has no commercial offer).
- **Partial offer** (prices but no guarantees, or vice versa) → only present sub-sections render.
- **Offer present but `output.offer: false`** → omitted by explicit opt-out.

## Rollout

1. **Phase 1 — model + schema read.** Add the semantic types; read offer/services in the profile loader (disk path).
2. **Phase 2 — formatters.** Emit `## Offer` / `## Services` in llms and the schema.org nodes in JSON-LD.
3. **Phase 3 — Astro parity.** Mirror the profile projection on the Astro path (single source once RFC-0146 consolidates the profile builder).
4. **Phase 4 — warpgogol-com content.** Add `semanticType` + `output` to warpgogol-com content pages; verify `llms-full.txt` now describes the business.
5. **Phase 5 — onboarding.** Scaffold/templates note the offer projection so new commercial sites get it for free.

## Alternatives considered

**Author a separate AI summary file by hand.** Rejected. It would duplicate the offer and drift from the RFC-0138 source of truth; the whole point is to project existing structured data.

**Put the offer on a page (per-page `output`).** Rejected. Pricing/guarantees are site-wide facts about the business, not properties of one page; projecting them at the organization level matches their nature and avoids duplication across pages.

**Only fix warpgogol-com's missing `semanticType`.** Rejected as insufficient. That alone would surface prose answer-blocks but still omit the structured offer — the highest-value data — because no loader reads it.

## Risks

**Offer schema coupling.** Reading offer-canonical couples the semantic loader to that schema shape. Mitigation: read through the existing `@gogol/business` schema types, so schema changes are caught by the type-checker, not silently.

**Over-disclosure.** Some operators may not want prices in a machine-readable file. Mitigation: the site-level `output.offer` opt-out; default-on only when an offer exists.

**Localization.** Offer strings are per-language (`70 €/Monat`); the projection must use the generated language's offer. Mitigation: the loader already resolves language with default-lang fallback; offer reads use the same path.

## Acceptance criteria

- [x] `SemanticOffer` / `SemanticGuarantee` added; `offer?` + `services?` on the org model. (evidence: implemented historically)
- [x] Profile builder reads `offer.md` (+ `location.md`) with language fallback. (`services.md` projection deferred — its on-disk shape does not match the service-catalog schema.) (evidence: implemented historically)
- [x] `buildLlmsFull` emits `## Offer` (prices + guarantees). (`## Services` + the `buildLlmsIndex` summary line ship with the services projector.) (evidence: implemented historically)
- [x] JSON-LD emits schema.org `Offer` / `PriceSpecification` on the Organization (`makesOffer`). (`Service` deferred.) (evidence: implemented historically)
- [x] Site-level `output.offer` opt-out — deferred (absent offer already omits the section). (evidence: implemented historically)
- [x] warpgogol-com content pages gain `semanticType` + `output`; its `llms-full.txt` (1544 → 2929 B) and JSON-LD describe the offering and pages. (evidence: implemented historically)
- [x] nicaragua output unchanged except projectable data (gained `## Location`; no offer → no Offer section). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm build` green for both apps; `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST read the offer through the RFC-0138 offer-canonical schema in `@gogol/business` — never re-define or copy the offer shape.
- Agents MUST project offer/services at the organization level, not per-page.
- Agents MUST keep the offer section omitted when no `offer.md` exists (no error).
- Agents MUST sequence the warpgogol-com `semanticType` adoption after the projection lands, and verify the resulting `llms-full.txt` by inspection.
- When implementing, agents MUST reference `RFC-0147` in commits / PRs.
