/*
<MODULE_CONTRACT>
<purpose>Core infrastructure diagnostic rules: DSL, check fixtures, cache parity, props, cosmic, barrel, commit, RFC acceptance, snapshots, command manifest, kernel I/O, kernel flags, fs walk/dedup/size, pipeline log/timeout, KEL, registry, biome tokens, and legacy migrated validators.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from diagnostics/rules.ts as part of the domain split.</item>
  <item>Register environment/deploy, fingerprint, JSON marker, and DNA registry rule ids.</item>
  <item>Register analytics and chat metadata drift rule ids.</item>
  <item>RFC-0601: register DRIFT-01 (error) and DRIFT-02 (info) for generated.drift.validate.</item>
  <item>RFC-0602: register TS-TIME-01 for generated.timestamp.validate.</item>
  <item>RFC-0610: register ARG-COMPLIANCE-01/02/03 for command.args.validate.</item>
</CHANGE_SUMMARY>
*/

import type { RuleDescriptor } from "./types.ts";
import { rule } from "./types.ts";

/** Core infrastructure: DSL, check fixtures, cache parity, props, cosmic,
 * barrel, commit, RFC acceptance, snapshots, command manifest, kernel I/O,
 * kernel flags, fs walk/dedup/size, pipeline log/timeout, KEL, registry,
 * biome tokens, and legacy migrated validators. */
