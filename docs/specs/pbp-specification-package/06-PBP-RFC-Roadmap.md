# Public Business Profile — RFC Roadmap

**Документ:** PBP-RFC-ROADMAP  
**Статус:** Planning baseline  
**Дата:** 2026-07-18

---

# 1. Назначение

Этот документ разбивает архитектурную спецификацию PBP на реализуемую серию RFC.

Цель — не написать один огромный RFC, а создать последовательность нормативных документов с явными зависимостями, conformance tests и рабочими поставками.

---

# 2. Принципы RFC-программы

1. Один RFC — одна архитектурная ответственность.
2. Каждый RFC содержит scope, non-goals, terms, schema, invariants, errors, examples и tests.
3. Каждый RFC либо независимо implementable, либо явно ссылается на prerequisites.
4. Naming в `pbp/*@1` фиксируется до production migration.
5. Breaking changes после `@1` запрещены без `@2` migration RFC.
6. Webgogol является первым conformance corpus, но не единственным design case.
7. Перед freeze `@1` обязательны три полюса:
   - Webgogol complex service;
   - minimal one-time physical good;
   - product group with variants and live inventory contract.
8. Каждый RFC получает golden fixtures.
9. Documentation and implementation advance together.
10. Public standardization occurs later, but proprietary implementation must avoid hidden semantics.

---

# 3. Этап A — Foundation freeze

## RFC-PBP-000 — Program Charter and Terminology

**Цель:** зафиксировать название PBP, scope, normative language, layers, entity glossary.

**Содержит:**

- Business/Profile/Catalog/Product/Offering distinctions;
- canonical vs projection;
- static vs runtime;
- public vs private;
- declared/derived/missing states.

**Блокирует:** все остальные RFC.

## RFC-PBP-001 — Namespace, Entity Envelope and URI Policy

**Содержит:**

- `pbp/*@1`;
- common envelope;
- `id`, `type`, `status`, governance;
- URI stability;
- no locale in ID;
- authorityRef;
- lifecycle status.

**Tests:** duplicate ID, invalid URI, type mismatch.

## RFC-PBP-002 — Primitive Types and Controlled Vocabularies

**Содержит:**

- Decimal;
- Money;
- MoneyRange;
- Duration;
- QuantitativeValue;
- Timestamp;
- EntityRef;
- SemanticStatus;
- UnitDefinition;
- MetricDefinition;
- IdentifierScheme.

**Decision:** ISO/RFC mappings and custom extension namespace.

## RFC-PBP-003 — Schema Evolution and Compatibility

**Содержит:**

- `@1` freeze rules;
- additive changes;
- `@2` requirements;
- migration contracts;
- deprecation policy;
- registry version pinning.

## RFC-PBP-004 — Package and Source Profiles

**Содержит:**

- package manifest;
- locale declaration;
- source adapters;
- manifest storage;
- dataset storage;
- external adapter;
- capability declarations.

---

# 4. Этап B — Business identity

## RFC-PBP-010 — Business

Fields, markets, industries, mission, linked entities.

## RFC-PBP-011 — LegalIdentity and Public/Private Boundary

Public legal facts, private exclusion, billing profile boundary.

## RFC-PBP-012 — Brand and Person Relations

Brand entity; founder/responsible person relations. Person schema can be minimal or deferred.

## RFC-PBP-013 — Place and Territory

Multiple Place roles; address semantics; separate service territories.

## RFC-PBP-014 — ContactPoint

Typed channels, purposes, languages, preferences, derived mailto/QR.

## RFC-PBP-015 — WebPresence

Canonical URL, control, locales, `sameAs`, no domain duplication.

---

# 5. Этап C — Product and catalog core

## RFC-PBP-020 — Federated Product Identity

**Ключевой RFC.**

- Product authority;
- global URI;
- external identifiers;
- identity equivalence;
- no central mandatory Product registry;
- manufacturer/business-owned products.

## RFC-PBP-021 — Category Registry

