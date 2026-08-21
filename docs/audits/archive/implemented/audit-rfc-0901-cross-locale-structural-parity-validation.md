---
rfcId: RFC-0901
auditId: AUDIT-RFC-0901-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0901

## Verdict: Требует доработки

RFC-0901 решает реальную проблему (отсутствие структурной проверки переводов) и в целом хорошо вписывается в экосистему. Однако есть несколько находок: неполная спецификация результата команды (отсутствует `summary` на каждом пути возврата — нарушение DNA-82), неточное указание пакета для нового модуля (`packages/werkstatt-shared/src/checks/parity/` против `packages/werkstatt-site/`), и отсутствие явного указания `AGENTS.md` файлов, требующих обновления.

## Механическая валидация (rfc.validate)

Пройдена — `rfc.validate --id RFC-0901 --json` вернул ноль нарушений.

## Ось A — Структурная полнота

- **Decision** — корректен, настоящее время: «The kernel gains three commands…».
- **CLI surface** — присутствует, показывает точные вызовы с флагами.
- **TypeScript contracts** — минимальны и достаточны.
- **File system responsibilities** — таблица указывает конкретные пути.
- **Output format** — документирован `--json` формат.
- **Failure modes** — указаны exit-коды и warn-vs-fail поведение.
- **Rollout** — описан путь внедрения для существующих и новых сайтов.
- **Alternatives considered** — честные, четыре альтернативы с причинами отказа.
- **Risks** — включает false-positive риск и производительность.
- **Acceptance criteria** — проверяемые, но см. находку ниже.
- **Implementation notes** — явные поведенческие правила.

**Находки:**

1. **Acceptance criteria не упоминают DNA-82 compliance.** В критериях приёмки нет пункта о том, что `translation.parity.validate` должна возвращать `KernelCommandResult` с `summary` на каждом пути возврата и `nextSteps` при `exitCode: 1` (DNA-82). Это обязательное требование для всех kernel command handlers в `packages/werkstatt/src/` и `packages/werkstatt-site/src/`. Критерии должны включать: «Each command handler returns `KernelCommandResult` with `exitCode` explicitly set, `summary` prefixed with `[command.name]`, and `nextSteps` non-empty on failure (DNA-82)».

2. **Acceptance criteria не упоминают регистрацию в `command-tables/`.** Критерий говорит «registered with `scope: app` in `packages/werkstatt-site/src/checks/command-tables/`», но не уточняет, в каком именно файле `command-tables/` (например, `04-content-quality.ts` или новый файл). Это создаёт неоднозначность для агента-реализатора.

## Ось B — Выравнивание с DNA

- **DNA-11 (Language mirroring):** RFC корректно объясняет, как расширяет DNA-11 от file-level presence к structural-level parity. `satisfies: [DNA-11]` обоснован.
- **`related[]` ссылки:** RFC-0097 (per-page locale scoping), RFC-0684 (axiom suppression layer), RFC-0732/0734 (content regression review), RFC-0174 (legal translation binding-language) — все релевантны и не декоративны.

**Находки:**

1. **DNA-82 не упомянут в `satisfies[]` или `related[]`.** RFC-0901 вводит три новых kernel command handler в `packages/werkstatt-site/src/`. DNA-82 (Kernel command output standard) напрямую применяется: каждый handler должен возвращать `KernelCommandResult` с явно установленным `exitCode`, `summary` с префиксом `[command.name]`, и `nextSteps` при failure. Отсутствие DNA-82 в `related[]` означает, что агент-реализатор может пропустить это требование. Рекомендация: добавить `DNA-82` в `related[]`.

## Ось C — Экосистемное соответствие

- **Package boundaries:** RFC указывает `packagesImpacted: ["@warpgogol/werkstatt-shared", "@warpgogol/werkstatt-site"]`. Импорты идут `werkstatt-site → werkstatt-shared` — корректное направление.
- **Pipeline placement:** RFC указывает `SITES_CHECK_AUTHOR_PIPELINE` после `mirroring.validate` — корректно, file presence является prerequisite для structural parity.
- **Command lifecycle:** `commands.proposed` содержит три команды — они перейдут в `added` при реализации. Корректно.

**Находки:**

