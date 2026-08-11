---
rfcId: RFC-0803
auditId: AUDIT-RFC-0803-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0803

## Verdict: Needs revision

RFC содержит критическое противоречие между Decision (поле в `system.md` pages[]) и TypeScript contracts / file responsibilities (поле в `PageEntrySchema` в `page-entry.ts`). Это два разных файла с разными схемами. Также RFC предлагает архитектурный паттерн (`Set<string>` передаваемый потребителям), отличный от существующего в route registry (inline-фильтрация при построении), без обоснования выбора.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0803 --json` вернул exitCode 0, нарушений нет.

## Axis A — Structural completeness

- **A-1: `prose-link` reference type без rule code.** `DeploymentGateViolation.referenceType` объединение включает `"prose-link"`, но определены только GATE-01 (navigation) и GATE-02 (block props). Для prose-link нет правила — либо добавить GATE-03, либо убрать из объединения.

## Axis B — DNA alignment

No issues. DNA-9 и DNA-13 — реальные инварианты. RFC объясняет, как расширяет DNA-9 (видимость от блоков к страницам) и как закрывает утечку DNA-13 через `deployment.gate.validate`. Новых DNA инвариантов не вводится.

## Axis C — Ecosystem fit

- **C-1: Неправильный файл схемы (критическое).** RFC говорит "The `system.md` page entry schema gains a `deployment.production` boolean field" в Decision, но TypeScript contracts (строка 127) и file responsibilities (строка 170) указывают `packages/werkstatt-site/src/domain/ontology/schemas/page-entry.ts` → `PageEntrySchema`. Однако `PageEntrySchema` определяет frontmatter контентных `.md` файлов (`kind: page`, `cosmicStar`, `title`, `blocks[]`), а не `system.md` pages[]. Схема `system.md` pages[] определена в `packages/werkstatt-site/src/domain/ontology/schemas/system/manifest.ts` (строки 120-240, `pages: z.array(z.object({ pageId, routes, ... }))`). Поле `deployment` должно быть добавлено туда, а не в `page-entry.ts`.

- **C-2: Архитектурный паттерн не совпадает с существующим.** Route registry в `registry.ts` уже выполняет inline-фильтрацию при построении: `blogGated` пропускает article pages, entitlement gates управляют surface/person/nachweis маршрутами. RFC предлагает `collectGatedPageIds()` возвращающий `Set<string>`, передаваемый во все потребители (sitemap, navigation, llms.txt, route generation). Это другой паттерн. RFC должен обосновать, почему существующий подход (фильтрация в registry) недостаточен, или использовать его.

- **C-3: `import.meta.env.PROD` в package-модуле.** Implementation notes (строка 273) требуют `collectGatedPageIds()` возвращать пустой set когда `import.meta.env.PROD === false`. Но `page.ts` — чистый TypeScript модуль, type-checked с `tsc --noEmit` вне Vite. `packages/AGENTS.md` явно запрещает `import.meta.env` в таких модулях: "use `process.env.NODE_ENV !== "production"` instead". Если функция в `page.ts`, нужно использовать `process.env.NODE_ENV`.

- **C-4: `system/manifest.ts` отсутствует в file responsibilities.** Таблица (строки 168-176) не упоминает `packages/werkstatt-site/src/domain/ontology/schemas/system/manifest.ts` — фактический файл, где нужно изменить схему `pages[]`.

## Axis D — Forward-only compliance

No issues. `deployment.production` по умолчанию `true`, существующие страницы не требуют изменений. Совместимость shims не предусмотрена. Forward-only.

## Axis E — Agent-facing policy

No issues. Self-authorizing language отсутствует. Implementation notes корректно ссылаются на `ecosystem.commit` и `mission.git.commit`. NEEDS CLARIFICATION markers отсутствуют. Cookies/persistence не затрагиваются.

## Axis F — Pragmatism

- **F-1: `collectGatedPageIds()` в `page.ts` — неподходящее место.** `page.ts` владеет `buildPage()` pipeline (ResolvedPage/ResolvedBlock из entry data). Утилита чтения `system.md` pages[] для сбора gated page IDs — другая ответственность. Route registry в `registry.ts` уже читает `system.md` pages[] — функция логичнее там или в отдельном модуле.

- **F-2: `prose-link` в `referenceType` без правила** (дублирует A-1, но здесь как прагматизм: спекулятивный тип без enforcement).

## Axis G — Blind spots

- **G-1: `parentPageId` chain через gated страницу.** Если non-gated страница имеет `parentPageId: "gated-page"`, breadcrumb hierarchy ломается — gated страница не существует в production. RFC не рассматривает этот edge case. `breadcrumb.trail.validate` может потребовать проверки gate-статуса в цепочке.

- **G-2: Surface/person/nachweis routes.** Route registry складывает surface, person profile, и nachweis routes поверх `system.md` pages[]. RFC не уточняет, могут ли эти route sources быть gated. Они не имеют `system.md` pages[] entry, поэтому `collectGatedPageIds()` их не покроет.

- **G-3: Performance.** `deployment.gate.validate` сканирует navigation files (`navigation.md`, `labels.md`) и block props всех страниц. RFC не оценивает стоимость (количество файлов, I/O patterns) для крупных сайтов.

## Questions for the author

1. Поле `deployment` должно быть в `SystemManifestSchema.pages[]` (`system/manifest.ts`) или в `PageEntrySchema` (`page-entry.ts`)? Decision говорит одно, TypeScript contracts — другое. Какой файл правильный?
2. Почему `collectGatedPageIds()` возвращает `Set<string>` для передачи всем потребителям, вместо inline-фильтрации в route registry (существующий паттерн для entitlement gates)?
3. Как должна обрабатываться ситуация, когда non-gated страница имеет `parentPageId` указывающий на gated страницу — breadcrumb trail ломается в production?
