# Public Business Profile — Complete Design Package

Собранная версия документов. Раздельные файлы остаются нормативно удобнее для работы и будущей нарезки на RFC.

---

<!-- BEGIN 00-README.md -->

# Public Business Profile (PBP)

## Комплект предпроектной спецификации

**Статус:** Design Specification / Pre-RFC 1.0  
**Дата:** 2026-07-18  
**Первый внедряемый профиль:** Webgogol, Германия  
**Назначение:** исходный корпус для последующей серии RFC, схем, компилятора, валидаторов и миграции действующих данных Webgogol.

---

## 1. Что проектируется

Public Business Profile (PBP) — это универсальная логическая модель публичного цифрового профиля бизнеса.

PBP должен позволять бизнесу согласованно и вычислимо описывать:

- кто он;
- где и как с ним связаться;
- какие продукты существуют;
- как конкретный бизнес включает продукты в свой каталог;
- какие публичные предложения действуют;
- из чего складывается цена;
- какие условия, обязательства, гарантии и права действуют;
- какие утверждения бизнес делает и чем они подтверждаются;
- какие данные можно вывести для человека, сайта, ИИ-агента, CRM, договора, счета и Schema.org.

Канонические данные являются единственным источником истины. Страницы сайта, JSON-LD, ответы ИИ, коммерческие документы и другие представления являются проекциями.

---

## 2. Главные архитектурные решения

1. **Одна логическая модель — несколько допустимых физических хранилищ.**  
   Markdown + Git подходят для курируемых данных Webgogol. Большие каталоги могут использовать структурированный dataset, базу данных или внешний адаптер, сохраняя ту же PBP-семантику.

2. **Идентичность продуктов федеративна.**  
   Не создается обязательный централизованный реестр всех продуктов мира. Каждый Product имеет глобально уникальный URI и авторитетный источник. Глобальный слой стандартизирует категории, профили сравнения, единицы, схемы идентификаторов и правила интерпретации.

3. **Локальный каталог бизнеса обязателен как отдельный слой.**  
   Product отвечает на вопрос «что это», CatalogEntry — «как этот бизнес ведет это в своем каталоге», Offering — «как бизнес публично предлагает это покупателю».

4. **Product, CatalogEntry и Offering не смешиваются.**

5. **Variant и Bundle — разные механизмы.**  
   Variant описывает одну товарную линию с вариационными осями. Bundle описывает состав из самостоятельных продуктов.

6. **Цена разлагается на Charge, Plan и Adjustment.**

7. **Условия и обязательства моделируются как Policy.**

8. **Проверяемые утверждения моделируются как Claim, подтверждения — как EvidenceSource, существенные раскрытия — как Disclosure.**

9. **Нормализация сравнения задается ComparisonProfile.**  
   Category отвечает «что это», ComparisonProfile — «по каким измерениям это сравнивается».

10. **Вычисляемые значения производятся Derivation Contract.**  
    TCO, стоимость первого года, эффективная скидка и допустимый простой не хранятся вручную.

11. **Один Buyer View Schema задает полный покупательский обзор.**

12. **История хранится Git.**  
    Сборка добавляет `sourceRevision`; позднее snapshots могут подписываться через Sichtpass.

13. **Namespace схем фиксируется как `pbp/*@1`.**  
    В `@1` ключи и семантика не переименовываются. Несовместимое изменение требует `@2` и миграционного контракта.

14. **Формат остается проприетарным в период внедрения.**  
    Архитектура при этом должна быть готова к последующему открытию без перепроектирования.

---

## 3. Состав комплекта

### `01-PBP-System-Specification.md`

Нормативная архитектурная спецификация:

- цели и границы;
- архитектурные слои;
- сущности;
- идентичность;
- локализация;
- хранение;
- runtime overlays;
- история;
- подписи;
- проекции;
- conformance levels.

### `02-PBP-Entity-and-Field-Model.md`

Подробная модель данных:

- общие примитивы;
- структура каждой сущности;
- pricing;
- variants;
- policies;
- claims;
- controlled vocabularies;
- YAML-примеры;
- целевая структура файлов.

### `03-PBP-Compiler-Validation-and-Projections.md`

Требования к компилятору и проверкам:

- pipeline сборки;
- locale resolution;
- graph resolution;
- derivations;
- validation gates;
- Buyer View;
- website/AI/Schema.org/CRM/contract/invoice projections;
- golden tests;
- коды ошибок.

### `04-Webgogol-Migration-Agent-Plan.md`

Детальный план для ИИ-агента:

- инвентаризация текущих файлов;
- классификация каждого поля;
- правила миграции;
- точная карта старое → новое;
- фазы работы;
- stop conditions;
- вопросы владельцу;
- acceptance criteria;
- удаление legacy.

### `05-Webgogol-Target-Manifest-Blueprint.md`

Проект целевого дерева и черновые манифесты Webgogol:

- Business;
- LegalIdentity;
- Place;
- ContactPoint;
- WebPresence;
- Product;
- CatalogEntry;
- Offering;
- Policy;
- Claim;
- Disclosure.

Файл не заменяет юридическую или коммерческую верификацию. Он показывает целевую форму.

### `06-PBP-RFC-Roadmap.md`

Предлагаемая серия RFC:

- зависимости;
- приоритеты;
- этапы реализации;
- definition of done;
- тестовые профили;
- путь от Webgogol к каталогам 10 000+ SKU.

### `07-PBP-Decision-Log.md`

