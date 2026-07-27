---
rfcId: RFC-0559
auditId: AUDIT-RFC-0559-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0559

## Verdict: Needs revision

The RFC correctly targets the auth gap left by RFC-0555 and reuses VC primitives from RFC-0558. However, `commands.changed` lists 12 commands without explaining what changes each command needs (only 3 of 12 currently accept `--actor`), `packagesImpacted` includes `packages/passport` despite RFC-0559 not modifying it, and the `permissive` mode dual-path needs explicit justification under forward-only discipline. Missing AGENTS.md and Compass sync sections.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`commands.changed` lacks design explanation.** The RFC lists 12 commands as `changed` but the Design section does not explain what changes each command receives. The acceptance criteria say "Auth result (actorId, siteId) is passed to underlying Site OS command as `actor` context," but the mechanism is unspecified (CLI flag? env var? MCP metadata?). Currently, only 3 of 12 tools (`mission.open`, `mission.close`, `mission.abort`) accept an `actor` flag in their tool definitions (`packages/studio-gate/src/tools.ts:62,119,132`). The remaining 9 tools (`workpiece.read`, `workpiece.write`, `mission.materialize`, `mission.git.commit`, `mission.validate`, `mission.reconcile`, `release.prepare`, `release.publish`, `leitstand.propagate`) have no `actor` parameter. The RFC must specify how actor context reaches these commands.
- **`auth-config-missing` error has no error code.** The failure modes table (line 246) references `auth-config-missing` in enforced mode, but the Output format section (lines 189-234) only defines error codes for `authentication-required` (-32001), `site-mismatch` (-32002), and `insufficient-scope` (-32003). The `auth-config-missing` error needs a code (e.g., -32004) and an output format example.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-56]` correctly references the Studio Gate invariant. The RFC extends DNA-56 by adding the auth layer that RFC-0555 omitted. `related: [DNA-56, DNA-22, RFC-0555, RFC-0558]` are all relevant and non-decorative.

## Axis C — Ecosystem fit

- **`packagesImpacted` includes `packages/passport` incorrectly.** RFC-0559 imports `StudioGateAuthResult` from `@warpgogol/passport` (line 140), but this type is defined in RFC-0558 (line 194-200 of RFC-0558). RFC-0559 does not add, modify, or remove anything in `packages/passport` — it only consumes it. `packagesImpacted` should list only `packages/studio-gate`.
- **No AGENTS.md updates section.** RFC-0555 includes an explicit "AGENTS.md updates" section (lines 341-344). RFC-0559 lacks one. `packages/studio-gate/AGENTS.md` needs to be updated to document the auth middleware, `auth.ts` module, and the `authMode` configuration.
- **No Compass sync section.** RFC-0555 includes a "Compass sync" section (lines 333-339). RFC-0559 adds a new source file (`packages/studio-gate/src/auth.ts`) but does not identify which `docs/*.xml` files need synchronization (`docs/source-markup.xml` at minimum).
- **Command lifecycle consistency.** `commands.proposed: []` and `commands.added: []` are correct — no new commands. `commands.changed` lists 12 commands, but it is unclear whether the command implementations change or only the MCP server's dispatch logic. If only the MCP server changes (injecting `--actor` from VC), the commands themselves are not changed and should not be listed here. If the commands need new flags, the RFC should document the flag additions.

## Axis D — Forward-only compliance

- **`permissive` mode is a dual-path.** The failure modes table (lines 238-248) shows that in `permissive` mode, all auth failures produce warnings but still execute the command. This is a dual-path: authenticated and unauthenticated access coexist. The forward-only discipline (§_shared/fo-pipeline-conventions.md_ §Forward-only discipline) states "no backward compatibility layers, no shims, no dual-paths." The RFC should either (a) justify why `permissive` mode is a configuration option, not a compatibility layer, or (b) set a timeline for permissive mode removal. RFC-0558 established this pattern, but RFC-0559 inherits and implements it — the justification belongs here.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and contains no self-authorizing language. Implementation notes reference RFC-0224, RFC-0334, and RFC-0330 correctly. No content authoring in acceptance criteria. No cookies or client-side persistence.

## Axis F — Pragmatism

- **`packages/passport` in `packagesImpacted` is incorrect** (see Axis C). Should be removed.
- **`TOOL_SCOPES` mapping duplicates `STUDIO_GATE_TOOLS`.** The RFC defines a separate `TOOL_SCOPES` record (lines 160-173) that mirrors the 12 tool names in `packages/studio-gate/src/tools.ts`. The implementation notes (line 296) say "MUST be kept in sync," but this is a maintenance burden. The RFC should explore deriving scopes from `STUDIO_GATE_TOOLS` (e.g., a `scope` field on `ToolDefinition`) rather than maintaining a parallel mapping.

## Axis G — Blind spots

- **`WERKSTATT_CREDENTIAL` env var fallback is mentioned in risks but not in design.** The risks section (line 266) says "If MCP clients do not support `_meta`, a fallback env var `WERKSTATT_CREDENTIAL` may be needed." But this fallback is not in the Design section, TypeScript contracts, or acceptance criteria. Is it part of the implementation or a future consideration? The RFC should either include it in the design or move it to nonGoals.
- **Malformed `werkstatt.identity.json` not handled.** The failure modes table (line 246) covers "not found" but not "malformed" (invalid JSON, missing `authMode` field, missing `revokedCredentialIds` array). The auth middleware should handle parse errors gracefully.
- **Concurrent credential verification with BuildQueue.** `packages/studio-gate/src/build-queue.ts` (ADR-0005) allows concurrent build-triggering tool calls. The auth middleware runs before the BuildQueue dispatch, but if multiple calls arrive simultaneously, each invokes `identity.credential.verify` independently. This is probably fine (stateless verification), but the RFC should confirm that credential verification is safe under concurrent access to `werkstatt.identity.json` (file reads, revocation list checks).
- **Revoked credential produces `authentication-required` in enforced mode.** The failure modes table (line 243) maps "Credential revoked" to `authentication-required` in enforced mode. A revoked credential is semantically different from no credential — a separate `credential-revoked` error (or at least a distinct `data.reason` field) would help agents and operators diagnose the issue.

## Questions for the author

1. How does the actor context reach the 9 commands that currently have no `--actor` flag? Are these commands modified to accept `--actor`, or is the actor passed via a different mechanism (env var, MCP metadata)? If commands are modified, document the flag additions in the Design section.
2. Is `permissive` mode a permanent configuration option or a rollout-phase-only mechanism? If permanent, justify why it is not a backward compatibility layer under forward-only discipline. If temporary, define the removal timeline.
3. Is the `WERKSTATT_CREDENTIAL` env var fallback part of this RFC's implementation, or is it deferred to a future RFC? If deferred, add it to `nonGoals`.
