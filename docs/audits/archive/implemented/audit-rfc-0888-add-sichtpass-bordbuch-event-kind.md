---
rfcId: RFC-0888
auditId: AUDIT-RFC-0888-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0888

## Verdict: Needs revision

RFC-0888 содержит несколько фактических ошибок и пробелов в дизайне. Наиболее серьёзные: output format показывает `writerRole` как поле Bordbuch entry, которого нет в схеме; `bordbuch.generate` не указан в `commands.changed` несмотря на модификацию; стратегия дедупликации `--skip-bordbuch` неполна для `nachweis.withdraw`.

## Mechanical validation (rfc.validate)

Pass — 1 warning:
- **V-19** (warning): `RFC-0888.amends` includes `RFC-0473`, but `RFC-0473.amendedBy` does not include `RFC-0888`. Ожидаемо — `amendedBy` будет обновлён при реализации.

## Axis A — Structural completeness

- **A-1**: Output format (line 199) показывает `"writerRole": "nachweis"` как top-level поле Bordbuch entry. Фактическая `bordbuchEntrySchema` (`packages/werkstatt/src/schemas/mission.ts:76-91`) не содержит поля `writerRole`. Writer role передаётся как опция в `appendBordbuchEntry`, но не сохраняется в записи. Пример некорректен.
- **A-2**: `SichtpassBordbuchMetadata` interface (lines 154-163) не привязан к файлу. RFC не указывает, это новый экспортируемый тип или только документация. Если тип — нужен путь к файлу.
- **A-3**: File system responsibility для `bordbuch-generate.ts` (line 182) говорит "Include `sichtpass` events in the public Bordbuch projection timeline". Текущий `bordbuch-generate.ts` (`packages/werkstatt/src/bordbuch/bordbuch-generate.ts:143-151`) уже рендерит ALL entries в timeline без фильтрации по kind. RFC должен уточнить, какое конкретное изменение требуется (например, label для HTML-проекции).

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46]` корректно — DNA-46 (Mission lifecycle) включает Bordbuch как append-only hash-chained log. RFC объясняет, как расширяет инвариант: "Adding a new event kind extends the audit trail within the existing mission lifecycle."

## Axis C — Ecosystem fit

- **C-1**: `commands.changed` (lines 52-55) не включает `bordbuch.generate`, хотя file system responsibilities (line 182) и acceptance criteria (line 248) требуют его модификацию.
- **C-2**: RFC не указывает, какие `docs/*.xml` Compass-файлы требуют синхронизации. Добавление нового Bordbuch kind может потребовать обновления `docs/requirements.xml` (req-23 Bordbuch) или `docs/verification-plan.xml`.
- **C-3**: RFC не указывает, какие `AGENTS.md` файлы требуют обновления. `packages/werkstatt/AGENTS.md` может потребовать упоминания нового `sichtpass` kind.

## Axis D — Forward-only compliance

No issues. RFC расширяет enum напрямую, без compatibility shim. `--skip-bordbuch` — механизм дедупликации, не legacy-путь.

## Axis E — Agent-facing policy

No issues. Status gate корректен: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Self-authorizing language отсутствует. NEEDS CLARIFICATION markers не найдены.

## Axis F — Pragmatism

- **F-1**: `SichtpassBordbuchMetadata` включает `envelopeHash?` (optional), но RFC не объясняет, когда это поле присутствует или отсутствует, и как оно вычисляется. Таблица append points (lines 170-172) не упоминает `envelopeHash`. Поле выглядит спекулятивным.

## Axis G — Blind spots

- **G-1**: `nachweis.withdraw` также вызывает `nachweis.manifest.generate` (`packages/werkstatt/src/nachweis/nachweis-withdraw.ts:211-216`). RFC упоминает `--skip-bordbuch` только для `nachweis.publish`, но не для `nachweis.withdraw`. Без `--skip-bordbuch` при withdraw будут созданы две `sichtpass` записи: одна от `manifest.generate`, другая от `withdraw`. Стратегия дедупликации неполна.
- **G-2**: Флаг `--skip-bordbuch` не указан в file system responsibilities для `nachweis.module.ts` (где регистрируются флаги команд). RFC должен указать, что флаг добавляется в регистрацию команды `nachweis.manifest.generate` в `nachweis.module.ts`, но скрыт из CLI help.
- **G-3**: RFC не рассматривает случай повторного standalone-вызова `nachweis.manifest.generate` (не из publish/withdraw). Каждый вызов будет добавлять новую `sichtpass` запись. RFC говорит "standalone manifest generation gets its own entry", но не уточняет, предназначено ли это для повторных вызовов.

## Questions for the author

1. Output format показывает `writerRole` как top-level поле Bordbuch entry, но `bordbuchEntrySchema` не имеет этого поля. Нужно ли убрать его из примера, или схема должна получить новое поле?
2. `nachweis.withdraw` также вызывает `nachweis.manifest.generate` — должен ли он тоже использовать `--skip-bordbuch` для предотвращения дубликатов?
3. `bordbuch.generate` уже рендерит все events в timeline без фильтрации по kind — какое конкретное изменение требуется помимо автоматического включения?
4. Где должен жить `SichtpassBordbuchMetadata` TypeScript interface — это новый экспортируемый тип в `packages/werkstatt/src/schemas/mission.ts` или только документация?
