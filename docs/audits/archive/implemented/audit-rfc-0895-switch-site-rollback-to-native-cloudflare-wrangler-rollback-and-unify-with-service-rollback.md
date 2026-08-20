---
rfcId: RFC-0895
auditId: AUDIT-RFC-0895-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0895

## Verdict: Needs revision

The RFC contradicts DNA-49 and DNA-52 without superseding the establishing RFCs. It also contains a factual error in the `RollbackInput` contract (claims `workerName` is removed but the proposed interface still has it) and leaves a critical blind spot: where `wrangler rollback` runs for sites (no wrangler config in the cache clone).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **TypeScript contracts — factual error**: Line 158 says "`distPath`, `workerName`, `url`, `secretsFilePath`, `nodeModulesBinPath`, and `toReleaseId` are removed", but the proposed `RollbackInput` interface at line 169 still includes `workerName: string`. Either `workerName` is kept (fix the prose) or it is removed (fix the interface).
- **Output format drift**: The existing `LeitstandRollbackData` interface (`leitstand-commands.ts:1265-1274`) has `rolledBackFrom`, `rolledBackTo`, `deploymentUrl`, `purgeResult`, `releaseState`. The RFC's proposed output format (lines 235-251) uses `target`, `rollbackState`, `operationId` — a completely different shape. The RFC must document the migration from the old data shape to the new one, or explain why the existing fields are dropped.
- **Cache purging not addressed**: The current `runLeitstandRollback` performs CDN cache purging after rollback (`leitstand-commands.ts:1380-1389`). The RFC's design does not mention whether `wrangler rollback` handles this automatically or whether purge logic must be preserved. This is an operational detail that must be specified.

## Axis B — DNA alignment

- **DNA-49 conflict — supersession required**: DNA-49 explicitly states: "All site deployment commands (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`, `leitstand.pipeline.check`) and `release.rollback` are connected to the certification authority via `authorizeDeployment()`, `verifyMainPromotion()`, and `evaluateRollback()` (RFC-0865)." The RFC removes the `evaluateRollback()` call from `leitstand.rollback` and removes `release.rollback` entirely. This changes what DNA-49 mandates. The RFC must `supersede` RFC-0865 (or the relevant portion of RFC-0358 that established DNA-49), not just amend it. The `supersedes` field is empty.
- **DNA-52 conflict — supersession required**: DNA-52 states: "Release, deployment, rollback, and Notausgang workflows resolve artifacts through the store." The RFC removes artifact resolution from rollback. This changes what DNA-52 mandates. The RFC must supersede RFC-0363 (which established DNA-52) or explain why DNA-52 no longer applies to rollback. The `supersedes` field is empty.
- **`satisfies` field incomplete**: The RFC lists only `DNA-49` in `satisfies`, but it also impacts `DNA-52`. If the RFC intends to modify both invariants, both should be in `satisfies` with an explanation. If the RFC superscedes the portions of RFC-0363 and RFC-0865 that connect rollback to these invariants, that must be explicit.

## Axis C — Ecosystem fit

- **Site wrangler config directory — unresolved**: The RFC says "resolve the wrangler config directory from the site's `system-config.yaml`" (line 207, 342), but the current site rollback uses `releases/<releaseId>/dist` as the working directory for `wrangler deploy`. With native `wrangler rollback`, the command needs a directory containing `wrangler.json` (or `.toml`) to run. Sites don't have a persistent wrangler config in the cache clone — it's generated during build and lives in the release artifact's `dist/`. The RFC must specify exactly where `wrangler rollback` runs for sites and how the wrangler config is resolved. This is the single biggest implementation gap.
- **Command lifecycle inconsistency**: The `commands` frontmatter lists `leitstand.rollback` as `changed` and `leitstand.service.rollback` + `release.rollback` as `removed`. But the RFC also unifies the service rollback logic into `leitstand.rollback`. The `changed` bucket should note that the command signature changes fundamentally (new `--service` flag, removed `--to-release`, removed `--gate-decision`).
- **AGENTS.md update scope**: The RFC says "AGENTS.md updated" but doesn't specify which AGENTS.md. The root `AGENTS.md` has a detailed section on deployment commands including `leitstand.rollback` and `release.rollback` with `--gate-decision` requirements. The RFC should identify the specific sections to update.

## Axis D — Forward-only compliance

- **No issues.** The RFC removes legacy commands (`leitstand.service.rollback`, `release.rollback`) and the old re-deploy rollback path in-place. No compatibility shim or dual-path is proposed. Forward-only compliant.

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language found. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes reference correct governance rules**: RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), RFC-0330 (verification evidence) are all referenced correctly.
- **NEEDS CLARIFICATION markers**: No unresolved markers found.

## Axis F — Pragmatism

- **Minimal command surface**: Unifying `leitstand.rollback` and `leitstand.service.rollback` into one command with `--site`/`--service` duality is a pragmatic simplification. Good.
- **`evaluateRollback` retention**: The RFC correctly retains `evaluateRollback` and `evaluateRollbackRequest` in the codebase rather than deleting them, since other commands may still use them. However, if no other command calls `evaluateRollback` after this RFC, it becomes dead code. The RFC should verify whether any other command still calls these functions.
- **`release.rollback` removal**: The RFC removes `release.rollback` but its effect record writing (Bordbuch entry) may still be needed. The RFC says "Deployment effect records are still written after rollback" but doesn't specify whether the Bordbuch entry that `release.rollback` writes is preserved in `leitstand.rollback`.

## Axis G — Blind spots

- **Site wrangler config resolution**: As noted in Axis C, the RFC doesn't specify where `wrangler rollback` runs for sites. This is the critical implementation gap.
- **Lock semantics for sites**: The RFC mentions lock acquisition failure in failure modes but doesn't specify which lock is acquired for site rollback. The current site rollback doesn't show explicit lock acquisition (unlike service rollback which uses `acquireServiceLock`). The RFC should specify the lock mechanism.
- **Effect record shape change**: The existing `LeitstandRollbackData` has fields like `rolledBackFrom`, `rolledBackTo`, `purgeResult` that consumers may depend on. The RFC's new shape drops these. Any consumer reading deployment effect records (e.g. `leitstand.status` at line 1229 reads `record.candidateId`) may break.
- **`leitstand.status` compatibility**: `runLeitstandStatus` (line 1197-1262) reads deployment effect records and expects `record.candidateId`, `record.state`, `record.channel`. The RFC's new effect record shape must remain compatible with `leitstand.status` or `leitstand.status` must be updated.

## Questions for the author

1. DNA-49 explicitly mandates that `leitstand.rollback` is connected to the certification authority via `evaluateRollback()`. This RFC removes that connection. Will you supersede RFC-0865 (or RFC-0358) to amend DNA-49, or do you consider the current `evaluateRollbackRequest` call with hardcoded values (line 1287-1294 of `leitstand-commands.ts`) to already be disconnected from the real certification authority?
2. Where does `wrangler rollback` execute for sites? Sites don't have a persistent `wrangler.json` in the cache clone — the wrangler config is generated during build and lives in `releases/<id>/dist/`. Does the site rollback need a wrangler config in the cache clone, or can `wrangler rollback` run without one (relying on Cloudflare's server-side version history)?
3. The existing `LeitstandRollbackData` has `rolledBackFrom`, `rolledBackTo`, `deploymentUrl`, `purgeResult`, `releaseState`. The proposed output shape drops all of these. Does `leitstand.status` (which reads deployment effect records) need to be updated to handle the new shape, or should the new shape preserve backward-compatible fields?