Реестр архитектурных решений и отвергнутых альтернатив. Он нужен, чтобы будущие RFC не возвращались незаметно к уже отвергнутым моделям.

---

## 4. Исходный корпус миграции

Комплект миграции учитывает следующие действующие файлы:

- `company.md`
- `company.claims.yaml`
- `compliance.md`
- `compliance.claims.yaml`
- `contact.md`
- `contact.claims.yaml`
- `external-services.md`
- `legal.md`
- `legal.claims.yaml`
- `location.md`
- `location.claims.yaml`
- `meta.md`
- `offer.md`
- `offer.claims.yaml`
- `platform-comparison.md`
- `platform-comparison.claims.yaml`
- `services.md`
- `web.md`
- `web.claims.yaml`

Legacy-структура не сохраняется и обратная совместимость не предусматривается.

---

## 5. Как использовать этот комплект

Рекомендуемый порядок:

1. Зафиксировать решения из `07-PBP-Decision-Log.md`.
2. Утвердить границы и термины из `01-PBP-System-Specification.md`.
3. Разбить `02` и `03` на RFC.
4. Реализовать минимальные JSON Schema и компилятор.
5. Выполнить миграцию по `04`.
6. Сверить результат с `05`.
7. Запустить conformance и golden tests.
8. Удалить legacy только после успешной двойной проверки.

---

## 6. Статус нормативности

Этот комплект — не финальный стандарт и не юридический документ. Он задает проектную архитектуру и обязательные решения для последующих RFC.

В будущих RFC слова **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** должны использоваться в нормативном значении RFC 2119 / RFC 8174.

---

## 7. Внешние ориентиры

PBP не копирует внешние стандарты, но проектируется для корректного отображения и интеграции с ними:

- Schema.org Product, ProductGroup, Offer и PriceSpecification;
- GS1 identifiers и GS1 Digital Link;
- JSON Schema Draft 2020-12;
- JSON-LD 1.1;
- BCP 47 language tags;
- RFC 3339 timestamps;
- RFC 8785 JSON Canonicalization Scheme;
- W3C Verifiable Credentials Data Model 2.0;
- ISO 4217 currencies;
- ISO 8601 durations;
- внешние идентификаторы GTIN, ISBN, VIN, MPN и другие.

Текущие официальные спецификации подтверждают, что Schema.org отдельно моделирует группы вариантов, GS1 Digital Link выражает идентификаторы GS1 в Web URI, W3C VC 2.0 задает расширяемую модель проверяемых удостоверений, а RFC 8785 дает детерминированную JSON-канонизацию для хеширования и подписей.

<!-- END 00-README.md -->

---

<!-- BEGIN 01-PBP-System-Specification.md -->

# Public Business Profile — System Specification

**Документ:** PBP-SYS-SPEC  
**Статус:** Pre-RFC / architecture baseline  
**Версия документа:** 0.9  
**Дата:** 2026-07-18

---

## 0. Назначение документа

Этот документ задает целевую архитектуру Public Business Profile (PBP): универсальной системы, в которой бизнес описывает свое публичное цифровое присутствие, продукты, каталог, предложения, условия, доказательства и права покупателей как единый согласованный граф данных.

Документ должен стать источником для серии отдельных RFC. Он фиксирует границы, понятия и архитектурные инварианты. Детальные JSON Schema, алгоритмы компилятора и конкретные форматы проекций могут разрабатываться отдельными RFC, но не должны противоречить этой спецификации.

---

# 1. Цель

PBP должен позволять любому бизнесу — от ремесленной студии с одной услугой до производителя или продавца с сотнями тысяч SKU — поддерживать единый публичный семантический источник истины.

Из него детерминированно формируются:

- страницы сайта;
- продуктовые и тарифные карточки;
- ответы ИИ-агентам;
- JSON-LD и Schema.org;
- коммерческие предложения;
- договорные приложения;
- позиции счетов;
- данные для CRM;
- Buyer View;
- сравнения;
- вычисляемые показатели;
- публичные паспорта и подписи;
- машиночитаемые правила использования данных.

PBP должен снижать следующие риски:

- расхождение цены между страницами;
- несовместимые обещания в маркетинге и договоре;
- дублирование одного факта в нескольких файлах;
- смешение продукта, способа продажи и конкретного заказа;
- ложные выводы ИИ из отсутствующих данных;
- потерю связи между предложением и доказательствами;
- невозможность сравнивать предложения разных компаний;
- невозможность масштабировать каталог до тысяч товаров;
- зависимость от конкретной CMS, сайта или способа хранения.

---

# 2. Не-цели

PBP версии `@1` не является:

- системой заказов;
- платежной системой;
- ERP;
- CRM;
- бухгалтерией;
- складом;
- системой управления контрактами с конкретными клиентами;
- системой хранения персональных данных покупателей;
- глобальным централизованным арбитром всех продуктов мира;
- заменой отраслевых стандартов GTIN, ISBN, VIN, GS1, Schema.org;
- правовой оценкой корректности конкретного предложения;
- обязательным физическим форматом хранения;
- полной онтологией всех свойств всех вещей.

PBP может генерировать входные данные для CRM, счетов и договоров, но не хранит индивидуальные сделки.

---

# 3. Основные принципы

## 3.1. Один факт — одно каноническое место

Факт не должен вручную дублироваться в нескольких манифестах или проекциях.

Пример:

