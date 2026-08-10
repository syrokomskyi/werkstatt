---
rfcId: RFC-0786
auditId: AUDIT-RFC-0786-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0786

## Verdict: Needs revision

The RFC has a solid architectural foundation (extends RFC-0753, reuses RFC-0286 manifest) but references a reclassified non-binding DNA invariant (DNA-34), includes a `ttl` field absent from the existing `dnsRecordDeclarationSchema`, and has a frontmatter `scope` that contradicts the body. Multiple structural gaps remain before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0786` exits 0, zero violations.

## Axis A — Structural completeness

- **`--json` output shape missing.** The RFC shows the YAML fragment and `dig` output but does not document the `--json` result shape for `agent.dns-aid.generate` or `agent.dns-aid.validate`. Other agent surface commands (e.g. `agent.manifest.generate`, `agent.api-catalog.validate`) document their JSON envelope. Axis A requires this.
- **Diagnostic rule IDs not specified.** `agent.dns-aid.validate` reports mismatches and missing records but does not assign rule IDs. The agent surface convention uses prefixed rule IDs (`AGS-*`, `AGK-*`, `AGC-*`, `AGO-*`, `AGM-*`). The RFC should declare a prefix (e.g. `AGD-*`) and enumerate rules.
- **Exit code behavior inconsistent with RFC-0753.** The RFC says `agent.dns-aid.validate` exits 1 on mismatch or missing record. But `dns.record.validate` (RFC-0753) exits 0 with `state: drifted` or `missing-records` — advisory, not blocking. The RFC should clarify whether `agent.dns-aid.validate` is blocking (exit 1) or advisory (exit 0 with diagnostics), and justify the choice if it differs from the underlying `dns.record.validate`.
- **`updatedAt` field not addressed.** The `dnsRecordFileSchema` (`packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts:35`) requires an `updatedAt` field. When the generator writes the DNS-AID record to `dns-records.yaml`, it must also update `updatedAt`. The RFC does not mention this.

## Axis B — DNA alignment

- **DNA-34 is NOT BINDING.** `docs/architecture-dna.md:119-121` explicitly states: "⚠ AGENTS: Do not reference DNA-27..34 as active invariants. They were reclassified from binding architectural invariants to product features by RFC-0161." DNA-34 is listed in both `satisfies[]` and `related[]`. The RFC must remove DNA-34 from `satisfies[]` (it cannot satisfy a non-binding invariant) and from `related[]`. The `.well-known/` discovery concept is a product feature governed by RFC-0028, not a binding DNA invariant.
- **No replacement invariant.** If the RFC wants to claim architectural invariant satisfaction, it should reference a binding DNA invariant (e.g. DNA-58 for determinism, which the acceptance criteria already mention). Otherwise `satisfies[]` should be empty.

## Axis C — Ecosystem fit

- **Frontmatter `scope` contradicts body.** The frontmatter declares `scope: workspace` (line 8), but the body says `scope: app` (line 120) and the CLI uses `--site <app>`. The frontmatter must be `scope: app` to match the actual command scope.
- **Package paths correct but `packagesImpacted` may be incomplete.** The RFC lists only `packages/werkstatt-site`. The DNS record schema (`dnsRecordDeclarationSchema`) lives in `packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts` — correct. However, if the `ttl` field is added to the schema (see Axis F), the schema change impacts `packages/werkstatt` which imports and validates against the schema in `packages/werkstatt/src/dns/dns-records-schema-validate.ts`. Consider whether `packages/werkstatt` should be listed.
- **Command lifecycle buckets.** `commands.proposed` lists `agent.dns-aid.generate` and `agent.dns-aid.validate`. These will move to `commands.added` upon implementation — internally consistent.
- **RFC-0787 dependency not noted.** RFC-0787 ("Wire agent readiness generators into build.prepare and build.check pipelines") explicitly depends on RFC-0786. The RFC does not list RFC-0787 in `related[]`. Adding it would help traceability.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — two new commands, no backward compatibility layers, no dual-paths.

## Axis E — Agent-facing policy

- **Status gate.** The RFC is `status: draft` and does not contain self-authorizing language. Correct.
- **Implementation notes.** Reference the correct governance rules (RFC-0224, RFC-0330, RFC-0334). Correct.
- **NEEDS CLARIFICATION markers.** No unresolved markers found.
- **Storage policy.** No cookies or client-side persistence introduced. Correct.

## Axis F — Pragmatism

- **`ttl` field not in existing schema.** The `DnsAidRecord` interface (line 129-135) includes `ttl: number` (3600). The `dnsRecordDeclarationSchema` (`packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts:22-29`) has fields: `name`, `type`, `content`, `priority?`, `proxied?`, `comment?`. No `ttl`. Zod's default behavior strips unknown keys — so `ttl` would be silently dropped during `dns.records.schema.validate`, meaning the TTL would never reach Cloudflare. The RFC must either: (a) extend `dnsRecordDeclarationSchema` to include `ttl?: number`, or (b) remove `ttl` from `DnsAidRecord` and the YAML output.
- **Two commands justified.** `generate` (declaration) and `validate` (check) follow the existing `*.generate` / `*.validate` pattern. No command that could be a flag on an existing command. Pragmatic.
- **Marked section approach has a technical gap.** The RFC uses `# BEGIN dns-aid` / `# END dns-aid` comment markers to update only a section of `dns-records.yaml`. But YAML parsing strips comments — the generator cannot parse the YAML, modify records, and re-serialize while preserving the markers and manual edits to other sections. The generator must do text-level manipulation (regex or line-based) to find and replace the marked section. The RFC should acknowledge this implementation approach and its limitations (e.g. what if markers are missing? what if the file has no markers yet?).

## Axis G — Blind spots

- **Concurrent execution.** Two `build.prepare` runs for different apps writing to the same `dns-records.yaml` (if apps share a zone) could conflict. The RFC does not address this. Mitigation: `dns-records.yaml` is per-system (`systems/<id>/`), and each system maps to one zone, so concurrent writes to the same file are unlikely. Still worth noting.
- **Empty state.** A new app with no `dns-records.yaml` yet — the generator should create the file with the DNS-AID record and the required `kind`/`schemaVersion`/`zone`/`updatedAt` header. The RFC does not address this case.
- **Idempotency claim references DNA-58.** Acceptance criterion says "Generator is idempotent — regenerating produces byte-identical output (DNA-58)". DNA-58 is a valid binding invariant for determinism. Good — but the RFC should list DNA-58 in `satisfies[]` if it claims to satisfy it.

## Questions for the author

1. DNA-34 is reclassified as non-binding by RFC-0161. Should `satisfies[]` be empty, or should the RFC reference DNA-58 (determinism) instead, given the idempotency acceptance criterion?
2. The `ttl` field in `DnsAidRecord` is not in `dnsRecordDeclarationSchema`. Should the schema be extended to include `ttl`, or should `ttl` be removed from the DNS-AID record declaration?
3. The frontmatter says `scope: workspace` but the body and CLI say `scope: app`. Which is correct? (The body appears correct given `--site <app>`.)
4. How does the generator handle the marked section in `dns-records.yaml` — text-level manipulation or YAML parse + re-serialize? If the latter, how are comments and manual edits preserved?
