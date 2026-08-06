---
rfcId: RFC-0726
auditId: AUDIT-RFC-0726-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: cascade
verdict: needs-revision
---

# Audit: RFC-0726

## Verdict: Needs revision

RFC содержит множественные фактические ошибки о текущем состоянии кодовой базы: утверждает, что 4 из 5 команд уже используют `--site`, хотя ни одна из перечисленных команд не принимает `--site` в текущей реализации. RFC также ссылается на несуществующую команду `release.ready` и неполную таблицу файловых ответственностей.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0726 --json` вернул 0 нарушений.

## Axis A — Structural completeness

1. **Фактическая ошибка в "Before" примерах** (строки 92-95): CLI surface показывает `leitstand.propagate --site`, `leitstand.promote --site`, `release.prepare --site`, `release.ready --site` как текущее состояние. Но:
   - `leitstand.propagate` принимает только `--release` (флаг `--site` отсутствует, `systemId` извлекается из release manifest)
   - `leitstand.promote` принимает только `--release` (та же схема)
   - `release.prepare` принимает только `--mission` (флаг `--site` отсутствует, `systemId` извлекается из mission manifest)
   - `release.ready` не существует как зарегистрированная команда

2. **Фактическая ошибка в утверждении "no changes needed"** (строка 77): "All other commands already use `--site` — no changes needed for them." Это неверно — ни одна из перечисленных команд не использует `--site` в текущей реализации. Все они потребуют изменений.

3. **`release.ready` не существует**: Команда `release.ready` указана в `commands.changed` и в CLI примерах, но не зарегистрирована в kernel registry. Она предложена RFC-0724 (status: draft). Нельзя изменить несуществующую команду.

4. **Таблица файловых ответственностей неполна** (строки 117-121): Указаны только файлы для `leitstand.dev-deploy`. Если `release.prepare`, `leitstand.propagate`, `leitstand.promote` также нуждаются в добавлении `--site` (согласно "After" примерам), их файлы должны быть перечислены:
   - `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleasePrepare`
   - `packages/os/site-kernel-handoff/src/release/release.module.ts` — flag schema для `release.prepare`
   - `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandPropagate`, `runLeitstandPromote`

5. **Несуществующий путь**: `packages/os/site-kernel-handoff/src/command-tables/*.ts` — каталог `command-tables` не существует в исходном дереве.

## Axis B — DNA alignment

1. **`satisfies: [DNA-51]` декоративна**: DNA-51 описывает примитивы консистентности Werkstatt (locks, idempotency, atomic writes). RFC касается именования CLI флагов. Тело RFC не объясняет, как оно обеспечивает, защищает или расширяет DNA-51. Ссылка appears decorative.

## Axis C — Ecosystem fit

1. **`commands.changed` содержит несуществующую команду**: `release.ready` не зарегистрирована. RFC-0724 (draft) предлагает переименование `release.publish` → `release.ready`. RFC-0726 не может изменять команду, которая ещё не существует. Нужно либо дождаться принятия RFC-0724, либо убрать `release.ready` из области действия.

2. **AGENTS.md отсутствует в файловых ответственностях**: `packages/os/site-kernel-handoff/AGENTS.md:47` явно документирует `--system` для `leitstand.dev-deploy`. Acceptance criteria упоминают обновление AGENTS.md, но файл не указан в таблице.

3. **`docs/COMMANDS.md` отсутствует в файловых ответственностях**: `docs/COMMANDS.md:387` документирует `Flags: --system` для `leitstand.dev-deploy` и требует обновления.

4. **Зависимость от RFC-0724 не объявлена**: RFC ссылается на `release.ready` (из RFC-0724), но не объявляет зависимость в `related[]` и не объясняет последовательность реализации.

## Axis D — Forward-only compliance

No issues. Clean break, no backward compat, no alias. ✓

## Axis E — Agent-facing policy

1. **CI templates упомянуты, но не идентифицированы**: Implementation notes (строка 131) предписывают "Update all references in the same commit — code, flag schema, command table, AGENTS.md, CI templates." Однако ни один CI template не идентифицирован в файловых ответственностях. Поиск по `.github/workflows/` не обнаружил ссылок на `dev-deploy`. Либо укажите конкретные файлы, либо удалите упоминание CI templates.

## Axis F — Pragmatism

1. **Область больше, чем описано**: RFC утверждает, что нужен только rename одного флага в `leitstand.dev-deploy`, но "After" примеры показывают `--site` на 4 других командах, которые его не принимают. Если цель — унификация, все 5 команд нуждаются в изменениях. RFC недооценивает область.

2. **Неполная инвентаризация команд**: RFC не упоминает `leitstand.status`, `leitstand.rollback`, `leitstand.health` — все используют `--system` (`leitstand.module.ts:122,140,159`). Также `release.list` (`release.module.ts:84`) и `release.state.validate` (`release.module.ts:113`) используют `--system`. Заголовок RFC говорит "across all leitstand and release commands", но охвачен только `leitstand.dev-deploy`.

## Axis G — Blind spots

1. **Неполный охват команд с `--system`**: Команды `leitstand.status`, `leitstand.rollback`, `leitstand.health`, `release.list`, `release.state.validate` — все принимают `--system`. Если цель — унификация `--site` "across all leitstand and release commands", эти команды должны быть включены. RFC не упоминает ни одну из них.

2. **Нет contingency для зависимости от RFC-0724**: Если RFC-0724 будет отклонён или изменён, `commands.changed` этого RFC становится недействительным (содержит `release.ready`). Нет описания contingency.

## Questions for the author

1. Должны ли `leitstand.status`, `leitstand.rollback`, `leitstand.health`, `release.list` и `release.state.validate` также переключиться с `--system` на `--site`? Это leitstand/release команды, использующие `--system`, но не упомянутые в RFC.
2. Зависит ли этот RFC от RFC-0724 (переименование `release.publish` → `release.ready`)? Если да, следует ли объявить зависимость в `related[]` и описать последовательность? Если RFC-0724 ещё не принят, следует ли убрать `release.ready` из области действия?
3. RFC утверждает "All other commands already use `--site`", но ни одна из них не делает этого — `leitstand.propagate` и `leitstand.promote` используют `--release`, `release.prepare` использует `--mission`. Должен ли RFC быть переписан с точным описанием текущего состояния и полного объема изменений?
