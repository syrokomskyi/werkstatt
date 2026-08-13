---
rfcId: RFC-0833
auditId: AUDIT-RFC-0833-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0833

## Verdict: Needs revision

RFC корректно расширяет существующие команды `lighthouse.validate` и `lighthouse.budget.check` тремя новыми правилами (LH-11..13) и устанавливает DNA-67. Однако `satisfies[]` не включает DNA-67, связь с DNA-58 слабая, а эвристика LH-12 для unused-JS недоспецифицирована.

## Mechanical validation (rfc.validate)

**Pass** (1 warning, non-blocking):

- **V-19** (warning): `amends` включает RFC-0006, но `amendedBy` в RFC-0006 не включает RFC-0833. Ожидаемо для draft — будет исправлено при enhance.

## Axis A — Structural completeness

No issues. Все секции заполнены осмысленным контентом:

- **Decision** — единое решение в настоящем времени.
- **CLI surface** — точные команды с флагами.
- **TypeScript contracts** — минимальные типы.
- **File system responsibilities** — конкретные пути.
- **Output format** — JSON-shape задокументирован.
- **Failure modes** — exit codes и warn-vs-fail.
- **Rollout** — defaults, migration path, grace periods.
- **Alternatives considered** — 4 реальные альтернативы.
- **Risks** — false-positive rate указан для каждого правила.
- **Acceptance criteria** — проверяемые.
- **Implementation notes** — явные поведенческие правила.

## Axis B — DNA alignment

**Finding B1 — DNA-67 отсутствует в `satisfies[]`.** RFC устанавливает новую инварианту DNA-67 (строки 280–304), но `satisfies[]` содержит только `DNA-15`. Перечисление `satisfies[]` должно включать все DNA-инварианты, которые RFC удовлетворяет или устанавливает — включая новые. Добавь `DNA-67` в `satisfies[]`.

**Finding B2 — Связь с DNA-58 слабая.** `related[]` включает `DNA-58` (Generated-file content determinism). RFC утверждает (строка 109): "LH-11 and LH-12 validate post-build artifacts deterministically." Но DNA-58 (строки 247–249 в `docs/architecture-dna.md`) — это про байт-идентичность генераторного вывода, не про валидацию post-build CSS/JS. LH-11/LH-12 проверяют свойства build-артефактов, а не детерминизм генерации. Связь тангенциальна — убери DNA-58 из `related[]` или уточни, чем именно LH-11/LH-12 усиливают DNA-58.

## Axis C — Ecosystem fit

No issues. Pipeline placement проверен:

- `lighthouse.validate` — в `SITES_CHECK_AUTHOR_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts:350`). LH-13 (pre-build, source scanning) — корректно.
- `lighthouse.budget.check` — в `SITES_CHECK_POSTBUILD_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:49`). LH-11/LH-12 (post-build, dist scanning) — корректно.

`commands.changed` правильно перечисляет существующие команды. `packagesImpacted: [werkstatt-site]` — соответствует фактическому пути `packages/werkstatt-site/src/checks/lighthouse.ts`.

## Axis D — Forward-only compliance

No issues. Grace periods (1 неделя для LH-11, 2 недели для LH-12) — это graduated severity для новых валидаторов, не backward-compat shim. Старое поведение не сохраняется параллельно. Legacy paths удаляются.

## Axis E — Agent-facing policy

No issues. Нет self-authorizing language. Implementation notes ссылаются на RFC-0224, `rfc.verification.emit`, `rfc.supersede.propose`. Нет NEEDS CLARIFICATION markers. Storage policy не затрагивается.

## Axis F — Pragmatism

**Finding F1 — LH-12 "simplified approach" недоспецифицирован.** RFC описывает две альтернативы (строки 144–151): AST-based и "simplified" (без AST). Simplified approach говорит: "check if it's imported by any HTML page" и "if a bundle is imported but its exports are not called (heuristic: no matching function call patterns in inline scripts)". Но:

- Как именно определяются "exports" без AST? Regex по `export` statements?
- Что такое "function call patterns"? Какие конкретно паттерны ищутся?
- Как `unusedBytes` и `totalBytes` вычисляются без AST? Размер файла минус размер использованных экспортов? Как оценить размер отдельного экспорта без парсинга?

Нужно указать конкретный алгоритм или принять, что LH-12 будет реализован только после AST-based подхода (отложенный RFC).

## Axis G — Blind spots

**Finding G1 — LH-12 dynamic routes blind spot.** RFC признаёт (строка 337): "The unused JS heuristic may flag bundles that are used by dynamically loaded routes not in the initial HTML." Mitigation: "scanning all HTML files in dist/client/, not just the index." Но Astro static sites генерируют HTML для каждого маршрута — если маршрут существует, его HTML существует в `dist/client/`. Проблема возникает только для genuinely client-side dynamic routes (SPA fallback), которые в static-first Astro встречаются редко. RFC должен явно указать: LH-12 применяется только к static-generated HTML pages; SPA-only routes exempted.

**Finding G2 — LH-11 `findAstroConfig` расширение не задокументировано.** Существующая `findAstroConfig` в `lighthouse.ts:56-74` извлекает только `output`. LH-11 требует чтения `build.inlineStylesheets`. RFC не упоминает, что эту функцию нужно расширить. Добавь в File system responsibilities или Implementation notes.

## Questions for the author

1. Почему `DNA-67` не в `satisfies[]`? Если RFC устанавливает DNA-67, он должен быть перечислен.
2. Как конкретно будет работать LH-12 без AST? Какие "function call patterns" ищутся и как оценивается `unusedBytes` без парсинга экспортов?
3. Чем именно LH-11/LH-12 усиливают DNA-58? DNA-58 — про детерминизм генерации, а LH-11/LH-12 — про свойства build-артефактов.
