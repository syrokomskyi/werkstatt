---
rfcId: RFC-0704
auditId: AUDIT-RFC-0704-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0704

## Verdict: Needs revision

RFC-0704 решает реальную проблему (ложные bump'ы платформенной версии при коммитах в `packages/forge`), но содержит несколько пробелов в ecosystem fit и agent-facing policy, которые требуют доработки перед реализацией. Наиболее серьёзные: `packagesImpacted` не включает `site-kernel` (хотя RFC ссылается на `isPlatformScope` из этого пакета), и не указано какое именно изменение нужно внести в `AGENTS.md` (root vs `packages/AGENTS.md`).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0704` вернул 0 violations.

## Axis A — Structural completeness

- **TypeScript contracts**: в RFC указан путь `packages/forge/src/forge-config.ts`, но фактический путь к файлу — `packages/forge/src/config/forge-config.ts`. Схема `forgeConfigSchema` и интерфейс `ForgeConfig` находятся именно там. Acceptance criterion на line 211 ссылается на правильный файл, но TypeScript contracts section (line 141) указывает лишь `forge/config@1` — это имя схемы, а не путь к файлу. Неточность не критична, но может запутать агента при реализации.
- **File system responsibilities**: таблица на line 156 указывает `packages/forge/src/forge-config.ts` — фактический путь `packages/forge/src/config/forge-config.ts`. Неточность в пути.
- **Failure modes**: раздел описывает warn-vs-fail поведение, но не указывает exit codes. Для invalid path в `independentVersionPackages` указано "emits a warning and proceeds with normal bump behavior" — но не указано, что `exitCode` остаётся 0 и `status` остаётся `"ok"`. Для mixed-files case не указано, что это нормальный путь (не warning).
- **Output format**: JSON-пример на line 167 показывает `"bumpType": "none"`, но текущий тип `bumpType` в `EcosystemCommitResult` — `"patch" | "minor" | "major"`. Добавление `"none"` требует расширения типа, что не отражено в TypeScript contracts section.
- **Acceptance criteria**: критерий на line 216 ссылается на `packages/forge/os/core/handlers/doctor.ts` — но фактически `forge.doctor` handler находится в `packages/forge/src/onboarding/doctor.ts`. Неточность в пути.

## Axis B — DNA alignment

- **DNA-53 (Semantic fingerprint governance)**: RFC на line 105 объясняет связь корректно — предотвращает ложные записи в `platform-version-log.generated.yaml`, которые не соответствуют реальным изменениям платформенного семантического хэша. Обоснование достаточно.
- `related[]` включает RFC-0533, RFC-0703, RFC-0478 — все три реально связаны: RFC-0533 определяет `ecosystem.commit`, RFC-0703 определяет platform version bump discipline, RFC-0478 определяет `versionBump` field. Decorative ссылок нет.

## Axis C — Ecosystem fit

- **Package boundaries**: `packagesImpacted` указывает `forge` и `site-kernel-checks`. Однако `ecosystem.commit` импортирует `isPlatformScope` из `@warpgogol/site-kernel` (line 30 в `ecosystem-commit.ts`). Если логика определения independent-version-package находится в `site-kernel-checks`, но использует `isPlatformScope` из `site-kernel`, то `site-kernel` также impacted — даже если только как зависимость. Стоит ли указывать `site-kernel` в `packagesImpacted`? Если изменение не требует модификации `site-kernel`, то нет — но стоит уточнить.
- **AGENTS.md updates**: RFC на line 217 указывает, что `AGENTS.md` должен документировать контракт, но не указывает какой именно `AGENTS.md`. Root `AGENTS.md` уже содержит раздел "Platform-scope commit discipline (RFC-0703)" — вероятнее всего обновление нужно туда. Также `packages/AGENTS.md` может потребовать обновления, если independent-version-package контракт влияет на cross-package import rules. RFC должен указать конкретные файлы.
- **Command lifecycle**: `commands.changed: [ecosystem.commit]` — корректно, команда уже зарегистрирована. `commands.proposed: []`, `commands.added: []`, `commands.removed: []` — внутренне консистентно.
- **Compass sync**: RFC не упоминает необходимость синхронизации `docs/*.xml` файлов. Поскольку RFC изменяет поведение `ecosystem.commit` (platform versioning discipline), может потребоваться обновление `docs/verification-plan.xml` или `docs/development-plan.xml`. Если нет — стоит явно указать "No Compass XML sync needed".

## Axis D — Forward-only compliance

- RFC не предлагает compatibility shim или dual-path. Поведение `ecosystem.commit` изменяется напрямую — если `independentVersionPackages` отсутствует, поведение остаётся прежним (backward compatible по конфигурации, но не по коду — это нормально).
- Нет deprecation — RFC добавляет новую условную ветку в существующий handler.
- RFC не amend'ит RFC-0533 напрямую (не в `amends[]`), но изменяет поведение `ecosystem.commit`. Поскольку RFC-0533 находится в archive (implemented), amend не требуется — новый RFC уточняет поведение. Это корректно.

## Axis E — Agent-facing policy

- **Status gate**: RFC не содержит self-authorizing language. Line 223: "Agents MAY implement code changes ONLY when this RFC has status: accepted" — корректно.
- **Implementation notes**: ссылаются на RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). Однако не указан конкретный RFC для agent surface — в существующих RFC это обычно RFC-0025 или аналогичный. Стоит проверить, есть ли в этом repo специальный RFC для agent surface.
- **Agent commit behavior section** (lines 229-235) — отличное дополнение, явно описывает поведение агентов для independent-version packages. Чёткие правила: всегда использовать `ecosystem.commit`, автоматическое определение, mixed-files rule, запрет ручного `ECOSYSTEM_COMMIT=1`.
- **Storage policy**: не применимо — RFC не касается persistence.

