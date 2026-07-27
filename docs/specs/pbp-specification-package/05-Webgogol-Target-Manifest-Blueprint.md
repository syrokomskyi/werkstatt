# Webgogol Target Manifest Blueprint

**Документ:** PBP-WEBGOGOL-BLUEPRINT  
**Статус:** Design blueprint, not final commercial/legal truth  
**Версия:** 0.9  
**Дата:** 2026-07-18

---

# 1. Назначение

Этот документ показывает целевую форму PBP-манифестов Webgogol после миграции.

Он служит:

- эталоном структуры;
- источником golden fixtures;
- основой для будущих RFC examples;
- контрольной точкой для migration agent.

Значения с комментариями `OWNER DECISION` нельзя публиковать до подтверждения. В production manifests комментарии и migration annotations удаляются.

---

# 2. Package

```yaml
# business-profile/package.yaml
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

buyerViewSchemaRef:
  ref: https://registry.example/id/buyer-view/standard/1

build:
  strict: true
  failOnWarnings: false
  publishStatuses:
    - published
```

---

# 3. Business

```yaml
# de/organization/businesses/webgogol.md
---
schema: pbp/business@1
id: https://webgogol.com/id/business/webgogol
type: business
status: published

name: Webgogol
summary: Moderne, zuverlässige Engineering-Webstudio in Deutschland.
description: >-
  Webgogol entwickelt und betreibt geordnete digitale Grundlagen für
  kleine Unternehmen und Handwerksbetriebe.

businessModel:
  typeRef: pbp-business-type:founder-led-engineering-studio

markets:
  b2b:
    valueRef: pbp-buyer-type:b2b

industries:
  webEngineering:
    categoryRef: https://registry.example/id/industry/web-engineering

yearEstablished: 2026

mission: >-
  Eine geordnete, dauerhaft betreute digitale Präsenz als unterstützte
  Infrastruktur und nicht als isoliertes Einmalprojekt bereitstellen.

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

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
  reviewEvery: P1Y
  maintenanceOwnerRef: agent:business-maintainer
---
```

Removed from Business:

- prices;
- Notausgang details;
- service territories;
- SLA;
- `mode: bodenstation`.

`bodenstation` can remain in the separate canon/design system, not PBP core.

---

# 4. Brand

```yaml
# de/organization/brands/webgogol.md
---
schema: pbp/brand@1
id: https://webgogol.com/id/brand/webgogol
type: brand
status: published

name: Webgogol
tagline: Digitales Fundament für kleines Gewerbe und Handwerk

ownerBusinessRef:
  ref: https://webgogol.com/id/business/webgogol

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
---
```

`author: Andrii Syrokomskyi` is not a Brand field. Founder/responsible person belongs to Business/LegalIdentity or a Person entity in a later RFC.

---

# 5. LegalIdentity

```yaml
# de/organization/legal-identities/webgogol.md
---
schema: pbp/legal-identity@1
id: https://webgogol.com/id/legal-identity/webgogol
type: legal-identity
status: draft # OWNER DECISION required

legalName: Webgogol

legalForm:
  status: not-declared # OWNER DECISION

responsiblePerson:
  name: Andrii Syrokomskyi

registeredPlaceRef:
  ref: https://webgogol.com/id/place/backnang

publicIdentifiers: {}
publicRegistrations: {}

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
  maintenanceOwnerRef: agent:business-maintainer
---
```

Excluded:

- tax number;
- bank data;
- empty chamber fields.

---

# 6. Place

```yaml
# de/organization/places/backnang.md
---
schema: pbp/place@1
id: https://webgogol.com/id/place/backnang
type: place
status: draft # publish after public-address confirmation

name: Backnang
kind: registered-office

address:
  street: Elly-Heuss-Knapp-Weg
  streetNumber: "29"
  postalCode: "71522"
  locality: Backnang
  administrativeArea: Baden-Württemberg
  countryCode: DE

publicUrl: https://www.backnang.de/

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
---
```

No postal code on the region object. No `serviceArea` here.

---

# 7. ContactPoint

```yaml
# de/organization/contact-points/general-email.md
---
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

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
  reviewEvery: P1Y
---
```

`mailto:` and QR are projections.

---

# 8. WebPresence

