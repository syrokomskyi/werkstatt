---
rfcId: RFC-0750
auditId: AUDIT-RFC-0750-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0750

## Вердикт: Требует доработки

RFC содержит несогласованность в подсчёте команд (15 в тексте vs 16 в таблице vs 19/20 в критериях приёмки), пропускает второй call site `appendBordbuchEntry` в `mission-close.ts:423` (evidence-skipped escape hatch) и не указывает точный pipeline-массив для интеграции lint-команды.

## Механическая валидация (rfc.validate)

Pass — 0 нарушений.

## Ось A — Структурная полнота

- **Несогласованность подсчёта команд.** Context (строка 116) утверждает «15 other commands», но таблица в Problem (строки 126–143) перечисляет 16 команд. Success signals (строка 86) и acceptance criteria (строка 326) говорят «19 migrated commands», но 4 уже коммитящих + 16 из таблицы = 20, а не 19. Проверка по коду подтверждает: 16 команд вызывают `appendBordbuchEntry` без `commitAndPushBordbuch` (`release.ready`, `release.rollback`, `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback`, `mission.materialize`, `mission.migrate`, `sternsystem.extract`, `nachweis.ingest`, `nachweis.publish`, `nachweis.withdraw`, `nachweis.sign`, `nachweis.approve`, `nachweis.consent.update`, `nachweis.public-derivative`, `nachweis.timestamp`). Итого 4 + 16 = 20 команд, а не 19.

## Ось B — Выравнивание DNA

No issues. Каждый `satisfies[]` entry — реальный DNA-инвариант:

- DNA-46: mission lifecycle events теперь коммитятся во всех командах, включая `mission.materialize` и `mission.migrate`. ✓
- DNA-48: `release.ready` и `release.rollback` bordbuch events коммитятся. ✓
- DNA-49: leitstand events коммитятся. ✓
- DNA-51: lint обеспечивает использование shared helper. ✓

## Ось C — Экосистемная совместимость

- **Pipeline placement не уточнён.** RFC говорит «Integrated into `build.check` pipeline» (строка 299), но не указывает конкретный pipeline-массив. В `packages/os/site-kernel-checks/src/pipelines/` есть `SITES_BUILD_CHECK_PIPELINE`, `PACKAGES_CHECK_PIPELINE`, `SITES_BUILD_PREPARE_PIPELINE` и др. Lint сканирует `packages/os/site-kernel-handoff/src/**/*.ts` — это workspace-scoped check, который вероятнее всего относится к `PACKAGES_CHECK_PIPELINE`. RFC должен указать точный массив.
- Package boundaries: helper в `site-kernel-handoff`, lint в `site-kernel-checks`. ✓
- AGENTS.md updates указаны в acceptance criteria (строка 330). ✓
- Command lifecycle: `commands.proposed`/`added`/`changed` внутренне согласованы. ✓

## Ось D — Forward-only compliance

No issues. `commitAndPushBordbuch` экспорт удаляется, все callers обновляются в одном проходе. No shims, no dual-paths. ✓

## Ось E — Agent-facing policy

No issues. Статус-gate соблюдён (строка 337). Нет self-authorizing language. Нет `NEEDS CLARIFICATION` markers. ✓

## Ось F — Прагматизм

No issues. `bordbuch.commit.parity.lint` следует паттерну `fingerprint.usage.lint`. `appendBatchAndCommitBordbuch` оправдан — `nachweis.withdraw` аппендит 2 записи (consent + record) перед коммитом. TypeScript contracts минимальны. ✓

## Ось G — Слепые зоны

- **Пропущенный call site в `mission-close.ts:423`.** `mission.close` имеет второй вызов `appendBordbuchEntry` (строка 423, evidence-skipped escape hatch), который НЕ следует за `commitAndPushBordbuch`. Таблица Problem (строка 129) перечисляет только `mission-close.ts:346`. Этот второй call site также требует миграции на `appendAndCommitBordbuch`, но RFC его не упоминает.
- **Batch helper: частичный сбой.** `nachweis.withdraw` аппендит 2 записи последовательно. Если первый `appendBordbuchEntry` успешен, а второй падает, первая запись остаётся на диске без коммита. RFC не описывает поведение `appendBatchAndCommitBordbuch` при частичном сбое — должен ли helper коммитить уже appended записи или откатывать?
- **Concurrent execution.** RFC упоминает lock reentrancy (строка 316), но не рассматривает сценарий: две команды (например, `nachweis.ingest` и `mission.migrate`) одновременно аппендят bordbuch entries для одного systemId. Lock `bordbuch:${systemId}` сериализует append, но `commitAndPushBordbuch` после release lock может interleaving — стоит явно отметить, что commit идёт после release lock и поэтому может коммитить записи от другой команды (что безопасно — `git add events.ndjson` захватит все dirty строки).

## Вопросы автору

1. Контекст говорит «15 other commands», таблица перечисляет 16, acceptance criteria говорит «19». Должно ли быть 16 и 20 соответственно? Проверка кода подтверждает 16 команд без `commitAndPushBordbuch`.
2. `mission-close.ts:423` (evidence-skipped escape hatch) — второй call site `appendBordbuchEntry` без последующего `commitAndPushBordbuch`. Должен ли этот call site также мигрировать на `appendAndCommitBordbuch`?
3. В какой именно pipeline-массив (`PACKAGES_CHECK_PIPELINE`, `SITES_BUILD_CHECK_PIPELINE` или оба) следует добавить `bordbuch.commit.parity.lint`?
