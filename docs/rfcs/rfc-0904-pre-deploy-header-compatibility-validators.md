---
id: RFC-0904
title: "Pre-deploy header compatibility validators"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-67
  - DNA-81
  - RFC-0831
  - RFC-0315
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-67
  - DNA-81
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - csp.elements.validate
    - headers.coverage.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - werkstatt-site
liveSpec: true
successSignals:
  - "csp.elements.validate catches object-src 'none' blocking <object> before deploy"
  - "headers.coverage.validate catches orphan _headers path patterns and uncovered typed files"
  - "Both validators run in SITES_CHECK_POSTBUILD_PIPELINE without false positives on warpgogol-com"
nonGoals:
  - "Do not generate or modify CSP headers — validation only"
  - "Do not validate CSP nonce or hash-source correctness — only element-level compatibility"
  - "Do not scan bundled JS files in dist/client/_astro/*.js for worker-src origins — minified JS scanning is out of scope"
  - "Do not provide an escape-hatch config file in v1 — false positives are impossible by design; edge cases require a follow-up RFC"
  - "Do not check child-src (deprecated CSP directive) or worker-src (not visible in rendered HTML)"
  - "Do not replace headers.security.validate (HDR-01..07) — complements it with element-level and path-coverage checks"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0904: Pre-deploy header compatibility validators

## Context

The workshop operates a growing fleet of Astro sites deployed via Cloudflare Pages. Each site ships a `public/_headers` file generated from `_headers.template` (RFC-0078). Two layers of header validation already exist:

1. **`headers.security.validate`** (RFC-0315, HDR-01..07) — author-time validator that checks required header presence, CSP wildcard avoidance, required CSP directives, Markdown twin content-type, cache freshness rules, and agent discovery Link headers.
2. **`csp.origins.validate`** (RFC-0831, CSP-ORIGIN-01..04) — post-build validator that cross-references CSP source lists against external origins found in rendered HTML.

In August 2026, a production site (`warpgogol.com`) deployed with `object-src 'none'` in its CSP. The Nachweis detail component (`nachweis-detail-component.astro`) embeds PDF documents via `<object data="/nachweis-pdfs/...">`. The browser blocked the `<object>` element entirely, displaying the fallback message "Ihr Browser kann kein PDF anzeigen" instead of the PDF. The issue was invisible locally (dev server does not enforce CSP) and only surfaced after deployment to production.

Neither existing validator caught this: `headers.security.validate` only checks that `object-src` is present (HDR-02), not whether its value is compatible with HTML elements in the built output. `csp.origins.validate` checks external origin coverage for `script-src`, `style-src`, `img-src`, `connect-src` — it does not cover `object-src`, `frame-src`, or `media-src`, and it ignores same-origin URLs (the PDF was served from `/nachweis-pdfs/`, same origin).

As the fleet grows to hundreds of sites, detecting such issues only after deployment is unacceptable. This RFC establishes two new post-build validators that catch header/CSP incompatibilities before deployment.

## Problem

Two classes of `_headers` misconfiguration are undetectable before deployment today:

**1. CSP element incompatibility.** The CSP in `public/_headers` may contain directives that block HTML elements present in the built output. The known failure mode: `object-src 'none'` blocks all `<object>`, `<embed>`, and `<applet>` elements regardless of origin. Similarly, `frame-src 'none'` would block `<iframe>`, and `media-src 'none'` would block `<audio>` and `<video>`. These are same-origin blocking issues — the element is blocked entirely, not just restricted to certain origins. The existing `csp.origins.validate` (RFC-0831) cannot catch these because it only checks external origin coverage and ignores same-origin URLs.

**2. `_headers` path coverage gaps.** The `_headers` file contains path patterns (e.g., `/nachweis-pdfs/*`, `/_astro/*`) that apply headers to matching files in `dist/client/`. Two sub-problems exist:

