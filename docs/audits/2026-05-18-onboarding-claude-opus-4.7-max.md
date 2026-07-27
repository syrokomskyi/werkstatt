Сейчас сделаю тщательный аудит — проверю, что реально на диске, как принятые RFC реализованы, что покрыто, что нет. Параллельно соберу ландшафт изменений.

Хороший прогресс: 9 RFC, 7 workflow-файлов, расширенная онтология, реализация ключевых валидаторов. Сайт `warpgogol-handwerk` ещё не собран — это ожидаемо: внесена _инфраструктура_. Сейчас проверю содержимое новых RFC, имплементацию ключевых команд, обновления AGENTS.md, и состояние онтологии.

Сейчас проверю фактические реализации: пайплайн, workflow-файлы, ключевые валидаторы, AGENTS-файлы, и онтологию.

Сделал тщательный аудит. Вот отчёт — он структурирован так, чтобы следующий ИИ-агент мог сразу начать работать по нему без догадок.

---

# Аудит экосистемы Warpgogol — статус после реализации RFC-0070…0078

**Дата аудита:** 2026-05-18 · **Объём:** все девять RFC, их имплементации, инфраструктура, AGENTS-файлы, готовность к первому реальному онбордингу.

---

## 1 · TL;DR

Архитектурный каркас реализован на ≈ **85 %**. Каждый из девяти RFC принят (`status: accepted`), имплементации в коде есть, переименование пайплайнов корректно, 7 workflow-файлов соответствуют RFC-0075 frontmatter-контракту, онтология расширена (биомы / site-families / архетипы / констелляции), новые валидаторы прошиты в `APPS_CHECK_PIPELINE` и `PACKAGES_CHECK_PIPELINE`. Подтверждено через инспекцию кода: 32 новые команды зарегистрированы в `site-kernel-checks/src/module.ts`, 4 — в `site-kernel-onboarding/src/module.ts`, 2 — в `site-kernel/src/workflow/workflow.module.ts`.

Что блокирует полноценный «один-командный онбординг»:

1. **RFC-0078 Tier 3 не имплементирован** — нет команд `kernel.wire`, `config.regenerate`. Новые приложения по-прежнему требуют ручной `tools/`-обвязки.
2. **Каталог архетипов не дополнен под Handwerk-семью.** Файл `handwerk-trust-engineering/family.yaml requiredSectionArchetypes` ссылается на 11 архетипов (`trust-strip`, `comparison-cards`, `ownership-block`, `notausgang-block`, `controlled-responsibility-block`, `price-card`, `founder-trust-card`, `audience-cards`, `hero-decision-card`, и др.), но в `packages/ontology/archetypes/sections/` есть только заглушки от существующих 15 секций — Handwerk-архетипы отсутствуют. `family.contract.validate` упадёт.
3. **`onboarding.scaffold` не вызывается из workflow `02-scaffold`** — приложение `apps/<client.id>/` физически не создастся.
4. **`01-synthesize` фаза не охвачена RFC-0076 phase-contract** — `blueprint.md` не валидируется на свежесть.
5. **Констелляция `handwerk-trust-funnel.yaml` использует один и тот же `Tethys` для двух разных слотов** (Trust strip и Price card) — баг.
6. **AGENTS-файлы обновлены частично** — корневой обновлён, `apps/AGENTS.md` обновлён, но `packages/AGENTS.md`, `packages/ui/AGENTS.md`, `packages/os/site-kernel-onboarding/AGENTS.md` и `apps/nicaragua-projekt/AGENTS.md` не отражают новых конструктов (site-families, archetype-каталога, workflow-оркестрации, расширенной biome-схемы).

---

## 2 · Что реализовано корректно

