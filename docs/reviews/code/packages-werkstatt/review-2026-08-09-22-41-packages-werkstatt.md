---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 7ba756ee...HEAD
filesReviewed:
  - packages/werkstatt/src/dns/dns-helpers.ts
  - packages/werkstatt/src/dns/dns-records-schema-validate.ts
  - packages/werkstatt/src/dns/dns-records-schema-validate.test.ts
  - packages/werkstatt/src/dns/dns-record-upsert.ts
  - packages/werkstatt/src/dns/dns.module.ts
  - packages/werkstatt/src/sternsystem/index.ts
  - packages/werkstatt/src/sternsystem/sternsystem.module.ts
  - packages/werkstatt/src/mission/mission.module.ts
  - packages/werkstatt/src/mission/index.ts
  - packages/werkstatt/src/release/release.module.ts
  - packages/werkstatt/src/release/index.ts
  - packages/werkstatt/src/leitstand/leitstand.module.ts
  - packages/werkstatt/src/leitstand/index.ts
  - packages/werkstatt/src/leitstand/service-deploy.ts
  - packages/werkstatt/src/notausgang/notausgang.module.ts
  - packages/werkstatt/src/subdomain/subdomain.module.ts
  - packages/werkstatt/src/evidence/evidence-module.ts
  - packages/werkstatt/src/evidence/evidence-sync.ts
  - packages/werkstatt/src/kernel/site-workspace-resolver.ts
  - packages/werkstatt/src/validate/plugin-validate.ts
  - packages/werkstatt/src/workshop/templates.ts
  - packages/werkstatt/src/workshop/workshop-scaffold.test.ts
  - packages/werkstatt/src/tests-handoff/helpers/registry-builder.ts
  - packages/werkstatt/src/tests-handoff/mission-open-clean-tree.test.ts
  - packages/werkstatt/src/tests-handoff/subdomain-list.test.ts
  - packages/werkstatt/src/tests-handoff/subdomain-register.test.ts
  - packages/werkstatt/src/tests-handoff/subdomain-validate.test.ts
  - packages/werkstatt/src/tests-handoff/werkstatt-commit.test.ts
  - packages/werkstatt-site/src/checks/agent/agent-dns-aid.ts
  - packages/werkstatt-site/src/checks/agent/agent-dns-aid.test.ts
  - packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts
  - packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts
  - systems-cache/warpgogol-com/dns-records.yaml
---

# Code Review: 7ba756ee...HEAD (RFC-0790 DNS records path migration + declarative metadata sweep)

### Verdict: Needs revision

