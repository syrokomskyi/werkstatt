---
rfcId: RFC-0605
auditId: AUDIT-RFC-0605-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0605

## Verdict: Needs revision

RFC корректно определяет проблему (небезопасность `passport.key.rotate` в pipeline) и предлагает разумное решение. Однако есть несколько находок: `generateKeypair` не экспортируется из `@warpgogol/passport`, не указаны AGENTS.md/Compass синхронизации, и есть серьёзный слепой участок — потеря приватного ключа при генерации без `--private-key-out` в pipeline.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0605 --json` вернул 0 violations.

## Axis A — Structural completeness

- **A1: `EnsureKeyResult.version` при `created: false` не специфицирован.** В output format показано `"version": "v1"` для no-op случая, но не указано, откуда берётся это значение. Когда ключ уже существует, команда должна прочитать существующий файл и вернуть версию активного ключа. RFC следует явно указать: "When `created` is `false`, `version` is the active key's version from the existing file."

## Axis B — DNA alignment

- **B1: DNA-34 реклассифицирован в feature (RFC-0161).** В Architectural fit сказано "DNA-34 (Passport key rotation)", но `docs/architecture-dna.md:153` указывает: "Reclassified to feature (RFC-0161) — governed as a product feature by RFC-0028, not enforced as binding DNA." RFC должен ссылаться на RFC-0028 как на управляющий документ, а не на DNA-34 как на активную инварианту. `satisfies: []` корректно пуст — замечание только о формулировке в теле RFC.

## Axis C — Ecosystem fit

- **C1: Не указаны AGENTS.md обновления.** Добавление новой команды в `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts` может потребовать обновления `packages/os/site-kernel-checks/AGENTS.md` или `packages/passport/AGENTS.md` (если `generateKeypair` будет экспортирован — см. находку F1). RFC должен перечислить затрагиваемые AGENTS.md файлы.
- **C2: Не указана Compass-синхронизация.** Новая команда должна быть отражена в `docs/COMMANDS.md` (если этот файл ведёт список команд). RFC должен указать, какие `docs/*.xml` файлы требуют обновления.

## Axis D — Forward-only compliance

No issues. `passport.key.rotate` остаётся как есть — не депрекируется, просто не используется в pipeline. Это соответствует forward-only дисциплине.

## Axis E — Agent-facing policy

No issues. Implementation notes ссылаются на корректные governance rules (RFC-0224, RFC-0330, RFC-0334). Self-authorizing language отсутствует.

## Axis F — Pragmatism

- **F1: `generateKeypair` не экспортируется из `@warpgogol/passport`.** RFC утверждает: "It reuses `generateKeypair` and `PassportPublicKeyFileSchema` from `@warpgogol/passport`". Однако `packages/passport/src/index.ts` не содержит экспорта `generateKeypair` (он определён в `sign.ts:88`, но не включён в barrel). Для реализации потребуется либо добавить экспорт, либо использовать `rotateKey` с `initial: true` (что нежелательно — rotate всегда генерирует новый ключ и помечает старые как inactive). RFC должен указать, что `generateKeypair` будет экспортирован из `@warpgogol/passport`, либо описать альтернативный подход к генерации ключа.

## Axis G — Blind spots

- **G1: Потеря приватного ключа при pipeline-генерации без `--private-key-out`.** Если `passport.key.ensure` генерирует ключ в pipeline без флага `--private-key-out`, приватный ключ теряется навсегда. Публичный ключ записан в файл, но подписать passport невозможно. Risks section упоминает это, но не предлагает достаточной митигации. Вопрос: должен ли pipeline-вариант команды отказывать (fail) при отсутствии существующего ключа вместо генерации бесполезного ключа? Или RFC должен явно рекомендовать, чтобы начальное создание ключа всегда выполнялось оператором через `passport.key.rotate` до первого запуска pipeline?
- **G2: Права доступа к файлу `--private-key-out`.** RFC не указывает права доступа для файла с приватным ключом. Запись приватного ключа в файл без ограничений прав (например, 0600) — риск безопасности. RFC должен указать, что файл создаётся с правами 0600 (owner-only read/write).
- **G3: Edge case — существующий файл без активного ключа.** `PassportPublicKeyFileSchema` требует `keys: z.array(...).min(1)`, но не требует наличия хотя бы одного ключа с `active: true`. Если все ключи помечены `active: false`, команда должна считать это corrupt (PKE-03) или валидным состоянием? RFC должен уточнить.

## Questions for the author

1. **Потеря приватного ключа в pipeline.** Если `passport.key.ensure` вызывается в `build.prepare` без `--private-key-out` и ключа ещё не существует, команда сгенерирует ключ, но приватный ключ будет потерян. Должен ли `passport.key.ensure` в pipeline-режиме (без `--private-key-out`) отказывать с ошибкой, если ключ не существует, вместо генерации бесполезного ключа? Или RFC должен явно требовать, чтобы оператор сначала создал ключ через `passport.key.rotate`?
2. **Экспорт `generateKeypair`.** RFC утверждает, что переиспользует `generateKeypair` из `@warpgogol/passport`, но функция не экспортируется из package index. Планируется ли добавить экспорт, или реализация будет использовать другой подход (например, прямой вызов `ed.utils.randomSecretKey` + `ed.getPublicKeyAsync` внутри `site-kernel-checks`)?
3. **Файл с активным ключом, но все ключи inactive.** Если существующий `cosmic-passport-key.json` валиден по схеме, но не содержит ни одного ключа с `active: true`, должна ли команда считать это ошибкой (PKE-03) или сгенерировать новый ключ?
