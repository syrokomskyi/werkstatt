---
id: RFC-0082
title: "Shared multi-document YAML helper for onboarding artifacts"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0073
  - RFC-0074
  - RFC-0076
commands:
  proposed: []
  added: []
  changed:
    - onboarding.phase.validate
    - seo.internal-linking.validate
    - analytics.config.validate
    - first-party-data.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - share
  - os/site-kernel-onboarding
  - os/site-kernel-checks
successSignals:
  - One helper in @gogol/share owns the rule "first YAML doc is the RFC-0076 metadata header; last YAML doc is the artifact payload."
  - phase-contract, audit-validators, and content-discipline parsers all consume that helper instead of carrying independent multi-doc tolerance.
  - Adding a new RFC-0076-headed artifact never requires another independent YAML-parse fix.
nonGoals:
  - Reformatting existing single-document onboarding artifacts.
  - Introducing a generic YAML schema framework — this is scoped to onboarding RFC-0076 metadata.
---

# RFC-0082: Shared multi-document YAML helper for onboarding artifacts

## Context

RFC-0076 declares that every machine-readable file under `onboarding/.output/<phase>/` carries an RFC-0076 metadata header (`phase`, `derivedFromInputHash`, `generatedAt`, `generator`). For YAML artifacts that _also_ have a strict data schema (`axes.yaml`, `infra-config.yaml`, `linking-plan.yaml`, `analytics-config.yaml`, `atoms.yaml`, `voice-profile.yaml`, `first-party-data.yaml`), the natural file shape is two YAML documents: a header followed by `---` and then the payload.

The yaml package's default `parse()` rejects multi-document files (`"Source contains multiple documents; please use YAML.parseAllDocuments()"`). During the first full onboarding run for `warpgogol-com` (May 2026), this rule bit three independent code paths in the kernel:

1. `packages/os/site-kernel-onboarding/src/phase-contract.ts` — `parseOutputHeader` for YAML files crashed on `axes.yaml` after the agent wrote a legitimate RFC-0076 header.
2. `packages/os/site-kernel-checks/src/audit-validators.ts` — `seo.internal-linking.validate`, `analytics.config.validate`, and `first-party-data.validate` all crashed on the same pattern in their respective YAML inputs.
3. `packages/share/src/content-discipline/types.ts` — `contentAtomsFileSchema` and `voiceProfileSchema` had to be relaxed from `.strict()` to `.passthrough()` to tolerate top-level metadata keys when the agent chose to merge header and payload into a single document instead of splitting.

Each site was patched independently. The same bug class will reappear the next time a phase artifact gains a YAML shape.

## Problem

There is no canonical answer to: "Given an onboarding YAML artifact, where does the RFC-0076 metadata end and the payload begin?" Different callers infer it differently:

- `phase-contract.ts` after the May 2026 fix uses `parseAllDocuments` and reads doc[0].
- `audit-validators.ts` after the May 2026 fix uses `parseAllDocuments` and reads doc[-1].
- `content-discipline/parsers.ts` still uses single-doc `parse` and accepts merged-single-doc files via `.passthrough()`.

This divergence means a new artifact author must guess the contract and the next validator added will likely reach for `parse()` again, reintroducing the crash.

## Decision

`@gogol/share` exports two helpers under `@gogol/share/onboarding-yaml`:

- `parseOnboardingArtifactHeader(source: string): RfcMetadataHeader | null` — returns the first document parsed as the RFC-0076 metadata header, or null if no header is present.
- `parseOnboardingArtifactPayload<T>(source: string, schema: ZodSchema<T>): T` — returns the artifact payload, choosing either the last document (multi-doc file) or the single document with metadata keys stripped (single-doc file), then validates against the provided Zod schema.

All three call sites switch to these helpers. The content-discipline schemas remain `.passthrough()` because some authors will continue to write single-doc files for ergonomic reasons; the helper transparently handles both shapes.

