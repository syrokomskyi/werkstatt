---
id: RFC-0886
title: "Extend Nachweis kernel with granular consent commands, screenshot upload, and per-artifact publication gates"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0707
  - RFC-0872
amendedBy: []
related:
  - ADR-0028
  - ADR-0054
  - RFC-0706
  - RFC-0708
  - RFC-0876
  - RFC-0885
dependsOn:
  - RFC-0885
batch: nachweis-evidence-display
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-59
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - nachweis.screenshot.upload
  added: []
  changed:
    - nachweis.consent.update
    - nachweis.validate
    - nachweis.manifest.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
  - werkstatt-site
successSignals:
  - "nachweis.consent.update accepts --scope flag and updates consentScope[scope] instead of consentStatus"
  - "nachweis.screenshot.upload stores screenshot in R2 and updates EvidenceSource.websiteScreenshot"
  - "Publication gate rejects records where display.aspect = visible but consentScope.aspect != granted"
  - "nachweis.validate reports display↔consent mismatches as violations"
nonGoals:
  - "Does not define PBP entity schema shapes — that belongs to RFC-0885"
  - "Does not define UI components for rendering evidence display — that belongs to RFC-0887"
  - "Does not define ADR-level UI design decisions — that belongs to ADR-0057"
  - "Does not add display-consent-consistent to technical-assessment-v1 or operational-measurement-v1 policies — only attestation-v1 requires consent"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0886: Extend Nachweis kernel with granular consent commands, screenshot upload, and per-artifact publication gates

## Context

RFC-0885 extended the PBP entity schema with `display`, `consentScope`, `websiteUrl`, and `websiteScreenshot` fields. The kernel commands that operate on these entities still use the old schema shape:

- `nachweis.consent.update` (`packages/werkstatt/src/nachweis/nachweis-consent.ts:48-154`) updates the removed `consentStatus` field and top-level `grantedAt`/`method`. It has no concept of per-aspect scope.
- `evaluateGateV2` (`packages/werkstatt/src/nachweis/nachweis-io.ts:260-325`) checks `consentData.consentStatus === "granted"` — a single binary check. It cannot verify that `display.document = "visible"` requires `consentScope.document.status = "granted"`.
- `nachweis.validate` (`packages/werkstatt/src/nachweis/nachweis-validate.ts:134-192`) checks slug and sha256 presence but not display↔consent consistency.
- There is no command to upload a client website screenshot to R2 and populate the `websiteScreenshot` field on EvidenceSource.

## Problem

The kernel cannot:

1. **Update per-aspect consent**: `nachweis.consent.update` writes `consentStatus` (removed field). It must write `consentScope[scope].status`, `consentScope[scope].grantedAt`, and `consentScope[scope].method` for a specific aspect.
2. **Verify display↔consent consistency at the gate**: The publication gate must reject records where `display.document = "visible"` but `consentScope.document.status != "granted"`. Without this, a record could be published with visible elements that the client never consented to display.
3. **Upload website screenshots**: No command populates `EvidenceSource.websiteScreenshot`. Operators need a command that uploads a screenshot file to R2, computes its SHA-256, and writes the `websiteScreenshot` field.
4. **Validate display↔consent consistency**: `nachweis.validate` must report violations where display and consent are inconsistent, so agents can fix them before attempting to publish.

## Decision

`nachweis.consent.update` gains a `--scope` flag (`document|screenshot|websiteLink`) and updates `consentScope[scope]` instead of the removed `consentStatus`. A new `nachweis.screenshot.upload` command stores a screenshot file in R2 and populates `EvidenceSource.websiteScreenshot`. The publication gate gains a `display-consent-consistent` condition that verifies every visible display aspect has granted consent. `nachweis.validate` reports display↔consent mismatches.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Consent updates and screenshot uploads are kernel commands that mutate Sternsystem state through the mission lifecycle.
- **DNA-59 (Evidence preservation)**: Screenshots are preserved in R2 alongside existing evidence artifacts.
- **RFC-0707**: Amends the nachweis kernel module originally introduced by RFC-0707 (consent update command, publish command, validate command).
- **RFC-0872**: Amends the publication gate V2 introduced by RFC-0872 (evaluateGateV2, GateConditionId, REQUIRED_CONDITIONS).
- **RFC-0885**: Depends on the schema changes from RFC-0885 (display, consentScope, websiteScreenshot fields).

