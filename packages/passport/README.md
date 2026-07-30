# @warpgogol/passport

Cosmic Passport — build-time W3C Verifiable Credential that captures provenance, composition, and the Nebula Score for each deployed app. Emitted to `dist/.well-known/cosmic-passport.json` (DNA-31, DNA-34, RFC-0028).

## Purpose

The Cosmic Passport is a signed, machine-readable document that proves _what_ was deployed, _when_, by _whom_, and at what quality level. It bundles:

- Build provenance (timestamp, git ref, builder identity)
- Cosmic composition (constellation, star map)
- Nebula Score (4-pillar quality metric)
- Ed25519 signature verifiable against the app's public key

## Entry points

| Import | What it provides |
| --- | --- |
| `@warpgogol/passport` | Barrel — all exports |
| `@warpgogol/passport/schema` | `CosmicPassportSchema`, `PassportClaim` Zod schemas |
| `@warpgogol/passport/sign` | `signPassport(passport, privateKeyPem)`, `generateKeypair()` — Ed25519 signing and key generation |
| `@warpgogol/passport/emit` | `emitPassport(passport, distDir)` — writes to `dist/.well-known/cosmic-passport.json` |
| `@warpgogol/passport/verify` | `verifyPassport(raw, publicKeyPem)` |
| `@warpgogol/passport/key-rotate` | `rotateSigningKey()` — generates a new Ed25519 keypair |
| `@warpgogol/passport/data` | `buildPassportData(inputs)` — assembles the passport payload from OS inputs |

## Typical build pipeline

```typescript
import { buildPassportData } from "@warpgogol/passport/data";
import { signPassport } from "@warpgogol/passport/sign";
import { emitPassport } from "@warpgogol/passport/emit";

const passport = buildPassportData({ starMap, nebulaScore, buildMeta });
const signed   = signPassport(passport, process.env.INTEGRITY_PRIVATE_KEY_PEM!);
await emitPassport(signed, "./dist");
```

## Verification

```typescript
import { verifyPassport } from "@warpgogol/passport/verify";

const result = await verifyPassport(raw, publicKeyPem);
// result.valid === true if signature is intact
```

## Key rotation

```typescript
import { rotateSigningKey } from "@warpgogol/passport/key-rotate";

const { publicKeyPem, privateKeyPem } = rotateSigningKey();
// Store privateKeyPem as a GitHub Actions secret.
// Commit publicKeyPem to the app's repository.
```

## Output location

The passport is emitted to `dist/.well-known/cosmic-passport.json` and is publicly accessible at `https://<domain>/.well-known/cosmic-passport.json`.

## Relationship to site-kernel-integrity

`@warpgogol/passport` and `@warpgogol/site-kernel-integrity` serve different purposes:

| Aspect | site-kernel-integrity | passport |
| --- | --- | --- |
| **Purpose** | Internal source code integrity tracking | Public-facing site self-description |
| **Audience** | Developers, CI pipeline | Clients, auditors, SEO, visitors |
| **Content** | File hashes, build artifacts | Provenance + cosmic composition + Nebula Score |
| **Standard** | Custom manifest format | W3C Verifiable Credential (Ed25519Signature2020) |
| **Location** | `.integrity/` (internal) | `.well-known/cosmic-passport.json` (public) |
| **Metaphor** | Technical infrastructure | Cosmic branding layer |

Integrity protects the codebase; passport describes the deployed site. They complement, not duplicate, each other.

## Dependencies

Signing uses `@noble/ed25519` — a zero-dependency, audited Ed25519 implementation.

## Validation

```sh
pnpm --filter @warpgogol/passport build:check
```
