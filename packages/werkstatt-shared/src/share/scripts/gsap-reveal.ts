/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0106] GSAP scroll-triggered reveal animation. Hooks every
  [data-motion-reveal] element with fade / fade-up / fade-up-stagger variants.
  Respects prefers-reduced-motion.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

export interface GsapRevealOptions {
  prefersReducedMotion?: boolean;
}

export async function initGsapReveal(options: GsapRevealOptions = {}): Promise<void> {
  const prefersReducedMotion =
    options.prefersReducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll<HTMLElement>("[data-motion-reveal]");
  if (targets.length === 0) return;

  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);

  for (const el of Array.from(targets)) {
    if (el.dataset.motionRevealReady === "true") continue;
    el.dataset.motionRevealReady = "true";

    const variant = el.dataset.motionRevealVariant ?? "fade-up";
    const threshold = Number.parseFloat(el.dataset.motionRevealThreshold ?? "0.15");
    const once = el.dataset.motionRevealOnce !== "false";

    const fromVars: gsap.TweenVars = { opacity: 0 };
    if (variant === "fade-up" || variant === "fade-up-stagger") {
      fromVars.y = 16;
    }

    const toVars: gsap.TweenVars = {
      opacity: 1,
      y: 0,
      duration: 0.6,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: `top ${100 - threshold * 100}%`,
        toggleActions: once ? "play none none none" : "play none none reverse",
      },
    };

    if (variant === "fade-up-stagger") {
      const children = el.querySelectorAll<HTMLElement>(":scope > *");
      gsap.from(Array.from(children), { ...fromVars, ...toVars, stagger: 0.1 });
    } else {
      gsap.from(el, { ...fromVars, ...toVars });
    }
  }
}
