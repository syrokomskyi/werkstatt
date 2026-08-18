# Мы внесли изменения на сайт и сейчас внедряем на сайт систему доказательств.

Ознакомимся с ней (вложение). В каком виде, после каких секций эта система должна появится на сайте современной надёжной инженерной студии warpgogol.com ? Как это показывать Посетителям действительно (реально, а не псевдо) профессионально?

---

## Вывод

На warpgogol.com это должна быть **не секция отзывов**, не карусель логотипов и не набор зелёных значков `verifiziert`.

Публичная форма системы — **Nachweisregister**, то есть управляемый реестр конкретных подтверждённых утверждений:

* кто и что подтвердил;
* к какому проекту относится подтверждение;
* на каком источнике оно основано;
* какая версия опубликована;
* что именно проверила Warpgogol;
* чего Warpgogol не проверяла;
* действует ли разрешение на публикацию;
* где посмотреть технический Sichtpass.

Ценность продукта состоит не в карточке, а в сопровождении происхождения, согласия, версий, публикации, обновления и отзыва. Подпись Warpgogol может подтверждать процедуру и неизменность версии, но не независимую истинность клиентской оценки. 

---

# 1. Где разместить систему

## Главная страница

**Точное место: сразу после нынешней секции 03 — `Wie das Ergebnis aussieht – ein Beispiel` — и до секции `Wie die Zusammenarbeit beginnt`.**

Сейчас главная сначала показывает предложение, видео и демонстрационный пример, а затем переходит к процессу сотрудничества. ([Warpgogol][1])

Правильная логика:

1. Что вы предлагаете.
2. Как это выглядит.
3. Демонстрационный пример.
4. **Что уже подтверждено реальными заказчиками.**
5. Как начинается сотрудничество.
6. Владение, цена, обязательства, ответственность и Notausgang.

Именно такое место предлагает и сама спецификация: после демонстрации результата, но до процесса и цены. 

### Новый порядок главной

```text
01 Was Sie konkret erhalten
02 Erklärung / Video
03 Wie das Ergebnis aussieht – ein Beispiel
04 Nachweise aus realen Projekten
05 Wie die Zusammenarbeit beginnt
06 Eigentum statt gemieteter Präsenz
...
```

## Отдельные маршруты

| Маршрут                            | Что показывать                                  | Где                                                       |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `/`                                | 1–3 компактных опубликованных Nachweise         | после демонстрационного проекта                           |
| `/nachweise/`                      | полный реестр                                   | самостоятельная страница                                  |
| `/nachweise/[slug]/`               | полная человекочитаемая запись                  | самостоятельная detail page                               |
| `/nachweise/verify/[version]/`     | Sichtpass, хэши, timestamp, версия              | техническая проверка                                      |
| `/leistungen/digitales-fundament/` | один релевантный проектный Nachweis             | после `Phasen der Zusammenarbeit`, до договорных гарантий |
| `/leistungen/`                     | описание Nachweisregister как модуля            | внутри Wachstumsmodule                                    |
| `/team/andrii-syrokomskyi/`        | подтверждённые проектные вклады                 | после обязанностей и опыта                                |
| `/preis/`                          | только спокойная ссылка на реестр               | не вставлять отзыв рядом с ценой                          |
| `/notausgang/`                     | только будущие доказательства реальной передачи | после `Ausstiegsprozess`, когда такой случай существует   |
| `/website/**`                      | максимум один контекстно релевантный Nachweis   | после описания результата, до итогового CTA               |
| Footer → Transparenz               | постоянная ссылка `Nachweise`                   | рядом с Open Source и Bildnachweise                       |

Спецификация уже предусматривает индекс, detail page, verify page, machine-readable status и контекстные проекции на страницах услуг. 

---

# 2. Как должна выглядеть секция на главной

## Заголовок

Не:

> Kundenstimmen
> Das sagen unsere Kunden
> 100 % verifizierte Bewertungen

Лучше:

> **Nachweise aus realen Projekten**

Подзаголовок:

> **Nicht nur behauptet. Nachvollziehbar dokumentiert.**

Вводный текст:

> Warpgogol veröffentlicht keine anonymen Sterne. Jeder Nachweis beruht auf einer freigegebenen Quelle, einer dokumentierten Version und klar benannten Grenzen der Prüfung.

Это сразу объясняет отличие от обычных отзывов, не изображая независимый аудит.

## Композиция

Не карусель. Спецификация прямо требует доступное семантическое представление без карусели. 

Лучший формат:

* одна широкая карточка, когда опубликован первый Nachweis;
* сетка из двух карточек, когда их два;
* три карточки максимум на главной;
* кнопка `Alle Nachweise ansehen`;
* остальные записи — только в `/nachweise/`.

