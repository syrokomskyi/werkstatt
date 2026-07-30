---
rfcId: RFC-0593
auditId: AUDIT-RFC-0593-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0593

## Вердикт: Needs revision

RFC содержит 7 находок на осях A, B, C, F, G. Наиболее серьёзные: `@warpgogol/ontology` в `packagesImpacted` не подтверждается телом RFC (V-30 warning), `satisfies` неполон (DNA-47 должен быть включён), и не рассмотрен edge-case с нематериализованными миссиями — `mission.validate` требует `materializedAt`, что делает невозможным закрытие миссий без материализации.

## Механическая валидация (rfc.validate)

Pass (1 warning). V-30: `@warpgogol/ontology` в `packagesImpacted`, но `breaksC` не установлен. Warning указывает на несоответствие — RFC не модифицирует `packages/ontology/src/external-surfaces/`, и `@warpgogol/ontology` вероятно не должен быть в `packagesImpacted` вообще.

## Ось A — Структурная полнота

1. **`packagesImpacted` включает `@warpgogol/ontology` без обоснования.** Тело RFC не описывает никаких изменений в `@warpgogol/ontology`. Тип `BordbuchViolation` уже экспортируется из `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts:164`. Тип `MissionValidateData` уже существует в `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`. Новые схемы в ontology не нужны. Удалить `@warpgogol/ontology` из `packagesImpacted`.

2. **`nonGoals: []` пуст.** Раздел должен содержать значимые non-goals: например, «не добавляет validation gate к `mission.abort`», «не добавляет validation gate к `release.prepare` (там уже есть свои проверки)», «не кэширует результаты `mission.validate`».

3. **`successSignals: []` пуст.** Для architecture RFC полезно указать сигналы успеха — например, «0 миссий закрыто с невалидным контентом после внедрения».

## Ось B — DNA-выравнивание

1. **`satisfies` неполон.** RFC указывает `satisfies: [DNA-46]`, но тело RFC явно расширяет DNA-47 (Materialization): «DNA-47 — `mission.validate` is already part of the materialization flow. This RFC makes it mandatory before close, not optional.» DNA-47 должен быть в `satisfies[]` — RFC делает опциональную валидацию обязательной, что является расширением инварианта.

2. **Термин «amends» в теле RFC неточен.** Строка 107: «This RFC amends the `mission.open` and `mission.close` behavior.» Но `amends: []` пуст, и RFC-0355 архивирован (в `docs/rfcs/archive/implemented/`). Корректно сказать «extends» или «adds gates to» — RFC не amendит документ RFC-0355, а расширяет поведение команд. Использование `related: [RFC-0355]` правильно, но формулировка в теле вводит в заблуждение.

## Ось C — Ecosystem fit

1. **Acceptance criterion для AGENTS.md не указывает какой именно.** Критерий «AGENTS.md updated with the new gate behavior in the mission lifecycle section» (строка 215) не уточняет, какой `AGENTS.md`. Правильный адресат — `packages/os/site-kernel-handoff/AGENTS.md` (где живут mission lifecycle правила, раздел «Bordbuch git synchronization» и «Werkstatt side-effect auto-commit»). Корневой `AGENTS.md` может также потребовать обновления в разделе «Active instruction model». Указать конкретные файлы.

2. **Compass sync не упомянут.** RFC изменяет поведение mission lifecycle команд, что может потребовать обновления `docs/verification-plan.xml` (если там описаны verification gates для mission lifecycle). Проверить и указать, если синхронизация нужна.

## Ось D — Forward-only compliance

No issues. RFC не предлагает backward compatibility layers, shims, или dual-paths. Гейты mandatory с первого дня. `--force` флаг явно отвергнут. Существующие проверки (`reconciledAt`) сохраняются — валидация добавляется поверх, не заменяя.

## Ось E — Agent-facing policy

No issues. Status gate корректный: «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).» Implementation notes ссылаются на RFC-0224 (accepted→implemented) и RFC-0334 (supersede escalation). Anti-fabrication: N/A — все acceptance criteria — это code/test changes. Storage policy: N/A.