```yaml
# de/organization/web-presences/primary.md
---
schema: pbp/web-presence@1
id: https://webgogol.com/id/web-presence/primary
type: web-presence
status: published

name: Webgogol Website
kind: primary-website
canonicalUrl: https://webgogol.com/

businessRef:
  ref: https://webgogol.com/id/business/webgogol

control:
  status: business-controlled

locales:
  de: de
  uk: uk
  ru: ru

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  reviewedAt: 2026-07-18
---
```

---

# 9. Main Catalog

```yaml
# de/catalog/catalogs/main.md
---
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
---
```

---

# 10. Digitales Fundament Product

```yaml
# de/catalog/products/digital-foundation.md
---
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
    operations:
      ref: https://registry.example/id/comparison-profile/managed-website-operations/1

purpose:
  statement: >-
    Eine verlässliche geschäftliche Präsenz im Internet als betreute
    und übertragbare Infrastruktur bereitstellen.

outcomes:
  onlinePresence:
    name: Professionelle Online-Präsenz
  ownership:
    name: Kontrolle über wesentliche digitale Bestandteile
  operation:
    name: Laufender technischer Betrieb

deliverables:
  deployedWebsite:
    kind: digital-asset
    name: Veröffentlichte Unternehmenswebsite

intrinsicComposition:
  businessWebsite:
    productRef:
      ref: https://webgogol.com/id/product/business-website
  websiteOperation:
    productRef:
      ref: https://webgogol.com/id/product/website-operation

externalIdentifiers: {}
---
```

---

# 11. Component Products

```yaml
# de/catalog/products/business-website.md
---
schema: pbp/product@1
id: https://webgogol.com/id/product/business-website
type: product
kind: digital-good
status: published

name: Unternehmenswebsite
summary: Strukturierte, veröffentlichte Website für den Geschäftsbetrieb.

authorityRef:
  ref: https://webgogol.com/id/business/webgogol

classification:
  categoryRef:
    ref: https://registry.example/id/category/business-website
---
```

```yaml
# de/catalog/products/website-operation.md
---
schema: pbp/product@1
id: https://webgogol.com/id/product/website-operation
type: product
kind: service
status: published

name: Technischer Website-Betrieb
summary: Laufende technische Bereitstellung und Betreuung der Website.

authorityRef:
  ref: https://webgogol.com/id/business/webgogol

classification:
  categoryRef:
    ref: https://registry.example/id/category/managed-website-operation
---
```

Exact content needs scope review: hosting, maintenance, backups, monitoring and changes should be added only when formally declared.

---

# 12. Digitales Fundament CatalogEntry

```yaml
# de/catalog/entries/digital-foundation.md
---
schema: pbp/catalog-entry@1
id: https://webgogol.com/id/catalog-entry/digital-foundation
type: catalog-entry
status: published

name: Digitales Fundament
summary: >-
  Webgogols öffentliches Katalogangebot für eine erstellte, betriebene
  und übertragbare Unternehmenswebsite.

catalogRef:
  ref: https://webgogol.com/id/catalog/main

itemRef:
  ref: https://webgogol.com/id/product/digital-foundation
  expectedType: product

localIdentifiers: {} # optional SKU after decision

merchandising:
  featured: true
  displayOrder: 10

offeringRefs:
  standard:
    ref: https://webgogol.com/id/offering/digital-foundation
---
```

---

# 13. Digitales Fundament Offering

