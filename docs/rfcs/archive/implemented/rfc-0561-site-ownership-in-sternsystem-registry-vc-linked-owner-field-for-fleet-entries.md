---
id: RFC-0561
title: "Site Ownership in Sternsystem Registry: VC-linked owner field for fleet entries"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0354
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - RFC-0354
  - RFC-0558
  - RFC-0559
  - RFC-0560
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-45
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - sternsystem.register
    - sternsystem.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/ontology
  - packages/os/site-kernel-handoff
  - packages/studio-gate
successSignals:
  - "A fleet registry entry with an owner field containing a VC subject id passes sternsystem.validate."
  - "A fleet registry entry without an owner field passes sternsystem.validate with a notice-level warning, not an error."
  - "A SiteOwnershipCredential presented to Studio Gate has its subject.id matched against the registry entry's owner field for the target site."
nonGoals:
  - "Do not implement ownership transfer between operators — the owner field is set at registration time; transfer chains are future work."
  - "Do not implement multi-owner sites — one owner per Sternsystem in the pilot."
  - "Do not implement owner field in the pin file (system.pin.json) — ownership lives in the fleet registry only."
  - "Do not implement automatic owner assignment from onboarding — the operator explicitly sets owner during registration or via a separate command."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0561: Site Ownership in Sternsystem Registry: VC-linked owner field for fleet entries

## Context

DNA-45 (Fleet registry, RFC-0354) established `systems/registry.yaml` as the canonical fleet registry. Each entry has `id`, `repo`, `pin`, and optional fields. There is no `owner` field — the registry does not record who owns a Sternsystem.

RFC-0558 introduced VC-based identity with `SiteOwnershipCredential` VCs. RFC-0559 added auth middleware to Studio Gate that verifies credentials. But the auth middleware has no registry-side anchor to verify that the credential's subject actually owns the target site. The middleware can verify that a VC is validly signed, but cannot verify that the VC subject is the rightful owner of the Sternsystem.

This RFC adds an optional `owner` field to `fleetRegistryEntrySchema` in `packages/ontology/src/operations/sternsystem.ts`. The field stores the VC subject id from the `SiteOwnershipCredential`. Studio Gate auth middleware (RFC-0559) uses this field to verify that the credential subject matches the registered owner.

## Problem

1. **No owner in registry.** `fleetRegistryEntrySchema` (`packages/ontology/src/operations/sternsystem.ts`) has no `owner` field. The registry records what a Sternsystem is (id, repo, pin) but not who owns it.
2. **Auth middleware cannot verify ownership.** Studio Gate auth middleware (RFC-0559) can verify that a `SiteOwnershipCredential` VC is validly signed and has the correct `siteId`. But without a registry-side owner field, it cannot verify that the VC subject is the actual owner — only that someone with a valid keypair issued a credential for that site.
3. **No ownership anchor for P2P.** In the future P2P network (RFC-0562), any node needs to verify who owns a site. The registry is the natural anchor for this, but it currently lacks the owner field.

## Decision

`fleetRegistryEntrySchema` gains an optional `owner?: string` field. The field stores a VC subject id (e.g., `did:web:warpgogol.com#operator-v1`). `sternsystem.validate` checks that if `owner` is present, it is a valid VC subject id string. `sternsystem.register` accepts an `--owner` flag. Studio Gate auth middleware (RFC-0559) reads the registry entry for the target site and verifies that the credential subject matches the `owner` field.

## Architectural fit

- **DNA-45 (Fleet registry):** Extends RFC-0354 by adding the `owner` field to the registry entry schema. Existing entries without `owner` remain valid — the field is optional.
- **DNA-44 (Sternsystem bundle):** The registry is the fleet-level metadata for a Sternsystem. Adding `owner` aligns with the registry's role as the canonical source of site metadata.
- **RFC-0558 (Identity Model):** Depends on RFC-0558 for the VC subject id format. The `owner` field stores the same `did:web` identifier used in `SiteOwnershipCredentialSubject.id`.
- **RFC-0559 (Studio Gate Auth):** Studio Gate reads the `owner` field from the registry to verify that the credential subject matches the registered owner. If `owner` is absent from the registry, Studio Gate skips the ownership check (permissive mode) or rejects the call (enforced mode).
- **RFC-0560 (Mission Actor Identity):** Mission commands use the VC subject id as the actor. The registry `owner` field provides the anchor for verifying that the actor is the site owner.
- **Scaling:** The `owner` field is a single string per registry entry. No performance impact at scale. In the P2P network (RFC-0562), the registry is replicated via the DHT (RFC-0565), and the `owner` field travels with it.

