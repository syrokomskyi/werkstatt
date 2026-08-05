---
rfcId: RFC-0696
auditId: AUDIT-RFC-0696-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0696

## Verdict: Needs revision

RFC решает реальную структурную брешь — расширение scan scope с `<section>` на `<div>/<article>/<aside>` с `aria-labelledby`. Однако RFC упускает несколько критичных деталей реализации: (1) nested block double-counting — DFS-поиск `findFirstDescendantByTag` найдёт один и тот же heading-элемент из section и из вложенного div, создавая false positive; (2) не упомянуто обновление `MODULE_CONTRACT`, non-goal которого прямо противоречит решению RFC; (3) не упомянуто обновление описания диагностического правила и message text в коде.

## Mechanical validation (rfc.validate)

Pass с одним warning:

- **V-19:** `RFC-0696.amends` включает RFC-0690, но `RFC-0690.amendedBy` не включает RFC-0696. Бидирекциональная связь отсутствует. Поскольку RFC-0690 архивирован (`docs/rfcs/archive/implemented/`), `amendedBy` нужно обновить вручную во время enhance.

## Axis A — Structural completeness

- **Decision** — present tense, одно решение. OK.
- **CLI surface** — существующая команда, точный вызов. OK.
- **TypeScript contracts** — сигнатура `findBlockElementsWithAriaLabelledby` корректна. Однако RFC не упоминает судьбу экспортируемой функции `extractSectionHeadings` (строка 123 в `surface-heading-uniqueness.ts`). Если `findAllSections` заменяется на `findBlockElementsWithAriaLabelledby`, то `extractSectionHeadings` теперь сканирует не только section-элементы — имя становится misleading. RFC должен явно указать: переименовывается ли функция (breaking change для тестов) или сохраняет имя.
- **File system responsibilities** — два файла указаны. OK. Но `MODULE_CONTRACT` в `surface-heading-uniqueness.ts:14` содержит non-goal "Do not check non-section headings — only the first h2/h3 child of each section participates." Этот non-goal прямо противоречит решению RFC. RFC должен включить обновление `MODULE_CONTRACT` в file system responsibilities.
- **Output format** — "Unchanged. Same HEADING-UNIQ-01 diagnostic with the same fields." Но message text в коде (строка 233) гласит `Duplicate section heading "${headingText}" appears ${count} times`. Для non-section block violation message говорит "section heading", что misleading. RFC должен либо обновить message text, либо явно обосновать почему он остаётся без изменений.
- **Failure modes** — раздел "Nested blocks" описывает сценарий, но упускает критический случай (см. Axis G).
- **Rollout** — OK.
- **Alternatives considered** — 3 реальные альтернативы с причинами rejection. OK.
- **Risks** — false positives и performance описаны. OK.
- **Acceptance criteria** — 6 пунктов, checkable. OK.
- **Implementation notes** — явные behavioral rules. OK.

## Axis B — DNA alignment

- `satisfies: []` — пусто, допустимо для `kind: command`. OK.
- `related: [RFC-0494, RFC-0496]` — релевантные RFC для surface baking. OK.
- Конфликта с DNA invariant нет. OK.

## Axis C — Ecosystem fit

- **Package boundaries** — `@warpgogol/site-kernel-checks` — корректный пакет. OK.
- **Pipeline placement** — "surface.heading-uniqueness.validate in sites-check-postbuild pipeline. No pipeline change needed." — корректно, существующая команда расширяется. OK.
- **Command lifecycle** — `commands.changed: [surface.heading-uniqueness.validate]` — корректно. OK.
- **Diagnostic rule description** — `HEADING-UNIQ-01` в `content-surface.ts:543` описан как "Duplicate section heading text on the same surface page". После расширения scan scope на non-section blocks описание становится неточным. RFC не упоминает обновление описания правила. Нужно добавить `content-surface.ts` в file system responsibilities или явно указать что описание не меняется.

## Axis D — Forward-only compliance

- Нет compatibility shim, нет dual-path. OK.
- RFC amends RFC-0690, изменяя контракт напрямую. OK.
- Legacy code path (`findAllSections`) удаляется, не сохраняется за флагом. OK.

## Axis E — Agent-facing policy

- Нет self-authorizing language. OK.
- Implementation notes ссылаются на корректные governance rules (RFC-0224, RFC-0334). OK.
- Storage policy — не применимо. OK.

## Axis F — Pragmatism

- **Minimal command surface** — расширяет существующую команду, не создаёт новую. OK.
- **Lean contracts** — TypeScript минимальный. OK.
- **Existing patterns** — расширяет существующий `findAllSections` паттерн. OK.
- **Scope discipline** — `packagesImpacted` и `appsImpacted` корректны. OK.
- **fixHint** — текущий `fixHint` в коде (строка 236) гласит "Use distinct labels for each block in the bake function — see SURFACE_LABELS in bake-helpers.ts". Для non-section blocks не из bake functions (например, custom HTML от content author) этот fixHint misleading. RFC не рассматривает этот случай.

## Axis G — Blind spots

- **Nested block double-counting (критический):** `findFirstDescendantByTag` (строка 76) выполняет depth-first search. Если `<section>` содержит `<div aria-labelledby="x">`, и внутри div находится `<h2>Heading</h2>`, то:
  1. Section's first h2 descendant = "Heading" (найден внутри div)
  2. Div's first h2 descendant = "Heading" (тот же элемент)
  
  Heading "Heading" считается дважды — false positive HEADING-UNIQ-01. RFC описывает nested blocks в failure modes, но говорит "If they share the same text, HEADING-UNIQ-01 fires" — упуская что это тот же самый heading-элемент, а не разные элементы с одинаковым текстом. Решение: не рекурсировать в уже найденные block elements, или исключать child blocks которые являются descendants уже найденных blocks.

- **Performance** — "O(n) where n is the number of elements. Negligible impact." — корректно. OK.
- **Migration path** — "Pages that passed before may now fail" — описано, но нет конкретного плана верификации существующих сайтов. Acceptance criterion "No false positives on warpgogol-com surface pages" частично покрывает это. OK.

## Questions for the author

1. Как обрабатывать nested blocks? Если `<section>` содержит `<div aria-labelledby>`, `findFirstDescendantByTag` найдёт один и тот же heading из обоих — следует ли исключать child blocks, которые являются descendants уже найденных block elements?
2. Должна ли `extractSectionHeadings` быть переименована (например, в `extractBlockHeadings`) для отражения расширенного scan scope? Это breaking change для тестов.
3. Должно ли описание правила `HEADING-UNIQ-01` в `content-surface.ts` и message text в коде быть обновлено с "section heading" на "block heading" для точности?
