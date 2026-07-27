---
id: RFC-0043
title: "Enforce webp-only image formats with public folder exceptions"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-05
updatedAt: 2026-05-05
implementedAt: 2026-05-05
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-21
commands:
  proposed:
    - image.format.validate
  added:
    - image.format.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-checks
successSignals:
  - All images in apps/*/src/content/**/assets/** are webp format
  - All images in apps/*/public/** are webp, ico, svg, or png format
  - Invalid or corrupted webp files are detected during validation
nonGoals:
  - Do not convert existing images to webp (conversion is a separate migration task)
  - Do not validate images in packages/* (only apps/* are in scope)
  - Do not enforce webp for SVG icons in src/content/**/assets/** (SVG is allowed as vector format)
---

# RFC-0043: Enforce webp-only image formats with public folder exceptions

## Context

Currently, the monorepo has no automated validation for image file formats across `apps/*`. Images may be stored in various locations including `src/content/**/assets/**` and `public/**` directories. Without format validation, projects can accumulate non-webp images (jpg, png, gif) which increases bundle size and degrades performance, especially given webp's superior compression and browser support.

The feature-first layout (DNA-21) colocates assets under `src/content/<layer>/<name>/assets/`, making it critical to enforce consistent image formats across all feature directories.

## Problem

The current system lacks:

1. **Format enforcement**: No validation prevents jpg/png/gif files from being committed to `apps/*/src/content/**/assets/**`
2. **Real format detection**: File extensions cannot be trusted; files may have `.webp` extension but actually be other formats
3. **Integrity checking**: Corrupted or malformed webp files are not detected during validation
4. **Public folder clarity**: The `public` folder needs different rules (ico, svg, png allowed for favicon, icons, etc.)

This relies entirely on manual discipline, leading to inconsistent practices across apps and potential performance regressions.

## Decision

The kernel gains an `image.format.validate` command that enforces webp-only image formats across `apps/*`, with the following rules:

- **Default rule**: All image files in `apps/*/src/content/**/assets/**` must be webp format
- **Public folder exception**: Files in `apps/*/public/**` may be webp, ico, svg, or png
- **SVG exception**: SVG files are allowed anywhere (vector format, not subject to raster format rules)
- **Format detection**: Validation checks actual file magic bytes, not just file extension
- **Integrity check**: Webp files are validated for structural integrity using file parsing
- **Scope**: Only `apps/*` are validated; `packages/*` are out of scope

The command exits non-zero when violations are found and integrates into the `STANDARD_CHECK_PIPELINE`.

## Architectural fit

This enforces a performance-focused invariant aligned with:

- **DNA-21 (Feature-first layout)**: Assets colocated under feature directories must follow format rules
- **Performance best practices**: Webp provides superior compression and browser support
- **Site OS operator model**: Command scope is workspace-wide, registered in `site-kernel-checks`

## Design

### CLI surface

```sh
# Validate a single app
pnpm exec site-kernel run image.format.validate --app nicaragua-projekt

# Validate all apps
pnpm exec site-kernel run image.format.validate --all

# JSON output for CI/CD
pnpm exec site-kernel run image.format.validate --all --json
```

Flags:

- `--app <name>`: Validate specific app
- `--all`: Validate all apps
- `--json`: Output violations in JSON format

### TypeScript contracts

```ts
interface ImageFormatViolation {
  file: string; // Absolute path to the violating file
  rule: "invalid-webp" | "corrupted-webp" | "disallowed-format";
  message: string;
  location: "assets" | "public";
}

interface ImageFormatValidateResult {
  status: "pass" | "fail";
  violations: ImageFormatViolation[];
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/**/assets/**` | Scanned for non-webp images (SVG allowed) |
| `apps/*/public/**` | Scanned for disallowed formats (only webp, ico, svg, png allowed) |
| `packages/*` | Ignored (out of scope) |

### Output format

```json
{
  "command": "image.format.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/main/src/content/pages/en/assets/hero.jpg",
      "rule": "invalid-webp",
      "message": "File is not a valid webp image (detected format: jpeg)",
      "location": "assets"
    },
    {
      "file": "apps/main/src/content/components/logo/assets/banner.png",
      "rule": "invalid-webp",
      "message": "File is not a valid webp image (detected format: png)",
      "location": "assets"
    },
    {
      "file": "apps/main/public/favicon.gif",
      "rule": "disallowed-format",
      "message": "Public folder only allows webp, ico, svg, png. Detected format: gif",
      "location": "public"
    }
  ],
  "summary": {
    "totalFiles": 42,
    "validFiles": 39,
    "invalidFiles": 3
  }
}
```

### Failure modes

- **Invalid webp in assets**: File is not a valid webp (detected via magic bytes). Exit non-zero, report `invalid-webp` violation. Message includes detected format for clarity.
- **Corrupted webp**: File claims to be webp (correct magic bytes) but fails integrity validation. Exit non-zero, report `corrupted-webp` violation.
- **Disallowed format in public**: File is not webp, ico, svg, or png. Exit non-zero, report `disallowed-format` violation.
- **No violations**: Exit zero, report "pass" status

The command fails hard on all violations (no warnings) to enforce strict format compliance.

### Format detection logic

The command uses magic byte detection to determine actual file format, ignoring file extensions entirely:

1. **Read first bytes** of file to detect format signature
2. **If webp signature detected**: Run webp integrity validation (check RIFF header, VP8/VP8L/VP8X chunk validity)
3. **If not webp**: For assets folder → violation; for public folder → check against allowed set (ico, svg, png)
4. **SVG detection**: Check for `<svg` XML signature (SVG is allowed in all locations)

No need to precisely identify non-webp formats - only need to confirm "not valid webp" (or not in allowed set for public).

## Rollout

- **Phase 1 (introduction)**: Command registered but not added to `STANDARD_CHECK_PIPELINE` initially
- **Phase 2 (opt-in)**: Apps can opt-in by adding `image.format.validate` to their local pipeline
- **Phase 3 (gradual enforcement)**: After migration period, add to `STANDARD_CHECK_PIPELINE` with `--strict` flag
- **Phase 4 (full enforcement)**: Remove `--strict` flag, make validation mandatory for all apps

Migration path for existing apps:

1. Run `pnpm exec site-kernel run image.format.validate --app <name>` to identify violations
2. Convert non-webp images to webp using external tools (e.g., `cwebp`, `sharp`)
3. Commit converted images
4. Validation passes automatically

## Alternatives considered

- **Extension-only validation**: Rejected because files can have incorrect extensions
- **Allow all formats in assets**: Rejected due to performance and consistency concerns
- **Separate command for public vs assets**: Rejected because single command with location-aware logic is simpler
- **Include packages/\* in scope**: Rejected because packages contain shared resources that may need different rules

## Risks

- **Performance impact**: Scanning all image files may be slow for large apps; mitigated by efficient file walking and magic byte detection
- **False positives**: Magic byte detection may misidentify some edge cases; mitigated by using reliable file-type detection library
- **Migration burden**: Existing apps may have many non-webp images; mitigated by phased rollout and clear migration path
- **SVG handling**: Need to ensure SVG files are not flagged as invalid; mitigated by explicit SVG exception in rules

## Acceptance criteria

- [x] TypeScript types and interfaces defined in `packages/os/site-kernel-checks/src/image-format.ts` (evidence: packages/ directory, package exists)
- [x] CLI command `image.format.validate` registered in `packages/os/site-kernel-checks/src/module.ts` (evidence: packages/ directory, package exists)
- [x] Command validates actual file format via magic bytes (ignores extensions) (evidence: implemented historically)
- [x] Command validates webp file integrity (RIFF header, VP8 chunk validity) (evidence: implemented historically)
- [x] SVG files allowed in both assets and public folders (evidence: implemented historically)
- [x] Public folder allows webp, ico, svg, png (evidence: implemented historically)
- [x] Assets folder allows webp and svg only (evidence: implemented historically)
- [x] `--json` output format documented and stable (evidence: implemented historically)
- [x] Command exits non-zero on violations (evidence: implemented historically)
- [x] Added to `STANDARD_CHECK_PIPELINE` after migration period (evidence: implemented historically)
- [x] `AGENTS.md` updated with image format rules (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted
- Agents MUST NOT change status fields in any RFC
- Agents MUST check `rfc.list --status accepted` before implementing this command
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it
- Agents MUST use `file-type` package (v19+) for magic byte detection: `pnpm add file-type@^19.0.0` in `packages/os/site-kernel-checks`
- Agents MUST use `fileTypeFromFile()` from `file-type` to detect actual format, ignoring file extensions
- Agents MUST ensure webp integrity validation uses proper parsing (RIFF header structure validation), not just magic byte check
- Agents MUST check for SVG files separately when `fileTypeFromFile()` returns `undefined` (SVG has no magic bytes) by reading file content for `<svg` or `<?xml` markers
- Agents MUST NOT implement image conversion as part of this RFC (conversion is a separate concern)
