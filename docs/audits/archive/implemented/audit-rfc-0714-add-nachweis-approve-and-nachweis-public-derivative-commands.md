---
rfcId: RFC-0714
auditId: AUDIT-RFC-0714-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0714

## Verdict: Needs revision

The RFC fills a real gap in the Nachweis publication workflow (conditions 3–6 lack commands) and follows existing patterns well. However, it proposes a `publicDerivativeSha256` field that does not exist in the PBP EvidenceSource schema (RFC-0706), creates an implicit dependency on RFC-0713 without listing it, and omits lock acquisition, idempotency, and `--json` output documentation for `nachweis.public-derivative`.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19** (warning): `RFC-0714.amends` includes RFC-0707, but RFC-0707.amendedBy does not include RFC-0714. Expected for a draft amending an implemented RFC — the `amendedBy` backreference on RFC-0707 should be added during enhance or implementation.

## Axis A — Structural completeness

- **Output format not documented.** The RFC does not document the `--json` output shape for either command. RFC-0707 includes JSON examples for every command. Both new commands should include a `--json` example showing the `data`, `exitCode`, and `summary` fields.
- **`--json` flag missing from flag tables.** Neither the `nachweis.approve` nor `nachweis.public-derivative` flag table lists the `--json` flag. All existing nachweis commands register `json: { kind: "boolean" }` in the module. The flag tables should include it.
- **Acceptance criteria gaps.** The criteria do not verify: (a) `--json` output support, (b) `--dry-run` behavior for both commands, (c) entitlement skip behavior (all existing nachweis commands have this as an acceptance criterion). These should be added for consistency with RFC-0707's criteria.

## Axis B — DNA alignment

- **`satisfies: []` is acceptable** for a `kind: command` RFC (RFC-0331 only requires `--satisfies` for architecture/contract RFCs). The RFC extends the Nachweis module established by RFC-0707 (which satisfies DNA-46, DNA-53, DNA-59). No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **`publicDerivativeSha256` field does not exist in the PBP schema.** The RFC's step 6 says "Add `items.document.publicDerivativeSha256` with the computed hash." The EvidenceSource items schema (RFC-0706, `packages/pbp/src/schemas/evidence-source.ts`) defines a fixed set of optional fields: `url`, `retrievedAt`, `sha256`, `storage`, `mediaType`, `qualityStatus`. There is no `publicDerivativeSha256` field. Zod will either strip it silently or reject it (depending on `.strict()` usage). The RFC must either: (a) amend RFC-0706 to add the field to the schema, or (b) use the existing `sha256` field on a separate item key (e.g., `items.public.sha256` with `items.public.storage: "public"`). Option (b) is simpler and avoids a schema amendment.
- **RFC-0713 not listed in `related[]`.** The RFC references `R2_NACHWEIS_*` credentials (RFC-0713) in the architectural fit section, but RFC-0713 is not in `related[]`. Since RFC-0713 is still in draft, this is an implicit dependency — if RFC-0713 is not implemented, `nachweis.public-derivative` will use the shared `R2_*` credentials (which works but violates the least-privilege principle the RFC cites). RFC-0713 should be listed in `related[]` and the dependency should be noted in implementation notes.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths. The RFC amends RFC-0707 directly and adds new commands without maintaining legacy behavior.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, RFC-0334). No NEEDS CLARIFICATION markers. No storage policy violations (R2 is server-side).

## Axis F — Pragmatism

- **Two commands justified.** The alternatives section adequately justifies why these are not flags on existing commands (different actor, different timestamp, different file for public derivative; approval is a distinct human action).
- **Lean contracts.** `NachweisApproveResult` and `NachweisPublicDerivativeResult` are minimal. ✓
- **Scope discipline.** `packagesImpacted` lists only `@warpgogol/site-kernel-handoff`. ✓ `appsImpacted: []` is correct.

## Axis G — Blind spots

- **Lock acquisition not mentioned for `nachweis.public-derivative`.** The behavior description (steps 1–9) does not mention acquiring `system:` and `bordbuch:` locks. All existing nachweis commands that append Bordbuch entries acquire these locks (see `nachweis-publish.ts:174-182`, `nachweis-consent.ts:100-114`, `nachweis-withdraw.ts:115-116`). `nachweis.approve` correctly mentions locks (step 2), but `nachweis.public-derivative` should also acquire them before appending the Bordbuch entry (step 8).
- **`recordId` and `version` resolution not described.** `nachweis.public-derivative` step 3 says "Upload to R2 at `{systemId}/public/{recordId}/v{version}/public.pdf`" but does not describe how `recordId` and `version` are obtained. The existing `resolveNachweisR2Path(systemId, recordId, version)` in `nachweis-io.ts` requires these parameters. The RFC should describe reading them from the evidence-source entity's frontmatter (e.g., `recordId` and `version` fields).
- **R2 path helper not in file system responsibilities.** A new helper (e.g., `resolveNachweisPublicR2Path`) or extension of `resolveNachweisR2Path` is needed for the `public/` path prefix. The file system responsibilities table should list this addition to `nachweis-io.ts`.
- **Idempotency not addressed.** What happens if `nachweis.approve` is called twice for the same slug? Each call appends a Bordbuch entry — is that intentional (audit trail) or a bug? What if `nachweis.public-derivative` is called twice with the same file? Does it overwrite the R2 object, create a new version, or skip? The RFC should document the expected behavior for repeated calls.
- **`nachweis.approve` does not verify the slug exists.** The RFC documents this in Failure modes ("if the slug does not correspond to an existing record, the Bordbuch entry is still written"). This is a deliberate design choice, but it means `nachweis.validate` is the only safety net. The RFC should note that `nachweis.approve` could optionally warn if no evidence-source entity is found for the slug (non-blocking, informational).

## Questions for the author

1. **How should `publicDerivativeSha256` be stored?** Either amend RFC-0706 to add the field to the PBP schema, or use the existing `sha256` field on a separate item key (e.g., `items.public.sha256`). The current proposal (adding an unregistered field) will fail Zod validation.
2. **Is RFC-0713 a hard dependency?** If `R2_NACHWEIS_*` credentials are required, RFC-0713 must be implemented first. If the shared `R2_*` credentials are acceptable as a fallback, the RFC should state this explicitly and remove the `R2_NACHWEIS_*` reference from the architectural fit section.
3. **What is the idempotency contract for both commands?** Should `nachweis.approve` reject a second approval for the same slug? Should `nachweis.public-derivative` skip if the same SHA-256 is already uploaded, or always overwrite?
