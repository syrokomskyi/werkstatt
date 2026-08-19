---
rfcId: RFC-0882
auditId: AUDIT-RFC-0882-01
date: 2026-08-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0882

## Verdict: Needs revision

Критический пробел в дизайне: RFC предлагает `parseRecordLookup` и `isRecordLookupMismatch`, но не описывает, как существующая функция `extractVisibleTextExprs` будет распознавать Record-lookup выражения как visible text. Текущая реализация использует regex `/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/`, который не匹配ает `providerInitials[props.provider.id] ?? ...` — значит предложенное расширение не поймает паттерн-нарушение, описанный в самом RFC.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0882` вернул `status: pass`, 0 violations.

## Axis A — Structural completeness

1. **`amends` vs body text**: В body (строка 76) написано "RFC-0836 (amended)", но frontmatter `amends: []` пуст. RFC-0836 имеет статус `implemented` (terminal) — его нельзя формально amend. RFC-0882 является standalone RFC, который меняет существующую команду (`commands.changed`), а не amendment. Body text должен говорить "extended" или "related" вместо "amended".

2. **"Precomputed merged label" safe pattern не описан механизм**: Section "Safe pattern recognition", пункт 3 описывает NEW recognition: `const ariaLabel = \`${initials} — ${name}\`` followed by `aria-label={ariaLabel}` with `{initials}` → safe. Но текущий валидатор не парсит frontmatter (строки 145–153 исходника пропускают frontmatter). Механизм распознавания precomputed merged label не описан — как именно валидатор определит, что `ariaLabel` является template literal, содержащим `initials`?

3. **CLI surface отсутствует**: В RFC нет раздела CLI surface с точными командами и флагами. RFC-0836 (amended) имеет этот раздел. Команда не меняется (`a11y.label-in-name.component.validate` без флагов), но раздел должен присутствовать для полноты.

4. **TypeScript contracts отсутствуют**: RFC предлагает `RecordLookup` interface и `parseRecordLookup`/`isRecordLookupMismatch` функции, но не показывает, как они интегрируются в существующий `ComponentLabelInNameFinding` interface. Полные type signatures не приведены.

5. **Output format отсутствует**: RFC не документирует `--json` shape. Хотя формат вывода не меняется (тот же `diagnosticsResult`), раздел должен присутствовать.

## Axis B — DNA alignment

1. **`related: [RFC-0880]` декоративен**: RFC-0880 (Nachweis route slugs) не имеет архитектурной связи с RFC-0882 (aria-label detection). Оба RFC обнаружены в mission `warpgogol-com-m000077`, но они касаются разных валидаторов, разных пакетов кода, разных проблем. `related` должен содержать архитектурно связанные RFC, не просто RFC из той же mission.

2. **DNA-67 correlation корректна**: `satisfies: [DNA-67]` обоснованно — расширяет pre-build coverage для `label-content-name-mismatch` audit. Соответствует прецеденту RFC-0836.

## Axis C — Ecosystem fit

1. **Command description не обновляется**: RFC не упоминает обновление описания команды в `command-tables/08-section-framework.ts` (строка 120–122). Текущее описание говорит "aria-label expression does not reference the visible text variable" — после RFC-0882 оно должно также упоминать Record-lookup detection. Хотя это не валидируется механически, обновление необходимо для agent-facing точности.

2. **MODULE_CONTRACT не обновляется**: RFC не упоминает обновление MODULE_CONTRACT в `a11y-label-in-name-component.ts` (строки 1–21). Текущий purpose описывает только RFC-0836 — после реализации RFC-0882 purpose должен упоминать Record-lookup detection. CHANGE_SUMMARY также нуждается в новой записи.

3. **Pipeline placement корректен**: Команда уже зарегистрирована в `PACKAGES_CHECK_PIPELINE` (строка 111 `pipelines/packages-check.ts`). RFC правильно отмечает "No pipeline changes".

## Axis D — Forward-only compliance

No issues. RFC не предлагает compatibility shim или dual-path. Существующая логика проверки variable-name-reference сохраняется — Record-lookup check аддитивен.

## Axis E — Agent-facing policy

1. **Status gate корректен**: RFC имеет `status: draft` и содержит "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." — корректная формулировка.

2. **NEEDS CLARIFICATION markers**: Не найдены.

3. **Anti-fabrication**: Не применимо — RFC не требует content authoring.

## Axis F — Pragmatism

1. **Минимальная command surface**: Корректна — команда не добавляется, только расширяется существующая.

2. **Lean contracts**: `RecordLookup` interface минимален — `recordName` и `keyExpr` достаточно для проверки.

3. **Existing patterns**: RFC расширяет существующий валидатор, а не создаёт новый. Корректно.

## Axis G — Blind spots

1. **КРИТИЧЕСКИЙ ПРОБЕЛ — `extractVisibleTextExprs` не распознаёт Record-lookup**: Текущая реализация (`a11y-label-in-name-component.ts:120–132`) использует regex `/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/` для извлечения visible text expressions. Этот regex НЕ матчит `providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()` — выражение содержит `[`, `]`, `??`, `.slice()`, `.toUpperCase()`, что не входит в character class. Результат: `visibleTextExprs` будет пустым массивом, валидатор пропустит элемент (строка 174: `if (visibleTextExprs.length === 0) continue;`), и `isRecordLookupMismatch` никогда не будет вызван. **RFC не описывает, как `extractVisibleTextExprs` будет расширен для распознавания Record-lookup выражений.** Без этого расширения предложенный дизайн не сработает.

2. **Fallback expression parsing**: RFC говорит "The parser extracts the primary expression (before `??`)". Но `extractBraceExpression` извлекает всё выражение целиком (`providerLabels[props.provider.id] ?? props.provider.name`), а не только primary. RFC не описывает, как `??` fallback обрабатывается при парсинге — `parseRecordLookup` получает полное выражение с `??`, и regex `/^(\w+)\s*(?:\?\.\s*)?\[(.+)\]$/` не матчит `providerLabels[props.provider.id] ?? props.provider.name` из-за ` ?? ...` в конце.

3. **Performance**: Не указана стоимость сканирования. Текущий валидатор сканирует `packages/werkstatt-site/src/domain/ui/**/*.astro` (~47 файлов по данным RFC-0836). Добавление Record-lookup regex не увеличивает стоимость значимо. Незначительный пробел.

## Questions for the author

1. Как `extractVisibleTextExprs` будет расширена, чтобы распознавать `providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()` как visible text expression? Текущий regex `/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/` не матчит это выражение — нужен ли новый regex для Record-lookup patterns, или существующий regex будет заменён на более широкий?

2. Как `parseRecordLookup` будет обрабатывать fallback expressions? Regex `/^(\w+)\s*(?:\?\.\s*)?\[(.+)\]$/` не матчит `providerLabels[props.provider.id] ?? props.provider.name` из-за ` ?? ...` suffix. Нужно ли сначала split по `??` и брать primary expression?

3. Как валидатор распознает "precomputed merged label" safe pattern (пункт 3 в Safe pattern recognition), если он не парсит frontmatter? Текущая реализация пропускает frontmatter (строки 145–153). Нужно ли добавлять frontmatter analysis, или этот safe pattern будет реализован через другую эвристику?
