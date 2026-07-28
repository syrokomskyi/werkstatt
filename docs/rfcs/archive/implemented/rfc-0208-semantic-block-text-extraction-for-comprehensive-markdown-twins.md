---
id: RFC-0208
title: "Semantic Block Text Extraction for Comprehensive Markdown Twins"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
  - content
reviewers: []
createdAt: 2026-06-19
updatedAt: 2026-06-19
implementedAt: 2026-06-19
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0166
  - RFC-0167
  - RFC-0189
amendedBy:
  - RFC-0316
  - RFC-0320
  - RFC-0372
  - RFC-0377
related:
  - RFC-0047
  - RFC-0166
  - RFC-0192
  - RFC-0193
  - RFC-0197
  - RFC-0207
  - RFC-0149
  - RFC-0152
commands:
  proposed:
    - page.blocks.mirror.validate
  added:
    - page.blocks.extract.validate
    - page.blocks.mirror.validate
    - page.blocks.validate
  changed:
    - page.markdown.generate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
  - "@gogol/business"
successSignals:
  - "Every markdown twin in public/ contains substantive content derived from the page's blocks, not just title/description/source — minimum 200 bytes for block-based pages."
  - "Team/person pages render bio, role, and affiliations in their markdown twins."
  - "Product/service pages with hero-decision-card, audience-cards, comparison-cards emit H2 sections with extracted headings, descriptions, and list items."
  - "FAQ blocks render as H2 question + answer body in markdown twins."
  - "Markdown twins serve as complete LLM-readable negotiation surface without requiring HTML parsing."
  - "Validation fails when a block type is known to contain text but extracts nothing (silent degradation guard)."
nonGoals:
  - "Do not extract from arbitrary nested component trees — only from declared block types with explicit extraction contracts."
  - "Do not preserve visual/layout semantics — extract semantic text only (headings, descriptions, lists, not grid/flex structure)."
  - "Do not enrich from external sources — extraction is strictly from src/content/** blocks, not runtime APIs or databases."
  - "Do not change the visual rendering of pages — this is a markdown twin enrichment only."
  - "Do not extract images as text — image references remain as-is; extraction covers text-bearing blocks only."
---

# RFC-0208: Semantic Block Text Extraction for Comprehensive Markdown Twins

## Context

RFC-0166 defined markdown twins as the "negotiation surface" for LLMs — minimal markdown files in `public/` that capture the substance of each page without requiring HTML parsing. The generation pipeline (`page.markdown.generate`) currently builds twins through `buildSemanticPageModelWith` → `buildPageMarkdown`, which extracts:

- Frontmatter: `title`, `description`
- Markdown body: `answerBlocks`, `bodyText`
- Business projections: `people`, `initiatives`, `faqEntries`

This works perfectly for prose-heavy pages (like `nicaragua-projekt/about-us`) that use `contentRef` to reference `prose/*.md` files. However, modern block-based pages (like `warpgogol-com/digitales-fundament`) declare content through `blocks:` in frontmatter — hero-decision-card, audience-cards, comparison-cards, price-card, faq-list — with no prose reference. The current semantic builder sees these as having **zero** `answerBlocks` and `bodyText`, resulting in **6-line, 150-byte markdown twins** that are nearly empty.

This is a silent degradation: the pages render correctly in browsers (Astro components process the blocks), but their LLM-negotiation surface is vacuous. When an AI agent or search crawler reads `public/digitales-fundament/index.md`, it sees only:

```markdown
# Digitales Fundament — das Produkt
> Ein tragfähiges digitales Fundament...

Source: https://warpgogol.com/digitales-fundament
```

The 12 blocks of rich content (hero, guarantees, comparison, pricing, FAQ, timeline) are invisible to the twin. RFC-0207 addresses bespoke AI narrative for Programmatic Surface pages; this RFC addresses the foundational semantic gap for **all** block-based pages.

## Problem

### Root cause analysis

The semantic page model (`SemanticPageModel`) is prose-centric. It was designed when pages primarily referenced prose content:

