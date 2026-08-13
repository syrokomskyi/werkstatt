---
rfcId: RFC-0829
auditId: AUDIT-RFC-0829-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0829

## Вердикт: Needs revision

RFC содержит несколько фактических ошибок о структуре релизов и границах пакетов, а также пробелы в проектировании gate'ов для сервисов (отсутствие commitSha, L1 evidence из CI). Необходимо исправить до реализации.

## Механическая валидация (rfc.validate)

Pass — 0 нарушений.

## Ось A — Структурная полнота

- **Опечатка в CLI surface** (строка 116): `--commit-sha <sha` — пропущена закрывающая `>`. Должно быть `--commit-sha <sha>`.
- **Неверный путь к релизам** (строка 127, таблица file system responsibilities): RFC указывает `releases/<site-id>/<release-id>/.test-evidence/`, но фактическая структура релизов — `releases/<release-id>/` (без `<site-id>`). Проверено в `leitstand-commands.ts:1901` — `path.join(workspaceRoot, "releases", releaseId, "dist")`.
- **Неоднозначность в именовании evidence-файлов** (строки 128–129 vs 259): Примеры хранения показывают `L4-e2e.json`, `L5-smoke.json`, но код `recordTestEvidence` использует `${evidence.level}.json`, что даст `L4.json`, `L5.json` — без суффикса названия теста. Нужно выбрать одну схему.
- **Механизм grace period не определён** (строка 342): RFC говорит "gates emit warnings (not errors)" в течение 2 недель, но не указывает механизм: проверка даты? флаг? конфигурация в `forge.yaml`? Без этого агент не сможет реализовать различие warn vs fail.

## Ось B — Выравнивание по DNA

- **Нарушение DNA-64** (строка 279, таблица file system responsibilities): `test-evidence.ts` помещён в `packages/werkstatt/src/leitstand/` (движок), но DNA-64 и RFC-0823 требуют, чтобы тестовая инфраструктура жила в плагине (`packages/werkstatt-site/`). Движок должен предоставлять pipeline gate hooks, а тестовая логика — в плагине. `packagesImpacted` корректно указывает `@warpgogol/werkstatt-site`, но путь файла противоречит этому.
- **DNA-66 соблюдён**: RFC корректно реализует последнюю часть DNA-66 — "deployment pipeline commands verify test evidence from prior pipeline stages and block promotion when evidence is missing or failed."

## Ось C — Экосистемная совместимость

- **Граница пакетов**: `test.evidence.verify` и `test.evidence.list` — команды тестовой инфраструктуры. Согласно RFC-0823 и DNA-64, они должны регистрироваться плагином `@warpgogol/werkstatt-site`, не движком. Раздел `packagesImpacted` включает `@warpgogol/werkstatt-site`, но файл `test-evidence.ts` указан в `packages/werkstatt/`. Нужно перенести в `packages/werkstatt-site/src/testing/` или `packages/werkstatt-site/src/checks/`.
- **commitSha для сервисов**: `leitstand.service.promote` (`service-promote.ts`) не имеет концепта commitSha — сервисы не имеют release manifests. RFC предлагает `--commit-sha <sha>` в gate для сервисов (строка 241), но не объясняет, откуда берётся commitSha. Нужно либо убрать commitSha-matching для сервисов, либо описать механизм получения (например, `git rev-parse HEAD` в директории сервиса).
- **L1 evidence из CI**: RFC указывает, что `leitstand.service.promote` проверяет L1+L2+L5 (строка 245). Но L1 unit-тесты запускаются в CI через `turbo run test`, не в deployment pipeline. Не объяснено, как L1 evidence попадает из CI в `services/<service-id>/.test-evidence/L1-unit.json`. Нужен механизм записи evidence после CI-прогона.
- **L3 contract evidence не упомянут**: RFC не объясняет, почему L3 (contract testing, RFC-0827) исключён из всех gate'ов. L3 запускается в `PACKAGES_CHECK_PIPELINE` (CI), не в deployment pipeline — это разумное решение, но должно быть явно задокументировано в nonGoals или Design.
- **`services/registry.yaml` `lastTestEvidence`** (строка 283, 344): Поле дублирует информацию, уже доступную из evidence-файлов (timestamp в JSON). Неясно, зачем нужно отдельное поле в реестре. Если это для быстрого запроса без чтения файлов, стоит объяснить.

## Ось D — Forward-only compliance

- **Grace period** (строка 342): 2-недельный grace period — это временный compatibility layer, но с чёткой датой окончания, что допустимо. Однако механизм различения warn vs fail не определён (см. Ось A). После grace period gates становятся fatal — это соответствует forward-only дисциплине.
- **Existing releases grandfathered** (строка 343): "Releases deployed before this RFC do not have test evidence. They are grandfathered." Не определено, как gate определяет "existing" vs "new" release. По commitSha? По дате? По наличию evidence-директории?

## Ось E — Agent-facing policy

- **Status gate соблюдён**: RFC корректно указывает "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **NEEDS CLARIFICATION markers**: Не найдены.
- **Grace period documentation** (строка 370): Acceptance criterion требует документации в `AGENTS.md` и `services/AGENTS.md` — хорошо.
- **Anti-fabrication**: Acceptance criteria — это code changes (команды, gates), не content authoring. Проблем нет.

## Ось F — Прагматизм

- **`test.evidence.list`** — минимально оправдан. Можно было бы сделать флаг `--list` на `test.evidence.verify`, но отдельная команда даёт чистый API. Приемлемо.
- **`services/registry.yaml` `lastTestEvidence`** — избыточное поле. Evidence-файлы уже содержат timestamp. Удалить или обосновать.
- **`--commit-sha` для сервисов** — проблемный флаг. Если сервисы не имеют commitSha в promote flow, либо убрать matching, либо описать получение. Текущая спецификация нереализуема как есть.

## Ось G — Слепые зоны

- **Concurrent deployments**: Два агента, деплоящих один сайт, могут конкурировать за evidence-файлы. Не рассмотрено.
- **Partial writes / crash mid-write**: JSON-файлы evidence могут быть повреждены при сбое во время записи. Не рассмотрено (нет atomic write).
- **Evidence directory for new services/sites**: После grace period новый сервис без evidence-директории будет заблокирован. Нужно либо требовать создание директории при scaffold, либо обрабатывать отсутствие как warning.
- **Staleness gate (TEST-EVIDENCE-GATE-04)**: 24-часовой порог staleness указан, но не объяснено: что делать, если evidence старее 24ч? Блокировать? Предупреждать? Это особенно важно для promote, который может происходить через несколько дней после dev-deploy.
- **Site evidence path**: RFC говорит `releases/<site-id>/<release-id>/.test-evidence/`, но правильный путь — `releases/<release-id>/.test-evidence/`. Это не просто опечатка — это влияет на `resolveEvidenceDir` в реализации.

## Вопросы автору

1. Откуда `leitstand.service.promote` получает commitSha для verification? Сервисы не имеют release manifests с commitSha. Нужно ли убрать commitSha-matching для сервисов или добавить `git rev-parse HEAD` в `service-promote.ts`?
2. Как L1 unit-test evidence попадает из CI в `services/<service-id>/.test-evidence/L1-unit.json`? L1 тесты запускаются в CI через `turbo run test`, не в deployment pipeline. Нужен механизм записи evidence после CI.
3. Каков механизм grace period? Дата в `AGENTS.md`? Флаг `--strict-evidence-gates`? Конфигурация в `forge.yaml`? Без этого агент не сможет реализовать различие warn vs fail.
