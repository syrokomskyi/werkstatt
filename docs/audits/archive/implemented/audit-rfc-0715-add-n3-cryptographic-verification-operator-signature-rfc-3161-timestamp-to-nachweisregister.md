---
rfcId: RFC-0715
auditId: AUDIT-RFC-0715-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0715

## Verdict: Needs revision

RFC содержит несколько серьёзных несоответствий: предлагает расширить PBP-схему криптографическими полями вопреки ADR-0028, использует несовместимые имена флагов (`--mission`/`--record` вместо `--system`/`--slug`), не указывает удаление `--pilot-n2-exception` флага и неточно перечисляет затронутые пакеты.

## Mechanical validation (rfc.validate)

Pass — 0 errors, 1 warning (V-19: `amends`/`amendedBy` mismatch — ожидаемо для draft, будет исправлено при accept).

## Axis A — Structural completeness

1. **Acceptance criterion противоречит ADR-0028 и собственному дизайну RFC.** Критерий на строке 429 предлагает расширить `packages/pbp/src/schemas/evidence-source.ts` полями `n3Signature`, `n3Timestamp`, `n3KeyId`. Однако ADR-0028 (строка 48) явно указывает: «Cryptographic verification data (SHA-256 chain, operator signature, RFC 3161 timestamp) lives in Bordbuch entry metadata, not in PBP content files». Сам RFC (строки 136, 263–265) также хранит N3-артефакты в Bordbuch. Расширение PBP-схемы дублирует данные и нарушает архитектурное решение.

## Axis B — DNA alignment

- **DNA-53** (Semantic fingerprint governance): `nachweis.sign` использует `@warpgogol/fingerprint` `stableJsonHash` — корректно.
- **DNA-59** (Evidence preservation): N3-артефакты сохраняются как append-only Bordbuch entries — корректно.
- **DNA-34** (VC signing): RFC явно не переиспользует passport key — корректно.
- No issues.

## Axis C — Ecosystem fit

1. **Несовместимые имена флагов.** Новые команды используют `--mission` и `--record` (строки 154–156, 186–192), тогда как существующие nachweis-команды используют `--system` и `--slug` (см. `nachweis.module.ts:45,52,176,177`). CLI-пример для `nachweis.approve` (строки 171–175) показывает `--mission` и `--record`, но существующая команда зарегистрирована с `--system` и `--slug`. Это либо breaking change (не упомянут), либо ошибка в RFC.

2. **`--legal-content-check` vs `--legal-content-checked`.** Существующая команда использует `--legal-content-check passed|failed` (string, `nachweis.module.ts:183–186`). RFC CLI-пример (строка 175) показывает `--legal-content-checked` — другое имя флага.

3. **`@warpgogol/ontology` отсутствует в `packagesImpacted`.** RFC добавляет два новых `BordbuchEntryKind` (`nachweis-signed`, `nachweis-timestamped`, строки 263–264, 445), что требует изменения `packages/ontology/src/operations/mission.ts`. Пакет не перечислен в `packagesImpacted` (строки 60–63).

4. **`@warpgogol/ui` ошибочно listed в `packagesImpacted`.** RFC явно указывает в nonGoals (строка 78): «Does not modify the nachweis-card UI component». Пакет не затронут.

5. **`commands.changed` неполон.** RFC расширяет `nachweis.validate` для проверки N3-артефактов (строка 383), но команда не listed в `commands.changed` (строки 55–57). Если `--pilot-n2-exception` удаляется из `nachweis.publish`, эта команда также должна быть в `changed`.

6. **Compass sync не упомянут.** Добавление новых kernel-команд и новых Bordbuch entry kinds может потребовать обновления `docs/verification-plan.xml` и `docs/command-manifest.generated.yaml` (через `command.manifest.generate`). RFC не упоминает Compass sync.

## Axis D — Forward-only compliance

1. **Удаление `--pilot-n2-exception` не адресовано.** RFC-0707 (строка 390) явно обязывает: «The `--pilot-n2-exception` flag on `nachweis.publish` is temporary and MUST be removed when N3 timestamp support is implemented in a future RFC.» RFC-0715 реализует N3 timestamp, но не упоминает удаление флага. Это нарушение forward-only обязательства из RFC-0707.

## Axis E — Agent-facing policy

- Status gate корректен: RFC в `draft`, implementation notes ссылаются на RFC-0224 и RFC-0334.
- No NEEDS CLARIFICATION markers.
- Storage policy: ключ вне репозитория, `.gitignore` для `*.key`.
- No issues.

## Axis F — Pragmatism

1. **PBP-схема расширение избыточно.** N3-артефакты уже хранятся в Bordbuch (append-only, hash-chained). Дублирование `n3Signature`, `n3Timestamp`, `n3KeyId` в PBP `EvidenceSource` нарушает single-source-of-truth и противоречит ADR-0028. Критерий (строка 429) следует удалить.

2. **Четыре команды обоснованы.** Alternatives section (строки 389–405) честно рассматривает и отвергает объединение. `nachweis.key.ensure` — provisioning, `nachweis.sign` — подпись, `nachweis.timestamp` — timestamp, `nachweis.verify-signature` — read-only проверка. Каждая имеет distinct failure mode.

## Axis G — Blind spots

1. **`--pilot-n2-exception` cleanup не адресован** (см. Axis D).

2. **TSA certificate verification не детализирована.** RFC упоминает `--tsa-cert-file` (строка 189) и error `TSA_CERT_VERIFICATION_FAILED` (строка 366), но не указывает, какая библиотека выполняет verification и как строится chain. Для pilot (FreeTSA.org) это acceptable, но следует отметить как deferred detail.

3. **Key backup strategy не описана.** Risks (строка 409) упоминают key loss, но не предлагают backup strategy. Для pilot acceptable, но стоит отметить.

4. **`nachweis.validate` N3-check поведение не специфицировано детально.** Строка 383 говорит «optionally check N3 artifacts when the record's `verificationLevel` is `N3`», но не описывает что именно проверяется (наличие signature Bordbuch entry? наличие timestamp entry? соответствие hash?).

## Questions for the author

1. Зачем RFC расширяет `evidence-source.ts` полями `n3Signature`, `n3Timestamp`, `n3KeyId`, если ADR-0028 явно указывает хранить криптографические данные в Bordbuch, а не в PBP? Критерий (строка 429) противоречит как ADR-0028, так и собственному дизайну RFC.

2. Почему новые команды используют `--mission` и `--record` вместо `--system` и `--slug` (консистентность с существующими nachweis-командами)? Если это намеренное изменение, оно должно быть документировано как breaking change. Если нет — флаги следует унифицировать.

3. Что происходит с `--pilot-n2-exception` флагом на `nachweis.publish`? RFC-0707 обязывает его удаление при реализации N3. Должен ли RFC-0715 удалить его и добавить `nachweis.publish` в `commands.changed`?
