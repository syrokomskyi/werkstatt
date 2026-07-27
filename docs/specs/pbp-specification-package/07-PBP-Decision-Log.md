# Public Business Profile — Architecture Decision Log

**Документ:** PBP-ADL  
**Статус:** Baseline decisions  
**Дата:** 2026-07-18

---

# 1. Назначение

Реестр фиксирует решения, принятые до серии RFC. Будущие RFC могут уточнять детали, но изменение решения требует явного нового ADR/RFC с обоснованием.

---

## ADR-001 — Название системы

**Решение:** система называется **Public Business Profile (PBP)**.

**Причина:** охватывает бизнес, каталог, предложения, доверие и публичные проекции.

**Не выбрано:** UOM как основное имя — слишком сфокусировано на Offering и не покрывает полный business graph.

---

## ADR-002 — PBP является логической моделью

**Решение:** PBP не требует одного физического формата хранения.

**Допустимо:** Markdown/Git, datasets, database, external adapters.

**Причина:** один файл на сущность не масштабируется на сотни тысяч variants.

---

## ADR-003 — Федеративная идентичность продуктов

**Решение:** Product имеет глобальный URI и authority, но не обязан рождаться в одном центральном registry.

**Не выбрано:** единый центральный реестр всех Products мира.

**Причина:** governance, identity disputes, custom services, handmade goods and long-term survivability.

---

## ADR-004 — Глобальный слой стандартизирует семантику

**Решение:** глобальный business-independent registry содержит Category, ComparisonProfile, units, metrics, identifier schemes, derivations and schemas.

**Причина:** сравнимость требует общего значения типов, а не централизованного владения каждым Product.

---

## ADR-005 — Локальный каталог бизнеса выделен

**Решение:** Business поддерживает Catalog и CatalogEntry.

**Product:** что это.  
**CatalogEntry:** как бизнес ведет это в своем каталоге.  
**Offering:** как бизнес это продает/предоставляет.

---

## ADR-006 — Offering ссылается на CatalogEntry

**Решение:** основной нормативный путь Offering → CatalogEntry → Product/Variant/Group.

**Причина:** локальный SKU, merchandising и локальное описание не принадлежат глобальному Product.

---

## ADR-007 — Category и ComparisonProfile разделены

**Решение:** Category отвечает «что это», ComparisonProfile — «как это сравнивать».

**Не выбрано:** единый `classification.profiles/categories` без четкой границы.

---

## ADR-008 — Variant отделен от Bundle

**Решение:** ProductGroup + ProductVariant моделируют variation axes. Bundle моделирует состав самостоятельных items.

**Причина:** размер/цвет не являются коммерческим модулем или bundle relation.

---

## ADR-009 — Module не является сущностью

**Решение:** «модуль» остается presentation term. В модели это самостоятельный Product/CatalogEntry/Offering с relation.

---

## ADR-010 — Pricing block называется `pricing`

**Решение:** в `pbp/offering@1` используется `pricing`, не `commercial`.

**Причина:** фиксируется единый namespace и устраняется дрейф черновиков.

---

## ADR-011 — Charge, Plan, Adjustment разделены

**Решение:** Price не является строкой или одним объектом.

- Charge — начисление;
- Plan — набор начислений и условий;
- Adjustment — скидка/коррекция.

---

## ADR-012 — Money хранится decimal string

**Решение:** `"70.00"`, не float и не presentation string.

**Причина:** точная арифметика и стабильная сериализация.

---

## ADR-013 — Buyer quantity не хранится в каталоге

**Решение:** выбранное количество появляется в Quote/Order runtime.

**Offering хранит:** units, allowances, limits, tiers and minimum rules.

---

## ADR-014 — Tax semantics резервируются в `@1`

**Решение:** schema поддерживает buyerTypes, tax treatment, jurisdiction.

**Уточнение:** buyerType находится в audience, а не внутри price.

**Не требуется:** заполнять поля, если факт не заявлен.

---

## ADR-015 — Policy является отдельной сущностью

**Решение:** повторно используемые SLA, guarantees, rights, cancellation and retention rules — typed Policies.

**Причина:** повторное использование, отдельная публикация, contract generation, validation.

---

## ADR-016 — Guarantee требует remedy

**Решение:** обещание без remedy не называется гарантией.

---

## ADR-017 — SLA требует измерительного контракта

**Решение:** metric, threshold, window, method, evidence, exclusions and remedy обязательны.

---

## ADR-018 — Claim sidecars удаляются

**Решение:** все `*.claims.yaml`, keyed by source path, исключаются.

**Замена:**

- governance в сущности;
- Claim как отдельная сущность;
- EvidenceSource;
- no path-based identity.

---

## ADR-019 — Disclosure является отдельной typed entity

**Решение:** существенные зависимости/ограничения оформляются Disclosure.

**Ограничение:** Disclosure не используется как miscellaneous container.

---

## ADR-020 — Review не является Claim

**Решение:** Review и AggregateRating имеют собственные схемы.

**Причина:** автор, источник, permissions and freshness отличаются от business-authored Claim.

---

## ADR-021 — Credential проектируется сейчас

**Решение:** certification/license/qualification/membership/insurance поддерживаются отдельной entity boundary.

**Реализация:** может следовать после Webgogol core.

---

## ADR-022 — Derivation Contract обобщает TCO

