/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] Public barrel for @gogol/content-source — the source-agnostic surface.
  Exports the port contracts, the filesystem adapter capabilities, the relocated asset
  resolver, and the Astro collection loaders. Deliberately does NOT re-export ./astro.ts so
  node-side consumers (e.g. kernel checks) can import contracts without pulling astro:content.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: initial public surface.</item>
</CHANGE_SUMMARY>
*/

export type {
  ContentDomain,
  ContentEntryRef,
  ContentEntry,
  ContentStatus,
  AssetRef,
  ResolvedAsset,
  ContentSourceCapabilities,
  ContentSourceProvider,
} from "./types.ts";

export { FS_CAPABILITIES } from "./adapters/fs/capabilities.ts";

export {
  resolveImage,
  resolveImageRequired,
  resolveVideo,
  resolveMedia,
  createImageResolver,
  createFsAssetResolver,
  contentAssetSyntaxDiagnostics,
  describeContentAssetResolution,
  IMAGE_EXTENSIONS,
  CONTENT_ASSET_DOMAINS,
  VIDEO_EXTENSIONS,
  MEDIA_SOURCE_EXTENSIONS,
  DEFAULT_LANGUAGE,
} from "./adapters/fs/assets.ts";
export type {
  ImageResolverOptions,
  ResolvedMediaSource,
  ContentAssetDomain,
  ContentAssetExtension,
  ContentAssetSyntaxDiagnostic,
  ContentAssetToken,
  ContentAssetCandidate,
  ContentAssetResolutionContract,
  ContentAssetResolutionOptions,
} from "./adapters/fs/assets.ts";

export { fsMarkdownCollectionLoader, fsDataCollectionLoader } from "./adapters/fs/loaders.ts";
export type {
  MarkdownCollectionLoaderOptions,
  DataCollectionLoaderOptions,
} from "./adapters/fs/loaders.ts";
