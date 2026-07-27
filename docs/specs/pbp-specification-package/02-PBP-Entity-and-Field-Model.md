# PBP Entity and Field Model

**Документ:** PBP-DATA-MODEL  
**Статус:** Pre-RFC field baseline  
**Версия:** 0.9  
**Дата:** 2026-07-18

---

# 1. Назначение

Этот документ детализирует логические сущности, поля, примитивы, отношения и рекомендуемые YAML-представления Public Business Profile.

Примеры являются проектными. Финальные JSON Schema должны быть созданы отдельными RFC, но обязаны сохранить:

- названия верхнеуровневых блоков;
- границы сущностей;
- типы идентичности;
- pricing semantics;
- locale semantics;
- отсутствующие значения;
- relation semantics.

---

# 2. Namespace и schema IDs

Все схемы первой major-версии используют namespace:

```text
pbp/{entity}@1
```

Примеры:

```yaml
schema: pbp/business@1
schema: pbp/product@1
schema: pbp/catalog-entry@1
schema: pbp/offering@1
schema: pbp/policy@1
```

Внутри `@1` schema ID и названия блоков стабильны.

---

# 3. Общая оболочка сущности

Каждая сущность SHOULD соответствовать базовой форме:

```yaml
schema: pbp/{entity}@1
id: https://example.com/id/{entity}/{key}
type: {entity}
status: published

name: Localized human name
summary: Localized short description

governance:
  authorityRef: https://example.com/id/business/example
  effectiveFrom: 2026-07-01
  reviewedAt: 2026-07-01
  reviewEvery: P1Y
  maintenanceOwnerRef: agent:business-maintainer
```

## 3.1. `schema`

Обязательный идентификатор схемы.

## 3.2. `id`

Глобально уникальный, locale-independent URI.

## 3.3. `type`

Стабильный machine type.

## 3.4. `status`

Рекомендуемый controlled vocabulary:

- `draft` — существует в staging, не публикуется;
- `published` — включается в публичный граф;
- `suspended` — временно не публикуется как действующее;
- `retired` — не действует, может сохраняться в истории Git, но не входит в текущий каталог;
- `superseded` — заменено другой сущностью.

Поскольку публичный PBP хранит только публичные сущности, production build должен включать только `published`, если projection явно не запрашивает архивную историю.

## 3.5. `governance`

Manifest-level defaults:

```yaml
governance:
  authorityRef: ...
  effectiveFrom: 2026-07-01
  reviewedAt: 2026-07-01
  reviewEvery: P1Y
  maintenanceOwnerRef: agent:offer-maintainer
```

Вложенные objects MAY иметь собственный `governance`, если их review cycle существенно отличается.

Sidecar files по JSON/YAML path запрещены.

---

# 4. Общие примитивы

## 4.1. EntityRef

```yaml
ref: https://example.com/id/product/example
```

Ref MAY иметь ожидаемый тип:

```yaml
ref: https://example.com/id/product/example
expectedType: product
```

## 4.2. LocalizedString

В файловом locale-profile значение является обычной строкой:

```yaml
name: Digitales Fundament
```

Resolved JSON MAY иметь language-tagged representation:

```json
{
  "value": "Digitales Fundament",
  "language": "de"
}
```

## 4.3. Decimal

Регулярное выражение baseline:

```text
^-?(0|[1-9][0-9]*)(\.[0-9]+)?$
```

Для money negative values разрешаются только там, где schema допускает credit/adjustment.

## 4.4. Money

```yaml
value: "70.00"
currency: EUR
```

`currency` — ISO 4217 alpha-3 либо namespaced extension.

## 4.5. MoneyRange

```yaml
minimum:
  value: "59.00"
  currency: EUR
maximum:
  value: "199.00"
  currency: EUR
```

Обе границы MUST использовать одну валюту.

## 4.6. Duration

ISO 8601 duration:

```yaml
duration: P1M
```

Business-day duration требует quantitative value:

```yaml
value: 12
unitRef: pbp-unit:business-day
```

`P12D` не эквивалентно 12 business days.

## 4.7. Timestamp

RFC 3339:

```yaml
observedAt: 2026-07-18T18:30:00+02:00
```

## 4.8. QuantitativeValue

```yaml
value: "99.00"
unitRef: pbp-unit:percent
```

Диапазон:

```yaml
minimum: "3"
maximum: "4"
unitRef: pbp-unit:item
```

## 4.9. SemanticStatus

