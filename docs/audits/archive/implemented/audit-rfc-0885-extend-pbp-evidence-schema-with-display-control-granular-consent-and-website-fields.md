---
rfcId: RFC-0885
auditId: AUDIT-RFC-0885-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0885

## Verdict: Needs revision

The RFC correctly identifies the schema gap and proposes a clean forward-only design, but it omits all engine-side consumers of the removed `consentStatus`/`grantedAt`/`method` fields. At least four files in `packages/werkstatt/src/nachweis/` read or write these fields, and `packagesImpacted` lists only `werkstatt-site`. The publication gate's consent check (`evaluateGateV2`) is not updated, creating a silent breakage path.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0885 --json` reports 0 violations.

## Axis A — Structural completeness

- **PBP-CONTENT-XX diagnostic codes not grounded**: The RFC states "New validation rules emit `PBP-CONTENT-XX` diagnostics" (§Output format). However, `pbp.content.validate` (`packages/werkstatt-site/src/checks/content-pbp.ts:63-78`) validates by calling `pbpSchema.parse(doc.frontmatter)`, which produces Zod error messages — not structured diagnostics with `PBP-CONTENT-XX` rule IDs. The command pushes raw error strings into a `violations[]` array. The RFC should either (a) describe the actual validation mechanism (Zod schema rejection via `.strict()` and `.superRefine()`) or (b) propose adding structured `PBP-CONTENT-XX` diagnostics — but the current code does not emit them.
- **`commands.changed` imprecision**: `pbp.content.validate` is listed as changed, but the command code itself does not change — it already calls `pbpSchema.parse()`. The schemas it consumes change. This is technically correct (behavior changes) but the file system responsibilities table does not list `content-pbp.ts` as modified, which is consistent — the command code is untouched.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle)**: The RFC states "Schema changes propagate via mission materialization and validation" — this is a correct relationship but thin. It does not explain how the RFC *enforces or extends* the invariant; it merely notes that missions are the delivery vehicle. Acceptable for a schema-extension RFC.
- **DNA-59 (Evidence preservation)**: The RFC connects `websiteScreenshot.sha256` and `websiteScreenshot.storage` to R2 preservation. This is a genuine extension — the new field carries preservation metadata. Adequately explained.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **`packagesImpacted` missing `werkstatt` (engine)**: The RFC lists only `werkstatt-site`, but the engine package `packages/werkstatt` is directly impacted. At least four engine files read or write the removed `consentStatus`/`grantedAt`/`method` fields:
  - `packages/werkstatt/src/nachweis/nachweis-io.ts:271` — `evaluateGateV2` checks `input.consentData?.consentStatus === "granted"`
  - `packages/werkstatt/src/nachweis/nachweis-consent.ts:83-89` — writes `data.consentStatus`, `data.method`, `data.grantedAt`
  - `packages/werkstatt/src/nachweis/nachweis-withdraw.ts:130` — writes `consentData.consentStatus = "revoked"`
  - `packages/werkstatt/src/nachweis/nachweis-validate.ts:194-206` — reads `c.data.consentStatus` and `c.data.grantedAt`
  
  The RFC must either (a) add `werkstatt` to `packagesImpacted` and describe the engine-side changes, or (b) explicitly defer all engine-side consent command updates to RFC-0886 while acknowledging the interim breakage.
- **Migrator location**: The RFC proposes a migrator (rollout step 2) but does not list `packages/werkstatt` in `packagesImpacted`. Migrators are registered in `packages/werkstatt/src/migrators/registry.ts` — an engine file. The `packagesImpacted` list must include `werkstatt`.
- **Package boundaries**: Schema changes are correctly scoped to `packages/werkstatt-site/src/domain/pbp/`. No cross-boundary imports proposed. Good.
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. If the evidence schema is referenced in `docs/requirements.xml` or `docs/verification.xml`, those may need updates. Not critical for a schema-only RFC, but should be checked.

## Axis D — Forward-only compliance

No issues. The RFC explicitly removes `consentStatus`, `grantedAt`, `method` with no backward compatibility (§Design, §Risks). `.strict()` on both schemas rejects old entities. The migrator handles the transition in a single wave. No shims, no dual-paths, no flags.

