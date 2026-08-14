---
workPacket: FORGE-KNOWLEDGE-05
status: ready
dependsOn:
  - FORGE-KNOWLEDGE-01
  - FORGE-KNOWLEDGE-02
  - FORGE-KNOWLEDGE-03
  - FORGE-KNOWLEDGE-04
findings: [F1, F2, F3, F4, F5, F6]
concern: code-mutation
---

# Packet 05 — Integration verification and closure

## Objective

Prove the completed knowledge lifecycle as one system: exact document preservation, lossless compaction recovery, shared budget visibility, authority-aware upgrade, and a clean npm boundary. This packet adds only missing integration evidence and fixes findings from the mandatory final review; it is not a feature-expansion session.

## Preconditions

- Packets 01–04 are committed separately.
- Their scoped validations passed at commit time.
- No active worktree contains uncommitted changes.
- No npm publication is in progress.

If a prerequisite is missing, stop and finish that packet rather than absorbing its implementation into this session.

## End-to-end scenarios

### Scenario A — Monorepo knowledge lifecycle

1. Create a temporary Forge-monorepo-shaped fixture with canonical local and shared sources plus `.agents` mirrors.
2. Include LF, CRLF, non-ASCII body text, legacy text, an expired entry, a stale candidate, and a shared source above 4096 active characters.
3. Run validation/doctor and assert:
   - semantic schema passes;
   - shared budget warns exactly once;
   - duplicate source/mirror is not double-counted.
4. Run compaction with an injected live failure after archive success; assert lossless recovery-required state.
5. Rerun without failure; assert convergence, byte-identical untouched entries, and truthful report.
6. Run same-version upgrade after intentionally drifting the `.agents` mirror; assert mirror repair from canonical source.

### Scenario B — npm consumer lifecycle

1. Build the real Forge tarball into a validated temporary directory.
2. Confirm cumulative source state is absent and empty templates are present.
3. Initialize a consumer-shaped fixture without `packages/forge`.
4. Add valid local and shared knowledge entries under `.agents`.
5. Run doctor and assert budgets use consumer state.
6. Run same-version upgrade and assert all knowledge bytes remain unchanged while a modified managed `SKILL.md` is repaired.
7. Delete one cumulative destination, rerun upgrade, and assert structured-empty scaffolding only for the missing file.
8. Run doctor again and assert no stale-warning compares consumer state to bundled empty templates.

### Scenario C — no-op determinism

Run, in order, twice against an already converged fixture:

1. parse/canonical serialize test operation;
2. compaction;
3. doctor/skill validation;
4. same-version upgrade;
5. npm pack payload listing.

Second-run expectations:

- zero file mutations;
- compaction `outcome: noop`, all write flags false;
- upgrade `status: noop`, empty update arrays;
- warnings and JSON ordering deterministic;
- tarball file list identical;
- working tree clean.

## Cross-contract assertions

| Law | Required evidence |
| --- | --- |
| Untouched knowledge is stable | Buffer equality for remaining live entries and pre-existing archive entries |
| No knowledge loss | Entry-ID multiset before failure equals union after failure; retry converges to one archived copy |
| Validators are read-only | Hash every fixture file before/after validator and doctor |
| Shared is one hot source | Exactly one `budgetKind: shared` report regardless of consumer count/mirror presence |
| Upgrade respects authority | Monorepo mirror changes; consumer state does not |
| Publication is private-by-construction | Payload path/content assertions against actual tgz |
| Reports are truthful | Write flags match pre/post content hashes and outcome/status |
| Repeated execution converges | Second run makes no writes and produces stable normalized JSON |

## Mechanical validation suite

Run from repository root:

```sh
rtk pnpm --filter @warpgogol/forge build:check
rtk pnpm --filter @warpgogol/forge test
rtk pnpm exec werkstatt run forge.skill.validate
rtk node packages/forge/bin/cli.js forge.doctor --json
rtk pnpm exec werkstatt run forge.validate
rtk pnpm exec werkstatt run ecosystem.manifest.validate
rtk pnpm exec werkstatt run command.manifest.validate
rtk bash scripts/check-clean-trees.sh
```

If a manifest validator reports drift, modify the owning registry/generator input, run the correct generator, inspect the full diff, and rerun validation. Never hand-edit generated manifests.

## Final review protocol

1. Invoke `fo-review` over all commits from packets 01–04 plus packet 05 tests.
2. Review all seven axes and explicitly re-evaluate F1–F6.
3. Require `approved`; `approved-with-notes` is insufficient for High findings involving data loss or publication leakage.
4. If findings exist, invoke `fo-fix`, apply them, rerun the full suite, and repeat review.
5. Invoke `fo-doc-audit` to reconcile:
   - `packages/forge/AGENTS.md`;
   - Forge README/publication instructions where affected;
   - module contracts/change summaries;
   - command/ecosystem generated manifests where owning metadata changed;
   - Compass XML only if the implemented code changed a documented repository-wide contract.
6. Do not change terminal RFC status/frontmatter or fabricate new acceptance evidence inside archived RFCs.

## Evidence record

Create a final review under `docs/reviews/code/packages-forge/` with:

- exact commit range;
- exact command outputs/counts;
- per-finding disposition F1–F6;
- tarball filename, integrity/hash, and inspected payload assertions (no token/config contents);
- monorepo and consumer authority scenario results;
- injected failure/retry evidence;
- final clean-tree result.

Do not commit generated tarballs or temporary fixture directories.

## Completion criteria

- All end-to-end scenarios pass on Node 24.
- Full Forge test suite and typecheck pass.
- `forge.skill.validate`, doctor, Forge validation, ecosystem manifest, and command manifest checks pass subject only to the expected advisory shared-budget warning.
- No F1–F6 finding remains open.
- Final `fo-review` verdict is approved.
- Documentation audit reports no drift.
- No cumulative project knowledge appears in the tarball.
- No source or consumer knowledge is lost or unexpectedly rewritten.
- All temporary artifacts are removed through validated paths.
- Packet 05 and its final review are committed through `ecosystem.commit`.
- `git status` and `bash scripts/check-clean-trees.sh` report clean.

## Forbidden shortcuts

- Marking success from scoped tests only.
- Suppressing the expected shared-budget warning instead of reporting it.
- Updating golden outputs without explaining the changed contract.
- Running a real npm publish as a smoke test.
- Committing `.tgz`, extraction directories, or authentication output.
- Accepting recovery-required as a successful compaction outcome.
- Treating semantic parse equality as byte-preservation evidence.
- Editing archived RFC status/evidence to claim closure.

## Escalation trigger

If the final integration scenarios reveal a contradiction between two accepted RFCs rather than implementation drift, stop and create a narrowly scoped `fo-idea` classification for that contradiction. Otherwise, fix the implementation and repeat the suite.
