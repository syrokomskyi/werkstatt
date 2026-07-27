# Webgogol PBP Migration — Detailed AI Agent Plan

**Документ:** PBP-MIGRATION-WEBGOGOL  
**Статус:** Execution plan  
**Версия:** 1.0-draft  
**Дата:** 2026-07-18

---

# 1. Миссия агента

Трансформировать действующий набор публичных бизнес-данных Webgogol в новую Public Business Profile модель без сохранения legacy-схем и без обратной совместимости.

Агент должен:

- сохранить подтвержденный смысл исходных данных;
- разнести смешанные сущности по правильным манифестам;
- не придумывать юридические, коммерческие или технические факты;
- не публиковать private operational data;
- создать готовую для будущих RFC структуру;
- обеспечить детерминированную сборку;
- сформировать полный migration report;
- удалить legacy только после проверки целевого графа и проекций.

---

# 2. Входной корпус

Агент обязан обработать все следующие файлы:

| Файл | Текущая роль | Основная проблема |
| --- | --- | --- |
| `company.md` | описание бизнеса | смешивает Business, Brand, market, territory и Product promise |
| `company.claims.yaml` | sidecar metadata | привязан к path, дублирует governance |
| `compliance.md` | даты GoBD | даты без сущности compliance/claim/document |
| `compliance.claims.yaml` | sidecar metadata | path-based, не доказывает compliance |
| `contact.md` | контакты | дублирование email, presentation fields |
| `contact.claims.yaml` | sidecar metadata | path-based |
| `external-services.md` | поставщики/технологии | организации, продукты, роли и email смешаны |
| `legal.md` | юридические/банковские данные | public и private смешаны |
| `legal.claims.yaml` | sidecar metadata | path-based |
| `location.md` | место и service area | Place и territory смешаны, неверный region postalCode |
| `location.claims.yaml` | sidecar metadata | path-based |
| `meta.md` | даты документов | metadata отделены от документов |
| `offer.md` | цены, гарантии, модули, capacity | Product/Offering/Policy/Pricing/runtime смешаны |
| `offer.claims.yaml` | sidecar metadata | path-based pricing metadata |
| `platform-comparison.md` | сравнительное утверждение | Claim, display и disclosure смешаны |
| `platform-comparison.claims.yaml` | расширенный Claim sidecar | дублирует основной файл |
| `services.md` | backup retention | не Service, а Policy/commitment |
| `web.md` | URL и домены | дублирует derivable domain |
| `web.claims.yaml` | sidecar metadata | path-based |

---

# 3. Жесткие правила агента

## 3.1. Не поддерживать legacy

Агент MUST NOT:

- создавать alias fields для старых ключей;
- сохранять `price.monthly` рядом с `pricing.charges`;
- генерировать compatibility layer;
- оставлять старые `*.claims.yaml` как источник;
- сохранять `growthModules`;
- сохранять `capacity` в статическом Offering;
- сохранять presentation-ready strings как canonical data.

## 3.2. Не угадывать

Если факт не подтвержден исходными данными или отдельным решением владельца, агент помечает его в migration report:

```yaml
decision: needs-owner-decision
```

Он не подставляет «разумный» ответ.

## 3.3. Не путать derived и declared

Примеры:

- domain из canonical URL → `derived`;
- first-year cost → `derived`;
- founding year из `company.md` → `business-declared`;
- Backnang postal code из source → `business-declared`, пока не привязан registry evidence;
- «GoBD-compliant» нельзя вывести из трех дат.

## 3.4. Public/private separation

Агент MUST исключить из PBP:

- `bank.*`;
- `tax.taxNumber`;
- пустые банковские поля;
- private operational data.

Если проекту нужен закрытый профиль для invoice generation, агент создает отдельный план, но не помещает данные в public tree.

## 3.5. Preserve source evidence

До удаления legacy агент создает:

- immutable migration branch/tag;
- source inventory;
- content digests;
- field coverage report.

## 3.6. Статусы решения

Каждое source field получает ровно один статус:

- `transformed`;
- `derived-not-stored`;
- `merged`;
- `discarded-as-presentation`;
- `discarded-as-duplicate`;
- `moved-private`;
- `needs-owner-decision`;
- `invalid-source`;
- `not-applicable`.

---

# 4. Обязательные результаты

Агент создает:

