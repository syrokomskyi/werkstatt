---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD~1...HEAD
filesReviewed:
  - packages/ontology/archetypes/sections/service-metadata-block.yaml
  - packages/ontology/archetypes/index.yaml
  - packages/ontology/archetypes/index.json
  - packages/ui/src/sections/service-metadata-block/service-metadata-block-section.astro
  - packages/ui/src/sections/service-metadata-block/service-metadata-block-section.manifest.yaml
  - packages/ui/src/sections/service-metadata-block/service-metadata-block-section.css
  - packages/ui/src/sections/service-metadata-block/service-metadata-block-section.story.md
  - packages/ui/src/sections/service-metadata-block/service-metadata-block-section.types.generated.ts
---

# Code Review: HEAD~1...HEAD (RFC-0759 service-metadata-block)

### Verdict: Needs revision

Дифф добавляет новый архетип `service-metadata-block` по RFC-0759. Структура следует стандартному паттерну (dynamic-status-block, RFC-0758). Все валидаторы проходят. Одно замечание: хардкод английских меток в `.astro` без i18n.

### Mechanical floor

Pass — `@warpgogol/ontology` `build:check` и `@warpgogol/ui` `build:check` проходят без ошибок. `rfc.validate --id RFC-0759` проходит. `manifest.contract.validate`, `mirror.quintet.validate`, `section.contract.validate`, `section.placeholder.lint`, `page.block.validate` — все проходят с нулём нарушений.

### Axis A — Structural correctness

No issues. Шаблон следует паттерну `dynamic-status-block`: `SectionShell` + `SectionHeader` + bespoke body. Типизация через `cast<ServiceMetadataBlockSectionContent>(pageOverride)`. CSS использует только `--ds-*` токены. Манифест содержит `propsSchema` с `additionalProperties: false` и `required: [header]`. Архетип YAML содержит `propsSchema` с Zod-формой и `.strict()`.

### Axis B — DNA alignment

No issues.

- DNA-5 (Mirror Quintet): `.astro` + `.manifest.yaml` + `.types.generated.ts` + `.css` + `.story.md` — все файлы присутствуют.
- DNA-6 (kebab-case): все имена файлов в kebab-case.
- DNA-10 (no hardcoded tokens): CSS использует только `--ds-*`.
- DNA-17 (Uni manifest contract): манифест содержит все обязательные поля.
- DNA-23 (cosmic naming): `Sedna` — валидное имя из `PlanetCatalog`, трёхстороннее выравнивание поддержано (манифест → `index.yaml` → `PLANET_IMPORT_PATHS`).

### Axis C — Ecosystem fit

No issues.

- Границы пакетов: `ontology` → `ui`, корректный поток.
- `archetype.registry.build` выполнен — `index.yaml` и `index.json` регенерированы.
- `section.scaffold` использован (не ручное копирование).
- `props.types.generate` выполнен — `.types.generated.ts` сгенерирован.
- AGENTS.md не требует обновления (стандартное добавление архетипа, без новых правил).

### Axis D — Forward-only compliance

No issues. Чистое добавление, без удаления, без совместимых слоёв, без legacy-путей.

### Axis E — Agent-facing clarity

**Finding E-1: Хардкод английских меток без i18n.**

`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ui/src/sections/service-metadata-block/service-metadata-block-section.astro:54-68`

Шаблон хардкодит структурные метки на английском:

```astro
<dt class="service-metadata-block__meta-label">Version</dt>
<dt class="service-metadata-block__meta-label">Effective date</dt>
<dt class="service-metadata-block__meta-label">Next review</dt>
```

Также `aria-label="Related documents"` на `<nav>` (строка 73) — на английском.

Секция shared — используется на сайтах с разными языками (de, uk). Метки пользовательски видимые. Платформа передаёт `lang` проп через `SectionProps`, но он не используется для локализации меток.

Варианты исправления:

1. Локализация через `lang` проп (lookup-таблица `de`/`uk` меток)
2. Опциональные пропсы для меток (`versionLabel?`, `effectiveDateLabel?`, `nextReviewDateLabel?`)
3. Убрать метки совсем (рендерить только значения)

### Axis F — Pragmatism

No issues. Минимальное изменение: один архетип YAML + scaffolded section files. Следует существующему паттерну (dynamic-status-block). Нет новых зависимостей, нет scope creep.

### Axis G — Blind spots

No issues.

- Edge case "all fields absent" обрабатывается: условные рендеры `{props.version && ...}` — если все поля отсутствуют, секция рендерит пустой muted блок (как указано в RFC Failure modes).
- Edge case "links absent or empty" обрабатляется: `{props.links && props.links.length > 0 && ...}`.
- Нет performance-концернов (статический SSG).
- Нет security/privacy-концернов.

### Spec compliance

| Requirement from RFC-0759 | Status | Evidence |
| --- | --- | --- |
| Archetype YAML with propsSchema (version?, effectiveDate?, nextReviewDate?, links?, footnote?) | Done | `packages/ontology/archetypes/sections/service-metadata-block.yaml` |
| description field | Done | `service-metadata-block.yaml:5-6` |
| semanticRole: page-metadata-footer | Done | `service-metadata-block.yaml:4` |
| bodyKind: composite | Done | `service-metadata-block.yaml:15` |
| acceptedCosmicNames | Done | `service-metadata-block.yaml:33` (Sedna) |
| archetype.registry.build run | Done | `index.yaml` contains entry at line 436 |
| Section files via section.scaffold | Done | 5 files in `packages/ui/src/sections/service-metadata-block/` |
| props.types.generate run | Done | `.types.generated.ts` exists with all custom fields |
| section.contract.validate passes | Done | validator output: zero violations |
| page.block.validate accepts type | Done | validator output: zero violations |
| AGENTS.md updated if needed | Done | No update needed (standard archetype addition) |
| rfc.validate passes | Done | validator output: All 1 RFC(s) passed |

### Questions for the author

1. Метки `Version`, `Effective date`, `Next review` хардкодены на английском. Какой подход к i18n предпочтителен: локализация через `lang` проп, опциональные пропсы для меток, или убирать метки совсем?
2. `aria-label="Related documents"` на `<nav>` тоже на английском — тот же вопрос о локализации.
