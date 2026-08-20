---
rfcId: RFC-0887
auditId: AUDIT-RFC-0887-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0887

## Вердикт: Needs revision

RFC содержит несколько серьёзных расхождений между кодовыми примерами и реальной архитектурой компонентов, а также пропускает обновления archetype YAML и `EvidenceSourceData` в `nachweis-list`. Эти находки должны быть исправлены до планирования реализации.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0887` проходит без нарушений.

## Ось A — Структурная полнота

1. **Пути к файлам не соответствуют реальной структуре.** Таблица "File system responsibilities" указывает `packages/werkstatt-site/src/domain/ui/nachweis-detail.astro`, но реальный путь — `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro`. То же для `nachweis-card` и `nachweis-list`. CSS путь указан как `nachweis-detail.css`, реальный файл — `nachweis-detail-component.css`.

2. **Кодовые примеры архитектурно некорректны.** RFC показывает `evidence: PbpEvidenceSource` как prop компонента (`nachweis-detail.astro`), но реальный компонент получает данные через `pageOverride` → `cast<NachweisDetailContent>()` — плоский контент, а не PBP-сущность. Компонент не имеет prop `evidence`. То же касается `nachweis-card.astro` — он получает `Astro.props as NachweisCardProps` (плоский интерфейс), а не `PbpEvidenceSource`. Кодовые примеры RFC не могут быть реализованы буквально.

3. **Неопределённые переменные в примерах.** В кодовых примерах используются `pdfUrl`, `canonicalItem.sha256`, `domain`, `captureDate` без определения логики их извлечения из полей сущности (`items[]`, `websiteScreenshot`, `websiteUrl`).

4. **Пропущены обновления archetype YAML.** Archetype-файлы (`nachweis-detail.yaml`, `nachweis-card.yaml`, `nachweis-list.yaml`) содержат `propsSchema` с Zod-формой. Новые поля (`display`, `websiteUrl`, `websiteScreenshot`) должны быть добавлены в эти схемы. RFC не упоминает этого. Текущие archetype-схемы используют `.passthrough()`, поэтому новые поля не сломают валидацию, но archetype должен документировать их для авторинга контента и инструментирования.

5. **Пропущено расширение `EvidenceSourceData` в `nachweis-list`.** `nachweis-list-component.astro` загружает записи через `getCollection("business-profile")` и использует внутренний интерфейс `EvidenceSourceData` (строки 117–151). Этот интерфейс необходимо расширить полями `display`, `websiteUrl`, `websiteScreenshot` для передачи в `NachweisCard`. RFC не упоминает этого.

6. **Раздел Decision** корректен — present tense, единое решение.

7. **CLI surface** корректен — нет новых команд.

8. **Acceptance criteria** в основном проверяемые, но критерий "Full detail page renders all three sections" требует запущенного сайта (E2E-тест).

## Ось B — Выравнивание DNA

1. **DNA-46 (Mission lifecycle)** — удовлетворение поверхностное. RFC утверждает "UI components are site-stack code deployed through missions", что верно для любого site-stack кода, а не специфично для этого RFC. RFC не объясняет, как он *защищает* или *расширя* DNA-46 — он просто потребляет данные, управляемые через missions.

2. **DNA-59 (Evidence preservation)** — удовлетворение слабое. RFC утверждает "Screenshot and PDF artifacts are served from R2 URLs stored in the entity fields", но компонент является потребителем R2 URL, а не энфорсером DNA-59. Никаких новых механизмов сохранения не вводится.

## Ось C — Экосистемное соответствие

1. **Границы пакетов** — корректны, все изменения в `packages/werkstatt-site/src/domain/ui/`.

2. **Pipeline placement** — корректен. RFC упоминает `image.delivery.validate` и `a11y.label-in-name.validate` как post-build проверки, что соответствует `SITES_CHECK_POSTBUILD_PIPELINE`.

3. **Compass sync** — не упомянут. Если RFC добавляет новые UI-секции, `docs/styling.xml` может потребовать синхронизации. RFC должен указать, какие Compass-документы затронуты.

4. **AGENTS.md обновления** — не упомянуты, вероятно не нужны (расширение компонентов, не новая команда).

5. **Cosmic naming** — без изменений (Kerberos, Nix, Hydra сохраняются). Корректно.

6. **Command lifecycle** — все buckets пусты, корректно для UI-only RFC.

## Ось D — Forward-only compliance

No issues. RFC не предлагает backward compatibility слои, не добавляет dual-path, расширяет существующие компоненты напрямую (amends RFC-0708).

## Ось E — Agent-facing policy

1. **Status gate** — корректен. RFC указывает "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

2. **Implementation notes** ссылаются на RFC-0224 (accepted→implemented) и `rfc.supersede.propose` — корректные governance-ссылки.

3. **Anti-fabrication** — RFC не утверждает, что контент будет "auto-generated". Корректно.

4. **Storage policy** — нет cookies, нет client-side persistence. Корректно.

5. **NEEDS CLARIFICATION markers** — не найдены.

## Ось F — Прагматизм

1. **Кодовые примеры не соответствуют реальной архитектуре props.** RFC показывает `evidence: PbpEvidenceSource` как prop, но компоненты используют плоские content-интерфейсы (`NachweisAttestationDetailContent`, `NachweisCardProps`). RFC должен описать реальный поток props: как `display`, `websiteUrl`, `websiteScreenshot` попадают в `pageOverride` → `NachweisDetailContent` и в `NachweisCardProps`. Без этого агент-реализатор не сможет следовать примерам буквально.

2. **Минимальная поверхность команд** — нет новых команд. Корректно.

3. **Существующие паттерны** — RFC расширяет существующие компоненты, не создаёт новые. Корректно.

4. **Scope discipline** — `packagesImpacted: [werkstatt-site]` корректен. `nonGoals` явные и осмысленные.

## Ось G — Слепые зоны

1. **i18n** — RFC использует английский текст в примерах ("Homepage capture", "Visit website"), но существующие компоненты используют хардкод немецких лейблов ("Sichtpass", "Quell-Hash (SHA-256)"). RFC не обсуждает локализацию новых лейблов секций и подписей. Существующий паттерн — хардкод DE, но RFC должен хотя бы признать это.

2. **Обновления archetype YAML** — полностью пропущены (см. Ось A, находка 4).

3. **Расширение `EvidenceSourceData` в `nachweis-list`** — полностью пропущено (см. Ось A, находка 5).

4. **Производительность `<object>` PDF на мобильных** — RFC упоминает `loading="lazy"` для скриншотов, но не обсуждает производительность встроенного PDF-просмотрщика `<object>` на мобильных устройствах. ADR-0057 упоминает это в "Evolution", но RFC не переносит это в риски.

5. **Privacy implications PDF embedding** — не обсуждены. PDF, встроенный через `<object>`, может содержать tracking-контент. RFC не упоминает этого.

6. **Migration path для существующего контента страниц** — не обсуждён. Хотя `.passthrough()` в archetype-схемах означает, что новые поля не сломают существующий контент, RFC должен задокументировать это.

## Вопросы автору

1. Как именно поля `display`, `websiteUrl`, `websiteScreenshot` попадут в плоские props компонентов (`NachweisAttestationDetailContent`, `NachweisCardProps`)? Покажите реальный поток данных от PBP-сущности через page block к компоненту, а не идеализированный `evidence: PbpEvidenceSource` prop.

2. Какие archetype YAML-файлы нужно обновить и какие `propsSchema` изменения требуются? Как `nachweis-list-component.astro` будет извлекать `display`/`websiteUrl`/`websiteScreenshot` из `getCollection("business-profile")` и передавать их в `NachweisCard`?

3. Как будут локализованы лейблы новых секций ("PDF-Dokument", "Website-Screenshot", "Website")? Существующие компоненты используют хардкод DE — будет ли сохранён этот паттерн или введён механизм i18n?