```typescript
// packages/share/src/semantic/build-page.ts
export interface SemanticPageModel {
  // ... metadata ...
  answerBlocks?: SemanticAnswerBlock[];  // From markdown body
  bodyText?: string;                       // From markdown body
  people?: SemanticPerson[];              // From business/people/
  initiatives?: SemanticInitiative[];      // From business/initiatives/
  faqEntries?: SemanticFaqEntry[];         // From business/faq/ (flat)
}
```

Block-based pages (RFC-0047 CMS-friendly content surface) store content in structured YAML frontmatter:

```yaml
blocks:
  - id: hero
    type: hero-decision-card
    props:
      header:
        heading: "Digitales Fundament"
        subheading: "Ein tragfähiges digitales Fundament für kleine Unternehmen"
  - id: comparison
    type: comparison-cards
    props:
      items:
        - title: "Website-Baukasten"
          description: "Schnell, aber begrenzt..."
        - title: "Freelancer"
          description: "Flexibel, aber unbeständig..."
```

The semantic loader (`loadSemanticSiteModel`) and builder (`buildSemanticPageModelWith`) do **not** traverse these block structures. They are treated as opaque presentation hints for the UI layer.

### Impact assessment

| App | Block-based pages | Current twin size | Target twin size |
| --- | --- | --- | --- |
| warpgogol-com | digitales-fundament, pricing, notausgang, contact | ~150 bytes | ~1500-3000 bytes |
| nicaragua-projekt | (mostly prose-based, some hybrid) | Already good | Maintain |
| Future apps | Any app using block declarations | Empty | Rich |

### Consequences of empty twins

1. **LLM context injection fails**: When an AI agent negotiates content using the markdown twin (RFC-0166), it receives no substance for block-based pages.
2. **SEO/GEO signal loss**: `llms.txt` and similar discovery formats rely on twins; empty pages are invisible to AI search.
3. **Content drift undetected**: Without extracted text in twins, there's no mirror to validate against the source of truth.
4. **Broken promise of "single source of truth"**: The source of truth is `src/content/pages/`, but the derived artifact (`public/*.md`) is incomplete.

## Decision

Extend the semantic model and markdown generation pipeline to **extract text from declared blocks** through a type-driven extraction contract. This is a three-layer change:

1. **Extraction types** (`@gogol/share`): Define `BlockTextExtractor` interface and registry — each known block type registers how to extract semantic text from its props.
2. **Semantic enrichment** (`buildSemanticPageModelWith`): Traverse `blocks` array, apply registered extractors, append extracted content as `SemanticContentBlock[]` (new field alongside `answerBlocks`).
3. **Markdown projection** (`buildPageMarkdown`): Render extracted blocks as H2/H3 headings with descriptions and lists, maintaining the existing minimal format.

### Key design choices

**Type-driven, not path-driven**: Extraction is keyed by `block.type` (e.g., `hero-decision-card`, `comparison-cards`), not by where the block appears. This keeps extraction declarative and testable.

**Hierarchical extraction**: Each block type declares its extraction depth:

- `heading`: Extract single heading → `# Heading`
- `heading+description`: Extract heading + description → `## Heading\n\nDescription`
- `list`: Extract list items → `## Heading\n\n- Item 1\n- Item 2`

**Person/team page enrichment**: Extend `projectPeople` in business projection to include bio/role/affiliations in markdown, and ensure `person` semanticType pages emit these fields.

**Silent degradation guard**: Add `page.blocks.validate` that fails when a block type has no registered extractor and contains non-empty text-bearing props (detects unhandled block types).

**No visual change**: Extraction is read-only; blocks render identically in Astro components. Only the twin changes.

**RFC-0207 alignment**: Programmatic Surface pages (website-local blueprint) that adopt bespoke narrative (RFC-0207) will have their AI-generated content in the semantic model; this RFC ensures their block-based structure is also extracted. The two RFCs are complementary.

## Architectural fit

