---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: c4b3864c...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts
  - AGENTS.md
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: c4b3864c...HEAD (RFC-0705 implementation)

### Verdict: Needs revision

Diff реализует RFC-0705 — автоматический вызов `sternsystem.sync` в `mission.reconcile` и блокирующая проверка в `mission.close`. Механический этаж проходит (build:check, rfc.validate, тесты). Найдены два структурных замечания и одно замечание clarity.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (0 errors), `rfc.validate --id RFC-0705` (0 errors), 5/5 новых тестов проходят.

### Axis A — Structural correctness

1. **Duplicated Code (mirror status gathering)** — блок mirror status gathering (originSha, mirrorSha, mirrorInSync, recommendation) перемещён из одного места в другое в `mission-close.ts`, но логика идентична коду, который уже был. Это не дублирование в строгом смысле (старый блок удалён), но логика определения `mirrorInSync` через 4-этажный if-else — кандидат на упрощение. Не блокирующее.

2. **Error handling in reconcile sync** — внешний try/catch ловит `registryError` от `readRegistry`, внутренний try/catch ловит `syncError` от `executeKernelCommand`. Это правильно: registry read может бросить, executeKernelCommand может бросить при internal error. Соответствует AGENTS.md правилу про `executeKernelCommand` (не бросает на non-zero exit, но бросает на command-not-found). Pass.

### Axis B — DNA alignment

- **DNA-46 (Mission lifecycle)** — RFC-0705 расширяет `mission.reconcile` и `mission.close`, которые перечислены как enforcers DNA-46. Изменения не нарушают lifecycle: reconcile остаётся idempotent, close остаётся terminal. Pass.
- **DNA-44 (Sternsystem bundle contract)** — RFC-0705 усиливает external mirrors как disaster-recovery sources, что соответствует DNA-44. Pass.
- **DNA-45 (Fleet registry)** — `readRegistry` + `findEntry` используется для проверки `mirrors.length > 2`. Соответствует контракту registry. Pass.

### Axis C — Ecosystem fit

- **Package boundaries** — `mission-materialization-commands.ts` импортирует `readRegistry`, `findEntry` из `../sternsystem/registry-io.ts` (внутри того же пакета). `executeKernelCommand` импортируется из `@warpgogol/site-kernel` через dynamic import. Pass.
- **AGENTS.md updates** — root AGENTS.md и packages/os/site-kernel-handoff/AGENTS.md обновлены. Pass.
- **Command lifecycle** — никаких новых команд не добавлено. `sternsystem.sync` вызывается как подкоманда через `executeKernelCommand`. Pass.

### Axis D — Forward-only compliance

- Старый mirror status блок в `mission-close.ts` удалён — не оставлен как deprecated. Pass.
- Правило в root AGENTS.md переписано с conventional ("agents MUST run it") на enforced ("mission.reconcile calls it automatically"). Pass.
- Нет compatibility shims или dual-paths. Pass.

### Axis E — Agent-facing clarity

1. **Compass scaffolding** — новый test file `rfc-0705-mirror-sync.test.ts` содержит `MODULE_CONTRACT` и `CHANGE_SUMMARY`. Pass.
2. **RFC-0705 comments** — комментарии в коде явно ссылаются на RFC-0705 и объясняют rationale ("non-fatal", "best-effort", "block before state transition"). Pass.
3. **Variable naming** — `mirrorSync`, `originSha`, `mirrorSha`, `mirrorInSync`, `recommendation` — имена раскрывают содержание. Pass.

### Axis F — Pragmatism

- **Minimal command surface** — никаких новых команд. Pass.
- **Lean contracts** — `mirrorSync` field optional в `MissionReconcileData`. Pass.
- **Existing patterns** — `executeKernelCommand` используется по аналогии с `leitstand-commands.ts` (RFC-0668). Pass.
- **Scope discipline** — diff затрагивает только reconcile и close. Pass.

### Axis G — Blind spots

1. **Performance** — `sternsystem.sync` добавляет network push (2-10 сек) к reconcile. RFC явно документирует это в Risks. Pass.
2. **False positive mirror desync** — RFC документирует случай missing mirror ref (first sync after mirror configuration). Pass.
3. **Edge case: registry read failure** — внешний catch в reconcile ловит registry read failure и пропускает sync (non-fatal). Pass.
4. **Edge case: no external mirrors** — `mirrors.length <= 2` пропускает sync call и не блокирует close. Pass.

### Spec compliance

| Requirement from RFC-0705 | Status | Evidence |
| --- | --- | --- |
| mirrorSync field in MissionReconcileData | Done | mission-materialization-commands.ts:826-830 |
| reconcile calls sternsystem.sync after push | Done | mission-materialization-commands.ts:1175-1211 |
| sync failure non-fatal (logger.warn) | Done | mission-materialization-commands.ts:1200-1204 |
| reconcile summary includes sync status | Done | mission-materialization-commands.ts:1263-1267 |
| close blocks on desync + mirrors > 2 | Done | mission-close.ts:316-322 |
| close does NOT block when no external mirrors | Done | mission-close.ts:317 |
| close error includes sternsystem.sync command | Done | mission-close.ts:320 |
| Unit tests (4 tests) | Done | rfc-0705-mirror-sync.test.ts, 5/5 pass |
| AGENTS.md updated | Done | AGENTS.md:18-19, packages/os/site-kernel-handoff/AGENTS.md:37-38 |
| rfc.validate passes | Done | 0 errors |

### Questions for the author

1. В `mission-close.ts` mirror status gathering использует `gitExec` для `rev-parse refs/mirror/${branch}`. Если branch содержит special characters (хотя kebab-case не должен), возможна ли injection через `branch`? Текущий код использует `symbolic-ref HEAD` с fallback на `"main"` — безопасно ли это?
2. В reconcile, `executeKernelCommand` вызывается без `--json` флага. Возвращает ли `sternsystem.sync` корректный `summary` при non-zero exit, или `summary` может быть undefined? Код обрабатывает это через `syncResult.summary ?? ...` fallback — достаточно ли это?
3. Тест "close with no external mirrors does not throw on mirror check" использует try/catch вместо `expect().not.toThrow()`. Это связано с тем, что close может бросить по другим причинам (evidence sync). Стоит ли добавить комментарий в тест, объясняющий этот choice?
