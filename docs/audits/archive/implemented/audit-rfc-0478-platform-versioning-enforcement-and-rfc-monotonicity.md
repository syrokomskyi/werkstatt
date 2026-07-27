---
rfcId: RFC-0478
auditId: AUDIT-RFC-0478-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0478

## Verdict: Needs revision

The RFC addresses two real enforcement gaps (version bump drift and RFC-id monotonicity), but the V-28 enforcement as described produces false positives on same-day RFC batches — RFC-0478, 0479, and 0480 themselves would all be V-28 violations. The `packagesImpacted` list is overstated, and the command placement in `sternsystem/index.ts` is semantically wrong for a platform-level command.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0478 --json` exits 0 with 0 violations.

## Axis A — Structural completeness

- **V-28 enforcement logic is self-contradictory.** The RFC states: "rfc.validate checks that no RFC-id is less than the maximum RFC-id among RFCs with an earlier or equal createdAt." RFC-0478, 0479, and 0480 all have `createdAt: 2026-07-21`. Under this rule, RFC-0478 (id 478) is less than the maximum id (480) among RFCs with createdAt <= 2026-07-21 — so RFC-0478 itself would be a V-28 violation. Same for RFC-0479. The rule must use **strictly earlier** createdAt, not "earlier or equal", or it must be reformulated as: "no RFC with a later createdAt may have a lower id than an RFC with an earlier createdAt" (i.e., ids are monotonically non-decreasing with respect to createdAt ordering, but same-day RFCs are unconstrained).
- **`rfc.implement.stamp` check mentioned but not designed.** The architectural fit section (line 135) states "This RFC adds versionBump as a required frontmatter field for implemented RFCs, validated by rfc.validate and checked by rfc.implement.stamp." But the design section and file system responsibilities table do not list any changes to `rfc.implement.stamp`. Either the check is only in `rfc.validate` (V-29), or the `rfc.implement.stamp` handler needs modification — the RFC must clarify and list the file if so.
- **`versionBump` field in `RfcFrontmatter` interface.** The design shows adding `versionBump` to `RFC_KNOWN_KEYS` (line 142), but does not add it to the `RfcFrontmatter` TypeScript interface (line 110–215 of `types.ts`). Both must be updated — `RFC_KNOWN_KEYS` is the V-20 allow-list, but `RfcFrontmatter` is the typed contract. The RFC should list both changes.
- **`rfc.create` scaffolding default.** The rollout says "rfc.create scaffolds versionBump: patch as default in the template" (line 262), but the design section does not describe modifying `rfc-0000-template.md` or the `runRfcCreate` handler's string replacement logic. The template at `packages/forge/os/rfc/rfc-0000-template.md` would need a `versionBump: patch` line added, and `runRfcCreate` in `list-create.ts` does not currently replace a `versionBump` placeholder. This should be in the file system responsibilities table.

## Axis B — DNA alignment

- **DNA-44, DNA-46, DNA-48, DNA-53 references are accurate.** Each entry in `satisfies[]` and `related[]` exists in `docs/architecture-dna.md` and the RFC body explains how it strengthens each invariant. DNA-44 (pin contract), DNA-46 (mission lifecycle version comparison), DNA-48 (release snapshot consistency), and DNA-53 (semantic fingerprint as enforcement signal) are all correctly mapped.
- **No new DNA invariant established.** The RFC does not claim to establish a new DNA invariant, which is correct — it enforces existing ones.

## Axis C — Ecosystem fit

- **Command placement: `platform.consistency.validate` in `sternsystem/index.ts` is wrong.** The file system responsibilities table (line 221) says "Register platform.consistency.validate" in `packages/os/site-kernel-handoff/src/sternsystem/index.ts`. But `platform.consistency.validate` is a platform-level command that fingerprints the entire `packages/` tree and checks root `package.json` — it is not a sternsystem-scoped command. The `sternsystem` module (in `sternsystem/index.ts`) registers commands scoped to individual Sternsystems (`sternsystem.register`, `sternsystem.pin`, `sternsystem.sync`, etc.). A platform-level command should either go in a new `platform` module or in an existing workspace-level module. The kernel config (`tools/kernel.config.ts`) would need a new module loader entry.
- **Pipeline placement.** The RFC says "Include platform.consistency.validate in ci.local.validate and packages.check pipeline" (line 259). `ci.local.validate` checks that CI workflows include specific commands — adding the command to `CI_LOCAL_CHECKED_COMMANDS` in `packages/os/site-kernel-checks/src/ci-local.ts` is correct. But `packages.check` pipeline is defined in `PACKAGES_CHECK_PIPELINE` from `@gogol/site-kernel-checks/pipelines/packages-check` — the RFC should name this file explicitly in the file system responsibilities table.
- **Compass sync.** The RFC changes repository-wide validation policy and adds a new frontmatter field. It correctly identifies `AGENTS.md` and `docs/COMMANDS.md` updates but does not mention Compass XML files. Since `versionBump` is a new governance field, `docs/verification-plan.xml` may need updating to reflect the new validation rule. The RFC should state whether Compass XML sync is needed or explicitly N/A.
- **Command lifecycle buckets.** `commands.proposed: [platform.consistency.validate]` and `commands.changed: [rfc.validate]` are internally consistent. `platform.consistency.validate` is new (proposed → added on implementation). `rfc.validate` is an existing command being modified. Correct.

## Axis D — Forward-only compliance

- **No backward compatibility layers.** The RFC does not propose shims, dual-paths, or compatibility bridges. Existing RFCs without `versionBump` are unaffected (optional for pre-cutoff), which is not a compatibility layer — it's a grandfather clause with a cutoff date, consistent with `RFC_METADATA_CUTOFF` patterns used by V-24/V-25/V-23.
- **No legacy paths maintained behind flags.** The `platformSemanticHash` is already the preferred signal (DNA-53); the legacy `packagesHash` is not extended or maintained — it's left as-is in `version-compare.ts` for existing callers. Forward-only compliant.

## Axis E — Agent-facing policy

- **Status gate respected.** The RFC is `status: draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement this RFC only after it is accepted" (line 300).
- **Implementation notes reference correct governance.** `rfc.implement.stamp` (RFC-0476) and `rfc.supersede.propose` (RFC-0334) are correctly referenced.
- **No content authoring claims.** The RFC is purely about validation infrastructure — no anti-fabrication concerns.

