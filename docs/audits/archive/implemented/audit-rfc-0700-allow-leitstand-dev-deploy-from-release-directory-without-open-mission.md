---
rfcId: RFC-0700
auditId: AUDIT-RFC-0700-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0700

## Verdict: Needs revision

RFC корректно решает реальную проблему (необходимость открывать миссию только для re-deploy на dev), но имеет существенные пробелы в дизайне: TypeScript-контракты не соответствуют фактическому `DevDeployResult`, output format не совпадает с реальной формой, и не указано как заполняются обязательные поля `missionId`/`commitSha` при release-пути. Также `amends: []` хотя RFC явно амендует RFC-0628.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

### Axis A — Structural completeness

- **TypeScript contracts не соответствуют коду.** RFC показывает `DevDeployResult` (lines 131-135) с полями `releaseDeployed?: string` и `buildSkipped: boolean` как новыми, но фактический `DevDeployResult` в `leitstand-commands.ts:563-586` уже имеет `buildSkipped: boolean` (line 569) и множество других полей (`missionId`, `commitSha`, `buildState`, `deployState`, `buildIdentity`, `axiom`, `evidenceSynced`, `evidenceSyncError`). RFC должен показать полный интерфейс с новыми полями, а не сокращённую версию с `// existing fields...`.
- **Output format не соответствует фактической форме.** RFC (lines 149-158) показывает `{"status": "ok", "url": "...", "cdnPurged": true, "healthCheckPassed": true}`, но фактический результат использует `"command": "leitstand.dev-deploy"`, `"deployState": "succeeded"`, `"deploymentUrl": "..."` и т.д. RFC должен показать реальный JSON-shape.
- **`axiom` field в release-пути.** RFC говорит "skip axiom checks" (line 92), но не указывает значение поля `axiom` в результате. Должно быть `status: "not-run"` с нулевыми счётчиками — это нужно указать явно.
- **`successSignals` и `nonGoals` пустые.** Для command RFC это допустимо, но `nonGoals` должен явно исключить изменения propagate/promote/rollback.
- **`related` включает ADR-0026 и ADR-0027** — они касаются Playwright pinning и sourceDotenv empty-value skipping, не имеют отношения к дизайну этого RFC. Они были исправлены в том же release cycle (r000012), но это не делает их related. Уберите их или объясните связь.

### Axis B — DNA alignment

- `satisfies: []` — для `kind: command` это допустимо (RFC-0331 не требует `--satisfies` для command RFCs).
- RFC не упоминает DNA-48 (Release discipline) и DNA-49 (Fleet propagation), которые RFC-0628 удовлетворяет. Хотя этот RFC их не нарушает, стоит явно указать в Architectural fit, что DNA-48/DNA-49 не затрагиваются (release state machine не меняется, propagate gate не меняется).

### Axis C — Ecosystem fit

- **`amends: []` — но RFC амендует RFC-0628.** Line 98: "RFC-0628: amends the dev deployment channel". Формально `amends` должно быть `[RFC-0628]`. Без этого `amendedBy` у RFC-0628 не будет обновлён, и связь не отслеживается.
- **Module registration `reads` не обновлён.** `leitstand.module.ts:54` — `reads: ["systems/registry.yaml", "missions/{mission}/workpiece/**"]`. При `--release` команда также читает `releases/{release}/**` и `releases/{release}/release.yaml`. RFC должен указать, что `reads` в module registration нужно расширить.
- **`writes` не меняется** — release-путь не пишет в registry/bordbuch (как и workpiece-путь per RFC-0628). Это корректно, но RFC должен явно это подтвердить.
- **Package boundaries** — `packagesImpacted: ["@warpgogol/site-kernel-handoff"]` — корректно, изменения только в `leitstand-commands.ts` и `leitstand.module.ts`.

### Axis D — Forward-only compliance

No issues. `--release` флаг аддитивный, backward-compatible. Нет compatibility shim или dual-path.

### Axis E — Agent-facing policy

- **Status gate** — корректно: "Agents MAY implement code changes ONLY when this RFC has status: accepted" (line 202).
- **Implementation notes** — ясные behavioural rules: не использовать `--release` как shortcut, не ослаблять open-mission requirement для workpiece-пути.
- **Edge case: `--release` + `--system` mismatch.** RFC не указывает, что делать если release не принадлежит указанному system. Нужно ли проверять `releaseManifest.systemId === systemId`? Это пробел.
- **Anti-fabrication** — нет content authoring, только code changes. OK.

### Axis F — Pragmatism

- **Flag vs new command** — `--release` flag на существующей команде проще нового `leitstand.redeploy`. Alternatives section честно рассматривает 3 альтернативы.
- **TypeScript contracts** — минимальны, но не соответствуют фактическому интерфейсу (см. Axis A).
- **`related` list** — ADR-0026/0027 не информируют дизайн. Они были исправлены в том же release cycle, но не имеют архитектурной связи с этим RFC.

### Axis G — Blind spots

- **Secrets resolution path.** RFC говорит "convention-based `.env.alt`/`.env.main` paths are reused" (line 99), но не указывает, что для release-пути используется `releases/<id>/.env.alt` (dev channel → `.env.alt` per RFC-0666). Нужно явно указать путь.
- **Wrangler binary resolution.** `leitstand.propagate` resolves `node_modules/.bin` from the workpiece (leitstand-commands.ts:1671-1686). Release directory не имеет `node_modules/`. Как `wrangler` будет найден при release-деплое? RFC должен указать: fallback на `process.env` PATH или на workpiece `node_modules/.bin` (если mission ещё существует). Это критический пробел — без wrangler binary deploy не сработает.
- **`missionId` и `commitSha` в результате.** `DevDeployResult.missionId` и `.commitSha` — обязательные поля. При `--release` нет активной миссии. RFC должен указать: берутся из `release.yaml` (`releaseManifest.missionId`, `releaseManifest.commitSha`)? Или `missionId` пустой? Это нужно явно специфицировать.
- **`buildIdentity` в результате.** Workpiece-путь пишет `build-identity.json` в `dist/client/.well-known/`. Release-дист уже содержит его (создан во время `release.prepare`). Нужно ли его перезаписывать? Проверять? RFC не адресует это.
- **Bordbuch / registry writes.** RFC не явно указывает, что release-путь НЕ пишет в registry и bordbuch (как workpiece-путь per RFC-0628). Стоит добавить в Design.
- **`--force-build` interaction.** RFC говорит "ignored when `--release` is set" (line 118), но не указывает, это warning или silent ignore. Silent ignore может запутать оператора.

### Questions for the author

1. Как `missionId` и `commitSha` заполняются в `DevDeployResult` при `--release`? Из `release.yaml`? Нужно явно указать.
2. Как `wrangler` binary будет найден при release-деплое, если `releases/<id>/` не имеет `node_modules/`? Fallback на PATH? На workpiece `node_modules/.bin`?
3. Почему `amends: []`? RFC явно амендует RFC-0628 (line 98). Должно ли быть `amends: [RFC-0628]`?
4. Нужно ли проверять, что release принадлежит указанному `--system`? Что делать при mismatch?
5. Какие значения `axiom`, `buildIdentity`, `evidenceSynced` в результате при release-пути?
