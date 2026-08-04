---
reviewId: REVIEW-CODE-2026-08-04-01
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: working tree (uncommitted changes)
filesReviewed:
  - packages/forge/src/utils/fs-trash.ts
  - packages/forge/src/utils/fs-trash-sync.ts
  - packages/forge/src/utils/index.ts
  - packages/forge/src/utils/fs-atomic.ts
  - packages/forge/os/session/handlers/save.ts
  - packages/forge/os/mission/handlers/archive.ts
  - packages/forge/os/mission/handlers/archive.test.ts
  - packages/forge/os/werkstatt/handlers/lock.ts
  - packages/forge/os/werkstatt/handlers/werkstatt-lock-recover.ts
  - packages/forge/os/rfc/handlers/implement-stamp.ts
  - packages/forge/src/migration-adapters/git-utils.ts
  - packages/forge/package.json
---

# Code Review: Forge Trash Bin — замена fs.unlink/fs.rm на trashPath/trashSync

### Verdict: Needs revision

Дифф добавляет утилиту `trashPath` (async, через npm-пакет `trash`) и `trashSync` (sync, через `execFileSync("trash-put")`) и заменяет все `fs.unlink`/`fs.rm`/`fs.rmSync` вызовы в `packages/forge` на эти утилиты. Механический floor (typecheck) проходит, но один тест падает, и есть несколько семантических находок.

### Mechanical floor

**Fail** — `pnpm --filter @warpgogol/forge test`: 1 тест падает (`archive.test.ts:191`), 609 проходят.

Тест `resurrected source path (e.g. .astro/ cache) → cleaned up after rename` ожидает `existsSync(missionDir) === false`, но `trashPath` перемещает директорию в системную корзину (`~/.local/share/Trash/files/`), а не удаляет. Проблема в том, что `trash` npm-пакет использует `move-file` который internally использует `fs.promises.rename` — это не перехватывается `vi.spyOn(fs, "rename")` mock-ом в тесте. В результате `trash` не может переместить директорию (mock ломает `rename`), и директория остаётся на месте.

### Axis A — Structural correctness

