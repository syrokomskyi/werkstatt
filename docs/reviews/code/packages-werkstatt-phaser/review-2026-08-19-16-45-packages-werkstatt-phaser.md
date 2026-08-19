---
reviewId: REVIEW-CODE-2026-08-19-01
date: 2026-08-19
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 95c10bd6...HEAD
filesReviewed:
  - packages/werkstatt-phaser/src/index.ts
  - packages/werkstatt-phaser/src/paths/phaser-paths.ts
  - packages/werkstatt-phaser/src/invariants/phaser-invariants.ts
  - packages/werkstatt-phaser/src/checks/assets-validate.ts
  - packages/werkstatt-phaser/src/checks/scenes-validate.ts
  - packages/werkstatt-phaser/src/checks/bundle-validate.ts
  - packages/werkstatt-phaser/src/checks/secret-scan.ts
  - packages/werkstatt-phaser/src/checks/index.ts
  - packages/werkstatt-phaser/src/checks/module.ts
  - packages/werkstatt-phaser/src/deploy/github-pages.ts
  - packages/werkstatt-phaser/src/deploy/cloudflare-pages.ts
  - packages/werkstatt-phaser/src/deploy/types.ts
  - packages/werkstatt-phaser/src/deploy/index.ts
  - packages/werkstatt-phaser/src/build/vite-build.ts
  - packages/werkstatt-phaser/src/onboarding/scaffold-project.ts
  - packages/werkstatt-phaser/src/onboarding/index.ts
  - packages/werkstatt-phaser/src/release-evidence/phaser-evidence.ts
  - packages/werkstatt-phaser/src/utils/list-files-recursive.ts
  - packages/werkstatt-phaser/AGENTS.md
  - packages/werkstatt-phaser/package.json
  - packages/werkstatt-phaser/extract.config.yaml
  - packages/forge/profiles/phaser-turborepo.yaml
  - packages/werkstatt/src/plugin-contract.ts
  - packages/werkstatt/src/validate/plugin-validate.test.ts
  - .forge/pinned.yaml
  - docs/ecosystem.generated.yaml
---

# Code Review: 95c10bd6...HEAD — migrate werkstatt-game to werkstatt-phaser plugin

### Verdict: Needs revision

Дифф мигрирует `werkstatt-game` → `werkstatt-phaser`: переименовывает плагин, команды, инварианты, обновляет ссылки в forge profile, pinned.yaml, plugin-contract.ts. Механический этаж проходит чисто. Однако дифф содержит мёртвый код (неиспользуемые barrel-экспорты и shared utility), баги в скаффолденном бойлерплейте (infinite scene loop, missing Phaser import), нарушение конвенции `writeFileIfChanged`, и устаревший сгенерированный `docs/ecosystem.generated.yaml`.

### Mechanical floor

**Pass.** `pnpm --filter @warpgogol/werkstatt-phaser build:check` — 0 errors. `lint` — 0 errors. `test` — 40/40 passed. `plugin-validate.test.ts` — 9/9 passed.

### Axis A — Structural correctness

1. **Dead code — `src/utils/list-files-recursive.ts`**: Модуль извлечён как shared utility (CHANGE_SUMMARY: "extracted from validators and evidence to remove duplication"), но ни один модуль в пакете его не импортирует. Валидаторы (`assets-validate.ts:98`, `scenes-validate.ts:75`, `bundle-validate.ts:103`, `secret-scan.ts:106`) и `phaser-evidence.ts:96` каждый имеют собственные локальные `listFiles`/`listTsFiles`/`listAssetFiles` функции. Экстракция объявлена, но не завершена.

2. **Dead code — `src/deploy/index.ts`**: Barrel `export { createGitHubPagesAdapter } ...` не импортируется ни одним модулем. `src/index.ts` импортирует напрямую из `./deploy/github-pages.ts` и `./deploy/cloudflare-pages.ts`. В `package.json` нет subpath export `./deploy`. Мёртвый код.

3. **Dead code — `src/onboarding/index.ts`**: Аналогично — barrel не импортируется. `src/index.ts` импортирует напрямую из `./onboarding/scaffold-project.ts`. В `package.json` нет subpath export `./onboarding`. Мёртвый код.

4. **Баг в скаффолденном boot scene — infinite loop**: `src/onboarding/scaffold-project.ts:36` — `create()` вызывает `this.scene.start("BootScene")`, что перезапускает ту же сцену, создавая бесконечный цикл. Boot scene должен либо ничего не делать, либо переходить к другой сцене.

5. **Баг в скаффолденном `phaser.config.ts` — missing Phaser import**: `src/onboarding/scaffold-project.ts:52` — конфиг использует `Phaser.AUTO`, но не импортирует Phaser. Без `import Phaser from "phaser"` файл не компилируется. `main.ts` импортирует Phaser, но `phaser.config.ts` — нет.

6. **`writeFile` вместо `writeFileIfChanged`**: `src/onboarding/scaffold-project.ts:22` — использует raw `writeFile` из `node:fs/promises`. `packages/AGENTS.md` предписывает `writeFileIfChanged` из `@warpgogol/werkstatt/kernel` для generated file writes. Godot scaffold использует `writeFileIfChanged`.