## Axis F — Pragmatism

- **Minimal command surface**: RFC не предлагает новых команд — расширяет существующую `ecosystem.commit`. Это правильно.
- **Lean contracts**: `skipPlatformBump?: boolean` — минимальное расширение. `independentVersionPackages?: string[]` — минимальное поле конфигурации. Нет спекулятивной общности.
- **Existing patterns**: RFC рассматривает 3 альтернативы (line 194-200) с честными причинами отказа. Auto-detection через `"private": false` отклонено с правильным обоснованием.
- **Scope discipline**: `packagesImpacted: [forge, site-kernel-checks]` — `forge` для schema extension, `site-kernel-checks` для handler modification. `appsImpacted: []` — корректно, RFC не влияет на apps. `nonGoals` содержательны — три пункта, каждый запрещает конкретное расширение scope.

## Axis G — Blind spots

- **Performance**: `ecosystem.commit` уже читает staged files через `git diff --cached --name-only`. Добавление проверки `independentVersionPackages` — это O(n*m) где n = staged files, m = independent packages. Для текущего масштаба (1 package, ~10-50 staged files) это незначительно. Но RFC не указывает стоимость.
- **Edge cases**: RFC рассматривает mixed-files case (line 184), invalid path (line 182), missing forge.yaml (line 183). Но не рассматривает: что если `independentVersionPackages` содержит путь, который частично пересекается со staged files? Например, `packages/forge` в списке, а staged file — `packages/forge-os/` (префикс совпадает, но это другой пакет). Текущая логика `isPlatformScope` использует `startsWith("packages/")` — проверка independent-package должна использовать более точное сравнение (e.g. `stagedFile.startsWith(pkgPath + "/")`), а не `includes`.
- **PC-02/PC-03 interaction**: RFC на line 207 объясняет, что skipping log write означает, что log остаётся на последней реальной платформенной версии — это корректно. Но не рассматривает сценарий: если `platform-version-log.generated.yaml` уже устарел (hash не совпадает с текущим), и commit skip'ает bump — PC-02/PC-03 будут сравнивать с устаревшим log. Это не новая проблема (она существует и без RFC), но стоит упомянуть.
- **Concurrent execution**: не рассматривается, но `ecosystem.commit` уже имеет lock primitive (DNA-51). Не новая проблема.
- **Security/privacy**: не применимо.

## Questions for the author

1. Как именно должна работать проверка принадлежности staged file к `independentVersionPackages`? Нужно ли использовать `stagedFile.startsWith(pkgPath + "/")` для предотвращения ложного срабатывания на `packages/forge-os/` при `pkgPath = "packages/forge"`?
2. Какой `AGENTS.md` файл нужно обновить — root, `packages/AGENTS.md`, или оба? Root `AGENTS.md` уже содержит раздел "Platform-scope commit discipline (RFC-0703)" — должно ли обновление быть там?
3. Должен ли `bumpType` в `EcosystemCommitResult` расшириться до `"patch" | "minor" | "major" | "none"`, или в skip-case нужно использовать `"patch"` с `skipPlatformBump: true`? JSON-пример на line 174 показывает `"bumpType": "none"`, но TypeScript contracts section не указывает расширение типа.
