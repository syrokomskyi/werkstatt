---
id: RFC-0311
title: "Submit changed site URLs to IndexNow after deploy"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0052
  - RFC-0269
  - RFC-0307
commands:
  proposed:
    - indexnow.key.generate
    - indexnow.key.validate
    - indexnow.submit
    - indexnow.submit.validate
  added:
    - indexnow.key.generate
    - indexnow.key.validate
    - indexnow.submit
    - indexnow.submit.validate
  changed:
    - site.bordbuch.generate
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-deploy"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "Every site has a generated, valid IndexNow key file in public/."
  - "After deployment, the site submits changed canonical page URLs to IndexNow in bulk."
  - "IndexNow submissions are logged as Bordbuch events when Bordbuch is enabled."
nonGoals:
  - "Do not submit Markdown twins, static assets, API routes, or internal well-known artifacts to IndexNow."
  - "Do not implement Google Search Console recrawl automation in this RFC."
  - "Do not create per-site secret IndexNow keys; the key is deterministic and public by protocol."
acceptance:
  - probe: command-registered
    name: "indexnow.key.generate"
  - probe: command-registered
    name: "indexnow.key.validate"
  - probe: command-registered
    name: "indexnow.submit"
---

# RFC-0311: Submit changed site URLs to IndexNow after deploy

## Context

The audit found no IndexNow key in `public/`. The owner decision is to add IndexNow for every site and submit page URLs in bulk after deploy.

## Problem

Search engines that support IndexNow cannot accept submissions without a valid key file, and stale titles or changed PSEO routes may remain indexed longer than necessary. Manual submission per site does not scale across a generated fleet.

## Decision

Every app receives a deterministic IndexNow key derived from the app/project id:

```text
<app-id>-indexnow
```

Example:

```text
key:  warpgogol-com-indexnow
file: public/warpgogol-com-indexnow.txt
body: warpgogol-com-indexnow
```

The key file is UTF-8 text. The key inside the file must strictly match the filename without `.txt`.

## Architectural fit

The key file is a generated public artifact covered by RFC-0307. Submissions are deploy/postdeploy operations and may record Bordbuch events through RFC-0276 when a site has a ledger. URL selection uses existing sitemap and behavior-snapshot surfaces rather than app-local lists.

## Design

## Key Constraints

`indexnow.key.validate` enforces:

- length 8 to 128 characters;
- characters only `a-z`, `A-Z`, `0-9`, and `-`;
- filename exactly `<key>.txt`;
- file body exactly `<key>` with optional single trailing LF only;
- UTF-8 encoding;
- generated ownership for all managed apps.

Invalid keys are build/deploy errors because IndexNow returns hard API failures for them.

## URL Selection

`indexnow.submit` submits canonical public HTML page URLs only.

Include:

- routes in `sitemap.xml` that are canonical HTML pages;
- changed/new canonical pages detected from the behavior snapshot diff, deploy manifest, or a provided URL list;
- full sitemap page set when `--all` is explicitly passed.

Exclude:

- `.md` twins;
- images/assets/fonts/scripts;
- `robots.txt`, `ai.txt`, `humans.txt`, manifests, key files;
- `/api/*`;
- `.well-known/*`;
- noindex pages;
- redirects.

If the changed URL set is unavailable, deployment may submit all canonical sitemap page URLs in one or more batches. This is acceptable for v1.

## Commands

### indexnow.key.generate

Scope: app.

Writes `public/<app-id>-indexnow.txt` with body `<app-id>-indexnow`.

It derives `<app-id>` from the app id used by the workspace/app manifest, not from the domain.

### indexnow.key.validate

Scope: app, read-only.

Validates key constraints above and ensures `robots.txt` or other public declarations do not block the key file.

This command is fail-hard in `build.check` and `apps-check.author`.

### indexnow.submit

Scope: app, networked deploy/postdeploy command.

Inputs:

```sh
pnpm exec site-kernel run indexnow.submit --app <app> --base-url <https-url> --json
pnpm exec site-kernel run indexnow.submit --app <app> --base-url <https-url> --all --json
pnpm exec site-kernel run indexnow.submit --app <app> --urls changed-urls.json --json
```

