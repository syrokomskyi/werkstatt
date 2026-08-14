---
reviewId: REVIEW-CODE-2026-08-15-01
date: 2026-08-15
reviewer:
  skill: fo-review
  model: gpt-5.6-sol
verdict: needs-revision
diffRange: "current implementation against RFC-0660..RFC-0663"
filesReviewed:
  - packages/forge/src/knowledge/budgets.ts
  - packages/forge/src/knowledge/serialize.ts
  - packages/forge/src/knowledge/compact.ts
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/validators/skill-validate.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/onboarding/upgrade.ts
  - packages/forge/src/tests/budgets.test.ts
  - packages/forge/src/tests/knowledge-parse.test.ts
  - packages/forge/src/tests/knowledge-pbt.test.ts
  - packages/forge/src/tests/compact.test.ts
  - packages/forge/src/tests/upgrade.test.ts
---

# Code Review: жизненный цикл Forge knowledge против RFC-0660…RFC-0663

### Verdict: Needs revision

Новый RFC не требуется. Проверяемые контракты уже приняты в RFC-0660…RFC-0663, но текущая реализация им не соответствует в пяти местах. Наиболее опасные отклонения — отсутствие бюджета shared-слоя, полная пересериализация файлов без побайтовой сохранности и неатомарная последовательность записи live/archive. Они делают maintenance-команды внешне успешными, но не гарантируют сохранность знания и не обнаруживают фактическое переполнение общей памяти агентов.

Этот review является implementation-ready fix brief. Следующий агент должен исправить перечисленные расхождения в существующих контрактах, не создавать новый RFC, не ослаблять acceptance criteria архивных RFC и не добавлять compatibility path.

### Mechanical floor

**Pass, но недостаточен для доказательства контрактов.**

- `pnpm --filter @warpgogol/forge build:check` — exit 0.
- Точечный прогон `knowledge-parse.test.ts`, `knowledge-pbt.test.ts`, `compact.test.ts`, `budgets.test.ts`, `upgrade.test.ts` — 5 файлов, 77 тестов passed.
- Оба результата показывают отсутствие type/runtime-регрессии в покрытом happy path, но не проверяют найденные обязательства: shared budget, побайтовую идемпотентность, отказоустойчивую пару live/archive и same-version repair.
- Текущий canonical и synced shared-файл имеют по 5316 символов, то есть уже больше нормативного default shared budget 4096, однако budget pipeline этот файл не учитывает.

### Findings

#### F1 — High: shared knowledge исключён из budget contract

**Нормативная основа.** RFC-0663 прямо определяет shared-слой как hot knowledge с отдельным default budget 4096 и override `bindings.knowledge.budgets.shared`. Продвижение должно уменьшать суммарную hot-стоимость, оставляя одну учтённую shared-копию.

**Evidence.**

- `packages/forge/src/knowledge/budgets.ts:24-27` определяет только `hot` и `warm`.
- `packages/forge/src/knowledge/budgets.ts:43-46` не содержит default `shared`.
- `packages/forge/src/knowledge/budgets.ts:90` маршрутизирует любой L2-файл в `budgets.hot`, не различая local hot и shared hot.
- `packages/forge/src/knowledge/budgets.ts:145-162` читает только overrides `hot` и `warm`.
- `packages/forge/src/config/forge-config.ts:72-79` не разрешает `bindings.knowledge.budgets.shared` в схеме.
- `packages/forge/src/onboarding/doctor.ts:400-443` собирает только knowledge-файлы, объявленные skills/packs. Shared-файл без собственного `SKILL.md` не попадает в эту коллекцию; он читается отдельно лишь для duplicate/schema checks.
- `packages/forge/src/onboarding/doctor.ts:447-466` сообщает только `hot`/`warm`.
- `packages/forge/src/validators/skill-validate.ts:778-809` применяет SKILL-21 только к уже переданным локальным файлам конкретного skill.

**Impact.** Общий слой может расти без предупреждений. Более того, promotion создаёт иллюзию экономии бюджета: локальные копии исчезают из проверок, а единственная shared-копия вообще не учитывается.

**Required fix.**

1. Расширить `KnowledgeBudgets` и `DEFAULT_KNOWLEDGE_BUDGETS` полем `shared: 4096`.
2. Добавить `shared` в typed config schema, resolver, validation warnings и doctor summary. Значение должно быть положительным целым; невалидное значение даёт advisory warning и fallback к 4096 по тем же правилам, что `hot`/`warm`.
3. Перестать выводить тип бюджета только из `layer`. Передать явную budget identity (`hot | warm | shared`) либо эквивалентный типизированный source context. Не определять shared по случайному basename.
4. В `forge.skill.validate` и `forge.doctor` загрузить canonical shared source ровно один раз с identity `shared`; не приписывать его каждому consuming skill и не считать N раз.
5. Сохранить advisory semantics: превышение бюджета — warning, не hard failure.
6. Использовать один общий collector/calculator для validator и doctor, чтобы их JSON и CLI представления не расходились.