- сумма `70 EUR` хранится в Charge;
- строка `70 € / Monat` генерируется локализатором;
- JSON-LD получает ту же сумму;
- договорный шаблон получает ту же сумму;
- CRM получает тот же Charge ID.

## 3.2. Канонические факты отделены от presentation

Каноническое значение:

```yaml
amount:
  value: "70.00"
  currency: EUR
```

Проекция:

```text
70 € / Monat
```

HTML, `<br>`, цвет, QR-код, подпись кнопки и текст конкретного блока сайта не являются каноническими фактами.

## 3.3. Логическая модель не равна физическому хранилищу

PBP определяет единый resolved graph. Источник этого графа может быть:

- файловым manifest repository;
- structured dataset;
- SQL-базой;
- document store;
- product information system;
- внешним адаптером;
- комбинацией источников.

## 3.4. Федеративная идентичность

Каждая сущность имеет глобально уникальный URI. Авторитетный источник сущности определяет ее канонические данные.

Не требуется один центральный Product Registry. Вместо этого:

- производитель может публиковать Product;
- бизнес может публиковать собственную услугу;
- продавец создает CatalogEntry со ссылкой на Product;
- внешние идентификаторы помогают связать эквивалентные записи;
- глобальный registry индексирует и нормализует, но не обязан владеть каждой сущностью.

## 3.5. Явная семантика отсутствия

PBP различает:

- `not-declared` — бизнес не заявил значение;
- `false` — бизнес явно заявил отсутствие свойства;
- `null` — значение применимо, но неизвестно или намеренно подавлено в допустимом контексте;
- `not-applicable` — свойство к сущности не применимо;
- `unavailable` — значение нельзя получить в текущей проекции;
- `invalid` — значение присутствует, но не прошло проверку.

Отсутствующий ключ по умолчанию означает `not-declared`, а не `false`.

## 3.6. Структурная строгость и расширяемость

Универсальность достигается не тысячами полей в core, а сочетанием:

```text
PBP Core
+ Category
+ ComparisonProfile
+ Controlled Vocabularies
+ Optional typed extensions
```

## 3.7. Детерминированность

Одинаковые входные данные, одинаковая версия схем, одинаковые параметры locale/runtime и одинаковая версия derivation implementation должны давать одинаковый resolved graph и одинаковые нормативные проекции.

## 3.8. Проверяемость

Каждая производная величина должна иметь:

- Derivation Contract;
- входы;
- версию;
- тип результата;
- provenance;
- тестовые векторы.

## 3.9. Минимизация скрытых выводов

Компилятор и ИИ-проекции не должны выводить бизнес-факты из маркетингового текста, если такое правило не задано отдельным нормализационным или derivation contract.

## 3.10. Стабильность `@1`

В `pbp/*@1` нельзя:

- переименовывать ключи;
- менять смысл существующих значений;
- менять default behavior;
- превращать необязательное поле в обязательное;
- менять единицу или тип поля без новой major-схемы.

Разрешены только аддитивные необязательные расширения, не изменяющие поведение старых документов.

---

# 4. Архитектурные слои

## 4.1. Global Semantic Layer

Слой бизнес-независимых определений:

- `Category`;
- `ComparisonProfile`;
- `BuyerViewSchema`;
- `DerivationContract`;
- `IdentifierScheme`;
- `UnitDefinition`;
- `MetricDefinition`;
- `ControlledVocabulary`;
- JSON Schema и mapping contracts.

Этот слой отвечает не за конкретные товары, а за общую семантику.

## 4.2. Federated Identity Layer

Сущности с глобально уникальной идентичностью:

- `Business`;
- `LegalIdentity`;
- `Brand`;
- `Place`;
- `ContactPoint`;
- `WebPresence`;
- `Product`;
- `ProductGroup`;
- `ProductVariant`;
- `Credential`;
- внешние организации и авторитетные источники.

## 4.3. Business Catalog Layer

Сущности конкретного бизнеса:

- `Catalog`;
- `CatalogEntry`;
- `Offering`;
- `Policy`;
- `Claim`;
- `EvidenceSource`;
- `Disclosure`;
- `Review`;
- `AggregateRating`;
- `PublicDocument`;
- `MachineUsePolicy`.

## 4.4. Runtime State Layer

Нестатические данные:

- inventory;
- текущая доступность;
- booking capacity;
- динамический delivery estimate;
- текущая персонализированная цена;
- остатки;
- live rating snapshot.

PBP-манифест описывает контракт получения состояния. Сами часто меняющиеся значения могут жить вне Git.

## 4.5. Projection Layer

Производные представления:

- Website View;
- Buyer View;
- AI Answer View;
- Schema.org JSON-LD;
- Quote Input;
- Contract Input;
- Invoice Input;
- CRM View;
- Comparison View;
- Sitemap / feed / API;
- Sichtpass snapshot;
- machine-use files.

Projection не является новым источником истины.

## 4.6. Governance Layer

- Git history;
- review schedules;
- source revision;
- publication status;
- schema version;
- signatures;
- validation reports;
- conformance reports;
- ownership of maintenance.

---

# 5. Идентичность и URI

## 5.1. Общие требования

Каждая каноническая сущность MUST иметь `id`.

`id` MUST:

- быть абсолютным HTTPS URI либо другим разрешенным RFC URI;
- быть независимым от языка;
- быть независимым от текущего URL страницы;
- оставаться стабильным после переименования маркетингового названия;
- не содержать индекс массива;
- не использовать локальный путь файла как семантический ID;
- не переиспользоваться для другой сущности после удаления.

