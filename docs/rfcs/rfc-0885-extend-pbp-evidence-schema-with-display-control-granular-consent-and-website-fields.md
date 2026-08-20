---
id: RFC-0885
title: "Extend PBP evidence schema with display control, granular consent, and website fields"
status: implemented
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt: 2026-08-20
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0706
  - RFC-0872
amendedBy: []
related:
  - ADR-0028
  - ADR-0054
  - RFC-0707
  - RFC-0708
  - RFC-0876
dependsOn: []
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
  proposed: []
  added: []
  changed:
    - pbp.content.validate
    - nachweis.consent.update
    - nachweis.withdraw
    - nachweis.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
  - werkstatt
successSignals:
  - "display, consentScope, websiteUrl, websiteScreenshot fields present on Nachweis EvidenceSource entities"
  - "consentStatus field removed from PbpConsent; consentScope with per-aspect status/grantedAt/method replaces it"
  - "pbp.content.validate accepts new schema shape and rejects entities missing required Nachweis display/consentScope fields"
nonGoals:
  - "Does not define new kernel commands for granular consent updates or screenshot upload — those belong to RFC-0886. Existing commands (nachweis.consent.update, nachweis.withdraw) are updated minimally to use consentScope instead of removed fields."
  - "Does not define publication gate logic for display↔consent consistency — that belongs to RFC-0886. The existing consent-granted gate condition is updated minimally to check consentScope.document.status."
  - "Does not define UI components for rendering evidence display — that belongs to RFC-0887"
  - "Does not define ADR-level UI design decisions — that belongs to ADR-0057"
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

# RFC-0885: Extend PBP evidence schema with display control, granular consent, and website fields

## Context

The Nachweis evidence system (RFC-0706, RFC-0707, RFC-0708, RFC-0872, RFC-0876) currently supports two evidence profiles on the detail page:

1. **Attestation** (`client-statement`, `certificate`, `project-confirmation`, `operational-evidence`) — shows text, quote, SHA-256 hashes, and sichtpass metadata. The client-signed PDF document itself is never displayed or linked — only its hash is shown for verification.
2. **Technical assessment** — shows normalized metrics, dimensions, and sichtpass. Screenshots exist as artifacts with `role: "screenshot"` inside `items[]`, but they are not rendered as images on the detail page.

Three gaps prevent authoritative, stylish evidence display:

- **No website link**: `PbpEvidenceSource` has no field for the client's live website URL. Visitors cannot navigate to the client's site from the evidence page.
- **No screenshot display**: Client website screenshots (distinct from technical-assessment tool screenshots) have no schema representation. The `screenshot` artifact role in `items[]` is scoped to technical-assessment tool output, not to client website visual evidence.
- **No granular consent or display control**: `PbpConsent` has a single `consentStatus` field (`not_requested | requested | partially_granted | granted | revoked | expired`). A client cannot grant publication of their PDF document while denying publication of their website URL or screenshot. `PbpEvidenceSource` has no per-aspect display visibility — the `publication.visibility` field controls only whole-record visibility (public/private), not individual element rendering.

## Problem

The current schema cannot express: "Show the client's signed PDF, show a screenshot of their homepage, link to their live website — but only if the client has granted consent for each element individually."

Specific gaps:

- `PbpEvidenceSource` (`packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts:108-131`) lacks `display`, `websiteUrl`, and `websiteScreenshot` fields.
- `PbpConsent` (`packages/werkstatt-site/src/domain/pbp/entities/consent.ts:48-61`) uses a single `consentStatus` field with no per-aspect granularity. `grantedAt` and `method` are top-level, not per-aspect.
- The Zod schemas (`evidence-source.ts`, `consent.ts`) enforce the current shape and will reject entities with the new fields.
- `pbp.content.validate` validates against these schemas, so the schema must change before commands or UI can use the new fields.

## Decision

