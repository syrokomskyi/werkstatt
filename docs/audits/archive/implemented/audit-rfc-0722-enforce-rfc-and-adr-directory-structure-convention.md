---
rfcId: RFC-0722
auditId: AUDIT-RFC-0722-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0722

## Verdict: Needs revision

RFC содержит несколько находок, требующих исправления до реализации. Наиболее серьёзная: pre-commit hook как написан будет блокировать существующие non-RFC файлы в `docs/rfcs/` (`index.yaml`, `dna-trace.generated.yaml`, `plan-rfc-0665.md`) — patterns слишком узкие. Также `packagesImpacted` ошибочно включает `packages/os/site-kernel-checks`, а `docs/rfcs/draft/` уже не существует — rollout step 1 устарел.

## Mechanical validation (rfc.validate)

**Pass** — 0 violations, 0 warnings.

## Axis A — Structural completeness

- **`successSignals: []` пуст** — должен содержать проверяемые сигналы успеха (например: «pre-commit hook блокирует коммит файла в `docs/rfcs/draft/`», «`rfc.validate` выдаёт warning RFC-DIR-01 для файла в несанкционированном подкаталоге»).
- **`nonGoals: []` пуст** — должен содержать значимые nonGoals (например: «не добавляет новый OS command», «не меняет `rfc.create` поведение»).
- **Output format** не задокументирован — RFC не описывает JSON-структуру вывода для новых validation rules (RFC-DIR-01, ADR-DIR-01). Как warning выглядит в `rfc.validate --json` output? Существующая структура: `{ rfcId, file, rule, message, severity }` — RFC должен подтвердить, что новые правила используют ту же структуру.

## Axis B — DNA alignment

No issues. `satisfies: []` корректен для `kind: policy` (RFC-0331 требует `satisfies` только для `architecture` и `contract`). `related` ссылки (RFC-0367, RFC-0491, RFC-0366) релевантны.

## Axis C — Ecosystem fit

- **Compass sync не указан** — RFC меняет репозиторную структуру директорий и validation rules. Root AGENTS.md указывает синхронизировать `docs/*.xml` при изменении «repository-wide requirements, shared package contracts». RFC должен указать, какие `docs/*.xml` файлы требуют обновления (вероятно `docs/requirements.xml` и/или `docs/development-plan.xml`).
- **AGENTS.md vs `docs/policies/rfc-governance.md`** — RFC добавляет rule в `docs/policies/rfc-governance.md`, но не уточняет, нужно ли дублировать правило в root `AGENTS.md`. Root `AGENTS.md` — авторитетная инструкция система; `docs/policies/rfc-governance.md` — детальный policy файл. RFC должен явно указать, что `docs/policies/rfc-governance.md` достаточен (или что `AGENTS.md` тоже требует обновления).

## Axis D — Forward-only compliance

No issues. Нет compatibility shim, нет dual-path, нет legacy code path за флагом.

## Axis E — Agent-facing policy

No issues. Status gate корректен («Agents MAY implement code changes ONLY when this RFC has status: accepted»). Implementation notes содержат явные поведенческие правила. NEEDS CLARIFICATION markers отсутствуют.

## Axis F — Pragmatism

- **`packages/os/site-kernel-checks` ошибочно в `packagesImpacted`** — все изменения находятся в `packages/forge` (`packages/forge/os/rfc/handlers/validate-rules.ts` и `packages/forge/os/adr/handlers/validate.ts`). `packages/os/site-kernel-checks` не упоминается в file system responsibilities table и не затрагивается RFC.
- **`packagesImpacted` format** — использует filesystem paths (`packages/forge`) вместо package names (`@warpgogol/forge`), что непоследовательно с другими RFC (например RFC-0491 использует `"@wgogol/forge"`).

## Axis G — Blind spots

- **Pre-commit hook false positives для non-RFC файлов** — `case` patterns в pre-commit hook разрешают только `docs/rfcs/rfc-*.md`, `docs/rfcs/rfc-0000-template.md`, `docs/rfcs/archive/*`, `docs/rfcs/verification/*`. Существующие non-RFC файлы в корне `docs/rfcs/` будут ложно заблокированы: `index.yaml`, `dna-trace.generated.yaml`, `plan-rfc-0665.md`. Аналогично для `docs/adrs/` — hook разрешает только `adr-*.md`, но могут существовать другие файлы. Patterns нужно расширить (например `docs/rfcs/*.yaml`, `docs/rfcs/*.md` или запретить только файлы в подкаталогах кроме `archive/` и `verification/`).
- **`docs/rfcs/draft/` уже не существует** — rollout step 1 («Move the 5 files from `docs/rfcs/draft/` to `docs/rfcs/` root») устарел. Директория `draft/` отсутствует. Acceptance criterion «`docs/rfcs/draft/` directory is removed» уже выполнен. RFC должен отметить это или удалить step 1.
- **Нет pre-implementation scan** — RFC не упоминает сканирование существующих подкаталогов кроме `draft/`. Текущее сканирование подтверждает только `archive/` и `verification/` в `docs/rfcs/`, и `archive/` в `docs/adrs/` — но RFC должен явно указать, что такой scan выполнен и нарушений нет.

## Questions for the author

1. Pre-commit hook patterns блокируют существующие non-RFC файлы (`index.yaml`, `dna-trace.generated.yaml`, `plan-rfc-0665.md`) в `docs/rfcs/`. Как patterns должны быть расширены — разрешить все файлы в корне или добавить явные исключения для generated файлов?
2. Почему `packages/os/site-kernel-checks` указан в `packagesImpacted`? Все изменения находятся в `packages/forge`.
3. Какие `docs/*.xml` Compass документы требуют синхронизации после реализации этого RFC?
