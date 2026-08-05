---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
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

### Verdict: Approved

Implementation корректно расширяет invariant engine четвёртым check kind и добавляет 6 domain-specific инвариантов. После fixes (A1: pattern required in .refine(), E1: defensive check test added) все findings устранены. 616/616 tests pass.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` и `pnpm --filter @warpgogol/forge run test` (616/616) проходят без ошибок.

### Axis A — Structural correctness

- **Finding A1 (FIXED)**: `.refine()` теперь требует `pattern` для `html-attribute-pattern`. Fix: profile-schema.ts:136-137 добавлен `v.pattern != null` в refine condition.

### Axis B — DNA alignment

No issues. DNA-54 (Forge bindings contract) удовлетворён — invariant declarations в profile YAML, check kind generic, нет project-specific literals в forge source.

### Axis C — Ecosystem fit

No issues. `src/` остаётся portable (нет `@warpgogol/*` imports). `forge.doctor` уже интегрирован с `checkInvariants`. AGENTS.md обновлён.

### Axis D — Forward-only compliance

No issues. Additive extension — нет compatibility shims, нет dual paths, нет legacy code.

### Axis E — Agent-facing clarity

- **Finding E1 (FIXED)**: Добавлен тест `html-attribute-pattern with missing element/attribute produces warning violation` (invariant-engine.test.ts:367-391). Тест проверяет что defensive check path возвращает warning violation когда element/attribute отсутствуют.

### Axis F — Pragmatism

No issues. Минимальная поверхность — 4 поля в schema, 1 case branch в engine. Следует существующему паттерну switch/case.

### Axis G — Blind spots

No issues. RFC документирует performance (O(n_files × n_elements_per_file)), false positives (regex fragility), edge cases (self-closing, multiple elements), migration path.

### Spec compliance

| Requirement from RFC                          | Status | Evidence                         |
| --------------------------------------------- | ------ | -------------------------------- |
| `html-attribute-pattern` check kind in schema | Done   | profile-schema.ts:120-142        |
| Element extraction and attribute validation   | Done   | invariant-engine.ts:175-218      |
| VIDEO-04..09 invariants in profile            | Done   | editframe-html.yaml:83-132       |
| `forge.doctor` checks VIDEO-04..09            | Done   | doctor.ts calls checkInvariants  |
| Unit test: valid attribute values             | Done   | invariant-engine.test.ts:246-274 |
| Unit test: invalid attribute values           | Done   | invariant-engine.test.ts:213-244 |
| Unit test: absent attribute                   | Done   | invariant-engine.test.ts:276-304 |
| Unit test: 9 VIDEO-* invariants               | Done   | editframe-profile.test.ts:79     |
| AGENTS.md updated                             | Done   | packages/forge/AGENTS.md:142     |
| rfc.validate passes                           | Done   | 0 violations                     |

### Questions for the author

1. ~~Должен ли `.refine()` также требовать `pattern` для `html-attribute-pattern`?~~ Fixed — `.refine()` теперь требует `pattern`.
2. ~~Нужно ли добавить тест для defensive check path?~~ Fixed — тест добавлен.
