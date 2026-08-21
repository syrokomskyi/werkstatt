---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1e4ffb3c...HEAD
filesReviewed:
  - packages/werkstatt-shared/src/share/page.ts
  - packages/werkstatt-site/src/checks/content-links.ts
  - packages/werkstatt-site/src/checks/page-block.ts
  - packages/werkstatt-site/src/checks/tests/content-links.test.ts
  - packages/werkstatt-site/src/domain/share/astro/routes.ts
  - packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts
  - packages/werkstatt-site/src/domain/share/astro/routes/registry.ts
  - packages/werkstatt-site/src/domain/share/astro/semantic-target.ts
  - packages/werkstatt-site/src/domain/ui/blocks-renderer.astro
  - docs/architecture-dna.md
  - packages/werkstatt-site/AGENTS.md
---

# Code Review: 1e4ffb3c...HEAD (RFC-0914 steps 6-11)

### Verdict: Needs revision

Дифф реализует шаги 6-11 RFC-0914: удаление anchor registry, очистка UNIVERSAL_BLOCK_PROPS, передача blockId через SectionProps. Механический пол проходит (typecheck + 1959 тестов), но есть одно структурное замечание по обработке shell-блоков и одно замечание по forward-only дисциплине.

### Mechanical floor

Pass — `build:check` обоих пакетов проходит, все 1959 тестов (615 shared + 1344 site) зелёные.

### Axis A — Structural correctness

1. **`ResolvedBlock.id` остаётся `string | null`** — `packages/werkstatt-shared/src/share/page.ts:79`. Shell-блоки создаются с `id: null` (строка 300). После RFC-0914 `BlockEntrySchema.id` стал required, но `ResolvedBlock.id` всё ещё nullable. `blocks-renderer.astro:125` использует `block.id ?? ""` — это означает, что shell-блоки получат пустой `blockId`. Это не ошибка (shell-блоки не рендерят section id), но тип `ResolvedBlock.id` следует обновить для консистентности: либо сделать его `string` (и присваивать пустую строку для shell), либо оставить `string | null` с ясным комментарием. Найдинг: обновить JSDoc-комментарий `ResolvedBlock.id` чтобы отразить RFC-0914 (block id теперь mandatory для content-блоков, null только для shell).

### Axis B — DNA alignment

No issues. DNA-24 обновлён в `docs/architecture-dna.md:107` с ссылкой на RFC-0914. DNA-82 (command output standard) соблюдён — `block.id.generate` возвращает `KernelCommandResult` с `exitCode`, `summary` с префиксом, `nextSteps` на failure.

### Axis C — Ecosystem fit

No issues. Пакетные границы соблюдены (`werkstatt-shared` не импортирует из `werkstatt-site`). `AGENTS.md` обновлен с описанием новых команд. Pipeline placement корректен — `page.blocks.extract.validate` добавлен в `SITES_CHECK_AUTHOR_PIPELINE` после `page.block.validate`.

### Axis D — Forward-only compliance

1. **`resolveSectionAnchor` сохраняет `defaultAnchorId` fallback** — `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts:41`. Функция возвращает `defaultAnchorId ?? ""` если `blockId` не задан. Это технически legacy-совместимость: все content-блоки теперь имеют mandatory `id`, поэтому `blockId` всегда должен быть непустым. Однако shell-блоки всё ещё получают `id: null` → `blockId: ""`, и `defaultAnchorId` используется как fallback для них. Это обоснованное исключение (shell-блоки не имеют content-entry id), но стоит задокументировать, что fallback существует только для shell-слоя. Найдинг: добавить комментарий, уточняющий, что `defaultAnchorId` fallback предназначен только для shell-блоков.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` и `CHANGE_SUMMARY` обновлены в `anchors.ts`. Комментарии в `content-links.ts` и `content-links.test.ts` ссылаются на RFC-0914. Имена функций и переменных ясны.

### Axis F — Pragmatism

No issues. Изменения минимальны — удалён код (anchor registry, resolveAnchorFragment, resolveAnchor), добавлена одна строка (`blockId={block.id ?? ""}` в renderer). Никаких новых абстракций или зависимостей.

### Axis G — Blind spots

1. **Миграция существующего контента** — критерий "Existing site content migrated" отмечен как `[x]` с evidence "pending site mission — command available for migration". Это неточно: критерий требует, чтобы `block.id.generate` был запущен на всех сайтах и валидаторы проходили с нулём нарушений. Если миграция ещё не выполнена, критерий должен быть `[ ]` или `~` с пояснением. Найдинг: критерий 12 ("Existing site content migrated") не подтверждён фактической миграцией — либо выполнить миграцию, либо отметить как partial.

### Spec compliance

| Requirement from RFC-0914 | Status | Evidence |
| --- | --- | --- |
| Step 6: Remove anchor registry | Done | anchors.ts:40, registry.ts:28, content-links.ts:124 |
| Step 7: Remove anchorId from UNIVERSAL_BLOCK_PROPS | Done | page-block.ts:52 |
| Step 8: Pass block.id as blockId prop | Done | blocks-renderer.astro:125, page.ts:125 |
| Step 9: Codegen templates have ids | Done | datenschutz.page.template.md:17 |
| Step 10: Unit tests updated | Done | content-links.test.ts:49 |
| Step 11: Documentation sync | Done | architecture-dna.md:107, AGENTS.md:77 |
| Acceptance criterion: existing content migrated | Partial | Command exists but not yet run on sites |

### Questions for the author

1. Shell-блоки получают `blockId: ""` — это намеренно? Если да, стоит ли обновить тип `ResolvedBlock.id` или добавить комментарий?
2. Критерий миграции существующего контента отмечен как выполненный, но миграция не запущена — это будет отдельная миссия?
3. `resolveSectionAnchor` всё ещё принимает `defaultAnchorId` — стоит ли удалить его, если все content-блоки теперь имеют mandatory id?
