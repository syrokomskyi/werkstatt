---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 6c5feef3~1...HEAD
filesReviewed:
  - docs/adrs/adr-0030-mission-open-must-verify-bordbuch-push.md
  - packages/os/site-kernel-handoff/src/mission/mission-open.ts
  - packages/os/site-kernel-handoff/src/tests/adr-0030-mission-open-bordbuch-push.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-open-bordbuch-gate.test.ts
  - packages/os/site-kernel-handoff/src/tests/mission-open-clean-tree.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: ADR-0030 implementation (6c5feef3~1...HEAD)

### Verdict: Needs revision

Implementation корректно разделяет commit-failure и push-failure guards в `mission.open`, но тест содержит устаревший комментарий и misleading test name.

### Mechanical floor

Pass — `build:check` и все 699 тестов проходят.

### Axis A — Structural correctness

- **Stale comment block** в `adr-0030-mission-open-bordbuch-push.test.ts:80-90`: комментарий описывает старый подход (symlink to /nonexistent/path) который был заменён на `.git` removal. Комментарий вводит в заблуждение — он описывает подход, которого нет в коде.
- **Misleading test name** в `adr-0030-mission-open-bordbuch-push.test.ts:78`: тест называется "mission.open throws when bordbuch commit fails (no git origin configured)" но фактически проверяет push-failure path (no origin remote → commit succeeds, push fails). Test name говорит "commit fails", но assertion ищет "bordbuch push failed".

### Axis B — DNA alignment

No issues. DNA-46 (Mission lifecycle) и DNA-51 (Werkstatt consistency primitives) не нарушены — `mission.open` уже использует locks и operation IDs.

### Axis C — Ecosystem fit

No issues. AGENTS.md обновлён с ADR-0030 правилом. Package boundaries соблюдены.

### Axis D — Forward-only compliance

No issues. Старый non-throwing path удалён, новый throwing path заменяет его.

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT и CHANGE_SUMMARY** присутствуют в новом тесте — корректно.
- **CHANGE_SUMMARY** в `mission-open.ts` обновлён с ADR-0030 записью — корректно.
- Stale comment (Axis A) снижает agent-facing clarity — другой агент не поймёт какой подход актуален.

### Axis F — Pragmatism

No issues. Изменение минимально — 2 guard check вместо 1. Никакого over-engineering.

### Axis G — Blind spots

No issues. Edge cases (commit failure vs push failure) покрыты тестами. Concurrent execution не новая — locks уже существуют.

### Spec compliance

| Requirement from ADR-0030 | Status | Evidence |
| --- | --- | --- |
| Check `commitSha === null` (commit failed) | Done | `mission-open.ts:187-192` |
| Check `pushed === false` (push failed) | Done | `mission-open.ts:193-199` |
| Error message instructs to check git remote connectivity | Done | `mission-open.ts:197-198` |
| Error message for commit failure includes system ID | Done | `mission-open.ts:189-191` |
| Error message for push failure includes error string from result | Done | `mission-open.ts:196` |

### Questions for the author

1. Why does the first test (line 78) claim to test "commit fails" but actually assert "push failed"? Should the test name be corrected to "mission.open throws when bordbuch push fails (no git origin configured)"?
2. Why is the stale comment block (lines 80-90) still present? It describes an approach that was replaced — should it be removed?