- **Orphan patterns:** path patterns declared in `_headers` that match no files in `dist/client/` — dead rules that clutter the configuration.
- **Uncovered typed files:** files of specific types (`.pdf`, `.mp4`, `.webm`, `.svg`) in `dist/client/` that have no matching `_headers` path pattern — these files will be served without correct `Content-Type` or `Cache-Control` headers, potentially breaking functionality or caching behaviour.

Neither `headers.security.validate` (author-time, checks header presence only) nor `csp.origins.validate` (post-build, checks external origin coverage only) covers these cases. The gap means CSP/headers problems are only discovered after deployment, when the production site fails to display content correctly.

## Decision

The kernel gains two new post-build validators in `packages/werkstatt-site/src/checks/`:

1. **`csp.elements.validate`** — scans rendered HTML in `dist/client/` for `<object>`, `<embed>`, `<iframe>`, `<frame>`, `<audio>`, `<video>`, and `<source>` elements, cross-references each against the corresponding CSP directive (`object-src`, `frame-src`, `media-src`) parsed from `public/_headers`, and emits errors when a directive blocks an element present in the built output. Falls back to `default-src` when a specific directive is absent.

2. **`headers.coverage.validate`** — cross-references `_headers` path patterns against files in `dist/client/`, emitting warnings for orphan patterns (HDR-COV-01) and errors for typed files without matching path patterns (HDR-COV-02).

Both validators are integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `csp.origins.validate` and before `dist.generated-marker.validate`.

## Architectural fit

**Architecture DNA:**

- **DNA-67** (Pre-deploy Lighthouse parity gate) — establishes the principle that every issue deterministically checkable at build time MUST have a build-time validator. This RFC extends the same philosophy to CSP/headers: issues observable post-deploy that can be deterministically detected pre-deploy MUST be caught pre-deploy.
- **DNA-81** (new, established by this RFC) — Pre-deploy header compatibility gate: every CSP directive that controls HTML element loading MUST be cross-referenced against built HTML before deployment, and every `_headers` path pattern MUST correspond to actual files in the build output.

**Existing RFCs:**

- **RFC-0315** (`headers.security.validate`, HDR-01..07) — this RFC complements it. `headers.security.validate` checks header presence and structural correctness at author time; `csp.elements.validate` and `headers.coverage.validate` check semantic compatibility at post-build time.
- **RFC-0831** (`csp.origins.validate`, CSP-ORIGIN-01..04) — this RFC complements it. `csp.origins.validate` checks external origin coverage; `csp.elements.validate` checks element-level compatibility (including same-origin blocking). Both read the same `public/_headers` and `dist/client/` HTML, but from different angles.

**Site OS operator model:**

- Both commands are post-build validators registered in `packages/werkstatt-site/src/checks/`.
- Both follow the existing pattern: read `public/_headers`, scan `dist/client/`, emit `Diagnostic[]` via `diagnosticsResult`.
- Both are integrated into `SITES_CHECK_POSTBUILD_PIPELINE`, which runs inside `build.post` and `sites-check.postbuild`.

**Scaling Playbook:**

- Applies uniformly across all sites. No site-specific configuration needed. New sites automatically comply — the validators run in the standard pipeline.

## Design

### CLI surface

```sh
# CSP element compatibility — post-build, scans dist/client/ HTML
pnpm exec werkstatt run csp.elements.validate --app warpgogol-com
pnpm exec werkstatt run csp.elements.validate --app warpgogol-com --json

# Headers path coverage — post-build, cross-references _headers vs dist/client/
pnpm exec werkstatt run headers.coverage.validate --app warpgogol-com
pnpm exec werkstatt run headers.coverage.validate --app warpgogol-com --json
```

Both commands accept `--app <id>` (required, single-site scope) and `--json` (machine-readable output). No additional flags.

### TypeScript contracts

**`csp.elements.validate`** — new file: `packages/werkstatt-site/src/checks/csp-elements.ts`