### Compass sync

- `docs/verification-plan.xml` — add `display-consent-consistent` gate condition and `NACHWEIS-DISPLAY-CONSENT-01` violation rule to the Nachweis verification surface.
- `packages/werkstatt/AGENTS.md` — add rule: `nachweis.consent.update` requires `--scope` flag; display↔consent coupling is enforced by the gate.

## Design

### CLI surface

```sh
# Update per-aspect consent
pnpm exec werkstatt run nachweis.consent.update --system <id> --consent-id <slug> --scope document --status granted --method signed_pdf
pnpm exec werkstatt run nachweis.consent.update --system <id> --consent-id <slug> --scope screenshot --status denied
# (--method optional for non-granted statuses, defaults to "none")

# Upload website screenshot
pnpm exec werkstatt run nachweis.screenshot.upload --system <id> --slug <evidence-slug> --file ./screenshot.webp

# Publish (gate now checks display↔consent consistency)
pnpm exec werkstatt run nachweis.publish --system <id> --slug <slug>

# Validate (reports display↔consent mismatches)
pnpm exec werkstatt run nachweis.validate --system <id>
```

### TypeScript contracts

#### nachweis.consent.update changes

```ts
// packages/werkstatt/src/nachweis/nachweis-consent.ts

type ConsentScope = "document" | "screenshot" | "websiteLink";

// New --scope flag replaces flat --status update
// Updates consentScope[scope].status, consentScope[scope].grantedAt, consentScope[scope].method
// Bordbuch metadata: { consentId, scope, previousStatus, newStatus, method }

interface NachweisConsentUpdateResult {
  consentId: string;
  systemId: string;
  scope: ConsentScope;
  previousStatus: string; // previous consentScope[scope].status
  newStatus: string;
  bordbuchEventId: string;
}
```

#### nachweis.screenshot.upload command

```ts
// packages/werkstatt/src/nachweis/nachweis-screenshot-upload.ts

interface NachweisScreenshotUploadResult {
  slug: string;       // EvidenceSource slug
  systemId: string;
  sha256: string;     // computed from file
  mediaType: string;  // inferred from file extension
  storage: "public";  // screenshots are always public (displayed on page)
  r2Key: string;      // R2 storage key: {systemId}/screenshots/{slug}/website-screenshot.{ext}
  bordbuchEventId: string;
}
```

The command:

1. Reads the screenshot file from `--file` path.
2. Computes SHA-256 of the file bytes.
3. Infers `mediaType` from file extension (`.webp` → `image/webp`, `.png` → `image/png`, `.jpg` → `image/jpeg`).
4. Uploads to R2 at `{systemId}/screenshots/{slug}/website-screenshot.{ext}`.
5. Updates `EvidenceSource.websiteScreenshot` field with `{ sha256, mediaType, storage: "public", url: <r2 public url> }`.
6. Appends a `nachweis-record` Bordbuch entry with metadata `{ slug, screenshotSha256, mediaType }`.

#### Publication gate changes

```ts
// packages/werkstatt/src/nachweis/nachweis-io.ts

// New gate condition ID
export const GATE_CONDITION_IDS = [
  "source-integrity-verified",
  "record-approved",
  "n3-met",
  "legal-content-check-passed",
  "consent-granted",
  "public-derivative-ready",
  "canonical-raw-artifact-verified",
  "assessment-metadata-valid",
  "execution-authorization-basis-present",
  // RFC-0886: display↔consent consistency
  "display-consent-consistent",
] as const;

// evaluateGateV2: replace consentGranted check with per-aspect logic
// For each aspect in display where display[aspect] === "visible":
//   consentScope[aspect].status must be "granted"
// If all visible aspects have granted consent → display-consent-consistent = pass
// Also: consent-granted condition now checks that ALL visible aspects have granted consent
//   (not just one binary check)
```