**Acceptance evidence.**

- Unit tests на default, valid override и каждую разновидность invalid `shared` override.
- Граничные тесты `activeChars === 4096` и `activeChars === 4097`.
- Integration tests, доказывающие один shared report независимо от числа skills и одинаковые effective budgets в validator/doctor.
- Regression test с shared-файлом больше 4096: SKILL-21/doctor возвращает warning с `skill: shared`, `budget: 4096`, положительным `exceededBy`.
- Архивные/superseded entries не входят в `activeChars`, как и в локальных слоях.

#### F2 — High: serializer и compaction не обеспечивают побайтовую идемпотентность

**Нормативная основа.** RFC-0660 требует round-trip lifecycle, DNA-41 требует PBT для round-trip/idempotency, а RFC-0662 усиливает контракт: active non-expired entries и существующие archive entries после compaction должны быть byte-identical.

**Evidence.**

- `packages/forge/src/knowledge/serialize.ts:50-71` заново строит весь документ, глобально схлопывает три и более перевода строки и безусловно добавляет `\n`.
- Для structured-empty/preamble-only файла повторный `serialize(parse(...))` меняет хвост файла: preamble уже содержит завершающий перевод строки, а serializer добавляет ещё один.
- Любые авторские blank-line runs, line endings и форматирование untouched entries нормализуются при пересериализации всего файла.
- `packages/forge/src/knowledge/compact.ts:286-291` пересериализует весь live-файл даже при изменении одного entry.
- Текущие parse/PBT tests проверяют семантическое равенство metadata после второго parse, но не равенство байтов сериализованного документа или raw slices неизменённых entries.

**Impact.** Maintenance-команда может создавать постоянный diff без смысловых изменений и переписывать неподлежащие изменению знания. Заявленное RFC evidence фактически отсутствует.

**Required fix.**

1. Зафиксировать и реализовать два отдельных свойства:
   - canonical serializer idempotency для уже сериализованного документа;
   - byte preservation для preamble, legacy sections и entries, которые операция не меняет.
2. Не пытаться получить byte preservation полной реконструкцией из одних semantic fields. Parser должен сохранять raw source/span для документных сегментов, либо mutation writer должен делать targeted patch исходного текста. Выбрать одну модель и использовать её и для live, и для archive companion.
3. Изменённому entry разрешено канонически пересериализовать только его собственный segment. Все untouched segments должны переноситься без изменения байтов и порядка.
4. Явно определить обработку terminal newline и CRLF. Безопасный default для существующего файла — сохранить исходный line-ending style и terminal-newline state; для нового файла — canonical LF с одним terminal newline.
5. Legacy sections нельзя незаметно переформатировать или терять при structured mutation.

**Acceptance evidence.**

- Table tests: empty file, structured-empty file, preamble-only, один/несколько terminal newlines, несколько blank lines, CRLF, legacy-only, mixed legacy/structured, metadata arrays и `promotedFrom`.
- PBT: `serialize(parse(serialize(parse(source)))) === serialize(parse(source))` для canonicalizable sources.
- PBT или targeted invariant test: raw slice каждого untouched entry до и после compaction строго равен (`Buffer.equals`/string equality), включая существующие entries archive companion.
- Regression test: два последовательных no-op serialize/compact не создают diff.
- Tests не должны подменять byte identity повторным semantic parse comparison.

#### F3 — High: compaction пишет live/archive неатомарно и допускает частичную потерю консистентности

**Нормативная основа.** RFC-0662 обещает staging + rename, отказ без записи при invalid archive и согласованное состояние уже обработанных файлов после mid-run I/O failure.

**Evidence.**

- `packages/forge/src/knowledge/compact.ts:292` вызывает прямой `fs.writeFileSync` для live-файла.
- `packages/forge/src/knowledge/compact.ts:333-338` комментарий заявляет atomic write, затем осознанно использует прямой `fs.writeFileSync` «for simplicity».
- Live переписывается раньше archive companion. Если archive write падает, entries уже удалены/изменены в live, но не появились в archive.
- Код не показывает preflight parse/validation итогового archive content и не обеспечивает rollback пары.

**Impact.** Ошибка диска, permission failure или авария процесса между двумя writes может потерять переносимые entries или оставить противоречивую пару файлов при итоговом `status: fail`.

**Required fix.**

