---
reviewId: REVIEW-CODE-2026-08-17-01
date: 2026-08-17
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: HEAD~1...HEAD
filesReviewed:
  - packages/forge/profiles/godot-csharp.yaml
  - packages/werkstatt-godot/package.json
  - packages/werkstatt-godot/tsconfig.json
  - packages/werkstatt-godot/AGENTS.md
  - packages/werkstatt-godot/extract.config.yaml
  - packages/werkstatt-godot/src/index.ts
  - packages/werkstatt-godot/src/paths/godot-paths.ts
  - packages/werkstatt-godot/src/invariants/godot-invariants.ts
  - packages/werkstatt-godot/src/checks/scene-validate.ts
  - packages/werkstatt-godot/src/checks/gitignore-validate.ts
  - packages/werkstatt-godot/src/checks/secret-scan.ts
  - packages/werkstatt-godot/src/checks/project-config-validate.ts
  - packages/werkstatt-godot/src/checks/index.ts
  - packages/werkstatt-godot/src/checks/module.ts
  - packages/werkstatt-godot/src/build/dotnet-build.ts
  - packages/werkstatt-godot/src/onboarding/module.ts
  - packages/werkstatt-godot/src/onboarding/scaffold-project.ts
  - packages/werkstatt-godot/src/release-evidence/godot-evidence.ts
  - packages/werkstatt-godot/src/deploy/itch-io.ts
  - packages/werkstatt-godot/src/deploy/github-releases.ts
  - packages/werkstatt-godot/skills/godot-feature/SKILL.md
  - packages/werkstatt-godot/skills/godot-scene-review/SKILL.md
  - packages/werkstatt-godot/skills/godot-debug/SKILL.md
  - packages/AGENTS.md
  - packages/werkstatt/src/workshop/templates.ts
  - packages/werkstatt/src/workshop/workshop-scaffold.ts
  - packages/werkstatt/src/workshop/workshop.module.ts
---

# Code Review: HEAD~1...HEAD (godot-csharp stack profile + werkstatt-godot plugin)

### Verdict: Needs revision

Дифф добавляет новый стек-профиль и плагин для Godot 4.x + C#, следуя паттернам `werkstatt-game`. Структурно корректно: package boundaries соблюдены, MODULE_CONTRACT на месте, регистрация в STACK_PLUGIN_MAP и workshop-scaffold завершена. Однако есть логический баг в `scene-validate.ts` (валидатор никогда не находит нарушений), противоречие между заявленной и фактической серьёзностью GODOT-04, no-op модуль onboarding, raw `writeFile` вместо `writeFileIfChanged`, и мёртвая зависимость `yaml`.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-godot run build` (tsc --noEmit) проходит без ошибок.

### Axis A — Structural correctness

1. **Fail — `scene-validate.ts` логический баг (100% false-negative).** Валидатор сканирует `Scenes/` на `.tscn` и `Scripts/` на `.cs`, затем проверяет, что найденные файлы находятся в `Scenes/` и `Scripts/`. Это циркулярно — файлы, найденные внутри `Scenes/`, всегда проходят проверку `relPath.startsWith("Scenes/")`. Валидатор никогда не найдёт нарушений GODOT-01, потому что он не сканирует проект целиком на предмет misplaced-файлов. Для корректной работы нужно сканировать весь `projectRoot` на `.tscn` и `.cs` и флагать те, которые НЕ в `Scenes/` или `Scripts/` соответственно. `@scene-validate.ts:42-65`

2. **Fail — `project-config-validate.ts` противоречие severity.** MODULE_CONTRACT и описание инварианта GODOT-04 говорят "warning only" и "Does not block", но валидатор возвращает `exitCode: 1` при наличии violations, а `checkGate` в `index.ts` обрабатывает это как blocking (`errors.push(...)` при `exitCode !== 0`). Либо severity должна быть error (и тогда обновить описание), либо валидатор должен возвращать `exitCode: 0` с warnings. `@project-config-validate.ts:7,65-70` + `@checks/index.ts:43-46`

3. **Fail — `onboarding/module.ts` no-op модуль.** `register()` пуст, комментарий говорит "Scaffold command registered via scaffoldProject hook". Модуль загружается через `moduleLoaders.onboarding` в `index.ts`, но ничего не регистрирует. Это middle-man модуль — либо удалить `moduleLoaders.onboarding`, либо убрать модуль целиком. `@onboarding/module.ts:16-24`

4. **Fail — `scaffold-project.ts` использует raw `writeFile`.** `packages/AGENTS.md` требует `writeFileIfChanged` для generated file writes. Scaffold использует `writeFile` из `node:fs/promises`, что создаёт git churn при перегенерации. `@scaffold-project.ts:22,91-95`

5. **Fail — `DeployResult` определён в `itch-io.ts` и импортирован в `github-releases.ts`.** Cross-module type dependency — `github-releases` зависит от `itch-io` для shared типа. `DeployResult` должен быть в отдельном types-файле или дублирован. `@github-releases.ts:23`

