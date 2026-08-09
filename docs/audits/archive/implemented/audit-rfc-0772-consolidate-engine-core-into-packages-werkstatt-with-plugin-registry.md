---
rfcId: RFC-0772
auditId: AUDIT-RFC-0772-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0772

## Вердикт: Needs revision

RFC содержит критическое архитектурное противоречие между phase 6 (удаление старых пакетов) и nonGoals (перезапись `tools/kernel.config.ts` отложена в RFC-0776). Удаление `@warpgogol/site-kernel-handoff` и других пакетов в phase 6 сломает `tools/kernel.config.ts`, который импортирует из них. Кроме того, `satisfies[]` пуст, хотя RFC явно утверждает что устанавливает enforcement для DNA-64, а DNA-64 ещё не существует в реестре.

## Механическая валидация (rfc.validate)

Pass — 0 нарушений. `rfc.validate --id RFC-0772 --json` проходит чисто.

## Ось A — Структурная полнота

- **Нет таблицы файловых обязанностей.** RFC-0771 содержит таблицу "File system responsibilities" с конкретными путями. RFC-0772, хотя затрагивает ~15 пакетов и создаёт новую структуру каталогов `packages/werkstatt/src/`, не содержит аналогичной таблицы. Фазовая таблица (lines 99-106) описывает содержимое фаз, но не конкретные пути.
- **Acceptance criteria неконкретны.** "All engine→stack call sites inverted" (line 157) не перечисляет конкретные call sites — RFC называет только 3 файла (`mission-materialize.ts`, `leitstand-commands.ts`, `release-commands.ts`), но не перечисляет вызовы внутри них. "Emptied source packages deleted" (line 159) не перечисляет какие именно пакеты удаляются.
- **CLI surface использует `site-kernel`.** Line 113: `pnpm exec werkstatt run werkstatt.autonomy.validate --json`. RFC-0771 (line 122) объявляет退休 `site-kernel` CLI имени. RFC-0772 должен либо указать что `site-kernel` используется только в transition window, либо использовать `werkstatt` CLI.
- **Нет списка исключений для autonomy guard.** Forge precedent (`packages/forge/src/onboarding/doctor.ts:106`) исключает `node_modules/` и `tests/` из сканирования. RFC не указывает исключения для `werkstatt.autonomy.validate`.

## Ось B — DNA alignment

- **`satisfies: []` пуст, но RFC утверждает enforcement DNA-64.** Line 91: "DNA-64 — this RFC installs the enforcement (`werkstatt.autonomy.validate`)." Для `kind: command` RFC, `--satisfies` не требуется (RFC-0331), но если RFC явно утверждает что устанавливает enforcement для DNA-инварианта, он должен быть в `satisfies[]`.
- **DNA-64 не существует в `docs/architecture-dna.md`.** Реестр заканчивается на DNA-63. RFC-0769 (draft) предлагает DNA-64. RFC-0772 зависит от того, что RFC-0769 будет реализован первым (добавит DNA-64 в реестр). Эта зависимость не отражена в `related[]` — RFC-0769 есть в `related[]`, но нет явного указания что DNA-64 должен существовать до реализации RFC-0772.
- **DNA-51/52/53 в Architectural fit, но не в `satisfies[]` или `related[]`.** Lines 92: "DNA-51/52/53 — primitives move intact." Эти DNA не указаны ни в `satisfies[]`, ни в `related[]` — только в prose. Если RFC переносит модули, связанные с этими DNA, они должны быть в `related[]` минимум.

## Ось C — Ecosystem fit

- **`packagesImpacted: []` пуст.** RFC затрагивает: `packages/os/site-kernel`, `packages/os/site-kernel-handoff`, `packages/os/site-kernel-integrity`, `packages/os/site-kernel-observability`, `packages/os/site-kernel-changelog`, `packages/os/site-kernel-deploy`, `packages/fingerprint`, `packages/agent-gate`, `packages/share`, `packages/ontology`. Все должны быть перечислены.
- **Нет AGENTS.md updates.** RFC не указывает какие `AGENTS.md` файлы требуют обновления. Root `AGENTS.md` (§ Monorepo layout ссылается на `packages/os/*`) и новый `packages/werkstatt/AGENTS.md` требуют обновления.
- **Нет Compass sync.** RFC не указывает какие `docs/*.xml` файлы требуют синхронизации. `docs/PACKAGE_GRAPH.md` упомянут (line 160), но `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml` могут потребовать обновления при изменении пакетной структуры.
- **Command lifecycle корректен.** `commands.proposed: [werkstatt.autonomy.validate]` — правильно для draft; перейдёт в `added` при реализации.

## Ось D — Forward-only compliance