## Design

### CLI surface

```sh
# Register a new Sternsystem with owner
pnpm exec site-kernel run sternsystem.register --id my-site --repo https://github.com/org/my-site --owner did:web:my-site.com#operator-v1 --json

# Validate registry entries (owner field checked if present)
pnpm exec site-kernel run sternsystem.validate --json

# Register without owner (backwards compatible)
pnpm exec site-kernel run sternsystem.register --id legacy-site --repo https://github.com/org/legacy-site --json
```

### TypeScript contracts

```ts
// packages/ontology/src/operations/sternsystem.ts

// VC subject id format: did:web:<domain>#<key-version> (RFC-0558)
const didWebRe = /^did:web:[a-z0-9.-]+#.+$/;

// Existing fleetRegistryEntrySchema gains optional owner field
export const fleetRegistryEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  repo: z.string().url(),
  pin: z.string().optional(),
  // NEW: VC subject id from SiteOwnershipCredential (RFC-0558)
  // Format: did:web:<domain>#<key-version>
  // Empty string is NOT valid — owner is either absent or a non-empty did:web identifier
  owner: z.string().regex(didWebRe, "owner must be a did:web identifier (did:web:<domain>#<key-version>)").optional(),
  // ... existing fields
});

// Type inference
export type FleetRegistryEntry = z.infer<typeof fleetRegistryEntrySchema>;

// packages/studio-gate/src/auth.ts (addition to RFC-0559)

// Registry path is always systems/registry.yaml relative to the workspace root.
// Studio Gate runs in the workspace root, so the path is fixed.
export async function verifyOwnership(
  siteId: string,
  credentialSubjectId: string,
  registryPath: string, // always systems/registry.yaml relative to workspace root
): Promise<boolean> {
  // 1. Read registry entry for siteId from registryPath
  // 2. If entry.owner is absent, return true (permissive) or false (enforced)
  //    Mode is determined by authMode in werkstatt.identity.json (RFC-0559)
  // 3. If entry.owner is present, return entry.owner === credentialSubjectId
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/operations/sternsystem.ts` | `fleetRegistryEntrySchema` gains optional `owner?: string` field. |
| `systems/registry.yaml` | Fleet registry entries may include `owner` field. Existing entries without `owner` remain valid. |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` | `sternsystem.register` accepts `--owner` flag and writes it to the registry entry. `--amend --id <existing-site> --owner <new-id>` updates owner for existing entries. |
| `packages/studio-gate/src/auth.ts` | `verifyOwnership` function reads registry entry and checks `owner` field against credential subject. |

### Output format

```json
{
  "command": "sternsystem.validate",
  "status": "pass",
  "data": {
    "entries": 15,
    "withOwner": 3,
    "withoutOwner": 12,
    "warnings": [
      { "entry": "legacy-site", "field": "owner", "message": "owner field not set; Studio Gate cannot verify ownership for this site" }
    ]
  },
  "summary": "sternsystem.validate: 15 entries, 3 with owner, 12 without owner"
}
```

Entries without `owner` produce a notice-level warning, not an error. The `status` remains `pass`.

### Failure modes

| Condition | Behavior |
| --- | --- |
| `owner` field present and valid `did:web` identifier | `sternsystem.validate` passes. |
| `owner` field absent | `sternsystem.validate` passes with notice-level warning. Not an error. |
| `owner` field present but not a valid `did:web:<domain>#<key-version>` format | `sternsystem.validate` fails with `owner-format-invalid` error. |
| Studio Gate enforced mode + registry `owner` absent | Studio Gate rejects call with `owner-not-registered` error. |
| Studio Gate permissive mode + registry `owner` absent | Studio Gate logs warning, executes call. |
| Credential subject does not match registry `owner` | Studio Gate rejects call with `owner-mismatch` error. |

## Rollout

- **Phase 1 (schema change):** Add optional `owner` field to `fleetRegistryEntrySchema`. `sternsystem.validate` accepts entries with or without `owner`. No breaking change.
- **Phase 2 (registration):** `sternsystem.register` accepts `--owner` flag. New sites registered with owner. Existing sites remain without `owner`.
- **Phase 3 (Studio Gate integration):** Studio Gate auth middleware reads `owner` from registry. In permissive mode, missing `owner` is a warning. In enforced mode, missing `owner` is an error.
- **Phase 4 (backfill):** Operators run `sternsystem.register --amend --id <existing-site> --owner <vc-subject-id>` to backfill owner for existing sites. This is a manual operator action, not automated. The `--amend` flag is already supported by `sternsystem.register` for updating existing entries.

## Alternatives considered

