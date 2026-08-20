---
id: RFC-0888
title: "Add sichtpass Bordbuch event kind for Sichtpass lifecycle audit trail"
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
  - RFC-0473
amendedBy: []
related:
  - RFC-0460
  - RFC-0706
  - RFC-0707
  - RFC-0872
  - RFC-0885
  - RFC-0886
  - DNA-46
dependsOn:
  - RFC-0886
batch: nachweis-evidence-display
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
    - nachweis.manifest.generate
    - nachweis.publish
    - nachweis.withdraw
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
successSignals:
  - "bordbuchEntryKindSchema includes 'sichtpass' in its enum"
  - "nachweis.manifest.generate appends a sichtpass Bordbuch entry when the Sichtpass manifest is regenerated"
  - "nachweis.publish appends a sichtpass Bordbuch entry after the record is published and the manifest is regenerated"
  - "nachweis.withdraw appends a sichtpass Bordbuch entry with status 'done' and metadata.withdrawn: true"
  - "Bordbuch projection (bordbuch.generate) includes sichtpass events in the public timeline"
nonGoals:
  - "Does not define W3C Verifiable Credential issuance — Sichtpass mapping is defined by RFC-0460, but VC issuance is a future RFC"
  - "Does not change the Sichtpass mapping interface (PbpSichtpassMapping) — that is stable since RFC-0460"
  - "Does not add stellarpass, quartalsbericht, translation, or validation Bordbuch kinds — those remain deferred from RFC-0473"
  - "Does not change the Bordbuch hash-chain algorithm or NDJSON format"
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

# RFC-0888: Add sichtpass Bordbuch event kind for Sichtpass lifecycle audit trail

## Context

RFC-0473 unified the Bordbuch schema and explicitly deferred adding `sichtpass`, `stellarpass`, `quartalsbericht`, `translation`, and `validation` event kinds until their respective pipelines are migrated to Sternsystem topology. The Nachweis pipeline is now fully migrated (RFC-0706, RFC-0707, RFC-0872, RFC-0885, RFC-0886). The Sichtpass concept (RFC-0460) maps PBP publication snapshots to W3C Verifiable Credential mappings, but there is no Bordbuch event recording when a Sichtpass manifest entry is generated, updated, or revoked.

The current Bordbuch kinds for Nachweis are:

- `nachweis-record` — record published or updated
- `nachweis-consent` — consent granted or revoked
- `nachweis-signed` — operator Ed25519 signature applied
- `nachweis-timestamped` — RFC 3161 / eIDAS timestamp applied

These track individual cryptographic operations but do not track the composite Sichtpass manifest generation — the moment when the full envelope (record hash + public derivative hash + signature + timestamp) is assembled into a verifiable Sichtpass entry in the manifest. External verifiers who check the Bordbuch timeline cannot determine when a Sichtpass was issued or regenerated.

## Problem

The Bordbuch entry kind enum (`bordbuchEntryKindSchema` in `packages/werkstatt/src/schemas/mission.ts:50-72`) does not include `sichtpass`. The `nachweis.manifest.generate` command (`packages/werkstatt/src/nachweis/nachweis-manifest.ts`) generates the manifest file but does not append a Bordbuch entry. There is no audit trail for:

1. **Sichtpass issuance**: When `nachweis.manifest.generate` produces a new Sichtpass manifest entry (after signing and timestamping).
2. **Sichtpass regeneration**: When a record is republished (new version, new hashes, new signature) and the manifest is regenerated.
3. **Sichtpass revocation**: When `nachweis.withdraw` revokes a published record and the manifest entry is removed or marked withdrawn.

Without this event kind, the Bordbuch timeline has a gap between `nachweis-timestamped` (last cryptographic operation) and the actual availability of the Sichtpass in the manifest. External verifiers cannot trace a Sichtpass back to a specific Bordbuch event.

## Decision