```yaml
status: declared
```

Controlled vocabulary:

- `declared`;
- `derived`;
- `not-declared`;
- `not-applicable`;
- `unavailable`;
- `invalid`;
- `stale`;
- `not-comparable`.

## 4.10. ExternalIdentifier

```yaml
externalIdentifiers:
  gtin:
    schemeRef: pbp-identifier-scheme:gtin
    value: "04012345678901"
    authorityRef: https://example-manufacturer.com/id/business/manufacturer
```

## 4.11. Controlled Value

```yaml
valueRef: pbp-value:color/blue
```

Для расширения:

```yaml
valueRef: https://example.com/id/vocabulary/custom-value
```

---

# 5. Business

## 5.1. Назначение

Публичная операционная идентичность бизнеса.

## 5.2. Рекомендуемая структура

```yaml
schema: pbp/business@1
id: https://webgogol.com/id/business/webgogol
type: business
status: published

name: Webgogol
summary: Moderne, zuverlässige Engineering-Webstudio in Deutschland.
description: >-
  Webgogol entwickelt und betreibt digitale Grundlagen für kleine
  Unternehmen und Handwerksbetriebe.

businessModel:
  typeRef: pbp-business-type:founder-led-engineering-studio

markets:
  b2b:
    valueRef: pbp-buyer-type:b2b

industries:
  webEngineering:
    categoryRef: pbp-industry:web-engineering

yearEstablished: 2026

mission: >-
  Eine geordnete, dauerhaft betreute digitale Präsenz als unterstützte
  Infrastruktur bereitstellen.

brandRefs:
  primary:
    ref: https://webgogol.com/id/brand/webgogol

legalIdentityRef:
  ref: https://webgogol.com/id/legal-identity/webgogol

placeRefs:
  headquarters:
    ref: https://webgogol.com/id/place/backnang
    role: headquarters

contactPointRefs:
  general:
    ref: https://webgogol.com/id/contact-point/general-email

webPresenceRefs:
  primary:
    ref: https://webgogol.com/id/web-presence/primary

catalogRefs:
  main:
    ref: https://webgogol.com/id/catalog/main
```

## 5.3. Не включать

- цены;
- product promises;
- SLA;
- service area конкретного Offering;
- банковские реквизиты;
- design mode (`bodenstation`) как факт бизнеса, если это не отдельная публичная brand/design identity;
- внутренние technical stack details.

---

# 6. LegalIdentity

```yaml
schema: pbp/legal-identity@1
id: https://webgogol.com/id/legal-identity/webgogol
type: legal-identity
status: published

legalName: Webgogol
legalForm:
  valueRef: pbp-legal-form:sole-proprietorship

responsiblePerson:
  name: Andrii Syrokomskyi

registeredPlaceRef:
  ref: https://webgogol.com/id/place/backnang-registered-office

publicIdentifiers:
  vat:
    status: not-declared

publicRegistrations: {}
```

## 6.1. Privacy boundary

`taxNumber`, IBAN, BIC и private billing data не входят в public LegalIdentity.

Если идентификатор должен публично показываться, он добавляется только после отдельного решения и верификации.

---

# 7. Brand

```yaml
schema: pbp/brand@1
id: https://webgogol.com/id/brand/webgogol
type: brand
status: published

name: Webgogol
tagline: Digitales Fundament für kleines Gewerbe und Handwerk

ownerBusinessRef:
  ref: https://webgogol.com/id/business/webgogol
```

Brand может иметь visual identity refs, но canonical business facts не должны смешиваться с design tokens.

---

# 8. Place

```yaml
schema: pbp/place@1
id: https://webgogol.com/id/place/backnang
type: place
status: published

name: Backnang
kind: locality

address:
  street: Elly-Heuss-Knapp-Weg
  streetNumber: "29"
  postalCode: "71522"
  locality: Backnang
  administrativeArea: Baden-Württemberg
  countryCode: DE

geo:
  status: not-declared

publicUrl: https://www.backnang.de/
```

## 8.1. Правила

- region не получает postalCode локального адреса;
- country не дублируется отдельной Place без реальной необходимости;
- service territory не хранится в Place;
- один адрес может иметь несколько ролей через Business relation.

---

# 9. ContactPoint

