---
rfcId: RFC-0707
auditId: AUDIT-RFC-0707-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0707

## Verdict: Needs revision

The RFC is structurally well-formed and architecturally sound in its core proposal (6 lifecycle commands in `site-kernel-handoff/src/nachweis/`). However, it has a factual error in pipeline placement (`pbp.content.validate` is not in `build.prepare`), lists packages as impacted that are only consumed (not modified), and has empty `satisfies[]` despite extending DNA-46 and DNA-59. The prerequisite dependency on RFC-0706 (still in draft) creates a blocking ordering concern.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-30** (warning): `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not true. If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true` (RFC-0480).

## Axis A — Structural completeness

- **Pipeline placement claim is inaccurate.** The RFC states `nachweis.manifest.generate` is integrated "after `pbp.content.validate`" in `build.prepare` (line 180, line 327). However, `pbp.content.validate` is not in `SITES_BUILD_PREPARE_PIPELINE` — it lives in `SITES_CHECK_AUTHOR_PIPELINE` which runs as part of `build.check`, not `build.prepare`. The `build.prepare` pipeline ends with `generated.stale.validate` (see `@/packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:137`). The correct insertion point should be specified, likely after `bordbuch.commit` or near the end of the pipeline.
- **`nachweis.validate` pipeline placement is underspecified.** The RFC says it is "added to `build.check` pipeline" (line 248) but does not specify after which step. `SITES_BUILD_CHECK_PIPELINE` starts with `pipeline.dependencies.validate`, then `SITES_CHECK_AUTHOR_PIPELINE`, then post-build validations. The exact position matters for ordering.

## Axis B — DNA alignment

- **`satisfies[]` is empty.** The RFC extends Bordbuch (DNA-46 — mission lifecycle, bordbuch events) and R2 evidence storage (DNA-59 — evidence preservation in R2). It should declare these in `satisfies[]` with an explanation of how it extends them. DNA-53 (semantic fingerprint governance) is also relevant — the RFC uses `byteHashFile` from `@warpgogol/fingerprint`, which is the governed hashing package.

## Axis C — Ecosystem fit

- **`@warpgogol/ontology` in `packagesImpacted` is incorrect.** RFC-0707 only imports types from `@warpgogol/ontology` (`BordbuchEntryKind`, `PbpEvidenceKind`) — it does not modify ontology schemas. RFC-0706 is the RFC that extends the ontology. Either remove `@warpgogol/ontology` from `packagesImpacted` or clarify what ontology changes RFC-0707 makes beyond importing types. This is also the root cause of the V-30 warning.
- **`@warpgogol/fingerprint` in `packagesImpacted` is incorrect.** The RFC only imports `byteHashFile` and `stableJsonHash` from the fingerprint package — it does not modify the package. `packagesImpacted` should list packages whose source code is modified, not packages that are merely imported.
- **No AGENTS.md update mentioned.** Adding a new kernel module with 6 commands to `packages/os/site-kernel-handoff` requires updating `packages/os/site-kernel-handoff/AGENTS.md` with nachweis-specific rules (entitlement gating pattern, R2 bucket prerequisite, atomicity gap guidance). The RFC does not mention this.
- **No Compass sync mentioned.** If the RFC changes repository-wide requirements or shared package contracts, it should identify which `docs/*.xml` files need synchronization. The RFC adds pipeline steps to `build.prepare` and `build.check` — this may require updating `docs/verification-plan.xml`.
- **Module registration not mentioned.** The RFC proposes a new `nachweis.module.ts` but does not mention wiring it into `tools/kernel.config.ts` or the handoff platform module. The existing module registration pattern (lazy loading via `moduleLoaders` or direct `modules[]` in `KernelAppConfig`) should be referenced.

## Axis D — Forward-only compliance

No issues. The `--pilot-n2-exception` flag on `nachweis.publish` is explicitly documented as temporary with a removal commitment when N3 is implemented. This is acceptable forward-only practice — the flag is not a permanent dual-path.

