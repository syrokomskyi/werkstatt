---
rfcId: RFC-0723
auditId: AUDIT-RFC-0723-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0723

## Verdict: Needs revision

RFC-0723 документирует изменения, которые уже реализованы в коде (post-hoc RFC), но не хватает 5 обязательных секций, `kind` должен быть `architecture` (не `policy`), отсутствуют тесты для RFC-0723-специфичных изменений, и AGENTS.md rule не добавлен. RFC нужно дополнить и привести в соответствие с governance-стандартами.

## Mechanical validation (rfc.validate)

Pass (6 warnings, 0 errors):

- V-13: Missing `## Rollout`
- V-13: Missing `## Alternatives considered`
- V-13: Missing `## Risks`
- V-13: Missing `## Acceptance criteria`
- V-13: Missing `## Implementation notes for agents`
- V-19: `amends` includes RFC-0529, but RFC-0529.amendedBy does not include RFC-0723

## Axis A — Structural completeness

1. **Missing 5 required sections** — Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes for agents. V-13 warnings подтверждают.

2. **Decision сформулирована как present tense** ("The `=(ref)` formula syntax is the only valid way...") — но код уже реализован. Для post-hoc RFC это допустимо, но Acceptance criteria должны отмечать что уже сделано с `[x]`.

3. **CLI surface отсутствует** — RFC не показывает точные команды вызова `content.references.validate` с флагами и scope.

4. **TypeScript contracts минимальны** — описано поведение `resolveFormula`, но нет сигнатур функций.

5. **File system responsibilities таблица отсутствует** — нет списка конкретных файлов.

6. **Output format не документирован** — нет `--json` shape для изменённого валидатора.

7. **Failure modes не описаны** — нет exit codes и warn-vs-fail поведения для promoted REF-04.

8. **Acceptance criteria полностью отсутствуют** — нет checkable items.

9. **Implementation notes for agents отсутствуют** — нет поведенческих правил для агентов.

## Axis B — DNA alignment

1. **`satisfies: []` пустой** — RFC меняет код (`resolveFormula`, `content.references.validate`) и устанавливает policy rule для AGENTS.md. Для `architecture` kind RFC, созданных после 2026-07-07, `--satisfies DNA-N` требуется (RFC-0331). Текущий `kind: policy` обходит это требование, но фактически RFC — architecture.

2. **DNA-4 (Canonical content in `src/content/`)** — RFC устраняет неоднозначность между literal text и references, усиливая canonical content discipline. Должно быть в `satisfies[]`.

3. **DNA-24 (Block-declarative pages)** — mixed strings с bare refs не полностью декларативны. RFC усиливает. Должно быть в `satisfies[]`.

4. **`amends: [RFC-0529]`** — RFC-0529 мигрировал на braceless syntax. RFC-0723 amendит его, добавляя `=(...)` как обязательный маркер для refs в mixed strings. Логически корректно, но V-19: `RFC-0529.amendedBy` не включает RFC-0723 — нужно добавить.

5. **`related: [RFC-0527, RFC-0570]`** — корректные ссылки. RFC-0570 ввёл `=(...)` для арифметики, RFC-0723 расширяет для string values.

## Axis C — Ecosystem fit

1. **`kind: policy` некорректен** — RFC меняет код в `packages/share/src/formula-eval.ts` и `packages/os/site-kernel-checks/src/content-references.ts`. `policy` kind предназначен для governance process rules, не для code changes. Должен быть `architecture` или `contract`.

2. **`commands.changed: [content.references.validate]`** — корректно, команда уже зарегистрирована и изменяется.

3. **`packagesImpacted`** — `@warpgogol/share` и `@warpgogol/site-kernel-checks` — корректно, оба пакета уже имеют изменения в коде.

4. **AGENTS.md rule не добавлен** — RFC декларирует rule для root `AGENTS.md` и site-level `AGENTS.md`, но проверка показывает, что rule в AGENTS.md отсутствует. Это implementation gap.

