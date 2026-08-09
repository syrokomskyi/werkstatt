---
id: RFC-0468
title: "Warpgogol PBP Content Creation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: app
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-20
updatedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-20
  - DNA-55
  - RFC-0398
  - RFC-0461
  - RFC-0462
  - RFC-0466
  - RFC-0467
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-20
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "business-profile/de/ content tree created in systems/warpgogol-com/src/content/"
  - "All PBP entity .md files validate against Zod schemas from RFC-0466"
  - "compilePbpProfile produces 0 fatal errors in migration strictness"
  - "Owner decision register created with all 28 blocking items"
  - "PbpMigrationCoverageReport shows 100% coverage of 19 legacy source files"
  - "Buyer View assembles for Digitales Fundament offering"
  - "First-year cost derivation produces correct results (1040 EUR monthly, 900 EUR yearly)"
nonGoals:
  - "Does not define Zod schemas — that is RFC-0466"
  - "Does not implement the compiler — that is RFC-0467"
  - "Does not switch the site from @gogol/business to @gogol/pbp — that is RFC-0469"
  - "Does not delete legacy files — that is RFC-0470"
  - "Does not resolve owner decisions — this RFC creates the register and marks draft entities"
  - "Does not create non-German locale files beyond structural stubs — localization is Phase 18"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: file-exists
#     path: "systems/warpgogol-com/src/content/business-profile/de/organization/business.md"
#   - probe: file-exists
#     path: "systems/warpgogol-com/src/content/business-profile/de/catalog/offerings/digital-foundation.md"
#   - probe: file-exists
#     path: "systems/warpgogol-com/src/content/business-profile/de/catalog/policies/delivery-guarantee.md"
#   - probe: file-exists
#     path: "systems/warpgogol-com/src/content/business-profile/de/trust/claims/platform-cost-models.md"
---

## Design

**Normative source references:**

- `pbp-specification-package/04-Warpgogol-Migration-Agent-Plan.md` — 20-phase migration plan, owner decisions, legacy deletion manifest
- `pbp-specification-package/05-Warpgogol-Target-Manifest-Blueprint.md` — target entity manifests with exact field values
- `systems/warpgogol-com/src/content/business/de/` — 19 legacy source files to migrate

_This RFC creates the PBP content tree for warpgogol-com: all entity `.md` files, the owner decision register, and the migration coverage report. It transforms legacy `@gogol/business` data into the PBP entity graph defined by RFC-0398..0462 and validated by RFC-0466/0467._

# RFC-0468: Warpgogol PBP Content Creation

## Context

The Warpgogol target manifest blueprint (`05-Warpgogol-Target-Manifest-Blueprint.md`) defines the exact target state for all PBP entities after migration. The migration agent plan (`04-Warpgogol-Migration-Agent-Plan.md`) defines a 20-phase process with 28 blocking owner decisions. Neither document has been materialized into actual `.md` content files.

The legacy content tree at `systems/warpgogol-com/src/content/business/de/` contains 19 source files (company.md, offer.md, contact.md, legal.md, location.md, web.md, compliance.md, external-services.md, meta.md, platform-comparison.md, services.md, plus FAQ and people files). These use the `@gogol/business` schema format with presentation-ready strings (`"70 € / Monat"`), growth modules, capacity blocks, and claims sidecars.

This RFC creates the new `business-profile/` content tree alongside the legacy `business/` tree. Both coexist until RFC-0469 (Site Cutover) switches the site and RFC-0470 (Legacy Deletion) removes the old files.

## Problem

1. **No PBP content tree.** `systems/warpgogol-com/src/content/business-profile/` does not exist. No PBP entity `.md` files exist for Warpgogol.
2. **Legacy data not transformed.** Legacy fields like `price.monthly: "70 € / Monat"` need to be decomposed into `pricing.charges.monthlySubscription.amount.value: "70.00"` + `pricing.charges.monthlySubscription.recurrence: "P1M"` + `pricing.currency: "EUR"`.
3. **Growth modules not decomposed.** Legacy `growthModules.visibility/booking/trust/multilingual/automation` need to become separate Product + CatalogEntry + Offering entities.
4. **Guarantees not typed.** Legacy `guarantees.delivery/uptime/smallChanges/response/dataPackage` need to become typed Policy entities (guarantee, service-level, exit).
5. **Claims not separated.** Legacy `*.claims.yaml` sidecars need to become Claim + EvidenceSource entities.
6. **Owner decisions not tracked.** 28 blocking decisions from the migration plan need a formal register.
7. **Migration coverage not reported.** `PbpMigrationCoverageReport` (RFC-0462) needs to be populated showing 100% coverage of 19 legacy files.

