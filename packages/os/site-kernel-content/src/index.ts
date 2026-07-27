/* 
<MODULE_CONTRACT> 
<purpose>Facilitates the aggregation and processing of markdown content for the site kernel.</purpose> 
 
 
<non-goals> 
<item>Do not handle raw content parsing directly.</item> 
<item>Do not manage transport or configuration orchestration.</item> 
</non-goals> 
</MODULE_CONTRACT> 
 
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY> 
*/

export { collectMarkdownFiles } from "./content-files.ts";
export { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "./markdown-frontmatter.ts";
export type { ParsedFrontmatter } from "./markdown-frontmatter.ts";
export {
  loadI18nConfig,
  loadI18nConfigSync,
  validateI18nConfigApp,
  generateLanguageDetectionMiddleware,
} from "./i18n-config.ts";
export type {
  I18nConfig,
  I18nLanguageConfig,
  ResolvedI18n,
  LanguageDetectionMiddlewareOptions,
  GeneratedMiddlewareResult,
} from "./i18n-config.ts";
export {
  loadSystemManifest,
  loadSystemManifestSync,
  isUsingSystemMd,
  isUsingSystemMdSync,
} from "./system-manifest.ts";
export type { SystemManifest, SystemManifestLoadResult } from "./system-manifest.ts";
export {
  loadSemanticSiteModel,
  createNodeFsContentProvider,
  createFsSemanticReader,
} from "./semantic-loader.ts";
export type { SemanticLoaderOptions } from "./semantic-loader.ts";
export { emitPipelineLogEvent, getPipelineLogEvents } from "./pipeline-log.ts";
export type { PipelineLogEvent, PipelineLogKind, PipelineLogSeverity } from "./pipeline-log.ts";