1. **Противоречие в размещении нового модуля.** В таблице «File system responsibilities» (строки 287–288) указано:
   - `packages/werkstatt-shared/src/checks/parity/` — «New module: sentence splitting, paragraph counting, suppression schema»
   - `packages/werkstatt-site/src/checks/translation-parity.ts` — «New module: validate, review, suppress command handlers»

   Однако `packages/werkstatt-shared/AGENTS.md` устанавливает, что этот пакет MUST NOT import from `@warpgogol/werkstatt-site`. Если suppression schema и sentence splitting живут в `werkstatt-shared`, а command handlers в `werkstatt-site`, это корректно. Но RFC не объясняет, почему suppression schema (которая специфична для translation parity) должна жить в shared пакете, а не в site пакете. Suppression schema для translation parity не используется другими пакетами — это нарушает принцип «Do not export Zod schemas or types without at least one consumer» из `packages/AGENTS.md`. Рекомендация: либо обосновать, почему schema в shared (какой другой потребитель?), либо переместить всё в `packages/werkstatt-site/src/checks/translation-parity/`.

2. **AGENTS.md updates не указаны.** RFC не идентифицирует, какие `AGENTS.md` файлы требуют обновления. Как минимум:
   - `packages/werkstatt-site/AGENTS.md` — нужно добавить описание трёх новых команд в секцию «Check commands».
   - `packages/werkstatt-shared/AGENTS.md` — если новый модуль `checks/parity/` действительно создаётся здесь.
   - Root `AGENTS.md` — возможно, упоминание в контексте DNA-11 extension.

3. **Compass sync не указан.** RFC добавляет новые kernel commands и расширяет DNA-11. Root `AGENTS.md` требует синхронизации `docs/*.xml` при изменении repository-wide requirements или shared package contracts. RFC не упоминает, какие XML-файлы требуют обновления (как минимум `docs/requirements.xml` и `docs/knowledge-graph.xml`).

4. **Подpath export не указан.** Если `packages/werkstatt-shared/src/checks/parity/` экспортирует sentence splitting и suppression schema, `packages/werkstatt-shared/package.json` должен объявить соответствующий subpath export (согласно `packages/AGENTS.md`: «Cross-package imports of specific modules require a subpath export»). RFC не упоминает это.

## Ось D — Forward-only compliance

- Нет compatibility shim, нет dual-path, нет legacy bridge.
- Suppression file опционален — нет принудительной миграции.
- Новые команды добавляются, не заменяют существующие.

**Находки:**

1. **`translation.parity.review` — неясно, создаёт ли он state.** RFC говорит «generates a review manifest listing all unsuppressed findings». Если manifest записывается на диск (как `content.regression.review.generate` пишет `review.yaml`), это generated artifact, который должен быть в `GENERATOR_OWNERSHIP_MAP`. RFC не уточняет, записывается ли manifest на диск или только выводится в `--json`. Если записывается — нужно указать путь и зарегистрировать ownership.

## Ось E — Agent-facing policy

- **Status gate:** RFC имеет статус `draft`. Implementation notes (строки 414–419) корректно говорят: «Agents MAY implement code changes ONLY when this RFC has status: accepted». Нет self-authorizing language.
- **Implementation notes** ссылаются на RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Корректно.
- **NEEDS CLARIFICATION markers:** Не найдены.

**Находки:**

1. **`translation.parity.suppress` — флаги не полностью специфицированы.** CLI surface (строка 116) показывает `--file`, `--rule`, `--section`, `--reason`. Но в TypeScript contracts `SuppressionRecord` также имеет `approvedAt` (обязательное поле). Команда должна либо запрашивать `--approvedAt` как флаг, либо автоматически ставить текущую дату. RFC не уточняет это. Для agent-actionable diagnostics важно явно указать, что `approvedAt` auto-populates.

2. **`--rule` vs `--ruleId` несоответствие.** CLI surface (строка 118) использует `--rule PROSE-PARITY-SENTENCE-COUNT`, но в suppression schema и TypeScript contracts поле называется `ruleId`. Флаг должен быть `--ruleId` для консистентности, или RFC должен объяснить алиас.

## Ось F — Прагматизм

