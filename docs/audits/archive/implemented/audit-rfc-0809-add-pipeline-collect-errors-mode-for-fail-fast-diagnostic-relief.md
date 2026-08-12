---
rfcId: RFC-0809
auditId: AUDIT-RFC-0809-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0809

## Verdict: Needs revision

RFC содержит несколько неточностей в описании фактического поведения scheduler'а и типовые ошибки в примерах кода. Наиболее серьёзные: (1) `concurrency=1` режим описан неверно — scheduler делает все шаги последовательными, независимых веток нет; (2) код-пример фильтрует `dependencySkipped` на `KernelExecutionReport`, где этого поля не существует; (3) `commands.changed` содержит абстрактное описание вместо имён команд.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0809` вернул 0 violations.

## Axis A — Structural completeness

No issues. Все обязательные секции присутствуют и содержат реальный контент. Decision в present tense, CLI surface с точными командами, TypeScript contracts минимальны, file system responsibilities таблица указывает конкретные пути, output format документирован, failure modes с exit codes, rollout описан, alternatives с тремя реальными альтернативами, risks включают agent misinterpretation risk, acceptance criteria checkable.

## Axis B — DNA alignment

- **`satisfies: [DNA-2]` слабо связано.** DNA-2 описывает «pnpm workspace + Turborepo» — package manager и task orchestration. RFC не меняет структуру workspace. Сам RFC признаёт: «No change to workspace structure.» Связь декоративная. В `docs/architecture-dna.md` нет инварианты о pipeline execution semantics, которую этот RFC защищает или расширяет. Если ни одна существующая DNA-инварианта не покрывает pipeline execution, следует явно отметить это и не указывать `satisfies` формально.

## Axis C — Ecosystem fit

- **`commands.changed` содержит абстрактное описание вместо имён команд.** Значение `"pipeline executor (internal)"` — не зарегистрированная команда. Фактически изменяемые команды: `mission.validate`, `build.check`, `build.post`, `build.prepare` — они принимают новый `--collect-errors` флаг. Поле `commands.changed` должно содержать имена команд, а не описания внутренних модулей.

## Axis D — Forward-only compliance

No issues. RFC не предлагает compat-shim или dual-path. `--collect-errors` — opt-in режим, default поведение неизменно. Не legacy-удержание, а новая возможность.

## Axis E — Agent-facing policy

- **Acceptance probe ожидает `exitCode: 0`**, что не проверяет collect-errors поведение осмысленно. Если `mission.validate --collect-errors` запускается на mission с failing validators, exit code будет non-zero (RFC: «Exit code is non-zero if any step failed»). Probe с `exitCode: 0` проверяет только что флаг принимается командой на clean mission — но не проверяет, что несколько независимых failure'ов агрегируются. Следует добавить второй probe или изменить expect на проверку `failedSteps` массива при non-zero exit code.

- Implementation notes ссылаются на «RFC-0224 preconditions» для accepted→implemented transition — нужно проверить, что это корректный RFC ID для текущего процесса stamping.

## Axis F — Pragmatism

- **`commands.changed` — см. Axis C.** Абстрактное описание вместо имён команд делает command lifecycle metadata неточным для `command.manifest.generate` и `docs.commands.generate`.

- **File system responsibilities упоминает `cli.ts` с оговоркой «or equivalent».** Следует указать точный путь. CLI entry point для werkstatt — `packages/werkstatt/src/kernel/cli.ts` или `packages/werkstatt/bin/werkstatt.mjs`? Неточность пути затрудняет реализацию.

## Axis G — Blind spots

- **`concurrency=1` поведение описано неверно.** RFC утверждает (строка 71): «for concurrency = 1, the sequential chain is broken at failures but independent branches still run». Это фактически неверно. В `pipeline-scheduler.ts:194-201`, при `concurrency=1` scheduler перестраивает весь schedule так, что каждый шаг зависит от предыдущего non-skipped шага — full sequential mode. Независимых веток не существует. При failure шага 0, `markSkippedDueToFailure` каскадно пропускает ВСЕ последующие шаги. RFC должен явно признать, что `--collect-errors` эффективен только при `concurrency > 1` (default), либо предложить изменение scheduler'а для concurrency=1.

- **Implementation note (строка 206) противоречит design.** Note говорит «the sequential chain should break at failures (so dependent steps are skipped) but independent branches should still execute» — но в concurrency=1 нет independent branches по определению. Note некорректно описывает архитектуру.

- **Код-пример содержит type error.** Строка 119: `reports.filter((report) => !report.ok && !report.dependencySkipped)`. `dependencySkipped` — поле на `StepExecutionResult` (`pipeline-scheduler.ts:160`), НЕ на `KernelExecutionReport`. В caller'е `reports` — это `KernelExecutionReport[]` (результат `sortedResults.map((r) => r.report)`). Фильтр по `report.dependencySkipped` не скомпилируется. Правильный подход: фильтровать на уровне `StepExecutionResult[]` до маппинга в `reports`, либо проверять `report.summary?.startsWith("Skipped: dependency failed")`.

- **Отсутствует расширение типа `KernelPipelineReport`.** Код-пример (строки 126-136) возвращает `failedSteps` в объекте, но `KernelPipelineReport` (`types.ts:355-366`) не имеет поля `failedSteps`. RFC не указывает это type change в секции TypeScript contracts. Нужно добавить `failedSteps?: string[]` в `KernelPipelineReport` и указать это в file system responsibilities.

- **Не описано как `--collect-errors` флаг доходит от CLI до `executeKernelPipeline`.** `mission.validate` — это command handler, который внутренне вызывает `executeKernelPipeline`. Флаг должен быть parsed в command handler и передан как `collectErrors: true` в `ExecuteKernelPipelineOptions`. Но `mission.validate` может не передавать все опции напрямую — нужно проверить, как `build.prepare`/`build.check`/`build.post` вызывают `executeKernelPipeline` и как флаг будет проброшен.

## Questions for the author

1. Как `--collect-errors` должен работать при `concurrency=1`? Если scheduler делает все шаги последовательными и abort-on-failure, то collect-errors не имеет эффекта. Нужно ли менять scheduler для concurrency=1, или явно задокументировать что collect-errors требует concurrency > 1?

2. Почему `satisfies: [DNA-2]`? DNA-2 — о pnpm workspace + Turborepo, не о pipeline execution. Какую инвариану защищает или расширяет этот RFC?

3. Как `failedSteps` попадёт в `KernelPipelineReport`? Тип не имеет этого поля, и RFC не указывает его расширение в TypeScript contracts. Нужно ли добавлять `failedSteps?: string[]` в тип, или это поле только в output layer command handler'а?