```yaml
# de/catalog/offerings/digital-foundation.md
---
schema: pbp/offering@1
id: https://webgogol.com/id/offering/digital-foundation
type: offering
status: draft # publish after blocking decisions

name: Digitales Fundament
summary: >-
  Erstellung, Veröffentlichung und laufender technischer Betrieb einer
  übertragbaren Unternehmenswebsite.

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
  included:
    businessWebsite:
      itemRef:
        ref: https://webgogol.com/id/product/business-website
    websiteOperation:
      itemRef:
        ref: https://webgogol.com/id/product/website-operation

  allowances:
    smallChanges:
      subjectRef: https://registry.example/id/metric/completed-small-change
      includedQuantity:
        value: "1"
        unitRef: pbp-unit:change
      resetPeriod: P1M # OWNER DECISION for yearly plan
      overageChargeRef: additionalSmallChange

pricing:
  currency: EUR

  tax:
    treatment: not-declared # OWNER/LEGAL DECISION
    jurisdiction:
      countryCode: DE

  charges:
    activation:
      type: one-time
      purpose: activation
      amount:
        model: fixed
        value: "200.00"
      trigger:
        event: contract-start

    monthlySubscription:
      type: recurring
      purpose: subscription
      amount:
        model: fixed
        value: "70.00"
      recurrence: P1M

    yearlySubscription:
      type: recurring
      purpose: subscription
      amount:
        model: fixed
        value: "700.00"
      recurrence: P1Y

    additionalSmallChange:
      type: usage
      purpose: additional-service
      basis:
        metricRef: https://registry.example/id/metric/completed-small-change
        unitRef: pbp-unit:change
      amount:
        model: unit-rate
        unitValue: "15.00"

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
        minimumTerm: P1M # OWNER DECISION
        renewal:
          mode: automatic # OWNER DECISION
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
        minimumTerm: P1Y # OWNER DECISION
        renewal:
          mode: automatic # OWNER DECISION
          period: P1Y

acquisition:
  channelRefs:
    email:
      ref: https://webgogol.com/id/contact-point/general-email

fulfillment:
  mode: service-delivery
  startTrigger:
    event: required-customer-materials-accepted
  target:
    duration:
      value: "12"
      unitRef: pbp-unit:business-day
  deliveryMethods:
    deployment:
      valueRef: pbp-delivery-method:digital-deployment

customerResponsibilities:
  materials:
    statement: Der Kunde stellt die erforderlichen Unternehmensdaten und Inhalte bereit.
  approvals:
    statement: Der Kunde erteilt erforderliche Freigaben innerhalb der vereinbarten Frist.

policyRefs:
  delivery:
    ref: https://webgogol.com/id/policy/delivery-guarantee
  availability:
    ref: https://webgogol.com/id/policy/availability-sla
  changes:
    ref: https://webgogol.com/id/policy/small-changes
  support:
    ref: https://webgogol.com/id/policy/support-response
  ownership:
    ref: https://webgogol.com/id/policy/ownership
  portability:
    ref: https://webgogol.com/id/policy/portability
  exit:
    ref: https://webgogol.com/id/policy/exit-package
  cancellation:
    ref: https://webgogol.com/id/policy/cancellation
  renewal:
    ref: https://webgogol.com/id/policy/renewal
  priceChanges:
    ref: https://webgogol.com/id/policy/price-changes
  backupRetention:
    ref: https://webgogol.com/id/policy/backup-retention

relatedOfferings:
  visibility:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/visibility
    acquisition: with-this-offering
  booking:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/booking
    acquisition: with-this-offering
  reputation:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/reputation
    acquisition: with-this-offering
  multilingual:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/multilingual
    acquisition: with-this-offering
  automation:
    relation: optional
    offeringRef:
      ref: https://webgogol.com/id/offering/automation
    acquisition: with-this-offering

governance:
  authorityRef: https://webgogol.com/id/business/webgogol
  effectiveFrom: 2026-07-01
  reviewedAt: 2026-07-18
  reviewEvery: P1Y
  maintenanceOwnerRef: agent:offer-maintainer
---
```

`hourlyRate: 90` is intentionally absent pending classification.

---

# 14. First-year cost expected derivation

Expected fixture, not source:

```yaml
monthly:
  mode: exact
  amount:
    value: "1040.00"
    currency: EUR
  trace:
    - activation: "200.00"
    - monthlySubscription: "12 × 70.00"

yearly:
  mode: exact
  amount:
    value: "900.00"
    currency: EUR
  trace:
    - activation: "200.00"
    - yearlySubscription: "700.00"
```

---

# 15. Visibility Product, Entry and Offering

```yaml
# de/catalog/products/visibility.md
---
schema: pbp/product@1
id: https://webgogol.com/id/product/visibility
type: product
kind: service
status: published
name: Gefunden werden
summary: Zielgerichtete zusätzliche Seiten für relevante Such- und Anfragekontexte.
authorityRef:
  ref: https://webgogol.com/id/business/webgogol
classification:
  categoryRef:
    ref: https://registry.example/id/category/website-visibility-service
---
```

```yaml
# de/catalog/entries/visibility.md
---
schema: pbp/catalog-entry@1
id: https://webgogol.com/id/catalog-entry/visibility
type: catalog-entry
status: published
name: Gefunden werden
catalogRef:
  ref: https://webgogol.com/id/catalog/main
itemRef:
  ref: https://webgogol.com/id/product/visibility
offeringRefs:
  standard:
    ref: https://webgogol.com/id/offering/visibility
---
```

