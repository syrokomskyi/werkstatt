---
reviewId: REVIEW-CODE-2026-08-17-01
date: 2026-08-17
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a3ba309d...HEAD
filesReviewed:
  - packages/werkstatt/package.json
  - packages/werkstatt-shared/package.json
  - packages/werkstatt-game/package.json
  - packages/werkstatt-godot/package.json
  - packages/werkstatt-video/package.json
  - packages/werkstatt/src/plugin/shared-validate.ts
  - packages/werkstatt/src/plugin/import-scan-util.ts
  - packages/werkstatt/src/plugin/autonomy-validate.ts
  - packages/werkstatt/os/werkstatt-shared-validate.module.ts
  - packages/werkstatt/src/leitstand/leitstand-commands.ts
  - pnpm-workspace.yaml
  - .github/workflows/publish.yml
  - packages/werkstatt-shared/AGENTS.md
  - packages/werkstatt/src/onboarding/templates/package.template.json
  - tools/kernel.config.ts
---

# Code Review: a3ba309d...HEAD (RFC-0868 — публикация пакетов на NPM)

### Verdict: Needs revision

Опубликованный на NPM `@warpgogol/werkstatt@0.2.0` содержит `workspace:*` в `dependencies` и `optionalDependencies` — это не валидный semver-диапазон для NPM-потребителей. Публикация выполнена через `npm publish` вместо `pnpm publish`, поэтому pnpm не заменил `workspace:*` на реальные версии. Дополнительно: `autonomy-validate.ts` не рефакторен для использования извлечённого `import-scan-util.ts`, CI-воркфлоу пытается публиковать `werkstatt-site` (исключён пользователем), и фикс `ViewportProfile` в `pipelines/` репозитории не закоммичен.

### Mechanical floor

**Pass.** Все 5 пакетов проходят `tsc --noEmit`. `rfc.validate --id rfc-0868` — OK.

### Axis A — Structural correctness

- **Duplicated Code (Fowler)**: `autonomy-validate.ts` (строки 19-113) содержит полную копию логики сканирования из `import-scan-util.ts`: `EXCLUDE_DIRS`, `EXCLUDE_SUFFIXES`, `shouldExcludeFile`, `scanDirectory`, и тот же regex-паттерн. Сессия извлекла `import-scan-util.ts` и подключила его в `shared-validate.ts`, но `autonomy-validate.ts` не был рефакторен. Извлечение утилиты выполнено наполовину — дублирование сохраняется.

### Axis B — DNA alignment

- **DNA-64 нарушение**: `packages/werkstatt/package.json` declares `@warpgogol/werkstatt-site: "workspace:*"` в `optionalDependencies`. DNA-64 требует, что движок MUST NOT import stack plugins. Даже как optionalDependency, это объявляет зависимость движка от стек-плагина. Движок не должен объявлять зависимость на `werkstatt-site` ни в каком виде — optional или нет.

### Axis C — Ecosystem fit

- **publish.yml публикует werkstatt-site**: `.github/workflows/publish.yml:76-80` содержит шаг публикации `@warpgogol/werkstatt-site`, но пользователь явно исключил этот пакет из NPM-публикации. CI-воркфлоу завершится ошибкой при попытке опубликовать пакет с `link:` зависимостями.
- **Документационный дрифт**: `packages/werkstatt-shared/AGENTS.md` утверждает "Package is published as `@warpgogol/werkstatt-shared` with `access: public` and NPM provenance", но `publishConfig` в `package.json` больше не содержит `provenance: true`. AGENTS.md не обновлён.

### Axis D — Forward-only compliance

No issues. `pnpm.overrides` в `pnpm-workspace.yaml` — это dev-time механизм разрешения зависимостей, не compatibility shim.

### Axis E — Agent-facing clarity

No issues. Все новые файлы (`import-scan-util.ts`, `shared-validate.ts`, `werkstatt-shared-validate.module.ts`) содержат корректные `MODULE_CONTRACT` и `CHANGE_SUMMARY`.

### Axis F — Pragmatism

- **Наполовину выполненная дедупликация**: `import-scan-util.ts` извлечён для устранения дублирования между `autonomy-validate.ts` и `shared-validate.ts`, но только `shared-validate.ts` использует его. `autonomy-validate.ts` сохраняет собственную копию всей логики сканирования. Утилита существует, но не решает проблему, ради которой была создана.

### Axis G — Blind spots

- **КРИТИЧНО: Опубликованный `@warpgogol/werkstatt@0.2.0` сломан для NPM-потребителей**. Публикация выполнена через `npm publish`, а не `pnpm publish`. pnpm заменяет `workspace:*` на реальные версии только при `pnpm publish`. На NPM опубликовано:
  - `dependencies`: `@warpgogol/werkstatt-shared: "workspace:*"` — NPM-потребитель не сможет разрешить `workspace:*`
  - `optionalDependencies`: `@warpgogol/forge: "workspace:*"`, `@warpgogol/werkstatt-site: "workspace:*"` — та же проблема
  Проверка: `npm view @warpgogol/werkstatt@0.2.0 dependencies` показывает `'@warpgogol/werkstatt-shared': 'workspace:*'`
- **`@warpgogol/werkstatt-site` в optionalDependencies опубликованного пакета**: `werkstatt-site` не опубликован на NPM. Даже если `workspace:*` заменить на `*`, NPM-потребитель получит warning о невозможности установить optional-пакет, которого не существует.
- **Фикс `ViewportProfile` в `pipelines/` не закоммичен**: `pipelines/apps/axiom/factory/run/axiom-cli.ts` модифицирован (добавлены `isMobile`, `hasTouch`, `deviceScaleFactor`, `userAgent` в интерфейс и preset-объекты), но `git status` в `pipelines/` репозитории показывает файл как modified/uncommitted. Кросс-репо изменение, которое разблокировало публикацию `werkstatt`, не сохранено в git.

### Spec compliance

| Требование RFC-0868 | Статус | Evidence |
| --- | --- | --- |
| Извлечь `werkstatt-shared` | Done | `packages/werkstatt-shared/` существует, typecheck проходит |
| Опубликовать 5 пакетов на NPM | Partial | Опубликованы, но `werkstatt@0.2.0` содержит `workspace:*` — сломан |
| Опубликовать `forge` | Done | `@warpgogol/forge@1.0.0` на NPM |
| Не публиковать `werkstatt-site` | Partial | Локально не опубликован, но CI-воркфлоу всё ещё пытается |
| `werkstatt.shared.validate` (SHARED-01/02/03) | Done | Модуль зарегистрирован, команда работает |
| `pnpm.overrides` для local dev | Done | `pnpm-workspace.yaml` содержит overrides |
| `prepublishOnly` typecheck | Done | Все 5 пакетов имеют скрипт |

### Questions for the author

1. `@warpgogol/werkstatt@0.2.0` на NPM содержит `workspace:*` в dependencies — как планируешь это исправить? Нужно `npm deprecate` + republish с `pnpm publish` или ручная замена `workspace:*` на `*` перед `npm publish`.
2. Почему `autonomy-validate.ts` не был рефакторен для использования `import-scan-util.ts`? Утилита извлечена, но дублирование сохраняется.
3. Фикс `ViewportProfile` в `pipelines/apps/axiom/factory/run/axiom-cli.ts` не закоммичен — это намеренно или забыли?
