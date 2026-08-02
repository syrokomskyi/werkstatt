---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8ad561df~1...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/rfcs/rfc-0657-dev-deploy-cdn-freshness-check-retry-with-exponential-backoff.md
  - docs/rfcs/rfc-0649-axiom-gate-freshness-guarantee-for-dev-deploys.md
---

# Код-ревью: RFC-0657 — retry с экспоненциальным backoff для freshness-проверки

### Вердикт: Needs revision

Реализация корректна функционально — retry-цикл, константы, тесты и документация все на месте. Найдено два мелких нарушения: неточность в `CHANGE_SUMMARY` тестов (упоминание fake timers, хотя фактически используется `setTimeout` stub) и мёртвый код `vi.useRealTimers()` в `afterEach`.

### Механический этаж

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (exit 0), `vitest run src/tests/leitstand-0649-freshness.test.ts` (8/8 pass), `rfc.validate --id RFC-0657` (exit 0), `rfc.validate --id RFC-0649` (exit 0).

### Ось A — Структурная корректность

- **Мёртвый код**: `vi.useRealTimers()` в `afterEach` (строка 181) — без `vi.useFakeTimers()` в тестах этот вызов является no-op. Остался после перехода с fake timers на `setTimeout` stub. Следует удалить.
- В остальном: константы `FRESHNESS_MAX_ATTEMPTS` и `FRESHNESS_BACKOFF_DELAYS_MS` именованы, retry-цикл лаконичен, обработка ошибок корректна (catch → continue → lastError).

### Ось B — DNA-соответствие

No issues. DNA-49 описывает freshness-проверку как single-fetch; RFC-0657 amends RFC-0649, и `amendedBy` обновлён. Retry не нарушает инвариант — он усиливает гарантию freshness, а не ослабляет её.

### Ось C — Ecosystem fit

No issues. `AGENTS.md` обновлён с описанием retry-поведения. Пакетные границы соблюдены — все изменения внутри `site-kernel-handoff`. Командная поверхность не изменена.

### Ось D — Forward-only compliance

No issues. Single-fetch заменён на retry без shim-слоя. `sleep(6_000)` удалён, не оставлен за флагом. `FreshnessResult.attempts` — новое обязательное поле, все конструкции обновлены.

### Ось E — Agent-facing clarity

- **Неточность в `CHANGE_SUMMARY`**: строка 8 тестового файла гласит "use fake timers for retry delay avoidance", но фактически используется `vi.stubGlobal("setTimeout", ...)` через хелпер `skipSleep()`. Следует обновить текст на "use setTimeout stub for retry delay avoidance".
- В остальном: `MODULE_CONTRACT` и `CHANGE_SUMMARY` обновлены, комментарии ссылаются на RFC-0657, имена переменных ясны.

### Ось F — Pragmatism

No issues. Хардкод констант обоснован RFC (nonGoals: "Making retry constants configurable per-site — hardcoded constants are sufficient"). Изменения минимальны и сфокусированы.

### Ось G — Blind spots

No issues. Worst-case время (45s) задокументировано в RFC Risks. Тесты покрывают: first-attempt success, retry-then-success, all-attempts-fail (HTTP 404 + hash mismatch), network error, null adapter skip. `skipSleep()` безопасен в контексте тестов — `spawn` и `execSync` замоканы, других `setTimeout` потребителей нет.

### Spec compliance

| Требование RFC | Статус | Evidence |
| --- | --- | --- |
| 5 попыток: первая немедленно, затем 3s/6s/12s/24s | Done | `leitstand-commands.ts:159-218` |
| `FreshnessResult.attempts` | Done | `leitstand-commands.ts:155` |
| Axiom gate при успехе на любой попытке | Done | Test "retry-then-success" — `attempts === 2`, `axiom.status === "pass"` |
| Exit 1 при провале всех попыток | Done | Test "all-attempts-fail with HTTP 404" — `exitCode === 1` |
| null adapter skip | Done | Test "null adapter skips" — `attempts === 0` |
| Unit tests покрывают все сценарии | Done | 8 тестов, все pass |
| `rfc.validate` проходит | Done | exit 0 |

### Вопросы автору

1. `vi.useRealTimers()` в `afterEach` — это намеренный защитный вызов или остаток от fake timers? Если остаток — удалить.
2. `CHANGE_SUMMARY` упоминает "fake timers", но реализация использует `setTimeout` stub — обновить текст?
