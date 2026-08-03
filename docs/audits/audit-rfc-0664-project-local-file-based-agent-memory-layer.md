---
rfcId: RFC-0664
auditId: AUDIT-RFC-0664-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0664

## Вердикт: Требует доработки

RFC предлагает архитектурно обоснованное решение реальной проблемы (непортативность Context-инсайтов в tool-specific Memory DB), но имеет два серьёзных пробела: (1) предлагаемый путь `.agents/memory/` конфликтует с действующим правилом root AGENTS.md и ограничением `fo-session-retro` — «`.agents/**` is reference/historical only»; (2) `forge.agents.generate` меняет поведение (добавляет session-start read rule в generated AGENTS.md), но отсутствует в `commands.changed`. Оба находки требуют исправления до реализации.

## Механическая валидация (rfc.validate)

Pass — нарушений нет.

## Ось A — Структурная полнота

- **Failure modes не указывают exit codes.** Раздел описывает сценарии (hand-edited MEMORY.md, concurrent writes, deliberate gitignore removal), но не указывает явно warn-vs-fail поведение для `forge.doctor`. Из контекста следует, что budget warning — это warn (не fail), но явного указания exit code нет. RFC-0661, на который ссылается этот RFC, указывает «warnings never change the exit code» явно — здесь этого нет.

## Ось B — Выравнивание с DNA

- **Budget 4096 для MEMORY.md заимствует «RFC-0661 semantics», но не уточняет механизм.** RFC-0661 определяет `resolveKnowledgeBudgets` для skill knowledge (L0/L1/L2) через `bindings.knowledge.budgets.hot`. RFC-0664 использует то же число (4096) для project memory, но не уточняет: это отдельный budget со своим override-ключом в `forge.yaml`, или переиспользование `bindings.knowledge.budgets.hot`? При реализации это вызовет неоднозначность — нужно ли добавлять `bindings.memory.budget` или переиспользовать существующий ключ. RFC должен явно объявить новый binding key (например, `bindings.memory.budget`) или сослаться на переиспользуемый.

## Ось C — Экосистемная совместимость

- **`forge.agents.generate` отсутствует в `commands.changed`.** Rollout (строка 245) явно говорит: «AGENTS.md read rule (via `forge.agents.generate` template for generated files; hand-written note for this monorepo)». Это означает, что `forge.agents.generate` меняет вывод — добавляет session-start read rule в generated AGENTS.md. Команда зарегистрирована в `forgeCoreModule` и её поведение меняется, но она не перечислена в `commands.changed`. Это нарушение RFC-CMD-02: изменённая команда должна быть объявлена.

- **Конфликт с конвенцией `.agents/**`.** Root AGENTS.md (строка 99) устанавливает: «Keep `.agents/**` as reference or historical documentation, not as the primary active instruction layer.» `fo-session-retro` (строки 147, 280) повторяет: «`.agents/**` is reference/historical only per root AGENTS.md.» RFC-0664 предлагает `.agents/memory/` как активный, часто записываемый каталог — это не reference и не historical. RFC не адресует этот конфликт: не предлагает amend root AGENTS.md, не уточняет, что `.agents/skills/` и `.agents/operator-profile.md` уже являются активными исключениями, и не объясняет, почему memory layer вписывается в существующее правило. Нужно либо явно amend root AGENTS.md и `fo-session-retro` constraint, либо выбрать другой путь.

## Ось D — Forward-only compliance

No issues. Memory DB становится optional mirror (не parallel path); files — единственный source of truth. Исторические Memory DB entries не мигрируются, но и не поддерживается legacy path — новый контент идёт только в файлы.

## Ось E — Agent-facing policy

- **RFC затрагивает agent surface, но implementation notes не ссылаются на соответствующий RFC.** RFC добавляет session-start read rule в AGENTS.md (загружается в system prompt каждого агента) — это agent surface change. Implementation notes ссылаются на RFC-0224, RFC-0330, RFC-0334, но не на RFC, управляющий agent surface / behavioral layer (RFC-0548 Core behavioral layer). Нужно добавить ссылку или обосновать, почему agent surface RFC здесь не применим.

## Ось F — Прагматизм

No issues. No new commands — переиспользуются `forge.create`, `forge.upgrade`, `forge.doctor`. TypeScript contracts минимальны. `packagesImpacted: [forge]` корректен. NonGoals осмысленны и конкретны.

## Ось G — Слепые зоны

- **Redaction для daily logs не адресован.** RFC говорит: «daily logs accept direct appends» от любого агента (строка 141, 282). `fo-session-retro` имеет redaction discipline, но RFC явно разрешает любому агенту append в daily logs без упоминания redaction. Если агент записывает API key или пароль в daily log, это останется в локальном файле. RFC должен либо явно распространить redaction discipline на daily log appends, либо указать, что daily logs — private local-only и redaction не требуется (но тогда стоит упомянуть риск).

- **Concurrent writes dismissed too quickly.** «last-write-wins on append is the accepted risk at human scale; entries are bullets, conflicts merge cleanly in practice» (строка 241). True concurrent appends (не sequential) могут потерять entries целиком, не просто «merge cleanly». RFC должен уточнить: речь о последовательных appends в течение дня (реальный сценарий) или о буквально одновременных записях (крайне редкий случай). Для первого случая last-write-wins корректен; для второго — стоит упомянуть, что риск потери entry принят потому, что daily logs — warm stream (не source of truth) и MEMORY.md — curated.

## Вопросы автору

1. Почему `forge.agents.generate` не перечислен в `commands.changed`, хотя rollout явно описывает изменение его вывода (session-start read rule в generated AGENTS.md)?
2. Как RFC-0664 совместим с правилом root AGENTS.md «Keep `.agents/**` as reference or historical documentation» и ограничением `fo-session-retro` «`.agents/**` is reference/historical only»? Нужен ли amend root AGENTS.md?
3. Budget 4096 для MEMORY.md — это отдельный binding key в `forge.yaml` (например, `bindings.memory.budget`) или переиспользование `bindings.knowledge.budgets.hot` из RFC-0661? Как реализация должна различать эти два budget?
