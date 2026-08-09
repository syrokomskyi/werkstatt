/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0106] GSAP parallax for [data-parallax-speed] elements (emitted by
  <SectionImage parallax> and <SiteBackground kind: image>).
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

export interface GsapParallaxOptions {
  prefersReducedMotion?: boolean;
}

export async function initGsapParallax(options: GsapParallaxOptions = {}): Promise<void> {
  const prefersReducedMotion =
    options.prefersReducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const targets = document.querySelectorAll<HTMLElement>("[data-parallax-speed]");
  if (targets.length === 0) return;

  const { gsap } = await import("gsap");
  const { ScrollTrigger } = await import("gsap/ScrollTrigger");
  gsap.registerPlugin(ScrollTrigger);

  for (const el of Array.from(targets)) {
    if (el.dataset.parallaxReady === "true") continue;
    el.dataset.parallaxReady = "true";

    const speed = Number.parseFloat(el.dataset.parallaxSpeed ?? "0.4");
    const parent = el.parentElement ?? el;

    gsap.to(el, {
      yPercent: speed * -50,
      ease: "none",
      scrollTrigger: {
        trigger: parent,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
      },
    });
  }
}
