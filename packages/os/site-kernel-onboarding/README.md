# @warpgogol/site-kernel-onboarding

New-app scaffold and readiness checklist for the Warpgogol Site OS (DNA-36, RFC-0029).

## Commands

| Command | Function | What it does |
| --- | --- | --- |
| `onboarding.scaffold` | `runOnboardingScaffold` | Generate a fully RFC-compliant app skeleton from canonical templates; generates an Ed25519 signing keypair and prints the private key once to stdout |
| `onboarding.checklist` | `runOnboardingChecklist` | Emit a human-readable readiness report covering business identity, system composition, growth vendor, passport keys, first content, and deploy readiness |

## Usage

```sh
# Scaffold a new app
pnpm exec site-kernel run onboarding.scaffold \
  --client="acme" \
  --domain="acme.de" \
  --biome="forest" \
  --constellation="Orion"

# Check readiness for an existing app
pnpm exec site-kernel run onboarding.checklist --site acme
```

`onboarding.scaffold` exits non-zero if the target directory already exists or any required flag is missing. Store the printed private key as a GitHub Actions secret (`INTEGRITY_PRIVATE_KEY_PEM`) immediately — it is not stored on disk.

`onboarding.checklist` never fails; it is informational only.

## Wiring

```typescript
import { createOnboardingModule } from "@warpgogol/site-kernel-onboarding";

export default defineKernelConfig({
  modules: [createOnboardingModule()],
});
```

## What the scaffold generates

The templates in `src/templates/` produce the full canonical app skeleton including:

- `astro.config.mjs`, `tsconfig.json`, `package.json`
- `src/content/`, `src/pages/`, `src/styles/` stubs
- `system.md` with biome, constellation, growth, and passport slots pre-wired
- `tools/kernel.config.ts` with all standard modules registered
- `.integrity/` directory structure

## Business layer wiring

After scaffolding, wire the `@warpgogol/pbp` layer to provide canonical business data via PBP entities (RFC-0471):

1. **Add dependency** (already in scaffolded `package.json`):

   ```json
   "@warpgogol/pbp": "workspace:*"
   ```

2. **Wire the collection** in `src/content.config.ts`:

   ```ts
   import { pbpCollections } from "@warpgogol/pbp/astro";
   export const collections = {
     ...pbpCollections,
     // other collections...
   };
   ```

3. **Create PBP entity files** in `src/content/business-profile/<default-lang>/`:
   - `business.md` — Business entity (legal name, description, jurisdiction)
   - `legal-identity.md` — LegalIdentity entity (company registration, tax)
   - `brand.md` — Brand entity (visual identity, tagline)
   - `contact-points/<slug>.md` — ContactPoint entities (email, phone, channels)
   - `places/<slug>.md` — Place entities (address, service area)
   - `offerings/<slug>.md` — Offering entities (pricing, guarantees)
   - `products/<slug>.md` — Product entities

4. **Use in components**:
   ```ts
   import { getPbpBusiness, getPbpOfferings } from "@warpgogol/pbp/loaders";
   const business = await getPbpBusiness("de");
   const offerings = await getPbpOfferings("de");
   ```

**See also:** `packages/pbp/AGENTS.md` for full schema reference and usage patterns.

## Validation

```sh
pnpm --filter @warpgogol/site-kernel-onboarding build:check
```