```ts
interface CspElementResult {
  checkedElements: number;
  violations: number;
}

// Element → directive mapping
const ELEMENT_DIRECTIVE_MAP: Record<string, string> = {
  object: "object-src",
  embed: "object-src",
  applet: "object-src",
  iframe: "frame-src",
  frame: "frame-src",
  audio: "media-src",
  video: "media-src",
  source: "media-src", // <source> inside <video>/<audio> inherits media-src
};

// Rules: CSP-EL-01 (object-src), CSP-EL-02 (frame-src), CSP-EL-03 (media-src)
// Severity: error for all three
// Logic:
// 1. Parse CSP from public/_headers
// 2. Walk dist/client/**/*.html via parse5 (reuse extractOriginsFromHtml pattern)
// 3. For each <object>, <embed>, <iframe>, <frame>, <audio>, <video>, <source>:
//    a. Resolve directive = ELEMENT_DIRECTIVE_MAP[tagName] or fallback to default-src
//    b. If directive value is 'none' → error (element blocked)
//    c. If directive has specific sources and element has data/src URL:
//       - Same-origin URL: check if 'self' is in source list → error if missing
//       - External URL: check if origin is in source list → error if missing
//    d. If directive absent → fallback to default-src, same logic
```

**`headers.coverage.validate`** — new file: `packages/werkstatt-site/src/checks/headers-coverage.ts`

