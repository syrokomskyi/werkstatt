---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD (uncommitted changes in this session)
filesReviewed:
  - packages/os/site-kernel-checks/src/mission-check.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/tests/mission-check.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-checks/package.json
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-propagate-channel-removed.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/command-manifest.generated.yaml
---

# Code Review: RFC-0629 — migrate mission.check to native Axiom capsules

### Verdict: Needs revision

Дифф мигрирует `mission.check` на нативные Axiom-компоненты и обновляет leitstand-команды. Структурно миграция выполнена корректно: legacy-код удалён, новые компоненты используются, тесты обновлены. Однако есть несколько находок: `failResult` игнорирует переданный `exitCode`, `startTime` не используется, и `JSON.parse` без обработки ошибок в evidence gate.

### Mechanical floor

Pass — `tsc --noEmit` проходит для обоих пакетов. Vitest: 9/9 tests pass (site-kernel-checks), 16/16 tests pass (site-kernel-handoff).

### Axis A — Structural correctness

1. **`failResult` игнорирует параметр `exitCode`** — `@/packages/os/site-kernel-checks/src/mission-check.ts:93-116`. Функция принимает `exitCode: number`, но всегда записывает `exitCode: 1` в `data.exitCode` (строка 103) и только возвращает переданный `exitCode` в `KernelCommandResult.exitCode` (строка 113). Это создаёт несоответствие: `data.exitCode` всегда 1, даже когда `result.exitCode` равен 2. Тест `returns exit code 2 when no pages are discovered` проверяет только `result.exitCode`, но не `result.data.exitCode`. Нужно: `exitCode: exitCode as 0 | 1` в строке 103.

2. **`startTime` не используется в `failResult`** — `@/packages/os/site-kernel-checks/src/mission-check.ts:95`. Параметр `startTime` передаётся, но нигде не используется в теле функции. Dead parameter.

3. **`JSON.parse` без обработки ошибок в propagate gate** — `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:642,674`. `JSON.parse(metadataContent)` и `JSON.parse(studyRunContent)` могут выбросить `SyntaxError` при повреждённом файле, но нет try/catch. Это приведёт к нечитаемому стек-трейсу вместо понятного сообщения об ошибке.

4. **`null as unknown as StagedCapsule`** — `@/packages/os/site-kernel-checks/src/mission-check.ts:104-105`. `failResult` использует `null as unknown as StagedCapsule` и `null as unknown as StudyRun`. Это type-unsafe: любой код, обращающийся к `result.data.capsule` при `status === "fail"`, получит `null` вместо реального объекта. Лучше сделать `capsule` и `studyRun` опциональными в `MissionCheckResult` (`capsule?: StagedCapsule`).

### Axis B — DNA alignment

No issues. Дифф не затрагивает DNA-инварианты напрямую. Миграция evidence-формата не нарушает DNA-1 (monorepo boundary), DNA-6 (kebab-case filenames — все новые файлы используют kebab-case), или DNA-9 (page block/shell visibility model).

### Axis C — Ecosystem fit

1. **AGENTS.md обновлены** — оба затронутых `AGENTS.md` (site-kernel-checks, site-kernel-handoff) обновлены с описанием нового формата и флагов. Pass.

2. **Command manifest обновлён** — `docs/command-manifest.generated.yaml` обновлён с новым описанием и флагами `mission.check`. Pass.

3. **Command table обновлён** — `infra-contracts.ts` обновлён с новым описанием и флагами. Pass.

4. **Импорт из `@warpgogol/site-kernel-handoff/mission`** — `@/packages/os/site-kernel-checks/src/mission-check.ts:26`. `site-kernel-checks` импортирует `resolveMissionDir` из `site-kernel-handoff`. Это создаёт зависимость от handoff-пакета к checks-пакету. Проверить: есть ли уже такая зависимость в `package.json`? Да, `@warpgogol/site-kernel-handoff` не listed в dependencies `site-kernel-checks` — это может быть workspace-level разрешение. Нужно проверить, что зависимость объявлена.

### Axis D — Forward-only compliance

1. **Local mode полностью удалён** — `mission.check` требует `--external-preview`, локальный режим (build + static server) удалён. Pass.

2. **`mission-check-converter.ts` удалён** — файл удалён, нет dangling imports. Pass.

3. **Legacy evidence format удалён** — `findings.yaml` и `evidence-capsule.yaml` больше не записываются. `leitstand.propagate` gate читает только новый формат. Pass.

4. **`--mode` флаг удалён** — заменён на `--commit-sha` в command table и manifest. Pass.

### Axis E — Agent-facing clarity

