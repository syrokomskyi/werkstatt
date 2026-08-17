---
rfcId: RFC-0870
auditId: AUDIT-RFC-0870-01
date: 2026-08-17
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0870

## Verdict: Needs revision

The RFC addresses three real operational gaps discovered during mission m000068, but contains critical factual errors about the generator ownership registry and the kernel CLI module path. Change 1 and Change 2 both reference a `committed` field that does not exist on `OwnershipEntry`, and neither `image-variants.generated.yaml` nor `live-video-manifest.generated.yaml` are registered in `GENERATOR_OWNERSHIP_MAP`. Change 3 cites a non-existent file path (`packages/forge/os/kernel/kernel-runner.ts`).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0870` reports zero violations.

## Axis A — Structural completeness

- **Decision** is present tense and clear — three distinct changes, each well-scoped.
- **CLI surface** shows exact invocations with flags.
- **TypeScript contracts** are minimal signatures, but `RegistryOnlyFile` declares a `committed` field that does not exist on the actual `OwnershipEntry` interface (`packages/werkstatt-site/src/checks/generator-ownership.ts:40-70`). The real interface has `path`, `command`, `markerPolicy`, `module`, `conditional` — no `committed` field.
- **File system responsibilities** table lists `packages/forge/os/kernel/kernel-runner.ts` for Change 3 — this file does not exist. The CLI entry point is `packages/werkstatt/src/kernel/cli/index.ts` (line 39: `Unknown command "${commandName}"`), and the "No target site" error is thrown from `packages/werkstatt/src/kernel/runtime/execute-command.ts:447` and `execute-pipeline.ts:1192`.
- **Output format** documents the `--json` shape for Change 1.
- **Failure modes** specifies warn-vs-fail behavior for all three changes.
- **Rollout** is immediate for all three — no migration window.
- **Alternatives considered** has four real alternatives with rejection reasons.
- **Risks** covers false positives, git checkout conflicts, and stale hints.
- **Acceptance criteria** are checkable but reference test files by name (`sternsystem-validate.test.ts`, `mission-materialize.test.ts`, `kernel-runner.test.ts`) — the last one does not exist and the test would need to target the CLI module in `@warpgogol/werkstatt`, not `@warpgogol/forge`.
- **Implementation notes** are standard template boilerplate.

## Axis B — DNA alignment

- **DNA-47 (Materialization):** Change 2 directly enforces that a materialized workpiece is immediately buildable. The alignment is correct — `mission.materialize` is listed as an enforcer of DNA-47 in `docs/architecture-dna.md:203-205`.
- **DNA-58 (Generated-file content determinism):** Change 1 enforces that committed generated manifests are not silently deleted. The alignment is correct — the manifest is a committed generated artifact per RFC-0834.
- No conflicts with other DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries:** The RFC declares `packagesImpacted: ["@warpgogol/werkstatt", "@warpgogol/werkstatt-site"]`. Change 1 (`sternsystem.validate`) and Change 2 (`mission.materialize`) are in `@warpgogol/werkstatt` — correct. Change 2 reads the generator ownership registry from `@warpgogol/werkstatt-site/src/checks/generator-ownership.ts` — this is a cross-package read from the engine into the site plugin. The engine (`@warpgogol/werkstatt`) MUST NOT statically import from `@warpgogol/werkstatt-site` (DNA-64, enforced by `werkstatt.autonomy.validate`). The RFC does not address how `mission.materialize` will access the ownership registry without violating the autonomy boundary. A dynamic `import()` is the sanctioned escape hatch per `packages/werkstatt/AGENTS.md`, but the RFC does not mention this.
- **Change 3 file path:** `packages/forge/os/kernel/kernel-runner.ts` does not exist. The CLI is in `@warpgogol/werkstatt` (`packages/werkstatt/src/kernel/cli/index.ts`), not `@warpgogol/forge`. The `packagesImpacted` list should include `@warpgogol/werkstatt` for Change 3 (already listed), but the file path in the table is wrong.
- **Pipeline placement:** No new pipeline steps proposed — changes are internal to existing commands.
- **AGENTS.md updates:** The RFC mentions updating `AGENTS.md` with a pipeline-vs-command note (acceptance criterion). This is correct.
- **Command lifecycle:** `commands.proposed/added/changed/removed` are all empty — correct, since no new commands are proposed.

## Axis D — Forward-only compliance

- No backward compatibility layers, shims, or dual-paths proposed.
- All three changes are additive to existing commands — no deprecation needed.
- No legacy code paths maintained behind flags.

## Axis E — Agent-facing policy

- **Status gate:** The RFC is in `draft` status and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference the correct governance rules (RFC-0224, RFC-0330, RFC-0334).
- **NEEDS CLARIFICATION markers:** No unresolved markers found.
- **Storage policy:** No cookies or client-side persistence introduced.

## Axis F — Pragmatism

- **Minimal command surface:** No new commands — all changes are internal to existing commands. Good.
- **Lean contracts:** `ManifestPresenceFinding` and `PipelineHint` are minimal. `RegistryOnlyFile` has a phantom `committed` field.
- **Existing patterns:** Change 1 extends `sternsystem.validate` (correct choice over a new command — the alternatives section explicitly rejects a separate `manifest.presence.validate`). Change 2 extends `mission.materialize`. Change 3 extends the CLI error path.
- **Scope discipline:** `packagesImpacted` lists two packages but Change 3 touches a third module path (`packages/werkstatt/src/kernel/cli/index.ts`). The list is incomplete — `@warpgogol/forge` is NOT impacted (the file path is wrong), but `@warpgogol/werkstatt` is (already listed).

## Axis G — Blind spots

- **Manifest registry gap (critical):** The RFC's Change 1 says it checks "registered generated manifests with `markerPolicy: "registry-only"` and `committed: true`". But neither `image-variants.generated.yaml` nor `live-video-manifest.generated.yaml` are in `GENERATOR_OWNERSHIP_MAP`. The ownership map only registers the binary outputs (`public/_img/**/*.webp`, `public/_video/**`, `public/_video/live/**`) — not the YAML manifests. The RFC must either (a) add the manifest paths to `GENERATOR_OWNERSHIP_MAP` first, or (b) hardcode the manifest paths in `sternsystem.validate` without referencing the ownership registry. Option (b) contradicts the RFC's claim that it reads the registry.
- **`video-manifest.generated.yaml` omission:** The RFC mentions `image-variants.generated.yaml` and `live-video-manifest.generated.yaml` but omits `src/video-manifest.generated.yaml` — also a committed generated manifest per RFC-0834. The file system responsibilities table and the `STERN-MANIFEST-01` check should cover all three manifests.
- **Autonomy boundary:** `mission.materialize` (in `@warpgogol/werkstatt`) reading `GENERATOR_OWNERSHIP_MAP` (in `@warpgogol/werkstatt-site`) violates DNA-64 unless a dynamic `import()` is used. The RFC does not address this.
- **Performance:** `sternsystem.validate` reading cache clone git HEAD for each system is a `git ls-tree` or `git cat-file` call per system — negligible cost. No concern.
- **False positives on new Sternsystemen:** The RFC addresses this in Risks — only checks manifests registered in the ownership registry AND tracked in git. But since the manifests are NOT in the registry, this mitigation doesn't apply as written.
- **Edge cases:** The RFC considers `git checkout` conflicts (Risk 2) and handles them correctly — materialize creates a fresh staging directory, so no uncommitted changes exist.

## Questions for the author

1. The manifests (`src/image-variants.generated.yaml`, `src/live-video-manifest.generated.yaml`, `src/video-manifest.generated.yaml`) are NOT in `GENERATOR_OWNERSHIP_MAP`. How will Change 1 read "registered generated manifests" when they are not registered? Will you add them to the registry first, or hardcode the paths in `sternsystem.validate`?
2. The `OwnershipEntry` interface has no `committed` field. The `RegistryOnlyFile` contract declares `committed: true` — where does this field come from? Will you add it to `OwnershipEntry`, or remove it from the contract?
3. `mission.materialize` is in `@warpgogol/werkstatt` (engine) and `GENERATOR_OWNERSHIP_MAP` is in `@warpgogol/werkstatt-site` (site plugin). DNA-64 forbids static imports from the engine to the site plugin. Will you use a dynamic `import()`, or move the registry to `@warpgogol/werkstatt-shared`?
4. The file path `packages/forge/os/kernel/kernel-runner.ts` does not exist. The CLI is at `packages/werkstatt/src/kernel/cli/index.ts`. Should Change 3 target the CLI module (for "Unknown command") or `execute-command.ts` (for "No target site resolved")? Both error paths need the hint.
5. Why is `src/video-manifest.generated.yaml` omitted from the manifest presence check? It is also a committed generated manifest per RFC-0834.
