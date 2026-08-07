---
rfcId: RFC-0741
auditId: AUDIT-RFC-0741-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0741

## Verdict: Needs revision

RFC содержит несколько фактических ошибок о текущей архитектуре пайплайна и entitlement-системы, включая неверное размещение `entitlement.module.validate`, ссылку на несуществующий шаг `website-projection.generate` и сигнатуру `readEntitledFeatures`, которая не совпадает с реальной. Кроме того, RFC не использует существующий декларативный механизм `gate.conditional.entitlement`, а вместо этого предлагает императивные проверки.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0741` reported 0 violations.

## Axis A — Structural completeness

1. **Пайплайн-диаграмма неверна (строки 136-144).** RFC помещает `entitlement.module.validate` в `build-prepare` пайплайн как существующий шаг. На самом деле `entitlement.module.validate` находится в `sites-check-author` пайплайне (`@/packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:148`), а не в `build-prepare`. В `build-prepare` есть только `entitlements.resolve` (`@/packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:49`), но нет `entitlement.module.validate`. Диаграмма вводит реализующего агента в заблуждение.

2. **`website-projection.generate` не существует (строка 76).** RFC утверждает, что новые шаги должны выполняться «before projection generators» и «before `website-projection.generate`». В `build-prepare` пайплайне нет такого шага, и grep по всему кодбейзу не находит `website-projection`. Если имеются в виду `surface.generate` или `agent.manifest.generate`, нужно указать их.

3. **Route registry enrichment under-specified (раздел 7, строки 166-175).** Кодовый блок содержит комментарий `// Fold currency-aware price projection data into the registry` без реальной логики. Раздел не объясняет, какие именно данные добавляются в `LocalizedRouteEntry` и как они потребляются при рендеринге. Acceptance criterion «Route registry enriches offering pages when entitled» непроверяем без конкретизации.

## Axis B — DNA alignment

1. **`satisfies: [DNA-49]` декоративно (строки 24, 180).** DNA-49 описывает fleet propagation (Leitstand deployment). Обоснование в Architectural fit: «Entitlement gating is part of the build pipeline, which feeds into the fleet propagation chain» — это верно для любого шага `build-prepare`. RFC не объясняет, как он *конкретно* защищает или расширяет DNA-49. Если связь с DNA-49 существенна, нужно описать механизм. Если нет — убрать из `satisfies`.

## Axis C — Ecosystem fit

1. **`packagesImpacted` не включает `@warpgogol/pbp` (строка 40).** `currency-pricing.compile` читает CurrencyPricingPolicy (PBP-сущность), `rate-snapshot.resolve` читает RatePolicy и RateSnapshot (PBP-сущности). Обработчики команд в `site-kernel-checks` будут импортировать типы из `@warpgogol/pbp`. Пакет должен быть указан.

2. **Не используется существующий декларативный механизм `gate.conditional.entitlement` (строки 149-156).** В кодбейзе уже есть паттерн: `CheckCommandEntry.gate.conditional.{ kind: "entitlement", ref: "pseo" }` — используется в `surface.hub.validate`, `surface.industry.validate`, `pseo.validate` (`@/packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts:121-129`). RFC предлагает императивные проверки `readEntitledFeatures()` внутри каждого обработчика. Нужно использовать существующий декларативный механизм для консистентности.

3. **`SITES_BUILD_PREPARE_DEV_PIPELINE` не рассмотрена (строка 133).** Существует dev-версия пайплайна (`build-prepare.ts:157-207`), которая также содержит `entitlements.resolve` (строка 170). RFC не указывает, должны ли multi-currency шаги быть в dev-пайплайне. Если dev-итерация требует derived prices, шаги должны быть включены.

4. **Не указаны AGENTS.md и Compass XML обновления.** RFC не идентифицирует, какие `AGENTS.md` файлы нуждаются в обновлении (root, `packages/share/AGENTS.md`, `packages/os/site-kernel-checks/AGENTS.md`). Не указано, какие `docs/*.xml` требуют синхронизации.

