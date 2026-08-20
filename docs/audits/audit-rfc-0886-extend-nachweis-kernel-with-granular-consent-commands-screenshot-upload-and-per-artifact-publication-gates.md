---
rfcId: RFC-0886
auditId: AUDIT-RFC-0886-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0886

## Verdict: Needs revision

RFC-0886 демонстрирует сильную архитектурную проработку и точно нацелен на пробелы, оставленные RFC-0885. Однако несколько находок требуют исправления: противоречие между `storage: "public"` в TypeScript-контракте и `storage: "private"` в разделе Risks, несоответствие R2 path prefix между Design и Implementation notes, отсутствие явного обновления `consent-granted` в `REQUIRED_CONDITIONS`, и путаница между `nachweis.validate` как warn-only и exit-code-1 в Failure modes.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0886` сообщает 0 violations, exitCode 0.

## Axis A — Structural completeness

- **CLI surface**: Команды показаны с флагами и scope — корректно. Однако `nachweis.consent.update --status denied` в примере (line 130) не передаёт `--method`, хотя `method` требуется для `consentScope[scope].method` по схеме RFC-0885. Нужно уточнить: является ли `--method` опциональным (default `"none"`) или обязательным для `--status granted` только.
- **TypeScript contracts**: Минимальны и достаточны. `NachweisConsentUpdateResult` расширяет текущий интерфейс в `nachweis-io.ts:340-346` — поле `scope` добавляется, `previousStatus`/`newStatus` сохраняются. Корректно.
- **File system responsibilities**: Таблица (lines 235-242) перечисляет 6 файлов. Все пути существуют и проверены против текущего кода. `nachweis-publish.ts` отмечен как "No code changes needed" — это верно, т.к. `nachweis.publish` делегирует `evaluateGateV2`.
- **Output format**: JSON-примеры (lines 246-274) документированы и стабильны.
- **Failure modes**: Противоречие — line 284 утверждает `nachweis.validate` "emits NACHWEIS-DISPLAY-CONSENT-01 violations but does not fail the command (warnings are reported in the result)", но текущий `nachweis-validate.ts:448` возвращает `exitCode: hasViolations ? 1 : 0`. Если violations добавляются в массив `violations[]`, exit code становится 1. Нужно уточнить: это warnings (не влияют на exit code) или violations (exit code 1).
- **Rollout**: Описывает default behavior, migration path, new-app compliance. Корректно.
- **Alternatives considered**: 4 реальных альтернативы с причинами отклонения. Корректно.
- **Risks**: Включает agent misinterpretation risk и false-positive rate. Корректно.
- **Acceptance criteria**: 9 пунктов, все проверяемые. Однако критерий `nachweis.validate reports display-consent-consistent in failed conditions for inconsistent records` (line 314) не уточняет, является ли это violation или warning.
- **Implementation notes**: Явные behavioural rules, не vague guidance. Корректно.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle)**: RFC объясняет (line 117), что consent updates и screenshot uploads — kernel commands, мутирующие Sternsystem state через mission lifecycle. Корректно — текущий `nachweis.consent.update` уже использует `acquireLock` и `appendAndCommitBordbuch`.
- **DNA-59 (Evidence preservation)**: RFC объясняет (line 118), что screenshots сохраняются в R2 рядом с existing evidence artifacts. Корректно — `uploadToR2` в `nachweis-io.ts:403-415` уже используется для evidence PDFs.
- **RFC не устанавливает новую DNA-инварианту** — не требуется.

## Axis C — Ecosystem fit

- **Package boundaries**: `packagesImpacted: [werkstatt, werkstatt-site]` — верно. Команды и gate logic живут в `packages/werkstatt/src/nachweis/`, schema — в `packages/werkstatt-site/src/domain/pbp/`. Импорты идут `werkstatt → werkstatt-site` через dynamic import (существующий паттерн). Корректно.
- **Pipeline placement**: `nachweis.validate` уже в `SITES_BUILD_CHECK_PIPELINE` (RFC-0707). RFC не добавляет новых pipeline steps — только расширяет существующие. Корректно.
- **Compass sync**: RFC не упоминает, какие `docs/*.xml` файлы нуждаются в синхронизации. Если добавляется `display-consent-consistent` gate condition и `NACHWEIS-DISPLAY-CONSENT-01` violation rule, `docs/verification-plan.xml` может потребовать обновления. Finding: RFC должен явно указать Compass sync requirements.
- **AGENTS.md updates**: RFC не указывает, нужно ли обновить `packages/werkstatt/AGENTS.md` с правилами о `--scope` flag и display↔consent coupling. Finding: нужно явно указать или отметить как non-goal.
- **Command lifecycle**: `commands.proposed: [nachweis.screenshot.upload]`, `commands.changed: [nachweis.consent.update, nachweis.publish, nachweis.validate, nachweis.manifest.generate]`. `nachweis.publish` отмечен как changed, но в File system responsibilities (line 241) сказано "No code changes needed". Finding: если `nachweis.publish` не меняет код, он не должен быть в `changed` — он использует обновлённую `evaluateGateV2` без изменений своего хендлера.

## Axis D — Forward-only compliance

- **No compatibility shim**: RFC прямо говорит (line 322) "MUST NOT add backward-compatible aliases for the old `nachweis.consent.update --status` without `--scope`". Корректно.
- **Legacy removal**: Старый `consentStatus` удаляется из consent update logic. `evaluateGateV2` заменяет `consentData.consentStatus === "granted"` на per-aspect logic. Корректно.
- **No dual-path**: RFC не предлагает параллельной интерпретации. Корректно.
- **Migration**: RFC-0885 migrator обрабатывает existing entities. RFC-0886 работает поверх мигрированных данных. Корректно.

## Axis E — Agent-facing policy

- **Status gate**: RFC содержит "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 321). Корректно — не self-authorizing.
- **Implementation notes**: Ссылаются на RFC-0224 (accepted→implemented transition) и `rfc.supersede.propose`. Корректно.
- **Anti-fabrication**: RFC не требует content authoring — все изменения кодовые. Корректно.
- **Storage policy**: `nachweis.screenshot.upload` использует R2 (server-side), не cookies. Корректно.
- **NEEDS CLARIFICATION markers**: Не найдены. Корректно.

## Axis F — Pragmatism

- **Minimal command surface**: `nachweis.screenshot.upload` — новый command, не flag на существующем. Альтернатива (flag на `nachweis.public-derivative`) отклонена с обоснованием (line 297). Корректно.
- **Lean contracts**: TypeScript types минимальны. `ConsentScope` type — 3 значения, не speculative. Корректно.
- **Existing patterns**: `nachweis.consent.update` расширяется (`--scope` flag) вместо создания нового command. Альтернатива (separate commands per aspect) отклонена (line 296). Корректно.
- **Scope discipline**: `packagesImpacted` перечисляет только затронутые. `nonGoals` явные и meaningful. Корректно.
- **Finding**: `nachweis.manifest.generate` listed in `commands.changed` и acceptance criteria (line 315) требует "includes websiteUrl and display in manifest entries". Однако в Design section нет TypeScript contract или описания изменений для manifest. Нужно добавить детали: какие именно поля добавляются в `NachweisManifestEntry`.

## Axis G — Blind spots

- **Performance**: `nachweis.validate` уже сканирует PBP entities. Добавление display↔consent check — O(aspects × records) = O(3 × N), тривиально. `nachweis.screenshot.upload` — single file upload, не batch. Корректно.
- **False positives**: RFC описывает (line 303) сценарий false positive и объясняет, что это intended behavior. Корректно.
- **Edge cases**: RFC упоминает grandfathering для pre-migration records (line 290). Однако не рассматривает случай, когда `display` field отсутствует на non-Nachweis evidence kind — current code пропускает non-Nachweis kinds, но new check должен тоже пропускать. Finding: нужно явно указать, что display↔consent check применяется только к `NACHWEIS_EVIDENCE_KINDS`.
- **Migration path**: Описан (line 288-292). Корректно.
- **Security/privacy**: Screenshots загружаются в R2 с `storage: "public"`. RFC упоминает `storage: "private"` option (line 304), но TypeScript contract (line 175) фиксирует `storage: "public"`. Finding: противоречие — contract говорит always public, Risks говорит private option exists. Нужно разрешить.
- **R2 path inconsistency**: Design (line 186) указывает `nachweis/{systemId}/{slug}/website-screenshot.{ext}`, но Implementation notes (line 324) говорит "Screenshots use a separate path prefix (`{systemId}/screenshots/{slug}/`)". Finding: противоречие в R2 path prefix.

## Questions for the author

1. Какой R2 path prefix для screenshots: `nachweis/{systemId}/{slug}/website-screenshot.{ext}` (Design) или `{systemId}/screenshots/{slug}/` (Implementation notes)? Нужно согласовать.
2. `storage` для `websiteScreenshot` — всегда `"public"` (TypeScript contract) или допускает `"private"` (Risks section)? Если всегда public, нужно удалить упоминание private option в Risks.
3. `nachweis.validate` с `NACHWEIS-DISPLAY-CONSENT-01` — это violation (exit code 1) или warning (exit code 0)? Текущий код возвращает exit code 1 при любых violations; нужно уточнить поведение.
4. `nachweis.publish` в `commands.changed` — но File system responsibilities говорит "No code changes needed". Если код хендлера не меняется, следует ли убрать из `changed`?
5. `--method` для `nachweis.consent.update --status denied` — обязателен или опционален (default `"none"`)? Пример (line 130) не передаёт `--method` для `--status denied`.
6. Какие `docs/*.xml` Compass файлы нуждаются в синхронизации при добавлении `display-consent-consistent` gate condition и `NACHWEIS-DISPLAY-CONSENT-01` violation rule?
7. `nachweis.manifest.generate` — какие именно поля (`websiteUrl`, `display`) добавляются в `NachweisManifestEntry`, и в каком формате?
