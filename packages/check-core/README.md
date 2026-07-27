# @warpgogol/check-core

Schema-and-logic package for the check-warpgogol ecosystem. Provides Zod schemas, deterministic builders, diagnostic collectors, run-path helpers, and safety validation for check runs.

## Entry point

```ts
import { ... } from "@warpgogol/check-core";
```

## Modules

| Module | Exports |
| --- | --- |
| `artifacts.ts` | `checkRunArtifactSchema`, `CheckRunArtifact`, `makeRunId`, `makeRunArtifact` |
| `report.ts` | `checkReportSchema`, `CheckReport`, `agentActionSchema`, `AgentAction`, `agentActionPackSchema`, `AgentActionPack`, `statusFromSummary`, `makeCheckReport`, `makeAgentAction`, `makeAgentActionPack`, `renderReportHtml` |
| `evidence.ts` | `SiteEvidenceGraph` schema and types, `finalizeEvidenceGraph`, `parseEvidenceGraph`, `validateEvidenceGraphHash` |
| `diagnostics.ts` | `makeDiagnostic`, `collectTechnicalDiagnostics`, `collectLocalizationDiagnostics`, `collectAccessibilityDiagnostics`, `collectContentSurfaceDiagnostics`, `collectDeterministicDiagnostics`, `containsSecretLikeText` |
| `run-paths.ts` | `runRelDir`, `runRelPath`, `screenshotsRelDir`, `logsRelDir`, `findWorkspaceRoot` |
| `safety.ts` | `RAW_SECRET_PATTERNS`, `validateTargetSafety` |
| `target.ts` | `CheckTarget` schema, `parseCheckTarget`, `redactCheckTarget` |
| `audience.ts` | `AudienceProfile` schema and types |
| `run-request.ts` | `CheckRunRequest`, `CheckRunStatus` schemas, `parseCheckRunStatus` |

## Hashing

All hashes use `@warpgogol/fingerprint` `byteHash` directly (returns `sha256:<hex>` prefixed format). The legacy `hash.ts` wrapper that stripped the `sha256:` prefix has been removed. Evidence graph hashes are stored in prefixed format.

## `findWorkspaceRoot` — Node-only

`findWorkspaceRoot` uses `node:fs.existsSync` and `process.cwd()`. It is safe in Node contexts (runner service, OS commands). **Cloudflare Workers consumers must not call it** — read `CHECK_WEBGOGOL_WORKSPACE_ROOT` from the environment directly and throw an explicit configuration error if it is missing.

## Dependencies

- `@warpgogol/fingerprint` — `byteHash`, `stableStringify`
- `@warpgogol/site-kernel` — `Diagnostic` type
- `zod` — schema validation
