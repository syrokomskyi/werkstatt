/*
<MODULE_CONTRACT>
<purpose>
  RFC-0200 person.create. Scaffolds a canonical Person record at
  people/<lang>/<slug>.md with NEED_THIS_* placeholders so an author
  (human or AI agent) can add a person in one deterministic step. Optionally
  opts the person into a per-member profile page (--page).
</purpose>
<non-goals>
  <item>Do not resolve assets or validate — people.validate owns the contract.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0200: initial implementation (Phase 3 — agent tooling).</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { readDefaultLanguageCode } from "./lib/i18n.ts";

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function runPersonCreate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const rawSlug = String(input.flags.slug ?? "").trim();
  const name = String(input.flags.name ?? "").trim();
  const lang = String(
    input.flags.lang ?? (await readDefaultLanguageCode(join(paths.appDirectory, "src", "content"))),
  ).trim();
  const withPage = input.flags.page === true || input.flags.page === "true";

  const slug = rawSlug ? slugify(rawSlug) : name ? slugify(name) : "";
  if (!slug) {
    return { exitCode: 1, summary: "person.create requires --slug=<slug> (or --name=<name>)" };
  }

  const peopleDir = join(paths.appDirectory, "src", "content", "people", lang);
  const file = join(peopleDir, `${slug}.md`);
  if (await pathExists(file)) {
    return { exitCode: 1, summary: `person already exists: people/${lang}/${slug}.md` };
  }

  const lines = [
    "---",
    `slug: "${slug}"`,
    `name: "${name || "NEED_THIS_NAME"}"`,
    `role: "NEED_THIS_ROLE"`,
    `photo: NEED_THIS_PHOTO_TOKEN`,
    `affiliations: [team]`,
    ...(withPage ? ["page:", "  enabled: true"] : []),
    "bio: |",
    "  NEED_THIS_BIO",
    "---",
    "",
  ];

  if (!context.dryRun) {
    await mkdir(peopleDir, { recursive: true });
    await writeFile(file, lines.join("\n"), "utf8");
  }

  return {
    exitCode: 0,
    summary: `person.create: ${context.dryRun ? "[dry-run] would write" : "wrote"} people/${lang}/${slug}.md${withPage ? " (profile page enabled — requires the team.profiles entitlement)" : ""}`,
  };
}