5. **Compass sync** — RFC не указывает какие `docs/*.xml` файлы нужно синхронизировать. `docs/source-markup.xml` может потребовать обновления.

6. **Pipeline placement** — RFC не указывает в каком pipeline работает `content.references.validate` (sites-check-author). Для promoted REF-04 (error vs warning) это важно — блокирующий или advisory check.

## Axis D — Forward-only compliance

1. **Совместимость** — `=(ref)` syntax для string values — backward-compatible расширение. Существующие `=(...)` arithmetic formulas продолжают работать. Pure refs без `=(...)` остаются валидными. Нет conflict.

2. **REF-04 promotion (warning → error)** — это breaking change для существующего контента. RFC упоминает "315 instances across 22 files" в migration, но не описывает migration window или grace period. Forward-only discipline требует removal в том же RFC wave, но 315 instances — это значительный migration effort.

3. **Нет dual-path** — RFC не предлагает compatibility shim. Good.

## Axis E — Agent-facing policy

1. **Self-authorizing language отсутствует** — RFC не содержит "may proceed while draft". Good.

2. **Implementation notes отсутствуют** — нет ссылок на governance rules (RFC-0224 transition, RFC-0334 supersede escalation).

3. **Anti-fabrication** — RFC не утверждает auto-generation контента. Migration mechanical, но требует human review.

4. **NEEDS CLARIFICATION markers** — не найдены. Good.

5. **AGENTS.md rule** — текст rule приведён в RFC, но не добавлен в фактический AGENTS.md. Это implementation gap, не finding в самом RFC тексте.

## Axis F — Pragmatism

1. **Minimal command surface** — RFC не добавляет новые команды, только изменяет `content.references.validate`. Good.

2. **Lean contracts** — изменения в `resolveFormula` минимальны: single-ref string return. Good.

3. **Existing patterns** — RFC расширяет существующий `=(...)` syntax из RFC-0570, не вводит новый. Good.

4. **Scope discipline** — `appsImpacted: []` пустой, но migration указывает "22 files in warpgogol-com". Должен быть `appsImpacted: [warpgogol-com]` или объяснение почему пустой.

5. **`nonGoals`** — корректные: pure refs unchanged, no brace syntax reintroduction.

## Axis G — Blind spots

1. **Performance** — RFC не указывает cost validator change. `isInsideFormula` check — O(n) per line, negligible. Но не документировано.

2. **False positives** — RFC не оценивает false-positive rate для promoted REF-04. Patterns, не matching any known collection, остаются warnings — это mitigation, но не описано в RFC.

3. **Edge cases** — RFC не рассматривает:
   - Empty mixed strings (just `=(ref)`)
   - Multiple refs in one mixed string
   - Nested `=(...)` expressions
   - `=(ref)` в YAML frontmatter vs markdown body

4. **Migration path** — "315 instances across 22 files" упомянуто, но нет описания migration tooling. Существует ли `content.formula.migrate` для этого случая, или нужна ручная конвертация?

5. **Тесты отсутствуют** — в `packages/share/src/tests/formula-eval.test.ts` нет тестов для single-ref string return (RFC-0723 extension). В `packages/os/site-kernel-checks` нет тестов для `isInsideFormula` logic. Код реализован, тесты — нет.

## Questions for the author

1. Почему `kind: policy`, а не `architecture`? RFC меняет код в двух пакетах и устанавливает DNA-связанные invariant. `policy` kind не требует `--satisfies DNA-N`, но фактически RFC — architecture.

2. Какой migration tooling используется для конвертации 315 instances? `content.formula.migrate` из RFC-0570 детектирует hardcoded arithmetic, а не bare refs в mixed strings. Нужен ли новый migrator?

3. REF-04 promotion (warning → error) — это breaking change для 22 файлов. Будет ли grace period, или migration происходит в той же RFC wave? Forward-only discipline требует clarification.