export const CORE_INFRA_RULES: Record<string, RuleDescriptor> = {
  // diagnostic.shape.lint — the inner-shape governance rules (RFC-0203).
  "DSL-01": rule(
    "DSL-01",
    "diagnostic.shape.lint could not read the checks source",
    "diagnostic.shape.lint",
  ),
  "DSL-02": rule("DSL-02", "Unregistered ruleId in a migrated check", "diagnostic.shape.lint"),
  "DSL-03": rule("DSL-03", "Diagnostic literal missing a ruleId", "diagnostic.shape.lint"),
  // RFC-0261: shrink-only ratchet on the resultFromViolations/failResult shim.
  "DSL-04": rule(
    "DSL-04",
    "resultFromViolations/failResult (string shim) used outside the shrink-only baseline",
    "diagnostic.shape.lint",
  ),

  // check.fixture.lint — every *.validate/*.lint command needs red+green fixtures (RFC-0261).
  "CHECK-FIX-01": rule(
    "CHECK-FIX-01",
    "*.validate/*.lint command has no covering test file",
    "check.fixture.lint",
  ),
  "CHECK-FIX-02": rule(
    "CHECK-FIX-02",
    "Covering test exists but lacks a fail fixture or a pass fixture",
    "check.fixture.lint",
  ),
  "CHECK-FIX-03": rule(
    "CHECK-FIX-03",
    "Fixture coverage undecidable by heuristics",
    "check.fixture.lint",
    "warning",
  ),

  // pipeline.cache.parity — cold-vs-warm turbo build equivalence proof (RFC-0259).
  "CACHE-PARITY-01": rule(
    "CACHE-PARITY-01",
    "File present after cold build, missing after warm (cache-restored) build",
    "pipeline.cache.parity",
  ),
  "CACHE-PARITY-02": rule(
    "CACHE-PARITY-02",
    "File differs between cold and warm build",
    "pipeline.cache.parity",
  ),

  // props.contract.validate — manifest propsSchema is the single prop contract (RFC-0262).
  "PROPS-01": rule(
    "PROPS-01",
    "Generated prop types file is missing, hand-edited, or stale",
    "props.contract.validate",
  ),
  "PROPS-02": rule(
    "PROPS-02",
    "Manifest example block fails its own propsSchema",
    "props.contract.validate",
  ),
  "PAGE-PROPS-01": rule(
    "PAGE-PROPS-01",
    "Dev-time block props violate the pinned propsSchema",
    "buildPage",
  ),

  // cosmic.literals.lint — dispatch code must derive cosmic-name keyed behavior from the registry (RFC-0263).
  "COSMIC-LIT-01": rule(
    "COSMIC-LIT-01",
    "Cosmic-catalog name used as a string literal in packages/share/src",
    "cosmic.literals.lint",
  ),

  // barrel.size.lint — root barrel split guard (RFC-0264).
  "BARREL-01": rule(
    "BARREL-01",
    "Root barrel src/index.ts exceeds the export-line threshold",
    "barrel.size.lint",
  ),
  "BARREL-02": rule(
    "BARREL-02",
    "Symbol exported from both the root barrel and a declared subpath",
    "barrel.size.lint",
  ),

  // commit.message.lint — commit subject/body hygiene (RFC-0265).
  "COMMIT-01": rule("COMMIT-01", "Commit subject exceeds 72 characters", "commit.message.lint"),
  "COMMIT-02": rule(
    "COMMIT-02",
    "Commit subject is not a conventional-commit imperative clause",
    "commit.message.lint",
  ),
  "COMMIT-03": rule(
    "COMMIT-03",
    "Commit subject looks like pasted analysis or narration",
    "commit.message.lint",
  ),
  "COMMIT-04": rule(
    "COMMIT-04",
    "packages/os/** or docs/rfcs/** change has no RFC id reference",
    "commit.message.lint",
    "warning",
  ),

  // rfc.acceptance.run — machine-checkable RFC acceptance probes (RFC-0268,
  // implemented in @warpgogol/site-kernel; registered here for the canonical
  // rule-id catalog only, same as COMMIT-01..04).
  "RFC-ACC-01": rule("RFC-ACC-01", "Declared acceptance probe failed", "rfc.acceptance.run"),
  "RFC-ACC-02": rule(
    "RFC-ACC-02",
    "Accepted/implemented RFC declares zero acceptance probes",
    "rfc.acceptance.run",
    "info",
  ),

  // behavior.snapshot.validate — golden per-app public-behavior projection (RFC-0269).
  "SNAP-01": rule(
    "SNAP-01",
    "Public behavior drifted from the committed golden snapshot",
    "behavior.snapshot.validate",
  ),
  "SNAP-02": rule(
    "SNAP-02",
    "Committed snapshot is missing, hand-edited, or dist/client is absent",
    "behavior.snapshot.validate",
  ),

  // command.manifest.validate — single command manifest drift guard (RFC-0266).
  "CMD-MAN-01": rule(
    "CMD-MAN-01",
    "Committed command manifest is missing, malformed, or stale vs the live registry",
    "command.manifest.validate",
  ),
  "CMD-MAN-02": rule(
    "CMD-MAN-02",
    "Command declares mutatesState: true but no writes",
    "command.manifest.validate",
    "warning",
  ),
  "CMD-MAN-03": rule(
    "CMD-MAN-03",
    "GENERATOR_OWNERSHIP_MAP output missing from the owning command's writes",
    "command.manifest.validate",
    "warning",
  ),

  // kernel.io.lint — WorkspaceIO port adoption ratchet (RFC-0267).
  "IO-01": rule(
    "IO-01",
    "Command module imports node:fs/node:fs/promises/node:child_process directly instead of using context.io",
    "kernel.io.lint",
  ),

  // RFC-0303: shared fs/text helper dedup + oversized-file guard rails.
  "WALK-01": rule(
    "WALK-01",
    "Nested recursive readdir walker declared outside the canonical @warpgogol/share/fs module",
    "fs.walk.lint",
  ),
  "DEDUP-01": rule(
    "DEDUP-01",
    "Reserved shared-helper identifier re-declared locally instead of imported",
    "dedup.helper.lint",
  ),
  "SIZE-01": rule(
    "SIZE-01",
    "packages/** source file exceeds the file-size threshold",
    "file.size.lint",
    "warning",
  ),
  // KERNEL-META-01 is thrown by the executor's read-only WorkspaceIO adapter
  // (not emitted as a Diagnostic) — registered here for the canonical
  // rule-id catalog, same pattern as COMMIT-01..04 and RFC-ACC-01/02.
  "KERNEL-META-01": rule(
    "KERNEL-META-01",
    "mutatesState: false command attempted a filesystem/process mutation",
    "(thrown by the executor, not a command)",
  ),

  // warning.diagnostics.lint — summary-only advisory guard (RFC-0247).
  "WDL-00": rule(
    "WDL-00",
    "warning.diagnostics.lint could not read the checks source",
    "warning.diagnostics.lint",
  ),
  "WDL-01": rule(
    "WDL-01",
    "Warning-like finding bypasses canonical diagnostics",
    "warning.diagnostics.lint",
  ),

  // pipeline.log.hygiene.validate — structured build/check log guard (RFC-0254).
  "PIPELINE-LOG-01": rule(
    "PIPELINE-LOG-01",
    "Raw console call in a standard pipeline source path",
    "pipeline.log.hygiene.validate",
  ),
  "PIPELINE-LOG-02": rule(
    "PIPELINE-LOG-02",
    "Fallback-style log string has no structured dedupe key",
    "pipeline.log.hygiene.validate",
  ),
  "PIPELINE-LOG-03": rule(
    "PIPELINE-LOG-03",
    "Warning-like log bypasses canonical diagnostics",
    "pipeline.log.hygiene.validate",
  ),
  "PIPELINE-LOG-04": rule(
    "PIPELINE-LOG-04",
    "Raw logging allowlist entry is missing a rationale",
    "pipeline.log.hygiene.validate",
  ),
  "PIPELINE-TIMEOUT-01": rule(
    "PIPELINE-TIMEOUT-01",
    "Long-running command or pipeline step has no timeout metadata",
    "pipeline.timeout.validate",
    "warning",
  ),
  "PIPELINE-TIMEOUT-02": rule(
    "PIPELINE-TIMEOUT-02",
    "Pipeline step timeout is lower than expected duration",
    "pipeline.timeout.validate",
  ),
  "PIPELINE-TIMEOUT-03": rule(
    "PIPELINE-TIMEOUT-03",
    "Pipeline wrapper timeout is lower than configured critical steps",
    "pipeline.timeout.validate",
  ),
  "PIPELINE-TIMEOUT-04": rule(
    "PIPELINE-TIMEOUT-04",
    "Command or pipeline timeout metadata has impossible values",
    "pipeline.timeout.validate",
  ),

  // pipeline.timeout.validate — telemetry-derived budget comparison (RFC-0270).
  "TIME-01": rule(
    "TIME-01",
    "Inline expectedDurationMs deviates from the generated budget by more than 4x",
    "pipeline.timeout.validate",
    "warning",
  ),
  "TIME-02": rule(
    "TIME-02",
    "Step with observed p95 over 30s has no inline expectedDurationMs fallback",
    "pipeline.timeout.validate",
    "warning",
  ),

  // kernel.result.envelope.lint (RFC-0030).
  "KEL-00": rule(
    "KEL-00",
    "Envelope lint could not read the checks source",
    "kernel.result.envelope.lint",
  ),
  "KEL-01": rule("KEL-01", "Legacy flat result shape", "kernel.result.envelope.lint"),

  // RFC-0260: typed kernel command flag schemas.
  "KERNEL-FLAG-01": rule(
    "KERNEL-FLAG-01",
    "Unknown flag passed to a schema-carrying kernel command",
    "kernel.flags.lint",
  ),
  "KERNEL-FLAG-02": rule(
    "KERNEL-FLAG-02",
    "String/string[] flag given with no value",
    "kernel.flags.lint",
  ),
  "KERNEL-FLAG-03": rule(
    "KERNEL-FLAG-03",
    "Required flag missing for a schema-carrying kernel command",
    "kernel.flags.lint",
  ),
  "KERNEL-FLAG-04": rule(
    "KERNEL-FLAG-04",
    "Command source reads an undeclared flag not present in its flags schema",
    "kernel.flags.lint",
  ),
  "KERNEL-FLAG-05": rule(
    "KERNEL-FLAG-05",
    "Command has not migrated to a typed flags schema (heuristic parse path)",
    "kernel.flags.lint",
    "warning",
  ),

  // RFC-0610: command argument flag-only enforcement.
  "ARG-COMPLIANCE-01": rule(
    "ARG-COMPLIANCE-01",
    "Handler reads removed input.args field (flag-only standard violation)",
    "command.args.validate",
  ),
  "ARG-COMPLIANCE-02": rule(
    "ARG-COMPLIANCE-02",
    "Command registered with empty flags but handler reads named flag",
    "command.args.validate",
  ),
  "ARG-COMPLIANCE-03": rule(
    "ARG-COMPLIANCE-03",
    "Handler uses dual-path fallback with input.args[0] (prohibited)",
    "command.args.validate",
  ),

  // Existing validators migrated while enforcing RFC-0247.
  "ai.validate": rule("ai.validate", "ai.txt validation issue", "ai.validate", "warning"),
  "robots.validate": rule(
    "robots.validate",
    "robots.txt validation issue",
    "robots.validate",
    "warning",
  ),
  "DNA-REG-04": rule(
    "DNA-REG-04",
    "DNA registry entry has no provenance",
    "dna.registry.validate",
    "warning",
  ),
  "DNA-REG-05": rule(
    "DNA-REG-05",
    "DNA registry enforcer is registered but not wired into a standard pipeline",
    "dna.registry.validate",
    "warning",
  ),

  "ANALYTICS-MATOMO-01": rule(
    "ANALYTICS-MATOMO-01",
    "Analytics Matomo ontology, binding, proxy, or support-file contract violation",
    "analytics/matomo validators",
  ),
  "CHAT-META-01": rule(
    "CHAT-META-01",
    "Chat adapter requiredOptions metadata drifted from the runtime adapter declaration",
    "chat.metadata.drift.validate",
  ),
  "CHAT-META-02": rule(
    "CHAT-META-02",
    "Chat adapter vendorOrigins metadata drifted from the runtime adapter declaration",
    "chat.metadata.drift.validate",
  ),

  // env.contract.validate / deploy.scripts.validate (RFC-0346).
  "ENV-CONTRACT-01": rule(
    "ENV-CONTRACT-01",
    "Workspace that reads environment variables is missing .env.example",
    "env.contract.validate",
  ),
  "ENV-CONTRACT-02": rule(
    "ENV-CONTRACT-02",
    ".env.example variable is missing a preceding documentation comment",
    "env.contract.validate",
  ),
  "ENV-CONTRACT-03": rule(
    "ENV-CONTRACT-03",
    ".env.example is missing a variable read by the workspace",
    "env.contract.validate",
  ),
  "ENV-CONTRACT-04": rule(
    "ENV-CONTRACT-04",
    ".env.example contains a non-empty value",
    "env.contract.validate",
  ),
  "DEPLOY-SCRIPTS-01": rule(
    "DEPLOY-SCRIPTS-01",
    "App package is missing canonical deploy scripts",
    "deploy.scripts.validate",
  ),
  "DEPLOY-SCRIPTS-02": rule(
    "DEPLOY-SCRIPTS-02",
    "Canonical deploy script has an invalid command",
    "deploy.scripts.validate",
  ),
  "DEPLOY-SCRIPTS-03": rule(
    "DEPLOY-SCRIPTS-03",
    "Local app environment file required by deploy contract is missing",
    "deploy.scripts.validate",
  ),

  // fingerprint fixtures and source usage guards.
  "FP-USAGE-01": rule(
    "FP-USAGE-01",
    "Fingerprint call site uses unstable input or omits canonicalization metadata",
    "fingerprint.usage.validate",
  ),
  "FP-FIXTURE-01": rule(
    "FP-FIXTURE-01",
    "Fingerprint fixture file is missing or unreadable",
    "fingerprint.fixtures.validate",
  ),
  "FP-FIXTURE-02": rule(
    "FP-FIXTURE-02",
    "Fingerprint fixture hash does not match canonical output",
    "fingerprint.fixtures.validate",
  ),
  "FP-FIXTURE-03": rule(
    "FP-FIXTURE-03",
    "Fingerprint fixture is missing a required vector",
    "fingerprint.fixtures.validate",
  ),
  "FP-FIXTURE-04": rule(
    "FP-FIXTURE-04",
    "Fingerprint fixture contains an unexpected vector",
    "fingerprint.fixtures.validate",
  ),

  // uni.registry.validate (RFC-0023) — migrated pilot.
  "REGISTRY-MISSING": rule(
    "REGISTRY-MISSING",
    "uni.registry.yaml missing or unreadable",
    "uni.registry.validate",
  ),
  "REGISTRY-NEW": rule(
    "REGISTRY-NEW",
    "Manifest not present in the registry",
    "uni.registry.validate",
  ),
  "REGISTRY-STALE": rule(
    "REGISTRY-STALE",
    "Registry entry references a deleted manifest",
    "uni.registry.validate",
  ),
  "REGISTRY-CHANGED": rule(
    "REGISTRY-CHANGED",
    "Registry entry drifted from the manifest",
    "uni.registry.validate",
  ),
  "REGISTRY-INVALID": rule(
    "REGISTRY-INVALID",
    "Manifest fails schema validation",
    "uni.registry.validate",
  ),
  "REGISTRY-READ-ERROR": rule(
    "REGISTRY-READ-ERROR",
    "Manifest could not be read",
    "uni.registry.validate",
  ),

  // biome.tokens.validate (RFC-0201) — migrated pilot.
  "BIOME-TOKEN-01": rule("BIOME-TOKEN-01", "Unresolved design token", "biome.tokens.validate"),
  "BIOME-TOKEN-02": rule(
    "BIOME-TOKEN-02",
    "Unsafe contrast-intent inheritance",
    "biome.tokens.validate",
  ),
  "BIOME-TOKEN-03": rule(
    "BIOME-TOKEN-03",
    "Invalid app-local token override",
    "biome.tokens.validate",
    "warning",
  ),
  "BIOME-TOKEN-04": rule("BIOME-TOKEN-04", "Generated biome CSS drift", "biome.tokens.validate"),

  // command.reads.validate — RFC-0390 command-result cache reads declarations.
  "CRC-01": rule(
    "CRC-01",
    "Command has no reads declaration and cacheable is not false",
    "command.reads.validate",
  ),
  "CRC-02": rule("CRC-02", "Command has invalid glob pattern in reads", "command.reads.validate"),

  // generated.files.validate — RFC-0375 registry-declared generated file existence.
  "GEN-FILES-01": rule(
    "GEN-FILES-01",
    "Registry-declared generated file is missing or glob expansion failed",
    "generated.files.validate",
  ),

  // generated.drift.validate — RFC-0601 content drift detection in generated files.
  "DRIFT-01": rule(
    "DRIFT-01",
    "Committed file content differs from generator output",
    "generated.drift.validate",
  ),
  "DRIFT-02": rule(
    "DRIFT-02",
    "Generator does not support dryRun mode; skipped",
    "generated.drift.validate",
    "info",
  ),

  // generated.timestamp.validate — RFC-0602 volatile timestamp detection in generator source.
  "TS-TIME-01": rule(
    "TS-TIME-01",
    "Volatile timestamp pattern (new Date(), Date.now(), process.env.BUILD_TIMESTAMP) in generator source",
    "generated.timestamp.validate",
  ),

  // yaml.contract.lint — YAML-first workspace convention enforcement.
  "YAML-CONTRACT-01": rule(
    "YAML-CONTRACT-01",
    "JSON file is not in the tool-mandatory whitelist",
    "yaml.contract.lint",
  ),
  "YAML-CONTRACT-02": rule(
    "YAML-CONTRACT-02",
    "File uses .yml extension instead of .yaml",
    "yaml.contract.lint",
  ),
  "YAML-CONTRACT-03": rule(
    "YAML-CONTRACT-03",
    "Generated artifact uses .json extension instead of .generated.yaml",
    "yaml.contract.lint",
  ),
  "YAML-CONTRACT-04": rule(
    "YAML-CONTRACT-04",
    "Whitelist file is missing or unparseable",
    "yaml.contract.lint",
  ),
  "YAML-CONTRACT-05": rule(
    "YAML-CONTRACT-05",
    "YAML file contains JSON content",
    "yaml.contract.lint",
  ),
  // RFC-0493: parse validation and duplicate-key detection
  "YAML-PARSE-01": rule("YAML-PARSE-01", "YAML file failed to parse", "yaml.parse.validate"),
  "YAML-PARSE-02": rule(
    "YAML-PARSE-02",
    "YAML file has duplicate mapping key",
    "yaml.parse.validate",
  ),
};