`PbpEvidenceSource` gains three new top-level fields for Nachweis evidence kinds: `display` (per-aspect visibility control), `websiteUrl` (client website link), and `websiteScreenshot` (client website screenshot artifact). `PbpConsent` replaces the single `consentStatus` / `grantedAt` / `method` fields with a `consentScope` object containing per-aspect consent decisions (status, grantedAt, method) for `document`, `screenshot`, and `websiteLink`.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Nachweis evidence entities are managed through missions. Schema changes propagate via mission materialization and validation.
- **DNA-59 (Evidence preservation)**: The evidence model extended here feeds into the R2 preservation system. New fields (`websiteScreenshot` with `sha256`, `storage`) are preserved alongside existing artifacts.
- **RFC-0706**: Amends the PBP consent entity and evidence source entity originally introduced by RFC-0706.
- **RFC-0872**: Amends the evidence source schema extended by RFC-0872 (technical-assessment kind, artifact roles).
- **ADR-0028**: Nachweisregister as PBP trust-layer extension — this RFC extends the trust model with granular consent.
- **ADR-0054**: Technical assessments as first-class Nachweisregister evidence profile — this RFC adds client-website visual evidence as a parallel concept.

## Design

### CLI surface

No new CLI commands in this RFC. The schema change is consumed by `pbp.content.validate` (changed) and by downstream RFCs (RFC-0886 for kernel commands, RFC-0887 for UI).

```sh
pnpm exec werkstatt run pbp.content.validate --app warpgogol-com
```

### TypeScript contracts

#### EvidenceSource extensions

```ts
// packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts

export type PbpEvidenceDisplayAspect = "visible" | "hidden";

export interface PbpEvidenceDisplay {
  document: PbpEvidenceDisplayAspect;
  screenshot: PbpEvidenceDisplayAspect;
  websiteLink: PbpEvidenceDisplayAspect;
}

export interface PbpWebsiteScreenshot {
  sha256: string; // hex SHA-256 of the screenshot file
  mediaType: string; // e.g. "image/webp", "image/png"
  storage: "private" | "public"; // R2 storage tier
  url?: string; // public URL when storage is "public"
}

export interface PbpEvidenceSource extends PbpEntity {
  type: "evidence-source";
  name: string;
  kind: PbpEvidenceKind;
  authority: { kind: string };
  slug?: string;
  recordId?: string;
  version?: number;
  publication?: { visibility: "public" | "private"; publishedAt?: string };
  items?: Record<string, { /* existing fields unchanged */ }>;
  assessment?: NachweisTechnicalAssessmentV1;
  // RFC-0885: display control — required for Nachweis evidence kinds, rejected for others
  display?: PbpEvidenceDisplay;
  // RFC-0885: client website link
  websiteUrl?: string;
  // RFC-0885: client website screenshot
  websiteScreenshot?: PbpWebsiteScreenshot;
}
```

`display` is optional in the TypeScript interface and Zod schema. A `superRefine` requires it for Nachweis evidence kinds (`client-statement`, `project-confirmation`, `certificate`, `operational-evidence`, `technical-assessment`) and rejects it for non-Nachweis kinds (`external-web-sources`, `verified-record`, `third-party-registry`). `websiteUrl` and `websiteScreenshot` are optional (not every client has a live website).

#### Consent extensions

```ts
// packages/werkstatt-site/src/domain/pbp/entities/consent.ts

export type PbpConsentScopeStatus = "not_requested" | "granted" | "denied";

export interface PbpConsentScopeEntry {
  status: PbpConsentScopeStatus;
  grantedAt: string | null; // ISO 8601 timestamp when status is "granted"
  method: PbpConsentMethod; // how consent was obtained for this aspect
}

export interface PbpConsentScope {
  document: PbpConsentScopeEntry;
  screenshot: PbpConsentScopeEntry;
  websiteLink: PbpConsentScopeEntry;
}

export interface PbpConsent extends PbpEntity {
  type: "consent";
  name: string;
  textVersion: string;
  purposes: string[];
  channels: string[];
  dataElements: string[];
  evidenceRef: string | null;
  withdrawalContact?: string;
  // RFC-0885: replaces consentStatus, grantedAt, method with per-aspect scope
  consentScope: PbpConsentScope;
}
```

The old `consentStatus`, `grantedAt`, and `method` fields are removed (no backward compatibility). `consentScope` is required on all Nachweis consent entities.

#### Zod schema changes