```yaml
schema: pbp/contact-point@1
id: https://webgogol.com/id/contact-point/general-email
type: contact-point
status: published

name: E-Mail
channel: email
value: hi@webgogol.com

purposes:
  projectInquiry:
    valueRef: pbp-contact-purpose:project-inquiry
  customerSupport:
    valueRef: pbp-contact-purpose:customer-support

preferred: true

languages:
  de: de
  uk: uk
```

Проекции вычисляют `mailto:` и QR.

---

# 10. WebPresence

```yaml
schema: pbp/web-presence@1
id: https://webgogol.com/id/web-presence/primary
type: web-presence
status: published

name: Webgogol Website
kind: primary-website
canonicalUrl: https://webgogol.com/

businessRef:
  ref: https://webgogol.com/id/business/webgogol

locales:
  de: de
  uk: uk

control:
  status: business-controlled
```

`domain` и `origin` — derivable.

---

# 11. Product

## 11.1. Структура

```yaml
schema: pbp/product@1
id: https://webgogol.com/id/product/digital-foundation
type: product
kind: composite-service
status: published

name: Digitales Fundament
summary: >-
  Eine dauerhaft betriebene und übertragbare digitale Grundlage für
  kleine Unternehmen und Handwerksbetriebe.

authorityRef:
  ref: https://webgogol.com/id/business/webgogol

classification:
  categoryRef:
    ref: https://registry.example/id/category/managed-website-service

  comparisonProfileRefs:
    commercial:
      ref: https://registry.example/id/comparison-profile/managed-website-commercial/1
    ownership:
      ref: https://registry.example/id/comparison-profile/digital-asset-ownership/1

purpose:
  statement: >-
    Eine verlässliche geschäftliche Präsenz im Internet bereitstellen.

outcomes:
  presence:
    name: Professionelle Web-Präsenz
  ownership:
    name: Kontrolle über wesentliche digitale Bestandteile
  operation:
    name: Laufender technischer Betrieb

deliverables:
  deployedWebsite:
    kind: digital-asset
    name: Veröffentlichte Website

capabilities:
  structuredContent:
    value: true
  portabilityReady:
    value: true

externalIdentifiers: {}

intrinsicComposition:
  website:
    productRef:
      ref: https://webgogol.com/id/product/business-website
  operation:
    productRef:
      ref: https://webgogol.com/id/product/website-operation
```

## 11.2. Product kinds

Предварительный vocabulary:

- physical-good;
- digital-good;
- service;
- composite-service;
- subscription-access;
- license;
- rental;
- insurance-product;
- bundle;
- right;
- data-product;
- experience;
- custom-made-good.

---

# 12. ProductGroup и ProductVariant

## 12.1. ProductGroup

```yaml
schema: pbp/product-group@1
id: https://example.com/id/product-group/shirt-100
type: product-group
status: published

name: Shirt 100

classification:
  categoryRef:
    ref: https://registry.example/id/category/shirt

variationAxes:
  color:
    attributeRef: https://registry.example/id/attribute/color
    required: true
  size:
    attributeRef: https://registry.example/id/attribute/garment-size
    required: true
```

## 12.2. ProductVariant

```yaml
schema: pbp/product-variant@1
id: https://example.com/id/product/shirt-100-blue-m
type: product-variant
status: published

name: Shirt 100 — Blau — M

groupRef:
  ref: https://example.com/id/product-group/shirt-100

variantValues:
  color:
    valueRef: https://registry.example/id/value/color/blue
  size:
    valueRef: https://registry.example/id/value/size/m

externalIdentifiers:
  gtin:
    schemeRef: pbp-identifier-scheme:gtin
    value: "04012345678901"
```

## 12.3. Invariants

- Variant MUST specify all required axes.
- Axis not declared in ProductGroup MUST NOT appear.
- Every Variant external identifier must identify that concrete variant, not group.

---

# 13. Catalog

```yaml
schema: pbp/catalog@1
id: https://webgogol.com/id/catalog/main
type: catalog
status: published

name: Webgogol Angebotskatalog

businessRef:
  ref: https://webgogol.com/id/business/webgogol

entrySource:
  mode: manifest-directory
  logicalPath: catalog/entries
```

For bulk storage:

```yaml
entrySource:
  mode: dataset
  adapterRef: https://example.com/id/source-contract/catalog-dataset/1
```

---

# 14. CatalogEntry

