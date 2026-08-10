---
rfcId: RFC-0800
auditId: AUDIT-RFC-0800-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0800

## Verdict: Needs revision

RFC contains two critical factual errors (RFC-0137 mischaracterized as rejected; pipeline placement references a pipeline where `template.imports.validate` does not exist) and a scope contradiction (workspace-scope command requiring `--site`). These must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0800 --json` exits 0, zero violations.

## Axis A — Structural completeness

- **A-1**: `successSignals: []` is empty. A command RFC that guarantees template dependency sync should declare observable success signals (e.g. "template.deps.drift passes on all sites after mission.close", "mission.close auto-sync produces zero-drift template"). (line 52)
- **A-2**: `nonGoals: []` is empty. The Alternatives section mentions "Compare all package.json fields" was rejected, but `nonGoals` should explicitly state out-of-scope items (e.g. "Does not sync scripts or engines", "Does not compare astro.config.mjs blocks"). (line 53)

## Axis B — DNA alignment

No issues. `kind: command`, `satisfies: []` is correct — command RFCs do not require DNA invariants.

## Axis C — Ecosystem fit

- **C-1 (critical)**: RFC-0137 is `status: implemented`, not rejected. Line 98 states "RFC-0137 (rejected): prior attempt to sync app dependency versions into onboarding templates." This is factually wrong — RFC-0137 was implemented and `config.template.sync` is an active command. The RFC should describe RFC-0137 as "implemented" and explain that this RFC automates the manual sync that RFC-0137 established, not that it "succeeds where RFC-0137 was rejected."

- **C-2 (critical)**: Pipeline placement error. Line 187 states "template.deps.drift is added to `SITES_BUILD_CHECK_PIPELINE` after `template.imports.validate`." But `template.imports.validate` is registered in `PACKAGES_CHECK_PIPELINE` (`packages-check.ts:90`), NOT in `SITES_BUILD_CHECK_PIPELINE` (`build-check.ts:20-47`). The new check cannot be placed "after `template.imports.validate`" in a pipeline where the latter does not exist. The RFC must either: (a) place the check in `PACKAGES_CHECK_PIPELINE` after `template.imports.validate`, or (b) place it in `SITES_BUILD_CHECK_PIPELINE` without referencing `template.imports.validate` as a predecessor, or (c) justify why it belongs in `SITES_BUILD_CHECK_PIPELINE` despite its predecessor being in a different pipeline.

- **C-3 (medium)**: Scope contradiction. `scope: workspace` (line 8) but `template.deps.drift` takes `--site <id>` (line 107). Workspace-scope commands run from the monorepo root without a `--site` flag (see RFC-0557's `template.imports.validate` — `scope: workspace`, no `--site`). Either the scope should be `app` (site-scoped check) or the command should resolve the workpiece without `--site` (e.g. auto-discover from current mission context).

- **C-4 (medium)**: `config.template.sync` is invoked from `mission.close` via `executeKernelCommand` with `--site <id>`, but `config.template.sync` is NOT listed in `commands.changed` (line 44-45). The handler at `config-template-sync.ts:141` already reads `input.flags.site` (not `--app` as RFC-0137 documented), but the module declaration at `module.ts:298` still declares `app` as the flag name. The RFC should either: (a) add `config.template.sync` to `commands.changed` and note the module declaration fix, or (b) clarify that `--site` is already supported and no change to the command is needed.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference correct governance rules (RFC-0224, RFC-0334).

## Axis F — Pragmatism

- **F-1 (medium)**: Data flow gap. The RFC says `mission.close` auto-syncs by calling `config.template.sync --site <id>`, which reads from `systems/<site>/package.json` (cache clone) or registry `mirrors[0].path` — NOT from `missions/<mission>/workpiece/package.json`. The drift check reads the workpiece `package.json`, but the sync reads the cache clone. By close time, the cache clone should reflect the workpiece (after reconcile pushes), but the RFC should explicitly document this data flow: workpiece → reconcile → cache clone → `config.template.sync` → template. Without this clarification, an implementer might assume `config.template.sync` reads from the workpiece.

## Axis G — Blind spots

- **G-1 (medium)**: Multiple sites — last close wins. If two sites have different dep versions in their workpieces (e.g. one site updated `wrangler`, another didn't), the last `mission.close` auto-sync overwrites the template with that site's versions. The next materialization of the other site may drift. The RFC should acknowledge this and explain why it's acceptable (e.g. "all sites share the same dep manifest by convention; site-specific deps are a non-goal of the template system").

- **G-2 (minor)**: The `writes` field in `config.template.sync` module declaration (`module.ts:314-315`) still references `packages/os/site-kernel-onboarding/src/templates/...` (old pre-RFC-0776 path). The actual template is at `packages/werkstatt-site/src/onboarding/templates/...`. This is a pre-existing metadata bug, not caused by this RFC, but the RFC should be aware that `config.template.sync` metadata is stale.

## Questions for the author

1. Why does `template.deps.drift` have `scope: workspace` if it requires `--site <id>` to resolve the workpiece? Should it be `scope: app` instead, or should it auto-discover the current mission's workpiece without `--site`?
2. Which pipeline should `template.deps.drift` be added to — `PACKAGES_CHECK_PIPELINE` (where `template.imports.validate` lives) or `SITES_BUILD_CHECK_PIPELINE` (where the RFC says it goes, but which doesn't contain `template.imports.validate`)?
3. How should the RFC describe the data flow for auto-sync: workpiece → cache clone (via reconcile) → `config.template.sync` → template? Should `config.template.sync` be modified to read directly from the workpiece instead of the cache clone?
