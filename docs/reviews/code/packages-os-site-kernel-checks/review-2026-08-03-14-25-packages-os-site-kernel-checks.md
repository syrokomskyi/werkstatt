---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD~1...HEAD
filesReviewed:
  - docs/COMMANDS.md
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-checks/src/axiom-report.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/mission-check.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/methodologies-config.ts
  - packages/os/site-kernel-checks/src/methodologies-validate.ts
  - packages/os/site-kernel-checks/src/tests/axiom-report-gate-summary.test.ts
  - packages/os/site-kernel-checks/src/tests/methodologies-config.test.ts
  - packages/os/site-kernel-checks/src/tests/methodologies-validate.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-propagate-channel-removed.test.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts
---

# Ревью кода: RFC-0665 — конфигурируемые Axiom-методологии с per-methodology gate

### Вердикт: Needs revision

Дифф реализует RFC-0665 в объёме Phase 1 (accessibility + placeholder-дайджесты для остальных методологий). Структурно реализация корректна, но есть несколько находок: дублирование логики фильтрации incomplete-находок между `renderGateSummary` и `leitstand.propagate`, placeholder-дайджесты `pending-phase2:*` в production-коде, и AGENTS.md описывает экспорты `instrumentSchema`/`methodologySchema`/`gateSchema`, которые не соответствуют реальным именам в коде.

### Mechanical floor

Pass — `tsc --noEmit` проходит для обоих пакетов, все 770 + 583 теста проходят.

### Axis A — Структурная корректность

- **Дублирование логики incomplete-фильтрации** — логика исключения `.incomplete` находок копируется дословно в двух местах: `renderGateSummary` (`axiom-report.ts:287-292`) и `leitstand-commands.ts:1147-1153`. Оба сайта фильтруют находки по `predicate.endsWith(".incomplete")` с одинаковым паттерном. Это кандидат на extraction в shared helper (например, `isBlockingFinding(finding, methodologyId, blockOnSet)` в `methodologies-config.ts`).
- **Placeholder-дайджесты в production-коде** — `mission-check.ts:790` пишет `pending-phase2:${m.id}` как digest для не-accessibility методологий. Это строка-маркер попадает в `evidence-metadata.json` и архивируется в R2. Если `leitstand.propagate` или `axiom.report` попытаются верифицировать digest, они получат невалидный placeholder. Стоит либо пометить это как `// TODO(phase2)` с explicit skip в gate logic, либо использовать реальный digest из `methodologyPackageDigest` для всех 8 методологий (они доступны в `@syrokomskyi/axiom-methodology`).
- **Динамический import `node:fs`** — `methodologies-validate.ts:54` использует `await import("node:fs")` для `readFileSync`, хотя `existsSync` уже импортирован статически на строке 14. Это не ошибка, но создаёт ненужную асинхронность в hot path. Заменить на статический import.

### Axis B — DNA alignment

- **DNA-49 (Fleet propagation / Leitstand)** — gate расширен корректно: per-methodology `blockOn` вместо глобального high/critical. Forward-only: pre-RFC-0665 evidence отвергается с понятным сообщением.
- **DNA-48 (Release discipline)** — усиление gate через multi-methodology blocking соответствует инварианту.
- **No issues.**

### Axis C — Ecosystem fit

- **Pipeline placement** — `methodologies.validate` добавлен в конец `PACKAGES_CHECK_PIPELINE` (`packages-check.ts:189`), после `yaml.parse.validate`. Это правильная позиция: config file валидируется после общих YAML-проверок.
- **Command registration** — команда зарегистрирована в `command-tables/infra-contracts.ts:418-433` с корректными `reads: ["systems/methodologies.md"]`, `cacheable: false`, `supportsAllSites: false`.
- **AGENTS.md export names** — в `site-kernel-checks/AGENTS.md` записано: `Exports instrumentSchema, methodologySchema, gateSchema, methodologiesConfigSchema`. Реальные имена в `methodologies-config.ts`: `instrumentConfigSchema`, `methodologyConfigSchema`, `gateConfigSchema` (с суффиксом `Config`). Расхождение между документацией и кодом.

### Axis D — Forward-only compliance

