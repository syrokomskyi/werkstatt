/*
<MODULE_CONTRACT>
<purpose>
  RFC-0510 participant.profile.validate. Enforces the six-block human profile page
  structure for public, active human participants:
  - career prose file (prose/{lang}/{slug}-beruflich.md) exists
  - evidence prose file (prose/{lang}/{slug}-nachweise.md) exists
  - personal prose file (prose/{lang}/{slug}-persoenlich.md) exists when consent.approvedFields includes bio
  - evidence.claims items with verifiedAt have a sourceRef URL
  - responsibility.summary and authority.canSignFor/canCommitTo items are non-empty strings
  - status: former/retired participants do not have a cta field
  No-op pass when the site has no people records (same convention as team.hub.validate).
</purpose>
<non-goals>
  <item>Do not validate the Participant schema contract — that is participant.validate.</item>
  <item>Do not validate the team hub page structure — that is team.hub.validate.</item>
  <item>Do not read content via the Astro runtime — disk only, like participant.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0510: initial implementation — validates six-block profile structure, prose file presence, consent gating, and evidence fields.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import { loadSystemManifestSync } from "@gogol/site-kernel-content";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface PeopleRecord {
  lang: string;
  file: string;
  data: Record<string, unknown>;
}

async function collectPeople(appDir: string): Promise<PeopleRecord[]> {
  const peopleBaseDir = join(appDir, "src", "content", "people");
  const records: PeopleRecord[] = [];
  let langs: import("node:fs").Dirent[];
  try {
    langs = await readdir(peopleBaseDir, { withFileTypes: true });
  } catch {
    return records;
  }
  for (const langEntry of langs) {
    if (!langEntry.isDirectory()) continue;
    const lang = langEntry.name;
    const peopleDir = join(peopleBaseDir, lang);
    let files: import("node:fs").Dirent[];
    try {
      files = await readdir(peopleDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".md")) continue;
      const raw = await readFile(join(peopleDir, f.name), "utf-8");
      const data = parseMarkdownFrontmatter(raw).data as Record<string, unknown>;
      records.push({ lang, file: `${lang}/people/${f.name}`, data });
    }
  }
  return records;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function runParticipantProfileValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "participant.profile.validate";
  const paths = requireAstroSitePaths(context);
  const { manifest } = loadSystemManifestSync(paths.contentDirectory);
  const defaultLang = manifest.i18n?.default ?? "de";

  const records = await collectPeople(paths.appDirectory);

  if (records.length === 0) {
    return passResult(command, `${command}: OK — no people records (skipped)`);
  }

  const violations: string[] = [];
  const proseBaseDir = join(paths.appDirectory, "src", "content", "prose");

  for (const { lang, file, data } of records) {
    if (lang !== defaultLang) continue;

    const pType = data["participantType"];
    if (pType !== "human") continue;

    const pageNode = data["page"] as { enabled?: unknown } | undefined;
    if (!pageNode || pageNode.enabled !== true) continue;

    const visibility = data["visibility"];
    if (visibility === "private") continue;

    const slug =
      typeof data["slug"] === "string" && data["slug"]
        ? (data["slug"] as string)
        : file;

    const id = `${lang}/${slug}`;

    // Career prose file must exist
    const careerPath = join(proseBaseDir, lang, `${slug}-beruflich.md`);
    if (!(await fileExists(careerPath))) {
      violations.push(
        `[missing-career-prose] ${id}: career prose file not found at src/content/prose/${lang}/${slug}-beruflich.md`,
      );
    }

    // Evidence prose file must exist
    const evidencePath = join(proseBaseDir, lang, `${slug}-nachweise.md`);
    if (!(await fileExists(evidencePath))) {
      violations.push(
        `[missing-evidence-prose] ${id}: evidence prose file not found at src/content/prose/${lang}/${slug}-nachweise.md`,
      );
    }

    // Personal prose file must exist when consent.approvedFields includes bio
    const consent = data["consent"];
    const approvedFields = isObject(consent)
      ? (consent["approvedFields"] as unknown[])
      : undefined;
    const hasBioConsent = Array.isArray(approvedFields) && approvedFields.includes("bio");

    if (hasBioConsent) {
      const personalPath = join(proseBaseDir, lang, `${slug}-persoenlich.md`);
      if (!(await fileExists(personalPath))) {
        violations.push(
          `[missing-personal-prose] ${id}: personal prose file not found at src/content/prose/${lang}/${slug}-persoenlich.md (consent.approvedFields includes bio)`,
        );
      }
    }

    // evidence.claims items with verifiedAt must have sourceRef URL
    const evidence = data["evidence"];
    if (isObject(evidence)) {
      const claims = evidence["claims"];
      if (Array.isArray(claims)) {
        for (let i = 0; i < claims.length; i++) {
          const claim = claims[i];
          if (!isObject(claim)) continue;
          const verifiedAt = claim["verifiedAt"];
          if (typeof verifiedAt === "string" && verifiedAt) {
            const sourceRef = claim["sourceRef"];
            if (typeof sourceRef !== "string" || !isHttpUrl(sourceRef)) {
              violations.push(
                `[evidence-claim-missing-source] ${id}: evidence.claims[${i}] has verifiedAt but sourceRef is missing or not a URL`,
              );
            }
          }
        }
      }
    }

    // responsibility.summary must be non-empty string when present
    const responsibility = data["responsibility"];
    if (isObject(responsibility)) {
      const summary = responsibility["summary"];
      if (typeof summary === "string" && summary.trim() === "") {
        violations.push(
          `[responsibility-empty-summary] ${id}: responsibility.summary is an empty string`,
        );
      }
    }

    // authority.canSignFor/canCommitTo items must be non-empty strings
    const authority = data["authority"];
    if (isObject(authority)) {
      for (const field of ["canSignFor", "canCommitTo"] as const) {
        const items = authority[field];
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            if (typeof items[i] !== "string" || (items[i] as string).trim() === "") {
              violations.push(
                `[authority-empty-item] ${id}: authority.${field}[${i}] is empty or not a string`,
              );
            }
          }
        }
      }
    }

    // status: former/retired must not have cta
    const status = data["status"];
    if (status === "former" || status === "retired") {
      if (data["cta"] !== undefined) {
        violations.push(
          `[cta-for-retired] ${id}: status is '${status}' but cta field is present — former/retired participants must not have cta`,
        );
      }
    }
  }

  return resultFromViolations(command, violations);
}