## Axis F — Pragmatism

- **`packagesImpacted` overstated.** `@gogol/fingerprint` is listed but the RFC does not change any code in that package — it only uses the existing `fingerprintTree` export from `@gogol/fingerprint/semantic` (already called by `resolvePlatformSemanticHash` in `bundle-io.ts`). `@gogol/ontology` is listed but the RFC does not change any ontology schemas (the `systemPinSchema` is not modified by this RFC — that's RFC-0479's scope). Both should be removed from `packagesImpacted` unless the implementation reveals an actual change.
- **New command earns its existence.** `platform.consistency.validate` is not a flag on an existing command — it performs a distinct cross-cutting check (hash drift vs. version drift) that no existing command covers. Justified.
- **TypeScript contracts are minimal.** `PlatformConsistencyData` and `PlatformConsistencyViolation` are lean — no speculative generality.

## Axis G — Blind spots

- **Performance: `fingerprintTree` cost on every `ci.local.validate`.** The RFC does not estimate the cost of computing `platformSemanticHash` via `fingerprintTree(packagesDir, { mode: "semantic" })`. This is a parser-backed semantic fingerprint of the entire `packages/` tree. On a monorepo with 25+ packages, this could take several seconds. The RFC should state whether this is acceptable for a CI gate or whether caching is needed.
- **`docs/platform-version-log.generated.yaml` commit ambiguity.** The `.generated.` suffix suggests it should be gitignored (like other generated artifacts). But the RFC treats it as a persistent audit log ("the last validated state"). If it's gitignored, every CI run starts from a blank state and PC-01 always fires (hash changed from "no previous state"). If it's committed, it creates a write-then-commit cycle inside CI. The RFC must clarify: is this file committed to the repo, or is it a local-only artifact? If committed, who commits it — the CI bot, the operator?
- **V-28 edge case: archived RFCs.** The RFC says "including archive/" (line 125). Archived RFCs retain their original `createdAt`. If an archived RFC has a very old `createdAt` and a low id, it could interact with the monotonicity check. The RFC should confirm that archived RFCs are included in the `allParsed` map but are never the "target" of a V-28 violation (they were created before the rule existed).
- **Concurrent execution.** Two agents creating RFCs simultaneously could both pick the same `maxId + 1`. The RFC does not address this, but `rfc.create` already has this race condition today — V-28 does not make it worse. Acceptable to not address.

## Questions for the author

1. **V-28 false positives on same-day RFCs.** RFC-0478, 0479, and 0480 all have `createdAt: 2026-07-21`. Under the "earlier or equal createdAt" rule, RFC-0478 (id 478 < 480) would be a V-28 violation. Should the rule use **strictly earlier** createdAt instead, or should same-day RFCs be exempt from the monotonicity constraint?
2. **`platform.consistency.validate` module placement.** Why register a platform-level command in the `sternsystem` module? Should it be a new `platform` module in `site-kernel-handoff`, or registered directly in `tools/kernel.config.ts` as a standalone module?
3. **`docs/platform-version-log.generated.yaml` — committed or gitignored?** If committed, the CI pipeline must write and commit it, creating a write-back cycle. If gitignored, every run starts from a blank state. Which model is intended, and how is the first-run seeding handled in CI?
