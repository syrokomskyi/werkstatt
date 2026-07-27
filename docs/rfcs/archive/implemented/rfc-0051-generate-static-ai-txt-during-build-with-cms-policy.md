---
id: RFC-0051
title: "Generate static ai.txt during build with CMS-declared AI policy"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-16
updatedAt: 2026-06-04
implementedAt: 2026-05-16
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-22
  - DNA-25
  - RFC-0047
  - RFC-0048
  - RFC-0049
  - RFC-0050
commands:
  proposed:
    - ai.generate
    - ai.validate
  added:
    - ai.generate
    - ai.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "public/ai.txt exists before Astro build and is copied to dist/."
  - "ai.txt is generated from a content-managed `ai:` block in src/content/system.md."
  - "ai.validate confirms the file is non-empty, well-structured, and contains expected markers."
  - "No runtime server request is required to serve ai.txt."
  - "Changing the AI policy requires only editing system.md and rebuilding — no code changes."
nonGoals:
  - "Do not turn ai.txt into a freeform CMS artifact — it remains a structured machine-readable projection of a declared policy."
  - "Do not introduce server-side rendering or API middleware for ai.txt."
  - "Do not attempt to replace legal terms of service or privacy policies — ai.txt is a good-faith signal for AI providers, not a binding legal document."
  - "Do not implement ai.txt as a user-facing editorial page — it is a machine-readable file with a fixed format."
  - "Do not add per-page or per-section AI rules — the policy is site-wide and provider-specific only."
  - "Do not introduce cookies, server-side state, or runtime detection for ai.txt."
---

# RFC-0051: Generate static ai.txt during build with CMS-declared AI policy

## Context

Currently no standard exists for `ai.txt`, but an emerging de-facto practice among AI providers (OpenAI, Anthropic, Google, Cohere) treats it as a machine-readable policy endpoint analogous to `robots.txt` but specifically for AI systems. The file sits at `https://example.com/ai.txt` and communicates:

- Whether the site permits AI training on its content.
- What usage types are allowed (inference, indexing, research).
- Licensing and attribution requirements.
- Provider-specific overrides.

The site already generates `sitemap.xml` (RFC-0049) and `llms.txt`/`llms-full.txt` (RFC-0050) during `build.prepare` from the route registry and content layer. Both follow the same pattern: a site-kernel command reads `src/content/system.md` and semantic content, calls a pure-formatter function from `@gogol/share`, and writes a static file to `public/`.

What is missing is a comparable machine-readable endpoint for AI-provider policy. Currently there is no mechanism for a site owner to declare their AI training and usage preferences in a standardized format — the information exists only as natural language in legal pages (privacy policy, terms of service) or is absent entirely.

## Problem

The unprotected invariants are:

> Every site must be able to declare its AI/LLM training and usage policy in a standardized machine-readable format at `/.well-known/ai.txt` or `/ai.txt`.

> The AI policy must be content-managed (editable through `system.md` by non-engineering staff) and automatically reflected in the generated file.

Current failure modes:

1. **No AI policy endpoint.** AI providers have no standardized way to discover a site's policy on training data use, content indexing for LLMs, or licensing terms.
2. **No content-managed policy.** If the AI policy is buried in legal prose (privacy policy, ToS), changing it requires a prose edit rather than a structured configuration change. The two can drift.
3. **Inconsistent with sitemap/llms pattern.** The established build-time generation pattern (RFC-0049, RFC-0050) works for sitemap and LLMS files but is not yet applied to AI policy.
4. **No validation guard.** Without a validation command, the generated `ai.txt` can become structurally invalid, use unsupported provider names, or go stale after a policy change.

## Decision

The platform introduces a content-managed `ai:` block in `src/content/system.md`, a static `ai.txt` generation command, and a validation command, all following the same build-prepare pattern established by RFC-0049 and RFC-0050.

**Policy declaration.** Each app may declare an `ai:` block in its `src/content/system.md` with a site-wide default policy, optional provider-specific overrides, licensing metadata, and a contact point. The block is optional — apps that omit it either skip `ai.txt` generation or generate a minimal file with a `policy: disallow` default.

**Static generation.** `ai.generate` is a site-kernel command (registered in `@gogol/site-kernel-checks`) that reads the `ai:` block from `system.md`, passes it to a pure formatter `buildAiTxt()` from `@gogol/share`, and writes the result to `public/ai.txt` during `build.prepare`. Astro copies the file to `dist/` during the static build.

**Validation command.** `ai.validate` reads `public/ai.txt` and verifies that it is non-empty, contains a global `policy:` directive, and has well-formed section blocks. Provider names are validated against a known allowlist.

**No API route.** The file is generated at build time, not served via an Astro endpoint. There is no `src/pages/ai.txt.ts`.

## Architectural fit