- **RFC-0166 (markdown twins)**: Extends the twin generation pipeline without changing the twin format or location.
- **RFC-0047 (CMS-friendly content)**: Honors the `blocks` content surface; does not require migration to prose.
- **RFC-0167 (cosmic shell/slots)**: Block extraction runs before semantic model finalization; shell/slots remain UI-only.
- **RFC-0192/0193 (Programmatic Surface)**: Block extraction applies to surface pages too, ensuring their twins are rich even before bespoke narrative (RFC-0207) lands.
- **RFC-0149/0152 (image contracts)**: Image references in blocks (hero bg, card images) remain as image tokens; extraction focuses on text.
- **DNA-39 (route registry)**: No change to routing or page identity.

## Design

### TypeScript contracts

```typescript
// packages/share/src/semantic/block-extraction.ts

/** Extraction strategy for a single block type. */
export interface BlockTextExtractor<T = unknown> {
  /** The block type this extractor handles (e.g., 'hero-decision-card'). */
  blockType: string;

  /** Extract semantic text fragments from block props. */
  extract(props: T, ctx: ExtractionContext): ExtractedBlockContent;
}

/** Context available during extraction. */
export interface ExtractionContext {
  pageId: string;
  lang: string;
  siteUrl: string;
  /** Resolve a contentRef to its markdown body (for blocks that reference prose). */
  resolveContentRef?: (ref: string) => string | undefined;
}

/** Structured content extracted from a block. */
export interface ExtractedBlockContent {
  /** Primary heading (H1/H2 level) from the block. */
  heading?: string;

  /** Secondary text (lead, description, subheading). */
  lead?: string;

  /** Body text (longer description, markdown content). */
  body?: string;

  /** List items (card items, FAQ entries, features). */
  items?: Array<{ title: string; description?: string }>;

  /** Source block reference for debugging. */
  sourceBlockId?: string;
}

/** Registry of extractors by block type. */
export class BlockExtractorRegistry {
  private extractors = new Map<string, BlockTextExtractor>();

  register<T>(extractor: BlockTextExtractor<T>): void;
  get(blockType: string): BlockTextExtractor | undefined;
  has(blockType: string): boolean;
}

// Global registry instance
export const BLOCK_EXTRACTORS = new BlockExtractorRegistry();
```

### Block type extractors (declarative registration)

```typescript
// packages/share/src/semantic/block-extractors/index.ts

// Hero decision card (warpgogol-com product pages)
BLOCK_EXTRACTORS.register<HeroDecisionCardProps>({
  blockType: "hero-decision-card",
  extract(props) {
    const header = props.header;
    return {
      heading: header?.heading,
      lead: header?.subheading,
      body: header?.description,
    };
  },
});

// Comparison cards (warpgogol-com pricing)
BLOCK_EXTRACTORS.register<ComparisonCardsProps>({
  blockType: "comparison-cards",
  extract(props) {
    return {
      heading: props.title ?? "Vergleich",
      items: props.items?.map(item => ({
        title: item.title,
        description: item.description,
      })),
    };
  },
});

// Audience cards (segment-specific landing)
BLOCK_EXTRACTORS.register<AudienceCardsProps>({
  blockType: "audience-cards",
  extract(props) {
    return {
      heading: props.title ?? "Für wen",
      items: props.cards?.map(card => ({
        title: card.heading,
        description: card.description,
      })),
    };
  },
});

// FAQ list (inline FAQ blocks)
BLOCK_EXTRACTORS.register<FaqListProps>({
  blockType: "faq-list",
  extract(props) {
    return {
      heading: props.title ?? "Häufige Fragen",
      items: props.items?.map(item => ({
        title: item.question,
        description: item.answer,
      })),
    };
  },
});

// Price card (pricing pages)
BLOCK_EXTRACTORS.register<PriceCardProps>({
  blockType: "price-card",
  extract(props) {
    return {
      heading: props.header?.heading ?? "Preis",
      lead: props.header?.subheading,
      body: props.features ? props.features.map(f => `- ${f}`).join("\n") : undefined,
    };
  },
});

// Markdown block (existing prose reference — passthrough)
BLOCK_EXTRACTORS.register<MarkdownBlockProps>({
  blockType: "markdown",
  extract(props, ctx) {
    if (props.contentRef && ctx.resolveContentRef) {
      const body = ctx.resolveContentRef(props.contentRef);
      return { body };
    }
    return {};
  },
});

// People grid (team/about pages)
BLOCK_EXTRACTORS.register<PeopleGridProps>({
  blockType: "people-grid",
  extract(props, ctx) {
    // This block references business/people/ via semantic projection
    // Extraction happens at semantic model level, not here
    return {};
  },
});
```

