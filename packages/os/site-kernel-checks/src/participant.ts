/*
<MODULE_CONTRACT>
<purpose>
  RFC-0508 participant.validate. Enforces the canonical Participant record contract
  over people/<lang>/*.md. Validates participantType, type-specific required fields,
  consent for public humans, accountableHumanId for AI agents, visibility rules for
  service-accounts, and consent.approvedFields vocabulary.
  No-op pass when a site has no Participant records.
</purpose>
<non-goals>
  <item>Do not resolve the photo asset to a hashed URL — that is the render layer's job.</item>
  <item>Do not read content via the Astro runtime — disk only, like the predecessor people.validate.</item>
  <item>Do not define the schema — that lives in @gogol/share/schemas/participant.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0508: initial implementation — replaces people.validate with participant.validate.</item>
</CHANGE_SUMMARY>
*/

import { parse as yamlParse } from "yaml";
import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { parseMarkdownFrontmatter } from "@gogol/site-kernel-content";
import {
  PARTICIPANT_TYPES,
  PARTICIPANT_STATUSES,
  PARTICIPANT_RELATIONSHIPS,
  CONSENT_APPROVED_FIELDS,
} from "@gogol/share/schemas";
import { passResult, resultFromViolations } from "./result-helpers.ts";

const VALID_TYPES = new Set<string>(PARTICIPANT_TYPES);
const VALID_STATUSES = new Set<string>(PARTICIPANT_STATUSES);
const VALID_RELATIONSHIPS = new Set<string>(PARTICIPANT_RELATIONSHIPS);
const VALID_CONSENT_FIELDS = new Set<string>(CONSENT_APPROVED_FIELDS);

interface ParticipantRecord {
  lang: string;
  file: string;
  data: Record<string, unknown>;
}

