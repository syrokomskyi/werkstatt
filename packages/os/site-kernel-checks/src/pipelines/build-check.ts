/*
<MODULE_CONTRACT>
<purpose>Build check pipeline — author checks plus post-build codegen validations.</purpose>
<non-goals>
  <item>Do not duplicate codegen commands that already ran in build.prepare.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts.</item>
  <item>RFC-0707: added nachweis.validate after SITES_CHECK_AUTHOR_PIPELINE.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/site-kernel";
import { SITES_CHECK_AUTHOR_PIPELINE } from "./sites-check-author.ts";

// Note: codegen commands (open-source.generate, icons.generate) live in
// SITES_BUILD_PREPARE_PIPELINE only — they are NOT repeated here. build.prepare
// always runs before build.check, so duplicating them produced redundant output.
export const SITES_BUILD_CHECK_PIPELINE: KernelPipelineStep[] = [
  // RFC-0686: validate pipeline dependency graphs before running any checks.
  { command: "pipeline.dependencies.validate", dependsOn: [] },
  ...SITES_CHECK_AUTHOR_PIPELINE,
  // RFC-0707: validate nachweis trust entities and publication gate after author checks
  { command: "nachweis.validate" },
  // RFC-0201: validate CSS token usage against the active biome after codegen
  { command: "biome.tokens.validate" },
  // RFC-0204: validate image variant manifest and file presence
  { command: "image.variants.validate", expectedDurationMs: 15_000, timeoutMs: 120_000 },
  // RFC-0210: validate video manifest + derived-artifact presence
  { command: "video.variants.validate", expectedDurationMs: 15_000, timeoutMs: 120_000 },
  // RFC-0234: refuse to publish without an iOS-playable video format (mp4 / transparent poster-only)
  { command: "video.ios-fallback.validate" },
  // RFC-0233: Tier-1 positional visual invariants (Visual Control System)
  { command: "visual.contract.validate", expectedDurationMs: 30_000, timeoutMs: 180_000 },
  // RFC-0257: print contract and layout validation
  { command: "print.contract.validate" },
  { command: "print.layout.validate" },
  // RFC-0373: validate business services projection
  { command: "services.projection.validate" },
  // RFC-0489: validate open-source SBOM registry, artifacts, and count consistency
  { command: "open-source.validate" },
  // RFC-0601: detect content drift in generated files (DNA-58)
  { command: "generated.drift.validate" },
];
