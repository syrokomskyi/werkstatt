---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 7ce63d9e...HEAD
filesReviewed:
  - packages/forge/skills/fo/ef-composition-review/SKILL.md
  - packages/forge/skills/fo/ef-render-verify/SKILL.md
  - .agents/skills/ef-composition-review/SKILL.md
  - .agents/skills/ef-render-verify/SKILL.md
  - packages/forge/profiles/editframe-html-templates/composition-agents.md
  - packages/forge/src/tests/skill-validate.test.ts
  - packages/forge/src/tests/fixtures/agents-generate-business-before.txt
  - packages/forge/AGENTS.md
  - packages/AGENTS.md
  - docs/rfcs/rfc-0692-editframe-composition-skill-pack-ef-composition-review-and-ef-render-verify.md
---

# Code Review: 7ce63d9e...HEAD (RFC-0692 implementation)

### Verdict: Needs revision

Реализация в целом корректна — два новых skill'а созданы, проходят валидацию, тесты зелёные. Однако обнаружены несколько находок, требующих исправления.

### Mechanical floor

Pass — `build:check` проходит, 620/620 тестов зелёные, `rfc.validate --id RFC-0692` проходит, `forge.skill.validate` не сообщает нарушений для новых skill'ов.

### Axis A — Structural correctness

1. **Дублирование кода (Fowler: Duplicated Code)** — `ef-composition-review` и `ef-render-verify` содержат идентичный блок в начале: "Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics." Это стандартный boilerplate для всех fo-skill'ов — паттерн принят в репозитории, не является нарушением. Отметим как допустимое дублирование.

No issues (axis-specific).

### Axis B — DNA alignment

1. **DNA-54 (Forge bindings contract)** — skill-тела содержат прямые CLI-команды (`forge doctor`, `forge validate`, `forge build`, `forge determinism check`). DNA-54 запрещает hardcoded project-specific literals в canonical skill bodies. Однако эти команды — не project-specific literals, а domain-neutral CLI-команды forge. SKILL-11 (который enforcement DNA-54) проверяет hardcoded project-specific literals — `forge.skill.validate` прошла без нарушений. Соответствие подтверждено.

2. **SKILL-17 escape hatch** — оба skill'а содержат `<!-- skill-lint-disable SKILL-17 -->`. "Editframe" — название стороннего CLI-инструмента, не платформы. SKILL-17 проверяет `Warpgogol`, `WarpGogol`, `RFC-\d{4}`, `ADR-\d{4}`, `DNA-\d+`. "Editframe" не триггерит ни один паттерн. Escape hatch превентивно добавлен по решению grilling-фазы — не является нарушением, но может быть избыточным. Не blocking.

No issues.

### Axis C — Ecosystem fit

1. **Skill count обновлён** — `packages/forge/AGENTS.md` обновлен с "26 fo skills + 4 shared + 3 meta = 33 skills" на "28 fo skills + 4 shared + 3 meta = 35 skills". `packages/AGENTS.md` также обновлен с "33 skills" на "35 skills". Корректно.

2. **Golden fixture обновлён** — `agents-generate-business-before.txt` обновлен с двумя новыми skill'ами в таблице. Порядок алфавитный (`ef-` перед `fo-`). Корректно.

3. **Synced copies** — `.agents/skills/ef-composition-review/SKILL.md` и `.agents/skills/ef-render-verify/SKILL.md` закоммичены вместе с source-копиями. Соответствует правилу `packages/forge/AGENTS.md` § Skills.

No issues.

### Axis D — Forward-only compliance

No issues — новые skill'ы добавлены без legacy-путей или compatibility-шимов.

### Axis E — Agent-facing clarity

1. **`ef-composition-review` Step 5** — "Run `forge doctor` to check all VIDEO-* invariants automatically." Команда `forge doctor` проверяет все инварианты, не только VIDEO-*. Формулировка корректна в контексте editframe-html profile, но может ввести в заблуждение — skill не уточняет, что проверяются только инварианты активного profile. Minor.

2. **`ef-render-verify` Step 4** — "Check that the duration matches the root `ef-timegroup`'s `duration` attribute (if ffprobe or equivalent is available)." Не уточняется, как именно проверять длительность — это оставлено на усмотрение agent'а. Приемлемо для skill-инструкции, но можно уточнить.

No blocking issues.

### Axis F — Pragmatism

1. **`ef-composition-review` Step 6 (Manual best practices)** — список проверок (scene composition quality, narrative pacing, visual hierarchy, asset reuse) субъективен и не имеет чётких критериев. Это неизбежно для "manual best practices" — автоматизировать нельзя. Приемлемо.

2. **`ef-render-verify` Step 3** — "Run `forge determinism check` to verify the render is reproducible — two builds produce identical output." Команда `forge determinism check` делает именно это (RFC-0678). Корректное использование существующей команды.

No issues.

### Axis G — Blind spots

1. **Empty state** — `ef-composition-review` Step 1 обрабатывает empty state ("No compositions found — nothing to review"). `ef-render-verify` не имеет явной проверки empty state — если `forge build` не находит composition, он сообщит ошибку. Приемлемо — skill делегирует это CLI-команде.

2. **False positives** — `ef-composition-review` Step 2 проверяет `loop` only on root `ef-timegroup`. Если agent неправильно определит root timegroup (например, при nested compositions), это может дать false positive. Minor — skill-инструкция достаточна для agent'а.

No blocking issues.

### Spec compliance

| Requirement from RFC-0692 | Status | Evidence |
| --- | --- | --- |
| `ef-composition-review` skill exists with valid frontmatter | Done | `packages/forge/skills/fo/ef-composition-review/SKILL.md` |
| `ef-render-verify` skill exists with valid frontmatter | Done | `packages/forge/skills/fo/ef-render-verify/SKILL.md` |
| `forge.skill.validate` passes on both skills | Done | Zero violations in validation run |
| `forge.skill.list` includes both skills | Done | Both skills appear in `forge.skill.list` output |
| `composition-agents.md` template includes time model concepts, invariant reference, and skill usage | Done | Template enriched with 4 new sections |
| Unit test verifies both skills pass `validateSkill` schema validation | Done | 4 tests added in `skill-validate.test.ts` |
| `packages/forge/AGENTS.md` updated with new skill count | Done | Updated from 33 to 35 skills |
| `rfc.validate` passes on this file before merging | Done | `rfc.validate --id RFC-0692` returns ok: true |

### Questions for the author

1. `ef-composition-review` Step 5 говорит "Run `forge doctor` to check all VIDEO-* invariants" — стоит ли уточнить, что проверяются только инварианты активного profile (editframe-html), а не все инварианты вообше?
2. Escape hatch `<!-- skill-lint-disable SKILL-17 -->` добавлен превентивно, но "Editframe" не триггерит SKILL-17 паттерны. Стоит ли оставить его на будущее (в случае добавления "Editframe" в platform-name список) или убрать как избыточный?
3. `ef-render-verify` Step 4 упоминает ffprobe — стоит ли добавить fallback-стратегию, если ffprobe недоступен?