Профессионализм здесь создаёт не количество карточек, а глубина каждой записи.

---

# 3. Анатомия публичной карточки

Карточка должна отвечать на семь вопросов.

## 3.1. Кто подтверждает

```text
Nicaragua-Projekt e. V.
Vereinswebsite · nicaragua-projekt.org
```

Имя, должность и логотип показываются только в рамках явного consent.

## 3.2. Что именно подтверждено

Главное место карточки занимает не похвала, а **подтверждённый объём работы**:

> Nicaragua-Projekt e. V. bestätigt, dass Andrii Syrokomskyi die Internetpräsenz konzipiert, gestaltet, technisch umgesetzt und in Betrieb genommen hat.

Это сильнее обычного «мы очень довольны», потому что посетитель понимает, какая работа действительно была выполнена.

Порядок карточки по спецификации:

1. подтверждённый результат или scope;
2. контекст и ограничения;
3. точная цитата;
4. кто сделал утверждение;
5. что проверила Warpgogol;
6. что не проверялось;
7. статус и Sichtpass. 

## 3.3. Цитата

Цитата вторична по отношению к подтверждённому scope:

> „Klare Abstimmung. Saubere Umsetzung. Verlässliche Betreuung.“

Не нужно выносить её огромным шрифтом как рекламный слоган. Это часть доказательной записи, а не баннер.

## 3.4. Статус источника

В правой части карточки:

```text
Vom Auftraggeber bestätigt
Quelle: unterzeichnete Bescheinigung
Stand: 03.08.2026
Veröffentlichung freigegeben
Version: 1.0
```

Не писать одно неопределённое слово `Verifiziert`.

## 3.5. Что проверено

```text
Warpgogol hat dokumentiert:

– Herkunft des Quelldokuments
– Freigabe für diese Veröffentlichung
– veröffentlichte Version
– Unverändertheit seit der Zeitstempelung
```

Допустимые формулировки спецификации:

* `Vom Auftraggeber bestätigt`;
* `Dokumentherkunft technisch dokumentiert`;
* `Unverändert seit der Zeitstempelung`;
* `Verfahren dokumentiert durch Warpgogol`;
* `Keine unabhängige Inhaltsprüfung`. 

## 3.6. Что не проверено

Это должно находиться **в самой карточке**, а не в юридической сноске:

> Keine unabhängige Qualitätsprüfung. Keine messbaren KPI im Quelldokument. Keine Garantie künftiger Ergebnisse.

N3 не доказывает истинность оценки, подлинность рукописного росчерка, качество работы или причинную связь с бизнес-результатом. 

## 3.7. Два действия

Основная кнопка:

> `Nachweis ansehen`

Вторичная:

> `Sichtpass prüfen`

Не писать:

* `Zertifikat öffnen`;
* `100 % verifiziert`;
* `Echtheit garantiert`.

---

# 4. Визуальная модель карточки

На desktop:

```text
┌────────────────────────────────────────────────────────────┐
│ PROJEKTNACHWEIS                         VERÖFFENTLICHT      │
│                                                            │
│ Nicaragua-Projekt e. V.               Quelle               │
│ Vereinswebsite                         Bescheinigung        │
│                                                            │
│ Bestätigter Leistungsumfang            Stand               │
│ Konzeption, Gestaltung, technische     03.08.2026          │
│ Umsetzung und Inbetriebnahme                                │
│                                         Nachweisstufe       │
│ „Kurze Originalaussage …“              N3                  │
│                                                            │
│ Was geprüft wurde / Was nicht geprüft wurde                │
│                                                            │
│ [Nachweis ansehen]  [Sichtpass prüfen]                     │
└────────────────────────────────────────────────────────────┘
```

## Визуальный характер

Подходит:

* спокойный светлый фон;
* тонкая инженерная рамка;
* строгая типографика;
* маленькие оранжевые маркеры состояния;
* моноширинный шрифт только для version ID, hash и timestamp;
* чёткая сетка;
* достаточно свободного пространства;
* статус выражен текстом, а не только цветом.

Не подходит:

* золотые звёзды;
* крупные кавычки как в testimonial carousel;
* зелёный щит с галочкой;
* печать `CERTIFIED`;
* псевдогосударственный герб;
* объёмная сургучная печать;
* анимация блокчейна;
* поток бегущих хэшей;
* логотип клиента крупнее содержания;
* портрет автора вместо предмета подтверждения.

**Nachweisregister должен визуально напоминать хорошо оформленный технический реестр, а не Trustpilot и не криптовалютный сервис.**

---

# 5. Полная страница `/nachweise/[slug]/`

Рекомендуемая структура:

## 1. Заголовок записи

