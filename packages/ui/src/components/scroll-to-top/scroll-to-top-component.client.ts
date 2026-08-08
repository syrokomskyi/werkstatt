/*
<MODULE_CONTRACT>
<purpose>Maintains packages/ui/src/components/scroll-to-top/scroll-to-top-component.client.ts as an authored ui component client module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not manage Lenis initialization — that lives in @warpgogol/share/scripts/lenis.ts.</item>
  <item>Do not handle per-site configuration or content-layer labels.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0768: Created scroll-to-top client script with Lenis integration and native fallback.</item>
</CHANGE_SUMMARY>
*/

type LenisInstance = {
  scrollTo: (target: number | HTMLElement, options?: { immediate?: boolean }) => void;
};

type LordIconElement = Element & {
  ready?: boolean;
  readyPromise?: Promise<void>;
  playerInstance?: { playFromStart: () => void; playing: boolean };
};

function initScrollToTop(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-scroll-to-top]");
  if (!button) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let latestScrollY = window.scrollY;
  let rafPending = false;

  const updateVisibility = () => {
    rafPending = false;
    const shouldShow = latestScrollY > window.innerHeight;
    button.classList.toggle("scroll-to-top--visible", shouldShow);
  };

  const onScroll = () => {
    latestScrollY = window.scrollY;
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(updateVisibility);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  updateVisibility();

  const scrollToTop = () => {
    const lenis = (window as Window & { wgLenis?: LenisInstance }).wgLenis;
    if (lenis) {
      lenis.scrollTo(0, { immediate: prefersReducedMotion });
    } else {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  };

  button.addEventListener("click", scrollToTop);

  const playLordIcon = () => {
    const icon = button.querySelector<LordIconElement>(".scroll-to-top__icon");
    if (!icon) return;
    const play = () => {
      const player = icon.playerInstance;
      if (player && !player.playing) {
        player.playFromStart();
      }
    };
    if (icon.ready) {
      play();
    } else if (icon.readyPromise) {
      icon.readyPromise.then(play);
    }
  };

  button.addEventListener("mouseenter", playLordIcon);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScrollToTop);
} else {
  initScrollToTop();
}