Рекомендуемый паттерн для бизнеса:

```text
https://example.com/id/{entity-type}/{opaque-or-semantic-key}
```

Пример:

```text
https://webgogol.com/id/offering/digital-foundation
```

## 5.2. Authority

Сущность MUST иметь либо явный `authorityRef`, либо однозначно выводимый authority из package context.

Authority — сторона, которая заявляет каноническую идентичность и факты сущности.

## 5.3. Внешние идентификаторы

Product MAY иметь:

- GTIN;
- ISBN;
- VIN;
- MPN;
- DOI;
- EAN/UPC, если корректно нормализованы через GTIN semantics;
- отраслевые идентификаторы;
- identifiers из национальных реестров.

Идентификаторы MUST включать `schemeRef` и нормализованное значение.

## 5.4. Локальные идентификаторы

SKU, внутренний номер, код услуги и CRM product ID принадлежат CatalogEntry либо Offering, а не глобальному Product.

## 5.5. Identity equivalence

PBP MUST различать:

- `sameIdentityAs` — строгая идентичность;
- `equivalentTo` — семантически эквивалентный объект;
- `similarTo` — сходство без идентичности;
- `supersedes` — новая версия/преемник;
- `derivedFrom` — производная сущность.

Автоматическая дедупликация MUST NOT объявлять `sameIdentityAs` только на основании похожих названий.

---

# 6. Business и публичная граница

## 6.1. Business

Business описывает публичную операционную идентичность:

- название;
- тип бизнеса;
- описание;
- миссию;
- бренды;
- публичные контакты;
- места;
- web presences;
- публичные credentials;
- ссылки на каталоги.

## 6.2. LegalIdentity

LegalIdentity описывает только публично допустимые юридические сведения.

PBP MUST NOT автоматически публиковать:

- внутренний Steuernummer;
- банковские реквизиты;
- закрытые бухгалтерские идентификаторы;
- личные данные, не предназначенные для публичной страницы;
- внутренние договорные данные.

Непубличные данные должны жить в separate private operational profile вне PBP.

## 6.3. Brand

Brand MAY быть отдельной сущностью, когда:

- один Business использует несколько брендов;
- бренд отделен от юридического лица;
- предложения публикуются под разными брендами;
- требуется внешний Brand ID или отдельная web identity.

Для простого бизнеса Brand MAY быть встроенной ссылкой в Business, но схема должна поддерживать отдельную сущность.

---

# 7. Product, CatalogEntry и Offering

## 7.1. Product

Product — идентифицируемый носитель ценности, который может быть получен самостоятельно или в составе другого продукта/предложения.

Product описывает:

- природу;
- назначение;
- существенные свойства;
- результаты;
- capabilities;
- intrinsic composition;
- category;
- external identifiers;
- product authority.

Product не описывает:

- цену конкретного продавца;
- способ оплаты;
- срок договора;
- скидку продавца;
- shipping policy продавца;
- SLA конкретного Offering;
- локальный SKU продавца.

## 7.2. Catalog

Catalog — логическая коллекция CatalogEntry конкретного бизнеса.

Business может иметь несколько каталогов:

- основной;
- оптовый;
- региональный;
- сезонный;
- сервисный;
- архивный непубликуемый, если когда-либо будет разрешен отдельным профилем.

В текущем публичном PBP публикуются только публичные каталоги.

## 7.3. CatalogEntry

CatalogEntry — локальная запись бизнеса о Product/ProductVariant/ProductGroup.

Она может содержать:

- local SKU;
- локальное имя;
- локальное описание;
- merchandising classification;
- media;
- локальные searchable attributes;
- связи с Offering;
- local publication state.

CatalogEntry не определяет коммерческие условия, если они относятся к Offering.

## 7.4. Offering

Offering — публичное действующее предложение конкретного бизнеса предоставить CatalogEntry на заявленных коммерческих, договорных и эксплуатационных условиях.

Offering содержит:

- audience;
- availability scope;
- package;
- pricing;
- acquisition rules;
- fulfillment;
- buyer responsibilities;
- terms;
- policies;
- optional/requires/incompatible relations;
- publication state.

## 7.5. Индивидуальные Offer/Order/Contract

Индивидуальные Offer, Order и Contract не являются частью публичного каталога PBP `@1`.

Генератор может использовать Offering как источник данных, но выбранные количества, клиент, дата, адрес, скидка и подпись хранятся вне PBP.

---

# 8. ProductGroup, Variant и Bundle

## 8.1. ProductGroup

ProductGroup объединяет продукты, отличающиеся по заранее объявленным variation axes.

Примеры axes:

- size;
- color;
- material;
- storage capacity;
- power;
- language;
- package size.

## 8.2. ProductVariant

ProductVariant:

- ссылается на ProductGroup;
- задает значения всех обязательных variation axes;
- MAY иметь собственные external identifiers;
- MAY иметь собственный CatalogEntry;
- MAY иметь собственное Offering.

## 8.3. Bundle

Bundle — продукт или коммерческий package, состоящий из нескольких самостоятельных items.

Необходимо различать:

- **intrinsic product bundle** — сам Product является комплектом;
- **offering package inclusion** — Offering включает дополнительные товары/услуги;
- **variant** — тот же ProductGroup с другими axis values.

## 8.4. Запрет смешения

Variation axis MUST NOT использоваться для моделирования коммерческой подписки, SLA, скидки или optional add-on.