## Architectural fit

- **RFC-0076** declared the metadata header. This RFC formalizes the parser for it.
- **RFC-0073** owns the content-discipline schemas. This RFC removes their need to know about RFC-0076 layout.
- **RFC-0074** owns the deterministic audit validators. This RFC removes their need to know about RFC-0076 layout.

## Design

### TypeScript contracts

```ts
// packages/share/src/onboarding-yaml/index.ts

export interface RfcMetadataHeader {
  phase: string;
  derivedFromInputHash: string;
  generatedAt: string;
  generator: string;
}

export function parseOnboardingArtifactHeader(source: string): RfcMetadataHeader | null;
export function parseOnboardingArtifactPayload<T>(
  source: string,
  schema: z.ZodType<T>,
): T;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/onboarding-yaml/index.ts` | New helper module. |
| `packages/os/site-kernel-onboarding/src/phase-contract.ts` | Replaces inline parseAllDocuments call with `parseOnboardingArtifactHeader`. |
| `packages/os/site-kernel-checks/src/audit-validators.ts` | Replaces local `parseYaml` wrapper with `parseOnboardingArtifactPayload`. |
| `packages/share/src/content-discipline/parsers.ts` | Replaces `parseYaml(source)` with `parseOnboardingArtifactPayload(source, schema)`. |

### Failure modes

- Header missing on a file declared as `metadata: true` in PHASE_ARTIFACTS → phase validator emits a single, consistent error referencing this RFC.
- Payload doesn't match the schema → Zod error is propagated unchanged.
- Single-doc files where the schema's keys overlap with RFC-0076 keys → the payload helper strips `phase`/`derivedFromInputHash`/`generator`/`generatedAt` before validating, so `.strict()` schemas can be restored where appropriate.

## Rollout

1. Land the helper in `@gogol/share` with full test coverage on both shapes (single-doc, multi-doc) and missing-header cases.
2. Switch the three call sites in one PR. Existing artifacts continue to parse identically — the helper's behavior is a superset of the current per-site logic.
3. Restore `.strict()` on `contentAtomsFileSchema` and `voiceProfileSchema` in a follow-up once the helper strips metadata keys.
4. Add a `rfc-0082` lint rule to `packages-check.run`: any new `YAML.parse` import inside kernel packages that touches onboarding artifacts is flagged as a regression.

## Alternatives considered

- **Forbid the two-doc shape and require single-doc with passthrough on every schema.** Rejected because the strict schemas are valuable for catching typos in author-supplied data; relaxing every schema permanently is a quality loss.
- **Move RFC-0076 metadata to a sidecar `.meta.yaml`.** Rejected because it doubles the file count, makes `git diff` noisier, and breaks the "one artifact, one path" mental model the workflows are built on.

## Risks

- The helper's "last doc is payload" rule will be wrong if someone deliberately writes a 3-doc file. Mitigation: document the contract as exactly two docs (header + payload) and reject anything else.

## Acceptance criteria

- [x] `parseOnboardingArtifactHeader` and `parseOnboardingArtifactPayload` exported from `@gogol/share/onboarding-yaml`. (evidence: packages/ directory, package exists)
- [x] Three call sites migrated (`phase-contract.ts`, `audit-validators.ts`, `content-discipline/parsers.ts`). (evidence: implemented historically)
- [x] `contentAtomsFileSchema` and `voiceProfileSchema` restored to `.strict()`. (evidence: implemented historically)
- [x] Tests cover: single-doc file, two-doc file, missing-header file, empty file, doc-count > 2. (evidence: implemented historically)
- [x] `packages-check.run` lint rule blocks new `YAML.parse` of onboarding artifacts outside the helper. (evidence: implemented historically)
- [x] `AGENTS.md` in `packages/share` updated. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When migrating a call site, agents MUST run the relevant validator against the existing warpgogol-com onboarding artifacts as a smoke test before considering the migration complete.
