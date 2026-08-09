---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: HEAD (uncommitted, session-scoped)
filesReviewed:
  - missions/warpgogol-com-m000040/workpiece/src/content/system.md
  - missions/warpgogol-com-m000040/workpiece/src/content/pages/de/vidpovidalni-rekomendatsiyi.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/how-it-works.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/what-70-eur-pays-for.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/openness-to-client.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/after-12-subscriptions.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/pilot-mandate.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/what-ms-does.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/pilot-evaluation.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/when-rate-rises.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/marginal-income.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/threshold-stability.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/full-ms-reward.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/if-results-decline.md
  - missions/warpgogol-com-m000040/workpiece/src/content/prose/de/vidpovidalni-rekomendatsiyi/public-verifiability.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-payment-timing.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-activation.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-price.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-transparency.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-consent.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-pilot-auto-open.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-rate-auto-rise.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-threshold-rationale.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-70eur-persistence.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-market-cell-changes.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-pilot-end.md
  - missions/warpgogol-com-m000040/workpiece/src/content/faq/de/rec-earned-premiums.md
---

# Рецензия кода: перевод UK→DE страницы vidpovidalni-rekomendatsiyi (миссия warpgogol-com-m000040)

### Вердикт: Approved

Перевод выполнен в соответствии с руководством `docs/translate/2026-07-28-uk-de-after-rebuild.md`. Все 27 файлов созданы корректно, структура блоков полностью совпадает с UK-источником, запрещённых формулировок не обнаружено, кириллических символов в DE-файлах нет. Страница рендерится на dev-сервере (HTTP 200).

### Механическая проверка

**Pass.** Dev-сервер возвращает HTTP 200 для `/vidpovidalni-rekomendatsiyi`. Все ключевые DE-строки (заголовки, prose, FAQ-вопросы, CTA-метки) присутствуют в выводимом HTML. Проверка через `curl` + `grep` подтвердила 8 из 8 prose-заголовков, 11 из 12 FAQ-вопросов и все основные UI-строки.

### Ось A — Структурная корректность

**No issues.**

- Количество блоков в DE-странице: 30 (совпадает с UK). Все `id` и `type` блоков идентичны UK-источнику (проверено через `grep -oP` + `sort`).
- Все 13 prose-файлов созданы с корректным frontmatter (`kind: prose`, `lang: de`).
- Все 12 FAQ-файлов созданы с корректным frontmatter (`slug`, `question`, `answer`, `order`, `tags`, `orderTags`). Порядковые номера 1–12 совпадают с UK.
- Все `contentRef` пути используют language-neutral формат `prose/vidpovidalni-rekomendatsiyi/<file>` — система определяет язык по пути файла.
- Все `{price:...}` и `{amount:...}` ссылки сохранены без изменений.
- Удаление `locales: [uk]` из `system.md` обосновано добавлением `de`-маршрута — поле `locales` больше не нужно, так как страница доступна на обоих языках. Это соответствует паттерну других страниц с `de` и `uk` маршрутами (например, `leistungen`, `preis`, `kontakt`).

### Ось B — Соответствие DNA

**No issues.**

- **DNA-4** (Canonical content in `src/content/`): весь контент размещён в `src/content/` ✓
- **DNA-5** (Component ↔ content ↔ schema mirror): DE-страница использует существующие block types (`hero-decision-card`, `price-card`, `markdown`, `controlled-responsibility-block`, `audience-cards`, `dynamic-status-block`, `send-message`, `faq-list`, `final-cta`, `service-metadata-block`) — все имеют схемы в `packages/*` ✓
- **DNA-24** (Block-declarative pages): используется `type:` синтаксис, не `use: PlanetName` ✓
- **DNA-39** (Route registry): маршрут зарегистрирован в `system.md` с обоими маршрутами `de` и `uk` ✓

### Ось C — Экосистема

**No issues.**

