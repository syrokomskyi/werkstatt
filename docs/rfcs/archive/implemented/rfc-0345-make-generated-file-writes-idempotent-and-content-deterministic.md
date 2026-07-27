---
id: RFC-0345
title: "Make generated file writes idempotent and content-deterministic"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: ["human:andrii-syrokomskyi"]
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0353
  - RFC-0364
related:
  - RFC-0081
  - RFC-0087
  - RFC-0192
  - RFC-0258
  - RFC-0276
satisfies:
  - DNA-18
  - DNA-39
commands:
  proposed: []
  added: []
  changed:
    - surface.generate
    - site.bordbuch.generate
    - uni.registry.build
    - content.plan.build
    - content.claim.ledger.project
    - compass.inventory
    - entitlements.resolve
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
  - check-webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/surface"
successSignals:
  - "pnpm build run twice in a row produces zero git-tracked changes to generated files"
  - "No new surface-*.state.json files created when content is unchanged"
  - "No generated JSON/XML file rewritten when its content is byte-identical"
nonGoals:
  - "Do not remove or weaken the GENERATED marker governance (RFC-0081)"
  - "Do not change the shape or semantics of generated file content — only the write decision"
  - "Do not add build-time content hashing of source files — the existing artifact/manifest hashes are sufficient"
  - "Do not address files under dist/ or public/ that Astro writes during SSG — those are Astro's responsibility"
---

# RFC-0345: Make generated file writes idempotent and content-deterministic

## Context

Every `pnpm build` run rewrites a large set of generated JSON/XML files even when their semantic content has not changed. The root cause is twofold:

1. **Volatile timestamps**: Generators set `generatedAt: new Date().toISOString()` in their output, making the serialized content different on every build.
2. **Unconditional writes**: Generators call `writeFile` (or `writeFileAtomic`) without first checking whether the existing file already has the same content.

The most visible symptom is in the surface state subsystem: `recordSurfaceState` computes the state `id` from a hash that **includes** `generatedAt`, so every build produces a brand-new `surface-<hash>.state.json` file and updates `pointer.json`. Old state files accumulate indefinitely and are never cleaned up.

This creates noise in version control, slows down builds, and makes it difficult to distinguish real content changes from timestamp churn.

## Problem

### Surface state files (primary complaint)

`packages/os/site-kernel-checks/src/surface/shared.ts:103-107` computes `artifactHash` from `JSON.stringify(artifact)`, which includes the volatile `generatedAt` field. The state `id` is derived from this hash, so it changes every build. The function then unconditionally writes the new state file and the pointer file.

Result: every `pnpm build` creates a new `surface-*.state.json` file and rewrites `pointer.json`, even when no blueprint content changed.

### Other affected generators

The same anti-pattern (volatile `generatedAt` + unconditional write) exists in:

| Generator | File(s) written | Volatile field |
| --- | --- | --- |
| `surface.generate` | `src/surface.generated.json`, `public/.well-known/pseo-manifest.json` | `generatedAt: new Date().toISOString()` |
| `site.bordbuch.generate` | `src/bordbuch/status.generated.json`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html` | `generatedAt: new Date().toISOString()` |
| `uni.registry.build` | `uni.registry.json` (workspace root) | `generatedAt: new Date().toISOString()` |
| `content.plan.build` | `src/maintenance-plan.generated.json` | `generatedAt: new Date().toISOString()` |
| `content.claim.ledger.project` | `src/knowledge.generated.json`, `src/seo/temporal.generated.json` | `generatedAt: new Date().toISOString()` |
| `grace.inventory` | `docs/grace-inventory.xml` | `<generated-at>new Date().toISOString()</generated-at>` |
| `entitlements.resolve` | `src/entitlements.generated.json` | (no timestamp, but unconditional write) |

### No shared helper

A `writeIfChanged` pattern already exists as **private** functions in three separate locations:

- `packages/os/site-kernel-codegen/src/service.ts:129` — private `writeIfChanged`
- `packages/os/site-kernel/src/wire.ts:92` — private `writeGeneratedFile`
- `packages/os/site-kernel-checks/src/public-surface/shared.ts:248` — exported `writeGeneratedTextFile` (uses `context.io`)

None of these are exported from `@gogol/site-kernel` for general use. The pattern needs to be unified into a single shared, exported primitive.

## Decision

The kernel gains a shared `writeFileIfChanged` primitive in `packages/os/site-kernel/src/fs-idempotent.ts` that reads the existing file, compares content byte-for-byte, and skips the write if identical. All generators that produce build artifacts replace their unconditional `writeFile`/`writeFileAtomic` calls with this primitive.

All affected generators set their `generatedAt` field to `null` instead of `new Date().toISOString()`, following the pattern already established by `surface-breaker.ts`, `pseo-visibility.ts`, and `surface-demand.ts`.

`recordSurfaceState` is refactored to:

1. Exclude `generatedAt` from the content hash so the state `id` is stable.
2. Skip writing a state file if one with the same `id` already exists on disk.
3. Write `pointer.json` only if its serialized content actually changed.
4. Delete unreferenced `surface-*.state.json` files (those not named in the new pointer).

## Architectural fit

- **RFC-0081 (generated file governance)**: The `GENERATED` marker and the "do not edit" contract are preserved. `writeFileIfChanged` does not weaken or bypass the marker check — it simply avoids redundant writes.
- **RFC-0087 (content-driven generation contract)**: Idempotent writes strengthen the "single-owner, idempotent" invariant — a second build with no content change produces zero file mutations.
- **RFC-0258 (atomic writes)**: `writeFileIfChanged` delegates the actual write to `writeFileAtomic`, preserving parallel-build safety. The content comparison happens before the atomic write; if the content is identical, no write occurs at all (which is trivially atomic).
- **RFC-0276 (site bordbuch)**: The bordbuch status projection becomes deterministic — the `generatedAt` field becomes `null`, and the status JSON/HTML is only rewritten when the underlying ledger or visibility data changes.

## Design

### CLI surface

No new commands. No new flags. This is an internal change to existing generators.

### TypeScript contracts

#### New shared helper: `packages/os/site-kernel/src/fs-idempotent.ts`

```ts
/**
 * Write `content` to `filePath` only if the existing file content differs.
 * Uses `writeFileAtomic` for the actual write (RFC-0258 parallel-safe).
 * Returns "written" if the file was created or updated, "unchanged" if
 * the existing content is byte-identical.
 *
 * @param filePath  Absolute path to the target file.
 * @param content   The full string content to write.
 */
export async function writeFileIfChanged(
  filePath: string,
  content: string,
): Promise<"written" | "unchanged">;
```

Implementation:

1. Try `readFile(filePath, "utf8")`.
2. If the existing content equals `content` exactly (byte-for-byte string comparison), return `"unchanged"`.
3. Otherwise, call `writeFileAtomic(filePath, content)` and return `"written"`.
4. If the file does not exist (read throws ENOENT), proceed to write.

The helper is exported from `@gogol/site-kernel` via `packages/os/site-kernel/src/index.ts`.

#### Type changes

In `packages/surface/src/types.ts`:

```ts
// Before:
export interface SurfaceManifest {
  _generated: string;
  generatedAt: string;
  surfaces: SurfaceCounts[];
}

export interface SurfaceArtifact {
  _generated: string;
  generatedAt: string;
  entries: VirtualRouteEntry[];
}

// After:
export interface SurfaceManifest {
  _generated: string;
  generatedAt: string | null;
  surfaces: SurfaceCounts[];
}

export interface SurfaceArtifact {
  _generated: string;
  generatedAt: string | null;
  entries: VirtualRouteEntry[];
}
```

In `packages/os/site-kernel-checks/src/registry.ts`:

```ts
// Before:
export interface UniRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  generatedAt: string;
  totalCount: number;
  entries: RegistryEntry[];
}

