---
rfcId: RFC-0666
auditId: AUDIT-RFC-0666-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0666

## Вердикт: Needs revision

RFC правильно идентифицирует мёртвый код (`secretsFile` + `resolveSecretsFilePath`) и предлагает чистое forward-only решение через convention-based пути. Однако есть несколько структурных и референциальных проблем, которые нужно исправить перед реализализацией: незакрытые `amendedBy` ссылки, пустые `reviewers`/`successSignals`, недоспецифицированные изменения `sternsystem.validate` и `release.prepare`, и V-30 warning по `breaksC`.

### Механическая валидация (rfc.validate)

**Pass** с 3 warnings:

- **V-19**: `amends` включает RFC-0379 и RFC-0627, но их `amendedBy` не содержит RFC-0666. Нужно добавить `amendedBy: [RFC-0666]` в оба RFC.
- **V-30**: `@warpgogol/ontology` в `packagesImpacted` без `breaksC: true`. RFC удаляет экспорты `secretRefSchema` и `SecretRef` из `@warpgogol/ontology/operations` — это breaking change для subpath export. Нужно либо объявить `breaksC: true`, либо объяснить почему V-30 неприменим (правило проверяет `external-surfaces/`, а не `operations/`).

### Ось A — Структурная полнота

- **`reviewers: []` пусто** — приведёт к V-25 при переходе в `implemented`. Добавить хотя бы `human:andrii-syrokomskyi`.
- **`successSignals: []` пусто** — ни одного сигнала успеха. Добавить хотя бы один (например: "`wrangler deploy` succeeds with convention-based `.env.alt`/`.env.main` paths, no `WERKSTATT_SECRETS_*` env vars set").
- **Файловые ответственности неполны**: таблица не перечисляет `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` (куда добавляется новая validation rule для `secretsFile`) и `packages/os/site-kernel-handoff/src/release/release-commands.ts` (куда добавляется шаг копирования `.env.alt`/`.env.main`). Оба файла затронуты RFC и должны быть в таблице.
- **`commands.changed` включает `sternsystem.validate`** — но implementation notes не описывают конкретные изменения в `sternsystem-validate.ts`. Нужно добавить правило: "Если `deployment.channels.<channel>` содержит поле `secretsFile`, `sternsystem.validate` выдаёт violation с правилом `secretsFile-removed` и сообщением, ссылающимся на RFC-0666."

### Ось B — DNA alignment

- **`satisfies: [DNA-40]`** корректно — RFC расширяет convention `.env.alt`/`.env.main` с per-app deploy scripts на Leitstand. DNA-40 уже mandates эти файлы; RFC делает Leitstand совместимым.
- **Нет конфликта** с существующими DNA инвариантами. `secretRefSchema` и `secretsFile` не упоминаются в DNA-40 — они были добавлены RFC-0379 как implementation detail, не как DNA invariant. Удаление не нарушает DNA.

### Ось C — Ecosystem fit

- **Package boundaries**: `@warpgogol/ontology` (удаляет schema) → `@warpgogol/site-kernel-handoff` (удаляет `resolveSecretsFilePath`, добавляет `resolveConventionSecretsPath`). Import flow корректен.
- **AGENTS.md обновления**: RFC корректно идентифицирует `packages/os/site-kernel-handoff/AGENTS.md` (строка 37: "Each channel has `workerName`, `url`, and optional `secretsFile`" — нужно убрать `secretsFile`).
- **Command lifecycle**: `commands.changed` содержит 5 существующих зарегистрированных команд — корректно для `changed`. Ни одного `added` или `removed` — корректно.

### Ось D — Forward-only compliance

- **Чистое удаление**: `secretRefSchema`, `SecretRef`, `resolveSecretsFilePath`, `secretsFile` field — всё удаляется, без compatibility shim. Отлично.
- **Hard break без grace period**: `sternsystem.validate` отклоняет реестры с `secretsFile`. RFC явно говорит "there is no grace period because the field was never used". Корректно для forward-only экосистемы.

### Ось E — Agent-facing policy

- **Status gate**: RFC `draft`, нет self-authorizing language. Корректно.
- **Implementation notes** ссылаются на RFC-0224 (accepted→implemented transition) — корректная ссылка.
- **Anti-fabrication**: не применимо — нет content authoring.
- **Storage policy**: нет cookies или persistence изменений.

### Ось F — Pragmatism

- **Минимальная command surface**: ни одной новой команды. `resolveConventionSecretsPath` — простая функция. Корректно.
- **Existing patterns**: RFC расширяет существующую convention `.env.alt`/`.env.main` из DNA-40. Идиоматично.
- **Scope discipline**: `packagesImpacted` корректен — `@warpgogol/ontology` (schema removal) и `@warpgogol/site-kernel-handoff` (handler changes). `@warpgogol/site-kernel-checks` не затронут (deploy.preflight не меняется).

### Ось G — Blind spots

- **Multi-system registry cleanup**: RFC говорит "Remove `secretsFile` lines from all channel configs in `systems/registry.yaml`". Если в реестре несколько систем, все нужно чистить одновременно (т.к. `sternsystem.validate` отклоняет любые `secretsFile`). На практике только одна система (warpgogol-com), но RFC стоит явно отметить что это atomic cleanup.
- **`resolveConventionSecretsPath` channel parameter для `leitstand.rollback`**: RFC таблица говорит `leitstand.rollback` resolves `.env.alt` or `.env.main` (channel-dependent). Функция принимает `channel` параметр, но `leitstand.rollback` auto-detects channel из release state. Нужно явно указать что auto-detected channel передаётся в `resolveConventionSecretsPath`.
- **`release.prepare` source path**: RFC говорит "copy `.env.alt` and `.env.main` from the workpiece to `releases/<releaseId>/`". Стоит явно указать source path: `missions/<missionId>/workpiece/.env.alt` → `releases/<releaseId>/.env.alt`. `release.prepare` уже копирует `dist/` из workpiece — добавление `.env.*` копий естественный шаг.

### Вопросы автору

1. Почему `breaksC` не объявлен? `@warpgogol/ontology/operations` — публичный subpath export, удаление `secretRefSchema`/`SecretRef` из него breaking для потребителей. Нужно ли объявить `breaksC: true` или V-30 неприменим потому что `operations/` не равно `external-surfaces/`?
2. Как именно `sternsystem.validate` будет отклонять `secretsFile`? Текущий `sternsystem-validate.ts` парсит реестр через `fleetRegistrySchema` (Zod), которая включает `secretsFile` как optional. Нужно ли добавить post-parse validation rule, или изменить schema на `.refine()`?
3. Что произойдёт с существующими релизами в `releases/` без `.env.alt`/`.env.main`? `leitstand.propagate`/`promote` будут использовать `process.env` fallback — но стоит ли `release.prepare` для новых релизов делать копирование обязательным (warning если файлы не найдены) или опциональным?
