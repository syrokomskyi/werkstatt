---
rfcId: RFC-0805
auditId: AUDIT-RFC-0805-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0805

## Verdict: Needs revision

The RFC proposes adding `service.naming.validate` as a new command, but this command already exists — implemented by RFC-0751 (archived/implemented) at `packages/werkstatt-site/src/checks/services/service-naming-validate.ts`, registered in command table `30-check-warpgogol.ts:73-84`, and already integrated into `services.check.run` pipeline (`services-check.ts:32-44`). Two of the RFC's acceptance criteria are already met. Additionally, RFC-0751 intentionally named these services WITH the `-worker` suffix (renaming `gogol-rate-fetcher` → `rate-fetcher-worker`), so RFC-0805 reverses a decision of RFC-0751 without referencing it.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0805 --json` reports 0 violations.

## Axis A — Structural completeness

1. **File system responsibilities table misses `services/*/service.config.yaml`** — each renamed service has `service.config.yaml` with `id: <old-name>` that must be updated. The existing `service.naming.validate` checks this file (SVC-NAME-03), so a mismatch would be caught, but the RFC should list it explicitly.

2. **Misses `services/lagebild-sync-worker/AGENTS.md`** — line 24 has `deploy: site-kernel run deploy.preflight --service lagebild-sync-worker && wrangler deploy --secrets-file .env`. The service name reference needs updating. (The `site-kernel` → `werkstatt` CLI name is a separate pre-existing issue from RFC-0776.)

3. **Misses `services/maturity-score-worker/README.md`** and **`services/maturity-score-worker/AGENTS.md`** — both reference `maturity-score-worker` and `@warpgogol/maturity-score-worker` by name.

4. **TypeScript contracts diverge from existing implementation** — the RFC proposes `ServiceNamingViolation` and `ServiceNamingValidateResult` interfaces, but the existing `service.naming.validate` returns `KernelCommandResult<CheckResult>` with `Diagnostic[]`. The RFC should align with the existing pattern or explain why a different shape is needed.

5. **Failure mode rule IDs conflict** — the RFC proposes SN-01..SN-07, but the existing validator uses SVC-NAME-01..SVC-NAME-05. Two commands with the same name emitting different rule IDs would confuse agents and operators.

## Axis B — DNA alignment

1. **DNA-6 scope mismatch** — DNA-6 says "All filenames in `apps/` and `packages/` use kebab-case." It does not mention `services/`. The RFC claims to "extend naming convention enforcement to `services/*` directories" but does not propose extending DNA-6's scope to cover `services/`. Either propose a DNA-6 extension or acknowledge this is a new convention not grounded in DNA-6.

2. **DNA-40 `satisfies` is weak** — DNA-40 governs env-example and deploy-script contracts. The RFC touches `wrangler.jsonc` names and deploy scripts, but the env-and-deploy contract itself remains intact. "Touches files governed by DNA-40" is not the same as "enforces, protects, or extends DNA-40."

3. **No new DNA invariant proposed** — if the `-worker` suffix prohibition is a new naming convention for `services/`, it should either extend DNA-6 or establish a new DNA invariant. The RFC lists `satisfies: [DNA-6, DNA-40]` but doesn't propose new DNA.

## Axis C — Ecosystem fit

1. **CRITICAL: `service.naming.validate` already exists (RFC-0751)** — the command is implemented at `packages/werkstatt-site/src/checks/services/service-naming-validate.ts`, registered in `30-check-warpgol.ts:73-84`, and integrated into `services.check.run` (`services-check.ts:32-44`). The RFC's `commands.proposed` and `commands.added` both list it as new. Acceptance criteria "service.naming.validate command implemented and registered" and "service.naming.validate integrated into services.check.run pipeline" are already met.

