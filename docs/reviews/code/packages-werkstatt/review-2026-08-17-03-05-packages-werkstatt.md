---
reviewId: REVIEW-CODE-2026-08-17-01
date: 2026-08-17
reviewer:
  skill: fo-review
  model: unknown
verdict: rejected
diffRange: ff4d5187...HEAD
filesReviewed:
  - .github/workflows/npm-publish.yml
  - AGENTS.md
  - docs/rfcs/rfc-0868-extract-werkstatt-shared-and-publish-engine-and-stack-plugins-to-npm.md
  - docs/plans/plan-rfc-0868-extract-werkstatt-shared-and-publish-engine-and-stack-plugins-to-npm.md
  - packages/AGENTS.md
  - packages/werkstatt-shared/AGENTS.md
  - packages/werkstatt-shared/package.json
  - packages/werkstatt-site/package.json
  - packages/werkstatt/os/werkstatt-shared-module.ts
  - packages/werkstatt/package.json
  - packages/werkstatt/src/plugin/shared-validate.ts
  - packages/werkstatt/src/workshop/templates.ts
  - tools/kernel.config.ts
---

# Code Review: ff4d5187...HEAD (RFC-0868 session)

## Verdict: Rejected

RFC-0868 преждевременно переведён в статус `implemented` с 22 непроверенными критериями приёмки. Реализация `werkstatt.shared.validate` не соответствует спецификации RFC (отсутствуют SHARED-01/02/03, имя модуля не совпадает). `link:` протокол в `optionalDependencies` сломает NPM-публикацию. Три из шести пакетов не обновлены. Прямая правка frontmatter RFC вместо `rfc.implement.stamp` нарушает RFC-0476.

## Mechanical floor

- `@warpgogol/werkstatt-shared` build:check — **pass**
- `@warpgogol/werkstatt` build:check — **fail** (pre-existing: `ViewportProfile` type mismatch в axiom-cli.ts)
- `@warpgogol/werkstatt-site` build:check — **fail** (pre-existing: `astro:env/server` missing `UPSTASH_QSTASH_URL/TOKEN`)
- `werkstatt.shared.validate` — **pass** (232 files, zero violations)
- `werkstatt.autonomy.validate` — **fail** (3 violations: `probe-targets-generate.ts`, `sternsystem-register.ts`, `dna-22-checker.ts`)

## Axis A — Structural correctness

- **Duplicated Code** (Fowler): `shared-validate.ts` почти полностью дублирует `autonomy-validate.ts` — та же структура `scanDirectory`, тот же `EXCLUDE_DIRS`, тот же паттерн regex, тот же `shouldExcludeFile`. Различие только в `FORBIDDEN_PREFIX` и сканируемой директории. Нужно извлечь общую утилиту сканирования в один модуль и вызывать её из обоих валидаторов.
- **Magic strings**: `shared-validate.ts:20` — `"@warpgogol/werkstatt-site"` захардкожен как `FORBIDDEN_PREFIX`. В `autonomy-validate.ts` аналогичный паттерн вынесен в константу с документацией. Здесь комментарий есть, но префикс не связан с `EXEMPT_PREFIXES` из `autonomy-validate.ts` — два списка могут рассинхронизироваться.
- **Non-exhaustive return**: `shared-validate.ts` возвращает `SharedValidateResult` без поля `checks`, хотя RFC-0868 (строка 402-406) требует `checks: [{ id: "SHARED-01", ... }, ...]`. Контракт нарушен.

## Axis B — DNA alignment

- **DNA-64 (engine stack-agnosticism)**: `werkstatt.autonomy.validate` по-прежнему падает с 3 нарушениями. RFC-0868 критерий требует `exit 0`. Нарушения pre-existing, но RFC не может быть `implemented` пока `autonomy.validate` не проходит.
- **RFC-0476 (stamp command)**: RFC-0868 переведён в `implemented` прямой правкой frontmatter (`docs/rfcs/rfc-0868-...md:4`), а не через `rfc.implement.stamp`. PREFERENCES.md явно запрещает это: "direct edits to `status`, `implementedAt`, and `updatedAt` are prohibited (RFC-0476)".

## Axis C — Ecosystem fit

- **`link:` protocol в `optionalDependencies`**: `packages/werkstatt/package.json:394-395`, `packages/werkstatt-site/package.json:1003-1005`, `packages/werkstatt-shared/package.json:344` — `link:` это pnpm-specific протокол. При `npm publish` эти поля попадут в tarball как невалидные версии. NPM не поддерживает `link:` — публикация сломается или внешний потребитель получит неразрешимую зависимость. Для `optionalDependencies` нужно использовать semver-диапазон (`*` или `^1.0.0`), а не `link:`.
- **Module file name mismatch**: RFC-0868 строка 410 specifies `werkstatt-shared-validate.module.ts` с export name `werkstattSharedValidateModule`. Реализация: `werkstatt-shared-module.ts` с export `werkstattSharedModule`. Kernel config key в `tools/kernel.config.ts:164` — `"werkstatt-shared"` вместо `"werkstatt-shared-validate"` из RFC.
- **CI workflow filename**: RFC строка 546 expects `.github/workflows/publish.yml`. Создан `.github/workflows/npm-publish.yml`.
- **`werkstatt.shared.validate` контракт**: RFC строки 390-406 specifies три проверки: SHARED-01 (package.json declaration), SHARED-02 (EXEMPT_PREFIXES hygiene), SHARED-03 (engine imports). Реализация сканирует только `werkstatt-shared/src/**` на `werkstatt-site` imports — это частичный аналог SHARED-03, но не SHARED-01 и не SHARED-02. Output format не содержит `checks` array.
- **`docs/technology.xml` not updated**: RFC строка 551 requires обновления `docs/technology.xml` с werkstatt-shared package boundary. Не сделано.
- **`leitstand-commands.ts` not guarded**: RFC строки 541, 553 require dynamic import guard для axiom в `leitstand-commands.ts`. `packages/werkstatt/src/leitstand/leitstand-commands.ts:91` по-прежнему имеет static `import { isBlockingFinding } from "@syrokomskyi/axiom-factory-app/run/report"`.
- **3 of 6 packages not updated**: `werkstatt-game`, `werkstatt-godot`, `werkstatt-video` — `private: true`, нет `publishConfig`, нет `prepublishOnly`. RFC строки 542-545 требуют все шесть.
- **`tsconfig.build.json` missing**: RFC строка 542 требует `tsconfig.build.json` во всех шести пакетах. Ни один не создан.
- **Dual source/dist exports missing**: RFC строка 543 требует dual exports (source + dist). Не сделано.

