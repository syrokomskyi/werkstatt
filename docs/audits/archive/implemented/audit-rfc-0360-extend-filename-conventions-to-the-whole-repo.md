# Ревью RFC-0360: Extend filename conventions to the whole repo

## 1. Executive Summary

**Требует доработок.** RFC предлагает прагматичное и минимальное изменение, которое логично расширяет существующий инвариант DNA-6 на весь репозиторий. Подход с data-driven scan roots обоснован и future-proof. Однако есть несколько неучтенных edge cases (обработка ошибок I/O, поведение с gitignored директориями, кросс-платформенная совместимость) и отсутствуют эксплуатационные детали (метрики, graceful degradation), которые необходимо уточнить до принятия.

## 2. Критические архитектурные уязвимости

1. **Синхронный I/O в `resolveScanRoots()`** — функция использует `readdirSync`, что блокирует event loop. Для масштаба описываемого репозитория это вероятно несущественно, но в будущем при росте количества top-level директорий может стать узким местом при частых запусках lint в CI/CD пайплайнах.

2. **Отсутствие обработки ошибок при `readdirSync`** — если директория временно недоступна (permission denied, network mount issue, race condition при параллельных операциях), весь lint упадет с unhandled exception. Нет graceful degradation.

3. **Неопределенность с gitignored top-level директориями** — RFC утверждает, что gitignored директории (missions, releases, agents) сканируются, но их содержимое пропускается. Неясно, проверяется ли само _имя директории_ на kebab-case compliance. Если `missions/` в `.gitignore`, должен ли lint валидировать, что имя директории kebab-case?

## 3. Неучтенные Edge Cases

1. **Windows case-insensitive filesystems** — правило ALLCAPS exemption (`RFC-NNNN-...`) может вести себя непредсказуемо на Windows, где `RFC-0123.md` и `rfc-0123.md` могут считаться одним файлом в зависимости от настроек. RFC не специфицирует кросс-платформенное поведение.

2. **Временные/экспериментальные top-level директории** — если разработчик создаст директорию `temp-experiments/` или `scratch/`, она автоматически попадет в scan roots. Нет механизма для opt-out без изменения core ignored set. Это может привести к ложным срабатываниям в ветках разработки.

3. **Символические ссылки (symlinks)** — RFC не специфицирует поведение с symlink-ами на top-level уровне. `readdirSync` может следовать или не следовать за ними в зависимости от ОС и настроек, что может привести к дублированию сканирования или пропуску директорий.

4. **Race condition при параллельных запусках** — если lint запускается параллельно с операциями, которые создают/удаляют top-level директории (например, git checkout другой ветки с другой структурой), `resolveScanRoots()` может увидетьное состояние.

## 4. Конкретные улучшения

1. **Добавить try-catch вокруг `readdirSync`** с fallback на hard-coded список директорий или graceful degradation:

   ```ts
   function resolveScanRoots(repoRoot: string): string[] {
     try {
       const entries = readdirSync(repoRoot, { withFileTypes: true });
       // ... existing logic
     } catch (error) {
       // Fallback to known roots or log warning and continue
       console.warn(`[naming.convention.lint] Failed to read repo root: ${error.message}`);
       return FALLBACK_SCAN_ROOTS;
     }
   }
   ```

2. **Явно специфицировать поведение с gitignored top-level директориями** — добавить в RFC clarification: "Gitignored top-level directory names ARE validated for kebab-case compliance even if their contents are skipped." Или наоборот, если это не требуется.

3. **Добавить configuration file для project-specific opt-out** — позволить проектам определить `naming-convention.config.json` в repo root для исключения специфических top-level директорий без изменения core ignored set. Это полезно для монорепо с временными sandbox директориями.

4. **Рассмотреть async I/O** — использовать `readdir` с async/await или `fs.promises.readdir` для предотвращения блокировки event loop, хотя для lint это может быть over-engineering.

5. **Добавить метрики в JSON output** — расширить output для включения времени выполнения scan roots resolution, количества пропущенных gitignored файлов, и breakdown по директориям. Это поможет в мониторинге производительности.

## 5. Вопросы автору

1. **Должен ли lint валидировать имена gitignored top-level директорий на kebab-case compliance?** Если `missions/` в `.gitignore`, проверяется ли само имя директории, или только содержимое (которое пропускается)? Это критично для consistency enforcement.

- Да. Полная проверка всех директорий, включая те, которые игнорируются git.

2. **Какое ожидаемое поведение при failure `readdirSync`?** Должен ли lint падать с ошибкой, логировать warning и продолжать с fallback, или игнорировать проблемную директорию? Как это влияет на CI/CD пайплайны?

- Логировать warning и продолжать с fallback. Если и fallback падает - тогда error.

3. **Есть ли план для handling временных/экспериментальных top-level директорий без изменения core ignored set?** Разработчики могут создавать sandbox директории для экспериментов. Должен ли быть механизм opt-out через configuration file, или каждый случай требует изменения ignored set в коде?

- Разработчики не могут создавать корневые sandbox директории для экспериментов. Явно запретить. Проверять автоматически.
