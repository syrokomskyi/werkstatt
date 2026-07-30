---
rfcId: RFC-0602
auditId: AUDIT-RFC-0602-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0602

## Вердикт: Требует доработки

RFC правильно определяет проблему (отсутствие линта для предотвращения регрессии volatile timestamps) и предлагает разумный механизм (source lint + опциональный double-build drift). Однако Phase 1 сканирует все `.ts` файлы в обоих пакетах без различения генераторов и валидаторов, что даст ~20+ false positives из легитимных использований `new Date()` в валидаторах. Phase 2 (`--deep`) создаёт инверсию пайплайна — `build.check` вызывает `build.prepare`, что архитектурно некорректно. Привязка к DNA-18 натянута.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate RFC-0602` завершается с нулём нарушений.

## Ось A — Структурная полнота

- **`TimestampViolation` contract**: `rule: "TS-TIME-01"` — это string literal type, но если планируется только одно правило, это приемлемо. Если правила будут добавляться, следует использовать `string` или union. Минор.
- **Output format**: Пример показывает `violations[]`, но acceptance criteria упоминают `CheckResult` shape. Стандартный `CheckResult` в экосистеме использует `violations[]` и `notices[]` — RFC-0601 (drift validate) следует этому паттерну. RFC-0602 не упоминает `notices[]`, хотя allowlist exemption логически является notice, а не violation. Несоответствие между output format и acceptance criteria.
- Остальные секции заполнены корректно — Decision в present tense, CLI surface с точными командами, file system responsibilities с конкретными путями, alternatives с реальными альтернативами.

## Ось B — Выравнивание DNA

- **`satisfies: [DNA-18]`** — натянуто. DNA-18 («Uni registry is the single UI index») конкретно про uni registry как единственный индекс UI surface. Хотя DNA-18 упоминает «deterministically generated», это в контексте registry→manifests drift, а не общего timestamp determinism. RFC-0345 тоже ссылался на DNA-18, но также включал DNA-39. RFC-0602 должен либо обосновать более широкую интерпретацию DNA-18, либо добавить DNA-53 (semantic fingerprint governance — volatile timestamps нарушают детерминированные fingerprint'ы).
- **Отсутствует DNA-53**: `@warpgogol/fingerprint` обеспечивает детерминированные хеши. Volatile timestamps в generated files делают fingerprint'ы недетерминированными, что прямо нарушает DNA-53. RFC должен включить DNA-53 в `satisfies[]` или `related[]`.
- **Отсутствует DNA-35**: Добавление команды в `build.check` влияет на `app.contract.full` (DNA-35 — canonical readiness signal). RFC должен отметить это.

## Ось C — Ecosystem fit

- **Phase 2 pipeline inversion**: RFC заявляет, что команда работает в `build.check` (строка 183), но Phase 2 (`--deep`) запускает `build.prepare` дважды (строка 132). Это создаёт инверсию: `build.check` → `generated.timestamp.validate --deep` → `build.prepare` (второй запуск) → `build.check` (рекурсивно?). Архитектурно `build.check` не должен вызывать `build.prepare`. RFC не объясняет, как избежать рекурсии или двойного выполнения `build.check`.
- **Compass sync**: RFC не указывает, какие `docs/*.xml` нуждаются в синхронизации. Добавление команды в `build.check` требует обновления `docs/verification-plan.xml` как минимум.
- **AGENTS.md updates**: RFC не упоминает обновление `packages/os/site-kernel-checks/AGENTS.md` для документирования новой команды. Существующий AGENTS.md подробно описывает каждый модуль — новая команда должна быть задокументирована.
- **Command lifecycle**: `commands.proposed` и `commands.added` согласованы — `generated.timestamp.validate` в обоих. Корректно.

## Ось D — Forward-only compliance

No issues. RFC не предлагает backward compatibility layers или shims. Allowlist — это exemption, не dual-path. Удаление volatile timestamps из генераторов — forward-only изменение.

## Ось E — Agent-facing policy

- **Status gate**: Корректно — «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).»
- **Implementation notes**: Ссылаются на RFC-0224 (accepted→implemented transition). Корректно.
- **Anti-fabrication**: Acceptance criteria — про код, не про content authoring. Корректно.
- **Storage policy**: Не применимо. Корректно.

## Ось F — Pragmatism

- **Phase 1 scan scope too broad**: RFC сканирует ALL `.ts` файлы в `packages/os/site-kernel-codegen/src/` и `packages/os/site-kernel-checks/src/`. Но `site-kernel-checks/src/` содержит как генераторы, так и валидаторы. Греп по `new Date()` в `site-kernel-checks/src/` находит ~20+ легитимных использований в валидаторах:
  - `team-lifecycle.ts` — `Date.now()` для staleness проверок (валидатор, не генератор)
  - `audit/validators/*.ts` — `Date.now()` для измерения runtime (валидаторы)
  - `content-plan.ts`, `content-freshness.ts`, `content-derived.ts` — `new Date().toISOString().slice(0, 10)` для «today» в валидаторах
  - `canonical-url.ts` — `new Date()` для stamp validation (валидатор)
  - `ratgeber-claim-validate.ts` — `todayISO()` для claim expiry checking (валидатор)
  
  RFC должен использовать `GENERATOR_OWNERSHIP_MAP` (из `generator-ownership.ts`) для определения, какие модули являются генераторами, и сканировать только их. Это снизит false positives до ~3-5 реальных нарушений (content-ref-index-generate.ts, open-source-page.ts, material-metadata-write.ts, agent-surface-sign.ts, agent-knowledge-compute.ts, page-markdown.ts, pseo-governance.ts).

- **Allowlist burden**: RFC не оценивает начальный размер allowlist. Из анализа — как минимум 5-7 генераторов используют `new Date()` легитимно (bordbuch status с `createdAt`, agent-surface-sign с `created`, agent-knowledge-compute с `lastVerified`, page-markdown с `buildDate`, pseo-governance с `nowIso`). Каждая запись требует `reason` поля. Это не тривиальная initial настройка.

- **Regex vs AST**: RFC предлагает regex-сканирование (`new Date().toISOString()`, `new Date()`, `Date.now()`). Regex даст false positives на комментариях и строковых литералах (например, `// Fix: replace new Date().toISOString() with null`). Для точного обнаружения нужен AST-based анализ (TypeScript compiler API), который отличает expression statements от комментариев и строк.

## Ось G — Слепые зоны

- **Phase 2 pipeline inversion**: (повтор из Оси C) — `build.check` не должен вызывать `build.prepare`. Это архитектурный blind spot. Если Phase 2 нужна, она должна быть отдельной командой (не в `build.check`), или RFC должен объяснить, как избежать рекурсии.
- **No migration window**: Добавление в `build.check` как hard fail блокирует все сайты немедленно. RFC говорит «Existing apps: Must fix all timestamp violations before the first `build.check` passes» — но не описывает migration window или warning-only initial deployment. Если в warpgogol-com 3+ нарушения, `build.check` сломается до их исправления.
- **`process.env.BUILD_TIMESTAMP`**: Упоминается как pattern для детекции (строка 128), но не объясняется — где используется, какие генераторы его читают, как он попадает в generated files. Нет evidence, что этот pattern реально существует в кодовой базе.
- **Cross-package generators**: `GENERATOR_OWNERSHIP_MAP` показывает, что некоторые генераторы живут вне `site-kernel-codegen` и `site-kernel-checks` — например, `bordbuch.generate` в `packages/os/site-kernel-handoff/src/bordbuch/`. RFC сканирует только два пакета и пропускает генераторы в других пакетах.

## Вопросы автору

1. Почему Phase 1 сканирует все `.ts` файлы, а не только модули, идентифицированные в `GENERATOR_OWNERSHIP_MAP` как генераторы? Как избежать ~20 false positives из легитимных `new Date()` в валидаторах?
2. Как Phase 2 (`--deep`) избегает pipeline inversion — `build.check` вызывает `build.prepare`, который вызывает `build.check`? Должна ли Phase 2 быть отдельной командой вне `build.check`?
3. Почему `satisfies` включает только DNA-18, а не DNA-53 (semantic fingerprint governance) — volatile timestamps делают fingerprint'ы недетерминированными, что прямо нарушает DNA-53?