- Category semantics;
- broader/narrower;
- external taxonomy mappings;
- no comparison dimensions.

## RFC-PBP-022 — Product Schema

- kind;
- purpose;
- outcomes;
- deliverables;
- capabilities;
- intrinsic composition;
- external identifiers.

## RFC-PBP-023 — ProductGroup and ProductVariant

- variation axes;
- axis values;
- variant identity;
- external identifiers per variant;
- Schema.org mapping.

## RFC-PBP-024 — Bundles and Composition

- intrinsic Product bundle;
- component quantity semantics;
- difference from Offering package;
- cycle validation.

## RFC-PBP-025 — Catalog and CatalogEntry

- local registry;
- local SKU;
- merchandising;
- local presentation;
- Product/Variant/Group refs;
- bulk storage support.

---

# 6. Этап D — Offering and pricing

## RFC-PBP-030 — Offering Core

- Business + CatalogEntry;
- audience;
- availability declaration;
- acquisition;
- fulfillment;
- buyer responsibilities;
- terms;
- limitations;
- policy refs.

## RFC-PBP-031 — Offering Relations

Freeze minimal core:

- optional;
- requires;
- incompatibleWith;
- alternativeTo;
- included.

Define acquisition modes and graph validation.

## RFC-PBP-032 — Pricing Core: Charge, Plan, Adjustment

- fixed one-time;
- fixed recurring;
- plan composition;
- currency;
- tax container;
- billing.

## RFC-PBP-033 — Usage, Range and Tiered Pricing

- billable units;
- parameterized pricing;
- range determination;
- graduated vs volume tiers;
- usage parameters.

## RFC-PBP-034 — Allowances, Overage and Deposits

- included quantity;
- reset periods;
- overage charge;
- deposit/refund policy.

## RFC-PBP-035 — Tax and Buyer Presentation

- buyerTypes;
- inclusive/exclusive/exempt;
- jurisdiction;
- B2B/B2C presentation;
- legal review boundary;
- no tax calculation engine in core.

## RFC-PBP-036 — Terms and Commercial Lifecycle

- minimum term;
- renewal;
- cancellation;
- price changes;
- suspension;
- plan overrides.

---

# 7. Этап E — Policies and buyer protection

## RFC-PBP-040 — Policy Base and Scope

Common envelope, applicability, precedence and typed overrides.

## RFC-PBP-041 — Service Level Policy

Metric, threshold, window, method, evidence, exclusions, remedy.

## RFC-PBP-042 — Guarantee and Remedy

Guarantee semantics, remedy types, automatic/manual application.

## RFC-PBP-043 — Ownership, License and Portability

Asset-level ownership, third-party components, license basis, transferability.

## RFC-PBP-044 — Exit and Data Package

Triggers, delivery duration, contents, formats, credentials handling.

## RFC-PBP-045 — Fulfillment, Shipping, Pickup and Return

Physical product baseline and service delivery baseline.

## RFC-PBP-046 — Data Retention and Deletion

Backup retention, legal retention exceptions, deletion lifecycle.

---

# 8. Этап F — Trust and evidence

## RFC-PBP-050 — Claim

Claim classes, statement, subject, scope, governance, staleness.

## RFC-PBP-051 — EvidenceSource

External sources, measurements, registry records, snapshots, source roles.

## RFC-PBP-052 — Disclosure

Material context, allowed kinds, publication requirements, anti-junk-drawer rules.

## RFC-PBP-053 — Credential

Certification, license, qualification, membership, insurance, VC mapping.

## RFC-PBP-054 — Review and AggregateRating

External reviews, permissions, snapshots, source/freshness.

## RFC-PBP-055 — PublicDocument

Document descriptors, dates, URLs, review schedules, relation to content files.

---

# 9. Этап G — Localization and compilation

## RFC-PBP-060 — Localization and Fallback

- BCP 47;
- default locale;
- localizable/invariant fields;
- semantic-key merge;
- arrays;
- null suppression;
- fallback report.

