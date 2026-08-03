---
rfcId: RFC-0641
auditId: AUDIT-RFC-0641-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0641

## Вердикт: Требует доработки

RFC описывает чисто аддитивный профиль `editframe-html` — новый YAML-файл в `packages/forge/profiles/`. Концептуально RFC корректен: он не вводит новых команд, не меняет схему и следует существующему паттерну профилей. Однако критерии приёмки зависят от команд из RFC-0640 (`forge.profile.validate`, `forge.create --profile`), которая всё ещё в статусе `draft` — это нужно явно зафиксировать. Также `satisfies: [DNA-54]` слабо обоснован: RFC добавляет профиль, а не контракт привязок.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0641 --json` вернул ноль нарушений.

## Ось A — Структурная полнота

- **Failure modes** не указывают exit codes и warn-vs-fail поведение. Сказано «forge doctor reports the binding as unresolved but does not fail», но не указано: это warning или info? Какой exit code у `forge.profile.validate` при невалидном профиле?
- **Risks** отсутствует оценка риска ложных срабатываний (false-positive rate) для VIDEO-инвариантов и риска неверной интерпретации агентами. VIDEO-02 («scene durations use contain mode by default») — субъективное правило, но RFC не уточняет, как агент должен проверять этот инвариант.
- **Acceptance criteria** пункт 9 (`forge create --profile editframe-html scaffolds a working project structure`) и пункт 1 (`passes forge.profile.validate`) зависят от команд, определяемых в RFC-0640. RFC должен явно указать, что эти критерии проверяются только после реализации RFC-0640.

## Ось B — Выравнивание с DNA

- **`satisfies: [DNA-54]`** — слабое обоснование. DNA-54 требует, чтобы канонические тела навыков (`packages/forge/skills/**/*.md`) не содержали хардкоженных литералов. RFC-0641 добавляет профиль YAML — это не тело навыка и не контракт привязок. Профиль содержит хардкоженные команды Editframe (`editframe render`, `editframe check`), что нормально для профиля, но не относится к DNA-54. Рекомендация: перенести DNA-54 из `satisfies[]` в `related[]`, либо обосновать связь точнее — профиль поставляет значения, которые `forge.create` (RFC-0640) записывает в bindings, что затем используется навыками через `ref()`. Но это косвенная связь, а не прямое удовлетворение инварианта.

## Ось C — Экосистемная совместимость

- **Границы пакетов**: `packagesImpacted: [packages/forge]` — корректно. Профиль и шаблоны находятся в `packages/forge/profiles/` и `packages/forge/profiles/editframe-html-templates/`.
- **Command lifecycle**: `commands.proposed/added/changed/removed` — все пустые. Корректно: RFC добавляет профиль, а не команды. `forge.profile.validate` принадлежит RFC-0640.
- **AGENTS.md**: Acceptance criteria включает обновление `packages/forge/AGENTS.md`. Корректно — в `packages/forge/AGENTS.md` §Stack profiles перечислены shipped profiles, нужно добавить `editframe-html`.

## Ось D — Forward-only compliance

No issues. RFC чисто аддитивный: новый профиль, нет совместимости, нет dual-path, нет устаревшего кода для удаления.

## Ось E — Agent-facing policy

- **Status gate**: Нет самоавторизующегося языка. Корректно.
- **Anti-fabrication**: Acceptance criteria включает «Profile includes first workspace template with sample HTML composition». Это шаблонный HTML-файл, который агент может создать — не требует человеческого авторинга. Корректно.
- **Implementation notes**: Стандартный шаблон, без кастомизации. Достаточно для профиль-только RFC.

## Ось F — Прагматизм

- **Минимальная поверхность**: Нет новых команд, нет новых типов. Профиль — это YAML-файл. Корректно.
- **Existing patterns**: RFC следует существующему паттерну (`astro-typescript-turborepo.yaml`, `phaser-turborepo.yaml`, `forge-shell.yaml`). Структура `workspace.dirs`, `workspace.files`, `install`, `firstWorkspace` соответствует схеме `forge/stack-profile@1`.
- **Scope discipline**: `nonGoals` явно ссылаются на RFC-0638, RFC-0639, RFC-0640, RFC-0642. Чёткое разделение ответственности. Корректно.
- **Зависимость реализации**: RFC должен явно указать порядок реализации в серии: RFC-0638 → RFC-0639 → RFC-0640 → RFC-0641. Без RFC-0638 (схема) профиль не пройдет валидацию; без RFC-0640 (команды) критерии приёмки не проверяются.

## Ось G — Слепые зоны

- **Edge case — несколько профилей с `domain: video`**: RFC не рассматривает случай, когда несколько профилей объявляют `domain: video`. `detectStack` в `stack-profile.ts` использует `detect.anyOf` маркеры — если два профиля совпадают, возвращается первый. Это существующее поведение, но для новой предметной области стоит уточнить, что `editframe-html` не конфликтует с будущим `editframe-react`.
- **Профиль и `files` array в `package.json`**: `packages/forge/package.json` `files` включает `profiles/` — новый профиль автоматически попадёт в npm-пакет. Корректно, но RFC не упоминает, что шаблоны в `profiles/editframe-html-templates/` также попадут в пакет (они внутри `profiles/`). Это работает, но стоит подтвердить.
- **Editframe CLI как external dependency**: Профиль ссылается на `@editframe/cli` в install steps, но `@editframe/cli` не объявлен в `packages/forge/package.json` dependencies. Это корректно — forge не зависит от Editframe, CLI устанавливается в проекте оператора. Но `forge.doctor` на проекте без установленного Editframe CLI должен сообщить об этом — это поведение RFC-0640, не RFC-0641.

## Вопросы автору

1. RFC-0640 (которая определяет `forge.profile.validate` и domain-aware `forge.create`) всё ещё в статусе `draft`. Как будут проверены критерии приёмки 1 и 9, если RFC-0640 не реализована? Следует ли явно указать порядок реализации в серии RFC-0638→0639→0640→0641?
2. Профиль содержит хардкоженные команды Editframe (`editframe render`, `editframe check`) в `artifacts[].produce.command` и `artifacts[].validate.command`. Должен ли профиль использовать `ref(bindings.commands.produce)` вместо конкретных команд, или намеренно, что профиль поставляет конкретные дефолты, которые оператор переопределяет в `forge.yaml`?
3. `workspaceTypes[].detect` использует `glob: *.html` и `contains: ef-timegroup`. Насколько специфичен маркер `ef-timegroup`? Может ли обычный HTML-файл случайно содержать эту строку (например, в комментарии или документации)? Стоит ли добавить дополнительный маркер (например, наличие `@editframe/cli` в `package.json`)?