| Область | Подтверждено на диске |
| --- | --- |
| RFC-документы | RFC-0070..0078 все есть, статус `accepted`, frontmatter валиден, тело связное |
| Переименование пайплайна | `STANDARD_CHECK_PIPELINE` → `APPS_CHECK_PIPELINE` (`module.ts:180`), `PACKAGES_CHECK_PIPELINE` создан (`module.ts:268`), `APPS_BUILD_PREPARE_PIPELINE` (`module.ts:302`) |
| Workflow-слой | 7 файлов (`00-prepare` → `06-handoff`) с frontmatter по RFC-0075 (id/title/phase/reads/writes/scope/runs/recoveryRules/agentInvariants/selfOrchestration/checkpoints/nextWorkflow); легась (`plant-seed/plant-content/update-content/review`) удалена |
| Brief-контракт | `brief.ts` использует `gray-matter` правильно, BriefFrontmatter Zod-схема с 5 обязательными полями, перекрёстная проверка против существующего `system.md` |
| Phase-контракт (RFC-0076) | `phase-contract.ts` — input-manifest SHA-256, cascading-validate, freshness через `derivedFromInputHash`, корректный noop при отсутствии brief |
| Биом-онтология | `nonprofit-trust.yaml` + `handwerk-material-warm.yaml` оба используют расширенную схему (axes/palette/typography/spacing/motion/geometry/constraints), `handwerk-material-warm` несёт `provenance` блок |
| Site-family каталог | `charity-donation-trust/` + `handwerk-trust-engineering/` каждая с 4 YAML (family/tone/cultural/linguistic-rules) |
| Архетипы (старт) | 30+ YAML в `archetypes/sections/` включая `shell/{background,header,footer,breadcrumbs}` |
| Команды-валидаторы | Все 32+ новые команды зарегистрированы в `site-kernel-checks/src/module.ts` (строки 492-934) |
| `workflow.lint` / `workflow.list` | Зарегистрированы в `site-kernel/src/workflow/workflow.module.ts` |
| `audit.llm.run` + `app.qa.validate` | Зарегистрированы; `audit-report.md` уже сгенерирован, `llm-cache.jsonl` файл создан |
| Корневой AGENTS.md | Содержит секции «Generation-first template discipline (RFC-0078)» и «Onboarding a new site» с указанием на `.agents/workflows/00-prepare.md` |
| `apps/AGENTS.md` | Содержит правила по `src/content/pages/{lang}/*.md` как workflow-authored, audit-report и llm-cache как генерируемые |

---

## 3 · Критические gap'ы (фиксить до первого онбординга)

### 3.1 RFC-0078 Tier 3: `kernel.wire` не зарегистрирован

**Симптом:** `grep "name:\s*['\"]kernel\.wire" packages/os/**/*.ts` пустой. Шаблоны (`packages/os/site-kernel/src/templates/wire/tools/modules/*.template`) присутствуют, но обработчик и `registerCommand({ name: "kernel.wire", ... })` отсутствуют.

**Следствие:** Новые приложения требуют ручного `tools/kernel.config.ts`. Это нарушает обещание RFC-0078 о «менее 5 hand-maintained engineering files». В частности, в workflow `02-scaffold` нет команды, которая после `onboarding.scaffold` сгенерирует `tools/`.

**Исправить:**

- Реализовать `runKernelWire` в `packages/os/site-kernel/src/wire/` (читает `apps/<id>/src/content/system.md`, выявляет feature-flags, рендерит шаблоны из `templates/wire/tools/`).
- Реализовать `runConfigRegenerate` в `packages/os/site-kernel-onboarding/src/scaffold.ts` или новом модуле (применяет root-config шаблоны идемпотентно).
- Реализовать `app.boilerplate.validate` дрейф-чек (`registerCommand` уже есть в `module.ts:537` — проверить что обработчик не заглушка).
- Добавить `app.boilerplate.validate` в `APPS_CHECK_PIPELINE` (он сейчас отсутствует там, что снимает гейтинг свежести boilerplate).
- Добавить `kernel.wire` шагом в workflow `02-scaffold.md` после `onboarding.scaffold`.

### 3.2 Каталог архетипов не покрывает Handwerk-семью

**Симптом:** `handwerk-trust-engineering/family.yaml` требует 11 архетипов:

```
hero-decision-card, trust-strip, comparison-cards, audience-cards,
ownership-block, notausgang-block, controlled-responsibility-block,
price-card, founder-trust-card, faq-list, final-cta
```

В `packages/ontology/archetypes/sections/` присутствует только `faq-list.yaml`, `final-cta.yaml`. Остальные 9 отсутствуют.

