---
rfcId: RFC-0651
auditId: AUDIT-RFC-0651-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0651

## Verdict: Needs revision

Two factual errors in the file system responsibilities and dependency claims, plus a design gap in the Iceberg REST catalog path. The core architecture (two standalone commands, S3-compatible client, non-fatal Iceberg writes) is sound, but the RFC references a non-existent file path and overstates an existing dependency.

## Mechanical validation (rfc.validate)

Pass with one warning:
- **V-18** (warning): `related "DNA-59" is not defined in docs/architecture-dna.md`. DNA-59 is established by RFC-0650 (still draft) and has not yet been appended to the invariants file. The warning will persist until RFC-0650 is accepted.

## Axis A — Structural completeness

**A1 — Wrong file path for command contracts.** The file system responsibilities table lists `packages/os/site-kernel-handoff/src/command-tables/infra-contracts.ts`, but the `command-tables/` directory does not exist in `packages/os/site-kernel-handoff/src/`. The actual `infra-contracts.ts` file lives at `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`. The evidence command contracts should be documented in the existing `site-kernel-checks` infra-contracts file, consistent with where all other command contracts (mission.check, axiom.report, etc.) are registered.

## Axis B — DNA alignment

**B1 — Forward reference to unestablished DNA-59.** `related: [DNA-59]` references an invariant not yet defined in `docs/architecture-dna.md`. DNA-59 is established by RFC-0650 (still draft). The V-18 warning will persist until RFC-0650 is accepted and the DNA-59 entry is appended. The RFC body correctly states "DNA-59 (Evidence preservation): Established by RFC-0650" — this is an accurate forward reference, but the `related[]` entry generates a validation warning. Consider removing DNA-59 from `related[]` until RFC-0650 is accepted, or accept the warning as expected.

## Axis C — Ecosystem fit

**C1 — Same as A1.** The `command-tables/infra-contracts.ts` path is in `site-kernel-checks`, not `site-kernel-handoff`. All other command contracts in the ecosystem are centralized in `packages/os/site-kernel-checks/src/command-tables/`. Creating a new `command-tables/` directory in `site-kernel-handoff` would break this pattern.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no deprecation.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224 and RFC-0334. Agent misinterpretation risk is addressed: "Agents MUST NOT invoke `evidence.sync` automatically after `mission.check`".

## Axis F — Pragmatism

**F1 — Incorrect claim about existing `@aws-sdk/client-s3` dependency.** The RFC states (line 120): "The workshop already uses S3-compatible APIs for Cloudflare R2 in the `lagebild-sync-worker` service" and (line 306): "`@aws-sdk/client-s3` which is already a dependency in the monorepo." However, no workspace package declares `@aws-sdk/client-s3` in its `package.json`, and no source file in `services/lagebild-sync-worker/` imports it. The package exists only as a transitive dependency of `wrangler` and `miniflare` in `node_modules/.pnpm/`. Adding it as a direct dependency to `packages/os/site-kernel-handoff` requires a new `pnpm add @aws-sdk/client-s3` — the RFC should state this accurately rather than claiming it is already present.

## Axis G — Blind spots

**G1 — Iceberg REST catalog API design gap.** The Design section defines `IcebergCatalogConfig` with `catalogUri` and `warehouse` fields but does not specify the exact REST endpoints, auth flow, or table creation sequence. The Risks section acknowledges "no official Node.js Iceberg client library" and the implementation notes provide an escape hatch: "If the Iceberg REST catalog API proves too complex to implement, agents MAY implement the `ListObjectsV2` fallback as the primary listing mechanism." This is a significant scope risk — the RFC should either (a) commit to the Iceberg path with more technical detail (endpoints, auth, table DDL), or (b) make `ListObjectsV2` the primary listing mechanism for the initial implementation and add Iceberg support as a future enhancement. The current "try Iceberg, fall back to ListObjectsV2" approach leaves the implementation contract ambiguous.

## Questions for the author

1. The `command-tables/infra-contracts.ts` path is wrong — it's in `site-kernel-checks`, not `site-kernel-handoff`. Should the evidence command contracts be added to the existing `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`, consistent with all other command contracts?
2. `@aws-sdk/client-s3` is not a direct dependency in any workspace package — it's only transitive via `wrangler`/`miniflare`. Should the RFC acknowledge that a new direct dependency must be added to `packages/os/site-kernel-handoff/package.json`, or is there an existing S3 client pattern in the monorepo that should be reused?
3. The Iceberg REST catalog API has no Node.js client library and the implementation may fall back to `ListObjectsV2`. Should the RFC commit to one path (Iceberg or ListObjectsV2) for the initial implementation, or is the fallback explicitly acceptable as the primary mechanism?
