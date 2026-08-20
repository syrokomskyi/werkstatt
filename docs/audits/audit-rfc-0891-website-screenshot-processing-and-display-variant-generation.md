---
rfcId: RFC-0891
auditId: AUDIT-RFC-0891-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0891

## Verdict: Needs revision

RFC корректно описывает команду `nachweis.screenshot.process` и её pipeline, но содержит несколько находок: `packagesImpacted` включает `werkstatt-site` без реальных изменений, rollout неточно утверждает что `sharp` уже добавлен RFC-0890 (который ещё `draft`), и не обрабатываются edge cases для `--crop-offset` за пределами высоты изображения и апскейлинг малых изображений.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0891 --json` вернул 0 нарушений.

## Axis A — Structural completeness

- **Acceptance criteria и NACHWEIS-SCREENSHOT-DISPLAY-01**: Compass sync (строка 94) упоминает validation rule `NACHWEIS-SCREENSHOT-DISPLAY-01` («when `websiteScreenshot.rawArtifact` is present, `websiteScreenshot.url` should also be present»), но ни один критерий приёмки не проверяет это правило. Если правило входит в scope RFC, нужен checkable критерий. Если нет — следует убрать из Compass sync или явно пометить как documentation-only.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46, DNA-59]` — оба инварианта существуют в `docs/architecture-dna.md`. RFC объясняет как команда поддерживает mission lifecycle (locks, Bordbuch, commit) и evidence preservation (R2 public для display variant, R2 private для raw). Новых DNA инвариантов не устанавливается. Конфликтов с существующими инвариантами нет.

## Axis C — Ecosystem fit

- **Validation enforcement для NACHWEIS-SCREENSHOT-DISPLAY-01**: Правило упомянуто в Compass sync для `docs/verification-plan.xml`, но не enforced через `nachweis.validate`. `nachweis.validate` отсутствует в `commands.changed`, `nachweis-validate.ts` отсутствует в file system responsibilities. RFC-0890 следует той же pattern (documentation-only), так что это может быть intentional — но стоит явно указать что правило documentation-only, а не executable.

- **Package boundaries**: Импорты идут `packages/werkstatt` → `packages/werkstatt-site` (через existing schema), что соответствует DNA-1. Команда живёт в `packages/werkstatt/src/nachweis/` — корректно.

- **AGENTS.md updates**: RFC указывает обновить `packages/werkstatt/AGENTS.md` — корректно, файл существует и уже содержит section для `nachweis.screenshot.upload` (RFC-0886).

## Axis D — Forward-only compliance

No issues. Нет compatibility shims, нет dual-path, нет legacy code paths. Команда сосуществует с `nachweis.screenshot.upload` как отдельная команда для другой цели — это не backward compatibility layer.

## Axis E — Agent-facing policy

No issues. RFC имеет status `draft` и содержит явное указание «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)». Implementation notes ссылаются на правильные governance rules (RFC-0224 transition, `rfc.supersede.propose` на invariant conflict). Storage policy: R2, нет cookies. NEEDS CLARIFICATION markers не найдены.

## Axis F — Pragmatism

- **Scope discipline — `werkstatt-site` in `packagesImpacted`**: `packagesImpacted` содержит `werkstatt-site`, но file system responsibilities table (строка 195) явно пишет «No schema changes — `websiteScreenshot` already has `sha256`, `mediaType`, `storage`, `url`, `capturedAt`». RFC-0891 не модифицирует ни один файл в `packages/werkstatt-site/`. `werkstatt-site` следует убрать из `packagesImpacted` — зависимость на schema из RFC-0890 описана через `dependsOn`, а не через `packagesImpacted`.

- **Minimal command surface**: Команда `nachweis.screenshot.process` оправдана — crop/resize/convert это отдельная ответственность от upload. Альтернативы (extend upload, build-time processing) рассмотрены и отклонены с причинами.

- **Lean contracts**: TypeScript interfaces минимальны и не содержат спекулятивных полей.

## Axis G — Blind spots

- **`--crop-offset` beyond image boundary**: Если `cropOffset + cropHeight > rawHeight`, sharp `.extract()` выбросит ошибку. RFC не упоминает валидацию `cropOffset` против `rawHeight - cropHeight`. Нужно явное сообщение об ошибке, например: `--crop-offset 26000 exceeds maximum (rawHeight - cropHeight = 25127)`.

- **Raw image smaller than 1280×720**: `resize(1280, 720, { fit: "cover" })` апскейлит изображение меньшее 1280×720, что может дать низкое качество. RFC не упоминает этот case. Стоит задокументировать как accepted trade-off или добавить warning.

- **Rollout step 4 неточен**: Rollout step 4 (строка 289) утверждает «sharp dependency: Already added to `packages/werkstatt/package.json` by RFC-0890». Однако RFC-0890 имеет status `draft` и не реализован — `sharp` отсутствует в `packages/werkstatt/package.json` (проверено grep). Формулировка должна быть «Must be added by RFC-0890 before implementation» или аналогичная, с явной зависимостью от реализации RFC-0890.

- **Concurrent execution**: Два агента, запускающие `nachweis.screenshot.process` на одном evidence-source одновременно, могут конфликтовать при записи файла. RFC упоминает system и bordbuch locks, но не обсуждает race condition для file write + R2 upload. Существующие команды (upload, ingest) имеют ту же проблему — это accepted pattern, но стоит явно отметить.

## Questions for the author

1. Как должна вести себя команда при `cropOffset + cropHeight > rawHeight` — fail с clear error, или clamp `cropTop` к `rawHeight - cropHeight`?
2. Должно ли правило `NACHWEIS-SCREENSHOT-DISPLAY-01` быть enforced через `nachweis.validate` (code change в `nachweis-validate.ts`), или оно остаётся documentation-only в `docs/verification-plan.xml`?
3. Если raw изображение меньше 1280×720, должен ли процесс апскейлить (текущий behavior `fit: "cover"`), или fail с предупреждением о недостаточном разрешении?