```yaml
# de/catalog/offerings/visibility.md
---
schema: pbp/offering@1
id: https://webgogol.com/id/offering/visibility
type: offering
status: draft
name: Gefunden werden
businessRef:
  ref: https://webgogol.com/id/business/webgogol
catalogEntryRef:
  ref: https://webgogol.com/id/catalog-entry/visibility

package:
  allowances:
    targetPages:
      subjectRef: https://registry.example/id/metric/active-target-page
      includedQuantity:
        maximum: "12"
        unitRef: pbp-unit:page
      # OWNER DECISION: total, monthly delivery, or active maximum

pricing:
  currency: EUR
  tax:
    treatment: not-declared
    jurisdiction:
      countryCode: DE
  charges:
    monthlySubscription:
      type: recurring
      purpose: subscription
      amount:
        model: fixed
        value: "29.00"
      recurrence: P1M
  plans:
    monthly:
      name: Monatlich
      chargeRefs:
        subscription:
          ref: monthlySubscription

relatedOfferings:
  digitalFoundation:
    relation: requires
    offeringRef:
      ref: https://webgogol.com/id/offering/digital-foundation
---
```

---

# 16. Booking Offering outline

```yaml
pricing:
  currency: EUR
  charges:
    monthlySubscription:
      type: recurring
      purpose: subscription
      amount:
        model: fixed
        value: "29.00"
      recurrence: P1M
  plans:
    monthly:
      chargeRefs:
        subscription:
          ref: monthlySubscription
```

Required future scope fields:

- booking channel;
- notifications;
- data processor disclosures;
- dependency;
- service availability;
- support.

---

# 17. Reputation Offering outline

```yaml
pricing:
  currency: EUR
  charges:
    monthlySubscription:
      type: recurring
      purpose: subscription
      amount:
        model: fixed
        value: "19.00"
      recurrence: P1M
```

Use machine key `reputation`; localized marketing name can remain `Vertrauen aufbauen`.

---

# 18. Multilingual Offering

```yaml
# de/catalog/offerings/multilingual.md
---
schema: pbp/offering@1
id: https://webgogol.com/id/offering/multilingual
type: offering
status: draft
name: Mehrsprachigkeit
businessRef:
  ref: https://webgogol.com/id/business/webgogol
catalogEntryRef:
  ref: https://webgogol.com/id/catalog-entry/multilingual

pricing:
  currency: EUR
  tax:
    treatment: not-declared
    jurisdiction:
      countryCode: DE

  charges:
    pageLanguageSetup:
      type: usage
      purpose: activation
      basis:
        metricRef: https://registry.example/id/metric/page-language
        unitRef: pbp-unit:page-language
      amount:
        model: unit-rate
        unitValue: "129.00"

    languageSubscription:
      type: usage-recurring
      purpose: subscription
      basis:
        metricRef: https://registry.example/id/metric/additional-language
        unitRef: pbp-unit:language
      amount:
        model: unit-rate
        unitValue: "29.00"
      recurrence: P1M

  plans:
    standard:
      chargeRefs:
        setup:
          ref: pageLanguageSetup
        subscription:
          ref: languageSubscription

relatedOfferings:
  digitalFoundation:
    relation: requires
    offeringRef:
      ref: https://webgogol.com/id/offering/digital-foundation
---
```

This is parameterized. Buyer quantity is supplied at quote time.

---

# 19. Automation Offering

```yaml
pricing:
  currency: EUR
  charges:
    monthlySubscription:
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

Range factors must later become structured inputs or a Pricing Policy.

---

# 20. Delivery Guarantee

```yaml
# de/catalog/policies/delivery-guarantee.md
---
schema: pbp/policy/guarantee@1
id: https://webgogol.com/id/policy/delivery-guarantee
type: policy
kind: guarantee
status: draft

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

exclusions: {} # OWNER DECISION

remedy:
  type: continued-performance
  additionalCharge: false
  until: delivery-completed
---
```

---

# 21. Availability SLA

Recommended normative interpretation:

```yaml
# de/catalog/policies/availability-sla.md
---
schema: pbp/policy/service-level@1
id: https://webgogol.com/id/policy/availability-sla
type: policy
kind: service-level
status: draft

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
  customerControlledSystems:
    reasonRef: pbp-exclusion:customer-controlled-systems
  forceMajeure:
    reasonRef: pbp-exclusion:force-majeure

