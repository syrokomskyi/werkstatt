---
auditId: AUDIT-RFC-0678
date: 2026-08-04
reviewer:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
targetRfc: RFC-0678
verdict: needs-revision
---

# Audit: RFC-0678 — Profile-driven determinism verification

## Verdict: needs-revision

The RFC has a clear architectural fit (DNA-54, RFC-0638) but contains a fundamental design mismatch between the declared `determinism.inputs` values and the algorithm that claims to consume them as glob patterns. Additionally, the output hashing strategy conflicts with the profile's `extensions` field semantics.

## Findings

### A-1 (Critical): `determinism.inputs` are labels, not glob patterns

The RFC's algorithm (line 159) says: "Compute the input hash: hash all files matching `determinism.inputs` glob patterns, sorted by path."

But the actual `editframe-html.yaml` profile declares:

```yaml
determinism:
  hashable: true
  inputs:
    - composition files
    - assets
    - editframe version
```

These are human-readable labels, not glob patterns. The algorithm cannot hash files matching "composition files" — that's not a glob. The RFC must either:

- Change the profile schema to require glob patterns in `inputs`, or
- Define a mapping from labels to file resolution logic, or
- Change the algorithm to hash all files in the workspace (not just `inputs`)

**Recommendation:** Extend the `determinism.inputs` schema to accept glob patterns (e.g., `compositions/**/*.html`) and update the `editframe-html.yaml` profile to use globs. The labels can be a separate `description` field if needed.

### A-2 (Major): Output hash targets `extensions` but extensions are input extensions

The RFC (line 162) says: "Hash the output file(s) matching `artifacts[].extensions`."

But `extensions` for the composition artifact is `[".html", ".tsx"]` — these are **input** file extensions, not output. The output is `dist/{composition}.mp4` (declared in `produce.output`). The algorithm should hash the file at `produce.output`, not files matching `extensions`.

**Recommendation:** Hash the file at `artifact.produce.output` path, not files matching `extensions`.

### A-3 (Major): `forge.build` has no `--artifact` flag

The RFC algorithm (line 160) says: "Run `forge.build --artifact <id>` (first build)."

But `forge.build` (RFC-0674) does not have an `--artifact` flag — it builds all artifacts. Only `forge.validate` got `--artifact` in RFC-0677. The RFC must either:

- Add `--artifact` to `forge.build` first (as a prerequisite or part of this RFC), or
- Execute the `produce.command` directly instead of calling `forge.build`

**Recommendation:** Execute `artifact.produce.command` directly via `execAsync`, similar to how `runBuild` works. This avoids the dependency on `forge.build` having `--artifact`.

### A-4 (Minor): Cache file location assumes `dist/` exists

The cache file `dist/.determinism-cache.json` (line 167) may not be writable if `dist/` doesn't exist yet (no prior build). The handler must create the directory before writing the cache.

**Recommendation:** Add `mkdirSync(dirname(cachePath), { recursive: true })` before writing the cache file.

### A-5 (Minor): No `--json` flag in command registration

The acceptance criteria (line 235) mention `--json` as a flag, and the CLI surface (line 130) shows `forge determinism check --json`, but the `commands.changed` frontmatter (line 47) has `changed: []`. Since this is a new command in `proposed`, that's correct — but the RFC should note that `--json` is a standard Forge flag inherited from the runtime, not a custom flag.

### A-6 (Minor): `commands.changed` should list `forge.determinism.check` in `proposed`

The frontmatter correctly lists `forge.determinism.check` in `commands.proposed`. No issue — just confirming the convention is followed.

## Questions for the author

1. Should `determinism.inputs` be changed to glob patterns in the profile schema, or should the algorithm use a different file resolution strategy?
2. Should the output hash target `produce.output` (a single file) or scan `dist/` for files matching output extensions?
3. Should `forge.build` get an `--artifact` flag as part of this RFC, or should the handler execute `produce.command` directly?
