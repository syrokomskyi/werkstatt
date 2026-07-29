---
rfcId: RFC-0558
auditId: AUDIT-RFC-0558-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0558

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has a referential integrity gap (`amends: []` despite explicitly amending RFC-0555), an incorrect claim that `signCredential` is reused as-is (its `CredentialSubjectDigest` type doesn't support identity credential subjects), and a missing `authMode` field in the TypeScript contract that is referenced in rollout and acceptance criteria.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0558` returns zero violations.

## Axis A — Structural completeness

- **`authMode` missing from TypeScript contract.** The `WerkstattIdentityConfig` interface (RFC lines 171–182) does not include an `authMode` field, but the Rollout section (lines 264–265) and acceptance criteria (lines 296–297) reference `authMode: "permissive"` and `authMode: "enforced"`. The type contract is incomplete — `authMode` must be declared in `WerkstattIdentityConfig`.
- **`WerkstattCredential` union subject lacks discriminator.** The `subject` field (line 187) is typed as `SiteOwnershipCredentialSubject | ActorDelegationCredentialSubject` — a union without a discriminant. Zod parsing and runtime narrowing need a `type`-tagged discriminant or an explicit guard. The RFC should specify how consumers narrow the union.

## Axis B — DNA alignment

- **`amends: []` is empty but RFC explicitly amends RFC-0555.** Line 115: "This RFC amends the Studio Gate architecture by adding the auth layer that RFC-0555 explicitly omitted." The `amends` frontmatter field must be `[RFC-0555]`. This is a referential integrity violation — `rfc.validate` should catch this but doesn't (it checks `amends` referential integrity but not whether the body claims an amendment).
- **`satisfies: [DNA-34]` references a reclassified (non-binding) invariant.** DNA-34 is in the "Historical / Reclassified (DNA-27..34) — NOT BINDING" section of `docs/architecture-dna.md` (line 119–121). New RFCs must not reference DNA-27..34 as active invariants. The RFC should satisfy DNA-45 (Fleet registry — extended by `owner` field) and DNA-56 (Studio Gate — extended by auth middleware) instead, which are binding invariants the RFC actually extends.
- **DNA-45 extension not declared in `satisfies`.** The RFC adds an optional `owner` field to `fleetRegistryEntrySchema` (line 211). DNA-45 defines the registry entry fields. Adding `owner` is an extension of DNA-45 and should be declared in `satisfies`.
- **DNA-56 extension not declared in `satisfies`.** The RFC adds auth middleware to Studio Gate (line 210). DNA-56 defines Studio Gate. Adding auth is an extension of DNA-56 and should be declared in `satisfies`.

## Axis C — Ecosystem fit

- **AGENTS.md updates not identified.** The RFC changes `packages/passport` (new credential types), `packages/studio-gate` (auth middleware), and `packages/os/site-kernel-handoff` (actor field semantics). The corresponding `AGENTS.md` files (`packages/passport/AGENTS.md`, `packages/studio-gate/AGENTS.md`, `packages/os/site-kernel-handoff/AGENTS.md`) will need rule updates to document the new identity model. The RFC doesn't identify these.
- **Compass sync not identified.** If the identity model changes repository-wide requirements or shared package contracts, `docs/*.xml` files may need synchronization. The RFC doesn't mention which Compass documents are affected. At minimum, `docs/requirements.xml` or `docs/technology.xml` may need updates if identity is a new platform-level requirement.
- **Package boundaries are correct.** All proposed changes flow `packages/* → packages/*`. No app-to-app or app-to-service imports. Good.
- **Command lifecycle is internally consistent.** `commands.proposed` lists 4 new commands; `commands.added: []` is correct for a draft RFC.

## Axis D — Forward-only compliance

- **`authMode: "permissive"` is a time-limited rollout strategy, not a permanent dual-path.** The RFC states permissive mode is for pilot rollout, with explicit transition to `enforced` mode. This is acceptable — it's a migration window, not an indefinite compatibility shim.
- **`--actor` flag retention is acceptable.** `mission.open` accepts `actor` from auth context (Studio Gate) or `--actor` flag (CLI). These are different transport modes (MCP vs CLI), not a legacy-vs-new dual-path. The `--actor` flag is the CLI analogue of the MCP auth context, not a backwards-compatibility shim.
- **No compatibility layers or bridges proposed.** Good.

## Axis E — Agent-facing policy

- **`.env.example` not mentioned for `PASSPORT_SIGNING_KEY`.** DNA-40 requires every project that reads env vars to ship a `.env.example` with documented variables. The RFC introduces `PASSPORT_SIGNING_KEY` as a required env var but doesn't mention adding it to `.env.example` at the workspace root. The RFC should specify this in the file system responsibilities table.
- **Status gate is clean.** No self-authorizing language. Draft RFC does not grant implementation permission. Good.
- **Implementation notes reference correct governance rules** (RFC-0224, RFC-0330, RFC-0334). Good.
- **Storage policy is clean.** File-based persistence (`werkstatt.identity.json`), no cookies. Good.

## Axis F — Pragmatism

- **`signCredential` reuse claim is incorrect.** The file system responsibilities table (line 209) states `packages/passport/src/sign.ts` has "No changes — `signBytes`/`verifyBytes`/`signCredential`/`verifyCredential` are reused as-is." But `signCredential` accepts `CredentialSubjectDigest` (`{ systemHash, commitSha, issuedAt, appId }`) — the identity credential subjects (`SiteOwnershipCredentialSubject`, `ActorDelegationCredentialSubject`) have completely different fields. `signCredential` cannot be reused as-is for identity credentials. The RFC must either: (a) use `signBytes` with custom canonicalization for identity subjects, or (b) generalize `signCredential` to accept a broader subject type. The RFC should clarify which approach is used and update the file system responsibilities table accordingly.
- **Canonicalization for identity subjects not specified.** The `credentialBytes` function in `sign.ts` creates canonical bytes from `CredentialSubjectDigest` fields. For identity credentials, a different canonicalization is needed (sorted JSON of `id`, `siteId`, `role` or `id`, `siteId`, `delegatedBy`, `expiresAt`, `scopes`). The RFC doesn't specify how identity credential subjects are canonicalized for signing. This is a design gap.
- **4 commands earn their existence.** `bootstrap` (one-time), `issue`/`verify`/`revoke` (distinct lifecycle phases). No command that could be a flag on an existing command. Good.
- **`packagesImpacted` is accurate.** All four listed packages are actually impacted. Good.

## Axis G — Blind spots

- **Concurrent access to `werkstatt.identity.json` not addressed.** If `identity.credential.revoke` writes the file while `identity.credential.verify` reads it (via Studio Gate middleware), there could be a race condition. The RFC should specify whether file locking is needed or whether the read is atomic enough for the pilot.
- **`werkstatt.identity.json` git tracking status unclear.** The RFC doesn't specify whether this file should be committed to git or gitignored. The file contains public keys and credential IDs (not private keys), so committing is safe. But the RFC should state this explicitly — operators need to know whether to commit or gitignore.
- **`did:web:<domain>` domain not specified for pilot.** The RFC uses `did:web:warpgogol.com` in examples but doesn't specify which domain to use for the pilot. Is it always `warpgogol.com`? What if the operator has multiple domains? The bootstrap command should accept a `--domain` flag or derive it from the workspace.
- **Performance is addressed.** ~1ms per Ed25519 verification. Good.
- **Empty states are considered.** `identity.bootstrap` creates the initial state. Good.

## Questions for the author

1. Why is `amends: []` empty when the RFC body explicitly states "This RFC amends the Studio Gate architecture"? Should this be `amends: [RFC-0555]`?
2. How will identity credential subjects be canonicalized for signing, given that `signCredential` only accepts `CredentialSubjectDigest`? Will you use `signBytes` with custom canonicalization, or generalize `signCredential`?
3. Why does `satisfies` list only DNA-34 (reclassified, non-binding) instead of DNA-45 and DNA-56 (binding invariants the RFC actually extends)?
4. Where should `authMode` be declared in the TypeScript contract? It's referenced in rollout and acceptance criteria but missing from `WerkstattIdentityConfig`.
5. Should `werkstatt.identity.json` be committed to git or gitignored? And should `PASSPORT_SIGNING_KEY` be documented in `.env.example` per DNA-40?