```yaml
schema: pbp/catalog-entry@1
id: https://webgogol.com/id/catalog-entry/digital-foundation
type: catalog-entry
status: published

name: Digitales Fundament
summary: >-
  Webgogols Katalogeintrag für die Erstellung und den laufenden Betrieb
  einer übertragbaren Unternehmenswebsite.

catalogRef:
  ref: https://webgogol.com/id/catalog/main

itemRef:
  ref: https://webgogol.com/id/product/digital-foundation
  expectedType: product

localIdentifiers:
  sku: WG-DF

merchandising:
  featured: true
  displayOrder: 10

offeringRefs:
  standard:
    ref: https://webgogol.com/id/offering/digital-foundation
```

## 14.1. CatalogEntry fields

CatalogEntry может хранить локальные:

- names/descriptions;
- SKU;
- tags;
- category placement;
- media;
- search facets;
- publication flags;
- Offerings.

Глобальные technical attributes Product не должны копироваться без необходимости.

---

# 15. Offering

## 15.1. Полная структура

```yaml
schema: pbp/offering@1
id: https://webgogol.com/id/offering/digital-foundation
type: offering
status: published

name: Digitales Fundament
summary: >-
  Erstellung, Veröffentlichung und laufender technischer Betrieb einer
  übertragbaren Website.

businessRef:
  ref: https://webgogol.com/id/business/webgogol

catalogEntryRef:
  ref: https://webgogol.com/id/catalog-entry/digital-foundation

audience:
  buyerTypes:
    b2b:
      valueRef: pbp-buyer-type:b2b
  segments:
    smallBusiness:
      valueRef: pbp-segment:small-business
    handwerk:
      valueRef: pbp-segment:handwerk

availability:
  mode: declared
  territories:
    germany:
      countryCode: DE

package:
  included: {}
  allowances: {}

pricing:
  currency: EUR
  tax: {}
  charges: {}
  plans: {}
  adjustments: {}

acquisition:
  channelRefs:
    directInquiry:
      ref: https://webgogol.com/id/contact-point/general-email

fulfillment: {}
customerResponsibilities: {}
terms: {}
policyRefs: {}
relatedOfferings: {}
limitations: {}
```

---

# 16. Package, Allowance и Relations

## 16.1. Included item

```yaml
package:
  included:
    websiteOperation:
      itemRef:
        ref: https://webgogol.com/id/product/website-operation
      inclusion: full
```

## 16.2. Allowance

```yaml
package:
  allowances:
    smallChanges:
      subjectRef: https://registry.example/id/metric/completed-small-change
      includedQuantity:
        value: "1"
        unitRef: pbp-unit:change
      resetPeriod: P1M
      overageChargeRef: additionalSmallChange
```

## 16.3. Related offering

Core relations `@1`:

- `optional`;
- `requires`;
- `incompatibleWith`;
- `alternativeTo`;
- `included` — только когда relation выражает inclusion of an Offering; package item предпочтительнее.

```yaml
relatedOfferings:
  visibility:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/visibility
    acquisition: with-this-offering
```

`acquisition` vocabulary:

- `standalone`;
- `with-this-offering`;
- `either`.

`recommendedWith` не входит в structural core; оно моделируется Recommendation/Claim.

`replaces` моделируется lifecycle/successor.

---

# 17. Pricing model

## 17.1. Pricing header

```yaml
pricing:
  currency: EUR
  tax:
    treatment: not-declared
    jurisdiction:
      countryCode: DE
  charges: {}
  plans: {}
  adjustments: {}
```

## 17.2. One-time fixed Charge

```yaml
charges:
  activation:
    type: one-time
    purpose: activation
    amount:
      model: fixed
      value: "200.00"
    trigger:
      event: contract-start
```

## 17.3. Recurring Charge

```yaml
charges:
  monthlySubscription:
    type: recurring
    purpose: subscription
    amount:
      model: fixed
      value: "70.00"
    recurrence: P1M
```

## 17.4. Usage Charge

```yaml
charges:
  additionalSmallChange:
    type: usage
    purpose: additional-service
    basis:
      metricRef: https://registry.example/id/metric/completed-small-change
      unitRef: pbp-unit:change
    amount:
      model: unit-rate
      unitValue: "15.00"
```

## 17.5. Range Charge

```yaml
charges:
  automationSubscription:
    type: recurring
    purpose: subscription
    amount:
      model: range
      minimum: "59.00"
      maximum: "199.00"
    recurrence: P1M
    determination:
      method: individual-assessment
      beforePurchase: true
```

## 17.6. Tiered Charge

