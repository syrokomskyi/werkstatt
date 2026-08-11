/*
<MODULE_CONTRACT>
<purpose>Facilitates the scaffolding of section components and system markdown compilation within the Warpgogol architecture.</purpose>
<non-goals>
  <item>Do not handle raw content parsing outside of defined schemas.</item>
  <item>Do not manage transport or configuration orchestration for sections.</item>
  <item>Do not modify existing sections or their files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0155: scaffolded section files (.astro/.css/.types.ts) now emit full Compass markers via sectionCompassMarkers().</item>
  <item>RFC-0262: scaffold no longer hand-writes a .types.ts starter — it generates .types.generated.ts from the manifest propsSchema immediately via props.types.generate.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import { fileExists as exists, collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import {
  sectionArchetypeSchema,
  systemManifestSchema,
  type SectionArchetypeContract,
} from "@warpgogol/werkstatt-site/ontology";
import {
  parseMarkdownFrontmatter,
  stringifyMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { runPropsTypesGenerate } from "./props-types.ts";

interface SectionScaffoldResult {
  slug: string;
  archetype: string;
  outputDirectory: string;
  filesWritten: string[];
}

interface SystemCompileResult {
  inputFile: string;
  outputFile: string;
  site?: string;
}

function toTitleCase(value: string): string {
  return value
    .split(/[-.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

async function loadArchetype(
  workspaceRoot: string,
  archetypeId: string,
): Promise<SectionArchetypeContract> {
  const pathParts = archetypeId.split(".");
  const filePath = join(
    workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ontology",
    "archetypes",
    "sections",
    ...pathParts.slice(0, -1),
    `${pathParts[pathParts.length - 1]}.yaml`,
  );
  const raw = await readFile(filePath, "utf8");
  return sectionArchetypeSchema.parse(parseYaml(raw));
}

async function pickCosmicName(
  workspaceRoot: string,
  archetype: SectionArchetypeContract,
): Promise<string> {
  const manifestsRoot = join(
    workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "sections",
  );
  const used = new Set<string>();
  const manifestFiles = await collectFiles(manifestsRoot, {
    extensions: [".manifest.yaml"],
    ignore: () => false,
  });
  for (const full of manifestFiles) {
    const raw = await readFile(full, "utf8");
    const parsed = parseYaml(raw) as { cosmicName?: string };
    if (typeof parsed.cosmicName === "string") used.add(parsed.cosmicName);
  }
  return (
    archetype.acceptedCosmicNames.find((name) => !used.has(name)) ??
    archetype.acceptedCosmicNames[0] ??
    "Europa"
  );
}

export async function runSectionScaffold(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SectionScaffoldResult>> {
  const slug = String(input.flags.name ?? input.flags.slug ?? "").trim();
  const archetypeId = String(input.flags.archetype ?? "").trim();
  if (!slug || !archetypeId) {
    return {
      exitCode: 1,
      summary: "section.scaffold requires --name=<slug> and --archetype=<id>",
    };
  }

  const archetype = await loadArchetype(context.workspaceRoot, archetypeId);
  const sectionDir = join(
    context.workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "sections",
    slug,
  );
  if (await exists(sectionDir)) {
    return {
      exitCode: 1,
      summary: `section already exists: ${relative(context.workspaceRoot, sectionDir)}`,
    };
  }

  const fileStem = `${slug}-section`;
  const cosmicName = String(
    input.flags.cosmicName ?? (await pickCosmicName(context.workspaceRoot, archetype)),
  );
  const role = String(input.flags.role ?? archetype.semanticRole).replace(/^component-/, "");
  const displayName = toTitleCase(slug);
  const filesWritten: string[] = [];

  // RFC-0112: per-bodyKind scaffold. Archetype declares bodyKind; the
  // scaffold selects the matching body component import + dispatcher and
  // composes the canonical shared fragments from RFC-0110.
  const bodyKind = ((archetype as unknown as { bodyKind?: string }).bodyKind ?? "composite") as
    "list" | "split-list" | "stats" | "cards" | "paragraphs" | "comparison" | "rich" | "composite";
  const sectionPascal = displayName.replace(/\s+/g, "");

  if (!context.dryRun) {
    await mkdir(sectionDir, { recursive: true });
    const astroPath = join(sectionDir, `${fileStem}.astro`);
    const cssPath = join(sectionDir, `${fileStem}.css`);
    const typesPath = join(sectionDir, `${fileStem}.types.generated.ts`);
    const storyPath = join(sectionDir, `${fileStem}.story.md`);
    const manifestPath = join(sectionDir, `${fileStem}.manifest.yaml`);

    await writeFile(astroPath, renderSectionAstro(slug, sectionPascal, bodyKind), "utf8");
    await writeFile(
      cssPath,
      `${sectionCompassMarkers(`${slug} section styles — body rendering owned by the matching SectionBody component.`)}\n`,
      "utf8",
    );
    await writeFile(
      storyPath,
      renderSectionStory(slug, displayName, archetypeId, cosmicName, bodyKind),
      "utf8",
    );
    await writeFile(
      manifestPath,
      renderSectionManifest({
        fileStem,
        slug,
        archetypeId,
        cosmicName,
        role,
        intent: archetype.expectedIntents,
        industryFit: archetype.expectedIndustryFit,
        bodyKind,
      }),
      "utf8",
    );

    // RFC-0262: the manifest propsSchema is the only authored prop contract —
    // generate this section's types.generated.ts immediately instead of
    // hand-writing a .types.ts starter.
    await runPropsTypesGenerate({ argv: [], flags: {} }, context);

    filesWritten.push(astroPath, cssPath, typesPath, storyPath, manifestPath);
  }

  return {
    exitCode: 0,
    data: {
      slug,
      archetype: archetypeId,
      outputDirectory: relative(context.workspaceRoot, sectionDir).replace(/\\/g, "/"),
      filesWritten: filesWritten.map((filePath) =>
        relative(context.workspaceRoot, filePath).replace(/\\/g, "/"),
      ),
    },
    summary: context.dryRun ? `[dry-run] would scaffold ${slug}` : `OK - scaffolded ${slug}`,
  };
}

export async function runSystemMdCompile(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SystemCompileResult>> {
  const appName = String(input.flags.site ?? context.site?.name ?? "").trim();
  const inputFile = String(
    input.flags.input ??
      join(context.workspaceRoot, "onboarding", ".output", "03-compose", "site-plan.md"),
  );
  const outputFile = String(
    input.flags.output ??
      (appName
        ? join(context.workspaceRoot, "apps", appName, "src", "content", "system.md")
        : join(context.workspaceRoot, "system.generated.md")),
  );

  const source = await readFile(inputFile, "utf8");
  const parsed = parseMarkdownFrontmatter(source);
  const candidate = (parsed.data.system ?? parsed.data) as Record<string, unknown>;
  const validated = systemManifestSchema.parse(candidate);
  const body =
    parsed.content.trim() || "# System Configuration\n\nGenerated by system-md.compile.\n";
  const nextSource = stringifyMarkdownFrontmatter(
    body,
    validated as unknown as Record<string, unknown>,
  );

  if (!context.dryRun) {
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, nextSource, "utf8");
  }

  return {
    exitCode: 0,
    data: {
      inputFile: relative(context.workspaceRoot, inputFile).replace(/\\/g, "/"),
      outputFile: relative(context.workspaceRoot, outputFile).replace(/\\/g, "/"),
      site: appName || undefined,
    },
    summary: context.dryRun ? `[dry-run] would compile ${outputFile}` : `OK - wrote ${outputFile}`,
  };
}

// ---------------------------------------------------------------------------
// RFC-0112: per-bodyKind scaffold helpers.
// ---------------------------------------------------------------------------

type BodyKind =
  "list" | "split-list" | "stats" | "cards" | "paragraphs" | "comparison" | "rich" | "composite";

const BODY_COMPONENT_BY_KIND: Record<
  Exclude<BodyKind, "composite">,
  { component: string; import: string }
> = {
  list: { component: "SectionList", import: "section-body/list.astro" },
  "split-list": { component: "SectionSplitList", import: "section-body/split-list.astro" },
  stats: { component: "SectionStats", import: "section-body/stats.astro" },
  cards: { component: "SectionCardGrid", import: "section-body/cards.astro" },
  paragraphs: { component: "SectionParagraphs", import: "section-body/paragraphs.astro" },
  comparison: { component: "SectionComparison", import: "section-body/comparison.astro" },
  rich: { component: "SectionRich", import: "section-body/rich.astro" },
};

function bodyComponentInvocation(slug: string, bodyKind: Exclude<BodyKind, "composite">): string {
  switch (bodyKind) {
    case "list":
      return `<SectionList items={body.items} note={body.note} iconColor={body.iconColor} align={body.align} />`;
    case "split-list":
      return `<SectionSplitList primaryItems={body.primaryItems} secondaryItems={body.secondaryItems} labels={body.labels} iconColors={body.iconColors} align={body.align} />`;
    case "stats":
      return `<SectionStats stats={body.stats} animated={body.animated} align={body.align} lang={lang} />`;
    case "cards":
      return `<SectionCardGrid cards={body.cards} layout={body.layout} columns={body.columns} align={body.align} lang={lang} />`;
    case "paragraphs":
      return `<SectionParagraphs paragraphs={body.paragraphs} align={body.align} />`;
    case "comparison":
      return `<SectionComparison rows={body.rows} labels={body.labels} align={body.align} />`;
    case "rich":
      return `<SectionRich contentRef={body.contentRef} animateNumbers={body.animateNumbers} align={body.align} lang={lang} />`;
  }
}

/** Full Compass marker block for a scaffolded section file so new sections pass compass.validate without manual backfill (RFC-0155). */
function sectionCompassMarkers(summary: string): string {
  return `/*
<MODULE_CONTRACT>
<purpose>${summary} Scaffolded starter — edit after generation.</purpose>
<non-goals>
  <item>Do not add app-specific logic; shared sections are composition-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Generated by section.scaffold with Compass markers (RFC-0155).</item>
</CHANGE_SUMMARY>
*/`;
}