1. **`fs-trash-sync.ts` — PowerShell injection risk (FINDING)**. `targetPath` вставляется в PowerShell-команду через одинарные кавычки с эскейпом `'` → `''`. Однако PowerShell имеет нюансы с обработкой путей, содержащих обратные кавычки (`` ` ``), знаки доллара (`$`), и другие метасимволы даже внутри одинарных кавычек в определённых контекстах. Безопаснее использовать `-LiteralPath` или `FileSystem.DeleteFile` через .NET API напрямую с аргументами, а не строковую интерполяцию команды.

2. **`fs-trash-sync.ts` — дублирование логики (FINDING, possible Duplicated Code)**. Async-версия использует npm-пакет `trash` (реализует FreeDesktop.org Trash spec напрямую, не требует `trash-put`), а sync-версимость вызывает `trash-put` через `execFileSync`. Это две разные реализации одной концепции с разными зависимостями и поведением. Если `trash-put` не установлен (например, на CI без `trash-cli`), sync-версия упадёт, а async-версия будет работать.

3. **`fs-trash.ts` — non-goals противоречит фактическому использованию (FINDING)**. MODULE_CONTRACT говорит: "Do not use for ephemeral cleanup (lock files, temp files, atomic write leftovers) — those are system-internal." Но дифф именно это и делает — заменяет `unlink` в `fs-atomic.ts` (temp file cleanup) и в `lock.ts` (lock file removal). Контракт модуля должен быть обновлён, или эти замены нужно откатить.

### Axis B — DNA alignment

No issues. DNA invariants не напрямую затронуты — изменения касаются только internal file operations в `packages/forge`.

### Axis C — Ecosystem fit

1. **`os/werkstatt/handlers/` autonomy (RFC-0556) — PASS**. Новые импорты в `lock.ts` и `werkstatt-lock-recover.ts` ссылаются на `../../../src/utils/fs-trash.ts` — relative import внутри forge, не `@warpgogol/*`. Autonomy rule не нарушена.

2. **NPM publish: `trash` dependency — FINDING**. `@warpgogol/forge` публикуется в npm. `strip-workspace-deps.mjs` удаляет только `@warpgogol/*` `workspace:*` deps. `trash` — external npm dep, не будет удалён, и будет в `dependencies` опубликованного пакета. Это корректно, но нужно проверить, что `trash` не имеет native dependencies или optional deps, которые сломают установку на Windows. Проверка: `trash@10.1.1` deps — `@stroncium/procfs`, `chunkify`, `globby`, `is-path-inside`, `move-file`, `p-map`, `powershell-utils`, `wsl-utils`, `xdg-trashdir` — все pure JS/TS, без native addons. OK.

3. **`trash` requires Node >=20 — FINDING**. `trash@10.1.1` объявляет `"engines": {"node": ">=20"}`. Forge объявляет `"engines": {"node": ">=18.0.0"}`. Это несоответствие — пользователи forge на Node 18 получат ошибку при установке `trash`.

4. **AGENTS.md update needed — FINDING**. `packages/forge/AGENTS.md` § Archive convention говорит: "Always add a post-rename cleanup check: `if (existsSync(sourcePath)) { await fs.rm(sourcePath, { recursive: true, force: true }); }`". Этот паттерн теперь использует `trashPath`, но AGENTS.md не обновлён.

### Axis D — Forward-only compliance

No issues. Нет compatibility shims или dual-paths. Прямая замена `fs.unlink` → `trashPath`.

### Axis E — Agent-facing clarity

1. **`fs-trash-sync.ts` — нет CHANGE_SUMMARY (FINDING)**. Новый файл имеет `MODULE_CONTRACT`, но не имеет `CHANGE_SUMMARY` секции, которая требуется по конвенции forge (см. `fs-atomic.ts`, `lock.ts` и др.).

2. **`fs-trash.ts` — нет CHANGE_SUMMARY (FINDING)**. Та же проблема.

3. **`fs-trash-sync.ts` — non-goals неполные (FINDING)**. non-goals говорят "Do not use for async code paths", но не упоминают, что sync-версина требует `trash-put` установленным на Linux/macOS, тогда как async-версина не требует (npm-пакет `trash` реализует FreeDesktop.org Trash spec напрямую).

### Axis F — Pragmatism

1. **`fs-atomic.ts` — trashing temp files это over-engineering (FINDING, possible Speculative Generality)**. Temp files в `writeFileAtomic` — это ephemeral `.tmp` файлы, которые создаются и удаляются в рамках одной операции. Перемещение их в корзину не имеет практической ценности — никто не будет восстанавливать temp file из корзины. Это добавляет I/O overhead (перемещение вместо unlink) и риск (если `trash` упадёт, temp file останется). `MODULE_CONTRACT` `fs-trash.ts` явно говорит "Do not use for ephemeral cleanup", но код делает именно это.

2. **`lock.ts` — trashing lock files это over-engineering (FINDING)**. Lock files — ephemeral системные файлы. Перемещение их в корзину не имеет ценности. Пользователь явно сказал "удаления, которые делает LLM, не системные команды" — lock files это системные.

### Axis G — Blind spots

1. **Performance — FINDING**. `trash` npm-пакет делает значительно больше работы, чем `fs.unlink`: определяет mount points через `procfs`, создаёт `.trashinfo` файлы, перемещает файлы в `~/.local/share/Trash/files/`. Для `writeFileAtomic`, который может вызываться сотни раз при билде, это значительный overhead.

2. **Edge cases — FINDING**. `trash` npm-пакет использует `globby` для glob-matching по умолчанию (`glob: true`). Если путь к файлу содержит glob-символы (`*`, `?`, `[`), файл может быть не найден. Нужно передать `{ glob: false }` в `trashPath`.

3. **Cross-device — FINDING**. `trash` определяет trash-директорию по device ID файла. Если файл на другом mount point (например, tmpfs в `/tmp`), trash-директория может не существовать или быть недоступной. `fs.unlink` работает на любой ФС.

### Spec compliance

No spec available — skipped.

### Questions for the author

1. **Должны ли temp files в `writeFileAtomic` и lock files в `lock.ts` реально попадать в корзину?** Пользователь сказал "удаления, которые делает LLM, не системные команды". Temp files и lock files — системные. Если нет, откатить эти замены.

2. **Как `trashSync` должен работать на CI без `trash-put`?** Async-версия не требует `trash-put` (реализует FreeDesktop spec напрямую), но sync-версина падает. Нужно ли сделать sync-версину через тот же npm-пакет `trash` (но синхронно)?

3. **Node 18 compatibility?** `trash@10.1.1` требует Node >=20, forge требует Node >=18. Нужно либо поднять engines в forge, либо использовать старую версию `trash`.
