---
rfcId: RFC-0896
auditId: AUDIT-RFC-0896-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0896

## Verdict: Needs revision

The RFC has a contradictory pipeline integration design (calls commands during `leitstand.propagate`/alt but says "only main channel is covered"), an incorrect Cloudflare Rulesets API endpoint, and lists `werkstatt-site` in `packagesImpacted` without touching any file in it. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`packagesImpacted` includes `werkstatt-site` but no file in `werkstatt-site` is touched.** The file system responsibilities table (lines 187–195) lists only files in `packages/werkstatt/`. The `wrangler.template.jsonc` in `werkstatt-site` is mentioned in Context (line 89) but not modified. Remove `werkstatt-site` from `packagesImpacted`.
- **TypeScript contracts omit input types.** The CLI surface (line 132) mentions `--dry-run`, but the TypeScript contracts (lines 138–182) only show result types, not input types. RFC-0752's contracts include both input and result. Add input interfaces (e.g. `CustomDomainRegisterInput`) or document that the standard `KernelCommandInput` is sufficient.

## Axis B — DNA alignment

- **DNA-73 in `satisfies[]` is a compliance claim, not an enforcement/extension.** DNA-73 (line 301 of `docs/architecture-dna.md`) mandates rejecting `--all`, logging channel/URL, and Dev→Alt→Main ordering. The RFC's commands comply with DNA-73 (they use `--site`), but they do not enforce, protect, or extend the invariant. Move DNA-73 to `related[]` and keep only DNA-49 in `satisfies[]`.

## Axis C — Ecosystem fit

- **Contradictory pipeline integration.** The Decision (line 103) and Rollout (line 258) say both commands run during `leitstand.propagate` (alt) AND `leitstand.promote` (main). But `nonGoals` (line 61) says "Dev/alt channel custom domain setup (only main channel is covered)." If only main is covered, the commands should run only during `leitstand.promote` (main), not during `leitstand.propagate` (alt). Setting up apex DNS during alt deployment is premature — the alt channel uses `alt.warpgogol.com`, not `warpgogol.com`. Clarify: do the commands run during propagate, promote, or both? If both, justify why apex DNS setup is needed before promotion.
- **Missing `kernel.config.ts` module loader entry.** The file system responsibilities table does not mention `tools/kernel.config.ts`, which must register a new `customdomain` module loader (analogous to `subdomain` at line 140 and `dns` at line 142). Add it to the table.
- **No `customdomain.validate` / `redirect.validate` commands.** RFC-0752 provides both `.register` and `.validate`. The existing pipeline pattern in `leitstand.service.promote` calls `subdomain.validate` first, then `subdomain.register` only if validation fails. The RFC should either add validate commands (for consistency with RFC-0752) or explicitly justify why the pipeline calls `register` directly (idempotent, so validate is redundant).

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims or dual-paths.

## Axis E — Agent-facing policy

- **Incorrect Cloudflare Rulesets API endpoint.** Implementation notes (line 303) say `POST /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/rules`. The Cloudflare Rulesets API does not have this endpoint. The correct approaches are: (1) `GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint` to fetch the existing phase ruleset, then `PUT /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint` to update the entire ruleset, or (2) `POST /zones/{zone_id}/rulesets/{ruleset_id}/rules` to append a rule to an existing ruleset. The RFC must specify the correct endpoint and the read-then-write pattern.

## Axis F — Pragmatism

- **`--dry-run` flag is a new pattern not present in `subdomain.register` or `dns.record.upsert`.** The RFC introduces `--dry-run` without justifying why it's needed when existing DNS commands don't have it. Either remove `--dry-run` or justify its necessity (e.g. "operators need to preview DNS changes before applying them at scale").
- **Two commands vs one is justified.** The alternatives section (line 268) explains why `customdomain.register` and `redirect.register` are separate — single-responsibility, sites can use one without the other. This is adequate.

## Axis G — Blind spots

- **A record content `"192.0.2.1"` is a placeholder, not explained.** The TypeScript contract (line 148) says `content: string; // Cloudflare proxied A record placeholder` but the output format (line 208) shows `"content": "192.0.2.1"` without explaining that this is a TEST-NET-1 (RFC 5737) documentation IP. An implementing agent might try to use a real IP. Clarify that for proxied records, the content is a placeholder replaced by Cloudflare's anycast IPs.
- **Concurrent Redirect Rule modification not addressed.** Two deployments running simultaneously for different sites in the same zone would both modify the `http_request_dynamic_redirect` phase ruleset. The `PUT /entrypoint` approach replaces ALL rules; the `POST /rules` approach appends. The RFC must specify how to preserve existing rules and handle concurrent access (e.g. read-modify-write with retry).
- **Existing Redirect Rules not considered.** The RFC says `redirect.register` creates a Redirect Rule for www→apex. But the zone may already have Redirect Rules for other purposes. The RFC should specify that the command appends a rule, not replaces the entire ruleset.

## Questions for the author

1. Should the commands run during `leitstand.propagate` (alt), `leitstand.promote` (main), or both? If both, why set up apex DNS before promotion to main?
2. Why is `--dry-run` needed when neither `subdomain.register` nor `dns.record.upsert` have it?
3. How does `redirect.register` preserve existing Redirect Rules in the same zone when multiple sites share a zone?