remedy:
  trigger: objective-not-met
  type: service-credit
  value:
    model: billing-period
    periods: 1
  application: automatic # OWNER DECISION
---
```

Do not also keep fixed 7 hours unless it is redefined as presentation approximation with explicit non-normative status.

---

# 22. Small Changes Policy

```yaml
# de/catalog/policies/small-changes.md
---
schema: pbp/policy/service-level@1
id: https://webgogol.com/id/policy/small-changes
type: policy
kind: service-level
status: draft

name: Kleine Änderungen

definition:
  subjectRef: https://registry.example/id/service-unit/small-change
  description: OWNER DECISION REQUIRED

objective:
  metricRef: https://registry.example/id/metric/change-completion-duration
  operator: less-than-or-equal
  threshold:
    value: "48"
    unitRef: pbp-unit:hour # OWNER DECISION clock/business
  measurementWindow: per-request

remedy:
  type: free-next-unit
  subjectRef: https://registry.example/id/service-unit/small-change
  quantity:
    value: "1"
    unitRef: pbp-unit:change
  conditions: OWNER DECISION REQUIRED
---
```

---

# 23. Support Response Policy

```yaml
# de/catalog/policies/support-response.md
---
schema: pbp/policy/service-level@1
id: https://webgogol.com/id/policy/support-response
type: policy
kind: service-level
status: draft

name: Antwort innerhalb von 24 Stunden

objective:
  metricRef: https://registry.example/id/metric/first-human-response-duration
  operator: less-than-or-equal
  threshold:
    value: "24"
    unitRef: pbp-unit:hour
  measurementWindow: per-request

calendar:
  mode: business-days
  timezone: Europe/Berlin

channels:
  email:
    contactPointRef:
      ref: https://webgogol.com/id/contact-point/general-email

remedy:
  status: not-declared
---
```

Because remedy is not declared, website must present it as SLA/commitment, not guarantee.

---

# 24. Ownership Policy

```yaml
# de/catalog/policies/ownership.md
---
schema: pbp/policy/ownership@1
id: https://webgogol.com/id/policy/ownership
type: policy
kind: ownership
status: draft

name: Eigentum und Kontrolle

assets:
  domain:
    holder: customer
  customerContent:
    holder: customer
  builtWebsite:
    holder: customer
  sourceCode:
    holder: customer # OWNER/CONTRACT DECISION
    timing: according-to-contract
  thirdPartyComponents:
    holder: third-party
    usageBasis: component-license
---
```

---

# 25. Portability and Exit

```yaml
# de/catalog/policies/portability.md
---
schema: pbp/policy/portability@1
id: https://webgogol.com/id/policy/portability
type: policy
kind: portability
status: draft

name: Übertragbarkeit
supported: true

assets:
  domain:
    transferable: true
  customerContent:
    transferable: true
  builtWebsite:
    transferable: true
  sourceCode:
    transferable: not-declared
---
```

```yaml
# de/catalog/policies/exit-package.md
---
schema: pbp/policy/exit@1
id: https://webgogol.com/id/policy/exit-package
type: policy
kind: exit
status: draft

name: Datenpaket bei Vertragsende

trigger:
  event: OWNER DECISION REQUIRED

deliveryTarget:
  duration: PT72H # OWNER DECISION: clock or business time

package:
  domain:
    included: true
  customerContent:
    included: true
  builtWebsite:
    included: true
  sourceCode:
    included: not-declared

security:
  credentialsHandling: OWNER DECISION REQUIRED
---
```

---

# 26. Backup Retention

```yaml
# de/catalog/policies/backup-retention.md
---
schema: pbp/policy/data-retention@1
id: https://webgogol.com/id/policy/backup-retention
type: policy
kind: data-retention
status: draft

name: Aufbewahrung von Sicherungen

subject:
  valueRef: pbp-data-subject:website-backup

retention:
  duration: P30D
  method: rolling-window

scope:
  status: not-declared

restore:
  status: not-declared
---
```

Publish only if this is a buyer-facing commitment.

---

# 27. Platform Claim

```yaml
# de/trust/claims/platform-cost-models.md
---
schema: pbp/claim@1
id: https://webgogol.com/id/claim/platform-cost-models
type: claim
status: draft # until evidence URLs verified

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
---
```

---

# 28. Evidence placeholder

```yaml
# de/trust/evidence/platform-pricing-sources.md
---
schema: pbp/evidence-source@1
id: https://webgogol.com/id/evidence/platform-pricing-sources
type: evidence-source
status: draft

