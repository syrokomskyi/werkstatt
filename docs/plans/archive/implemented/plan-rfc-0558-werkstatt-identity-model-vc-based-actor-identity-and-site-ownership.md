---
rfcId: RFC-0558
planId: PLAN-RFC-0558-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/passport
    - packages/ontology
    - packages/studio-gate
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/passport/AGENTS.md
    - packages/studio-gate/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - .env.example
---

# Implementation Plan: RFC-0558

## 1. Objectives

- [ ] O1 — Identity credential types defined in passport schema (maps to acceptance criteria 1, 2)
- [ ] O2 — `identity.bootstrap` command registered and produces `werkstatt.identity.json` (maps to criterion 3)
- [ ] O3 — `identity.credential.issue` command registered, produces signed VCs (maps to criterion 4)
- [ ] O4 — `identity.credential.verify` command registered, verifies VCs (maps to criterion 5)
- [ ] O5 — `identity.credential.revoke` command registered, updates revocation list (maps to criterion 6)
- [ ] O6 — `fleetRegistryEntrySchema` has optional `owner` field (maps to criterion 7)
- [ ] O7 — Studio Gate auth middleware with permissive/enforced modes (maps to criteria 8, 9, 10)
- [ ] O8 — Mission `actor` field accepts VC subject id from auth context (maps to criterion 11)
- [ ] O9 — `rfc.validate` passes on RFC-0558 (maps to criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/passport/src/schema.ts` — new types: `SiteOwnershipCredentialSubject`, `ActorDelegationCredentialSubject`, `WerkstattIdentityConfig`, `WerkstattCredential`
- `packages/passport/src/identity-sign.ts` — new module: `identityCredentialBytes()`, `signIdentityCredential()`, `verifyIdentityCredential()`
- `packages/passport/src/index.ts` — re-export new identity types and functions
- `packages/ontology/src/operations/sternsystem.ts` — add optional `owner?: string` to `fleetRegistryEntrySchema`
- `packages/studio-gate/src/index.ts` — auth middleware before `CallToolRequestSchema` handler
- `packages/studio-gate/src/auth.ts` — new module: `verifyAuthFromMeta()`, `StudioGateAuthResult` type
- `packages/os/site-kernel-handoff/src/identity/` — new directory: `identity-bootstrap.ts`, `identity-credential-issue.ts`, `identity-credential-verify.ts`, `identity-credential-revoke.ts`, `identity-module.ts`
- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — accept `actor` from auth context (via `input.flags["_authActor"]` or similar mechanism)
- `tools/kernel.config.ts` — register `identity` module loader

### 2.2 Configuration and data

- `werkstatt.identity.json` — new workspace-level config file (created by `identity.bootstrap`, committed to git)
- `.env.example` (workspace root) — add `PASSPORT_SIGNING_KEY` with `# How to obtain:` instruction

### 2.3 Documentation and specs

- `packages/passport/AGENTS.md` — document new identity credential types, `identity-sign.ts` module
- `packages/studio-gate/AGENTS.md` — document auth middleware, `authMode` field, VC verification flow
- `packages/os/site-kernel-handoff/AGENTS.md` — document `actor` field semantics change
- RFC-0558 file — acceptance criteria checkmarks with evidence annotations

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/passport build:check`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/studio-gate build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm exec werkstatt run rfc.validate RFC-0558 --json`

## 3. Step sequence

### Step 1. Passport schema: identity credential types

**Goal:** Define TypeScript types and Zod schemas for identity credentials in `packages/passport/src/schema.ts`.

**Agent actions:**

- Add `SiteOwnershipCredentialSubjectSchema` and `ActorDelegationCredentialSubjectSchema` Zod schemas to `packages/passport/src/schema.ts`
- Add `WerkstattIdentityConfigSchema` and `WerkstattCredentialSchema` Zod schemas
- Export corresponding TypeScript types
- Re-export from `packages/passport/src/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/passport build:check`

**Completion criterion:** `packages/passport/src/schema.ts` exports `SiteOwnershipCredentialSubject`, `ActorDelegationCredentialSubject`, `WerkstattIdentityConfig`, `WerkstattCredential` types and matching Zod schemas; `build:check` passes.

**Human review:** no

---

### Step 2. Passport identity-sign module

**Goal:** Create `packages/passport/src/identity-sign.ts` with canonicalization and sign/verify wrappers for identity credentials.

**Agent actions:**

- Create `packages/passport/src/identity-sign.ts`
- Implement `identityCredentialBytes(subject)` — sorted-key JSON canonicalization for both credential subject types
- Implement `signIdentityCredential(subject, privateKeyHex, verificationMethod)` — wraps `signBytes` with `identityCredentialBytes`
- Implement `verifyIdentityCredential(subject, proof, publicKeyMultibase)` — wraps `verifyBytes` with `identityCredentialBytes`
- Re-export from `packages/passport/src/index.ts`
- Add `./identity-sign` export path to `packages/passport/package.json`

**Validation:**

- `pnpm --filter @warpgogol/passport build:check`

**Completion criterion:** `identity-sign.ts` exports `identityCredentialBytes`, `signIdentityCredential`, `verifyIdentityCredential`; `build:check` passes.

**Human review:** no

---

### Step 3. Ontology: add `owner` field to fleet registry schema

**Goal:** Add optional `owner` field to `fleetRegistryEntrySchema` in `packages/ontology/src/operations/sternsystem.ts`.

**Agent actions:**

- Add `owner: z.string().optional()` to `fleetRegistryEntrySchema`
- Verify `FleetRegistryEntry` type now includes optional `owner`

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check`

**Completion criterion:** `fleetRegistryEntrySchema` has optional `owner` field; `build:check` passes; existing entries without `owner` still validate.

**Human review:** no

---

### Step 4. Identity command handlers

**Goal:** Implement `identity.bootstrap`, `identity.credential.issue`, `identity.credential.verify`, `identity.credential.revoke` command handlers in `packages/os/site-kernel-handoff/src/identity/`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/identity/identity-module.ts` — `createIdentityModule()` registering all 4 commands
- Create `identity-bootstrap.ts` — `runIdentityBootstrap`: generate keypair via `generateKeypair()`, write `werkstatt.identity.json` with `authMode: "permissive"`, issue self-ownership VC
- Create `identity-credential-issue.ts` — `runIdentityCredentialIssue`: read config, sign credential via `signIdentityCredential`, append to `issuedCredentials`, write config
- Create `identity-credential-verify.ts` — `runIdentityCredentialVerify`: read credential file, verify signature via `verifyIdentityCredential`, check revocation list, check expiry
- Create `identity-credential-revoke.ts` — `runIdentityCredentialRevoke`: add credential id to `revokedCredentialIds`, write config
- All commands: scope `workspace`, `--json` output, proper exit codes per failure modes table

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** All 4 command handlers implemented and exported; `build:check` passes; commands registered in identity module.

**Human review:** no

---

### Step 5. Register identity module in kernel config

**Goal:** Wire the identity module into `tools/kernel.config.ts`.

**Agent actions:**

- Add `identity` entry to `moduleLoaders` in `tools/kernel.config.ts`:
  ```ts
  identity: async () =>
    (await import("@warpgogol/site-kernel-handoff/identity-module")).createIdentityModule(),
  ```
- Verify `pnpm exec werkstatt run identity.bootstrap --help` resolves

**Validation:**

- `pnpm exec werkstatt run identity.bootstrap --help` shows command help

**Completion criterion:** `identity.bootstrap`, `identity.credential.issue`, `identity.credential.verify`, `identity.credential.revoke` are registered and discoverable via `site-kernel run`.

**Human review:** no

---

### Step 6. Studio Gate auth middleware

**Goal:** Add auth middleware to `packages/studio-gate/src/index.ts` that verifies VC tokens before dispatching MCP tools.

**Agent actions:**

- Create `packages/studio-gate/src/auth.ts` — `verifyAuthFromMeta(meta, werkstattRoot)`: reads `werkstatt.identity.json`, verifies credential, returns `StudioGateAuthResult`
- Modify `packages/studio-gate/src/index.ts` — add auth check before `CallToolRequestSchema` handler:
  - Read `authMode` from `werkstatt.identity.json` (default `permissive` if file missing)
  - In `permissive` mode: warn if no credential, still allow
  - In `enforced` mode: reject MCP calls without valid VC
  - Pass verified `actorId` to command execution via `_authActor` flag
- Update `packages/studio-gate/package.json` to add `@warpgogol/passport` dependency if not already present

**Validation:**

- `pnpm --filter @warpgogol/studio-gate build:check`

**Completion criterion:** Auth middleware reads `werkstatt.identity.json`, verifies VC in enforced mode, allows in permissive mode; `build:check` passes.

**Human review:** no

---

### Step 7. Mission actor field from auth context

**Goal:** Update `mission.open` to accept `actor` from auth context (Studio Gate) in addition to `--actor` CLI flag.

**Agent actions:**

- Modify `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — accept `actor` from `input.flags["_authActor"]` (set by Studio Gate middleware) with `--actor` flag as fallback, default `"agent"` if neither present
- Update `mission.close` and `mission.abort` similarly (they also have `actor` flag)
- No change to Bordbuch entry shape — `actor` is still a string, now it's a VC subject id or `"agent"` for CLI-only access

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Mission commands accept `actor` from auth context; `build:check` passes; existing CLI usage with `--actor` still works.

**Human review:** no

---

### Step 8. .env.example update

**Goal:** Add `PASSPORT_SIGNING_KEY` to workspace root `.env.example` per DNA-40.

**Agent actions:**

- Add to `.env.example`:
  ```
  # PASSPORT_SIGNING_KEY — 32-byte Ed25519 private key as hex string
  # How to obtain: run `pnpm exec werkstatt run identity.bootstrap --operator-name "Your Name" --domain warpgogol.com --json`
  PASSPORT_SIGNING_KEY=
  ```

**Validation:**

- `pnpm exec werkstatt run env.contract.validate` (if available)

**Completion criterion:** `.env.example` documents `PASSPORT_SIGNING_KEY` with `# How to obtain:` instruction.

**Human review:** no

---

### Step 9. Unit tests

**Goal:** Add unit tests for identity credential signing/verification and command handlers.

**Agent actions:**

- Create `packages/passport/src/identity-sign.test.ts` — test sign/verify round-trip for both credential types, test signature invalid on tampered subject
- Create `packages/os/site-kernel-handoff/src/identity/identity.test.ts` — test bootstrap creates config, issue adds credential, verify checks signature, revoke updates list
- Test permissive vs enforced mode in studio-gate auth

**Validation:**

- `pnpm --filter @warpgogol/passport test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/studio-gate test`

**Completion criterion:** All new tests pass; sign/verify round-trip verified; revocation and expiry checks verified.

**Human review:** no

---

### Step 10. Documentation sync

**Goal:** Update AGENTS.md files for all impacted packages.

**Agent actions:**

- Update `packages/passport/AGENTS.md` — add identity credential types and `identity-sign.ts` module to the entry point table
- Update `packages/studio-gate/AGENTS.md` — add auth middleware documentation, `authMode` field, VC verification flow
- Update `packages/os/site-kernel-handoff/AGENTS.md` — document `actor` field semantics change and new `identity/` module

**Validation:**

- Visual review of AGENTS.md files

**Completion criterion:** All three AGENTS.md files updated with new modules and semantics.

**Human review:** no

---

### Final Step. Review, fix, acceptance criteria verification, and stamp

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp RFC-0558 as implemented.

**Agent actions:**

- Run `fo-review` on all session code changes (`git diff <merge-base>...HEAD`)
- Run `fo-fix` if review has findings (max 3 iterations)
- Check off each acceptance criterion in RFC-0558 with inline `(evidence: <file:line>, <test-or-command>)` annotations
- Run `pnpm exec werkstatt run rfc.validate RFC-0558 --json` — must pass
- Run `pnpm --filter @warpgogol/passport build:check`
- Run `pnpm --filter @warpgogol/ontology build:check`
- Run `pnpm --filter @warpgogol/studio-gate build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0558 --implementation-commit <sha> --dry-run` then without `--dry-run`
- Commit the stamped RFC separately

**Validation:**

- `git status` clean
- `rfc.validate` passes
- All `build:check` pass
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria marked `[x]` with evidence; RFC status is `implemented` via `rfc.implement.stamp`; implementation and stamp commits are separate.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0558 --json`
- `pnpm --filter @warpgogol/passport build:check`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/studio-gate build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/passport test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/studio-gate test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0558` in the subject line
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Key loss | Step 1: `werkstatt.identity.json` stores only public key; private key in env var |
| VC token theft | Step 4: short expiry for delegation credentials; revocation list in config |
| Agent misinterpretation | Step 6: Studio Gate returns clear error messages with required credential format |
| Pilot complexity | Step 5: one command (`identity.bootstrap`) with `--domain` flag for setup |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-45 or DNA-56, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0558 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `signIdentityCredential` cannot be implemented without modifying `signCredential` in `sign.ts`, escalate — the RFC explicitly states `sign.ts` has no changes.