Дифф мигрирует `dns-records.yaml` из `systems/{id}/` в `systems-cache/{id}/` и обновляет декларативные метаданные во всех модулях. Основная часть работы корректна и последовательна, но есть несколько находок: DNA-45 всё ещё ссылается на `systems/registry.yaml` как на single source of truth, `templates.ts` содержит отформатированный `JSON.stringify` с лишними скобками, и `registryYaml()` возвращает контент с комментарием для `.gitkeep` файла.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` и `pnpm --filter @warpgogol/werkstatt-site build:check` не сообщают ошибок в изменённых файлах (pre-existing ошибки в `first-party-data.ts`, `content-surface.ts` не связаны с диффом).

### Axis A — Structural correctness

- **Duplicated Code (test fixtures)** — `agent-dns-aid.test.ts` повторяет `join(context.workspaceRoot, "..", "systems-cache", "test-site", "dns-records.yaml")` 6 раз. Тот же паттерн в `dns-records-schema-validate.test.ts` — `join(tmpDir, "..", "systems-cache", "test-system")` повторяется 4 раза. Стоит вынести в локальную константу `dnsPath` в начале каждого `describe`/`beforeEach`. Не блокирующе, но Fowler Duplicated Code.
- **Mysterious Name** — `registryYaml()` в `templates.ts` теперь возвращает контент для `systems-cache/.gitkeep`, но функция называется `registryYaml`. Имя больше не отражает содержимое. → переименовать в `systemsCacheGitkeep` или `cacheDirGitkeep`.
- **templates.ts wrapping** — `packageJson()` и `turboJson()` обёрнуты в лишние скобки: `return (JSON.stringify(...) + "\n")`. Это cosmetic, но скобки не несут смысловой нагрузки — до диффа их не было. → убрать лишние скобки.

### Axis B — DNA alignment

- **DNA-45 (Fleet registry)** — `docs/architecture-dna.md` строка 197: `systems/registry.yaml is the machine-readable index of all Sternsystems... The registry is the single source of truth for fleet state`. Дифф мигрирует код с `systems/registry.yaml` на `systems-cache/{id}/system-config.yaml`, но **не обновляет DNA-45**. Это нарушение forward-only discipline — DNA-45 продолжает ссылаться на устаревший путь. → обновить DNA-45 (или добавить DNA-N от RFC-0790, который supersede'ит DNA-45).
- **DNA-1** — строка 9: `Each deployable site is a Sternsystem registered in systems/registry.yaml`. Та же проблема — ссылка на устаревший путь. → обновить.
- **DNA-46** — строка 201: `systems/<id>/bordbuch/events.ndjson`. Дифф мигрирует bordbuch пути в метаданных на `systems-cache/{id}/bordbuch/`, но DNA-46 не обновлена. → обновить.

### Axis C — Ecosystem fit

- **Package boundaries** — `agent-dns-aid.ts` (werkstatt-site) импортирует `resolveCacheClonePath` и `readSystemConfig` из `@warpgogol/werkstatt/sternsystem`. Это допустимо — plugin→engine импорт разрешён (DNA-64), и `studio-gate/auth.ts` уже использует тот же паттерн. Pass.
- **Command lifecycle** — метаданные команд (`reads`, `writes`, `description`) последовательно обновлены во всех модулях. Pass.
- **AGENTS.md updates** — root `AGENTS.md` строка 7: `Deployable sites live as Sternsystemen registered in systems/registry.yaml`. Это не обновлено. → обновить.

### Axis D — Forward-only compliance

- **No dual-paths** — дифф полностью удаляет старые пути `systems/registry.yaml` из кода и тестов. Нет shim-слоёв или условных fallback. Pass.
- **Legacy code paths deleted** — `dns-records-schema-validate.ts` удаляет `readdir`-based сканирование `systems/` и заменяет на `discoverSystems`. Pass.
- **DNA not updated** — DNA-1, DNA-45, DNA-46 не обновлены (см. Axis B). Это нарушение forward-only: код мигрировал, но DNA продолжает описывать старую архитектуру. → обновить DNA.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — `registry-builder.ts` обновил `MODULE_CONTRACT` и `CHANGE_SUMMARY` с упоминанием RFC-0790. Pass.
- **Comments updated** — комментарии в `evidence-sync.ts`, `plugin-validate.ts`, `site-workspace-resolver.ts`, `service-deploy.ts` обновлены. Pass.
- **No ungrounded assertions** — все комментарии ссылаются на реальные функции и пути. Pass.

### Axis F — Pragmatism

- **Existing patterns** — `resolveCacheClonePath` и `discoverSystems` уже существовали в `registry-io.ts`. Дифф переиспользует их вместо создания новых хелперов. Pass.
- **Scope discipline** — дифф затрагивает только файлы, связанные с миграцией путей. В `templates.ts` есть reformatting `packageJson()` и `turboJson()` — это scope creep (cosmetic reformatting, не связанный с RFC-0790). → выделить в отдельный commit или откатить.
- **Minimal command surface** — новые команды не добавлены. Pass.

### Axis G — Blind spots

- **Migration path** — существующие workshops со `systems/registry.yaml` должны быть мигрированы. Нет автоматической миграции (команды `migrate` или скрипта). Это может быть намеренным (operator-driven migration), но стоит задокументировать. → добавить note в RFC-0790 или AGENTS.md.
- **Edge cases** — `dns-records-schema-validate.test.ts` "scan all systems" теперь пишет `system-config.yaml` для каждого системы, чтобы `discoverSystems` нашёл их. Корректно. Pass.

### Spec compliance

| Requirement from RFC-0790 | Status | Evidence |
| --- | --- | --- |
| Move dns-records.yaml to systems-cache/{id}/ | Done | `systems-cache/warpgogol-com/dns-records.yaml`, `dns-helpers.ts:49-50` |
| Update DNS code paths to resolveCacheClonePath | Done | `dns-helpers.ts`, `dns-records-schema-validate.ts`, `dns-record-upsert.ts` |
| Update agent-dns-aid.ts (werkstatt-site) | Done | `agent-dns-aid.ts:27,54`, `29-agent-surface.ts:240,244,258` |
| Update declarative metadata in all modules | Done | `dns.module.ts`, `sternsystem.module.ts`, `mission.module.ts`, etc. |
| Update test helpers and test files | Done | `registry-builder.ts`, `subdomain-*.test.ts`, `werkstatt-commit.test.ts`, etc. |
| Update workshop templates | Done | `templates.ts`: `systems-cache/.gitkeep` |
| Update DNA invariants (DNA-1, DNA-45, DNA-46) | Missing | `docs/architecture-dna.md` lines 9, 197, 201 — still reference old paths |
| Update root AGENTS.md | Missing | `AGENTS.md` line 7 — still references `systems/registry.yaml` |

### Questions for the author

1. DNA-1, DNA-45 и DNA-46 продолжают ссылаться на `systems/registry.yaml` и `systems/<id>/bordbuch/`. Когда они будут обновлены? Нужен ли новый DNA-N от RFC-0790, или достаточно поправить существующие записи?
2. `registryYaml()` в `templates.ts` теперь возвращает контент для `.gitkeep` — почему функция не переименована? Имя вводит в заблуждение.
3. Reformatting `packageJson()` и `turboJson()` в `templates.ts` (лишние скобки) — это намеренное изменение или побочный эффект редактора? Если намеренное, стоит выделить в отдельный commit.
