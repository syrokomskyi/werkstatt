/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0204] Build-portable image provider initialization.
  Runs once at build time (Astro SSG, Node.js context). When the app declares
  PUBLIC_IMAGE_PROVIDER=build-portable, loads the pre-generated variant manifest
  (src/image-variants.generated.yaml) and installs the build-portable provider as
  the active default, so every <ResponsiveImage> emits a responsive srcset from
  the pre-generated static width variants instead of falling back to the raw origin.
</purpose>
<non-goals>
  <item>Do not import Astro astro:assets / getImage / Image — provider emits URLs only.</item>
  <item>Do not run at request time in workerd — Astro SSG only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0204: created to wire the build-portable provider into the Astro build pipeline.</item>
</CHANGE_SUMMARY>
*/

import {
  createBuildPortableProvider,
  setDefaultImageProvider,
} from "@warpgogol/werkstatt-site/share/image-provider";
import type { ImageVariantManifest } from "@warpgogol/werkstatt-site/share/image-provider";
import { loadGeneratedManifest } from "./generated-manifest-loader.ts";

(function initImageProvider() {
  if (import.meta.env.PUBLIC_IMAGE_PROVIDER !== "build-portable") return;
  const manifest = loadGeneratedManifest<ImageVariantManifest>(
    "/src/image-variants.generated.yaml",
  );
  if (!manifest) {
    console.warn(
      "[RFC-0204] PUBLIC_IMAGE_PROVIDER=build-portable but src/image-variants.generated.yaml " +
        "was not found or unparseable. Run `image.variants.generate` in build.prepare first.",
    );
    return;
  }

  setDefaultImageProvider(createBuildPortableProvider(manifest));
})();