The `consent-granted` condition is redefined: it passes when every display aspect that is `"visible"` has `consentScope[aspect].status === "granted"`. The new `display-consent-consistent` condition is required only for `attestation-v1` (the only policy with `consent-granted`). It is NOT required for `operational-measurement-v1` or `technical-assessment-v1` — those policies do not require consent.

`nachweis.validate` checks display↔consent consistency for all `NACHWEIS_EVIDENCE_KINDS` regardless of policy, reporting `NACHWEIS-DISPLAY-CONSENT-01` violations. The gate enforces it only for policies that require consent.

#### nachweis.validate changes

```ts
// packages/werkstatt/src/nachweis/nachweis-validate.ts

// New violation rule: NACHWEIS-DISPLAY-CONSENT-01
// For each Nachweis EvidenceSource (NACHWEIS_EVIDENCE_KINDS only):
//   For each aspect (document, screenshot, websiteLink):
//     If display[aspect] === "visible" and consentScope[aspect].status !== "granted":
//       Emit NACHWEIS-DISPLAY-CONSENT-01
//       Message: "display.{aspect} is 'visible' but consentScope.{aspect}.status is '{status}' (must be 'granted')"
// Non-Nachweis evidence kinds are skipped (display field is absent).
// Violations are added to the violations[] array and cause exitCode: 1
// (consistent with existing nachweis.validate behavior).
```

#### nachweis.manifest.generate changes

```ts
// packages/werkstatt/src/nachweis/nachweis-io.ts — NachweisManifestEntry extension

export interface NachweisManifestEntry {
  // ...existing fields unchanged...
  // RFC-0886: display and website fields for Nachweis evidence kinds
  display?: { document: string; screenshot: string; websiteLink: string };
  websiteUrl?: string;
}
```

