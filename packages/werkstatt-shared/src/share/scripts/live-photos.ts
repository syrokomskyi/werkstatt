/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0202] Living-photos runtime. Wires the `in-viewport` (IntersectionObserver) and `tap`
  (button) playback triggers for [data-live-photo] elements emitted by <LivePhoto>. No GSAP, no
  framework — a few KB of vanilla DOM. The `autoplay` trigger is native and is never touched
  here (those elements carry no data-trigger). Respects prefers-reduced-motion: non-interactive
  playback is suppressed (static poster wins); a user tap always wins.
</purpose>
<non-goals>
  <item>Do not handle the autoplay (native) path — those elements have no data-trigger.</item>
  <item>Do not resolve clips or own presentation — that is @warpgogol/werkstatt-site/ui.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0202: introduced the living-photos runtime.</item>
</CHANGE_SUMMARY>
*/

export interface LivePhotosOptions {
  prefersReducedMotion?: boolean;
}

const PLAYING = "live-photo--playing";
const USER_PLAYING = "live-photo--user-playing";
const READY = "live-photo--ready";
const UNSUPPORTED = "live-photo--unsupported";

/** Cached WebM support check — true if browser claims VP8/VP9 support. */
let webmSupportCache: boolean | undefined;

function isIOSLike(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && "ontouchend" in document)
  );
}

/** Detect WebM support via canPlayType. Now more optimistic since we have MP4 fallbacks. */
function detectWebMSupport(): boolean {
  if (webmSupportCache !== undefined) return webmSupportCache;

  const video = document.createElement("video");
  const canPlay =
    video.canPlayType('video/webm; codecs="vp8, vorbis"') !== "" ||
    video.canPlayType('video/webm; codecs="vp9"') !== "" ||
    video.canPlayType("video/webm") !== "";

  // Check if MP4 is supported as fallback (almost universal)
  const canPlayMP4 =
    video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== "" ||
    video.canPlayType("video/mp4") !== "";

  // If we have MP4 support, we can be less strict about WebM
  // iOS will get MP4 fallback, so we don't need to mark as unsupported
  webmSupportCache = canPlay || canPlayMP4;
  return webmSupportCache;
}

/** Mark a living photo as unsupported — hide video, keep poster visible. */
function markUnsupported(root: HTMLElement, video: HTMLVideoElement): void {
  root.classList.add(UNSUPPORTED);
  root.classList.remove(PLAYING, USER_PLAYING, READY);
  video.style.display = "none";
  // Hide the toggle button on unsupported devices
  const toggle = root.querySelector<HTMLButtonElement>(".live-photo__toggle");
  if (toggle) toggle.style.display = "none";
}

function setReady(root: HTMLElement, ready: boolean): void {
  if (ready) {
    root.classList.add(READY);
  } else {
    root.classList.remove(READY);
  }
}

function ensureVideoSources(video: HTMLVideoElement): void {
  let changed = false;
  for (const source of Array.from(video.querySelectorAll<HTMLSourceElement>("source[data-src]"))) {
    const src = source.dataset.src;
    if (!src || source.getAttribute("src") === src) continue;
    source.setAttribute("src", src);
    changed = true;
  }
  if (changed) video.load();
}

function attemptPlay(root: HTMLElement, video: HTMLVideoElement, _byUser: boolean): void {
  ensureVideoSources(video);
  const canPlay = video.readyState >= 3; // HAVE_FUTURE_DATA

  if (!canPlay) {
    // Wait for video to be ready before playing (prevents iOS black flash)
    video.addEventListener(
      "canplaythrough",
      () => {
        setReady(root, true);
        void video.play().catch(() => handlePlayFailure(root));
      },
      { once: true },
    );
    // Also listen for error — if video can't load, revert to poster
    video.addEventListener(
      "error",
      () => {
        handlePlayFailure(root);
      },
      { once: true },
    );
    return;
  }

  setReady(root, true);
  void video.play().catch(() => handlePlayFailure(root));
}

function handlePlayFailure(root: HTMLElement): void {
  // Play policy rejected (e.g., iOS without user gesture) or video error — restore poster
  root.classList.remove(PLAYING, USER_PLAYING, READY);
  const toggle = root.querySelector<HTMLButtonElement>(".live-photo__toggle");
  if (toggle) toggle.setAttribute("aria-pressed", "false");
}

