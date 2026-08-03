---
rfcId: RFC-0639
auditId: AUDIT-RFC-0639-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0639

## Verdict: Needs revision

RFC-0639 корректно расширяет `forge/bindings@1` пятью domain-neutral командными ключами и механизмом разрешения терминологии. Однако RFC не учитывает два существующих consumer'а схемы (`applyCliBindingDefaults` и `BINDING_COMMAND_KEYS` в `forge.doctor`), которые потребуют синхронного обновления, и не указывает жёсткую зависимость от RFC-0638 для функции `resolveTerminology`.

## Mechanical validation (rfc.validate)

**Pass** (1 warning).

- V-18 (warning): `related "RFC-0638" does not match any existing RFC`. RFC-0638 существует в `docs/rfcs/rfc-0638-domain-neutral-profile-schema-extensions.md` (status: draft). Предположительно — false positive V-18, не блокирующий.

## Axis A — Structural completeness

No issues. Все обязательные секции присутствуют и содержат реальный контент. Decision — в настоящем времени ("The schema is extended…"). CLI surface — конкретный YAML-пример. TypeScript contracts — минимальные сигнатуры. File system responsibilities — конкретные пути. Failure modes — описывают поведение null-ключей. Rollout — backward compatibility + no flag day. Alternatives — три реальные альтернативы с причинами отказа. Risks — включает agent confusion risk. Acceptance criteria — проверяемые.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-54]` — DNA-54 (`docs/architecture-dna.md:231-233`) описывает forge bindings contract. RFC-0639 расширяет DNA-54: skills могут ссылаться на `ref(bindings.commands.produce)` вместо `ref(bindings.commands.scopedBuild)`. Архитектурная фит-секция (lines 111-114) объясняет как именно расширяется invariant. `related: [DNA-54, RFC-0393, RFC-0638]` — релевантны. Конфликтов с существующими DNA invariant'ами нет.

## Axis C — Ecosystem fit

**Finding C1 — `applyCliBindingDefaults` не упомянут.** Функция `applyCliBindingDefaults` в `packages/forge/src/config/forge-config.ts:210-227` конструирует объект типа `ForgeBindings["commands"]` со всеми ключами. Добавление 5 новых обязательных ключей в `ForgeBindingsCommands` означает, что эта функция ДОЛЖНА быть обновлена — иначе TypeScript не скомпилируется (возвращаемый тип не будет содержать 5 новых полей). RFC не упоминает эту функцию ни в file system responsibilities, ни в design-секции. Нужно добавить `applyCliBindingDefaults` в таблицу file system responsibilities и указать, что 5 новых ключей инициализируются `null`.

**Finding C2 — `forge.doctor` validation не специфицирована.** `BINDING_COMMAND_KEYS` в `packages/forge/src/onboarding/doctor.ts:110-119` перечисляет все командные binding-ключи для валидации в `forge.doctor`. RFC не указывает, должны ли 5 новых semantic keys быть добавлены в этот список. Если добавлены — `forge.doctor` будет репортить их как `absent` для всех существующих проектов (они default to null). Если не добавлены — semantic keys останутся невалидируемыми doctor'ом. RFC должен явно указать поведение doctor'а для новых ключей.

## Axis D — Forward-only compliance

No issues. Расширение чисто аддитивное. Software-specific keys (`typecheck`, `test`, `scopedBuild`) остаются в схеме как optional. Нет dual-path, нет shim, нет deprecation. Существующие forge.yaml файлы парсятся без изменений.

## Axis E — Agent-facing policy

No issues. Status gate: RFC в `draft`, нет self-authorizing language. Implementation notes (lines 253-266) ссылаются на корректные governance rules (RFC-0224, RFC-0334, RFC-0330). Anti-fabrication: acceptance criteria — только code changes, нет content authoring. Storage policy: не затрагивается.

## Axis F — Pragmatism

**Finding F1 — Consumer `resolveTerminology` неясен.** Skills — это markdown-файлы, которые ссылаются на bindings по ключу (`ref(bindings.terminology.artifact)`). Они не вызывают TypeScript-функции напрямую. RFC должен уточнить, какой code path вызывает `resolveTerminology`: `forge.agents.generate` (при генерации AGENTS.md), `forge.doctor` (при выводе), или новый resolver в skill execution runtime. Без этого невозможно понять, где функция интегрируется в ecosystem.

**Finding F2 — `UNIVERSAL_TERMINOLOGY` не обоснован.** Константа содержит 7 default-терминов (`artifact`, `artifactPlural`, `module`, `source`, `output`, `verify`, `operator`). RFC не объясняет, почему выбраны именно эти 7 терминов. Они выведены из существующего skill language? Из profile terminology в RFC-0638? RFC должен сослаться на источник selection или объяснить методологию выбора universal set.

## Axis G — Blind spots

**Finding G1 — Жёсткая зависимость от RFC-0638 не указана в rollout.** `resolveTerminology(config, profile, key)` принимает `StackProfile | undefined` с полем `terminology`. Текущий `StackProfile` interface (`packages/forge/src/profiles/stack-profile.ts:59-74`) не имеет поля `terminology` — оно предлагается RFC-0638. Если RFC-0638 не реализован, `profile?.terminology` всегда `undefined`, и `resolveTerminology` всегда падает на universal default. RFC должен указать в rollout-секции, что RFC-0638 — hard prerequisite для tier-2 resolution chain, или явно заявить, что функция работает корректно без профиля (только tiers 1 и 3).

**Finding G2 — Schema change для `terminology` не специфицирован явно.** RFC говорит "terminology is promoted from optional to a first-class bindings section with a default empty record" (line 103). Текущая схема: `terminology: z.record(z.string(), z.string()).optional()` (`forge-config.ts:49`). Тип в `ForgeBindings`: `terminology?: Record<string, string>` (line 77). "Promoted" означает `.optional()` → `.default({})`? Это меняет тип с `Record<string, string> | undefined` на `Record<string, string>`. RFC должен явно указать schema-изменение: текущий `.optional()` → новый `.default({})`, и отметить, что `ForgeBindings.terminology` становится non-optional в interface.

## Questions for the author

1. Должен ли `forge.doctor` валидировать 5 новых semantic command keys (репортить как `absent` когда null), или они должны быть исключены из doctor validation, поскольку domain-neutral keys не нужны каждому проекту?
2. `applyCliBindingDefaults` должна быть обновлена для включения 5 новых ключей с `null` defaults. Должен ли `forge.create` писать какие-либо default-значения для semantic keys (как он делает для `validateRfc`), или они всегда должны быть `null`?
3. Является ли RFC-0638 жёстким prerequisite для `resolveTerminology`? Если RFC-0638 ещё не реализован, функция всегда падает на universal defaults. Должен ли rollout разделить реализацию на два phase: (1) schema + semantic keys, (2) `resolveTerminology` после RFC-0638?
