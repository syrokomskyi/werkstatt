---
rfcId: RFC-0738
auditId: AUDIT-RFC-0738-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0738

## Вердикт: Needs revision

RFC определяет иммутабельную сущность `RateSnapshot` с digest, что архитектурно корректно. Однако Zod-схема не следует существующим паттернам пакета `@warpgogol/pbp` (не наследует `pbpEntitySchema`, нет `.strict()`, `status` — `nonEmptyString` вместо enum), функция digest использует `node:crypto.createHash` вместо `@warpgogol/fingerprint` (нарушение DNA-53), а `PbpRateSnapshotSourceKind` дублирует `PbpRateMode` из RFC-0737.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0738 --json` вернул `status: pass`, 0 нарушений.

## Ось A — Структурная полнота

1. **Schema ID захардкожен.** `RATE_SNAPSHOT_SCHEMA_ID = "pbp/rate-snapshot@1"` (строка 107, 282) — строковый литерал вместо `pbpSchemaId("rate-snapshot")`. Существующий паттерн: `packages/pbp/src/schema-id.ts` экспортирует `pbpSchemaId(entity)`, все сущности используют её (например `CLAIM_SCHEMA_ID = pbpSchemaId("claim")` в `@/packages/pbp/src/entities/claim.ts:14`).

2. **Zod-схема не наследует `pbpEntitySchema`.** Схема (строки 127–144) построена через `z.object({...})` напрямую, дублируя поля `schema`, `id`, `type`, `status`. Существующий паттерн: `claimSchema = pbpEntitySchema.extend({...}).strict()` (`@/packages/pbp/src/schemas/claim.ts:35`). Из-за этого:
   - `id` не проходит валидацию `entityIdSchema` (ADR-025: запрет locale-маркеров).
   - `schema` не проходит валидацию `schemaIdSchema` (паттерн `pbp/{entity}@{major}`).
   - `status` — `nonEmptyString` вместо `pbpEntityStatusSchema` (закрытый enum `draft|published|suspended|retired|superseded`).

3. **Нет `.strict()`.** Существующие сущности используют `.strict()` для запрета неизвестных полей. RFC-схема этого не делает.

4. **Нет регистрации в `pbpSchemaById` и `pbpEntityDiscriminatedUnion`.** `@/packages/pbp/src/schemas/index.ts:98-154` — каждая сущность регистрируется в реестре и дискриминированном объединении. RFC не упоминает этот шаг.

5. **Нет Astro-коллекции.** `packages/pbp/src/astro.ts` (`pbpCollections`) определяет коллекции для каждой сущности. RFC не упоминает добавление `rate-snapshot` коллекции.

6. **Нет обновления `packages/pbp/AGENTS.md`.** Файл перечисляет все экспорты сущностей. RFC не упоминает его обновление.

7. **Нет Compass-блоков.** Новые файлы в `packages/` требуют `MODULE_CONTRACT` и `CHANGE_SUMMARY` блоки (DNA-42). RFC не упоминает это требование.

8. **`canonicalSerialize` и `createHash` не существуют.** Функция `computeSnapshotDigest` (строка 165–168) ссылается на `canonicalSerialize` и `createHash("sha256")` — ни то, ни другое не существует в кодовой базе. RFC должен указать источник этих функций.

## Ось B — Выравнивание DNA

1. **DNA-1 (Monorepo boundary).** Сущность в `packages/pbp/`. Pass.

2. **DNA-55 (Spec vendoring).** Обоснование тонкое: «New entity extends `pbp/*@1` as a platform extension». Корректная, но слабая связь — RFC не объясняет, как именно он поддерживает контракт vendorинга (например, не копирует модель спецификации в RFC).

3. **DNA-53 (Semantic fingerprint governance) — нарушение.** RFC использует `createHash("sha256")` из `node:crypto` напрямую (строка 167). DNA-53: «All project hashes use the `@warpgogol/fingerprint` package; no ad hoc hashing helpers outside it». RFC должен использовать `stableJsonHash` или `byteHash` из `@warpgogol/fingerprint` вместо `node:crypto.createHash`. DNA-53 не указан в `satisfies[]`, но нарушение явно.

4. **DNA-42 (Compass markup contract) — не упомянуто.** Новые файлы требуют Compass-блоки. Не в `satisfies[]`, но применимо.

## Ось C — Экосистемная совместимость

1. **`PbpRateSnapshotSourceKind` дублирует `PbpRateMode`.** RFC-0737 определяет `PbpRateMode = "external" | "business-fixed"` (строка 79). RFC-0738 определяет `PbpRateSnapshotSourceKind = "external" | "business-fixed"` (строка 73) — идентичный тип. Следует переиспользовать `PbpRateMode` из RFC-0737 вместо создания нового типа.

2. **Schema ID — строковый литерал.** См. Ось A, пункт 1. Паттерн кодовой базы — `pbpSchemaId("rate-snapshot")`.

3. **AGENTS.md не упомянут.** `packages/pbp/AGENTS.md` требует обновления списка экспортов.

4. **Реестр схем не упомянут.** `pbpSchemaById` и `pbpEntityDiscriminatedUnion` требуют обновления.

## Ось D — Forward-only compliance

No issues. Нет shim-слоёв, нет dual-path, иммутабельность — core-принцип.

## Ось E — Agent-facing policy

1. **Status gate.** «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).» Корректно.

2. **NEEDS CLARIFICATION markers.** Не найдены.

3. **Storage policy.** Snapshots — контент-файлы, нет cookies, нет client-side persistence. Pass.

## Ось F — Прагматизм

1. **`PbpRateSnapshotSourceKind` — избыточный тип.** Дублирует `PbpRateMode` из RFC-0737. Создание нового type alias увеличивает поверхность API без семантической разницы.

2. **`computeSnapshotDigest` — несуществующие зависимости.** `canonicalSerialize` и `createHash` не существуют. RFC должен либо определить каноникализацию inline, либо сослаться на `@warpgogol/fingerprint` (`stableStringify` + `byteHash`).

3. **`appsImpacted: [warpgogol-com]` — преждевременно.** Rollout (строка 306): «No site impact yet.» Если нет site impact, `appsImpacted` должен быть пустым или RFC должен уточнить, что impact — будущий (через RFC-0744).

## Ось G — Слепые зоны

1. **URN vs HTTPS URI.** ID-конвенция `urn:pbp:rate-snapshot:{date}:{pair}:{value}` (строка 180) использует URN-схему. Существующие PBP-сущности используют HTTPS URI (например `https://warpgogol.com/id/rate-policy/eur-uah` в RFC-0737, строка 249). `validatePbpUri` требует HTTPS по умолчанию. URN-IDs несовместимы с PBP URI-политикой.

2. **Content-addressed ID — коллизия.** Паттерн `urn:pbp:rate-snapshot:{date}:{pair}:{value}` не включает source. Два разных источника, наблюдающие разные курсы для одной пары в одну дату, дают разные snapshots с разными значениями — но если значения совпадают, ID коллизируют. Source должен быть частью ID.

3. **Digest verification — не определена.** RFC говорит «Digest mismatch blocks publication» (строка 301), но не определяет, кто вычисляет digest, кто верифицирует, и что происходит при несовпадении.

4. **Каноникализация optional-полей.** `PbpEntityRef` имеет `expectedType?`. Если в одном snapshot поле присутствует, а в другом — нет, digests будут различаться даже при одинаковой observation. Правила каноникализации должны явно обрабатывать optional-поля.

5. **Нет спецификации тестов.** Acceptance criteria упоминают `vitest run`, но RFC не описывает, какие тесты нужны (unit-тесты для schema, digest computation, ID-генерации).

## Вопросы автору

1. Почему `PbpRateSnapshotSourceKind` — новый тип, а не переиспользование `PbpRateMode` из RFC-0737? Если есть семантическая разница, она должна быть задокументирована.

2. Почему `RATE_SNAPSHOT_SCHEMA_ID` — строковый литерал, а не `pbpSchemaId("rate-snapshot")`? Как будет обеспечена консистентность с паттерном `pbp/{entity}@{major}`?

3. Почему ID использует URN-схему (`urn:pbp:rate-snapshot:...`) вместо HTTPS URI, как все остальные PBP-сущности? Как `validatePbpUri` будет валидировать эти ID?

4. Почему digest вычисляется через `node:crypto.createHash` вместо `@warpgogol/fingerprint` (`stableJsonHash` / `byteHash`)? DNA-53 явно запрещает ad hoc hashing вне fingerprint-пакета.

5. Как Zod-схема будет наследовать `pbpEntitySchema` (для `entityIdSchema` с ADR-025, `pbpEntityStatusSchema`, `schemaIdSchema`) вместо дублирования полей?
