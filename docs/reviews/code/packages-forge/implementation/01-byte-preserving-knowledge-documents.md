---
workPacket: FORGE-KNOWLEDGE-01
status: ready
dependsOn: []
findings: [F2]
concern: code-mutation
---

# Packet 01 — Byte-preserving knowledge documents

## Objective

Introduce one document representation that supports both canonical creation and targeted mutation. After this packet, parsing retains the exact original source and stable spans; canonical serialization is idempotent; a caller can remove an entry or replace only its metadata without changing any untouched source slice.

This packet does not modify compaction behavior. Packet 02 consumes the new writer.

## Normative inputs

- RFC-0660 parser/serializer round-trip contract.
- RFC-0662 requirement that untouched live/archive entries remain byte-identical.
- DNA-41 property-based test discipline.
- Source review F2.

## Required design

### Source representation

Extend `packages/forge/src/knowledge/schema.ts` with an immutable span model:

```ts
export interface TextSpan {
  start: number; // inclusive UTF-16 source offset
  end: number;   // exclusive UTF-16 source offset
}

export interface KnowledgeEntry {
  // existing semantic fields stay unchanged
  sourceSpan: TextSpan;
  metadataFenceSpan: TextSpan;
}

export interface ParsedKnowledgeFile {
  // existing fields stay unchanged
  source: string;
  lineEnding: "\n" | "\r\n";
  hasTerminalNewline: boolean;
}
```

Offsets are character offsets used only with `source.slice()`. Do not label them byte offsets. Byte preservation is verified after UTF-8 encoding with `Buffer.equals`.

`sourceSpan` starts at the first character of `### K-NNNN:` and ends immediately before the next structured entry heading or at EOF. `metadataFenceSpan` covers the opening fence through the closing fence, excluding surrounding blank lines. Parser results with malformed/unterminated metadata keep reporting parse issues and are never editable.

### Parser implementation

Refactor `packages/forge/src/knowledge/parse.ts` to scan source while retaining line start/end offsets. Splitting with `content.split(/\r?\n/)` and rebuilding with `join("\n")` is insufficient because it loses CRLF and terminal-newline information.

The implementation may build a line table:

```ts
interface SourceLine {
  text: string;
  start: number;
  contentEnd: number;
  end: number; // includes line terminator
}
```

All existing semantic parse behavior and 1-based `lineStart` diagnostics must remain unchanged.

### Canonical serializer

Keep `serializeKnowledgeFile` as the canonical creator for synthetic/new documents. It must:

- emit LF line endings;
- emit exactly one terminal newline;
- preserve internal preamble/legacy text but normalize only their terminal separator;
- join document blocks explicitly rather than applying a global newline regex;
- produce identical output on a second parse/serialize cycle;
- serialize metadata fields in the existing documented order.

It is not the mutation API for an existing source file.

### Targeted edit writer

Add `packages/forge/src/knowledge/edit.ts` and export it through the knowledge barrel:

```ts
export type KnowledgeEdit =
  | { kind: "remove-entry"; entryId: string }
  | { kind: "replace-entry-metadata"; entryId: string; metadata: KnowledgeEntryMeta }
  | { kind: "append-entry"; entry: NewKnowledgeEntry };

export type NewKnowledgeEntry = Pick<KnowledgeEntry, "meta" | "title" | "body">;

export function applyKnowledgeEdits(
  parsed: ParsedKnowledgeFile,
  edits: KnowledgeEdit[],
): string;
```

Rules:

1. Reject duplicate edits for the same entry, unknown IDs, overlapping spans, parse-issue documents, and duplicate appended IDs.
2. Convert edits to non-overlapping replacements and apply them in descending `start` order.
3. `remove-entry` removes exactly `sourceSpan`.
4. `replace-entry-metadata` replaces only `metadataFenceSpan` with canonical fenced metadata; heading, body, separators, and every other entry are raw source slices.
5. `append-entry` adds a canonical entry after a deterministic separator. Preserve the existing document's line-ending style and terminal-newline state until the append boundary; the appended block uses the document line ending and ends with one terminal newline.
6. Multiple appends preserve caller order.
7. The function is pure and performs no filesystem I/O.

