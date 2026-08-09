# Kickoff: «Приём материалов на борт уже взятого сайта» (amend-onboarding)

> Назначение файла: бриф для НОВОЙ сессии, которая будет писать RFC. Здесь зафиксировано всё изученное в предыдущей сессии + утверждённые решения, чтобы холодный агент не переоткрывал контекст. Это НЕ RFC и НЕ workflow — лежит в `.agents/notes/`, валидаторы RFC/workflow его не трогают.

## 0. Задача (одной фразой)

Спроектировать систему «до-приёма» (amend) материала в **уже взятый на борт** сайт:

- **усиление** существующего маршрута (пример: `pageId: digitalesFundament`, материал `Angebot_Digitales_Fundament_RU_v0.8` + `Geschäftswert_RU_v0.2`);
- **создание новых** маршрутов/лендингов (примеры: `empfehler`, `sichtpass`, `umsicht`).

Цель — максимально отдать работу ИИ-агентам, по образцу действующего онбординга (`.agents/workflows/00..06`, RFC-0075). Сначала — полноценный RFC (один или несколько), вписывающийся и при нужде расширяющий архитектуру турборепо.

Исходные материалы-примеры (вне репо, Obsidian): `L:\My Drive\projects\obsidian\WGogolDoc\Brand\!Foundation\` — `Angebot_Digitales_Fundament_RU_v0.8.md`, `Geschäftswert_RU_v0.2.md`, `Angebot_Empfehler_RU_v0.3.md`, `Sichtpass_RU_v0.1.md`, `Umsicht_RU_v0.1.md`. (Наполнять/создавать сейчас НЕ надо — это только примеры для проектирования системы.)

---

## 1. Утверждённые решения (ответы основателя — НЕ переспрашивать)

1. **Форма workflow → Отдельная цепочка (amend).** Новый каталог, напр. `.agents/workflows-amend/`, со своими фазами (intake → synthesize → compose → author → audit → handoff), переиспользующий те же kernel-команды. НЕ режим-флаг внутри 00..06.
2. **Где живут новые материалы → По-батчевые amend-бандлы.** Каждый приём = иммутабельный батч `onboarding/.input/amend-<NNN>/` (или аналог) со своим `input-manifest.json` и хешем. Сохраняем hash-дисциплину RFC-0075/RFC-0076. (См. проблему П-1 ниже про то, что после handoff `.input/.output` уезжают в process-repo, а `apps/<id>` может быть извлечён в свой репо — это надо явно разрулить в RFC.)
3. **Сценарии → Единый процесс с ветвлением.** Одна точка входа; на фазе compose решается: strengthen существующего `pageId` ИЛИ завести новый `pageId`/route. Разные гарантии и зоны записи активируются по ветке.
4. **Граница автономии ИИ-агента:**
   - Агенту даётся **свобода в рамках архитектуры экосистемы** (т.е. НЕ обязателен pause на новый biome / новый archetype / новый route в навигации — если он остаётся в контрактах).
   - **Pause при нехватке материала** (coverage ниже порога): агент сообщает, чего не хватает, и ждёт — не выдумывает.
   - **Pause на legal/факт./ценовых/гарантийных утверждениях**, которые нельзя трассировать к источнику (как уже в 04-author).

---

## 2. Карта изученной архитектуры (факты, на которые опирается RFC)

### 2.1 Действующая онбординг-цепочка (RFC-0075)

`.agents/workflows/00-prepare → 01-synthesize → 02-scaffold → 03-compose → 04-author → 05-audit → 06-handoff`. Каждый файл — frontmatter с `reads/writes/runs/scope (allowedWriteRoots/forbiddenWriteRoots)/recoveryRules/agentInvariants/selfOrchestration (autoRun,pauseFor)/checkpoints/nextWorkflow`. Самооркестрация: agent выполняет `runs` напрямую, пока `autoRun: true`, останавливается только на `pauseFor`/forbidden roots. Линт цепочки: `pnpm exec werkstatt run workflow.lint`.

Назначение фаз:

- **00-prepare** — валидирует brief, требует `apps/<id>/` ОТСУТСТВУЕТ (`brief.validate --require-app-absent`). Для amend это инвертируется: app ДОЛЖЕН существовать.
- **01-synthesize** — материалы → `blueprint.md` + `family-pick.md`.
- **02-scaffold** — создаёт `apps/<id>/`, выводит biome (`packages/ontology/biomes/<id>.yaml`), `onboarding.scaffold`, `kernel.wire`, `biome.tokens.derive`, `biome.css.generate`. Для amend в общем случае ПРОПУСКАЕТСЯ (app и biome уже есть) — кроме случая, когда новому лендингу нужен новый biome/архетип.
- **03-compose** — `site-plan.md` → `system-md.compile` пишет `system.md`; секции через `section.scaffold` + `cosmic.name.pick`; constellation/section контракты. Здесь живёт ветвление strengthen vs new-route.
- **04-author** — атомизация копирайта в `atoms.yaml`, `voice-profile.yaml`, `first-party-data.yaml`, контент в 5 доменах (`pages/ prose/ business/ navigation/ site/`), `coverage.md`-леджер. Гейты: `content.business.validate`, `content.references.validate`, `content.voice.lint`, `content.coverage.validate`.
- **05-audit** — детерминированные QA + кешируемые LLM-аудиты (`audit.llm.run`), SEO, structured-data, analytics, first-party-data, agent-readiness, `app.qa.validate`.
- **06-handoff** — `sites-check.author`, build, `sites-check.postbuild`, `app.contract.full`, summary.md, dev-server. `autoRun:false` (ждёт человека). В конце человек МОЖЕТ переместить `onboarding/.input|.output` в process-repo и/или извлечь `apps/<id>/` в отдельный турборепо.

### 2.2 Контентная модель приложения (на примере `apps/warpgogol-com`)

- `src/content/system.md` — единый источник; компилируется из `03-compose/site-plan.md` через `system-md.compile` (RFC-0087: single-owner, idempotent, sourced). Содержит: `identity` (systemStar, biome, domain, ctaTarget, legal), `i18n` (default de, supported de/uk), `constellations`, `clientEditable`, `pages[]` (каждая: `pageId`, `routes.{lang}`, `cosmicStar`, опц. `locales`, `shell`, `planets[]` с `cosmicPlanet`+`pin`), `growth`, `release`.
- `src/content/pages/{lang}/<slug>.md` — frontmatter-only блок-декларации (RFC-0026): `kind/pageId/cosmicStar/title/description/lang/blocks[]`. Имя файла выводится из pageId (RFC-0090, `pageIdToContentFileSlug`). Локали асимметричны (RFC-0097, `locales: [de]`).
- Блоки/секции — каноничный контракт RFC-0101..0107/0110: `header` (tone-segmented heading RFC-0102), `background` (discriminated union RFC-0101), `glass`, `density`, `tone`, `motion` (≤ biome.motionStance, RFC-0106), `body` (discriminated union: list/ split-list/stats/cards/paragraphs/comparison/rich, RFC-0103) или composite, `ctaGroup`/ `cta` (structured target kind: internal|external|anchor, RFC-0104). Block-style YAML, без flow `{}`. Бизнес-данные только через `{business.X.Y}` references (RFC-0045), никогда не хардкод. NEED-маркеры `NEED_THIS_<FIELD>` (RFC-0042).
- Домены: `pages/`, `prose/` (длинная проза, ссылается через `markdown` block `contentRef: prose/<slug>`), `business/{lang}/`, `navigation/{lang}/navigation.md` (RFC-0044), `site/{lang}/{labels,layout}.md`.
- Онтология (общая, в `packages/ontology/`): `site-families/`, `biomes/`, `archetypes/sections/`, `constellations/`. cosmic-имена назначаются `cosmic.name.pick`, переименование только `cosmic.name.rename` (RFC-0083, имя живёт в 6+ файлах).

### 2.3 Хеш-дисциплина и контракты онбординга

- RFC-0070 — lifecycle input/output + brief contract.
- RFC-0076 — формализация: каждый output-файл несёт header `phase/derivedFromInputHash/generatedAt/generator`. Хеш берётся из `onboarding/.output/00-intake/input-manifest.json`. `onboarding.phase.validate --phase=<...>` отвергает файлы без валидного header.
- RFC-0075 — pipelines rename + workflow self-orchestration (текущая цепочка).
- RFC-0082 — shared multi-doc YAML helper. RFC-0085 — split гейтов author/post-build.
- RFC-0073 — content discipline validators (atoms intent enum, voice, coverage).
- RFC-0087 — content-driven generation: single owner, idempotent, system.md-sourced.

### 2.4 Состояние нумерации

Максимальный существующий RFC = **0134**. Следующий свободный = **RFC-0135**. Существующего RFC про amend/incremental/re-onboarding/content-graph/prober **НЕТ** (проверено grep по `docs/rfcs/`).

---

## 3. Ключевые проблемы, которые RFC ОБЯЗАН решить

- **П-1. Якорь входа после ухода артефактов.** После 06-handoff `onboarding/.input|.output` уезжают в process-repo, а `apps/<id>` может быть извлечён в свой репо. По-батчевые amend-бандлы (`onboarding/.input/amend-<NNN>/`) работают, пока app в монорепо. Нужно: (a) где живёт батч и его `input-manifest`; (b) что остаётся как provenance-след в `apps/<id>` (какой батч что добавил/усилил), чтобы сайт оставался самодостаточным и аудируемым даже вне монорепо. Рекомендация на рассмотрение: сырьё+леджер в `onboarding/.input/amend-<NNN>/` на время работы; иммутабельный подписанный provenance-след (батч-id, хеш, перечень затронутых pageId/atoms) — внутрь `apps/<id>` (перекликается с философией Sichtpass: подписанный накапливаемый архив, см. §6).
- **П-2. Инверсия предусловий vs 00-prepare.** Amend требует `apps/<id>/` СУЩЕСТВУЕТ, biome/constellation уже выбраны, system.md валиден. Нужна amend-версия prepare (напр. `brief.validate --require-app-present` или новая команда `amend.input.validate`).
- **П-3. Ветвление strengthen vs new-route (фаза compose).**
  - _strengthen_: трогаем только `pages/{lang}/<pageId>.md` (+ возможно `prose/`); НЕ меняем `system.md.pages[]`, навигацию, sitemap. Дельта-coverage только по новым атомам.
  - _new-route_: добавляем запись в `system.md.pages[]` (через site-plan.md + `system-md.compile`, не руками), routes.{lang}, navigation, возможно новый constellation/section/biome; затрагивает sitemap/hreflang (RFC-0048/0049) и robots (RFC-0052). Публичный URL — но по решению основателя pause НЕ обязателен (свобода в рамках контрактов); тем не менее это должно попасть в handoff-summary для ревью.
- **П-4. Идемпотентность и повторный прогон.** Тот же батч → тот же результат. Как отличать «новый материал» от «уже принятого» (хеш атомов? sourceId?). Coverage-леджер должен быть кумулятивным по сайту, а не только по батчу.
- **П-5. Дельта-аудит.** 05-audit должен прогоняться по дельте (затронутые страницы), но не ломать уже принятый контент. LLM-кеш — переиспользовать.
- **П-6. Слияние атомов с существующей страницей.** При strengthen — как новые атомы встраиваются в существующие блоки (новые блоки? замена? дополнение body), без потери voice-profile и без дублей (порог similarity, как `section.similarity.report`).
- **П-7. Версионирование контента.** Материалы приходят версиями (v0.8, v0.2…). Нужна политика: батч ссылается на версию источника; как обновлять, когда придёт v0.9.

---

## 4. Предлагаемая форма решения (черновик, уточнить в RFC)

- **Новая цепочка** `.agents/workflows-amend/` (имена-кандидаты фаз): `a0-intake` (валидация app-present + регистрация батча `amend-<NNN>` + манифест/хеш) → `a1-synthesize` (материалы батча → `amend-blueprint.md`: какие pageId усилить, какие новые завести; реюз biome/family из app) → `a2-compose` (ветвление strengthen/new-route; site-plan delta; `system-md.compile` при new-route; section.scaffold при необходимости) → `a3-author` (дельта-атомизация, слияние в страницы, кумулятивный coverage-леджер) → `a4-audit` (дельта-аудит + LLM-кеш) → `a5-handoff` (build, контракты, provenance-след в app, summary с перечнем затронутых маршрутов; `autoRun:false`).
- **Переиспользование kernel-команд** существующих фаз, где возможно; новые команды только для отличий: регистрация батча, app-present-валидация, дельта-coverage, provenance-след. Реестр команд — `tools/kernel.config.ts` (читать в новой сессии, формат отличается от обычного grep — открыть файлом).
- **Контракт батча** (по образцу RFC-0076): `amend-<NNN>/input-manifest.json` + header-дисциплина на output-файлах (`derivedFromInputHash` от манифеста батча).

---

## 5. Что прочитать в новой сессии ПЕРЕД написанием RFC

1. `docs/rfcs/RFC-0075-...md`, `RFC-0076-...md`, `RFC-0070-...md` — полностью (контракты, которые расширяем).
2. `docs/rfcs/RFC-0085`, `RFC-0087`, `RFC-0073`, `RFC-0082` — гейты/идемпотентность/coverage.
3. `docs/rfcs/RFC-0048`, `RFC-0049`, `RFC-0052` — маршруты/sitemap/hreflang/robots (важно для new-route ветки).
4. `docs/rfcs/RFC-0083` — cosmic.name.rename (если new-route заводит секции).
5. `tools/kernel.config.ts` — какие команды зарегистрированы, как добавлять новые.
6. `apps/warpgogol-com/AGENTS.md` и `apps/warpgogol-com/src/content/AGENTS.md` — локальные правила приложения.
7. `docs/app-onboarding-guide.md`, `docs/architecture-dna.md` — общая картина.
8. `.agents/rules/` — глобальные правила агентов.
9. Бегло — `packages/ontology/site-families/`, `.../constellations/`, `.../archetypes/ sections/`, `.../biomes/` — чтобы знать, что переиспользуется при new-route.

---

## 6. Бренд-контекст из приложений (чтобы RFC «звучал» в экосистеме)

Материалы описывают продукт **Digitales Fundament** и его грани как «цифрового объекта»: Sichtpass (внутренний подписанный квартальный паспорт сайта, накапливаемый архив, W3C VC, Notausgang/72ч экспорт), Umsicht (симметричный внешний паспорт: когорта/дрейф/ решения; четыре раздела; provenance на каждом утверждении), Empfehler (партнёрство по рекомендации). Тон — «Bodenstation», инженерный, без маркетинговой риторики; provenance и доказуемость важнее интерактивности. Эта философия (иммутабельный подписанный накапливаемый след) — прямой аргумент за provenance-след amend-батчей внутри `apps/<id>` (П-1). cosmic-имена: на странице `digitalesFundament` уже `cosmicStar: Vega`; новые маршруты получат имена через `cosmic.name.pick`.

Конкретный маппинг примеров:

- `digitalesFundament` → **strengthen** существующего pageId (материал Angebot+Geschäftswert).
- `empfehler` / `sichtpass` / `umsicht` → **new-route** (новые pageId/лендинги).

---

## 7. Предложение по структуре RFC (на утверждение в новой сессии)

Вариант на рассмотрение — **два RFC**:

- **RFC-0135 — Amend-onboarding lifecycle & batch contract.** Жизненный цикл до-приёма, контракт amend-батча (`amend-<NNN>` + manifest + header-дисциплина), provenance-след в app, инверсия предусловий (app-present), дельта-coverage, идемпотентность, ветвление strengthen/new-route, политика версий источника. (Решает П-1,2,3,4,6,7.)
- **RFC-0136 — Amend workflow chain & validators.** Сама цепочка `.agents/workflows-amend/`, новые kernel-команды, дельта-аудит, расширение `workflow.lint`, точки pause (нехватка материала; legal/факт. утверждения), интеграция с handoff. (Решает П-5 + орк.)

Либо один объединённый RFC-0135, если основатель предпочтёт монолит. Решить на старте.

---

## 8. Статус

- [x] Изучена архитектура (workflows, контент-модель, RFC-контракты, нумерация).
- [x] Сняты 4 ключевых решения у основателя (см. §1).
- [ ] Прочитать reading list (§5).
- [ ] Написать RFC(ы) (§7).
- [ ] Ревью основателя → реализация.
