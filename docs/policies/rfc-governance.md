# RFC Governance Protocol

RFC (Request for Comments) is the formal lifecycle for architectural decisions in this monorepo. RFC files live in `docs/rfcs/` and are first-class Site OS artifacts.

## When to consult RFCs

Before making any of the following changes, an agent MUST check existing RFCs:

```sh
rtk pnpm exec werkstatt run rfc.list --status accepted --json
```

Changes that require RFC consultation:

- Adding, renaming, or removing a site-kernel CLI command
- Modifying a kernel module or pipeline
- Changing a page contract, component contract, or Architecture DNA invariant
- Adding or modifying a validation rule in `site-kernel-checks`
- Changing the structure of `src/configure/`, `src/content/schemas/`, or `src/semantic/`
- Adding a new package to the monorepo
- Changing how `lang`, Feature Policy, or semantic outputs flow through the system

## RFC command lifecycle metadata

RFC frontmatter command buckets are governance data, not prose. When a change introduces, modifies, or removes a Site OS command, keep `commands.proposed`, `commands.added`, `commands.changed`, and `commands.removed` synchronized before committing.

- `commands.proposed` records the commands discussed by the RFC.
- `commands.added` records commands introduced by the implementation.
- `commands.changed` records existing registered commands whose behavior, output, scope, or pipeline position changed.
- `commands.removed` records commands intentionally removed or deprecated.

For every `status: implemented` RFC, a live command listed under `commands.proposed` because that RFC introduced it must also appear under `commands.added`. Existing command changes must remain registered unless the RFC also lists the command under `commands.removed`. Do not leave historical command lifecycle drift as warning debt; fix the RFC frontmatter.

Run both checks after command lifecycle edits:

```sh
rtk pnpm exec werkstatt run rfc.command-lifecycle.validate --json
rtk pnpm exec werkstatt run rfc.validate
```

If command lifecycle metadata changes, regenerate the Agent Control Plane projection with `ecosystem.manifest.generate` rather than hand-editing `docs/ecosystem.generated.json`.

## What an agent MAY do

- Create a new RFC in `draft` status using `rfc.create`
- Implement code changes when an RFC has `status: accepted`
- Run `rfc.validate` to verify RFC files
- Run `rfc.check` to verify that artifacts declared by accepted/implemented RFCs still exist on disk
- Run `rfc.list` to read RFC context and discover pending work
- Fill in Context, Problem, Decision, and other body sections of a draft RFC
- Transition an `accepted` RFC to `implemented` and stamp `implementedAt`/`updatedAt` — but only once **all** of its acceptance criteria are satisfied and checked, the relevant validators/build pass, and the implementing change is committed and references the RFC ID (RFC-0224). **RFC-0476:** the transition MUST be performed by `rfc.implement.stamp --id <id> --implementation-commit <sha>`. Direct edits to `status`, `implementedAt`, and `updatedAt` for the `implemented` transition are prohibited for all actors (agents and architecture humans). The implementation commit and the stamp commit MUST be separate commits. **RFC-0268 amendment:** if the RFC declares an `acceptance:` probe list in its frontmatter, this transition ADDITIONALLY requires a green `rfc.acceptance.run --id <rfc-id>` in the same session, and the transition commit MUST mention it. Prose criteria remain required reading; probes are the floor, not the ceiling.

## RFC execution gate

If a task requires a new RFC or a change to an existing non-accepted RFC, agents may only:

1. Create or edit the RFC while it remains `status: draft` or `status: reviewing`.
2. Run `rfc.validate`.
3. Stop and report that human architecture acceptance is required before implementation.

Agents MUST NOT implement any file, content, package, generator, workflow, or generated output listed, implied, or enabled by a `draft` or `reviewing` RFC. User wording such as "continue", "go on", "proceed", "implement", "do it", or "продолжаем" is not RFC acceptance and does not override the status gate. Only the RFC frontmatter status `accepted` or `implemented` permits implementation work.

**Exception — explicit implement skill invocation (RFC-0369):** When the operator explicitly invokes `/fo-idea-implement` with a specific RFC id, the operator's instruction IS the architecture acceptance. The agent MAY transition the RFC from `draft` or `reviewing` to `accepted` autonomously, set the default reviewer, and proceed through the full pipeline (audit → enhance → plan → implement → stamp implemented) without pausing for human confirmation of the status transition. This exception applies only to the implement skills — it does not extend to ad-hoc implementation requests or chat-level instructions.

Draft RFC text cannot grant implementation permission. A draft MUST NOT contain self-authorizing language such as "may proceed while draft", "operator-requested implementation is allowed before acceptance", "implementation can start before acceptance", or equivalent phrasing. If an agent finds such language, remove it or flag it for human architecture review instead of relying on it.

