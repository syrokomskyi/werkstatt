# PBP Compiler, Validation and Projections

**Документ:** PBP-COMPILER-SPEC  
**Статус:** Pre-RFC implementation baseline  
**Версия:** 0.9  
**Дата:** 2026-07-18

---

# 1. Назначение

Этот документ задает поведение PBP-компилятора: от чтения исходных манифестов до выпуска проверенных проекций для сайта, ИИ, Schema.org, CRM и документов.

Компилятор — доверенная граница между редактируемыми источниками и публичным цифровым присутствием.

Он должен:

- обнаруживать противоречия до публикации;
- не додумывать отсутствующие факты;
- обеспечивать одинаковые результаты для одинаковых входов;
- показывать provenance каждого производного значения;
- масштабироваться от файлов Webgogol до больших каталогов;
- выпускать машиночитаемый validation report;
- позволять позднее подписывать canonical snapshots.

---

# 2. Компоненты

Рекомендуемое разбиение:

```text
Source Adapters
Parser
Raw Schema Validator
Entity Index
Locale Resolver
Reference Resolver
Profile Resolver
Runtime Overlay Resolver
Derivation Engine
Semantic Validator
Buyer View Builder
Projection Builders
Canonical Snapshot Builder
Signature Adapter
Publisher
Report Writer
```

Каждый компонент должен иметь чистый контракт и тестироваться отдельно.

---

# 3. Входы

## 3.1. Package manifest

```yaml
schema: pbp/package@1
id: https://webgogol.com/id/package/public-business-profile

defaultLocale: de
locales:
  de:
    sourceRef: ./de
  uk:
    sourceRef: ./uk
  ru:
    sourceRef: ./ru

sources:
  curated:
    type: manifest-directory
    path: .

registries:
  core:
    sourceRef: ./registry

buyerViewSchemaRef:
  ref: https://registry.example/id/buyer-view/standard/1

build:
  strict: true
  failOnWarnings: false
```

## 3.2. Source adapters

Минимум:

- `manifest-directory`;
- `jsonl-dataset`;
- `sql-adapter`;
- `external-api-adapter`;
- `runtime-overlay-adapter`.

Adapter обязан нормализовать records до PBP logical records до основного schema validation.

## 3.3. Build request

```yaml
locale: uk
asOf: 2026-07-18T18:00:00+02:00
projectionTargets:
  - website
  - ai-answer
  - schema-org
  - buyer-view
includeRuntimeState: false
strictness: production
```

---

# 4. Build context

Каждый build имеет immutable context:

```yaml
buildId: 01J...
sourceRevision: git:8cf317...
buildTime: 2026-07-18T18:00:00+02:00
locale: uk
defaultLocale: de
schemaSetDigest: sha256:...
derivationSetDigest: sha256:...
runtimeSnapshotId: null
```

Все outputs должны ссылаться на build context.

---

# 5. Pipeline

## Phase 1 — Discover

1. Прочитать package manifest.
2. Найти все source records.
3. Не следовать произвольным ссылкам из Markdown body.
4. Проверить уникальность physical logical key.
5. Собрать source inventory.

Выход:

```yaml
recordsDiscovered: 42
recordsBySchema:
  pbp/business@1: 1
  pbp/product@1: 7
  pbp/offering@1: 6
```

## Phase 2 — Parse

- Frontmatter parse.
- Markdown body parse как opaque localized content.
- YAML anchors и executable tags SHOULD быть запрещены.
- Duplicate YAML keys MUST быть ошибкой.
- Unknown tags MUST быть ошибкой.

## Phase 3 — Raw schema validation

Проверяется отдельная locale-record, до merge.

Особенно:

- schema ID;
- ID format;
- type;
- allowed fields;
- decimal strings;
- controlled vocabularies;
- date/time formats.

## Phase 4 — Build entity index

Index key = entity `id`, не путь файла.

Ошибки:

- два default-locale records с одним ID;
- два records одной locale с одним ID;
- ID type mismatch;
- locale suffix in ID, если policy запрещает.

## Phase 5 — Locale resolution

См. раздел 7.