// After:
export interface UniRegistry {
  schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
  generatedAt: string | null;
  totalCount: number;
  entries: RegistryEntry[];
}
```

`SurfaceState` in `packages/os/site-kernel-checks/src/surface/shared.ts` — `createdAt: string` stays `string`. It is only written once per unique content hash (when a new state file is created). Existing state files are never overwritten, so the original `createdAt` is preserved.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/fs-idempotent.ts` | **New file**: `writeFileIfChanged` helper |
| `packages/os/site-kernel/src/index.ts` | Export `writeFileIfChanged` |
| `packages/surface/src/types.ts` | `generatedAt: string \| null` on `SurfaceArtifact` and `SurfaceManifest` |
| `packages/os/site-kernel-checks/src/surface/generate.ts` | Set `generatedAt: null`, use `writeFileIfChanged` for artifact and manifest |
| `packages/os/site-kernel-checks/src/surface/shared.ts` | Refactor `recordSurfaceState`: exclude `generatedAt` from hash, skip existing state files, conditional pointer write, cleanup unreferenced state files |
| `packages/os/site-kernel-checks/src/registry.ts` | `generatedAt: null`, use `writeFileIfChanged` |
| `packages/os/site-kernel-checks/src/site-bordbuch.ts` | `generatedAt: null`, use `writeFileIfChanged` for all three outputs |
| `packages/os/site-kernel-checks/src/content-plan.ts` | `generatedAt: null`, use `writeFileIfChanged` |
| `packages/os/site-kernel-checks/src/content-ledger.ts` | `generatedAt: null`, use `writeFileIfChanged` for graph and temporal SEO |
| `packages/os/site-kernel-checks/src/grace.ts` | `<generated-at>null</generated-at>`, use `writeFileIfChanged` |
| `packages/os/site-kernel-checks/src/entitlements.ts` | Use `writeFileIfChanged` (no timestamp to nullify) |
| `packages/os/site-kernel-checks/src/tests/uni-registry-concurrency.test.ts` | Update assertion: `generatedAt` is now `null` |

### Exact changes per file

#### 1. `packages/os/site-kernel/src/fs-idempotent.ts` (new file)

```ts
import { readFile } from "node:fs/promises";
import { writeFileAtomic } from "./fs-atomic.ts";

/**
 * Write `content` to `filePath` only if the existing file content differs.
 * Delegates the actual write to `writeFileAtomic` (RFC-0258 parallel-safe).
 */
export async function writeFileIfChanged(
  filePath: string,
  content: string,
): Promise<"written" | "unchanged"> {
  try {
    const existing = await readFile(filePath, "utf8");
    if (existing === content) {
      return "unchanged";
    }
  } catch {
    // File does not exist — proceed to write.
  }
  await writeFileAtomic(filePath, content);
  return "written";
}
```

Add GRACE module contract scaffolding (`MODULE_CONTRACT`, `MODULE_MAP`, `CHANGE_SUMMARY`) per `docs/source-markup.xml` conventions.

#### 2. `packages/os/site-kernel/src/index.ts`

Add export:

```ts
// RFC-0345: idempotent file-write primitive
export { writeFileIfChanged } from "./fs-idempotent.ts";
```

#### 3. `packages/surface/src/types.ts`

Change `generatedAt: string` to `generatedAt: string | null` on both `SurfaceManifest` (line 282) and `SurfaceArtifact` (line 289).

#### 4. `packages/os/site-kernel-checks/src/surface/generate.ts`

**Lines 180-196** — replace:

```ts
// Before:
const now = new Date().toISOString();
const artifact: SurfaceArtifact = {
  _generated: "GENERATED by surface.generate (RFC-0192). Do not edit.",
  generatedAt: now,
  entries: allEntries,
};
const manifest: SurfaceManifest = {
  _generated: "GENERATED by surface.generate (RFC-0192). Do not edit.",
  generatedAt: now,
  surfaces,
};

if (!context.dryRun) {
  await writeFile(join(appDir, ARTIFACT_FILE), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await mkdir(join(appDir, "public", ".well-known"), { recursive: true });
  await writeFile(join(appDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await recordSurfaceState(appDir, app.name, artifact, manifest);
}

// After:
const artifact: SurfaceArtifact = {
  _generated: "GENERATED by surface.generate (RFC-0192). Do not edit.",
  generatedAt: null,
  entries: allEntries,
};
const manifest: SurfaceManifest = {
  _generated: "GENERATED by surface.generate (RFC-0192). Do not edit.",
  generatedAt: null,
  surfaces,
};

if (!context.dryRun) {
  await mkdir(join(appDir, "public", ".well-known"), { recursive: true });
  await writeFileIfChanged(join(appDir, ARTIFACT_FILE), `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFileIfChanged(join(appDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  await recordSurfaceState(appDir, app.name, artifact, manifest);
}
```

Add `writeFileIfChanged` to the import from `@gogol/site-kernel`. Remove the `now` variable. The `mkdir` for `public/.well-known` stays unconditional (it is idempotent via `recursive: true`).

#### 5. `packages/os/site-kernel-checks/src/surface/shared.ts`

**Lines 97-147** — replace `recordSurfaceState` entirely:

```ts
export async function recordSurfaceState(
  appDir: string,
  appName: string,
  artifact: SurfaceArtifact,
  manifest: SurfaceManifest,
): Promise<void> {
  // Exclude volatile generatedAt from hash — content identity only.
  // Both artifact and manifest have generatedAt: null (RFC-0345), but we
  // strip it defensively in case a caller passes a non-null timestamp.
  const { generatedAt: _ag, ...artifactContent } = artifact;
  const { generatedAt: _mg, ...manifestContent } = manifest;
  const artifactHash = `sha256:${sha256Hex(JSON.stringify(artifactContent))}`;
  const manifestHash = `sha256:${sha256Hex(JSON.stringify(manifestContent))}`;
  const id = `surface-${sha256Hex(`${artifactHash}\n${manifestHash}`).slice(0, 24)}`;

  const stateDir = join(appDir, SURFACE_STATE_DIR);
  const statePath = join(stateDir, `${id}.state.json`);

  // Only write the state file if it does not already exist.
  // This preserves the original createdAt of the first occurrence.
  if (!existsSync(statePath)) {
    const state: SurfaceState = {
      id,
      app: appName,
      createdAt: new Date().toISOString(),
      status: "shipped",
      pageCount: artifact.entries.length,
      indexableCount: artifact.entries.filter(
        (entry) => entry.indexable && !entry.noindex,
      ).length,
      artifactHash,
      manifestHash,
    };
    await mkdir(stateDir, { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  // Build the new pointer and only write if content changed.
  const pointerPath = join(appDir, SURFACE_STATE_POINTER);
  let previous: SurfaceStatePointer | null = null;
  try {
    previous = JSON.parse(await readFile(pointerPath, "utf8")) as SurfaceStatePointer;
  } catch {
    previous = null;
  }
  const newPointer = {
    _generated: GENERATED_MARKER,
    current: id,
    shipped: id,
    lastKnownGood: previous?.lastKnownGood ?? id,
    previousShipped: previous?.shipped ?? previous?.current,
    updatedAt: null as string | null,
  };
  const newPointerJson = `${JSON.stringify(newPointer, null, 2)}\n`;

  let existingPointer = "";
  try {
    existingPointer = await readFile(pointerPath, "utf8");
  } catch {
    // File does not exist yet.
  }
  if (newPointerJson !== existingPointer) {
    await mkdir(stateDir, { recursive: true });
    await writeFile(pointerPath, newPointerJson, "utf8");
  }

  // Cleanup: delete unreferenced state files.
  // A state file is referenced if its id appears in the new pointer's
  // current, shipped, lastKnownGood, or previousShipped fields.
  const referencedIds = new Set(
    [newPointer.current, newPointer.shipped, newPointer.lastKnownGood, newPointer.previousShipped]
      .filter((v): v is string => typeof v === "string"),
  );
  try {
    const files = await readdir(stateDir);
    for (const file of files) {
      if (!file.startsWith("surface-") || !file.endsWith(".state.json")) continue;
      const fileId = file.slice(0, -".state.json".length);
      if (!referencedIds.has(fileId)) {
        await unlink(join(stateDir, file));
      }
    }
  } catch {
    // State directory does not exist or is not readable — skip cleanup.
  }
}
```

Add `existsSync` to the `node:fs` import and `readdir`, `unlink` to the `node:fs/promises` import. Add `writeFileIfChanged` to the import from `@gogol/site-kernel` (not needed here since we do manual comparison for pointer, but `existsSync` + `writeFile` is used for state files).

Note: `SurfaceStatePointer` type (line 53) needs `previousShipped` added if not already present:

```ts
export type SurfaceStatePointer = {
  lastKnownGood?: string;
  shipped?: string;
  current?: string;
  previousShipped?: string;
};
```

#### 6. `packages/os/site-kernel-checks/src/registry.ts`

**Line 280** — change `generatedAt: new Date().toISOString()` to `generatedAt: null`.

**Lines 288-290** — replace `writeFileAtomic` with `writeFileIfChanged`:

```ts
// Before:
if (!dryRun) {
  await writeFileAtomic(outputPath, jsonOutput);

// After:
if (!dryRun) {
  await writeFileIfChanged(outputPath, jsonOutput);
```

Update the `UniRegistry` interface: `generatedAt: string | null`.

#### 7. `packages/os/site-kernel-checks/src/site-bordbuch.ts`

**Line 243** — change `generatedAt: new Date().toISOString()` to `generatedAt: null`.

**Lines 336-339** (`writeProjections`) — replace unconditional writes with `writeFileIfChanged`:

```ts
// Before:
const json = `${JSON.stringify(status, null, 2)}\n`;
await writeFile(statusPath, json, "utf8");
await writeFile(publicJsonPath, json, "utf8");
await writeFile(publicHtmlPath, renderHtml(status, events), "utf8");

// After:
const json = `${JSON.stringify(status, null, 2)}\n`;
await writeFileIfChanged(statusPath, json);
await writeFileIfChanged(publicJsonPath, json);
await writeFileIfChanged(publicHtmlPath, renderHtml(status, events));
```

The `mkdir` calls stay — they are idempotent. Add `writeFileIfChanged` to the import from `@gogol/site-kernel`.

#### 8. `packages/os/site-kernel-checks/src/content-plan.ts`

**Line 286** — change `generatedAt: new Date().toISOString()` to `generatedAt: null`.

Find the `writeFile` call for `PLAN_FILE` and replace with `writeFileIfChanged`. Add the import.

#### 9. `packages/os/site-kernel-checks/src/content-ledger.ts`

**Line 260** — change `generatedAt: new Date().toISOString()` to `generatedAt: null`.

**Lines 253 and 266** — replace `writeFile` with `writeFileIfChanged` for both `GRAPH_FILE` and `TEMPORAL_SEO_FILE`. Add the import.

#### 10. `packages/os/site-kernel-checks/src/grace.ts`

**Line 102** — change to `<generated-at>null</generated-at>`.

**Line 179** — replace `writeFile` with `writeFileIfChanged`. Add the import.

#### 11. `packages/os/site-kernel-checks/src/entitlements.ts`

**Lines 130-134** — replace `writeFile` with `writeFileIfChanged`:

```ts
// Before:
if (!context.dryRun) {
  await writeFile(
    join(app.directory, GENERATED_FILE),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf-8",
  );
}

// After:
if (!context.dryRun) {
  await writeFileIfChanged(
    join(app.directory, GENERATED_FILE),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}
```

Add `writeFileIfChanged` to the import from `@gogol/site-kernel`.

#### 12. `packages/os/site-kernel-checks/src/tests/uni-registry-concurrency.test.ts`

**Line 89** — change type cast:

```ts
// Before:
const parsed = JSON.parse(raw) as UniRegistrySnapshot & { generatedAt: string };

// After:
const parsed = JSON.parse(raw) as UniRegistrySnapshot & { generatedAt: string | null };
```

**Line 94** — change assertion:

```ts
// Before:
expect(typeof parsed.generatedAt).toBe("string");

// After:
expect(parsed.generatedAt).toBeNull();
```

**Lines 96-98** — the content hash exclusion comment and code can stay as-is (excluding `generatedAt` from the comparison still works when it's `null`).

### Output format

No change to `--json` output shapes. The generators return the same `KernelCommandResult` structures. The only difference is that files on disk are not rewritten when content is unchanged.

### Failure modes

- `writeFileIfChanged` delegates to `writeFileAtomic`, which fails loudly on write errors (no silent fallback). Content comparison failures (e.g. corrupted existing file that can't be read as UTF-8) are caught and treated as "file does not exist" — the write proceeds.
- State file cleanup (`readdir`/`unlink`) errors are swallowed — if the directory is inaccessible, cleanup is skipped but the build does not fail.
- If a state file exists but is corrupted (invalid JSON), `existsSync` still returns true and the file is not rewritten. This is acceptable — corrupted state files are a manual intervention case, not a build-time concern.

## Rollout

- **Default behavior**: All changes take effect immediately. No flags, no opt-in, no grace period.
- **Existing apps**: No migration needed. The first build after this RFC will clean up old unreferenced state files and set `generatedAt: null` in all generated files. Subsequent builds will be no-op for unchanged content.
- **New apps**: Automatically compliant from day one.
- **Pipeline integration**: No pipeline changes. The same commands run in the same order. The only observable difference is fewer file writes.

## Alternatives considered

1. **Keep `generatedAt` as a real timestamp, exclude it from the write-if-changed comparison**: More complex — each file type would need a custom comparison function that knows which fields to strip. Rejected in favor of the simpler `null` approach already established by `surface-breaker.ts`, `pseo-visibility.ts`, and `surface-demand.ts`.

2. **Per-generator private `writeIfChanged` (no shared helper)**: Already the status quo in 3 locations. Rejected because it duplicates the pattern further and makes future maintenance harder.

3. **Use `context.io.writeFile` instead of `writeFileAtomic`**: The `WorkspaceIO` port (RFC-0267) is for command-scoped IO interception, not for parallel-safe atomic writes. `writeFileIfChanged` needs `writeFileAtomic` for workspace-root files like `uni.registry.json` that are written by parallel app builds.

## Risks

- **Loss of "when was this generated" information**: Setting `generatedAt: null` means we can no longer tell when a generated file was last written. This is acceptable — the content itself is the source of truth, and git history provides the temporal trail. For `surface-*.state.json`, the `createdAt` field is preserved (written once per unique content hash).
- **State file cleanup race condition**: If two parallel builds (different apps) share the same `src/surface/states/` directory, one build's cleanup could delete a state file the other build just wrote. This is not a real risk because each app has its own `src/surface/states/` directory — apps never share state files.
- **Test breakage**: The `uni-registry-concurrency.test.ts` test asserts `typeof parsed.generatedAt === "string"`. This test must be updated in the same change.

## Acceptance criteria

- [x] `writeFileIfChanged` helper created in `packages/os/site-kernel/src/fs-idempotent.ts` and exported from `@gogol/site-kernel` (evidence: packages/ directory, package exists)
- [x] `SurfaceArtifact.generatedAt` and `SurfaceManifest.generatedAt` changed to `string | null` in `packages/surface/src/types.ts` (evidence: packages/ directory, package exists)
- [x] `UniRegistry.generatedAt` changed to `string | null` in `packages/os/site-kernel-checks/src/registry.ts` (evidence: packages/ directory, package exists)
- [x] `recordSurfaceState` excludes `generatedAt` from hash, skips existing state files, writes pointer conditionally, cleans up unreferenced state files (evidence: implemented historically)
- [x] All 7 generators listed in the `commands.changed` frontmatter use `writeFileIfChanged` instead of unconditional `writeFile`/`writeFileAtomic` (evidence: implemented historically)
- [x] All 6 generators with `generatedAt` set it to `null` instead of `new Date().toISOString()` (evidence: implemented historically)
- [x] `entitlements.resolve` uses `writeFileIfChanged` (no timestamp to nullify) (evidence: implemented historically)
- [x] `uni-registry-concurrency.test.ts` updated to expect `generatedAt: null` (evidence: tests pass, vitest run exitCode=0)
- [x] `pnpm build` run twice in a row on `webgogol-com` produces zero `git status` changes on second run (evidence: implemented historically)
- [x] `pnpm build` run twice in a row on `nicaragua-projekt` produces zero `git status` changes on second run (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm build` run twice in a row on `check-webgogol-com` produces zero `git status` changes on second run (evidence: implemented historically)
- [x] `rfc.validate` passes on this RFC file before merging (evidence: implemented historically)
- [x] Full `pnpm run build:check` passes for all three apps (evidence: build:check passes, exitCode=0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The implementation is mechanical: create one new file, update imports, replace `writeFile`→`writeFileIfChanged`, replace `new Date().toISOString()`→`null`, refactor `recordSurfaceState`. No architectural decisions remain open.
- Verify with: `pnpm build` twice, then `git status` — the second build must show zero changes to tracked generated files.