**Решение:** все вычисляемые факты идут через versioned deterministic Derivation Contract.

**Не выбрано:** ad hoc formulas in templates или stored calculated strings.

---

## ADR-023 — Один Buyer View Schema

**Решение:** 12 секций:

1. Identity
2. Suitability
3. Value
4. Package
5. Options
6. Pricing
7. Buyer Responsibilities
8. Fulfillment
9. Assurances
10. Rights
11. Lifecycle
12. Limitations

**Не выбрано:** несколько конкурирующих текстовых списков вопросов.

---

## ADR-024 — Missing не означает false

**Решение:** absent = not-declared. Explicit false, null and not-applicable различаются.

---

## ADR-025 — Locale IDs одинаковы

**Решение:** ID не содержит `.de`, `/de/` или другой locale marker.

---

## ADR-026 — Default locale хранит invariant facts

**Решение:** non-default locale содержит только разрешенные localized overrides.

**Причина:** цена и условия не должны расходиться между языками.

---

## ADR-027 — Complex collections являются keyed maps

**Решение:** для локализации и ссылок сложные коллекции адресуются semantic key, не array index.

---

## ADR-028 — Projection не является источником истины

**Решение:** Website, JSON-LD, CRM, contract and invoice views генерируются.

**Запрещено:** manually maintained duplicate business facts in templates.

---

## ADR-029 — Runtime state отделен

**Решение:** inventory/availability/booking capacity can overlay static graph through source contracts.

**Webgogol:** текущий capacity block не переносится.

---

## ADR-030 — История хранится Git

**Решение:** curated manifest history = Git.

**Публикация:** sourceRevision added by build.

**Bordbuch:** optional derived publication event, not second source of history.

---

## ADR-031 — Schema version и data revision различаются

**Решение:** `pbp/offering@1` описывает format; Git revision описывает состояние данных.

---

## ADR-032 — Canonical snapshot, не Markdown, подписывается

**Решение:** resolved JSON → canonicalization → digest → detached signature.

**Baseline:** RFC 8785 JCS, subject to RFC.

---

## ADR-033 — Sichtpass реализуется позже

**Решение:** schema boundaries and canonicalization ready now; signing and VC mapping later.

---

## ADR-034 — Формат временно проприетарный

**Решение:** during deployment PBP remains proprietary.

**Open trigger:** 300 clients or earlier technical maturity.

**Readiness:** stable URIs, docs, schemas and conformance tests from day one.

---

## ADR-035 — llms.txt не становится core entity

**Решение:** PBP defines MachineUsePolicy; current conventions are projections.

---

## ADR-036 — Public/private profiles физически разделены

**Решение:** bank, tax number, secrets and customer data are outside public PBP.

---

## ADR-037 — HTML запрещен в canonical facts

**Решение:** `<br>` and other presentation markup are not allowed in canonical data fields.

---

## ADR-038 — No empty-string semantics

**Решение:** empty string не означает missing. Field omitted or explicit semantic status used.

---

## ADR-039 — Controlled vocabularies необходимы

**Решение:** unit, metric, relation, identifier scheme and value vocabularies versioned.

**Не выбрано:** uncontrolled strings such as `hour`, `hours`, `Std`, `h`.

---

## ADR-040 — Relation core минимален

**Решение:** `optional`, `requires`, `incompatibleWith`, `alternativeTo`, `included`.

**Не core:**

- recommendedWith → Recommendation/Claim;
- replaces → lifecycle successor;
- availableAfter → requires + condition.

---

## ADR-041 — External standards are mappings, not canonical core

**Решение:** PBP maps to Schema.org, GS1, JSON-LD and VC; it is not limited to their least-common-denominator fields.

---

## ADR-042 — Webgogol is first fixture, not universal proof

**Решение:** before RFC freeze test minimal physical good and variant commerce case.

---

## ADR-043 — Legacy removed after migration

**Решение:** no compatibility layer, old files deleted after 100% coverage and clean build.

---

## ADR-044 — `hourlyRate` is unresolved

**Решение:** do not attach business-global hourly rate automatically.

Possible outcomes:

- separate Offering;
- overage Charge;
- private internal rate.

---

## ADR-045 — 99% uptime and 7 hours cannot coexist as exact equivalents

**Решение:** owner chooses normative model. Recommended 99% per calendar month with calculated allowed downtime.

---

## ADR-046 — Capacity waves are not static Offering facts

**Решение:** remove current capacity block from PBP.

---

## ADR-047 — Document metadata stays with document descriptor

**Решение:** no central `meta.md` for AGB/privacy/imprint dates.

---

## ADR-048 — External services require materiality review

**Решение:** not every internal tool becomes a public Disclosure.

---

## ADR-049 — Compliance dates do not prove compliance

**Решение:** GoBD dates alone do not create compliance Claim.

---

## ADR-050 — Comparison does not imply ranking

**Решение:** ComparisonProfile exposes dimensions. Ranking needs a separate transparent methodology/derivation.

---

# Pending decisions

These are not architecture ambiguity; they are Webgogol business/legal facts:

- legal form;
- tax treatment;
- subscription renewal/cancellation;
- uptime normative rule;
- small-change definition;
- exact ownership/exit contents;
- module standalone/yearly/setup rules;
- platform evidence URLs;
- backup commitment;
- hourly rate classification.