Synthetic entries use the separate `NewKnowledgeEntry` type above. Parsed-entry spans remain required; do not make them optional to accommodate append operations.

## Affected artifacts

- `packages/forge/src/knowledge/schema.ts`
- `packages/forge/src/knowledge/parse.ts`
- `packages/forge/src/knowledge/serialize.ts`
- `packages/forge/src/knowledge/edit.ts` (new)
- `packages/forge/src/knowledge/index.ts`
- `packages/forge/src/index.ts` if the knowledge API is public there
- `packages/forge/src/tests/knowledge-parse.test.ts`
- `packages/forge/src/tests/knowledge-pbt.test.ts`
- `packages/forge/src/tests/knowledge-edit.test.ts` (new)
- Existing test helpers constructing `KnowledgeEntry`/`ParsedKnowledgeFile`
- `packages/forge/AGENTS.md` only if its entry-point or contract map names these APIs

Do not edit `compact.ts` beyond a compile-only adaptation that does not change behavior. Prefer keeping packet 01 entirely independent and letting packet 02 perform the migration.

## Implementation steps

1. Add characterization tests for the current semantic parser before refactoring it.
2. Add `TextSpan`/source metadata contracts and update test factories.
3. Replace lossy line splitting with the offset-preserving line table.
4. Repair canonical serializer joining and structured-empty handling.
5. Implement the pure targeted writer with validation before replacement.
6. Export the new API and update module contracts/change summaries.
7. Add table tests and PBT; run scoped validation.
8. Review the diff specifically for off-by-one spans and CRLF handling.

## Mandatory test matrix

### Parse/serialize tables

- empty file;
- knowledge-adjacent file;
- structured-empty preamble with and without terminal newline;
- LF and CRLF documents;
- one and several blank lines between sections;
- one entry and multiple entries;
- legacy-only and mixed legacy/structured input;
- non-ASCII title/body;
- metadata arrays: `supersedes`, `promotedFrom`;
- malformed and unterminated fences.

### Targeted edit invariants

- remove first, middle, last, and all entries;
- replace metadata for first/middle/last entry;
- append to structured-empty, LF, CRLF, terminal-newline and no-terminal-newline documents;
- reject unknown ID, duplicate edit, overlapping edit, duplicate append ID, parse-issue document;
- compare every untouched entry's pre/post raw slice using `Buffer.from(slice)` and `Buffer.equals`.

### Property-based tests

1. Canonical idempotency:

```ts
serialize(parse(writeTemp(serialize(parse(source)))))
  === serialize(parse(source))
```

2. Target isolation: for any valid generated document and one selected metadata edit, all unselected entry source slices are byte-identical.

3. Parse semantics: canonical serialize/parse preserves all metadata, title, and body values.

Use bounded generators and deterministic Vitest/fast-check seed reporting.

## Validation commands

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/knowledge-parse.test.ts src/tests/knowledge-pbt.test.ts src/tests/knowledge-edit.test.ts
rtk pnpm --filter @warpgogol/forge build:check
```

Then run the package's full test command before committing if scoped tests pass.

## Completion criteria

- All required spans map back to the exact original source segments.
- Canonical serializer is stable on the second cycle, including structured-empty input.
- Targeted metadata replacement changes no bytes outside `metadataFenceSpan`.
- Entry removal changes no bytes inside any remaining entry source span.
- PBT covers canonical idempotency and target isolation.
- No filesystem write occurs in the parser, serializer, or edit writer.
- Scoped tests, full Forge tests, and `build:check` pass.
- Review has no unresolved High/Medium finding for packet 01.

## Forbidden shortcuts

- Global whitespace/newline replacement over the whole document.
- Regex-based mutation independent of parser spans.
- Returning `parsed.source` while ignoring semantic edits.
- Reconstructing untouched entries from metadata/title/body.
- Snapshot-only tests without byte assertions.
- Changing entry identity, metadata schema meaning, or lifecycle statuses.

## Escalation trigger

Escalate only if preserving raw source would require a public breaking change to the knowledge schema consumed outside Forge. Internal additive fields and exports are within this packet.
