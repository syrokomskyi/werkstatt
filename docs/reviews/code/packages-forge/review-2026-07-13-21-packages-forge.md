---
reviewId: REVIEW-CODE-2026-07-13-01
date: 2026-07-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: e67ac36c3...HEAD
filesReviewed:
  - packages/forge/src/registry.ts
  - packages/forge/src/skill-schema.ts
  - packages/forge/src/validators/port-validate.ts
  - packages/forge/src/validators/skill-validate.ts
  - packages/forge/skills/fo/fo-idea/SKILL.md
  - packages/forge/skills/fo/fo-idea-create-rfc/SKILL.md
  - packages/forge/skills/fo/fo-idea-create-adr/SKILL.md
  - packages/forge/skills/fo/fo-idea-audit/SKILL.md
  - packages/forge/skills/fo/fo-idea-enhance/SKILL.md
  - packages/forge/skills/fo/fo-idea-implement/SKILL.md
  - packages/forge/skills/fo/fo-idea-plan/SKILL.md
  - packages/forge/skills/fo/fo-extract-dna/SKILL.md
  - packages/forge/skills/fo/fo-review/SKILL.md
  - packages/forge/skills/fo/fo-fix/SKILL.md
  - packages/forge/skills/fo/fo-add-tests/SKILL.md
  - packages/forge/skills/fo/fo-architecture/SKILL.md
  - packages/forge/skills/fo/fo-handoff/SKILL.md
  - packages/forge/skills/fo/fo-triage/SKILL.md
  - packages/forge/skills/fo/fo-qa/SKILL.md
  - packages/forge/skills/meta/port-to-forge/SKILL.md
  - .agents/skills/_shared/fo-pipeline-conventions.md
  - .agents/skills/_shared/fo-prerequisites.md
  - .agents/skills/_shared/fo-session-summary.md
  - .agents/skills/fo-add-tests/SKILL.md
  - .agents/skills/fo-architecture/SKILL.md
  - .agents/skills/fo-extract-dna/SKILL.md
  - .agents/skills/fo-fix/SKILL.md
  - .agents/skills/fo-handoff/SKILL.md
  - .agents/skills/fo-idea/SKILL.md
  - .agents/skills/fo-idea-audit/SKILL.md
  - .agents/skills/fo-idea-create-adr/SKILL.md
  - .agents/skills/fo-idea-create-rfc/SKILL.md
  - .agents/skills/fo-idea-enhance/SKILL.md
  - .agents/skills/fo-idea-i-just-want-to-see-the-plan/SKILL.md
  - .agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md
  - .agents/skills/fo-idea-implement/SKILL.md
  - .agents/skills/fo-idea-plan/SKILL.md
  - .agents/skills/fo-idea-status/SKILL.md
  - .agents/skills/fo-qa/SKILL.md
  - .agents/skills/fo-review/SKILL.md
  - .agents/skills/fo-triage/SKILL.md
  - .agents/skills/port-to-forge/SKILL.md
  - .agents/skills/skill-create/SKILL.md
  - AGENTS.md
  - packages/forge/os/rfc/types.ts
---

# Code Review: e67ac36c3...HEAD — rename forge skills prefix wg- → fo-

### Verdict: Approved

Механический этаж проходит (tsc + forge.skill.validate = 0 violations). Замена префикса `wg-` → `fo-` выполнена последовательно в 77 файлах: директории, содержимое SKILL.md, frontmatter, registry, schema, валидаторы, AGENTS.md. Одна остаточная ссылка найдена в живом коде (`packages/forge/os/rfc/types.ts:132`), но она косметическая (комментарий JSDoc) и не влияет на выполнение.

### Mechanical floor

Pass — `pnpm --filter forge build:check` (tsc --noEmit) и `forge.skill.validate --json` (0 violations).

### Axis A — Structural correctness

No issues. Registry entries consistent: все 15 `fo-*` навыков имеют `category: "fo"`, пути `skills/fo/fo-*/SKILL.md`, и dependsOn ссылаются на существующие имена (`my-preferences`, `grilling`). Zod schema (`skill-schema.ts:19`) обновлена синхронно с TypeScript типом (`registry.ts:18`). `port-validate.ts:59` использует `path.join(skillDir, "fo", name)` — соответствует новой директории.

### Axis B — DNA alignment

No issues. Изменение не затрагивает DNA-инварианты (монорепо границы, космическое именование, контент-каноника). Категория `fo` в Zod schema и TypeScript типе синхронизирована.

### Axis C — Ecosystem fit

**1 finding (cosmetic):**

- `packages/forge/os/rfc/types.ts:132` — JSDoc-комментарий ссылается на `wg-rfc-enhance` (устаревшее имя навыка). Должно быть `fo-idea-enhance`. Это единственная остаточная ссылка `wg-` в живом исходном коде. Не влияет на выполнение, но вводит в заблуждение при чтении.

**Исторические артефакты (не подлежат изменению):** 79 ссылок `wg-` в `docs/reviews/`, `docs/audits/`, `docs/rfcs/archive/implemented/`, `docs/plans/` — это исторические записи, которые AGENTS.md прямо запрещает редактировать (`docs/audits/` — read-only, `docs/reviews/` — review reports).

### Axis D — Forward-only compliance

No issues. Замена выполнена как полный rename — нет параллельных путей, shim-слоёв, или обратной совместимости. Старые `wg-*` директории удалены, новые `fo-*` единственные.

### Axis E — Agent-facing clarity

No issues. Все SKILL.md frontmatter прошли `forge.skill.validate` (SKILL-01..SKILL-10). Имена навыков в текстах SKILL.md корректно ссылаются на `fo-*` имена. `_shared/fo-*.md` файлы корректно переименованы и ссылаются на `fo-*` навыки.

**Cosmetic note:** Заголовки `_shared/fo-pipeline-conventions.md` и `_shared/fo-session-summary.md` содержат "WG" (сокращение от WGogol, не префикс навыка) — это не нарушение, но может вызвать путаницу при беглом просмотре.

### Axis F — Pragmatism

No issues. Изменение минимально и сфокусировано: только rename, без изменения логики, контрактов, или поведения. Коммит объединяет все изменения в одной атомарной операции.

### Axis G — Blind spots

- **Pre-existing inconsistency (не регрессия):** Навыки `fo-idea-status`, `fo-idea-i-just-want-to-see-the-plan`, `fo-idea-i-just-want-to-see-the-result` существуют в `.agents/skills/` но отсутствуют в `packages/forge/skills/fo/` и в `registry.ts`. Это было так и до rename — не является регрессией.
- **Edge cases:** Переименование выполнено через PowerShell-скрипты с bulk replace `wg-` → `fo-`. Первоначальный прогон пропустил `category: wg` в frontmatter (без дефиса), но это было поймано на валидации и исправлено до коммита.

### Spec compliance

No spec available — spec compliance skipped. Задача была сформулирована как устная инструкция: "Замени префикс `wg-` на `fo-` для всех навыков."

### Questions for the author

1. Должны ли `fo-idea-status`, `fo-idea-i-just-want-to-see-the-plan`, и `fo-idea-i-just-want-to-see-the-result` быть зарегистрированы в `registry.ts` и перенесены в `packages/forge/skills/fo/`? Они существуют только в `.agents/skills/` и не проходят `forge.skill.validate`.
2. Обновить ли комментарий в `packages/forge/os/rfc/types.ts:132` (`wg-rfc-enhance` → `fo-idea-enhance`) в отдельном коммите?
