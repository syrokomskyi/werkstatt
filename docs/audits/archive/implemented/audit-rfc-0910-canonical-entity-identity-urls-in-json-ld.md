---
rfcId: RFC-0910
auditId: AUDIT-RFC-0910-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0910

## Verdict: Needs revision

RFC корректно диагностирует проблему (entity identity URLs используют сырой языковой префикс вместо канонической формы) и предлагает точечный фикс в shared-билдерах. Однако RFC не разрешает пакетное граничное ограничение (`canonicalPageUrl` живёт в `werkstatt-site`, а билдеры — в `werkstatt-shared`), неточно указывает файл для фикса breadcrumb и не уточняет семантику `Person.url` (внешний vs внутренний URL).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0910 --json` вернул `status: pass`, 0 violations.

## Axis A — Structural completeness

No issues. Все обязательные секции присутствуют и содержат реальный контент. Decision в настоящем времени, CLI surface точный, TypeScript contracts минимальны, file system responsibilities таблица есть, output format документирован, failure modes с exit codes, rollout с default behavior, 4 альтернативы с причинами rejection, risks включают agent misinterpretation risk, 8 acceptance criteria checkable, implementation notes explicit.

## Axis B — DNA alignment

**Finding B-1: `canonicalRootUrl` vs `canonicalPageUrl` (DNA-85 mechanism mismatch).** DNA-85 (строка 357 `docs/architecture-dna.md`) требует byte-identity с `canonicalPageUrl` output. RFC предлагает новый хелпер `canonicalRootUrl(baseUrl, trailingSlash)` (строка 138 RFC), который не является `canonicalPageUrl`. RFC должен либо использовать `canonicalPageUrl({ lang: defaultLang, route: "", kind: "html" }, ...)` для получения root URL, либо объяснить, что `canonicalRootUrl` производит тот же вывод, что `canonicalPageUrl` для root route, и почему отдельный хелпер необходим.

**Finding B-2: `satisfies: [DNA-85]` — обоснование присутствует.** RFC строка 114 объясняет, как расширяет DNA-85 от page `url` к entity identity URLs. Operator явно отклонил новый DNA-87 (строка 209). Обоснование приемлемо, но см. B-1 про механизм.

## Axis C — Ecosystem fit

**Finding C-1: Пакетное граничное ограничение не адресовано.** `canonicalPageUrl` и `localizeUrl` живут в `packages/werkstatt-site/src/domain/share/astro/` (`canonical-url.ts`, `url-policy.ts`). Билдеры, требующие фикса (`organization-profile.ts`, `website.ts`, `breadcrumb.ts`), живут в `packages/werkstatt-shared/src/share/semantic/`. `werkstatt-shared` MUST NOT import from `werkstatt-site` (AGENTS.md, `packages/werkstatt-shared/AGENTS.md`). RFC предлагает `canonicalRootUrl` в `werkstatt-shared`, но не объясняет, как этот хелпер будет синхронизирован с `canonicalPageUrl` из `werkstatt-site` без boundary violation. RFC должен либо: (a) перенести `localizeUrl` / canonical URL policy в `werkstatt-shared`, (b) объяснить, что `canonicalRootUrl` — это независимая реализация того же policy, или (c) описать другой механизм синхронизации.

**Finding C-2: `breadcrumbs.ts` не указан в file system responsibilities.** RFC строка 161 указывает `jsonld/breadcrumb.ts` как цель фикса для breadcrumb item URLs. Однако `jsonld/breadcrumb.ts` только разрешает relative URLs против `page.url` (строка 29 файла). Фактические crumb URLs (включая `homeUrl`) конструируются в `buildBreadcrumbTrail` в `packages/werkstatt-shared/src/share/semantic/breadcrumbs.ts` (строка 106) и передаются в `page.breadcrumbs`. Если `homeUrl` уже `/de/`, то `jsonld/breadcrumb.ts` корректно резолвит его в `https://site/de/`. Фикс должен быть в месте конструирования `homeUrl` (вызывающий код `buildBreadcrumbTrail`), а не в `jsonld/breadcrumb.ts`. RFC должен добавить `breadcrumbs.ts` или вызывающий код в таблицу file system responsibilities.