---

# 9. Category и ComparisonProfile

## 9.1. Category

Category отвечает на вопрос:

> Какого типа эта вещь по смыслу?

Category является частью глобального semantic layer.

Category может ссылаться на:

- GS1 GPC;
- UNSPSC;
- отраслевой классификатор;
- внутренний PBP registry;
- национальную классификацию;
- несколько внешних классификаций.

## 9.2. ComparisonProfile

ComparisonProfile отвечает:

> Какие характеристики и derivations применимы для сравнения объектов этой категории?

Один Product может иметь несколько ComparisonProfile:

- коммерческий;
- технический;
- ownership;
- sustainability;
- security;
- service operations.

## 9.3. Требования профиля

ComparisonProfile определяет:

- dimensions;
- source paths/semantic selectors;
- value types;
- units;
- comparability rules;
- required/optional status;
- missing-value semantics;
- derivation refs;
- labels per locale;
- validation constraints.

## 9.4. Profile не определяет Product identity

Совпадение ComparisonProfile не означает, что два Products идентичны.

---

# 10. Pricing

## 10.1. Основные понятия

- `Charge` — отдельное начисление.
- `Plan` — набор Charges и условий, действующих вместе.
- `Adjustment` — скидка, кредит или иной модификатор.
- `Allowance` — включенный объем.
- `Overage` — цена сверх allowance.
- `Deposit` — обеспечительный платеж с условиями возврата.

## 10.2. Поддерживаемые модели `@1`

PBP `@1` должен поддерживать:

- fixed one-time;
- fixed recurring;
- unit rate / usage-based;
- range;
- tiered;
- deposit;
- discount;
- plan-specific override.

## 10.3. Денежные значения

Денежная сумма MUST храниться decimal string.

```yaml
value: "70.00"
currency: EUR
```

Float MUST NOT использоваться как канонический денежный тип.

## 10.4. Tax semantics

Schema MUST резервировать:

- buyerTypes в audience;
- tax treatment;
- tax jurisdiction;
- inclusive/exclusive/exempt/not-applicable/not-declared;
- tax rate, если публично применимо;
- validFrom для налоговой цены, если нужно.

Поля могут отсутствовать в конкретном Manifest. Пустые строки запрещены.

## 10.5. Quantity semantics

Catalog/Offering не хранит выбранное покупателем количество.

Offering MAY хранить:

- billable unit;
- included allowance;
- minimum order rule;
- maximum configurable limit;
- tier boundaries;
- package basis.

## 10.6. TCO и First Year Cost

Эти значения MUST вычисляться через Derivation Contract. Они не являются вручную поддерживаемыми каноническими фактами.

Результат MUST иметь mode:

- exact;
- range;
- parameterized;
- unavailable.

---

# 11. Policy

## 11.1. Определение

Policy — публичное правило, обязательство, гарантия, право или процедура, применимая к Business, Product, CatalogEntry или Offering.

## 11.2. Основные kind

- service-level;
- guarantee;
- support;
- delivery;
- fulfillment;
- shipping;
- pickup;
- return;
- refund;
- cancellation;
- renewal;
- price-change;
- ownership;
- license;
- portability;
- exit;
- data-retention;
- data-deletion;
- warranty;
- insurance;
- privacy;
- machine-use.

## 11.3. SLA

Service-level Policy MUST содержать:

- metricRef;
- operator;
- threshold;
- unitRef;
- measurement window;
- start trigger;
- measurement method;
- evidence source;
- exclusions;
- remedy;
- remedy application mode.

## 11.4. Guarantee

Guarantee MUST иметь measurable or decidable condition и remedy.

Обещание без remedy не должно называться гарантией; оно может быть Commitment или Claim.

## 11.5. Policy inheritance

Offering MAY ссылаться на несколько Policies. Plan MAY override только разрешенные поля Policy через typed override contract.

Произвольное deep merge Policy запрещено.

---

# 12. Claim, Evidence и Disclosure

## 12.1. Claim

Claim — публичное проверяемое утверждение.

Типичные claim classes:

- business fact;
- comparative commercial;
- market statistic;
- technical performance;
- legal/compliance assertion;
- sustainability;
- historical;
- ownership;
- risk;
- recommendation basis.

## 12.2. EvidenceSource

EvidenceSource описывает источник подтверждения:

- официальный документ;
- registry entry;
- measurement dataset;
- external webpage;
- certificate;
- signed snapshot;
- publication;
- monitoring record.

Claim MAY иметь несколько EvidenceSource с ролями `primary`, `supporting`, `counterevidence`.

## 12.3. Disclosure

Disclosure раскрывает существенный контекст, зависимость или ограничение, которое необходимо для корректной интерпретации.

Disclosure не должен становиться папкой «прочее».

Допустимые kinds:

- technology-dependency;
- third-party-provider;
- affiliate-relationship;
- sponsorship;
- conflict-of-interest;
- automated-content;
- regional-limitation;
- data-source;
- material-limitation;
- methodology-limitation.

## 12.4. Staleness

Claim и Evidence MAY иметь review schedule.

Если `reviewedAt + reviewEvery < buildTime`, состояние становится `stale`.

Projection policy MUST определить:

- suppress;
- publish-with-warning;
- block-build.

Contract-critical comparative claims SHOULD блокировать сборку при staleness.

---

# 13. Credential, Review и Reputation

## 13.1. Credential

Credential описывает внешне выданное или проверяемое подтверждение:

