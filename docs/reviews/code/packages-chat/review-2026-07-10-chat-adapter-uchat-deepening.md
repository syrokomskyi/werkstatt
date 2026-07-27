---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 84eb5a507~1..84eb5a507
filesReviewed:
  - packages/chat-adapter-uchat/src/widget-adapter.ts
  - packages/chat-adapter-uchat/src/index.ts
  - packages/chat-adapter-uchat/AGENTS.md
  - packages/chat/src/port.ts
  - packages/chat/src/index.ts
  - packages/chat/src/client.ts
  - packages/chat/package.json
  - packages/chat/AGENTS.md
  - packages/chat/README.md
  - packages/chat-adapter-null/src/index.ts
  - packages/os/site-kernel-checks/src/chat-metadata-drift.ts
---

# Code Review: 84eb5a507~1..84eb5a507 (fix(chat): deepen chat-adapter-uchat)

### Verdict: Needs revision

The commit successfully splits the widget adapter and widens return types, but the config.ts → port.ts fold is incomplete: `config.ts` was not deleted in the commit, creating a duplicate source of truth. The `./config` package export and documentation still point to the old file. Two additional structural issues (barrel import in widget-adapter, silent `no-global` in client) should be addressed before merge.

### Mechanical floor

**Pass** — `tsc --noEmit` passes for `@gogol/chat`, `@gogol/chat-adapter-uchat`, `@gogol/chat-adapter-null`, and `@gogol/os/site-kernel-checks`. A pre-existing workspace issue (`@gogol/growth-adapter-null` missing) blocks `pnpm` lifecycle commands but is unrelated to this diff.

### Axis A — Structural correctness

1. **Barrel import in widget-adapter.ts** — `packages/chat-adapter-uchat/src/widget-adapter.ts:21` imports `ChatWidgetConfig` from `@gogol/chat` (the barrel) instead of `@gogol/chat/port`. The barrel re-exports from `port.ts` but also pulls in `adapter-metadata.ts`. For a type-only import in a browser-only adapter, this creates an unnecessary coupling to the barrel's stability. Should be `import type { ChatWidgetConfig } from "@gogol/chat/port"` — the same entry point already used for `ChatWidgetAdapter` on line 20.

2. **Duplicate type import lines** — `widget-adapter.ts:20` and `widget-adapter.ts:22` both import from `@gogol/chat/port` as separate statements. These should be consolidated into a single `import type { ChatWidgetAdapter, ChatWidgetConfig, ChatWidgetLoadResult, ChatWidgetOpenResult } from "@gogol/chat/port"`.

3. **Comment typo regression** — `widget-adapter.ts:26` says "The popup script auto-mount" (missing "s"). The original `index.ts` had "auto-mounts". Minor, but introduced during the split.

### Axis B — DNA alignment

No issues. The diff touches only TypeScript source files in `packages/*` — no `.astro` components, no manifests, no page blocks, no CSS. DNA-1 (monorepo boundary) is respected: imports flow `packages/chat-adapter-* → packages/chat`. DNA-6 (kebab-case) is satisfied (`widget-adapter.ts`). DNA-42 (Compass markup) is satisfied: both new and modified source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks.

### Axis C — Ecosystem fit

1. **`./config` export is a dead path** — `packages/chat/package.json` adds a `"./config"` export pointing to `"./src/config.ts"`. No code in the workspace imports from `@gogol/chat/config` (verified via grep). The `index.ts` barrel re-exports `ChatWidgetConfigSchema` and `CHAT_CONFIG_SCRIPT_ID` from `./port.ts`, not `./config.ts`. This export should be removed — it advertises a path that no consumer uses and implies `config.ts` is still a separate module.

2. **README and AGENTS.md still reference `@gogol/chat/config`** — `packages/chat/README.md:15,26` and `packages/chat/AGENTS.md:11` both list `@gogol/chat/config` as an entry point pointing to `src/config.ts`. The README usage example even tells users to `import { ChatWidgetConfigSchema } from "@gogol/chat/config"`. Since the config schema is now in `port.ts` and re-exported from the barrel, these references are stale and should be updated or removed.

