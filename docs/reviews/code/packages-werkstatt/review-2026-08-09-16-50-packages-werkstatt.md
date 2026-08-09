---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 3dd8badd...HEAD
filesReviewed:
  - package.json
  - packages/werkstatt/package.json
  - packages/werkstatt/AGENTS.md
  - docs/rfcs/rfc-0780-workshop-v5-major-version-bump.md
  - docs/platform-version-log.generated.yaml
---

# Code Review: 3dd8badd...HEAD (RFC-0780 v5.0.0 major version bump)

### Verdict: Needs revision

Дифф формально выполняет задачу — переводит версию с 4.90.16 на 5.0.0 через `ecosystem.commit --bump major`. Однако процесс оставил три коммита с одинаковым сообщением, RFC-0780 содержит противоречие между `nonGoals` и реальным диффом, и acceptance criteria частично не соответствуют действительности.

### Mechanical floor

Pass — `forge rfc.validate --id RFC-0780` проходит без ошибок.

### Axis A — Structural correctness

- **Duplicated commit messages (Shotgun Surgery, обратная)** — три коммита (`6d1c8d8f`, `056c1433`, `1f5ab962`) несут идентичное сообщение «RFC-0780: Workshop v5.0.0 major version bump». Только последний (`1f5ab962`) содержит trailers `X-Platform-Bump: major` и `X-Platform-Version: 5.0.0`. Два предыдущих — промежуточные попытки, которые `ecosystem.commit` создал из-за docs-only / independent-package skip-bump логики. Их следовало склеить (`git rebase -i`) или удалить до финального коммита.

### Axis B — DNA alignment

- **DNA-62 (Foundation File Integrity)** — `docs/platform-version-log.generated.yaml` обновлён корректно: `version: 5.0.0`, новый semantic hash. Pass.
- **DNA-64 (Engine/plugin/workshop boundary)** — дифф не нарушает границу. `packages/werkstatt/package.json` description обновлён, но это metadata, не код. Pass.

### Axis C — Ecosystem fit

- **Root `package.json` scripts** — 5 скриптов обновлены с `node packages/os/site-kernel/bin/site-kernel.mjs` на `pnpm exec werkstatt`. Это правильное обновление — старый бинарник удалён. Pass.
- **`packages/werkstatt/AGENTS.md`** — добавлена марка `(v5.0.0)` в описание. Косметическое изменение, не нарушает контракт. Pass.

### Axis D — Forward-only compliance

- **No legacy tails** — дифф не оставляет обратной совместимости. Pass.

### Axis E — Agent-facing clarity

- **RFC-0780 `nonGoals` противоречит диффу** — RFC заявляет: «No code changes — this RFC is a version marker only» (`docs/rfcs/rfc-0780-workshop-v5-major-version-bump.md:70`). Однако дифф изменяет `package.json` scripts (5 скриптов) и `packages/werkstatt/package.json` description. Это не «no code changes» — это metadata/config changes. NonGoals нужно переформулировать: «No source code changes — only version metadata and script binary paths».
- **Acceptance criteria AC-3 неточна** — «All RFC-0769..0779 remain in `implemented` status with passing validation» (`:140`). RFC-0780 имеет `status: accepted`, не `implemented`. AC проверяет чужие RFC, а не собственный статус — это допустимо, но формулировка неявная.
- **Acceptance criteria AC-4 evidence неточна** — «Root `package.json` scripts reference `werkstatt` binary, not `site-kernel` (evidence: package.json:12-26)» (`:141`). Строки 12-26 включают скрипты `format`, `build`, `dev`, `test` — которые никогда не ссылались на `site-kernel`. Корректный диапазон — `package.json:12,22-26` (5 изменённых скриптов).

### Axis F — Pragmatism

- **Искусственный platform-scope trigger** — `packages/werkstatt/package.json` description изменён с «Werkstatt engine —» на «Werkstatt engine v5 —» исключительно ради того, чтобы `ecosystem.commit` обнаружил non-doc platform-scope файл и выполнил major bump. Без этого изменения `isPlatformScope` не срабатывал (root `package.json` не под `packages/`, а `.md` файлы — docs-only). Это workaround для ограничения `ecosystem.commit`, а не органическое изменение. Альтернатива: расширить `isPlatformScope` или `ecosystem.commit` так, чтобы root `package.json` считался platform-scope при `--bump major`.
- **`packages/werkstatt/AGENTS.md` change** — добавление `(v5.0.0)` в заголовок — та же цель: trigger platform-scope. Косметическая марка версии в AGENTS.md не несёт архитектурной ценности.

### Axis G — Blind spots

- **CHANGELOG.md не обновлён** — мажорный бамп v4→v5 не отражён в `CHANGELOG.md` или `CHANGELOG_PUBLIC.md`. Для мажорного релиза это ожидается.
- **`pnpm-lock.yaml` не обновлён** — `packages/werkstatt/package.json` description изменён, но `pnpm install` не запущен после этого. `ecosystem.commit` запускает `pnpm install` как post-commit deps check, но lockfile мог не измениться (description не влияет на deps). Стоит проверить.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| Перевести мастерскую с v4 на v5 | Done | `package.json:5` → `"version": "5.0.0"` |
| Обновить root scripts с site-kernel на werkstatt | Done | `package.json:12,22-26` |
| Создать RFC-0780 | Done | `docs/rfcs/rfc-0780-workshop-v5-major-version-bump.md` |
| RFC проходит валидацию | Done | `forge rfc.validate --id RFC-0780` exit 0 |
| Один чистый коммит | Missing | 3 коммита с одинаковым сообщением |
| RFC nonGoals точны | Partial | «No code changes» противоречит изменению scripts и description |

### Questions for the author

1. Почему оставлены три коммита с идентичным сообщением? Нужно ли склеить (`git rebase -i 3dd8badd`) или это намеренная история попыток?
2. `packages/werkstatt/package.json` description изменён ради trigger'a `ecosystem.commit` — стоит ли вместо этого расширить `isPlatformScope`, чтобы root `package.json` считался platform-scope при `--bump`?
3. RFC-0780 `nonGoals` говорит «No code changes» — но scripts и description изменены. Нужно ли поправить формулировку?
