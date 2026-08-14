---
id: RFC-0852
title: "Move canonical Diagnostic ownership into the engine"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0203
amendedBy: []
related:
  - RFC-0247
  - RFC-0776
  - RFC-0848
  - RFC-0849
  - RFC-0853
dependsOn:
  - RFC-0849
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-64
versionBump: major
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "The engine schema layer is the only runtime and TypeScript owner of Diagnostic, DiagnosticEvidence, and DiagnosticSeverity."
  - "Every persisted Diagnostic is bounded, canonical-json-compatible, identity-safe, and free of legacy alias fields."
  - "The site plugin consumes the engine schema while retaining only site-specific audit result/cache contracts."
  - "All legacy Diagnostic aliases and id/blockId/suggestion fields are removed atomically without a compatibility surface."
nonGoals:
  - "This RFC does not define canonical JSON bytes or limits; RFC-0849 owns them."
  - "This RFC does not define EvidenceEnvelopeV1, certification identities, producer redaction policy, or dossier admission; RFC-0853 and later CERT nodes own those concerns."
  - "This RFC does not change command status vocabularies, rewrite every diagnostic message, add a suppression system, or certify any release."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/schemas/diagnostic.ts"
  - probe: file-contains
    path: "packages/werkstatt-site/src/checks/audit/types.ts"
    pattern: "@warpgogol/werkstatt/schemas"
---

# RFC-0852: Move canonical Diagnostic ownership into the engine

## Context

RFC-0203 established one canonical `Diagnostic` vocabulary but left its TypeScript interface in `packages/werkstatt/src/kernel/types.ts` and its strict Zod realization in the site plugin. The site schema still carries migration aliases and deprecated `id`, `blockId`, and `suggestion` fields. `data?: Record<string, unknown>` also accepts values that cannot be canonicalized or safely persisted.

The first RFC-0849 enhancement attempted to fix this together with permanent canonical bytes and the complete certification schema inventory. Its audit showed that ownership migration is an independent cross-package blast radius and needs its own implementation session. RFC-0849 now provides the bounded `CanonicalJsonObjectV1` substrate. This RFC performs the atomic forward-only Diagnostic cutover. RFC-0853 then embeds the resulting strict Diagnostic in certification evidence identities.

## Problem

The engine cannot validate certification evidence by importing a stack plugin without reversing DNA-64. Copying the site schema into the engine would create two owners. Keeping the current split leaves the interface and runtime schema free to drift, while arbitrary `data`, unbounded evidence arrays/strings, unsafe locators, and legacy fields can enter persisted evidence and make its identity unhashable or unsafe.

Because `EvidenceEnvelopeV1.evidenceId` includes the complete canonical `Diagnostic[]`, every Diagnostic accepted for persistence must be identity-safe by construction. A schema that accepts secrets, absolute paths, arbitrary objects, or unbounded producer output is not strict enough even if it is `.strict()` at the top level.

## Decision

`packages/werkstatt/src/schemas/diagnostic.ts` becomes the sole runtime and type owner of `DiagnosticSeverity`, `DiagnosticEvidence`, `Diagnostic`, and their strict Zod schemas. Types are inferred from schemas. `kernel/types.ts` imports and re-exports those types only. The site audit module imports the engine schema and owns only site-specific audit result/cache shapes.

The migration is atomic and forward-only: deprecated schema aliases and the fields `id`, `blockId`, and `suggestion` are deleted with every internal use. No deprecated re-export, duplicate schema, adapter, legacy parser, dual-read, field coercion, or successful fallback remains.

## Architectural fit

### DNA-64 — engine/plugin/workshop boundary

Diagnostic is a stack-agnostic engine contract used by kernel commands, certification, services, and stack plugins. The engine owns it and imports no plugin; the active site plugin consumes it through an explicit public engine subpath. Site-specific audit statuses, LLM cache keys, archetypes, and result metadata remain plugin-owned.

### RFC-0203 — canonical diagnostics amended

This RFC preserves RFC-0203's one-vocabulary decision while correcting runtime ownership and closing its migration period. It formally amends RFC-0203: the engine schema, not the site plugin, is canonical; legacy fields and aliases are no longer part of the vocabulary.