```ts
// packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts

const pbpEvidenceDisplayAspectSchema = z.enum(["visible", "hidden"]);

const pbpEvidenceDisplaySchema = z.object({
  document: pbpEvidenceDisplayAspectSchema,
  screenshot: pbpEvidenceDisplayAspectSchema,
  websiteLink: pbpEvidenceDisplayAspectSchema,
});

const pbpWebsiteScreenshotSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: nonEmptyString,
  storage: z.enum(["private", "public"]),
  url: nonEmptyString.optional(),
});

// Added to evidenceSourceSchema.extend({...}):
//   display: pbpEvidenceDisplaySchema.optional(),
//   websiteUrl: nonEmptyString.optional(),
//   websiteScreenshot: pbpWebsiteScreenshotSchema.optional(),

// superRefine additions:
//   - display is required for NACHWEIS_EVIDENCE_KINDS
//   - display is rejected (must be absent) for non-Nachweis evidence kinds
```

```ts
// packages/werkstatt-site/src/domain/pbp/schemas/consent.ts

const pbpConsentScopeStatusSchema = z.enum(["not_requested", "granted", "denied"]);

const pbpConsentScopeEntrySchema = z.object({
  status: pbpConsentScopeStatusSchema,
  grantedAt: z.union([z.string(), z.null()]),
  method: pbpConsentMethodSchema,
});

const pbpConsentScopeSchema = z.object({
  document: pbpConsentScopeEntrySchema,
  screenshot: pbpConsentScopeEntrySchema,
  websiteLink: pbpConsentScopeEntrySchema,
});

// consentSchema: remove consentStatus, grantedAt, method; add consentScope
// refine: each scope entry with status "granted" must have non-null grantedAt
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` | Entity types extended with `display?`, `websiteUrl?`, `websiteScreenshot?` |
| `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` | Zod schema extended with new fields and superRefine for Nachweis display requirement/rejection |
| `packages/werkstatt-site/src/domain/pbp/entities/consent.ts` | Entity types: remove `consentStatus`/`grantedAt`/`method`, add `consentScope` |
| `packages/werkstatt-site/src/domain/pbp/schemas/consent.ts` | Zod schema: remove old fields, add `consentScope` with per-aspect entries |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | `evaluateGateV2`: update `consent-granted` condition to check `consentScope.document.status` |
| `packages/werkstatt/src/nachweis/nachweis-consent.ts` | `nachweis.consent.update`: write `consentScope.document` instead of `consentStatus`/`method`/`grantedAt` |
| `packages/werkstatt/src/nachweis/nachweis-withdraw.ts` | `nachweis.withdraw`: set `consentScope.document.status` to `denied` instead of `consentStatus` to `revoked` |
| `packages/werkstatt/src/nachweis/nachweis-validate.ts` | `nachweis.validate`: check `consentScope.document.status` and `grantedAt` instead of `consentStatus`/`grantedAt` |
| `packages/werkstatt/src/migrators/registry.ts` | Register RFC-0885 migrator for consent and evidence-source entity transformation |
| `packages/werkstatt/src/migrators/rfc-0885.ts` | New migrator: transform existing Nachweis consent and evidence-source entities |
| `packages/werkstatt/src/tests-handoff/nachweis-commands.test.ts` | Update test fixtures: replace `consentStatus`/`grantedAt`/`method` with `consentScope` |
| `packages/werkstatt/src/tests-handoff/nachweis-rfc-0872.test.ts` | Update test fixtures: replace `consentStatus`/`grantedAt` with `consentScope` |

### Output format

`pbp.content.validate --json` output shape is unchanged — it reports violations. The validation mechanism is Zod schema parsing (`pbpSchema.parse(doc.frontmatter)` in `content-pbp.ts`). Schema changes produce Zod error messages for:

- Missing `display` field on Nachweis evidence kinds (via `.superRefine()`)
- `display` field present on non-Nachweis evidence kinds (via `.superRefine()`)
- Missing `consentScope` field on consent entities (`.strict()` rejects unknown old fields and requires new fields)
- `granted` scope entry with null `grantedAt` (via `.refine()` on `consentSchema`)

The command code (`content-pbp.ts`) does not change — it already calls `pbpSchema.parse()`. The schemas it consumes change, so the command's validation behavior changes automatically.

### Failure modes

- `pbp.content.validate` fails (exit non-zero) when a Nachweis EvidenceSource entity lacks the `display` field.
- `pbp.content.validate` fails when a PbpConsent entity has `consentStatus` (removed field) instead of `consentScope`.
- `pbp.content.validate` fails when any `consentScope` entry has `status: "granted"` but `grantedAt: null`.
- Schema validation rejects unknown fields (`.strict()`) — old entities with `consentStatus` are rejected, signaling the migration requirement.