- **Критическое противоречие: phase 6 удаляет пакеты, но `tools/kernel.config.ts` не переписывается.** `tools/kernel.config.ts` (lines 75-152) импортирует из `@warpgogol/site-kernel`, `@warpgogol/site-kernel-checks`, `@warpgogol/site-kernel-handoff`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-observability`. Phase 6 (line 106) удаляет emptied source packages. nonGoals (line 55) явно исключают перезапись `tools/kernel.config.ts` (RFC-0776). Это создаёт **сломанное состояние** между реализацией RFC-0772 и RFC-0776: `tools/kernel.config.ts` будет импортировать из удалённых пакетов. Варианты разрешения: (a) phase 6 не удаляет пакеты до RFC-0776; (b) `tools/kernel.config.ts` переписывается в phase 6 (противоречит nonGoals); (c) re-export scaffold сохраняется до RFC-0776 (противоречит "phase 6 removes them").
- **Temporary re-export scaffold (phases 1-5).** Line 108: "This is a construction scaffold, not a compatibility layer — it never ships." Приемлемо в рамках forward-only если scaffold существует только внутри окна реализации одного RFC и удаляется в том же RFC. Но критическое противоречие выше ставит под вопрос, действительно ли scaffold будет удалён в phase 6.

## Ось E — Agent-facing policy

- **No NEEDS CLARIFICATION markers.** Чисто.
- **Status gate корректен.** RFC в `draft`, нет self-authorizing language.
- **Implementation notes** — стандартный шаблон, корректные ссылки на governance rules.

## Ось F — Pragmatism

- **`werkstatt.autonomy.validate` обоснован.** Моделирован на proven forge autonomy guard (`packages/forge/src/onboarding/doctor.ts:92-123`). Не дублирует существующие команды.
- **6-phase execution plan прагматичен.** Каждая фаза имеет gate. Но фазы 1-5 с temporary re-export scaffold — это 5 промежуточных состояний, каждое из которых должно typecheck. Стоимость переключения между фазами не оценена.
- **NonGoals осмысленны.** Явные границы с RFC-0773/0774/0775/0776.
- **Не перечислены конкретные call sites для inversion.** RFC называет 3 файла, но не перечисляет вызовы внутри них (например, `mission.materialize` вызывает `runGenerate*`, Axiom checks, `applyTokens`, `readTemplate`). Агент-реализатор должен будет самостоятельно обнаружить все call sites.

## Ось G — Blind spots

- **Performance не оценён.** `werkstatt.autonomy.validate` сканирует `packages/werkstatt/src/**` — не оценено количество файлов и частота сканирования. Для сравнения, forge autonomy guard сканирует `packages/forge/src/` (~1298 lines в doctor.ts). Engine будет значительно больше.
- **False positives не обсуждены.** Forge precedent исключает комментарии (`packages/forge/src/tests/doctor-autonomy.test.ts:81-97` проверяет это). RFC не указывает, будет ли `werkstatt.autonomy.validate` также исключать комментарии и type-only imports.
- **Edge cases не рассмотрены.** Что если `packages/werkstatt` не существует при запуске `werkstatt.autonomy.validate`? Что если модуль импортирует `@warpgogol/werkstatt` (self-import) — это нарушение или нет?
- **Migration path для import rewrite не описан.** ~40 packages/services импортируют `@warpgogol/site-kernel*`. RFC упоминает "mechanical rewrite sweep" (line 150), но не описывает mapping (например, `@warpgogol/site-kernel-handoff/mission-module` → `@warpgogol/werkstatt/mission`). Без mapping, агент-реализатор должен будет составить его самостоятельно для ~40 пакетов.
- **Security/privacy.** Не применимо — RFC не затрагивает user data или PII.

## Вопросы к автору

1. **Как разрешается противоречие между phase 6 (удаление пакетов) и nonGoals (перезапись `tools/kernel.config.ts` отложена в RFC-0776)?** `tools/kernel.config.ts` импортирует из `@warpgogol/site-kernel-handoff/*` — если эти пакеты удалены в phase 6, конфигурация сломается. Варианты: (a) не удалять пакеты до RFC-0776; (b) переписать `tools/kernel.config.ts` в phase 6; (c) сохранить re-export scaffold до RFC-0776.
2. **Почему `satisfies: []` пуст, если RFC утверждает enforcement DNA-64?** Если RFC устанавливает `werkstatt.autonomy.validate` для enforcement DNA-64, должен ли DNA-64 быть в `satisfies[]`? И должен ли RFC-0769 быть реализован первым (чтобы DNA-64 существовал в реестре)?
3. **Какой import path mapping для ~40 packages/services?** `@warpgogol/site-kernel-handoff/mission-module` → `@warpgogol/werkstatt/mission`? `@warpgogol/site-kernel-checks` → `@warpgogol/werkstatt/checks`? RFC должен содержать mapping table для mechanical rewrite sweep в phase 6.
