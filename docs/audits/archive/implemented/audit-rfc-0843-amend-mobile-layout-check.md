---
rfcId: RFC-0843
auditId: AUDIT-RFC-0843-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0843

## Verdict: Needs revision

RFC содержит три структурных противоречия и несколько упущенных деталей реализации. Наиболее серьёзные: nonGoals противоречат Design section по `playwright-adapter.ts`, `blockExternalRequests` требует `BrowserContext`, но целевые файлы используют `browser.newPage()` без контекста, и MOBILE-GEO-04 "Before" код не соответствует текущему состоянию кода.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0843` завершается с exit code 0, нарушений нет.

## Axis A — Structural completeness

1. **Противоречие nonGoals vs Design:** nonGoals (строка 45) утверждают "This RFC does not modify the PlaywrightCaptureAdapter in playwright-adapter.ts", но таблица Files to change (строка 138) предписывает `playwright-adapter.ts` использовать `evaluateInPage`. Это прямое противоречие — либо nonGoals должны включить `playwright-adapter.ts`, либо строка 138 должна быть удалена.

2. **MOBILE-GEO-04 "Before" код устарел:** Блок "Before (misleading)" (строки 183-189) показывает `message: "Route timed out in ${orientation} after ${routeTimeoutMs}ms."`, но текущий код (`mobile-layout-check.ts:471`) уже содержит `message: "Route failed in ${orientation}: ${errMsg}"` — частичный фикс был применён в platform 5.51.34. RFC должен показывать текущее состояние как "Before", а не домедийное.

## Axis B — DNA alignment

No issues. `satisfies: []` пусто — RFC амендит реализацию DNA-69 без изменения инварианта. `related: [DNA-69]` корректно. RFC не устанавливает новый DNA инвариант.

## Axis C — Ecosystem fit

1. **Отсутствует деталь рефакторинга для `print-pdf.ts` и `independent-qa.ts`:** Оба валидатора используют `browser.newPage()` напрямую (`print-pdf.ts:256`, `independent-qa.ts:302`) без создания `BrowserContext`. RFC предлагает `blockExternalRequests(context: BrowserContext, ...)` (строка 150), что требует контекст. RFC не упоминает, что эти файлы нужно рефакторить с `browser.newPage()` на `browser.newContext()` + `context.newPage()`. Это нетривиальное изменение, которое должно быть явным в Rollout.

2. **Неопределённость существования `playwright-utils.ts`:** RFC пишет "This file already exists or can be created" (строка 148). Проверено: файл не существует. RFC должен утверждать, что это новый файл.

## Axis D — Forward-only compliance

No issues. Чистая замена `networkidle` на `load`, никаких backward compatibility shims, legacy пути удаляются.

## Axis E — Agent-facing policy

No issues. Status gate корректный (строка 256). Implementation notes ссылаются на RFC-0224 и `rfc.supersede.propose` правильно. NEEDS CLARIFICATION маркеров нет.

## Axis F — Pragmatism

1. **Изменение `playwright-adapter.ts` косметическое:** RFC предлагает обернуть `page.evaluate(extractPageEvidenceFromDOM)` в `evaluateInPage(page, extractPageEvidenceFromDOM)`. Но `extractPageEvidenceFromDOM` — уже функция (`dom-extract.ts`), не строка. Footgun здесь не применим. Это косметический churn, который противоречит nonGoals. Либо убрать из Design, либо убрать из nonGoals.

## Axis G — Blind spots

1. **`print-pdf.ts` не имеет settle wait:** Risks section (строка 237) упоминает `page.waitForTimeout(2000)` "if not already present", но не проверяет. Подтверждено: `print-pdf.ts` не имеет ни `waitForTimeout`, ни `SETTLE_WAIT_MS`. Это должно быть явным acceptance criterion, а не примечанием в Risks.

2. **`result.timeout` устанавливается для всех ошибок:** Текущий код `mobile-layout-check.ts:464-465` устанавливает `result.timeout = true` и `timedOut = true` для ВСЕХ ошибок, не только таймаутов. RFC фиксирует сообщение MOBILE-GEO-04, но не затрагивает поле `timeout` в `RouteResult`. Это вводит в заблуждение — поле `timeout` должно быть `true` только для реальных таймаутов.

3. **`page.evaluate` в целевых файлах уже использует функции:** `print-pdf.ts:262` и `independent-qa.ts:342` уже передают функции в `page.evaluate()`, не строки. `evaluateInPage` wrapper — это конвенция для этих файлов, не багфикс. RFC должен уточнить, что wrapper вводится как конвенция, а не как фикс существующего бага в этих файлах.

## Questions for the author

1. Должны ли `print-pdf.ts` и `independent-qa.ts` использовать `page.route()` (проще, single-page scope) или `browser.newContext()` + `context.route()` (соответствует сигнатуре `blockExternalRequests`)? Текущий код не использует контексты.
2. Должно ли поле `result.timeout` в `RouteResult` фиксироваться — устанавливать `true` только для реальных таймаутов, или переименовано в `failed`?
3. Должно ли изменение `playwright-adapter.ts` быть удалено из Design (соответствует nonGoals) или nonGoals должны быть обновлены?