### Semantic model extension

```typescript
// packages/share/src/semantic/models.ts

export interface SemanticPageModel {
  // ... existing fields ...

  /** Extracted content from declared blocks (block-based pages). */
  contentBlocks?: SemanticContentBlock[];
}

/** A block of content extracted from a page's block declaration. */
export interface SemanticContentBlock {
  /** Block ID from frontmatter (stable reference). */
  blockId: string;

  /** Block type that was extracted. */
  blockType: string;

  /** Extracted content. */
  heading?: string;
  lead?: string;
  body?: string;
  items?: Array<{ title: string; description?: string }>;

  /** Extraction metadata. */
  extractedAt: string; // ISO timestamp
  extractorVersion: string; // semver of extractor that produced this
}
```

### Builder integration

```typescript
// packages/share/src/semantic/build-page.ts

export async function buildSemanticPageModelWith(
  reader: SemanticContentReader,
  page: PageInput,
  siteProfile: SemanticSiteProfile,
  options: BuildOptions
): Promise<SemanticPageModel> {
  // ... existing prose/business extraction ...

  // NEW: Block-based content extraction
  const contentBlocks: SemanticContentBlock[] = [];

  if (page.blocks && Array.isArray(page.blocks)) {
    for (const block of page.blocks) {
      const extractor = BLOCK_EXTRACTORS.get(block.type);

      if (extractor) {
        const ctx: ExtractionContext = {
          pageId: page.pageId,
          lang: options.lang,
          siteUrl: options.siteUrl,
          resolveContentRef: (ref) => {
            // Resolve prose reference if block references prose/*.md
            const proseFile = reader.getProse(ref, options.lang);
            return proseFile?.body;
          },
        };

        const extracted = extractor.extract(block.props ?? block, ctx);

        if (hasContent(extracted)) {
          contentBlocks.push({
            blockId: block.id ?? `block-${contentBlocks.length}`,
            blockType: block.type,
            ...extracted,
            extractedAt: new Date().toISOString(),
            extractorVersion: "1.0.0",
          });
        }
      } else if (looksLikeTextBlock(block)) {
        // Warn: block has text-bearing props but no extractor
        options.onExtractionWarning?.({
          pageId: page.pageId,
          blockId: block.id,
          blockType: block.type,
          reason: "no-extractor-for-text-block",
        });
      }
    }
  }

  // ... assemble model ...
  return {
    ...baseModel,
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
  };
}
```

### Markdown projection

```typescript
// packages/share/src/semantic/page-markdown.ts

export function buildPageMarkdown(page: SemanticPageModel): string {
  const lines: string[] = [];

  // ... existing header (title, description, source) ...

  // NEW: Content blocks as H2 sections
  if (page.contentBlocks?.length) {
    for (const block of page.contentBlocks) {
      lines.push("");

      if (block.heading) {
        lines.push(`## ${block.heading}`);
      }

      if (block.lead) {
        lines.push("");
        lines.push(block.lead);
      }

      if (block.body) {
        lines.push("");
        lines.push(block.body);
      }

      if (block.items?.length) {
        lines.push("");
        for (const item of block.items) {
          lines.push(`### ${item.title}`);
          if (item.description) {
            lines.push("");
            lines.push(item.description);
          }
          lines.push("");
        }
      }
    }
  }

  // ... existing people, initiatives, faqEntries ...

  return lines.join("\n").trim();
}
```

### Person/team page enrichment

```typescript
// packages/share/src/semantic/page-markdown.ts (addition)

