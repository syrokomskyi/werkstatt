---
rfcId: RFC-0743
auditId: AUDIT-RFC-0743-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0743

## Verdict: Needs revision

RFC-0743 содержит несколько структурных неточностей (имя файла манифеста, отсутствующие поля манифеста, отсутствует `.css` в Mirror Quintet), пробел в передаче данных проекции и противоречие между запретом показа исходной цены и fallback-поведением. Эти находки требуют исправления до реализации.

## Mechanical validation (rfc.validate)

**Pass** — 0 нарушений. `rfc.validate --id RFC-0743 --json` вернул `status: pass`, `violations: []`.

## Axis A — Structural completeness

1. **Имя файла манифеста не соответствует конвенции.** RFC указывает `manifest.yaml` (строки 100, 185, 188), но конвенция репозитория (per `packages/ui/AGENTS.md`) требует `<slug>-component.manifest.yaml`. Все существующие компоненты используют этот паттерн: `lang-switcher-component.manifest.yaml`, `copyright-component.manifest.yaml`, `donation-card-component.manifest.yaml`.

2. **Неполный список полей манифеста.** RFC перечисляет `id`, `cosmicName`, `layer`, `semanticId`, `role`, `version`, `intent[]`, `industryFit[]`, `contentSchemaKey` (строка 102). Фактические манифесты также содержат `uniName`, `archetype`, `contentTypesPath`, `propsSchema` — все они присутствуют во всех существующих компонентах. `packages/ui/AGENTS.md` явно требует `uniName` и `archetype`.

3. **Отсутствует `.css` в Mirror Quintet.** DNA-17 package-side quintet: `.astro` + `manifest.yaml` + content schema + `.css` + content `.md`. RFC перечисляет `.astro`, `manifest.yaml`, content schema `.ts`, content `.md` (строки 100-104) — но опускает `.css`. Таблица файловой системы (строки 181-189) также не содержит `.css` файлов ни для одного из двух компонентов.

4. **Отсутствует content `.md` для `currency-aware-price-display`.** Таблица файловой системы (строки 187-189) перечисляет `.astro`, `manifest.yaml`, `.schema.ts` — но не content `.md`, который является частью Mirror Quintet (DNA-17).

5. **Несоответствие имени события.** Строка 84: "Dispatches a `currency-change` event". Строки 112, 172: `wg-currency-change`. Текст Decision и TypeScript-контракт расходятся в имени события.

6. **Rollout утверждает замену существующего компонента, но такового нет.** Строка 205: "The price display component replaces any existing price display." В `packages/ui/src/components/` нет компонента с `price` в имени. Существующий price display — это section `price-card` в `packages/ui/src/sections/price-card/`. RFC должен уточнить: заменяет ли `currency-aware-price-display` section `price-card`, или это новый компонент, который дополняет `price-card`?

## Axis B — DNA alignment

