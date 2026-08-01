---
rfcId: RFC-0628
auditId: AUDIT-RFC-0628-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0628

## Verdict: Needs revision

RFC вносит архитектурно правильное изменение (workpiece-based dev deploy вместо release-based), но имеет несколько пробелов в design-спецификации: `satisfies` не включает DNA-49, `packagesImpacted` пропускает пакет, который пишет `evidence-capsule.yaml`, механизм добавления `commitSha` в evidence capsule не определён, и rollout не включает обновление AGENTS.md.

## Mechanical validation (rfc.validate)

Pass — 0 errors, 2 warnings:

- **V-19:** `RFC-0628.amends` includes RFC-0627, but `RFC-0627.amendedBy` does not include RFC-0628. Должно быть исправлено при enhance.
- **V-30:** `@warpgogol/ontology` in `packagesImpacted` but `breaksC` is not true. False positive — RFC модифицирует `src/operations/release.ts`, не `src/external-surfaces/`. `breaksC: false` корректен.

## Axis A — Structural completeness

No issues. Все required sections присутствуют с реальным содержимым. Decision в present tense, CLI surface показывает точные команды, TypeScript contracts минимальны, failure modes указывают exit codes, alternatives имеют rejection reasons, acceptance criteria checkable.

## Axis B — DNA alignment

**Finding B1:** `satisfies` содержит только `DNA-48`, но RFC также напрямую меняет DNA-49 (Fleet propagation). Architectural fit section подробно объясняет как RFC amends DNA-49 (`leitstand.deploy` заменён на `leitstand.dev-deploy`, gate logic изменён с `dev-deployed` state + `recordedAt` на `published` state + `missionId` + `commitSha` + `errors === 0`). `satisfies` должно включать `[DNA-48, DNA-49]`.

## Axis C — Ecosystem fit

**Finding C1:** Rollout не включает шаг для обновления `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section. Risks section явно говорит: "The `AGENTS.md` leitstand section must be updated to reflect the new command and state machine." Но в Rollout этого шага нет. Текущий AGENTS.md описывает `leitstand.deploy` с `--release` flag и `dev-deployed` state — это нужно заменить на `leitstand.dev-deploy` с `--system` flag и workpiece-based flow.

**Finding C2:** `packagesImpacted` не включает `@warpgogol/site-kernel-checks`, но RFC предлагает добавить `commitSha` в `evidence-capsule.yaml`. Этот файл пишется `mission.check` в `packages/os/site-kernel-checks/src/mission-check.ts` (line 496-515). Текущая capsule не содержит `commitSha`. Либо:
- RFC должен уточнить, что `leitstand.dev-deploy` post-processes capsule после `mission.check` (тогда изменение остаётся в `site-kernel-handoff`), ИЛИ
- `@warpgogol/site-kernel-checks` должно быть добавлено в `packagesImpacted` если `mission.check` модифицируется.

**Finding C3:** Compass XML sync не адресован. RFC меняет DNA-48 и DNA-49, но не проверяет нужны ли обновления `docs/verification-plan.xml` или `docs/development-plan.xml`.

## Axis D — Forward-only compliance

No issues. Clean removal `leitstand.deploy` и `dev-deployed` state — no backward compatibility shim, no dual-path. Legacy code paths удаляются, не сохраняются behind a flag. "No migration path needed — no release has ever entered `dev-deployed` state in production."

## Axis E — Agent-facing policy

**Finding E1:** RFC говорит что `leitstand.dev-deploy` не пишет в registry и bordbuch ("dev deploys are ephemeral and untracked"), но не уточняет как именно удаляются текущие registry/bordbuch writes из `leitstand.deploy`. Текущий `runLeitstandDeploy` пишет `dep.lastPropagated[channel]` (line 513) и делает `appendBordbuchEntry` (line 568). Rollout step 1 говорит "Remove `leitstand.deploy`" но не указывает явно что registry write и bordbuch append для dev channel удаляются. Implementation notes должны быть explicit об этом.

## Axis F — Pragmatism

No issues. `leitstand.dev-deploy` earns its existence — принципиально другие semantics (workpiece-based, no release, no registry tracking). TypeScript contracts минимальны. Alternatives section рассматривает 5 альтернатив с rejection reasons. `appsImpacted` и `packagesImpacted` корректны (за исключением C2). `nonGoals` meaningful.

## Axis G — Blind spots

**Finding G1:** Механизм добавления `commitSha` в `evidence-capsule.yaml` не определён. `mission.check` пишет capsule (`mission-check.ts:496-515`) но не знает workpiece commit SHA. RFC должен уточнить: либо `leitstand.dev-deploy` передаёт `commitSha` в `mission.check` через новый flag, либо post-processes capsule после `mission.check`.

**Finding G2:** RFC не указывает какой build command использует `leitstand.dev-deploy` для сборки workpiece dist. Текущий `leitstand.deploy` использует pre-built dist из release artifact (rehydrated from artifact store). Новый `leitstand.dev-deploy` builds from source — но какой command? `pnpm build`? `build.prepare`? `mission.build`? Это важно для implementation.

**Finding G3:** Dirty workpiece state не адресован. RFC говорит `commitSha` — это "workpiece HEAD at time of deploy". Если workpiece имеет uncommitted changes, HEAD SHA не представляет actual deployed content. `leitstand.propagate` gate проверяет `evidence.commitSha === release.commitSha` — но release создаётся из clean workpiece (после `mission.close`), а dev deploy может быть из dirty workpiece. RFC должен уточнить: требует ли `leitstand.dev-deploy` clean workpiece, или использует dirty indicator?

**Finding G4:** Secrets resolution ambiguity. RFC говорит что secrets файл находится на `missions/{mission}/workpiece/.env.dev` (File system responsibilities). Но registry имеет `dev.secretsFile: env:WERKSTATT_SECRETS_DEV` (line 23). RFC должен уточнить: использует ли `leitstand.dev-deploy` registry's `dev.secretsFile` или фиксированный путь `.env.dev` в workpiece? Текущий `leitstand.deploy` использует `resolveSecretsFilePath(channelConfig.secretsFile)` из registry.

## Questions for the author

1. Как `commitSha` попадает в `evidence-capsule.yaml`? `mission.check` пишет capsule, но не знает workpiece HEAD SHA. `leitstand.dev-deploy` передаёт его через flag, или post-processes capsule?
2. Какой build command использует `leitstand.dev-deploy` для сборки workpiece dist? `pnpm build` в workpiece directory, или kernel pipeline (`build.prepare`)?
3. Должен ли `leitstand.dev-deploy` отказывать на dirty workpiece, или HEAD SHA достаточен даже с uncommitted changes? Это влияет на `commitSha` match в `leitstand.propagate` gate.
4. Secrets: `leitstand.dev-deploy` использует registry's `dev.secretsFile` (`env:WERKSTATT_SECRETS_DEV`) или фиксированный путь `missions/{mission}/workpiece/.env.dev`?
