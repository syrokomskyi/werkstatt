# RFC-0354 Sternsystem bundle contract and fleet registry discussion

**Session ID:** ses_0bec65e69ffel6reCi1mfJ6gO3 **Created:** 08/07/2026, 12:15:23 **Updated:** 08/07/2026, 12:27:34

---

## User

Работаем над @docs/rfcs/rfc-0354-establish-the-sternsystem-bundle-contract-and-fleet-registry.md

---

## Assistant (Build · Big Pickle · 8.9s)

---

## User

**Роль:** Ты — Staff Software Engineer и Principal Architect с 20-летним опытом проектирования высоконагруженных, распределенных и отказоустойчивых систем. Твоя задача — провести строгое ревью созданных выше технических документов RFC (Request for Comments).

**Контекст:** Исходные RFC были сгенерированы ИИ, поэтому они могут содержать поверхностные архитектурные решения, игнорировать сложные edge cases (пограничные случаи) или предлагать избыточные абстракции. Нужен критический, прагматичный и технически глубокий анализ, ориентированный на реальный production.

**Инструкции по проверке:**

- **Техническая осуществимость:** Найди логические нестыковки, узкие места в производительности (bottlenecks) и потенциальные проблемы с масштабированием.

- **Рациональность:** Проверь, рассмотрены ли более простые или дешевые альтернативы. Укажи на элементы овер-инжиниринга.

- **Отказоустойчивость:** Опиши сценарии, при которых предложенная система может упасть, и оцени стратегии восстановления (graceful degradation).

- **Слепые зоны:** Укажи на отсутствие важных эксплуатационных деталей (метрики, логирование, алертинг, безопасность, миграция данных).

**Формат ответа:**

1. **Executive Summary:** Краткий вердикт (Одобрено, Требует доработок, Отклонено) с обоснованием в 2-3 предложениях.

2. **Критические архитектурные уязвимости:** Перечень главных проблем, которые сломают систему в production.

3. **Неучтенные Edge Cases:** Список сценариев и пограничных случаев, о которых забыли авторы RFC.

4. **Конкретные улучшения:** Прагматичные предложения по изменению архитектуры, стека или структур данных.

5. **Вопросы автору:** 3 сложных вопроса, на которые документы обязаны дать ответ перед тем, как их возьмут в работу.

Менять в проекте сейчас ничего не надо. Только ответ.

---

## Assistant (Build · Big Pickle · 117.3s)

_Thinking:_

The user wants me to review RFC-0354 as a Staff Software Engineer / Principal Architect. Let me provide a thorough, critical review of this document before implementation work begins.

Let me analyze this carefully.

---

## Executive Summary

**Требует доработок.** RFC-0354 в целом грамотно идентифицирует проблему масштабирования monorepo и предлагает разумную декомпозицию на bounded contexts (Sternsystem bundle, fleet registry, version pin). Однако документ преждевременно вводит накладные расходы на операции (git clone каждого Sternsystem, cache clone lifecycle, YAML registry) без демонстрации, что более простые решения (напр., JSON registry в S3 + статический индекс) недостаточны. Основной риск — это разрыв между обещанной «масштабируемостью до тысяч» и решениями, которые при тысяче систем создадут operational overhead, с которым авторы не справились в документации.

---

## Критические архитектурные уязвимости

### 1. Git clone как единица доступа не масштабируется

- **Сценарий отказа:** cache-location (`systems/<id>/`) удалён. При следующем register/validate — clone. Если репозиторий требует ключей SSH (все Sternsystems будут иметь свой deploy key?) — это новый уровень сложности, никак не описанный.

**Вывод:** RFC не описывает, как агент/CI будет аутентифицироваться для клонирования 1000+ Sternsystem-репозиториев. SSH key management для fleet — это целая профессия.

### 2. Registry как YAML-файл в monorepo — это mutual exclusion в CI

`systems/registry.yaml` — один YAML-файл, который:

- Одновременно изменяем множеством параллельных процессов (`sternsystem.register`, `sternsystem.pin`)
- Конфликтует в git merge при параллельных регистрациях
- Не имеет транзакционной семантики

**Сценарий отказа:** Два инженера одновременно регистрируют два Sternsystem. merge conflict в `registry.yaml`. Решается ручным merge. При 100+ систем в месяц — это регулярная боль.

**Что не предложено:** ни locking (Redis/advisory), ни append-only журнал + projection (как Event Log → материализованный registry), ни хранение registry в database/key-value store.

### 3. `sternsystem.pin` — рассинхронизация с реальностью

Pinned version отделена от реального состояния Sternsystem:

- Pin записывается при `sternsystem.pin`, но Sternsystem может быть NEVER успешно материализован на этой версии.
- `sternsystem.pin` не требует `sternsystem.validate` или успешного build.

**Сценарий отказа:** pin указывает `4.5.0`, Sternsystem на самом деле собран на `4.4.0` (старый билд). `migratorCursor` = `4.5.0`. Тихая рассогласованность.

