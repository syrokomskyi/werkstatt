---
reviewId: REVIEW-CODE-2026-08-18-01
date: 2026-08-18
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: HEAD...working-tree
filesReviewed:
  - packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts
  - packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts
  - packages/werkstatt-site/src/domain/pbp/index.ts
  - packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts
  - packages/werkstatt/src/nachweis/nachweis-io.ts
  - packages/werkstatt/src/nachweis/nachweis-validate.ts
  - packages/werkstatt/src/nachweis/nachweis-publish.ts
  - packages/werkstatt/src/nachweis/nachweis-manifest.ts
  - packages/werkstatt/src/nachweis/nachweis-withdraw.ts
  - packages/werkstatt/src/nachweis/index.ts
  - packages/werkstatt/src/tests-handoff/nachweis-commands.test.ts
  - packages/werkstatt/src/tests-handoff/nachweis-rfc-0872.test.ts
---

# Code Review: RFC-0872 — Technical Assessment PBP Contract and Policy-Driven Nachweis Publication Gates

### Verdict: Needs revision

Diff реализует policy-driven V2 publication gates и новый evidence kind `technical-assessment`. Архитектурно корректно, но есть два серьёзных находка: (1) дублирование логики gate evaluation между `nachweis-validate.ts` и `nachweis-publish.ts` (~70 строк), и (2) ослабленная валидация `assessmentMetadataValid` в `nachweis-publish.ts` по сравнению с `nachweis-validate.ts`.

### Mechanical floor

**Pass.** `@warpgogol/werkstatt` build: 0 errors. `@warpgogol/werkstatt-site` build: 0 новых ошибок (pre-existing Astro env type errors only). 29/29 новых тестов проходят. 2 существующих теста обновлены и проходят.

### Axis A — Structural correctness

- **Duplicated Code (Fowler)** — логика вычисления gate conditions полностью дублируется между `evaluateGateV2` в `nachweis-validate.ts:110-179` и inline-блоком в `nachweis-publish.ts:115-184`. ~70 строк скопированы дословно: вычисление `consentGranted`, `sourceIntegrityVerified`, `recordApproved`, `verificationLevelMet`, `publicDerivativeReady`, `legalContentCheckPassed`, `canonicalRawArtifactVerified`, `assessmentMetadataValid`, `executionAuthorizationBasisPresent`, построение `conditionResults`, маппинг в `conditions`, вычисление `allPassed`. Нужно извлечь общую функцию `evaluateGateV2` в `nachweis-io.ts` (или общий helper) и использовать из обоих модулей.

- **Divergent validation (Fowler — Divergent Change)** — `assessmentMetadataValid` в `nachweis-publish.ts:145-150` проверяет только `profile`, `seriesId`, `observationId`, `observedAt` (4 поля). В `nachweis-validate.ts:181-195` `validateAssessmentMetadata` проверяет дополнительно `methodology.runCount`, `freshness.maxAgeDays`, `dimensions` (7 проверок). Publish пропустит запись с невалидной methodology/freshness/dimensions, а validate отклонит её — **gate inconsistency**. Результат: запись может быть опубликована, но тут же провалит validate.

- **Primitive Obsession** — `GateConditionId` типизирован как `string` в `NachweisGateConditionResult.id` (`nachweis-io.ts:98`), хотя есть `GateConditionId` union type. Нужно использовать `GateConditionId` вместо `string` в интерфейсе.

- **Mysterious Name** — `resolveSupportedLangs` в `nachweis-validate.ts:197` использует dynamic import `@warpgogol/werkstatt-shared/content` для `loadSystemManifest`, хотя `parseMarkdownFrontmatter` из того же пакета уже импортирован статически на строке 41. Dynamic import здесь не нужен — это не stack plugin, а shared infrastructure. Нужно заменить на static import.

### Axis B — DNA alignment

- **DNA-64 (stack-agnostic engine)** — `nachweis-validate.ts:199` использует dynamic `import()` для `@warpgogol/werkstatt-shared/content`. `werkstatt-shared` — это не stack plugin, а shared infrastructure (RFC-0868). Dynamic import здесь не нужен и вводит ненужный overhead. Static import уже используется для `parseMarkdownFrontmatter` из того же пакета (строка 41). Не нарушение DNA-64, но непоследовательность.

- Остальные DNA-инварианты не затронуты.

### Axis C — Ecosystem fit