- **Pre-RFC-0665 evidence rejected** — `leitstand-commands.ts:1078-1086` явно отвергает evidence без `methodologies[]` с сообщением "Evidence predates RFC-0665". No compatibility shim, no grace period. Корректно.
- **No issues.**

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT** — оба новых файла (`methodologies-config.ts`, `methodologies-validate.ts`) содержат `MODULE_CONTRACT` и `CHANGE_SUMMARY`. Корректно.
- **Комментарии** — комментарии в `mission-check.ts:775-787` и `leitstand-commands.ts:1131-1135` объясняют Phase 1 / Phase 2 границы. Понятно для следующего агента.
- **AGENTS.md** — оба пакета обновлены с описанием новых модулей и изменений существующих.
- **No issues.**

### Axis F — Pragmatism

- **Минимальная command surface** — `methodologies.validate` — это новый command, но он валидирует отдельный config file, который не покрывается существующими командами. Обоснованно.
- **`evidenceMetadataSchema` в `methodologies-config.ts`** — экспортирует Zod-схему для evidence-metadata, но она не используется ни в `mission-check.ts`, ни в `leitstand-commands.ts` (оба парсят JSON вручную). Speculative generality — либо использовать её для валидации, либо удалить.
- **`KNOWN_INSTRUMENT_TYPES`** — дублирует enum значения из `instrumentConfigSchema` (строки 21-30 и 86-95). Если Zod-схема уже валидирует enum, отдельный массив для validate-команды избыточен — можно вывести из схемы через `.options`.

### Axis G — Blind spots

- **Edge case: empty `systems/methodologies.md`** — если файл существует, но frontmatter пустой, `parseMethodologiesConfig` выбросит ошибку Zod, которая попадёт в METH-VAL-02. Это корректно, но сообщение об ошибке будет техническим (Zod issues), а не человекочитаемым.
- **Edge case: все методологии `active: false`** — `mission-check.ts:774` фильтрует по `m.active`, поэтому `methodologiesEvidence` будет пустым массивом. `evidence-metadata.json` запишется без `methodologies[]`, и `leitstand.propagate` отвергнет его как pre-RFC-0665. Стоит задокументировать, что хотя бы одна методология должна быть active.
- **Performance** — `tryLoadMethodologiesConfig` читает файл синхронно через `readFileSync`. Для workspace-level config это приемлемо (один файл, один вызов за mission.check).

### Spec compliance

| Требование из RFC-0665 | Статус | Evidence |
| --- | --- | --- |
| `systems/methodologies.md` exists and `methodologies.validate` passes | Done | `methodologies-config.ts`, `methodologies-validate.ts`, pipeline step |
| `mission.check` reads config, writes `methodologies[]` to evidence-metadata | Done | `mission-check.ts:771-806` |
| `leitstand.propagate` groups findings by methodologyId, checks per-methodology block-on | Done | `leitstand-commands.ts:1136-1160` |
| `evidence-metadata.json` contains `methodologies[]` with id, digest, blockOn | Done | `mission-check.ts:797-806` |
| `axiom.report` shows gate summary (pass/fail per methodology) | Done | `axiom-report.ts:279-323`, `axiom-report.ts:344-346` |
| `mission.check` no longer imports `extractAxeResult`, `runAccessibilityInstrument` directly | **Partial** | `mission-check.ts` всё ещё импортирует `createAutomatedWebAccessibilityMethodology` и `methodologyPackageDigest` — это Phase 1 compromise, RFC-0665 §successSignals говорит, что эти импорты должны быть удалены |

### Questions for the author

1. Placeholder-дайджесты `pending-phase2:*` попадают в R2-архив. Что произойдёт, если `leitstand.propagate` или future governance check попытается верифицировать digest? Стоит ли добавить explicit skip в gate logic для placeholder-дайджестов?
2. `evidenceMetadataSchema` экспортируется, но не используется для валидации ни в `mission.check`, ни в `leitstand.propagate`. Это planned for Phase 2, или мёртвый код?
3. AGENTS.md описывает экспорты `instrumentSchema`/`methodologySchema`/`gateSchema`, но реальные имена — `instrumentConfigSchema`/`methodologyConfigSchema`/`gateConfigSchema`. Какое имя должно быть canonical?