## Rollout

1. **Schema change**: Update entity types and Zod schemas in `packages/werkstatt-site/src/domain/pbp/`.
2. **Engine-side updates**: Update `evaluateGateV2`, `nachweis.consent.update`, `nachweis.withdraw`, and `nachweis.validate` in `packages/werkstatt/src/nachweis/` to use `consentScope` instead of removed fields.
3. **Migrator**: Register a migrator (`packages/werkstatt/src/migrators/rfc-0885.ts`) that transforms existing Nachweis entities:
   - **Consent mapping** (old `consentStatus` → new `consentScope`):
     | Old `consentStatus` | `consentScope.document` | `consentScope.screenshot` | `consentScope.websiteLink` |
     | --- | --- | --- | --- |
     | `not_requested` | `{ status: "not_requested", grantedAt: null, method: "none" }` | same | same |
     | `requested` | `{ status: "not_requested", grantedAt: null, method: "none" }` | same | same |
     | `partially_granted` | `{ status: "granted", grantedAt: <old grantedAt>, method: <old method> }` | `not_requested` | `not_requested` |
     | `granted` | `{ status: "granted", grantedAt: <old grantedAt>, method: <old method> }` | `not_requested` | `not_requested` |
     | `revoked` | `{ status: "denied", grantedAt: null, method: "none" }` | `not_requested` | `not_requested` |
     | `expired` | `{ status: "not_requested", grantedAt: null, method: "none" }` | same | same |
   - **EvidenceSource mapping**: Add `display: { document: "visible", screenshot: "hidden", websiteLink: "hidden" }` to existing Nachweis EvidenceSource entities (safe defaults: document visible, others hidden). Non-Nachweis evidence kinds are not touched.
4. **Test updates**: Update test fixtures in `packages/werkstatt/src/tests-handoff/nachweis-commands.test.ts` and `nachweis-rfc-0872.test.ts` to use `consentScope` instead of `consentStatus`/`grantedAt`/`method`.
5. **Validation**: `pbp.content.validate` enforces the new schema shape.
6. **Downstream RFCs**: RFC-0886 (kernel commands for granular consent, screenshot upload, per-artifact gates) and RFC-0887 (UI components) build on this schema.

## Alternatives considered

- **Per-item visibility flags in `items[]`**: Rejected because display aspects (document, screenshot, website link) are semantic concepts, not per-artifact flags. The `items[]` map is keyed by arbitrary string keys and contains technical artifacts — display visibility is a higher-level concern.
- **Reuse `items[key].storage` for display control**: Rejected because `storage` controls R2 storage tier (private/public for verification access), not page rendering. An artifact can be stored publicly for hash verification but still hidden from the display page.
- **Multiple consent entities (one per aspect)**: Rejected because it fragments consent management — one consent entity with per-aspect scope is simpler to manage, query, and validate.
- **Keep `consentStatus` as overall status + `consentScope` for granular**: Rejected per operator decision — no backward compatibility is preserved in this project. The cleanest long-term design replaces the flat field entirely.

## Risks

- **Migration risk**: Existing Nachweis entities in Sternsystem repos will fail validation until migrated. The migrator must run during mission materialization.
- **Agent misinterpretation**: Agents may attempt to set `display` on non-Nachweis evidence kinds. The schema superRefine rejects this — `display` is required for `NACHWEIS_EVIDENCE_KINDS` and must be absent for non-Nachweis kinds.
- **Schema strictness**: `.strict()` on both schemas means any entity with old fields (`consentStatus`, top-level `grantedAt`, top-level `method`) is rejected without a compatibility reader. This is intentional — the migrator handles the transition.
- **Engine breakage**: The existing `nachweis.consent.update`, `nachweis.withdraw`, and `nachweis.validate` commands reference removed fields. This RFC updates them minimally to use `consentScope`. Full granular consent commands are deferred to RFC-0886.
- **Security/privacy**: `websiteUrl` and `websiteScreenshot` publish client website data. The `consentScope.websiteLink` and `consentScope.screenshot` aspects control consent for publishing these elements. The publication gate (RFC-0886) must check these consent scopes before publishing — this dependency is explicit but enforcement belongs to RFC-0886.

## Acceptance criteria