1. Новое дерево PBP.
2. Default locale `de` как полное каноническое основание.
3. Locale overrides для существующих локалей проекта, если соответствующие исходные тексты доступны.
4. JSON Schema stubs или ссылки на будущие schemas.
5. Все Webgogol entities.
6. Validation report.
7. Buyer View для Digitales Fundament.
8. AI Answer projection.
9. Schema.org projection draft.
10. Source-to-target coverage matrix.
11. Owner decision register.
12. Legacy deletion manifest.
13. Final migration summary.

---

# 5. Целевое дерево первой миграции

```text
business-profile/
├── package.yaml
├── de/
│   ├── organization/
│   │   ├── businesses/webgogol.md
│   │   ├── legal-identities/webgogol.md
│   │   ├── brands/webgogol.md
│   │   ├── places/backnang.md
│   │   ├── contact-points/general-email.md
│   │   └── web-presences/primary.md
│   ├── catalog/
│   │   ├── catalogs/main.md
│   │   ├── products/
│   │   │   ├── digital-foundation.md
│   │   │   ├── business-website.md
│   │   │   ├── website-operation.md
│   │   │   ├── visibility.md
│   │   │   ├── booking.md
│   │   │   ├── reputation.md
│   │   │   ├── multilingual.md
│   │   │   └── automation.md
│   │   ├── entries/
│   │   │   ├── digital-foundation.md
│   │   │   ├── visibility.md
│   │   │   ├── booking.md
│   │   │   ├── reputation.md
│   │   │   ├── multilingual.md
│   │   │   └── automation.md
│   │   ├── offerings/
│   │   │   ├── digital-foundation.md
│   │   │   ├── visibility.md
│   │   │   ├── booking.md
│   │   │   ├── reputation.md
│   │   │   ├── multilingual.md
│   │   │   └── automation.md
│   │   └── policies/
│   │       ├── delivery-guarantee.md
│   │       ├── availability-sla.md
│   │       ├── small-changes.md
│   │       ├── support-response.md
│   │       ├── ownership.md
│   │       ├── portability.md
│   │       ├── exit-package.md
│   │       ├── cancellation.md
│   │       ├── renewal.md
│   │       ├── price-changes.md
│   │       └── backup-retention.md
│   ├── trust/
│   │   ├── claims/platform-cost-models.md
│   │   ├── evidence/platform-pricing-sources.md
│   │   ├── disclosures/
│   │   │   ├── cloudflare.md
│   │   │   ├── pipedrive.md
│   │   │   ├── make.md
│   │   │   ├── uchat.md
│   │   │   └── astro.md
│   │   └── external-organizations/
│   │       ├── cloudflare.md
│   │       ├── pipedrive.md
│   │       └── make.md
│   └── documents/
│       ├── terms.md
│       ├── privacy.md
│       ├── imprint.md
│       ├── accessibility.md
│       ├── withdrawal.md
│       └── withdrawal-form.md
├── uk/
└── ru/
```

Некоторые disclosure-файлы могут быть объединены после materiality review. Агент не обязан публиковать каждую внутреннюю технологию.

---

# 6. Фаза 0 — Подготовка

## 6.1. Создать ветку

Пример:

```text
migration/pbp-v1-webgogol
```

## 6.2. Зафиксировать source snapshot

- commit hash;
- список файлов;
- SHA-256 каждого файла;
- дата;
- текущий build status.

## 6.3. Запретить параллельное изменение legacy

На период миграции изменения бизнес-фактов должны идти либо:

- через migration branch;
- через отдельный change log, который агент применит перед cutover.

## 6.4. Создать migration workspace

```text
migration/
├── inventory.yaml
├── field-map.yaml
├── decisions.yaml
├── unresolved.yaml
├── reports/
└── generated/
```

---

# 7. Фаза 1 — Инвентаризация и классификация

Для каждого source field агент создает запись:

```yaml
source:
  file: offer.md
  path: price.monthlyAmount
  value: "70"
classification:
  entity: offering
  block: pricing
  semanticRole: recurring-charge
resolution:
  status: transformed
  targetEntityId: https://webgogol.com/id/offering/digital-foundation
  targetPath: /pricing/charges/monthlySubscription/amount/value
```

## 7.1. Проверки

- empty strings;
- duplicate semantics;
- presentation markup;
- dates with non-RFC format;
- possibly private data;
- claims without evidence;
- mathematical contradictions;
- missing units;
- missing tax treatment;
- unsupported runtime state.

---

# 8. Фаза 2 — Создание package и IDs

