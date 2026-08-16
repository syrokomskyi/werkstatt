---
reviewId: REVIEW-CODE-2026-08-17-01
date: 2026-08-17
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 9976d5c2...HEAD
filesReviewed:
  - packages/werkstatt-godot/src/build/dotnet-build.ts
  - packages/werkstatt-godot/src/build/dotnet-test.ts
  - packages/werkstatt-godot/src/build/godot-dev-server.ts
  - packages/werkstatt-godot/src/checks/csproj-validate.ts
  - packages/werkstatt-godot/src/checks/index.ts
  - packages/werkstatt-godot/src/checks/module.ts
  - packages/werkstatt-godot/src/checks/project-config-validate.ts
  - packages/werkstatt-godot/src/checks/resource-validate.ts
  - packages/werkstatt-godot/src/checks/scene-reference-validate.ts
  - packages/werkstatt-godot/src/deploy/itch-io.ts
  - packages/werkstatt-godot/src/dev/module.ts
  - packages/werkstatt-godot/src/index.ts
  - packages/werkstatt-godot/src/invariants/godot-invariants.ts
  - packages/werkstatt-godot/src/onboarding/scaffold-project.ts
  - packages/werkstatt-godot/src/release-evidence/godot-evidence.ts
  - packages/werkstatt-godot/src/tests/csproj-validate.test.ts
  - packages/werkstatt-godot/src/tests/project-config-validate.test.ts
  - packages/werkstatt-godot/src/tests/resource-validate.test.ts
  - packages/werkstatt-godot/src/tests/scene-reference-validate.test.ts
  - packages/werkstatt-godot/AGENTS.md
  - packages/werkstatt-godot/package.json
---

# Code Review: 9976d5c2...HEAD (werkstatt-godot enhancements)

### Verdict: Needs revision

Дифф расширяет Godot-плагин тремя новыми валидаторами (GODOT-05..07), Godot export в build hook, multi-platform itch.io deploy, dev/test команды, улучшенный scaffold и git-diff project-config validator. Архитектурно изменения корректны — соблюдают plugin contract, boundary rules и forward-only discipline. Однако есть несколько находок: дублирование логики парсинга export_presets.cfg, type safety проблема в dev/module.ts, semantic mismatch в itch-io.ts и Duplicated Code между scene-reference и resource валидаторами.

### Mechanical floor

Pass — `build:check` (tsc --noEmit) и `vitest run` (37/37 tests) проходят без ошибок.

### Axis A — Structural correctness

- **Duplicated Code (Fowler)** — логика парсинга `export_presets.cfg` дублируется между `dotnet-build.ts:107-130` (`parseExportPresets`) и `itch-io.ts:143-170` (`resolveChannelsFromPresets`). Обе функции используют одинаковый regex-подход (`content.split(/\[preset_(\d+)\]/)`, `nameMatch`, `platformMatch`, `pathMatch`). Нужно извлечь общий парсер в `utils/parse-export-presets.ts` и использовать из обоих модулей.

- **Duplicated Code (Fowler)** — regex `RES_PATTERN = /"res:\/\/([^"]+)"/g` и логика сканирования res:// ссылок дублируется между `scene-reference-validate.ts:38` и `resource-validate.ts:38`. Оба модуля используют одинаковый паттерн, одинаковый цикл `while ((match = RES_PATTERN.exec(content)) !== null)` и одинаковую проверку `existsSync`. Нужно извлечь общий helper `extractResReferences(content: string): string[]` в `utils/`.

- **Strict typing** — `dev/module.ts:40`: `pid: result.data as { pid?: number } | undefined as number | undefined` — unsafe double cast. `result.data` имеет тип `unknown` из `HookResult`, и приведение через `as { pid?: number } | undefined as number | undefined` не безопасно. Нужно использовать type guard или явную проверку: `typeof result.data === "object" && result.data !== null && "pid" in result.data ? result.data.pid : undefined`.

- **csproj-validate.ts:52** — redundant condition: `!content.includes('Sdk="Godot.NET.Sdk"') && !content.includes("Sdk=\"Godot.NET.Sdk\"")`. Оба варианта эквивалентны — одинарные и двойные кавычки в строке дают одинаковый результат при `includes()`. Второе условие никогда не меняет результат первого. Достаточно одной проверки: `!content.includes('Sdk="Godot.NET.Sdk"')`.

### Axis B — DNA alignment

- **DNA-64 (Engine/profile boundary)** — Pass. Пакет `werkstatt-godot` не импортирует engine internals, использует только `@warpgogol/werkstatt/plugin` (типы) и `@warpgogol/werkstatt/kernel` (`writeFileIfChanged`, типы команд). Stack package не становится второй registry или authority.

- **DNA-72 (Validator config location diagnostics)** — N/A. Валидаторы не загружают конфигурацию из неочевидных путей — они работают с файлами в project root.

### Axis C — Ecosystem fit