3. **`chat-metadata-drift.ts` hardcodes `"widget-adapter.ts"`** — `packages/os/site-kernel-checks/src/chat-metadata-drift.ts:82` hardcodes the filename. The null adapter is explicitly skipped (`if (adapterId === "null") continue`), so this works today. But any future adapter that doesn't name its file `widget-adapter.ts` will be silently skipped by the drift validator (the `catch` block continues on file-not-found). This is a hidden coupling — not a regression from the previous `"index.ts"` hardcoding, but an opportunity to make the validator more robust (e.g. try multiple candidate filenames, or read from `package.json` exports).

### Axis D — Forward-only compliance

1. **config.ts not deleted — incomplete fold** — The `port.ts` CHANGE_SUMMARY states "folded config.ts into port.ts — resolves a circular import, deepens the port module, removes a 30-line shallow file." However, `config.ts` was **not deleted** in this commit (verified: `git ls-tree 84eb5a507 -- packages/chat/src/config.ts` returns a blob). Both `config.ts` and `port.ts` now define `ChatWidgetConfigSchema`, `ChatWidgetConfig`, and `CHAT_CONFIG_SCRIPT_ID` — a duplicate source of truth. The deletion exists only as an uncommitted working-tree change. The commit should have deleted `config.ts` in the same change to complete the fold. As committed, the migration is half-done: the circular import is resolved (port.ts no longer imports from config.ts), but the dead file remains.

### Axis E — Agent-facing clarity

1. **Stale documentation** (carried from Axis C) — `AGENTS.md` and `README.md` for `@gogol/chat` still list `@gogol/chat/config` → `src/config.ts` as a live entry point. An agent reading these files would believe `config.ts` is the canonical source for the config schema, when in fact `port.ts` is. This creates navigational confusion for AI agents following the documentation.

2. **Compass scaffolding** — `MODULE_CONTRACT` and `CHANGE_SUMMARY` are present in all new and modified source files. The `@ai-invariant` line in `client.ts` is preserved. No issues.

### Axis F — Pragmatism

1. **`./config` export is speculative** — Adding an export path that no consumer uses violates minimal command surface. The config schema is already accessible via `@gogol/chat` (barrel) and `@gogol/chat/port`. The `./config` subpath added no value and should be removed rather than maintained.

2. **Return types are lean and purposeful** — `ChatWidgetLoadResult` and `ChatWidgetOpenResult` are string unions with exactly the states callers need. No speculative generality. Good.

### Axis G — Blind spots

1. **`open()` "no-global" is silently ignored** — `packages/chat/src/client.ts:69-72` warns on `"not-ready"` but silently ignores `"no-global"`. If the UChat script loads but doesn't expose the expected global (`uchat` or `UChatWidget`), the visitor clicks and nothing happens with no console feedback. This is a debugging blind spot — the client should at minimum log a warning for `"no-global"` so developers can diagnose vendor API changes.

2. **`_injected` flag is module-scoped** — `widget-adapter.ts:51` uses a module-level `let _injected = false`. This is fine for a single widget instance per page, but if the adapter is ever reused across multiple widget ids on the same page (unlikely but possible in a portal scenario), the flag would incorrectly short-circuit. Not a current bug, but worth noting in a comment.

### Spec compliance

No spec available — spec compliance skipped. The commit message describes the work as addressing "architecture review candidates 1 + 3" from a prior session, but no formal spec or PRD was linked.

### Questions for the author

1. Why was `config.ts` not deleted in this commit? The CHANGE_SUMMARY claims the fold is complete, but the file still exists in the commit tree. Was this intentional (to avoid breaking consumers) or an oversight?

2. Who consumes the `@gogol/chat/config` export path? No code in the workspace imports from it. Should it be removed, or is there an external consumer?

3. What should happen when `open()` returns `"no-global"`? The client silently ignores it. Should the launcher show a fallback (e.g. a mailto link) or at least log a warning?