`nachweis.manifest.generate` adds `display` and `websiteUrl` to manifest entries for Nachweis evidence kinds (when present on the entity). Non-Nachweis kinds are unaffected.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-consent.ts` | Rewrite to update `consentScope[scope]` instead of `consentStatus` |
| `packages/werkstatt/src/nachweis/nachweis-screenshot-upload.ts` | New file: screenshot upload command handler |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | Extend `GATE_CONDITION_IDS`, update `evaluateGateV2` for per-aspect consent |
| `packages/werkstatt/src/nachweis/nachweis-validate.ts` | Add `NACHWEIS-DISPLAY-CONSENT-01` violation rule |
| `packages/werkstatt/src/nachweis/nachweis-publish.ts` | No code changes needed (uses `evaluateGateV2` which is updated in nachweis-io.ts) |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register `nachweis.screenshot.upload` command; update `nachweis.consent.update` flags |

### Output format

```json
{
  "command": "nachweis.consent.update",
  "data": {
    "consentId": "client-xyz",
    "systemId": "warpgogol-com",
    "scope": "document",
    "previousStatus": "not_requested",
    "newStatus": "granted",
    "bordbuchEventId": "event-000003"
  },
  "exitCode": 0
}
```

```json
{
  "command": "nachweis.screenshot.upload",
  "data": {
    "slug": "client-xyz",
    "systemId": "warpgogol-com",
    "sha256": "a1b2c3...",
    "mediaType": "image/webp",
    "storage": "public",
    "r2Key": "nachweis/warpgogol-com/client-xyz/website-screenshot.webp",
    "bordbuchEventId": "event-000004"
  },
  "exitCode": 0
}
```

### Failure modes

- `nachweis.consent.update` fails when `--scope` is not one of `document|screenshot|websiteLink`.
- `nachweis.consent.update` fails when the consent entity does not have a `consentScope` field (schema requires it per RFC-0885).
- `nachweis.screenshot.upload` fails when the evidence-source entity does not exist.
- `nachweis.screenshot.upload` fails when the file extension is not one of `.webp`, `.png`, `.jpg`, `.jpeg`.
- `nachweis.publish` fails (exit 1) when `display-consent-consistent` condition is not met.
- `nachweis.validate` emits `NACHWEIS-DISPLAY-CONSENT-01` violations (added to `violations[]`, exitCode: 1 — consistent with existing behavior where any violation causes exit code 1).

## Rollout

1. **Implement after RFC-0885**: The schema fields (`display`, `consentScope`, `websiteScreenshot`) must exist before commands can operate on them.
2. **Migration**: Existing consent entities are migrated by RFC-0885's migrator (consentStatus → consentScope). After migration, `nachweis.consent.update --scope document --status granted` works against the new shape.
3. **Gate enforcement**: The `display-consent-consistent` condition is added to `REQUIRED_CONDITIONS["attestation-v1"]` only. It is NOT added to `operational-measurement-v1` or `technical-assessment-v1` (those policies do not require consent). Existing published records that predate display control are grandfathered — the gate checks display↔consent only when `display` field is present (post-migration records always have it).
4. **Pipeline integration**: `nachweis.validate` is already part of `SITES_BUILD_CHECK_PIPELINE`. The new gate condition is enforced automatically during build checks.
5. **New sites**: New Sternsystemen with `nachweis` entitlement get display control from day one — no migration needed.

## Alternatives considered

- **Separate consent commands per aspect** (`nachweis.consent.grant-document`, `nachweis.consent.grant-screenshot`): Rejected — one command with `--scope` is simpler and follows the existing `nachweis.consent.update` pattern.
- **Screenshot upload as a flag on `nachweis.public-derivative`**: Rejected — `public-derivative` handles PDF derivatives with specific gate semantics (public derivative requirement for attestation-v1). Screenshots are a different artifact type with different storage paths and no gate dependency.
- **Display↔consent check in `pbp.content.validate` instead of the publication gate**: Rejected — `pbp.content.validate` checks schema shape, not publication readiness. The gate is the correct enforcement point because it controls the transition from draft to published.
- **Per-artifact gate conditions** (`document-consent-granted`, `screenshot-consent-granted`, `websiteLink-consent-granted`): Rejected — a single `display-consent-consistent` condition that iterates over display aspects is cleaner and extensible. Adding new aspects does not require new gate conditions.

## Risks

- **Gate false positives**: If the migrator sets `display` to `{ document: "visible", screenshot: "hidden", websiteLink: "hidden" }` but the consent entity only has `document: granted`, the gate passes. If an operator later sets `display.screenshot: "visible"` without updating consent, the gate correctly blocks publication. This is the intended behavior, but operators must understand the coupling.
- **R2 storage growth**: Screenshots are typically 100KB–500KB (WebP). At scale (hundreds of client sites), this adds measurable R2 storage. Screenshots are always stored as `storage: "public"` because they are displayed on the evidence detail page. The `PbpWebsiteScreenshot` schema allows `storage: "private"` for future flexibility, but the `nachweis.screenshot.upload` command always writes `"public"`.
- **Agent confusion**: Agents may attempt to use `nachweis.consent.update --status granted` without `--scope`. The command fails with a clear error message. Agents must learn the new `--scope` flag.

## Acceptance criteria

- [ ] `nachweis.consent.update` accepts `--scope` and updates `consentScope[scope]` instead of `consentStatus`
- [ ] `nachweis.screenshot.upload` command registered with correct name, scope, and flags
- [ ] `nachweis.screenshot.upload` uploads to R2, computes SHA-256, updates `EvidenceSource.websiteScreenshot`
- [ ] `display-consent-consistent` gate condition added to `REQUIRED_CONDITIONS["attestation-v1"]` (not `operational-measurement-v1` or `technical-assessment-v1`)
- [ ] `nachweis.publish` rejects records where `display.aspect = "visible"` but `consentScope[aspect].status != "granted"`
- [ ] `nachweis.validate` reports `display-consent-consistent` in failed conditions for inconsistent records
- [ ] `nachweis.manifest.generate` includes `websiteUrl` and `display` fields in manifest entries for Nachweis evidence kinds
- [ ] `--json` output format documented and stable for all changed commands
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add backward-compatible aliases for the old `nachweis.consent.update --status` without `--scope`. The old signature is replaced.
- Agents MUST NOT add `display-consent-consistent` to `technical-assessment-v1` or `operational-measurement-v1` policy. Only `attestation-v1` requires consent.
- Agents MUST NOT upload screenshots to the same R2 path as evidence PDFs. Screenshots use a separate path prefix (`{systemId}/screenshots/{slug}/website-screenshot.{ext}`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