### RFC-0849 — canonical data domain

`Diagnostic.data` uses RFC-0849's opaque canonical object type. Diagnostic parsing/snapshot construction occurs before persistence or identity calculation. The Diagnostic module does not define another JSON-like union or invoke a permissive generic hash.

## Design

### CLI surface

This RFC adds or changes no command. Existing commands retain their current user-facing names and result protocols while their shared Diagnostic type source changes. Verification uses:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt build:check
pnpm --filter @warpgogol/werkstatt-site test
pnpm --filter @warpgogol/werkstatt-site build:check
pnpm exec werkstatt run warning.diagnostics.lint --json
pnpm exec werkstatt run werkstatt.autonomy.validate --json
```

### Strict contracts

```ts
const diagnosticSeveritySchema = z.enum(["error", "warning", "info"]);

const diagnosticEvidenceSchema = z.object({
  kind: z.enum(["rule", "rendered", "source", "config", "cache", "runtime"]),
  ruleFile: safeWorkspaceRelativePathSchema.optional(),
  ruleId: diagnosticRuleIdSchema.optional(),
  file: safeWorkspaceRelativePathSchema.optional(),
  url: safeDiagnosticUrlSchema.optional(),
  snippet: redactedDiagnosticTextSchema.max(DIAGNOSTIC_LIMITS.snippetBytes).optional(),
}).strict();

