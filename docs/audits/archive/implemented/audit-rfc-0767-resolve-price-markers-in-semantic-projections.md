---
rfcId: RFC-0767
auditId: AUDIT-RFC-0767-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0767

## Verdict: Needs revision

RFC proposes resolvePriceMarkersForSemantic in packages/share, но не разрешает циклическую зависимость типов: `DerivedPriceEntry` определён в `packages/ui`, а `packages/share` не может импортировать из `packages/ui` (ui → share, не наоборот). Также `packagesImpacted` содержит `@warpgogol/ui` без описания изменений в нём.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0767 --json` вернул 0 violations.

## Axis A — Structural completeness

- **`formatSourcePrice` не определена.** RFC упоминает `formatSourcePrice` (строка 119) как функцию, форматирующую сумму в EUR-строку, но не указывает: это новая функция или существующая? Где она живёт? Чем отличается от `formatPrice` из `packages/ui/src/sections/price-card/price-variants.ts`, которая добавляет суффикс рекурренции? Существующая `formatPrice` использует `currencyDisplay: "narrowSymbol"` и `formatRecurrence` — semantic layer, скорее всего, не хочет суффикс рекурренции. RFC должен пояснить, почему нужна отдельная функция и где она находится.

## Axis B — DNA alignment

- **DNA-16 привязан натянуто.** DNA-16 («Semantic layer shares topology with navigation») требует, чтобы семантические выходы (JSON-LD, sitemaps, breadcrumbs) строились на той же топологии маршрутов и состоянии видимости, что и навигация. RFC-0767 резолвит price markers в строковых полях — это не имеет отношения к топологии маршрутов или видимости. Соответствие DNA-4 (canonical content) обосновано — markers резолвятся из `derived-prices.generated.json`, производного от PBP-сущностей. Рекомендация: убрать DNA-16 из `satisfies[]` или уточнить обоснование.

## Axis C — Ecosystem fit

- **Циклическая зависимость типов.** RFC предлагает разместить `resolvePriceMarkersForSemantic` в `packages/share/src/semantic/price-marker-resolver.ts`. TypeScript-контракт (строка 170) использует `Record<string, DerivedPriceEntry[]>`. Тип `DerivedPriceEntry` определён в `packages/ui/src/sections/price-card/price-variants.ts:19-27`. Импорт `packages/share → packages/ui` создаёт цикл (`packages/ui` зависит от `packages/share`). RFC говорит «No cross-package import needed» (строка 220), но не адресует зависимость типов. Варианты: (a) перенести `DerivedPriceEntry` в `packages/share`, (b) определить локальный тип-совместимый интерфейс в `packages/share`, (c) передавать `derivedPrices` как `unknown`/`Record<string, unknown[]>`. RFC должен выбрать вариант и описать его.

- **`packagesImpacted` не соответствует дизайну.** `packagesImpacted` содержит `@warpgogol/ui` (строка 36), но раздел Design описывает изменения только в `packages/share`. Если `@warpgogol/ui` listed потому что `DerivedPriceEntry` или `loadDerivedPrices` нужно перенести — это должно быть явно. Если изменений в `packages/ui` нет — убрать из списка.

- **Дублирование констант.** `OFFERING_URI_PREFIX` (`"https://warpgogol.com/id/offerings/"`) и `PRICE_MARKER_RE` (`/\{price:([a-zA-Z0-9_-]+):([a-zA-Z0-9_.-]+)\}/g`) уже определены в `packages/ui/src/utils/price-marker.ts:14-15`. RFC не указывает, будут ли они дублированы в `packages/share` или импортированы. Импорт невозможен (цикл), дублирование нарушает DRY. Рекомендация: перенести константы и тип в `packages/share` и реэкспортировать из `packages/ui`.

## Axis D — Forward-only compliance

- **«Backward compatible» language.** Строка 203: «Backward compatible: The resolution function is additive. No existing API changes.» Экосистема forward-only не использует понятие «backward compatible». Функция аддитивная — это нормально, но формулировка «backward compatible» вводит в заблуждение. Рекомендация: заменить на «Additive: resolves markers in existing string fields without changing the SemanticPageModel structure».

## Axis E — Agent-facing policy

No issues. Status gate корректный — «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)». Implementation notes явные и поведенческие. Storage policy не затронут. NEEDS CLARIFICATION markers отсутствуют.

## Axis F — Pragmatism

- **`formatSourcePrice` vs `formatPrice`.** Существующая `formatPrice` в `packages/ui` уже форматирует цену через `Intl.NumberFormat`. RFC предлагает новую `formatSourcePrice`, но не объясняет, почему нельзя переиспользовать `formatPrice` (или её часть). Если отличие — отсутствие суффикса рекурренции, это нужно явно указать и либо параметризовать `formatPrice`, либо извлечь общую логику.

- **`packagesImpacted` включает `@warpgogol/ui` без обоснования.** См. Axis C.

## Axis G — Blind spots

- **I/O на каждый вызов.** RFC не адресует кэширование `derived-prices.generated.json`. Существующая `loadDerivedPrices` в `packages/ui` читает файл синхронно через `readFileSync` при каждом вызове. Если `resolvePriceMarkersForSemantic` делает то же на каждой странице, это повторный I/O при каждом build. Рекомендация: загрузить файл один раз на уровне `buildSemanticPageModelWith` и передать как параметр, либо использовать мемоизацию.

- **Malformed JSON.** Существующая `loadDerivedPrices` бросает исключение на невалидном JSON (`JSON.parse` throws). RFC говорит «Missing derived prices file: loadDerivedPrices() returns null. Markers resolve to "0 €". No crash.» (строка 194), но не рассматривает случай, когда файл существует, но содержит невалидный JSON. Должен ли semantic layer ловить исключение и резолвить в `"0 €"`, или пробросить его? RFC должен указать поведение.

- **Block-derived content.** `extractContentBlocks` (build-page.ts:124-150) извлекает текст из block props в `SemanticBlock[]` (heading, lead, items, body). Если block props содержат `{price:...}` markers (например, card title с маркером), они попадают в `SemanticBlock.items[].title` и потенциально в JSON-LD. RFC резолвит только top-level `heading`, `lead`, `description` — но не block-derived content. NonGoals (строка 45) исключают только prose body, а не block-derived content. RFC должен либо явно исключить block-derived content из scope, либо добавить его в resolution.

- **Non-breaking space в output.** `Intl.NumberFormat` с `style: "currency"` produces U+00A0 (non-breaking space), не regular space. RFC показывает `"70 €"` (строки 88, 187, 226), но фактический output будет `"70\u00A0€"`. Acceptance criteria и tests должны использовать `\u00A0`.

## Questions for the author

1. Где будет определён тип `DerivedPriceEntry` — останется в `packages/ui` (создавая цикл), будет перенесён в `packages/share`, или будет определён локально в `price-marker-resolver.ts`?
2. Будут ли `OFFERING_URI_PREFIX` и `PRICE_MARKER_RE` дублированы в `packages/share`, или перенесены и реэкспортированы из `packages/ui`?
3. Должен ли `resolvePriceMarkersForSemantic` ловить исключение от `loadDerivedPrices` на malformed JSON, или пробросить его?
