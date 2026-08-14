---
rfcId: RFC-0854
auditId: AUDIT-RFC-0854-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: gpt-5.6-sol
verdict: needs-revision
---

# Аудит: RFC-0854

## Вердикт: Требует доработки

Решение о чистом Node 24 cutover внутренне согласовано, forward-only и не добавляет лишнего CLI. До реализации RFC должен закрыть шесть практических разрывов: перевод фактического runtime до первой мутации, миграцию единственного действующего Sternsystem, независимый major для Forge, синхронизацию skill, полную test matrix и точный Compass delta.

## Механическая валидация (`rfc.validate`)

Пройдена: `rfc.validate --id RFC-0854 --json` вернул `status: pass`, 0 нарушений и 0 маркеров.

## Ось A — Структурная полнота

1. Rollout начинается с изменения `engines` и `engineStrict` (`RFC-0854:173-181`), но не требует до этого перевести runtime самого исполнителя. Во время аудита `node --version` вернул `v22.22.1`; после первой же мутации pnpm должен заблокировать оставшиеся install/test/commit gates. Нужен нулевой preflight: до любых file changes агент обеспечивает Node 24, повторно запускает `node --version` и `pnpm --version` в новом runtime и при неудаче не мутирует repository.

2. Фраза «requires the major version bump declared here» (`RFC-0854:99-101`) смешивает два независимых version domains. Frontmatter `versionBump: major` управляет platform version, а RFC-0704 явно оставляет version независимого `packages/forge` ручным. Сейчас `packages/forge/package.json` имеет `0.28.0`, а `forge.yaml#forge.syncedVersion` — `0.23.0`; RFC должен назвать точную целевую Forge version, оба изменяемых файла, tarball/standalone Node 24 smoke gate и отдельную от реализации operator-triggered publication boundary. RFC-0543 и RFC-0704 нужно добавить в `related[]` и объяснить в Architectural fit.

3. Заявленная full affected-package verification не отражена в exact CLI (`RFC-0854:105-121`): отсутствуют build/test для заявленных `@warpgogol/werkstatt-game` и `@warpgogol/werkstatt-video`, `services.check.run`, оба `service.test.run --service ...`, skill/doctor drift gate и валидация текущего Sternsystem. Формулировки «scoped build/tests or image smoke checks» (`RFC-0854:178`) недостаточно для более слабого агента: все required commands, очерёдность и blocking result должны быть перечислены.

## Ось B — Соответствие Architecture DNA

Нарушений нет. RFC не присваивает себе новую DNA, не меняет package boundaries и переносит runtime policy без compatibility layer.

## Ось C — Соответствие экосистеме

1. RFC обеспечивает только будущие workshop/site outputs (`RFC-0854:83-93`, `216-223`), но фактический единственный site останется на legacy runtime: `../systems-cache/warpgogol-com/package.json` объявляет `engines.node: ">=22"` и `@types/node: "^26.1.0"`. Нужен exact existing-site adoption через mission workpiece — никаких прямых edits в cache clone — с commit/reconcile/close, site build/check и доказательством, что после close единственный Sternsystem больше не рекламирует 22/26.

2. File map меняет `packages/forge/skills/fo/ef-onboard/SKILL.md`, но не называет `.agents/skills/ef-onboard/SKILL.md` (`RFC-0854:145-154`). `packages/forge/AGENTS.md` требует коммитить оба файла в одной сессии, и оба сейчас содержат `Node.js 18+`. RFC должен зафиксировать canonical sync и `forge.doctor`/skill validation как blocking drift evidence.

3. File map пропускает `packages/forge/src/tests/editframe-e2e.test.ts:156`, где `Node.js 18+` — не version-agnostic discovery fixture, а semantic prerequisite fixture для `forge doctor`. Этот тест должен войти в owner map и доказывать отказ для non-24 runtime; иначе classified search либо ложно его исключит, либо acceptance не пройдёт.

4. Строка «relevant Compass files» (`RFC-0854:225`) не определяет delta. Как минимум `docs/technology.xml:9-17` должен получить exact closed range, `docs/requirements.xml` — durable single-major/fail-closed requirement, а `docs/verification-plan.xml` — exact runtime, affected-package, service, scaffold и current-site gates. Для остальных root Compass файлов RFC должен либо назвать изменение, либо дать явную no-change rationale; фраза «through their owners» недостаточна для implementation plan.

## Ось D — Forward-only соответствие

Нарушений нет. RFC явно запрещает Node 22 grace period, dual-runtime CI, fallback, warning-only mode и открытую верхнюю границу (`RFC-0854:83-87`, `181-203`).

## Ось E — Политика для агентов

Нарушений нет. Draft не самоавторизуется, publication остаётся только operator-triggered, а pre-stamp правила RFC-0230/0330/0334/0476 названы (`RFC-0854:228-240`). Неразрешённых `NEEDS CLARIFICATION` маркеров нет.

## Ось F — Практичность

Нарушений нет. Широкий scope оправдан атомарностью единого runtime contract; RFC переиспользует engines, pnpm settings, существующие templates/profiles и tests вместо нового CLI.

## Ось G — Слепые зоны

1. Для existing-site adoption не определено, как соблюсти template-first rule для `package.json` с generated marker и при этом сохранить site-specific scripts/dependencies. RFC должен назвать owner/regeneration или явно документированный bounded migration path, а не оставлять слабому агенту выбор между прямым edit и повторным onboarding.

2. Tarball risk назван (`RFC-0854:205-212`), но ни exact pre-publication command, ни standalone fixture path, ни assertion, что package отклоняет Node 22 и запускается на Node 24, не включены в acceptance. Обычный monorepo build не доказывает published Forge boundary, поэтому политика major release должна иметь машинно-проверяемый standalone gate до publication.

## Вопросы автору

1. Входит ли перевод текущего `warpgogol-com` в RFC-0854 как обязательная mission-lifecycle фаза, или он будет вынесен в отдельный blocking RFC, без которого RFC-0854 нельзя считать завершённым?
2. Фиксируем ли мы целевой `@warpgogol/forge@1.0.0`, синхронный `forge.syncedVersion`, standalone tarball smoke на Node 24 и только затем отдельную operator-triggered publication?
3. Какой exact preflight должен обеспечить Node 24 для агента до первого edit, если текущая сессия всё ещё исполняется на Node 22 и runtime auto-download запрещён?