const diagnosticSchema = z.object({
  ruleId: diagnosticRuleIdSchema,
  severity: diagnosticSeveritySchema,
  message: redactedDiagnosticTextSchema,
  file: safeWorkspaceRelativePathSchema.optional(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  fixHint: redactedDiagnosticTextSchema.optional(),
  evidence: z.array(diagnosticEvidenceSchema).max(DIAGNOSTIC_LIMITS.evidenceItems).optional(),
  data: canonicalJsonObjectV1Schema.maxCanonicalBytes(DIAGNOSTIC_LIMITS.dataBytes).optional(),
}).strict();

type Diagnostic = z.infer<typeof diagnosticSchema>;
```

The illustrative `.maxCanonicalBytes` denotes an engine-owned validation/refinement over RFC-0849 snapshots, not a requirement to extend Zod with exactly that method name. `data` must be a runtime-branded `CanonicalJsonObjectV1`, never `Record<string, unknown>` or a duplicated structural JSON union.

### Bounds

| Field/collection | Maximum |
|---|---:|
| `ruleId`, evidence `ruleId` | 128 ASCII characters, pattern `[A-Z0-9][A-Z0-9._-]*` |
| `message` | 4 KiB UTF-8, minimum one non-whitespace character |
| `fixHint` | 8 KiB UTF-8 |
| `file`, `ruleFile` | 1 KiB UTF-8 |
| `url` | 4 KiB UTF-8 |
| `snippet` | 16 KiB UTF-8 |
| Evidence entries per Diagnostic | 32 |
| Canonical `data` bytes | 64 KiB |
| One encoded Diagnostic | 128 KiB |
| Diagnostics in one persisted evidence result | 1,000, additionally bounded by RFC-0849's 8 MiB document limit |

Bounds count UTF-8 bytes, not JavaScript code units. Overflow is a strict `CERT-DIAGNOSTIC-LIMIT-01` failure; values are never truncated. Producers may store large logs/screenshots as digest-addressed payloads later, not embed them in Diagnostic.

### Locator and redaction contract

`file` and `ruleFile` use workspace-relative POSIX paths and reject absolute paths, backslashes, empty/`.`/`..` components, NUL, URI schemes, home expansion, and credentials. URLs must be absolute `http:`/`https:` URLs with no userinfo, control characters, fragments containing sensitive material, or recognized credential-bearing query values. A safe diagnostic URL represents a redacted public locator, never a provider secret or signed download URL.

Diagnostic strings and canonical `data` must be redacted before construction. Deterministic negative fixtures cover tokens, passwords, private keys, authorization headers, connection strings, absolute workspace/home paths, email/telephone/other configured PII patterns, and nested canonical data. The schema-level safety guard blocks known high-confidence exposures. RFC-0853 additionally requires evidence-envelope redaction metadata and rejects unresolved secret/PII counts; later producer/profile policy owns configurable detection breadth. Neither layer may replace a secret with its raw hash.

All remaining Diagnostic fields, including evidence, snippets, URLs, fix hints, and canonical data, participate in certification evidence identity. No identity builder drops a Diagnostic field to avoid redaction or canonicalization.

### Ownership and exports

| Path | Responsibility |
|---|---|
| `packages/werkstatt/src/schemas/diagnostic.ts` | Sole strict schemas, limits, safe locator/text validation, and inferred types |
| `packages/werkstatt/src/schemas/index.ts` | Deliberate public schema exports |
| `packages/werkstatt/src/kernel/types.ts` | Type-only import/re-export; no Diagnostic interface or duplicate literal unions |
| `packages/werkstatt/package.json` | Export Diagnostic schemas through the existing `@warpgogol/werkstatt/schemas` surface |
| `packages/werkstatt-site/src/checks/audit/types.ts` | Import engine schemas; retain only site audit result/cache schemas |
| `packages/werkstatt-site/src/**` | Replace alias/legacy-field consumers in the same cut |
| `packages/werkstatt/src/tests/diagnostic-schema.test.ts` | Core strict/bounds/locator/redaction/canonical-data fixtures |
| `packages/werkstatt-site/src/checks/tests/diagnostic-contract.test.ts` | Cross-package consumption and no-alias regression |

The removed symbols are `auditSeveritySchema`, `auditEvidenceSchema`, `auditFindingSchema`, and any plugin-owned `diagnosticSeveritySchema`, `diagnosticEvidenceSchema`, or `diagnosticSchema`. Site audit result fields may keep the historical name `findings` only if their element schema is the engine `diagnosticSchema`; naming a result collection does not create a second Diagnostic dialect.

### Failure contract

| Rule | Meaning |
|---|---|
| `CERT-DIAGNOSTIC-SCHEMA-01` | unknown field, invalid vocabulary, invalid scalar, or missing required value |
| `CERT-DIAGNOSTIC-LOCATOR-01` | path/URL is unsafe or non-canonical |
| `CERT-DIAGNOSTIC-REDACTION-01` | known unresolved secret/PII/absolute-path exposure |
| `CERT-DIAGNOSTIC-LIMIT-01` | field, collection, data, Diagnostic, or Diagnostic[] bound exceeded |
| RFC-0849 failure code | canonical `data` snapshot is invalid |

Explicit schema `.parse()` may throw Zod errors. Agent-facing or recoverable boundaries use `safeParse` and map issues to the stable rule families above. Mappers preserve structured Zod paths but bound messages and never include rejected values. There is no warning mode or suppression for persisted certification diagnostics. Existing non-certification checks may still emit valid warning/info severity; severity is not a schema-bypass mechanism.

## Rollout

1. Add the engine schema/limits/tests using RFC-0849 canonical object types.
2. Convert `kernel/types.ts` to type-only re-exports and compile the engine.
3. Replace the site audit schema implementation with engine imports; remove all aliases and legacy field consumers repository-wide.
4. Run engine/site tests and build checks, then source searches proving no removed symbol/field definition remains.
5. Update the exact ownership documentation and verification evidence.

Steps 2–3 land in the same canonical commit sequence and no intermediate compatibility export is introduced. Each landed commit must leave both affected packages compiling; the project may remain operationally unavailable only at the deployment surface accepted by the wider transition.

## Alternatives considered

### Keep the runtime schema in the site plugin

Rejected: certification engine code would import a stack plugin or duplicate the schema, violating DNA-64.

### Keep deprecated aliases for gradual migration

Rejected: this repository controls all current consumers and accepts a clean cut. Aliases would make the supposed single owner unverifiable and invite new legacy usage.

### Exclude `data` or snippets from evidence identity

Rejected: diagnostics could then change materially without changing evidence identity. Making every field canonical and redacted closes the contract honestly.

### Allow arbitrary `data` and sanitize during persistence

Rejected: a value can appear valid in memory but fail or change at the authority boundary. Identity-safe construction must precede persistence.

### Put full logs into Diagnostic

Rejected: bounded summaries and digest-addressed payloads keep agent output usable and prevent canonical identity abuse.

## Risks

- **Wide alias removal:** mitigated by repository-wide symbol/field searches and both package builds; do not restore aliases to make compilation pass.
- **False-positive redaction:** high-confidence structural/credential patterns are hard failures; configurable PII detection remains evidence-policy-owned and reports explicit reasons rather than silent deletion.
- **Oversized existing diagnostics:** mitigated by bounded summaries plus payload references; truncation is forbidden because it would alter evidence silently.
- **Schema/type drift:** mitigated by `z.infer` as the only type source and source tests proving kernel/site do not redeclare shapes.
- **Agent removal error:** removal discipline requires history/RFC/cross-reference inspection; the legacy fields are removed because this RFC formally ends their migration, not because a validator complained.
- **Scope creep into evidence contracts:** mitigated by RFC-0853 ownership and no certification payload changes in this session.

## Acceptance criteria

- [ ] `packages/werkstatt/src/schemas/diagnostic.ts` is the only schema/type owner and every Diagnostic type is inferred from its strict schemas.
- [ ] `kernel/types.ts` and the site plugin consume/re-export the engine contract without a duplicate interface, severity union, or schema implementation.
- [ ] `id`, `blockId`, `suggestion`, `auditSeveritySchema`, `auditEvidenceSchema`, and `auditFindingSchema` plus all internal references are absent; no compatibility alias/parser remains.
- [ ] `data` accepts only bounded runtime-branded `CanonicalJsonObjectV1`; arbitrary objects and every RFC-0849-invalid value fail before persistence.
- [ ] Field/collection/total limits, safe path/URL rules, known secret/PII fixtures, and no-truncation behavior pass for positive and negative boundaries.
- [ ] Every retained Diagnostic field participates in RFC-0853 evidence identity; identity sensitivity tests cover message, fixHint, evidence, snippet, URL, and nested data changes.
- [ ] Source-boundary tests prove the engine imports no plugin and the plugin imports the public engine schema surface.
- [ ] `packages/AGENTS.md`, `packages/werkstatt/AGENTS.md`, and `packages/werkstatt-site/AGENTS.md` identify the engine owner and forbid duplicate/legacy aliases.
- [ ] `docs/technology.xml`, `docs/knowledge-graph.xml`, and `docs/source-markup.xml` reflect the owner/source boundary; verification evidence records explicit no-change rationales for other root Compass files.
- [ ] Both package tests/build checks, `warning.diagnostics.lint`, and `werkstatt.autonomy.validate` pass.
- [ ] `rfc.acceptance.run --id RFC-0852`, `rfc.verification.emit --id RFC-0852`, and `rfc.validate --id RFC-0852 --json` pass before implementation stamping.

## Implementation notes for agents

- Implement only after RFC-0849 is `implemented` and this RFC is `accepted`; draft text grants no code authority.
- Complete only the Diagnostic ownership cutover in this session. Do not define certification envelopes/identities, add commands, persist evidence, or start RFC-0853.
- Follow removal discipline before deleting each legacy symbol, then remove its complete repository-owned consumer set. Never keep a deprecated alias, dual schema, coercion, `as any`, `.passthrough()`, or unknown-field stripping.
- Use the engine schema as the type source. Do not hand-write a parallel interface in kernel or plugin code.
- Do not silently truncate or redact. Reject unsafe persisted values with bounded structured failures; large raw material belongs in later payload storage.
- Run repository-wide searches for removed symbols and fields, then inspect `git diff` for every touched consumer before committing.
- Update the three nested AGENTS files and relevant Compass owners listed above; record no-change rationales rather than editing unrelated Compass prose speculatively.
- If the vendored spec is inconsistent, create an amendment; for invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0852 --reason "..." --invariant "DNA-N"`.
- Follow RFC-0230 for package/agent-facing surfaces, RFC-0330 for verification evidence, RFC-0334 for invariant conflict escalation, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0852`, then `rfc.implement.stamp --id RFC-0852 --dry-run` and commit through the canonical flow.
