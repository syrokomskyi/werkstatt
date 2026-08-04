---
rfcId: RFC-0685
auditId: AUDIT-RFC-0685-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0685

## Verdict: Needs revision

RFC-0685 содержит три обоснованных оптимизации, но имеет структурный пробел в дизайне `inputsMetadata` sidecar (несовместимость с текущим интерфейсом `CacheLayer`) и несколько неточностей в описании кодовой базы, которые нужно исправить до реализации.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0685` прошёл с нулём нарушений.

## Axis A — Structural completeness

- **F-1 (Decision):** Раздел Decision описывает три оптимизации в одном предложении — это не "single decision", а список из трёх. Рекомендуется разделить на одно ведущее решение ("The command-result cache layer gains an internal acceleration path via workspace tree index, mtime-based fast path, and byte-mode selection for content files") с последующим уточнением. Не блокирующее, но не соответствует требованию "single decision in present tense".
- **F-2 (CLI surface):** Раздел CLI surface отсутствует. В тексте RFC нет ни одного примера CLI-вызова. Поскольку RFC не добавляет новых команд (`commands.added: []`), это допустимо, но стоит явно указать "No CLI surface changes — optimizations are internal to the cache layer" для ясности.
- **F-3 (Output format):** Раздел `--json` shape отсутствует. Поскольку RFC не меняет выходной формат команд, это N/A, но стоит явно указать.
- **F-4 (TypeScript contracts):** Контракты минимальны и корректны. `WorkspaceTreeIndex` type и `buildWorkspaceTreeIndex` function объявлены. `computeInputsHash` signature расширен опциональным `treeIndex` — совместимо с существующим кодом.
- **F-5 (File system responsibilities):** Таблица корректна, перечисляет конкретные пути. `cache-layer.ts` указан как "Modified: stores/retrieves `inputsMetadata` sidecar" — но текущий `CacheLayer` interface не поддерживает дополнительные колонки (см. Axis C finding).
- **F-6 (Failure modes):** Раздел корректно описывает fallback при ошибке построения tree index и mtime collision. Указаны exit codes косвенно (pipeline не падает).
- **F-7 (Rollout):** Раздел описывает default behavior, first-run cache flush, и отсутствие schema migration. Корректно.
- **F-8 (Alternatives considered):** Четыре реальные альтернативы с обоснованием отказа. Соответствует требованиям.
- **F-9 (Risks):** Включает agent misinterpretation risk (явно указано "agents might think this RFC changes the cache schema"). Memory usage оценён количественно (~1–2MB).
- **F-10 (Acceptance criteria):** 9 пунктов, все проверяемые. Критерий (a) "tree index produces same glob matches as filesystem walk" — проверяем через unit test. Критерий (b) "mtime fast path reuses hash on unchanged files" — проверяем. Все критерии достаточны.
- **F-11 (Implementation notes):** Явные behavioral rules, включая exclusion set, `--force` bypass, и closed byte-mode table. Соответствует требованиям.

## Axis B — DNA alignment

- **DNA-53 (Semantic fingerprint governance):** RFC явно утверждает "This RFC does not bypass `@warpgogol/fingerprint`" и описывает использование существующих `byteHash` и `fingerprintFile` API. Проверено по коду: `fingerprintFile(abs, { mode: "byte" })` действительно поддерживается (`packages/fingerprint/src/fingerprint.ts:34-41`). Alignment корректный.
- **DNA-35 (`app.contract.full`):** RFC утверждает "By reducing cache-check overhead, the canonical readiness signal runs faster without weakening validation." Обоснование корректное — все checks всё ещё выполняются на cache miss.
- **F-12:** `related[]` включает RFC-0390 и RFC-0637 — оба напрямую релевантны (RFC-0390 — command-result cache, RFC-0637 — modulePaths). Однако RFC-0686 (parallel pipeline execution) упоминается в `nonGoals` но отсутствует в `related[]`. Стоит добавить.

## Axis C — Ecosystem fit

- **F-13 (CacheLayer interface incompatibility):** RFC утверждает в разделе "mtime-based fast path": "The sidecar is stored in the same SQLite cache namespace, keyed by the same cache key, in a separate column." Однако текущий `CacheLayer` interface (`packages/os/site-kernel/src/cache/cache-layer.ts:45-58`) не поддерживает дополнительные колонки — метод `set` принимает только `(namespace, key, data, mtime, contentHash)`. SQLite schema (`sqlite-cache-layer.ts:27-46`) имеет фиксированный набор колонок: `namespace, key, data, mtime, content_hash, schema_version, updated_at`. Для `inputsMetadata` sidecar потребуется либо:
  - (a) Расширить `CacheLayer` interface и SQLite schema новой колонкой `inputs_metadata TEXT` — это меняет интерфейс пакета,
  - (b) Хранить `inputsMetadata` внутри поля `data` (JSON-объект с `report` и `inputsMetadata`), или
  - (c) Использовать отдельный namespace (например `command_results_metadata`).
  RFC не уточняет какой подход выбран. Это **блокирующий finding** — реализация не может начаться без решения этого дизайнерского вопроса.
- **F-14 (Package boundaries):** Все изменения внутри `packages/os/site-kernel/` — корректно. `packagesImpacted: ["@warpgogol/site-kernel"]` — единственный пакет. Импорты не пересекают границы.
- **F-15 (Pipeline placement):** RFC не добавляет новых pipeline steps — изменения внутренние. Корректно.
- **F-16 (Compass sync):** RFC не упоминает необходимость обновления `docs/*.xml` файлов. Поскольку RFC меняет внутреннюю реализацию cache layer (не архитектурные требования), это N/A. Но если `inputsMetadata` требует schema change в SQLite, стоит упомянуть.
- **F-17 (AGENTS.md updates):** RFC не упоминает обновление `packages/os/site-kernel/AGENTS.md` § "Command-result cache (RFC-0390)". Этот раздел документирует cache behavior и должен быть обновлён с описанием mtime fast path и byte-mode selection. Стоит добавить в acceptance criteria или implementation notes.
- **F-18 (Command lifecycle):** `commands.proposed/added/changed/removed` все пустые — корректно, RFC не вводит новые команды.

## Axis D — Forward-only compliance

- **F-19:** RFC утверждает "No cache schema migration: the `inputsMetadata` sidecar is stored in a new SQLite column. Old entries without the sidecar simply trigger a full `computeInputsHash` on the next read, then are updated with the sidecar." Это не dual-path — старые записи прозрачно обновляются. Forward-only compliance соблюдён.
- **F-20:** Byte-mode selection для content files меняет `inputsHash` values — RFC явно указывает "The first run after implementation recomputes all caches." Это one-time cost, не grace period. Корректно.

## Axis E — Agent-facing policy

- **F-21 (Status gate):** RFC имеет `status: draft`. Implementation notes говорят "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Корректно — нет self-authorizing language.
- **F-22 (Implementation notes governance):** Ссылается на RFC-0224 (accepted→implemented transition) и RFC-0334 (supersede escalation). Соответствует требованиям.
- **F-23 (Anti-fabrication):** RFC не требует content authoring — все изменения кодовые. N/A.
- **F-24 (Storage policy):** RFC не вводит cookies или client-side persistence. SQLite cache — server-side, соответствует existing pattern.

## Axis F — Pragmatism

- **F-25 (Minimal command surface):** `commands.added: []` — никаких новых команд. Все оптимизации внутренние. Соответствует.
- **F-26 (Lean contracts):** TypeScript contracts минимальны. `WorkspaceTreeEntry` — 2 поля. `InputsMetadataEntry` — 3 поля. `filterTreeIndex` — простая функция. Нет спекулятивной общности.
- **F-27 (Existing patterns):** RFC расширяет существующие функции (`expandGlobs`, `computeInputsHash`, `tryCacheRead`, `tryCacheWrite`) вместо введения новых. Корректно.
- **F-28 (Scope discipline):** `packagesImpacted` содержит только `@warpgogol/site-kernel`. `appsImpacted: []` — корректно. `nonGoals` явные и осмысленные (4 пункта).

## Axis G — Blind spots

- **F-29 (Performance claims unverified):** RFC утверждает "~50–100ms for single walk" и "~2–4s for 40 walks" — эти цифры не подтверждены бенчмарками. Стоит добавить в acceptance criteria измерение actual speedup (например, "pipeline cache-check time measured before and after, >50% reduction demonstrated").
- **F-30 (Exclusion list completeness):** RFC указывает `.git/`, `node_modules/`, `dist/` как минимальный exclusion set. Однако в монорепо есть и другие большие директории: `.cache/` (SQLite cache DB), `missions/` (workpiece dist folders), `releases/` (release artifacts). Если tree index включает `missions/*/workpiece/dist/`, это может раздуть index до десятков тысяч файлов. Стоит либо добавить `missions/` в exclusion list, либо обосновать почему это не проблема.
- **F-31 (Concurrent pipeline runs):** RFC не рассматривает случай двух параллельных pipeline runs (например, два агента в разных сессиях). Tree index — in-memory, per-run, поэтому каждый run строит свой. Но SQLite cache — shared (WAL mode, busy_timeout 5s). Два pipeline runs могут писать в один cache namespace одновременно. Это существующий риск (не введённый RFC-0685), но mtime fast path может увеличить частоту cache writes (запись sidecar), что повышает вероятность contention. Стоит упомянуть.
- **F-32 (mtime resolution on different filesystems):** RFC утверждает "nanosecond-resolution mtimes on Linux" — но `readdir` с `withFileTypes` не возвращает mtime. Для получения mtime нужен `stat()` call per file, что добавляет I/O. `buildWorkspaceTreeIndex` должен вызвать `stat()` для каждого файла — это ~10,000 stat calls. На Linux ext4 это ~10–20ms, но стоит явно указать в дизайне, что tree index build включает stat calls, а не только readdir.
- **F-33 (Workpiece-specific concern):** В контексте Sternsystem missions, pipeline runs часто выполняются на workpiece (`missions/<id>/workpiece/`), а не на workspace root. `executePipelineForSite` передаёт `site.directory` как `baseDir` и `options.workspaceRoot` как `workspaceRoot`. Tree index строится от `workspaceRoot` — это весь монорепо, а не только workpiece. Для site-scoped commands это может включать нерелевантные файлы. Стоит уточнить, строится ли tree index от `workspaceRoot` или от `site.directory` для site-scoped pipelines.

## Questions for the author

1. Как именно `inputsMetadata` sidecar будет храниться в SQLite? Текущий `CacheLayer` interface не поддерживает дополнительные колонки. Нужно ли расширить interface (вариант a), встроить metadata в `data` payload (вариант b), или использовать отдельный namespace (вариант c)?
2. Должен ли `buildWorkspaceTreeIndex` исключать `missions/`, `releases/`, `.cache/` директории? Если нет, каков ожидаемый размер tree index при активной mission с workpiece dist?
3. Строится ли tree index от `workspaceRoot` (весь монорепо) или от `site.directory` (workpiece) для site-scoped pipeline runs? Если от `workspaceRoot`, как избежать сканирования нерелевантных site workpieces?
