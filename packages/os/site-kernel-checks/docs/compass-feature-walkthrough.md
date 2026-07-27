# Compass Feature Walkthrough: Auto Changelog System

> **What this document is.** A step-by-step example of developing a real feature — an AI-powered changelog generator — using the full Compass lifecycle. Every phase, every artifact, every skill invocation is shown concretely.

---

## Table of contents

0. [The feature we are building](#0-the-feature)
1. [compass-init — Bootstrap project structure](#1-compass-init)
2. [requirements.xml — Define what the system must do](#2-requirements)
3. [technology.xml — Lock the stack](#3-technology)
4. [compass-plan — Design the architecture](#4-compass-plan)
5. [compass-verification — Design tests and traces before code](#5-compass-verification)
6. [compass-execute — Implement modules one by one](#6-compass-execute)
7. [compass-multiagent-execute — Parallel-safe waves](#7-compass-multiagent-execute)
8. [compass-refresh — Sync graph after changes](#8-compass-refresh)
9. [compass-reviewer — Integrity audit](#9-compass-reviewer)
10. [compass-refactor — Safe structural changes](#10-compass-refactor)
11. [compass-fix — Debug via semantic navigation](#11-compass-fix)
12. [compass-status — Health report](#12-compass-status)

---

## 0. The feature

**Auto Changelog System** — a TypeScript pipeline that:

- Detects release windows (weekly / monthly)
- Collects git commits for the period
- Classifies each commit via AI (type, severity, breaking, confidence)
- Groups related commits into business-level features
- Writes human-readable Markdown changelog sections
- Bumps SemVer with confidence-gated breaking change detection
- Rebuilds an index CHANGELOG.md with dynamic markers

The system has 8 modules, 3 AI agents, a SQLite cache with WAL mode, rate limiting, prompt injection protection, and a CI/CD workflow.

---

## 1. compass-init

> **Skill:** `$compass-init` **When:** You are starting the project from scratch.

Run the skill. It asks for project info, then scaffolds:

```
docs/
  requirements.xml          ← from template, $PROJECT_NAME filled in
  technology.xml            ← from template, $LANGUAGE, $RUNTIME filled in
  development-plan.xml      ← empty structure, ready for compass-plan
  verification-plan.xml     ← empty structure, ready for compass-verification
  knowledge-graph.xml       ← empty graph, ready for modules
  operational-packets.xml   ← canonical packet/delta/failure shapes
AGENTS.md                   ← project principles, Compass references
```

### What you tell the skill

```
Project: changelog-system
Annotation: AI-powered changelog generation from git history
Keywords: changelog, semver, ai-agents, git, typescript
Language: TypeScript 5.x, Node.js 24
Framework: none (CLI tool)
Libraries: simple-git, better-sqlite3, zod, p-limit, semver
Testing: vitest, deterministic assertions first
Logging: structured console (module, function, block)
Critical flows:
  - AI classification with cache + fallback
  - SemVer bump with confidence gating
  - Atomic file write with idempotency
```

### Result

The skill creates all 7 files from templates. `AGENTS.md` gets the project annotation and keywords. The docs are empty shells, ready for planning.

**Next step:** Fill `requirements.xml` with use cases, then fill `technology.xml`.

---

## 2. requirements.xml

> **Manual step.** You fill this in based on the product spec.

```xml
<requirements>
  <meta>
    <version>1.0.0</version>
  </meta>

  <UseCases>
    <UC-01 NAME="Detect release window">
      Schedule-based trigger (weekly/monthly) that fires only
      when unreleased commits exist in the period window.
    </UC-01>

    <UC-02 NAME="Collect and sanitize commits">
      Extract commits from git log, parse conventional commit format,
      extract tree hash and diff summary, sanitize all text fields
      before AI processing.
    </UC-02>

    <UC-03 NAME="AI classification with cache">
      Classify each commit via LLM (type, severity, module, breaking,
      confidence). Use composite cache key (tree hash + files + diff +
      prompt hash + model version). SQLite WAL mode for CI concurrency.
      Rate-limit AI calls via p-limit(5).
    </UC-03>

    <UC-04 NAME="Semantic grouping">
      Cluster 50+ technical commits into 5-7 business-level groups
      based on file path overlap and semantic proximity.
    </UC-04>

    <UC-05 NAME="Human-readable writing">
      Generate changelog sections as coherent prose, not line-by-line
      concatenation. Past tense, no marketing.
    </UC-05>

    <UC-06 NAME="Confidence-gated SemVer bump">
      Calculate next version deterministically. Breaking changes with
      AI confidence < 0.85 produce a warning, not an automatic major/minor
      bump. Major version is hard-locked.
    </UC-06>

    <UC-07 NAME="Atomic file output">
      Write versioned changelog files (changelog-YYYY-MM-DD-vX.Y.Z.md).
      Rebuild index CHANGELOG.md entirely. Restore dynamic markers if
      missing. All writes via tmp + rename.
    </UC-07>

    <UC-08 NAME="CI/CD integration">
      GitHub Actions workflow: scheduled weekly, caches SQLite DB,
      commits result automatically.
    </UC-08>
  </UseCases>
</requirements>
```

---

## 3. technology.xml

> **Manual step.** Lock the tech stack before planning modules.

```xml
<technology>
  <meta><version>1.0.0</version></meta>

  <stack>
    <runtime>Node.js 24</runtime>
    <language>TypeScript 5.x (strict mode)</language>
    <validation>zod — all boundaries</validation>
    <git>simple-git</git>
    <database>better-sqlite3 (WAL mode, busy_timeout=5000)</database>
    <semver>semver (npm package)</semver>
    <rate-limiting>p-limit(5)</rate-limiting>
    <ai>OpenAI / Anthropic via AI SDK, temperature=0</ai>
    <testing>vitest — deterministic assertions first</testing>
    <cli>commander</cli>
  </stack>
</technology>
```

---

## 4. compass-plan

> **Skill:** `$compass-plan` **When:** Requirements + technology are defined. **Output:** `development-plan.xml`, `verification-plan.xml`, `knowledge-graph.xml`

### Phase 1: Analyze requirements

The skill reads `requirements.xml` and identifies 10 modules:

### Phase 2: Design module architecture

```
┌─────────────────────────────────────────────────────┐
│  Module Breakdown (proposed by compass-plan)           │
├──────────┬──────────────┬───────────────────────────┤
│ ID       │ Type         │ Purpose                   │
├──────────┼──────────────┼───────────────────────────┤
│ M-CONFIG │ UTILITY      │ Typed config + Zod schema │
│ M-TYPES  │ UTILITY      │ Shared Zod types          │
│ M-SCHED  │ CORE_LOGIC   │ Release window detection  │
│ M-GIT    │ DATA_LAYER   │ Git log extraction        │
│ M-SANIT  │ UTILITY      │ Prompt injection guard    │
│ M-CACHE  │ DATA_LAYER   │ SQLite WAL + file cache   │
│ M-LIMIT  │ UTILITY      │ p-limit rate limiter      │
│ M-CLASS  │ CORE_LOGIC   │ AI classifier agent       │
│ M-GROUP  │ CORE_LOGIC   │ AI grouper agent          │
│ M-WRITE  │ CORE_LOGIC   │ AI writer agent           │
│ M-BUMPER │ CORE_LOGIC   │ SemVer with confidence    │
│ M-INDEX  │ CORE_LOGIC   │ CHANGELOG.md rebuilder    │
│ M-MAIN   │ ENTRY_POINT  │ CLI orchestrator          │
└──────────┴──────────────┴───────────────────────────┘
```

### Phase 3: Design verification surfaces

For each module, the skill proposes verification refs:

```
V-M-CACHE:
  - test: cache hit returns identical result
  - test: composite key changes when files differ
  - test: SQLite WAL handles concurrent reads
  - log marker: [M-CACHE][buildCacheKey][KEY_COMPUTED]

V-M-BUMPER:
  - test: feat → minor bump
  - test: breaking + confidence >= 0.85 → minor bump + warning
  - test: breaking + confidence < 0.85 → patch + requiresReview
  - test: major bump attempt → throws
  - log marker: [M-BUMPER][calculateNextVersion][CONFIDENCE_CHECK]
```

### Phase 4: Mental walkthroughs

The skill runs 2-3 scenario walkthroughs:

> **Scenario: Weekly release with one breaking change (confidence 0.7)**
>
> 1. M-SCHED detects Monday → triggers
> 2. M-GIT collects 23 commits since last release
> 3. M-SANIT cleans text fields
> 4. M-CACHE checks each commit → 18 cache hits, 5 misses
> 5. M-LIMIT throttles the 5 AI calls to concurrency 5
> 6. M-CLASS returns one commit with `isBreaking: true, confidence: 0.7`
> 7. M-BUMPER sees confidence < 0.85 → bump = patch, requiresReview = true
> 8. M-GROUP clusters 22 commits into 4 groups
> 9. M-WRITE produces 4 sections
> 10. M-INDEX writes `changelog-2026-04-05-v1.5.4.md`, rebuilds index
> 11. M-MAIN logs `⚠️ Low-confidence breaking changes detected`
>
> **Risk:** If M-CACHE key collision occurs, M-CLASS returns stale result. **Mitigation:** Composite key includes files + diff + prompt hash.

### Phase 5: Generate artifacts

After user approval, `compass-plan` writes:

- **`docs/development-plan.xml`** — 13 modules with contracts, target paths, implementation order (3 phases), data flows (DF-01..DF-04)
- **`docs/verification-plan.xml`** — V-M-xxx stubs for every module, critical scenarios, required log markers
- **`docs/knowledge-graph.xml`** — 13 M-xxx entries with CrossLinks

```xml
<!-- Example: knowledge-graph.xml entry -->
<M-BUMPER NAME="version-bumper" TYPE="CORE_LOGIC">
  <fn-calculateNextVersion />
  <type-BumpResult />
  <CrossLink target="M-CLASS" relation="consumes" />
  <CrossLink target="M-TYPES" relation="uses" />
  <verification-ref>V-M-BUMPER</verification-ref>
</M-BUMPER>
```

---

## 5. compass-verification

> **Skill:** `$compass-verification` **When:** Plan is approved, BEFORE writing any code. **Output:** updated `verification-plan.xml`, test skeletons, log conventions

### Derive verification targets

For M-BUMPER, the skill extracts from the contract:

| Scenario | Evidence type | Expected |
| --- | --- | --- |
| Only fixes → patch | Deterministic assert | `1.5.3` → `1.5.4` |
| One feat → minor | Deterministic assert | `1.5.3` → `1.6.0` |
| Breaking, confidence 0.9 → minor + flag | Deterministic assert | `requiresReview: false` |
| Breaking, confidence 0.7 → patch + review | Deterministic assert | `requiresReview: true` |
| Major guard violation | Deterministic assert | throws Error |
| Low-confidence warning | Trace assertion | `console.warn` called with message pattern |

### Design observability

```
Log markers for M-BUMPER:
  [M-BUMPER][calculateNextVersion][CONFIDENCE_CHECK] confidence={n}, threshold={t}
  [M-BUMPER][calculateNextVersion][MAJOR_GUARD] attempted={v}, blocked=true

Log markers for M-CACHE:
  [M-CACHE][get][HIT] key={k}
  [M-CACHE][get][MISS] key={k}
  [M-CACHE][openDb][WAL_ENABLED]
```

### Write verification-plan.xml

```xml
<V-M-BUMPER>
  <test-file>test/version-bumper.test.ts</test-file>
  <command>vitest run test/version-bumper.test.ts</command>
  <scenarios>
    <scenario name="patch-only">
      Only fix/chore commits → patch bump.
    </scenario>
    <scenario name="feat-present">
      At least one feat → minor bump, patch reset.
    </scenario>
    <scenario name="breaking-high-confidence">
      isBreaking + confidence >= 0.85 → minor + hasBreakingChanges.
    </scenario>
    <scenario name="breaking-low-confidence">
      isBreaking + confidence < 0.85 → patch + requiresReview.
    </scenario>
    <scenario name="major-guard">
      Bump that would change major → throws.
    </scenario>
  </scenarios>
  <required-markers>
    <marker>[M-BUMPER][calculateNextVersion][CONFIDENCE_CHECK]</marker>
    <marker>[M-BUMPER][calculateNextVersion][MAJOR_GUARD]</marker>
  </required-markers>
</V-M-BUMPER>
```

### Write test skeletons

```typescript
// test/version-bumper.test.ts
// MODULE_CONTRACT: Tests for M-BUMPER confidence-gated SemVer logic

describe("calculateNextVersion", () => {
  it("bumps patch for fix-only commits", () => {
    const result = calculateNextVersion("1.5.3", [fixCommit], 0.85);
    expect(result.version).toBe("1.5.4");
    expect(result.requiresReview).toBe(false);
  });

  it("bumps minor when feat is present", () => {
    const result = calculateNextVersion("1.5.3", [featCommit], 0.85);
    expect(result.version).toBe("1.6.0");
  });

  it("gates breaking changes on confidence threshold", () => {
    const lowConfBreaking = { ...breakingCommit, confidence: 0.7 };
    const result = calculateNextVersion("1.5.3", [lowConfBreaking], 0.85);
    expect(result.version).toBe("1.5.4"); // NOT minor
    expect(result.requiresReview).toBe(true); // flagged
  });

  it("throws on major version change", () => {
    expect(() => calculateNextVersion("0.9.9", [featCommit], 0.85)).toThrow(
      "Major version guard violated",
    );
  });
});
```

---

## 6. compass-execute

> **Skill:** `$compass-execute` **When:** Plan + verification are ready. Sequential implementation.

### Step 1: Load execution queue

```
Execution Queue:
Phase 1: Foundation
  Step 1: M-CONFIG  — typed configuration
  Step 2: M-TYPES   — shared Zod schemas
  Step 3: M-SANIT   — prompt sanitizer
  Step 4: M-LIMIT   — rate limiter wrapper

Phase 2: Core Pipeline
  Step 5: M-SCHED   — release window detection
  Step 6: M-GIT     — git log extraction
  Step 7: M-CACHE   — SQLite WAL + file cache
  Step 8: M-CLASS   — AI classifier agent
  Step 9: M-GROUP   — AI grouper agent
  Step 10: M-WRITE  — AI writer agent

Phase 3: Output & Orchestration
  Step 11: M-BUMPER — SemVer with confidence
  Step 12: M-INDEX  — CHANGELOG.md rebuilder
  Step 13: M-MAIN   — CLI orchestrator
```

### Step 2: Execute step 7 (M-CACHE) — example

The controller builds an **execution packet**:

```yaml
Module: M-CACHE
Purpose: Composite-key AI cache with SQLite WAL + file fallback
Target files:
  - scripts/changelog/core/ai-cache.ts
Test files:
  - test/ai-cache.test.ts
Write scope: [scripts/changelog/core/ai-cache.ts, test/ai-cache.test.ts]
Contract excerpt:
  PURPOSE: Cache AI classification results using composite key
  DEPENDS: [M-TYPES, M-CONFIG]
  LINKS: [M-CLASS, M-GROUP, M-WRITE]
Verification excerpt:
  command: vitest run test/ai-cache.test.ts
  scenarios: [cache-hit, cache-miss, composite-key-stability, wal-concurrent]
  markers: [M-CACHE][get][HIT], [M-CACHE][get][MISS], [M-CACHE][openDb][WAL_ENABLED]
Graph delta (expected):
  imports: [better-sqlite3, node:crypto, node:fs/promises]
  exports: [buildCacheKey, openDb, getFromFileCache, setFileCache]
```

#### 2a. Implement

The agent writes `ai-cache.ts` with full Compass markup:

```typescript
/*
<MODULE_CONTRACT>
  <purpose>Cache AI results using composite key resilient to cherry-pick.</purpose>
  <responsibilities>
    <item>Build composite cache keys from tree hash + files + diff + prompt + model.</item>
    <item>Open SQLite with WAL mode and busy_timeout for CI concurrency.</item>
    <item>Provide file-based fallback for environments without SQLite.</item>
  </responsibilities>
  <non-goals>
    <item>AI call execution — that belongs to M-CLASS/M-GROUP/M-WRITE.</item>
  </non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="cacheKey">Composite cache key builder.</entry>
  <entry key="sqlite">SQLite WAL database operations.</entry>
  <entry key="fileFallback">File-based cache for SQLite-free environments.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial implementation: composite key, WAL mode, file fallback.</item>
</CHANGE_SUMMARY>
*/

// START_BLOCK_CACHE_KEY
export function buildCacheKey(params: { ... }): string {
  // CONTRACT: deterministic hash from 5 components
  // [M-CACHE][buildCacheKey][KEY_COMPUTED]
  ...
}
// END_BLOCK_CACHE_KEY

// START_BLOCK_SQLITE
export function openDb(path: string): Database.Database {
  // CONTRACT: opens DB in WAL mode with busy_timeout
  // [M-CACHE][openDb][WAL_ENABLED]
  ...
}
// END_BLOCK_SQLITE
```

#### 2b. Scoped review

The reviewer checks:

- MODULE_CONTRACT matches the execution packet ✓
- Imports match DEPENDS (better-sqlite3, node:crypto) ✓
- Log markers present: `[M-CACHE][get][HIT]`, `[M-CACHE][openDb][WAL_ENABLED]` ✓
- Tests pass: `vitest run test/ai-cache.test.ts` ✓

#### 2c. Commit

```
compass(M-CACHE): implement composite-key cache with SQLite WAL and file fallback

Phase 2, Step 7
Module: ai-cache (scripts/changelog/core/ai-cache.ts)
Contract: Cache AI results using composite key resilient to cherry-pick
```

#### 2d. Sync shared artifacts

The controller updates:

- `knowledge-graph.xml`: adds M-CACHE exports, CrossLinks to M-CLASS
- `verification-plan.xml`: marks V-M-CACHE scenarios as implemented
- `development-plan.xml`: sets step-7 status to "done"

```
compass(meta): sync after M-CACHE
```

### Progress report

```
--- Step 7/13 complete ---
Module: M-CACHE (scripts/changelog/core/ai-cache.ts)
Status: DONE
Review: scoped pass
Verification: step-level passed
Implementation commit: a1b2c3d
Meta commit: e4f5g6h
Remaining: 6 steps
```

---

## 7. compass-multiagent-execute

> **Skill:** `$compass-multiagent-execute` **When:** Independent modules can be built in parallel.

For Phase 1, modules M-CONFIG, M-TYPES, M-SANIT, M-LIMIT are independent. The controller dispatches 4 fresh worker agents in one wave:

```
Wave 1 (parallel-safe):
  Worker A → M-CONFIG (scripts/changelog/config.ts)
  Worker B → M-TYPES  (scripts/changelog/types.ts)
  Worker C → M-SANIT  (scripts/changelog/utils/sanitize.ts)
  Worker D → M-LIMIT  (scripts/changelog/core/rate-limiter.ts)
```

Each worker:

1. Receives only its execution packet
2. Writes code + tests with full Compass markup
3. Runs module-local `vitest` check
4. Commits its implementation
5. Returns graph delta + verification delta

The controller then:

1. Reviews all 4 outputs (scoped-gate review)
2. Applies graph deltas to `knowledge-graph.xml` in one batch
3. Applies verification deltas to `verification-plan.xml`
4. Commits shared artifacts once:

```
compass(meta): sync graph and verification after wave 1

M-CONFIG: added exports (config), marked step-1 done
M-TYPES:  added exports (RawCommit, ClassifiedCommit, GroupedRelease), marked step-2 done
M-SANIT:  added exports (sanitizeForPrompt, sanitizeCommit), marked step-3 done
M-LIMIT:  added exports (aiLimit, classifyBatch), marked step-4 done
```

```
=== WAVE COMPLETE ===
Wave: 1
Profile: balanced
Modules: M-CONFIG, M-TYPES, M-SANIT, M-LIMIT
Approved: 4/4
Graph sync: targeted passed
Verification: module-local passed
Remaining waves: 3
```

---

## 8. compass-refresh

> **Skill:** `$compass-refresh` **When:** After manual edits, refactors, or when drift is suspected.

Example: a developer manually renamed `sanitize.ts` to `input-guard.ts` without updating Compass artifacts. Running `$compass-refresh`:

```
Compass Integrity Report
======================
Mode: targeted
Scope: [M-SANIT]
Synced modules: 12
Missing from graph: 0
Orphaned in graph: 0
Stale CrossLinks: 1
  M-CLASS → M-SANIT: import path changed to input-guard.ts
Files without contracts: 0
Missing verification entries: 0
Stale verification refs: 1
  V-M-SANIT: test-file path still references sanitize.test.ts
Escalation: no
```

The skill proposes fixes:

1. Update M-SANIT source path in `development-plan.xml`
2. Update CrossLink in `knowledge-graph.xml`
3. Update test-file path in `verification-plan.xml`

After approval, all three docs are updated atomically.

---

## 9. compass-reviewer

> **Skill:** `$compass-reviewer` **When:** At phase boundaries, after waves, or when drift is suspected.

After completing Phase 2 (core pipeline), run a `full-integrity` audit:

```
Compass Review Report
===================
Mode: full-integrity
Scope: all governed files
Files reviewed: 13
Issues found: 2 (critical: 0, minor: 2)

Minor Issues:
- [ai-cache.ts:42] MODULE_MAP entry "fileFallback" description
  does not mention SQLite-free environments (stale after edit)
- [knowledge-graph.xml] M-WRITE missing CrossLink to M-SANIT
  (writer agent now sanitizes input directly)

Escalation: no
Summary: PASS (with minor notes)
```

---

## 10. compass-refactor

> **Skill:** `$compass-refactor` **When:** Splitting, merging, moving, or renaming modules.

Example: M-CLASS grew too large. Split it into M-CLASS-RULES (deterministic) and M-CLASS-AI (LLM path).

The skill:

1. Classifies: `split`
2. Builds refactor packet with both target scopes
3. Moves deterministic logic to `classifier-rules.ts`
4. Keeps AI logic in `classifier-agent.ts`
5. Updates both MODULE_CONTRACTs
6. Moves relevant tests
7. Updates `development-plan.xml` (two M-xxx entries replace one)
8. Updates `knowledge-graph.xml` (new CrossLinks)
9. Updates `verification-plan.xml` (split V-M-CLASS into two)
10. Runs targeted refresh to verify no drift

---

## 11. compass-fix

> **Skill:** `$compass-fix` **When:** Bug or failure in production.

Example: CI fails with `SQLITE_BUSY` despite WAL mode.

### Step 1: Navigate via graph

```
Error: SQLITE_BUSY
→ knowledge-graph.xml: M-CACHE handles SQLite
→ verification-plan.xml: V-M-CACHE has "wal-concurrent" scenario
→ MODULE_CONTRACT of M-CACHE: "busy_timeout = 5000"
```

### Step 2: Navigate to block

```
Log: [M-CACHE][openDb][WAL_ENABLED]
→ Search: START_BLOCK_SQLITE in ai-cache.ts
→ Read the block: busy_timeout is set on the main connection,
  but the fallback file-cache path creates a SECOND connection
  without WAL mode when the first connection times out.
```

### Step 3: Fix

Fix the fallback path to also use WAL mode on its connection. Stay within the START_BLOCK_SQLITE / END_BLOCK_SQLITE boundaries.

### Step 4: Update metadata

```
CHANGE_SUMMARY:
  <item>Fix: fallback DB connection now also uses WAL mode.</item>
```

Update V-M-CACHE to add a regression scenario for the concurrent fallback case.

---

## 12. compass-status

> **Skill:** `$compass-status` **When:** At any time, to get a project health snapshot.

```
Compass Status Report
===================

Artifacts:
  ✓ AGENTS.md (present)
  ✓ docs/knowledge-graph.xml (v1.2.0, 13 modules)
  ✓ docs/requirements.xml (v1.0.0, 8 use cases)
  ✓ docs/technology.xml (v1.0.0)
  ✓ docs/development-plan.xml (v1.2.0, 13 modules)
  ✓ docs/verification-plan.xml (v1.1.0, 13 verification entries)

Codebase:
  Source files: 13
  With MODULE_CONTRACT: 13 (100%)
  Test files: 10
  Semantic blocks: 38 pairs (0 unpaired)
  Files with log markers: 8

Graph Health:
  Modules in graph: 13
  Modules in code: 13
  Orphaned: 0
  Missing: 0

Verification Health:
  Entries in plan: 13
  Stale refs: 0

Recent Changes:
  1. M-CACHE: Fix fallback DB WAL mode
  2. M-CLASS: Split into M-CLASS-RULES + M-CLASS-AI
  3. M-BUMPER: Add confidence threshold to config

Suggested: Project is healthy ✓
```

---

## Summary: What Compass adds to this feature

| Without Compass | With Compass |
| --- | --- |
| AI agent writes code, drifts from plan | Contract checked before and after every module |
| Bug in cache? Search entire codebase | `compass-fix` navigates graph → block → exact location |
| Refactored classifier? Graph out of sync | `compass-refactor` updates code + graph + tests atomically |
| New developer? Reads 2000 lines | `compass-ask` answers from contracts + graph in seconds |
| CI red? No idea which module broke | Log markers trace `[Module][function][BLOCK]` |
| Parallel agents overwrite each other | `compass-multiagent-execute` enforces disjoint write scopes |
| Tests exist but don't cover critical paths | `compass-verification` designs evidence BEFORE code exists |
| Major version bumped accidentally | Confidence gating designed during planning, not patched later |
