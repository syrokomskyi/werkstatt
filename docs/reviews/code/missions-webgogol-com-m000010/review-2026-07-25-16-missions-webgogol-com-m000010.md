---
reviewId: REVIEW-CODE-2026-07-25-01
date: 2026-07-25
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 19735b1~1...19735b1
filesReviewed:
  - missions/webgogol-com-m000010/workpiece/src/content/pages/uk/home.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-first-year.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-monthly-included.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-process.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-existing-domain.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-existing-website.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-texts-pages.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-monthly-changes.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-go-live.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-availability.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-notausgang-meaning.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-guarantees.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-baukasten.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-kuendigung.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-vertrag.md
  - missions/webgogol-com-m000010/workpiece/src/content/faq/uk/df-wer-dahinter.md
---

# Code Review: 19735b1~1...19735b1 (UK home page + FAQ)

### Verdict: Needs revision

Механический этаж проходит (page.block.validate, faq.validate, content.links.validate — все OK). Однако обнаружены два структурных отклонения от экспертных рекомендаций и несколько содержательных пробелов, которые требуют исправления.

### Mechanical floor

**Pass** — `page.block.validate: OK`, `faq.validate: OK — 46 FAQ entries`, `content.links.validate: OK`. YAML frontmatter валиден, все 13 block types — зарегистрированные архетипы, все 16 FAQ файлов валидны с тегом `digitales-fundament`.

### Axis A — Structural correctness

- **`decisionCard.effects` вместо `decisionCard.glass`**: в `hero-decision-card.yaml` схема определяет `decisionCard.glass` (Zod object), но контент использует `decisionCard.effects` (массив effect stacks). `page.block.validate` прошёл, но это расхождение между схемой архетипа и фактическим контентом. Не блокирующее, но требует внимания.
- **`secondaryCta.target: "#price"`**: строка-якорь. Архетип определяет `target: z.string().min(1)` — проходит. Но `content.links.validate` проверяет якоря через реестр анкоров. `anchorId: price` объявлен на блоке `price` — корректно.
- Остальное: без замечаний.

### Axis B — DNA alignment

- **DNA-24** (block-declarative pages) — PASS: страница frontmatter-only, markdown body отсутствует.
- **DNA-4** (canonical content) — PASS: все цены через PBP references (`{business-profile.offerings/...}`), нет хардкода бизнес-данных.
- **DNA-8** (page → section → component → content) — PASS: все 13 блоков — зарегистрированные секции.
- **DNA-23** (cosmic naming) — N/A: cosmic names не изменялись.
- **DNA-6** (kebab-case) — PASS: все новые FAQ файлы используют kebab-case.

### Axis C — Ecosystem fit

- **Package boundaries** — PASS: изменения только в content-файлах workpiece, нет imports.
- **Compass sync** — N/A: изменения не затрагивают repository-wide requirements.
- **AGENTS.md** — N/A: новые правила не вводятся.

### Axis D — Forward-only compliance

- PASS: нет compatibility shims, нет legacy paths. Удалён блок `audience-cards` — чисто, без dual-path.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — N/A: content-файлы (markdown frontmatter), не source code.
- **Anti-fabrication** — PASS: нет вымышленных отзывов, клиентов, кейсов. PBP references используются для всех цен. Сравнение с автостраховкой явно не обещает конкретных результатов.

### Axis F — Pragmatism

- **Существующие архетипы** — PASS: использованы только существующие архетипы (`hero-decision-card`, `trust-strip`, `video-section`, `approach`, `price-card`, `comparison-cards`, `impact`, `ownership-block`, `notausgang-block`, `controlled-responsibility-block`, `people`, `faq-list`, `final-cta`). Новых архетипов не создано.
- **Scope discipline** — PASS: изменения только в UK home page и UK FAQ файлах.

### Axis G — Blind spots

- **Edge cases** — PASS: `warum-abonnement.md` имеет теги `subscription`/`pricing`, не `digitales-fundament` — корректно исключён из FAQ главной.
- **Performance** — N/A: content-only changes.

### Spec compliance

