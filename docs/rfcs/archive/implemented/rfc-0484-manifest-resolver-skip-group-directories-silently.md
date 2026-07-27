---
id: RFC-0484
title: "Manifest resolver: skip group directories silently"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-21
implementedAt: 2026-07-21
enhancedAt: 2026-07-21
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0072
satisfies:
  - DNA-42
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/ontology"
successSignals:
  - "No [manifest-resolver] no manifest debug messages for group directories (effects, section-body, seo) during astro build"
  - "pnpm --filter @gogol/ontology build:check passes"
  - "pnpm --filter @gogol/ontology test passes"
nonGoals:
  - "Does not change manifest resolution logic — only suppresses noise for directories that legitimately have no manifest"
  - "Does not add manifest files to group directories — they are structural groupings, not components"
---

# RFC-0484: Manifest resolver: skip group directories silently

## Context

`getSectionPropsSchema` in `packages/ontology/src/schemas/manifest-resolver.ts` scans all subdirectories of `packages/ui/src/sections/` and `packages/ui/src/components/` to find a manifest matching a given `cosmicName`. For each directory entry, it tries to read `<dir>/<dir>-section.manifest.yaml` (or `.manifest.yaml`), and on failure logs:

```
[manifest-resolver] no manifest for effects (tried effects-component.manifest.yaml and effects.manifest.yaml)
```

Three directories are **group directories** — structural containers for sub-components, not components themselves:

| Directory | Contents | Has manifest? |
| --- | --- | --- |
| `components/effects/` | `effect-host.astro`, `effect-host.manifest.yaml`, `registry.ts` | Yes, but named `effect-host`, not `effects` |
| `components/section-body/` | Subdirectories: `cards/`, `comparison/`, `list/`, etc. | No — group container |
| `components/seo/` | Subdirectories: `social-meta/`, `structured-data/` | No — group container |

The resolver iterates these group directories, fails to find a manifest named after the directory, and logs a debug message. This produces 3+ noisy `[manifest-resolver] no manifest for ...` lines in every build.

## Problem

The debug messages are noise — they fire for every directory that doesn't have a self-titled manifest, which is expected for group directories. The messages provide no actionable information and clutter the build output.

## Decision

Suppress the `console.debug` message for directories that have no manifest file. The resolver already handles missing manifests gracefully (it `continue`s to the next candidate). The debug message should only fire when a manifest file **exists but cannot be read or parsed** — indicating a real problem.

### Implementation

In `packages/ontology/src/schemas/manifest-resolver.ts`, change the "no manifest" branch:

**Before:**

```typescript
try {
  raw = await readFile(manifestPath, "utf8");
} catch {
  try {
    raw = await readFile(manifestPathAlt, "utf8");
  } catch {
    console.debug(
      `[manifest-resolver] no manifest for ${dir} (tried ${dir}${layerSuffix}.manifest.yaml and ${dir}.manifest.yaml)`,
    );
    continue;
  }
}
```

**After:**

```typescript
try {
  raw = await readFile(manifestPath, "utf8");
} catch {
  try {
    raw = await readFile(manifestPathAlt, "utf8");
  } catch {
    // No manifest file found for this directory — expected for group
    // directories (effects, section-body, seo) that contain sub-components
    // but are not components themselves. Skip silently.
    continue;
  }
}
```

The `console.debug` for YAML parse failures remains — that indicates a real manifest corruption issue.

## Design

The change preserves the existing try/catch/continue flow in `getSectionPropsSchema`. The resolver scans all subdirectories of `sections/` and `components/`, attempting to read a manifest named `<dir>-section.manifest.yaml` or `<dir>-component.manifest.yaml`, falling back to `<dir>.manifest.yaml`. When neither file exists, the current code logs a `console.debug` message and continues to the next candidate.

After the change, the "no manifest" branch simply calls `continue` without logging. The resolver's return behaviour is unchanged — it still returns `null` when no manifest matches the requested `cosmicName`. The `console.debug` for YAML parse failures (line 90-93) and for unreadable layer directories (line 58-61) remains, as those indicate real errors — not expected conditions.

No new types, no new exports, no new control flow. The change is a single-line removal of a `console.debug` call.

## Rollout

The change is automatic — no migration needed. All existing apps and packages pass without changes. The resolver's behaviour for directories with manifests is unchanged; only the noise in build output is reduced. New apps with new group directories are automatically handled — any directory without a manifest is skipped silently.

## Architectural fit

- **RFC-0072 (Section archetype contract):** Group directories are structural containers, not sections or components. They are not required to have manifests.
- **DNA-42 (Compass scaffolding):** No schema changes — only logging behaviour. The `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks in `manifest-resolver.ts` remain accurate; no Compass scaffolding changes are needed.

## Alternatives considered

- **Add manifest files to group directories.** Rejected: group directories are not components and should not participate in the cosmic name catalog. Adding manifests would pollute the catalog with non-component entries.

- **Filter group directories by name.** Rejected: hardcoding a list of group directory names is brittle and requires maintenance. The absence of a manifest file is the correct signal.

- **Check for subdirectories before trying to read a manifest.** Rejected: adds complexity for a simple noise-suppression fix. The current try/catch/continue flow is correct — only the logging is unnecessary.

## Risks

- **Silent failure for real manifest issues.** If a component directory is missing its manifest due to a naming error, the resolver will now skip it silently instead of logging a hint. Mitigation: `section.contract.validate` and `component.contract.validate` in the check pipeline enforce manifest presence for all component/section directories — the build-time check catches missing manifests independently of the resolver.

## Acceptance criteria

- [x] `console.debug` for "no manifest" is removed from `manifest-resolver.ts` (evidence: packages/ontology/src/schemas/manifest-resolver.ts:77-80, comment replaces console.debug)
- [x] `console.debug` for YAML parse failure remains (evidence: packages/ontology/src/schemas/manifest-resolver.ts:91-93)
- [x] `pnpm --filter @gogol/ontology build:check` passes (evidence: exit code 0, 2026-07-21)
- [x] `pnpm --filter @gogol/ontology test` passes (evidence: 40 tests passed, 2026-07-21)
- [x] No `[manifest-resolver] no manifest for effects/section-body/seo` messages in build output (evidence: grep search for "no manifest for" in manifest-resolver.ts returns 0 results)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0484 --json, status: pass, 2026-07-21)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The change is a single-line removal of the `console.debug` call in the "no manifest" catch block.
- Agents MUST NOT remove the `console.debug` for YAML parse failures — that indicates real manifest corruption.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
