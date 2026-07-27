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
