---
reviewId: REVIEW-CODE-2026-08-20-01
date: 2026-08-20
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: d1273586...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/icon-references.ts
  - packages/werkstatt-site/src/domain/ui/icons/resolve-icon-file-name.ts
  - packages/werkstatt-site/src/domain/ui/icons/icon-resolver.ts
  - packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts
  - packages/werkstatt-site/src/checks/index.ts
  - packages/werkstatt-site/src/checks/tests/icon-references.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/verification-plan.xml
  - docs/rfcs/rfc-0893-add-icon-references-validate-command.md
---

# Code Review: d1273586...HEAD (RFC-0893 implementation)

### Verdict: Needs revision

Реализация RFC-0893 структурно корректна, проходит тесты и `rfc.validate`. Найдены три незначительные проблемы: дублирование кода в функциях обхода директорий, отсутствие `--scope` фильтрации (несоответствие с существующими валидаторами контента), и потенциальные ложные срабатывания в `isVendorIconConfigLike`.

### Mechanical floor

**Частичный проход.** `rfc.validate --id RFC-0893` — 0 ошибок. `vitest run src/checks/tests/icon-references.test.ts` — 5/5 тестов проходят. `build:check` — предсуществующие ошибки в `integration-routes/*.api.ts` (требуют Astro env типы), не связаны с RFC-0893. Изменённые файлы не появляются в списке ошибок.

### Axis A — Structural correctness

1. **Duplicated Code (Fowler):** `collectAstroFiles` (`icon-references.ts:58-74`) и `collectYamlFiles` (`icon-references.ts:164-180`) — почти идентичные рекурсивные обходщики директорий, различаются только расширением файла. Следует извлечь общий хелпер `walkFiles(dir, predicate)`.

2. **Неиспользуемый параметр `input`:** `runIconReferencesValidate` принимает `input: KernelCommandInput` (`icon-references.ts:183`), но не читает из него флаги. `runContentReferencesValidate` использует `readScopeFiles(input)` для `--scope` фильтрации. Новый валидатор не поддерживает scoped выполнение.

### Axis B — DNA alignment

**Нет проблем.** DNA-38 (канонические контракты авторского контента) — валидатор усиливает инвариант, проверяя что все `VendorIconConfig` ссылки разрешаются в сгенерированные компоненты. Нарушений DNA не обнаружено.

### Axis C — Ecosystem fit

**Нет проблем.** Команда зарегистрирована в `31-public-surface.ts:107-116` с `scope: "app"`. Пайплайн `SITES_CHECK_AUTHOR_PIPELINE` обновлён в `sites-check-author.ts:250` после `public.icons.validate`. `AGENTS.md:98` и `docs/verification-plan.xml:533-536` (entry `vm-38`) обновлены. Экспорт добавлен в `checks/index.ts:77`.

### Axis D — Forward-only compliance

**Нет проблем.** Извлечение `resolveIconFileName` в `resolve-icon-file-name.ts` — чистый рефакторинг без совместимого слоя. Re-export из `icon-resolver.ts:37` сохраняет публичный API. Удаление функции из `icon-resolver.ts` и замена на import+re-export — прямое изменение, без двойных путей.

### Axis E — Agent-facing clarity

1. **Расхождение RFC с реализацией:** RFC-0893 implementation note (строка 207) гласит: "Import `resolveIconFileName` from `@warpgogol/werkstatt-site/ui/icons/icon-resolver`". Реализация импортирует из `../domain/ui/icons/resolve-icon-file-name.ts` (`icon-references.ts:31`). Обоснование (избежать `import.meta.glob` crash в Node.js) верное, но текст RFC не обновлён. Следует обновить implementation note в RFC.

2. Новые файлы содержат `MODULE_CONTRACT` и `CHANGE_SUMMARY` — корректно. Имена переменных и функций ясны.

### Axis F — Pragmatism

1. **Дублирование с существующим паттерном:** `collectAstroFiles` и `collectYamlFiles` дублируют `collectMarkdownFilesSafe` из `content-discipline.ts`. Существующий хелпер `collectMarkdownFiles` уже реализует тот же паттерн обхода. Можно было расширить его параметром расширения файла вместо двух новых функций.

2. **Минимальная поверхность команд:** Команда `icon.references.validate` заслуживает существования — отдельная область сканирования (YAML object shape matching vs. pageId resolution). Не является флагом существующей команды.

### Axis G — Blind spots

1. **Ложные срабатывания `isVendorIconConfigLike`:** Type guard (`icon-references.ts:91-97`) проверяет только наличие ключей `vendor`, `collection`, `name`, без проверки типов значений. Контент-объекты с этими полями в другом семантическом контексте (например, запись о поставщике с полем `name`) будут ложно определены как `VendorIconConfig`. RFC упоминает этот риск, но реализация не добавляет дополнительных эвристик (например, проверка что `vendor` — известный вендор из реестра).

2. **Производительность:** O(n) по контентным файлам + O(m) по иконам — задокументировано в RFC ( Risks, строка 187). ~200 файлов + ~350 икон, < 1с. Корректно.

3. **Edge cases:** Пустая директория контента, пустая `icons/gen/` — обе обработаны. `WeakSet` предотвращает циклы. Корректно.

### Spec compliance

| Требование RFC-0893 | Статус | Evidence |
| --- | --- | --- |
| TypeScript types в `packages/werkstatt-site/src/checks/` | Done | `icon-references.ts:39-45` |
| Команда `icon.references.validate` в `31-public-surface.ts` | Done | `31-public-surface.ts:107-116` |
| `--json` output format | Done | `passResult`/`failResult` возвращают `KernelCommandResult` |
| Pipeline `SITES_CHECK_AUTHOR_PIPELINE` после `public.icons.validate` | Done | `sites-check-author.ts:250` |
| Unit tests: 5 сценариев | Done | `icon-references.test.ts`, 5/5 pass |
| `AGENTS.md` updated | Done | `packages/werkstatt-site/AGENTS.md:98` |
| `docs/verification-plan.xml` updated | Done | `docs/verification-plan.xml:533-536` |
| `rfc.validate` passes | Done | 0 errors |
| Import `resolveIconFileName` from `icon-resolver` | Partial | Извлечён в `resolve-icon-file-name.ts`, re-export из `icon-resolver.ts` сохранён, но RFC text не обновлён |

### Questions for the author

1. Следует ли обновить RFC-0893 implementation note (строка 207), чтобы отразить извлечение `resolveIconFileName` в отдельный файл `resolve-icon-file-name.ts`?
2. Нужно ли добавить `--scope` фильтрацию для консистентности с `content.references.validate`, или это намеренно опущено?
3. Можно ли снизить риск ложных срабатываний `isVendorIconConfigLike`, добавив проверку что `vendor` соответствует известному списку вендоров (например, из реестра в `icon-resolver.ts`)?