**Следствие:** `family.contract.validate` упадёт с ошибкой «required archetype `<id>` not in catalog». Невозможно начать compose-фазу для Handwerk-клиента.

**Исправить:** добавить недостающие 9 YAML в `packages/ontology/archetypes/sections/` с:

- `id` совпадающим с slug файла
- `displayName`, `version`, `semanticRole`, `description`
- `expectedIntents`, `expectedIndustryFit` (`[handwerk, b2b-services, professional-services]`)
- `layoutHint` (см. enum из RFC-0072)
- `propsSchema` с **реальной** Zod-формой (не `z.object({}).passthrough()`)
- `acceptedCosmicNames` — каждая ссылка на свободные имена из PlanetCatalog
- `constraints.forbidPhrases` для блоков, специфичных к Handwerk-табу (Notausgang/ownership/controlled-responsibility должны быть строгими)

### 3.3 Существующие архетипы — заглушки

**Симптом:** `archetypes/sections/hero.yaml` имеет `propsSchema: z.object({}).passthrough()` — полностью открытая схема. То же ожидаемо для остальных 30 backfill-YAML.

**Следствие:** `manifest.contract.validate` и `page.block.validate` не отлавливают неправильные `blocks[].props`. Контентный сюрфейс может содержать что угодно, что подорвёт всю block-declarative контракт-модель.

**Исправить:** для каждого существующего архетипа извлечь реальную Zod-форму из соответствующей секции в `packages/ui/src/sections/<slug>/<slug>.props.schema.ts` (или `<slug>-section.types.ts`) и поместить её строкой в `propsSchema.shape`. Это можно делать одним проходом скриптом — у нас есть и архетип-файл, и реализация секции.

### 3.4 Констелляция дублирует cosmic-имя `Tethys`

**Симптом:** `handwerk-trust-funnel.yaml` содержит:

```
slots:
  - cosmicName: Tethys
    label: Trust strip
  - cosmicName: Tethys      # ← дубль на Price card
    label: Price card
```

**Следствие:** `cosmic.name.unique` не падает (он проверяет уникальность в манифестах, не в констелляциях), но это семантически некорректно — Price card и Trust strip разные секции. Когда дойдёт до scaffold секций по `acceptedCosmicNames`, picker отдаст `Tethys` одной из них и второй не достанется.

**Исправить:** заменить второе `Tethys` на свободное имя из PlanetCatalog для архетипа `price-card` (например, `Pan`, `Atlas`, или другой свободный спутник). Проверить через `cosmic.name.pick --catalog planet --archetype price-card --exclude-used <конструкция>`.

### 3.5 Workflow `02-scaffold` не вызывает `onboarding.scaffold`

**Симптом:** В `02-scaffold.md` body:

```
1. Write visual-plan.md
2. Write infra-config.yaml
3. Run onboarding.phase.validate --phase=02-scaffold
4. Run biome.tokens.derive
5. Run family.contract.validate
6. Run packages-check.run
7. Update status.md
```

Нет вызова `onboarding.scaffold --client <id> --domain <fqdn>`. Папка `apps/<client.id>/` не появится.

**Исправить:** добавить шаг между 2 и 3:

```
2.5. pnpm exec site-kernel run onboarding.scaffold --client <client.id> --domain <client.domain>
2.6. pnpm exec site-kernel run kernel.wire --app <client.id>       # после реализации 3.1
```

Также добавить `onboarding.scaffold` и `kernel.wire` в `runs:` frontmatter.

### 3.6 RFC-0076 phase-enum не включает `01-synthesize`

**Симптом:** В `phase-contract.ts:35`:

```ts
export type OnboardingPhase = "00-intake" | "02-scaffold" | "03-compose" | "04-author" | "05-audit";
```

И `PHASE_ARTIFACTS` не содержит `01-synthesize`.

**Следствие:** `01-synthesize/blueprint.md` не валидируется на свежесть. Если входные материалы поменяются после synthesize, blueprint станет stale, но downstream фазы не узнают.

**Исправить:**