- **Три команды:** `validate`, `review`, `suppress` — каждая зарабатывает своё существование. `validate` — детекция, `review` — manifest для оператора, `suppress` — добавление suppression. Это mirrors pattern `content.regression.check` / `content.regression.review.generate` / (apply). Корректно.
- **Lean contracts:** TypeScript types минимальны.
- **Existing patterns:** RFC явно рассматривает расширение `mirroring.validate` и отвергает с обоснованием.

**Находки:**

1. **`PARITY-FILE` rule избыточен.** RFC определяет `PARITY-FILE` («File exists in all expected locales») как один из четырёх правил. Но это именно то, что делает `mirroring.validate` (DNA-11). RFC сам говорит (строка 361): «Source locale file missing → skip (mirroring.validate catches this separately)». Если `mirroring.validate` уже проверяет file presence и запускается перед `translation.parity.validate` в pipeline, то `PARITY-FILE` правило внутри parity validator дублирует `mirroring.validate`. Рекомендация: удалить `PARITY-FILE` из списка правил parity validator или явно объяснить, почему нужен повторный файл-presence check внутри parity (например, для standalone запуска вне pipeline).

## Ось G — Слепые зоны

- **Performance:** RFC указывает O(N×L) и оценивает «< 100 files × 2-3 locales» как acceptable. Разумно.
- **False positives:** Указаны для sentence splitting, описаны abbreviation lists и suppression.
- **Edge cases:** Указаны empty states (no locale subdirs, single locale, missing suppression file).

**Находки:**

1. **Content directories coverage — неточно.** RFC перечисляет 7 директорий (строки 127–136), включая `src/content/business-profile/{lang}/`, `src/content/navigation/{lang}/`, `src/content/faq/{lang}/`, `src/content/people/{lang}/`, `src/content/site/{lang}/`. Но `mirroring.validate` (существующий код в `packages/werkstatt-site/src/checks/checks/mirroring.ts`) сканирует только `src/content/pages/{lang}/` (`paths.contentPagesDirectory`). RFC не объясняет, как parity validator будет сканировать директории, которые mirroring.validate не покрывает. Нужно либо подтвердить, что все 7 директорий существуют и содержат locale subdirs в реальных сайтах, либо ограничить scope до директорий, которые реально используют locale subdirs.

2. **Sentence splitting — неточность в спецификации.** Строка 174: «Sentence boundary = `.` `!` `?` followed by whitespace + capital letter». Но в немецком все существительные пишутся с большой буквы, а в украинском — нет. Это означает, что для `de` правило «capital letter after sentence boundary» будет давать много false positives (любая точка перед существительным), а для `uk` — может пропускать границы предложений (если после точки идёт слово со строчной буквы, что возможно в украинском после некоторых сокращений). RFC должен уточнить, что abbreviation lists имеют приоритет над общим правилом, и описать edge case с `§` (который не является концом предложения, но часто встречается в немецких юридических текстах).

3. **Frontmatter parity не упоминается.** RFC проверяет только body structure (sections, paragraphs, sentences). Но translated pages часто имеют frontmatter fields (title, description, etc.) которые тоже должны быть переведены. RFC не упоминает, должен ли parity validator проверять наличие одноимённых frontmatter fields в locale-variants. Это не обязательно включать в scope, но nonGoals должны явно это исключить.

4. **Concurrent execution не рассмотрена.** RFC не рассматривает случай, когда два агента одновременно редактируют `translation-parity.suppressions.yaml` (один добавляет suppression, другой валидирует). Нет упоминания file locking или atomic write. Для YAML-файла в workpiece это низкий риск (миссии однопоточные), но стоит явно отметить.

## Вопросы автору

1. **Почему suppression schema и sentence splitting должны жить в `@warpgogol/werkstatt-shared`, а не в `@warpgogol/werkstatt-site`?** Какой другой потребитель в shared пакете будет использовать эти модули? Если потребителей нет, это нарушает правило «Do not export Zod schemas or types without at least one consumer».

2. **`PARITY-FILE` правило дублирует `mirroring.validate` — нужен ли он внутри parity validator?** Если parity validator всегда запускается после `mirroring.validate` в pipeline, file-presence уже проверен. Если parity validator может запускаться standalone (вне pipeline), тогда `PARITY-FILE` нужен, но это должно быть явно указано.

3. **`translation.parity.review` записывает manifest на диск или только выводит в `--json`?** Если на диск — какой путь, и должен ли файл быть в `GENERATOR_OWNERSHIP_MAP`?