Необходимо: pin = commit of materialization, а не просто «запись версии».

---

## Неучтенные Edge Cases

### 5. Graceful degradation при отсутствии remote repo

Если `sternsystem.register` клонирует, а репозиторий потом удалён / permissions revoked — что происходит?

- registry указывает на несуществующий repo
- validate не может clone
- status = `registered`, но система недоступна

Нужен `status: orphaned` или `sternsystem.deregister`.

### 6. Sternsystem id conflicts at scale

`id` = kebab-case, lowercase — это fine-grained constraint. Но что если два разных клиента имеют одинаковое имя? Например, две компании "Innovate GmbH" → `innovate`.

RFC не описывает механизм предотвращения конфликтов имен или процесс их разрешения.

### 8. `packagesHash` — что он верифицирует?

`sha256 over packages/ tree at pin time` — что это значит? Меняется ли он при изменении комментария в source code? При изменении README? Как определяется "изменение платформы"? Это может привести к ложным срабатываниям.

### 9. Нет политики для orphaned Sternsystem

- `status: paused` — но насколько paused? через год он `archived`?
- Кто garbage collect'ит `systems/<id>/` при переходе в `archived`?

### 10. Migration между версиями платформы

Документ упоминает `migratorCursor` но не описывает:

- Как происходит платформенная миграция Sternsystem
- Кто запускает migrators? Агент? CI? Operator?
- Как откатить неудачную миграцию (downgrade запрещён — `V_src > V_cur refuses`)
- Что если Sternsystem был pinned на `4.5.0` и не мигрирован 2 года, до `5.0.0`?

---

## Конкретные улучшения

### 11. Registry: YAML → JSON + Append-only + Snapshot

Вместо одного редактируемого YAML-файла:

- **Append-only event log** `systems/events.ndjson` (каждое событие = registration, pin, status change, mission start/end, release)
- **Snapshot** `systems/registry.generated.json` — материализованная проекция event log'а
- Генератор snapshot: `pnpm exec site-kernel run sternsystem.registry.build`

Это решает:

- merge conflicts (append-only пишет новую строку, не редактирует существующую)
- traceability (история изменений встроена в файл)
- atomicity (генерация snapshot — детерминированная)

### 12. Валидация pin требует успешного materialization

`sternsystem.pin` должен вызывать `sternsystem.validate` как precondition, и требовать, чтобы `materialize --check` прошёл успешно перед записью pin.

### 13. Cache: lazy clone + validate timeout

Добавить:

- `strategic validate` timeout (30s на систему, при превышении = warning)
- Shallow clone (`--depth 1 --single-branch`) как default, с опцией `--full` для копания истории
- `--offline` mode для validate без сети (проверить только локальный кэш)

### 14. Registry lifecycle — cleanup для archived

Добавить политику: через N дней после `archived`, удалить `systems/<id>/` cache (но не registry entry). Через M месяцев — удалить registry entry в отдельный `systems/archived-registry.yaml`.

---

## Вопросы автору

1. **Как аутентифицируются 1000+ Sternsystem-репозиториев?** Предполагаете ли вы единый deploy key для всего fleet? Если один ключ скомпрометирован, как ротируете? Если у каждого своя пара ключей, где храните их маппинг и как CI получает доступ?

- Единый deploy key для всего fleet.
- Ротация ключа происходит вручную на GitHub: после этого Werkstatt производит деплои по новому ключу.

2. **Что доказывает `packagesHash`?** Если я меняю только комментарий в одном файле `packages/share`, `packagesHash` меняется — значит ли это, что платформа «изменилась» и все pinned Sternsystem должны перематериализоваться? Если нет — что триггерит «настоящее» изменение платформы?

- `packagesHash` доказывает, что платформа изменилась.
- Изменение комментария в одном файле `packages/share` не приводит к изменению `packagesHash`, так как хэш рассчитывается только по содержимому файлов, а не по комментариям. Следует добавить правило: изменение комментария в одном файле `packages/share` не приводит к изменению `packagesHash`. Также не меняем `packagesHash` при изменении форматирования. Нужен новый пакет, рассчитывающий хеши для всей системы, учитывая комментарии, форматирование и значимый для сайта контент. TBD https://grok.com/share/c2hhcmQtMi1jb3B5_21535ce0-a4b0-4038-9889-a48130d4f3e9

3. **Как выглядит recovery после успешной pin но failed build?** Пример: `sternsystem.pin --platform 4.6.0` успешен, `system.pin.json` обновлён до `4.6.0`, но `pnpm build` падает на несовместимости API. Pin остаётся на `4.6.0`, Sternsystem не собран. Как система обнаруживает, что pin разошёлся с реальностью? Что должен сделать оператор?

- Оператор должен исправить ошибку или откатить `system.pin.json` до предыдущей версии.
