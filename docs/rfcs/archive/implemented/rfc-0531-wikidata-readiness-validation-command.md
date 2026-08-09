---
id: RFC-0531
title: Wikidata readiness validation command
status: implemented
kind: command
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- DNA-16
- RFC-0163
- RFC-0530
satisfies:
- DNA-16
versionBump: patch
commands:
  proposed: []
  added:
  - wikidata.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- '@gogol/site-kernel-checks'
successSignals:
- wikidata.validate command registered in site-kernel-checks command table
- Command detects missing Wikidata QID on Business entity and reports warning (or error with --strict)
- Command validates that externalIdentifiers schemeRef+value produces valid HTTPS URLs
- Command cross-checks rendered JSON-LD Organization sameAs against PBP content
- Command validates LegalIdentity has legalName required for Wikidata item creation
nonGoals:
- No Wikidata API calls — this is a static validation command, not a sync
- No automatic addition of Wikidata QIDs to content — operators add them manually
- No integration into build.check pipeline — standalone command, run on-demand
- No Person entity validation — Person sameAs is handled separately

---

# RFC-0531: Wikidata readiness validation command

## Context

RFC-0530 adds `externalIdentifiers` to Business, Brand, and LegalIdentity entities and projects them to JSON-LD `sameAs`. Once implemented, operators need a way to verify that their PBP content is ready for Wikidata integration — that Wikidata QIDs are present, properly formatted, and correctly projected to JSON-LD.

The existing `jsonld.parity` command (`packages/os/site-kernel-checks/src/audit/validators/jsonld.ts:123`) validates that declared socials/logos appear in rendered JSON-LD, but it does not check for Wikidata-specific identifiers or validate URL construction from `schemeRef + value`.

## Problem

After RFC-0530, there is no automated check to verify:

1. **Wikidata QID presence.** Whether Business, Brand, or LegalIdentity entities carry a Wikidata `externalIdentifier` (schemeRef containing `wikidata.org`).
2. **URL validity.** Whether `schemeRef + value` concatenation produces a valid HTTPS URL. A malformed `schemeRef` (e.g. `wikidata` instead of `https://www.wikidata.org/wiki/`) produces a broken `sameAs` entry.
3. **Projection parity.** Whether `externalIdentifiers` declared in PBP content actually appear in the rendered JSON-LD Organization `sameAs` array.
4. **LegalIdentity readiness.** Whether LegalIdentity has `legalName` — a required field for creating a Wikidata item for an organization.

Without a validation command, these checks rely on manual operator discipline.

## Decision

The kernel gains a `wikidata.validate` command (scope: `app`, registered in `site-kernel-checks` command table `05-seo-audit.ts`) that validates PBP content and rendered JSON-LD for Wikidata integration readiness. The command supports a `--strict` flag: without it, missing Wikidata QIDs are warnings; with it, they are errors. Malformed URLs and broken projection are always errors.

## Architectural fit

- **DNA-16 (Semantic layer shares topology):** This command enforces that the semantic output (JSON-LD `sameAs`) is correctly derived from the PBP entity graph — the same source that drives all other semantic outputs.
- **RFC-0163 (Organization identity nodes):** This command extends the `jsonld.parity` pattern to Wikidata-specific identifiers, ensuring `sameAs` links are present and valid for entity disambiguation.
- **RFC-0530 (External identifiers):** This command is the validation counterpart to RFC-0530's schema and projection changes. RFC-0530 adds the fields; this RFC verifies they are correctly used.
- **Site OS operator model:** The command follows the existing `CheckCommandEntry` pattern in `site-kernel-checks/src/command-tables/05-seo-audit.ts`. It is registered via `ALL_COMMANDS` and automatically picked up by `createStandardCheckModule`. It is standalone (not in `build.check` pipeline) — operators run it on-demand when preparing for Wikidata integration.
- **Scaling Playbook:** The command is app-scoped and `supportsAllSites: true` — it works uniformly across all sites that use PBP content.

## Design

### CLI surface

```sh
# Check a single site (warnings for missing QIDs)
pnpm exec werkstatt run wikidata.validate --app warpgogol-com

# Strict mode (errors for missing QIDs)
pnpm exec werkstatt run wikidata.validate --app warpgogol-com --strict

# JSON output
pnpm exec werkstatt run wikidata.validate --app warpgogol-com --json

# All sites
pnpm exec werkstatt run wikidata.validate --all --strict --json
```

Flags:

- `--app <id>` — target site (required, or `--all`)
- `--strict` — treat missing Wikidata QIDs as errors instead of warnings
- `--json` — machine-readable output
- Scope: `app`, `supportsAllSites: true`

### TypeScript contracts