**RFC-0047 / CMS-friendly thin-app surface.** The `ai:` block in `system.md` is a client-editable YAML block alongside `identity`, `i18n`, `growth`, and `release`. Changing the AI policy requires only editing `system.md` and rebuilding — no code changes.

**RFC-0049 / sitemap generation pattern.** `ai.generate` follows the exact same prepare-step model: a site-kernel command reads a manifest, calls a pure formatter from `@gogol/share`, writes to `public/`, and a paired validation command guards correctness in CI.

**RFC-0050 / llms generation pattern.** The command structure, registration, and pipeline integration mirror `llms.generate` and `llms.validate`. The formatter is simpler because it does not need the full `SemanticSiteModel` — only the `ai:` block and site identity.

**DNA-25 / thin delivery.** All formatting logic lives in `@gogol/share`. The command file in `site-kernel-checks` is a thin consumer: read manifest → buildAiTxt → writeFile. No additional formatting or business logic in the command.

**DNA-22 / no server state.** `ai.txt` is a pure static file. No runtime fetch, no server memory, no cookies.

## Design

### system.md schema addition

An optional `ai:` block is added to the system manifest. When absent, `ai.generate` either skips file creation or writes a minimal default (policy: disallow) — the exact behaviour is decided in the implementation.

```yaml
# src/content/system.md

ai:
  # Global default policy for all AI systems.
  # Values: allow | disallow | limited
  policy: limited

  # Training-specific policy (overrides global policy for training use).
  # Values: allow | disallow
  training: disallow

  # Permitted usage types.
  # Array of: training | inference | indexing | research | snippet-generation
  usage:
    - inference
    - indexing

  # Whether commercial AI systems may use the content.
  commercial: no

  # Attribution requirement for AI systems that use content.
  # Values: required | optional | none
  attribution: required

  # Human-readable license identifier or URL.
  license: CC BY-SA 4.0

  # Contact for AI policy inquiries.
  contact: mailto:legal@example.com

  # URL to the full human-readable AI policy page.
  url: https://nicaragua-projekt.de/ai-policy

  # Provider-specific overrides (optional).
  providers:
    - name: OpenAI
      policy: limited
      usage:
        - inference
      training: disallow

    - name: Anthropic
      policy: disallow

    - name: Google
      policy: allow
      usage:
        - indexing
        - snippet-generation
      training: disallow

  # Last meaningful update to the AI policy.
  updated: "2026-05-16"
```

The block is validated by `system.manifest.validate`. Unrecognized provider names, invalid policy values, or structural errors produce a build-time failure.

### CLI surface

```sh
pnpm exec site-kernel run ai.generate --app nicaragua-projekt
pnpm exec site-kernel run ai.generate --all --json

pnpm exec site-kernel run ai.validate --app nicaragua-projekt
pnpm exec site-kernel run ai.validate --all --json
```

`ai.generate` is **app-scoped** with `mutatesState: true` (writes to `public/`).

`ai.validate` is also **app-scoped**.

Both support `--json` for agent-parseable output and `--dry-run` for `ai.generate` (prints content without writing the file).

### TypeScript contracts

```ts
// packages/share/src/semantic/ai.ts

export interface AiProviderOverride {
  name: string;
  policy: "allow" | "disallow" | "limited";
  training?: "allow" | "disallow";
  usage?: Array<"training" | "inference" | "indexing" | "research" | "snippet-generation">;
  commercial?: "yes" | "no";
  attribution?: "required" | "optional" | "none";
  license?: string;
  contact?: string;
  url?: string;
}

export interface AiPolicy {
  policy: "allow" | "disallow" | "limited";
  training?: "allow" | "disallow";
  usage?: string[];
  commercial?: "yes" | "no";
  attribution?: "required" | "optional" | "none";
  license?: string;
  contact?: string;
  url?: string;
  version?: string;
  updated?: string;
  providers?: AiProviderOverride[];
}

export function buildAiTxt(policy: AiPolicy, siteUrl: string): string;
```

`buildAiTxt` is a pure function with no I/O. It receives the parsed policy and the site base URL, and returns the formatted text.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/public/ai.txt` | Generated by `ai.generate`; copied to `dist/` by Astro |
| `apps/<app>/src/content/system.md` | Optional `ai:` block with AI policy declaration |
| `packages/share/src/semantic/ai.ts` | Pure `buildAiTxt(policy, siteUrl)` formatter; new module |
| `packages/share/src/semantic/index.ts` | Barrel export of `buildAiTxt` |
| `packages/os/site-kernel-checks/src/ai.ts` | Command implementations for `ai.generate` and `ai.validate`; new module |
| `packages/os/site-kernel-checks/src/module.ts` | Registers both commands and adds `ai.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` |

### Output format

Generated `public/ai.txt` uses the emerging de-facto format: a header section with global defaults, optional metadata, and per-provider sections in square brackets. The exact format is designed to be easily parsed by both AI providers and human reviewers.

```txt
# ai.txt for nicaragua-projekt.de
# AI training and usage policy
# See: https://nicaragua-projekt.de/ai-policy
# Contact: mailto:legal@example.com
version: 0.1
updated: 2026-05-16

