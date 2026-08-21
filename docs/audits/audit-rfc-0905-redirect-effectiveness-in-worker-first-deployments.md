---
rfcId: RFC-0905
auditId: AUDIT-RFC-0905-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0905

## Verdict: Needs revision

RFC корректно определяет проблему shadowed redirects и предлагает прагматичное решение. Однако `rfc.validate` падает на V-0478 monotonicity violation, `packagesImpacted` содержит пакет, который не модифицируется, и REDIR-07/RSHAD-01 дублируют одну и ту же проверку в двух командах без указания shared implementation.

## Mechanical validation (rfc.validate)

Fail — 1 error:

- **V-0478**: RFC-id RFC-0905 (createdAt `2026-08-22`) is lower than RFC-0916 which has a strictly earlier createdAt (`2026-08-21`). RFC ids must be monotonically non-decreasing with respect to createdAt. Fix: set RFC-0905 `createdAt` to `2026-08-21` or earlier.

## Axis A — Structural completeness

No issues. Все разделы присутствуют и содержат реальный контент:

- Decision — present tense, single decision ✓
- CLI surface — exact commands with flags and scope ✓
- TypeScript contracts — minimal type signatures ✓
- File system responsibilities — concrete paths ✓
- Output format — `--json` shape documented ✓
- Failure modes — exit codes and warn-vs-fail behavior ✓
- Rollout — default behavior, adoption path, new-app compliance ✓
- Alternatives considered — 3 real alternatives with rejection reasons ✓
- Risks — performance, false positives, maintenance ✓
- Acceptance criteria — 12 items, checkable ✓
- Implementation notes — explicit behavioral rules ✓

## Axis B — DNA alignment

No issues. `satisfies: [DNA-84]` — DNA-84 уже присутствует в `docs/architecture-dna.md` (строка 351) с текстом "Established by RFC-0905". RFC body объясняет, как он устанавливает DNA-84. `related: [DNA-73, RFC-0318, RFC-0574, RFC-0589, RFC-0495, RFC-0904]` — все ссылки существуют и релевантны.

## Axis C — Ecosystem fit

- **Finding C-1**: `packagesImpacted` включает `@warpgogol/werkstatt-shared`, но в таблице File system responsibilities нет файлов в `werkstatt-shared`. Пакет импортирует `parseRedirectRules` из `@warpgogol/werkstatt-shared/share/redirects` — это зависимость, а не impacted package. Нужно убрать `@warpgogol/werkstatt-shared` из `packagesImpacted`.
- Pipeline placement (`SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.map.validate`) — корректно ✓
- Command-tables file (`31-public-surface.ts`) — корректно ✓
- AGENTS.md update (`packages/werkstatt-site/AGENTS.md`) — корректно ✓
- Command lifecycle (`proposed: [redirect.shadow.validate]`, `changed: [redirect.map.validate]`) — корректно ✓

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths. REDIR-07 расширяет существующий `redirect.map.validate` — не добавляет параллельную интерпретацию. Legacy code paths не сохраняются.

## Axis E — Agent-facing policy

No issues. Status gate корректный: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes ссылаются на RFC-0224 (accepted→implemented transition). No NEEDS CLARIFICATION markers. No persistence/cookie concerns.

## Axis F — Pragmatism

- **Finding F-1**: REDIR-07 (в `redirect.map.validate`) и RSHAD-01 (в `redirect.shadow.validate`) — одна и та же проверка: static file shadows redirect source. RFC признаёт это: "This is a subset of `redirect.shadow.validate` but is added to `redirect.map.validate` because the check is cheap and belongs logically with the existing REDIR-04." Однако RFC не указывает, что реализация должна использовать shared helper для предотвращения расхождения. Нужно добавить указание: "REDIR-07 and RSHAD-01 MUST share a common `checkStaticFileShadow` helper function."
- New command `redirect.shadow.validate` обоснован — альтернатива 1 (flag on `redirect.map.validate`) отклонена с причиной: cross-referencing against `dist/client/` and Worker routes — другой concern ✓
- Lean contracts ✓
- Existing patterns: reuses `parseRedirectRules`, `resolveDeploymentAdapter`, `normalizeUrlPath` ✓

## Axis G — Blind spots

- **Finding G-1**: RSHAD-02 (Worker route shadow) false-positive risk не полностью проанализирован. RFC признаёт: "the error is correct unless the Worker is known to handle redirects." Но если текущий Worker warpgogol.com обрабатывает `_redirects` до static-file lookup, каждый redirect rule с matching Worker route pattern триггерит RSHAD-02. RFC не анализирует, делает ли это текущий Worker. Нужно добавить: "The validator assumes Workers do not process `_redirects` before static files. If the Worker does process `_redirects`, RSHAD-02 will produce false positives — a `--skip-worker-shadow` flag or config escape hatch may be needed."
- **Finding G-2**: Нет `--mode` flag для migration. Rollout говорит "fail-hard from day one" с RSHAD-01 и RSHAD-02 как errors. Сайты с shadowed redirects будут падать без возможности downgrade to warnings. RFC-0837 (`css.mobile-layout.lint`) имеет `--mode=warning/error` flag — стоит рассмотреть аналогичный паттерн.
- **Finding G-3**: Path resolution для `wrangler.toml`/`wrangler.jsonc` не указан явно. RFC говорит "Read wrangler.toml or wrangler.jsonc from app directory" но не уточняет, как найти app directory в текущей архитектуре (missions/<id>/workpiece/). Нужно указать: "Resolved via `loadPublicContext(context)` — same app directory resolution as `redirect.map.validate`."

## Questions for the author

1. Должен ли `createdAt` быть исправлен на `2026-08-21` (или раньше) для устранения V-0478 monotonicity violation с RFC-0916?
2. Должен ли `packagesImpacted` убрать `@warpgogol/werkstatt-shared`, поскольку ни один файл в этом пакете не модифицируется?
3. Должны ли REDIR-07 и RSHAD-01 использовать общий helper (`checkStaticFileShadow`) для предотвращения расхождения реализаций?
4. Обрабатывает ли текущий Worker warpgogol.com `_redirects` до static-file lookup? Если да, RSHAD-02 будет давать false positives на каждом redirect rule — нужен ли `--skip-worker-shadow` flag или config escape hatch?
