---
reviewId: REVIEW-CODE-2026-08-18-01
date: 2026-08-18
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: uncommitted (working tree)
filesReviewed:
  - packages/forge/profiles/godot-csharp.yaml
  - packages/forge/src/onboarding/scaffold-project.ts
  - packages/forge/os/core/handlers/lifecycle-handlers.test.ts
---

# Code Review: uncommitted changes — godot-csharp profile fixes

### Verdict: Needs revision

Дифф исправляет пять реальных проблем Godot-шаблона (SDK версия, assembly name, скрипты запуска/установки, управление версией Godot). Изменения правильные по сути, но есть несколько находок: мёртвая переменная `EXE_NAME`, `find -perm +111` не работает на Linux (BSD-синтаксис), и `pkill -x Godot` не сработает для процессов с другим именем.

### Mechanical floor

Pass — `tsc --noEmit` и 860 тестов проходят.

### Axis A — Structural correctness

- **Мёртвая переменная `EXE_NAME`** — `packages/forge/profiles/godot-csharp.yaml:354` объявляет `EXE_NAME="Godot_v${VERSION}_mono_win64.exe"`, но переменная нигде не используется. Удалить.
- **`find -perm +111` не работает на Linux** — `packages/forge/profiles/godot-csharp.yaml:386` и `:391` используют `find ... -perm +111`, что является BSD/macOS-синтаксисом. На GNU find (Linux) нужно `-perm /111` или `-executable`. Поскольку скрипт должен работать на Linux, это баг. Использовать `-executable` (GNU find) или `-type f -name "Godot*" | head -1` без проверки прав.

### Axis B — DNA alignment

No issues — дифф касается только profile YAML и scaffold-логики, не затрагивает DNA-инварианты.

### Axis C — Ecosystem fit

No issues — профиль корректно обновлён в рамках `packages/forge/profiles/`, scaffold-логика в `src/onboarding/scaffold-project.ts` осталась в том же модуле.

### Axis D — Forward-only compliance

No issues — нет совместимости-шимов, нет legacy-путей. `dotnet build ./Game.csproj` → `dotnet build` — прямое улучшение.

### Axis E — Agent-facing clarity

No issues — скрипты хорошо задокументированы, README обновлён с инструкциями.

### Axis F — Pragmatism

- **`pkill -x Godot` избыточен** — `packages/forge/profiles/godot-csharp.yaml:432` вызывает `pkill -x Godot 2>/dev/null || true` после `pkill -x godot`. На Linux Godot mono запускается как `godot` (нижний регистр). На macOS — `Godot`. Но `pkill -x` ищет точное совпадение имени процесса, и если процесс называется `godot.linuxbsd.x86_64.mono`, `pkill -x godot` его не найдёт. Рассмотреть `pkill -f "godot.*--path"` для надёжности, или документировать, что это best-effort.

### Axis G — Blind spots

- **Windows-совместимость `install-godot.sh`** — скрипт использует bash, но Windows-пользователи могут не иметь bash. Профиль уже указывает `MINGW*|MSYS*|CYGWIN*` для определения платформы, что подразумевает Git Bash / MSYS2. Это разумно, но стоит отметить в README, что для Windows нужен Git Bash или WSL.
- **`curl` недоступен на некоторых системах** — минимальная проверка `command -v curl` отсутствует. Добавить fallback на `wget` или проверку.
- **`godot.version` содержит `4.3.0`, но CI использует `4.3`** — `packages/forge/profiles/godot-csharp.yaml:219` в CI: `version: "4.3"`, а `godot.version` — `4.3.0`. Это не сломает CI (setup-godot принимает краткие версии), но несогласованность может смутить. Стоит либо документировать, что `godot.version` — точная версия, а CI — краткая, либо выровнять.

### Spec compliance

| Требование | Статус | Evidence |
| --- | --- | --- |
| Game.csproj с версией SDK | Done | `Godot.NET.Sdk/4.3.0` — строка 683 |
| Assembly name совпадает с project.godot | Done | `<AssemblyName>my-game</AssemblyName>` — строка 685, `assembly_name="my-game"` — строка 680 |
| icon.svg присутствует | Done | Уже был в шаблоне (строка 807), не требовало изменений |
| Управление версией Godot в конфиге | Done | `godot.version` файл — строка 308 |
| scripts/install-godot.sh | Done | Строки 311–403 |
| scripts/run.sh | Done | Строки 404–453 |
| Шаблон сразу собираемым и запускаемым | Partial | Скрипты есть, но `find -perm +111` сломан на Linux |

### Questions for the author

1. `EXE_NAME` на строке 354 — это намеренная заготовка для будущего использования, или случайно осталась? Если не нужна — удалить.
2. `find -perm +111` — тестировался ли `install-godot.sh` на Linux? GNU find не поддерживает `+111` синтаксис.
3. `pkill -x godot` — проверялось ли на реальном процессе Godot mono? Имя процесса может быть `godot.linuxbsd.x86_64.mono`, и точное совпадение не сработает.
