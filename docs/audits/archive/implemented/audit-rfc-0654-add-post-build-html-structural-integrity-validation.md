---
rfcId: RFC-0654
auditId: AUDIT-RFC-0654-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0654

## Вердикт: Needs revision

RFC хорошо структурирован, решает реальную проблему (удаление `<main>` regex-мутатором `stripGeneratedMarker`) и предлагает прагматичное решение. Однако есть несколько находок: `appsImpacted` указан неверно (`apps/*` вместо пустого значения), RFC не упоминает обновление `AGENTS.md` пакета, алгоритм не описывает stripping комментариев как шаг, а regex не соответствует заявлению об исключении self-closing тегов.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0654` проходит без нарушений.

## Ось A — Структурная полнота

- **A1: Алгоритм не упоминает stripping комментариев как шаг.** Раздел "Tag counting algorithm" (строки 148-154) описывает шаги 1-3 (подсчёт открывающих, закрывающих, сравнение), но не упоминает stripping HTML-комментариев перед подсчётом. Это противоречит разделу Risks (строка 221: "ignores content inside HTML comments by stripping comments before counting") и критерию приёмки 4 (строка 231). Алгоритм должен включать "Шаг 0: Strip HTML comments" для полноты.

## Ось B — Выравнивание DNA

No issues. `satisfies: [DNA-8, DNA-35]` — оба инварианта существуют в `docs/architecture-dna.md`. RFC объясняет, как именно защищает DNA-8 (структурная целостность `<main>` после мутаций) и усиливает DNA-35 (добавляет structural integrity check в build pipeline). Конфликтов с существующими DNA нет.

## Ось C — Экосистемная совместимость

- **C1: `appsImpacted` указан неверно.** Поле содержит `apps/*` (строка 50-51), но `build.post` pipeline выполняется для ВСЕХ сайтов — по конвенции `appsImpacted` должен быть пустым. Кроме того, `apps/*` directory retired (RFC-0381, DNA-1) — сайты теперь живут в `systems/` и материализуются в `missions/`. Следует оставить поле пустым.

- **C2: Отсутствует обновление `AGENTS.md`.** RFC не упоминает обновление `packages/os/site-kernel-checks/AGENTS.md` — в этом файле ведётся детальная таблица модулей ("What lives here"), и новый файл `src/dist-html-structure.ts` должен быть задокументирован там. Раздел "File system responsibilities" (строки 156-164) перечисляет файлы, но не упоминает AGENTS.md.

## Ось D — Forward-only compliance

No issues. Новый command, no compatibility shim, no legacy paths, no deprecation needed.

## Ось E — Agent-facing policy

No issues. Status gate корректный (нет self-authorizing language). Implementation notes ссылаются на RFC-0224 (accepted→implemented transition) и RFC-0334 (supersede escalation). Pure function + thin handler split соответствует паттерну RFC-0647.

## Ось F — Прагматизм

- **F1: Regex не соответствует заявлению об исключении self-closing тегов.** Алгоритм (строка 150) утверждает "not self-closing `<tag ... />`", но regex `<tag\b[^>]*>` (строка 154) не исключает self-closing: `[^>]*`匹配 ` /`, затем `>`匹配 `>`, поэтому `<tag />` считается как opening tag. В практике это не важно (valid HTML5 не содержит self-closing non-void элементов), но описание RFC не соответствует regex. Либо исправить regex (например `<tag\b[^>]*(?<!/)>`), либо убрать утверждение об исключении self-closing.

## Ось G — Слепые зоны

- **G1: False positives от tag-like строк в attribute values.** Regex `<tag\b[^>]*>` найдёт `<main>` внутри attribute value, например `<div data-content="<main>">` будет засчитан как opening `<main>` tag. Stripping комментариев не помогает — это не внутри комментария. В практике это крайне маловероятно, но раздел Risks не упоминает этот вектор ложных срабатываний.

- **G2: Duplicate tags проходят проверку.** Текущий алгоритм проверяет только равенство open/close count. Два `<main>` и два `</main>` пройдут проверку, хотя это невалидный HTML (на странице должен быть ровно один `<main>`). Это не является целью RFC (RFC нацелен на tag removal, не на tag duplication), но стоит явно отметить в nonGoals.

## Вопросы автору

1. Should `<html>` be included in the structural tags list? It's the root element — if a mutator removes it, the page is completely broken, but the current list skips it.
2. Should the command also detect duplicate structural tags (e.g., two `<main>` elements)? The current check only verifies open/close count equality — two opening and two closing tags would pass despite being invalid HTML.
3. What is the expected behavior for HTML files that are not full documents (e.g., partial HTML fragments in `dist/client/`)? Astro builds full pages, but if any tool writes a partial HTML file, the `<body>`/`<head>` balance check would fail. Should the command skip files that don't contain `<!DOCTYPE html>`?