## 8.1. Создать `package.yaml`

- defaultLocale: de;
- locales;
- source profile;
- registry references;
- build strictness;
- Buyer View ref.

## 8.2. Зафиксировать ID registry

Агент создает `migration/id-registry.yaml`:

```yaml
business.webgogol: https://webgogol.com/id/business/webgogol
offering.digitalFoundation: https://webgogol.com/id/offering/digital-foundation
```

После утверждения IDs не меняются из-за текста или пути.

## 8.3. Не включать locale в ID

Запрещено:

```text
.../digital-foundation.de
```

---

# 9. Фаза 3 — Organization migration

## 9.1. `company.md`

### Source fields

```text
id
mode
businessType
industry
market
jurisdiction
brand.name
brand.author
brand.tagline
foundingYear
areaServed
description
mission
```

### Mapping

| Source | Target | Решение |
| --- | --- | --- |
| `id` | Business `name`/ID seed | ID URI создается отдельно |
| `mode: bodenstation` | design/canon layer, не Business core | удалить из PBP либо оформить отдельной Brand/design extension |
| `businessType` | `businessModel.typeRef` | transformed |
| `industry` | `industries.*.categoryRef` | transformed, needs registry key |
| `market: b2b` | Business market + Offering audience | Business may state focus; Offering remains authoritative |
| `jurisdiction: Germany` | LegalIdentity jurisdiction, если требуется | не использовать как Offering territory |
| `brand.name` | Brand.name | transformed |
| `brand.author` | responsible person / founder Claim | не использовать `author` для бизнеса |
| `brand.tagline` | Brand.tagline | transformed |
| `foundingYear` | Business.yearEstablished | transformed |
| `areaServed` | Offering availability territories | удалить из Business; normalize |
| `description` | Business.description | переписать, удалить Offering-specific promises |
| `mission` | Business.mission | transformed after consistency edit |

### Обязательная редактура description

Исходное описание содержит:

- offener Preis;
- schriftliche Bedingungen;
- Notausgang;
- ответственность основателя.

Эти facts должны поступать из Offering/Policies. Business.description должен описывать студию, не повторяя конкретные условия.

## 9.2. `company.claims.yaml`

- удалить sidecar;
- `foundingYear.asOf`, owner и review policy перенести в Business governance, если нужны;
- `confidence: high` удалить;
- provenance считать `business-declared`.

---

# 10. Фаза 4 — Legal identity и privacy boundary

## 10.1. `legal.md`

### Public transform

| Source                         | Target                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| `companyName`                  | LegalIdentity.legalName                                       |
| `owner.fullName`               | LegalIdentity.responsiblePerson.name                          |
| `owner.address.*`              | Place + LegalIdentity.registeredPlaceRef                      |
| `chamber.*`                    | public registration/credential only if non-empty and verified |
| `tax.vatIdOrSmallBusinessNote` | public tax disclosure if intentionally public and non-empty   |

### Move private

| Source          | Action                                 |
| --------------- | -------------------------------------- |
| `bank.*`        | move-private / do not create PBP file  |
| `tax.taxNumber` | move-private / exclude from public PBP |

### Empty fields

Пустые строки не мигрируются как `""`. Они становятся absent/not-declared.

## 10.2. `legal.claims.yaml`

Удалить. Governance LegalIdentity покрывает business-declared public facts.

## 10.3. Owner decision

Агент должен спросить/зафиксировать:

- является ли указанный адрес публичным registered office для PBP;
- какая legal form должна быть объявлена;
- есть ли публичный VAT ID или Kleinunternehmer disclosure;
- есть ли chamber/registry data.

До ответа status LegalIdentity может быть `draft`; production publish запрещен, если website legal projection зависит от этих данных.

---

# 11. Фаза 5 — Place and territory

## 11.1. `location.md`

### Correct transform

- city → Place locality;
- address postalCode брать из Legal address, если совпадает;
- region name → address.administrativeArea;
- country code → address.countryCode;
- city URL MAY быть informative publicUrl;
- region/country URLs обычно не нужны в Place;
- serviceArea → Offering availability.

### Invalid source

`region.postalCode: 71522` — invalid-source. Не мигрировать.

### Multiple Place readiness

Даже если сейчас один Place, Business relation должна быть keyed map with role.

## 11.2. `location.claims.yaml`

Удалить sidecar. Если позже используется public registry, Place может иметь EvidenceSource или external identifier.

---