# Default policy for AI systems
policy: limited
training: disallow
usage: inference, indexing
commercial: no
attribution: required
license: CC BY-SA 4.0
url: https://nicaragua-projekt.de/ai-policy
contact: mailto:legal@example.com

[OpenAI]
policy: limited
usage: inference
training: disallow

[Anthropic]
policy: disallow

[Google]
policy: allow
usage: indexing, snippet-generation
training: disallow
```

`ai.generate --json`:

```json
{
  "command": "ai.generate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "file": "apps/nicaragua-projekt/public/ai.txt",
  "byteCount": 623,
  "providers": ["OpenAI", "Anthropic", "Google"]
}
```

Failure example (when `ai:` block is missing and no default fallback is configured):

```json
{
  "command": "ai.generate",
  "status": "skip",
  "app": "nicaragua-projekt",
  "reason": "No `ai:` block in system.md and no default policy configured. Skipping ai.txt generation."
}
```

`ai.validate --json`:

```json
{
  "command": "ai.validate",
  "status": "pass",
  "app": "nicaragua-projekt",
  "checks": {
    "aiTxtExists": true,
    "aiTxtNonEmpty": true,
    "hasGlobalPolicy": true,
    "providersValid": true
  }
}
```

Failure example:

```json
{
  "command": "ai.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "rule": "missing-global-policy",
      "severity": "error",
      "message": "ai.txt does not contain a global `policy:` directive."
    },
    {
      "rule": "unknown-provider",
      "severity": "warning",
      "provider": "UnknownAI",
      "message": "Provider 'UnknownAI' is not in the known provider allowlist."
    }
  ]
}
```

### Failure modes

`ai.generate`:

- **Missing `ai:` block in system.md** → skips file generation (exits zero with `status: "skip"`). The `--json` output includes a clear reason.
- **Invalid `ai:` block** (e.g. `policy: invalid_value`) → exits non-zero. `system.manifest.validate` should catch this first, but `ai.generate` also guards against malformed input.
- **I/O error during write** → exits non-zero.

`ai.validate`:

- **Missing file** → error, non-zero exit.
- **Empty file** → error, non-zero exit.
- **Missing global `policy:` directive** → error.
- **Unknown provider name** → warning (not an error — new providers emerge frequently). The warning is surfaced in `--json`.
- **Byte count below sanity threshold** (e.g. < 50 bytes) → warning.

Warnings do not cause non-zero exit. Errors do.

## Rollout

1. **Phase 1 — formatter.** Implement `buildAiTxt` in `packages/share/src/semantic/ai.ts` and export from the barrel index.
2. **Phase 2 — commands.** Implement `ai.generate` and `ai.validate` in `packages/os/site-kernel-checks/src/ai.ts`.
3. **Phase 3 — pipeline integration.** Add `ai.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` immediately after `llms.generate`.
4. **Phase 4 — app adoption.** Add an `ai:` block to `apps/nicaragua-projekt/src/content/system.md` with the site's AI policy.
5. **Phase 5 — validation gate.** Add `ai.validate` to `app.contract.full`.
6. **Phase 6 — onboarding.** `onboarding.scaffold` includes a default `ai:` block (policy: disallow) in the generated `system.md`.

For existing apps:

- No flag day. The `ai.generate` step is part of `STANDARD_BUILD_PREPARE_PIPELINE`. Apps that include the pipeline step automatically gain `ai.txt` generation.
- Apps that do not have an `ai:` block in `system.md` will have `ai.generate` skip with `status: "skip"` — this is not a failure.
- Existing apps that want to add AI policy simply add the `ai:` block to their `system.md` and rebuild.

For new apps created via `onboarding.scaffold`:

- `ai.generate` is already present in the scaffolded `build.prepare` pipeline.
- A default `ai:` block is included in the scaffolded `system.md` (policy: disallow).

## Alternatives considered

**Keep no `ai.txt`.** Rejected. As AI crawlers proliferate, having no machine-readable policy endpoint leaves the site without a standardized way to communicate preferences. The file is trivially cheap to generate and carries no operational cost.

**Use a separate `ai.yaml` file instead of embedding in `system.md`.** Rejected. The `system.md` file is already the single canonical manifest for app-level configuration. Splitting AI policy into a separate file would create a parallel configuration source that must be kept in sync. The `ai:` block is optional and self-contained; adding it to `system.md` is consistent with how `growth:`, `release:`, and `identity:` are already handled.

**Generate `ai.txt` via an Astro API route.** Rejected. The static generate pattern (RFC-0049, RFC-0050) is now the established approach for well-known text files. An API route would need post-build static generation to work with `output: 'static'`, defeating the purpose.

**Use `robots.txt` comments for AI instructions.** Rejected. While some providers (e.g., OpenAI) read `robots.txt` for opt-out, the format does not support the richer policy metadata needed — licensing, attribution, provider-specific overrides, and usage-type granularity.

**Adopt a specific vendor's `ai.txt` format.** Rejected. No single format is yet standard. The format proposed here (INI-like key-value with `[provider]` sections) is the most commonly emerging pattern and is trivially parseable by both humans and machines. It is designed as version `0.1` — the format can evolve as community standards solidify.

**Skip validation; let CI errors surface from downstream tools.** Rejected. Without validation, a malformed `ai.txt` would go undetected until an AI provider reports problems or a manual audit catches them. The validation command provides a CI gate that catches structural issues before deployment.

## Risks

**Format fragmentation.** The `ai.txt` format is not yet a formal standard. If an RFC-published standard emerges later (e.g., IETF draft), the current format may need to evolve. Mitigation: the format is declared as version `0.1` in the file itself. The `buildAiTxt` formatter can be updated to support newer format versions while maintaining backward compatibility through the version field.

**Provider allowlist drift.** New AI providers emerge frequently. The validation allowlist of known providers will lag behind. Mitigation: unknown providers produce a warning, not an error. The allowlist is a simple constant in the validation code that can be updated independently.

**Policy not reflected in ToS.** An `ai.txt` that declares `policy: allow` but whose legal terms prohibit AI training creates a contradiction. Mitigation: the `ai:` block is content-managed and should be reviewed alongside legal pages. The `url:` field points to the human-readable policy page for authoritative terms.

**Agent recreates pattern from earlier dynamic endpoints.** Agents familiar with the pre-RFC-0050 `llms.txt.ts` pattern might try to create `src/pages/ai.txt.ts`. Mitigation: this RFC explicitly states there is no API route, and the prohibition is noted in `nonGoals` and `Implementation notes for agents`.

## Acceptance criteria

- [x] `buildAiTxt(policy, siteUrl)` exported from `@gogol/share/semantic`. (evidence: packages/ directory, package exists)
- [x] `AiPolicy` and `AiProviderOverride` types exported from `@gogol/share/semantic`. (evidence: packages/ directory, package exists)
- [x] `ai.generate` command writes `public/ai.txt` during `build.prepare`. (evidence: implemented historically)
- [x] `ai.generate` skips with `status: "skip"` when `ai:` block is absent from `system.md`. (evidence: implemented historically)
- [x] `ai.validate` command checks existence, non-emptiness, and structural markers. (evidence: implemented historically)
- [x] `ai.generate` and `ai.validate` registered in `@gogol/site-kernel-checks` with correct scope (`app`) and `mutatesState: true` on `ai.generate`. (evidence: packages/ directory, package exists)
- [x] `ai.generate` added to `STANDARD_BUILD_PREPARE_PIPELINE` immediately after `llms.generate`. (evidence: implemented historically)
- [x] `ai.validate` added to `app.contract.full`. (evidence: implemented historically)
- [x] `ai:` block added to `apps/nicaragua-projekt/src/content/system.md` with appropriate policy. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Astro build copies `public/ai.txt` to `dist/` without errors. (evidence: implemented historically)
- [x] Generated `ai.txt` contains a global `policy:` directive. (evidence: implemented historically)
- [x] Generated `ai.txt` with provider overrides produces correct `[Provider]` sections. (evidence: implemented historically)
- [x] `onboarding.scaffold` includes default `ai:` block and `ai.generate` in the pipeline. (evidence: implemented historically)
- [x] `system.manifest.validate` recognizes and validates the `ai:` block. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT create `src/pages/ai.txt.ts` as a dynamic API route — `ai.txt` is generated at build time by the `ai.generate` command.
- Agents MUST NOT duplicate formatting logic in the command file; they MUST use `buildAiTxt()` from `@gogol/share/semantic`.
- Agents MUST keep `ai.generate` thin: read manifest → buildAiTxt → writeFile. No additional formatting or business logic in the command.
- Agents MUST add `ai.generate` to `STANDARD_BUILD_PREPARE_PIPELINE` in the same PR that implements the command — insert it immediately after `llms.generate`.
- Agents MUST NOT add provider names to a hardcoded allowlist in `ai.validate` without a clear reason — unknown providers should produce warnings, not errors.
- When implementing, agents MUST reference `RFC-0051` in commit messages or PR descriptions.
- Agents MUST run `ai.validate --app <app>` after any change to the `ai:` block in `system.md`.
