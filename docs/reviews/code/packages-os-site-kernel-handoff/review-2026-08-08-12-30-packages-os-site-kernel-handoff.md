---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 83825b14^...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.test.ts
  - packages/os/site-kernel-handoff/src/bordbuch/index.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts
  - packages/os/site-kernel-handoff/src/mission/mission-open.ts
  - packages/os/site-kernel-handoff/src/mission/mission-close.ts
  - packages/os/site-kernel-handoff/src/mission/mission-abort.ts
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - packages/os/site-kernel-handoff/src/mission/mission-migrate.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-ingest.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-withdraw.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-sign.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-consent.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts
  - packages/os/site-kernel-handoff/src/nachweis/nachweis-timestamp.ts
  - packages/os/site-kernel-checks/src/bordbuch-commit-parity-lint.ts
  - packages/os/site-kernel-checks/src/tests/bordbuch-commit-parity-lint.test.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: RFC-0750 — bordbuch commit parity via appendAndCommitBordbuch helper

### Verdict: Needs revision

Дифф мигрирует 20 call sites на новые атомарные хелперы и добавляет lint-команду для enforcement. Механический пол проходит, миграция сохраняет commit messages и metadata. Найдена одна dead import и одна неточность в fixHint.

### Mechanical floor

Pass — оба пакета (`site-kernel-handoff`, `site-kernel-checks`) проходят `build:check`. `bordbuch.commit.parity.lint` проходит с 0 violations. 12 unit tests проходят.

### Axis A — Structural correctness

- **Dead import**: `passResult` импортирован в `bordbuch-commit-parity-lint.ts:24`, но не используется. Функция возвращает `diagnosticsResult` в обоих ветках (warning и fail) — `passResult` не нужна. Удалить импорт.

### Axis B — DNA alignment

No issues. DNA-46 (mission lifecycle) — bordbuch entries сохраняются для всех lifecycle events. DNA-51 (werkstatt consistency primitives) — хелпер использует `acquireLock`/`releaseLock` через `appendBordbuchEntry` (которая сама acquiring lock). DNA-48 (release discipline) — release.ready и release.rollback мигрированы корректно.

### Axis C — Ecosystem fit

No issues. Новая команда `bordbuch.commit.parity.lint` зарегистрирована в `INFRA_CONTRACTS_COMMANDS` и добавлена в `PACKAGES_CHECK_PIPELINE`. Barrel exports обновлены — `commitAndPushBordbuch` удалён, `appendAndCommitBordbuch` и `appendBatchAndCommitBordbuch` добавлены. `AGENTS.md` обновлён с правилом RFC-0750.

### Axis D — Forward-only compliance

No issues. `commitAndPushBordbuch` удалён из barrel exports без shim или dual-path. Все 20 call sites мигрированы на новый хелпер. Старый паттерн `appendBordbuchEntry` + `commitAndPushBordbuch` полностью заменён.

### Axis E — Agent-facing clarity

- **fixHint неточность**: В `bordbuch-commit-parity-lint.ts:61` fixHint говорит `"Import appendAndCommitBordbuch from ../bordbuch/bordbuch-commit-helper.ts"`. Относительный путь `../bordbuch/` предполагает, что нарушитель находится в поддиректории `src/` — это верно для `mission/`, `sternsystem/`, `release/`, `leitstand/`, `nachweis/`, но неверно для файлов в `src/bordbuch/` (где путь был бы `./bordbuch-commit-helper.ts`). Для whitelisted файлов это неактуально (они исключены), но hint вводит в заблуждение при чтении. Минорный issue — hint направляющий, не точная инструкция.

### Axis F — Pragmatism

No issues. Хелпер — минимальная обёртка над существующими `appendBordbuchEntry` + `commitAndPushBordbuch`. `appendBatchAndCommitBordbuch` — единственное место, где batch-операция имеет смысл (`nachweis.withdraw` — 2 entries в одном commit). Lint следует паттерну `runFingerprintUsageLint` — не изобретает новый паттерн.

### Axis G — Blind spots

No issues. Lint сканирует `packages/**/*.ts` и `packages/**/*.tsx` — покрывает весь исходный код. Test files исключены через `.test.` и `/tests/` фильтры. Whitelist из 3 файлов покрывает все легитимные call sites. Concurrent execution рассмотрен в RFC (lock serializes append, git add stages all dirty lines).

### Spec compliance

| Requirement from RFC-0750 | Status | Evidence |
| --- | --- | --- |
| `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch` defined | Done | `bordbuch-commit-helper.ts:45-94` |
| `commitAndPushBordbuch` removed from barrel | Done | `index.ts` — export removed, only `appendBordbuchEntry` and helpers exported |
| All 20 commands migrated | Done | `bordbuch.commit.parity.lint --mode fail` → 0 violations |
| `bordbuch.commit.parity.lint` registered and integrated | Done | `infra-contracts.ts:480-499`, `packages-check.ts:192-193` |
| `bordbuch/events.ndjson` in `BORDBUCH_PROJECTION_PATHS` | Done | `bordbuch-commit.ts` — 1 insertion |
| Lint passes with 0 violations | Done | `site-kernel run bordbuch.commit.parity.lint --mode fail` → 0 error(s) |
| AGENTS.md updated | Done | `packages/os/site-kernel-handoff/AGENTS.md:29` |
| Unit tests for helper | Done | 5 tests in `bordbuch-commit-helper.test.ts` |
| Unit tests for batch helper | Done | 2 tests in `bordbuch-commit-helper.test.ts` |
| `rfc.validate` passes | Done | `site-kernel run rfc.validate --id RFC-0750` → pass |

### Questions for the author

1. `passResult` импортирован, но не используется в `bordbuch-commit-parity-lint.ts:24` — это intentional (для будущего использования) или oversight?
2. fixHint указывает относительный путь `../bordbuch/bordbuch-commit-helper.ts` — стоит ли сделать его более generic (без относительного пути) или оставить как направляющий hint?
