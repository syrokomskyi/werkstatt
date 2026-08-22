---
rfcId: RFC-0913
auditId: AUDIT-RFC-0913-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0913

## Вердикт: Needs revision

RFC содержит два важных баг-фикса для жизненного цикла миссий, но имеет критическую ошибку в дизайне Guard 1 (сравнение workpiece HEAD с cache clone HEAD всегда даст false) и не хватает большинства обязательных разделов (CLI surface, TypeScript contracts, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes for agents).

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0913 --json` exit 0, 0 violations.

## Ось A — Структурная полнота

- **Отсутствует CLI surface** — нет точных вызовов команд с флагами. RFC описывает `--skip-reconcile-check` в прозе, но не показывает полный инвок.
- **Отсутствует TypeScript contracts** — RFC содержит полноценные реализации функций вместо минимальных type signatures. `restoreCacheCloneGitignore` и `untrackForbiddenGeneratedFiles` — это код, а не контракты.
- **Отсутствует File system responsibilities** — нет таблицы путей, которые затрагивает RFC.
- **Отсутствует Output format** — нет документации `--json` shape для новых полей `CloseReportReconcile` (`freshnessChecked`, `unreconciledCommits`).
- **Отсутствует Failure modes** — нет exit codes и warn-vs-fail поведения для нового guard.
- **Отсутствует Rollout** — не описано поведение по умолчанию и путь адаптации для существующих систем.
- **Отсутствует Alternatives considered** — нет ни одной рассмотренной альтернативы.
- **Отсутствует Risks** — нет анализа рисков (agent misinterpretation, false-positive rate).
- **Отсутствует Acceptance criteria** — нет проверяемых критериев с `evidence:` ссылками.
- **Отсутствует Implementation notes for agents** — нет поведенческих правил для агентов.

## Ось B — DNA-выравнивание

- **DNA-46 (Mission lifecycle)** — RFC объясняет, как усиливает lifecycle. `satisfies: [DNA-46]` корректен. ✓
- **DNA-47 (Materialization)** — RFC объясняет, как materialization зависит от полноты cache clone. `satisfies: [DNA-47]` корректен. ✓
- **RFC-0477 (amended)** — `amendedBy: [RFC-0913]` присутствует в RFC-0477. ✓
- **RFC-0820 (amended)** — `amendedBy: [RFC-0913]` присутствует в RFC-0820. ✓

## Ось C — Ecosystem fit

- **Дублирование констант** — RFC предлагает `CACHE_CLONE_ONLY_PATTERNS` (16 паттернов), но в `sternsystem-validate.ts:67-78` уже есть `FORBIDDEN_PATTERNS` с теми же файлами (`package.json`, `astro.config.mjs`, `tsconfig.json`, `wrangler.jsonc`). В `mission-materialization-commands.ts:90-95` есть `CACHE_CLONE_ONLY_PATHS`. RFC должен либо переиспользовать существующие константы, либо объяснить почему нужна отдельная.
- **AGENTS.md updates** — RFC не указывает, какие `AGENTS.md` файлы нужно обновить. Root `AGENTS.md` описывает mission lifecycle discipline — добавление `--skip-reconcile-check` требует обновления этого раздела.
- **Compass XML sync** — RFC не указывает, нужно ли синхронизировать `docs/*.xml` файлы.
- **Регистрация флага** — `--skip-reconcile-check` — новый флаг для `mission.close`. RFC не указывает, нужно ли зарегистрировать его в command table (например, в `tools/kernel.config.ts` или command-tables).

## Ось D — Forward-only compliance

- **Совместимости нет** — RFC не предлагает backward compatibility layers. ✓
- **`--skip-reconcile-check`** — escape hatch, не compatibility layer. Forward-only. ✓
- **Прямое изменение amended RFCs** — RFC amendит RFC-0477 и RFC-0820 напрямую. ✓

## Ось E — Agent-facing policy

- **Self-authorizing language** — не найдено. RFC в `draft` и не даёт разрешения на реализацию. ✓
- **NEEDS CLARIFICATION markers** — не найдены. ✓
- **Implementation notes for agents** — раздел полностью отсутствует (см. Ось A). Агенты не получат поведенческих правил: когда использовать `--skip-reconcile-check`, как интерпретировать warning, что делать если reconciliation report missing.
- **Storage policy** — RFC не затрагивает client-side persistence. ✓

## Ось F — Pragmatism

- **`untrackForbiddenGeneratedFiles`** — запускает `git rm --cached` для каждого из 16 паттернов отдельно. Можно объединить в один вызов `git rm --cached --quiet pattern1 pattern2 ...`.
- **Размещение функций** — RFC предлагает добавить функции в `mission-materialization-commands.ts` (уже 1665 строк). Рассмотреть выделение в отдельный модуль (например, `cache-clone-gitignore.ts`).
- **`restoreCacheCloneGitignore`** — функция проверяет наличие sentinel после merge. Если merge перезаписал `.gitignore` (sentinel исчез), функция добавляет hardcoded паттерны. Но prose говорит "Before the merge, read the current cache-clone `.gitignore` and extract the cache-clone-only section" — код не делает step 1. Prose и код не согласованы.

## Ось G — Blind spots

- **Критическая ошибка дизайна Guard 1** — guard сравнивает `workpieceHead` (workpiece HEAD) с `report.commitSha` (cache clone HEAD после merge). Эти SHA **никогда не будут равны**, потому что:
  1. Cache clone имеет merge commit (`git merge --no-ff`), которого нет в workpiece
  2. Cache clone может иметь дополнительные коммиты (bordbuch, config files)
  
  RFC должен записывать workpiece HEAD на момент reconcile в reconciliation report (например, `workpieceHeadAtReconcile`), и сравнивать текущий workpiece HEAD с этим полем. Существующее поле `workpieceCommitSha` в `MissionReconcileData` — это SHA auto-commit, не workpiece HEAD.

- **Fallback при отсутствии report** — RFC говорит "if the report is missing or unreadable, the guard falls back to comparing `manifest.reconciledAt` timestamp against the workpiece's last commit timestamp". Но код просто ловит ошибку и оставляет `reconciledSha = null` — guard молча пропускается. Fallback не реализован.

- **Идемпотентность reconcile** — если reconcile запущен дважды, report перезаписывается. `commitSha` из второго запуска — это cache clone HEAD после второго merge. Guard сравнит workpiece HEAD с этим SHA — они снова не совпадут (см. критическую ошибку выше).

- **Производительность** — `untrackForbiddenGeneratedFiles` делает 16 отдельных `execSync` вызовов. На медленных дисках это может занять секунды.

- **Edge case: пустой workpiece** — если workpiece не имеет `.git` (non-git Sternsystem), `gitExec(workpieceDir, "rev-parse HEAD")` выбросит ошибку. RFC не обрабатывает этот случай.

## Вопросы автору

1. Как именно будет работать сравнение SHA в Guard 1, если `report.commitSha` — это cache clone HEAD (после merge с `--no-ff`), а не workpiece HEAD? Нужно ли добавить поле `workpieceHeadAtReconcile` в reconciliation report?
2. Почему `CACHE_CLONE_ONLY_PATTERNS` дублирует `FORBIDDEN_PATTERNS` из `sternsystem-validate.ts` вместо переиспользования?
3. Какой fallback реализован, если `reconciliation-report.json` отсутствует? Код молча пропускает guard, но prose описывает timestamp comparison — какой вариант правильный?