```ts
interface HeadersCoverageResult {
  orphanPatterns: number;
  uncoveredFiles: number;
}

// Rules:
// HDR-COV-01 (orphan pattern) — severity: warning
//   _headers path pattern matches no files in dist/client/
// HDR-COV-02 (uncovered typed file) — severity: error
//   File with extension in [.pdf, .mp4, .webm, .svg] in dist/client/
//   has no matching _headers path pattern

// Logic:
// 1. Parse _headers path patterns (lines starting with /)
// 2. For each pattern, glob dist/client/ for matching files
// 3. If zero matches → HDR-COV-01 warning
// 4. For each file in dist/client/ with extension in tracked types:
//    a. Check if any _headers path pattern matches the file path
//    b. If no match → HDR-COV-02 error
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/csp-elements.ts` | New file: `csp.elements.validate` command implementation |
| `packages/werkstatt-site/src/checks/headers-coverage.ts` | New file: `headers.coverage.validate` command implementation |
| `packages/werkstatt-site/src/checks/module.ts` | Modified: register both new commands in kernel module |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` | Modified: add both commands to `SITES_CHECK_POSTBUILD_PIPELINE` |
| `packages/werkstatt-site/src/tests/csp-elements.test.ts` | New file: unit tests for `csp.elements.validate` |
| `packages/werkstatt-site/src/tests/headers-coverage.test.ts` | New file: unit tests for `headers.coverage.validate` |
| `public/_headers` | Read-only: CSP and path patterns parsed from here |
| `dist/client/**/*.html` | Read-only: scanned for `<object>`, `<embed>`, `<iframe>`, `<frame>`, `<audio>`, `<video>`, `<source>` elements |
| `dist/client/**` | Read-only: file listing for path coverage cross-reference |
| `docs/architecture-dna.md` | Modified: add DNA-81 entry |
| `packages/werkstatt-site/AGENTS.md` | Modified: document both new commands in Check commands section |

### Output format

**`csp.elements.validate --json`:**

```json
{
  "command": "csp.elements.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CSP-EL-01",
      "severity": "error",
      "file": "dist/client/nachweise/nicaragua-projekt/index.html",
      "line": 42,
      "message": "CSP object-src 'none' blocks <object> element with data=\"/nachweis-pdfs/nicaragua-projekt.pdf\"",
      "fixHint": "Change object-src to 'self' in public/_headers to allow same-origin PDF embedding"
    }
  ],
  "data": {
    "checkedElements": 1,
    "violations": 1
  }
}
```

**`headers.coverage.validate --json`:**

```json
{
  "command": "headers.coverage.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "HDR-COV-01",
      "severity": "warning",
      "file": "public/_headers",
      "line": 15,
      "message": "Path pattern /old-pdfs/* matches no files in dist/client/",
      "fixHint": "Remove orphan path pattern or add files matching it"
    },
    {
      "ruleId": "HDR-COV-02",
      "severity": "error",
      "file": "dist/client/nachweis-pdfs/nicaragua-projekt.pdf",
      "line": 0,
      "message": "File .pdf has no matching _headers path pattern — will be served without correct Content-Type or Cache-Control",
      "fixHint": "Add a path pattern for *.pdf files to public/_headers with appropriate Content-Type and Cache-Control"
    }
  ],
  "data": {
    "orphanPatterns": 1,
    "uncoveredFiles": 1
  }
}
```

### Failure modes

**`csp.elements.validate`:**

- If `public/_headers` is missing → skip with info message (HDR-01 in `headers.security.validate` handles this).
- If CSP header is missing from `_headers` → skip with info message.
- If `dist/client/` is missing → skip with info message (not built yet).
- If violations found → `exitCode: 1`, diagnostics emitted. All three rules (CSP-EL-01..03) are errors.
- If no violations → `exitCode: 0`, summary with `checkedElements` count.

**`headers.coverage.validate`:**

- If `public/_headers` is missing → skip with info message.
- If `dist/client/` is missing → skip with info message.
- If orphan patterns found (HDR-COV-01) → warning, does not affect exit code.
- If uncovered typed files found (HDR-COV-02) → `exitCode: 1`, diagnostics emitted.
- If no issues → `exitCode: 0`, summary with counts.

Both commands follow the existing `diagnosticsResult` pattern used by `csp.origins.validate` and `headers.security.validate`.

## Rollout

**Default behavior: fail-hard from day one.** Both validators emit errors for violations and warnings for orphan patterns. No grace period — the `object-src 'none'` bug that motivated this RFC is already fixed in `_headers.template`, so existing sites should pass. If a site fails, the fix is straightforward (adjust CSP directive or add `_headers` path pattern).

**Existing apps:** No migration needed. The `_headers.template` already has `object-src 'self'` (fixed in mission warpgogol-com-m000080). Sites that have not yet regenerated `_headers` from the template will get a CSP-EL-01 error, which is the correct signal to regenerate.

**New apps:** Automatically compliant — the validators run in `SITES_CHECK_POSTBUILD_PIPELINE`, which is part of the standard build pipeline. No opt-in needed.

**Pipeline integration:** Both commands are added to `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`, after `csp.origins.validate` and before `dist.generated-marker.validate`:

```
csp.origins.validate
csp.elements.validate       ← NEW
headers.coverage.validate   ← NEW
dist.generated-marker.validate
```

**No deprecation path** — this RFC does not supersede or remove any existing command.

## Alternatives considered

**1. Extend `csp.origins.validate` (RFC-0831) instead of creating a new command.** Rejected: `csp.origins.validate` checks external origin coverage — its design assumes URLs have extractable origins. The `object-src 'none'` bug is a same-origin blocking issue where the CSP directive blocks the element entirely, regardless of origin. Extending `csp.origins.validate` would mix two different validation concerns (origin coverage vs element compatibility) in one command, violating the single-responsibility principle used throughout the workshop. A separate command keeps each validator focused.

**2. One combined command `headers.compatibility.validate`.** Rejected: CSP element compatibility and `_headers` path coverage are different responsibilities — one checks HTML elements against CSP directives, the other checks file paths against header patterns. Combining them would create a command with two unrelated rule families. The workshop principle is to split when responsibilities differ.

**3. Runtime probe (post-deploy) instead of post-build validator.** Rejected: `headers.runtime.probe` (HDR-05..06) already exists for runtime header verification, but it requires a deployed URL. The goal of this RFC is to catch issues before deployment. Runtime probes complement post-build validators but cannot replace them for pre-deploy detection.

**4. Escape-hatch config file (like `image-delivery.config.yaml`).** Rejected for v1: false positives are impossible by design — if an HTML element is present and the CSP directive blocks it, that is always an error. If edge cases emerge in practice, a config file can be added via a follow-up RFC.

## Risks

**Performance:** Both validators scan `dist/client/` — `csp.elements.validate` parses HTML files via parse5, `headers.coverage.validate` lists files recursively. This is the same pattern used by `csp.origins.validate`, `image.delivery.validate`, and `a11y.label-in-name.validate`. Performance impact is negligible for sites with hundreds of pages; for fleet-scale (hundreds of sites), each site is validated independently in its own pipeline run.

**False positive rate:** By design, false positives are impossible for `csp.elements.validate` — if an element is in the HTML and the CSP blocks it, that is always a real error. For `headers.coverage.validate`, HDR-COV-02 (uncovered typed files) could produce false positives if a file type is intentionally served without custom headers. The tracked types list (`.pdf`, `.mp4`, `.webm`, `.svg`) is deliberately narrow to minimise this. HDR-COV-01 (orphan patterns) is a warning, not an error, so it cannot block the pipeline.

**Agent misinterpretation:** Agents might confuse `csp.elements.validate` with `csp.origins.validate` and try to fix origin coverage when the error is about element blocking. The `fixHint` in diagnostics explicitly states the corrective action (e.g., "Change object-src to 'self'") to reduce confusion.

**Maintenance burden:** Two new files (~150 lines each) plus pipeline registration and tests. The element-directive map and tracked file types are small constants that rarely change. CSP spec evolution is slow; new directives would require a follow-up RFC.

## Acceptance criteria

- [ ] `csp.elements.validate` command registered in `packages/werkstatt-site/src/checks/module.ts` with correct name and scope
- [ ] `headers.coverage.validate` command registered in `packages/werkstatt-site/src/checks/module.ts` with correct name and scope
- [ ] `csp.elements.validate` emits CSP-EL-01 for `object-src 'none'` blocking `<object>` in a test fixture
- [ ] `csp.elements.validate` emits CSP-EL-02 for `frame-src 'none'` blocking `<iframe>` in a test fixture
- [ ] `csp.elements.validate` emits CSP-EL-03 for `media-src 'none'` blocking `<video>` in a test fixture
- [ ] `csp.elements.validate` passes when `object-src 'self'` and `<object data="/path.pdf">` is same-origin
- [ ] `headers.coverage.validate` emits HDR-COV-01 (warning) for orphan path patterns
- [ ] `headers.coverage.validate` emits HDR-COV-02 (error) for uncovered `.pdf` files
- [ ] Both commands added to `SITES_CHECK_POSTBUILD_PIPELINE` after `csp.origins.validate` and before `dist.generated-marker.validate`
- [ ] `--json` output format matches the documented shape for both commands
- [ ] DNA-81 added to `docs/architecture-dna.md`
- [ ] `packages/werkstatt-site/AGENTS.md` documents both new commands in Check commands section
- [ ] `warpgogol-com` passes both validators after `object-src 'self'` fix
- [ ] Unit tests pass: `pnpm --filter @warpgogol/werkstatt-site test`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST add DNA-81 to `docs/architecture-dna.md` as part of the implementation.
- Agents MUST reuse the parse5-based HTML walking pattern from `csp-origins.ts` (`extractOriginsFromHtml`) — do not introduce a new HTML parser.
- Agents MUST use `diagnosticsResult` from `../result-helpers.ts` for output, consistent with existing validators.
- Agents MUST NOT add an escape-hatch config file in v1 — if false positives emerge, escalate via a follow-up RFC.
