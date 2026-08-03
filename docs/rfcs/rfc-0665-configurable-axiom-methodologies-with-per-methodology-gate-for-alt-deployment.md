---
id: RFC-0665
title: "Configurable Axiom methodologies with per-methodology gate for alt deployment"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-03
updatedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - DNA-48
  - RFC-0629
  - RFC-0627
  - RFC-0628
  - RFC-0630
  - RFC-0633
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-48
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
    - methodologies.validate
  added:
    - methodologies.validate
  changed:
    - mission.check
    - leitstand.propagate
    - leitstand.dev-deploy
    - axiom.report
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
  - "@syrokomskyi/axiom-methodology"
  - "@syrokomskyi/axiom-capture"
  - "@syrokomskyi/axiom-study"
successSignals:
  - "systems/methodologies.md exists and methodologies.validate passes"
  - "mission.check reads config, delegates to external Axiom package, writes combined study-run with findings from all active methodologies"
  - "leitstand.propagate groups findings by methodologyId, checks per-methodology block-on severity, fails on violations"
  - "evidence-metadata.json contains methodologies[] with id, digest, blockOn for each active methodology"
  - "axiom.report shows gate summary (pass/fail per methodology) followed by findings grouped by methodology"
  - "mission.check no longer imports extractAxeResult, runAccessibilityInstrument, or createAutomatedWebAccessibilityMethodology directly"
nonGoals:
  - "Does not add new methodologies beyond the 8 already available in @syrokomskyi/axiom-methodology fixtures"
  - "Does not change the cloudflare-workers deployment adapter"
  - "Does not change the release state machine"
  - "Does not change R2 evidence archive topology (RFC-0650)"
  - "Does not add a --methodologies CLI flag to override config at runtime"
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

# RFC-0665: Configurable Axiom methodologies with per-methodology gate for alt deployment

## Context

The Werkstatt uses Axiom as a verification gate for promoting site releases from `dev` to `alt` deployment channels (RFC-0627, RFC-0629). `mission.check --external-preview` captures browser states via Playwright, runs the `automated-web-accessibility` methodology, and writes evidence files (`staged-capsule.json`, `observation-bundle.json`, `study-run.json`, `evidence-metadata.json`) to `missions/{missionId}/evidence/axiom/`. `leitstand.propagate` then verifies this evidence before deploying to `alt`: it checks that `evidence-metadata.json` and `study-run.json` exist with matching `missionId` + `commitSha`, and fails if high/critical axe violations are present.

The `@syrokomskyi/axiom-methodology` package ships 8 methodology factories: `automated-web-accessibility`, `multilingual-content-consistency`, `runtime-functional-health`, `privacy-consent-compliance`, `seo-technical-runtime`, `security-headers`, `performance-vitals`, and `visual-regression`. Each has its own instrument, evidence requirements, epistemic contract, and parameters (axe version, thresholds, severity mappings). However, `mission.check` (in `packages/os/site-kernel-checks/src/mission-check.ts:740`) hardcodes a single methodology — `createAutomatedWebAccessibilityMethodology()` — with no way to activate others. The gate in `leitstand.propagate` only checks `accessibility.axe.violation` predicates, ignoring all other finding types.

Additionally, `mission-check.ts` violates the separation of concerns between Werkstatt and external Axiom packages: it imports `extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, and `findingsForObservation` directly, coupling Werkstatt to axe-specific capture and instrument internals. The external Axiom packages should own capture, instrument execution, and finding projection; Werkstatt should only configure, orchestrate, and enforce the gate.

## Problem

1. **No configurability**: The active methodology is hardcoded in `mission-check.ts:740`. There is no way to enable additional methodologies (performance, SEO, security headers, etc.) without code changes.

2. **No per-methodology gate**: `leitstand.propagate` only checks `accessibility.axe.violation` findings with high/critical severity. Findings from other methodologies (if they existed) would be ignored by the gate.

3. **Leaky abstraction**: `mission-check.ts` imports axe-specific functions (`extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, `findingsForObservation`) directly from external Axiom packages. Werkstatt knows about axe internals, instrument execution, and finding projection — responsibilities that belong in the external Axiom packages.

4. **No evidence traceability for methodologies**: `evidence-metadata.json` records `missionId`, `commitSha`, and `runTimestamp`, but does not list which methodologies were active or their digests. The R2 archive (RFC-0650) cannot answer "which methodologies produced these findings?"

5. **No config validation**: There is no command to validate a methodologies configuration file before deployment. An invalid config would only surface at `mission.check` runtime, potentially blocking a dev deploy.

## Decision