| Требование эксперта | Статус | Evidence |
| --- | --- | --- |
| Блок 1: Hero — буквально назвать продукт (Firmenwebsite) | Done | `heading: "Фірмовий сайт із будівництвом, публікацією та супроводом"` |
| Блок 1: CTA → "Unverbindliche Anfrage starten" | Done | `label: "Почати необов'язковий запит"` |
| Блок 1: Цена в decision card | Done | 3 PBP refs в `decisionCard.items` |
| Блок 1: Secondary CTA → "Preis und Leistungsumfang ansehen" | **Partial** | `label: "Переглянути ціну"` — отсутствует "Leistungsumfang" (обсяг) |
| Блок 2: Конкретный состав продукта (7 пунктов) | **Partial** | `trust-strip` имеет 3 item вместо 7 (Firmenwebsite, Domain, Aufbau/Betrieb, Betreuung, Struktur, Auswertung, Ausstieg) |
| Блок 3: Наглядный пример результата | Done | `promo` (video-section) сохранён |
| Блок 4: Процесс из 3 шагов | **Partial** | `approach` имеет 5 шагов вместо предпочтительных 3 |
| Блок 5: Цена + стоимость первого года | **Partial** | `price-card` не показывает расчёт первого года (200€ + 12×70€ = 1040€ / 200€ + 700€ = 900€) |
| Блок 6: Baukasten comparison | Done | `comparison-cards` сохранён, перемещён после цены |
| Блок 7: Сравнение с автостраховкой (отдельный блок) | **Partial** | Объединено с 99% в один `impact` блок. Эксперт хотел автостраховку как блок 7 и 99% как блок 9 (после ownership/notausgang) |
| Блок 8: Ownership и Notausgang | Done | Разделены на два блока (ownership + notausgang) — приемлемая адаптация |
| Блок 9: 99% доступность | **Partial** | Объединена с автостраховкой в `impact` (блок 7), а не отдельный блок 9 |
| Блок 10: Ответственность и доказательства (founder) | **Partial** | `controlled-responsibility-block` (блок 10) и `people` (блок 11) — **порядок обращён**: эксперт хотел founder (10) → promise limitations (11) |
| Блок 11: Ограничения обещаний | **Partial** | См. выше — порядок обращён |
| Блок 12: FAQ в порядке покупательской важности | Done | 16 FAQ файлов, order 1-16, точно соответствует списку эксперта |
| Удалить внутреннюю стратегию второй отрасли | Done | `audience-cards` блок удалён |
| 99% сохранено | Done | `impact` блок: `value: "99%"` |
| Сравнение с автостраховкой сохранено | Done | `impact` блок: `label: "Річна вартість супроводу — приблизно як автостраховка службового авто"` |
| PBP references сохранены | Done | 6 ссылок на `business-profile.offerings/digital-foundation.presentation.price.*` |
| Title буквально называет продукт | Done | `title: "Фірмовий сайт для ремесла \| Webgogol"` |
| Нет вымышленных доказательств | Done | — |
| Generated routes не редактировались | Done | — |

### Questions for the author

1. **Порядок founder/responsibility**: Эксперт хотел персональный блок основателя (block 10) перед блоком ограничений обещаний (block 11). Сейчас порядок обращён: responsibility → founder. Это намеренно или нужно поменять местами?

2. **Trust-strip — 3 vs 7 пунктов**: Эксперт детально перечислил 7 элементов состава продукта (Firmenwebsite, Domain, Aufbau/Betrieb, Betreuung, Struktur, Auswertung, Ausstieg). `trust-strip` archetype ограничен 3-5 items. Нужно ли расширить до 5 пунктов или использовать другой archetype (например, `approach` с cards) для блока состава?

3. **Первый год — расчёт стоимости**: Эксперт явно просил показать стоимость первого года (1040€ monthly / 900€ yearly). `price-card` archetype не имеет поля для этого. Нужно ли добавить это в `includes` как текстовую строку, или это требует расширения archetype?

4. **Secondary CTA label**: "Переглянути ціну" vs "Переглянути ціну та обсяг" — нужно ли добавить "та обсяг" для соответствия "Preis und Leistungsumfang"?

5. **Auto insurance + 99% — один блок или два**: Эксперт хотел автостраховку (блок 7) и 99% (блок 9) как отдельные смысловые блоки с ownership/notausgang между ними. Сейчас оба в одном `impact` блоке. Разделить ли на два блока?
