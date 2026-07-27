/*
<MODULE_CONTRACT>
<purpose>Initializes GSAP + ScrollTrigger animated stat counters for sections marked data-animated="true". Deferred-loaded; never imported unconditionally.</purpose>
<non-goals>
  <item>Do not animate sections other than those with data-animated="true".</item>
  <item>Do not import gsap at module level — dynamic import is required for deferred loading.</item>
  <item>Do not use this for non-counter animations (parallax, reveal, stagger of sections).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0040: Created as shared GSAP counter initialization module in @gogol/share/scripts.</item>
  <item>Extended selector to support .hero__stat in addition to .impact-section__stat.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: RFC-0040. Do not import gsap at the top level. Always dynamic-import inside initGsapCounter.

import { parseNumeric } from "../counter-utils.ts";

export interface GsapCounterOptions {
  prefersReducedMotion?: boolean;
  locale?: string;
}

/**
 * Finds all `.js-stat-counter` elements within sections marked `data-animated="true"`
 * and animates them using GSAP + ScrollTrigger.
 * Safe to call multiple times — elements are guarded with `data-gsap-ready`.
 * No-ops when `prefersReducedMotion` is true (sets final values synchronously).
 */
export async function initGsapCounter(options: GsapCounterOptions = {}): Promise<void> {
  const { prefersReducedMotion = false, locale = "de-DE" } = options;

  const sections = document.querySelectorAll<HTMLElement>("[data-animated='true']");
  if (sections.length === 0) return;

  const formatNumber = (value: number, decimals = 0) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

  // Reduced-motion: reveal all cards and set final counter values immediately, no GSAP needed
  if (prefersReducedMotion) {
    sections.forEach((section) => {
      section
        .querySelectorAll<HTMLElement>(".impact-section__stat, .hero__stat, .section-stats__item")
        .forEach((statEl) => {
          if (statEl.dataset.gsapReady === "true") return;
          statEl.dataset.gsapReady = "true";
          statEl.style.opacity = "1";
          statEl.style.transform = "none";
          const valueEl = statEl.querySelector<HTMLElement>(".js-stat-counter");
          if (valueEl) {
            const numeric = Number(valueEl.dataset.numeric);
            const decimals = Number(valueEl.dataset.decimals ?? 0);
            if (!isNaN(numeric)) valueEl.textContent = formatNumber(numeric, decimals);
          }
          const prefixEl = statEl.querySelector<HTMLElement>(".js-stat-prefix");
          const suffixEl = statEl.querySelector<HTMLElement>(".js-stat-suffix");
          if (prefixEl) {
            prefixEl.style.opacity = "1";
            prefixEl.style.transform = "none";
          }
          if (suffixEl) {
            suffixEl.style.opacity = "1";
            suffixEl.style.transform = "none";
          }
        });
    });
    return;
  }

  // Dynamically import GSAP so it is excluded from the orchestrator's initial bundle
  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);

  // Wire ScrollTrigger to Lenis for correct scroll position tracking
  const wireLenis = (lenis: { on: (event: string, cb: (...args: unknown[]) => void) => void }) => {
    lenis.on("scroll", () => ScrollTrigger.update());
  };

  const existingLenis = (window as unknown as Record<string, unknown>)["wgLenis"] as
    { on: (event: string, cb: (...args: unknown[]) => void) => void } | undefined;

  if (existingLenis) {
    wireLenis(existingLenis);
    ScrollTrigger.refresh();
  } else {
    window.addEventListener(
      "lenis:ready",
      (e) => {
        const { lenis } = (e as CustomEvent<{ lenis: typeof existingLenis }>).detail;
        if (lenis) {
          wireLenis(lenis);
          ScrollTrigger.refresh();
        }
      },
      { once: true },
    );
  }

  sections.forEach((section) => {
    const allStats = section.querySelectorAll<HTMLElement>(
      ".impact-section__stat, .hero__stat, .section-stats__item",
    );
    allStats.forEach((statEl) => {
      const valueEl = statEl.querySelector<HTMLElement>(".js-stat-counter");

      // Guard against double-init (keyed on the stat card, not the counter span)
      if (statEl.dataset.gsapReady === "true") return;
      statEl.dataset.gsapReady = "true";

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: {
          trigger: statEl,
          start: "top 82%",
          once: true,
          fastScrollEnd: true,
        },
      });

      // Card reveal — runs for every stat (counter or static)
      tl.fromTo(statEl, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 });

      if (valueEl) {
        const endValue = Number(valueEl.dataset.numeric ?? 0);
        const startValue = parseNumeric(valueEl.dataset.start) ?? 0;
        const decimals = Number(valueEl.dataset.decimals ?? 0);
        const duration = Number(valueEl.dataset.duration ?? 1.8);

        const prefixEl = statEl.querySelector<HTMLElement>(".js-stat-prefix");
        const suffixEl = statEl.querySelector<HTMLElement>(".js-stat-suffix");

        const counter = { value: startValue };

        // Number count-up
        tl.to(
          counter,
          {
            value: endValue,
            duration,
            ease: "power2.out",
            onUpdate: () => {
              valueEl.textContent = formatNumber(counter.value, decimals);
            },
          },
          0.08,
        );

        // Prefix reveal
        if (prefixEl) {
          tl.fromTo(prefixEl, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.45 }, 0.14);
        }

        // Suffix reveal
        if (suffixEl) {
          tl.fromTo(suffixEl, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.45 }, 0.18);
        }
      }
    });
  });
}
