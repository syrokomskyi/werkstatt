/*
<MODULE_CONTRACT>
<purpose>
Implements legal.scaffold — generates Impressum and Datenschutz page+prose
stubs for DE/AT/CH locales declared in system.md i18n.supported, plus
merges nav targets (group: legal, group: contact) and footer.legalIds /
footer.contactIds into the per-locale labels.md (RFC-0096).
</purpose>
<non-goals>
  <item>Do not produce legally-binding text — stubs are starting points.</item>
  <item>Do not support non-DE/EU regimes in v1.</item>
  <item>Do not edit system.md pages list — operators add page entries.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0096: Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path, { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { hasGeneratedMarker, buildGeneratedHeader } from "./generated-marker.ts";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";

const DE_LOCALES = new Set(["de", "de-DE", "de-AT", "de-CH"]);
// __dirname is dist/ at runtime; templates ship in src/ alongside (matches
// the convention used by app-boilerplate.ts).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, "templates", "legal", "de");

interface RenderValues {
  COSMIC_STAR: string;
  APP_DISPLAY_NAME: string;
  RESPONSIBLE_NAME: string;
  ADDRESS: string;
  LEGAL_EMAIL: string;
  DOMAIN: string;
}

function renderTemplate(template: string, values: RenderValues): string {
  let out = template;
  for (const [k, v] of Object.entries(values)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeGenerated(
  filePath: string,
  body: string,
  force: boolean,
): Promise<"written" | "skipped" | "unchanged"> {
  // Wrap body with GENERATED_HEADER inside frontmatter so generated page entries
  // remain frontmatter-only for page.block.validate B-06.
  const markerLine = buildGeneratedHeader({
    ownerCommand: "legal.scaffold",
    filePath,
  }).trimEnd();
  const withMarker = body.replace(/^---\n/, `---\n${markerLine}\n`);

  if (await exists(filePath)) {
    const existing = await readFile(filePath, "utf-8");
    if (existing === withMarker) return "unchanged";
    if (!hasGeneratedMarker(existing) && !force) {
      throw new Error(
        `${filePath} exists and lacks GENERATED_MARKER; refusing to overwrite (use --force).`,
      );
    }
  }
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, withMarker, "utf-8");
  return "written";
}

interface NavTarget {
  id: string;
  label: string;
  semanticTarget: { kind: "internal"; pageId: string } | { kind: "external"; href: string };
  routeSlug?: string;
  group: string;
}

async function mergeNavTargets(
  navPath: string,
  toAdd: NavTarget[],
): Promise<"written" | "unchanged"> {
  let doc: { targets?: NavTarget[] } = { targets: [] };
  let body = "";
  if (await exists(navPath)) {
    body = await readFile(navPath, "utf-8");
    const fm = body.match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      try {
        doc = (YAML.parse(fm[1]!) ?? {}) as typeof doc;
      } catch {
        // empty
      }
    }
  }
  const existing = new Set((doc.targets ?? []).map((t) => t.id));
  let changed = false;
  for (const t of toAdd) {
    if (!existing.has(t.id)) {
      doc.targets = [...(doc.targets ?? []), t];
      changed = true;
    }
  }
  if (!changed) return "unchanged";

  const yaml = YAML.stringify(doc).trimEnd();
  const newBody = `---\n${yaml}\n---\n`;
  await mkdir(dirname(navPath), { recursive: true });
  await writeFile(navPath, newBody, "utf-8");
  return "written";
}

async function mergeLabels(
  labelsPath: string,
  legalIds: string[],
  contactIds: string[],
): Promise<"written" | "unchanged"> {
  if (!(await exists(labelsPath))) {
    // Don't create labels.md from scratch — that's onboarding scaffold's job.
    return "unchanged";
  }
  const body = await readFile(labelsPath, "utf-8");
  const fm = body.match(/^---\n([\s\S]*?)\n---([\s\S]*)$/);
  if (!fm) return "unchanged";

  let doc: Record<string, unknown> = {};
  try {
    doc = (YAML.parse(fm[1]!) ?? {}) as Record<string, unknown>;
  } catch {
    return "unchanged";
  }
  const footer = (doc.footer ?? {}) as Record<string, unknown>;
  const currentLegal = new Set(((footer.legalIds as string[]) ?? []).filter(Boolean));
  const currentContact = new Set(((footer.contactIds as string[]) ?? []).filter(Boolean));

  let changed = false;
  for (const id of legalIds) {
    if (!currentLegal.has(id)) {
      currentLegal.add(id);
      changed = true;
    }
  }
  for (const id of contactIds) {
    if (!currentContact.has(id)) {
      currentContact.add(id);
      changed = true;
    }
  }
  if (!changed) return "unchanged";

  footer.legalIds = [...currentLegal];
  footer.contactIds = [...currentContact];
  doc.footer = footer;

  const yaml = YAML.stringify(doc).trimEnd();
  const newBody = `---\n${yaml}\n---${fm[2]}`;
  await writeFile(labelsPath, newBody, "utf-8");
  return "written";
}

export async function runLegalScaffold(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const force = input.flags.force === true;

  const manifestResult = await loadSystemManifest(paths.contentDirectory);
  if (!manifestResult) {
    return {
      exitCode: 1,
      data: {
        diagnostics: [`[ERROR] system.md not found; run onboarding.scaffold first.`],
      },
    };
  }
  const manifest = manifestResult.manifest;

  const supportedLocales = Object.keys(manifest.i18n?.supported ?? {});
  const targetLocales = supportedLocales.filter((l) => DE_LOCALES.has(l));
  if (targetLocales.length === 0) {
    return {
      exitCode: 0,
      data: {
        diagnostics: [
          `legal.scaffold: no DE/AT/CH locale in i18n.supported (${supportedLocales.join(", ") || "<none>"}); nothing to scaffold.`,
        ],
      },
    };
  }

  const legal = manifest.identity.legal ?? {};
  const values: RenderValues = {
    COSMIC_STAR: manifest.identity.systemStar,
    APP_DISPLAY_NAME: manifest.identity.tagline || manifest.app,
    RESPONSIBLE_NAME: legal.responsibleName ?? "NEED_THIS_RESPONSIBLENAME",
    ADDRESS: legal.address ?? "NEED_THIS_ADDRESS",
    LEGAL_EMAIL: legal.email ?? "NEED_THIS_LEGAL_EMAIL",
    DOMAIN: manifest.identity.domain ?? manifest.app,
  };

  const writeReport: Array<{ status: string; path: string }> = [];

  for (const lang of targetLocales) {
    // Render and write the 4 files.
    const files: Array<{ tpl: string; out: string }> = [
      {
        tpl: join(TEMPLATE_DIR, "impressum.page.template.md"),
        out: join(paths.contentDirectory, "pages", lang, "impressum.md"),
      },
      {
        tpl: join(TEMPLATE_DIR, "datenschutz.page.template.md"),
        out: join(paths.contentDirectory, "pages", lang, "datenschutz.md"),
      },
      {
        tpl: join(TEMPLATE_DIR, "impressum.prose.template.md"),
        out: join(paths.contentDirectory, "prose", lang, "impressum.md"),
      },
      {
        tpl: join(TEMPLATE_DIR, "datenschutz.prose.template.md"),
        out: join(paths.contentDirectory, "prose", lang, "datenschutz.md"),
      },
    ];
    for (const f of files) {
      const tplBody = await readFile(f.tpl, "utf-8");
      const rendered = renderTemplate(tplBody, values);
      const status = await writeGenerated(f.out, rendered, force);
      writeReport.push({
        status,
        path: relative(paths.appDirectory, f.out).replace(/\\/g, "/"),
      });
    }

    // Merge nav targets.
    const navPath = join(paths.contentDirectory, "navigation", lang, "navigation.md");
    const navStatus = await mergeNavTargets(navPath, [
      {
        id: "impressum",
        label: "Impressum",
        semanticTarget: { kind: "internal", pageId: "impressum" },
        routeSlug: "impressum",
        group: "legal",
      },
      {
        id: "datenschutz",
        label: "Datenschutz",
        semanticTarget: { kind: "internal", pageId: "datenschutz" },
        routeSlug: "datenschutz",
        group: "legal",
      },
      {
        id: "emailContact",
        label: values.LEGAL_EMAIL,
        semanticTarget: { kind: "external", href: `mailto:${values.LEGAL_EMAIL}` },
        group: "contact",
      },
    ]);
    writeReport.push({
      status: navStatus,
      path: relative(paths.appDirectory, navPath).replace(/\\/g, "/"),
    });

    // Merge labels.
    const labelsPath = join(paths.contentDirectory, "site", lang, "labels.md");
    const labelsStatus = await mergeLabels(
      labelsPath,
      ["impressum", "datenschutz"],
      ["emailContact"],
    );
    writeReport.push({
      status: labelsStatus,
      path: relative(paths.appDirectory, labelsPath).replace(/\\/g, "/"),
    });
  }

  const written = writeReport.filter((r) => r.status === "written").length;
  const lines = writeReport.map((r) => `       - ${r.path.padEnd(70)} (${r.status})`);
  return {
    exitCode: 0,
    data: {
      diagnostics: [
        written === 0
          ? `legal.scaffold: 0 file(s) written (idempotent) for ${targetLocales.length} locale(s).`
          : `legal.scaffold: ${written} file(s) written for ${targetLocales.length} locale(s):`,
        ...(written > 0 ? lines : []),
        `Reminder: Impressum/Datenschutz stubs are minimum-compliance only; review with counsel before production launch.`,
      ],
    },
  };
}
