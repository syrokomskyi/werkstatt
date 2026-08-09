/*
<MODULE_CONTRACT>
<purpose>
  Filesystem adapter barrel for @warpgogol/content-source. Exports the FS
  capabilities, asset resolvers, and collection loaders. Consumers that need
  FS-specific imports should use @warpgogol/content-source/fs to avoid
  pulling FS dependencies into port-only consumers.
</purpose>
<non-goals>
  <item>Do not export port contracts here — those live in the root barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract FS adapter exports into a dedicated sub-barrel.</item>
</CHANGE_SUMMARY>
*/

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