## Decision

### 1. Content tree structure

Create `systems/warpgogol-com/src/content/business-profile/de/` with the following structure (mirroring the blueprint §2–33):

```
systems/warpgogol-com/src/content/business-profile/
  de/
    organization/
      business.md              # PbpBusiness (§3)
      brand.md                 # PbpBrand (§4)
      legal-identity.md        # PbpLegalIdentity (§5)
    places/
      backnang.md              # PbpPlace (§6)
    contact/
      general-email.md         # PbpContactPoint (§7)
    web/
      primary.md               # PbpWebPresence (§8)
    catalog/
      catalog.md               # PbpCatalog (§9)
      entries/
        digital-foundation.md  # PbpCatalogEntry (§12)
        visibility.md          # PbpCatalogEntry (§15)
        booking.md             # PbpCatalogEntry (§16)
        reputation.md          # PbpCatalogEntry (§17)
        multilingual.md        # PbpCatalogEntry (§18)
        automation.md          # PbpCatalogEntry (§19)
    products/
      digital-foundation.md    # PbpProduct (§10)
      business-website.md      # PbpProduct (§11)
      website-operation.md     # PbpProduct (§11)
      visibility.md            # PbpProduct (§15)
      booking.md               # PbpProduct (§16)
      reputation.md            # PbpProduct (§17)
      multilingual.md          # PbpProduct (§18)
      automation.md            # PbpProduct (§19)
    offerings/
      digital-foundation.md    # PbpOffering (§13)
      visibility.md            # PbpOffering (§15)
      booking.md               # PbpOffering (§16)
      reputation.md            # PbpOffering (§17)
      multilingual.md          # PbpOffering (§18)
      automation.md            # PbpOffering (§19)
    policies/
      delivery-guarantee.md    # PbpPolicy kind=guarantee (§20)
      availability-sla.md      # PbpPolicy kind=service-level (§21)
      small-changes.md         # PbpPolicy kind=service-level (§22)
      support-response.md      # PbpPolicy kind=service-level (§23)
      ownership.md             # PbpPolicy kind=ownership (§24)
      portability.md           # PbpPolicy kind=portability (§25)
      exit-package.md          # PbpPolicy kind=exit (§25)
      cancellation.md          # PbpPolicy kind=cancellation
      renewal.md               # PbpPolicy kind=price-changes
      price-changes.md         # PbpPolicy kind=price-changes
      backup-retention.md      # PbpPolicy kind=data-retention (§26)
    trust/
      claims/
        platform-cost-models.md  # PbpClaim (§27)
      evidence/
        platform-pricing-sources.md  # PbpEvidenceSource (§28)
      disclosures/
        cloudflare.md          # PbpDisclosure (§29)
    documents/
      terms.md                 # PbpPublicDocument (§30)
      privacy.md               # PbpPublicDocument
      imprint.md               # PbpPublicDocument
      legal-notice.md          # PbpPublicDocument
  uk/
    organization/
      business.md              # locale override: name, summary, description, mission
    catalog/
      products/
        digital-foundation.md  # locale override: name, summary, purpose, outcomes (§31)
```

### 2. Entity creation phases

Content creation follows the 20-phase migration plan (§3–26 of `04-Warpgogol-Migration-Agent-Plan.md`):

#### Phase 1–2: Preparation and inventory

- Create migration branch `pbp-migration-warpgogol`
- Snapshot legacy source files (git tag `legacy-snapshot-pre-pbp`)
- Inventory all 19 legacy files and classify each source field
- Create `PbpMigrationMapping` records (RFC-0461) for each legacy entity → PBP entity

#### Phase 3: Organization

Create `de/organization/business.md` from `company.md`:

- `company.businessType` → `businessModel.typeRef`
- `company.industry` → `industries.webEngineering.categoryRef`
- `company.market` → `markets.b2b.valueRef`
- `company.foundingYear` → `yearEstablished`
- `company.description` → `description`
- `company.mission` → `mission`
- `company.brand` → separate `brand.md` entity
- `company.areaServed` → removed (territory is on Offering, not Business)
- `company.mode: bodenstation` → removed (design system, not PBP)

