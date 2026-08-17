---
rfcId: RFC-0868
auditId: AUDIT-RFC-0868-01
date: 2026-08-17
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0868

## Verdict: Needs revision

RFC-0868 решает реальную архитектурную проблему (engine→site coupling через exemptions) и предлагает структурно правильное решение (вынос shared-инфраструктуры в отдельный пакет). Однако в RFC есть пробелы в design-секции (неполные exports, отсутствие деталей kernel module), неточности в axiom optional degradation (type-only imports не требуют dynamic import) и неоднозначность по публикации werkstatt-site. Требуется ревизия перед переходом к plan.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0868` exit 0, zero violations, zero markers.

## Axis A — Structural completeness

- **A-1: Output format `werkstatt.shared.validate` не задокументирован.** RFC описывает что команда проверяет (3 проверки), но не показывает `--json` output shape. Раздел "Output format" отсутствует. Для команды, регистрируемой в kernel, JSON-контракт обязателен.

- **A-2: Failure modes не указывают exit codes.** RFC говорит "fails with SHARED-01 error" и "fails with SHARED-02", но не указывает `exitCode: 1` явно. Соглашение kernel — `exitCode: 0` для pass, `exitCode: 1` для fail. Нужно указать явно.

- **A-3: CLI surface для `werkstatt.shared.validate` без флагов и scope.** RFC не показывает точную команду вызова с флагами и scope (`workspace`). Команда упомянута только в `commands.added` и в секции "New command".

## Axis B — DNA alignment

- DNA-64 в `satisfies[]` — реальный инвариант в `docs/architecture-dna.md:271-273`. RFC body (§"DNA-64 alignment") объясняет как структурно enforcement заменяет exemption-based workaround. Корректно.

- RFC не устанавливает новый DNA инвариант — не требуется обновление `docs/architecture-dna.md`.

- `related[]` ссылки (RFC-0769, 0772, 0774, 0776, 0777, 0778, 0779) релевантны — все связаны с package boundaries и stack plugin архитектурой.

No issues.

## Axis C — Ecosystem fit

- **C-1: Compass XML sync не указан.** RFC — workspace-scoped architectural, меняет package boundaries. Для таких RFC root AGENTS.md требует синхронизации `docs/*.xml`. RFC не упоминает какие Compass файлы нужно обновить (`docs/technology.xml` для нового пакета, `docs/development-plan.xml` для фаз rollout, возможно `docs/knowledge-graph.xml`).

- **C-2: Место регистрации `werkstatt.shared.validate` не указано.** RFC не указывает в каком kernel-модуле будет зарегистрирована команда (новый `os/werkstatt-shared.module.ts`? расширение существующего `werkstatt-autonomy.module.ts`?). Также не указано, включается ли команда в какой-либо pipeline (`PACKAGES_CHECK_PIPELINE`, `SITES_BUILD_CHECK_PIPELINE`) или остаётся standalone workspace-scoped командой.

- **C-3: `packagesImpacted` включает `werkstatt-godot` и `werkstatt-video`, но они не упомянуты в decision body.** Эти пакеты получают build step + `private: false`, но не импортируют из `werkstatt-site` (они зависят от engine транзитивно). RFC следует уточнить: нужны ли им изменения imports или только build/publish config.

## Axis D — Forward-only compliance

- No compatibility shims, no dual-path, no backward compatibility layers. Extraction — clean break: imports обновляются, exemptions удаляются, файлы перемещаются.

- `werkstatt-site` internal imports меняются на `@warpgogol/werkstatt-shared/*` — без aliasing.

No issues.

## Axis E — Agent-facing policy

- Status gate: нет self-authorizing language. "Agents MAY implement code changes ONLY when this RFC has status: accepted" — стандартная формулировка.

- Implementation notes ссылаются на RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Корректно.

- NEEDS CLARIFICATION markers: не найдены.

- Anti-fabrication: acceptance criteria не требуют content authoring.

- Storage policy: не применимо — RFC не касается persistence.

No issues.

## Axis F — Pragmatism

- **F-1: `werkstatt.shared.validate` частично дублирует `werkstatt.autonomy.validate`.** Проверка (2) "no werkstatt-site imports in engine" — это именно то, что `werkstatt.autonomy.validate` делает после удаления exemptions. Проверка (3) "no werkstatt-site exemptions in autonomy-validate.ts" — это проверка конфигурации самой autonomy guard. RFC следует обосновать: почему отдельная команда вместо расширения `werkstatt.autonomy.validate` (например, флаг `--strict-shared-boundary` или дополнительная проверка в существующей команде)? Или чётко разграничить: autonomy проверяет imports, shared.validate проверяет package boundary integrity (dep declaration + exemption absence).

## Axis G — Blind spots

- **G-1: Неполные `exports` в package.json shape.** RFC (lines 290-305) перечисляет 14 subpaths для `werkstatt-shared`, но текущий `werkstatt-site/package.json` экспортирует 40+ subpaths только для `share/` (lines 231-508). `ontology/` имеет 8+ subpaths, `passport/` — 7, `surface/` — 8, `integration/` — 3, `checks/` — 10+. RFC следует либо указать что exports будут сгенерированы из фактической структуры директорий, либо привести полный список, либо использовать wildcard patterns (`./share/*`).

- **G-2: Отсутствует kernel module для `werkstatt-shared`.** Package layout (lines 219-264) не показывает `os/` директорию с module files. Команда `werkstatt.shared.validate` должна быть зарегистрирована в kernel registry. Где находится module-файл? В `werkstatt-shared/os/werkstatt-shared.module.ts`? Или команда регистрируется в существующем engine module? Также: если `werkstatt-shared` публикуется на NPM, module-файл должен быть в `exports`.

- **G-3: Type-only imports axiom не требуют dynamic import.** RFC (line 161) говорит "Guard the import in leitstand-commands.ts with a dynamic import + try/catch." Но `Finding` — это `import type` (line 92 в `leitstand-commands.ts`), который стирается при компиляции. Только `isBlockingFinding` (value import, line 91) требует dynamic import. RFC следует уточнить: type-only imports остаются статическими, value imports переводятся на dynamic import.

- **G-4: Неоднозначность по публикации `werkstatt-site`.** RFC (line 180): "werkstatt-site stays private: true... Or it can be published too — the decision is orthogonal." Это не решение. Для `workshop.scaffold` astro-profile внешним потребителям нужен `werkstatt-site` на NPM. RFC следует сделать явный выбор: либо публиковать, либо нет. Если не публиковать — astro-workshops нельзя создавать вне monorepo, что противоречит stated goal RFC.

- **G-5: Внутренние imports `werkstatt-site` в moved modules.** RFC (line 329) говорит "Update internal imports to use @warpgogol/werkstatt-shared/* for moved modules." Но текущие internal imports в `werkstatt-site` — relative (`../share/fs`, `../../ontology/schemas`). После перемещения файлов в другой package, relative imports ломаются. RFC следует указать: moved files сохраняют свои internal relative imports (теперь внутри `werkstatt-shared`), а `werkstatt-site` files, импортирующие из moved domains, переходят на package-level imports `@warpgogol/werkstatt-shared/*`.

## Questions for the author

1. Какой полный список subpath exports будет у `werkstatt-shared`? Текущие 14 в RFC покрывают малую часть фактических subpaths в `werkstatt-site`. Будут ли wildcard patterns или ручной список?

2. Где будет зарегистрирована команда `werkstatt.shared.validate` — в новом kernel module внутри `werkstatt-shared`, или в существующем engine module? Если в `werkstatt-shared`, как engine загружает этот module?

3. Публиковать ли `werkstatt-site` на NPM? Если нет — `workshop.scaffold --stack astro-typescript-turborepo` не работает вне monorepo, что противоречит success signal "pnpm install succeeds in a scaffolded workshop outside the monorepo".

4. Какие Compass XML файлы требуют синхронизации при добавлении нового package `werkstatt-shared` и изменении package boundaries?