function renderSectionAstro(slug: string, sectionPascal: string, bodyKind: BodyKind): string {
  if (bodyKind === "composite") {
    return `---
${sectionCompassMarkers(`${slug} composite section — bespoke layout in SectionShell + SectionHeader.`)}

import type { SectionProps } from "@warpgogol/werkstatt-site/share/page";
import { need, cast, resolveSectionAnchor } from "@warpgogol/werkstatt-site/share";
import SectionShell from "@warpgogol/werkstatt-site/ui/components/section-shell.astro";
import SectionHeader from "@warpgogol/werkstatt-site/ui/components/section-header.astro";
import type { ${sectionPascal}SectionContent } from "./${slug}-section.types.generated.ts";

const { lang, sectionNumber, pageOverride } = Astro.props as SectionProps;
const sectionId = await resolveSectionAnchor(Astro.props, "${slug}");
const props = cast<${sectionPascal}SectionContent>(pageOverride);
---

<SectionShell
  slug="${slug}"
  sectionId={sectionId}
  ariaLabelledBy="${slug}-title"
  background={props.background}
  effects={props.effects}
  density={props.density}
  tone={props.tone}
  lang={lang}
>
  <SectionHeader
    sectionNumber={sectionNumber}
    heading={need("header.heading", props.header?.heading)}
    subheading={props.header?.subheading}
    align={props.header?.align ?? "left"}
    level={props.header?.level ?? 2}
    hideSectionNumber={props.header?.hideSectionNumber}
    id="${slug}-title"
  />
  {/* TODO: bespoke composite layout for ${slug} — implement section-specific content here. */}
</SectionShell>
`;
  }
  const { component, import: importPath } = BODY_COMPONENT_BY_KIND[bodyKind];
  return `---
${sectionCompassMarkers(`${slug} thin dispatcher section — ${bodyKind} body.`)}

import type { SectionProps } from "@warpgogol/werkstatt-site/share/page";
import { need, cast, resolveSectionAnchor } from "@warpgogol/werkstatt-site/share";
import SectionShell from "@warpgogol/werkstatt-site/ui/components/section-shell.astro";
import SectionHeader from "@warpgogol/werkstatt-site/ui/components/section-header.astro";
import ${component} from "@warpgogol/werkstatt-site/ui/components/${importPath}";
import type { ${sectionPascal}SectionContent } from "./${slug}-section.types.generated.ts";

const { lang, sectionNumber, pageOverride } = Astro.props as SectionProps;
const sectionId = await resolveSectionAnchor(Astro.props, "${slug}");
const props = cast<${sectionPascal}SectionContent>(pageOverride);
const body = need("body", props.body);
---

<SectionShell
  slug="${slug}"
  sectionId={sectionId}
  ariaLabelledBy="${slug}-title"
  background={props.background}
  effects={props.effects}
  density={props.density}
  tone={props.tone}
  lang={lang}
>
  <SectionHeader
    sectionNumber={sectionNumber}
    heading={need("header.heading", props.header?.heading)}
    subheading={props.header?.subheading}
    align={props.header?.align ?? "left"}
    level={props.header?.level ?? 2}
    hideSectionNumber={props.header?.hideSectionNumber}
    id="${slug}-title"
  />
  ${bodyComponentInvocation(slug, bodyKind)}
</SectionShell>
`;
}

