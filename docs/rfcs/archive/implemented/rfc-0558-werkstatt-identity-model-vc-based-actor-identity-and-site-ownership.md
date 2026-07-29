---
id: RFC-0558
title: "Werkstatt Identity Model: VC-based actor identity and site ownership"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0555
amendedBy: []
related:
  - DNA-34
  - DNA-44
  - DNA-45
  - DNA-56
  - RFC-0028
  - RFC-0555
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-45
  - DNA-56
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
  added:
    - identity.bootstrap
    - identity.credential.issue
    - identity.credential.verify
    - identity.credential.revoke
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/passport
  - packages/ontology
  - packages/studio-gate
  - packages/os/site-kernel-handoff
successSignals:
  - "A site owner can present a SiteOwnershipCredential VC and have Studio Gate accept it as proof of ownership for mission lifecycle commands on that site."
  - "An LLM agent presenting an ActorDelegationCredential VC signed by a site owner can execute workpiece.read and workpiece.write on behalf of that owner, with the delegation expiry enforced."
  - "A single operator can bootstrap the identity system with one Ed25519 keypair and one static VC, enabling full pilot operation without external identity providers."
nonGoals:
  - "Do not implement P2P network identity or inter-workshop peer authentication — that is RFC-0562 (P2P topology)."
  - "Do not implement delegation chains longer than one hop in the pilot — multi-hop delegation is future work."
  - "Do not implement post-quantum signature algorithms — the VC proof format is versioned to allow future migration, but Ed25519 is the only active algorithm."
  - "Do not implement a public key discovery network — bootstrap config is a local file in the pilot."
  - "Do not implement transfer of site ownership between operators — the owner field is set at bootstrap time; transfer chains are future work."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0558: Werkstatt Identity Model: VC-based actor identity and site ownership

## Context

The Werkstatt platform is scaling from a single-operator pilot to a multi-tenant system supporting millions of sites and thousands of programmers. The current architecture has no identity model: `actor` is a free-text string defaulting to `"agent"` in mission manifests (`packages/os/site-kernel-handoff/src/mission/index.ts:68`), Studio Gate accepts all MCP connections without authentication (`packages/studio-gate/src/index.ts`), and the Sternsystem registry has no `owner` field (`packages/ontology/src/operations/sternsystem.ts:51`).

DNA-34 established Ed25519 VC signing for build provenance (Cosmic Passport, RFC-0028). The `packages/passport` package already provides `signBytes`, `verifyBytes`, `generateKeypair`, multibase encoding, and W3C VC assembly (`packages/passport/src/sign.ts`). These primitives are reusable for identity credentials without modifying the passport build-provenance pipeline.

The grilling session (2026-07-27) established that identity must be VC-based, reusing Ed25519 primitives from passport, with a single-keypair pilot mode that one person can operate.

## Problem

1. **No authentication on Studio Gate.** Any MCP client can call `workpiece.write`, `mission.reconcile`, or `release.publish` without proving identity. This is acceptable for a single-operator pilot but blocks multi-tenant scaling.
2. **No ownership model in registry.** `fleetRegistryEntrySchema` (`packages/ontology/src/operations/sternsystem.ts:51`) has no `owner` field. There is no way to determine who is authorized to edit a specific Sternsystem.
3. **Actor identity is not cryptographic.** The `actor` flag on mission commands (`packages/os/site-kernel-handoff/src/mission/index.ts:68`) is a free-text string. Bordbuch records this string, but it cannot be verified or linked to a keypair.
4. **No delegation mechanism.** Business owners cannot delegate LLM agents to edit sites on their behalf with scoped, time-limited credentials.
5. **No bootstrap path.** There is no command or configuration file for generating the initial identity keypair and issuing the first ownership credential.

## Decision

The Werkstatt gains a VC-based identity model with two new credential types — `SiteOwnershipCredential` and `ActorDelegationCredential` — built on the existing Ed25519 signing primitives from `packages/passport`. Four new commands (`identity.bootstrap`, `identity.credential.issue`, `identity.credential.verify`, `identity.credential.revoke`) manage keypairs and credential lifecycle. The `actor` field in mission commands and Bordbuch entries becomes a VC subject identifier (multibase public key), not a free-text string.

## Architectural fit