## Ось F — Pragmatism

1. **`@warpgogol/ontology` в `packagesImpacted` — избыточен.** (Дублирует Axis A finding 1, но также прагматический вопрос: RFC не должен перечислять пакеты, которые не затрагивает.) Типы `BordbuchViolation` и `MissionValidateData` уже существуют в `site-kernel-handoff`. RFC нужно только переиспользовать существующий `validateBordbuch` из `bordbuch-io.ts:164` и `runMissionValidate` из `mission-materialization-commands.ts:145`.

## Ось G — Blind spots

1. **Нематериализованные миссии — edge case не рассмотрен.** `mission.validate` требует `manifest.materializedAt` (`mission-materialization-commands.ts:159`): если миссия не материализована, `mission.validate` бросает ошибку. Но `mission.close` сейчас не требует `materializedAt` — только `reconciledAt`. Если `mission.close` начнёт вызывать `mission.validate` inline, миссии без материализации (например, миссия, которая меняет только metadata bordbuch) не смогут быть закрыты. RFC должен либо: (a) явно заявить, что все миссии должны быть материализованы перед закрытием (breaking change), либо (b) описать исключение для нематериализованных миссий. Проверить: требует ли `mission.reconcile` `materializedAt` — если да, то `reconciledAt !== null` подразумевает `materializedAt !== null`, и edge case не существует. Из кода: `mission.reconcile` требует `validation-report.json` (`mission-materialization-commands.ts:614`), который создаётся `mission.validate`, которая требует `materializedAt`. Цепочка: materialize → validate → reconcile → close. Значит, `reconciledAt !== null` гарантирует `materializedAt !== null`. Но RFC должен явно задокументировать эту инвариантность.

2. **Lock holding time для `mission.close`.** `mission.validate` запускает `build.prepare` + `build.check` + `astro build` (2+ минуты). RFC предлагает запускать `runInlineValidate` внутри locked section `mission.close` (после `reconciledAt` check, до state transition). Это означает, что `registry`, `system:<id>`, и `mission:<id>` locks удерживаются 2+ минуты. Другие операции на том же system будут блокированы. RFC упоминает performance (2 минуты), но не адресует lock holding time. Рассмотреть: запускать validate до acquireLock, или вне mission lock scope.

3. **TOCTOU для `preflightBordbuch` в `mission.open`.** RFC предлагает вызывать `preflightBordbuch` before lock acquisition (строка 153). Это означает, что bordbuch валидируется без holding any lock. Если `bordbuch.repair` (RFC-0583) выполняется concurrently (operator-only, использует свои locks), bordbuch может измениться между validation и lock acquisition. Риск низкий (`bordbuch.repair` — operator-only), но стоит упомянуть как known limitation.

4. **Triple-build scenario.** Текущий flow: `mission.validate` (build) → `mission.reconcile` → `mission.close`. С новым gate: `mission.validate` (build) → `mission.reconcile` → `mission.close` (вызывает `mission.validate` → build снова). Это triple build, не double. RFC упоминает только double build (validate + close). Уточнить, что reconcile уже требует validation, и close валидирует снова — это второй build, не третий (первый — это manual validate перед reconcile).

## Вопросы автору

1. **Нематериализованные миссии:** RFC должен явно задокументировать, что `reconciledAt !== null` гарантирует `materializedAt !== null` (через цепочку materialize → validate → reconcile), ИЛИ описать исключение для миссий, которые не требуют материализации. Какой вариант выбираем?

2. **Lock holding time:** `mission.validate` внутри `mission.close` удерживает registry/system/mission locks 2+ минуты. Должен ли validate запускаться до acquireLock (после reconciledAt check, который тоже до locks), или это приемлемо для rare операции close?

3. **`versionBump: patch` vs `minor`:** Добавление mandatory validation gate к `mission.close` — это behaviour change: миссии, которые раньше закрывались, теперь будут отказаны. Для agents/automation, которые полагались на старое поведение, это breaking change (Breaks-B). Должен ли `versionBump` быть `minor` с migrator, или `patch` достаточен, потому что gate additive?
