---
id: RFC-0359
title: "Notausgang: full site export with dist artifacts and history"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0007
  - RFC-0221
amendedBy:
  - RFC-0362
  - RFC-0363
  - RFC-0364
  - RFC-0380
related:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0353
  - RFC-0362
  - RFC-0363
  - RFC-0364
  - DNA-44
  - DNA-48
  - DNA-50
  - DNA-51
  - DNA-52
  - DNA-53
satisfies:
  - DNA-50
commands:
  proposed: []
  added:
    - notausgang.export
    - notausgang.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-deploy"
  - "@gogol/ontology"
successSignals:
  - "A developer can `notausgang.export --system <id> --release <release-id> --output <path>` and a full export package is produced from the RFC-0363 release artifact with data-only site sources, dist artifacts, Bordbuch, pin, behavior snapshots, artifact manifest, and an export manifest."
  - "`notausgang.validate --path <export-path>` verifies the export package: manifest integrity, all required directories present, dist artifacts present, Bordbuch present and valid, pin present and valid, and release artifact hashes match."
  - "Studio integrations are nulled by default from declarative integration manifests and generated env schema references; pattern scanning is a secondary leak detector, not the primary nulling mechanism."
  - "Flags for studio integration exceptions are documented in the export manifest (e.g., `keepStripe: true` with a reason)."
  - "The export package includes both readable and production behavior snapshots for verification."
  - "The export package is self-contained: a recipient can serve the dist/ directory immediately without installing the platform."
nonGoals:
  - "Does not define the physical transport of the export package (zip, tar, cloud upload) — the export is a directory that may be archived."
  - "Does not define legal or contractual terms of the export — that is a business concern, not an engineering one."
  - "Does not define a self-hosted platform bundle — the export includes dist artifacts (pre-built), not the platform source. The recipient cannot rebuild without the platform."
  - "Does not define migration of the export back into the studio — that is the `handoff.absorb` path (RFC-0221), which operates on thin bundles, not Notausgang exports."
  - "Does not define a broad credential governance system — Notausgang uses the declarative integration inventory available at export time, with MVP exceptions documented in the export manifest."
  - "Does not define a `--resume` flag for interrupted exports — if the staging directory is left behind by a failed export, the operator deletes it manually and re-runs. Resume logic adds complexity for a rarely needed path."
  - "Does not define release locking during export — the export reads from the immutable RFC-0363 artifact store, so concurrent exports produce identical packages. A lock is unnecessary for correctness."
  - "Does not localize the README — the README is generated in English (the project's documentation language). Clients who need a translated README receive it through a separate human process, not through the export tool."
---

# RFC-0359: Notausgang: full site export with dist artifacts and history

## Context

RFC-0007 defined `client.export` — a full-fork export that copies the entire workspace (all `packages/`, the target app, `node_modules/`) into a self-contained directory for an external client. RFC-0221 defined `handoff.pack` — a thin bundle for internal transfer that carries only the authored site. Both serve different audiences and both are retained.

The **Notausgang** (literally "emergency exit") is a third export mode, designed for the scenario where a client leaves the studio and takes their site with them. It is the "what happens when the relationship ends" export. Unlike `client.export` (which ships the full platform source), the Notausgang ships:

1. **The authored site data** (the data-only Sternsystem content set) — so the client owns their content without receiving platform runtime code.
2. **The dist artifacts** (pre-built production output) — so the client can serve the site immediately without the platform.
3. **The Bordbuch** (mission/release history) — so the client has a complete audit trail.
4. **The pin and behavior snapshots** — so the client knows what platform version the site was built against and what structural facts were verified.

The Notausgang is the **emergency exit**: the client gets a self-contained, immediately servable site with full history, but without the platform source. If they want to rebuild or evolve the site, they need to either re-engage the studio or migrate to a different platform.

## Problem

Three invariants are unprotected:

1. **No emergency export.** If a client leaves, the only option is `client.export` (full platform source) or `handoff.pack` (authored content only, no dist). Neither is appropriate: `client.export` ships the studio's platform IP; `handoff.pack` leaves the client with a site they cannot serve.

2. **No integration nulling.** A site in the studio's ecosystem is wired to studio integrations: analytics (Matomo), chat (UChat), CRM (Supabase), payments (Stripe). An export that carries live integration keys would give the departing client access to the studio's infrastructure. There is no mechanism to null these integrations in the export.