- **DNA-34 (VC signing):** Extends the Ed25519 VC infrastructure from build provenance to identity. The same `signBytes`/`verifyBytes` primitives from `packages/passport/src/sign.ts` are reused. A new VC type (`SiteOwnershipCredential`) is added alongside the existing `CosmicPassportCredential`.
- **DNA-44 (Sternsystem bundle):** Sternsystem repos remain data-only. Identity credentials are not stored in Sternsystem repos — they live in the Werkstatt workspace and bootstrap config.
- **DNA-45 (Fleet registry):** The registry gains an optional `owner` field referencing the VC subject identifier. This is a forward-compatible addition — existing entries without `owner` continue to validate.
- **DNA-56 (Studio Gate):** Studio Gate adds an auth middleware that verifies VC tokens before dispatching to Site OS commands. The MCP tool surface is unchanged; auth is enforced at the gate, not at individual tools.
- **RFC-0555 (Studio Gate):** This RFC amends the Studio Gate architecture by adding the auth layer that RFC-0555 explicitly omitted.
- **Scaling:** The pilot uses a single keypair and static VC. The VC format is versioned (`algId` field in proof) to allow future migration to post-quantum signatures and P2P peer identity without breaking existing credentials.

## Design

### CLI surface

```sh
# One-time bootstrap: generate keypair, write werkstatt.identity.json, issue self-ownership VC
pnpm exec site-kernel run identity.bootstrap --operator-name "Andrii Syrokomskyi" --domain warpgogol.com --json

# Issue a SiteOwnershipCredential for a specific Sternsystem
pnpm exec site-kernel run identity.credential.issue \
  --type SiteOwnershipCredential \
  --subject did:web:warpgogol.com#operator-v1 \
  --site warpgogol-com \
  --json

# Issue an ActorDelegationCredential for an LLM agent
pnpm exec site-kernel run identity.credential.issue \
  --type ActorDelegationCredential \
  --subject did:web:warpgogol.com#agent-llm-001 \
  --site warpgogol-com \
  --delegated-by did:web:warpgogol.com#operator-v1 \
  --expires-at 2026-08-27T12:00:00Z \
  --json

# Verify a credential (used by Studio Gate middleware, also callable directly)
pnpm exec site-kernel run identity.credential.verify --credential-file werkstatt.identity.json --json

# Revoke a credential by id
pnpm exec site-kernel run identity.credential.revoke --credential-id urn:warpgogol:cred:abc123 --json
```

All commands are scope: `workspace`.

### TypeScript contracts