```yaml
charges:
  requestProcessing:
    type: usage
    purpose: processing
    basis:
      metricRef: https://registry.example/id/metric/processed-request
      unitRef: pbp-unit:request
    amount:
      model: tiered
      method: graduated
      tiers:
        first:
          order: 1
          upTo: "1000"
          unitValue: "0.08"
        following:
          order: 2
          above: "1000"
          unitValue: "0.05"
```

`method` MUST distinguish volume pricing from graduated pricing.

## 17.7. Deposit

```yaml
charges:
  securityDeposit:
    type: deposit
    purpose: security
    amount:
      model: fixed
      value: "300.00"
    refundPolicyRef:
      ref: https://example.com/id/policy/deposit-refund
```

## 17.8. Adjustment

```yaml
adjustments:
  annualPrepaymentDiscount:
    type: discount
    calculation:
      model: fixed
      value: "140.00"
    appliesWhen:
      planRef: yearly
    appliesTo:
      chargeRefs:
        monthlySubscription:
          ref: monthlySubscription
```

Использовать discount только если существует реальная list price и корректная basis.

## 17.9. Plan

```yaml
plans:
  monthly:
    name: Monatlich
    chargeRefs:
      activation:
        ref: activation
      subscription:
        ref: monthlySubscription
    billing:
      recurrence: P1M
      billingDay: 1
    terms:
      minimumTerm: P1M
      renewal:
        mode: automatic
        period: P1M

  yearly:
    name: Jährlich
    chargeRefs:
      activation:
        ref: activation
      subscription:
        ref: yearlySubscription
    billing:
      recurrence: P1Y
    terms:
      minimumTerm: P1Y
      renewal:
        mode: automatic
        period: P1Y
```

---

# 18. Fulfillment и Buyer Responsibilities

```yaml
fulfillment:
  mode: service-delivery
  startTrigger:
    event: required-customer-materials-accepted
  target:
    duration:
      value: "12"
      unitRef: pbp-unit:business-day
  deliveryMethods:
    websiteDeployment:
      valueRef: pbp-delivery-method:digital-deployment
```

```yaml
customerResponsibilities:
  materials:
    requirementRef: https://webgogol.com/id/requirement/provide-materials
  approvals:
    requirementRef: https://webgogol.com/id/requirement/provide-approvals
```

Ответственности должны быть declarative и reusable, если повторяются.

---

# 19. Terms

```yaml
terms:
  minimumTerm: P1M

  renewal:
    mode: automatic
    period: P1M

  cancellation:
    policyRef:
      ref: https://webgogol.com/id/policy/cancellation

  priceChanges:
    policyRef:
      ref: https://webgogol.com/id/policy/price-changes
```

Plan MAY override minimumTerm/renewal, но не должен копировать все общие terms.

---

# 20. Policy base

```yaml
schema: pbp/policy@1
id: https://webgogol.com/id/policy/availability
type: policy
kind: service-level
status: published

name: Monatliche Verfügbarkeit

scope:
  offeringRefs:
    digitalFoundation:
      ref: https://webgogol.com/id/offering/digital-foundation

terms: {}
```

Final RFC SHOULD define specialized schemas:

```text
pbp/policy/service-level@1
pbp/policy/guarantee@1
pbp/policy/cancellation@1
...
```

Base `pbp/policy@1` remains common envelope.

---

# 21. SLA Policy

```yaml
schema: pbp/policy/service-level@1
id: https://webgogol.com/id/policy/digital-foundation-availability
type: policy
kind: service-level
status: published

name: Monatliche Verfügbarkeit

objective:
  metricRef: https://registry.example/id/metric/service-availability
  operator: greater-than-or-equal
  threshold:
    value: "99.00"
    unitRef: pbp-unit:percent
  measurementWindow: calendar-month

measurement:
  methodRef: https://webgogol.com/id/method/website-availability
  evidenceSourceRef: https://webgogol.com/id/evidence/availability-monitoring

exclusions:
  scheduledMaintenance:
    reasonRef: pbp-exclusion:announced-maintenance
  customerSystems:
    reasonRef: pbp-exclusion:customer-controlled-systems
  forceMajeure:
    reasonRef: pbp-exclusion:force-majeure

remedy:
  trigger: objective-not-met
  type: service-credit
  value:
    model: billing-period
    periods: 1
  application: automatic
```

---

# 22. Guarantee Policy