Behavior:

- validates the key before submitting;
- verifies the key file is reachable at `<base-url>/<key>.txt` before submitting in live mode;
- sends URL batches to the IndexNow endpoint;
- retries transient network failures with bounded backoff;
- treats IndexNow validation errors (`4xx`) as failures with diagnostics;
- emits a summary containing attempted/submitted/failed counts and response status details.

### indexnow.submit.validate

Scope: app/workspace, fixture/offline.

Validates:

- payload shape;
- URL filtering;
- batching behavior;
- key-file URL derivation;
- diagnostic handling for simulated `422`.

## Bordbuch Event

When an app has `src/bordbuch/events.ndjson`, a successful live submission appends an event:

```json
{
  "kind": "indexnow.submit",
  "appId": "warpgogol-com",
  "key": "warpgogol-com-indexnow",
  "urlCount": 42,
  "submittedAt": "2026-07-05T00:00:00.000Z",
  "batchHash": "<sha256>"
}
```

Do not store API response bodies if they contain unexpected data. Store status, counts, and hashes.

## Pipeline Placement

- `indexnow.key.generate` runs in `build.prepare`.
- `indexnow.key.validate` runs in `build.check` and `apps-check.author`.
- `indexnow.submit.validate` runs in package/workspace checks.
- `indexnow.submit` runs after deployment, once the deployed key file is reachable.

## Rollout

1. Implement deterministic key generation and validation.
2. Add key files to both reference apps through `build.prepare`.
3. Implement fixture validation for payload filtering and API errors.
4. Wire live submission into deploy/postdeploy with explicit base URL.
5. Add Bordbuch event logging for successful live submissions.

## Alternatives considered

- **Generate random per-site keys.** Rejected by owner decision; the key is deterministic from app id.
- **Submit every public URL.** Rejected; IndexNow receives canonical HTML pages only.
- **Run live submission during local builds.** Rejected; network submission belongs after deploy.

## Risks

- **API rejects malformed keys.** Mitigated by fail-hard key validation.
- **Submitting URLs before key file is live.** Mitigated by reachability check before live submit.
- **Over-submitting unchanged pages.** Accepted for v1 when a changed URL set is unavailable; still bounded to canonical sitemap pages.

## Acceptance criteria

- [x] Every app emits `public/<app-id>-indexnow.txt`. (evidence: implemented historically)
- [x] `warpgogol-com` emits `public/warpgogol-com-indexnow.txt` containing exactly (evidence: implemented historically) `warpgogol-com-indexnow`.
- [x] `indexnow.key.validate` fails on invalid characters, invalid length, body/filename mismatch, (evidence: implemented historically) and non-UTF-8 content.
- [x] `indexnow.submit` filters out non-canonical URLs and Markdown twins. (evidence: implemented historically)
- [x] Live submission is logged in Bordbuch for apps that have Bordbuch enabled. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

**As-built, 2026-07-06:** `indexnow.key.generate` and `indexnow.key.validate` are registered and wired into build preparation/author checks. `indexnow.submit` resolves canonical HTML pages from local sitemap indexes and nested sitemap files, intersects explicit `--urls` input with the current canonical sitemap set, excludes Markdown twins/static/API/well-known artifacts, checks the deployed key file before live submission, posts bounded batches with transient retry handling, and appends a Bordbuch `indexnow.submit` event after successful live submission when the app has `src/bordbuch/events.ndjson`. `indexnow.submit.validate` is in `PACKAGES_CHECK_PIPELINE`; fixture coverage locks down payload shape, key-file URL derivation, URL filtering, batching, and deterministic batch hashes. Verified with `indexnow.key.validate` for all apps, `indexnow.submit.validate`, dry-run submissions for `warpgogol-com` and `nicaragua-projekt`, package TypeScript checks, command manifest validation, ACP validation, and `rfc.validate`.

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not generate random keys; the deterministic app-id key is the owner decision.
- Do not block local builds on live IndexNow network calls.
- Do not submit URLs before the deployed key file is reachable.