The Werkstatt gains a workspace-level methodologies configuration file (`systems/methodologies.md`) with three frontmatter sections — `instruments`, `methodologies`, and `gate` — that declares all active Axiom methodologies, their instrument parameters, and the gate aggregation rule. `mission.check` reads this config and delegates capture + instrument execution + finding projection to the external Axiom package, receiving a combined study-run. `leitstand.propagate` enforces a per-methodology gate: each methodology declares `blockOn` severity levels, and the gate fails if any active methodology has violations at or above its `blockOn` threshold. A new `methodologies.validate` command validates the config file and runs in `build.check`.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand)**: Extends the Axiom verification gate in `leitstand.propagate` from a single-methodology accessibility check to a configurable multi-methodology gate. The gate remains a hard requirement for `alt` deployment — this RFC makes it configurable, not optional.
- **DNA-48 (Release discipline)**: The Axiom evidence gate is part of the release discipline chain. This RFC strengthens it by allowing multiple methodologies to block promotion, each with its own severity threshold.
- **RFC-0629**: Migrated `mission.check` to native Axiom capsules with `automated-web-accessibility` methodology. This RFC generalizes that migration to support all 8 methodologies via configuration.
- **RFC-0627**: Established the dev-deploy → Axiom gate → propagate pipeline. This RFC extends the gate to be multi-methodology.
- **RFC-0633**: `axiom.report` generates HTML triage reports. This RFC extends the report to show a gate summary (pass/fail per methodology) and group findings by methodology.
- **Site OS operator model**: `methodologies.validate` is a workspace-scoped command in `site-kernel-checks`. `mission.check` and `leitstand.propagate` are existing commands that gain config-reading behavior. The config file lives at `systems/methodologies.md` alongside `systems/registry.yaml`.

## Design

### Configuration file: `systems/methodologies.md`

A Markdown file with YAML frontmatter at `systems/methodologies.md`. Three sections: `instruments`, `methodologies`, `gate`.

```yaml
---
instruments:
  - id: accessibility-axe
    type: accessibility
    params:
      axeVersion: "4.12.1"
  - id: runtime-health-browser
    type: runtime-health
    params: {}
  - id: seo-runtime
    type: seo-runtime
    params: {}
  - id: security-headers-http
    type: security-headers
    params: {}
  - id: performance-vitals
    type: performance-vitals
    params:
      lcpThreshold: 2500
      clsThreshold: 0.1
      inpThreshold: 200
  - id: visual-regression
    type: visual-regression
    params:
      diffThreshold: 0.1
  - id: privacy-consent
    type: privacy-consent
    params: {}
  - id: multilingual-consistency
    type: multilingual-consistency
    params: {}

methodologies:
  - id: automated-web-accessibility
    instrument: accessibility-axe
    active: true
    blockOn: [high, critical]
  - id: multilingual-content-consistency
    instrument: multilingual-consistency
    active: true
    blockOn: [high, critical]
  - id: runtime-functional-health
    instrument: runtime-health-browser
    active: true
    blockOn: [critical]
  - id: privacy-consent-compliance
    instrument: privacy-consent
    active: true
    blockOn: [high, critical]
  - id: seo-technical-runtime
    instrument: seo-runtime
    active: true
    blockOn: [high, critical]
  - id: security-headers
    instrument: security-headers-http
    active: true
    blockOn: [high, critical]
  - id: performance-vitals
    instrument: performance-vitals
    active: true
    blockOn: [critical]
  - id: visual-regression
    instrument: visual-regression
    active: false
    blockOn: [critical]

gate:
  aggregation: all-must-pass
  allowIncomplete: true
  requireEvidence: true
  minCoverage: 1.0
---

# Workshop Methodologies

This file configures which Axiom methodologies are active for the Werkstatt
and how their results are aggregated into the deployment gate for `alt` channel.

## Adding a methodology

Uncomment the methodology in the `methodologies` section and set `active: true`.
Adjust `blockOn` to control which severity levels block `leitstand.propagate`.

## Disabling a methodology

Set `active: false` or comment out the entry. Inactive methodologies are skipped
by `mission.check` and do not contribute to the gate decision.
```

### CLI surface

