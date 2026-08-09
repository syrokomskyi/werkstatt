---
rfcId: RFC-0775
auditId: AUDIT-RFC-0775-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0775

## Verdict: Needs revision

RFC-0775 содержит прямое противоречие с RFC-0771 по `warpgogol-skills`, неполную карту subpath exports для мульти-пакетных доменов и отсутствующую декларацию `packagesImpacted`. Также отсутствует note о forward-зависимости от DNA-64, которая есть в RFC-0771 и RFC-0774.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0775 --json` вернул 0 violations.

## Axis A — Structural completeness

1. **`packagesImpacted: []` пуст, но RFC перемещает ~20 пакетов.** Тело RFC явно перечисляет все исходные пакеты в таблице (ui, pbp, pbp-rate-adapters, ontology, tokens, share, growth, growth-adapter-matomo, growth-adapter-null, growth-adapter-plausible, integration, integration-adapter-stripe, integration-adapter-supabase-crm, chat, chat-adapter-null, chat-adapter-uchat, surface, geo, faq, passport, content-source, studio-gate, check-core, check-runner-node, observability, nebula, star-map, warpgogol-skills). Фронтматтер должен их перечислить — `packagesImpacted` существует именно для этого.

2. **`related` неполон.** Отсутствуют RFC-0771 (определяет границу engine/domain split, включая правило "operations schemas → engine; UI taxonomy → site plugin"), RFC-0773 (extraction pipeline, на который ссылается acceptance criterion по LFS), RFC-0776 (migration sweep, на который ссылается раздел Subpath exports). RFC-0774 указан — корректно.

3. **Failure modes слишком тощий.** Написано "No new failure modes beyond those of the individual packages." Но консолидация вводит минимум три новых failure surface: (a) misconfigured subpath exports → import resolution failure в workpiece, (b) LFS pointer files не материализуются при extraction, (c) circular imports между `domain/share/` и engine `src/schemas/` (последний упомянут в Risks, но не в Failure modes). Раздел должен их задокументировать.

4. **Acceptance criteria неполны.** Отсутствует критерий: существующие test suites проходят без изменений после перемещения (аналогично критерию в RFC-0774: "All site kernel commands keep their existing ids and behavior (test suites pass unchanged)"). Также отсутствует критерий отсутствия dangling imports в консолидированном пакете.

## Axis B — DNA alignment

1. **`satisfies: [DNA-1]` — недостаточно.** Тело RFC обсуждает DNA-5, DNA-17 (Mirror Quintet), DNA-20 (PBP), DNA-56 (Studio Gate), DNA-64. Если RFC сохраняет эти инварианты без изменения, достаточно указать их в `satisfies[]` как "protects". Если RFC не меняет их enforcement, тело должно явно сказать "preserved, not extended" — сейчас это неявно.

2. **DNA-64 упоминается в теле, но отсутствует forward-dependency note.** RFC-0771 (строка 169) и RFC-0774 (строка 124) явно отмечают: "DNA-64 is not yet established in `docs/architecture-dna.md` (RFC-0769 is `draft`)" и "DNA-64 is not yet in `satisfies[]` because RFC-0769 is still `draft`". RFC-0775 упоминает DNA-64 в Architectural fit без этого note. Нужно добавить аналогичную заметку и указать, что DNA-64 будет добавлен в `satisfies[]` после accept RFC-0769.

## Axis C — Ecosystem fit

1. **Прямое противоречие с RFC-0771 по `warpgogol-skills`.** RFC-0771, строка 152, явно помещает `packages/warpgogol-skills` в "Stays workshop-local (never published)" с note "workshop-local skill pack (wg prefix)". RFC-0775 перемещает его в `domain/skills/` внутри публикуемого плагина. Это конфликт между двумя RFC одной программы. Либо RFC-0771 должен быть amended (через `amends: [RFC-0771]`), либо RFC-0775 должен исключить `warpgogol-skills` из domain layer. Нужен операторский decision.

2. **`forge.yaml` `skillPacks` binding не полностью спроектирован.** RFC говорит: "the pack prefix `wg` and dir path change to point inside the plugin". Но `forge.yaml` — workshop-local config. Для dogfooding workshop путь будет `packages/werkstatt-site/src/domain/skills/skills`, для внешних workshop — `node_modules/@warpgogol/werkstatt-site/...`. Механизм resolution (workspace vs npm) не описан. Это нетривиальное изменение, заслуживающее больше чем bullet point.

3. **Граница между `checks/` (RFC-0774) и `domain/check-core/` + `domain/check-runner/` (RFC-0775) не объяснена.** RFC-0774 помещает site validators в `checks/` (из `site-kernel-checks`). RFC-0775 помещает `packages/check-core` и `packages/check-runner-node` в `domain/`. Это разные пакеты, но их взаимосвязь (использует ли `checks/` типы из `check-core`?) не документирована. Нужно пояснить, почему они в разных частях плагина.

4. **`packages/observability` vs `packages/os/site-kernel-observability` — не различены.** RFC-0771 отправляет `site-kernel-observability` в engine (`observability/`). RFC-0775 отправляет `packages/observability` в `domain/observability/`. Это разные пакеты (подтверждено: `packages/observability/` существует отдельно с 18 items в `src/`). RFC должен явно отметить различие, чтобы избежать путаницы при реализации.

5. **Subpath export map неполон для мульти-пакетных доменов.** Таблица указывает: `domain/growth/` ← `packages/growth` + 3 adapter packages; `domain/integration/` ← `packages/integration` + 2 adapter packages; `domain/chat/` ← `packages/chat` + 2 adapter packages. Но не указано, какие subpath exports будут для индивидуальных adapter'ов (например, `@warpgogol/werkstatt-site/growth-adapter-matomo` или всё через `@warpgogol/werkstatt-site/growth`?). Это важно для механического rewrite в RFC-0776.

## Axis D — Forward-only compliance

No issues. RFC явно удаляет старые package directories ("Old domain package directories deleted"). Никаких shims или compatibility layers. Временный re-export scaffold из RFC-0772 упомянут как construction-only.

## Axis E — Agent-facing policy

1. **No self-authorizing language** — корректно. RFC не содержит языка "may proceed while draft".

2. **NEEDS CLARIFICATION markers** — не найдены.

3. **Implementation notes** — стандартный шаблон, корректный.

## Axis F — Pragmatism

1. **No new commands** — корректно для consolidation RFC. `commands: { proposed: [], added: [], changed: [], removed: [] }` — правильно.

2. **`packagesImpacted: []`** — прагматическая проблема: scope RFC неясен без перечисления impacted packages. См. Axis A finding 1.

3. **Мульти-пакетные домены объединены в один subpath** — это упрощение (growth + 3 adapter → один `domain/growth/`) разумно, но требует явного решения по subpath exports (см. Axis C finding 5).

## Axis G — Blind spots

1. **Размер пакета.** Risks упоминает, что `packages/ui` — 2683 items, но не даёт оценку суммарного размера консолидированного плагина. После объединения ~20 пакетов размер будет значительным. Mitigation (subpath exports для tree-shaking) указан, но нет оценки влияния на TypeScript resolution speed.

2. **Test fixture paths.** RFC-0772 (строка 151) явно отмечает: "Many tests build temp workspaces referencing old package names". RFC-0775 не упоминает эту проблему, хотя перемещение ~20 пакетов затронет значительно больше test fixtures, чем перемещение engine modules. Нужно добавить в Risks или Implementation notes.

3. **`share`/`ontology` split.** Risks упоминает риск circular imports между `domain/share/` и engine `src/schemas/`, но не предлагает mitigation beyond "the split must be clean". Нужно указать, кто определяет границу (RFC-0771 задаёт правило: operations schemas → engine; UI taxonomy → site plugin) и какой validator проверяет отсутствие cycles.

4. **Build-time performance.** Импорт из одного большого пакета может замедлить TypeScript project resolution (один `tsconfig.json` вместо ~20). Не оценено.

## Questions for the author

1. **`warpgogol-skills` — workshop-local или domain?** RFC-0771 явно помещает его в "Stays workshop-local (never published)", RFC-0775 перемещает в `domain/skills/`. Какой RFC прав? Если RFC-0775 переопределяет решение RFC-0771, нужно `amends: [RFC-0771]` и обновление RFC-0771.

2. **Subpath exports для adapter sub-packages.** Какой subpath будет у `growth-adapter-matomo` — `@warpgogol/werkstatt-site/growth-adapter-matomo` или всё через `@warpgogol/werkstatt-site/growth`? Это влияет на механический rewrite в RFC-0776.

3. **DNA-64 forward dependency.** Когда DNA-64 будет добавлен в `satisfies[]` — после accept RFC-0769 (как в RFC-0774) или в этом RFC сразу? Нужен явный note по аналогии с RFC-0771/0774.