When blocked by this gate (and the implement-skill exception does not apply), use this stop response shape:

```md
RFC prepared: RFC-XXXX.
Status: draft.
I am stopping before implementation because human architecture acceptance is required.
Next allowed human action: set the RFC status to accepted, or invoke /fo-idea-implement to accept and implement in one step.
```

## What an agent MUST NOT do

- Perform any RFC status transition **other than** `accepted → implemented` — `draft → reviewing`, `reviewing → accepted`, `→ rejected`, and `→ superseded` remain reserved for humans with role `architecture` (RFC-0224). **Exception:** when the operator explicitly invokes `/fo-idea-implement`, the agent MAY transition `draft` or `reviewing` → `accepted` as part of the implementation pipeline (RFC-0369)
- Mark an RFC `implemented` while any of its acceptance criteria are unmet or unverified
- **RFC-0476:** Directly edit `status`, `implementedAt`, or `updatedAt` to transition an RFC to `implemented` outside the `rfc.implement.stamp` command. This applies to all actors — agents and architecture humans alike
- For RFCs created on or after 2026-07-07 that declare acceptance probes: stamp `implemented` without first running `rfc.verification.emit --id <id>` and committing the evidence file (RFC-0330 amended transition precondition)
- Treat chat approval, task continuation, or draft RFC wording as a substitute for `status: accepted`
- Implement files listed, implied, or enabled by an RFC while that RFC is still `draft` or `reviewing`
- Implement an architectural change that contradicts an `accepted` or `implemented` RFC
- Weaken or remove an enforcement rule established by an `implemented` RFC without first creating a new RFC that supersedes it
- Propose changes that conflict with accepted/implemented RFCs without explicitly noting the conflict

## Status transitions

```
draft ──────► reviewing   (architecture role)
reviewing ──► accepted    (architecture role, OR agent via /fo-idea-implement — RFC-0369)
draft ──────► accepted    (agent via /fo-idea-implement — RFC-0369)
          └─► rejected    (architecture role)
accepted ───► implemented (via rfc.implement.stamp — RFC-0476; architecture role or agent after verified+committed — RFC-0224)
any ────────► superseded  (architecture role)
```

## Reviewer identity recording (RFC-0335)

For every RFC decision made on or after 2026-07-07 (acceptance, rejection, or supersession), the deciding human records their identity in `reviewers` in the same edit that changes `status` — even when the RFC file itself was created before the cutoff. They may edit directly or explicitly instruct an agent to stamp a named identity. Agents MUST NOT populate `reviewers` on their own authority under any circumstances; `rfc.create` and templates MUST leave `reviewers: []` on drafts. **Exception:** when the operator explicitly invokes `/fo-idea-implement` and the RFC is still `draft` or `reviewing`, the agent reads the default reviewer(s) from the `reviewers` field comment in `os/rfc/rfc-0000-template.md` inside `@warpgogol/forge` (currently `human:andrii-syrokomskyi`) and sets them as part of the `draft → accepted` transition (RFC-0369). When performing the `accepted → implemented` transition (RFC-0224), agents carry the existing `reviewers` value forward unchanged — the acceptance reviewer covers the implementation transition, no new entry is added.

## Decision log consultation (RFC-0329)

Before drafting a new RFC, agents MUST run `rfc.create` (which prints related prior decisions from the decision log) and MUST address any relevant prior rejection in the new RFC's `## Alternatives considered` section — either distinguishing the new proposal from the rejected one or explicitly superseding it. Re-proposing a rejected decision without acknowledging it is a review-rejection ground.

## Mandatory escalation for blocked implementations (RFC-0334)

When an agent determines during implementation that an accepted RFC cannot be realized without violating a DNA invariant, an implemented RFC's contract, or a technical constraint the acceptance missed, the agent MUST stop implementing, run `rfc.supersede.propose` with the conflict stated, complete the TODO sections of the generated draft with its proposed alternative, and report the escalation. Working around the conflict in code — however locally reasonable — is prohibited. Implementation resumes only after a human decision on the proposal (acceptance, rejection with clarification, or amendment of the blocked RFC).

## Change impact derivation (RFC-0332)

After editing files and before choosing which checks to run, agents SHOULD run `change.impact.derive` and run the recommended profile. Before declaring work complete or transitioning an RFC to implemented, the full signal (`app.contract.full` / the pipelines named in the task) still applies — the derivation is an iteration-speed tool, not a readiness signal (DNA-35).

## Verification evidence emission (RFC-0330)