The `bordbuchEntryKindSchema` enum gains a `sichtpass` value. Three Nachweis commands append `sichtpass` Bordbuch entries at specific lifecycle points: `nachweis.manifest.generate`, `nachweis.publish`, and `nachweis.withdraw`.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: Bordbuch is the append-only hash-chained operational history for Sternsystemen. Adding a new event kind extends the audit trail within the existing mission lifecycle.
- **RFC-0473**: Amends the Bordbuch kind enum originally unified by RFC-0473. The deferred `sichtpass` kind is now added because the Nachweis pipeline is migrated and the Sichtpass concept is operational.
- **RFC-0460**: The Sichtpass mapping interface (`PbpSichtpassMapping`) is stable. This RFC does not change the mapping — it records when the mapping is materialized into the manifest.
- **RFC-0707**: Amends the Nachweis kernel command set — `nachweis.manifest.generate`, `nachweis.publish`, and `nachweis.withdraw` gain Bordbuch append logic.
- **RFC-0886**: Depends on RFC-0886 because the manifest generator must include display and consent fields (from RFC-0885/0886) before the sichtpass event is meaningful.

## Design

### CLI surface

No new CLI commands. The `sichtpass` event kind is appended internally by existing commands.

```sh
# nachweis.publish already exists — now appends sichtpass event after manifest regeneration
pnpm exec werkstatt run nachweis.publish --system warpgogol-com --slug client-xyz-statement

# nachweis.manifest.generate already exists — now appends sichtpass event
pnpm exec werkstatt run nachweis.manifest.generate --system warpgogol-com

# nachweis.withdraw already exists — now appends sichtpass event with withdrawn metadata
pnpm exec werkstatt run nachweis.withdraw --system warpgogol-com --slug client-xyz-statement
```

### TypeScript contracts

```ts
// packages/werkstatt/src/schemas/mission.ts — extended enum
export const bordbuchEntryKindSchema = z.enum([
  // ... existing kinds ...
  // RFC-0888: Sichtpass lifecycle audit trail
  "sichtpass",
]);

// Documentation-only shape — Bordbuch metadata is Record<string, unknown> in the schema.
// This interface describes the fields that sichtpass entries MUST include in their metadata.
// It is not an exported type; it lives here as a contract for implementers.
interface SichtpassBordbuchMetadata {
  slug: string;
  manifestVersion: string; // manifest entry version
  recordHash: string; // SHA-256 of the record payload
  signaturePresent: boolean;
  timestampPresent: boolean;
  verificationLevel: "N0" | "N1" | "N2" | "N3";
  withdrawn?: boolean; // true when nachweis.withdraw triggers the event
}
```

### Bordbuch entry append points