- Добавить `"01-synthesize"` в enum.
- Добавить в `PHASE_ARTIFACTS`:
  ```ts
  "01-synthesize": [
    { path: "onboarding/.output/01-synthesize/blueprint.md", required: true, metadata: true },
    { path: "onboarding/.output/01-synthesize/family-pick.md", required: false, metadata: true },
  ],
  ```
- Добавить шаг `onboarding.phase.validate --phase=01-synthesize` в workflow `01-synthesize.md`.
- Договориться о терминологии: либо workflows используют те же имена (`01-synthesize` вместо `synthesize` в `phase:` frontmatter), либо в `phase-contract.ts` явно сделать alias-таблицу.

---

## 4 · Несоответствия второго порядка

### 4.1 Premature audit run

`onboarding/.output/05-audit/audit-report.md` уже сгенерирован, но `derivedFromInputHash: ""` — пустая. Это означает, что `app.qa.validate` запустился без свежего input-manifest. Это smoke-test, не реальный audit. Перед первым реальным онбордингом удалить (или регенерировать после прохода всей цепочки) `audit-report.md` и `llm-cache.jsonl`.

### 4.2 Конфликт схем констелляции

`handwerk-trust-funnel.yaml` использует поля `name`, `forStar`, `description` — не `displayName`, `family`, `basedOn` как в RFC-0072. Либо схема в `constellation.contract.validate` упрощена, либо констелляция написана под старую схему. Проверить:

- Что реально валидирует `constellation.contract.validate` (`packages/os/site-kernel-checks/src/archetype.ts` или `constellation.ts`?).
- Привести констелляции к одной схеме. Я бы добавил `family: handwerk-trust-engineering` обратно — это критично для `family.contract.validate` cross-check.

### 4.3 Workflow `04-author` не создаёт обязательные артефакты по RFC-0076

`04-author.md` body говорит «Write atoms.yaml, voice-profile.yaml, and coverage.md» — но это инструкция агенту, не команда. RFC-0076 требует `atoms.yaml`, `voice-profile.yaml`, `first-party-data.yaml` обязательно (с `derivedFromInputHash` metadata). Нужен либо явный hint, либо micro-команда `content.atoms.scaffold` создающая yaml-шапки с правильным `phase:` + `derivedFromInputHash` header.

### 4.4 Workflow `06-handoff` не указывает `pnpm --filter <id> dev`

Body говорит «Start the dev server only after checks are green» без команды. Добавить шаг:

```
3. pnpm --filter <client.id> dev    # opens http://localhost:4321/<defaultLang>/
```

### 4.5 `apps/AGENTS.md` всё ещё содержит ссылку на `.agents/rules/AGENT_QUICKSTART.md` и др.

В конце `apps/AGENTS.md` есть `## Shared architecture documentation` секция, ссылающаяся на `.agents/rules/AGENT_QUICKSTART.md`, `AGENT_RULES.md`, `SEMANTIC_LAYER.md` и т. п. Эти файлы — историческое legacy. По RFC-0075 активные инструкции — это `.agents/workflows/`. Заменить ссылки на workflows или явно пометить старые файлы как reference-only.

### 4.6 `packages/ui/src/sections/` не содержит ни одной новой секции

15 секций, как и было. RFC-0072 обещает «scaffold new section in `packages/ui/src/sections/<slug>/` from a template tied to the archetype». Шаблон секции (template) ещё не лежит в `packages/os/site-kernel-codegen/templates/section/`. Без него `section.scaffold` либо не работает, либо использует жёстко зашитую логику. **Проверить:** существует ли `packages/os/site-kernel-codegen/templates/section/` и что в нём.

### 4.7 RFC-0076 acceptance включает обязательный `derivedFromInputHash` header — но `audit-report.md` от smoke-test'а имеет пустую строку. Значит, `app.qa.validate` пишет header даже когда input-manifest отсутствует. Логика валидатора должна либо отказаться писать report без манифеста (fail-hard), либо пометить status `pending`/`noop`. Сейчас она пишет ok status — это вводит в заблуждение.

---

## 5 · Что нужно сделать для «высочайшего порядка» онбординга

В приоритетном порядке, каждое действие концретно (для следующего ИИ-агента):

### 5.1 Завершить RFC-0078 Tier 3 (`kernel.wire`)

