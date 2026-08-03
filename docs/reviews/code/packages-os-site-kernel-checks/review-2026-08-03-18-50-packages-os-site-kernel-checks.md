---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: HEAD (uncommitted)
filesReviewed:
  - packages/os/site-kernel-checks/package.json
  - packages/os/site-kernel-checks/src/axiom-adapter.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-checks/src/methodologies-config.ts
  - packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts
  - packages/os/site-kernel-checks/src/tests/axiom-report-gate-summary.test.ts
  - packages/os/site-kernel-checks/src/tests/axiom-report.test.ts
  - packages/os/site-kernel-checks/src/tests/mission-check-rfc-0650.test.ts
  - packages/os/site-kernel-checks/src/tests/mission-check.test.ts
  - packages/os/site-kernel-checks/src/tests/playwright-chromium-ensure.test.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
---

# Code Review: Axiom integration migration — legacy mission-check.ts + axiom-report.ts → thin axiom-adapter.ts

### Verdict: Needs revision

Дифф удаляет ~1600 строк дублированной Axiom-логики и заменяет её тонким адаптером, делегирующим в `@syrokomskyi/axiom-factory-app`. Механический пол (typecheck + 47 тестов) проходит чисто. Однако обнаружены: stale AGENTS.md, `null as unknown as` для обязательных полей, потеря `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` обработки, и orphaned зависимости от старых axiom-пакетов.

### Mechanical floor

**Pass.** `pnpm --filter @warpgogol/site-kernel-checks build:check` — exit 0. `pnpm --filter @warpgogol/site-kernel-handoff build:check` — exit 0. 47/47 тестов проходят.

### Axis A — Structural correctness

- **`null as unknown as` для обязательных полей** — `axiom-adapter.ts:133-134, 262-263` использует `null as unknown as StagedCapsule` и `null as unknown as StudyRun` для полей `MissionCheckResult`, которые объявлены как обязательные (`capsule: StagedCapsule`, `studyRun: StudyRun`). Адаптер не получает эти значения из `AxiomCheckResult` — они остаются `null` во всех runtime-случаях. Это не безопасный каст, а скрытый contract violation: любой downstream-потребитель, обращающийся к `result.data.capsule`, получит `null` и упадёт. Либо сделать поля optional (`capsule?: StagedCapsule`), либо удалить их из `MissionCheckResult` — `AxiomCheckResult` их не содержит.
- **`_workspaceRoot` в `ensureChromium`** — `playwright-chromium-ensure.ts:29` помечает параметр как неиспользуемый (`_workspaceRoot`), но `preflightChromium` из axiom-factory-app может нуждаться в workspace root для определения cwd установки. Если `preflightChromium` внутренне использует `process.cwd()`, это работает только при вызове из правильной директории. Стоит проверить, не нужно ли передать `workspaceRoot` в `preflightChromium`.
- **Duplicated Code** — `axiom-adapter.ts` содержит `missionCheckFailResult` и `axiomReportFailResult` — две функции с идентичной структурой (создание fail-объекта с пустыми полями). Можно вынести в общий `makeFailResult(command, exitCode, summary)`.

### Axis B — DNA alignment

- **DNA-42 (Compass markup contract)** — `axiom-adapter.ts` содержит `MODULE_CONTRACT` и `CHANGE_SUMMARY` — соответствует. `playwright-chromium-ensure.ts` обновил `MODULE_CONTRACT` — соответствует.
- **DNA-49 (Fleet propagation / Leitstand)** — `leitstand-commands.ts` использует `isBlockingFinding` из `@syrokomskyi/axiom-factory-app/run/report` и `Finding` из `@syrokomskyi/axiom-study` — соответствует контракту Axiom gate.
- **DNA-59 (Evidence preservation)** — адаптер делегирует запись evidence files в `runAxiomCheck`, что соответствует — Werkstatt больше не дублирует evidence writing logic.

### Axis C — Ecosystem fit