1. **`MODULE_CONTRACT` присутствует** — `@/packages/os/site-kernel-checks/src/mission-check.ts:1-13`. Содержит purpose, non-goals, change summary. Pass.

2. **Комментарий RFC-0629 в leitstand-commands.ts** — `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:558`. Явный комментарий об удалении post-processing. Pass.

3. **Тестовые хелперы хорошо названы** — `writeStudyRun`, `writeEvidenceMetadata` в leitstand test. Pass.

### Axis F — Pragmatism

1. **`failResult` принимает `startTime` но не использует его** — избыточный параметр. Можно убрать или использовать для логирования duration.

2. **`safeNameFromUrl` дублирует логику** — `@/packages/os/site-kernel-checks/src/mission-check.ts:118-125`. Функция извлекает имя из URL, но `CrawleeDiscoveryExecutor` уже возвращает `normalizedUrl`. Возможно, стоит использовать `discoveredFrom` или page path вместо парсинга URL.

### Axis G — Blind spots

1. **Edge case: пустой `evidence-metadata.json`** — `leitstand.propagate` проверяет `metadata.missionId` и `metadata.commitSha` через optional chaining (`metadata.missionId && ...`). Если файл пустой (`{}`), gate пропустит проверку missionId и commitSha без ошибки. Это может быть намеренным (allow missing), но стоит задокументировать.

2. **Edge case: `study-run.json` с `findings: null`** — `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:679`. Проверка `!studyRun.findings || !Array.isArray(studyRun.findings)` обрабатывает `null`, но если `findings` — это объект, а не массив, ошибка будет менее понятной.

3. **Performance: 6s sleep в dev-deploy** — `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:509`. `sleep(6_000)` после purge остаётся. Тесты обходят это через 15s timeout, но в production это фиксированная задержка. Это pre-existing (RFC-0624), не введено этим диффом.

### Spec compliance

| Requirement from RFC-0629 | Status | Evidence |
| --- | --- | --- |
| `mission-check.ts` uses `PlaywrightEvidenceDriver` | Done | `mission-check.ts:32,416` |
| `mission-check.ts` uses `CrawleeDiscoveryExecutor` | Done | `mission-check.ts:33,399` |
| `mission-check.ts` uses `createAutomatedWebAccessibilityMethodology()` | Done | `mission-check.ts:61,495` |
| `mission-check.ts` uses `runAccessibilityInstrument` | Done | `mission-check.ts:50,488` |
| `mission-check.ts` uses `findingsForObservation` | Done | `mission-check.ts:62,496` |
| `mission-check.ts` uses `evaluateClosure` | Done | `mission-check.ts:36,502` |
| Evidence written as native capsule files | Done | `mission-check.ts:511-532` |
| `evidence-metadata.json` carries `missionId` and `commitSha` | Done | `mission-check.ts:525-532` |
| Gate passes when closure satisfied + zero high/critical | Done | `mission-check.ts:547-549` |
| `MissionCheckResult` includes `findings: { errors, warnings, total }` | Done | `mission-check.ts:80` |
| `mission.check` requires `--external-preview --base-url` | Done | `mission-check.ts:362-371` |
| `mission.check` accepts optional `--commit-sha` | Done | `mission-check.ts:373` |
| `mission-check-converter.ts` is removed | Done | git diff shows deletion |
| `@syrokomskyi/axiom-methodology` added to package.json | Done | `package.json:88` |
| `leitstand.dev-deploy` passes `--commit-sha`, no post-processing | Done | `leitstand-commands.ts:531,558` |
| `leitstand.propagate` reads `evidence-metadata.json` + `study-run.json` | Done | `leitstand-commands.ts:626-692` |
| `packages/check-runner-node/` NOT modified | Done | no files in diff |
| `build:check` passes for both packages | Done | tsc --noEmit passes |
| Existing tests updated | Done | 25 tests pass |
| AGENTS.md updated | Done | both files updated |

### Questions for the author

1. **`failResult` data.exitCode всегда 1** — `data.exitCode: 1` hardcoded, но `result.exitCode` может быть 2. Нужно ли выровнять `data.exitCode` с переданным `exitCode`?
2. **`startTime` в `failResult`** — параметр передаётся, но не используется. Убрать или использовать?
3. **`JSON.parse` без try/catch в propagate gate** — что должно произойти при повреждённом `evidence-metadata.json`? Текущее поведение: необработанный `SyntaxError`.
4. **Зависимость `site-kernel-checks` → `site-kernel-handoff`** — `resolveMissionDir` импортируется из handoff. Эта зависимость объявлена в `package.json`? Если нет, нужно ли её добавить?
