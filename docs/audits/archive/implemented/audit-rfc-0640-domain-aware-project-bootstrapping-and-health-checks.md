---
rfcId: RFC-0640
auditId: AUDIT-RFC-0640-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0640

## Verdict: Needs revision

The RFC cleanly separates concerns across three RFCs (0638/0639/0640) and the fallback-to-software-defaults approach is sound. However, the domain invariant checking mechanism is unspecified, `forge.profile.validate` may be over-engineered for a forge-internal concern, and the `--strict` flag is referenced but not declared in the CLI surface.

## Mechanical validation (rfc.validate)

Pass — 1 V-18 warning: `related "RFC-0638" does not match any existing RFC`. Expected: RFC-0638 is also in `draft` status in the same RFC wave. No errors.

## Axis A — Structural completeness

- **A1: `--strict` flag undeclared.** The Failure modes section (line 228) references a `--strict` flag: "With `--strict` flag, they become errors." But the CLI surface (lines 130–139) only shows `forge doctor --json` — no `--strict` flag. If `--strict` is a new flag for `forge.doctor`, it must be declared in the CLI surface section and in the command registration in `core.module.ts`. The acceptance criteria also don't mention `--strict`.
- **A2: `--id` flag behavior for `forge.profile.validate` underspecified.** The CLI surface shows `forge profile.validate --id editframe-html --json` (validate one) and `forge profile.validate --json` (validate all). But the `ProfileValidateResult` interface and file system responsibilities don't describe the `--id` flag behavior — whether it filters to a single profile or validates all. The output format example only shows a single-profile result.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — acceptable for `kind: command` RFCs (RFC-0331 only requires `--satisfies` for architecture/contract kinds). The RFC indirectly extends DNA-54 (forge bindings contract) by consuming the terminology resolution chain from RFC-0639, but does not establish a new DNA invariant.

## Axis C — Ecosystem fit

- **C1: Compass document synchronization not addressed.** The RFC changes three forge command behaviors and adds one command. If `docs/technology.xml` or `docs/development-plan.xml` describe forge command behavior, they need synchronization. The acceptance criteria mention `packages/forge/AGENTS.md` but not Compass docs. The RFC should either state "No Compass docs affected" or list the specific `docs/*.xml` files that need updates.
- **C2: `forge.profile.validate` scope ambiguity.** The RFC says the command is "workspace-scoped (validates profile files in the forge package, not in the consuming project)" (line 124). But the command validates files under `packages/forge/profiles/` — these are forge's own shipped profiles, not consumer artifacts. This is a forge-internal concern. The RFC should clarify: can consumers declare custom profiles (analogous to `skillPacks`)? If not, the command is forge-internal and its workspace-scoped registration is misleading — it operates on forge's source, not on the consumer's workspace.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive. The fallback to software-domain behavior when a profile has no domain fields is feature-detection-based degradation, not a dual-path compatibility shim. No legacy code paths are maintained behind a flag.

## Axis E — Agent-facing policy

No issues. Implementation notes reference correct governance rules (RFC-0224 transition, RFC-0330 verification, RFC-0334 supersede escalation). No self-authorizing language. Status gate is respected — the RFC is `draft` and does not claim implementation permission.

## Axis F — Pragmatism

- **F1: `forge.profile.validate` may not earn its existence as a CLI command.** Profile YAML files under `packages/forge/profiles/` are forge-internal artifacts authored by forge developers. A unit test in `packages/forge/src/tests/profile-schema.test.ts` (already listed in RFC-0638's file system responsibilities) that validates profiles against the Zod schema would provide the same validation without a new CLI command. The RFC does not explain why a CLI command is needed in addition to the unit test. If the command is intended for consumers to validate custom profiles, the RFC should say so and describe how consumers declare custom profiles. If it's forge-internal, a test suffices.
- **F2: `DoctorDomainReport.terminology` is underspecified.** The TypeScript contract (line 171) declares `terminology: Record<string, string>` with the comment "resolved terminology". But the RFC doesn't specify which terminology keys are resolved — all keys from `UNIVERSAL_TERMINOLOGY` (RFC-0639)? Only keys referenced by skills? This is speculative generality. The RFC should either reference the `UNIVERSAL_TERMINOLOGY` constant from RFC-0639 or list the resolved keys.

## Axis G — Blind spots

- **G1: Domain invariant checking mechanism unspecified.** The RFC says `forge.doctor` "checks domain invariants from the profile's `invariants[]` array" (line 112, 258). But it doesn't specify what "checking" means. Example invariants from RFC-0638: "Compositions use kebab-case filenames", "All speech audio must have ef-captions". How does `forge.doctor` check these? File-system scans? Regex? Custom validator functions? Without a checking mechanism, the acceptance criterion "forge.doctor checks domain invariants" is unimplementable. The RFC needs to either: (a) define a checking mechanism (e.g. each invariant has a `check` function or a `pattern` + `glob`), or (b) state that invariants are reported but not automatically checked (the doctor just lists them).
- **G2: `workspaceTypes` detection interaction with existing precedence.** The current `detectWorkspaceType` in `workspace-discovery.ts` has a hardcoded precedence: app > service > package. The RFC says `forge.agents.generate` "uses `workspaceTypes[]` from the profile for workspace detection" (line 261) and "If multiple workspace types match the same directory, reports a warning and uses the first match" (line 229). But it doesn't explain whether the profile's `workspaceTypes` order replaces the existing precedence or layers on top. Does the fallback (when `workspaceTypes` is absent) still use the hardcoded app > service > package precedence?
- **G3: `forge.profile.validate` as advisory check in `forge.doctor` — failure behavior unspecified.** The RFC says `forge.profile.validate` is "added to `forge.doctor` as an advisory check (not gating)" (line 238). But it doesn't specify what `forge.doctor` reports when profile validation fails — a warning? An error? The `DoctorCheck` interface in the existing code uses `status: "pass" | "fail" | "warn"`. The RFC should specify the check status.
- **G4: Dependency ordering on RFC-0638 not in acceptance criteria.** `forge.profile.validate` validates profiles against the schema defined in RFC-0638. If RFC-0638 is not yet implemented, `forge.profile.validate` has no schema to validate against. The acceptance criteria don't include "RFC-0638 is implemented" as a precondition. The RFC should either add this as an acceptance criterion or state that implementation order is enforced externally.

## Questions for the author

1. How are domain invariants checked by `forge.doctor`? The RFC lists example invariants ("Compositions use kebab-case filenames", "All speech audio must have ef-captions") but doesn't define the checking mechanism. Does each invariant carry a `check` function, a `pattern` + `glob`, or are invariants reported-only (listed but not automatically verified)?
2. Why is `forge.profile.validate` a CLI command rather than a unit test? Profile YAML files are forge-internal artifacts. If consumers cannot declare custom profiles, a test in `packages/forge/src/tests/` provides the same validation without a new command. If consumers can declare custom profiles, the RFC should describe that mechanism.
3. When `workspaceTypes` from the profile is active, does it fully replace the hardcoded `detectWorkspaceType` precedence (app > service > package), or does it layer on top with the hardcoded types as fallback? What happens to directories that match no profile-declared workspace type?