## Axis E — Agent-facing policy

- **Prerequisite ordering not enforced in frontmatter.** The RFC states "This RFC depends on RFC-0706 (schema extensions). Implement RFC-0706 first" (line 448), but RFC-0706 is not listed in `related[]` (it is — line 21). However, the RFC does not use a formal prerequisite mechanism. There is no `prerequisites[]` or `dependsOn[]` field in the frontmatter. The dependency is only stated in prose. This creates a risk: an agent could attempt to implement RFC-0707 before RFC-0706 is accepted, failing at runtime because `BordbuchEntryKind` does not yet include `nachweis-record` / `nachweis-consent` and `ENTITLED_FEATURES` does not yet include `nachweis`.
- **Supersede escalation reference lacks RFC number.** The implementation notes say "run `rfc.supersede.propose --id RFC-0707 --reason '...' --invariant 'DNA-N'" (line 450) but do not cite the RFC that defines the supersede escalation protocol. The audit skill expects a reference like "RFC-XXXX (supersede escalation on invariant conflict)".

## Axis F — Pragmatism

- **`packagesImpacted` over-listed.** As noted in Axis C, `@warpgogol/ontology` and `@warpgogol/fingerprint` are listed but only imported, not modified. Only `@warpgogol/site-kernel-handoff` is actually modified (new `src/nachweis/` directory). Inflating `packagesImpacted` creates false expectations for reviewers and build scoping.
- **6 commands are justified.** Each maps to a distinct lifecycle stage (ingest → validate → consent → publish → withdraw, plus manifest generation). No command duplicates another's scope. `consent.update` is separate from `ingest` because consent is an independent lifecycle. `publish` and `withdraw` have different preconditions and side effects.

## Axis G — Blind spots

- **Concurrent execution not addressed.** Two agents ingesting the same PDF simultaneously could produce duplicate R2 uploads and duplicate Bordbuch entries. Bordbuch has lock primitives (`acquireLock` with `system:<id>` and `bordbuch:<id>` scopes), but the RFC does not mention whether `nachweis.ingest` acquires locks. R2 uploads have no concurrency protection.
- **GDPR/privacy impact not explicitly assessed.** The RFC processes personal data (evidence documents containing client information, consent records). While the consent lifecycle is addressed, there is no explicit GDPR impact assessment or data retention policy. The `nachweis.withdraw` command sets `record_status: withdrawn` and removes from manifest, but does not delete the R2 object — personal data persists in private R2 storage after withdrawal. The RFC should state whether this is intentional (audit trail) and document the retention policy.
- **Performance cost of `nachweis.validate` not specified.** The command scans all PBP trust collections and validates the bordbuch hash chain. For sites with 100+ Nachweis records, this is O(n) bordbuch validation + O(m) PBP entity scanning. The RFC mentions bordbuch growth in Risks but does not estimate `nachweis.validate` cost.

## Questions for the author

1. RFC-0706 (schema extensions for `BordbuchEntryKind`, `ENTITLED_FEATURES`, `PbpConsent`) is still in `draft` status. How should the pipeline handle this ordering? Should RFC-0707 remain in `draft` until RFC-0706 reaches `accepted`, or should a formal prerequisite field be added to the frontmatter?
2. The pipeline placement says `nachweis.manifest.generate` goes "after `pbp.content.validate`" in `build.prepare`, but `pbp.content.validate` is not in `SITES_BUILD_PREPARE_PIPELINE`. Should the step be placed after `bordbuch.commit` (the last bordbuch step in `build.prepare`), or should `pbp.content.validate` be added to `build.prepare` first?
3. `@warpgogol/ontology` and `@warpgogol/fingerprint` are in `packagesImpacted` but the RFC only imports from them. Should they be removed, or does RFC-0707 plan to modify them beyond what RFC-0706 already covers?
