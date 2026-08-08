---
rfcId: RFC-0752
auditId: AUDIT-RFC-0752-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0752

## Verdict: Needs revision

The RFC is architecturally sound and well-scoped, but has a weak DNA-40 alignment, missing structural sections (File system responsibilities, Output format, Failure modes), an undeclared `SubdomainListResult` type, and a `cloudflareZoneId` ownership conflict with RFC-0751. These are fixable without restructuring the RFC.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Missing "File system responsibilities" table** — the RFC touches `systems/registry.yaml` (adds `cloudflareZoneId`, references `services:` key from RFC-0751), `packages/os/site-kernel-handoff/src/subdomain/` (new directory), and `packages/os/site-kernel-handoff/src/leitstand/adapters/` (new Cloudflare API client). No table enumerates these paths and their roles.
- **Missing "Output format" section** — the TypeScript contracts define result interfaces, but the RFC does not document the `--json` output shape separately. RFC-0751 includes this section; RFC-0752 should follow the same pattern.
- **Missing "Failure modes" section** — "Error handling" under Design covers some cases, but does not specify exit codes or warn-vs-fail behavior. RFC-0751 has a dedicated "Failure modes" section with exit code semantics.
- **Missing `SubdomainListResult` type** — `SubdomainRegisterResult` and `SubdomainValidateResult` are defined, but `subdomain.list` has no TypeScript contract. The Design section describes its behavior but the return type is absent.
- **Acceptance criteria** are checkable and cover the scope.
- **Implementation notes** are explicit with concrete file paths.

## Axis B — DNA alignment

- **`satisfies: [DNA-40]` is weakly justified.** DNA-40 is the "Env-example and deploy-script contract" — it covers `.env.example` files, deploy scripts, `deploy.preflight` prefixing. RFC-0752 is about subdomain DNS + Workers route management. The RFC body says "DNA-40: Extends the deployment contract with subdomain validation as a pre-deploy gate" but DNA-40 does not mention subdomains, DNS, or Workers routes. The connection is indirect: RFC-0751 (which also satisfies DNA-40) integrates `subdomain.validate` into `leitstand.service.deploy`, which is a deploy script concern. Consider either: (a) removing `satisfies: [DNA-40]` and explaining in `related[]` instead, or (b) explicitly justifying how subdomain validation extends the deploy-script contract established by DNA-40.

## Axis C — Ecosystem fit

- **`cloudflareZoneId` ownership conflict with RFC-0751.** Both RFC-0751 (§ "cloudflareZoneId in systems[] entries", line 272) and RFC-0752 (§ "Zone ID resolution", line 91) declare the `cloudflareZoneId` field on `systems[]` entries. RFC-0751 declares it as part of the service deployment protocol; RFC-0752 declares it as part of the subdomain management protocol. The RFCs need to agree on who owns the declaration. Recommendation: RFC-0752 should reference RFC-0751 for the `cloudflareZoneId` field declaration, or vice versa, to avoid two RFCs claiming ownership of the same registry field.
- **`@warpgogol/ontology` in `packagesImpacted` is unexplained.** The RFC does not describe any ontology changes — no schema, no enum, no type is added to `@warpgogol/ontology`. If ontology is not impacted, remove it from `packagesImpacted`. If it is (e.g. for a `SubdomainRecord` schema), describe what changes.
- **No AGENTS.md updates identified.** The RFC adds a new command family (`subdomain.*`) and a new registry field (`cloudflareZoneId`). Root `AGENTS.md` or `packages/os/site-kernel-handoff/AGENTS.md` may need updates to document the subdomain protocol. The RFC should identify which AGENTS.md files need changes.
- **No Compass sync identified.** If the RFC changes repository-wide requirements or shared package contracts, it should identify which `docs/*.xml` files need synchronization.
- **Command lifecycle** — `commands.proposed` lists 3 commands, `added/changed/removed` are empty. Internally consistent.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only — no compatibility shims, no dual-paths, no deprecation grace periods.

## Axis E — Agent-facing policy

- **Status gate** is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference RFC-0224 for the accepted→implemented transition.
- **No NEEDS CLARIFICATION markers** found.
- **Storage policy** — no client-side persistence, no cookies. This is a CLI-only tool. No issues.

## Axis F — Pragmatism

- **Three commands earn their existence** — register, validate, and list are distinct operations with different semantics. `subdomain.list` could theoretically be a `--list` flag on `subdomain.validate`, but as an audit tool it's cleaner as a separate command.
- **`SubdomainRecord` type is minimal** — `domain` and `zone` fields only. No speculative generality.
- **Existing patterns** — the RFC proposes a new Cloudflare REST API client alongside the existing `cloudflare-workers.ts` adapter (which wraps `wrangler` CLI, not the REST API). This is justified — the REST API is needed for DNS record and Workers route management, which `wrangler` does not provide.
- **`packagesImpacted` includes `@warpgogol/ontology`** without describing any changes — see Axis C.

## Axis G — Blind spots

- **`<account>` subdomain derivation** — the RFC says the CNAME target `matomo-proxy.<account>.workers.dev` is derived from `CLOUDFLARE_ACCOUNT_ID` or from `workersDevUrl` in the registry. But `workersDevUrl` is per-service (declared in RFC-0751's service registry), and a newly registered service may not have it set yet. The RFC should specify the fallback chain: try `workersDevUrl` from the service entry → derive from `CLOUDFLARE_ACCOUNT_ID` → error if neither is available.
- **Cloudflare API query parameter** — `GET /zones/{zone_id}/workers/routes?pattern={subdomain.domain}/*` — the RFC should verify that the Cloudflare API supports filtering Workers routes by pattern. If it does not, the implementation must list all routes and filter client-side.
- **Token permission documentation** — the RFC mentions the token needs `Zone:DNS:Edit` and `Workers Routes:Edit` permissions but does not specify where this is documented for the operator. Should this go in `.env.example` comments (per DNA-40), a README, or an AGENTS.md rule?
- **Concurrent execution** — the RFC mentions race conditions in Risks but the mitigation (idempotency check before creation) has a TOCTOU window between the check and the create. For a CLI tool run by operators, this is acceptable, but the RFC should acknowledge it.
- **No performance concern** — API calls are per-subdomain, not bulk. Acceptable for the expected scale (single-digit subdomains).

## Questions for the author

1. Does `cloudflareZoneId` belong to RFC-0751 or RFC-0752? Both RFCs declare it — one should own the declaration and the other should reference it.
2. What changes does `@warpgogol/ontology` need? If none, remove it from `packagesImpacted`.
3. How is the `<account>` subdomain derived when a service has no `workersDevUrl` in the registry yet? Specify the fallback chain.