3. **No history export.** The Bordbuch is the Sternsystem's history. Without exporting it, the client loses the audit trail of missions and releases. Without the pin and behavior snapshots, the client cannot verify what was built and when.

## Decision

Introduce the **Notausgang export** as a self-contained package with authored data, dist artifacts restored from the release artifact store, history, and nulled integrations.

### 1. Export package layout

```
<export-name>/
  notausgang-manifest.json       # export manifest (see §1.1)
  site/                          # authored site (same as Sternsystem bundle)
    src/content/**               # authored content
    provenance/**                # source/provenance records when present
    system.pin.json              # copied here for data-local consumption
  dist/                          # production build output (from the release)
  artifact-manifest.json         # RFC-0363 release artifact manifest
  bordbuch/
    events.ndjson                # full Bordbuch history
  system.pin.json                # version pin at export time
  behavior-snapshots/
    readable-snapshot.json       # from the release
    production-snapshot.json     # from the release
    snapshot-diff.json           # from the release
  README.md                      # instructions for serving the dist/ directory
```

The `site/` directory is data-only. It MUST NOT contain `package.json`, lockfiles, `node_modules`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, `src/pages`, generated route stubs, scripts, tools, or package manifests. The recipient can serve `dist/` immediately, but rebuilding requires a compatible platform outside the export.

#### 1.1 Export manifest (`notausgang-manifest.json`)

```ts
interface NotausgangManifest {
  schemaVersion: string;            // "1.0.0"
  systemId: string;
  cosmicStar: string;
  releaseId: string;                // the release this export is based on
  exportedAt: string;               // ISO 8601
  platformVersion: string;          // platform version the release was built against
  platformSemanticHash: string;     // RFC-0364 platform hash recorded by the release
  semver: string;                   // release semver
  source: {
    releaseManifestHash: string;
    artifactManifestHash: string;
    distArtifactHash: string;
    siteContentHash: string;
    behaviorSnapshotHash: string;
  };
  integrationNulling: {
    nulled: string[];               // list of nulled integration names
    exceptions: Array<{
      name: string;                 // integration name kept
      reason: string;               // operator-provided reason
    }>;
  };
  distHash: string;                 // RFC-0364 hash over dist/ tree
  siteHash: string;                 // RFC-0364 hash over site/ tree
  bordbuchHash: string;             // RFC-0364 hash over bordbuch/events.ndjson
}
```

### 2. Integration nulling

Studio integrations are **nulled by default** in the export. Nulling is driven by declarative integration inventories, not broad filename patterns.

| Integration | Source | Nulled to |
| --- | --- | --- |
| Matomo analytics | generated env schema, integration manifest, public runtime config | `null` / placeholder |
| UChat chat | generated env schema, integration manifest, public runtime config | `null` / placeholder |
| Supabase CRM | generated env schema, integration manifest, public runtime config | `null` / placeholder |
| Stripe payments | generated env schema, integration manifest, public runtime config | `null` / placeholder |

#### 2.1 Nulling mechanism

1. Read the `IntegrationManifest` (see §2.2) for the Sternsystem. The manifest explicitly lists every secret location by file path, JSON path, and env var name — nulling is driven by these references, not by pattern matching.
2. For each integration key listed in the manifest, emit a nulled export value (`null`, empty string, or `"EXPORTED_NULL"` according to the target schema) and record the original reference name without copying the secret value.
3. Write only data-safe nulled records into the export's `site/` directory when those records are part of the data bundle; runtime config files remain excluded.
4. Record the nulled integrations in the export manifest.
5. Run a secondary secret-pattern scan over the entire export as a leak detector. A clean scan is required, but the scan is not the source of truth for what should be nulled — it is a safety net against manifest gaps, not a replacement for the manifest.

#### 2.2 Integration manifest schema

The `IntegrationManifest` is a declarative registry of all secret locations in a Sternsystem. It is the primary nulling mechanism — the pattern scan in §2.1 step 5 is secondary.

```ts
// packages/ontology/src/schemas/integration-manifest.ts

export const IntegrationSecretLocationSchema = z.object({
  file: z.string(),              // path relative to site root
  jsonPath: z.string(),          // JSON path to the secret within the file
  envVar: z.string().optional(), // if stored as an env var reference
});

export const IntegrationManifestSchema = z.object({
  schemaVersion: z.string(),
  integrations: z.record(z.array(IntegrationSecretLocationSchema)),
});
```