## Phase 6 — Reference resolution

См. раздел 8.

## Phase 7 — Profile and policy resolution

- загрузить Category;
- загрузить ComparisonProfiles;
- загрузить Policy refs;
- проверить разрешенные overrides;
- построить effective terms.

## Phase 8 — Runtime overlays

Только при явном `includeRuntimeState: true`.

## Phase 9 — Derivations

Запустить требуемые Derivation Contracts.

## Phase 10 — Semantic validation

Проверить весь resolved graph.

## Phase 11 — Buyer View

Построить единую normalized buyer-facing модель.

## Phase 12 — Projection

Создать requested targets.

## Phase 13 — Canonical snapshot

Для подписываемых/архивируемых outputs.

## Phase 14 — Publication

Публиковать только если build status соответствует policy.

---

# 6. Source inventory report

Компилятор должен выпускать:

```yaml
sources:
  - physicalPath: de/catalog/offerings/digital-foundation.md
    entityId: https://webgogol.com/id/offering/digital-foundation
    schema: pbp/offering@1
    locale: de
    contentDigest: sha256:...
```

Это обеспечивает трассировку без превращения пути в identity.

---

# 7. Locale Resolution

## 7.1. Field policy registry

Для каждого schema path известно:

- `localizable`;
- `invariant`;
- `locale-variant-allowed`;
- `not-localized`.

## 7.2. Algorithm

Для entity E и target locale L:

1. Найти default record D.
2. Если D отсутствует — ошибка для canonical entity.
3. Найти exact locale record L.
4. Если exact record отсутствует — resolved record = D, status `full-file-fallback`.
5. Если record есть — пройти каждый override field.
6. Для localizable field применить override.
7. Для locale-variant-allowed применить override и отметить provenance.
8. Для invariant field — ошибка `PBP-LOC-004`.
9. Проверить итоговую schema.
10. Сформировать fallback report.

## 7.3. Keyed map merge

Keyed maps объединяются по ключам.

```yaml
# de
outcomes:
  ownership:
    name: Kontrolle
  operation:
    name: Betrieb
```

```yaml
# uk
outcomes:
  ownership:
    name: Контроль
```

Результат uk:

- ownership.name = украинский;
- operation.name = fallback de.

## 7.4. Arrays

Arrays не deep-merge. Возможные правила:

- invariant atomic list — полностью наследуется;
- localizable list — locale record полностью заменяет список;
- set-like list — schema-specific merge по scalar value.

Сложные array objects SHOULD быть запрещены.

## 7.5. Fallback report

```yaml
locale: uk
fallbacks:
  - entityId: .../product/digital-foundation
    path: /outcomes/operation/name
    sourceLocale: de
    targetLocale: uk
    severity: warning
```

Production policy может ограничивать допустимый процент fallback.

---

# 8. Reference Resolution

## 8.1. Types

Resolver проверяет expected type.

```yaml
itemRef:
  ref: ...
  expectedType: product
```

## 8.2. Internal refs

Internal entity должна существовать в build graph.

## 8.3. External refs

External ref может быть:

- trusted registry snapshot;
- resolvable HTTPS resource;
- cached verified record;
- opaque identifier.

Build не должен зависеть от live Internet для каждого production build. External registries должны pin-иться по version/digest.

## 8.4. Reference classes

- required — отсутствие блокирует;
- optional — отсутствие warning/omission;
- external-opaque — existence не проверяется, syntax проверяется;
- deferred-runtime — разрешается runtime adapter.

## 8.5. Cycle checks

- `requires` graph MUST быть acyclic;
- category broader graph SHOULD быть acyclic;
- successor chain MUST быть acyclic;
- Product intrinsic composition cycle MUST быть ошибкой;
- offering optional relation cycle MAY быть допустим, если не создает dependency.

---

# 9. Policy Resolution

## 9.1. Policy references

Offering ссылается на Policy по ID.

## 9.2. Overrides

Override допускается только typed schema.

Например, yearly plan может изменить cancellation notice, если policy schema объявляет plan override.

Произвольное:

```yaml
policyOverride:
  any.path: any.value
```

запрещено.

## 9.3. Conflicts

Пример conflict:

- Offering terms: minimum term P1M;
- selected plan: minimum term P1Y;

Это не conflict, если plan override разрешен.

Пример error:

- cancellation policy говорит notice P1M;
- offering direct field говорит notice P14D;
- нет override precedence.

В PBP следует избегать дублирующего direct field и Policy.

---

# 10. Runtime Overlay Resolution

## 10.1. Overlay envelope

```yaml
schema: pbp/runtime-overlay@1
subjectRef: https://shop.example/id/offering/sku-123
observedAt: 2026-07-18T17:59:00Z
expiresAt: 2026-07-18T18:04:00Z
sourceRef: https://shop.example/id/source/inventory
values:
  availability:
    status: in-stock
```

## 10.2. Allowed paths

Source contract должен перечислять, какие semantic fields overlay может давать.

Inventory adapter не может переопределить Product name, ownership policy или tax treatment.

## 10.3. Freshness

Expired overlay получает `stale` и не должен отображаться как current.

Projection выбирает:

- omit;
- show unknown;
- show stale warning;
- block transaction.

---

# 11. Derivation Engine

## 11.1. Execution model

Derivations выполняются как pure functions:

```text
(result, trace) = derive(contractVersion, resolvedInputs, parameters)
```

## 11.2. Result envelope

```yaml
status: derived
mode: exact
value:
  amount: "900.00"
  currency: EUR
provenance:
  derivationRef: https://registry.example/id/derivation/first-year-cost/1
  implementationVersion: 1.0.0
  inputDigests:
    - sha256:...
```

## 11.3. First-year cost

Inputs:

- selected plan;
- start date if recurrence alignment matters;
- period P1Y;
- usage parameters;
- tax presentation mode.

Webgogol examples:

- monthly: 200 + 12 × 70 = 1040 EUR;
- yearly: 200 + 700 = 900 EUR.

These values are not written into Offering.

## 11.4. Range

If any charge is range and no determining input is provided:

```yaml
mode: range
minimum: ...
maximum: ...
```

## 11.5. Parameterized

```yaml
mode: parameterized
formulaDescription: Base price plus processed requests
requiredParameters:
  requests:
    unitRef: pbp-unit:request
```

Canonical output should not expose executable formula text as authority; it exposes contract ID and parameters.

## 11.6. Rounding

Money derivations MUST declare rounding at final and intermediate stages.

Default recommendation:

- retain arbitrary decimal precision internally;
- round only at charge-defined boundary;
- final output to currency minor unit;
- never use binary float.

---

# 12. Semantic Validation

## 12.1. Entity graph

Checks:

- unique ID;
- correct type refs;
- authority exists;
- published entity cannot require draft entity;
- retired target cannot be used by published Offering unless explicit compatibility.

## 12.2. Product/Catalog

- CatalogEntry itemRef exists;
- local SKU unique within Catalog;
- ProductVariant axes complete;
- ProductGroup axis values valid;
- external identifier scheme valid;
- same GTIN conflict report.

A duplicate GTIN across two different Product IDs is at least blocking warning and usually error pending authority resolution.

## 12.3. Offering

- Offering businessRef equals Catalog business;
- CatalogEntry is published;
- audience not empty for buyer-facing projection;
- related Offering target exists;
- `requires` and `incompatibleWith` conflict;
- acquisition value valid;
- no individual quantity.

## 12.4. Pricing

- every Plan chargeRef exists;
- no orphan critical Charge unless intentionally unassigned;
- recurring Charge has recurrence;
- one-time Charge does not have recurrence unless schema explicitly permits;
- range min <= max;
- tier boundaries non-overlapping and ordered;
- unit rate has basis;
- deposit has refund policy or explicit non-refundable declaration;
- discount has basis;
- amount currency consistent;
- billingDay valid for recurrence policy;
- tax semantics complete for B2C profile if profile requires it.

## 12.5. Policies

- SLA complete;
- Guarantee has remedy;
- ownership components noncontradictory;
- exit package does not claim assets unavailable under ownership policy;
- cancellation terms consistent with plan term;
- data retention and deletion do not contradict.