Create `de/organization/brand.md` from `company.md`:

- `company.brand.name` → `name`
- `company.tagline` → `tagline`
- `company.brand.author` → removed (belongs to LegalIdentity.responsiblePerson)

Create `de/organization/legal-identity.md` from `legal.md`:

- `legal.legalName` → `legalName`
- `legal.responsiblePerson` → `responsiblePerson.name`
- Tax number, bank data → excluded (private, ADR-036)
- `status: draft` — blocked by owner decision #1 (public legal form)

#### Phase 4: Place and territory

Create `de/places/backnang.md` from `location.md`:

- `location.street`, `location.streetNumber`, `location.postalCode`, `location.locality`, `location.administrativeArea`, `location.countryCode` → `address.*`
- `location.serviceArea` → removed (territory is on Offering)
- `status: draft` — blocked by owner decision #2 (public registered address approval)

#### Phase 5: Contact and web presence

Create `de/contact/general-email.md` from `contact.md`:

- `contact.email` → `value: hi@warpgogol.com`, `channel: email`
- `contact.purposes` → `purposes.*.valueRef`

Create `de/web/primary.md` from `web.md`:

- `web.canonicalUrl` → `canonicalUrl: https://warpgogol.com/`
- `web.locales` → `locales.*`

#### Phase 6: Product decomposition

Create 8 Product entities from `services.md` and `offer.md`:

- `digital-foundation.md` — `kind: composite-service`, with `intrinsicComposition` linking `business-website` and `website-operation`
- `business-website.md` — `kind: digital-good`
- `website-operation.md` — `kind: service`
- `visibility.md` — `kind: service`
- `booking.md` — `kind: service`
- `reputation.md` — `kind: service` (machine key `reputation`, localized name `Vertrauen aufbauen`)
- `multilingual.md` — `kind: service`
- `automation.md` — `kind: service`

#### Phase 7: Catalog and catalog entries

Create `de/catalog/catalog.md` — single `PbpCatalog` entity with `entrySource.mode: manifest-directory`.

Create 6 `PbpCatalogEntry` entities, one per product, with:

- `catalogRef` → `https://warpgogol.com/id/catalog/main`
- `itemRef` → corresponding product
- `offeringRefs` → corresponding offering
- `merchandising.featured: true` for `digital-foundation`

#### Phase 8: Main offering migration

Create `de/offerings/digital-foundation.md` from `offer.md`:

- `offer.price.monthly: "70 € / Monat"` → `pricing.charges.monthlySubscription.amount.value: "70.00"`, `pricing.charges.monthlySubscription.recurrence: "P1M"`, `pricing.currency: "EUR"`
- `offer.price.yearly: "700 € / Jahr"` → `pricing.charges.yearlySubscription.amount.value: "700.00"`, `pricing.charges.yearlySubscription.recurrence: "P1Y"`
- `offer.price.setup: "200 €"` → `pricing.charges.activation.amount.value: "200.00"`, `pricing.charges.activation.type: "one-time"`
- `offer.changePrice: "15"` → `pricing.charges.additionalSmallChange.amount.unitValue: "15.00"`, `pricing.charges.additionalSmallChange.type: "usage"`
- `offer.includedChangesPerCycle: "1"` → `package.allowances.smallChanges.includedQuantity.value: "1"`, `package.allowances.smallChanges.resetPeriod: "P1M"`
- `offer.hourlyRate: "90"` → excluded (owner decision #10)
- `offer.capacity` → excluded (runtime overlay, not static PBP)
- `offer.billingDay: "1"` → `pricing.plans.monthly.billing.billingDay: 1`
- `offer.growthModules.*` → separate Offering entities (Phase 9)
- `offer.guarantees.*` → separate Policy entities (Phase 10)

#### Phase 9: Module offering migration

Create 5 module Offering entities (visibility, booking, reputation, multilingual, automation):

- Each with `businessRef`, `catalogEntryRef`, `pricing`, `relatedOfferings` (requires `digital-foundation`)
- `visibility`: `pricing.charges.monthlySubscription.amount.value: "29.00"`, `recurrence: "P1M"`
- `booking`: `pricing.charges.monthlySubscription.amount.value: "29.00"`, `recurrence: "P1M"`
- `reputation`: `pricing.charges.monthlySubscription.amount.value: "19.00"`, `recurrence: "P1M"`
- `multilingual`: `pricing.charges.pageLanguageSetup.amount.unitValue: "129.00"` (usage), `pricing.charges.languageSubscription.amount.unitValue: "29.00"` (usage-recurring, `recurrence: "P1M"`)
- `automation`: `pricing.charges.monthlySubscription.amount.model: "range"`, `minimum: "59.00"`, `maximum: "199.00"`, `recurrence: "P1M"`, `determination.method: "individual-assessment"`, `determination.beforePurchase: true`

#### Phase 10: Policies from guarantees

Create 11 Policy entities from `offer.md` `guarantees` block:

- `delivery-guarantee.md` — `kind: guarantee`, condition: 12 business days, remedy: continued-performance
- `availability-sla.md` — `kind: service-level`, objective: 99% availability, remedy: service-credit (1 billing period)
- `small-changes.md` — `kind: service-level`, objective: 48 hours, remedy: free-next-unit
- `support-response.md` — `kind: service-level`, objective: 24 hours, remedy: not-declared
- `ownership.md` — `kind: ownership`, assets: domain/customer, content/built-website → customer, source-code → customer (owner decision #20)
- `portability.md` — `kind: portability`, supported: true, assets transferable
- `exit-package.md` — `kind: exit`, trigger: owner decision, delivery: PT72H, package: domain + content + website
- `cancellation.md` — `kind: cancellation`, notice period: owner decision #8
- `renewal.md` — `kind: price-changes`, renewal mode: automatic (owner decision #7)
- `price-changes.md` — `kind: price-changes`, owner decision required
- `backup-retention.md` — `kind: data-retention`, duration: P30D, method: rolling-window

#### Phase 11: Capacity removal

`offer.md` `capacity` block is NOT migrated to static PBP. It becomes a runtime overlay (Wave 3, RFC-0421). The compiler (RFC-0467) Phase 8 stubs this.

#### Phase 12: Claims and evidence

Create `de/trust/claims/platform-cost-models.md` from `platform-comparison.md`:

- `claimClass: comparative-commercial`, `claimKind: risk`
- `subject.kind: competitor-category`, `subject.name: Handwerker-Vermittlungsplattformen`
- `evidenceRefs` → `platform-pricing-sources.md`
- `status: draft` — blocked by owner decision #26 (exact sources)

Create `de/trust/evidence/platform-pricing-sources.md`:

- `kind: external-web-sources`
- `items: {}` — exact verified source records required

#### Phase 13: Compliance and public documents

Create 4 `PbpPublicDocument` entities from `legal.md` and `compliance.md`:

- `terms.md` — `kind: terms-and-conditions`, `canonicalUrl: https://warpgogol.com/agb/`
- `privacy.md` — `kind: privacy-policy`, `canonicalUrl: https://warpgogol.com/datenschutz/`
- `imprint.md` — `kind: imprint`, `canonicalUrl: https://warpgogol.com/impressum/`
- `legal-notice.md` — `kind: legal-notice`

#### Phase 14: Disclosures

Create `de/trust/disclosures/cloudflare.md` from `external-services.md`:

- `kind: technology-dependency`
- `statement: Für die technische Bereitstellung werden Dienste von Cloudflare verwendet.`
- `materiality: informative`
- `publication.required: false` — owner decision #29

Do NOT automatically publish CRM, automation, and internal framework choices.

#### Phase 15: Localization

Create `uk/` locale overrides for:

- `organization/business.md` — name, summary, description, mission in Ukrainian
- `catalog/products/digital-foundation.md` — name, summary, purpose, outcomes in Ukrainian (blueprint §31)

No pricing, IDs, categories, or invariant facts are duplicated in locale overrides.

#### Phase 16: Compile and validate

Run `compilePbpProfile` (RFC-0467) with `strictness: "migration"`:

- All entities parse
- No duplicate IDs
- All refs resolve
- No locale suffix IDs
- No presentation-ready money strings in canonical fields
- No `<br>` in data
- No empty strings
- No sensitive data
- No legacy keys
- Plans reference existing Charges
- Optional Offering relations resolve
- Requires/incompatible graph valid
- SLA completeness
- Guarantee remedies
- Claim freshness/evidence
- Buyer View required sections
- First-year cost results (1040 EUR monthly, 900 EUR yearly)
- `sourceRevision` attached

#### Phase 17: Projection equivalence review

Compare old website-facing facts with new projections:

- Legacy `business.offer.price.monthly` → PBP `pricing.charges.monthlySubscription.amount.value` + projection `"70 € / Monat"`
- Legacy `business.offer.guarantees.delivery.label` → PBP `policy.delivery-guarantee.name` + projection
- Legacy `business.company.description` → PBP `business.description` + projection
- Categories: exact-equivalent, semantically-improved, intentionally-removed, requires-owner-decision, unsupported-old-claim

### 3. Owner decision register

Create `systems/warpgogol-com/src/content/business-profile/owner-decision-register.yaml` with all 28 blocking items from the migration plan (§28):

```yaml
# Business/legal
- id: 1
  topic: public-legal-form
  question: "What is the public legal form of Warpgogol?"
  status: open
  blocks: [legal-identity.md]
- id: 2
  topic: public-registered-address
  question: "Is the registered address approved for public publication?"
  status: open
  blocks: [places/backnang.md]
- id: 3
  topic: vat-kleinunternehmer
  question: "Are prices gross, net, tax-exempt or not declared?"
  status: open
  blocks: [offerings/digital-foundation.md, all module offerings]
# ... items 4–28
```

Rules:

- Entities with open blocking decisions have `status: draft`
- Entities with no blocking decisions have `status: published`
- No `TODO`, `TBD`, or `unknown` in published canonical fields — use `not-declared` semantic status
- Agent continues with confirmed entities; blocks only final publication/cutover

### 4. Migration coverage report

Populate `PbpMigrationCoverageReport` (RFC-0462):

```yaml
totalLegacyEntities: 19
mappedEntities: 19
unmappedEntities: []
verifiedEntities: 19
coveragePercentage: 100
```

Legacy source files covered:

1. `company.md` → `business.md` + `brand.md`
2. `offer.md` → `digital-foundation.md` (offering) + 5 module offerings + 11 policies
3. `contact.md` → `general-email.md`
4. `legal.md` → `legal-identity.md` + 4 public documents
5. `location.md` → `backnang.md`
6. `web.md` → `primary.md`
7. `compliance.md` → 4 public documents
8. `external-services.md` → `cloudflare.md` (disclosure)
9. `meta.md` → removed (metadata, not PBP entity)
10. `platform-comparison.md` → `platform-cost-models.md` (claim) + `platform-pricing-sources.md` (evidence)
11. `services.md` → 8 product entities 12–19. FAQ and people files → not migrated to PBP (FAQ is site content, people is future Person entity)

### 5. Entity ID scheme

All entity IDs use HTTPS URIs (blueprint convention):

| Entity            | ID                                                           |
| ----------------- | ------------------------------------------------------------ |
| Business          | `https://warpgogol.com/id/business/warpgogol`                |
| Brand             | `https://warpgogol.com/id/brand/warpgogol`                   |
| LegalIdentity     | `https://warpgogol.com/id/legal-identity/warpgogol`          |
| Place             | `https://warpgogol.com/id/place/backnang`                    |
| ContactPoint      | `https://warpgogol.com/id/contact-point/general-email`       |
| WebPresence       | `https://warpgogol.com/id/web-presence/primary`              |
| Catalog           | `https://warpgogol.com/id/catalog/main`                      |
| Product (DF)      | `https://warpgogol.com/id/product/digital-foundation`        |
| CatalogEntry (DF) | `https://warpgogol.com/id/catalog-entry/digital-foundation`  |
| Offering (DF)     | `https://warpgogol.com/id/offering/digital-foundation`       |
| Policy (delivery) | `https://warpgogol.com/id/policy/delivery-guarantee`         |
| Claim             | `https://warpgogol.com/id/claim/platform-cost-models`        |
| EvidenceSource    | `https://warpgogol.com/id/evidence/platform-pricing-sources` |
| Disclosure        | `https://warpgogol.com/id/disclosure/cloudflare`             |
| PublicDocument    | `https://warpgogol.com/id/document/terms`                    |

Module entities follow the same pattern: `https://warpgogol.com/id/product/visibility`, `https://warpgogol.com/id/offering/visibility`, etc.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Content files live in the site workspace `systems/warpgogol-com/src/content/`. Schemas and compiler live in `packages/pbp/`.
- **DNA-20 (Business layer).** This RFC creates the PBP content that will replace `@gogol/business` content. Both coexist until RFC-0470.
- **DNA-55 (Spec vendoring).** Entity field values reference `pbp-specification-package/target-blueprint` sections.
- **RFC-0461 (Migration contract).** This RFC executes the migration mapping defined by RFC-0461.
- **RFC-0462 (Cutover checklist).** This RFC populates the `PbpMigrationCoverageReport` that RFC-0462 checks.
- **RFC-0466 (PBP Runtime).** Content files validate against Zod schemas from RFC-0466.
- **RFC-0467 (Compiler).** Content files are compiled by `compilePbpProfile` from RFC-0467.

## Implementation details

### CLI surface

No CLI command. Content files are authored manually by the migration agent.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/warpgogol-com/src/content/business-profile/de/**/*.md` | PBP entity content files (default locale) |
| `systems/warpgogol-com/src/content/business-profile/uk/**/*.md` | PBP entity content files (Ukrainian overrides) |
| `systems/warpgogol-com/src/content/business-profile/owner-decision-register.yaml` | Owner decision register (28 items) |
| `systems/warpgogol-com/src/content/business-profile/migration-coverage-report.yaml` | Migration coverage report |
| `systems/warpgogol-com/src/content/business/de/**/*.md` | Legacy content (untouched until RFC-0470) |

### Output format

N/A — content files.

### Failure modes

- Zod schema validation fails: compiler (RFC-0467) reports `PBP-SCHEMA` errors
- Reference resolution fails: compiler reports `PBP-REF` errors
- Owner decisions unresolved: entities stay `status: draft`, cutover blocked
- Migration coverage < 100%: `PbpCutoverChecklist.allEntitiesMapped` is `false`

## Rollout

- **Immediate:** Upon acceptance, the migration agent creates the `business-profile/` content tree.
- **Coexistence:** Legacy `business/` and new `business-profile/` coexist. Site still reads from `business/` until RFC-0469.
- **Owner decisions:** The register is created with all 28 items. Open items block publication of affected entities. The operator resolves items over time; the agent updates entity `status` from `draft` to `published` as decisions are made.
- **Dependency chain:** Depends on RFC-0466 (schemas) and RFC-0467 (compiler). Required by RFC-0469 (cutover).

## Alternatives considered

- **Transform legacy files in-place.** Rejected: the PBP entity structure is fundamentally different (Product/CatalogEntry/Offering decomposition, typed Policies, Claims with Evidence). In-place transformation would break the legacy site during migration.
- **Generate content programmatically.** Rejected: the migration requires semantic decisions (entity decomposition, field classification, owner decisions) that cannot be automated without human judgment. The agent creates draft files; the operator reviews and decides.
- **Skip draft entities.** Rejected: the migration plan (§29) explicitly requires creating valid draft manifests for unresolved items, isolating unresolved facts, and blocking only final publication.

## Risks

- **Incomplete migration.** Some legacy fields may not have clear PBP targets. Mitigation: `PbpMigrationMapping` records track each field; `unmappedEntities` in coverage report.
- **Owner decision latency.** 28 blocking decisions may take time to resolve. Mitigation: draft entities are valid and compilable; only publication is blocked.
- **Content drift.** Legacy files may change during migration. Mitigation: migration branch isolates changes; legacy snapshot tag prevents loss.
- **Entity count.** ~40 entity files is significantly more than 19 legacy files. Mitigation: the entity graph is explicit and machine-validated, reducing long-term maintenance burden.

## Acceptance criteria

- [x] `systems/warpgogol-com/src/content/business-profile/de/` directory created with all entity `.md` files (evidence: 45 .md files across 10 subdirs — 2026-07-20)
- [x] All entity files have valid YAML frontmatter with `schema`, `id`, `type`, `status` fields (evidence: verified — 2026-07-20)
- [x] `organization/business.md` created with fields from `company.md` (evidence: systems/warpgogol-com/src/content/business-profile/de/organization/business.md — 2026-07-20)
- [x] `organization/brand.md` created with fields from `company.md` (evidence: systems/warpgogol-com/src/content/business-profile/de/organization/brand.md — 2026-07-20)
- [x] `organization/legal-identity.md` created with `status: draft` (owner decision #1) (evidence: systems/warpgogol-com/src/content/business-profile/de/organization/legal-identity.md — 2026-07-20)
- [x] `places/backnang.md` created with address from `location.md` (evidence: systems/warpgogol-com/src/content/business-profile/de/places/backnang.md — 2026-07-20)
- [x] `contact/general-email.md` created from `contact.md` (evidence: systems/warpgogol-com/src/content/business-profile/de/contact/general-email.md — 2026-07-20)
- [x] `web/primary.md` created from `web.md` (evidence: systems/warpgogol-com/src/content/business-profile/de/web/primary.md — 2026-07-20)
- [x] `catalog/catalog.md` created (evidence: systems/warpgogol-com/src/content/business-profile/de/catalog/catalog.md — 2026-07-20)
- [x] 6 `PbpCatalogEntry` entities created (one per product) (evidence: catalog/entries/ has 6 files — 2026-07-20)
- [x] 8 `PbpProduct` entities created (DF + 2 components + 5 modules) (evidence: products/ has 8 files — 2026-07-20)
- [x] `offerings/digital-foundation.md` created with decomposed pricing from `offer.md` (evidence: offerings/digital-foundation.md — 2026-07-20)
- [x] 5 module Offering entities created with pricing from `offer.md` growthModules (evidence: offerings/ has 6 files total — 2026-07-20)
- [x] 11 Policy entities created from `offer.md` guarantees block (evidence: policies/ has 11 files — 2026-07-20)
- [x] `trust/claims/platform-cost-models.md` created from `platform-comparison.md` (evidence: trust/claims/ — 2026-07-20)
- [x] `trust/evidence/platform-pricing-sources.md` created (evidence: trust/evidence/ — 2026-07-20)
- [x] `trust/disclosures/cloudflare.md` created from `external-services.md` (evidence: trust/disclosures/ — 2026-07-20)
- [x] 4 `PbpPublicDocument` entities created from `legal.md`/`compliance.md` (evidence: documents/ has 4 files — 2026-07-20)
- [x] `uk/` locale overrides created for `business.md` and `digital-foundation.md` product (evidence: uk/organization/business.md, uk/products/digital-foundation.md — 2026-07-20)
- [x] `owner-decision-register.yaml` created with all 28 blocking items (evidence: missions/warpgogol-com-m000011/workpiece/src/content/business-profile/owner-decision-register.yaml — 2026-07-24)
- [x] `migration-coverage-report.yaml` shows 100% coverage of 19 legacy files (evidence: missions/warpgogol-com-m000011/workpiece/src/content/business-profile/migration-coverage-report.yaml — 2026-07-24)
- [x] `compilePbpProfile` with `strictness: "migration"` produces 0 fatal errors (evidence: compiler-pipeline.test.ts — 2026-07-20)
- [x] First-year cost derivation: monthly = 1040 EUR, yearly = 900 EUR (evidence: PBP content — 2026-07-20)
- [x] Buyer View assembles for `digital-foundation` offering (evidence: compiler buyer-view phase — 2026-07-20)
- [x] No legacy keys (`hourlyRate`, `capacity`, `growthModules`, presentation price strings) in PBP content (evidence: verified — 2026-07-20)
- [x] No `TODO`, `TBD`, or `unknown` in canonical fields — use `not-declared` semantic status (evidence: verified — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (RFC status: implemented) (evidence: pnpm exec site-kernel run rfc.validate RFC-0468, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The migration agent MUST create all content on a dedicated migration branch.
- The migration agent MUST NOT delete legacy files — that is RFC-0470.
- The migration agent MUST NOT modify the site's `content.config.ts` — that is RFC-0469.
- Entities with open blocking owner decisions MUST have `status: draft`.
- No `TODO`, `TBD`, or `unknown` in published canonical fields — use `not-declared` semantic status (RFC-0400).
- The migration agent MUST create `PbpMigrationMapping` records for each legacy entity → PBP entity mapping.
- The migration agent MUST run `compilePbpProfile` with `strictness: "migration"` after each phase to catch errors early.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0468 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
