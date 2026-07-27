# `@gogol/passport` — Agent Guide

Cosmic Passport — build-time W3C Verifiable Credential capturing provenance, composition, and the Nebula Score (DNA-31, DNA-34, RFC-0028).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@gogol/passport` | `src/index.ts` | Barrel: all exports |
| `@gogol/passport/schema` | `src/schema.ts` | `PassportSchema`, `PassportPublicKeyFileSchema` — Zod schemas |
| `@gogol/passport/sign` | `src/sign.ts` | `signPassport(passport, privateKeyPem)` — Ed25519 signing |
| `@gogol/passport/emit` | `src/emit.ts` | `emitPassport(passport, distDir)` — writes to `dist/.well-known/cosmic-passport.json` |
| `@gogol/passport/verify` | `src/verify.ts` | `verifyPassport(raw, publicKeyPem)` |
| `@gogol/passport/key-rotate` | `src/key-rotate.ts` | `rotateKey()` — generates new Ed25519 keypair |
| `@gogol/passport/data` | `src/data.ts` | `loadPassportData(inputs)` — assembles passport payload from OS inputs |

## Rules for AI agents

- The passport is emitted to `dist/.well-known/cosmic-passport.json` and is publicly accessible.
- Signing uses `@noble/ed25519` — a zero-dependency, audited Ed25519 implementation.
- Private key is stored as a GitHub Actions secret (`INTEGRITY_PRIVATE_KEY_PEM`), never committed.
- Public key is committed to the app's repository.

## Relationship to site-kernel-integrity

| Aspect | site-kernel-integrity | passport |
| --- | --- | --- |
| Purpose | Internal source code integrity tracking | Public-facing site self-description |
| Audience | Developers, CI pipeline | Clients, auditors, SEO, visitors |
| Content | File hashes, build artifacts | Provenance + cosmic composition + Nebula Score |
| Standard | Custom manifest format | W3C Verifiable Credential |
| Location | `.integrity/` (internal) | `.well-known/cosmic-passport.json` (public) |

## Build pipeline

```typescript
import { loadPassportData } from "@gogol/passport/data";
import { signPassport } from "@gogol/passport/sign";
import { emitPassport } from "@gogol/passport/emit";

const passport = loadPassportData({ starMap, nebulaScore, buildMeta });
const signed = signPassport(passport, process.env.INTEGRITY_PRIVATE_KEY_PEM);
await emitPassport(signed, "./dist");
```

## Validation

```sh
pnpm --filter @gogol/passport build:check
```
