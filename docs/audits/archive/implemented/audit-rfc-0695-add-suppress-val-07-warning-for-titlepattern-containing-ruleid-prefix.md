---
rfcId: RFC-0695
auditId: AUDIT-RFC-0695-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0695

## Verdict: Needs revision

RFC корректно решает узкую задачу — предупреждение об избыточном `titlePattern`, содержащем `ruleId`. Однако файловая ответственность по `content-surface.ts` не соответствует существующему паттерну: ни одно из правил SUPPRESS-VAL-01..06 не зарегистрировано в diagnostics rules registry. Также пропущено обновление `infra-contracts.ts` — командная таблица содержит строковое перечисление диагностик SUPPRESS-VAL-01..06, которое нужно расширить.

## Mechanical validation (rfc.validate)

Pass с одним warning:

- **V-19:** `RFC-0695.amends` включает RFC-0688, но `RFC-0688.amendedBy` не включает RFC-0695. Бидирекциональная связь отсутствует. Should be fixed during enhance.

## Axis A — Structural completeness

- **Decision** — present tense, одно решение. OK.
- **CLI surface** — точная команда `pnpm exec werkstatt run suppressions.validate --json`. OK.
- **TypeScript contracts** — минимальная сигнатура `titlePatternContainsRuleId`. OK.
- **File system responsibilities** — см. Axis C (расхождение с `content-surface.ts`).
- **Output format** — JSON-пример корректен и соответствует формату `CheckResult`.
- **Failure modes** — warning, не error. OK.
- **Rollout** — описано поведение, backward compatibility, отсутствие миграции. OK.
- **Alternatives considered** — три реальные альтернативы с причинами отказа. OK.
- **Risks** — false positives для коротких ruleIds, agent confusion. OK.
- **Acceptance criteria** — 6 пунктов, все проверяемые. OK.
- **Implementation notes** — конкретные поведенческие правила. OK.

## Axis B — DNA alignment

- `satisfies: []` — для `kind: command` RFC `--satisfies` не требуется (RFC-0331). OK.
- RFC не устанавливает новый DNA-инвариант. OK.
- `amends: [RFC-0688]` — корректно ссылается на RFC, добавивший `titlePattern`. OK.

## Axis C — Ecosystem fit

- **Расхождение `content-surface.ts`:** RFC указывает `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` в File system responsibilities как "Modified: register SUPPRESS-VAL-07 diagnostic rule". Однако **ни одно из существующих правил SUPPRESS-VAL-01..06 не зарегистрировано** в `content-surface.ts` или любом другом файле в `diagnostics/rules/`. SUPPRESS-VAL rules существуют только в исходнике `suppressions-validate.ts` и в строковом описании в `infra-contracts.ts`. Регистрация SUPPRESS-VAL-07 в `content-surface.ts` создаст прецедент, несовместимый с существующим паттерном. Нужно либо убрать `content-surface.ts` из списка, либо также зарегистрировать все SUPPRESS-VAL-01..06 (что выходит за рамки этого RFC).
- **Пропущено `infra-contracts.ts`:** Командная таблица в `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:437-439` содержит строковое перечисление: `"Diagnostics: SUPPRESS-VAL-01 ... SUPPRESS-VAL-06 (messagePattern/descriptionPattern without titlePattern, warning)."`. Это описание нужно обновить, добавив SUPPRESS-VAL-07. RFC не упоминает этот файл в File system responsibilities.
- **Package boundaries** — `@warpgogol/site-kernel-checks` указан корректно. OK.
- **Command lifecycle** — `commands.changed: [suppressions.validate]` корректно. OK.

## Axis D — Forward-only compliance

- RFC не предлагает compatibility shim или dual-path. OK.
- `amends` изменяет контракт RFC-0688 напрямую (добавляет диагностик). OK.
- Нет legacy code paths за флагом. OK.

## Axis E — Agent-facing policy

- **Status gate** — RFC в `draft`, нет self-authorizing language. OK.
- **Implementation notes** — ссылаются на RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). OK.
- **Anti-fabrication** — критерии проверяемые (код + валидация). OK.
- **Storage policy** — не применимо. OK.

## Axis F — Pragmatism

- **Минимальная command surface** — не добавляет новых команд, расширяет существующую. OK.
- **Lean contracts** — `titlePatternContainsRuleId` — 3 строки. OK.
- **Existing patterns** — функция следует стилю существующих проверок в `suppressions-validate.ts`. OK.
- **Scope discipline** — `packagesImpacted` и `appsImpacted` корректны. OK.

## Axis G — Blind spots

- **Performance** — проверка O(N) по правилам, N < 20. Тривиальная стоимость. OK.
- **False positives** — RFC обсуждает риск для коротких ruleIds и приводит mitigation (dotted names). Разумно, но не указан ожидаемый false-positive rate.
- **Edge cases** — RFC рассматривает случай, когда ruleId является подстрокой descriptive text (например `"error"` в `"error handling guide"`). Корректно отмечено как маловероятное для dotted ruleIds. OK.
- **Migration path** — не требуется, существующие правила не триггерят warning. OK.

## Questions for the author

1. Должен ли `content-surface.ts` быть в File system responsibilities? Ни одно существующее правило SUPPRESS-VAL-01..06 не зарегистрировано в diagnostics rules registry. Если регистрация нужна, стоит ли зарегистрировать все SUPPRESS-VAL rules в отдельном RFC?
2. Нужно ли обновить строковое перечисление диагностик в `infra-contracts.ts:437-439`, добавив SUPPRESS-VAL-07? Этот файл не упомянут в File system responsibilities.
3. Когда будет исправлена V-19 (amendedBy bidirectional link) — на этапе enhance или перед accept?