## Axis E — Agent-facing policy

- **Status gate**: Correct — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **NEEDS CLARIFICATION markers**: None found.
- **Storage policy**: No cookies introduced. `websiteScreenshot` uses R2 storage (`storage: "private" | "public"`) — consistent with existing `items[].storage` pattern.
- **Anti-fabrication**: Acceptance criteria are code changes, not content authoring. No issue.

## Axis F — Pragmatism

- **`display` on non-Nachweis kinds**: The RFC says "Agents MUST NOT add `display` to non-Nachweis evidence kinds" (§Implementation notes) and "display is required for NACHWEIS_EVIDENCE_KINDS" (§Zod schema). But the Zod schema section does not specify a `superRefine` that *rejects* `display` on non-Nachweis kinds. The TypeScript interface shows `display: PbpEvidenceDisplay` (required, not optional) — which would force non-Nachweis kinds to provide it too. The schema should either (a) make `display` optional and require it only for Nachweis kinds via `superRefine`, or (b) explicitly reject `display` on non-Nachweis kinds via `superRefine`. The current design is ambiguous.
- **`consentScope` aspects match `display` aspects**: Both use `document`, `screenshot`, `websiteLink`. Clean 1:1 mapping — no speculative generality.
- **Minimal command surface**: No new commands proposed. Correct — this is a schema-only RFC.

## Axis G — Blind spots

- **Engine-side `evaluateGateV2` breakage (critical)**: `evaluateGateV2` in `nachweis-io.ts:271` checks `input.consentData?.consentStatus === "granted"` to evaluate the `consent-granted` gate condition. After `consentStatus` is removed and replaced with `consentScope`, this check will always return `false`, causing *all* published Nachweis records to fail the publication gate. The RFC does not address this. The gate needs to check `consentData?.consentScope?.document?.status === "granted"` (or whichever aspect is gate-relevant). This is the most serious blind spot.
- **`nachweis.consent.update` command breakage**: The command writes `data.consentStatus`, `data.method`, `data.grantedAt` — all removed fields. The RFC says "Does not define kernel commands for consent updates — those belong to RFC-0886" but does not acknowledge that the *existing* command will break. The RFC should either (a) update the existing command in this RFC, or (b) explicitly state that `nachweis.consent.update` is broken until RFC-0886 and add a non-goal for it.
- **`nachweis.withdraw` command breakage**: Sets `consentData.consentStatus = "revoked"` — removed field. Same issue as above.
- **Test breakage**: `nachweis-commands.test.ts` and `nachweis-rfc-0872.test.ts` both construct consent entities with `consentStatus` and `grantedAt` fields. These tests will fail. The RFC does not mention test updates.
- **Migration default for `consentScope`**: The migrator maps `consentStatus: "granted"` → `consentScope.document.status: "granted"` with `screenshot` and `websiteLink` defaulting to `not_requested`. But what about `consentStatus: "partially_granted"`? The RFC's migration only handles `"granted"` — other statuses (`requested`, `partially_granted`, `revoked`, `expired`) are not mapped. The migrator needs a complete mapping table.
- **Security/privacy**: `websiteUrl` and `websiteScreenshot` publish client website data. The RFC connects this to `consentScope.websiteLink` and `consentScope.screenshot`, but does not explicitly state that the publication gate (RFC-0886) must check these consent scopes before publishing. This is deferred to RFC-0886 but the dependency should be explicit.

## Questions for the author

1. How should `evaluateGateV2` in `packages/werkstatt/src/nachweis/nachweis-io.ts` check consent after `consentStatus` is removed? Which `consentScope` aspect (document? all three?) determines the `consent-granted` gate condition?
2. The existing `nachweis.consent.update` and `nachweis.withdraw` commands write `consentStatus`/`method`/`grantedAt` — should these commands be updated in this RFC or explicitly broken until RFC-0886? If broken, how is the interim state handled?
3. What is the complete migrator mapping for `consentStatus` values other than `"granted"` (e.g. `partially_granted`, `requested`, `revoked`, `expired`)? The rollout only specifies the `"granted"` case.
