---
id: RFC-0535
title: "Extend wikidata.validate with Claim and EvidenceSource coverage checks"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0530
  - RFC-0531
  - DNA-16
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - wikidata.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "wikidata.validate detects missing notability evidence when Business has QID but no external EvidenceSource entries"
  - "wikidata.validate detects factual Claims without evidenceRefs as warnings (errors with --strict)"
  - "wikidata.validate detects dangling Claim.evidenceRefs pointing to non-existent EvidenceSource entities as errors"
  - "wikidata.validate detects EvidenceSource entities without URL in items as errors"
  - "All four new rules fire only when Business has a Wikidata QID — sites without QID see no new findings"
  - "--strict flag escalates notability-evidence and claim-without-evidence warnings to errors"
  - "Existing wikidata.validate tests pass unchanged — new rules are additive"
nonGoals:
  - "No validation of non-factual claims (comparative, benefit, risk, limitation) — these are commercial content, not Wikidata statement candidates"
  - "No minimum source count enforcement (e.g. 'must have 2+ independent sources') — notability threshold is a softer rule, warning is sufficient"
  - "No Wikidata API calls — remains a static validation command, not a live sync"
  - "No automatic addition of EvidenceSource or Claim entities — operators author them manually"
  - "No changes to PBP schemas — Claim and EvidenceSource schemas already exist (RFC-0405, RFC-0416, RFC-0466)"
  - "No changes to JSON-LD projection — this RFC validates content readiness, not rendered output"
  - "No integration into build.check or sites-check pipelines — remains standalone like RFC-0531"
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

# RFC-0535: Extend wikidata.validate with Claim and EvidenceSource coverage checks

## Context

RFC-0530 (implemented) added `externalIdentifiers` to `Business`, `Brand`, and `LegalIdentity` and projected them to JSON-LD `sameAs`. RFC-0531 (implemented) introduced the `wikidata.validate` command, which checks four aspects of Wikidata readiness: QID presence, URL construction from `schemeRef + value`, projection parity between PBP content and rendered JSON-LD, and `LegalIdentity.legalName` presence.

However, `wikidata.validate` only checks **identity-level fields** — it does not examine the PBP `Claim` and `EvidenceSource` entities that are critical for Wikidata's per-statement reference requirement. Wikidata requires that every statement (claim) on an item be backed by at least one reference to an independent source. Without evidence-backed claims, a Wikidata item risks deletion for lacking notability or verifiability.

The PBP entity model already has the necessary entities:

- **`Claim`** (`packages/pbp/src/schemas/claim.ts:33-54`) — carries `claimClass` (including `"factual"`), `claimKind`, `statement`, `evidenceRefs` (a record of `PbpEntityRef` pointing to `EvidenceSource` entities), and `confidence`.
- **`EvidenceSource`** (`packages/pbp/src/schemas/evidence-source.ts:20-36`) — carries `kind` (`"external-web-sources"`, `"verified-record"`, `"third-party-registry"`), `authority`, and `items` (a record of `{ url, retrievedAt }` entries).

These entities are fully wired into the PBP compiler (`compiler/types.ts:66-67` — `claims` and `evidenceSources` are part of the resolved `PbpGraph`). Loaders exist (`getPbpClaims`, `getPbpEvidenceSources` in `packages/pbp/src/loaders.ts:282-292`). But `wikidata.validate` reads only singleton files (`business.md`, `brand.md`, `legal-identity.md`) and never touches the `claims/` or `evidence-sources/` repeatable directories.

## Problem

Four gaps prevent `wikidata.validate` from fully assessing Wikidata readiness:

1. **No notability evidence check.** A Business may have a Wikidata QID (passing RFC-0531's QID presence check) but lack any `EvidenceSource` with `kind: "external-web-sources"` or `"third-party-registry"`. Wikidata requires independent sources to establish notability. Without this check, a site can pass `wikidata.validate` and still be rejected by Wikidata for lacking notability evidence.

2. **No claim evidence coverage check.** `Claim` entities with `claimClass: "factual"` are the natural candidates for Wikidata statements (founding date, industry, country). But a factual claim without `evidenceRefs` cannot be submitted to Wikidata — every statement requires a reference. `wikidata.validate` does not check this.

3. **No evidence reference integrity check.** `Claim.evidenceRefs` may reference `EvidenceSource` entities by `PbpEntityRef` (`{ ref, expectedType }`). If the referenced entity does not exist in the PBP graph (dangling reference), the claim appears to have evidence but actually does not. This is a data integrity error, not just a readiness gap.

4. **No evidence source URL check.** An `EvidenceSource` entity without `items` (or with items lacking `url`) is useless as a Wikidata reference — references must be verifiable. `wikidata.validate` does not validate this.

All four gaps rely on manual operator discipline. The entities and schemas exist, but no automated check connects them to Wikidata readiness.

## Decision

The `wikidata.validate` command (RFC-0531) gains four additional validation rules that check `Claim` and `EvidenceSource` coverage when the Business entity has a Wikidata QID. The new rules are: notability evidence presence, factual claim evidence coverage, evidence reference integrity, and evidence source URL validity. All four rules fire only when `Business.externalIdentifiers` contains a `wikidata.org` scheme — sites without a QID see no new findings. The `--strict` flag escalates notability-evidence and claim-without-evidence warnings to errors, matching the existing `*-missing-qid` escalation pattern.

## Architectural fit

- **DNA-16 (Semantic layer shares topology):** This RFC extends the semantic validation chain to cover the evidence layer behind the semantic output. Wikidata readiness is not just about `sameAs` projection — it requires that the claims behind the entity are evidence-backed. This strengthens the semantic layer's integrity.
- **RFC-0530 (External identifiers):** This RFC builds on RFC-0530's `externalIdentifiers` infrastructure. The QID presence check (RFC-0531) is the gate; the new rules are the follow-up checks that run only when the gate is passed.
- **RFC-0531 (Wikidata readiness validation command):** This RFC extends the existing `wikidata.validate` command with additional rules. It follows the same pattern: standalone command, `--strict` flag, `--json` output, `AuditFinding` shape, `buildAuditResult` helper.
- **RFC-0405 (Claim entity):** This RFC validates `Claim` entities for Wikidata readiness, using the `claimClass: "factual"` filter to identify Wikidata-relevant claims.
- **RFC-0416 (EvidenceSource entity):** This RFC validates `EvidenceSource` entities for URL presence and reference integrity.
- **Site OS operator model:** The command remains app-scoped (`supportsAllSites: true`), standalone (not in `build.check`), and follows the existing `CheckCommandEntry` pattern. No new command is registered — the existing `wikidata.validate` entry in `05-seo-audit.ts` is extended.
- **Scaling Playbook:** The new rules apply uniformly across all sites that use PBP content. Sites without QID are unaffected. Sites with QID get evidence coverage checks automatically.

## Design

### CLI surface

No new command. The existing `wikidata.validate` command is extended with four new validation rules. The CLI surface is unchanged:

```sh
# Check a single site (warnings for missing QIDs and missing evidence)
pnpm exec werkstatt run wikidata.validate --app warpgogol-com

# Strict mode (errors for missing QIDs and missing evidence)
pnpm exec werkstatt run wikidata.validate --app warpgogol-com --strict

# JSON output
pnpm exec werkstatt run wikidata.validate --app warpgogol-com --json

# All sites
pnpm exec werkstatt run wikidata.validate --all --strict --json
```

No new flags. The existing `--strict` flag now also escalates `wikidata.no-notability-evidence` and `wikidata.claim-without-evidence` warnings to errors, in addition to the existing `*-missing-qid` escalation.

### TypeScript contracts

New pure validation functions in `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts`:

```ts
// New rule IDs (added to the existing WikidataValidationRule set)
type WikidataValidationRule =
  // ... existing rules from RFC-0531 ...
  | "wikidata.no-notability-evidence"
  | "wikidata.claim-without-evidence"
  | "wikidata.evidence-broken-ref"
  | "wikidata.evidence-missing-url"

// New pure functions (all unit-testable, no I/O)

function validateNotabilityEvidence(
  hasQid: boolean,
  evidenceSources: EvidenceSourceRecord[],
  contentFile: string,
): AuditFinding | null

function validateClaimEvidenceCoverage(
  claims: ClaimRecord[],
  contentDir: string,
): AuditFinding[]

function validateEvidenceReferences(
  claims: ClaimRecord[],
  evidenceSourceIds: Set<string>,
  contentDir: string,
): AuditFinding[]

function validateEvidenceSourceUrls(
  evidenceSources: EvidenceSourceRecord[],
  contentDir: string,
): AuditFinding[]

// New I/O helper: read all .md files from a repeatable directory
async function readPbpRepeatables(
  dir: string,
): Promise<Record<string, Record<string, unknown>>>

// Extended --strict escalation set
const STRICT_ESCALATION_RULES = [
  "wikidata.business-missing-qid",
  "wikidata.brand-missing-qid",
  "wikidata.legalidentity-missing-qid",
  "wikidata.no-notability-evidence",
  "wikidata.claim-without-evidence",
]
```

The existing `escalateMissingQidWarnings` function is renamed to `escalateStrictWarnings` and extended to escalate all rules in `STRICT_ESCALATION_RULES`, not just `*-missing-qid`. The rename reflects the broader scope — the function now escalates notability-evidence and claim-without-evidence warnings in addition to missing-QID warnings.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` | Extended: add four pure validation functions, `readPbpRepeatables` helper, rename `escalateMissingQidWarnings` to `escalateStrictWarnings`, add new rules to `runWikidataValidate` |
| `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` | Extended: add unit tests for four new pure functions |
| `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts` | Updated: command table `description` references `(RFC-0531, RFC-0535)`, `reads` array includes `claims/*.md` and `evidence-sources/*.md` paths |
| `<app>/src/content/business-profile/{lang}/claims/*.md` | Read: Claim repeatable entities (factual claims, evidenceRefs) |
| `<app>/src/content/business-profile/{lang}/evidence-sources/*.md` | Read: EvidenceSource repeatable entities (kind, items.url) |
| `<app>/src/content/business-profile/{lang}/business.md` | Read: existing — Business.externalIdentifiers (QID gate) |

### Output format

The `--json` output shape is unchanged — the same `AuditFinding` structure with `ruleId`, `severity`, `file`, `message`, `evidence`. New rule IDs produce findings in the same format:

```json
{
  "command": "wikidata.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "findings": [
    {
      "ruleId": "wikidata.no-notability-evidence",
      "severity": "warning",
      "file": "src/content/business-profile/de/business.md",
      "message": "Business has a Wikidata QID but no EvidenceSource with kind 'external-web-sources' or 'third-party-registry'. At least one independent source is required for Wikidata notability.",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/business.md" }]
    },
    {
      "ruleId": "wikidata.claim-without-evidence",
      "severity": "warning",
      "file": "src/content/business-profile/de/claims/founding-date.md",
      "message": "Factual claim 'Founded in 2020' has no evidenceRefs. Wikidata requires at least one reference per statement.",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/claims/founding-date.md" }]
    },
    {
      "ruleId": "wikidata.evidence-broken-ref",
      "severity": "error",
      "file": "src/content/business-profile/de/claims/industry.md",
      "message": "Claim evidenceRefs entry 'industry-source-1' does not resolve to an existing EvidenceSource entity.",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/claims/industry.md" }]
    },
    {
      "ruleId": "wikidata.evidence-missing-url",
      "severity": "error",
      "file": "src/content/business-profile/de/evidence-sources/registry.md",
      "message": "EvidenceSource 'Commercial Register Entry' has no items with url. Wikidata references must be verifiable.",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/evidence-sources/registry.md" }]
    }
  ],
  "runtimeMs": 58
}
```

`status` is `"fail"` when any finding has severity `"error"`, or when `--strict` is set and any finding has severity `"warning"`. This matches the existing `buildAuditResult` behavior.

### Failure modes

- **Business has no Wikidata QID:** All four new rules are skipped entirely. No findings are produced. This matches the staged approach — QID presence is the gate.

- **No claims/ or evidence-sources/ directories:** The repeatable reader returns empty records. Notability evidence check reports a warning (no evidence sources found). Claim evidence coverage check produces no findings (no claims to check). Evidence reference integrity and URL checks produce no findings. This is correct — a site with QID but no claims/evidence is not yet ready.

- **Malformed claim/evidence frontmatter:** The reader parses frontmatter via `parseMarkdownFrontmatter`. If frontmatter is missing or malformed, the entity is skipped (not a crash). This mirrors the existing `readPbpEntity` behavior.

- **Non-factual claims without evidence:** Not flagged. Only `claimClass: "factual"` claims are checked. Comparative, benefit, risk, and limitation claims are commercial content, not Wikidata statement candidates.

- **`--strict` escalation:** `wikidata.no-notability-evidence` and `wikidata.claim-without-evidence` warnings are escalated to errors. `wikidata.evidence-broken-ref` and `wikidata.evidence-missing-url` are always errors — they represent data integrity issues, not readiness gaps.

## Rollout

1. **Additive extension.** The four new rules are added to the existing `wikidata.validate` command. No new command, no new flags, no new pipeline integration. Sites already running `wikidata.validate` get the new rules automatically on next run.

2. **QID-gated.** All four new rules fire only when `Business.externalIdentifiers` contains a `wikidata.org` scheme. Sites without a Wikidata QID see zero new findings — no regression, no noise.

3. **Default: warnings.** Without `--strict`, `no-notability-evidence` and `claim-without-evidence` are warnings. Operators can run the command during preparation without blocking their workflow. `evidence-broken-ref` and `evidence-missing-url` are always errors — they are data integrity issues.

4. **Strict mode.** `--strict` escalates `no-notability-evidence` and `claim-without-evidence` to errors. Operators use this when they are ready to commit to Wikidata integration and need to enforce evidence coverage.

5. **No migration.** The rules read existing PBP content (`claims/*.md`, `evidence-sources/*.md`) — no content changes required. If a site has no claims or evidence-sources directories, the rules produce appropriate warnings (for notability) or no findings (for claim coverage).

6. **No schema changes.** `Claim` and `EvidenceSource` schemas already exist (RFC-0405, RFC-0416, RFC-0466). This RFC only adds validation logic that reads those schemas.

7. **Standalone command.** `wikidata.validate` remains standalone (not in `build.check` or `sites-check` pipelines), matching RFC-0531's design. Operators run it on-demand when preparing for Wikidata integration.

## Alternatives considered

- **Create a separate `wikidata.evidence.validate` command.** Rejected — the new rules are tightly coupled to the existing QID presence check. Splitting them into a separate command forces operators to run two commands for a single readiness check. The QID gate (Business has QID → check evidence) is cleaner within one command.

- **Check all claimClass types, not just factual.** Rejected — comparative, benefit, risk, and limitation claims are commercial content, not Wikidata statement candidates. Checking them would produce false positives on marketing claims that do not need evidence for Wikidata purposes. Only `claimClass: "factual"` claims map to Wikidata statements (founding date, industry, country, legal form).

- **Enforce a minimum source count (e.g. 2+ independent sources).** Rejected — Wikidata's notability threshold is contextual and softer than a hard count. A single high-quality third-party-registry source (e.g. Handelsregister) may be sufficient. A warning for zero sources is appropriate; a hard count threshold would produce false positives.

- **Add to `build.check` pipeline.** Rejected — matches RFC-0531's design decision. Wikidata integration is not yet active for all sites. Adding to `build.check` would produce warnings (or errors in strict mode) on every build for sites not preparing for Wikidata. Standalone command gives operators control.

- **Use PBP compiler graph instead of file-system reader.** Rejected — the PBP compiler (`compilePbpProfile`) requires Astro content collection infrastructure and is not available in a static validation context. `wikidata.validate` is a static file-system validator (like the existing `readPbpEntity` pattern). A new `readPbpRepeatables` helper follows the same file-system-only approach.

## Risks

- **False positives on notability evidence.** A site may have a QID and evidence sources, but all of them may be `kind: "verified-record"` (internal documents). The notability check only accepts `external-web-sources` and `third-party-registry` as independent sources. Mitigation: `verified-record` is intentionally excluded — Wikidata notability requires **independent** sources, and internal records do not qualify. Operators can add an external source or accept the warning.

- **False positives on claim evidence coverage.** A factual claim may intentionally lack evidence because it is self-evident (e.g. "The business was founded in 2020" when the legal identity record has `yearEstablished: 2020`). Mitigation: the warning is informational — operators can add an evidence reference or accept the warning. With `--strict`, it becomes an error, but `--strict` is opt-in.

- **Performance.** Reading repeatable directories (`claims/*.md`, `evidence-sources/*.md`) adds file I/O. The existing `wikidata.validate` already reads 3 singleton files and scans all dist/ HTML. The additional I/O is proportional to the number of claim and evidence-source entities, which is typically small (10-30 files). Impact is negligible.

- **Agent misinterpretation.** Agents might add `evidenceRefs` to non-factual claims (comparative, benefit) expecting them to be checked. This RFC only checks `claimClass: "factual"` claims. The non-goals section and implementation notes make this explicit. Agents might also create `EvidenceSource` entities with `kind: "verified-record"` expecting them to satisfy notability — they do not. The notability check only accepts `external-web-sources` and `third-party-registry`.

- **Maintenance burden.** Four new pure functions and one I/O helper in an existing validator file. The burden is minimal — the functions follow the same pattern as existing validation functions in `wikidata.ts`.

## Acceptance criteria

- [x] `validateNotabilityEvidence` pure function implemented in `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` — returns warning when `hasQid` is true and no EvidenceSource with `kind: "external-web-sources"` or `"third-party-registry"` exists (evidence: wikidata.ts:215-233, test validateNotabilityEvidence RFC-0535)
- [x] `validateClaimEvidenceCoverage` pure function implemented — returns warnings for each `claimClass: "factual"` Claim with empty or missing `evidenceRefs`; skips non-factual claims (evidence: wikidata.ts:235-258, test validateClaimEvidenceCoverage RFC-0535)
- [x] `validateEvidenceReferences` pure function implemented — returns errors for each `Claim.evidenceRefs` entry that does not resolve to an existing EvidenceSource entity ID (evidence: wikidata.ts:260-284, test validateEvidenceReferences RFC-0535)
- [x] `validateEvidenceSourceUrls` pure function implemented — returns errors for each EvidenceSource with no `items` or items lacking `url` (evidence: wikidata.ts:286-309, test validateEvidenceSourceUrls RFC-0535)
- [x] `readPbpRepeatables` I/O helper implemented — reads all `.md` files from a directory, parses frontmatter, returns record keyed by filename (evidence: wikidata.ts:342-364)
- [x] `runWikidataValidate` extended: reads claims and evidence-sources directories, runs four new rules only when Business has Wikidata QID (evidence: wikidata.ts:493-523, QID gate at line 494)
- [x] Command table entry in `05-seo-audit.ts` updated: `description` references `(RFC-0531, RFC-0535)`, `reads` array includes `<app>/src/content/business-profile/{lang}/claims/*.md` and `<app>/src/content/business-profile/{lang}/evidence-sources/*.md` (evidence: 05-seo-audit.ts:195-211)
- [x] `escalateMissingQidWarnings` renamed to `escalateStrictWarnings` and extended to escalate `wikidata.no-notability-evidence` and `wikidata.claim-without-evidence` in addition to `*-missing-qid` rules when `--strict` is set (evidence: wikidata.ts:311-321, STRICT_ESCALATION_RULES at line 67-73)
- [x] Unit tests for all four new pure functions pass in `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` (evidence: 548 tests passed, 0 failed)
- [x] Existing wikidata.validate tests pass unchanged — new rules are additive and do not modify existing behavior (evidence: all 94 test files passed, 548 tests total)
- [x] `pnpm --filter @gogol/site-kernel-checks run build:check` passes (evidence: tsc --noEmit exit 0)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate RFC-0535 --json status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0531 being implemented (it is). The existing `wikidata.validate` command and its pure functions must be in place before extending.
- Agents MUST NOT check non-factual claims (`comparative`, `benefit`, `risk`, `limitation`) for evidence coverage — only `claimClass: "factual"` claims are Wikidata-relevant.
- Agents MUST NOT accept `EvidenceSource.kind: "verified-record"` as notability evidence — only `"external-web-sources"` and `"third-party-registry"` qualify as independent sources for Wikidata notability.
- Agents MUST NOT add `wikidata.validate` to `build.check` or `sites-check` pipelines — it remains standalone, matching RFC-0531.
- The `readPbpRepeatables` helper must follow the same file-system-only pattern as `readPbpEntity` — use `readFile` + `parseMarkdownFrontmatter`, not Astro content collections or PBP loaders. The validator is a static tool, not an Astro module.
- The four new rules fire only when `hasWikidataQid(extractExternalIds(businessData))` returns true. This gate check must be performed before running any of the new rules.
- `wikidata.evidence-broken-ref` and `wikidata.evidence-missing-url` are always errors — they must NOT be escalated by `--strict` (they are already errors). Only `wikidata.no-notability-evidence` and `wikidata.claim-without-evidence` are warnings that `--strict` escalates.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
