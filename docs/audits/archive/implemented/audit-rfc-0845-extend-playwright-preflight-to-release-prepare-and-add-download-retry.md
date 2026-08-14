---
rfcId: RFC-0845
auditId: AUDIT-RFC-0845-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0845

## Verdict: Needs revision

RFC содержит два механических нарушения (V-24 error, V-19 warning) и несколько семантических проблем: несоответствие между `amends` во frontmatter и телом RFC, отсутствие адресации distribution-reuse path в `release.prepare`, и фактическая ошибка в nonGoals про `leitstand.dev-deploy`.

## Mechanical validation (rfc.validate)

**Fail** — 2 нарушения:

- **V-24 (error)**: `architecture` RFC создан 2026-08-14 (>= 2026-07-07), `satisfies: []` пуст. Требуется хотя бы одна DNA-инварианта (RFC-0331).
- **V-19 (warning)**: `amends: [RFC-0813]`, но RFC-0813 `amendedBy` не включает RFC-0845. RFC-0813 архивирован (`docs/rfcs/archive/implemented/`) — его нельзя редактировать без разархивации.

## Axis A — Structural completeness

- **Несоответствие `amends` и тела RFC**: Frontmatter содержит `amends: [RFC-0813]`, но тело RFC в секции "Architectural fit" явно заявляет два amendment: "RFC-0813 amendment" и "RFC-0647 amendment". RFC-0647 отсутствует в `amends` — он только в `related`. Если RFC изменяет контракт `playwright.chromium.ensure` (команду, введённую RFC-0647), то RFC-0647 должен быть в `amends`, а не только в `related`.
- **Output format**: Нет секции с документацией `--json` shape для изменённых команд. RFC-0813 и RFC-0647 имеют эту секцию.
- **Failure modes**: Нет явной таблицы failure modes с exit codes. Информация частично присутствует в Risks, но не структурирована.

## Axis B — DNA alignment

- **`satisfies: []` пуст для `kind: architecture`** (V-24). RFC-0813 и RFC-0647 — оба `kind: command` с `satisfies: []`, что корректно. RFC-0845 заявлен как `kind: architecture`, что требует хотя бы одну DNA-инварианту. Релевантная инварианта: **DNA-48 (Release discipline)** — RFC добавляет pre-flight check в `release.prepare`, который является частью release state machine. Альтернативно, RFC можно понизить до `kind: command`, чтобы избежать требования.

## Axis C — Ecosystem fit

- **Package boundaries**: `packagesImpacted` корректно указывает `@warpgogol/werkstatt` (release.prepare) и `@warpgogol/werkstatt-site` (ensureChromium).
- **Command lifecycle**: `commands.changed: [release.prepare, playwright.chromium.ensure]` — корректно. Новых команд нет (`proposed: []`, `added: []`).
- **Compass sync**: RFC не указывает, какие `docs/*.xml` файлы нуждаются в синхронизации. `docs/verification-plan.xml` может потребовать обновления, т.к. `release.prepare` меняет поведение.

## Axis D — Forward-only compliance

No issues. RFC напрямую модифицирует `ensureChromium` и `release.prepare` — нет shim'ов, нет dual-path, нет backward compatibility layers.

## Axis E — Agent-facing policy

- **Status gate**: Нет self-authorizing language. Корректно.
- **Implementation notes**: Ссылается на RFC-0224 (accepted→implemented) и RFC-0334 (supersede escalation). Корректно.
- **NEEDS CLARIFICATION markers**: Не найдены.

## Axis F — Pragmatism

- **`kind: architecture` questionable**: RFC делает то же тип операционного улучшения, что RFC-0813 и RFC-0647 (оба `kind: command`). Pre-flight check + retry — это command-level changes, не архитектурные решения. Понижение до `kind: command` устранило бы V-24 и было бы более точной классификацией.

## Axis G — Blind spots

- **Distribution-reuse path не адресован**: `release.prepare` имеет путь reuse distribution (строки 226-278 в `release-commands.ts`), где `build.post` не запускается и Chromium не нужен. RFC-0813 явно пропускает pre-flight на reuse path. RFC-0845 не указывает, где именно вставлять pre-flight относительно проверки `canReuseDistribution`. Если pre-flight вставить до reuse-проверки, он будет впустую запускать браузер на reuse path. RFC должен явно указать: "после проверки `canReuseDistribution`, перед `build.prepare`" — как в RFC-0813.
- **nonGoals фактическая ошибка**: NonGoal гласит "leitstand.dev-deploy does not run Playwright-dependent build steps". Это неверно — `leitstand.dev-deploy` запускает `build.post` (41 шаг), который требует Playwright Chromium. `leitstand.propagate` действительно не запускает build steps (деплоит готовый release) — эта часть корректна. Формулировка nonGoal должна быть исправлена: либо убрать `leitstand.dev-deploy` из nonGoals, либо уточнить, что `build.post` внутри `leitstand.dev-deploy` уже имеет `playwright.chromium.ensure` (RFC-0647) и retry добавляется в этом RFC.

## Questions for the author

1. Должен ли RFC быть `kind: command` (как RFC-0813 и RFC-0647) вместо `kind: architecture`? Это устранило бы V-24 и было бы более точной классификацией.
2. Если RFC остаётся `kind: architecture`, какая DNA-инварианта удовлетворяется? DNA-48 (Release discipline) — кандидат, но тело RFC не объясняет, как именно.
3. Где именно в `release.prepare` должен быть вставлен pre-flight — до или после проверки `canReuseDistribution`? RFC-0813 явно пропускает reuse path — RFC-0845 должен сделать то же.
4. Должен ли RFC-0647 быть в `amends` (а не только в `related`), учитывая что тело RFC явно называет секцию "RFC-0647 amendment"?
