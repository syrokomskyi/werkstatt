/*
<MODULE_CONTRACT>
<purpose>RFC-0208: block text extraction types and registry. Declarative extractors map block-based page content into semantic text for markdown twins.</purpose>
<non-goals>
  <item>Do not contain extractor implementations — those live in block-extractors/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0208: introduced block extraction layer for comprehensive markdown twins.</item>
</CHANGE_SUMMARY>
*/

export interface ExtractionContext {
  pageId: string;
  lang: string;
  siteUrl: string;
}

export interface ExtractedBlockContent {
  heading?: string;
  lead?: string;
  body?: string;
  items?: Array<{ title: string; description?: string }>;
  sourceBlockId?: string;
}

export interface BlockTextExtractor<T = unknown> {
  blockType: string;
  extract(props: T, ctx: ExtractionContext): ExtractedBlockContent;
}

export class BlockExtractorRegistry {
  private extractors = new Map<string, BlockTextExtractor>();

  register<T>(extractor: BlockTextExtractor<T>): void {
    this.extractors.set(extractor.blockType, extractor as BlockTextExtractor<unknown>);
  }

  get(blockType: string): BlockTextExtractor | undefined {
    return this.extractors.get(blockType);
  }

  has(blockType: string): boolean {
    return this.extractors.has(blockType);
  }

  listTypes(): string[] {
    return Array.from(this.extractors.keys());
  }
}

export const BLOCK_EXTRACTORS = new BlockExtractorRegistry();