7. **Duplicated Code — recursive file listing**: `listAssetFiles` (assets-validate.ts:98), `listSceneFiles` (scenes-validate.ts:75), `listFiles` (bundle-validate.ts:103), `listTsFiles` (secret-scan.ts:106), `listFiles` (phaser-evidence.ts:96) — пять копий одного и того же паттерна рекурсивного обхода. Shared `listFilesRecursive` существует, но не подключён.

8. **Silent error swallowing — `assets-validate.ts:61`**: `catch {}` молча игнорирует ошибки парсинга YAML в `manifest.yaml`. Повреждённый манифест трактуется как пустой, скрывая реальную проблему. Следует emit warning diagnostic.

### Axis B — DNA alignment

1. **DNA-53 violation — ad hoc hashing**: `src/release-evidence/phaser-evidence.ts:24` использует `createHash("sha256")` из `node:crypto` напрямую для хеширования release evidence (bundle hash, asset manifest hash, scene registry hash). DNA-53 предписывает использовать `@warpgogol/werkstatt/fingerprint` для release artifact hashes. (Godot evidence hook имеет ту же проблему — pre-existing, но всё ещё нарушение.)

2. **DNA-42 Compass compliance**: Все source files содержат `MODULE_CONTRACT` и `CHANGE_SUMMARY` блоки. ✓

3. **DNA-64 Engine/profile boundary**: Плагин импортирует только из `@warpgogol/werkstatt/plugin` и `@warpgogol/werkstatt/kernel/types` — нет engine back-imports. ✓

### Axis C — Ecosystem fit

1. **Stale `docs/ecosystem.generated.yaml`**: Файл всё ещё ссылается на `packages/werkstatt-game/package.json` и `@warpgogol/werkstatt-game` (строки 33, 225–237). Пакет удалён, но сгенерированный файл не регенерирован. Compass sync нарушение.

2. **AGENTS.md updates**: Root `AGENTS.md`, `packages/AGENTS.md`, `packages/werkstatt-phaser/AGENTS.md` — все обновлены. ✓

3. **`.forge/pinned.yaml` update**: Обновлён. ✓

4. **Forge profile update**: `packages/forge/profiles/phaser-turborepo.yaml` — обновлён. ✓

5. **`plugin-contract.ts` update**: Комментарий обновлён. ✓

### Axis D — Forward-only compliance

1. Old `packages/werkstatt-game/` directory fully deleted. ✓
2. No compatibility shims or bridges. ✓
3. `CHANGE_SUMMARY` comments document migration history — not compatibility layers. ✓

### Axis E — Agent-facing clarity

1. All files have `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. ✓
2. No ungrounded assertions. ✓
3. `AGENTS.md` rewritten with clear project-level guidance. ✓

### Axis F — Pragmatism

1. **YAGNI — `listFilesRecursive`**: Utility создан, но не используется. Speculative generality — либо использовать в валидаторах, либо удалить до завершения рефакторинга.

2. **YAGNI — `deploy/index.ts` and `onboarding/index.ts` barrels**: Созданы, но не импортируются. Нет subpath exports. Мёртвый код.

3. **Incomplete extraction**: Five local `listFiles` variants остаются в валидаторах несмотря на создание shared utility. Экстракция объявлена в CHANGE_SUMMARY, но не завершена.

### Axis G — Blind spots

1. **False positives in `scenes-validate.ts`**: `keyRegex` (строка 117) матчит любое `key: "..."` в `phaser.config.ts`, не только scene keys. Если конфиг содержит другие объекты с `key` полями (input config, etc.), они будут ложно добавлены в registered scenes set, потенциально скрывая незарегистрированные сцены.

2. **False positives in `secret-scan.ts`**: Скан пропускает строки начинающиеся с `//` или `*`, но не пропускает block comments (`/* ... */`). Секреты внутри block comments будут flagged. Также паттерны матчат `token`/`password` в test fixtures.

3. **`bundle-validate.ts` regex limitation**: `bundleBudget\s*:\s*(\d+)` (строка 78) матчит только numeric literals. Если бюджет выражен как `5 * 1024 * 1024`, regex не сматчит и fallback к default. Ограничение не документировано.

4. **`assets-validate.ts` path separator**: `listAssetFiles` (строка 110) строит относительные пути с `/` разделителем (`${entry.name}/${s}`) вместо `path.join`. На Windows это может вызвать несоответствие путей.

### Spec compliance

No spec available — skipped. Migration is a rename/refactor task without an explicit RFC or spec gap table.

### Questions for the author

1. Почему `listFilesRecursive` создан как shared utility, но ни один модуль в пакете его не использует? Планируется ли подключить валидаторы к shared utility, или это premature extraction?
2. `phaser.config.ts` в скаффолде использует `Phaser.AUTO` без `import Phaser` — это сознательное упрощение (рассчитывает на global Phaser) или баг?
3. `docs/ecosystem.generated.yaml` содержит stale references на удалённый `werkstatt-game` — когда планируется регенерация?