async function collectParticipants(appDir: string): Promise<ParticipantRecord[]> {
  const peopleBaseDir = join(appDir, "src", "content", "people");
  const records: ParticipantRecord[] = [];
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

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function isProfilesEntitled(appDir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf-8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) && parsed.features.includes("team.profiles");
  } catch {
    return true;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runParticipantValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const records = await collectParticipants(paths.appDirectory);

  if (records.length === 0) {
    return passResult(
      "participant.validate",
      "participant.validate: OK — no Participant records",
    );
  }

  const violations: string[] = [];
  const profilesEntitled = await isProfilesEntitled(paths.appDirectory);

  for (const { file, data } of records) {
    const id = typeof data["slug"] === "string" && data["slug"] ? data["slug"] : file;

    const pageNode = data["page"] as { enabled?: unknown } | undefined;
    if (!profilesEntitled && pageNode?.enabled === true) {
      console.warn(
        `[participant.validate] ${file}: page.enabled but app lacks the "team.profiles" entitlement — no profile route will compile.`,
      );
    }

    if (typeof data["name"] !== "string" || (data["name"] as string).trim() === "") {
      violations.push(`[missing-name] ${file}: Participant record has no name`);
    }
    if (typeof data["slug"] !== "string" || (data["slug"] as string).trim() === "") {
      violations.push(`[missing-slug] ${file}: Participant record has no slug`);
    }

    const pType = data["participantType"];
    if (typeof pType !== "string" || !VALID_TYPES.has(pType)) {
      violations.push(
        `[missing-or-invalid-participantType] ${id}: participantType must be one of ${[...VALID_TYPES].join(", ")}`,
      );
      continue;
    }

    const status = data["status"];
    if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
      violations.push(
        `[invalid-status] ${id}: status must be one of ${[...VALID_STATUSES].join(", ")}`,
      );
    }

    const relType = data["relationshipType"];
    if (typeof relType !== "string" || !VALID_RELATIONSHIPS.has(relType)) {
      violations.push(
        `[invalid-relationshipType] ${id}: relationshipType must be one of ${[...VALID_RELATIONSHIPS].join(", ")}`,
      );
    }

    const visibility = data["visibility"];
    if (visibility !== undefined && visibility !== "public" && visibility !== "private") {
      violations.push(`[invalid-visibility] ${id}: visibility must be "public" or "private"`);
    }

    if (pType === "service-account" && visibility === "public") {
      violations.push(
        `[service-account-public] ${id}: service-account participants must be visibility: private`,
      );
    }

    if (pType === "ai-agent") {
      const aiAgent = data["aiAgent"];
      if (!isObject(aiAgent)) {
        violations.push(`[missing-aiAgent] ${id}: ai-agent participants require aiAgent fields`);
      } else {
        const accountable = aiAgent["accountableHumanId"];
        if (typeof accountable !== "string" || accountable.trim() === "") {
          violations.push(
            `[missing-accountableHumanId] ${id}: ai-agent participants require accountableHumanId`,
          );
        }
      }
    }

    if (pType === "organization-unit") {
      const orgUnit = data["organizationUnit"];
      if (!isObject(orgUnit) || typeof orgUnit["unitName"] !== "string") {
        violations.push(
          `[missing-organizationUnit] ${id}: organization-unit participants require organizationUnit.unitName`,
        );
      }
    }

    if (pType === "external-specialist") {
      const extSpec = data["externalSpecialist"];
      if (!isObject(extSpec) || typeof extSpec["specialty"] !== "string") {
        violations.push(
          `[missing-externalSpecialist] ${id}: external-specialist participants require externalSpecialist.specialty`,
        );
      }
    }

    if (pType === "partner-organization") {
      const partnerOrg = data["partnerOrganization"];
      if (!isObject(partnerOrg) || typeof partnerOrg["organizationName"] !== "string") {
        violations.push(
          `[missing-partnerOrganization] ${id}: partner-organization participants require partnerOrganization.organizationName`,
        );
      }
    }

    if (pType === "service-account") {
      const svcAcct = data["serviceAccount"];
      if (!isObject(svcAcct) || typeof svcAcct["serviceName"] !== "string") {
        violations.push(
          `[missing-serviceAccount] ${id}: service-account participants require serviceAccount.serviceName`,
        );
      }
    }

    const isPublic = visibility === "public";
    const isActive = status === "active";

    if (pType === "human" && isPublic) {
      const consent = data["consent"];
      if (!isObject(consent)) {
        violations.push(
          `[missing-consent] ${id}: public human participants require a consent record`,
        );
      } else {
        if (
          typeof consent["consentRecordId"] !== "string" ||
          consent["consentRecordId"].trim() === ""
        ) {
          violations.push(`[missing-consentRecordId] ${id}: consent.consentRecordId required`);
        }
        if (
          typeof consent["consentDate"] !== "string" ||
          consent["consentDate"].trim() === ""
        ) {
          violations.push(`[missing-consentDate] ${id}: consent.consentDate required`);
        }
        if (
          typeof consent["profileReviewer"] !== "string" ||
          consent["profileReviewer"].trim() === ""
        ) {
          violations.push(`[missing-profileReviewer] ${id}: consent.profileReviewer required`);
        }
        const approvedFields = consent["approvedFields"];
        if (Array.isArray(approvedFields)) {
          for (const af of approvedFields) {
            if (typeof af !== "string" || !VALID_CONSENT_FIELDS.has(af)) {
              violations.push(
                `[invalid-approvedField] ${id}: "${String(af)}" is not a valid consent.approvedFields path`,
              );
            }
          }
        }
      }
    }

    const photo = data["photo"];
    if (typeof photo === "string" && (photo.startsWith("/src/") || photo.includes("/content/"))) {
      violations.push(
        `[photo-raw-path] ${id}: photo "${photo}" must be an asset token, not a /src path`,
      );
    }

    const sameAs = data["sameAs"];
    if (sameAs !== undefined) {
      if (!Array.isArray(sameAs)) {
        violations.push(`[invalid-sameAs] ${id}: sameAs must be a list of URLs`);
      } else {
        for (const s of sameAs) {
          if (typeof s !== "string" || !isHttpUrl(s)) {
            violations.push(`[invalid-sameAs] ${id}: "${String(s)}" is not an absolute URL`);
          }
        }
      }
    }

    const page = data["page"] as { enabled?: unknown } | undefined;
    const pageEnabled = !!page && page.enabled === true;
    const hasBio = typeof data["bio"] === "string" && (data["bio"] as string).trim() !== "";
    if (pageEnabled && !hasBio) {
      violations.push(`[missing-bio] ${id}: page.enabled requires a bio`);
    }

    if ((status === "former" || status === "retired") && isObject(data["cta"])) {
      violations.push(
        `[cta-on-inactive] ${id}: ${status} participants must not have an active CTA`,
      );
    }

    if (isActive && pageEnabled && !profilesEntitled) {
      // already warned above; no additional violation
    }
  }

  if (violations.length === 0) {
    return passResult(
      "participant.validate",
      `participant.validate: OK — ${records.length} Participant record(s) conform`,
    );
  }
  return resultFromViolations("participant.validate", violations);
}
