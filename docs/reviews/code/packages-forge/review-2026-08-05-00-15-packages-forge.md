---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 35a43cda...HEAD
filesReviewed:
  - packages/forge/src/profiles/profile-schema.ts
  - packages/forge/src/onboarding/invariant-engine.ts
  - packages/forge/profiles/editframe-html.yaml
  - packages/forge/os/core/handlers/invariant-engine.test.ts
  - packages/forge/src/tests/editframe-profile.test.ts
  - packages/forge/AGENTS.md
---

# Code Review: 35a43cda...HEAD (RFC-0691 implementation)

### Verdict: Needs revision

Implementation корректно расширяет invariant engine четвёртым check kind и добавляет 6 domain-specific инвариантов. Однако `.refine()` в schema не проверяет `pattern` как обязательное поле для `html-attribute-pattern`, что позволяет silent false negatives. Также отсутствует тест для defensive check (missing `element`/`attribute`).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` и `pnpm --filter @warpgogol/forge run test` (615/615) проходят без ошибок.

### Axis A — Structural correctness

- **Finding A1**: `.refine()` в `profileInvariantCheckSchema` проверяет только `element` и `attribute` для `html-attribute-pattern`, но не проверяет `pattern`. Если profile объявляет `kind: html-attribute-pattern` с `element` и `attribute`, но без `pattern`, `runCheck` молча возвращает `[]` (строка 113: `if (!pattern) return []`). Это silent false negative — check объявлен, но никогда не выполняется. `.refine()` должен также требовать `pattern` для `html-attribute-pattern`.

### Axis B — DNA alignment

No issues. DNA-54 (Forge bindings contract) удовлетворён — invariant declarations в profile YAML, check kind generic, нет project-specific literals в forge source.

### Axis C — Ecosystem fit

No issues. `src/` остаётся portable (нет `@warpgogol/*` imports). `forge.doctor` уже интегрирован с `checkInvariants`. AGENTS.md обновлён.

### Axis D — Forward-only compliance

No issues. Additive extension — нет compatibility shims, нет dual paths, нет legacy code.

### Axis E — Agent-facing clarity

- **Finding E1**: Нет теста для defensive check (missing `element`/`attribute`). Строки 178-186 в `invariant-engine.ts` содержат defensive warning violation для случая когда `element` или `attribute` undefined, но этот path не покрыт тестами. Добавить тест: `html-attribute-pattern with missing element/attribute produces warning violation`.

### Axis F — Pragmatism

No issues. Минимальная поверхность — 4 поля в schema, 1 case branch в engine. Следует существующему паттерну switch/case.

### Axis G — Blind spots

No issues. RFC документирует performance (O(n_files × n_elements_per_file)), false positives (regex fragility), edge cases (self-closing, multiple elements), migration path.

### Spec compliance

| Requirement from RFC | Status | Evidence |
| --- | --- | --- |
| `html-attribute-pattern` check kind in schema | Done | profile-schema.ts:120-142 |
| Element extraction and attribute validation | Done | invariant-engine.ts:175-218 |
| VIDEO-04..09 invariants in profile | Done | editframe-html.yaml:83-132 |
| `forge.doctor` checks VIDEO-04..09 | Done | doctor.ts calls checkInvariants |
| Unit test: valid attribute values | Done | invariant-engine.test.ts:246-274 |
| Unit test: invalid attribute values | Done | invariant-engine.test.ts:213-244 |
| Unit test: absent attribute | Done | invariant-engine.test.ts:276-304 |
| Unit test: 9 VIDEO-* invariants | Done | editframe-profile.test.ts:79 |
| AGENTS.md updated | Done | packages/forge/AGENTS.md:142 |
| rfc.validate passes | Done | 0 violations |

### Questions for the author

1. Должен ли `.refine()` также требовать `pattern` для `html-attribute-pattern`? Без этого check молча возвращает `[]` если `pattern` отсутствует.
2. Нужно ли добавить тест для defensive check path (missing `element`/`attribute`)?