```yaml
schema: pbp/policy/guarantee@1
id: https://webgogol.com/id/policy/delivery-guarantee
type: policy
kind: guarantee
status: published

name: Fertig in 12 Werktagen

condition:
  trigger:
    event: required-customer-materials-accepted
  objective:
    metricRef: https://registry.example/id/metric/delivery-duration
    operator: less-than-or-equal
    threshold:
      value: "12"
      unitRef: pbp-unit:business-day

remedy:
  type: continued-performance
  additionalCharge: false
  until: delivery-completed
```

---

# 23. Rights Policies

## 23.1. Ownership

```yaml
schema: pbp/policy/ownership@1
id: https://webgogol.com/id/policy/digital-foundation-ownership
type: policy
kind: ownership
status: published

assets:
  domain:
    holder: customer
  customerContent:
    holder: customer
  builtWebsite:
    holder: customer
  sourceCode:
    holder: customer
    timing: according-to-contract
  thirdPartyComponents:
    holder: third-party
    usageBasis: component-license
```

## 23.2. Portability / Exit

```yaml
schema: pbp/policy/exit@1
id: https://webgogol.com/id/policy/digital-foundation-exit
type: policy
kind: exit
status: published

trigger:
  event: service-termination

deliveryTarget:
  duration: PT72H

package:
  domain:
    included: true
  customerContent:
    included: true
  builtWebsite:
    included: true

formats:
  deployableFiles:
    valueRef: pbp-export-format:deployable-site-files
```

---

# 24. Claim

```yaml
schema: pbp/claim@1
id: https://webgogol.com/id/claim/platform-cost-models
type: claim
status: published

claimClass: comparative-commercial
claimKind: risk

subject:
  kind: competitor-category
  name: Handwerker-Vermittlungsplattformen

statement: >-
  Vermittlungsplattformen können je nach Anbieter Kontaktgebühren,
  Abonnements oder Paketmodelle verwenden; die dort aufgebaute
  Sichtbarkeit verbleibt innerhalb der jeweiligen Plattform.

evidenceRefs:
  primary:
    ref: https://webgogol.com/id/evidence/platform-pricing-sources

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  assessedAt: 2026-07-06
  reviewEvery: P3M
  maintenanceOwnerRef: agent:content-maintainer

publication:
  staleBehavior: block
  showAsOfDate: true
  showEvidenceLabel: true
```

`confidence` применяется только для inferred/extracted claims, не для owner-declared canonical price.

---

# 25. EvidenceSource

```yaml
schema: pbp/evidence-source@1
id: https://webgogol.com/id/evidence/platform-pricing-sources
type: evidence-source
status: published

name: Öffentliche Anbieterinformationen zu Vermittlungsplattformen
kind: external-web-sources

authority:
  kind: external-source

items:
  myHammer:
    url: https://example.invalid/myhammer-source
    retrievedAt: 2026-07-06
  blauarbeit:
    url: https://example.invalid/blauarbeit-source
    retrievedAt: 2026-07-06
```

URLs in examples are placeholders until verified.

---

# 26. Disclosure

```yaml
schema: pbp/disclosure@1
id: https://webgogol.com/id/disclosure/cloudflare-infrastructure
type: disclosure
status: published

kind: technology-dependency
name: Technischer Infrastrukturanbieter

statement: >-
  Für die technische Bereitstellung werden Dienste von Cloudflare verwendet.

scope:
  offeringRefs:
    digitalFoundation:
      ref: https://webgogol.com/id/offering/digital-foundation

relatedPartyRef:
  ref: https://webgogol.com/id/external-organization/cloudflare

materiality: informative
publication:
  required: true
```

---

# 27. ExternalOrganization и ExternalProduct

```yaml
schema: pbp/external-organization@1
id: https://webgogol.com/id/external-organization/cloudflare
type: external-organization
status: published

name: Cloudflare
officialUrl: https://www.cloudflare.com/
```

Не следует копировать юридический адрес поставщика без ясной причины и проверки актуальности.

ExternalProduct:

```yaml
schema: pbp/external-product@1
id: https://webgogol.com/id/external-product/cloudflare-r2
type: external-product
status: published

name: Cloudflare R2
providerRef:
  ref: https://webgogol.com/id/external-organization/cloudflare
kind: object-storage
```

---

# 28. Credential

```yaml
schema: pbp/credential@1
id: https://example.com/id/credential/meisterbrief
type: credential
status: published

kind: professional-qualification
credentialTypeRef: https://registry.example/id/credential-type/meisterbrief

holderRef:
  ref: https://example.com/id/business/example
issuerRef:
  ref: https://example.org/id/organization/chamber

issuedAt: 2020-05-01
expiresAt: null

verification:
  evidenceRef:
    ref: https://example.com/id/evidence/meisterbrief
  verifiableCredentialRef: null
```