| Command | Trigger | Status | Metadata |
| --- | --- | --- | --- |
| `nachweis.manifest.generate` | Manifest file regenerated | `done` | `{ slug, manifestVersion, recordHash, signaturePresent, timestampPresent, verificationLevel }` |
| `nachweis.publish` | After manifest regeneration (already calls `nachweis.manifest.generate`) | `done` | Same as above — the publish command's sichtpass event supersedes the manifest.generate event for the same slug. `nachweis.manifest.generate` skips the sichtpass append when called from `nachweis.publish` to avoid duplicate entries. |
| `nachweis.withdraw` | Record withdrawn, manifest regenerated | `done` | `{ slug, manifestVersion, withdrawn: true, verificationLevel }`. `nachweis.withdraw` also calls `nachweis.manifest.generate` with `--skip-bordbuch` to avoid duplicate entries, same as `nachweis.publish`. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/schemas/mission.ts` | Add `"sichtpass"` to `bordbuchEntryKindSchema` enum |
| `packages/werkstatt/src/nachweis/nachweis-manifest.ts` | Append `sichtpass` Bordbuch entry after manifest file is written; accept internal `--skip-bordbuch` flag |
| `packages/werkstatt/src/nachweis/nachweis-publish.ts` | Append `sichtpass` Bordbuch entry after manifest regeneration; pass `--skip-bordbuch` to `nachweis.manifest.generate` |
| `packages/werkstatt/src/nachweis/nachweis-withdraw.ts` | Append `sichtpass` Bordbuch entry with `withdrawn: true` metadata; pass `--skip-bordbuch` to `nachweis.manifest.generate` |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register `--skip-bordbuch` boolean flag on `nachweis.manifest.generate` command (hidden from CLI help) |
| `packages/werkstatt/src/bordbuch/bordbuch-io.ts` | Add `sichtpass` to `WRITER_ROLE_KINDS.nachweis` array |

### Output format

The `sichtpass` Bordbuch entry in `events.ndjson`:

```json
{
  "schemaVersion": "1.0.0",
  "id": "event-000125",
  "systemId": "warpgogol-com",
  "occurredAt": "2026-08-20T12:14:00.000Z",
  "kind": "sichtpass",
  "status": "done",
  "missionId": "warpgogol-com-m000078",
  "releaseId": null,
  "actor": "agent",
  "writerRole": "nachweis",
  "summary": "Sichtpass manifest entry generated for 'client-xyz-statement'",
  "metadata": {
    "slug": "client-xyz-statement",
    "manifestVersion": "3",
    "recordHash": "a1b2c3...",
    "signaturePresent": true,
    "timestampPresent": true,
    "verificationLevel": "N3"
  },
  "previousHash": "e5f6g7...",
  "hash": "f7g8h9..."
}
```

Note: `writerRole` is not a field on the Bordbuch entry itself — it is passed to `appendBordbuchEntry` as an option and validated against `WRITER_ROLE_KINDS`, but not persisted in the entry. The `sichtpass` kind uses writer-role `nachweis`.

### Failure modes

- If `nachweis.manifest.generate` fails to write the manifest file, no `sichtpass` Bordbuch entry is appended (fail-fast — the entry records success, not failure).
- If the Bordbuch append fails after manifest generation, the manifest file is already written. The command returns an error but the manifest is valid — the Bordbuch entry is missing, not the manifest. This is an acceptable inconsistency — the next `nachweis.manifest.generate` call will append a new entry.
- `nachweis.publish` and `nachweis.withdraw` both call `nachweis.manifest.generate` internally. To avoid duplicate `sichtpass` entries, `nachweis.manifest.generate` accepts an internal flag (`--skip-bordbuch`) that both callers set when calling it. The `sichtpass` entry is appended once by the calling command (publish or withdraw), after the manifest is regenerated.
- Repeated standalone `nachweis.manifest.generate` calls (not from publish/withdraw) each append a `sichtpass` entry. This is intentional — each manifest regeneration is a distinct lifecycle event. Agents who call `manifest.generate` standalone should be aware that a new Bordbuch entry is created each time.

### Compass sync

- `docs/requirements.xml` — req-23 (Bordbuch) may need updating to mention `sichtpass` as a tracked event kind.
- `docs/verification-plan.xml` — no new verification rule needed; `bordbuch.validate` already validates all enum kinds.
- `docs/COMMANDS.md` — no new commands; `nachweis.manifest.generate`, `nachweis.publish`, and `nachweis.withdraw` are already documented. The `--skip-bordbuch` flag is internal and not documented in CLI help.

### AGENTS.md updates

- `packages/werkstatt/AGENTS.md` — no change needed. The Bordbuch kind enum is an internal schema detail, not an agent-facing rule. The `sichtpass` kind is mentioned in the RFC and will be referenced by implementation commits.

## Rollout

1. **Schema change**: Add `"sichtpass"` to `bordbuchEntryKindSchema`. Existing Bordbuch files are unaffected — the new kind is additive.
2. **Command changes**: Update `nachweis.manifest.generate`, `nachweis.publish`, and `nachweis.withdraw` to append `sichtpass` entries.
3. **Bordbuch projection**: Update `bordbuch.generate` to include `sichtpass` events in the public timeline.
4. **No migration**: Existing Bordbuch files do not need migration — they simply predate the `sichtpass` kind. New events are appended going forward.
5. **Pipeline integration**: No pipeline changes — the Bordbuch append happens inside existing Nachweis commands that are already part of the mission lifecycle.

## Alternatives considered

- **Reuse `nachweis-record` for Sichtpass events**: Rejected — `nachweis-record` records publication status changes, not manifest generation. The Sichtpass is a composite artifact (record + signature + timestamp + manifest entry) that deserves its own event kind for audit clarity.
- **Add `sichtpass` as a sub-kind in metadata instead of a top-level kind**: Rejected — Bordbuch kinds are top-level enum values for a reason: they enable fast filtering and projection. A sub-kind in metadata would require parsing metadata to filter events, which is slower and less ergonomic.
- **Separate `sichtpass-issued` and `sichtpass-revoked` kinds**: Rejected — a single `sichtpass` kind with `withdrawn: true` metadata is simpler and follows the pattern of `nachweis-record` (which uses `metadata` to distinguish publish vs. update).
- **Wait for W3C VC issuance before adding the kind**: Rejected — the Sichtpass manifest entry (hashes, signature, timestamp) is already generated by the current pipeline. The Bordbuch event records this materialization, which is independent of whether a W3C VC is issued. VC issuance is a future layer on top.

## Risks

- **Duplicate entries**: If `nachweis.manifest.generate` is called standalone (not from `nachweis.publish`), it appends a `sichtpass` entry. If then `nachweis.publish` is called, it calls `manifest.generate` with `--skip-bordbuch` and appends its own entry. This is correct — standalone manifest generation gets its own entry, publish-triggered generation gets a single entry from publish. The risk is if an agent calls `manifest.generate` without `--skip-bordbuch` and then also calls `publish` — two entries are appended. This is harmless (the second entry supersedes the first) but creates noise. The `--skip-bordbuch` flag is internal (not documented in CLI help) to prevent agent confusion.
- **Bordbuch growth**: Each publish/withdraw/manifest-generate cycle adds one entry. For active sites with many Nachweis records, this accelerates Bordbuch growth. This is acceptable — Bordbuch is append-only by design, and the `sichtpass` entry is small (~500 bytes).
- **Projection complexity**: The public Bordbuch projection (`bordbuch.generate`) now includes `sichtpass` events. Visitors see when Sichtpass manifest entries are generated. This is transparency-positive but may confuse non-technical visitors. The projection HTML should label `sichtpass` events clearly ("Sichtpass manifest generated for {slug}").

## Acceptance criteria

- [ ] `bordbuchEntryKindSchema` includes `"sichtpass"` in its enum
- [ ] `nachweis.manifest.generate` appends a `sichtpass` Bordbuch entry after manifest file is written
- [ ] `nachweis.publish` appends a `sichtpass` Bordbuch entry after manifest regeneration
- [ ] `nachweis.publish` calls `nachweis.manifest.generate` with `--skip-bordbuch` to avoid duplicate entries
- [ ] `nachweis.withdraw` calls `nachweis.manifest.generate` with `--skip-bordbuch` to avoid duplicate entries
- [ ] `nachweis.manifest.generate` registers `--skip-bordbuch` boolean flag in `nachweis.module.ts` (hidden from CLI help)
- [ ] `WRITER_ROLE_KINDS.nachweis` in `bordbuch-io.ts` includes `sichtpass`
- [ ] `nachweis.withdraw` appends a `sichtpass` Bordbuch entry with `withdrawn: true` metadata
- [ ] `bordbuch.generate` projection includes `sichtpass` events in the public timeline (automatic — `bordbuch-generate.ts` renders all event kinds without filtering)
- [ ] `bordbuch.validate` accepts `sichtpass` entries without errors
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add `stellarpass`, `quartalsbericht`, `translation`, or `validation` Bordbuch kinds in this RFC — those remain deferred from RFC-0473 and require their own RFCs.
- Agents MUST NOT use `sichtpass` Bordbuch entries as a substitute for `nachweis-record`, `nachweis-signed`, or `nachweis-timestamped` entries. Those track individual operations; `sichtpass` tracks the composite manifest generation.
- Agents MUST ensure the `--skip-bordbuch` internal flag is not documented in CLI help text — it is an internal coordination flag between `nachweis.publish` and `nachweis.manifest.generate`.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.

```

```
