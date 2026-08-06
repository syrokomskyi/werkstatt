---
rfcId: RFC-0709
auditId: AUDIT-RFC-0709-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0709

## Verdict: Needs revision

Три находки: `commands.proposed` содержит описательную строку вместо имени команды (Axis A/C), `packagesImpacted` включает пакет, который RFC не изменяет (Axis F), и отсутствуют TypeScript-типы для поля `markers` в output format (Axis A). Все находки точечные и не блокируют концепцию.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0709 --json` вернул 0 violations.

## Axis A — Structural completeness

- **`commands.proposed` содержит описательную строку.** Frontmatter: `proposed: [rfc.validate (extended with V-NC-01)]`. Поле `proposed` должно содержать имена новых команд (e.g. `command.name`), а не описания изменений существующих. V-NC-01 — это новое правило валидации на существующей команде `rfc.validate`, которая уже перечислена в `changed`. Поле `proposed` должно быть `[]`.
- **Нет TypeScript-типов для `markers` в output format.** RFC показывает JSON-структуру поля `markers` (строки 129–142), но не определяет TypeScript-интерфейс. Раздел Design должен содержать минимальную сигнатуру типа (e.g. `interface Marker { line: number; text: string; severity: "warn" | "error" }`), чтобы реализующий агент знал точную форму данных.

## Axis B — DNA alignment

No issues. RFC имеет `kind: policy`, для которого `satisfies` не обязателен (RFC-0331). Body ссылается на DNA-54 (Forge bindings) в Architectural fit — это корректная ссылка, не требующая формального `satisfies` для policy RFC.

## Axis C — Ecosystem fit

- **`commands.proposed` нарушает command lifecycle contract.** См. Axis A — `proposed` должен содержать только новые имена команд. `rfc.validate (extended with V-NC-01)` не является именем команды. Команда `rfc.validate` уже зарегистрирована и правильно перечислена в `changed`. Поле `proposed` должно быть пустым.

## Axis D — Forward-only compliance

No issues. RFC не предлагает shim'ов, dual-path, или legacy-режимов. Rollout exemption для существующих `reviewing+` RFC — это scope-решение, не backward compatibility layer.

## Axis E — Agent-facing policy

No issues. Status gate корректный: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)". Implementation notes ссылаются на RFC-0224 (accepted→implemented transition) и требуют superseding RFC для ослабления правил. Self-authorizing language отсутствует.

## Axis F — Pragmatism

- **`packagesImpacted` включает `packages/os/site-kernel-checks` без обоснования.** RFC body не описывает никаких изменений в `packages/os/site-kernel-checks`. Все validation rules (V-01..V-32) живут в `packages/forge/os/rfc/handlers/validate-rules.ts`. Skill modifications живут в `packages/forge/skills/` (synced to `.agents/skills/`). Удалить `packages/os/site-kernel-checks` из `packagesImpacted` либо описать, какие файлы в этом пакете изменяются.

## Axis G — Blind spots

No issues. False positives рассмотрены (code blocks excluded, exact prefix matching). Edge cases покрыты (resolved marker left as comment, marker in code block). Migration path для существующих RFC описан. Performance — простой regex-скан по телу RFC, negligible cost.

## Questions for the author

1. Какие конкретно файлы в `packages/os/site-kernel-checks` изменяет этот RFC? Если ни один — удалить пакет из `packagesImpacted`.
2. Должен ли `commands.proposed` быть пустым (`[]`), учитывая что V-NC-01 — это новое правило на существующей команде (уже в `changed`)?
3. Какой TypeScript-интерфейс соответствует полю `markers` в `--json` output? Добавить минимальную сигнатуру в раздел Design.
