---
rfcId: RFC-0904
auditId: AUDIT-RFC-0904-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0904

## Verdict: Needs revision

RFC содержит критический конфликт DNA-81 (номер уже занят RFC-0850) и несколько неточностей в архитектурных деталях (регистрация команд, формат вывода, маппинг `<source>`). После исправления этих находок RFC будет готов к enhance.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0904 --json` → zero violations, zero markers.

## Axis A — Structural completeness

- **A-1 (File system responsibilities — неверный файл регистрации команд).** Таблица на строке 226 указывает `packages/werkstatt-site/src/checks/module.ts` как файл, в котором регистрируются новые команды. В реальности команды регистрируются в command-table файлах (например `31-public-surface.ts:367` для `csp.origins.validate`). `module.ts` содержит только pipeline driver функции (`runAppsCheckPostbuild` и т.д.), а не регистрации команд. Нужно указать правильный command-table файл (вероятно `31-public-surface.ts` или новый файл в `command-tables/`).

- **A-2 (Output format — несоответствие с `diagnosticsResult`).** RFC утверждает (строка 310): "Both commands follow the existing `diagnosticsResult` pattern". Однако JSON-примеры (строки 240–258, 263–289) показывают структуру, которая не соответствует фактическому `diagnosticsResult` из `@warpgogol/werkstatt-shared/checks/result-helpers.ts:44-64`. Helper возвращает `{ data: { command, status, diagnostics, summary }, exitCode, summary }` — `diagnostics` внутри `data`, а не на верхнем уровне. Кроме того, поля `file`, `line`, `fixHint` в примерах не являются стандартными полями `Diagnostic` из engine schema — они должны быть в `evidence` или реализованы через кастомный result (как `csp.origins.validate` использует `CspOriginResult` с `findings`). RFC должен либо использовать `diagnosticsResult` с `Diagnostic[]` (где `file`/`line`/`fixHint` упакованы в `evidence`), либо явно объявить кастомный result interface (как делает RFC-0831).

- **A-3 (Acceptance criteria — операционный критерий без unit-test эквивалента).** Критерий "warpgogol-com passes both validators after object-src 'self' fix" (строка 365) требует собранного `dist/client/` для warpgogol-com. Это операционная проверка, не unit-test. Критерий должен уточнить, что проверяется через `pnpm --filter @warpgogol/werkstatt-site test` (unit tests с fixture HTML), а не через реальный build warpgogol-com.

## Axis B — DNA alignment

- **B-1 (CRITICAL — DNA-81 конфликт).** RFC утверждает (строка 127): "DNA-81 (new, established by this RFC)". Однако DNA-81 уже существует в `docs/architecture-dna.md:339` — "Deterministic certification evaluation and remediation", established by RFC-0850. RFC не может установить уже занятый DNA-номер. `satisfies: [DNA-67, DNA-81]` (строка 33) также некорректно — RFC не удовлетворяет DNA-0850 (certification evaluation), это совершенно другая тема. Нужно: (1) использовать следующий свободный номер (DNA-83, т.к. DNA-82 тоже занят на строке 343), (2) убрать DNA-81 из `satisfies`, (3) обновить все ссылки на DNA-81 в теле RFC.

- **B-2 (DNA-67 — обоснование удовлетворения).** RFC утверждает (строка 126), что расширяет DNA-67 (Pre-deploy Lighthouse parity gate). DNA-67 говорит: "every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator". RFC проводит аналогию: "issues observable post-deploy that can be deterministically detected pre-deploy MUST be caught pre-deploy". Это разумное расширение философии, но DNA-67 специфично про Lighthouse audits — CSP/headers checks не являются Lighthouse audits. Обоснование нужно переформулировать: DNA-67 устанавливает принцип pre-deploy detection, и этот RFC применяет тот же принцип к CSP/headers. Это аргументация для `related`, а не для `satisfies` — RFC не реализует DNA-67, он применяет его философию к новой области.

## Axis C — Ecosystem fit

- **C-1 (Pipeline placement — корректный).** RFC указывает вставку после `csp.origins.validate` и до `dist.generated-marker.validate` (строка 320). Это соответствует фактическому pipeline в `sites-check-postbuild.ts:68-70`. Pass.

- **C-2 (Command lifecycle buckets — неполные).** `commands.proposed` содержит `csp.elements.validate` и `headers.coverage.validate` (строки 45-46). `commands.added` пуст. При реализации команды попадут в `added`. Это структурно корректно для draft RFC. Pass.

- **C-3 (AGENTS.md update — указан).** RFC указывает `packages/werkstatt-site/AGENTS.md` в file system responsibilities (строка 234). Pass.

- **C-4 (Compass sync — не указан).** RFC не указывает, какие `docs/*.xml` файлы нужно синхронизировать. Для новых check commands нужно обновить `docs/verification-plan.xml` (добавить новые rule IDs). RFC должен явно указать это.

## Axis D — Forward-only compliance

No issues. RFC не предлагает backward compatibility layers, не добавляет dual-path. Deprecation path не нужен (RFC не заменяет существующие команды).

## Axis E — Agent-facing policy

- **E-1 (Status gate — корректный).** RFC в статусе `draft`, содержит корректные implementation notes (строки 371-379): "Agents MAY implement code changes ONLY when this RFC has status: accepted". Pass.

- **E-2 (NEEDS CLARIFICATION markers — нет).** Нет неразрешённых маркеров. Pass.

- **E-3 (Storage policy — не применимо).** RFC не касается persistence. Pass.

## Axis F — Pragmatism

- **F-1 (`<source>` element mapping — неполный).** `ELEMENT_DIRECTIVE_MAP` (строка 179) всегда маппит `source` → `media-src`. Но `<source>` внутри `<picture>` наследует `img-src`, не `media-src`. Логика должна учитывать parent element: `<source>` внутри `<video>`/`<audio>` → `media-src`, внутри `<picture>` → `img-src`. RFC должен уточнить маппинг или добавить parent-context resolution.

- **F-2 (`<frame>` element — deprecated).** `<frame>` (строка 176) устарел и используется только в `<frameset>`. Astro сайты крайне маловероятно используют `<frame>`. Включение — minor over-engineering. Рекомендуется убрать или пометить как deprecated в nonGoals.

- **F-3 (Tracked file types — узкий и необъяснённый список).** HDR-COV-02 (строка 208) отслеживает `.pdf`, `.mp4`, `.webm`, `.svg`. Почему не `.avif`, `.webp`, `.woff2`, `.js`, `.css`? RFC говорит "deliberately narrow to minimise this" (строка 345), но не объясняет критерий выбора. Нужно либо объяснить критерий (например "типы, которые требуют явного Cache-Control"), либо расширить список.

## Axis G — Blind spots

- **G-1 (HDR-COV-02 — Content-Type claim некорректен для Cloudflare Pages).** RFC утверждает (строка 108): "these files will be served without correct Content-Type or Cache-Control headers". Cloudflare Pages автоматически выводит `Content-Type` из расширения файла, независимо от `_headers` patterns. Реальный риск — отсутствие кастомного `Cache-Control`, а не `Content-Type`. Утверждение нужно скорректировать: "will be served without explicit Cache-Control headers" (Content-Type выводится автоматически).

- **G-2 (`_headers` pattern matching algorithm — не специфицирован).** RFC говорит (строка 213): "Parse _headers path patterns (lines starting with /)" и "glob dist/client/ for matching files". Но Cloudflare `_headers` использует специфический glob syntax (`/*`, `/nachweis-pdfs/*`, `/_astro/*`). Не указано: (1) как конвертировать `_headers` patterns в node glob patterns, (2) как обрабатывать wildcard `*` (матчит ли `/nachweis-pdfs/*` файлы в подкаталогах?), (3) как обрабатывать `:path` placeholders. Это нетривиальная реализационная деталь, которую нужно специфицировать.

- **G-3 (Same-origin check logic — gap).** RFC (строка 192) говорит: "Same-origin URL: check if 'self' is in source list → error if missing". Но CSP может разрешать same-origin через явный origin (например `object-src https://warpgogol.com`) без `'self'` keyword. Логика должна также проверять, совпадает ли explicit origin в source list с site origin. Иначе false positive: `object-src https://warpgogol.com` с `<object data="/local.pdf">` — RFC выдаст ошибку, хотя CSP разрешает same-origin.

- **G-4 (`--app` flag vs `supportsAllSites`).** RFC (строка 158) говорит: "Both commands accept `--app <id>` (required, single-site scope)". Но существующий `csp.origins.validate` использует `supportsAllSites: true` и не требует `--app` (может запускаться через `--all`). RFC должен уточнить: поддерживают ли новые команды `--all`? Если да, указать `supportsAllSites: true` в design. Если нет, объяснить почему (отличие от `csp.origins.validate`).

## Questions for the author

1. Какой DNA-номер следует использовать вместо занятого DNA-81? (DNA-83 — следующий свободный, т.к. DNA-82 тоже занят.)
2. Должны ли новые команды использовать `diagnosticsResult` (со стандартным `Diagnostic[]` где `file`/`line`/`fixHint` в `evidence`) или кастомный result interface (как `CspOriginResult` в RFC-0831)? Текущие JSON-примеры не соответствуют ни одному из вариантов.
3. Как `<source>` внутри `<picture>` должен маппиться на CSP directive — `img-src` или `media-src`? Текущий маппинг всегда даёт `media-src`, что некорректно для `<picture>`.
