---
rfcId: RFC-0760
auditId: AUDIT-RFC-0760-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0760

## Вердикт: Требует доработки

RFC содержит три структурных ошибки в примере `system.md` (невалидный `semanticType`, неверный формат `planets[]`, неверный формат `shell`), которые приведут к ошибкам валидации при реализации. Также отсутствует поле `locales: [uk]` для явного ограничения страницы украинским языком.

## Механическая валидация (rfc.validate)

**Pass** — `rfc.validate --id RFC-0760` проходит с нулевыми нарушениями. Механическая валидация проверяет формат frontmatter и секции markdown, но не содержимое примеров кода внутри RFC.

## Ось A — Структурная полнота

1. **Невалидный `semanticType: program-page`** — строка 126 RFC. Enum `semanticPageTypeSchema` в `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ontology/src/schemas/system/page-output.ts:25-37` содержит только: `home`, `about`, `projects`, `donationContact`, `openSource`, `content`, `article`, `person`, `participant`, `legal`, `collection`. Значения `program-page` нет. Ближайшее подходящее значение — `content`. Добавление нового значения требует отдельного RFC (закрытый enum).

2. **Неверный формат `planets[]`** — строки 130–153 RFC. В примере планеты указаны как строки (`hero`, `markdown`, ...), но схема в `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ontology/src/schemas/system/manifest.ts:223-236` требует объекты `{ cosmicPlanet: <PlanetName>, pin: <semver> }`. Существующие страницы в `system.md` используют правильный формат: `- cosmicPlanet: Phobos; pin: 1.0.0`.

3. **Неверный формат `shell`** — строки 154–156 RFC. Значение `shell: { background: default }` не соответствует схеме в `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/ontology/src/schemas/system/manifest.ts:205-216`, которая требует объект с полями `enabled`, `cosmicMoon`, `pin`, и опционально `props`. Если фон не нужен, `shell` следует опустить или указать `shell: { background: { enabled: false } }`.

## Ось B — Выравнивание DNA

- **DNA-17** корректно указан в `satisfies[]` и RFC body объясняет, как запись страницы соответствует manifest contract. Нет проблем.
- **DNA-24** и **DNA-25** упоминаются в architectural fit, но не в `satisfies[]` — это допустимо, поскольку RFC потребляет эти паттерны, а не реализует их.

## Ось C — Экосистемная совместимость

1. **Отсутствует `locales: [uk]`** — RFC-0097 предоставляет поле `locales` для явного ограничения страницы определёнными локалями. Хотя отсутствие `de` маршрута технически предотвращает генерацию DE-пути, поле `locales: [uk]` — это канонический механизм для UK-only страниц. Существующие страницы (impressum, datenschutz) используют `locales: [de, uk]` явно. Без `locales: [uk]` языковой переключатель и sitemap могут работать некорректно. См. `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/share/src/astro/routes/registry.ts:178-181` и `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/share/src/astro/routes/resolve.ts:80-82`.

2. **Устаревшая ссылка на миссию** — RFC ссылается на `missions/warpgogol-com-m000039/workpiece/` в таблице файловых responsibilities (строки 190–192), но текущая активная миссия — `warpgogol-com-m000040` (см. `@/home/syrokomskyi/projects/warpgogol/werkstatt/systems/registry.yaml:13`). Пути должны быть обновлены.

3. **Отсутствует `output.sitemap`** — все существующие страницы в `system.md` имеют блок `output.sitemap.lastmod`. Запись страницы в RFC не включает `output`, что приведёт к отсутствию lastmod в sitemap.

## Ось D — Forward-only compliance

Нет проблем. RFC чисто аддитивный — добавляет новую страницу, не меняет существующие.

## Ось E — Agent-facing policy

Нет проблем. Статус-гейт корректно соблюдён — RFC явно запрещает реализацию до принятия зависимостей (RFC-0757, 0758, 0759). Implementation notes ссылаются на правильные governance rules (RFC-0224, RFC-0330, RFC-0334). NEEDS CLARIFICATION маркеры не найдены.

## Ось F — Прагматизм

Нет проблем. RFC минимален — не предлагает новых команд, не затрагивает пакеты (`packagesImpacted: []`), только добавляет контентные файлы на сайт. Это правильный уровень для RFC добавления страницы.

## Ось G — Слепые зоны

1. **Хрупкость зависимости** — если RFC-0757, 0758 или 0759 изменят имена архетипов или схемы props до реализации этого RFC, block composition может потребовать корректировки. RFC упоминает зависимости в `related[]` и rollout, но не описывает процедуру адаптации.

2. **`parentPageId` не обсуждается** — для страницы с ~23 блоками о программе рекомендаций может иметь смысл вложить её в breadcrumb-иерархию под существующую страницу (например, `services` или `team`). RFC не рассматривает этот вопрос. Большинство существующих страниц не устанавливают `parentPageId`, так что это минорный пункт.

## Вопросы автору

1. Какое значение `semanticType` должно быть у страницы? `program-page` не существует в enum. Нужно ли использовать `content`, или требуется отдельный RFC для добавления `program-page` в `semanticPageTypeSchema`?
2. Почему `locales: [uk]` не указано в записи страницы? RFC-0097 предоставляет этот механизм именно для UK-only страниц — следует ли использовать его для явного ограничения?
3. Какой `cosmicMoon` и `pin` должны быть в `shell.background`, или фон должен быть отключён? Существующие страницы используют `cosmicMoon: Hermippe, pin: 1.0.0` — подходит ли это для новой страницы?
