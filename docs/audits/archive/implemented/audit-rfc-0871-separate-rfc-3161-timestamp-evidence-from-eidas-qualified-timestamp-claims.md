---
rfcId: RFC-0871
auditId: AUDIT-RFC-0871-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0871

## Verdict: Needs revision

RFC-0871 решает реальную терминологическую проблему: публичный копий warpgogol-com называет RFC 3161 токены «qualifizierter Zeitstempel» / «кваліфікована мітка часу», что является юридическим утверждением eIDAS, не подтверждённым доказательствами. Однако RFC не содержит разделов Design, Rollout, Alternatives considered, Risks и Implementation notes for agents, что делает его неполным для агента-исполнителя. Также `packagesImpacted` не включает `@warpgogol/werkstatt`, хотя команды `nachweis.timestamp` и `nachweis.validate` находятся именно там.

## Mechanical validation (rfc.validate)

Pass — 0 errors, 7 warnings:

- V-13: Missing sections `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.
- V-19: `RFC-0715.amendedBy` и `RFC-0716.amendedBy` не включают RFC-0871 (требуется обновить amended RFCs при реализации).

## Axis A — Structural completeness

- **Fail**: Отсутствуют 5 обязательных разделов (Design, Rollout, Alternatives considered, Risks, Implementation notes for agents). Раздел `## Decision` частично покрывает Design, но не отделяет архитектурное решение от описания команды.
- **Fail**: `reviewers: []` — пустой список. V-25 требует хотя бы одного reviewer для перехода в `implemented`.
- **Fail**: Acceptance criteria не отмечены `[x]` — ожидаемо для `draft`, но V-26 потребует evidence-аннотаций перед stamp.
- **Pass**: Decision сформулирован в настоящем времени. CLI surface показывает точные команды. TypeScript контракты минимальны.

## Axis B — DNA alignment

- **Pass**: `satisfies: [DNA-53, DNA-59]` — оба существуют в `docs/architecture-dna.md`. DNA-53 (semantic fingerprint governance) релевантен: RFC добавляет метаданные assurance в Bordbuch, что является расширением семантической идентичности. DNA-59 (evidence preservation) релевантен: assurance metadata сохраняется в Bordbuch как append-only evidence.
- **Pass**: RFC не конфликтует с существующими DNA инвариантами. Он amend-ит RFC-0715/0716, не supersede-ит их.

## Axis C — Ecosystem fit

- **Fail**: `packagesImpacted` включает только `@warpgogol/werkstatt-site`, но команды `nachweis.timestamp` и `nachweis.validate` находятся в `packages/werkstatt/src/nachweis/` (пакет `@warpgogol/werkstatt`). RFC должен указать оба пакета: `@warpgogol/werkstatt` (kernel commands, types, Bordbuch metadata) и `@warpgogol/werkstatt-site` (UI components, public copy).
- **Pass**: Package boundaries соблюдаются — kernel команды в `werkstatt`, UI в `werkstatt-site`.
- **Pass**: `commands.changed` корректно списает `nachweis.timestamp` и `nachweis.validate`.
- **Fail**: RFC не указывает, какие `AGENTS.md` файлы требуют обновления. Минимум `packages/werkstatt/AGENTS.md` (новые флаги команды `nachweis.timestamp`) и `packages/werkstatt-site/AGENTS.md` (новые props компонентов).
- **Pass**: `appsImpacted: [warpgogol-com]` корректно — публичный копий нужно исправить.

## Axis D — Forward-only compliance

- **Pass**: RFC не предлагает compatibility shim. Legacy records проецируются как `rfc3161` — это projection rule, не dual-path.
- **Concern**: Строка 162: «A compatibility adapter MAY continue to read legacy `qualifiedTimestamp` props while migrating components». Это формально допускает dual-path для UI props. Нужно уточнить: adapter — это временный read-only projection внутри компонента, не отдельный кодовый путь. Рекомендуется переформулировать: «Components MUST accept the new `timestamp` prop shape. A read-only internal projection from legacy `qualifiedTimestamp` to the new shape is permitted within the component's rendering logic, but the legacy prop MUST NOT be exposed as a public API.»

## Axis E — Agent-facing policy

- **Pass**: Нет self-authorizing language. RFC находится в `draft` и не предоставляет разрешения на реализацию.
- **Pass**: Agent constraints (строки 177–179) — чёткие поведенческие правила: не выводить eIDAS из TSA/RFC 3161/marketing, не апгрейдить legacy, не ослаблять N3.
- **Pass**: Нет `NEEDS CLARIFICATION` markers.
- **Pass**: Storage policy — метаданные в Bordbuch (append-only), нет cookies.

## Axis F — Pragmatism

- **Pass**: Минимальный command surface — `nachweis.timestamp` получает два новых флага (`--timestamp-assurance`, `--qualification-evidence-ref`), `nachweis.validate` получает новую проверку. Новых команд нет.
- **Pass**: TypeScript типы минимальны — `TimestampAssurance` union из двух значений, `NachweisTimestampAssurance` interface с 4 полями.
- **Pass**: `nonGoals` конкретны: не заменяет TSA adapter, не реализует QES, не требует QTSP.
- **Concern**: `related: [ADR-0028, ADR-0054]` — ADR-0028 существует (`docs/adrs/archive/implemented/adr-0028-nachweisregister-as-pbp-trust-layer-extension.md`), ADR-0054 существует (`docs/adrs/adr-0054-technical-assessments-as-first-class-nachweisregister-evidence-profile.md`). Но RFC не объясняет, как именно они связаны — только декларативный список.

## Axis G — Blind spots

- **Fail**: RFC не описывает, как `nachweis.verify-signature` должен сообщать assurance class. Команда проверяет signature и timestamp presence, но не возвращает assurance metadata. Нужно ли добавить `assurance` в `NachweisVerifySignatureResult`? RFC молчит.
- **Fail**: RFC не описывает, как UI компоненты получают assurance metadata. Текущие компоненты (`nachweis-verify-component.astro`, `nachweis-detail-component.astro`) принимают `qualifiedTimestamp?: string` — просто строку. RFC предлагает новый shape `timestamp: { tokenPresent, assurance, ... }`, но не описывает, как данные попадают из Bordbuch в page block props (через `nachweis.manifest.generate`? через ручное заполнение?).
- **Pass**: Edge cases — legacy records без assurance metadata рассмотрены (проецируются как `rfc3161`).
- **Pass**: No existing hash-chain entry is mutated — явно указано в acceptance criteria.

## Questions for the author

1. Почему `packagesImpacted` не включает `@warpgogol/werkstatt`? Команды `nachweis.timestamp` и `nachweis.validate` находятся в `packages/werkstatt/src/nachweis/`, не в `werkstatt-site`.
2. Как `nachweis.verify-signature` должна сообщать assurance class? Нужно ли добавить `assurance` field в `NachweisVerifySignatureResult`?
3. Как assurance metadata попадает из Bordbuch в UI компоненты? Опиши pipeline: Bordbuch → page block props → component. Нужно ли обновить `nachweis.manifest.generate` или другой codegen?
4. Строка 162 допускает «compatibility adapter» для legacy `qualifiedTimestamp` props. Это временная мера или постоянная? Если временная — укажи срок удаления.