2. **RFC-0751 not referenced** — RFC-0751 established `service.naming.validate` and intentionally named these services WITH the `-worker` suffix (renaming `gogol-rate-fetcher` → `rate-fetcher-worker`, `gogol-lagebild-sync` → `lagebild-sync-worker`). RFC-0805 reverses this decision. `amends[]` should include RFC-0751, or `related[]` should list it. The RFC should explain why the `-worker` suffix, which RFC-0751 deliberately added, is now considered redundant.

3. **RFC-0751 success signal contradiction** — RFC-0751's success signal says "`service.naming.validate` enforces that Worker names match service IDs — no `gogol-*` or `warpgogol-*` prefixes." RFC-0805's proposed suffix check is a new rule not covered by RFC-0751, but it should be framed as an amendment to RFC-0751, not a new command.

4. **`packagesImpacted` incomplete** — the rename touches `services/*` workspaces (directory names, `package.json`, `wrangler.jsonc`, `service.config.yaml`, AGENTS.md, README.md). These are not packages, but the field should acknowledge the impact or the RFC should note that services are also impacted outside `packagesImpacted`.

## Axis D — Forward-only compliance

No issues. The rename is a clean break — no compatibility shims, no dual-paths. Old Workers are deleted after new ones are deployed.

## Axis E — Agent-facing policy

1. **Implementation notes reference generic governance rules** — the notes say "reference this RFC ID in commits" and "run `rfc.supersede.propose` on invariant conflict" but don't reference specific RFC numbers (RFC-0224 for accepted→implemented, RFC-0334 for supersede escalation). The template comments are generic enough to be acceptable, but specific references would be better.

2. **No NEEDS CLARIFICATION markers** — none found. Clean.

## Axis F — Pragmatism

1. **Extend existing validator instead of creating a new command** — the existing `service.naming.validate` (SVC-NAME-01..05) should be extended with a new rule (e.g. SVC-NAME-06: id must not end with `-worker`) rather than creating a new command with the same name, different rule IDs (SN-01..07), and different TypeScript interfaces. This is the minimality ladder: rung 2 ("already in this codebase? → reuse it").

2. **`nonGoals` singles out one service** — "Renaming non-Worker services (check-warpgogol-runner)" but doesn't mention `cf-analytics-poller`, `fleet-probe-runner`, `matomo-proxy`, `observability-stack`, `telegram-alert-bridge`. Should say "Renaming services that don't have a `-worker` suffix" generically.

## Axis G — Blind spots

1. **`pnpm-lock.yaml` churn** — mentioned in Risks but not in file system responsibilities. Renaming `package.json` `name` fields regenerates the lockfile. This is expected but should be listed.

2. **Validator scans registry, not directories** — the RFC says the validator "scans every `services/*/` directory" but the existing `service.naming.validate` scans `services/registry.yaml` entries. If a service directory exists but isn't in the registry, it wouldn't be checked. The RFC should clarify whether it scans directories or registry entries, and whether unregistered services should be flagged.

3. **`services/lagebild-sync-worker/AGENTS.md` deploy script** — uses old CLI name `site-kernel` (pre-existing from RFC-0776). The rename will touch this line; the RFC should note that `site-kernel` → `werkstatt` is a separate pre-existing issue and the rename only changes the service name part.

## Questions for the author

1. RFC-0751 already implements `service.naming.validate` and intentionally named these services WITH the `-worker` suffix. Should this RFC amend RFC-0751 to add a `-worker` suffix rule to the existing validator, rather than proposing a new command with the same name?

2. DNA-6 covers `apps/` and `packages/` but not `services/`. Should this RFC propose extending DNA-6 to cover `services/`, or is the `-worker` suffix prohibition a standalone convention that doesn't need DNA grounding?

3. The existing `service.naming.validate` returns `CheckResult` with `Diagnostic[]` and uses SVC-NAME-* rule IDs. The RFC proposes `ServiceNamingValidateResult` with SN-* rule IDs. Should the implementation reuse the existing pattern (add SVC-NAME-06 to the existing validator) or replace it?
