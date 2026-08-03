/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/scripts/lenis.ts as an authored share script module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not manage app-specific UI states (e.g. scroll-to-top button visibility).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Migrated Lenis initialization to @warpgogol/share/scripts for platform-wide reuse.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: This is a high-risk module. Preserve its core logic and minimize external side effects during modification.

export type LenisInstance = import("lenis").default;

export type InitLenisOptions = {
  prefersReducedMotion?: boolean;
  headerOffset?: number;
  duration?: number;
  onScroll?: (lenis: LenisInstance) => void;
};

let lenisInstance: LenisInstance | null = null;

export async function initLenis(
  options: InitLenisOptions = {},
): Promise<LenisInstance | undefined> {
  const { prefersReducedMotion = false, headerOffset = 0, duration = 1.2, onScroll } = options;

  if (prefersReducedMotion) {
    (window as Window & { wgLenis?: LenisInstance }).wgLenis = undefined;
    return;
  }

  const Lenis = await import("lenis");

  lenisInstance = new Lenis.default({
    duration,
    easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
    orientation: "vertical",
    gestureOrientation: "vertical",
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 2,
  });

  (window as Window & { wgLenis?: LenisInstance }).wgLenis = lenisInstance;

  if (onScroll) {
    lenisInstance.on("scroll", () => onScroll(lenisInstance!));
  }

  window.dispatchEvent(
    new CustomEvent("lenis:ready", {
      detail: { lenis: lenisInstance },
    }),
  );

  const activeLenis = lenisInstance;

  // Handle anchor links for smooth scrolling
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a[href^="#"]');

    if (link) {
      const href = link.getAttribute("href");
      if (href && href !== "#") {
        const targetElement = document.querySelector(href);
        if (targetElement) {
          // Skip if it's a modal or something that should handle itself
          if (targetElement.classList.contains("wl-modal")) {
            return;
          }

          e.preventDefault();
          activeLenis.scrollTo(targetElement as HTMLElement, {
            offset: -headerOffset,
            immediate: prefersReducedMotion,
          });
        }
      }
    }
  });

  // Scroll to hash target on page load (cross-page anchor navigation)
  if (window.location.hash) {
    const hashTarget = document.querySelector(window.location.hash);
    if (hashTarget && !hashTarget.classList.contains("wl-modal")) {
      // Defer until after the browser's initial scroll attempt
      requestAnimationFrame(() => {
        activeLenis.scrollTo(hashTarget as HTMLElement, {
          offset: -headerOffset,
          immediate: prefersReducedMotion,
        });
      });
    }
  }

  function raf(time: number) {
    activeLenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);

  return activeLenis;
}