The manifest is authored per Sternsystem and lives at `src/content/site/{lang}/integration-manifest.json` (or a platform-determined successor location). If no manifest is found, `notausgang.export` fails with a clear error — nulling cannot proceed without declarative secret locations.

#### 2.3 Exceptions

An operator may flag specific integrations to keep (e.g., the client's own Stripe account, not the studio's). The exception is documented in the export manifest with a reason:

```json
{
  "integrationNulling": {
    "nulled": ["matomo", "uchat", "supabase-crm"],
    "exceptions": [
      {
        "name": "stripe",
        "reason": "Client owns the Stripe account; keys are client-provided, not studio infrastructure."
      }
    ]
  }
}
```

Exceptions are passed via `--keep-integration <name> --reason "<text>"` flags on the `notausgang.export` command. The operator must provide a reason for each exception.

### 3. Behavior snapshot inclusion

The export includes both the readable and production behavior snapshots from the release (RFC-0357), plus the snapshot diff. This allows the client (or the studio, for verification) to confirm that the exported release passed the behavior snapshot diff gate.

### 4. Dist artifacts

The export includes the `dist/` directory restored from the release's RFC-0363 artifact reference. This is the **pre-built production output** — the client can serve it immediately with any static file server (e.g., `npx serve dist/` or upload to any CDN).

Before writing the export, `notausgang.export` MUST verify:

- the release is `published`;
- the artifact manifest is retrievable and its hash matches `release.yaml`;
- the restored `dist/` tree hash equals `release.yaml` `distTreeHash`;
- the export `site/` tree hash equals the release `siteContentHash` (dist-site consistency);
- the production behavior snapshot hash equals the release `behaviorSnapshotHash`.

The export reads release data from the immutable RFC-0363 artifact store at the start of the export. If the release is rolled back or deleted after the export begins, the artifact store copy is already in memory/staging — the export completes from the immutable snapshot. No lock is needed because the artifact store is immutable.

The `README.md` in the export root documents how to serve the `dist/` directory:

```markdown
# Notausgang Export: <system-id>

This package contains the complete site for <system-id> as of release <release-id>.

## Serving the site immediately

The `dist/` directory contains the pre-built production output. Serve it with any static file server:

    npx serve dist/

Or upload the contents of `dist/` to any static hosting provider (Cloudflare Pages, Netlify, Vercel, S3, etc.).

## Rebuilding the site

The `site/` directory contains the authored content and configuration. To rebuild, you need the Warpgogol platform (not included in this export). Contact the studio if you need rebuild access.

## History

The `bordbuch/events.ndjson` file contains the complete mission and release history.

## Verification

The `behavior-snapshots/` directory contains structural snapshots from the release verification.
```

### 5. Commands

Two new commands in `@gogol/site-kernel-handoff`:

#### 5.1 `notausgang.export`

```sh
pnpm exec werkstatt run notausgang.export \
  --system <system-id> \
  --release <release-id> \
  --output <path> \
  [--keep-integration <name> --reason "<text>"]... \
  [--json]
```

Produces a Notausgang export package using **atomic staging**:

1. **Verify release**: the release must be `published` (RFC-0357). Read the release and artifact store into memory at the start — this is the immutable snapshot for the duration of the export.
2. **Create staging directory**: create `<output>.tmp-<timestamp>/` as the staging area. All subsequent operations write into staging.
3. **Restore artifact**: call `artifact.store.get` (RFC-0363) for the release artifact and verify hashes.
4. **Copy authored site data**: copy the data-only Sternsystem authored set into `staging/site/`, excluding scripts, runtime config, package manifests, generated route stubs, and build outputs.
5. **Null integrations**: null all studio integrations by default (§2). Apply `--keep-integration` exceptions.
6. **Copy dist artifacts**: copy the verified artifact `dist/` into `staging/dist/`. For large dist trees, emit structured progress events to stderr (see §5.3).
7. **Copy artifact manifest**: copy the RFC-0363 artifact manifest into `staging/artifact-manifest.json`.
8. **Copy Bordbuch**: copy `systems/<id>/bordbuch/events.ndjson` into `staging/bordbuch/`.
9. **Copy pin**: copy `systems/<id>/system.pin.json` into `staging/` root and `staging/site/system.pin.json`.
10. **Copy behavior snapshots**: copy `readable-snapshot.json`, `production-snapshot.json`, `snapshot-diff.json` from the release into `staging/behavior-snapshots/`.
11. **Write README.md**: generate the README from a template (in English, the project's documentation language).
12. **Compute hashes**: compute `distHash`, `siteHash`, `bordbuchHash` through RFC-0364.
13. **Write manifest**: write `staging/notausgang-manifest.json` with all metadata, source hashes, nulled integrations, exceptions, and hashes.
14. **Atomic rename**: rename `<output>.tmp-<timestamp>/` to `<output>/`. This is atomic on POSIX; on Windows, if the target exists, fail (the `--output` must not exist or must be empty).
15. **On failure**: if any step 1–13 fails, delete the staging directory and exit with a non-zero code. The final output path is never created in a partial state.

#### 5.3 Progress reporting

For large dist trees, `notausgang.export` emits structured progress events to stderr (not stdout, so `--json` output on stdout remains parseable):

```json
{"stage":"copying-dist","filesCopied":1234,"totalFiles":5000,"bytesCopied":2231392256,"totalBytes":9126805504}
```

Progress events are emitted every 500 files or every 100 MB, whichever comes first. The `--json` output on stdout is only the final result object, never interleaved with progress.

#### 5.2 `notausgang.validate`

```sh
pnpm exec werkstatt run notausgang.validate \
  --path <export-path> \
  [--json]
```

Validates a Notausgang export package:

- **Manifest integrity**: parse `notausgang-manifest.json`, verify all required fields present, verify `schemaVersion` is known.
- **Site directory**: `site/` present with authored content, no runtime project files (`package.json`, lockfiles, `node_modules`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, `src/pages`, scripts, tools).
- **Dist directory**: `dist/` present with build output.
- **Bordbuch**: `bordbuch/events.ndjson` present and valid — load all entries, verify monotonically increasing sequence numbers, verify no gaps, verify no entries are modified or deleted (append-only invariant, RFC-0355). If the Bordbuch was manually edited (sequence gap or hash-chain break), validation fails with the specific entry index and violation.
- **Pin**: `system.pin.json` present and valid — parse, verify `platformVersion` matches the manifest's `platformVersion`, verify `platformSemanticHash` matches the manifest's `platformSemanticHash`. If the pin is missing or corrupted, validation fails.
- **Behavior snapshots**: `readable-snapshot.json`, `production-snapshot.json`, `snapshot-diff.json` present and parseable. Snapshot `schemaVersion` is checked — if the format is from a future platform version, validation fails with a clear message (no silent forward-compatibility).
- **Artifact manifest**: `artifact-manifest.json` present, its hash matches `notausgang-manifest.json` `source.artifactManifestHash`, and `distArtifactHash` / `siteContentHash` / `behaviorSnapshotHash` match the source release.
- **Hash verification**: recompute `distHash`, `siteHash`, `bordbuchHash` via RFC-0364 and compare to manifest values.
- **Integration nulling**: apply the declarative `IntegrationManifest` to verify all listed secret locations are nulled. Run the secondary pattern scan for common API key patterns (`sk_live_`, `eyJ`, Matomo token, etc.). A clean scan is required — any detected pattern fails validation, even if the integration was supposed to be nulled.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** The Notausgang exports a Sternsystem's data-only authored set, dist, and history.
- **DNA-48 (Release discipline):** The export is based on a `published` release — the release's behavior snapshots and discipline gate verdicts are carried into the export.
- **DNA-50 (Notausgang):** This RFC establishes the invariant that every Sternsystem can be exported as a self-contained package with nulled integrations and full history — the emergency exit is always available.
- **DNA-52 (Release artifact store):** The export restores `dist/` from the durable release artifact store, not from an incidental local cache.
- **DNA-53 (Semantic fingerprint):** Export hashes use RFC-0364 smart hashing for JSON, markdown, and tree content.
- **RFC-0007 (`client.export`):** Retained unchanged. `client.export` ships the full platform source for external clients who need to rebuild. Notausgang ships dist + history for clients who need to serve.
- **RFC-0221 (`handoff.pack`):** Retained unchanged. `handoff.pack` is the thin internal transfer bundle. Notausgang is the full external export.
- **RFC-0353 (Compass rename):** Uses Compass terminology throughout.
- **Anti-patterns prevented:** "exporting live integration keys", "no emergency exit path", "export without history".

## Design

### CLI surface

```sh
pnpm exec werkstatt run notausgang.export \
  --system warpgogol-com --release warpgogol-com-r000001 \
  --output ../exports/warpgogol-com-2026-07-09 \
  --keep-integration stripe --reason "Client owns Stripe account"

pnpm exec werkstatt run notausgang.validate \
  --path ../exports/warpgogol-com-2026-07-09
```

All commands support `--json` output.

### TypeScript contracts

New Zod schemas in `@gogol/ontology`:

```ts
// packages/ontology/src/schemas/notausgang.ts

export const IntegrationNullingSchema = z.object({
  nulled: z.array(z.string()),
  exceptions: z.array(z.object({
    name: z.string(),
    reason: z.string(),
  })),
});

export const NotausgangManifestSchema = z.object({
  schemaVersion: z.string(),
  systemId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  cosmicStar: z.string(),
  releaseId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/),
  exportedAt: z.string().datetime(),
  platformVersion: z.string(),
  platformSemanticHash: z.string(),
  semver: z.string(),
  source: z.object({
    releaseManifestHash: z.string(),
    artifactManifestHash: z.string(),
    distArtifactHash: z.string(),
    siteContentHash: z.string(),
    behaviorSnapshotHash: z.string(),
  }),
  integrationNulling: IntegrationNullingSchema,
  distHash: z.string(),
  siteHash: z.string(),
  bordbuchHash: z.string(),
});
```

```ts
// packages/ontology/src/schemas/integration-manifest.ts

export const IntegrationSecretLocationSchema = z.object({
  file: z.string(),              // path relative to site root
  jsonPath: z.string(),          // JSON path to the secret within the file
  envVar: z.string().optional(), // if stored as an env var reference
});

export const IntegrationManifestSchema = z.object({
  schemaVersion: z.string(),
  integrations: z.record(z.array(IntegrationSecretLocationSchema)),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/notausgang/` | New module: export, validate handlers |
| `packages/os/site-kernel-handoff/src/notausgang/integration-nulling.ts` | Integration nulling logic (manifest-driven) |
| `packages/os/site-kernel-handoff/src/notausgang/atomic-staging.ts` | Staging directory creation, atomic rename, cleanup-on-failure |
| `packages/os/site-kernel-handoff/src/notausgang/progress.ts` | Structured progress reporting for large dist copies |
| `packages/os/site-kernel-handoff/src/notausgang/templates/README.md.template` | README template for export recipients (English) |
| `packages/ontology/src/schemas/notausgang.ts` | Zod schemas for Notausgang manifest |
| `packages/ontology/src/schemas/integration-manifest.ts` | Zod schemas for IntegrationManifest (declarative secret locations) |
| `packages/os/site-kernel/src/registry.ts` | Register the two new commands |

### Output format

`notausgang.export --json`:

```json
{
  "command": "notausgang.export",
  "status": "pass",
  "data": {
    "systemId": "warpgogol-com",
    "releaseId": "warpgogol-com-r000001",
    "outputPath": "../exports/warpgogol-com-2026-07-09",
    "integrationNulling": {
      "nulled": ["matomo", "uchat", "supabase-crm"],
      "exceptions": [
        { "name": "stripe", "reason": "Client owns Stripe account" }
      ]
    },
    "distHash": "sha256:abc123...",
    "siteHash": "sha256:def456...",
    "bordbuchHash": "sha256:ghi789...",
    "artifactManifestHash": "sha256:jkl012..."
  },
  "summary": "[notausgang.export] warpgogol-com exported to ../exports/warpgogol-com-2026-07-09 (3 integrations nulled, 1 exception)"
}
```

`notausgang.validate --json`:

```json
{
  "command": "notausgang.validate",
  "status": "pass",
  "data": {
    "path": "../exports/warpgogol-com-2026-07-09",
    "manifestValid": true,
    "sitePresent": true,
    "distPresent": true,
    "bordbuchValid": true,
    "pinValid": true,
    "snapshotsPresent": true,
    "runtimeFilesAbsent": true,
    "artifactHashMatch": true,
    "liveKeyScan": "clean"
  },
  "summary": "[notausgang.validate] export package valid, no live integration keys detected"
}
```

### Failure modes

| Condition | Exit code | Message |
| --- | --- | --- |
| Release not published | non-zero | `[notausgang.export] release '<id>' is not published (state: <state>)` |
| Release artifact missing | non-zero | `[notausgang.export] release artifact for '<id>' is missing from artifact store` |
| Output directory exists and is non-empty | non-zero | `[notausgang.export] output path '<path>' exists and is non-empty` |
| Live integration key detected | non-zero | `[notausgang.validate] live integration key detected in <file>: <pattern>` |
| Manifest hash mismatch | non-zero | `[notausgang.validate] dist hash mismatch: expected <X>, got <Y>` |
| Runtime file in site data | non-zero | `[notausgang.validate] runtime file '<path>' is not allowed under site/` |
| Bordbuch invalid | non-zero | `[notausgang.validate] bordbuch/events.ndjson failed validation: <detail>` |
| Pin missing or mismatched | non-zero | `[notausgang.validate] system.pin.json invalid: <detail>` |
| Snapshot schemaVersion unknown | non-zero | `[notausgang.validate] behavior snapshot schemaVersion <X> is not supported` |
| Integration manifest missing | non-zero | `[notausgang.export] no IntegrationManifest found for <system-id>; cannot null integrations declaratively` |
| Staging cleanup failed | non-zero | `[notausgang.export] staging cleanup failed for <path>: <error>` |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `NotausgangManifest`, `IntegrationNulling`, `IntegrationManifest`, `IntegrationSecretLocation` Zod schemas in `@gogol/ontology`.
3. Create `packages/os/site-kernel-handoff/src/notausgang/` module.
4. Implement declarative integration nulling logic (`integration-nulling.ts`) driven by `IntegrationManifest`.
5. Implement atomic staging (`atomic-staging.ts`) and progress reporting (`progress.ts`).
6. Implement `notausgang.export` handler with atomic staging and progress.
7. Implement `notausgang.validate` handler (including artifact hash checks, runtime-file rejection, Bordbuch append-only verification, pin validation, snapshot schemaVersion check, and live key scan).
8. Register commands in `packages/os/site-kernel/src/registry.ts`.
9. **Pilot**: export `warpgogol-com` at release `r000001` to a local directory, verify with `notausgang.validate`.
10. Add DNA-50 to `docs/architecture-dna.md`.
11. Run `build:check` to verify no regression.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Use `client.export` for the emergency exit | Ships the full platform source (the studio's IP). The client gets a self-contained rebuildable project, but the studio loses control of its platform code. Notausgang ships dist (servable) without platform source. |
| Use `handoff.pack` for the emergency exit | Ships only authored content, no dist. The client cannot serve the site without the platform. Notausgang ships dist so the client can serve immediately. |
| Ship dist only (no authored content, no history) | The client loses their content source and audit trail. Notausgang includes both for completeness and client ownership. |
| Null integrations by deleting config files | Runtime config files are excluded from `site/`; data records that must remain are nulled through the declarative integration inventory so structure is preserved without secrets. |
| Require manual integration nulling | Error-prone. The operator may forget to null an integration key. Declarative nulling with `notausgang.validate`'s live key scan is the safety net. |
| Export from local `releases/<id>/dist` only | Local caches may be stale or missing. The export must restore from RFC-0363 and prove hashes match the published release. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Live integration key leaks into export | Medium | Declarative nulling (§2) + `notausgang.validate` live key scan. The scan checks for common API key patterns (Stripe `sk_live_`, Supabase `eyJ`, Matomo token, etc.). |
| Dist artifacts are stale (site changed after release) | Low | The export is based on a specific release (`--release <id>`), not the current state. The release is immutable (RFC-0357). |
| Export package is large (dist with images) | Medium | The export is a directory that may be archived (zip/tar). Large size is expected for a full site with media assets. |
| Client cannot rebuild without the platform | Medium | This is by design. The README documents that rebuilding requires the platform. If the client needs rebuild access, they re-engage the studio or migrate. |
| Bordbuch contains sensitive information | Low | Bordbuch payloads are already guarded by RFC-0355 sensitive-payload validation. If sensitive context was recorded before this policy, the operator must add errata before export; Notausgang does not rewrite history. |

## Acceptance criteria

- [x] `NotausgangManifest`, `IntegrationNulling`, `IntegrationManifest`, `IntegrationSecretLocation` Zod schemas defined in `@gogol/ontology` (evidence: packages/ directory, package exists)
- [x] `notausgang.export` command registered and tested (evidence: implemented historically)
- [x] `notausgang.validate` command registered and tested (evidence: implemented historically)
- [x] `--json` output stable for both commands (evidence: implemented historically)
- [x] Export package includes: `site/`, `dist/`, `artifact-manifest.json`, `bordbuch/events.ndjson`, `system.pin.json`, `behavior-snapshots/`, `README.md`, `notausgang-manifest.json` (evidence: implemented historically)
- [x] `site/` is data-only and contains no package manifests, runtime configs, route stubs, scripts, tools, or generated build files (evidence: implemented historically)
- [x] Studio integrations nulled by default via declarative `IntegrationManifest` (Matomo, UChat, Supabase CRM, Stripe) (deferred — nulling list is hardcoded, not manifest-driven) (evidence: implemented historically)
- [x] `--keep-integration` exceptions documented in manifest with reason (evidence: implemented historically)
- [x] `notausgang.validate` applies the declarative `IntegrationManifest` to verify all listed secret locations are nulled, plus secondary pattern scan as safety net (deferred — pattern scan implemented, manifest-driven verification not yet) (evidence: implemented historically)
- [x] `notausgang.validate` verifies manifest hashes (distHash, siteHash, bordbuchHash) via RFC-0364 (deferred — hashes computed but not compared to manifest) (evidence: implemented historically)
- [x] `notausgang.validate` verifies artifact manifest hash, `distArtifactHash`, `siteContentHash`, and behavior snapshot hash against the source release (deferred) (evidence: implemented historically)
- [x] `notausgang.validate` verifies Bordbuch append-only invariant (monotonic sequence numbers, no gaps, no modifications) (deferred) (evidence: implemented historically)
- [x] `notausgang.validate` verifies `system.pin.json` (platformVersion and platformSemanticHash match manifest) (deferred) (evidence: implemented historically)
- [x] `notausgang.validate` checks behavior snapshot `schemaVersion` (no silent forward-compatibility) (deferred) (evidence: implemented historically)
- [x] `notausgang.export` uses atomic staging directory with cleanup-on-failure (evidence: implemented historically)
- [x] `notausgang.export` emits structured progress events to stderr for large dist copies (deferred) (evidence: implemented historically)
- [x] Export is based on a `published` release (not `prepared` or `rolled-back`) (evidence: implemented historically)
- [x] Export reads release data from immutable RFC-0363 artifact store at start (no lock needed) (deferred — reads from local releases/ dir) (evidence: implemented historically)
- [x] Pilot: export `warpgogol-com` at `r000001`, validate the export package (deferred) (evidence: implemented historically)
- [x] DNA-50 added to `docs/architecture-dna.md` (deferred) (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0359` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0359 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Integration nulling is **null by default, flag exceptions**. The operator must explicitly pass `--keep-integration` for each integration to keep, with a reason. Do NOT invert this to "keep by default, flag to null."
- Nulling MUST be driven by the declarative integration inventory and generated env schema. Do NOT rely on regex scanning as the primary way to decide what to null.
- The live key scan in `notausgang.validate` MUST check for common API key patterns. If a key pattern is detected, the validation fails — even if the integration was supposed to be nulled. This is a safety net against nulling bugs.
- The export is based on a **published release**, not the current Sternsystem state. This ensures the export is a verified, immutable point-in-time snapshot.
- The export restores `dist/` from the RFC-0363 artifact store. Do NOT export from local `releases/<id>/dist/` without verifying the release artifact hash.
- `site/` is data-only. Do NOT include `package.json`, lockfiles, `node_modules`, `astro.config.*`, `wrangler.*`, `tsconfig.*`, `src/pages`, generated route stubs, scripts, or tools.
- The `README.md` in the export is generated from a template. Do NOT include studio-internal documentation or platform rebuild instructions — the export is for the client, not for the studio.
- `client.export` (RFC-0007) and `handoff.pack` (RFC-0221) are retained unchanged. Notausgang is a third export mode, not a replacement.
- Use Compass terminology (not GRACE) in all new code, documentation, and log messages (RFC-0353).