```ts
// New VC types in packages/passport/src/schema.ts

export interface SiteOwnershipCredentialSubject {
  id: string;              // did:web:<domain>#<key-version>
  siteId: string;          // Sternsystem id (kebab-case)
  role: "owner";           // Future: "editor", "viewer"
}

export interface ActorDelegationCredentialSubject {
  id: string;              // did:web:<domain>#<agent-id>
  siteId: string;          // Sternsystem id
  delegatedBy: string;     // did:web:<domain>#<operator-key-version>
  expiresAt: string;       // ISO-8601 timestamp
  scopes: string[];        // e.g. ["workpiece.read", "workpiece.write", "mission.open"]
}

// Bootstrap config file shape: werkstatt.identity.json
export interface WerkstattIdentityConfig {
  schemaVersion: "1.0";
  operatorName: string;
  operatorKeyPair: {
    publicKeyMultibase: string;   // Ed25519 public key, multibase base58btc
    keyVersion: string;           // e.g. "v1"
    algId: "Ed25519Signature2020"; // Versioned for future post-quantum migration
  };
  authMode: "permissive" | "enforced"; // Pilot starts permissive, operator switches to enforced
  domain: string;                 // e.g. "warpgogol.com" — used for did:web identifiers
  // Private key is NEVER stored in this file — it lives in PASSPORT_SIGNING_KEY env var
  issuedCredentials: WerkstattCredential[];
  revokedCredentialIds: string[];
}

export interface WerkstattCredential {
  credentialId: string;     // urn:warpgogol:cred:<uuid>
  type: "SiteOwnershipCredential" | "ActorDelegationCredential";
  // Discriminated union: narrow via `type` field, not `instanceof`
  subject: SiteOwnershipCredentialSubject | ActorDelegationCredentialSubject;
  proof: VCProof;           // Reuses existing VCProof from passport schema
  issuedAt: string;         // ISO-8601
  issuer: string;           // did:web:<domain>
}

// Studio Gate auth middleware shape
export interface StudioGateAuthResult {
  authenticated: boolean;
  actorId?: string;         // VC subject id if authenticated
  siteId?: string;          // Site from credential
  scopes?: string[];        // Allowed command scopes
  error?: string;           // Failure reason if not authenticated
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `werkstatt.identity.json` | Bootstrap config: operator name, public key, issued credentials, revocation list. Created by `identity.bootstrap`, updated by `identity.credential.issue`/`revoke`. |
| `packages/passport/src/schema.ts` | Extended with `SiteOwnershipCredentialSubject`, `ActorDelegationCredentialSubject`, `WerkstattIdentityConfig`, `WerkstattCredential` types. |
| `packages/passport/src/sign.ts` | No changes to existing functions. Identity credentials use `signBytes`/`verifyBytes` (raw detached signing) with a new `identityCredentialBytes()` canonicalization function in `packages/passport/src/identity-sign.ts`. `signCredential` is NOT reused — it is typed to `CredentialSubjectDigest` (build provenance fields) and cannot accept identity credential subjects. |
| `packages/studio-gate/src/index.ts` | Auth middleware added before `CallToolRequestSchema` handler. Reads VC token from MCP `_meta.identity` or `X-Werkstatt-Credential` header. |
| `packages/ontology/src/operations/sternsystem.ts` | `fleetRegistryEntrySchema` gains optional `owner?: string` field (VC subject id). |
| `packages/os/site-kernel-handoff/src/mission/index.ts` | `actor` flag default changes from `"agent"` to required-from-auth-context. Mission commands receive actor from auth middleware, not CLI flag. |
| `systems/registry.yaml` | Existing entries continue to validate without `owner`. New entries should include `owner`. |
| `.env.example` (workspace root) | `PASSPORT_SIGNING_KEY` env var documented with `# How to obtain:` instruction per DNA-40. |
| `packages/passport/src/identity-sign.ts` | New module: `identityCredentialBytes()` canonicalization + `signIdentityCredential()`/`verifyIdentityCredential()` wrappers around `signBytes`/`verifyBytes`. |
| `packages/passport/AGENTS.md` | Updated to document new identity credential types and `identity-sign.ts` module. |
| `packages/studio-gate/AGENTS.md` | Updated to document auth middleware and `authMode` field. |
| `packages/os/site-kernel-handoff/AGENTS.md` | Updated to document `actor` field semantics change (VC subject id from auth context). |

### Output format

```json
{
  "command": "identity.bootstrap",
  "status": "ok",
  "data": {
    "operatorName": "Andrii Syrokomskyi",
    "publicKeyMultibase": "z6MkhaXg...",
    "keyVersion": "v1",
    "configFile": "werkstatt.identity.json",
    "envVarToSet": "PASSPORT_SIGNING_KEY",
    "selfOwnershipCredentialId": "urn:warpgogol:cred:abc123"
  },
  "summary": "identity.bootstrap: generated keypair, wrote werkstatt.identity.json, issued self-ownership VC"
}
```

```json
{
  "command": "identity.credential.verify",
  "status": "ok",
  "data": {
    "valid": true,
    "credentialType": "SiteOwnershipCredential",
    "subjectId": "did:web:warpgogol.com#operator-v1",
    "siteId": "warpgogol-com",
    "scopes": ["*"],
    "expiresAt": null
  },
  "summary": "identity.credential.verify: credential valid"
}
```

### Canonicalization for identity credentials

Identity credential subjects are canonicalized using sorted-key JSON (same determinism contract as `credentialBytes` in `sign.ts`). The `identityCredentialBytes()` function in `packages/passport/src/identity-sign.ts` produces canonical UTF-8 bytes from the subject fields:

```ts
// SiteOwnershipCredentialSubject → { id, siteId, role } sorted by key
// ActorDelegationCredentialSubject → { delegatedBy, expiresAt, id, scopes, siteId } sorted by key
```

The signed bytes are the sorted JSON of the subject fields only (not the full VC envelope). The `proof` is attached after signing, same as the build-provenance passport flow.

### `werkstatt.identity.json` git tracking

The `werkstatt.identity.json` file contains only public keys, credential IDs, and revocation lists — no private key material. It **MUST be committed to git** so that all operators and CI can verify credentials. The private key lives exclusively in the `PASSPORT_SIGNING_KEY` env var.

### Concurrent access

In the pilot, `werkstatt.identity.json` is read by Studio Gate middleware on every MCP call and written only by `identity.credential.issue`/`revoke` commands (infrequent). No file locking is needed for the pilot — the read is a single `readFile` call (atomic at the OS level for small files), and writes are serialized by the operator running one command at a time. If concurrent writes become a concern in multi-operator mode, a file lock can be added in a follow-up RFC.

