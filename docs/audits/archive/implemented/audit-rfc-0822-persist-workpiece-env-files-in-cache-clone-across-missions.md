---
rfcId: RFC-0822
auditId: AUDIT-RFC-0822-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0822

## Verdict: Needs revision

RFC-0822 решает реальную проблему (потеря секретов между миссиями) и предлагает минимальное, архитектурно согласованное решение. Однако есть 3 находки: несоответствие формы warning в `sternsystem.validate`, неуказанная позиция шага в пайплайне `mission.close`, и пропуск замены `PUBLIC_IMAGE_PROVIDER` в контракте restore-функции.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0822 --json` вернул 0 violations.

## Axis A — Structural completeness

- **Позиция шага в `mission.close` не указана.** RFC говорит "copies all `.env*` files from the workpiece to the cache clone (untracked, not committed)" и "as a final step", но `mission.close` уже имеет несколько финальных шагов: evidence sync (строка 543–578), запись `close-report.json` (580–582), обновление state (584–588), auto-pin (595–616), `commitWerkstattSideEffects` (635–642), mirror sync (649–681), копирование `.cache/` и `.materialization-state.json` (687–846). RFC должен указать, где именно в этой последовательности выполняется копирование `.env*` — до или после state transition, до или после cache copy. Это влияет на поведение при сбое: если copy падает после state transition, миссия уже закрыта, но секреты не сохранены.

Остальные секции (Decision, CLI surface, TypeScript contracts, File system responsibilities, Output format, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes) содержат реальный контент без template-плейсхолдеров.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle):** RFC расширяет `mission.close` шагом сохранения секретов. Объяснение в теле RFC (§ Architectural fit) корректно — cache clone уже является каноническим inter-mission store.
- **DNA-47 (Materialization):** RFC заменяет код preservation (строки 1154–1196) на restore из cache clone. Объяснение в теле RFC корректно.
- **DNA-40 (Env-example contract):** RFC явно указывает "Not modified" — `.env.example` остаётся git-tracked шаблоном, `.env` остаётся gitignored. Конфликта нет.
- Конфликтов с другими DNA инвариантами не обнаружено.

## Axis C — Ecosystem fit

- **Несоответствие формы warning в `sternsystem.validate`.** RFC предлагает warning в `--json` output:
  ```json
  { "rule": "ENV-PERSIST-01", "message": "..." }
  ```
  Но существующий интерфейс `SternsystemValidateData` в `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/sternsystem/sternsystem-validate.ts:45-51` использует:
  ```ts
  warnings: Array<{ systemId: string; field: string; message: string }>;
  ```
  Ключ `field` — это имя поля (например `"owner"`), а не rule ID. RFC должен либо использовать существующую форму (`{ systemId, field: "ENV-PERSIST-01", message }`), либо явно предложить расширение интерфейса с обоснованием.

- Границы пакетов: `@warpgogol/werkstatt` — корректный пакет для всех изменений. ✓
- Command lifecycle: `commands.changed` перечисляет 3 существующие команды, `commands.added` и `commands.proposed` пусты. ✓
- AGENTS.md updates: acceptance criteria item 7 упоминает обновление AGENTS.md. ✓

## Axis D — Forward-only compliance

No issues. Старый код preservation (чтение из old workpiece path) заменяется, не дублируется. No compatibility shim, no dual-path, no flag-gated legacy path.

## Axis E — Agent-facing policy

- Status gate: RFC в `draft`, implementation notes явно требуют `accepted` перед реализацией. ✓
- Implementation notes ссылаются на корректные governance rules (RFC-0224, RFC-0334). ✓
- Anti-fabrication: нет claims о content authoring. ✓
- Storage policy: file system copy, no cookies. ✓
- NEEDS CLARIFICATION markers: не найдены. ✓

## Axis F — Pragmatism

- Минимальная command surface: нет новых команд. ✓
- Lean contracts: `EnvPersistResult` — 2 поля, минимально достаточно. ✓
- Existing patterns: следует существующему паттерну копирования `.cache/` в `mission-close.ts` (строки 725–747). ✓
- Scope discipline: `packagesImpacted` — только `@warpgogol/werkstatt`. `appsImpacted` — пусто. ✓

## Axis G — Blind spots

- **Замена `PUBLIC_IMAGE_PROVIDER=build-portable` не адресована.** Текущий код preservation в `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/mission/mission-materialize.ts:1191-1195` делает replace:
  ```ts
  envContent = envContent.replace(
    /^PUBLIC_IMAGE_PROVIDER=.*$/m,
    "PUBLIC_IMAGE_PROVIDER=build-portable",
  );
  ```
  RFC предлагает `restoreEnvFilesFromCacheClone` как "simple file copy" без этой замены. Если `.env` из cache clone уже содержит `PUBLIC_IMAGE_PROVIDER=build-portable` (потому что close копирует файл после того, как replace был применён при материализации), то проблема нет. Но если оператор вручную изменил `PUBLIC_IMAGE_PROVIDER` в `.env` во время миссии, restore принесёт это значение, а не `build-portable`. RFC должен явно указать: (a) сохраняется ли замена в новой схеме, (b) если да — где она выполняется (в `persistEnvFilesToCacheClone` при close, или в `restoreEnvFilesFromCacheClone` при materialize).

- Performance: копирование `.env*` файлов — тривиальная стоимость (несколько маленьких файлов). ✓
- False positives: ENV-PERSIST-01 на новых системах — RFC признаёт в Risks. ✓
- Concurrent execution: DNA-46 гарантирует "Only one open mission may exist per Sternsystem at a time" — конфликт невозможен. ✓
- Security: Risks section покрывает secret exposure via backup. ✓

## Questions for the author

1. В какой именно момент `mission.close` должен копировать `.env*` — до state transition (строка 429), после evidence sync, или в самом конце после копирования `.cache/`? Это влияет на поведение при сбое.
2. Должна ли замена `PUBLIC_IMAGE_PROVIDER=build-portable` сохраняться в новой схеме? Если да, в какой функции она выполняется?
3. Warning в `sternsystem.validate` должен использовать существующую форму `{ systemId, field, message }` или RFC предлагает расширить интерфейс `SternsystemValidateData` ключом `rule`?