1. **DNA-5 / DNA-17 — Mirror Quintet неполон.** RFC заявляет соответствие, но опускает `.css` (см. Axis A #3) и не перечисляет `uniName`, `archetype` в манифесте (см. Axis A #2).

2. **`@warpgogol/ontology` не указан в `packagesImpacted`.** DNA-17 требует `cosmicName` из `MoonCatalog` и `role` из `ComponentRoleValues` — оба из `@warpgogol/ontology`. Два новых компонента требуют новых cosmic names в каталоге. RFC должен указать `@warpgogol/ontology` как затронутый пакет.

3. **Расположение content schema.** RFC помещает схему в `packages/ui/src/components/currency-selector/currency-selector.schema.ts` (строка 186). DNA-17 говорит: "content schema in `@warpgogol/ontology`". Существующие компоненты используют `contentTypesPath: ./<slug>-component.types.generated.ts` — сгенерированный файл, а не авторскую схему. RFC должен уточнить, где именно живёт схема — в `@warpgogol/ontology` или в компоненте.

4. **DNA-15 — путь client script.** DNA-15 буквально говорит "bounded feature-scoped `*.client.ts` files under `src/content/**/`". RFC помещает скрипт в `packages/ui/src/components/` (строка 184). Существующие прецеденты (`donation-card-component.client.ts`, `copyright-component.client.ts`) подтверждают, что паттерн принят в `packages/ui/`, но DNA-15 текст относится к `src/content/**/`. Это не блокер (есть прецедент), но стоит уточнить.

## Axis C — Ecosystem fit

1. **`@warpgogol/share` в `packagesImpacted` не обоснован.** RFC не объясняет, что меняется в `@warpgogol/share`. Entitlement gate — RFC-0741, projection — `@warpgogol/pbp`. Единственная возможная причина — регистрация в `MOON_IMPORT_PATHS` (per `packages/ui/AGENTS.md`), но RFC этого не упоминает.

2. **`@warpgogol/pbp` не указан в `packagesImpacted`.** `currency-aware-price-display` потребляет `PbpPriceProjection` из `@warpgogol/pbp`. Даже если это только импорт типов, пакет должен быть указан.

3. **Cosmic naming не адресован.** RFC не предлагает cosmic names для двух новых компонентов. DNA-17 требует `cosmicName` из `MoonCatalog`. RFC должен либо предложить имена, либо указать, что они будут выбраны во время реализации (через `cosmic.name.pick` или аналогичную команду).

4. **`MOON_IMPORT_PATHS` регистрация не упомянута.** `packages/ui/AGENTS.md`: "register its `cosmicName` in `MOON_IMPORT_PATHS` in `packages/share/src/page.ts` in the same change." RFC не упоминает этот шаг.

## Axis D — Forward-only compliance

1. **"No backward compatibility" неточен.** Строка 205: "The price display component replaces any existing price display." Если заменяется section `price-card`, это значительное изменение, которое должно быть задокументировано. Если ничего не заменяется, утверждение вводит в заблуждение. Forward-only discipline требует ясности: что именно удаляется?

2. **Остальное — без проблем.** Нет shims, нет dual-paths, нет grace periods.

## Axis E — Agent-facing policy

1. **Status gate корректен.** Implementation notes: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Правильно.

2. **Storage policy.** `localStorage` key `wg-currency` — client-side persistence, разрешено. Нет `document.cookie`, нет `Set-Cookie`. Без проблем.

3. **No `NEEDS CLARIFICATION` markers.** Не найдены.

4. **Implementation notes** — явные поведенческие правила. Хорошие указания: "Never show the source EUR price", "Never use `≈`", "The disclosure note comes from the projection's `display.note` field — do not compose it in the component."

## Axis F — Pragmatism

1. **Два компонента вместо одного.** `currency-selector` (выбор) и `currency-aware-price-display` (отображение) имеют разные ответственности. Разделение оправдано.

2. **`CurrencySelectorContent` схема минимальна.** Только `label` и `currencies[]` с `code` и `label`. Lean. Хорошо.

3. **Scope discipline.** `packagesImpacted` неполон (см. Axis C #1, #2, Axis B #2), но `appsImpacted: [warpgogol-com]` корректен.

## Axis G — Blind spots

1. **Механизм client-side data swap не описан.** Строка 121: "Switching currencies is a client-side data swap — no network request." Но как именно `currency-aware-price-display` перерисовывается? Варианты: pre-render всех вариантов в HTML + show/hide via CSS; JSON в `<script type="application/json">` + DOM update; другой механизм. RFC не specifies это, что является значительным пробелом в реализации.

2. **Поток данных проекции.** Строка 91: "Reads the `PbpPriceProjection` for the selected currency from the page's projection data." Как projection data передаётся в компонент? Через props? Через data-attribute? Через global? RFC не описывает механизм передачи данных.

3. **Отсутствует `.client.ts` для `currency-aware-price-display`.** RFC говорит "Price display components listen for `wg-currency-change` and re-render" (строка 113), но таблица файловой системы (строки 187-189) не содержит `.client.ts` для этого компонента. Как он слушает событие без client script?

4. **FOUC mitigation механизм.** RFC предлагает "the script runs as early as possible (inline in `<head>`)" (строка 217). Но Astro компоненты typically render in-place, не в `<head>`. Механизм инъекции скрипта в `<head>` не описан.

5. **Противоречие: запрет source price vs fallback.** Строка 94: "Does NOT show the source EUR price (decision #31)". Строка 96: "Falls back to source-currency price if no projection exists for the selected currency." Если projection отсутствует, компонент показывает source-currency price — но строка 94 запрещает показ source EUR price без квалификатора "alongside". Decision #31 (RFC-0735) говорит "Do NOT show source EUR price **alongside** derived price" — то есть не показывать оба одновременно. Fallback показывает source price один (не alongside), что не противоречит decision #31, но противоречит более сильной формулировке RFC-0743. Нужно уточнить формулировку.

6. **Accessibility re-rendering.** RFC говорит disclosure note — `aria-live` region (строка 138). Но при смене валюты обновляется ли сам price в `aria-live`? Если только note live, screen reader не объявит изменение цены.

## Questions for the author

1. Какой механизм client-side data swap используется для перерисовки цены при смене валюты (pre-render + show/hide, JSON + DOM update, другой)? Где `.client.ts` для `currency-aware-price-display`?
2. Как projection data (`PbpPriceProjection`) передаётся из route registry в компонент — через props, data-attribute, или global?
3. Заменяет ли `currency-aware-price-display` существующий section `price-card`, или это новый компонент, дополняющий `price-card`? Если заменяет — опишите миграцию.