### Compass sync

This RFC does not change `docs/*.xml` Compass documents — identity is a new platform-level concern, not a modification of existing requirements or technology contracts. If future RFCs elevate identity to a Compass-tracked requirement, `docs/requirements.xml` and `docs/technology.xml` should be updated at that time.

### AGENTS.md updates

The following `AGENTS.md` files need updates during implementation:

- `packages/passport/AGENTS.md` — document new identity credential types, `identity-sign.ts` module, and `WerkstattIdentityConfig` schema.
- `packages/studio-gate/AGENTS.md` — document auth middleware, `authMode` field, and VC verification flow.
- `packages/os/site-kernel-handoff/AGENTS.md` — document `actor` field semantics change (VC subject id from auth context, not free-text).

### Failure modes

| Condition | Behavior |
| --- | --- |
| `PASSPORT_SIGNING_KEY` env var not set | `identity.bootstrap` and `identity.credential.issue` fail with exit code 1 and message `PASSPORT_SIGNING_KEY env var is required`. |
| `werkstatt.identity.json` not found | `identity.credential.issue`/`verify`/`revoke` fail with exit code 1. `identity.bootstrap` creates it. |
| VC signature invalid | `identity.credential.verify` returns `{ valid: false, error: "signature-invalid" }` with exit code 0 (verification result, not command failure). |
| Credential expired | `identity.credential.verify` returns `{ valid: false, error: "expired", expiredAt: "..." }`. |
| Credential revoked | `identity.credential.verify` returns `{ valid: false, error: "revoked" }`. |
| Studio Gate receives no credential | Returns MCP error response with `error: "authentication-required"`. |
| Studio Gate receives credential for wrong site | Returns MCP error with `error: "site-mismatch", expected: "warpgogol-com", presented: "other-site"`. |
| Studio Gate receives credential with insufficient scope | Returns MCP error with `error: "insufficient-scope", required: "workpiece.write", presented: ["workpiece.read"]`. |

## Rollout

- **Pilot (single operator):** `identity.bootstrap` generates one keypair, issues one `SiteOwnershipCredential` for the operator. Studio Gate auth middleware runs in `permissive` mode (warns if no credential, still allows). This allows the existing workflow to continue without disruption during rollout.
- **Auth enforcement:** After the operator confirms auth works, Studio Gate switches to `enforced` mode via `werkstatt.identity.json` field `authMode: "enforced"`. In enforced mode, all MCP calls require a valid VC.
- **Registry migration:** `sternsystem.validate` warns (not fails) when `owner` is absent on existing entries. New entries should include `owner`. A follow-up command `sternsystem.owner.backfill` can batch-update existing entries.
- **Actor field migration:** Existing missions with `actor: "agent"` remain valid in Bordbuch. New missions require `actor` to be a VC subject id. `mission.open` accepts `actor` from auth context (Studio Gate) or from `--actor` flag (CLI direct access, for backwards compatibility).
- **No flag day:** All changes are additive. Existing commands, schemas, and workflows continue to function. Auth is opt-in via `authMode` field.

## Alternatives considered

1. **OAuth2 / OIDC provider.** Use an external identity provider (Auth0, Keycloak, self-hosted OIDC). Rejected for pilot: adds infrastructure dependency, external service to maintain, and does not align with the P2P architecture where no central authority exists. VC-based identity is self-sovereign and works offline.
2. **API keys (static tokens).** Generate per-actor API keys, store in registry. Rejected: no cryptographic delegation, no expiry, no scopes. API keys are bearer tokens — if leaked, they grant full access until manually revoked. VCs carry signed delegation chains and scoped permissions.
3. **did:web with DID resolution.** Full DID document resolution per `did:web` spec. Rejected for pilot: adds DNS dependency and HTTP resolution step. The pilot uses `did:web` as an identifier format but resolves keys from local `werkstatt.identity.json`, not from HTTPS DID endpoints. Full DID resolution is future work for P2P mode.
4. **Reuse CosmicPassportCredential for identity.** Extend the existing passport VC type to carry identity claims. Rejected: `CosmicPassportCredential` is a build-provenance credential (systemHash + commitSha). Identity is a different concern with different fields (siteId, scopes, expiry). Mixing them creates a confusing schema and breaks the single-responsibility principle.

## Risks

