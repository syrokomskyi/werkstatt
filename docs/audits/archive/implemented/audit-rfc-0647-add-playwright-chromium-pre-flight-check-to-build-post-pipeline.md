---
rfcId: RFC-0647
auditId: AUDIT-RFC-0647-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0647

## Verdict: Needs revision

RFC корректно выявляет пробел в `build.post` (отсутствие pre-flight проверки Chromium) и предлагает разумное решение (вынесение `ensurePlaywrightChromium` в команду `playwright.chromium.ensure`). Однако есть некорректные метаданные команд (`print.pdf.generate` в `changed`), слабое соответствие DNA-51, и неразрешённое поведенческое различие между существующей non-fatal функцией в `mission.materialize` и новой fatal командой.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0647` сообщает 0 нарушений.

## Axis A — Structural completeness

- **A1 — `commands.changed` содержит `print.pdf.generate` некорректно.** RFC явно заявляет (nonGoals, строка 60): "Do not change print.pdf.generate error handling." Команда `print.pdf.generate` не модифицируется — изменяется только пайплайн `build.post` (добавляется шаг перед ней). Изменение пайплайна не является изменением команды. `print.pdf.generate` должен быть удалён из `commands.changed`.

## Axis B — DNA alignment

- **B1 — DNA-51 соответствие слабое.** DNA-51 (строка 219 в `docs/architecture-dna.md`): "Werkstatt commands that mutate registry, mission, release, deployment, artifact, or Bordbuch state use shared lock, idempotency, and atomic staging primitives." Команда `playwright.chromium.ensure` не мутирует werkstatt-состояние (registry, mission, release, bordbuch) — она управляет установкой браузерной зависимости в `~/.cache/ms-playwright/`. Это concern dependency management, не consistency primitives. RFC-0646 (companion) тоже ссылается на DNA-51, но его ретраи `bordbuch.commit` ближе к werkstatt state mutations. Следует либо обосновать связь с DNA-51 убедительнее, либо рассмотреть другой инвариант.

## Axis C — Ecosystem fit

- **C1 — `commands.changed` metadata (см. A1).** `print.pdf.generate` не изменяется. Пайплайн `build.post` не является командой и не отражается в command lifecycle buckets.
- **C2 — Флаг `--system` избыточен.** RFC заявляет "Flags: `--system` (optional, defaults to `context.site.name`)." Существующая `ensurePlaywrightChromium` (`mission-materialize.ts:563-597`) принимает только `workspaceRoot` и `logger` — установка Chromium глобальна (`~/.cache/ms-playwright/`), не зависит от сайта. Флаг `--system` не нужен для функциональности команды.
- **C3 — Направление зависимостей корректно.** `site-kernel-handoff` уже зависит от `site-kernel-checks` (`package.json:113`) и уже импортирует из него (`mission-materialize.ts:61`). Вынесение функции из `handoff` в `checks` сохраняет направление импорта. ✓
- **C4 — Позиция в пайплайне корректна.** `qa.independent.run` (Playwright-dependent) находится внутри `SITES_CHECK_POSTBUILD_PIPELINE` (строка 68 в `sites-check-postbuild.ts`), который разворачивается в `SITES_BUILD_POST_PIPELINE` (строка 35 в `build-post.ts`) — до `print.pdf.generate` (строка 42). Размещение ensure на позиции 0 покрывает оба Playwright-dependent шага. ✓

## Axis D — Forward-only compliance

No issues. RFC выносит существующую логику в новую команду без shim-слоёв или dual-paths. ✓

## Axis E — Agent-facing policy

No issues. Status gate корректный, implementation notes ссылаются на правильные governance rules (RFC-0224, RFC-0334). ✓

## Axis F — Pragmatism

- **F1 — Избыточный флаг `--system` (см. C2).** Команда не требует site-specific поведения. Флаг добавляет ненужную surface area.
- **F2 — `appsImpacted` содержит только `warpgogol-com`.** Изменение пайплайна `build.post` влияет на все приложения, запускающие `build.post`. Если `warpgogol-com` — единственное приложение с `output.printPdf: true`, это следует указать явно. Иначе следует перечислить все затронутые приложения.
- **F3 — Новая команда обоснована.** Alternatives section честно рассматривает inline auto-install в `print.pdf.generate` и отвергает из-за дублирования с `independent-qa`. ✓

## Axis G — Blind spots

- **G1 — Behavioral change: non-fatal → fatal для `mission.materialize`.** Существующая `ensurePlaywrightChromium` (`mission-materialize.ts:590-596`) ловит ошибку установки и логирует как non-fatal (`logger.info` с "non-fatal"). Новая команда `playwright.chromium.ensure` возвращает `exitCode: 1` при неудаче установки (Failure modes table). RFC говорит "mission.materialize delegates to runPlaywrightChromiumEnsure" но не адресует изменение поведения: либо `mission.materialize` должен ловить ошибку (сохраняя non-fatal), либо RFC должен явно заявить, что `mission.materialize` становится fatal при неудаче установки Chromium.
- **G2 — Behavioral upgrade: directory check → launch verification.** Существующая `ensurePlaywrightChromium` проверяет только наличие директории `~/.cache/ms-playwright/chromium*` (строки 568-577) — без запуска браузера. Новая команда запускает Chromium для получения `chromiumRevision` и верификации launch (Failure modes: "verify launch"). Это функциональное расширение, не чистое извлечение. RFC следует явно отметить этот upgrade.
- **G3 — Concurrent builds.** Два одновременных `build.post` могут оба запустить `playwright install chromium`. `playwright install` не lock-файл, но установка идемпотентна. Minor risk, не блокирующий.

## Questions for the author

1. Должен ли `mission.materialize` сохранять текущее non-fatal поведение при неудаче установки Chromium, или стать fatal как новая команда? RFC не адресует этот behavioral change.
2. Почему `print.pdf.generate` в `commands.changed`? RFC явно заявляет "Do not change print.pdf.generate error handling" — команда не модифицируется, только пайплайн.
3. Является ли DNA-51 правильным инвариантом для команды управления браузерной зависимостью? DNA-51 о werkstatt state mutation primitives (lock, idempotency, atomic staging), а не о dependency management.