1. До любых mutations вычислить оба prospective contents в памяти и повторно проверить их parseability, уникальность IDs и отсутствие потери entries.
2. Использовать существующий atomic-write primitive либо выделить общий primitive staging-file + fsync/close + rename. Не оставлять прямые writes и комментарии о будущей production-реализации.
3. Обеспечить безопасный порядок для пары: archive content должен стать durable до удаления entries из live. Если второй rename не удаётся, операция обязана сохранить исходный live и повторный запуск не должен создавать duplicate/loss. Если выбран rollback, он должен быть явно протестирован на каждом failure point.
4. Привести sync/async boundary в соответствие primitive: разрешено сделать `executeCompaction` async и протянуть `await` через command adapter; запрещено игнорировать Promise или имитировать атомарность комментарием.
5. Ошибка одного file plan не должна повреждать untouched plans; report должен точно перечислять committed и failed plans.

**Acceptance evidence.**

- Failure-injection tests для stage/write/rename live и archive, включая failure между archive и live commit.
- После каждого injected failure объединение live + archive содержит каждый исходный ID ровно один раз или полностью сохраняет исходное состояние; ни loss, ни duplicate не допускаются.
- Повторный запуск после failure сходится к ожидаемому результату.
- Test invalid existing archive: exit non-zero, оба файла byte-identical исходным.
- В production path нет `writeFileSync` для compaction mutations.

#### F4 — Medium: same-version upgrade не может восстановить managed drift

**Нормативная основа.** RFC-0663 делает shared knowledge частью forge create/upgrade synchronization. Managed artifacts должны сходиться к bundled source без требования создавать проект заново.

**Evidence.**

- `packages/forge/src/onboarding/upgrade.ts:373-397` возвращает `noop`, как только `syncedVersion === installedVersion`.
- Sync skills, packs и shared knowledge выполняется только после early return (`packages/forge/src/onboarding/upgrade.ts:399-423`).
- `packages/forge/src/onboarding/doctor.ts:288` и `:730` советует запускать `forge create` для sync, хотя create предназначен для нового/пустого target и не является repair-командой рабочего проекта.
- Текущий `upgrade.test.ts` закрепляет version equality как безусловный no-op, но не моделирует stale/missing managed file при той же версии.

**Impact.** Повреждённый, устаревший или вручную рассинхронизированный managed skill/shared-файл нельзя штатно восстановить. Doctor выдаёт недействующий remediation hint, и агент вынужден делать ручной copy вне lifecycle.

**Required fix.**

1. При одинаковой версии всё равно выполнить read-only drift comparison managed artifacts. Возвращать `noop` только если они byte-identical bundled sources и обязательные destinations присутствуют.
2. При drift синхронизировать только Forge-owned outputs (`.agents/skills/**` и иные уже объявленные managed artifacts). Не перезаписывать operator-owned config/content.
3. Если продукту нужен явный режим, добавить его только если существующий command contract действительно не позволяет convergence; предпочтительный минимальный вариант — безопасный repair внутри обычного `forge.upgrade` без нового command.
4. Исправить doctor hints на точную исполнимую команду `forge.upgrade` (с flag, только если он реально введён и протестирован).
5. Dry-run обязан показать planned repairs, не писать файлы и не маскировать drift как noop.

**Acceptance evidence.**

- Same version + clean managed tree → `noop`, ноль writes.
- Same version + stale local skill → файл восстановлен, result перечисляет update.
- Same version + stale/missing shared knowledge destination → восстановлен из canonical source.
- Same version + dry-run drift → planned update виден, bytes не меняются.
- Operator-owned файл рядом с managed outputs остаётся byte-identical.
- Doctor hint запускается в fixture project и действительно устраняет предупреждение.

#### F5 — Medium: compaction report утверждает запись на no-op

**Evidence.**

- `packages/forge/src/knowledge/compact.ts:286` пишет live только при `plan.actions.length > 0`.
- `packages/forge/src/knowledge/compact.ts:344-351` затем безусловно возвращает `written: true` для любого non-dry-run plan.
- В реальном no-op plan это создаёт ложное evidence для оператора и автоматизации.

**Impact.** Следующий pipeline не может отличить mutation от проверки. Логи и `filesModified`/reporting могут утверждать, что knowledge было переписано, хотя байты не менялись.

**Required fix.**

1. Вычислять `written` из фактически committed mutation, а не из `dryRun === false`.
2. Для no-action plan возвращать `written: false`; для failed commit также `false`.
3. Если archive-only/live-only сценарии допустимы, report должен различать их (`liveWritten`, `archiveWritten`) либо документировать одну однозначную derived semantics.
4. Command summary и declared `filesModified` должны использовать то же фактическое состояние.