- **AGENTS.md не обновлён** — `packages/os/site-kernel-checks/AGENTS.md:23-24` всё ещё описывает `src/mission-check.ts` и `src/axiom-report.ts` как существующие модули с подробным описанием их внутренней логики (PlaywrightEvidenceDriver, CrawleeDiscoveryExecutor, и т.д.). Эти файлы удалены. AGENTS.md должен описывать `src/axiom-adapter.ts` вместо них. Это **нарушение** — stale documentation вводит агентов в заблуждение.
- **`package.json` exports** — `site-kernel-checks/package.json` не имеет subpath export для `./axiom-adapter`, но `index.ts` реэкспортирует из него. Это работает (через barrel), но если downstream-потребители будут импортировать напрямую (`@warpgogol/site-kernel-checks/axiom-adapter`), им нужен subpath export. Пока не критично — все импорты идут через barrel.
- **Orphaned dependencies** — `site-kernel-checks/package.json` всё ещё содержит `@syrokomskyi/axiom-capture`, `@syrokomskyi/axiom-contracts`, `@syrokomskyi/axiom-methodology`, `@syrokomskyi/axiom-provenance` в devDependencies. После миграции эти пакеты не импортируются ни в `axiom-adapter.ts`, ни в `playwright-chromium-ensure.ts`, ни в `methodologies-config.ts`. Они могут быть нужны для других файлов в пакете — стоит проверить и удалить если не нужны.

### Axis D — Forward-only compliance

- **Legacy files удалены** — `mission-check.ts` (440 строк) и `axiom-report.ts` (594 строк) удалены полностью. Нет shim-слоёв, нет dual-paths, нет feature flags. Соответствует.
- **`isBlockingFinding` — чистая миграция** — локальная реализация удалена, re-export идёт из Axiom CLI. Нет параллельной интерпретации. Соответствует.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` — потеря обработки** — старый `ensureChromium` проверял `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` и бросал информативную ошибку с инструкцией. Новый `ensureChromium` делегирует в `preflightChromium`, который **сам** проверяет этот env var (строка 318 в axiom-cli.ts). Это не нарушение forward-only, но стоит убедиться, что сообщение об ошибке из `preflightChromium` достаточно информативно для операторов Werkstatt.

### Axis E — Agent-facing clarity

- **`axiom-adapter.ts` MODULE_CONTRACT** — `<purpose>` ≥ 10 слов, есть `<non-goals>` — соответствует DNA-42.
- **Комментарии** — `methodologies-config.ts:113-114` содержит комментарий, объясняющий re-export. Это полезно для агентов.
- **`playwright-chromium-ensure.ts`** — JSDoc-комментарии удалены вместе с логикой. `ensureChromium` теперь не имеет docstring. Стоит добавить краткое описание: "Launches Chromium to verify; delegates to preflightChromium for auto-install."

### Axis F — Pragmatism

- **Минимальная command surface** — адаптер не вводит новых команд, только перераспределяет существующие. Соответствует.
- **Lean contracts** — `MissionCheckResult` и `AxiomReportData` — минимально необходимые типы. Но `capsule` и `studyRun` поля в `MissionCheckResult` не используются (см. Axis A).
- **Existing patterns** — адаптер следует существующему pattern'у kernel command handler'ов (input → context → result). Соответствует.

### Axis G — Blind spots

- **Edge case: empty evidence dir** — `runAxiomReport` проверяет `existsSync(evidenceDir)` и возвращает AXIOM-REPORT-01. Но `runMissionCheck` не проверяет, что `runAxiomCheck` действительно записал evidence files — если `runAxiomCheck` вернёт success, но не запишет файлы, последующий `runAxiomReport` упадёт с AXIOM-REPORT-02. Стоит ли адаптеру проверять наличие evidence files после `runAxiomCheck`?
- **Migration path** — существующие mission workpieces с evidence от старого `mission-check.ts` остаются читаемыми — формат evidence files не изменился (адаптер делегирует в тот же Axiom CLI). Соответствует.
- **Performance** — `runAxiomCheck` вызывается с `report: true` — адаптер всегда запрашивает генерацию report.html. Если downstream вызывает `axiom.report` отдельно, это двойная генерация. Стоит ли сделать `report` flag опциональным?

### Spec compliance

No spec available — spec compliance skipped. Нет RFC, описывающего эту миграцию. Если миграция является частью RFC, его номер не указан в диффе или commit messages.

### Questions for the author

1. Почему `MissionCheckResult` содержит поля `capsule` и `studyRun`, если адаптер всегда заполняет их `null as unknown as`? Если downstream-потребителям нужны эти значения, как они их получат из `AxiomCheckResult`, который их не содержит?
2. `AGENTS.md` для `site-kernel-checks` всё ещё описывает `src/mission-check.ts` и `src/axiom-report.ts` — когда будет обновлён?
3. Зависимости `@syrokomskyi/axiom-capture`, `@syrokomskyi/axiom-contracts`, `@syrokomskyi/axiom-methodology`, `@syrokomskyi/axiom-provenance` всё ещё в `devDependencies` — они используются другими файлами в пакете, или это orphaned dependencies от старой реализации?