Before transitioning an RFC with acceptance probes to `implemented`, agents MUST run `rfc.verification.emit --id <rfc-id>` and commit the resulting `docs/rfcs/verification/<slug>.generated.json` evidence file. The evidence artifact records each probe result, the overall pass/fail, and a `generatedAt` timestamp. `rfc.validate` V-23 checks that the evidence file exists and reports `overall: "pass"` for implemented, probe-bearing, post-cutoff RFCs. Page probes are skipped during evidence emission (they require a built dist); run `qa.independent.run` separately to execute them.

## `satisfies` DNA-trace frontmatter (RFC-0331)

Architecture and contract RFCs created on or after 2026-07-07 MUST declare at least one DNA invariant in the `satisfies` frontmatter field (e.g. `satisfies: [DNA-23]`). Each entry must match `^DNA-\\d+$`. `rfc.validate` V-24 enforces both format and presence. Agents creating an RFC draft with `--kind architecture` or `--kind contract` must fill in `satisfies` before the RFC can be accepted. `rfc.dna.trace.validate` checks bidirectional coverage; `rfc.dna.trace.generate` emits `docs/rfcs/dna-trace.generated.json`.

## Independent black-box QA runner (RFC-0333)

`qa.independent.run --site <app>` serves `apps/<app>/dist/client` over a local static server and executes every `page` probe from accepted/implemented RFCs in headless Chromium via Playwright. It reads ONLY `dist/client` and RFC frontmatter — never app/package source — preserving independence. Diagnostics: `QA-IND-01` (assertion failure), `QA-IND-02` (missing dist), `QA-IND-03` (zero probes — fast path pass), `QA-IND-04` (Playwright not installed). The command runs in `sites-check-postbuild`; agents can also invoke it manually after a build. Page probes in RFC frontmatter use `probe: page` with required `path` (starting `/`) and optional `expectStatus`, `selector`, `textPattern`, `allowConsoleErrors`.

Agents perform only the `accepted → implemented` transition, and only under the preconditions above. All other transitions — including `draft → reviewing` — are human-only, **except** when the operator explicitly invokes `/fo-idea-implement`: in that case the agent MAY transition `draft` or `reviewing` → `accepted` as part of the implementation pipeline (RFC-0369).

## Acceptance criteria completeness and evidence (RFC-0463)

`rfc.validate` enforces two rules on acceptance criteria:

- **V-26**: If `status: implemented`, all top-level acceptance criteria checkboxes must be `[x]`. Any unchecked `[ ]` at `implemented` status is an error. Deferred work must be split into a follow-up RFC via `rfc.supersede.propose` (RFC-0334), not left unchecked.
- **V-27**: Every checked `[x]` acceptance criterion must carry an inline `(evidence: <file-path:line>, <test-or-command>)` annotation. Evidenceless `[x]` items are errors. The evidence must point to a real file in the codebase.

Both rules apply to all RFCs regardless of `createdAt` — these are document-quality rules, not metadata-cutoff rules. The `fo-idea-implement` skill step 3.6 requires semantic verification before marking a criterion `[x]`: mechanical existence (command registered, test passes) is NOT sufficient. If the code contains TODO, stub, or placeholder logic in the path the criterion covers, the criterion is NOT met.

## How to create an RFC draft

When an agent identifies a structural change not covered by an existing accepted RFC:

```sh
rtk pnpm exec werkstatt run rfc.create --title "Short imperative title" --kind architecture
```

Do not put `--` before the flags — `rfc.create` declares a typed flag schema (RFC-0260), and a leading `--` puts every following token into passthrough/positional mode instead of parsing them as flags.

**Never manually determine the RFC number.** Agents MUST NOT scan `docs/rfcs/` to find the highest RFC number and increment it. The RFC number space includes archived RFCs under `docs/rfcs/archive/` — a top-level-only scan misses them and produces duplicate IDs. `rfc.create` uses a recursive file scan (`listRfcFiles`) that covers the full `docs/rfcs/` tree including all archive subdirectories, so it always picks the correct next number. Always delegate number assignment to `rfc.create` (or `rfc.supersede.propose` / `spec.materialize` for those code paths).

After creation:

1. Fill in the body sections (Context, Problem, Decision, etc.)
2. Set `related` in frontmatter to relevant DNA, AP, or spec references. For `architecture` or `contract` RFCs, also set `satisfies` to at least one DNA invariant (RFC-0331)
3. Set `commands.proposed` if the RFC introduces new OS commands
4. Run `rfc.validate` to confirm the file is well-formed
5. Do NOT change status past `draft`

## When to run `rfc.check`

After any change that deletes or renames files declared in an RFC's `## File system responsibilities` table, or that modifies Feature Policy in content frontmatter, run:

```sh
rtk pnpm exec werkstatt run rfc.check --site <app-name>
```

This command verifies that every file and policy artifact referenced by accepted/implemented RFCs is still present. A non-zero exit code means an RFC contract is broken.

## When to run `rfc.acceptance.run` (RFC-0268)

