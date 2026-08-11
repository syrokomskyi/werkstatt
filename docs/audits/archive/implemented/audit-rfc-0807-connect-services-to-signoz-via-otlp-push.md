---
rfcId: RFC-0807
auditId: AUDIT-RFC-0807-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0807

## Verdict: Needs revision

The RFC is architecturally sound — PUSH via OTLP is well-justified, the metric registry extension is correct, and the per-service integration plan is concrete. However, it has gaps in `amends[]` declarations (extends DNA-40 and RFC-0337 without listing them), doesn't address services without `.env.example` (matomo-proxy, maturity-score), and proposes a new validator command without justifying why `env.contract.validate` cannot be extended instead.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0807` reports zero violations.

## Axis A — Structural completeness

- **Missing CLI surface**: The RFC mentions `service.otlp.validate` but does not show the exact command invocation with flags and scope. An implementing agent needs to know: is it `werkstatt run service.otlp.validate` (workspace scope, no flags) or does it accept `--service <id>`?
- **Missing output format**: No `--json` shape documented for `service.otlp.validate`. The validator returns diagnostics — what is the JSON structure?
- **Missing failure modes**: The RFC doesn't specify exit codes or warn-vs-fail behavior. Does a missing OTLP env var produce an error or a warning? Is it blocking in `services.check.run`?
- **Missing file system responsibilities table**: The RFC touches concrete files (metric-registry.ts, typed-refs.ts, command-tables, 6+ service `.env.example` files, 5+ service source files) but doesn't list them in a table.
- **Acceptance criterion "Metrics visible in SigNoz UI"** is not agent-verifiable without a specific query or dashboard URL. An implementing agent cannot check this criterion programmatically.

## Axis B — DNA alignment

- **`amends: []` should not be empty**: The RFC's Rollout step 6 says "DNA-40 update — amend to require OTLP env vars in services/*." This extends DNA-40, which was established by RFC-0346 and updated by RFC-0388, RFC-0761, RFC-0806. The RFC should list at least RFC-0346 (or the latest updating RFC, RFC-0806) in `amends[]`. Similarly, the RFC extends RFC-0337's closed metric registry with new metrics and a pattern change — RFC-0337 should be in `amends[]`, not just `related[]`.
- **`satisfies: [DNA-40]`** is correct — the RFC enforces the env-example contract for OTLP env vars. The body explains how (lines 150-156).

## Axis C — Ecosystem fit

- **Missing AGENTS.md update**: `services/AGENTS.md` documents the env-and-deploy contract (RFC-0761 / DNA-40 / RFC-0806). If this RFC extends that contract to require OTLP env vars, `services/AGENTS.md` should be updated with the new requirement. The RFC doesn't mention this.
- **Missing `docs/*.xml` sync**: The RFC doesn't identify which Compass documents need synchronization. If DNA-40 is amended, `docs/requirements.xml` or `docs/technology.xml` may need updates.
- **Pipeline placement not specified**: The RFC says "add to `services.check.run` pipeline" (Rollout step 5) but doesn't specify whether `service.otlp.validate` is blocking (error) or advisory (warning) when OTLP env vars are missing. The existing `env.contract.validate` in the pipeline is blocking — should this be too?
- **`typed-refs.ts` update not mentioned**: `typed-refs.ts` has a compile-time assertion that every `METRIC_REFS` key matches a `WARPGOGOL_METRIC_REGISTRY` name (line 121). Adding new metrics to the registry without adding them to `METRIC_REFS` will cause a compile error. The RFC must mention this file in its Design section.

## Axis D — Forward-only compliance

No issues. The RFC adds a new metric prefix and new env vars without backward compatibility shims. The `METRIC_NAME_PATTERN` update is a breaking change for strict mode, but no existing metrics use the `back` prefix — no migration needed.

## Axis E — Agent-facing policy

No issues. The implementation notes correctly reference RFC-0224 for the accepted→implemented transition. No self-authorizing language. No NEEDS CLARIFICATION markers. No storage policy concerns (no cookies, no client-side persistence).

## Axis F — Pragmatism

- **`service.otlp.validate` vs extending `env.contract.validate`**: The RFC proposes a new workspace-scope command that checks for OTLP env vars in `.env.example` files. The existing `env.contract.validate` already validates `.env.example` files for `# How to obtain:` lines. The RFC should justify why a new command is needed instead of adding an OTLP-specific rule to `env.contract.validate`. If the new command only checks for the presence of two specific env vars, it may not earn its own command surface.
- **Scope discipline**: `packagesImpacted` lists only `@warpgogol/werkstatt-site` — correct. `nonGoals` are explicit and meaningful. `appsImpacted: []` is correct.

## Axis G — Blind spots

- **Services without `.env.example`**: `matomo-proxy` and `maturity-score` do not have `.env.example` files (confirmed by filesystem scan). The RFC's acceptance criterion says "All services have `WARPGOGOL_OTLP_ENDPOINT` / `WARPGOGOL_OTLP_TOKEN` in `.env.example`" — but these services don't have `.env.example` at all. The RFC must address: does `maturity-score` (which currently has no env vars) need a `.env.example` created? Does `matomo-proxy`? The `services/AGENTS.md` says "Services that do not consume environment variables are exempt" — but adding OTLP push means they now consume env vars and are no longer exempt.
- **Typo in code example**: Line 223 has `env.WARPGOL_OTLP_TOKEN` (missing G) — should be `env.WARPGOGOL_OTLP_TOKEN`. An implementing agent could copy-paste this typo.
- **Future service compliance**: The RFC doesn't describe what happens when a new service is added to `services/*`. Does `service.otlp.validate` automatically require all new services (except `observability-stack`) to have OTLP env vars? This should be documented in the Rollout section.
- **`createMetricsPusher` null behavior**: The RFC's code example (lines 225-229) checks `if (pusher)` — this is correct because `createMetricsPusher` returns `null` when endpoint/token are missing (pusher.ts:44-46). But the RFC doesn't explain this behavior for implementing agents who may not be familiar with the pusher API. A one-line note would help.

## Questions for the author

1. Should `service.otlp.validate` be a new command, or should the OTLP env var check be added as a rule to the existing `env.contract.validate`? If new, justify why the existing command is insufficient.
2. `matomo-proxy` and `maturity-score` have no `.env.example` today. Does this RFC require creating `.env.example` for them? If yes, what other env vars do they need?
3. The RFC extends DNA-40 and RFC-0337's metric registry — should these RFCs be listed in `amends[]`?
4. Is `service.otlp.validate` blocking (error) or advisory (warning) in `services.check.run`? What exit code does it produce on failure?