1. Создать `packages/os/site-kernel/src/wire/wire.module.ts` — регистрация команды.
2. Создать `packages/os/site-kernel/src/wire/handler.ts` — основная логика: читает `apps/<id>/src/content/system.md`, определяет `release.passport.enabled`, `growth.vendor.adapter`, наличие пакетов в `apps/<id>/package.json`, рендерит шаблоны из `templates/wire/tools/`.
3. Добавить `--check` и `--dry-run` режимы.
4. Реализовать `app.boilerplate.validate` обработчик (или удостовериться что не заглушка) и добавить в `APPS_CHECK_PIPELINE` после `system.manifest.validate`.
5. Реализовать `config.regenerate` — рефакторинг существующего `onboarding.scaffold` template-применения.

### 5.2 Бэкфилл архетипа Handwerk

Создать 9 YAML в `packages/ontology/archetypes/sections/`:

```
hero-decision-card.yaml
trust-strip.yaml
comparison-cards.yaml
audience-cards.yaml
ownership-block.yaml
notausgang-block.yaml
controlled-responsibility-block.yaml
price-card.yaml
founder-trust-card.yaml
```

Для каждого:

- Извлечь содержимое из `onboarding/.input/36-wireframe.md` (соответствующие секции) — описание, ожидаемые элементы, item count, layout hint.
- Записать `propsSchema` с реальной Zod-формой (не passthrough). Источник вдохновения — пропы соответствующих блоков в `36-wireframe.md`.
- Выбрать `acceptedCosmicNames` из свободного хвоста PlanetCatalog — сверить через `cosmic.name.pick`.
- `constraints.forbidPhrases` — взять из `28-tone-of-voice.md` и `30-audit.md` (например, для `controlled-responsibility-block`: запретить `"ROI gewährleistet"`, `"100% Erfolg"`, `"garantierte Leads"`).
- Запустить `archetype.registry.build` затем `archetype.registry.validate`.

### 5.3 Усилить существующие архетипы

Пройтись по 21 существующему backfill-архетипу и заменить `z.object({}).passthrough()` на реальную форму. Источник — `packages/ui/src/sections/<slug>/<slug>.props.schema.ts` или (если её нет) `<slug>-section.types.ts`. Скриптуемо.

### 5.4 Починить констелляцию и схему

В `handwerk-trust-funnel.yaml`:

- Заменить дубль `Tethys` → выбрать свободное имя через `cosmic.name.pick` для `price-card`.
- Привести к единой схеме с RFC-0072: добавить `family: handwerk-trust-engineering`, `displayName`, `version`.
- Проверить `nonprofit-donation-funnel.yaml` на ту же согласованность.
- Решить, требуется ли поле `forStar` (если да — добавить в RFC).

### 5.5 Доработать workflows

`02-scaffold.md`:

- Добавить в `runs:` команды `onboarding.scaffold`, `kernel.wire`, `biome.css.generate`, `biome.contract.validate`.
- В body — явный шаг 3 на `onboarding.scaffold --client <client.id> --domain <client.domain>` и шаг 4 на `kernel.wire --app <client.id>`.

`03-compose.md`:

- Уже хорошо. Добавить упоминание `section.scaffold` шаблонов (см. 4.6).

`04-author.md`:

- Добавить в body инструкцию о том, что `atoms.yaml`, `voice-profile.yaml`, `first-party-data.yaml` должны нести header:
  ```yaml
  phase: 04-author
  derivedFromInputHash: <hash из 00-intake/input-manifest.json>
  generatedAt: <ISO 8601>
  generator: agent
  ```

`05-audit.md`:

- Удостовериться, что `onboarding.input.validate` запускается **первым** шагом (он генерирует input-manifest, на который опираются все остальные).

`06-handoff.md`:

- Добавить шаг `pnpm --filter <client.id> dev` и шаг проверки URL.
- Добавить шаг «print changelist summary» (агент через `git status` / `git diff --stat`).

### 5.6 Расширить `phase-contract.ts`

