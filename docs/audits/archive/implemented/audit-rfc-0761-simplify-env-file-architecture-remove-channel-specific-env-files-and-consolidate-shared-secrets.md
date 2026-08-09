---
rfcId: RFC-0761
auditId: AUDIT-RFC-0761-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0761

## Verdict: Needs revision

RFC корректно диагностирует мёртвую архитектуру `.env.main`/`.env.alt` и предлагает чистое упрощение. Однако rollout пропускает `leitstand.rollback` как caller `resolveConventionSecretsPath`, не упоминает обновление preflight-чеков в `leitstand-commands.ts`, и не уточняет, что удаление gitignored `.env.main`/`.env.alt` файлов — это локальная ФС-операция, а не git-коммит. Также пропущено обновление root `AGENTS.md` line 226.

## Mechanical validation (rfc.validate)

**Pass** с 1 предупреждением:

- V-19: `RFC-0761.amends` includes RFC-0388, but `RFC-0388.amendedBy` does not include RFC-0761. Ожидаемо — будет исправлено при реализации (update `amendedBy` в RFC-0388 frontmatter).

## Axis A — Structural completeness

- **A-1 (minor):** Нет секции "Output format". `deploy.preflight` меняет `target` с `.env.main`/`.env.alt` на `.env` — стоит задокументировать, что output shape неизменен, но `target` всегда указывает на `.env`.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-40]` корректно — RFC amend-ит DNA-40 через `amends: [RFC-0388]` (RFC-0388 был последним, кто обновил DNA-40). Механизм `amends` правильный: RFC меняет правила RFC-0388 (Rules 1, 5, 6, 7) и обновляет DNA-40 entry, не заменяя RFC-0388 целиком.

## Axis C — Ecosystem fit

- **C-1 (finding):** Root `AGENTS.md` line 226 содержит: `Env-and-deploy contract (RFC-0388 / DNA-40) — .env.example, .env.main, .env.alt, deploy.preflight, # How to obtain: instructions`. Rollout не содержит шага для обновления этой строки. Step 14 обновляет `docs/architecture-dna.md`, step 15 обновляет `services/AGENTS.md`, но root `AGENTS.md` пропущен.

- **C-2 (minor):** `commands.changed` не включает `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback`. Их CLI-интерфейс не меняется, но внутреннее поведение (resolution секртов через `resolveConventionSecretsPath`) меняется. Стоит либо включить их в `changed`, либо явно отметить в rollout что эти команды затронуты через `resolveConventionSecretsPath`.

## Axis D — Forward-only compliance

No issues. `.env.main`, `.env.alt`, `.env.secrets-main`, `.env.secrets-alt` полностью удаляются без backward compatibility. `env.main.check` и `env.alt.check` удаляются из command table. Legacy code paths удаляются, не сохраняются за флагом.

## Axis E — Agent-facing policy

No issues. Нет self-authorizing language. Implementation notes ссылаются на RFC-0224, RFC-0330, RFC-0334. Нет NEEDS CLARIFICATION markers. Storage policy не затронута.

## Axis F — Pragmatism

No issues. RFC удаляет 2 команды и не добавляет новых. TypeScript contracts минимальны. `packagesImpacted` корректно перечисляет 3 пакета. Alternatives section содержит 4 реальных альтернативы с причинами отказа.

## Axis G — Blind spots

- **G-1 (finding):** Rollout step 13: "Delete all `.env.main` and `.env.alt` files in workpieces and releases." Эти файлы gitignored (`.env*` с `!.env.example` negation) — они существуют только на локальной ФС оператора и не могут быть удалены через git-коммит. RFC должен уточнить, что это локальная ФС-операция (аналогично тому, как RFC-0388 step 10 указывал "rename existing `.env.production` → `.env.main`" — это была локальная операция).

- **G-2 (finding):** Rollout step 2 перечисляет callers `resolveConventionSecretsPath`: "dev-deploy, propagate, promote". Пропущен `leitstand.rollback` — он также вызывает `resolveConventionSecretsPath` (line 2488 в `leitstand-commands.ts`) с channel-dependent параметром. RFC должен явно включить rollback в step 2.

- **G-3 (minor):** Preflight-чеки в `leitstand-commands.ts` (line 420-422) проверяют существование `.env.alt`/`.env.main` и репортят info-level `convention-env-exists`. RFC не упоминает обновление этого чека — он должен проверять `.env` вместо `.env.alt`/`.env.main`.

## Questions for the author

1. `leitstand.rollback` вызывает `resolveConventionSecretsPath` с auto-detected channel (`promoted` → `main`, `alt-deployed` → `alt`). После удаления channel-specific env files, rollback должен использовать `.env` для всех channels. Как rollback должен определять target env file — всегда `.env`, или сохранять channel detection для других целей?

2. Root `.env.secrets-main` и `.env.secrets-alt` содержат только `CLOUDFLARE_ACCOUNT_ID` (55 bytes каждый). RFC говорит "delete them" в step 12. Эти файлы gitignored — стоит ли добавить явное примечание, что это локальная операция (как G-1)?

3. `deploy.preflight` для sites сейчас требует `--env main|alt`. RFC удаляет `--env` flag. Но `deploy.scripts.validate` в `package.json` deploy scripts вызывает `deploy.preflight --site X --env main`. При реализации, deploy scripts в `package.template.json` и существующих `systems/*/package.json` должны быть обновлены одновременно с `deploy.preflight` — иначе валидация сломается. RFC планирует это (steps 5, 6, 11, 17), но стоит ли добавить explicit note о порядке: сначала обновить `deploy.preflight` и `deploy.scripts.validate` одновременно, затем обновить deploy scripts?