name: Öffentliche Anbieterinformationen zu Vermittlungsplattformen
kind: external-web-sources

items: {} # exact verified source records required
---
```

---

# 29. Technology Disclosures

A materiality review should decide what is public. A minimal Cloudflare disclosure:

```yaml
# de/trust/disclosures/cloudflare.md
---
schema: pbp/disclosure@1
id: https://webgogol.com/id/disclosure/cloudflare
type: disclosure
status: draft

kind: technology-dependency
name: Technische Bereitstellung
statement: Für die technische Bereitstellung werden Dienste von Cloudflare verwendet.

scope:
  offeringRefs:
    digitalFoundation:
      ref: https://webgogol.com/id/offering/digital-foundation

relatedPartyRef:
  ref: https://webgogol.com/id/external-organization/cloudflare

materiality: informative
publication:
  required: false # OWNER/LEGAL/PRIVACY DECISION
---
```

Do not automatically publish CRM, automation and internal framework choices merely because they were present in `external-services.md`.

---

# 30. Public Documents

```yaml
# de/documents/terms.md
---
schema: pbp/public-document@1
id: https://webgogol.com/id/document/terms
type: public-document
status: draft
kind: terms-and-conditions
name: Allgemeine Geschäftsbedingungen
canonicalUrl: https://webgogol.com/agb/

governance:
  effectiveFrom: 2026-06-01
  reviewedAt: 2026-06-01
  reviewEvery: P1Y
---
```

Equivalent descriptors:

- privacy;
- imprint;
- accessibility;
- withdrawal;
- withdrawal-form.

Verify URLs and actual documents before `published`.

---

# 31. Ukrainian locale override example

```yaml
# uk/catalog/products/digital-foundation.md
---
schema: pbp/product@1
id: https://webgogol.com/id/product/digital-foundation
type: product

name: Цифровий фундамент
summary: >-
  Цифрова основа для малого бізнесу й ремісничих підприємств,
  яку постійно обслуговують і можна передати.

purpose:
  statement: >-
    Забезпечити надійну ділову присутність в Інтернеті як керовану
    та переносну інфраструктуру.

outcomes:
  onlinePresence:
    name: Професійна присутність в Інтернеті
  ownership:
    name: Контроль над основними цифровими складовими
  operation:
    name: Постійна технічна експлуатація
---
```

No pricing, IDs, categories or invariant facts are duplicated.

---

# 32. Expected Buyer View outline

```yaml
identity:
  status: declared
  offering: Digitales Fundament
  provider: Webgogol

suitability:
  status: declared
  buyerTypes: [b2b]
  territories: [DE]

value:
  status: declared
  outcomes:
    - professional online presence
    - control over digital components
    - ongoing operation

package:
  status: declared
  included:
    - business website
    - website operation
  allowances:
    smallChanges: 1 per month

options:
  status: declared
  items:
    - visibility
    - booking
    - reputation
    - multilingual
    - automation

pricing:
  status: declared
  plans:
    monthly:
      activation: 200 EUR
      recurring: 70 EUR/P1M
      firstYearCost: 1040 EUR exact
    yearly:
      activation: 200 EUR
      recurring: 700 EUR/P1Y
      firstYearCost: 900 EUR exact
  tax:
    status: not-declared

buyerResponsibilities:
  status: declared

fulfillment:
  status: declared
  target: 12 business days after accepted materials

assurances:
  status: invalid-until-decisions

rights:
  status: draft

lifecycle:
  status: not-declared-until-policies

limitations:
  status: declared
  items:
    - add-on details may require assessment
```

---

# 33. Blueprint readiness state

The following can be migrated immediately with high confidence:

- Business name, year, general description after editing;
- Brand name/tagline;
- email ContactPoint;
- canonical URL;
- Backnang address structure, pending public confirmation;
- main prices 200/70/700;
- module price numbers and descriptions as draft Offerings;
- 1 included change;
- 15 EUR additional change draft Charge;
- document dates;
- platform Claim metadata.

The following block publication:

- tax treatment;
- legal form/public identifiers;
- subscription lifecycle;
- 99%/7-hour SLA rule;
- detailed remedy mechanics;
- exact ownership/exit scope;
- backup commitment status;
- module quantity semantics;
- evidence URLs;
- meaning of hourly rate.