- **Key loss.** If `PASSPORT_SIGNING_KEY` is lost, the operator cannot issue new credentials or revoke existing ones. Mitigation: key rotation command (future), backup of hex key in secure storage. The `werkstatt.identity.json` stores only the public key.
- **VC token theft.** A stolen `SiteOwnershipCredential` VC grants full access until expiry or revocation. Mitigation: short expiry for delegation credentials, revocation list in `werkstatt.identity.json`, and future token binding to agent identity headers.
- **Agent misinterpretation.** LLM agents may attempt to call Studio Gate without a credential, or may fabricate a credential. Mitigation: Studio Gate returns clear error messages with the required credential format. Agents cannot fabricate VCs without the private key.
- **Performance.** VC verification (Ed25519 signature check) adds ~1ms per MCP call. Negligible.
- **Pilot complexity.** The bootstrap flow requires the operator to set an env var and run one command. If this is too complex, a wrapper script can automate it. The design prioritizes simplicity: one keypair, one file, one command.
- **Future migration.** The `algId` field in the VC proof is versioned from day one. When post-quantum signatures are needed (RFC-0562 P2P topology), a new `algId` value is introduced. Old credentials remain valid until their expiry. No breaking migration.

## Acceptance criteria

- [x] `SiteOwnershipCredentialSubject` and `ActorDelegationCredentialSubject` types defined in `packages/passport/src/schema.ts` (evidence: packages/passport/src/schema.ts:147-159, pnpm --filter @warpgogol/passport build:check)
- [x] `WerkstattIdentityConfig` type defined in `packages/passport/src/schema.ts` (evidence: packages/passport/src/schema.ts:170-182, pnpm --filter @warpgogol/passport build:check)
- [x] `identity.bootstrap` command registered in `packages/os/site-kernel-handoff` and produces `werkstatt.identity.json` (evidence: packages/os/site-kernel-handoff/src/identity/identity-bootstrap.ts, tools/kernel.config.ts:117-118, src/tests/identity-commands.test.ts:44-67)
- [x] `identity.credential.issue` command registered and produces signed VCs using `signIdentityCredential` from `@warpgogol/passport/identity-sign` (evidence: packages/os/site-kernel-handoff/src/identity/identity-credential-issue.ts, src/tests/identity-commands.test.ts:82-97)
- [x] `identity.credential.verify` command registered and verifies VCs using `verifyIdentityCredential` from `@warpgogol/passport/identity-sign` (evidence: packages/os/site-kernel-handoff/src/identity/identity-credential-verify.ts, src/tests/identity-commands.test.ts:100-125)
- [x] `identity.credential.revoke` command registered and updates revocation list in `werkstatt.identity.json` (evidence: packages/os/site-kernel-handoff/src/identity/identity-credential-revoke.ts, src/tests/identity-commands.test.ts:100-125)
- [x] `fleetRegistryEntrySchema` in `packages/ontology/src/operations/sternsystem.ts` has optional `owner` field (evidence: packages/ontology/src/operations/sternsystem.ts:65-69, pnpm --filter @warpgogol/ontology build:check)
- [x] Studio Gate (`packages/studio-gate/src/index.ts`) has auth middleware that calls `identity.credential.verify` before dispatching MCP tools (evidence: packages/studio-gate/src/auth.ts, packages/studio-gate/src/index.ts:112-128, pnpm --filter @warpgogol/studio-gate build:check)
- [x] `authMode: "permissive"` default allows existing workflow without credentials (evidence: packages/studio-gate/src/index.ts:118, packages/os/site-kernel-handoff/src/identity/identity-bootstrap.ts:84)
- [x] `authMode: "enforced"` rejects MCP calls without valid VC (evidence: packages/studio-gate/src/index.ts:118-128, packages/studio-gate/src/auth.ts:81-91)
- [x] Mission `actor` field accepts VC subject id from auth context (evidence: packages/os/site-kernel-handoff/src/mission/mission-open.ts:54, mission-close.ts:98, mission-abort.ts:52)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate RFC-0558 --json — 0 errors, 0 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT store private keys in `werkstatt.identity.json` — only public keys. The private key lives in `PASSPORT_SIGNING_KEY` env var.
- Agents MUST NOT hardcode credential IDs or key versions — these are generated at bootstrap time.
- The `algId` field in VC proofs MUST be `Ed25519Signature2020` in the pilot. Future RFCs may introduce new algorithms without breaking this RFC.
- Studio Gate auth middleware MUST run in `permissive` mode by default. Switching to `enforced` mode requires the operator to update `werkstatt.identity.json`.
