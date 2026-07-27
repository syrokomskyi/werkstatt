---
rfcId: RFC-0385
auditId: AUDIT-RFC-0385-01
date: 2026-07-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0385

## Verdict: Approved

The RFC correctly identifies a real, verified secret-key drift between the adapter's `requiredSecrets` contract, the delivery route's injection, and the adapter's `route()` read path. The proposed fix is a minimal, forward-only rename with no compatibility shim, directly aligned with DNA-40. Two minor findings on `commands.changed` precision and `appsImpacted` completeness are non-blocking clarifications.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate RFC-0385 --json` returns 0 violations.

## Axis A — Structural completeness

No issues. All sections contain real content:

- **Decision** is a single present-tense decision: "The single canonical tenant-secret name … is `SUPABASE_BUFFER_TENANT_ID`."
- **TypeScript contracts** show minimal type signatures (the `SUPABASE_BUFFER_SECRETS` tuple and the import/injection diff).
- **File system responsibilities** table names five concrete paths.
- **Failure modes** documents the `supabase-buffer: missing credentials` throw condition and validator failure semantics.
- **Rollout** is six concrete steps with a cross-reference to the RFC-0387 runbook for operator secrets migration.
- **Alternatives considered** lists two real alternatives (compatibility alias, reverse rename) with rejection reasons.
- **Risks** includes agent misinterpretation risk and false-positive validator analysis.
- **Acceptance criteria** are seven checkable items covering the rename, grep verification, validator pass, and scoped build.
- **Implementation notes** are explicit behavioral rules with forward-only and supersede-escalation guidance.

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-40]` — DNA-40 (Env-example and deploy-script contract) requires a single documented env variable per capability with no hidden drift. The RFC body §"Architectural fit" explains precisely how the fix makes the runtime-read secret name, the `requiredSecrets` contract, and the documented spec name identical — the exact invariant DNA-40 protects.
- No new DNA invariant is established.
- No conflict with any existing DNA invariant.
- `related[]` references (DNA-40, RFC-0176, RFC-0181, RFC-0186, RFC-0190, RFC-0191, RFC-0387) are all relevant and not decorative.

## Axis C — Ecosystem fit

Minor finding:

- **`commands.changed` precision.** The RFC lists `env.contract.validate` and `integration.secrets.validate` under `commands.changed`, but does not describe any code changes to these validators. The fix is to source code (`adapter.ts`, `integration-delivery.api.ts`, manifest YAML). The validators appear to already enforce secret-name consistency — they pass or fail based on whether the source aligns. If no validator code is modified, `commands.changed` may be misleading; the RFC should clarify whether validator code changes are needed or whether the listing means "commands whose pass/fail behavior changes as a consequence of the source fix."

Otherwise no issues:

- Package boundaries respected: changes flow `packages/* → packages/*`, no app→app or app→services imports.
- No new commands proposed; pipeline placement unchanged.
- AGENTS.md updates identified: the adapter's README and AGENTS.md secret-name references.
- Cosmic naming not applicable.
- Both `changed` commands are existing registered commands (verified in `site-kernel-checks/src/`).

## Axis D — Forward-only compliance

No issues.

- No compatibility shim, no dual read, no bridge.
- The retired `TENANT_ID` name is deleted in the same change.
- The RFC amends RFC-0186 directly — it changes the buffer adapter's secret contract, not adding a parallel interpretation.
- Implementation notes explicitly forbid reintroducing `TENANT_ID` as a fallback.

## Axis E — Agent-facing policy

No issues.

- No self-authorizing language — the RFC states "Agents MAY implement code changes ONLY when this RFC has status `accepted`."
- Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict).
- No content authoring involved — all changes are code/schema.
- Storage policy not applicable (no persistence changes).

## Axis F — Pragmatism

Minor finding:

- **`appsImpacted` completeness.** The list is empty, but any app using the `chat-widget-section` manifest (webgogol-com) will have its generated env schema change when the manifest's `api[].secrets` entry is renamed from `TENANT_ID` to `SUPABASE_BUFFER_TENANT_ID`. While no direct app source code changes are needed (the env schema is generated from the manifest), the operator's `.env` / `.env.production` files must rename the key. The RFC could note this in `appsImpacted` or in the rollout, though the cross-reference to RFC-0387's runbook partially covers it.

Otherwise no issues:

- No new commands — the fix is a rename, not a new capability.
- TypeScript contracts are minimal.
- `packagesImpacted` lists exactly the two packages with code changes.
- `nonGoals` are explicit and meaningful (no buffer table changes, no alias, no other secret changes).

## Axis G — Blind spots

No issues.

- **Performance:** not applicable (no build-time scan commands).
- **False positives:** not applicable (no new validators; existing validators become stricter, not looser).
- **Edge cases:** the RFC notes the buffer destination has never been live for any site, limiting blast radius.
- **Migration path:** documented in rollout step 6 and cross-referenced to RFC-0387's integrator runbook.
- **Security/privacy:** the fix improves secret naming consistency — `TENANT_ID` is an unqualified name that could collide with unrelated tenant-scoped variables; `SUPABASE_BUFFER_TENANT_ID` is prefixed and unambiguous.

## Questions for the author

1. The `commands.changed` list includes `env.contract.validate` and `integration.secrets.validate`, but the RFC describes no code changes to these validators. Do they need code changes, or do they already enforce the canonical name correctly once the source alignment is fixed? If no validator code is modified, should the listing be qualified (e.g., "behavior changes as a consequence of source fix, no validator code change")?
2. The `chat-widget-section.manifest.yaml` `api[].secrets` entry (line 68) is the source for the generated `astro:env` schema. The RFC's file system responsibilities table lists this manifest, but the TypeScript contracts section does not show the YAML diff. Should the RFC include the manifest YAML change as an explicit contract snippet for agent clarity?
3. Should `appsImpacted` include `webgogol-com` (or note that any app using the chat-widget section is transitively impacted via the generated env schema), or is the manifest-driven propagation considered fully transparent to the app layer?