```sh
# Validate the methodologies config
pnpm exec site-kernel run methodologies.validate

# mission.check reads systems/methodologies.md automatically
pnpm exec site-kernel run mission.check --mission=warpgogol-com-m000027 \
  --external-preview --base-url=https://dev.warpgogol.com

# leitstand.propagate reads evidence-metadata.json (which lists active methodologies)
pnpm exec site-kernel run leitstand.propagate --system=warpgogol-com
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/methodologies-config.ts

export const instrumentConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "accessibility",
    "runtime-health",
    "seo-runtime",
    "security-headers",
    "performance-vitals",
    "visual-regression",
    "privacy-consent",
    "multilingual-consistency",
  ]),
  params: z.record(z.unknown()).default({}),
});

export const methodologyConfigSchema = z.object({
  id: z.string().min(1),
  instrument: z.string().min(1),
  active: z.boolean().default(true),
  blockOn: z.array(z.enum(["low", "medium", "high", "critical"])).default(["high", "critical"]),
});

export const gateConfigSchema = z.object({
  aggregation: z.literal("all-must-pass"),
  allowIncomplete: z.boolean().default(true),
  requireEvidence: z.boolean().default(true),
  minCoverage: z.number().min(0).max(1).default(1.0),
});

export const methodologiesConfigSchema = z.object({
  instruments: z.array(instrumentConfigSchema),
  methodologies: z.array(methodologyConfigSchema),
  gate: gateConfigSchema,
});

export type MethodologiesConfig = z.infer<typeof methodologiesConfigSchema>;

// Evidence metadata extension
export const methodologyEvidenceSchema = z.object({
  id: z.string().min(1),
  digest: z.string().min(1),
  blockOn: z.array(z.enum(["low", "medium", "high", "critical"])),
});

export const evidenceMetadataSchema = z.object({
  missionId: z.string().min(1),
  commitSha: z.string().optional(),
  runTimestamp: z.string().min(1),
  methodologies: z.array(methodologyEvidenceSchema),
});
```

### Contract: mission.check → external Axiom package

`mission.check` delegates capture + instrument execution + finding projection to the external Axiom package. The contract:

```ts
// External Axiom package provides:
export interface RunActiveMethodologiesInput {
  config: MethodologiesConfig;
  contract: CaptureContract;
  baseUrl: string;
  missionId: string;
  commitSha?: string;
  locales: string[];
  overrides: { maxDuration?: number; maxUrls?: number; maxDepth?: number };
}

export interface RunActiveMethodologiesResult {
  studyRun: StudyRun;
  stagedCapsule: StagedCapsule;
  observationBundle: ObservationBundle;
  methodologyDigests: Array<{ id: string; digest: string }>;
}

export async function runActiveMethodologies(
  input: RunActiveMethodologiesInput,
): Promise<RunActiveMethodologiesResult>;
```

`mission.check` reads `systems/methodologies.md`, parses the config, calls `runActiveMethodologies`, writes the combined evidence files, and auto-generates `report.html`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/methodologies.md` | Workshop-level methodologies config (new) |
| `missions/{missionId}/evidence/axiom/staged-capsule.json` | Combined capsule from all active methodologies |
| `missions/{missionId}/evidence/axiom/observation-bundle.json` | Combined observations from all active instruments |
| `missions/{missionId}/evidence/axiom/study-run.json` | Combined study-run with findings from all methodologies |
| `missions/{missionId}/evidence/axiom/evidence-metadata.json` | Extended with `methodologies[]` array |
| `missions/{missionId}/evidence/axiom/report.html` | Extended with gate summary + per-methodology sections |

### Output format

`methodologies.validate --json`:

```json
{
  "command": "methodologies.validate",
  "status": "pass",
  "config": {
    "instruments": 8,
    "methodologies": 8,
    "activeMethodologies": 7,
    "gate": { "aggregation": "all-must-pass", "allowIncomplete": true, "requireEvidence": true, "minCoverage": 1.0 }
  }
}
```

### Gate logic in `leitstand.propagate`

1. Read `evidence-metadata.json` — extract `methodologies[]` array.
2. For each methodology in `methodologies[]`:
   - Filter `study-run.json` findings where `finding.methodologyId === methodology.id`.
   - Filter findings where `finding.severity` is in `methodology.blockOn`.
   - If any findings remain, gate fails with `"Axiom verification failed: methodology '{id}' has {N} block-on violation(s)"`.
3. If `gate.requireEvidence` is true, verify each active methodology has at least one finding or one observation in the study-run.
4. If `gate.minCoverage < 1.0`, verify the ratio of covered pages to discovered pages meets the threshold per methodology.
5. Incomplete findings (e.g., `accessibility.axe.incomplete`) do not block the gate — they are instrument limitations, not confirmed violations.

### Failure modes

- **Config not found**: `mission.check` fails with `"systems/methodologies.md not found. Create it or run onboarding.scaffold."` Exit code 2.
- **Config invalid**: `methodologies.validate` fails with schema violations. `mission.check` also fails if config is invalid. Exit code 1.
- **Unknown methodology id**: `methodologies.validate` fails with `"Unknown methodology id '{id}'. Available: {list}"`.
- **Unknown instrument ref**: `methodologies.validate` fails with `"Methodology '{id}' references unknown instrument '{ref}'"`.
- **Gate failure**: `leitstand.propagate` fails with per-methodology violation counts. Exit code 1.
- **Missing evidence for active methodology**: `leitstand.propagate` fails with `"No evidence found for methodology '{id}'. Run leitstand.dev-deploy first."`

## Rollout

- **Config is mandatory**: `systems/methodologies.md` must exist for `mission.check` to run. No silent default.
- **Migration for warpgogol-com**: Create `systems/methodologies.md` with all 8 methodologies, `visual-regression` set to `active: false` (requires baseline screenshots not yet available). Other 7 set to `active: true` with appropriate `blockOn` thresholds.
- **External Axiom package**: `runActiveMethodologies` function added to `@syrokomskyi/axiom-methodology` (or a new orchestration package). This is an external package change, not a Werkstatt change — the RFC defines the contract.
- **mission.check refactoring**: Remove direct imports of `extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, `findingsForObservation`. Replace with `runActiveMethodologies` call.
- **methodologies.validate**: Added to `build.check` pipeline for all systems.
- **axiom.report**: Extended to read `methodologies[]` from `evidence-metadata.json` and render gate summary + per-methodology sections.
- **New sites**: `onboarding.scaffold` creates `systems/methodologies.md` with all 8 methodologies (visual-regression `active: false` by default).