- certification;
- license;
- professional qualification;
- membership;
- insurance;
- authorization;
- award;
- verification.

Credential содержит:

- issuerRef;
- holderRef;
- credential type;
- issuance date;
- expiry;
- evidence;
- verification URL;
- optional Verifiable Credential reference.

## 13.2. Review

Review — отзыв конкретного автора/источника.

Review MUST различать:

- external source;
- business-hosted review;
- verified purchase/service;
- copied excerpt;
- linked-only review.

## 13.3. AggregateRating

AggregateRating — производный или внешний snapshot агрегированного рейтинга.

Он MUST указывать:

- source;
- rating scale;
- count;
- assessed/retrieved time;
- derivation or external authority;
- freshness policy.

---

# 14. Place, ContactPoint и WebPresence

## 14.1. Place

Business MAY иметь множество Places с ролями:

- headquarters;
- branch;
- service-depot;
- showroom;
- pickup-point;
- workshop;
- registered-office.

Place не должен смешиваться с service territory.

## 14.2. Service territory

Territory принадлежит Offering availability или fulfillment policy.

## 14.3. ContactPoint

ContactPoint содержит:

- channel kind;
- address/value;
- purposes;
- languages;
- hours/policy;
- preferred status;
- scope.

Derived values (`mailto:`, QR data, button labels) не хранятся.

## 14.4. WebPresence

WebPresence описывает публичную цифровую точку:

- canonical URL;
- kind;
- locale coverage;
- ownership/control;
- sameAs links;
- linked Business/Brand;
- publication policy.

Domain выводится из URL и не дублируется без отдельной причины.

---

# 15. Localisation

## 15.1. Locale model

PBP использует BCP 47 language tags.

Package объявляет:

```yaml
defaultLocale: de
locales:
  - de
  - uk
  - ru
```

## 15.2. File symmetry

Для curated manifest storage локали SHOULD иметь одинаковую относительную структуру.

## 15.3. Resolution

Resolved locale строится так:

1. загрузить default-locale manifest;
2. загрузить locale override по тому же logical entity ID;
3. проверить допустимость override;
4. применить merge по semantic keys;
5. разрешить refs;
6. валидировать результат.

## 15.4. Localizable fields

JSON Schema/RFC должен отмечать поля:

- `localizable`;
- `locale-invariant`;
- `locale-variant-allowed`.

Non-default locale MUST NOT переопределять locale-invariant field.

Например, цена не переводится и не должна дублироваться в украинском файле.

## 15.5. Null and suppression

Явное suppression наследуемого localized field допускается только для полей, где schema разрешает `null` или специальное состояние `suppressed`.

Общий `null = удалить` без schema control запрещен.

## 15.6. Сложные коллекции

Сложные локализуемые коллекции MUST быть keyed maps, а не массивами.

---

# 16. Storage Profiles

## 16.1. Manifest Storage

Подходит для:

- Webgogol;
- небольших каталогов;
- Policies;
- Claims;
- вручную курируемых Offerings;
- Credentials;
- Documents.

Рекомендуемый носитель: Markdown frontmatter + Git.

## 16.2. Dataset Storage

Подходит для:

- 10 000+ CatalogEntry;
- variants;
- массовых ценовых обновлений;
- many-language catalogs;
- PIM exports.

Может использовать:

- JSONL;
- Parquet;
- relational tables;
- object storage;
- PIM database.

## 16.3. External Adapter

Подходит для Shopify, ERP, PIM, inventory и booking systems.

Adapter MUST выдавать PBP-conformant logical records и проходить те же validation contracts.

## 16.4. Storage neutrality

Схема сущностей не должна содержать fields, зависящие от Markdown path, D1 row ID или Shopify internal structure.

---

# 17. Runtime State Overlay

## 17.1. Разделение

Static declaration:

```yaml
availability:
  mode: live
  sourceContractRef: ...
```

Runtime state:

```yaml
status: in-stock
observedAt: ...
```

## 17.2. Overlay requirements

Runtime overlay MUST:

- иметь observedAt;
- иметь source authority;
- иметь TTL/freshness;
- не изменять identity;
- не переписывать static contractual facts;
- быть отделимым от signed static snapshot.

## 17.3. Webgogol v1

Для текущего сервисного Offering Webgogol runtime capacity не используется. Блок производственных волн и Bordbuch reservations удаляется из публичной модели.

---

# 18. Derivation Contracts

## 18.1. Назначение

Derivation Contract описывает детерминированное вычисление производного результата.

Примеры:

- first-year cost;
- TCO;
- effective discount;
- monthly allowed downtime;
- normalized unit price;
- aggregate rating;
- completeness score;
- comparison dimension.

## 18.2. Требования

Derivation Contract MUST определять:

- stable ID;
- version;
- input schema;
- semantic selectors;
- units;
- output schema;
- result modes;
- rounding;
- error states;
- provenance;
- deterministic requirement;
- test vectors.

## 18.3. Implementation separation

Manifest ссылается на Derivation Contract, но не содержит произвольный код.

Implementation может быть на TypeScript, Rust или другом языке, если проходит conformance suite.

---

# 19. Buyer View Schema

## 19.1. Единственный нормативный обзор

PBP `@1` использует один именованный Buyer View Schema со следующими секциями:

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

## 19.2. Статус секции

Каждая секция возвращает:

- declared;
- derived;
- not-declared;
- not-applicable;
- unavailable;
- invalid.

## 19.3. Buyer View — проекция

