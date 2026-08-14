---
reviewId: REVIEW-CODE-2026-08-14-01
date: 2026-08-14
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 49d673aa...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/image-delivery.ts
  - packages/werkstatt-site/src/checks/tests/image-delivery.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0841-add-image-delivery-config-location-diagnostic.md
---

# Code Review: 49d673aa...HEAD (RFC-0841 implementation)

### Verdict: Needs revision

Implementation корректен и минимален. Одно замечание: RFC body и frontmatter `successSignals` содержат устаревший rule ID `IMG-DELIVERY-CONFIG-01`, не соответствующий фактической реализации `IMG-DELIVERY-CONFIG-02`.

### Mechanical floor

Fail (pre-existing) — `build:check` сообщает об ошибке типа в `pipelines/apps/axiom/factory/run/axiom-cli.ts:444` (`ViewportProfile`缺少 `isMobile`/`hasTouch`). Эта ошибка существовала до изменений RFC-0841 и не связана с ними. Измененные файлы (`image-delivery.ts`, `image-delivery.test.ts`) typecheck проходят без ошибок. 22/22 тестов `image-delivery.test.ts` проходят.

### Axis A — Structural correctness

No issues. Union type расширен корректно. Переменные `srcConfigPath` и `rootConfigPath` заменяют хардкод `configPath` — clean rename. Finding structure соответствует существующему паттерну в файле.

### Axis B — DNA alignment

No issues. DNA-72 (Validator config location diagnostics) реализован точно: warning diagnostic when config file is found in likely-but-wrong location. DNA-62 (Foundation File Integrity) расширен паттерном диагностики.

### Axis C — Ecosystem fit

No issues. `packages/werkstatt-site/AGENTS.md` обновлен — документирует `IMG-DELIVERY-CONFIG-01` (malformed config) и `IMG-DELIVERY-CONFIG-02` (location diagnostic). Pipeline placement не изменился — `image.delivery.validate` остается в `SITES_CHECK_POSTBUILD_PIPELINE`.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths. Переменная `configPath` переименована в `srcConfigPath` без legacy alias.

### Axis E — Agent-facing clarity

**Finding E-1: RFC body содержит устаревший rule ID.** RFC-0841 Design section (lines 92-106) показывает код с `IMG-DELIVERY-CONFIG-01`, но реализация использует `IMG-DELIVERY-CONFIG-02` (per grilling decision). Frontmatter `successSignals` (line 39) также содержит `IMG-DELIVERY-CONFIG-01`. Acceptance criteria (lines 166-173) содержат evidence annotations, исправляющие это, но body и frontmatter не обновлены. Future agent, читающий RFC, увидит несоответствие между Design section и фактической реализацией.

### Axis F — Pragmatism

No issues. Изменение минимально — два `existsSync` вызова, один conditional, модификация summary string. `writeRootConfig` helper mirrors existing `writeConfig` pattern. Тесты покрывают все четыре комбинации file location.

### Axis G — Blind spots

No issues. Performance: два `existsSync` вызова для `srcConfigPath` (line 245 и 413) — negligible (synchronous fs call, результат не меняется между вызовами). False positives: check fires only when config is in root but NOT in src/ — no false positives for correct setups. Edge cases: all four combinations tested.

### Spec compliance

| Requirement from RFC-0841 | Status | Evidence |
| --- | --- | --- |
| IMG-DELIVERY-CONFIG-01 warning for misplaced config | Done (as IMG-DELIVERY-CONFIG-02) | image-delivery.ts:243-256 |
| Config path in summary output | Done | image-delivery.ts:413-418 |
| Unit test: root only → warning | Done | image-delivery.test.ts:324-336 |
| Unit test: src/ only → no warning | Done | image-delivery.test.ts:338-348 |
| Unit test: both → no warning | Done | image-delivery.test.ts:350-361 |
| Unit test: neither → no warning | Done | image-delivery.test.ts:363-372 |
| DNA-72 entry in architecture-dna.md | Done | architecture-dna.md:295-297 |
| rfc.validate passes | Done | zero violations |

### Questions for the author

1. Должен ли RFC body (Design section, frontmatter `successSignals`) быть обновлен с `IMG-DELIVERY-CONFIG-01` на `IMG-DELIVERY-CONFIG-02` для соответствия фактической реализации?
