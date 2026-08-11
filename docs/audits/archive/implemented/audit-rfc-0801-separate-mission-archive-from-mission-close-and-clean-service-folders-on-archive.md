---
rfcId: RFC-0801
auditId: AUDIT-RFC-0801-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0801

## Verdict: Needs revision

RFC корректно диагностирует проблему (auto-archive ломает release.prepare) и предлагает верное решение (разделить close и archive). Однако `--skip-auto-archive` сохранён как no-op — это прямое нарушение forward-only дисциплины. Использование `supersedes` вместо `amends` для частичного изменения RFC-0796 неточно. `packagesImpacted` неполон — отсутствует `@warpgogol/forge`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0801 --json` вернул 0 violations.

## Axis A — Structural completeness

- **Acceptance criterion "CloseReport.archive field removed or deprecated"** (line 206) — формулировка "removed or deprecated" неоднозначна. Forward-only дисциплина требует удаления, не депрекации. Критерий должен говорить "removed" без альтернативы.
- Отсутствует секция "Output format" — RFC не документирует изменение `--json` вывода `mission.close` (поле `archive` удаляется из `CloseReport`). Для `kind: command` это ожидаемая секция.

## Axis B — DNA alignment

- `satisfies: [DNA-46, DNA-48]` — оба инварианта существуют в `docs/architecture-dna.md`. RFC объясняет как: DNA-46 — архивация становится явным шагом оператора; DNA-48 — workpiece остаётся на стабильном пути во время release pipeline. Корректно.
- `related[]` включает DNA-46, DNA-48, RFC-0355, RFC-0480, RFC-0573, RFC-0796, RFC-0797 — все релевантны.
- **Finding**: RFC использует `supersedes: [RFC-0796]`, но заменяет только часть RFC-0796 (auto-archive), сохраняя остальные изменения (stale cleanup, validate warning, materialize guard). Это частичное изменение — должно использовать `amends: [RFC-0796]`, а не `supersedes`. Соответственно RFC-0796 должен иметь `amendedBy: [RFC-0801]` вместо `supersededBy: [RFC-0801]`. Текущая связка помечает RFC-0796 как полностью superseded, что неточно — его остальные изменения всё ещё активны.

## Axis C — Ecosystem fit

- **`packagesImpacted` неполон**: указан только `@warpgogol/werkstatt`, но `mission.archive` handler находится в `packages/forge/os/mission/handlers/archive.ts`. RFC-0796 корректно указывал оба пакета (`@warpgogol/werkstatt` и `@warpgogol/forge`). RFC-0801 должен сделать так же — service-folder cleanup изменяет код в `packages/forge`.
- **AGENTS.md update не упомянут**: RFC-0796 добавил заметку об auto-archive в AGENTS.md (acceptance criterion: "AGENTS.md updated with auto-archive behavior note", evidence: `AGENTS.md:136-139`). RFC-0801 удаляет auto-archive, но не упоминает обновление/удаление этой заметки из AGENTS.md.
- **Compass XML synchronization**: отсутствует секция. RFC-0796 имел явную секцию "Compass XML synchronization" с обоснованием. RFC-0801 должен проверить, нужно ли обновить `docs/development-plan.xml` (описывает deployment pipeline) или `docs/requirements.xml`.
- **deploy.md уже обновлен**: `.devin/workflows/deploy.md` уже содержит ссылки на RFC-0801 (lines 24, 27, 145-154) — pipeline sequence включает `mission.archive --status=closed` как явный шаг, troubleshooting упоминает RFC-0801. RFC находится в статусе `draft`, но изменение уже применено. Это нарушение status gate — RFC должно быть `accepted` перед применением изменений. Acceptance criterion "deploy.md updated" уже удовлетворён.
- Command lifecycle: `commands.changed: [mission.close, mission.archive]` — оба существующие команды. Корректно.

## Axis D — Forward-only compliance

- **`--skip-auto-archive` no-op нарушает forward-only дисциплину**: RFC явно говорит "the flag remains accepted but is a no-op (auto-archive is removed). This preserves backward compatibility for scripts and muscle memory" (line 91) и в nonGoals: "Does not remove the --skip-auto-archive flag (kept for backward compatibility but now a no-op)" (line 49). Forward-only дисциплина (`fo-pipeline-conventions.md` §Forward-only discipline): "No backward compatibility layers, no shims, no dual-paths. Legacy code paths are deleted, not maintained behind a flag. Deprecation means removal in the same change, not an indefinite grace period." Флаг должен быть **удалён**, а не сохранён как no-op. Скрипты, использующие его, получат unknown-flag warning — это правильно для forward-only.
- `CloseReport.archive` field: acceptance criterion говорит "removed or deprecated". Должно быть "removed" — forward-only не допускает депрекации.

## Axis E — Agent-facing policy

- Status gate: RFC находится в `draft` и не содержит self-authorizing language. Корректно.
- Однако deploy.md уже обновлен с ссылками на RFC-0801 при статусе `draft` — это фактическое нарушение status gate (изменение применено до acceptance).
- NEEDS CLARIFICATION markers: не найдены.
- Implementation notes ссылаются на корректные governance rules (RFC-0224, RFC-0334).

## Axis F — Pragmatism

- Минимальный command surface: нет новых команд. Корректно.
- Lean contracts: TypeScript contracts минимальны. Корректно.
- Existing patterns: расширяет существующий `mission.archive`. Корректно.
- Scope discipline: `appsImpacted: []` — корректно. `packagesImpacted` неполон (см. Axis C).

## Axis G — Blind spots

- Performance: cleanup 6 service folders — O(1), тривиально. Не требует явного упоминания.
- Edge cases: `cleanServiceFolders` проверяет `fileExists` перед удалением — корректно для missions без `workpiece/` (aborted, не материализованные). RFC не упоминает этот случай явно, но код обработает его.
- Migration path: existing archived missions unaffected. Корректно.
- Пропущен сценарий: что происходит с `mission.abort`? RFC фокусируется на `mission.close`, но `mission.archive --status=aborted` тоже существует. Service-folder cleanup должен применяться к aborted missions тоже. RFC не упоминает это явно, но код в `archive.ts` обрабатывает обе terminal states через `MISSION_TERMINAL_STATUSES`.

## Questions for the author

1. Почему `--skip-auto-archive` сохранён как no-op вместо полного удаления? Forward-only дисциплина требует удаления legacy code paths, не сохранения их как no-op. Какой конкретный сценарий требует сохранения флага?
2. Почему использован `supersedes` вместо `amends`? RFC-0796 внёс 4 изменения (auto-archive, stale cleanup, validate warning, materialize guard) — RFC-0801 отменяет только первое. Не должен ли это быть `amends`?
3. Почему `@warpgogol/forge` отсутствует в `packagesImpacted`? Handler `mission.archive` находится в `packages/forge/os/mission/handlers/archive.ts` — service-folder cleanup изменяет код в этом пакете.
4. deploy.md уже обновлен с ссылками на RFC-0801 при статусе `draft` — это нарушение status gate. Должен ли RFC быть ретроактивно принят, или deploy.md изменения нужно откатить до acceptance?