```ts
export type OnboardingPhase =
  | "00-intake"
  | "01-synthesize"
  | "02-scaffold"
  | "03-compose"
  | "04-author"
  | "05-audit";

const PHASE_ARTIFACTS: Record<OnboardingPhase, PhaseArtifactSpec[]> = {
  "00-intake": [/* как есть */],
  "01-synthesize": [
    { path: "onboarding/.output/01-synthesize/blueprint.md", required: true, metadata: true },
    { path: "onboarding/.output/01-synthesize/family-pick.md", required: true, metadata: true },
  ],
  "02-scaffold": [/* как есть */],
  /* ... */
};
```

### 5.7 Обновить AGENTS-файлы

Минимум четыре файла должны прирасти секциями (см. §6).

### 5.8 Создать шаблон новой секции

`packages/os/site-kernel-codegen/templates/section/` должен содержать:

```
{{slug}}-section.astro.template
{{slug}}.css.template
{{slug}}-section.manifest.yaml.template
{{slug}}.props.schema.ts.template
{{slug}}-section.story.md.template
```

с подстановкой `{{slug}}`, `{{archetype}}`, `{{cosmicName}}`, `{{industryFit}}`, `{{propsSchemaShape}}`.

### 5.9 Подчистить пред-генерированный `05-audit/`