## Alternatives considered

1. **Per-methodology separate passes (separate mission.check calls)**: Rejected — 8 Playwright passes would be 8x slower. One capture + many instruments is more efficient and matches the current architecture.

2. **Config in registry.yaml under each system**: Rejected — the operator wants one config for the entire workshop, not per-system. Methodologies are a workshop-level concern, not per-site.

3. **Gate with weighted aggregation**: Rejected — too complex for the current need. `all-must-pass` with per-methodology `blockOn` is simple, predictable, and covers the real use cases. Weighted aggregation can be added later if needed.

4. **Hardcoded high/critical from any methodology**: Rejected — too rigid. Different methodologies need different thresholds (e.g., performance-vitals should only block on critical, not high). Per-methodology `blockOn` gives this control.

5. **Config in pure YAML (not MD with frontmatter)**: Rejected — MD with frontmatter is preferred by the operator. It allows documentation alongside the config and is consistent with other Werkstatt config files.

## Risks

- **External package dependency**: `runActiveMethodologies` must be implemented in the external Axiom package before this RFC can be fully implemented. If the external package is not updated, `mission.check` cannot function. Mitigation: the RFC defines the contract; implementation can be staged.
- **Capture scope expansion**: Each methodology may need different capture data (HTTP headers, screenshots, console logs). The external package must extend capture to collect all data needed by active instruments in one pass. This is a significant external package change.
- **False positives from new methodologies**: Activating 7 methodologies instead of 1 may surface findings that were previously invisible. The operator may need to fix issues or adjust `blockOn` thresholds before the gate passes. This is expected — the gate is working as designed.
- **Config drift**: If the operator comments out a methodology but forgets to update `evidence-metadata.json`, the gate may pass incorrectly. Mitigation: `leitstand.propagate` reads `methodologies[]` from evidence-metadata, not from the config file — the evidence is self-contained.
- **Agent misinterpretation**: Agents may try to add new methodologies by editing `fixtures.ts` in the external package. The RFC does not add new methodologies — it makes existing ones configurable. Adding methodologies requires a separate RFC.

## Acceptance criteria

- [ ] `systems/methodologies.md` exists with `instruments`, `methodologies`, and `gate` sections
- [ ] `methodologies.validate` command registered and passes on the config file
- [ ] `methodologies.validate` integrated into `build.check` pipeline
- [ ] `mission.check` reads `systems/methodologies.md` and delegates to `runActiveMethodologies`
- [ ] `mission.check` no longer imports `extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, or `findingsForObservation` directly
- [ ] `evidence-metadata.json` contains `methodologies[]` with `id`, `digest`, and `blockOn` for each active methodology
- [ ] `leitstand.propagate` reads `methodologies[]` from `evidence-metadata.json` and enforces per-methodology `blockOn` gate
- [ ] `leitstand.propagate` fails with a clear message when an active methodology has violations at or above its `blockOn` threshold
- [ ] `leitstand.propagate` does not fail on `incomplete` findings (instrument limitations)
- [ ] `axiom.report` renders gate summary (pass/fail per methodology) followed by findings grouped by methodology
- [ ] `onboarding.scaffold` creates `systems/methodologies.md` with all 8 methodologies (visual-regression `active: false`)
- [ ] `AGENTS.md` updated to document `systems/methodologies.md` and the per-methodology gate
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT add new methodologies to `fixtures.ts` in the external Axiom package as part of this RFC — this RFC makes existing methodologies configurable, it does not add new ones.
- Agents MUST implement `runActiveMethodologies` in the external Axiom package, not in Werkstatt packages. Werkstatt packages only read config, call the external function, and write evidence.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
