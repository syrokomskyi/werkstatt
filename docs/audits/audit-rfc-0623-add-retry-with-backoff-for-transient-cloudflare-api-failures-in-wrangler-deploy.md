---
rfcId: RFC-0623
auditId: AUDIT-RFC-0623-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0623

## Verdict: Needs revision

RFC корректно описывает минимальное, сфокусированное изменение — retry с backoff для `wrangler deploy` в cloudflare-workers адаптере. Архитектурно оно вписывается в DNA-49 и не нарушает forward-only. Но есть три незначительных находки: отсутствие упоминания обновления AGENTS.md, избыточные type-дублирования и неполнота Design-секции про `promote`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0623` проходит без нарушений.

## Axis A — Structural completeness

No issues. Все секции содержат реальный контент. Decision в present tense, CLI surface показывает точные команды, TypeScript contracts минимальны, file system responsibilities указывают конкретные пути, failure modes покрывают все сценарии, alternatives рассмотрены честно (4 альтернативы с причинами rejection), risks включают agent misinterpretation risk и false-positive rate, acceptance criteria проверяемые, implementation notes содержат явные поведенческие правила.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-49]` — DNA-49 (Fleet propagation) существует в `docs/architecture-dna.md:211`. RFC body объясняет, как retry усиливает propagation contract: transient 5xx от Cloudflare API не должны блокировать деплой. Это корректное "extends" отношение. `related[]` ссылки (RFC-0358, RFC-0379, RFC-0587, RFC-0608) релевантны. Конфликтов с существующими DNA инвариантами нет. Новая DNA инварианта не устанавливается.

## Axis C — Ecosystem fit

**Finding C-1:** RFC не упоминает обновление `packages/os/site-kernel-handoff/AGENTS.md`. Leitstand-секция этого AGENTS.md детально документирует поведение адаптера (health verification, preflight checks, channel model, deployment.lastPropagated). Добавление retry-логики — это новое поведение адаптера, которое должно быть отражено в AGENTS.md. RFC следует добавить запись в `packages/os/site-kernel-handoff/AGENTS.md` Leitstand-секцию, описывающую retry-поведение `wrangler deploy`.

Package boundaries корректны — изменение внутри `packages/os/site-kernel-handoff`. Pipeline placement не применим (runtime-only изменение). Command lifecycle: `commands.changed` списки `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback` — корректно, все три команды используют `adapter.propagate` или `adapter.rollback` (проверено в `leitstand-commands.ts:416,642,883`).

## Axis D — Forward-only compliance

No issues. Retry обёртывает существующий вызов — старое поведение (немедленный fail) заменяется, не сохраняется параллельно. No compatibility shim, no dual-path, no legacy code path behind a flag.

## Axis E — Agent-facing policy

No issues. Status gate корректен — RFC в `draft`, implementation notes требуют `accepted` перед реализацией. Self-authorizing language отсутствует. Ссылки на governance rules корректны (RFC-0224, RFC-0334). Anti-fabrication: все acceptance criteria — code changes, не content authoring. Storage policy не применим.

## Axis F — Pragmatism

**Finding F-1:** `WranglerDeployOptions` (RFC line 136-139) и `WranglerDeployResult` (RFC line 141-145) дублируют поля уже доступные в типе `CommandRunner` из `adapter.ts:18-22`. `CommandRunner` уже принимает `opts?: { cwd?: string; env?: Record<string, string> }` и возвращает `Promise<{ exitCode: number; stdout: string; stderr: string }>`. Новые интерфейсы избыточны — helper может использовать существующие типы напрямую. Если явные имена желательны для читаемости, следует использовать `type` aliases вместо новых `interface` деклараций.

В остальном: no new commands (helper internal), existing pattern (`fetchWithRetry`) referenced, scope discipline корректна (`packagesImpacted` и `appsImpacted` точны, `nonGoals` meaningful).

## Axis G — Blind spots

**Finding G-1:** Design-секция (RFC line 98) говорит "The helper is used in both `propagate` and `rollback`", но не упоминает `leitstand.promote`. Rollout-секция (line 190) корректно перечисляет все три команды. Поскольку `leitstand.promote` вызывает `adapter.propagate` (`leitstand-commands.ts:642`), он получает retry транзитивно. Design-секция должна явно отметить это: "The helper is used in `propagate` and `rollback` adapter methods; `leitstand.promote` benefits transitively because it calls `adapter.propagate`."

В остальном: performance (90s worst case) acknowledged в Risks. False positives stderr pattern matching discussed. Migration path документирован (existing apps automatically benefit). Security/privacy не применим.

## Questions for the author

1. Должна ли AGENTS.md Leitstand-секция (`packages/os/site-kernel-handoff/AGENTS.md`) быть обновлена с описанием retry-поведения, или это implementation detail, не требующий документирования в agent-facing guide?
2. Можно ли использовать существующие типы из `CommandRunner` вместо создания `WranglerDeployOptions` и `WranglerDeployResult` интерфейсов, чтобы избежать дублирования?
3. Нужно ли явно указать в Design-секции, что `leitstand.promote` получает retry транзитивно через `adapter.propagate`, или достаточно упоминания в Rollout-секции?