## RFC-PBP-061 — Reference Resolution and Graph Integrity

- internal/external refs;
- expected types;
- cycles;
- authority;
- registry pinning.

## RFC-PBP-062 — Runtime State Overlay

- inventory;
- availability;
- booking;
- TTL;
- allowed overlay paths;
- static/runtime boundary.

## RFC-PBP-063 — Validation and Error Codes

Stable error taxonomy and build severity.

## RFC-PBP-064 — Compiler Pipeline

End-to-end deterministic compilation.

## RFC-PBP-065 — Incremental and Bulk Processing

High-cardinality implementation profile.

---

# 10. Этап H — Derivations and comparison

## RFC-PBP-070 — Derivation Contract

Pure function contract, inputs, units, output modes, provenance, tests.

## RFC-PBP-071 — First-Year Cost and TCO

Reference derivations for pricing.

## RFC-PBP-072 — ComparisonProfile

Dimensions, selectors, units, missing semantics, applicability.

## RFC-PBP-073 — Comparison Projection

Comparability statuses, normalization, no hidden ranking.

## RFC-PBP-074 — Buyer View Schema

Single normative buyer view with 12 sections.

---

# 11. Этап I — Projections

## RFC-PBP-080 — Website Projection Contract

Typed view data; presentation formatting; no raw source paths.

## RFC-PBP-081 — AI Answer Projection

Compact factual output, provenance and missing semantics.

## RFC-PBP-082 — Schema.org Mapping

Product/ProductGroup/Offer/PriceSpecification/Review mappings and loss report.

## RFC-PBP-083 — Quote and Contract Inputs

Snapshot binding, selection parameters, private data boundary.

## RFC-PBP-084 — Invoice Input

Charge descriptors, no invoice state in PBP.

## RFC-PBP-085 — CRM Projection

Stable entity/plan/charge payloads and external ID mapping.

## RFC-PBP-086 — MachineUsePolicy and AI Access Projections

General policy, llms.txt-like outputs, robots/API metadata.

---

# 12. Этап J — History, signatures and Sichtpass

## RFC-PBP-090 — Git Revision and Publication Snapshot

- sourceRevision;
- build metadata;
- resolved snapshot;
- historic lookup.

## RFC-PBP-091 — Canonical Serialization

- JSON transformation;
- RFC 8785 baseline;
- decimal strings;
- excluded metadata;
- canonical digest.

## RFC-PBP-092 — Signature Envelope

Detached signatures, signer, algorithms, verification.

## RFC-PBP-093 — Sichtpass / Verifiable Credential Mapping

PBP snapshot as signed credential/passport.

## RFC-PBP-094 — Registry and Resolver

Optional global index/resolver; no central ownership requirement.

---

# 13. Этап K — Migration

## RFC-PBP-100 — Legacy Extraction Contract

Generic extraction maps from arbitrary source structures.

## RFC-PBP-101 — Normalization Contract

Structured local input → PBP profiles.

## RFC-PBP-102 — Webgogol Legacy Migration

Exact migration from current 19 files.

## RFC-PBP-103 — Migration Coverage and Cutover

Coverage reports, deletion proof, rollback source tag, no compatibility layer.

## RFC-PBP-104 — Shopify/PIM Adapter Profile

First high-cardinality commerce import.

---

# 14. Implementation waves

## Wave 1 — Webgogol core

RFCs:

```text
000, 001, 002, 003, 004,
010, 011, 013, 014, 015,
020, 021, 022, 025,
030, 031, 032, 034, 035, 036,
040, 041, 042, 043, 044, 046,
050, 051, 052, 055,
060, 061, 063, 064,
070, 071, 074,
080, 081, 082, 085,
090,
102, 103
```

**Результат:** Webgogol полностью мигрирован; сайт и AI projection работают из PBP.

## Wave 2 — Service businesses

Добавить:

- deeper policies;
- credentials;
- reviews;
- comparison profiles;
- contract/invoice projections;
- multiple Places.

