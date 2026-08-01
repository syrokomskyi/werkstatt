---
rfcId: RFC-0630
auditId: AUDIT-RFC-0630-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0630

## Verdict: Needs revision

RFC-0630 точно идентифицирует семь реальных пробелов в текущей реализации `mission-check.ts` (подтверждено чтением исходного кода). Однако RFC содержит несколько неточностей в описании текущего состояния кода, одно несуществующее поле схемы, и не указывает `packagesImpacted` для `@warpgogol/site-kernel-handoff` несмотря на изменение `leitstand-commands.ts`.

## Mechanical validation (rfc.validate)

Pass (1 warning): V-19 — `RFC-0630.amends` включает RFC-0629, но `RFC-0629.amendedBy` не включает RFC-0630. Это ожидаемо для draft-статуса и будет исправлено при transition to accepted.

## Axis A — Structural completeness

- **A1 (finding)**: Раздел "Problem" ссылается на `purgeRequestQueue: false` (line 178) как на существующее поле в текущем коде. Поле `purgeRequestQueue` не существует ни в `buildCaptureContract()` (`mission-check.ts:126-199`), ни в схеме `captureContractSchema` из `@syrokomskyi/axiom-capture`. Grep по всему репозиторию не нашёл ни одного упоминания `purgeRequestQueue`. RFC должен убрать эту ссылку или заменить на описание фактического механизма Crawlee storage (Dataset по имени `axiom-<contractDigest>`).

- **A2 (finding)**: Раздел "Problem" пункт 5 ссылается на "line 44" для `CrawleeDiscoveryExecutor` и "line 178" для `purgeRequestQueue`. Номера строк в текущем коде не соответствуют этим ссылкам — `CrawleeDiscoveryExecutor` используется на line 398, а `purgeRequestQueue` не существует. RFC должен либо убрать номера строк (они будут дрейфовать), либо указать актуальные.

- **A3 (finding)**: Раздел "Problem" пункт 1 ссылается на "line 179-182" для `toolProfile` stubs. Актуальные строки — 179-183. Мелкая неточность, но номера строк устареют при имплементации.

- **A4 (finding)**: `crawleeVersion: "local-dev"` (line 180) — также stub, но RFC не упоминает его в Problem пункте 1 и не включает в Decision пункт 1. RFC говорит только о `playwrightVersion` и `chromiumRevision`. Decision пункт 1 должен включать `crawleeVersion` из `crawlee/package.json` для полноты provenance.

## Axis B — DNA alignment

- **B1 (finding)**: `satisfies: [DNA-48, DNA-49]` — оба инварианта существуют в `docs/architecture-dna.md` (lines 207, 211). Раздел "Architectural fit" объясняет связь: DNA-48 (release discipline — надёжный evidence перед promotion), DNA-49 (fleet propagation — gate должен проходить для propagation). Обоснование корректно.

- **B2 (finding)**: `related: [DNA-48, DNA-49, RFC-0629]` — DNA-48 и DNA-49 уже в `satisfies[]`, что делает их дублирование в `related[]` избыточным. `related[]` должен содержать ссылки, не входящие в `satisfies[]`. Рекомендуется убрать DNA-48 и DNA-49 из `related[]`.

## Axis C — Ecosystem fit

- **C1 (finding)**: `packagesImpacted` содержит только `@warpgogol/site-kernel-checks`, но "File system responsibilities" таблица также указывает `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` (modified — add `--system` to `mission.check` call). `packagesImpacted` должен включать `@warpgogol/site-kernel-handoff`.

- **C2 (finding)**: `commands.changed` содержит только `mission.check`, но RFC также модифицирует `leitstand.dev-deploy` (добавляет `--system=<systemId>` к argv). `leitstand.dev-deploy` должен быть в `commands.changed`.

- **C3 (pass)**: Package boundaries корректны — все изменения в `packages/os/*`, никаких `apps/* → apps/*` или `apps/* → services/*` импортов.

- **C4 (pass)**: RFC не вводит новых команд — только флаги к существующей `mission.check` и wiring в `leitstand.dev-deploy`. Минимальный command surface.

- **C5 (finding)**: RFC не упоминает необходимость обновления `command.manifest.generate` и `docs.commands.generate` после изменения флагов `mission.check`. AGENTS.md (line 108) требует: "After adding or changing a command registration, run both: `command.manifest.generate` then `docs.commands.generate`." RFC должен включить это в Rollout или Implementation notes.

## Axis D — Forward-only compliance

- **D1 (pass)**: Нет compatibility shim, нет dual-path, нет feature flag. Все изменения in-place.

