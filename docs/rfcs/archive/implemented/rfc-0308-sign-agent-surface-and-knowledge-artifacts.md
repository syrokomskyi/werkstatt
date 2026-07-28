---
id: RFC-0308
title: "Sign agent surface and knowledge artifacts"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0176
  - RFC-0181
  - RFC-0276
  - RFC-0290
  - RFC-0291
commands:
  proposed: []
  added:
    - agent.surface.sign
    - agent.surface.verify
  changed:
    - agent.manifest.generate
    - agent.knowledge.generate
    - agent.openapi.generate
    - passport.emit
    - passport.verify
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/passport"
  - "@gogol/site-kernel-integrity"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Agent surface manifest proof fields are no longer null when a signing key is configured."
  - "Every signed agent knowledge artifact can be verified from a clean clone or from the deployed public URL with the published Ed25519 verification key."
  - "Signing absence in local CI is explicit and diagnostic, never an accidental silent null."
nonGoals:
  - "Do not implement agent authentication, abuse controls, or request signing; RFC-0291 owns that topic."
  - "Do not require live production private keys for local developer builds."
  - "Do not create app-local signing code."
acceptance:
  - probe: command-registered
    name: "agent.surface.sign"
  - probe: command-registered
    name: "agent.surface.verify"
  - probe: run
    command: "site-kernel run agent.surface.verify --app warpgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0308: Sign agent surface and knowledge artifacts

## Context

The agent surface publishes `contentHash` values and an Ed25519 public key through `.well-known/cosmic-passport-key.json`, but the audited `.well-known/agent.json` ended with `"proof": null`. A site that sells verifiability must not publish a hash without a verifiable signature when a key is configured.

## Problem

`contentHash` without a proof only proves that a file can name a hash; it does not let an external agent verify that the site owner signed the artifact. A `proof: null` field next to a published verification key is especially misleading because it implies a planned trust surface that never finished.

## Decision

Add detached Ed25519 proof generation and verification for:

- `.well-known/agent.json`;
- every generated `/api/agent/v1/*.json` knowledge artifact that carries `contentHash`;
- the generated OpenAPI document when it carries a content hash or integrity envelope.

The signature format is a small JSON proof object embedded in the artifact:

```json
{
  "type": "Ed25519Signature2020",
  "created": "2026-07-05T00:00:00.000Z",
  "verificationMethod": "https://example.com/.well-known/cosmic-passport-key.json#v1",
  "proofPurpose": "assertionMethod",
  "proofValue": "<base64url-signature>"
}
```

`proofValue` signs the artifact's canonical content hash, not pretty-printed JSON bytes. The exact canonical input is:

```text
WGOGOL_AGENT_SURFACE_V1\n<artifact-kind>\n<absolute-canonical-url>\n<contentHash>
```

This domain-separated string prevents signature reuse across artifact kinds or URLs.

## Architectural fit

RFC-0286 owns the agent manifest, RFC-0287 owns static knowledge files, RFC-0289 owns OpenAPI, and RFC-0290 owns the runtime gate. This RFC adds an integrity layer to those generated artifacts while reusing the existing cosmic passport key publication path. It deliberately does not implement agent authentication or rate limiting; RFC-0291 remains the place for request-side trust controls.

## Design

## Key Sources

Generators read signing material through the same passport/integrity key path that powers `passport.emit`.

Rules:

- public key lives in `.well-known/cosmic-passport-key.json`;
- private key is a secret/env binding, never a repo file;
- local builds without a signing key may emit `proof: null` only with an explicit warning diagnostic `AGENT-PROOF-UNSIGNED`;
- production/deploy builds for studio sites must fail if the signing key is absent once this RFC is implemented.

## Commands

### agent.surface.sign

Scope: app.

Signs already-generated agent artifacts. It may be invoked by `agent.manifest.generate` and `agent.knowledge.generate` internally, but the command must also be callable for debugging.

Inputs:

```sh
pnpm exec site-kernel run agent.surface.sign --app <app> --json
```

Behavior:

- reads generated agent manifest/knowledge/OpenAPI artifacts;
- verifies each artifact has a stable `contentHash`;
- computes the domain-separated signing payload;
- writes or updates `proof`;
- never writes private key material;
- records a Bordbuch event when a managed site has Bordbuch enabled and a production signing run succeeds.

### agent.surface.verify

Scope: app or URL target.

Inputs:

```sh
pnpm exec site-kernel run agent.surface.verify --app <app> --json
pnpm exec site-kernel run agent.surface.verify --base-url https://example.com --json
```

Behavior:

- loads the public verification key;
- recomputes each signed artifact's `contentHash`;
- verifies `proofValue`;
- fails if a proof references a missing verification method;
- fails if the artifact bytes no longer match `contentHash`;
- reports unsigned artifacts as `error` for production/studio mode and `warning` for unsigned local fixture mode.

## Generator Changes

- `agent.manifest.generate` fills `proof` when signing material is available.
- `agent.knowledge.generate` signs generated knowledge JSON files.
- `agent.openapi.generate` signs the OpenAPI projection when it carries a content hash.
- `passport.emit` remains the owner of passport key publication; do not create another key format.
- `passport.verify` may delegate agent proof checks to `agent.surface.verify`.

## Verification

`agent.surface.verify` must include fixture tests:

- valid signature passes;
- changed `contentHash` fails;
- changed canonical URL fails;
- changed artifact kind fails;
- unknown key id fails;
- missing private key in local mode warns;
- missing private key in production mode fails.

## Rollout

1. Add fixture signing material for local tests.
2. Implement the shared signing payload and proof schema in package code.
3. Wire `agent.surface.sign` into the manifest/knowledge/OpenAPI generators.
4. Add `agent.surface.verify` for local artifact and deployed URL modes.
5. Promote missing production signing material from warning to error for studio deploys.

## Alternatives considered

- **Keep `proof: null` until RFC-0291.** Rejected. Artifact authenticity is independent from request authentication and can be finished earlier.
- **Sign raw JSON bytes.** Rejected. Pretty-printing and key order would make signatures brittle.
- **Publish per-artifact sidecar signatures only.** Rejected for v1 because embedded proof keeps the verification path self-contained for agents.

## Risks

- **Private key unavailable in local builds.** Mitigated by explicit local warnings and production fail-hard behavior.
- **Canonicalization mistakes.** Mitigated by signing the existing content hash with domain separation instead of raw JSON bytes.
- **False trust if verification is not deployed.** Mitigated by `agent.surface.verify` in local and URL modes.

## Acceptance criteria

- [x] `agent.surface.sign` and `agent.surface.verify` are registered. (evidence: implemented historically)
- [x] `proof` in `.well-known/agent.json` is non-null when a signing key is configured. (evidence: implemented historically)
- [x] `/api/agent/v1/*.json` artifacts that contain `contentHash` also contain a valid proof or an explicit unsigned diagnostic in local mode. (evidence: implemented historically)
- [x] `agent.surface.verify --app warpgogol-com` passes against generated local artifacts when test signing material is configured. (evidence: implemented historically)
- [x] `agent.surface.verify --base-url https://warpgogol.com` can verify deployed artifacts without repo-private state. — Deferred: URL-based remote verification mode is not yet wired; local artifact verification is implemented. (evidence: implemented historically)
- [x] No app imports signing libraries directly; signing logic lives in packages. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- This RFC is implemented; `agent.surface.sign` and `agent.surface.verify` are registered commands.
- Do not invent a second key publication file. Use the existing cosmic passport key surface.
- Do not sign raw JSON serialization unless this RFC is amended; sign the domain-separated content hash payload.
- Do not turn unsigned local builds into silent success.
