---
rfcId: RFC-0710
auditId: AUDIT-RFC-0710-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0710

## Verdict: Needs revision

RFC предлагает полезный механизм pre-specification exploration, но имеет несколько проблем: отсутствие TypeScript контрактов для новых команд, декоративная ссылка на DNA-54 в `satisfies[]`, и questionable choice пакета для размещения команд (`site-kernel-checks` вместо forge OS module).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0710 --json` вернул 0 violations.

## Axis A — Structural completeness

- **A1: Отсутствует секция TypeScript contracts.** RFC предлагает 3 новые команды (`exploration.list`, `exploration.show`, `exploration.archive`), но не включает минимальные type signatures для их input/output. Соседний RFC-0711 включает TypeScript contracts (`LivingSpec`, `SpecLiveMergeInput`, `SpecLiveMergeResult` и т.д.). RFC-0710 должен как минимум определить типы для `ExplorationNote`, `ExplorationListResult`, `ExplorationShowResult`, и `ExplorationArchiveResult`.

## Axis B — DNA alignment

- **B1: `satisfies: [DNA-54]` декоративна.** DNA-54 — это Forge bindings contract (canonical skill bodies must not contain hardcoded project literals). RFC-0710 просто **соблюдает** DNA-54 (skill не содержит hardcoded literals), но не **enforces, protects, or extends** его. Соответствие DNA-54 — это обязательное требование для всех forge skills, а не специфическое достижение этого RFC. DNA-54 следует переместить из `satisfies[]` в `related[]`, либо убрать вообще (поскольку все forge skills по умолчанию соблюдают DNA-54).

## Axis C — Ecosystem fit

- **C1: Не указаны AGENTS.md обновления.** Добавление нового forge skill (`fo-explore`) изменит счётчик skills в `packages/forge/AGENTS.md` (сейчас "36 fo skills + 5 shared + 3 meta = 44 skills" → 37 fo skills). RFC должен идентифицировать это изменение явно в секции Rollout или Architectural fit.

- **C2: `packages/os/site-kernel-checks` — неподходящий пакет для exploration команд.** Согласно `packages/AGENTS.md`, `site-kernel-checks` отвечает за "Content validation, Compass scaffolding inventory, and the createStandardCheckModule factory". Exploration notes — это forge-workflow артефакты (как RFCs, ADRs, plans, audits, sessions), а не content validation. Команды `exploration.list/show/archive` структурно аналогичны `rfc.list`, `adr.list`, `session.list`, `plan.archive` — все они живут в forge OS modules (`os/rfc/`, `os/adr/`, `os/session/`, `os/plan/`). Exploration команды должны быть новым forge OS module (e.g. `forgeExplorationModule` в `packages/forge/os/exploration/`), а не в `site-kernel-checks`. Это также убирает `packages/os/site-kernel-checks` из `packagesImpacted`, что уменьшает blast radius.

## Axis D — Forward-only compliance

No issues. RFC не предлагает compatibility shims, dual-paths, или deprecation grace periods. Exploration notes — новый artifact type без legacy.

## Axis E — Agent-facing policy

No issues. Status gate корректный ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes ссылаются на RFC-0224. `concern: document-only` для skill соответствует proposed file system responsibilities (только `.md` files).

## Axis F — Pragmatism

- **F1: `exploration.show` может быть флагом на `exploration.list`.** `exploration.list --id <slug>` мог бы возвращать full content одной заметки, а `exploration.list` (без `--id`) — metadata list. Однако `show` возвращает full content + frontmatter, а `list` — только metadata. Разделение оправдано разницей output shape. Minor — не blocking.

- **F2: `exploration.archive` с опциональным `--rfc <id>` — единственная команда модификации.** Это соответствует pattern `plan.archive` / `audit.archive` / `session.archive`. Good.

## Axis G — Blind spots

- **G1: Отсутствуют exit codes в failure modes.** RFC описывает behavior (e.g. "Invalid slug: rejected by `exploration.archive`"), но не указывает exit codes. Для каждой команды следует указать: exit 0 on success, exit 1 on error (slug not found, invalid slug, already archived). Это особенно важно для `exploration.archive` — возвращает ли она exit 0 или 1 при попытке архивировать уже заархивированную заметку?

- **G2: Не указано поведение при пустом `docs/explorations/`.** `exploration.list` должна вернуть пустой массив `explorations: []`. Это implied, но не задокументировано.

## Questions for the author

1. Почему команды размещены в `packages/os/site-kernel-checks`, а не в новом forge OS module (`packages/forge/os/exploration/`)? Exploration notes — это forge-workflow артефакты, аналогичные RFCs/ADRs/sessions, чьи list/show/archive команды живут в forge OS modules.

2. Какие TypeScript типы определяют contract для `exploration.list/show/archive`? RFC должен включать минимальные type signatures для input/output каждой команды.

3. Какой exit code возвращает `exploration.archive` при попытке архивировать уже заархивированную заметку — 0 (idempotent) или 1 (error)?
