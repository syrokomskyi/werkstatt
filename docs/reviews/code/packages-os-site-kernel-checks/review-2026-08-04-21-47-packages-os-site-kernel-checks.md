---
reviewId: REVIEW-CODE-2026-08-04-02
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: e2d7b8a8...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/suppressions-config.ts
  - packages/os/site-kernel-checks/src/suppressions-validate.ts
  - packages/os/site-kernel-checks/src/axiom-adapter.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/tests/suppressions-config.test.ts
  - packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - systems/axiom-suppressions.yaml
  - packages/os/site-kernel-checks/package.json
  - .gitignore
  - docs/rfcs/rfc-0684-add-axiom-finding-suppression-layer-with-per-site-config.md
---

# Code Review (re-review): e2d7b8a8...HEAD (RFC-0684 — Axiom finding suppression layer)

### Verdict: Approved

Все находки из первого ревью (REVIEW-CODE-2026-08-04-01) исправлены. Повторный ревью подтверждает: типобезопасность восстановлена через `SuppressedFinding` тип, `as never[]` касты удалены, default config не генерирует warnings, MODULE_CONTRACT содержит performance note, naming улучшен. RFC-CMD-01 violation (commands.proposed vs commands.added) исправлена.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` и `pnpm --filter @warpgogol/site-kernel-handoff run build:check` компилируются без ошибок. `pnpm --filter @warpgogol/site-kernel-checks run test` — 809 тестов passed (125 файлов). `rfc.validate --id RFC-0684` — pass.

### Axis A — Structural correctness

1. **Duplicated Code (escapeHtml)** — `escapeHtml` в `axiom-adapter.ts` остаётся 4-й копией. Pre-existing pattern across 4 files (`check-core/src/report.ts`, `site-kernel-handoff/src/bordbuch/bordbuch-generate.ts`, `ui/src/sections/markdown/prose-image-resolver.ts`). Вынесение в `@warpgogol/share` — отдельная задача, не scope этого RFC. Not a blocker.

2. **SuppressedFinding type** — Fixed. `SuppressedFinding = Finding & { suppressed?: boolean; suppressedBy?: SuppressedBy }` экспортирован из `suppressions-config.ts`. `applySuppressions` возвращает `SuppressedFinding[]`. `countSuppressedByCategory` принимает `SuppressedFinding[]`. Касты в `axiom-adapter.ts` заменены на `as unknown as Finding[]` (для JSON-parsed данных) и `SuppressedFinding` (для filtered results). Касты в `leitstand-commands.ts` удалены — `f.suppressed` доступен напрямую.

3. **Mysterious Name** — Fixed. `findingsWithSuppressions` переименован в `findingsAfterSuppression`.

### Axis B — DNA alignment

No issues. DNA-49 (трёхканальная модель) и DNA-59 (evidence preservation) соблюдены.

### Axis C — Ecosystem fit

No issues. Subpath export, command registration, pipeline placement, AGENTS.md, command manifest — всё синхронизировано. RFC-CMD-01 violation исправлена: `suppressions.validate` перемещён из `commands.proposed` в `commands.added`.

### Axis D — Forward-only compliance

No issues. No compatibility shims.

### Axis E — Agent-facing clarity

No issues. MODULE_CONTRACT и CHANGE_SUMMARY присутствуют. Performance note добавлен в `suppressions-validate.ts`.

### Axis F — Pragmatism

No issues.

### Axis G — Blind spots

1. **Performance** — Fixed. MODULE_CONTRACT в `suppressions-validate.ts` документирует cost O(N) для `collectKnownRuleIdsFromEvidence`.
2. **False positives в default config** — Fixed. `descriptionPattern: "preload"` заменён на `"preload stylesheet"`. `suppressions.validate` на default config — zero warnings.

### Spec compliance

All 13 acceptance criteria satisfied. RFC stamped as implemented.

### Questions for the author

None.