Buyer View не хранит новые факты. Он собирает и объясняет уже объявленные facts/policies/derivations.

---

# 20. Compilation Pipeline

Нормативный pipeline:

```text
Load sources
→ parse
→ schema validate raw records
→ establish entity identity
→ resolve locale
→ resolve references
→ compose inherited policies/profiles
→ apply runtime overlays
→ run derivations
→ validate graph invariants
→ build Buyer View
→ build target projections
→ canonicalize normative snapshots
→ attach source revision
→ sign if enabled
→ publish
```

Каждый этап должен выдавать machine-readable report.

---

# 21. Validation

## 21.1. Уровни

1. Syntax validation
2. Schema validation
3. Referential integrity
4. Semantic validation
5. Commercial consistency
6. Policy consistency
7. Locale consistency
8. Freshness validation
9. Projection validation
10. Signature validation

## 21.2. Критические ошибки

Сборка MUST блокироваться при:

- duplicate IDs;
- dangling required refs;
- cycle в `requires`;
- объект одновременно `requires` и `incompatibleWith` тот же target;
- plan с отсутствующим charge;
- валюта charge не соответствует pricing currency без явной multi-currency policy;
- invalid decimal;
- locale переопределяет invariant fact;
- SLA без metric/window/remedy;
- guarantee без remedy;
- несовместимая tax semantics;
- stale blocking claim;
- подписываемый snapshot недетерминирован;
- generated output расходится с golden fixture.

## 21.3. Предупреждения

Предупреждения могут включать:

- not-declared buyer type;
- отсутствующий comparison profile;
- отсутствие Evidence для некритичного Claim;
- fallback locale usage;
- incomplete optional Buyer View section;
- неразрешенный external identifier.

---

# 22. История, версии и публикация

## 22.1. История данных

Git является каноническим источником истории curated manifests.

Bulk storage MUST иметь эквивалентный revision mechanism или immutable snapshots.

## 22.2. Entity version

Внутри сущности не требуется ручной порядковый version для каждого изменения. Schema version фиксирует формат, Git revision — состояние.

При необходимости юридически фиксированного публичного snapshot создается Publication Snapshot с:

- entity IDs;
- resolved locale;
- sourceRevision;
- generatedAt;
- content digest;
- schema versions;
- derivation versions.

## 22.3. Schema evolution

`@1` остается совместимым. Breaking change требует:

- `@2`;
- migration/normalization contract;
- compatibility report;
- test vectors;
- migration tool.

---

# 23. Canonicalization и Sichtpass

## 23.1. Что подписывается

Сырой Markdown не является нормативным payload для подписи.

Подписывается resolved canonical JSON snapshot.

## 23.2. Канонизация

Рекомендуемый baseline — RFC 8785 JCS после:

- locale resolution;
- ref resolution;
- normalization;
- исключения non-normative build metadata;
- стабилизации числовых типов.

Поскольку JCS использует JSON numbers, а PBP хранит деньги decimal strings, денежная точность сохраняется без преобразования во float.

## 23.3. Signature envelope

Подпись хранится отдельно от payload.

Signature envelope должен включать:

- payload digest;
- canonicalization algorithm;
- signature suite;
- signer;
- issuedAt;
- schema versions;
- sourceRevision.

## 23.4. Sichtpass

Поздний RFC может отобразить Publication Snapshot в Sichtpass / W3C VC 2.0. Архитектура `@1` должна обеспечить достаточную стабильность ID и canonicalization уже сейчас.

---

# 24. Проекции

## 24.1. Website

Website projection может генерировать:

- business pages;
- product pages;
- offering cards;
- pricing tables;
- policies;
- FAQ;
- comparison tables;
- trust blocks;
- disclosures.

## 24.2. AI Answer

AI projection должна быть компактной, фактологичной и содержать:

- source entity IDs;
- declared/derived status;
- unavailable/not-declared distinctions;
- freshness;
- evidence refs;
- no hidden marketing inference.

## 24.3. Schema.org

Mapping должен поддерживать, где применимо:

- Organization/LocalBusiness;
- Product;
- ProductGroup;
- Service;
- Offer;
- AggregateOffer;
- PriceSpecification;
- UnitPriceSpecification;
- OfferShippingDetails;
- MerchantReturnPolicy;
- WarrantyPromise;
- Review/AggregateRating.

Schema.org projection является lossy mapping и не заменяет PBP.

## 24.4. Quote/Contract/Invoice/CRM

Эти проекции получают:

- PBP public facts;
- runtime selection;
- buyer/order data из внешней системы;
- private billing data из закрытого профиля.

PBP MUST NOT содержать индивидуальные buyer data.

---

# 25. MachineUsePolicy

PBP должен иметь общую политику машинного использования, из которой могут генерироваться текущие и будущие файлы/директивы.

Политика может различать:

- discovery;
- retrieval;
- indexing;
- summarization;
- quotation;
- attribution;
- source-link requirement;
- training;
- automated purchasing;
- caching;
- redistribution.

PBP не привязывается к одной конвенции `llms.txt`.

---

# 26. Security и privacy

## 26.1. Public-by-design

Каждая PBP entity должна считаться потенциально публичной.

Sensitive/private facts MUST NOT попадать в repository по умолчанию.

## 26.2. Secrets

Запрещены:

- API keys;
- private bank details;
- private tax identifiers;
- authentication tokens;
- customer data;
- unpublished personal contacts;
- internal infrastructure secrets.

