---
rfcId: RFC-0784
planId: PLAN-RFC-0784-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0784

## 1. Objectives

- [ ] O1 — `buildRobotsTxt()` outputs `Content-Signal:` line when `contentSignal` is present in `RobotsPolicy` (acceptance criterion 1)
- [ ] O2 — `RobotsPolicy` interface has `contentSignal?: string[]` field (acceptance criterion 2)
- [ ] O3 — `robots.generate` passes `contentSignal` from `system.md` robots block or default (acceptance criterion 3)
- [ ] O4 — `_headers.template` includes `{{AGENT_LINK_HEADERS}}` token with Link headers for all 5 agent discovery endpoints (acceptance criterion 4)
- [ ] O5 — `public.infrastructure.generate` resolves `AGENT_LINK_HEADERS` token based on `agent.enabled` flag (acceptance criterion 5)
- [ ] O6 — `headers.security.validate` includes `HDR-05` rule for Link header presence (acceptance criterion 6)
- [ ] O7 — `robots.validate` includes `PUBTXT-CS` rule for Content-Signal directive presence (acceptance criterion 7)
- [ ] O8 — `HDR-05` is silent when `agent.enabled: false` (acceptance criterion 8)
- [ ] O9 — Existing validators still pass (acceptance criteria 9, 10)
- [ ] O10 — `rfc.validate` passes (acceptance criterion 13)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/share/semantic/robots.ts` — add `contentSignal?: string[]` to `RobotsPolicy`, emit `Content-Signal:` line in `buildRobotsTxt()`
- `packages/werkstatt-site/src/checks/robots.ts` — `runRobotsGenerate`: read `contentSignal` from manifest robots block, pass default when absent; `runRobotsValidate`: add `PUBTXT-CS` rule
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template` — add `{{AGENT_LINK_HEADERS}}` token to `/*` block
- `packages/werkstatt-site/src/codegen/app-boilerplate.ts` — `runGeneratePublicInfrastructure`: resolve `AGENT_LINK_HEADERS` token from manifest `agent.enabled` flag
- `packages/werkstatt-site/src/checks/public-surface/security.ts` — `runHeadersSecurityValidate`: add `HDR-05` rule

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. The `contentSignal` field is a new optional field in `system.md` robots block — no schema change needed (robots block is read as `Record<string, unknown>` already).

### 2.3 Documentation and specs

- RFC file (read-only reference).
- No `AGENTS.md` updates needed — no new commands, no new modules, no new contracts.
- No `docs/*.xml` Compass files require synchronization (explicitly stated in RFC).
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `headers.security.validate` — new `HDR-05` rule
- `robots.validate` — new `PUBTXT-CS` rule
- Both validators already run in `build.prepare` — no pipeline changes needed.

## 3. Step sequence

### Step 1. Contracts — `RobotsPolicy` interface and `buildRobotsTxt()` output

**Goal:** Add `contentSignal` field to `RobotsPolicy` and emit `Content-Signal:` line in `buildRobotsTxt()`.

**Agent actions:**

- Add `contentSignal?: string[]` to `RobotsPolicy` interface in `packages/werkstatt-site/src/domain/share/semantic/robots.ts`
- In `buildRobotsTxt()`, after the header comment and before the `User-agent: *` block, emit `Content-Signal: <comma-joined values>` when `policy.contentSignal` is a non-empty array
- When `contentSignal` is absent or empty, omit the line silently — `buildRobotsTxt()` has no fallback logic

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `buildRobotsTxt({ contentSignal: ["text/html", "text/markdown"] })` output contains `Content-Signal: text/html, text/markdown` after the header comment and before `User-agent: *`. `buildRobotsTxt({})` output does not contain `Content-Signal:`.

**Human review:** no

---

### Step 2. Commands — `robots.generate` passes `contentSignal`, `robots.validate` adds PUBTXT-CS

**Goal:** Wire `contentSignal` from manifest to `buildRobotsTxt()` and add validation rule.

**Agent actions:**

