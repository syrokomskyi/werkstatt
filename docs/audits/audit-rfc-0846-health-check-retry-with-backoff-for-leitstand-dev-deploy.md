---
rfcId: RFC-0846
auditId: AUDIT-RFC-0846-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0846

## Verdict: Needs revision

RFC-0846 не проходит механическую валидацию (V-24 error: `satisfies: []` для architecture RFC). Семантически RFC корректен — он расширяет паттерн из RFC-0747 на `leitstand.dev-deploy`, но имеет небольшой слепой участок: не указана политика обработки исключений `adapter.health()`.

## Mechanical validation (rfc.validate)

Fail — 2 violations:

- **V-24 (error):** architecture RFC created 2026-08-14 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` — пусто.
- **V-19 (warning):** `amends` includes RFC-0747, but RFC-0747.amendedBy does not include RFC-0846. Ожидаемо — `amendedBy` будет обновлён при реализации.

## Axis A — Structural completeness

- **Missing CLI surface section:** RFC не показывает точные CLI-инвокации с флагами (например, `pnpm exec werkstatt run leitstand.dev-deploy --system <id> --release <id> --json`). Раздел Design содержит код, но не CLI-контракт.
- **Missing Output format section:** RFC не документирует `--json` shape вывода `leitstand.dev-deploy` после изменений (поля summary, данные о попытках health check).
- **Missing Failure modes section:** Нет явного раздела с exit codes и warn-vs-fail поведением. Информация разбросана по Design и Risks, но не структурирована.

## Axis B — DNA alignment

- **Blocking: `satisfies: []` (V-24).** Architecture RFC должен объявить хотя бы один DNA-инвариант. Наиболее релевантный — **DNA-49** (Fleet propagation / Leitstand), который описывает Leitstand deployment pipeline включая health checks. RFC расширяет retry-паттерн в рамках этого pipeline. Тело RFC должно объяснить, как оно усиливает DNA-49 — а именно, что health check retry обеспечивает надёжность dev-deploy pipeline против CDN propagation delays, аналогично RFC-0747 для alt health check.
- RFC-0747 (amended) имеет `satisfies: []`, но это `kind: command` — для command RFC `satisfies` не требуется. RFC-0846 — `kind: architecture`, поэтому требование обязательно.

## Axis C — Ecosystem fit

- **Package boundaries:** `packagesImpacted: ["@warpgogol/werkstatt"]` — корректно. Код в `packages/werkstatt/src/leitstand/leitstand-commands.ts`.
- **Command lifecycle:** `commands.changed: [leitstand.dev-deploy]` — корректно, это существующая команда.
- **Test file:** RFC указывает `packages/werkstatt/src/tests-handoff/leitstand-0628-dev-deploy.test.ts` — файл существует, тесты для `leitstand.dev-deploy` уже там. Добавление retry-тестов в этот файл — корректный подход.
- **Constants placement:** RFC предлагает два подхода (отдельные `DEV_HEALTH_*` или общие `HEALTH_CHECK_*`), но не указывает точное размещение общих констант. Текущие `ALT_HEALTH_*` константы — на строке 346-347 `leitstand-commands.ts`. При выборе общих констант нужно указать, заменяются ли `ALT_HEALTH_*` на `HEALTH_CHECK_*` или добавляются параллельно.

## Axis D — Forward-only compliance

No issues. RFC напрямую модифицирует существующий health check вызов — нет shims, dual-paths, или backward compat layers.

## Axis E — Agent-facing policy

- **Status gate:** Корректно — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes:** Ссылаются на RFC-0224 (accepted→implemented) и `rfc.supersede.propose` для invariant conflicts. Корректно.
- **NEEDS CLARIFICATION markers:** Не найдены.

## Axis F — Pragmatism

- **Existing patterns:** RFC явно переиспользует паттерн из RFC-0747 (alt health check retry). Хороший подход — avoids divergence.
- **Scope discipline:** `packagesImpacted` и `nonGoals` корректны и осмысленны.
- **Shared constants approach:** Предпочтение общих констант — правильное. Однако RFC не указывает, переименовываются ли `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS` (forward-only rename) или добавляются новые. При rename нужно обновить все ссылки в `leitstand.promote` (строки 2347-2371).

## Axis G — Blind spots

- **Exception handling:** RFC не указывает политику обработки исключений `adapter.health()`. RFC-0747 явно говорит: "no retry on exceptions — only for `unhealthy` state. Exceptions indicate infrastructure errors, not propagation delays." RFC-0846 должен содержать аналогичное утверждение. Показанный код-сниппет не включает try/catch — исключения propagate immediately, но это должно быть задокументировано явно.
- **`unknown` state:** Health check может вернуть `state: "unknown"` (например, если no routes available в behavior snapshot — см. `cloudflare-workers.ts:336`). RFC-сниппет проверяет только `=== "healthy"` для break, но не различает `unhealthy` и `unknown` для retry. Стоит уточнить: retry на `unknown` тоже, или только на `unhealthy`?

## Questions for the author

1. Какой DNA-инвариант удовлетворяет этот RFC? `satisfies: []` должен быть заполнен (V-24). DNA-49 (Fleet propagation / Leitstand) — наиболее релевантный. Добавь `satisfies: [DNA-49]` и объясни в теле RFC, как retry усиливает надёжность pipeline.
2. Должны ли исключения `adapter.health()` ретраиться, или propagate immediately? RFC-0747 явно говорит "no retry on exceptions". RFC-0846 должен содержать аналогичное утверждение.
3. При выборе общих констант: переименовываются ли `ALT_HEALTH_MAX_ATTEMPTS` → `HEALTH_CHECK_MAX_ATTEMPTS` (forward-only rename с обновлением всех ссылок в `leitstand.promote`), или добавляются новые константы параллельно?
