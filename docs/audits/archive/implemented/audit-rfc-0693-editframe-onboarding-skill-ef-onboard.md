---
rfcId: RFC-0693
auditId: AUDIT-RFC-0693-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0693

## Verdict: Needs revision

RFC-0693 добавляет третий forge-level skill `ef-onboard` для Editframe-проектов — концепция верна и заполняет реальный пробел (prerequisites → discovery → scaffold). Однако предлагаемый frontmatter skill'а содержит две критические ошибки схемы (невалидный `category: ef` и отсутствующий `languagePolicy`), путь к файлу не соответствует фактической структуре каталогов forge, а шаг 4 (установка Editframe skills через temp-директорию) предполагает CLI-флаги, существование которых не подтверждено.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1 (критическое, строка 103):** Предлагаемый `category: ef` невалиден. Zod-схема `skillFrontmatterSchema` в `packages/forge/src/skill-schema.ts:23` допускает только `"fo" | "shared" | "meta"`. Существующие ef-skills (`ef-composition-review`, `ef-render-verify`) используют `category: fo` и находятся в `packages/forge/skills/fo/`. Должно быть `category: fo`.

- **A2 (критическое, строки 99–113):** Предлагаемый frontmatter не содержит `languagePolicy: ref(PREFERENCES.md)`. Схема требует это поле (`z.literal("ref(PREFERENCES.md)")`, `skill-schema.ts:26`). Без него `forge.skill.validate` выдаст SKILL-01 (schema validation failure). Существующие ef-skills содержат это поле.

- **A3 (строки 97, 219):** Путь `packages/forge/skills/ef/ef-onboard/SKILL.md` не соответствует фактической структуре. Реестр `discoverForgeSkills` в `packages/forge/src/registry.ts:118` сканирует `skills/{category}/{name}/SKILL.md`. Существующие ef-skills находятся в `skills/fo/ef-composition-review/` и `skills/fo/ef-render-verify/`. Правильный путь: `packages/forge/skills/fo/ef-onboard/SKILL.md`. Таблица «File system responsibilities» (строка 219) также содержит неверный путь.

- **A4 (строки 105–107):** `bindings: { requires: [], optional: [] }` объявлен с пустыми массивами. Существующие ef-skills не объявляют `bindings` вообще. Пустой `bindings` не добавляет значения и не нужен — поле `optional` в схеме делает его необязательным. Удалить.

- **A5 (строка 100):** `description` превышает 200 символов? Нет, ~170 символов — в пределах лимита схемы (`.max(200)`). OK.

- **A6:** Раздел «Output format» отсутствует — RFC не документирует `--json`-форму результатов `forge.skill.validate` и `forge.skill.list` для нового skill'а. Minor — не блокирующее, но желательно для консистентности с RFC-0692.

- **A7 (строка 153):** Шаг 3 говорит «pass `--template react` (if the profile supports it — otherwise, instruct the agent to install `@editframe/react` manually after scaffold)». Хеджирование «if the profile supports it» неинформативно — RFC должен проверить, поддерживает ли `forge create` флаг `--template`, и указать явно. Текущий `editframe-html.yaml` не объявляет шаблоны (react/html) — профиль имеет только один `firstWorkspace` с HTML-композицией. RFC должен прямо сказать: профиль поддерживает только HTML; React требует ручной установки `@editframe/react`.

## Axis B — DNA alignment

- **B1:** `satisfies: [DNA-54]` формально корректно — DNA-54 требует отсутствия hardcoded project-specific literals в canonical skill bodies. Skill использует forge CLI-команды (`forge create`, `forge dev`, `forge doctor`) и внешние URL — не project-specific литералы. Соответствует DNA-54. Не блокирующее.

- **B2:** RFC не устанавливает новый DNA-инвариант — `satisfies` означает «соответствует», что допустимо. OK.

## Axis C — Ecosystem fit

- **C1 (строки 199–213):** Раздел «Template update» предлагает добавить секции «Skills» и «External resources» в `composition-agents.md`. Но текущий шаблон (59 строк) уже содержит секцию «Skill usage» (строки 41–46) с описанием `ef-composition-review` и `ef-render-verify`. RFC должен уточнить: заменяет ли новая секция «Skills» существующую «Skill usage», или дополняет её. Если дополняет — будет дублирование. Если заменяет — RFC должен показать итоговую секцию целиком, а не фрагмент. Таблица «File system responsibilities» (строка 221) говорит «Extended — onboarding reference and external resources section», что подразумевает добавление, но существующая «Skill usage» уже покрывает review и verify — только `ef-onboard` и external resources новые.

