---
id: RFC-0694
title: "Add React template and vendor Editframe domain skills into Forge"
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
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - ADR-0021
  - RFC-0641
  - RFC-0691
  - RFC-0692
  - RFC-0693
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - forge.create
    - forge.doctor
    - forge.profile.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`packages/forge/profiles/editframe.yaml` exists and passes `forge.profile.validate`"
  - "`forge create --profile editframe` scaffolds a React + TypeScript + Vite project with a sample composition"
  - "`forge doctor` on an Editframe project checks VIDEO-* invariants against .tsx files using `attribute-pattern` with `elements` array"
  - "6 Editframe domain skills (ef-composition, ef-dev-server, ef-editor-gui, ef-webhooks, ef-brand-video-generator, ef-motion-design) are vendored in `packages/forge/skills/fo/` and pass `forge.skill.validate`"
  - "`ef-onboard` skill no longer references `npm create @editframe` — domain skills are bundled with Forge"
nonGoals:
  - Do not add Cloud Render support — local render only (`editframe render`)
  - Do not add Next.js template — React + Vite is the single standardized template
  - Do not add an HTML-only template — React is the standard; HTML custom elements work inside React
  - Do not change the profile schema version — `forge/stack-profile@1` remains; `attribute-pattern` replaces `html-attribute-pattern`
  - Do not vendor the Editframe API SDK or CLI — only domain knowledge skills are vendored
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0694: Add React template and vendor Editframe domain skills into Forge

## Context

ADR-0021 established Editframe as the video composition framework for the Warpgogol ecosystem. Forge added Editframe support through a series of RFCs: RFC-0641 (stack profile `editframe-html`), RFC-0691 (time model invariants with `html-attribute-pattern` check kind), RFC-0692 (ef-composition-review and ef-render-verify skills), RFC-0693 (ef-onboard skill). The current state:

- **HTML-only template**: The profile scaffolds an HTML composition (`composition.html` with `<ef-timegroup>` custom elements). React is mentioned in `ef-onboard` as a discovery question, but the operator must manually run `npm create @editframe` to get a React project — Forge does not scaffold it.
- **External domain skills**: `ef-onboard` instructs the agent to install Editframe domain skills via `npm create @editframe` (which copies 6 skills into `.agents/skills/editframe-*/`). This creates a runtime dependency on Editframe's scaffolding tool and an external network call. If `npm create @editframe` fails or is offline, the operator has no domain knowledge.

> **Reversal of RFC-0693 nonGoal**: RFC-0693 explicitly listed "Do not vendor Editframe skills into forge — they are installed by `npm create @editframe` or referenced online" as a nonGoal. This RFC reverses that decision because the runtime dependency on `npm create @editframe` proved fragile: it requires a network call during onboarding, produces divergent project structures, and leaves the operator without domain knowledge if the command fails. Bundling the skills with `@warpgogol/forge` eliminates the external dependency and ensures domain knowledge is always available.

- **HTML-specific invariants**: VIDEO-04 through VIDEO-09 use `html-attribute-pattern` check kind, which searches for HTML custom elements (`<ef-timegroup duration="5s">`). React compositions use JSX components (`<Timegroup duration="5s">`) — the current checker cannot validate them.
- **Single workspace type**: `composition` detects `*.html` files containing `ef-timegroup`. React compositions (`.tsx` with `TimelineRoot`) are not detected.

## Problem

1. **No React template**: An operator who wants React + TypeScript (the richer Editframe authoring mode with hooks, component composition, type safety) must leave the Forge scaffold flow and run `npm create @editframe` separately. The Forge-scaffolded project and the `npm create @editframe` project diverge in structure, leading to confusion and broken invariants.

2. **External skill dependency**: `ef-onboard` step 5 instructs the agent to run `npm create @editframe` to install 6 domain skills. This is a network-dependent, external-tool-dependent step. If it fails, the operator has no composition, dev-server, editor-gui, webhooks, brand-video-generator, or motion-design knowledge. These skills are stable reference documentation — they should be bundled with Forge, not fetched at runtime.

3. **Invariant checker cannot validate React**: `html-attribute-pattern` (RFC-0691) searches for `<ef-timegroup ...>` in file contents. React compositions use `<Timegroup duration="5s">` — the checker finds nothing, silently skipping all time model invariants for `.tsx` files. This is a false-negative: the operator believes invariants pass, but they were never checked.

## Decision

