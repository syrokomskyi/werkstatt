---
reviewId: REVIEW-CODE-2026-08-04-02
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/axiom-adapter.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
---

# Code Review: session diff — axiom-adapter.ts + leitstand-commands.ts

### Verdict: Needs revision

Рефакторинг успешно устраняет дублирование (ручное чтение evidence-файлов и подсчёт severity), но нарушает RFC-0667 fallback chain `raw.auditId ?? raw.missionId ?? missionId` — внешний `readEvidenceFiles` не читает `missionId` из файла, а адаптер компенсирует только через параметр `missionId`, пропуская промежуточное звено. Также не обновлены `CHANGE_SUMMARY` и AGENTS.md.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks build:check` и `pnpm --filter @warpgogol/site-kernel-handoff build:check` оба проходят без ошибок. Тесты: 10/10 axiom-report, 4/4 gate-summary, 8/8 rfc-0668-resilience, 22/22 dev-deploy + evidence-sync.

### Axis A — Structural correctness

- **Duplicated Code (catch block re-reads files)** — `axiom-adapter.ts:351-376`. Catch block повторно читает и парсит `study-run.json` и `staged-capsule.json` через `readFileSync` + `JSON.parse`, чтобы определить, какой файл повреждён. Это дублирует логику `readEvidenceFiles`, которая уже читала эти файлы. Хотя это необходимо для сохранения error codes AXIOM-REPORT-02..04, паттерн "читать дважды" — это code smell. Альтернатива: расширить `readEvidenceFiles` в внешнем пакете, чтобы он возвращал имя файла, на котором упал парсинг.

- **Dead code: `metadata.auditId ?? missionId`** — `axiom-adapter.ts:424`. После конструкции на строке 380--383 `metadata.auditId` всегда строка (либо реальное значение, либо `missionId`). Оператор `??` на строке 424 никогда не сработает — `metadata.auditId` не может быть `null`/`undefined`. Это мёртвый код.

### Axis B — DNA alignment

- **FAIL: RFC-0667 fallback chain нарушена** — `axiom-adapter.ts:354-357` + `axiom-cli.ts:174`. AGENTS.md (`packages/os/site-kernel-checks/AGENTS.md`) явно требует: "Agents MUST NOT remove the fallback chain — it ensures backward compatibility with old evidence files." Оригинальный код: `auditId: raw.auditId ?? raw.missionId ?? missionId`. Внешний `readEvidenceFiles` делает только `auditId: rawMetadata.auditId ?? "unknown"` — он не читает `raw.missionId` вообще. Адаптер компенсирует: `auditId: evidence.metadata.auditId !== "unknown" ? evidence.metadata.auditId : missionId`, но это пропускает промежуточное звено `raw.missionId`. Если старый evidence-файл содержит `{ missionId: "old-name" }` без `auditId`, оригинальный код использовал бы `"old-name"`, новый код использует `missionId` параметр команды. Это нарушение DNA-инварианта и behavioral regression для backward compatibility.

### Axis C — Ecosystem fit

- **AGENTS.md не обновлён** — `packages/os/site-kernel-handoff/AGENTS.md`. Раздел Leitstand описывает `mission.check` вызов в `leitstand.dev-deploy`, но не упоминает `--no-report` flag. Добавление `--no-report` в `runMissionCheckWithResilience` (строка 196) изменяет контракт wrapper-функции — теперь она всегда подавляет генерацию `report.html`. AGENTS.md должен отметить, что `mission.check` вызывается с `--no-report`, потому что `axiom.report` вызывается отдельно на строке 1048.

- **Package boundaries** — Pass. Импорты `readEvidenceFiles` и `countFindingsBySeverity` из `@syrokomskyi/axiom-factory-app/run/axiom-cli` идут через объявленный subpath export в `package.json` внешнего пакета.

### Axis D — Forward-only compliance

No issues. Удаление дублированного кода — это forward-only рефакторинг. Старые тип-импорты (`StudyRun`, `StagedCapsule`, `ObservationBundle`) удалены, не оставлены behind a flag.

### Axis E — Agent-facing clarity

- **CHANGE_SUMMARY не обновлён** — `axiom-adapter.ts:9-13`. Модуль имеет `MODULE_CONTRACT` и `CHANGE_SUMMARY`, но текущий diff не добавляет запись о замене ручного чтения evidence-файлов на `readEvidenceFiles`/`countFindingsBySeverity`. Последняя запись — RFC-0668 Chromium pre-flight. Добавить: `<item>Replaced manual evidence file reading and severity counting with readEvidenceFiles()/countFindingsBySeverity() from external package; added --no-report to leitstand dev-deploy pipeline.</item>`

### Axis F — Pragmatism

- **`--no-report` захардкожен в wrapper** — `leitstand-commands.ts:196`. `runMissionCheckWithResilience` теперь всегда передаёт `--no-report`. Это правильно для `leitstand.dev-deploy` (где `axiom.report` вызывается отдельно), но связывает wrapper с конкретным pipeline. Если другой потребитель захочет использовать `runMissionCheckWithResilience` с report-генерацией, ему придётся дублировать wrapper. Альтернатива: добавить параметр `noReport: boolean = true` в сигнатуру функции.

### Axis G — Blind spots

- **Corrupt-file edge case: `observation-bundle.json` не проверяется явно** — `axiom-adapter.ts:371-375`. Catch block проверяет `study-run.json` и `staged-capsule.json`, затем возвращает AXIOM-REPORT-04 по исключению (если первые два валидны, значит упал `observation-bundle.json`). Это работает, но не проверяет явно третий файл. Если `readEvidenceFiles` изменит порядок чтения файлов в будущем, error code станет неверным. Комментарий "A required file exists but is corrupt — determine which one" частично скрывает это предположение.

### Spec compliance

No spec available — spec compliance skipped. RFC-0633 описывает `axiom.report`, но этот рефакторинг не является реализацией RFC-0633 (она уже реализована). Это устранение дублирования, не запрошенное RFC.

### Questions for the author

1. RFC-0667 fallback chain `raw.auditId ?? raw.missionId ?? missionId` нарушена — внешний `readEvidenceFiles` не читает `raw.missionId`. Нужно ли расширить внешний `readEvidenceFiles`, чтобы он читал `missionId` из файла, или компенсировать в адаптере, читая `evidence-metadata.json` отдельно для intermediate fallback?
2. `--no-report` захардкожен в `runMissionCheckWithResilience` — должен ли это быть параметр функции, чтобы wrapper оставался reusable для других потребителей?
3. `metadata.auditId ?? missionId` на строке 424 — это мёртвый код после конструкции на строке 380. Убрать `?? missionId` или оставить для belt-and-suspenders?
