---
reviewId: REVIEW-CODE-2026-08-21-01
date: 2026-08-21
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4a812aa0..38dd3760
filesReviewed:
  - packages/werkstatt-site/src/checks/env/env-contract.ts
  - packages/werkstatt-site/src/domain/ui/sections/send-message/send-message-section.api.ts
  - packages/werkstatt-site/src/onboarding/config-regenerate.ts
  - packages/werkstatt-site/src/onboarding/templates/package.template.json
  - packages/werkstatt/src/mission/mission-materialize.ts
---

# Code Review: 4a812aa0..38dd3760

### Verdict: Needs revision

Дифф решает реальную проблему (canonical URL указывает на dev-домен из-за `PUBLIC_SITE_URL` в `.env`), но оставляет две серьёзные пробела: DNA-40 явно требует шесть канонических deploy-скриптов, включая `build:main` и `build:alt` — инвариант не обновлён. Также в коммит попало постороннее изменение тип-аннотации в `mission-materialize.ts:1194`, не связанное с задачей.

### Mechanical floor

- `@warpgogol/werkstatt` typecheck: **pass**
- `@warpgogol/werkstatt-site` typecheck: pre-existing `astro:env/server` virtual module errors (не связаны с диффом)

### Axis A — Structural correctness

- **Stale fixHint path** — `env-contract.ts:578` содержит `fixHint`, ссылающийся на `packages/os/site-kernel-onboarding/src/templates/package.template.json`. Путь удалён после RFC-0776. Правильный путь: `packages/werkstatt-site/src/onboarding/templates/package.template.json`. Дифф модифицирует `REQUIRED_DEPLOY_SCRIPTS` в той же функции — автор был в этом коде и должен был заметить.
- **Постороннее изменение** — `mission-materialize.ts:1194` добавляет явную тип-аннотацию `(e: { markerPolicy: string; conditional: boolean })` к callback'у `.filter()`. Это изменение не относится к задаче исправления canonical URL. Кроме того, аннотация избыточна: массив уже типизирован через `as Array<{ markerPolicy: string; conditional: boolean; path: string; }>` строкой выше (line 1197), и тип `e` выводится автоматически.

### Axis B — DNA alignment

- **DNA-40 violation** — DNA-40 (`docs/architecture-dna.md:177`) явно требует: «`systems/*/package.json` MUST contain the six canonical deploy scripts (`build:main`, `build:alt`, `deploy:main`, `deploy:alt`, `build:deploy:main`, `build:deploy:alt`)». Дифф удаляет `build:main` и `build:alt` из шаблона и из `REQUIRED_DEPLOY_SCRIPTS` в `env-contract.ts`, но не обновляет DNA-40. Инвариант и код теперь противоречат друг другу. Нужно обновить DNA-40: убрать `build:main` и `build:alt` из списка обязательных скриптов и описать новый контракт (четыре скрипта вместо шести).

### Axis C — Ecosystem fit

- **Compass sync** — `docs/architecture-dna.md` (DNA-40) не обновлён. Согласно root `AGENTS.md`, `docs/*.xml` и `docs/architecture-dna.md` должны синхронизироваться с кодовыми изменениями. DNA-40 прямо упоминает `build:main` и `build:alt` — это противоречит новому коду.
- **RFC references** — RFC-0346 (archive) и RFC-0761 (archive) описывают `build:main`/`build:alt` как обязательные скрипты. RFC-0388 (archive) — то же самое. Эти RFC в архиве и имеют статус `implemented`, поэтому обновление DNA-40 достаточно — RFC'ы в архиве не редактируются.
- **fixHint path** — см. Axis A. Ссылка на удалённый путь `packages/os/site-kernel-onboarding/` вводит агентов в заблуждение при исправлении ошибок `DEPLOY-SCRIPTS-02`.

### Axis D — Forward-only compliance

- **Pass** — `PUBLIC_SITE_URL` полностью удалён из генерации конфига, шаблонов и API. Нет shim-слоёв, нет обратной совместимости. `build:alt`/`build:main` удалены, а не оставлены за флагом. `build:deploy:alt` и `build:deploy:main` обновлены на `pnpm run build` — чисто и прямо.

### Axis E — Agent-facing clarity

- **Pass** — Изменения минимальны и понятны. `siteUrl = new URL(request.url).origin` самоочевидно. `SITE_LINE` без комментария `[ALT-DEPLOY]` чище, чем предыдущая версия с многословным комментарием и `process.env` fallback.

### Axis F — Pragmatism

- **Pass** — Каждый изменение минимально: `SITE_LINE` упрощён до одной строки, `send-message` API упрощён (удалён fallback chain), `build:deploy:*` используют plain `build`. Нет новых абстракций, нет over-engineering. Удаление `build:alt`/`build:main` — правильное решение, так как они были мёртвым кодом (build не пересобирается для каждого канала).

### Axis G — Blind spots

- **Edge case: existing workpieces** — В архиве есть миссии (`missions/archive/closed/warpgogol-com-m000014`, `m000013`, `m000054`, `m000069`, `m000074`) с `build:alt`/`build:main` в `package.json` и `AGENTS.md`. Это архивный код — он не активен. Но если любая из этих миссий будет восстановлена, `deploy.scripts.validate` будет падать с `DEPLOY-SCRIPTS-02` на отсутствующих `build:main`/`build:alt`. Это приемлемый forward-only компромисс — восстановление старой миссии требует materialize, который регенерирует `package.json` из шаблона.
- **Security: send-message API** — Использование `new URL(request.url).origin` для QStash callback URL — правильное решение. Callback идёт на тот домен, на который пришёл запрос. Dev/alt запросы → dev/alt callback, main запросы → main callback. Нет риска, что сообщения из dev попадут на продакшн.

### Spec compliance

| Требование | Статус | Evidence |
|---|---|---|
| Hardcode production domain in `astro.config.mjs` | Done | `config-regenerate.ts:132`, `mission-materialize.ts:307` |
| Remove `PUBLIC_SITE_URL` from `.env` files | Done | Workpiece `.env` и cache clone `.env` очищены |
| Fix `send-message` API to use `request.url.origin` | Done | `send-message-section.api.ts:102` |
| Remove dead `build:alt`/`build:main` scripts | Done | `package.template.json:16-18`, workpiece `package.json:16-18` |
| No backward compatibility | Done | Нет shim'ов, нет fallback |
| Update DNA-40 invariant | **Missing** | `docs/architecture-dna.md:177` не обновлён |
| Update `fixHint` stale path | **Missing** | `env-contract.ts:578` ссылается на удалённый путь |

### Questions for the author

1. DNA-40 прямо требует `build:main` и `build:alt` как обязательные скрипты. Почему инвариант не обновлён? Нужно ли создавать RFC для этого изменения или достаточно обновить DNA-40 напрямую?
2. Изменение в `mission-materialize.ts:1194` (тип-аннотация на `.filter()` callback) не относится к задаче. Почему оно попало в коммит? Было ли это осознанным решением?
3. `fixHint` в `env-contract.ts:578` ссылается на `packages/os/site-kernel-onboarding/src/templates/package.template.json` — путь удалён после RFC-0776. Нужно ли исправить это в этом же PR?