```ts
// Command table entry (added to SEO_AUDIT_COMMANDS in 05-seo-audit.ts)
{
  name: "wikidata.validate",
  description: "Validate PBP content and rendered JSON-LD for Wikidata integration readiness (RFC-0531).",
  scope: "app",
  supportsAllSites: true,
  flags: {
    strict: {
      kind: "boolean",
      description: "Treat missing Wikidata QIDs as errors instead of warnings.",
    },
  },
  reads: [
    "<app>/src/content/business-profile/**/*.md",
    "<app>/src/content/system.md",
    "<app>/dist/client/**/*.html",
  ],
  execute: runWikidataValidate,
}

// Validator function signature
async function runWikidataValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult>

// Validation rules (rule IDs)
type WikidataValidationRule =
  | "wikidata.business-missing-qid"        // Business has no wikidata.org externalIdentifier
  | "wikidata.brand-missing-qid"           // Brand has no wikidata.org externalIdentifier
  | "wikidata.legalidentity-missing-qid"   // LegalIdentity has no wikidata.org externalIdentifier
  | "wikidata.malformed-url"               // schemeRef+value does not produce valid HTTPS URL
  | "wikidata.projection-parity"           // PBP externalIdentifiers not reflected in rendered JSON-LD sameAs
  | "wikidata.legalidentity-missing-legalname" // LegalIdentity lacks legalName (required for Wikidata item)
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts` | Add `wikidata.validate` entry to `SEO_AUDIT_COMMANDS` array |
| `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` | New file: `runWikidataValidate` implementation |
| `packages/os/site-kernel-checks/src/audit-validators.ts` | Re-export `runWikidataValidate` |
| `packages/os/site-kernel-checks/AGENTS.md` | Add `wikidata.ts` module entry to the "What lives here" table |
| `<app>/src/content/business-profile/**/*.md` | Read: PBP entity content (Business, Brand, LegalIdentity, WebPresence) |
| `<app>/src/content/system.md` | Read: system manifest for `defaultLanguageFromManifest` via `loadAuditAppContext` |
| `<app>/dist/client/**/*.html` | Read: rendered JSON-LD for projection parity check |

### Output format

```json
{
  "command": "wikidata.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "findings": [
    {
      "ruleId": "wikidata.business-missing-qid",
      "severity": "warning",
      "file": "src/content/business-profile/de/business.md",
      "message": "Business entity has no externalIdentifier with a wikidata.org scheme. Wikidata QID is required for entity translation.",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/business.md" }]
    },
    {
      "ruleId": "wikidata.malformed-url",
      "severity": "error",
      "file": "src/content/business-profile/de/organization/legal-identity.md",
      "message": "externalIdentifier schemeRef 'wikidata' + value 'Q123456' produces non-HTTPS URL 'wikidataQ123456'. schemeRef must be a full HTTPS URL prefix (e.g. https://www.wikidata.org/wiki/).",
      "evidence": [{ "kind": "config", "file": "src/content/business-profile/de/organization/legal-identity.md" }]
    }
  ],
  "runtimeMs": 42
}
```

`status` is `"fail"` when any finding has severity `"error"`, or when `--strict` is set and any finding has severity `"warning"`. Otherwise `"ok"`. This matches the `auditStatusSchema` (`z.enum(["ok", "warn", "fail", "pending"])`) and the `buildAuditResult` helper which returns `"ok"` when there are zero errors and zero warnings.

### Failure modes

- **Missing Wikidata QID (without `--strict`):** Warning. Command exits 0. Informs operator that the entity is not ready for Wikidata translation.
- **Missing Wikidata QID (with `--strict`):** Error. Command exits 1. Operator must add `externalIdentifiers` with a `wikidata.org` scheme.
- **Malformed URL:** Always error. Command exits 1 regardless of `--strict`. The `schemeRef + value` concatenation must produce a valid HTTPS URL.
- **Projection parity failure:** Always error. Command exits 1. PBP `externalIdentifiers` exist but rendered JSON-LD `sameAs` does not contain them — projection is broken.
- **No dist/ HTML (app not built):** Command skips JSON-LD parity check, reports only content-level findings. Exits 0 if content is clean. This mirrors `jsonld.parity` behavior.
- **No PBP content:** Command skips all checks, exits 0 with `"status": "ok"` and zero findings.

## Rollout

1. **Standalone command.** `wikidata.validate` is not added to `build.check` or `sites-check` pipelines initially. Operators run it on-demand when preparing for Wikidata integration. A future RFC may add it to `sites-check.postbuild` once Wikidata integration is live.
2. **Default: warnings.** Without `--strict`, missing Wikidata QIDs are warnings. This allows operators to run the command during preparation without blocking their build.
3. **Strict mode.** `--strict` escalates missing QIDs to errors. Operators use this when they are ready to commit to Wikidata integration and need to enforce QID presence.
4. **No migration.** The command reads existing PBP content and rendered HTML — no content changes required. It works immediately after RFC-0530 is implemented.
5. **New sites.** New sites created via `onboarding.scaffold` can run `wikidata.validate` as soon as they have PBP content and a build output.