# 12. Фаза 6 — Contact and Web Presence

## 12.1. `contact.md`

### Mapping

| Source                     | Target                    |
| -------------------------- | ------------------------- |
| `email`                    | ContactPoint.value        |
| `supportEmail` equal email | merge purposes            |
| `phone: ""`                | omit                      |
| `supportPhone: ""`         | omit                      |
| `contactType`              | ContactPoint purpose      |
| `preferredChannels`        | ContactPoint.preferred    |
| `channels[].name`          | local ContactPoint.name   |
| `channels[].kind`          | channel                   |
| `channels[].url`           | derived-not-stored        |
| `channels[].color`         | discarded-as-presentation |
| `channels[].qrData`        | derived-not-stored        |

## 12.2. `contact.claims.yaml`

Удалить. Governance ContactPoint can carry reviewedAt.

## 12.3. `web.md`

- `primaryUrl` → WebPresence.canonicalUrl;
- domains.primary → derived-not-stored;
- domains.german → duplicate/derived; remove.

## 12.4. `web.claims.yaml`

Удалить sidecar.

---

# 13. Фаза 7 — Product decomposition

Из `offer.md` и `company.md` агент должен создать Product entities.

## 13.1. Digitales Fundament

Создать:

- Product `digital-foundation` kind `composite-service`;
- Product `business-website`;
- Product `website-operation`.

Intrinsic composition Digitales Fundament:

```text
business-website
+ website-operation
```

Точный состав требует owner review. Не включать автоматически то, что не заявлено.

## 13.2. Growth modules → Products

Создать самостоятельные Products:

- visibility;
- booking;
- reputation/trust;
- multilingual;
- automation.

Marketing labels могут стать names. Descriptions необходимо очистить от pricing и непроверяемых абсолютных обещаний.

## 13.3. Category/Profile refs

Пока глобальный registry не реализован, использовать versioned local registry stubs:

```text
registry/category/managed-website-service
registry/category/website-visibility-service
...
```

Не смешивать category с comparison profile.

---

# 14. Фаза 8 — Catalog and CatalogEntry

Создать один основной Catalog Webgogol.

Для каждого Product создать CatalogEntry.

CatalogEntry должен содержать:

- local name;
- local SKU, если принято решение;
- offering refs;
- merchandising order.

Если SKU не существует, агент не придумывает его без owner approval. В blueprint SKU предложены как draft-only examples.

---

# 15. Фаза 9 — Main Offering migration

## 15.1. Prices

Source:

```yaml
price.monthlyAmount: "70"
price.yearlyAmount: "700"
price.setupAmount: "200"
```

Target Charges:

- activation one-time `200.00 EUR`;
- monthlySubscription recurring `70.00 EUR` P1M;
- yearlySubscription recurring `700.00 EUR` P1Y.

Plans:

- monthly → activation + monthlySubscription;
- yearly → activation + yearlySubscription.

Presentation strings:

```yaml
price.monthly
price.yearly
price.setup
```

удалить как duplicate presentation.

## 15.2. Tax and buyer type

- buyerType = B2B based on current company market, pending Offering-level confirmation;
- tax treatment = `not-declared` until owner/legal decision;
- tax jurisdiction = DE may be reserved but should not be asserted as full tax rule without confirmation.

## 15.3. Billing day

`billingDay: "1"` → monthly Plan billingDay integer 1.

Owner must confirm whether yearly plan has same billing convention and whether activation is due immediately.

## 15.4. Included changes

`includedChangesPerCycle: "1"` → package allowance:

- subject = completed-small-change;
- included quantity = 1;
- reset P1M for monthly plan.

Unresolved for yearly plan:

- Does allowance reset monthly despite annual billing?
- Or once per annual cycle?

Agent MUST NOT assume. Add owner decision.

## 15.5. Change price

`changePrice: "15"` → usage Charge only after confirming:

- unit is one completed small change;
- tax treatment;
- whether charge applies to all plans;
- definition of small change.

## 15.6. Hourly rate

`hourlyRate: "90"` requires classification:

- separate Offering Engineering Work by Hour;
- overage Charge;
- internal rate to discard.

Agent records `needs-owner-decision` and does not place it in Digitales Fundament until resolved.

---

# 16. Фаза 10 — Module Offering migration

## 16.1. Visibility

Source:

- 29 EUR/month;
- up to 12 target pages;
- service/location focus.

Target:

- Product visibility;
- CatalogEntry visibility;
- Offering visibility;
- recurring Charge 29.00/P1M;
- allowance maximum 12 target pages;
- relation `requires` Digitales Fundament unless owner confirms standalone;
- main Offering relation `optional`.

Owner decisions:

- activation price;
- yearly plan;
- reset/period meaning of 12 target pages;
- definition of target page;
- whether 12 is per month, total active, or initial delivery.

## 16.2. Booking

Source price 29 EUR/month.

Target Product/Entry/Offering. Description should not imply guaranteed 24/7 processing unless exact technical and support scope is defined.

Owner decisions:

- setup cost;
- yearly plan;
- WhatsApp provider and legal/technical scope;
- notification versus booking system;
- dependencies.

## 16.3. Trust/Reputation

Rename machine key preferably `reputation`, while localized name can remain `Vertrauen aufbauen`.

Source price 19 EUR/month.

Owner decisions:

- what moderation means;
- review source;
- whether reviews are customer-supplied or external;
- legal publication rights;
- standalone availability.

## 16.4. Multilingual

Source:

```text
129 EUR one-time / page / language
+29 EUR/month/language
```

Target:

- one-time usage Charge basis page-language;
- recurring usage Charge basis language;
- no selected quantity in Offering;
- required runtime parameters pages/languages for TCO;
- plan(s) with both Charges.

Owner decisions:

- Does 129 apply to every page or only translated page?
- Does 29 apply per additional language per site?
- Is setup charged once or per page?
- Is machine translation included?
- Is review included?
- What happens when source content changes?

## 16.5. Automation

Source range 59–199 EUR/month.

Target recurring range Charge with determination method `individual-assessment`.

Owner decisions:

- setup price;
- factors determining range;
- included integrations;
- third-party costs included or excluded;
- annual plan;
- minimum term.

---

# 17. Фаза 11 — Policies from guarantees

## 17.1. Delivery

Source:

- 12 business days after materials;
- free continued work until launch.

Target Guarantee/Delivery Policy.

Agent must define exact trigger as `required-customer-materials-accepted`, not merely «получены» without acceptance rule.

Owner decisions:

- what constitutes complete materials;
- who records acceptance time;
- weekends/holidays calendar;
- customer-delay suspension;
- force majeure;
- definition of launch.

## 17.2. Availability

Current source contains mathematical ambiguity:

- 99% monthly;
- remedy after downtime over 7 hours.

Agent MUST block final migration until owner selects normative rule:

A. 99% per calendar month, dynamic allowed downtime; or B. maximum 7 hours per calendar month, without calling it exact 99%.

Recommended A.

Need:

- metric;
- monitoring method;
- exclusions;
- remedy;
- automatic/application request;
- start of service;
- planned maintenance.

## 17.3. Small changes

Source:

- 48 hours;
- if missed, next one free.

Need separate concepts:

- included allowance;
- response/completion SLA;
- remedy.

Owner decisions:

- 48 hours business or clock hours;
- from accepted request or receipt;
- definition small change;
- maximum concurrent changes;
- remedy applies to what exact next change;
- remedy expiration.

## 17.4. Response

Source:

- response within 24 hours on business days.

Need Support Response SLA:

- metric first human response;
- business calendar;
- supported channels;
- exclusions;
- no remedy currently declared.

Since no remedy, do not call Guarantee unless owner adds one. It can be SLA/Commitment.

## 17.5. Exit package

Source:

- package in 72 hours on cancellation;
- domain, content, built site;
- transferable.

Create:

- ownership policy;
- portability policy;
- exit package policy.

Owner decisions:

- trigger: notice, effective termination, request, payment status;
- 72 clock hours or business hours;
- source code included?;
- build instructions?;
- credentials/secrets handling;
- third-party licensed components;
- database/data formats;
- deletion after handover.

## 17.6. Backup retention

`services.md.websiteDevelopment.backupRetentionDays: 30`

Create backup retention Policy only if this is a public commitment.

Owner decision:

- operational fact or contractual promise;
- what is backed up;
- recovery scope;
- retention rolling window;
- restore fee;
- storage provider disclosure.

---

# 18. Фаза 12 — Terms policies

Current source lacks explicit details for:

- minimum term;
- automatic renewal;
- cancellation notice;
- price changes.

Even though architecture requires them, agent MUST NOT invent.

Create draft Policy files with status `draft` and unresolved markers only in migration workspace, not in production PBP.

Required owner/legal decisions:

1. Monthly minimum term.
2. Yearly minimum term.
3. Renewal mode.
4. Notice period.
5. Effective cancellation date.
6. Price-change notice.
7. Customer termination right after change.
8. Suspension/nonpayment rules.

---

# 19. Фаза 13 — Capacity removal

Delete `offer.md.capacity` from PBP.

Mapping:

| Field             | Action                                          |
| ----------------- | ----------------------------------------------- |
| `enabled`         | discarded-runtime-legacy                        |
| `timezone`        | not needed for static Offering                  |
| `startsAt`        | discard                                         |
| `cadence`         | discard                                         |
| `slotRange`       | discard                                         |
| `maxSlotsPerWave` | discard                                         |
| `display.*`       | discard presentation/runtime                    |
| `reservations.*`  | discard from PBP; may remain in Bordbuch system |

If business wants public «subject to confirmation», add static availability mode only after owner approval.

---

# 20. Фаза 14 — Claims and evidence

## 20.1. Platform comparison

Merge `platform-comparison.md` and `platform-comparison.claims.yaml` into one Claim.

Exact field disposition:

| Source field          | Target/action                                             |
| --------------------- | --------------------------------------------------------- |
| `id`                  | Claim ID seed; final ID is stable HTTPS URI               |
| `comparedEntity.*`    | Claim.subject                                             |
| `claimKind`           | Claim.claimKind                                           |
| `statement`           | Claim.statement                                           |
| `display.pageText`    | discarded-as-presentation; generated from Claim.statement |
| `display.disclosure`  | Claim.publication settings + assessedAt                   |
| `display.sourceLabel` | EvidenceSource.name / projection label                    |
| sidecar `claimClass`  | Claim.claimClass                                          |
| sidecar `provenance`  | Claim authority kind                                      |
| sidecar `asOf`        | governance.assessedAt                                     |
| sidecar `reviewEvery` | governance.reviewEvery                                    |
| sidecar `sourceRef`   | EvidenceSource ref, after resolving actual sources        |
| sidecar `criticality` | publication.staleBehavior/build policy                    |
| sidecar `confidence`  | remove unless claim was machine-inferred                  |

Prefer richer sidecar metadata where it does not conflict:

- class comparative-commercial;
- external provenance;
- assessedAt 2026-07-06;
- reviewEvery P3M;
- criticality blocking;
- public disclosure settings.

Remove duplicated display text.

## 20.2. Evidence

Current source says only «öffentliche Anbieterinformationen» and names examples. This is insufficient EvidenceSource.

Agent creates unresolved evidence register and MUST obtain exact source URLs/snapshots before publishing Claim as current.

Until then:

- Claim status `draft`; or
- production projection suppresses it.

## 20.3. Claims sidecars

All other `*.claims.yaml` are deleted after governance mapping.

---

# 21. Фаза 15 — Compliance and public documents

## 21.1. `compliance.md`

Three GoBD dates do not establish GoBD compliance.

Agent must choose one of:

- map dates to a specific PublicDocument descriptor if such document exists;
- create a draft Claim `gobd-process-reviewed` with evidence requirement;
- discard unsupported compliance implication.

Default: do not publish a GoBD compliance Claim.

## 21.2. `meta.md`

Create descriptors:

| Source field                     | Target document       |
| -------------------------------- | --------------------- |
| `agbEffectiveDate`               | terms.effectiveFrom   |
| `agbNextReviewDate`              | terms.review schedule |
| `barrierefreiheitCreationDate`   | accessibility         |
| `barrierefreiheitLastReviewDate` | accessibility         |
| `datenschutzCreationDate`        | privacy               |
| `impressumLastUpdateDate`        | imprint               |
| `widerrufCreationDate`           | withdrawal            |
| `widerrufFormCreationDate`       | withdrawal-form       |

Convert date format `2026/06/01` or strings to ISO `2026-06-01`.

Agent must not claim document exists if corresponding page/file is absent. Descriptor can remain draft until existence verified.

---

# 22. Фаза 16 — External services and disclosures

## 22.1. Classify every source value

| Source                  | Classification                                           |
| ----------------------- | -------------------------------------------------------- |
| Cloudflare Germany GmbH | ExternalOrganization candidate                           |
| hostingAndCdn           | relationship/disclosure role                             |
| Pipedrive Germany GmbH  | ExternalOrganization candidate                           |
| crm                     | internal operational dependency; public only if material |
| Make                    | ExternalOrganization/Product candidate                   |
| Astro                   | technology/framework, not organization                   |
| UChat                   | ExternalProduct/provider candidate                       |
| Cloudflare R2           | ExternalProduct                                          |
| email hi@webgogol.com   | duplicate ContactPoint, remove                           |
| payments empty          | omit                                                     |

