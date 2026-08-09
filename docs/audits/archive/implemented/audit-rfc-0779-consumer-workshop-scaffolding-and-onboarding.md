---
rfcId: RFC-0779
auditId: AUDIT-RFC-0779-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0779

## Verdict: Needs revision

RFC описывает нужную команду (`workshop.scaffold`) с правильной абстракцией (workshop ≠ project), но имеет пробелы в делегировании forge-артефактов, неполную связь DNA-инвариантов и chicken-and-egg проблему с npm-токеном при пост-scaffold верификации.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Нет секции TypeScript contracts.** Для `command` kind RFC секция с сигнатурой обработчика минимальна, но RFC предлагает команду с верификацией (`forge.doctor`, `werkstatt.plugin.validate`, `werkstatt.autonomy.validate`) — тип результата `ScaffoldResult` и интерфейс хука делегирования не показаны. CLI surface и output format есть, но contracts отсутствуют.
- **Нет секции File system responsibilities.** Таблица артефактов (lines 95-118) перечисляет что генерируется, но не называет исходные файлы обработчика (где живёт `workshop.scaffold` handler, какой package его регистрирует).
- **Форматирование:** перед `## Implementation notes for agents` (line 216) нет пустой строки — последняя acceptance criterion сливается с заголовком.

## Axis B — DNA alignment

- **`satisfies: []` пуст, но body ссылается на DNA-1, DNA-2, DNA-64, DNA-62** (lines 145-148). Для `command` kind RFC `satisfies` не обязателен (RFC-0331), но если body заявляет alignment, эти DNA должны быть в `satisfies[]` — особенно DNA-62 (pinned files), который RFC активно использует (`.forge/pinned.yaml`).
- **DNA-64 не существует в `docs/architecture-dna.md`.** RFC-0769 (charter) ещё `draft` — DNA-64 не зарегистрирован. RFC-0779 ссылается на него в Architectural fit (line 146), но invariant не создан. Это forward-looking ссылка, допустимая в draft, но должна быть отмечена как зависимость от RFC-0769.

## Axis C — Ecosystem fit

- **`packagesImpacted: []` пуст.** Обработчик `workshop.scaffold` должен жить в каком-то package — вероятно `packages/werkstatt` (после RFC-0772) или `packages/os/site-kernel-handoff` (до консолидации). RFC не указывает package.
- **`onboarding.scaffold` изменяется, но не в `commands.changed`.** RFC говорит (line 137): "the operator creates the first project using the existing `onboarding.scaffold` command (now provided by the plugin's `hooks.scaffoldProject`)". Это меняет реализацию `onboarding.scaffold` — она становится plugin hook вызовом вместо прямого обработчика. Должно быть в `commands.changed: [onboarding.scaffold]`.
- **Делегирование к `forge.create` некорректно.** RFC говорит (line 148): "`workshop.scaffold` delegates to `forge.create` for forge-specific artifacts". Но `forge.create` создаёт проект в подкаталоге (`packages/forge/src/onboarding/create.ts:143` — `path.resolve(context.workspaceRoot, name)`), а не артефакты в текущей директории. `forge.init` — вот что пишет `forge.yaml`, skills, `AGENTS.md`, docs dirs в существующую директорию (`packages/forge/src/onboarding/init.ts`). RFC должен ссылаться на `forge.init` (или `forge.scaffold` + `forge.init`), не на `forge.create`.
- **CLI имя `werkstatt run` vs `site-kernel run`.** RFC использует `pnpm exec werkstatt run workshop.scaffold` (line 90), но текущий CLI — `pnpm exec werkstatt run`. Переименование происходит в RFC-0772 (wave 2). RFC-0779 (wave 5) корректно предполагает новое имя, но должно явно отметить зависимость от переименования.

## Axis D — Forward-only compliance

No issues. RFC не предлагает shim'ов или dual-path. NonGoals явно говорят "No new engine or plugin code — this RFC wires existing pieces".

## Axis E — Agent-facing policy

- **`requiresNetwork` не отмечен.** Пост-scaffold верификация запускает `pnpm install` (line 130), что требует сетевого доступа к private npm. RFC не отмечает это как `requiresNetwork: true` в метаданных команды. Агенты должны знать, что команда не работает офлайн.
- No NEEDS CLARIFICATION markers. No self-authorizing language.

## Axis F — Pragmatism

- **Граница делегирования нечёткая.** Таблица артефактов (lines 95-118) перечисляет `.agents/`, `AGENTS.md`, `docs/rfcs/rfc-0000-template.md`, `docs/adrs/adr-0000-template.md`, `.forge/pinned.yaml` — но это артефакты, которые `forge.init` уже создаёт. RFC говорит "delegates to `forge.create` for forge-specific artifacts" (line 148), но не разделяет: какие артефакты `workshop.scaffold` генерирует напрямую, а какие делегирует `forge.init`. Нужна чёткая граница — иначе дублирование.
- **`packagesImpacted: []`** — должен указать package обработчика.

## Axis G — Blind spots

- **Chicken-and-egg с `.npmrc` и `pnpm install`.** RFC генерирует `.npmrc` с placeholder токеном (line 102: "Scoped registry config for `@warpgogol` (private npm token placeholder)"). Но пост-scaffold верификация (line 130) запускает `pnpm install` — это не сработает с placeholder токеном. Нужен либо `--skip-install` флаг, либо верификация должна пропускать `pnpm install` и документировать это как ручной шаг после заполнения токена.
- **npm auth failure mode отсутствует.** SCAFFOLD-02 покрывает "Plugin not installed (npm install fails)", но не различает "plugin не существует на npm" и "npm token invalid/expired". Это разные ошибки с разными remediation-путями.
- **Нет `timeoutMs` / `longRunning` декларации.** `pnpm install` + `forge.doctor` + `werkstatt.plugin.validate` + `werkstatt.autonomy.validate` могут занять минуты. RFC не отмечает команду как `longRunning: true`.
- **Concurrent execution:** два `workshop.scaffold` в одну директорию — SCAFFOLD-05 (non-empty) покрывает, но race condition между `mkdir` и проверкой не рассмотрена.

## Questions for the author

1. Какие артефакты `workshop.scaffold` генерирует напрямую, а какие делегирует `forge.init`? Таблица артефактов должна разделять эти две зоны.
2. Должен ли `onboarding.scaffold` быть в `commands.changed`, учитывая что его реализация меняется на plugin hook вызов?
3. Как `workshop.scaffold` обрабатывает chicken-and-egg: `.npmrc` с placeholder токеном + немедленный `pnpm install` в верификации? Нужен `--skip-install` флаг?