function renderSectionStory(
  slug: string,
  displayName: string,
  archetypeId: string,
  cosmicName: string,
  bodyKind: BodyKind,
): string {
  const bodyExample = (() => {
    switch (bodyKind) {
      case "list":
        return `      body:
        kind: list
        items:
          - text: "First point"
          - text: "Second point"
          - text: "Third point"`;
      case "split-list":
        return `      body:
        kind: split-list
        labels:
          primary: "Covered"
          secondary: "Not covered"
        primaryItems:
          - text: "First covered item"
          - text: "Second covered item"
        secondaryItems:
          - text: "First excluded item"`;
      case "stats":
        return `      body:
        kind: stats
        animated: true
        stats:
          - value: "10"
            label: "supported communities"
          - value: "5"
            label: "team members"`;
      case "cards":
        return `      body:
        kind: cards
        columns: 3
        cards:
          - title: "First card"
            description: "Short copy."
          - title: "Second card"
            description: "Short copy."
          - title: "Third card"
            description: "Short copy."`;
      case "paragraphs":
        return `      body:
        kind: paragraphs
        paragraphs:
          - "First paragraph of supporting copy."
          - "Second paragraph."`;
      case "comparison":
        return `      body:
        kind: comparison
        rows:
          - left: "Generic alternative"
            right: "Our approach"`;
      case "rich":
        return `      body:
        kind: rich
        contentRef: "prose/${slug}-prose"`;
      case "composite":
        return `      # composite layout — add bespoke fields here`;
    }
  })();

  return `---
title: ${displayName}
archetype: ${archetypeId}
cosmicName: ${cosmicName}
bodyKind: ${bodyKind}
---

# ${displayName}

RFC-0072 + RFC-0103 starter for archetype \`${archetypeId}\`. Drop the
following block into a page's \`blocks: [...]\` list:

\`\`\`yaml
- id: ${slug}
  type: ${archetypeId}
  props:
    header:
      heading: "${displayName}"
    background:
      kind: color
${bodyExample}
\`\`\`
`;
}

