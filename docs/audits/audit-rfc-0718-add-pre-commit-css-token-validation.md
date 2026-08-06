---
rfcId: RFC-0718
auditId: AUDIT-RFC-0718-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0718

## Verdict: Needs revision

RFC содержит несколько серьёзных проблем: реализация уже применена в `hooks/pre-commit` (строки 94–121) при статусе `draft` — нарушение status gate. Механическая валидация падает с 1 ошибкой (V-24: пустой `satisfies[]`) и 7 предупреждениями (V-13: отсутствуют обязательные разделы). Логика валидации содержит баг с подстрочным сопоставлением (`grep -qF`), который даёт ложные пропуски.

## Mechanical validation (rfc.validate)

**Fail** — 1 error, 8 warnings:

- **V-24 (error)**: architecture RFC created 2026-08-06 must declare at least one DNA invariant in `satisfies` (RFC-0331). `satisfies: []` — пусто.
- **V-13 (warning) ×7**: отсутствуют разделы `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.
- **V-20 (warning)**: unknown frontmatter key `supersedesBy` (not in the RFC schema).

## Axis A — Structural completeness

- **Missing 7 required sections** (V-13): `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`. RFC использует нестандартные имена: `Context` вместо `Problem`, `Justification` вместо `Architectural fit`, `Consequences` вместо `Risks`, `Evolution` вместо `Rollout`.
- **No `## Acceptance criteria`** — критический пробел. Невозможно проверить завершённость реализации без проверяемых критериев.
- **No `## Implementation notes for agents`** — агенты не получают поведенческих правил (например: «при добавлении новых токенов в `tokens.css` pre-commit check автоматически их подхватывает»).
- **No `## Alternatives considered`** — не рассмотрены альтернативы (расширение `biome.tokens.validate` флагом `--staged-only`, TypeScript-скрипт вместо bash).
- **Design section** содержит код реализации, но не содержит TypeScript contracts, file system responsibilities table, output format, failure modes.

## Axis B — DNA alignment

- **`satisfies: []` — пусто** (V-24 error). RFC enforcement design token validity напрямую удовлетворяет **DNA-10** («No hardcoded design tokens» — «CSS must use `--ds-*` custom properties only»). RFC должен содержать `satisfies: [DNA-10]`.
- **`related: [DNA-24]`** — DNA-24 («Block-declarative pages») не имеет отношения к CSS token validation. DNA-24 описывает структуру страниц, не дизайн-токены. Should be removed or replaced with `DNA-10` in `satisfies[]`.

## Axis C — Ecosystem fit

- **`packagesImpacted: ["@warpgogol/tokens"]`** — некорректно. Пакет `@warpgogol/tokens` не модифицируется; он только читается как источник истины. Фактическое изменение — в `hooks/pre-commit` (root-level file, не package). `packagesImpacted` должен быть пустым.
- **Pre-commit hook already contains the implementation** (lines 94–121 of `hooks/pre-commit`). Код в RFC (строки 76–101) идентичен коду в хуке. Это означает, что реализация была применена до принятия RFC — нарушение status gate (см. Axis E).
- **No AGENTS.md updates identified** — RFC не указывает, какие `AGENTS.md` файлы нужно обновить. Root `AGENTS.md` упоминает pre-commit hook для ENV-CONTRACT-05; добавление CSS token validation должно быть отражено в документации.
- **Command lifecycle** — `commands: proposed/added/changed/removed` все пустые. Корректно для pre-commit hook change (не kernel command).

## Axis D — Forward-only compliance

- **No issues.** RFC не предлагает backward compatibility layers, shims, или dual-paths. Проверка аддитивная — новый шаг валидации, не замена существующего.

## Axis E — Agent-facing policy

- **CRITICAL — Status gate violation**: реализация уже присутствует в `hooks/pre-commit` (строки 94–121) при RFC status `draft`. RFC body содержит код, который уже применён. Это нарушает правило: draft RFCs cannot grant implementation permission. Раздел «Placement in pre-commit hook» говорит «Add after the ENV-CONTRACT-05 block (line 91)» — но код уже там.
- **No NEEDS CLARIFICATION markers** — не найдено.
- **No self-authorizing language** в самом RFC — но pre-existing implementation обходит status gate де-факто.

## Axis F — Pragmatism

- **Approach is pragmatic** — grep-based check, no new dependencies, fast. `nonGoals` explicit and meaningful.
- **Missing alternative analysis** — не рассмотрено расширение `biome.tokens.validate` флагом `--staged-only` вместо отдельного pre-commit check. `biome.tokens.validate` уже существует в `packages/os/site-kernel-checks/src/biome-tokens.ts` и имеет полный список валидных токенов.
- **`packagesImpacted` incorrect** — `@warpgogol/tokens` не модифицируется (см. Axis C).

## Axis G — Blind spots

- **False negatives in validation logic**: `grep -qF "$token" "$TOKENS_FILE"` выполняет **substring match**, не exact token declaration match. Если CSS содержит `var(--ds-color-primary)` (невалидный токен), а `tokens.css` содержит `--ds-color-primary-500: #...` (валидный токен), то `grep -qF "--ds-color-primary"` найдёт подстроку внутри `--ds-color-primary-500` и пропустит невалидный токен. Fix: использовать `grep -qP "^\s*\Q$token\E\s*:"` или exact word-boundary match.
- **Performance**: для каждого токена в каждом файле вызывается отдельный `grep -qF`. С ~100 токенами и ~10 CSS файлами это ~1000 subprocess spawns. Более эффективный подход: извлечь все токены из CSS файлов одним `grep`, затем `comm -23` против отсортированного списка валидных токенов — один subprocess для извлечения + один для сравнения.
- **Edge case — token definitions in CSS**: проверка ищет только `var(--ds-...)` references, не declarations. CSS файл, определяющий `--ds-*` property вне `tokens.css`, не будет пойман. Это корректно для pre-commit check (определения вне `tokens.css` уже ловятся `tokens.ds.lint`), но RFC не упоминает это явно.
- **Migration path**: не описан. Существующие CSS файлы должны проходить проверку (поскольку `biome.tokens.validate` уже ловит невалидные токены в `build.check`), но RFC не подтверждает это.

## Questions for the author

1. Почему `satisfies: []` пуст, если RFC напрямую enforcement DNA-10 («No hardcoded design tokens»)? Нужно ли указать `satisfies: [DNA-10]`?
2. Почему реализация уже применена в `hooks/pre-commit` при статусе RFC `draft`? Кто применил код до принятия RFC?
3. Как планируется исправить баг с `grep -qF` substring matching, который пропускает невалидные токены (например, `--ds-color-primary` проходит как подстрока `--ds-color-primary-500`)?