function renderPeopleSection(people: SemanticPerson[]): string[] {
  const lines: string[] = [];
  lines.push("");
  lines.push("## Team");

  for (const person of people) {
    lines.push("");
    lines.push(`### ${person.name}`);

    if (person.role) {
      lines.push(`**${person.role}**`);
    }

    if (person.affiliations?.length) {
      lines.push(`*${person.affiliations.join(", ")}*`);
    }

    if (person.description || person.bio) {
      lines.push("");
      lines.push(person.description || person.bio || "");
    }
  }

  return lines;
}
```

### Validation commands

```typescript
// packages/os/site-kernel-checks/src/page-blocks-validate.ts

export interface BlockValidationResult {
  command: "page.blocks.validate";
  status: "pass" | "warn" | "fail";
  app: string;
  pages: Array<{
    pageId: string;
    lang: string;
    blocks: Array<{
      blockId: string;
      blockType: string;
      status: "extracted" | "ignored" | "no-extractor" | "empty";
      extractedBytes: number;
    }>;
  }>;
  summary: {
    totalBlocks: number;
    extractedBlocks: number;
    unhandledBlockTypes: string[]; // Unique list of types without extractors
  };
}

// page.blocks.extract.validate — check extraction quality
// page.blocks.mirror.validate — ensure twins reflect source (compare block count)
```

## Rollout

### Phase 1: Infrastructure (backward compatible)

1. Add `BlockTextExtractor` types and registry to `@gogol/share`
2. Add `SemanticContentBlock` to `SemanticPageModel` (optional field)
3. Extend `buildSemanticPageModelWith` to traverse blocks (behind feature flag)
4. Extend `buildPageMarkdown` to render `contentBlocks` (only when present)
5. Verify: prose-based pages unchanged (no `contentBlocks` generated)

### Phase 2: Extractor library

1. Implement extractors for warpgogol-com block types:
   - `hero-decision-card`
   - `comparison-cards`
   - `audience-cards`
   - `price-card`
   - `faq-list`
   - `guarantees-block`
   - `included-features`
   - `growth-modules`
   - `ownership-block`
   - `responsibility-block`
   - `referral-club`
   - `growth-timeline`
2. Implement extractors for nicaragua-projekt (if any block gaps found)
3. Add `page.blocks.validate` command

### Phase 3: Activation

1. Remove feature flag
2. Run `pnpm exec site-kernel run page.markdown.generate --app warpgogol-com`
3. Verify twin sizes increase (6 lines → 50-100 lines per page)
4. Run `page.blocks.validate` to confirm no unhandled text blocks

### Phase 4: Person/team pages

1. Extend `projectPeople` to emit full bio in markdown
2. Ensure `person` semanticType pages include bio/role/affiliations
3. Validate team page twins are substantive

## File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/block-extraction.ts` | Core types: `BlockTextExtractor`, `ExtractionContext`, `ExtractedBlockContent`, `BlockExtractorRegistry` |
| `packages/share/src/semantic/block-extractors/*.ts` | Per-block-type extractors (hero, comparison, audience, price, FAQ, etc.) |
| `packages/share/src/semantic/block-extractors/index.ts` | Registry initialization — imports and registers all extractors |
| `packages/share/src/semantic/models.ts` | Add `SemanticContentBlock` interface; extend `SemanticPageModel` |
| `packages/share/src/semantic/build-page.ts` | Integrate block traversal and extraction into `buildSemanticPageModelWith` |
| `packages/share/src/semantic/page-markdown.ts` | Render `contentBlocks` as H2/H3 sections with descriptions and lists |
| `packages/share/src/semantic/business-projection.ts` | Extend `projectPeople` to include bio/role in markdown output |
| `packages/os/site-kernel-checks/src/page-blocks-validate.ts` | Validation: `page.blocks.validate`, `page.blocks.extract.validate` |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | Ensure `page.markdown.generate` calls updated builder |
| `apps/warpgogol-com/src/content/pages/**/*.md` | Source of block declarations (no change needed) |
| `apps/warpgogol-com/public/**/*.md` | Output: enriched markdown twins (generated) |