**Acceptance evidence.**

- Non-dry no-op test: `written: false`, timestamps/bytes не изменены.
- Successful mutation test: write flags соответствуют реально заменённым файлам.
- Injected failure test: failed target не помечен как written.

### Axis A — Structural correctness

**Needs revision.** F2, F3 и F5 нарушают базовую корректность mutation lifecycle: serializer меняет больше требуемого, pair write не транзакционен, result не отражает реальный side effect.

### Axis B — DNA alignment

**Needs revision.** DNA-41 формально заявлен, но PBT проверяет semantic metadata round-trip вместо требуемой byte/idempotency границы. DNA-60 (knowledge schema lifecycle) нарушен расхождением между принятыми lifecycle contracts и mutation behavior.

### Axis C — Ecosystem fit

**Needs revision.** F1 оставляет shared source вне governance pipeline; F4 разрывает canonical bundle → synced consumer convergence. Validator, doctor и upgrade дают разные представления одного managed state.

### Axis D — Forward-only compliance

**Pass.** Исправление не требует legacy adapters, dual paths или сохранения ошибочного поведения. Same-version convergence заменяет безусловный early return, а не добавляет параллельный lifecycle.

### Axis E — Agent-facing clarity

**Needs revision.** Комментарий об atomic write противоречит исполняемому коду, `written: true` сообщает ложный факт, а doctor предлагает непригодную repair-команду. Для менее сильного агента это особенно опасно: текстовые affordances ведут к неверному действию.

### Axis F — Pragmatism

**Needs revision.** В репозитории уже есть atomic-write primitive, но compaction его обходит. Минимальное решение — переиспользовать общий collector/budget calculator и существующую synchronization surface, а не вводить новый command или новый RFC.

### Axis G — Blind spots

**Needs revision.** Не покрыты пустые structured files, terminal newline/CRLF, failure points между двумя файлами, no-action reporting и managed drift при совпадающей версии. Именно эти состояния воспроизводят найденные дефекты.

### Spec compliance

| Нормативное требование | Статус | Evidence |
| --- | --- | --- |
| RFC-0660: parse/serialize lifecycle сохраняет metadata | Done | Текущие parse и PBT tests проходят |
| RFC-0660 + DNA-41: практическая serializer idempotency на граничных документах | Partial | Semantic round-trip покрыт, byte-level/empty-state свойства отсутствуют |
| RFC-0661: local hot/warm budgets и overrides | Done | `budgets.ts`, SKILL-21 и doctor tests проходят |
| RFC-0662: active и существующие archive entries byte-identical | Missing | Полная реконструкция в `serializeKnowledgeFile` |
| RFC-0662: atomic staging + rename | Missing | Прямые `fs.writeFileSync` для live/archive |
| RFC-0662: truthful per-file mutation report | Missing | `written: true` без actions |
| RFC-0663: shared default budget 4096 и `budgets.shared` override | Missing | Тип, schema, resolver и collectors не содержат shared budget |
| RFC-0663: shared knowledge синхронизируется upgrade | Partial | Синхронизируется только при изменении version marker; repair drift невозможен |

### Рекомендуемый порядок реализации

1. Сначала F2: определить raw-segment/targeted-writer contract и закрыть его table tests + PBT. Без этого compaction нельзя безопасно чинить.
2. Затем F3 и F5 вместе: построить prospective pair, атомарно commit-ить и честно репортить side effects.
3. Затем F1: расширить typed budget contract и подключить shared source единым collector path.
4. Затем F4: сделать upgrade convergent при same version и заменить doctor hints.
5. После каждого шага запустить scoped tests и `build:check`; в конце — полный `pnpm --filter @warpgogol/forge test`, `forge.skill.validate`, `forge.doctor`, `forge.validate`, `ecosystem.manifest.validate` и `command.manifest.validate`/генерацию только если command metadata действительно изменена.
6. Перед stamp/архивацией ничего не менять в RFC-0660…0663. Если реализация обнаружит настоящее новое архитектурное решение, остановиться и классифицировать только эту delta через `fo-idea`.

### Questions for the author

1. Какой internal representation выбран для побайтовой сохранности: raw segment spans в parser или targeted patch writer? В implementation plan должен быть один путь, не два экспериментальных.
2. Подтверждено ли, что shared budget считается ровно один раз на workspace и не агрегируется по числу consumers?
3. Как доказана pair consistency при падении между archive и live rename: safe ordering, rollback или иной конкретный protocol?
4. Может ли обычный `forge.upgrade` безопасно стать convergent repair surface без нового flag? Если нет, требуется явное доказательство несовместимости существующего contract до архитектурной эскалации.

