---
rfcId: RFC-0691
auditId: AUDIT-RFC-0691-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0691

## Verdict: Needs revision

RFC корректно расширяет существующий invariant engine четвёртым check kind и добавляет 6 domain-specific инвариантов в profile YAML. Однако в тексте RFC есть несколько неточностей относительно существующей codebase, пропуск schema validation для обязательных полей `element`/`attribute`, и VIDEO-04 использует `file-contains` вместо нового `html-attribute-pattern`, что создаёт внутреннюю противоречивость.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0691` сообщает 0 violations.

## Axis A — Structural completeness

- **Failure modes — неполные**: Раздел описывает regex fragility и false positives, но не указывает exit code поведение для `forge.doctor` при error-severity нарушениях. В существующей реализации `doctor.ts:1048-1051` error violations → `status: "fail"`, но RFC не документирует это явно.
- **Output format — отсутствует**: RFC не документирует `--json` shape для `forge.doctor` при invariant violations. Существующая реализация (`doctor.ts:1068`) включает `invariantViolations` array — RFC должен это задокументировать или сослаться на RFC-0675.
- **Implementation notes for agents — пустые**: HTML-комментарий содержит только template guidance ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Нет специфических behavioral rules для агентов — например, что `element` и `attribute` поля обязательны для `html-attribute-pattern` и должны быть schema-enforced, или что new check kind должен быть добавлен в TypeScript union type одновременно со schema.

## Axis B — DNA alignment

- **DNA-54 (Forge bindings contract)**: RFC ссылается на DNA-54 в `satisfies[]`, но связь поверхностна. DNA-54 требует что skill bodies не содержат hardcoded project literals. RFC добавляет check kind и invariants в profile YAML (не в skill bodies), что соответствует DNA-54 по аналогии с RFC-0675. Однако RFC не объясняет **как** именно он удовлетворяет DNA-54 — тело RFC должно содержать предложение о том, что invariant declarations остаются в profile YAML, а не в forge source, сохраняя bindings contract.
- **related[] корректны**: RFC-0638 (profile schema), RFC-0641 (editframe profile), RFC-0675 (invariant engine) — все реально существуют и находятся в `docs/rfcs/archive/implemented/`.

## Axis C — Ecosystem fit

- **Package boundaries**: `packages/forge` — корректный пакет. `src/` остаётся portable (нет `@warpgogol/*` imports). `invariant-engine.ts` уже в `src/onboarding/` — расширение не нарушает границ.
- **Test file location**: RFC упоминает `packages/forge/src/tests/invariant-engine.test.ts` как "New", но файл уже существует по пути `packages/forge/os/core/handlers/invariant-engine.test.ts` (RFC-0675). RFC должен сказать "Extended" (не "New") и указать правильный путь. Vitest config `packages/forge` использует `include: ["src/**/*.test.ts", "os/**/*.test.ts"]` — оба пути валидны, но существующий файл уже в `os/core/handlers/`.
- **AGENTS.md update**: RFC упоминает обновление `packages/forge/AGENTS.md` в acceptance criteria, но не в File system responsibilities table. Нужно добавить строку в таблицу.
- **Command lifecycle**: `commands.changed: [forge.doctor]` — корректно, `forge.doctor` уже зарегистрирован.

## Axis D — Forward-only compliance

No issues. RFC additive — новый check kind и новые invariants не удаляют и не меняют существующие. Backward compatible.

## Axis E — Agent-facing policy

- **Status gate**: RFC в `status: draft`. Implementation notes говорят "Agents MAY implement code changes ONLY when this RFC has status: accepted" — корректно, нет self-authorizing language.
- **Schema enforcement gap**: RFC объявляет `element` и `attribute` как `.optional()` в Zod schema, но текст RFC (строка 128-129) говорит "Required for `html-attribute-pattern`". Это не enforced на schema level — нужен `.refine()` или conditional validation. Без этого profile YAML с `kind: html-attribute-pattern` без `element` будет парситься без ошибки, а runtime check молча вернёт пустой массив violations (false negative).

## Axis F — Pragmatism

- **VIDEO-04 использует `file-contains` вместо `html-attribute-pattern`**: VIDEO-04 ("Root ef-timegroup must declare duration or use mode=contain or mode=fit") использует `kind: file-contains` с regex `ef-timegroup[^>]*(duration|mode="contain"|mode="fit")[^>]*>`. Это работает, но концептуально несовместимо с остальными VIDEO-05..09 которые используют новый `html-attribute-pattern`. RFC должен объяснить почему VIDEO-04 не использует новый check kind (ответ: потому что это presence-check на элементе, а не attribute-value-validation — но это нужно явно задокументировать).
- **Lean contracts**: `ProfileInvariantCheck` interface и schema — минимальны. `element` и `attribute` поля добавлены как optional — это корректно для backward compat с существующими check kinds.
- **Test file path в File system responsibilities**: `packages/forge/src/tests/invariant-engine.test.ts` указан как "New", но файл уже существует. Должно быть "Extended" по пути `packages/forge/os/core/handlers/invariant-engine.test.ts`.

## Axis G — Blind spots

- **Performance**: `html-attribute-pattern` читает каждый файл matching glob и запускает 2 regex operations per file (element extraction + attribute extraction). Для типичного Editframe проекта (1-10 compositions) это тривиально. Но RFC не оценивает cost — нужно добавить "Cost: O(n_files × n_elements_per_file) regex matches, negligible for typical Editframe projects (<100 files)".
- **Edge case — self-closing elements**: `<ef-timegroup duration="5s"/>` — regex `<ef-timegroup[^>]*>` матчит включая `/>`. Это корректно, но не задокументировано.
- **Edge case — multiple elements on one line**: `<ef-timegroup duration="5s"><ef-timegroup duration="3s"></ef-timegroup></ef-timegroup>` — regex `new RegExp(\`<${element}[^>]*>\`, "gi")` с флагом `g` найдёт оба. Корректно, но стоит упомянуть.
- **VIDEO-08 regex**: `negatedPattern: "<ef-timegroup[^>]*loop[^>]*>[\\s\\S]*<ef-timegroup[^>]*loop"` — использует `file-not-contains` с `[\s\S]*` между двумя loop-атрибутами. Это матчит любой файл где 2+ ef-timegroup с loop. Но `[\s\S]*` жадный — может перематчить через несколько файлов если content большой. На практике compositions короткие, но стоит отметить в Risks.
- **Migration path**: Новые projects получают 9 invariants автоматически. Существующие editframe-html projects (если есть) получат 6 новых invariants при следующем `forge.doctor` — это может вызвать новые violations. RFC не описывает это.

## Questions for the author

1. Почему `element` и `attribute` объявлены как `.optional()` в Zod schema, если текст RFC говорит "Required for `html-attribute-pattern`"? Нужно ли добавить `.refine()` для conditional required validation, или оставить как runtime responsibility?
2. Почему VIDEO-04 использует `file-contains` вместо `html-attribute-pattern`? RFC должен явно объяснить architectural reason (presence-check vs attribute-value-validation).
3. Тест-файл `invariant-engine.test.ts` уже существует по пути `packages/forge/os/core/handlers/` — RFC должен указать "Extended" (не "New") и правильный путь. Исправить File system responsibilities table?