1. **Owner in pin file (system.pin.json).** Store owner in the pin file instead of the registry. Rejected: the pin file is a per-site artifact, not a fleet-level metadata source. The registry is the canonical fleet metadata. Owner is fleet-level information.
2. **Owner as a separate ownership.yaml file.** Create a new `systems/ownership.yaml` mapping site ids to owner ids. Rejected: fragments ownership metadata across files. The registry already exists and is the natural place for fleet-level metadata.
3. **Owner as a VC stored in the registry.** Store the full `SiteOwnershipCredential` VC in the registry entry instead of just the subject id. Rejected: the VC is a runtime artifact that may be revoked or re-issued. The registry should store the stable subject id, not the volatile VC. The VC is verified at runtime by Studio Gate.
4. **Mandatory owner field.** Make `owner` required in the schema. Rejected: breaks all existing registry entries. The pilot needs backwards compatibility — existing sites without owner must remain valid during the transition period.

## Risks

- **Owner field not backfilled.** Operators may forget to backfill `owner` for existing sites. In enforced mode, Studio Gate will reject calls to these sites. Mitigation: `sternsystem.validate` produces notice-level warnings for entries without `owner`, making the gap visible.
- **Owner mismatch between registry and VC.** If an operator rotates keys (RFC-0558 future `rotateKey`), the VC subject id changes but the registry `owner` field still has the old id. Mitigation: operators update the registry `owner` field via `sternsystem.register --amend --id <site> --owner <new-did>`. A future RFC may automate this.
- **No transfer mechanism.** The pilot does not support ownership transfer. If a site is sold or transferred, the operator must manually update the registry `owner` field and issue a new VC. This is acceptable for the pilot but will need a formal transfer flow in the future.
- **Agent confusion.** LLM agents may not understand the relationship between VC subject id and registry `owner`. Mitigation: Studio Gate handles this automatically — agents do not need to manually check ownership.

## Acceptance criteria

- [x] `fleetRegistryEntrySchema` in `packages/ontology/src/operations/sternsystem.ts` has optional `owner` field validated against `did:web:<domain>#<key-version>` format (evidence: packages/ontology/src/operations/sternsystem.ts:68-72, packages/ontology/src/tests/sternsystem-owner.test.ts:25-30)
- [x] `sternsystem.register` accepts `--owner` flag (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts:148, packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts:51)
- [x] `sternsystem.validate` passes for entries with and without `owner` field (evidence: pnpm exec site-kernel run sternsystem.validate --json — exitCode 0 with existing registry)
- [x] `sternsystem.validate` produces notice-level warning for entries without `owner` (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts:142-151, sternsystem.validate output: `[owner] warpgogol-com: owner field not set`)
- [x] `sternsystem.validate` fails for entries with `owner` field that does not match `did:web:<domain>#<key-version>` format (evidence: packages/ontology/src/operations/sternsystem.ts:29 didWebRe regex enforced by Zod parse in readRegistry, packages/ontology/src/tests/sternsystem-owner.test.ts:33-38)
- [x] Studio Gate `verifyOwnership` function reads registry `owner` field (evidence: packages/studio-gate/src/auth.ts:201-249)
- [x] Existing `systems/registry.yaml` entries without `owner` remain valid (evidence: pnpm exec site-kernel run sternsystem.validate — passes with 0 owner-format violations, 1 missing-owner warning)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate RFC-0561 — All 1 RFC(s) passed validation)

### Owner field format

The `owner` field stores a VC subject id in `did:web:<domain>#<key-version>` format, as defined by RFC-0558's `SiteOwnershipCredentialSubject.id`. The Zod schema validates this format at parse time. The domain in the `did:web` identifier is NOT required to match the Sternsystem id — an operator may own multiple sites with different domains. An empty string is not valid; `owner` is either absent (undefined) or a non-empty `did:web` identifier.

### Studio Gate mode configuration

Studio Gate's permissive vs enforced mode is controlled by `authMode` in `werkstatt.identity.json`, as established by RFC-0559. This RFC does not redefine the mode configuration — it relies on RFC-0559's auth middleware mode. When `owner` is absent from the registry entry, Studio Gate's behavior depends on the existing `authMode` setting: permissive mode logs a warning and executes; enforced mode rejects with `owner-not-registered`.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT make the `owner` field required in `fleetRegistryEntrySchema` — it is optional for backwards compatibility.
- Agents MUST NOT store the full VC in the registry — only the VC subject id string.
- `sternsystem.validate` MUST NOT fail for entries without `owner` — only warn.
- Studio Gate in enforced mode MUST reject calls when `owner` is absent from the registry entry.