Проверить на 5–10 разных SME/Handwerk clients.

## Wave 3 — Physical commerce

Добавить:

- ProductGroup/Variant;
- bundles;
- shipping/returns;
- runtime inventory;
- bulk processing;
- Shopify/PIM adapter;
- tax presentation.

Проверить на каталоге 10 000+ SKU.

## Wave 4 — Verification

- canonical snapshots;
- signatures;
- Sichtpass;
- credentials;
- public resolver.

## Wave 5 — Open standard readiness

Trigger:

- 300 clients or earlier technical maturity;
- at least 3 industries;
- independent second implementation;
- large catalog proof;
- stable `@1` period;
- conformance suite complete.

---

# 15. Dependency highlights

```text
Entity Envelope
  ├── Business entities
  ├── Product entities
  └── Catalog entities

Product + CatalogEntry
  └── Offering
       ├── Pricing
       ├── Policies
       └── Buyer View

Derivation Contract
  ├── First-year cost
  ├── ComparisonProfile
  └── Buyer View pricing

Compiler
  ├── Localization
  ├── Reference resolution
  ├── Validation
  └── Projections

Canonical Snapshot
  └── Signature/Sichtpass
```

---

# 16. Required RFC template

Каждый RFC SHOULD иметь:

1. Title and status
2. Problem statement
3. Scope
4. Non-goals
5. Terminology
6. Data model
7. Field table
8. Invariants
9. Algorithms
10. Error cases
11. Security/privacy
12. Localization
13. Examples
14. Counterexamples
15. Schema
16. Conformance requirements
17. Golden fixtures
18. Migration impact
19. Open questions
20. Decision record

---

# 17. Definition of Done for an RFC

RFC завершен, когда:

- terminology consistent;
- schema published;
- parser/validator implemented;
- positive and negative fixtures exist;
- error codes stable;
- Webgogol example passes where applicable;
- minimal physical good example passes;
- docs and code agree;
- no unresolved blocking question;
- security/privacy reviewed;
- migration behavior specified;
- versioning impact recorded.

---

# 18. First implementation milestones

## M1 — Core entities parse

Business, Place, ContactPoint, WebPresence, Product, CatalogEntry, Offering.

## M2 — Pricing compiles

Charges, Plans, first-year cost.

## M3 — Policies compile

Delivery, availability, support, ownership, exit.

## M4 — Buyer View

Website and AI consume Buyer View.

## M5 — Trust layer

Claim, Evidence, Disclosure, stale checks.

## M6 — Webgogol migration cutover

Legacy deleted.

## M7 — Schema.org and CRM

Production projections.

## M8 — Second client

Prove model outside Webgogol.

## M9 — Large catalog prototype

Variants + bulk storage + inventory adapter.

---

# 19. RFCs that should not be combined

Do not combine:

- Product identity and Category;
- Category and ComparisonProfile;
- Variant and Bundle;
- Offering and individual Order;
- Pricing and tax calculation;
- Policy and Claim;
- Claim and Review;
- Localization and arbitrary schema inheritance;
- Runtime overlay and static manifest;
- Canonicalization and signature suite;
- Schema.org mapping and PBP core.

---

# 20. Immediate next RFC sequence

Recommended drafting order:

1. RFC-PBP-000 Program Charter and Terminology
2. RFC-PBP-001 Namespace and Entity Envelope
3. RFC-PBP-002 Primitive Types
4. RFC-PBP-020 Federated Product Identity
5. RFC-PBP-025 CatalogEntry
6. RFC-PBP-030 Offering Core
7. RFC-PBP-032 Pricing Core
8. RFC-PBP-040 Policy Base
9. RFC-PBP-060 Localization
10. RFC-PBP-064 Compiler Pipeline
11. RFC-PBP-074 Buyer View
12. RFC-PBP-102 Webgogol Migration

This sequence locks the ontology before detailed add-ons and projections.
