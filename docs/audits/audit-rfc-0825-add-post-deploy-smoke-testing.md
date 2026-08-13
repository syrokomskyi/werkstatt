---
rfcId: RFC-0825
auditId: AUDIT-RFC-0825-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0825

## Verdict: Needs revision

RFC-0825 is architecturally sound and well-structured, but has a duplicate YAML entry, missing Compass/AGENTS.md sync obligations, and unspecified evidence storage and body serialization details that must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations, zero markers.

## Axis A — Structural completeness

1. **Duplicate `/health` entry in service smoke YAML example** (RFC lines 99–107). The `lagebild-sync` service has two `/health` entries: the first has `expectBodyContains` but no `method`, the second has `method: GET` but no `expectBodyContains`. This appears to be a copy-paste error — should be a single entry with both fields, or the second entry should be a different path.

2. **Acceptance criteria do not include unit test coverage for `smoke-runner.ts`.** The RFC lists 11 acceptance criteria, none of which require unit tests for the smoke runner itself. A pure-function test for the runner's status-code matching and body-contains logic is essential for maintainability.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-66]` references a real invariant in `docs/architecture-dna.md:279`. The RFC body explains how it implements the L5 layer. `related: [DNA-66, RFC-0806, RFC-0823]` are all relevant.

## Axis C — Ecosystem fit

1. **Missing Compass document sync obligations.** The RFC adds two kernel commands and changes deployment pipeline behavior (leitstand commands call smoke tests after health checks). `docs/verification-plan.xml` likely needs updates to reflect the new smoke test verification step, but the RFC does not identify any `docs/*.xml` files for synchronization.

2. **Missing AGENTS.md update obligations.** `services/AGENTS.md` should document the smoke test YAML format and the `service.smoke.run` command. `packages/werkstatt-site/AGENTS.md` should document the `testing/smoke/` directory. The RFC does not mention either.

3. **Package boundaries are correct.** Smoke YAML and runner live in `packages/werkstatt-site/src/testing/smoke/` (site plugin). Leitstand commands in `packages/werkstatt/src/leitstand/` call smoke via `executeKernelCommand` (kernel command invocation), not direct import. This respects DNA-64 (engine must not import stack plugins).

## Axis D — Forward-only compliance

No issues. The existing `runHealthCheck` is generalized, not kept alongside a parallel system. No shims, no dual-paths, no backward compatibility layers.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). Implementation notes reference RFC-0224. No NEEDS CLARIFICATION markers found. No persistence or storage policy concerns.

## Axis F — Pragmatism

1. **Two commands justified.** `service.smoke.run` and `site.smoke.run` have different YAML schemas (endpoints vs paths) and different pipeline integration points. Merging them into one command with a `--target` flag would complicate the YAML format and CLI surface. The separation is pragmatic.

2. **Lean contracts.** TypeScript types are minimal and sufficient. No speculative generality.

3. **Existing pattern reuse.** The RFC explicitly generalizes `runHealthCheck` from `packages/werkstatt/src/leitstand/service-deploy-helpers.ts:141` rather than creating a parallel system.

## Axis G — Blind spots

1. **Smoke evidence storage is unspecified.** The acceptance criterion says "Smoke evidence recorded in deployment state" but the RFC does not specify where or in what format. For services, is it a new field in `services/registry.yaml` `lastDevDeployed`/`lastDeployed`? For sites, is it in the release state? What fields are added? The `SmokeRunResult` type is defined but its persistence target is not.

2. **Body serialization format is unspecified.** The `SmokeEndpoint.body` field is `Record<string, unknown>`, but the RFC does not specify how the body is serialized for the HTTP request. The `POST /api/send-message` example (RFC line 146) implies form data, but there is no `Content-Type` field or serialization method in the TypeScript contract. The smoke runner needs to know whether to send JSON (`Content-Type: application/json`) or form-encoded (`Content-Type: application/x-www-form-urlencoded`).

3. **Missing smoke YAML file behavior is unspecified.** The RFC specifies failure when a service/site is not in the YAML ("no smoke configuration found for <id>"), but does not specify what happens when the smoke YAML file itself is missing. Should the command error, or should it skip with a warning? This matters for the transition period when the YAML files don't exist yet.

4. **CDN propagation for site smoke tests.** The Risks section mentions CDN propagation delays, but only for the existing `verifyFreshness` loop. Site smoke tests run after Axiom checks, which already include freshness verification. However, `leitstand.propagate` and `leitstand.promote` for sites may have different freshness guarantees. The RFC should confirm that smoke tests run after freshness is confirmed for all pipeline commands, not just dev-deploy.

## Questions for the author

1. Where exactly is smoke evidence persisted? Specify the file path, field name, and data shape for both services (`services/registry.yaml`?) and sites (release state?).
2. How is the `body` field in `SmokeEndpoint` serialized? Is it JSON or form-encoded? Does the smoke runner need a `contentType` field?
3. What happens when the smoke YAML file itself does not exist (not just a missing entry)? Error or skip-with-warning?
4. Should the acceptance criteria include unit test coverage for `smoke-runner.ts`?
