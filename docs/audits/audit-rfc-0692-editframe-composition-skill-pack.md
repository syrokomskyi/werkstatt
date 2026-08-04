---
rfcId: RFC-0692
auditId: AUDIT-RFC-0692-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0692

## Verdict: Needs revision

RFC-0692 создаёт два forge-level skill'а для Editframe-проектов и обогащает AGENTS.md шаблон. Концепция верна и хорошо вписывается в экосистему, но в теле RFC есть черновой артефакт (самокоррекция в строке 118), заявка на SKILL-18 не соответствует фактическому содержанию skill'ов, и не объявлена зависимость от RFC-0691 (VIDEO-04..09), которая нужна для обогащения шаблона.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1 (строка 118):** Раздел «Invariant check» skill'а `ef-composition-review` содержит черновой артефакт: `Run ref(forge.yaml bindings.commands.validateRfc) — wait, that's for RFCs. The skill instructs the agent to run forge doctor to check all VIDEO-* invariants.` Самокоррекция «wait, that's for RFCs» должна быть удалена. Итоговая инструкция должна быть одной чистой строкой, например: `Run forge doctor to check all VIDEO-* invariants.`

- **A2:** Раздел «Output format» отсутствует — RFC не документирует `--json`-форму результатов `forge.skill.validate` и `forge.skill.list`. Эти команды уже существуют, но критерий приёмки «`forge.skill.list` includes both skills» подразумевает проверку их вывода. Minor — не блокирующее, но желательно указать ожидаемый формат вывода для теста.

## Axis B — DNA alignment

- **B1 (строка 90):** RFC заявляет: «Skills use semantic binding keys (`validate`, `produce`, `verify`) per SKILL-18». Однако примеры тел skill'ов (строки 136–139) показывают прямые CLI-команды (`forge validate`, `forge build`, `forge determinism check`), а не `ref(forge.yaml bindings.commands.validate)` ссылки. Skill'ы вообще не используют binding-key ссылки. SKILL-18 запрещает только software-specific ключи (`typecheck`, `scopedBuild`, `test`) — прямые CLI-команды forge не нарушают SKILL-18. Но заявка о «semantic binding keys» вводит в заблуждение: RFC должен либо (a) использовать `ref(forge.yaml bindings.commands.validate)` в телах skill'ов, либо (b) убрать заявку о semantic binding keys и прямо указать, что skill'ы используют forge CLI-команды напрямую.

- **B2:** `satisfies: [DNA-54]` формально корректно — DNA-54 требует отсутствия hardcoded project-specific literals в canonical skill bodies. Создаваемые skill'ы не содержат таких литералов. Но DNA-54 не является invariant, который RFC *устанавливает* или *расширяет* — он уже соблюдён. `satisfies` здесь означает «соответствует», что допустно, но не добавляет новой инвариантной силы. Это замечание не блокирующее.

## Axis C — Ecosystem fit

- **C1 (строка 147):** RFC предлагает обогатить `composition-agents.md` списком «VIDEO-01 through VIDEO-09 invariants». Однако VIDEO-04..09 определяются в RFC-0691, который находится в статусе `draft`. Если RFC-0692 будет реализован раньше RFC-0691, шаблон будет ссылаться на несуществующие инварианты. RFC указывает RFC-0691 в `related[]`, но не объявляет явную зависимость в теле. Раздел Rollout должен указать: «Обогащение шаблона VIDEO-04..09 выполняется только после реализации RFC-0691» — или, альтернативно, разбить на два этапа: (1) создание skill'ов (не зависит от RFC-0691), (2) обогащение шаблона (зависит).

- **C2:** Текущий `composition-agents.md` (35 строк) упоминает только VIDEO-01/02/03. RFC-0691 добавит VIDEO-04..09 в `editframe-html.yaml`. RFC-0692 обогащает шаблон. Два RFC изменяют один и тот же файл — `composition-agents.md` — но с разными целями. Если оба RFC реализуются параллельно, возможен merge-конфликт. Это не блокирующее, но стоит отметить в Rollout.

## Axis D — Forward-only compliance

No issues.

## Axis E — Agent-facing policy

No issues. Status gate корректен, implementation notes ссылаются на RFC-0224.

## Axis F — Pragmatism

- **F1:** Skill `ef-composition-review` имеет 5 шагов ревью (time model, accessibility, asset references, invariant check, best practices). Шаг «Invariant check» (строка 118) пересекается с шагом «Best practices» (строка 119), который также упоминает VIDEO-02. Разделение между «Run forge doctor for VIDEO-* invariants» и «Check VIDEO-02 manually» неясно — если `forge doctor` уже проверяет все VIDEO-* инварианты, зачем дублировать VIDEO-02 в best practices? Следует либо объединить, либо чётко разделить: `forge doctor` для автоматических проверок, ручная проверка для того, что не покрывают инварианты.

## Axis G — Blind spots

- **G1:** RFC не рассматривает empty-state: что должен делать `ef-composition-review`, когда в проекте нет файлов в `compositions/`? Skill должен явно обработать этот случай (сообщить «No compositions found» и завершиться), а не падать или сообщать false positives.

- **G2:** RFC не указывает, должны ли skill'ы быть включены в `forge.skill.list --json` output с пометкой профиля (например, `profile: editframe-html`). Текущая реализация `forge.skill.list` не имеет такой пометки — skill'ы просто появятся в общем списке. Это не проблема, но стоит явно указать в acceptance criteria, что проверяется только наличие skill'ов в списке, а не их привязка к профилю.

## Questions for the author

1. RFC-0691 (VIDEO-04..09) находится в статусе `draft`. Должен ли RFC-0692 объявить его prerequisite для обогащения шаблона, или обогащение можно выполнить с VIDEO-01..03 и расширить позже?
2. Тела skill'ов используют прямые CLI-команды (`forge validate`, `forge build`), а не `ref(forge.yaml bindings.commands.*)` ссылки. Это намеренно? Если да — следует убрать заявку о «semantic binding keys per SKILL-18» в разделе Architectural fit.
3. Как должна выглядеть итоговая инструкция в шаге «Invariant check» skill'а `ef-composition-review` после удаления чернового артефакта (строка 118)?