- **C2 (строка 237):** Раздел Rollout говорит «apply RFC-0692 first, then RFC-0693». RFC-0692 уже `accepted` и его skills существуют в `packages/forge/skills/fo/`. RFC-0693 должен отметить, что строит на уже реализованном RFC-0692, а не на гипотетическом.

- **C3 (строка 179):** Шаг 6 говорит «Run `forge dev` to start the preview server». Профиль `editframe-html.yaml` (строка 18) объявляет `devServer.command: editframe preview`. `forge dev` — это forge CLI-обёртка, которая запускает профильный dev server. Это корректно, но RFC должен уточнить, что `forge dev` делегирует к `editframe preview`.

## Axis D — Forward-only compliance

No issues. Skill аддитивен, не удаляет и не заменяет существующие skills.

## Axis E — Agent-facing policy

- **E1:** Status gate корректен — RFC находится в `draft`, implementation notes ссылаются на RFC-0224. OK.

- **E2 (строки 276–277):** Implementation notes содержат два правила:
  - «Agents MUST install editframe skills from the official source» — OK.
  - «Agents MUST NOT skip the discovery step» — OK.
  Но отсутствует правило о порядке: skill должен быть вызван ДО создания проекта (он является onboarding-скиллом). Это не блокирующее.

## Axis F — Pragmatism

- **F1 (строки 157–164):** Шаг 4 (установка Editframe domain skills) предлагает запустить `npm create @editframe@latest -- --skip-install --skip-skills -d /tmp/editframe-skills-tmp -y` в temp-директории, затем скопировать skills. Флаги `--skip-install`, `--skip-skills` не подтверждены — Editframe CLI может их не поддерживать. RFC должен либо (a) указать источник информации об этих флагах (документация, исходный код), либо (b) предложить более простой подход: `npm create @editframe@latest` в текущем проекте и затем удалить лишние файлы, или просто направить агента к онлайн-документации.

- **F2 (строка 145):** Шаг 2, пункт 4 («Node.js/React libraries») спрашивает оператора о библиотеках (AnimeJS, Tailwind). Это полезно для discovery, но skill не объясняет, что делать с этой информацией. Шаг 3 (scaffold) не использует ответ — `forge create` не принимает список библиотек. Ответ используется только в шаге 6 (build), но неформализованно. Minor — не блокирующее.

## Axis G — Blind spots

- **G1:** RFC не рассматривает empty-state для skill'а: что если `forge create` падает? Skill должен сообщить оператору об ошибке и остановиться, а не продолжать к шагам 4–6.

- **G2 (строка 159):** Команда `npm create @editframe@latest -- --skip-install --skip-skills -d /tmp/editframe-skills-tmp -y` использует `/tmp/` — это POSIX-путь. На Windows temp-директория отличается (`os.tmpdir()`). RFC указывает в nonGoals, что не добавляет FFmpeg check в `forge doctor`, но не упоминает кросс-платформенность шага 4. Minor — forge публикуется для Linux и Windows (см. `packages/forge/AGENTS.md`).

- **G3:** RFC не указывает, должен ли `ef-onboard` быть включён в `forge.skill.list --json` с пометкой профиля. Как и в RFC-0692 (finding G2), skill'и появляются в общем списке без привязки к профилю. Acceptance criterion «`forge.skill.list` includes `ef-onboard`» корректен — проверяется наличие, не привязка.

## Questions for the author

1. `category: ef` невалиден согласно Zod-схеме (`"fo" | "shared" | "meta"`). Должно ли быть `category: fo` (как у существующих `ef-composition-review` и `ef-render-verify`), или схема должна быть расширена для поддержки категории `ef`? Если первое — исправить frontmatter и путь. Если второе — это отдельная schema-change RFC.
2. `languagePolicy: ref(PREFERENCES.md)` отсутствует в предлагаемом frontmatter. Это намеренное упущение или ошибка? Схема требует это поле — без него `forge.skill.validate` выдаст SKILL-01.
3. Шаг 4 предполагает флаги `--skip-install` и `--skip-skills` для `npm create @editframe`. Подтверждено ли существование этих флагов в Editframe CLI? Если нет — какой fallback?