- **D2 (pass)**: RFC amends RFC-0629, не создаёт параллельную интерпретацию. Изменения применяются непосредственно к `mission-check.ts`.

- **D3 (pass)**: Legacy code paths удаляются (30s timeout → 120s, hardcoded locales → i18n resolution, stub toolProfile → runtime values).

## Axis E — Agent-facing policy

- **E1 (pass)**: RFC имеет status: draft — нет self-authorizing language. Implementation notes явно говорят "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

- **E2 (finding)**: Implementation notes не ссылаются на конкретные governance RFC. Стандартные ссылки: RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation on invariant conflict). RFC-0629 включает эти ссылки — RFC-0630 должен быть консистентен.

- **E3 (pass)**: Нет content authoring в acceptance criteria — все критерии проверяемы кодом или тестами.

- **E4 (pass)**: Нет cookies, нет client-side persistence. Нет hardcoded secrets.

## Axis F — Pragmatism

- **F1 (pass)**: Нет новых команд — только флаги к существующей. Каждый флаг earns its existence (`--max-duration` для больших сайтов, `--locales` для multi-language, `--system` для i18n auto-detection).

- **F2 (pass)**: TypeScript contracts минимальны — `MissionCheckOverrides`, `ResolvedLocale`, `RuntimeToolProfile`, `PreflightResult`, `purgeCrawleeStorage`. Нет спекулятивной общности.

- **F3 (pass)**: RFC проверяет existing patterns — `resolveMissionDir` уже используется, `loadI18nConfigSync` уже существует в `@warpgogol/site-kernel-content`. Alternatives section честно рассматривает 5 альтернатив.

- **F4 (finding)**: `appsImpacted: [warpgogol-com]` — RFC не объясняет, почему только warpgogol-com. `mission.check` — workspace-scoped команда, применимая к любому Sternsystem. Если pilot только на warpgogol-com, это нужно указать явно. Если команда общая, `appsImpacted` должен быть пустым или содержать все sites.

## Axis G — Blind spots

- **G1 (finding)**: RFC не указывает cost pre-flight check (`chromium.launch()` + `browser.close()`). Это ~1-2s overhead на каждый `mission.check` вызов. Для dev-deploy pipeline это приемлемо, но должно быть задокументировано.

- **G2 (finding)**: Multi-locale capture удваивает evidence size (94 pages × 2 locales = 188 captures). RFC упоминает это в Risks (~6 minutes), но не указывает impact на raw evidence storage (`missions/<missionId>/evidence/axiom/raw/`). 188 captures × ~5 artifacts each = ~940 files. Нужно ли cleanup raw evidence после capsule staging?

- **G3 (finding)**: RFC не рассматривает edge case: `--locales` передан с невалидным BCP 47 тегом (e.g., `de-DE-INVALID`). Failure modes таблица указывает exit code 2 для "invalid format", но не определяет validation logic (regex, library, или try/catch при передаче в axe-core).

- **G4 (finding)**: RFC не рассматривает concurrent execution — два `mission.check` для одного mission одновременно. Оба пишут в `missions/<missionId>/evidence/axiom/` — race condition. Текущий код уже имеет эту проблему (stale evidence cleanup), но multi-locale увеличивает время выполнения и окно для конфликтов.

- **G5 (finding)**: `require("playwright/package.json")` — RFC упоминает риск в bundled contexts (Risks section), но не указывает, что `require` должен использовать `createRequire(import.meta.url)` в ESM context. Текущий `mission-check.ts` использует ESM imports. `require` напрямую не работает в ESM без `createRequire`.

## Questions for the author

1. Поле `purgeRequestQueue` не существует в текущем коде и схеме `captureContractSchema`. RFC должен описать фактический механизм Crawlee storage (Dataset naming) вместо несуществующего поля. Как именно `CrawleeDiscoveryExecutor` открывает Dataset — по имени `axiom-<contractDigest>` или другому механизму?

2. `crawleeVersion: "local-dev"` — тоже stub. Должен ли Decision пункт 1 включать чтение `crawlee/package.json` для полноты `toolProfile`, или `crawleeVersion` остаётся `"local-dev"` по причине?

3. `leitstand.dev-deploy` модифицируется (добавляется `--system`), но не указан в `commands.changed` и `@warpgogol/site-kernel-handoff` не в `packagesImpacted`. Это упущение или намеренное?

4. `require("playwright/package.json")` в ESM-модуле — нужен ли `createRequire(import.meta.url)`, или RFC предполагает CJS context?