- `pageId: vidpovidalniRekomendatsiyi` и `cosmicStar: Vega` совпадают с записью в `system.md` ✓
- Навигация: `vidpovidalniRekomendatsiyi` уже присутствует в `header.navIds` и `footer.navIds` в `src/content/site/de/labels.md` ✓
- `routeSlug: vidpovidalni-rekomendatsiyi` в `navigation/de/navigation.md` совпадает с UK ✓
- FAQ-тег `vidpovidalni-rekomendatsiyi` в DE-странице совпадает с тегом в DE FAQ-файлах ✓

### Ось D — Forward-only compliance

**No issues.**

- Нет compatibility-шимов или dual-paths ✓
- Удаление `locales: [uk]` — прямое изменение, не параллельный путь ✓
- DE-контент — новый, не заменяет и не дублирует UK ✓

### Ось E — Понятность для агентов

**No issues.**

- Файловая структура следует существующим паттернам (`pages/{lang}/`, `prose/{lang}/`, `faq/{lang}/`) ✓
- Контент — перевод существующего UK-источника, не фабрикация ✓
- Все canonical names сохранены: `Warpgogol`, `Digitales Fundament` ✓

### Ось F — Прагматизм

**No issues.**

- Создано ровно столько файлов, сколько нужно: 1 page + 13 prose + 12 FAQ = 26 новых файлов + 1 изменение в `system.md` ✓
- DE-страница следует той же структуре, что и UK-источник и другие DE-страницы ✓
- Нет scope creep — изменения касаются только страницы `vidpovidalni-rekomendatsiyi` ✓

### Ось G — Слепые зоны

**No issues.**

- Формы используют тот же endpoint `/api/send-message` и `fallbackEmail: hi@warpgogol.com` что и UK-версия — нет новой коллекции данных ✓
- `minMessageLength` (24 и 48) идентичны UK ✓
- `effectiveDate` и `nextReviewDate` в service-metadata блоке идентичны UK ✓
- `value: 1` в dynamic-status-block идентичен UK ✓

### Соответствие спецификации

| Требование из руководства | Статус | Evidence |
| --- | --- | --- |
| Форма обращения Sie/Ihnen/Ihr | Done | Все тексты используют Sie-форму |
| Canonical names не переводить | Done | Warpgogol, Digitales Fundament сохранены |
| Запрещённые формулировки отсутствуют | Done | grep по "garantiert\|rechtssicher\|Lock-in\|DSGVO-konform" — нет абсолютных гарантий |
| Сохранение силы утверждений | Done | "може" → "kann", "повинен" → "muss", "не обіцяє" → "verspricht nicht" |
| Terminology: Betrieb, Website, Kunde | Done | "бізнес" → "Betrieb", "сайт" → "Website", "Клієнт" → "Kunde" |
| Семантическая полнота (блок-за-блоком) | Done | 30/30 блоков, 13/13 prose, 12/12 FAQ |
| Нет украинских строк в DE | Done | grep по кириллице — 0 совпадений |
| contentRef пути language-neutral | Done | `prose/vidpovidalni-rekomendatsiyi/<file>` |
| FAQ тег совпадает | Done | `vidpovidalni-rekomendatsiyi` везде |
| Регистрация маршрута в system.md | Done | `de: vidpovidalni-rekomendatsiyi` добавлен |

### Вопросы автору

1. **"Markt-Steward" vs "Marktsteward"**: выбран вариант с дефисом для читаемости (английское заимствование "Steward"). Нужно ли стандартизировать как одно слово?
2. **"Vollmandate" vs "vollständiges Mandat"**: в subheading блока open-mandates использовано "Vollmandate" (композит), в заголовках блоков — "vollständiges Mandat" (прилагательное + существительное). Оба варианта корректны, но стоит ли стандартизировать?
3. **"Nach dem Pilot"**: "Pilot" использовано как средний род (das Pilot = пилотный проект), что принято в деловом немецком. Нужно ли заменить на "Nach dem Pilotmandat" для большей ясности?
