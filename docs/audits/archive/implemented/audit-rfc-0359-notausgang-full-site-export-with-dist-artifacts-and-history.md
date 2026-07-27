# RFC-0359 Technical Review

## 1. Executive Summary

**Требует доработок.** RFC proposes a sound emergency export concept but has critical security gaps (pattern-based key scanning is fundamentally unreliable), missing atomicity guarantees for the export process, and insufficient edge case handling for large dist artifacts and config format variations. The architectural direction is correct, but implementation details need hardening before production use.

## 2. Критические архитектурные уязвимости

**1. Pattern-based live key scan is a false security guarantee** The RFC proposes scanning for API key patterns (Stripe `sk_live_`, Supabase `eyJ`, etc.) as a safety net. This is fundamentally flawed because:

- Keys can be base64-encoded or obfuscated
- Secrets may be split across multiple config entries
- Environment variable references may not match obvious patterns
- Pattern matching gives false confidence while missing real leaks

**Recommendation:** Replace pattern scanning with a declarative `IntegrationManifest` schema in `@gogol/ontology` that explicitly lists all secret locations (file paths, JSON paths, env var names). Null by reference, not by pattern.

**2. No dist-site consistency verification** The RFC copies `dist/` from the release and `site/` from the Sternsystem but doesn't verify they match. If the release process had a bug where dist was built from a different commit than the site content, the export would be inconsistent and unreproducible.

**Recommendation:** During release creation, compute a hash of the site content and store it in release metadata. During export, verify the exported site hash matches the release's recorded hash.

**3. Non-atomic export process** The export is a sequence of copy operations (site → dist → Bordbuch → pin → snapshots). If the process fails midway (disk full, process killed), the output directory is left in a partial, inconsistent state with no cleanup mechanism.

**Recommendation:** Use a temporary staging directory for all operations, then atomic rename to final path only on complete success. Implement cleanup on failure.

**4. Undefined Bordbuch append-only verification** The RFC references "Bordbuch append-only invariant (RFC-0355)" but doesn't specify how `notausgang.validate` actually verifies this. What checks are performed? What if the Bordbuch was manually edited?

**Recommendation:** Explicitly define the verification: load Bordbuch, verify monotonically increasing sequence numbers, verify no entries are deleted/modified (only append), verify signatures if applicable.

## 3. Неучтенные Edge Cases

**1. Large dist artifacts (10GB+)**

- Copy operations may timeout or exhaust memory
- No progress reporting for long-running exports
- No resume capability if export fails midway
- Disk space requirements not specified (source and destination)

**2. Integration config format variations** The RFC assumes a single `integration.shard.json` file, but:

- Astro config may have inline integration config
- Secrets may be in `.env` files, `wrangler.toml`, or other formats
- Different apps may use different config structures
- Nulling logic needs to be schema-aware, not file-path-based

**3. Release state changes during export**

- What if the release is rolled back after export starts?
- What if the release is deleted?
- What if release artifacts are corrupted?
- No concurrent export protection

**4. Pin validation not defined**

- The RFC copies `system.pin.json` but doesn't verify it matches the platform version used to build dist
- No signature verification if pins are meant to be tamper-evident
- No handling of missing/corrupted pin files

**5. Behavior snapshot format evolution**

- What if snapshot format changes between platform versions?
- No backward compatibility guarantees specified
- No handling of missing snapshots from older releases

**6. README localization**

- The README is generated from a template but language is unspecified
- What if the client speaks a different language than the template?
- Should README be localized based on site's primary language?

## 4. Конкретные улучшения

**1. Declarative integration manifest**

```ts
// packages/ontology/src/schemas/integration-manifest.ts
export const IntegrationSecretLocationSchema = z.object({
  file: z.string(),  // path relative to site root
  jsonPath: z.string(),  // JSON path to the secret
  envVar: z.string().optional(),  // if stored as env var reference
});

export const IntegrationManifestSchema = z.object({
  integrations: z.record(z.array(IntegrationSecretLocationSchema)),
});
```

Nulling uses this manifest to locate secrets by reference, not pattern.

**2. Dist-site hash verification** Add to release metadata:

```ts
interface ReleaseMetadata {
  siteContentHash: string;  // sha256 of site/ at release time
  distHash: string;  // sha256 of dist/ at release time
}
```

During export, verify `hash(site/) === release.siteContentHash`.

**3. Atomic export with staging**

```ts
// 1. Create temp directory: <output-path>.tmp-<timestamp>
// 2. Perform all copy operations into temp
// 3. On success: atomic rename <output-path>.tmp-* → <output-path>
// 4. On failure: delete temp directory
```

**4. Progress reporting for large exports** Emit structured progress events:

```json
{
  "stage": "copying-dist",
  "filesCopied": 1234,
  "totalFiles": 5000,
  "bytesCopied": "2.1GB",
  "totalBytes": "8.5GB"
}
```

Support `--resume` flag to continue from failed staging directory.

**5. Config schema for nulling** Define a config schema instead of assuming file paths:

```ts
export const NullingConfigSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    secretPaths: z.array(z.string()),  // JSON paths to null
  })),
});
```

This makes nulling logic app-agnostic and explicit.

**6. Release lock during export** Acquire a lock file at `releases/<id>.lock` at export start. Release with cleanup on completion. Fail if lock already held (concurrent export in progress).

## 5. Вопросы автору

**1.** The RFC proposes pattern-based scanning for live integration keys as a safety net, but pattern scanning is fundamentally unreliable (keys can be encoded, split, or stored in non-obvious formats). Why not use a declarative integration manifest that explicitly lists all secret locations by reference, which would be both more secure and more maintainable?

- TBD

**2.** The export process copies multiple artifacts (site, dist, Bordbuch, pin, snapshots) in sequence without atomicity guarantees. If the process fails midway (disk full, process killed), the output directory may be in a partial, inconsistent state. What is the strategy for ensuring export atomicity and cleanup on failure?

- TBD

**3.** The RFC requires the release to be `published` but doesn't address what happens if the release state changes during export (e.g., rolled back, deleted, or artifacts corrupted). Should the export acquire a lock on the release, or should it work from an immutable snapshot of the release state at the start of the export?

- TBD