- **Package boundaries** — корректны. `werkstatt` импортирует из `werkstatt-shared` (shared infra), `werkstatt-site` содержит PBP entity types и schemas. Нет `apps → apps` или `services → packages` нарушений.
- **AGENTS.md updates** — MODULE_CONTRACT и CHANGE_SUMMARY обновлены во всех затронутых файлах с ссылками на RFC-0872. Корректно.
- **Compass sync** — `docs/rfcs/rfc-0872-*.md` обновлён (amendedBy на RFC-0706, RFC-0707, RFC-0714). `docs/adrs/adr-0054-*.md` создан. Корректно.

### Axis D — Forward-only compliance

- **Legacy `NachweisPublicationGate` полностью удалён** — заменён на `NachweisPublicationGateV2` во всех файлах, включая barrel `index.ts`. Нет compatibility shim, нет dual-path. Корректно.
- **`evaluateGate` заменён на `evaluateGateV2`** — старая функция удалена, не сохранена как deprecated. Корректно.
- **Тесты обновлены** — `nachweis-commands.test.ts` обновлён для использования V2 gate structure (`conditions` array вместо boolean fields). Корректно.

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT** — все затронутые файлы имеют обновлённые MODULE_CONTRACT и CHANGE_SUMMARY с ссылками на RFC-0872. Корректно.
- **Log-driven development** — `nachweis-withdraw.ts:202` log line включает policy context (`consent revoked` vs `no consent revocation — policy: <policyId>`). Хорошо.
- **No ungrounded assertions** — не найдено.

### Axis F — Pragmatism

- **Minimality ladder** — gate V2 architecture (policy → required conditions → per-condition evaluation) — это правильный уровень абстракции для 3 политик и 9 conditions. Не over-engineered.
- **Existing patterns** — `NACHWEIS_EVIDENCE_KINDS` set расширен во всех 3 местах (validate, manifest, routes) по существующему паттерну. Корректно.
- **Scope discipline** — diff затрагивает только nachweis modules и PBP evidence-source. Нет scope creep.

### Axis G — Blind spots

- **Performance** — locale drift check (`nachweis-validate.ts:446-481`) делает `readPbpEntitiesByType` для каждого supported language. Для N языков и M evidence-source entities — O(N×M) file reads. При типичных N=2-3, M<100 — приемлемо. Не помечено как bottleneck.
- **Edge cases** — locale drift check корректно пропускает single-lang systems (`supportedLangs.length > 1`). Корректно.
- **False positives** — `assessment-on-non-technical-kind` violation может сработать на legacy records, если у них случайно есть `assessment` field. Нет migration path. Нужно документировать.

### Spec compliance

| Requirement from RFC-0872 | Status | Evidence |
| --- | --- | --- |
| Add `technical-assessment` evidence kind | Done | `evidence-source.ts:26`, `evidence-source.ts:38` |
| Add artifact role and canonical fields | Done | `evidence-source.ts:46-47`, `evidence-source.ts:124-125` |
| Add `NachweisTechnicalAssessmentV1` type | Done | `evidence-source.ts:90-105` |
| Add Zod schema for assessment | Done | `evidence-source.ts:39-107` |
| Replace boolean gate with policy-driven V2 | Done | `nachweis-io.ts:88-187` |
| 3 publication policies | Done | `nachweis-io.ts:91-93` |
| 9 gate condition IDs | Done | `nachweis-io.ts:130-140` |
| `evaluateGateV2` in validate | Done | `nachweis-validate.ts:110-179` |
| Technical-assessment validation | Done | `nachweis-validate.ts:345-410` |
| Locale drift check | Done | `nachweis-validate.ts:446-481` |
| V2 gate in publish | Partial | `nachweis-publish.ts:115-184` — duplicated, weakened `assessmentMetadataValid` |
| Manifest observation identity | Done | `nachweis-manifest.ts:138-155` |
| Conditional consent revocation | Done | `nachweis-withdraw.ts:118-134` |
| `technical-assessment` in routes | Done | `nachweis-routes.ts:33` |
| Unit tests | Done | `nachweis-rfc-0872.test.ts` — 29 tests |

### Questions for the author

1. Почему логика `evaluateGateV2` дублируется между `nachweis-validate.ts` и `nachweis-publish.ts` вместо извлечения общей функции? Это приведёт к расхождению при следующих изменениях gate conditions.
2. Почему `assessmentMetadataValid` в `nachweis-publish.ts` проверяет только 4 поля, а `validateAssessmentMetadata` в `nachweis-validate.ts` — 7? Запись может пройти publish gate, но провалить validate — это ожидаемое поведение?
3. Почему `resolveSupportedLangs` использует dynamic import для `@warpgogol/werkstatt-shared/content`, если `parseMarkdownFrontmatter` из того же пакета уже импортирован статически?
