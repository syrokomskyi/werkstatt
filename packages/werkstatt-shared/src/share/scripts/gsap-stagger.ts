/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0106] GSAP stagger for [data-motion-stagger] parents — animates child
  elements in sequence on scroll-in.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

export interface GsapStaggerOptions {
  prefersReducedMotion?: boolean;
}

export async function initGsapStagger(options: GsapStaggerOptions = {}): Promise<void> {
  const prefersReducedMotion =
    options.prefersReducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll<HTMLElement>("[data-motion-stagger]");
  if (targets.length === 0) return;

  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);

  for (const parent of Array.from(targets)) {
    if (parent.dataset.motionStaggerReady === "true") continue;
    parent.dataset.motionStaggerReady = "true";

    const childSelector = parent.dataset.motionStaggerChild ?? "[data-motion-child]";
    const delay = Number.parseFloat(parent.dataset.motionStaggerDelay ?? "0.1");
    const children = parent.querySelectorAll<HTMLElement>(childSelector);
    if (children.length === 0) continue;

    gsap.from(Array.from(children), {
      opacity: 0,
      y: 12,
      duration: 0.5,
      ease: "power2.out",
      stagger: delay,
      scrollTrigger: {
        trigger: parent,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  }
}
