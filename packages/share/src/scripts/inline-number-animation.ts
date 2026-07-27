/*
<MODULE_CONTRACT>
<purpose>Animates .js-inline-number spans using GSAP count-up + ScrollTrigger. Deferred-loaded; never imported unconditionally.</purpose>
<non-goals>
  <item>Do not apply opacity, y, scale, or any spatial tween to inline number spans — causes layout reflow.</item>
  <item>Do not load gsap at module level — dynamic import is mandatory.</item>
  <item>Do not animate numbers inside headings — those are excluded at SSR pre-wrap time.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0041: Created as shared GSAP inline number animation module in @warpgogol/share/scripts.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: RFC-0041. No spatial tweens on inline elements. Dynamic GSAP import only.

export interface InlineNumberAnimationOptions {
  prefersReducedMotion?: boolean;
}

/**
 * Animates all `.js-inline-number` spans found in the document using GSAP count-up.
 * Duration is read from each span's `data-duration` attribute (default 3.0 s).
 * No spatial tweens — only the numeric value is animated to prevent CLS.
 * Safe to call multiple times — spans are guarded with `data-gsap-ready`.
 * No-ops when `prefersReducedMotion` is true (sets final values synchronously).
 */
export async function initInlineNumberAnimation(
  options: InlineNumberAnimationOptions = {},
): Promise<void> {
  const { prefersReducedMotion = false } = options;

  const spans = document.querySelectorAll<HTMLElement>(".js-inline-number");
  if (spans.length === 0) return;

  // Locale from document lang attribute, fallback to de-DE
  const locale = document.documentElement.lang || "de-DE";

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));

  // Reduced-motion: set final values immediately, no GSAP
  if (prefersReducedMotion) {
    spans.forEach((el) => {
      if (el.dataset.gsapReady === "true") return;
      el.dataset.gsapReady = "true";
      const numeric = Number(el.dataset.numeric ?? 0);
      el.textContent = formatNumber(numeric);
    });
    return;
  }

  // Dynamically import GSAP — excluded from orchestrator's initial bundle
  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);

  // Wire ScrollTrigger to Lenis: on every Lenis scroll tick, feed the current
  // scroll position into ScrollTrigger so it doesn't rely on native scroll events.
  type LenisScrollEvent = { scroll: number };
  type LenisInstance = { on: (event: string, cb: (e: LenisScrollEvent) => void) => void };

  const wireLenis = (lenis: LenisInstance) => {
    lenis.on("scroll", (e: LenisScrollEvent) => {
      void e; // position already reflected in window.scrollY by Lenis native scroll
      ScrollTrigger.update();
    });
    // Defer refresh to next rAF so layout is fully settled before positions are measured
    requestAnimationFrame(() => ScrollTrigger.refresh());
  };

  const existingLenis = (window as unknown as Record<string, unknown>)["wgLenis"] as
    LenisInstance | undefined;

  if (existingLenis) {
    wireLenis(existingLenis);
  } else {
    window.addEventListener(
      "lenis:ready",
      (e) => {
        const { lenis } = (e as CustomEvent<{ lenis: LenisInstance }>).detail;
        if (lenis) wireLenis(lenis);
      },
      { once: true },
    );
  }

  spans.forEach((el) => {
    if (el.dataset.gsapReady === "true") return;
    el.dataset.gsapReady = "true";

    const endValue = Number(el.dataset.numeric ?? 0);
    const duration = Number(el.dataset.duration ?? 3.0);

    const counter = { value: 0 };

    // Only count-up tween — NO spatial tweens (y/opacity) on inline elements
    gsap.to(counter, {
      value: endValue,
      duration,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        once: true,
        fastScrollEnd: true,
      },
      onUpdate: () => {
        el.textContent = formatNumber(counter.value);
      },
      onComplete: () => {
        // Ensure exact final value (avoids floating-point display artifacts)
        el.textContent = formatNumber(endValue);
      },
    });
  });
}
