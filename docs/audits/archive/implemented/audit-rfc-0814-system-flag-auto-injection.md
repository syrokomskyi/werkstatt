---
rfcId: RFC-0814
auditId: AUDIT-RFC-0814-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0814

## Verdict: Needs revision

Два критических находки в предложенном коде и acceptance criteria: (1) проверка `"--system" in command.flags` содержит баг — ключи в `command.flags` не имеют префикса `--`, поэтому инъекция никогда не сработает для команд со схемой; (2) acceptance criterion `werkstatt run dns.record.upsert --site warpgogol-com` ожидает exitCode 0, но возврат `--system` в `required: true` сломает прямое CLI-вызов без `--system`, т.к. CLI-путь (`executeKernelCommand`) не предлагает инъекцию `--system`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0814 --json` вернул exitCode 0, нарушений нет.

## Axis A — Structural completeness

- **Missing "CLI surface" subsection**: RFC не описывает точные CLI-вызовы с флагами и scope. Хотя RFC не добавляет новые команды, acceptance criterion содержит `werkstatt run dns.record.upsert --site warpgogol-com` — это CLI-вызов, который должен быть документирован в отдельном subsection.
- **Missing "Output format" subsection**: N/A для внутреннего изменения, но следует явно указать "No output format changes".

## Axis B — DNA alignment

- **`satisfies: [DNA-2]` is decorative**: RFC пишет "DNA-2 (pnpm workspace + Turborepo): No structural change." — это подтверждает, что RFC не enforces, не protects и не extends DNA-2. Связь с DNA-2 номинальная. V-24 требует непустой `satisfies` для architecture RFC, но DNA-2 — неподходящая инварианта для этого изменения. Следует найти более релевантную DNA или изменить `kind` на `policy` (не требует `satisfies`).

## Axis C — Ecosystem fit

- **`commands.changed` содержит нерегистрированное имя**: `"pipeline executor (internal)"` — это не зарегистрированная команда. `commands.changed` должен содержать имена реальных команд, поведение которых меняется. Затронутые команды: `dns.record.upsert` (флаг `system` возвращается к `required: true`), и возможно другие команды, у которых `--system` был сделан optional как workaround.
- **AGENTS.md updates не упомянуты**: RFC не указывает, нужны ли обновления в `packages/werkstatt/AGENTS.md` или других AGENTS.md файлах. Для внутреннего изменения pipeline executor это вероятно N/A, но следует явно указать.

## Axis D — Forward-only compliance

No issues. RFC удаляет workaround (optional `--system`), а не сохраняет dual-path. Forward-only.

## Axis E — Agent-facing policy

- **Status gate корректен**: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." — правильная формулировка.
- **No NEEDS CLARIFICATION markers**: Чисто.

## Axis F — Pragmatism

- **`sternsystem.sync` и `sternsystem.pin` упомянуты как примеры проблемы, но используют `--id`, не `--system`**: RFC пишет "Some workspace-scoped commands (e.g. `dns.record.upsert`, `sternsystem.sync`, `sternsystem.pin`) need the Sternsystem ID" — но `sternsystem.sync` и `sternsystem.pin` принимают флаг `--id`, а не `--system`. Предложенная инъекция `--system` не поможет этим командам. Они либо не должны быть в списке примеров, либо RFC должен также предложить инъекцию `--id` (что выходит за рамки данного RFC).

## Axis G — Blind spots

- **Критический баг в предложенном коде**: `"--system" in command.flags` — ключи в `command.flags` (`Record<string, KernelFlagSpec>`) не имеют префикса `--`. Реальные ключи: `"system"`, `"dry-run"`. Проверка `"--system" in command.flags` всегда возвращает `false` для команд со схемой, поэтому `acceptsSystem` всегда `false` и инъекция никогда не происходит для команд, у которых есть `flags`. Проверка должна быть `"system" in command.flags`. Это полностью лишает RFC эффекта — `dns.record.upsert` (имеет `flags: { system: {...} }`) не получит `--system` из pipeline.

- **Acceptance criterion противоречит предложению**: Criterion `werkstatt run dns.record.upsert --site warpgogol-com` ожидает `exitCode: 0`, но RFC предлагает вернуть `--system` в `required: true`. Прямой CLI-вызов без `--system` провалится на flag schema validation (KERNEL-FLAG-03) до того, как `execute()` достигнет fallback'а `?? context.site?.name`. CLI-путь (`executeKernelCommand` в `execute-command.ts:397-404`) инъецирует `--site`, но НЕ инъецирует `--system`. RFC предлагает инъекцию только в pipeline executor (`executePipelineForSite`), не в CLI-путь. Нужно либо: (a) также добавить инъекцию `--system` в `executeKernelCommand` для workspace commands, либо (b) оставить `--system` optional и не делать `required: true`, либо (c) изменить acceptance criterion.

- **Edge case: `--system` как boolean flag**: Если команда объявляет `system: { kind: "boolean" }`, инъекция `--system <site.name>` установит `true`, а `<site.name>` станет positional arg. Проверка `acceptsSystem` должна также проверять `kind: "string"`.

## Questions for the author

1. Почему `satisfies: [DNA-2]`? RFC явно пишет "No structural change" относительно DNA-2. Какую DNA-инварианту этот RFC реально enforces/protects/extends? Если никакую — следует ли изменить `kind` на `policy`?
2. Как acceptance criterion `werkstatt run dns.record.upsert --site warpgogol-com` (без `--system`) пройдёт, если `--system` станет `required: true`? CLI-путь не инъецирует `--system` — только pipeline делает.
3. Должна ли проверка `acceptsSystem` быть `"system" in command.flags` (без `--`), учитывая что ключи в `command.flags` не имеют `--` префикса?
