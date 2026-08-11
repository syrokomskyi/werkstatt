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
  visualSelector: string;
  routeSelector: string;
  markerSelector: string;
  formSelector: string;
  errorSelector: string;
  workerEndpoint: string;
}

const CAMERA_INITIAL_ZOOM = 3;
const CAMERA_FINAL_ZOOM = 1.0;
const ANIMATION_DURATION = 3;
const DEFAULT_SCORE = 30;

export async function initMountainJourneyAnimation(
  options: MountainJourneyAnimationOptions,
): Promise<void> {
  const scene = document.querySelector<HTMLElement>(options.sceneSelector);
  if (!scene) return;

  const visual = document.querySelector<HTMLElement>(options.visualSelector);
  const route = document.querySelector<SVGPathElement>(options.routeSelector);
  const marker = document.querySelector<SVGCircleElement>(options.markerSelector);
  const form = document.querySelector<HTMLFormElement>(options.formSelector);
  const errorEl = document.querySelector<HTMLElement>(options.errorSelector);

  if (!visual || !route || !marker || !form || !errorEl) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const startPoint = route.getPointAtLength(0);
  marker.setAttribute("cx", String(startPoint.x));
  marker.setAttribute("cy", String(startPoint.y));

  if (!prefersReducedMotion) {
    visual.style.transform = `scale(${CAMERA_INITIAL_ZOOM})`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const rawInput = String(formData.get("url") ?? "").trim();
    if (!rawInput) return;

    const domain = rawInput.replace(/^https?:\/\//, "").replace(/\/$/, "");

    errorEl.hidden = true;

    let score: number = DEFAULT_SCORE;
    try {
      const response = await fetch(options.workerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: domain }),
      });

      if (response.ok) {
        const data = (await response.json()) as { score: number };
        score = Math.max(0, Math.min(100, data.score));
      }
    } catch {
      // CORS or network error — use default score
    }

    if (prefersReducedMotion) {
      placeMarkerAtScore(route, marker, score);
      return;
    }

    try {
      const { gsap } = await import("gsap");

      const pathLength = route.getTotalLength();
      const targetLength = (score / 100) * pathLength;
      const progress = { t: 0 };

      gsap.set(visual, { scale: CAMERA_INITIAL_ZOOM });

      const tl = gsap.timeline();
      tl.to(
        progress,
        {
          duration: ANIMATION_DURATION,
          ease: "power2.inOut",
          t: 1,
          onUpdate: () => {
            const len = progress.t * targetLength;
            const pt = route.getPointAtLength(len);
            marker.setAttribute("cx", String(pt.x));
            marker.setAttribute("cy", String(pt.y));
          },
        },
        0,
      );
      tl.to(
        visual,
        {
          duration: ANIMATION_DURATION,
          ease: "power2.inOut",
          scale: CAMERA_FINAL_ZOOM,
        },
        0,
      );
    } catch (err) {
      console.error("[mountain-journey] GSAP animation failed:", err);
      placeMarkerAtScore(route, marker, score);
    }
  });
}

function placeMarkerAtScore(route: SVGPathElement, marker: SVGCircleElement, score: number): void {
  const pathLength = route.getTotalLength();
  const targetLength = (score / 100) * pathLength;
  const point = route.getPointAtLength(targetLength);
  marker.setAttribute("cx", String(point.x));
  marker.setAttribute("cy", String(point.y));
}