## 12.6. Claims

- required Evidence exists;
- assessedAt present for external/comparative claim;
- review schedule evaluated;
- stale behavior enforced;
- statement localizable;
- evidence source is not generic placeholder in production.

## 12.7. Localization

- invariant override;
- unknown semantic key;
- full-file fallback;
- partial fallback;
- required localized name missing;
- Markdown body language mismatch optional lint.

---

# 13. Validation Severity

```text
fatal     parser cannot continue
error     build cannot publish
warning   build may publish under policy
info      report only
```

Production defaults:

- fatal/error block;
- warning does not block unless `failOnWarnings` or profile marks blocking;
- stale contract-critical claim = error.

---

# 14. Error Code Taxonomy

Recommended stable prefixes:

```text
PBP-PARSE-xxx
PBP-SCHEMA-xxx
PBP-ID-xxx
PBP-REF-xxx
PBP-LOC-xxx
PBP-PRODUCT-xxx
PBP-CATALOG-xxx
PBP-OFFER-xxx
PBP-PRICE-xxx
PBP-POLICY-xxx
PBP-CLAIM-xxx
PBP-DERIVE-xxx
PBP-RUNTIME-xxx
PBP-PROJECT-xxx
PBP-SIGN-xxx
```

Examples:

- `PBP-PRICE-001` Plan references missing Charge.
- `PBP-LOC-004` Locale overrides invariant field.
- `PBP-POLICY-013` Guarantee has no remedy.
- `PBP-OFFER-021` Offering requires incompatible Offering.
- `PBP-CLAIM-007` Blocking Claim is stale.

Reports must include:

```yaml
code: PBP-PRICE-001
severity: error
entityId: ...
path: /pricing/plans/monthly/chargeRefs/subscription
message: Plan references missing charge monthlySubscription
suggestion: Define the charge or remove the reference.
```

---

# 15. Buyer View Builder

## 15.1. Output structure

```yaml
schema: pbp/buyer-view@1
subjectOfferingRef: ...
locale: de
asOf: ...
sourceRevision: ...

sections:
  identity: {}
  suitability: {}
  value: {}
  package: {}
  options: {}
  pricing: {}
  buyerResponsibilities: {}
  fulfillment: {}
  assurances: {}
  rights: {}
  lifecycle: {}
  limitations: {}
```

## 15.2. Section contract

Each section:

```yaml
status: declared
items: {}
sources:
  - entityRef: ...
warnings: []
```

## 15.3. Identity

- Offering name;
- provider/business;
- Product/CatalogEntry;
- stable IDs;
- current publication state.

## 15.4. Suitability

- buyer types;
- segments;
- territory;
- prerequisites;
- category/profile applicability.

## 15.5. Value

- purpose;
- outcomes;
- deliverables;
- no invented benefits.

## 15.6. Package

- included Products/services;
- allowances;
- exclusions if declared.

## 15.7. Options

- optional Offerings;
- requirements;
- incompatibilities;
- acquisition mode.

## 15.8. Pricing

For each Plan:

- charges;
- billing schedule;
- tax treatment;
- exact/range/parameterized first-year cost;
- required parameters;
- discounts;
- deposits;
- overage.

## 15.9. Buyer Responsibilities

- materials;
- approvals;
- access;
- prerequisites.

## 15.10. Fulfillment

- start trigger;
- target duration;
- method;
- delivery territory;
- shipping/pickup where applicable.

## 15.11. Assurances

- SLA;
- guarantees;
- remedies;
- measurement.

## 15.12. Rights

- ownership;
- license;
- portability;
- exit package;
- deletion rights.

## 15.13. Lifecycle

- minimum term;
- renewal;
- cancellation;
- price changes;
- suspension/termination.

## 15.14. Limitations

- exclusions;
- range determination;
- capacity confirmation;
- third-party dependencies;
- not-declared critical items.

---

# 16. Website Projection

## 16.1. Rule

Website templates consume Buyer View or typed projections, not raw arbitrary YAML paths.