## 22.2. Verify before publication

Agent must not trust embedded legal addresses as permanent current facts. It should either:

- create minimal records with name and official URL after verification;
- omit legal address;
- mark source date.

## 22.3. Materiality review

Not every internal tool needs public disclosure.

Agent creates matrix:

```text
Tool | Buyer impact | Privacy impact | Contract dependency | Public disclosure decision
```

Cloudflare hosting may be material. Astro framework may be irrelevant to buyer and belong in technical documentation, not Disclosure.

---

# 23. Фаза 17 — Localization

## 23.1. Default locale

`de` contains full facts.

## 23.2. Other locale records

Only localizable fields are written.

Agent MUST NOT copy pricing into `uk`/`ru` files.

## 23.3. Fallback report

Before cutover:

- list every fallback;
- classify acceptable/unacceptable;
- required public page names must be translated;
- machine facts should intentionally fallback/inherit.

## 23.4. Unknown source translations

If previous localized files are not in migration corpus, agent creates only German canonical manifests and marks localization task separately. It must not machine-translate silently into production without review policy.

---

# 24. Фаза 18 — Compile and validate

Required tests:

1. All entities parse.
2. No duplicate IDs.
3. All refs resolve.
4. No locale suffix IDs.
5. No presentation-ready money strings in canonical fields.
6. No `<br>` in data.
7. No empty strings.
8. No sensitive data.
9. No legacy keys.
10. Plans reference existing Charges.
11. Optional Offering relations resolve.
12. Requires/incompatible graph valid.
13. SLA completeness.
14. Guarantee remedies.
15. Claim freshness/evidence.
16. Buyer View required sections.
17. first-year cost results.
18. Schema.org projection generated.
19. AI Answer projection generated.
20. sourceRevision attached.

---

# 25. Фаза 19 — Projection equivalence review

Agent compares old website-facing facts and new projections.

Matrix:

```yaml
oldFact: "70 € / Monat"
newSource: offering.pricing...
newProjection: "70 € / Monat"
semanticStatus: equivalent
```

Categories:

- exact-equivalent;
- semantically-improved;
- intentionally-removed;
- requires-owner-decision;
- unsupported-old-claim.

No legacy removal while contract-critical old fact lacks mapped target or explicit discard decision.

---

# 26. Фаза 20 — Cutover

## Preconditions

- owner decision register closed for blocking items;
- all production entities published;
- validation clean;
- website uses only PBP projections;
- no direct reads of legacy files;
- golden tests pass;
- backup source tag exists.

## Actions

1. Switch consumers to PBP.
2. Build staging.
3. Perform visual/content review.
4. Verify structured data.
5. Verify contract/CRM adapters.
6. Delete legacy files.
7. Run grep for legacy keys/path references.
8. Commit deletion and cutover.
9. Tag release.

---

# 27. Legacy deletion manifest

```yaml
files:
  company.md: delete
  company.claims.yaml: delete
  compliance.md: delete
  compliance.claims.yaml: delete
  contact.md: delete
  contact.claims.yaml: delete
  external-services.md: delete
  legal.md: delete-after-private-extraction
  legal.claims.yaml: delete
  location.md: delete
  location.claims.yaml: delete
  meta.md: delete
  offer.md: delete
  offer.claims.yaml: delete
  platform-comparison.md: delete
  platform-comparison.claims.yaml: delete
  services.md: delete
  web.md: delete
  web.claims.yaml: delete
```

Agent must verify no import/reference remains.

---

# 28. Owner decision register — blocking

Минимальный список:

## Business/legal

1. Public legal form.
2. Public registered address approval.
3. VAT/Kleinunternehmer public disclosure.
4. Exact business jurisdiction semantics.

## Pricing

5. Are prices gross, net, tax-exempt or not declared?
6. Activation payment timing.
7. Monthly/yearly renewal.
8. Cancellation notice.
9. Yearly plan allowance reset.
10. Meaning of 90 EUR hourly rate.

## SLA/guarantees