function renderSectionManifest(input: {
  fileStem: string;
  slug: string;
  archetypeId: string;
  cosmicName: string;
  role: string;
  intent: string[];
  industryFit: string[];
  bodyKind: BodyKind;
}): string {
  const composeFragments = ["section-visual", "section-header"];
  if (input.bodyKind !== "composite") composeFragments.push(`body-${input.bodyKind}`);
  const compose = composeFragments.map((id) => `  - ${id}`).join("\n");
  const intent = input.intent.map((id) => `  - ${id}`).join("\n");
  const industryFit = input.industryFit.length
    ? input.industryFit.map((id) => `  - ${id}`).join("\n")
    : "[]";
  const requiredFields =
    input.bodyKind === "composite" ? "    - header" : "    - header\n    - body";
  return `id: ${input.fileStem}
uniName: ${input.fileStem}
layer: section
semanticId: ${input.slug}
archetype: ${input.archetypeId}
cosmicName: ${input.cosmicName}
role: ${input.role}
version: "1.0.0"
intent:
${intent}
industryFit:${input.industryFit.length ? "\n" + industryFit : " " + industryFit}
contentSchemaKey: ${input.fileStem}
contentTypesPath: "./${input.fileStem}.types.generated.ts"

propsSchemaCompose:
${compose}

propsSchema:
  type: object
  additionalProperties: false
  required:
${requiredFields}
`;
}
