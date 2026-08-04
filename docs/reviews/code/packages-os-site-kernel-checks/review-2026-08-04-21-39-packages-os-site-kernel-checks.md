---
reviewId: REVIEW-CODE-2026-08-04-01
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: e2d7b8a8...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/suppressions-config.ts
  - packages/os/site-kernel-checks/src/suppressions-validate.ts
  - packages/os/site-kernel-checks/src/axiom-adapter.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/tests/suppressions-config.test.ts
  - packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - systems/axiom-suppressions.yaml
  - packages/os/site-kernel-checks/package.json
  - .gitignore
---

# Code Review: e2d7b8a8...HEAD (RFC-0684 — Axiom finding suppression layer)

### Verdict: Needs revision

Реализация функционально полна и проходит все тесты (809 passed), но имеет несколько находок: типобезопасность обойдена через `as never[]` касты в `axiom-adapter.ts`, дублирование `escapeHtml`, и default config содержит правило, которое триггерит собственный валидатор (SUPPRESS-VAL-04).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` и `pnpm --filter @warpgogol/site-kernel-handoff run build:check` компилируются без ошибок. `pnpm --filter @warpgogol/site-kernel-checks run test` — 809 тестов passed (125 файлов). `rfc.validate --id RFC-0684` — pass.

### Axis A — Structural correctness

1. **Duplicated Code (Fowler)** — `escapeHtml` добавлена в `axiom-adapter.ts:388` как 4-я копия идентичной функции. Уже существует в `packages/check-core/src/report.ts:125`, `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-generate.ts:38`, и `packages/ui/src/sections/markdown/prose-image-resolver.ts:31`. Следует вынести в `@warpgogol/share` или отдельный utility модуль.

2. **Primitive Obsession / типобезопасность** — `applySuppressions` вызывается в `axiom-adapter.ts:311-315` с кастом `studyRun.findings as never[]`, и результат кастуется обратно через `as never[]` в `countSuppressedByCategory`. Тип `Finding` из `@syrokomskyi/axiom-study` не включает поля `suppressed` и `suppressedBy`. Вместо `as never[]` следует определить `SuppressedFinding` тип (расширение `Finding` с опциональными `suppressed` и `suppressedBy` полями) и использовать его в `applySuppressions` сигнатуре. Это устранит все касты.

3. **Mysterious Name** — переменная `findingsWithSuppressions` в `leitstand-commands.ts:1276-1279` неявно предполагает, что все findings теперь suppressed. Лучше `findingsAfterSuppression` или просто `processedFindings`.

### Axis B — DNA alignment

1. **DNA-49 (Fleet propagation)** — `leitstand.propagate` правильно использует `channel: "alt"` при re-apply suppressions (строка 1278). `leitstand.dev-deploy` передаёт `--channel=dev` (строка 204). Соответствует трёхканальной модели.

2. **DNA-59 (Evidence preservation)** — `mission.check` модифицирует `study-run.json` in-place после `runAxiomCheck`, добавляя `suppressed: true` флаги. Это допустимо: локальная evidence ephemeral (latest run only), а `evidence.sync` (R2 archive) запускается после suppression post-filter в `leitstand.dev-deploy`, так что архивная версия включает suppressed флаги. No issue.

### Axis C — Ecosystem fit

1. **Subpath export** — `./suppressions-config` добавлен в `package.json` `exports` до cross-package import. Правильный порядок (packages/AGENTS.md правило).

2. **Command registration** — `suppressions.validate` зарегистрирован в `infra-contracts.ts` с корректными `reads`, `writes`, `flags`, `scope`.

3. **Pipeline placement** — `suppressions.validate` добавлен в `PACKAGES_CHECK_PIPELINE` после `methodologies.validate`. Правильное место.

4. **AGENTS.md** — обновлён с новыми модулями и `--channel` флагом. Command manifest регенерирован.

### Axis D — Forward-only compliance

No issues. No compatibility shims. `leitstand.propagate` re-apply suppressions — это forward-only подход: старая evidence обрабатывается новым слоем без dual-path.

### Axis E — Agent-facing clarity

1. **MODULE_CONTRACT** — оба новых файла (`suppressions-config.ts`, `suppressions-validate.ts`) содержат `MODULE_CONTRACT` и `CHANGE_SUMMARY` заголовки.

2. **Ungrounded assertions** — комментарии ссылаются на реальные функции и типы. RFC-0684 referenced correctly.

### Axis F — Pragmatism

1. **Minimal command surface** — `suppressions.validate` оправдан как отдельная команда: он валидирует config файл, не findings. Не может быть флагом на существующей команде.

2. **Lean contracts** — `SuppressionRule` тип минимален: только необходимые поля. `SuppressedBy` включает `ruleIndex` который используется только для диагностики дубликатов — это единственное speculative поле.

### Axis G — Blind spots

1. **Performance** — `collectKnownRuleIdsFromEvidence` в `suppressions-validate.ts:51-80` сканирует все директории `missions/*/evidence/axiom/study-run.json`. При большом количестве missions (100+) это может быть медленным. Следует документировать cost в MODULE_CONTRACT или ограничить сканирование (e.g., только latest N missions).

2. **False positives в default config** — правило `descriptionPattern: "preload"` (7 символов, single word) в `systems/axiom-suppressions.yaml:32` триггерит собственный SUPPRESS-VAL-04 warning. Default config должен быть примером best practices и не генерировать warnings. Следует либо сделать pattern более специфичным (e.g., `"preload" in head`), либо принять warning как expected и документировать.

3. **Edge case: empty findings** — `applySuppressions` корректно обрабатывает пустой массив (возвращает пустой массив). `mergeSuppressions` с `undefined` для обоих аргументов возвращает `[]`. No issue.

### Spec compliance

| Requirement from RFC-0684 | Status | Evidence |
| --- | --- | --- |
| suppressions-config.ts module | Done | `packages/os/site-kernel-checks/src/suppressions-config.ts` |
| suppressions.validate command | Done | `packages/os/site-kernel-checks/src/suppressions-validate.ts` + `infra-contracts.ts` |
| systems/axiom-suppressions.yaml | Done | `systems/axiom-suppressions.yaml` (6 rules, 4 categories) |
| --channel flag on mission.check | Done | `axiom-adapter.ts:185-194`, `infra-contracts.ts:383-387` |
| Suppression post-filter in mission.check | Done | `axiom-adapter.ts:289-358` |
| suppressionSummary in output | Done | `axiom-adapter.ts:59-62`, `axiom-adapter.ts:372` |
| Write suppressed flags to study-run.json | Done | `axiom-adapter.ts:318-319` |
| leitstand.propagate re-apply suppressions | Done | `leitstand-commands.ts:1269-1279` |
| leitstand.propagate skip suppressed in blocking | Done | `leitstand-commands.ts:1290-1291` |
| leitstand.dev-deploy --channel dev | Done | `leitstand-commands.ts:204` |
| axiom.report suppressed section | Done | `axiom-adapter.ts:397-459` (injectSuppressedSection) |
| suppressions.validate in pipeline | Done | `packages-check.ts:190-191` |
| Unit tests | Done | 37 tests (30 config + 7 validate), all pass |
| AGENTS.md updated | Done | `packages/os/site-kernel-checks/AGENTS.md` |
| Command manifest regenerated | Done | `docs/command-manifest.generated.yaml` |

### Questions for the author

1. Почему `applySuppressions` использует `as never[]` касты вместо расширенного типа `SuppressedFinding = Finding & { suppressed?: boolean; suppressedBy?: SuppressedBy }`? Это устранит все тип-касты в `axiom-adapter.ts` и `leitstand-commands.ts`.
2. Default config содержит `descriptionPattern: "preload"` который триггерит SUPPRESS-VAL-04. Должен ли default config быть warning-free, или это acceptable warning?
3. `collectKnownRuleIdsFromEvidence` сканирует все missions. Есть ли ограничение на количество missions для сканирования, или это acceptable cost для workspace-scoped команды?