Bad:

```text
{business.offer.price.monthly}
```

Good:

```text
{buyerView.sections.pricing.plans.monthly.recurring.display}
```

Display field is generated by projection, not stored in source.

## 16.2. Presentation adapters

- price formatter;
- duration formatter;
- date formatter;
- locale grammar;
- currency placement;
- section renderer;
- disclosure renderer;
- evidence badge renderer.

## 16.3. Page composition

Pages may select sections, but cannot redefine fact values.

## 16.4. Content body

Long Markdown narrative may complement structured data. It must not contradict it. A consistency linter should detect repeated explicit prices/durations in prose and compare them to structured values.

---

# 17. AI Answer Projection

## 17.1. Goals

- compact;
- source-linked;
- no hallucinated defaults;
- explicit missing statuses;
- suitable for RAG/API.

## 17.2. Example

```json
{
  "schema": "pbp/ai-answer-view@1",
  "subject": {
    "offeringId": "https://webgogol.com/id/offering/digital-foundation",
    "name": "Digitales Fundament",
    "provider": "Webgogol"
  },
  "pricing": {
    "monthly": {
      "activation": {"amount": "200.00", "currency": "EUR"},
      "recurring": {"amount": "70.00", "currency": "EUR", "period": "P1M"},
      "firstYearCost": {"mode": "exact", "amount": "1040.00", "currency": "EUR"}
    }
  },
  "rights": {
    "portability": {"status": "declared", "value": true}
  },
  "sourceRevision": "git:8cf317..."
}
```

## 17.3. Answer policy

AI consumer guidance:

- `not-declared` → «не заявлено»;
- `not-applicable` → «не применяется»;
- `unavailable` → «сейчас невозможно определить»;
- `derived` → сообщить basis при существенности;
- stale Claim → не представлять как current fact без warning.

---

# 18. Schema.org Projection

## 18.1. Mapping strategy

Mapping layer must be explicit and versioned.

```yaml
mappingRef: pbp-mapping:schema-org/30/product-offer/1
```

## 18.2. Product variants

- ProductGroup → `schema:ProductGroup`;
- variationAxes → `variesBy` where possible;
- variants → `hasVariant`;
- ProductVariant → `schema:Product` + `isVariantOf`.

## 18.3. Offering

- Offering → `schema:Offer`;
- fixed price → `price`/`priceCurrency` or PriceSpecification;
- range → AggregateOffer only when semantically valid;
- recurring/usage pricing may require UnitPriceSpecification or additional structured explanation;
- service Product may map to `Service` plus Offer.

## 18.4. Loss report

Projection MUST report data that could not be represented:

```yaml
losses:
  - sourcePath: /policyRefs/ownership
    reason: no-direct-schema-org-equivalent
    fallback: additionalProperty
```

No silent loss for critical buyer facts.

---

# 19. Quote Projection

Input:

- Offering ID;
- selected Plan;
- selected optional Offerings;
- quantities/parameters;
- buyer identity from external system;
- quote date.

Output contains snapshot refs:

```yaml
offeringSnapshot:
  sourceRevision: ...
  digest: ...
```

PBP itself does not store quote.

---

# 20. Contract Projection

Contract generator uses:

- Offering facts;
- selected Plan;
- Policy texts;
- Buyer responsibilities;
- private legal/billing profile;
- buyer data;
- snapshot digest.

Contract template must not hardcode price or SLA independently.

---

# 21. Invoice Input Projection

PBP exports line-item descriptors:

```yaml
chargeId: activation
name: Aktivierung Digitales Fundament
amount:
  value: "200.00"
  currency: EUR
quantityBasis:
  unitRef: pbp-unit:item
```

Invoice engine adds:

- invoice number;
- tax calculation;
- customer;
- due date;
- bank/payment data;
- legal required fields.

---

# 22. CRM Projection

Recommended stable payload:

```yaml
businessId: ...
catalogEntryId: ...
offeringId: ...
planId: monthly
charges:
  activation: ...
  subscription: ...
relatedOfferingIds: []
sourceRevision: ...
```