- In `runRobotsGenerate` (`packages/werkstatt-site/src/checks/robots.ts`): read `contentSignal` from `robotsRaw.contentSignal` in the manifest robots block. When absent, pass default `["text/html", "text/markdown", "application/ld+json", "text/plain"]`. Add `contentSignal` to the `policy` object passed to `buildRobotsTxt()`.
- In `runRobotsValidate` (`packages/werkstatt-site/src/checks/robots.ts`): add a check for `Content-Signal:` directive presence. If absent, push a violation with `ruleId: "PUBTXT-CS"`, `severity: "error"`, message: `robots.txt does not contain a Content-Signal directive.`, fixHint: `Run robots.generate.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `robots.generate` output contains `Content-Signal:` line. `robots.validate` fails when `Content-Signal:` is absent from `robots.txt`.

**Human review:** no

---

### Step 3. Commands — `_headers.template` and `public.infrastructure.generate` Link headers

**Goal:** Add `{{AGENT_LINK_HEADERS}}` token to template and resolve it based on `agent.enabled`.

**Agent actions:**

- In `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template`: add `{{AGENT_LINK_HEADERS}}` token at the end of the `/*` block (after `X-DNS-Prefetch-Control: on`)
- In `runGeneratePublicInfrastructure` (`packages/werkstatt-site/src/codegen/app-boilerplate.ts`): read `agent.enabled` from manifest. When `agent.enabled !== false`, set `AGENT_LINK_HEADERS` token to the 5 Link header lines:
  ```
  Link: < /.well-known/agent.json>; rel="service-meta"; type="application/json"
  Link: < /.well-known/agent.openapi.json>; rel="service-desc"; type="application/json"
  Link: < /.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"
  Link: < /.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"
  Link: < /llms.txt>; rel="service-doc"; type="text/plain"
  ```
  When `agent.enabled: false`, set `AGENT_LINK_HEADERS` to empty string.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `public.infrastructure.generate` output (`_headers`) contains 5 `Link:` headers in `/*` block when `agent.enabled !== false`. When `agent.enabled: false`, no `Link:` headers in output.

**Human review:** no

---

### Step 4. Validation — `HDR-05` rule in `headers.security.validate`

**Goal:** Add build-time validation for Link header presence.

**Agent actions:**

- In `runHeadersSecurityValidate` (`packages/werkstatt-site/src/checks/public-surface/security.ts`): add `HDR-05` rule. Read `agent.enabled` from manifest. When `agent.enabled !== false`, check for `Link:` header containing `/.well-known/agent.json` in the `/*` section of `_headers`. If absent, push diagnostic with `ruleId: "HDR-05"`, `severity: "error"`, message: `_headers /* block must contain Link header pointing to /.well-known/agent.json when agent.enabled !== false.`, fixHint: `Rerun public.infrastructure.generate.`
- When `agent.enabled: false`, `HDR-05` is silent — no check, no error.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `headers.security.validate` reports `HDR-05` error when `Link:` header is absent and `agent.enabled !== false`. No error when `agent.enabled: false`.

**Human review:** no

---

### Step 5. Tests — unit tests for new functionality

**Goal:** Add unit tests covering all new behavior.

**Agent actions:**

- Test `buildRobotsTxt()` with `contentSignal` present → output contains `Content-Signal:` line in correct position
- Test `buildRobotsTxt()` without `contentSignal` → output does not contain `Content-Signal:`
- Test `runRobotsGenerate` passes default `contentSignal` when absent from manifest
- Test `runRobotsValidate` fails when `Content-Signal:` absent
- Test `runGeneratePublicInfrastructure` output contains Link headers when `agent.enabled !== false`
- Test `runGeneratePublicInfrastructure` output has no Link headers when `agent.enabled: false`
- Test `runHeadersSecurityValidate` reports `HDR-05` when Link header absent and `agent.enabled !== false`
- Test `runHeadersSecurityValidate` is silent when `agent.enabled: false`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All new tests pass. Existing tests still pass.

**Human review:** no

---

### Step 6. Validation — full validation suite

**Goal:** Run all validation commands to verify the implementation.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0784`

**Validation:**

- All commands exit 0.

**Completion criterion:** All three commands pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — no new commands, no new modules.
- No `docs/*.xml` Compass files need synchronization (explicitly stated in RFC).
- No `docs/architecture-dna.md` changes.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (they didn't — no new commands).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. Criteria 11-12 (isitagentready.com) require post-deploy verification — mark as `[ ]` with note "requires post-deploy verification".
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0784 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0784`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all checkable acceptance criteria are checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0784`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` is not required.
- Commit messages referencing `RFC-0784` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Header size — 5 Link headers add ~400 bytes | Step 3 — static template, measured by existing HDR rules |
| Content-Signal spec status — draft directive | Step 1 — single line, harmless if ignored |
| Link header rel values — not registered IANA types | Step 3 — matches isitagentready.com expectations |
| Agent misinterpretation — follow Link before .well-known | Both paths lead to same discovery surface — no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-34, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0784 --reason "..." --invariant "DNA-34"` instead of working around it.
