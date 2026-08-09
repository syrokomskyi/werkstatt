// @ai-invariant: This is a high-risk module. Preserve its core logic and minimize external side effects during modification.
/*************** <MODULE_CONTRACT> 
<purpose>Facilitates the dynamic loading and hydration of Lordicon elements based on viewport visibility.</purpose> 
 
 
<non-goals> 
<item>Do not handle raw content parsing for icons.</item> 
<item>Do not manage global application state or configuration.</item> 
<item>Do not perform network requests outside of JSON prefetching.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> ***************/

async function initLordIcon(): Promise<void> {
  const { defineElement } = await import("@lordicon/element");
  defineElement();
}

let lordIconLoaderPromise: Promise<void> | null = null;

const jsonPrefetchCache = new Map<string, Promise<void>>();

const ensureLordIconLoaded = () => {
  if (!lordIconLoaderPromise) {
    lordIconLoaderPromise = new Promise((resolve) => {
      void (async () => {
        const { scheduleTask } = await import("./scheduler.ts");
        scheduleTask(async () => {
          await initLordIcon();
          resolve();
        });
      })();
    });
  }
  return lordIconLoaderPromise;
};

const prefetchJsonOnce = (url: string) => {
  const existing = jsonPrefetchCache.get(url);
  if (existing) return existing;

  const p = fetch(url, { cache: "force-cache" })
    .then(() => {})
    .catch(() => {});
  jsonPrefetchCache.set(url, p);
  return p;
};

export function initLordIconOnDemand(): void {
  const icons = Array.from(document.querySelectorAll("lord-icon"));
  if (!icons.length) return;

  const hydrateIcon = async (icon: HTMLElement) => {
    // 1. Ensure library is loaded/loading
    ensureLordIconLoaded();

    // 2. Swap src if needed
    const src = icon.getAttribute("data-src");
    if (src && !icon.getAttribute("src")) {
      void prefetchJsonOnce(src);
      icon.setAttribute("src", src);
    }
  };

  if (typeof IntersectionObserver !== "function") {
    // Fallback: load everything immediately
    ensureLordIconLoaded();
    icons.forEach((icon) => {
      const src = icon.getAttribute("data-src");
      if (src) icon.setAttribute("src", src);
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const icon = entry.target as HTMLElement;
          hydrateIcon(icon);
          observer.unobserve(icon);
        }
      }
    },
    { rootMargin: "100px" }, // Smaller margin to defer loading of far-off icons
  );

  for (const icon of icons) {
    observer.observe(icon);
  }
}