- [x] `PbpEvidenceDisplay`, `PbpWebsiteScreenshot` types defined in `evidence-source.ts` entity (evidence: packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts:109-125 defines PbpEvidenceDisplayAspect, PbpEvidenceDisplay, PbpWebsiteScreenshot)
- [x] `PbpConsentScope`, `PbpConsentScopeEntry`, `PbpConsentScopeStatus` types defined in `consent.ts` entity (evidence: packages/werkstatt-site/src/domain/pbp/entities/consent.ts:33-58 defines PbpConsentScopeStatus, PbpConsentScopeEntry, PbpConsentScope)
- [x] `PbpEvidenceSource` interface includes `display?`, `websiteUrl?`, `websiteScreenshot?` fields (evidence: packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts:150-155 adds display, websiteUrl, websiteScreenshot to PbpEvidenceSource)
- [x] `PbpConsent` interface includes `consentScope` field; old `consentStatus`, `grantedAt`, `method` fields removed (evidence: packages/werkstatt-site/src/domain/pbp/entities/consent.ts:60-71 shows consentScope field, old fields absent)
- [x] Zod schema `evidenceSourceSchema` validates new fields with `.strict()`; `superRefine` requires `display` for Nachweis kinds and rejects it for non-Nachweis kinds (evidence: packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts:213-249 adds display/websiteUrl/websiteScreenshot fields and superRefine checks)
- [x] Zod schema `consentSchema` validates `consentScope` with per-aspect entries; rejects old fields (evidence: packages/werkstatt-site/src/domain/pbp/schemas/consent.ts:34-54 replaces consentStatus/grantedAt/method with consentScope, .strict() rejects unknown keys)
- [x] `pbp.content.validate` rejects Nachweis EvidenceSource entities missing `display` (evidence: schema superRefine in evidence-source.ts:236-241 adds issue when isNachweisKind && !hasDisplay)
- [x] `pbp.content.validate` rejects non-Nachweis EvidenceSource entities with `display` (evidence: schema superRefine in evidence-source.ts:243-249 adds issue when !isNachweisKind && hasDisplay)
- [x] `pbp.content.validate` rejects PbpConsent entities with old `consentStatus` field (evidence: .strict() on consentSchema in consent.ts:54 rejects unknown keys including consentStatus)
- [x] `evaluateGateV2` in `nachweis-io.ts` checks `consentScope.document.status` instead of `consentStatus` (evidence: packages/werkstatt/src/nachweis/nachweis-io.ts:271-275 reads consentScope.document.status === 'granted')
- [x] `nachweis.consent.update` writes `consentScope.document` instead of `consentStatus`/`method`/`grantedAt` (evidence: packages/werkstatt/src/nachweis/nachweis-consent.ts:88-113 writes consentScope and deletes old fields)
- [x] `nachweis.withdraw` sets `consentScope.document.status` to `denied` instead of `consentStatus` to `revoked` (evidence: packages/werkstatt/src/nachweis/nachweis-withdraw.ts:130-145 sets consentScope.document.status to 'denied' and deletes old fields)
- [x] `nachweis.validate` checks `consentScope.document.status` and `grantedAt` instead of `consentStatus`/`grantedAt` (evidence: packages/werkstatt/src/nachweis/nachweis-validate.ts:194-210 reads consentScope.document.status and consentScope.document.grantedAt)
- [x] Migrator registered for existing Nachweis entities (evidence: packages/werkstatt/src/migrators/rfc-0885.ts implements consentStatus to consentScope mapping and default display; registered in registry.ts:86)
- [x] Test fixtures updated in `nachweis-commands.test.ts` and `nachweis-rfc-0872.test.ts` (evidence: 5 consent fixtures updated to consentScope, assertion revoked changed to denied, makeValidEntity helper updated with display and slug)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --id RFC-0885 --json returned exitCode 0 with no errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add backward-compatible aliases for `consentStatus`, `grantedAt`, or `method`. The old fields are removed; the migrator handles existing data.
- Agents MUST NOT add `display` to non-Nachweis evidence kinds — the superRefine enforces this, but agents should also respect the intent.
- Agents MUST NOT enforce display↔consent consistency at the schema level. That is the publication gate's responsibility (RFC-0886). The schema defines structure only.
- Agents MUST NOT add `websiteUrl` or `websiteScreenshot` as `items[]` entries. They are top-level fields on `PbpEvidenceSource`, semantically distinct from technical-assessment artifacts.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
