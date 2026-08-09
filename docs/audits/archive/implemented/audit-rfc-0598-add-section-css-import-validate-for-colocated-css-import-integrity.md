---
rfcId: RFC-0598
auditId: AUDIT-RFC-0598-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0598

## Verdict: Needs revision

RFC содержит корректный дизайн валидатора, но его проблемный раздел основан на устаревших данных: оба упомянутых section уже имеют CSS-импорты. Это инвалидирует Context, Rollout, критерий приёмки и implementation notes. Дополнительно, `satisfies` ссылается на DNA-5, хотя именно DNA-17 (Mirror Quintet) включает `.css` в пакетный квинтет.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0598` проходит без нарушений.

## Axis A — Structural completeness

- **A-1 (серьёзный)**: Context (строка 86) утверждает, что `ownership-block` и `trust-strip` «were found with colocated `.css` files containing real CSS rules but **no `import` statement**». Однако оба `.astro`-файла уже содержат импорты:
  - `@/packages/ui/src/sections/ownership-block/ownership-block-section.astro:21` — `import "./ownership-block-section.css";`
  - `@/packages/ui/src/sections/trust-strip/trust-strip-section.astro:24` — `import "./trust-strip-section.css";`

  Это означает, что либо RFC написан на основе устаревшей информации, либо баг был исправлен после создания RFC, но до аудита. Разделы Context, Rollout (строка 181), Acceptance criteria (строка 207) и Implementation notes (строка 219) все ссылаются на эти «нарушения» и требуют обновления.

## Axis B — DNA alignment

- **B-1 (средний)**: `satisfies: [DNA-5]` — DNA-5 формулирует зеркальный контракт как `.astro` + `.md` + `.ts` (Component ↔ content ↔ schema). CSS не входит в формулировку DNA-5. Именно DNA-17 (Mirror Quintet) явно добавляет `.css` в package-side квинтет: «`.astro` component + `manifest.yaml` + content schema + `.css` + content `.md` template». RFC должен включать `DNA-17` в `satisfies[]`, так как именно DNA-17 устанавливает `.css` как обязательный элемент квинтета, который этот валидатор защищает.

## Axis C — Ecosystem fit

- **C-1 (средний)**: RFC не упоминает обновление `packages/os/site-kernel-checks/AGENTS.md`, где есть таблица модулей с описаниями. Добавление `src/section-framework/css-import.ts` должно быть отражено в этой таблице (новая строка с `runSectionCssImportValidate`).
- **C-2 (малый)**: RFC корректно указывает размещение в `PACKAGES_CHECK_PIPELINE` после `section.shell.contract.validate` (строка 101 в `@/packages/os/site-kernel-checks/src/pipelines/packages-check.ts`). Подтверждено: команда и путь существуют.

## Axis D — Forward-only compliance

No issues. RFC не предлагает совместимых слоёв, dual-path, или бесконечных grace periods. Fail-hard с момента введения — корректный подход.

## Axis E — Agent-facing policy

No issues. Status gate корректно формулирует «Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)». Implementation notes ссылаются на RFC-0224 и RFC-0334. Self-authorizing language отсутствует.

## Axis F — Pragmatism

- **F-1 (средний, следствие A-1)**: `packagesImpacted` включает `@warpgogol/ui` — но если CSS-импорты уже присутствуют, `@warpgogol/ui` не затрагивается этим RFC. После исправления A-1 `@warpgogol/ui` следует убрать из `packagesImpacted`, либо заменить формулировку на «no package changes required — imports already present».
- **F-2 (малый)**: Команда `section.css.import.validate` обоснованно существует как отдельная команда — она проверяет целостность импортов, что не дублирует существующие `tokens.colors.section-shell.lint` (токены) или `section.shell.contract.validate` (SectionShell usage). Alternatives section честно объясняет, почему расширение существующих валидаторов недостаточно.

## Axis G — Blind spots

- **G-1 (средний, следствие A-1)**: Migration path описан некорректно. RFC утверждает «fail-hard from introduction» с двумя известными нарушениями, которые будут исправлены в том же коммите. Поскольку нарушений нет, migration path следует переформулировать: валидатор вводится как fail-hard, текущая кодовая база уже соответствует (или, если есть другие неизвестные нарушения, они будут обнаружены и исправлены).
- **G-2 (малый)**: Performance оценка (<50ms, ~60 `.astro` файлов) разумна. RFC не указывает, будет ли валидатор кэшируемым (`cacheable: false` не упомянут). Для workspace-scoped команды, сканирующей `packages/ui/src/`, кэширование может быть полезно, но это implementation detail, не блокирующий.
- **G-3 (малый)**: CSS-NAME-01 exemption для директорий с несколькими `.css` файлами (например `effects/`) описан, но критерий exemption («each `.css` has a matching `.astro` or is imported by an `.astro` in the same directory») нетривиален. Тест в `src/tests/css-import-validate.test.ts` должен покрыть этот кейс явно — RFC упоминает это в acceptance criteria, но стоит уточнить, что exemption применяется только при наличии matching `.astro` в той же директории.

## Questions for the author

1. Если `ownership-block` и `trust-strip` уже имеют CSS-импорты, какие реальные нарушения валидатор должен обнаружить при первом запуске? Есть ли другие section/component с отсутствующими импортами, или валидатор вводится превентивно?
2. Почему `satisfies` ссылается на DNA-5, а не на DNA-17, который именно добавляет `.css` в Mirror Quintet?
3. Должен ли валидатор также проверять, что `.css` файл содержит не только комментарии (RFC упоминает 7 section с placeholder CSS, но не уточняет, является ли это нарушением)?
