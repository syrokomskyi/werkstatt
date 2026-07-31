---
rfcId: RFC-0604
auditId: AUDIT-RFC-0604-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0604

## Вердикт: Needs revision

RFC содержит фактические ошибки о поведении `bordbuch.generate` (команда не создаёт git-коммиты — RFC путает её с `bordbuch.append`), внутреннее противоречие между `nonGoals` и acceptance criteria для `passport.key.rotate` (nonGoals запрещают изменение команды, но критерий требует рефакторинга для идемпотентности), и некорректную привязку к DNA-18. Дополнительно RFC не учитывает, что `bordbuch.generate` пишет в cache clone Sternsystem (`systems/{system}/public/`), а не в `public/` сборочного workspace, и что `passport.key.rotate` печатает приватный ключ в stdout — недопустимо в CI-контексте.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate` не нашёл нарушений.

## Ось A — Структурная полнота

- **«Side effect safety» основана на ложной предпосылке.** Строки 147: «If the command's current implementation creates git commits as a side effect, it must be refactored to separate the projection generation from the entry creation.» Команда `bordbuch.generate` (`packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts:177-227`) НЕ создаёт git-коммиты и НЕ добавляет bordbuch-записи. Её MODULE_CONTRACT прямо говорит: «Does not append events — use bordbuch.append for that.» RFC путает `bordbuch.generate` (проекция — только чтение + запись файлов) с `bordbuch.append` или mission lifecycle commands (`mission.open`/`mission.close`), которые коммитят bordbuch per RFC-0477. Раздел «Side effect safety» нужно переписать: `bordbuch.generate` уже безопасна для `build.prepare` и не требует рефакторинга.

- **Acceptance criterion 196 вводит в заблуждение.** «`bordbuch.generate` is idempotent in the `build.prepare` context (no new git commits on re-run)» — критерий тривиально выполняется, потому что команда никогда не создавала коммиты. Критерий следует переформулировать или удалить, заменив на проверку идемпотентности записи файлов (через `writeFileIfChanged`, которая уже используется).

- **Acceptance criterion 197 противоречит nonGoals.** Строка 197: «`passport.key.rotate` is idempotent (no key rotation if key file already exists)». Текущая реализация (`packages/passport/src/key-rotate.ts:73-133`) ВСЕГДА генерирует новый keypair через `generateKeypair()` и ВСЕГДА добавляет новый активный ключ, помечая старые как неактивные. Нет проверки на существование файла ключа. Но nonGoals (строка 60) прямо говорят: «Do not change the bordbuch.generate or passport.key.rotate commands themselves — only their pipeline membership.» Если команду нельзя менять (nonGoals), но она должна стать идемпотентной (критерий) — это прямое противоречение. RFC должен либо: (a) убрать nonGoal про `passport.key.rotate` и явно описать рефакторинг, либо (b) ввести новый идемпотентный режим (флаг) для `passport.key.rotate` в pipeline-контексте, либо (c) создать отдельную команду `passport.key.ensure` для pipeline.

- **Раздел «Risks» (строки 182-183) повторяет ту же ошибку.** «If `bordbuch.generate` creates git commits during `build.prepare`, it could create unexpected commits during CI builds.» — это не произойдёт, потому что команда не создаёт коммиты.

## Ось B — Привязка к DNA

- **DNA-18 указана неверно.** `satisfies: [DNA-18]` — DNA-18 («Uni registry is the single UI index») относится к `uni.registry.yaml` как единому машинно-читаемому индексу UI-поверхности. Добавление bordbuch и passport команд в `build.prepare` не имеет отношения к uni registry. Объяснение в RFC (строка 112): «Extends the pipeline completeness principle — all git-tracked generated files must be produced by `build.prepare`» — это не DNA-18. В `docs/architecture-dna.md` нет инварианта про «все git-tracked generated files должны производиться build.prepare». RFC следует либо найти релевантный DNA-инвариант (возможно DNA-35 — `app.contract.full` как канонический readiness signal), либо убрать `satisfies` и не претендовать на DNA-привязку.

## Ось C — Экосистемная совместимость

- **`bordbuch.generate` пишет в Sternsystem cache clone, не в сборочный workspace.** Команда использует `resolveCachePath(workspaceRoot, systemId)` для определения пути записи (`bordbuch-generate.ts:200`). Это разрешается в `systems/<id>/` cache clone (mirrors[0]), а не в `public/` сборочного workspace (mission workpiece). `GENERATOR_OWNERSHIP_MAP` подтверждает: путь указан как `systems/{system}/public/.well-known/bordbuch.json` (строка 386), а не `public/.well-known/bordbuch.json` как у других генераторов. Но acceptance criteria (строки 192-193) говорят «After running `build.prepare`, `public/.well-known/bordbuch.json` exists» — не уточняя, какой `public/`. Если `generated.files.validate` проверяет файлы в сборочном workspace, а `bordbuch.generate` пишет в cache clone, файлы не появятся там, где их ждёт валидатор. RFC должен объяснить, как файлы попадут из cache clone в сборочный workspace, или скорректировать критерии.

- **`bordbuch.generate` требует `--system` флаг.** Строка 184 в `bordbuch-generate.ts`: `if (!systemId) throw new Error("[bordbuch.generate] --system is required")`. Pipeline-шаги в `SITES_BUILD_PREPARE_PIPELINE` задаются как `{ command: "..." }` без флагов. `systemId` fallback на `context.site?.name` может не сработать в зависимости от того, как `build.prepare` вызывается. RFC не объясняет, как `--system` будет предоставлен в pipeline-контексте.

- **`bordbuch.generate` приобретает Werkstatt locks.** Команда вызывает `acquireLock` для `system:${systemId}` и `bordbuch:${systemId}` (строки 187-194). В pipeline-контексте это может вызвать конфликт с другими операциями или deadlock, если блокировки уже удерживаются. RFC не анализирует это.

## Ось D — Forward-only совместимость

No issues. RFC не предлагает backward compatibility layers или dual-paths.

## Ось E — Agent-facing policy

- **`passport.key.rotate` печатает приватный ключ в stdout.** Строки 204-218 в `passport.ts`: команда выводит приватный ключ в stdout для ручного копирования в GitHub Actions secret. В `build.prepare` pipeline (особенно в CI), приватный ключ попадёт в CI-логи — это нарушение security contract, описанного в `key-rotate.ts:20-25`: «Private key is NEVER written to disk. It is printed to stdout ONCE for the engineer to paste into GitHub Actions secret.» RFC не учитывает этот security risk. Если `passport.key.rotate` добавляется в pipeline, команда должна быть рефакторена для pipeline-режима: не печатать приватный ключ, а либо использовать существующий из env, либо генерировать и записывать в CI secret programmatically.

- **`passport.key.rotate` требует ручных post-steps.** После ротации оператор должен вручную обновить `system.yaml: release.passport.keyVersion` и добавить ключ в GitHub Actions secrets (строки 213-217). В pipeline-контексте эти шаги не выполняются. RFC не описывает, что произойдёт, если ключ ротирован, но `system.yaml` не обновлён — `passport.emit` будет использовать старый `keyVersion`.

## Ось F — Прагматизм

- **`passport.key.rotate` в pipeline — это не «rotate», а «ensure».** Если цель — гарантировать существование файла ключа после `build.prepare`, то нужен не `rotate` (который по определению меняет ключ), а `ensure` (создать, если не существует). RFC сам описывает желаемое поведение в строке 148: «If the key does not exist, it generates a new one. If it exists, it is a no-op.» — это семантика `ensure`, а не `rotate`. Добавление `rotate` в pipeline и попытка сделать его идемпотентным — это semantic mismatch. Следует рассмотреть создание `passport.key.ensure` (новая команда) или добавление `--ensure` флага к `passport.key.rotate`.

- **`packagesImpacted` неполон.** Указан только `@warpgogol/site-kernel-checks`. Но если acceptance criteria требуют рефакторинга `passport.key.rotate` (критерий 197), то `@warpgogol/passport` тоже impacted. `bordbuch.generate` живёт в `@warpgogol/site-kernel-handoff` — если потребуется адаптация для pipeline-контекста (передача `--system`, отмена lock acquisition), то и этот пакет impacted.

## Ось G — Слепые зоны

- **Security: приватный ключ в CI-логах.** См. Ось E — `passport.key.rotate` печатает приватный ключ в stdout. В CI pipeline это критическая утечка секрета. RFC не упоминает этот риск.

- **Concurrent execution: два `build.prepare` для одного Sternsystem.** `bordbuch.generate` приобретает locks, но `passport.key.rotate` — нет. Если два pipeline запускаются одновременно, `passport.key.rotate` может сгенерировать два разных ключа, и последний перезапишет файл. RFC не рассматривает concurrent execution.

- **Empty state: новый Sternsystem без bordbuch entries.** `bordbuch.generate` вызывает `readBordbuch` — если bordbuch пуст (новый Sternsystem), `entries` будет пустым массивом. Команда обработает это (projection будет с `eventCount: 0`), но RFC (строка 162) говорит «If `bordbuch.generate` fails (e.g., no bordbuch entries in git history), the pipeline fails. The command should handle this gracefully by generating an empty projection.» — текущая реализация уже обрабатывает это gracefully, так что это не failure mode. RFC следует проверить фактическое поведение перед описанием failure modes.

- **`generated.files.validate` path resolution.** RFC (строка 195) утверждает, что `generated.files.validate` пройдёт после `build.prepare`. Но если `bordbuch.generate` пишет в `systems/{system}/public/`, а валидатор проверяет сборочный workspace `public/`, валидатор всё равно сообщит о missing files. RFC должен объяснить path resolution или подтвердить, что валидатор проверяет оба местоположения.

## Вопросы автору

1. Если `bordbuch.generate` уже не создаёт git-коммиты (подтверждается кодом), зачем RFC описывает рефакторинг для «separation of projection generation from entry creation»? Нужно ли переписать раздел «Side effect safety» чтобы отразить фактическое поведение команды?

2. Как RFC разрешает противоречие между nonGoals («do not change passport.key.rotate») и acceptance criterion 197 («passport.key.rotate is idempotent»)? Текущая реализация ВСЕГДА генерирует новый ключ — требуется ли: (a) убрать nonGoal и рефакторить команду, (b) добавить `--ensure` флаг, или (c) создать новую команду `passport.key.ensure`?

3. Как `bordbuch.generate` получит `--system` в pipeline-контексте, где шаги задаются как `{ command: "..." }` без флагов? И как файлы из `systems/{system}/public/` попадут в сборочный workspace, чтобы `generated.files.validate` их обнаружил?

4. Что произойдёт с приватным ключом, когда `passport.key.rotate` запустится в CI pipeline и напечатает его в stdout? Должен ли pipeline-режим подавлять вывод приватного ключа, и если да — как оператор получит ключ для GitHub Actions secret?
