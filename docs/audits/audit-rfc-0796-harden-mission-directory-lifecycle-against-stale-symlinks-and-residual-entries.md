---
rfcId: RFC-0796
auditId: AUDIT-RFC-0796-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0796

## Verdict: Needs revision

RFC корректно описывает проблему и предлагает прагматичное решение, переиспользующее существующий паттерн `sternsystem.sync`. Однако есть пробелы в контрактах (отсутствует `--json` output format, `AutoArchiveResult` не интегрирован в `CloseReport`), неоднозначность в acceptance criteria, и несколько слепых зон в Axis G.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0796` passed with zero violations.

## Axis A — Structural completeness

- **A1: Missing `--json` output format.** Раздел "TypeScript contracts" определяет `AutoArchiveResult`, `StaleEntryCheck`, `StaleEntryViolation`, `WorkspaceGlobCheck`, но RFC не документирует, как эти типы попадают в `--json` output соответствующих команд. Для `mission.close` текущий `CloseReport` (`mission-close.ts:97-103`) содержит поля `git`, `mirror`, `reconcile`, `warnings` — но не содержит поля `archive`. RFC не уточняет, добавляется ли `AutoArchiveResult` в `CloseReport`, в `MissionCloseData`, или вообще не попадает в output.

- **A2: Acceptance criterion "Unit tests for all six changes" неоднозначен.** В RFC перечислены 4 новых изменения (2a, 2b, 3a, 3b) + 3 уже реализованных багфикса (1a, 1b, 1c) = 7. "Six" не совпадает ни с одной группировкой. Нужно уточнить: относится ли критерий к 4 новым изменениям, или к 6 элементам из `successSignals` (где 1a и 1b объединены в один пункт)?

- **A3: Risks не упоминают agent misinterpretation risk и false-positive rate для 3a validator.** Раздел Risks покрывает auto-archive timing, stale cleanup false positive, и performance — но не описывает риск ложных срабатываний валидатора (3a) для workshop'ов, где оператор намеренно держит закрытые миссии в `missions/` root.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46]` корректно — RFC усиливает mission lifecycle, не меняя состояния. `related` ссылки на RFC-0355, RFC-0480, RFC-0573, RFC-0580 релевантны и обоснованы в разделе "Architectural fit".

## Axis C — Ecosystem fit

- **C1: No Compass XML sync mention.** RFC добавляет auto-archive в `mission.close` — это изменение lifecycle behavior. Если `docs/requirements.xml` или `docs/development-plan.xml` описывают mission lifecycle steps, они могут потребовать синхронизации. RFC не упоминает Compass XML duties.

- **C2: Cross-module invocation confirmed.** `mission.archive` зарегистрирован через `forgeMissionModule` в `tools/kernel.config.ts:64`. Вызов через `executeKernelCommand` из `mission-close.ts` (в `@warpgogol/werkstatt`) работает по тому же паттерну, что и `sternsystem.sync`. ✓

## Axis D — Forward-only compliance

No issues. `--skip-auto-archive` — это escape hatch, не legacy path. Никаких shim'ов или dual-path.

## Axis E — Agent-facing policy

No issues. Status gate корректен: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes ссылаются на RFC-0224. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. Решение переиспользует `executeKernelCommand` + `mission.archive` вместо инлайнинга. Альтернативы честно рассмотрены (4 альтернативы с причинами отказа). `packagesImpacted` корректно включает `@warpgogol/forge` (1c bug fix in `archive.ts`) и `@warpgogol/werkstatt` (2a-3b + 1a, 1b).

## Axis G — Blind spots

- **G1: Auto-archive затрагивает ALL terminal-state missions, не только текущую.** Функция `autoArchiveClosedMissions(workspaceRoot, logger)` не принимает `missionId`. `mission.archive` сканирует весь `missions/` root. Первое выполнение `mission.close` после деплоя этого RFC заархивирует ALL закрытые миссии, а не только текущую. Это может стать сюрпризом для оператора. RFC должен явно задокументировать это поведение.

- **G2: `CloseReport` не расширен полем `archive`.** Текущий `CloseReport` (`mission-close.ts:97-103`) содержит `mirror: CloseReportMirror` с полями `synced`/`syncError` — но нет аналога для archive. Без поля `archive` в `CloseReport` или `MissionCloseData`, результат auto-archive не отслеживается в structured output. Для traceability (как mirror sync) нужно добавить `archive: { archived: boolean; error: string | null }` в `CloseReport`.

- **G3: 3b performance cost не оценён.** `checkWorkspaceGlobsForStalePackages` читает `pnpm-workspace.yaml`, резолвит каждый glob, читает каждый `package.json`, проверяет `workspace:*` references. Для workshop'ов с большим количеством missions это может быть медленным. RFC не указывает оценку стоимости (количество файлов, I/O patterns).

- **G4: 3a validator scope mismatch.** `mission.validate` вызывается с `--mission <id>` (mission-scoped), но `validateNoStaleMissionEntries` сканирует весь `missions/` root (workspace-level). RFC должен уточнить, что это workspace-level advisory check внутри mission-scoped команды, аналогично существующим workspace-level warnings (dirty cache clone, bordbuch consistency).

## Questions for the author

1. Должен ли `AutoArchiveResult` быть добавлен в `CloseReport` (как `archive: { archived: boolean; error: string | null }`) или в `MissionCloseData`? Текущий `CloseReport` не имеет поля `archive` — без него результат auto-archive не виден в structured output.
2. `autoArchiveClosedMissions` не принимает `missionId` — намеренно ли, что auto-archive заархивирует ALL terminal-state missions в `missions/` root, а не только текущую? Если да, это нужно явно задокументировать в Rollout.
3. Какие именно "six changes" имеются в виду в acceptance criterion "Unit tests for all six changes"? Перечислено 4 новых + 3 уже реализованных = 7 изменений.