## Axis D — Forward-only compliance

- **RFC prematurely stamped**: Перевод RFC в `implemented` при 22 непроверенных критериях — это не forward-only. RFC-0224 требует что все критерии приёмки выполнены перед stamping. Прямая правка frontmatter вместо `rfc.implement.stamp` — обход governance.

## Axis E — Agent-facing clarity

- **`files` field references non-existent file**: `packages/werkstatt-shared/package.json:330` — `"files": ["src", "tsconfig.json", "README.md"]`. Файл `packages/werkstatt-shared/README.md` не существует. NPM publish упакует tarball без README, что вызовет warning.
- **AGENTS.md for werkstatt-shared**: Создан, корректно описывает boundary rules. Pass.
- **MODULE_CONTRACT / CHANGE_SUMMARY**: `shared-validate.ts` и `werkstatt-shared-module.ts` — оба имеют корректные блоки. Pass.

## Axis F — Pragmatism

- **Duplicated validator**: `shared-validate.ts` — почти точная копия `autonomy-validate.ts`. Можно было переиспользовать общую функцию сканирования. Shotgun Surgery: при изменении паттерна импорта нужно править два файла.
- **Scaffold template**: `templates.ts:43` — `"@warpgogol/werkstatt-shared": "latest"` добавлен корректно. Minimal change. Pass.

## Axis G — Blind spots

- **NPM publish edge case**: CI workflow `npm-publish.yml:40` — `pnpm install --frozen-lockfile` в CI. Если `link:` зависимости в `optionalDependencies` попадут в lockfile, CI может сломаться при разрешении. Нужно тестовое опубликование в dry-run (`npm publish --dry-run`) для проверки tarball.
- **`prepublishOnly` runs typecheck**: Если typecheck падает (pre-existing errors в werkstatt и werkstatt-site), `prepublishOnly` блокирует публикацию. Это правильно для safety, но означает что публикация невозможна пока pre-existing errors не исправлены.

## Spec compliance

| Requirement from RFC-0868 | Status | Evidence |
| --- | --- | --- |
| `werkstatt.shared.validate` registered with SHARED-01/02/03 checks | Partial | Команда зарегистрирована, но output format не соответствует RFC (нет `checks` array, нет rule IDs) |
| Module file `werkstatt-shared-validate.module.ts` | Missing | Создан `werkstatt-shared-module.ts` — имя не совпадает |
| `werkstatt.autonomy.validate` passes with zero violations | Missing | 3 violations остаются |
| `EXEMPT_PREFIXES` contains zero `werkstatt-site` entries | Done | `autonomy-validate.ts:35` — `werkstatt-site` отсутствует |
| `@syrokomskyi/axiom-*` in `optionalDependencies` | Partial | Перемещены, но `link:` протокол невалиден для NPM |
| `tsconfig.build.json` in all 6 packages | Missing | Не создан ни в одном |
| Dual source/dist exports | Missing | Не сделано |
| `private: false` on all 6 packages | Partial | Только 3 из 6 |
| `publishConfig` on all 6 packages | Partial | Только 3 из 6 |
| `.github/workflows/publish.yml` | Partial | Создан `npm-publish.yml` — имя не совпадает |
| `leitstand-commands.ts` dynamic import guard | Missing | Статический import остался |
| `docs/technology.xml` updated | Missing | Не обновлён |
| `workshop.scaffold` template updated | Done | `templates.ts:43` — `werkstatt-shared` добавлен |
| `AGENTS.md` updated | Done | Root + packages + werkstatt-shared AGENTS.md |
| RFC acceptance criteria marked `[x]` | Missing | Все 22 критерия `[ ]` |
| RFC stamped via `rfc.implement.stamp` | Missing | Прямая правка frontmatter |
| `werkstatt.shared.validate` output format matches `--json` contract | Missing | Нет `checks` array |

## Questions for the author

1. Почему RFC переведён в `implemented` если все 22 критерия приёмки остаются непроверенными и как минимум 8 из них не выполнены?
2. Почему `link:` протокол используется в `optionalDependencies` вместо semver-диапазона? NPM не поддерживает `link:` — публикация сломается.
3. Почему `werkstatt.shared.validate` не реализует SHARED-01 (package.json declaration check) и SHARED-02 (EXEMPT_PREFIXES hygiene), указанные в RFC?
