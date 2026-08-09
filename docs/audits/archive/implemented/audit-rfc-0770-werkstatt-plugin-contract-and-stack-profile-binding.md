---
rfcId: RFC-0770
auditId: AUDIT-RFC-0770-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0770

## Verdict: Needs revision

Два значимых нахождения требуют исправления до реализации: (1) описание привязки профиля не соответствует фактической схеме `forge.yaml` — RFC ссылается на `project.stack`, который является массивом технологий, а не идентификатором профиля; (2) `satisfies[]` содержит только DNA-1, хотя основная архитектурная связь RFC — с DNA-64, которого ещё нет в реестре.

## Mechanical validation (rfc.validate)

Pass — 0 нарушений.

## Axis A — Structural completeness

**A-1: Нет таблицы "File system responsibilities".** RFC не перечисляет конкретные пути файлов, которые он затрагивает. Для contract-RFC это отчасти допустимо — конкретные пути находятся в downstream RFC-0771/0772. Однако acceptance criterion "Root AGENTS.md documents the plugin contract" подразумевает конкретный файл (`AGENTS.md`), который должен быть назван. Также `werkstatt.plugin.validate` должен быть зарегистрирован в `tools/kernel.config.ts` — этот путь тоже стоит указать.

Остальные структурные элементы в порядке: Decision в настоящем времени, CLI surface с точными вызовами, TypeScript contracts минимальны, Output format документирован, Failure modes с exit codes, Alternatives с реальными альтернативами, Risks с hook granularity и hidden assumptions.

## Axis B — DNA alignment

**B-1 (значимое): `satisfies[]` не включает DNA-64.** RFC прямо утверждает: "DNA-64 (engine/plugin/workshop boundary, RFC-0769) — this RFC is the contract that makes the boundary enforceable" (строка 102). Однако `satisfies: [DNA-1]` содержит только DNA-1. DNA-64 ещё не добавлен в `docs/architecture-dna.md`, потому что RFC-0769 находится в статусе `draft`. RFC должен либо:
  - Добавить DNA-64 в `satisfies[]` (после принятия RFC-0769 и добавления DNA-64 в реестр), или
  - Явно задокументировать зависимость от принятия RFC-0769 как предусловия.

**B-2: DNA-1 в `satisfies[]` слабо обоснован.** DNA-1 — это граница монорепо ("shared reusable logic lives in packages/*"). RFC расширяет это, вводя границу плагина внутри packages, но механизм границы описан через DNA-64, а не DNA-1. DNA-1 больше подходит для `related[]`, чем для `satisfies[]`.

## Axis C — Ecosystem fit

**C-1 (значимое): Описание привязки профиля не соответствует фактической схеме forge.yaml.** RFC утверждает (строки 91, 157): "forge.yaml project.stack resolves to a forge stack profile id". Но в фактической схеме:
  - `project.stack` — это `z.array(z.string())` (массив технологий, например `[typescript, astro, turborepo]`), а не идентификатор профиля
  - Загрузка профиля использует отдельное поле `profile` (RFC-0643): `profile: z.string().optional()`
  - `loadForgeConfig` читает `rawData["profile"]` для поиска profile id, а не `project.stack`
  - Текущий `forge.yaml` не имеет поля `profile` — только `project.stack: [typescript, astro, turborepo]`

  RFC должен ссылаться на поле `profile`, а не на `project.stack`, либо предложить изменение механизма привязки.

**C-2: `packagesImpacted: []` при известном пакете.** RFC знает, что типы контракта попадут в engine package (`@warpgogol/werkstatt`, создаётся RFC-0772). Шаблон говорит "Leave empty if unknown" — но это не unknown, это known dependency. Следует указать `packages/werkstatt` или явно отметить зависимость от RFC-0772.

**C-3: Compass sync не адресован.** RFC предлагает новую workspace-команду и изменения в поведении `forge.doctor`. Acceptance criterion упоминает `AGENTS.md`, но не указано, какие `docs/*.xml` файлы требуют синхронизации (например, `docs/technology.xml` для plugin contract, `docs/development-plan.xml` для wave plan).

## Axis D — Forward-only compliance

No issues. RFC явно заявляет: "any contract gap found there is fixed forward (no versioned @2 unless breaking)." Нет shims, нет dual-paths, нет backward compatibility layers.

## Axis E — Agent-facing policy

No issues. Нет self-authorizing language. Implementation notes ссылаются на корректные governance rules (RFC-0224, RFC-0330, RFC-0334). NEEDS CLARIFICATION markers отсутствуют.

## Axis F — Pragmatism

**F-1: `pipelines?` field может быть спекулятивным.** `WerkstattPlugin` включает `pipelines?: Record<string, KernelPipelineStep[]>`, но RFC не объясняет, когда плагин должен вкладывать pipelines vs. когда engine ими управляет. Текущий `tools/kernel.config.ts` имеет только 2 workspace-level pipelines (`icons.generate`, `packages.check`). RFC должен обосновать необходимость этого поля или удалить его до RFC-0772, где будут известны реальные hook sites.

Остальное прагматично: одна команда (`werkstatt.plugin.validate`), минимальные типы, RFC выведен из фактического module inventory `tools/kernel.config.ts`.

## Axis G — Blind spots

**G-1: Нет оценки производительности `werkstatt.plugin.validate`.** Валидатор должен: резолвить module loaders (dynamic imports), проверять привязку профиля, верифицировать deploy adapters в `systems/registry.yaml`. Сколько file scans? Какая ожидаемая длительность?

**G-2: Путь миграции для этого workshop неясен.** RFC говорит: "`werkstatt.plugin.validate` joins `packages.check` and mission preflight once the site plugin is live." Но этот workshop сейчас не имеет плагина — `tools/kernel.config.ts` напрямую импортирует `@warpgogol/site-kernel*` модули. В какой момент wave plan-а валидатор начнёт проходить? До RFC-0776 (wave 4) валидатор упадёт с PLUGIN-01 (zero plugins) — это допустимо? RFC должен задокументировать переход.

**G-3: Edge case — отсутствие `tools/kernel.config.ts`.** RFC предполагает, что файл всегда присутствует, но новый consumer workshop может не иметь его до запуска `onboarding.scaffold`. Валидатор должен корректно обрабатывать этот случай.

## Questions for the author

1. Должен ли `satisfies[]` включать DNA-64 после принятия RFC-0769? Основное назначение RFC-0770 — обеспечение DNA-64, но заявлено только DNA-1.
2. Таблица привязки профиля говорит "forge.yaml project.stack resolves to profile id" — но фактическая forge config использует отдельное поле `profile` (RFC-0643) для загрузки профиля, а `project.stack` является массивом технологий. Следует ли RFC ссылаться на `profile` или предложить новый механизм привязки?
3. Каков путь миграции для этого workshop? `werkstatt.plugin.validate` упадёт с PLUGIN-01 сегодня (ноль плагинов). В какой момент wave plan-а он начнёт проходить?
