# Living Photos

> **Established by:** RFC-0202 · DNA-04 · DNA-08 · DNA-15 · builds on RFC-0152 (Image Provider Port) and RFC-0151 (the static-or-enhanced pattern)

A **living photo** is an ordinary authored photo that animates with a short looping clip. The static image stays the resting state, poster, fallback, and LCP element; the looping `<video>` is a strictly additive, decorative overlay. A photo is static unless you opt it in.

---

## The hard convention: no video path in markdown

**You never name the clip.** The clip is, by convention, the sibling file `<image-name>.webm` sitting next to the poster image. There is no `video:` / `videoName` / `posterName` field — adding one is wrong.

```
src/content/business/de/assets/
  maria-calderon.webp   ← poster (the authored image token is `maria-calderon`)
  maria-calderon.webm   ← the living-photo clip (same stem, .webm)
```

Only `.webm` is supported today (it is what the `video-loop` pipeline emits).

---

## Authoring

Add a `live:` block wherever you author an image that flows through `<SectionImage>` — most directly, on a **Person record** (the People module, RFC-0200) or any section image prop.

```yaml
# business/de/people/maria-calderon.md  (or any SectionImage-backed block)
photo: maria-calderon
live:
  trigger: in-viewport   # in-viewport (default) | tap | autoplay
  loop: true             # default true; false = play once, rest on last frame
  tapBehavior: toggle    # toggle (default) | play-only
  preload: metadata      # none | metadata (default) | auto
```

| Field | Meaning |
| --- | --- |
| `trigger` | **`in-viewport`** plays while scrolled into view, pauses when out (needs JS). **`tap`** stays static until the visitor taps the play control. **`autoplay`** plays immediately on load via native attributes — **zero JavaScript**. |
| `loop` | Loop continuously (`true`, default) or play once. |
| `tapBehavior` | `toggle` — a tap pauses a playing clip / resumes it. `play-only` — the control only starts the clip, never pauses. |
| `preload` | Standard `<video preload>` hint. `metadata` is the recommended default. |

Set `live: { enabled: false }` to keep a record's `live` config but render the plain static photo.

---

## What you get (and don't have to build)

- The static `<ResponsiveImage>` (srcset, `alt`, intrinsic size) is always rendered as poster + fallback. **CLS stays 0**, LCP and accessibility are unchanged.
- The `<video>` is `muted`, `aria-hidden`, and keyboard-excluded; the `<img alt>` is the single semantic source. Control is a real labeled `<button>`.
- **`prefers-reduced-motion: reduce`** suppresses all non-interactive playback (the static poster shows); only a user tap may start a clip.
- The runtime is opt-in, scheduler-deferred, and gated on `[data-live-photo]` — sites with no living photos ship zero extra bytes. `autoplay`-triggered clips need no JS at all.

---

## Validation

`live.media.validate` runs in the standard author pipeline (`APPS_CHECK_AUTHOR_PIPELINE`) and **fails the build** on:

- `missing-video` — an image authored `live` has no sibling `<token>.webm`.
- `orphan-video` — a content `.webm` has no sibling static poster image (`<name>.{webp,jpg,jpeg,png}`).

It no-op passes when an app has no living photos and no clips.

---

## Out of scope (do not attempt under RFC-0202)

- No audio, captions, or transcripts — living photos are decorative and muted (a future guide-video RFC owns those).
- No media-player controls / scrubber / fullscreen (Plyr/Mux tier — a separate RFC).
- No `mp4`/`hevc` `<source>` fallback yet — webm-only.