---

# 29. Review и AggregateRating

```yaml
schema: pbp/review@1
id: https://example.com/id/review/external-123
type: review
status: published

subjectRef:
  ref: https://example.com/id/business/example

sourceRef:
  ref: https://example.com/id/review-source/google

rating:
  value: "5"
  best: "5"
  worst: "1"

author:
  displayName: M. Beispiel

publishedAt: 2026-05-01
retrievedAt: 2026-07-01

content:
  mode: linked-only
  sourceUrl: https://example.invalid/review
```

```yaml
schema: pbp/aggregate-rating@1
id: https://example.com/id/aggregate-rating/google
type: aggregate-rating
status: published

subjectRef:
  ref: https://example.com/id/business/example
sourceRef:
  ref: https://example.com/id/review-source/google

ratingValue: "4.8"
ratingCount: 120
bestRating: "5"
worstRating: "1"
observedAt: 2026-07-18T10:00:00Z
freshness: P1D
```

---

# 30. PublicDocument

```yaml
schema: pbp/public-document@1
id: https://webgogol.com/id/document/terms
type: public-document
status: published

kind: terms-and-conditions
name: Allgemeine Geschäftsbedingungen
canonicalUrl: https://webgogol.com/agb/

governance:
  effectiveFrom: 2026-06-01
  reviewedAt: 2026-06-01
  reviewEvery: P1Y
```

Document metadata находится в самом descriptor, не в общем `meta.md`.

---

# 31. Category

```yaml
schema: pbp/category@1
id: https://registry.example/id/category/managed-website-service
type: category
status: published

name: Managed Website Service
broaderRef:
  ref: https://registry.example/id/category/digital-service

externalMappings:
  schemaOrg:
    value: Service
```

Category registry versioning должно быть отдельным RFC.

---

# 32. ComparisonProfile

```yaml
schema: pbp/comparison-profile@1
id: https://registry.example/id/comparison-profile/managed-website-commercial/1
type: comparison-profile
status: published

name: Managed Website — Commercial Comparison

appliesToCategoryRefs:
  managedWebsite:
    ref: https://registry.example/id/category/managed-website-service

dimensions:
  activationPrice:
    valueType: money
    selectorRef: pbp-selector:offering/pricing/activation-charge
    required: false

  recurringPrice:
    valueType: recurring-money
    selectorRef: pbp-selector:offering/pricing/subscription-charge

  firstYearCost:
    valueType: derived-money
    derivationRef: https://registry.example/id/derivation/first-year-cost/1

  minimumTerm:
    valueType: duration
    selectorRef: pbp-selector:offering/terms/minimum-term

  ownership:
    valueType: controlled-value
    selectorRef: pbp-selector:offering/policy/ownership
```

---

# 33. DerivationContract

```yaml
schema: pbp/derivation-contract@1
id: https://registry.example/id/derivation/first-year-cost/1
type: derivation-contract
status: published

name: First-Year Cost
version: 1

inputs:
  plan:
    valueType: offering-plan
  period:
    valueType: duration
    default: P1Y
  usageParameters:
    valueType: parameter-map
    required: false

output:
  valueType: monetary-result
  resultModes:
    exact: true
    range: true
    parameterized: true
    unavailable: true

rounding:
  mode: currency-minor-unit

implementationContract:
  deterministic: true
  sideEffectFree: true
  conformanceSuiteRef: https://registry.example/id/test-suite/first-year-cost/1
```

---

# 34. BuyerViewSchema

```yaml
schema: pbp/buyer-view-schema@1
id: https://registry.example/id/buyer-view/standard/1
type: buyer-view-schema
status: published

name: Standard Buyer View

sections:
  identity:
    order: 1
    required: true
  suitability:
    order: 2
    required: true
  value:
    order: 3
    required: true
  package:
    order: 4
    required: true
  options:
    order: 5
    required: false
  pricing:
    order: 6
    required: true
  buyerResponsibilities:
    order: 7
    required: false
  fulfillment:
    order: 8
    required: true
  assurances:
    order: 9
    required: false
  rights:
    order: 10
    required: false
  lifecycle:
    order: 11
    required: true
  limitations:
    order: 12
    required: false
```

---

