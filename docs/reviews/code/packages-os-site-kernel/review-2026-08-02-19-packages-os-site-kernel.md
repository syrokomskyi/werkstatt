---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 9ddd9ea3...HEAD
filesReviewed:
  - packages/os/site-kernel/src/tests/generated-marker.pbt.test.ts
  - packages/share/src/tests/text-normalize.pbt.test.ts
  - docs/adrs/adr-0019-require-property-based-tests-for-html-and-css-mutator-functions.md
---

# Code Review: 9ddd9ea3...HEAD (ADR-0019 implementation)

## Verdict: Needs revision

Два minor findings в Axis A — дублированный код и избыточная `.chain()` в arbitrary. Оба не влияют на корректность тестов, но требуют исправления по стандартам fo-review.

## Mechanical floor

Pass — `build:check` и `test` для `@warpgogol/site-kernel` и `@warpgogol/share` проходят без ошибок. `adr.validate --id ADR-0019` — 0 errors.

## Axis A — Structural correctness

### Finding A1: Duplicated Code — `STRUCTURAL_TAGS` и `countTagOccurrences`

`STRUCTURAL_TAGS` (10 тегов) и `countTagOccurrences` функция дублируются между `generated-marker.pbt.test.ts` (site-kernel) и `text-normalize.pbt.test.ts` (share). Пакеты разделены, общего test-utility пакета нет — создание нового пакета для этого было бы over-engineering. Однако дублирование можно устранить, вынеся хелперы в локальный `test-helpers.ts` файл внутри каждого пакета (или просто принять как acceptable duplication между пакетами).

### Finding A2: Избыточная `.chain()` в `htmlWithMarkerComment`

`@/packages/os/site-kernel/src/tests/generated-marker.pbt.test.ts:77-87`

`htmlWithMarkerComment` использует `.chain()` с первым массивом `segments` (0-5 элементов), который затем объединяется с `before` (0-3 элементов) — оба массива генерируют HTML-сегменты до заголовка. `.chain()` добавляет сложность без ценности: тот же distribution достигается одним `fc.tuple` с `fc.array(htmlSegment, { minLength: 0, maxLength: 8 })`.

## Axis B — DNA alignment

No issues. DNA-41 (PBT for pure functions) — тесты используют `fast-check`, живут в `*.pbt.test.ts`, проверяют 4 алгебраических свойства. DNA-42 (Compass markup) — оба файла содержат `MODULE_CONTRACT` и `CHANGE_SUMMARY`.

## Axis C — Ecosystem fit

No issues. Пакетные границы соблюдены — тесты импортируют только из своего пакета. Compass scaffolding обновлён в `text-normalize.pbt.test.ts` (purpose, keywords, responsibilities, CHANGE_SUMMARY расширены ADR-0019).

## Axis D — Forward-only compliance

No issues. Существующий `text-normalize.pbt.test.ts` расширен in-place, без дублирования или legacy path. Новый файл `generated-marker.pbt.test.ts` — чистое добавление.

## Axis E — Agent-facing clarity

No issues. MODULE_CONTRACT и CHANGE_SUMMARY присутствуют в обоих файлах. Переменные и функции имеют понятные имена. ADR-0019 указана в keywords и CHANGE_SUMMARY.

## Axis F — Pragmatism

No issues. Тесты следуют существующему паттерну `text-normalize.pbt.test.ts`. Scope discipline — изменены только тестовые файлы. Arbitraries ограничены (maxLength: 50, 5-8 сегментов) — быстро выполняются.

## Axis G — Blind spots

No issues. `textSegment` arbitrary фильтрует `<`, `>`, `<!--`, `-->`, `GENERATED_MARKER` — предотвращает генерацию невалидного HTML. PBT тесты запускают 100 итераций по умолчанию — приемлемо для CI.

## Spec compliance

| Requirement from ADR-0019 | Status | Evidence |
| --- | --- | --- |
| Tag balance preservation | Done | `generated-marker.pbt.test.ts:110-121`, `text-normalize.pbt.test.ts:93-104` |
| Comment isolation | Done | `generated-marker.pbt.test.ts:127-161`, `text-normalize.pbt.test.ts:106-115` |
| Idempotency | Done | `generated-marker.pbt.test.ts:167-192`, `text-normalize.pbt.test.ts:37-44` (pre-existing) |
| No content creation | Done | `generated-marker.pbt.test.ts:198-221`, `text-normalize.pbt.test.ts:117-136` |
| Applies to stripGeneratedMarker | Done | New file `generated-marker.pbt.test.ts` |
| Applies to normalizeHtml | Done | Extended `text-normalize.pbt.test.ts` |
| PBT files are `*.pbt.test.ts` | Done | Both files match pattern |
| Uses fast-check | Done | Both files import `fc` |

## Questions for the author

1. Можно ли устранить дублирование `STRUCTURAL_TAGS` / `countTagOccurrences` между пакетами, или это acceptable duplication учитывая пакетные границы?
2. Можно ли упростить `htmlWithMarkerComment`, заменив `.chain()` на `fc.tuple` с одним массивом `before` (maxLength: 8)?