```text
Projektnachweis
Nicaragua-Projekt e. V.
Konzeption, Gestaltung und technische Umsetzung der Vereinswebsite
```

Рядом:

```text
Veröffentlicht
N3
Version 1.0
Stand 17.08.2026
```

## 2. Bestätigter Umfang

Самое важное утверждение простым немецким языком.

## 3. Kontext

* тип предприятия;
* предмет проекта;
* URL;
* launch status;
* период работы;
* роль Warpgogol.

## 4. Aussage des Auftraggebers

Точная цитата на языке оригинала.

Перевод — отдельно и с маркировкой:

```text
Deutsche Übersetzung
Vom Auftraggeber freigegeben am …
```

Изменение перевода должно создавать новую версию.

## 5. Grundlage des Nachweises

```text
Quelldokument:
Unterzeichnete Bescheinigung vom 03.08.2026

Öffentliche Fassung:
Redigierte PDF-Version

Nicht öffentlich:
Originalunterschrift, Bankdaten und interne Kontaktdaten
```

HTML transcript должен быть основным доступным представлением; редактированный PDF — вторичным. Оригинал, подпись, IBAN/BIC и закрытые данные не публикуются. 

## 6. Was Warpgogol geprüft hat

Отдельный блок.

## 7. Was nicht geprüft wurde

Блок той же визуальной значимости, не мелкий текст внизу.

## 8. Version und Status

* record ID;
* version ID;
* дата публикации;
* время timestamp;
* status;
* dispute state;
* revocation state.

## 9. Dokumente

* доступный HTML transcript;
* redacted PDF;
* consent scope — только краткое публичное описание, не сам закрытый consent;
* machine-readable JSON.

## 10. Sichtpass

Краткая человекочитаемая сводка и ссылка на техническую проверку.

---

# 6. Страница `/nachweise/verify/[version]/`

Это не страница для продажи. Это инструмент проверки.

Сначала показывать человеческое объяснение:

> Diese Prüfung bestätigt, dass die angegebene veröffentlichte Version seit der dokumentierten Zeitstempelung nicht unbemerkt verändert wurde. Sie bestätigt nicht die inhaltliche Wahrheit der Aussage.

Затем технические данные:

* record ID;
* version ID;
* public derivative SHA-256;
* record payload SHA-256;
* envelope SHA-256;
* Warpgogol key ID;
* QTSP;
* timestamp;
* результат локальной проверки token;
* текущий publication status;
* dispute или revocation state.

Технические детали следует помещать в раскрываемый блок:

> `Technische Prüfdaten anzeigen`

Не нужно заставлять обычного владельца Handwerksbetrieb начинать знакомство с SHA-256.

---

# 7. Как встроить доказательства в другие страницы

## Digitales Fundament

На странице сейчас есть блок `Phasen der Zusammenarbeit`, после которого начинаются конкретные письменные обязательства. ([Warpgogol][2])

Именно между ними поставить один contextual proof:

> **So wurde ein reales Projekt bestätigt**

Показывать только те claims, которые действительно относятся к процессу:

* Konzept;
* Gestaltung;
* technische Umsetzung;
* Inbetriebnahme;
* laufende Betreuung — только если это указано в источнике.

Не использовать клиентское письмо как доказательство SLA, сроков или доступности, если источник этого не подтверждает.

## Leistungen

Текущий модуль `Vertrauen aufbauen` описан как блок отзывов и модерации. ([Warpgogol][3])

Его следует переработать:

### Было

> Bewertungsblock mit Moderation

### Лучше

> **Nachweise dokumentieren und veröffentlichen**

> Freigegebene Kundenstimmen, Projektnachweise und Referenzdokumente werden mit Quelle, Version, Veröffentlichungsumfang und nachvollziehbarem Status verwaltet.

CTA:

> `Nachweisregister ansehen`

Это подчёркивает, что клиент платит за сопровождаемый жизненный цикл, а не за декоративный badge.

## Team

После профиля ответственного человека добавить:

> **Dokumentierte Projektbeiträge**

И показывать не общую самопрезентацию, а ссылки:

```text
Nicaragua-Projekt e. V.
Konzeption, Gestaltung, technische Umsetzung und Inbetriebnahme
Vom Auftraggeber bestätigt
```

Текущая Team-страница уже строится вокруг видимой ответственности, поэтому проектные Nachweise логично продолжают эту модель. ([Warpgogol][4])

## Preis

Не ставить клиентскую цитату:

* между ценовыми вариантами;
* возле кнопки покупки;
* как доказательство «выгодности».

Это выглядело бы как классический social-proof pressure.

Допустим только спокойный блок после описания состава Betreuung:

> Sie möchten sehen, wie ausgeführte Arbeiten dokumentiert werden?
> `Zu den Projektnachweisen`

## Notausgang

Не использовать существующие письма как доказательство Notausgang.

Они подтверждают разработку проектов, но не реальную передачу после расторжения.

На этой странице позднее можно показывать отдельный тип записи:

> `Übergabenachweis`

Только после настоящего exit drill или реальной передачи:

* что было передано;
* когда;
* какие checksums получены;
* подтвердил ли клиент приём;
* какие данные удалены;
* какие ограничения остались.

---

# 8. Navigation и Footer

## Footer

В раздел `TRANSPARENZ`, где сейчас находятся Barrierefreiheit, Open Source и Bildnachweise, добавить:

```text
Nachweise
Barrierefreiheit
Open Source
Bildnachweise
```

Текущая структура футера уже имеет отдельный прозрачностный контур, поэтому это естественное постоянное место ссылки. ([Warpgogol][1])

## Главное меню

До появления первой публичной записи — не добавлять.

После первого N3:

* ссылка внутри `Mehr`;
* ссылка с главной;
* ссылка в footer.

После трёх опубликованных записей:

* можно вынести `Nachweise` в основную навигацию.

Спецификация прямо устанавливает три опубликованные записи как минимальный порог собственной устойчивой эксплуатации перед развитием продукта дальше. 

---

# 9. Что делать до появления первого N3

По состоянию спецификации на 5 августа 2026 года ни Nicaragua-Projekt, ни Style Expert, ни «Крила України» ещё не готовы к публичному статусу `published`. 

Пока gate не пройден:

* не показывать названия;
* не показывать логотипы;
* не показывать цитаты;
* не показывать имена;
* не показывать карточки со статусом `in Arbeit`;
* не делать полупрозрачные teaser-карточки.

Публично допустима только нейтральная фраза:

> Weitere Nachweise werden derzeit vorbereitet.

Но я бы **не создавал на главной большую пустую секцию**. До первого N3 лучше подготовить маршруты и интерфейс скрыто, а секцию включить одновременно с первой полноценной записью.

Спецификация отдельно запрещает публично показывать клиентские карточки «в работе» до согласия. 

---

# 10. Что изменить на нынешней главной

Сейчас сразу после заголовка `Was Sie konkret erhalten` размещён крупный блок метаданных о создании promo video: авторы, VEO, prompt/workflow, reviewer, права и источник. ([Warpgogol][1])

Это полезный **Bildnachweis**, но он не должен визуально конкурировать с клиентскими Projektnachweise.

Рекомендация:

* оставить под видео короткую строку `Bild- und Produktionsnachweis`;
* подробности убрать в `<details>`;
* полную запись оставить на `/bildnachweise/`;
* Nachweisregister оформить совершенно другим компонентом.

Иначе посетитель не поймёт разницу между:

* происхождением иллюстрации;
* подтверждением клиента;
* технической проверкой версии;
* независимой проверкой качества.

---

# 11. Один обязательный предварительный аудит

До публичного запуска Nachweisregister нужно ещё раз проверить все договорные claims сайта.

Например, текущая публичная Preis-страница говорит, что неиспользованная часть годовой оплаты возвращается пропорционально. ([Warpgogol][5])

Это расходится с ранее принятым решением корпуса об отсутствии pro-rata возврата. Появление доказательного реестра сделает подобные противоречия заметнее и опаснее: студия не может профессионально доказывать происхождение клиентского письма и одновременно показывать разные договорные условия на разных уровнях сайта.

---

## Финальная модель

Профессиональная система выглядит так:

```text
Homepage
└── 1–3 компактных Projektnachweise
    └── Nachweis detail
        ├── подтверждённый scope
        ├── точная цитата
        ├── источник
        ├── consent scope
        ├── что проверено
        ├── что не проверено
        ├── redacted PDF / transcript
        └── Sichtpass
            ├── version
            ├── hashes
            ├── signature
            ├── qualified timestamp
            └── current status
```

Главный критерий:

> Посетитель должен понять доказательство без знания криптографии, а специалист должен иметь возможность проверить его технически.

И ещё важнее:

> Ограничения доказательства должны быть так же видимы, как само положительное утверждение.

[1]: https://warpgogol.com/ "Firmenwebsite für Handwerk und lokales Gewerbe | Warpgogol"
[2]: https://warpgogol.com/leistungen/digitales-fundament "Digitales Fundament - das Produkt"
[3]: https://warpgogol.com/leistungen "Firmenwebsite, Betreuung und Wachstumsmodule | Warpgogol"
[4]: https://warpgogol.com/team "Wer bei Warpgogol Verantwortung trägt"
[5]: https://warpgogol.com/preis "Offener Preis"
