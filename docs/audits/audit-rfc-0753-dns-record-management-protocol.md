---
rfcId: RFC-0753
auditId: AUDIT-RFC-0753-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0753

## Verdict: Needs revision

The RFC has a solid conceptual foundation and clear CLI surface, but has structural gaps (missing failure modes, missing result interfaces for two commands), a tenuous DNA-40 satisfaction claim, an unclear pipeline integration point, and several blind spots around TXT content normalization, dry-run mode, and the shared API client dependency on RFC-0752.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0753` reports 0 violations.

## Axis A — Structural completeness

1. **Missing "File system responsibilities" table.** RFC-0751 and RFC-0752 both include a dedicated table naming concrete paths and their roles. RFC-0753 mentions paths inline (`systems/<system-id>/dns-records.yaml`, `packages/os/site-kernel-handoff/src/dns/`, `packages/ontology/src/schemas/dns-records.ts`) but lacks the consolidated table. Adding it would make the file surface scannable.

2. **Missing "Failure modes" section.** RFC-0751 and RFC-0752 have explicit failure mode sections with exit codes and error behavior. RFC-0753 has none. What happens when: `CLOUDFLARE_API_TOKEN` is missing? `cloudflareZoneId` is absent from the registry? The declaration file doesn't exist? The API call fails? The RFC should specify exit codes and warn-vs-fail behavior for each command.

3. **Missing result interfaces for `dns.record.list` and `dns.record.delete`.** `DnsRecordUpsertResult` and `DnsRecordValidateResult` are defined, but the `--json` output shape for `list` and `delete` is undocumented. RFC-0751 and RFC-0752 provide result interfaces for every command.

4. **Dry-run mode referenced but not specified.** The Risks section says "dns.record.validate before dns.record.upsert (dry-run mode)", implying `dns.record.upsert` supports `--dry-run`. This flag is not in the CLI surface, TypeScript contracts, or design sections. Either document it or remove the reference.

## Axis B — DNA alignment

1. **Tenuous DNA-40 satisfaction.** DNA-40 is specifically about `.env.example` files, deploy scripts, and `deploy.preflight`. The RFC says it "extends the deployment contract with DNS record declarations as version-controlled artifacts." DNS records are not part of the env-example or deploy-script contract — they're a separate operational concern. The `satisfies: [DNA-40]` claim is weak. Consider whether this RFC truly satisfies DNA-40 or whether it should reference a different invariant (or establish a new one).

## Axis C — Ecosystem fit

1. **Pipeline integration point is unclear.** The RFC says `dns.record.validate` is "integrated into `sites-check.run` as a warning-level check." But `sites-check.run` (`SITES_CHECK_PIPELINE`) is composed of `SITES_CHECK_AUTHOR_PIPELINE` + `SITES_CHECK_POSTBUILD_PIPELINE`, both of which run **per app**. DNS records are **per zone** (workspace-level), not per-app. Adding a workspace-level DNS check to a per-app pipeline is architecturally wrong — it would run N times (once per app) for a single zone. The check should either be workspace-scoped (in `PACKAGES_CHECK_PIPELINE` or a new workspace pipeline) or the RFC should clarify how a per-app pipeline handles zone-level declarations.

2. **Shared API client dependency on RFC-0752 is contradictory.** The RFC says "The Cloudflare API client is shared with RFC-0752" but also says "This RFC is independent of RFC-0751 and RFC-0752. It can be implemented in any order." If the API client lives in RFC-0752's `packages/os/site-kernel-handoff/src/leitstand/adapters/` directory, RFC-0753 has a build-time dependency on RFC-0752. The RFC should either: (a) declare that the shared client is extracted to a neutral location (e.g. `src/cloudflare/`), or (b) acknowledge the implementation ordering constraint.

3. **Missing AGENTS.md update identification.** The RFC doesn't identify which `AGENTS.md` files need updates. At minimum, `packages/os/site-kernel-handoff/AGENTS.md` should document the new DNS command family, and the root `AGENTS.md` may need a protocol reference.

4. **Missing Compass sync identification.** The RFC doesn't identify which `docs/*.xml` files need synchronization. If DNS record declarations become a workspace-wide contract, `docs/requirements.xml` or `docs/verification-plan.xml` may need updates.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy maintenance.

## Axis E — Agent-facing policy

1. **Contradictory email record validation logic.** Section "Email deliverability record set" says: "`dns.record.validate` reports missing email records as warnings (not errors) unless the zone declares them — in which case missing = error." But the declaration file IS the zone's declaration — every record in `dns-records.yaml` is declared. The statement seems to imply that email records (MX, SPF, DKIM, DMARC) are special-cased with a "should-exist" check independent of the declaration file, but the logic is self-contradictory. The RFC should clarify: does `dns.record.validate` only check records in the declaration file, or does it also check for a canonical email record set regardless of declaration?

2. **Missing supersede escalation reference.** Implementation notes reference RFC-0224 for the accepted→implemented transition but don't reference the supersede escalation policy for invariant conflicts. RFC-0751 and RFC-0752 have the same gap, so this may be a convention, but it's worth noting.

## Axis F — Pragmatism

1. **Missing `dns.record.export` (Cloudflare → YAML).** The rollout says "Existing records: `dns.record.validate` can verify existing Cloudflare records against a new declaration file." But operators must write the declaration file manually and hope it matches. A `dns.record.export` command that reads live Cloudflare records and generates a `dns-records.yaml` skeleton would drastically reduce onboarding friction and transcription errors. The RFC should either add this command or explain why it's deferred.

2. **`dns.record.delete` scope.** The command takes `--name` and `--type` but doesn't handle multi-value types (MX, TXT) where multiple records share `(name, type)`. For MX records, `--name warpgogol.com --type MX` would match 3 records. Does it delete all of them? The RFC should specify behavior for multi-value deletions (e.g. require `--content` for multi-value types, or delete all matching).

## Axis G — Blind spots

1. **TXT content normalization.** `dns.record.validate` compares content strings for equality. Cloudflare may normalize TXT record values (whitespace trimming, long-record splitting, quoting). A TXT record that's semantically identical but formatted differently would be reported as "mismatched." The RFC should account for normalization — either normalize before comparison or document the known normalization cases.

2. **Pagination missing in upsert design.** `dns.record.upsert` step 3 says "List existing DNS records — `GET /zones/{zone_id}/dns_records` — cache for comparison." The Cloudflare API paginates this endpoint (50 records per page by default). A zone with 100+ records requires multiple API calls. The design doesn't mention pagination for the upsert path (only for `dns.record.list`).

3. **Error handling during upsert is unspecified.** The result interface has an `errors[]` array, implying the command continues on per-record errors. But the design section doesn't confirm this. Does `dns.record.upsert` abort on first error or continue? What about partial failures (3 created, 1 error, 2 unchanged)?

4. **API retry strategy unspecified.** RFC-0752 specifies "Retry with exponential backoff (3 attempts)" for API failures. RFC-0753 mentions rate limits in Risks but doesn't specify a retry strategy for transient API failures (502, 503, 504).

5. **Declaration file absence.** What happens when `dns.record.validate --zone warpgogol.com` is called but `systems/warpgogol-com/dns-records.yaml` doesn't exist? The RFC should specify graceful skip (info-level, not error) for zones without a declaration file.

6. **DKIM key security note.** The declaration file contains DKIM public keys (`p=MIGfMA0GCSqGSIb3DQEBA...`). Operators unfamiliar with DKIM might accidentally commit a private key. The RFC should include a security note: DKIM public keys are safe to commit; private keys must never appear in declaration files.

## Questions for the author

1. Does this RFC truly satisfy DNA-40, or should it reference a different/new invariant? DNA-40 is specifically about `.env.example` and deploy scripts — DNS records are a separate concern.
2. How should `dns.record.validate` integrate into the pipeline given that `sites-check.run` is per-app but DNS records are per-zone? Should it be in a workspace-level pipeline instead?
3. What is the implementation ordering constraint for the shared Cloudflare API client — is RFC-0752 a prerequisite, or should the client be extracted to a neutral location?
