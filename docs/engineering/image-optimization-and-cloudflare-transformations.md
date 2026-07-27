# Engineering: Image Optimization & Cloudflare Transformations

> RFC-0152 (amends RFC-0149) · packages: `@warpgogol/share`, `@warpgogol/ui`, `@warpgogol/site-kernel-checks`

This is the operator + agent runbook for how authored images are optimized, why production images can 404, and how to turn on responsive resizing safely.

---

## Architecture overview (one minute)

Every authored image renders through one primitive, **`<ResponsiveImage>`** (`@warpgogol/ui`), which delegates URL/`srcset` construction to the active **Image Provider** (`@warpgogol/share`, the rendering/optimization analogue of the RFC-0141 content-source port). No component contains optimization logic, so the backend swaps by provider/config — the same primitive serves in-repo assets today and headless-CMS/DAM URLs later.

- Source images stay **in-repo, webp, at maximum quality** (`image.format.validate`); the provider is responsible for downscaling per delivered width.
- Apps run `@astrojs/cloudflare` with **`imageService: "cloudflare"`** (RFC-0152). The old `imageService: "custom"` + build-time `sharp` is forbidden: it reads originals from `dist/_astro` while the adapter emits them to `dist/client/_astro`, which fails the build in the `generating optimized images` phase (ENOENT). See RFC-0152 for the full history.

The default provider is **`cloudflare-runtime`**, which can deliver images two ways:

| Mode | Markup | Resize / srcset | Requires |
| --- | --- | --- | --- |
| **Passthrough (default, safe)** | `<img src="/_astro/<hash>.webp">` | No | nothing — always works |
| **Transform (opt-in)** | `<img src="/cdn-cgi/image/…/_astro/<hash>.webp" srcset="…">` | Yes | Cloudflare Image Transformations enabled on the zone **and** `PUBLIC_CF_IMAGE_TRANSFORM=on` at build |

---

## ⚠️ Why production images can 404

`/cdn-cgi/image/<opts>/<origin>` URLs are served by **Cloudflare Image Transformations**, a **per-zone feature that is OFF by default**. When it is off, those URLs return **404** — there is **no graceful fallback**. (`onerror=redirect` only helps when the feature is _enabled_ but a _specific_ transform errors; it does nothing when the feature is off.)

Because of this, the `cloudflare-runtime` provider is **safe-by-default**: unless `PUBLIC_CF_IMAGE_TRANSFORM=on` is set at build time, it emits the **raw origin asset** (`/_astro/<hash>.webp`), which always deploys to `dist/client/_astro` and is served `200`. A normal `pnpm build` therefore produces a deploy whose images are visible — just not resized. Responsive `srcset` is strictly opt-in.

---

## Runbook: enable responsive resize/srcset in production

Do this **per zone / per app**:

1. **Enable Transformations on the zone.** Cloudflare dashboard → select the zone → **Images → Transformations** → enable. If images are fetched from this zone's own origin, also allow resizing from the zone's origin.
2. **Set the build flag** for that app's deploy build: `PUBLIC_CF_IMAGE_TRANSFORM=on` (in the app's `.env.production`, CI build env, or wrangler build vars — wherever the `pnpm build` for that app reads env).
3. **Rebuild and deploy** the app (`pnpm --filter <app> run build:deploy:main`).
4. **Verify** a transformed asset returns a real image, not HTML/404:

   ```bash
   curl -sI "https://<zone>/cdn-cgi/image/width=320,format=webp/_astro/<some-asset>.webp"
   # expect: HTTP/2 200  and  content-type: image/webp
   ```

To roll back to safe passthrough, unset the flag and rebuild — no code change needed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Browser 404s on `/cdn-cgi/image/.../_astro/*.webp`, images blank | Transformations not enabled on the zone, but the build emitted transform URLs (flag was on) | Enable Transformations (step 1), or unset `PUBLIC_CF_IMAGE_TRANSFORM` and rebuild for safe passthrough |
| 404s on **raw** `/_astro/<hash>.webp` too, and the HTML references `…_<suffix>.webp` derivatives | An **old pre-RFC-0152 build** is still deployed (Astro `<Image>` derivatives that never emitted) | Deploy the current build (`imageService: "cloudflare"`, `<ResponsiveImage>`) |
| Build fails in `generating optimized images` with `ENOENT … dist/_astro/…` | `imageService` regressed to `"custom"` + sharp | Restore `imageService: "cloudflare"` in the generated `astro.config.mjs` |
| Build fails on `cloudflare.assets.validate` | HTML references an `/_astro/*` asset missing from `dist/client` | Inspect the reported file — usually a stale reference or a non-emitted asset |

**Diagnose live quickly** — compare raw vs. transformed for the same asset:

```bash
asset="_astro/hero-bg.<hash>.webp"
curl -sI "https://<zone>/$asset"                                        # raw origin → should be 200
curl -sI "https://<zone>/cdn-cgi/image/width=320,format=webp/$asset"    # transform → 200 only if enabled
```

If raw is `200` and transform is `404` → Transformations are off (expected on the safe default; enable them for resize). If raw is `404` → wrong/old build deployed, or wrong zone.

---

## Guard: `cloudflare.assets.validate`

A post-build check (`@warpgogol/site-kernel-checks`, in `APPS_CHECK_POSTBUILD_PIPELINE`) scans `dist/client` HTML and fails the build if any referenced `/_astro/*` asset — directly or inside a `/cdn-cgi/image/.../_astro/...` URL — is missing from the deployable directory. It catches the `dist/_astro` vs `dist/client/_astro` class of 404 before deploy. Run it standalone with `site-kernel run cloudflare.assets.validate --site <app>`.

Note: this validates **origin** assets exist; it cannot detect a zone-level Transformations toggle (that is the `curl` check above).

---

## For AI agents

- Render authored images **only** through `<ResponsiveImage>` — never raw `<img>` (except SVG/`data:`) or Astro `<Image>`. See `packages/ui/AGENTS.md`.
- Do **not** hand-build `srcset` / `/cdn-cgi/image` URLs and do **not** write a custom resizer (sharp cannot run in workerd — RFC-0149). Add/select an `ImageProvider` in `@warpgogol/share` via `setDefaultImageProvider`. See `packages/share/AGENTS.md`.
- Do **not** force transform URLs on unconditionally. The safe passthrough default exists precisely because `/cdn-cgi/image` 404s on zones without Transformations. Gate it on `PUBLIC_CF_IMAGE_TRANSFORM=on`.
- `astro.config.mjs` is GENERATED — change `imageService` via the onboarding/codegen template, not by hand-editing per app.
