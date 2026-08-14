---
rfcId: RFC-0834
auditId: AUDIT-RFC-0834-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0834

## Verdict: Needs revision

Два критических находки: (1) ID RFC-0834 уже занят архивированным RFC (`docs/rfcs/archive/implemented/rfc-0834-commit-generated-variant-manifests-for-drift-detection.md`) — требуется перенумерация; (2) `scope: workspace` противоречит CLI-флагу `--site` и размещению в `SITES_CHECK_AUTHOR_PIPELINE` (per-site) — команда должна быть в `PACKAGES_CHECK_PIPELINE`.

## Mechanical validation (rfc.validate)

**Fail** — 2 errors + 1 warning:

- **V-02** (error): Duplicate id "RFC-0834" — also in `docs/rfcs/archive/implemented/rfc-0834-commit-generated-variant-manifests-for-drift-detection.md`. RFC был создан сканированием только верхнего уровня `docs/rfcs/`, пропустив архив. Требуется перенумерация: удалить файл и пересоздать через `rfc.create`.
- **V-31** (error): Duplicate filename number 0834 — тот же архивный файл.
- **V-32** (warning): 1 implement commit in git history since 2026-08-13 but status is "draft". Побочный эффект дубля ID — commit относится к архивному RFC-0834. Исчезнет после перенумерации.

## Axis A — Structural completeness

**Finding A1 — CLI surface противоречит scope.** Строка 86: `pnpm exec werkstatt run a11y.label-in-name.component.validate --site warpgogol-com`. Но `scope: workspace` (строка 6) означает, что команда сканирует `packages/werkstatt-site/src/domain/ui/**/*.astro` — shared package, не per-site. Флаг `--site` не нужен и вводит в заблуждение. Убрать `--site warpgogol-com` из CLI-примера.

Остальные разделы корректны: Decision в present tense, TypeScript contracts минимальны, file system responsibilities конкретны, output format документирован, failure modes с exit codes, alternatives с реальными rejection reasons, risks включают false-positive rate и agent misinterpretation, acceptance criteria checkable (10 пунктов).

## Axis B — DNA alignment

**Finding B1 — `satisfies: [DNA-67]` слабо обосновано.** DNA-67 (строки 283–286 `docs/architecture-dna.md`): "Every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator." Lighthouse audit `label-content-name-mismatch` уже покрыт `a11y.label-in-name.validate` (RFC-0832) в coverage matrix (`docs/lighthouse-parity-matrix.yaml:47-50`). Этот RFC добавляет комплементарный pre-build static check, не новый coverage в matrix. `satisfies: [DNA-67]` допустимо, но RFC не объясняет, как именно он удовлетворяет DNA-67 — он усиливает существующее покрытие, а не добавляет новое. Уточнить в Architectural fit: RFC не расширяет coverage matrix, а добавляет ранний static analysis для того же Lighthouse audit.

## Axis C — Ecosystem fit

**Finding C1 — Scope/pipeline mismatch (CRITICAL).** `scope: workspace` (строка 6) противоречит:
- CLI `--site warpgogol-com` (строка 86) — workspace-scoped команды не принимают per-site флаги.
- Pipeline `SITES_CHECK_AUTHOR_PIPELINE` (строка 79, 193) — это per-site pipeline (scope: app). Workspace-scoped команды должны быть в `PACKAGES_CHECK_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/packages-check.ts`).

Прецедент: `section.image-props.validate` (RFC-XXXX, memory) — workspace-scoped компонентный валидатор в `PACKAGES_CHECK_PIPELINE` (строка 109). RFC-0834 должен следовать этому паттерну: `scope: workspace`, `PACKAGES_CHECK_PIPELINE`, без `--site` флага.

**Finding C2 — Pipeline placement невозможен.** Строка 193: "after `lighthouse.validate` and before `content.references.validate`". В `SITES_CHECK_AUTHOR_PIPELINE`: `content.references.validate` на строке 275, `lighthouse.validate` на строке 350 (последний шаг). `content.references.validate` идёт ДО `lighthouse.validate`, а не после. Предложенное размещение невозможно. Если команда переносится в `PACKAGES_CHECK_PIPELINE` (см. C1), размещение должно быть указано относительно шагов в этом pipeline (например, после `section.image-props.validate`).

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. Deprecation не требуется.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes ссылаются на RFC-0224, RFC-0330, RFC-0334. No NEEDS CLARIFICATION markers. No content authoring claims.

## Axis F — Pragmatism

**Finding F1 — Прецедент `section.image-props.validate` не упомянут.** Существующий workspace-scoped компонентный валидатор (`section.image-props.validate` в `PACKAGES_CHECK_PIPELINE`) сканирует те же `packages/werkstatt-site/src/domain/ui/**/*.astro` файлы для component prop validation. RFC должен сослаться на этот паттерн и следовать ему (scope, pipeline, command table placement). Alternatives section должна объяснить, почему расширение `section.image-props.validate` недостаточно (разные rule types: prop usage vs aria-label/text parity).

Остальное корректно: команда earns its existence (distinct from post-build validator), contracts lean, `packagesImpacted` correct.

## Axis G — Blind spots

**Finding G1 — `resolveLabelInName` helper не учтён в detection logic.** ADR-0047 (строка 68) говорит: "The `resolveLabelInName` helper should be extracted to a shared utility when RFC-0834 is implemented — the validator will need to recognize the pattern, and a shared helper makes it canonical." RFC не описывает, как валидатор распознаёт `resolveLabelInName` helper как safe pattern. Detection logic (строки 122–158) упоминает `resolvedAriaLabel` как safe pattern, но не указывает, что валидатор ищет вызов `resolveLabelInName` или аналогичного helper в aria-label expression. Добавить: валидатор распознаёт `resolveLabelInName(...)` или любой expression, содержащий visible text variable name, как safe pattern.

**Finding G2 — Migration path неточен.** Строка 194: "Existing apps: All existing apps must pass." Но команда workspace-scoped — она сканирует shared package components, не per-site. "Existing apps" не применяется. Переформулировать: "Existing codebase: All components in `packages/werkstatt-site/src/domain/ui/` must pass. The component fixes already applied in platform 5.51.6 ensure the current codebase is clean."

## Questions for the author

1. В какой pipeline должна попасть команда — `PACKAGES_CHECK_PIPELINE` (workspace-scoped, соответствует `scope: workspace` и паттерну `section.image-props.validate`) или `SITES_CHECK_AUTHOR_PIPELINE` (per-site, требует `scope: app`)? Текущий RFC противоречив.
2. Как валидатор распознаёт `resolveLabelInName` helper (ADR-0047) как safe pattern? Detection logic должна явно описать распознавание helper call в aria-label expression.
3. Какой следующий доступный RFC номер после перенумерации? RFC-0835 уже существует — нужно проверить `rfc.create` для назначения корректного номера.
