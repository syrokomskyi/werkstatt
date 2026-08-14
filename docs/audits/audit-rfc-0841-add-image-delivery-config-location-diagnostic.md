---
rfcId: RFC-0841
auditId: AUDIT-RFC-0841-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0841

## Verdict: Needs revision

RFC корректно решает узкую проблему silent failure при неверном расположении config-файла, но имеет несколько пробелов в документации и не адресует взаимодействие с RFC-0840, который persists тот же файл в workpiece root.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0841` вернул 0 violations.

## Axis A — Structural completeness

- **Переиспользование rule ID не задокументировано.** `IMG-DELIVERY-CONFIG-01` уже используется в существующем коде (`image-delivery.ts:106,121,144,160`) для malformed config warnings (missing `overrides`, not an array, invalid entry, YAML parse failure). RFC представляет правило как новое, но фактически расширяет существующее правило новым условием. RFC следует явно отметить это переиспользование и уточнить, что location diagnostic — это дополнительное условие того же rule ID, а не новое правило.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-72]` соответствует записи в `docs/architecture-dna.md:295-297`, которая прямо ссылается на RFC-0841. `related: [DNA-62, RFC-0830, RFC-0840]` — все релевантны. RFC корректно расширяет DNA-62 (Foundation File Integrity) паттерном диагностики config location.

## Axis C — Ecosystem fit

- **AGENTS.md не упоминается.** `packages/werkstatt-site/AGENTS.md` документирует `image.delivery.validate` с правилами IMG-DELIVERY-01, IMG-DELIVERY-02, IMG-DELIVERY-04, но не упоминает IMG-DELIVERY-CONFIG-01 (ни для существующих malformed config warnings, ни для нового location diagnostic). RFC должен указать, что AGENTS.md нужно обновить.

- **`docs/verification-plan.xml` не упоминается.** Добавление нового diagnostic правила должно быть отражено в verification plan, если там документированы правила `image.delivery.validate`.

## Axis D — Forward-only compliance

No issues. RFC добавляет diagnostic в существующую команду — нет compatibility shim, нет dual-path, нет legacy code path.

## Axis E — Agent-facing policy

No issues. Status gate корректный (`accepted` → implementation notes ссылаются на RFC-0224). Self-authorizing language отсутствует. Storage policy не затронут. NEEDS CLARIFICATION markers отсутствуют.

## Axis F — Pragmatism

No issues. Минимальное изменение — два `existsSync` вызова и модификация summary string. Переиспользование существующего rule ID (IMG-DELIVERY-CONFIG-01) вместо создания нового — правильное прагматическое решение. `packagesImpacted` и `appsImpacted` корректны.

## Axis G — Blind spots

- **Взаимодействие с RFC-0840 не адресовано.** RFC-0840 (принят в том же дня) persistит `image-delivery.config.yaml` из workpiece root в cache clone при `mission.close` и восстанавливает в workpiece root при `mission.materialize`. Если оператор разместил файл в root (неправильная location), RFC-0841 будет выдавать warning при каждом запуске после re-materialization, а RFC-0840 будет бесконечно восстанавливать файл в неправильную location. RFC-0841 listed RFC-0840 в `related[]`, но не обсуждает это взаимодействие в теле RFC. Следует добавить note о том, что оператор должен переместить файл в `src/` после первого warning, чтобы разорвать цикл.

- **Summary example использует relative path.** RFC показывает `config: src/image-delivery.config.yaml` в примере summary, но реализация использует `join(paths.srcDirectory, ...)` который возвращает absolute path. Minor discrepancy — тесты не проверяют summary string, но документация должна соответствовать фактическому поведению.

## Questions for the author

1. Должен ли RFC-0840 `restoreOperatorConfigFiles` восстанавливать `image-delivery.config.yaml` в `src/` вместо workpiece root, чтобы избежать постоянного срабатывания IMG-DELIVERY-CONFIG-01 после re-materialization?
2. Нужно ли обновить `packages/werkstatt-site/AGENTS.md` для документирования IMG-DELIVERY-CONFIG-01 (как для существующих malformed config warnings, так и для нового location diagnostic)?
3. Должен ли RFC упомянуть, что `IMG-DELIVERY-CONFIG-01` уже используется для malformed config warnings, и что location diagnostic — это дополнительное условие того же правила?
