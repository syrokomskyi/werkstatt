---
rfcId: RFC-0739
auditId: AUDIT-RFC-0739-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0739

## Verdict: Needs revision

RFC-0739 содержит несколько серьёзных находок: (1) golden test vector 2 имеет неверное ожидаемое значение (3390 вместо 3400), (2) `status: "error"` в failure modes не соответствует существующему enum `PbpDerivationStatus` (`"derived" | "skipped" | "failed"`), (3) trace не имеет определённого пути возврата через `PbpDerivationResult`, (4) `big.js` не указан как зависимость, (5) ADR-012 цитируется без spec-namespace префикса.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0739` вернул 0 нарушений.

## Axis A — Structural completeness

- **A1: `computeCurrencyConversion` signature принимает generic тип вместо specific.** Функция `computeCurrencyConversion(graph: PbpResolvedGraph, contract: PbpDerivationContract)` (строка 407) принимает `PbpDerivationContract`, но ей нужен доступ к `contract.parameters.ratePolicyRef`, `contract.parameters.rateSnapshotRef`, `contract.parameters.pipeline`. Существующий `PbpDerivationContract.parameters` — `Record<string, unknown>`. RFC не документирует type guard, Zod-парсинг или cast, через который specific parameters извлекаются из generic contract. Нужно либо изменить сигнатуру на `PbpCurrencyConversionDerivation`, либо описать механизм извлечения.

- **A2: `PbpCurrencyConversionDerivation` не явно наследует `PbpDerivationContract`.** Интерфейс `PbpCurrencyConversionDerivation` (строки 374-384) повторяет поля `derivationRef`, `contractVersion`, `implementationVersion`, `requiredInputs`, `parameters` с другим типом `parameters`. Отношение к `PbpDerivationContract` не указано — `extends` или структурная совместимость. Нужно явно указать `extends PbpDerivationContract` или объяснить структурную совместимость.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-1, DNA-55]` — оба инварианта реальны и обоснованы в теле RFC (строки 329-334). Конфликтов с существующими DNA нет.

## Axis C — Ecosystem fit

- **C1: `packages/pbp/AGENTS.md` не упомянут.** RFC добавляет новые экспорты (`PbpCurrencyConversionDerivation`, `PbpPriceDerivationPipeline`, `PbpRoundingMode`, `PbpPriceEndingMode`, `PbpCurrencyConversionTrace`, `computeCurrencyConversion`). `packages/pbp/AGENTS.md` содержит раздел "API surface" с перечислением всех экспортов — его нужно обновить. RFC не упоминает это.

- **C2: Compass XML sync не идентифицирован.** Добавление новых типов в `@warpgogol/pbp` может потребовать обновления `docs/knowledge-graph.xml` или `docs/technology.xml`. RFC не идентифицирует какие `docs/*.xml` файлы нуждаются в синхронизации.

## Axis D — Forward-only compliance

No issues. RFC добавляет новый derivation branch в `executeContract` — это аддитивное расширение, не compatibility layer. Нет legacy code paths, нет dual-path, нет deprecation.

## Axis E — Agent-facing policy

- **E1: Implementation notes не цитируют конкретные RFC для governance rules.** Строка 472: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" — не ссылается на конкретный RFC, управляющий accepted→implemented переходом. Строка 474: "Agents MUST NOT weaken or remove enforcement rules ... without a new RFC that supersedes it" — не цитирует RFC для supersede escalation. Минорное замечание — другие RFC в программе (0736, 0737, 0738) имеют тот же паттерн, так что это консистентно, но всё же finding.

## Axis F — Pragmatism

- **F1: `big.js` не в зависимостях.** RFC утверждает "we use big.js" (строка 254) и "big.js is the chosen library" (строка 446). Однако `big.js` отсутствует в `packages/pbp/package.json` dependencies (проверено: только `@warpgogol/content-source`, `@warpgogol/fingerprint`, `@warpgogol/share`, `@warpgogol/site-kernel-content`, `astro`, `zod`). RFC должен отметить в implementation notes или file system responsibilities, что `big.js` нужно добавить как зависимость.

## Axis G — Blind spots

- **G1: `PbpDerivationStatus` mismatch — КРИТИЧЕСКОЕ.** RFC использует `status: "error"` в failure modes (строки 431-432). Существующий enum `PbpDerivationStatus` (в `packages/pbp/src/derivation.ts:8`) содержит только `"derived" | "skipped" | "failed"`. Значение `"error"` не валидно. Нужно использовать `"failed"` вместо `"error"`, либо RFC должен предложить расширение enum (что потребует amend RFC-0431).

- **G2: ADR-012 citation без spec-namespace.** RFC ссылается на "ADR-012" (строки 76, 444) без префикса spec namespace. Согласно правилам AGENTS.md, spec decisions должны цитироваться как `pbp-specification-package/ADR-012`, не bare `ADR-012`. ADR-012 находится в `docs/specs/pbp-specification-package/07-PBP-Decision-Log.md:111`.

- **G3: Golden test vector 2 имеет неверное ожидаемое значение — КРИТИЧЕСКОЕ.** Test vector 2 (строки 268-275): source=70.00, rate=46.18, percentageAdjustment=5.00%, rounding=ceiling to 10, priceEnding=none. Расчёт: 70 × 46.18 = 3232.60; 3232.60 × 1.05 = 3394.23; ceiling(3394.23, 10) = 3400. Ожидаемое значение в RFC: 3390.00. Правильное ожидаемое значение: **3400.00**. Остальные test vectors (1, 3, 4, 5) проверены и корректны.

- **G4: `decimalDivide` precision не специфицирован.** `decimalDivide(a: string, b: string, precision: number): string` (строка 250) не определяет, что означает `precision` (decimal places? significant digits?). Для `source-per-target` direction (деление 70.00 / 0.02165 = 3232.68...) выбор precision влияет на результат. RFC должен указать стратегию выбора precision (например, "precision = decimal places of target currency minor unit + 2 guard digits").

- **G5: Trace return path не определён — КРИТИЧЕСКОЕ.** `PbpCurrencyConversionTrace` (строки 415-424) объявлен как "an additional output consumed by RFC-0740" (строка 425). Однако существующий `PbpDerivationResult` (в `packages/pbp/src/derivation.ts:46-55`) не имеет поля `trace`. RFC говорит "The result is a `PbpDerivationResult`" (строка 180), но не объясняет, как trace возвращается рядом с результатом. Варианты: (a) добавить `trace?: unknown` в `PbpDerivationResult` (требует amend RFC-0431), (b) встроить trace в `value` field рядом с amount/currency/priceKind, (c) предложить новый return type. RFC должен выбрать и задокументировать вариант.

## Questions for the author

1. Как trace возвращается из `computeCurrencyConversion`? Нужно ли добавить поле `trace` в `PbpDerivationResult` (amend RFC-0431), или trace встраивается в `value`?
2. Должен ли `PbpCurrencyConversionDerivation` явно `extends PbpDerivationContract`? Если да, то `parameters` становится ковариантным — совместимо ли это с dispatch через `executeContract`?
3. Какой precision strategy используется для `decimalDivide` при `source-per-target` direction? Сколько guard digits?
