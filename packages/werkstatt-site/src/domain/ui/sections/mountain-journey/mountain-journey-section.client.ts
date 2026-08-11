/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0802] Client entry for mountain-journey section. Guards DOM presence,
  reads worker endpoint from import.meta.env, and delegates to
  initMountainJourneyAnimation.
</purpose>
<non-goals>
  <item>Do not import GSAP directly; the shared script handles dynamic imports.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0802: initial client entry for mountain-journey section.</item>
</CHANGE_SUMMARY>
*/

import { initMountainJourneyAnimation } from "@warpgogol/werkstatt-site/share/scripts/gsap-mountain-journey";

function init(): void {
  const scene = document.querySelector<HTMLElement>("[data-mountain-journey-scene]");
  if (!scene) return;

  const workerEndpoint = scene.dataset.workerEndpoint;
  if (!workerEndpoint) {
    const errorEl = document.querySelector<HTMLElement>("[data-mountain-journey-error]");
    if (errorEl) errorEl.hidden = false;
    return;
  }

  void initMountainJourneyAnimation({
    sceneSelector: "[data-mountain-journey-scene]",
    visualSelector: "[data-mountain-journey-visual]",
    routeSelector: "[data-mountain-journey-route]",
    markerSelector: "[data-mountain-journey-marker]",
    formSelector: "[data-mountain-journey-form]",
    errorSelector: "[data-mountain-journey-error]",
    workerEndpoint,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
