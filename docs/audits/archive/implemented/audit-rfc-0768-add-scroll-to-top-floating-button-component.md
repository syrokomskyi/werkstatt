---
rfcId: RFC-0768
auditId: AUDIT-RFC-0768-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0768

## Verdict: Needs revision

RFC корректно спроектирован архитектурно: расширяет закрытый enum `ComponentRole` (DNA-19), использует свободное имя `Daphnis` из `MoonCatalog` (DNA-23), соблюдает Mirror Quintet (DNA-17) и `--ds-*` токены (DNA-10). Однако есть несколько мелких находок: отсутствует `packages/ui/AGENTS.md` в файловых обязанностях (при том что risks упоминают его), `@warpgogol/share`列入 `packagesImpacted` без пояснений, и V-30 warning не разъяснён в теле RFC.

## Mechanical validation (rfc.validate)

**Pass** — 1 warning (V-30): `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not true. Это false positive: RFC модифицирует `packages/ontology/src/enums.ts` (добавление значения в закрытый enum), а не `packages/ontology/src/external-surfaces/`. `breaksC` корректно отсутствует — RFC не затрагивает Layer C (URL schema, JSON-LD types, sitemap shape).

## Axis A — Structural completeness

1. **File system responsibilities неполны**: Risks (строка 253) предписывают документировать z-index в `packages/ui/AGENTS.md`, но таблица файловых обязанностей (строки 212–222) не содержит этой записи. AGENTS.md — это не исходный код, но это обязательная поверхность документации, и изменение должно быть объявлено явно.

2. **V-30 warning не разъяснён**: RFC не содержит пояснения о том, что warning V-30 является false positive. При реализации агент может ошибочно добавить `breaksC: true`, что приведёт к требованию обновить `packages/ontology/src/external-surfaces/` (RFC-0480). В design-секции или в implementation notes стоит добавить примечание: RFC модифицирует `enums.ts`, не `external-surfaces/`, поэтому `breaksC` не требуется.

## Axis B — DNA alignment

No issues.

- **DNA-19** (Closed ontology vocabularies): RFC расширяет `ComponentRoleValues` новым значением `scroll-to-top` через superseding architecture RFC — корректно соответствует требованию о superseding RFC для закрытых enum-ов.
- **DNA-17** (Mirror Quintet): Компонент поставляет все 5 файлов: `.astro`, `.css`, `.client.ts`, `.manifest.yaml`, `.types.generated.ts`.
- **DNA-23** (Cosmic overlay): `Daphnis` присутствует в `MoonCatalog` (`packages/ontology/src/cosmic/moon-catalog.ts:141`) и не входит в список passport-reserved (Methone, Bianca, Klarissa, Adrastea, Despina). Three-way alignment объявлен: manifest → archetype registry → layout integration.
- **DNA-10** (No hardcoded design tokens): CSS использует только `--ds-*` токены (`--ds-color-primary`, `--ds-color-text-inverse`, `--ds-color-secondary`, `--ds-radius-md`, `--ds-space-4`).

## Axis C — Ecosystem fit

1. **`@warpgogol/share` в packagesImpacted без файловых обязанностей**: RFC перечисляет `@warpgogol/share` в `packagesImpacted` (строка 52), но таблица файловых обязанностей (строки 212–222) не содержит ни одного файла из `packages/share/`. `MOON_IMPORT_PATHS` в `packages/share/src/page.ts:178` — это `...registryMoonImportPaths`, производное от generated `archetypes/index.yaml`. После `archetype.registry.build` generated index обновится, и `@warpgogol/share` будет пересобран. RFC следует пояснить, что share impacted через generated index, а не через ручные изменения.

2. **Three-way alignment для не-shell компонента**: RFC упоминает "Three-way alignment: manifest, `MOON_IMPORT_PATHS` (registry-derived via `archetype.registry.build`), and layout integration" (строка 110). Однако компонент импортируется напрямую в `layout-component.astro` через `import ScrollToTop from "@warpgogol/ui/components/scroll-to-top"` (строка 181), а не разрешается через `buildPage` / `MOON_IMPORT_PATHS`. Регистрация в archetype index нужна для `manifest.contract.validate`, но `MOON_IMPORT_PATHS` не является путём разрешения для этого компонента. Стоит уточнить формулировку.

## Axis D — Forward-only compliance

No issues. RFC — чистое добавление нового компонента и нового значения enum. Нет backward compatibility layers, нет dual paths, нет deprecation grace periods.

## Axis E — Agent-facing policy

No issues.

- **Status gate**: RFC явно требует `status: accepted` для реализации (строка 271).
- **Implementation notes**: Поведенческие правила explicit — agents MUST NOT добавлять per-site configuration, MUST NOT добавлять content-layer labels, MUST использовать существующий LordIcon asset, MUST следовать паттерну header-component.astro.
- **Anti-fabrication**: Нет content authoring в acceptance criteria — только code changes.
- **Storage policy**: Нет cookies, нет server-side persistence. Только client-side scroll listener.
- **NEEDS CLARIFICATION markers**: Не найдены.

## Axis F — Pragmatism

1. **Scope discipline — `@warpgogol/share`**: Перечисление `@warpgogol/share` в `packagesImpacted` технически корректно (generated index влияет на build), но не сопровождается пояснением. Это не блокер, но улучшит clarity.

В остальном — компонент минимальный, focused, без over-engineering. Один optional prop `ariaLabel` с i18n fallback. Нет speculative generality.

## Axis G — Blind spots

No issues.

- **Performance**: `requestAnimationFrame` throttling и `{ passive: true }` на scroll listener (строка 249). Соответствует паттерну header scroll handler.
- **Z-index conflicts**: `z-index: 100` документирован, ниже header (`z-index: 200`). Mitigation описан.
- **Edge cases**: Short pages (< 100vh — кнопка не появляется), print mode (`@media print`), `prefers-reduced-motion` — все рассмотрены.
- **Lenis alignment**: `packages/share/src/scripts/lenis.ts` non-goals явно упоминают "Do not manage app-specific UI states (e.g. scroll-to-top button visibility)" — RFC уважает эту границу (nonGoals: "No changes to the Lenis smooth-scroll module").
- **Security/privacy**: Нет user data, нет PII, нет external services.

## Questions for the author

1. Почему `@warpgogol/share` перечислен в `packagesImpacted`, но не имеет ни одной записи в file system responsibilities? Если impact только через generated archetype index, стоит ли это явно пояснить?
2. Three-way alignment упоминает `MOON_IMPORT_PATHS`, но компонент импортируется напрямую в layout, а не через `buildPage`. Нужно ли регистрировать компонент в `MOON_IMPORT_PATHS` вообще, или достаточно регистрации в archetype index для `manifest.contract.validate`?
3. Risks (строка 253) предписывают документировать z-index в `packages/ui/AGENTS.md`. Должна ли эта запись быть в file system responsibilities, чтобы агент не пропустил её при реализации?