The `editframe-html` profile is renamed to `editframe` and standardized on a React + TypeScript + Vite template. The `html-attribute-pattern` check kind is replaced by `attribute-pattern`, which accepts an `elements` array to validate both HTML custom elements (`ef-timegroup`) and React JSX components (`Timegroup`). Six Editframe domain skills are vendored into `packages/forge/skills/fo/` as `ef-*` skills, eliminating the `npm create @editframe` runtime dependency.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: The vendored skills must comply with SKILL-11 (no hardcoded project literals) and SKILL-17 (no platform RFC/ADR references). External Editframe skills are adapted: instruction lines that hardcode commands or paths are rewritten to use `ref()` bindings where applicable, and `<!-- skill-lint-disable SKILL-17 -->` is added where Editframe-specific terminology is unavoidable (matching the pattern already used by `ef-onboard`, `ef-composition-review`, `ef-render-verify`).
- **RFC-0641 (Editframe Video Stack Profile)**: This RFC amends the profile by renaming it and replacing the HTML template with React. The profile schema (`forge/stack-profile@1`) remains at version 1 — `attribute-pattern` is a new enum value replacing `html-attribute-pattern`.
- **RFC-0691 (html-attribute-pattern check kind)**: This RFC supersedes the `html-attribute-pattern` check kind with the generalized `attribute-pattern`. The checker engine is updated to accept `elements: string[]` instead of `element: string`, matching both HTML and JSX syntax.
- **RFC-0692 (ef-composition-review and ef-render-verify)**: These skills are updated to handle `.tsx` files and React component syntax (`<Timegroup>`, `<Video>`, hooks).
- **RFC-0693 (ef-onboard)**: The skill is updated to remove the `npm create @editframe` step and the stack preference discovery question (React is the only template).

## Design

### CLI surface

```sh
forge create --profile editframe
forge profile.validate --id editframe
```

No new CLI commands — this RFC changes the profile YAML, checker engine, and skill files.

### Profile rename and React template

`packages/forge/profiles/editframe-html.yaml` is renamed to `packages/forge/profiles/editframe.yaml`. Key changes:

- **`id`**: `editframe` (was `editframe-html`)
- **`displayName`**: `Editframe Video` (was `Editframe HTML Video`)
- **`detect.anyOf`**: `editframe.config.*` (unchanged)
- **`artifacts[0].extensions`**: `[".tsx"]` (was `[".html", ".tsx"]`)
- **`workspaceTypes`**: One type `composition` with detection `glob: "*.tsx"`, `contains: TimelineRoot`, `packageJsonDep: "@editframe/react"`
- **`firstWorkspace`**: React template with `src/Video.tsx`, `src/main.tsx`, `vite.config.ts`, `tsconfig.json`, `index.html`, `package.json`
- **`install`**: `pnpm add -D @editframe/react @editframe/cli @editframe/vite-plugin @warpgogol/forge turbo prettier react react-dom typescript @types/react @types/react-dom vite @vitejs/plugin-react tailwindcss @tailwindcss/vite`

### Generalized `attribute-pattern` check kind

The `html-attribute-pattern` check kind is replaced by `attribute-pattern`. Schema change in `packages/forge/src/profiles/profile-schema.ts`:

```ts
export const profileInvariantCheckSchema = z
  .object({
    kind: z.enum([
      "filename-pattern",
      "file-contains",
      "file-not-contains",
      "attribute-pattern",
    ]),
    glob: z.string().optional(),
    pattern: z.string().optional(),
    negatedPattern: z.string().optional(),
    elements: z.array(z.string()).optional(),
    attribute: z.string().optional(),
  })
  .refine(
    (v) =>
      v.kind !== "attribute-pattern" ||
      (v.elements != null && v.elements.length > 0 && v.attribute != null && v.pattern != null),
    {
      message: "elements (non-empty array), attribute, and pattern are required for kind: attribute-pattern",
    },
  );
```

The checker engine in `packages/forge/src/onboarding/invariant-engine.ts` builds a combined regex from the `elements` array, matching both HTML (`<ef-timegroup ...>`) and JSX (`<Timegroup ...>`) syntax:

```ts
case "attribute-pattern": {
  const elements = check.elements;
  const attribute = check.attribute;
  if (!elements || elements.length === 0 || !attribute) {
    break;
  }
  const elementAlternation = elements.map(escapeRegex).join("|");
  const elementRegex = new RegExp(`<(${elementAlternation})[^>]*>`, "gi");
  const attrRegex = new RegExp(
    `${attribute}="([^"]*)"|${attribute}='([^']*)'`,
    "i",
  );
  // same attribute extraction logic as before
  break;
}
```

### Invariant updates

All VIDEO-04 through VIDEO-09 invariants are updated to use `compositions/**/*.tsx` glob and `elements: [ef-timegroup, Timegroup]` where applicable. VIDEO-01 (filename pattern) is updated to `compositions/**/*.tsx`. VIDEO-02 and VIDEO-03 (file-contains) are updated with React-aware patterns. VIDEO-08 (file-not-contains) is updated similarly.

### React template files

`packages/forge/profiles/editframe-templates/` (renamed from `editframe-html-templates/`):

- `composition.tsx` — sample React composition with `TimelineRoot`, `Timegroup`, `Video`, `Text`, `Audio`, `Captions`
- `composition-agents.md` — updated AGENTS.md template for React workspace

The `firstWorkspace` includes `src/Video.tsx` importing from `@editframe/react`, `src/main.tsx` with React DOM mount, `vite.config.ts` with `@editframe/vite-plugin`, `tsconfig.json` with `jsx: react-jsx`, and `index.html` entry point.

### Vendored Editframe domain skills

Six skills are vendored from `https://editframe.com/skills/*.md` into `packages/forge/skills/fo/`:

| Forge name | Source | Description |
| --- | --- | --- |
| `ef-composition` | `editframe.com/skills/composition.md` | Video composition with React, time model, media elements, rendering |
| `ef-dev-server` | `editframe.com/skills/dev-server.md` | Vite plugin setup, on-demand transcoding, local asset serving |
| `ef-editor-gui` | `editframe.com/skills/editor-gui.md` | Editor toolkit: timeline, scrubber, canvas, preview controls |
| `ef-webhooks` | `editframe.com/skills/webhooks.md` | Webhook notifications for render completion and file processing |
| `ef-brand-video-generator` | `editframe.com/skills/brand-video-generator.md` (fallback: `npm create @editframe` output) | Brand video generation template |
| `ef-motion-design` | `editframe.com/skills/motion-design.md` (fallback: `npm create @editframe` output) | Motion design patterns |

Each skill is adapted:

- **Frontmatter**: `name`, `description`, `invocation: user`, `category: fo`, `concerns`, `dependsOn: []`, `languagePolicy: ref(PREFERENCES.md)`, `triggers`
- **`concerns`**: `read-only` for reference skills (`ef-dev-server`, `ef-editor-gui`, `ef-webhooks`, `ef-motion-design`); `content-mutation` for skills that guide operators to create composition files (`ef-composition`, `ef-brand-video-generator`)
- **`triggers`**: Each skill declares trigger phrases for intent-to-skill routing (e.g. `ef-composition` → "create a video composition", `ef-dev-server` → "set up editframe dev server")
- **SKILL-17**: `<!-- skill-lint-disable SKILL-17 -->` added — skills reference Editframe-specific concepts
- **SKILL-11**: Instruction lines that hardcode commands are rewritten to use `ref()` bindings where applicable. Element names, hook names, and package names are factual domain knowledge — retained.
- **SKILL-12**: `concerns` field uses the four-level taxonomy (`read-only` or `content-mutation` per skill)

### ef-onboard skill updates

`packages/forge/skills/fo/ef-onboard/SKILL.md` is updated:

- **Step 2 (Discovery)**: Remove the stack preference question. React is the only template.
- **Step 3 (Scaffold)**: `forge create --profile editframe` (was `--profile editframe-html`).
- **Step 4 (Domain skills installation)**: Removed entirely. Domain skills are bundled with `@warpgogol/forge`.
- **Step 5 (Domain knowledge reading)**: Updated to reference the 6 vendored `ef-*` skills plus existing `ef-composition-review` and `ef-render-verify`.

### ef-composition-review and ef-render-verify updates

`ef-composition-review/SKILL.md`: Scope updated to `.tsx` files using `@editframe/react` components. Time model review checks `Timegroup` props. Accessibility review checks `Captions` components for `Audio` with speech content.

