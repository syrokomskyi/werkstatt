---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: HEAD (uncommitted changes in 3 files)
filesReviewed:
  - packages/werkstatt/src/mission/mission-open.ts
  - packages/werkstatt/src/mission/mission-close.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
---

# Code Review: mission lifecycle fixes (fix #1, #2, #3)

### Verdict: Needs revision

Три фикса логики жизненного цикла mission.reconcile/close/open. Механический пол проходит, но есть два содержательных замечания: (1) auto-repair bordbuch в mission.open оставляет кэш-клон грязным (некоммитнутый bordbuch), что заблокирует последующий mission.reconcile; (2) CHANGE_SUMMARY не обновлены ни в одном из трёх файлов.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` (tsc --noEmit) проходит без ошибок.

### Axis A — Structural correctness

- **A-1 (WARN)** — `mission-open.ts:93`: `REPAIRABLE_RULES` объявлен как `const` внутри тела функции `runMissionOpen`. Каждый вызов создаёт новый `Set`. Мелочь, но если функция вызывается часто — лучше вынести на уровень модуля рядом с `UNREPAIRABLE_RULES` в `bordbuch-repair.ts`.
- **A-2 (PASS)** — Strict typing: все типы корректны, `KernelCommandInput`/`KernelRuntimeContext` используются правильно. Dynamic import `@warpgogol/werkstatt/kernel` соответствует существующему паттерну в `mission-close.ts` (строки 442, 491, 541).
- **A-3 (PASS)** — Error handling: все `catch` блоки содержат контекст. Bare `catch` в `mission-materialization-commands.ts:1229` имеет комментарий-обоснование.
- **A-4 (PASS)** — No dead code, no magic numbers, no unjustified removals.

### Axis B — DNA alignment

- **DNA-51 (PASS)** — Werkstatt primitives: `mission-close.ts` использует `gitExec` (существующий helper), `resolveCacheClonePath`, `acquireLock`/`releaseLock`. `mission-open.ts` использует `executeKernelCommand` для вызова `bordbuch.repair` — соответствует паттерну вызова kernel-команд из других kernel-команд (как `sternsystem.pin` в `mission-close.ts:491`).
- **DNA-64 (PASS)** — Engine/plugin boundary: все импорты — self-imports `@warpgogol/werkstatt/kernel`. Нет stack plugin импортов.
- Остальные DNA (1, 4, 5, 6, 7, 8, 10, 23, 24, 25, 40, 42) — не применимы к этому диффу.

### Axis C — Ecosystem fit

- **C-1 (PASS)** — Package boundaries: все изменения внутри `packages/werkstatt/src/` — engine-internal. Нет cross-package импортов.
- **C-2 (PASS)** — Command lifecycle: `bordbuch.repair` вызывается через `executeKernelCommand` с правильным флагом `--system`. Проверено в `bordbuch-repair.ts:77`: `flagString(input, "system")`.
- **C-3 (PASS)** — AGENTS.md: изменения не вводят новые правила или паттерны — это bug fixes в существующих командах.
- **C-4 (PASS)** — Compass sync: изменения не затрагивают `docs/*.xml` — это не архитектурные изменения, а исправления bug'ов.

### Axis D — Forward-only compliance

- **D-1 (PASS)** — Нет compatibility shims, нет dual-paths. Фиксы изменяют существующее поведение напрямую.
- **D-2 (PASS)** — `mission.open` заменяет throw на auto-repair + throw — это изменение поведения, но не backward compat layer.

### Axis E — Agent-facing clarity

- **E-1 (FAIL)** — `CHANGE_SUMMARY` не обновлены ни в одном из трёх файлов:
  - `mission-open.ts:8-15` — нет записи про auto-repair bordbuch.
  - `mission-close.ts:8-26` — нет записи про pre-check push to origin.
  - `mission-materialization-commands.ts` — нет записи про post-merge guard для system-config/state.
  - DNA-42 требует обновления `CHANGE_SUMMARY` при изменении authored source files.
- **E-2 (PASS)** — Комментарии содержательны, объясняют why, а не what. Ссылки на RFC корректны (RFC-0583, RFC-0705).
- **E-3 (PASS)** — Переменные названы понятно: `preCheckSystemDir`, `criticalFiles`, `allRepairable`, `REPAIRABLE_RULES`.

### Axis F — Pragmatism

- **F-1 (PASS)** — Minimal command surface: нет новых команд. Фиксы расширяют существующие команды.
- **F-2 (PASS)** — Existing patterns: `mission-close.ts` уже использует `gitExec` и `resolveCacheClonePath` — новый код следует тому же паттерну. Dynamic import `executeKernelCommand` следует паттерну из `sternsystem.pin` (строка 491).
- **F-3 (PASS)** — Scope discipline: каждый фикс точечно изменяет одну точку в одном файле. Нет scope creep.

### Axis G — Blind spots

- **G-1 (FAIL)** — `mission-open.ts` auto-repair: `bordbuch.repair` пишет файл через `atomicWriteFile` но НЕ коммитит (MODULE_CONTRACT: "Do not auto-commit the repaired bordbuch — the operator must commit manually in the cache clone"). После auto-repair кэш-клон имеет некоммитнутый `bordbuch/events.ndjson`. Это заблокирует `mission.reconcile` на dirty cache clone guard (`mission-materialization-commands.ts:1031-1055`). Нужно либо коммитить после repair, либо документировать, что оператор должен закоммитить вручную.
- **G-2 (PASS)** — Concurrent execution: `bordbuch.repair` приобретает `system:${systemId}` и `bordbuch:${systemId}` locks (строки 94-95). `mission.open` вызывает repair ДО приобретения своих locks — нет deadlock risk.
- **G-3 (PASS)** — Edge cases: `preReconcileSha` null guard в reconcile (строка 1221). `config.mirrors.length > 1` guard в close (строка 280). `allRepairable` check в open — если есть mixed violations, auto-repair не вызывается.

### Spec compliance

No spec available — skipped. Фиксы основаны на проблемах из предыдущей сессии, не на формальном RFC.

### Questions for the author

1. `mission.open` auto-repair: как должен обрабатываться некоммитнутый bordbuch после repair? `bordbuch.repair` намеренно не коммитит. Должен ли `mission.open` закоммитить после repair, или оператор должен сделать это вручную перед `mission.materialize`?
2. `mission.close` pre-check push: что произойдёт, если push падает с non-fast-forward (кто-то уже пушил в bare repo)? Сейчас это non-fatal warning, но mirror sync check затем сравнит origin HEAD с mirror — не будет ли ложного "out of sync"?
3. `mission.reconcile` post-merge guard: если `git checkout preReconcileSha -- system-config.yaml` восстанавливает файл, он останется staged но некоммитнутым. Следующий `git push origin` (строка 1270) не отправит его. Нужно ли `git add` + amend merge commit, или отдельный commit?