function setPlaying(
  root: HTMLElement,
  video: HTMLVideoElement,
  on: boolean,
  byUser: boolean,
): void {
  if (on) {
    root.classList.add(PLAYING);
    if (byUser) root.classList.add(USER_PLAYING);
    attemptPlay(root, video, byUser);
  } else {
    root.classList.remove(PLAYING, USER_PLAYING, READY);
    video.pause();
  }
  const toggle = root.querySelector<HTMLButtonElement>(".live-photo__toggle");
  if (toggle) toggle.setAttribute("aria-pressed", String(root.classList.contains(PLAYING)));
}

export async function initLivePhotos(options: LivePhotosOptions = {}): Promise<void> {
  const prefersReducedMotion =
    options.prefersReducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const roots = document.querySelectorAll<HTMLElement>("[data-live-photo][data-trigger]");
  if (roots.length === 0) return;

  // One shared observer for all in-viewport clips.
  const observed = new Map<Element, HTMLVideoElement>();
  const observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const video = observed.get(entry.target);
              if (!video) continue;
              const isIntersecting = entry.isIntersecting;
              // iOS Safari respects autoplay attribute more than programmatic play()
              if (isIntersecting) {
                video.setAttribute("autoplay", "");
              } else {
                video.removeAttribute("autoplay");
              }
              setPlaying(entry.target as HTMLElement, video, isIntersecting, false);
            }
          },
          { threshold: 0.25 },
        )
      : null;

  for (const root of Array.from(roots)) {
    if (root.dataset.livePhotoReady === "true") continue;
    root.dataset.livePhotoReady = "true";

    const video = root.querySelector<HTMLVideoElement>(".live-photo__video");
    if (!video) continue;

    // Check WebM support early — if unsupported, hide video and keep poster
    if (!detectWebMSupport()) {
      markUnsupported(root, video);
      continue;
    }

    const mp4Src = root.dataset.mp4Src;

    // iOS Safari decodes VP8/VP9 WebM but ignores its alpha channel: a transparent
    // living photo plays with a dirty opaque background instead of the cut-out subject.
    // (Other browsers honour VP9 alpha and render it correctly.) These decorative
    // portraits ship WebM-only — there is no iOS-playable alpha source — so the only
    // correct iOS behaviour is to keep the transparent static poster. When an explicit
    // MP4 fallback is authored (opaque clips), we still let iOS play it below.
    if (isIOSLike() && !mp4Src) {
      markUnsupported(root, video);
      continue;
    }

    if (mp4Src && isIOSLike()) {
      const firstSource = video.querySelector<HTMLSourceElement>("source");
      if (firstSource) {
        firstSource.dataset.src = mp4Src;
        firstSource.setAttribute("type", "video/mp4");
      }
    }

    const trigger = root.dataset.trigger;
    const tapBehavior = root.dataset.tapBehavior ?? "toggle";
    const toggle = root.querySelector<HTMLButtonElement>(".live-photo__toggle");

    // Control: user-initiated, always permitted (even under reduced motion).
    if (toggle) {
      toggle.addEventListener("click", () => {
        const playing = root.classList.contains(PLAYING);
        if (playing && tapBehavior === "toggle") {
          setPlaying(root, video, false, false);
        } else {
          // For iOS: ensure autoplay attribute is set before user-triggered play
          video.setAttribute("autoplay", "");
          setPlaying(root, video, true, true);
        }
      });
    }

    // Video load error handling — iOS may fail to decode WebM
    video.addEventListener("error", () => {
      // Video failed to load/decode — ensure poster remains visible
      root.classList.remove(PLAYING, USER_PLAYING, READY);
      if (!mp4Src) video.style.display = "none";
    });

    // Metadata loaded — we know dimensions but may not be ready to play yet
    video.addEventListener("loadedmetadata", () => {
      // Video metadata available, but we wait for canplaythrough before marking ready
    });

    // in-viewport auto playback — suppressed under reduced motion (poster stays).
    if (trigger === "in-viewport" && !prefersReducedMotion && observer) {
      observed.set(root, video);
      observer.observe(root);
    }

    // Pause when tab is hidden (mobile UX + power saving)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && root.classList.contains(PLAYING)) {
        setPlaying(root, video, false, false);
      }
    });
  }
}