`ef-render-verify/SKILL.md`: Determinism inputs updated to `compositions/**/*.tsx` and `assets/**`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/profiles/editframe.yaml` | Renamed from `editframe-html.yaml`, React template |
| `packages/forge/profiles/editframe-templates/composition.tsx` | New React composition template |
| `packages/forge/profiles/editframe-templates/composition-agents.md` | Updated AGENTS.md template for React |
| `packages/forge/profiles/editframe-html.yaml` | Deleted (renamed) |
| `packages/forge/profiles/editframe-html-templates/` | Deleted (renamed) |
| `packages/forge/src/profiles/profile-schema.ts` | `attribute-pattern` replaces `html-attribute-pattern`; `elements: string[]` replaces `element: string` |
| `packages/forge/src/onboarding/invariant-engine.ts` | `attribute-pattern` case replaces `html-attribute-pattern`; iterates `elements` array |
| `packages/forge/src/tests/editframe-profile.test.ts` | Updated for React template and `editframe` profile name |
| `packages/forge/src/tests/invariant-engine.test.ts` | Updated for `attribute-pattern` with `elements` array |
| `packages/forge/skills/fo/ef-composition/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-dev-server/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-editor-gui/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-webhooks/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-brand-video-generator/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-motion-design/SKILL.md` | New — vendored from Editframe |
| `packages/forge/skills/fo/ef-onboard/SKILL.md` | Updated — remove `npm create @editframe`, remove stack question |
| `packages/forge/skills/fo/ef-composition-review/SKILL.md` | Updated — React support |
| `packages/forge/skills/fo/ef-render-verify/SKILL.md` | Updated — React support |
| `packages/forge/package.json` | No change — `files: ["profiles/"]` already covers the renamed `editframe-templates/` directory |

### Output format

No command output changes — `forge doctor` and `forge profile.validate` produce the same JSON shape. Invariant violation messages reference `elements` instead of `element`.

### Failure modes

- **`attribute-pattern` with empty `elements` array**: The schema refine rejects it — `forge.profile.validate` exits non-zero.
- **React composition not detected**: If a directory has no `.tsx` files containing `TimelineRoot`, it is not detected as a composition workspace.
- **Vendored skill validation failure**: If a vendored skill fails `forge.skill.validate`, `forge doctor` reports it as an error.
- **Profile rename migration**: An operator who previously created a project with `--profile editframe-html` updates `forge.yaml` profile field to `editframe`. The `detect.anyOf` marker is unchanged.

## Rollout

- **Implementation order**: Profile schema change → invariant engine update → profile YAML rename → template files → vendored skills → ef-onboard/ef-composition-review/ef-render-verify updates → tests → validation.
- **New projects**: `forge create --profile editframe` scaffolds a React + TypeScript + Vite project. All 6 domain skills are available immediately — no external install step.
- **Existing projects**: No existing Forge projects use `editframe-html` in production (RFC-0641 was implemented 3 days ago). The rename is a non-issue.
- **Schema migration**: `html-attribute-pattern` is removed from the enum. Any profile using `kind: html-attribute-pattern` must update to `kind: attribute-pattern` and change `element` to `elements: [element-name]`. Only `editframe-html.yaml` used it, and that profile is being replaced.
- **CI integration**: `forge doctor` and `forge profile.validate` automatically pick up the new profile and check kind.

## Alternatives considered

- **Separate `editframe-react` profile**: Rejected. Maintaining two profiles (HTML + React) doubles invariant maintenance, workspace type definitions, and template files. React is a superset of HTML — web components work inside React. Standardizing on React simplifies the system.
- **Keep both HTML and React templates with a `templates` field**: Rejected. Adding a `templates` map to the profile schema adds complexity for a choice that doesn't need to exist. React covers all use cases.
- **HTML-only template**: Rejected. React provides hooks (`useTimingInfo`, `useMediaInfo`, `useRenderData`), TypeScript type safety, and component composition. HTML is simpler but less powerful. The operator explicitly chose React as the standard.
- **Copy Editframe skills as-is with `<!-- skill-lint-disable SKILL-11 SKILL-17 -->`**: Rejected. SKILL-11 (no hardcoded literals) is a DNA-54 invariant. Blanket-disabling it for 6 skills undermines the bindings contract. Selective adaptation with targeted `SKILL-17` disables is the correct approach.
- **Keep `html-attribute-pattern` alongside `attribute-pattern`**: Rejected. Having two check kinds for the same purpose is confusing. Generalizing to `attribute-pattern` with `elements` array is cleaner and handles both HTML and JSX.
- **Auto-mapping `ef-timegroup` → `Timegroup` in the checker**: Rejected. Implicit name transformation is magic — the profile YAML should explicitly declare which element names to match. `elements: [ef-timegroup, Timegroup]` is explicit and extensible.

## Risks

- **Vendored skill staleness**: Editframe skills may evolve upstream. Mitigation: vendored skills carry a `source` reference in frontmatter. A periodic sync check can compare vendored content to upstream. For now, manual sync is sufficient — the skills are stable reference documentation.
- **SKILL-11 adaptation burden**: Rewriting instruction lines to use `ref()` bindings for 6 skills is labor-intensive. Mitigation: most hardcoded values in Editframe skills are domain knowledge (element names, hook names, package names), not project-specific literals. Only command references need binding treatment.
- **Profile rename confusion**: Operators who see `editframe-html` in old documentation will be confused. Mitigation: the profile was added 3 days ago — no external documentation references it yet.
- **`attribute-pattern` regex complexity**: Matching both `<ef-timegroup ...>` and `<Timegroup ...>` in one regex is straightforward, but the checker must handle JSX self-closing tags and multiline attributes. Expression props (`duration={...}`) are not string literals and are skipped by the attribute regex — this is acceptable (operators use string props for time values).
- **Agent misinterpretation**: Agents may try to use `html-attribute-pattern` (the old kind) in new profiles. Mitigation: the schema enum rejects it with a validation error.
- **React template dependency bloat**: The install list is longer than HTML. Mitigation: these are standard React tooling deps — operators familiar with React expect them.

## Acceptance criteria

- [ ] `packages/forge/profiles/editframe.yaml` exists with `id: editframe`, `displayName: Editframe Video`, React template in `firstWorkspace`
- [ ] `packages/forge/profiles/editframe-html.yaml` is deleted
- [ ] `packages/forge/profiles/editframe-templates/composition.tsx` exists with `TimelineRoot`, `Timegroup`, `Video`, `Text`, `Audio`, `Captions` from `@editframe/react`
- [ ] `packages/forge/profiles/editframe-templates/composition-agents.md` references React components and `@editframe/react`
- [ ] `profileInvariantCheckSchema` includes `attribute-pattern` in the enum and `elements: z.array(z.string()).optional()` field; `html-attribute-pattern` is removed
- [ ] `ProfileInvariantCheck` interface uses `elements?: string[]` instead of `element?: string`
- [ ] `invariant-engine.ts` implements `attribute-pattern` case that iterates `elements` array and builds element name alternation regex
- [ ] `invariant-engine.ts` no longer has `html-attribute-pattern` case
- [ ] All VIDEO-01..09 invariants in `editframe.yaml` use `compositions/**/*.tsx` glob and `elements: [ef-timegroup, Timegroup]` where applicable
- [ ] 6 new skill directories exist: `ef-composition/`, `ef-dev-server/`, `ef-editor-gui/`, `ef-webhooks/`, `ef-brand-video-generator/`, `ef-motion-design/` — each with `SKILL.md` passing `forge.skill.validate`
- [ ] `ef-onboard/SKILL.md` does not contain `npm create @editframe`
- [ ] `ef-onboard/SKILL.md` does not contain a stack preference question
- [ ] `ef-composition-review/SKILL.md` references `.tsx` files and React components
- [ ] `ef-render-verify/SKILL.md` references `compositions/**/*.tsx` for determinism inputs
- [ ] `editframe-profile.test.ts` updated to load `editframe.yaml` and verify React template fields
- [ ] `invariant-engine.test.ts` updated with `attribute-pattern` test cases using `elements` array
- [ ] `invariant-engine.test.ts` has a test case for JSX syntax (`<Timegroup duration="5s">`) passing `attribute-pattern` check
- [ ] `packages/forge/AGENTS.md` updated to reference `editframe` profile
- [ ] `forge build:check` passes for `packages/forge`
- [ ] `forge test` passes for `packages/forge`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- When vendoring Editframe skills, agents MUST fetch the latest content from `https://editframe.com/skills/<name>.md` for skills with canonical URLs (`ef-composition`, `ef-dev-server`, `ef-editor-gui`, `ef-webhooks`). For skills without a confirmed canonical URL (`ef-brand-video-generator`, `ef-motion-design`), agents MUST first try `https://editframe.com/skills/<name>.md`; if the URL is unavailable, use `npm create @editframe` output as the source. In all cases, adapt frontmatter to Forge skill schema.
- When adapting skills for SKILL-11, agents MUST distinguish between project-specific literals (commands, paths — must use `ref()` bindings) and domain knowledge (element names, hook names, package names — retained as factual content). Element names like `ef-timegroup`, `Timegroup`, `TimelineRoot` are domain knowledge, not project-specific literals.
- The profile rename from `editframe-html` to `editframe` is a file-level rename. Agents MUST use `git mv` to preserve history.
- The `html-attribute-pattern` → `attribute-pattern` change is a breaking schema change within `forge/stack-profile@1`. The `versionBump` is `minor` (Breaks-B) because external npm consumers who created profiles using `html-attribute-pattern` (published in RFC-0691) will experience a breaking change. Agents MUST NOT add backward compatibility for `html-attribute-pattern`.