11. 99% versus fixed 7-hour rule.
12. Business-day calendar.
13. Delivery start trigger.
14. Definition of small change.
15. 48 business or clock hours.
16. Remedy process.
17. 24-hour response measurement.
18. Exit trigger and 72-hour type.
19. Exact exit package contents.
20. Backup retention as public commitment or internal operation.

## Add-ons

21. Standalone acquisition for every add-on.
22. Activation/yearly plans for every add-on.
23. Visibility allowance semantics.
24. Multilingual billing basis.
25. Automation range determinants.

## Claims/evidence

26. Exact sources for platform comparison.
27. Whether claim remains blocking.
28. GoBD statement meaning and evidence.

---

# 29. Agent behavior on unresolved items

The agent must not stop the entire technical migration for every nonblocking uncertainty.

It should:

- create valid draft manifests;
- isolate unresolved facts;
- mark production exclusion;
- continue with confirmed entities;
- block only final publication/cutover for blocking decisions.

Never place placeholder such as `TODO`, `TBD`, `unknown` in published canonical field unless schema explicitly represents `not-declared`.

---

# 30. Migration report format

```yaml
schema: pbp/migration-report@1
sourceRevision: ...
targetRevision: ...

summary:
  sourceFiles: 19
  sourceFields: 0
  transformed: 0
  derivedNotStored: 0
  discardedPresentation: 0
  discardedDuplicate: 0
  movedPrivate: 0
  unresolved: 0
  invalidSource: 0

blockingDecisions: []
validation:
  errors: []
  warnings: []

legacyDeletion:
  safe: false
  blockers: []
```

---

# 31. Acceptance criteria

Migration считается завершенной, когда:

1. Все 19 source files учтены в coverage report.
2. Каждое source field классифицировано.
3. Все public facts имеют один target location.
4. Private facts не присутствуют в PBP.
5. Нет старых `*.claims.yaml`.
6. Нет `growthModules`, `capacity`, presentation price strings.
7. Digitales Fundament и каждый add-on представлены Product + CatalogEntry + Offering.
8. Main pricing разложен Charge + Plan.
9. Policies отделены.
10. Platform comparison представлен Claim + Evidence.
11. Document dates находятся в PublicDocument descriptors.
12. Buyer View строится без чтения legacy.
13. First-year cost вычисляется правильно.
14. Все refs разрешаются.
15. Все blocking owner decisions закрыты.
16. Production build clean.
17. Website staging показывает согласованные данные.
18. Git содержит source snapshot и migration commits.
19. Legacy удален.
20. После удаления legacy тесты остаются зелеными.

---

# 32. Master instruction for the migration agent

Ниже — рекомендуемая постановка агенту после появления схем и tooling.

```text
Ты выполняешь необратимую структурную миграцию публичных бизнес-данных Webgogol
из legacy-файлов в Public Business Profile pbp/*@1.

Цель — не переписать YAML в другой YAML, а восстановить правильные сущности,
связи и единственный источник истины.

Обязательные правила:
1. Не поддерживай legacy и не создавай compatibility aliases.
2. Не придумывай факты. Все неоднозначности заноси в owner decision register.
3. Не публикуй private operational data.
4. Product, CatalogEntry и Offering должны быть отдельными сущностями.
5. Growth modules преобразуй в самостоятельные Product/CatalogEntry/Offering.
6. Price преобразуй в pricing.charges + pricing.plans + pricing.adjustments.
7. Guarantees/SLA/rights преобразуй в typed Policy.
8. Claims sidecars удали после переноса governance; comparative claim преобразуй
   в Claim + EvidenceSource.
9. Capacity block не переносится в статический PBP.
10. Default locale de содержит invariant facts; другие locale-файлы содержат
    только разрешенные localized overrides.
11. Для каждого source field создай mapping record и итоговый статус.
12. На каждом этапе запускай schema, graph, locale, pricing, policy и privacy checks.
13. Legacy удаляй только после чистой сборки и coverage=100%.
14. Все изменения делай в отдельной migration branch и фиксируй атомарными commits.

Используй в качестве нормативной архитектуры документы:
- 01-PBP-System-Specification.md
- 02-PBP-Entity-and-Field-Model.md
- 03-PBP-Compiler-Validation-and-Projections.md
- 05-Webgogol-Target-Manifest-Blueprint.md

На выходе предоставь:
- новое дерево manifests;
- migration report;
- unresolved owner decisions;
- validation reports;
- Buyer View;
- AI Answer projection;
- Schema.org draft;
- legacy deletion proof.
```
