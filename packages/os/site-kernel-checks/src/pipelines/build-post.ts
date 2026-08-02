/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/build-post.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate authored source files — those belong in SITES_BUILD_CHECK_PIPELINE.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from app kernel.config.ts files.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/site-kernel";
import { SITES_CHECK_POSTBUILD_PIPELINE } from "./sites-check-postbuild.ts";

// Generation steps first — they produce artifacts the postbuild validators
// read (sitemap-images.xml, passport, generated-marker stripping).
export const SITES_BUILD_POST_PIPELINE: KernelPipelineStep[] = [
  // RFC-0647: ensure Playwright Chromium is installed before any Playwright-dependent
  // steps (print.pdf.generate, qa.independent.run) execute. Idempotent — skips if
  // Chromium is already launchable. Respects PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD.
  { command: "playwright.chromium.ensure" },
  { command: "passport.emit" },
  { command: "dist.sitemap.images.generate" },
  // RFC-0210: drop bundled feature/background source videos (served from public/_video) so
  // large masters don't exceed the Cloudflare Workers 25 MiB per-asset limit.
  { command: "video.dist.prune", expectedDurationMs: 30_000, timeoutMs: 300_000 },
  { command: "dist.generated-marker.strip" },
  // RFC-0235: egress text normalizer — the authoritative "find all of them" pass.
  // Runs after every dist generation/mutation above and before the postbuild
  // validators, so they validate the normalized public output.
  { command: "text.normalize.apply", expectedDurationMs: 30_000, timeoutMs: 300_000 },
  // RFC-0654: structural integrity guard — runs after all post-build mutators
  // and before the postbuild validation pipeline to catch tag imbalance caused
  // by regex-based mutators (e.g. stripGeneratedMarker removing <main>).
  { command: "dist.html-structure.validate" },
  // RFC-0074: the full postbuild validation pipeline runs here so every
  // dist-scanning check validates the just-built dist — making build:check the
  // comprehensive build gate. behavior.snapshot.validate (inside this array)
  // MUST run before behavior.snapshot.generate below — it diffs the fresh
  // build against the git-committed snapshot; if generate ran first it would
  // overwrite that file and validate would trivially compare it to itself.
  ...SITES_CHECK_POSTBUILD_PIPELINE,
  // RFC-0269: refresh the working-tree snapshot AFTER validate has compared
  // the fresh build against the previously-committed file. The refreshed file
  // only becomes part of history if a human/agent reviews the diff and commits
  // it — this step never auto-commits.
  { command: "behavior.snapshot.generate" },
  // RFC-0257/RFC-0653: generate PDFs to .cache/pdf/, copy to dist/, then validate
  { command: "print.pdf.generate", expectedDurationMs: 120_000, timeoutMs: 900_000 },
  { command: "print.pdf.copy" },
  { command: "print.pdf.validate" },
];