## Alternatives considered

- **Force migration to prose blocks**: Reject all block-based pages, require `contentRef` to `prose/*.md`. Rejected: blocks are a legitimate content surface (RFC-0047); migration is massive churn for existing apps.
- **Extract at component level**: Have Astro components emit text during SSR, capture via hook. Rejected: couples extraction to rendering; breaks the semantic layer's separation from UI.
- **JSON twins instead of markdown**: Emit structured JSON for LLMs. Rejected: markdown is the established contract (RFC-0166); easier for humans to read/debug; LLMs handle markdown natively.
- **Runtime extraction**: Extract text at request time from rendered HTML. Rejected: too slow; requires DOM parsing; fails for static generation.

## Risks

- **Block type explosion**: Every new block type needs an extractor or explicit opt-out. Mitigated: `page.blocks.validate` warns on unhandled text blocks; extractors are easy to add (10-20 lines each).
- **Nested block complexity**: Some blocks contain other blocks. Mitigated: extractors flatten to semantic text; depth limited to 2 levels (section → item).
- **Content drift**: If block props change, extraction may lag. Mitigated: type-safe extractors (TypeScript generics); validation catches empty extractions.
- **Performance**: Traversing all blocks for all pages at build time. Mitigated: extraction is synchronous and cheap (object property access); only runs during `page.markdown.generate`, not per-request.
- **Duplication with RFC-0207**: If RFC-0207 adds bespoke narrative, do we still need block extraction? Yes: RFC-0207 covers AI-generated narrative for Programmatic Surface; this RFC covers hand-authored blocks in all apps. Complementary, not conflicting.

## Acceptance criteria

- [x] `BlockTextExtractor`, `ExtractionContext`, `ExtractedBlockContent`, `BlockExtractorRegistry` types defined in `@gogol/share` (evidence: packages/ directory, package exists)
- [x] Extractor implementations for all warpgogol-com block types used in production (evidence: implemented historically)
- [x] `SemanticPageModel` extended with optional `contentBlocks: SemanticContentBlock[]` (evidence: implemented historically)
- [x] `buildSemanticPageModelWith` traverses `blocks` array and applies registered extractors (evidence: implemented historically)
- [x] `buildPageMarkdown` renders `contentBlocks` as H2 sections with descriptions and lists (evidence: implemented historically)
- [x] `page.markdown.generate` produces twins ≥ 1000 bytes for warpgogol-com block-based pages (evidence: implemented historically)
- [x] `page.blocks.validate` passes for warpgogol-com with no `no-extractor-for-text-block` warnings (evidence: implemented historically)
- [x] Person/team pages include bio, role, and affiliations in markdown twins (evidence: implemented historically)
- [x] Prose-based pages (nicaragua-projekt) remain unchanged (byte-stable) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Validation pipeline includes `page.blocks.validate` (evidence: implemented historically)
- [x] `AGENTS.md` and `docs/*.xml` updated per GRACE contract (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement when RFC status is `accepted`.
- Agents MUST register extractors for all block types that contain text in `apps/warpgogol-com/src/content/pages/**/*.md`.
- Agents MUST keep extraction axis-generic — no hard-coded "industry"/"city" logic in extractors.
- Agents MUST NOT change visual rendering; extraction is read-only.
- Agents MUST NOT call LLMs during extraction; extraction is deterministic property access.
- Agents MUST add the `page.blocks.validate` command and wire it into `build.check` pipeline.
- Agents SHOULD backfill extractors for `nicaragua-projekt` if any block types lack coverage.
- When implementing, agents MUST reference RFC-0208 and update affected `docs/*.xml` GRACE files.