- **Package boundaries** — Pass. Импорты идут `packages/werkstatt-godot → @warpgogol/werkstatt` (engine), никогда в обратную сторону.

- **AGENTS.md updates** — Pass. `packages/werkstatt-godot/AGENTS.md` обновлён: moduleLoaders `checks, dev`, invariants GODOT-01..07, check gate composition на 7 валидаторов, build hook описание с export step.

- **Command lifecycle** — Pass. Новые команды зарегистрированы в `checks/module.ts` (3 валидатора) и `dev/module.ts` (2 dev команды). `package.json` exports обновлены с subpath exports для `./build/dev-server`, `./build/test`, `./dev/module`.

- **packages/AGENTS.md** — Finding: таблица ownership в `packages/AGENTS.md` (root packages guide) всё ещё описывает `werkstatt-godot` как "Enforces GODOT-01..04 invariants" и не упоминает dev module. Нужно обновить описание `werkstatt-godot` в `packages/AGENTS.md` чтобы отразить GODOT-01..07 и dev module.

### Axis D — Forward-only compliance

- Pass. Нет compatibility shims, нет dual-paths. `project-config-validate.ts` полностью переписан с presence-check на git-diff — старое поведение удалено, не оставлено behind a flag.

### Axis E — Agent-facing clarity

- **MODULE_CONTRACT** — Pass. Все новые файлы имеют `MODULE_CONTRACT` и `CHANGE_SUMMARY` блоки.

- **Ungrounded assertions** — Pass. Комментарии и docstrings ссылаются на реальные функции и файлы.

- **godot-dev-server.ts:40** — `stdio: "ignore"` означает, что stdout/stderr Godot editor не доступны. Если Godot падает при запуске, ошибка не видна. Для dev server это допустимо (editor — GUI процесс), но стоит отметить в `non-goals` что логи Godot editor не перехватываются.

### Axis F — Pragmatism

- **Existing patterns** — `dotnet-test.ts:54-79` (`checkForTestProjects`) использует `readdirSync` для поиска `.Test.csproj` / `.Tests.csproj` файлов. Существующий `listFilesRecursive` utility мог бы быть использован, но здесь нужен только top-level scan, так что `readdirSync` оправдан.

- **Minimal command surface** — `godot.dev.server` и `godot.test` зарегистрированы как kernel commands через dev module — это соответствует паттерну других модулей (checks module). Не флаги на существующих командах, а отдельные команды — оправдано.

- **Scope discipline** — Pass. Дифф затрагивает только `packages/werkstatt-godot/` и root `package.json`/`docs/platform-version-log.generated.yaml` (version bump).

### Axis G — Blind spots

- **Performance** — `scene-reference-validate.ts` и `resource-validate.ts` оба делают `listFilesRecursive` по всему project root. Для крупных Godot проектов с сотнями .tscn/.tres файлов это два полных скана дерева. Можно объединить в один проход, но для типичных Godot проектов (десятки файлов) overhead незначителен.

- **False positives** — `csproj-validate.ts:60`: проверка `!content.includes("<TargetFramework>net8.0</TargetFramework>")` не учитывает `net9.0` или `net8.0-windows`. Если проект использует `net9.0` (Godot 4.x совместим с .NET 9), валидатор выдаст false positive. Нужно либо проверить `net8.0` OR `net9.0`, либо использовать regex для проверки `net\d+.0` где версия >= 8.

- **Edge cases** — `itch-io.ts:106-108`: при multi-channel deploy `urls` массив возвращается в поле `errors` (не `url`), что семантически некорректно — URLs не ошибки. Нужно вернуть массив URLs в отдельном поле (например `urls: string[]`) или в `data`. Текущая реализация: `errors: urls.length > 1 ? urls : undefined` — путает consumer'а, который проверяет `errors` для диагностики.

- **Migration path** — `project-config-validate.ts`: переход с presence-check на git-diff меняет поведение для существующих проектов. Проекты без git history (новые) получают `pass` — это корректно. Проекты с git history и существующими sensitive sections (не изменённые в этом commit) получают `pass` вместо `warn` — это устраняет false positives. Migration path неявный, но корректный.

### Spec compliance

No spec available — spec compliance skipped. Изменения реализуют improvements предложенные в сессии и зафиксированные в TODO list.

### Questions for the author

1. Почему логика парсинга `export_presets.cfg` дублируется между `dotnet-build.ts` и `itch-io.ts` вместо извлечения в общий utility? Обе функции используют идентичный regex-подход — это явный кандидат на extract function.

2. В `itch-io.ts:107` массив URLs возвращается в поле `errors` — это semantic mismatch. Как consumer должен отличить "3 канала задеплоены успешно" от "3 ошибки деплоя"? Нужно ли добавить поле `urls` в `DeployResult`?

3. В `csproj-validate.ts:60` проверка жёстко требует `net8.0` — что произойдёт когда Godot обновит поддержку до .NET 9? Стоит ли сделать проверку более гибкой (`net8.0` или выше)?
