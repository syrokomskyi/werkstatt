---
rfcId: RFC-0769
auditId: AUDIT-RFC-0769-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0769

## Verdict: Needs revision

RFC-0769 — это хорошо структурированный программный устав, корректно ссылающийся на прецедент PBP (RFC-0398) и существующую инфраструктуру (profiles, repo-extract, kernel.config.ts). Одна находка на оси B (DNA-64 отсутствует в `satisfies[]`) и одна на оси G (неточное утверждение о статических импортах) требуют исправления перед реализацией.

## Mechanical validation (rfc.validate)

Pass — 0 нарушений. `rfc.validate --id RFC-0769 --json` возвращает `status: pass`, `violations: []`.

## Axis A — Структурная полнота

No issues. RFC явно декларирует себя как устав (prose-only) и делегирует дизайн downstream RFCs. Decision — в настоящем времени, конкретная. Alternatives considered — 4 реальные альтернативы с причинами отказа. Risks — 4 риска с митигациями. Acceptance criteria — 4 проверяемых пункта. Implementation notes — явные поведенческие правила. Rollout — последовательный волновой план с dogfooding.

## Axis B — Выравнивание по DNA

**Finding B-1: DNA-64 отсутствует в `satisfies[]`.** RFC устанавливает DNA-64 (строка 141: "DNA-64 established by this RFC"), но `satisfies[]` содержит только DNA-1 и DNA-2. Прецедент PBP charter (RFC-0398) включает свою установленную DNA-55 в `satisfies[]`. DNA-64 должна быть добавлена в `satisfies[]`.

DNA-1 и DNA-2 корректно указаны и объяснены в Architectural fit. Ссылки на DNA-46..52, DNA-53, DNA-54 в теле RFC обоснованы — эти инварианты затрагиваются downstream RFCs, не самим уставом.

## Axis C — Экосистемная совместимость

No issues. RFC корректно ссылается на:
- Три stack-профиля в `packages/forge/profiles/` (astro-typescript-turborepo, phaser-turborepo, editframe) — подтверждено.
- Прецедент repo-extract (`packages/forge/extract.config.yaml`) — подтверждено.
- Dynamic module loading в `tools/kernel.config.ts` (`moduleLoaders`) — подтверждено.
- Границы пакетов: engine в `packages/werkstatt`, plugins в `packages/werkstatt-*` — корректно.
- Нет CLI surface, нет команд, нет pipeline изменений — корректно для устава.

## Axis D — Forward-only compliance

No issues. Программный принцип 3 явно запрещает compatibility shims, re-export stubs и migrators. Retired packages удаляются после консолидации. RFC не предлагает backward compatibility layer.

## Axis E — Agent-facing policy

No issues. Status gate корректен (RFC в draft, нет self-authorizing language). Implementation notes ссылаются на правильные governance rules (RFC-0224, RFC-0330, RFC-0334). Нет NEEDS CLARIFICATION markers. Нет storage/persistence вопросов.

## Axis F — Прагматизм

No issues. Нет команд (корректно для устава). `packagesImpacted: []` и `appsImpacted: []` — корректны. `nonGoals` — 3 явных и осмысленных. Консолидация в один engine-пакет (а не ~10) — прагматичное решение, обоснованное в alternatives.

## Axis G — Слепые зоны

**Finding G-1: Неточное утверждение о статических импортах.** RFC утверждает (строка 91), что `@warpgogol/site-kernel-handoff` "statically imports Astro-specific packages (`site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-onboarding`)". Проверка исходного кода показывает: `site-kernel-astro` объявлен в `package.json` но имеет 0 source-level импортов в `packages/os/site-kernel-handoff/src/` — это фантомная зависимость. Остальные три пакета имеют реальные импорты (`site-kernel-checks` в `leitstand-commands.ts`, `codegen`/`onboarding` в test mocks). Утверждение о `site-kernel-astro` неточно и может ввести downstream RFCs в заблуждение.

Остальные риски (big-bang consolidation, repo-extract feature gaps, DNA renumbering hazard) идентифицированы корректно с митигациями.

## Questions for the author

1. Почему DNA-64 не добавлена в `satisfies[]`? Прецедент RFC-0398 включает свою DNA-55. Нужно ли добавить DNA-64 в `satisfies[]` для консистентности?
2. Утверждение о static import `site-kernel-astro` не подтверждается на уровне исходного кода (0 импортов в src/). Нужно ли исправить формулировку, чтобы избежать вводящего в заблуждение downstream RFCs, или достаточно объявления зависимости в package.json для аргумента о связанности?
3. Профиль `forge-shell.yaml` существует в `packages/forge/profiles/` но не упомянут в RFC. Это намеренное упущение (forge-shell не нуждается в engine plugin), или нужно явно отметить его?
