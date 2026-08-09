/*
<MODULE_CONTRACT>
<purpose>Provides a standard orchestration logic for layout-global scripts across all Warpgogol projects.</purpose>
<non-goals>
  <item>Do not handle project-specific feature logic directly.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created standard layout orchestrator in @warpgogol/werkstatt-site/share/scripts to reduce code duplication in apps.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: This is a high-risk module. Preserve its core logic and minimize external side effects during modification.

import { applyExternalLinkBehavior } from "./external-links.ts";
import { initLordIconOnDemand } from "./lordicon.ts";
import { initLenis } from "./lenis.ts";

export interface OrchestrationOptions {
  headerOffset?: number;
  /** RFC-0040: opt in to GSAP stat counter animation. Default false. */
  counters?: boolean;
  /** RFC-0041: opt in to GSAP inline number animation for prose sections. Default false. */
  inlineNumbers?: boolean;
  /** RFC-0106: opt in to GSAP scroll-triggered reveal animations. Default false. */
  reveal?: boolean;
  /** RFC-0106: opt in to GSAP parallax for [data-parallax-speed] elements. Default false. */
  parallax?: boolean;
  /** RFC-0106: opt in to GSAP stagger for [data-motion-stagger] parents. Default false. */
  stagger?: boolean;
  /** RFC-0202: opt in to the living-photos runtime for [data-live-photo] elements. Default false. */
  livePhotos?: boolean;
  /** RFC-0210: opt in to the lazy feature-video player (Plyr + hls.js) for [data-video-player]. Default false. */
  videoPlayers?: boolean;
  /** RFC-0205: opt in to Lenis smooth scroll. Default false — avoids loading the 17 KB bundle when not needed. */
  smoothScroll?: boolean;
}

const has = (selector: string) => document.querySelector(selector) instanceof Element;

/**
 * Runs the standard set of browser initializations required for all Warpgogol platform sites.
 */
export async function runStandardLayoutOrchestration(
  options: OrchestrationOptions = {},
): Promise<void> {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 1. External links security (mandatory)
  if (has("a[href]")) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyExternalLinkBehavior(), {
        once: true,
      });
    } else {
      applyExternalLinkBehavior();
    }
  }

  // 2. LordIcon hydration (mandatory on demand)
  if (has("lord-icon")) {
    initLordIconOnDemand();
  }

  // 3. Lenis smooth scroll (opt-in via smoothScroll: true)
  if (options.smoothScroll) {
    await initLenis({
      prefersReducedMotion,
      headerOffset: options.headerOffset ?? 80,
    });
  }

  // 4. GSAP stat counter (RFC-0040 — opt-in via counters: true)
  // Note: has() check removed; initGsapCounter internally guards against empty sections.
  if (options.counters) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initGsapCounter } = await import("./gsap-counter.ts");
      await initGsapCounter({ prefersReducedMotion });
    });
  }

  // 5. GSAP inline number animation (RFC-0041 — opt-in via inlineNumbers: true)
  if (options.inlineNumbers && has(".js-inline-number")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initInlineNumberAnimation } = await import("./inline-number-animation.ts");
      await initInlineNumberAnimation({ prefersReducedMotion });
    });
  }

  // 6. RFC-0106: reveal animations (opt-in via reveal: true).
  if (options.reveal && has("[data-motion-reveal]")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initGsapReveal } = await import("./gsap-reveal.ts");
      await initGsapReveal({ prefersReducedMotion });
    });
  }

  // 7. RFC-0106: parallax animations (opt-in via parallax: true).
  if (options.parallax && has("[data-parallax-speed]")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initGsapParallax } = await import("./gsap-parallax.ts");
      await initGsapParallax({ prefersReducedMotion });
    });
  }

  // 8. RFC-0106: stagger animations (opt-in via stagger: true).
  if (options.stagger && has("[data-motion-stagger]")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initGsapStagger } = await import("./gsap-stagger.ts");
      await initGsapStagger({ prefersReducedMotion });
    });
  }

  // 9. RFC-0202: living photos runtime (opt-in via livePhotos: true).
  // Only the in-viewport/tap triggers carry [data-trigger]; the autoplay path is native.
  if (options.livePhotos && has("[data-live-photo][data-trigger]")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initLivePhotos } = await import("./live-photos.ts");
      await initLivePhotos({ prefersReducedMotion });
    });
  }

  // 10. RFC-0210: feature-video player (opt-in via videoPlayers: true).
  // Lazy Plyr + hls.js, gated on [data-video-player]; nothing loads without a feature video.
  if (options.videoPlayers && has("video[data-video-player]")) {
    const { scheduleTask } = await import("./scheduler.ts");
    scheduleTask(async () => {
      const { initVideoPlayers } = await import("./video-player.ts");
      await initVideoPlayers({ prefersReducedMotion });
    });
  }
}
