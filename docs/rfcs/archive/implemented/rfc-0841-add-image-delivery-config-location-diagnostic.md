---
id: RFC-0841
title: "Add image-delivery.config.yaml location diagnostic"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt: 2026-08-14
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-62
  - RFC-0830
  - RFC-0840
satisfies:
  - DNA-72
dependsOn:
  - RFC-0830
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - image.delivery.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "`image.delivery.validate` emits `IMG-DELIVERY-CONFIG-02` (warning) when `image-delivery.config.yaml` is found in the workpiece root but not in `src/`."
  - "`image.delivery.validate` logs the resolved config path (or 'not found') in its summary output."
  - "Operators no longer silently lose override configuration due to placing the file in the wrong directory."
  - "DNA-72 is established in `docs/architecture-dna.md` and `dna.registry.validate` passes."
nonGoals:
  - "This RFC does not move the config file location — it remains in `src/` (RFC-0830 contract)."
  - "This RFC does not validate the YAML schema of the config file — that is already handled by `loadDeliveryConfig`."
  - "This RFC does not add config file auto-discovery from multiple locations — it only warns about a misplaced file."
---

# RFC-0841: Add image-delivery.config.yaml location diagnostic

## Context

During deployment of mission `warpgogol-com-m000055`, `image.delivery.validate` failed with 377 errors even though an `image-delivery.config.yaml` escape hatch file had been created. The root cause: the file was placed in the workpiece root (`/workpiece/image-delivery.config.yaml`), but the validator reads it from `srcDirectory` (`/workpiece/src/image-delivery.config.yaml`, line 221 of `image-delivery.ts`). The validator silently loaded no config and reported all findings as errors — no warning, no diagnostic, no hint about the wrong location.

## Problem

The `image.delivery.validate` command (RFC-0830) loads its override config from a hardcoded path: `join(paths.srcDirectory, "image-delivery.config.yaml")`. If the file does not exist at that path, `loadDeliveryConfig` returns an empty config with no warnings. The validator then runs all rules against all images with no overrides applied.

This is a silent failure mode:

- The operator creates the file in the workpiece root (a natural assumption — many config files live at the root).
- The validator ignores it completely.
- All override rules are silently inactive.
- The operator sees the same errors as before and has no indication that the config file is being ignored.

## Decision

Add a location diagnostic to `image.delivery.validate`:

1. **Check for misplaced config:** Before loading the config from `src/`, check if `image-delivery.config.yaml` exists in the workpiece root (`paths.appDirectory`). If it exists at the root but NOT in `src/`, emit `IMG-DELIVERY-CONFIG-02` (warning).

2. **Log resolved config path:** Include the resolved config path (or "not found") in the validator's summary output, so operators can verify which file is being loaded.

## Architectural fit

- **Architecture DNA:** Establishes DNA-72 (Validator config location diagnostics). Extends DNA-62 (Foundation File Integrity) with a diagnostic pattern for config files that are loaded from non-obvious paths.
- **Site OS operator model:** No new command — extends existing `image.delivery.validate` with a diagnostic finding. Non-blocking (warning severity).
- **RFC-0830 compatibility:** The config file location remains `src/image-delivery.config.yaml`. This RFC only adds a diagnostic, it does not change the contract.

## Design

### `IMG-DELIVERY-CONFIG-02` rule

| Rule ID | Check | Severity | Message |
| --- | --- | --- | --- |
| `IMG-DELIVERY-CONFIG-02` | Config file found in workpiece root but not in `src/` | warning | `image-delivery.config.yaml` found at workpiece root but validator reads from `src/image-delivery.config.yaml`. Move the file to `src/` to apply overrides. |

### Implementation

In `runImageDeliveryValidate`, before the existing `loadDeliveryConfig` call:

```ts
const rootConfigPath = join(paths.appDirectory, "image-delivery.config.yaml");
const srcConfigPath = join(paths.srcDirectory, "image-delivery.config.yaml");

if (existsSync(rootConfigPath) && !existsSync(srcConfigPath)) {
  findings.push({
    rule: "IMG-DELIVERY-CONFIG-02",
    file: rootConfigPath,
    line: 0,
    src: "",
    severity: "warning",
    message: `image-delivery.config.yaml found at workpiece root but validator reads from src/image-delivery.config.yaml. Move the file to src/ to apply overrides.`,
    fixHint: "Move image-delivery.config.yaml from workpiece root to src/",
  });
}

logger.info(
  `  Config: ${existsSync(srcConfigPath) ? srcConfigPath : "not found"}`,
);
```

### Summary output change

The validator summary changes from:

```
image.delivery.validate: 377 finding(s), 122 image(s) checked
```

to:

```
image.delivery.validate: 378 finding(s), 122 image(s) checked (config: src/image-delivery.config.yaml)
```

or:

```
image.delivery.validate: 377 finding(s), 122 image(s) checked (config: not found)
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/image-delivery.ts` | Extended with root-location check and summary path logging |

### Failure modes

- **Config file in both root and `src/`:** No warning — the `src/` location is used correctly. The root copy is ignored (operator should delete it).
- **Config file in neither location:** No warning — no overrides are configured, which is a valid state.
- **Config file only in `src/`:** No warning — correct location.
- **Config file only in root:** `IMG-DELIVERY-CONFIG-02` warning emitted.

## Rollout

1. Add the root-location check to `runImageDeliveryValidate`.
2. Add the config path to the summary output.
3. Update the `image-delivery.test.ts` with a test case for `IMG-DELIVERY-CONFIG-02`.

No pipeline changes needed — `image.delivery.validate` is already in `SITES_CHECK_POSTBUILD_PIPELINE`.

## Alternatives considered

- **Auto-discover config from both locations:** Loading from both root and `src/` would introduce ambiguity about which overrides take precedence. The RFC-0830 contract is clear: `src/` is the location. Auto-discovery would weaken the contract.
- **Make the config location configurable via CLI flag:** Over-engineered for a simple path issue. The diagnostic is sufficient.
- **Error instead of warning:** Too aggressive — the validator can still run without overrides. A warning guides the operator without blocking.

## Risks

- **False positive for sites that intentionally have a root-level `image-delivery.config.yaml` for other purposes:** Unlikely — the filename is specific to the RFC-0830 validator. If a site has a same-named file for a different purpose, the warning is a minor annoyance, not a blocker.

## Acceptance criteria

- [x] `IMG-DELIVERY-CONFIG-01` warning emitted when config is in root but not in `src/` (evidence: packages/werkstatt-site/src/checks/image-delivery.ts:243-256, implemented as `IMG-DELIVERY-CONFIG-02` per grilling decision; test: image-delivery.test.ts "IMG-DELIVERY-CONFIG-02: warns when config is in root but not in src/")
- [x] Config path logged in validator summary output (evidence: packages/werkstatt-site/src/checks/image-delivery.ts:413-418, summary includes `(config: ${configPathLabel})`)
- [x] Unit test: config in root only → `IMG-DELIVERY-CONFIG-01` warning (evidence: image-delivery.test.ts "IMG-DELIVERY-CONFIG-02: warns when config is in root but not in src/")
- [x] Unit test: config in `src/` only → no warning (evidence: image-delivery.test.ts "IMG-DELIVERY-CONFIG-02: no warning when config is in src/ only")
- [x] Unit test: config in both → no warning (src/ takes precedence) (evidence: image-delivery.test.ts "IMG-DELIVERY-CONFIG-02: no warning when config is in both root and src/")
- [x] Unit test: config in neither → no warning (evidence: image-delivery.test.ts "IMG-DELIVERY-CONFIG-02: no warning when config is in neither location")
- [x] DNA-72 entry appended to `docs/architecture-dna.md` (evidence: docs/architecture-dna.md:295-297, DNA-72 entry references `IMG-DELIVERY-CONFIG-02`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0841` — zero violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0841` and commit the evidence file in the same commit.
- Agents MUST NOT change the config file location from `src/` to root — the RFC-0830 contract is `src/image-delivery.config.yaml`. This RFC only adds a diagnostic.