## Alternatives considered

- **Extend `jsonld.parity` instead of creating a new command.** Rejected — `jsonld.parity` checks that declared socials/logos appear in JSON-LD. Wikidata validation has different concerns: QID presence, URL construction from `schemeRef + value`, LegalIdentity readiness. Mixing them would overload `jsonld.parity` and make rule IDs ambiguous.

- **Add to `build.check` pipeline immediately.** Rejected — Wikidata integration is not yet active. Adding to `build.check` would produce warnings (or errors in strict mode) on every build for all sites, including those not preparing for Wikidata. Standalone command gives operators control over when to check.

- **Workspace-scoped command.** Rejected — PBP content is per-site. The command needs to read `<app>/src/content/business-profile/**/*.md` and `<app>/dist/client/**/*.html`, which are app-specific paths. App scope with `supportsAllSites: true` is the correct pattern.

## Risks

- **False positives on URL validation.** The URL check validates that `schemeRef + value` starts with `https://`. Some legitimate identifier schemes might not use HTTPS URLs (e.g. `urn:wikidata:Q123456`). Mitigation: the check is specifically for `sameAs` projection, which requires HTTPS URLs in JSON-LD. Non-URL identifiers should not be in `externalIdentifiers` used for `sameAs`.
- **Dependency on RFC-0530.** This command cannot be implemented until RFC-0530 is accepted and implemented (schemas must have `externalIdentifiers` fields). If RFC-0530 is rejected, this RFC becomes moot.
- **Stale dist/ HTML.** If the app is rebuilt after PBP content changes but before `wikidata.validate` is re-run, the projection parity check may produce false positives. Mitigation: operators should rebuild before running the command, or the command should document that it checks the current dist/ state.
- **Maintenance burden.** Adding a new validator file and command table entry increases the surface area of `site-kernel-checks`. The burden is minimal — one new file, one new entry in `05-seo-audit.ts`.

## Acceptance criteria

- [x] `wikidata.validate` command registered in `SEO_AUDIT_COMMANDS` array in `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts` (evidence: `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts:193-211`, `pnpm --filter @gogol/site-kernel-checks run build:check` pass)
- [x] `runWikidataValidate` function implemented in `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` (evidence: `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts`, build:check pass)
- [x] Command validates Business `externalIdentifiers` for Wikidata QID presence (evidence: `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — `validateQidPresence` tests, 25 tests pass)
- [x] Command validates `schemeRef + value` URL construction produces valid HTTPS URL (evidence: `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — `validateUrlConstruction` tests with malformed schemeRef)
- [x] Command cross-checks rendered JSON-LD Organization `sameAs` against PBP `externalIdentifiers` (evidence: `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — `validateProjectionParity` tests)
- [x] Command validates LegalIdentity has `legalName` (evidence: `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — `validateLegalIdentityLegalName` tests)
- [x] `--strict` flag escalates missing QID warnings to errors (evidence: `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` — `escalateMissingQidWarnings` function, `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — `validateQidPresence` severity tests)
- [x] `--json` output follows `AuditFinding` shape with `ruleId`, `severity`, `file`, `message`, `evidence` (evidence: `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` — uses `finding()` helper from `helpers.ts` which produces `AuditFinding` shape, `buildAuditResult` returns `auditResultSchema`-validated output)
- [x] Command exits 0 when no findings, exits 1 when any error finding (evidence: `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts:265-268` — `exitCode: result.status === "fail" ? 1 : 0`, `buildAuditResult` sets `status: "fail"` when `summary.error > 0`)
- [x] `rfc.validate` passes on this RFC file (evidence: `pnpm exec werkstatt run rfc.validate RFC-0531 --json` exitCode 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0530 being accepted and implemented first. Agents MUST NOT implement `wikidata.validate` until RFC-0530's schema changes are in place.
- The command implementation should follow the pattern of `runJsonLdParityValidate` in `packages/os/site-kernel-checks/src/audit/validators/jsonld.ts` — use `loadAuditAppContext`, `collectRenderedHtml`, `extractJsonLdGraph`, `buildAuditResult`, and `finding` helpers.
- The `--strict` flag only affects `wikidata.*-missing-qid` rules. Malformed URL and projection parity rules are always errors.
- The `--strict` flag escalates `*-missing-qid` finding severity from `"warning"` to `"error"` before calling `buildAuditResult`. This ensures `status` naturally becomes `"fail"` via the existing `summary.error > 0` check in `buildAuditResult` — no separate exit-code logic is needed.
- Agents MUST NOT add `wikidata.validate` to `build.check` or `sites-check` pipelines — it is standalone. A future RFC may integrate it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