CRM adapter maintains external IDs separately.

---

# 23. Comparison Projection

## 23.1. Preconditions

Two Offerings comparable only when:

- ComparisonProfile applies;
- dimension values share compatible units;
- buyer type/tax presentation is comparable;
- period basis is comparable;
- missing semantics known.

## 23.2. Output statuses

- comparable;
- comparable-after-normalization;
- not-comparable;
- insufficient-data;
- stale-data.

## 23.3. No forced ranking

PBP comparison may expose dimensions. Ranking requires separate transparent Methodology/Derivation Contract.

---

# 24. Canonical Snapshot

## 24.1. Included

- resolved entity graph subset;
- locale;
- schema IDs;
- sourceRevision;
- derivation IDs and versions;
- normative facts;
- projection type if signing projection.

## 24.2. Excluded

- build path;
- local filesystem path;
- timestamps not relevant to snapshot;
- log order;
- non-deterministic metrics;
- signature itself.

## 24.3. Serialization

1. Convert resolved data to JSON-compatible model.
2. Validate I-JSON constraints where using JCS.
3. Preserve decimal values as strings.
4. Remove undefined values.
5. Canonicalize via RFC 8785.
6. Hash.

---

# 25. Golden Test Vectors

At least these fixtures:

1. Minimal one-time physical good.
2. Webgogol Digitales Fundament monthly plan.
3. Webgogol yearly plan.
4. Usage-based service.
5. Range price.
6. Tiered price.
7. ProductGroup with variants.
8. Bundle.
9. Locale partial fallback.
10. Invalid invariant locale override.
11. Stale Claim.
12. SLA contradiction.
13. Runtime inventory overlay.
14. Schema.org lossy mapping report.
15. Canonical snapshot digest.

Each fixture includes:

```text
input/
expected-resolved/
expected-buyer-view/
expected-validation/
expected-projections/
expected-digest/
```

---

# 26. Incremental Build

For large catalogs:

- content digest per entity;
- dependency graph;
- only re-resolve affected entities;
- cache by `(entityDigest, locale, schemaSetDigest, derivationSetDigest)`;
- batch validation;
- streaming output;
- no full graph in memory requirement.

Dependency invalidation examples:

- Policy change invalidates all Offerings referencing it;
- ComparisonProfile change invalidates comparison projections;
- locale string change invalidates locale-specific projections only;
- Product name change invalidates CatalogEntry display only if inherited.

---

# 27. Build Reports

Required reports:

- source inventory;
- schema validation;
- reference graph;
- locale fallback;
- derivation trace;
- stale content;
- projection loss;
- comparison readiness;
- privacy scan;
- publication summary;
- signature summary.

Example summary:

```yaml
status: failed
errors: 2
warnings: 5
publishedEntities: 0
blockedBy:
  - PBP-POLICY-013
  - PBP-CLAIM-007
```

---

# 28. Migration Mode

Compiler SHOULD support migration mode:

- accepts draft entities;
- emits TODO report;
- allows placeholders only under `migration` namespace;
- never publishes placeholder to production;
- provides field mapping diagnostics;
- checks legacy source coverage.

Example migration annotation:

```yaml
migration:
  sourceFile: offer.md
  sourcePaths:
    - price.monthlyAmount
  decision: transformed
```

These annotations MUST be removable before final production manifests or excluded from canonical snapshot.

---

# 29. Security Requirements

- YAML parser safe mode;
- no template execution in source;
- Markdown sanitized on render;
- external URLs not fetched during trusted build unless allowlisted;
- adapter credentials outside PBP;
- provenance of runtime data;
- source digest verification;
- no AI-generated field accepted without validation and review status;
- prompt injection text treated as data.

---

# 30. Definition of a Successful Production Build

A build succeeds only if:

- all errors absent;
- all required refs resolved;
- all published entities valid;
- all contract-critical claims fresh;
- all Buyer View required sections have non-invalid status;
- no invariant locale override;
- no sensitive-data rule violation;
- requested projections generated;
- projection loss policy satisfied;
- sourceRevision attached;
- golden regression tests pass in CI.