Удалить `audit-report.md` и `llm-cache.jsonl` (либо признать их smoke-test'ом и положить под `.gitignore`-комментарием). Реальный аудит должен быть результатом реальной фазы 05.

### 5.10 Один acceptance-тест на сквозной онбординг

Прогнать **полностью** workflow-цепочку на `warpgogol-handwerk` (текущий бриф). Шаги:

1. `pnpm exec site-kernel run workflow.lint` → должен пройти.
2. `pnpm exec site-kernel run brief.validate` → должен пройти после исправления значений в `00-brief.md` человеком (`client.id`, `client.domain` — placeholder values сейчас).
3. Пройти 00 → 06 workflow с agent autorun.
4. На handoff: `pnpm --filter warpgogol-handwerk dev` открывается.
5. `pnpm exec site-kernel run apps-check.run --app warpgogol-handwerk` → exit 0.
6. `pnpm exec site-kernel run app.contract.full --app warpgogol-handwerk` → exit 0.

Любой из шагов, который не доходит до exit 0, — это новый bug-ticket.

---

## 6 · Точечные правки в AGENTS-файлы

### 6.1 `packages/AGENTS.md` — добавить раздел

```markdown
## Onboarding-time ecosystem extensions (RFC-0071..0078)

### Site families catalog (RFC-0071)

`packages/ontology/site-families/<id>/` holds the recipe for a class of similar
sites. Each family directory contains:

- `family.yaml` — recipe: candidateBiomes, candidateConstellations,
  requiredSectionArchetypes, conversionGoals, auditThresholds, agentReadinessBaseline.
- `tone-of-voice.template.yaml` — starter voice profile.
- `cultural-rules.yaml`, `linguistic-rules.yaml` — rules consumed by `audit.llm.run`.

Validated by `family.contract.validate` (in `PACKAGES_CHECK_PIPELINE`).

### Archetype catalog (RFC-0072)

`packages/ontology/archetypes/sections/<id>.yaml` declares the semantic shape of
a section (intents, industry fit, propsSchema, accepted cosmic names, constraints).
Every `manifest.yaml` under `packages/ui/src/sections/` must carry `archetype: <id>`
pointing at an entry in this catalog.

- `archetype.registry.build` rebuilds `index.json` after edits.
- `archetype.registry.validate` runs in `PACKAGES_CHECK_PIPELINE`.
- New sections are materialized by `section.scaffold --archetype <id> --slug <slug>
  --cosmic-name <Planet>` — never by copying a sibling section folder.

### Pipelines (RFC-0075)

- `APPS_CHECK_PIPELINE` — one app's gates. Drive via `apps-check.run --app <id>`.
- `PACKAGES_CHECK_PIPELINE` — workspace package contracts. Drive via `packages-check.run`.
- `APPS_BUILD_PREPARE_PIPELINE` — generators (overlay pages, routes, styles, scripts,
  public infra, archetypes registry, biome CSS, sitemap, llms, ai, robots, etc.).

### Generation-first apps (RFC-0078)

Apps under `apps/*` are content-only. Engineering files (`tools/**`, `src/pages/**`,
`src/middleware.ts`, `src/content.config.ts`, `src/env.d.ts`, `src/styles/global.css`,
`src/scripts/layout-orchestrator.ts`, overlay pages, `public/{robots,ai,_headers,.assetsignore}`)
are generated by `kernel.wire`, `overlay.pages.generate`, `routes.generate`,
`styles.global.generate`, `scripts.orchestrator.generate`, `public.infrastructure.generate`.
Never hand-author these files; freshness is gated by `app.boilerplate.validate`.
```

### 6.2 `packages/ui/AGENTS.md` — добавить

```markdown
## Section archetype contract (RFC-0072)

Every section under `packages/ui/src/sections/<slug>/` MUST:

- Have a `<slug>-section.manifest.yaml` with required field `archetype: <id>` matching
  an entry in `packages/ontology/archetypes/sections/<id>.yaml`.
- Have `<slug>.props.schema.ts` whose exported Zod schema is a superset of the
  archetype's `propsSchema.shape`.
- Have a colocated `<slug>.css` using only `--ds-*` tokens (no raw values).
- Be created by `section.scaffold --archetype <id> --slug <slug>`, never by hand-copy.

`section.contract.validate` enforces these. Find near-duplicates with `section.similarity.report`.
```

### 6.3 `packages/os/site-kernel-onboarding/AGENTS.md` — добавить (новый файл если нет)

```markdown
# Onboarding kernel agent guide

This package owns:

- `brief.validate` — RFC-0070 brief contract (gray-matter, 5 required fields).
- `onboarding.input.validate` — RFC-0076 input manifest builder.
- `onboarding.phase.validate` — RFC-0076 phase freshness gate.
- `onboarding.scaffold` — RFC-0029 app skeleton generator.
- `biome.tokens.derive` — RFC-0071 deterministic OKLCH derivation.

## Brief contract (00-brief.md)

5 required frontmatter fields, parsed by gray-matter. The build refuses to start
without them. NEVER carry biome/family/constellation/passport/deploy decisions in
the brief — those are derived in synthesize/scaffold.

## Phase contract

Phases: 00-intake, 01-synthesize, 02-scaffold, 03-compose, 04-author, 05-audit.
Every machine-readable phase output MUST carry a header:

\`\`\`yaml
phase: <phase>
derivedFromInputHash: sha256:<…>
generatedAt: <ISO 8601>
generator: <command-or-agent>
\`\`\`

Stale outputs (mismatched hash) fail the phase validator.
```

### 6.4 `apps/nicaragua-projekt/AGENTS.md` — добавить в конец

```markdown
## Relation to onboarding workflows

This site predates the RFC-0070..0078 workflow chain. Its content surface is
RFC-0047-compliant and `apps-check.run --app nicaragua-projekt` is the readiness
gate. New sites are NOT built by duplicating this one — agents must follow
`.agents/workflows/00-prepare.md` and run `onboarding.scaffold` only inside
the scaffold phase.
```

### 6.5 Корневой `AGENTS.md` — добавить ссылку на каталог архетипов

В существующую секцию «Cosmic naming contract», после трёх таблиц-катологов, добавить абзац:

```markdown
**Archetype layer (RFC-0072) sits above cosmic names.** Authors and agents
work with archetype ids (e.g. `trust-strip`, `comparison-cards`). The deterministic
picker `cosmic.name.pick` chooses a free Planet/Moon name from the archetype's
`acceptedCosmicNames` list. Cosmic catalogs remain closed; archetype catalog is
extensible by RFC.
```

---

## 7 · Рекомендованная последовательность действий для следующего агента

```
1.  Прочитать docs/rfcs/RFC-0070..0078 (все accepted).
2.  Реализовать пункт §5.1 (kernel.wire + config.regenerate + app.boilerplate.validate).
3.  Бэкфилл архетипа Handwerk (§5.2).
4.  Усилить propsSchema для существующих архетипов (§5.3, скриптом).
5.  Починить handwerk-trust-funnel и привести констелляции к единой схеме (§5.4).
6.  Доработать workflow body 02..06 (§5.5).
7.  Расширить phase-contract.ts на 01-synthesize (§5.6).
8.  Обновить AGENTS.md по §6.
9.  Создать шаблоны секции (§5.8).
10. Подчистить smoke-test файлы 05-audit (§5.9).
11. Запросить у человека финальные значения в onboarding/.input/00-brief.md
    (сейчас placeholder: your-client-id / example.de) и подтверждение пользователя
    на запуск полной цепочки.
12. Запустить acceptance-проход (§5.10):
    pnpm exec site-kernel run workflow.lint        # должен exit 0
    pnpm exec site-kernel run brief.validate        # exit 0 после заполнения brief
    # потом следовать .agents/workflows/ от 00-prepare.md далее
13. После handoff — собрать changelist для человеческого ревью.
```

---

## 8 · Риски, которые могут споткнуть следующего агента

1. **Существующий `nicaragua-projekt` не валидируется новым `APPS_CHECK_PIPELINE`.** Если `app.boilerplate.validate` встанет в пайплайн без миграции nicaragua на сгенерированные boilerplate-файлы — этот app начнёт падать. Возможный путь: для `nicaragua-projekt` поставить `tools.managed: false` в `system.md` (escape hatch упомянутый в RFC-0078) или фиксировать его на старой шине.
2. **`audit.llm.run` потребует API-ключи Anthropic/OpenAI.** В CI без ключей — fail. Решение: `audit.llm.run --cached-only` режим, который читает только cache и не делает live calls; при отсутствии cache hit — статус `pending`, не `fail`.
3. **`onboarding.input.validate` хеширует все файлы в `.input/`** включая `.webp`. Это может быть медленно при больших визуальных артефактах. Если это станет проблемой — добавить опционально hash-by-stat для бинарных типов.
4. **`workflow.lint` сейчас не проверяет, что `runs:` команды реально зарегистрированы в kernel.** Когда `kernel.wire` появится в workflow `02-scaffold`, но не в kernel-registry — lint не упадёт. Усилить `workflow.lint` так, чтобы он cross-check'ал `runs:` против live registry.
5. **`gray-matter` парсит YAML по-разному с `yaml@2.x` библиотекой.** Если кто-то редактирует `00-brief.md` через YAML-aware tool — могут появиться расхождения. Стандартизировать через `parseBriefFrontmatter` (`brief.ts:195`) вместо ad-hoc парсинга.
6. **`section.scaffold` пока без шаблона.** Workflow `03-compose` его вызывает, но если шаблон в `packages/os/site-kernel-codegen/templates/section/` пуст или неполон — секция родится сломанной. Проверить наличие 5 `.template` файлов перед первым реальным запуском.
7. **Расходимость phase-имён между RFC-0075 (workflow phase names) и RFC-0076 (phase-contract enum).** Workflows используют `prepare/synthesize/scaffold/compose/author/audit/handoff`; phase-contract использует `00-intake/02-scaffold/03-compose/04-author/05-audit`. Это потенциальный источник путаницы — нужно либо явный mapping в коде, либо переименование одной стороны.

---

## 9 · Один абзац оценки качества

Принятая архитектура — это серьёзный инженерный прыжок от «один сайт с ручной сборкой» к «N сайтов, каждый = content-only поверх генерируемой kernel-обвязки». Дизайнерская мысль кругом единая: всё, что можно детерминированно вычислить — детерминированный код в `packages/`; всё, что требует суждения — промпт в `.agents/workflows/`; гарантии целостности — хеши + контракт фаз. **Слабое звено сейчас — это разрыв между амбицией RFC-0078 («apps живут только из content/») и неимплементированным `kernel.wire`.** До закрытия этого разрыва каждый новый сайт по-прежнему требует ручной `tools/`-обвязки, что подрывает обещание thin-app. Второе слабое звено — **archetype propsSchema пока пустой**, что снимает гейтинг с пропсов секций. Закрытие этих двух пунктов плюс backfill Handwerk-архетипа выводит экосистему в состояние, где один человек + один ИИ-агент действительно собирают новый бизнес-сайт за один рабочий день, как обещает корневой `docs/onboarding`-narrative.
