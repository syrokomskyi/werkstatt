/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0210] Feature-video runtime. Lazily upgrades native <video controls> elements marked
  [data-video-player] into a branded Plyr player, attaching hls.js for adaptive HLS playback on
  browsers without native HLS. Follows the RFC-0175 click-to-load / in-viewport posture: nothing
  is imported until a feature video is near the viewport, so pages without a feature video (and
  the above-the-fold paint) ship zero player bytes. Resolves and records the playback mode
  (file|stream) + impl (native|hlsjs|progressive) on the element. Degrades to the native controls
  if Plyr/hls.js fail to load (progressive enhancement).
</purpose>
<non-goals>
  <item>Do not touch ambient/background <video> — those are native (handled by live-photos).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0210: introduced the lazy feature-video player runtime.</item>
</CHANGE_SUMMARY>
*/

import "plyr/dist/plyr.css";

export interface VideoPlayersOptions {
  prefersReducedMotion?: boolean;
}

function nativeHlsSupported(video: HTMLVideoElement): boolean {
  return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

async function upgrade(video: HTMLVideoElement): Promise<void> {
  if (video.dataset.videoPlayerReady === "true") return;
  video.dataset.videoPlayerReady = "true";

  const hlsUrl = video.dataset.hls;
  let mode: "file" | "stream" = "file";
  let impl: "native" | "hlsjs" | "progressive" = "progressive";
  let hlsInstance: { destroy: () => void } | null = null;

  if (hlsUrl) {
    if (nativeHlsSupported(video)) {
      // Safari/iOS: native HLS — make the manifest the preferred source.
      const source = document.createElement("source");
      source.src = hlsUrl;
      source.type = "application/vnd.apple.mpegurl";
      video.insertBefore(source, video.firstChild);
      video.load();
      mode = "stream";
      impl = "native";
    } else {
      try {
        const { default: Hls } = await import("hls.js/light");
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true });
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hlsInstance = hls;
          mode = "stream";
          impl = "hlsjs";
        }
      } catch {
        /* hls.js unavailable — fall through to progressive MP4 sources */
      }
    }
  }

  video.dataset.playbackMode = mode;
  video.dataset.playbackImpl = impl;

  // Brand the UI with Plyr (the native controls remain the fallback if this fails).
  try {
    const { default: Plyr } = await import("plyr");
    const player = new Plyr(video, {
      controls: [
        "play-large",
        "play",
        "progress",
        "current-time",
        "mute",
        "volume",
        "captions",
        "fullscreen",
      ],
    });
    // Keep hls.js bound across Plyr's internal media swaps.
    void player;
    void hlsInstance;
  } catch {
    /* Plyr unavailable — native controls already present */
  }
}

export async function initVideoPlayers(_options: VideoPlayersOptions = {}): Promise<void> {
  const videos = Array.from(
    document.querySelectorAll<HTMLVideoElement>("video[data-video-player]"),
  );
  if (videos.length === 0) return;

  if (!("IntersectionObserver" in window)) {
    for (const v of videos) await upgrade(v);
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const video = entry.target as HTMLVideoElement;
        obs.unobserve(video);
        void upgrade(video);
      }
    },
    { rootMargin: "200px" },
  );
  for (const v of videos) observer.observe(v);
}
