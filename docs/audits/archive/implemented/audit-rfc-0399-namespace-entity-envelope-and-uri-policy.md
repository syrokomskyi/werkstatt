---
rfcId: RFC-0399
auditId: AUDIT-RFC-0399-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0399

## Verdict: Approved

The RFC is a well-scoped contract that establishes the `packages/pbp/` package foundation with a clear, narrow API surface. No failures on axes B, D, or E. One minor finding on axis C (Compass sync timing). Two advisory questions for downstream RFCs.

## Mechanical validation (rfc.validate)

Pass (with 1 warning).

- **V-20 (warning):** `specRef` is an unknown frontmatter key. Same expected warning as RFC-0398 — RFC-0396 introduced the field, schema not yet updated. Not a blocker.

## Axis A — Structural completeness

No issues.

- **Decision** is in present tense, structured into 8 numbered subsections with TypeScript code blocks.
- **CLI surface** explicitly states "No CLI command is introduced" — correct for a library-only RFC.
- **TypeScript contracts** are minimal type signatures, not full implementations. ✓
- **File system responsibilities** table names 8 concrete paths. ✓
- **Output format** states N/A with justification (library, not CLI). ✓
- **Failure modes** specifies behavior for each utility (return vs throw) and build checks. ✓
- **Rollout** describes immediate adoption, no site impact, build integration, Compass sync. ✓
- **Alternatives considered** has 4 real alternatives with rejection reasons. ✓
- **Risks** has 4 risks with mitigations including agent confusion. ✓
- **Acceptance criteria** are 10 checkable items. ✓
- **Implementation notes** are explicit behavioral rules referencing RFC-0224 and RFC-0334. ✓

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-1]` — the RFC body explains `packages/pbp/` is a shared reusable library in `packages/*`, app-agnostic, no cross-site imports. This directly protects DNA-1 (monorepo boundary). ✓
- `related: [DNA-1, DNA-20, DNA-55, RFC-0398]` — all relevant. DNA-20 is the supersession target (not yet superseded), DNA-55 is the spec contract, RFC-0398 is the charter. ✓
- No silent conflict with DNA-20 — explicitly states "This RFC does not supersede DNA-20" and "`@gogol/business` remains canonical for existing sites." ✓
- Does not establish a new DNA invariant — correct for a package-establishment RFC.

## Axis C — Ecosystem fit

Minor finding.

- **Package boundaries:** `packages/pbp/` in `packages/*` (correct per DNA-1). No cross-app imports. ✓
- **Pipeline placement:** `tsc --noEmit` and `vitest run` as standard package build. ✓
- **Compass sync:** **Minor finding** — the RFC says `docs/requirements.xml` and `docs/technology.xml` "will need updates to record the new `@gogol/pbp` package" but defers this to "implementation, not draft stage." This is acceptable, but the implementation step should explicitly include Compass sync as a checklist item. Not a blocker.
- **AGENTS.md updates:** `packages/pbp/AGENTS.md` is in the file system responsibilities table and acceptance criteria. ✓
- **Cosmic naming:** N/A (data layer, not UI). ✓
- **Command lifecycle:** No commands. ✓

## Axis D — Forward-only compliance

No issues.

- No compatibility shim or dual-path. ✓
- Explicitly states `@gogol/pbp` is not consumed by sites until RFC-PBP-102. ✓
- No legacy code paths maintained behind a flag. ✓
- Alternatives section rejects placing types in `@gogol/business` (legacy) to avoid confusion. ✓

## Axis E — Agent-facing policy

No issues.

- **Status gate:** No self-authorizing language. "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes** reference RFC-0224 and RFC-0334. ✓
- **Anti-fabrication:** N/A (no content authoring). ✓
- **Storage policy:** N/A (no persistence). ✓

## Axis F — Pragmatism

No issues.

- **Minimal command surface:** No commands — all utilities are programmatic. ✓
- **Lean contracts:** TypeScript interfaces are minimal — only the envelope fields, no speculative generality. ✓
- **Existing patterns:** Alternatives section explains why `@gogol/business` and `@gogol/ontology` are insufficient. ✓
- **Scope discipline:** `appsImpacted: []` (no sites impacted), `packagesImpacted: [@gogol/pbp]` (only the new package). `nonGoals` are 6 meaningful items. ✓

## Axis G — Blind spots

No issues.

- **Performance:** N/A (no build-time commands, just TypeScript types). ✓
- **False positives:** URI validation false positive risk is documented in Risks with mitigation. ✓
- **Edge cases:** Empty states (new package with no entities yet) are handled — the package exports types only, no runtime data. ✓
- **Migration path:** Documented — no site impact until RFC-PBP-102. ✓
- **Security/privacy:** N/A (no user data, PII, or external services). ✓

## Questions for the author

1. The `validatePbpUri` utility accepts "other RFC-permitted URI schemes" via an optional parameter — which schemes specifically? Should the default be HTTPS-only, or should the spec's "or other permitted URI" be an explicit allowlist?
2. The `PbpEntity` interface has `name?` and `summary?` as optional — but the spec's envelope example (entity-model §3) shows them as present. Should they be required for `published` status, or is the optionality intentional to support `draft` entities without names?
3. The `PbpGovernance.authorityRef` is required — but what happens when authority is "unambiguously derivable from package context" (system-spec §5.2)? Should `authorityRef` be optional with a derivation fallback, or should the package context always provide it explicitly?
