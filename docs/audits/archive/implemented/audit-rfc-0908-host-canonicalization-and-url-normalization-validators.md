---
rfcId: RFC-0908
auditId: AUDIT-RFC-0908-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0908

## Verdict: Needs revision

RFC хорошо структурирован и архитектурно обоснован, но имеет одно механическое нарушение (V-28: createdAt конфликтует с RFC-0916) и два семантических замечания: `packagesImpacted` содержит пакет, который не модифицируется, и механизм обнаружения `trailingSlash` недостаточно специфицирован.

## Mechanical validation (rfc.validate)

**Fail** — 1 нарушение:

- **V-28** (error): RFC-0908 (`createdAt: 2026-08-22`) имеет меньший ID, чем RFC-0916 (`createdAt: 2026-08-21`). RFC IDs должны монотонно не убывать относительно `createdAt` (RFC-0478). Нужно либо изменить `createdAt` на ≤ `2026-08-21`, либо перенумеровать RFC.

## Axis A — Structural completeness

No issues. Decision в настоящем времени ("The kernel gains…"), CLI surface с точными командами и флагами, TypeScript contracts минимальны, file system responsibilities с конкретными путями, output format с `--json` примерами, failure modes с exit codes, rollout с fail-hard с первого дня, 4 реальных альтернативы с причинами отклонения, risks включает false-positive rate, acceptance criteria проверяемые, implementation notes содержат явные поведенческие правила.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-86]` — DNA-86 уже добавлен в `docs/architecture-dna.md:359-361` с пометкой "Established by RFC-0908". RFC объясняет, как он обеспечивает DNA-86: host canonicalization и trailing-slash normalization. `related[]` включает DNA-73, RFC-0317, RFC-0898, RFC-0905, RFC-0906, RFC-0904 — все релевантны. Конфликтов с существующими DNA нет.

## Axis C — Ecosystem fit

**Finding C-1:** `packagesImpacted` содержит `@warpgogol/werkstatt-shared`, но в таблице file system responsibilities нет ни одного файла в `packages/werkstatt-shared/`. Пакет только потребляется (существующие экспорты `parseRedirectRules` и `diagnosticsResult`), но не модифицируется. `packagesImpacted` должен перечислять только пакеты, код которых изменяется. Нужно убрать `@warpgogol/werkstatt-shared` из `packagesImpacted`.

Pipeline placement корректен: `SITES_CHECK_POSTBUILD_PIPELINE` после `redirect.shadow.validate` — согласуется с существующими валидаторами (`redirect.map.validate`, `redirect.shadow.validate`), которые тоже читают `public/_redirects` и `wrangler.jsonc`. Compass sync упоминает `docs/verification-plan.xml` ✓. AGENTS.md update упоминает `packages/werkstatt-site/AGENTS.md` ✓. Command lifecycle: `commands.proposed` → `added` при реализации ✓.

## Axis D — Forward-only compliance

No issues. Нет compatibility shim, нет dual-path, нет backward compatibility layer. Fail-hard с первого дня — нет grace period.

## Axis E — Agent-facing policy

No issues. Status gate корректен: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Нет self-authorizing language. Implementation notes ссылаются на RFC-0224. Нет NEEDS CLARIFICATION markers. Storage policy не затронут.

## Axis F — Pragmatism

No issues (помимо C-1). Две команды вместо одной обоснованы в alternatives. Расширение `redirect.map.validate` отклонено с причиной. TypeScript contracts минимальны. `nonGoals` явные и содержательные.

## Axis G — Blind spots

**Finding G-1:** Механизм обнаружения `trailingSlash` недостаточно специфицирован. RFC говорит "Read canonicalPageUrl trailingSlash policy (from canonical-url.ts usage: 'always')", но `trailingSlash` — это опция, передаваемая вызывающим кодом, а не свойство функции `canonicalPageUrl`. В кодовой базе есть несколько call sites: `resolve-route.ts:1120`, `canonical-url.ts:103`, `feed.ts:79` — все хардкодят `trailingSlash: "always"`. Валидатор должен либо:
- Сканировать исходные файлы на наличие `trailingSlash:` в литералах `CanonicalUrlOptions`, либо
- Импортировать тип и проверять значения по умолчанию, либо
- Читать значение из единого конфигурационного источника (которого сейчас нет).

Нужно уточнить, как именно валидатор определяет политику `trailingSlash` — это влияет на false-positive rate и на то, что произойдёт, если будущий RFC добавит `trailingSlash: "never"`.

Performance, false positives (с escape hatch планом), edge cases (missing `astro.config.mjs`, missing `_redirects`, missing `site` URL), migration path — всё адекватно описано.

## Questions for the author

1. Как именно `trailing.slash.config.validate` определяет значение `trailingSlash`? Сканирует ли он исходные файлы на литералы `CanonicalUrlOptions`, или предполагает `"always"` как единственно возможное значение?
2. Нужно ли изменить `createdAt` на `2026-08-21` (или раньше) чтобы пройти V-28, или RFC нужно перенумеровать?
3. Почему `@warpgogol/werkstatt-shared` listed в `packagesImpacted` — какие файлы в этом пакете модифицируются?