# 35. MachineUsePolicy

```yaml
schema: pbp/machine-use-policy@1
id: https://webgogol.com/id/machine-use-policy/public-profile
type: machine-use-policy
status: published

scope:
  resources:
    businessProfile: true
    catalog: true
    claims: true
    evidence: true

permissions:
  discovery: allowed
  retrieval: allowed
  indexing: allowed
  summarization: allowed
  quotation: conditional
  training: not-declared

requirements:
  attribution: required
  sourceLink: required
```

Проекции могут создавать `llms.txt`-подобные artifacts, но каноническая policy остается neutral.

---

# 36. Localisation metadata

Schema registry должен публиковать machine-readable field annotations:

```yaml
fieldSemantics:
  /name:
    localization: localizable
  /summary:
    localization: localizable
  /pricing:
    localization: invariant
  /audience/segments:
    localization: invariant
  /customerResponsibilities/*/description:
    localization: localizable
```

Non-default locale override violation является build error.

---

# 37. Target curated file tree

```text
business-profile/
├── package.yaml
├── registry/
│   ├── categories/
│   ├── comparison-profiles/
│   ├── derivations/
│   ├── buyer-views/
│   ├── units/
│   ├── metrics/
│   └── identifier-schemes/
├── de/
│   ├── organization/
│   │   ├── businesses/
│   │   ├── legal-identities/
│   │   ├── brands/
│   │   ├── places/
│   │   ├── contact-points/
│   │   └── web-presences/
│   ├── catalog/
│   │   ├── catalogs/
│   │   ├── products/
│   │   ├── product-groups/
│   │   ├── product-variants/
│   │   ├── entries/
│   │   ├── offerings/
│   │   └── policies/
│   ├── trust/
│   │   ├── claims/
│   │   ├── evidence/
│   │   ├── disclosures/
│   │   ├── credentials/
│   │   ├── reviews/
│   │   └── aggregate-ratings/
│   ├── documents/
│   └── machine-use/
├── uk/
└── ru/
```

For Webgogol registry may live in a separate package/repository; local project references it by URI.

---

# 38. Bulk catalog logical form

A bulk source may expose records equivalent to:

```json
{
  "schema": "pbp/catalog-entry@1",
  "id": "https://shop.example/id/catalog-entry/sku-123",
  "type": "catalog-entry",
  "catalogRef": {"ref": "https://shop.example/id/catalog/main"},
  "itemRef": {"ref": "https://manufacturer.example/id/product/gtin-04012345678901"},
  "localIdentifiers": {"sku": "SKU-123"}
}
```

File-per-entity is not mandatory for high-cardinality storage.

---

# 39. Минимальный тривиальный товар

PBP не должен быть громоздким для простого товара:

```yaml
# Product
schema: pbp/product@1
id: https://bakery.example/id/product/bread-roll
type: product
kind: physical-good
status: published
name: Brötchen
classification:
  categoryRef:
    ref: https://registry.example/id/category/bread-roll
```

```yaml
# CatalogEntry
schema: pbp/catalog-entry@1
id: https://bakery.example/id/catalog-entry/bread-roll
type: catalog-entry
status: published
name: Brötchen
catalogRef:
  ref: https://bakery.example/id/catalog/main
itemRef:
  ref: https://bakery.example/id/product/bread-roll
localIdentifiers:
  sku: BREAD-001
```

```yaml
# Offering
schema: pbp/offering@1
id: https://bakery.example/id/offering/bread-roll
type: offering
status: published
name: Brötchen
businessRef:
  ref: https://bakery.example/id/business/bakery
catalogEntryRef:
  ref: https://bakery.example/id/catalog-entry/bread-roll
pricing:
  currency: EUR
  tax:
    treatment: included
    jurisdiction:
      countryCode: DE
  charges:
    purchase:
      type: one-time
      purpose: purchase
      amount:
        model: fixed
        value: "0.50"
  plans:
    standard:
      chargeRefs:
        purchase:
          ref: purchase
```

Никакие SLA, Policies, variants или lifecycle blocks не обязательны, если не применимы.

---

# 40. Extension mechanism

Typed extension:

```yaml
extensions:
  https://webgogol.com/ns/sichtpass/1:
    passportProfileRef: ...
```

Требования:

- ключ — URI namespace;
- extension имеет отдельную schema;
- extension не меняет core semantics;
- неизвестная optional extension не должна ломать core parser;
- required extension объявляется в package capabilities.