Before self-transitioning an RFC from `accepted` to `implemented`, check whether it declares an `acceptance:` probe list in frontmatter. If it does, run:

```sh
rtk pnpm exec werkstatt run rfc.acceptance.run --id <rfc-id>
```

A green run (exit 0) is an ADDITIONAL precondition for the transition on top of the prose checkbox criteria — never mark the RFC `implemented` while a declared probe fails, even if the failure looks environmental; fix the environment or flag for human review instead. The transition commit must mention that `rfc.acceptance.run` passed. RFCs without an `acceptance:` block are unaffected — prose criteria remain the only gate.

## How to reference RFCs in code

When implementing an accepted RFC:

- Reference the RFC id in the PR description: `Implements RFC-0007`
- Add a JSDoc tag in the relevant command handler: `@rfc RFC-0007`
- After merge, add the command name to `commands.added` in the RFC frontmatter

## RFC frontmatter YAML discipline

RFC frontmatter is machine-parsed by the `rfc.validate` command. A single YAML syntax error in one file silently poisons the entire `allParsed` map, causing cascading false positives (e.g., `V-11 supersededBy does not match any existing RFC`). Agents MUST follow these YAML authoring rules:

**1. Always quote strings that start with a reserved character.** YAML 1.2 treats `@` and the backtick character as reserved in plain (unquoted) scalars. Any value beginning with one of these characters, or containing a free colon-space sequence (a colon followed by a space), must be wrapped in quotes:

```yaml
# Wrong — causes YAMLParseError: Plain value cannot start with reserved character
packagesImpacted:
  - @warpgogol/share
successSignals:
  - `pnpm build` from workspace root succeeds in one pass.

# Correct
packagesImpacted:
  - "@warpgogol/share"
successSignals:
  - "`pnpm build` from workspace root succeeds in one pass."
```

**2. Always quote strings that contain a free colon-space sequence.** Colons followed by a space inside a plain scalar can be parsed as a nested mapping key:

```yaml
# Wrong — parsed as nested mapping, breaks the whole file
removed:
  - per-section shapes (items: string[], cards: ApproachCard[])

# Correct
removed:
  - "per-section shapes (items: string[], cards: ApproachCard[])"
```

**3. Use single quotes when the string itself contains unescaped double quotes.** If a quoted YAML value contains backtick-wrapped text that itself includes `"`, YAML double-quote escaping becomes fragile. Prefer single quotes (YAML does not process escape sequences inside single quotes):

```yaml
# Wrong — internal double quotes terminate the YAML string early
successSignals:
  - "First `pnpm dev` produces a page (no raw `{"items":[]}` JSON)."

# Correct
successSignals:
  - 'First `pnpm dev` produces a page (no raw `{"items":[]}` JSON).'
```

**4. Keep frontmatter `title` identical to the body H1 heading (V-15).** The validator checks that `title:` matches exactly the text after `# RFC-NNNN:` in the body. Mismatches produce a warning:

```yaml
# Wrong — frontmatter title is longer than body heading
title: "section.scaffold must emit a content-aware starter, not a JSON.dump"
# Body:
# # RFC-0093: section.scaffold must emit a content-aware starter

# Correct
title: "section.scaffold must emit a content-aware starter"
```

**5. Use only valid `kind` and `status` values.** The closed enums are enforced by `rfc.validate`:

- `kind`: `architecture`, `contract`, `command`, `policy`, `deprecation` — **no other values** (e.g., `process` is rejected).
- `status`: `draft`, `reviewing`, `accepted`, `implemented`, `rejected`, `superseded`.

**6. Do not use `supersededBy` as a YAML list.** `supersededBy` must be a single scalar string (or empty), never a YAML sequence:

```yaml
# Wrong
supersededBy:
  - RFC-0103

# Correct
supersededBy: RFC-0103
```

**7. Include all required sections for the RFC kind.**

- Every RFC (`kind: architecture | contract | command | policy | deprecation`) uses the full template and requires: `## Context`, `## Problem`, `## Decision`, `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.

**8. RFC filenames must be lowercase kebab-case.** The entire filename — including the `rfc-` prefix — must be lowercase. The generator already emits `rfc-0230-kebab-title.md`; agents must never create or rename an RFC file with an uppercase `RFC-` prefix.

**9. Directory structure changes under `docs/rfcs/` and `docs/adrs/` require an accepted ADR.** Agents MUST NOT create new subdirectories in these paths without an accepted ADR defining the convention, the creation command behavior, and the archive flow. The only sanctioned subdirectories are `archive/` (RFC-0367) and `verification/` (generated JSON, not RFC files).

Agents MUST run `rfc.validate <id>` immediately after authoring or editing any RFC file. A clean pass is required before considering the RFC draft complete.