**Finding C-3: Compass sync не указан.** RFC вводит новые rule IDs `JSONLD-ENTITY-01..03`, но не упоминает обновление `docs/verification-plan.xml`. Соседние RFC (RFC-0906, RFC-0908) явно указывают `docs/verification-plan.xml` в file system responsibilities. RFC должен добавить его.

**Finding C-4: AGENTS.md updates не конкретизированы.** Acceptance criterion (строка 226) говорит "AGENTS.md updated where agent behavior rules changed", но не указывает, какие именно файлы: `packages/werkstatt-shared/AGENTS.md` должен документировать canonical entity URL policy, `packages/werkstatt-site/AGENTS.md` должен документировать новую команду.

## Axis D — Forward-only compliance

No issues. Фикс заменяет старое поведение напрямую, no compatibility shim, no dual-path, no legacy code paths maintained. Builder change и validator land atomically.

## Axis E — Agent-facing policy

**Finding E-1: `Person.url` (JSONLD-ENTITY-03) семантика не уточнена.** `person.profileUrl` (источник `Person.url` в `jsonld/person.ts:33`) — это authored field, который может быть внешним URL (LinkedIn, Twitter) или внутренним profile page URL. RFC строка 189 говорит "Person.url (when present) is non-canonical", но не различает external vs internal URLs. Канонизация внешнего URL (LinkedIn) будет ошибкой. RFC должен уточнить, что JSONLD-ENTITY-03 применяется только к same-origin URLs (internal profile pages), не к external profile URLs.

## Axis F — Pragmatism

**Finding F-1: `canonicalRootUrl` signature не принимает `lang`/`defaultLanguage`.** Предложенная сигнатура `canonicalRootUrl(baseUrl, trailingSlash)` (строка 138) не принимает language parameters. Для `Organization.url` и `WebSite.url` (site-wide entities) это корректно — root всегда unprefixed `/`. Но RFC должен явно указать, что breadcrumb home item всегда использует canonical root независимо от language текущей страницы, и что non-default language pages имеют breadcrumb home = `/` (не `/en/`), что соответствует RFC-0160.

**Finding F-2: Новый хелпер vs расширение существующего.** См. B-1 и C-1. Если `canonicalPageUrl` уже производит корректный root URL для `route: ""`, новый хелпер избыточен. RFC должен обосновать, почему расширение `canonicalPageUrl` или его subpath export в `werkstatt-shared` недостаточно.

## Axis G — Blind spots

**Finding G-1: Performance не оценён.** RFC не указывает стоимость сканирования `dist/client/**/*.html` для JSON-LD parsing. Соседние RFC (RFC-0906, RFC-0908) явно указывают "Performance impact is negligible" с обоснованием. RFC должен добавить оценку (тот же pattern, что `seo.structured-data.validate` — negligible).

**Finding G-2: False positive suppression during migration.** RFC строка 214 упоминает false positives на sites с intentional prefixed roots, но не описывает механизм suppression во время migration. Соседние RFC описывают escape hatch или warn-first rollout. RFC должен либо указать, что migration не требует suppression (fix atomic), либо описать механизм.

## Questions for the author

1. Как `canonicalRootUrl` в `werkstatt-shared` будет синхронизирован с `canonicalPageUrl` в `werkstatt-site` без нарушения пакетного граничного правила (`werkstatt-shared` MUST NOT import from `werkstatt-site`)?
2. Должен ли `homeUrl` в `buildBreadcrumbTrail` (`breadcrumbs.ts`) использовать canonical root `/` для всех языков, и должен ли `breadcrumbs.ts` быть добавлен в file system responsibilities?
3. JSONLD-ENTITY-03 для `Person.url`: применяется ли правило только к same-origin (internal) URLs, или также к external profile URLs (LinkedIn, Twitter)? Если только same-origin, как validator различает их?
