/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0802] GSAP mountain journey animation. Animates a marker along an SVG
  route path to a score position and zooms the camera out simultaneously.
  Triggered by form submission, not scroll. Respects prefers-reduced-motion.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
  <item>Do not use ScrollTrigger — this animation is form-triggered, not scroll-triggered.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0802: initial implementation with MotionPathPlugin, form-triggered animation, and reduced-motion fallback.</item>
</CHANGE_SUMMARY>
*/

export interface MountainJourneyAnimationOptions {
  sceneSelector: string;
  routeSelector: string;
  markerSelector: string;
  formSelector: string;
  errorSelector: string;
  workerEndpoint: string;
}

const CAMERA_INITIAL_ZOOM = 2.5;
const CAMERA_FINAL_ZOOM = 1.0;
const ANIMATION_DURATION = 3;

export async function initMountainJourneyAnimation(
  options: MountainJourneyAnimationOptions,
): Promise<void> {
  const scene = document.querySelector<HTMLElement>(options.sceneSelector);
  if (!scene) return;

  const route = document.querySelector<SVGPathElement>(options.routeSelector);
  const marker = document.querySelector<SVGCircleElement>(options.markerSelector);
  const form = document.querySelector<HTMLFormElement>(options.formSelector);
  const errorEl = document.querySelector<HTMLElement>(options.errorSelector);

  if (!route || !marker || !form || !errorEl) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return;

    errorEl.hidden = true;

    try {
      const response = await fetch(options.workerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        errorEl.hidden = false;
        return;
      }

      const data = (await response.json()) as { score: number };
      const score = Math.max(0, Math.min(100, data.score));

      if (prefersReducedMotion) {
        placeMarkerAtScore(route, marker, score);
        scene.style.transform = `scale(${CAMERA_FINAL_ZOOM})`;
        return;
      }

      try {
        const { gsap } = await import("gsap");
        const { MotionPathPlugin } = await import("gsap/MotionPathPlugin");
        gsap.registerPlugin(MotionPathPlugin);

        const pathLength = route.getTotalLength();
        const targetLength = (score / 100) * pathLength;
        const startPoint = route.getPointAtLength(0);
        marker.setAttribute("cx", String(startPoint.x));
        marker.setAttribute("cy", String(startPoint.y));

        const tl = gsap.timeline();
        tl.to(marker, {
          duration: ANIMATION_DURATION,
          ease: "power2.inOut",
          motionPath: {
            path: route,
            start: 0,
            end: score / 100,
          },
        }, 0);
        tl.to(scene, {
          duration: ANIMATION_DURATION,
          ease: "power2.inOut",
          scale: CAMERA_FINAL_ZOOM,
        }, 0);

        scene.style.transform = `scale(${CAMERA_INITIAL_ZOOM})`;
      } catch {
        placeMarkerAtScore(route, marker, score);
        scene.style.transform = `scale(${CAMERA_FINAL_ZOOM})`;
      }
    } catch {
      errorEl.hidden = false;
    }
  });
}

function placeMarkerAtScore(
  route: SVGPathElement,
  marker: SVGCircleElement,
  score: number,
): void {
  const pathLength = route.getTotalLength();
  const targetLength = (score / 100) * pathLength;
  const point = route.getPointAtLength(targetLength);
  marker.setAttribute("cx", String(point.x));
  marker.setAttribute("cy", String(point.y));
}