## 26.3. External content

Imported reviews, claims и evidence должны учитывать права на публикацию и минимизацию копирования.

## 26.4. Injection resilience

Markdown body и imported text должны считаться untrusted content для генераторов и ИИ-агентов. Компилятор не должен исполнять инструкции, содержащиеся в данных.

---

# 27. Масштабирование

## 27.1. Low-cardinality profile

Для Webgogol:

- один репозиторий;
- Markdown manifests;
- Git;
- полный compile при build;
- несколько Products/Offerings.

## 27.2. High-cardinality profile

Для 10 000+ SKU:

- bulk dataset;
- incremental validation;
- partitioning;
- change feed;
- localized attribute tables;
- runtime inventory adapter;
- generated entity snapshots;
- content-addressed cache;
- batch derivations.

## 27.3. Одна семантика

Обе реализации должны выдавать одинаковую PBP logical entity и проходить одни conformance tests.

---

# 28. Conformance Levels

## Level 0 — Parseable

- валидный schema ID;
- валидный entity ID;
- syntactic validity.

## Level 1 — Catalog Core

- Business;
- Product;
- CatalogEntry;
- Offering;
- pricing;
- locale resolution;
- referential integrity.

## Level 2 — Buyer Complete

- Buyer View;
- terms;
- fulfillment;
- rights/limitations;
- derivations;
- comparison profile.

## Level 3 — Evidence Ready

- Claims;
- Evidence;
- Credentials;
- staleness control;
- disclosures.

## Level 4 — Verifiable

- canonical snapshots;
- signatures;
- Sichtpass/VC mapping;
- externally verifiable publication history.

## Level 5 — Federated Commerce

- external identifiers;
- runtime adapters;
- bulk catalogs;
- cross-business comparison;
- interoperable registry/resolver.

---

# 29. Минимальный Webgogol scope

Первая реализация должна включать:

- Business;
- LegalIdentity;
- Place;
- ContactPoint;
- WebPresence;
- Product;
- Catalog;
- CatalogEntry;
- Offering;
- Policy;
- Claim;
- EvidenceSource;
- Disclosure;
- BuyerViewSchema;
- first-year cost derivation;
- locale fallback;
- website projection;
- AI Answer projection;
- Schema.org projection;
- validation report;
- Git sourceRevision.

Runtime inventory, Reviews, Credentials и Sichtpass signing могут быть реализованы позже, но их schema boundaries должны быть определены.

---

# 30. Нормативные инварианты

1. Entity ID не содержит locale.
2. Один факт не хранится вручную в нескольких сущностях.
3. Product не содержит seller-specific pricing.
4. Offering ссылается на CatalogEntry.
5. CatalogEntry ссылается на Product/ProductVariant/ProductGroup.
6. SKU не хранится как Product external identifier.
7. Variant не моделируется как bundle.
8. Bundle не моделируется как variation axis.
9. Charge и Plan разделены.
10. Money — decimal string.
11. Buyer quantity не хранится в публичном каталоге.
12. Complex collections — keyed maps.
13. Non-default locale не переопределяет invariant facts.
14. Missing не означает false.
15. SLA измерим.
16. Guarantee имеет remedy.
17. Derived value имеет Derivation Contract.
18. Projection не является canonical source.
19. Runtime state не переписывает static contract.
20. Legacy fields не сохраняются ради совместимости.
21. History обеспечивается revision system, а не дублированием старых значений в Manifest.
22. `pbp/*@1` не меняет имена блоков.
23. Tax/buyer semantics зарезервированы в `@1`.
24. Public profile не содержит secrets/private operational facts.
25. Canonical signature подписывает resolved JSON, не сырой Markdown.

---

# 31. Информативные внешние соответствия

- Schema.org `ProductGroup` моделирует группу продуктов, различающихся по определенным осям, и предоставляет `hasVariant`, `isVariantOf`, `variesBy`.
- GS1 Digital Link задает Web URI-синтаксис для GS1 identification keys.
- JSON-LD 1.1 предоставляет JSON-сериализацию linked data.
- JSON Schema 2020-12 подходит для структурной валидации manifests.
- RFC 8785 подходит как baseline canonical JSON serialization для hash/signature workflows.
- W3C Verifiable Credentials Data Model 2.0 может использоваться для последующего Sichtpass/credential layer.

Эти стандарты являются mapping targets и building blocks. PBP сохраняет собственную более богатую внутреннюю семантику.

<!-- END 01-PBP-System-Specification.md -->

---

<!-- BEGIN 02-PBP-Entity-and-Field-Model.md -->

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

<!-- END 02-PBP-Entity-and-Field-Model.md -->

---

<!-- BEGIN 03-PBP-Compiler-Validation-and-Projections.md -->

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

<!-- END 03-PBP-Compiler-Validation-and-Projections.md -->

---

<!-- BEGIN 04-Webgogol-Migration-Agent-Plan.md -->

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

<!-- END 04-Webgogol-Migration-Agent-Plan.md -->

---

<!-- BEGIN 05-Webgogol-Target-Manifest-Blueprint.md -->

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

<!-- END 05-Webgogol-Target-Manifest-Blueprint.md -->

---

<!-- BEGIN 06-PBP-RFC-Roadmap.md -->

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

<!-- END 06-PBP-RFC-Roadmap.md -->

---

<!-- BEGIN 07-PBP-Decision-Log.md -->

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

<!-- END 07-PBP-Decision-Log.md -->