## Axis D — Forward-only compliance

No issues. RFC расширяет пайплайн без backward compatibility слоёв. Сайты без entitlement пропускают новые шаги.

## Axis E — Agent-facing policy

1. **Сигнатура `readEntitledFeatures` неверна (строка 152).** RFC вызывает `readEntitledFeatures(context.workspace)` без `await`. Реальная функция (`@/packages/os/site-kernel-checks/src/lib/entitlements.ts:20`) принимает `appDir: string` (не `workspace`) и возвращает `Promise<string[] | null>`. Кодовый пример введёт реализующего агента в ошибку типа и логики.

2. **`commands.changed` вводит в заблуждение (строки 33-34).** `entitlements.resolve` и `entitlement.module.validate` перечислены как «changed», но ни один из них не требует изменений кода. `entitlements.resolve` уже резолвит фичи из каталога `ENTITLED_FEATURES` — добавление `"multi-currency"` в каталог достаточно. `entitlement.module.validate` уже читает `entitlement` из surface module context. Раздел 6 (строки 160-162) подтверждает: «The validator enforces that the module is only compiled when the feature is entitled» — это существующее поведение, не изменение. Уберите из `changed` или уточните, какие именно изменения нужны.

## Axis F — Pragmatism

1. **Дублирование валидации с RFC-0740 (строки 123-129).** `currency-pricing.compile` валидирует CurrencyPricingPolicy: «All target currencies are registered», «All ratePolicyRefs resolve», «All derivationContractRefs resolve», «`currentUses` is valid». RFC-0740 (раздел 4) уже определяет 24 правила валидации компилятора. RFC не разграничивает, какие проверки выполняет `currency-pricing.compile`, а какие — `derived-prices.materialize`. Нужно явно разделить ответственность.

## Axis G — Blind spots

1. **Зависимость от RFC-0744 (draft).** `rate-snapshot.resolve` — «thin wrapper» для Rate Fetcher Service (RFC-0744), который находится в `draft` статусе. RFC не описывает, что произойдёт, если сервис не развёрнут. Для `mode: "business-fixed"` внешний сервис не нужен — ставки берутся из RateSchedule. Но для `mode: "external"` команда не сможет работать. Нужно описать fallback или поэтапный rollout.

2. **Нет оценки производительности новых шагов.** `rate-snapshot.resolve` выполняет сетевые запросы к внешнему API. Сколько времени это занимает? Какой timeout? RFC-0740 указывает `expectedDurationMs` для тяжёлых шагов (например, `image.variants.generate: 60_000`). RFC-0741 не указывает `expectedDurationMs` / `timeoutMs` для новых шагов.

3. **Edge case: сайт без CurrencyPricingPolicy.** Failure modes (строка 270) описывают ошибку для `currency-pricing.compile`, но не описывают поведение пайплайна в целом. Должен ли пайплайн продолжаться? Должен ли `derived-prices.materialize` пропускаться?

## Questions for the author

1. Почему `entitlement.module.validate` помещён в `build-prepare` диаграмму, если он фактически находится в `sites-check-author` пайплайне? Нужно ли переместить его в `build-prepare`, или диаграмма просто ошибочна?
2. Какой конкретно шаг `build-prepare` является «projection generator», перед которым должны выполняться multi-currency шаги? `website-projection.generate` не существует.
3. Почему используется императивная проверка `readEntitledFeatures()` вместо существующего декларативного `gate.conditional.entitlement` паттерна?
4. Должны ли multi-currency шаги быть включены в `SITES_BUILD_PREPARE_DEV_PIPELINE`? Если да, то какие именно (все три или только `derived-prices.materialize`)?
5. Что произойдёт с `rate-snapshot.resolve` для `mode: "external"`, если Rate Fetcher Service (RFC-0744) не реализован? Каков fallback?