6. **Fail — `listFilesRecursive` дублирован.** Идентичная функция определена в `scene-validate.ts:75` и `godot-evidence.ts:84`. Duplicated Code — нужно вынести в shared утилиту. `@scene-validate.ts:75-92` + `@godot-evidence.ts:84-101`

7. **Fail — `package.json` exports указывают на несуществующие файлы.** `./onboarding` → `src/onboarding/index.ts` (нет файла), `./deploy` → `src/deploy/index.ts` (нет файла). pnpm strict isolation может выдать ошибку при импорте. (Тот же паттерн в `werkstatt-game`, но это не делает его корректным.) `@package.json:30-41`

### Axis B — DNA alignment

- **DNA-64 — Pass.** Плагин импортирует только из `@warpgogol/werkstatt/plugin` и `@warpgogol/werkstatt/kernel/types`. Engine не импортирует плагин. Boundary соблюдён.
- **Legacy plugin boundary — Pass.** Плагин использует `werkstatt/plugin@1` как существующий паттерн. Не добавляет новые adapters, compatibility layers, или ambient authority.

### Axis C — Ecosystem fit

- **Package boundaries — Pass.** Импорты идут от плагина к engine, не наоборот.
- **AGENTS.md — Pass.** `packages/AGENTS.md` обновлен записью `werkstatt-godot`. `packages/werkstatt-godot/AGENTS.md` создан с полным описанием.
- **STACK_PLUGIN_MAP — Pass.** Регистрация корректна: package, importName, exportName.
- **workshop-scaffold.ts — Pass.** Domain mapping `godot-csharp -> "game"` разумный.
- **workshop.module.ts — Pass.** Stack list обновлен.
- **`yaml` dependency — Fail.** Зависимость объявлена в `package.json`, но не импортирована ни в одном source-файле. Мёртвая зависимость. (Тот же паттерн в `werkstatt-game`.) `@package.json:60`

### Axis D — Forward-only compliance

- **Pass.** Нет compatibility shims, bridges, или dual-paths. Плагин использует существующий `werkstatt/plugin@1` контракт как установленный паттерн.

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT — Pass.** Все source-файлы имеют MODULE_CONTRACT и CHANGE_SUMMARY.
- **onboarding/module.ts комментарий — Fail.** Комментарий "Scaffold command registered via scaffoldProject hook" в пустом `register()` вводит в заблуждение — модуль ничего не регистрирует. `@onboarding/module.ts:21`
- **AGENTS.md credential injection — Pass.** Описано корректно: channel config, не env vars.

### Axis F — Pragmatism

- **No-op onboarding module — Fail.** Модуль существует, загружается, но ничего не делает. YAGNI — либо удалить, либо использовать. `@onboarding/module.ts`
- **`yaml` dependency — Fail.** Не используется. Удалить. `@package.json:60`
- **`package.json` exports для несуществующих файлов — Fail.** `./onboarding` и `./deploy` указывают на несуществующие `index.ts`. Удалить или создать файлы. `@package.json:30-41`
- **Паттерн следует `werkstatt-game` — Pass.** Структура плагина, имена, MODULE_CONTRACT — всё следует established pattern.

### Axis G — Blind spots

- **`scene-validate.ts` false-negative rate — Fail.** 100% false-negative — валидатор никогда не найдёт нарушений (см. Axis A #1). Нужно сканировать весь проект, не только правильные директории.
- **`project-config-validate.ts` false-positive rate — Fail.** Флагает любое наличие `[autoload]`, `[input]`, `[layer_names]`, `[rendering]` в `project.godot`, даже если секция не изменилась. Для нового проекта это всегда violation. Нужно сравнивать с baseline или проверять diff, а не presence. `@project-config-validate.ts:55-63`
- **`secret-scan.ts` edge cases — Pass с замечанием.** Пропускает `//` и `*` комментарии, но не обрабатывает `/* */` block comments или string literals. Для C# это приемлемый baseline, но стоит задокументировать ограничение.
- **No tests — Fail.** Ни один валидатор не имеет unit-тестов. Для нового пакета с 4 валидаторами это значительный blind spot.

### Spec compliance

No spec available — skipped.

### Questions for the author

1. `scene-validate.ts` сканирует только `Scenes/` и `Scripts/` — как он должен находить `.tscn` файлы вне `Scenes/`? Нужно ли сканировать весь project root?
2. GODOT-04 описан как warning, но возвращает `exitCode: 1` — это blocking или advisory? Если advisory, почему `checkGate` treats it as blocking?
3. `onboarding/module.ts` — модуль загружается, но `register()` пуст. Зачем он нужен? Можно ли удалить `moduleLoaders.onboarding`?
4. `yaml` dependency — где она используется? Если нигде, зачем объявлена?
5. `package.json` exports `./onboarding` и `./deploy` указывают на несуществующие файлы — это намеренно (для будущего) или ошибка?
