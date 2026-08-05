---
rfcId: RFC-0699
auditId: AUDIT-RFC-0699-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0699 — Remove forge. domain from CLI command names

## Решение: требует доработки

RFC-0699 описывает чёткое и прагматичное решение: убрать префикс `forge.` из имён команд бинарника `forge` с одновременным сохранением устаревших имён в виде предупреждений. Документ проходит `rfc.validate` без ошибок, но фронтматтер `commands` и план депрекации противоречат правилам жизненного цикла команд и forward-only подходу.

## Механическая валидация (rfc.validate)

Прошла (`status: pass`, 0 нарушений).

## Ось A — Структурная полнота

Нет замечаний. Разделы Decision, CLI surface, TypeScript contracts, File system responsibilities, Rollout, Alternatives considered, Risks и Acceptance criteria заполнены конкретным содержанием.

## Ось B — Соответствие ДНК

`satisfies[]` пуст, но RFC не устанавливает новый инвариант и не изменяет существующие. Связь с DNA-54 (Forge bindings contract) не заявлена, хотя изменение затрагивает CLI-поверхность forge. Это допустимо, но стоит упомянуть DNA-54 в `related[]` или `satisfies[]`, если обновление README/AGENTS.md коснётся навыков, использующих `ref(forge.yaml bindings...)`.

## Ось C — Соответствие экосистеме

`packagesImpacted` содержит только `packages/forge`, хотя теле RFC упоминаются `packages/forge/README.md`, `README.uk.md` и `packages/forge/skills/*/SKILL.md`. `packages/forge` покрывает все перечисленные пути, но стоит уточнить, что `AGENTS.md` и навыки — тоже в зоне изменений.

## Ось D — Forward-only соответствие

RFC-0699 вводит временный обратносовместимый слой: старые имена `forge.*` продолжают работать с предупреждением на протяжении одной minor-версии. Для forward-only экосистемы это допустимо только при явном обязательстве удалить алиасы в следующем superseding RFC до выхода следующего major. RFC называет «Phase 2 (future RFC or major)», но не связывает его с `supersededBy` и не задаёт deadline. Необходимо добавить чёткое условие: алиасы удаляются раньше либо в рамках RFC-070X, либо при bump `major`.

## Ось E — Политика для агентов

Нет замечаний. Раздел Implementation notes for agents корректно запрещает реализацию до `accepted`/`implemented` и требует `rfc.supersede.propose` при конфликтах имён.

## Ось F — Прагматизм

Фронтматтер `commands` семантически не согласован. `proposed` содержит 18 новых "команд" (`create`, `doctor`, `build` и т.д.), но по факту это алиасы к уже существующим обработчикам. `changed` содержит старые квалифицированные имена (`forge.create` и т.д.), хотя исходный код самих этих команд не меняется — меняется только `bin/cli.ts` и регистрация. Это может ввести в заблуждение `rfc.validate` и генераторы манифестов. Рекомендация: `proposed` должен содержать только алиасы, для которых добавляется новый ключ в реестре; `changed` — те команды, чей `description` или `execute` действительно изменяются, либо явно отметить, что алиасы не являются отдельными командами в `commandRegistry`.

## Ось G — Слепые пятна

Нет замечаний. RFC рассматривает коллизии с другими пространствами имён (`rfc.*`, `compass.*` и т.д.) и предусматривает `rfc.supersede.propose`.

## Вопросы к автору

1. Следует ли `commands.proposed` включать все 18 алиасов как отдельные команды, или достаточно указать единый `resolveCommandName` в `bin/cli.ts` и одну запись в `changed`?
2. Будет ли алиас `forge.*` удалён в фиксированном будущем RFC с привязкой к `supersededBy` или это остаётся на усмотрение оператора?
3. Планируется ли обновление `packages/forge/skills/*/SKILL.md` в одном коммите с реализацией, как требует раздел Implementation notes for agents?
